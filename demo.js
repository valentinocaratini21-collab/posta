// Demo pública self-service — Posta
// Genera 3 posteos de muestra sin registro: captions (reutiliza generator.js)
// + imágenes 1080×1350 renderizadas con ffmpeg (4 plantillas × 4 paletas,
// paleta de marca: blanco / celeste / amarillo). Sin dependencias nativas nuevas.

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { generateContent } = require('./generator');
const { ffmpegAvailable } = require('./video');

const FONT_BOLD = path.join(__dirname, 'assets', 'fonts', 'Montserrat-Bold.ttf');
const FONT_REG = path.join(__dirname, 'assets', 'fonts', 'Montserrat-Regular.ttf');
const W = 1080;
const H = 1350;

const DEMO_LIMIT_PER_DAY = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const CATEGORIES = ['moda', 'gastronomia', 'belleza', 'fitness', 'otro'];
const COUNTRIES = ['AR', 'UY'];

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
// El motor de plantillas escribe en voseo; para "tú" mapeamos las frases fijas.
const TU_MAP = [
  ['Che, mirá esto 👀', 'Mira esto 👀'],
  ['Atención, que esto es posta 👇', 'Atención, esto te va a encantar 👇'],
  ['Mirá lo que tenemos para vos ✨', 'Mira lo que tenemos para ti ✨'],
  ['Confirmado: lo necesitás en tu vida ✅', 'Confirmado: lo necesitas en tu vida ✅'],
  ['Escribinos por DM y te lo reservamos 📩', 'Escríbenos por DM y te lo reservamos 📩'],
  ['Comentá INFO y te pasamos todo 👇', 'Comenta INFO y te pasamos todo 👇'],
  ['Guardá este post para no olvidarte 🔖', 'Guarda este post para no olvidarlo 🔖'],
  ['Etiquetá a quien lo necesita 🙋', 'Etiqueta a quien lo necesita 🙋'],
  ['Contactanos para más información 📩', 'Contáctanos para más información 📩'],
  ['Visitá nuestro perfil y conocé más', 'Visita nuestro perfil y conoce más'],
  ['Te esperamos, reservá tu lugar', 'Te esperamos, reserva tu lugar'],
  ['Corré antes de que vuele 🏃💨', 'Corre antes de que vuele 🏃💨'],
  ['Dale like si ya lo querés ❤️', 'Dale like si ya lo quieres ❤️'],
  ['Compartilo con tu grupo de WhatsApp 📲', 'Compártelo con tu grupo de WhatsApp 📲'],
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
  otro: ['#emprendedoresargentinos', '#pymesargentina', '#negociosdigitales', '#argentina'],
};
const TAGS_UY = {
  moda: ['#modauruguay', '#tiendaderopa', '#ootd', '#emprendedoresuruguay', '#comprelocal'],
  gastronomia: ['#foodieuruguay', '#gastronomia', '#antojo', '#restaurante', '#montevideofood'],
  belleza: ['#bellezauruguay', '#peluqueria', '#estetica', '#makeup', '#skincare'],
  fitness: ['#fitnessuruguay', '#entrenamiento', '#gymlife', '#vidasana', '#personaltrainer'],
  otro: ['#emprendedoresuruguay', '#pymesuruguay', '#negociosdigitales', '#uruguay'],
};
const TAGS_NEUTRAL = {
  moda: ['#moda', '#tiendaderopa', '#ootd', '#emprendedores', '#fashion'],
  gastronomia: ['#foodie', '#gastronomia', '#antojo', '#restaurante', '#foodlover'],
  belleza: ['#belleza', '#peluqueria', '#estetica', '#makeup', '#skincare'],
  fitness: ['#fitness', '#entrenamiento', '#gymlife', '#vidasana', '#personaltrainer'],
  otro: ['#emprendedores', '#pymes', '#negociosdigitales', '#marketingdigital'],
};
const GENERIC_TAGS = ['#emprendedores', '#marketingdigital', '#contenidodigital'];

