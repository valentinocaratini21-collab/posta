// Planes de Posta — UN SOLO LUGAR para cambiar precios.
// AR: precios en ARS (pesos argentinos). UY: precios en UYU (pesos uruguayos).
// postsPerWeek = posts que arma el autopilot por semana.
// reelsPerWeek / storiesPerWeek = reels e historias semanales (los genera
// story-reel.js generateWeekExtras, idempotente por déficit, en cada semana).
//
// TECHO DE IA (vara de Valentino, 2026-10-02): el costo variable de IA por usuario/mes
// no puede superar el 5% del precio del plan (Esencial: $10.000 ARS/mes). Se enforcea
// con `monthlyCapUsd` en costs.js (calculado desde price × 0.05) + límites diarios `ai`.
// ✅ PRECIOS UY (escalera de familia Bambooty, 2026-10-24): UYU 4.990 / 7.490 / 9.990 — espejo $U 25 × USD con cierre en 90. (Anteriores, 2026-10-22: 2.490 / 4.990 / 7.990.)

// (v390) DETALLE «POR VOS» de cada plan: lo que el plan hace POR el cliente,
// en tareas y resultados concretos — es el texto que se despliega al tocar
// la tarjeta de un plan sin tocar «suscribirte» (homes ES/EN, /prueba,
// paywall y Mi plan). REGLA DE VERDAD: cada línea sale de las `features`
// reales del plan o de sus campos (postsPerWeek/reelsPerWeek/storiesPerWeek/
// carouselsPerWeek); nada que el plan no incluya. Si cambia una feature,
// se actualiza su línea acá.
const DETAIL_ES_COMUN = {
  semana: 'Te armo la semana completa: 7 posteos con tus fotos, tus colores y tu producto exacto — nada de plantillas genéricas.',
  carrusel: 'Cuando una idea lo pide, te la convierto en carrusel (hasta 2 por semana).',
  captions: 'Te escribo cada pie de foto en tu tono, con su intención de venta y sus hashtags.',
  publicacion: 'Publico todo solo, en el mejor horario — y te aviso 30 minutos antes por si querés frenar algo.',
  control: 'Vos solo mirás: pausás lo que no te guste en un toque o me pedís el cambio por chat, como a tu CM de siempre.',
};
const DETAIL_ES = {
  esencial: [
    DETAIL_ES_COMUN.semana,
    'Te produzco 1 reel por semana, con el guión pensado para tu negocio.',
    DETAIL_ES_COMUN.carrusel,
    DETAIL_ES_COMUN.captions,
    DETAIL_ES_COMUN.publicacion,
    'Analizo tu cuenta semana a semana y ajusto la que viene con lo que funcionó.',
    DETAIL_ES_COMUN.control,
  ],
  pro: [
    DETAIL_ES_COMUN.semana,
    'Te produzco 3 reels por semana y 3 historias por semana: tu negocio está presente todos los días.',
    DETAIL_ES_COMUN.carrusel,
    DETAIL_ES_COMUN.captions,
    DETAIL_ES_COMUN.publicacion,
    'Te hago la radiografía completa de tu competencia y armo tu estrategia para diferenciarte.',
    'Te gestiono la pauta de los posteos que mejor rinden (fee del 10% sobre lo pautado).',
    'Cada semana te llega tu reporte de resultados: qué funcionó y qué sigue.',
    DETAIL_ES_COMUN.control,
  ],
  total: [
    DETAIL_ES_COMUN.semana,
    'Te produzco 5 reels por semana e historias todos los días.',
    DETAIL_ES_COMUN.carrusel,
    DETAIL_ES_COMUN.captions,
    DETAIL_ES_COMUN.publicacion,
    'Te hago la radiografía completa de tu competencia y armo tu estrategia para diferenciarte.',
    'Te gestiono la pauta de los posteos que mejor rinden (fee del 10% sobre lo pautado).',
    'Cada semana te llega tu reporte de resultados: qué funcionó y qué sigue.',
    'Te atiendo los mensajes y comentarios de Instagram las 24 horas: preparo cada respuesta al instante y vos la aprobás con un toque antes de que salga — nada sale sin tu OK.',
    'Respondo con tus precios y servicios reales, no con frases genéricas.',
    'Te agendo los turnos y reservas, y los confirmo.',
    'Hago seguimiento a quien preguntó y no cerró, y cierro la venta con link de pago o seña.',
    'Te gestiono las reseñas de Google: cada respuesta queda lista para tu OK.',
    DETAIL_ES_COMUN.control,
  ],
};
// EN mirrors PLANS_US features exactly (the US ladder's own sold truth).
const DETAIL_EN = {
  esencial: [
    'I build your whole week: 7 posts with your photos, your colors and your exact product — no cookie-cutter templates.',
    'I produce 1 reel per week, scripted for your business.',
    'When an idea calls for it, I turn it into a carousel (up to 2 per week).',
    'I write every caption in your voice, with its selling angle and its hashtags.',
    'I post everything on its own, at the best time — and I give you a heads-up 30 minutes before, in case you want to pause anything.',
    'I analyze your account week by week and tune the next week with what worked.',
    'You just keep an eye on things: pause anything in one tap, or ask me for the change in the chat.',
  ],
  pro: [
    'I build your whole week: 7 posts with your photos, your colors and your exact product — no cookie-cutter templates.',
    'I produce 3 reels per week and 3 stories per week: your business shows up every day.',
    'When an idea calls for it, I turn it into a carousel (up to 2 per week).',
    'I write every caption in your voice, with its selling angle and its hashtags.',
    'I post everything on its own, at the best time — and I give you a heads-up 30 minutes before, in case you want to pause anything.',
    'I give you a full breakdown of your competition, so you know exactly where you stand.',
    'You just keep an eye on things: pause anything in one tap, or ask me for the change in the chat.',
  ],
  total: [
    'I build your whole week: 7 posts with your photos, your colors and your exact product — no cookie-cutter templates.',
    'I produce 3 reels per week and stories every day.',
    'When an idea calls for it, I turn it into a carousel (up to 2 per week).',
    'I write every caption in your voice, with its selling angle and its hashtags.',
    'I post everything on its own, at the best time — and I give you a heads-up 30 minutes before, in case you want to pause anything.',
    'I give you a full breakdown of your competition, so you know exactly where you stand.',
    'I answer your comments and messages: I prepare every reply, and you approve each one before it goes out.',
    'You just keep an eye on things: pause anything in one tap, or ask me for the change in the chat.',
  ],
};

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
    price: 199999,
    currency: 'ARS',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 1,
    storiesPerWeek: 0,
    tagline: 'Para estar presente toda la semana',
    detail: DETAIL_ES.esencial,
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
    price: 299900,
    currency: 'ARS',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 3,
    storiesPerWeek: 3,
    tagline: 'Para crecer de verdad',
    detail: DETAIL_ES.pro,
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
    price: 399900,
    currency: 'ARS',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 5,
    storiesPerWeek: 7,
    tagline: 'Tu negocio atendido y vendiendo, con tu OK en un toque',
    detail: DETAIL_ES.total,
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

