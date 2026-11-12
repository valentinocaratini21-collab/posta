// test-lote-mezcla-cuentas-perfil.js — v928 MEZCLA-CUENTAS-PERFIL
// BUG (Valentino en vivo, 11/11, URGENTE): en el perfil de Veja aparecían
// los posteos que van a salir en el perfil de Posty; y tras crear la prueba
// de Byredo, el dashboard cambiaba a la cuenta preexistente de Olive & June.
// CAUSA (dos mecanismos, una sola raíz: la identidad se resolvía implícita):
// (1) SERVIDOR — /api/guest/start sin identidad RETOMABA por dispositivo al
// invitado registrado para ese device/ip, cambiando la sesión a OTRA cuenta
// sin que el visitante lo pidiera ni lo pudiera probar (Byredo→Olive&June).
// (2) CLIENTE — la sesión podía cambiar bajo el SPA vivo (otra pestaña,
// volver atrás, login) y ME + la caché GET (60 s, sin verificación de dueño
// al leer) + HOME_PROF (respaldo sin dueño) seguían de la CUENTA ANTERIOR:
// la grilla mezclaba el perfil de una cuenta con los posteos de otra
// (Veja→Posty). El servidor ya era correcto por userId; el cliente, no.
// FIX: (F1) el retome sin identidad exige continuidad de sesión (si no, 409
// device_used); (F2) findGuestByIdentity/deviceUsed deterministas (ORDER BY,
// el más nuevo); (F3) el invitado reusado adopta el @/dominio nuevo y su
// perfil se escribe sin COALESCE (solo invitados); (F4) la caché GET lleva
// dueño y la lectura lo verifica; (F5) refreshSession vacía HOME_PROF al
// cambiar la cuenta; (F6) HOME_PROF/HF_CUR_PROF llevan dueño y el respaldo
// solo se usa si es de ME; (F7) revalidación ligera de identidad (/me) al
// entrar a Inicio/Feed, al navegar, al volver atrás y al volver a la pestaña.
// Uso: node test-lote-mezcla-cuentas-perfil.js  (desde el scratch)
// Secciones: A anclas estáticas · B unidad (node:sqlite en memoria) ·
// C boot EN VIVO de release/ · D boot de base-v927 (reproduce el bug).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base-v927');
const REL = path.join(ROOT, 'release');
const SECRET = 'test-secret-928';
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
const gtBase = read(path.join(BASE, 'guest-trial.js'));
const gtRel = read(path.join(REL, 'guest-trial.js'));
const gsiBase = read(path.join(BASE, 'guest-set-ig.js'));
const gsiRel = read(path.join(REL, 'guest-set-ig.js'));
const appBase = read(path.join(BASE, 'public/app.js'));
const appRel = read(path.join(REL, 'public/app.js'));

