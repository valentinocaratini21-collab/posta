'use strict';
// Campañas comerciales por rubro (growth ola 2, 2026-10-21; M108 2026-10-26).
// Calendario completo: ~/workspace/equipo-posty/calendario-campanas.md.
// Una campaña es una CAPA del fundamento: sugiere tema a la semana SOLO si el
// rubro del negocio vende en esa fecha (test de pertenencia: el generador
// puede ignorarla). Antes del lanzamiento (1/1/2027) enmarca la PRUEBA y la
// lista de espera — jamás promete operación lanzada. Sin I/O, sin estado.
//
// M108 — DOS CAMBIOS:
// 1. La tabla fechada MORÍA el 28/3/2027 (desde abril 2027 no había capa para
//    nada). Ahora hay REGLAS ANUALES recurrentes desde 2027 (ANNUAL): Hot
//    Sale, CyberMonday, Madre AR, Black Friday, Fiestas y la recurrencia de
//    las demás. Una entrada fechada cubre su año y su clave; la regla anual
//    de esa clave no duplica ese año.
// 2. Las campañas con mercado único llevan `paises: ['AR']` y se filtran por
//    país (activeCampaign/currentCampaign/campaignThemeLine aceptan `pais`
//    opcional). Sin `pais`, el comportamiento es el histórico (sin filtro):
//    los tests viejos y la prueba pública sin país no cambian.
// Las fechas CACE (Hot Sale, CyberMonday) van por PATRÓN: Hot Sale 2º lunes
// de mayo (CACE 2025: 12–14/5; 2026: 11–13/5 + Hot Week 14–17/5) y CyberMonday
// 1er lunes de noviembre (2025: 3–5/11; 2026: 2–4/11). CACE publica las
// oficiales cada año: re-verificar cuando se publiquen. Las demás reglas
// son calendario cierto (n-ésimo domingo/viernes, Pascua por Computus).

// Categorías del sistema contra las que se cruza la ventana. Las claves son
// fragmentos que el category del perfil puede contener (texto libre/normalizado).
const ECOM_CATS = ['retail','moda','indumentaria','ropa','deco','hogar','muebl','joyeria','electro','tecnologia','mascotas','pet','belleza','estetica'];
const MADRE_CATS = ['retail','moda','indumentaria','ropa','belleza','estetica','floreria','regaleria','joyeria','gastronom','comida','cafe','deco','hogar'];

