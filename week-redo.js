// week-redo — garantía de primera semana (ARMA TODO · ítem 3, 2026-10-24).
//
// La promesa: «Si tu primera semana no te convence, te la rehacemos entera,
// gratis.» Regla de verdad de la casa: sin registro durable no hay promesa.
// Este módulo ES ese registro: una fila por usuario en `first_week_redo`,
// creada en el momento de la ACTIVACIÓN del plan (los 3 puntos de activación
// llaman a grantFirstWeekRedo: webhook Stripe, webhook MP 'authorized' y
// billing-sync.reconcilePending) y consumida una sola vez por el endpoint
// POST /api/week/first-redo de server.js.
//
// El rehacer es POR ENCIMA del redo por posteo (posts.redo_left): no lo toca.
// Este módulo no requiere a nadie del proyecto (sin circularidad con
// billing-sync, que sí lo requiere a él): solo recibe la `db` inyectada,
// como billing-sync. La weekKey la calcula server.js (dueño del cálculo,
// mondayKeyOf(tzToday(userTz)) ) y la pasa por parámetro; cuando el llamador
// no la tiene (billing-sync), el módulo la deriva de la zona horaria del
// usuario (settings.timezone, el mismo default que usa server.js).

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS first_week_redo (
    user_id INTEGER PRIMARY KEY,
    grant_week_key TEXT,
    granted_at INTEGER,
    used_at INTEGER
  )`);
}

// Lunes (YYYY-MM-DD) de la semana de `ymd` — el MISMO algoritmo que
// mondayKeyOf en server.js (mediodía UTC para no saltar de día por zona).
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

// Fecha local (YYYY-MM-DD) de un instante en la zona del negocio — espejo
// de tzToday(userTz(uid)) de server.js, sin depender de server.js.
function localYmd(db, uid, when) {
  let tz = 'America/Argentina/Buenos_Aires';
  try {
    const s = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(uid);
    if (s && s.timezone) tz = String(s.timezone);
  } catch (e) { /* sin settings: default de la casa */ }
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(when || new Date());
  } catch (e) {
    return (when || new Date()).toISOString().slice(0, 10);
  }
}

// weekKey vigente para el usuario, calculada por el módulo (solo para los
// llamadores que no son server.js; server.js siempre pasa la suya).
function currentWeekKeyFor(db, uid) {
  return mondayKeyOf(localYmd(db, uid, new Date()));
}

// Semana de activación según el PRIMER evento de pago registrado:
// evTrack guarda 'payment_ok' en `events` y track guarda 'subscribed' en
// `funnel_events` (ambas tablas, el evento más viejo de las dos manda).
// El timestamp de esas tablas es UTC (datetime('now')): se convierte a la
// fecha local del negocio antes de sacar el lunes, igual que hace
// server.js con mondayKeyOf(tzToday(tz)). Devuelve null si no hay evento.
function activationWeekKey(db, uid) {
  let best = null;
  try {
    const r = db.prepare(`SELECT created_at FROM events WHERE user_id = ? AND name IN ('payment_ok', 'subscribed') ORDER BY id ASC LIMIT 1`).get(uid);
    if (r && r.created_at) best = String(r.created_at);
  } catch (e) { /* tabla ausente en DBs mínimas de test */ }
  try {
    const r = db.prepare(`SELECT created_at FROM funnel_events WHERE user_id = ? AND event = 'subscribed' ORDER BY id ASC LIMIT 1`).get(uid);
    if (r && r.created_at && (!best || String(r.created_at) < best)) best = String(r.created_at);
  } catch (e) { /* idem */ }
  if (!best) return null;
  // created_at viene de datetime('now'): 'YYYY-MM-DD HH:MM:SS' en UTC, sin
  // marca de zona — se parsea como UTC explícito antes de localizar.
  const iso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(best) ? best : best.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (isNaN(d)) return mondayKeyOf(best.slice(0, 10));
  return mondayKeyOf(localYmd(db, uid, d));
}

function getRow(db, uid) {
  try { return db.prepare('SELECT user_id, grant_week_key, granted_at, used_at FROM first_week_redo WHERE user_id = ?').get(uid) || null; }
  catch (e) { return null; }
}

// Otorga la garantía: una sola fila por usuario (INSERT OR IGNORE) con la
// weekKey de la semana de activación. Idempotente: los reintentos de los
// webhooks y las reconciliaciones repetidas nunca pisan el grant original
// (si lo pisaran, la garantía se renovaría sola cada semana).
// Devuelve true solo si ESTE llamado creó la fila.
function grantFirstWeekRedo(db, uid, weekKey) {
  if (!db || !uid) return false;
  ensureSchema(db);
  const wk = weekKey || currentWeekKeyFor(db, uid);
  const r = db.prepare(`INSERT OR IGNORE INTO first_week_redo (user_id, grant_week_key, granted_at, used_at) VALUES (?,?,?,NULL)`)
    .run(uid, wk, Date.now());
  return !!(r && r.changes === 1);
}

// Estado de la garantía para la semana `currentWeekKey` (la calcula y la
// pasa server.js). Si el usuario está activo y todavía no tiene fila
// (activó ANTES de que existiera este registro), la fila se crea acá:
// con la semana de su primer evento de pago; sin evento, con la semana
// actual (fallback declarado: es la única semana que se puede prometer
// sin inventar una fecha de activación que no consta).
// state: 'available' solo si no se usó y la semana actual ES la del grant;
// 'used' si ya se consumió; 'expired' si la semana del grant ya pasó;
// 'none' si no hay garantía (usuario no activo y sin fila).
function firstRedoStatus(db, uid, currentWeekKey) {
  if (!db || !uid) return { state: 'none', grant_week_key: null };
  ensureSchema(db);
  const cur = currentWeekKey || currentWeekKeyFor(db, uid);
  let row = getRow(db, uid);
  if (!row) {
    let active = false;
    try {
      const u = db.prepare('SELECT plan_status FROM users WHERE id = ?').get(uid);
      active = !!(u && u.plan_status === 'active');
    } catch (e) { /* sin tabla users legible: no se crea promesa */ }
    if (!active) return { state: 'none', grant_week_key: null };
    grantFirstWeekRedo(db, uid, activationWeekKey(db, uid) || cur);
    row = getRow(db, uid);
    if (!row) return { state: 'none', grant_week_key: null };
  }
  if (row.used_at) return { state: 'used', grant_week_key: row.grant_week_key };
  return {
    state: row.grant_week_key === cur ? 'available' : 'expired',
    grant_week_key: row.grant_week_key,
  };
}

// Consume la garantía: marca used_at SOLO si estaba available (sin usar y
// en la semana del grant — el UPDATE es condicional y atómico: dos toques
// simultáneos no pueden consumirla dos veces). Devuelve true si ESTE
// llamado la consumió.
function consumeFirstWeekRedo(db, uid, currentWeekKey) {
  if (!db || !uid) return false;
  ensureSchema(db);
  const cur = currentWeekKey || currentWeekKeyFor(db, uid);
  const r = db.prepare(`UPDATE first_week_redo SET used_at = ? WHERE user_id = ? AND used_at IS NULL AND grant_week_key = ?`)
    .run(Date.now(), uid, cur);
  return !!(r && r.changes === 1);
}

module.exports = { ensureSchema, grantFirstWeekRedo, firstRedoStatus, consumeFirstWeekRedo, mondayKeyOf };
