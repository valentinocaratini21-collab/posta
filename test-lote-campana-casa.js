// test-lote-campana-casa.js — Suite del lote CAMPANA-CASA
// (2026-11-22): la cuenta de la casa ve su bandeja como cualquier
// cliente («lo quiero ver yo asi tambien. porque no?» — dueño,
// 22/11 15:50, viendo las capturas de la bandeja de cliente).
//   A · Estática: la puerta de la campana cambió (todas las sesiones
//       a Notificaciones), la tarjeta «Conserje» existe y está
//       cableada, el glifo de la casa murió, y el gate M78.
//   B · El circuito de la casa (verificación del punto 4 del censo):
//       con el filtro de plan REAL del scheduler (plan-gate
//       'atencion'), el poll SIN onlyUser procesa al user 12 (plan
//       fundador 'free'), le arma su tanda, el conteo de acciones
//       responde y su aprobación sale por el mismo camino.
//   C · Boot real: la sesión de la casa (id 12) usa los endpoints
//       de la bandeja tal cual (puerta casa=true, tanda, count,
//       approve honesto con token falso); la del cliente, casa=false.
//   D · Chromium 390px: la campana de la casa abre Notificaciones
//       con SU tanda en «Espera tu toque» y la tarjeta Conserje AL
//       TOPE (que abre la consola); la del cliente, su pantalla de
//       siempre SIN la tarjeta.
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
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------- A
console.log('\nA · Estática');
{
  const app = read('public/app.js');
  const srv = read('server.js');
  ok('A1 la campana ya NO enruta a la casa al Conserje (la puerta vieja murió)',
    !app.includes("if (casa === true) { location.href = '/conserje'; return; }")
    && !app.includes("if (esCasa) location.href = '/conserje'; else bbGo('#/app/notificaciones');"));
  ok('A2 pzBarraCampana abre Notificaciones para todas las sesiones',
    /function pzBarraCampana\(\) \{[\s\S]{0,420}?bbGo\('#\/app\/notificaciones'\);/.test(app));
  ok('A3 el glifo de la casa murió: ninguna pintura agrega la clase es-casa',
    !app.includes("b.classList.add('es-casa')"));
  ok('A4 la tarjeta «Conserje» existe, es solo de la casa y abre /conserje',
    app.includes('id="pzbConserjeCard"') && app.includes("function pzBandejaIrConserje() { location.href = '/conserje'; }")
    && app.includes('esCasa ? pzBandejaConserjeCardHTML() : '));
  ok('A5 la vista resuelve la casa con la sonda de siempre y la conserva en los repintados',
    app.includes("api.get('/api/conserje/puerta')") && app.includes('PZB.esCasa = await pzBandejaEsCasa();')
    && app.includes('pzBandejaNotifsHTML(data, PZB.esCasa)'));
  const llamadas = ['pzBandejaView', 'pzBandejaIrConserje', 'pzBandejaAbrir', 'pzBandejaAprobar', 'pzBarraCampana', 'pzBandejaEsCasa', 'pzBandejaConserjeCardHTML'];
  const definidas = llamadas.filter(fn => new RegExp('(async )?function ' + fn + '\\(').test(app));
  ok(`A6 gate M78 — funciones auditadas: ${definidas.length}/${llamadas.length}`, definidas.length === llamadas.length, 'faltan: ' + llamadas.filter(f => !definidas.includes(f)).join(','));
  ok('A7 el servidor conserva la puerta del Conserje intacta (sonda + siembra por sesión)',
    srv.includes("app.get('/api/conserje/puerta'") && srv.includes('puertaConserjeEsCasa(req)'));
  ok('A8 la tarjeta usa los estilos pzb- propios de la vista (styles.css intacto en este lote)',
    app.includes('.pzb-conserje{') && app.includes('.pzb-conserje-ic{'));
}

// ---------------------------------------------------------------- B
console.log('\nB · El circuito de la casa (módulo, con el filtro real del scheduler)');
const TMPB = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-casa-mod-'));
process.env.DATA_DIR = TMPB;
const db = require('./db');
const B = require('./bandeja');
const planGate = require('./plan-gate').planGate;

function seedCasa() {
  db.prepare("INSERT INTO users (id, email, password_hash) VALUES (12, 'casa@posty.example', 'x')").run();
  db.prepare("UPDATE users SET plan = 'free', plan_status = 'active' WHERE id = 12").run();
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username) VALUES (12, 'Posty', 'community manager', 'amable', 'posty.communitymanager')").run();
  db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (12, 'IGCASA', 'tok-falso')").run();
  db.prepare("INSERT INTO business_dna (user_id, dna_json) VALUES (12, ?)").run(JSON.stringify({ horarios: 'Lun a Vie 9 a 20' }));
}
function seedCliente() {
  const r = db.prepare("INSERT INTO users (email, password_hash) VALUES ('dueno@coffee.example', 'x')").run();
  const uid = Number(r.lastInsertRowid);
  db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uid);
  db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc')").run(uid);
  db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uid);
  return uid;
}
function makeDeps() {
  const now = new Date().toISOString();
  const state = { sentReplies: [], notifyCalls: [] };
  const fetchers = {
    fetchMedia: async () => [{ id: 'POST1', caption: 'Esto es Posty: tus community managers', thumb: 'https://example.com/t.jpg', timestamp: now }],
    fetchComments: async () => JSON.parse(JSON.stringify([
      { id: 'c1', text: 'me cobraron dos veces la suscripción, ¿me lo devuelven?', username: 'martin.g', timestamp: now, replies: [] },
      { id: 'c2', text: '¿hasta qué hora responden hoy?', username: 'sofi.m', timestamp: now, replies: [] },
      { id: 'c3', text: 'el mejor community manager 😍', username: 'juanp', timestamp: now, replies: [] },
    ])),
    fetchConversations: async () => [],
    sendCommentReply: async (creds, commentId, text) => { state.sentReplies.push({ commentId, text }); return { id: 'r' + commentId }; },
    sendDm: async () => ({ id: 'dm1' }),
    hideComment: async () => ({ ok: true }),
  };
  const suggestFn = () => async (args) => {
    const t = String(args.commentText || '');
    if (/cobraron/.test(t)) return { reply: 'Hola Martín, perdón por eso. Escribinos con el comprobante y te lo resolvemos en el momento.', needsHuman: false, reason: '' };
    if (/hora/.test(t)) return { reply: '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.', needsHuman: false, reason: '' };
    return { reply: '¡Gracias por escribirnos! 🙌', needsHuman: false, reason: '' };
  };
  const deps = {
    credsOf: () => ({ igUserId: 'IGX', accessToken: 'tok-falso', igUsername: 'posty.communitymanager' }),
    suggestFn, apiKeyOf: () => '',
    // EL FILTRO REAL del scheduler (proBandejaDeps): plan-gate 'atencion'.
    planFilter: (uid) => { try { return planGate(db, uid, 'atencion').ok; } catch (e) { return false; } },
    notify: (uid, info) => state.notifyCalls.push({ uid, ...info }),
    fetchers,
  };
  return { state, deps };
}

