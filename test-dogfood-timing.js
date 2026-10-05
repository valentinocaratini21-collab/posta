// test-dogfood-timing.js — Harness: timing del dogfood.
// Notificación en T-1min, auto-publicación en T+2h, lun–vie, copy con regla 2h.
// Sin red real: imagen con stub, push/email con stubs, now inyectado.
// DB: node:sqlite en archivo temporal.
'use strict';

process.env.DOGFOOD_TZ = 'America/Argentina/Buenos_Aires';
process.env.DOGFOOD_POST_TIME = '18:00';
process.env.DOGFOOD_EMAIL_SECRET = 'test-secret-timing';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const D = require('./dogfood');
const { initLearningTables } = require('./learning');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-t-'));
const tmpMedia = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-tm-'));
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}\n${(e.stack || '').split('\n')[1] || ''}`); }
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
// Lunes 2026-10-05, sábado 2026-10-03, domingo 2026-10-04, viernes 2026-10-02 (ART).
const at = (iso) => new Date(iso);
const MON_10 = () => at('2026-10-05T10:00:00-03:00');
const MON_1758 = () => at('2026-10-05T17:58:00-03:00');
const MON_1759 = () => at('2026-10-05T17:59:00-03:00');
const MON_1830 = () => at('2026-10-05T18:30:00-03:00');
const MON_20 = () => at('2026-10-05T20:00:00-03:00');
const SAT_10 = () => at('2026-10-03T10:00:00-03:00');
const SUN_10 = () => at('2026-10-04T10:00:00-03:00');
const FRI_10 = () => at('2026-10-02T10:00:00-03:00');

async function genSlot(db, now) {
  return D.generateDogfoodSlot(db, { now, mediaDir: tmpMedia, generateImageStub: stubImage });
}
function pushCap() {
  const calls = [];
  const stub = async (db, post, ownerId) => { calls.push({ post, ownerId }); return { ok: true, sent: 1 }; };
  return { calls, stub };
}
function addSub(db, uid) {
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint, keys_json) VALUES (?, ?, ?)')
    .run(uid, 'https://push.test/e1', '{}');
}
function pubCap() {
  const calls = [];
  const fn = async (d, post) => { calls.push(post.id); return { ok: true }; };
  return { calls, fn };
}

(async () => {
// ================= 1. HELPERS DE TIEMPO =================
await t('tzParts: lunes 10:00 ART', () => {
  const p = D.tzParts('America/Argentina/Buenos_Aires', MON_10());
  assert.strictEqual(p.ymd, '2026-10-05');
  assert.strictEqual(p.hm, '10:00');
  assert.strictEqual(p.dow, 1);
});
await t('tzParts: sábado y domingo', () => {
  assert.strictEqual(D.tzParts('America/Argentina/Buenos_Aires', SAT_10()).dow, 6);
  assert.strictEqual(D.tzParts('America/Argentina/Buenos_Aires', SUN_10()).dow, 0);
});
await t('addMinutesStr suma y cruza días', () => {
  assert.strictEqual(D.addMinutesStr('2026-10-05 17:59', 1), '2026-10-05 18:00');
  assert.strictEqual(D.addMinutesStr('2026-10-05 18:00', -30), '2026-10-05 17:30');
  assert.strictEqual(D.addMinutesStr('2026-10-05 00:10', -30), '2026-10-04 23:40');
  assert.strictEqual(D.addMinutesStr('2026-10-05 18:00', 120), '2026-10-05 20:00');
});
await t('dogfoodPostTime valida el env', () => {
  assert.strictEqual(D.dogfoodPostTime(), '18:00');
  process.env.DOGFOOD_POST_TIME = '25:99';
  assert.strictEqual(D.dogfoodPostTime(), '18:00', 'env inválido debe caer al default');
  process.env.DOGFOOD_POST_TIME = '09:30';
  assert.strictEqual(D.dogfoodPostTime(), '09:30');
  process.env.DOGFOOD_POST_TIME = '18:00';
});

// ================= 2. GENERADOR: LUN–VIE =================
await t('sábado: no genera (cero ruido)', async () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const r = await genSlot(db, SAT_10());
  assert.ok(!r.ok && r.reason === 'weekend', 'reason=' + r.reason);
  const n = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE kind='dogfood'`).get().n;
  assert.strictEqual(n, 0);
  db.close();
});
await t('domingo: no genera', async () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const r = await genSlot(db, SUN_10());
  assert.ok(!r.ok && r.reason === 'weekend');
  db.close();
});
await t('lunes 10:00: genera con scheduled_for hoy 18:00', async () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const r = await genSlot(db, MON_10());
  assert.ok(r.ok, 'falló: ' + r.reason);
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(r.postId);
  assert.strictEqual(p.scheduled_for, '2026-10-05 18:00', 'scheduled_for=' + p.scheduled_for);
  assert.strictEqual(p.status, 'pending_approval');
  assert.strictEqual(p.notified_at, '');
  db.close();
});
await t('no genera dos veces el mismo día', async () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const r1 = await genSlot(db, MON_10());
  assert.ok(r1.ok);
  const r2 = await genSlot(db, MON_10());
  assert.ok(!r2.ok && r2.reason === 'already_scheduled', 'reason=' + r2.reason);
  db.close();
});
await t('muy tarde (17:45): no genera', async () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const r = await genSlot(db, at('2026-10-05T17:45:00-03:00'));
  assert.ok(!r.ok && r.reason === 'too_late', 'reason=' + r.reason);
  db.close();
});
await t('pendiente del viernes no bloquea el lunes (stale se descarta)', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com');
  const rf = await D.generateDogfoodSlot(db, { now: FRI_10(), mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(rf.ok, 'viernes falló: ' + rf.reason);
  const r = await genSlot(db, MON_10());
  assert.ok(r.ok, 'lunes falló: ' + r.reason);
  const oldSt = db.prepare('SELECT status, decision FROM posts WHERE id = ?').get(rf.postId);
  assert.strictEqual(oldSt.status, 'dismissed', 'el viernes debe quedar dismissed');
  assert.strictEqual(oldSt.decision, 'dismissed');
  db.close();
});

// ================= 3. TICK: NOTIFICACIÓN EN T-1min =================
await t('tick en T-2min: no notifica', async () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const r = await genSlot(db, MON_10());
  assert.ok(r.ok);
  const pc = pushCap();
  const out = await D.tickDogfood(db, { now: MON_1758(), pushStub: pc.stub, publishFn: pubCap().fn });
  assert.deepStrictEqual(out.notified, []);
  assert.strictEqual(pc.calls.length, 0);
  db.close();
});
await t('tick en T-1min: notifica UNA vez (guard anti-doble)', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com'); addSub(db, uid);
  const r = await genSlot(db, MON_10());
  assert.ok(r.ok);
  const pc = pushCap();
  const out1 = await D.tickDogfood(db, { now: MON_1759(), pushStub: pc.stub, publishFn: pubCap().fn });
  assert.strictEqual(out1.notified.length, 1);
  assert.strictEqual(out1.notified[0].id, r.postId);
  assert.strictEqual(out1.notified[0].channel, 'push');
  const p = db.prepare('SELECT notified_at, auto_at FROM posts WHERE id = ?').get(r.postId);
  assert.ok(p.notified_at, 'sin notified_at');
  assert.strictEqual(p.auto_at, '2026-10-05 20:00', 'auto_at=' + p.auto_at);
  const out2 = await D.tickDogfood(db, { now: MON_1759(), pushStub: pc.stub, publishFn: pubCap().fn });
  assert.deepStrictEqual(out2.notified, [], 'doble notify');
  assert.strictEqual(pc.calls.length, 1, 'push llamado 2 veces');
  db.close();
});
await t('copy push: título y regla de 2h', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com');
  const r = await genSlot(db, MON_10());
  assert.ok(r.ok);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(r.postId);
  const payload = D.dogfoodPushPayload(db, post, uid);
  assert.strictEqual(payload.title, '¿Lo publico? 📸', 'title=' + payload.title);
  assert.ok(payload.body.includes('sale ahora'), 'body=' + payload.body);
  assert.ok(payload.body.includes('Si no respondés en 2 horas, se publica solo.'), 'body sin regla 2h: ' + payload.body);
  assert.ok(payload.image, 'push sin imagen');
  assert.ok(payload.url.includes(`/app/dogfood/${r.postId}`), 'sin deep link');
  db.close();
});
await t('copy email: asunto y regla de 2h en el html', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com');
  const r = await genSlot(db, MON_10());
  assert.ok(r.ok);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(r.postId);
  fs.writeFileSync(path.join(tmpMedia, 'dogfood-stub.png'), Buffer.from('fake-png-bytes-para-test'));
  let payload = null;
  const em = await D.sendDogfoodEmail(db, post, uid, {
    mediaDir: tmpMedia, baseUrl: 'https://postyhacetodo.com',
    sendEmailStub: async (p) => { payload = p; return { ok: true }; },
  });
  assert.ok(em.ok, 'falló: ' + em.reason);
  assert.strictEqual(payload.subject, '¿Lo publico? Tu posteo de hoy sale ahora');
  assert.ok(payload.html.includes('Si no respondés en 2 horas, se publica solo.'), 'html sin regla 2h');
  db.close();
});

