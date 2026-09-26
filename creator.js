// Creador v2 — Posta
// El usuario escribe su idea y el sistema devuelve 6 opciones completas
// (diseño + foto real + colores pedidos + caption con energía) con 1 recomendada.
// Renderiza con demo_render.py (el motor premium de /prueba), nunca hotlinkea
// fotos en producción: todo se descarga a MEDIA_DIR.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { generateCaptions, HASHTAGS } = require('./generator');

const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'media');
const DEMO_SCRIPT = path.join(__dirname, 'demo_render.py');
const FONTS_DIR = path.join(__dirname, 'assets', 'fonts');
const DEMO_STOCK = path.join(__dirname, 'public', 'demo-stock');

// ================= 1. DETECCIÓN DE COLORES (español) =================
// Nombres sin tildes: el texto se normaliza antes de comparar.
const COLOR_MAP = [
  { names: ['bordo', 'borgona'], hex: '#7A1E2B' },
  { names: ['rojo', 'roja', 'colorado', 'colorada'], hex: '#D62828' },
  { names: ['coral'], hex: '#FF7F5C' },
  { names: ['naranja', 'naranjo'], hex: '#F4842C' },
  { names: ['amarillo', 'amarilla', 'mostaza'], hex: '#FEC14D' },
  { names: ['dorado', 'dorada', 'oro'], hex: '#C9A227' },
  { names: ['beige', 'crema', 'marfil'], hex: '#E8DCC8' },
  { names: ['marron', 'chocolate'], hex: '#8B5E3C' },
  { names: ['verde', 'lima'], hex: '#2BA84A' },
  { names: ['turquesa'], hex: '#40C4AA' },
  { names: ['celeste'], hex: '#2793C8' },
  { names: ['azul', 'azulado'], hex: '#1D6FA5' },
  { names: ['violeta', 'violaceo'], hex: '#7B2FBE' },
  { names: ['lila'], hex: '#B388EB' },
  { names: ['rosa', 'rosado', 'rosada'], hex: '#F15BB5' },
  { names: ['fucsia', 'magenta'], hex: '#D63384' },
  { names: ['negro', 'negra'], hex: '#141414' },
  { names: ['gris', 'grisaceo', 'plateado', 'plateada'], hex: '#6C757D' },
  { names: ['blanco', 'blanca'], hex: '#FFFFFF' },
];

