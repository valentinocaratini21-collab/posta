'use strict';
/* =====================================================================
 * deep-read.js — LECTURA PROFUNDA (v230, 2026-10-18)
 * Aprobado por Valentino: "que Posty lea aún mejor el website o el
 * Instagram del cliente". Este módulo hace la LECTURA (IO) de las
 * fuentes profundas que alimentan los bloques extendidos del
 * client_digest (la compilación pura vive en client-digest.js):
 *
 *  · fetchDeepCatalog(url): sigue las páginas de productos/tienda/
 *    menú del PROPIO sitio + los PDFs enlazados (menús, cartas,
 *    catálogos — el formato real de los negocios locales) y devuelve
 *    los ítems estructurados {nombre, precio?, fuente}.
 *  · fetchBioLink(url): sigue el link de la bio de Instagram
 *    (linktree y equivalentes, tienda, reservas) y devuelve destinos
 *    reales + ítems legibles de la tienda/reserva.
 *  · classifyDigestPhotos(...): clasifica fotos del cliente por
 *    producto/servicio del digest con UNA llamada de visión barata
 *    (gpt-4o-mini, la maquinaria de demo-ai). Topes duros: máx N
 *    fotos por corrida; el llamador pasa por costs.assertAiOk antes
 *    y el resultado se cachea por clave de foto en el propio digest
 *    (photo_map) — una foto clasificada no se vuelve a pagar.
 *
 * Todo best-effort: si una fuente no responde, bloquea o no tiene nada
 * legible, devuelve null/{} y la lectura sigue con lo que haya — la
 * lectura profunda NUNCA frena una prueba ni una generación.
 * SSRF: mismo criterio que web-extract (hosts privados bloqueados,
 * chequeo DNS anti-rebinding, topes de bytes y redirects).
 * ===================================================================== */
const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFile } = require('child_process');

const webExtract = require('./web-extract');
const { extractCleanText } = require('./website-study');
const clientDigest = require('./client-digest');

let costs = null;
try { costs = require('./costs'); } catch (_) { costs = null; }

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const PAGE_TIMEOUT_MS = 8000;
const PAGE_MAX_BYTES = 2.5 * 1024 * 1024;
const PDF_MAX_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_CATALOG_PAGES = 5;   // además de la home
const MAX_PDFS = 2;
const MAX_ITEMS = 48;
const VISION_MODEL = 'gpt-4o-mini';
const VISION_MAX_PHOTOS = 6;

