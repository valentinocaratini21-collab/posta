// test-lote-ads-tarjeta-unica.js — LOTE ADS-TARJETA-UNICA (base v1212,
// BUILD v1213). El rediseño de la pestaña Ads aprobado por Valentino
// (opción 1 + la enmienda del selector, mocks en your_files/mock-ads):
//
// - UNA sola tarjeta de plata: el posteo (recomendado o «TU
//   ELECCIÓN»), los montos una sola vez (pauta + gestión = total), el
//   cartel de la diferencia INTOCABLE cuando el saldo no llega (con
//   el cartel puesto, el desglose no se repite) y UN solo botón.
// - El selector EN EL LUGAR: la fila tranquila abre la grilla del
//   feed del propio negocio (endpoint /api/ads/billetera/feed, que ya
//   existía) y al tocar un posteo la misma tarjeta se rearma como
//   «TU ELECCIÓN» — montos, total y faltante idénticos.
// - La conexión comprimida a su línea de estado en la tarjeta de
//   filas; el detalle completo y «Cambiar conexión» (RECONEXION-ADS)
//   se abren en el lugar. La billetera pasa a ser una fila con el
//   saldo; sus herramientas (cargar, tarjeta, Apple Pay) se abren en
//   el lugar con los mismos ids y onclicks.
// - «Tus impulsos»: sin historial, una línea («Todavía ninguno») y
//   la sección entera desaparece; con historial, la fila con el
//   conteo y las filas de siempre al abrir.
// - El dato cruzado (recomendado «4 de alcance» vs otra tarjeta «5
//   de alcance») se va con las tarjetas chicas: queda UN solo
//   número, el del posteo de la tarjeta, de la única fuente (los
//   elegibles: post_metrics del servidor). La causa raíz queda
//   verificada en la Parte A: el recomendado se elige por engagement
//   (elegirMejorPosteoSemana), no por alcance.
//
// La lógica de impulso, el fee del 10%, la compuerta de billetera y
// las llamadas a Meta NO cambian: pzAdsDiferencia y
// pzAdsTabDiferenciaHTML quedan byte a byte como en la base (Parte
// A), y server.js solo bumpea BUILD_ID (Parte A).
// Uso: node test-lote-ads-tarjeta-unica.js   (corre sobre este árbol;
// con LOTE_BASE_DIR apunta al árbol base para el control prístino).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(ROOT, '..', 'base');
const PORT = 35431;
const BASE = `http://127.0.0.1:${PORT}`;

let ok = 0, mal = 0;
function t(name, cond, extra) { if (cond) { ok++; console.log('  ok', name); } else { mal++; console.log('  MAL', name, extra !== undefined ? ':: ' + String(extra).slice(0, 260) : ''); } }
const has = (s, x) => String(s || '').includes(x);
const count = (s, x) => String(s || '').split(x).length - 1;
function sliceFn(src, desde, hasta) {
  const a = src.indexOf(desde); if (a < 0) return '';
  const b = src.indexOf(hasta, a + desde.length); if (b < 0) return '';
  return src.slice(a, b);
}

const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

