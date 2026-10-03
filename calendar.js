// Calendario inteligente (2026-10-03, funcionalidad 4).
// Efemérides argentinas/latam + fechas comerciales globales.
// Posty sugiere contenido relevante automáticamente.

const EFEMERIDES = [
  // [mes, día, título, ángulo, rubros relevantes (vacío = todos)]
  [1, 1, 'Año Nuevo', 'Empezar el año con tu negocio', []],
  [2, 14, 'San Valentín', 'Promo para parejas o auto-regalo', ['moda', 'belleza', 'gastronomia', 'regalos']],
  [3, 8, 'Día de la Mujer', 'Homenaje y promo especial', []],
  [3, 24, 'Día de la Memoria', 'Contenido reflexivo (no comercial)', []],
  [4, 2, 'Día del Veterano', 'Contenido institucional', []],
  [5, 1, 'Día del Trabajador', 'Agradecer al equipo / promo', []],
  [5, 25, 'Revolución de Mayo', 'Contenido patrio argentino', []],
  [6, 15, 'Día del Padre', 'Promo día del padre (3er domingo)', ['moda', 'tecnologia', 'regalos', 'deportes']],
  [6, 20, 'Día de la Bandera', 'Contenido patrio', []],
  [7, 9, 'Día de la Independencia', 'Promo patria', []],
  [8, 17, 'Día del Niño', 'Promo día del niño (3er domingo)', ['juguetes', 'moda', 'regalos']],
  [9, 11, 'Día del Maestro', 'Agradecimiento', ['educacion']],
  [10, 12, 'Día de la Diversidad', 'Contenido reflexivo', []],
  [10, 31, 'Halloween', 'Promo Halloween, contenido divertido', ['moda', 'belleza', 'gastronomia', 'fiestas']],
  [11, 20, 'Día de la Soberanía', 'Contenido patrio', []],
  [12, 8, 'Día de la Virgen', 'Feriado, contenido liviano', []],
  [12, 24, 'Nochebuena', 'Saludo navideño', []],
  [12, 25, 'Navidad', 'Promo navideña', []],
  [12, 31, 'Fin de Año', 'Balance del año, agradecimiento', []],
  // Comerciales globales
  [11, 28, 'Black Friday', 'Las mejores ofertas del año', []],
  [12, 1, 'Cyber Monday', 'Ofertas online', ['tecnologia', 'moda', 'ecommerce']],
];

/**
 * getUpcoming(days=14): efemérides en los próximos N días.
 * Devuelve [{ date, title, angle, rubros }]
 */
function getUpcoming(days = 14) {
  const now = new Date();
  const result = [];
  for (let d = 0; d < days; d++) {
    const dt = new Date(now.getTime() + d * 86400000);
    const m = dt.getMonth() + 1, day = dt.getDate();
    for (const [em, ed, title, angle, rubros] of EFEMERIDES) {
      if (em === m && ed === day) {
        result.push({
          date: dt.toISOString().slice(0, 10),
          days_ahead: d,
          title, angle, rubros,
        });
      }
    }
  }
  return result;
}

/**
 * getRelevant(category, days=14): filtra por rubro.
 */
function getRelevant(category, days = 14) {
  const cat = String(category || '').toLowerCase();
  return getUpcoming(days).filter(e =>
    e.rubros.length === 0 || e.rubros.some(r => cat.includes(r))
  );
}

module.exports = { getUpcoming, getRelevant, EFEMERIDES };
