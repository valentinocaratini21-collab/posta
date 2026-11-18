// test-lote-ads-diferencia.js — LOTE ADS-DIFERENCIA (regla de
// Valentino 17/11 15:18, redemandada 21:22: «si yo quiero hacer un
// posteo de veinte y sale veintidós debería primero pedirme los dos
// dólares que faltan» — si el TOTAL de un impulso supera lo que el
// cliente tiene o eligió, el flujo pide la diferencia EN EL MISMO
// FLUJO, ANTES de confirmar; nada corre corto y nada se cobra en
// silencio).
//
// CENSO QUE MANDA (verificado en el árbol base v1168):
//  - Riel CLIENTE: la campaña corre en la cuenta del cliente y Meta
//    le cobra la pauta directo; Posty cobra SOLO su gestión (10%,
//    ads-fee.desgloseFee: $20→$2→$22 · $50→$5→$55 · $100→$10→$110)
//    a la tarjeta guardada, únicamente tras verificar campaña +
//    conjunto ACTIVOS (feeImpulsoTrasActivacion). La billetera NO
//    se toca. La tarjeta de audiencia decía el fee pero NUNCA el
//    total como un solo número → el lote agrega el total explícito.
//  - Riel BILLETERA: el total a cubrir es el monto elegido, entero
//    (el flujo USD no lleva fee — regla del módulo ads-billetera —
//    y en ARS el fee del 10% va DENTRO del monto elegido, splitARS:
//    el cliente paga exactamente lo que eligió). El saldo se chequea
//    ANTES de crear el anuncio; si no alcanza, impulsarConSaldo
//    devuelve saldo_insuficiente sin crear ni cobrar nada — pero la
//    tarjeta no decía ni el saldo ni lo que faltaba, y la carga
//    común solo acepta los montos fijos ($20/$50/$100 ·
//    $10.000/$20.000/$50.000): cargar EXACTAMENTE la diferencia
//    (p. ej. US$2) era imposible en las tres capas (endpoint,
//    ads-billetera.validarMontoUSD y destacado-cobro).
//
// EL LOTE:
//  1) Riel billetera: si el saldo no cubre el total, la tarjeta de
//     audiencia muestra «Tenés US$X de US$Y. Te faltan US$Z.» con el
//     botón que carga EXACTAMENTE la diferencia; el «Sale así»
//     frena (diferencia_pendiente) sin postear nada hasta que el
//     saldo cubra. Con el saldo cubriendo, la tarjeta no cambia.
//  2) La carga-diferencia viaja con la marca `diferencia` y el
//     servidor RECOMPUTA lo que falta con la billetera real (monto
//     fijo elegido − saldo, en unidades enteras): solo autoriza ese
//     monto exacto a través de cargarBilletera/cargarBilleteraARS
//     (esDiferencia) y de la costura de cobro (permitirDiferencia).
//     Cualquier desvío → diferencia_invalida, sin cobrar nada. Sin
//     la marca, las cargas siguen aceptando solo los montos fijos.
//  3) Riel cliente: la línea de dinero suma el TOTAL explícito
//     (pauta + gestión) antes de confirmar; las frases de
//     TARJETA-SIMPLE quedan intactas delante.
//  Sin cambios en creación de campaña, targeting, plomería de los
//  rieles ni política de fee (10%, solo tras activo verificado en
//  el riel cliente; nunca corrió → sin fee). La visibilidad del
//  error al intentar (v1160) queda como está.
//
// Qué prueba:
//  A (estático): el bloque y su orden en la tarjeta; el total del
//     riel cliente ES/EN; el freno del «Sale así»; la marca y la
//     recomputación en el servidor; los validadores acotados; los
//     montos fijos intactos; invariantes byte a byte (BUILD_ID,
//     meta_ads.js, ads-fee.js, chunk-ajustes.js) y la cadena de
//     creación intacta.
//  B (VM con DOM mínimo): la tarjeta con saldo corto muestra la
//     diferencia ES/EN con su botón ANTES del «Sale así»; el «Sale
//     así» no postea nada con la diferencia pendiente; cargar la
//     diferencia manda el monto exacto con su marca, actualiza el
//     saldo y el «Sale así» recién ahí corre; con saldo cubierto la
//     tarjeta no trae bloque y el impulso corre directo; el riel
//     cliente muestra el total y nunca el bloque; la moneda cruzada
//     no afirma diferencia; el riel ARS muestra y carga su
//     diferencia en pesos; el fallo de la carga se lee en el bloque
//     y nada corre.
//  C (módulos reales): los validadores de diferencia acotan sin
//     habilitar montos libres; cargarBilletera/ARS solo aceptan el
//     monto no fijo CON esDiferencia; la costura de cobro solo
//     cobra el monto no fijo CON permitirDiferencia; el desglose
//     del fee del servidor es el total que la tarjeta muestra.
//  D (boot real): el servidor sirve el build de la base (el builder
//     no estampa) y el bundle servido trae el lote.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-diferencia.js
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
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
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
const bilSrc = fs.readFileSync(path.join(ROOT, 'ads-billetera.js'), 'utf8');
const cobSrc = fs.readFileSync(path.join(ROOT, 'destacado-cobro.js'), 'utf8');
{
  const html = fnFrom(appCode, 'function pzAdsAudienciaHTML()');
  t(html.length > 0, 'A1 pzAdsAudienciaHTML existe');
  const orden = ['pzAdsAudienciaDineroHTML()', 'pzAdsAudienciaDiferenciaHTML()', 'id="pzAdsAudienciaError"', 'pzAdsAudienciaSale(this)'];
  const idx = orden.map((s) => html.indexOf(s));
  t(idx.every((v) => v >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]),
    'A2 [FIX] la tarjeta pinta dinero · diferencia · error · Sale así, en ese orden', JSON.stringify(idx));
  const dinero = fnFrom(appCode, 'function pzAdsAudienciaDineroHTML()');
  t(dinero.includes('La pauta la paga Meta desde tu cuenta publicitaria. Posty te cobra') && dinero.includes('(10%) en tu tarjeta guardada, solo si la campaña sale.'),
    'A3 [INVARIANTE] la frase del fee de TARJETA-SIMPLE queda intacta (ES)');
  t(dinero.includes('Meta charges the ad spend to your own ad account. Posty charges') && dinero.includes('(10%) to your saved card, only if the campaign runs.'),
    'A4 [INVARIANTE] la frase del fee de TARJETA-SIMPLE queda intacta (EN)');
  t(dinero.includes('Total: ${total} (${pautaFmt} de pauta + ${fee} de gestión).') && dinero.includes('Total: ${total} (${pautaFmt} in ad spend + ${fee} Posty fee).'),
    'A5 [FIX] el riel cliente suma el TOTAL explícito (pauta + gestión) ES/EN antes de confirmar');
  const dif = fnFrom(appCode, 'function pzAdsAudienciaDiferenciaHTML()');
  t(dif.includes('Tenés ${f(d.saldo)} de ${f(d.total)}. Te faltan ${f(d.falta)}.') && dif.includes('Cargar los ${f(d.falta)} que faltan'),
    'A6 [FIX] el bloque dice cuánto hay, cuánto sale y cuánto falta, con su botón (ES)');
  t(dif.includes('You have ${f(d.saldo)} of ${f(d.total)}.') && dif.includes('short.') && dif.includes('Top up the missing ${f(d.falta)}'),
    'A7 [FIX] el bloque de la diferencia también está en EN');
  t(dif.includes('Sin cargar, no sale y no se cobra nada.') && dif.includes('nothing is charged.'),
    'A8 [FIX] el bloque dice que sin cargar no sale y no se cobra nada (ES/EN)');
  const calc = fnFrom(appCode, 'function pzAdsDiferencia()');
  t(calc.includes("s.rielAds !== 'billetera'") && calc.includes("monedaWallet !== 'ARS'") && calc.includes("monedaWallet !== 'USD'"),
    'A9 [FIX] la diferencia solo se afirma en el riel billetera y con la moneda de la billetera igual a la del riel');
  const sale = fnFrom(appCode, 'async function pzAdsAudienciaSale(btn)');
  t(sale.indexOf('pzAdsDiferencia()') >= 0 && sale.indexOf('pzAdsDiferencia()') < sale.indexOf('pzBoostConfirmar(btn)')
    && sale.includes("motivo: 'diferencia_pendiente'"),
    'A10 [FIX] el «Sale así» frena con diferencia_pendiente ANTES de confirmar');
  const cargar = fnFrom(appCode, 'async function pzAdsAudienciaCargarDiferencia(btn)');
  t(cargar.includes("'/api/ads/billetera/cargar'") && cargar.includes('diferencia: { montoImpulsoUSD: d.total }') && cargar.includes('diferencia: { montoImpulsoARS: d.total }')
    && cargar.includes('montoUSD: d.falta') && cargar.includes('montoARS: d.falta'),
    'A11 [FIX] el botón carga EXACTAMENTE la diferencia, con la marca y el monto elegido (USD y ARS)');
  t((srvSrc.match(/diferencia_invalida/g) || []).length >= 2 && srvSrc.includes('esDiferencia: esDiferenciaUSD')
    && srvSrc.includes('esDiferencia: esDiferenciaARS') && srvSrc.includes('permitirDiferencia: esDiferenciaUSD'),
    'A12 [FIX] el servidor valida la diferencia en las dos ramas y la pasa marcada a la carga y al cobro');
  t(srvSrc.includes('faltaCents') && srvSrc.includes('getAdWallet(uid)'),
    'A13 [FIX] el servidor recomputa la diferencia con la billetera real');
  t(bilSrc.includes('MONTOS_CARGA_USD = [20, 50, 100]') && bilSrc.includes('esDiferencia ? validarMontoDiferenciaUSD(montoUSD) : validarMontoUSD(montoUSD)')
    && bilSrc.includes('esDiferencia ? validarMontoDiferenciaARS(montoARS) : validarMontoARS(montoARS)'),
    'A14 [FIX] ads-billetera: montos fijos intactos y la diferencia solo con esDiferencia');
  t(cobSrc.includes('MONTOS_USD = [20, 50, 100]') && cobSrc.includes('permitirDiferencia ? validarMontoDiferenciaUSD(montoUSD) : validarMontoUSD(montoUSD)'),
    'A15 [FIX] destacado-cobro: montos fijos intactos y la diferencia solo con permitirDiferencia');
  t(srvSrc.includes('feeImpulsoTrasActivacion(uid') && srvSrc.includes('impulsarConSaldo({') && bilSrc.includes('saldo_insuficiente'),
    'A16 [INVARIANTE] la cadena de creación y el freno de saldo del servidor quedan como estaban');
  const buildTree = (srvSrc.match(/BUILD_ID = '([^']+)'/) || [])[1];
  const buildPristine = (fs.readFileSync(path.join(PRISTINE, 'server.js'), 'utf8').match(/BUILD_ID = '([^']+)'/) || [])[1];
  t(buildTree === buildPristine && !!buildTree, 'A17 [INVARIANTE] BUILD_ID intacto (el builder no estampa)', buildTree + ' vs ' + buildPristine);
  t(fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'meta_ads.js'), 'utf8'),
    'A18 [INVARIANTE] meta_ads.js byte a byte (la cadena de creación no se tocó)');
  t(fs.readFileSync(path.join(ROOT, 'ads-fee.js'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'ads-fee.js'), 'utf8'),
    'A19 [INVARIANTE] ads-fee.js byte a byte (la política del fee no se tocó)');
  t(fs.readFileSync(path.join(ROOT, 'public/chunk-ajustes.js'), 'utf8') === fs.readFileSync(path.join(PRISTINE, 'public/chunk-ajustes.js'), 'utf8'),
    'A20 [INVARIANTE] chunk-ajustes.js byte a byte');
}