(async () => {
  seedCasa();
  const uidCliente = seedCliente();
  ok('B1 el plan fundador de la casa pasa el gate de atención (el filtro del cron)',
    planGate(db, 12, 'atencion').ok === true);
  ok('B2 el plan fundador de la casa pasa el gate de comentarios (los endpoints)',
    planGate(db, 12, 'comentarios').ok === true);
  const { state, deps } = makeDeps();
  const r = await B.pollBandeja(db, deps, {}); // SIN onlyUser: el barrido del cron
  ok('B3 el barrido del cron procesa a la casa y al cliente (users=2)', r.users === 2, JSON.stringify(r));
  const dataCasa = B.getBandeja(db, 12);
  const tandaCasa = dataCasa.tandas.find(t => t.kind === 'post');
  ok('B4 la casa tiene SU tanda armada (3 para salir · 1 importante)',
    !!tandaCasa && tandaCasa.conteo.para_salir === 3 && tandaCasa.conteo.importantes === 1, JSON.stringify(tandaCasa && tandaCasa.conteo));
  ok('B5 el conteo de acciones de la casa responde (la insignia tiene qué contar)',
    B.countAcciones(db, 12) === 3, 'acciones=' + B.countAcciones(db, 12));
  ok('B6 la tanda del cliente es suya y no se cruza con la de la casa',
    B.getBandeja(db, uidCliente).tandas.length >= 1 && B.countAcciones(db, uidCliente) === 3);
  const ap = await B.approveTanda(db, 12, tandaCasa.id, deps);
  ok('B7 la aprobación de la tanda de la casa sale por el mismo camino que la de un cliente',
    ap.enviadas === 3 && state.sentReplies.length === 3, JSON.stringify(ap));
  ok('B8 tras aprobar, el conteo de la casa baja a 0', B.countAcciones(db, 12) === 0);

  // ---------------------------------------------------------- C + D
  console.log('\nC · Boot real (HTTP)');
  await bootSuite();
  console.log(`\nRESULTADO: ${pass} ✓ · ${fail} ✗`);
  if (fails.length) { console.log('FALLAS:\n - ' + fails.join('\n - ')); process.exit(1); }
  process.exit(0);
})().catch(e => { console.error('ERROR FATAL', e); process.exit(1); });