function demoHashtags(category, country, tone) {
  const base = tone === 'tu' ? TAGS_NEUTRAL : country === 'UY' ? TAGS_UY : TAGS_AR;
  const tags = [...(base[category] || base.otro), ...GENERIC_TAGS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);
  return tags.join(' ');
}

// ---------- Temas de los 3 posteos de muestra (titular corto para la imagen + tema) ----------
const DEMO_TOPICS = {
  moda: [
    { topic: 'el nuevo ingreso de la semana', headline: 'NUEVO INGRESO' },
    { topic: 'la promo de la semana con descuento especial', headline: 'PROMO SEMANAL' },
    { topic: '3 tips para armar tu look', headline: '3 TIPS DE LOOK' },
  ],
  gastronomia: [
    { topic: 'el plato más pedido de la casa', headline: 'EL MÁS PEDIDO' },
    { topic: 'la promo 2x1 de esta semana', headline: 'PROMO 2X1' },
    { topic: '3 motivos para venir hoy', headline: 'VENÍ HOY' },
  ],
  belleza: [
    { topic: 'el nuevo servicio disponible', headline: 'NUEVO SERVICIO' },
    { topic: 'reservá tu turno de esta semana', headline: 'RESERVÁ TU TURNO' },
    { topic: '3 tips de cuidado en casa', headline: '3 TIPS DE CUIDADO' },
  ],
  fitness: [
    { topic: 'empezá hoy tu cambio', headline: 'EMPEZÁ HOY' },
    { topic: 'la primera clase de prueba', headline: 'CLASE DE PRUEBA' },
    { topic: '3 errores comunes al entrenar', headline: '3 ERRORES COMUNES' },
  ],
  otro: [
    { topic: 'la novedad de la semana', headline: 'NOVEDAD' },
    { topic: 'la promo especial para seguidores', headline: 'PROMO ESPECIAL' },
    { topic: '3 tips de expertos', headline: '3 TIPS CLAVE' },
  ],
};

// Para "tú", titulares sin voseo
const TU_HEADLINES = { 'VENÍ HOY': 'VEN HOY', 'EMPEZÁ HOY': 'EMPIEZA HOY', 'RESERVÁ TU TURNO': 'RESERVA TU TURNO' };

// ---------- Render de imágenes 1080×1350 con ffmpeg ----------
// 4 plantillas × 4 paletas (blanco / celeste / amarillo)
const DEMO_PALETTES = [
  { bg: 'FFFFFF', accent: '1888B8', text: '0A1E33', sub: '47617A' }, // Blanco
  { bg: 'FEC14D', accent: '0A1E33', text: '0A1E33', sub: '6B5410' }, // Amarillo
  { bg: 'F2F9FD', accent: '1888B8', text: '0A1E33', sub: '47617A' }, // Suave
  { bg: '0A1E33', accent: 'FEC14D', text: 'FFFFFF', sub: 'B9C6D4' }, // Navy
];

function escDrawtext(t) {
  return String(t || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function runFfmpeg(args, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', ...args], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message).split('\n').slice(-6).join(' ').slice(0, 400);
        return reject(new Error('ffmpeg falló: ' + msg));
      }
      resolve(stdout);
    });
  });
}

function wrapLines(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 3);
}

function hexForDraw(hex6) {
  return '0x' + hex6;
}

