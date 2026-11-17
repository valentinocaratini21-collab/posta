// test-lote-ads-guia-cuenta.js — LOTE ADS-GUÍA-CUENTA (aprobado por
// Valentino 17/11 12:20, «dale, armalo»): cuando la conexión
// publicitaria vuelve SIN cuenta, la pantalla del flujo de impulso
// no puede morir en un motivo seco — la misma pantalla muestra la
// guía corta para crearla.
//
// EL LOTE (solo public/app.js):
//  Cuando la compuerta queda en 'sin_cuenta_publicitaria' (el
//  servidor lo manda como 'ads_not_connected' en /elegibles: la fila
//  de la conexión quedó 'sin_cuenta' — el cliente salteó la elección
//  en el diálogo de Meta o su negocio todavía no tiene cuenta
//  publicitaria), las DOS superficies reducidas del flujo de impulso
//  (la tarjeta del tab Ads y la hoja de Impulsar) suman la guía
//  pzAdsGuiaSinCuentaHTML():
//   - un botón que abre Meta en la sección exacta de la
//     configuración donde se crea la cuenta publicitaria
//     (Configuración de Meta Business → Cuentas → Cuentas
//     publicitarias: https://business.facebook.com/latest/settings/ad_accounts
//     — ahí «+ Agregar» ofrece «Crear una cuenta publicitaria
//     nueva»);
//   - el paso a paso mínimo en palabras llanas: crearla (un minuto)
//     → volver → tocar «Conectar mi cuenta publicitaria», y Posty
//     la detecta sola (la detección YA existe: el callback de la
//     vuelta vuelve a enumerar las cuentas y adsReadiness lee la
//     fila fresca en cada carga — no se construyó detección nueva);
//   - el segundo muro silencioso como paso final: sin un medio de
//     pago cargado en Meta, la pauta no puede correr.
//  La guía se pinta SOLO con ese motivo: con
//  'sin_autorizacion_publicitaria', con cualquier otro motivo o con
//  la compuerta abierta, las dos pantallas quedan como estaban.
//  No se tocó server.js (la compuerta y la detección ya estaban),
//  ni meta_ads.js, ni chunk-ajustes.js, ni la tarjeta de público de
//  TARJETA-SIMPLE (v1165).
//
// Qué prueba:
//  A (estático): la guía y su enlace; los textos ES/EN; la
//    interpolación en las dos superficies y SOLO bajo el motivo;
//    invariantes (server.js / meta_ads.js / chunk-ajustes.js byte a
//    byte, sellos, la tarjeta de público de v1165 intacta, el toast
//    de la vuelta y el texto del motivo intactos).
//  B (VM con DOM mínimo): la tarjeta del tab y la hoja pintadas con
//    y sin guía según el motivo, en ES y en EN; la compuerta abierta
//    sin guía; el mapeo de motivos de pzBoostGate intacto.
//  D (boot real): el servidor sirve el build de la base (el builder
//    no estampa) y el bundle servido trae la guía.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-guia-cuenta.js
// (desde el árbol del lote; para el control, copiar a pristine/ y correr ahí.)
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PRISTINE = path.join(ROOT, '..', 'pristine');
const PORT = 35411;

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? '::' + String(extra).slice(0, 300) : ''); }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}

