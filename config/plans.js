// Planes de Posta — UN SOLO LUGAR para cambiar precios.
// AR: precios en ARS (pesos argentinos). UY: precios en UYU (pesos uruguayos).
// postsPerWeek = posts que arma el autopilot por semana.
// reelsPerWeek / storiesPerWeek = reels e historias semanales (los genera
// story-reel.js generateWeekExtras, idempotente por déficit, en cada semana).
//
// TECHO DE IA (vara de Valentino, 2026-10-02): el costo variable de IA por usuario/mes
// no puede superar el 5% del precio del plan (Esencial: $5.000 ARS/mes). Se enforcea
// con `monthlyCapUsd` en costs.js (calculado desde price × 0.05) + límites diarios `ai`.
// ✅ PRECIOS UY CONFIRMADOS por Valentino (2026-10-22): UYU 2.490 / 4.990 / 7.990.

// Límites diarios de IA por plan. El cap mensual (5%) es el techo duro;
// estos límites son el ritmo para que un usuario normal nunca lo note.
const AI_LIMITS = {
  esencial: { chatPerDay: 40, weeksPerDay: 1, regensPerDay: 3 },
  pro:      { chatPerDay: 80, weeksPerDay: 1, regensPerDay: 5 },
  total:    { chatPerDay: 150, weeksPerDay: 1, regensPerDay: 8 },
};

