// Demo pública self-service — Posta
// Genera 2 posteos + 1 video de muestra sin registro: imágenes 1080×1350
// renderizadas con PIL (Python3) en el lenguaje premium de la marca (foto
// full-bleed + fundido blanco + barra celeste #2793C8 + titular navy + pill
// amarillo); el 3er diseño se anima con ffmpeg (Ken Burns) a MP4 1080×1350
// para Reels. Captions con copy que vende + hashtags. Sin registro ni WhatsApp.

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const DEMO_SCRIPT = path.join(__dirname, 'demo_render.py');
const DEMO_VIDEO_SCRIPT = path.join(__dirname, 'demo_video.py');
const FONTS_DIR = path.join(__dirname, 'assets', 'fonts');
const STOCK_DIR = path.join(__dirname, 'public', 'demo-stock');

// Auto-extrae public/demo-stock.zip (librería de 59 fotos) si faltan fotos.
// Permite subir la librería como un solo archivo en vez de 59 sueltos.
(function ensureStock() {
  try {
    const zip = path.join(__dirname, 'public', 'demo-stock.zip');
    if (!fs.existsSync(zip)) return;
    let have = 0;
    try { have = fs.readdirSync(STOCK_DIR).filter((f) => f.endsWith('.webp')).length; } catch (_) {}
    if (have >= 59) return;
    fs.mkdirSync(STOCK_DIR, { recursive: true });
    execFileSync('python3', ['-c',
      'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',
      zip, STOCK_DIR], { stdio: 'ignore', timeout: 60000 });
  } catch (_) {}
})();

const DEMO_LIMIT_PER_DAY = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// 20 rubros (key → etiqueta del select en demo.html)
const CATEGORIES = [
  'moda', 'gastronomia', 'belleza', 'fitness', 'mascotas', 'salud', 'hogar',
  'inmobiliaria', 'autos', 'educacion', 'turismo', 'eventos', 'tecnologia',
  'deco', 'joyeria', 'fotografia', 'profesionales', 'flores', 'bar', 'otro',
];
const CATEGORY_LABELS = {
  moda: 'Moda / Tienda de ropa',
  gastronomia: 'Gastronomía / Café / Restaurante',
  belleza: 'Barbería / Peluquería / Estética',
  fitness: 'Fitness / Gimnasio',
  mascotas: 'Mascotas / Veterinaria',
  salud: 'Salud / Odontología',
  hogar: 'Servicios para el hogar',
  inmobiliaria: 'Inmobiliaria',
  autos: 'Autos / Taller',
  educacion: 'Educación / Cursos',
  turismo: 'Turismo / Hotelería',
  eventos: 'Eventos / Fiestas',
  tecnologia: 'Tecnología / Celulares',
  deco: 'Muebles / Decoración',
  joyeria: 'Joyería / Accesorios',
  fotografia: 'Fotografía / Arte',
  profesionales: 'Servicios profesionales',
  flores: 'Florería / Vivero',
  bar: 'Bar / Cervecería',
  otro: 'Otro',
};
const COUNTRIES = ['AR', 'UY'];

// Familia fotográfica por rubro (8 fotos high-key en public/demo-stock/).
// 59 fotos stock en public/demo-stock/: 9 familias ({fam}.webp original +
// {fam}-1..N.webp). Cada rubro tiene un pool de ~10 fotos creibles; cada demo
// usa 3 fotos distintas elegidas al azar del pool.
function fam(f, n) { const a = [f]; for (let i = 1; i <= n; i++) a.push(f + '-' + i); return a; }
const FASHION = fam('fashion', 6), FOOD = fam('food', 6), BEAUTY = fam('beauty', 6),
      FITNESS = fam('fitness', 5), PETS = fam('pets', 5), HOME = fam('home', 6),
      OFFICE = fam('office', 5), LIFE = fam('lifestyle', 6), BAR = fam('bar', 5);

// Pool curado solo para cafés: si el nombre del negocio suena a café,
// usamos únicamente fotos creíbles de café (nada de cerveza, ensaladas
// ni lifestyle genérico). Un café con foto de cerveza rompe la magia.
const CAFE_POOL = ['food', 'food-2', 'food-4', 'lifestyle', 'lifestyle-1', 'food-1'];
const CAFE_RE = /caf[eé]|coffee|cafeter[ií]a|barista|tostadur[ií]a|espresso|cappuccino|latte|pasteler[ií]a|panader[ií]a|brunch|medialuna|churro|desayuno|merienda/i;
function isCafeBusiness(business) { return CAFE_RE.test(String(business || '')); }

const CATEGORY_PHOTOS = {
  moda: [...FASHION, ...LIFE.slice(0, 2), ...BEAUTY.slice(0, 2)],
  joyeria: [...FASHION.slice(0, 4), ...BEAUTY.slice(0, 4), ...LIFE.slice(0, 2)],
  gastronomia: [...FOOD, ...LIFE.slice(0, 2)],
  bar: [...BAR, ...FOOD.slice(0, 3), ...LIFE.slice(0, 2)],
  belleza: [...BEAUTY, ...FASHION.slice(0, 2), ...LIFE.slice(0, 2)],
  fitness: [...FITNESS, ...LIFE.slice(0, 3), ...HOME.slice(0, 2)],
  mascotas: [...PETS, ...HOME.slice(0, 3), ...LIFE.slice(0, 2)],
  hogar: [...HOME, ...LIFE.slice(0, 2), ...OFFICE.slice(0, 2)],
  deco: [...HOME, ...LIFE.slice(0, 2), ...OFFICE.slice(0, 2)],
  flores: [...HOME.slice(0, 4), ...BEAUTY.slice(0, 3), ...LIFE.slice(0, 3)],
  inmobiliaria: [...HOME.slice(0, 5), ...OFFICE.slice(0, 3), ...LIFE.slice(0, 2)],
  salud: [...OFFICE.slice(0, 4), ...BEAUTY.slice(0, 3), ...LIFE.slice(0, 3)],
  profesionales: [...OFFICE, ...HOME.slice(0, 2), ...LIFE.slice(0, 3)],
  educacion: [...OFFICE, ...LIFE.slice(0, 3), ...HOME.slice(0, 2)],
  tecnologia: [...OFFICE, ...LIFE.slice(0, 3), ...HOME.slice(0, 2)],
  turismo: [...LIFE, ...BAR.slice(0, 2), ...FOOD.slice(0, 2)],
  eventos: [...BAR.slice(0, 4), ...LIFE.slice(0, 4), ...FOOD.slice(0, 2)],
  fotografia: [...LIFE.slice(0, 5), ...FASHION.slice(0, 3), ...OFFICE.slice(0, 2)],
  autos: [...OFFICE.slice(0, 4), ...LIFE.slice(0, 4), ...HOME.slice(0, 2)],
  otro: [...LIFE.slice(0, 5), ...OFFICE.slice(0, 3), ...HOME.slice(0, 2)],
};