// ------------------------------------------------------------------
// Boot real + Chromium
// ------------------------------------------------------------------
function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 19821; p < 19921; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}
function seedBootDir(dir) {
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const dbm = require(${JSON.stringify(path.join(ROOT, 'db.js'))});
    const db = dbm.db || dbm;
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('clave-prueba-1', 10);
    // LA CASA: id 12, plan fundador.
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (12, 'casa@posty.example', ?)").run(hash);
    db.prepare("UPDATE users SET plan = 'free', plan_status = 'active' WHERE id = 12").run();
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (12, 'Posty', 'community manager', 'amable', 'posty.communitymanager', 1)").run();
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (12, 'IGCASA', 'tok-falso')").run();
    const t = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, notified_at) VALUES (12, 'POST1', 'post', 'POST1', 'Esto es Posty: tus community managers', '', datetime('now'))").run();
    const tid = Number(t.lastInsertRowid);
    const ins = db.prepare("INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato) VALUES (?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    ins.run(tid, 12, 'c1', 'c1', 'c1', 'martin.g', 'me cobraron dos veces la suscripción, ¿me lo devuelven?', 'Hola Martín, perdón por eso. Escribinos con el comprobante y te lo resolvemos en el momento.', 'importante', 'pendiente', '');
    ins.run(tid, 12, 'c2', 'c2', 'c2', 'sofi.m', '¿hasta qué hora responden hoy?', '¡Hola Sofi! Hoy estamos hasta las 20. Te esperamos.', 'normal', 'pendiente', '');
    ins.run(tid, 12, 'c3', 'c3', 'c3', 'juanp', 'el mejor community manager', '¡Gracias Juan! 🙌', 'normal', 'pendiente', '');
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (12, '/x.jpg', 'Esto es Posty', 'published', datetime('now'))").run();
    // EL CLIENTE: su tanda propia.
    const rc = db.prepare("INSERT INTO users (email, password_hash) VALUES ('dueno@coffee.example', ?)").run(hash);
    const uidC = Number(rc.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active' WHERE id = ?").run(uidC);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run(uidC);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uidC);
    const tc = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, notified_at) VALUES (?, 'POST9', 'post', 'POST9', 'Classic Espresso', '', datetime('now'))").run(uidC);
    const tidC = Number(tc.lastInsertRowid);
    ins.run(tidC, uidC, 'c9', 'c9', 'c9', 'vale.r', '¿cuánto cuesta el flat white?', 'Sale $4.500, Vale.', 'normal', 'pendiente', '');
    console.log('SEEDED casa=12 tanda=' + tid + ' cliente=' + uidC + ' tandaC=' + tidC);
  `;
  const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  return out.trim();
}

async function bootSuite() {
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-casa-boot-'));
  console.log('  seed C:', seedBootDir(dirC));
  const port = freePort();
  ok('C0 el puerto del boot está libre antes de arrancar', portFree(port));
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dirC, MEDIA_DIR: path.join(dirC, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  proc.stdout.on('data', d => { bootLog += d; });
  proc.stderr.on('data', d => { bootLog += d; });
  const base = `http://127.0.0.1:${port}`;
  let cookieCasa = '', cookieCliente = '';
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
    ok('C1 el servidor levanta', up, bootLog.slice(-400));
    if (!up) return;

    const loginCasa = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'casa@posty.example', password: 'clave-prueba-1' }) });
    cookieCasa = (loginCasa.headers.get('set-cookie') || '').split(';')[0];
    ok('C2 login de la casa', loginCasa.ok && !!cookieCasa, 'status=' + loginCasa.status);
    const HC = { Cookie: cookieCasa, 'Content-Type': 'application/json' };

    const puerta = await (await fetch(base + '/api/conserje/puerta', { headers: HC })).json();
    ok('C3 la sonda dice que esta sesión ES la casa', puerta.casa === true, JSON.stringify(puerta));
    const gb = await (await fetch(base + '/api/bandeja', { headers: HC })).json();
    const tanda = (gb.tandas || []).find(t => t.kind === 'post');
    ok('C4 GET /api/bandeja de la casa trae SU tanda (3 para salir · 1 importante)',
      !!tanda && tanda.conteo.para_salir === 3 && tanda.conteo.importantes === 1, JSON.stringify(gb).slice(0, 300));
    const cnt = await (await fetch(base + '/api/bandeja/count', { headers: HC })).json();
    ok('C5 GET /api/bandeja/count de la casa = 3 (su insignia tiene número)', cnt.acciones === 3, JSON.stringify(cnt));
    const ap = await (await fetch(base + '/api/bandeja/tanda/' + tanda.id + '/approve', { method: 'POST', headers: HC, body: '{}' })).json();
    const gb2 = await (await fetch(base + '/api/bandeja', { headers: HC })).json();
    const tanda2 = (gb2.tandas || []).find(t => t.id === tanda.id);
    const enviados = tanda2 ? tanda2.items.filter(i => i.estado === 'enviado').length : -1;
    ok('C6 approve de la casa con token falso: NADA queda enviado (el camino es honesto)',
      ap.ok === true && ap.enviadas === 0 && enviados === 0, JSON.stringify(ap));

    const loginCli = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@coffee.example', password: 'clave-prueba-1' }) });
    cookieCliente = (loginCli.headers.get('set-cookie') || '').split(';')[0];
    const HK = { Cookie: cookieCliente, 'Content-Type': 'application/json' };
    const puertaK = await (await fetch(base + '/api/conserje/puerta', { headers: HK })).json();
    const cntK = await (await fetch(base + '/api/bandeja/count', { headers: HK })).json();
    ok('C7 la sesión del cliente: puerta casa=false y su conteo propio (1)',
      puertaK.casa === false && cntK.acciones === 1, JSON.stringify({ puertaK, cntK }));
  } finally {
    try { process.kill(proc.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    ok('C8 el boot muere por PID exacto y el puerto queda libre', portFree(port));
  }

  // ------------------------------------------------------------ D
  console.log('\nD · Chromium (390px)');
  const dirD = fs.mkdtempSync(path.join(os.tmpdir(), 'campana-casa-ui-'));
  console.log('  seed D:', seedBootDir(dirD));
  const portD = freePort();
  const procD = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(portD), DATA_DIR: dirD, MEDIA_DIR: path.join(dirD, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseD = `http://127.0.0.1:${portD}`;
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(baseD + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
    ok('D0 el segundo boot levanta', up);
    if (!up) return;
    const loginCasa = await fetch(baseD + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'casa@posty.example', password: 'clave-prueba-1' }) });
    const ckCasa = (loginCasa.headers.get('set-cookie') || '').split(';')[0];
    const loginCli = await fetch(baseD + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'dueno@coffee.example', password: 'clave-prueba-1' }) });
    const ckCli = (loginCli.headers.get('set-cookie') || '').split(';')[0];
    await chromiumSuite(baseD, ckCasa, ckCli);
  } finally {
    try { process.kill(procD.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    ok('D14 el boot de UI muere por PID exacto y el puerto queda libre', portFree(portD));
  }
}

async function chromiumSuite(base, cookieCasa, cookieCliente) {
  let pw = null;
  for (const p of ['/tmp/pw-boot/node_modules/playwright-core', path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { pw = require(p); break; } catch (e) {}
  }
  if (!pw) { ok('D0 playwright-core disponible', false, 'no se encontró el módulo'); return; }
  const fsx = fs.readdirSync(path.join(os.homedir(), '.cache/ms-playwright')).filter(d => d.startsWith('chromium') && !d.includes('headless'));
  let exe = '';
  for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
    const cand = path.join(os.homedir(), '.cache/ms-playwright', fsx[0], sub);
    if (fs.existsSync(cand)) { exe = cand; break; }
  }
  const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    // ---------- LA CASA ----------
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const [n1, v1] = cookieCasa.split('=');
    await ctx.addCookies([{ name: n1, value: v1, url: base }]);
    const page = await ctx.newPage();
    await page.goto(base + '/#/app/inicio', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForSelector('#pzShellBell', { timeout: 30000 });
    await page.waitForFunction(() => { try { return sessionStorage.getItem('pzBarraCasa') === '1'; } catch (e) { return false; } }, { timeout: 15000 }).catch(() => {});
    const bell = await page.evaluate(() => {
      const b = document.getElementById('pzShellBell');
      return b ? { cls: b.className, aria: b.getAttribute('aria-label') } : null;
    });
    ok('D1 la campana de la casa es la campana común (sin clase es-casa, aria «Notificaciones»)',
      !!bell && !/es-casa/.test(bell.cls) && bell.aria === 'Notificaciones', JSON.stringify(bell));
    await page.click('#pzShellBell');
    await page.waitForFunction(() => location.hash.startsWith('#/app/notificaciones'), { timeout: 20000 });
    await page.waitForSelector('.pzb-banda', { timeout: 30000 });
    ok('D2 el toque en la campana de la casa abre Notificaciones (NO sale al Conserje)',
      await page.evaluate(() => location.pathname === '/' || location.pathname === '/index.html') && /Notificaciones/.test(await page.textContent('.pzb-banda h1') || ''));
    const card = await page.$('#pzbConserjeCard');
    ok('D3 la tarjeta «Conserje» está al tope de la pantalla de la casa', !!card);
    const orden = await page.evaluate(() => {
      const c = document.getElementById('pzbConserjeCard');
      const t = document.querySelector('.pzb-card:not(.pzb-conserje)');
      if (!c || !t) return null;
      return { cardY: c.getBoundingClientRect().top, tandaY: t.getBoundingClientRect().top };
    });
    ok('D4 la tarjeta Conserje va ARRIBA de la tarjeta de la tanda', !!orden && orden.cardY < orden.tandaY, JSON.stringify(orden));
    const cardTxt = await page.textContent('.pzb-sobre');
    ok('D5 la tanda de SU negocio espera el toque (3 respuestas listas · importante marcada)',
      /3 respuestas listas/.test(cardTxt || '') && /importante/i.test(cardTxt || ''), (cardTxt || '').slice(0, 160));
    const w1 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    ok('D6 teléfono 390px sin scroll horizontal (notificaciones de la casa)', w1.sw <= w1.iw + 1, JSON.stringify(w1));
    await page.screenshot({ path: path.join(ROOT, 'qa-campana-casa-notificaciones-390.png'), fullPage: true });
    await page.click('button:has-text("Revisar")');
    await page.waitForSelector('.pzb-item', { timeout: 30000 });
    const firstUser = await page.textContent('.pzb-user');
    ok('D7 la revisión de la casa abre con la importante primero (@martin.g)', firstUser === '@martin.g', firstUser || '');
    await page.goto(base + '/#/app/notificaciones', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.waitForSelector('#pzbConserjeCard', { timeout: 30000 });
    await Promise.all([
      page.waitForURL('**/conserje', { timeout: 30000 }),
      page.click('#pzbConserjeCard'),
    ]);
    ok('D8 la tarjeta Conserje abre la consola de siempre (/conserje)', /\/conserje/.test(page.url()), page.url());
    await ctx.close();

    // ---------- EL CLIENTE ----------
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const [n2, v2] = cookieCliente.split('=');
    await ctx2.addCookies([{ name: n2, value: v2, url: base }]);
    const page2 = await ctx2.newPage();
    await page2.goto(base + '/#/app/notificaciones', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page2.waitForSelector('.pzb-banda', { timeout: 30000 });
    const nCard = await page2.evaluate(() => document.querySelectorAll('#pzbConserjeCard').length);
    const cliTxt = await page2.textContent('.pzb-sobre');
    ok('D9 el cliente NO ve la tarjeta Conserje en su pantalla', nCard === 0);
    ok('D10 el cliente ve su pantalla de siempre, con su tanda (1 respuesta lista)',
      /1 respuesta lista/.test(cliTxt || ''), (cliTxt || '').slice(0, 140));
    await page2.screenshot({ path: path.join(ROOT, 'qa-campana-casa-cliente-390.png'), fullPage: true });
    await ctx2.close();
  } finally {
    await browser.close();
  }
}
