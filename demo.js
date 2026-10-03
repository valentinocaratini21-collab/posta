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
const captions = require('./demo-captions');

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

// ---------- Anti-spam honesto: 5 generaciones por IP por día ----------
// El intento se RESERVA al arrancar (consumeTrialAttempt, atómico) y se
// REEMBOLSA si la generación falla o el stream se corta antes de entregar el
// resultado (refundTrialAttempt). Una generación fallida nunca consume.
//
// Concurrencia: consumeTrialAttempt hace check+increment en UNA sola sentencia
// SQL atómica, así que 2 requests simultáneos no pueden pasar de 5
// (node:sqlite es sincrónico: tampoco hay interleaving en JS).
function trialDayCount(ip) {
  const row = db.prepare('SELECT count FROM demo_usage WHERE ip = ? AND day = ?').get(ip, todayStr());
  return row ? row.count : 0;
}

// Solo lectura: { allowed, remaining }. No consume nada.
function checkTrialAllowed(ip) {
  const count = trialDayCount(ip);
  return { allowed: count < DEMO_LIMIT_PER_DAY, remaining: Math.max(0, DEMO_LIMIT_PER_DAY - count) };
}

// Reserva un intento de forma ATÓMICA. Devuelve { ok, remaining }:
// ok=false si ya llegó al tope del día (no se consume nada).
function consumeTrialAttempt(ip) {
  const day = todayStr();
  // Limpieza liviana de días viejos (cada tanto)
  try {
    if (Math.random() < 0.05) db.exec(`DELETE FROM demo_usage WHERE day < date('now', '-7 days')`);
  } catch (_) {}
  const info = db.prepare(
    `INSERT INTO demo_usage (ip, day, count) VALUES (?, ?, 1)
     ON CONFLICT(ip, day) DO UPDATE SET count = count + 1 WHERE count < ?`
  ).run(ip, day, DEMO_LIMIT_PER_DAY);
  if (!info || info.changes < 1) return { ok: false, remaining: 0 };
  const count = trialDayCount(ip);
  return { ok: true, remaining: Math.max(0, DEMO_LIMIT_PER_DAY - count) };
}

// Reembolsa un intento reservado (falla de generación / stream cortado a mitad).
// Nunca baja de 0.
function refundTrialAttempt(ip) {
  try {
    db.prepare(
      `UPDATE demo_usage SET count = CASE WHEN count > 0 THEN count - 1 ELSE 0 END
       WHERE ip = ? AND day = ?`
    ).run(ip, todayStr());
  } catch (_) {}
}

