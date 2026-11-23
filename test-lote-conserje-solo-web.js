'use strict';
/* LOTE CONSERJE-SOLO-WEB — el Conserje sale de la app del cliente y queda
 * solamente en el website. Orden del dueño 22/11 21:37 con captura: dos
 * tarjetas de operador duplicadas en su Inicio («Conserje · revisión de la
 * noche — 1 de 32 revisados» y «Revisión de la noche — Abierta ahora»).
 *
 * A · Estática: los identificadores retirados no existen en el release; la
 *     consola web y sus APIs quedan byte-idénticas (diff de árboles).
 * B · Control (árbol prístino, Chromium): con la sesión de la casa, el token
 *     en el dispositivo y la revisión interceptada (32 ítems, 1 decidido),
 *     Inicio muestra la tarjeta 1 con «1 de 32 revisados» — la captura del
 *     dueño — y la función de la tarjeta 2 devuelve «Revisión de la noche»;
 *     Notificaciones muestra la tarjeta «Conserje» al tope.
 * C · Release (Chromium): casa y cliente, Inicio sin ninguna de las dos
 *     tarjetas ni menciones, sin llamadas a la API de revisión desde Hoy;
 *     Notificaciones sin la tarjeta del operador y con la tanda del cliente
 *     intacta; la consola web responde igual (/conserje 200, puerta sí/no).
 *
 * El árbol prístino se busca en PZ_PRISTINE_DIR o en ../base (el scratch del
 * lote); sin él, B y el diff de A se omiten con nota.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const PRISTINE = process.env.PZ_PRISTINE_DIR || path.resolve(ROOT, '..', 'base');
const HAY_BASE = fs.existsSync(path.join(PRISTINE, 'public', 'app.js'));

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 21311; p < 21411; p++) { if (!out.includes(':' + p + ' ')) return p; }
  throw new Error('sin puerto libre');
}
function portFree(p) {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  return !out.includes(':' + p + ' ');
}

function seedBootDir(dir, root) {
  const seed = `
    process.env.DATA_DIR = ${JSON.stringify(dir)};
    const dbm = require(${JSON.stringify(path.join(root, 'db.js'))});
    const db = dbm.db || dbm;
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('clave-prueba-1', 10);
    try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (12, 'casa@posty.example', ?)").run(hash);
    db.prepare("UPDATE users SET plan = 'free', plan_status = 'active', bambooty_shell = 1 WHERE id = 12").run();
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (12, 'Posty', 'community manager', 'amable', 'posty.communitymanager', 1)").run();
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (12, 'IGCASA', 'tok-falso')").run();
    const tt = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, notified_at) VALUES (12, 'POST1', 'post', 'POST1', 'Esto es Posty: tus community managers', '', datetime('now'))").run();
    const tid = Number(tt.lastInsertRowid);
    const ins = db.prepare("INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato) VALUES (?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    ins.run(tid, 12, 'c1', 'c1', 'c1', 'reyveronica_', '🔥', 'se viene 🔥', 'normal', 'pendiente', '');
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (12, '/x.jpg', 'Esto es Posty', 'published', datetime('now'))").run();
    const rc = db.prepare("INSERT INTO users (email, password_hash) VALUES ('dueno@coffee.example', ?)").run(hash);
    const uidC = Number(rc.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active', bambooty_shell = 0 WHERE id = ?").run(uidC);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run(uidC);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uidC);
    console.log('SEEDED casa=12 tanda=' + tid + ' cliente=' + uidC);
  `;
  const out = execFileSync('node', ['-e', seed], { cwd: root, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  return out.trim();
}

async function bootServer(dir, root) {
  const port = freePort();
  const proc = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, MEDIA_DIR: path.join(dir, 'media'), ADMIN_TOKEN: 'tok-admin-prueba' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { const r = await fetch(base + '/api/version'); up = r.ok; } catch (e) { await sleep(1000); } }
  return { proc, port, base, up, log: () => log };
}
async function killBoot(b, nombre) {
  try { process.kill(b.proc.pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  t(nombre + ': el boot muere por PID exacto y el puerto queda libre', portFree(b.port));
}
async function login(base, email) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'clave-prueba-1' }) });
  const ck = (r.headers.get('set-cookie') || '').split(';')[0];
  const i = ck.indexOf('=');
  return { ok: r.ok, cookie: ck, name: ck.slice(0, i), value: ck.slice(i + 1) };
}
function loadPw() {
  for (const p of ['/tmp/pw-boot/node_modules/playwright-core', path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { return require(p); } catch (e) {}
  }
  return null;
}
function chromiumExe() {
  const dir = path.join(os.homedir(), '.cache/ms-playwright');
  const fsx = fs.readdirSync(dir).filter((d) => d.startsWith('chromium') && !d.includes('headless'));
  for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
    const cand = path.join(dir, fsx[0], sub);
    if (fs.existsSync(cand)) return cand;
  }
  return '';
}

// Abre la app con sesión + token de admin en el dispositivo, intercepta la
// revisión de la noche (32 ítems, 1 decidido = la captura del dueño) y
// cuenta los pedidos a esa API.
async function abrirApp(browser, base, sesion, conToken) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies([{ name: sesion.name, value: sesion.value, domain: '127.0.0.1', path: '/' }]);
  if (conToken) await ctx.addInitScript(() => { try { localStorage.setItem('posta_admin_token', 'tok-admin-prueba'); } catch (e) {} });
  const page = await ctx.newPage();
  let pedidosRevision = 0;
  await page.route('**/api/admin/support/conserje/revision*', async (route) => {
    pedidosRevision++;
    const items = Array.from({ length: 32 }, (_, i) => ({ decision: i === 0 ? 'ok' : '' }));
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, items, sin_posteo: [] }) });
  });
  await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#inicioView', { timeout: 30000 }).catch(() => {});
  await sleep(3500);
  return { ctx, page, pedidosRevision: () => pedidosRevision };
}

