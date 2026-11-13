// test-lote-correctivo-2-aprobar.js — LOTE CORRECTIVO-2 · APROBAR-FUNCIONA (v984 provisorio sobre base v980)
// PROBLEMA (diagnóstico Veja 4.ª corrida Q5, verificado en vivo 12/11 20:29):
// el dueño NO puede aprobar su primer posteo de prueba por ningún camino
// de la app. Cadena: «Dale ✓» del chat = pzTemaAprobarHoy → PATCH
// /api/posts/:id {action:'like'} (modo piloto) o POST /approve (manual)
// → guestBackstop devuelve 402 guest_account_required a TODO is_guest=1
// → el wrapper api abre la hoja de cuenta y LANZA → el catch del chat
// muestra el error FALSO «no se pudo 😕 probá de nuevo». Segunda pared:
// aun registrado, PATCH sobre needs_review=1 da 403 in_review y POST
// /approve no limpia la marca → el posteo queda retenido e invisible.
// FIX: (1) pzTemaAprobarHoy suma la rama de invitado de su superficie
// hermana (pzHoyAprobarUno): si es invitado, abre la creación de cuenta
// con reintento automático al completarla; respaldo en el catch para la
// pared 402 (nunca «no se pudo» por la pared de cuenta). (2) Aprobar un
// posteo de prueba PROPIO (esPosteoDePruebaDelDueno: source='trial',
// prefijo legacy /media/trial-, o nacido del flujo invitado en su fase
// de prueba) levanta needs_review de ESE posteo: en el PATCH, la acción
// 'like' no la frena in_review y la limpia; en POST /approve se limpia
// antes del retorno idempotente (los importados ya figuran 'approved').
// NO toca: guestBackstop (sigue 402 para invitados en todo el flujo),
// posteos que no son de prueba (in_review y approve sin cambios), la
// cola de revisión admin, visibilidad/programación (lote correctivo-1).
//
// Secciones: A anclas estáticas (base-v980 vs release) · B boot EN VIVO
// de release/ (e2e del flujo completo) · C boot de base-v980 (control:
// el bug original — 403 in_review y la marca que no se limpia).
// La «cuenta creada» de la sección B se simula con el UPDATE exacto de
// guestTrial.upgradeGuest (email + is_guest=0 sobre la misma fila): el
// endpoint real /api/guest/upgrade exige RESEND_API_KEY (envío del
// magic link), fuera del alcance de un sandbox sin red de correo.
// Uso: node test-lote-correctivo-2-aprobar.js  (desde el scratch)
// Sale 0 si todo pasa, 1 si algo falla.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base-v980');
const REL = path.join(ROOT, 'release');
const SECRET = 'test-correctivo2-secret';
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

// ---------- A. Anclas estáticas ----------
console.log('A. Anclas estáticas (base-v980 vs release)');
const srvBase = read(path.join(BASE, 'server.js'));
const srvRel = read(path.join(REL, 'server.js'));
const appBase = read(path.join(BASE, 'public', 'app.js'));
const appRel = read(path.join(REL, 'public', 'app.js'));
const idxBase = read(path.join(BASE, 'public', 'index.html'));
const idxRel = read(path.join(REL, 'public', 'index.html'));

t('A1 estampado: BUILD v984 + app.js?v=678 en release; v980/674 en base',
  countOcc(srvRel, "const BUILD_ID = '20261105-v984';") === 1 && countOcc(srvBase, "const BUILD_ID = '20261105-v980';") === 1 &&
  countOcc(idxRel, '/app.js?v=678') === 1 && countOcc(idxBase, '/app.js?v=674') === 1);
t('A2 helper esPosteoDePruebaDelDueno: 3 menciones en release (def + PATCH + approve), 0 en base',
  countOcc(srvRel, 'esPosteoDePruebaDelDueno') === 3 && countOcc(srvBase, 'esPosteoDePruebaDelDueno') === 0,
  'rel=' + countOcc(srvRel, 'esPosteoDePruebaDelDueno'));
t('A3 gate in_review del PATCH: condicionado a !aprobarPrueba en release (el incondicional baja 3→2 en el archivo: solo cambió el del PATCH)',
  countOcc(srvRel, "const aprobarPrueba = action === 'like' && esPosteoDePruebaDelDueno(post);") === 1 &&
  countOcc(srvRel, 'if (post.needs_review && !aprobarPrueba) return res.status(403)') === 1 &&
  countOcc(srvBase, 'if (post.needs_review && !aprobarPrueba) return res.status(403)') === 0 &&
  countOcc(srvRel, 'if (post.needs_review) return res.status(403)') === countOcc(srvBase, 'if (post.needs_review) return res.status(403)') - 1,
  'base=' + countOcc(srvBase, 'if (post.needs_review) return res.status(403)') + ' rel=' + countOcc(srvRel, 'if (post.needs_review) return res.status(403)'));