function norm(text) {
  return (' ' + String(text || '').toLowerCase() + ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function detectColors(text) {
  const t = norm(text);
  const hits = [];
  for (const c of COLOR_MAP) {
    let idx = Infinity;
    for (const n of c.names) {
      const m = t.search(new RegExp('[^a-z]' + n + '(es|s)?[^a-z]'));
      if (m >= 0 && m < idx) idx = m;
    }
    if (idx < Infinity) hits.push({ name: c.names[0], hex: c.hex, idx });
  }
  hits.sort((a, b) => a.idx - b.idx);
  return hits.slice(0, 2).map(({ name, hex }) => ({ name, hex }));
}

// ================= 2. KEYWORDS PARA FOTOS (ES → EN) =================
const PHOTO_DICT = {
  buzo: 'hoodie', hoodie: 'hoodie', canguro: 'hoodie', poleron: 'hoodie',
  campera: 'jacket', chaqueta: 'jacket', parka: 'jacket', tapado: 'coat',
  remera: 't-shirt', playera: 't-shirt', musculosa: 'tank top',
  camisa: 'shirt', jean: 'jeans', pantalon: 'pants', joggin: 'joggers',
  vestido: 'dress', pollera: 'skirt', falda: 'skirt', short: 'shorts',
  traje: 'suit', blazer: 'blazer', saco: 'blazer',
  zapatilla: 'sneakers', zapatillas: 'sneakers', zapato: 'shoes', bota: 'boots',
  ojota: 'flip flops', sandalia: 'sandals',
  cartera: 'handbag', bolso: 'handbag', mochila: 'backpack', billetera: 'wallet',
  reloj: 'watch', relojes: 'watch', anteojo: 'sunglasses', lente: 'glasses',
  gorra: 'cap', sombrero: 'hat', bufanda: 'scarf', guante: 'gloves',
  ropa: 'fashion', moda: 'fashion', outfit: 'outfit', look: 'outfit',
  diseno: 'fashion design', tienda: 'clothing store', local: 'store',
  pizza: 'pizza', hamburguesa: 'burger', empanada: 'empanadas', milanesa: 'food',
  pasta: 'pasta', sushi: 'sushi', ensalada: 'salad', desayuno: 'breakfast',
  merienda: 'brunch', brunch: 'brunch', cafe: 'coffee', cafeteria: 'coffee shop',
  torta: 'cake', pastel: 'cake', helado: 'ice cream', chocolate: 'chocolate',
  cerveza: 'beer', vino: 'wine', coctel: 'cocktail', trago: 'cocktail',
  restaurante: 'restaurant', resto: 'restaurant', bar: 'bar', pizzeria: 'pizzeria',
  panaderia: 'bakery', pasteleria: 'pastry',
  peluqueria: 'hair salon', barberia: 'barbershop', estetica: 'spa', corte: 'haircut',
  pelo: 'hair', barba: 'beard', afeitado: 'shaving',
  maquillaje: 'makeup', unas: 'nails', manicura: 'nails', skincare: 'skincare',
  perfume: 'perfume', crema: 'cosmetics',
  gimnasio: 'gym', gym: 'gym', crossfit: 'crossfit', yoga: 'yoga',
  running: 'running', entrenamiento: 'workout', personal: 'personal trainer',
  perro: 'dog', gato: 'cat', mascota: 'pet', cachorro: 'puppy',
  veterinaria: 'veterinary', peluqueria_canina: 'dog grooming',
  flor: 'flowers', flores: 'flowers', planta: 'plant', vivero: 'plant nursery',
  mueble: 'furniture', sillon: 'sofa', lampara: 'lamp', deco: 'home decor',
  cocina: 'kitchen', dormitorio: 'bedroom', living: 'living room',
  auto: 'car', moto: 'motorcycle', bicicleta: 'bicycle', bici: 'bicycle',
  viaje: 'travel', playa: 'beach', montana: 'mountain', hotel: 'hotel',
  fiesta: 'party', casamiento: 'wedding', cumpleanos: 'birthday',
  libro: 'book', curso: 'online course', clase: 'class', taller: 'workshop',
  tatuaje: 'tattoo', joya: 'jewelry', anillo: 'ring', collar: 'necklace',
  foto: 'photography', fotografia: 'photography',
  nino: 'kids', bebe: 'baby', familia: 'family',
  oficina: 'office', trabajo: 'workspace', emprendedor: 'entrepreneur',
};

const FILLER = new Set(
  'de en con para por el la los las lo del al un una unos unas y o u que se es son esta este esto estos estas mi tu su sus mis tus les me te nos le muy mas sin sobre entre hace hacer hacen hacemos nuevo nueva nuevos nuevas hoy ahora ayer manana quiero quiere quieren queres queremos vendo venden venta oferta promo promocion descuento producto productos servicio servicios negocio marca gran mejor lindo linda hermoso hermosa abrimos abren abrir abrieron inauguramos inaugurar lanzamos lanzar lanzamiento presentamos presentar tenemos tengo tienen mira miren miralo conta contanos atencion veni vengan veni pasate pasa elegi lleva llevate aprovecha disfruta conoce descubri llega llego llegan sumate animate pedilo pedila reservalo'.split(' ')
);

function photoQueryFor(text) {
  const words = norm(text).split(/[^a-z]+/).filter((w) => w.length > 2 && !FILLER.has(w));
  const colorNames = new Set(COLOR_MAP.flatMap((c) => c.names));
  const sig = words.filter((w) => !colorNames.has(w));
  for (const w of sig) {
    if (PHOTO_DICT[w]) return PHOTO_DICT[w];
    if (w.endsWith('es') && PHOTO_DICT[w.slice(0, -2)]) return PHOTO_DICT[w.slice(0, -2)];
    if (w.endsWith('s') && PHOTO_DICT[w.slice(0, -1)]) return PHOTO_DICT[w.slice(0, -1)];
  }
  if (sig.length) return sig[0];
  return 'lifestyle';
}

// ================= 3. FOTOS (descargadas a /media, jamás hotlink) =================
function fetchTimeout(ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

async function fetchImage(url, timeoutMs = 25000) {
  const { signal, done } = fetchTimeout(timeoutMs);
  try {
    const r = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Posta/1.0)' },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) throw new Error('no es imagen: ' + ct);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 8000) throw new Error('imagen muy chica');
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    return { buf, ext };
  } finally {
    done();
  }
}

function savePhoto(buf, ext) {
  const name = `creator-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const file = path.join(MEDIA_DIR, name);
  fs.writeFileSync(file, buf);
  return { path: `/media/${name}`, file };
}

async function pexelsPhotos(query, key, n, page = 1) {
  const u =
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}` +
    `&per_page=${n}&page=${page}&orientation=portrait&size=large`;
  const { signal, done } = fetchTimeout(25000);
  try {
    const r = await fetch(u, { signal, headers: { Authorization: key } });
    if (!r.ok) throw new Error('Pexels HTTP ' + r.status);
    const j = await r.json();
    const out = [];
    for (const ph of (j.photos || []).slice(0, n)) {
      try {
        const src = ph.src && (ph.src.large2x || ph.src.large || ph.src.medium);
        if (!src) continue;
        const { buf, ext } = await fetchImage(src);
        out.push(savePhoto(buf, ext));
      } catch (e) {
        console.error('[creator] pexels foto falló:', e.message);
      }
    }
    return out;
  } finally {
    done();
  }
}

async function loremflickrPhotos(query, n, salt = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    try {
      const lock = salt * 997 + i + 1;
      const { buf, ext } = await fetchImage(
        `https://loremflickr.com/1080/1350/${encodeURIComponent(query)}?lock=${lock}`
      );
      out.push(savePhoto(buf, ext));
    } catch (e) {
      console.error('[creator] loremflickr foto falló:', e.message);
    }
  }
  return out;
}

const POOL_PREFIX = {
  hoodie: 'fashion', fashion: 'fashion', outfit: 'fashion', dress: 'fashion',
  sneakers: 'fashion', 't-shirt': 'fashion', jacket: 'fashion', jeans: 'fashion',
  watch: 'fashion', handbag: 'fashion', sunglasses: 'fashion',
  pizza: 'food', burger: 'food', coffee: 'food', cake: 'food', restaurant: 'food',
  bar: 'bar', cocktail: 'bar', beer: 'bar',
  dog: 'pets', cat: 'pets', pet: 'pets', puppy: 'pets',
  gym: 'fitness', yoga: 'fitness', workout: 'fitness', running: 'fitness',
  makeup: 'beauty', nails: 'beauty', 'hair salon': 'beauty', spa: 'beauty',
  flowers: 'lifestyle', travel: 'lifestyle', plant: 'lifestyle',
};

function localPoolPhotos(query, n) {
  const prefix = POOL_PREFIX[query] || 'lifestyle';
  const out = [];
  const seen = new Set();
  const candidates = [];
  for (let i = 1; i <= 6; i++) candidates.push(`${prefix}-${i}.webp`);
  candidates.push(`${prefix}.webp`);
  for (const f of candidates) {
    if (out.length >= n) break;
    const src = path.join(DEMO_STOCK, f);
    if (!fs.existsSync(src) || seen.has(f)) continue;
    seen.add(f);
    try {
      const buf = fs.readFileSync(src);
      out.push(savePhoto(buf, 'webp'));
    } catch (e) {
      console.error('[creator] pool local falló:', e.message);
    }
  }
  return out;
}

async function searchPhotos({ query, pexelsKey, n = 6, salt = 0, page = 1 }) {
  const errors = [];
  if (pexelsKey) {
    try {
      const p = await pexelsPhotos(query, pexelsKey, n, page);
      if (p.length >= 3) return p;
      errors.push(`pexels devolvió ${p.length}`);
    } catch (e) {
      errors.push('pexels: ' + e.message);
    }
  }
  try {
    const l = await loremflickrPhotos(query, n, salt);
    if (l.length >= 3) return l;
    errors.push(`loremflickr devolvió ${l.length}`);
  } catch (e) {
    errors.push('loremflickr: ' + e.message);
  }
  const local = localPoolPhotos(query, n);
  if (local.length >= 3) return local;
  throw new Error('No se pudieron conseguir fotos (' + errors.join('; ') + ')');
}

// ================= 4. PALETA Y RENDER =================
function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function shade(hex, amt) {
  const n = parseInt(String(hex).slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt / 100) * 255)));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function parseBrandColors(settings) {
  try {
    const a = JSON.parse((settings && settings.brand_colors) || '[]');
    return Array.isArray(a) ? a.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)) : [];
  } catch {
    return [];
  }
}

