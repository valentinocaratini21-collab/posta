// test-lote-post-wow-email-y-conexion.js — v929 POST-WOW-EMAIL-Y-CONEXION
// VEREDICTOS de Valentino (11/11): (1) email SÍ, después del wow, opcional
// («¿a dónde te aviso cuando el posteo de mañana esté listo?»; el email es
// «tu posteo de mañana está listo», NUNCA «a punto de postear»); (2) la
// conexión como CTA principal después del wow («Conectá tu Instagram y este
// posteo sale hoy a las 19:00 en tu perfil», con «Lo hago después»).
// FIX: tarjeta de email post-wow en Inicio (solo invitados, tras el primer
// posteo) + POST /api/trial/notify-email + GET /api/guest/resume (retorno
// del email) + variante fuerte del popup de conexión con la fecha límite
// real + plantilla trialPostReadyEmail + barrido trial-post-ready.js (cron
// cada 15 min, ventana 9:00 en la zona de la cuenta, dedup durable).
// Uso: node test-lote-post-wow-email-y-conexion.js  (desde el scratch)
// Secciones: A anclas estáticas · B unidad (node:sqlite en memoria + stub
// de fetch para la plantilla) · C boot EN VIVO de release/ · D boot de
// base-v928 (los endpoints no existen).
// RE-PINEADA por el re-estampador v929: base-v915 -> base-v928, boot base v915 -> v928.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base-v928');
const REL = path.join(ROOT, 'release');
let pass = 0, fail = 0;
const failed = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; failed.push(name); console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function read(p) { return fs.readFileSync(p, 'utf-8'); }
function countOcc(s, sub) { return s.split(sub).length - 1; }
// Cuenta solo en líneas de código (ignora comentarios //): la frase
// «a punto de postear» aparece en comentarios que ENUNCIAN la regla, no en
// texto que se envía; el contenido real se verifica en B2b.
function countOccCode(s, sub) {
  return s.split('\n').filter((ln) => !ln.trim().startsWith('//')).join('\n').split(sub).length - 1;
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 12); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srvBase = read(path.join(BASE, 'server.js'));
const srvRel = read(path.join(REL, 'server.js'));
const appBase = read(path.join(BASE, 'public/app.js'));
const appRel = read(path.join(REL, 'public/app.js'));
const emlBase = read(path.join(BASE, 'email.js'));
const emlRel = read(path.join(REL, 'email.js'));
const dbRel = read(path.join(REL, 'db.js'));
const schRel = read(path.join(REL, 'scheduler.js'));
const cssRel = read(path.join(REL, 'public/styles.css'));
const idxEsRel = read(path.join(REL, 'public/index.html'));
const idxEnRel = read(path.join(REL, 'public/en/index.html'));

