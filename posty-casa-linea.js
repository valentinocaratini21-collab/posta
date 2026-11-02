'use strict';
// LOTE POSTY APRENDE (decisión de Valentino 1/11 21:37): la línea editorial
// de la cuenta casa, destilada del corpus del equipo
// (~/workspace/posty-team/contenidos/drafts/). NO contiene captions del
// corpus (solo temas, voz, estructura y anti-patrones) y NO lleva fechas:
// el generador no debe copiar ninguna fecha del corpus (las piezas viejas
// dicen "1 de enero", las nuevas "1 de febrero"; la línea es atemporal).
// Gate por handle (precedente: protagonistRefFor en server.js), nunca por
// id numérico: en producción la casa es el user 12, pero el id cambia
// según el entorno; el handle no.

const CASA_HANDLE = 'posty.communitymanager';

function isCasaHandle(handle) {
  const h = String(handle || '').trim().toLowerCase().replace(/^@/, '');
  return h === CASA_HANDLE;
}

// Temas de la semana (rotación). formato/tipo usan el vocabulario vigente
// de TIPOS (promo, tip, social, detras, novedad); ningún tema es promo de
// la prueba: la prueba gratis no es tema de ningún slot.
const CASA_TEMAS_ES = [
  { formato: 'Novedad', tipo: 'novedad', titulo: 'primero estudiar el rubro', angulo: 'El orden correcto: estudiar qué vendés, a quién y qué preguntan tus clientes antes de proponer ideas. Ideas para vender, no para rellenar.' },
  { formato: 'Comunidad', tipo: 'social', titulo: 'mi feed queda a medias', angulo: 'El problema del dueño en sus palabras: sin tiempo, el Instagram queda último y no trae clientes.' },
  { formato: 'Novedad', tipo: 'novedad', titulo: 'herramienta vs agente', angulo: 'Una app te deja más trabajo del que te saca; Posty te lo saca: contás tu negocio una vez y la semana queda armada.' },
  { formato: 'Detrás de escena', tipo: 'detras', titulo: 'el freno de mano', angulo: 'Nada sale sin tu OK: aviso 30 minutos antes, frenar con un toque, rehacer gratis.' },
  { formato: 'Tip', tipo: 'tip', titulo: 'la semana 3 también', angulo: 'La constancia es lo primero que se rompe; la semana armada siempre, la 3, la 10 y la 40 igual que la primera.' },
  { formato: 'Detrás de escena', tipo: 'detras', titulo: 'así se arma una semana', angulo: 'El método en pasos: estudiar el negocio, ideas, diseños y textos, aprobar con un toque.' },
  { formato: 'Novedad', tipo: 'novedad', titulo: 'fechas que venden', angulo: 'Cazar las fechas por el dueño: la semana se adapta sola a cada fecha que vende.' },
  { formato: 'Comunidad', tipo: 'social', titulo: 'respuestas con tu OK', angulo: 'Bandeja en cero: respuestas y reseñas en tu tono, listas para mandar con un toque; historias que invitan a hablar.' },
  { formato: 'Novedad', tipo: 'novedad', titulo: 'sin fotos igual publicás', angulo: 'La falta de foto no frena: con tus fotos o armadas desde cero con tu marca.' },
  { formato: 'Tip', tipo: 'tip', titulo: 'tu mejor posteo despega', angulo: 'Potenciar lo que ya gustó, con tope fijado por el dueño, sin humo ni gasto de más.' },
  { formato: 'Detrás de escena', tipo: 'detras', titulo: 'mostrar el trabajo real', angulo: 'Vidriera con piezas reales de negocios; la vara: si serviría para cualquier negocio, no sale.' },
];

