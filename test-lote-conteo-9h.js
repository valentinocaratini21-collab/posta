// test-lote-conteo-9h.js — LOTE CONTEO-9H (11/11 · incidente «tenés 4 posteos
// esperando tu revisión» con la semana ya programada):
// El trigger drafts_pending de proactive.js contaba TODOS los borradores
// con status='draft' y created_at < -24h, sin filtrar por semana. El 11/11
// a las 9:00 contó 4 borradores viejos (581/584/586/580) del user 12
// mientras la semana 2026-11-09 ya estaba programada (592 publicado,
// 593/594/585/587/582 programados).
// Fix: el conteo SOLO cuenta borradores de la semana vigente
// (week_key = lunes de la semana actual en la zona del usuario).
// Borradores viejos (otra semana, sin week_key) nunca cuentan.
// Uso: node test-lote-conteo-9h.js (desde el scratch; corre contra release/).
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = path.join(__dirname, 'release');
const PRO = require(path.join(TREE, 'proactive.js'));
const STREAKS = require(path.join(TREE, 'streaks.js'));
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const PROSRC = fs.readFileSync(path.join(TREE, 'proactive.js'), 'utf8');

const TZ_NY = 'America/New_York';
const TZ_AR = 'America/Argentina/Buenos_Aires';
const sqlAgo = (days, h) => new Date(Date.now() - days * 864e5 - (h || 0) * 36e5).toISOString().slice(0, 19).replace('T', ' ');
const wkOf = (tz) => STREAKS.mondayKeyOf(STREAKS.tzToday(tz));
const prevOf = (wk) => STREAKS.shiftDays(wk, -7);

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan_status TEXT DEFAULT 'active',
  trial_ends_at INTEGER, trial_extended_until INTEGER, created_at TEXT DEFAULT (datetime('now')),
  proactive_trial_warned INTEGER DEFAULT 0, streak_count INTEGER DEFAULT 0, last_streak_date TEXT);
CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT DEFAULT 'draft',
  caption TEXT DEFAULT '', client_photo INTEGER DEFAULT 0, media_type TEXT DEFAULT 'image',
  week_key TEXT DEFAULT '', scheduled_at TEXT, published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), ig_likes INTEGER DEFAULT 0, ig_comments INTEGER DEFAULT 0);
CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires');
CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT DEFAULT 'photo');
CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, category TEXT DEFAULT '', business_name TEXT DEFAULT '');
CREATE TABLE proactive_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  idea_title TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));`);

const mkUser = (id, tz) => {
  db.prepare(`INSERT INTO users (id, email, plan_status, created_at, streak_count) VALUES (?, ?, 'active', ?, 0)`)
    .run(id, `u${id}@test.dev`, sqlAgo(30));
  db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`).run(id, tz);
  for (let i = 0; i < 3; i++) db.prepare(`INSERT INTO assets (user_id, kind) VALUES (?, 'photo')`).run(id);
};
const mkPost = (id, uid, status, weekKey, created, extra) => {
  const e = extra || {};
  db.prepare(`INSERT INTO posts (id, user_id, status, caption, week_key, created_at, published_at, scheduled_at, ig_likes, ig_comments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, uid, status, 'x', weekKey, created, e.published_at || null, e.scheduled_at || null, e.ig_likes || 0, e.ig_comments || 0);
};

// ===== A) REPRODUCCIÓN DEL INCIDENTE 11/11 (user 12, zona NY) =====
// Borradores viejos que el conteo viejo sumaba: 581 ('', 4d), 584 (semana
// vigente, 2d — alterno no elegido), 586 ('', 2d), 580 ('', 4d).
// Semana vigente programada: 592 publicado, 593/594 programados.
(function () {
  const uid = 12, tz = TZ_NY, wk = wkOf(tz);
  mkUser(uid, tz);
  mkPost(581, uid, 'draft', '', sqlAgo(4));
  mkPost(584, uid, 'draft', wk, sqlAgo(2));
  mkPost(586, uid, 'draft', '', sqlAgo(2));
  mkPost(580, uid, 'draft', '', sqlAgo(4));
  mkPost(592, uid, 'published', wk, sqlAgo(2), { published_at: sqlAgo(3), ig_likes: 2 });
  mkPost(593, uid, 'scheduled', wk, sqlAgo(2), { scheduled_at: sqlAgo(-1) });
  mkPost(594, uid, 'scheduled', wk, sqlAgo(2), { scheduled_at: sqlAgo(-2) });
  // Contra-prueba: el conteo VIEJO (sin filtro de semana) da 4 en este fixture.
  const oldN = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft' AND created_at < datetime('now', '-24 hours')`).get(uid).n;
  t('A1: contra-prueba — el conteo viejo da 4 en el fixture del incidente', oldN === 4, 'oldN=' + oldN);
  const trig = PRO.checkTriggers(db, uid);
  t('A2: incidente 11/11 — con la semana ya programada NO sale drafts_pending', !trig || trig.type !== 'drafts_pending', trig ? trig.type + ' :: ' + String(trig.message).slice(0, 80) : 'null');
  t('A3: incidente 11/11 — ningún trigger sale (semana programada, nada pendiente)', trig === null, trig ? trig.type : 'null');
})();

