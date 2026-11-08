'use strict';
// simulador-impulsar.js — Estimación honesta de Impulsar (LOTE R4 REDISEÑO).
//
// La proyección del simulador es una ESTIMACIÓN, nunca una promesa, y sale
// SOLO de los datos reales de Instagram del negocio — nunca de promedios
// genéricos ni de tasas inventadas:
//
//   1. Costo por alcance real: de los impulsos anteriores de LA CUENTA,
//      con alcance y gasto reportados por Meta (last_reach y
//      last_spend_cents de /api/ads/boosts). Sin impulsos con números de
//      Meta no hay costo real y NO se estima nada.
//   2. Tasa de respuesta propia: comentarios / alcance de los posteos
//      publicados de la cuenta (los elegibles que ya carga Impulsar).
//      Los comentarios son lo que Posty cuenta por su lado como "gente
//      que te escribió".
//
//   alcance estimado ≈ presupuesto / costo por alcance
//   consultas estimadas ≈ alcance estimado × tasa de respuesta propia
//
// Sin alguno de los dos datos, devuelve { ok: false, motivo } y la vista
// lo dice con honestidad en vez de mostrar un número inventado:
//   - 'sin_datos_pauta' — sin impulsos anteriores con números de Meta.
//   - 'sin_datos_cuenta' — sin posteos publicados con alcance.
//   - 'sin_presupuesto' — presupuesto inválido o cero.
//
// Puro, sin I/O: el cliente tiene su espejo en chunk-analisis.js
// (anaSimEstimar, misma fórmula) y la suite compara ambos.
//
// Montos válidos: los de la billetera ($20/$50/$100 USD). El deslizante
// del simulador se mueve de $10 en $10 entre $20 y $100, y al soltar se
// ajusta (snap) al monto válido más cercano; en empate, al menor —
// nunca se gasta de más por un redondeo.

const SIM_MONTOS_VALIDOS = [20, 50, 100];

function simMontoValido(v) {
  const n = Number(v) || 0;
  let mejor = SIM_MONTOS_VALIDOS[0];
  let dist = Infinity;
  for (const m of SIM_MONTOS_VALIDOS) {
    const dd = Math.abs(n - m);
    if (dd < dist) { dist = dd; mejor = m; }
  }
  return mejor;
}

function estimarImpulso(input) {
  const presupuesto = Number((input && input.presupuestoUSD) || 0);
  if (!(presupuesto > 0) || !Number.isFinite(presupuesto)) {
    return { ok: false, motivo: 'sin_presupuesto' };
  }
  let gastoCents = 0;
  let alcanceBase = 0;
  let nBoosts = 0;
  for (const b of (input && Array.isArray(input.boosts) ? input.boosts : [])) {
    const alcance = Number((b && b.last_reach) || 0);
    const gasto = Number((b && b.last_spend_cents) || 0);
    if (alcance > 0 && gasto > 0) {
      gastoCents += gasto;
      alcanceBase += alcance;
      nBoosts++;
    }
  }
  if (!(alcanceBase > 0) || !(gastoCents > 0)) {
    return { ok: false, motivo: 'sin_datos_pauta' };
  }
  let comentarios = 0;
  let alcancePosts = 0;
  let nPosts = 0;
  for (const p of (input && Array.isArray(input.posts) ? input.posts : [])) {
    const alcance = Number((p && p.reach) || 0);
    if (alcance > 0) {
      alcancePosts += alcance;
      comentarios += Number((p && p.comments) || 0);
      nPosts++;
    }
  }
  if (!(alcancePosts > 0)) {
    return { ok: false, motivo: 'sin_datos_cuenta' };
  }
  const costoPorAlcanceUSD = (gastoCents / 100) / alcanceBase;
  const tasaRespuesta = comentarios / alcancePosts;
  const alcance = presupuesto / costoPorAlcanceUSD;
  return {
    ok: true,
    consultas: Math.round(alcance * tasaRespuesta),
    alcance: Math.round(alcance),
    costoPorAlcanceUSD,
    tasaRespuesta,
    nBoosts,
    nPosts,
  };
}

module.exports = { SIM_MONTOS_VALIDOS, simMontoValido, estimarImpulso };
