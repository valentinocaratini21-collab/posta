// test-lote-rediseno-r4.js — LOTE R4 REDISEÑO (Impulsar) — base v793.
// Ads pasa a ser Impulsar con el diseño del mock (pane Ads): campaña activa
// con números reales, simulador con proyección rotulada ESTIMACIÓN (basada
// en datos reales de Instagram del negocio, nunca promesa), recomendación
// del mejor posteo como única fuente, billetera + Cargar + tarjeta intactos.
// Sin tasa USD→ARS ni reembolsos: el botón Impulsar muestra el aviso y
// nunca cobra de verdad (§5.4 abierto). Solo posteos publicados.
// "Ventas cerradas" solo con reporte del cliente: sin fuente durable en
// v793, la línea NO se muestra nunca (ni un cero inventado).
// Node puro + boot real. Uso: node test-lote-rediseno-r4.js
// (el boot necesita NODE_PATH=/home/hatch/workspace/posta/node_modules)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name, extra !== undefined ? '(' + extra + ')' : ''); } };
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const ana = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

// Extrae una función por nombre contando llaves.
function sliceFn(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  if (s < 0) return '';
  const e = endMarker ? src.indexOf(endMarker, s + 1) : src.length;
  return src.slice(s, e < 0 ? src.length : e);
}
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

console.log('— A) censo: los archivos del lote cambiaron vs la base v793 —');
t(md5(app) === 'adecfe1d66a09091a6f7bd1295ef1c0b', 'A1 app.js pinea el md5 R4 (etiqueta Impulsar en el dock; base v793 c3337c90)');
t(md5(ana) === '64be0f36e00799b43efc85adeada67de', 'A1b chunk-analisis.js pinea el md5 R4 (simulador + campaña + recomendación + anaSetLang; base v793 a5dd3a3d)');
t(md5(fs.readFileSync(path.join(__dirname, 'simulador-impulsar.js'), 'utf8')) === 'dae9a28a789a70bc97b52a4a8c7b4f30', 'A1c simulador-impulsar.js pinea su md5');
t(fs.existsSync(path.join(__dirname, 'simulador-impulsar.js')), 'A2 existe simulador-impulsar.js (módulo puro nuevo)');
t(srv.includes("const BUILD_ID = '20261105-v800'"), 'A3 server.js sigue en BUILD v793 (el número lo pone el preparador, no este lote)');

