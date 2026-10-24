// test-publish-watchdog.js — Vigía de vencidos (2026-10-23, v353).
// Doctrina: "sin registro durable, no hay promesa" — ningún posteo
// 'scheduled' vencido sin recibo verificado puede perderse en silencio.
// Cubre: vencido sin recibo → reprogramado para la cola única; vencido
// reincidente → escalado con nombre propio (registro durable + evento);
// retenido por needs_review → escalado sin pausa ni reintento; borrador
// viejo → ignorado; dentro de la gracia → ignorado; publicado con
// recibo (ledger o evidencia legacy) → ignorado; integración: tras la
// reprogramación, processDuePosts (la cola única) lo publica de verdad.
// DB scratch en memoria; Instagram stubbeado vía require.cache.
// Uso: node test-publish-watchdog.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-media-'));
for (const f of ['a.jpg', 'b.jpg']) fs.writeFileSync(path.join(mediaDir, f), 'x');
process.env.MEDIA_DIR = mediaDir;

const igCalls = [];
const igPath = require.resolve('./instagram.js');
require.cache[igPath] = { id: igPath, filename: igPath, loaded: true, exports: {
  publishPost: async () => { igCalls.push('post'); return { success: true, permalink: 'https://instagram.com/p/x', mediaId: 'm-post' }; },
  publishVideo: async () => { igCalls.push('video'); return { success: true, permalink: 'https://instagram.com/p/x', mediaId: 'm-video' }; },
  publishStory: async () => { igCalls.push('story'); return { success: true, permalink: 'https://instagram.com/p/x', mediaId: 'm-story' }; },
  publishCarousel: async () => { igCalls.push('carousel'); return { success: true, permalink: 'https://instagram.com/p/x', mediaId: 'm-carousel' }; },
}};
global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, body: null });

