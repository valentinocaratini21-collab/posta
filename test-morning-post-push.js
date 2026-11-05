// test-morning-post-push.js — PUSH MATUTINA «Tu posteo de hoy ya está».
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
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, scheduled_at TEXT, status TEXT);
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
function post(db, id, uid, sched, status) {
  db.prepare('INSERT INTO posts (id, user_id, scheduled_at, status) VALUES (?, ?, ?, ?)').run(id, uid, sched, status || 'scheduled');
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
  ok(M.morningText('es').body === 'Tu posteo de hoy ya está 👇', 'texto ES exacto de Valentino');
  ok(M.morningText('en').body === 'Your post for today is ready 👇', 'texto EN espejo');

  // --- Integración con DB ---
  const db = freshDb();
  const sent = [];
  const pushFn = async (uid, payload) => { sent.push({ uid, payload }); return { ok: true, sent: 1 }; };
  user(db, 1, 'es', 'America/Argentina/Buenos_Aires'); sub(db, 1); post(db, 11, 1, '2026-11-02T21:00:00Z');
  user(db, 2, 'es', 'America/Argentina/Buenos_Aires'); post(db, 21, 2, '2026-11-02T21:00:00Z'); // sin suscripción
  user(db, 3, 'es', 'America/Argentina/Buenos_Aires'); sub(db, 3); post(db, 31, 3, '2026-11-03T21:00:00Z'); // solo mañana
  user(db, 4, 'en', 'America/Argentina/Buenos_Aires'); sub(db, 4); post(db, 41, 4, '2026-11-02T21:00:00Z');
  user(db, 5, 'es', 'America/Argentina/Buenos_Aires', 1); sub(db, 5); post(db, 51, 5, '2026-11-02T21:00:00Z'); // publishing_stopped
  user(db, 6, 'es', 'America/Argentina/Buenos_Aires'); sub(db, 6); post(db, 61, 6, '2026-11-02T06:00:00Z', 'published'); // ya salió
  user(db, 7, 'es', 'America/New_York'); sub(db, 7); post(db, 71, 7, '2026-11-02T13:00:00Z'); // 09:00 NY = 14:00 UTC

  const r1 = await M.sendMorningPostPush(db, { now: MON_09_BA, pushFn });
  ok(r1.sent === 2, 'barrido 09:00 BA: envía solo a 1 (ES) y 4 (EN), no a 2/3/5/6/7 (sent=' + r1.sent + ')');
  ok(sent.length === 2, 'dos pushes capturados');
  const p1 = sent.find((s) => s.uid === 1);
  ok(p1 && p1.payload.body === 'Tu posteo de hoy ya está 👇' && p1.payload.url === '/#/app/ritual' && p1.payload.data.postId === '11', 'push 1: texto ES, url ritual (lote 5/8: la push abre el paquete del día), postId del posteo');
  const p4 = sent.find((s) => s.uid === 4);
  ok(p4 && p4.payload.body === 'Your post for today is ready 👇', 'push 4: texto EN');
  ok(db.prepare('SELECT COUNT(*) AS n FROM morning_post_push').get().n === 2, 'dedup: 2 filas marcadas');
  const r2 = await M.sendMorningPostPush(db, { now: new Date('2026-11-02T12:10:00Z'), pushFn });
  ok(r2.sent === 0 && sent.length === 2, 'segundo barrido mismo día en ventana: 0 reenvíos (dedup)');
  const r3 = await M.sendMorningPostPush(db, { now: MON_12_BA, pushFn });
  ok(r3.sent === 0, 'fuera de ventana (12:00 BA / 10:00 NY): 0 envíos aunque falte NY');
  const r4 = await M.sendMorningPostPush(db, { now: new Date('2026-11-02T14:00:00Z'), pushFn });
  ok(r4.sent === 1 && sent.some((s) => s.uid === 7), '09:00 NY: envía al usuario 7 en su zona');
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
