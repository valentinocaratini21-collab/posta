'use strict';
// Campañas comerciales por rubro (growth ola 2, 2026-10-21).
// Calendario completo: ~/workspace/equipo-posty/calendario-campanas.md.
// Una campaña es una CAPA del fundamento: sugiere tema a la semana SOLO si el
// rubro del negocio vende en esa fecha (test de pertenencia: el generador
// puede ignorarla). Antes del lanzamiento (1/1/2027) enmarca la PRUEBA y la
// lista de espera — jamás promete operación lanzada. Sin I/O, sin estado.

// Categorías del sistema contra las que se cruza la ventana. Las claves son
// fragmentos que el category del perfil puede contener (texto libre/normalizado).
const CAMPAIGNS = [
  {
    id: 'cybermonday-ar-2026', emoji: '🛒',
    name: { es: 'CyberMonday', en: 'Cyber Monday' },
    start: '2026-10-26', end: '2026-11-04',
    frame: { es: 'la semana de tu negocio para CyberMonday', en: 'your business’s week for Cyber Monday' },
    cats: ['retail','moda','indumentaria','ropa','deco','hogar','muebl','joyeria','electro','tecnologia','mascotas','pet','belleza','estetica'],
    angle: { es: 'CyberMonday AR (2–4/11, CACE): la palabra-dinero es % OFF real + fecha límite + canal (solo web / link en bio) + cuotas si el negocio las ofrece de verdad. La pieza es el producto estrella PUESTO/en uso con tercio limpio para el % — nunca flyer tipográfico puro. Servicios de turnos (barbería, fitness, estética de agenda) quedan FUERA salvo pase/pack vendible online declarado en el ADN.', en: 'AR Cyber Monday (Nov 2–4, CACE): the money-word is a real % OFF + deadline + channel (online only / link in bio). Star product worn/in use with a clean third for the % — never a pure type flyer.' },
  },
  {
    id: 'black-friday-2026', emoji: '🛍️',
    name: { es: 'Black Friday', en: 'Black Friday' },
    start: '2026-11-23', end: '2026-11-30',
    frame: { es: 'la semana de tu negocio para Black Friday', en: 'your business’s week for Black Friday' },
    cats: ['retail', 'moda', 'indumentaria', 'ropa', 'belleza', 'estetica', 'peluquer', 'barber', 'gastronom', 'comida', 'restaur', 'cafe', 'fitness', 'gimnasio', 'gym', 'mascotas', 'pet', 'deco', 'hogar', 'muebl', 'electro', 'tecnologia'],
    angle: { es: 'Black Friday (27/11) y Cyber Monday (30/11): la vidriera y los turnos/pases de diciembre se venden esta semana.', en: 'Black Friday (Nov 27) and Cyber Monday (Nov 30): December bookings and gift cards sell this week.' },
  },
  {
    id: 'fiestas-2026', emoji: '🎄',
    name: { es: 'las Fiestas', en: 'the Holidays' },
    start: '2026-12-07', end: '2026-12-31',
    frame: { es: 'la semana de tu negocio para las Fiestas', en: 'your business’s week for the Holidays' },
    cats: ['gastronom', 'comida', 'restaur', 'cafe', 'bar', 'belleza', 'estetica', 'peluquer', 'barber', 'retail', 'moda', 'indumentaria', 'regaleria', 'floreria', 'joyeria', 'mascotas'],
    angle: { es: 'Fiestas: agenda de diciembre, regalos y mesas de fin de año. La escasez solo si es real (turnos contables).', en: 'Holiday season: December bookings, gifts and year-end tables. Scarcity only when real (countable slots).' },
  },
  {
    id: 'lanzamiento-2027', emoji: '🎉',
    name: { es: 'el arranque del año', en: 'the New Year kickoff' },
    start: '2027-01-01', end: '2027-01-06',
    frame: { es: 'tu primera semana del año, lista', en: 'your first week of the year, ready' },
    cats: [], // todos los rubros
    angle: { es: 'Arranque del año + Reyes (6/1): la semana 1 del negocio marca el tono del año.', en: 'New Year kickoff: week 1 sets the tone for the year.' },
  },
  {
    id: 'verano-2027', emoji: '☀️',
    name: { es: 'el verano', en: 'January goals' },
    start: '2027-01-07', end: '2027-01-31',
    frame: { es: 'la semana de tu negocio para el verano', en: 'your business’s January week' },
    cats: ['moda', 'indumentaria', 'fitness', 'gimnasio', 'gym', 'belleza', 'estetica', 'gastronom', 'comida'],
    angle: { es: 'Verano AR: liquidación con dignidad. US: resoluciones de enero (fitness es el rubro rey).', en: 'January resolutions: fitness leads; summer sales in the southern market.' },
  },
  {
    id: 'san-valentin-2027', emoji: '💘',
    name: { es: 'San Valentín', en: 'Valentine’s Day' },
    start: '2027-02-08', end: '2027-02-14',
    frame: { es: 'la semana de tu negocio para San Valentín', en: 'your business’s week for Valentine’s Day' },
    cats: ['gastronom', 'comida', 'restaur', 'belleza', 'estetica', 'floreria', 'regaleria', 'joyeria', 'hoteleria', 'turismo'],
    angle: { es: 'San Valentín (14/2): reservas de a dos, regalos resueltos y experiencias para regalar.', en: 'Valentine’s Day (Feb 14): bookings for two, solved gifts and giftable experiences.' },
  },
  {
    id: 'vuelta-a-clases-2027', emoji: '🎒',
    name: { es: 'la vuelta a clases', en: 'back to school / spring' },
    start: '2027-02-22', end: '2027-03-12',
    frame: { es: 'la semana de tu negocio para la vuelta a clases', en: 'your business’s week for the new season' },
    cats: ['libreria', 'indumentaria', 'peluquer', 'barber', 'optica', 'educacion', 'idiomas', 'deporte'],
    angle: { es: 'Vuelta a clases AR: corte escolar, útiles, control visual, actividades de los chicos.', en: 'New season: fresh starts — haircuts, checkups, classes and kids’ activities.' },
  },
  {
    id: 'dia-mujer-2027', emoji: '💜',
    name: { es: 'el Día de la Mujer', en: 'Women’s Day' },
    start: '2027-03-03', end: '2027-03-08',
    frame: { es: 'la semana de tu negocio para el Día de la Mujer', en: 'your business’s week for Women’s Day' },
    cats: ['belleza', 'estetica', 'bienestar', 'spa', 'moda', 'indumentaria', 'gastronom', 'comida', 'floreria'],
    angle: { es: 'Día de la Mujer (8/3): celebración y experiencias; homenaje a clientas, jamás descuento berreta.', en: 'Women’s Day (Mar 8): celebration and experiences; honor your clients, never a cheap discount angle.' },
  },
  {
    id: 'semana-santa-2027', emoji: '🐣',
    name: { es: 'Semana Santa', en: 'Easter' },
    start: '2027-03-22', end: '2027-03-28',
    frame: { es: 'la semana de tu negocio para Semana Santa', en: 'your business’s week for Easter' },
    cats: ['gastronom', 'comida', 'restaur', 'turismo', 'hoteleria', 'retail', 'mascotas', 'pet'],
    angle: { es: 'Semana Santa (25–28/3): menú de vigilia (AR), finde XL, guardería de mascotas para los que viajan.', en: 'Easter weekend (Mar 25–28): long-weekend plans, travel and pet boarding.' },
  },
];

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function inWindow(c, d) {
  const t = d.getTime();
  return t >= new Date(c.start + 'T00:00:00').getTime() && t <= new Date(c.end + 'T23:59:59').getTime();
}
function catMatches(c, category) {
  if (!c.cats.length) return true;
  const cat = norm(category);
  if (!cat) return false;
  return c.cats.some((k) => cat.includes(norm(k)));
}

