// posty-nivel50.js — Nivel Posty SOLO POR POSTEOS (decisión Valentino 4/11).
// REEMPLAZA el sistema de gates por hitos (niveles.js: fundamento_leido,
// semana_generada, decision_bandeja, semana_aceptada, pieza_aceptada_primera,
// semana_publicada, pregunta_respondida) y la escala 6–50 por semanas
// (prestigio.js): el nivel sube ÚNICAMENTE por cantidad acumulada de
// posteos hechos a través de Posty. Los nombres de nivel (1–5 base,
// 6–50 prestigio), las prendas por nivel (PZ_ROPA, cliente), las cosas de
// oficina (PZ_OFICINA, cliente), los premios de prestigio por nivel de
// entrada y los desbloqueos NO se cambian: solo cambia el MOTOR que dice
// en qué nivel estás.
// Lo usan /api/oficina/nivel (tirita, Mi negocio, celebraciones) y
// estadoPoder (tarjetas de LA OFICINA), para que todas las vistas muestren
// el mismo nivel de Posty. Ningún otro poder usa este módulo.
// Fail-closed: ante cualquier error (o sin prestigio.js) devuelve el cómputo
// base intacto + campos de progreso en neutro, para que ninguna vista se
// rompa. Ese fallback es degradado y nunca el camino normal: el camino
// normal siempre cuenta desde posts. Nunca nivel 51, nunca reset, nunca
// comprable.
'use strict';

// UMBRALES_POSTEOS[L-1] = posteos acumulados mínimos para el nivel L.
// Primeros niveles rápidos, últimos lentos; L50 = 210 = 30 semanas a ritmo
// diario (~7 meses, el horizonte del viaje completo, como referencia).
// Pasos: 1, 2, 3, 4, luego +4 hasta L30, luego +5 hasta L50 (nunca decrecen).
const UMBRALES_POSTEOS = [
  0, 1, 3, 6, 10, // L1–L5
  14, 18, 22, 26, 30, 34, 38, 42, 46, 50, // L6–L15 (+4)
  54, 58, 62, 66, 70, 74, 78, 82, 86, 90, 94, 98, 102, 106, 110, // L16–L30 (+4)
  115, 120, 125, 130, 135, 140, 145, 150, 155, 160, // L31–L40 (+5)
  165, 170, 175, 180, 185, 190, 195, 200, 205, 210, // L41–L50 (+5)
];

// Nivel que corresponde a una cantidad acumulada de posteos Posty.
function nivelPorPosteos(posteos) {
  const c = Math.max(0, Math.floor(Number(posteos) || 0));
  let nivel = 1;
  for (let L = 1; L <= 50; L++) {
    if (c >= UMBRALES_POSTEOS[L - 1]) nivel = L; else break;
  }
  return nivel;
}

// «Posteo hecho a través de Posty» = fila de posts publicada por el
// producto. El ÚNICO camino a status='published' es publishSinglePost
// (scheduler.js, API de Meta; por ahí pasan scheduler, publicar-ahora,
// publicar-desde-chat y dogfood house). Se excluyen:
// - stories: media_type 'story' o permalink vacío (el producto ya las
//   excluye de sus conteos de feed);
// - demos: permalink /p/demo_* (el modo demo marca published pero con
//   mediaId demo_* y permalink demo: sin el filtro anti-demo contaría);
// - borradores y programados: status != 'published'.
// Los recents del snapshot y los posteos subidos a mano en Instagram nunca
// son filas de posts: quedan fuera por naturaleza, sin filtro extra.
// media_type NULL = fila legacy (la migración pone DEFAULT 'image').
// Derivable para usuarios existentes: no necesita migración ni backfill.
function contarPosteosPosty(db, uid) {
  const r = db.prepare(
    `SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published' ` +
    `AND (media_type IS NULL OR media_type IN ('image', 'carousel', 'video')) ` +
    `AND ig_permalink IS NOT NULL AND ig_permalink != '' AND ig_permalink NOT LIKE '%demo_%'`
  ).get(uid);
  return (r && typeof r.n === 'number') ? r.n : 0;
}