// ---------- A. Anclas estáticas: base vs release ----------
console.log('A. Anclas estáticas (base-v927 vs release/)');
t('A1 BUILD v928 x1, v900 x0, v916 x0, v927 x0 en release/server.js', countOcc(srvRel, "const BUILD_ID = '20261105-v928'") === 1 && countOcc(srvRel, '20261105-v900') === 0 && countOcc(srvRel, '20261105-v916') === 0 && countOcc(srvRel, '20261105-v927') === 0);
t('A2 F1: retome sin identidad exige continuidad (curUid) y 409 si no', countOcc(srvRel, 'const curUid = (req.session && req.session.userId) || null;') === 1 && countOcc(srvRel, "if (!curUid || String(curUid) !== String(duRow.id))") === 1 && countOcc(srvBase, 'curUid') === 0);
t('A3 F3: reuso adopta guest_ig/guest_domain (solo is_guest=1)', countOcc(srvRel, "UPDATE users SET guest_ig = ?, guest_domain = ? WHERE id = ? AND is_guest = 1") === 1 && countOcc(srvBase, 'guest_ig = ?, guest_domain = ? WHERE id = ? AND is_guest = 1') === 0);
t('A4 F3: perfil sin COALESCE x2 en server.js (guest/start + set-ig, con EXISTS is_guest=1)', countOcc(srvRel, 'UPDATE profiles SET ig_username = ?, business_name = ?, category = ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND is_guest = 1)') === 2 && countOcc(srvRel, 'COALESCE(NULLIF(ig_username') === 0);
t('A5 F3b: applyGuestIg sin COALESCE (plain set)', countOcc(gsiRel, "db.prepare('UPDATE profiles SET ig_username = ? WHERE user_id = ?')") === 1 && countOcc(gsiBase, 'COALESCE(NULLIF(ig_username') === 1 && countOcc(gsiRel, 'COALESCE(NULLIF(ig_username') === 0);
t('A6 F2: findGuestByIdentity ORDER BY id DESC; deviceUsed por IP ORDER BY created_at DESC', countOcc(gtRel, 'ORDER BY id DESC LIMIT 1') === 1 && countOcc(gtRel, 'ORDER BY created_at DESC LIMIT 1') === 1 && countOcc(gtBase, 'ORDER BY id DESC') === 0);
t('A7 F4: caché GET con dueño (put estampa user; get verifica e.user !== PZ_CACHE_USER; base 4 → release 6)', countOcc(appRel, 'user: PZ_CACHE_USER') === 1 && countOcc(appRel, 'if (e.user !== PZ_CACHE_USER)') === 1 && countOcc(appBase, 'PZ_CACHE_USER') === 4 && countOcc(appRel, 'PZ_CACHE_USER') === 6);
t('A8 F6: HOME_PROF_UID + helpers (pzHomeProfGet/pzCurProfSet) y ningún respaldo sin dueño', countOcc(appRel, 'let HOME_PROF_UID = null;') === 1 && countOcc(appRel, 'function pzHomeProfGet()') === 1 && countOcc(appRel, 'function pzCurProfSet(payload)') === 1 && countOcc(appRel, 'let prof = HOME_PROF;') === 0 && countOcc(appRel, 'HOME_PROF = hpRes') === 0 && countOcc(appRel, 'HF_CUR_PROF = prof; HOME_PROF = prof;') === 0 && countOcc(appRel, 'let prof = pzHomeProfGet();') === 2);
t('A9 F6: f3HomeTilesFrom usa recents solo del perfil verificado', countOcc(appRel, 'recents: ((pzHomeProfGet() || {}).recents || [])') === 1);
t('A10 F5: refreshSession vacía HOME_PROF/HF_CUR_PROF al cambiar la cuenta', countOcc(appRel, 'HOME_PROF = null; HOME_PROF_UID = null; HF_CUR_PROF = null; HF_CUR_PROF_UID = null;') === 2);
t('A11 F7: pzRevalidateIdentity definida + inicioView/feedView la esperan + hooks hashchange/pageshow/visibilitychange', countOcc(appRel, 'async function pzRevalidateIdentity()') === 1 && countOcc(appRel, 'await pzRevalidateIdentity()') === 2 && countOcc(appRel, "window.addEventListener('pageshow'") === 1 && countOcc(appRel, "document.addEventListener('visibilitychange', () => { try { if (!document.hidden) pzRevalidateIdentity(); } catch (e) {} });") === 1);
t('A12 app.js?v=639 x1 en index ES; styles intacto (20261255) en ES+EN; EN sin app.js?v=', countOcc(read(path.join(REL, 'public/index.html')), 'app.js?v=639') === 1 && countOcc(read(path.join(REL, 'public/index.html')), 'styles.css?v=20261255') === 1 && countOcc(read(path.join(REL, 'public/en/index.html')), 'styles.css?v=20261255') === 1 && read(path.join(BASE, 'public/en/index.html')) === read(path.join(REL, 'public/en/index.html')) && countOcc(read(path.join(REL, 'public/styles.css')), 'x') >= 0);
t('A13 styles.css byte-idéntico a base (el lote no lo toca)', md5(path.join(BASE, 'public/styles.css')) === md5(path.join(REL, 'public/styles.css')));
t('A14 sin DELETE sin WHERE nuevos: ningún borrado masivo', !/DELETE FROM users\s*;/.test(srvRel) && !/DELETE FROM posts\s*;/.test(srvRel) && !/DELETE FROM sessions\s*;/.test(srvRel));
t('A15 vecinos intactos: device_used 3→4 (base v927: el 409 sin-identidad + el passthrough de set-ig x2 en una línea; F1 añade su propio 409 de sin-continuidad en guest/start; v912 quitó 3 de los caminos CON identidad), homeSnapshotGet igual, guest/start x1', countOcc(srvBase, 'device_used') === 3 && countOcc(srvRel, 'device_used') === 4 && countOcc(srvBase, 'homeSnapshotGet') === countOcc(srvRel, 'homeSnapshotGet') && countOcc(srvBase, "app.post('/api/guest/start'") === countOcc(srvRel, "app.post('/api/guest/start'"));

