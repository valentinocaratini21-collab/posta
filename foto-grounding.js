'use strict';
/* =====================================================================
 * foto-grounding.js — LOTE CONTENIDO-FOTO (1/11/2026).
 * Gate determinístico y puro (sin db, sin IA, sin red) entre una FOTO
 * REAL y el texto que se le quiere poner encima o al lado.
 *
 * El problema que cierra: Posty generaba el caption desde el perfil
 * del negocio sin mirar la foto, así que una foto de estadio terminaba
 * vendiendo la prueba de 3 días. El gate NO exige solape literal de
 * palabras (un titular conceptual legítimo —"el brunch que merecés"—
 * no comparte palabras con la nota y no debe rechazarse). Solo bloquea
 * la clase clara del bug: foto ajena al negocio (tag 'otro') + caption
 * promocional de la oferta. La aprobación/Bandeja sigue siendo el
 * backstop final: nada se publica sin OK del dueño.
 * ===================================================================== */

// Marcadores de caption promocional de la oferta (ES/EN). La lista es
// a propósito acotada a promo de venta, no a cualquier CTA: un caption
// que solo describe lo que se ve no es promo aunque tenga verbo.
const PROMO_RE = /\b(gratis|prueba gratis|free trial|days free|descuento|discount|oferta|promo(?:ción|tion)?|escribime|por dm|reserv[aá]|agend[aá]|compr[aá]|buy now|sale\b|% ?off)\b/i;

function isPromoCaption(caption, overlay) {
  const t = `${caption || ''}\n${overlay || ''}`;
  return PROMO_RE.test(t);
}

function normTag(tag) {
  const t = String(tag || '').trim().toLowerCase();
  return ['producto', 'local', 'equipo', 'otro'].includes(t) ? t : '';
}

// groundingGate({tag, visionNote, caption, overlay}) ->
//   {ok:true} | {ok:false, reason:'sin-vision'|'foto-promo-desajuste'}
// - sin nota y sin tag: fail-closed, no hay con qué fundamentar.
// - tag 'otro' + promo: la foto no muestra el negocio y el texto vende
//   la oferta -> no se emite ese emparejamiento.
// - resto: permitido (incluye foto 'otro' con caption NO promo: un
//   estadio puede protagonizar un posteo del partido, no una promo).
function groundingGate(input) {
  const tag = normTag(input && input.tag);
  const note = String((input && input.visionNote) || '').trim();
  const caption = String((input && input.caption) || '');
  const overlay = String((input && input.overlay) || '');
  if (!note && !tag) return { ok: false, reason: 'sin-vision' };
  if (tag === 'otro' && isPromoCaption(caption, overlay)) {
    return { ok: false, reason: 'foto-promo-desajuste' };
  }
  return { ok: true };
}

module.exports = { PROMO_RE, isPromoCaption, normTag, groundingGate };