console.log('— B) simulador-impulsar.js: fórmula honesta, sin inventar —');
let sim = null;
try { sim = require(path.join(__dirname, 'simulador-impulsar.js')); } catch (e) { sim = null; }
t(sim && typeof sim.estimarImpulso === 'function', 'B0 estimarImpulso exportada');
t(sim && typeof sim.simMontoValido === 'function', 'B0b simMontoValido exportada');
if (sim) {
  const boosts = [
    { last_spend_cents: 1000, last_reach: 1000 },
    { last_spend_cents: 2000, last_reach: 1000 },
  ]; // gasto USD 30, alcance 2000 → USD 0,015 por persona
  const posts = [
    { reach: 6000, comments: 60 },
    { reach: 4000, comments: 40 },
  ]; // tasa de respuesta propia: 100/10000 = 1%
  const r20 = sim.estimarImpulso({ presupuestoUSD: 20, boosts, posts });
  t(r20.ok === true, 'B1 con datos reales hay estimación', JSON.stringify(r20));
  t(r20.consultas === 13, 'B1 $20 → ≈13 consultas (20/0,015=1333 alcance × 1%)', JSON.stringify(r20));
  t(r20.alcance === 1333, 'B1 $20 → alcance ≈1333', JSON.stringify(r20));
  t(r20.costoPorAlcanceUSD === 0.015, 'B1 costo por alcance USD 0,015 (real, de Meta)', JSON.stringify(r20));
  t(r20.tasaRespuesta === 0.01, 'B1 tasa de respuesta propia 1% (comentarios/alcance, real)', JSON.stringify(r20));
  const r50 = sim.estimarImpulso({ presupuestoUSD: 50, boosts, posts });
  t(r50.ok === true && r50.consultas === 33, 'B1b $50 → ≈33 consultas', JSON.stringify(r50));
  const sinBoosts = sim.estimarImpulso({ presupuestoUSD: 20, boosts: [], posts });
  t(sinBoosts.ok === false && sinBoosts.motivo === 'sin_datos_pauta', 'B2 sin boosts con números de Meta → sin estimación inventada (sin_datos_pauta)', JSON.stringify(sinBoosts));
  const boostsSinAlcance = sim.estimarImpulso({ presupuestoUSD: 20, boosts: [{ last_spend_cents: 1000, last_reach: 0 }], posts });
  t(boostsSinAlcance.ok === false && boostsSinAlcance.motivo === 'sin_datos_pauta', 'B2b boosts sin alcance reportado → sin_datos_pauta', JSON.stringify(boostsSinAlcance));
  const sinPosts = sim.estimarImpulso({ presupuestoUSD: 20, boosts, posts: [] });
  t(sinPosts.ok === false && sinPosts.motivo === 'sin_datos_cuenta', 'B3 sin posteos con alcance → sin_datos_cuenta', JSON.stringify(sinPosts));
  const sinPresupuesto = sim.estimarImpulso({ presupuestoUSD: 0, boosts, posts });
  t(sinPresupuesto.ok === false && sinPresupuesto.motivo === 'sin_presupuesto', 'B4 presupuesto 0 → sin_presupuesto', JSON.stringify(sinPresupuesto));
  t(sim.simMontoValido(20) === 20 && sim.simMontoValido(25) === 20 && sim.simMontoValido(35) === 20
    && sim.simMontoValido(75) === 50 && sim.simMontoValido(76) === 100 && sim.simMontoValido(100) === 100
    && sim.simMontoValido(10) === 20, 'B5 snap a monto válido $20/$50/$100 (empate → el menor, nunca gastar de más)');
  t(JSON.stringify(sim.SIM_MONTOS_VALIDOS || sim.MONTOS_VALIDOS || [20, 50, 100]) === '[20,50,100]', 'B6 montos válidos $20/$50/$100 (los de la billetera, no otros)');
}

console.log('— C) dock: la pestaña Ads se llama Impulsar (misma ruta) —');
t(app.includes("tabBtn('ads', '#/app/ads', gzT('Impulsar', 'Boost'))"), 'C1 bbShell: tab Impulsar en el dock (ruta #/app/ads sin cambiar)');
t(app.includes("t('ads', 'ads', pzIc('megaphone'), gzT('Impulsar', 'Boost'))"), 'C2 mzTabsHTML: tab Impulsar con megáfono');
t(!app.includes("gzT('Ads', 'Ads')"), 'C3 no queda ninguna etiqueta Ads en el dock (app.js)');
t(app.includes("else if (tab === 'ads') { content = await adsView(); }"), 'C4 la ruta #/app/ads sigue montando adsView (sin romper deep links)');

console.log('— D) vista Impulsar: estructura del mock con datos reales —');
const srcDirecto = sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()');
t(srcDirecto.length > 500, 'D0 anaAdsDirectoHTML existe', String(srcDirecto.length));
t(srcDirecto.includes('Impulsar'), 'D1 la cabecera dice Impulsar (no Ads)', '');
t(!srcDirecto.includes('>Ads</div>'), 'D1b el título viejo «Ads» no está en la vista');
t(srcDirecto.includes('traducidos a resultados'), 'D2 el mensaje de Posty del mock («Tus anuncios, traducidos a resultados»)');
t(srcDirecto.includes('anaSimCardHTML()') || srcDirecto.includes('impSimCard'), 'D3 la vista monta la tarjeta del simulador');
t(srcDirecto.includes('anaCampanaActivaHTML()') || srcDirecto.includes('impCampanaCard'), 'D4 la vista monta la tarjeta de campaña activa');
t(srcDirecto.includes('anaRecomendacionHTML()') || srcDirecto.includes('impRecCard'), 'D5 la vista monta la tarjeta de recomendación');
t(srcDirecto.includes('ana-ads-montos'), 'D6 la billetera sigue con UNA fila de montos');
t(srcDirecto.includes('Cargar $'), 'D6b el botón Cargar sigue en la billetera');
t(srcDirecto.includes('Carga automática'), 'D6c la carga automática sigue');
t(srcDirecto.includes('Elegí qué foto del feed impulsar'), 'D6d el botón Feed sigue');
t(srcDirecto.includes('Últimos impulsos'), 'D6e el historial sigue');
t(!/Ventas cerradas/.test(srcDirecto), 'D7 la vista NUNCA escribe «Ventas cerradas» (sin fuente durable, ni un cero inventado)');
t(sliceFn(ana, 'function anaSimCardHTML()', 'function anaSimSliderInput(').includes('id="anaBoostRecMsg"'), 'D8 el mensaje de Impulsar/Cargar sigue montado bajo el botón (id anaBoostRecMsg en la tarjeta del simulador)');

