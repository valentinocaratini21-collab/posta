// destacado-semana.js — Posteo de la semana destacado + botón Impulsar (gated).
//
// PARTE A (viva): Posty elige UN posteo de la semana como destacado. El cliente
// puede moverlo a otro posteo de la semana con un toque. Sin formularios.
// PARTE B (cableada, APAGADA por flag default off): botón "Impulsar" con 3 montos
// fijos, cobro con la tarjeta guardada del cliente (Stripe) y reporte solo con
// números reales. El botón NO sale en vivo hasta: aprobación Meta (App Review /
// Access Verification, veredicto 2/11) + 2 vars Railway de ads + build de ads
// desplegado + flag DESTACADO_BOOST_ENABLED=1.
//
// Reglas que cumple este módulo (no se negocian):
// - Una idea por pieza; posteos con el producto REAL del cliente; la paleta
//   manda el feed (este módulo no toca imágenes ni paletas).
// - Regla de verdad absoluta: el criterio de elección usa SOLO campos reales
//   del posteo (promo concreta, precio visible). Nunca métricas inventadas:
//   sin dato = sin número, nunca 0.
// - Bandeja sigue siendo el único lugar de decisión de la semana; mover el
//   destacado es una preferencia de un toque sobre la propuesta de Posty, no
//   una decisión de Bandeja, y queda registrada en el estado de la semana.
// - Fricción cero: elegir y mover son un toque; impulsar es un toque de
//   confirmación con la tarjeta guardada. Sin formularios, sin campo libre.
//
// Este módulo es puro + inyectado: NO importa Stripe, Meta ni server.js. El
// cobro y la publicación del anuncio llegan como funciones inyectadas, así los
// tests verifican el gate sin tocar dinero real ni la API de Meta.
//
// CHOQUES CON EL CÓDIGO EXISTENTE (resueltos a favor del spec aprobado 30/10):
// 1. El ads local existente (config/ads + meta_ads) es billetera ARS vía
//    MercadoPago con 20% de gestión. El spec aprobado es otro modelo: USD
//    fijos ($20/$50/$100) con tarjeta guardada (Stripe). Este módulo sigue el
//    spec aprobado y NO aplica fee ni billetera: el monto pasa tal cual.
//    La conversión USD (cobro) -> ARS (cuenta publicitaria Meta) queda
//    PENDIENTE para el turno del push: no se inventa tasa ni fee acá.
// 2. El ads existente exige que la Página de Facebook del cliente autorice
//    la cuenta publicitaria ("agencia"); sin eso el boost queda 'pending'.
//    Este módulo lo respeta como precondición (paginaAutorizada): sin
//    autorización NO se cobra. Cobrar un impulso que no puede correr sería
//    cobrar por nada.
'use strict';

const DESTACADO_FLAG_ENV = 'DESTACADO_BOOST_ENABLED';
const DESTACADO_BADGE = 'Destacado de la semana';
const DESTACADO_MONTOS_USD = [20, 50, 100];
const DESTACADO_DIAS = 7;
const DESTACADO_OBJETIVO = 'visitas_perfil_y_mensajes';

// Texto de cada promo concreta (opciones de la pregunta 3 del onboarding:
// Sin promo / % / 2x1 / Envío gratis). Sin jerarquía inventada entre tipos:
// cualquier promo concreta vale lo mismo; el desempate es el orden de la semana.
const PROMO_TEXTO = {
  '2x1': '2x1',
  '%': 'descuento',
  'envio': 'envío gratis',
  'envío gratis': 'envío gratis',
};

function textoPromo(promo) {
  if (promo == null) return null;
  const p = String(promo).trim();
  if (!p || p.toLowerCase() === 'sin promo' || p.toLowerCase() === 'sin') return null;
  return PROMO_TEXTO[p] || p;
}

// ADAPTADOR — la tabla posts NO tiene columnas promo/precio: la promo y el
// precio viven en el texto real del posteo (caption que Posty mismo generó).
// Se detectan con patrones sobre el caption, nunca se inventan:
//  - 2x1: /2\s*x\s*1/i
//  - envío gratis: /env[ií]o gratis/i
//  - descuento: /\d+\s*%|descuento|\boff\b/i
//  - precio visible: /[\$]\s*\d|precio/i
//  - publicado: ig_permalink, published_at o ig_media_id presentes (posteos
//    de la semana todavía en borrador NO están publicados: el badge sí los
//    cubre, pero el Impulsar exige publicado, igual que el gate de ads
//    existente; ig_media_id es la columna del flujo de ads existente).
function adaptarPosteo(dbPost) {
  const p = dbPost || {};
  const caption = String(p.caption || '');
  let promo = null;
  if (/2\s*x\s*1/i.test(caption)) promo = '2x1';
  else if (/env[ií]o gratis/i.test(caption)) promo = 'envio';
  else if (/\d+\s*%|descuento|\boff\b/i.test(caption)) promo = '%';
  return {
    id: p.id,
    promo,
    muestraPrecio: /[\$]\s*\d|precio/i.test(caption),
    publicado: !!(p.ig_permalink || p.published_at || p.ig_media_id),
  };
}

