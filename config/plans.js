// Planes de Posta — UN SOLO LUGAR para cambiar precios.
// Precios en ARS (pesos argentinos). postsPerWeek = posts que arma el autopilot por semana.
const PLANS = {
  esencial: {
    id: 'esencial',
    name: 'Esencial',
    price: 29900,
    currency: 'ARS',
    postsPerWeek: 3,
    tagline: 'Para empezar a estar presente',
    features: [
      '3 posts por semana en piloto automático',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Soporte por WhatsApp',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 59900,
    currency: 'ARS',
    postsPerWeek: 5,
    tagline: 'Para crecer de verdad',
    features: [
      '5 posts por semana en piloto automático',
      'Ideas estratégicas para tu negocio',
      'Diseños + captions + hashtags',
      'Publicación automática programada',
      'Análisis de tu competencia',
      'Soporte prioritario por WhatsApp',
    ],
    highlighted: true,
  },
  total: {
    id: 'total',
    name: 'Total',
    price: 99900,
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
      'Soporte prioritario por WhatsApp',
    ],
  },
};

// Plan por defecto para usuarios sin suscripción paga
const TRIAL_PLAN = 'esencial';

function getPlan(id) {
  return PLANS[id] || PLANS[TRIAL_PLAN];
}

function formatPrice(plan) {
  return '$' + plan.price.toLocaleString('es-AR');
}

module.exports = { PLANS, TRIAL_PLAN, getPlan, formatPrice };