(function () {
  const slRel = srvRel.slice(srvRel.indexOf("app.post('/api/posts/:id/approve'"), srvRel.indexOf("app.get('/api/posts/:id/approve'"));
  const slBase = srvBase.slice(srvBase.indexOf("app.post('/api/posts/:id/approve'"), srvBase.indexOf("app.get('/api/posts/:id/approve'"));
  t('A4 POST /approve: limpia needs_review ANTES del retorno idempotente (release); base no limpia',
    countOcc(slRel, 'UPDATE posts SET needs_review = 0') === 1 &&
    slRel.indexOf('UPDATE posts SET needs_review = 0') < slRel.indexOf('return res.json({ ok: true, approval: post.approval }); // idempotente') &&
    countOcc(slBase, 'UPDATE posts SET needs_review = 0') === 0);
  t('A4b el UPDATE de limpieza puntual (SET needs_review = 0 WHERE id): base ×1 (la cola admin) → release ×3 (+2 del lote: PATCH like + approve)',
    countOcc(srvRel, 'UPDATE posts SET needs_review = 0 WHERE id = ?') === countOcc(srvBase, 'UPDATE posts SET needs_review = 0 WHERE id = ?') + 2,
    'base=' + countOcc(srvBase, 'UPDATE posts SET needs_review = 0 WHERE id = ?') + ' rel=' + countOcc(srvRel, 'UPDATE posts SET needs_review = 0 WHERE id = ?'));
})();
(function () {
  const fn = (s) => { const i = s.indexOf('async function pzTemaAprobarHoy()'); return s.slice(i, s.indexOf('\nasync function ', i + 10)); };
  const fRel = fn(appRel), fBase = fn(appBase);
  t('A5 chat: la rama de invitado va ANTES del chequeo de modo y registra el reintento (×2: rama + respaldo del catch)',
    countOcc(fRel, 'pzGuestAccountSheet(() => { try { pzTemaAprobarHoy();') === 2 &&
    fRel.indexOf('pzIsGuest()') >= 0 && fRel.indexOf('pzIsGuest()') < fRel.indexOf('f3ApprovalMode()') &&
    countOcc(fRel, 'e.guest_account_required') === 1 &&
    countOcc(fBase, 'pzGuestAccountSheet') === 0 && countOcc(fBase, 'pzIsGuest') === 0);
  t('A5b funciones llamadas por el flujo existen definidas (gate M78): pzIsGuest ×1, pzGuestAccountSheet ×1, pzTemaAprobarHoy = base + 2 menciones',
    countOcc(appRel, 'function pzIsGuest(') === 1 && countOcc(appRel, 'function pzGuestAccountSheet(') === 1 &&
    countOcc(appRel, 'pzTemaAprobarHoy()') === countOcc(appBase, 'pzTemaAprobarHoy()') + 2,
    'rel=' + countOcc(appRel, 'pzTemaAprobarHoy()') + ' base=' + countOcc(appBase, 'pzTemaAprobarHoy()'));
})();
t('A6 censos ajenos intactos: unico=1 ×5 app.js · monedaCuentaAds ×4 · PLAN_UNICO ×11 · contentLangOf 4 líneas (server)',
  countOcc(appRel, 'unico=1') === 5 && countOcc(appBase, 'unico=1') === 5 &&
  countOcc(srvRel, 'monedaCuentaAds') === 4 && countOcc(srvRel, 'PLAN_UNICO') === 11 &&
  srvRel.split('\n').filter((l) => l.includes('contentLangOf')).length === 4);
t('A7 guestBackstop NO se debilita: definición ×1 y aperturas de PATCH/approve intactas (= base)',
  countOcc(srvRel, 'function guestBackstop') === 1 &&
  countOcc(srvRel, 'if (guestBackstop(req, res)) return;') === countOcc(srvBase, 'if (guestBackstop(req, res)) return;'));