// ---------- B. VM con DOM mínimo ----------
console.log('== B. Comportamiento (VM) ==');
const A = require(path.join(ROOT, 'ads-audiencia.js'));
const fund = { categoria: 'cafeteria', ciudad: 'Rosario', pais: 'AR', lang: 'es', clienteIdeal: '', audienciaTexto: '', cta: 'escribirte' };
const propuesta = A.propuestaDesdeFundamento(fund);

const piezas = [
  (appSrc.match(/const PZ_AUD_CHIP = [^\n]+/) || [''])[0],
  (appSrc.match(/const PZ_AUD_CHIP_SEL = [^\n]+/) || [''])[0],
  fnFrom(appSrc, 'function pzBoostEsMP()'),
  fnFrom(appSrc, 'function pzBoostFmtMonto(n)'),
  fnFrom(appSrc, 'function pzBoostKey(p)'),
  fnFrom(appSrc, 'function pzAdsAudienciaKey(p, monto)'),
  fnFrom(appSrc, 'function pzAdsAudienciaTexto(sel)'),
  fnFrom(appSrc, 'function pzAdsAudienciaDineroHTML()'),
  fnFrom(appSrc, 'function pzAdsDiferencia()'),
  fnFrom(appSrc, 'function pzAdsAudienciaDiferenciaHTML()'),
  fnFrom(appSrc, 'function pzAdsAudienciaHTML()'),
  fnFrom(appSrc, 'function pzBoostMotivo(motivo, monto, cobroId)'),
  fnFrom(appSrc, 'function pzBoostCargarMotivo(motivo, monto, cobroId)'),
  fnFrom(appSrc, 'function pzBoostErrorHTML(motivo, monto, cobroId)'),
  fnFrom(appSrc, 'function pzAdsAudienciaPintar()'),
  fnFrom(appSrc, 'async function pzAdsAudienciaSale(btn)'),
  fnFrom(appSrc, 'async function pzAdsAudienciaCargarDiferencia(btn)'),
  fnFrom(appSrc, 'async function pzBoostConfirmar(btn, enTarjeta)'),
].join('\n');
t(piezas.includes('pzAdsAudienciaDiferenciaHTML') && piezas.includes('pzAdsAudienciaCargarDiferencia') && piezas.includes('pzAdsAudienciaSale'),
  'B0 las piezas del lote extraen enteras del bundle');

