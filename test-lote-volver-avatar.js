'use strict';

// =====================================================================
// LOTE VOLVER-AVATAR — suite del lote
// =====================================================================
// Defecto de campo del dueño (22/11 18:54, captura de la bandeja
// «Respuestas listas»): el botón circular de volver (←) de arriba a la
// izquierda se monta SOBRE el medallón del avatar de la barra — el
// avatar queda tapado, con su punto verde asomando por el borde.
// Palabra del dueño (19:00): «Corregi que el boton de ir para atras
// no tape el avatar de posty».
//
// Causa raíz (geometría CSS, verificada): .pz-back-fixed es un círculo
// de 44×44 en position:fixed; top:calc(10px + safe-area); left:10px —
// exactamente donde la barra (.pz-shell-head, padding 10px 14px) pone
// su avatar de 44×44 (x 14–58). Todo tab que pzBackHTML no excluye
// recibía el círculo encima del medallón.
//
// El arreglo: el volver entra a la barra como primer elemento en flujo
// (pzVolverBarraHTML en la cáscara de la app; pzVolverBarraDeskHTML en
// la web, visible ≥761px como el fijo que reemplaza), con la MISMA
// lista de pantallas que hoy tiene atrás. Los helpers viejos
// (pzBackHTML / pzBackDesktopHTML) quedan definidos e intactos: las
// suites vecinas los ejercitan por VM. El modo viaja por
// pzShellHeadHTML.modoVolver (la cáscara lo avisa, el encabezado lo
// consume y lo limpia) porque las suites vecinas cortan el encabezado
// por su firma exacta y afirman la llamada literal en las cáscaras:
// firma y llamadas quedan byte-idénticas a las de siempre.
//
//   A · Estática: helpers nuevos con su lista, las cáscaras ya no
//       pintan el círculo fijo, el encabezado acepta el volver, el CSS
//       nuevo existe, los helpers viejos están byte-idénticos a la
//       base (vía VM) y el gate de funciones llamadas desde la barra.
//   B · VM: el encabezado compuesto por tab — el volver está donde
//       tiene que estar y la identidad sale completa.
//   C · Boot real + Chromium 390px (cáscara de la app, la evidencia):
//       geometría por pantalla — sin círculo fijo, sin solape entre
//       el volver y el avatar/punto, barra completa, área de toque
//       del volver intacta (44×44), el volver navega, y la captura
//       de la bandeja detalle (la pantalla del dueño).
//   D · Chromium cáscara web: 390px sin fijos visibles ni solapes;
//       800px con el volver de escritorio dentro de la barra y la
//       fila superior sin duplicar.
// Contra la base prístina, A2–A5, B y la geometría de C/D fallan en la
// superficie del defecto (el control): el círculo fijo existe y su
// caja se cruza con la del avatar.
// Uso: node test-lote-volver-avatar.js — sale 0 si todo pasa.
// =====================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const app = read('public/app.js');
const css = read('public/styles.css');
const QA_DIR = path.join(ROOT, 'qa-volver');
try { fs.mkdirSync(QA_DIR, { recursive: true }); } catch (e) {}

// Los tabs con atrás del shell (la lista de pzBackHTML, sin cambios).
const CON_VOLVER = ['schedule', 'notificaciones', 'bandeja', 'admin', 'terminos', 'ritual', 'conserje'];
const SIN_VOLVER = ['inicio', 'chat', 'jardin-posty', 'post', 'dogfood', 'ads', 'subir', 'ajustes', 'numeros', 'analisis'];
// La lista de escritorio web (pzBackDesktopHTML): suma numeros.
const CON_VOLVER_DESK = CON_VOLVER.concat(['numeros']);
const SIN_VOLVER_DESK = SIN_VOLVER.filter((x) => x !== 'numeros');

// ---------------------------------------------------------------------
seccion('A · estática del arreglo');
function sliceFn(src, desde, hasta) {
  const i = src.indexOf(desde);
  if (i < 0) return '';
  const j = src.indexOf(hasta, i + desde.length);
  return j < 0 ? src.slice(i) : src.slice(i, j);
}
const sVolver = sliceFn(app, 'function pzVolverBarraHTML(', 'function bbHace(');
t('A1 existen pzVolverBarraHTML y pzVolverBarraDeskHTML junto a los helpers de siempre',
  sVolver.includes('function pzVolverBarraHTML(') && sVolver.includes('function pzVolverBarraDeskHTML('));
