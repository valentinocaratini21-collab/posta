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

module.exports = { REF_ROLE_TEXT, REF_ROLES, buildRefNote, DEMO_REF_NOTE };
