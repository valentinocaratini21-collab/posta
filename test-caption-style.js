// test-caption-style.js — Harness del Caption Style Lock (sin API real: todo mockeado).
// Uso: node test-caption-style.js
// Sale 0 si pasan todos los checks, 1 si alguno falla. NO toca la DB real.
'use strict';

process.env.OPENAI_API_KEY = 'sk-test-fake'; // analyzeCaptionStyle exige clave; el fetch está mockeado

const { DatabaseSync } = require('node:sqlite');
const {
  analyzeCaptionStyle, getCaptionStyle, captionStyleBlock,
  captionPromptExtras, isArgentineClient, CAPTION_CHECKLIST,
} = require('./caption-style');
const { generateContent, generateCaptions } = require('./generator');

// ---------- 5 negocios ficticios (rubros distintos) ----------
const BIZ = [
  { uid: 101, name: 'El Fogón de Tomi', cat: 'parrilla', tz: 'America/Argentina/Buenos_Aires', ig: 'ig_fogon', tone: 'informal rioplatense' },
  { uid: 102, name: 'Luna Indumentaria', cat: 'moda', tz: 'America/Argentina/Cordoba', ig: 'ig_luna', tone: 'canchero con humor' },
  { uid: 103, name: 'Corte & Color', cat: 'belleza', tz: 'America/Argentina/Mendoza', ig: 'ig_corte', tone: 'cercano y profesional' },
  { uid: 104, name: 'Fuerza Norte', cat: 'fitness', tz: 'America/Asuncion', ig: 'ig_fuerza', tone: 'directo y motivador' },
  { uid: 105, name: 'Huella Feliz', cat: 'mascotas', tz: 'America/Argentina/Buenos_Aires', ig: null, tone: null }, // SIN IG
];

const CAPTIONS = {
  ig_fogon: [
    'El vacío del domingo no se discute 🔥 Vuelta y vuelta y la mesa llena. Reservá por DM.',
    'Molleja crocante por fuera, jugosa por dentro. Vení hoy que vuela.',
    'Asado para 4 a precio de 2, solo este finde. Escribinos y te lo guardamos 🥩',
    '¿Team provoleta o team chorizo? Comentá y te regalamos la entrada 👇',
    'El chimichurri de la casa, receta del abuelo. Lo probás una vez y volvés.',
    'Parrillada completa para el partido de esta noche. Pedila por WhatsApp 📲',
    'Domingo en familia se escribe con F de Fogón. Te esperamos desde las 12.',
  ],
  ig_luna: [
    'Llegaron los vestidos de lino 😍 Quedan 4 en M. Escribinos por DM y te lo reservamos.',
    '3 formas de usar la misma campera 👇 Guardá este post para tu próximo look.',
    'Liquidación de invierno: hasta 40% off en sweaters. Cuando se acaba, se acaba.',
    'Probador lleno de clientas felices ✨ Vení a armar tu look con nosotras.',
    'El jean que te queda perfecto EXISTE y está acá. Pasá a probarlo.',
    'Nuevo ingreso: carteras de cuero hechas a mano. Escribinos por WhatsApp.',
    '¿Team total black o team color? Te leemos en comentarios 🖤',
  ],
  ig_corte: [
    'Antes y después que hablan solos 💇‍♀️ Turnos por DM, esta semana quedan 3.',
    'El balayage perfecto existe y lo hacemos acá. Reservá tu lugar.',
    '3 errores que arruinan tu color en casa 👇 El 2 lo hace todo el mundo.',
    'Corte + nutrición esta semana con 20% off. Escribinos y te agendamos.',
    'Rubio sano sí se puede, con el cuidado correcto. Te contamos cómo en el salón.',
    'Clienta feliz = peluquera feliz ✨ Gracias por confiar.',
    'Keratr... keratina brasileña sin formol. Reservá tu turno por WhatsApp.',
  ],
  ig_fuerza: [
    'Lunes. Sin excusas. Te esperamos 6am 💪',
    'La constancia le gana al talento. Vení a entrenar hoy.',
    'Plan anual con 20% off solo esta semana. Escribinos por DM.',
    'Sentadilla bien hecha > peso mal levantado. Técnica primero.',
    'Tu yo de diciembre te lo va a agradecer. Empezá hoy.',
    'Clase de prueba gratis, sin compromiso. Comentá INFO.',
    'Resultados reales de nuestros socios. Nada de filtros.',
  ],
  ig_pocos: [ // <6 captions → debe fallar con 'pocos captions'
    'Posteo uno de prueba con texto suficiente para pasar el filtro.',
    'Posteo dos de prueba con texto suficiente para pasar el filtro.',
    'Posteo tres de prueba con texto suficiente para pasar el filtro.',
  ],
};

