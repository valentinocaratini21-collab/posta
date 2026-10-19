'use strict';
/* ref-roles.js — Referencias multimodales con ROLES ETIQUETADOS
 * (adopción v231 del estudio de patrones: OpenAI — "Image 1: product
 * photo… Image 2: style reference…" + cómo interactúan; Google —
 * fórmula [referencias] + [instrucción de relación] + [nuevo
 * escenario], hasta 14 imágenes).
 *
 * Hasta v230 el pipeline pasaba UN refNote genérico ("la primera
 * referencia es el logo…" / "mantené el producto…") que pisaba a los
 * demás roles: si había logo + foto de producto + foto del feed, el
 * modelo recibía una sola instrucción y mezclaba los papeles (usaba
 * la foto de estilo como si fuera el producto, o redibujaba el logo).
 * Ahora cada referencia declara su rol y la nota final las enumera
 * por índice con su instrucción de relación:
 *   logo      → aparece IDÉNTICO, jamás rediseñado.
 *   product   → el producto REAL del cliente: preservar forma, color,
 *               packaging y etiqueta exactos; solo cambia la escena.
 *   photo     → foto real del cliente (álbum): productos, personas y
 *               lugares reconocibles, en una escena nueva.
 *   character → el personaje/protagonista recurrente del feed: el
 *               mismo, reconocible, en una escena nueva.
 *   style     → SOLO paleta y luz: no copiar su escena ni sus objetos.
 *   restyle   → la foto ES la pieza: mismo producto exacto, solo
 *               cambia el tratamiento fotográfico.
 * Módulo PURO (sin DB, sin red): lo usan server.js (conceptShot) y
 * demo-ai.js (REF_NOTE de la ruta ilustrada) y lo verifican los tests.
 */

const REF_ROLE_TEXT = {
  logo: "the client's brand logo — it must appear IDENTICAL (same design, same colors, same art style), never redesigned or reinterpreted",
  product: "the client's REAL product photo — preserve the product's exact shape, colors, packaging and label; only the scene around it changes",
  photo: "a real photo from the client — keep its products, people and places recognizable (same look, same photographic style) in a NEW scene",
  character: "the client's recurring character/subject from its feed — keep the SAME character, identical design, colors and proportions, as the protagonist of a NEW scene; never redesign or reinterpret it",
  style: "a style reference from the client's feed — apply ONLY its palette, light and technique; do not copy its scene, products or composition",
  restyle: "the base photo — keep the EXACT same product/subject from the reference photo (identical shape, colors, packaging, labels, details and proportions). Do NOT invent a different product, do NOT redesign it. ONLY change the photographic style, lighting and scene as directed",
};

const REF_ROLES = Object.keys(REF_ROLE_TEXT);

/* buildRefNote(roles) → la nota etiquetada por índice, o '' si no hay
 * roles válidos. roles[i] corresponde a la referencia i+1 EN EL ORDEN
 * en que viajan al generador. Un rol desconocido cae a 'photo'. */
function buildRefNote(roles) {
  const list = (Array.isArray(roles) ? roles : [])
    .map((r) => (REF_ROLE_TEXT[r] ? r : 'photo'));
  if (!list.length) return '';
  const lines = list.map((r, i) => `Image ${i + 1}: ${REF_ROLE_TEXT[r]}.`);
  return `REFERENCES (each image has ONE role — respect them exactly):\n${lines.join('\n')}`;
}

/* Nota de la ruta ilustrada del demo (/prueba): la referencia 1 es la
 * foto de perfil (el personaje) y la 2, si existe, un posteo del feed
 * (solo estilo). */
const DEMO_REF_NOTE = buildRefNote(['character', 'style']);

/* ---------- (v237) TRANSPORTE HONESTO + FIDELIDAD ----------
 * El transporte de gpt-image (images/edits) acepta UNA sola imagen de
 * referencia (ver genConceptImageModel en server.js): hasta v236 la
 * nota describía hasta 3 referencias con sus roles, pero el modelo
 * veía SOLO la primera — y el orden ponía el LOGO primero, así que en
 * piezas de producto la foto real del producto podía no llegar nunca.
 * Ahora el pipeline decide QUÉ referencia viaja con esta prioridad y
 * compone la nota SOLO con las referencias efectivamente enviadas:
 *   restyle (la foto base ES la pieza) y product (el producto real del
 *   cliente) mandan; después su material (photo/character); el logo
 *   solo viaja primero cuando es la ÚNICA referencia (pieza de marca /
 *   identidad) o cuando el llamador declara la pieza de marca
 *   (brandPiece); style cierra (es contexto, no sujeto). */
const REF_PRIORITY = { restyle: 0, product: 1, photo: 2, character: 2, logo: 3, style: 4 };
function prioritizeRefPairs(pairs, { brandPiece = false } = {}) {
  const prio = (role) => {
    if (role === 'logo' && brandPiece) return 0;
    return REF_PRIORITY[role] !== undefined ? REF_PRIORITY[role] : REF_PRIORITY.photo;
  };
  return (Array.isArray(pairs) ? pairs : [])
    .map((p, i) => ({ ref: p && p.ref, role: (p && REF_ROLE_TEXT[p.role]) ? p.role : 'photo', _i: i }))
    .filter((p) => p.ref)
    .sort((a, b) => (prio(a.role) - prio(b.role)) || (a._i - b._i))
    .map(({ ref, role }) => ({ ref, role }));
}

/* Cláusulas de FIDELIDAD (v237): obligatorias en TODO prompt que toque
 * material del cliente (su foto como base o como referencia de
 * producto). La fórmula de EDICIÓN no es la de generación: generar de
 * cero puede inventar la escena; editar el material del cliente NO
 * puede tocar su producto. La QA de fidelidad (server.js) verifica el
 * cumplimiento contra la foto original y bloquea si se viola. */
const FIDELITY_CLAUSE = "FIDELITY TO THE CLIENT'S REAL MATERIAL (non-negotiable): the product/subject from the client's photo must remain IDENTICAL — same shape, same colors, same packaging, same label, same proportions, same details. Only the photographic treatment may change (light, color grade, framing, and the background ONLY where the style direction explicitly allows it). Never redesign, reinterpret, replace, 'improve' or beautify the product itself, and never swap it for a similar one.";
const FIDELITY_REINFORCE = "FIDELITY CORRECTION — the previous version CHANGED the client's real product. Regenerate keeping the product/subject from the reference photo EXACTLY identical (same shape, colors, packaging, label and proportions — pixel-faithful identity), changing ONLY the photographic treatment around it.";

module.exports = { REF_ROLE_TEXT, REF_ROLES, buildRefNote, DEMO_REF_NOTE, REF_PRIORITY, prioritizeRefPairs, FIDELITY_CLAUSE, FIDELITY_REINFORCE };