(async () => {
  // ---------------------------------------------------------- A
  seccion('A · Estática — el release sin Conserje en la app, la web intacta');
  const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const retirados = ['function pzHoyConserjeHTML', 'function pzHoyConserjeFill', 'function pzConserjeHoyHTML',
    'function pzBandejaConserjeCardHTML', 'function pzBandejaIrConserje', 'function pzBandejaEsCasa',
    'id="pzHoyConserje"', 'data-pz-hoy-conserje', 'pz-conserje-hoy', 'pzb-conserje', 'pzHoyConserjeHTML(',
    'pzConserjeHoyHTML()', 'pzHoyConserjeFill()', 'hayAdminR1'];
  for (const r of retirados) t('A: fuera «' + r + '»', !appJs.includes(r));
  t('A: la ruta trampolín a la consola WEB sigue (push del dueño, v1237)', appJs.includes("location.replace('/conserje'"));
  t('A: la Bandeja del cliente sigue (pzBandejaNotifsHTML)', appJs.includes('function pzBandejaNotifsHTML(data)'));
  const admJs = fs.readFileSync(path.join(ROOT, 'public', 'chunk-admin.js'), 'utf8');
  t('A: panel Admin sin pestaña Conserje', !admJs.includes('data-atab="conserje"') && !admJs.includes('conserje: showConcierge'));
  t('A: el resto del panel Admin sigue (Soporte)', admJs.includes('data-atab="support"'));
  if (HAY_BASE) {
    let difOut = '';
    try { difOut = execFileSync('diff', ['-rq', path.join(PRISTINE), ROOT], { encoding: 'utf8' }); }
    catch (e) { difOut = e.stdout || ''; }
    const dif = difOut.split('\n').filter(Boolean)
      .map((l) => {
        let m = l.match(/^Files .*? and (.*?) differ$/);
        if (m) return m[1];
        m = l.match(/^Only in (.*?): (.*)$/);
        if (m) return path.join(m[1], m[2]);
        return l;
      });
    const rel = dif.map((l) => path.relative(ROOT, l)).sort();
    t('A: el diff de árboles es solo app.js + chunk-admin.js + esta suite',
      JSON.stringify(rel) === JSON.stringify(['public/app.js', 'public/chunk-admin.js', 'test-lote-conserje-solo-web.js'].sort()), rel.join(' · '));
    const md5 = (p) => execFileSync('md5sum', [p], { encoding: 'utf8' }).split(' ')[0];
    t('A: public/conserje.js byte-idéntico (la consola web no se tocó)',
      md5(path.join(PRISTINE, 'public', 'conserje.js')) === md5(path.join(ROOT, 'public', 'conserje.js')));
    t('A: server.js byte-idéntico (APIs y avisos no se tocaron)',
      md5(path.join(PRISTINE, 'server.js')) === md5(path.join(ROOT, 'server.js')));
  } else {
    console.log('  (sin árbol prístino al lado: diff de árboles omitido)');
  }

  const pw = loadPw();
  t('playwright-core disponible', !!pw);
  if (!pw) { console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(mal ? 1 : 0); }
  const browser = await pw.chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });

  // ---------------------------------------------------------- B · control
  if (HAY_BASE) {
    seccion('B · Control prístino — la captura del dueño, reproducida');
    const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-web-ctl-'));
    console.log('  seed B:', seedBootDir(dirB, PRISTINE));
    const bB = await bootServer(dirB, PRISTINE);
    t('B0 el boot prístino levanta', bB.up, bB.log().slice(-200));
    const sesB = await login(bB.base, 'casa@posty.example');
    t('B0 login de la casa', sesB.ok);
    const { ctx: ctxB, page: pageB, pedidosRevision: revB } = await abrirApp(browser, bB.base, sesB, true);
    const card1 = await pageB.evaluate(() => {
      const el = document.getElementById('pzHoyConserje');
      return el ? { visible: !el.hidden, texto: el.textContent.replace(/\s+/g, ' ').trim() } : null;
    });
    t('B1 la tarjeta 1 EXISTE en el prístino con «1 de 32 revisados» (la captura)',
      !!card1 && card1.visible && card1.texto.includes('1 de 32 revisados'), card1 ? card1.texto : 'sin tarjeta');
    t('B1 la revisión se pidió desde Hoy en el prístino', revB() >= 1, 'pedidos=' + revB());
    const card2 = await pageB.evaluate(() => {
      const g = Date.prototype.getHours;
      Date.prototype.getHours = function () { return 21; };
      let h = '';
      try { h = pzConserjeHoyHTML(); } catch (e) {}
      Date.prototype.getHours = g;
      return h;
    });
    t('B2 la tarjeta 2 («Revisión de la noche · Abierta ahora») EXISTE en el prístino', card2.includes('Revisión de la noche') && card2.includes('Abierta ahora'));
    await pageB.goto(bB.base + '/#/app/notificaciones', { waitUntil: 'domcontentloaded' });
    await pageB.waitForSelector('#pzbRoot', { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    const cardBandeja = await pageB.evaluate(() => !!document.getElementById('pzbConserjeCard'));
    t('B3 la tarjeta «Conserje» al tope de Notificaciones EXISTE en el prístino', cardBandeja);
    await ctxB.close();
    await killBoot(bB, 'B');
  } else {
    console.log('\n== B · Control omitido (sin árbol prístino) ==');
  }

  // ---------------------------------------------------------- C · release
  seccion('C · Release — ningún rol ve el Conserje en la app; la web, igual');
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-web-rel-'));
  console.log('  seed C:', seedBootDir(dirC, ROOT));
  const bC = await bootServer(dirC, ROOT);
  t('C0 el boot del release levanta', bC.up, bC.log().slice(-200));
  const sesCasa = await login(bC.base, 'casa@posty.example');
  const sesCli = await login(bC.base, 'dueno@coffee.example');
  t('C0 login casa + cliente', sesCasa.ok && sesCli.ok);

  const casa = await abrirApp(browser, bC.base, sesCasa, true);
  const iniCasa = await casa.page.evaluate(() => ({
    card1: !!document.getElementById('pzHoyConserje'),
    card2: !!document.querySelector('.pz-conserje-hoy'),
    texto: (document.body.innerText || '').toLowerCase().includes('revisión de la noche'),
    tipos: [typeof pzConserjeHoyHTML, typeof pzHoyConserjeFill, typeof pzHoyConserjeHTML],
  }));
  t('C1 casa: Inicio sin tarjeta 1 ni tarjeta 2', !iniCasa.card1 && !iniCasa.card2);
  t('C1 casa: Inicio sin mención a la revisión de la noche', !iniCasa.texto);
  t('C1 casa: las funciones del Conserje ya no existen en la app', iniCasa.tipos.every((x) => x === 'undefined'), iniCasa.tipos.join(','));
  t('C1 casa: Hoy ya no pide la revisión a la API del operador', casa.pedidosRevision() === 0, 'pedidos=' + casa.pedidosRevision());
  await casa.page.goto(bC.base + '/#/app/notificaciones', { waitUntil: 'domcontentloaded' });
  await casa.page.waitForSelector('#pzbRoot', { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  const notifCasa = await casa.page.evaluate(() => ({
    card: !!document.getElementById('pzbConserjeCard'),
    tanda: (document.body.innerText || '').includes('ESPERA TU TOQUE'),
    aprobar: !!document.querySelector('[id^="pzbApr-"]'),
  }));
  t('C2 casa: Notificaciones sin la tarjeta del Conserje', !notifCasa.card);
  t('C2 casa: la Bandeja del cliente sigue (tanda + aprobar con un toque)', notifCasa.tanda && notifCasa.aprobar);
  await casa.ctx.close();

  const cli = await abrirApp(browser, bC.base, sesCli, false);
  const iniCli = await cli.page.evaluate(() => ({
    card1: !!document.getElementById('pzHoyConserje'),
    card2: !!document.querySelector('.pz-conserje-hoy'),
    texto: (document.body.innerText || '').toLowerCase().includes('revisión de la noche'),
    inicio: !!document.getElementById('inicioView'),
  }));
  t('C3 cliente: Inicio sano y sin rastro del Conserje', iniCli.inicio && !iniCli.card1 && !iniCli.card2 && !iniCli.texto);
  await cli.ctx.close();

  const rConsola = await fetch(bC.base + '/conserje');
  const cuerpoConsola = await rConsola.text();
  t('C4 la consola web sigue sirviendo su página', rConsola.status === 200 && /conserje/i.test(cuerpoConsola), 'status=' + rConsola.status);
  const puertaCasa = await (await fetch(bC.base + '/api/conserje/puerta', { headers: { Cookie: sesCasa.cookie } })).json().catch(() => null);
  const puertaCli = await (await fetch(bC.base + '/api/conserje/puerta', { headers: { Cookie: sesCli.cookie } })).json().catch(() => null);
  t('C4 la puerta del Conserje (API) responde igual: casa sí, cliente no',
    !!(puertaCasa && puertaCasa.casa === true) && !!(puertaCli && puertaCli.casa === false),
    JSON.stringify([puertaCasa, puertaCli]));
  await killBoot(bC, 'C');

  await browser.close();
  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