// ---------- DB en memoria con el esquema mínimo que usa caption-style ----------
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE settings (user_id INTEGER PRIMARY KEY, openai_key TEXT DEFAULT '', ig_user_id TEXT DEFAULT '', ig_access_token TEXT DEFAULT '', timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires')`);
db.exec(`CREATE TABLE ig_caption_style (user_id INTEGER PRIMARY KEY, profile_json TEXT NOT NULL DEFAULT '', analyzed_at TEXT NOT NULL DEFAULT (datetime('now')))`);
for (const b of BIZ) {
  db.prepare('INSERT INTO settings (user_id, ig_user_id, ig_access_token, timezone) VALUES (?,?,?,?)')
    .run(b.uid, b.ig || '', b.ig ? 'tok_' + b.ig : '', b.tz);
}
db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token, timezone) VALUES (106,'ig_pocos','tok_pocos','America/Argentina/Buenos_Aires')").run();

// ---------- Mock de fetch: IG media + OpenAI ----------
const captured = []; // system prompts de generación de captions
let brokenOnce = { ig_luna: true }; // 1er análisis de Luna devuelve JSON roto → reintento
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const body = opts.body ? JSON.parse(opts.body) : {};
  // 1) IG media
  if (u.includes('graph.instagram.com')) {
    const m = u.match(/\/(\d+|ig_[a-z]+)\/media/) || u.match(/\/([a-z_0-9]+)\/media/);
    const igId = (u.match(/instagram\.com\/v26\.0\/([^?/]+)\/media/) || [])[1];
    const caps = CAPTIONS[igId] || [];
    return { ok: true, json: async () => ({ data: caps.map((c, i) => ({ id: 'm' + i, media_type: 'IMAGE', caption: c, timestamp: '2026-09-2' + i })) }) };
  }
  // 2) OpenAI
  if (u.includes('api.openai.com/v1/chat/completions')) {
    const sys = (body.messages || []).find((m) => m.role === 'system');
    const user = (body.messages || []).find((m) => m.role === 'user');
    const userText = (user && typeof user.content === 'string' ? user.content : '');
    // a) análisis de estilo de escritura
    if (userText.includes('perfil de escritura')) {
      const igId = Object.keys(CAPTIONS).find((k) => userText.includes(CAPTIONS[k][0].slice(0, 30)));
      const biz = BIZ.find((b) => b.ig === igId);
      if (brokenOnce[igId]) { brokenOnce[igId] = false; return { ok: true, json: async () => ({ choices: [{ message: { content: 'esto no es json {{{' } }] }) }; }
      const profile = {
        tone: (biz && biz.tone) || 'informal',
        emoji_style: 'moderado', avg_length: 32, cta_style: 'invita a escribir por DM',
        hashtag_style: '3-5 de nicho al final', opening_style: 'afirmación corta', persona: '2da persona',
      };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(profile) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }) };
    }
    // b) generación de captions: capturar el system prompt
    if (sys) captured.push(String(sys.content || ''));
    const fmt = body.response_format ? 'json' : 'text';
    if (userText.includes('Generá los') || (body.messages || []).some((m) => String(m.content || '').includes('Generá los'))) {
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ captions: ['Caption uno de prueba con CTA concreto: escribinos por WhatsApp.', 'Caption dos distinto, pasá por el local hoy.'], overlays: ['A', 'B'], hashtags: '#parrilla #asado' }) } }], usage: {} }) };
    }
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ caption: 'Los buzos de algodón ya están en el local. Pasá a probarlos o escribinos por WhatsApp.', overlay: 'LLEGÓ LO NUEVO', suboverlay: 'Quedan pocos talles', hashtags: '#moda #invierno' }) } }], usage: {} }) };
  }
  return realFetch(url, opts);
};