const elementos = {};
const mkEl = (id) => ({ id, innerHTML: '', textContent: '', style: {}, disabled: false, scrollIntoView: () => {}, classList: { add: () => {} } });
const sandbox = {
  console, Set, JSON, Number, String, Math, Object, Array, Promise,
  ME: { lang: 'es' },
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  gzT: (es, en) => (sandbox.ME.lang === 'en' ? en : es),
  __posts: [], __handler: null,
  api: {
    post: async (url, body) => { sandbox.__posts.push({ url, body }); return sandbox.__handler ? sandbox.__handler(url, body) : { ok: true }; },
    get: async () => null,
  },
  document: {
    getElementById: (id) => (elementos[id] || (elementos[id] = mkEl(id))),
    querySelectorAll: () => [],
    createElement: () => mkEl('nuevo'),
    body: { appendChild: () => {} },
  },
  window: { location: { href: '' } },
  toast: () => {},
  loadChunk: async () => {},
  anaAgregarTarjetaBtn: () => {},
  pzBoostImpulsados: new Set(),
  pzBoostMarcarImpulsado: () => {},
  pzBoostPintarExito: () => {},
  pzBoostPintarError: () => false,
  pzAdsImpulsarAdjuntarTarjeta: () => {},
  pzAdsAudienciaMostrar: async () => true,
  pzAdsRefrescar: async () => {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('let pzBoostState = null;\n' + piezas, sandbox);
const enVM = (expr) => vm.runInContext(expr, sandbox);
const ponerEstado = (extra) => {
  sandbox.__prop = propuesta;
  sandbox.__extra = extra || {};
  enVM(`pzBoostState = Object.assign({
    elegibles: [], billetera: { billing_provider: 'stripe', balance_cents: 2000, currency: 'USD' },
    adsReady: true, motivoGate: '', connectUrl: '', rielAds: '',
    selId: 'p42', selMonto: 20, selPost: { post_id: 42, caption: 'un posteo' },
    audienciaProp: __prop, audienciaSel: JSON.parse(JSON.stringify(__prop.audiencia)),
    audienciaObjetivo: __prop.objetivo, audienciaKey: '', boostError: null, audienciaVisible: true,
  }, __extra);`);
};

(async () => {
  // B1–B2: riel billetera con saldo corto — el bloque ES/EN, antes del «Sale así»
  ponerEstado({ rielAds: 'billetera', billetera: { billing_provider: 'stripe', balance_cents: 1800, currency: 'USD' }, selMonto: 20 });
  const htmlCorto = enVM('pzAdsAudienciaHTML()');
  t(htmlCorto.includes('Tenés US$18 de US$20. Te faltan US$2.') && htmlCorto.includes('Cargar los US$2 que faltan')
    && htmlCorto.includes('pzAdsAudienciaCargarDiferencia(this)'),
    'B1 [FIX] saldo corto USD: la tarjeta dice «Tenés US$18 de US$20. Te faltan US$2.» con el botón de cargar la diferencia');
  t(htmlCorto.indexOf('id="pzAdsDiferencia"') >= 0 && htmlCorto.indexOf('id="pzAdsDiferencia"') < htmlCorto.indexOf('Sale así'),
    'B2 [FIX] el bloque de la diferencia va ANTES del «Sale así»');
  sandbox.ME.lang = 'en';
  t(enVM('pzAdsAudienciaHTML()').includes('You have US$18 of US$20.') && enVM('pzAdsAudienciaHTML()').includes('US$2 short.')
    && enVM('pzAdsAudienciaHTML()').includes('Top up the missing US$2'),
    'B3 [FIX] el bloque de la diferencia en EN, con los mismos números');
  sandbox.ME.lang = 'es';

  // B4: el «Sale así» con la diferencia pendiente NO postea nada
  sandbox.__posts = []; sandbox.__handler = async () => ({ ok: true });
  const jBloq = await enVM('pzAdsAudienciaSale(null)');
  t(jBloq && jBloq.ok === false && jBloq.motivo === 'diferencia_pendiente' && sandbox.__posts.length === 0,
    'B4 [FIX] con la diferencia pendiente, el «Sale así» frena y no llega ningún POST (ni a impulsar ni a cargar)', JSON.stringify(sandbox.__posts).slice(0, 200));

  // B5: cargar la diferencia — monto exacto con su marca; el saldo se
  // actualiza y recién ahí el «Sale así» corre, en el mismo flujo.
  sandbox.__posts = [];
  sandbox.__handler = async (url) => (url === '/api/ads/billetera/cargar' ? { ok: true, balance_cents: 2000, diferencia: true } : { ok: true, balance_cents: 0 });
  await enVM('pzAdsAudienciaCargarDiferencia(null)');
  const carga = sandbox.__posts.find((p) => p.url === '/api/ads/billetera/cargar');
  t(carga && carga.body.montoUSD === 2 && carga.body.diferencia && carga.body.diferencia.montoImpulsoUSD === 20,
    'B5a [FIX] la carga manda EXACTAMENTE US$2 con la marca del impulso de US$20', JSON.stringify(carga && carga.body));
  t(enVM('pzBoostState.billetera.balance_cents') === 2000 && enVM('pzAdsDiferencia()') === null
    && !enVM('pzAdsAudienciaHTML()').includes('id="pzAdsDiferencia"'),
    'B5b [FIX] tras cargar, el saldo cubre y el bloque desaparece de la tarjeta');
  const jSale = await enVM('pzAdsAudienciaSale(null)');
  const imp = sandbox.__posts.find((p) => p.url === '/api/ads/billetera/impulsar');
  t(jSale && jSale.ok === true && imp && imp.body.montoUSD === 20 && imp.body.posteoId === 42,
    'B5c [FIX] recién después de cargar, el «Sale así» corre el impulso de US$20 en el mismo flujo');

  // B6: saldo cubierto desde el inicio — la tarjeta no cambia y corre directo
  ponerEstado({ rielAds: 'billetera', billetera: { billing_provider: 'stripe', balance_cents: 2000, currency: 'USD' }, selMonto: 20 });
  const htmlCubierto = enVM('pzAdsAudienciaHTML()');
  t(!htmlCubierto.includes('id="pzAdsDiferencia"') && !htmlCubierto.includes('Te faltan') && htmlCubierto.includes('La pauta sale de tu billetera de Posty.'),
    'B6a [FIX] con el saldo cubriendo el total, la tarjeta queda como estaba: sin bloque de diferencia');
  sandbox.__posts = []; sandbox.__handler = async () => ({ ok: true, balance_cents: 0 });
  const jCub = await enVM('pzAdsAudienciaSale(null)');
  t(jCub && jCub.ok === true && sandbox.__posts.some((p) => p.url === '/api/ads/billetera/impulsar'),
    'B6b [FIX] con saldo cubierto el «Sale así» corre como siempre');

  // B7–B8: riel cliente — el total explícito, y nunca el bloque
  ponerEstado({ rielAds: 'cliente', billetera: { billing_provider: 'stripe', balance_cents: 0, currency: 'USD' }, selMonto: 20 });
  const htmlCli = enVM('pzAdsAudienciaHTML()');
  t(htmlCli.includes('Total: US$22 (US$20 de pauta + US$2 de gestión).') && htmlCli.includes('solo si la campaña sale.'),
    'B7 [FIX] riel cliente ES: el total US$22 como un solo número (US$20 de pauta + US$2 de gestión), tras la frase del fee');
  t(!htmlCli.includes('id="pzAdsDiferencia"') && enVM('pzAdsDiferencia()') === null,
    'B8 [FIX] el riel cliente nunca muestra el bloque de la diferencia (su billetera no se toca), ni con saldo 0');
  sandbox.ME.lang = 'en';
  ponerEstado({ rielAds: 'cliente', selMonto: 50 });
  t(enVM('pzAdsAudienciaHTML()').includes('Total: US$55 (US$50 in ad spend + US$5 Posty fee).'),
    'B9 [FIX] riel cliente EN: el total sigue al monto (US$55 sobre US$50)');
  sandbox.ME.lang = 'es';

  // B10: moneda cruzada (billetera ARS con riel USD) — no se afirma diferencia
  ponerEstado({ rielAds: 'billetera', billetera: { billing_provider: 'stripe', balance_cents: 99900, currency: 'ARS' }, selMonto: 20 });
  t(enVM('pzAdsDiferencia()') === null && !enVM('pzAdsAudienciaHTML()').includes('id="pzAdsDiferencia"'),
    'B10 [FIX] con la moneda de la billetera cruzada (camino del cobro directo), la tarjeta no afirma ninguna diferencia');

  // B11: riel ARS — la diferencia en pesos, con su marca
  ponerEstado({ rielAds: 'billetera', billetera: { billing_provider: 'mp', balance_cents: 300000, currency: 'ARS' }, selMonto: 5000 });
  t(enVM('pzAdsAudienciaHTML()').includes('Tenés $3.000 de $5.000. Te faltan $2.000.'),
    'B11a [FIX] riel ARS: «Tenés $3.000 de $5.000. Te faltan $2.000.» (el total es el monto elegido: el fee va dentro)');
  sandbox.__posts = []; sandbox.window.location.href = '';
  sandbox.__handler = async () => ({ ok: true, init_point: 'https://mp.example/checkout' });
  await enVM('pzAdsAudienciaCargarDiferencia(null)');
  const cargaARS = sandbox.__posts.find((p) => p.url === '/api/ads/billetera/cargar');
  t(cargaARS && cargaARS.body.montoARS === 2000 && cargaARS.body.diferencia && cargaARS.body.diferencia.montoImpulsoARS === 5000
    && sandbox.window.location.href === 'https://mp.example/checkout',
    'B11b [FIX] la carga ARS manda los $2.000 exactos con su marca y sigue al checkout de MP, como toda carga del riel');

  // B12: la carga falla (sin tarjeta) — el motivo se lee en el bloque y nada corre
  ponerEstado({ rielAds: 'billetera', billetera: { billing_provider: 'stripe', balance_cents: 1800, currency: 'USD' }, selMonto: 20 });
  elementos.pzAdsDiferenciaMsg = mkEl('pzAdsDiferenciaMsg');
  sandbox.__posts = [];
  sandbox.__handler = async () => ({ ok: false, motivo: 'sin_tarjeta_guardada' });
  await enVM('pzAdsAudienciaCargarDiferencia(null)');
  t(elementos.pzAdsDiferenciaMsg.textContent.includes('No tenés una tarjeta guardada')
    && !sandbox.__posts.some((p) => p.url === '/api/ads/billetera/impulsar') && enVM('pzAdsDiferencia()') !== null,
    'B12 [FIX] si la carga no pasa, el motivo se lee en el bloque, la diferencia sigue pendiente y nada corrió');

  // ---------- C. Módulos reales ----------
  console.log('== C. Módulos reales (billetera, cobro, fee) ==');
  const B = require(path.join(ROOT, 'ads-billetera.js'));
  t(B.validarMontoDiferenciaUSD(2) === true && B.validarMontoDiferenciaUSD(1) === true && B.validarMontoDiferenciaUSD(100) === true
    && B.validarMontoDiferenciaUSD(101) === false && B.validarMontoDiferenciaUSD(0) === false && B.validarMontoDiferenciaUSD(2.5) === false
    && B.validarMontoDiferenciaUSD('2') === false,
    'C1 [FIX] validarMontoDiferenciaUSD acota (entero 1..100), no habilita montos libres');
  t(B.validarMontoUSD(2) === false && B.validarMontoUSD(20) === true && B.validarMontoARS(2000) === false && B.validarMontoARS(10000) === true,
    'C2 [INVARIANTE] los validadores de montos fijos no cambiaron');
  t(B.validarMontoDiferenciaARS(2000) === true && B.validarMontoDiferenciaARS(20000) === true && B.validarMontoDiferenciaARS(20001) === false && B.validarMontoDiferenciaARS(0) === false,
    'C3 [FIX] validarMontoDiferenciaARS acota (entero 1..20000)');
  let cobroVio = null;
  const rDif = await B.cargarBilletera({
    clienteId: 7, montoUSD: 2, monedaActual: 'USD', saldoActual: 1800, ref: 'dif-test', esDiferencia: true,
    buscarCarga: () => null,
    cobrar: async (x) => { cobroVio = x; return { ok: true, cobroId: 'pi_dif' }; },
    acreditar: async () => ({ ok: true, saldoNuevo: 2000 }),
  });
  t(rDif.ok === true && cobroVio && cobroVio.montoUSD === 2,
    'C4 [FIX] cargarBilletera CON esDiferencia cobra y acredita los US$2 exactos');
  let cobroSin = false;
  const rSin = await B.cargarBilletera({
    clienteId: 7, montoUSD: 2, monedaActual: 'USD', saldoActual: 1800, ref: 'dif-test-2',
    buscarCarga: () => null,
    cobrar: async () => { cobroSin = true; return { ok: true, cobroId: 'pi_x' }; },
    acreditar: async () => ({ ok: true, saldoNuevo: 2000 }),
  });
  t(rSin.ok === false && rSin.motivo === 'monto_invalido' && cobroSin === false,
    'C5 [FIX] el mismo monto SIN la marca sigue rechazado (monto_invalido) y no se cobra nada');
  const rExceso = await B.cargarBilletera({
    clienteId: 7, montoUSD: 500, monedaActual: 'USD', saldoActual: 0, ref: 'dif-test-3', esDiferencia: true,
    buscarCarga: () => null, cobrar: async () => ({ ok: true, cobroId: 'pi_y' }), acreditar: async () => ({ ok: true, saldoNuevo: 0 }),
  });
  t(rExceso.ok === false && rExceso.motivo === 'monto_invalido',
    'C6 [FIX] ni con la marca pasa un monto fuera de la cota de diferencia');
  let prefVio = null;
  const rDifARS = await B.cargarBilleteraARS({
    clienteId: 7, montoARS: 2000, monedaActual: 'ARS', saldoActual: 300000, ref: 'dif-test-ars', esDiferencia: true,
    buscarCarga: () => null,
    crearPreferencia: async (x) => { prefVio = x; return { ok: true, init_point: 'https://mp.example/x' }; },
  });
  t(rDifARS.ok === true && prefVio && prefVio.montoARS === 2000,
    'C7 [FIX] cargarBilleteraARS CON esDiferencia crea la preferencia por los $2.000 exactos');
  const rSinARS = await B.cargarBilleteraARS({
    clienteId: 7, montoARS: 2000, monedaActual: 'ARS', saldoActual: 300000, ref: 'dif-test-ars-2',
    buscarCarga: () => null, crearPreferencia: async () => ({ ok: true, init_point: 'https://mp.example/x' }),
  });
  t(rSinARS.ok === false && rSinARS.motivo === 'monto_invalido',
    'C8 [FIX] el monto ARS no fijo SIN la marca sigue rechazado');
  const DC = require(path.join(ROOT, 'destacado-cobro.js'));
  let piOpts = null;
  const clienteFalso = {
    customers: { retrieve: async () => ({ invoice_settings: { default_payment_method: 'pm_1' } }) },
    paymentMethods: { list: async () => ({ data: [] }) },
    paymentIntents: { create: async (opts) => { piOpts = opts; return { id: 'pi_9', status: 'succeeded' }; } },
  };
  const cSin = await DC.cobrarCargaBilletera({ client: clienteFalso, customerId: 'cus_1', montoUSD: 2, ref: 'r-sin' });
  t(cSin.ok === false && cSin.motivo === 'monto_invalido' && piOpts === null,
    'C9 [FIX] la costura de cobro SIN permitirDiferencia no cobra un monto no fijo');
  const cCon = await DC.cobrarCargaBilletera({ client: clienteFalso, customerId: 'cus_1', montoUSD: 2, ref: 'r-con', permitirDiferencia: true });
  t(cCon.ok === true && cCon.cobroId === 'pi_9' && piOpts && piOpts.amount === 200,
    'C10 [FIX] la costura CON permitirDiferencia cobra exactamente US$2 (200 centavos)');
  const FEE = require(path.join(ROOT, 'ads-fee.js'));
  const d20 = FEE.desgloseFee(2000), d50 = FEE.desgloseFee(5000), d100 = FEE.desgloseFee(10000);
  t(d20.feeCents === 200 && d20.totalCents === 2200 && d50.feeCents === 500 && d50.totalCents === 5500 && d100.feeCents === 1000 && d100.totalCents === 11000,
    'C11 [INVARIANTE] el desglose del servidor es el total que la tarjeta muestra: 20→2→22 · 50→5→55 · 100→10→110');

  // ---------- D. Boot real ----------
  console.log('== D. Boot real ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-diferencia-'));
  const nmCandidatos = [process.env.NODE_PATH, '/home/hatch/workspace/posta/node_modules', '/home/hatch/workspace/.lote-voz/tree/node_modules'];
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
    t(served.includes('pzAdsAudienciaDiferenciaHTML') && served.includes('Te faltan') && served.includes('diferencia_pendiente'),
      'D3 [FIX] el bundle servido trae el bloque de la diferencia y el freno del «Sale así»');
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
