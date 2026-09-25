// Refresh de tokens de Instagram — Posta
// Los tokens long-lived de Meta vencen a los 60 días.
// Cron diario: refresca los tokens con más de 50 días de antigüedad vía
// GET graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token
// Si el refresh falla, se loguea claro y se marca settings.ig_token_warning=1
// para avisarle al usuario en Ajustes.

const cron = require('node-cron');
const db = require('./db');
const { refreshLongLivedToken } = require('./instagram');

const REFRESH_AFTER_DAYS = 50;

function daysSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso.length === 16 ? iso : iso.replace(' ', 'T')).getTime();
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / (1000 * 3600 * 24);
}

async function refreshOneToken(s) {
  const newToken = await refreshLongLivedToken(s.ig_access_token);
  db.prepare(
    `UPDATE settings SET ig_access_token=?, ig_token_issued_at=datetime('now'), ig_token_warning=0, updated_at=datetime('now') WHERE user_id=?`
  ).run(newToken, s.user_id);
  console.log(`[posta] Token de Instagram refrescado para el usuario ${s.user_id}`);
}

async function checkAndRefreshTokens() {
  let rows = [];
  try {
    rows = db
      .prepare(`SELECT user_id, meta_app_id, meta_app_secret, ig_access_token, ig_token_issued_at FROM settings WHERE ig_access_token <> ''`)
      .all();
  } catch (e) {
    console.error('[posta] No se pudieron leer los tokens:', e.message);
    return;
  }
  for (const s of rows) {
    const age = daysSince(s.ig_token_issued_at);
    if (age <= REFRESH_AFTER_DAYS) continue;
    console.log(`[posta] Token del usuario ${s.user_id} con ${Math.floor(age)} días, refrescando...`);
    try {
      await refreshOneToken(s);
    } catch (e) {
      console.error(`[posta] ⚠️ No se pudo refrescar el token de Instagram del usuario ${s.user_id}: ${e.message}`);
      try {
        db.prepare(`UPDATE settings SET ig_token_warning=1 WHERE user_id=?`).run(s.user_id);
      } catch (_) {}
    }
  }
}

function startTokenRefresh() {
  // Todos los días a las 3:00 AM
  cron.schedule('0 3 * * *', () => {
    console.log('[posta] Revisando tokens de Instagram para refrescar...');
    checkAndRefreshTokens();
  });
  // Chequeo inicial 60 segundos después de arrancar
  setTimeout(() => checkAndRefreshTokens(), 60000);
  console.log('[posta] Refresh de tokens de Instagram activo (diario 3:00 AM)');
}

module.exports = { startTokenRefresh, checkAndRefreshTokens };
