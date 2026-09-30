// wins.js — "Posty festeja tus wins" (2026-09-30).
// Cuando un posteo publicado rinde BIEN, Posty avisa al cliente por push + email.
// "Bien" = métrica >= 2x el promedio de sus últimos posteos Y supera un mínimo absoluto.
//   Métrica: reach si la API lo devuelve (>0); si no, likes+comentarios.
//   Mínimos absolutos: 500 de reach, o 20 (likes+comentarios) sin reach.
//   Sin historial (menos de 1 posteo previo con métricas): alcanza con superar el mínimo.
// Nunca inventa números: solo usa métricas reales traídas de la API de Instagram.
// Anti-spam: 1 festejo por posteo (posts.celebrated), máximo 1 por día por usuario
// (users.last_win_at), solo posteos publicados en las últimas 48h.
'use strict';

const WIN_FACTOR = 2;          // 2x el promedio
const WIN_MIN_REACH = 500;     // mínimo absoluto cuando hay reach
const WIN_MIN_ENGAGEMENT = 20; // mínimo absoluto (likes+comentarios) sin reach
const WIN_WINDOW_HOURS = 48;   // solo posteos publicados en las últimas 48h
const WIN_BASELINE_N = 10;     // últimos N posteos para el promedio

function scoreOf(m) {
  const reach = Number(m && m.reach) || 0;
  if (reach > 0) return { score: reach, kind: 'reach' };
  const eng = (Number(m && m.likes) || 0) + (Number(m && m.comments) || 0);
  return { score: eng, kind: 'engagement' };
}

// Decisión pura (testeable): ¿este posteo es un win?
// score/kind = métrica del posteo; prev = scores de posteos anteriores.
function winDecision(score, kind, prev) {
  const s = Number(score) || 0;
  const minAbs = kind === 'reach' ? WIN_MIN_REACH : WIN_MIN_ENGAGEMENT;
  if (!(s > 0) || s < minAbs) return { win: false, reason: 'bajo-minimo' };
  const ps = (prev || []).map(Number).filter((n) => n > 0);
  const avg = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
  if (avg <= 0) return { win: true, reason: 'sin-historial', ratio: 0, avg: 0 };
  const ratio = s / avg;
  if (ratio >= WIN_FACTOR) return { win: true, reason: 'sobre-promedio', ratio, avg };
  return { win: false, reason: 'bajo-promedio', ratio, avg };
}

const fmtInt = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');

function vecesTxt(ratio) {
  const r = Math.round(Number(ratio) || 0);
  if (r === 2) return 'el doble de tu promedio';
  if (r === 3) return 'el triple de tu promedio';
  return `${r} veces tu promedio`;
}