// Construye el filtro de dibujo para una plantilla. Devuelve { inputs, filter }.
// inputs: array de args de entrada; el video base queda en [base].
function buildFilter({ photoPath, template, palette, business, headline }) {
  const pal = DEMO_PALETTES[palette % DEMO_PALETTES.length];
  const inputs = [];
  const tmp = { dir: null, files: [] };
  const txtFile = (content) => {
    if (!tmp.dir) {
      tmp.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-demo-'));
    }
    const f = path.join(tmp.dir, `t${tmp.files.length}.txt`);
    fs.writeFileSync(f, escDrawtext(content));
    tmp.files.push(f);
    return f;
  };

  let baseLabel = 'base';
  const filters = [];

  if (photoPath) {
    inputs.push('-i', photoPath);
    if (template === 2) {
      // Marco: foto inset sobre fondo sólido
      inputs.push('-f', 'lavfi', '-i', `color=c=${hexForDraw(pal.bg)}:s=${W}x${H}`);
      filters.push(
        `[0:v]scale=940:780:force_original_aspect_ratio=increase,crop=940:780[ph]`,
        `[1:v][ph]overlay=70:150[${baseLabel}]`
      );
    } else if (template === 3) {
      // Dividida: foto arriba (60%), sólido abajo
      inputs.push('-f', 'lavfi', '-i', `color=c=${hexForDraw(pal.bg)}:s=${W}x${H}`);
      filters.push(
        `[0:v]scale=${W}:810:force_original_aspect_ratio=increase,crop=${W}:810[ph]`,
        `[1:v][ph]overlay=0:0[${baseLabel}]`
      );
    } else {
      // Plena / Banda: foto full-bleed
      filters.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}[${baseLabel}]`);
    }
  } else {
    // Sin foto: fondo estético generado (sólido + banda de acento)
    inputs.push('-f', 'lavfi', '-i', `color=c=${hexForDraw(pal.bg)}:s=${W}x${H}`);
    filters.push(`[0:v]copy[${baseLabel}]`);
    const deco =
      `drawbox=x=0:y=0:w=${W}:h=26:color=${hexForDraw(pal.accent)}:t=fill,` +
      (template === 2
        ? `drawbox=x=70:y=150:w=940:h=780:color=${hexForDraw(pal.accent)}@0.14:t=fill`
        : `drawbox=x=${W - 320}:y=120:w=240:h=240:color=${hexForDraw(pal.accent)}@0.14:t=fill`);
    filters.push(`[${baseLabel}]${deco}[${baseLabel}2]`);
    baseLabel = baseLabel + '2';
  }

  const D = [];
  const textColor = hexForDraw(pal.text);
  const subColor = hexForDraw(pal.sub);
  const accent = hexForDraw(pal.accent);
  const biz = String(business || '').toUpperCase().slice(0, 34);
  const head = String(headline || '').slice(0, 60);
  const headLines = wrapLines(head, 15);

  const drawLine = (line, x, y, size, color, font = FONT_BOLD, alignX = null) => {
    const f = txtFile(line);
    const xExpr = alignX === 'center' ? '(w-text_w)/2' : String(x);
    D.push(
      `drawtext=fontfile=${font}:textfile='${f}':fontsize=${size}:fontcolor=${color}:x=${xExpr}:y=${y}`
    );
  };

  if (template === 0) {
    // PLENA: scrim inferior + titular abajo-izquierda
    D.push(`drawbox=x=0:y=${H - 620}:w=${W}:h=620:color=black@0.55:t=fill`);
    if (biz) drawLine(biz, 80, 84, 40, textColor);
    D.push(`drawbox=x=80:y=${H - 500}:w=110:h=12:color=${accent}:t=fill`);
    headLines.forEach((ln, i) => drawLine(ln, 80, H - 460 + i * 108, 88, textColor));
    drawLine('Hecho con Posta', W - 330, H - 78, 30, subColor, FONT_REG);
  } else if (template === 1) {
    // BANDA: banda sólida inferior con titular
    const bandY = Math.round(H * 0.60);
    D.push(`drawbox=x=0:y=${bandY}:w=${W}:h=${H - bandY}:color=${hexForDraw(pal.bg)}:t=fill`);
    D.push(`drawbox=x=0:y=${bandY}:w=${W}:h=10:color=${accent}:t=fill`);
    if (biz) {
      const bf = txtFile(biz);
      D.push(
        `drawtext=fontfile=${FONT_BOLD}:textfile='${bf}':fontsize=36:fontcolor=${textColor}:` +
          `x=80:y=70:box=1:boxcolor=black@0.45:boxborderw=18`
      );
    }
    const startY = bandY + 70;
    headLines.forEach((ln, i) => drawLine(ln, 0, startY + i * 104, 84, textColor, FONT_BOLD, 'center'));
    D.push(`drawbox=x=485:y=${startY - 44}:w=110:h=12:color=${accent}:t=fill`);
    drawLine('Hecho con Posta', W - 330, H - 78, 30, subColor, FONT_REG);
  } else if (template === 2) {
    // MARCO: foto inset + titular debajo
    if (biz) drawLine(biz, 0, 64, 40, textColor, FONT_BOLD, 'center');
    const startY = 1010;
    headLines.forEach((ln, i) => drawLine(ln, 0, startY + i * 100, 80, textColor, FONT_BOLD, 'center'));
    D.push(`drawbox=x=485:y=${startY - 42}:w=110:h=12:color=${accent}:t=fill`);
    drawLine('Hecho con Posta', W - 330, H - 78, 30, subColor, FONT_REG);
  } else {
    // DIVIDIDA: foto arriba, titular abajo-izquierda
    const divY = 830;
    D.push(`drawbox=x=80:y=${divY}:w=110:h=12:color=${accent}:t=fill`);
    headLines.forEach((ln, i) => drawLine(ln, 80, divY + 44 + i * 104, 84, textColor));
    if (biz) drawLine(biz, 80, divY + 44 + headLines.length * 104 + 18, 38, subColor, FONT_BOLD);
    drawLine('Hecho con Posta', W - 330, H - 78, 30, subColor, FONT_REG);
  }

  filters.push(`[${baseLabel}]${D.join(',')}[out]`);
  return { inputs, filter: filters.join(';'), tmpDir: tmp.dir };
}

async function renderDemoImage({ photoPath, template, palette, business, headline }) {
  const { inputs, filter, tmpDir } = buildFilter({ photoPath, template, palette, business, headline });
  const outPath = path.join(os.tmpdir(), `posta-demo-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.png`);
  try {
    await runFfmpeg([
      ...inputs,
      '-filter_complex', filter,
      '-map', '[out]',
      '-frames:v', '1',
      '-c:v', 'png',
      outPath,
    ]);
    const buf = fs.readFileSync(outPath);
    return buf;
  } finally {
    try { fs.unlinkSync(outPath); } catch (_) {}
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------- Orquestador ----------
async function generateDemo({ business, category, country, tone, photoPath }) {
  if (!ffmpegAvailable()) throw new Error('Generador no disponible en este momento');
  const cat = CATEGORIES.includes(category) ? category : 'otro';
  const topics = DEMO_TOPICS[cat];
  const apiKey = tone === 'tu' ? '' : (process.env.OPENAI_API_KEY || '');

  const posts = await Promise.all(
    topics.map(async (t, i) => {
      let caption = '';
      try {
        const out = await generateContent(
          { business, category: cat, tone: 'canchero', topic: t.topic },
          apiKey
        );
        caption = (out.caption || '').trim();
      } catch (e) {
        caption = '';
      }
      if (!caption) caption = `${t.topic} en ${business}. Escribinos por DM 📩`;
      let headline = t.headline;
      if (tone === 'tu') {
        caption = toTu(caption);
        headline = TU_HEADLINES[headline] || headline;
      }
      const hashtags = demoHashtags(cat, country, tone);
      const imgBuf = await renderDemoImage({
        photoPath,
        template: i % 4,
        palette: i % 4,
        business,
        headline,
      });
      return {
        image: 'data:image/png;base64,' + imgBuf.toString('base64'),
        caption,
        hashtags,
      };
    })
  );
  return posts;
}

module.exports = {
  parseMultipart,
  validImageKind,
  checkRateLimit,
  clientIp,
  generateDemo,
  toTu,
  demoHashtags,
  DEMO_LIMIT_PER_DAY,
  MAX_FILE_BYTES,
  CATEGORIES,
  COUNTRIES,
};
