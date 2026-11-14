// (LOTE TARJETA-IMPULSAR, 13/11 + ADDENDUM del fee: pins V2–V5, V11,
// M3–M6, ARS2–ARS4, ARS6 y ARS7 actualizados 1:1 al rediseño aprobado
// — línea única con números reales sin caption, montos que ELIGEN
// (pzAdsElegirMonto) con la moneda dicha una sola vez, botón con el
// TOTAL pauta + 10% de gestión, garantía-regla del fee sin billetera,
// fuera «Elegir otro posteo», historial vacío en una línea. El mapeo
// completo pin a pin está en el STATUS del lote TARJETA-IMPULSAR.)
// test-lote-post-grande-ads-lindo.js — LOTE POST-GRANDE-ADS-LINDO (11/11 ·
// Valentino 13:01: «que se vea mas grande el posteo de hoy, y un diseno
// mas lindo de la pantalla de "ads"»):
// 1) POSTEO DE HOY MÁS GRANDE (Inicio): el posteo del día pasa de tarjeta
//    compacta horizontal (thumb 96×120) a HÉROE a todo el ancho (foto 4:5,
//    caption completo sin clamp, «Ver el posteo completo», franja verde
//    Agendado). La grilla 3×3 sigue debajo, intacta. El héroe va ARRIBA
//    de la grilla (hoyAprobarHTML antes que gridHTML en inicioView).
// 2) ADS COMO EL MOCK inicio-y-ads-mock-3-tabs (referencia exacta, no un
//    diseño nuevo): título + sub, billetera con ícono + «Tu Billetera»,
//    kick POSTY RECOMIENDA · IMPULSAR, recomendado con foto 92×92 + h4 +
//    motivo, 3 montos en fila ($50 RECOMENDADO · 7 DÍAS), botón grande
//    «Impulsar por US$ 50», fineprint de crédito, «Elegir otro posteo»
//    como link, «Tus impulsos» + vacío honesto. Funcionalidad IGUAL:
//    mismos montos, mismo recomendado, misma billetera, mismo historial,
//    mismas rutas/API. Sin métricas inventadas (la línea de alcance del
//    mock NO se copia: regla de verdad).
// Node puro: asserts estáticos + VM con DOM falso (harness del TAB ADS).
// Uso: node test-lote-post-grande-ads-lindo.js (desde el scratch; corre
// contra release/ si existe, si no contra el árbol de este directorio).
// Sale 0 si todo pasa.
// PINS PROVISIONALES (el preparador los re-pinea al BUILD asignado):
// BUILD 20261105-v897 · app.js?v=611 · styles?v=20261236.
// La frase «Te armé el posteo de hoy» queda ×1 tras el re-base a v895
// (SACAR-FRASE): solo la del chat; la de Inicio la quitó v895 (S14).
'use strict';
const fs = require('fs');
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
const DEST = fs.readFileSync(path.join(TREE, 'destacado-semana.js'), 'utf8');
const ADBIL = fs.readFileSync(path.join(TREE, 'ads-billetera.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- estampado ----------
t('S1: server BUILD v897 ×1', SRV.includes("const BUILD_ID = '20261105-v897';") && cnt(SRV, '20261105-v897') === 1);
t('S2: index ES app.js?v=611 ×1 + styles?v=20261236 ×1', cnt(IDX, 'app.js?v=611') === 1 && cnt(IDX, 'styles.css?v=20261236') === 1);
t('S3: index EN styles?v=20261236 ×1 y sin app.js?v=', cnt(IDXEN, 'styles.css?v=20261236') === 1 && !IDXEN.includes('app.js?v='));

// ---------- héroe: CSS ----------
t('S4: styles.css trae el bloque héroe (.pz-hoy-hero-media/img/caption/link/ok)', CSS.includes('.pz-hoy-hero-media') && CSS.includes('.pz-hoy-hero-img') && CSS.includes('.pz-hoy-hero-caption') && CSS.includes('.pz-hoy-hero-link') && CSS.includes('.pz-hoy-ok'));
t('S5: la foto héroe es a todo el ancho con ratio 4:5 (como el mock)', /\.pz-hoy-hero-img\{[^}]*width:100%;[^}]*aspect-ratio:4\/5/.test(CSS), (CSS.match(/\.pz-hoy-hero-img\{[^}]*\}/) || ['(sin regla)'])[0]);
t('S6: el caption héroe NO tiene clamp (completo, como el mock)', (() => {
  const r = (CSS.match(/\.pz-hoy-hero-caption\{[^}]*\}/) || [''])[0];
  return r.includes('16.5px') && !r.includes('line-clamp') && !r.includes('-webkit-line-clamp');
})(), (CSS.match(/\.pz-hoy-hero-caption\{[^}]*\}/) || ['(sin regla)'])[0]);
// Medida concreta del héroe vs la miniatura compacta (base v894):
// thumb 96×120 = 11.520 px². Héroe a 390px, con ancho de contenido
// CONSERVADOR de 320px menos 28px de padding de la tarjeta: 292px de
// ancho × 365px de alto (ratio 4:5) = 106.580 px² → ~9,25× más grande.
// (El ancho real es mayor: .hf-wrap tiene padding horizontal 0 y la
// media es full-bleed con margen negativo, así que la foto ocupa casi
// los 390px.) Se afirma ratio > 5×.
t('S7: el héroe es > 5× más grande que la miniatura compacta (área)', (() => {
  const thumb = (CSS.match(/\.pz-hoy-thumb\{[^}]*width:(\d+)px;[^}]*height:(\d+)px/) || []) ;
  const tw = Number(thumb[1] || 96), th = Number(thumb[2] || 120);
  const ratioOK = /\.pz-hoy-hero-img\{[^}]*aspect-ratio:4\/5/.test(CSS);
  const heroW = 320 - 28, heroH = heroW * 5 / 4;
  const ratio = (heroW * heroH) / (tw * th);
  console.log('    (medida héroe: ' + heroW + '×' + heroH + ' = ' + Math.round(heroW * heroH) + ' px² vs thumb ' + tw + '×' + th + ' = ' + (tw * th) + ' px² → ratio ' + ratio.toFixed(2) + '×)');
  return ratioOK && ratio > 5;
})());