console.log('— E) simulador en el chunk: espejo de la fórmula + controles —');
for (const n of ['anaSimEstimar', 'anaSimMontoValido', 'anaSimCardHTML', 'anaSimSliderInput', 'anaSimSliderChange', 'anaSimCtaTxt', 'anaCampanaActivaHTML', 'anaRecomendacionHTML', 'anaRecAplicar']) {
  t(extractFn(ana, n).length > 30, 'E0 existe ' + n);
}
t(sliceFn(ana, 'function anaSimCardHTML()', 'function anaSimSliderInput(').includes('impSimRange'), 'E1 el simulador tiene el deslizante (id impSimRange, en anaSimCardHTML)');
t(srcDirecto.includes('impSimProj') || ana.includes('impSimProj'), 'E2 el simulador tiene la línea de proyección (id impSimProj)');
t(ana.includes('ESTIMACIÓN') || ana.includes('ESTIMACION'), 'E3 la proyección va rotulada ESTIMACIÓN');
t(/nunca promesa|no es una promesa|no promete/i.test(ana), 'E4 el texto aclara que no es una promesa');
t(ana.includes('conversion_pendiente'), 'E5 la nota de conversión pendiente vive en la vista (sin tasa no hay gasto)');

console.log('— F) VM: la vista renderiza con datos reales —');
function runVm(code, expr) {
  const sb = { console, anaLang: 'es', anaPastMode: false,
    anaT: (es, en) => (sb.anaLang === 'en' ? en : es),
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    document: { getElementById: () => null },
    api: { post: async () => ({ ok: true }), get: async () => ({ ok: true }) },
    location: { hash: '#/app/ads' },
    history: { replaceState: () => {} },
  };
  vm.createContext(sb);
  vm.runInContext(code + '\n' + expr, sb);
  return sb.__out;
}
const srcCortar = sliceFn(ana, 'function anaCortarCaption(', 'function anaBilleteraPickerRow(');
const srcConstruir = sliceFn(ana, 'function anaBilleteraConstruirDatos(', 'async function anaBilleteraTabDatos(');
const srcHistorial = sliceFn(ana, 'function anaBilleteraHistorialHTML()', 'function anaBilleteraHistorialPintar()');
const srcTarjeta = sliceFn(ana, 'function anaTarjetaBtnHTML(', 'function anaCargarSinTarjeta(');
const srcSim = ['anaSimEstimar', 'anaSimMontoValido', 'anaSimCtaTxt', 'anaSimProjHTML', 'anaSimCardHTML', 'anaCampanaActivaHTML', 'anaRecomendacionHTML', 'anaBoostRecPartes', 'anaImpIrSimulador', 'anaImpIrDestacado']
  .map((n) => extractFn(ana, n)).join('\n');
t(srcCortar.length > 50 && srcConstruir.length > 100 && srcDirecto.length > 500 && srcHistorial.length > 100 && srcTarjeta.length > 100 && srcSim.length > 500,
  'F0 funciones extraídas del chunk', [srcCortar.length, srcConstruir.length, srcDirecto.length, srcHistorial.length, srcTarjeta.length, srcSim.length].join('/'));
