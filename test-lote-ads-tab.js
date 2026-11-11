// test-lote-ads-tab.js — LOTE TAB-ADS (11/11 · orden Valentino
// «quiero que agreguemos el tab de ads en la app! armalo»):
// 1) Bottom nav con 3 tabs: Inicio · Ads · Chat (Ads → #/app/ads).
// 2) Pantalla Ads propia: billetera + posteo recomendado con montos
//    $20/$50/$100 ($50 RECOMENDADO · 7 DÍAS, cada monto UN TOQUE) +
//    regla de crédito si el anuncio no se crea + «Elegir otro posteo»
//    + «Tus impulsos» (historial real de /api/ads/boosts).
// 3) Inicio SIN tarjeta de Impulsar (vive SOLO en el tab Ads).
// 4) Riel v885 y reglas v888 intactos (tasa 1425, crédito, cobro USD).
// Node puro: asserts estáticos + VM con DOM falso sobre los bloques nuevos.
// Uso: node test-lote-ads-tab.js (desde el scratch; corre contra
// release/ si existe, si no contra el árbol de este directorio).
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = fs.existsSync(path.join(__dirname, 'release', 'server.js'))
  ? path.join(__dirname, 'release') : __dirname;
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- estampado ----------
t('S1: server BUILD v894 ×1', SRV.includes("const BUILD_ID = '20261105-v894';") && cnt(SRV, '20261105-v894') === 1);
t('S2: index ES app.js?v=609 ×1 + styles?v=20261235 ×1', cnt(IDX, 'app.js?v=609') === 1 && cnt(IDX, 'styles.css?v=20261235') === 1);
t('S3: index EN styles?v=20261235 ×1 y sin app.js?v=', cnt(IDXEN, 'styles.css?v=20261235') === 1 && !IDXEN.includes('app.js?v='));

// ---------- bottom nav 3 tabs ----------
const bbBar = SRC.split('\n').find((l) => l.includes('<nav class="bb-bar">')) || '';
t('S4: bottom nav tiene 3 tabs en orden Inicio · Ads · Chat', (() => {
  const i = bbBar.indexOf("tabBtn('inicio'"); const a = bbBar.indexOf("tabBtn('ads'"); const c = bbBar.indexOf("tabBtn('chat'");
  return i !== -1 && a !== -1 && c !== -1 && i < a && a < c;
})(), bbBar.slice(0, 300));
t('S5: tab Ads va a #/app/ads', bbBar.includes("tabBtn('ads', '#/app/ads'"));
t('S6: mxTabKey resuelve ads a ads (tab activo)', SRC.includes("if (tab === 'ads') return 'ads';"));
t('S7: icono ads (megáfono) en el mapa ic', SRC.includes("ads: '<svg") && SRC.includes('M6.5 10 20 5.5v13L6.5 14'));
t('S8: router tab ads → adsView()', SRC.includes("else if (tab === 'ads') { content = await adsView(); }"));

// ---------- Inicio sin tarjeta Impulsar ----------
const inicioSrc = sliceFn(SRC, 'async function inicioView() {', '/* ===== LOTE REDISENO-R2');
t('S9: inicioView ya NO llama a pzHoyImpulsarHTML', !inicioSrc.includes('pzHoyImpulsarHTML('), 'la tarjeta salió de Inicio');
t('S10: pzHoyImpulsarHTML sigue definida (compat + tests vecinos)', SRC.includes('function pzHoyImpulsarHTML(mejor, en) {'));
t('S11: inicioView sigue cargando el recomendado (PZ_HOY_MEJOR para el dedupe v858)', inicioSrc.includes('PZ_HOY_MEJOR = mejorHoy;'));

// ---------- adsView nueva (sin chunk) ----------
const adsViewSrc = sliceFn(SRC, 'async function adsView() {', 'function pzAdsMontosCarga()');
t('S12: adsView rinde pzAdsHTML en #pzAdsRoot', adsViewSrc.includes('pzAdsHTML()') && adsViewSrc.includes('id="pzAdsRoot"'));
t('S13: adsView ya NO carga el chunk analisis', !adsViewSrc.includes("loadChunk('analisis')"));
t('S14: adsView ya NO usa anaAdsTabHTML (vista vieja del chunk)', !adsViewSrc.includes('anaAdsTabHTML()'));
t('S15: adsView carga billetera + elegibles + historial real', adsViewSrc.includes('pzBoostLoad()') && adsViewSrc.includes("api.get('/api/ads/boosts')"));

