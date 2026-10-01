// stats.js — "📊 Tus números" (2026-09-30).
// Agrega las métricas reales de Instagram del cliente desde post_metrics.
// Nunca inventa números: si no hay datos, devuelve ceros + best_post null.
//
// ESTRATEGIA:
//  1. Leer caché local (post_metrics). Barato y rápido.
//  2. Si no hay ninguna métrica del usuario, intentar traer frescas de la API de IG
//     (solo posteos publicados de los últimos 30 días con ig_media_id; tope por llamada).
//  3. Si la API tampoco devuelve nada (sin conexión, sin credenciales), ceros honestos.
'use strict';

const REFRESH_LOOKBACK_DAYS = 30; // solo posteos publicados en este rango
const REFRESH_MAX_PER_CALL = 15;  // tope de llamados a la API por request
const REFRESH_STALE_HOURS = 6;    // re-traer si el caché es más viejo que esto

// Puntaje de un posteo para "Tu mejor posteo": reach si existe, si no likes+comentarios.
// Mismo criterio que wins.js (scoreOf).
function scoreOf(m) {
  const reach = Number(m && m.reach) || 0;
  if (reach > 0) return { score: reach, kind: 'reach' };
  const eng = (Number(m && m.likes) || 0) + (Number(m && m.comments) || 0);
  return { score: eng, kind: 'engagement' };
}

// Trae métricas frescas de IG para los posteos publicados del usuario que no tienen
// caché (o lo tienen viejo). Devuelve cuántos posteos se actualizaron.
// Nunca tira: si falla todo, devuelve 0 y el caller cae a ceros honestos.
async function refreshMetrics(db, userId) {
  const { getCreds, fetchMediaInsights } = require('./insights');
  let creds = null;
  try { creds = getCreds(db, userId); } catch (e) { return 0; }
  if (!creds) return 0;
  let posts = [];
  try {
    posts = db.prepare(`
      SELECT p.id, p.ig_media_id
      FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.user_id = ? AND p.status = 'published'
        AND COALESCE(p.ig_media_id, '') != '' AND p.ig_media_id NOT LIKE 'demo_%'
        AND datetime(COALESCE(p.published_at, p.created_at)) >= datetime('now', '-${REFRESH_LOOKBACK_DAYS} days')
        AND (m.post_id IS NULL OR datetime(m.fetched_at) < datetime('now', '-${REFRESH_STALE_HOURS} hours'))
      ORDER BY COALESCE(p.published_at, p.created_at) DESC
      LIMIT ${REFRESH_MAX_PER_CALL}
    `).all(userId);
  } catch (e) { return 0; }
  let updated = 0;
  for (const p of posts) {
    try {
      const m = await fetchMediaInsights(p.ig_media_id, creds.accessToken);
      db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved, fetched_at)
                  VALUES (?,?,?,?,?,datetime('now'))
                  ON CONFLICT(post_id) DO UPDATE SET reach=excluded.reach, likes=excluded.likes,
                  comments=excluded.comments, saved=excluded.saved, fetched_at=excluded.fetched_at`)
        .run(p.id, m.reach | 0, m.likes | 0, m.comments | 0, m.saved | 0);
      updated++;
    } catch (e) { /* este posteo falla, el resto sigue */ }
  }
  return updated;
}

// Resumen agregado SOLO del usuario dado (post_metrics no tiene user_id: se filtra
// por posts.user_id). Devuelve ceros + best_post null si no hay nada.
function buildSummary(db, userId) {
  const zero = { reach_7d: 0, reach_30d: 0, interactions_30d: 0, followers: 0, reach_prev7d: 0, posts_7d: 0, posts_prev7d: 0, best_post: null };
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT p.id, p.image_path, p.caption, p.media_type,
             COALESCE(m.reach, 0) AS reach, COALESCE(m.likes, 0) AS likes,
             COALESCE(m.comments, 0) AS comments, COALESCE(m.saved, 0) AS saved,
             COALESCE(p.published_at, p.created_at) AS at
      FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id
      WHERE p.user_id = ? AND p.status = 'published'
      ORDER BY COALESCE(p.published_at, p.created_at) DESC
    `).all(userId);
  } catch (e) { return zero; }
  const withMetrics = rows.filter((r) => (r.reach + r.likes + r.comments + r.saved) > 0);
  if (!withMetrics.length) return zero;

  const at = (r) => String(r.at || '');
  const cut = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 19).replace('T', ' '); };
  const r7 = withMetrics.filter((r) => at(r) >= cut(7));
  const rPrev7 = withMetrics.filter((r) => at(r) < cut(7) && at(r) >= cut(14));
  const r30 = withMetrics.filter((r) => at(r) >= cut(30));
  const sum = (list, f) => list.reduce((a, r) => a + (Number(f(r)) || 0), 0);

  // Mejor posteo: el de mayor puntaje entre los publicados.
  let best = null, bestScore = -1, bestKind = '';
  for (const r of withMetrics) {
    const { score, kind } = scoreOf(r);
    if (score > bestScore) { bestScore = score; bestKind = kind; best = r; }
  }

  const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');
  let bestPost = null;
  if (best) {
    const metric = bestKind === 'reach'
      ? `${fmtInt(bestScore)} personas lo vieron`
      : `${fmtInt(Number(best.likes) || 0)} me gusta · ${fmtInt(Number(best.comments) || 0)} comentarios`;
    const cap = String(best.caption || '').trim().replace(/\s+/g, ' ');
    bestPost = {
      id: best.id,
      image_url: best.image_path || '',
      caption_short: cap ? cap.slice(0, 80) + (cap.length > 80 ? '…' : '') : '',
      metric,
    };
  }

  let followers = 0;
  try {
    const u = db.prepare('SELECT ig_followers FROM users WHERE id = ?').get(userId) || {};
    followers = Number(u.ig_followers) || 0;
  } catch (e) { /* columna nueva en DBs viejas: ALTER en db.js la crea */ }

  return {
    reach_7d: Math.round(sum(r7, (r) => r.reach)),
    reach_30d: Math.round(sum(r30, (r) => r.reach)),
    interactions_30d: Math.round(sum(r30, (r) => r.likes + r.comments + r.saved)),
    followers,
    reach_prev7d: Math.round(sum(rPrev7, (r) => r.reach)),
    // Conteos por cohorte: el frontend solo muestra el delta si ambas tienen ≥3.
    posts_7d: r7.length,
    posts_prev7d: rPrev7.length,
    best_post: bestPost,
  };
}

// Seguidores: trae frescos de IG cuando hay credenciales y los cachea en
// users.ig_followers. Si la API falla, devuelve el caché (o 0). Nunca inventa.
async function refreshFollowers(db, userId) {
  let cached = 0;
  try {
    const u = db.prepare('SELECT ig_followers FROM users WHERE id = ?').get(userId) || {};
    cached = Number(u.ig_followers) || 0;
  } catch (e) { /* sin columna todavía */ }
  let creds = null;
  try { creds = require('./insights').getCreds(db, userId); } catch (e) { return cached; }
  if (!creds) return cached;
  let fresh = null;
  try { fresh = await require('./insights').fetchFollowers(creds.igUserId, creds.accessToken); } catch (e) { return cached; }
  if (fresh === null) return cached;
  try { db.prepare('UPDATE users SET ig_followers = ? WHERE id = ?').run(fresh, userId); } catch (e) { /* best effort */ }
  return fresh;
}

module.exports = { scoreOf, refreshMetrics, buildSummary, refreshFollowers };
