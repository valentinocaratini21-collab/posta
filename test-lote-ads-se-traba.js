// Suite LOTE ADS-SE-TRABA-AL-VOLVER (20/11) — el defecto del dueño:
// «se me sigue trabando la pantalla en ads» + «cuando toco en "ads"
// tarda mucho en abrirse… en cambio, cuando toco "subir" carga
// inmediatamente» + «cuando toco en "inicio" siempre aparecen antes
// los 3 puntitos… tiene que cargar inmediatamente las 3 pantallas».
//
// Causa probada en el bundle v1197: (1) Ads era la única pestaña
// principal sin esqueleto — su rama esperaba la cadena entera
// (billetera → elegibles → boosts, en serie, timeout 30 s c/u: peor
// caso ~90 s de pantalla anterior congelada); (2) al volver, la
// guarda de versión recargaba en caliente sobre la pestaña en uso y
// aterrizaba en esa misma cadena.
//
// Parte A: fuente — Ads pinta primero (esqueleto en su rama), los
//   tres pedidos corren en paralelo con el timeout propio de la
//   vista (PZ_ADS_TIMEOUT = 8000), el camino tibio devuelve el
//   último estado al instante y refresca en segundo plano, la
//   guarda difiere fuera de Inicio y aplica al aterrizar en Inicio,
//   y el cargador genérico es el estándar del dueño (ruedita
//   #2793C8 + línea de estado): los 3 puntitos mueren en el
//   esqueleto y en el splash de index.html.
// Parte B: boot real con DATA_DIR temporal — la cuenta sembrada
//   recibe de los tres endpoints de Ads las respuestas de siempre
//   y el HTML servido trae el splash nuevo.
// Parte C: control contra el árbol base (el defecto presente).
//
// La verificación de navegador (pintura al instante con los
// endpoints demorados 4 s por un proxy declarado, la vuelta sobre
// Ads sin recarga, Inicio sin puntitos) vive en el scratch del lote
// (verify-browser.py / verify-warm.py): 27 chequeos, todos ok.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
const PORT = 35331;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = 'adm-traba-suite';
const tmpDir = '/tmp/posta-traba-' + process.pid;

let ok = 0, mal = 0;
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok', name); } else { mal++; console.log('  MAL', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); } }
const has = (s, x) => String(s || '').includes(x);
function sliceFn(src, desde, hasta) {
  const a = src.indexOf(desde); if (a < 0) return '';
  const b = src.indexOf(hasta, a + desde.length); if (b < 0) return '';
  return src.slice(a, b);
}

// ================= Parte A =================
function parteA() {
  console.log('— A · fuente —');
  const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
  const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

  // (a) Pintar primero: la rama de Ads pinta el esqueleto como todas.
  t('A1 la rama de Ads pinta su esqueleto antes de esperar datos',
    has(app, "else if (tab === 'ads') { pzPaintSkeleton(tab); content = await adsView(); }"));
  // El splash sale apenas el shell está pintado (la landing ya no vive debajo).
  const paintSrc = sliceFn(app, 'function pzPaintSkeleton(tab) {', 'function pzPrefetchKick()');
  t('A2 pzPaintSkeleton apaga el splash de arranque al pintar el shell', has(paintSrc, 'bootSplashOff();'));

  // Estándar de carga: ruedita #2793C8 + línea de estado; mueren los puntitos.
  const skelSrc = sliceFn(app, 'function pzSkeletonHTML(tab) {', 'function pzPaintSkeleton(tab) {');
  t('A3 el esqueleto es la ruedita del estándar con su línea de estado',
    has(skelSrc, 'pz-spin') && has(skelSrc, 'pz-load-txt') && !has(skelSrc, 'pz-dot'));
  t('A4 styles.css trae la ruedita en el azul de marca y ya no anima puntitos',
    has(css, '.pz-spin{') && has(css, 'border-top-color:#2793C8') && has(css, '@keyframes pz-spin-rot') && !has(css, 'pz-dot-bounce'));
  const bootDiv = sliceFn(idx, '<div id="posty-boot"', '<script>');
  t('A5 el splash de index.html es la ruedita con «Cargando…», sin puntitos',
    has(bootDiv, 'pz-boot-spin') && has(bootDiv, 'pz-boot-txt') && !has(bootDiv, 'pz-dot'));

  // (b) Paralelo y corto: una sola ventana de 8 s para los tres pedidos.
  t('A6 el timeout propio de la vista de Ads es 8000 ms', has(app, 'const PZ_ADS_TIMEOUT = 8000;'));
  const cargarSrc = sliceFn(app, 'async function pzAdsCargarDatos() {', 'async function adsView() {');
  t('A7 pzAdsCargarDatos corre estado y boosts en paralelo con ese timeout',
    has(cargarSrc, 'Promise.all') && has(cargarSrc, 'pzBoostLoad({ timeout: PZ_ADS_TIMEOUT })') && has(cargarSrc, "'/api/ads/boosts'"));
  const boostSrc = sliceFn(app, 'async function pzBoostLoad(opts) {', 'function pzBoostEnsureSheets()');
  t('A8 pzBoostLoad corre billetera y elegibles en paralelo (antes en serie)',
    has(boostSrc, 'Promise.all') && has(boostSrc, "'/api/ads/billetera'") && has(boostSrc, 'elegibles?incluir_impulsados=1'));
  t('A9 sin opts, pzBoostLoad sigue con api.get de siempre (demás llamadores intactos)',
    has(boostSrc, ': api.get(u)'));

  // Camino tibio: último estado al instante + refresco en segundo plano.
  const adsViewSrc = sliceFn(app, 'async function adsView() {', 'function pzAdsHistorialHTML(boosts) {');
  t('A10 con estado cargado, adsView devuelve al instante y refresca en fondo',
    has(adsViewSrc, 'pzBoostState && pzBoostState.billetera') && has(adsViewSrc, 'pzAdsPintar()'));

  // (c) La guarda no recarga en caliente fuera de Inicio.
  const guardSrc = sliceFn(app, 'function pzVGuardTab() {', 'document.addEventListener(\'visibilitychange\'');
  t('A11 la guarda conoce la pestaña actual y el camino de recarga con sello',
    has(guardSrc, 'function pzVGuardTab()') && has(guardSrc, 'function pzVGuardReload(build)') && has(guardSrc, "sessionStorage.getItem(key)"));
  t('A12 fuera de Inicio la actualización queda diferida en sessionStorage, en silencio',
    has(guardSrc, "sessionStorage.setItem('pz_vguard_pending', String(d.build))"));
  t('A13 la deferral no consume la marca una-vez-por-build (se escribe recién al recargar)',
    has(guardSrc, "const key = 'pz_vguard_' + build;"));
  t('A14 aterrizar en Inicio aplica lo diferido (hook en render)',
    has(app, "if (tab === 'inicio') { try { pzVersionGuardApplyPending(); } catch (e) {} }") && has(guardSrc, 'function pzVersionGuardApplyPending()'));
  t('A15 el tope de un chequeo por minuto sigue intacto', has(app, 'if (now - PZ_VGUARD_LAST < 60000) return;'));

  // M78: todo lo que el lote nombra existe definido en el bundle.
  const nuevas = ['pzAdsCargarDatos', 'pzVGuardTab', 'pzVGuardReload', 'pzVersionGuardApplyPending'];
  t('A16 M78 — las funciones nuevas del lote existen definidas',
    nuevas.every((f) => has(app, 'function ' + f) || has(app, 'async function ' + f)));
}

