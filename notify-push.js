// notify-push.js — "Posty te avisa": push de aprobación de posteos.
// Provee sendApprovalPush(db, post) y sendMissedPush(db, post, reason),
// llamados por approval.js (notifyApproval / notifyMissed).
// Nunca tira excepciones: si no hay suscripciones o no hay VAPID,
// devuelve { ok:false } en silencio (el email cubre).
'use strict';

const { sendPush } = require('./push');
const { absoluteMediaUrl, userHourLabel } = require('./approval');

async function sendApprovalPush(db, post) {
  try {
    const userId = post && post.user_id;
    if (!userId || !post || post.id == null) return { ok: false };
    let imageBaseUrl = '';
    try {
      const s = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(userId);
      if (s && s.image_base_url) imageBaseUrl = String(s.image_base_url);
    } catch (e) { /* default */ }
    const hour = userHourLabel(db, userId, post.scheduled_at);
    const title = `Tu posteo de las ${hour} está listo 👀`;
    const body = 'Sale solo en 3 horas salvo que me digas lo contrario.';
    const image = absoluteMediaUrl(post.image_path, imageBaseUrl);
    const url = `/#/app/post/${post.id}`;
    const r = await sendPush(userId, {
      title,
      body,
      url,
      image,
      actions: [
        { action: 'approve', title: '✅ Aceptar' },
        { action: 'reject', title: '❌ Rechazar' },
      ],
      // badge viaja dentro de data: el payload webpush de push.js solo
      // serializa campos fijos + data (un top-level "badge" se perdería).
      data: { url, postId: post.id, badge: 1 },
    });
    if (!r || !r.ok) return { ok: false };
    return { ok: true, sent: r.sent };
  } catch (e) {
    console.error('[notify-push] sendApprovalPush falló:', e && e.message);
    return { ok: false };
  }
}

// FASE 3 — "no publiqué tu posteo porque no lo aprobaste".
// Lo llama approval.notifyMissed; antes no existía y el llamado moría en el
// guard `typeof`. Nunca tira: {ok:false} en silencio si no hay push/VAPID
// (el email cubre).
async function sendMissedPush(db, post, reason) {
  try {
    const userId = post && post.user_id;
    if (!userId || !post || post.id == null) return { ok: false };
    let imageBaseUrl = '';
    try {
      const s = db.prepare('SELECT image_base_url FROM settings WHERE user_id = ?').get(userId);
      if (s && s.image_base_url) imageBaseUrl = String(s.image_base_url);
    } catch (e) { /* default */ }
    const hour = userHourLabel(db, userId, post.scheduled_at);
    const title = `No publiqué tu posteo de las ${hour} 😅`;
    const body = 'Todavía no me aprobaste nada: prefiero no publicar sin tu OK. Tocá para aprobarlo 👇';
    const image = absoluteMediaUrl(post.image_path, imageBaseUrl);
    const url = `/#/app/post/${post.id}`;
    const r = await sendPush(userId, {
      title,
      body,
      url,
      image,
      data: { url, postId: post.id, badge: 1, reason: String(reason || '') },
    });
    if (!r || !r.ok) return { ok: false };
    return { ok: true, sent: r.sent };
  } catch (e) {
    console.error('[notify-push] sendMissedPush falló:', e && e.message);
    return { ok: false };
  }
}

module.exports = { sendApprovalPush, sendMissedPush };