function adaptarSemana(dbPosts) {
  return (Array.isArray(dbPosts) ? dbPosts : []).map(adaptarPosteo);
}

// Puntaje honesto, solo con campos reales del posteo. Sin performance futura
// (la elección ocurre cuando se arma la semana, antes de publicar).
function puntajeVenta(posteo) {
  let puntos = 0;
  if (textoPromo(posteo.promo)) puntos += 3;
  if (posteo.muestraPrecio) puntos += 1;
  return puntos;
}

// UNA línea de por qué, siempre con el hecho concreto del posteo.
function porQueDestacado(posteo) {
  const promo = textoPromo(posteo.promo);
  if (promo) return `Este es el que más puede vender esta semana: tiene ${promo}.`;
  if (posteo.muestraPrecio) return 'Este es el que más puede vender esta semana: muestra el producto con precio.';
  return 'Este es el que más puede vender esta semana: abre la semana con el producto.';
}

// Posty elige EXACTAMENTE UN destacado. Determinista: mayor puntaje, y ante
// empate, el primero en el orden de la semana. Semana vacía -> null (no se
// inventa un destacado).
function elegirDestacado(posteos) {
  if (!Array.isArray(posteos) || posteos.length === 0) return null;
  let mejor = posteos[0];
  let mejorPuntaje = puntajeVenta(mejor);
  for (let i = 1; i < posteos.length; i++) {
    const p = puntajeVenta(posteos[i]);
    if (p > mejorPuntaje) {
      mejor = posteos[i];
      mejorPuntaje = p;
    }
  }
  return { posteo: mejor, porQue: porQueDestacado(mejor) };
}

// Aplica la propuesta de Posty a la semana. Si el cliente YA movió el
// destacado, Posty NO lo pisa: la elección del cliente manda.
// No muta la semana de entrada; devuelve una copia.
function aplicarDestacado(semana) {
  const base = { ...semana, posteos: Array.isArray(semana.posteos) ? [...semana.posteos] : [] };
  if (base.destacadoId) return base; // elección del cliente: no se pisa
  const elegido = elegirDestacado(base.posteos);
  if (!elegido) {
    base.destacadoId = null;
    base.destacadoPorQue = null;
    base.destacadoOrigen = null;
    return base;
  }
  base.destacadoId = elegido.posteo.id;
  base.destacadoPorQue = elegido.porQue;
  base.destacadoOrigen = 'posty';
  return base;
}

// Mover el destacado con UN toque. El destino tiene que ser un posteo DE ESTA
// semana; si no, se rechaza sin tocar la semana.
function moverDestacado(semana, nuevoId) {
  const posteos = Array.isArray(semana.posteos) ? semana.posteos : [];
  const existe = posteos.some((p) => p.id === nuevoId);
  if (!existe) {
    return { ok: false, motivo: 'posteo_fuera_de_semana', semana };
  }
  const next = {
    ...semana,
    posteos: [...posteos],
    destacadoId: nuevoId,
    destacadoOrigen: 'cliente',
    destacadoPorQue: 'Elegido por vos para impulsar.',
  };
  return { ok: true, semana: next };
}

// Badge para la vista de la semana y el email: solo el destacado lo lleva.
function badgeDestacado(semana, posteoId) {
  return semana.destacadoId && posteoId === semana.destacadoId ? DESTACADO_BADGE : null;
}

// El botón Impulsar SIEMPRE apunta al destacado vigente (cambia al mover).
function objetivoBoton(semana) {
  return semana.destacadoId || null;
}

function montosFijos() {
  return [...DESTACADO_MONTOS_USD];
}

// Solo los 3 fijos, como número entero. Strings, decimales, negativos y
// cualquier otro valor se rechazan (sin campo libre, sin "casi").
function validarMonto(monto) {
  return typeof monto === 'number' && Number.isInteger(monto) && DESTACADO_MONTOS_USD.includes(monto);
}

// Flag: SOLO '1' enciende. Ausente, vacío, '0', 'true' o cualquier otro valor
// = apagado. Default off.
function boostHabilitado(env) {
  return !!env && env[DESTACADO_FLAG_ENV] === '1';
}

