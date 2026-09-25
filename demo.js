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
const CATEGORY_PHOTO = {
  moda: 'fashion', joyeria: 'fashion',
  gastronomia: 'food', bar: 'bar',
  belleza: 'beauty',
  fitness: 'fitness',
  mascotas: 'pets',
  hogar: 'home', deco: 'home', flores: 'home', inmobiliaria: 'home',
  salud: 'office', profesionales: 'office', educacion: 'office', tecnologia: 'office',
  turismo: 'lifestyle', eventos: 'lifestyle', fotografia: 'lifestyle', autos: 'lifestyle', otro: 'lifestyle',
};

function stockFor(category, i) {
  // Los 3 posteos usan la foto de la familia del rubro (sin rotar a otra
  // familia: una foto que no matchea el rubro rompe la credibilidad).
  const fam = CATEGORY_PHOTO[category] || 'lifestyle';
  const p = path.join(STOCK_DIR, fam + '.webp');
  if (!fs.existsSync(p)) throw new Error('Foto de muestra no disponible');
  return p;
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
  otro: ['#emprendedoresargentinos', '#pymesargentina', '#negociosdigitales', '#argentina'],
};
const TAGS_UY = Object.fromEntries(
  Object.entries(TAGS_AR).map(([k, v]) => [
    k,
    v.map((t) => t.replace(/argentina/g, 'uruguay').replace(/buenosairesfood/g, 'montevideofood')),
  ])
);
const TAGS_NEUTRAL = {
  moda: ['#moda', '#tiendaderopa', '#ootd', '#emprendedores', '#fashion'],
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

// ---------- Los 3 posteos de muestra: copy pensado para vender ----------
// kind: novedad | promo | reserva | tip | social (para ordenar según el objetivo)
// tag: pill superior · headline: titular de la imagen (sin emojis)
// subline: beneficio concreto (neutro, sin voseo) · cta: texto del botón
// caption: hook + beneficio + CTA
const DEMO_TOPICS = {
  moda: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO INGRESO',
      subline: 'La colección más esperada ya está disponible.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nEl nuevo ingreso de la semana en {BIZ} ya está disponible.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'PROMO', headline: 'PROMO SEMANAL',
      subline: 'Descuento especial, solo por esta semana.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nLa promo de la semana en {BIZ} viene con descuento especial. Solo por estos días.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS DE LOOK',
      subline: 'Ideas simples para armar tu look en 5 minutos.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para armar tu look con lo nuevo de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  gastronomia: [
    { kind: 'social', tag: 'EL FAVORITO', headline: 'EL MÁS PEDIDO',
      subline: 'El plato que todos vuelven a pedir.', cta: 'Lo quiero probar',
      caption: 'Che, mirá esto 👀\n\nEl plato más pedido de {BIZ}, el que todos recomiendan.\n\nEtiquetá a quien lo necesita 🙋' },
    { kind: 'promo', tag: '2X1', headline: 'PROMO 2X1',
      subline: 'Esta semana, el segundo va por la casa.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nPromo 2x1 esta semana en {BIZ}. Vení con quien quieras.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'reserva', tag: 'HOY', headline: 'VENÍ HOY',
      subline: 'Tres motivos para pasar hoy mismo.', cta: 'Voy hoy',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 motivos para venir hoy a {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  belleza: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO SERVICIO',
      subline: 'Lo último en cuidado personal, ya disponible.', cta: 'Quiero probarlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio disponible en {BIZ}. Tu momento de cuidado empieza acá.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'TURNO', headline: 'RESERVÁ TU TURNO',
      subline: 'Tu lugar de esta semana te está esperando.', cta: 'Reservar ahora',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu turno de esta semana en {BIZ} antes de que se llene.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS DE CUIDADO',
      subline: 'Cuidado profesional, también en casa.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de cuidado en casa, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  fitness: [
    { kind: 'novedad', tag: 'HOY', headline: 'EMPEZÁ HOY',
      subline: 'El cambio empieza con una sola clase.', cta: 'Empezar ahora',
      caption: 'Che, mirá esto 👀\n\nEmpezá hoy tu cambio en {BIZ}. La primera decisión es la más importante.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'GRATIS', headline: 'CLASE DE PRUEBA',
      subline: 'Primera clase de prueba, sin compromiso.', cta: 'Quiero mi clase',
      caption: 'Atención, que esto es posta 👇\n\nProbá una clase gratis en {BIZ}, sin compromiso.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 ERRORES COMUNES',
      subline: 'Tres errores que frenan tu progreso.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 errores comunes al entrenar (y cómo evitarlos), por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  mascotas: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO INGRESO',
      subline: 'Lo último para tu mascota ya llegó.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNovedades para tu mascota en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'DESCUENTO', headline: 'SEMANA MASCOTERA',
      subline: 'Descuentos en alimento y accesorios.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nSemana mascotera en {BIZ}: descuentos en alimento y accesorios.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS DE CUIDADO',
      subline: 'Consejos para una mascota feliz y sana.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de cuidado para tu mascota, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  salud: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO TRATAMIENTO',
      subline: 'Tecnología de última generación.', cta: 'Quiero saber más',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo tratamiento disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'TURNO', headline: 'RESERVÁ TU TURNO',
      subline: 'Tu control de este mes, sin esperas.', cta: 'Reservar ahora',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu turno en {BIZ}. Atención personalizada, sin esperas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: '3 HÁBITOS SANOS',
      subline: 'Pequeños cambios, grandes resultados.', cta: 'Ver cuáles son',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 hábitos sanos que recomiendan en {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  hogar: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO SERVICIO',
      subline: 'Soluciones para tu casa, sin vueltas.', cta: 'Pedir presupuesto',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio en {BIZ}: lo resolvemos por vos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'PRESUPUESTO', headline: 'PRESUPUESTO GRATIS',
      subline: 'Te cotizamos sin cargo ni compromiso.', cta: 'Pedir el mío',
      caption: 'Mirá lo que tenemos para vos ✨\n\nPresupuesto gratis en {BIZ}. Contanos qué necesitás y te cotizamos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS PARA TU CASA',
      subline: 'Mantenimiento simple, sin llamar a nadie.', cta: 'Ver los tips',
      caption: 'Che, mirá esto 👀\n\n3 tips de mantenimiento para tu casa, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  inmobiliaria: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO INGRESO',
      subline: 'Propiedades que acaban de entrar.', cta: 'Quiero verlas',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevas propiedades disponibles en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'OPORTUNIDAD', headline: 'OPORTUNIDAD ÚNICA',
      subline: 'Precio especial por este mes.', cta: 'Me interesa',
      caption: 'Atención, que esto es posta 👇\n\nOportunidad única en {BIZ}: precio especial por tiempo limitado.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS PARA COMPRAR',
      subline: 'Lo que tenés que saber antes de decidir.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para comprar tu próxima propiedad, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  autos: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO INGRESO',
      subline: 'Unidades y servicios que acaban de llegar.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNovedades en {BIZ}: unidades y servicios nuevos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'SERVICE', headline: 'SERVICE COMPLETO',
      subline: 'Dejá tu auto en las mejores manos.', cta: 'Reservar service',
      caption: 'Atención, que esto es posta 👇\n\nService completo en {BIZ}: revisión, cambio de aceite y más.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS PARA TU AUTO',
      subline: 'Cuidá tu auto y evitá gastos grandes.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para cuidar tu auto, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  educacion: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO CURSO',
      subline: 'Inscripciones abiertas, cupos limitados.', cta: 'Quiero inscribirme',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo curso en {BIZ}: inscripciones abiertas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'BECA', headline: 'DESCUENTO LANZAMIENTO',
      subline: 'Precio especial para los primeros inscriptos.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nDescuento de lanzamiento en {BIZ}, solo para los primeros.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS PARA APRENDER',
      subline: 'Consejos para aprender más rápido.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para aprender más rápido, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  turismo: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO DESTINO',
      subline: 'Escapadas que te van a encantar.', cta: 'Quiero ir',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo destino disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', headline: 'ESCAPADA 2X1',
      subline: 'Viajá acompañado y pagá la mitad.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nEscapada 2x1 en {BIZ}: viajá acompañado.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS VIAJEROS',
      subline: 'Viajá mejor con estos consejos.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips viajeros por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  eventos: [
    { kind: 'novedad', tag: 'FECHA', headline: 'PRÓXIMA FECHA',
      subline: 'Ya podés reservar tu lugar.', cta: 'Reservar lugar',
      caption: 'Che, mirá esto 👀\n\nPróxima fecha en {BIZ}: reservá tu lugar.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'EARLY', headline: 'ENTRADAS ANTICIPADAS',
      subline: 'Precio especial hasta agotar stock.', cta: 'Comprar ahora',
      caption: 'Atención, que esto es posta 👇\n\nEntradas anticipadas para {BIZ} con precio especial.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS DE FIESTA',
      subline: 'Que tu evento salga perfecto.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips para que tu fiesta salga perfecta, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  tecnologia: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'ÚLTIMO MODELO',
      subline: 'Lo último en tecnología ya está acá.', cta: 'Quiero verlo',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nEl último modelo ya disponible en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', headline: 'OFERTA SEMANAL',
      subline: 'Precios especiales por pocos días.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nOferta semanal en {BIZ}: precios especiales.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TRUCOS ÚTILES',
      subline: 'Todo lo que tu equipo puede hacer.', cta: 'Ver los trucos',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 trucos para tu equipo, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  deco: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVA COLECCIÓN',
      subline: 'Piezas únicas para tu espacio.', cta: 'Quiero verla',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNueva colección en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'LIQUIDACIÓN', headline: 'HASTA 40% OFF',
      subline: 'Liquidación de temporada, por poco tiempo.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nHasta 40% off en {BIZ}: liquidación de temporada.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 IDEAS DECO',
      subline: 'Ideas para renovar tu espacio.', cta: 'Ver las ideas',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 ideas deco para tu casa, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  joyeria: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVA COLECCIÓN',
      subline: 'Piezas que brillan con luz propia.', cta: 'Quiero verla',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNueva colección en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'OFERTA', headline: 'SEMANA DORADA',
      subline: 'Descuentos en piezas seleccionadas.', cta: 'Aprovecharla',
      caption: 'Atención, que esto es posta 👇\n\nSemana dorada en {BIZ}: descuentos especiales.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: 'CÓMO CUIDARLAS',
      subline: 'Que tus piezas duren toda la vida.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\nCómo cuidar tus piezas, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  fotografia: [
    { kind: 'novedad', tag: 'PORTFOLIO', headline: 'NUEVO TRABAJO',
      subline: 'Lo último que creamos.', cta: 'Ver más',
      caption: 'Che, mirá esto 👀\n\nNuevo trabajo de {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'SESIÓN', headline: 'RESERVÁ TU SESIÓN',
      subline: 'Fechas abiertas para este mes.', cta: 'Reservar fecha',
      caption: 'Atención, que esto es posta 👇\n\nReservá tu sesión en {BIZ}: fechas abiertas.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS DE FOTO',
      subline: 'Mejores fotos con tu celular.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de foto con celular, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  profesionales: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVO SERVICIO',
      subline: 'Asesoramiento a tu medida.', cta: 'Consultar ahora',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nNuevo servicio en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'reserva', tag: 'CONSULTA', headline: 'PRIMERA CONSULTA',
      subline: 'Lo esencial, sin vueltas.', cta: 'Pedir consulta',
      caption: 'Atención, que esto es posta 👇\n\nPrimera consulta en {BIZ}: te escuchamos.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 CONSEJOS CLAVE',
      subline: 'Lo que tenés que saber antes de decidir.', cta: 'Ver los consejos',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 consejos clave, por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  flores: [
    { kind: 'novedad', tag: 'TEMPORADA', headline: 'FLORES DE TEMPORADA',
      subline: 'Lo más lindo de la estación.', cta: 'Quiero verlas',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nFlores de temporada en {BIZ}.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'promo', tag: 'RAMO', headline: 'ENVÍO GRATIS',
      subline: 'En todos los ramos de esta semana.', cta: 'Pedir el mío',
      caption: 'Atención, que esto es posta 👇\n\nEnvío gratis en ramos esta semana en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS DE RIEGO',
      subline: 'Que tus plantas vivan más.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips de riego y cuidado, por {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  bar: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NUEVA BIRRA',
      subline: 'La tirada que estabas esperando.', cta: 'Vengo hoy',
      caption: 'Che, mirá esto 👀\n\nNueva birra de la casa en {BIZ}.\n\nEtiquetá a quien lo necesita 🙋' },
    { kind: 'promo', tag: 'HAPPY HOUR', headline: 'HAPPY HOUR',
      subline: '2x1 todos los días de 18 a 20.', cta: 'Aprovecharlo',
      caption: 'Atención, que esto es posta 👇\n\nHappy hour en {BIZ}: 2x1 todos los días.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'social', tag: 'LA CASA', headline: 'EL PUNTO DE ENCUENTRO',
      subline: 'Tu mesa de siempre te espera.', cta: 'Reservar mesa',
      caption: 'Mirá lo que tenemos para vos ✨\n\nEl punto de encuentro de siempre: {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
  otro: [
    { kind: 'novedad', tag: 'NUEVO', headline: 'NOVEDAD',
      subline: 'Lo nuevo de esta semana ya está acá.', cta: 'Quiero saber más',
      caption: 'Che, mirá lo que acaba de llegar 👀\n\nLa novedad de la semana en {BIZ}.\n\nComentá INFO y te pasamos todo 👇' },
    { kind: 'promo', tag: 'PROMO', headline: 'PROMO ESPECIAL',
      subline: 'Beneficio exclusivo para seguidores.', cta: 'La aprovecho',
      caption: 'Atención, que esto es posta 👇\n\nPromo especial para seguidores de {BIZ}. Por tiempo limitado.\n\nEscribinos por DM y te lo reservamos 📩' },
    { kind: 'tip', tag: 'TIP', headline: '3 TIPS CLAVE',
      subline: 'Consejos de expertos, directo a tu feed.', cta: 'Ver los tips',
      caption: 'Mirá lo que tenemos para vos ✨\n\n3 tips clave por los expertos de {BIZ}.\n\nGuardá este post para no olvidarte 🔖' },
  ],
};

// Para "tú", titulares sin voseo
const TU_HEADLINES = {
  'VENÍ HOY': 'VEN HOY',
  'EMPEZÁ HOY': 'EMPIEZA HOY',
  'RESERVÁ TU TURNO': 'RESERVA TU TURNO',
  'RESERVÁ TU SESIÓN': 'RESERVA TU SESIÓN',
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
function renderDemoVideo(pngPath, runDir) {
  return new Promise((resolve, reject) => {
    const out = path.join(runDir, 'post-2.mp4');
    execFile('python3', [DEMO_VIDEO_SCRIPT, pngPath, out, '6'], (err, stdout, stderr) => {
      if (err) return reject(new Error('video: ' + String(stderr || err.message).slice(0, 200)));
      try { resolve(fs.readFileSync(out)); }
      catch (e) { reject(e); }
    });
  });
}

// ---------- Orquestador ----------
async function generateDemo({ business, category, country, tone, photoPath, goal, accent, btn }) {
  if (!pythonAvailable()) throw new Error('Generador no disponible en este momento');
  const cat = CATEGORIES.includes(category) ? category : 'otro';
  const { topics, goalLine } = applyGoal(DEMO_TOPICS[cat], goal);
  const bar = String(business || '').toUpperCase().slice(0, 26) || 'TU NEGOCIO';

  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-demo-'));
  try {
    const posts = topics.map((t, i) => {
      // Foto: la del usuario si la subió; si no, stock de la familia del rubro.
      const photo = photoPath || stockFor(cat, i);
      let headline = t.headline;
      if (tone === 'tu') headline = TU_HEADLINES[headline] || headline;
      return {
        photo,
        pill: t.tag,
        bar,
        headline,
        subline: t.subline,
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

    // 2 posteos estáticos + 1 video (el 3er diseño, animado con zoom suave).
    let videoB64 = null;
    try {
      const vbuf = await renderDemoVideo(path.join(runDir, 'post-2.png'), runDir);
      videoB64 = vbuf.toString('base64');
    } catch (e) {
      console.error('[posta] Video de la demo falló, devuelvo imagen:', e.message);
    }

    return [
      { type: 'image', image: made[0].image, caption: made[0].caption, hashtags: made[0].hashtags },
      { type: 'image', image: made[1].image, caption: made[1].caption, hashtags: made[1].hashtags },
      videoB64
        ? { type: 'video', video: 'data:video/mp4;base64,' + videoB64, caption: made[2].caption, hashtags: made[2].hashtags }
        : { type: 'image', image: made[2].image, caption: made[2].caption, hashtags: made[2].hashtags },
    ];
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
  CATEGORY_PHOTO,
  COUNTRIES,
};