function nivelPosty(db, uid, metrics, ahoraMs) {
  const niveles = require('./niveles');
  const base = niveles.computarNivel(db, uid, 'posty', metrics);
  const nombreBase = niveles.PODERES.posty.niveles;
  // Fallback degradado (solo si falla el conteo o falta prestigio.js):
  // misma forma que el cómputo base, progreso en neutro, sin inventar.
  const fallback = Object.assign({}, base, {
    prestigio: 0, nombre_prestigio: null, insignia: null,
    etiqueta_tirita: 'Nivel ' + base.nivel + ' · ' + base.nombre_nivel,
    premios: [], desbloqueos: [], meta_final: null,
    nombre_siguiente: base.nivel < 5 ? (nombreBase[base.nivel] || null) : null,
    siguiente_premio: null, siguiente_desbloqueo: null,
    premio_actual: null, desbloqueo_actual: null,
    posteos_posty: 0, proximo_umbral: null, avance: null,
    gate: {
      nivel_objetivo: Math.min(base.nivel + 1, 5),
      progreso_pct: base.gate ? base.gate.progreso_pct : 0,
      pendientes: [],
    },
    hitos: [], hitos_cumplidos: 0, hitos_total: 0,
    proximo_paso: null,
  });
  try {
    const prestigio = require('./prestigio');
    const posteos = contarPosteosPosty(db, uid);
    const nivel = nivelPorPosteos(posteos);
    // NOMBRES_50[0..4] son idénticos a los 5 nombres base: nombreNivel
    // sirve uniforme para 1–50.
    const nombre = prestigio.nombreNivel(nivel);
    const sig = nivel < 50 ? nivel + 1 : null;
    const nombreSig = sig ? prestigio.nombreNivel(sig) : null;
    const faltan = sig ? Math.max(0, UMBRALES_POSTEOS[sig - 1] - posteos) : 0;
    const pr = prestigio.prestigioDe(nivel);
    // Premios de prestigio ya ganados y desbloqueos: keyed por NÚMERO de
    // nivel (no por gates), así sobreviven al cambio de motor intactos.
    const premios = [];
    for (const pp of prestigio.PRESTIGIOS) {
      if (pp.prestigio >= 1 && pp.entrada <= nivel) premios.push({ prestigio: pp.prestigio, premio: pp.premio });
    }
    const desbloqueos = [];
    for (let L = 6; L <= nivel; L++) {
      const d = prestigio.desbloqueoEn(L);
      if (d) desbloqueos.push({ nivel: L, desbloqueo: d });
    }
    return Object.assign({}, base, {
      nivel,
      nombre_nivel: nombre,
      // Sin gates: no hay requisitos pendientes. La tarjeta de Mi negocio
      // (mxCardAgenteHTML) cae a proximo_paso cuando faltantes está vacío.
      hitos: [],
      hitos_cumplidos: 0,
      hitos_total: 0,
      gate: {
        nivel_objetivo: sig || 50,
        progreso_pct: sig ? Math.round(100 * posteos / UMBRALES_POSTEOS[sig - 1]) : 100,
        pendientes: [],
      },
      // Avance en la unidad real: posteos hechos vs. umbral del próximo
      // nivel. La tira y la pantalla de Premios pintan la barrita con esto.
      avance: sig ? { hechos: posteos, total: UMBRALES_POSTEOS[sig - 1] } : null,
      proximo_paso: sig
        ? (faltan === 1 ? `Te falta 1 posteo para el Nv ${sig}` : `Te faltan ${faltan} posteos para el Nv ${sig}`)
        : null,
      // eventos se conserva: son hechos (para la prueba del nivel), no
      // requisitos. El nivel ya no depende de ellos.
      eventos: base.eventos,
      prestigio: pr.prestigio,
      nombre_prestigio: pr.nombre_prestigio,
      insignia: pr.insignia,
      // Formato viejo en 1–5, formato prestigio en 6+ (igual que antes).
      etiqueta_tirita: nivel >= 6 ? prestigio.etiquetaTirita(nivel) : ('Nivel ' + nivel + ' · ' + nombre),
      premios,
      desbloqueos,
      meta_final: nivel >= 50 ? prestigio.META_FINAL : null,
      nombre_siguiente: nombreSig,
      siguiente_premio: sig ? prestigio.premioEn(sig) : null,
      siguiente_desbloqueo: sig ? prestigio.desbloqueoEn(sig) : null,
      premio_actual: prestigio.premioEn(nivel),
      desbloqueo_actual: prestigio.desbloqueoEn(nivel),
      posteos_posty: posteos,
      proximo_umbral: sig ? UMBRALES_POSTEOS[sig - 1] : null,
    });
  } catch (e) { return fallback; }
}

module.exports = { nivelPosty, nivelPorPosteos, contarPosteosPosty, UMBRALES_POSTEOS };