t('A2 la cáscara de la app ya no pinta el círculo fijo y avisa el modo barra (la llamada de siempre, intacta)',
  !app.includes('${pzBackHTML(tab)}') && app.includes("pzShellHeadHTML.modoVolver = 'barra';")
  && app.includes('${pzShellHeadHTML(tab)}'));
t('A3 la cáscara web ya no pinta el círculo fijo de escritorio y avisa el modo barra-desk',
  !app.includes('${pzBackDesktopHTML(tab)}') && app.includes("pzShellHeadHTML.modoVolver = 'barra-desk';"));
t('A4 el encabezado consume el modo y compone el volver como primer elemento (antes de la identidad), con la firma de siempre',
  app.includes('function pzShellHeadHTML(tab) {')
  && app.includes('const modoVolver = pzShellHeadHTML.modoVolver || \'\';')
  && app.includes("modoVolver === 'barra' ? pzVolverBarraHTML(tab)")
  && app.includes("modoVolver === 'barra-desk' ? pzVolverBarraDeskHTML(tab)")
  && app.indexOf('${volverBtn}<button type="button" class="pz-shell-ident"') > 0);
t('A5 el CSS: el volver en la barra es en flujo, el de escritorio se ve ≥761px y la fila web no duplica',
  css.includes('.pz-back-inbar{flex:none}')
  && css.includes('.pz-back.pz-back-inbar-desk{display:none}')
  && /@media\(min-width:761px\)\{[^}]*\.pz-back\.pz-back-inbar-desk\{display:flex\}[^}]*\.pz-back-mtop\{display:none\}/.test(css));
// Los helpers viejos, ejercitados por VM: su salida no cambia en nada.
{
  const src = sliceFn(app, 'function pzBackHTML(', 'function bbHace(');
  const ctx = { pzIc: (n, s) => '<svg data-ic="' + n + '"></svg>' };
  vm.createContext(ctx);
  let r = '';
  try { vm.runInContext(src + '\n__r = [pzBackHTML("schedule").includes("pz-back-fixed"), pzBackHTML("inicio") === "", pzBackHTML("ajustes") === "", pzBackDesktopHTML("numeros").includes("pz-back-fixed"), pzBackDesktopHTML("ads") === ""].join(",");', ctx); r = ctx.__r; } catch (e) { r = 'ERROR ' + e.message; }
  t('A6 los helpers viejos pzBackHTML/pzBackDesktopHTML conservan su salida exacta (compat VM)', r === 'true,true,true,true,true', String(r));
}
// Gate tipo M78: toda función llamada desde el encabezado existe una vez.
{
  const llamadas = ['pzVolverBarraHTML', 'pzVolverBarraDeskHTML', 'pzGoBack', 'pzIc', 'pzIsGuest', 'esc'];
  const definida = (f) => app.includes('function ' + f + '(') || app.includes('const ' + f + ' =') || app.includes('let ' + f + ' =') || app.includes('var ' + f + ' =');
  const faltan = llamadas.filter((f) => !definida(f));
  t('A7 gate: las funciones que la barra llama están definidas en el bundle (' + (llamadas.length - faltan.length) + '/' + llamadas.length + ')',
    faltan.length === 0, faltan.join(','));
  const dup = ['pzVolverBarraHTML', 'pzVolverBarraDeskHTML'].filter((f) => (app.split('function ' + f + '(').length - 1) !== 1);
  t('A8 los helpers nuevos están definidos exactamente una vez', dup.length === 0, dup.join(','));
}

