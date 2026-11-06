// test-push-publicado-diario.js — PUSH «¡Tu posteo ya salió!» CADA DÍA.
// Lote PUSH-PUBLICADO-DIARIO (Valentino 5/11 21:41: la push llega cada día
// cuando sale el posteo, para verlo primero).
// Cubre: día normal aprobado por el cliente → push sale; primer posteo →
// título de hito; automática → push sale; demo → sin push; opt-out → sin
// push; reintento del mismo posteo → una sola push (guarda de idempotencia
// en publishSinglePost). El EMAIL «ya salió» mantiene su gate viejo
// (primer posteo o automática) — se verifica que no cambió.
// DB en memoria (node:sqlite); Instagram, push y email stubbeados por
// require.cache ANTES de cargar scheduler; fetch público stubbeado.
// Uso: node test-push-publicado-diario.js — sale 0 si todo pasa.
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
const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppd-media-'));
for (const f of ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg']) fs.writeFileSync(path.join(mediaDir, f), 'x');
process.env.MEDIA_DIR = mediaDir;
process.env.PUBLISH_DAILY_CAP = '50'; // techo alto: el presupuesto no es lo que se prueba acá

// Stub de Instagram: handler mutable por escenario.
const igCalls = [];
const igHandler = { mode: 'ok' }; // 'ok' | 'demo'
function igResult(kind) {
  igCalls.push(kind);
  return { success: true, demo: igHandler.mode === 'demo', permalink: igHandler.mode === 'demo' ? '' : 'https://instagram.com/p/x', mediaId: 'm-' + kind };
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

// Push capturada (nunca sale de verdad) + email capturado.
const pushCalls = [];
const pushPath = require.resolve('./push.js');
require.cache[pushPath] = { id: pushPath, filename: pushPath, loaded: true, exports: {
  sendPush: async (uid, payload) => { pushCalls.push({ uid, payload }); return { ok: true, sent: 1 }; },
  notifyPostFailed: async () => ({ ok: false }),
}};
const emailCalls = [];
const emailPath = require.resolve('./email.js');
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: {
  publishedEmail: async (...a) => { emailCalls.push(a); },
  sendEmail: async () => ({ ok: false }),
}};

const guard = require('./publish-guard');
const schedPath = require.resolve('./scheduler.js');
delete require.cache[schedPath];
const scheduler = require('./scheduler.js');

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, plan_status TEXT DEFAULT 'active', trial_ends_at TEXT, trial_extended_until TEXT, created_at TEXT DEFAULT '2026-10-01 00:00:00', first_post_at TEXT, trial_pause_notified INTEGER DEFAULT 0, email TEXT DEFAULT 'u@test.dev', name TEXT DEFAULT 'Test', lang TEXT DEFAULT 'es', email_opt_out INTEGER DEFAULT 0, publishing_stopped INTEGER DEFAULT 0, referral_code TEXT DEFAULT '', referred_by TEXT DEFAULT '');
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, demo_mode INTEGER DEFAULT 0, image_base_url TEXT DEFAULT '', ig_user_id TEXT DEFAULT 'ig1', ig_access_token TEXT DEFAULT 'tok', ig_token_warning INTEGER DEFAULT 0);
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT, caption TEXT DEFAULT 'cap', hashtags TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'draft', approval TEXT DEFAULT 'approved', notified INTEGER DEFAULT 0, notify_at TEXT, media_type TEXT DEFAULT 'image', carousel_paths TEXT DEFAULT '', needs_review INTEGER DEFAULT 0, source TEXT DEFAULT '', error TEXT DEFAULT '', ig_permalink TEXT DEFAULT '', ig_media_id TEXT DEFAULT '', published_at TEXT, created_at TEXT DEFAULT '2026-10-20 00:00:00', win_celebrated INTEGER DEFAULT 0, user_stopped INTEGER DEFAULT 0);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT);
    CREATE TABLE post_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, post_id INTEGER, hashtags TEXT, scheduled_for TEXT, rubro TEXT, client_signal TEXT, week_key TEXT, auto_signal INTEGER);
    CREATE TABLE profiles (user_id INTEGER, category TEXT DEFAULT '');
    CREATE TABLE funnel_events (user_id INTEGER, event TEXT);
  `);
  guard.ensureSchema(db);
  return db;
}
function mkUser(db, id, over = {}) {
  db.prepare('INSERT INTO users (id, email_opt_out) VALUES (?, ?)').run(id, over.oo ? 1 : 0);
  db.prepare('INSERT INTO settings (user_id, demo_mode) VALUES (?, ?)').run(id, over.demo ? 1 : 0);
}
function mkPost(db, uid, over = {}) {
  const r = db.prepare(`INSERT INTO posts (user_id, image_path, scheduled_at, status, approval, media_type, source)
    VALUES (?, ?, ?, 'scheduled', ?, 'image', '')`).run(uid, over.img || '/media/a.jpg', over.at || '2026-11-05 20:00:00', over.approval || 'approved');
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(r.lastInsertRowid));
}
function mkPublished(db, uid, img) {
  const p = mkPost(db, uid, { img: img || '/media/b.jpg' });
  db.prepare(`UPDATE posts SET status='published', published_at=datetime('now'), ig_permalink='https://instagram.com/p/prev' WHERE id = ?`).run(p.id);
  return p;
}
const getPost = (db, id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
// Solo la push «ya salió» (el publish también puede disparar la de premio,
// que tiene otro título y otra url — no es lo que se prueba acá).
const yaSalio = () => pushCalls.filter((c) => /ya sali/.test(c.payload.title || ''));

(async () => {
  // ---------- 0) Contrato en el código fuente ----------
  const sched = fs.readFileSync(__dirname + '/scheduler.js', 'utf8');
  check('la push ya NO comparte el gate del email', sched.includes('const notifyPushPublished = !result.demo'));
  check('el bloque de push usa el gate nuevo', sched.includes('if (notifyPushPublished)'));
  check('el email sigue con su gate viejo (primer posteo o automática)', sched.includes('const notifyPublished = (isFirstPost || wasAuto) && !result.demo'));
  check('la push abre /#/app/semana (el detalle tiene «Ver en Instagram»)', sched.includes("url: '/#/app/semana'"));
  check('guarda de idempotencia al inicio de publishSinglePost', sched.includes('already_published'));

  // ---------- 1) Día normal aprobado por el cliente → push sale ----------
  {
    const db = freshDb(); mkUser(db, 1);
    mkPublished(db, 1); // ya tiene un posteo: este NO es el primero
    const p = mkPost(db, 1, { img: '/media/c.jpg', approval: 'approved' });
    igHandler.mode = 'ok'; igCalls.length = 0; pushCalls.length = 0; emailCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    check('día normal: publica ok', r && r.ok === true);
    check('día normal: post queda published', getPost(db, p.id).status === 'published');
    check('día normal: UNA push «ya salió»', yaSalio().length === 1, 'pushes=' + yaSalio().length);
    const y = yaSalio()[0];
    check('día normal: título exacto', y && y.payload.title === '¡Tu posteo ya salió! 📲', y && y.payload.title);
    check('día normal: body exacto', y && y.payload.body === 'Posty lo publicó en tu Instagram 👏');
    check('día normal: abre /#/app/semana', y && y.payload.url === '/#/app/semana');
    check('día normal: el EMAIL no sale (su gate no cambió)', emailCalls.length === 0, 'emails=' + emailCalls.length);
  }

  // ---------- 2) Primer posteo → título de hito + email sí ----------
  {
    const db = freshDb(); mkUser(db, 1);
    const p = mkPost(db, 1, { img: '/media/a.jpg', approval: 'approved' });
    igHandler.mode = 'ok'; igCalls.length = 0; pushCalls.length = 0; emailCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    check('primer posteo: publica ok', r && r.ok === true);
    check('primer posteo: UNA push «ya salió»', yaSalio().length === 1);
    check('primer posteo: título de hito', yaSalio()[0] && yaSalio()[0].payload.title === '🎉 ¡Tu primer posteo ya salió!');
    check('primer posteo: el email SÍ sale (hito)', emailCalls.length === 1, 'emails=' + emailCalls.length);
  }

  // ---------- 3) Publicación automática → push sale + email sí ----------
  {
    const db = freshDb(); mkUser(db, 1);
    mkPublished(db, 1);
    const p = mkPost(db, 1, { img: '/media/b.jpg', approval: 'pending' }); // sale solo
    igHandler.mode = 'ok'; igCalls.length = 0; pushCalls.length = 0; emailCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    check('automática: publica ok', r && r.ok === true);
    check('automática: UNA push «ya salió»', yaSalio().length === 1);
    check('automática: título normal (no es el primero)', yaSalio()[0] && yaSalio()[0].payload.title === '¡Tu posteo ya salió! 📲');
    check('automática: el email SÍ sale', emailCalls.length === 1);
  }

  // ---------- 4) Demo → sin push ni email ----------
  {
    const db = freshDb(); mkUser(db, 1, { demo: true });
    const p = mkPost(db, 1, { img: '/media/c.jpg', approval: 'approved' });
    igHandler.mode = 'demo'; igCalls.length = 0; pushCalls.length = 0; emailCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    check('demo: publica ok (demo)', r && r.ok === true);
    check('demo: NINGUNA push «ya salió»', yaSalio().length === 0, 'pushes=' + yaSalio().length);
    check('demo: NINGÚN email «ya salió»', emailCalls.length === 0);
  }

  // ---------- 5) Opt-out → sin push ----------
  {
    const db = freshDb(); mkUser(db, 1, { oo: true });
    mkPublished(db, 1);
    const p = mkPost(db, 1, { img: '/media/d.jpg', approval: 'approved' });
    igHandler.mode = 'ok'; igCalls.length = 0; pushCalls.length = 0; emailCalls.length = 0;
    const r = await scheduler.publishSinglePost(db, p);
    check('opt-out: publica ok igual', r && r.ok === true);
    check('opt-out: NINGUNA push «ya salió»', yaSalio().length === 0, 'pushes=' + yaSalio().length);
  }

  // ---------- 6) Reintento del mismo posteo → una sola push ----------
  {
    const db = freshDb(); mkUser(db, 1);
    mkPublished(db, 1);
    const p = mkPost(db, 1, { img: '/media/e.jpg', approval: 'approved' });
    igHandler.mode = 'ok'; igCalls.length = 0; pushCalls.length = 0; emailCalls.length = 0;
    const r1 = await scheduler.publishSinglePost(db, p);
    check('reintento: primera publica ok', r1 && r1.ok === true);
    check('reintento: una push tras la primera', yaSalio().length === 1 && igCalls.length === 1);
    const r2 = await scheduler.publishSinglePost(db, getPost(db, p.id));
    check('reintento: segunda llamada dice already_published', r2 && r2.already_published === true, JSON.stringify(r2));
    check('reintento: SIN segundo intento a Instagram', igCalls.length === 1, 'igCalls=' + igCalls.length);
    check('reintento: SIN segunda push', yaSalio().length === 1, 'pushes=' + yaSalio().length);
    // Y el scheduler tampoco lo re-pesca: ya no está 'scheduled'.
    igCalls.length = 0;
    await scheduler.processDuePosts(db);
    check('reintento: processDuePosts no lo re-publica', igCalls.length === 0 && yaSalio().length === 1, 'igCalls=' + igCalls.length);
  }

  console.log(`\n${pass} ✅ / ${fail} ❌`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