// ---------- funciones nuevas del tab ----------
const NUEVAS = ['pzAdsMontosCarga', 'pzAdsHistorialHTML', 'pzAdsHTML', 'pzAdsPintar', 'pzAdsRefrescar', 'pzAdsImpulsar', 'pzAdsPickOpen', 'pzAdsCargar'];
t('S16: las 8 funciones pzAds* existen definidas', NUEVAS.every((f) => SRC.includes('function ' + f) || SRC.includes('async function ' + f)));
t('S17: estado del tab (pzAdsBoosts + flag del picker) definido', SRC.includes('let pzAdsBoosts = [];') && SRC.includes('let pzAdsPickDesdeAds = false;'));
t('S18: pzBoostPickConfirmar tiene el modo Ads (no abre la hoja, re-pinta el tab)', sliceFn(SRC, 'function pzBoostPickConfirmar() {', 'function pzBoostElegirMonto').includes('pzAdsPickDesdeAds'));
t('S19: pzBoostConfirmar devuelve j (motivo real para el tab)', sliceFn(SRC, 'async function pzBoostConfirmar(btn) {', '// Marca «Impulsado').includes('return j;'));

// ---------- bindAds nuevo ----------
const bindAdsSrc = sliceFn(SRC, 'function bindAds() {', 'function showStreakCelebration');
t('S20: bindAds nuevo sin cableado del chunk viejo', !bindAdsSrc.includes('[data-topup]') && !bindAdsSrc.includes('bindAdsRecCards') && !bindAdsSrc.includes('adsRecsCard'));
t('S21: bindAds conserva los retornos (MP topup + Stripe tarjeta)', bindAdsSrc.includes("q.get('topup') === 'ok'") && bindAdsSrc.includes("q.get('tarjeta') === 'ok'"));

// ---------- CSS del tab ----------
t('S22: styles.css trae el bloque .pz-ads (título, billetera, crédito, historial)', CSS.includes('.pz-ads-title') && CSS.includes('.pz-ads-wallet') && CSS.includes('.pz-ads-credito') && CSS.includes('.pz-ads-hist') && CSS.includes('.pz-ads-hecho'));

// ---------- riel v885 + reglas v888 intactos ----------
t('S23: el riel sigue intacto (impulsar por /api/ads/billetera/impulsar)', SRC.includes("api.post('/api/ads/billetera/impulsar'"));
t('S24: los montos del riel siguen $20/$50/$100', SRC.includes('return [20, 50, 100];'));
t('S25: la tasa USD→ARS 1425 sigue en el servidor (v888)', SRV.includes('1425'));
t('S26: la hoja v880 sigue intacta (fallback del tab)', SRC.includes('function pzBoostPintarBoost()') && SRC.includes('pz-boost-3d3-main'));

