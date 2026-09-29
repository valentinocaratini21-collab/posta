// Rachas — semanas consecutivas en las que el negocio armó su semana con Posta.
// La semana se cuenta de lunes a domingo en la zona horaria del negocio.
// Regla: POST /api/streak/week-armed se llama cuando runAutopilot termina bien.
// Idempotente por semana: armar dos veces la misma semana no suma doble.
//
// VENCIMIENTO 72H: la racha se apaga si pasan 72 horas sin que salga ningún
// posteo. Lo único que la alimenta es una publicación (feedStreak); armar la
// semana sola no alcanza. fed_at = última publicación (o inicio de la racha,
// como gracia para la primera publicación).
'use strict';

// 72 horas en ms: tiempo máximo sin publicar antes de que la racha se apague
const STREAK_TTL_MS = 72 * 3600 * 1000;

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
  const now = Date.now();
  let s = db.prepare('SELECT * FROM streaks WHERE user_id = ?').get(userId);
  if (!s) {
    db.prepare('INSERT INTO streaks (user_id, current, best, last_week, started_at, fed_at) VALUES (?, 0, 0, ?, 0, ?)').run(userId, '', now);
    s = { user_id: userId, current: 0, best: 0, last_week: '', started_at: 0, fed_at: now };
  }
  if (s.last_week === weekKey) {
    return { ...publicStreak(db, userId, weekKey), newWeek: false, leveledUp: false };
  }
  const continued = s.last_week === shiftDays(weekKey, -7) && (s.current || 0) > 0;
  const current = continued ? s.current + 1 : 1;
  const startedAt = continued ? (s.started_at || now) : now;
  const best = Math.max(s.best || 0, current);
  const before = streakLevel(s.current || 0);
  const after = streakLevel(current);
  // Subir de nivel = pasar de un nivel con nombre a otro (la 1ra semana no es "subir")
  const leveledUp = !!before && !!after && before.name !== after.name;
  if (continued) {
    db.prepare('UPDATE streaks SET current = ?, best = ?, last_week = ?, started_at = ? WHERE user_id = ?')
      .run(current, best, weekKey, startedAt, userId);
  } else {
    // Racha nueva o reiniciada: 72h de gracia desde acá para la primera publicación
    db.prepare('UPDATE streaks SET current = ?, best = ?, last_week = ?, started_at = ?, fed_at = ? WHERE user_id = ?')
      .run(current, best, weekKey, startedAt, now, userId);
  }
  return { ...publicStreak(db, userId, weekKey), newWeek: true, leveledUp };
}

// Alimenta la racha: llamar en cada publicación exitosa (manual o automática).
function feedStreak(db, userId) {
  try { db.prepare('UPDATE streaks SET fed_at = ? WHERE user_id = ?').run(Date.now(), userId); } catch (e) {}
}

// Estado público de la racha para el frontend y los emails.
function publicStreak(db, userId, weekKey, todayYmd) {
  const s = db.prepare('SELECT * FROM streaks WHERE user_id = ?').get(userId)
    || { current: 0, best: 0, last_week: '', started_at: 0, fed_at: 0 };
  const now = Date.now();
  let current = s.current || 0;
  const fedAt = s.fed_at || 0;
  // Vencimiento 72h: racha viva pero sin publicaciones en 72h → se apaga (se persiste)
  if (current > 0 && fedAt > 0 && now - fedAt > STREAK_TTL_MS) {
    try { db.prepare('UPDATE streaks SET current = 0 WHERE user_id = ?').run(userId); } catch (e) {}
    current = 0;
  }
  const level = streakLevel(current);
  const next = streakNextLevel(current);
  const weekArmed = s.last_week === weekKey;
  const daysLeft = todayYmd ? daysLeftInWeek(todayYmd) : null;
  const expiresInMs = current > 0 && fedAt > 0 ? Math.max(0, STREAK_TTL_MS - (now - fedAt)) : 0;
  return {
    current,
    best: s.best || 0,
    level: level ? { emoji: level.emoji, name: level.name } : null,
    nextLevel: next ? { emoji: next.emoji, name: next.name, at: next.min } : null,
    levels: STREAK_LEVELS.map(l => ({ emoji: l.emoji, name: l.name, min: l.min })),
    weekArmed,
    daysLeft,
    expiresInMs,
    expiringSoon: current > 0 && expiresInMs > 0 && expiresInMs <= 24 * 3600 * 1000,
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
  recordWeekArmed, feedStreak, publicStreak, socialProof,
  STREAK_TTL_MS,
};