const CASA_TEMAS_EN = [
  { formato: 'Novedad', tipo: 'novedad', titulo: 'first study your niche', angulo: 'The right order: study what you sell, to whom, and what customers ask before proposing ideas. Ideas to sell, not to fill the feed.' },
  { formato: 'Comunidad', tipo: 'social', titulo: 'my feed is half-done', angulo: 'The owner’s problem in their own words: with no time, Instagram comes last and brings no customers.' },
  { formato: 'Novedad', tipo: 'novedad', titulo: 'tool vs agent', angulo: 'An app leaves you more work than it takes; Posty takes it away: you tell your business once and the week is built.' },
  { formato: 'Detrás de escena', tipo: 'detras', titulo: 'the handbrake', angulo: 'Nothing goes out without your OK: 30 minutes notice, stop it with one tap, free redo.' },
  { formato: 'Tip', tipo: 'tip', titulo: 'week three too', angulo: 'Consistency is the first thing to break; the week always built, week 3, 10 and 40 just like the first.' },
  { formato: 'Detrás de escena', tipo: 'detras', titulo: 'how a week is built', angulo: 'The method in steps: study the business, ideas, designs and captions, approve with one tap.' },
  { formato: 'Novedad', tipo: 'novedad', titulo: 'dates that sell', angulo: 'Hunting the dates for the owner: the week adapts itself to every date that sells.' },
  { formato: 'Comunidad', tipo: 'social', titulo: 'replies with your OK', angulo: 'Empty inbox: replies and reviews in your tone, ready to send with one tap; stories that invite people to talk.' },
  { formato: 'Novedad', tipo: 'novedad', titulo: 'no photos, still posting', angulo: 'Missing photos don’t stop you: with your photos or built from scratch with your brand.' },
  { formato: 'Tip', tipo: 'tip', titulo: 'your best post takes off', angulo: 'Boost what already worked, with a cap set by the owner, no smoke and no overspend.' },
  { formato: 'Detrás de escena', tipo: 'detras', titulo: 'showing real work', angulo: 'Showcase with real pieces from real businesses; the bar: if it would fit any business, it doesn’t ship.' },
];

function casaTemas(lang) {
  return lang === 'en' ? CASA_TEMAS_EN : CASA_TEMAS_ES;
}

// Bloque para el prompt de IDEAS (temas + anti-patrones). Manda sobre la
// lista de 7 categorías del prompt base: la semana de la casa sale de
// estos temas, no de la rotación genérica (y su slot de promo NO es promo
// de la prueba).
function casaIdeasBlock() {
  const temas = CASA_TEMAS_ES.map((t, i) => `${i + 1}) ${t.titulo}: ${t.angulo}`).join(' ');
  return `LÍNEA EDITORIAL DE LA CASA — @posty.communitymanager (manda sobre la lista de 7 categorías de arriba; es la cuenta propia de Posty, no un cliente). VOZ: Posty en primera persona, cercano, voseo rioplatense, con opinión y cariño. Habla del problema del dueño en sus palabras y del método, no como un aviso. TEMAS DE LA SEMANA (elegí 7 distintos, variados, sin repetir los ya publicados): ${temas} PROHIBIDO como ángulo para esta cuenta: "3 días gratis", "probá gratis" o "sin tarjeta" como gancho o tema; "sumate a la comunidad" vago; "¿te imaginás tener un community manager?" genérico; "despreocupate / no pienses más" sin problema concreto; promesas de ventas, alcance o clientes sin respaldo; motivación genérica que serviría para cualquier negocio. La prueba gratis solo puede aparecer como mención secundaria dentro de una idea editorial ("la prueba está en la bio"), nunca como el tema. No copies fechas del corpus: la línea no lleva fechas.`;
}

// Bloque para el prompt de CAPTIONS (voz + estructura + anti-patrones).
// Manda sobre los ejemplos aprobados viejos si los contradice (los
// goldens viejos de la casa incluyen promo genérica). El formato del
// producto se mantiene (gancho/desarrollo/CTA, ≤320 caracteres, titular
// ≤5 palabras, máx 8 hashtags): la línea es de temas y estilo, no de largo.
function casaCaptionBlock() {
  return `LÍNEA EDITORIAL DE LA CASA — @posty.communitymanager (estilo del caption; manda sobre los ejemplos aprobados viejos si los contradice). VOZ: Posty en primera persona, cercano, voseo rioplatense, con opinión y cariño. ESTRUCTURA en los 3 bloques del formato: gancho = el problema del dueño en sus palabras (entre comillas cuando calce); desarrollo = el método de Posty (estudiar el rubro → armar la semana → aprobar con un toque) aplicado a ESE problema; cierre = pregunta al público que invita a comentar, no un CTA de venta. Hashtags de concepto, del tema, no genéricos de marketing. PROHIBIDO: "3 días gratis / probá gratis / sin tarjeta" como gancho o cierre; "sumate a la comunidad" vago; promesas sin respaldo; motivación genérica. La prueba gratis, como mucho, mención secundaria. No copies fechas del corpus: la línea no lleva fechas.`;
}

module.exports = { CASA_HANDLE, isCasaHandle, casaIdeasBlock, casaCaptionBlock, casaTemas, CASA_TEMAS_ES, CASA_TEMAS_EN };
