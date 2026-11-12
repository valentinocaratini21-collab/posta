// test-lote-reset-prueba-negocio.js — v918 RESET-PRUEBA-NEGOCIO
// BUG: no existía ningún reseteo de prueba. La prueba de Crumbl Cookies
// quedó gastada el 11/11 (generó antes de frenarse por el aviso de
// dispositivo) y su primer posteo no se podía verificar en la serie de 15.
// FIX: POST /api/admin/trial-reset (requireAdminToken) resetea UN negocio:
// (1) trial_used permanente (kind ig/domain) vía trialLock.purgeUsed (NUEVA;
// las filas 'email' NO se tocan); (2) candado de 90 días vía purgeLock
// (si quedara, backfillUsedFromLocks lo resucitaría en trial_used);
// (3) posteos de prueba del invitado (solo si sigue is_guest=1) + reloj
// de 3 días fresco; (4) trial_cache por @ y por 'web:<dominio>'. NO toca
// trial_devices, users, ni suscripción/pago. Sin confirm → dry-run.
// Uso: node test-lote-reset-prueba-negocio.js  (desde el scratch)
// Secciones: A anclas estáticas · B unidad (node:sqlite en memoria) ·
// C boot EN VIVO de release/ · D boot de base-v917 (el endpoint no existe). // re-pineo re-estampador
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base-v917'); // re-pineo re-estampador: base v915 -> v917 (v916/v917 no tocan las zonas del lote)
const REL = path.join(ROOT, 'release');
const TOKEN = 'test-admin-918';
let pass = 0, fail = 0;
const failed = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; failed.push(name); console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function read(p) { return fs.readFileSync(p, 'utf-8'); }
function countOcc(s, sub) { return s.split(sub).length - 1; }
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 12); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srvBase = read(path.join(BASE, 'server.js'));
const srvRel = read(path.join(REL, 'server.js'));
const tlBase = read(path.join(BASE, 'trial-lock.js'));
const tlRel = read(path.join(REL, 'trial-lock.js'));

// ---------- A. Anclas estáticas: base vs release ----------
console.log('A. Anclas estáticas (base-v917 vs release/)'); // re-pineo re-estampador
t('A1 BUILD v918 x1 en release/server.js', countOcc(srvRel, "const BUILD_ID = '20261105-v918'") === 1);
t('A2 BUILD v900 x0 en release/server.js', countOcc(srvRel, '20261105-v900') === 0);
t('A3 endpoint /api/admin/trial-reset x1 con requireAdminToken', countOcc(srvRel, "app.post('/api/admin/trial-reset', requireAdminToken, express.json()") === 1 && countOcc(srvBase, 'trial-reset') === 0);
t('A4 trial-lock.js: purgeUsed definida x1 + exportada x1', countOcc(tlRel, 'function purgeUsed(db, igKey, domainKey)') === 1 && countOcc(tlRel, '  purgeUsed,') === 1 && countOcc(tlBase, 'purgeUsed') === 0);
t('A5 candados de negocio intactos: findUsed x13, findLock x5, device_used x3 iguales', countOcc(srvBase, 'findUsed') === 13 && countOcc(srvRel, 'findUsed') === 13 && countOcc(srvBase, 'findLock') === 5 && countOcc(srvRel, 'findLock') === 5 && countOcc(srvBase, 'device_used') === 3 && countOcc(srvRel, 'device_used') === 3);
t('A6 recordDevice x3 igual (trial_devices se sigue registrando, no se resetea)', countOcc(srvBase, 'recordDevice') === 3 && countOcc(srvRel, 'recordDevice') === 3);
t('A7 app.js / styles.css / index ES+EN byte-idénticos a base (lote no los toca)', md5(path.join(BASE, 'public/app.js')) === md5(path.join(REL, 'public/app.js')) && md5(path.join(BASE, 'public/styles.css')) === md5(path.join(REL, 'public/styles.css')) && md5(path.join(BASE, 'public/index.html')) === md5(path.join(REL, 'public/index.html')) && md5(path.join(BASE, 'public/en/index.html')) === md5(path.join(REL, 'public/en/index.html')));
t('A8 sin borrados masivos: ningún DELETE sin WHERE sobre trial_used/posts/trial_cache', !/DELETE FROM trial_used\s*;/.test(srvRel) && !/DELETE FROM posts\s*;/.test(srvRel) && !/DELETE FROM trial_cache\s*;/.test(srvRel) && !/DELETE FROM trial_locks\s*;/.test(srvRel));
t('A9 comentario v918 x1 en server.js + x1 en trial-lock.js', countOcc(srvRel, 'v918) Resetea el registro') === 1 && countOcc(tlRel, 'v918) purgeUsed') === 1);
t('A10 trialLockGate intacto (generate sigue con candado de negocio)', countOcc(srvBase, 'trialLockGate(fields, null, false)') === countOcc(srvRel, 'trialLockGate(fields, null, false)'));
t('A11 extend-trial intacto (el reseteo es otro endpoint, no lo reemplaza)', countOcc(srvBase, '/api/admin/extend-trial') === countOcc(srvRel, '/api/admin/extend-trial') && countOcc(srvRel, '/api/admin/extend-trial') === 1);