// ---------- A. Anclas estáticas: base vs release ----------
console.log('A. Anclas estáticas (base-v928 vs release/)');
t('A1 BUILD v929 x1 en release/server.js, v928 x0', countOcc(srvRel, "const BUILD_ID = '20261105-v929'") === 1 && countOcc(srvRel, '20261105-v928') === 0);
t('A2 POST /api/trial/notify-email x1 (ruta 0 en base; el módulo notify-email.js ya existía)', countOcc(srvRel, "app.post('/api/trial/notify-email', requireAuth") === 1 && countOcc(srvBase, "app.post('/api/trial/notify-email'") === 0);
t('A3 GET /api/guest/resume x1 (0 en base)', countOcc(srvRel, "app.get('/api/guest/resume'") === 1 && countOcc(srvBase, 'guest/resume') === 0);
t('A4 /api/profile devuelve trial_notify_email x1', countOcc(srvRel, 'trial_notify_email: trialNotifyEmail') === 1 && countOcc(srvBase, 'trial_notify_email') === 0);
t('A5 email.js: trialPostReadyEmail def x1 + export x1 (0 en base)', countOcc(emlRel, 'function trialPostReadyEmail(') === 1 && countOcc(emlRel, 'trialAbandonEmail, trialPostReadyEmail,') === 1 && countOcc(emlBase, 'trialPostReadyEmail') === 0);
t('A6 asunto ES «Tu posteo de mañana está listo» x1 + EN x1', countOcc(emlRel, "const subject = 'Tu posteo de mañana está listo'") === 1 && countOcc(emlRel, "const subject = 'Your post for tomorrow is ready'") === 1);
t('A7 NUNCA «a punto de postear» en el código de release (server/email/app/barrido; solo en comentarios que enuncian la regla)', countOccCode(srvRel, 'a punto de postear') === 0 && countOccCode(emlRel, 'a punto de postear') === 0 && countOccCode(appRel, 'a punto de postear') === 0 && countOccCode(read(path.join(REL, 'trial-post-ready.js')), 'a punto de postear') === 0);
t('A8 db.js: CREATE TABLE trial_post_ready_sent x1', countOcc(dbRel, 'CREATE TABLE IF NOT EXISTS trial_post_ready_sent') === 1);
t('A9 scheduler.js: require trial-post-ready x1 + llamada x1', countOcc(schRel, "require('./trial-post-ready')") === 1 && countOcc(schRel, 'sendTrialPostReadyEmails(db)') === 1);
t('A10 app.js: pzPostWowEmailHTML def x1 + llamada x1 tras el héroe', countOcc(appRel, 'function pzPostWowEmailHTML(o)') === 1 && countOcc(appRel, 'pzPostWowEmailHTML({ hoyPost: hoyPostR1, en: enHome })') === 1 && countOcc(appBase, 'pzPostWowEmailHTML') === 0);
t('A11 app.js: pzPostWowEmailBind def x1 + llamada x1 en pzHoyBind', countOcc(appRel, 'function pzPostWowEmailBind(root)') === 1 && countOcc(appRel, 'pzPostWowEmailBind(root)') === 2 && countOcc(appBase, 'pzPostWowEmailBind') === 0);
t('A12 app.js: pregunta del email x1 + «Avisame» x1 + «Ahora no» x1 en la tarjeta post-wow', countOcc(appRel, '¿A dónde te aviso cuando el posteo de mañana esté listo?') === 1 && countOcc(appRel, "'Avisame'") === 1 && countOcc(appRel, "data-pz-postwow-skip>${en ? 'Not now' : 'Ahora no'}") === 1);
t('A13 app.js: variante post-wow del popup x1 + «Este posteo sale » x1', countOcc(appRel, 'let wowSub = null, wowEn = false;') === 1 && countOcc(appRel, 'Este posteo sale ') === 1 && countOcc(appRel, "I'll do it later") === 1);
t('A14 app.js: «Lo hago después» sigue existiendo (skip sin fricción)', countOcc(appRel, 'Lo hago después') >= 1);
t('A15 styles.css: .pz-postwow-email x1', countOcc(cssRel, '.pz-postwow-email') === 1);
t('A16 index ES: app.js?v=640 x1 + styles?v=20261265 x1', countOcc(idxEsRel, 'app.js?v=640') === 1 && countOcc(idxEsRel, 'styles.css?v=20261265') === 1);
t('A17 index EN: styles?v=20261265 x1 + SIN app.js?v=', countOcc(idxEnRel, 'styles.css?v=20261265') === 1 && countOcc(idxEnRel, 'app.js?v=') === 0);
t('A18 vecinos idénticos: needs_review/pzBoostEsMP/pz-boost-3d3/CHUNK_V', countOcc(appBase, 'needs_review') === countOcc(appRel, 'needs_review') && countOcc(srvBase, 'needs_review') === countOcc(srvRel, 'needs_review') && countOcc(appBase, 'pzBoostEsMP') === countOcc(appRel, 'pzBoostEsMP') && countOcc(appBase, 'pz-boost-3d3') === countOcc(appRel, 'pz-boost-3d3') && countOcc(appBase, "'20261105-v890'") === countOcc(appRel, "'20261105-v890'"));
t('A19 proactive.js byte-idéntico (md5 9014a72ada77, vive en la raíz del repo)', md5(path.join(BASE, 'proactive.js')) === '9014a72ada77' && md5(path.join(REL, 'proactive.js')) === '9014a72ada77');
t('A20 M78: funciones nuevas definidas Y llamadas (4/4)', countOcc(appRel, 'function pzPostWowEmailHTML') === 1 && countOcc(appRel, 'pzPostWowEmailHTML({ hoyPost') === 1 && countOcc(appRel, 'function pzPostWowEmailBind') === 1 && countOcc(appRel, 'pzPostWowEmailBind(root)') === 2 && countOcc(emlRel, 'function trialPostReadyEmail(') === 1 && countOcc(read(path.join(REL, 'trial-post-ready.js')), 'trialPostReadyEmail') === 1 && countOcc(read(path.join(REL, 'trial-post-ready.js')), 'function sendTrialPostReadyEmails') === 1 && countOcc(schRel, 'sendTrialPostReadyEmails(db)') === 1);
// A21 diff exacto del árbol (solo lote + estampado)
(function () {
  function walk(dir, out, prefix) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'data' || e.name === 'node_modules') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, out, prefix + e.name + '/');
      else out[prefix + e.name] = md5(p);
    }
  }
  const b = {}, r = {};
  walk(BASE, b, ''); walk(REL, r, '');
  const diff = [], added = [];
  for (const k of Object.keys(r)) { if (!(k in b)) added.push(k); else if (b[k] !== r[k]) diff.push(k); }
  const removed = Object.keys(b).filter((k) => !(k in r));
  const expDiff = ['db.js', 'email.js', 'public/app.js', 'public/en/index.html', 'public/index.html', 'public/styles.css', 'scheduler.js', 'server.js'].sort();
  t('A21 diff exacto: 8 archivos tocados + suite y trial-post-ready.js nuevos, 0 borrados', JSON.stringify(diff.sort()) === JSON.stringify(expDiff) && JSON.stringify(added.sort()) === JSON.stringify(['test-lote-post-wow-email-y-conexion.js', 'trial-post-ready.js']) && removed.length === 0, 'diff=' + diff.join(',') + ' added=' + added.join(',') + ' removed=' + removed.join(','));
  t('A22 sin data/ ni node_modules en release/', !fs.existsSync(path.join(REL, 'data')) && !fs.existsSync(path.join(REL, 'node_modules')));
})();