// Flujo de impulso, fail-closed y en orden: ninguna llamada con efecto ocurre
// hasta que TODOS los gates pasaron. cobrar y publicarAnuncio son inyectados
// (en producción: Stripe con tarjeta guardada y Meta Marketing API).
// Si el cobro falla, el anuncio NO se publica. Si el anuncio falla tras el
// cobro, se reportan ambos ids: el reembolso/manual queda para el turno del
// push (este build no inventa un reembolso automático).
function crearImpulso(input) {
  const {
    semana, monto, clienteId, zona, env,
    adsConfigurado, paginaAutorizada, posteoPublicado, cobrar, publicarAnuncio,
  } = input || {};
  const no = (motivo) => ({ ok: false, motivo });
  if (!boostHabilitado(env)) return no('boost_deshabilitado');
  if (!validarMonto(monto)) return no('monto_invalido');
  const posteoId = objetivoBoton(semana || {});
  if (!posteoId) return no('sin_destacado');
  if (posteoPublicado === false) return no('sin_publicar');
  if (typeof zona !== 'string' || !zona.trim()) return no('sin_zona');
  if (!adsConfigurado) return no('ads_no_configurado');
  if (!paginaAutorizada) return no('sin_autorizacion_publicitaria');
  if (!clienteId) return no('sin_cliente');
  if (typeof cobrar !== 'function' || typeof publicarAnuncio !== 'function') {
    return no('sin_proveedores');
  }
  const cobro = cobrar({ clienteId, montoUSD: monto, dias: DESTACADO_DIAS, posteoId });
  if (!cobro || !cobro.ok) return no('cobro_fallido');
  const anuncio = publicarAnuncio({
    posteoId, montoUSD: monto, dias: DESTACADO_DIAS,
    zona: zona.trim(), objetivo: DESTACADO_OBJETIVO,
  });
  if (!anuncio || !anuncio.ok) {
    return { ok: false, motivo: 'anuncio_fallido', cobroId: cobro.cobroId || null };
  }
  return {
    ok: true, cobroId: cobro.cobroId || null, anuncioId: anuncio.anuncioId || null,
    posteoId, montoUSD: monto, dias: DESTACADO_DIAS,
  };
}

// Reporte post-impulso: SOLO números reales de la fuente (Meta Insights).
// Cada métrica: { valor, estado } con estado 'real' o 'sin_dato'. Un campo
// ausente, string o negativo es 'sin_dato' con valor null — NUNCA 0, porque
// 0 sería un número inventado. La vista/email muestra 'sin dato' en ese caso.
function metricaReal(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) {
    return { valor, estado: 'real' };
  }
  return { valor: null, estado: 'sin_dato' };
}

function reporteImpulso(medicion) {
  const m = medicion || {};
  return {
    vistas: metricaReal(m.vistas),
    visitasPerfil: metricaReal(m.visitasPerfil),
    mensajes: metricaReal(m.mensajes),
  };
}

function formatoMetrica(metrica) {
  return metrica && metrica.estado === 'real' ? String(metrica.valor) : 'sin dato';
}

// Snippet del badge para el EMAIL de la semana (plantilla v4, todavía no
// implementada en el árbol: este snippet queda listo para insertar). Cero
// imágenes externas (regla v4): badge en texto + borde, por qué en una línea.
// El botón Impulsar NO va en el email: el cobro se confirma en la app. Cuando
// el flag está on, el snippet lleva un link a la vista de la semana en la app
// (donde está el botón); cuando está off, no lleva link de impulso.
function badgeEmailHTML({ destacadoPorQue, boostHabilitado: on, urlSemana }) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const porQue = destacadoPorQue ? `<p style="margin:6px 0 0;font-size:14px;color:#0A1E33">${esc(destacadoPorQue)}</p>` : '';
  const link = on && urlSemana
    ? `<p style="margin:10px 0 0"><a href="${esc(urlSemana)}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;font-size:15px;padding:12px 26px;border-radius:999px;text-decoration:none">Impulsar este posteo</a></p>`
    : '';
  return `<div style="border:2px solid #FEC14D;border-radius:14px;padding:14px 16px;margin:0 0 16px;text-align:center">`
    + `<p style="margin:0;font-size:13px;font-weight:800;letter-spacing:1px;color:#2793C8">⭐ DESTACADO DE LA SEMANA</p>`
    + porQue + link + `</div>`;
}

module.exports = {
  DESTACADO_FLAG_ENV,
  DESTACADO_BADGE,
  DESTACADO_MONTOS_USD,
  DESTACADO_DIAS,
  DESTACADO_OBJETIVO,
  textoPromo,
  adaptarPosteo,
  adaptarSemana,
  puntajeVenta,
  porQueDestacado,
  elegirDestacado,
  aplicarDestacado,
  moverDestacado,
  badgeDestacado,
  objetivoBoton,
  montosFijos,
  validarMonto,
  boostHabilitado,
  crearImpulso,
  metricaReal,
  reporteImpulso,
  formatoMetrica,
  badgeEmailHTML,
};