// ---------- B. Unidad: guest-trial + guest-set-ig (DB en memoria) ----------
console.log('B. Unidad (node:sqlite en memoria, módulos de release/)');
(function () {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT DEFAULT '', is_guest INTEGER DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '', trial_ends_at INTEGER DEFAULT 0);
    CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, ig_username TEXT DEFAULT '', business_name TEXT DEFAULT '', category TEXT DEFAULT '');
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT DEFAULT '', status TEXT DEFAULT '', source TEXT DEFAULT '');
    CREATE TABLE post_signals (post_id INTEGER);
    CREATE TABLE trial_devices (device TEXT NOT NULL, ip TEXT NOT NULL, user_id INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (device));
    CREATE TABLE trial_used (kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (kind, value));
    CREATE TABLE trial_locks (ig TEXT, domain TEXT, business TEXT, lang TEXT, payload TEXT, generated_at INTEGER, created_at INTEGER);`);
  const gt = require(path.join(REL, 'guest-trial.js'));
  const gsi = require(path.join(REL, 'guest-set-ig.js'));
  const now = Date.now();
  // Dos invitados que matchean ambiguo por ig O dominio: el viejo (id 10) y el nuevo (id 11).
  db.prepare("INSERT INTO users (id, email, is_guest, guest_ig, guest_domain) VALUES (10, 'g-old@guest.invalid', 1, 'veja', '')").run();
  db.prepare("INSERT INTO users (id, email, is_guest, guest_ig, guest_domain) VALUES (11, 'g-new@guest.invalid', 1, '', 'veja.com')").run();
  const amb = gt.findGuestByIdentity(db, 'veja', 'veja.com');
  t('B1 findGuestByIdentity ambiguo (ig en uno, dominio en otro) → el MÁS NUEVO (id 11), no arbitrario', amb && amb.id === 11, JSON.stringify(amb));
  db.prepare("INSERT INTO trial_devices (device, ip, user_id, created_at) VALUES ('d1', '9.9.9.9', 10, ?)").run(now - 10000);
  db.prepare("INSERT INTO trial_devices (device, ip, user_id, created_at) VALUES ('d2', '9.9.9.9', 11, ?)").run(now);
  const du = gt.deviceUsed(db, '', '9.9.9.9');
  t('B2 deviceUsed por IP ambiguo → el MÁS NUEVO (user 11)', du && du.user_id === 11, JSON.stringify(du));
  // applyGuestIg: perfil con @ viejo 'aaa' → set-ig 'bbb' lo reemplaza (antes COALESCE lo dejaba pegado).
  db.prepare("INSERT INTO users (id, email, is_guest, guest_ig) VALUES (20, 'g@guest.invalid', 1, 'aaa')").run();
  db.prepare("INSERT INTO profiles (user_id, ig_username, business_name) VALUES (20, 'aaa', 'AAA')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, source) VALUES (20, '/a.jpg', 'scheduled', 'trial')").run();
  const v = gsi.resolveSetIg(db, { trialLock: null, guestTrial: gt }, { userId: 20, ig: 'bbb', device: 'd-fresh', ip: '8.8.8.8' });
  const prof20 = db.prepare('SELECT ig_username FROM profiles WHERE user_id = 20').get();
  const usr20 = db.prepare('SELECT guest_ig FROM users WHERE id = 20').get();
  const n20 = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 20').get().n;
  t('B3 set-ig con @ distinto: semana vieja borrada (cleared=1) y perfil sigue al @ nuevo (bbb, no aaa)', v && v.ok && v.changed === true && v.cleared === 1 && prof20.ig_username === 'bbb' && usr20.guest_ig === 'bbb' && n20 === 0, JSON.stringify({ v, prof20, usr20, n20 }));
  const v2 = gsi.resolveSetIg(db, { trialLock: null, guestTrial: gt }, { userId: 20, ig: 'bbb', device: 'd-fresh', ip: '8.8.8.8' });
  t('B4 set-ig idempotente con el mismo @ y sin posteos → need_generate (no already sin semana)', v2 && v2.ok && v2.need_generate === true, JSON.stringify(v2));
  db.close();
})();

// ---------- C/D. Boots en vivo (release vs base) ----------
console.log('C/D. Boots en vivo (release/ vs base-v927)');
async function boot(dir, port, tag) {
  const base = '/tmp/boot-v928-' + tag;
  fs.rmSync(base, { recursive: true, force: true });
  const dataDir = base + '/data';
  fs.mkdirSync(dataDir, { recursive: true });
  const logPath = base + '/boot.log';
  const logFd = fs.openSync(logPath, 'w');
  const env = Object.assign({}, process.env, {
    PORT: String(port), DATA_DIR: dataDir, SESSION_SECRET: SECRET,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  });
  const child = spawn('node', ['server.js'], { cwd: dir, env, stdio: ['ignore', logFd, logFd] });
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/version');
      if (r.ok) { const j = await r.json(); up = j.build === '20261105-' + (tag.startsWith('rel') ? 'v928' : 'v927'); }
    } catch (e) { /* todavía no levanta */ }
  }
  if (!up) throw new Error('boot ' + tag + ' no levantó en puerto ' + port + ' (ver ' + logPath + ')');
  return { child, dataDir, logPath, port };
}
function signSid(sid) {
  const cs = require('/home/hatch/workspace/posta/node_modules/cookie-signature');
  return 's:' + cs.sign(sid, SECRET);
}
function seedBoot(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
  const now = Date.now();
  // Invitado Olive & June (1001, el del dispositivo compartido) + 2 posteos.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1001, ?, ?, 1, ?, ?, ?)').run('guest-oj@guest.invalid', '', 'oliveandjune', 'oliveandjune.com', now + 2 * 86400000);
  // Invitado Veja (1002) + 1 posteo.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1002, ?, ?, 1, ?, ?, ?)').run('guest-veja@guest.invalid', '', 'veja', 'veja.com', now + 2 * 86400000);
  // Cuenta registrada Posty (12, Valentino) + 3 posteos (la tira).
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (12, ?, ?, 0, ?, ?, ?)').run('valentino_bamboo@hotmail.com', 'x', '', '', now + 2 * 86400000);
  db.prepare("INSERT OR REPLACE INTO profiles (user_id, ig_username, business_name, category) VALUES (1001, 'oliveandjune', 'Olive & June', 'belleza')").run();
  db.prepare("INSERT OR REPLACE INTO profiles (user_id, ig_username, business_name, category) VALUES (1002, 'veja', 'VEJA', 'moda')").run();
  db.prepare("INSERT OR REPLACE INTO profiles (user_id, ig_username, business_name, category) VALUES (12, 'posty.communitymanager', 'Posty', 'servicios')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, caption) VALUES (1001, '/oj1.jpg', 'scheduled', 'OJ post 1')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, caption) VALUES (1001, '/oj2.jpg', 'scheduled', 'OJ post 2')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, caption, source) VALUES (1002, '/veja1.jpg', 'scheduled', 'VEJA post 1', 'trial')").run();
  for (let i = 0; i < 3; i++) db.prepare("INSERT INTO posts (user_id, image_path, status, caption) VALUES (12, '/p.jpg', 'scheduled', 'POSTY tira')").run();
  // El dispositivo compartido del perfil de pruebas: registrado por Olive & June (la primera).
  db.prepare("INSERT INTO trial_devices (device, ip, user_id, created_at) VALUES ('dvc_shared', '10.0.0.1', 1001, ?)").run(now - 86400000);
  // Snapshots: Veja y Posty (para que /api/home/profile no salga a leer IG en vivo).
  const snapV = JSON.stringify({ source: 'read', username: 'veja', name: 'VEJA', pic: null, bio: '', followers: 1100000, posts_count: 3507, following: 10, is_verified: true, highlights: [], recents: [{ img: '/media/veja1.jpg', type: 'image', taken_at: 1792000000, shortcode: 'VEJA1' }], captured_at: now });
  const snapP = JSON.stringify({ source: 'read', username: 'posty.communitymanager', name: 'Posty', pic: null, bio: '', followers: 8, posts_count: 10, following: 1, is_verified: true, highlights: [], recents: [{ img: '/media/p1.jpg', type: 'image', taken_at: 1792000000, shortcode: 'POSTY1' }], captured_at: now });
  db.prepare('INSERT OR REPLACE INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (1002, ?, ?, ?)').run('veja', snapV, now);
  db.prepare('INSERT OR REPLACE INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (12, ?, ?, ?)').run('posty.communitymanager', snapP, now);
  // Sesiones firmadas: Veja (1002), Olive & June (1001), Posty (12).
  const sess = (uid) => JSON.stringify({ cookie: { originalMaxAge: 31536000000, expires: new Date(now + 31536000000).toISOString(), httpOnly: true, path: '/' }, userId: uid });
  db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run('sess-veja', sess(1002), now + 86400000);
  db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run('sess-oj', sess(1001), now + 86400000);
  db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run('sess-posty', sess(12), now + 86400000);
  db.close();
}
async function req(port, p, opts) {
  const o = opts || {};
  const r = await fetch('http://127.0.0.1:' + port + p, {
    method: o.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, o.headers || {}),
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  const setCookie = r.headers.get('set-cookie') || '';
  return { status: r.status, j, setCookie };
}
function cookieFor(sid) { return 'connect.sid=' + encodeURIComponent(signSid(sid)); }
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
  // --- C. release/ en puerto 34981 ---
  const rel = await boot(REL, 34981, 'rel');
  console.log('C. Boot release/ v928 (puerto 34981, PID ' + rel.child.pid + ')');
  seedBoot(rel.dataDir);
  // C0: /api/version 5/5.
  let ok5 = 0;
  for (let i = 0; i < 5; i++) {
    const r = await req(34981, '/api/version');
    if (r.status === 200 && r.j.build === '20261105-v928') ok5++;
  }
  t('C0 /api/version v928 5/5', ok5 === 5, ok5 + '/5');
  // C10 va PRIMERO: el chequeo de dispositivo también mira la IP y en el
  // boot todas las llamadas salen de 127.0.0.1; un recordDevice anterior
  // (C2/C8) dejaría esa IP registrada y el join daría 409 por IP, no por el
  // lote. Acá todavía no hay ninguna fila con esa IP.
  // C10: join con identidad nueva y device fresco (camino v912 intacto).
  const c10 = await req(34981, '/api/trial/chat-onboarding', { method: 'POST', body: { kind: 'join', ig: 'nuevamarca', domain: 'nuevamarca.com', device: 'dvc_fresh_join', ip: '8.8.8.8' } });
  t('C10 chat-onboarding join (negocio nuevo, device fresco) → 200 con user_id nuevo (distinto de los sembrados 12/1001/1002)', c10.status === 200 && c10.j && typeof c10.j.user_id === 'number' && ![12, 1001, 1002].includes(c10.j.user_id), c10.status + ' ' + JSON.stringify(c10.j));
  const dv = 'dvc_shared';
  // C1: SIN identidad, con sesión de VEJA (1002) pero el dispositivo es de Olive & June (1001) → 409, NO retoma.
  const c1 = await req(34981, '/api/guest/start', { method: 'POST', headers: { Cookie: cookieFor('sess-veja') }, body: { device: dv } });
  t('C1 no-identidad con sesión de OTRO invitado → 409 device_used (no retoma a Olive & June)', c1.status === 409 && c1.j && c1.j.device_used === true, c1.status + ' ' + JSON.stringify(c1.j));
  // C2: SIN identidad, con sesión de Olive & June (1001) = el mismo invitado → resumed:true, user 1001.
  const c2 = await req(34981, '/api/guest/start', { method: 'POST', headers: { Cookie: cookieFor('sess-oj') }, body: { device: dv } });
  t('C2 no-identidad con sesión del MISMO invitado → resumed:true user 1001 (la re-entrada legítima sigue)', c2.status === 200 && c2.j.resumed === true && c2.j.user_id === 1001, c2.status + ' ' + JSON.stringify(c2.j));
  // C3: SIN identidad, SIN sesión → 409 (no hay continuidad que probar).
  const c3 = await req(34981, '/api/guest/start', { method: 'POST', body: { device: dv } });
  t('C3 no-identidad sin sesión → 409 device_used (no retoma anónimo)', c3.status === 409 && c3.j && c3.j.device_used === true, c3.status + ' ' + JSON.stringify(c3.j));
  // C12 (preparador): join CON identidad sobre el DISPOSITIVO COMPARTIDO
  // (dvc_shared, de Olive & June) para un negocio NUEVO -> 200 (regla v912
  // vigente: F1 vive SOLO en la rama sin identidad; con @ no hay 409 de
  // dispositivo). Va tras C3 para no tocar el orden de C1/C2.
  const c12 = await req(34981, '/api/trial/chat-onboarding', { method: 'POST', body: { kind: 'join', ig: 'otramarca2', domain: 'otramarca2.com', device: dv } });
  t('C12 join CON identidad (negocio nuevo) sobre el dispositivo compartido → 200 con user_id nuevo (F1 no reintroduce el 409 de v912)', c12.status === 200 && c12.j && typeof c12.j.user_id === 'number' && ![12, 1001, 1002, c10.j.user_id].includes(c12.j.user_id), c12.status + ' ' + JSON.stringify(c12.j));
  // C4: /api/posts con sesión Veja → SOLO su posteo; nunca los de Posty ni Olive & June.
  // /api/posts devuelve un ARRAY pelado (res.json(rows)), no {posts:[...]}.
  const c4 = await req(34981, '/api/posts', { headers: { Cookie: cookieFor('sess-veja') } });
  const capsV = (Array.isArray(c4.j) ? c4.j : []).map((p) => p.caption);
  t('C4 /api/posts (Veja) solo sus posteos: 1× VEJA, 0× POSTY, 0× OJ', c4.status === 200 && capsV.length === 1 && capsV[0] === 'VEJA post 1', c4.status + ' ' + JSON.stringify(capsV));
  // C5: /api/posts con sesión Posty → SOLO los 3 de la tira.
  const c5 = await req(34981, '/api/posts', { headers: { Cookie: cookieFor('sess-posty') } });
  const capsP = (Array.isArray(c5.j) ? c5.j : []).map((p) => p.caption);
  t('C5 /api/posts (Posty) solo los suyos: 3× POSTY tira', c5.status === 200 && capsP.length === 3 && capsP.every((c) => c === 'POSTY tira'), c5.status + ' ' + JSON.stringify(capsP));
  // C6: /api/home/profile con sesión Veja → username 'veja' (snapshot propio), nunca 'posty.communitymanager'.
  // /api/home/profile devuelve el overlay a NIVEL SUPERIOR ({ok, username, recents, ...}), no bajo .profile.
  const c6 = await req(34981, '/api/home/profile', { headers: { Cookie: cookieFor('sess-veja') } });
  const un6 = c6.j && c6.j.username;
  const rec6 = (c6.j && c6.j.recents) || [];
  t('C6 /api/home/profile (Veja) → username veja, recents solo VEJA1', c6.status === 200 && un6 === 'veja' && rec6.length === 1 && rec6[0].shortcode === 'VEJA1', c6.status + ' ' + JSON.stringify({ un: un6, rec: rec6 }));
  // C7: /api/home/profile con sesión Posty → 'posty.communitymanager' (el mismo endpoint, otra cuenta, otro resultado).
  const c7 = await req(34981, '/api/home/profile', { headers: { Cookie: cookieFor('sess-posty') } });
  const un7 = c7.j && c7.j.username;
  t('C7 /api/home/profile (Posty) → username posty.communitymanager (las dos sesiones en paralelo no se cruzan)', c7.status === 200 && un7 === 'posty.communitymanager', c7.status + ' ' + JSON.stringify(un7));
  // C9: /api/me con sesión Veja → user_id 1002 (la identidad que el cliente revalida).
  // /api/auth/me devuelve {user:{id, is_guest, ...}}.
  const c9 = await req(34981, '/api/auth/me', { headers: { Cookie: cookieFor('sess-veja') } });
  t('C9 /api/auth/me (Veja) → user.id 1002, is_guest true', c9.status === 200 && c9.j && c9.j.user && c9.j.user.id === 1002 && c9.j.user.is_guest === true, c9.status + ' ' + JSON.stringify(c9.j));
  await killBoot(rel);
  t('C11 puerto 34981 libre tras matar el boot por PID', portFree(34981));

  // --- C8 en SEGUNDO boot (puerto 34983, DB fresca): el chequeo de
  // dispositivo también mira la IP y en el boot todo sale de 127.0.0.1; el
  // join de C10 ya registró esa IP para otro invitado, así que el set-ig
  // de Veja daría 409 por IP compartida de laboratorio (no por el lote).
  // En un boot fresco no hay ninguna fila con esa IP y el set-ig procede.
  const rel2 = await boot(REL, 34983, 'rel2');
  console.log('C8. Segundo boot release/ v928 (puerto 34983, PID ' + rel2.child.pid + ')');
  seedBoot(rel2.dataDir);
  const c8 = await req(34983, '/api/guest/set-ig', { method: 'POST', headers: { Cookie: cookieFor('sess-veja') }, body: { ig: 'veja2', device: 'dvc_fresh_setig', ip: '8.8.8.8' } });
  const after8 = readLiveDb(rel2.dataDir, (db) => ({
    guest_ig: db.prepare('SELECT guest_ig FROM users WHERE id = 1002').get().guest_ig,
    prof: db.prepare('SELECT ig_username FROM profiles WHERE user_id = 1002').get().ig_username,
    nPosts: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1002').get().n,
  }));
  t('C8 set-ig Veja→veja2: guest_ig y perfil siguen al @ nuevo, semana vieja borrada', c8.status === 200 && c8.j && c8.j.ok === true && c8.j.changed === true && after8.guest_ig === 'veja2' && after8.prof === 'veja2' && after8.nPosts === 0, c8.status + ' ' + JSON.stringify(c8.j) + ' ' + JSON.stringify(after8));
  await killBoot(rel2);
  t('C8b puerto 34983 libre tras matar el segundo boot por PID', portFree(34983));

  // --- D. base-v927 en puerto 34982: el bug se reproduce ---
  const bs = await boot(BASE, 34982, 'base');
  console.log('D. Boot base-v927 (puerto 34982, PID ' + bs.child.pid + ')');
  seedBoot(bs.dataDir);
  const d1 = await req(34982, '/api/guest/start', { method: 'POST', headers: { Cookie: cookieFor('sess-veja') }, body: { device: dv } });
  t('D1 [BUG REPRODUCIDO] base-v927: no-identidad con sesión de Veja RETOMA a Olive & June (resumed:true user 1001)', d1.status === 200 && d1.j.resumed === true && d1.j.user_id === 1001, d1.status + ' ' + JSON.stringify(d1.j));
  const d2 = await req(34982, '/api/version');
  t('D2 base-v927 /api/version v927', d2.status === 200 && d2.j.build === '20261105-v927', d2.status + ' ' + JSON.stringify(d2.j));
  await killBoot(bs);
  t('D3 puerto 34982 libre tras matar el boot por PID', portFree(34982));

  console.log('\n' + pass + ' ok, ' + fail + ' FAIL' + (failed.length ? ' — ' + failed.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
