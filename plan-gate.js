// plan-gate.js — Gateo por plan de las features de comunidad/atención.
//
// (2026-10-20, build Atención Total) Hasta hoy NINGÚN endpoint de
// comentarios/DMs/reseñas chequeaba el plan: Esencial, Pro y trial recibían
// las mismas colas que la landing vende como exclusivas del plan Total
// (auditoría verificacion-plan-total-2026-10-20.md). Este módulo es el helper
// ÚNICO y reutilizable para cerrar eso: server.js lo enchufa como middleware
// o check puntual (ver patch especificado en build-atencion-total-2026-10-20.md).
//
// Regla de planes (decisión de Valentino 2026-10-19, escalera por roles):
//   Esencial = Community Manager · Pro = + Growth · Total = + Atención.
// La radiografía completa del Análisis es capa Growth (pro/total) — ya está
// gateada en analysis-engine.js; acá queda declarada en el mismo mapa para
// que haya UNA tabla de verdad de features.
// La cuenta 'free' (fundador, límites del Total vía config/plans.js) pasa
// todos los gates: es la cuenta de Valentino.
//
// Contrato: NUNCA lanza. Sin fila de usuario o ante cualquier error de DB,
// el plan efectivo es el de trial (esencial) — fail-closed para lo pago,
// fail-open para lo que el trial ya incluye.
'use strict';

const { TRIAL_PLAN } = require('./config/plans');

const KNOWN_PLANS = new Set(['esencial', 'pro', 'total', 'free']);

// feature → planes que la pueden usar. UNA sola tabla de verdad.
const FEATURE_PLANS = {
  // Análisis: la radiografía completa es de Growth en adelante.
  analisis_completo: ['pro', 'total', 'free'],
  // Atención al cliente: SOLO Total (y fundador).
  atencion: ['total', 'free'],
  comentarios: ['total', 'free'],   // cola de respuestas a comentarios
  dms: ['total', 'free'],           // cola de respuestas a DMs
  resenas: ['total', 'free'],       // cola de respuestas a reseñas de Google
  agenda: ['total', 'free'],        // booking.js — turnos y reservas
  seguimiento: ['total', 'free'],   // followups.js — no-cerradores 24–48 h
  cierre_pago: ['total', 'free'],   // payment-close.js — link de pago / seña
};

// Mensaje estándar para quien no tiene la feature: nombra el plan que la
// incluye, sin vueltas (lo consume la UI tal cual).
function upsellMessage(feature) {
  const required = requiredPlanFor(feature);
  return required === 'total'
    ? 'Esta función es del plan Total.'
    : 'Esta función es de los planes Pro y Total.';
}

function requiredPlanFor(feature) {
  const plans = FEATURE_PLANS[feature];
  if (!plans) return null;
  if (plans.includes('esencial')) return 'esencial';
  if (plans.includes('pro')) return 'pro';
  return 'total';
}

// Plan efectivo del usuario, con la MISMA semántica que planForUid de
// server.js: solo un plan_status 'active' habilita el plan pago guardado;
// cualquier otro estado (trial, vencido, nulo) cae al plan de trial.
function effectivePlanId(db, userId) {
  try {
    const u = db.prepare('SELECT plan, plan_status FROM users WHERE id = ?').get(userId);
    if (u && u.plan_status === 'active' && KNOWN_PLANS.has(String(u.plan || ''))) {
      return String(u.plan);
    }
  } catch (e) { /* sin tabla/fila: trial */ }
  return TRIAL_PLAN;
}

function canUse(planId, feature) {
  const plans = FEATURE_PLANS[feature];
  if (!plans) return false; // feature desconocida: fail-closed
  return plans.includes(String(planId || ''));
}

// Check completo listo para endpoints:
//   ok → { ok:true, planId, feature }
//   no → { ok:false, status:403, planId, feature, required, error, message }
//        con la forma que server.js ya usa para errores de API.
function planGate(db, userId, feature) {
  const planId = effectivePlanId(db, userId);
  if (canUse(planId, feature)) return { ok: true, planId, feature };
  return {
    ok: false,
    status: 403,
    planId,
    feature,
    required: requiredPlanFor(feature),
    error: 'feature_requires_plan',
    message: upsellMessage(feature),
  };
}

// Middleware express listo para enchufar en server.js:
//   app.get('/api/...', requireAuth, planGateMiddleware(db, 'comentarios'), handler)
// Sin sesión válida no decide (eso es trabajo de requireAuth, que va antes).
function planGateMiddleware(db, feature) {
  return (req, res, next) => {
    const uid = req && req.session && req.session.userId;
    if (!uid) return next();
    const g = planGate(db, uid, feature);
    if (g.ok) return next();
    return res.status(g.status).json({ error: g.error, message: g.message, feature: g.feature, required: g.required });
  };
}

module.exports = {
  FEATURE_PLANS, KNOWN_PLANS,
  effectivePlanId, canUse, requiredPlanFor, upsellMessage,
  planGate, planGateMiddleware,
};