// ---------- Boot ----------
function portFree(port) {
  try { execSync('ss -ltn | grep -q ":' + port + ' "'); return false; } catch (e) { return true; }
}
async function boot(dir, port, tag, build) {
  if (!portFree(port)) throw new Error('puerto ' + port + ' ocupado antes del boot ' + tag);
  const base = '/tmp/boot-corr2-' + tag;
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
  for (let i = 0; i < 150 && !up; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/version');
      if (r.ok) { const j = await r.json(); up = j.build === '20261105-' + build; }
    } catch (e) { /* todavía no levanta */ }
  }
  if (!up) throw new Error('boot ' + tag + ' no levantó en puerto ' + port + ' (ver ' + logPath + ')');
  return { child, dataDir, logPath, port };
}
async function killBoot(b) {
  try { process.kill(b.child.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let alive = true;
  try { process.kill(b.child.pid, 0); } catch (e) { alive = false; }
  if (alive) { try { process.kill(b.child.pid, 'SIGKILL'); } catch (e) {} await sleep(500); }
}
function signSid(sid) {
  const cs = require('/home/hatch/workspace/posta/node_modules/cookie-signature');
  return 's:' + cs.sign(sid, SECRET);
}
function cookieFor(sid) { return 'connect.sid=' + encodeURIComponent(signSid(sid)); }
async function req(port, method, p, body, cookie) {
  const h = { 'Content-Type': 'application/json' };
  if (cookie) h.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try { j = await r.json(); } catch ( e) {}
  return { status: r.status, j };
}
const iso = (ms) => new Date(ms).toISOString();
function seedBoot(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
  const now = Date.now();
  // 2001: invitado del flujo guest (Veja). 2002: cuenta registrada activa.
  // 2003: tercero registrado (para el intento ajeno).
  db.prepare("INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at, plan_status) VALUES (2001, 'guest-veja2@guest.invalid', '', 1, 'veja', 'veja.com', ?, 'trial')").run(now + 2 * 86400000);
  db.prepare("INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at, plan_status) VALUES (2002, 'duena@normal.example', 'x', 0, '', '', ?, 'active')").run(now + 2 * 86400000);
  db.prepare("INSERT INTO users (id, email, password_hash, is_guest, guest_ig, guest_domain, trial_ends_at, plan_status) VALUES (2003, 'tercero@normal.example', 'x', 0, '', '', ?, 'active')").run(now + 2 * 86400000);
  const ins = (u, img, src, sched, approval, nr) => db.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, scheduled_at, approval, needs_review, source) VALUES (?, ?, 'caption de prueba', '', 'scheduled', 'image', ?, ?, ?, ?)").run(u, img, sched, approval, nr, src).lastInsertRowid;
  const ids = {
    // PG: el posteo de ensure del invitado (source='', sin prefijo trial):
    // su único marcador de prueba es el origen invitado de la cuenta.
    PG: ins(2001, '/media/ensure-veja.jpg', '', iso(now - 3600000), 'pending', 1),
    // PI: importado de la prueba ya 'approved' que el lint marcó después.
    PI: ins(2001, '/media/trial-veja-1.jpg', 'trial', iso(now + 86400000), 'approved', 1),
    // P2: importado de la prueba pendiente.
    P2: ins(2001, '/media/trial-veja-2.jpg', 'trial', iso(now + 86400000), 'pending', 1),
    // PR: posteo normal de la cuenta registrada (no es de prueba).
    PR: ins(2002, '/media/reg-normal.jpg', '', iso(now + 2 * 86400000), 'pending', 1),
    // PT2: importado de la prueba en una cuenta registrada (rama login).
    PT2: ins(2002, '/media/trial-reg-1.jpg', 'trial', iso(now + 3 * 86400000), 'pending', 1),
  };
  const sess = (uid) => JSON.stringify({ cookie: { originalMaxAge: 31536000000, expires: new Date(now + 31536000000).toISOString(), httpOnly: true, path: '/' }, userId: uid });
  db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run('sess-corr2-guest', sess(2001), now + 86400000);
  db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run('sess-corr2-reg', sess(2002), now + 86400000);
  db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run('sess-corr2-third', sess(2003), now + 86400000);
  db.close();
  return ids;
}
function openDb(dataDir) { return new DatabaseSync(path.join(dataDir, 'posta.db')); }
function postRow(dataDir, id) {
  const db = openDb(dataDir);
  const r = db.prepare('SELECT id, approval, needs_review, owner_liked FROM posts WHERE id = ?').get(id);
  db.close();
  return r;
}
// La query de vencidos EXACTA del scheduler (scheduler.js, processDuePosts).
function dueIds(dataDir) {
  const db = openDb(dataDir);
  const rows = db.prepare(`SELECT p.*, u.id AS uid FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.status = 'scheduled' AND p.scheduled_at <= ?
    AND COALESCE(p.needs_review, 0) = 0
    ORDER BY (CASE WHEN p.media_type = 'story' THEN 1 ELSE 0 END) ASC, p.scheduled_at ASC LIMIT 5`).all(new Date().toISOString());
  db.close();
  return rows.map((r) => r.id);
}
// La subida de cuenta real (guestTrial.upgradeGuest, rama no consumida)
// hace exactamente este UPDATE sobre la misma fila.
function simUpgrade(dataDir) {
  const db = openDb(dataDir);
  db.prepare("UPDATE users SET email = 'duena@veja.example', password_hash = '', is_guest = 0 WHERE id = 2001").run();
  db.close();
}

// ---------- B. Boot release: el flujo completo ----------
async function sectionB() {
  console.log('B. Boot release (v984) — aprobar funciona');
  const b = await boot(REL, 35021, 'rel', 'v984');
  try {
    const ids = seedBoot(b.dataDir);
    const G = cookieFor('sess-corr2-guest'), R = cookieFor('sess-corr2-reg'), T = cookieFor('sess-corr2-third');
    // (d) guestBackstop intacto: el invitado sigue frenado en 402 en
    // TODAS las rutas del flujo (el cliente ya ni las llama: va a la
    // cuenta; el respaldo del servidor no se debilitó).
    let r = await req(b.port, 'PATCH', '/api/posts/' + ids.PG, { action: 'like' }, G);
    t('B1 invitado PATCH like → 402 guest_account_required (la pared sigue)', r.status === 402 && r.j.guest_account_required === true, JSON.stringify(r));
    r = await req(b.port, 'POST', '/api/posts/' + ids.PG + '/approve', {}, G);
    t('B2 invitado POST /approve → 402 guest_account_required', r.status === 402 && r.j.guest_account_required === true, JSON.stringify(r));
    r = await req(b.port, 'PATCH', '/api/posts/' + ids.PG, { action: 'save-draft', caption: 'x' }, G);
    t('B3a invitado PATCH save-draft → 402', r.status === 402, 'status=' + r.status);
    r = await req(b.port, 'PATCH', '/api/posts/' + ids.PI, { scheduled_at: iso(Date.now() + 90000000) }, G);
    t('B3b invitado PATCH scheduled_at (rama draft del chat) → 402', r.status === 402, 'status=' + r.status);
    // (a) Cuenta creada (UPDATE exacto de upgradeGuest): la misma
    // sesión, ya registrada, reintenta la aprobación del chat.
    simUpgrade(b.dataDir);
    // (b) El posteo de ensure (sin source='trial': origen invitado):
    // PATCH like ya NO muere en in_review y levanta la marca.
    r = await req(b.port, 'PATCH', '/api/posts/' + ids.PG, { action: 'like' }, G);
    let row = postRow(b.dataDir, ids.PG);
    t('B4 dueña (ex-invitada) PATCH like a su posteo de prueba nr=1 → 200, owner_liked=1, marca levantada',
      r.status === 200 && r.j.ok === true && r.j.owner_liked === 1 && row.needs_review === 0, JSON.stringify(r) + ' row=' + JSON.stringify(row));
    // (b) Publicable: la query de vencidos del scheduler ya lo incluye.
    t('B5 la query de vencidos del scheduler incluye el posteo aprobado (vencido, sin marca)',
      dueIds(b.dataDir).includes(Number(ids.PG)), 'due=' + JSON.stringify(dueIds(b.dataDir)));
    // (b) Importado ya 'approved' + nr=1: POST /approve levanta la marca
    // aunque el approve sea idempotente en el estado.
    r = await req(b.port, 'POST', '/api/posts/' + ids.PI + '/approve', {}, G);
    row = postRow(b.dataDir, ids.PI);
    t('B6 POST /approve al importado ya approved con nr=1 → 200 y marca levantada',
      r.status === 200 && r.j.approval === 'approved' && row.needs_review === 0, JSON.stringify(r) + ' row=' + JSON.stringify(row));
    // (b) Importado pendiente: POST /approve aprueba Y levanta la marca.
    r = await req(b.port, 'POST', '/api/posts/' + ids.P2 + '/approve', {}, G);
    row = postRow(b.dataDir, ids.P2);
    t('B7 POST /approve al importado pendiente con nr=1 → 200, approved, sin marca',
      r.status === 200 && r.j.approval === 'approved' && row.approval === 'approved' && row.needs_review === 0, JSON.stringify(r) + ' row=' + JSON.stringify(row));
    // (c) Posteo que NO es de prueba (cuenta registrada): todo igual.
    r = await req(b.port, 'PATCH', '/api/posts/' + ids.PR, { action: 'like' }, R);
    row = postRow(b.dataDir, ids.PR);
    t('B8 PATCH like a posteo NO de prueba con nr=1 → 403 in_review (sin cambios)',
      r.status === 403 && r.j.error === 'in_review' && row.needs_review === 1, JSON.stringify(r));
    r = await req(b.port, 'POST', '/api/posts/' + ids.PR + '/approve', {}, R);
    row = postRow(b.dataDir, ids.PR);
    t('B9 POST /approve a posteo NO de prueba → aprueba pero NO limpia la marca (cola admin sigue mandando)',
      r.status === 200 && row.approval === 'approved' && row.needs_review === 1, JSON.stringify(r) + ' row=' + JSON.stringify(row));
    r = await req(b.port, 'PATCH', '/api/posts/' + ids.PR, { action: 'save-draft', caption: 'nuevo' }, R);
    t('B10 PATCH save-draft a posteo NO de prueba con nr=1 → 403 in_review (otras acciones siguen gateadas)',
      r.status === 403 && r.j.error === 'in_review', JSON.stringify(r));
    // La rama source='trial' también vale en cuenta registrada (import
    // por login): PATCH like levanta la marca de su importado.
    r = await req(b.port, 'PATCH', '/api/posts/' + ids.PT2, { action: 'like' }, R);
    row = postRow(b.dataDir, ids.PT2);
    t('B11 PATCH like a importado source=trial en cuenta registrada con nr=1 → 200 y marca levantada',
      r.status === 200 && r.j.owner_liked === 1 && row.needs_review === 0, JSON.stringify(r) + ' row=' + JSON.stringify(row));
    // (c) Un tercero no aprueba posteos ajenos ni les toca la marca.
    r = await req(b.port, 'POST', '/api/posts/' + ids.PR + '/approve', {}, T);
    row = postRow(b.dataDir, ids.PR);
    t('B12 tercero POST /approve a posteo ajeno → 403 forbidden, fila intacta',
      r.status === 403 && r.j.error === 'forbidden' && row.needs_review === 1 && !row.owner_liked, JSON.stringify(r));
  } finally {
    await killBoot(b);
    fs.rmSync('/tmp/boot-corr2-rel', { recursive: true, force: true });
  }
}

// ---------- C. Boot base v980: el control (el bug original) ----------
async function sectionC() {
  console.log('C. Boot base-v980 (control) — el bug original sigue presente ahí');
  const b = await boot(BASE, 35022, 'base', 'v980');
  try {
    const ids = seedBoot(b.dataDir);
    const G = cookieFor('sess-corr2-guest');
    let r = await req(b.port, 'PATCH', '/api/posts/' + ids.PG, { action: 'like' }, G);
    t('C1 base: invitado PATCH like → 402 (misma pared)', r.status === 402 && r.j.guest_account_required === true, JSON.stringify(r));
    simUpgrade(b.dataDir);
    r = await req(b.port, 'PATCH', '/api/posts/' + ids.PG, { action: 'like' }, G);
    const rowPG = postRow(b.dataDir, ids.PG);
    t('C2 base: dueña PATCH like a su posteo de prueba nr=1 → 403 in_review (EL BUG)',
      r.status === 403 && r.j.error === 'in_review' && rowPG.needs_review === 1, JSON.stringify(r));
    r = await req(b.port, 'POST', '/api/posts/' + ids.PI + '/approve', {}, G);
    const rowPI = postRow(b.dataDir, ids.PI);
    t('C3 base: POST /approve al importado → 200 pero la marca NO se limpia (segunda pared)',
      r.status === 200 && rowPI.needs_review === 1, JSON.stringify(r) + ' row=' + JSON.stringify(rowPI));
    t('C4 base: la query de vencidos NO incluye el posteo retenido',
      !dueIds(b.dataDir).includes(Number(ids.PG)), 'due=' + JSON.stringify(dueIds(b.dataDir)));
  } finally {
    await killBoot(b);
    fs.rmSync('/tmp/boot-corr2-base', { recursive: true, force: true });
  }
}

(async () => {
  try { await sectionB(); } catch (e) { t('B boot release completo', false, e.message); }
  try { await sectionC(); } catch (e) { t('C boot base completo', false, e.message); }
  console.log('\nTOTAL: ' + pass + ' ok · ' + fail + ' fail' + (failed.length ? ' → ' + failed.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})();
