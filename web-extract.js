// web-extract.js — Extracción determinística de datos del negocio desde su
// sitio web (v212, orden de Valentino 2026-10-18: "en el website deberíamos
// agregar para que peguen su link de su website").
// CERO IA: todo se lee del HTML (JSON-LD, metas Open Graph, encabezados,
// imágenes). Si el sitio no responde, bloquea o no tiene nada útil, devuelve
// null y la prueba sigue con lo que haya — la extracción nunca la frena.
//
// Lo que devuelve fetchBusinessSite(url):
//   { ok, url, name, description, services[], city, palette[hex...],
//     photos[{url, alt}], categoryHint }
'use strict';
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const EXTRACT_COLORS_SCRIPT = path.join(__dirname, 'extract_colors.py');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const HTML_TIMEOUT_MS = 7000;
const HTML_MAX_BYTES = 2.5 * 1024 * 1024;
const IMG_TIMEOUT_MS = 5000;
const IMG_MAX_BYTES = 6 * 1024 * 1024;
const MAX_REDIRECTS = 4;

// ---------- SSRF: normalización + validación del host ----------
function normalizeSiteUrl(raw) {
  let v = String(raw || '').trim().replace(/[\u0000-\u001F]/g, '').slice(0, 300);
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) {
    if (v.startsWith('//')) v = 'https:' + v;
    else v = 'https://' + v;
  }
  let u;
  try { u = new URL(v); } catch (e) { return null; }
  if (!['http:', 'https:'].includes(u.protocol)) return null;
  const host = u.hostname.toLowerCase();
  if (!host || !host.includes('.')) return null; // nada de intranet/hosts sin TLD
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return null;
  if (isPrivateIpLiteral(host)) return null;
  return u.toString();
}
function isPrivateIpLiteral(host) {
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host)) {
    const n = host.split('.').map(Number);
    if (n.some((x) => x > 255)) return true;
    if (n[0] === 10) return true;
    if (n[0] === 172 && n[1] >= 16 && n[1] <= 31) return true;
    if (n[0] === 192 && n[1] === 168) return true;
    if (n[0] === 127) return true;
    if (n[0] === 169 && n[1] === 254) return true;
    if (n[0] === 0) return true;
    return false;
  }
  if (host.includes(':')) { // IPv6
    const h = host.toLowerCase();
    if (h === '::1') return true;
    if (/^fc|^fd/.test(h)) return true;
    if (/^fe[89ab]/.test(h)) return true;
    return false;
  }
  return false;
}
async function hostResolvesPrivate(hostname) {
  // Anti DNS-rebinding básico: si TODAS las IPs resueltas son privadas, no vamos.
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    if (!addrs.length) return true;
    return addrs.every((a) => isPrivateIpLiteral(a.address));
  } catch (e) { return true; } // sin DNS: no viajamos
}

// ---------- Fetch con redirects manuales (cada salto se valida) ----------
function fetchBuf(url, { timeoutMs, maxBytes, ua, hostCheck } = {}) {
  return new Promise((resolve, reject) => {
    let hops = 0;
    const go = async (target) => {
      if (++hops > MAX_REDIRECTS) return reject(new Error('demasiados redirects'));
      let u;
      try { u = new URL(target); } catch (e) { return reject(e); }
      if (!['http:', 'https:'].includes(u.protocol)) return reject(new Error('protocolo no permitido'));
      if (isPrivateIpLiteral(u.hostname) || u.hostname.toLowerCase() === 'localhost') return reject(new Error('host bloqueado'));
      if (hostCheck && await hostResolvesPrivate(u.hostname)) return reject(new Error('host no resoluble o privado'));
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.get({
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        headers: {
          'User-Agent': ua || UA,
          'Accept-Language': 'es-AR,es;q=0.9,en;q=0.5',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8',
        },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          try { return go(new URL(res.headers.location, target).toString()); } catch (e) { return reject(e); }
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error('http ' + res.statusCode)); }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > (maxBytes || HTML_MAX_BYTES)) { req.destroy(new Error('demasiado grande')); return; }
          chunks.push(c);
        });
        res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks), url: target }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs || HTML_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    };
    go(url);
  });
}
async function fetchHtml(url) {
  const page = await fetchBuf(url, { timeoutMs: HTML_TIMEOUT_MS, maxBytes: HTML_MAX_BYTES, hostCheck: true });
  const ct = String(page.headers['content-type'] || '');
  if (!/text\/html|application\/xhtml/i.test(ct)) throw new Error('no es html');
  return { html: page.body.toString('utf8').slice(0, 1_500_000), url: page.url };
}

