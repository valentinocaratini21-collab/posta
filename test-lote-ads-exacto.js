'use strict';
/* test-lote-ads-exacto.js — LOTE ADS-EXACTO (27/11/2026)
 * El dueño: «me llego un mensaje por facebook que van 4usd gastados
 * en ads pero en el producto me sigue apareciendo menos. como
 * podemos hacer que sea exacto?»
 *
 * El diagnóstico (verificado en vivo): la API oficial de Insights
 * devuelve el gasto real (US$ 3,28 para el impulso 25) y eso es lo
 * que está guardado; el contador de Facebook es en tiempo real y
 * redondea — va adelantado. Pero el producto además PISABA el
 * gasto a dólares enteros (Math.floor) en las pantallas del
 * cliente y lo refrescaba a lo sumo 1 vez por hora: mostraba
 * «US$ 3» de hacía una hora contra el «US$ 4» en vivo de Facebook.
 *
 * El arreglo, en tres piezas:
 *  1. El GASTO con centavos en toda superficie del cliente (el
 *     formato vigente de la tarjeta activa: US$ 3,28 de US$ 20) —
 *     chunk-analisis (tarjeta de campaña + historial) y el
 *     historial de app.js. El presupuesto sigue entero.
 *  2. Frescura: el barrido de stats corre cada 10 min (era 20) y
 *     la caché de stats al leer baja de 1 hora a 5 minutos (la
 *     del estado real en Meta sigue horaria).
 *  3. La tarjeta del impulso activo dice de cuándo es el número:
 *     ads-stats.tarjetaDe suma stats_updated_at +
 *     actualizado_hace_min y el cliente pinta «Actualizado hace
 *     X min» / «Actualizado recién».
 *
 * §A estáticos · §B el módulo puro ads-stats.js (frescura en los
 * bordes) · §C render en VM de las funciones reales del bundle y
 * del chunk (ES, con el gasto real 328 = US$ 3,28).
 * Uso: node test-lote-ads-exacto.js — sale 0 si todo pasa.
 *   AST_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TREE = path.resolve(process.env.AST_TREE || __dirname);
const read = (p) => { try { return fs.readFileSync(path.join(TREE, p), 'utf8'); } catch (e) { return ''; } };
const APP = read('public/app.js');
const CHUNK = read('public/chunk-analisis.js');
const SERVER = read('server.js');
const ADSSTATS_SRC = read('ads-stats.js');

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const count = (s, sub) => (s.split(sub).length - 1);
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
const fmtFecha = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const AHORA = Date.parse('2026-11-27T23:30:00Z');

// ---------- §A: estáticos ----------
console.log('— §A: estáticos (pisos, formato, intervalos, payload)');
t(!CHUNK.includes('Math.floor(Number(activa.last_spend_cents') && !CHUNK.includes('Math.floor(Number(b.last_spend_cents'),
  '§A: chunk-analisis sin ningún Math.floor sobre last_spend_cents');
t(CHUNK.includes('function anaDineroTxt(') && count(CHUNK, 'anaDineroTxt(gastadoCents') >= 2 && CHUNK.includes('minimumFractionDigits: 2'),
  '§A: chunk-analisis formatea el gastado con centavos (anaDineroTxt en la tarjeta activa y en el historial)');
t(!APP.includes('Math.floor(Number(b.last_spend_cents'),
  '§A: app.js sin Math.floor sobre last_spend_cents (el historial también pisaba)');
t(APP.includes('gastadoTxt') && APP.includes('actualizado_hace_min') && APP.includes('Actualizado hace ') && APP.includes('Actualizado recién'),
  '§A: app.js pinta el gastado con centavos en el historial y la frescura («Actualizado hace X min» / «recién») en la tarjeta');
t(ADSSTATS_SRC.includes('stats_updated_at: tieneDatos') && ADSSTATS_SRC.includes('actualizado_hace_min: actualizadoHaceMin(boost, ahoraMs)'),
  '§A: tarjetaDe suma stats_updated_at + actualizado_hace_min al payload, sin romper su forma');
t(SERVER.includes('barridoStatsAds().catch(() => {}); }, 10 * 60 * 1000)'),
  '§A: el barrido de stats corre cada 10 minutos (era 20)');
const fnBarrido = fnFrom(SERVER, 'async function barridoStatsAds(');
t(fnBarrido.includes('> 5 * 60 * 1000') && fnBarrido.includes('> 3600000'),
  '§A: el barrido considera vencidas las stats a los 5 min (el estado real sigue horario)');
const fnRefresh = fnFrom(SERVER, 'async function pzAdsRefrescarBoost(');
t(fnRefresh.includes('const stale = !b.stats_updated_at') && fnRefresh.includes('> 5 * 60 * 1000') && fnRefresh.includes('staleEstado') && fnRefresh.includes('> 3600000'),
  '§A: el refresco al leer (GET /api/ads/boosts) refresca stats con más de 5 min; el estado real conserva su hora');

// ---------- §B: módulo ads-stats.js ----------
console.log('— §B: ads-stats.js (frescura de la tarjeta)');
let adsStats = null;
try { adsStats = require(path.join(TREE, 'ads-stats.js')); } catch (e) { adsStats = null; }
t(!!adsStats && typeof adsStats.tarjetaDe === 'function' && typeof adsStats.actualizadoHaceMin === 'function',
  '§B: ads-stats.js carga y exporta tarjetaDe + actualizadoHaceMin');
if (adsStats) {
  const fila = {
    status: 'active', meta_campaign_id: '120253412569650560', meta_estado: 'ACTIVE',
    objetivo: 'perfil', last_reach: 2, last_clicks: 0, last_visitas_perfil: 0,
    last_spend_cents: 328, budget_cents: 2000, currency: 'USD',
    started_at: fmtFecha(AHORA - 2 * 86400000), duration_days: 7,
    stats_updated_at: fmtFecha(AHORA - 12 * 60000),
  };
  const tj = adsStats.tarjetaDe(fila, AHORA);
  t(tj && tj.gastado_cents === 328 && tj.total_cents === 2000,
    '§B: el gasto de la tarjeta es el centavo exacto de Meta (328 = US$ 3,28 de US$ 20)', JSON.stringify(tj));
  t(tj && tj.stats_updated_at === fila.stats_updated_at && tj.actualizado_hace_min === 12,
    '§B: lectura de hace 12 min → stats_updated_at crudo + actualizado_hace_min = 12', JSON.stringify(tj && tj.actualizado_hace_min));
  t(adsStats.tarjetaDe({ ...fila, stats_updated_at: fmtFecha(AHORA - 30000) }, AHORA).actualizado_hace_min === 0,
    '§B: lectura de hace 30 s → 0 (la tarjeta dice «recién»)');
  const sinDatos = adsStats.tarjetaDe({ ...fila, stats_updated_at: null, last_reach: null, last_clicks: null, last_visitas_perfil: null }, AHORA);
  t(sinDatos && sinDatos.tiene_datos === false && sinDatos.stats_updated_at === null && sinDatos.actualizado_hace_min === null,
    '§B: sin lectura real → frescura null (no se afirma frescura de un número que no existe)');
  t(adsStats.actualizadoHaceMin({ stats_updated_at: fmtFecha(AHORA - 59000) }, AHORA) === 0
    && adsStats.actualizadoHaceMin({ stats_updated_at: fmtFecha(AHORA - 60000) }, AHORA) === 1
    && adsStats.actualizadoHaceMin({ stats_updated_at: fmtFecha(AHORA + 5 * 60000) }, AHORA) === 0
    && adsStats.actualizadoHaceMin({ stats_updated_at: 'no-es-fecha' }, AHORA) === null
    && adsStats.actualizadoHaceMin({}, AHORA) === null,
    '§B: bordes de la frescura — 59 s → 0 · 60 s → 1 · reloj adelantado → 0 · ilegible/ausente → null');
}

// ---------- §C: render en VM ----------
console.log('— §C: render (VM, funciones reales del cliente)');
const escStub = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// app.js: historial + tarjeta activa
{
  const piezas = ['pzAdsHistorialHTML', 'pzAdsImpulsoTarjetaHTML'].map((n) => fnFrom(APP, 'function ' + n + '('));
  t(piezas.every(Boolean), '§C: las piezas del render de app.js extraen enteras del bundle');
  if (piezas.every(Boolean) && adsStats) {
    const sandbox = { console, Set, Map, esc: escStub, ME: { lang: 'es' } };
    vm.createContext(sandbox);
    vm.runInContext(piezas.join('\n'), sandbox);
    const hist = vm.runInContext(`pzAdsHistorialHTML([{ status: 'finished', post_id: 7, budget_cents: 2000, last_spend_cents: 328, currency: 'USD', duration_days: 7, created_at: '2026-11-20 10:00:00', last_reach: 100 }])`, sandbox);
    t(hist.includes('Gastado US$3,28') && !hist.includes('Gastado US$3 '),
      '§C: el historial de app.js muestra «Gastado US$3,28», no el piso «US$3»', hist.slice(0, 300));
    const fila = {
      status: 'active', meta_campaign_id: '120253412569650560', meta_estado: 'ACTIVE',
      objetivo: 'perfil', last_reach: 2, last_clicks: 0, last_visitas_perfil: 0,
      last_spend_cents: 328, budget_cents: 2000, currency: 'USD',
      started_at: fmtFecha(AHORA - 2 * 86400000), duration_days: 7,
      stats_updated_at: fmtFecha(AHORA - 12 * 60000),
    };
    const boost = { status: 'active', post_id: 744, posteo: { caption: 'La peli', media_type: 'video', thumb_url: '' }, tarjeta: adsStats.tarjetaDe(fila, AHORA) };
    sandbox.__boost = boost;
    const tarj = vm.runInContext('pzAdsImpulsoTarjetaHTML(__boost)', sandbox);
    t(tarj.includes('US$3,28') && tarj.includes('Actualizado hace 12 min'),
      '§C: la tarjeta activa muestra el gasto exacto y «Actualizado hace 12 min»', tarj.slice(0, 300));
    sandbox.__boost = { ...boost, tarjeta: adsStats.tarjetaDe({ ...fila, stats_updated_at: fmtFecha(AHORA - 20000) }, AHORA) };
    const tarj2 = vm.runInContext('pzAdsImpulsoTarjetaHTML(__boost)', sandbox);
    t(tarj2.includes('Actualizado recién'),
      '§C: lectura de hace segundos → la tarjeta dice «Actualizado recién»');
    sandbox.__boost = { ...boost, tarjeta: adsStats.tarjetaDe({ ...fila, stats_updated_at: null, last_reach: null, last_clicks: null, last_visitas_perfil: null }, AHORA) };
    const tarj3 = vm.runInContext('pzAdsImpulsoTarjetaHTML(__boost)', sandbox);
    t(tarj3.includes('todavía no reporta') && !tarj3.includes('Actualizado'),
      '§C: sin lectura de Meta, la tarjeta lo dice y NO pinta frescura inventada');
  }
}

// chunk-analisis: tarjeta de campaña + historial
{
  const nombres = ['anaT', 'anaDineroTxt', 'anaCortarCaption', 'anaCampanaActivaHTML', 'anaBilleteraHistorialHTML'];
  const piezas = nombres.map((n) => fnFrom(CHUNK, 'function ' + n + '('));
  t(piezas.every(Boolean), '§C: las piezas del render de chunk-analisis extraen enteras del chunk', nombres.filter((n, i) => !piezas[i]).join(','));
  if (piezas.every(Boolean)) {
    const sandbox = { console, Set, Map, esc: escStub, anaLang: 'es', anaBilleteraDatos: null };
    vm.createContext(sandbox);
    vm.runInContext(piezas.join('\n'), sandbox);
    sandbox.anaBilleteraDatos = {
      boosts: [{ status: 'active', post_id: 744, last_spend_cents: 328, budget_cents: 2000, currency: 'USD', last_reach: 12, created_at: '2026-11-25 10:00:00', duration_days: 7 }],
      feed: [], elegibles: [],
    };
    const activa = vm.runInContext('anaCampanaActivaHTML()', sandbox);
    t(activa.includes('Gastados US$3,28 de US$20') && !activa.includes('Gastados US$3 de'),
      '§C: la tarjeta de campaña muestra «Gastados US$3,28 de US$20», no el piso «US$3»', activa.slice(0, 300));
    sandbox.anaBilleteraDatos = {
      boosts: [{ status: 'finished', post_id: 7, budget_cents: 2000, last_spend_cents: 328, currency: 'USD', duration_days: 7, created_at: '2026-11-20 10:00:00', last_reach: 100 }],
      feed: [], elegibles: [],
    };
    const hist = vm.runInContext('anaBilleteraHistorialHTML()', sandbox);
    t(hist.includes('Gastado US$3,28'),
      '§C: el historial de Análisis muestra «Gastado US$3,28» con centavos', hist.slice(0, 300));
    const cero = vm.runInContext(`anaDineroTxt(328, 'USD', true) + '|' + anaDineroTxt(2000, 'USD', false) + '|' + anaDineroTxt(0, 'USD', true)`, sandbox);
    t(cero === 'US$3,28|US$20|US$0,00',
      '§C: anaDineroTxt — gasto con centavos, presupuesto entero, cero honesto', cero);
  }
}

console.log(`\nRESULTADO: ${pass} ok · ${fail} MAL`);
if (fails.length) { console.log('Fallaron:\n - ' + fails.join('\n - ')); process.exit(1); }