// ---------- B. Unidad ----------
console.log('B. Unidad (node:sqlite en memoria, módulos de release/)');
(async () => {
  const tpr = require(path.join(REL, 'trial-post-ready.js'));
  t('B1 trial-post-ready.js exporta sendTrialPostReadyEmails', typeof tpr.sendTrialPostReadyEmails === 'function');

  // B2 plantilla real con fetch stubbeado (Resend no se toca).
  const emailMod = require(path.join(REL, 'email.js'));
  const realFetch = global.fetch;
  const realKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = 're_test_stub';
  const captured = [];
  global.fetch = async (url, opts) => {
    captured.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ id: 're_stub123' }), text: async () => '' };
  };
  const rEs = await emailMod.trialPostReadyEmail({ email: 'crumbl@example.com' }, 'https://postycommunitymanager.com', 'Crumbl Cookies', 'https://postycommunitymanager.com/api/guest/resume?ig=crumbl', 'es');
  const rEn = await emailMod.trialPostReadyEmail({ email: 'byredo@example.com' }, 'https://postycommunitymanager.com', 'Byredo', 'https://postycommunitymanager.com/api/guest/resume?ig=officialbyredo', 'en');
  global.fetch = realFetch;
  if (realKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = realKey;
  t('B2a plantilla ES: ok + asunto exacto + CTA + link de retorno', rEs && rEs.ok === true && captured[0].subject === 'Tu posteo de mañana está listo' && captured[0].html.includes('Ver mi posteo') && captured[0].html.includes('/api/guest/resume?ig=crumbl') && captured[0].to[0] === 'crumbl@example.com');
  t('B2b plantilla ES: nunca «a punto de postear»', !captured[0].html.includes('a punto de postear') && !captured[0].subject.includes('a punto de postear'));
  t('B2c plantilla EN: asunto + CTA en inglés', rEn && rEn.ok === true && captured[1].subject === 'Your post for tomorrow is ready' && captured[1].html.includes('See my post') && captured[1].html.includes('/api/guest/resume?ig=officialbyredo'));

  // B3 barrido: escenarios con DB en memoria.
  const TZ = 'America/Argentina/Buenos_Aires';
  const CREATED = Date.parse('2026-11-10T10:00:00Z'); // día 1: 10/11 07:00 BA
  const P1 = '2026-11-10T22:00:00Z'; // día 1, 19:00 BA
  const P2 = '2026-11-11T22:00:00Z'; // día 2, 19:00 BA
  const P3 = '2026-11-12T22:00:00Z'; // día 3, 19:00 BA
  function freshDb(opts) {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, is_guest INTEGER DEFAULT 0, trial_ends_at INTEGER DEFAULT 0);
      CREATE TABLE settings (user_id INTEGER PRIMARY KEY, timezone TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, scheduled_at TEXT, status TEXT);
      CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, email TEXT, payload TEXT, created_at INTEGER);
      CREATE TABLE trial_post_ready_sent (ig TEXT NOT NULL, post_id INTEGER NOT NULL, sent_at INTEGER NOT NULL, PRIMARY KEY (ig, post_id));`);
    const o = Object.assign({ guest: 1, ends: Date.now() + 2 * 86400000, email: 'crumbl@example.com', lang: 'es' }, opts || {});
    db.prepare('INSERT INTO users (id, is_guest, trial_ends_at) VALUES (1001, ?, ?)').run(o.guest, o.ends);
    db.prepare('INSERT INTO settings (user_id, timezone) VALUES (1001, ?)').run(TZ);
    db.prepare('INSERT INTO posts (id, user_id, scheduled_at, status) VALUES (1, 1001, ?, ?), (2, 1001, ?, ?), (3, 1001, ?, ?), (4, 1001, ?, ?)').run(P1, 'scheduled', P2, 'scheduled', P3, 'scheduled', '2026-11-13T22:00:00Z', 'draft');
    db.prepare('INSERT INTO trial_cache (ig, email, payload, created_at) VALUES (?, ?, ?, ?)').run('crumbl', o.email, JSON.stringify({ business: 'Crumbl Cookies', lang: o.lang }), CREATED);
    return db;
  }
  const findGuest = () => ({ id: 1001 });
  function stubber() {
    const calls = [];
    return { calls, fn: async (lead, base, biz, link, lang) => { calls.push({ lead, base, biz, link, lang }); return { ok: true }; } };
  }
  // B3a día 2 a las 9:30 BA: solo el posteo 2; dedup en la segunda pasada.
  let db = freshDb();
  let st = stubber();
  let out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:30:00Z') });
  t('B3a día 2 9:30 BA: envía 1 (solo posteo 2, no día 1 ni día 3 ni draft)', out.sent === 1 && st.calls.length === 1 && st.calls[0].link.includes('/api/guest/resume?ig=crumbl') && st.calls[0].biz === 'Crumbl Cookies', JSON.stringify(out));
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:45:00Z') });
  t('B3b segunda pasada: 0 (dedup durable por posteo)', out.sent === 0 && st.calls.length === 1);
  t('B3c fila trial_post_ready_sent = 1 (ig crumbl, post 2)', db.prepare('SELECT COUNT(*) AS n FROM trial_post_ready_sent').get().n === 1 && db.prepare('SELECT post_id AS p FROM trial_post_ready_sent').get().p === 2);
  db.close();
  // B3d antes de las 9:00 no se envía nada.
  db = freshDb(); st = stubber();
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T11:00:00Z') });
  t('B3d 8:00 BA: 0 envíos (ventana desde las 9:00)', out.sent === 0 && st.calls.length === 0, JSON.stringify(out));
  db.close();
  // B3e el día 1 nunca se avisa (es el del wow, ya visto).
  db = freshDb(); st = stubber();
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-10T12:30:00Z') });
  t('B3e día 1 9:30 BA: 0 envíos (nunca el posteo del wow)', out.sent === 0 && st.calls.length === 0, JSON.stringify(out));
  db.close();
  // B3f si el envío falla no se marca: el próximo barrido reintenta.
  db = freshDb(); st = stubber();
  const failFn = async () => ({ ok: false, error: 'HTTP 500' });
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: failFn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:30:00Z') });
  const markedAfterFail = db.prepare('SELECT COUNT(*) AS n FROM trial_post_ready_sent').get().n;
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:45:00Z') });
  t('B3f fallo no marca + reintento envía', markedAfterFail === 0 && out.sent === 1 && st.calls.length === 1);
  db.close();
  // B3g sin email / registrado / vencido: silencio.
  db = freshDb({ email: null }); st = stubber();
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:30:00Z') });
  t('B3g sin email en trial_cache: 0', out.sent === 0 && st.calls.length === 0);
  db.close();
  db = freshDb({ guest: 0 }); st = stubber();
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:30:00Z') });
  t('B3h cuenta registrada (is_guest=0): 0', out.sent === 0 && st.calls.length === 0);
  db.close();
  db = freshDb({ ends: Date.parse('2026-11-10T00:00:00Z') }); st = stubber();
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:30:00Z') });
  t('B3i trial vencido: 0', out.sent === 0 && st.calls.length === 0);
  db.close();
  // B3j idioma EN del payload.
  db = freshDb({ lang: 'en' }); st = stubber();
  out = await tpr.sendTrialPostReadyEmails(db, { sendEmail: st.fn, findGuestByIdentity: findGuest, now: Date.parse('2026-11-11T12:30:00Z') });
  t('B3j payload lang=en: el envío sale en EN', out.sent === 1 && st.calls[0].lang === 'en');
  db.close();
  return true;
})().then(() => main());

// ---------- C/D. Boots en vivo (release vs base) ----------
async function boot(dir, port, tag, extraEnv) {
  const base = '/tmp/boot-v929-' + tag;
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
      if (r.ok) { const j = await r.json(); up = j.build === '20261105-' + (tag === 'rel' ? 'v929' : 'v928'); }
    } catch (e) { /* todavía no levanta */ }
  }
  if (!up) throw new Error('boot ' + tag + ' no levantó en puerto ' + port + ' (ver ' + logPath + ')');
  return { child, dataDir, logPath, port };
}
function seedBoot(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
  const now = Date.now();
  const CREATED = Date.parse('2026-11-10T10:00:00Z');
  // Invitado crumbl (id 1001): sin email todavía; 3 posteos scheduled.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1001, ?, ?, 1, ?, ?, ?)').run('guest-crumbl@guest.invalid', '', 'crumbl', 'crumblcookies.com', now + 2 * 86400000);
  // Invitado byredo (id 1002): con email, payload EN.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1002, ?, ?, 1, ?, ?, ?)').run('guest-byredo@guest.invalid', '', 'officialbyredo', 'byredo.com', now + 2 * 86400000);
  // Registrado philz (id 1003, misma fila que era invitada: upgradeGuest no
  // borra guest_ig): el resume NUNCA lo retoma.
  db.prepare('INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at) VALUES (1003, ?, ?, 0, ?, ?, ?)').run('owner@philzcoffee.com', 'x', 'philz', 'philzcoffee.com', now + 2 * 86400000);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('crumbl', '{"business":"Crumbl Cookies","lang":"es"}', CREATED);
  db.prepare('INSERT INTO trial_cache (ig, email, payload, created_at) VALUES (?, ?, ?, ?)').run('officialbyredo', 'byredo@example.com', '{"business":"Byredo","lang":"en"}', CREATED);
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('philz', '{"business":"Philz Coffee","lang":"es"}', CREATED);
  db.prepare("INSERT INTO posts (user_id, image_path, status, scheduled_at) VALUES (1001, '/x.jpg', 'scheduled', '2026-11-10T22:00:00Z')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, scheduled_at) VALUES (1001, '/x.jpg', 'scheduled', '2026-11-11T22:00:00Z')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, scheduled_at) VALUES (1001, '/x.jpg', 'scheduled', '2026-11-12T22:00:00Z')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, scheduled_at) VALUES (1002, '/x.jpg', 'scheduled', '2026-11-11T22:00:00Z')").run();
  db.prepare("INSERT INTO posts (user_id, image_path, status, scheduled_at) VALUES (1003, '/x.jpg', 'scheduled', '2026-11-11T22:00:00Z')").run();
  db.close();
}
async function post(port, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p, { method: 'POST', headers, body: JSON.stringify(body) });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
}
async function get(port, p, opts) {
  const r = await fetch('http://127.0.0.1:' + port + p, opts || {});
  return r;
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
function cookieOf(res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  if (!arr || !arr[0]) return '';
  return arr[0].split(';')[0];
}

async function main() {
  console.log('C. Boot EN VIVO de release/ (puerto 34972)');
  const rel = await boot(REL, 34972, 'rel');
  seedBoot(rel.dataDir);
  try {
    let r = await get(34972, '/api/version');
    let j = await r.json();
    t('C1 /api/version = 20261105-v929', j.build === '20261105-v929');
    const p401 = await post(34972, '/api/trial/notify-email', { email: 'a@b.com' });
    t('C2 notify-email sin sesión → 401', p401.status === 401);
    const resBad = await get(34972, '/api/guest/resume?ig=desconocido', { redirect: 'manual' });
    t('C3 resume ig desconocido → 302 a /prueba?ig=desconocido', resBad.status === 302 && (resBad.headers.get('location') || '').includes('/prueba?ig=desconocido'));
    const resCrumbl = await get(34972, '/api/guest/resume?ig=crumbl', { redirect: 'manual' });
    const cookie = cookieOf(resCrumbl);
    t('C4 resume crumbl → 302 a /#/app/inicio + cookie de sesión', resCrumbl.status === 302 && (resCrumbl.headers.get('location') || '') === '/#/app/inicio' && !!cookie);
    const p400 = await post(34972, '/api/trial/notify-email', { email: 'mal' }, cookie);
    t('C5 notify-email email inválido → 400', p400.status === 400);
    const p200 = await post(34972, '/api/trial/notify-email', { email: 'crumbl@example.com' }, cookie);
    t('C6 notify-email válido → 200 {ok, saved}', p200.status === 200 && p200.j.ok === true && p200.j.saved === true);
    const saved = readLiveDb(rel.dataDir, (db) => db.prepare('SELECT email FROM trial_cache WHERE ig = ?').get('crumbl'));
    t('C7 trial_cache.email de crumbl guardado (sin crear cuenta)', saved && saved.email === 'crumbl@example.com');
    const prof = await get(34972, '/api/profile', { headers: { Cookie: cookie } });
    const pj = await prof.json();
    t('C8 /api/profile trae trial_notify_email', prof.status === 200 && pj.trial_notify_email === 'crumbl@example.com');
    const resPhilz = await get(34972, '/api/guest/resume?ig=philz', { redirect: 'manual' });
    t('C9 resume registrado (philz) → 302 a /prueba (nunca retoma cuenta)', resPhilz.status === 302 && (resPhilz.headers.get('location') || '').includes('/prueba?ig=philz'));
    const resByredo = await get(34972, '/api/guest/resume?ig=officialbyredo', { redirect: 'manual' });
    t('C10 resume byredo → 302 a /#/app/inicio', resByredo.status === 302 && (resByredo.headers.get('location') || '') === '/#/app/inicio');
    const idxEs = await (await get(34972, '/')).text();
    t('C11 index ES servido: app.js?v=640 + styles?v=20261265', idxEs.includes('app.js?v=640') && idxEs.includes('styles.css?v=20261265'));
    const idxEn = await (await get(34972, '/en/index.html')).text();
    t('C12 index EN servido: styles?v=20261265, sin app.js?v=', idxEn.includes('styles.css?v=20261265') && !idxEn.includes('app.js?v='));
    const appJs = await (await get(34972, '/app.js')).text();
    t('C13 app.js servido: tarjeta post-wow + variante del popup', appJs.includes('pzPostWowEmailHTML') && appJs.includes('¿A dónde te aviso cuando el posteo de mañana esté listo?') && appJs.includes('Este posteo sale ') && appJs.includes('Lo hago después'));
    const css = await (await get(34972, '/styles.css')).text();
    t('C14 styles.css servido: .pz-postwow-email', css.includes('.pz-postwow-email'));
  } finally {
    await killBoot(rel);
  }
  t('C15 puerto 34972 libre tras matar por PID exacto', portFree(34972));

  // C16 barrido real contra la DB del boot (server ya muerto, sin contención):
  // crumbl post 2 + byredo post, en inglés el de byredo; philz no (registrado).
  console.log('C16. Barrido trial-post-ready.js contra la DB del boot');
  const tpr = require(path.join(REL, 'trial-post-ready.js'));
  const dbLive = new DatabaseSync(path.join(rel.dataDir, 'posta.db'));
  const calls = [];
  const stub = async (lead, base, biz, link, lang) => { calls.push({ lead, biz, link, lang }); return { ok: true }; };
  const out1 = await tpr.sendTrialPostReadyEmails(dbLive, { sendEmail: stub, now: Date.parse('2026-11-11T12:30:00Z') });
  const rows = dbLive.prepare('SELECT ig, post_id FROM trial_post_ready_sent ORDER BY ig').all();
  t('C16a barrido día 2 9:30 BA: 2 envíos (crumbl post 2 + byredo)', out1.sent === 2 && calls.length === 2, JSON.stringify(out1));
  t('C16b dedup: 2 filas (crumbl, byredo) con post_id del día 2', rows.length === 2 && rows.every((x) => x.post_id === 2 || x.post_id === 4) && rows.map((x) => x.ig).sort().join(',') === 'crumbl,officialbyredo');
  t('C16c byredo sale en EN (lang=en), crumbl en ES por defecto (lang vacío)', calls.find((c) => c.lead.email === 'byredo@example.com').lang === 'en' && calls.find((c) => c.lead.email === 'crumbl@example.com').lang === '');
  const out2 = await tpr.sendTrialPostReadyEmails(dbLive, { sendEmail: stub, now: Date.parse('2026-11-11T12:45:00Z') });
  t('C16d segunda pasada: 0 (dedup)', out2.sent === 0 && calls.length === 2);
  dbLive.close();

  console.log('D. Boot de base-v928 (puerto 34973): los endpoints no existen');
  const base = await boot(BASE, 34973, 'base');
  try {
    const p404 = await post(34973, '/api/trial/notify-email', { email: 'a@b.com' });
    t('D1 base: POST /api/trial/notify-email → 404', p404.status === 404);
    const g404 = await get(34973, '/api/guest/resume?ig=crumbl', { redirect: 'manual' });
    t('D2 base: GET /api/guest/resume → 404', g404.status === 404);
    const v = await (await get(34973, '/api/version')).json();
    t('D3 base: /api/version = 20261105-v928', v.build === '20261105-v928');
  } finally {
    await killBoot(base);
  }
  t('D4 puerto 34973 libre tras matar por PID exacto', portFree(34973));

  console.log('\n=== RESULTADO v929: ' + pass + ' ok, ' + fail + ' FAIL ===');
  if (failed.length) console.log('FALLIDOS: ' + failed.join(' | '));
  process.exit(fail ? 1 : 0);
}