// ---------- Helpers de parseo ----------
const NAMED_ENTITIES = {
  nbsp: ' ', quot: '"', apos: "'", "#39": "'", lt: '<', gt: '>', amp: '&',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü',
  iexcl: '¡', iquest: '¿', hellip: '…', mdash: '—', ndash: '–',
  laquo: '«', raquo: '»', copy: '©', reg: '®', trade: '™',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•', middot: '·',
};
function decodeEntities(s) {
  return String(s || '')
    .replace(/&([a-zA-Z#][a-zA-Z0-9#]*);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return ''; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return ''; } });
}
function cleanText(s) {
  return decodeEntities(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function meta(html, name) {
  // <meta name|property="..." content="..."> (cualquiera de los dos órdenes)
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let m = html.match(new RegExp('<meta[^>]+(?:name|property)\\s*=\\s*["\']' + esc + '["\'][^>]*content\\s*=\\s*["\']([^"\']{1,400})["\']', 'i'));
  if (m) return cleanText(m[1]);
  m = html.match(new RegExp('<meta[^>]+content\\s*=\\s*["\']([^"\']{1,400})["\'][^>]*?(?:name|property)\\s*=\\s*["\']' + esc + '["\']', 'i'));
  return m ? cleanText(m[1]) : '';
}
function norm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Vocabulario de temas: EL MISMO que PHOTO_TAGS en demo.js (así el gate
// foto↔tema aplica igual que con el stock — regla de la orden).
const TEMA_KEYWORDS = [
  [/peluquer|pelo|cabello|\bhair\b|corte de pelo/, 'pelo'],
  [/barber|barba|\bfade\b/, 'barberia'],
  [/maquillaje|\bmake\s?-?\s?up\b/, 'makeup'],
  [/u[nñ]a|nails|manicur|pedicur/, 'unas'],
  [/skincare|\bfacial\b|serum|crema/, 'skincare'],
  [/cosmet|perfume|colonia/, 'cosmetica'],
  [/rostro|\bcara\b|retrato|portrait/, 'rostro'],
  [/mujer|hombre|modelo\b/, 'retrato'],
  [/equipo|\bteam\b|nosotros|\bstaff\b/, 'personas'],
  [/local|salon de|tienda|\bstore\b|\bshop\b|sucursal|fachada/, 'local'],
  [/producto|\bpack\b|envase/, 'producto'],
  [/comida|plato|hamburguesa|burger|pizza|sushi|empanada|parrilla|helado/, 'comida'],
  [/\bcaf[eé]\b|coffee|latte|capuchino|espresso|medialuna|desayuno|merienda|brunch|pasteler|panader/, 'cafe'],
  [/cerveza|birra|trago|cocktail|vino|\bbar\b/, 'bar'],
  [/moda|ropa|fashion|vestido|outfit|\blook\b|indumentaria/, 'moda'],
  [/zapato|zapatilla|calzado|shoe|sneaker/, 'calzado'],
  [/flor|ramo|bouquet/, 'flores'],
  [/hogar|living|sof[aá]|mueble|decor/, 'hogar'],
  [/cocina/, 'cocina'],
  [/oficina|office|escritorio/, 'oficina'],
  [/laptop|notebook|computadora|pc\b/, 'laptop'],
  [/\bgym\b|gimnasio|fitness|entrena|yoga|pilates|crossfit/, 'fitness'],
  [/perro|gato|mascota|\bdog\b|\bcat\b|\bpet\b/, 'mascotas'],
  [/dental|diente|odontolog/, 'dental'],
  [/salud|cl[ií]nica|m[eé]dico|consultorio|nutrici/, 'salud'],
  [/\btech\b|celular|iphone|smartphone|gadget/, 'tech'],
  [/auto|coche|veh[ií]culo|\bcar\b/, 'autos'],
  [/viaje|turismo|vacacion|\bhotel\b/, 'viaje'],
  [/playa|beach/, 'playa'],
  [/noche|fiesta|evento|casamiento|boda/, 'noche'],
];
function temasFromText(text) {
  const t = norm(text);
  if (!t) return [];
  const out = [];
  for (const [re, tema] of TEMA_KEYWORDS) {
    if (re.test(t) && !out.includes(tema)) out.push(tema);
  }
  return out;
}

// ---------- Extracción principal ----------
async function fetchBusinessSite(rawUrl) {
  const url = normalizeSiteUrl(rawUrl);
  if (!url) return null;
  const t0 = Date.now();
  let page;
  try { page = await fetchHtml(url); } catch (e) { return null; }
  const html = page.html;
  const finalUrl = page.url;

  // 1) JSON-LD (LocalBusiness y variantes)
  let ld = null;
  for (const m of html.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]{1,20000})<\/script>/gi)) {
    try {
      let j = JSON.parse(m[1]);
      const arr = Array.isArray(j) ? j : (j['@graph'] || [j]);
      for (const it of arr) {
        const t = String((it && it['@type']) || '');
        // (v235) la aceptación suma los @type que el clasificador de
        // rubro sabe mapear (rubro-id.js JSONLD_MAP): uñas, mascotas,
        // autos, flores, fitness, inmobiliaria/construcción, etc.
        if (/localbusiness|store|restaurant|café|cafe|beautysalon|hairsalon|nailsalon|dayspa|barbershop|hotels|dentist|medicalbusiness|professionalservice|foodestablishment|petstore|veterinarycare|autorepair|autoparts|autodealer|florist|healthclub|exercisegym|sportsclub|realestate|generalcontractor|bakery|cafeorcoffeeshop|fastfood|barorpub|brewery|clothingstore|jewelrystore|furniturestore|homegoodsstore|electronicsstore|tattooparlor|travelagency|school|college|pharmacy|optician|winery|liquorstore|grocerystore|supermarket|bookstore|hardwarestore/i.test(t) || (it && it.name && it.address)) {
          ld = it; break;
        }
      }
      if (ld) break;
    } catch (e) { /* JSON-LD roto: se sigue */ }
  }
  const ldText = (x) => cleanText(typeof x === 'string' ? x : (x && x.name) || '').slice(0, 300);

  // 2) Nombre: JSON-LD > og:site_name > title (cortado en separadores)
  let name = ld ? ldText(ld.name) : '';
  if (!name) name = meta(html, 'og:site_name');
  if (!name) {
    const t = meta(html, 'og:title') || (html.match(/<title[^>]*>([^<]{1,120})<\/title>/i) ? cleanText(html.match(/<title[^>]*>([^<]{1,120})<\/title>/i)[1]) : '');
    name = t.split(/\s[|–—:—·]\s/)[0].trim().slice(0, 60);
  }
  // 3) Descripción: JSON-LD > meta description/og
  let description = ld ? ldText(ld.description) : '';
  if (!description) description = meta(html, 'description') || meta(html, 'og:description');
  description = description.slice(0, 400);

  // 4) Servicios: JSON-LD (hasOfferCatalog/makesOffer) + encabezados
  const services = [];
  const pushService = (s) => {
    const v = cleanText(s).slice(0, 60);
    if (v.length >= 3 && v.length <= 60 && v.split(' ').length <= 8 && !services.some((x) => x.toLowerCase() === v.toLowerCase())) {
      services.push(v);
    }
  };
  if (ld) {
    try {
      const cat = ld.hasOfferCatalog || ld.makesOffer || ld.offers;
      const items = [];
      const walk = (o) => {
        if (!o) return;
        if (Array.isArray(o)) return o.forEach(walk);
        if (o.itemOffered) walk(o.itemOffered);
        if (o.itemListElement) walk(o.itemListElement);
        if (o.name) items.push(o.name);
      };
      walk(cat);
      items.slice(0, 10).forEach(pushService);
    } catch (e) { /* se sigue con encabezados */ }
  }
  const JUNK_H = /^(men[uú]|inicio|home|contacto|nosotros|bienvenidos?|servicios?|productos?|galer[ií]a|testimonios|blog|noticias|preguntas frecuentes|faq|novedades|destacados|lo nuevo|qu[eé] hay de nuevo|ofertas?)$/i;
  for (const m of html.matchAll(/<h[123][^>]*>([\s\S]{1,140})<\/h[123]>/gi)) {
    if (services.length >= 8) break;
    const v = cleanText(m[1]);
    if (JUNK_H.test(v.replace(/^[¿¡]+/, '').trim()) || /^[¿¡]/.test(v)) continue;
    pushService(v);
  }

  // 5) Ciudad: JSON-LD address > <address>
  let city = '';
  if (ld && ld.address) {
    const a = ld.address;
    city = cleanText(typeof a === 'string' ? a.split(',')[0] : (a.addressLocality || a.addressRegion || '')).slice(0, 80);
  }
  if (!city) {
    const m = html.match(/<address[^>]*>([\s\S]{1,200})<\/address>/i);
    if (m) city = cleanText(m[1]).split(/[,.]/)[0].slice(0, 80);
  }

  // 6) Paleta: theme-color, si no og:image → colores reales
  const palette = [];
  const tc = meta(html, 'theme-color');
  if (/^#[0-9a-fA-F]{6}$/.test(tc)) palette.push(tc.toUpperCase());

  // 7) Fotos: og:image + twitter + JSON-LD + body (hasta 6 útiles)
  const photos = [];
  const seen = new Set();
  const pushPhoto = (src, alt) => {
    if (photos.length >= 6 || !src) return;
    let abs;
    try { abs = new URL(src, finalUrl).toString(); } catch (e) { return; }
    if (!/^https?:/i.test(abs) || seen.has(abs)) return;
    if (/\.svg(\?|$)/i.test(abs) || /\.ico(\?|$)/i.test(abs) || /\.gif(\?|$)/i.test(abs)) return;
    if (/logo|favicon|sprite|avatar|pixel|blank|spacer|loading|placeholder/i.test(abs)) return;
    seen.add(abs);
    photos.push({ url: abs, alt: cleanText(alt).slice(0, 140) });
  };
  pushPhoto(meta(html, 'og:image'), meta(html, 'og:image:alt'));
  pushPhoto(meta(html, 'twitter:image'), '');
  if (ld && ld.image) {
    const ims = Array.isArray(ld.image) ? ld.image : [ld.image];
    for (const im of ims) pushPhoto(typeof im === 'string' ? im : (im && im.url), '');
  }
  const bodyNoScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  for (const m of bodyNoScripts.matchAll(/<img\b[^>]{1,1200}>/gi)) {
    if (photos.length >= 6) break;
    const tag = m[0];
    const srcM = tag.match(/(?:src|data-src|data-lazy-src)\s*=\s*["']([^"']{4,500})["']/i);
    if (!srcM) continue;
    if (/^data:/i.test(srcM[1])) continue;
    const wM = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const hM = tag.match(/\bheight\s*=\s*["']?(\d+)/i);
    // Imágenes chiquitas declaradas (íconos, avatares) no sirven
    if (wM && hM && (+wM[1] < 220 || +hM[1] < 220)) continue;
    const altM = tag.match(/\balt\s*=\s*["']([^"']{0,200})["']/i);
    // Tema por contexto: el encabezado más cercano ANTES de la imagen
    const before = bodyNoScripts.slice(Math.max(0, m.index - 1200), m.index);
    const hBefore = before.match(/<h[123][^>]*>([\s\S]{1,120})<\/h[123]>[^<h]*$/i);
    const ctxText = (altM ? altM[1] + ' ' : '') + srcM[1].split('/').pop() + (hBefore ? ' ' + cleanText(hBefore[1]) : '');
    pushPhoto(srcM[1], ctxText);
  }

  // Paleta de la foto principal (si no hubo theme-color): colores reales.
  // Presupuesto de tiempo: si el HTML ya comió >6s, la paleta se salta (la
  // prueba no espera — el server además corre todo esto con carrera).
  if (!palette.length && photos.length && Date.now() - t0 < 6000) {
    try {
      const img = await fetchBuf(photos[0].url, { timeoutMs: 4000, maxBytes: IMG_MAX_BYTES, hostCheck: true });
      const cols = await colorsFromBuffer(img.body).catch(() => []);
      for (const c of cols) { if (!palette.includes(c)) palette.push(c); }
    } catch (e) { /* sin paleta: se sigue con la del rubro */ }
  }

  const result = {
    ok: true,
    url: finalUrl,
    name: name.slice(0, 60),
    description,
    services: services.slice(0, 8),
    city,
    palette: palette.slice(0, 2),
    photos,
    // (v235) categoryHint: el @type declarado en el JSON-LD del propio
    // sitio — la cabecera de este módulo lo prometía desde v209 y el
    // result nunca lo devolvía. Lo consume rubro-id.js (familia jsonld,
    // la señal más declarativa: el negocio se auto-clasificó).
    categoryHint: ld ? (Array.isArray(ld['@type']) ? ld['@type'].join(' ') : String(ld['@type'] || '')) : '',
  };
  // Temas por foto: gate-compatible (sin temas → el gate la deja afuera,
  // igual que al stock sin tags — regla v196). Señales: alt/contexto +
  // nombre de archivo (las rutas de uploads suelen nombrar el contenido).
  for (const p of result.photos) {
    p.temas = temasFromText((p.alt || '') + ' ' + String(p.url).split('/').pop());
  }
  return result;
}

function colorsFromBuffer(buf) {
  return new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buf) || !buf.length) return reject(new Error('Imagen vacía'));
    const tmp = path.join(require('os').tmpdir(), `posta-web-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`);
    try { fs.writeFileSync(tmp, buf); } catch (e) { return reject(e); }
    execFile('python3', [EXTRACT_COLORS_SCRIPT, tmp], { timeout: 10000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err) return reject(err);
      const cols = String(stdout || '').trim().split(/\s+/).filter((c) => /^#[0-9A-F]{6}$/.test(c)).slice(0, 2);
      if (!cols.length) return reject(new Error('Sin colores'));
      resolve(cols);
    });
  });
}

function imageKindFromBuf(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// Descarga las fotos del sitio a `dir` (reusa por hash de URL: una web que
// se prueba dos veces no se baja de nuevo). Devuelve [{path, temas, url}].
// Las tmp vivían en os.tmpdir; acá van a un dir persistente (MEDIA_DIR) para
// que el rediseño del spec siga encontrándolas — mismo patrón que las fotos
// del feed localizadas por feedAudit.
async function localizeSitePhotos(photos, dir, max) {
  const list = (photos || []).slice(0, max || 6);
  if (!list.length) return [];
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const jobs = list.map(async (p) => {
    try {
      const h = crypto.createHash('sha1').update(String(p.url)).digest('hex').slice(0, 16);
      let found = null;
      for (const ext of ['jpg', 'png', 'webp']) {
        const fp = path.join(dir, `web-${h}.${ext}`);
        try { if (fs.statSync(fp).isFile() && fs.statSync(fp).size > 2048) { found = fp; break; } } catch (e) {}
      }
      if (!found) {
        const img = await fetchBuf(p.url, { timeoutMs: IMG_TIMEOUT_MS, maxBytes: IMG_MAX_BYTES, ua: UA, hostCheck: true });
        const kind = imageKindFromBuf(img.body);
        if (!kind || img.body.length < 2048) return null;
        found = path.join(dir, `web-${h}.${kind}`);
        fs.writeFileSync(found, img.body);
      }
      return { path: found, temas: Array.isArray(p.temas) ? p.temas : [], url: p.url };
    } catch (e) { return null; }
  });
  const out = (await Promise.all(jobs)).filter(Boolean);
  return out;
}

module.exports = {
  normalizeSiteUrl,
  fetchBusinessSite,
  localizeSitePhotos,
  temasFromText,
  isPrivateIpLiteral,
};