// ================= Parte A · fuente y sellos =================
function parteA() {
  console.log('— A · fuente, sellos y causa raíz —');
  t('A1 BUILD_ID del lote en server.js (v1213, una sola vez)',
    count(srv, "const BUILD_ID = '20261105-v1214';") === 1);
  t('A2 PZ_BUILD en paridad en app.js (v1213)',
    count(app, "const PZ_BUILD = '20261105-v1214';") === 1);
  t('A3 index ES: app.js?v=847 + styles.css?v=20261312',
    has(idx, 'app.js?v=847') && has(idx, 'styles.css?v=20261312') && !has(idx, 'app.js?v=846'));
  t('A4 index EN: styles.css?v=20261312 (ambos index)',
    has(idxEN, 'styles.css?v=20261312') && !has(idxEN, 'styles.css?v=20261310'));

  // Las funciones nuevas existen; las reemplazadas ya no están.
  const nuevas = ['pzAdsConexionValor', 'pzAdsBilleteraHTML', 'pzAdsFilasHTML', 'pzAdsFilaToggle',
    'pzAdsFeedAbrir', 'pzAdsFeedGridHTML', 'pzAdsFeedElegir', 'pzAdsElegirCerrar', 'pzAdsElegirHTML', 'pzAdsPickRowHTML'];
  t('A5 las 10 funciones nuevas del lote existen definidas',
    nuevas.every((f) => has(app, 'function ' + f) || has(app, 'async function ' + f)));
  t('A6 las tarjetas chicas y el botón ancho salieron (sin definición ni llamadores)',
    !has(app, 'function pzAdsOtrosHTML') && !has(app, 'function pzAdsOtrosConDatos') &&
    !has(app, 'function pzAdsElegirBtnHTML') && !has(app, 'pzAdsOtrosHTML(') && !has(app, 'pzAdsElegirBtnHTML('));
  t('A7 la selección de siempre queda (pzAdsElegirOtro la usa la grilla)',
    has(app, 'function pzAdsElegirOtro(key)') && has(app, "pzAdsElegirOtro(String(key))"));
  t('A8 la hoja de Impulsar no se tocó (pzBoostPickOpen y su entrada del tab quedan definidos)',
    has(app, 'function pzBoostPickOpen(') && has(app, 'function pzAdsPickOpen()'));

  // El cartel y su cálculo: byte a byte como en la base.
  if (fs.existsSync(path.join(BASE_DIR, 'public', 'app.js'))) {
    const appB = fs.readFileSync(path.join(BASE_DIR, 'public', 'app.js'), 'utf8');
    const dif = (x) => sliceFn(x, 'function pzAdsDiferencia() {', 'function pzAdsAudienciaDiferenciaHTML()');
    const tab = (x) => sliceFn(x, 'function pzAdsTabDiferenciaHTML() {', 'async function pzAdsTabCargarDiferencia');
    t('A9 INTOCABLE: pzAdsDiferencia byte a byte como en la base', dif(app) !== '' && dif(app) === dif(appB));
    t('A10 INTOCABLE: pzAdsTabDiferenciaHTML byte a byte como en la base', tab(app) !== '' && tab(app) === tab(appB));
    const srvB = fs.readFileSync(path.join(BASE_DIR, 'server.js'), 'utf8');
    const difSrv = srv.split('\n').filter((l, i) => l !== srvB.split('\n')[i]);
    t('A11 server.js: la única línea que cambia es BUILD_ID',
      difSrv.length === 1 && has(difSrv[0], 'BUILD_ID'), difSrv.join(' | ').slice(0, 160));
  } else {
    console.log('  (sin árbol base — A9/A10/A11 se saltan)');
  }

  // Causa raíz del dato cruzado, en la fuente del servidor.
  const srvAds = fs.readFileSync(path.join(ROOT, 'ads-billetera.js'), 'utf8');
  const mejor = sliceFn(srv, 'function elegirMejorPosteoSemana(', "app.get('/api/estrategia/mejor-posteo'");
  t('A12 causa raíz: el recomendado se elige por engagement (likes+comentarios+guardados), el alcance solo desempata',
    has(mejor, 'Number(r.likes || 0) + Number(r.comments || 0) + Number(r.saved || 0)') &&
    has(mejor, '(eng(b) - eng(a)) || (Number(b.reach || 0) - Number(a.reach || 0))'));
  t('A13 la única fuente de alcance orgánico es post_metrics vía elegibles (reach de la fila)',
    has(srv, 'COALESCE(m.reach,0) AS reach') && has(srvAds, 'reach: Number(r.reach || 0)'));
  t('A14 la grilla lee el endpoint del feed que ya existía (/api/ads/billetera/feed)',
    has(srv, "app.get('/api/ads/billetera/feed'") && has(app, "api.get('/api/ads/billetera/feed')"));

  // Las clases nuevas están en styles.css.
  t('A15 styles.css trae la fila del selector, las filas y la grilla',
    has(css, '.pz-ads-pickrow{') && has(css, '.pz-ads-rows{') && has(css, '.pz-ads-row{') &&
    has(css, '.pz-ads-grid{') && has(css, '.pz-ads-grid-cell.sel{') && has(css, 'outline:3px solid #2793C8'));
}

