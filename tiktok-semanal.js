// tiktok-semanal.js — TikTok semanal opt-in (Lote 7, ARMA TODO + TikTok).
// El mismo video semanal que Posty arma para el cliente sale en Instagram
// siempre y en TikTok SOLO si el cliente lo activa (opt-in) + conectó su
// cuenta + TikTok aprobó la auditoría (TIKTOK_AUDITED=1).
//
// Puerta dura (brief del Lote 7): SIN TIKTOK_AUDITED=1, el camino
// automático NO hace nada hacia TikTok: ni lecturas, ni envíos, ni
// publicación. El chequeo de auditoría corre ANTES de cualquier llamada
// de red y ANTES de cualquier escritura (ni siquiera una fila skipped):
// retorna { skipped: 'sin_auditoria' } puro.
// Con auditoría, los demás gates (opt-in, conexión, token, tope diario)
// dejan fila skipped local — eso es registro, no acción hacia TikTok.
// Best-effort: un fallo jamás cambia el estado del posteo de Instagram
// ni tira el scheduler: queda fila failed y la función nunca lanza.
// Solo videos: la API de publicación de TikTok es video (las fotos no van).
// Sin opt-in, jamás se publica. Sin conexión, jamás se publica.

const DAILY_CAP = 15;

function isAudited() { return process.env.TIKTOK_AUDITED === '1'; }

function ensureTables(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tiktok_optin (
    user_id INTEGER PRIMARY KEY,
    optin INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS tiktok_publishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    tiktok_publish_id TEXT DEFAULT '',
    status TEXT,
    privacy TEXT DEFAULT '',
    error TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );`);
}

function getOptin(db, userId) {
  try {
    const r = db.prepare('SELECT optin FROM tiktok_optin WHERE user_id = ?').get(userId);
    return r ? r.optin === 1 : false;
  } catch (e) { return false; }
}

function setOptin(db, userId, on) {
  ensureTables(db);
  db.prepare(`INSERT INTO tiktok_optin (user_id, optin, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET optin = excluded.optin, updated_at = datetime('now')`)
    .run(userId, on ? 1 : 0);
  return !!on;
}

function todayCount(db, userId) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM tiktok_publishes
      WHERE user_id = ? AND date(created_at) = date('now') AND status IN ('published', 'private')`).get(userId);
    return (r && r.c) || 0;
  } catch (e) { return 0; }
}

function lastPublishes(db, userId, n) {
  try {
    return db.prepare(`SELECT post_id, tiktok_publish_id, status, privacy, error, created_at
      FROM tiktok_publishes WHERE user_id = ? ORDER BY id DESC LIMIT ?`).all(userId, n || 5) || [];
  } catch (e) { return []; }
}

function logRow(db, userId, postId, status, privacy, error, publishId) {
  try {
    db.prepare(`INSERT INTO tiktok_publishes (user_id, post_id, tiktok_publish_id, status, privacy, error)
      VALUES (?, ?, ?, ?, ?, ?)`).run(userId, postId, publishId || '', status, privacy || '', error || '');
  } catch (e) { /* el log nunca bloquea */ }
}

// Camino automático semanal. args: { userId, postId, videoUrl, title }.
// deps (solo tests): { tiktok } para stubbear la red. Nunca lanza.
async function publishWeeklyBestEffort(db, args, deps) {
  // Puerta 0 — auditoría: ANTES de red y ANTES de escribir nada.
  if (!isAudited()) return { skipped: 'sin_auditoria' };
  const tt = (deps && deps.tiktok) || require('./tiktok');
  const uid = args.userId;
  const pid = args.postId;
  try { ensureTables(db); } catch (e) { /* sigue: los gates leen con try/catch */ }
  if (!getOptin(db, uid)) {
    logRow(db, uid, pid, 'skipped', '', 'sin_optin', '');
    return { skipped: 'sin_optin' };
  }
  let acc = null;
  try { acc = tt.getAccount(db, uid); } catch (e) { acc = null; }
  if (!acc) {
    logRow(db, uid, pid, 'skipped', '', 'sin_conexion', '');
    return { skipped: 'sin_conexion' };
  }
  let token = null;
  try { token = await tt.getValidToken(db, uid); } catch (e) { token = null; }
  if (!token) {
    logRow(db, uid, pid, 'skipped', '', 'sin_token', '');
    return { skipped: 'sin_token' };
  }
  if (todayCount(db, uid) >= DAILY_CAP) {
    logRow(db, uid, pid, 'skipped', '', 'tope_diario', '');
    return { skipped: 'tope_diario' };
  }
  if (!args.videoUrl) {
    logRow(db, uid, pid, 'skipped', '', 'sin_video', '');
    return { skipped: 'sin_video' };
  }
  try {
    const out = await tt.publishVideo({ accessToken: token, videoUrl: args.videoUrl, title: args.title || 'Posteo de mi negocio' });
    const status = (out.privacyLevel === 'PUBLIC_TO_EVERYONE') ? 'published' : 'private';
    logRow(db, uid, pid, status, out.privacyLevel || '', '', out.publishId || '');
    return { ok: true, status, publishId: out.publishId || '', privacy: out.privacyLevel || '' };
  } catch (e) {
    logRow(db, uid, pid, 'failed', '', String((e && e.message) || e).slice(0, 500), '');
    return { failed: true, error: String((e && e.message) || e).slice(0, 200) };
  }
}

module.exports = {
  DAILY_CAP, isAudited, ensureTables, getOptin, setOptin, todayCount,
  lastPublishes, publishWeeklyBestEffort,
};
