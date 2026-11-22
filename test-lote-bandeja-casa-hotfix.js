// test-lote-bandeja-casa-hotfix.js — Suite del HOTFIX BANDEJA-CASA
// (2026-11-22): la pantalla de notificaciones de la CASA (user 12)
// no carga en producción — «No pude cargar tus notificaciones.»
// (captura del dueño, 22/11 16:41 EST, sobre v1224 CAMPANA-CASA).
//
// CAUSA RAÍZ (diagnóstico con evidencia, ver CENSO.md del lote):
// la fila REAL del fundador en producción NO es plan 'free' — es
// plan 'trial' / plan_status 'trial' (leída hoy por
// /api/admin/client/12: su cuenta nació como trial el 2026-09-26 y
// nunca cambió de forma). plan-gate.js solo honra al fundador si la
// fila dice literalmente plan 'free' + plan_status 'active'; con la
// forma real, effectivePlanId cae a TRIAL_PLAN ('esencial') y el
// middleware planGateMiddleware('comentarios') responde 403 SIN
// ok:true → el cliente (pzBandejaCargar) no carga datos y la vista
// pinta su error. La suite de CAMPANA-CASA sembró la casa con
// 'free'/'active' — la forma supuesta — y por eso pasó 37/37
// mientras producción rompía. Esta suite siembra LA FORMA REAL.
//
//   A · plan-gate a nivel módulo con la forma real de producción.
//   B · El circuito: el poll con el filtro REAL del scheduler
//       (planGate 'atencion') procesa a la casa con su forma real.
//   C · Boot real: GET /api/bandeja y /count de la casa responden
//       200 con su tanda; el gate sigue cerrado para un trial que
//       NO es la casa; el cliente Total, intacto.
//   D · Boot real: la casa SIN filas — el endpoint responde 200
//       con tandas [] (el estado vacío honesto de la vista).
//   E · Chromium 390px: la pantalla de la casa CARGA (sin el texto
//       de error del dueño), con su tanda y su tarjeta Conserje.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); console.log('  ✗', name, extra || ''); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// LA FORMA REAL de la fila del fundador, leída de producción el
// 22/11/2026 por /api/admin/client/12 (plan/plan_status/fechas).
const CASA_PLAN = 'trial', CASA_STATUS = 'trial';
const CASA_TRIAL_ENDS = 1791299328075, CASA_TRIAL_EXT = 1801413964874;

function seedFormaReal(db, uid, email, ig) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('clave-prueba-1', 10);
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(uid, email, hash);
  db.prepare("UPDATE users SET plan = ?, plan_status = ?, trial_ends_at = ?, trial_extended_until = ? WHERE id = ?")
    .run(CASA_PLAN, CASA_STATUS, CASA_TRIAL_ENDS, CASA_TRIAL_EXT, uid);
  try { db.prepare("UPDATE users SET publishing_stopped = 1 WHERE id = ?").run(uid); } catch (e) {}
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'Posty', 'community manager', 'amable', ?, 1)").run(uid, ig);
  db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, 'tok-falso')").run(uid, 'IG' + uid);
}

// ---------------------------------------------------------------- A+B
console.log('\nA · plan-gate con la forma REAL de la fila del fundador');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-casa-hotfix-mod-'));
process.env.DATA_DIR = TMP;
const dbm = require('./db'); const db = dbm.db || dbm;
const PG = require('./plan-gate');
const B = require('./bandeja');

