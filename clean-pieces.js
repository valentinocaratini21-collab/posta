'use strict';
/* clean-pieces.js — Dosificación de texto 2-de-5 en el pipeline de
 * CLIENTES (limpieza 2026-10-18, pedido de Valentino: posteos "más
 * limpios, sin tantas palabras, como los del website").
 *
 * La regla vivía solo en el demo (assignTextModes de demo-captions):
 * en clientes el 100% de las piezas salía con titular. Este módulo es
 * la lógica PURA de la dosificación (sin DB, sin red, sin IA) para que
 * el pipeline semanal, la palanca regen-post y las creaciones
 * individuales decidan el modo de cada pieza con el MISMO asignador
 * del demo y tests puedan verificarla con fixtures.
 *
 * Modos: 'text' (la pieza lleva titular compuesto sobre la imagen) y
 * 'clean' (foto limpia, sin titular hacia la generación; la idea y el
 * CTA viven en el caption, que cierra con el CTA).
 */
const captions = require('./demo-captions');
const { resolveExplicitIntent } = require('./image-styles');

// Mapeo tipo→kind "como hace el demo": el catálogo demo rankea por kind
// (promo/reserva/sorteo/tip/novedad/social). Los tipos de cliente que no
// son un kind del catálogo (detras, foto, …) caen a 'social', el rango
// base del asignador — el mismo resultado que da un kind desconocido.
const KIND_BY_TIPO = {
  promo: 'promo', reserva: 'reserva', sorteo: 'sorteo',
  tip: 'tip', tips: 'tip', educativo: 'tip',
  novedad: 'novedad', social: 'social',
};
function kindOfTipo(tipo) {
  return KIND_BY_TIPO[String(tipo || '').trim().toLowerCase()] || 'social';
}

// Cuántos textos lleva una tanda de N posteos imagen: 2 de 5 (≈40%),
// mínimo 1. Para la semana canónica de 5: exactamente 2.
function textCountForBatch(n) {
  return Math.max(1, Math.round((Number(n) || 0) * 2 / 5));
}

// Modos de una tanda NUEVA (pipeline semanal): 'text' | 'clean' para
// cada pick YA ORDENADO. El pick que va a salir como carousel (el
// primero con intención tips/educativo — el mismo claim sincrónico que
// hace el worker de generateWeekDrafts) queda EXENTO de la cuenta, como
// el reel en el demo: su portada lleva texto por formato y no consume
// uno de los lugares con texto.
function planWeekTextModes(picks, deficit) {
  const list = Array.isArray(picks) ? picks : [];
  let carouselIdx = -1;
  try {
    for (let ix = 0; ix < list.length; ix++) {
      const p = list[ix] || {};
      const ri = resolveExplicitIntent({ tipo: p.tipo || '', theme: p.titulo || '', angle: p.angulo || p.porque || '' });
      if (ri.intent === 'tips' || ri.intent === 'educativo') { carouselIdx = ix; break; }
    }
  } catch (e) {}
  const topics = list.map((p) => ({ kind: kindOfTipo(p && p.tipo) }));
  const modes = captions.assignTextModes(topics, carouselIdx, textCountForBatch(deficit != null ? deficit : list.length));
  return { modes, carouselIdx };
}

// Modo de UNA pieza dentro de una semana ya compuesta: `kinds` es la
// lista de kinds de los posteos imagen de la semana EN ORDEN, con la
// pieza incluida en la posición `selfPos`. Corre el MISMO asignador:
// si la semana ya tiene sus textos mejor rankeados, la pieza sale
// limpia; si hay lugar y su kind rankea, sale con texto.
function modeFromWeekKinds(kinds, selfPos) {
  const list = Array.isArray(kinds) ? kinds : [];
  const topics = list.map((kind) => ({ kind }));
  const modes = captions.assignTextModes(topics, -1, textCountForBatch(topics.length));
  return modes[selfPos] || 'text';
}

// ---------- Cuotas de intención semanal (v231, adopción Predis) ----------
// Además de la dosificación de TEXTO, la semana se audita por
// INTENCIÓN (el mix valor / comunidad / ventas del style guide de
// Predis): ~2 valor, ~2 comunidad, ~1 venta en la semana de 5. No se
// fuerza un mix fino — solo se corrige el caso DEGENERADO (la semana
// sale TODA promo, o TODA tip) canjeando picks de la ventana por
// picks del buffer ya generado (cero llamadas de IA extra).
const INTENT_BY_KIND = {
  tip: 'valor',
  social: 'comunidad',
  promo: 'venta', reserva: 'venta', novedad: 'venta', sorteo: 'venta',
};
function intentOfKind(kind) { return INTENT_BY_KIND[kind] || 'comunidad'; }
function intentOfTipo(tipo) { return intentOfKind(kindOfTipo(tipo)); }
function intentMixOf(picks) {
  const mix = { valor: 0, comunidad: 0, venta: 0 };
  for (const p of (Array.isArray(picks) ? picks : [])) mix[intentOfTipo(p && p.tipo)]++;
  return mix;
}
// picks: ventana (los primeros `deficit`) + buffer. Devuelve la lista
// reordenada (ventana corregida + buffer con los canjeados) y cuántos
// canjes hizo. Sin buffer útil o sin degeneración → la misma lista.
function rebalanceIntentPicks(picks, deficit) {
  const list = (Array.isArray(picks) ? picks : []).slice();
  const n = Math.min(Math.max(parseInt(deficit, 10) || 0, 0), list.length);
  if (n < 3 || list.length <= n) return { picks: list, swapped: 0 };
  const win = list.slice(0, n);
  const buf = list.slice(n);
  const countIn = (arr, it) => arr.filter((p) => intentOfTipo(p && p.tipo) === it).length;
  let swapped = 0;
  for (const dom of ['venta', 'valor', 'comunidad']) {
    let c = countIn(win, dom);
    const limit = c === n ? n - 2 : (n >= 4 && c >= n - 1 ? n - 2 : null);
    if (limit === null) continue;
    for (let i = win.length - 1; i >= 0 && c > limit; i--) {
      if (intentOfTipo(win[i] && win[i].tipo) !== dom) continue;
      const bi = buf.findIndex((p) => intentOfTipo(p && p.tipo) !== dom);
      if (bi < 0) break;
      const [incoming] = buf.splice(bi, 1);
      buf.push(win[i]);
      win[i] = incoming;
      c--; swapped++;
    }
  }
  return { picks: [...win, ...buf], swapped };
}

module.exports = { KIND_BY_TIPO, kindOfTipo, textCountForBatch, planWeekTextModes, modeFromWeekKinds, INTENT_BY_KIND, intentOfKind, intentOfTipo, intentMixOf, rebalanceIntentPicks };
