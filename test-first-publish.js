// test-first-publish.js — Harness de la mejora 2/3 "Garantizar el primer posteo".
// Uso: node test-first-publish.js
// Sale 0 si pasan todos los checks, 1 si alguno falla. NO toca la DB real
// (usa node:sqlite en memoria) ni envía emails de verdad (fetch stubbeado).
'use strict';

process.env.OPENAI_API_KEY = 'test';
process.env.RESEND_API_KEY = 'fake-key-harness';

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

function hoursAgo(h) {
  const d = new Date(Date.now() - h * 3600 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' '); // "YYYY-MM-DD HH:MM:SS" UTC
}

function makeDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, created_at TEXT,
      plan_status TEXT DEFAULT 'trial', trial_ends_at INTEGER,
      trial_extended_until INTEGER, email_opt_out INTEGER DEFAULT 0,
      client_name TEXT DEFAULT '', first_publish_nudged INTEGER DEFAULT 0,
      first_publish_nudged_at TEXT DEFAULT ''
    );
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, status TEXT DEFAULT 'draft');
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT, created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE nudges (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, sent_at TEXT DEFAULT (datetime('now')));
  `);
  return db;
}
function addUser(db, { h = 25, email = 'u@test.com', plan = 'trial', trialH = 48, optOut = 0, name = '' } = {}) {
  const r = db.prepare(
    `INSERT INTO users (email, created_at, plan_status, trial_ends_at, email_opt_out, client_name)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(email, hoursAgo(h), plan, Date.now() + trialH * 3600 * 1000, optOut, name);
  return Number(r.lastInsertRowid);
}

// ---------- 1. Nudge proactivo en el chat ----------
console.log('\n[1] Nudge proactivo en el chat (first-publish-nudge.js)');
{
  const { firstPublishNudge, FP_MSG } = require('./first-publish-nudge');
  const db = makeDb();
  check('mensaje con el copy pedido', FP_MSG === '🚀 ¿Publicamos tu primero? Te lo dejo listo en 1 tap 👇 [first-publish]');

  const a = addUser(db, { h: 25 });                       // trial 25h, 0 publicados → SÍ
  const b = addUser(db, { h: 25, email: 'b@t.com' });      // 1 publicado → NO
  db.prepare(`INSERT INTO posts (user_id, status) VALUES (?, 'published')`).run(b);
  const c = addUser(db, { h: 5, email: 'c@t.com' });       // 5h (<24h) → NO
  const d = addUser(db, { h: 25, email: 'd@t.com', trialH: -1 }); // trial vencido → NO
  const e = addUser(db, { h: 40, email: 'e@t.com' });      // 40h (ventana activación 36-60) → NO
  const f = addUser(db, { h: 70, email: 'f@t.com' });      // 70h, trial válido → SÍ
  const g = addUser(db, { h: 30, email: 'g@t.com', plan: 'active' }); // plan pago, 0 publicados → SÍ

  const r1 = firstPublishNudge(db);
  check('dispara para los candidatos (3)', r1.sent === 3, `sent=${r1.sent}`);
  const msgs = (uid) => db.prepare(`SELECT text FROM chat_messages WHERE user_id = ? AND role = 'assistant'`).all(uid).map(x => x.text);
  check('A (25h, trial) recibe el mensaje', msgs(a).length === 1 && msgs(a)[0].includes('[first-publish]'));
  check('F (70h, trial) recibe el mensaje', msgs(f).length === 1);
  check('G (plan active) recibe el mensaje', msgs(g).length === 1);
  check('B (1 publicado) no recibe nada', msgs(b).length === 0);
  check('C (5h) no recibe nada', msgs(c).length === 0);
  check('D (trial vencido) no recibe nada', msgs(d).length === 0);
  check('E (40h, ventana activación) no recibe nada hoy', msgs(e).length === 0);
  check('flag first_publish_nudged=1 en A', db.prepare(`SELECT first_publish_nudged AS f FROM users WHERE id = ?`).get(a).f === 1);
  check('timestamp first_publish_nudged_at seteado', !!db.prepare(`SELECT first_publish_nudged_at AS t FROM users WHERE id = ?`).get(a).t);

  const r2 = firstPublishNudge(db);
  check('una sola vez: 2da corrida no reenvía', r2.sent === 0 && msgs(a).length === 1, `sent=${r2.sent}`);
  db.close();
}

