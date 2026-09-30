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
const https = require('https');
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
  'deco', 'joyeria', 'fotografia', 'profesionales', 'flores', 'bar',
  'cafeteria', 'barberia', 'servicios', 'viajes', 'arte', 'otro',
];
const CATEGORY_LABELS = {
  moda: 'Moda / Tienda de ropa',
  gastronomia: 'Gastronomía / Restaurante',
  belleza: 'Belleza / Estética',
  barberia: 'Barbería / Peluquería',
  cafeteria: 'Cafetería',
  fitness: 'Fitness / Gimnasio',
  mascotas: 'Mascotas / Veterinaria',
  salud: 'Salud / Odontología',
  hogar: 'Servicios para el hogar',
  inmobiliaria: 'Inmobiliaria',
  autos: 'Autos / Taller',
  educacion: 'Educación / Cursos',
  turismo: 'Turismo / Hotelería',
  viajes: 'Agencia de viajes',
  eventos: 'Eventos / Fiestas',
  tecnologia: 'Tecnología / Celulares',
  deco: 'Muebles / Decoración',
  joyeria: 'Joyería / Accesorios',
  fotografia: 'Fotografía',
  arte: 'Arte / Diseño',
  profesionales: 'Servicios profesionales',
  servicios: 'Servicios',
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
      LIFE = fam('lifestyle', 6), BAR = fam('bar', 5);
// OJO: office-3 y office-5 son fotos de un consultorio DENTAL (mal etiquetadas
// como "oficina"): solo las usa el rubro salud. El resto de los rubros usa
// la oficina genérica, para que un dentista nunca aparezca en otro negocio.
const OFFICE = ['office', 'office-1', 'office-2', 'office-4'],
      DENTAL = ['office-3', 'office-5'],
      TECH = fam('tech', 3);

// Pool curado solo para cafés: si el nombre del negocio suena a café,
// usamos únicamente fotos creíbles de café (nada de cerveza, ensaladas
// ni lifestyle genérico). Un café con foto de cerveza rompe la magia.
const CAFE_POOL = ['food', 'food-2', 'food-4', 'lifestyle', 'lifestyle-1', 'food-1'];
const CAFE_RE = /caf[eé]|coffee|cafeter[ií]a|barista|tostadur[ií]a|espresso|cappuccino|latte|pasteler[ií]a|panader[ií]a|brunch|medialuna|churro|desayuno|merienda/i;
function isCafeBusiness(business) { return CAFE_RE.test(String(business || '')); }

const CATEGORY_PHOTOS = {
  moda: [...FASHION, ...LIFE.slice(0, 2), ...BEAUTY.slice(0, 2)],
  joyeria: [...FASHION.slice(0, 4), 'fashion-5', ...BEAUTY, ...LIFE.slice(0, 2)],
  gastronomia: [...FOOD, ...LIFE.slice(0, 2)],
  bar: [...BAR, ...FOOD.slice(0, 3), ...LIFE.slice(0, 2)],
  belleza: [...BEAUTY, ...FASHION.slice(0, 2), ...LIFE.slice(0, 2)],
  fitness: [...FITNESS, ...LIFE.slice(0, 3), ...HOME.slice(0, 2)],
  mascotas: [...PETS, ...HOME.slice(0, 3), ...LIFE.slice(0, 2)],
  hogar: [...HOME, ...LIFE.slice(0, 2), ...OFFICE.slice(0, 2)],
  deco: [...HOME, ...LIFE.slice(0, 2), ...OFFICE.slice(0, 2)],
  flores: [...HOME.slice(0, 6), ...BEAUTY.slice(0, 3), 'beauty-5', ...LIFE.slice(0, 3)],
  inmobiliaria: [...HOME.slice(0, 5), ...OFFICE.slice(0, 3), ...LIFE.slice(0, 2)],
  salud: [...DENTAL, ...OFFICE.slice(0, 2), ...BEAUTY.slice(0, 3), ...LIFE.slice(0, 3)],
  profesionales: [...OFFICE, ...HOME.slice(0, 2), ...LIFE.slice(0, 3)],
  educacion: [...OFFICE, ...LIFE.slice(0, 3), ...HOME.slice(0, 2)],
  tecnologia: [...TECH, ...OFFICE.slice(0, 2)],
  turismo: [...LIFE, ...BAR.slice(0, 2), ...FOOD.slice(0, 2)],
  eventos: [...BAR, ...LIFE.slice(0, 5), ...FOOD.slice(0, 2)],
  fotografia: [...LIFE.slice(0, 5), ...FASHION.slice(0, 4), ...OFFICE.slice(0, 2)],
  autos: [...OFFICE.slice(0, 4), ...LIFE.slice(0, 5), 'lifestyle-6', ...HOME.slice(0, 2)],
  cafeteria: [...FOOD.slice(0, 5), ...LIFE.slice(0, 4), ...BAR.slice(0, 2)],
  barberia: [...BEAUTY.slice(0, 5), ...FASHION.slice(0, 5), ...LIFE.slice(0, 2)],
  servicios: [...OFFICE.slice(0, 4), ...HOME.slice(0, 5), ...LIFE.slice(0, 2)],
  viajes: [...LIFE, ...BAR.slice(0, 3), ...FOOD.slice(0, 2)],
  arte: [...FASHION.slice(0, 4), 'fashion-5', ...BEAUTY.slice(0, 4), 'beauty-5', ...LIFE.slice(0, 3)],
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
  cafeteria: ['#cafeargentina', '#cafe', '#barista', '#merienda', '#cafedeespecialidad'],
  barberia: ['#barberiaargentina', '#barbero', '#corte', '#fade', '#barbershop'],
  servicios: ['#serviciosargentina', '#oficios', '#tecnico', '#reparaciones', '#presupuestos'],
  viajes: ['#viajesargentina', '#agenciadeviajes', '#turismo', '#escapadas', '#viajeros'],
  arte: ['#arteargentino', '#artista', '#obrasdearte', '#arte', '#diseño'],
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
  cafeteria: ['#cafe', '#barista', '#merienda', '#coffeetime', '#cafedeespecialidad'],
  barberia: ['#barberia', '#barbero', '#fade', '#cortemasculino', '#barbershop'],
  servicios: ['#servicios', '#oficios', '#reparaciones', '#tecnico', '#presupuesto'],
  viajes: ['#viajes', '#agenciadeviajes', '#turismo', '#viajeros', '#escapadas'],
  arte: ['#arte', '#artista', '#obrasdearte', '#diseno', '#art'],
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
    { kind: 'novedad', tag: 'NUEVO', photo: 'fashion-1', headline: 'Lo nuevo que siempre se agota',
      subline: 'La colección más esperada ya está disponible.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nEl nuevo ingreso de la semana en {BIZ} ya está disponible.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'PROMO', photo: 'fashion-2', headline: 'El descuento de esta semana',
      subline: 'Solo por estos días, después vuelve a su precio.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nLa promo de la semana en {BIZ} viene con descuento especial. Solo por estos días.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'fashion-3', headline: 'El error que arruina tu look',
      subline: 'Y cómo evitarlo en 5 minutos.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para armar tu look con lo nuevo de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'fashion', headline: 'Sorteo: un look completo',
      subline: 'Participar es gratis, solo comentá.', cta: 'Quiero participar',
      caption: 'Se viene sorteo en {BIZ} 🎁\n\nSorteamos un look completo entre quienes comenten. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
    { kind: 'social', tag: 'CLIENTAS', photo: 'fashion-5', headline: 'Así lo usan ellas',
      subline: 'Clientas reales con lo nuevo de la semana.', cta: 'Ver más looks',
      caption: 'Nada como verlo puesto ✨\n\nNuestras clientas armando looks con lo nuevo de {BIZ}.\n\nEtiquetá a tu amiga que necesita esto 🙋' },
    { kind: 'promo', tag: 'OUTLET', photo: 'fashion-6', headline: 'Outlet: hasta 50% off',
      subline: 'Selección limitada, hasta agotar stock.', cta: 'Ver selección',
      caption: 'Atención, que esto es posta 👇\n\nHasta 50% off en selección outlet de {BIZ}. Cuando se acaba, se acaba.\n\nEscribinos por DM antes de que vuele 📩' },
  ],
  gastronomia: [
    { kind: 'social', tag: 'EL FAVORITO', photo: 'food-5', photoCafe: 'food-1', headline: 'El plato que todos repiten',
      subline: 'El más pedido de la casa, por algo será.', cta: 'Lo quiero probar',
      caption: 'Che, mirá esto 👀\n\nEl plato más pedido de {BIZ}, el que todos recomiendan.\n\nEtiquetá a quien lo necesita 🙋' },
    { kind: 'promo', tag: '2X1', photo: 'food-6', photoCafe: 'food-2', headline: '2x1 en tu favorito',
      subline: 'Esta semana, el segundo va por la casa.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nPromo 2x1 esta semana en {BIZ}. Vení con quien quieras.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'reserva', tag: 'HOY', photo: 'food-1', headline: 'Tu mesa de hoy te espera',
      subline: 'Tres motivos para pasar hoy mismo.', cta: 'Voy hoy',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 motivos para venir hoy a {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'novedad', tag: 'NUEVO', photo: 'food-3', photoCafe: 'food', headline: 'Recién salido de la cocina',
      subline: 'El plato que se va a volver tu favorito.', cta: 'Lo quiero probar',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo plato en {BIZ}: vení a probarlo esta semana.\n\nReservá tu mesa por DM 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'food', headline: 'La combinación que no falla',
      subline: 'Qué pedir con cada plato.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nLa guía de maridaje de {BIZ}: qué pedir con cada plato.\n\nGuardá este post para tu próxima visita 🔖' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'food-4', headline: 'Cena para dos, de regalo',
      subline: 'Sorteamos una cena completa con postre.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna cena para dos, con postre incluido. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  belleza: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'beauty-5', headline: 'Tu momento de cuidado',
      subline: 'Lo último en cuidado personal, ya disponible.', cta: 'Quiero probarlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio disponible en {BIZ}. Tu momento de cuidado empieza acá.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'TURNO', photo: 'beauty-2', headline: 'Tu turno de esta semana',
      subline: 'Reservalo antes de que se llene.', cta: 'Reservar ahora',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu turno de esta semana en {BIZ} antes de que se llene.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'beauty-4', headline: 'Lo que tu piel necesita',
      subline: 'Consejos de expertos para cuidarte en casa.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de cuidado en casa, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'COMBO', photo: 'beauty-1', headline: 'Vení con una amiga',
      subline: 'Vení con una amiga y ahorran las dos.', cta: 'Lo quiero',
      caption: 'Atención, que esto es posta 👇\n\nCombo amiga en {BIZ}: reservan juntas y ahorran las dos.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'social', tag: 'ANTES/DESPUÉS', photo: 'beauty-6', headline: 'El cambio se nota',
      subline: 'Resultados reales de esta semana, sin filtros.', cta: 'Quiero mi cambio',
      caption: 'Mirá este cambio ✨\n\nResultados reales en {BIZ}, sin filtros.\n\nReservá tu turno por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'beauty-3', headline: 'Un día de spa gratis',
      subline: 'Sorteamos una sesión completa.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn día de spa completo. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  fitness: [
    { kind: 'novedad', tag: 'HOY', photo: 'fitness-5', headline: 'El cambio empieza hoy',
      subline: 'Una sola clase puede cambiarlo todo.', cta: 'Empezar ahora',
      caption: 'Che, mirá esto 👀\n\nEmpezá hoy tu cambio en {BIZ}. La primera decisión es la más importante.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'GRATIS', photo: 'fitness-3', headline: 'Tu primera clase gratis',
      subline: 'Sin compromiso, solo vení a probar.', cta: 'Quiero mi clase',
      caption: 'Atención, que esto es posta 👇\n\nProbá una clase gratis en {BIZ}, sin compromiso.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'fitness-1', headline: 'El error que frena tu progreso',
      subline: 'Los 3 más comunes y cómo evitarlos.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 errores comunes al entrenar (y cómo evitarlos), por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'COMUNIDAD', photo: 'fitness-4', headline: 'Acá no entrenás solo',
      subline: 'La comunidad que te empuja a seguir.', cta: 'Sumarme',
      caption: 'Acá no entrenás solo 💪\n\nLa comunidad de {BIZ} te espera: entrenamientos, desafíos y buena onda.\n\nEscribinos por DM y arrancá 📩' },
    { kind: 'promo', tag: 'PLAN', photo: 'fitness', headline: 'Tu año al mejor precio',
      subline: '-20% en el plan anual, solo esta semana.', cta: 'Lo aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nPlan anual en {BIZ} con 20% off, solo esta semana.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'reserva', tag: 'EVALUACIÓN', photo: 'fitness-2', headline: 'Medimos tu punto de partida',
      subline: 'Evaluación inicial gratis, sin cargo.', cta: 'Pedir la mía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nEvaluación inicial gratis en {BIZ}: sabemos desde dónde empezás.\n\nEscribinos por DM y te la reservamos 📩' },
  ],
  mascotas: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'pets', headline: 'Lo nuevo para tu mascota',
      subline: 'Juguetes, alimento y accesorios recién llegados.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNovedades para tu mascota en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'DESCUENTO', photo: 'pets-1', headline: 'Semana con descuentos',
      subline: 'En alimento y accesorios, solo estos días.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nSemana mascotera en {BIZ}: descuentos en alimento y accesorios.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'pets-2', headline: 'Lo que tu mascota necesita',
      subline: 'Consejos de expertos para cuidarla mejor.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de cuidado para tu mascota, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'CLIENTES', photo: 'pets-4', headline: 'Ternura nivel máximo',
      subline: 'Nuestros clientes de cuatro patas.', cta: 'Ver más',
      caption: 'Nivel de ternura: máximo 🐶\n\nNuestros clientes de cuatro patas, en {BIZ}.\n\nEtiquetá a quien necesita ver esto 🙋' },
    { kind: 'reserva', tag: 'TURNO', photo: 'pets-3', headline: 'Baño y corte esta semana',
      subline: 'Turnos de peluquería canina disponibles.', cta: 'Reservar turno',
      caption: 'Che, mirá esto 👀\n\nTurnos de peluquería canina en {BIZ}, esta semana.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'pets-5', headline: 'Kit completo de regalo',
      subline: 'Sorteamos alimento, juguetes y accesorios.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn kit mascotero completo: alimento, juguetes y accesorios.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  salud: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'office-3', headline: 'Nueva tecnología disponible',
      subline: 'Tratamientos de última generación.', cta: 'Quiero saber más',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo tratamiento disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'TURNO', photo: 'office-5', headline: 'Tu control sin esperas',
      subline: 'Reservá tu turno de este mes.', cta: 'Reservar ahora',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu turno en {BIZ}. Atención personalizada, sin esperas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'lifestyle-2', headline: 'Pequeños cambios, gran salud',
      subline: 'Hábitos simples que recomiendan los expertos.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 hábitos sanos que recomiendan en {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'CHEQUEO', photo: 'office-1', headline: 'Tu chequeo a precio especial',
      subline: 'Control completo, solo este mes.', cta: 'Pedir turno',
      caption: 'Atención, que esto es posta 👇\n\nChequeo anual en {BIZ} a precio especial este mes.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'social', tag: 'CONFIANZA', photo: 'lifestyle-1', headline: 'Gracias por confiar',
      subline: 'Años cuidando tu salud.', cta: 'Conocernos',
      caption: 'Gracias por confiar ✨\n\nAños cuidando la salud de nuestros pacientes en {BIZ}.\n\nPedí tu turno por DM 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'lifestyle', headline: 'Cuándo no esperar',
      subline: 'Señales a las que prestar atención.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nSeñales a las que prestar atención, por los expertos de {BIZ}.\n\nGuardá este post, te puede servir 🔖' },
  ],
  hogar: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'home-2', headline: 'Lo resolvemos por vos',
      subline: 'Nuevo servicio: soluciones sin vueltas.', cta: 'Pedir presupuesto',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio en {BIZ}: lo resolvemos por vos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'PRESUPUESTO', photo: 'home', headline: 'Cotización sin cargo',
      subline: 'Te cotizamos gratis y sin compromiso.', cta: 'Pedir el mío',
      caption: 'Mirá lo que tenemos para vos ✨\n\nPresupuesto gratis en {BIZ}. Contanos qué necesitás y te cotizamos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'home-6', headline: 'Arreglalo vos mismo',
      subline: 'Mantenimiento simple para tu casa.', cta: 'Ver los tips',
      caption: 'Che, mirá esto 👀\n\n3 tips de mantenimiento para tu casa, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'reserva', tag: 'VISITA', photo: 'home-4', headline: 'Vamos a tu casa gratis',
      subline: 'Vamos a tu casa sin cargo.', cta: 'Pedir visita',
      caption: 'Che, mirá esto 👀\n\nVisita técnica sin cargo en {BIZ}: vemos tu casa y te cotizamos.\n\nEscribinos por DM 📩' },
    { kind: 'social', tag: 'TRABAJOS', photo: 'home-1', headline: 'Mirá este antes y después',
      subline: 'Trabajos reales de esta semana.', cta: 'Ver más',
      caption: 'Mirá este cambio ✨\n\nAntes y después de un trabajo real de {BIZ}.\n\nPedí tu presupuesto gratis 👇' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'home-5', headline: 'Kit de herramientas gratis',
      subline: 'Sorteamos un kit completo.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn kit de herramientas completo para tu casa.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  inmobiliaria: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'home-3', headline: 'Entraron nuevas propiedades',
      subline: 'Las últimas en sumarse, miralas primero.', cta: 'Quiero verlas',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevas propiedades disponibles en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'OPORTUNIDAD', photo: 'home', headline: 'Precio especial este mes',
      subline: 'Una oportunidad que no se repite.', cta: 'Me interesa',
      caption: 'Atención, que esto es posta 👇\n\nOportunidad única en {BIZ}: precio especial por tiempo limitado.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'office', headline: 'Antes de comprar, leé esto',
      subline: 'Lo que tenés que saber antes de decidir.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para comprar tu próxima propiedad, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'VENDIDA', photo: 'home-4', headline: 'Otra familia en su hogar',
      subline: 'Vendimos esta semana, la tuya puede ser la próxima.', cta: 'Quiero la mía',
      caption: 'Otra familia feliz 🏡\n\nPropiedad vendida por {BIZ} esta semana.\n\nComentá INFO y encontramos la tuya 👇' },
    { kind: 'reserva', tag: 'VISITA', photo: 'home-1', headline: 'Visitala esta semana',
      subline: 'Coordiná tu visita sin compromiso.', cta: 'Coordinar visita',
      caption: 'Che, mirá esto 👀\n\nVisitas disponibles esta semana en {BIZ}.\n\nEscribinos por DM y coordinamos 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'office-1', headline: 'Crédito hipotecario sin vueltas',
      subline: 'Todo lo que tenés que saber, explicado simple.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nGuía de crédito hipotecario, por los expertos de {BIZ}.\n\nGuardá este post 🔖' },
  ],
  autos: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'office-4', headline: 'Novedades en el taller',
      subline: 'Unidades y servicios que acaban de llegar.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNovedades en {BIZ}: unidades y servicios nuevos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'SERVICE', photo: 'office-1', headline: 'Tu auto en buenas manos',
      subline: 'Service completo: revisión y cambio de aceite.', cta: 'Reservar service',
      caption: 'Atención, que esto es posta 👇\n\nService completo en {BIZ}: revisión, cambio de aceite y más.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'office', headline: 'Evitá gastos grandes',
      subline: '3 tips para cuidar tu auto todos los días.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para cuidar tu auto, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'FINANCIACIÓN', photo: 'lifestyle-4', headline: 'Estrenalo en cuotas',
      subline: 'Cuotas sin interés, a tu medida.', cta: 'Consultar',
      caption: 'Atención, que esto es posta 👇\n\nCuotas sin interés en {BIZ}: estrená tu próximo auto.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'social', tag: 'CLIENTES', photo: 'lifestyle-6', headline: 'Otro 0km en la calle',
      subline: 'Clientes que ya estrenaron.', cta: 'Quiero el mío',
      caption: 'Otro 0km en la calle 🚗\n\nFelicitaciones a quienes confiaron en {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'office-2', headline: 'Service completo gratis',
      subline: 'Sorteamos un service completo.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn service completo gratis para tu auto.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  educacion: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'office-1', headline: 'Inscripciones abiertas',
      subline: 'Inscripciones abiertas, cupos limitados.', cta: 'Quiero inscribirme',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo curso en {BIZ}: inscripciones abiertas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'BECA', photo: 'office', headline: 'Precio de lanzamiento',
      subline: 'Precio especial para los primeros inscriptos.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nDescuento de lanzamiento en {BIZ}, solo para los primeros.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'office-2', headline: 'Aprendé más rápido',
      subline: '3 técnicas que sí funcionan.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para aprender más rápido, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'EGRESADOS', photo: 'office-4', headline: 'Otra camada lo logró',
      subline: 'Nuevos egresados este mes.', cta: 'Sumarme',
      caption: 'Otra camada que lo logró 🎓\n\nEgresados de {BIZ} este mes.\n\nEscribinos por DM e inscribite 📩' },
    { kind: 'reserva', tag: 'CHARLA', photo: 'lifestyle-1', headline: 'Vení a conocer gratis',
      subline: 'Vení a conocer sin compromiso.', cta: 'Anotarme',
      caption: 'Che, mirá esto 👀\n\nCharla informativa gratis en {BIZ}.\n\nEscribinos por DM y te anotamos 📩' },
    { kind: 'promo', tag: '2X1', photo: 'lifestyle-2', headline: '2x1 con tu amigo',
      subline: 'Se inscriben dos, paga uno.', cta: 'Lo aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nEn {BIZ}: traé un amigo y se inscriben 2x1.\n\nComentá INFO y te pasamos todo 👇' },
  ],
  turismo: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'lifestyle-2', headline: 'Un destino nuevo te espera',
      subline: 'Escapadas que te van a encantar.', cta: 'Quiero ir',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo destino disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', photo: 'lifestyle-6', headline: 'Viajá 2x1',
      subline: 'Acompañado se viaja mejor.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nEscapada 2x1 en {BIZ}: viajá acompañado.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'lifestyle', headline: 'Viajá como un experto',
      subline: '3 consejos que hacen la diferencia.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips viajeros por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'VIAJEROS', photo: 'lifestyle-3', headline: 'Así se vive el viaje',
      subline: 'Nuestros viajeros en destino.', cta: 'Quiero viajar',
      caption: 'Así la pasaron nuestros viajeros ✨\n\nPróxima salida con {BIZ}: sumate.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'CUPOS', photo: 'lifestyle-4', headline: 'Quedan pocos lugares',
      subline: 'Quedan pocos lugares para la próxima salida.', cta: 'Reservar lugar',
      caption: 'Che, mirá esto 👀\n\nÚltimos cupos para la próxima salida de {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'lifestyle-1', headline: 'Escapada para dos gratis',
      subline: 'Sorteamos un viaje todo incluido.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna escapada para dos, todo incluido.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  eventos: [
    { kind: 'novedad', tag: 'FECHA', photo: 'bar-4', headline: 'Nueva fecha confirmada',
      subline: 'Ya podés reservar tu lugar.', cta: 'Reservar lugar',
      caption: 'Che, mirá esto 👀\n\nPróxima fecha en {BIZ}: reservá tu lugar.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'EARLY', photo: 'bar-2', headline: 'Entradas más baratas hoy',
      subline: 'Precio especial hasta agotar stock.', cta: 'Comprar ahora',
      caption: 'Atención, que esto es posta 👇\n\nEntradas anticipadas para {BIZ} con precio especial.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'bar-3', headline: 'La fiesta sale mejor así',
      subline: '3 tips de quienes organizan siempre.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para que tu fiesta salga perfecta, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'ASÍ FUE', photo: 'bar-1', headline: 'Qué noche la de ayer',
      subline: 'Así se vivió la última fecha.', cta: 'Ver próxima fecha',
      caption: 'Así se vivió la última 🔥\n\nPróxima fecha de {BIZ}: no te la pierdas.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'MESA VIP', photo: 'bar-5', headline: 'Tu mesa VIP te espera',
      subline: 'Reservá tu espacio para la próxima fecha.', cta: 'Reservar mesa',
      caption: 'Che, mirá esto 👀\n\nMesas VIP disponibles en {BIZ}.\n\nEscribinos por DM y te la reservamos 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'lifestyle-4', headline: 'Entradas dobles gratis',
      subline: 'Sorteamos un par de entradas.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nEntradas dobles para la próxima fecha.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  tecnologia: [
    // Cada tema tiene su foto asignada (no sorteada): el posteo y la foto
    // siempre matchean. tech=smartphone en caja · tech-1=vendedor entregando
    // · tech-2=accesorios · tech-3=técnico reparando.
    { kind: 'novedad', tag: 'NUEVO', photo: 'tech', headline: 'Llegó el último modelo',
      subline: 'Lo tenemos disponible desde hoy.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nEl último modelo ya disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', photo: 'tech-2', headline: 'La oferta de la semana',
      subline: 'Precio especial solo estos días.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nOferta semanal en {BIZ}: precios especiales.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'tech-1', headline: 'Sacale más provecho',
      subline: '3 trucos que casi nadie conoce.', cta: 'Ver los trucos',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 trucos para tu equipo, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'promo', tag: 'TRADE-IN', photo: 'tech-3', headline: 'Traé tu usado',
      subline: 'Te lo tomamos en parte de pago.', cta: 'Consultar',
      caption: 'Atención, que esto es posta 👇\n\nPlan canje en {BIZ}: tu usado vale más acá.\n\nComentá INFO y te cotizamos 👇' },
    { kind: 'social', tag: 'REVIEW', photo: 'office', headline: 'Lo probamos por vos',
      subline: 'Nuestra review honesta del último lanzamiento.', cta: 'Ver review',
      caption: 'Lo probamos por vos 📱\n\nReview honesta en {BIZ}, sin vueltas.\n\nGuardá este post 🔖' },
    { kind: 'reserva', tag: 'SOPORTE', photo: 'office-1', headline: 'Soporte sin vueltas',
      subline: 'Diagnosticamos tu equipo gratis.', cta: 'Pedir turno',
      caption: 'Che, mirá esto 👀\n\nSoporte técnico en {BIZ}: tu equipo listo en 24h.\n\nEscribinos por DM 📩' },
  ],
  deco: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'home-1', headline: 'Nueva colección en casa',
      subline: 'Piezas que transforman cualquier ambiente.', cta: 'Quiero verla',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNueva colección en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'LIQUIDACIÓN', photo: 'home-4', headline: 'Hasta 40% off',
      subline: 'Liquidación solo por esta semana.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nHasta 40% off en {BIZ}: liquidación de temporada.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'home', headline: 'Ideas para tu living',
      subline: '3 cambios simples con gran impacto.', cta: 'Ver las ideas',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 ideas deco para tu casa, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'AMBIENTES', photo: 'home-5', headline: 'Espacios que inspiran',
      subline: 'Ambientes reales de nuestros clientes.', cta: 'Ver más',
      caption: 'Espacios reales, piezas nuestras ✨\n\nInspiración deco de {BIZ} para tu casa.\n\nGuardá este post 🔖' },
    { kind: 'reserva', tag: 'ASESORÍA', photo: 'home-2', headline: 'Asesoría sin cargo',
      subline: 'Te ayudamos a elegir, gratis.', cta: 'Pedir asesoría',
      caption: 'Mirá lo que tenemos para vos ✨\n\nAsesoría deco gratis en {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'home-3', headline: 'Kit deco de regalo',
      subline: 'Sorteamos un kit para tu living.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn kit deco completo para tu living.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  joyeria: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'beauty-6', headline: 'Piezas nuevas disponibles',
      subline: 'La colección que estabas esperando.', cta: 'Quiero verla',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNueva colección en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', photo: 'beauty-5', headline: 'Semana con brillo propio',
      subline: 'Descuentos especiales solo estos días.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nSemana dorada en {BIZ}: descuentos especiales.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'beauty-4', headline: 'Que duren para siempre',
      subline: 'Cómo cuidar tus piezas favoritas.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\nCómo cuidar tus piezas, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'ELEGIDAS', photo: 'fashion-1', headline: 'Las favoritas de todas',
      subline: 'Las piezas más elegidas del mes.', cta: 'Ver colección',
      caption: 'Las más elegidas ✨\n\nLas piezas favoritas de {BIZ}, esta semana.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'CITA', photo: 'beauty-2', headline: 'Elegí con ayuda experta',
      subline: 'Probate todo con asesoramiento.', cta: 'Pedir cita',
      caption: 'Che, mirá esto 👀\n\nAtención personalizada en {BIZ}: probate todo tranquila.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'fashion-5', headline: 'Un anillo de oro gratis',
      subline: 'Sorteamos una pieza única.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn anillo único. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  fotografia: [
    { kind: 'novedad', tag: 'PORTFOLIO', photo: 'lifestyle', headline: 'Nuevo trabajo publicado',
      subline: 'Mirá la última sesión completa.', cta: 'Ver más',
      caption: 'Che, mirá esto 👀\n\nNuevo trabajo de {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'SESIÓN', photo: 'fashion-1', headline: 'Tu sesión esta semana',
      subline: 'Reservá tu fecha antes de que se llene.', cta: 'Reservar fecha',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu sesión en {BIZ}: fechas abiertas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'fashion-3', headline: 'Salí mejor en fotos',
      subline: '3 tips que usan los profesionales.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de foto con celular, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'BACKSTAGE', photo: 'lifestyle-3', headline: 'Detrás de cámara',
      subline: 'Así trabajamos en cada sesión.', cta: 'Ver más',
      caption: 'El backstage que no ves 📸\n\nAsí trabajamos en {BIZ}.\n\nReservá tu sesión por DM 📩' },
    { kind: 'promo', tag: 'MINI', photo: 'lifestyle-4', headline: 'Mini sesiones disponibles',
      subline: 'Sesiones cortas a precio especial.', cta: 'Quiero la mía',
      caption: 'Atención, que esto es posta 👇\n\nMini sesiones en {BIZ}: 30 minutos, precio especial.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'lifestyle-1', headline: 'Sesión gratis',
      subline: 'Sorteamos una sesión completa.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna sesión de fotos completa, gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  profesionales: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'office-1', headline: 'Un servicio más para vos',
      subline: 'Asesoramiento a tu medida.', cta: 'Consultar ahora',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'CONSULTA', photo: 'office-4', headline: 'Te escuchamos gratis',
      subline: 'Primera consulta sin cargo.', cta: 'Pedir consulta',
      caption: 'Atención, que esto es posta 👇\n\nPrimera consulta en {BIZ}: te escuchamos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'office', headline: 'Antes de decidir, leé esto',
      subline: '3 consejos que te ahorran dolores de cabeza.', cta: 'Ver los consejos',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 consejos clave, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'CASOS', photo: 'office-2', headline: 'Un caso real, un resultado real',
      subline: 'Cómo ayudamos a un cliente como vos.', cta: 'Quiero lo mismo',
      caption: 'Caso real, resultado real 📈\n\nCómo ayudamos a un cliente en {BIZ}.\n\nComentá INFO y conversamos 👇' },
    { kind: 'promo', tag: 'DIAGNÓSTICO', photo: 'lifestyle-1', headline: 'Tu caso, analizado gratis',
      subline: 'Diagnóstico sin cargo.', cta: 'Pedir el mío',
      caption: 'Atención, que esto es posta 👇\n\nDiagnóstico gratis en {BIZ}: analizamos tu caso.\n\nEscribinos por DM 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'lifestyle-2', headline: 'Los errores que salen caros',
      subline: 'Y cómo evitarlos a tiempo.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\nLos errores más caros (y cómo evitarlos), por {BIZ}.\n\nGuardá este post 🔖' },
  ],
  flores: [
    { kind: 'novedad', tag: 'TEMPORADA', photo: 'home-4', headline: 'Lo más lindo de la estación',
      subline: 'Flores de temporada recién llegadas.', cta: 'Quiero verlas',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nFlores de temporada en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'RAMO', photo: 'home-5', headline: 'Ramo con envío gratis',
      subline: 'Esta semana, el envío va por la casa.', cta: 'Pedir el mío',
      caption: 'Atención, que esto es posta 👇\n\nEnvío gratis en ramos esta semana en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'home', headline: 'Que vivan más tiempo',
      subline: 'Que tus plantas vivan más.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de riego y cuidado, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'ENTREGAS', photo: 'lifestyle-1', headline: 'Felicidad entregada',
      subline: 'Nuestros ramos en manos felices.', cta: 'Pedir el mío',
      caption: 'Así llegan nuestros ramos 💐\n\nFelicidad entregada por {BIZ}.\n\nPedí el tuyo por DM 📩' },
    { kind: 'reserva', tag: 'EVENTOS', photo: 'beauty-5', headline: 'Tu día, en flores',
      subline: 'Decoración floral para tu día especial.', cta: 'Consultar',
      caption: 'Che, mirá esto 👀\n\nFlores para eventos en {BIZ}: tu día, hermoso.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'home-3', headline: 'Un ramo por semana',
      subline: 'Sorteamos un ramo cada semana.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUn ramo fresco cada semana.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  bar: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'bar', headline: 'La birra que esperabas',
      subline: 'Nueva tirada de la casa, desde hoy.', cta: 'Vengo hoy',
      caption: 'Che, mirá esto 👀\n\nNueva birra de la casa en {BIZ}.\n\nEtiquetá a quien lo necesita 🙋' },
    { kind: 'promo', tag: 'HAPPY HOUR', photo: 'bar-2', headline: '2x1 de 18 a 20',
      subline: 'Happy hour todos los días.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nHappy hour en {BIZ}: 2x1 todos los días.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'social', tag: 'LA CASA', photo: 'bar-4', headline: 'Tu mesa de siempre',
      subline: 'El punto de encuentro no cambia.', cta: 'Reservar mesa',
      caption: 'Mirá lo que tenemos para vos ✨\n\nEl punto de encuentro de siempre: {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'tip', tag: 'TIP', photo: 'bar-1', headline: 'Encontrá tu estilo',
      subline: 'Guía cervecera: qué birra va con vos.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nGuía cervecera de {BIZ}: encontrá tu estilo.\n\nGuardá este post 🔖' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'bar-5', headline: 'Una ronda de regalo',
      subline: 'Sorteamos una ronda para tu mesa.', cta: 'Quiero participar',
      caption: 'Sorteo en {BIZ} 🎁\n\nUna ronda gratis para tu mesa.\n\nComentá PARTICIPO y ya estás adentro 👇' },
    { kind: 'reserva', tag: 'CUMPLES', photo: 'bar-3', headline: 'Festejá tu cumple acá',
      subline: 'Tu cumple con beneficios para el grupo.', cta: 'Reservar fecha',
      caption: 'Che, mirá esto 👀\n\nFestejá tu cumple en {BIZ}: beneficios para todo el grupo.\n\nEscribinos por DM 📩' },
  ],
  cafeteria: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'food-2', headline: 'El blend nuevo ya está en barra',
      subline: 'De origen único, tostado esta semana.', cta: 'Lo quiero probar',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo blend en {BIZ}: de origen único y tostado esta semana.\n\nPasá a probarlo hoy ☕' },
    { kind: 'promo', tag: 'MERIENDA', photo: 'food-4', headline: 'Merienda completa a precio amigo',
      subline: 'Café + dos medialunas, toda la tarde.', cta: 'La aprovecho',
      caption: 'La merienda se respeta 👇\n\nEn {BIZ}: café con leche + dos medialunas a precio amigo, toda la tarde.\n\nEtiquetá a tu compañero de merienda 🙋' },
    { kind: 'tip', tag: 'TIP', photo: 'food', headline: 'Cómo pedir tu café como un barista',
      subline: 'La diferencia entre un flat white y un latte.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\n¿Flat white o latte? Te explicamos la diferencia para que pidas como un barista.\n\nGuardá este post 🔖' },
    { kind: 'social', tag: 'CLIENTES', photo: 'lifestyle-1', headline: 'El rincón favorito del barrio',
      subline: 'Nuestros clientes y su momento café.', cta: 'Ver más',
      caption: 'Nada como el momento café ☕\n\nNuestros clientes disfrutando su rato en {BIZ}.\n\nVení a buscar el tuyo hoy' },
    { kind: 'reserva', tag: 'HOY', photo: 'food-1', headline: 'Tu mesa de la tarde te espera',
      subline: 'El café sale mejor acompañado.', cta: 'Voy hoy',
      caption: 'Mirá lo que tenemos para vos ✨\n\nTu mesa de la tarde te espera en {BIZ}.\n\nReservá por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'lifestyle', headline: 'Sorteo: merienda para dos',
      subline: 'Participar es gratis, solo comentá.', cta: 'Quiero participar',
      caption: 'Se viene sorteo en {BIZ} 🎁\n\nSorteamos una merienda completa para dos. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  barberia: [
    { kind: 'social', tag: 'ANTES / DESPUÉS', photo: 'beauty', headline: 'El antes y después que habla solo',
      subline: 'Cambio de look completo en una visita.', cta: 'Ver más cambios',
      caption: 'Mirá este cambio 👀\n\nAntes y después en {BIZ}: un corte nuevo, una confianza nueva.\n\nReservá tu turno por DM 📩' },
    { kind: 'reserva', tag: 'TURNO', photo: 'beauty-1', headline: 'Tu turno de la semana',
      subline: 'Quedan pocos lugares este finde.', cta: 'Reservar turno',
      caption: 'No te quedes sin tu lugar 💈\n\nTurnos de esta semana en {BIZ}: reservá el tuyo antes de que se llenen.\n\nEscribinos por DM 📩' },
    { kind: 'novedad', tag: 'TENDENCIA', photo: 'fashion-4', headline: 'El corte que es tendencia',
      subline: 'El fade que todos están pidiendo.', cta: 'Lo quiero',
      caption: 'Che, mirá lo que se viene 👀\n\nEl corte tendencia de la temporada ya lo hacemos en {BIZ}.\n\nReservá tu turno 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'beauty-4', headline: 'Cómo mantener el corte entre visitas',
      subline: '3 tips para que dure como recién hecho.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de {BIZ} para que tu corte dure como recién hecho.\n\nGuardá este post 🔖' },
    { kind: 'promo', tag: 'COMBO', photo: 'beauty-2', headline: 'Corte + barba, precio combo',
      subline: 'Salí renovado por menos.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nCombo corte + barba en {BIZ} a precio especial esta semana.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'fashion-1', headline: 'Sorteo: corte gratis',
      subline: 'Participar es gratis, solo comentá.', cta: 'Quiero participar',
      caption: 'Se viene sorteo en {BIZ} 🎁\n\nSorteamos un corte gratis entre quienes comenten.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  servicios: [
    { kind: 'tip', tag: 'TIP', photo: 'office', headline: 'El error que te sale caro',
      subline: 'Lo que nunca hay que hacer con tu instalación.', cta: 'Ver los tips',
      caption: 'Mirá esto antes de que sea tarde ⚠️\n\nEl error más común que vemos en {BIZ} y cómo evitarlo.\n\nGuardá este post, te va a servir 🔖' },
    { kind: 'social', tag: 'TRABAJOS', photo: 'home-2', headline: 'Trabajos que hablan solos',
      subline: 'Antes y después de esta semana.', cta: 'Ver más trabajos',
      caption: 'Mirá lo que hicimos esta semana 👀\n\nAntes y después de un trabajo real de {BIZ}.\n\nPedí tu presupuesto por DM 📩' },
    { kind: 'promo', tag: 'PRESUPUESTO', photo: 'office-1', headline: 'Presupuesto gratis esta semana',
      subline: 'Sin cargo y sin compromiso.', cta: 'Pedir el mío',
      caption: 'Atención 👇\n\nEsta semana el presupuesto es gratis en {BIZ}. Sin cargo, sin compromiso.\n\nComentá INFO y te contactamos 👇' },
    { kind: 'reserva', tag: 'VISITA', photo: 'home-4', headline: 'Reservá tu visita técnica',
      subline: 'Pasamos por tu casa esta semana.', cta: 'Reservar visita',
      caption: 'No lo dejes para después 🔧\n\nReservá tu visita técnica de {BIZ} para esta semana.\n\nEscribinos por DM 📩' },
    { kind: 'novedad', tag: 'NUEVO', photo: 'office-4', headline: 'Nuevo servicio disponible',
      subline: 'Ahora también hacemos instalaciones.', cta: 'Quiero saber más',
      caption: 'Che, mirá la novedad 👀\n\n{BIZ} suma un servicio nuevo: ahora también hacemos instalaciones.\n\nConsultanos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'office-2', headline: 'Sorteo: service gratis',
      subline: 'Participar es gratis, solo comentá.', cta: 'Quiero participar',
      caption: 'Se viene sorteo en {BIZ} 🎁\n\nSorteamos un service completo gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  viajes: [
    { kind: 'novedad', tag: 'DESTINO', photo: 'lifestyle-2', headline: 'El destino que todos van a querer',
      subline: 'La escapada perfecta para el finde largo.', cta: 'Lo quiero conocer',
      caption: 'Che, mirá este destino 👀\n\nLa escapada que todos van a querer, armada por {BIZ}.\n\nConsultanos por DM 📩' },
    { kind: 'promo', tag: 'CUOTAS', photo: 'lifestyle-6', headline: 'Viajá en cuotas sin interés',
      subline: 'Tu próximo viaje, más cerca de lo que creés.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nViajá en cuotas sin interés con {BIZ}. Tu próximo destino, más cerca.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', photo: 'lifestyle-3', headline: 'La mejor época para viajar',
      subline: 'Cuándo ir a cada destino y pagar menos.', cta: 'Ver la guía',
      caption: 'Mirá lo que tenemos para vos ✨\n\nLa guía de {BIZ}: la mejor época para cada destino (y cuándo pagar menos).\n\nGuardá este post 🔖' },
    { kind: 'social', tag: 'VIAJEROS', photo: 'lifestyle-4', headline: 'Ellos ya volvieron felices',
      subline: 'Viajeros reales con nuestros paquetes.', cta: 'Ver más viajes',
      caption: 'Nada como viajar tranquilo ✈️\n\nNuestros viajeros disfrutando su viaje con {BIZ}.\n\nArmá el tuyo por DM 📩' },
    { kind: 'reserva', tag: 'CUPOS', photo: 'lifestyle-1', headline: 'Reservá tu lugar',
      subline: 'Los cupos de temporada vuelan.', cta: 'Reservar ahora',
      caption: 'No te quedes afuera ✈️\n\nLos cupos de temporada en {BIZ} se agotan rápido.\n\nReservá tu lugar por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'lifestyle', headline: 'Sorteo: escapada para dos',
      subline: 'Participar es gratis, solo comentá.', cta: 'Quiero participar',
      caption: 'Se viene sorteo en {BIZ} 🎁\n\nSorteamos una escapada para dos. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  arte: [
    { kind: 'novedad', tag: 'OBRA NUEVA', photo: 'fashion-5', headline: 'Obra nueva disponible',
      subline: 'Pieza única, recién terminada.', cta: 'Quiero verla',
      caption: 'Che, mirá lo que acaba de salir del taller 👀\n\nObra nueva en {BIZ}: pieza única, recién terminada.\n\nEscribinos por DM 📩' },
    { kind: 'tip', tag: 'PROCESO', photo: 'beauty-3', headline: 'El proceso detrás de cada pieza',
      subline: 'Cómo nace una obra, paso a paso.', cta: 'Ver el proceso',
      caption: 'Mirá lo que hay detrás ✨\n\nEl proceso creativo de {BIZ}, paso a paso.\n\nGuardá este post si te inspira 🔖' },
    { kind: 'social', tag: 'EN CASAS REALES', photo: 'fashion-2', headline: 'Ya la tienen en su casa',
      subline: 'Obras nuestras en hogares reales.', cta: 'Ver más obras',
      caption: 'Nada como verla colgada 🎨\n\nNuestras obras en hogares reales. Gracias por confiar en {BIZ}.\n\nPedí la tuya por DM 📩' },
    { kind: 'promo', tag: 'ENCARGOS', photo: 'fashion-3', headline: 'Encargos de este mes con descuento',
      subline: 'Tu idea, hecha obra.', cta: 'Encargar la mía',
      caption: 'Atención 👇\n\nEste mes los encargos en {BIZ} vienen con descuento especial.\n\nComentá INFO y lo charlamos 👇' },
    { kind: 'reserva', tag: 'LISTA', photo: 'beauty-5', headline: 'Reservá tu encargo',
      subline: 'La lista de encargos se llena rápido.', cta: 'Reservar el mío',
      caption: 'No te quedes sin tu lugar 🎨\n\nLa lista de encargos de {BIZ} se llena rápido.\n\nReservá el tuyo por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'fashion-1', headline: 'Sorteo: una obra de regalo',
      subline: 'Participar es gratis, solo comentá.', cta: 'Quiero participar',
      caption: 'Se viene sorteo en {BIZ} 🎁\n\nSorteamos una obra original. Participar es gratis.\n\nComentá PARTICIPO y ya estás adentro 👇' },
  ],
  otro: [
    { kind: 'novedad', tag: 'NUEVO', photo: 'lifestyle-3', headline: 'Lo nuevo de la semana',
      subline: 'Ya está disponible, vení a verlo.', cta: 'Quiero saber más',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nLa novedad de la semana en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'PROMO', photo: 'lifestyle-1', headline: 'Beneficio para seguidores',
      subline: 'Promo exclusiva por tiempo limitado.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nPromo especial para seguidores de {BIZ}. Por tiempo limitado.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', photo: 'office', headline: '3 consejos de expertos',
      subline: 'Directo a tu feed, para guardar.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips clave por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
    { kind: 'social', tag: 'CLIENTES', photo: 'lifestyle-4', headline: 'Lo que dicen de nosotros',
      subline: 'Clientes que nos recomiendan.', cta: 'Conocernos',
      caption: 'Gracias por recomendarnos ✨\n\nLo que dicen nuestros clientes de {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'reserva', tag: 'CONSULTA', photo: 'office-1', headline: 'Hablemos sin compromiso',
      subline: 'Primera consulta sin cargo.', cta: 'Agendar charla',
      caption: 'Che, mirá esto 👀\n\nPrimera consulta sin cargo en {BIZ}.\n\nEscribinos por DM 📩' },
    { kind: 'sorteo', tag: 'SORTEO', photo: 'lifestyle-2', headline: 'Un premio cada mes',
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
    .slice(0, 400);
}

const GOAL_RULES = [
  { kind: 'promo', kws: ['promo', 'descuento', 'oferta', '2x1', 'off', 'liquidaci', 'vender', 'venta', 'vend', 'canje', 'usado', 'trade'] },
  { kind: 'reserva', kws: ['reserva', 'turno', 'cita', 'visita'] },
  { kind: 'novedad', kws: ['nuevo', 'nueva', 'lanzamiento', 'lleg', 'modelo'] },
  { kind: 'sorteo', kws: ['sorteo'] },
  { kind: 'social', kws: ['comunidad', 'clientes', 'fidelizar', 'familia'] },
];
// Objetivo elegido en las preguntas previas de /prueba: se inyecta como
// palabras clave para que el reorder de arriba lo tenga en cuenta siempre.
const GOAL_KEY_KWS = {
  vender: 'vender promo oferta',
  seguidores: 'sorteo seguidores',
  lanzamiento: 'lanzamiento nuevo',
  fidelizar: 'comunidad clientes',
};

// Palabras vacías para extraer frases con sentido del párrafo del cliente.
const GOAL_STOP = new Set(('que de la el los las un una y o en con para por mi mis tu tus su sus del al se me te nos como mas muy tan este esta esto estos estas ese esa hay son es esta estan quiero queremos busco buscamos hago hacemos tengo tenemos vendo vendemos nuestro nuestra nuestros nuestras a e ni pero si no si tambien algo asi hacer hacen ser estoy estan este los del').split(' '));

// Extrae la frase del cliente alrededor de una palabra clave ("plan canje",
// "últimos modelos"): 1 a 3 palabras previas (sin cruzar comas ni puntos) +
// la palabra completa. Devuelve '' si no hay una frase de 2+ palabras usable.
function phraseAround(goal, kw) {
  const clean = sanitizeGoal(goal);
  if (clean.length < 30) return '';
  const low = clean.toLowerCase();
  const k = String(kw).toLowerCase();
  let idx = low.indexOf(k);
  while (idx >= 0) {
    const m = clean.slice(idx).match(/^[a-záéíóúñü]+/i);
    const word = m ? m[0] : kw;
    // Solo las palabras después de la última coma/punto: no cruzar de cláusula.
    const before = clean.slice(0, idx).split(/[.!?;,]+/).pop().split(/\s+/).filter(Boolean)
      .map((w) => w.replace(/^[¿¡"'«(]+|[.,;:!?)"'»)]+$/g, ''));
    // Probar de la frase más corta a la más larga: titulares punchy.
    for (let take = 1; take <= 3 && take <= before.length; take++) {
      const words = [...before.slice(-take), word];
      while (words.length > 1 && GOAL_STOP.has(words[0].toLowerCase())) words.shift();
      const phrase = words.join(' ');
      if (phrase.split(/\s+/).length >= 2 && phrase.length >= 6 && phrase.length <= 42) return phrase;
    }
    idx = low.indexOf(k, idx + 1);
  }
  return '';
}

function applyGoal(topics, goal, goal_key) {
  const clean = sanitizeGoal(goal);
  const keyKws = (goal_key && GOAL_KEY_KWS[goal_key]) ? GOAL_KEY_KWS[goal_key] + ' ' : '';
  if (!clean && !keyKws) return { topics, goalLine: '' };
  const g = (keyKws + clean).toLowerCase();
  let ordered = topics;
  for (const r of GOAL_RULES) {
    const i = topics.findIndex((t) => t.kind === r.kind);
    if (i >= 0 && r.kws.some((k) => g.includes(k))) {
      if (i > 0) ordered = [topics[i], ...topics.slice(0, i), ...topics.slice(i + 1)];
      break;
    }
  }
  // Titular con las palabras del cliente: si el párrafo nombra algo que un
  // posteo también nombra (ej. "plan canje"), ese posteo usa su frase como
  // titular. Solo el primer match, para no recargar.
  let usedPhrase = false;
  const personalized = ordered.map((t) => {
    if (usedPhrase) return t;
    const hay = (t.headline + ' ' + t.caption).toLowerCase();
    for (const r of GOAL_RULES) {
      if (r.kind !== t.kind) continue;
      const kw = r.kws.find((k) => g.includes(k) && hay.includes(k));
      if (!kw) continue;
      const phrase = phraseAround(clean, kw);
      if (!phrase) continue;
      usedPhrase = true;
      return { ...t, headline: phrase.charAt(0).toUpperCase() + phrase.slice(1) };
    }
    return t;
  });
  // Si ya se personalizó un titular, no hace falta el "Tal como pediste".
  if (usedPhrase) return { topics: personalized, goalLine: '' };
  const short = clean.length > 140 ? clean.slice(0, 140).trimEnd() + '…' : clean;
  return { topics: personalized, goalLine: '\nTal como pediste: ' + short };
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
// Construye el spec de diseño (textos, estilos, fotos) sin renderizar.
// Si recibe `base` ({styles, photos}), reusa esos diseños/fotos en vez de
// sortear nuevos: así el recolor cambia SOLO los colores, nada más.
function buildDemoSpec({ business, category, country, tone, photoPath, goal, goal_key, accent, btn, count, base }) {
  const n = Math.min(Math.max(parseInt(count, 10) || 3, 1), 6);
  const cat = CATEGORIES.includes(category) ? category : 'otro';
  const { topics: allTopics, goalLine } = applyGoal(DEMO_TOPICS[cat], goal, goal_key);
  const topics = allTopics.slice(0, n);
  const bar = String(business || '').toUpperCase().slice(0, 26) || 'TU NEGOCIO';

  let stylesN, photos;
  if (base && Array.isArray(base.styles) && base.styles.length >= n && Array.isArray(base.photos) && base.photos.length >= n) {
    stylesN = base.styles.slice(0, n);
    photos = base.photos.slice(0, n);
  } else {
    const stylePool = ['promo', 'editorial', 'nocturno', 'bloque', 'marco', 'sello', 'cita', 'tipografico', 'oferta'];
    for (let i = stylePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [stylePool[i], stylePool[j]] = [stylePool[j], stylePool[i]];
    }
    stylesN = stylePool.slice(0, n);
    const socialIdx = topics.findIndex((t) => t.kind === 'social');
    const citaIdx = stylesN.indexOf('cita');
    if (citaIdx >= 0 && topics[citaIdx].kind !== 'social') {
      const repl = stylePool.slice(n).find((s) => s !== 'cita') || 'editorial';
      stylesN[citaIdx] = repl;
      if (socialIdx >= 0) stylesN[socialIdx] = 'cita';
    }
    const stockN = photoPath ? null : stockPhotosN(cat, n, business);
    // Foto por tema: si el tema trae `photo` asignada se usa esa (matchea el
    // posteo); si no, se sortea del pool evitando repetir la misma foto.
    // En cafés, los temas con `photoCafe` usan la variante de café.
    const isCafe = cat === 'gastronomia' && isCafeBusiness(business);
    const usedPhotos = new Set();
    photos = topics.map((t) => {
      if (photoPath) return { userPhoto: true };
      const key = (isCafe && t.photoCafe) ? t.photoCafe : t.photo;
      if (key) {
        const p = path.join(STOCK_DIR, key + '.webp');
        if (fs.existsSync(p) && !usedPhotos.has(p)) { usedPhotos.add(p); return p; }
      }
      const pick = stockN.find((s) => !usedPhotos.has(s)) || stockN[0];
      usedPhotos.add(pick);
      return pick;
    });
  }
  const focuses = Array.from({ length: n }, (_, i) => 0.3 + (i % 4) * 0.13);
  const specPosts = topics.map((t, i) => {
    let headline = t.headline;
    let subline = t.subline;
    if (tone === 'tu') {
      headline = TU_HEADLINES[headline] || headline;
      subline = toTu(subline);
    }
    return {
      photo: photos[i],
      style: stylesN[i],
      focus: focuses[i],
      pill: t.tag,
      bar,
      headline,
      subline,
      cta: t.cta,
      watermark: 'Hecho con Posty',
    };
  });
  return { specPosts, styles: stylesN, photos, videoIdx: Math.min(2, n - 1), count: n, goalLine, topics };
}

// Renderiza un spec (lista de posteos) a PNGs con los colores dados.
// Devuelve los buffers en el mismo orden. No toca textos: solo diseño.
async function renderSpecPngs(specPosts, colors) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-spec-'));
  try {
    const specPath = path.join(runDir, 'spec.json');
    fs.writeFileSync(specPath, JSON.stringify({ fonts_dir: FONTS_DIR, colors: demoColors(colors.accent, colors.btn), posts: specPosts }));
    await runDemoRender([DEMO_SCRIPT, specPath, runDir]);
    return { bufs: specPosts.map((_, i) => fs.readFileSync(path.join(runDir, `post-${i}.png`))), runDir };
  } catch (e) {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
    throw e;
  }
}

async function renderVideoB64(pngPath, runDir, idx) {
  const waits = [1500, 3000, 6000];
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return (await renderDemoVideo(pngPath, runDir, idx)).toString('base64');
    } catch (e) {
      console.error('[posta] Video falló (intento ' + (attempt + 1) + '/4):', e.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }
  console.error('[posta] ⚠️ VIDEO FALLÓ TRAS 4 INTENTOS');
  return null;
}

// Resuelve las fotos del spec a rutas reales. {userPhoto:true} se restaura
// desde el dataUrl (la subida original se borra tras generar).
function resolveSpecPhotos(specPosts, userPhotoDataUrl) {
  const cleanups = [];
  const resolved = specPosts.map((p) => {
    const ph = p.photo;
    if (ph && typeof ph === 'object' && ph.userPhoto) {
      const m = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(String(userPhotoDataUrl || ''));
      if (!m) throw new Error('No encontramos tu foto original');
      const tmp = path.join(os.tmpdir(), `posta-reup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`);
      fs.writeFileSync(tmp, Buffer.from(m[3], 'base64'));
      cleanups.push(tmp);
      return { ...p, photo: tmp };
    }
    // data URL persistida en el spec (foto subida en un rediseño anterior)
    if (typeof ph === 'string' && ph.startsWith('data:image/')) {
      const m = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(ph);
      if (m) {
        const tmp = path.join(os.tmpdir(), `posta-redata-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`);
        fs.writeFileSync(tmp, Buffer.from(m[3], 'base64'));
        cleanups.push(tmp);
        return { ...p, photo: tmp };
      }
    }
    return p;
  });
  return { resolved, cleanups };
}

async function generateDemo({ business, category, country, tone, photoPath, goal, goal_key, accent, btn, count }) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  const spec = buildDemoSpec({ business, category, country, tone, photoPath, goal, goal_key, accent, btn, count });
  const { specPosts, videoIdx, count: n, goalLine, topics } = spec;
  const cat = CATEGORIES.includes(category) ? category : 'otro';

  // Las fotos del spec guardado usan marcador para la subida del usuario
  // (el tmp se borra); las de stock son rutas estables.
  const savedSpec = {
    posts: specPosts,
    styles: spec.styles,
    photos: spec.photos,
    videoIdx, count: n,
  };
  // En generación inicial photoPath existe: lo inyectamos directo.
  const withPhotos = specPosts.map((p) => (
    (p.photo && typeof p.photo === 'object' && p.photo.userPhoto && photoPath) ? { ...p, photo: photoPath } : p
  ));
  const { bufs, runDir } = await renderSpecPngs(withPhotos, { accent, btn });
  try {
    const made = topics.map((t, i) => {
      let caption = t.caption.split('{BIZ}').join(business);
      if (i === 0 && goalLine) caption += goalLine;
      if (tone === 'tu') caption = toTu(caption);
      return {
        image: 'data:image/png;base64,' + bufs[i].toString('base64'),
        caption,
        hashtags: demoHashtags(cat, country, tone),
        headline: specPosts[i].headline, // titular real renderizado en el diseño
      };
    });

    // El 3er posteo sale como video (el diseño del medio, animado con zoom suave).
    const vbuf = bufs[videoIdx];
    const vpath = path.join(runDir, `post-${videoIdx}.png`);
    fs.writeFileSync(vpath, vbuf);
    const videoB64 = await renderVideoB64(vpath, runDir, videoIdx);

    const posts = made.map((m, i) => (
      i === videoIdx && videoB64
        ? { type: 'video', video: 'data:video/mp4;base64,' + videoB64, caption: m.caption, hashtags: m.hashtags, headline: m.headline }
        : { type: 'image', image: m.image, caption: m.caption, hashtags: m.hashtags, headline: m.headline }
    ));
    return { posts, spec: savedSpec };
  } finally {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// Rediseño de la prueba: re-renderiza los posteos del spec guardado con
// nuevos colores y/o nuevas fotos, SIN tocar textos ni diseños.
// colors: {accent, btn} (re-render completo). photoOverrides: [{index, photo}]
// donde photo es ruta de stock o dataUrl subido. Devuelve imágenes nuevas.
async function redesignDemo({ spec, colors, photoOverrides, userPhotoDataUrl }) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  if (!spec || !Array.isArray(spec.posts) || !spec.posts.length) throw new Error('Sin diseño guardado');
  const n = spec.posts.length;
  const idxs = photoOverrides && photoOverrides.length
    ? [...new Set(photoOverrides.map((o) => o.index).filter((i) => Number.isInteger(i) && i >= 0 && i < n))]
    : spec.posts.map((_, i) => i); // sin overrides = todos (recolor)
  if (!idxs.length) throw new Error('Nada para rediseñar');

  const { resolved, cleanups } = resolveSpecPhotos(spec.posts, userPhotoDataUrl);
  const tmpUploads = [];
  try {
    const sub = idxs.map((i) => {
      let p = { ...resolved[i] };
      const ov = (photoOverrides || []).find((o) => o.index === i);
      if (ov && ov.photo) {
        const ph = String(ov.photo);
        const m = /^data:(image\/(png|jpeg|webp));base64,([\s\S]+)$/.exec(ph);
        if (m) {
          const tmp = path.join(os.tmpdir(), `posta-reph-${Date.now()}-${i}-${crypto.randomBytes(4).toString('hex')}.${m[2] === 'jpeg' ? 'jpg' : m[2]}`);
          fs.writeFileSync(tmp, Buffer.from(m[3], 'base64'));
          tmpUploads.push(tmp);
          p.photo = tmp;
        } else if (fs.existsSync(ph)) {
          p.photo = ph;
        }
      }
      return p;
    });
    const { bufs, runDir } = await renderSpecPngs(sub, colors || {});
    try {
      const images = bufs.map((b) => 'data:image/png;base64,' + b.toString('base64'));
      let video = null;
      const vIdx = idxs.indexOf(spec.videoIdx);
      if (vIdx >= 0) {
        const vpath = path.join(runDir, `post-${vIdx}.png`);
        fs.writeFileSync(vpath, bufs[vIdx]);
        const b64 = await renderVideoB64(vpath, runDir, vIdx);
        if (b64) video = 'data:video/mp4;base64,' + b64;
      }
      return { idxs, images, videoIdx: spec.videoIdx, video };
    } finally {
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
    }
  } finally {
    for (const f of [...cleanups, ...tmpUploads]) { try { fs.unlinkSync(f); } catch (_) {} }
  }
}

// Opciones de fotos "nuestras" para cambiar la foto de un posteo de la prueba:
// devuelve URLs públicas del pool del rubro (excluye las ya usadas).
function trialPhotoOptions(category, business, excludeFams, n) {
  const cat = CATEGORIES.includes(category) ? category : 'otro';
  let pool = (cat === 'gastronomia' && isCafeBusiness(business))
    ? CAFE_POOL.slice()
    : (CATEGORY_PHOTOS[cat] || CATEGORY_PHOTOS.otro).slice();
  const excl = new Set(excludeFams || []);
  pool = pool.filter((f) => !excl.has(f));
  // Si quedan pocas (pool chico como el de café), completar con el pool general del rubro
  const want = n || 8;
  if (pool.length < Math.min(4, want)) {
    const extra = (CATEGORY_PHOTOS[cat] || CATEGORY_PHOTOS.otro).slice()
      .filter((f) => !excl.has(f) && !pool.includes(f));
    pool = pool.concat(extra);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, want).map((fam) => ({ fam, url: '/demo-stock/' + fam + '.webp' }));
}
const CATEGORY_COLORS = {
  moda: ['#232323', '#F0B429'],
  gastronomia: ['#8B2E2E', '#F2A93B'],
  cafeteria: ['#5C3D2E', '#D9A679'],
  bar: ['#1F2A44', '#E8B44A'],
  belleza: ['#C98BA6', '#F6E7EC'],
  barberia: ['#1C1C1E', '#C9A227'],
  fitness: ['#16283F', '#FF5A3C'],
  mascotas: ['#2E7D6F', '#FFC53D'],
  salud: ['#2A9DB8', '#E8F6F8'],
  hogar: ['#4A6741', '#E9D8A6'],
  deco: ['#B08968', '#F1E3D3'],
  inmobiliaria: ['#1F3A5F', '#F2C14E'],
  autos: ['#333333', '#E63946'],
  educacion: ['#2B6CB0', '#F6C453'],
  tecnologia: ['#2D2D44', '#00D2FF'],
  turismo: ['#1B9AAA', '#FFC300'],
  viajes: ['#0E7C7B', '#F4D35F'],
  eventos: ['#7B2D8B', '#FEC14D'],
  fotografia: ['#262626', '#E8B44A'],
  arte: ['#E4572E', '#F3A712'],
  joyeria: ['#8C6A3C', '#F6E7C1'],
  flores: ['#3E7C4F', '#F2A7C3'],
  profesionales: ['#1F3A5F', '#7FB3D5'],
  servicios: ['#1F2937', '#F59E0B'],
  otro: ['#2793C8', '#FEC14D'],
};

// ---------- Colores reales del perfil de Instagram (best-effort) ----------
// Trae la foto de perfil pública vía la página de embed (sin login ni API)
// y extrae hasta 2 colores dominantes. Timeouts acotados: si Instagram no
// colabora, devuelve null y se usa la paleta del rubro.
const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const EXTRACT_COLORS_SCRIPT = path.join(__dirname, 'extract_colors.py');

// Extrae hasta 2 colores dominantes (hex) de un buffer de imagen.
// Para el logo del cliente: así los colores quedan idénticos a su marca.
function extractColorsFromBuffer(buf) {
  return new Promise((resolve, reject) => {
    if (!Buffer.isBuffer(buf) || !buf.length) return reject(new Error('Imagen vacía'));
    const tmp = path.join(os.tmpdir(), `posta-logo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`);
    fs.writeFileSync(tmp, buf);
    execFile('python3', [EXTRACT_COLORS_SCRIPT, tmp], { timeout: 10000 }, (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch (_) {}
      if (err) return reject(new Error('No pudimos leer los colores'));
      const cols = String(stdout || '').trim().split(/\s+/).filter((c) => /^#[0-9A-F]{6}$/.test(c));
      if (!cols.length) return reject(new Error('No encontramos colores en esa imagen'));
      resolve(cols.slice(0, 2));
    });
  });
}

function httpsGet(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: { 'User-Agent': IG_UA, 'Accept-Language': 'es-AR,es;q=0.9' },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpsGet(res.headers.location, timeoutMs).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('http ' + res.statusCode)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });
}

async function fetchIgProfile(ig) {
  // Devuelve { colors, pic, name } o null. Best-effort con timeouts acotados.
  const user = String(ig || '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 40);
  if (!user) return null;
  const page = await httpsGet('https://www.instagram.com/' + user + '/embed/', 8000);
  const html = page.body.toString('utf8');
  // Verificamos que la página sea realmente del usuario pedido (no un challenge)
  const who = '\\"username\\":\\"' + user.toLowerCase() + '\\"';
  if (!html.toLowerCase().includes(who)) return null;
  const m = html.match(/profile_pic_url.{0,6}?"(https:[^"]+)"/);
  if (!m) return null;
  const picUrl = m[1].replace(/\\/g, '');
  // Solo aceptamos la CDN oficial de Instagram (anti-SSRF)
  if (!/^https:\/\/[a-z0-9.-]*cdninstagram\.com\//i.test(picUrl)) return null;
  const img = await httpsGet(picUrl, 6000);
  if (!String(img.headers['content-type'] || '').startsWith('image/')) return null;
  const nm = html.match(/\\"full_name\\":\\"([^\\]+)\\"/);
  const name = nm ? nm[1].replace(/[\u0000-\u001F]/g, '').slice(0, 60) : '';
  const tmp = path.join(os.tmpdir(), 'igpic-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '.jpg');
  fs.writeFileSync(tmp, img.body);
  try {
    const out = await new Promise((resolve, reject) => {
      execFile('python3', [EXTRACT_COLORS_SCRIPT, tmp], { timeout: 8000 }, (err, stdout) => {
        if (err) return reject(err);
        resolve(String(stdout || '').trim());
      });
    });
    const cols = out.split(/\s+/).filter((c) => /^#[0-9A-F]{6}$/.test(c));
    return {
      colors: cols.length ? cols : null,
      pic: 'data:image/jpeg;base64,' + img.body.toString('base64'),
      name,
    };
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}
module.exports = {
  parseMultipart,
  validImageKind,
  checkRateLimit,
  clientIp,
  generateDemo,
  buildDemoSpec,
  redesignDemo,
  trialPhotoOptions,
  extractColorsFromBuffer,
  toTu,
  demoHashtags,
  DEMO_TOPICS,
  DEMO_LIMIT_PER_DAY,
  MAX_FILE_BYTES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_PHOTOS,
  CATEGORY_COLORS,
  COUNTRIES,
  fetchIgProfile,
};
