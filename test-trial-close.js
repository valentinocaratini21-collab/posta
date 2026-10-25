// test-trial-close.js — AVISO DE CIERRE DE PRUEBA (2026-10-25 · A5).
// Verifica sendTrialCloseNotices (scheduler.js), el ÚNICO aviso del fin de
// la prueba (reemplaza al «vence mañana», apagado en la misma tanda):
//  - Sale SOLO cuando la prueba ya terminó sin compra (fin efectivo vencido).
//  - Una única vez por cuenta (trial_closed_notified, durable, antes de avisar).
//  - Canal ÚNICO por disponibilidad: push si lo habilitó; email SOLO como
//    respaldo si no tiene push. Los dos jamás.
//  - Sin semana real (posteos) no hay aviso: el copy promete esa semana.
//  - El email de respaldo abre con la cara (regla de los dos motivos).
// NO toca la DB real (node:sqlite en memoria) ni envía de verdad (fetch
// stubbeado; el push queda sin VAPID a propósito: alcanza para probar que
// la pierna email NO se dispara cuando el canal elegido es push).
'use strict';

process.env.RESEND_API_KEY = 'test-key';
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}
const DAY = 86400000;

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, created_at TEXT,
      lang TEXT DEFAULT 'es', plan_status TEXT DEFAULT 'trial',
      trial_ends_at INTEGER, trial_extended_until INTEGER,
      email_opt_out INTEGER DEFAULT 0, client_name TEXT DEFAULT ''
    );
    CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '');
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, status TEXT DEFAULT 'draft');
    CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT, keys_json TEXT, transport TEXT DEFAULT 'webpush');
  `);
  return db;
}
function addUser(db, { daysAgo = 10, trialDays = 3, plan = 'trial', email = 'u@t.com', optOut = 0, name = 'Ana', biz = 'Café Sol', posts = 3, pushSub = false, lang = 'es' } = {}) {
  const created = new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 19).replace('T', ' ');
  const ends = Date.now() - (daysAgo - trialDays) * DAY; // fin del trial (puede ser futuro si trialDays > daysAgo)
  const r = db.prepare(`INSERT INTO users (email, created_at, plan_status, trial_ends_at, email_opt_out, client_name, lang) VALUES (?,?,?,?,?,?,?)`)
    .run(email, created, plan, ends, optOut, name, lang);
  const id = Number(r.lastInsertRowid);
  db.prepare(`INSERT INTO profiles (user_id, business_name) VALUES (?,?)`).run(id, biz);
  for (let i = 0; i < posts; i++) db.prepare(`INSERT INTO posts (user_id, status) VALUES (?, 'paused')`).run(id);
  if (pushSub) db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, keys_json) VALUES (?, 'https://push.example/x', '{}')`).run(id);
  return id;
}

(async () => {
  console.log('\n[1] Aviso de cierre: selección, canal único e idempotencia');
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    captured.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, text: async () => '' };
  };
  const db = makeDb();
  require('./push').initPush(db);
  const { sendTrialCloseNotices, sendTrialExpiryEmails, sendTrialAbandonEmails } = require('./scheduler');

  const uPush = addUser(db, { email: 'push@t.com', pushSub: true });            // vencida + push → canal push
  const uMail = addUser(db, { email: 'mail@t.com', pushSub: false });           // vencida sin push → email respaldo
  const uVigente = addUser(db, { email: 'vig@t.com', daysAgo: 1, trialDays: 3 });// trial vigente → no
  const uSinSemana = addUser(db, { email: 'vacia@t.com', posts: 0 });           // vencida sin semana → no
  const uPaga = addUser(db, { email: 'paga@t.com', plan: 'active' });           // con suscripción → no
  const uOptOut = addUser(db, { email: 'opt@t.com', optOut: 1 });               // vencida, sin push, opt-out → silencio marcado

  const r1 = await sendTrialCloseNotices(db);
  const flag = (id) => db.prepare('SELECT trial_closed_notified AS f FROM users WHERE id = ?').get(id).f;
  check('email de respaldo: exactamente 1 envío', captured.length === 1, `n=${captured.length}`);
  check('el envío es para la cuenta sin push', captured.length === 1 && captured[0].body.to[0] === 'mail@t.com');
  check('asunto del cierre', captured.length === 1 && captured[0].body.subject === 'Tu prueba terminó — tu semana quedó guardada 💙', captured[0] && captured[0].body.subject);
  const vis = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  check('el email abre con la cara', captured.length === 1 && captured[0].body.html.includes('/ai-avatar.png') && vis(captured[0].body.html).includes('Posty — tu community manager'));
  check('el email nombra su negocio', captured.length === 1 && captured[0].body.html.includes('Café Sol'));
  check('cuenta con push: marcada avisada (canal push elegido)', flag(uPush) === 1);
  check('cuenta con push: NO recibió email (los dos jamás)', !captured.some((c) => c.body.to[0] === 'push@t.com'));
  check('cuenta email: marcada avisada', flag(uMail) === 1);
  check('trial vigente: sin marca ni aviso', flag(uVigente) === 0);
  check('sin semana real: sin marca ni aviso', flag(uSinSemana) === 0);
  check('con suscripción: fuera del barrido', flag(uPaga) === 0);
  check('opt-out sin push: marcada en silencio, sin email', flag(uOptOut) === 1 && !captured.some((c) => c.body.to[0] === 'opt@t.com'));
  check('retorno: 1 email, 0 push entregados (sin VAPID en test)', r1.email === 1 && r1.push === 0, JSON.stringify(r1));

  captured.length = 0;
  const r2 = await sendTrialCloseNotices(db);
  check('idempotente: 2da corrida no avisa a nadie', r2.sent === 0 && captured.length === 0, `sent=${r2.sent}`);

  console.log('\n[2] Los avisos reemplazados quedan apagados');
  const rOld = await sendTrialExpiryEmails(db);
  check('«vence mañana» apagado con marca', rOld.sent === 0 && rOld.disabled === 'regla-dos-motivos');
  const rAb = await sendTrialAbandonEmails(db);
  check('abandono de prueba apagado con marca', rAb.sent === 0 && rAb.disabled === 'regla-dos-motivos');
  check('ningún envío extra a Resend', captured.length === 0, `n=${captured.length}`);

  globalThis.fetch = realFetch;
  db.close();

  console.log('\n[3] Wiring estático');
  const sch = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
  check('cron del cierre cada hora', sch.includes("'15 * * * *'") && sch.includes('sendTrialCloseNotices(db)'));
  check('sendTrialCloseNotices exportado', sch.includes('sendTrialCloseNotices,'));
  check('columna durable trial_closed_notified', sch.includes('trial_closed_notified'));

  console.log(`\n==== RESULTADO: ${pass} ok, ${fail} fallidos ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