// ---------- A. Estático ----------
console.log('== A. Estático ==');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const appCode = stripComments(appSrc);
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const URL_CREAR = 'https://business.facebook.com/latest/settings/ad_accounts';
{
  const guia = fnFrom(appCode, 'function pzAdsGuiaSinCuentaHTML()');
  t(guia.length > 0, 'A1 [FIX] pzAdsGuiaSinCuentaHTML existe');
  t(guia.includes(URL_CREAR) && guia.includes('target="_blank"') && guia.includes('rel="noopener"'),
    'A2 [FIX] el botón de la guía abre la sección de cuentas publicitarias de la configuración de Meta Business, en pestaña nueva');
  t(guia.includes('¿Todavía no tenés una cuenta publicitaria?') && guia.includes('Crear mi cuenta publicitaria en Meta')
    && guia.includes('Crear una cuenta publicitaria nueva') && guia.includes('Posty la detecta sola')
    && guia.includes('sin medio de pago, la pauta no puede correr'),
    'A3 [FIX] textos ES de la guía: título, botón, crear en Meta, detección sola y el medio de pago como paso final');
  t(guia.includes('No ad account yet?') && guia.includes('Create my ad account in Meta')
    && guia.includes('Create a new ad account') && guia.includes('Posty detects it on its own')
    && guia.includes('without one, ads can’t run'),
    'A4 [FIX] textos EN de la guía: título, botón, crear en Meta, detección sola y el medio de pago como paso final');
  const htmlTab = fnFrom(appCode, 'function pzAdsHTML()');
  t(htmlTab.includes("gate.motivo === 'sin_cuenta_publicitaria' ? pzAdsGuiaSinCuentaHTML() : ''"),
    'A5 [FIX] la tarjeta del tab Ads interpola la guía SOLO con el motivo sin_cuenta_publicitaria');
  const hoja = fnFrom(appCode, 'function pzBoostPintarBoost()');
  t(hoja.includes("gate.motivo === 'sin_cuenta_publicitaria' ? pzAdsGuiaSinCuentaHTML() : ''"),
    'A6 [FIX] la hoja de Impulsar interpola la guía SOLO con el motivo sin_cuenta_publicitaria');
  const llamadas = (appCode.match(/pzAdsGuiaSinCuentaHTML\(\)/g) || []).length;
  t(llamadas === 3, 'A7 [INVARIANTE] la guía tiene exactamente 3 apariciones: la definición y las dos superficies', llamadas);
  t(srvSrc === fs.readFileSync(path.join(PRISTINE, 'server.js'), 'utf8'),
    'A8 [INVARIANTE] server.js byte a byte (la compuerta y la detección no se tocaron)');
  t(fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'meta_ads.js'), 'utf8'),
    'A9 [INVARIANTE] meta_ads.js byte a byte');
  t(fs.readFileSync(path.join(ROOT, 'public/chunk-ajustes.js'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'public/chunk-ajustes.js'), 'utf8'),
    'A10 [INVARIANTE] chunk-ajustes.js byte a byte');
  const buildTree = (srvSrc.match(/BUILD_ID = '([^']+)'/) || [])[1];
  const buildPristine = (fs.readFileSync(path.join(PRISTINE, 'server.js'), 'utf8').match(/BUILD_ID = '([^']+)'/) || [])[1];
  t(buildTree === buildPristine && !!buildTree, 'A11 [INVARIANTE] BUILD_ID intacto (el builder no estampa)', buildTree + ' vs ' + buildPristine);
  t(fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'public/index.html'), 'utf8'),
    'A12 [INVARIANTE] public/index.html byte a byte (el sello ?v= no se tocó)');
  const aud = fnFrom(appCode, 'function pzAdsAudienciaHTML()');
  t(aud.length > 0 && !aud.includes('QUIÉN TE COMPRA') && fnFrom(appCode, 'function pzAdsAudienciaDineroHTML()').length > 0,
    'A13 [INVARIANTE] la tarjeta de público de TARJETA-SIMPLE (v1165) intacta: sin §1 y con su línea de dinero');
  const vuelta = fnFrom(appCode, 'function handleIgAdsResult()');
  t(vuelta.includes('Falta la cuenta publicitaria.') && vuelta.includes('elegila — o creala — en el paso de Facebook'),
    'A14 [INVARIANTE] el toast de la vuelta ?igads=sin_cuenta queda como estaba');
  const motivo = fnFrom(appCode, 'function pzBoostMotivo(motivo, monto, cobroId)');
  t(motivo.includes("case 'sin_cuenta_publicitaria':") && motivo.includes('Falta conectar tu cuenta publicitaria.'),
    'A15 [INVARIANTE] el texto del motivo sin_cuenta_publicitaria queda como estaba');
}

