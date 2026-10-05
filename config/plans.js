// Planes de Posta — UN SOLO LUGAR para cambiar precios.
// AR: precios en ARS (pesos argentinos). UY: precios en UYU (pesos uruguayos).
// postsPerWeek = posts que arma el autopilot por semana.
// reelsPerWeek / storiesPerWeek = reels e historias semanales (pipeline en construcción).
//
// TECHO DE IA (vara de Valentino, 2026-10-02): el costo variable de IA por usuario/mes
// no puede superar el 5% del precio del plan (Esencial: $2.000 ARS/mes). Se enforcea
// con `monthlyCapUsd` en costs.js (calculado desde price × 0.05) + límites diarios `ai`.
// ⚠️ PRECIOS UY PROPUESTOS — a confirmar por el usuario antes de cobrar en Uruguay.

// Límites diarios de IA por plan. El cap mensual (5%) es el techo duro;
// estos límites son el ritmo para que un usuario normal nunca lo note.
const AI_LIMITS = {
  esencial: { chatPerDay: 40, weeksPerDay: 1, regensPerDay: 3 },
  pro:      { chatPerDay: 80, weeksPerDay: 1, regensPerDay: 5 },
  total:    { chatPerDay: 150, weeksPerDay: 1, regensPerDay: 8 },
};

const PLANS_AR = {
  esencial: {
    id: 'esencial',
    name: 'Esencial',
    price: 39900,
    currency: 'ARS',
    postsPerWeek: 5,
    reelsPerWeek: 0,
    storiesPerWeek: 0,
    tagline: 'Para estar presente toda la semana',
    ai: AI_LIMITS.esencial,
    features: [
      '5 posts por semana, armados con un clic',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 79900,
    currency: 'ARS',
    postsPerWeek: 7,
    reelsPerWeek: 0,
    storiesPerWeek: 3,
    tagline: 'Para crecer de verdad',
    ai: AI_LIMITS.pro,
    features: [
      '7 posts por semana, armados con un clic',
      '3 historias por semana',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Estrategia para diferenciarte de tu competencia',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 129900,
    currency: 'ARS',
    postsPerWeek: 7,
    reelsPerWeek: 5,
    storiesPerWeek: 7,
    tagline: 'Presencia total, todos los días',
    ai: AI_LIMITS.total,
    features: [
      '7 posts por semana, armados con un clic',
      '5 reels por semana',
      'Historias todos los días',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Estrategia para diferenciarte de tu competencia',
      'Revisión de estrategia mensual',
    ],
  },
};

// ⚠️ PROPUESTA UY — precios a confirmar por el usuario.
const PLANS_UY = {
  esencial: {
    id: 'esencial',
    name: 'Esencial',
    price: 890,
    currency: 'UYU',
    postsPerWeek: 5,
    reelsPerWeek: 0,
    storiesPerWeek: 0,
    tagline: 'Para estar presente toda la semana',
    ai: AI_LIMITS.esencial,
    features: [
      '5 posts por semana, armados con un clic',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 1790,
    currency: 'UYU',
    postsPerWeek: 7,
    reelsPerWeek: 0,
    storiesPerWeek: 3,
    tagline: 'Para crecer de verdad',
    ai: AI_LIMITS.pro,
    features: [
      '7 posts por semana, armados con un clic',
      '3 historias por semana',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Estrategia para diferenciarte de tu competencia',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 2990,
    currency: 'UYU',
    postsPerWeek: 7,
    reelsPerWeek: 5,
    storiesPerWeek: 7,
    tagline: 'Presencia total, todos los días',
    ai: AI_LIMITS.total,
    features: [
      '7 posts por semana, armados con un clic',
      '5 reels por semana',
      'Historias todos los días',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Estrategia para diferenciarte de tu competencia',
      'Revisión de estrategia mensual',
    ],
  },
};

// Texto de ancla de precio por país (se muestra sobre las tarjetas de planes).
// ⚠️ El valor UY es propuesta — confirmar junto con los precios.
const PLAN_ANCHOR = {
  AR: { cm: '$300.000+/mes', desde: '$39.900' },
  UY: { cm: '$U 50.000+/mes', desde: '$U 890' },
};

// Plan por defecto para usuarios sin suscripción paga
const TRIAL_PLAN = 'esencial';

// Compatibilidad: PLANS = Argentina (comportamiento anterior)
const PLANS = PLANS_AR;

function getPlans(country) {
  return country === 'UY' ? PLANS_UY : PLANS_AR;
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
  return '$' + Number(plan.price).toLocaleString('es-AR');
}

module.exports = { PLANS, PLANS_AR, PLANS_UY, PLAN_ANCHOR, TRIAL_PLAN, getPlan, getPlans, formatPrice };
