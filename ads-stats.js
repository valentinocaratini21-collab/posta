'use strict';

// ── LOTE ADS-STATS-TARJETA ───────────────────────────────────────
// La tarjeta del impulso activo (pantalla de Ads, opción 1 del
// dueño, 23/11/2026): el posteo, el chip IMPULSANDO, las stats que
// importan y la barra de presupuesto. Este módulo es PURO: arma la
// carga de la tarjeta desde la fila de ad_boosts, sin red y sin
// base. Los números salen SOLO de lo que Meta reportó para esa
// campaña y quedó persistido (last_* + stats_updated_at, refrescado
// por GET /api/ads/boosts con la conexión de Ads del cliente o la
// cuenta de Posty — ver el barrido en server.js).
//
// REGLA DE VERDAD (la vara del producto):
//  · Sin lectura real (stats_updated_at vacío — impulso recién
//    creado o Meta nunca devolvió fila) la tarjeta va en estado
//    «sin números» (tiene_datos=false, stats=[]) — nunca ceros de
//    relleno.
//  · Una stat que Meta no devolvió para el objetivo del impulso
//    (su columna nullable en null) NO entra en la lista: se omite,
//    no se estima.
//  · El gasto es el spend real reportado; el total es la pauta del
//    impulso (budget_cents, sin la gestión — la gestión no la
//    gasta Meta). El día X de Y sale de las fechas reales.

const adsAudiencia = require('./ads-audiencia');

function numONull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// La stat que manda el objetivo, UNA por impulso. El mapeo es el
// honesto de la casa: para los objetivos de siempre se LEE el de
// ads-audiencia (mapeoMeta — este módulo no lo reescribe); el de
// «perfil» se lee del objetivo guardado en la fila (una fila solo
// puede traer objetivo='perfil' si el camino de creación ya lo
// ofrecía, y su medición — visitas al perfil, verificada contra la
// doc oficial de Meta en el censo de ADS-PREGUNTAS — es esta):
//  · medicion 'conversaciones' (escribirte/reservar/comprar) →
//    conversaciones iniciadas: la acción de Meta
//    onsite_conversion.messaging_conversation_started_* →
//    last_conversaciones (columna histórica: tras una lectura real,
//    su valor ES el conteo de Meta — la convención que ya usa
//    resultadoDe).
//  · 'perfil' → visitas al perfil: la acción ~ profile_visit →
//    last_visitas_perfil (nullable: sin la acción en la respuesta,
//    la stat se omite).
//  · medicion 'clics' (local/seguir/sin dato — la optimización
//    real por esta vía es POST_ENGAGEMENT) → interacciones con el
//    posteo: la acción exacta post_engagement → last_interacciones
//    (nullable). Nunca «seguidores nuevos»: Meta no los atribuye
//    a este anuncio.
function statDelObjetivo(boost) {
  const objetivo = String((boost && boost.objetivo) || '');
  if (objetivo === 'perfil') return { clave: 'visitas_perfil', valor: numONull(boost.last_visitas_perfil) };
  const mapeo = adsAudiencia.mapeoMeta(adsAudiencia.OBJETIVOS.includes(objetivo) ? objetivo : null);
  if (mapeo.medicion === 'conversaciones') return { clave: 'conversaciones', valor: numONull(boost.last_conversaciones) };
  if (mapeo.medicion === 'visitas_perfil') return { clave: 'visitas_perfil', valor: numONull(boost.last_visitas_perfil) };
  return { clave: 'interacciones', valor: numONull(boost.last_interacciones) };
}

// Día X de Y: períodos de 24 h desde el arranque real del impulso
// (started_at; si falta, created_at — la misma convención del
// historial: created_at + duration_days). El día se acota a
// [1, duration_days]: un activo vencido a la espera del cierre
// dice «día Y de Y», nunca un día imposible. Sin fecha legible,
// dia=null y la tarjeta no pinta la línea de días.
function diaDe(boost, ahoraMs) {
  const total = Math.max(1, Number((boost && boost.duration_days) || 7)) || 7;
  const iniTxt = String((boost && (boost.started_at || boost.created_at)) || '');
  if (!iniTxt) return { dia: null, total };
  const ini = Date.parse(iniTxt.replace(' ', 'T') + (/Z|[+-]\d{2}:?\d{2}$/.test(iniTxt) ? '' : 'Z'));
  if (!Number.isFinite(ini)) return { dia: null, total };
  const ahora = Number.isFinite(ahoraMs) ? ahoraMs : Date.now();
  let dia = Math.floor((ahora - ini) / 86400000) + 1;
  if (dia < 1) dia = 1;
  if (dia > total) dia = total;
  return { dia, total };
}

// La carga completa de la tarjeta para una fila de ad_boosts.
// stats: hasta 3, en orden — alcance (reach de Meta), la acción
// del objetivo, clics (clicks de Meta) — solo las que tienen dato.
function tarjetaDe(boost, ahoraMs) {
  if (!boost || typeof boost !== 'object') return null;
  const tieneDatos = !!boost.stats_updated_at;
  const stats = [];
  if (tieneDatos) {
    const alcance = numONull(boost.last_reach);
    if (alcance !== null) stats.push({ clave: 'alcance', valor: alcance });
    const delObj = statDelObjetivo(boost);
    if (delObj.valor !== null) stats.push({ clave: delObj.clave, valor: delObj.valor });
    const clics = numONull(boost.last_clicks);
    if (clics !== null) stats.push({ clave: 'clics', valor: clics });
  }
  const dias = diaDe(boost, ahoraMs);
  return {
    tiene_datos: tieneDatos,
    stats,
    gastado_cents: Math.max(0, Number(boost.last_spend_cents || 0) || 0),
    total_cents: Math.max(0, Number(boost.budget_cents || 0) || 0),
    currency: String(boost.currency || 'USD'),
    dia: dias.dia,
    dias_total: dias.total,
  };
}

module.exports = { tarjetaDe, diaDe, statDelObjetivo };