seedFormaReal(db, 12, 'casa@posty.example', 'posty.communitymanager');
// Casa por IG (espejo EN): id fuera de HOUSE_USER_IDS, handle de la casa.
seedFormaReal(db, 77, 'espejo@posty.example', 'postycommunitymanager');
// Trial común, NO casa.
seedFormaReal(db, 78, 'ana@panaderia.example', 'panaderia.ana');
// Cliente Total activo.
{
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('clave-prueba-1', 10);
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (79, 'dueno@coffee.example', ?)").run(hash);
  db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = 79").run();
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (79, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run();
  db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (79, 'IG79', 'tok-falso')").run();
}

ok('A1 la fila sembrada ES la forma real (trial/trial, no free/active)',
  (() => { const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = 12').get(); return u.plan === 'trial' && u.plan_status === 'trial'; })());
ok('A2 effectivePlanId(12) resuelve al fundador (\'free\') por identidad, no por la forma de la fila',
  PG.effectivePlanId(db, 12) === 'free', 'dio: ' + PG.effectivePlanId(db, 12));
ok('A3 planGate(12, \'comentarios\') pasa — es el middleware de GET /api/bandeja',
  PG.planGate(db, 12, 'comentarios').ok === true, JSON.stringify(PG.planGate(db, 12, 'comentarios')));
ok('A4 planGate(12, \'atencion\') pasa — es el filtro del poll del scheduler',
  PG.planGate(db, 12, 'atencion').ok === true);
ok('A5 la casa por IG (espejo EN, id fuera de la lista) también pasa el gate',
  PG.planGate(db, 77, 'comentarios').ok === true, JSON.stringify(PG.planGate(db, 77, 'comentarios')));
ok('A6 el gate SIGUE cerrado para un trial que no es la casa (fail-closed intacto)',
  PG.planGate(db, 78, 'comentarios').ok === false && PG.effectivePlanId(db, 78) === 'esencial',
  JSON.stringify(PG.planGate(db, 78, 'comentarios')));
ok('A7 el cliente Total activo pasa como siempre',
  PG.planGate(db, 79, 'comentarios').ok === true);
{
  const prev = process.env.HOUSE_USER_IDS;
  process.env.HOUSE_USER_IDS = '555';
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('clave-prueba-1', 10);
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (555, 'otra@cuenta.example', ?)").run(hash);
  db.prepare("UPDATE users SET plan = 'trial', plan_status = 'trial' WHERE id = 555").run();
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (555, 'Otra', 'cafe', 'amable', 'otra.cuenta', 1)").run();
  ok('A8 HOUSE_USER_IDS manda: el id listado pasa aunque su IG no sea el de la casa',
    PG.planGate(db, 555, 'comentarios').ok === true);
  ok('A9 con el env corrido, el 12 sigue pasando por su IG de la casa',
    PG.planGate(db, 12, 'comentarios').ok === true);
  if (prev === undefined) delete process.env.HOUSE_USER_IDS; else process.env.HOUSE_USER_IDS = prev;
}

console.log('\nB · El circuito: el poll con el filtro real procesa a la casa (forma real)');
(async () => {
  const now = new Date().toISOString();
  const fetchers = {
    fetchMedia: async () => [{ id: 'POST1', caption: 'Esto es Posty: tus community managers', thumb: 'https://example.com/t.jpg', timestamp: now }],
    fetchComments: async () => JSON.parse(JSON.stringify([
      { id: 'c1', text: 'me cobraron dos veces la suscripción, ¿me lo devuelven?', username: 'martin.g', timestamp: now, replies: [] },
      { id: 'c2', text: '¿hasta qué hora responden hoy?', username: 'sofi.m', timestamp: now, replies: [] },
      { id: 'c3', text: 'el mejor community manager 😍', username: 'juanp', timestamp: now, replies: [] },
    ])),
    fetchConversations: async () => [],
    sendCommentReply: async () => ({ id: 'r1' }),
    sendDm: async () => ({ id: 'dm1' }),
    hideComment: async () => ({ ok: true }),
  };
  const deps = {
    credsOf: (uid) => uid === 12
      ? { igUserId: 'IG12', accessToken: 'tok-falso', igUsername: 'posty.communitymanager' }
      : { igUserId: 'IG79', accessToken: 'tok-falso', igUsername: 'thecoffeebardc' },
    suggestFn: () => async (args) => {
      const t = String(args.commentText || '');
      if (/cobraron/.test(t)) return { reply: 'Hola Martín, perdón por eso. Escribinos con el comprobante y te lo resolvemos en el momento.', needsHuman: false, reason: '' };
      if (/hora/.test(t)) return { reply: '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.', needsHuman: false, reason: '' };
      return { reply: '¡Gracias por escribirnos! 🙌', needsHuman: false, reason: '' };
    },
    apiKeyOf: () => '',
    // EL FILTRO REAL del scheduler (proBandejaDeps): plan-gate 'atencion'.
    planFilter: (uid) => { try { return PG.planGate(db, uid, 'atencion').ok; } catch (e) { return false; } },
    notify: () => {},
    fetchers,
  };
  const r = await B.pollBandeja(db, deps, {});
  const gb = B.getBandeja(db, 12);
  ok('B1 el poll procesa a la casa con su forma real (su tanda se arma)',
    gb.tandas.length >= 1, 'tandas=' + gb.tandas.length + ' poll=' + JSON.stringify(r).slice(0, 200));
  ok('B2 countAcciones(12) = 3 con la tanda armada por el circuito',
    B.countAcciones(db, 12) === 3, 'dio: ' + B.countAcciones(db, 12));

  // ------------------------------------------------------------ C/D/E
  await bootSuites();
  console.log(`\nRESULTADO: ${pass} ✓ · ${fail} ✗`);
  if (fails.length) { console.log('FALLAS:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(1); });

// ------------------------------------------------------------------
// Boots reales
// ------------------------------------------------------------------
function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 19851; p < 19951; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}
function seedBootDir(dir, conTanda) {
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const dbm = require(${JSON.stringify(path.join(ROOT, 'db.js'))});
    const db = dbm.db || dbm;
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('clave-prueba-1', 10);
    function formaReal(uid, email, ig) {
      db.prepare("INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)").run(uid, email, hash);
      db.prepare("UPDATE users SET plan = 'trial', plan_status = 'trial', trial_ends_at = ${CASA_TRIAL_ENDS}, trial_extended_until = ${CASA_TRIAL_EXT} WHERE id = ?").run(uid);
      try { db.prepare("UPDATE users SET publishing_stopped = 1 WHERE id = ?").run(uid); } catch (e) {}
      db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'Posty', 'community manager', 'amable', ?, 1)").run(uid, ig);
      db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, ?, 'tok-falso')").run(uid, 'IG' + uid);
    }
    // LA CASA con LA FORMA REAL de producción (trial/trial).
    formaReal(12, 'casa@posty.example', 'posty.communitymanager');
    // EL CLIENTE Total.
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (79, 'dueno@coffee.example', ?)").run(hash);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = 79").run();
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (79, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run();
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (79, 'IG79', 'tok-falso')").run();
    // EL TRIAL QUE NO ES LA CASA (con tanda sembrada: el 403 es del gate, no de los datos).
    formaReal(78, 'ana@panaderia.example', 'panaderia.ana');
    const insT = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, notified_at) VALUES (?, ?, 'post', ?, ?, '', datetime('now'))");
    const insI = db.prepare("INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato) VALUES (?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    let tidCasa = 0;
    if (${conTanda ? 'true' : 'false'}) {
      const t = insT.run(12, 'POST1', 'POST1', 'Esto es Posty: tus community managers');
      tidCasa = Number(t.lastInsertRowid);
      insI.run(tidCasa, 12, 'c1', 'c1', 'c1', 'martin.g', 'me cobraron dos veces la suscripción, ¿me lo devuelven?', 'Hola Martín, perdón por eso. Escribinos con el comprobante y te lo resolvemos en el momento.', 'importante', 'pendiente', '');
      insI.run(tidCasa, 12, 'c2', 'c2', 'c2', 'sofi.m', '¿hasta qué hora responden hoy?', '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.', 'normal', 'pendiente', '');
      insI.run(tidCasa, 12, 'c3', 'c3', 'c3', 'juanp', 'el mejor community manager', '¡Gracias Juan! 🙌', 'normal', 'pendiente', '');
      db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (12, '/x.jpg', 'Esto es Posty', 'published', datetime('now'))").run();
      const tc = insT.run(79, 'POST9', 'POST9', 'Classic Espresso');
      insI.run(Number(tc.lastInsertRowid), 79, 'c9', 'c9', 'c9', 'vale.r', '¿cuánto cuesta el flat white?', 'Sale $4.500, Vale.', 'normal', 'pendiente', '');
      const t78 = insT.run(78, 'POST7', 'POST7', 'Pan dulce');
      insI.run(Number(t78.lastInsertRowid), 78, 'c7', 'c7', 'c7', 'luis.p', '¿hacen envíos?', 'Sí, hacemos envíos.', 'normal', 'pendiente', '');
    }
    console.log('SEEDED tandaCasa=' + tidCasa);
  `;
  const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  return out.trim();
}
async function boot(dir) {
  const port = freePort();
  ok('el puerto del boot está libre antes de arrancar (' + port + ')', portFree(port));
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, MEDIA_DIR: path.join(dir, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  proc.stdout.on('data', d => { bootLog += d; });
  proc.stderr.on('data', d => { bootLog += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
  return { proc, base, port, up, bootLog: () => bootLog };
}
async function killBoot(b, tag) {
  try { process.kill(b.proc.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  ok(tag + ' el boot muere por PID exacto y el puerto queda libre', portFree(b.port));
}
async function login(base, email) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'clave-prueba-1' }) });
  return { status: r.status, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

async function bootSuites() {
  // ------------------------------------------------------------ C
  console.log('\nC · Boot real: la casa con su forma real y su tanda');
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-hotfix-boot-'));
  console.log('  seed C:', seedBootDir(dirC, true));
  const b = await boot(dirC);
  try {
    ok('C1 el servidor levanta', b.up, b.bootLog().slice(-300));
    if (b.up) {
      const lc = await login(b.base, 'casa@posty.example');
      ok('C2 login de la casa', lc.status === 200 && !!lc.cookie, 'status=' + lc.status);
      const HC = { Cookie: lc.cookie, 'Content-Type': 'application/json' };
      const rGb = await fetch(b.base + '/api/bandeja', { headers: HC });
      const gb = await rGb.json().catch(() => ({}));
      const tanda = (gb.tandas || []).find(t => t.kind === 'post');
      ok('C3 GET /api/bandeja de la casa responde 200 ok con SU tanda (3 para salir · 1 importante)',
        rGb.status === 200 && gb.ok === true && !!tanda && tanda.conteo.para_salir === 3 && tanda.conteo.importantes === 1,
        'status=' + rGb.status + ' body=' + JSON.stringify(gb).slice(0, 220));
      const cnt = await (await fetch(b.base + '/api/bandeja/count', { headers: HC })).json();
      ok('C4 GET /api/bandeja/count de la casa = 3 (su insignia cuenta de verdad)',
        cnt.acciones === 3, JSON.stringify(cnt));
      if (tanda) {
        const ap = await (await fetch(b.base + '/api/bandeja/tanda/' + tanda.id + '/approve', { method: 'POST', headers: HC, body: '{}' })).json().catch(() => ({}));
        const gb2 = await (await fetch(b.base + '/api/bandeja', { headers: HC })).json();
        const t2 = (gb2.tandas || []).find(t => t.id === tanda.id);
        const enviados = t2 ? t2.items.filter(i => i.estado === 'enviado').length : -1;
        ok('C5 approve de la casa con token falso: ok y NADA queda enviado',
          ap.ok === true && ap.enviadas === 0 && enviados === 0, JSON.stringify(ap).slice(0, 200));
      } else { ok('C5 approve de la casa (sin tanda no se puede probar)', false, 'no hubo tanda'); }

      const lk = await login(b.base, 'dueno@coffee.example');
      const HK = { Cookie: lk.cookie, 'Content-Type': 'application/json' };
      const rGk = await fetch(b.base + '/api/bandeja', { headers: HK });
      const gk = await rGk.json().catch(() => ({}));
      ok('C6 el cliente Total carga su bandeja como siempre (200, su tanda)',
        rGk.status === 200 && gk.ok === true && (gk.tandas || []).length === 1, 'status=' + rGk.status);

      const la = await login(b.base, 'ana@panaderia.example');
      const HA = { Cookie: la.cookie, 'Content-Type': 'application/json' };
      const rGa = await fetch(b.base + '/api/bandeja', { headers: HA });
      const ga = await rGa.json().catch(() => ({}));
      ok('C7 el trial que NO es la casa sigue frenado por el gate (403 feature_requires_plan)',
        rGa.status === 403 && ga.error === 'feature_requires_plan', 'status=' + rGa.status + ' body=' + JSON.stringify(ga).slice(0, 160));
      const cntA = await (await fetch(b.base + '/api/bandeja/count', { headers: HA })).json();
      ok('C8 el count del trial no-casa sigue en 0 por el gate (como hoy)',
        cntA.ok === true && cntA.acciones === 0, JSON.stringify(cntA));

      // -------------------------------------------------------- E
      console.log('\nE · Chromium 390px: la pantalla de la casa CARGA');
      await chromiumSuite(b.base, lc.cookie, lk.cookie);
    }
  } finally { await killBoot(b, 'C9'); }

  // ------------------------------------------------------------ D
  console.log('\nD · Boot real: la casa SIN filas (el estado vacío honesto)');
  const dirD = fs.mkdtempSync(path.join(os.tmpdir(), 'bandeja-hotfix-vacia-'));
  console.log('  seed D:', seedBootDir(dirD, false));
  const bd = await boot(dirD);
  try {
    ok('D1 el servidor levanta', bd.up, bd.bootLog().slice(-300));
    if (bd.up) {
      const lc = await login(bd.base, 'casa@posty.example');
      const HC = { Cookie: lc.cookie, 'Content-Type': 'application/json' };
      const rGb = await fetch(bd.base + '/api/bandeja', { headers: HC });
      const gb = await rGb.json().catch(() => ({}));
      ok('D2 GET /api/bandeja de la casa vacía responde 200 ok con tandas [] (la vista pinta su vacío honesto, no el error)',
        rGb.status === 200 && gb.ok === true && Array.isArray(gb.tandas) && gb.tandas.length === 0,
        'status=' + rGb.status + ' body=' + JSON.stringify(gb).slice(0, 200));
      const cnt = await (await fetch(bd.base + '/api/bandeja/count', { headers: HC })).json();
      ok('D3 el count de la casa vacía es 0 por conteo real (ok:true)',
        cnt.ok === true && cnt.acciones === 0, JSON.stringify(cnt));
    }
  } finally { await killBoot(bd, 'D4'); }
}

async function chromiumSuite(base, cookieCasa, cookieCliente) {
  let pw = null;
  for (const p of ['/tmp/pw-boot/node_modules/playwright-core', path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { pw = require(p); break; } catch (e) {}
  }
  if (!pw) { ok('E0 playwright-core disponible', false, 'no se encontró el módulo'); return; }
  const fsx = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright')).filter(d => d.startsWith('chromium') && !d.includes('headless'));
  let exe = '';
  for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
    const cand = path.join(os.homedir(), '.cache/ms-playwright', fsx[0], sub);
    if (fs.existsSync(cand)) { exe = cand; break; }
  }
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const [n1, v1] = cookieCasa.split('=');
    await ctx.addCookies([{ name: n1, value: v1, url: base }]);
    const page = await ctx.newPage();
    await page.goto(base + '/#/app/notificaciones', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    const banda = await page.waitForSelector('.pzb-banda', { timeout: 30000 }).then(() => true).catch(() => false);
    const bodyTxt = await page.evaluate(() => document.body.innerText || '');
    ok('E1 la pantalla de la casa CARGA (la banda de Notificaciones está; el error del dueño NO aparece)',
      banda && !/No pude cargar tus notificaciones/.test(bodyTxt), bodyTxt.slice(0, 160));
    const card = await page.$('#pzbConserjeCard');
    ok('E2 la tarjeta «Conserje» está al tope de su pantalla', !!card);
    ok('E3 su tanda espera el toque (3 respuestas listas)',
      /3 respuestas listas/.test(bodyTxt), bodyTxt.slice(0, 200));
    await page.screenshot({ path: path.join(ROOT, 'qa-bandeja-casa-hotfix-390.png'), fullPage: true });
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const [n2, v2] = cookieCliente.split('=');
    await ctx2.addCookies([{ name: n2, value: v2, url: base }]);
    const page2 = await ctx2.newPage();
    await page2.goto(base + '/#/app/notificaciones', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    const banda2 = await page2.waitForSelector('.pzb-banda', { timeout: 30000 }).then(() => true).catch(() => false);
    const txt2 = await page2.evaluate(() => document.body.innerText || '');
    ok('E4 el cliente carga su pantalla de siempre, sin error y sin tarjeta Conserje',
      banda2 && !/No pude cargar tus notificaciones/.test(txt2) && !/pzbConserjeCard/.test(await page2.content()),
      txt2.slice(0, 160));
    await ctx2.close();
  } finally { await browser.close(); }
}
