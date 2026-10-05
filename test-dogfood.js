// test-dogfood.js — Harness: Posty dogfood (Posty como su propio primer cliente).
// Sin red real ni API keys: imagen con stub inyectado, push sin VAPID.
// DB: node:sqlite en archivo temporal.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const D = require('./dogfood');
const { initLearningTables } = require('./learning');
require('./push').initPush(null); // se re-inicializa por test con la db real

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-'));
const tmpMedia = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-media-'));
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}

const DDL = `
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL DEFAULT 'x', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT,
  status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', tipo TEXT DEFAULT '',
  style_code TEXT DEFAULT '', style_reason TEXT DEFAULT '', intent TEXT DEFAULT '',
  hook_id TEXT DEFAULT '', source_angle TEXT DEFAULT '', approval TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT DEFAULT '', keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');
CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '');
CREATE TABLE settings (user_id INTEGER PRIMARY KEY, image_base_url TEXT DEFAULT '', timezone TEXT DEFAULT '');`;

function mkdb() {
  const db = new DatabaseSync(path.join(tmpDir, `t${Date.now()}${Math.floor(Math.random() * 1e6)}.db`));
  db.exec(DDL);
  initLearningTables(db);
  D.initDogfood(db);
  return db;
}
function mkuser(db, email) {
  return db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x').lastInsertRowid;
}
const stubImage = ({ angle }) => Promise.resolve({
  imagePath: '/media/dogfood-stub.png', source: 'stub',
  stylePick: { style: { code: '/dogfood-test' }, reason: 'stub' },
});