// Prioridad: colores pedidos por el cliente > colores de su marca > neutro premium.
// NUNCA la paleta de Posta (celeste/amarillo) salvo que el cliente la pida explícitamente.
function resolvePalette(detected, brandColors) {
  let c1, c2, label;
  if (detected.length) {
    c1 = detected[0].hex;
    c2 = detected[1] ? detected[1].hex : luminance(c1) > 0.55 ? '#0A1E33' : shade(c1, -25);
    label = detected.map((d) => d.name).join(' y ');
    label = label.charAt(0).toUpperCase() + label.slice(1);
  } else if (brandColors.length >= 2) {
    c1 = brandColors[0];
    c2 = brandColors[1];
    label = 'Mi marca';
  } else {
    c1 = '#0A1E33';
    c2 = '#47617A';
    label = 'Neutro premium';
  }
  return {
    label,
    render: {
      accent: c1,
      accent_text: luminance(c1) > 0.6 ? '#0A1E33' : '#FFFFFF',
      headline: luminance(c1) > 0.75 ? '#0A1E33' : c1,
      subline: '#47617A',
      btn: c2,
      btn_text: luminance(c2) > 0.6 ? '#0A1E33' : '#FFFFFF',
      watermark: '#47617A',
    },
  };
}

function headlineFor(topic) {
  const colorNames = new Set(COLOR_MAP.flatMap((c) => c.names));
  const words = String(topic).split(/\s+/).filter((w) => {
    const n = norm(w).replace(/[^a-z]/g, '');
    return n.length > 1 && !colorNames.has(n) && !FILLER.has(n);
  });
  const h = words.slice(0, 3).join(' ').toUpperCase().slice(0, 26);
  return h || 'NOVEDAD';
}