function appBaseUrl() {
  return (process.env.APP_URL || process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
}

async function celebrateWins(db) {
  const { getCreds, fetchMediaInsights } = require('./insights');
  const { sendPush } = require('./push');
  const { sendEmail } = require('./email');
  const { absoluteMediaUrl } = require('./approval');
  const base = appBaseUrl();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC; el tope es diario, no horario)
  let cands = [];
  try {
    cands = db.prepare(`
      SELECT p.*, u.email AS uemail, u.name AS uname,
             COALESCE(u.email_opt_out, 0) AS email_opt_out,
             COALESCE(u.last_win_at, '') AS last_win_at
      FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.status = 'published'
        AND datetime(p.published_at) >= datetime('now', '-${WIN_WINDOW_HOURS} hours')
        AND COALESCE(p.celebrated, 0) = 0
        AND COALESCE(p.ig_media_id, '') != '' AND p.ig_media_id NOT LIKE 'demo_%'
        AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
      ORDER BY p.published_at DESC
    `).all();
  } catch (e) { console.error('[wins] candidatos:', e.message); return { celebrated: 0 }; }

  let celebrated = 0;
  for (const p of cands) {
    try {
      if (p.last_win_at === today) continue; // tope: 1 festejo por día (se reintenta mañana si sigue en ventana)
      const creds = getCreds(db, p.user_id);
      if (!creds) continue;
      let m;
      try {
        const fresh = await fetchMediaInsights(p.ig_media_id, creds.accessToken);
        db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved, fetched_at)
                    VALUES (?,?,?,?,?,datetime('now'))
                    ON CONFLICT(post_id) DO UPDATE SET reach=excluded.reach, likes=excluded.likes,
                    comments=excluded.comments, saved=excluded.saved, fetched_at=excluded.fetched_at`)
          .run(p.id, fresh.reach, fresh.likes, fresh.comments, fresh.saved);
        m = fresh;
      } catch (e) { console.error('[wins] métricas post', p.id, e.message); continue; }
      const { score, kind } = scoreOf(m);
      let prev = [];
      try {
        prev = db.prepare(`
          SELECT m2.reach AS reach, m2.likes AS likes, m2.comments AS comments
          FROM post_metrics m2 JOIN posts p2 ON p2.id = m2.post_id
          WHERE p2.user_id = ? AND p2.status = 'published' AND p2.id != ?
          ORDER BY p2.published_at DESC LIMIT ${WIN_BASELINE_N}
        `).all(p.user_id, p.id).map((r) => scoreOf(r).score);
      } catch (e) { /* sin baseline: decide solo con el mínimo */ }
      const dec = winDecision(score, kind, prev);
      if (!dec.win) continue;
      // Copy con números reales, nunca inventados.
      const deepUrl = `${base}/#/app/post/${p.id}`;
      let body;
      if (kind === 'reach') {
        body = `${fmtInt(score)} personas ya lo vieron` + (dec.ratio >= WIN_FACTOR ? ` — ${vecesTxt(dec.ratio)}.` : '.');
      } else {
        const likes = fmtInt(m.likes), comments = fmtInt(m.comments);
        body = `${likes} me gusta y ${comments} comentarios` + (dec.ratio >= WIN_FACTOR ? ` — ${vecesTxt(dec.ratio)}.` : '.');
      }
      const title = '🔥 Tu posteo la está rompiendo';
      // El festejo vive en el chat: Posty se lo dice ahí con su voz.
      const chatText = `🔥 ¡Tu posteo la está rompiendo! ${body} Seguí así que vamos bien 👌`;
      let chatOk = false;
      try {
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(p.user_id, 'assistant', chatText.slice(0, 2000));
        chatOk = true;
      } catch (e) { console.error('[wins] chat post', p.id, e.message); }
      let image = '';
      try {
        const st = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(p.user_id);
        image = absoluteMediaUrl(p.image_path, st && st.image_base_url ? String(st.image_base_url) : '');
      } catch (e) { /* sin imagen */ }
      let pushOk = false, emailOk = false;
      try {
        const r = await sendPush(p.user_id, {
          title, body, url: `#/app/post/${p.id}`, image,
          data: { url: `#/app/post/${p.id}`, postId: p.id },
        });
        pushOk = !!(r && r.ok);
      } catch (e) { console.error('[wins] push post', p.id, e.message); }
      if (p.uemail && !p.email_opt_out) {
        try {
          const r = await sendEmail({
            to: p.uemail,
            subject: title,
            html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1E33">
              <div style="background:#2793C8;padding:24px 28px;border-radius:14px 14px 0 0">
                <div style="font-size:22px;font-weight:800;color:#fff">posty<span style="color:#FEC14D">.</span></div>
              </div>
              <div style="background:#F2F9FD;padding:28px;border-radius:0 0 14px 14px">
                ${image ? `<img src="${image}" style="width:100%;border-radius:10px;margin-bottom:16px" alt="">` : ''}
                <p style="font-size:17px;font-weight:700;margin:0 0 8px">${title} 🎉</p>
                <p style="font-size:15px;line-height:1.6;margin:0 0 16px">${body}</p>
                <a href="${deepUrl}" style="display:inline-block;background:#FEC14D;color:#0A1E33;font-weight:800;padding:12px 22px;border-radius:10px;text-decoration:none">Ver mi posteo →</a>
              </div></div>`,
          });
          emailOk = !!(r && r.ok);
        } catch (e) { console.error('[wins] email post', p.id, e.message); }
      }
      // El mensaje en el chat es el canal principal (siempre funciona): si se guardó,
      // el festejo cuenta. Push/email son el "timbre" que te lleva al chat.
      if (chatOk || pushOk || emailOk) {
        db.prepare(`UPDATE posts SET celebrated = 1 WHERE id = ?`).run(p.id);
        db.prepare(`UPDATE users SET last_win_at = ? WHERE id = ?`).run(today, p.user_id);
        celebrated++;
        console.log(`[wins] 🎉 post ${p.id} (user ${p.user_id}): ${body}`);
      }
      // si no se pudo avisar por ningún canal, no se marca: se reintenta mañana
    } catch (e) {
      console.error('[wins] post', p.id, 'falló:', e.message);
    }
    await new Promise((r) => setTimeout(r, 300)); // no saturar la API de IG
  }
  if (celebrated) console.log(`[wins] festejos enviados: ${celebrated}`);
  return { celebrated };
}

module.exports = { celebrateWins, winDecision, scoreOf, WIN_FACTOR, WIN_MIN_REACH, WIN_MIN_ENGAGEMENT };