const fakeF = (feedPosts, eligPosts, mejor, hoyObj, extraBil) => ({
  d: { ok: true, mejor: mejor || null, boostHabilitado: true, ads_permiso: true, conversion_pendiente: true },
  bil: Object.assign({ ok: true, saldo: 0, moneda: 'USD', montos: [20, 50, 100], dias: 7, movimientos: [], boostHabilitado: true, ads_permiso: true, conversion_pendiente: true, auto_topup: 0, tiene_tarjeta: true, tarjeta: { tiene: true, last4: '4242' }, balance_cents: 5000, currency: 'USD', montos_usd: [20, 50, 100] }, extraBil || {}),
  elig: { ok: true, elegibles: eligPosts },
  hoy: hoyObj ? { ok: true, hoy: hoyObj } : { ok: true, hoy: null },
  feed: { ok: true, total: feedPosts.length, posts: feedPosts },
});
const hoy521 = { post_id: 521, caption: 'El posteo de hoy', image_path: '/hoy.jpg', hora: '20:00' };
const feed4 = [
  { post_id: 519, caption: 'El más reciente', image_path: '/519.jpg', ya_impulsado: false },
  { post_id: 518, caption: 'Posteo de ayer', image_path: '/518.jpg', ya_impulsado: false },
  { post_id: 517, caption: 'Posteo viejo', image_path: '/517.jpg', ya_impulsado: false },
  { post_id: 516, caption: 'Posteo con ads', image_path: '/516.jpg', ya_impulsado: true },
];
const elig3 = [
  { post_id: 519, caption: 'El más reciente', image_path: '/519.jpg', reach: 1200, likes: 40, comments: 12, saves: 8 },
  { post_id: 518, caption: 'Posteo de ayer', image_path: '/518.jpg', reach: 900, comments: 9, likes: 20, saves: 3 },
  { post_id: 517, caption: 'Posteo viejo', image_path: '/517.jpg', reach: 500, comments: 2, likes: 5, saves: 0 },
];
const mejor519 = { post_id: 519, caption: 'El más reciente', image_path: '/519.jpg', reach: 1200, likes: 40, comments: 12, saved: 8 };
const mejor518 = { post_id: 518, caption: 'Posteo de ayer', image_path: '/518.jpg', reach: 900, likes: 20, comments: 9, saved: 3 };
const boostActivo = [{ post_id: 518, status: 'active', budget_cents: 2000, currency: 'USD', duration_days: 7, last_spend_cents: 1200, last_reach: 1500, created_at: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 19).replace('T', ' ') }];

const preMain = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n' + srcSim + '\n'
  + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, mejor519, hoy521)) + ', null, true);\n'
  + 'anaBilleteraDatos.boosts = ' + JSON.stringify(boostActivo) + ';\n';
const hMain = runVm(preMain, '__out = anaAdsDirectoHTML();');
t(typeof hMain === 'string' && hMain.length > 500, 'F1 la vista Impulsar renderiza', String(hMain && hMain.length));
if (typeof hMain === 'string') {
  t(hMain.includes('Impulsar'), 'F1b la vista dice Impulsar');
  t(!hMain.includes('>Ads</div>'), 'F1c la vista NO dice Ads como título');
  t(hMain.includes('id="impCampanaCard"'), 'F2 hay tarjeta de campaña activa');
  t(hMain.includes('ACTIVA'), 'F2b la campaña muestra ACTIVA');
  t(hMain.includes('1.500'), 'F2c la campaña muestra el alcance real 1.500 (Meta)');
  t(hMain.includes('$12'), 'F2d la campaña muestra el gastado real $12 (Meta)');
  t(!hMain.includes('Ventas cerradas'), 'F2e la campaña NO muestra «Ventas cerradas» (sin reporte del cliente)');
  t(hMain.includes('id="impSimCard"'), 'F3 hay tarjeta de simulador');
  t(hMain.includes('id="impSimRange"'), 'F3b hay deslizante de presupuesto');
  t(hMain.includes('ESTIMACIÓN'), 'F3c la proyección va rotulada ESTIMACIÓN');
  t(/≈/.test(hMain) && hMain.includes('consultas'), 'F3d la proyección estima consultas con ≈');
  t(hMain.includes('id="impSimCta"') && hMain.includes('Impulsar con $20') && hMain.includes('7 días'), 'F3e el botón Impulsar con $20 · 7 días está en el simulador');
  t(hMain.includes('conversión USD→ARS') || hMain.includes('conversion USD'), 'F3f el aviso de sin-tasa está junto al botón (nunca cobra de verdad)');
  t(hMain.includes('id="impRecCard"'), 'F4 hay tarjeta de recomendación');
  t(hMain.includes('Recomendación de Posty'), 'F4b la recomendación tiene su título');
  t(hMain.includes('El más reciente'), 'F4c la recomendación muestra el mejor posteo');
  t(hMain.includes('Cargar $'), 'F5 la billetera sigue con Cargar');
  t(hMain.includes('Cambiar tarjeta'), 'F5b la tarjeta guardada se muestra para cambiarla');
  t(hMain.includes('Últimos impulsos'), 'F5c el historial sigue');
  t(hMain.includes('Elegí qué foto del feed impulsar'), 'F5d el botón Feed sigue');
}
// F6: sin boost activo, la campaña es estado honesto con botón que lleva al simulador (nunca vacía ni inventada).
const preSinBoost = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n' + srcSim + '\n'
  + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, mejor519, hoy521)) + ', null, true);\n'
  + 'anaBilleteraDatos.boosts = [];\n';