// ---------- sandbox vm (mínimo del patrón inicio-sin-saludo) ----------
// NOTA: app.js declara su propio `const api` (línea 345) y su propio
// `let ME` (línea 2455): un stub de sandbox.api o sandbox.ME quedaría
// tapado. Por eso el stub va en `fetch` (que api.req sí usa) y ME queda
// null (gzT cae al español, que es lo que testean estas asserts).
// Y `pzBoostState`/`pzBoostImpulsados` son `let`: no cuelgan del global,
// así que se leen/escriben con vm.runInContext, no con sandbox.*.
function elStub() {
  return {
    tagName: 'DIV', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild() {}, removeChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    closest: () => null,
    getBoundingClientRect: () => ({ width: 390, height: 100, top: 0, left: 0 }),
    focus() {}, click() {}, blur() {},
    innerHTML: '', textContent: '', value: '', hidden: false,
    src: '', href: '', disabled: false, checked: false,
    children: [], parentNode: null, isConnected: false,
  };
}
function storeStub() {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  s._keys = () => [...m.keys()];
  return s;
}
const locObj = { hash: '#/app/ads', href: 'https://postycommunitymanager.com/#/app/ads', pathname: '/', search: '', host: 'postycommunitymanager.com' };
const elsById = new Map();
['pzAdsRoot', 'pzAdsMsg', 'pzAdsRecMsg', 'pzAdsHist'].forEach((id) => elsById.set(id, elStub()));
let mockBalanceCents = 10000; // $100 USD: alcanza para $50
const fetchCalls = [];
const fetchStub = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) { body = null; }
  fetchCalls.push({ method, url: u, body });
  let data = { ok: true };
  if (u === '/api/ads/billetera') data = { ok: true, balance_cents: mockBalanceCents, currency: 'USD', montos_usd: [20, 50, 100], billing_provider: null, boostHabilitado: true, ads_permiso: true };
  else if (u.startsWith('/api/ads/billetera/elegibles')) data = { ok: true, ads_ready: true, elegibles: [{ post_id: 593, image_path: '/media/v593.mp4', caption: 'Así se mueve el color cuando posty lo postea', reach: 4, likes: 2, comments: 0, saves: 0, recomendado: true, ya_impulsado: false, publicado_en: '2026-11-11' }] };
  else if (u === '/api/ads/boosts') data = { ok: true, boosts: [{ post_id: 592, budget_cents: 5000, currency: 'USD', duration_days: 7, status: 'active', created_at: '2026-11-10 19:00:00', last_reach: 12, last_spend_cents: 3000 }] };
  else if (u === '/api/ads/billetera/impulsar' && method === 'POST') data = { ok: true, balance_cents: mockBalanceCents - (Number((body && body.montoUSD) || 0) * 100) };
  else if (u === '/api/ads/billetera/cargar' && method === 'POST') data = { ok: true, balance_cents: mockBalanceCents + (Number((body && body.montoUSD) || 0) * 100) };
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
};
const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  fetch: fetchStub,
  location: locObj,
  navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', language: 'es-AR', onLine: true },
  localStorage: storeStub(), sessionStorage: storeStub(),
  performance: { now: () => Date.now() },
  AbortSignal, AbortController, URL, URLSearchParams,
  CustomEvent: function CustomEvent() {}, Event: function Event() {},
  Date,
};
sandbox.window = {
  addEventListener() {}, removeEventListener() {},
  innerHeight: 844, innerWidth: 390, location: locObj,
  scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  navigator: sandbox.navigator, document: null,
};
sandbox.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById: (id) => elsById.get(id) || null,
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => elStub(), body: elStub(), documentElement: elStub(),
  title: 'Posty', hidden: false, visibilityState: 'visible',
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
vm.createContext(sandbox);

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const sb = sandbox;

  // ===== V1) adsView rinde la pantalla completa =====
  let htmlAds = '';
  try { htmlAds = String(await sb.adsView()); } catch (e) { htmlAds = 'ERROR: ' + (e && e.message); }
  t('V1: adsView rinde billetera con el saldo real', htmlAds.includes('Billetera') && htmlAds.includes('$100'), htmlAds.slice(0, 300));
  t('V2: adsView rinde el posteo recomendado con foto + motivo real', htmlAds.includes('/media/v593.mp4') && htmlAds.includes('El mejor de tu semana') && htmlAds.includes('4 de alcance, 2 me gusta'), htmlAds.slice(0, 1200));
  t('V3: adsView rinde los 3 montos visibles con $50 RECOMENDADO · 7 DÍAS', htmlAds.includes('pzAdsImpulsar(20') && htmlAds.includes('pzAdsImpulsar(50') && htmlAds.includes('pzAdsImpulsar(100') && htmlAds.includes('RECOMENDADO · 7 DÍAS'), htmlAds.slice(0, 800));
  t('V4: adsView rinde la regla de crédito si el anuncio no se crea', htmlAds.includes('Si el anuncio no se crea, no perdés la plata: queda como crédito en tu billetera.'), htmlAds.slice(0, 800));
  t('V5: adsView rinde «Elegir otro posteo» + «Tus impulsos» con historial real', htmlAds.includes('Elegir otro posteo') && htmlAds.includes('Tus impulsos') && htmlAds.includes('$50 · 7 días') && htmlAds.includes('Activo'), htmlAds.slice(0, 1200));
  t('V6: adsView rinde Cargar en la billetera', htmlAds.includes('Cargar plata:') && htmlAds.includes('pzAdsCargar(20') && htmlAds.includes('pzAdsCargar(50') && htmlAds.includes('pzAdsCargar(100'));

  // ===== V2) un toque en $50 impulsa directo y la tarjeta pasa a Impulsado ✓ =====
  fetchCalls.length = 0;
  const btn = elStub();
  try { await sb.pzAdsImpulsar(50, btn); } catch (e) { console.log('FAIL pzAdsImpulsar lanzó: ' + (e && e.message)); }
  const imp = fetchCalls.find((c) => c.method === 'POST' && c.url === '/api/ads/billetera/impulsar');
  t('V7: un toque en $50 postea impulsar con posteoId 593 + montoUSD 50', !!imp && imp.body && Number(imp.body.posteoId) === 593 && Number(imp.body.montoUSD) === 50, JSON.stringify(imp));
  let yaImp = false;
  try { yaImp = !!vm.runInContext('pzBoostState && pzBoostState.selPost && pzBoostState.selPost.ya_impulsado === true', sandbox); } catch (e) { yaImp = false; }
  t('V8: tras el impulso, el posteo queda marcado impulsado en el estado', yaImp);
  const rootHtml = String((elsById.get('pzAdsRoot') && elsById.get('pzAdsRoot').innerHTML) || '');
  t('V9: tras el impulso, el tab se re-pinta con «ya está impulsado» (sin abrir la hoja)', rootHtml.includes('ya está impulsado'), rootHtml.slice(0, 400));

  // ===== V3) sin saldo, el toque NO impulsa: abre la hoja v880 (fallback) =====
  mockBalanceCents = 2000; // $20: no alcanza para $50
  try { vm.runInContext('pzBoostState = null; pzBoostImpulsados.clear();', sandbox); } catch (e) {}
  fetchCalls.length = 0;
  try { await sb.pzBoostLoad(); } catch (e) {}
  try { await sb.pzAdsImpulsar(50, elStub()); } catch (e) { console.log('FAIL pzAdsImpulsar sin saldo lanzó: ' + (e && e.message)); }
  t('V10: sin saldo, el toque NO postea impulsar (fallback a la hoja)', !fetchCalls.some((c) => c.method === 'POST' && c.url === '/api/ads/billetera/impulsar'));
  mockBalanceCents = 10000;

  // ===== V4) sin recomendado: vacío honesto =====
  try {
    vm.runInContext('pzBoostState = pzBoostNewState(); pzBoostState.billetera = {balance_cents:10000,currency:"USD",billing_provider:null}; pzBoostState.elegibles = []; pzBoostState.selPost = null; pzBoostState.adsReady = true; pzBoostState.boostHabilitado = true; pzBoostState.adsPermiso = true; pzBoostState.motivoGate = null; pzBoostState.conversionPendiente = false;', sandbox);
  } catch (e) { console.log('FAIL setup vacío: ' + (e && e.message)); }
  const htmlVacio = String(sb.pzAdsHTML());
  t('V11: sin recomendado, vacío honesto + «Elegir otro posteo» (nada inventado)', htmlVacio.includes('Todavía no hay un posteo con resultados reales') && htmlVacio.includes('Elegir otro posteo'));

  // ===== V5) M78: todo lo que llama el tab existe definido =====
  const FNS = ['adsView', 'pzAdsMontosCarga', 'pzAdsHistorialHTML', 'pzAdsHTML', 'pzAdsPintar', 'pzAdsRefrescar', 'pzAdsImpulsar', 'pzAdsPickOpen', 'pzAdsCargar', 'pzBoostLoad', 'pzBoostMontos', 'pzBoostFmtMonto', 'pzBoostNumerosComa', 'pzBoostRecTexto', 'pzBoostMotivo', 'pzBoostGate', 'pzBoostSaldo', 'pzBoostEsMP', 'pzBoostMinTopup', 'pzBoostPuede', 'pzBoostConfirmar', 'pzBoostOpen', 'pzBoostPickOpen', 'pzBoostCerrar', 'pzBoostPintarBoost', 'pzBoostKey', 'pzBoostNewState', 'gzT'];
  const faltan = FNS.filter((f) => typeof sb[f] !== 'function');
  // pzBoostState / pzBoostImpulsados / pzAdsBoosts / pzAdsPickDesdeAds son
  // `let` y `esc` es `const` (línea 4): no cuelgan del global, se verifican
  // por typeof dentro del VM.
  let faltanEstado = [];
  try {
    faltanEstado = ['pzBoostState', 'pzBoostImpulsados', 'pzAdsBoosts', 'pzAdsPickDesdeAds', 'esc'].filter((n) => {
      try { return vm.runInContext('typeof ' + n + ' === "undefined"', sandbox); } catch (e) { return true; }
    });
  } catch (e) { faltanEstado = ['(no se pudo evaluar el estado)']; }
  t('V12: M78 — todas las funciones que llama el tab existen en el bundle', faltan.length === 0 && faltanEstado.length === 0, 'faltan: ' + faltan.concat(faltanEstado).join(', '));

  console.log(`\ntest-lote-ads-tab: ${pass} ok, ${fail} mal`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL suite: ' + (e && e.stack)); process.exit(2); });