// Compat: antes checkRateLimit() además incrementaba el contador. Ahora es solo
// lectura (ver checkTrialAllowed); el consumo se hace con
// consumeTrialAttempt() + refundTrialAttempt().
function checkRateLimit(ip) {
  return checkTrialAllowed(ip);
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

function applyGoal(topics, goal, goal_key, hasPhoto) {
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
  // SIN foto real del cliente el posteo usa foto stock genérica del rubro: NO
  // se personaliza el titular con el producto específico que nombró ("buzo
  // adidas última"), porque la foto no sería ese producto y el posteo quedaría
  // roto (regla: la foto tiene que coincidir con el producto). El "Tal como
  // pediste" igual muestra en el caption que lo escuchamos.
  if (!hasPhoto) {
    const short = clean.length > 140 ? clean.slice(0, 140).trimEnd() + '…' : clean;
    return { topics: ordered, goalLine: '\nTal como pediste: ' + short };
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
  const { topics: allTopics, goalLine } = applyGoal(captions.DEMO_TOPICS[cat], goal, goal_key, !!photoPath);
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
      headline = captions.TU_HEADLINES[headline] || headline;
      subline = captions.toTu(subline);
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
    // Captions gateados por captionPasses (demo-captions.js): si una plantilla
    // no pasa el gate, se reintenta con otro tema del rubro. Nunca sale un
    // caption que el gate rechazaría.
    const made = topics.map((t, i) => {
      const r = captions.resolveTrialCaption(topics, cat, {
        business, tone, country, idx: i, goalLine,
      });
      return {
        image: 'data:image/png;base64,' + bufs[i].toString('base64'),
        caption: r.caption,
        hashtags: r.hashtags,
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
// ---------- Prueba en 1 campo: prefill por @ de Instagram ----------
// Devuelve el HTML crudo de la página embed del perfil, o null si el perfil
// no existe, es privado o Instagram devuelve otra cosa (mismo chequeo de
// identidad que fetchIgProfile). No descarga la foto: solo el HTML.
async function fetchIgEmbedHtml(ig) {
  const user = String(ig || '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 40);
  if (!user) return null;
  let page;
  try {
    page = await httpsGet('https://www.instagram.com/' + user + '/embed/', 8000);
  } catch (e) {
    return null;
  }
  const html = page.body.toString('utf8');
  // Verificamos que la página sea realmente del usuario pedido (no un challenge)
  const who = '\\"username\\":\\"' + user.toLowerCase() + '\\"';
  if (!html.toLowerCase().includes(who)) return null;
  return html;
}

// Extrae la biografía del HTML del embed (mismo patrón de JSON escapado que
// full_name en fetchIgProfile). Solo acepta escapes conocidos (\n \r \t \/
// \uXXXX) dentro del valor: así el match se detiene en el PRIMER cierre \" y
// no se come el resto del HTML. Devuelve '' si no hay biografía.
function extractIgBiography(html) {
  const m = String(html || '').match(/\\"biography\\":\\"((?:\\[nrt\\/]|\\u[0-9a-fA-F]{4}|[^"\\])*)\\"/);
  if (!m) return '';
  return m[1]
    .replace(/\\([nrt])/g, ' ')
    .replace(/\\\//g, '/')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => {
      try { return String.fromCharCode(parseInt(h, 16)); } catch (e) { return ''; }
    })
    .replace(/[\u0000-\u001F]/g, '')
    .slice(0, 500);
}

// Keywords → una de las 25 CATEGORIES. Orden: primero las más específicas
// (barberia antes que bar, cafeteria antes que gastronomia genérica).
const CATEGORY_KEYWORDS = [
  [/caf[eé]|coffee|cafeter[ií]a|barista|tostadur[ií]a|espresso|cappuccino|latte|pasteler[ií]a|panader[ií]a|brunch|medialuna|churro|desayuno|merienda/i, 'cafeteria'],
  [/peluquer[ií]a|barber[ií]a|\bbarber\b|corte de pelo|peluquer[ií]a canina/i, 'barberia'],
  [/\bbar\b|pub|cocteler[ií]a|cocktail|trago|cervecer[ií]a|birra|\bvino\b|vinoteca/i, 'bar'],
  [/gimnasio|fitness|\bgym\b|entreno|crossfit|personal trainer|musculaci[oó]n|yoga|pilates/i, 'fitness'],
  [/restaurant|parrilla|pizzer[ií]a|sushi|hamburguesa|comida|empanada|men[uú]|chef|cocina|gastronom|rotiser[ií]a|helader[ií]a|chiviter[ií]a/i, 'gastronomia'],
  [/hotel|hostel|excursi[oó]n|aerol[ií]nea|vacaci[oó]n|posada|caba[nñ]a|apart hotel/i, 'turismo'],
  [/ropa|moda|indumentaria|vestimenta|boutique|streetwear|prenda|tienda de ropa|calzado|zapatilla/i, 'moda'],
  [/belleza|beauty|maquillaje|make ?up|est[eé]tica|skincare|\bspa\b|u[nñ]as|pesta[nñ]as|depilaci[oó]n|masaje|cosm[eé]tica/i, 'belleza'],
  [/mascota|perr[oa]|gat[oa]|veterinaria|\bpet\b|guarder[ií]a canina/i, 'mascotas'],
  [/odontolog|cl[ií]nica|kinesiolog|nutricionista|psic[oó]log|m[eé]dic[oa]|salud dental|fisioterapia|optica/i, 'salud'],
  [/mueble|muebler[ií]a|colch[oó]n|blanquer[ií]a|\bhogar\b/i, 'hogar'],
  [/inmobiliaria|real estate|propiedad|alquiler|departamento|terreno|tasaci[oó]n/i, 'inmobiliaria'],
  [/concesionaria|veh[ií]culo|taller mec[aá]nico|repuesto|\bmoto\b|neum[aá]tico|gomer[ií]a/i, 'autos'],
  [/escuela|colegio|universidad|curs[ao]s|clases|academia|instituto|educaci[oó]n|taller de/i, 'educacion'],
  [/hotel|hostel|excursi[oó]n|aerol[ií]nea|vacaci[oó]n|posada|caba[nñ]a|apart hotel/i, 'turismo'],
  [/casamiento|boda|quince|fiesta de 15|\bdj\b|sal[oó]n de|organizaci[oó]n de eventos|catering/i, 'eventos'],
  [/software|\bapp\b|celular|smartphone|iphone|inform[aá]tica|computaci[oó]n|desarrollo web|programaci[oó]n/i, 'tecnologia'],
  [/interiorismo|diseño de interiores|diseno de interiores|decoraci[oó]n de interiores/i, 'deco'],
  [/joyer[ií]a|relojer[ií]a|\boro\b|plater[ií]a|anillo/i, 'joyeria'],
  [/fotograf|photography|retrato|estudio fotogr[aá]fico/i, 'fotografia'],
  [/abogad|contad[oó]r|arquitecto|ingeniero|escribano|estudio jur[ií]dico|consultora/i, 'profesionales'],
  [/flores|florer[ií]a|florister[ií]a/i, 'flores'],
  [/plomero|electricista|alba[nñ]il|carpintero|limpieza|fumigaci[oó]n|reparaci[oó]n|servicio t[eé]cnico/i, 'servicios'],
  [/viajes|agencia de viajes/i, 'viajes'],
  [/tatuaje|tattoo|galer[ií]a|m[uú]sic[oa]|banda|\barte\b|artista/i, 'arte'],
];
// Mapea texto libre (biografía + nombre) a una categoría válida. Si nada
// matchea, devuelve 'otro'.
function categoryFromText(text) {
  const t = String(text || '');
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(t)) return cat;
  }
  return 'otro';
}

// ---------- Render con streaming: emite cada PNG a medida que aparece ----------
// Variante de renderSpecPngs para el endpoint SSE: el python corre en segundo
// plano y hacemos poll del runDir cada ~400ms. Cuando post-{i}.png aparece y
// su tamaño queda estable ≥400ms (ya no lo está escribiendo el render), se
// llama a onPng(i, buf) en orden de índice. Resuelve { bufs, runDir } como
// renderSpecPngs. Si el render falla a mitad de camino, rechaza.
async function renderSpecPngsStream(specPosts, colors, onPng) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-spec-'));
  const specPath = path.join(runDir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify({ fonts_dir: FONTS_DIR, colors: demoColors(colors.accent, colors.btn), posts: specPosts }));
  let renderErr = null;
  let renderDone = false;
  const renderPromise = runDemoRender([DEMO_SCRIPT, specPath, runDir])
    .then(() => { renderDone = true; }, (e) => { renderErr = e; renderDone = true; });
  try {
    const n = specPosts.length;
    const emitted = new Array(n).fill(false);
    const lastSize = new Array(n).fill(-1);
    let emittedCount = 0;
    while (emittedCount < n) {
      if (renderErr) throw renderErr; // el render murió: no van a aparecer más PNGs
      await new Promise((r) => setTimeout(r, 400));
      for (let i = 0; i < n; i++) {
        if (emitted[i]) continue;
        const p = path.join(runDir, `post-${i}.png`);
        let st;
        try { st = fs.statSync(p); } catch (_) { continue; }
        if (!st.isFile() || st.size < 1024) continue;
        if (lastSize[i] === st.size) {
          // Tamaño estable por ≥400ms: el python ya terminó de escribirlo.
          let buf;
          try { buf = fs.readFileSync(p); } catch (_) { continue; }
          emitted[i] = true;
          emittedCount++;
          try { await onPng(i, buf); } catch (_) { /* el consumidor maneja sus errores */ }
        } else {
          lastSize[i] = st.size;
        }
      }
    }
    await renderPromise;
    if (renderErr) throw renderErr;
    const bufs = specPosts.map((_, i) => fs.readFileSync(path.join(runDir, `post-${i}.png`)));
    return { bufs, runDir };
  } catch (e) {
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
    throw e;
  }
}
module.exports = {
  parseMultipart,
  validImageKind,
  checkRateLimit,
  checkTrialAllowed,
  consumeTrialAttempt,
  refundTrialAttempt,
  clientIp,
  generateDemo,
  buildDemoSpec,
  redesignDemo,
  trialPhotoOptions,
  extractColorsFromBuffer,
  toTu: captions.toTu,
  demoHashtags: captions.demoHashtags,
  // Prueba en 1 campo (prefill + streaming)
  fetchIgEmbedHtml,
  extractIgBiography,
  categoryFromText,
  renderSpecPngsStream,
  renderVideoB64,
  DEMO_TOPICS: captions.DEMO_TOPICS,
  resolveTrialCaption: captions.resolveTrialCaption,
  DEMO_LIMIT_PER_DAY,
  MAX_FILE_BYTES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_PHOTOS,
  CATEGORY_COLORS,
  COUNTRIES,
  fetchIgProfile,
};