const hSinBoost = runVm(preSinBoost, '__out = anaAdsDirectoHTML();');
t(typeof hSinBoost === 'string' && hSinBoost.includes('id="impCampanaCard"'), 'F6 sin boost activo, la tarjeta de campaña existe como estado honesto');
t(typeof hSinBoost === 'string' && !hSinBoost.includes('ACTIVA'), 'F6b sin boost activo, no se muestra ACTIVA');
t(typeof hSinBoost === 'string' && hSinBoost.includes('impSimCard'), 'F6c sin boost activo, el simulador sigue para arrancar');
// F7: sin mejor de la semana, no hay tarjeta de recomendación (nunca inventada).
const preSinMejor = srcCortar + '\n' + srcConstruir + '\n' + srcHistorial + '\n' + srcDirecto + '\n' + srcTarjeta + '\n' + srcSim + '\n'
  + 'let anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, null, hoy521)) + ', null, true);\n'
  + 'anaBilleteraDatos.boosts = [];\n';
const hSinMejor = runVm(preSinMejor, '__out = anaAdsDirectoHTML();');
t(typeof hSinMejor === 'string' && !hSinMejor.includes('id="impRecCard"'), 'F7 sin mejor posteo, no hay tarjeta de recomendación (nunca inventada)');
// F8: el espejo del cliente calcula igual que el módulo (misma fórmula, mismos casos).
const sbSim = { console, anaLang: 'es', anaT: (es, en) => es, esc: (s) => String(s == null ? '' : s) };
vm.createContext(sbSim);
const srcEstimar = extractFn(ana, 'anaSimEstimar');
t(srcEstimar.length > 50, 'F8 anaSimEstimar extraída del chunk');
if (srcEstimar.length > 50) {
  vm.runInContext(srcEstimar.replace('function anaSimEstimar', 'globalThis.anaSimEstimar = function'), sbSim);
  const r = sbSim.anaSimEstimar({ presupuestoUSD: 20, boosts: [{ last_spend_cents: 1000, last_reach: 1000 }, { last_spend_cents: 2000, last_reach: 1000 }], posts: [{ reach: 6000, comments: 60 }, { reach: 4000, comments: 40 }] });
  t(r.ok === true && r.consultas === 13 && r.alcance === 1333, 'F8b el espejo del cliente da lo mismo que el módulo ($20 → 13 consultas, 1333 alcance)', JSON.stringify(r));
  const r2 = sbSim.anaSimEstimar({ presupuestoUSD: 20, boosts: [], posts: [{ reach: 6000, comments: 60 }] });
  t(r2.ok === false && r2.motivo === 'sin_datos_pauta', 'F8c el espejo también dice sin_datos_pauta sin boosts', JSON.stringify(r2));
}
// F9: «Aplicar →» selecciona el recomendado de verdad (mejor 518, destacado 519).
const srcAplicar = extractFn(ana, 'anaRecAplicar');
const srcIrDestacado = extractFn(ana, 'anaImpIrDestacado');
t(srcAplicar.length > 50, 'F9 anaRecAplicar extraída del chunk');
if (srcAplicar.length > 50) {
  const sbA = { console, anaLang: 'es', anaT: (es, en) => es, esc: (s) => String(s == null ? '' : s),
    anaBilleteraDatos: null, __pintado: 0, __scroll: null,
    document: { getElementById: (id) => ({ textContent: '', scrollIntoView: () => { sbA.__scroll = id; } }) },
  };
  sbA.anaBilleteraPintar = () => { sbA.__pintado++; };
  vm.createContext(sbA);
  vm.runInContext(srcAplicar.replace('function anaRecAplicar', 'globalThis.anaRecAplicar = function'), sbA);
  if (srcIrDestacado.length > 50) vm.runInContext(srcIrDestacado.replace('function anaImpIrDestacado', 'globalThis.anaImpIrDestacado = function'), sbA);
  vm.runInContext(srcConstruir, sbA);
  vm.runInContext('anaBilleteraDatos = anaBilleteraConstruirDatos(' + JSON.stringify(fakeF(feed4, elig3, mejor518, hoy521)) + ', null, true);', sbA);
  const antes = sbA.anaBilleteraDatos.selId;
  vm.runInContext('anaRecAplicar();', sbA);
  t(antes === 519 && sbA.anaBilleteraDatos.selId === 518, 'F9b Aplicar cambia el elegido al recomendado (519 → 518)', JSON.stringify([antes, sbA.anaBilleteraDatos.selId]));
  t(sbA.__pintado >= 1, 'F9c Aplicar repinta la vista (el destacado cambia de verdad)');
}

