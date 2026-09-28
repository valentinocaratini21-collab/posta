// Rachas — semanas consecutivas en las que el negocio armó su semana con Posta.
// La semana se cuenta de lunes a domingo en la zona horaria del negocio.
// Regla: POST /api/streak/week-armed se llama cuando runAutopilot termina bien.
// Idempotente por semana: armar dos veces la misma semana no suma doble.
'use strict';

// Escalera de niveles (semanas consecutivas)
const STREAK_LEVELS = [
  { min: 1, max: 3, emoji: '🌱', name: 'Semilla' },
  { min: 4, max: 7, emoji: '🔥', name: 'Fuego' },
  { min: 8, max: 11, emoji: '⚡', name: 'Rayo' },
  { min: 12, max: 25, emoji: '🚀', name: 'Despegue' },
  { min: 26, max: 51, emoji: '💎', name: 'Diamante' },
  { min: 52, max: Number.MAX_SAFE_INTEGER, emoji: '👑', name: 'Leyenda' },
];

function streakLevel(weeks) {
  if (!weeks || weeks < 1) return null;
  return STREAK_LEVELS.find((l) => weeks >= l.min && weeks <= l.max) || null;
}

function streakNextLevel(weeks) {
  const cur = streakLevel(weeks);
  if (!cur) return STREAK_LEVELS[0];
  const i = STREAK_LEVELS.indexOf(cur);
  return STREAK_LEVELS[i + 1] || null;
}

// Helpers de fecha (duplicados mínimos para no acoplar con server.js)
function tzToday(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch { return new Date().toISOString().slice(0, 10); }
}
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function shiftDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function daysLeftInWeek(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = (dt.getUTCDay() + 6) % 7; // 0 = lunes
  return 6 - wd; // lunes → 6, domingo → 0
}

// Registra la semana armada. weekKey = 'YYYY-MM-DD' del lunes.
function recordWeekArmed(db, userId, weekKey) {
  let s = db.prepare('SELECT * FROM streaks WHERE user_id = ?').get(userId);
  if (!s) {
    db.prepare('INSERT INTO streaks (user_id, current, best, last_week, started_at) VALUES (?, 0, 0, ?, 0)').run(userId, '');
    s = { user_id: userId, current: 0, best: 0, last_week: '', started_at: 0 };
  }
  if (s.last_week === weekKey) {
    return { ...publicStreak(db, userId, weekKey), newWeek: false, leveledUp: false };
  }
  const continued = s.last_week === shiftDays(weekKey, -7) && (s.current || 0) > 0;
  const current = continued ? s.current + 1 : 1;
  const startedAt = continued ? (s.started_at || Date.now()) : Date.now();
  const best = Math.max(s.best || 0, current);
  const before = streakLevel(s.current || 0);
  const after = streakLevel(current);
  // Subir de nivel = pasar de un nivel con nombre a otro (la 1ra semana no es "subir")
  const leveledUp = !!before && !!after && before.name !== after.name;
  db.prepare('UPDATE streaks SET current = ?, best = ?, last_week = ?, started_at = ? WHERE user_id = ?')
    .run(current, best, weekKey, startedAt, userId);
  return { ...publicStreak(db, userId, weekKey), newWeek: true, leveledUp };
}

// Estado público de la racha para el frontend y los emails.
function publicStreak(db, userId, weekKey, todayYmd) {
  const s = db.prepare('SELECT * FROM streaks WHERE user_id = ?').get(userId)
    || { current: 0, best: 0, last_week: '', started_at: 0 };
  const current = s.current || 0;
  const level = streakLevel(current);
  const next = streakNextLevel(current);
  const weekArmed = s.last_week === weekKey;
  const daysLeft = todayYmd ? daysLeftInWeek(todayYmd) : null;
  return {
    current,
    best: s.best || 0,
    level: level ? { emoji: level.emoji, name: level.name } : null,
    nextLevel: next ? { emoji: next.emoji, name: next.name, at: next.min } : null,
    weekArmed,
    daysLeft,
    expiringSoon: current > 0 && !weekArmed && daysLeft !== null && daysLeft <= 2,
    startedAt: s.started_at || 0,
  };
}

// Prueba social anónima: cuántos OTROS negocios tienen racha viva de 15+ días.
// Solo se muestra con masa crítica (minCount). Nunca expone nombres ni datos.
function socialProof(db, { excludeUserId, thisMon, prevMon, minDays = 15, minCount = 3 }) {
  const now = Date.now();
  const rows = db.prepare('SELECT user_id, current, last_week, started_at FROM streaks WHERE current > 0').all();
  let n = 0;
  for (const r of rows) {
    if (r.user_id === excludeUserId) continue;
    if (r.last_week !== thisMon && r.last_week !== prevMon) continue; // racha muerta
    if (now - (r.started_at || 0) < minDays * 864e5) continue;
    n++;
  }
  return n >= minCount ? { shown: true, count: n } : { shown: false, count: 0 };
}

module.exports = {
  STREAK_LEVELS, streakLevel, streakNextLevel,
  tzToday, mondayKeyOf, shiftDays, daysLeftInWeek,
  recordWeekArmed, publicStreak, socialProof,
};
