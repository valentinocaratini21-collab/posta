// Planes de Posta — UN SOLO LUGAR para cambiar precios.
// AR: precios en ARS (pesos argentinos). UY: precios en UYU (pesos uruguayos).
// postsPerWeek = posts que arma el autopilot por semana.
//
// ⚠️ PRECIOS UY PROPUESTOS — a confirmar por el usuario antes de cobrar en Uruguay.

const PLANS_AR = {
  esencial: {
    id: 'esencial',
    name: 'Esencial',
    price: 39900,
    currency: 'ARS',
    postsPerWeek: 3,
    tagline: 'Para empezar a estar presente',
    features: [
      '3 posts por semana en piloto automático',
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
    postsPerWeek: 5,
    tagline: 'Para crecer de verdad',
    features: [
      '5 posts por semana en piloto automático',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis de tu competencia',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 129900,
    currency: 'ARS',
    postsPerWeek: 7,
    tagline: 'Presencia total, todos los días',
    features: [
      '7 posts por semana en piloto automático',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis de tu competencia',
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
    postsPerWeek: 3,
    tagline: 'Para empezar a estar presente',
    features: [
      '3 posts por semana en piloto automático',
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
    postsPerWeek: 5,
    tagline: 'Para crecer de verdad',
    features: [
      '5 posts por semana en piloto automático',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis de tu competencia',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 2990,
    currency: 'UYU',
    postsPerWeek: 7,
    tagline: 'Presencia total, todos los días',
    features: [
      '7 posts por semana en piloto automático',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis de tu competencia',
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