console.log('— G) no-regresiones §3 ítem 7 (Ads/Impulsar) —');
const srcRuta = sliceFn(ana, 'function anaAdsRutaImpulsar(', 'async function anaBilleteraImpulsar(');
t(srcRuta.length > 100, 'G0 anaAdsRutaImpulsar existe');
if (srcRuta.length > 100) {
  const sbR = { console };
  vm.createContext(sbR);
  vm.runInContext(srcRuta.replace('function anaAdsRutaImpulsar', 'globalThis.anaAdsRutaImpulsar = function'), sbR);
  const rutaHoy = sbR.anaAdsRutaImpulsar({ selPost: { post_id: 521 }, hoy: { post_id: 521 }, elegibles: [], feed: [], boostHabilitado: true, selMonto: 20, billetera: { balance_cents: 5000 } });
  t(rutaHoy.ruta === 'chat', 'G1 el posteo de hoy (sin publicar) NO se puede impulsar: va al chat, nunca al cobro', JSON.stringify(rutaHoy));
  const rutaPub = sbR.anaAdsRutaImpulsar({ selPost: { post_id: 519 }, hoy: { post_id: 521 }, elegibles: [{ post_id: 519 }], feed: [{ post_id: 519, ya_impulsado: false }], boostHabilitado: true, selMonto: 20, billetera: { balance_cents: 5000 } });
  t(rutaPub.ruta === 'impulsar', 'G1b el publicado con saldo sí va a impulsar', JSON.stringify(rutaPub));
}
t(ana.includes('function anaBilleteraCargar('), 'G2 Cargar sigue (anaBilleteraCargar)');
t(ana.includes("id=\"anaAdsCargarMsg\"") || ana.includes('anaAdsCargarMsg'), 'G3 el mensaje de Cargar sigue pegado al botón (v786 intacto)');
t(ana.includes('function anaAgregarTarjeta('), 'G4 Agregar tarjeta sigue (anaAgregarTarjeta)');
t(ana.includes('function anaTarjetaRetorno('), 'G4b la vuelta de Stripe sigue (anaTarjetaRetorno)');
let ab = null;
try { ab = require(path.join(__dirname, 'ads-billetera.js')); } catch (e) { ab = null; }
t(ab && typeof ab.elegiblesParaAds === 'function', 'G5 ads-billetera sigue exportando elegiblesParaAds');
if (ab) {
  const elig = ab.elegiblesParaAds([
    { id: 1, status: 'published', ig_media_id: 'x1', media_type: 'image' },
    { id: 2, status: 'scheduled', ig_media_id: 'x2', media_type: 'image' },
    { id: 3, status: 'published', ig_media_id: '', media_type: 'image' },
    { id: 4, status: 'published', ig_media_id: 'x4', media_type: 'story' },
  ], null, new Set());
  t(elig.length === 1 && elig[0].post_id === 1, 'G5b solo publicados con ig_media_id y sin stories son elegibles', JSON.stringify(elig.map((e) => e.post_id)));
}
t(!/Ventas cerradas/.test(sliceFn(ana, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()')), 'G6 la vista Impulsar no inventa ventas (re-chequeo)');

console.log('— H) boot real: versión, billetera, Cargar sin cobro, Impulsar sin gasto —');
(async () => {
  const { spawn } = require('child_process');
  const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-r4-'));
  const PORT = 18821;
  const BASE = `http://127.0.0.1:${PORT}`;
  const waitBoot = async (tries = 60) => {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };
  const api = async (cookie, method, p, body) => {
    const rr = await fetch(BASE + p, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await rr.json(); } catch (e) {}
    const setCookie = rr.headers.get('set-cookie') || '';
    return { status: rr.status, data, setCookie };
  };
  const srvProc = spawn('node', ['server.js'], { cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-r4', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srvProc.stdout.on('data', (d) => { srvLog += d; });
  srvProc.stderr.on('data', (d) => { srvLog += d; });
  try {
    t(await waitBoot(), 'H1 boot levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    t(ver.build === '20261105-v800', 'H1b /api/version 20261105-v793', ver.build);
    const reg = await api('', 'POST', '/api/auth/register', { email: 'r4@test.local', password: 'x1234567', nombre: 'R4' });
    t(reg.status === 200 && reg.data && reg.data.ok, 'H2 registro OK', reg.status + ' ' + JSON.stringify(reg.data));
    const cookie = (reg.setCookie || '').split(';')[0];
    t(!!cookie, 'H2b hay cookie de sesión');
    const bil = await api(cookie, 'GET', '/api/ads/billetera');
    t(bil.status === 200 && bil.data && bil.data.ok, 'H3 GET /api/ads/billetera OK', bil.status);
    t(bil.data && Number(bil.data.balance_cents || 0) === 0, 'H3b saldo 0 al arrancar');
    const cg = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 20 });
    t(cg.status === 409 && cg.data && cg.data.motivo, 'H4 POST cargar $20 → 409 CON motivo (sin Stripe en el boot; nada se cobra)', cg.status + ' ' + JSON.stringify(cg.data));
    const bil2 = await api(cookie, 'GET', '/api/ads/billetera');
    t(bil2.data && Number(bil2.data.balance_cents || 0) === 0, 'H4b saldo sigue en 0 (nada se cobró)');
    const boosts = await api(cookie, 'GET', '/api/ads/boosts');
    t(boosts.status === 200 && boosts.data && boosts.data.ok && Array.isArray(boosts.data.boosts) && boosts.data.boosts.length === 0, 'H5 GET /api/ads/boosts OK (sin campañas todavía)', boosts.status);
    const mejor = await api(cookie, 'GET', '/api/estrategia/mejor-posteo');
    t(mejor.status === 200 && mejor.data && mejor.data.ok, 'H6 GET /api/estrategia/mejor-posteo OK (sin mejor: sin dato, nunca inventado)', mejor.status);
    t(mejor.data && mejor.data.conversion_pendiente === true, 'H6b conversion_pendiente true (sin tasa: sin gasto real)', JSON.stringify(mejor.data && mejor.data.conversion_pendiente));
    const appJs = await (await fetch(`${BASE}/app.js`)).text();
    t(appJs.includes("gzT('Impulsar', 'Boost')"), 'H7 el app.js SERVIDO trae la etiqueta Impulsar');
    const chunk = await (await fetch(`${BASE}/chunk-analisis.js`)).text();
    t(chunk.includes('impSimRange') && chunk.includes('impRecCard') && chunk.includes('impCampanaCard'), 'H8 el chunk SERVIDO trae simulador + recomendación + campaña');
    t(!chunk.includes('Ventas cerradas') || !sliceFn(chunk, 'function anaAdsDirectoHTML()', 'function anaAdsFeedHTML()').includes('Ventas cerradas'), 'H8b el chunk servido no inventa ventas en Impulsar');
  } catch (e) {
    t(false, 'H boot: excepción ' + String((e && e.message) || e));
    console.log('  log del servidor:', String(srvLog).slice(-2000));
  } finally {
    try { srvProc.kill(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\ntest-lote-rediseno-r4: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