// ---------- fetch con guardas (espejo de web-extract.fetchBuf) ----------
async function hostResolvesPrivate(hostname) {
  try {
    const addrs = await dns.lookup(hostname, { all: true });
    if (!addrs.length) return true;
    return addrs.every((a) => webExtract.isPrivateIpLiteral(a.address));
  } catch (e) { return true; }
}
function fetchBufSafe(url, { timeoutMs, maxBytes } = {}) {
  return new Promise((resolve, reject) => {
    let hops = 0;
    const go = async (target) => {
      if (++hops > MAX_REDIRECTS) return reject(new Error('demasiados redirects'));
      let u;
      try { u = new URL(target); } catch (e) { return reject(e); }
      if (!['http:', 'https:'].includes(u.protocol)) return reject(new Error('protocolo no permitido'));
      if (webExtract.isPrivateIpLiteral(u.hostname) || u.hostname.toLowerCase() === 'localhost') return reject(new Error('host bloqueado'));
      if (await hostResolvesPrivate(u.hostname)) return reject(new Error('host no resoluble o privado'));
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.get({
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-AR,es;q=0.9', 'Accept': 'text/html,application/pdf,*/*;q=0.8' },
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
          if (size > (maxBytes || PAGE_MAX_BYTES)) { req.destroy(new Error('demasiado grande')); return; }
          chunks.push(c);
        });
        res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks), url: target }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs || PAGE_TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    };
    go(url);
  });
}
async function fetchPage(url, io) {
  if (io && typeof io.fetchBuf === 'function') {
    const r = await io.fetchBuf(url);
    if (!r) return null;
    return { body: Buffer.isBuffer(r.body) ? r.body : Buffer.from(String(r.body || '')), contentType: String(r.contentType || ''), url: r.finalUrl || r.url || url };
  }
  const r = await fetchBufSafe(url, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: PAGE_MAX_BYTES });
  return { body: r.body, contentType: String((r.headers && r.headers['content-type']) || ''), url: r.url };
}

// ---------- extracción de ítems ----------
const PRICE_RE = /\$\s?\d[\d.,]*/;
function cleanPrice(raw) {
  const m = String(raw || '').match(PRICE_RE);
  if (!m) return '';
  return m[0].replace(/\s+/, ' ').replace(/[.,]+$/, '');
}
const JUNK_NAME_RE = /^(men[uú]|inicio|home|contacto|nosotros|bienvenidos?|servicios|productos|galer[ií]a|testimonios|blog|noticias|preguntas frecuentes|faq|novedades|carrito|checkout|mi cuenta|buscar|ver todo|ver m[aá]s|comprar|agregar al carrito|a[ñn]adir|env[ií]os?|devoluciones|t[eé]rminos|privacidad|seguinos|redes|whatsapp|instagram|facebook|precio|precios|total|desde|hasta|cuotas?|c\/u|unidad|oferta|promoci[oó]n|stock|disponible)$/i;

function cleanItemName(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .replace(/^[\s•·\-–—*#>]+/, '')
    .replace(/[\s•·]+$/, '')
    .replace(/\.+$/, '')
    .replace(/:$/, '')
    .trim();
}
function validItemName(name) {
  if (!name || name.length < 3 || name.length > 90) return false;
  if (name.split(' ').length > 9) return false;
  if (!/[a-záéíóúñ]{2,}/i.test(name)) return false; // necesita letras reales
  if (JUNK_NAME_RE.test(name.replace(/^[¿¡]+/, '').trim())) return false;
  if (/^[\d\s.,$%]+$/.test(name)) return false;
  if (/https?:\/\//i.test(name)) return false;
  return true;
}
function pushItem(out, seen, nombre, precio, fuente) {
  const name = cleanItemName(nombre);
  if (!validItemName(name)) return;
  const k = clientDigest.norm(name);
  if (seen.has(k)) {
    // Duplicado: si el nuevo trae precio y el guardado no, se completa.
    if (precio) {
      const prev = out.find((x) => clientDigest.norm(x.nombre) === k);
      if (prev && !prev.precio) prev.precio = String(precio).slice(0, 24);
    }
    return;
  }
  seen.add(k);
  const it = { nombre: name.slice(0, 90), fuente };
  const pr = precio ? cleanPrice(precio) : '';
  if (pr) it.precio = pr;
  out.push(it);
}

/* Ítems desde el HTML de una página: JSON-LD (Product/Offer), encabe-
 * zados con precio cercano y líneas de texto con precio en línea. */
function itemsFromHtml(html, fuente) {
  const out = []; const seen = new Set();
  const s = String(html || '');
  // 1) JSON-LD: productos con precio (la tienda bien hecha los declara).
  for (const m of s.matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]{1,60000})<\/script>/gi)) {
    try {
      let j = JSON.parse(m[1]);
      const arr = Array.isArray(j) ? j : (j['@graph'] || [j]);
      const walk = (o, depth) => {
        if (!o || depth > 4) return;
        if (Array.isArray(o)) return o.forEach((x) => walk(x, depth + 1));
        const t = String(o['@type'] || '');
        if (/product/i.test(t) && o.name) {
          let price = '';
          const off = Array.isArray(o.offers) ? o.offers[0] : o.offers;
          if (off && (off.price || off.lowPrice)) price = '$' + String(off.price || off.lowPrice);
          pushItem(out, seen, o.name, price, fuente);
        }
        if (o.itemListElement) walk(o.itemListElement, depth + 1);
        if (o.itemOffered) walk(o.itemOffered, depth + 1);
        if (o.hasOfferCatalog) walk(o.hasOfferCatalog, depth + 1);
      };
      walk(arr, 0);
    } catch (e) { /* JSON-LD roto: se sigue con el resto */ }
  }
  // 2) Encabezados h2-h4 con un precio en los ~500 caracteres siguientes.
  const noScripts = s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const heads = [];
  for (const m of noScripts.matchAll(/<h[234][^>]*>([\s\S]{1,160}?)<\/h[234]>/gi)) {
    heads.push({ name: cleanItemName(m[1]), idx: m.index });
  }
  const plain = extractCleanText(noScripts);
  for (const h of heads) {
    if (!validItemName(h.name)) continue;
    // Precio "cerca" en el HTML crudo siguiente (antes del próximo heading).
    const after = noScripts.slice(h.idx, h.idx + 900);
    const pm = after.replace(/<[^>]*>/g, ' ').match(PRICE_RE);
    pushItem(out, seen, h.name, pm ? pm[0] : '', fuente);
  }
  // 3) Líneas de texto limpio con precio en la misma línea.
  for (const line of plain.split('\n')) itemsFromLine(line, out, seen, fuente);
  return out;
}
function itemsFromLine(line, out, seen, fuente) {
  const l = String(line || '').replace(/\s+/g, ' ').trim();
  if (!l) return;
  const pm = l.match(PRICE_RE);
  if (!pm) return;
  const name = cleanItemName(l.replace(pm[0], ' ').replace(/[.·•\-–—]{2,}/g, ' '));
  if (validItemName(name)) pushItem(out, seen, name, pm[0], fuente);
}
/* Ítems desde texto plano (PDF): líneas con precio; línea que es SOLO
 * un precio se pega al ítem anterior sin precio. Si el documento trae
 * ≥2 ítems con precio (pinta de menú/carta), también se aceptan nom-
 * bres cortos sin precio (las secciones de una carta no siempre
 * precian cada renglón). */
function itemsFromText(text, fuente) {
  const out = []; const seen = new Set();
  const lines = String(text || '').split(/\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const l of lines) {
    const pm = l.match(PRICE_RE);
    if (pm && cleanItemName(l.replace(pm[0], '')).length < 3) {
      // Línea de solo precio: completa el último ítem sin precio.
      const prev = [...out].reverse().find((x) => !x.precio);
      if (prev) prev.precio = cleanPrice(pm[0]);
      continue;
    }
    itemsFromLine(l, out, seen, fuente);
  }
  if (out.filter((x) => x.precio).length >= 2) {
    for (const l of lines) {
      if (out.length >= MAX_ITEMS) break;
      if (PRICE_RE.test(l)) continue;
      const name = cleanItemName(l.replace(/[.·•]{2,}/g, ' '));
      if (validItemName(name) && name.split(' ').length >= 2) pushItem(out, seen, name, '', fuente);
    }
  }
  return out.slice(0, MAX_ITEMS);
}

// ---------- PDF → texto ----------
/* Vía principal: pdftotext (poppler) si el binario existe. Respaldo:
 * extractor mínimo en Node (streams FlateDecode + operadores Tj/TJ) —
 * alcanza para los menús/catálogos reales, que son texto simple. */
function pdfTextFallback(buf) {
  const parts = [];
  const s = buf.toString('latin1');
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(s))) {
    let data = Buffer.from(m[1], 'latin1');
    try { data = zlib.inflateSync(data); } catch (e) {
      try { data = zlib.inflateSync(data.subarray(0, data.length)); } catch (_) { continue; }
    }
    const t = data.toString('latin1');
    for (const tm of t.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj|\[(?:[^\[\]]|\([^)]*\))*\]\s*TJ/g)) {
      const seg = tm[0];
      for (const sm of seg.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
        const raw = sm[0].slice(1, -1)
          .replace(/\\([nrt()\\])/g, (_, c) => ({ n: '\n', r: ' ', t: ' ', '(': '(', ')': ')', '\\': '\\' }[c] || c))
          .replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
        parts.push(raw);
      }
      parts.push('\n');
    }
    // Saltos de línea de los operadores de posicionamiento (Td/TD/T*).
    if (/\bTd\b|\bTD\b|T\*/.test(t)) parts.push('\n');
  }
  return parts.join(' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n');
}
function pdfTextFromBuffer(buf, execImpl) {
  const run = execImpl || execFile;
  return new Promise((resolve) => {
    if (!Buffer.isBuffer(buf) || !buf.length) return resolve('');
    const tag = crypto.randomBytes(4).toString('hex');
    const inF = path.join(os.tmpdir(), `posta-pdf-${Date.now()}-${tag}.pdf`);
    const outF = inF + '.txt';
    try { fs.writeFileSync(inF, buf); } catch (e) { return resolve(pdfTextFallback(buf)); }
    run('pdftotext', ['-layout', '-enc', 'UTF-8', inF, outF], { timeout: 20000 }, (err) => {
      let text = '';
      if (!err) { try { text = fs.readFileSync(outF, 'utf8'); } catch (e) {} }
      try { fs.unlinkSync(inF); } catch (_) {}
      try { fs.unlinkSync(outF); } catch (_) {}
      if (text && text.trim().length >= 20) return resolve(text);
      resolve(pdfTextFallback(buf));
    });
  });
}

// ---------- Catálogo profundo ----------
const CATALOG_LINK_RE = /producto|tienda|shop|store|catalogo|cat[aá]logo|menu|men[uú]|carta|coleccion|colecci[oó]n|servicios|precios|comprar|platos|bebidas/i;
function discoverInternalLinks(html, baseUrl, { wantPdf } = {}) {
  const base = new URL(baseUrl);
  const out = [];
  const seen = new Set([base.href]);
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a\s*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = String(m[1] || '').trim();
    const text = String(m[2] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, base); } catch (e) { continue; }
    if (abs.hostname !== base.hostname) continue;
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = '';
    const key = abs.href;
    if (seen.has(key)) continue;
    const isPdf = /\.pdf($|\?)/i.test(abs.pathname);
    if (wantPdf ? !isPdf : isPdf) continue;
    if (!isPdf && !CATALOG_LINK_RE.test(abs.pathname) && !CATALOG_LINK_RE.test(text)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

async function fetchDeepCatalog(rawUrl, io = {}) {
  const start = webExtract.normalizeSiteUrl(rawUrl);
  if (!start) return null;
  const pdfText = io.pdfText || ((buf) => pdfTextFromBuffer(buf, io.execFile));
  const items = []; const seen = new Set();
  const addItems = (list) => { for (const it of (list || [])) pushItem(items, seen, it.nombre, it.precio, it.fuente); };
  let pages = 0; let pdfs = 0;
  let home;
  try { home = await fetchPage(start, io); } catch (e) { return null; }
  if (!home) return null;
  if (/pdf/i.test(home.contentType)) {
    try { const t = await pdfText(home.body); addItems(itemsFromText(t, 'pdf')); pdfs = 1; } catch (e) {}
    return items.length ? { items: items.slice(0, MAX_ITEMS), pages: 0, pdfs, at: new Date().toISOString() } : null;
  }
  const homeHtml = home.body.toString('utf8').slice(0, 1_500_000);
  addItems(itemsFromHtml(homeHtml, 'web-catalog'));
  pages = 1;
  const pageLinks = discoverInternalLinks(homeHtml, home.url, { wantPdf: false }).slice(0, MAX_CATALOG_PAGES);
  const pdfLinks = discoverInternalLinks(homeHtml, home.url, { wantPdf: true }).slice(0, MAX_PDFS);
  for (const link of pageLinks) {
    if (items.length >= MAX_ITEMS) break;
    try {
      const pg = await fetchPage(link, io);
      if (!pg || /pdf/i.test(pg.contentType)) continue;
      const html = pg.body.toString('utf8').slice(0, 1_500_000);
      addItems(itemsFromHtml(html, 'web-catalog'));
      pages++;
      // Los PDFs también se enlazan desde las páginas de catálogo.
      for (const pl of discoverInternalLinks(html, pg.url, { wantPdf: true })) {
        if (pdfLinks.length < MAX_PDFS && !pdfLinks.includes(pl)) pdfLinks.push(pl);
      }
    } catch (e) { /* página caída: se sigue */ }
  }
  for (const link of pdfLinks.slice(0, MAX_PDFS)) {
    try {
      const pg = await fetchPage(link, io);
      if (!pg) continue;
      const t = await pdfText(pg.body);
      if (!t || t.trim().length < 20) continue;
      addItems(itemsFromText(t, 'pdf'));
      pdfs++;
    } catch (e) { /* PDF ilegible: se sigue */ }
  }
  if (!items.length) return null;
  return { items: items.slice(0, MAX_ITEMS), pages, pdfs, at: new Date().toISOString() };
}

// ---------- Link de la bio ----------
const LINKTREE_HOST_RE = /linktr\.ee|beacons\.ai|msha\.ke|campsite\.bio|taplink\.cc|lnk\.bio|bio\.link|linkin\.bio|hoo\.be|direct\.me|milkshake\.app/i;
const SOCIAL_HOST_RE = /(facebook|instagram|twitter|x|tiktok|youtube|youtu)\.com|wa\.me|api\.whatsapp\.com/i;
const SHOP_LINK_RE = /tienda|shop|store|comprar|carrito|cart|checkout|producto/i;
const BOOKING_LINK_RE = /reserva|turno|agenda|booking|calendly|acuity|simplybook|booksy|fresha/i;

async function fetchBioLink(rawUrl, io = {}) {
  const start = webExtract.normalizeSiteUrl(rawUrl);
  if (!start) return null;
  let page;
  try { page = await fetchPage(start, io); } catch (e) { return null; }
  if (!page || /pdf/i.test(page.contentType)) return null;
  const html = page.body.toString('utf8').slice(0, 1_500_000);
  const pageUrl = page.url || start;
  const host = (() => { try { return new URL(pageUrl).hostname; } catch (e) { return ''; } })();
  // Destinos reales: todo link saliente absoluto (los botones del linktree).
  const destinations = [];
  const dseen = new Set();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["']/gi)) {
    const href = String(m[1] || '').trim();
    if (!/^https?:\/\//i.test(href)) continue;
    let abs;
    try { abs = new URL(href); } catch (e) { continue; }
    if (abs.hostname === host) continue;
    if (/facebook\.com\/(sharer|share)|twitter\.com\/intent|pinterest\.com\/pin/i.test(href)) continue;
    const key = abs.href;
    if (dseen.has(key)) continue;
    dseen.add(key);
    destinations.push(key);
    if (destinations.length >= 12) break;
  }
  const plainText = extractCleanText(html);
  let kind = 'site';
  if (LINKTREE_HOST_RE.test(host)) kind = 'linktree';
  else if (BOOKING_LINK_RE.test(pageUrl) || BOOKING_LINK_RE.test(plainText.slice(0, 600))) kind = 'booking';
  else if (SHOP_LINK_RE.test(pageUrl) || /carrito|tienda online|comprar ahora/i.test(plainText.slice(0, 1200))) kind = 'shop';
  const items = []; const seen = new Set();
  const addItems = (list, fuente) => { for (const it of (list || [])) pushItem(items, seen, it.nombre, it.precio, fuente); };
  addItems(itemsFromHtml(html, 'bio-link'), 'bio-link');
  // Un salto: el destino tienda/reserva más claro (del linktree o de la
  // propia página) trae los ítems que la bio promete.
  if (!items.length || kind === 'linktree') {
    const next = destinations.find((d) => SHOP_LINK_RE.test(d) || BOOKING_LINK_RE.test(d))
      || destinations.find((d) => !SOCIAL_HOST_RE.test(d));
    if (next && next !== pageUrl) {
      try {
        const pg = await fetchPage(next, io);
        if (pg && !/pdf/i.test(pg.contentType)) {
          addItems(itemsFromHtml(pg.body.toString('utf8').slice(0, 1_500_000), 'bio-link'), 'bio-link');
          if (kind === 'linktree' && BOOKING_LINK_RE.test(next)) { /* el destino es de reservas: queda en destinations */ }
        }
      } catch (e) { /* destino caído: se sigue con lo leído */ }
    }
  }
  if (!destinations.length && !items.length && kind === 'site') return null;
  return { url: start, kind, destinations, items: items.slice(0, 24), at: new Date().toISOString() };
}

// ---------- Mapa foto→producto (visión) ----------
/* Clasifica hasta `max` fotos contra la lista de ítems del digest en
 * UNA llamada de visión. photos: [{key, path}]. Devuelve
 * { [key]: { item, confianza } } solo para fotos con match seguro
 * (confianza ≥ 0,5 y el ítem EXACTO de la lista). Cualquier falla → {}
 * (el mapa se completa en la próxima cadencia; nunca frena nada). */
async function classifyDigestPhotos({ photos, items, apiKey, userId, fetchImpl, max } = {}) {
  if (!apiKey) return {};
  const names = (items || []).map((x) => String((x && (x.nombre || x)) || '').trim()).filter((n) => n.length >= 3).slice(0, 24);
  if (!names.length) return {};
  const cap = Math.min(Math.max(parseInt(max, 10) || VISION_MAX_PHOTOS, 1), VISION_MAX_PHOTOS);
  const usable = [];
  for (const p of (photos || [])) {
    if (!p || !p.key || !p.path || usable.length >= cap) continue;
    try {
      const st = fs.statSync(p.path);
      if (!st.isFile() || st.size < 1024 || st.size > 4 * 1024 * 1024) continue;
    } catch (e) { continue; }
    usable.push(p);
  }
  if (!usable.length) return {};
  const doFetch = fetchImpl || fetch;
  const sentPhotos = [];
  const imageParts = [];
  for (const p of usable) {
    const ext = path.extname(p.path).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    try {
      imageParts.push({ type: 'image_url', image_url: { url: `data:${mime};base64,` + fs.readFileSync(p.path).toString('base64') } });
      sentPhotos.push(p);
    } catch (e) { /* foto ilegible: se salta y el índice no se corre */ }
  }
  const sent = sentPhotos.length;
  if (!sent) return {};
  const content = [
    { type: 'text', text: `Te muestro ${sent} fotos de un negocio, en orden (foto 0 a ${sent - 1}). La lista de productos/servicios del negocio es:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}\nPara CADA foto decidí qué producto/servicio de la lista se ve (el NOMBRE EXACTO de la lista) o "" si no se ve ninguno con seguridad. Respondé SOLO este JSON: {"results":[{"i":0,"item":"nombre exacto o vacío","confianza":0.0}]}` },
    ...imageParts,
  ];
  let data;
  try {
    const r = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: VISION_MODEL, temperature: 0.1, max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!r || !r.ok) return {};
    data = await r.json().catch(() => null);
  } catch (e) { return {}; }
  if (!fetchImpl && costs && costs.trackUsage) {
    try { costs.trackUsage({ feature: 'digest-photo-map', userId, model: VISION_MODEL, json: data }); } catch (e) {}
  }
  let parsed = null;
  try { parsed = JSON.parse((data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''); } catch (e) {}
  if (!parsed || !Array.isArray(parsed.results)) return {};
  const out = {};
  for (const res of parsed.results) {
    const idx = parseInt(res && res.i, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= sent) continue;
    const itemName = String((res && res.item) || '').trim();
    const conf = Number(res && res.confianza);
    if (!itemName || !Number.isFinite(conf) || conf < 0.5) continue;
    // El ítem tiene que ser UNO de la lista (match exacto o mismo ítem
    // con otra capitalización/tamaño): nada de productos inventados.
    const match = names.find((n) => clientDigest.norm(n) === clientDigest.norm(itemName))
      || names.find((n) => clientDigest.sameItemName(n, itemName));
    if (!match) continue;
    const photo = sentPhotos[idx];
    if (photo) out[photo.key] = { item: match, confianza: Math.round(Math.min(1, conf) * 100) / 100 };
  }
  return out;
}

/* Clave durable de una foto local: hash de su CONTENIDO (la misma foto
 * con otro nombre sigue siendo la misma foto; la caché del mapa es por
 * contenido, no por ruta). */
function photoContentKey(absPath) {
  try {
    const buf = fs.readFileSync(absPath);
    if (!buf.length) return null;
    return 'file:' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  } catch (e) { return null; }
}

module.exports = {
  fetchDeepCatalog,
  fetchBioLink,
  classifyDigestPhotos,
  photoContentKey,
  // piezas internas, exportadas para tests y reuso
  itemsFromHtml,
  itemsFromText,
  pdfTextFromBuffer,
  pdfTextFallback,
  discoverInternalLinks,
  VISION_MAX_PHOTOS,
};