// ---------- B. VM con DOM mínimo ----------
console.log('== B. Comportamiento (VM) ==');
const piezas = [
  'let pzAdsBoosts = [];',
  'let pzApplePayMonto = 50;',
  fnFrom(appSrc, 'function pzBoostEsMP()'),
  fnFrom(appSrc, 'function pzBoostFmtMonto(n)'),
  fnFrom(appSrc, 'function pzBoostMontos()'),
  fnFrom(appSrc, 'function pzBoostSaldoUSD()'),
  fnFrom(appSrc, 'function pzBoostSaldo()'),
  fnFrom(appSrc, 'function pzBoostKey(p)'),
  fnFrom(appSrc, 'function pzAdsMontosCarga()'),
  fnFrom(appSrc, 'function pzAdsHistorialHTML(boosts)'),
  fnFrom(appSrc, 'function pzAdsRecLinea(p)'),
  fnFrom(appSrc, 'function pzAdsOtrosConDatos(p)'),
  fnFrom(appSrc, 'function pzAdsOtrosHTML(p)'),
  fnFrom(appSrc, 'function pzAdsElegirBtnHTML()'),
  fnFrom(appSrc, 'function pzBoostGate()'),
  fnFrom(appSrc, 'function pzAdsPaginaSinAutorizar()'),
  fnFrom(appSrc, 'function pzAdsGuiaSinCuentaHTML()'),
  fnFrom(appSrc, 'function pzAdsHTML()'),
  fnFrom(appSrc, 'function pzBoostPintarBoost()'),
].join('\n');
t(piezas.includes('pzAdsGuiaSinCuentaHTML') && piezas.includes('pzAdsHTML') && piezas.includes('pzBoostPintarBoost'),
  'B0 las piezas del flujo extraen enteras del bundle');