// ✅ UY (escalera de familia Bambooty, 2026-10-24) — misma arquitectura que AR: el Pro es el héroe (≈ $U 250/día).
const PLANS_UY = {
  esencial: {
    id: 'esencial',
    name: 'Esencial',
    price: 4990,
    currency: 'UYU',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 1,
    storiesPerWeek: 0,
    tagline: 'Para estar presente toda la semana',
    detail: DETAIL_ES.esencial,
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
    price: 7490,
    currency: 'UYU',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 3,
    storiesPerWeek: 3,
    tagline: 'Para crecer de verdad',
    detail: DETAIL_ES.pro,
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
    price: 9990,
    currency: 'UYU',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 5,
    storiesPerWeek: 7,
    tagline: 'Tu negocio atendido y vendiendo, con tu OK en un toque',
    detail: DETAIL_ES.total,
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
// Valores confirmados por Valentino (2026-10-22, tercera escalera); el «desde» sigue a la escalera vigente (familia Bambooty, 2026-10-24). Corrección de Valentino (2026-10-24): el cm AR es «desde $1.000.000 por mes» (mínimo real de un CM en Argentina); el rango $300.000–$600.000 quedó MUERTO y no se cita más.
const PLAN_ANCHOR = {
  AR: { cm: 'desde $1.000.000 por mes', desde: '$199.999' },
  UY: { cm: 'más de $U 25.000 por mes', desde: '$U 4.990' },
};

// (v274 · MODO EN) Planes US — escalera definida por Valentino el
// 2026-10-20: USD 199.99 / 299.99 / 399.99 (escalera de familia Bambooty, 2026-10-24 — Posty es el piso de la familia; anteriores: 99.99 / 189.99 / 289.99 (tercera escalera, 2026-10-22), 59 / 119 / 179 el 2026-10-21 y 49 / 99 / 149 el 2026-10-20), mismos roles que AR (Plan 1 = Community
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
    price: 199.99,
    currency: 'USD',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 1,
    storiesPerWeek: 0,
    tagline: 'To be present all week long',
    detail: DETAIL_EN.esencial,
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
    price: 299.99,
    currency: 'USD',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 3,
    storiesPerWeek: 3,
    tagline: 'To actually grow',
    detail: DETAIL_EN.pro,
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
    price: 399.99,
    currency: 'USD',
    postsPerWeek: 7,
    carouselsPerWeek: 2,
    reelsPerWeek: 3,
    storiesPerWeek: 7,
    tagline: 'Everything, handled for you',
    detail: DETAIL_EN.total,
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
// GBP \u00a3159/239/319 · CAD C$279/409/549 (2026-10-24: misma proporción por tramo de la escalera anterior — GB ≈0,79× el USD de su tramo, CA ≈1,39/1,36/1,38× — redondeada al precio cerrado en 9, como los viejos 79/149/229 y 139/259/399). Sin ancla de precio en esta pasada.
const PLANS_GB = {
  esencial: { ...PLANS_US.esencial, id: 'esencial', price: 159, currency: 'GBP' },
  pro: { ...PLANS_US.pro, id: 'pro', price: 239, currency: 'GBP' },
  total: { ...PLANS_US.total, id: 'total', price: 319, currency: 'GBP' },
};

const PLANS_CA = {
  esencial: { ...PLANS_US.esencial, id: 'esencial', price: 279, currency: 'CAD' },
  pro: { ...PLANS_US.pro, id: 'pro', price: 409, currency: 'CAD' },
  total: { ...PLANS_US.total, id: 'total', price: 549, currency: 'CAD' },
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