// ---------- 2. Email día 2 ----------
console.log('\n[2] Email día 2 (sendFirstPublishEmails)');
{
  const captured = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    captured.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, text: async () => '' };
  };
  const { sendFirstPublishEmails } = require('./scheduler');
  const db = makeDb();
  const g = addUser(db, { h: 25, email: 'g2@t.com', name: 'Gise' });
  db.prepare(`INSERT INTO posts (user_id, status) VALUES (?, 'draft')`).run(g); // 1 borrador
  const h = addUser(db, { h: 25, email: 'h@t.com' });
  db.prepare(`INSERT INTO posts (user_id, status) VALUES (?, 'published')`).run(h); // publicado → NO
  const i = addUser(db, { h: 25, email: 'i@t.com' }); // 0 borradores → SÍ (copy alternativo)
  const j = addUser(db, { h: 5, email: 'j@t.com' });  // 5h → NO
  const k = addUser(db, { h: 25, email: 'k@t.com', optOut: 1 }); // opt-out → NO
  const l = addUser(db, { h: 100, email: 'l@t.com' }); // 100h → fuera de ventana → NO

  (async () => {
    const r1 = await sendFirstPublishEmails(db);
    check('envía a los 2 candidatos (con/sin borradores)', r1.sent === 2, `sent=${r1.sent}`);
    check('capturados 2 POST a Resend', captured.length === 2, `n=${captured.length}`);
    const bodies = captured.map(c => c.body);
    const mailG = bodies.find(b => b.to[0] === 'g2@t.com');
    const mailI = bodies.find(b => b.to[0] === 'i@t.com');
    check('asunto día 2', !!mailG && /primer posteo/i.test(mailG.subject), mailG && mailG.subject);
    check('CTA directo a publicar (link a la app)', !!mailG && mailG.html.includes('/#/app/schedule') && mailG.html.includes('🚀 Publicar mi primero'));
    check('copy honesto con borradores', !!mailG && /armo|armados/i.test(mailG.html));
    check('copy honesto sin borradores (genera primero)', !!mailI && /armo tu primer posteo/i.test(mailI.html));
    check('el de 1 publicado no recibe email', !bodies.some(b => b.to[0] === 'h@t.com'));
    check('el de 5h no recibe email', !bodies.some(b => b.to[0] === 'j@t.com'));
    check('opt-out no recibe email', !bodies.some(b => b.to[0] === 'k@t.com'));
    check('fuera de ventana (100h) no recibe email', !bodies.some(b => b.to[0] === 'l@t.com'));
    const nudgeRows = db.prepare(`SELECT COUNT(*) AS n FROM nudges WHERE kind = 'first_publish'`).get().n;
    check("idempotencia en tabla nudges (kind='first_publish')", nudgeRows === 2, `n=${nudgeRows}`);
    captured.length = 0;
    const r2 = await sendFirstPublishEmails(db);
    check('una sola vez: 2da corrida no reenvía', r2.sent === 0 && captured.length === 0, `sent=${r2.sent}`);
    globalThis.fetch = realFetch;
    db.close();
    staticChecks();
  })().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(1); });
}

// ---------- 3. Checks estáticos del frontend + scheduler ----------
function staticChecks() {
  console.log('\n[3] Frontend (public/app.js) + wiring del scheduler');
  const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  const sch = fs.readFileSync(path.join(__dirname, 'scheduler.js'), 'utf8');
  const eml = fs.readFileSync(path.join(__dirname, 'email.js'), 'utf8');
  check('card firstPublishCardHTML definida', app.includes('function firstPublishCardHTML('));
  check('botón con id btnFirstPublish', app.includes('id="btnFirstPublish"'));
  check('visible solo con 0 publicados', app.includes('(!published.length) ? firstPublishCardHTML(drafts)'));
  check('bloque fpBlock en el template de Schedule', app.includes('${fpBlock}'));
  check('bindFirstPublish en bindSchedule', app.includes("bindFirstPublish();"));
  check('flujo usa publish-now (endpoint existente)', app.includes('publishNowFlow(drafts[0].id'));
  check('sin borradores: genera con el flujo existente', app.includes("runAutopilotSmart(1, 'schedule')"));
  check('marcador [first-publish] renderiza banner', app.includes('FP_MARKER_RE') && app.includes('data-fp-pub'));
  check('banner lleva a Schedule + auto-disparo', app.includes("posta_fp_auto") && app.includes('autoClickFirstPublish'));
  check('cron nudge chat 12:00 ART', sch.includes("'0 12 * * *'") && sch.includes('firstPublishNudge(db)'));
  check('cron email día 2 14:00 ART', sch.includes("'0 14 * * *'") && sch.includes('sendFirstPublishEmails(db)'));
  check('sendFirstPublishEmails exportado', sch.includes('sendFirstPublishEmails,'));
  check('email firstPublishNudgeEmail exportado', /firstPublishNudgeEmail\s*};/.test(eml));

  console.log(`\n==== RESULTADO: ${pass} ok, ${fail} fallidos ====`);
  process.exit(fail ? 1 : 0);
}
