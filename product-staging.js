'use strict';
// product-staging.js — LOTE STAGING DE PRODUCTO (trabajo completo, SIN PUSH).
// Módulo puro: sin require de server.js ni de db (el servidor pasa lo que
// hace falta). Reglas duras de la demo aprobada 2/11:
//   1) EL PRODUCTO NO SE TOCA: nunca se regenera ni se deforma; solo se arma
//      lo de alrededor. Si sale deformado, no sale (fidelityGate lo frena).
//   2) LA ESCENA TIENE QUE COMBINAR: paleta y estilo salen del producto
//      (nota de visión), nunca un ambiente genérico.
//   3) VARIAS OPCIONES, NO UNA: se proponen varias escenas y el cliente elige.
//   4) SE MUESTRA ANTES DE SALIR: la elegida queda como borrador EN REVISIÓN,
//      nunca se programa sola.
// Extensión carrusel (decisión 2/11): si la foto es un MUEBLE PARA VENDER,
// además se puede armar un carrusel: el mismo producto intacto en 5 escenas
// distintas, todas combinando, como un solo posteo carrusel. Si la foto no
// es un mueble para vender, no hay carrusel: quedan las escenas sueltas.

const STAGING_OPCIONES = 3;
const STAGING_CARRUSEL = 5;
// = costs.js gpt-image-2 medium (medición, no facturación).
const STAGING_COSTO_POR_IMAGEN_USD = 0.063;

// Arquetipos de escena: distintos entre sí a propósito (el carrusel no puede
// repetir la misma habitación 5 veces). Neutros en estilo: el estilo real
// entra por la nota de visión (estilo + paleta) en buildScenePrompt.
const ESCENAS = [
  { id: 'loft', es: 'Loft industrial', en: 'Industrial loft',
    scene: 'an industrial loft with large black-framed windows, polished concrete floor, a low black coffee table and a dark grey rug, soft cool daylight' },
  { id: 'ventanal', es: 'Ventanal luminoso', en: 'Bright window wall',
    scene: 'a bright minimal room with a floor-to-ceiling window wall, pale grey walls, light grey stone floor, a sculptural black floor lamp and one tall green plant in a grey pot, soft cool daylight' },
  { id: 'carbon', es: 'Pared carbón', en: 'Charcoal wall',
    scene: 'an elegant evening room with a charcoal textured accent wall, polished concrete floor, a small glass side table and one soft spotlight from above, calm cool tones' },
  { id: 'estudio', es: 'Estudio claro', en: 'Bright studio',
    scene: 'a clean bright studio room with seamless pale grey walls, light stone floor and one simple ceramic vase, soft even daylight, no window view' },
  { id: 'terraza', es: 'Terraza', en: 'Terrace',
    scene: 'a calm outdoor terrace with light stone floor, grey planters with green plants and soft daylight, minimal furniture, no people' },
];

function escenasPara(formato) {
  return formato === 'carrusel' ? ESCENAS.slice() : ESCENAS.slice(0, STAGING_OPCIONES);
}

// Arma el prompt de UNA escena. La cláusula de fidelidad viene del servidor
// (refRoles.FIDELITY_CLAUSE, única fuente) y el prompt la concreta: cuarto
// NUEVO, nunca el cuarto original — el cambio de fondo está explícito, el
// producto queda idéntico. La escena combina porque estilo + paleta de la
// visión del producto viajan dentro del prompt.
function buildScenePrompt({ fidelityClause, producto, estilo, paleta, scene }) {
  const prod = String(producto || 'el producto').trim();
  const est = String(estilo || '').trim();
  const pal = String(paleta || '').trim();
  return [
    String(fidelityClause || '').trim(),
    `Photorealistic commercial photograph. The reference photo shows the client's REAL product (${prod}). The product in the new image must be THAT EXACT product — same shape, same colors, same materials — photographed in a NEW room, never the original room.`,
    `Room: ${scene}.`,
    est ? `The room must MATCH the product's style: ${est}.` : '',
    pal ? `Palette of the room: ${pal}.` : '',
    'Only the room around the product is new; the product itself is untouched, unredesigned, undeformed. No text, no letters, no watermarks.',
  ].filter(Boolean).join('\n');
}

// Gate de la extensión carrusel: solo mueble para vender (lo decide la
// visión, no el cliente ni el servidor: nota.es_mueble_venta === true).
function esMuebleVenta(nota) {
  return !!(nota && nota.es_mueble_venta === true);
}

function costoEstimadoUsd(n) {
  return Math.round((Number(n) || 0) * STAGING_COSTO_POR_IMAGEN_USD * 1000) / 1000;
}

// Chequeo estructural de la regla 2: una escena combina si su prompt lleva
// la nota de estilo y la paleta del producto (una escena genérica no las
// lleva y este chequeo la delata).
function escenaCombina(prompt, estilo, paleta) {
  const p = String(prompt || '');
  const palWords = String(paleta || '').split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  const palOk = palWords.length ? palWords.every((w) => p.toLowerCase().includes(w.toLowerCase())) : true;
  const estiloOk = String(estilo || '').trim() ? p.includes(String(estilo).trim().slice(0, 20)) : true;
  return palOk && estiloOk;
}

// Arma el carrusel final con SOLO las escenas elegidas, en el orden elegido
// (refinamiento 2/11: aprobación por toque, patrón corazón de Posty).
// Devuelve { paths } o { error }. Con 0 elegidas no hay carrusel (error,
// sin borrador, sin forzar nada). Un índice fuera de rango es error (nunca
// se inventa una escena); un índice repetido queda en su primera aparición.
function armarCarrusel(paths, indices) {
  const lista = Array.isArray(paths) ? paths : [];
  const idxs = Array.isArray(indices) ? indices : [];
  if (!idxs.length) return { error: 'sin_elegidas' };
  const out = [];
  const vistos = new Set();
  for (const raw of idxs) {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= lista.length) return { error: 'indice_fuera' };
    if (vistos.has(i)) continue;
    vistos.add(i);
    out.push(lista[i]);
  }
  if (!out.length) return { error: 'sin_elegidas' };
  return { paths: out };
}

module.exports = {
  STAGING_OPCIONES, STAGING_CARRUSEL, STAGING_COSTO_POR_IMAGEN_USD, ESCENAS,
  escenasPara, buildScenePrompt, esMuebleVenta, costoEstimadoUsd, escenaCombina,
  armarCarrusel,
};
