// push.js — Push notifications (Web Push / VAPID).
// La llave para que Posta avise en el celu ("¡tu posteo ya salió!") y para
// justificar la app nativa en el App Store.
// Diseñado para no romper nunca: sin VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY en el
// entorno, el módulo queda inactivo en silencio. Cada envío traga sus errores
// y limpia suscripciones muertas (410/404).
'use strict';

let DB = null;
function initPush(db) { DB = db; }

let webpush = null;
function vapidKeys() {
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  return (pub && priv) ? { pub, priv } : null;
}
function vapidPublicKey() {
  const v = vapidKeys();
  return v ? v.pub : '';
}
function pushConfigured() { return !!vapidKeys(); }

function getWebPush() {
  if (webpush) return webpush;
  const v = vapidKeys();
  if (!v) return null;
  try {
    webpush = require('web-push');
    webpush.setVapidDetails('mailto:hola@postahacetodo.com', v.pub, v.priv);
  } catch (e) {
    console.error('[push] no se pudo inicializar web-push:', e.message);
    return null;
  }
  return webpush;
}

// Envía una push a TODOS los dispositivos suscriptos del usuario.
// Nunca tira: devuelve { ok, sent } o { ok:false, reason }.
async function sendPush(userId, { title, body, url } = {}) {
  const wp = getWebPush();
  if (!wp) return { ok: false, reason: 'no_vapid' };
  if (!DB) return { ok: false, reason: 'no_db' };
  let subs = [];
  try {
    subs = DB.prepare('SELECT id, endpoint, keys_json FROM push_subscriptions WHERE user_id = ?').all(userId);
  } catch (e) {
    return { ok: false, reason: 'no_table' };
  }
  if (!subs.length) return { ok: false, reason: 'no_subs' };
  const payload = JSON.stringify({
    title: String(title || 'Posty 💬'),
    body: String(body || ''),
    url: String(url || '/#/app/semana'),
  });
  let sent = 0;
  for (const s of subs) {
    try {
      let keys = {};
      try { keys = JSON.parse(s.keys_json || '{}'); } catch (e) { /* keys inválidas: igual intentar */ }
      await wp.sendNotification({ endpoint: s.endpoint, keys }, payload);
      sent++;
    } catch (e) {
      // 410/404 = suscripción muerta (desinstaló, revocó): limpiarla.
      if (e && (e.statusCode === 410 || e.statusCode === 404)) {
        try { DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id); } catch (e2) { /* no bloquear */ }
      } else {
        console.error('[push] envío falló:', e && e.message);
      }
    }
  }
  return { ok: true, sent };
}

module.exports = { initPush, sendPush, vapidPublicKey, pushConfigured };
