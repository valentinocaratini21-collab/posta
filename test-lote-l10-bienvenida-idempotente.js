// test-lote-l10-bienvenida-idempotente.js — LOTE L10 BIENVENIDA-IDEMPOTENTE (v955 → RE-BASE v980 sobre v979)
// PROBLEMA (diagnóstico Veja Q5, verificado en vivo 12/11 12:04): el mensaje
// de bienvenida del chat aparece CUATRO veces (01:31, 02:29, 03:15, 13:55)
// más el viejo de las 19:42, pese al reset #7. Causas: welcomeGuestMessage
// es un INSERT plano sin dedup (una vez por cada guest/start exitoso) y
// trial-reset NUNCA borraba chat_messages.
// FIX: (1) welcomeGuestMessage idempotente por invitado (guarda por
// existencia antes del INSERT; ver guest-trial.js). (2) trial-reset borra
// también los chat_messages del invitado reseteado + sus chat_message_meta.
// NO toca: el texto de la bienvenida (v923), L11 (candado atómico), L8/L9,
// trial_lock, chat v917, Ads, app.js/styles/index.
//
// Secciones: A unidad (welcomeGuestMessage, DB real en memoria) ·
// B boot EN VIVO de release/ (trial-reset + guest/start e2e) ·
// C anclas estáticas (base-v979 vs release/) ·
// D boot de base-v979 (trial-reset SIN chat: el campo no existe).
// Uso: node test-lote-l10-bienvenida-idempotente.js  (desde el scratch)
// Sale 0 si todo pasa, 1 si algo falla.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base-v979');
const REL = path.join(ROOT, 'release');
const TOKEN = 'test-admin-l10';
const TRIAL_TEST_KEY = 'test-l10-suite';
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

// Marcador de bienvenida REAL (mismo criterio que el código): un mensaje de
// bienvenida de prueba ya existe para el invitado.
const WELCOME_REAL_SQL = `(text LIKE '%tu primer posteo está listo%' OR text LIKE '%your first post is ready%' OR text LIKE '%ya armé tus primeros 3 posteos%' OR text LIKE '%first 3 posts%')`;
const WELCOME_HOLD_SQL = `(text LIKE '%estoy terminando de armar tu semana%' OR text LIKE '%i''m finishing your week%')`;

