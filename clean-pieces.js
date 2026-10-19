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

module.exports = { KIND_BY_TIPO, kindOfTipo, textCountForBatch, planWeekTextModes, modeFromWeekKinds };