// ---------- Mini framework de asserts ----------
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
  console.log((cond ? '  ✅ ' : '  ❌ ') + name);
}

(async () => {
  console.log('\n== 1. analyzeCaptionStyle (4 con IG, perfiles distintos por user_id, sin hardcodes) ==');
  for (const b of BIZ.slice(0, 4)) {
    const r = await analyzeCaptionStyle(db, b.uid);
    check(`${b.name}: ok:true`, r.ok === true, JSON.stringify(r).slice(0, 120));
    check(`${b.name}: perfil con tone`, !!(r.profile && r.profile.tone), JSON.stringify(r.profile || {}).slice(0, 100));
    if (r.ok) check(`${b.name}: tone == "${b.tone}"`, r.profile.tone === b.tone, 'fue: ' + r.profile.tone);
    const row = db.prepare('SELECT profile_json FROM ig_caption_style WHERE user_id = ?').get(b.uid);
    check(`${b.name}: guardado en ig_caption_style`, !!(row && row.profile_json && row.profile_json.includes(b.tone)));
  }
  // Luna: el primer intento vino con JSON roto → el reintento lo rescató
  check('reintento ante JSON roto (Luna)', getCaptionStyle(db, 102) && getCaptionStyle(db, 102).tone === 'canchero con humor');

  console.log('\n== 2. Fallos silenciosos (nunca lanza) ==');
  const rNoIg = await analyzeCaptionStyle(db, 105);
  check('sin IG → {ok:false}', rNoIg.ok === false && /sin IG/.test(rNoIg.error || ''), rNoIg.error);
  const rPocos = await analyzeCaptionStyle(db, 106);
  check('<6 captions → {ok:false}', rPocos.ok === false && /pocos captions/.test(rPocos.error || ''), rPocos.error);
  check('getCaptionStyle(null) sin perfil', getCaptionStyle(db, 999) === null);
  check('captionStyleBlock(null) === ""', captionStyleBlock(null) === '');
  check('captionStyleBlock({}) === ""', captionStyleBlock({}) === '');

  console.log('\n== 3. captionPromptExtras: checklist siempre + bloque solo con perfil ==');
  const ex1 = captionPromptExtras(db, 101); // Fogón: AR + perfil
  check('checklist presente (con perfil)', ex1.includes('CHECKLIST ANTI-GENÉRICO'));
  check('bloque ESCRIBÍ COMO EL CLIENTE presente', ex1.includes('ESCRIBÍ COMO EL CLIENTE'));
  check('bloque trae el tone del cliente', ex1.includes('informal rioplatense'));
  check('línea rioplatense dura (AR)', ex1.includes('IDIOMA: el cliente es argentino'));
  const ex4 = captionPromptExtras(db, 104); // Fuerza: Asunción + perfil
  check('checklist presente (no-AR)', ex4.includes('CHECKLIST ANTI-GENÉRICO'));
  check('bloque presente (no-AR con perfil)', ex4.includes('ESCRIBÍ COMO EL CLIENTE'));
  check('SIN línea rioplatense dura (Asunción)', !ex4.includes('IDIOMA: el cliente es argentino'));
  const ex5 = captionPromptExtras(db, 105); // Huella: sin IG
  check('checklist presente (sin IG)', ex5.includes('CHECKLIST ANTI-GENÉRICO'));
  check('SIN bloque de estilo (sin IG)', !ex5.includes('ESCRIBÍ COMO EL CLIENTE'));
  check('checklist trae ≤5 hashtags', /MÁXIMO 5/.test(ex5));
  check('checklist trae CTA concreto', /CTA concreto SIEMPRE/.test(ex5));
  check('checklist trae 1 idea por posteo', /UNA idea por posteo/.test(ex5));
  check('checklist prohíbe muletillas', /¡Hola!/.test(ex5) && /¿Sabías que/.test(ex5));
  check('checklist matchea imagen', /MATCHEAR lo que muestra la imagen/.test(ex5));
  check('checklist prohíbe #love #instagood', /#love #instagood/.test(ex5));
  check('isArgentineClient AR=true', isArgentineClient(db, 101) === true);
  check('isArgentineClient Asunción=false', isArgentineClient(db, 104) === false);

  console.log('\n== 4. Inyección end-to-end en prompts de caption (generateContent / generateCaptions) ==');
  captured.length = 0;
  const baseInput = { business: 'El Fogón de Tomi', category: 'parrilla', tone: 'canchero', topic: 'promo del finde', competitors: '', goal: '', taste: '', tipo: '', feedback: '', performance: '', styleRules: [], voice: '', golden: [] };
  await generateContent({ ...baseInput, captionExtras: captionPromptExtras(db, 101) }, 'sk-test-fake');
  const sys1 = captured[captured.length - 1] || '';
  check('openaiGenerate: bloque de estilo inyectado', sys1.includes('ESCRIBÍ COMO EL CLIENTE'));
  check('openaiGenerate: checklist inyectado', sys1.includes('CHECKLIST ANTI-GENÉRICO'));
  check('openaiGenerate: conserva CAPTION_CRAFT', sys1.includes('TÉCNICAS DE HOOK'));
  check('openaiGenerate: conserva regla de identidad', sys1.includes('REGLA DE IDENTIDAD'));

  captured.length = 0;
  await generateCaptions({ ...baseInput, captionExtras: captionPromptExtras(db, 102) }, 2, 'sk-test-fake');
  const sys2 = captured[captured.length - 1] || '';
  check('openaiCaptions: bloque de estilo inyectado', sys2.includes('ESCRIBÍ COMO EL CLIENTE'));
  check('openaiCaptions: checklist inyectado', sys2.includes('CHECKLIST ANTI-GENÉRICO'));
  check('openaiCaptions: conserva ENERGY_SYSTEM', sys2.includes('redactor publicitario argentino'));

  console.log('\n== 5. Sin IG: el prompt no gana bloque de estilo (solo checklist, comportamiento intacto) ==');
  captured.length = 0;
  await generateContent({ ...baseInput, captionExtras: captionPromptExtras(db, 105) }, 'sk-test-fake');
  const sys3 = captured[captured.length - 1] || '';
  check('sin perfil: hay checklist', sys3.includes('CHECKLIST ANTI-GENÉRICO'));
  check('sin perfil: NO hay bloque de estilo', !sys3.includes('ESCRIBÍ COMO EL CLIENTE'));

  captured.length = 0;
  await generateContent({ ...baseInput }, 'sk-test-fake'); // sin captionExtras: baseline
  const sysBase = captured[captured.length - 1] || '';
  check('baseline sin extras: sin checklist', !sysBase.includes('CHECKLIST ANTI-GENÉRICO'));
  check('baseline sin extras: sin bloque', !sysBase.includes('ESCRIBÍ COMO EL CLIENTE'));
  check('baseline sin extras: conserva prompt original', sysBase.includes('TÉCNICAS DE HOOK'));

  console.log('\n========================================');
  console.log(`RESULTADO: ${pass} passed, ${fail} failed`);
  if (fails.length) { console.log('FALLOS:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('Sin OPENAI_API_KEY real en sesión: todos los llamados a OpenAI/IG fueron mocks.');
})().catch((e) => { console.error('HARNESS EXPLOTÓ:', e); process.exit(1); });