// ================= Parte B · comportamiento (VM) =================
function makeCtx(appSrc) {
  const region = sliceFn(appSrc, 'let pzAdsBoosts = [];', 'function pzBoostFeePendienteAdjuntar');
  if (!region) throw new Error('no se pudo extraer la región de Ads');
  const rootEl = { innerHTML: '' };
  const ME = { lang: 'es' };
  const feedResp = { current: { ok: true, posts: [] } };
  const sandbox = {
    console, setTimeout, clearTimeout, Promise, Set, Map, JSON, Math, Number, String, Array, Object, Date, URLSearchParams,
    ME,
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    api: {
      get: async (u) => { if (u === '/api/ads/billetera/feed') return feedResp.current; return { ok: true }; },
      post: async () => ({ ok: true }),
      req: async () => ({}),
    },
    document: { getElementById: (id) => (id === 'pzAdsRoot' ? rootEl : null), createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    window: {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { hash: '', pathname: '/' },
    history: { replaceState() {} },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext('function gzT(es, en) { return (typeof ME !== "undefined" && ME && ME.lang === "en") ? en : es; }', ctx);
  vm.runInContext(region, ctx);
  vm.runInContext(`globalThis.__t = {
    setState(s) { pzBoostState = s; },
    getState() { return pzBoostState; },
    newState() { return pzBoostNewState(); },
    setBoosts(b) { pzAdsBoosts = b; },
    reset() { pzAdsModoElegir = false; pzAdsFilaAbierta = ''; pzAdsFeedPosts = null; pzAdsFeedError = false; pzBoostImpulsados = new Set(); },
    root() { return document.getElementById('pzAdsRoot').innerHTML; },
  };`, ctx);
  return { ctx, rootEl, feedResp, ME };
}

function cargarEstado(ctx, billetera, conexion, elegiblesRaw) {
  const T = ctx.__t;
  const st = T.newState();
  st.billetera = billetera;
  st.conexion = conexion;
  st.elegibles = (elegiblesRaw || []).map((r) => ctx.pzBoostNormPost(r));
  const rec = st.elegibles.find((e) => e.recomendado) || st.elegibles[0] || null;
  if (rec) { st.selPost = rec; st.selId = ctx.pzBoostKey(rec); }
  T.setState(st);
  return st;
}

const CX_FULL = { page_id: '111', page_name: 'Posty ES', ig_id: '222', ig_username: 'posty.communitymanager', ad_account_id: '29027789776849841', ad_account_name: 'Posty' };
const BIL_22 = { currency: 'USD', balance_cents: 2200, billing_provider: null, tarjeta: { tiene: true, last4: '5498' } };
const BIL_100 = { currency: 'USD', balance_cents: 10000, billing_provider: null, tarjeta: { tiene: true, last4: '5498' } };
const ELEG = [
  { post_id: 11, ig_media_id: 'm11', image_path: '/media/rec.jpg', caption: 'el recomendado', reach: 4, likes: 3, comments: 2, saved: 1, recomendado: true, ya_impulsado: false },
  { post_id: 12, ig_media_id: 'm12', image_path: '/media/otro.jpg', caption: 'el otro', reach: 5, likes: 1, comments: 0, saved: 0, recomendado: false, ya_impulsado: false },
];

async function parteB() {
  console.log('— B · comportamiento en VM (árbol del lote) —');
  const { ctx, feedResp } = makeCtx(app);
  const T = ctx.__t;

  // S1 · saldo corto: el cartel manda y la plata se dice una vez.
  T.reset(); T.setBoosts([]);
  cargarEstado(ctx, BIL_22, CX_FULL, ELEG);
  let h = ctx.pzAdsHTML();
  t('S1 el cartel de la diferencia está, con su carga exacta en el lugar',
    has(h, 'Te faltan US$33 para llegar a US$55') && has(h, 'Cargar los US$33 que faltan') && has(h, 'id="pzAdsDifTab"'));
  t('S1 la plata se dice UNA vez: «de gestión de Posty» aparece solo en el cartel (el desglose no se repite)',
    count(h, 'de gestión de Posty') === 1, 'vino ' + count(h, 'de gestión de Posty'));
  t('S1 un solo botón de plata: no hay botón «Impulsar por» conviviendo con el cartel',
    !has(h, 'pzAdsImpulsar(') && count(h, 'pzAdsTabCargarDiferencia') >= 1);
  t('S1 ya no existe la sección de billetera que repetía la plata',
    !has(h, 'pz-ads-wallet') && !has(h, 'Tu Billetera'));
  t('S1 el alcance es uno solo: el del posteo de la tarjeta (4), sin el 5 cruzado de abajo',
    count(h, '4 de alcance') === 1 && !has(h, '5 de alcance'));
  t('S1 la fila Billetera no repite el saldo que ya dijo el cartel (ofrece «Cargar»)',
    has(h, 'pz-ads-row-v">Cargar<span'));

  // S2 · saldo que alcanza: botón único, desglose una vez, filas.
  T.reset(); T.setBoosts([]);
  cargarEstado(ctx, BIL_100, CX_FULL, ELEG);
  h = ctx.pzAdsHTML();
  t('S2 botón único «Impulsar por US$ 55» y desglose una sola vez',
    count(h, 'Impulsar por US$ 55') === 1 && count(h, 'de gestión de Posty') === 1 && !has(h, 'Te faltan'));
  t('S2 la tarjeta es la dorada de siempre y el kick es POSTY RECOMIENDA',
    has(h, 'pz-boost-3d3 pz-ads-rec-card') && has(h, 'POSTY RECOMIENDA'));
  t('S2 la fila tranquila del selector está («¿Otro posteo? Elegilo de tu feed — Elegir otro →»)',
    has(h, 'pz-ads-pickrow') && has(h, 'Elegilo de tu feed') && has(h, 'Elegir otro →'));
  t('S2 la conexión es una línea de estado con el nombre de la cuenta (el detalle queda cerrado)',
    has(h, 'pz-ads-rows') && has(h, 'Conexión') && has(h, '>Posty<') && !has(h, 'pzAdsCambiarConexion'));
  t('S2 «Tus impulsos» sin historial es UNA línea: «Todavía ninguno», sin sección ni caja vacía',
    has(h, 'Todavía ninguno') && !has(h, 'pz-ads-hist') && !has(h, 'pz-ads-empty') && !has(h, 'Todavía no impulsaste'));
  t('S2 la fila Billetera dice el saldo una vez (US$100)',
    count(h, 'US$100') === 1, 'vino ' + count(h, 'US$100'));

  // S2b · la conexión se abre en el lugar: detalle completo + cambiar.
  ctx.pzAdsFilaToggle('conexion');
  h = T.root();
  t('S2b al abrir Conexión: el detalle completo (Página · Instagram · cuenta) y «Cambiar conexión»',
    has(h, 'Conectado: Página Posty ES · Instagram @posty.communitymanager · Cuenta publicitaria Posty') &&
    has(h, 'Cambiar conexión') && has(h, 'id="pzAdsConexionMsg"'));
  ctx.pzAdsFilaToggle('conexion');
  // S2c · la billetera se abre en el lugar: herramientas intactas.
  ctx.pzAdsFilaToggle('billetera');
  h = T.root();
  t('S2c al abrir Billetera: cargar con los montos de siempre, la tarjeta y Apple Pay con sus ids',
    has(h, 'Cargar plata:') && has(h, 'pzAdsCargar(20, this)') && has(h, 'Cambiar tarjeta •••• 5498') &&
    has(h, 'id="pzAdsTarjeta"') && has(h, 'id="pzAdsApplePay"'));
  ctx.pzAdsFilaToggle('billetera');

  // S3 · los montos mandan como siempre (regresión de montos).
  T.reset(); T.setBoosts([]);
  cargarEstado(ctx, BIL_100, CX_FULL, ELEG);
  ctx.pzAdsPintar();
  ctx.pzAdsElegirMonto(20);
  h = T.root();
  t('S3 monto 20: total 22 (20 + 2 de gestión), como en la base',
    has(h, 'Impulsar por US$ 22') && has(h, 'US$ 20 de pauta + US$ 2 de gestión de Posty = US$ 22'));
  ctx.pzAdsElegirMonto(100);
  h = T.root();
  t('S3 monto 100 con saldo 100: el cartel sigue al monto elegido (faltan US$10 para US$110)',
    has(h, 'Te faltan US$10 para llegar a US$110') && !has(h, 'Impulsar por'));
  ctx.pzAdsElegirMonto(50);
  h = T.root();
  t('S3 de vuelta a 50: botón «Impulsar por US$ 55», sin cartel',
    has(h, 'Impulsar por US$ 55') && !has(h, 'Te faltan'));

  // S4 · el selector de punta a punta.
  T.reset(); T.setBoosts([]);
  const st4 = cargarEstado(ctx, BIL_100, CX_FULL, ELEG);
  feedResp.current = { ok: true, posts: [
    { post_id: 11, image_path: '/media/rec.jpg', reach: 4, likes: 3, ya_impulsado: false },
    { post_id: 12, image_path: '/media/otro.jpg', reach: 5, likes: 1, ya_impulsado: false },
  ] };
  await ctx.pzAdsFeedAbrir();
  h = T.root();
  t('S4 el selector abre EN EL LUGAR: encabezado «Elegí el posteo» + grilla del feed (2 celdas)',
    has(h, 'Elegí el posteo') && has(h, 'pz-ads-grid') && count(h, 'pz-ads-grid-cell') === 2);
  t('S4 en la grilla no hay ningún alcance escrito: el único «de alcance» es el de la tarjeta (el recomendado, 4)',
    count(h, 'de alcance') === 1 && has(h, '4 de alcance'));
  ctx.pzAdsFeedElegir('p12');
  h = T.root();
  t('S4 al elegir el otro: la MISMA tarjeta se rearma como «TU ELECCIÓN» con su alcance (5)',
    has(h, 'TU ELECCIÓN') && count(h, '5 de alcance') === 1 && ctx.__t.getState().selPost.post_id === 12);
  t('S4 la plata NO se mueve con el posteo: mismo monto elegido (50) y mismo total (US$ 55)',
    ctx.__t.getState().selMonto === 50 && has(h, 'Impulsar por US$ 55') && count(h, 'de gestión de Posty') === 1);
  ctx.pzAdsElegirCerrar();
  h = T.root();
  t('S4 «Volver» sale del modo elegir y la elección queda (kick TU ELECCIÓN en la vista normal)',
    !has(h, 'pz-ads-grid') && has(h, 'TU ELECCIÓN') && has(h, 'pz-ads-pickrow'));
  t('S4 el recomendado sigue siendo el del servidor (la elección no lo pisa en los elegibles)',
    st4.elegibles[0].recomendado === true);

  // S5 · sin conexión: la tarjeta reducida de siempre + fila honesta.
  T.reset(); T.setBoosts([]);
  const st5 = cargarEstado(ctx, BIL_100, null, ELEG);
  st5.adsReady = false; st5.motivoGate = 'sin_autorizacion_publicitaria';
  h = ctx.pzAdsHTML();
  t('S5 sin autorización: la tarjeta reducida (conectar la cuenta), sin montos ni impulso',
    has(h, 'Conectar mi cuenta publicitaria') && has(h, 'No se gastó nada.') && !has(h, 'pz-ads-amounts') && !has(h, 'pzAdsImpulsar('));
  t('S5 la fila Conexión dice «Sin conectar»',
    has(h, 'Sin conectar'));
  ctx.pzAdsPintar(); ctx.pzAdsFilaToggle('conexion');
  h = T.root();
  t('S5 el detalle de conexión ofrece conectar la cuenta (mismo camino de RECONEXION-ADS)',
    has(h, 'Conectar mi cuenta publicitaria') && has(h, 'pzAdsCambiarConexion(this)'));

  // S6 · con historial: la forma mínima.
  T.reset();
  cargarEstado(ctx, BIL_100, CX_FULL, ELEG);
  T.setBoosts([
    { id: 1, monto: 50, dias: 7, status: 'activa', last_reach: 120, created_at: '2026-11-18T10:00:00Z', ig_media_id: 'm9' },
    { id: 2, monto: 20, dias: 7, status: 'finalizada', last_reach: 40, created_at: '2026-11-15T10:00:00Z', ig_media_id: 'm8' },
  ]);
  ctx.pzAdsPintar();
  h = T.root();
  t('S6 con historial la fila dice el conteo (2) y la sección vieja no existe',
    has(h, 'pz-ads-rows') && !has(h, 'pz-ads-hist'));
  ctx.pzAdsFilaToggle('impulsos');
  h = T.root();
  t('S6 al abrir: las filas de siempre, con el alcance DE LA CAMPAÑA (last_reach, otro dato declarado)',
    has(h, 'id="pzAdsHist"') && has(h, 'Alcance 120') && has(h, 'US$ 50'));

  // S7 · ya impulsado: sin botón ni cartel, con saldo cero.
  T.reset(); T.setBoosts([]);
  const st7 = cargarEstado(ctx, { currency: 'USD', balance_cents: 0, billing_provider: null, tarjeta: null }, CX_FULL,
    [{ post_id: 11, ig_media_id: 'm11', image_path: '/media/rec.jpg', reach: 4, likes: 3, comments: 2, saved: 1, recomendado: true, ya_impulsado: true }]);
  h = ctx.pzAdsHTML();
  t('S7 posteo ya impulsado: el bloque «ya está impulsado», sin botón y sin cartel',
    has(h, 'Este posteo ya está impulsado') && !has(h, 'pzAdsImpulsar(') && !has(h, 'Te faltan'));

  // S8 · sin posteos: la tarjeta honesta, sin selector.
  T.reset(); T.setBoosts([]);
  cargarEstado(ctx, BIL_100, CX_FULL, []);
  h = ctx.pzAdsHTML();
  t('S8 sin posteos con resultados: la nota honesta y ninguna fila de selector',
    has(h, 'Todavía no hay un posteo con resultados reales') && !has(h, 'pz-ads-pickrow'));

  // S9 · riel MP: los montos del riel, sin cartel en dólares.
  T.reset(); T.setBoosts([]);
  cargarEstado(ctx, { currency: 'ARS', balance_cents: 5000000, billing_provider: 'mp', presupuestos_ars: [5000, 10000, 20000], tarjeta: null }, CX_FULL, ELEG);
  h = ctx.pzAdsHTML();
  t('S9 riel MP: montos en pesos del riel (5.000 / 10.000 / 20.000) y ningún cartel «Te faltan US$»',
    has(h, '$5.000') && has(h, '$10.000') && has(h, '$20.000') && !has(h, 'Te faltan US$'));

  // S10 · censo de onclicks: todo handler que la vista nombra existe.
  const handlers = new Set();
  [h].forEach((x) => { for (const m of String(x).matchAll(/onclick="([a-zA-Z0-9_]+)\(/g)) handlers.add(m[1]); });
  T.reset(); T.setBoosts([]); cargarEstado(ctx, BIL_22, CX_FULL, ELEG);
  const hAll = ctx.pzAdsHTML();
  for (const m of hAll.matchAll(/onclick="([a-zA-Z0-9_]+)\(/g)) handlers.add(m[1]);
  const faltan = [...handlers].filter((f) => !new RegExp('(function\\s+' + f + '\\s*\\()|(\\b' + f + '\\s*=\\s*(async\\s*)?\\()|(\\b' + f + '\\s*=\\s*(async\\s+)?function)').test(app));
  t('S10 funciones auditadas: todo onclick de la vista nueva existe definido en el bundle',
    faltan.length === 0, 'faltan: ' + faltan.join(','));
}

// ================= Parte C · boot real =================
function boot(root, port, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '', FAL_KEY: '', ADMIN_TOKEN: 'adm-tarjeta-unica', SUPERVISION_HOOK_URL: '' },
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
async function parteC() {
  console.log('— C · boot real —');
  const tmpDir = '/tmp/posta-tarjeta-unica-' + process.pid;
  const { srv, getLog } = boot(ROOT, PORT, tmpDir);
  try {
    t('C1 el servidor del lote levanta', await waitUp(BASE), getLog().slice(-300));
    const ver = await (await fetch(BASE + '/api/version')).json();
    t('C2 /api/version sirve el BUILD del lote (20261105-v1214)', ver.build === '20261105-v1214', 'vino ' + ver.build);
    const home = await (await fetch(BASE + '/')).text();
    t('C3 el index ES servido trae app.js?v=847 y styles.css?v=20261312',
      has(home, 'app.js?v=847') && has(home, 'styles.css?v=20261312'));
    const homeEN = await (await fetch(BASE + '/en/')).text();
    t('C4 el index EN servido trae styles.css?v=20261312', has(homeEN, 'styles.css?v=20261312'));
    let jar = '';
    const call = async (method, url, body) => {
      const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', Cookie: jar }, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) jar = sc.split(';')[0];
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    const reg = await call('POST', '/api/auth/register', { email: 'tarjeta-unica@example.com', password: 'secreto1' });
    t('C5 la cuenta sembrada se registra', reg.status === 200, 'status ' + reg.status);
    const feed = await call('GET', '/api/ads/billetera/feed');
    t('C6 el endpoint del feed responde como hoy (ok + posts)',
      !!(feed.json && feed.json.ok === true && Array.isArray(feed.json.posts)), JSON.stringify(feed.json).slice(0, 140));
    const eli = await call('GET', '/api/ads/billetera/elegibles?incluir_impulsados=1');
    t('C7 elegibles responde como hoy (ok + lista + conexion)',
      !!(eli.json && eli.json.ok === true && Array.isArray(eli.json.elegibles) && 'conexion' in eli.json));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ================= Parte D · control prístino =================
async function parteD() {
  console.log('— D · control contra la base (la pantalla vieja) —');
  const baseAppPath = path.join(BASE_DIR, 'public', 'app.js');
  if (!fs.existsSync(baseAppPath)) { console.log('  (sin árbol base en ' + BASE_DIR + ' — se salta)'); return; }
  const appB = fs.readFileSync(baseAppPath, 'utf8');
  const { ctx } = makeCtx(appB);
  const T = ctx.__t;
  T.reset(); T.setBoosts([]);
  cargarEstado(ctx, BIL_22, CX_FULL, ELEG);
  const h = ctx.pzAdsHTML();
  t('D1 en la base la plata se dice DOS veces con saldo corto (desglose + cartel): el defecto',
    count(h, 'de gestión de Posty') === 2, 'vino ' + count(h, 'de gestión de Posty'));
  t('D2 en la base viven la sección de billetera y la sección «Tus impulsos» enteras',
    has(h, 'pz-ads-wallet') && has(h, 'pz-ads-hist') && has(h, 'Todavía no impulsaste'));
  t('D3 en la base el dato cruzado se ve: 4 de alcance en la tarjeta y 5 en la chica de abajo',
    has(h, '4 de alcance') && has(h, '5 de alcance'));
  t('D4 en la base no hay tarjeta de filas ni grilla en el lugar',
    !has(h, 'pz-ads-rows') && !has(h, 'pz-ads-grid'));
}

(async () => {
  parteA();
  await parteB();
  await parteC();
  await parteD();
  console.log(`\ntest-lote-ads-tarjeta-unica: ${ok} ok, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('excepción', e); process.exit(1); });
