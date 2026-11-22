// =====================================================================
// LOTE BARRA-VIVA — suite propia (boot real + Chromium)
// La barra superior viva (estado real en la segunda línea + la campana
// con su puerta por sesión), INICIO-STICKY, el estándar de carga (el
// rayo + la línea que dice qué pasa) y la palabra «Subir» en el botón
// central. Base: HEAD 851e4956 (v1219 · CONSERJE-FORMA).
//
//   A · Estática — definiciones, M78 (toda función llamada desde la
//       barra existe), el subtítulo fijo fuera de la barra, el rayo en
//       el arranque, la rama del router.
//   B · HTTP contra el boot real — la sonda de la campana por sesión
//       y las fuentes del estado (ritual / idea).
//   C · Chromium — los tres estados sembrados, la barra fija al
//       scrollear, la campana en las dos sesiones, la carga forzada
//       con el rayo + la línea, «Subir» sin glifo, el teléfono sin
//       desborde, y el shell clásico con su carga ya no muda.
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
function buscarPuerto() {
  for (let p = 36100; p < 36300; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}
function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  } catch (e) { return true; }
}

// ---------------------------------------------------------------------
seccion('A · Estática');
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A0 node --check public/app.js', true); }
catch (e) { t('A0 node --check public/app.js', false, String(e.message).slice(0, 200)); }

const nuevas = ['pzBarraEn', 'pzBarraEstadoComputar', 'pzBarraEstadoPintar', 'pzBarraEstadoRefrescar',
  'pzBarraTextoCarga', 'pzBarraEstadoCarga', 'pzBarraCasaCache', 'pzBarraPuertaKick',
  'pzBarraCampanaPintar', 'pzBarraCampana', 'pzBarraHace', 'pzBarraFechaMs', 'pzNotificacionesView'];
const faltan = nuevas.filter((f) => (appJs.match(new RegExp('function ' + f + '\\(', 'g')) || []).length !== 1);
t('A1 las 13 funciones nuevas existen definidas exactamente una vez', faltan.length === 0, faltan.join(','));

const headSlice = appJs.slice(appJs.indexOf('function pzShellHeadHTML'), appJs.indexOf('function pzShellDatosHoy'));
t('A2 la barra pinta la línea de estado (pzShellState) y la campana llama a pzBarraCampana',
  headSlice.includes('id="pzShellState"') && headSlice.includes('onclick="pzBarraCampana()"'));
t('A3 el subtítulo fijo «tu community manager» ya NO se pinta en la barra',
  !headSlice.includes("en ? 'your community manager' : 'tu community manager'"));