// ---------- B. Unidad: purgeUsed / purgeLock / backfill (DB en memoria) ----------
console.log('B. Unidad (node:sqlite en memoria, módulos de release/)');
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT DEFAULT '', is_guest INTEGER DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '', trial_ends_at INTEGER DEFAULT 0);
  CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', status TEXT DEFAULT 'draft');
  CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT, created_at INTEGER);
  CREATE TABLE trial_locks (id INTEGER PRIMARY KEY AUTOINCREMENT, ig TEXT, domain TEXT, business TEXT DEFAULT '', lang TEXT DEFAULT 'es', payload TEXT, generated_at INTEGER, created_at INTEGER);`);
  return db;
}
function seedBusiness(db, ig, domain, nPosts) {
  const tl = require(path.join(REL, 'trial-lock.js'));
  const gt = require(path.join(REL, 'guest-trial.js'));
  tl.ensureTrialUsedSchema(db);
  gt.ensureSchema(db);
  tl.recordUsed(db, { ig, domain });
  tl.recordLock(db, { ig, domain, business: ig, lang: 'es', payloadStr: '{}' });
  const r = db.prepare("INSERT INTO users (email, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (?, 1, ?, ?, ?)").run('guest-' + ig + '@guest.invalid', ig, domain, Date.now() - 86400000);
  const uid = r.lastInsertRowid;
  for (let i = 0; i < nPosts; i++) db.prepare("INSERT INTO posts (user_id, image_path, status) VALUES (?, '/x.jpg', 'scheduled')").run(uid);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, '{"x":1}', Date.now());
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('web:' + domain, '{"x":1}', Date.now());
  return uid;
}
(function unit() {
  const tlRelMod = require(path.join(REL, 'trial-lock.js'));
  const gtRelMod = require(path.join(REL, 'guest-trial.js'));
  // B1 — normalización igual que el resto del código.
  t('B1 normalizeIg/@Crumbl→crumbl; normalizeDomain(https://CRUMBLCOOKIES.COM/)→crumblcookies.com',
    tlRelMod.normalizeIg('@Crumbl') === 'crumbl' && tlRelMod.normalizeDomain('https://CRUMBLCOOKIES.COM/') === 'crumblcookies.com' && tlRelMod.normalizeIg('') === '' && tlRelMod.normalizeDomain('') === '');
  // B2 — purgeUsed borra solo ig+domain del negocio; vecino + email intactos.
  const db = freshDb();
  const uidC = seedBusiness(db, 'crumbl', 'crumblcookies.com', 3);
  const uidB = seedBusiness(db, 'officialbyredo', 'byredo.com', 2);
  db.prepare("INSERT INTO trial_used (kind, value, user_id, created_at) VALUES ('email', 'owner@crumblcookies.com', 555, ?)").run(Date.now());
  db.prepare('INSERT INTO trial_devices (device, ip, user_id, created_at) VALUES (?, ?, ?, ?)').run('dvc_crumbl', '1.2.3.4', uidC, Date.now());
  const before = db.prepare("SELECT COUNT(*) AS n FROM trial_used").get().n;
  const del = tlRelMod.purgeUsed(db, 'crumbl', 'crumblcookies.com');
  t('B2 purgeUsed(@crumbl) → 2 filas (ig+domain), total 5→3', del === 2 && before === 5 && db.prepare("SELECT COUNT(*) AS n FROM trial_used").get().n === 3, 'del=' + del + ' before=' + before);
  t('B3 vecino @officialbyredo intacto (used 2, locks 1, posts 2, cache 2)',
    tlRelMod.findUsed(db, 'officialbyredo', 'byredo.com') !== null &&
    db.prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = ?").get(uidB).n === 2 &&
    db.prepare("SELECT COUNT(*) AS n FROM trial_cache WHERE ig IN ('officialbyredo', 'web:byredo.com')").get().n === 2);
  t('B4 fila email del dueño intacta (no se resetea la cuenta registrada)',
    db.prepare("SELECT COUNT(*) AS n FROM trial_used WHERE kind = 'email' AND value = 'owner@crumblcookies.com'").get().n === 1);
  t('B5 purgeUsed sin identidad → 0; sobre negocio ya limpio → 0',
    tlRelMod.purgeUsed(db, '', '') === 0 && tlRelMod.purgeUsed(db, 'crumbl', 'crumblcookies.com') === 0);
  // B6 — purgeLock + backfill: tras borrar locks+used, el backfill NO resucita.
  const locksDel = tlRelMod.purgeLock(db, 'crumbl', 'crumblcookies.com');
  gtRelMod.backfillUsedFromLocks(db);
  t('B6 purgeLock(@crumbl) → 1; backfill post-reset NO resucita trial_used',
    locksDel === 1 && tlRelMod.findUsed(db, 'crumbl', 'crumblcookies.com') === null && tlRelMod.findLock(db, 'crumbl', 'crumblcookies.com') === null, 'locksDel=' + locksDel);
  t('B7 findUsed/findLock del vecino siguen viendo el bloqueo (no se tocó)',
    tlRelMod.findUsed(db, 'officialbyredo', 'byredo.com') !== null && tlRelMod.findLock(db, 'officialbyredo', 'byredo.com') !== null);
  // B8 — en BASE no existe purgeUsed (la función es nueva del lote).
  const tlBaseMod = require(path.join(BASE, 'trial-lock.js'));
  t('B8 en BASE trial-lock.js NO exporta purgeUsed', typeof tlBaseMod.purgeUsed === 'undefined');
  db.close();
})();

// ---------- C/D. Boots en vivo (release vs base) ----------
console.log('C/D. Boots en vivo (release/ vs base-v917)'); // re-pineo re-estampador
async function boot(dir, port, tag, extraEnv) {
  const base = '/tmp/boot-v918-' + tag;
  fs.rmSync(base, { recursive: true, force: true });
  const dataDir = base + '/data';
  fs.mkdirSync(dataDir, { recursive: true });
  const logPath = base + '/boot.log';
  const logFd = fs.openSync(logPath, 'w');
  const env = Object.assign({}, process.env, {
    PORT: String(port), DATA_DIR: dataDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  }, extraEnv || {});
  const child = spawn('node', ['server.js'], { cwd: dir, env, stdio: ['ignore', logFd, logFd] });
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/version');
      if (r.ok) { const j = await r.json(); up = j.build === '20261105-' + (tag === 'rel' ? 'v918' : 'v917') /* re-pineo re-estampador: boot base v915 -> v917 */; }
    } catch (e) { /* todavía no levanta */ }
  }
  if (!up) throw new Error('boot ' + tag + ' no levantó en puerto ' + port + ' (ver ' + logPath + ')');
  return { child, dataDir, logPath, port };
}
function seedBoot(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
  const now = Date.now();
  // Invitado crumbl (id 1001, reloj VENCIDO ayer: prueba el refresco) + 3 posteos.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1001, ?, ?, 1, ?, ?, ?)').run('guest-crumbl@guest.invalid', '', 'crumbl', 'crumblcookies.com', now - 86400000);
  // Vecino byredo (id 1002, reloj vigente) + 2 posteos.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1002, ?, ?, 1, ?, ?, ?)').run('guest-byredo@guest.invalid', '', 'officialbyredo', 'byredo.com', now + 2 * 86400000);
  // Cuenta registrada del dueño de Crumbl (id 555, NO se toca). Sin
  // guest_ig/guest_domain: una cuenta registrada aparte no lleva identidad
  // de invitado (el upgrade reusa LA MISMA fila invitada, no crea otra).
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (555, ?, ?, 0, ?, ?, ?)').run('owner@crumblcookies.com', 'x', '', '', now + 2 * 86400000);
  // Negocio philz con invitado YA REGISTRADO (id 1003, is_guest=0, misma
  // fila que era invitada: upgradeGuest no borra guest_ig/guest_domain)
  // + 2 posteos propios. El reseteo debe limpiar sus marcadores pero NO
  // sus posteos ni su reloj.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1003, ?, ?, 0, ?, ?, ?)').run('owner@philzcoffee.com', 'x', 'philz', 'philzcoffee.com', now + 2 * 86400000);
  for (let i = 0; i < 3; i++) db.prepare("INSERT INTO posts (user_id, image_path, status) VALUES (1001, '/x.jpg', 'scheduled')").run();
  for (let i = 0; i < 2; i++) db.prepare("INSERT INTO posts (user_id, image_path, status) VALUES (1002, '/x.jpg', 'scheduled')").run();
  for (let i = 0; i < 2; i++) db.prepare("INSERT INTO posts (user_id, image_path, status) VALUES (1003, '/x.jpg', 'scheduled')").run();
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig', 'philz', 1003, ?)").run(now);
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('domain', 'philzcoffee.com', 1003, ?)").run(now);
  db.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('philz', 'philzcoffee.com', 'Philz Coffee', 'es', '{}', now, now);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('philz', '{"x":1}', now);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('web:philzcoffee.com', '{"x":1}', now);
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig', 'crumbl', NULL, ?)").run(now);
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('domain', 'crumblcookies.com', NULL, ?)").run(now);
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('email', 'owner@crumblcookies.com', 555, ?)").run(now);
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig', 'officialbyredo', NULL, ?)").run(now);
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('domain', 'byredo.com', NULL, ?)").run(now);
  db.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('crumbl', 'crumblcookies.com', 'Crumbl Cookies', 'es', '{}', now, now);
  db.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('officialbyredo', 'byredo.com', 'Byredo', 'es', '{}', now, now);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('crumbl', '{"x":1}', now);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('web:crumblcookies.com', '{"x":1}', now);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('officialbyredo', '{"x":1}', now);
  db.prepare('INSERT INTO trial_devices (device, ip, user_id, created_at) VALUES (?, ?, ?, ?)').run('dvc_crumbl', '1.2.3.4', 1001, now);
  db.close();
  return { guestCrumblEndsBefore: now - 86400000 };
}
async function post(port, p, body) {
  const r = await fetch('http://127.0.0.1:' + port + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
function portFree(port) {
  try { execSync('ss -ltn | grep -q ":' + port + ' "'); return false; } catch (e) { return true; }
}
function killBoot(b) {
  try { process.kill(b.child.pid, 'SIGTERM'); } catch (e) {}
  return sleep(1500).then(() => {
    let alive = true;
    try { process.kill(b.child.pid, 0); } catch (e) { alive = false; }
    if (alive) { try { process.kill(b.child.pid, 'SIGKILL'); } catch (e) {} }
  });
}
function readLiveDb(dataDir, fn) {
  // Lectura directa de la DB del boot (reintenta si el server escribe).
  for (let i = 0; i < 10; i++) {
    try {
      const db = new DatabaseSync(path.join(dataDir, 'posta.db'), { readOnly: true });
      const out = fn(db);
      db.close();
      return out;
    } catch (e) { /* ocupado: reintenta */ }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  throw new Error('no se pudo leer la DB del boot');
}

(async () => {
  // --- C. release/ en puerto 34971 ---
  const rel = await boot(REL, 34971, 'rel', { ADMIN_TOKEN: TOKEN });
  const seed = seedBoot(rel.dataDir);
  await sleep(500);
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const r = await fetch('http://127.0.0.1:34971/api/version');
    const j = await r.json();
    if (j.build === '20261105-v918') ok++;
  }
  t('C0 /api/version v918 5/5 en boot release', ok === 5);
  const dryC = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: '@Crumbl', domain: 'https://crumblcookies.com/' });
  t('C1 dry-run @crumbl (inputs sucios) → used 2, locks 1, posts 3, cache 2, total 8', dryC.status === 200 && dryC.j.dry_run === true && dryC.j.trial_used === 2 && dryC.j.trial_locks === 1 && dryC.j.posts === 3 && dryC.j.trial_cache === 2 && dryC.j.total === 8 && dryC.j.ig === 'crumbl' && dryC.j.domain === 'crumblcookies.com', JSON.stringify(dryC.j));
  const dryB = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'officialbyredo', domain: 'byredo.com' });
  t('C2 dry-run vecino @officialbyredo → used 2, locks 1, posts 2, cache 1, total 6', dryB.status === 200 && dryB.j.trial_used === 2 && dryB.j.trial_locks === 1 && dryB.j.posts === 2 && dryB.j.trial_cache === 1 && dryB.j.total === 6, JSON.stringify(dryB.j));
  const gsPre = await post(34971, '/api/guest/start', { ig: 'crumbl', domain: 'crumblcookies.com', device: 'dvc_fresh_pre', lang: 'es' });
  t('C3 ANTES del reset: guest/start @crumbl → 409 trial_used (invitado con posteos)', gsPre.status === 409 && gsPre.j.trial_used === true, 'status=' + gsPre.status + ' ' + JSON.stringify(gsPre.j));
  const coPre = await post(34971, '/api/trial/chat-onboarding', { kind: 'join', ig: 'crumbl', domain: 'crumblcookies.com', device: 'dvc_fresh_pre', lang: 'es' });
  t('C4 ANTES del reset: chat-onboarding join @crumbl → 409 trial_used', coPre.status === 409 && coPre.j.trial_used === true, 'status=' + coPre.status + ' ' + JSON.stringify(coPre.j));
  const noTok = await post(34971, '/api/admin/trial-reset', { ig: 'crumbl', confirm: true });
  t('C5 sin token admin → 403 no autorizado (requireAdminToken vigente)', noTok.status === 403, 'status=' + noTok.status);
  const badTok = await post(34971, '/api/admin/trial-reset?token=otro', { ig: 'crumbl', confirm: true });
  t('C6 token incorrecto → 403', badTok.status === 403, 'status=' + badTok.status);
  const noId = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { confirm: true });
  t('C7 sin ig ni dominio → 400', noId.status === 400, 'status=' + noId.status + ' ' + JSON.stringify(noId.j));
  const dryC2 = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com' });
  t('C8 dry-run NO borra nada (segundo dry-run da los mismos conteos)', dryC2.status === 200 && dryC2.j.total === 8, JSON.stringify(dryC2.j));
  const rst = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com', confirm: true });
  t('C9 confirm @crumbl → reset_hecho, borrados used 2, locks 1, posts 3, cache 2', rst.status === 200 && rst.j.reset_hecho === true && rst.j.trial_used === 2 && rst.j.trial_locks === 1 && rst.j.posts === 3 && rst.j.trial_cache === 2 && rst.j.trial_ends_refrescado === true, JSON.stringify(rst.j));
  const dryC3 = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com' });
  t('C10 segundo reset @crumbl → sin_registro (200, nada que borrar)', dryC3.status === 200 && dryC3.j.sin_registro === true && dryC3.j.total === 0, JSON.stringify(dryC3.j));
  const gsPost = await post(34971, '/api/guest/start', { ig: 'crumbl', domain: 'crumblcookies.com', device: 'dvc_fresh_post', lang: 'es' });
  t('C11 DESPUÉS del reset: guest/start @crumbl → 404 no_week (pasó los candados, no hay semana)', gsPost.status === 404 && gsPost.j.no_week === true, 'status=' + gsPost.status + ' ' + JSON.stringify(gsPost.j));
  const coPost = await post(34971, '/api/trial/chat-onboarding', { kind: 'join', ig: 'crumbl', domain: 'crumblcookies.com', device: 'dvc_fresh_post', lang: 'es' });
  t('C12 DESPUÉS del reset: chat-onboarding join @crumbl → 200 (re-generación avanza)', coPost.status === 200 && coPost.j.ok === true, 'status=' + coPost.status + ' ' + JSON.stringify(coPost.j));
  const dryC4 = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com' });
  t('C13 tras guest/start + join, el dry-run sigue sin_registro (backfill NO resucitó nada)', dryC4.status === 200 && dryC4.j.sin_registro === true && dryC4.j.total === 0, JSON.stringify(dryC4.j));
  const dryB2 = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'officialbyredo', domain: 'byredo.com' });
  t('C14 vecino @officialbyredo intacto tras el reset (totales 6, sin tocar)', dryB2.status === 200 && dryB2.j.total === 6 && dryB2.j.trial_used === 2 && dryB2.j.trial_locks === 1 && dryB2.j.posts === 2 && dryB2.j.trial_cache === 1, JSON.stringify(dryB2.j));
  // Caso invitado YA REGISTRADO (@philz): el reseteo limpia marcadores
  // pero NO cuenta sus posteos ni toca su reloj.
  const dryP = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'philz', domain: 'philzcoffee.com' });
  t('C14b dry-run @philz registrado → used 2, locks 1, posts 0 (no se cuentan), cache 2, guest_is_guest false', dryP.status === 200 && dryP.j.trial_used === 2 && dryP.j.trial_locks === 1 && dryP.j.posts === 0 && dryP.j.trial_cache === 2 && dryP.j.guest_id === 1003 && dryP.j.guest_is_guest === false && dryP.j.total === 5, JSON.stringify(dryP.j));
  const rstP = await post(34971, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'philz', domain: 'philzcoffee.com', confirm: true });
  t('C14c confirm @philz registrado → reset_hecho, posts 0, reloj NO refrescado', rstP.status === 200 && rstP.j.reset_hecho === true && rstP.j.trial_used === 2 && rstP.j.trial_locks === 1 && rstP.j.posts === 0 && rstP.j.trial_cache === 2 && rstP.j.trial_ends_refrescado === false, JSON.stringify(rstP.j));
  const verify = readLiveDb(rel.dataDir, (db) => ({
    postsCrumbl: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1001').get().n,
    postsByredo: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1002').get().n,
    postsPhilz: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1003').get().n,
    endsCrumbl: db.prepare('SELECT trial_ends_at AS n FROM users WHERE id = 1001').get().n,
    endsPhilz: db.prepare('SELECT trial_ends_at AS n FROM users WHERE id = 1003').get().n,
    emailRow: db.prepare("SELECT COUNT(*) AS n FROM trial_used WHERE kind = 'email' AND value = 'owner@crumblcookies.com'").get().n,
    deviceRow: db.prepare("SELECT COUNT(*) AS n FROM trial_devices WHERE device = 'dvc_crumbl'").get().n,
    user555: db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = 555 AND is_guest = 0').get().n,
    usedByredo: db.prepare("SELECT COUNT(*) AS n FROM trial_used WHERE value IN ('officialbyredo', 'byredo.com')").get().n,
    locksByredo: db.prepare("SELECT COUNT(*) AS n FROM trial_locks WHERE ig = 'officialbyredo'").get().n,
  }));
  t('C15 DB: posteos crumbl 3→0, byredo 2 intactos', verify.postsCrumbl === 0 && verify.postsByredo === 2, JSON.stringify(verify));
  t('C16 DB: reloj del invitado crumbl refrescado (vencido ayer → ahora +3d)', verify.endsCrumbl > Date.now() && verify.endsCrumbl <= Date.now() + 3 * 86400000 + 60000, 'ends=' + verify.endsCrumbl);
  t('C17 DB: fila email del dueño + trial_devices + cuenta 555 + vecino intactos; philz registrado: posteos 2 y reloj sin tocar (~2d, no 3d)', verify.emailRow === 1 && verify.deviceRow === 1 && verify.user555 === 1 && verify.usedByredo === 2 && verify.locksByredo === 1 && verify.postsPhilz === 2 && verify.endsPhilz > Date.now() + 86400000 && verify.endsPhilz < Date.now() + 2.5 * 86400000, JSON.stringify(verify));
  const logRel = read(rel.logPath);
  t('C18 boot release: sin errores fatales en boot.log; el log trae [admin] trial-reset', !/Error: |Uncaught Exception|UnhandledPromiseRejection/.test(logRel) && logRel.includes('[admin] trial-reset @crumbl (crumblcookies.com)'));
  await killBoot(rel);
  await sleep(1000);
  t('C19 boot release matado por PID exacto, puerto 34971 libre', portFree(34971));
  t('C20 sin data/ en release/ tras el boot (trampa v907)', !fs.existsSync(path.join(REL, 'data')));

  // --- D. base-v917 en puerto 34972 (el endpoint no existe) --- // re-pineo re-estampador
  const base = await boot(BASE, 34972, 'base', { ADMIN_TOKEN: TOKEN });
  const d1 = await post(34972, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com' });
  t('D1 en BASE /api/admin/trial-reset → 404 (el endpoint es nuevo del lote)', d1.status === 404, 'status=' + d1.status);
  await killBoot(base);
  await sleep(1000);
  t('D2 boot base matado por PID exacto, puerto 34972 libre', portFree(34972));

  console.log('\n=== v918: ' + pass + ' passed, ' + fail + ' failed ===');
  if (failed.length) { console.log('FALLIDOS: ' + failed.join(' | ')); process.exit(1); }
})().catch((e) => { console.error('SUITE ABORTÓ:', e); process.exit(2); });
