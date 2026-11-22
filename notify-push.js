// notify-push.js — "Posty te avisa": pushes de aprobación de posteos.
// Provee sendMissedPush(db, post, reason), llamado por approval.js
// (notifyMissed): el aviso de que un posteo NO salió por falta de
// aprobación — clase «problema», se queda.
// (LOTE PUSH-LISTO-FUERA · 22/11) sendApprovalPush MURIÓ: era el push
// «Tu posteo de las … está listo 👀 / Sale solo en 3 horas salvo que
// me digas lo contrario.» que llegaba 3 horas antes de la publicación
// — la clase «posteo listo» que la doctrina de pushes del dueño ya
// había removido (push solo para tanda esperando el toque, un
// problema o el resultado de un pedido). approval.notifyApproval lo
// llamaba tras un guard typeof: sin la función, su cascada (FASE 3)
// cubre el aviso con el email gemelo de notify-email.js, como ya
// hacía para las cuentas sin push.
// Nunca tira excepciones: si no hay suscripciones o no hay VAPID,
// devuelve { ok:false } en silencio (el email cubre).
'use strict';

const { sendPush } = require('./push');
const { absoluteMediaUrl, userHourLabel } = require('./approval');

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

module.exports = { sendMissedPush };