// ---------- héroe: cableado ----------
const hoyCardSrc = sliceFn(SRC, 'function pzHoyCardHTML(p, o) {', 'function pzHoyHoyHTML(p, o) {');
t('S8: pzHoyCardHTML tiene la rama héroe (o.hero) ANTES del return compacto', hoyCardSrc.includes('if (o && o.hero) {') && hoyCardSrc.indexOf('if (o && o.hero) {') < hoyCardSrc.indexOf('return `<article class="card pz-hoy-card"'));
t('S9: la rama compacta sigue existiendo (pz-hoy-thumb) para los demás llamadores', hoyCardSrc.includes('pz-hoy-thumb'));
t('S10: pzHoyHoyHTML pasa hero:true al posteo de hoy', sliceFn(SRC, 'function pzHoyHoyHTML(p, o) {', 'function pzHoySpeechHTML').includes('hero: true'));
t('S11: el héroe usa el binder genérico data-pz-hoy-detalle (foto + link al detalle)', hoyCardSrc.includes('data-pz-hoy-detalle') && cnt(hoyCardSrc, 'data-pz-hoy-detalle') >= 2);

// ---------- grilla 3×3 intacta + orden ----------
t('S12: la grilla 3×3 sigue intacta (.hf-grid repeat(3) + homeTileHTML + badge HOY del posteo de hoy)', CSS.includes('.hf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))') && SRC.includes('function homeTileHTML(') && SRC.includes('hf-hoy-badge') && SRC.includes("'HOY'"));
t('S13: en inicioView el héroe (hoyAprobarHTML) va ANTES de la grilla (gridHTML)', (() => {
  const iv = sliceFn(SRC, 'async function inicioView() {', '/* ===== LOTE REDISENO-R2');
  const ret = iv.slice(iv.indexOf('return `<div id="inicioView"'));
  return ret.indexOf('${hoyAprobarHTML}') !== -1 && ret.indexOf('${gridHTML}') !== -1 && ret.indexOf('${hoyAprobarHTML}') < ret.indexOf('${gridHTML}');
})());

// ---------- frase (base v894; el preparador re-pinea a ×1 tras re-base a v895) ----------
t('S14: la frase de anuncio queda ×1 en v895 (la del chat; la de Inicio la quitó v895)', cnt(SRC, 'Te armé el posteo de hoy') === 1 && cnt(SRC, "I put together today's post for you") === 1);

