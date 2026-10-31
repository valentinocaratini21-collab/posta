// Calendario inteligente (2026-10-03, funcionalidad 4; M108 2026-10-26).
// Efemérides POR PAÍS. Antes el selector era por idioma: lang 'en' → US y
// cualquier otro → AR, así que una cuenta uruguaya veía los feriados
// patrios argentinos. Ahora manda el país: 'AR' (tabla argentina), 'UY'
// (tabla uruguaya) o 'US' (tabla estadounidense). Sin país explícito, el
// comportamiento histórico: lang 'en' → US, si no AR.
//
// Formato de entrada: tupla fija [mes, día, título, ángulo, rubros] o regla
// { rule, title, angle, rubros } donde rule(año) devuelve { m, d } o una
// lista de { m, d } (Carnaval devuelve dos días). Las fechas fijas erróneas
// viejas (Padre 15/6, Niño 17/8, Black Friday 28/11, Cyber Monday 1/12 en
// AR) pasaron a reglas o se eliminaron: el 15/6 no es el Día del Padre
// ningún año, el 17/8 es el día después del Día del Niño (y San Martín),
// el 28/11/2026 es sábado, y un Cyber Monday el 1/12 no existe en ningún
// mercado. Halloween queda con el criterio acotado de ephemeris (M108
// corrección 7): gastronomía, belleza y fiestas — ya no moda amplia.

function nthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (d.getMonth() === month - 1) {
    if (d.getDay() === weekday) { count++; if (count === n) return { m: month, d: d.getDate() }; }
    d.setDate(d.getDate() + 1);
  }
  return null;
}
function lastWeekdayOfMonth(year, month, weekday) {
  const d = new Date(year, month, 0);
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return { m: month, d: d.getDate() };
}
// Pascua gregoriana por Computus (verificado: 2026 → 5/4, 2027 → 28/3,
// igual que la tabla de ephemeris hasta 2030, pero sin horizonte).
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
  return { m: month, d: day };
}
// Carnaval: lunes y martes antes del Miércoles de Ceniza (Pascua −48/−47).
// 2026: 16–17/2; 2027: 8–9/2.
function carnaval(year) {
  const e = easterSunday(year);
  const eas = new Date(year, e.m - 1, e.d);
  const lun = new Date(eas.getTime() - 48 * 86400000);
  const mar = new Date(eas.getTime() - 47 * 86400000);
  return [{ m: lun.getMonth() + 1, d: lun.getDate() }, { m: mar.getMonth() + 1, d: mar.getDate() }];
}

const HALLOWEEN_RUBROS = ['gastronomia', 'belleza', 'fiestas'];
const AMIGO_RUBROS = ['gastronomia', 'bar', 'cafeteria', 'restaur'];
const CARNAVAL_RUBROS = ['gastronomia', 'turismo', 'hoteleria', 'fiestas'];

// Tabla AR. Rubros: vacío = todos.
const EFEMERIDES = [
  [1, 1, 'Año Nuevo', 'Empezar el año con tu negocio', []],
  [2, 14, 'San Valentín', 'Promo para parejas o auto-regalo', ['moda', 'belleza', 'gastronomia', 'regalos']],
  { rule: carnaval, title: 'Carnaval', angle: 'Finde XXL: turismo y gastronomía', rubros: CARNAVAL_RUBROS },
  [3, 8, 'Día de la Mujer', 'Homenaje y promo especial', []],
  [3, 24, 'Día de la Memoria', 'Contenido reflexivo (no comercial)', []],
  [4, 2, 'Día del Veterano', 'Contenido institucional', []],
  [5, 1, 'Día del Trabajador', 'Agradecer al equipo / promo', []],
  [5, 25, 'Revolución de Mayo', 'Contenido patrio argentino', []],
  { rule: (y) => nthWeekdayOfMonth(y, 6, 0, 3), title: 'Día del Padre', angle: 'Promo día del padre (3er domingo)', rubros: ['moda', 'tecnologia', 'regalos', 'deportes'] },
  [6, 20, 'Día de la Bandera', 'Contenido patrio', []],
  [7, 9, 'Día de la Independencia', 'Promo patria', []],
  [7, 20, 'Día del Amigo', 'Promo para compartir: mesas y grupos', AMIGO_RUBROS],
  { rule: (y) => nthWeekdayOfMonth(y, 8, 0, 3), title: 'Día del Niño', angle: 'Promo día del niño (3er domingo)', rubros: ['juguetes', 'moda', 'regalos'] },
  [9, 11, 'Día del Maestro', 'Agradecimiento', ['educacion']],
  [9, 21, 'Día de la Primavera', 'Contenido joven: estudiantes y aire libre', ['educacion', 'moda', 'gastronomia']],
  [10, 12, 'Día de la Diversidad', 'Contenido reflexivo', []],
  [10, 31, 'Halloween', 'Promo Halloween, contenido divertido', HALLOWEEN_RUBROS],
  [11, 20, 'Día de la Soberanía', 'Contenido patrio', []],
  { rule: (y) => lastWeekdayOfMonth(y, 11, 5), title: 'Black Friday', angle: 'Las mejores ofertas del año', rubros: [] },
  [12, 8, 'Día de la Virgen', 'Feriado, contenido liviano', []],
  [12, 24, 'Nochebuena', 'Saludo navideño', []],
  [12, 25, 'Navidad', 'Promo navideña', []],
  [12, 31, 'Fin de Año', 'Balance del año, agradecimiento', []],
  // Sin Cyber Monday: el 1/12 fijo anterior no existe en ningún mercado.
];