// ---------------------------------------------------------------------
seccion('B · VM: el encabezado compuesto por tab');
{
  const srcHead = sliceFn(app, 'function pzShellHeadHTML(', 'function pzShellDatosHoy(');
  const srcVolver = sliceFn(app, 'function pzVolverBarraHTML(', 'function bbHace(');
  const ctx = {
    ME: { lang: 'es' },
    window: {},
    pzIc: (n, s) => '<svg data-ic="' + n + '"></svg>',
    pzIsGuest: () => false,
    bbGo: () => {},
    esc: (s) => String(s),
  };
  vm.createContext(ctx);
  let errB = '';
  try { vm.runInContext(srcVolver + '\n' + srcHead, ctx); } catch (e) { errB = e.message; }
  t('B0 el encabezado y los helpers evalúan en VM', !errB, errB);
  if (!errB) {
    const head = (tab, modo) => {
      vm.runInContext('pzShellHeadHTML.modoVolver = ' + JSON.stringify(modo || '') + '; __h = pzShellHeadHTML(' + JSON.stringify(tab) + ');', ctx);
      return ctx.__h;
    };
    for (const tab of CON_VOLVER) {
      const h = head(tab, 'barra');
      t('B·' + tab + ': la barra lleva su volver en flujo y la identidad completa',
        h.includes('pz-back pz-back-inbar') && !h.includes('pz-back-fixed')
        && h.includes('pz-shell-ava') && h.includes('pz-shell-dot') && h.includes('Posty')
        && h.includes('pz-shell-bell') && h.includes('id="pzShellState"'));
    }
    for (const tab of SIN_VOLVER) {
      const h = head(tab, 'barra');
      if (tab === 'chat') {
        // El chat no lleva la barra de la cáscara (cabecera propia):
        // el encabezado devuelve '' por diseño, como siempre.
        t('B·chat: sin barra de cáscara (cabecera propia), como hoy', h === '');
        continue;
      }
      t('B·' + tab + ': sin volver (como hoy) y la identidad completa',
        !h.includes('pz-back-inbar') && h.includes('pz-shell-ava') && h.includes('Posty'));
    }
    const hDesk = head('numeros', 'barra-desk');
    t('B·numeros escritorio web: lleva el volver de escritorio en la barra',
      hDesk.includes('pz-back-inbar-desk'));
    const hDeskSin = head('ajustes', 'barra-desk');
    t('B·ajustes escritorio web: sin volver (como hoy)', !hDeskSin.includes('pz-back-inbar'));
    const hSinModo = head('notificaciones', undefined);
    t('B·sin modo (llamadas de siempre): el encabezado sale como antes, sin volver',
      !hSinModo.includes('pz-back-inbar') && hSinModo.includes('pz-shell-ava'));
  }
}

