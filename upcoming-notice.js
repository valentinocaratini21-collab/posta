// upcoming-notice.js — AVISO "SALE EN 30 MINUTOS": cascada push → email
// (2026-10-22, pieza hermana de las jugadas; reconstruido 2026-10-23 sobre
// HEAD v350).
//
// Hoy el aviso pre-publicación de scheduler.autopilotPreNotify sale SOLO
// por push: una cuenta sin app/PWA ni suscripción push (en iPhone sin la
// app instalada no hay push posible) no se entera de que algo sale. Esta
// pieza suma el respaldo, con UN SOLO aviso por posteo:
//
//   push ok ─────────────────────────────→ marcado (autopilot_notified=1)
//   push no llega (no_subs / no_vapid /
//     fcm|apns no configurado / fallo) ──→ EMAIL a la cuenta: miniatura,
//                                           primera línea del caption y
//                                           día/hora en SU timezone.
//   sin RESEND_API_KEY o sin email ──────→ nada se envía ni se finge: el
//     en la cuenta                          aviso queda en el CHAT de la
//                                           cuenta, marcado, con evento
//                                           honesto channel:'chat'.
//   email con fallo transitorio ─────────→ NO se marca: el próximo tick
//                                           dentro de la ventana reintenta.
//
// Dedup estructural: posts.autopilot_notified (la misma marca del aviso
// push histórico). Push ok → sin email; el email es respaldo, nunca
// duplicado. Cada resolución emite el evento post_upcoming_notice
// (diccionario de analytics) con su canal real: push | email | chat.
//
// Modos:
//  · piloto automático (el posteo va a salir solo: auto_published o
//    trust_level ≥ 1 con approval pendiente, o approval 'auto'): email
//    informativo, espejo del push (freno de emergencia incluido).
//  · manual (approval 'pending' con trust_level 0: sin su OK no sale):
//    asunto «⏰ Sale en 30 minutos: ¿lo publicamos?» + link firmado de
//    aprobación de un toque, sin login (approval.signAction).
//
// Ventana: la misma del aviso histórico — posteos programados que salen
// en (25, 35] minutos. Fail-closed y sin excepciones hacia afuera.
'use strict';

const WINDOW_MIN = 25, WINDOW_MAX = 35;

function ensureSchema(db) {
  try { db.exec(`ALTER TABLE posts ADD COLUMN autopilot_notified INTEGER DEFAULT 0`); } catch (e) { /* ya existe */ }
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '',
      name TEXT NOT NULL, props TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  } catch (e) {}
}
function trackEvent(db, userId, name, props) {
  try {
    db.prepare('INSERT INTO events (user_id, session_id, name, props) VALUES (?, ?, ?, ?)')
      .run(userId || null, '', name, JSON.stringify(props || {}).slice(0, 2000));
  } catch (e) { /* el instrumento nunca frena el aviso */ }
}
function chatInsert(db, userId, text) {
  try { db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?, ?, ?)').run(userId, 'assistant', text); return true; }
  catch (e) { return false; }
}
function markNotified(db, postId) {
  try { db.prepare('UPDATE posts SET autopilot_notified = 1 WHERE id = ?').run(postId); } catch (e) {}
}

// ¿El posteo va a salir solo (piloto automático) o espera al dueño (manual)?
function modeFor(db, post, user) {
  const trust = user ? Number(user.trust_level || 0) : 0;
  if (post.auto_published) return 'autopilot';
  if (post.approval === 'auto') return 'autopilot';
  if (post.approval === 'pending' && trust >= 1) return 'autopilot';
  if (post.approval === 'approved') return 'autopilot';
  return 'manual';
}
// ¿Corresponde avisar de este posteo? (paridad con el aviso histórico:
// nivel 1 siempre; nivel ≥2 solo si el usuario prendió el aviso previo;
// manual pending siempre — es su última llamada para aprobar.)
function eligible(db, post, user) {
  const trust = user ? Number(user.trust_level || 0) : 0;
  const mode = modeFor(db, post, user);
  if (mode === 'manual') return post.approval === 'pending';
  if (post.approval === 'pending' && trust === 0) return false; // no sale solo: no es autopilot
  if (trust === 1) return true;
  if (trust >= 2) return !!(user && user.autopilot_prenotify);
  return !!post.auto_published;
}

function duePosts(db) {
  ensureSchema(db);
  try {
    return db.prepare(`
      SELECT p.*, u.trust_level, u.autopilot_prenotify, u.email AS user_email, u.lang AS user_lang,
             u.plan_status AS user_plan_status
      FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.status = 'scheduled'
        AND COALESCE(p.autopilot_notified, 0) = 0
        AND COALESCE(p.needs_review, 0) = 0
        AND p.scheduled_at > datetime('now', '+${WINDOW_MIN} minutes')
        AND p.scheduled_at <= datetime('now', '+${WINDOW_MAX} minutes')
      ORDER BY p.scheduled_at ASC
    `).all();
  } catch (e) { return []; }
}

