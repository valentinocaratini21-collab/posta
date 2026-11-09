// test-morning-post-push.js — PUSH MATUTINA «Hoy sale este — sale a las 19:00»
// (LOTE RITUAL-SIN-VELO · 9/11 · orden Valentino «el ritual solo
// confirma, no revela»: el cuerpo viejo «Tu posteo de hoy ya está 👇»
// murió — implicaba algo escondido por abrir. La push es RICA: lleva
// la foto del posteo adjunta (payload.image, absoluta) y la hora real
// de salida. El video no lleva adjunto.)
// Suite del módulo morning-post-push.js con DB en memoria (node:sqlite).
// Ninguna llamada toca push real: el transporte se captura con pushFn stub.
// Ventana 9:00 hora de cada cuenta (decisión Valentino 2/11 ~21:09; el
// scratch traía 08:00–09:00 y se actualizó con causa en la liberación).
// Uso: node test-morning-post-push.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };

const M = require('./morning-post-push');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, lang TEXT DEFAULT 'es', publishing_stopped INTEGER DEFAULT 0);
    CREATE TABLE settings (user_id INTEGER, timezone TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, scheduled_at TEXT, status TEXT, image_path TEXT, media_type TEXT);
    CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');`);
  return db;
}
function user(db, id, lang, tz, stopped) {
  db.prepare('INSERT INTO users (id, email, lang, publishing_stopped) VALUES (?, ?, ?, ?)').run(id, 'u' + id + '@test.dev', lang || 'es', stopped || 0);
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?, ?)').run(id, tz || 'America/Argentina/Buenos_Aires');
}
function sub(db, uid) {
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint) VALUES (?, ?)').run(uid, 'https://push.test/' + uid);
}
function post(db, id, uid, sched, status, imagePath, mediaType) {
  db.prepare('INSERT INTO posts (id, user_id, scheduled_at, status, image_path, media_type) VALUES (?, ?, ?, ?, ?, ?)').run(id, uid, sched, status || 'scheduled', imagePath || null, mediaType || null);
}

// Lunes 2/11/2026 12:00 UTC = 09:00 BA (dentro de ventana) = 07:00 NY (fuera).
const MON_09_BA = new Date('2026-11-02T12:00:00Z');
const MON_12_BA = new Date('2026-11-02T15:00:00Z');