// Tabla UY (M108 corrección 5): feriados propios + fechas comerciales.
// Madre 2º domingo de mayo, Padre 2º domingo de julio, Independencia 25/8.
// NO lleva feriados patrios AR (24/3, 2/4, 25/5, 20/6, 12/10, 20/11, 8/12),
// ni 9/7, ni Cyber Monday (el e-commerce uruguayo propio no está sourciado:
// se omite, no se inventa), ni Primavera (sin equivalente fuerte).
const EFEMERIDES_UY = [
  [1, 1, 'Año Nuevo', 'Empezar el año con tu negocio', []],
  [1, 6, 'Día de Reyes', 'Última oportunidad de regalos', []],
  [2, 14, 'San Valentín', 'Promo para parejas o auto-regalo', ['moda', 'belleza', 'gastronomia', 'regalos']],
  { rule: carnaval, title: 'Carnaval', angle: 'Finde XXL: turismo y gastronomía', rubros: CARNAVAL_RUBROS },
  [3, 8, 'Día de la Mujer', 'Homenaje y promo especial', []],
  [5, 1, 'Día del Trabajador', 'Agradecer al equipo / promo', []],
  { rule: (y) => nthWeekdayOfMonth(y, 5, 0, 2), title: 'Día de la Madre', angle: 'Promo día de la madre (2º domingo)', rubros: ['moda', 'belleza', 'flores', 'joyeria', 'gastronomia'] },
  [5, 18, 'Batalla de las Piedras', 'Contenido institucional', []],
  [6, 19, 'Natalicio de Artigas', 'Contenido institucional', []],
  { rule: (y) => nthWeekdayOfMonth(y, 7, 0, 2), title: 'Día del Padre', angle: 'Promo día del padre (2º domingo)', rubros: ['moda', 'tecnologia', 'regalos', 'deportes'] },
  [7, 18, 'Jura de la Constitución', 'Contenido institucional', []],
  [7, 20, 'Día del Amigo', 'Promo para compartir: mesas y grupos', AMIGO_RUBROS],
  { rule: (y) => nthWeekdayOfMonth(y, 8, 0, 3), title: 'Día del Niño', angle: 'Promo día del niño (3er domingo)', rubros: ['juguetes', 'moda', 'regalos'] },
  [8, 25, 'Día de la Independencia', 'Promo patria', []],
  [10, 31, 'Halloween', 'Promo Halloween, contenido divertido', HALLOWEEN_RUBROS],
  [11, 2, 'Día de los Difuntos', 'Contenido respetuoso (no comercial)', []],
  { rule: (y) => lastWeekdayOfMonth(y, 11, 5), title: 'Black Friday', angle: 'Las mejores ofertas del año', rubros: [] },
  [12, 24, 'Nochebuena', 'Saludo navideño', []],
  [12, 25, 'Navidad', 'Promo navideña', []],
  [12, 31, 'Fin de Año', 'Balance del año, agradecimiento', []],
];