// ---------- Ads como el mock: CSS ----------
t('S15: styles.css trae el bloque Ads del mock (sub/wicon/kick/rec-top/amounts/tag/big/other/empty)', ['.pz-ads-sub', '.pz-ads-wicon', '.pz-ads-kick', '.pz-ads-rec-top', '.pz-ads-amounts', '.pz-ads-amount', '.pz-ads-tag', '.pz-ads-big', '.pz-ads-other', '.pz-ads-empty'].every((c) => CSS.includes(c)));
t('S16: el título Ads es 24px (mock) y la billetera es tarjeta blanca (mock)', /\.pz-ads-title\{[^}]*font-size:24px/.test(CSS) && /\.pz-ads-wallet\{[^}]*background:#fff/.test(CSS));
t('S17: el CSS del tab v894 sigue (título, billetera, crédito, historial, hecho)', CSS.includes('.pz-ads-title') && CSS.includes('.pz-ads-wallet') && CSS.includes('.pz-ads-credito') && CSS.includes('.pz-ads-hist') && CSS.includes('.pz-ads-hecho'));

// ---------- riel v885 + reglas v888 intactos ----------
t('S18: el riel sigue intacto (impulsar por /api/ads/billetera/impulsar)', SRC.includes("api.post('/api/ads/billetera/impulsar'"));
t('S19: los montos del riel siguen $20/$50/$100', SRC.includes('return [20, 50, 100];'));
t('S20: la tasa USD→ARS 1425 sigue en el servidor (v888)', SRV.includes('1425'));
t('S21: la hoja v880 sigue intacta (fallback del tab)', SRC.includes('function pzBoostPintarBoost()') && SRC.includes('pz-boost-3d3-main'));
t('S22: la línea de alcance inventada del mock NO se copió (regla de verdad)', !SRC.includes('personas alcanzadas') && !SRC.includes('en los próximos 7 días'));

// ---------- ARS: la moneda mostrada es la del riel de pago ----------
t('S23: la tasa USD→ARS vigente es 1425 (v888, default en código)', DEST.includes('IMPULSO_TASA_ARS_DEFAULT = 1425'));
t('S24: los montos ARS del riel existen (impulso $5.000/$10.000/$20.000 · carga $10.000/$20.000/$50.000)', ADBIL.includes('MONTOS_IMPULSO_ARS = [5000, 10000, 20000]') && ADBIL.includes('MONTOS_CARGA_ARS = [10000, 20000, 50000]'));
t('S25: pzAdsHTML toma la moneda del RIEL (pzBoostEsMP), no de la billetera', (() => {
  const a = sliceFn(SRC, 'function pzAdsHTML() {', 'function pzAdsPintar()');
  return a.includes("const moneda = pzBoostEsMP() ? 'ARS' : 'USD';") && !a.includes('bil.currency');
})());

// ---------- sandbox vm (harness del TAB ADS, verificado) ----------
function elStub() {
  return { tagName: 'DIV', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, appendChild() {}, removeChild() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, closest: () => null, getBoundingClientRect: () => ({ width: 390, height: 100, top: 0, left: 0 }), focus() {}, click() {}, blur() {}, innerHTML: '', textContent: '', value: '', hidden: false, src: '', href: '', disabled: false, checked: false, children: [], parentNode: null, isConnected: false };
}
function storeStub() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }; }
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