async function processUpcomingNotices(db, opts) {
  opts = opts || {};
  const out = { checked: 0, push: 0, email: 0, chat: 0, retried: 0, ineligible: 0, detalle: [] };
  const posts = opts.posts || duePosts(db);
  const pushFn = opts.pushFn || (async (uid, payload) => require('./push').sendPush(uid, payload));
  const emailFn = opts.emailFn || (async (db2, post, mode) => require('./notify-email').sendUpcomingEmail(db2, post, { mode }));

  for (const p of posts) {
    let user = null;
    try { user = db.prepare('SELECT * FROM users WHERE id = ?').get(p.user_id); } catch (e) {}
    if (!user && p.trust_level != null) user = { id: p.user_id, trust_level: p.trust_level, autopilot_prenotify: p.autopilot_prenotify, email: p.user_email, lang: p.user_lang };
    if (!eligible(db, p, user)) { out.ineligible++; continue; }
    out.checked++;
    const mode = modeFor(db, p, user);
    const cap = String(p.caption || '').split('\n')[0].slice(0, 60);
    try {
      // 1) PUSH primero (el canal histórico).
      let pr = null;
      try {
        pr = await pushFn(p.user_id, {
          title: mode === 'manual' ? '⏰ Sale en 30 minutos' : '🚀 Publico en 30 min',
          body: mode === 'manual'
            ? `"${cap}..." — tocá para aprobarlo o frenarlo`
            : `"${cap}..." — tocá para verlo o frenarlo`,
          url: `/#/app/semana?post=${p.id}`,
        });
      } catch (e) { pr = { ok: false, reason: 'push_throw: ' + e.message }; }
      if (pr && pr.ok) {
        markNotified(db, p.id);
        trackEvent(db, p.user_id, 'post_upcoming_notice', { post_id: p.id, channel: 'push', mode });
        out.push++;
        out.detalle.push({ post_id: p.id, channel: 'push', mode });
        continue;
      }
      const pushReason = (pr && pr.reason) || 'send_failed';

      // 2) EMAIL de respaldo (nunca duplicado: solo si el push no llegó).
      let er = null;
      try { er = await emailFn(db, p, mode); } catch (e) { er = { ok: false, reason: 'email_throw', transient: true, error: e.message }; }
      if (er && er.ok) {
        markNotified(db, p.id);
        trackEvent(db, p.user_id, 'post_upcoming_notice', { post_id: p.id, channel: 'email', mode, push_reason: pushReason });
        out.email++;
        out.detalle.push({ post_id: p.id, channel: 'email', mode, push_reason: pushReason });
        continue;
      }
      // Fallo transitorio del email: NO se marca ni se disfraza de chat —
      // el próximo tick dentro de la ventana (25–35 min) reintenta.
      if (er && er.transient) {
        trackEvent(db, p.user_id, 'post_upcoming_notice', { post_id: p.id, channel: 'retry', mode, push_reason: pushReason, email_reason: er.reason || '' });
        out.retried++;
        out.detalle.push({ post_id: p.id, channel: 'retry', mode, push_reason: pushReason });
        continue;
      }
      // 3) Fail-closed honesto: sin canal externo posible (sin
      // RESEND_API_KEY, sin email en la cuenta o push sin configurar), el
      // aviso queda en el chat de la cuenta y el evento dice la verdad.
      const emailReason = (er && er.reason) || 'sin_email';
      const chatText = mode === 'manual'
        ? `⏰ en 30 minutos sale este posteo y todavía no me diste tu ok:\n\n"${cap}..."\n\nsi querés que salga, aprobalo desde tu semana 👆`
        : `🚀 en 30 minutos publico este posteo:\n\n"${cap}..."\n\nsi querés frenarlo o cambiarlo, tocá acá 👆`;
      const inChat = chatInsert(db, p.user_id, chatText);
      markNotified(db, p.id);
      trackEvent(db, p.user_id, 'post_upcoming_notice', { post_id: p.id, channel: 'chat', mode, push_reason: pushReason, email_reason: emailReason });
      out.chat++;
      out.detalle.push({ post_id: p.id, channel: 'chat', mode, push_reason: pushReason, email_reason: emailReason, in_chat: inChat });
    } catch (e) {
      console.error('[upcoming-notice] post', p.id, e.message);
      out.detalle.push({ post_id: p.id, channel: 'error', error: e.message });
    }
  }
  if (out.push || out.email || out.chat) {
    console.log(`[upcoming-notice] avisos 30min: push=${out.push} email=${out.email} chat=${out.chat} reintentos=${out.retried}`);
  }
  return out;
}

module.exports = {
  processUpcomingNotices,
  ensureSchema,
  _internal: { modeFor, eligible, duePosts, WINDOW_MIN, WINDOW_MAX },
};