(async () => {
  // --- Puras: zona, ventana, selección ---
  ok(M.dayKeyInTz(new Date('2026-11-02T02:00:00Z'), 'America/Argentina/Buenos_Aires') === '2026-11-01', 'día en zona: 02:00 UTC es 23:00 del día anterior en BA');
  ok(M.dayKeyInTz(new Date('2026-11-02T12:00:00Z'), 'America/Argentina/Buenos_Aires') === '2026-11-02', 'día en zona: 12:00 UTC es 2/11 en BA');
  ok(M.inMorningWindow(new Date('2026-11-02T11:59:00Z'), 'America/Argentina/Buenos_Aires') === false, '08:59 BA fuera de ventana');
  ok(M.inMorningWindow(MON_09_BA, 'America/Argentina/Buenos_Aires') === true, '09:00 BA dentro de ventana');
  ok(M.inMorningWindow(new Date('2026-11-02T12:59:00Z'), 'America/Argentina/Buenos_Aires') === true, '09:59 BA dentro de ventana');
  ok(M.inMorningWindow(new Date('2026-11-02T13:00:00Z'), 'America/Argentina/Buenos_Aires') === false, '10:00 BA fuera de ventana');
  ok(M.pickTodayPost([
    { id: 1, scheduled_at: '2026-11-03T21:00:00Z', status: 'scheduled' },
    { id: 2, scheduled_at: '2026-11-02T21:00:00Z', status: 'scheduled' },
    { id: 3, scheduled_at: '2026-11-02T20:00:00Z', status: 'scheduled' },
    { id: 4, scheduled_at: '2026-11-02T20:00:00Z', status: 'published' },
  ], 'America/Argentina/Buenos_Aires', MON_09_BA).id === 3, 'pick: el más temprano de hoy, ignora mañana y publicado');
  ok(M.pickTodayPost([{ id: 1, scheduled_at: '2026-11-03T21:00:00Z', status: 'scheduled' }], 'America/Argentina/Buenos_Aires', MON_09_BA) === null, 'pick: sin posteo hoy → null');
  ok(M.morningText('es').body === 'Hoy sale este — sale a las 19:00', 'texto ES exacto de Valentino (sin velo: muestra, no anuncia algo escondido)');
  ok(M.morningText('en').body === "Today's post is ready — goes out at 7:00 PM", 'texto EN espejo');
  ok(M.morningText('es', '18:00').body === 'Hoy sale este — sale a las 18:00', 'texto ES con la hora real del posteo (no el default)');
  ok(M.morningText('en', '6:00 PM').body === "Today's post is ready — goes out at 6:00 PM", 'texto EN con la hora real del posteo');
  ok(M.saleHourInTz('2026-11-02T21:00:00Z', 'America/Argentina/Buenos_Aires', 'es') === '18:00', 'hora de salida ES 24 h en la zona de la cuenta');
  ok(M.saleHourInTz('2026-11-02T21:00:00Z', 'America/Argentina/Buenos_Aires', 'en') === '6:00 PM', 'hora de salida EN 12 h en la zona de la cuenta');
  ok(M.postImageUrl('/media/u1/foto.jpg') === 'https://postycommunitymanager.com/media/u1/foto.jpg', 'URL del adjunto: relativa → absoluta canónica');
  ok(M.postImageUrl('https://postyhacetodo.com/media/x.jpg') === 'https://postycommunitymanager.com/media/x.jpg', 'URL del adjunto: dominio viejo → canónico');
  ok(M.postImageUrl('') === null && M.postImageUrl(null) === null, 'URL del adjunto: sin foto → null');
  ok(M.postImageForPush({ image_path: '/media/a.jpg', media_type: 'image' }) === 'https://postycommunitymanager.com/media/a.jpg', 'adjunto: imagen sí');
  ok(M.postImageForPush({ image_path: '/media/c1.jpg', media_type: 'carousel' }) === 'https://postycommunitymanager.com/media/c1.jpg', 'adjunto: carrusel sí (primera foto)');
  ok(M.postImageForPush({ image_path: '/media/v.mp4', media_type: 'video' }) === null, 'adjunto: video NO lleva imagen');
  ok(M.postImageForPush({ image_path: null, media_type: 'image' }) === null, 'adjunto: sin image_path → null');

  // --- Integración con DB ---
  const db = freshDb();
  const sent = [];
  const pushFn = async (uid, payload) => { sent.push({ uid, payload }); return { ok: true, sent: 1 }; };
  user(db, 1, 'es', 'America/Argentina/Buenos_Aires'); sub(db, 1); post(db, 11, 1, '2026-11-02T22:00:00Z', 'scheduled', '/media/11.jpg', 'image'); // 19:00 BA
  user(db, 2, 'es', 'America/Argentina/Buenos_Aires'); post(db, 21, 2, '2026-11-02T21:00:00Z'); // sin suscripción
  user(db, 3, 'es', 'America/Argentina/Buenos_Aires'); sub(db, 3); post(db, 31, 3, '2026-11-03T21:00:00Z'); // solo mañana
  user(db, 4, 'en', 'America/Argentina/Buenos_Aires'); sub(db, 4); post(db, 41, 4, '2026-11-02T22:00:00Z', 'scheduled', '/media/41.mp4', 'video'); // 19:00 BA
  user(db, 5, 'es', 'America/Argentina/Buenos_Aires', 1); sub(db, 5); post(db, 51, 5, '2026-11-02T21:00:00Z'); // publishing_stopped
  user(db, 6, 'es', 'America/Argentina/Buenos_Aires'); sub(db, 6); post(db, 61, 6, '2026-11-02T06:00:00Z', 'published'); // ya salió
  user(db, 7, 'es', 'America/New_York'); sub(db, 7); post(db, 71, 7, '2026-11-02T22:00:00Z', 'scheduled', '/media/71.jpg', 'carousel'); // 17:00 NY; la push llega 09:00 NY = 14:00 UTC

  const r1 = await M.sendMorningPostPush(db, { now: MON_09_BA, pushFn });
  ok(r1.sent === 2, 'barrido 09:00 BA: envía solo a 1 (ES) y 4 (EN), no a 2/3/5/6/7 (sent=' + r1.sent + ')');
  ok(sent.length === 2, 'dos pushes capturados');
  const p1 = sent.find((s) => s.uid === 1);
  ok(p1 && p1.payload.body === 'Hoy sale este — sale a las 19:00' && p1.payload.url === '/#/app/ritual' && p1.payload.data.postId === '11', 'push 1: texto ES nuevo, url ritual, postId del posteo');
  ok(p1 && p1.payload.image === 'https://postycommunitymanager.com/media/11.jpg', 'push 1: lleva la foto del posteo adjunta (URL absoluta)');
  const p4 = sent.find((s) => s.uid === 4);
  ok(p4 && p4.payload.body === "Today's post is ready — goes out at 7:00 PM", 'push 4: texto EN nuevo');
  ok(p4 && !p4.payload.image, 'push 4: video NO lleva imagen adjunta');
  ok(db.prepare('SELECT COUNT(*) AS n FROM morning_post_push').get().n === 2, 'dedup: 2 filas marcadas');
  const r2 = await M.sendMorningPostPush(db, { now: new Date('2026-11-02T12:10:00Z'), pushFn });
  ok(r2.sent === 0 && sent.length === 2, 'segundo barrido mismo día en ventana: 0 reenvíos (dedup)');
  const r3 = await M.sendMorningPostPush(db, { now: MON_12_BA, pushFn });
  ok(r3.sent === 0, 'fuera de ventana (12:00 BA / 10:00 NY): 0 envíos aunque falte NY');
  const r4 = await M.sendMorningPostPush(db, { now: new Date('2026-11-02T14:00:00Z'), pushFn });
  ok(r4.sent === 1 && sent.some((s) => s.uid === 7), '09:00 NY: envía al usuario 7 en su zona');
  const p7 = sent.find((s) => s.uid === 7);
  ok(p7 && p7.payload.body === 'Hoy sale este — sale a las 17:00' && p7.payload.image === 'https://postycommunitymanager.com/media/71.jpg', 'push 7: hora de salida en la zona de la cuenta (17:00 NY) + foto del carrusel');
  ok(db.prepare('SELECT COUNT(*) AS n FROM morning_post_push').get().n === 3, 'dedup: 3 filas (una por usuario/día)');

  // Fallo de transporte: no se marca, se puede reintentar en ventana.
  const db2 = freshDb();
  user(db2, 9, 'es', 'America/Argentina/Buenos_Aires'); sub(db2, 9); post(db2, 91, 9, '2026-11-02T21:00:00Z');
  const rFail = await M.sendMorningPostPush(db2, { now: MON_09_BA, pushFn: async () => ({ ok: false, reason: 'no_subs' }) });
  ok(rFail.sent === 0 && db2.prepare('SELECT COUNT(*) AS n FROM morning_post_push').get().n === 0, 'fallo de envío: no se marca (reintento posible en ventana)');
  const rOk = await M.sendMorningPostPush(db2, { now: MON_09_BA, pushFn });
  ok(rOk.sent === 1, 'reintento tras fallo: envía');

  console.log(`\nRESULTADO: ${pass} ok / ${fail} fallos`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
