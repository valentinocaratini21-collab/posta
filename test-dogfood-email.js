// test-dogfood-email.js — Harness: fallback por email del dogfood de Posty.
// Sin red real: push y envío de email con stubs inyectados. Imagen fake en disco.
// DB: node:sqlite en archivo temporal.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

process.env.SESSION_SECRET = 'test-secret-email-harness';
const D = require('./dogfood');
const { initLearningTables } = require('./learning');
require('./push').initPush(null);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-email-'));
const tmpMedia = fs.mkdtempSync(path.join(os.tmpdir(), 'dogfood-email-media-'));
let passed = 0, failed = 0;
const failures = [];
async function t(name, fn) {
  try { await fn(); passed++; }
  catch (e) { failed++; failures.push(`${name}: ${e.message}`); }
}

// PNG 1x1 válido (para que el adjunto sea un archivo de imagen real).
const PNG1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const DDL = `
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL DEFAULT 'x', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
  image_path TEXT DEFAULT '', caption TEXT DEFAULT '', hashtags TEXT DEFAULT '', scheduled_at TEXT,
  status TEXT DEFAULT 'draft', media_type TEXT DEFAULT 'image', tipo TEXT DEFAULT '',
  style_code TEXT DEFAULT '', style_reason TEXT DEFAULT '', intent TEXT DEFAULT '',
  hook_id TEXT DEFAULT '', source_angle TEXT DEFAULT '', approval TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT DEFAULT '', keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');`;

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
function mkimg(name) {
  const p = path.join(tmpMedia, name);
  fs.writeFileSync(p, PNG1X1);
  return '/media/' + name;
}
const stubImage = ({ angle }) => Promise.resolve({
  imagePath: mkimg(`stub-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`),
  source: 'stub', stylePick: { style: { code: '/dogfood-test' }, reason: 'stub' },
});
async function mkpending(db, uid) {
  const r = await D.generateDogfoodPost(db, { mediaDir: tmpMedia, generateImageStub: stubImage });
  assert.ok(r.ok, 'no se generó: ' + r.reason);
  return db.prepare('SELECT * FROM posts WHERE id = ?').get(r.postId);
}

(async () => {
// ================= 1. DECISIÓN DE CANAL =================
await t('notifyDogfood: con push activa → push, email ni se intenta', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint) VALUES (?, ?)').run(uid, 'https://x/1');
  const post = await mkpending(db, uid);
  let emailCalls = 0, pushCalls = 0;
  const n = await D.notifyDogfood(db, post, uid, {
    mediaDir: tmpMedia,
    pushStub: async () => { pushCalls++; return { ok: true, sent: 1 }; },
    emailStub: async () => { emailCalls++; return { ok: true }; },
  });
  assert.strictEqual(n.channel, 'push', 'channel=' + n.channel);
  assert.strictEqual(pushCalls, 1);
  assert.strictEqual(emailCalls, 0, 'el email no debería intentarse');
  db.close();
});
await t('notifyDogfood: sin push + con email → email', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const post = await mkpending(db, uid);
  let emailCalls = 0;
  const n = await D.notifyDogfood(db, post, uid, {
    mediaDir: tmpMedia,
    emailStub: async () => { emailCalls++; return { ok: true }; },
  });
  assert.strictEqual(n.channel, 'email', 'channel=' + n.channel);
  assert.strictEqual(emailCalls, 1);
  db.close();
});
await t('notifyDogfood: sin push ni email → badge en app', async () => {
  const db = mkdb();
  const uid = db.prepare("INSERT INTO users (email, password_hash) VALUES ('', 'x')").run().lastInsertRowid;
  const post = await mkpending(db, uid);
  let emailCalls = 0;
  const n = await D.notifyDogfood(db, post, uid, {
    mediaDir: tmpMedia,
    emailStub: async () => { emailCalls++; return { ok: true }; },
  });
  assert.strictEqual(n.channel, 'badge', 'channel=' + n.channel);
  assert.strictEqual(emailCalls, 0);
  const still = db.prepare('SELECT status FROM posts WHERE id = ?').get(post.id).status;
  assert.strictEqual(still, 'pending_approval');
  db.close();
});
await t('notifyDogfood: push falla → cae a email como respaldo', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  db.prepare('INSERT INTO push_subscriptions (user_id, endpoint) VALUES (?, ?)').run(uid, 'https://x/1');
  const post = await mkpending(db, uid);
  let emailCalls = 0;
  const n = await D.notifyDogfood(db, post, uid, {
    mediaDir: tmpMedia,
    pushStub: async () => ({ ok: false, reason: 'no_vapid' }),
    emailStub: async () => { emailCalls++; return { ok: true }; },
  });
  assert.strictEqual(n.channel, 'email', 'channel=' + n.channel);
  assert.strictEqual(emailCalls, 1);
  db.close();
});