// (v274 · MODO EN, M108 corrección 9) Calendario US POR REGLAS. Antes eran
// fechas fijas calibradas a 2026 y derivaban casi todas en 2027 (Pascua
// 5/4 en vez de 28/3, Mother's Day 10/5 en vez de 9/5, Memorial 25/5 en vez
// de 31/5, etc.). Los valores 2026 de las reglas coinciden con los fijos
// viejos, así que 2026 no cambia y 2027 queda correcto.
const EFEMERIDES_US = [
  [1, 1, "New Year's Day", 'Start the year with your business', []],
  { rule: (y) => nthWeekdayOfMonth(y, 1, 1, 3), title: 'Martin Luther King Jr. Day', angle: 'Reflective, community-minded content', rubros: [] },
  [2, 14, "Valentine's Day", 'Promo for couples or self-gifting', ['moda', 'belleza', 'gastronomia', 'flores', 'joyeria']],
  { rule: (y) => nthWeekdayOfMonth(y, 2, 1, 3), title: "Presidents' Day", angle: 'Weekend sales promo', rubros: [] },
  [3, 17, "St. Patrick's Day", 'Fun green-themed content and promos', ['bar', 'cafeteria', 'gastronomia']],
  { rule: (y) => easterSunday(y), title: 'Easter', angle: 'Family promo and spring content', rubros: [] },
  [5, 5, 'Cinco de Mayo', 'Fiesta-themed promo', ['gastronomia', 'bar']],
  { rule: (y) => nthWeekdayOfMonth(y, 5, 0, 2), title: "Mother's Day", angle: "Promo for mom (2nd Sunday of May)", rubros: ['moda', 'belleza', 'flores', 'joyeria', 'gastronomia'] },
  { rule: (y) => lastWeekdayOfMonth(y, 5, 1), title: 'Memorial Day', angle: 'Weekend sales, respectful tone', rubros: [] },
  { rule: (y) => nthWeekdayOfMonth(y, 6, 0, 3), title: "Father's Day", angle: "Promo for dad (3rd Sunday of June)", rubros: ['moda', 'tecnologia', 'autos', 'barberia'] },
  [7, 4, 'Independence Day', 'Patriotic promo and summer content', []],
  { rule: (y) => nthWeekdayOfMonth(y, 9, 1, 1), title: 'Labor Day', angle: 'End-of-summer sales', rubros: [] },
  [10, 31, 'Halloween', 'Halloween promo, fun content', ['moda', 'belleza', 'gastronomia', 'eventos']],
  [11, 11, 'Veterans Day', 'Institutional, thankful content', []],
  { rule: (y) => nthWeekdayOfMonth(y, 11, 4, 4), title: 'Thanksgiving', angle: 'Gratitude post, no hard selling', rubros: [] },
  { rule: (y) => nthWeekdayOfMonth(y, 11, 5, 4), title: 'Black Friday', angle: 'The biggest offers of the year', rubros: [] },
  { rule: (y) => nthWeekdayOfMonth(y, 11, 6, 4), title: 'Small Business Saturday', angle: 'Shop local: the day of local businesses', rubros: [] },
  { rule: (y) => { const th = nthWeekdayOfMonth(y, 11, 4, 4); return th ? { m: 11, d: th.d + 4 } : null; }, title: 'Cyber Monday', angle: 'Online offers', rubros: ['tecnologia', 'moda'] },
  [12, 24, 'Christmas Eve', 'Holiday greeting', []],
  [12, 25, 'Christmas', 'Holiday promo', []],
  [12, 31, "New Year's Eve", 'Year recap and thanks', []],
];

function normPais(pais) {
  const p = String(pais || '').toUpperCase();
  if (p === 'UY' || p === 'UYU') return 'UY';
  if (p === 'US') return 'US';
  if (p === 'AR') return 'AR';
  return null;
}
function tableFor(pais, lang) {
  const p = normPais(pais);
  if (p === 'UY') return EFEMERIDES_UY;
  if (p === 'US') return EFEMERIDES_US;
  if (p === 'AR') return EFEMERIDES;
  return lang === 'en' ? EFEMERIDES_US : EFEMERIDES;
}

// Entradas resueltas de un año: [{ date, title, angle, rubros }].
// Determinista: la usan los tests; getUpcoming la usa para la ventana.
function entriesForYear(year, pais, lang) {
  const LIST = tableFor(pais, lang);
  const out = [];
  for (const e of LIST) {
    if (Array.isArray(e)) {
      const [em, ed, title, angle, rubros] = e;
      out.push({ date: `${year}-${String(em).padStart(2, '0')}-${String(ed).padStart(2, '0')}`, title, angle, rubros });
    } else {
      const r = e.rule(year);
      const days = Array.isArray(r) ? r : (r ? [r] : []);
      for (const d of days) {
        out.push({ date: `${year}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`, title: e.title, angle: e.angle, rubros: e.rubros });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * getUpcoming(days=14, lang, pais): efemérides en los próximos N días.
 * `pais` explícito manda ('AR'/'UY'/'US'); si no, lang 'en' → US, si no AR.
 * Devuelve [{ date, days_ahead, title, angle, rubros }]
 */
function getUpcoming(days = 14, lang, pais) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + days * 86400000);
  const years = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) years.push(y);
  const byDate = new Map();
  for (const y of years) {
    for (const e of entriesForYear(y, pais, lang)) {
      if (!byDate.has(e.date)) byDate.set(e.date, []);
      byDate.get(e.date).push(e);
    }
  }
  const result = [];
  for (let d = 0; d < days; d++) {
    const dt = new Date(start.getTime() + d * 86400000);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    for (const e of (byDate.get(key) || [])) {
      result.push({ date: key, days_ahead: d, title: e.title, angle: e.angle, rubros: e.rubros });
    }
  }
  return result;
}

/**
 * getRelevant(category, days=14, lang, pais): filtra por rubro.
 */
function getRelevant(category, days = 14, lang, pais) {
  const cat = String(category || '').toLowerCase();
  return getUpcoming(days, lang, pais).filter(e =>
    e.rubros.length === 0 || e.rubros.some(r => cat.includes(r))
  );
}

module.exports = { getUpcoming, getRelevant, EFEMERIDES, EFEMERIDES_US, EFEMERIDES_UY, entriesForYear, easterSunday };