const CAMPAIGNS = [
  {
    id: 'hot-sale-ar-2026', emoji: '🛒',
    name: { es: 'Hot Sale', en: 'Hot Sale' },
    start: '2026-05-04', end: '2026-05-17',
    frame: { es: 'la semana de tu negocio para Hot Sale', en: 'your business’s week for Hot Sale' },
    cats: ECOM_CATS,
    paises: ['AR'],
    angle: { es: 'Hot Sale AR (11–13/5, CACE; Hot Week 14–17/5): la palabra-dinero es % OFF real + fecha límite + canal (solo web / link en bio) + cuotas si el negocio las ofrece de verdad. La pieza es el producto estrella PUESTO/en uso con tercio limpio para el % — nunca flyer tipográfico puro. Servicios de turnos (barbería, fitness, estética de agenda) quedan FUERA salvo pase/pack vendible online declarado en el ADN.', en: 'AR Hot Sale (May 11–13, CACE; Hot Week May 14–17): the money-word is a real % OFF + deadline + channel (online only / link in bio). Star product worn/in use with a clean third for the % — never a pure type flyer.' },
  },
  {
    id: 'madre-ar-2026', emoji: '💐',
    name: { es: 'el Día de la Madre', en: 'Mother’s Day' },
    start: '2026-10-11', end: '2026-10-18',
    frame: { es: 'la semana de tu negocio para el Día de la Madre', en: 'your business’s week for Mother’s Day' },
    cats: MADRE_CATS,
    paises: ['AR'],
    angle: { es: 'Día de la Madre AR (18/10): la fecha que más vende del año — regalos con el producto estrella del negocio, anticipación y reserva, nunca descuento berreta.', en: 'AR Mother’s Day (Oct 18): the biggest selling date of the year — gifts with the business’s star product, early booking, never a cheap discount angle.' },
  },
  {
    id: 'cybermonday-ar-2026', emoji: '🛒',
    name: { es: 'CyberMonday', en: 'Cyber Monday' },
    start: '2026-10-26', end: '2026-11-04',
    frame: { es: 'la semana de tu negocio para CyberMonday', en: 'your business’s week for Cyber Monday' },
    cats: ECOM_CATS,
    paises: ['AR'],
    angle: { es: 'CyberMonday AR (2–4/11, CACE): la palabra-dinero es % OFF real + fecha límite + canal (solo web / link en bio) + cuotas si el negocio las ofrece de verdad. La pieza es el producto estrella PUESTO/en uso con tercio limpio para el % — nunca flyer tipográfico puro. Servicios de turnos (barbería, fitness, estética de agenda) quedan FUERA salvo pase/pack vendible online declarado en el ADN.', en: 'AR Cyber Monday (Nov 2–4, CACE): the money-word is a real % OFF + deadline + channel (online only / link in bio). Star product worn/in use with a clean third for the % — never a pure type flyer.' },
  },
  {
    id: 'black-friday-2026', emoji: '🛍️',
    name: { es: 'Black Friday', en: 'Black Friday' },
    start: '2026-11-23', end: '2026-11-30',
    frame: { es: 'la semana de tu negocio para Black Friday', en: 'your business’s week for Black Friday' },
    cats: ['retail', 'moda', 'indumentaria', 'ropa', 'belleza', 'estetica', 'peluquer', 'barber', 'gastronom', 'comida', 'restaur', 'cafe', 'fitness', 'gimnasio', 'gym', 'mascotas', 'pet', 'deco', 'hogar', 'muebl', 'electro', 'tecnologia'],
    // (M108 corrección 8) El ángulo ES citaba «Cyber Monday (30/11)»: esa
    // es la fecha US, no AR. Se elimina la cita; el EN la conserva porque
    // para el mercado US el 30/11/2026 sí es el Cyber Monday real.
    angle: { es: 'Black Friday (27/11): la vidriera y los turnos/pases de diciembre se venden esta semana.', en: 'Black Friday (Nov 27) and Cyber Monday (Nov 30): December bookings and gift cards sell this week.' },
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
    // (M108 corrección 8) El ángulo mezclaba liquidación AR con
    // «resoluciones de enero» US en una sola capa para todos. Ahora cada
    // idioma lleva solo su mercado: ES liquidación, EN resoluciones.
    angle: { es: 'Verano: liquidación con dignidad.', en: 'January resolutions: fitness leads.' },
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
function normPais(pais) {
  const p = String(pais || '').toUpperCase();
  if (p === 'UY' || p === 'UYU') return 'UY';
  if (p === 'AR') return 'AR';
  if (p === 'US') return 'US';
  return null;
}
// Sin `paises` la campaña vale para todos los mercados (histórico). Con
// `paises`, solo para esos. Sin `pais` pedido, no se filtra nada.
function paisOk(c, pais) {
  if (!c.paises || !c.paises.length) return true;
  const p = normPais(pais);
  if (!p) return true;
  return c.paises.includes(p);
}

// ---------- Reglas anuales (M108 corrección 3) ----------
function isoYMD(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function nthWeekday(year, month, weekday, n) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === weekday) { count++; if (count === n) return d; }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}
function lastWeekday(year, month, weekday) {
  const d = new Date(Date.UTC(year, month, 0));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
function shift(date, days) {
  return new Date(date.getTime() + days * 86400000);
}
function isoOf(d) {
  return isoYMD(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
function winOf(d, a, b) {
  return [isoOf(shift(d, a)), isoOf(shift(d, b))];
}
const ANNUAL = [
  { key: 'lanzamiento', emoji: '🎉',
    name: { es: 'el arranque del año', en: 'the New Year kickoff' },
    cats: [],
    angle: { es: 'Arranque del año + Reyes (6/1): la semana 1 del negocio marca el tono del año.', en: 'New Year kickoff: week 1 sets the tone for the year.' },
    window: (y) => [isoYMD(y, 1, 1), isoYMD(y, 1, 6)] },
  { key: 'verano', emoji: '☀️',
    name: { es: 'el verano', en: 'January goals' },
    cats: ['moda', 'indumentaria', 'fitness', 'gimnasio', 'gym', 'belleza', 'estetica', 'gastronom', 'comida'],
    angle: { es: 'Verano: liquidación con dignidad.', en: 'January resolutions: fitness leads.' },
    window: (y) => [isoYMD(y, 1, 7), isoYMD(y, 1, 31)] },
  { key: 'san-valentin', emoji: '💘',
    name: { es: 'San Valentín', en: 'Valentine’s Day' },
    cats: ['gastronom', 'comida', 'restaur', 'belleza', 'estetica', 'floreria', 'regaleria', 'joyeria', 'hoteleria', 'turismo'],
    angle: { es: 'San Valentín (14/2): reservas de a dos, regalos resueltos y experiencias para regalar.', en: 'Valentine’s Day (Feb 14): bookings for two, solved gifts and giftable experiences.' },
    window: (y) => [isoYMD(y, 2, 8), isoYMD(y, 2, 14)] },
  { key: 'vuelta-a-clases', emoji: '🎒',
    name: { es: 'la vuelta a clases', en: 'back to school / spring' },
    cats: ['libreria', 'indumentaria', 'peluquer', 'barber', 'optica', 'educacion', 'idiomas', 'deporte'],
    angle: { es: 'Vuelta a clases: corte escolar, útiles, control visual, actividades de los chicos.', en: 'New season: fresh starts — haircuts, checkups, classes and kids’ activities.' },
    window: (y) => [isoYMD(y, 2, 22), isoYMD(y, 3, 12)] },
  { key: 'dia-mujer', emoji: '💜',
    name: { es: 'el Día de la Mujer', en: 'Women’s Day' },
    cats: ['belleza', 'estetica', 'bienestar', 'spa', 'moda', 'indumentaria', 'gastronom', 'comida', 'floreria'],
    angle: { es: 'Día de la Mujer (8/3): celebración y experiencias; homenaje a clientas, jamás descuento berreta.', en: 'Women’s Day (Mar 8): celebration and experiences; honor your clients, never a cheap discount angle.' },
    window: (y) => [isoYMD(y, 3, 3), isoYMD(y, 3, 8)] },
  { key: 'semana-santa', emoji: '🐣',
    name: { es: 'Semana Santa', en: 'Easter' },
    cats: ['gastronom', 'comida', 'restaur', 'turismo', 'hoteleria', 'retail', 'mascotas', 'pet'],
    angle: { es: 'Semana Santa: menú de vigilia, finde XL, guardería de mascotas para los que viajan.', en: 'Easter weekend: long-weekend plans, travel and pet boarding.' },
    window: (y) => winOf(easterSunday(y), -6, 0) },
  { key: 'hot-sale-ar', emoji: '🛒',
    name: { es: 'Hot Sale', en: 'Hot Sale' },
    cats: ECOM_CATS, paises: ['AR'],
    angle: { es: 'Hot Sale AR: la palabra-dinero es % OFF real + fecha límite + canal (solo web / link en bio) + cuotas si el negocio las ofrece de verdad. La pieza es el producto estrella PUESTO/en uso con tercio limpio para el % — nunca flyer tipográfico puro. Servicios de turnos quedan FUERA salvo pase/pack vendible online declarado en el ADN.', en: 'AR Hot Sale: the money-word is a real % OFF + deadline + channel (online only / link in bio). Star product worn/in use with a clean third for the % — never a pure type flyer.' },
    window: (y) => winOf(nthWeekday(y, 5, 1, 2), -7, 6) },
  { key: 'madre-ar', emoji: '💐',
    name: { es: 'el Día de la Madre', en: 'Mother’s Day' },
    cats: MADRE_CATS, paises: ['AR'],
    angle: { es: 'Día de la Madre AR: la fecha que más vende del año — regalos con el producto estrella del negocio, anticipación y reserva, nunca descuento berreta.', en: 'AR Mother’s Day: the biggest selling date of the year — gifts with the business’s star product, early booking, never a cheap discount angle.' },
    window: (y) => winOf(nthWeekday(y, 10, 0, 3), -7, 0) },
  { key: 'cybermonday-ar', emoji: '🛒',
    name: { es: 'CyberMonday', en: 'Cyber Monday' },
    cats: ECOM_CATS, paises: ['AR'],
    angle: { es: 'CyberMonday AR: la palabra-dinero es % OFF real + fecha límite + canal (solo web / link en bio) + cuotas si el negocio las ofrece de verdad. La pieza es el producto estrella PUESTO/en uso con tercio limpio para el % — nunca flyer tipográfico puro. Servicios de turnos (barbería, fitness, estética de agenda) quedan FUERA salvo pase/pack vendible online declarado en el ADN.', en: 'AR Cyber Monday: the money-word is a real % OFF + deadline + channel (online only / link in bio). Star product worn/in use with a clean third for the % — never a pure type flyer.' },
    window: (y) => winOf(nthWeekday(y, 11, 1, 1), -7, 2) },
  { key: 'black-friday', emoji: '🛍️',
    name: { es: 'Black Friday', en: 'Black Friday' },
    cats: ['retail', 'moda', 'indumentaria', 'ropa', 'belleza', 'estetica', 'peluquer', 'barber', 'gastronom', 'comida', 'restaur', 'cafe', 'fitness', 'gimnasio', 'gym', 'mascotas', 'pet', 'deco', 'hogar', 'muebl', 'electro', 'tecnologia'],
    angle: { es: 'Black Friday: la vidriera y los turnos/pases de diciembre se venden esta semana.', en: 'Black Friday: December bookings and gift cards sell this week.' },
    window: (y) => winOf(lastWeekday(y, 11, 5), -4, 3) },
  { key: 'fiestas', emoji: '🎄',
    name: { es: 'las Fiestas', en: 'the Holidays' },
    cats: ['gastronom', 'comida', 'restaur', 'cafe', 'bar', 'belleza', 'estetica', 'peluquer', 'barber', 'retail', 'moda', 'indumentaria', 'regaleria', 'floreria', 'joyeria', 'mascotas'],
    angle: { es: 'Fiestas: agenda de diciembre, regalos y mesas de fin de año. La escasez solo si es real (turnos contables).', en: 'Holiday season: December bookings, gifts and year-end tables. Scarcity only when real (countable slots).' },
    window: (y) => [isoYMD(y, 12, 7), isoYMD(y, 12, 31)] },
];
// Clave anual que cubre cada entrada fechada (para no duplicar su año).
const DATED_KEY = {
  'hot-sale-ar-2026': 'hot-sale-ar', 'madre-ar-2026': 'madre-ar',
  'cybermonday-ar-2026': 'cybermonday-ar', 'black-friday-2026': 'black-friday',
  'fiestas-2026': 'fiestas', 'lanzamiento-2027': 'lanzamiento',
  'verano-2027': 'verano', 'san-valentin-2027': 'san-valentin',
  'vuelta-a-clases-2027': 'vuelta-a-clases', 'dia-mujer-2027': 'dia-mujer',
  'semana-santa-2027': 'semana-santa',
};

// La campaña activa en `date` (si dos se pisan, la de fecha de cierre más cercana).
// `pais` opcional: filtra las campañas con mercado único.
function activeCampaign(date, pais) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const y = d.getFullYear();
  const covered = new Set();
  for (const c of CAMPAIGNS) {
    const k = DATED_KEY[c.id];
    if (k && new Date(c.start + 'T00:00:00').getFullYear() === y) covered.add(k);
  }
  const hits = CAMPAIGNS.filter((c) => inWindow(c, d) && paisOk(c, pais));
  if (y >= 2027) {
    for (const r of ANNUAL) {
      if (covered.has(r.key)) continue;
      const [start, end] = r.window(y);
      const cand = { id: `${r.key}-${y}`, emoji: r.emoji, name: r.name, start, end, cats: r.cats, angle: r.angle, paises: r.paises };
      if (inWindow(cand, d) && paisOk(cand, pais)) hits.push(cand);
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => new Date(a.end) - new Date(b.end));
  return hits[0];
}

// Payload público para el marco de la prueba (regla de verdad: solo fechas y
// nombres del calendario; pre-lanzamiento el marco es de PRUEBA/lista, nunca
// de operación ya lanzada).
function currentCampaign(date, lang, pais) {
  const c = activeCampaign(date, pais);
  if (!c) return null;
  const en = lang === 'en';
  const L = (o) => (en ? o.en : o.es);
  return {
    id: c.id, emoji: c.emoji, name: L(c.name), frame: L(c.frame),
    until: c.end, prelaunch: (date instanceof Date ? date : new Date(date || Date.now())) < new Date('2027-01-01T00:00:00'),
  };
}

// Línea para el brief de ideas: capa SUGERIDA, pertenencia manda.
function campaignThemeLine(date, category, lang, pais) {
  const c = activeCampaign(date, pais);
  if (!c || !catMatches(c, category)) return '';
  const en = lang === 'en';
  const L = (o) => (en ? o.en : o.es);
  return en
    ? `🗓️ COMMERCIAL CAMPAIGN LAYER (suggestion, belonging rules): ${L(c.name)} window is open. Angle for this trade: ${L(c.angle)} You MAY theme 1–2 ideas around it ONLY with this business's real products/services — if the business doesn't sell for this date, ignore this layer completely.`
    : `🗓️ CAPA DE CAMPAÑA COMERCIAL (sugerencia, manda la pertenencia): está abierta la ventana de ${L(c.name)}. Ángulo para este rubro: ${L(c.angle)} Podés tematizar 1–2 ideas SOLO con productos/servicios reales de este negocio — si el negocio no vende para esta fecha, ignorá esta capa por completo.`;
}

module.exports = { CAMPAIGNS, activeCampaign, currentCampaign, campaignThemeLine, catMatches, ANNUAL };
