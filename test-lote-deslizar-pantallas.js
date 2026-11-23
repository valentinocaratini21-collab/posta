// =====================================================================
// LOTE DESLIZAR-PANTALLAS — suite propia (boot real + Chromium)
// Deslizando para los costados se pasa entre Inicio · Subir · Ads, en
// el orden de la barra inferior, en los dos sentidos y sin envoltura
// circular. El gesto vive en public/app.js (familia pzSwipe, junto a
// pzPull) y navega por bbGo, la vía de siempre.
// Base: HEAD 5bb24579 (v1221 · BARRA-VIVA).
//
//   A · Estática — las 6 funciones nuevas una sola vez, umbrales,
//       guardas, la navegación por bbGo, el encendido junto a pzPull
//       y el conteo de definiciones del bundle (1734 → 1740).
//   B · Boot real + HTTP — el servidor levanta, la sesión entra y el
//       bundle servido trae el gesto.
//   C · Chromium 390px — el gesto EJERCITADO con eventos táctiles
//       reales (CDP): la ida y la vuelta completas, los extremos sin
//       envoltura, la tira de la semana, el scroll vertical, la hoja
//       de compartir abierta, el chip de monto de Ads, el campo de
//       Subir, el arranque sobre la barra (los dos shells) y el click
//       sintético comido sobre una tarjeta de la grilla.
//
// Control contra la base prístina: DESLIZAR_ROOT=<árbol base>
// DESLIZAR_CONTROL=1 — el mismo recorrido declara la AUSENCIA del
// gesto (el deslizamiento no navega en la base).
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = process.env.DESLIZAR_ROOT || __dirname;
const CONTROL = process.env.DESLIZAR_CONTROL === '1';
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function buscarPuerto() {
  for (let p = 37100; p < 37300; p++) {
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
try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A0 node --check public/app.js', true); }
catch (e) { t('A0 node --check public/app.js', false, String(e.message).slice(0, 200)); }

const nuevas = ['pzSwipeTab', 'pzSwipeOverlayOpen', 'pzSwipeInHScroller', 'pzSwipeCanStart', 'pzSwipeNav', 'pzSwipeInit'];
if (!CONTROL) {
  const faltan = nuevas.filter((f) => (appJs.match(new RegExp('function ' + f + '\\(', 'g')) || []).length !== 1);
  t('A1 las 6 funciones del gesto existen definidas exactamente una vez', faltan.length === 0, faltan.join(','));
  const i0 = appJs.indexOf('/* ---------- DESLIZAR-PANTALLAS');
  const i1 = appJs.indexOf('/* ---------- ZOOM-2');
  const bloque = (i0 >= 0 && i1 > i0) ? appJs.slice(i0, i1) : '';
  t('A2 el bloque del gesto existe entre pzPull y ZOOM-2', bloque.length > 2000, 'largo ' + bloque.length);
  t('A3 umbrales declarados: 72 px · dominancia 2:1 · 900 ms · orden Inicio·Subir·Ads',
    bloque.includes('const PZ_SWIPE_MIN_DX = 72;') && bloque.includes('const PZ_SWIPE_DOM = 2;')
    && bloque.includes('const PZ_SWIPE_MAX_MS = 900;')
    && bloque.includes("const PZ_SWIPE_TABS = ['inicio', 'subir', 'ads'];"));
  t('A4 el cambio navega por bbGo (la vía de siempre) y el bloque no asigna location.hash',
    bloque.includes("bbGo('#/app/' + PZ_SWIPE_TABS[j])") && !bloque.includes('location.hash ='));
  t('A5 las guardas están: scroller horizontal, chips de Ads, formulario, barras y hojas',
    bloque.includes('pzSwipeInHScroller') && bloque.includes("'.pz-ads-amount'") && bloque.includes("'[data-monto]'")
    && bloque.includes('pzPullIsFormControl') && bloque.includes("'.bb-bar'") && bloque.includes("'.mz-tabs'")
    && bloque.includes('pubsheet-ov') && bloque.includes('rsShareSheet') && bloque.includes('mz-sheet-open'));
  t('A6 los listeners táctiles son pasivos y el encendido va junto al de pzPull',
    (bloque.match(/passive: true/g) || []).length >= 4
    && appJs.includes('try { pzPullInit(); } catch (e) {}\ntry { pzSwipeInit(); } catch (e) {}'));
  const defs = (appJs.match(/function [A-Za-z_$][A-Za-z0-9_$]*\(/g) || []).length;
  t('A7 el bundle conserva sus definiciones: 1734 de la base + 6 nuevas = 1740', defs === 1740, 'cuenta ' + defs);
} else {
  t('A1 control: el gesto NO existe en la base prístina', !appJs.includes('pzSwipeInit') && !appJs.includes('DESLIZAR-PANTALLAS'));
  const defs = (appJs.match(/function [A-Za-z_$][A-Za-z0-9_$]*\(/g) || []).length;
  t('A2 control: la base tiene sus 1734 definiciones', defs === 1734, 'cuenta ' + defs);
}

// ---------------------------------------------------------------------
const SEED_BOOT = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
// Medio REAL en disco: con la ruta fantasma el detalle del posteo
// descarta el medio (el archivo no existe) y el carrusel no pinta su
// pista. Un JPEG válido de 1×1 alcanza para la mecánica.
const mediaDir = path.join(process.argv[2], 'media');
require('fs').mkdirSync(mediaDir, { recursive: true });
const semillaJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==', 'base64');
require('fs').writeFileSync(path.join(mediaDir, 'semilla.jpg'), semillaJpg);
require('fs').writeFileSync(path.join(mediaDir, 'semilla2.jpg'), semillaJpg);
require('fs').writeFileSync(path.join(mediaDir, 'semilla3.jpg'), semillaJpg);
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, shell, ig) {
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
    VALUES (?, ?, ?, 'posty', 'active', 0, 0, 0, NULL, NULL, ?, 'es', 1, '2026-09-01 10:00:00')\`).run(id, email, hash, shell);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)')
    .run(id, 'Café Deslizar', ig, 'café');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(601, 'deslizar@qa.test', 1, 'cafedeslizar');
usuario(602, 'clasico@qa.test', 0, 'cafeclasico');
usuario(603, 'semana@qa.test', 1, 'cafesemana');
const f = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
// 601 · historial publicado (la grilla de Inicio, para el click comido)
for (let d = 1; d <= 6; d++) {
  const cuando = new Date(Date.now() - d * 86400000);
  db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at, created_at)
    VALUES (601, '/media/semilla.jpg', ?, 'published', 'image', ?, ?, ?)\`)
    .run('El posteo publicado ' + d + ' de Café Deslizar.', f(cuando), f(cuando), f(cuando));
}
// 601 · la semana alrededor de hoy (la tira de la semana, horizontal)
for (let d = -3; d <= 3; d++) {
  const cuando = new Date(Date.now() + d * 86400000);
  cuando.setHours(19, 0, 0, 0);
  db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at, created_at)
    VALUES (601, '/media/semilla.jpg', ?, 'scheduled', 'image', ?, NULL, ?)\`)
    .run('El posteo de la semana (corrimiento ' + d + ').', f(cuando), f(new Date()));
}
// 603 · SOLO programados, sin publicados ni espejo: su Inicio cae en la
// rama de la semana (homeWeekHTML) y pinta la tira #hsWeekList.
for (let d = -3; d <= 3; d++) {
  const cuando = new Date(Date.now() + d * 86400000);
  cuando.setHours(19, 0, 0, 0);
  db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, scheduled_at, published_at, created_at)
    VALUES (603, '/media/semilla.jpg', ?, 'scheduled', 'image', ?, NULL, ?)\`)
    .run('El posteo de la semana de Café Semana (corrimiento ' + d + ').', f(cuando), f(new Date()));
}
// 601 · un carrusel publicado: su detalle abre la pista horizontal real
// de la app (.hf-d-track), el scroller del caso C10/C11.
const carIns = db.prepare(\`INSERT INTO posts (user_id, image_path, caption, status, media_type, carousel_paths, scheduled_at, published_at, created_at)
  VALUES (601, '/media/semilla.jpg', 'El carrusel de la semana.', 'published', 'carousel', ?, NULL, ?, ?)\`)
  .run(JSON.stringify(['/media/semilla.jpg', '/media/semilla2.jpg', '/media/semilla3.jpg']), f(new Date(Date.now() - 2 * 86400000)), f(new Date(Date.now() - 2 * 86400000)));
require('fs').writeFileSync(process.argv[2] + '/carousel-id.txt', String(carIns.lastInsertRowid));
console.log('semilla ok');
`;

async function main() {
  seccion('B · Boot real + HTTP');
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-deslizar-'));
  const seedFile = path.join(os.tmpdir(), 'deslizar-seed-' + process.pid + '.js');
  fs.writeFileSync(seedFile, SEED_BOOT);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { stdio: 'pipe' });
  const CAR_ID = fs.readFileSync(path.join(tmpD, 'carousel-id.txt'), 'utf8').trim();
  // El puerto se elige DESPUÉS de sembrar y se verifica que el listener
  // sea MI proceso: hay lotes vecinos probando en paralelo y un boot
  // ajeno puede ganar el puerto en la ventana entre el escaneo y el
  // spawn (pasó: los logins daban 401 contra el servidor de otro lote).
  let child = null;
  let PORT = 0;
  let base = '';
  let bootLog = '';
  for (let intento = 0; intento < 3 && !child; intento++) {
    const p = buscarPuerto();
    if (!p) break;
    const cand = spawn(process.execPath, ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(p), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-deslizar', DEMO_AI_DAILY_CAP_USD: '0', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', SUPERVISION_HOOK_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    bootLog = '';
    cand.stdout.on('data', (d) => { bootLog += d; });
    cand.stderr.on('data', (d) => { bootLog += d; });
    const baseCand = 'http://127.0.0.1:' + p;
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try { const r = await fetch(baseCand + '/api/version'); up = r.status === 200; } catch (e) { await sleep(500); }
    }
    let esMio = false;
    if (up) {
      try {
        const out = execFileSync('ss', ['-ltnp'], { encoding: 'utf8' });
        const linea = out.split('\n').find((l) => l.includes(':' + p + ' ')) || '';
        esMio = linea.includes('pid=' + cand.pid);
      } catch (e) { /* sin ss no se puede verificar: se descarta */ }
    }
    if (up && esMio) { child = cand; PORT = p; base = baseCand; }
    else { try { process.kill(cand.pid, 'SIGKILL'); } catch (e) { /* ya murió */ } }
  }
  try {
    t('B0 hay un puerto libre verificado con ss', PORT > 0, 'puerto ' + PORT);
    t('B1 el servidor levanta, responde /api/version y el puerto es de ESTE boot', !!child, bootLog.slice(-300));
    async function login(email) {
      const r = await fetch(base + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'ClaveQA123' }),
      });
      const sc = r.headers.get('set-cookie') || '';
      const m = sc.match(/([^=]+)=([^;]+)/);
      return { status: r.status, cookie: m ? { name: m[1], value: m[2] } : null };
    }
    const ses601 = await login('deslizar@qa.test');
    const ses602 = await login('clasico@qa.test');
    const ses603 = await login('semana@qa.test');
    t('B2 login de las tres cuentas (bb, clásico y semana)', !!(ses601.cookie && ses602.cookie && ses603.cookie), 'status ' + ses601.status + '/' + ses602.status + '/' + ses603.status);
    const bundle = await (await fetch(base + '/app.js')).text();
    t(CONTROL ? 'B3 control: el bundle servido NO trae el gesto' : 'B3 el bundle servido trae el gesto (pzSwipeInit)',
      CONTROL ? !bundle.includes('pzSwipeInit') : bundle.includes('pzSwipeInit'));

    // -----------------------------------------------------------------
    seccion('C · Chromium — el gesto ejercitado');
    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); if (pw) break; } catch (e) { /* siguiente */ }
    }
    t('C0 playwright-core disponible', !!pw);
    if (pw) {
      const basePw = path.join(os.homedir(), '.cache/ms-playwright');
      let exe = null;
      try {
        for (const dir of fs.readdirSync(basePw)) {
          const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
          if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
        }
      } catch (e) { /* sin caché local */ }
      const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
      const mkCtx = async (ses) => {
        const ctx = await browser.newContext({
          viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        });
        await ctx.addCookies([{ name: ses.cookie.name, value: ses.cookie.value, url: base }]);
        return ctx;
      };
      const hashDe = (page) => page.evaluate(() => location.hash);
      const esperarHash = async (page, prefijo, ms) => {
        try { await page.waitForFunction((h) => location.hash.startsWith(h), prefijo, { timeout: ms || 9000 }); return true; }
        catch (e) { return false; }
      };
      // Los positivos navegan con UN reintento declarado: con la
      // máquina cargada, un gesto sintético puede caer en una ventana
      // muerta de render; un dedo real que no obtiene respuesta repite
      // el gesto. El detalle del caso dice si hubo reintento.
      const deslizarHasta = async (page, x1, y1, x2, y2, prefijo) => {
        await deslizar(page, x1, y1, x2, y2);
        if (await esperarHash(page, prefijo, 5000)) return '';
        await deslizar(page, x1, y1, x2, y2);
        return (await esperarHash(page, prefijo, 9000)) ? ' · con reintento' : ' · ni con reintento';
      };
      async function deslizar(page, x1, y1, x2, y2) {
        // 3 movimientos y ninguna pausa: cada evento CDP es un viaje de
        // ida y vuelta, y con la máquina cargada (hay lotes vecinos
        // probando en paralelo) 10 viajes inflan el gesto sintético a
        // ~975 ms — más que la ventana de 900 ms del producto, que mide
        // el dedo real (un dedo franco tarda 150–450 ms). El gesto
        // sintético tiene que entrar en esa escala: 5 viajes.
        const cdp = await page.context().newCDPSession(page);
        const t0 = Date.now();
        const n = 3;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] });
        for (let i = 1; i <= n; i++) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: Math.round(x1 + (x2 - x1) * i / n), y: Math.round(y1 + (y2 - y1) * i / n), id: 1 }],
          });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const dur = Date.now() - t0;
        await sleep(350);
        return dur;
      }
      const centroDe = async (page, sel) => page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
      }, sel);

      // — 601 · shell bb —
      const ctx = await mkCtx(ses601);
      const page = await ctx.newPage();
      await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.pz-shell-head', { timeout: 20000 });
      await page.waitForSelector('.bb-bar', { timeout: 20000 });
      // Puerta de preparación: el gesto se registra al final de la
      // secuencia de arranque del bundle; con la máquina cargada (hay
      // lotes vecinos probando en paralelo) la barra puede pintar antes
      // de que el registro exista. Sin esta espera, el primer gesto de
      // la corrida cae en la ventana muerta y la suite acusa al lote.
      if (!CONTROL) await page.waitForFunction(() => typeof window.pzSwipeInit === 'function', null, { timeout: 30000 }).catch(() => {});
      await sleep(1200);

      if (CONTROL) {
        await deslizar(page, 320, 430, 80, 430);
        t('C1 control: en la base, deslizar a la izquierda en Inicio NO navega', (await hashDe(page)).startsWith('#/app/inicio'), 'hash ' + (await hashDe(page)));
        const hay = await page.evaluate(() => typeof window.pzSwipeInit);
        t('C2 control: window.pzSwipeInit no existe en la base', hay === 'undefined', String(hay));
      } else {
        // La ida completa: Inicio → Subir → Ads
        const notaC1 = await deslizarHasta(page, 320, 430, 80, 430, '#/app/subir');
        t('C1 Inicio → Subir deslizando a la izquierda', (await hashDe(page)).startsWith('#/app/subir'), 'hash ' + (await hashDe(page)) + notaC1);
        await page.waitForSelector('main', { timeout: 10000 });
        const notaC2 = await deslizarHasta(page, 320, 430, 80, 430, '#/app/ads');
        t('C2 Subir → Ads deslizando a la izquierda', (await hashDe(page)).startsWith('#/app/ads'), 'hash ' + (await hashDe(page)) + notaC2);
        // Extremo derecho: en Ads no hay pantalla a la derecha
        await deslizar(page, 320, 430, 80, 430);
        t('C3 en Ads, deslizar a la izquierda no va a ningún lado (sin envoltura)', (await hashDe(page)).startsWith('#/app/ads'), 'hash ' + (await hashDe(page)));
        // La vuelta completa: Ads → Subir → Inicio
        const notaC4 = await deslizarHasta(page, 70, 430, 310, 430, '#/app/subir');
        t('C4 Ads → Subir deslizando a la derecha', (await hashDe(page)).startsWith('#/app/subir'), 'hash ' + (await hashDe(page)) + notaC4);
        const notaC5 = await deslizarHasta(page, 70, 430, 310, 430, '#/app/inicio');
        t('C5 Subir → Inicio deslizando a la derecha', (await hashDe(page)).startsWith('#/app/inicio'), 'hash ' + (await hashDe(page)) + notaC5);
        // Extremo izquierdo: en Inicio no hay pantalla a la izquierda
        await deslizar(page, 70, 430, 310, 430);
        t('C6 en Inicio, deslizar a la derecha no va a ningún lado (sin envoltura)', (await hashDe(page)).startsWith('#/app/inicio'), 'hash ' + (await hashDe(page)));
        // Vertical: el scroll no cambia de pantalla
        await deslizar(page, 200, 300, 200, 580);
        t('C7 un gesto vertical en Inicio no cambia de pantalla', (await hashDe(page)).startsWith('#/app/inicio'), 'hash ' + (await hashDe(page)));
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(300);
        // El click sintético se come. Superficie: la tarjeta del posteo
        // de hoy ([data-pz-hoy-detalle], ~332×415 en la primera
        // pantalla): un TOQUE la abre (se prueba primero, para que el
        // «no se abrió» del gesto valga como línea de base); el
        // DESLIZAMIENTO corto (100 px) desde su interior navega y NO la
        // abre. (La grilla del perfil vive ~1300 px más abajo, su
        // scroll es el del documento y la vista se re-renderiza con los
        // datos: medir una tarjeta de la grilla resultó inestable entre
        // corridas — la tarjeta de hoy es la superficie clicable ancha
        // y determinista de la primera pantalla.)
        const senalDetalle = () => page.evaluate(() => ({
          hash: location.hash,
          dOpen: document.body.classList.contains('hf-d-open'),
          svOpen: document.body.classList.contains('hf-sv-open'),
          postChat: (() => { const el = document.querySelector('#pzPostChat'); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; })(),
          overlay: !!document.querySelector('.pz-exp-overlay'),
        }));
        const hoyGeo = () => page.evaluate(() => {
          const el = document.querySelector('[data-pz-hoy-detalle]');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        });
        await page.waitForSelector('[data-pz-hoy-detalle]', { timeout: 20000 }).catch(() => {});
        const hoy = await hoyGeo();
        t('C8 la tarjeta del posteo de hoy está en la primera pantalla', !!hoy && hoy.w >= 200 && hoy.y >= 0 && hoy.y + hoy.h <= 844, JSON.stringify(hoy));
        if (hoy) {
          // La línea de base corre en su PROPIO contexto: el toque abre
          // el detalle ahí y ese contexto se descarta; la página
          // principal queda intacta para el gesto (recargar la app a
          // mitad de la corrida resultó inestable entre corridas).
          const ctxT = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: UA_IPHONE });
          await ctxT.addCookies([{ name: ses601.cookie.name, value: ses601.cookie.value, url: base }]);
          const pageT = await ctxT.newPage();
          await pageT.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
          await pageT.waitForSelector('[data-pz-hoy-detalle]', { timeout: 20000 }).catch(() => {});
          // El toque vale como línea de base solo si cae sobre el nodo
          // YA ENLAZADO (su onclick se asigna en el pase de render que
          // sigue a la llegada de los datos): se espera el enlace, no
          // solo la presencia. Sin esta espera, con la máquina cargada
          // el toque cae sobre el nodo presente pero todavía sin
          // enlazar y la línea de base acusa un «no abre» falso (visto
          // en la corrida del 22/11 17:2x: 33 ok · C8b MAL, con el
          // mismo toque abriendo el detalle en la sonda aislada).
          await pageT.waitForFunction(() => { const el = document.querySelector('[data-pz-hoy-detalle]'); return !!el && typeof el.onclick === 'function'; }, null, { timeout: 20000 }).catch(() => {});
          await sleep(1000);
          // El toque se reintenta midiendo de nuevo cada vez: la
          // tarjeta se re-renderiza cuando llegan sus datos y un toque
          // puede caer sobre el nodo saliente (un dedo real reintenta).
          let trasToque = { hash: '#/app/inicio', dOpen: false, svOpen: false, postChat: false, overlay: false };
          let abrio = false;
          let ultimoHoyT = null;
          for (let intento = 0; intento < 4 && !abrio; intento++) {
            const hoyT = await pageT.evaluate(() => { const el = document.querySelector('[data-pz-hoy-detalle]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), oc: typeof el.onclick === 'function' }; });
            if (!hoyT) { await sleep(1500); continue; }
            ultimoHoyT = hoyT;
            await pageT.touchscreen.tap(hoyT.x + Math.min(hoyT.w - 20, 130), hoyT.y + Math.round(hoyT.h / 2));
            await sleep(1500);
            trasToque = await pageT.evaluate(() => ({
              hash: location.hash,
              dOpen: document.body.classList.contains('hf-d-open'),
              svOpen: document.body.classList.contains('hf-sv-open'),
              postChat: (() => { const el = document.querySelector('#pzPostChat'); return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; })(),
              overlay: !!document.querySelector('.pz-exp-overlay'),
            }));
            abrio = trasToque.dOpen || trasToque.svOpen || trasToque.postChat || trasToque.overlay || !trasToque.hash.startsWith('#/app/inicio');
          }
          t('C8b un toque sobre la tarjeta SÍ abre su detalle (línea de base del click comido)', abrio, JSON.stringify(trasToque) + ' geo ' + JSON.stringify(ultimoHoyT));
          await ctxT.close();
          // El gesto, en la página principal intacta:
          const cx2 = hoy.x + Math.min(hoy.w - 20, 130);
          const cy2 = hoy.y + Math.round(hoy.h / 2);
          await deslizar(page, cx2, cy2, cx2 - 100, cy2);
          const trasGesto = await senalDetalle();
          t('C9 deslizar desde la tarjeta navega y el detalle NO se abre (click comido)',
            trasGesto.hash.startsWith('#/app/subir') && !trasGesto.dOpen && !trasGesto.svOpen && !trasGesto.postChat && !trasGesto.overlay,
            JSON.stringify(trasGesto));
          await esperarHash(page, '#/app/subir');
        }
        // El carrusel: la pista horizontal REAL de la app (.hf-d-track
        // del detalle de un posteo carrusel de 601) — un segundo
        // scroller interno, independiente de la tira de la semana (que
        // se ejercita con su propia cuenta en C20/C21). El gesto sobre
        // la pista no cambia de pantalla: la guarda de scroller la
        // reclama para la pista (y el detalle abierto también frena
        // por la guarda de hojas — el veredicto en página aisla la de
        // scroller).
        await page.evaluate(() => { location.hash = '#/app/inicio'; });
        await esperarHash(page, '#/app/inicio');
        await page.waitForSelector('.hf-tile[data-post-id="' + CAR_ID + '"]', { timeout: 30000 }).catch(() => {});
        await sleep(1000);
        await page.evaluate((id) => {
          const el = document.querySelector('.hf-tile[data-post-id="' + id + '"]');
          if (el) { const r = el.getBoundingClientRect(); window.scrollTo(0, Math.max(0, window.scrollY + r.top - 260)); }
        }, CAR_ID);
        await sleep(700);
        const tileCar = await centroDe(page, '.hf-tile[data-post-id="' + CAR_ID + '"]');
        if (tileCar) await page.touchscreen.tap(tileCar.x, tileCar.y);
        await page.waitForSelector('.hf-d-track', { timeout: 20000 }).catch(() => {});
        // La capa del detalle entra con animación: medir (y apoyar el
        // dedo) recién cuando asentó — durante la entrada, el punto
        // del arrastre puede caer en el fondo de la capa, que cierra.
        await sleep(1600);
        const pista = await page.evaluate(() => {
          // Puede haber pistas ocultas en plantillas/baúles del DOM: la
          // que vale es la VISIBLE dentro del detalle abierto.
          const els = [...document.querySelectorAll('.hf-d-track')];
          const el = els.find((e) => e.clientWidth > 0 && e.closest('.hf-dback')) || els.find((e) => e.clientWidth > 0);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
          const enElPunto = document.elementFromPoint(cx + 60, cy);
          return { x: cx, y: cy, sw: el.scrollWidth, cw: el.clientWidth, enScroller: window.pzSwipeInHScroller(el), puntoEnLaPista: !!(enElPunto && enElPunto.closest && enElPunto.closest('.hf-d-track') === el) };
        });
        t('C10 el detalle del carrusel abre con su pista horizontal real, que desborda', !!pista && pista.sw > pista.cw + 1 && pista.enScroller === true && pista.puntoEnLaPista, JSON.stringify(pista));
        if (pista) {
          await deslizar(page, pista.x + 60, pista.y, pista.x - 140, pista.y);
          const sigue = await page.evaluate(() => ({ hash: location.hash, dOpen: document.body.classList.contains('hf-d-open') }));
          t('C11 deslizar sobre la pista del carrusel no cambia de pantalla (el gesto es de la pista)',
            sigue.hash.startsWith('#/app/inicio') && sigue.dOpen, JSON.stringify(sigue));
        }
        // Se cierra el detalle por su propia flecha: la corrida sigue.
        await page.click('.hf-d-back').catch(() => {});
        await sleep(600);
        // Hoja abierta: la de compartir (real, en las tres pantallas)
        await page.evaluate(() => { location.hash = '#/app/inicio'; });
        await esperarHash(page, '#/app/inicio');
        await sleep(800);
        await page.click('button[onclick="rsShareOpen()"]');
        await page.waitForFunction(() => { const s = document.getElementById('rsShareSheet'); return s && !s.hidden; }, null, { timeout: 9000 });
        await deslizar(page, 320, 430, 80, 430);
        t('C12 con la hoja de compartir abierta, deslizar no cambia de pantalla', (await hashDe(page)).startsWith('#/app/inicio'), 'hash ' + (await hashDe(page)));
        try { await page.click('.rs-sheet-x', { timeout: 6000 }); }
        catch (e) { await page.evaluate(() => { if (typeof window.rsShareClose === 'function') window.rsShareClose(); }); }
        await sleep(500);
        // Campo de texto en Subir: el gesto no nace sobre un control
        await page.evaluate(() => { location.hash = '#/app/subir'; });
        await esperarHash(page, '#/app/subir');
        await sleep(1000);
        const campo = await centroDe(page, 'main textarea, main input[type="text"], main input:not([type])');
        t('C13 Subir tiene un campo de texto real para apoyar el dedo', !!campo, JSON.stringify(campo));
        if (campo) {
          await deslizar(page, Math.min(campo.x + 70, 380), campo.y, Math.max(campo.x - 170, 30), campo.y);
          t('C14 deslizar desde el campo de Subir no cambia de pantalla', (await hashDe(page)).startsWith('#/app/subir'), 'hash ' + (await hashDe(page)));
        }
        // Arranque sobre la barra inferior (shell bb): la barra es de la barra
        const tabSubir = await centroDe(page, '.bb-bar .bb-tab-subir');
        if (tabSubir) {
          await deslizar(page, Math.min(tabSubir.x + 60, 380), tabSubir.y, Math.max(tabSubir.x - 160, 30), tabSubir.y);
          t('C15 deslizar apoyado en la barra inferior no cambia de pantalla', (await hashDe(page)).startsWith('#/app/subir'), 'hash ' + (await hashDe(page)));
        } else {
          t('C15 deslizar apoyado en la barra inferior no cambia de pantalla', false, 'no se encontró .bb-tab-subir');
        }
        // El chip de monto de Ads: estado fabricado SOLO en los GET de
        // Ads (el cliente real pinta su tarjeta real con sus chips).
        await page.route('**/api/ads/**', async (route) => {
          const u = route.request().url();
          const json = (obj) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(obj) });
          if (u.includes('/api/ads/billetera/elegibles')) {
            return json({ ok: true, ads_ready: true, connect_url: '', riel: 'cliente', conexion: { conectada: true, ig_username: 'cafedeslizar', page_name: 'Café Deslizar', ad_account_id: 'act_qa' }, elegibles: [{ post_id: 9001, ig_media_id: 'igqa9001', image_path: '', caption: 'Posteo QA de Café Deslizar', reach: 1500, likes: 55, comments: 4, recomendado: true }] });
          }
          if (u.endsWith('/api/ads/billetera')) {
            return json({ ok: true, balance_cents: 2200, currency: 'USD', montos_usd: [20, 50, 100], montos_ars: [5000, 10000, 20000], billing_provider: null, boostHabilitado: true, tarjeta: { tiene: false } });
          }
          if (u.includes('/api/ads/boosts')) return json({ ok: true, boosts: [] });
          return route.continue();
        });
        await page.evaluate(() => { location.hash = '#/app/ads'; });
        await esperarHash(page, '#/app/ads');
        let chip = null;
        try { await page.waitForSelector('.pz-ads-amount', { timeout: 20000 }); chip = await centroDe(page, '.pz-ads-amount'); } catch (e) { chip = null; }
        t('C16 la tarjeta de Ads pinta sus chips de monto (.pz-ads-amount)', !!chip, JSON.stringify(chip));
        if (chip) {
          await deslizar(page, Math.min(chip.x + 40, 380), chip.y, Math.max(chip.x - 190, 30), chip.y);
          t('C17 deslizar desde un chip de monto de Ads no cambia de pantalla', (await hashDe(page)).startsWith('#/app/ads'), 'hash ' + (await hashDe(page)));
        }
        await page.unroute('**/api/ads/**');
      }
      await ctx.close();

      // — 602 · shell clásico (.mz-tabs) —
      const ctx2 = await mkCtx(ses602);
      const p2 = await ctx2.newPage();
      await p2.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await p2.waitForSelector('.mz-tabs', { timeout: 20000 });
      if (!CONTROL) await p2.waitForFunction(() => typeof window.pzSwipeInit === 'function', null, { timeout: 30000 }).catch(() => {});
      await sleep(1000);
      if (CONTROL) {
        await deslizar(p2, 320, 430, 80, 430);
        t('C18 control: en el shell clásico de la base tampoco se navega', (await hashDe(p2)).startsWith('#/app/inicio'), 'hash ' + (await hashDe(p2)));
      } else {
        const notaC18 = await deslizarHasta(p2, 320, 430, 80, 430, '#/app/subir');
        t('C18 shell clásico: Inicio → Subir deslizando', (await hashDe(p2)).startsWith('#/app/subir'), 'hash ' + (await hashDe(p2)) + notaC18);
        const tabMz = await centroDe(p2, '.mz-tabs .mz-tab-subir');
        if (tabMz) {
          await deslizar(p2, Math.min(tabMz.x + 60, 380), tabMz.y, Math.max(tabMz.x - 160, 30), tabMz.y);
          t('C19 shell clásico: deslizar apoyado en .mz-tabs no cambia de pantalla', (await hashDe(p2)).startsWith('#/app/subir'), 'hash ' + (await hashDe(p2)));
        } else {
          t('C19 shell clásico: deslizar apoyado en .mz-tabs no cambia de pantalla', false, 'no se encontró .mz-tab-subir');
        }
      }
      await ctx2.close();

      // — 603 · la tira de la semana (#hsWeekList) —
      // La cuenta 603 está sembrada SOLO con programados: su Inicio
      // cae en la rama de la semana y pinta la tira. El gesto sobre la
      // tira es de la tira (la guarda de scroller lo reclama), no de
      // la pantalla: deslizar ahí NO cambia de pantalla.
      if (!CONTROL) {
        const ctx3 = await mkCtx(ses603);
        const p3 = await ctx3.newPage();
        await p3.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
        await p3.waitForSelector('#hsWeekList', { timeout: 20000 }).catch(() => {});
        if (!CONTROL) await p3.waitForFunction(() => typeof window.pzSwipeInit === 'function', null, { timeout: 30000 }).catch(() => {});
        await sleep(1200);
        const medirTira = () => p3.evaluate(() => {
          const el = document.querySelector('#hsWeekList');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), sw: el.scrollWidth, cw: el.clientWidth, enScroller: window.pzSwipeInHScroller(el), sl: el.scrollLeft };
        });
        let tira = await medirTira();
        if (tira && (tira.y < 60 || tira.y > 760)) {
          await p3.evaluate(() => { const el = document.querySelector('#hsWeekList'); if (el) el.scrollIntoView({ block: 'center' }); });
          await sleep(600);
          tira = await medirTira();
        }
        t('C20 la tira de la semana (#hsWeekList) está pintada y desborda en horizontal', !!tira && tira.sw > tira.cw + 1 && tira.enScroller === true, JSON.stringify(tira));
        if (tira) {
          await deslizar(p3, Math.min(tira.x + 80, 370), tira.y, Math.max(tira.x - 120, 30), tira.y);
          const sigue3 = await p3.evaluate(() => { const el = document.querySelector('#hsWeekList'); return { hash: location.hash, sl: el ? el.scrollLeft : null }; });
          t('C21 deslizar sobre la tira de la semana no cambia de pantalla (el gesto es de la tira)',
            sigue3.hash.startsWith('#/app/inicio'), JSON.stringify(sigue3) + ' scrollLeft ' + tira.sl + '→' + sigue3.sl);
        }
        await ctx3.close();
      }
      await browser.close();
    }
  } finally {
    if (child) {
      try { process.kill(child.pid, 'SIGTERM'); } catch (e) { /* ya murió */ }
      await sleep(700);
      let vivo = true;
      try { process.kill(child.pid, 0); } catch (e) { vivo = false; }
      if (vivo) { try { process.kill(child.pid, 'SIGKILL'); } catch (e) { /* nada */ } await sleep(300); }
      let vivo2 = true;
      try { process.kill(child.pid, 0); } catch (e) { vivo2 = false; }
      t('B4 el boot murió por su PID exacto y el puerto quedó libre', !vivo2 && puertoLibre(PORT));
    } else {
      t('B4 el boot murió por su PID exacto y el puerto quedó libre', false, 'no hubo boot propio');
    }
    try { fs.unlinkSync(seedFile); } catch (e) { /* nada */ }
    try { fs.rmSync(tmpD, { recursive: true, force: true }); } catch (e) { /* nada */ }
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
}
main().catch((e) => { console.log('\nERROR FATAL: ' + (e && e.stack || e)); console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL'); process.exit(1); });
