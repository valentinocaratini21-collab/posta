// Efemérides: fechas que venden, POR PAÍS (M108, 2026-10-26).
// El generador de ideas mete automáticamente un posteo temático cuando hay
// una cerca (≤12 días). Antes una sola lista para todos: una cuenta UY
// recibía el Día de la Madre en octubre, el Día del Padre en junio y un
// posteo de «orgullo argentino» el 9/7. Ahora:
// - Compartidas AR/UY: Año Nuevo, Reyes, San Valentín, Mujer, Trabajador,
//   Amigo (20/7), Carnaval, Halloween, Nochebuena, Navidad, Fin de año,
//   Black Friday (último viernes de noviembre).
// - Madre: AR 3er domingo de octubre; UY 2º domingo de mayo.
// - Padre: AR 3er domingo de junio; UY 2º domingo de julio.
// - Niño: coincide, 3er domingo de agosto.
// - Independencia: AR 9/7; UY 25/8. UY NO recibe el 9/7.
// - Solo AR: Primavera/Estudiante (21/9), Hot Sale, CyberMonday (CACE).
// - UY NO recibe CyberMonday CACE ni Hot Sale: el calendario e-commerce
//   uruguayo propio no está sourciado — se omite, no se inventa.
// Sin país explícito, el comportamiento es el histórico (AR).
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
function isoYMD(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function normPais(pais) {
  const p = String(pais || '').toUpperCase();
  return (p === 'UY' || p === 'UYU') ? 'UY' : 'AR';
}

const EASTER = { 2026: [4, 5], 2027: [3, 28], 2028: [4, 16], 2029: [4, 1], 2030: [4, 21] };

// Entradas fijas compartidas por AR y UY (mes, día, resto igual que antes).
const FIXED_SHARED = [
  { m: 1, d: 1, name: 'Año Nuevo', emoji: '🎆', angle: 'saludo de año nuevo + lo que se viene en el negocio' },
  { m: 1, d: 6, name: 'Día de Reyes', emoji: '👑', angle: 'última oportunidad de regalos' },
  { m: 2, d: 14, name: 'San Valentín', emoji: '💘', angle: 'promo o contenido romántico según el rubro' },
  { m: 3, d: 8, name: 'Día de la Mujer', emoji: '💜', angle: 'homenaje y protagonismo femenino del negocio' },
  { m: 5, d: 1, name: 'Día del Trabajador', emoji: '🛠️', angle: 'saludo + el trabajo que hay detrás del negocio' },
  // Día del Amigo: fecha enorme para gastronomía/bares (M108 corrección 6).
  { m: 7, d: 20, name: 'Día del Amigo', emoji: '🧉', angle: 'promo para compartir: mesas, grupos, regalos entre amigos', cats: 'gastro|bar|cafeter|caf|rest|pizzer|helad|pastel|panad' },
  { m: 10, d: 31, name: 'Halloween', emoji: '🎃', angle: 'contenido divertido y temático', cats: 'pastel|panad|chocolat|gastro|helad|maquill|makeup|disfraz|cotill' },
  { m: 12, d: 24, name: 'Nochebuena', emoji: '🎄', angle: 'saludo cálido + horarios de las fiestas' },
  { m: 12, d: 25, name: 'Navidad', emoji: '🎄', angle: 'saludo navideño del equipo' },
  { m: 12, d: 31, name: 'Fin de año', emoji: '🥂', angle: 'balance del año y gracias a los clientes' },
];

// Conjunto e-commerce (el mismo de CyberMonday): rubros que venden online.
const ECOM_CATS = 'retail|moda|indumentaria|ropa|deco|hogar|muebl|joyeria|electro|tecnologia|mascotas|pet|belleza|estetica';

function allForYear(year, pais) {
  const uy = normPais(pais) === 'UY';
  const out = FIXED_SHARED.map(e => ({ ...e, date: isoYMD(year, e.m, e.d) }));
  const ea = EASTER[year];
  if (ea) {
    out.push({ name: 'Pascuas', emoji: '🐣', angle: 'promo de pascuas / huevos / finde largo', date: isoYMD(year, ea[0], ea[1]) });
    // Carnaval: lunes y martes previos al Miércoles de Ceniza = Pascua −48/−47 días.
    // 2026: 16–17/2; 2027: 8–9/2 (verificado contra el cronograma oficial).
    const pascua = new Date(Date.UTC(year, ea[0] - 1, ea[1]));
    const lun = new Date(pascua.getTime() - 48 * 86400000);
    const mar = new Date(pascua.getTime() - 47 * 86400000);
    out.push({ name: 'Carnaval', emoji: '🎭', angle: 'finde XXL: turismo, gastronomía y escapadas', date: iso(lun) });
    out.push({ name: 'Carnaval', emoji: '🎭', angle: 'finde XXL: turismo, gastronomía y escapadas', date: iso(mar) });
  }
  const pushNth = (month, n, name, emoji, angle, cats) => {
    const d = nthWeekdayOfMonth(year, month, 0, n);
    if (d) out.push({ name, emoji, angle, ...(cats ? { cats } : {}), date: iso(d) });
  };
  if (uy) {
    pushNth(5, 2, 'Día de la Madre', '💐', 'promo de regalos para mamá (la fecha que más vende del año)');
    pushNth(7, 2, 'Día del Padre', '👔', 'promo de regalos para papá');
    out.push({ m: 8, d: 25, name: 'Día de la Independencia', emoji: '🇺🇾', angle: 'orgullo uruguayo del negocio', date: isoYMD(year, 8, 25) });
  } else {
    pushNth(6, 3, 'Día del Padre', '👔', 'promo de regalos para papá');
    pushNth(10, 3, 'Día de la Madre', '💐', 'promo de regalos para mamá (la fecha que más vende del año)');
    out.push({ m: 7, d: 9, name: 'Día de la Independencia', emoji: '🇦🇷', angle: 'orgullo argentino del negocio', date: isoYMD(year, 7, 9) });
    out.push({ m: 9, d: 21, name: 'Día de la Primavera', emoji: '🌸', angle: 'contenido joven: estudiantes, aire libre, nueva temporada', date: isoYMD(year, 9, 21) });
    // Hot Sale AR (M108 corrección 2): 2º lunes de mayo. Patrón CACE
    // 2025 (12–14/5) y 2026 (11–13/5, + Hot Week 14–17/5): CACE publica las
    // fechas oficiales cada año — re-verificar cuando se publiquen.
    const hs = nthWeekdayOfMonth(year, 5, 1, 2);
    if (hs) out.push({ name: 'Hot Sale', emoji: '🛒', angle: 'Hot Sale: descuentos online con fecha límite', cats: ECOM_CATS, date: iso(hs) });
    // CyberMonday AR: 1er lunes de noviembre (regla, no fecha fija: el 2/11
    // fijo era correcto en 2026 pero no en 2027, que cae 1/11). El ángulo
    // lleva la ventana real del año: 2026 = 2–4/11, idéntico al anterior.
    const cm = nthWeekdayOfMonth(year, 11, 1, 1);
    if (cm) {
      const fin = new Date(cm.getTime() + 2 * 86400000);
      out.push({ name: 'CyberMonday', emoji: '🛒', angle: `descuentos online con fecha límite (${cm.getUTCDate()}–${fin.getUTCDate()}/11)`, cats: ECOM_CATS, date: iso(cm) });
    }
  }
  pushNth(8, 3, 'Día del Niño', '🧸', 'promo / contenido para chicos');
  const bf = lastWeekdayOfMonth(year, 11, 5);
  out.push({ name: 'Black Friday', emoji: '🏷️', angle: 'la promo más agresiva del año', date: iso(bf) });
  return out;
}

// Próximas efemérides dentro de `days` días (por defecto 12), ordenadas.
// `pais` opcional: 'UY' → tabla uruguaya; cualquier otro → argentina.
function upcomingEphemeris(days = 12, pais) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(today.getTime() + days * 86400000);
  const years = [today.getUTCFullYear(), end.getUTCFullYear()];
  const seen = new Set();
  const out = [];
  for (const y of years) {
    for (const e of allForYear(y, pais)) {
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

module.exports = { upcomingEphemeris, catsMatch, allForYear };
