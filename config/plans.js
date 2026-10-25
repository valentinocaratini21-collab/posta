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
// ─────────────────────────────────────────────────────────────────────────
// DESCUENTO POR EQUIPO (decisión de Valentino, 2026-10-24 — spec canónica:
// workspace/bambooty-precios/DESCUENTO-POR-EQUIPO.md). REGISTRO SIN LÓGICA
// TODAVÍA: cuando «Sumar un puesto» exista, lo computa EL SERVIDOR al
// facturar, como línea visible «Descuento por equipo −X%», sobre la SUMA
// de los precios contratados vigentes de los puestos activos de la cuenta:
// 2 puestos −10% · 3 puestos −15% · 4 o más −20%. Nace al llegar a 2
// puestos activos y cesa desde el ciclo siguiente si la cuenta vuelve a 1.
// La base de cada puesto es SU precio contratado (el fundador congelado
// de users.founder_price incluido; nada se recalcula a lista) y NO se
// acumula con Bambooty completo (USD 799,99 / 1.199,99 / 1.599,99,
// precio fundador), que ya es el mejor precio por agente. Aplica solo a cargos recurrentes, nunca a pagos únicos.
// HOY Posty es el ÚNICO puesto vivo: sin segundo puesto no hay descuento
// aplicable todavía.
// ─────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────
// BAMBOOTY SUPREMO (decisión de Valentino, 2026-10-24 — spec:
// workspace/bambooty-supremo/BAMBOOTY-SUPREMO.md): el nivel máximo de la
// familia se denomina «Bambooty» (en la app: «Bambooty completo»); el
// nombre comercial «Pack Oficina Completa» quedó RETIRADO de las
// vidrieras. PRECIO FUNDADOR: USD 799,99 / 1.199,99 / 1.599,99
// (reemplaza a 1.499,99 / 1.999,99 / 2.499,99; nadie pagó el precio
// anterior — la reserva nunca cobró — así que no hay conflicto con
// «lo vendido no se retira»).
// El 1/4/2027 la app se renombra a Bambooty: la app ES Bambooty y su
// nivel supremo también.
// ─────────────────────────────────────────────────────────────────────────
// MARCO BAMBOOTY CON PODERES (doctrina comercial, Valentino 2026-10-24 —
// spec §1 bis): el contrato/marco en la app es «Bambooty» con poderes
// activos; cada puesto contratado = un poder prendido. «Sumar un puesto»
// se lee internamente como sumar un poder a tu Bambooty (la matemática
// del descuento por equipo NO cambia). Los paquetes («Para que te vean» ·
// «Para vender más» · «Para que todo ande solo» · «Completo») son
// configuraciones precargadas de Bambooty; «Armá el tuyo» es la
// configuración libre. La pantalla «Sumar un puesto» se diseña: paquetes
// primero, poderes prender/apagar después, total en vivo.
// ESCALERA ÚNICA (Valentino, 2026-10-24): TODOS los poderes cuestan
// USD 199,99 / 299,99 / 399,99 — el precio de Posty ya no es «el más
// barato»: es EL precio de todo poder. Con esa escalera: la suma de los
// ocho Esencial = USD 1.599,92 y Bambooty completo fundador (799,99) es
// exactamente la mitad (ahorro 799,93); los paquetes quedan en
// USD 359,98 («Para que te vean» y «Para que todo ande solo») y
// USD 509,97 («Para vender más»), suma de sus poderes con el descuento
// por equipo aplicado.
// ─────────────────────────────────────────────────────────────────────────
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
  // LO VENDIDO NO SE RETIRA (regla de la casa, Valentino 2026-10-24):
  // quien contrata el plan Total mantiene la capa Atención al Cliente
  // (con reseñas de Google) INCLUIDA de por vida de su plan, al precio
  // contratado, aunque esa capa mañana se convierta en un agente propio
  // (Atenty) que se venda aparte. Mecanismo precedente: users.founder_price
  // (el precio contratado manda, nunca se re-precia a lista).
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

// (Tablero Bambooty 2026-10-25, «dale a todo») UK y Eurozona — cobro SOLO Stripe.
// GBP £149,99/£224,99/£299,99 y EUR €179,99/€269,99/€359,99: espejos APROBADOS
// por el tablero. El espejo GB anterior MUERE: este espejo lo reemplaza
// en todas las superficies. CA no se toca (sigue C$279/409/549, solo API).
const PLANS_GB = {
  esencial: { ...PLANS_US.esencial, id: 'esencial', price: 149.99, currency: 'GBP' },
  pro: { ...PLANS_US.pro, id: 'pro', price: 224.99, currency: 'GBP' },
  total: { ...PLANS_US.total, id: 'total', price: 299.99, currency: 'GBP' },
};

// Eurozona — espejo aprobado, riel Stripe. Misma escalera de roles que US.
const PLANS_EU = {
  esencial: { ...PLANS_US.esencial, id: 'esencial', price: 179.99, currency: 'EUR' },
  pro: { ...PLANS_US.pro, id: 'pro', price: 269.99, currency: 'EUR' },
  total: { ...PLANS_US.total, id: 'total', price: 359.99, currency: 'EUR' },
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
  if (country === 'EU') return PLANS_EU;
  if (country === 'CA') return PLANS_CA;
  // Latam MP sin precio local publicado (tablero 2026-10-25): la escalera que
  // se MUESTRA es la USD base real, rotulada USD, sin cifra local inventada.
  // El riel es Mercado Pago (ver COUNTRY_META.rail). Cuando el tablero pase
  // la tabla de anclas, estos países ganan su PLANS propio.
  if (['BR', 'MX', 'CL', 'CO', 'PE'].includes(country)) return PLANS_US;
  return PLANS_AR;
}

