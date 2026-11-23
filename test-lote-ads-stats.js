'use strict';
/* test-lote-ads-stats.js — LOTE ADS-STATS-TARJETA (línea 1863)
 * (decisión del dueño 23/11/2026 03:08, opción 1 del mock de 5):
 * «acá en esta pantalla estaría bueno que si impulsé un posteo, me
 * aparezcan stats de ese posteo». Su caso real: impulsó la película
 * (posteo 744, US$20 + US$2 de gestión, 7 días) y la pantalla de Ads
 * solo decía «Tus impulsos: 1», sin devolver un solo resultado.
 *
 * El arreglo: cada impulso ACTIVO se muestra en su propia tarjeta
 * (miniatura + caption del posteo, chip IMPULSANDO, las stats que
 * Meta reportó para SU objetivo y la barra US$ gastado de US$ total
 * · día X de Y). Los números salen SOLO de los insights reales de
 * Meta de esa campaña, leídos con la conexión de Ads del cliente
 * (getBoostStatsConCtx, nuevo) o la cuenta de Posty, con la caché
 * de siempre (persistido; refresco a lo sumo 1 vez/hora al leer).
 *
 * §A estáticos + gate M78 · §B el módulo puro ads-stats.js con
 * filas fixture (mapeo objetivo→stats, stat sin dato omitida,
 * recién creado sin insights → «sin números», nunca ceros; día X
 * de Y en los bordes; gasto/total) · §C meta_ads.js con fetch
 * stubbeado (fixtures con la forma real de la respuesta de
 * insights; NUNCA se llama a Meta real) · §D render en VM de las
 * funciones reales del bundle (ES/EN, con datos, sin datos, sin
 * activos, y la fila «Tus impulsos» sin los activos).
 * En la base prístina v1251 las secciones caen donde el lote vive
 * (no hay módulo ads-stats, ni getBoostStatsConCtx, ni columnas,
 * ni tarjeta): es el estado de la captura del dueño.
 * Uso: node test-lote-ads-stats.js — sale 0 si todo pasa.
 *   AST_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TREE = path.resolve(process.env.AST_TREE || __dirname);
const read = (p) => { try { return fs.readFileSync(path.join(TREE, p), 'utf8'); } catch (e) { return ''; } };
const APP = read('public/app.js');
const SERVER = read('server.js');
const META = read('meta_ads.js');
const DBJS = read('db.js');
const ADSSTATS_SRC = read('ads-stats.js');

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const count = (s, sub) => (s.split(sub).length - 1);
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

// ---------- §A: estáticos + gate M78 ----------
console.log('— §A: estáticos');
const appCode = stripComments(APP);
t(ADSSTATS_SRC.includes("require('./ads-audiencia')") && ADSSTATS_SRC.includes('module.exports = { tarjetaDe, diaDe, statDelObjetivo }'),
  '§A: ads-stats.js existe, es puro y exporta tarjetaDe/diaDe/statDelObjetivo');
t(DBJS.includes('ALTER TABLE ad_boosts ADD COLUMN last_visitas_perfil INTEGER`') && !DBJS.includes('last_visitas_perfil INTEGER NOT NULL'),
  '§A: db.js suma last_visitas_perfil NULLABLE (la ausencia se conserva)');
t(DBJS.includes('ALTER TABLE ad_boosts ADD COLUMN last_interacciones INTEGER`') && !DBJS.includes('last_interacciones INTEGER NOT NULL'),
  '§A: db.js suma last_interacciones NULLABLE');
t(count(META, 'function statsDesdeRow(') === 1 && count(META, 'async function getBoostStatsConCtx(') === 1,
  '§A: meta_ads.js trae statsDesdeRow ×1 y getBoostStatsConCtx ×1');
t(META.includes('profile_visit') && META.includes('post_engagement') && META.includes('getBoostStats, getBoostStatsConCtx, statsDesdeRow'),
  '§A: la extracción barre profile_visit y post_engagement y los exports los incluyen');
t(SERVER.includes("const adsStats = require('./ads-stats');"), '§A: server.js requiere ads-stats');
t(SERVER.includes('getBoostStatsConCtx(b.meta_campaign_id, ctxStats)') && SERVER.includes('connStats.primary_ad_account_id'),
  '§A: el refresco lee con la conexión del cliente (su SUAT, su cuenta)');
t(SERVER.includes('last_visitas_perfil=?, last_interacciones=?'), '§A: el UPDATE del refresco persiste las dos stats nuevas');
t(SERVER.includes('tarjeta: adsStats.tarjetaDe(b)') && SERVER.includes('thumb_url'),
  '§A: el endpoint adjunta tarjeta y posteo (miniatura) a cada impulso');
t(count(appCode, 'function pzAdsImpulsoTarjetaHTML(') === 1 && count(appCode, 'function pzAdsImpulsosActivosHTML(') === 1,
  '§A: las dos funciones de la tarjeta existen ×1 en el bundle');
t(appCode.includes('${pzAdsImpulsosActivosHTML()}${pzAdsFilasHTML()}'),
  '§A: pzAdsHTML pinta las tarjetas de activos antes de la tarjeta de filas');
t(appCode.includes('pzAdsHistorialHTML(otrosImp)') && appCode.includes("b.status !== 'active'"),
  '§A: la fila «Tus impulsos» lista solo los NO activos (los activos viven en su tarjeta)');
t(appCode.includes('sumaStats') && appCode.includes('ultStats'),
  '§A: la firma de repintado incluye las stats (la tarjeta se actualiza en caliente)');
t(appCode.includes('Meta todavía no reporta números de este impulso.') && appCode.includes("Meta hasn't reported numbers for this boost yet."),
  '§A: el estado «sin números» existe en ES y EN');
// Gate M78: toda función llamada desde el camino de render tocado
// por el lote existe definida exactamente una vez en el bundle.
const GATE = ['pzAdsHTML', 'pzAdsImpulsosActivosHTML', 'pzAdsImpulsoTarjetaHTML', 'pzAdsFilasHTML',
  'pzAdsHistorialHTML', 'pzAdsFilaToggle', 'pzAdsConexionValor', 'pzAdsConexionHTML', 'pzAdsPickRowHTML'];
let gateOk = 0;
for (const n of GATE) { if (count(appCode, 'function ' + n + '(') === 1) gateOk++; }
t(gateOk === GATE.length, `§A·M78: funciones auditadas ${gateOk}/${GATE.length} definidas ×1 en el bundle`,
  GATE.filter((n) => count(appCode, 'function ' + n + '(') !== 1).join(','));

// ---------- §B: el módulo puro con fixtures ----------
console.log('— §B: ads-stats.js (módulo)');
let adsStats = null;
try { adsStats = require(path.join(TREE, 'ads-stats.js')); } catch (e) { adsStats = null; }
t(!!adsStats, '§B: ads-stats.js carga', adsStats ? '' : 'no se pudo requerir');
if (adsStats) {
  const AHORA = Date.parse('2026-11-23T12:00:00Z');
  const base = {
    status: 'active', currency: 'USD', budget_cents: 2000, fee_cents: 200,
    duration_days: 7, created_at: '2026-11-21 07:30:42', started_at: '2026-11-21 07:30:42',
    stats_updated_at: '2026-11-23 11:00:00',
    last_spend_cents: 600, last_reach: 1240, last_impressions: 2100, last_clicks: 54,
    last_conversaciones: 5, last_visitas_perfil: 86, last_interacciones: 88,
  };
  const claves = (tj) => (tj ? tj.stats.map((s) => s.clave + '=' + s.valor).join(',') : 'null');

  const tEsc = adsStats.tarjetaDe({ ...base, objetivo: 'escribirte' }, AHORA);
  t(tEsc.tiene_datos === true && claves(tEsc) === 'alcance=1240,conversaciones=5,clics=54',
    '§B: escribirte → alcance + conversaciones + clics', claves(tEsc));
  const tRes = adsStats.tarjetaDe({ ...base, objetivo: 'reservar' }, AHORA);
  t(claves(tRes) === 'alcance=1240,conversaciones=5,clics=54', '§B: reservar → conversaciones', claves(tRes));
  const tCom = adsStats.tarjetaDe({ ...base, objetivo: 'comprar' }, AHORA);
  t(claves(tCom) === 'alcance=1240,conversaciones=5,clics=54', '§B: comprar → conversaciones', claves(tCom));
  const tPer = adsStats.tarjetaDe({ ...base, objetivo: 'perfil' }, AHORA);
  t(claves(tPer) === 'alcance=1240,visitas_perfil=86,clics=54',
    '§B: perfil → alcance + visitas al perfil + clics', claves(tPer));
  const tPerSin = adsStats.tarjetaDe({ ...base, objetivo: 'perfil', last_visitas_perfil: null }, AHORA);
  t(claves(tPerSin) === 'alcance=1240,clics=54',
    '§B: perfil SIN la acción en la respuesta de Meta → visitas omitida (nunca un 0 de relleno)', claves(tPerSin));
  const tLoc = adsStats.tarjetaDe({ ...base, objetivo: 'local' }, AHORA);
  t(claves(tLoc) === 'alcance=1240,interacciones=88,clics=54',
    '§B: local → alcance + interacciones + clics', claves(tLoc));
  const tSeg = adsStats.tarjetaDe({ ...base, objetivo: 'seguir' }, AHORA);
  t(claves(tSeg) === 'alcance=1240,interacciones=88,clics=54',
    '§B: seguir → interacciones (nunca «seguidores» inventados)', claves(tSeg));
  const tLocSin = adsStats.tarjetaDe({ ...base, objetivo: 'local', last_interacciones: null }, AHORA);
  t(claves(tLocSin) === 'alcance=1240,clics=54',
    '§B: local SIN post_engagement en la respuesta → interacciones omitida', claves(tLocSin));
  const tLeg = adsStats.tarjetaDe({ ...base, objetivo: '' }, AHORA);
  t(claves(tLeg) === 'alcance=1240,interacciones=88,clics=54',
    '§B: impulso histórico sin objetivo → camino de engagement (interacciones)', claves(tLeg));

  const tNuevo = adsStats.tarjetaDe({
    status: 'active', currency: 'USD', budget_cents: 2000, duration_days: 7,
    created_at: '2026-11-23 11:59:00', started_at: null, stats_updated_at: null,
    last_spend_cents: 0, last_reach: 0, last_impressions: 0, last_clicks: 0,
    last_conversaciones: 0, last_visitas_perfil: null, last_interacciones: null, objetivo: 'escribirte',
  }, AHORA);
  t(tNuevo.tiene_datos === false && tNuevo.stats.length === 0,
    '§B: recién creado, sin insights → estado «sin números», stats vacías (nunca ceros falsos)', JSON.stringify(tNuevo));
  t(tNuevo.gastado_cents === 0 && tNuevo.total_cents === 2000 && tNuevo.dia === 1 && tNuevo.dias_total === 7,
    '§B: el recién creado igual declara gasto 0 de 2000 y día 1 de 7 (de sus fechas reales)', JSON.stringify(tNuevo));

  const ini = Date.parse('2026-11-21T07:30:42Z');
  t(adsStats.diaDe({ started_at: '2026-11-21 07:30:42', duration_days: 7 }, ini + 3600000).dia === 1,
    '§B: día 1 dentro de las primeras 24 h');
  t(adsStats.diaDe({ started_at: '2026-11-21 07:30:42', duration_days: 7 }, ini + 25 * 3600000).dia === 2,
    '§B: día 2 al pasar las 24 h (el caso del dueño: US$20, 7 días)');
  t(adsStats.diaDe({ started_at: '2026-11-21 07:30:42', duration_days: 7 }, ini + 3.5 * 86400000).dia === 4,
    '§B: día 4 de 7 a mitad de camino');
  t(adsStats.diaDe({ started_at: '2026-11-21 07:30:42', duration_days: 7 }, ini + 30 * 86400000).dia === 7,
    '§B: vencido pero activo → acotado a «día 7 de 7», nunca un día imposible');
  t(adsStats.diaDe({ started_at: null, created_at: '2026-11-21 07:30:42', duration_days: 7 }, ini + 25 * 3600000).dia === 2,
    '§B: sin started_at, el día sale de created_at (la convención del historial)');
  t(adsStats.diaDe({ started_at: null, created_at: null, duration_days: 7 }, ini).dia === null,
    '§B: sin fechas legibles → dia null (la tarjeta no pinta la línea de días)');
  t(adsStats.tarjetaDe(null) === null && adsStats.tarjetaDe({ ...base, objetivo: 'escribirte' }, AHORA).gastado_cents === 600,
    '§B: tarjetaDe(null) = null; el gasto sale del spend persistido (600 = US$6 de US$20)');
}

// ---------- §C: meta_ads.js con fetch stubbeado ----------
console.log('— §C: meta_ads.js (fetch stub, forma real de insights)');
(async () => {
  const TOK = ['tok', 'en-del-sistema-largo'].join('-');
  const TOKC = ['tok', 'en-del-cliente'].join('-');
  process.env.META_ADS_TOKEN = TOK + '-0123456789abcdef';
  process.env.META_AD_ACCOUNT_ID = '111111111111111';
  let metaAds = null;
  try { metaAds = require(path.join(TREE, 'meta_ads.js')); } catch (e) { metaAds = null; }
  t(!!metaAds && typeof metaAds.getBoostStatsConCtx === 'function' && typeof metaAds.statsDesdeRow === 'function',
    '§C: meta_ads.js carga y exporta la lectura con ctx');
  if (metaAds) {
    const filaReal = {
      spend: '6.00', reach: '1240', impressions: '2100', clicks: '54',
      actions: [
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' },
        { action_type: 'onsite_conversion.profile_visit', value: '86' },
        { action_type: 'post_engagement', value: '88' },
        { action_type: 'link_click', value: '40' },
      ],
    };
    let urls = [];
    const stub = (resp) => {
      urls = [];
      global.fetch = async (url) => { urls.push(String(url)); return { ok: true, status: 200, json: async () => resp }; };
    };
    stub({ data: [filaReal] });
    const s1 = await metaAds.getBoostStats('999001');
    t(s1 && s1.spend_cents === 600 && s1.reach === 1240 && s1.impressions === 2100 && s1.clicks === 54
      && s1.conversaciones === 5 && s1.visitas_perfil === 86 && s1.interacciones === 88,
      '§C: la fila real se extrae entera (gasto, alcance, impresiones, clics y las 3 acciones)', JSON.stringify(s1));
    t(urls.length === 1 && urls[0].includes('/act_111111111111111/insights') && urls[0].includes('campaign.id'),
      '§C: el riel propio lee a nivel cuenta filtrando por campaña', urls[0] || '');

    stub({ data: [{ spend: '1.00', reach: '10', impressions: '20', clicks: '2', actions: [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' }] }] });
    const s2 = await metaAds.getBoostStats('999002');
    t(s2 && s2.conversaciones === 3 && s2.visitas_perfil === null && s2.interacciones === null,
      '§C: sin la acción en la respuesta → visitas/interacciones null (ausencia, no cero)', JSON.stringify(s2));
    stub({ data: [{ spend: '0.00', reach: '0', impressions: '0', clicks: '0', actions: [] }] });
    const s3 = await metaAds.getBoostStats('999003');
    t(s3 && s3.conversaciones === 0 && s3.visitas_perfil === null && s3.interacciones === null,
      '§C: fila sin acciones → conversaciones 0 (convención de la casa) y las nuevas en null', JSON.stringify(s3));
    stub({ data: [] });
    t((await metaAds.getBoostStats('999004')) === null,
      '§C: Meta sin fila para la campaña → null (la tarjeta queda «sin números», no en cero)');

    if (typeof metaAds.getBoostStatsConCtx === 'function') {
      stub({ data: [filaReal] });
      const s5 = await metaAds.getBoostStatsConCtx('999001', { token: TOKC, adAccountId: '222222222222222' });
      t(s5 && s5.visitas_perfil === 86 && s5.interacciones === 88 && s5.conversaciones === 5,
        '§C: la lectura con ctx extrae igual que la del riel propio', JSON.stringify(s5));
      t(urls.length === 1 && urls[0].includes('/act_222222222222222/insights') && urls[0].includes(TOKC),
        '§C: la lectura con ctx pide contra la cuenta DEL CLIENTE con SU token', urls[0] || '');
      t((await metaAds.getBoostStatsConCtx('999001', { token: '', adAccountId: '222222222222222' })) === null
        && (await metaAds.getBoostStatsConCtx('999001', null)) === null,
        '§C: ctx incompleto → null (nunca cae al token de otro)');
      global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid OAuth access token.', code: 190 } }) });
      t((await metaAds.getBoostStatsConCtx('999001', { token: TOKC, adAccountId: '222222222222222' })) === null,
        '§C: error de Meta en el riel del cliente → null (el llamador conserva lo persistido)');
    } else {
      // En el prístino la función no existe: los 4 checks del riel
      // del cliente caen acá (es el hueco que el lote cierra).
      t(false, '§C: la lectura con ctx extrae igual que la del riel propio', 'getBoostStatsConCtx ausente');
      t(false, '§C: la lectura con ctx pide contra la cuenta DEL CLIENTE con SU token', 'getBoostStatsConCtx ausente');
      t(false, '§C: ctx incompleto → null (nunca cae al token de otro)', 'getBoostStatsConCtx ausente');
      t(false, '§C: error de Meta en el riel del cliente → null (el llamador conserva lo persistido)', 'getBoostStatsConCtx ausente');
    }
  }

  // ---------- §D: render en VM ----------
  console.log('— §D: render (VM, funciones reales del bundle)');
  const piezasNombres = ['pzAdsImpulsoTarjetaHTML', 'pzAdsImpulsosActivosHTML', 'pzAdsHistorialHTML', 'pzAdsFilasHTML'];
  let piezas = '', faltan = [];
  for (const n of piezasNombres) {
    const f = fnFrom(appCode, 'function ' + n + '(');
    if (!f) faltan.push(n); else piezas += f + '\n';
  }
  t(faltan.length === 0, '§D: las piezas del render extraen enteras del bundle', faltan.join(','));
  if (!faltan.length && adsStats) {
    const sandbox = {
      console, Set, Map,
      esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      ME: { lang: 'es' },
      pzAdsBoosts: [],
      pzAdsFilaAbierta: '',
      pzAdsConexionValor: () => 'Posty',
      pzAdsConexionHTML: () => '<div></div>',
    };
    vm.createContext(sandbox);
    vm.runInContext(piezas, sandbox);
    const enVM = (expr) => vm.runInContext(expr, sandbox);
    const AHORA = Date.parse('2026-11-23T12:00:00Z');
    const filaBase = {
      id: 23, post_id: 744, status: 'active', currency: 'USD', budget_cents: 2000, fee_cents: 200,
      duration_days: 7, created_at: '2026-11-22 07:30:42', started_at: '2026-11-22 07:30:42',
      stats_updated_at: '2026-11-23 11:00:00', last_spend_cents: 600, last_reach: 1240,
      last_impressions: 2100, last_clicks: 54, last_conversaciones: 5,
      last_visitas_perfil: 86, last_interacciones: 88, objetivo: 'escribirte',
    };
    const posteoFilm = { media_type: 'reel', caption: 'Tu producto real, posteado. Nada de fotos genéricas.', thumb_url: 'https://postycommunitymanager.com/media/poster744.jpg' };
    const boostEsc = { ...filaBase, tarjeta: adsStats.tarjetaDe(filaBase, AHORA), posteo: posteoFilm };
    const hEsc = enVM('pzAdsImpulsoTarjetaHTML') && enVM(`pzAdsImpulsoTarjetaHTML(${JSON.stringify(boostEsc)})`);
    t(hEsc.includes('IMPULSANDO') && hEsc.includes('Tu producto real, posteado.'),
      '§D·ES: la tarjeta pinta el chip y el posteo (su caption)', hEsc.slice(0, 160));
    t(hEsc.includes('ALCANCE') && hEsc.includes('1.240') && hEsc.includes('MENSAJES') && hEsc.includes('CLICS'),
      '§D·ES: las 3 stats del objetivo escribirte, con el alcance en formato es-AR (1.240)');
    t(hEsc.includes('US$6 de US$20') && hEsc.includes('Día 2 de 7'),
      '§D·ES: la barra dice US$6 de US$20 y Día 2 de 7 (el caso del dueño)');
    t(hEsc.includes('poster744.jpg'), '§D·ES: la miniatura es la real del posteo');

    const filaPerfil = { ...filaBase, objetivo: 'perfil' };
    const boostPer = { ...filaPerfil, tarjeta: adsStats.tarjetaDe(filaPerfil, AHORA), posteo: posteoFilm };
    const hPer = enVM(`pzAdsImpulsoTarjetaHTML(${JSON.stringify(boostPer)})`);
    t(hPer.includes('VISITAS AL PERFIL') && !hPer.includes('MENSAJES'),
      '§D·ES: con objetivo perfil la stat es visitas al perfil (y no mensajes)');

    const filaNueva = { ...filaBase, stats_updated_at: null, last_spend_cents: 0, last_reach: 0, last_clicks: 0, last_conversaciones: 0, last_visitas_perfil: null, last_interacciones: null };
    const boostNuevo = { ...filaNueva, tarjeta: adsStats.tarjetaDe(filaNueva, AHORA), posteo: posteoFilm };
    const hNuevo = enVM(`pzAdsImpulsoTarjetaHTML(${JSON.stringify(boostNuevo)})`);
    t(hNuevo.includes('Meta todavía no reporta números de este impulso.') && !hNuevo.includes('ALCANCE') && !hNuevo.includes('US$0 de'),
      '§D·ES: sin lectura de Meta → el aviso honesto, sin stats ni barra en cero', hNuevo.slice(0, 200));

    sandbox.ME = { lang: 'en' };
    const hEn = enVM(`pzAdsImpulsoTarjetaHTML(${JSON.stringify(boostEsc)})`);
    t(hEn.includes('BOOSTING') && hEn.includes('REACH') && hEn.includes('1,240') && hEn.includes('US$6 of US$20') && hEn.includes('Day 2 of 7'),
      '§D·EN: espejo completo (BOOSTING · REACH 1,240 · US$6 of US$20 · Day 2 of 7)');
    const hEnNuevo = enVM(`pzAdsImpulsoTarjetaHTML(${JSON.stringify(boostNuevo)})`);
    // El aviso pasa por esc(): la comilla llega escapada (&#39;).
    t(hEnNuevo.includes('Meta hasn&#39;t reported numbers for this boost yet.'),
      '§D·EN: el aviso «sin números» también en inglés');
    sandbox.ME = { lang: 'es' };

    sandbox.pzAdsBoosts = [];
    t(enVM('pzAdsImpulsosActivosHTML()') === '', '§D: sin impulsos → la sección no pinta nada');
    sandbox.pzAdsBoosts = [{ ...filaBase, status: 'finished', tarjeta: adsStats.tarjetaDe(filaBase, AHORA), posteo: posteoFilm }];
    t(enVM('pzAdsImpulsosActivosHTML()') === '', '§D: sin ACTIVOS (solo terminados) → la sección no pinta nada');
    sandbox.pzAdsBoosts = [boostEsc];
    const hSec = enVM('pzAdsImpulsosActivosHTML()');
    t(hSec.includes('IMPULSANDO') && hSec.includes('US$6 de US$20'),
      '§D: con un activo, la sección pinta su tarjeta');

    const fin = { ...filaBase, id: 20, post_id: 700, status: 'finished', tarjeta: adsStats.tarjetaDe(filaBase, AHORA), posteo: posteoFilm };
    sandbox.pzAdsBoosts = [boostEsc, fin];
    sandbox.pzAdsFilaAbierta = 'impulsos';
    const hFilas = enVM('pzAdsFilasHTML()');
    t(hFilas.includes('Tus impulsos') && hFilas.includes('Posteo #700') && !hFilas.includes('Posteo #744'),
      '§D: la fila «Tus impulsos» lista el terminado y NO duplica el activo (vive en su tarjeta)');
    sandbox.pzAdsBoosts = [boostEsc];
    const hSoloAct = enVM('pzAdsFilasHTML()');
    t(!hSoloAct.includes('Tus impulsos'), '§D: si todos son activos, la fila «Tus impulsos» no se pinta');
    sandbox.pzAdsBoosts = [];
    const hVacio = enVM('pzAdsFilasHTML()');
    t(hVacio.includes('Tus impulsos') && hVacio.includes('Todavía ninguno'),
      '§D: sin impulsos, la pantalla queda como hoy («Todavía ninguno»)');
  }

  console.log(`\n${pass} ok · ${fail} MAL`);
  if (fails.length) console.log('Fallan:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR de suite:', e && e.message); process.exit(1); });