(async () => {
// ================= 1. HOUSE BRIEF =================
await t('house brief: existe, CTA y paleta de Posty', () => {
  assert.ok(D.HOUSE);
  assert.strictEqual(D.HOUSE.igHandle, '@posty.hacetodo');
  assert.ok(D.HOUSE.sells.length > 20);
  assert.ok(D.HOUSE.audience.length > 10);
  assert.ok(D.HOUSE.cta.includes('postyhacetodo.com/prueba'), 'CTA=' + D.HOUSE.cta);
  assert.ok(D.HOUSE.palette.includes('#2793C8'), 'falta #2793C8');
  assert.ok(D.HOUSE.palette.includes('#FEC14D'), 'falta #FEC14D');
  assert.ok(D.HOUSE.hashtags.includes('#communitymanager'));
});
await t('6 ángulos con intent, tema y visual', () => {
  assert.strictEqual(D.ANGLES.length, 6);
  const ids = D.ANGLES.map((a) => a.id);
  for (const want of ['beneficio', 'como-funciona', 'prueba-social', 'detras', 'tips', 'objecion'])
    assert.ok(ids.includes(want), 'falta ángulo ' + want);
  for (const a of D.ANGLES) {
    assert.ok(a.intent && a.theme && a.visual, 'ángulo incompleto: ' + a.id);
    assert.ok(a.bodies.length >= 2, 'ángulo sin variantes: ' + a.id);
    for (const b of a.bodies) assert.ok(!/\*/.test(b), `asterisco en body de ${a.id}`);
  }
});

// ================= 2. ROTACIÓN DE ÁNGULOS =================
await t('no repite ángulo dos días seguidos (simula 30 días)', () => {
  const db = mkdb(); mkuser(db, 'a@x.com');
  let prev = null;
  for (let i = 0; i < 30; i++) {
    const a = D.pickAngle(db);
    assert.ok(a && a.id, 'pickAngle devolvió vacío');
    assert.notStrictEqual(a.id, prev, `repitió ${a.id} dos días seguidos`);
    prev = a.id;
  }
  db.close();
});
await t('la rotación usa varios ángulos (no se queda en 2)', () => {
  const db = mkdb(); mkuser(db, 'a@x.com');
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(D.pickAngle(db).id);
  assert.ok(seen.size >= 4, 'solo usó ' + [...seen].join(','));
  db.close();
});

// ================= 3. GENERACIÓN =================
await t('genera draft con imagen+caption+hashtags, sin asteriscos', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(r.ok, 'falló: ' + r.reason);
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(r.postId);
  assert.ok(p, 'no se guardó');
  assert.strictEqual(p.kind, 'dogfood');
  assert.strictEqual(p.status, 'pending_approval');
  assert.strictEqual(p.user_id, uid);
  assert.ok(p.image_path.startsWith('/media/'), 'image_path=' + p.image_path);
  assert.ok(p.caption.length > 50, 'caption corto');
  assert.ok(!/\*/.test(p.caption), 'asterisco en caption');
  assert.ok(p.caption.includes('postyhacetodo.com/prueba'), 'sin CTA');
  assert.ok(p.hashtags.includes('#'), 'sin hashtags');
  assert.ok(p.hook_id, 'sin hook_id');
  db.close();
});
await t('idempotente: con un pendiente no genera otro', async () => {
  const db = mkdb(); mkuser(db, 'owner@x.com');
  const r1 = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(r1.ok);
  const r2 = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(!r2.ok && r2.reason === 'already_pending', 'reason=' + r2.reason);
  const n = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE kind='dogfood' AND status='pending_approval'`).get().n;
  assert.strictEqual(n, 1);
  db.close();
});
await t('sin OpenAI key y sin stub: no crashea, reason claro', async () => {
  const db = mkdb(); mkuser(db, 'owner@x.com');
  const saved = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia });
  if (saved) process.env.OPENAI_API_KEY = saved;
  assert.ok(!r.ok && r.reason === 'no_openai_key', 'reason=' + r.reason);
  db.close();
});

// ================= 4. OWNER =================
await t('resolveOwnerUserId: env DOGFOOD_OWNER_EMAIL manda', () => {
  const db = mkdb();
  const u1 = mkuser(db, 'primero@x.com');
  const u2 = mkuser(db, 'dueno@x.com');
  process.env.DOGFOOD_OWNER_EMAIL = 'dueno@x.com';
  assert.strictEqual(D.resolveOwnerUserId(db), u2);
  delete process.env.DOGFOOD_OWNER_EMAIL;
  db.close();
});
await t('resolveOwnerUserId: sin env → el de más push subs, si no el más antiguo', () => {
  const db = mkdb();
  const u1 = mkuser(db, 'primero@x.com');
  const u2 = mkuser(db, 'segundo@x.com');
  assert.strictEqual(D.resolveOwnerUserId(db), u1, 'debería ser el más antiguo');
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint) VALUES (?, ?)').run(u2, 'e1');
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint) VALUES (?, ?)').run(u2, 'e2');
  assert.strictEqual(D.resolveOwnerUserId(db), u2, 'debería ser el de más subs');
  db.close();
});

// ================= 5. PUSH SIN VAPID =================
await t('sin VAPID keys: no crashea, draft queda pendiente', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  require('./push').initPush(db);
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, keys_json) VALUES (?, ?, ?)').run(uid, 'https://x', '{}');
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(r.ok);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(r.postId);
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  let res = null, threw = false;
  try { res = await D.sendDogfoodPush(db, post, uid); } catch (e) { threw = true; }
  if (pub) process.env.VAPID_PUBLIC_KEY = pub;
  if (priv) process.env.VAPID_PRIVATE_KEY = priv;
  assert.ok(!threw, 'tiró excepción');
  assert.ok(res && !res.ok, 'debería fallar sin VAPID');
  const still = db.prepare('SELECT status FROM posts WHERE id = ?').get(r.postId).status;
  assert.strictEqual(still, 'pending_approval', 'el draft debe seguir pendiente');
  // y el endpoint lo expone con badge pendiente
  const pend = D.getPendingDogfood(db, uid);
  assert.ok(pend && pend.id === r.postId, 'getPendingDogfood no lo devuelve');
  db.close();
});

// ================= 6. APPROVE / DISMISS =================
await t('approve publica con el pipeline (mock) y registra learning', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(r.ok);
  let published = null;
  const mockPublish = async (d, post) => { published = post.id; return { ok: true }; };
  const a = await D.approveDogfood(db, r.postId, mockPublish);
  assert.ok(a.ok, 'approve falló: ' + a.reason);
  assert.strictEqual(published, r.postId, 'no llamó al publish');
  const row = db.prepare('SELECT style_code FROM style_performance WHERE user_id = ?').get(String(uid));
  assert.ok(row, 'no registró learning');
  db.close();
});
await t('approve de algo que no está pendiente: no publica', async () => {
  const db = mkdb(); mkuser(db, 'owner@x.com');
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  let called = 0;
  const mockPublish = async () => { called++; return { ok: true }; };
  await D.approveDogfood(db, r.postId, mockPublish);
  const a2 = await D.approveDogfood(db, r.postId, mockPublish);
  assert.ok(!a2.ok && a2.reason === 'not_pending', 'reason=' + a2.reason);
  assert.strictEqual(called, 1, 'publicó de más');
  const a3 = await D.approveDogfood(db, 999999, mockPublish);
  assert.ok(!a3.ok && a3.reason === 'not_found');
  db.close();
});
await t('dismiss descarta y NO publica (mañana se genera otro)', async () => {
  const db = mkdb(); mkuser(db, 'owner@x.com');
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  let called = 0;
  const mockPublish = async () => { called++; return { ok: true }; };
  const d = D.dismissDogfood(db, r.postId);
  assert.ok(d.ok);
  assert.strictEqual(called, 0, 'dismiss no debe publicar');
  const st = db.prepare('SELECT status FROM posts WHERE id = ?').get(r.postId).status;
  assert.strictEqual(st, 'dismissed');
  // después de descartar, al día siguiente se puede generar otra (no hay pendiente)
  const r2 = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(r2.ok, 'debería generar otra: ' + r2.reason);
  db.close();
});
await t('morningDogfood: genera + intenta push sin tirar', async () => {
  const db = mkdb(); mkuser(db, 'owner@x.com');
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  let res = null, threw = false;
  try { res = await D.morningDogfood(db, { mediaDir: tmpMedia, generateImageStub: stubImage }); } catch (e) { threw = true; }
  if (pub) process.env.VAPID_PUBLIC_KEY = pub;
  if (priv) process.env.VAPID_PRIVATE_KEY = priv;
  assert.ok(!threw, 'tiró excepción');
  assert.ok(res && res.ok && res.postId, 'morning falló: ' + JSON.stringify(res));
  db.close();
});

console.log(`\ndogfood: ${passed} pass, ${failed} fail`);
if (failures.length) { console.log('FALLOS:'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
})();