// ===== B) POSITIVO: 2 borradores de la semana vigente (>24h) SÍ avisan =====
(function () {
  const uid = 20, tz = TZ_AR, wk = wkOf(tz);
  mkUser(uid, tz);
  mkPost(201, uid, 'draft', wk, sqlAgo(2));
  mkPost(202, uid, 'draft', wk, sqlAgo(3));
  const trig = PRO.checkTriggers(db, uid);
  t('B1: 2 borradores vigentes (>24h) disparan drafts_pending', !!trig && trig.type === 'drafts_pending', trig ? trig.type : 'null');
  t('B2: el mensaje cuenta solo los 2 vigentes', !!trig && trig.message.includes('tenés 2 posteos esperando tu revisión'), trig ? String(trig.message).slice(0, 60) : 'null');
})();

// ===== C) UN solo borrador vigente + viejos NO empujan sobre el umbral =====
(function () {
  const uid = 21, tz = TZ_AR, wk = wkOf(tz), prev = prevOf(wk);
  mkUser(uid, tz);
  mkPost(211, uid, 'draft', wk, sqlAgo(2));
  mkPost(212, uid, 'draft', '', sqlAgo(3));
  mkPost(213, uid, 'draft', prev, sqlAgo(3));
  mkPost(214, uid, 'draft', prev, sqlAgo(4));
  const trig = PRO.checkTriggers(db, uid);
  t('C1: 1 vigente + 3 viejos NO disparan (los viejos no suman)', trig === null, trig ? trig.type + ' :: ' + String(trig.message).slice(0, 60) : 'null');
})();

// ===== D) FRESCURA: borradores vigentes de <24h NO avisan (regla 24h intacta) =====
(function () {
  const uid = 22, tz = TZ_AR, wk = wkOf(tz);
  mkUser(uid, tz);
  mkPost(221, uid, 'draft', wk, sqlAgo(0, 2));
  mkPost(222, uid, 'draft', wk, sqlAgo(0, 5));
  const trig = PRO.checkTriggers(db, uid);
  t('D1: 2 borradores vigentes de <24h NO disparan', trig === null, trig ? trig.type : 'null');
})();

// ===== E) SEMANA PROGRAMADA, 0 borradores: nada =====
(function () {
  const uid = 23, tz = TZ_AR, wk = wkOf(tz);
  mkUser(uid, tz);
  mkPost(231, uid, 'scheduled', wk, sqlAgo(1), { scheduled_at: sqlAgo(-1) });
  mkPost(232, uid, 'scheduled', wk, sqlAgo(1), { scheduled_at: sqlAgo(-2) });
  mkPost(233, uid, 'published', wk, sqlAgo(1), { published_at: sqlAgo(3), ig_likes: 1 });
  const trig = PRO.checkTriggers(db, uid);
  t('E1: semana programada sin borradores: ningún trigger', trig === null, trig ? trig.type : 'null');
})();

// ===== F) ESTÁTICOS: el filtro vive en el código + estampado =====
t('F1: proactive.js filtra el conteo por week_key de la semana vigente',
  PROSRC.includes('AND week_key = ?') && PROSRC.includes('mondayKeyOf') && PROSRC.includes('tzToday'));
t('F2: el bloque drafts_pending ya NO cuenta sin filtro de semana',
  !/SELECT COUNT\(\*\) AS n FROM posts\s+WHERE user_id = \? AND status = 'draft'\s+AND created_at/.test(PROSRC));
t('F3: BUILD_ID 20261105-v893', SRV.includes("const BUILD_ID = '20261105-v893'"));
t('F4: ?v=608 intacto (el lote no toca app.js)', SRV.includes('app.js?v=608') || !fs.existsSync(path.join(TREE, 'public', 'index.html')) || fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8').includes('app.js?v=608'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