// Meta del selector de país (única fuente: la API la sirve y los clientes la
// pintan). Orden = el de la familia (Venty/Atenty/Gesty, mismo «dale a todo»).
// pending = sin precio local publicado: se muestra USD base + nota, jamás un
// precio inventado. EC/VE NO están acá: no se publican hasta confirmar contra
// fuente oficial de Mercado Pago.
const SELECTOR_COUNTRIES = ['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'EU'];
const COUNTRY_META = {
  US: { flag: '\u{1F1FA}\u{1F1F8}', name_es: 'Estados Unidos', name_en: 'United States', currency: 'USD', rail: 'stripe', pending: false,
        note_es: 'Precios en USD.', note_en: 'Prices in USD.' },
  AR: { flag: '\u{1F1E6}\u{1F1F7}', name_es: 'Argentina', name_en: 'Argentina', currency: 'ARS', rail: 'mercadopago', pending: false,
        note_es: 'Precios en pesos argentinos. Pagás con Mercado Pago.', note_en: 'Prices in Argentine pesos. Pay with Mercado Pago.' },
  BR: { flag: '\u{1F1E7}\u{1F1F7}', name_es: 'Brasil', name_en: 'Brazil', currency: 'BRL', rail: 'mercadopago', pending: true,
        note_es: 'Pagás con Mercado Pago. El precio local para tu país todavía no está publicado: ves los precios en USD.', note_en: 'Pay with Mercado Pago. The local price for your country is not published yet: you see prices in USD.' },
  MX: { flag: '\u{1F1F2}\u{1F1FD}', name_es: 'México', name_en: 'Mexico', currency: 'MXN', rail: 'mercadopago', pending: true,
        note_es: 'Pagás con Mercado Pago. El precio local para tu país todavía no está publicado: ves los precios en USD.', note_en: 'Pay with Mercado Pago. The local price for your country is not published yet: you see prices in USD.' },
  CL: { flag: '\u{1F1E8}\u{1F1F1}', name_es: 'Chile', name_en: 'Chile', currency: 'CLP', rail: 'mercadopago', pending: true,
        note_es: 'Pagás con Mercado Pago. El precio local para tu país todavía no está publicado: ves los precios en USD.', note_en: 'Pay with Mercado Pago. The local price for your country is not published yet: you see prices in USD.' },
  CO: { flag: '\u{1F1E8}\u{1F1F4}', name_es: 'Colombia', name_en: 'Colombia', currency: 'COP', rail: 'mercadopago', pending: true,
        note_es: 'Pagás con Mercado Pago. El precio local para tu país todavía no está publicado: ves los precios en USD.', note_en: 'Pay with Mercado Pago. The local price for your country is not published yet: you see prices in USD.' },
  PE: { flag: '\u{1F1F5}\u{1F1EA}', name_es: 'Perú', name_en: 'Peru', currency: 'PEN', rail: 'mercadopago', pending: true,
        note_es: 'Pagás con Mercado Pago. El precio local para tu país todavía no está publicado: ves los precios en USD.', note_en: 'Pay with Mercado Pago. The local price for your country is not published yet: you see prices in USD.' },
  UY: { flag: '\u{1F1FA}\u{1F1FE}', name_es: 'Uruguay', name_en: 'Uruguay', currency: 'UYU', rail: 'mercadopago', pending: false,
        note_es: 'Precios en pesos uruguayos. Pagás con Mercado Pago.', note_en: 'Prices in Uruguayan pesos. Pay with Mercado Pago.' },
  GB: { flag: '\u{1F1EC}\u{1F1E7}', name_es: 'Reino Unido', name_en: 'United Kingdom', currency: 'GBP', rail: 'stripe', pending: false,
        note_es: 'Precios en libras. Pagás con Stripe.', note_en: 'Prices in pounds. Pay with Stripe.' },
  EU: { flag: '\u{1F1EA}\u{1F1FA}', name_es: 'Eurozona', name_en: 'Eurozone', currency: 'EUR', rail: 'stripe', pending: false,
        note_es: 'Precios en euros. Pagás con Stripe.', note_en: 'Prices in euros. Pay with Stripe.' },
  CA: { flag: '\u{1F1E8}\u{1F1E6}', name_es: 'Canadá', name_en: 'Canada', currency: 'CAD', rail: 'stripe', pending: false,
        note_es: 'Precios en dólares canadienses. Pagás con Stripe.', note_en: 'Prices in Canadian dollars. Pay with Stripe.' },
};
function getRail(country) {
  const m = COUNTRY_META[country];
  return m ? m.rail : 'mercadopago';
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
  if ((plan.currency || 'ARS') === 'EUR') {
    return '\u20ac' + Number(plan.price).toLocaleString('en-IE');
  }
  return '$' + Number(plan.price).toLocaleString('es-AR');
}

module.exports = { PLANS, PLANS_AR, PLANS_UY, PLANS_US, PLANS_GB, PLANS_EU, PLANS_CA, PLAN_ANCHOR, TRIAL_PLAN, getPlan, getPlans, formatPrice, SELECTOR_COUNTRIES, COUNTRY_META, getRail };
