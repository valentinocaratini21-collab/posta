'use strict';
/*
 * LOTE INICIO-WEB-PERFIL (23/11) — el Inicio en el WEBSITE según el
 * mock 1 «El perfil manda» aprobado por el dueño (13:47): sidebar
 * marina fija, fondo crema #FFF9F0, el perfil literal en grande a la
 * izquierda y el rail Hoy/Semana/Chat a la derecha. SOLO
 * presentación de escritorio (≥1024px): el layout móvil/app no se
 * toca y ninguna lógica cambia (mismos renders, mismos binders).
 *
 * Qué afirma esta suite:
 *  A · estática: sintaxis; el bloque CSS del lote (sidebar marina,
 *      crema, dos columnas 1.55fr/1fr) presente en styles.css; la
 *      composición nueva de inicioView (iwp-cols/iwp-rail/iwp-main)
 *      y la tarjeta de chat del rail (iwpChatCardHTML) cableada a
 *      bbGo('#/app/chat'); los sellos ?v= nuevos en ambos índices;
 *      el censo de marcadores de frentes ajenos idéntico a la base.
 *  B · boot: el servidor sirve el index con los sellos nuevos y el
 *      styles.css con el bloque del lote.
 *  C · Chromium real contra el server, cuenta semilla con el shell
 *      WEB (bambooty_shell=0):
 *      C-desktop (1440px): sidebar fija y marina · dos columnas con
 *        el perfil a la izquierda y la tira en el rail · sin scroll
 *        horizontal · la tarjeta de chat visible y su botón dispara
 *        la ruta del chat · links del sidebar presentes.
 *      C-móvil (390px): la tarjeta del rail no existe visualmente ·
 *        el orden de siempre (Hoy antes que el perfil) · el drawer
 *        fuera de pantalla · sin scroll horizontal.
 *
 * Control contra la base prístina v1274: fallan exactamente los
 * casos [FIX] (A2, A3, A4, B2, B3, B4, C1, C2, C3, C4); los
 * invariantes (sintaxis, censo, orden móvil, sin scroll) pasan en
 * las dos.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function buscarPuerto() {
  for (let p = 37150; p < 37350; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}
function contarEn(archivo, marca) {
  try { return (fs.readFileSync(archivo, 'utf8').split(marca).length - 1); } catch (e) { return -1; }
}
function contarArbol(marca) {
  // Mismo método que el censo del lote: ocurrencias en *.js/*.html
  // del árbol, excluyendo esta suite (que nombra los marcadores).
  let n = 0;
  const skipDirs = new Set(['node_modules', 'data', '.git']);
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skipDirs.has(e.name)) walk(path.join(d, e.name)); continue; }
      if (e.name === 'test-lote-inicio-web-perfil.js') continue;
      if (!/\.(js|html)$/.test(e.name)) continue;
      n += contarEn(path.join(d, e.name), marca);
    }
  };
  walk(ROOT);
  return n;
}

// ---------------------------------------------------------------------
function seccionA() {
  seccion('A · estática');
  const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'public/app.js')]); t('A1 node --check public/app.js', true); }
  catch (e) { t('A1 node --check public/app.js', false, String(e.message).slice(-200)); }

  const iBloque = css.indexOf('INICIO-WEB-PERFIL');
  const bloque = iBloque >= 0 ? css.slice(iBloque) : '';
  t('A2 [FIX] styles.css trae el bloque INICIO-WEB-PERFIL (sidebar marina + crema + dos columnas)',
    iBloque >= 0
    && bloque.includes('.drawer{background:#0A1E33')
    && bloque.includes('#FFF9F0')
    && bloque.includes('grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr)')
    && bloque.includes('@media(min-width:1024px)'),
    'bloque=' + iBloque);

  const defsIwp = (appJs.match(/function iwpChatCardHTML\b/g) || []).length;
  t('A3 [FIX] inicioView compone iwp-cols/iwp-rail/iwp-main y la tarjeta de chat cableada a bbGo(\'#/app/chat\')',
    defsIwp === 1
    && appJs.includes('class="iwp-cols"')
    && appJs.includes('class="iwp-rail"')
    && appJs.includes('class="iwp-main"')
    && appJs.includes('iwpChatCardHTML(enHome)')
    && appJs.includes('onclick="bbGo(\'#/app/chat\')"'),
    'defsIwp=' + defsIwp);

  const idxEs = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  const idxEn = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');
  t('A4 [FIX] sellos: app.js?v=911 y styles.css?v=20261331 (ES) · styles.css?v=20261331 (EN) · sin sellos viejos',
    idxEs.includes('/app.js?v=911') && idxEs.includes('/styles.css?v=20261331')
    && idxEn.includes('/styles.css?v=20261331')
    && !idxEs.includes('/styles.css?v=20261328') && !idxEn.includes('/styles.css?v=20261328')
    && !idxEs.includes('/app.js?v=902'));

  seccion('A · censo de marcadores ajenos (idéntico a la base v1274)');
  const censo = [
    ['captionOpenIsLong', 25], ['homeDisplayOverlay', 14], ['pzBandeja', 239],
    ['defectosDeCupo', 4], ['idea_hilo', 23], ['/api/venty/estado', 26], ['medidaTanda', 9],
  ];
  for (const [m, esperado] of censo) {
    const n = contarArbol(m);
    t('A5 censo ' + m + ' = ' + esperado, n === esperado, 'hallado=' + n);
  }

  seccion('A · funciones auditadas (todo control visible, cableado)');
  const defBbGo = (appJs.match(/function bbGo\b/g) || []).length;
  t('A6a bbGo definida 1 vez (la usa el botón de la tarjeta de chat)', defBbGo === 1, 'defs=' + defBbGo);
  t('A6b «subir algo mío» sigue rendido y con su binder (data-pz-hoy-subir → #/app/subir)',
    contarEn(path.join(ROOT, 'public/app.js'), 'data-pz-hoy-subir="1"') >= 2
    && appJs.includes("querySelectorAll('[data-pz-hoy-subir]')")
    && appJs.includes("bbGo('#/app/subir')"));
  t('A6c las pestañas del perfil siguen con su binder (data-hf-tab)',
    appJs.includes("querySelectorAll('[data-hf-tab]')") || appJs.includes('$$(\'#inicioView [data-hf-tab]\')'));
  t('A6d los links del sidebar siguen en appShell (data-tab inicio/subir/ads + drawerLogout)',
    appJs.includes('data-tab="inicio"') && appJs.includes('data-tab="subir"')
    && appJs.includes('data-tab="ads"') && appJs.includes('id="drawerLogout"'));
}

// ---------------------------------------------------------------------
const SEED_C = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
  VALUES (701, 'dueno@webqa.test', ?, 'posty', 'active', 0, 0, 0, NULL, NULL, 0, 'es', 1, '2026-09-01 10:00:00')\`).run(hash);
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (701, ?, ?, ?, 1)')
  .run('Negocio Web QA', 'webqa', 'café');
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (701, 'America/New_York', '')").run();
const iso = (ms) => new Date(ms).toISOString();
db.prepare(\`INSERT INTO posts (id, user_id, image_path, caption, status, media_type, scheduled_at, published_at, ig_permalink, created_at)
  VALUES (7011, 701, '/media/semilla.jpg', 'POSTEO VIVO QA', 'published', 'image', ?, ?, 'https://www.instagram.com/p/VIVO1/', ?)\`)
  .run(iso(Date.now() - 7200000), iso(Date.now() - 7200000), iso(Date.now() - 7200000));
db.prepare(\`INSERT INTO posts (id, user_id, image_path, caption, status, media_type, scheduled_at, published_at, ig_permalink, created_at)
  VALUES (7012, 701, '/media/semilla.jpg', 'POSTEO DOS QA', 'published', 'image', ?, ?, 'https://www.instagram.com/p/VIVO2/', ?)\`)
  .run(iso(Date.now() - 10800000), iso(Date.now() - 10800000), iso(Date.now() - 10800000));
db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
  VALUES (702, 'shell@webqa.test', ?, 'posty', 'active', 0, 0, 0, NULL, NULL, 1, 'es', 1, '2026-09-01 10:00:00')\`).run(hash);
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (702, ?, ?, ?, 1)')
  .run('Negocio Shell QA', 'webqa', 'café');
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (702, 'America/New_York', '')").run();
db.prepare(\`INSERT INTO posts (id, user_id, image_path, caption, status, media_type, scheduled_at, published_at, ig_permalink, created_at)
  VALUES (7021, 702, '/media/semilla.jpg', 'POSTEO VIVO QA', 'published', 'image', ?, ?, 'https://www.instagram.com/p/VIVO1/', ?)\`)
  .run(iso(Date.now() - 7200000), iso(Date.now() - 7200000), iso(Date.now() - 7200000));
console.log('semilla ok');
`;

function seccionAHotfix() {
  seccion('A · hotfix 23/11 (corrección del dueño 21:40)');
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  t('A7 [HOTFIX] las dos columnas declaran grid-row:1 (arrancan alineadas arriba)',
    css.includes('.iwp-main{grid-column:1;grid-row:1') && css.includes('.iwp-rail{grid-column:2;grid-row:1}'));
  t('A8 [ALCANCE 21:44] bbShell NO se toca: sin marca bb-side-brand ni bloque de sidebar para ese shell',
    !app.includes('bb-side-brand') && !css.includes('.bb-app .bb-bar') && !css.includes('bb-side-brand'));
  t('A9 [ALCANCE 21:44] la sidebar marina del lote es solo el drawer de appShell',
    css.includes('.drawer{background:#0A1E33'));
  t('A10 [HOTFIX] el título del posteo corta en palabra y cierra con «…» (capFull)',
    app.includes('const capFull = String((p && p.caption)') && app.includes("+ '…') : capFull"));
}

async function bootServidor() {
  const PORT = buscarPuerto();
  if (!PORT) return null;
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'iwp-boot-'));
  const seedFile = path.join(tmpD, 'seed.js');
  fs.writeFileSync(seedFile, SEED_C);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { encoding: 'utf8', timeout: 120000 });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-iwp', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + PORT;
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) {}
    if (!up) await sleep(500);
  }
  return { PORT, child, base, up, log: () => log };
}

async function seccionB(srv) {
  seccion('B · boot: lo servido');
  t('B1 el servidor levanta en el puerto libre', srv && srv.up, srv ? srv.log().slice(-200) : 'sin puerto');
  if (!srv || !srv.up) return;
  const rIdx = await fetch(srv.base + '/');
  const idxTxt = await rIdx.text();
  t('B2 [FIX] el index servido trae app.js?v=911 y styles.css?v=20261331',
    idxTxt.includes('/app.js?v=911') && idxTxt.includes('/styles.css?v=20261331'));
  const rCss = await fetch(srv.base + '/styles.css?v=20261331');
  const cssTxt = await rCss.text();
  t('B3 [FIX] el styles servido trae el bloque INICIO-WEB-PERFIL',
    rCss.status === 200 && cssTxt.includes('INICIO-WEB-PERFIL') && cssTxt.includes('.drawer{background:#0A1E33'));
  const rEn = await fetch(srv.base + '/en/');
  const enTxt = await rEn.text();
  t('B4 [FIX] el index EN servido trae styles.css?v=20261331', enTxt.includes('/styles.css?v=20261331'));
}

async function seccionC(srv) {
  seccion('C · Chromium: escritorio 1280 y móvil 390');
  if (!srv || !srv.up) { t('C0 sin servidor para Chromium', false); return; }
  const lr = await fetch(srv.base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dueno@webqa.test', password: 'ClaveQA123' }),
  });
  const setCookie = lr.headers.get('set-cookie') || '';
  const m = setCookie.match(/^([^=]+)=([^;]+)/);
  t('C0 login de la cuenta semilla (shell web)', lr.status === 200 && !!m);
  if (!m) return;
  const cookie = { name: m[1], value: m[2] };

  let pw = null;
  for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
    path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
    try { pw = require(cand); break; } catch (e) {}
  }
  t('C0b playwright-core disponible', !!pw);
  if (!pw) return;
  let exe;
  const basePw = path.join(os.homedir(), '.cache/ms-playwright');
  try {
    for (const dir of fs.readdirSync(basePw)) {
      const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
      if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
    }
  } catch (e) {}
  const browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
  try {
    const perfil = JSON.stringify({
      ok: true, username: 'webqa', name: 'Negocio Web QA', pic: '',
      posts_count: 2, followers: 10, following: 5, category: null, note: null, location: null, recents: [],
    });
    const vivo = JSON.stringify({ ok: true, complete: true, shortcodes: ['VIVO1', 'VIVO2'], window_oldest: new Date(Date.now() - 7 * 86400000).toISOString() });
    async function abrir(ancho, alto) {
      const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
      await ctx.addCookies([{ name: cookie.name, value: cookie.value, url: srv.base }]);
      const page = await ctx.newPage();
      await page.route('**/api/home/profile', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: perfil }));
      await page.route('**/api/home/live-grid', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: vivo }));
      await page.goto(srv.base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#inicioView .hf-head', { timeout: 20000 });
      await sleep(600);
      return { ctx, page };
    }

    // ---- Escritorio 1440 ----
    {
      const { ctx, page } = await abrir(1440, 900);
      const d = await page.evaluate(() => {
        const R = (el) => el ? el.getBoundingClientRect() : null;
        const drawer = document.querySelector('.drawer');
        const head = document.querySelector('#inicioView .hf-head');
        const tira = document.querySelector('#pzHoyTira');
        const chat = document.querySelector('#inicioView .iwp-chat');
        const main = document.querySelector('#inicioView .iwp-main');
        return {
          drawerBg: drawer ? getComputedStyle(drawer).backgroundColor : '',
          drawerW: drawer ? R(drawer).width : 0,
          headR: R(head), tiraR: R(tira),
          chatVisible: !!chat && chat.getBoundingClientRect().height > 0 && getComputedStyle(chat).display !== 'none',
          mainContieneGrilla: !!main && !!(main.querySelector('.hf-grid') || main.querySelector('#hfGridSlot')),
          mainR: R(main), railR: R(document.querySelector('#inicioView .iwp-rail')),
          inicioW: R(document.getElementById('inicioView')).width,
          links: document.querySelectorAll('.drawer .drawer-link[data-tab]').length,
          logout: !!document.getElementById('drawerLogout'),
          sinScrollX: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });
      t('C1 [FIX] sidebar fija visible y marina (#0A1E33) en escritorio',
        d.drawerBg === 'rgb(10, 30, 51)' && d.drawerW >= 200, 'bg=' + d.drawerBg + ' w=' + d.drawerW);
      t('C2 [FIX] dos columnas: el perfil a la izquierda y la tira de la semana en el rail derecho',
        !!d.headR && !!d.tiraR && d.headR.right <= d.tiraR.left + 2 && d.inicioW >= 1000,
        JSON.stringify({ headR: d.headR && [d.headR.left, d.headR.right], tiraL: d.tiraR && d.tiraR.left, inicioW: d.inicioW }));
      t('C2b [HOTFIX] las dos columnas arrancan alineadas arriba (misma fila del grid)',
        !!d.mainR && !!d.railR && Math.abs(d.mainR.top - d.railR.top) <= 8,
        JSON.stringify({ mainTop: d.mainR && d.mainR.top, railTop: d.railR && d.railR.top }));
      t('C3 [FIX] la grilla vive dentro de la columna del perfil y no hay scroll horizontal',
        d.mainContieneGrilla && d.sinScrollX);
      t('C5 los links del sidebar están (Inicio/Subir/Ads + Salir)', d.links === 3 && d.logout, 'links=' + d.links);
      // El botón dispara la ruta del chat (bbGo('#/app/chat'), el
      // mismo destino del botón de chat de la tira): se prueba que
      // la ruta se visita; el estado final del registrado lo decide
      // el rebote vigente del router (TAB-SUBIR), no esta tarjeta.
      let rutas = [];
      try {
        await page.evaluate(() => { window.__iwpRutas = []; window.addEventListener('hashchange', (e) => window.__iwpRutas.push(e.newURL.split('#')[1])); });
        await page.click('#inicioView .iwp-chat-go');
        await sleep(900);
        rutas = await page.evaluate(() => window.__iwpRutas || []);
      } catch (e) {}
      t('C4 [FIX] la tarjeta de chat del rail es visible y su botón abre la ruta del chat (#/app/chat)',
        d.chatVisible && rutas.includes('/app/chat'), 'visible=' + d.chatVisible + ' rutas=' + JSON.stringify(rutas));
      await ctx.close();
    }

    // ---- Escritorio 1440 · shell Bambooty (bbShell, la cuenta del dueño) ----
    {
      const lr2 = await fetch(srv.base + '/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'shell@webqa.test', password: 'ClaveQA123' }),
      });
      const m2 = (lr2.headers.get('set-cookie') || '').match(/^([^=]+)=([^;]+)/);
      t('C9 [HOTFIX] login de la cuenta semilla con shell Bambooty', lr2.status === 200 && !!m2);
      if (m2) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx.addCookies([{ name: m2[1], value: m2[2], url: srv.base }]);
        const page = await ctx.newPage();
        await page.route('**/api/home/profile', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: perfil }));
        await page.route('**/api/home/live-grid', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: vivo }));
        await page.goto(srv.base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#inicioView .hf-head', { timeout: 20000 });
        await sleep(700);
        const d = await page.evaluate(() => {
          const R = (el) => el ? el.getBoundingClientRect() : null;
          const bar = document.querySelector('.bb-bar');
          const brand = document.querySelector('.bb-side-brand');
          const main = document.querySelector('#inicioView .iwp-main');
          const rail = document.querySelector('#inicioView .iwp-rail');
          const tab = document.querySelector('.bb-tab');
          return {
            barR: R(bar), barBg: bar ? getComputedStyle(bar).backgroundColor : '',
            brandVisible: !!brand && R(brand).height > 0,
            mainR: R(main), railR: R(rail), tabH: tab ? R(tab).height : 0,
            sinScrollX: document.documentElement.scrollWidth <= window.innerWidth + 1,
          };
        });
        t('C10 [ALCANCE 21:44] bbShell en escritorio queda como estaba: su barra sigue abajo',
          !!d.barR && d.barR.bottom >= 899 && !d.brandVisible,
          JSON.stringify({ bar: d.barR && [d.barR.left, d.barR.bottom], brand: d.brandVisible }));
        t('C11 [ALCANCE 21:44] sin marca de sidebar en bbShell y pestañas de barra estándar',
          !d.brandVisible && d.tabH >= 30 && d.tabH <= 80, 'brand=' + d.brandVisible + ' tabH=' + d.tabH);
        t('C12 [HOTFIX] bbShell: las dos columnas arrancan alineadas y sin scroll horizontal',
          !!d.mainR && !!d.railR && Math.abs(d.mainR.top - d.railR.top) <= 8 && d.sinScrollX,
          JSON.stringify({ mainTop: d.mainR && d.mainR.top, railTop: d.railR && d.railR.top }));
        const det = await page.evaluate(() => {
          const CAP = 'Ninguno de estos 8 negocios nos mandó una foto. Todos los posteos los armamos nosotros. Posty estudia tu negocio, arma el posteo y sale publicado. Todos los días.';
          const iso2 = new Date().toISOString();
          const html = pzHoyTiraDetalleHTML({ idx: 0, esHoy: false, esManana: false, revelado: true, post: { id: 999, caption: CAP, status: 'published', image_path: '', media_type: 'image', scheduled_at: iso2, published_at: iso2, ig_permalink: 'https://www.instagram.com/p/X/', approval: 'approved' } }, { en: false });
          const host = document.createElement('div'); host.innerHTML = html;
          const b = host.querySelector('.pz-hoy-tira-detalle .t b');
          return b ? b.textContent : '';
        });
        t('C13 [HOTFIX] el título del posteo en la tira cierra con «…» y no a mitad de palabra',
          det.endsWith('…') && !det.includes('nosotros. P'), JSON.stringify(det.slice(-30)));
        await ctx.close();
      }
    }

    // ---- Móvil 390 ----
    {
      const { ctx, page } = await abrir(390, 844);
      const d = await page.evaluate(() => {
        const R = (el) => el ? el.getBoundingClientRect() : null;
        const chat = document.querySelector('#inicioView .iwp-chat');
        const hoy = document.getElementById('pzHoyAprobar');
        const head = document.querySelector('#inicioView .hf-head');
        const drawer = document.querySelector('.drawer');
        return {
          chatDisplay: chat ? getComputedStyle(chat).display : 'ausente',
          hoyTop: R(hoy) ? R(hoy).top : null,
          headTop: R(head) ? R(head).top : null,
          drawerRight: R(drawer) ? R(drawer).right : null,
          sinScrollX: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });
      t('C6 la tarjeta del rail no se ve en móvil (display:none o ausente)', d.chatDisplay === 'none' || d.chatDisplay === 'ausente', 'display=' + d.chatDisplay);
      t('C7 el orden móvil es el de siempre (bloque Hoy antes que el perfil) y el drawer queda fuera de pantalla',
        d.hoyTop !== null && d.headTop !== null && d.hoyTop < d.headTop && (d.drawerRight === null || d.drawerRight <= 1),
        JSON.stringify(d));
      t('C8 sin scroll horizontal a 390px', d.sinScrollX);
      await ctx.close();
    }
  } finally {
    try { await browser.close(); } catch (e) {}
  }
}

// ---------------------------------------------------------------------
(async () => {
  seccionA();
  seccionAHotfix();
  const srv = await bootServidor().catch((e) => { console.log('boot error: ' + String(e && e.message).slice(-200)); return null; });
  try {
    await seccionB(srv);
    await seccionC(srv);
  } finally {
    if (srv && srv.child) {
      try { srv.child.kill('SIGTERM'); } catch (e) {}
      await sleep(300);
      try { if (srv.child.exitCode === null) srv.child.kill('SIGKILL'); } catch (e) {}
    }
  }
  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})();