// ================= 2. CONTENIDO DEL EMAIL =================
await t('sendDogfoodEmail: asunto, foto adjunta y 2 links firmados', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const post = await mkpending(db, uid);
  let payload = null;
  const r = await D.sendDogfoodEmail(db, post, uid, {
    mediaDir: tmpMedia, baseUrl: 'https://postyhacetodo.com',
    sendEmailStub: async (p) => { payload = p; return { ok: true }; },
  });
  assert.ok(r.ok, 'falló: ' + r.reason);
  assert.strictEqual(r.to, 'owner@x.com');
  assert.strictEqual(payload.subject, '¿Lo publico? Tu posteo de hoy sale ahora');
  assert.ok(payload.html.includes('Si no respondés en 2 horas, se publica solo.'), 'el email no dice la regla de 2h');
  assert.ok(payload.to === 'owner@x.com' || payload.to.includes('owner@x.com'));
  // foto adjunta
  assert.ok(Array.isArray(payload.attachments) && payload.attachments.length === 1, 'sin adjunto');
  const att = payload.attachments[0];
  assert.ok(att.content && att.content.length > 50, 'adjunto vacío');
  assert.ok(/image\/(png|jpeg|webp)/.test(att.contentType), 'mime=' + att.contentType);
  // caption + hashtags en el html
  assert.ok(payload.html.includes('postyhacetodo.com/prueba'), 'sin CTA en el html');
  assert.ok(payload.html.includes('#communitymanager'), 'sin hashtags');
  // 2 links firmados distintos
  const mApprove = payload.html.match(/\/api\/dogfood\/email-approve\?token=([^"&\s]+)/);
  const mDismiss = payload.html.match(/\/api\/dogfood\/email-dismiss\?token=([^"&\s]+)/);
  assert.ok(mApprove, 'sin link de approve');
  assert.ok(mDismiss, 'sin link de dismiss');
  assert.notStrictEqual(decodeURIComponent(mApprove[1]), decodeURIComponent(mDismiss[1]), 'tokens iguales');
  // los tokens verifican
  const va = D.verifyDogfoodToken(db, decodeURIComponent(mApprove[1]));
  assert.ok(va.ok && va.action === 'approve' && va.postId === post.id, 'token approve inválido: ' + va.reason);
  const vd = D.verifyDogfoodToken(db, decodeURIComponent(mDismiss[1]));
  assert.ok(vd.ok && vd.action === 'dismiss', 'token dismiss inválido');
  // link a instalar la app
  assert.ok(payload.html.includes('Instalá la app'), 'sin upsell de la app');
  db.close();
});
await t('sendDogfoodEmail: sin imagen en disco → no manda nada', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const post = await mkpending(db, uid);
  fs.unlinkSync(path.join(tmpMedia, path.basename(post.image_path)));
  let calls = 0;
  const r = await D.sendDogfoodEmail(db, post, uid, {
    mediaDir: tmpMedia, sendEmailStub: async () => { calls++; return { ok: true }; },
  });
  assert.ok(!r.ok && r.reason === 'no_image_file', 'reason=' + r.reason);
  assert.strictEqual(calls, 0, 'no debería llamar al envío');
  db.close();
});

// ================= 3. TOKENS FIRMADOS =================
await t('token adulterado → inválido', () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const tok = D.issueDogfoodToken(db, 123, 'approve');
  assert.ok(tok, 'no se emitió');
  const bad = tok.slice(0, -2) + 'ff';
  const v = D.verifyDogfoodToken(db, bad);
  assert.ok(!v.ok && v.reason === 'invalid', 'reason=' + v.reason);
  const v2 = D.verifyDogfoodToken(db, 'basura');
  assert.ok(!v2.ok);
  db.close();
});
await t('token expirado → expired', () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const tok = D.issueDogfoodToken(db, 123, 'approve', -1000);
  assert.ok(tok);
  const v = D.verifyDogfoodToken(db, tok);
  assert.ok(!v.ok && v.reason === 'expired', 'reason=' + v.reason);
  db.close();
});
await t('claim atómico: dos claims → solo el primero gana', () => {
  const db = mkdb(); mkuser(db, 'o@x.com');
  const tok = D.issueDogfoodToken(db, 123, 'approve');
  const v = D.verifyDogfoodToken(db, tok);
  assert.ok(v.ok);
  assert.ok(D.claimDogfoodToken(db, v.tokenHash), 'primer claim debería ganar');
  assert.ok(!D.claimDogfoodToken(db, v.tokenHash), 'segundo claim no debería ganar');
  const v2 = D.verifyDogfoodToken(db, tok);
  assert.ok(!v2.ok && v2.reason === 'already_used', 'reason=' + v2.reason);
  db.close();
});

// ================= 4. REDEEM POR EMAIL =================
await t('redeem approve por email publica UNA sola vez (doble click)', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const post = await mkpending(db, uid);
  let published = 0;
  const mockPublish = async () => { published++; return { ok: true }; };
  const tok = D.issueDogfoodToken(db, post.id, 'approve');
  const r1 = await D.redeemDogfoodEmailToken(db, tok, 'approve', mockPublish);
  assert.ok(r1.ok, 'primer redeem falló: ' + r1.reason);
  assert.strictEqual(published, 1);
  assert.ok(r1.html.includes('Publicando'), 'la página debería confirmar');
  const r2 = await D.redeemDogfoodEmailToken(db, tok, 'approve', mockPublish);
  assert.ok(!r2.ok && r2.reason === 'already_used', 'reason=' + r2.reason);
  assert.strictEqual(published, 1, 'se publicó de más');
  db.close();
});
await t('redeem dismiss por email descarta sin publicar', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const post = await mkpending(db, uid);
  let published = 0;
  const mockPublish = async () => { published++; return { ok: true }; };
  const tok = D.issueDogfoodToken(db, post.id, 'dismiss');
  const r = await D.redeemDogfoodEmailToken(db, tok, 'dismiss', mockPublish);
  assert.ok(r.ok, 'falló: ' + r.reason);
  assert.strictEqual(published, 0);
  const st = db.prepare('SELECT status FROM posts WHERE id = ?').get(post.id).status;
  assert.strictEqual(st, 'dismissed');
  db.close();
});
await t('redeem con token de acción cruzada → rechazado', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const post = await mkpending(db, uid);
  let published = 0;
  const mockPublish = async () => { published++; return { ok: true }; };
  const tokDismiss = D.issueDogfoodToken(db, post.id, 'dismiss');
  const r = await D.redeemDogfoodEmailToken(db, tokDismiss, 'approve', mockPublish);
  assert.ok(!r.ok && r.reason === 'wrong_action', 'reason=' + r.reason);
  assert.strictEqual(published, 0);
  db.close();
});
await t('redeem approve cuando ya se aprobó en la app → no duplica', async () => {
  const db = mkdb(); const uid = mkuser(db, 'owner@x.com');
  const post = await mkpending(db, uid);
  let published = 0;
  const mockPublish = async () => { published++; return { ok: true }; };
  const a = await D.approveDogfood(db, post.id, mockPublish);
  assert.ok(a.ok);
  const tok = D.issueDogfoodToken(db, post.id, 'approve');
  const r = await D.redeemDogfoodEmailToken(db, tok, 'approve', mockPublish);
  assert.ok(!r.ok, 'debería fallar (ya no está pendiente)');
  assert.strictEqual(published, 1, 'se publicó de más');
  db.close();
});

// ================= 5. INTEGRACIÓN MAÑANA =================
await t('morningDogfood sin push subs: genera y manda email', async () => {
  const db = mkdb(); mkuser(db, 'owner@x.com');
  let emailCalls = 0;
  const r = await D.morningDogfood(db, {
    mediaDir: tmpMedia, generateImageStub: stubImage,
    emailStub: async () => { emailCalls++; return { ok: true }; },
  });
  assert.ok(r.ok && r.postId, 'morning falló: ' + JSON.stringify(r));
  assert.ok(r.notify && r.notify.channel === 'email', 'channel=' + (r.notify && r.notify.channel));
  assert.strictEqual(emailCalls, 1);
  db.close();
});

console.log(`\ndogfood-email: ${passed} pass, ${failed} fail`);
if (failures.length) { console.log('FALLOS:'); failures.forEach((f) => console.log(' - ' + f)); process.exit(1); }
})();
