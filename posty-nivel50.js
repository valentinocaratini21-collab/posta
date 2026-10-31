// posty-nivel50.js — Prestigio Posty: cableado del nivel 6–50 (v498).
// Envuelve niveles.computarNivel con prestigio.computarNivelPosty50 SOLO
// para Posty. Lo usan /api/oficina/nivel (tirita, Mi negocio, celebraciones)
// y estadoPoder (tarjetas de LA OFICINA), para que todas las vistas muestren
// el mismo nivel de Posty.
// Fail-closed: ante cualquier error (o sin prestigio.js) devuelve el cómputo
// base intacto + campos de prestigio en neutro, para que ninguna vista se
// rompa. Premios SOLO jardín/reconocimiento (los define prestigio.js);
// nunca descuentos, nunca nivel 51, nunca reset, nunca comprable.
'use strict';

const FALTA_TEXTO = {
  semana_publicada: 'Semanas publicadas con constancia, sin incidentes.',
  pieza_aceptada_primera: 'Piezas aceptadas sin cambios: así se mide su acierto de primera.',
  decision_bandeja: 'Tus decisiones en la Bandeja le enseñan tu gusto.',
  racha_semanas: 'Semanas seguidas publicando.',
};

function nivelPosty(db, uid, metrics, ahoraMs) {
  const niveles = require('./niveles');
  const base = niveles.computarNivel(db, uid, 'posty', metrics);
  const nombreSiguienteBase = base.nivel < 5 ? (niveles.PODERES.posty.niveles[base.nivel] || null) : null;
  // Lote 3: en nivel 5 el próximo es el 6 (entrada P1) — antes quedaba null.
  let nombreSiguienteFb = nombreSiguienteBase, sigPremioFb = null, sigDesbFb = null;
  if (base.nivel === 5) {
    try {
      const prestigio = require('./prestigio');
      nombreSiguienteFb = prestigio.nombreNivel(6);
      sigPremioFb = prestigio.premioEn(6);
      sigDesbFb = prestigio.desbloqueoEn(6);
    } catch (e) {}
  }
  const fallback = Object.assign({}, base, {
    prestigio: 0, nombre_prestigio: null, insignia: null,
    etiqueta_tirita: 'Nivel ' + base.nivel + ' · ' + base.nombre_nivel,
    premios: [], desbloqueos: [], meta_final: null,
    nombre_siguiente: nombreSiguienteFb,
    siguiente_premio: sigPremioFb, siguiente_desbloqueo: sigDesbFb,
    premio_actual: null, desbloqueo_actual: null,
  });
  try {
    const prestigio = require('./prestigio');
    const ext = prestigio.computarNivelPosty50(db, uid, metrics, ahoraMs || Date.now());
    if (!ext || typeof ext.nivel !== 'number' || ext.nivel <= 5) return fallback;
    // El contrato de faltantes es el del base: {clave, falta} (sin min).
    const pendientes = (ext.gate && Array.isArray(ext.gate.pendientes) ? ext.gate.pendientes : [])
      .map((p) => ({ clave: p.clave, falta: FALTA_TEXTO[p.clave] || p.clave }));
    const hitos = Array.isArray(ext.hitos_extendidos) ? ext.hitos_extendidos : [];
    return Object.assign({}, base, {
      nivel: ext.nivel,
      nombre_nivel: ext.nombre_nivel,
      hitos,
      hitos_cumplidos: hitos.filter((h) => h.cumplido).length,
      hitos_total: hitos.length,
      gate: {
        nivel_objetivo: ext.gate ? ext.gate.nivel_objetivo : null,
        progreso_pct: ext.gate ? ext.gate.progreso_pct : 0,
        pendientes,
      },
      proximo_paso: pendientes.length ? pendientes[0].falta : null,
      eventos: ext.eventos || base.eventos,
      prestigio: ext.prestigio,
      nombre_prestigio: ext.nombre_prestigio,
      insignia: ext.insignia,
      etiqueta_tirita: ext.etiqueta_tirita,
      premios: Array.isArray(ext.premios) ? ext.premios : [],
      desbloqueos: Array.isArray(ext.desbloqueos) ? ext.desbloqueos : [],
      meta_final: ext.meta_final || null,
      nombre_siguiente: ext.nivel < 50 ? (prestigio.nombreNivel(ext.nivel + 1) || null) : null,
      // Vista previa (Lote 3): qué trae el próximo nivel — premio si abre
      // prestigio, si no el desbloqueo chico. Solo datos del servidor.
      siguiente_premio: ext.nivel < 50 ? (prestigio.premioEn(ext.nivel + 1) || null) : null,
      siguiente_desbloqueo: ext.nivel < 50 ? (prestigio.desbloqueoEn(ext.nivel + 1) || null) : null,
      // Celebración: en nivel de entrada el premio; si no, el desbloqueo
      // chico del nivel. Fuera de 6–50 ambos son null (cae a pzNivelUnlock).
      premio_actual: prestigio.premioEn(ext.nivel),
      desbloqueo_actual: prestigio.desbloqueoEn(ext.nivel),
    });
  } catch (e) { return fallback; }
}

module.exports = { nivelPosty };