// ================= 4. AUTO-PUBLICACIÓN EN T+2h =================
await t('sin respuesta a T+2h: auto-publica con decision=auto', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com'); addSub(db, uid);
  const r = await genSlot(db, MON_10());
  assert.ok(r.ok);
  const pc = pushCap(), pb = pubCap();
  await D.tickDogfood(db, { now: MON_1759(), pushStub: pc.stub, publishFn: pb.fn });
  const out = await D.tickDogfood(db, { now: MON_20(), pushStub: pc.stub, publishFn: pb.fn });
  assert.deepStrictEqual(out.autoPublished, [r.postId]);
  assert.deepStrictEqual(pb.calls, [r.postId], 'publish llamado != 1 vez');
  const p = db.prepare('SELECT decision FROM posts WHERE id = ?').get(r.postId);
  assert.strictEqual(p.decision, 'auto', 'decision=' + p.decision);
  const lr = db.prepare('SELECT decision FROM style_performance WHERE user_id = ?').get('1');
  assert.ok(lr && lr.decision === 'auto', 'learning sin decision=auto: ' + JSON.stringify(lr));
  db.close();
});
await t('approve manual antes: publica una vez; tick posterior no duplica', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com'); addSub(db, uid);
  const r = await genSlot(db, MON_10());
  const pc = pushCap(), pb = pubCap();
  await D.tickDogfood(db, { now: MON_1759(), pushStub: pc.stub, publishFn: pb.fn });
  const a = await D.approveDogfood(db, r.postId, pb.fn);
  assert.ok(a.ok && a.decision === 'approved', JSON.stringify(a));
  const out = await D.tickDogfood(db, { now: MON_20(), pushStub: pc.stub, publishFn: pb.fn });
  assert.deepStrictEqual(out.autoPublished, []);
  assert.strictEqual(pb.calls.length, 1, 'publish llamado ' + pb.calls.length + ' veces');
  const p = db.prepare('SELECT decision FROM posts WHERE id = ?').get(r.postId);
  assert.strictEqual(p.decision, 'approved');
  db.close();
});
await t('dismiss: no publica nunca', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com'); addSub(db, uid);
  const r = await genSlot(db, MON_10());
  const pc = pushCap(), pb = pubCap();
  await D.tickDogfood(db, { now: MON_1759(), pushStub: pc.stub, publishFn: pb.fn });
  const d = D.dismissDogfood(db, r.postId);
  assert.ok(d.ok);
  const out = await D.tickDogfood(db, { now: MON_20(), pushStub: pc.stub, publishFn: pb.fn });
  assert.deepStrictEqual(out.autoPublished, []);
  assert.strictEqual(pb.calls.length, 0);
  const p = db.prepare('SELECT status, decision FROM posts WHERE id = ?').get(r.postId);
  assert.strictEqual(p.status, 'dismissed');
  assert.strictEqual(p.decision, 'dismissed');
  const lr = db.prepare('SELECT decision FROM style_performance WHERE user_id = ?').get('1');
  assert.ok(lr && lr.decision === 'dismissed', 'learning sin decision=dismissed');
  db.close();
});
await t('approve DESPUÉS de auto-publicar: no duplica', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com'); addSub(db, uid);
  const r = await genSlot(db, MON_10());
  const pc = pushCap(), pb = pubCap();
  await D.tickDogfood(db, { now: MON_1759(), pushStub: pc.stub, publishFn: pb.fn });
  await D.tickDogfood(db, { now: MON_20(), pushStub: pc.stub, publishFn: pb.fn });
  const a = await D.approveDogfood(db, r.postId, pb.fn);
  assert.ok(!a.ok && a.reason === 'not_pending', 'reason=' + a.reason);
  assert.strictEqual(pb.calls.length, 1, 'se publicó de más');
  db.close();
});
await t('tick en domingo: cero ruido', async () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const pc = pushCap(), pb = pubCap();
  const out = await D.tickDogfood(db, { now: SUN_10(), pushStub: pc.stub, publishFn: pb.fn });
  assert.deepStrictEqual(out.notified, []);
  assert.deepStrictEqual(out.autoPublished, []);
  db.close();
});
await t('sin scheduled_for (draft viejo): el tick lo ignora', async () => {
  const db = mkdb(); const uid = mkuser(db, 'o@x.com');
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(r.ok);
  const pc = pushCap(), pb = pubCap();
  const out = await D.tickDogfood(db, { now: MON_1759(), pushStub: pc.stub, publishFn: pb.fn });
  assert.deepStrictEqual(out.notified, []);
  db.close();
});

console.log(`\ndogfood-timing: ${passed} pass, ${failed} fail`);
if (failures.length) { console.log('FALLOS:'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
})();
