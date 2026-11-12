'use strict';
// test-lote-prueba-cuenta-al-entregar.js — v921 PRUEBA-CUENTA-AL-ENTREGAR
// (LOTE PRUEBA-CUENTA-AL-ENTREGAR · v921) La prueba solo cuenta como usada
// cuando el primer posteo se entrega y se ve: la generación ya NO registra
// el uso permanente; la entrega (guest/start, set-ig, alta, login,
// magic-link) sí. La conexión de IG va DESPUÉS (ya es así: prompt tras
// crear la cuenta, gate solo al publicar).
// Secciones: 0. Estáticas · 1. Unitarias (trial-lock/guest-trial, :memory:)
// 2. Boots en vivo (release vs base-v900) con DB sembrada.
// Corre desde la raíz del scratch: node test-lote-prueba-cuenta-al-entregar.js
// (las suites de boot leen ./server.js relativo al cwd del boot, no a este).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const REL = path.join(ROOT, 'release');
const BASE = path.join(ROOT, 'base-v900');
const BASE915 = path.join(ROOT, 'base-v915'); // (re-pineo preparador v921: base vigente)
const read = (p) => fs.readFileSync(p, 'utf8');
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const failed = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failed.push(name); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// ---------- 0. Estáticas ----------
console.log('0. Estáticas (release/ vs base-v900)');
(function () {
  const srvRel = read(path.join(REL, 'server.js'));
  const srvBase = read(path.join(BASE, 'server.js'));
  const tlRel = read(path.join(REL, 'trial-lock.js'));
  const gtRel = read(path.join(REL, 'guest-trial.js'));
  const gtBase = read(path.join(BASE, 'guest-trial.js'));

  // 0a. trialLockRecordFor ya NO registra uso (solo candado de 90 días).
  const recFor = srvRel.slice(srvRel.indexOf('function trialLockRecordFor'), srvRel.indexOf('function trialCacheWriteWeb'));
  t('0a trialLockRecordFor: recordLock sí, recordUsed NO', recFor.includes('recordLock') && !recFor.includes('recordUsed'));
  t('0a2 trialLockRecordFor base SÍ registraba uso (control)', srvBase.slice(srvBase.indexOf('function trialLockRecordFor'), srvBase.indexOf('function trialCacheWriteWeb')).includes('recordUsed'));

  // 0b-d. Wrapper de entrega + 7 llamadores.
  const calls = (srvRel.match(/trialLockRecordDeliveredFor\(/g) || []).length;
  t('0b wrapper trialLockRecordDeliveredFor existe (def + 7 sitios = 8)', calls === 8, 'halladas=' + calls);
  t('0c entrega en guest/start', srvRel.includes('trialLockRecordDeliveredFor(igK, domK, g.userId)'));
  t('0d entrega en set-ig', srvRel.includes('trialLockRecordDeliveredFor(v.ig,'));
  t('0e entrega en alta/login/magic', srvRel.includes("trialLockRecordDeliveredFor(trial_ig, '', newUserId)") && srvRel.includes("trialLockRecordDeliveredFor(trial_ig, '', uidL)") && srvRel.includes("trialLockRecordDeliveredFor(payload.trial_ig, '', userId)") && srvRel.includes("trialLockRecordDeliveredFor(payload.trial_ig, '', user.id)"));

  // 0f. Backfill retirado (sin llamadas; solo comentarios en guest-trial).
  t('0f sin backfillUsedFromLocks(db) en server.js', !srvRel.includes('backfillUsedFromLocks(db)'));
  t('0g sin backfillUsedFromLocks(db) en guest-trial.js', !gtRel.includes('backfillUsedFromLocks(db)'));
  t('0h backfill NO exportado por guest-trial', !gtRel.includes('backfillUsedFromLocks,'));
  t('0i base SÍ tenía el backfill (control)', gtBase.includes('backfillUsedFromLocks'));

  // 0j. trial-lock: recordDelivered existe y se exporta.
  t('0j recordDelivered en trial-lock.js + export', tlRel.includes('function recordDelivered') && tlRel.includes('recordDelivered,'));

  // 0k. Estampado.
  t('0k BUILD v921 x1, v900 x0 en server.js', (srvRel.match(/20261105-v921/g) || []).length === 1 && !srvRel.includes('20261105-v900'));

  // 0l. Gates intactos: generate sigue con findUsed; entradas con findConsumedUsed.
  t('0l trialLockGate sigue con findUsed (candado permanente vivo)', srvRel.includes('trialLock.findUsed(db, igK, domK)'));
  t('0m guest/start sigue con findConsumedUsed + nPosts', srvRel.includes('findConsumedUsed(db, igK, domK)') && srvRel.includes("SELECT COUNT(*) AS n FROM posts WHERE user_id = ?"));

  // 0n. guest-set-ig.js sin tocar (los candados espejo no cambian).
  // (RE-PINEO preparador v921: en base-v900 era byte-idéntico, pero v912
  // cambió resolveSetIg — quitó el 409 device_used — y esa es la versión
  // vigente en base-v915. El lote v921 no toca este archivo: se compara
  // contra base-v915.)
  t('0n guest-set-ig.js byte-idéntico a base-v915', md5(path.join(REL, 'guest-set-ig.js')) === md5(path.join(BASE915, 'guest-set-ig.js')));

  // 0o. Conexión DESPUÉS, no antes (veredicto, verificación estática):
  // - /prueba no pide conexión (sin 'ig-connect' ni 'Conect' en prueba.html).
  // - El prompt de conectar IG existe solo tras crear la cuenta (una vez,
  //   con 'Después', sin insistir) y el gate vive en las acciones de publicar.
  const prueba = read(path.join(REL, 'public', 'prueba.html'));
  const appjs = read(path.join(REL, 'public', 'app.js'));
  t('0o prueba.html no pide conexión (sin ig-connect/Conect)', !/ig-connect|Conect/i.test(prueba));
  t('0p prompt IG tras crear la cuenta, una vez, con Después', appjs.includes('function pzGuestMaybeIgPrompt') && appjs.includes('tras crear la cuenta') && appjs.includes("'Después'") && appjs.includes("pz_ig_prompt_done"));
  t('0q gate IG solo al publicar (Aceptar/Activar/Impulsar)', appjs.includes('Conectá tu Instagram primero') && appjs.includes('function igGateFeedback'));
})();

// ---------- 1. Unitarias ----------
console.log('1. Unitarias (trial-lock / guest-trial, :memory:)');
(function () {
  const tl = require(path.join(REL, 'trial-lock.js'));
  const gt = require(path.join(REL, 'guest-trial.js'));
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, is_guest INTEGER DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '', guest_device TEXT DEFAULT '', trial_ends_at INTEGER, trial_extended_until INTEGER, created_at TEXT, password_hash TEXT, referral_code TEXT DEFAULT '', trust_level INTEGER DEFAULT 0, lang TEXT DEFAULT 'es', plan_status TEXT, autopilot_enabled INTEGER, training_wheels INTEGER);
  CREATE TABLE trial_locks (id INTEGER PRIMARY KEY AUTOINCREMENT, ig TEXT, domain TEXT, business TEXT, lang TEXT, payload TEXT, generated_at INTEGER, created_at INTEGER);
  CREATE TABLE trial_used (kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (kind, value));`);
  gt.ensureSchema(db);

  // 1a. recordDelivered escribe ig+dominio con user_id; los dos candados lo ven.
  tl.recordDelivered(db, { ig: 'crumbl', domain: 'crumblcookies.com', userId: 42 });
  t('1a recordDelivered: findUsed ve ig y dominio', !!tl.findUsed(db, 'crumbl', '') && !!tl.findUsed(db, '', 'crumblcookies.com'));
  t('1b recordDelivered: findConsumedUsed ve (user_id presente)', !!tl.findConsumedUsed(db, 'crumbl', 'crumblcookies.com'));
  const row = db.prepare("SELECT user_id FROM trial_used WHERE kind='ig' AND value='crumbl'").get();
  t('1c recordDelivered guarda el user_id que recibió la semana', row && Number(row.user_id) === 42, 'user_id=' + (row && row.user_id));

  // 1d. Idempotente: segunda entrega no duplica ni pisa el user_id.
  tl.recordDelivered(db, { ig: 'crumbl', domain: 'crumblcookies.com', userId: 99 });
  const n = db.prepare("SELECT COUNT(*) AS n FROM trial_used WHERE value='crumbl'").get().n;
  const row2 = db.prepare("SELECT user_id FROM trial_used WHERE kind='ig' AND value='crumbl'").get();
  t('1d recordDelivered idempotente (1 fila, user_id intacto)', n === 1 && Number(row2.user_id) === 42, 'n=' + n + ' user_id=' + row2.user_id);

  // 1e. Sin identidad no registra nada.
  tl.recordDelivered(db, { ig: '', domain: '', userId: 7 });
  t('1e recordDelivered sin identidad no registra', db.prepare('SELECT COUNT(*) AS n FROM trial_used').get().n === 2);

  // 1f. Allowlist nunca queda "usada".
  tl.recordDelivered(db, { ig: 'posty.communitymanager', domain: '', userId: 1 });
  t('1f allowlist no se registra como uso', !tl.findUsed(db, 'posty.communitymanager', ''));

  // 1g. Fila vieja con user_id NULL: findUsed la ve (migración), findConsumedUsed NO.
  db.prepare("INSERT INTO trial_used (kind, value, user_id, created_at) VALUES ('ig', 'viejo', NULL, ?)").run(Date.now());
  t('1g fila vieja NULL: findUsed sí, findConsumedUsed NO (migración)', !!tl.findUsed(db, 'viejo', '') && !tl.findConsumedUsed(db, 'viejo', ''));
  t('1h findUsed por email sigue (alta con email)', (() => { tl.recordUsed(db, { email: 'a@b.com', userId: 5 }); return !!tl.findUsed(db, '', '', 'a@b.com'); })());

  // 1i. Candado de 90 días intacto: recordLock/findLock/purgeLock.
  tl.recordLock(db, { ig: 'snap', domain: 'snap.com', business: 'Snap', lang: 'es', payloadStr: JSON.stringify({ posts: [] }) });
  t('1i recordLock/findLock vigente (<90d)', !!tl.findLock(db, 'snap', ''));
  t('1j findLock ignora candado vencido (>90d)', !tl.findLock(db, 'snap', '', Date.now() + 91 * 86400000));
  t('1k purgeLock borra el candado', tl.purgeLock(db, 'snap', '') === 1 && !tl.findLock(db, 'snap', ''));

  // 1l. backfill retirado del módulo.
  t('1l guest-trial NO exporta backfillUsedFromLocks', typeof gt.backfillUsedFromLocks === 'undefined');
  // 1m. Primitivas vecinas intactas.
  gt.recordDevice(db, 'dvc_1', '1.1.1.1', 77);
  t('1m deviceUsed/recordDevice intactos', !!gt.deviceUsed(db, 'dvc_1', '') && gt.deviceUsed(db, 'dvc_no', '9.9.9.9') === null);
  const g = gt.createGuest(db, { referralCode: '', lang: 'es', ig: 'inv', domain: 'inv.com', device: 'dvc_1' });
  t('1n findGuestByIdentity encuentra al invitado', !!gt.findGuestByIdentity(db, 'inv', ''));
  db.close();
})();

// ---------- 2. Boots en vivo ----------
console.log('2. Boots en vivo (release vs base-v900)');
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function weekPayload(business) {
  return JSON.stringify({ business, category: 'pastelería', lang: 'es', engine: 25,
    posts: [1, 2, 3].map((i) => ({ type: 'image', image: PNG1, caption: 'Posteo ' + i + ' de ' + business, hashtags: '#prueba' })) });
}
function seedCommon(db, withNullRows) {
  db.exec(`CREATE TABLE IF NOT EXISTS trial_devices (device TEXT NOT NULL, ip TEXT NOT NULL, user_id INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (device));
  CREATE TABLE IF NOT EXISTS trial_used (kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (kind, value));
  CREATE TABLE IF NOT EXISTS trial_cache (ig TEXT PRIMARY KEY, payload TEXT, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS trial_locks (id INTEGER PRIMARY KEY AUTOINCREMENT, ig TEXT, domain TEXT, business TEXT, lang TEXT, payload TEXT, generated_at INTEGER, created_at INTEGER);`);
  const now = Date.now();
  // Semana cacheada para @crumbltest y @setigtest (generación simulada).
  db.prepare('INSERT OR IGNORE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('crumbltest', weekPayload('Crumbl Test'), now);
  db.prepare('INSERT OR IGNORE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('setigtest', weekPayload('Setig Test'), now);
  // Candado de 90 días con snapshot para @snaptest (generación sin entrega).
  db.prepare('INSERT OR IGNORE INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('snaptest', 'snaptest.com', 'Snap Test', 'es', weekPayload('Snap Test'), now, now);
  // Fila vieja con user_id NULL (generación pre-v921): bloquea generar, no la entrada.
  db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig', 'oldtest', NULL, ?)").run(now);
  if (withNullRows) {
    // Simula lo que la generación de BASE escribía: uso con user_id NULL.
    db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig', 'snaptest', NULL, ?)").run(now);
    db.prepare("INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig', 'crumbltest', NULL, ?)").run(now);
  }
}
function usedRow(db, ig) {
  try { return db.prepare("SELECT kind, value, user_id FROM trial_used WHERE kind='ig' AND value=?").get(ig) || null; }
  catch (e) { return null; }
}
async function boot(dir, port, tag) {
  const base = '/tmp/boot-v921-' + tag;
  const dataDir = base + '/data';
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const logPath = base + '/boot.log';
  const logFd = fs.openSync(logPath, 'w');
  const env = Object.assign({}, process.env, { PORT: String(port), DATA_DIR: dataDir, OPENAI_API_KEY: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' });
  const child = spawn('node', ['server.js'], { cwd: dir, env, stdio: ['ignore', logFd, logFd] });
  let up = false, build = '';
  for (let i = 0; i < 160 && !up; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/version');
      if (r.ok) { const j = await r.json(); build = j.build || ''; up = build === '20261105-' + (tag === 'rel' ? 'v921' : 'v900'); }
    } catch (e) { /* todavía no levanta */ }
  }
  if (!up) throw new Error('boot ' + tag + ' no levantó en puerto ' + port + ' (ver ' + logPath + ', build=' + build + ')');
  return { child, dataDir, logPath, port };
}
function portFree(port) {
  try { execSync('ss -ltn | grep -q ":' + port + ' "'); return false; } catch (e) { return true; }
}
async function killBoot(b) {
  try { process.kill(b.child.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  try { process.kill(b.child.pid, 0); process.kill(b.child.pid, 'SIGKILL'); } catch (e) {}
}
async function post(port, p, body, cookie) {
  const h = { 'Content-Type': 'application/json' };
  if (cookie) h.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p, { method: 'POST', headers: h, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  const setCookie = (typeof r.headers.getSetCookie === 'function') ? r.headers.getSetCookie() : [];
  return { status: r.status, j, cookie: setCookie.map((c) => c.split(';')[0]).join('; ') };
}
function postGenerate(port, fields) {
  const boundary = '----v921test' + Date.now();
  let body = '';
  for (const [k, v] of Object.entries(fields)) body += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
  body += '--' + boundary + '--\r\n';
  return fetch('http://127.0.0.1:' + port + '/api/trial/generate', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary }, body })
    .then(async (r) => ({ status: r.status, j: await r.json().catch(() => ({})) }));
}

(async () => {
  // --- C. release/ en puerto 34997 ---
  if (!portFree(34997)) throw new Error('puerto 34997 ocupado (otro agente en vuelo)');
  const rel = await boot(REL, 34997, 'rel');
  {
    const db = new DatabaseSync(path.join(rel.dataDir, 'posta.db'));
    seedCommon(db, false);
    db.close();
  }
  await sleep(500);
  let ok = 0;
  for (let i = 0; i < 5; i++) {
    const r = await fetch('http://127.0.0.1:34997/api/version');
    const j = await r.json();
    if (j.build === '20261105-v921') ok++;
  }
  t('C0 /api/version v921 5/5 en boot release', ok === 5);
  // C1. Generación sin entrega NO es uso: el gate sirve el snapshot, no 409.
  const c1 = await postGenerate(34997, { business: 'Snap Test', ig: 'snaptest', lang: 'es' });
  t('C1 generate @snaptest (lock sin entrega) → 200 snapshot, NO 409', c1.status === 200 && !!c1.j.trial_locked, 'status=' + c1.status + ' ' + JSON.stringify(c1.j).slice(0, 120));
  {
    const db = new DatabaseSync(path.join(rel.dataDir, 'posta.db'));
    t('C1b servir el snapshot NO marca uso (trial_used vacío para snaptest)', !usedRow(db, 'snaptest'));
    db.close();
  }
  // C2. Caso Crumbl: semana generada + entrada → 200 y uso marcado con user_id.
  const c2 = await post(34997, '/api/guest/start', { ig: 'crumbltest', domain: 'crumbltest.com', device: 'dvc_fresco_1', lang: 'es' });
  t('C2 guest/start @crumbltest (semana generada, nunca entregada) → 200', c2.status === 200 && c2.j.posts === 3, 'status=' + c2.status + ' ' + JSON.stringify(c2.j));
  let crumblUid = 0;
  {
    const db = new DatabaseSync(path.join(rel.dataDir, 'posta.db'));
    const row = usedRow(db, 'crumbltest');
    crumblUid = row ? Number(row.user_id) : 0;
    t('C2b entrega marca uso con user_id del invitado', !!row && !!row.user_id && Number(row.user_id) === Number(c2.j.user_id), 'row=' + JSON.stringify(row) + ' user_id=' + c2.j.user_id);
    db.close();
  }
  // C3. Reintento tras la entrega → 409 trial_used (el candado funciona).
  const c3 = await post(34997, '/api/guest/start', { ig: 'crumbltest', domain: 'crumbltest.com', device: 'dvc_fresco_2', lang: 'es' });
  t('C3 guest/start @crumbltest tras entrega → 409 trial_used', c3.status === 409 && c3.j.trial_used === true, 'status=' + c3.status);
  const c3b = await postGenerate(34997, { business: 'Crumbl Test', ig: 'crumbltest', lang: 'es' });
  t('C3b generate @crumbltest tras entrega → 409 trial_used', c3b.status === 409 && c3b.j.trial_used === true, 'status=' + c3b.status);
  // C4. set-ig: invitado sin identidad → importa → entrega marcada.
  // (Simula visitante fresco: se borran las filas trial_devices del boot,
  // porque la rama sin identidad reusa por dispositivo O IP y todo el boot
  // sale desde 127.0.0.1.)
  {
    const db = new DatabaseSync(path.join(rel.dataDir, 'posta.db'));
    db.prepare('DELETE FROM trial_devices').run();
    db.close();
  }
  const c4a = await post(34997, '/api/guest/start', { device: 'dvc_setig_1', lang: 'es' });
  t('C4a guest/start sin identidad → 200 needs_ig', c4a.status === 200 && c4a.j.needs_ig === true, 'status=' + c4a.status + ' ' + JSON.stringify(c4a.j));
  const c4b = await post(34997, '/api/guest/set-ig', { ig: 'setigtest', device: 'dvc_setig_1' }, c4a.cookie);
  t('C4b set-ig @setigtest → 200 con 3 posteos', c4b.status === 200 && c4b.j.posts === 3, 'status=' + c4b.status + ' ' + JSON.stringify(c4b.j));
  {
    const db = new DatabaseSync(path.join(rel.dataDir, 'posta.db'));
    const row = usedRow(db, 'setigtest');
    t('C4c entrega por set-ig marca uso con user_id', !!row && !!row.user_id, 'row=' + JSON.stringify(row));
    db.close();
  }
  // C5. Migración: fila vieja con user_id NULL sigue bloqueando generar.
  const c5 = await postGenerate(34997, { business: 'Old Test', ig: 'oldtest', lang: 'es' });
  t('C5 generate @oldtest (fila vieja NULL) → 409 trial_used (migración)', c5.status === 409 && c5.j.trial_used === true, 'status=' + c5.status);
  const logRel = read(rel.logPath);
  t('C6 boot release: sin errores fatales en boot.log', !/Error: |Uncaught Exception|UnhandledPromiseRejection/.test(logRel));
  await killBoot(rel);
  await sleep(1000);
  t('C7 boot release matado por PID exacto, puerto 34997 libre', portFree(34997));
  t('C8 sin data/ en release/ tras el boot', !fs.existsSync(path.join(REL, 'data')));

  // --- D. base-v900 en puerto 34998 (reproduce el bug) ---
  if (!portFree(34998)) throw new Error('puerto 34998 ocupado (otro agente en vuelo)');
  const base = await boot(BASE, 34998, 'base');
  {
    const db = new DatabaseSync(path.join(base.dataDir, 'posta.db'));
    seedCommon(db, true); // base: la generación escribía la fila NULL
    db.close();
  }
  await sleep(500);
  // D1. En BASE, generar sin entregar ya consumía: el gate da 409.
  const d1 = await postGenerate(34998, { business: 'Snap Test', ig: 'snaptest', lang: 'es' });
  t('D1 en BASE generate @snaptest (lock + fila NULL) → 409 trial_used (bug)', d1.status === 409 && d1.j.trial_used === true, 'status=' + d1.status);
  // D2. En BASE la entrada funciona pero NO marca la entrega con user_id.
  const d2 = await post(34998, '/api/guest/start', { ig: 'crumbltest', domain: 'crumbltest.com', device: 'dvc_fresco_1', lang: 'es' });
  t('D2 en BASE guest/start @crumbltest → 200 (la entrada no miraba la fila NULL)', d2.status === 200 && d2.j.posts === 3, 'status=' + d2.status + ' ' + JSON.stringify(d2.j));
  {
    const db = new DatabaseSync(path.join(base.dataDir, 'posta.db'));
    const row = usedRow(db, 'crumbltest');
    t('D2b en BASE la entrega NO deja user_id (fila sigue NULL)', !!row && !row.user_id, 'row=' + JSON.stringify(row));
    db.close();
  }
  // D3. Reintento en BASE también 409, pero por posteos (nPosts), no por entrega.
  const d3 = await post(34998, '/api/guest/start', { ig: 'crumbltest', domain: 'crumbltest.com', device: 'dvc_fresco_2', lang: 'es' });
  t('D3 en BASE reintento → 409 trial_used (por nPosts, igual que release)', d3.status === 409 && d3.j.trial_used === true, 'status=' + d3.status);
  // D4. set-ig en BASE importa pero no marca (mismo visitante fresco que C4).
  {
    const db = new DatabaseSync(path.join(base.dataDir, 'posta.db'));
    db.prepare('DELETE FROM trial_devices').run();
    db.close();
  }
  const d4a = await post(34998, '/api/guest/start', { device: 'dvc_setig_1', lang: 'es' });
  t('D4a en BASE guest/start sin identidad → 200 needs_ig', d4a.status === 200 && d4a.j.needs_ig === true, 'status=' + d4a.status + ' ' + JSON.stringify(d4a.j));
  const d4b = await post(34998, '/api/guest/set-ig', { ig: 'setigtest', device: 'dvc_setig_1' }, d4a.cookie);
  t('D4 en BASE set-ig @setigtest → 200 con 3 posteos', d4b.status === 200 && d4b.j.posts === 3, 'status=' + d4b.status + ' ' + JSON.stringify(d4b.j));
  {
    const db = new DatabaseSync(path.join(base.dataDir, 'posta.db'));
    const row = usedRow(db, 'setigtest');
    t('D4b en BASE set-ig NO marca uso (sin fila)', !row, 'row=' + JSON.stringify(row));
    db.close();
  }
  // D5. Migración en BASE: igual que release.
  const d5 = await postGenerate(34998, { business: 'Old Test', ig: 'oldtest', lang: 'es' });
  t('D5 en BASE generate @oldtest → 409 trial_used (igual que release)', d5.status === 409 && d5.j.trial_used === true, 'status=' + d5.status);
  await killBoot(base);
  await sleep(1000);
  t('D6 boot base matado por PID exacto, puerto 34998 libre', portFree(34998));

  console.log('\n=== v921: ' + pass + ' passed, ' + fail + ' failed ===');
  if (failed.length) { console.log('FALLIDOS: ' + failed.join(' | ')); process.exit(1); }
})().catch((e) => { console.error('SUITE ABORTÓ:', e); process.exit(2); });
