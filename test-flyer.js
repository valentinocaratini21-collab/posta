// test-flyer.js — MODO FLYER · BOLICHES (v315)
// Contrato que verifica:
//  1. El banco de arte cumple el contrato del modo: vertical, SIN texto
//     y con el CENTRO VACÍO para la tipografía, en los 10 estilos.
//  2. DATOS REALES O NADA: sin fiesta o sin fecha no hay paquete; la
//     fecha ISO inválida se rechaza; sin fecha ISO no hay cuenta
//     regresiva (sus placas solo son verdad con día exacto).
//  3. El paquete nace BORRADOR en la Agenda: flyer de feed (1080×1350)
//     + historia (1080×1920) + 3 historias de cuenta regresiva con su
//     scheduled_at verdadero (T-3, T-1, día del evento).
//  4. El caption sale SOLO de los datos del dueño: la promo de barra
//     aparece únicamente si él la cargó; jamás un precio inventado.
//  5. Fail-closed: sin motor de imagen, error visible (sin_motor_imagen)
//     y cero posteos creados.
// Sin IA paga: el arte de prueba es un PNG sintético local.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

const flyer = require('./flyer');

// ---------- 1. Banco de arte ----------
console.log('— Banco de prompts de arte:');
ok(flyer.STYLE_KEYS.length >= 8, `estilos del modo flyer: ${flyer.STYLE_KEYS.length}`);
for (const k of flyer.STYLE_KEYS) {
  const st = flyer.FLYER_STYLES[k];
  ok(/Vertical/.test(st.prompt) && /EMPTY CENTER/.test(st.prompt) && /no text/.test(st.prompt),
    `${k}: prompt vertical, sin texto, centro vacío`);
  ok(/#[0-9A-Fa-f]{6}/.test(st.accent) && /#[0-9A-Fa-f]{6}/.test(st.glow), `${k}: accent+glow válidos`);
}

// ---------- 2. Validación: datos reales o nada ----------
console.log('— Validación del evento:');
const full = flyer.validateEvent({
  fiesta: 'Halloween', fechaTexto: 'sábado 31 de octubre', fechaISO: '2026-10-31',
  lineup: 'DJ Luna, Marco Vélez', apertura: '00:30', entradas: 'anticipadas en el link', edad: '+18',
});
ok(full.ok && full.value.lineup.length === 2, 'evento completo válido; lineup por comas parseado');
ok(full.value.estilo === 'halloween', 'estilo auto por temática: Halloween');
ok(flyer.styleForEvent({ fiesta: 'Techno Night' }) === 'techno', 'estilo auto: techno');
const sinFiesta = flyer.validateEvent({ fechaTexto: 'sábado' });
ok(!sinFiesta.ok && sinFiesta.missing.includes('fiesta'), 'sin fiesta → missing fiesta');
const sinFecha = flyer.validateEvent({ fiesta: 'X' });
ok(!sinFecha.ok && sinFecha.missing.includes('fecha'), 'sin fecha → missing fecha');
const malaISO = flyer.validateEvent({ fiesta: 'X', fechaTexto: 'y', fechaISO: '2026-02-30' });
ok(!malaISO.ok && malaISO.error === 'fecha_invalida', 'fecha ISO inexistente → rechazada');

// ---------- 3. Cuenta regresiva verdadera ----------
console.log('— Cuenta regresiva:');
ok(flyer.countdownPlan({ fechaISO: '' }).length === 0, 'sin fecha ISO no hay cuenta regresiva');
const plan = flyer.countdownPlan({ fechaISO: '2026-10-31', fiesta: 'Halloween' });
ok(plan.length === 3, 'con fecha ISO: 3 placas');
ok(plan[0].scheduled_at === '2026-10-28 20:00:00' && plan[1].scheduled_at === '2026-10-30 20:00:00'
  && plan[2].scheduled_at === '2026-10-31 12:00:00', 'scheduled_at verdaderos T-3 / T-1 / día');

// ---------- 4. Caption: solo datos del dueño ----------
console.log('— Caption con datos reales:');
const conPromo = flyer.captionFor({ fiesta: 'Halloween', fechaTexto: 'sábado 31', lineup: ['DJ Luna'], promo: '2x1 en barra hasta la 1', apertura: '00:30', entradas: '', edad: '+18' }, 'NOCTA Club', '@nocta.club', 'es');
ok(conPromo.caption.includes('2x1 en barra hasta la 1'), 'la promo REAL del dueño sale textual');
const sinPromo = flyer.captionFor({ fiesta: 'Halloween', fechaTexto: 'sábado 31', lineup: [], promo: '', apertura: '', entradas: '', edad: '' }, 'NOCTA Club', '', 'es');
ok(!/2x1|%|apertura/i.test(sinPromo.caption.replace('Halloween en NOCTA Club', '')), 'sin datos no aparece promo ni apertura inventadas');

// ---------- 5. Paquete E2E (DB en memoria, arte sintético) ----------
console.log('— Paquete completo:');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flyer-test-'));
execFileSync('python3', ['-c', `
from PIL import Image, ImageDraw
im = Image.new('RGB', (400, 500), (12, 4, 24))
d = ImageDraw.Draw(im)
d.ellipse([130, 20, 270, 160], fill=(120, 40, 200))
im.save('${path.join(tmp, 'art.png')}')
`]);
const artB64 = fs.readFileSync(path.join(tmp, 'art.png')).toString('base64');
function newDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT,
    caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image',
    source_topic TEXT DEFAULT '', source_angle TEXT DEFAULT '', tipo TEXT DEFAULT '', strategy_why TEXT DEFAULT '',
    week_key TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, scheduled_at TEXT)`);
  flyer.ensureTable(db);
  return db;
}
function imgSize(file) {
  const out = execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${file}'); print(im.size[0], im.size[1])`]).toString().trim();
  const [w, h] = out.split(' ').map(Number);
  return { w, h };
}
(async () => {
  const db = newDb();
  const res = await flyer.createFlyerPackage({
    db, uid: 7, event: { fiesta: 'Halloween', fechaTexto: 'sábado 31 de octubre', fechaISO: '2026-10-31', lineup: ['DJ Luna'], apertura: '00:30', edad: '+18' },
    digest: {}, profile: { business_name: 'NOCTA Club', ig_username: 'nocta.club' },
    mediaDir: tmp, genArt: async () => artB64, weekKey: '2026-10-26', lang: 'es',
  });
  const posts = db.prepare('SELECT * FROM posts ORDER BY id').all();
  ok(posts.length === 5, `5 borradores (feed + historia + 3 cuenta regresiva): ${posts.length}`);
  ok(posts.every((p) => p.status === 'draft'), 'todo nace borrador');
  ok(posts[0].media_type === 'image' && posts[0].tipo === 'flyer' && posts[0].scheduled_at === '2026-10-31 18:00:00', 'feed: image/flyer, día del evento 18:00');
  ok(posts.slice(1).every((p) => p.media_type === 'story'), 'historia + cuenta regresiva como story');
  const feedSize = imgSize(path.join(tmp, path.basename(res.files.feed)));
  ok(feedSize.w === 1080 && feedSize.h === 1350, `flyer feed 1080×1350 (${feedSize.w}×${feedSize.h})`);
  const storySize = imgSize(path.join(tmp, path.basename(res.files.story)));
  ok(storySize.w === 1080 && storySize.h === 1920, `historia 1080×1920 (${storySize.w}×${storySize.h})`);
  ok(posts[0].caption.includes('Halloween') && posts[0].caption.includes('NOCTA Club'), 'caption con fiesta y club reales');

  const db2 = newDb();
  const res2 = await flyer.createFlyerPackage({
    db: db2, uid: 7, event: { fiesta: 'Fiesta de la Espuma', fechaTexto: 'este sábado' },
    digest: {}, profile: { business_name: 'NOCTA Club' }, mediaDir: tmp, genArt: async () => artB64, weekKey: '', lang: 'es',
  });
  const posts2 = db2.prepare('SELECT * FROM posts').all();
  ok(posts2.length === 2 && res2.countdown.length === 0, 'sin fecha ISO: feed + historia, sin cuenta regresiva');
  ok(posts2[0].scheduled_at === null, 'sin fecha ISO el borrador no finge horario');

  let code = '';
  try {
    await flyer.createFlyerPackage({ db: newDb(), uid: 7, event: { fiesta: 'X', fechaTexto: 'hoy' }, digest: {}, profile: { business_name: 'N' }, mediaDir: tmp, genArt: null, weekKey: '', lang: 'es' });
  } catch (e) { code = e.code || ''; }
  ok(code === 'sin_motor_imagen', 'sin motor de imagen → error visible sin_motor_imagen');

  let code2 = '';
  const db3 = newDb();
  try {
    await flyer.createFlyerPackage({ db: db3, uid: 7, event: { fechaTexto: 'hoy' }, digest: {}, profile: { business_name: 'N' }, mediaDir: tmp, genArt: async () => artB64, weekKey: '', lang: 'es' });
  } catch (e) { code2 = e.code || ''; }
  const posts3 = db3.prepare('SELECT * FROM posts').all();
  ok(code2 === 'missing_data' && posts3.length === 0, 'sin fiesta → missing_data y cero posteos');

  console.log(fails ? `\n❌ test-flyer: ${fails} fallas` : '\n✅ test-flyer: todo OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FALLO E2E', e); process.exit(1); });
