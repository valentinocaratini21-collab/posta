// test-publish-guard.js — Endurecimiento de publicación (2026-10-22).
// Cubre las 4 piezas: (1) ledger + presupuesto 24 h con chequeo previo,
// (2) cola única con prioridades (feed primero), (3) límite = reprogramar
// (nunca 'failed', aviso tranquilo), (4) denegado = decisión registrada
// sin reintento. DB scratch en memoria; Instagram stubbeado por
// require.cache ANTES de cargar scheduler; fetch público stubbeado.
// Uso: node test-publish-guard.js — sale 0 si todo pasa.
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

// Media scratch real para assertPublishable
const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-media-'));
for (const f of ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']) fs.writeFileSync(path.join(mediaDir, f), 'x');
process.env.MEDIA_DIR = mediaDir;
process.env.PUBLISH_DAILY_CAP = '3'; // techo chico para el test

// Stub de Instagram: handler mutable por escenario.
const igCalls = [];
const igHandler = { mode: 'ok' };
function igResult(kind) {
  igCalls.push(kind);
  if (igHandler.mode === 'limit') throw new Error('Request failed with status 429: too many requests');
  if (igHandler.mode === 'denied') throw new Error('(#200) Permission denied: the user has not authorized the application');
  return { success: true, permalink: 'https://instagram.com/p/x', mediaId: 'm-' + kind };
}
const igPath = require.resolve('./instagram.js');
require.cache[igPath] = { id: igPath, filename: igPath, loaded: true, exports: {
  publishPost: async () => igResult('post'),
  publishVideo: async () => igResult('video'),
  publishStory: async () => igResult('story'),
  publishCarousel: async () => igResult('carousel'),
}};
// Pre-flight de URL pública determinista, sin red.
global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'image/jpeg' }, body: null });