t('A4 M78: los destinos de la barra existen (rsShareOpen, bbGo) y los glifos también (bell, bolt)',
  /function rsShareOpen\(/.test(appJs) && /function bbGo\(/.test(appJs)
  && appJs.includes("pzIc('bell', 18)") && appJs.includes("pzIc('bolt', 34)"));
t('A5 el router conoce la ruta notificaciones y la vista existe',
  appJs.includes("tab === 'notificaciones'") && appJs.includes('pzNotifTanda'));
t('A6 el estándar de carga: el esqueleto pinta el rayo y la línea por pantalla; ningún shell carga mudo',
  appJs.includes("pzIc('bolt', 34)") && appJs.includes('pzBarraTextoCarga(tab)')
  && !appJs.includes('if (!BB_SHELL_ON()) return;'));
t('A7 el arranque pinta el rayo (index.html) y la ruedita vieja no existe más',
  idx.includes('pz-boot-ray') && !idx.includes('pz-boot-spin') && !appJs.includes('pz-boot-spin'));
t('A8 «Subir» es la palabra en los dos shells y el CSS trae la pantalla de Notificaciones',
  appJs.includes('bb-tab-subir-word') && appJs.includes('mz-tab-subir-word')
  && css.includes('.pz-notif-band') && css.includes('.bb-tab-subir-word'));
t('A9 los estados salen de datos reales (las tres fuentes están en el código)',
  appJs.includes("api.get('/api/subir/idea')") && appJs.includes('__pzShellHoyPromise')
  && appJs.includes("api.get('/api/conserje/puerta')"));

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) { /* ya existe (la crea oficina.js al bootear) */ }
require(path.join(ROOT, 'guest-trial')).ensureSchema(db); // columnas del invitado (is_guest, guest_ig, guest_domain)
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, planStatus, shell, extra) {
  const e = extra || {};
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
    VALUES (?, ?, ?, 'posty', ?, 0, 0, 0, NULL, NULL, ?, 'es', 1, '2026-09-01 10:00:00')\`).run(id, email, hash, planStatus, shell);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)')
    .run(id, e.nombre || '', e.ig || '', 'café');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(12, 'dueno@barra.test', 'active', 1, { nombre: 'Posty', ig: 'posty.communitymanager' });
usuario(501, 'pedido@barra.test', 'active', 1, { nombre: 'Café Pedido', ig: 'cafepedido' });
usuario(502, 'listo@barra.test', 'active', 1, { nombre: 'Café Listo', ig: 'cafelisto' });
usuario(503, 'armando@barra.test', 'active', 1, { nombre: 'Café Armando', ig: 'cafearmando' });
usuario(504, 'clasico@barra.test', 'active', 0, { nombre: 'Café Clásico', ig: 'cafeclasico' });
const f = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
// 501 · un pedido escrito EN CURSO (estado 'recibida')
db.prepare("INSERT INTO subir_ideas (user_id, message_id, texto, estado) VALUES (501, 1, 'quiero un posteo del brunch del sábado', 'recibida')").run();
// 501 · historial publicado (para que Inicio tenga scroll real)
for (let d = 1; d <= 9; d++) {
  const cuando = new Date(Date.now() - d * 86400000);
  db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at, created_at)
    VALUES (501, '/media/semilla.jpg', ?, 'published', 'image', ?, ?, ?)\`)
    .run('El posteo del día ' + d + ' de Café Pedido.', f(cuando), f(cuando), f(cuando));
}
// 502 · el posteo de hoy YA SALIÓ (publicado hace ~1 hora)
const ahora = new Date(Date.now() - 3600000);
db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at, created_at)
  VALUES (502, '/media/semilla.jpg', 'El Classic Espresso de hoy, como todos los días.', 'published', 'image', ?, ?, ?)\`)
  .run(f(new Date()), f(ahora), f(ahora));
console.log('semilla ok');
`;

async function main() {
  seccion('B · Boot real + HTTP');
  const PORT = buscarPuerto();
  t('B0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) { console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); }
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'barra-viva-boot-'));
  const seedFile = path.join(os.tmpdir(), 'barra-viva-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });

  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-barra', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverPid = child.pid;
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += String(d); });
  child.stderr.on('data', (d) => { serverLog += String(d); });
  const base = 'http://127.0.0.1:' + PORT;

  async function login(email) {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ClaveQA123' }),
    });
    const setCookie = r.headers.get('set-cookie') || '';
    const m = setCookie.match(/^([^=]+)=([^;]+)/);
    return { status: r.status, cookie: m ? { name: m[1], value: m[2] } : null, header: setCookie.split(';')[0] };
  }
  async function getJson(p, cookieHeader) {
    const r = await fetch(base + p, { headers: cookieHeader ? { Cookie: cookieHeader } : {} });
    let j = null; try { j = await r.json(); } catch (e) { /* no json */ }
    return { status: r.status, json: j };
  }

  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) { /* todavía */ }
      if (!up) await new Promise((res) => setTimeout(res, 500));
    }
    t('B1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));

    const sesCasa = await login('dueno@barra.test');
    const ses501 = await login('pedido@barra.test');
    const ses502 = await login('listo@barra.test');
    t('B2 login de la casa y de los clientes', !!(sesCasa.cookie && ses501.cookie && ses502.cookie),
      'casa ' + sesCasa.status + ' · 501 ' + ses501.status + ' · 502 ' + ses502.status);

    const puertaCasa = await getJson('/api/conserje/puerta', sesCasa.header);
    const puerta501 = await getJson('/api/conserje/puerta', ses501.header);
    t('B3 la sonda de la campana: la casa dice sí, el cliente dice no',
      puertaCasa.json && puertaCasa.json.casa === true && puerta501.json && puerta501.json.casa === false,
      JSON.stringify([puertaCasa.json, puerta501.json]));

    const ritual502 = await getJson('/api/ritual/hoy', ses502.header);
    t('B4 la fuente del estado «todo al día»: el ritual de 502 marca publicado_hoy',
      !!(ritual502.json && ritual502.json.publicado_hoy === true), JSON.stringify(ritual502.json).slice(0, 200));

    const idea501 = await getJson('/api/subir/idea', ses501.header);
    t('B5 la fuente del estado «pedido en curso»: la idea de 501 está recibida',
      !!(idea501.json && idea501.json.idea && idea501.json.idea.estado === 'recibida'),
      JSON.stringify(idea501.json).slice(0, 200));

    // ---------------- C · Chromium ----------------
    seccion('C · Chromium');
    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); if (pw) break; } catch (e) { /* siguiente */ }
    }
    t('C0 playwright-core disponible', !!pw);
    if (pw) {
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      let exe = null;
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
      const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const mkCtx = async (ses, viewport) => {
        const ctx = await browser.newContext(viewport ? { viewport } : {});
        await ctx.addCookies([{ name: ses.cookie.name, value: ses.cookie.value, url: base }]);
        return ctx;
      };
      const esperarEstado = async (page, texto, ms) => {
        try {
          await page.waitForFunction((tx) => {
            const el = document.getElementById('pzShellState');
            return el && el.textContent.trim() === tx;
          }, texto, { timeout: ms || 30000 });
          return true;
        } catch (e) { return false; }
      };

      // — 501 · pedido en curso —
      const ctx501 = await mkCtx(ses501);
      const p501 = await ctx501.newPage();
      await p501.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await p501.waitForSelector('.pz-shell-head', { timeout: 20000 });
      const head501 = await p501.evaluate(() => {
        const h = document.querySelector('.pz-shell-head');
        const ava = h.querySelector('.pz-shell-ava').getBoundingClientRect();
        const ics = [...h.querySelectorAll('.pz-shell-ic')].map((b) => Math.round(b.getBoundingClientRect().width));
        return { txt: h.textContent, ava: Math.round(ava.width), ics, bell: !!h.querySelector('#pzShellBell'), bellSvg: !!h.querySelector('#pzShellBell svg') };
      });
      t('C1 la barra trae avatar grande, tres botones chicos (campana incluida) y ningún subtítulo fijo',
        head501.ava >= 40 && head501.ics.length === 3 && head501.ics.every((w) => w <= 36)
        && head501.bell && head501.bellSvg && !head501.txt.includes('tu community manager'),
        JSON.stringify(head501));
      t('C2 el estado de 501 es el de su pedido en curso',
        await esperarEstado(p501, 'trabajando en tu pedido…'),
        await p501.evaluate(() => (document.getElementById('pzShellState') || {}).textContent));

      // — INICIO-STICKY: la barra queda; el contenido pasa —
      try {
        await p501.waitForFunction(() => document.documentElement.scrollHeight > window.innerHeight + 400, null, { timeout: 20000 });
      } catch (e) { /* el evaluate de abajo registra el scroll real alcanzado */ }
      const sticky = await p501.evaluate(async () => {
        window.scrollTo(0, 900);
        await new Promise((r) => setTimeout(r, 350));
        if (window.scrollY < 100) { window.scrollTo(0, 900); await new Promise((r) => setTimeout(r, 350)); }
        const head = document.querySelector('.pz-shell-head').getBoundingClientRect();
        const fijos = [];
        document.querySelectorAll('*').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
          const r = el.getBoundingClientRect();
          // Solo cuentan BARRAS (alto de barra, no overlays de pantalla completa)
          if (r.top <= 1 && r.width > 200 && r.height > 0 && r.height < 120) fijos.push(el.className || el.tagName);
        });
        return { top: head.top, scrollY: window.scrollY, fijos };
      });
      t('C3 INICIO-STICKY: scrolleando, arriba queda SOLO la barra entera',
        sticky.scrollY > 300 && sticky.top === 0 && sticky.fijos.length === 1 && String(sticky.fijos[0]).includes('pz-shell-head'),
        JSON.stringify(sticky));

      // — la palabra «Subir» —
      const nav = await p501.evaluate(() => {
        const subir = document.querySelector('.bb-tab-subir');
        const tabs = [...document.querySelectorAll('.bb-bar .bb-tab')];
        return {
          subirTxt: subir ? subir.textContent.trim() : '',
          subirSvg: subir ? !!subir.querySelector('svg') : null,
          otrosSvg: tabs.filter((x) => !x.classList.contains('bb-tab-subir')).map((x) => !!x.querySelector('svg')),
        };
      });
      t('C4 el botón central dice «Subir» sin glifo; Inicio y Ads conservan su ícono de hilo',
        nav.subirTxt === 'Subir' && nav.subirSvg === false && nav.otrosSvg.length === 2 && nav.otrosSvg.every(Boolean),
        JSON.stringify(nav));

      // — 502 · todo al día + la campana abre Notificaciones —
      const ses502b = ses502;
      const ctx502 = await mkCtx(ses502b);
      const p502 = await ctx502.newPage();
      await p502.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await p502.waitForSelector('.pz-shell-head', { timeout: 20000 });
      t('C5 el estado de 502 es «todo al día» (su posteo ya salió)',
        await esperarEstado(p502, 'todo al día'),
        await p502.evaluate(() => (document.getElementById('pzShellState') || {}).textContent));
      await p502.click('#pzShellBell');
      await p502.waitForSelector('.pz-notif-band', { timeout: 20000 });
      const notif = await p502.evaluate(() => {
        const tanda = document.getElementById('pzNotifTanda');
        return {
          titulo: document.querySelector('.pz-notif-band h2').textContent,
          cuerpo: document.querySelector('.pz-notif').textContent,
          tandaExiste: !!tanda,
          tandaHijos: tanda ? tanda.children.length : -1,
        };
      });
      t('C6 la campana del cliente abre Notificaciones con la novedad real de su posteo',
        notif.titulo === 'Notificaciones' && notif.cuerpo.includes('Tu posteo de hoy salió')
        && notif.tandaExiste && notif.tandaHijos === 0,
        notif.cuerpo.slice(0, 160));

      // — 503 · armando + novedades vacías honestas —
      const ses503 = await login('armando@barra.test');
      const ctx503 = await mkCtx(ses503);
      const p503 = await ctx503.newPage();
      await p503.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await p503.waitForSelector('.pz-shell-head', { timeout: 20000 });
      t('C7 el estado de 503 es «armando el posteo de hoy…»',
        await esperarEstado(p503, 'armando el posteo de hoy…', 45000),
        await p503.evaluate(() => (document.getElementById('pzShellState') || {}).textContent));
      await p503.click('#pzShellBell');
      await p503.waitForSelector('.pz-notif-band', { timeout: 20000 });
      const vacio = await p503.evaluate(() => document.querySelector('.pz-notif').textContent);
      t('C8 sin hechos, Notificaciones muestra el vacío honesto (nada inventado)',
        vacio.includes('Todavía no hay novedades'), vacio.slice(0, 160));

      // — la casa · la campana es el Conserje —
      const ctxCasa = await mkCtx(sesCasa);
      const pCasa = await ctxCasa.newPage();
      await pCasa.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pCasa.waitForSelector('.pz-shell-head', { timeout: 20000 });
      let cloche = false;
      try {
        await pCasa.waitForFunction(() => {
          const b = document.getElementById('pzShellBell');
          return b && b.classList.contains('es-casa') && b.getAttribute('aria-label') === 'Conserje';
        }, null, { timeout: 15000 });
        cloche = true;
      } catch (e) { /* queda false */ }
      t('C9 con sesión de la casa, la campana se vuelve la bandeja del Conserje', cloche);
      await pCasa.click('#pzShellBell');
      let urlCasa = '';
      try { await pCasa.waitForURL(/\/conserje/, { timeout: 15000 }); urlCasa = pCasa.url(); } catch (e) { urlCasa = pCasa.url(); }
      t('C10 la campana de la casa abre el Conserje', urlCasa.includes('/conserje'), urlCasa);

      // — carga forzada · el rayo + la línea (shell bb) —
      const ctxAds = await mkCtx(ses502b);
      const pAds = await ctxAds.newPage();
      await pAds.route('**/api/ads/**', async (route) => {
        await new Promise((r) => setTimeout(r, 3500));
        try { await route.continue(); } catch (e) { /* la página ya siguió */ }
      });
      await pAds.goto(base + '/#/app/ads', { waitUntil: 'domcontentloaded' });
      let carga = { rayo: false, linea: '' };
      try {
        await pAds.waitForSelector('.pz-load .pz-spin svg', { timeout: 12000 });
        carga = await pAds.evaluate(() => ({
          rayo: !!document.querySelector('.pz-load .pz-spin svg'),
          linea: (document.getElementById('pzShellState') || {}).textContent || '',
        }));
      } catch (e) { /* queda en false */ }
      t('C11 ninguna carga muda: la carga forzada muestra el rayo y la barra dice qué carga',
        carga.rayo && carga.linea.trim() === 'cargando tus impulsos…', JSON.stringify(carga));
      await pAds.unroute('**/api/ads/**');

      // — teléfono · sin desborde —
      const ctxTel = await mkCtx(ses502b, { width: 390, height: 844 });
      const pTel = await ctxTel.newPage();
      await pTel.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await pTel.waitForSelector('.pz-shell-head', { timeout: 20000 });
      await esperarEstado(pTel, 'todo al día');
      const telIni = await pTel.evaluate(() => {
        const small = document.getElementById('pzShellState');
        return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, smallSW: small.scrollWidth, smallCW: small.clientWidth };
      });
      await pTel.click('#pzShellBell');
      await pTel.waitForSelector('.pz-notif-band', { timeout: 20000 });
      const telNot = await pTel.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      t('C12 teléfono: la barra se lee entera (el estado entra en su línea) y nada desborda',
        telIni.sw <= telIni.iw + 1 && telIni.smallSW <= telIni.smallCW + 1 && telNot.sw <= telNot.iw + 1,
        JSON.stringify({ telIni, telNot }));

      // — shell clásico · la carga ya no es muda y «Subir» es la palabra —
      const ses504 = await login('clasico@barra.test');
      const ctx504 = await mkCtx(ses504, { width: 390, height: 844 });
      const p504 = await ctx504.newPage();
      await p504.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await p504.waitForSelector('.mz-tabs', { timeout: 20000 });
      const mz = await p504.evaluate(() => {
        const s = document.querySelector('.mz-tab-subir');
        return { txt: s ? s.textContent.trim() : '', svg: s ? !!s.querySelector('svg') : null, head: !!document.querySelector('.pz-shell-head') };
      });
      t('C13 shell clásico: el centro dice «Subir» sin glifo y la barra viva también vive ahí',
        mz.txt === 'Subir' && mz.svg === false && mz.head, JSON.stringify(mz));
      await p504.route('**/api/ads/**', async (route) => {
        await new Promise((r) => setTimeout(r, 3500));
        try { await route.continue(); } catch (e) { /* siguió */ }
      });
      await p504.goto(base + '/#/app/ads', { waitUntil: 'domcontentloaded' });
      let cargaClasica = false;
      try {
        await p504.waitForSelector('.pz-load .pz-spin svg', { timeout: 12000 });
        cargaClasica = true;
      } catch (e) { /* queda false */ }
      t('C14 shell clásico: la carga forzada tampoco es muda (el rayo aparece)',
        cargaClasica);
      await browser.close();
    }
  } catch (e) {
    t('B/C sin excepción', false, String(e && e.message || e));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) { /* ya murió */ }
    await new Promise((res) => setTimeout(res, 1200));
    let vivo = true;
    try { process.kill(serverPid, 0); } catch (e) { vivo = false; }
    if (vivo) { try { process.kill(serverPid, 'SIGKILL'); } catch (e) { /* nada */ } }
    t('B6 el boot murió por su PID exacto y el puerto quedó libre', !vivo && puertoLibre(PORT));
    try { fs.unlinkSync(seedFile); } catch (e) { /* nada */ }
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}

main();