const guard = require('./publish-guard');
const watchdog = require('./publish-watchdog');
const schedPath = require.resolve('./scheduler.js');
delete require.cache[schedPath];
const scheduler = require('./scheduler.js');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, plan_status TEXT DEFAULT 'active', trial_ends_at TEXT, trial_extended_until TEXT, created_at TEXT DEFAULT '2026-10-01 00:00:00', first_post_at TEXT, trial_pause_notified INTEGER DEFAULT 0, email TEXT DEFAULT 'u@test.dev', name TEXT DEFAULT 'Test', email_opt_out INTEGER DEFAULT 0, publishing_stopped INTEGER DEFAULT 0);
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, demo_mode INTEGER DEFAULT 0, image_base_url TEXT DEFAULT '', ig_user_id TEXT DEFAULT 'ig1', ig_access_token TEXT DEFAULT 'tok', ig_token_warning INTEGER DEFAULT 0);
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT, caption TEXT DEFAULT 'cap', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'approved', notified INTEGER DEFAULT 0, notify_at TEXT, media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source TEXT DEFAULT '', error TEXT DEFAULT '', ig_permalink TEXT DEFAULT '', ig_media_id TEXT DEFAULT '', published_at TEXT, created_at TEXT DEFAULT '2026-10-20 00:00:00', win_celebrated INTEGER DEFAULT 0, user_stopped INTEGER DEFAULT 0);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT);
    CREATE TABLE post_signals (user_id INTEGER, post_id INTEGER, hashtags TEXT, scheduled_for TEXT, rubro TEXT, client_signal TEXT, week_key TEXT, auto_signal INTEGER);
    CREATE TABLE profiles (user_id INTEGER, category TEXT DEFAULT '');
    CREATE TABLE funnel_events (user_id INTEGER, event TEXT);
  `);
  db.prepare('INSERT INTO users (id) VALUES (1)').run();
  db.prepare('INSERT INTO settings (user_id, demo_mode) VALUES (1, 0)').run();
  guard.ensureSchema(db);
  watchdog.ensureSchema(db);
  return db;
}
function mkPost(db, over = {}) {
  const at = over.at || new Date(Date.now() - 2 * 3600e3).toISOString();
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, scheduled_at, status, approval, media_type, source)
    VALUES (1, ?, ?, ?, 'approved', 'image', '')`).run(over.img || '/media/a.jpg', at, over.status || 'scheduled');
  const id = Number(r.lastInsertRowid);
  if (over.needs_review) db.prepare('UPDATE posts SET needs_review = 1 WHERE id = ?').run(id);
  if (over.ig_media_id) db.prepare('UPDATE posts SET ig_media_id = ? WHERE id = ?').run(over.ig_media_id, id);
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
}
const getPost = (db, id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
const NO_NOTIFY = { notify: false };

(async () => {
  // ---------- 0) Contrato en el código fuente ----------
  const sched = fs.readFileSync(__dirname + '/scheduler.js', 'utf8');
  const server = fs.readFileSync(__dirname + '/server.js', 'utf8');
  const dbjs = fs.readFileSync(__dirname + '/db.js', 'utf8');
  check('scheduler requiere publish-watchdog', sched.includes("require('./publish-watchdog')"));
  check('scheduler programa el barrido del vigía', sched.includes('publishWatchdog.sweep'));
  check('BUILD_ID v353', server.includes("20261023-v353"));
  check('db.js crea publish_ledger', dbjs.includes('CREATE TABLE IF NOT EXISTS publish_ledger'));
  check('db.js crea publish_watchdog_escalations', dbjs.includes('CREATE TABLE IF NOT EXISTS publish_watchdog_escalations'));

  // ---------- 1) parseTime en ambos formatos ----------
  check('parseTime formato SQLite (UTC)', watchdog.parseTime('2026-10-22 10:00:00') === Date.parse('2026-10-22T10:00:00Z'));
  check('parseTime formato ISO', watchdog.parseTime('2026-10-22T10:00:00.000Z') === Date.parse('2026-10-22T10:00:00Z'));

  // ---------- 2) Vencido sin recibo → reprogramado ----------
  {
    const db = freshDb();
    const before = Date.now();
    const p = mkPost(db, {});
    const r = watchdog.sweep(db, NO_NOTIFY);
    const after = getPost(db, p.id);
    check('barrido cuenta 1 reprogramado', r.requeued === 1 && r.escalated === 0, JSON.stringify(r));
    check('sigue scheduled (no publica el vigía)', after.status === 'scheduled');
    check('reprogramado a ahora (inmediato)', new Date(after.scheduled_at).getTime() >= before - 1000, after.scheduled_at);
    const led = db.prepare(`SELECT status FROM publish_ledger WHERE post_id = ?`).all(p.id).map(x => x.status);
    check('ledger asienta watchdog_requeue', led.includes('watchdog_requeue'), led.join(','));
    const ev = db.prepare(`SELECT props FROM events WHERE name = 'post_watchdog_requeued' AND user_id = 1`).all();
    check('evento post_watchdog_requeued con post_id y hora original', ev.length === 1 && /"post_id":\s*\d+/.test(ev[0].props) && /original_scheduled_at/.test(ev[0].props));
    // Segundo barrido inmediato: está dentro de la gracia → no se repite.
    const r2 = watchdog.sweep(db, NO_NOTIFY);
    check('sin ráfagas: 2º barrido no lo toca', r2.requeued === 0 && r2.escalated === 0);
  }

  // ---------- 3) Vencido reincidente → escalado con nombre ----------
  {
    const db = freshDb();
    const p = mkPost(db, {});
    for (let i = 0; i < 3; i++) guard.record(db, { userId: 1, postId: p.id, kind: 'feed', status: 'watchdog_requeue', detail: 'previa' });
    const r = watchdog.sweep(db, NO_NOTIFY);
    check('reincidente: escalado, no reprogramado', r.escalated === 1 && r.requeued === 0, JSON.stringify(r));
    const esc = db.prepare(`SELECT * FROM publish_watchdog_escalations WHERE post_id = ?`).all(p.id);
    check('escalación durable con nombre propio', esc.length === 1 && esc[0].user_id === 1 && esc[0].reason === 'repeated_overdue_no_receipt' && esc[0].original_scheduled_at === p.scheduled_at, JSON.stringify(esc));
    check('reincidente queda paused (visible, no programado sano)', getPost(db, p.id).status === 'paused');
    const ev = db.prepare(`SELECT name FROM events WHERE name = 'post_watchdog_escalated'`).all();
    check('evento post_watchdog_escalated registrado', ev.length === 1);
    const r2 = watchdog.sweep(db, NO_NOTIFY);
    check('la escalación no se duplica', r2.escalated === 0 && db.prepare(`SELECT COUNT(*) AS c FROM publish_watchdog_escalations`).get().c === 1);
  }

  // ---------- 4) Retenido por needs_review → escalado, sin pausa ----------
  {
    const db = freshDb();
    const p = mkPost(db, { needs_review: 1 });
    const r = watchdog.sweep(db, NO_NOTIFY);
    check('needs_review: escalado sin reintento', r.escalated === 1 && r.requeued === 0, JSON.stringify(r));
    const esc = db.prepare(`SELECT reason FROM publish_watchdog_escalations WHERE post_id = ?`).all(p.id);
    check('motivo needs_review_hold', esc.length === 1 && esc[0].reason === 'needs_review_hold');
    check('needs_review: el posteo NO se pausa ni se mueve', getPost(db, p.id).status === 'scheduled' && getPost(db, p.id).scheduled_at === p.scheduled_at);
    const r2 = watchdog.sweep(db, NO_NOTIFY);
    check('needs_review: escalación deduplicada por hora original', r2.escalated === 0);
  }

  // ---------- 5) Borrador viejo / dentro de la gracia → ignorados ----------
  {
    const db = freshDb();
    const draft = mkPost(db, { status: 'draft', at: new Date(Date.now() - 48 * 3600e3).toISOString() });
    const fresh = mkPost(db, { at: new Date(Date.now() - 5 * 60e3).toISOString() }); // 5 min: dentro de la gracia (15)
    const r = watchdog.sweep(db, NO_NOTIFY);
    check('borrador viejo ignorado', getPost(db, draft.id).status === 'draft' && r.requeued === 0 && r.escalated === 0, JSON.stringify(r));
    check('dentro de la gracia ignorado', getPost(db, fresh.id).scheduled_at === fresh.scheduled_at);
    check('sin filas del vigía para ignorados', db.prepare(`SELECT COUNT(*) AS c FROM publish_ledger WHERE status LIKE 'watchdog%'`).get().c === 0);
  }

  // ---------- 6) Publicado con recibo → ignorado ----------
  {
    const db = freshDb();
    const withLedger = mkPost(db, {});
    guard.record(db, { userId: 1, postId: withLedger.id, kind: 'feed', status: 'published', detail: 'm-1' });
    const withLegacy = mkPost(db, { img: '/media/b.jpg', ig_media_id: 'm-legacy' });
    const r = watchdog.sweep(db, NO_NOTIFY);
    check('con recibo en ledger: ignorado', r.requeued === 0 && getPost(db, withLedger.id).scheduled_at === withLedger.scheduled_at, JSON.stringify(r));
    check('con evidencia legacy (ig_media_id): ignorado', getPost(db, withLegacy.id).scheduled_at === withLegacy.scheduled_at);
  }

  // ---------- 7) Integración: la cola única lo publica tras reprogramar ----------
  {
    const db = freshDb();
    const p = mkPost(db, {});
    igCalls.length = 0;
    const r = watchdog.sweep(db, NO_NOTIFY);
    check('integración: vigía reprograma', r.requeued === 1);
    await scheduler.processDuePosts(db);
    check('integración: processDuePosts publica por la cola única', getPost(db, p.id).status === 'published' && igCalls.join(',') === 'post', igCalls.join(','));
    const led = db.prepare(`SELECT status FROM publish_ledger WHERE post_id = ? ORDER BY id`).all(p.id).map(x => x.status);
    check('integración: ledger completo (requeue → attempted → published)', led.join(',') === 'watchdog_requeue,attempted,published', led.join(','));
  }

  console.log(`\n${pass} ✅ / ${fail} ❌`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