// ---------- A. Unidad: welcomeGuestMessage con DB real en memoria ----------
console.log('A. Unidad (welcomeGuestMessage, node:sqlite en memoria)');
function freshChatDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, role TEXT NOT NULL DEFAULT 'user', text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE chat_message_meta (message_id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, reaction TEXT NOT NULL DEFAULT '', pinned INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0, edited_at TEXT, deleted_at TEXT);`);
  return db;
}
const gt = require(path.join(REL, 'guest-trial.js'));
function chatCount(db, uid) {
  return db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?').get(uid).n;
}
function welcomeCount(db, uid) {
  return db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND ${WELCOME_REAL_SQL}`).get(uid).n;
}
function holdCount(db, uid) {
  return db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND ${WELCOME_HOLD_SQL}`).get(uid).n;
}
(function unit() {
  // A1 — primera bienvenida ES n=3: se inserta, texto correcto (regla v923).
  const db = freshChatDb();
  const r1 = gt.welcomeGuestMessage(db, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  const txt1 = db.prepare('SELECT text FROM chat_messages WHERE user_id = 1').get().text;
  t('A1 primera ES n=3 → inserta (true), 1 fila, texto del veredicto',
    r1 === true && chatCount(db, 1) === 1 && txt1.includes('tu primer posteo está listo') && txt1.includes('los otros dos llegan uno por día') && !/3 posteos|primeros 3|ya están en tu feed|ya armé tus primeros/.test(txt1), txt1);
  // A2 — segundo guest/start idéntico: NO inserta (false), sigue 1 fila.
  const r2 = gt.welcomeGuestMessage(db, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  t('A2 segundo llamado idéntico → false, sigue 1 fila (el bug en vivo: 4 copias)', r2 === false && chatCount(db, 1) === 1, 'r2=' + r2 + ' n=' + chatCount(db, 1));
  // A3 — tercer llamado con otro conteo (n=1): tampoco inserta (real bloquea real).
  const r3 = gt.welcomeGuestMessage(db, 1, { lang: 'es', business: 'Veja', nPosts: 1 });
  t('A3 tercer llamado n=1 → false, sigue 1 fila', r3 === false && chatCount(db, 1) === 1, 'r3=' + r3);
  // A4 — otro idioma (EN n=3): tampoco inserta (el dedup es por invitado, no por idioma).
  const r4 = gt.welcomeGuestMessage(db, 1, { lang: 'en', business: 'Veja', nPosts: 3 });
  t('A4 llamado EN n=3 → false, sigue 1 fila', r4 === false && chatCount(db, 1) === 1, 'r4=' + r4);
  // A5 — texto legacy pre-v923 ya presente: bloquea la nueva bienvenida.
  const db5 = freshChatDb();
  db5.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1, ?, ?)').run('assistant', 'hola! soy posty 💙 ya armé tus primeros 3 posteos para VEJA con tu producto real — ya están en tu feed, miralos 👇');
  const r5 = gt.welcomeGuestMessage(db5, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  t('A5 legacy ES «ya armé tus primeros 3» presente → false, sigue 1 fila', r5 === false && chatCount(db5, 1) === 1, 'r5=' + r5);
  // A6 — texto legacy EN («first 3 posts») ya presente: bloquea.
  const db6 = freshChatDb();
  db6.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1, ?, ?)').run('assistant', "hi! i'm posty 💙 i just made your first 3 posts for VEJA — already in your feed 👇");
  const r6 = gt.welcomeGuestMessage(db6, 1, { lang: 'en', business: 'Veja', nPosts: 3 });
  t('A6 legacy EN «first 3 posts» presente → false, sigue 1 fila', r6 === false && chatCount(db6, 1) === 1, 'r6=' + r6);
  // A7 — placeholder (n=0) y después real (n=3): el real SÍ se inserta
  // (es el aviso prometido por el placeholder).
  const db7 = freshChatDb();
  const r7a = gt.welcomeGuestMessage(db7, 1, { lang: 'es', business: 'Veja', nPosts: 0 });
  const r7b = gt.welcomeGuestMessage(db7, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  t('A7 placeholder n=0 → real n=3: 2 filas (placeholder + real), real inserta',
    r7a === true && r7b === true && chatCount(db7, 1) === 2 && holdCount(db7, 1) === 1 && welcomeCount(db7, 1) === 1, `r7a=${r7a} r7b=${r7b} n=${chatCount(db7, 1)}`);
  // A8 — placeholder y después placeholder: 1 fila.
  const db8 = freshChatDb();
  gt.welcomeGuestMessage(db8, 1, { lang: 'es', business: 'Veja', nPosts: 0 });
  const r8 = gt.welcomeGuestMessage(db8, 1, { lang: 'es', business: 'Veja', nPosts: 0 });
  t('A8 placeholder → placeholder: 1 fila', r8 === false && chatCount(db8, 1) === 1, 'r8=' + r8);
  // A9 — real y después placeholder: 1 fila (real bloquea placeholder).
  const db9 = freshChatDb();
  gt.welcomeGuestMessage(db9, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  const r9 = gt.welcomeGuestMessage(db9, 1, { lang: 'es', business: 'Veja', nPosts: 0 });
  t('A9 real → placeholder: 1 fila', r9 === false && chatCount(db9, 1) === 1, 'r9=' + r9);
  // A10 — la pregunta por el @ («¿cuál es tu Instagram?») NO es bienvenida
  // y NO bloquea: la bienvenida se inserta igual.
  const db10 = freshChatDb();
  db10.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1, ?, ?)').run('assistant', 'hola! soy posty 💙\n¿cuál es tu Instagram? Así armo tu semana con lo que ya publicás 👇');
  const r10 = gt.welcomeGuestMessage(db10, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  t('A10 pregunta por el @ presente → bienvenida inserta (2 filas: pregunta + bienvenida)',
    r10 === true && chatCount(db10, 1) === 2 && welcomeCount(db10, 1) === 1, 'r10=' + r10 + ' n=' + chatCount(db10, 1));
  // A11 — la bienvenida de OTRO invitado no bloquea a este (dedup por invitado).
  const db11 = freshChatDb();
  gt.welcomeGuestMessage(db11, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  const r11 = gt.welcomeGuestMessage(db11, 2, { lang: 'es', business: 'Byredo', nPosts: 3 });
  t('A11 otro invitado con bienvenida → este inserta igual (1 fila cada uno)',
    r11 === true && chatCount(db11, 1) === 1 && chatCount(db11, 2) === 1, 'r11=' + r11);
  // A12 — otro mensaje de assistant (nudge) no bloquea la bienvenida.
  const db12 = freshChatDb();
  db12.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1, ?, ?)').run('assistant', 'tu feed te está esperando 💙 tus posteos ya están listos — vení a verlos 👇');
  const r12 = gt.welcomeGuestMessage(db12, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  t('A12 nudge presente → bienvenida inserta (2 filas)', r12 === true && chatCount(db12, 1) === 2 && welcomeCount(db12, 1) === 1, 'r12=' + r12);
  // A13 — compat con el stub de v923 (prepare sin .get): inserta como antes.
  const captured = [];
  const dbStub = { prepare: () => ({ run: (uid, text) => { captured.push(text); } }) };
  const r13 = gt.welcomeGuestMessage(dbStub, 1, { lang: 'es', business: 'Veja', nPosts: 3 });
  t('A13 stub v923 sin .get → inserta (true) y captura el texto (fallback sin dedup)',
    r13 === true && captured.length === 1 && captured[0].includes('tu primer posteo está listo'), 'r13=' + r13 + ' captured=' + captured.length);
  // A14 — contenido intacto (regla v923): n=2 y EN n=0.
  const db14 = freshChatDb();
  gt.welcomeGuestMessage(db14, 1, { lang: 'es', business: 'Veja', nPosts: 2 });
  const txt14 = db14.prepare('SELECT text FROM chat_messages WHERE user_id = 1').get().text;
  const db14b = freshChatDb();
  gt.welcomeGuestMessage(db14b, 1, { lang: 'en', business: 'Veja', nPosts: 0 });
  const txt14b = db14b.prepare('SELECT text FROM chat_messages WHERE user_id = 1').get().text;
  t('A14 contenido v923 intacto: ES n=2 «el otro llega mañana», EN n=0 «i\'ll let you know»',
    txt14.includes('el otro llega mañana') && !txt14.includes('los otros dos') && txt14b.includes("i'll let you know when your first post is ready"), txt14 + ' || ' + txt14b);
  db.close(); db5.close(); db6.close(); db7.close(); db8.close(); db9.close();
  db10.close(); db11.close(); db12.close(); db14.close(); db14b.close();
})();

// ---------- C. Anclas estáticas (base-v979 vs release/) ----------
console.log('C. Anclas estáticas (base-v979 vs release/)');
const srvBase = read(path.join(BASE, 'server.js'));
const srvRel = read(path.join(REL, 'server.js'));
const gtBase = read(path.join(BASE, 'guest-trial.js'));
const gtRel = read(path.join(REL, 'guest-trial.js'));
t('C1 BUILD v980 x1 en release/server.js, v979 x0', countOcc(srvRel, "const BUILD_ID = '20261105-v980'") === 1 && countOcc(srvRel, '20261105-v979') === 0);
t('C2 app.js / styles.css / index ES+EN byte-idénticos a base (lote no los toca)', md5(path.join(BASE, 'public/app.js')) === md5(path.join(REL, 'public/app.js')) && md5(path.join(BASE, 'public/styles.css')) === md5(path.join(REL, 'public/styles.css')) && md5(path.join(BASE, 'public/index.html')) === md5(path.join(REL, 'public/index.html')) && md5(path.join(BASE, 'public/en/index.html')) === md5(path.join(REL, 'public/en/index.html')));
t('C3 sin bump de ?v=: «app.js?v=665» x0 y «styles?v=20261274» x0 en release', countOcc(srvRel, 'app.js?v=665') === 0 && countOcc(read(path.join(REL, 'public/index.html')), 'app.js?v=665') === 0 && countOcc(srvRel, '20261274') === 0 && countOcc(read(path.join(REL, 'public/index.html')), '20261274') === 0);
t('C4 guest-trial.js: guarda L10 presente (REAL_MARKERS + HOLD_MARKERS + hasMarker); el INSERT sigue x2 igual que en base (bienvenida + chatInsert de nudges)', countOcc(gtRel, 'LOTE L10') >= 1 && countOcc(gtRel, 'REAL_MARKERS') >= 1 && countOcc(gtRel, 'HOLD_MARKERS') >= 1 && countOcc(gtRel, 'hasMarker') >= 1 && countOcc(gtRel, 'INSERT INTO chat_messages (user_id, role, text) VALUES (?, \'assistant\', ?)') === 2 && countOcc(gtRel, 'INSERT INTO chat_messages (user_id, role, text) VALUES (?, \'assistant\', ?)') === countOcc(gtBase, 'INSERT INTO chat_messages (user_id, role, text) VALUES (?, \'assistant\', ?)'));
t('C5 en BASE no hay guarda (welcomeGuestMessage es INSERT plano)', countOcc(gtBase, 'LOTE L10') === 0 && countOcc(gtBase, 'hasMarker') === 0);
t('C6 server.js: trial-reset cuenta chat (chat_messages: nChat) + borra chat y meta con WHERE user_id', countOcc(srvRel, 'chat_messages: nChat') === 1 && countOcc(srvRel, "DELETE FROM chat_messages WHERE user_id = ?") === 1 && countOcc(srvRel, "DELETE FROM chat_message_meta WHERE user_id = ?") === 1 && countOcc(srvRel, 'chat_messages: chatDeleted') === 1);
const baseResetHandler = (() => {
  const i = srvBase.indexOf("app.post('/api/admin/trial-reset'");
  const j = srvBase.indexOf('// Hold a nivel usuario', i);
  return srvBase.slice(i, j);
})();
t('C7 en BASE el handler trial-reset no menciona chat_messages', countOcc(baseResetHandler, 'chat_messages') === 0);
t('C8 sin borrados masivos: ningún DELETE sin WHERE sobre chat ni sobre el resto', !/DELETE FROM chat_messages\s*;/.test(srvRel) && !/DELETE FROM chat_message_meta\s*;/.test(srvRel) && !/DELETE FROM posts\s*;/.test(srvRel) && !/DELETE FROM trial_cache\s*;/.test(srvRel) && !/DELETE FROM trial_used\s*;/.test(srvRel) && !/DELETE FROM trial_locks\s*;/.test(srvRel));
t('C9 trial-reset intacto salvo chat: purgeUsed/purgeLock iguales a base, trial_devices no se toca (recordDevice igual)', countOcc(srvRel, 'trialLock.purgeUsed') === countOcc(srvBase, 'trialLock.purgeUsed') && countOcc(srvRel, 'trialLock.purgeLock') === countOcc(srvBase, 'trialLock.purgeLock') && countOcc(srvBase, 'recordDevice') === countOcc(srvRel, 'recordDevice'));
t('C10 guest/start intacto: welcomeGuestMessage se llama x1 con nPosts: nSched', countOcc(srvRel, 'welcomeGuestMessage(db, g.userId') === 1 && /welcomeGuestMessage\(db, g\.userId, \{[^}]*nPosts: nSched/.test(srvRel) && countOcc(srvBase, 'welcomeGuestMessage(db, g.userId') === 1);
t('C11 gate M78: welcomeGuestMessage sigue exportada en guest-trial.js', countOcc(gtRel, '  welcomeGuestMessage,') === 1);

// ---------- B/D. Boots en vivo (release/ vs base-v979) ----------
console.log('B/D. Boots en vivo (release/ vs base-v979)');
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
async function boot(dir, port, tag, build) {
  if (!portFree(port)) throw new Error('puerto ' + port + ' ocupado antes del boot ' + tag);
  const base = '/tmp/boot-v980-l10-' + tag;
  fs.rmSync(base, { recursive: true, force: true });
  const dataDir = base + '/data';
  fs.mkdirSync(dataDir, { recursive: true });
  const logPath = base + '/boot.log';
  const logFd = fs.openSync(logPath, 'w');
  const env = Object.assign({}, process.env, {
    PORT: String(port), DATA_DIR: dataDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: '', ADMIN_TOKEN: TOKEN, SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY,
  });
  const child = spawn('node', ['server.js'], { cwd: dir, env, stdio: ['ignore', logFd, logFd] });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/version');
      if (r.ok) { const j = await r.json(); up = j.build === '20261105-' + build; }
    } catch (e) { /* todavía no levanta */ }
  }
  if (!up) throw new Error('boot ' + tag + ' no levantó en puerto ' + port + ' (ver ' + logPath + ')');
  return { child, dataDir, logPath, port };
}
function seedBoot(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
  // trial_used NO existe tras el boot (se crea lazy con
  // ensureTrialUsedSchema cuando un endpoint la necesita): el seed la
  // crea con la misma función que usa producción (igual que el handler).
  require(path.join(REL, 'trial-lock.js')).ensureTrialUsedSchema(db);
  require(path.join(REL, 'guest-trial.js')).ensureSchema(db);
  const now = Date.now();
  // Invitado crumbl (id 1001, reloj VENCIDO ayer) + 3 posteos + chat 5 msgs + 2 meta.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1001, ?, ?, 1, ?, ?, ?)').run('guest-crumbl@guest.invalid', '', 'crumbl', 'crumblcookies.com', now - 86400000);
  // Vecino byredo (id 1002, reloj vigente) + 2 posteos + chat 2 msgs + 1 meta.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1002, ?, ?, 1, ?, ?, ?)').run('guest-byredo@guest.invalid', '', 'officialbyredo', 'byredo.com', now + 2 * 86400000);
  // Cuenta registrada del dueño de Crumbl (id 555, NO se toca).
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (555, ?, ?, 0, ?, ?, ?)').run('owner@crumblcookies.com', 'x', '', '', now + 2 * 86400000);
  // Negocio philz con invitado YA REGISTRADO (id 1003, is_guest=0) + 2 posteos + chat 3 msgs + 1 meta.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1003, ?, ?, 0, ?, ?, ?)').run('owner@philzcoffee.com', 'x', 'philz', 'philzcoffee.com', now + 2 * 86400000);
  for (let i = 0; i < 3; i++) db.prepare("INSERT INTO posts (user_id, image_path, status) VALUES (1001, '/x.jpg', 'scheduled')").run();
  for (let i = 0; i < 2; i++) db.prepare("INSERT INTO posts (user_id, image_path, status) VALUES (1002, '/x.jpg', 'scheduled')").run();
  for (let i = 0; i < 2; i++) db.prepare("INSERT INTO posts (user_id, image_path, status) VALUES (1003, '/x.jpg', 'scheduled')").run();
  // Chat de crumbl: 5 mensajes (2 copias de bienvenida + 1 viejo + 1 user + 1 nudge) + 2 meta.
  const cMsgs = [
    'hola! soy posty 💙 tu primer posteo está listo para Crumbl con tu producto real ✨ los otros dos llegan uno por día 👇',
    'hola! soy posty 💙 tu primer posteo está listo para Crumbl con tu producto real ✨ los otros dos llegan uno por día 👇',
    'hola! soy posty 💙 ya armé tus primeros 3 posteos para Crumbl — ya están en tu feed, miralos 👇',
    '¿cuándo sale mi posteo?',
    'tu feed te está esperando 💙 tus posteos ya están listos — vení a verlos 👇',
  ];
  const cRoles = ['assistant', 'assistant', 'assistant', 'user', 'assistant'];
  const cIds = cMsgs.map((m, i) => db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?, ?, ?)').run(1001, cRoles[i], m).lastInsertRowid);
  db.prepare('INSERT INTO chat_message_meta (message_id, user_id, reaction, pinned) VALUES (?, 1001, ?, 0)').run(cIds[0], '❤️');
  db.prepare('INSERT INTO chat_message_meta (message_id, user_id, reaction, pinned) VALUES (?, 1001, ?, 1)').run(cIds[1], '');
  // Chat de byredo: 2 mensajes + 1 meta.
  const bIds = [
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1002, ?, ?)').run('assistant', 'hola! soy posty 💙 tu primer posteo está listo para Byredo con tu producto real ✨ los otros dos llegan uno por día 👇').lastInsertRowid,
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1002, ?, ?)').run('user', 'gracias!').lastInsertRowid,
  ];
  db.prepare('INSERT INTO chat_message_meta (message_id, user_id, reaction, pinned) VALUES (?, 1002, ?, 0)').run(bIds[0], '👍');
  // Chat de philz (registrado): 3 mensajes + 1 meta.
  const pIds = [
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1003, ?, ?)').run('assistant', 'hola! soy posty 💙 tu primer posteo está listo para Philz con tu producto real ✨ los otros dos llegan uno por día 👇').lastInsertRowid,
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1003, ?, ?)').run('user', 'perfecto').lastInsertRowid,
    db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (1003, ?, ?)').run('assistant', 'dale, ya lo vi, te lo reviso').lastInsertRowid,
  ];
  db.prepare('INSERT INTO chat_message_meta (message_id, user_id, reaction, pinned) VALUES (?, 1003, ?, 0)').run(pIds[0], '❤️');
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
}
function jpegBuf(kb) {
  const b = Buffer.alloc(kb * 1024, 0);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b;
}
function payloadFor(ig, business, n) {
  const posts = [];
  for (let i = 0; i < n; i++) {
    posts.push({
      type: 'image',
      image: 'data:image/jpeg;base64,' + jpegBuf(12).toString('base64'),
      caption: `Posteo de prueba número ${i + 1} para el negocio ${business}: un café de especialidad tostado en casa que se sirve cada mañana con mucho cariño.`,
      hashtags: '#cafe #especialidad #suite',
      headline: ['Café de la mañana', 'Tostado en casa', 'El ritual del café'][i % 3],
      style: 'foto', style_name: 'foto', text_mode: 'text',
    });
  }
  return {
    ok: true, engine: 25, lang: 'es', business, ig, category: 'cafetería',
    posts,
    design: { posts: posts.map((p) => ({ headline: p.headline, style: 'foto', kind: 'foto' })) },
  };
}
function seedTrialCache(dataDir, ig, payload) {
  const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
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
async function post(port, p, body) {
  const r = await fetch('http://127.0.0.1:' + port + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}

(async () => {
  // --- B. release/ en puerto 34973 ---
  const rel = await boot(REL, 34973, 'rel', 'v980');
  seedBoot(rel.dataDir);
  await sleep(500);
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const r = await fetch('http://127.0.0.1:34973/api/version');
    const j = await r.json();
    if (j.build === '20261105-v980') ok++;
  }
  t('B0 /api/version v980 5/5 en boot release', ok === 5);
  const dryC = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: '@Crumbl', domain: 'https://crumblcookies.com/' });
  t('B1 dry-run @crumbl → used 2, locks 1, posts 3, cache 2, chat 5, total 13', dryC.status === 200 && dryC.j.dry_run === true && dryC.j.trial_used === 2 && dryC.j.trial_locks === 1 && dryC.j.posts === 3 && dryC.j.trial_cache === 2 && dryC.j.chat_messages === 5 && dryC.j.total === 13 && dryC.j.ig === 'crumbl' && dryC.j.domain === 'crumblcookies.com', JSON.stringify(dryC.j));
  const dryB = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'officialbyredo', domain: 'byredo.com' });
  t('B2 dry-run vecino @officialbyredo → used 2, locks 1, posts 2, cache 1, chat 2, total 8', dryB.status === 200 && dryB.j.trial_used === 2 && dryB.j.trial_locks === 1 && dryB.j.posts === 2 && dryB.j.trial_cache === 1 && dryB.j.chat_messages === 2 && dryB.j.total === 8, JSON.stringify(dryB.j));
  const dryP = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'philz', domain: 'philzcoffee.com' });
  t('B3 dry-run @philz REGISTRADO → used 2, locks 1, posts 0, cache 2, chat 0 (no se cuenta), total 5', dryP.status === 200 && dryP.j.trial_used === 2 && dryP.j.trial_locks === 1 && dryP.j.posts === 0 && dryP.j.trial_cache === 2 && dryP.j.chat_messages === 0 && dryP.j.guest_id === 1003 && dryP.j.guest_is_guest === false && dryP.j.total === 5, JSON.stringify(dryP.j));
  const noTok = await post(34973, '/api/admin/trial-reset', { ig: 'crumbl', confirm: true });
  t('B4 sin token admin → 403', noTok.status === 403, 'status=' + noTok.status);
  const badTok = await post(34973, '/api/admin/trial-reset?token=otro', { ig: 'crumbl', confirm: true });
  t('B5 token incorrecto → 403', badTok.status === 403, 'status=' + badTok.status);
  const noId = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { confirm: true });
  t('B6 sin ig ni dominio → 400', noId.status === 400, 'status=' + noId.status);
  const dryC2 = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com' });
  t('B7 dry-run NO borra nada (segundo dry-run: mismos conteos, total 13)', dryC2.status === 200 && dryC2.j.total === 13 && dryC2.j.chat_messages === 5, JSON.stringify(dryC2.j));
  const rst = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com', confirm: true });
  t('B8 confirm @crumbl → reset_hecho, borrados used 2, locks 1, posts 3, cache 2, chat 5', rst.status === 200 && rst.j.reset_hecho === true && rst.j.trial_used === 2 && rst.j.trial_locks === 1 && rst.j.posts === 3 && rst.j.trial_cache === 2 && rst.j.chat_messages === 5 && rst.j.trial_ends_refrescado === true, JSON.stringify(rst.j));
  const verify = readLiveDb(rel.dataDir, (db) => ({
    chatCrumbl: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = 1001').get().n,
    metaCrumbl: db.prepare('SELECT COUNT(*) AS n FROM chat_message_meta WHERE user_id = 1001').get().n,
    chatByredo: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = 1002').get().n,
    metaByredo: db.prepare('SELECT COUNT(*) AS n FROM chat_message_meta WHERE user_id = 1002').get().n,
    chatPhilz: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = 1003').get().n,
    metaPhilz: db.prepare('SELECT COUNT(*) AS n FROM chat_message_meta WHERE user_id = 1003').get().n,
    postsCrumbl: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1001').get().n,
    postsByredo: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1002').get().n,
    postsPhilz: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1003').get().n,
    endsCrumbl: db.prepare('SELECT trial_ends_at AS n FROM users WHERE id = 1001').get().n,
    emailRow: db.prepare("SELECT COUNT(*) AS n FROM trial_used WHERE kind = 'email' AND value = 'owner@crumblcookies.com'").get().n,
    deviceRow: db.prepare("SELECT COUNT(*) AS n FROM trial_devices WHERE device = 'dvc_crumbl'").get().n,
  }));
  t('B9 DB: chat crumbl 5→0 y meta 2→0, sin huérfanos', verify.chatCrumbl === 0 && verify.metaCrumbl === 0, JSON.stringify(verify));
  t('B10 DB: vecino byredo intacto (chat 2, meta 1, posts 2); philz intacto (chat 3, meta 1, posts 2)', verify.chatByredo === 2 && verify.metaByredo === 1 && verify.postsByredo === 2 && verify.chatPhilz === 3 && verify.metaPhilz === 1 && verify.postsPhilz === 2, JSON.stringify(verify));
  t('B11 DB: posts crumbl 3→0, reloj refrescado, email + device intactos', verify.postsCrumbl === 0 && verify.endsCrumbl > Date.now() && verify.endsCrumbl <= Date.now() + 3 * 86400000 + 60000 && verify.emailRow === 1 && verify.deviceRow === 1, JSON.stringify(verify));
  const dryC3 = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com' });
  t('B12 segundo reset @crumbl → sin_registro (200, total 0, chat 0)', dryC3.status === 200 && dryC3.j.sin_registro === true && dryC3.j.total === 0 && dryC3.j.chat_messages === 0, JSON.stringify(dryC3.j));
  const rstP = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'philz', domain: 'philzcoffee.com', confirm: true });
  t('B13 confirm @philz REGISTRADO → reset_hecho, posts 0, chat 0, reloj NO refrescado', rstP.status === 200 && rstP.j.reset_hecho === true && rstP.j.trial_used === 2 && rstP.j.trial_locks === 1 && rstP.j.posts === 0 && rstP.j.trial_cache === 2 && rstP.j.chat_messages === 0 && rstP.j.trial_ends_refrescado === false, JSON.stringify(rstP.j));
  const verifyP = readLiveDb(rel.dataDir, (db) => ({
    chatPhilz: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = 1003').get().n,
    metaPhilz: db.prepare('SELECT COUNT(*) AS n FROM chat_message_meta WHERE user_id = 1003').get().n,
    postsPhilz: db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 1003').get().n,
  }));
  t('B14 DB: chat de philz registrado intacto tras su reset (3 msgs + 1 meta)', verifyP.chatPhilz === 3 && verifyP.metaPhilz === 1 && verifyP.postsPhilz === 2, JSON.stringify(verifyP));
  // B15 — e2e guest/start: la secuencia en vivo (reset → re-entrada).
  // guest/start #1 siembra la bienvenida; el reset la borra; guest/start
  // #2 siembra UNA sola: en toda la DB queda exactamente 1 bienvenida.
  seedTrialCache(rel.dataDir, 'lote10', payloadFor('lote10', 'LoteDiez', 3));
  const gs1 = await post(34973, '/api/guest/start?test_key=' + TRIAL_TEST_KEY, { ig: 'lote10', domain: 'lote10.com', device: 'dvc-l10-a', lang: 'es' });
  const guestA = gs1.j.user_id || null;
  const w1 = guestA ? readLiveDb(rel.dataDir, (db) => ({
    chat: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?').get(guestA).n,
    wel: db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND ${WELCOME_REAL_SQL}`).get(guestA).n,
  })) : { chat: -1, wel: -1 };
  t('B15a guest/start #1 (test key) → 200, 1 mensaje: la bienvenida', gs1.status === 200 && gs1.j.ok === true && w1.chat === 1 && w1.wel === 1, `status=${gs1.status} ` + JSON.stringify(gs1.j) + ' chat=' + JSON.stringify(w1));
  const rstL = await post(34973, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'lote10', domain: 'lote10.com', confirm: true });
  const w1b = guestA ? readLiveDb(rel.dataDir, (db) => ({
    chat: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?').get(guestA).n,
  })) : { chat: -1 };
  t('B15b reset @lote10 → chat_messages 1 borrado; el chat del invitado queda en 0', rstL.status === 200 && rstL.j.chat_messages === 1 && w1b.chat === 0, JSON.stringify(rstL.j) + ' chat=' + JSON.stringify(w1b));
  seedTrialCache(rel.dataDir, 'lote10', payloadFor('lote10', 'LoteDiez', 3));
  const gs2 = await post(34973, '/api/guest/start?test_key=' + TRIAL_TEST_KEY, { ig: 'lote10', domain: 'lote10.com', device: 'dvc-l10-b', lang: 'es' });
  const guestB = gs2.j.user_id || null;
  const w2 = readLiveDb(rel.dataDir, (db) => ({
    welTotal: db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE role = 'assistant' AND ${WELCOME_REAL_SQL} AND user_id IN (SELECT id FROM users WHERE guest_ig = 'lote10')`).get().n,
    welB: guestB ? db.prepare(`SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND role = 'assistant' AND ${WELCOME_REAL_SQL}`).get(guestB).n : -1,
    chatA: guestA ? db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ?').get(guestA).n : -1,
  }));
  t('B15c guest/start #2 tras el reset → 200; en toda la DB queda EXACTAMENTE 1 bienvenida (la nueva)', gs2.status === 200 && gs2.j.ok === true && w2.welTotal === 1 && w2.welB === 1 && w2.chatA === 0, `status=${gs2.status} ` + JSON.stringify(w2));
  const logRel = read(rel.logPath);
  t('B16 boot release: sin errores fatales; el log trae [admin] trial-reset con chat=5', !/Error: |Uncaught Exception|UnhandledPromiseRejection/.test(logRel) && logRel.includes('[admin] trial-reset @crumbl (crumblcookies.com)') && logRel.includes('chat=5'), logRel.slice(-400));
  await killBoot(rel);
  await sleep(1000);
  t('B17 boot release matado por PID exacto, puerto 34973 libre', portFree(34973));
  t('B18 sin data/ en release/ tras el boot (trampa v907)', !fs.existsSync(path.join(REL, 'data')));

  // --- D. base-v979 en puerto 34974 (trial-reset SIN chat) ---
  const base = await boot(BASE, 34974, 'base', 'v979');
  seedBoot(base.dataDir);
  await sleep(500);
  const dryBase = await post(34974, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com' });
  t('D1 en BASE dry-run @crumbl → total 8 (sin chat) y SIN campo chat_messages', dryBase.status === 200 && dryBase.j.total === 8 && dryBase.j.chat_messages === undefined && dryBase.j.trial_used === 2 && dryBase.j.trial_locks === 1 && dryBase.j.posts === 3 && dryBase.j.trial_cache === 2, JSON.stringify(dryBase.j));
  const rstBase = await post(34974, '/api/admin/trial-reset?token=' + TOKEN, { ig: 'crumbl', domain: 'crumblcookies.com', confirm: true });
  const chatBase = readLiveDb(base.dataDir, (db) => ({
    chat: db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = 1001').get().n,
  }));
  t('D2 en BASE el confirm NO borra el chat (5 msgs siguen ahí: el bug)', rstBase.status === 200 && rstBase.j.reset_hecho === true && chatBase.chat === 5, JSON.stringify(rstBase.j) + ' chat=' + JSON.stringify(chatBase));
  await killBoot(base);
  await sleep(1000);
  t('D3 boot base matado por PID exacto, puerto 34974 libre', portFree(34974));

  console.log('\n=== L10: ' + pass + ' passed, ' + fail + ' failed ===');
  if (failed.length) { console.log('FALLIDOS: ' + failed.join(' | ')); process.exit(1); }
})().catch((e) => { console.error('SUITE ABORTÓ:', e); process.exit(2); });