// La campaña activa en `date` (si dos se pisan, la de fecha de cierre más cercana).
function activeCampaign(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const hits = CAMPAIGNS.filter((c) => inWindow(c, d));
  if (!hits.length) return null;
  hits.sort((a, b) => new Date(a.end) - new Date(b.end));
  return hits[0];
}

// Payload público para el marco de la prueba (regla de verdad: solo fechas y
// nombres del calendario; pre-lanzamiento el marco es de PRUEBA/lista, nunca
// de operación ya lanzada).
function currentCampaign(date, lang) {
  const c = activeCampaign(date);
  if (!c) return null;
  const en = lang === 'en';
  const L = (o) => (en ? o.en : o.es);
  return {
    id: c.id, emoji: c.emoji, name: L(c.name), frame: L(c.frame),
    until: c.end, prelaunch: (date instanceof Date ? date : new Date(date || Date.now())) < new Date('2027-01-01T00:00:00'),
  };
}

// Línea para el brief de ideas: capa SUGERIDA, pertenencia manda.
function campaignThemeLine(date, category, lang) {
  const c = activeCampaign(date);
  if (!c || !catMatches(c, category)) return '';
  const en = lang === 'en';
  const L = (o) => (en ? o.en : o.es);
  return en
    ? `🗓️ COMMERCIAL CAMPAIGN LAYER (suggestion, belonging rules): ${L(c.name)} window is open. Angle for this trade: ${L(c.angle)} You MAY theme 1–2 ideas around it ONLY with this business's real products/services — if the business doesn't sell for this date, ignore this layer completely.`
    : `🗓️ CAPA DE CAMPAÑA COMERCIAL (sugerencia, manda la pertenencia): está abierta la ventana de ${L(c.name)}. Ángulo para este rubro: ${L(c.angle)} Podés tematizar 1–2 ideas SOLO con productos/servicios reales de este negocio — si el negocio no vende para esta fecha, ignorá esta capa por completo.`;
}

module.exports = { CAMPAIGNS, activeCampaign, currentCampaign, campaignThemeLine, catMatches };
