// Insights de Instagram: métricas de posteos, mejor horario y comentarios.
// Usa el token guardado en settings (tokenrefresh.js lo mantiene vigente).
const IG_HOST = 'https://graph.instagram.com';
const API_VERSION = 'v26.0';

function getCreds(db, userId) {
  const s = db.prepare('SELECT ig_user_id, ig_access_token FROM settings WHERE user_id = ?').get(userId) || {};
  if (!s.ig_user_id || !s.ig_access_token) return null;
  return { igUserId: s.ig_user_id, accessToken: s.ig_access_token };
}

async function igGet(path, accessToken, params = {}) {
  const q = new URLSearchParams({ access_token: accessToken, ...params }).toString();
  const r = await fetch(`${IG_HOST}/${API_VERSION}${path}?${q}`, { signal: AbortSignal.timeout(25000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error((data.error && data.error.message) || `IG ${r.status}`);
  return data;
}

// Métricas de un posteo/reel publicado: alcance, likes, comentarios, guardados.
async function fetchMediaInsights(igMediaId, accessToken) {
  const out = { reach: 0, likes: 0, comments: 0, saved: 0 };
  try {
    const data = await igGet(`/${igMediaId}/insights`, accessToken, { metric: 'reach,likes,comments,saved' });
    for (const m of data.data || []) {
      const v = m.values && m.values[0] && m.values[0].value;
      if (typeof v === 'number' && out[m.name] !== undefined) out[m.name] = v;
    }
  } catch (e) {
    // Reels usan otras métricas: intento con plays
    try {
      const data = await igGet(`/${igMediaId}/insights`, accessToken, { metric: 'reach,plays,likes,comments,saved' });
      for (const m of data.data || []) {
        const v = m.values && m.values[0] && m.values[0].value;
        if (m.name === 'plays' && typeof v === 'number') out.reach = Math.max(out.reach, v);
        else if (typeof v === 'number' && out[m.name] !== undefined) out[m.name] = v;
      }
    } catch (e2) { console.error('[insights] métricas:', e2.message); }
  }
  return out;
}

// Mejor hora para publicar: la hora (9-21) con más seguidores conectados.
async function fetchBestHour(igUserId, accessToken) {
  try {
    const data = await igGet(`/${igUserId}/insights`, accessToken, { metric: 'online_followers', period: 'lifetime' });
    const vals = data.data && data.data[0] && data.data[0].values && data.data[0].values[0] && data.data[0].values[0].value;
    if (!vals) return null;
    let best = 19, bestN = -1;
    for (let h = 9; h <= 21; h++) {
      const n = Number(vals[String(h)] || 0);
      if (n > bestN) { bestN = n; best = h; }
    }
    return bestN >= 0 ? best : null;
  } catch (e) {
    console.error('[insights] best hour:', e.message);
    return null;
  }
}

// Baja comentarios nuevos de los últimos posteos y genera respuesta sugerida.
// Devuelve cuántos nuevos encontró.
async function syncComments(db, userId, suggestFn, apiKey) {
  const creds = getCreds(db, userId);
  if (!creds) return 0;
  const profile = db.prepare('SELECT business_name, category, tone, ig_username FROM profiles WHERE user_id = ?').get(userId) || {};
  let media;
  try {
    media = await igGet(`/${creds.igUserId}/media`, creds.accessToken, { fields: 'id', limit: '10' });
  } catch (e) { console.error('[comments] media:', e.message); return 0; }
  let fresh = 0;
  const since = Date.now() - 7 * 86400000;
  for (const m of (media.data || [])) {
    let comments;
    try {
      comments = await igGet(`/${m.id}/comments`, creds.accessToken, {
        fields: 'id,text,username,timestamp,like_count,replies{username}',
        limit: '25',
      });
    } catch (e) { continue; }
    for (const c of comments.data || []) {
      if (!c.text || !c.username) continue;
      if (new Date(c.timestamp).getTime() < since) continue;
      // El negocio ya respondió este comentario: saltear
      const bizHandle = String(profile.ig_username || '').toLowerCase().replace(/^@/, '');
      const replied = bizHandle && c.replies && c.replies.data &&
        c.replies.data.some(r => String(r.username || '').toLowerCase() === bizHandle);
      if (replied) continue;
      const exists = db.prepare('SELECT id FROM comment_queue WHERE ig_comment_id = ?').get(c.id);
      if (exists) continue;
      let suggested = '';
      try {
        suggested = await suggestFn(
          { business: profile.business_name, category: profile.category, tone: profile.tone, username: c.username, commentText: c.text },
          apiKey
        );
      } catch (e) { suggested = '¡Gracias por escribirnos! 🙌'; }
      db.prepare(
        `INSERT INTO comment_queue (user_id, ig_comment_id, ig_media_id, username, text, suggested, status) VALUES (?,?,?,?,?,?,'pending')`
      ).run(userId, c.id, m.id, c.username, String(c.text).slice(0, 500), String(suggested).slice(0, 300));
      fresh++;
    }
  }
  return fresh;
}

// Responde un comentario en Instagram.
async function replyComment(db, userId, igCommentId, message) {
  const creds = getCreds(db, userId);
  if (!creds) throw new Error('Instagram no conectado');
  const r = await fetch(`${IG_HOST}/${API_VERSION}/${igCommentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: String(message).slice(0, 1000), access_token: creds.accessToken }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error((data.error && data.error.message) || `IG ${r.status}`);
  db.prepare(`UPDATE comment_queue SET status='replied' WHERE ig_comment_id = ?`).run(igCommentId);
  return true;
}

module.exports = { getCreds, fetchMediaInsights, fetchBestHour, syncComments, replyComment };