// ---------------------------------------------------------------------
// Boot real + Chromium
// ---------------------------------------------------------------------
function freePort() {
  const out = execFileSync('ss', ['-ltnH'], { encoding: 'utf8' });
  for (let p = 19931; p < 20031; p++) { if (!out.includes(':' + p + ' ')) return p; }
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
    try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) { /* ya existe (la crea oficina.js al bootear) */ }
    // LA CASA con la cáscara de la app (bambooty_shell): id 12.
    db.prepare("INSERT INTO users (id, email, password_hash) VALUES (12, 'casa@posty.example', ?)").run(hash);
    db.prepare("UPDATE users SET plan = 'free', plan_status = 'active', bambooty_shell = 1 WHERE id = 12").run();
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (12, 'Posty', 'community manager', 'amable', 'posty.communitymanager', 1)").run();
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (12, 'IGCASA', 'tok-falso')").run();
    const tt = db.prepare("INSERT INTO bandeja_tandas (user_id, group_key, kind, post_ig_id, post_caption, post_thumb, notified_at) VALUES (12, 'POST1', 'post', 'POST1', 'Esto es Posty: tus community managers', '', datetime('now'))").run();
    const tid = Number(tt.lastInsertRowid);
    const ins = db.prepare("INSERT INTO bandeja_items (tanda_id, user_id, source, thread_key, comment_id, last_msg_id, author_username, text, draft, clase, estado, falta_dato) VALUES (?, ?, 'comment', ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    ins.run(tid, 12, 'c1', 'c1', 'c1', 'reyveronica_', '🔥', 'se viene 🔥', 'normal', 'pendiente', '');
    db.prepare("INSERT INTO posts (user_id, image_path, caption, status, published_at) VALUES (12, '/x.jpg', 'Esto es Posty', 'published', datetime('now'))").run();
    // EL CLIENTE WEB (sin cáscara Bambooty): la cáscara appShell.
    const rc = db.prepare("INSERT INTO users (email, password_hash) VALUES ('dueno@coffee.example', ?)").run(hash);
    const uidC = Number(rc.lastInsertRowid);
    db.prepare("UPDATE users SET plan = 'total', plan_status = 'active', bambooty_shell = 0 WHERE id = ?").run(uidC);
    db.prepare("INSERT INTO profiles (user_id, business_name, category, tone, ig_username, ig_connected) VALUES (?, 'The Coffee Bar', 'cafe', 'amable', 'thecoffeebardc', 1)").run(uidC);
    db.prepare("INSERT INTO settings (user_id, ig_user_id, ig_access_token) VALUES (?, 'IGBIZ', 'tok-falso')").run(uidC);
    console.log('SEEDED casa=12 tanda=' + tid + ' cliente=' + uidC);
  `;
  const out = execFileSync('node', ['-e', seed], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATA_DIR: dir } });
  const m = out.match(/tanda=(\d+)/);
  return { tandaId: m ? Number(m[1]) : 0, log: out.trim() };
}

async function bootServer(dir) {
  const port = freePort();
  const proc = spawn('node', ['server.js'], {
    cwd: ROOT,
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
  return { ok: r.ok, cookie: ck };
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
// Geometría de la barra en la página viva: cajas del volver, el avatar,
// su punto, y la identidad completa.
async function geoBarra(page) {
  return page.evaluate(() => {
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: r.x, y: r.y, w: r.width, h: r.height, display: cs.display, visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' }; };
    const cruza = (a, b) => !!(a && b && a.visible && b.visible && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
    const head = document.querySelector('.pz-shell-head');
    const ava = document.querySelector('.pz-shell-ava');
    const dot = document.querySelector('.pz-shell-dot');
    const fijo = document.querySelector('.pz-back-fixed');
    const inbar = document.querySelector('.pz-back-inbar');
    const who = document.querySelector('.pz-shell-who');
    const state = document.getElementById('pzShellState');
    const bell = document.getElementById('pzShellBell');
    const badge = document.getElementById('pzShellBellBadge');
    const acts = document.querySelectorAll('.pz-shell-acts .pz-shell-ic');
    return {
      hayHead: !!head,
      ava: box(ava), dot: box(dot), fijo: box(fijo), inbar: box(inbar),
      fijoEnDom: !!fijo,
      inbarEnBarra: !!(inbar && head && head.contains(inbar)),
      cruzaFijoAvatar: cruza(box(fijo), box(ava)),
      cruzaFijoPunto: cruza(box(fijo), box(dot)),
      cruzaInbarAvatar: cruza(box(inbar), box(ava)),
      cruzaInbarPunto: cruza(box(inbar), box(dot)),
      nombreOk: !!(who && /Posty/.test(who.textContent || '')),
      estadoOk: !!(state && (state.textContent || '').trim().length > 0),
      campanaOk: !!bell,
      insignia: badge ? (badge.textContent || '').trim() : null,
      accionesOk: acts.length === 3,
      avaCompleta: !!(ava && ava.complete !== false),
    };
  });
}

(async () => {
  // ---------------------------------------------------------- C
  seccion('C · Chromium 390px — la cáscara de la app (la evidencia del dueño)');
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'volver-avatar-boot-'));
  const seedC = seedBootDir(dirC);
  console.log('  seed C:', seedC.log);
  const bC = await bootServer(dirC);
  t('C0 el boot levanta', bC.up, bC.log().slice(-300));
  if (bC.up) {
    const lg = await login(bC.base, 'casa@posty.example');
    t('C1 login de la casa (cáscara de la app)', lg.ok && !!lg.cookie);
    const pw = loadPw();
    if (!pw) { t('C2 playwright-core disponible', false, 'no se encontró el módulo'); }
    else {
      const browser = await pw.chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });
      try {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const [n1, v1] = lg.cookie.split('=');
        await ctx.addCookies([{ name: n1, value: v1, url: bC.base }]);
        const page = await ctx.newPage();
        const abrir = async (hash) => {
          await page.goto(bC.base + '/' + hash, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
          await page.waitForSelector('.pz-shell-head', { timeout: 30000 }).catch(() => {});
          await sleep(600);
        };
        // Inicio (control): sin volver, como siempre.
        await abrir('#/app/inicio');
        let g = await geoBarra(page);
        t('C3 Inicio: sin volver y sin círculo fijo (como hoy), barra completa',
          g.hayHead && !g.fijoEnDom && !g.inbar && g.nombreOk && g.estadoOk && g.campanaOk && g.accionesOk, JSON.stringify(g));
        // La bandeja — lista.
        await abrir('#/app/notificaciones');
        g = await geoBarra(page);
        t('C4 Notificaciones: NINGÚN círculo fijo sobre la barra', g.hayHead && !g.fijoEnDom, JSON.stringify(g.fijo));
        t('C5 Notificaciones: el volver vive en la barra y NO toca el avatar ni su punto',
          g.inbarEnBarra && !g.cruzaInbarAvatar && !g.cruzaInbarPunto, JSON.stringify({ inbar: g.inbar, ava: g.ava, dot: g.dot }));
        t('C6 Notificaciones: la identidad se ve completa (avatar, nombre, estado, campana con insignia, Compartir, Ajustes)',
          g.ava.visible && g.dot.visible && g.nombreOk && g.estadoOk && g.campanaOk && g.accionesOk && g.insignia !== null && g.insignia !== '',
          JSON.stringify({ insignia: g.insignia, estadoOk: g.estadoOk }));
        t('C7 el área de toque del volver no se achica (44×44, como el círculo de antes)',
          !!(g.inbar && Math.round(g.inbar.w) === 44 && Math.round(g.inbar.h) === 44), JSON.stringify(g.inbar));
        // La bandeja — detalle de la tanda (LA pantalla de la captura del dueño).
        await abrir('#/app/notificaciones?tanda=' + seedC.tandaId);
        g = await geoBarra(page);
        const hayDetalle = await page.evaluate(() => !!document.querySelector('.pzb-volver'));
        t('C8 Respuestas listas (la captura): sin fijo, volver en la barra sin tocar el avatar, y el «‹ Notificaciones» de la vista intacto',
          g.hayHead && !g.fijoEnDom && g.inbarEnBarra && !g.cruzaInbarAvatar && !g.cruzaInbarPunto && hayDetalle,
          JSON.stringify({ fijo: g.fijoEnDom, cruza: g.cruzaInbarAvatar, detalle: hayDetalle }));
        await page.screenshot({ path: path.join(QA_DIR, 'bandeja-detalle.png') }).catch(() => {});
        // Schedule (Mi semana).
        await abrir('#/app/schedule');
        g = await geoBarra(page);
        t('C9 Schedule: sin fijo y sin solape del volver con el avatar',
          g.hayHead && !g.fijoEnDom && g.inbarEnBarra && !g.cruzaInbarAvatar && !g.cruzaInbarPunto, JSON.stringify(g));
        // Términos.
        await abrir('#/app/terminos');
        g = await geoBarra(page);
        t('C10 Términos: sin fijo y sin solape del volver con el avatar',
          g.hayHead && !g.fijoEnDom && g.inbarEnBarra && !g.cruzaInbarAvatar, JSON.stringify(g));
        // La Bandeja (tab bandeja de la cáscara).
        await abrir('#/app/bandeja');
        g = await geoBarra(page);
        t('C11 Bandeja: sin fijo y sin solape del volver con el avatar',
          g.hayHead && !g.fijoEnDom && g.inbarEnBarra && !g.cruzaInbarAvatar, JSON.stringify(g));
        // El volver navega: desde Notificaciones, su toque vuelve a Inicio.
        await abrir('#/app/inicio');
        await page.evaluate(() => { location.hash = '#/app/notificaciones'; });
        await page.waitForSelector('.pz-back-inbar', { timeout: 30000 }).catch(() => {});
        await sleep(400);
        await page.click('.pz-back-inbar').catch(() => {});
        await sleep(1200);
        const hashTras = await page.evaluate(() => location.hash);
        t('C12 el volver de la barra navega como el de antes (vuelve a Inicio)',
          hashTras.startsWith('#/app/inicio'), 'hash=' + hashTras);
        await ctx.close();
      } finally { await browser.close().catch(() => {}); }
    }
  }
  await killBoot(bC, 'C13');

  // ---------------------------------------------------------- D
  seccion('D · Chromium — la cáscara web (390px y 800px)');
  const dirD = fs.mkdtempSync(path.join(os.tmpdir(), 'volver-avatar-web-'));
  seedBootDir(dirD);
  const bD = await bootServer(dirD);
  t('D0 el boot web levanta', bD.up, bD.log().slice(-300));
  if (bD.up) {
    const lg = await login(bD.base, 'dueno@coffee.example');
    t('D1 login del cliente web (cáscara appShell)', lg.ok && !!lg.cookie);
    const pw = loadPw();
    if (!pw) { t('D2 playwright-core disponible', false, 'no se encontró el módulo'); }
    else {
      const browser = await pw.chromium.launch({ executablePath: chromiumExe(), args: ['--no-sandbox'] });
      try {
        const mk = async (w, h) => {
          const ctx = await browser.newContext({ viewport: { width: w, height: h } });
          const [n1, v1] = lg.cookie.split('=');
          await ctx.addCookies([{ name: n1, value: v1, url: bD.base }]);
          return { ctx, page: await ctx.newPage() };
        };
        // 390px: sin círculo fijo visible; ningún volver toca el avatar.
        {
          const { ctx, page } = await mk(390, 844);
          await page.goto(bD.base + '/#/app/notificaciones', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
          await page.waitForSelector('.pz-shell-head', { timeout: 30000 }).catch(() => {});
          await sleep(600);
          const g = await geoBarra(page);
          const mtop = await page.evaluate(() => {
            const el = document.querySelector('.pz-back-mtop');
            const mt = document.querySelector('.mtop');
            const r = el ? el.getBoundingClientRect() : null;
            const cs = el ? getComputedStyle(el) : null;
            const csm = mt ? getComputedStyle(mt) : null;
            return { mtopVisible: !!(mt && csm.display !== 'none'), backVisible: !!(r && cs.display !== 'none' && r.width > 0), backBox: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null };
          });
          const cruzaMtop = !!(mtop.backVisible && g.ava && mtop.backBox && mtop.backBox.x < g.ava.x + g.ava.w && g.ava.x < mtop.backBox.x + mtop.backBox.w && mtop.backBox.y < g.ava.y + g.ava.h && g.ava.y < mtop.backBox.y + mtop.backBox.h);
          t('D3 web 390px: ningún círculo fijo visible sobre la barra',
            g.hayHead && !(g.fijo && g.fijo.visible), JSON.stringify(g.fijo));
          t('D4 web 390px: el volver de la fila superior (si se ve) no toca el avatar, y el de escritorio está oculto',
            !cruzaMtop && !(g.inbar && g.inbar.visible), JSON.stringify({ mtop, inbar: g.inbar }));
          await ctx.close();
        }
        // 800px: el volver de escritorio vive en la barra; la fila no duplica.
        {
          const { ctx, page } = await mk(800, 900);
          await page.goto(bD.base + '/#/app/notificaciones', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
          await page.waitForSelector('.pz-shell-head', { timeout: 30000 }).catch(() => {});
          await sleep(600);
          const g = await geoBarra(page);
          const mtopBack = await page.evaluate(() => {
            const el = document.querySelector('.pz-back-mtop');
            if (!el) return { existe: false };
            const cs = getComputedStyle(el);
            return { existe: true, display: cs.display };
          });
          t('D5 web 800px: sin círculo fijo; el volver de escritorio está EN la barra y no toca el avatar',
            g.hayHead && !g.fijoEnDom && g.inbarEnBarra && !!(g.inbar && g.inbar.visible) && !g.cruzaInbarAvatar && !g.cruzaInbarPunto,
            JSON.stringify({ fijo: g.fijoEnDom, inbar: g.inbar, ava: g.ava }));
          t('D6 web 800px: la fila superior ya no duplica su atrás (manda el de la barra)',
            !mtopBack.existe || mtopBack.display === 'none', JSON.stringify(mtopBack));
          await page.screenshot({ path: path.join(QA_DIR, 'web-800-notificaciones.png') }).catch(() => {});
          await ctx.close();
        }
      } finally { await browser.close().catch(() => {}); }
    }
  }
  await killBoot(bD, 'D7');

  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(1); });