const POST_HOY = { id: 593, status: 'scheduled', approval: 'approved', media_type: 'video', image_path: '/media/v593.mp4', caption: 'Así se mueve el color cuando posty lo postea. El video, el color, el caption: todo listo. Si tenés un salón, esto lo hago por vos todos los días.', scheduled_at: '2026-11-11 19:00:00' };

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const sb = sandbox;

  // ===== H) el héroe del posteo de hoy =====
  let hero = '';
  try { hero = String(sb.pzHoyCardHTML(POST_HOY, { hero: true, en: false, sinCuando: true })); } catch (e) { hero = 'ERROR: ' + (e && e.message); }
  t('H1: el héroe rinde media a todo el ancho + foto héroe (sin thumb 96×120)', hero.includes('pz-hoy-hero-media') && hero.includes('pz-hoy-hero-img') && !hero.includes('pz-hoy-thumb'), hero.slice(0, 400));
  t('H2: el héroe rinde el caption COMPLETO (sin recorte) + «Ver el posteo completo»', hero.includes('todo listo. Si tenés un salón, esto lo hago por vos todos los días.') && hero.includes('Ver el posteo completo'), hero.slice(0, 600));
  t('H3: el héroe de video muestra badge Reel + botón play (mock)', hero.includes('▶ Reel') && hero.includes('pz-hoy-hero-play'), hero.slice(0, 600));
  t('H4: el héroe rinde la franja verde Agendado + el detalle cableado', (hero.includes('Agendado') || hero.includes('Se postea hoy')) && hero.includes('data-pz-hoy-detalle="593"'), hero.slice(0, 600));
  let heroSinFoto = '';
  try { heroSinFoto = String(sb.pzHoyCardHTML({ id: 594, status: 'scheduled', approval: 'approved', media_type: 'image', image_path: '', caption: 'Sin foto todavía.' }, { hero: true, en: false, sinCuando: true })); } catch (e) { heroSinFoto = 'ERROR: ' + (e && e.message); }
  t('H5: sin imagen, el héroe NO rinde media (nunca un bloque de color)', !heroSinFoto.includes('pz-hoy-hero-media') && heroSinFoto.includes('Sin foto todavía.'), heroSinFoto.slice(0, 300));
  let compacto = '';
  try { compacto = String(sb.pzHoyCardHTML(POST_HOY, { en: false, sinCuando: true })); } catch (e) { compacto = 'ERROR: ' + (e && e.message); }
  t('H6: sin hero:true, la tarjeta sigue siendo la compacta (thumb 96×120)', compacto.includes('pz-hoy-thumb') && !compacto.includes('pz-hoy-hero-media'), compacto.slice(0, 300));

  // ===== V) el tab Ads sigue funcionando (reproducción TAB ADS V1–V11) =====
  let htmlAds = '';
  try { htmlAds = String(await sb.adsView()); } catch (e) { htmlAds = 'ERROR: ' + (e && e.message); }
  t('V1: adsView rinde billetera con el saldo real', htmlAds.includes('Billetera') && htmlAds.includes('$100'), htmlAds.slice(0, 300));
  t('V2: adsView rinde el posteo recomendado con foto + la línea única con los números reales (TARJETA-IMPULSAR)', htmlAds.includes('/media/v593.mp4') && htmlAds.includes('Este fue tu mejor posteo de la semana: 4 de alcance y 2 me gusta. Mostralo más.'), htmlAds.slice(0, 1200));
  t('V3: adsView rinde los 3 montos que se ELIGEN (pzAdsElegirMonto) con $50 RECOMENDADO y la moneda una sola vez (TARJETA-IMPULSAR)', htmlAds.includes('pzAdsElegirMonto(20') && htmlAds.includes('pzAdsElegirMonto(50') && htmlAds.includes('pzAdsElegirMonto(100') && htmlAds.includes('pzAdsImpulsar(50') && htmlAds.includes('RECOMENDADO') && !htmlAds.includes('RECOMENDADO · 7 DÍAS') && htmlAds.includes('En dólares · dura 7 días'), htmlAds.slice(0, 800));
  t('V4: adsView rinde la garantía-regla del fee del addendum (sin billetera ni crédito)', htmlAds.includes('Si el anuncio no se crea o no queda corriendo, no se cobra nada.') && !htmlAds.includes('queda como crédito'), htmlAds.slice(0, 800));
  t('V5: adsView SIN «Elegir otro posteo» (sale por el brief) + «Tus impulsos» con historial real', !htmlAds.includes('Elegir otro posteo') && htmlAds.includes('Tus impulsos') && htmlAds.includes('$50 · 7 días') && htmlAds.includes('Activo'), htmlAds.slice(0, 1200));
  t('V6: adsView rinde Cargar en la billetera', htmlAds.includes('Cargar plata:') && htmlAds.includes('pzAdsCargar(20') && htmlAds.includes('pzAdsCargar(50') && htmlAds.includes('pzAdsCargar(100'));

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

  mockBalanceCents = 2000; // $20: no alcanza para $50
  try { vm.runInContext('pzBoostState = null; pzBoostImpulsados.clear();', sandbox); } catch (e) {}
  fetchCalls.length = 0;
  try { await sb.pzBoostLoad(); } catch (e) {}
  try { await sb.pzAdsImpulsar(50, elStub()); } catch (e) { console.log('FAIL pzAdsImpulsar sin saldo lanzó: ' + (e && e.message)); }
  t('V10: sin saldo, el toque NO postea impulsar (fallback a la hoja)', !fetchCalls.some((c) => c.method === 'POST' && c.url === '/api/ads/billetera/impulsar'));
  mockBalanceCents = 10000;

  try {
    vm.runInContext('pzBoostState = pzBoostNewState(); pzBoostState.billetera = {balance_cents:10000,currency:"USD",billing_provider:null}; pzBoostState.elegibles = []; pzBoostState.selPost = null; pzBoostState.adsReady = true; pzBoostState.boostHabilitado = true; pzBoostState.adsPermiso = true; pzBoostState.motivoGate = null; pzBoostState.conversionPendiente = false;', sandbox);
  } catch (e) { console.log('FAIL setup vacío: ' + (e && e.message)); }
  const htmlVacio = String(sb.pzAdsHTML());
  t('V11: sin recomendado, vacío honesto y SIN «Elegir otro posteo» (nada inventado)', htmlVacio.includes('Todavía no hay un posteo con resultados reales') && !htmlVacio.includes('Elegir otro posteo'));

  // ===== M) Ads como el mock =====
  t('M1: Ads tiene el título + el sub del mock', htmlAds.includes('class="pz-ads-title">Ads</h1>') && htmlAds.includes('Impulsá el posteo que más rindió y traé clientes nuevos.'), htmlAds.slice(0, 300));
  t('M2: la billetera del mock (ícono + «Tu Billetera» + «Crédito para impulsar» + US$100)', htmlAds.includes('pz-ads-wicon') && htmlAds.includes('Tu Billetera') && htmlAds.includes('Crédito para impulsar') && htmlAds.includes('US$100'), htmlAds.slice(0, 600));
  t('M3: el recomendado del mock v3 (kick POSTY RECOMIENDA + foto + línea, SIN h4 con el caption)', htmlAds.includes('POSTY RECOMIENDA') && !htmlAds.includes('POSTY RECOMIENDA · IMPULSAR') && htmlAds.includes('pz-ads-rec-top') && htmlAds.includes('pz-ads-rec-thumb') && !htmlAds.includes('<h4>'), htmlAds.slice(0, 1200));
  t('M4: los montos del mock v3 en fila ($20/$50/$100, moneda una sola vez) + desglose y botón grande con el TOTAL «Impulsar por US$ 55»', htmlAds.includes('<b>$20</b>') && htmlAds.includes('<b>$50</b>') && htmlAds.includes('<b>$100</b>') && !htmlAds.includes('<small>dólares</small>') && htmlAds.includes('US$ 50 de pauta + US$ 5 de gestión de Posty = US$ 55') && htmlAds.includes('Impulsar por US$ 55') && htmlAds.includes('class="pz-ads-big"'), htmlAds.slice(0, 1200));
  t('M5: el fineprint de la tarjeta es la garantía-regla del fee (pz-ads-credito, sin crédito a billetera)', htmlAds.includes('class="pz-ads-credito"') && htmlAds.includes('Si el anuncio no se crea o no queda corriendo, no se cobra nada.'), htmlAds.slice(0, 1200));
  t('M6: el historial vacío es UNA sola línea honesta («Todavía no impulsaste ningún posteo.»)', (() => {
    let h = '';
    try { h = String(sb.pzAdsHistorialHTML([])); } catch (e) { h = 'ERROR'; }
    return h.includes('class="pz-ads-empty"') && h.includes('<b>Todavía no impulsaste ningún posteo.</b>') && !h.includes('Cuando lo hagas');
  })());
  let htmlEN = '';
  try {
    vm.runInContext('ME = {lang:"en"};', sandbox);
    htmlEN = String(sb.pzAdsHTML());
    vm.runInContext('ME = null;', sandbox);
  } catch (e) { htmlEN = 'ERROR: ' + (e && e.message); }
  t('M7: la versión EN rinde en inglés (Your wallet + Boost the post that performed best)', htmlEN.includes('Your wallet') && htmlEN.includes('Boost the post that performed best'), htmlEN.slice(0, 300));

  // ===== ARS) la pantalla muestra la moneda del RIEL de pago =====
  // MP (Argentina): montos ARS, billetera en pesos, «Se cobra en pesos».
  // El riel manda, no la moneda de la billetera (puede ir rezagada: la
  // migración USD→ARS solo corre con saldo 0). El cobro no cambia.
  const MP_BIL = '{balance_cents:1500000,currency:"ARS",billing_provider:"mp",montos_ars:[10000,20000,50000],presupuestos_ars:[5000,10000,20000]}';
  const MP_POST = '{post_id:593,image_path:"/media/v593.mp4",caption:"Así se mueve el color cuando posty lo postea",reach:4,likes:2,comments:0,saves:0,recomendado:true,ya_impulsado:false,publicado_en:"2026-11-11"}';
  const MP_SETUP = 'pzBoostState = pzBoostNewState(); pzBoostState.billetera = ' + MP_BIL + '; pzBoostState.elegibles = [' + MP_POST + ']; pzBoostState.selPost = ' + MP_POST + '; pzBoostState.adsReady = true; pzBoostState.boostHabilitado = true; pzBoostState.adsPermiso = true; pzBoostState.motivoGate = null; pzBoostState.conversionPendiente = false; pzAdsBoosts = [{post_id:592,budget_cents:1000000,currency:"ARS",duration_days:7,status:"active",created_at:"2026-11-10 19:00:00",last_reach:12,last_spend_cents:300000}];';
  try { vm.runInContext(MP_SETUP, sandbox); } catch (e) { console.log('FAIL setup MP: ' + (e && e.message)); }
  const htmlMP = String(sb.pzAdsHTML());
  t('ARS1: usuario MP ve la billetera en pesos ($15.000, sin US$)', htmlMP.includes('$15.000') && !htmlMP.includes('US$') && htmlMP.includes('Crédito para impulsar · en pesos'), htmlMP.slice(0, 500));
  t('ARS2: usuario MP ve los montos ARS en pesos que se ELIGEN ($5.000/$10.000/$20.000, moneda una sola vez)', htmlMP.includes('<b>$5.000</b>') && htmlMP.includes('<b>$10.000</b>') && htmlMP.includes('<b>$20.000</b>') && !htmlMP.includes('<small>pesos</small>') && htmlMP.includes('pzAdsElegirMonto(5000') && htmlMP.includes('pzAdsElegirMonto(10000') && htmlMP.includes('pzAdsElegirMonto(20000') && htmlMP.includes('pzAdsImpulsar(10000') && htmlMP.includes('En pesos · dura 7 días'), htmlMP.slice(0, 1200));
  t('ARS3: usuario MP ve el botón grande en pesos con el TOTAL (Impulsar por $11.000 = $10.000 + 10%)', htmlMP.includes('Impulsar por $11.000') && htmlMP.includes('$10.000 de pauta + $1.000 de gestión de Posty = $11.000'), htmlMP.slice(0, 1200));
  t('ARS4: usuario MP ve la garantía del fee (sin «Se cobra en pesos») + Cargar $10.000/$20.000/$50.000', !htmlMP.includes('Se cobra en pesos.') && htmlMP.includes('Si el anuncio no se crea o no queda corriendo, no se cobra nada.') && htmlMP.includes('pzAdsCargar(10000') && htmlMP.includes('pzAdsCargar(20000') && htmlMP.includes('pzAdsCargar(50000') && htmlMP.includes('$10.000') && htmlMP.includes('$50.000'), htmlMP.slice(0, 1200));
  t('ARS5: el historial MP muestra la moneda del impulso ($10.000 ARS · 7 días)', htmlMP.includes('$10.000 ARS · 7 días') && htmlMP.includes('Activo'), htmlMP.slice(0, 1200));
  // Desajuste 1: MP con billetera todavía en USD (migración pendiente) —
  // la pantalla sigue en ARS porque el que paga es MP.
  try { vm.runInContext('pzBoostState.billetera = {balance_cents:0,currency:"USD",billing_provider:"mp",montos_ars:[10000,20000,50000],presupuestos_ars:[5000,10000,20000]};', sandbox); } catch (e) { console.log('FAIL setup MP/USD: ' + (e && e.message)); }
  const htmlMP2 = String(sb.pzAdsHTML());
  t('ARS6: MP con billetera todavía en USD sigue mostrando ARS (manda el riel)', htmlMP2.includes('En pesos · dura 7 días') && htmlMP2.includes('<b>$10.000</b>') && htmlMP2.includes('de gestión de Posty') && !htmlMP2.includes('US$') && !htmlMP2.includes('dólares'), htmlMP2.slice(0, 800));
  // Desajuste 2: riel Stripe con billetera ARS vieja — la pantalla es USD.
  try { vm.runInContext('pzBoostState.billetera = {balance_cents:10000,currency:"ARS",billing_provider:"stripe",montos_usd:[20,50,100]}; pzBoostState.elegibles = [' + MP_POST + ']; pzBoostState.selPost = ' + MP_POST + ';', sandbox); } catch (e) { console.log('FAIL setup Stripe/ARS: ' + (e && e.message)); }
  const htmlUS2 = String(sb.pzAdsHTML());
  t('ARS7: Stripe con billetera ARS vieja sigue mostrando USD (manda el riel)', htmlUS2.includes('US$') && htmlUS2.includes('En dólares · dura 7 días') && htmlUS2.includes('<b>$50</b>') && !htmlUS2.includes('<small>dólares</small>') && htmlUS2.includes('pzAdsImpulsar(50') && !htmlUS2.includes('pesos') && !htmlUS2.includes('Se cobra en pesos'), htmlUS2.slice(0, 800));
  // El cobro no cambia: MP manda montoARS, Stripe manda montoUSD.
  try { vm.runInContext(MP_SETUP, sandbox); } catch (e) {}
  fetchCalls.length = 0;
  try { await sb.pzAdsImpulsar(10000, elStub()); } catch (e) { console.log('FAIL pzAdsImpulsar MP lanzó: ' + (e && e.message)); }
  const impMP = fetchCalls.find((c) => c.method === 'POST' && c.url === '/api/ads/billetera/impulsar');
  t('ARS8: un toque en $10.000 (MP) postea impulsar con montoARS 10000 (sin montoUSD)', !!impMP && impMP.body && Number(impMP.body.montoARS) === 10000 && Number(impMP.body.posteoId) === 593 && impMP.body.montoUSD === undefined, JSON.stringify(impMP));
  fetchCalls.length = 0;
  try { await sb.pzAdsCargar(10000, elStub()); } catch (e) { console.log('FAIL pzAdsCargar MP lanzó: ' + (e && e.message)); }
  const carMP = fetchCalls.find((c) => c.method === 'POST' && c.url === '/api/ads/billetera/cargar');
  t('ARS9: Cargar $10.000 (MP) postea cargar con montoARS 10000 (sin montoUSD)', !!carMP && carMP.body && Number(carMP.body.montoARS) === 10000 && carMP.body.montoUSD === undefined, JSON.stringify(carMP));

  // ===== M78: todo lo que llama el héroe + el tab existe definido =====
  const FNS = ['adsView', 'pzAdsMontosCarga', 'pzAdsHistorialHTML', 'pzAdsHTML', 'pzAdsPintar', 'pzAdsRefrescar', 'pzAdsImpulsar', 'pzAdsPickOpen', 'pzAdsCargar', 'pzBoostLoad', 'pzBoostMontos', 'pzBoostFmtMonto', 'pzBoostNumerosComa', 'pzBoostRecTexto', 'pzBoostMotivo', 'pzBoostGate', 'pzBoostSaldo', 'pzBoostEsMP', 'pzBoostMinTopup', 'pzBoostPuede', 'pzBoostConfirmar', 'pzBoostOpen', 'pzBoostPickOpen', 'pzBoostCerrar', 'pzBoostPintarBoost', 'pzBoostKey', 'pzBoostNewState', 'gzT', 'pzHoyCardHTML', 'pzHoyHoyHTML', 'pzHoyPillSalida', 'pzHoyHoraCorta', 'pzWhenRelDay', 'pcParseDate', 'pzIc'];
  const faltan = FNS.filter((f) => typeof sb[f] !== 'function');
  let faltanEstado = [];
  try {
    faltanEstado = ['pzBoostState', 'pzBoostImpulsados', 'pzAdsBoosts', 'pzAdsPickDesdeAds', 'esc', 'ME'].filter((n) => {
      try { return vm.runInContext('typeof ' + n + ' === "undefined"', sandbox); } catch (e) { return true; }
    });
  } catch (e) { faltanEstado = ['(no se pudo evaluar el estado)']; }
  t('V12: M78 — todas las funciones que llaman el héroe y el tab existen en el bundle', faltan.length === 0 && faltanEstado.length === 0, 'faltan: ' + faltan.concat(faltanEstado).join(', '));

  console.log(`\ntest-lote-post-grande-ads-lindo: ${pass} ok, ${fail} mal`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL suite: ' + (e && e.stack)); process.exit(2); });