function stockPhotosN(category, n, business) {
  // Los cafés tienen pool propio: solo fotos que un café publicaría.
  const pool = (category === 'gastronomia' && isCafeBusiness(business))
    ? CAFE_POOL.slice()
    : (CATEGORY_PHOTOS[category] || CATEGORY_PHOTOS.otro).slice();
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n).map((fam) => {
    const p = path.join(STOCK_DIR, fam + '.webp');
    if (!fs.existsSync(p)) throw new Error('Foto de muestra no disponible');
    return p;
  });
}

function stockPhotos3(category, business) {
  return stockPhotosN(category, 3, business);
}

// ---------- Colores elegidos por el visitante ----------
const DEMO_COLOR_DEFAULTS = { accent: '#2793C8', btn: '#FEC14D' };

function cleanHex(v, fallback) {
  const s = String(v || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}

// Texto legible sobre un fondo de color: blanco o navy según luminancia.
function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#0A1E33' : '#FFFFFF';
}

function demoColors(accent, btn) {
  const a = cleanHex(accent, DEMO_COLOR_DEFAULTS.accent);
  const b = cleanHex(btn, DEMO_COLOR_DEFAULTS.btn);
  return {
    accent: a,
    accent_text: textOn(a),
    headline: '#0A1E33',
    subline: '#47617A',
    btn: b,
    btn_text: textOn(b),
    watermark: '#47617A',
  };
}