// Escalera por roles (decisión de Valentino 2026-10-19): nombres y precios NO
// cambian; la venta es por resultado — Plan 1 = Community Manager (presencia),
// Plan 2 = + Growth (crecimiento), Plan 3 = + Atención al cliente (consultas
// respondidas). Growth y Atención operan gated hasta Meta Live.
const PLANS_AR = {
  esencial: {
    id: 'esencial',
    name: 'Esencial',
    price: 99999,
    currency: 'ARS',
    postsPerWeek: 7,
    reelsPerWeek: 1,
    storiesPerWeek: 0,
    tagline: 'Para estar presente toda la semana',
    ai: AI_LIMITS.esencial,
    features: [
      '7 posteos por semana, automáticos',
      '1 reel por semana',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis de tu cuenta, semana a semana',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 189900,
    currency: 'ARS',
    postsPerWeek: 7,
    reelsPerWeek: 3,
    storiesPerWeek: 3,
    tagline: 'Para crecer de verdad',
    ai: AI_LIMITS.pro,
    features: [
      '7 posteos por semana, automáticos',
      '3 reels por semana',
      '3 historias por semana',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis completo de tu cuenta y tu competencia',
      'Estrategia para diferenciarte de tu competencia',
      'Pauta gestionada (fee 10%)',
      'Reporte semanal de resultados',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 289900,
    currency: 'ARS',
    postsPerWeek: 7,
    reelsPerWeek: 5,
    storiesPerWeek: 7,
    tagline: 'Tu negocio atendido y vendiendo, con tu OK en un toque',
    ai: AI_LIMITS.total,
    features: [
      '7 posteos por semana, automáticos',
      '5 reels por semana',
      'Historias todos los días',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis completo de tu cuenta y tu competencia',
      'Estrategia para diferenciarte de tu competencia',
      'Pauta gestionada (fee 10%)',
      'Reporte semanal de resultados',
      'Atención al cliente en Instagram: Posty prepara y vos aprobás con un toque',
      'Responde con tus precios y servicios reales',
      'Agenda tus turnos y reservas, y los confirma',
      'Seguimiento a quien preguntó y no cerró',
      'Cierre con link de pago o seña',
      'Comentarios respondidos (cada uno lo aprobás con un toque)',
      'Reseñas de Google gestionadas',
    ],
  },
};

// ✅ UY CONFIRMADO por Valentino (2026-10-22, tercera escalera) — misma arquitectura que AR: el Pro es el héroe (≈ $U 166/día).
const PLANS_UY = {
  esencial: {
    id: 'esencial',
    name: 'Esencial',
    price: 2490,
    currency: 'UYU',
    postsPerWeek: 7,
    reelsPerWeek: 1,
    storiesPerWeek: 0,
    tagline: 'Para estar presente toda la semana',
    ai: AI_LIMITS.esencial,
    features: [
      '7 posteos por semana, automáticos',
      '1 reel por semana',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis de tu cuenta, semana a semana',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 4990,
    currency: 'UYU',
    postsPerWeek: 7,
    reelsPerWeek: 3,
    storiesPerWeek: 3,
    tagline: 'Para crecer de verdad',
    ai: AI_LIMITS.pro,
    features: [
      '7 posteos por semana, automáticos',
      '3 reels por semana',
      '3 historias por semana',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis completo de tu cuenta y tu competencia',
      'Estrategia para diferenciarte de tu competencia',
      'Pauta gestionada (fee 10%)',
      'Reporte semanal de resultados',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 7990,
    currency: 'UYU',
    postsPerWeek: 7,
    reelsPerWeek: 5,
    storiesPerWeek: 7,
    tagline: 'Tu negocio atendido y vendiendo, con tu OK en un toque',
    ai: AI_LIMITS.total,
    features: [
      '7 posteos por semana, automáticos',
      '5 reels por semana',
      'Historias todos los días',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis completo de tu cuenta y tu competencia',
      'Estrategia para diferenciarte de tu competencia',
      'Pauta gestionada (fee 10%)',
      'Reporte semanal de resultados',
      'Atención al cliente en Instagram: Posty prepara y vos aprobás con un toque',
      'Responde con tus precios y servicios reales',
      'Agenda tus turnos y reservas, y los confirma',
      'Seguimiento a quien preguntó y no cerró',
      'Cierre con link de pago o seña',
      'Comentarios respondidos (cada uno lo aprobás con un toque)',
      'Reseñas de Google gestionadas',
    ],
  },
};

// Texto de ancla de precio por país (se muestra sobre las tarjetas de planes).
// Valores confirmados por Valentino (2026-10-22, tercera escalera).
const PLAN_ANCHOR = {
  AR: { cm: '$300.000 a $600.000 por mes — o más', desde: '$99.999' },
  UY: { cm: 'más de $U 25.000 por mes', desde: '$U 2.490' },
};

// (v274 · MODO EN) Planes US — escalera definida por Valentino el
// 2026-10-20: USD 99.99 / 189.99 / 289.99 (tercera escalera de Valentino, 2026-10-22; anteriores: 59 / 119 / 179 el 2026-10-21 y 49 / 99 / 149 el 2026-10-20), mismos roles que AR (Plan 1 = Community
// Manager, Plan 2 = + Growth, Plan 3 = + Customer care).
// ✅ COBRO US CONECTADO (v285, 2026-10-21): el checkout vive en
// stripe-billing.js (Checkout Sessions + suscripciones, cuenta PERSONAL de
// Stripe de Valentino — decisión 2026-10-20: NO bajo la LLC). Los price ids
// NO se hardcodean: el bootstrap crea/reusa los precios de Stripe por
// lookup_key estable `posty_us_<plan>_monthly` desde ESTOS montos. El módulo
// es fail-closed: sin STRIPE_SECRET_KEY en el entorno, nada cambia.
const PLANS_US = {
  esencial: {
    id: 'esencial',
    name: 'Essential',
    price: 99.99,
    currency: 'USD',
    postsPerWeek: 7,
    reelsPerWeek: 1,
    storiesPerWeek: 0,
    tagline: 'To be present all week long',
    ai: AI_LIMITS.esencial,
    features: [
      '7 posts per week, automatic',
      '1 reel per week',
      'Strategic ideas for your business',
      'Designs + captions + hashtags',
      'Scheduled automatic publishing',
      'Analysis of your account, week by week',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 189.99,
    currency: 'USD',
    postsPerWeek: 7,
    reelsPerWeek: 3,
    storiesPerWeek: 3,
    tagline: 'To actually grow',
    ai: AI_LIMITS.pro,
    features: [
      '7 posts per week, automatic',
      '3 reels per week',
      '3 stories per week',
      'Strategic ideas for your business',
      'Designs + captions + hashtags',
      'Scheduled automatic publishing',
      'Full competitor breakdown',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 289.99,
    currency: 'USD',
    postsPerWeek: 7,
    reelsPerWeek: 3,
    storiesPerWeek: 7,
    tagline: 'Everything, handled for you',
    ai: AI_LIMITS.total,
    features: [
      '7 posts per week, automatic',
      '3 reels per week',
      'Daily stories',
      'Strategic ideas for your business',
      'Designs + captions + hashtags',
      'Scheduled automatic publishing',
      'Full competitor breakdown',
      'Comment and message replies (you approve each one)',
    ],
  },
};

// (Addendum 2026-10-22, consolidación M96) UK y Canadá — cobro SOLO Stripe:
// la website EN los ofrece con la misma escalera de roles que US.
// GBP \u00a379/149/229 · CAD C$139/259/399. Sin ancla de precio en esta pasada.
const PLANS_GB = {
  esencial: { ...PLANS_US.esencial, id: 'esencial', price: 79, currency: 'GBP' },
  pro: { ...PLANS_US.pro, id: 'pro', price: 149, currency: 'GBP' },
  total: { ...PLANS_US.total, id: 'total', price: 229, currency: 'GBP' },
};

const PLANS_CA = {
  esencial: { ...PLANS_US.esencial, id: 'esencial', price: 139, currency: 'CAD' },
  pro: { ...PLANS_US.pro, id: 'pro', price: 259, currency: 'CAD' },
  total: { ...PLANS_US.total, id: 'total', price: 399, currency: 'CAD' },
};

// Plan por defecto para usuarios sin suscripción paga
const TRIAL_PLAN = 'esencial';

// Compatibilidad: PLANS = Argentina (comportamiento anterior)
const PLANS = PLANS_AR;

function getPlans(country) {
  if (country === 'UY') return PLANS_UY;
  if (country === 'US') return PLANS_US;
  if (country === 'GB') return PLANS_GB;
  if (country === 'CA') return PLANS_CA;
  return PLANS_AR;
}

function getPlan(id, country) {
  // Plan "free": cuenta de cortesía (fundador). Límites del Total, precio 0.
  // No vive en PLANS_AR/PLANS_UY para que nunca aparezca en la página de precios.
  if (id === 'free') {
    const t = getPlans(country).total;
    return { ...t, id: 'free', name: 'Founder', price: 0, tagline: 'Cuenta del fundador' };
  }
  const plans = getPlans(country);
  return plans[id] || plans[TRIAL_PLAN];
}

function formatPrice(plan) {
  if ((plan.currency || 'ARS') === 'UYU') {
    return '$U ' + Number(plan.price).toLocaleString('es-UY');
  }
  if ((plan.currency || 'ARS') === 'USD') {
    return '$' + Number(plan.price).toLocaleString('en-US');
  }
  if ((plan.currency || 'ARS') === 'GBP') {
    return '\u00a3' + Number(plan.price).toLocaleString('en-GB');
  }
  if ((plan.currency || 'ARS') === 'CAD') {
    return 'C$' + Number(plan.price).toLocaleString('en-CA');
  }
  return '$' + Number(plan.price).toLocaleString('es-AR');
}

module.exports = { PLANS, PLANS_AR, PLANS_UY, PLANS_US, PLANS_GB, PLANS_CA, PLAN_ANCHOR, TRIAL_PLAN, getPlan, getPlans, formatPrice };