function runRender(args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    execFile('python3', args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message).split('\n').slice(-6).join(' ').slice(0, 400);
        return reject(new Error('Render falló: ' + msg));
      }
      resolve(stdout);
    });
  });
}

async function renderOptions(posts) {
  if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-'));
  try {
    const specPath = path.join(runDir, 'spec.json');
    // demo_render.py lee los colores del nivel superior del spec (no por post).
    // Las 6 opciones comparten la paleta resuelta, así que va una sola vez.
    const topColors = (posts[0] && posts[0].colors) || undefined;
    fs.writeFileSync(specPath, JSON.stringify({ fonts_dir: FONTS_DIR, colors: topColors, posts }));
    await runRender([DEMO_SCRIPT, specPath, runDir]);
    return posts.map((p, i) => {
      const src = path.join(runDir, `post-${i}.png`);
      if (!fs.existsSync(src)) throw new Error('Render no generó post-' + i);
      const name = `creator-${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${i}.png`;
      const dest = path.join(MEDIA_DIR, name);
      fs.copyFileSync(src, dest);
      return { ...p, image: `/media/${name}` };
    });
  } finally {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}

// ================= 5. ORQUESTADOR =================
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

async function generateOptions({ topic, feedback, profile, settings, openaiKey }) {
  const combined = feedback ? `${topic} ${feedback}` : topic;
  const colors = detectColors(combined);
  const photoQuery = photoQueryFor(combined);
  const pexelsKey = process.env.PEXELS_API_KEY || (settings && settings.pexels_key) || '';

  // Si el feedback pide otra foto o un ajuste, variamos la tanda de fotos.
  const wantsNewPhotos = /otr[ao]s? foto|cambi[ao]r? foto|nuevas? foto/i.test(feedback || '');
  const salt = feedback ? Math.abs(hashStr(feedback + Date.now())) % 997 : 0;
  const page = wantsNewPhotos && pexelsKey ? (Math.abs(hashStr(feedback)) % 4) + 2 : 1;

  const photos = await searchPhotos({ query: photoQuery, pexelsKey, n: 6, salt, page });

  const business = (profile && profile.business_name) || '';
  const category = (profile && profile.category) || 'otro';
  const tone = (profile && profile.tone) || 'canchero';
  const { captions, hashtags: aiTags } = await generateCaptions(
    { business, category, tone, topic, feedback, seedBase: feedback ? Math.abs(hashStr(feedback)) % 100 : 0 },
    6,
    openaiKey
  );
  const tags = aiTags && aiTags.trim()
    ? aiTags
    : [...(HASHTAGS[category] || HASHTAGS.otro)].slice(0, 8).join(' ');

  const palette = resolvePalette(colors, parseBrandColors(settings));
  let styles = ['promo', 'editorial', 'nocturno', 'bloque', 'marco', 'sello'];
  // El estilo "bloque" pinta un fondo pleno con el color de acento: con un acento
  // muy claro el texto no se leería. En ese caso usamos "oferta".
  if (luminance(palette.render.accent) > 0.8) styles = ['promo', 'editorial', 'nocturno', 'oferta', 'marco', 'sello'];

  const subline = colors.length
    ? 'En ' + colors.map((c) => c.name).join(' y ')
    : 'Nuevo ingreso';

  const posts = styles.map((style, i) => ({
    photo: photos[i % photos.length].file,
    style,
    focus: 0.5,
    pill: 'NUEVO',
    bar: (business || 'TU NEGOCIO').toUpperCase().slice(0, 28),
    headline: headlineFor(topic),
    subline,
    cta: 'Escribinos por DM',
    watermark: '',
    colors: palette.render,
  }));

  const rendered = await renderOptions(posts);
  const options = rendered.map((r, i) => ({
    image: r.image,
    title: r.headline,
    subtitle: r.subline,
    caption: captions[i % captions.length],
    hashtags: tags,
    style: r.style,
    paletteName: palette.label,
  }));

  return {
    detected: {
      colors: colors.map((c) => c.name),
      colorHex: colors.map((c) => c.hex),
      photoQuery,
    },
    recommendedIndex: 0,
    recommendedReason: 'La elegimos por la foto y el diseño que más va con tu idea',
    options,
  };
}

module.exports = { generateOptions, detectColors, photoQueryFor, resolvePalette, searchPhotos };