// ---------- Rate limit: 5 generaciones por IP por día ----------
function clientIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip || req.socket?.remoteAddress || 'unknown';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Devuelve { allowed, remaining }. Si allowed, incrementa el contador.
function checkRateLimit(ip) {
  const day = todayStr();
  // Limpieza liviana de días viejos (cada tanto)
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM demo_usage WHERE day < date('now', '-7 days')`);
  } catch (_) {}
  const row = db.prepare('SELECT count FROM demo_usage WHERE ip = ? AND day = ?').get(ip, day);
  const count = row ? row.count : 0;
  if (count >= DEMO_LIMIT_PER_DAY) return { allowed: false, remaining: 0 };
  db.prepare(
    `INSERT INTO demo_usage (ip, day, count) VALUES (?, ?, 1)
     ON CONFLICT(ip, day) DO UPDATE SET count = count + 1`
  ).run(ip, day);
  return { allowed: true, remaining: DEMO_LIMIT_PER_DAY - count - 1 };
}

// ---------- Parser multipart/form-data mínimo (sin dependencias) ----------
// Espera el body crudo como Buffer (express.raw). Devuelve { fields, file }.
function parseMultipart(req, body) {
  const ct = req.headers['content-type'] || '';
  const m = ct.match(/boundary=([^;]+)/);
  if (!m) throw new Error('Formulario inválido');
  const boundary = Buffer.from('--' + m[1].trim().replace(/^"|"$/g, ''));
  const endMark = Buffer.from('--' + m[1].trim().replace(/^"|"$/g, '') + '--');
  if (!Buffer.isBuffer(body) || body.length === 0) throw new Error('Formulario vacío');

  const fields = {};
  let file = null;
  let pos = 0;
  while (true) {
    const bStart = body.indexOf(boundary, pos);
    if (bStart === -1) break;
    if (body.indexOf(endMark, bStart) === bStart) break;
    let p = bStart + boundary.length;
    if (body[p] === 0x0d && body[p + 1] === 0x0a) p += 2; // \r\n
    const hEnd = body.indexOf('\r\n\r\n', p);
    if (hEnd === -1) break;
    const headers = body.slice(p, hEnd).toString('latin1');
    const contentStart = hEnd + 4;
    let contentEnd = body.indexOf(boundary, contentStart);
    if (contentEnd === -1) break;
    contentEnd -= 2; // quita \r\n previo
    const disp = (headers.match(/Content-Disposition:[^\r\n]*/i) || [''])[0];
    const nameM = disp.match(/name="([^"]*)"/);
    const fileM = disp.match(/filename="([^"]*)"/);
    const typeM = (headers.match(/Content-Type:\s*([^\r\n;]+)/i) || [])[1];
    const data = body.slice(contentStart, contentEnd);
    if (fileM && nameM && nameM[1] === 'photo') {
      const filename = fileM[1];
      if (filename && data.length > 0) {
        if (data.length > MAX_FILE_BYTES) throw new Error('La foto no puede superar los 5MB');
        file = { buffer: data, filename, mimetype: (typeM || '').trim().toLowerCase() };
      }
    } else if (nameM) {
      fields[nameM[1]] = data.toString('utf8');
    }
    pos = contentEnd + 2;
  }
  return { fields, file };
}

function validImageKind(file) {
  const b = file.buffer;
  if (!b || b.length < 12) return null;
  const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  const isJpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const isWebp = b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  const okType = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
  if ((isPng || isJpg || isWebp) && okType) return isPng ? 'png' : isJpg ? 'jpg' : 'webp';
  return null;
}

// ---------- Tono: conversión voseo → tuteo ----------
const TU_MAP = [
  ['Che, mirá esto 👀', 'Mira esto 👀'],
  ['Che, mirá lo que acaba de llegar 👀', 'Mira lo que acaba de llegar 👀'],
  ['Atención, que esto es posta 👇', 'Atención, esto te va a encantar 👇'],
  ['Mirá lo que tenemos para vos ✨', 'Mira lo que tenemos para ti ✨'],
  ['Escribinos por DM y te lo reservamos 📩', 'Escríbenos por DM y te lo reservamos 📩'],
  ['Comentá INFO y te pasamos todo 👇', 'Comenta INFO y te pasamos todo 👇'],
  ['Guardá este post para no olvidarte 🔖', 'Guarda este post para no olvidarlo 🔖'],
  ['Etiquetá a quien lo necesita 🙋', 'Etiqueta a quien lo necesita 🙋'],
  ['Reservá tu turno de esta semana', 'Reserva tu turno de esta semana'],
  ['reservá tu lugar', 'reserva tu lugar'],
  ['Reservá tu sesión', 'Reserva tu sesión'],
  ['Probá una clase gratis', 'Prueba una clase gratis'],
  ['Empezá hoy tu cambio', 'Empieza hoy tu cambio'],
  ['Vení con quien quieras', 'Ven con quien quieras'],
  ['Reservalo antes de que se llene', 'Reserva tu lugar antes de que se llene'],
  ['solo comentá', 'solo comenta'],
  ['solo vení a probar', 'solo ven a probar'],
  ['miralas primero', 'míralas primero'],
  ['Lo que tenés que saber', 'Lo que tienes que saber'],
  ['Todo lo que tenés que saber', 'Todo lo que tienes que saber'],
  ['Coordiná tu visita sin compromiso', 'Coordina tu visita sin compromiso'],
  ['Reservá tu lugar antes de que se llene', 'Reserva tu lugar antes de que se llene'],
  ['Reservá tu espacio para la próxima fecha', 'Reserva tu espacio para la próxima fecha'],
  ['Reservá tu fecha antes de que se llene', 'Reserva tu fecha antes de que se llene'],
  ['Mirá la última sesión completa', 'Mira la última sesión completa'],
  ['un cliente como vos', 'un cliente como tú'],
  ['qué birra va con vos', 'qué birra va contigo'],
  ['vení a verlo', 'ven a verlo'],
];

function toTu(text) {
  let out = String(text || '');
  for (const [vos, tu] of TU_MAP) out = out.split(vos).join(tu);
  return out;
}

// ---------- Hashtags por país ----------
const TAGS_AR = {
  moda: ['#modaargentina', '#tiendaderopa', '#ootd', '#emprendedoresargentinos', '#comprelocal'],
  gastronomia: ['#foodieargentina', '#gastronomia', '#antojo', '#restaurante', '#buenosairesfood'],
  belleza: ['#bellezaargentina', '#peluqueria', '#estetica', '#makeup', '#skincare'],
  fitness: ['#fitnessargentina', '#entrenamiento', '#gymlife', '#vidasana', '#personaltrainer'],
  mascotas: ['#mascotasargentina', '#veterinaria', '#petshop', '#doglover', '#gatos'],
  salud: ['#saludargentina', '#odontologia', '#bienestar', '#saluddental', '#habitossaludables'],
  hogar: ['#hogarargentina', '#serviciosdelhogar', '#reformas', '#mantenimiento', '#hogar'],
  inmobiliaria: ['#inmobiliariaargentina', '#propiedades', '#realestateargentina', '#alquileres', '#ventadepropiedades'],
  autos: ['#autosargentina', '#taller', '#serviceautomotor', '#mecanica', '#autos'],
  educacion: ['#educacionargentina', '#cursos', '#capacitacion', '#aprender', '#cursosonline'],
  turismo: ['#turismoargentina', '#viajes', '#hoteleria', '#escapadas', '#turismo'],
  eventos: ['#eventosargentina', '#fiestas', '#eventplanner', '#celebraciones', '#producciondeeventos'],
  tecnologia: ['#tecnologiaargentina', '#celulares', '#tech', '#serviciotecnico', '#gadgets'],
  deco: ['#decoargentina', '#decoracion', '#interiorismo', '#muebles', '#homedecor'],
  joyeria: ['#joyeriaargentina', '#joyas', '#accesorios', '#bijouterie', '#hechoamano'],
  fotografia: ['#fotografiaargentina', '#fotografo', '#sesiondefotos', '#photography', '#arte'],
  profesionales: ['#serviciosprofesionales', '#consultoria', '#abogados', '#contadores', '#profesionales'],
  flores: ['#floreriaargentina', '#flores', '#vivero', '#ramosdeflores', '#plantas'],
  bar: ['#baresargentina', '#cervezaartesanal', '#cocktails', '#happyhour', '#salidas'],
  otro: ['#pymesargentina', '#negocioslocales', '#comerciolocal', '#argentina'],
};
const TAGS_UY = Object.fromEntries(
  Object.entries(TAGS_AR).map(([k, v]) => [
    k,
    v.map((t) => t.replace(/argentina/g, 'uruguay').replace(/buenosairesfood/g, 'montevideofood')),
  ])
);
const TAGS_NEUTRAL = {
  moda: ['#moda', '#tiendaderopa', '#ootd', '#fashion', '#nuevacoleccion'],
  gastronomia: ['#foodie', '#gastronomia', '#antojo', '#restaurante', '#foodlover'],
  belleza: ['#belleza', '#peluqueria', '#estetica', '#makeup', '#skincare'],
  fitness: ['#fitness', '#entrenamiento', '#gymlife', '#vidasana', '#personaltrainer'],
  mascotas: ['#mascotas', '#veterinaria', '#petshop', '#doglover', '#mascotasfelices'],
  salud: ['#salud', '#odontologia', '#bienestar', '#saluddental', '#habitossaludables'],
  hogar: ['#hogar', '#serviciosdelhogar', '#reformas', '#mantenimiento', '#decohogar'],
  inmobiliaria: ['#inmobiliaria', '#propiedades', '#realestate', '#bienesraices', '#inversion'],
  autos: ['#autos', '#taller', '#serviceautomotor', '#mecanica', '#carlovers'],
  educacion: ['#educacion', '#cursos', '#capacitacion', '#aprender', '#cursosonline'],
  turismo: ['#turismo', '#viajes', '#hoteleria', '#escapadas', '#viajeros'],
  eventos: ['#eventos', '#fiestas', '#eventplanner', '#celebraciones', '#produccion'],
  tecnologia: ['#tecnologia', '#celulares', '#tech', '#gadgets', '#serviciotecnico'],
  deco: ['#deco', '#decoracion', '#interiorismo', '#muebles', '#homedecor'],
  joyeria: ['#joyeria', '#joyas', '#accesorios', '#bijou', '#hechoamano'],
  fotografia: ['#fotografia', '#fotografo', '#sesiondefotos', '#photography', '#arte'],
  profesionales: ['#profesionales', '#consultoria', '#servicios', '#negocios', '#emprendedores'],
  flores: ['#flores', '#floreria', '#vivero', '#ramosdeflores', '#plantas'],
  bar: ['#bar', '#cerveza', '#cocktails', '#bares', '#happyhour'],
  otro: ['#pymes', '#negocioslocales', '#comerciolocal', '#apoyolocal'],
};
// Nada de hashtags de marketinero (#marketingdigital, #emprendedores…):
// un café real jamás los publicaría y rompen la promesa de "listo para publicar".
const GENERIC_TAGS = [];

function demoHashtags(category, country, tone) {
  const base = tone === 'tu' ? TAGS_NEUTRAL : country === 'UY' ? TAGS_UY : TAGS_AR;
  const tags = [...(base[category] || base.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return tags.join(' ');
}

// ---------- Los 3 posteos de muestra: copy pensado para vender ----------
// kind: novedad | promo | reserva | tip | social (para ordenar según el objetivo)
// tag: pill superior · headline: titular ESPECIFICO en caja mixta (sin emojis,
// nunca una etiqueta generica como "PROMO SEMANAL") · subline: beneficio concreto
// subline: beneficio concreto (neutro, sin voseo) · cta: texto del botón
// caption: hook + beneficio + CTA
const DEMO_TOPICS = {
  moda: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Lo nuevo que siempre se agota',
      subline: 'La colección más esperada ya está disponible.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nEl nuevo ingreso de la semana en {BIZ} ya está disponible.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'PROMO', headline: 'El descuento de esta semana',
      subline: 'Solo por estos días, después vuelve a su precio.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nLa promo de la semana en {BIZ} viene con descuento especial. Solo por estos días.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'El error que arruina tu look',
      subline: 'Y cómo evitarlo en 5 minutos.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para armar tu look con lo nuevo de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Sorteo: un look completo',
      subline: 'Participar es gratis, solo comentá.', cta: 'Quiero participar',
      caption: 'Se viene sorteo en {BIZ} 🎁\n\nSorteamos un look completo entre quienes comenten. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
    { kind: 'social', tag: 'CLIENTAS', headline: 'Así lo usan ellas',
      subline: 'Clientas reales con lo nuevo de la semana.', cta: 'Ver más looks',
      caption: 'Nada como verlo puesto ✨\n\nNuestras clientas armando looks con lo nuevo de {BIZ}.\n\nEtiquetá a tu amiga que necesita esto 🙋' },
    { kind: 'promo', tag: 'OUTLET', headline: 'Outlet: hasta 50% off',
      subline: 'Selección limitada, hasta agotar stock.', cta: 'Ver selección',
      caption: 'Atención, que esto es posta 👇\n\nHasta 50% off en selección outlet de {BIZ}. Cuando se acaba, se acaba.\n\nEscribinos por DM antes de que vuele 📩' },
  ],
  gastronomia: [
    { kind: 'social', tag: 'EL FAVORITO', headline: 'El plato que todos repiten',
      subline: 'El más pedido de la casa, por algo será.', cta: 'Lo quiero probar',
      caption: 'Che, mirá esto 👀\n\nEl plato más pedido de {BIZ}, el que todos recomiendan.\n\nEtiquetá a quien lo necesita 🙋' },
    { kind: 'promo', tag: '2X1', headline: '2x1 en tu favorito',
      subline: 'Esta semana, el segundo va por la casa.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nPromo 2x1 esta semana en {BIZ}. Vení con quien quieras.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'reserva', tag: 'HOY', headline: 'Tu mesa de hoy te espera',
      subline: 'Tres motivos para pasar hoy mismo.', cta: 'Voy hoy',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 motivos para venir hoy a {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'novedad', tag: 'NUEVO', headline: 'Recién salido de la cocina',
      subline: 'El plato que se va a volver tu favorito.', cta: 'Lo quiero probar',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo plato en {BIZ}: vení a probarlo esta semana.\n\nReservá tu mesa por DM 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'La combinación que no falla',
      subline: 'Qué pedir con cada plato.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nLa guía de maridaje de {BIZ}: qué pedir con cada plato.\n\nGuardá este post para tu próxima visita 🔖' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Cena para dos, de regalo',
      subline: 'Sorteamos una cena completa con postre.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna cena para dos, con postre incluido. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  belleza: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Tu momento de cuidado',
      subline: 'Lo último en cuidado personal, ya disponible.', cta: 'Quiero probarlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio disponible en {BIZ}. Tu momento de cuidado empieza acá.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'TURNO', headline: 'Tu turno de esta semana',
      subline: 'Reservalo antes de que se llene.', cta: 'Reservar ahora',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu turno de esta semana en {BIZ} antes de que se llene.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'Lo que tu piel necesita',
      subline: 'Consejos de expertos para cuidarte en casa.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de cuidado en casa, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'COMBO', headline: 'Vení con una amiga',
      subline: 'Vení con una amiga y ahorran las dos.', cta: 'Lo quiero',
      caption: 'Atención, que esto es posta 👇\n\nCombo amiga en {BIZ}: reservan juntas y ahorran las dos.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'social', tag: 'ANTES/DESPUÉS', headline: 'El cambio se nota',
      subline: 'Resultados reales de esta semana, sin filtros.', cta: 'Quiero mi cambio',
      caption: 'Mirá este cambio ✨\n\nResultados reales en {BIZ}, sin filtros.\n\nReservá tu turno por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Un día de spa gratis',
      subline: 'Sorteamos una sesión completa.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn día de spa completo. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  fitness: [
    { kind: 'novedad', tag: 'HOY', headline: 'El cambio empieza hoy',
      subline: 'Una sola clase puede cambiarlo todo.', cta: 'Empezar ahora',
      caption: 'Che, mirá esto 👀\n\nEmpezá hoy tu cambio en {BIZ}. La primera decisión es la más importante.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'GRATIS', headline: 'Tu primera clase gratis',
      subline: 'Sin compromiso, solo vení a probar.', cta: 'Quiero mi clase',
      caption: 'Atención, que esto es posta 👇\n\nProbá una clase gratis en {BIZ}, sin compromiso.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'El error que frena tu progreso',
      subline: 'Los 3 más comunes y cómo evitarlos.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 errores comunes al entrenar (y cómo evitarlos), por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'COMUNIDAD', headline: 'Acá no entrenás solo',
      subline: 'La comunidad que te empuja a seguir.', cta: 'Sumarme',
      caption: 'Acá no entrenás solo 💪\n\nLa comunidad de {BIZ} te espera: entrenamientos, desafíos y buena onda.\n\nEscribinos por DM y arrancá 📩' },
    { kind: 'promo', tag: 'PLAN', headline: 'Tu año al mejor precio',
      subline: '-20% en el plan anual, solo esta semana.', cta: 'Lo aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nPlan anual en {BIZ} con 20% off, solo esta semana.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'reserva', tag: 'EVALUACIÓN', headline: 'Medimos tu punto de partida',
      subline: 'Evaluación inicial gratis, sin cargo.', cta: 'Pedir la mía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nEvaluación inicial gratis en {BIZ}: sabemos desde dónde empezás.\n\nEscribinos por DM y te la reservamos 📩' },
  ],
  mascotas: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Lo nuevo para tu mascota',
      subline: 'Juguetes, alimento y accesorios recién llegados.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNovedades para tu mascota en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'DESCUENTO', headline: 'Semana con descuentos',
      subline: 'En alimento y accesorios, solo estos días.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nSemana mascotera en {BIZ}: descuentos en alimento y accesorios.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Lo que tu mascota necesita',
      subline: 'Consejos de expertos para cuidarla mejor.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de cuidado para tu mascota, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'CLIENTES', headline: 'Ternura nivel máximo',
      subline: 'Nuestros clientes de cuatro patas.', cta: 'Ver más',
      caption: 'Nivel de ternura: máximo 🐶\n\nNuestros clientes de cuatro patas, en {BIZ}.\n\nEtiquetá a quien necesita ver esto 🙋' },
    { kind: 'reserva', tag: 'TURNO', headline: 'Baño y corte esta semana',
      subline: 'Turnos de peluquería canina disponibles.', cta: 'Reservar turno',
      caption: 'Che, mirá esto 👀\n\nTurnos de peluquería canina en {BIZ}, esta semana.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Kit completo de regalo',
      subline: 'Sorteamos alimento, juguetes y accesorios.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn kit mascotero completo: alimento, juguetes y accesorios.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  salud: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Nueva tecnología disponible',
      subline: 'Tratamientos de última generación.', cta: 'Quiero saber más',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo tratamiento disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'TURNO', headline: 'Tu control sin esperas',
      subline: 'Reservá tu turno de este mes.', cta: 'Reservar ahora',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu turno en {BIZ}. Atención personalizada, sin esperas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'Pequeños cambios, gran salud',
      subline: 'Hábitos simples que recomiendan los expertos.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 hábitos sanos que recomiendan en {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'CHEQUEO', headline: 'Tu chequeo a precio especial',
      subline: 'Control completo, solo este mes.', cta: 'Pedir turno',
      caption: 'Atención, que esto es posta 👇\n\nChequeo anual en {BIZ} a precio especial este mes.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'social', tag: 'CONFIANZA', headline: 'Gracias por confiar',
      subline: 'Años cuidando tu salud.', cta: 'Conocernos',
      caption: 'Gracias por confiar ✨\n\nAños cuidando la salud de nuestros pacientes en {BIZ}.\n\nPedí tu turno por DM 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'Cuándo no esperar',
      subline: 'Señales a las que prestar atención.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nSeñales a las que prestar atención, por los expertos de {BIZ}.\n\nGuardá este post, te puede servir 🔖' },
  ],
  hogar: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Lo resolvemos por vos',
      subline: 'Nuevo servicio: soluciones sin vueltas.', cta: 'Pedir presupuesto',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio en {BIZ}: lo resolvemos por vos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'PRESUPUESTO', headline: 'Cotización sin cargo',
      subline: 'Te cotizamos gratis y sin compromiso.', cta: 'Pedir el mío',
      caption: 'Mirá lo que tenemos para vos ✨\n\nPresupuesto gratis en {BIZ}. Contanos qué necesitás y te cotizamos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Arreglalo vos mismo',
      subline: 'Mantenimiento simple para tu casa.', cta: 'Ver los tips',
      caption: 'Che, mirá esto 👀\n\n3 tips de mantenimiento para tu casa, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'reserva', tag: 'VISITA', headline: 'Vamos a tu casa gratis',
      subline: 'Vamos a tu casa sin cargo.', cta: 'Pedir visita',
      caption: 'Che, mirá esto 👀\n\nVisita técnica sin cargo en {BIZ}: vemos tu casa y te cotizamos.\n\nEscribinos por DM 📩' },
    { kind: 'social', tag: 'TRABAJOS', headline: 'Mirá este antes y después',
      subline: 'Trabajos reales de esta semana.', cta: 'Ver más',
      caption: 'Mirá este cambio ✨\n\nAntes y después de un trabajo real de {BIZ}.\n\nPedí tu presupuesto gratis 👇' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Kit de herramientas gratis',
      subline: 'Sorteamos un kit completo.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn kit de herramientas completo para tu casa.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  inmobiliaria: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Entraron nuevas propiedades',
      subline: 'Las últimas en sumarse, miralas primero.', cta: 'Quiero verlas',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevas propiedades disponibles en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'OPORTUNIDAD', headline: 'Precio especial este mes',
      subline: 'Una oportunidad que no se repite.', cta: 'Me interesa',
      caption: 'Atención, que esto es posta 👇\n\nOportunidad única en {BIZ}: precio especial por tiempo limitado.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Antes de comprar, leé esto',
      subline: 'Lo que tenés que saber antes de decidir.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para comprar tu próxima propiedad, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'VENDIDA', headline: 'Otra familia en su hogar',
      subline: 'Vendimos esta semana, la tuya puede ser la próxima.', cta: 'Quiero la mía',
      caption: 'Otra familia feliz 🏡\n\nPropiedad vendida por {BIZ} esta semana.\n\nComentá INFO y encontramos la tuya 👇' },
    { kind: 'reserva', tag: 'VISITA', headline: 'Visitala esta semana',
      subline: 'Coordiná tu visita sin compromiso.', cta: 'Coordinar visita',
      caption: 'Che, mirá esto 👀\n\nVisitas disponibles esta semana en {BIZ}.\n\nEscribinos por DM y coordinamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'Crédito hipotecario sin vueltas',
      subline: 'Todo lo que tenés que saber, explicado simple.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nGuía de crédito hipotecario, por los expertos de {BIZ}.\n\nGuardá este post 🔖' },
  ],
  autos: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Novedades en el taller',
      subline: 'Unidades y servicios que acaban de llegar.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNovedades en {BIZ}: unidades y servicios nuevos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'SERVICE', headline: 'Tu auto en buenas manos',
      subline: 'Service completo: revisión y cambio de aceite.', cta: 'Reservar service',
      caption: 'Atención, que esto es posta 👇\n\nService completo en {BIZ}: revisión, cambio de aceite y más.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'Evitá gastos grandes',
      subline: '3 tips para cuidar tu auto todos los días.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para cuidar tu auto, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'FINANCIACIÓN', headline: 'Estrenalo en cuotas',
      subline: 'Cuotas sin interés, a tu medida.', cta: 'Consultar',
      caption: 'Atención, que esto es posta 👇\n\nCuotas sin interés en {BIZ}: estrená tu próximo auto.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'social', tag: 'CLIENTES', headline: 'Otro 0km en la calle',
      subline: 'Clientes que ya estrenaron.', cta: 'Quiero el mío',
      caption: 'Otro 0km en la calle 🚗\n\nFelicitaciones a quienes confiaron en {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Service completo gratis',
      subline: 'Sorteamos un service completo.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn service completo gratis para tu auto.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  educacion: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Inscripciones abiertas',
      subline: 'Inscripciones abiertas, cupos limitados.', cta: 'Quiero inscribirme',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo curso en {BIZ}: inscripciones abiertas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'BECA', headline: 'Precio de lanzamiento',
      subline: 'Precio especial para los primeros inscriptos.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nDescuento de lanzamiento en {BIZ}, solo para los primeros.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Aprendé más rápido',
      subline: '3 técnicas que sí funcionan.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para aprender más rápido, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'EGRESADOS', headline: 'Otra camada lo logró',
      subline: 'Nuevos egresados este mes.', cta: 'Sumarme',
      caption: 'Otra camada que lo logró 🎓\n\nEgresados de {BIZ} este mes.\n\nEscribinos por DM e inscribite 📩' },
    { kind: 'reserva', tag: 'CHARLA', headline: 'Vení a conocer gratis',
      subline: 'Vení a conocer sin compromiso.', cta: 'Anotarme',
      caption: 'Che, mirá esto 👀\n\nCharla informativa gratis en {BIZ}.\n\nEscribinos por DM y te anotamos 📩' },
    { kind: 'promo', tag: '2X1', headline: '2x1 con tu amigo',
      subline: 'Se inscriben dos, paga uno.', cta: 'Lo aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nEn {BIZ}: traé un amigo y se inscriben 2x1.\n\nComentá INFO y te pasamos todo 👇' },
  ],
  turismo: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Un destino nuevo te espera',
      subline: 'Escapadas que te van a encantar.', cta: 'Quiero ir',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo destino disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', headline: 'Viajá 2x1',
      subline: 'Acompañado se viaja mejor.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nEscapada 2x1 en {BIZ}: viajá acompañado.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Viajá como un experto',
      subline: '3 consejos que hacen la diferencia.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips viajeros por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'VIAJEROS', headline: 'Así se vive el viaje',
      subline: 'Nuestros viajeros en destino.', cta: 'Quiero viajar',
      caption: 'Así la pasaron nuestros viajeros ✨\n\nPróxima salida con {BIZ}: sumate.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'CUPOS', headline: 'Quedan pocos lugares',
      subline: 'Quedan pocos lugares para la próxima salida.', cta: 'Reservar lugar',
      caption: 'Che, mirá esto 👀\n\nÚltimos cupos para la próxima salida de {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Escapada para dos gratis',
      subline: 'Sorteamos un viaje todo incluido.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna escapada para dos, todo incluido.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  eventos: [
    { kind: 'novedad', tag: 'FECHA', headline: 'Nueva fecha confirmada',
      subline: 'Ya podés reservar tu lugar.', cta: 'Reservar lugar',
      caption: 'Che, mirá esto 👀\n\nPróxima fecha en {BIZ}: reservá tu lugar.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'EARLY', headline: 'Entradas más baratas hoy',
      subline: 'Precio especial hasta agotar stock.', cta: 'Comprar ahora',
      caption: 'Atención, que esto es posta 👇\n\nEntradas anticipadas para {BIZ} con precio especial.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'La fiesta sale mejor así',
      subline: '3 tips de quienes organizan siempre.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para que tu fiesta salga perfecta, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'ASÍ FUE', headline: 'Qué noche la de ayer',
      subline: 'Así se vivió la última fecha.', cta: 'Ver próxima fecha',
      caption: 'Así se vivió la última 🔥\n\nPróxima fecha de {BIZ}: no te la pierdas.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'MESA VIP', headline: 'Tu mesa VIP te espera',
      subline: 'Reservá tu espacio para la próxima fecha.', cta: 'Reservar mesa',
      caption: 'Che, mirá esto 👀\n\nMesas VIP disponibles en {BIZ}.\n\nEscribinos por DM y te la reservamos 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Entradas dobles gratis',
      subline: 'Sorteamos un par de entradas.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nEntradas dobles para la próxima fecha.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  tecnologia: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Llegó el último modelo',
      subline: 'Lo tenemos disponible desde hoy.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nEl último modelo ya disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', headline: 'La oferta de la semana',
      subline: 'Precio especial solo estos días.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nOferta semanal en {BIZ}: precios especiales.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Sacale más provecho',
      subline: '3 trucos que casi nadie conoce.', cta: 'Ver los trucos',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 trucos para tu equipo, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'TRADE-IN', headline: 'Traé tu usado',
      subline: 'Te lo tomamos en parte de pago.', cta: 'Consultar',
      caption: 'Atención, que esto es posta 👇\n\nPlan canje en {BIZ}: tu usado vale más acá.\n\nComentá INFO y te cotizamos 👇' },
    { kind: 'social', tag: 'REVIEW', headline: 'Lo probamos por vos',
      subline: 'Nuestra review honesta del último lanzamiento.', cta: 'Ver review',
      caption: 'Lo probamos por vos 📱\n\nReview honesta en {BIZ}, sin vueltas.\n\nGuardá este post 🔖' },
    { kind: 'reserva', tag: 'SOPORTE', headline: 'Soporte sin vueltas',
      subline: 'Diagnosticamos tu equipo gratis.', cta: 'Pedir turno',
      caption: 'Che, mirá esto 👀\n\nSoporte técnico en {BIZ}: tu equipo listo en 24h.\n\nEscribinos por DM 📩' },
  ],
  deco: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Nueva colección en casa',
      subline: 'Piezas que transforman cualquier ambiente.', cta: 'Quiero verla',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNueva colección en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'LIQUIDACIÓN', headline: 'Hasta 40% off',
      subline: 'Liquidación solo por esta semana.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nHasta 40% off en {BIZ}: liquidación de temporada.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Ideas para tu living',
      subline: '3 cambios simples con gran impacto.', cta: 'Ver las ideas',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 ideas deco para tu casa, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'AMBIENTES', headline: 'Espacios que inspiran',
      subline: 'Ambientes reales de nuestros clientes.', cta: 'Ver más',
      caption: 'Espacios reales, piezas nuestras ✨\n\nInspiración deco de {BIZ} para tu casa.\n\nGuardá este post 🔖' },
    { kind: 'reserva', tag: 'ASESORÍA', headline: 'Asesoría sin cargo',
      subline: 'Te ayudamos a elegir, gratis.', cta: 'Pedir asesoría',
      caption: 'Mirá lo que tenemos para vos ✨\n\nAsesoría deco gratis en {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Kit deco de regalo',
      subline: 'Sorteamos un kit para tu living.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn kit deco completo para tu living.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  joyeria: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Piezas nuevas disponibles',
      subline: 'La colección que estabas esperando.', cta: 'Quiero verla',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNueva colección en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', headline: 'Semana con brillo propio',
      subline: 'Descuentos especiales solo estos días.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nSemana dorada en {BIZ}: descuentos especiales.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Que duren para siempre',
      subline: 'Cómo cuidar tus piezas favoritas.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\nCómo cuidar tus piezas, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'ELEGIDAS', headline: 'Las favoritas de todas',
      subline: 'Las piezas más elegidas del mes.', cta: 'Ver colección',
      caption: 'Las más elegidas ✨\n\nLas piezas favoritas de {BIZ}, esta semana.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'CITA', headline: 'Elegí con ayuda experta',
      subline: 'Probate todo con asesoramiento.', cta: 'Pedir cita',
      caption: 'Che, mirá esto 👀\n\nAtención personalizada en {BIZ}: probate todo tranquila.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Un anillo de oro gratis',
      subline: 'Sorteamos una pieza única.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn anillo único. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  fotografia: [
    { kind: 'novedad', tag: 'PORTFOLIO', headline: 'Nuevo trabajo publicado',
      subline: 'Mirá la última sesión completa.', cta: 'Ver más',
      caption: 'Che, mirá esto 👀\n\nNuevo trabajo de {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'SESIÓN', headline: 'Tu sesión esta semana',
      subline: 'Reservá tu fecha antes de que se llene.', cta: 'Reservar fecha',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu sesión en {BIZ}: fechas abiertas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'Salí mejor en fotos',
      subline: '3 tips que usan los profesionales.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de foto con celular, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'BACKSTAGE', headline: 'Detrás de cámara',
      subline: 'Así trabajamos en cada sesión.', cta: 'Ver más',
      caption: 'El backstage que no ves 📸\n\nAsí trabajamos en {BIZ}.\n\nReservá tu sesión por DM 📩' },
    { kind: 'promo', tag: 'MINI', headline: 'Mini sesiones disponibles',
      subline: 'Sesiones cortas a precio especial.', cta: 'Quiero la mía',
      caption: 'Atención, que esto es posta 👇\n\nMini sesiones en {BIZ}: 30 minutos, precio especial.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Sesión gratis',
      subline: 'Sorteamos una sesión completa.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna sesión de fotos completa, gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  profesionales: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Un servicio más para vos',
      subline: 'Asesoramiento a tu medida.', cta: 'Consultar ahora',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'CONSULTA', headline: 'Te escuchamos gratis',
      subline: 'Primera consulta sin cargo.', cta: 'Pedir consulta',
      caption: 'Atención, que esto es posta 👇\n\nPrimera consulta en {BIZ}: te escuchamos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Antes de decidir, leé esto',
      subline: '3 consejos que te ahorran dolores de cabeza.', cta: 'Ver los consejos',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 consejos clave, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'CASOS', headline: 'Un caso real, un resultado real',
      subline: 'Cómo ayudamos a un cliente como vos.', cta: 'Quiero lo mismo',
      caption: 'Caso real, resultado real 📈\n\nCómo ayudamos a un cliente en {BIZ}.\n\nComentá INFO y conversamos 👇' },
    { kind: 'promo', tag: 'DIAGNÓSTICO', headline: 'Tu caso, analizado gratis',
      subline: 'Diagnóstico sin cargo.', cta: 'Pedir el mío',
      caption: 'Atención, que esto es posta 👇\n\nDiagnóstico gratis en {BIZ}: analizamos tu caso.\n\nEscribinos por DM 📩' },
    { kind: 'tip', tag: 'TIP', headline: 'Los errores que salen caros',
      subline: 'Y cómo evitarlos a tiempo.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\nLos errores más caros (y cómo evitarlos), por {BIZ}.\n\nGuardá este post 🔖' },
  ],
  flores: [
    { kind: 'novedad', tag: 'TEMPORADA', headline: 'Lo más lindo de la estación',
      subline: 'Flores de temporada recién llegadas.', cta: 'Quiero verlas',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nFlores de temporada en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'RAMO', headline: 'Ramo con envío gratis',
      subline: 'Esta semana, el envío va por la casa.', cta: 'Pedir el mío',
      caption: 'Atención, que esto es posta 👇\n\nEnvío gratis en ramos esta semana en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'Que vivan más tiempo',
      subline: 'Que tus plantas vivan más.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de riego y cuidado, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'ENTREGAS', headline: 'Felicidad entregada',
      subline: 'Nuestros ramos en manos felices.', cta: 'Pedir el mío',
      caption: 'Así llegan nuestros ramos 💐\n\nFelicidad entregada por {BIZ}.\n\nPedí el tuyo por DM 📩' },
    { kind: 'reserva', tag: 'EVENTOS', headline: 'Tu día, en flores',
      subline: 'Decoración floral para tu día especial.', cta: 'Consultar',
      caption: 'Che, mirá esto 👀\n\nFlores para eventos en {BIZ}: tu día, hermoso.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Un ramo por semana',
      subline: 'Sorteamos un ramo cada semana.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn ramo fresco cada semana.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  bar: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'La birra que esperabas',
      subline: 'Nueva tirada de la casa, desde hoy.', cta: 'Vengo hoy',
      caption: 'Che, mirá esto 👀\n\nNueva birra de la casa en {BIZ}.\n\nEtiquetá a quien lo necesita 🙋' },
    { kind: 'promo', tag: 'HAPPY HOUR', headline: '2x1 de 18 a 20',
      subline: 'Happy hour todos los días.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nHappy hour en {BIZ}: 2x1 todos los días.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'social', tag: 'LA CASA', headline: 'Tu mesa de siempre',
      subline: 'El punto de encuentro no cambia.', cta: 'Reservar mesa',
      caption: 'Mirá lo que tenemos para vos ✨\n\nEl punto de encuentro de siempre: {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'tip', tag: 'TIP', headline: 'Encontrá tu estilo',
      subline: 'Guía cervecera: qué birra va con vos.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nGuía cervecera de {BIZ}: encontrá tu estilo.\n\nGuardá este post 🔖' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Una ronda de regalo',
      subline: 'Sorteamos una ronda para tu mesa.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna ronda gratis para tu mesa.\n\nComentá PARTICIPO y ya estás adentro 👇' },
    { kind: 'reserva', tag: 'CUMPLES', headline: 'Festejá tu cumple acá',
      subline: 'Tu cumple con beneficios para el grupo.', cta: 'Reservar fecha',
      caption: 'Che, mirá esto 👀\n\nFestejá tu cumple en {BIZ}: beneficios para todo el grupo.\n\nEscribinos por DM 📩' },
  ],
  otro: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'Lo nuevo de la semana',
      subline: 'Ya está disponible, vení a verlo.', cta: 'Quiero saber más',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nLa novedad de la semana en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'PROMO', headline: 'Beneficio para seguidores',
      subline: 'Promo exclusiva por tiempo limitado.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nPromo especial para seguidores de {BIZ}. Por tiempo limitado.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: '3 consejos de expertos',
      subline: 'Directo a tu feed, para guardar.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips clave por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'CLIENTES', headline: 'Lo que dicen de nosotros',
      subline: 'Clientes que nos recomiendan.', cta: 'Conocernos',
      caption: 'Gracias por recomendarnos ✨\n\nLo que dicen nuestros clientes de {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'CONSULTA', headline: 'Hablemos sin compromiso',
      subline: 'Primera consulta sin cargo.', cta: 'Agendar charla',
      caption: 'Che, mirá esto 👀\n\nPrimera consulta sin cargo en {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', headline: 'Un premio cada mes',
      subline: 'Sorteo mensual para seguidores.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nTodos los meses sorteamos algo lindo.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
};

// Para "tú", titulares sin voseo
const TU_HEADLINES = {
  'VENÍ HOY': 'VEN HOY',
  'EMPEZÁ HOY': 'EMPIEZA HOY',
  'RESERVÁ TU TURNO': 'RESERVA TU TURNO',
  'RESERVÁ TU SESIÓN': 'RESERVA TU SESIÓN',
  'Vení con una amiga': 'Ven con una amiga',
  'Visitala esta semana': 'Visítala esta semana',
  'Festejá tu cumple acá': 'Festeja tu cumple aquí',
  'Elegí con ayuda experta': 'Elige con ayuda experta',
  'Traé tu usado': 'Trae tu usado',
  'Sacale más provecho': 'Sácale más provecho',
  'Evitá gastos grandes': 'Evita gastos grandes',
  'Aprendé más rápido': 'Aprende más rápido',
  'Viajá 2x1': 'Viaja 2x1',
  'Viajá como un experto': 'Viaja como un experto',
  'Encontrá tu estilo': 'Encuentra tu estilo',
  'Acá no entrenás solo': 'Aquí no entrenas solo',
  'Mirá este antes y después': 'Mira este antes y después',
  'Vení a conocer gratis': 'Ven a conocer gratis',
  'Un servicio más para vos': 'Un servicio más para ti',
  'Salí mejor en fotos': 'Sal mejor en fotos',
  'Lo resolvemos por vos': 'Lo resolvemos por ti',
  'Lo probamos por vos': 'Lo probamos por ti',
  'Arreglalo vos mismo': 'Arréglalo tú mismo',
  'Antes de decidir, leé esto': 'Antes de decidir, lee esto',
  'Antes de comprar, leé esto': 'Antes de comprar, lee esto',
};

// ---------- Objetivo del visitante ("¿Qué querés lograr?") ----------
// Detección simple por palabras clave: reordena los temas para que el más
// relevante vaya primero, y suma su frase al caption del primer posteo.
function sanitizeGoal(g) {
  return String(g || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const GOAL_RULES = [
  { kind: 'promo', kws: ['promo', 'descuento', 'oferta', '2x1', 'off', 'liquidaci', 'vender', 'venta', 'vend'] },
  { kind: 'reserva', kws: ['reserva', 'turno', 'cita', 'visita'] },
  { kind: 'novedad', kws: ['nuevo', 'nueva', 'lanzamiento', 'lleg'] },
  { kind: 'sorteo', kws: ['sorteo'] },
];

function applyGoal(topics, goal) {
  const clean = sanitizeGoal(goal);
  if (!clean) return { topics, goalLine: '' };
  const g = clean.toLowerCase();
  let ordered = topics;
  for (const r of GOAL_RULES) {
    const i = topics.findIndex((t) => t.kind === r.kind);
    if (i >= 0 && r.kws.some((k) => g.includes(k))) {
      if (i > 0) ordered = [topics[i], ...topics.slice(0, i), ...topics.slice(i + 1)];
      break;
    }
  }
  const short = clean.length > 140 ? clean.slice(0, 140).trimEnd() + '…' : clean;
  return { topics: ordered, goalLine: '\nTal como pediste: ' + short };
}

// ---------- Render con PIL (Python3) ----------
let _pythonOk = null;
function pythonAvailable() {
  if (_pythonOk !== null) return _pythonOk;
  try {
    execFileSync('python3', ['-c', 'import PIL.Image'], { timeout: 20000, stdio: 'ignore' });
    _pythonOk = true;
  } catch (_) {
    _pythonOk = false;
  }
  return _pythonOk;
}

function runDemoRender(args, timeoutMs = 90000) {
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

// El 3er posteo sale como video: demo_video.py renderiza los frames con PIL
// (zoom suave Ken Burns, 6 segundos, 1080×1350) y los codifica a MP4 con ffmpeg.
function renderDemoVideo(pngPath, runDir, idx) {
  return new Promise((resolve, reject) => {
    const out = path.join(runDir, `post-${idx == null ? 2 : idx}.mp4`);
    execFile('python3', [DEMO_VIDEO_SCRIPT, pngPath, out, '6'], (err, stdout, stderr) => {
      if (err) return reject(new Error('video: ' + String(stderr || err.message).slice(0, 200)));
      try { resolve(fs.readFileSync(out)); }
      catch (e) { reject(e); }
    });
  });
}

// ---------- Orquestador ----------
// count: cantidad de posteos a generar (3 = demo clásica 2+1; 5 = semana de prueba Pro)
async function generateDemo({ business, category, country, tone, photoPath, goal, accent, btn, count }) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  const n = Math.min(Math.max(parseInt(count, 10) || 3, 1), 6);
  const cat = CATEGORIES.includes(category) ? category : 'otro';
  const { topics: allTopics, goalLine } = applyGoal(DEMO_TOPICS[cat], goal);
  const topics = allTopics.slice(0, n);
  const bar = String(business || '').toUpperCase().slice(0, 26) || 'TU NEGOCIO';

  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-demo-'));
  try {
    // n estilos distintos al azar de la libreria de 9 + n fotos distintas.
    const stylePool = ['promo', 'editorial', 'nocturno', 'bloque', 'marco', 'sello', 'cita', 'tipografico', 'oferta'];
    for (let i = stylePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [stylePool[i], stylePool[j]] = [stylePool[j], stylePool[i]];
    }
    const stylesN = stylePool.slice(0, n);
    // 'cita' es un testimonio con estrellas: solo tiene sentido con kind 'social'.
    // Si le toca a otro kind (ej. una promo citada con 5 estrellas), se reemplaza
    // por un estilo libre y, si hay topic social, la cita va para el.
    const socialIdx = topics.findIndex((t) => t.kind === 'social');
    const citaIdx = stylesN.indexOf('cita');
    if (citaIdx >= 0 && topics[citaIdx].kind !== 'social') {
      // stylePool tiene 9 estilos y n <= 6: stylePool.slice(n) son los no usados.
      const repl = stylePool.slice(n).find((s) => s !== 'cita') || 'editorial';
      stylesN[citaIdx] = repl;
      if (socialIdx >= 0) stylesN[socialIdx] = 'cita';
    }
    const stockN = photoPath ? null : stockPhotosN(cat, n, business);
    const focuses = Array.from({ length: n }, (_, i) => 0.3 + (i % 4) * 0.13);
    const posts = topics.map((t, i) => {
      // Foto: la del usuario si la subió (misma en los n); si no, n fotos
      // distintas del pool creible del rubro, con encuadre variado.
      const photo = photoPath || stockN[i];
      let headline = t.headline;
      let subline = t.subline;
      if (tone === 'tu') {
        headline = TU_HEADLINES[headline] || headline;
        subline = toTu(subline);
      }
      return {
        photo,
        style: stylesN[i],
        focus: focuses[i],
        pill: t.tag,
        bar,
        headline,
        subline,
        cta: t.cta,
        watermark: 'Hecho con Posta',
      };
    });

    const specPath = path.join(runDir, 'spec.json');
    fs.writeFileSync(specPath, JSON.stringify({ fonts_dir: FONTS_DIR, colors: demoColors(accent, btn), posts }));
    await runDemoRender([DEMO_SCRIPT, specPath, runDir]);

    const made = topics.map((t, i) => {
      const buf = fs.readFileSync(path.join(runDir, `post-${i}.png`));
      let caption = t.caption.split('{BIZ}').join(business);
      if (i === 0 && goalLine) caption += goalLine;
      if (tone === 'tu') caption = toTu(caption);
      return {
        image: 'data:image/png;base64,' + buf.toString('base64'),
        caption,
        hashtags: demoHashtags(cat, country, tone),
      };
    });

    // El 3er posteo sale como video (el diseño del medio, animado con zoom suave).
    // El video es el momento "wow" de la semana: si el render falla, se reintenta
    // con backoff antes de caer al fallback de imagen. Si igual falla, se registra
    // con un log bien visible (nunca en silencio).
    const videoIdx = Math.min(2, n - 1);
    let videoB64 = null;
    const videoWaits = [1500, 3000, 6000];
    for (let attempt = 0; attempt < 4 && !videoB64; attempt++) {
      try {
        const vbuf = await renderDemoVideo(path.join(runDir, `post-${videoIdx}.png`), runDir, videoIdx);
        videoB64 = vbuf.toString('base64');
      } catch (e) {
        console.error('[posta] Video de la demo falló (intento ' + (attempt + 1) + '/4):', e.message);
        if (attempt < 3) await new Promise((r) => setTimeout(r, videoWaits[attempt]));
      }
    }
    if (!videoB64) console.error('[posta] ⚠️ VIDEO FALLÓ TRAS 4 INTENTOS — la semana sale sin video (fallback a imagen)');

    return made.map((m, i) => (
      i === videoIdx && videoB64
        ? { type: 'video', video: 'data:video/mp4;base64,' + videoB64, caption: m.caption, hashtags: m.hashtags }
        : { type: 'image', image: m.image, caption: m.caption, hashtags: m.hashtags }
    ));
  } finally {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
  }
}

module.exports = {
  parseMultipart,
  validImageKind,
  checkRateLimit,
  clientIp,
  generateDemo,
  toTu,
  demoHashtags,
  DEMO_TOPICS,
  DEMO_LIMIT_PER_DAY,
  MAX_FILE_BYTES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_PHOTOS,
  COUNTRIES,
};
