// Efemérides: fechas que venden (AR/UY/Latam). El generador de ideas mete
// automáticamente un posteo temático cuando hay una cerca (≤12 días).
function nthWeekdayOfMonth(year, month, weekday, n) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === weekday) { count++; if (count === n) return d; }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}
function lastWeekdayOfMonth(year, month, weekday) {
  const d = new Date(Date.UTC(year, month, 0));
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
function iso(d) { return d.toISOString().slice(0, 10); }

const FIXED = [
  { m: 1, d: 1, name: 'Año Nuevo', emoji: '🎆', angle: 'saludo de año nuevo + lo que se viene en el negocio' },
  { m: 1, d: 6, name: 'Día de Reyes', emoji: '👑', angle: 'última oportunidad de regalos' },
  { m: 2, d: 14, name: 'San Valentín', emoji: '💘', angle: 'promo o contenido romántico según el rubro' },
  { m: 3, d: 8, name: 'Día de la Mujer', emoji: '💜', angle: 'homenaje y protagonismo femenino del negocio' },
  { m: 5, d: 1, name: 'Día del Trabajador', emoji: '🛠️', angle: 'saludo + el trabajo que hay detrás del negocio' },
  { m: 7, d: 9, name: 'Día de la Independencia', emoji: '🇦🇷', angle: 'orgullo argentino del negocio' },
  { m: 10, d: 31, name: 'Halloween', emoji: '🎃', angle: 'contenido divertido y temático', cats: 'pastel|panad|chocolat|gastro|helad|maquill|makeup|disfraz|cotill' },
  { m: 11, d: 2, name: 'CyberMonday', emoji: '🛒', angle: 'descuentos online con fecha límite (2–4/11)', cats: 'retail|moda|indumentaria|ropa|deco|hogar|muebl|joyeria|electro|tecnologia|mascotas|pet|belleza|estetica' },
  { m: 12, d: 24, name: 'Nochebuena', emoji: '🎄', angle: 'saludo cálido + horarios de las fiestas' },
  { m: 12, d: 25, name: 'Navidad', emoji: '🎄', angle: 'saludo navideño del equipo' },
  { m: 12, d: 31, name: 'Fin de año', emoji: '🥂', angle: 'balance del año y gracias a los clientes' },
];
const EASTER = { 2026: [4, 5], 2027: [3, 28], 2028: [4, 16], 2029: [4, 1], 2030: [4, 21] };

function allForYear(year) {
  const out = FIXED.map(e => ({ ...e, date: `${year}-${String(e.m).padStart(2, '0')}-${String(e.d).padStart(2, '0')}` }));
  const ea = EASTER[year];
  if (ea) out.push({ name: 'Pascuas', emoji: '🐣', angle: 'promo de pascuas / huevos / finde largo', date: `${year}-${String(ea[0]).padStart(2, '0')}-${String(ea[1]).padStart(2, '0')}` });
  const pushNth = (month, n, name, emoji, angle) => {
    const d = nthWeekdayOfMonth(year, month, 0, n);
    if (d) out.push({ name, emoji, angle, date: iso(d) });
  };
  pushNth(6, 3, 'Día del Padre', '👔', 'promo de regalos para papá');
  pushNth(8, 3, 'Día del Niño', '🧸', 'promo / contenido para chicos');
  pushNth(10, 3, 'Día de la Madre', '💐', 'promo de regalos para mamá (la fecha que más vende del año)');
  const bf = lastWeekdayOfMonth(year, 11, 5);
  out.push({ name: 'Black Friday', emoji: '🏷️', angle: 'la promo más agresiva del año', date: iso(bf) });
  return out;
}

// Próximas efemérides dentro de `days` días (por defecto 12), ordenadas.
function upcomingEphemeris(days = 12) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(today.getTime() + days * 86400000);
  const years = [today.getUTCFullYear(), end.getUTCFullYear()];
  const seen = new Set();
  const out = [];
  for (const y of years) {
    for (const e of allForYear(y)) {
      if (seen.has(e.date)) continue;
      seen.add(e.date);
      const d = new Date(e.date + 'T00:00:00Z');
      if (d >= today && d <= end) {
        out.push({ ...e, daysLeft: Math.round((d - today) / 86400000) });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Lista propia por fecha: si la efeméride trae `cats` (regex de fragmentos),
// decide si el texto del negocio (categoría + nombre + descripción) pertenece
// a esa fecha. Sin `cats` no hay opinión por fecha (null) y manda el criterio
// general del consumidor.
function catsMatch(eph, text) {
  if (eph && eph.cats) return new RegExp(eph.cats, 'i').test(String(text || ''));
  return null;
}

module.exports = { upcomingEphemeris, catsMatch };