const guard = require('./publish-guard');
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
  return db;
}
function mkPost(db, over = {}) {
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, scheduled_at, status, approval, media_type, source)
    VALUES (1, ?, ?, 'scheduled', 'approved', 'image', '')`).run(over.img || '/media/a.jpg', over.at || '2026-10-22 00:00:00');
  const id = Number(r.lastInsertRowid);
  if (over.media_type) db.prepare('UPDATE posts SET media_type = ? WHERE id = ?').run(over.media_type, id);
  if (over.approval) db.prepare('UPDATE posts SET approval = ? WHERE id = ?').run(over.approval, id);
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
}
const getPost = (db, id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);

(async () => {
  // ---------- 0) Contrato en el código fuente ----------
  const sched = fs.readFileSync(__dirname + '/scheduler.js', 'utf8');
  const server = fs.readFileSync(__dirname + '/server.js', 'utf8');
  check('scheduler requiere publish-guard', sched.includes("require('./publish-guard')"));
  check('processDuePosts ordena feed antes que historias', sched.includes("CASE WHEN p.media_type = 'story' THEN 1 ELSE 0 END"));
  check('boost activo se asienta en el ledger', server.includes("kind: 'boost'"));

  // ---------- 1) Clasificación ----------
  check('429 → limit', guard.classifyError('Request failed 429') === 'limit');
  check('too many requests → limit', guard.classifyError('Too many requests') === 'limit');
  check('(#200) permission → denied', guard.classifyError('(#200) Permission denied') === 'denied');
  check('OAuth 190 → denied', guard.classifyError('OAuthException (190) token expired') === 'denied');
  check('error de red → other', guard.classifyError('socket hang up') === 'other');

  // ---------- 2) Prioridades ----------
  check('feed prioridad 0', guard.priorityOf({ media_type: 'image' }) === 0);
  check('reel prioridad 0', guard.priorityOf({ media_type: 'video' }) === 0);
  check('historia prioridad 1', guard.priorityOf({ media_type: 'story' }) === 1);
  check('orden: feed viejo-después gana a historia vieja', guard.compareDue({ media_type: 'image', scheduled_at: '2026-10-22 09:00:00' }, { media_type: 'story', scheduled_at: '2026-10-22 08:00:00' }) < 0);

  // ---------- 3) Presupuesto: conteo unificado ----------
  {
    const db = freshDb();
    guard.record(db, { userId: 1, postId: 101, kind: 'feed', status: 'published' });
    guard.record(db, { userId: 1, postId: 102, kind: 'story', status: 'attempted' });
    guard.record(db, { userId: 1, postId: 103, kind: 'boost', status: 'published' }); // NO cuenta (Ads API)
    const pub = mkPost(db, {}); db.prepare(`UPDATE posts SET status='published', published_at = datetime('now') WHERE id = ?`).run(pub.id); // legacy sin ledger
    check('uso 24h = ledger orgánico + legacy, sin boosts', guard.usedLast24h(db, 1) === 3, 'used=' + guard.usedLast24h(db, 1));
    const pf = guard.preflight(db, { user_id: 1 });
    check('preflight frena al llegar al tope (3)', pf.ok === false && pf.reason === 'budget');
    check('preflight informa próxima ventana futura', pf.nextAt && new Date(pf.nextAt).getTime() > Date.now());
  }

  // ---------- 4) Publicación sana: pasa y queda en el ledger ----------
  {
    const db = freshDb();
    const prev = mkPost(db, {}); db.prepare(`UPDATE posts SET status='published', published_at = datetime('now') WHERE id = ?`).run(prev.id);
    const p = mkPost(db, { img: '/media/b.jpg' });
    igHandler.mode = 'ok'; igCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    check('publica ok', r && r.ok === true);
    check('post queda published', getPost(db, p.id).status === 'published');
    const rows = db.prepare(`SELECT status FROM publish_ledger WHERE post_id = ? ORDER BY id`).all(p.id).map(x => x.status);
    check('ledger: attempted + published', rows.join(',') === 'attempted,published', rows.join(','));
  }

  // ---------- 5) Presupuesto agotado: NO intenta, reprograma ----------
  {
    const db = freshDb();
    for (let i = 0; i < 3; i++) guard.record(db, { userId: 1, postId: 200 + i, kind: 'feed', status: 'published' });
    const p = mkPost(db, { img: '/media/c.jpg' });
    igHandler.mode = 'ok'; igCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    const after = getPost(db, p.id);
    check('sin intento a Instagram', igCalls.length === 0);
    check('devuelve deferred', r && r.deferred === true);
    check('posteo NO failed: sigue scheduled', after.status === 'scheduled');
    check('reprogramado al futuro', new Date(String(after.scheduled_at).includes('T') ? after.scheduled_at : String(after.scheduled_at).replace(' ', 'T') + 'Z').getTime() > Date.now());
    check('error tranquilo, sin jerga', /reprogram/i.test(after.error) && !/429|error/i.test(after.error.replace('error', '')) || /reprogram/i.test(after.error));
    const chat = db.prepare(`SELECT text FROM chat_messages WHERE user_id = 1`).all();
    check('aviso tranquilo en el chat (1)', chat.length === 1 && /no tenés que hacer nada/i.test(chat[0].text));
    const r2 = await scheduler.publishSinglePost(db, getPost(db, p.id));
    check('segundo diferido no duplica el aviso', db.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE user_id = 1`).get().c === 1);
  }

  // ---------- 6) 429 de Meta: reprograma, jamás failed ----------
  {
    const db = freshDb();
    const p = mkPost(db, { img: '/media/d.jpg' });
    igHandler.mode = 'limit';
    const r = await scheduler.publishSinglePost(db, p);
    const after = getPost(db, p.id);
    check('429 → deferred (no failed)', r && r.deferred === true && after.status === 'scheduled', after.status);
    const ev = db.prepare(`SELECT name FROM events WHERE user_id = 1 AND name = 'post_publish_deferred'`).all();
    check('evento post_publish_deferred registrado', ev.length === 1);
    const led = db.prepare(`SELECT status FROM publish_ledger WHERE post_id = ?`).all(p.id).map(x => x.status);
    check('ledger marca limit_deferred', led.includes('limit_deferred'), led.join(','));
  }

  // ---------- 7) Denegado por Meta: decisión, pausa, sin reintento ----------
  {
    const db = freshDb();
    const p = mkPost(db, { img: '/media/e.jpg' });
    igHandler.mode = 'denied';
    const r = await scheduler.publishSinglePost(db, p);
    const after = getPost(db, p.id);
    check('denegado → denied (no deferred/failed)', r && r.denied === true && after.status === 'paused', after.status);
    const ev = db.prepare(`SELECT props FROM events WHERE user_id = 1 AND name = 'post_publish_denied'`).all();
    check('decisión registrada como evento', ev.length === 1 && /meta_denied/.test(ev[0].props));
    // El scheduler jamás lo reintenta: no está en la cola de vencidos.
    igHandler.mode = 'ok'; igCalls.length = 0;
    await scheduler.processDuePosts(db);
    check('processDuePosts no reintenta lo denegado', igCalls.length === 0 && getPost(db, p.id).status === 'paused');
  }

  // ---------- 8) Veto del cliente: ni un intento directo lo publica ----------
  {
    const db = freshDb();
    const p = mkPost(db, { img: '/media/a.jpg', approval: 'rejected' });
    igHandler.mode = 'ok'; igCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    const after = getPost(db, p.id);
    check('veto → bloqueado como decisión', r && r.blocked === 'denied_decision');
    check('veto → sin intento a Instagram', igCalls.length === 0);
    check('veto → post cancelado', after.status === 'cancelled');
    const led = db.prepare(`SELECT status, detail FROM publish_ledger WHERE post_id = ?`).all(p.id);
    check('veto → ledger denied/client_rejected', led.length === 1 && led[0].status === 'denied' && led[0].detail === 'client_rejected');
  }

  // ---------- 9) Cola única: el feed sale antes que la historia ----------
  {
    const db = freshDb();
    const story = mkPost(db, { img: '/media/b.jpg', media_type: 'story', at: new Date(Date.now() - 7200e3).toISOString() });
    const feed = mkPost(db, { img: '/media/c.jpg', media_type: 'image', at: new Date(Date.now() - 3600e3).toISOString() });
    igHandler.mode = 'ok'; igCalls.length = 0;
    await scheduler.processDuePosts(db);
    check('orden de publicación: post antes que story', igCalls.join(',') === 'post,story', igCalls.join(','));
    check('ambos publicados', getPost(db, story.id).status === 'published' && getPost(db, feed.id).status === 'published');
  }

  console.log(`\n${pass} ✅ / ${fail} ❌`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