// ================= Parte B =================
function boot(root, port, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: ADMIN, SUPERVISION_HOOK_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  return { srv, getLog: () => log };
}
async function waitUp(base, tries) {
  for (let i = 0; i < (tries || 60); i++) {
    try { const r = await fetch(base + '/api/version'); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function parteB() {
  console.log('— B · boot real —');
  const { srv, getLog } = boot(ROOT, PORT, tmpDir);
  try {
    t('B1 el servidor del lote levanta', await waitUp(BASE), getLog().slice(-300));
    let jar = '';
    const call = async (method, url, body) => {
      const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', Cookie: jar }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0];
      return { status: r.status, json: await r.json().catch(() => null), text: '' };
    };
    const reg = await call('POST', '/api/auth/register', { email: 'traba-suite@example.com', password: 'secreto1' });
    t('B2 la cuenta sembrada se registra', reg.status === 200, 'status ' + reg.status);
    // (iv) los datos de Ads llegan iguales que hoy: mismos endpoints, mismas formas.
    const bil = await call('GET', '/api/ads/billetera');
    t('B3 billetera responde como hoy (ok + balance_cents)', !!(bil.json && bil.json.ok === true && typeof bil.json.balance_cents === 'number'), JSON.stringify(bil.json).slice(0, 160));
    const eli = await call('GET', '/api/ads/billetera/elegibles?incluir_impulsados=1');
    t('B4 elegibles responde como hoy (ok + lista)', !!(eli.json && eli.json.ok === true && Array.isArray(eli.json.elegibles)), JSON.stringify(eli.json).slice(0, 160));
    const boo = await call('GET', '/api/ads/boosts');
    t('B5 boosts responde como hoy (ok + lista)', !!(boo.json && boo.json.ok === true && Array.isArray(boo.json.boosts)), JSON.stringify(boo.json).slice(0, 160));
    // El HTML servido trae el splash nuevo y el bundle del lote.
    const home = await (await fetch(BASE + '/')).text();
    const bootDiv = home.slice(home.indexOf('<div id="posty-boot"'), home.indexOf('<div id="posty-boot"') + 400);
    t('B6 el HTML servido trae el splash de la ruedita, sin puntitos', has(bootDiv, 'pz-boot-spin') && !has(bootDiv, 'pz-dot'), bootDiv.slice(0, 200));
    const bundle = await (await fetch(BASE + '/app.js')).text();
    t('B7 el bundle servido es el del lote (rama de Ads con esqueleto + guarda diferida)',
      has(bundle, "tab === 'ads') { pzPaintSkeleton(tab);") && has(bundle, 'pz_vguard_pending'));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ================= Parte C =================
function parteC() {
  console.log('— C · control contra la base (el defecto) —');
  if (!fs.existsSync(path.join(BASE_DIR, 'public', 'app.js'))) { console.log('  (sin árbol base en ' + BASE_DIR + ' — se salta)'); return; }
  const appB = fs.readFileSync(path.join(BASE_DIR, 'public', 'app.js'), 'utf8');
  const idxB = fs.readFileSync(path.join(BASE_DIR, 'public', 'index.html'), 'utf8');
  t('C1 en la base la rama de Ads NO pinta esqueleto (el defecto)',
    has(appB, "else if (tab === 'ads') { content = await adsView(); }") && !has(appB, "tab === 'ads') { pzPaintSkeleton"));
  t('C2 en la base el esqueleto son los 3 puntitos', has(appB, 'pz-dot pz-dot-1'));
  t('C3 en la base la guarda recarga sin diferir (sin pz_vguard_pending)', !has(appB, 'pz_vguard_pending'));
  t('C4 en la base el splash de index.html son los 3 puntitos', has(idxB, 'pz-dot pz-dot-1'));
}

(async () => {
  parteA();
  await parteB();
  parteC();
  console.log(`\ntest-lote-ads-se-traba: ${ok} ok, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('excepción', e); process.exit(1); });