const elHoja = { innerHTML: '' };
const sandbox = {
  console, Set, Map, JSON, Number, String, Math, Object, Array, Promise,
  ME: { lang: 'es' },
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  gzT: (es, en) => (sandbox.ME.lang === 'en' ? en : es),
  api: { post: async () => ({ ok: true }), get: async () => null },
  document: { getElementById: (id) => (id === 'pzBoostBody' ? elHoja : null), querySelectorAll: () => [] },
  toast: () => {},
  pzBoostImpulsados: new Set(),
  pzBoostNewState: () => ({}),
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('let pzBoostState = null;\n' + piezas, sandbox);
const enVM = (expr) => vm.runInContext(expr, sandbox);
const POST = { post_id: 42, image_path: '', caption: 'un posteo', recomendado: true, reach: 120, likes: 9, comments: 2, saves: 1, publicado_en: null };
const ponerEstado = (extra) => {
  sandbox.__extra = extra || {};
  sandbox.__post = POST;
  enVM(`pzBoostState = Object.assign({
    elegibles: [__post], billetera: { billing_provider: 'stripe', balance_cents: 2000, currency: 'USD' },
    adsReady: false, motivoGate: 'ads_not_connected', connectUrl: '/api/ig/unified/go', rielAds: '',
    selId: 'p42', selMonto: 50, selPost: __post, boostHabilitado: true, adsPermiso: true,
  }, __extra);`);
};

(async () => {
  // B1: la tarjeta del tab con el motivo sin cuenta — la guía entera (ES)
  ponerEstado({});
  t(enVM('pzBoostGate().motivo') === 'sin_cuenta_publicitaria', 'B1a el mapeo de la compuerta: ads_not_connected → sin_cuenta_publicitaria');
  const tabSin = enVM('pzAdsHTML()');
  t(tabSin.includes('pz-ads-guia') && tabSin.includes(URL_CREAR) && tabSin.includes('¿Todavía no tenés una cuenta publicitaria?')
    && tabSin.includes('Crear mi cuenta publicitaria en Meta') && tabSin.includes('Posty la detecta sola')
    && tabSin.includes('sin medio de pago, la pauta no puede correr'),
    'B1 [FIX] la tarjeta del tab muestra la guía completa en el caso sin cuenta');
  t(tabSin.includes('pzAdsAutorizarPagina(this)') && tabSin.includes('Conectar mi cuenta publicitaria'),
    'B1b la tarjeta reducida conserva su botón de conexión (la guía suma, no reemplaza)');

  // B2: la misma tarjeta con el otro motivo que reduce — sin guía
  ponerEstado({ motivoGate: 'page_not_authorized' });
  t(enVM('pzBoostGate().motivo') === 'sin_autorizacion_publicitaria', 'B2a el mapeo de la compuerta: page_not_authorized → sin_autorizacion_publicitaria');
  const tabAut = enVM('pzAdsHTML()');
  t(tabAut.includes('Conectar mi cuenta publicitaria') && !tabAut.includes('pz-ads-guia') && !tabAut.includes(URL_CREAR),
    'B2 [FIX] con sin_autorizacion_publicitaria la tarjeta se reduce igual pero SIN guía');

  // B3: la guía en inglés
  sandbox.ME.lang = 'en';
  ponerEstado({});
  const tabEN = enVM('pzAdsHTML()');
  t(tabEN.includes('No ad account yet?') && tabEN.includes('Create my ad account in Meta')
    && tabEN.includes('Posty detects it on its own') && tabEN.includes('without one, ads can’t run'),
    'B3 [FIX] la guía se pinta en inglés con ME.lang=en');
  sandbox.ME.lang = 'es';

  // B4/B5: la hoja de Impulsar
  ponerEstado({});
  elHoja.innerHTML = '';
  enVM('pzBoostPintarBoost()');
  t(elHoja.innerHTML.includes('pz-ads-guia') && elHoja.innerHTML.includes(URL_CREAR) && elHoja.innerHTML.includes('Posty la detecta sola'),
    'B4 [FIX] la hoja de Impulsar muestra la guía en el caso sin cuenta');
  ponerEstado({ motivoGate: 'page_not_authorized' });
  elHoja.innerHTML = '';
  enVM('pzBoostPintarBoost()');
  t(elHoja.innerHTML.includes('Conectar mi cuenta publicitaria') && !elHoja.innerHTML.includes('pz-ads-guia') && !elHoja.innerHTML.includes(URL_CREAR),
    'B5 [FIX] la hoja con sin_autorizacion_publicitaria se reduce igual pero SIN guía');

  // B6: compuerta abierta — la tarjeta completa, sin guía
  ponerEstado({ adsReady: true, motivoGate: '' });
  const tabFull = enVM('pzAdsHTML()');
  t(!tabFull.includes('pz-ads-guia') && !tabFull.includes(URL_CREAR) && tabFull.includes('id="pzAdsAudiencia"'),
    'B6 [INVARIANTE] con la compuerta abierta la tarjeta es la completa de siempre y no hay guía');

  // ---------- D. Boot real ----------
  console.log('== D. Boot real ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-guia-cuenta-'));
  const nmCandidatos = [process.env.NODE_PATH, '/home/hatch/workspace/posta/node_modules'];
  const nm = nmCandidatos.find((p) => p && fs.existsSync(path.join(p, 'express'))) || '';
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, NODE_PATH: nm };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let version = null, served = '';
  try {
    for (let i = 0; i < 40 && !version; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
      if (!version) await new Promise((r) => setTimeout(r, 500));
    }
    t(!!version, 'D1 el servidor del árbol bootea y responde /api/version');
    const buildSrc = (srvSrc.match(/BUILD_ID = '([^']+)'/) || [])[1];
    t(version && version.build === buildSrc, 'D2 el build servido es el de la base (el builder no estampa)', version && version.build);
    try { const r = await fetch(`http://127.0.0.1:${PORT}/app.js`); served = await r.text(); } catch (e) {}
    t(served.includes('pzAdsGuiaSinCuentaHTML') && served.includes(URL_CREAR),
      'D3 [FIX] el bundle servido trae la guía y su enlace a Meta');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 700));
    try { child.kill('SIGKILL'); } catch (e) {}
  }
  let puertoLibre = false;
  try { await fetch(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { puertoLibre = true; }
  t(puertoLibre, 'D4 el puerto ' + PORT + ' quedó libre');

  console.log(`\nRESULTADO: ${pass}/${pass + fail} ok · ${fail} mal`);
  if (fails.length) console.log('FALLAN:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR de suite:', e); process.exit(2); });
