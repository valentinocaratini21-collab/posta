// Nudge proactivo "¿publicamos tu primero?" — garantiza el primer posteo.
//
// Si a las ~24h de creada la cuenta el usuario sigue con 0 posteos publicados
// (y el trial sigue activo), Posty le manda UN mensaje en el chat con acción
// de 1 tap: el frontend renderiza el marcador [first-publish] como banner con
// el botón "🚀 Publicar mi primero", que lleva a Schedule y dispara el flujo
// de publicación. Una sola vez por usuario (first_publish_nudged=1).
// Nada es gate: el mensaje es texto + banner, no bloquea ningún flujo.
//
// No duplica activation-nudge.js: ese corre a las ~48h (ventana 36-60h) con
// prioridades de setup (logo → IG → estilo). Este corre a diario desde las 24h
// y se saltea la ventana 36-60h para no mandar dos mensajes el mismo día que
// el nudge de activación.
'use strict';

// Réplica local de la política de trial (TRIAL_DAYS=3): mismo criterio que
// schedCanPublish en scheduler.js (plan 'active' o fin efectivo del trial en
// el futuro). Fail-open: ante la duda, se nudgedea (mejor un mensaje de más
// que perder el momento mágico).
const TRIAL_DAYS_FP = 3;

function ensureFpNudgeColumn(db) {
  try {
    db.exec('ALTER TABLE users ADD COLUMN first_publish_nudged INTEGER DEFAULT 0');
  } catch (e) {
    /* ya existe */
  }
  try {
    db.exec('ALTER TABLE users ADD COLUMN first_publish_nudged_at TEXT DEFAULT \'\'');
  } catch (e) {
    /* ya existe */
  }
}

function trialActiveForNudge(db, userId) {
  try {
    const u = db
      .prepare('SELECT plan_status, trial_ends_at, trial_extended_until, created_at FROM users WHERE id = ?')
      .get(userId);
    if (!u) return true;
    if (u.plan_status === 'active') return true;
    const now = Date.now();
    const tEnds = u.trial_ends_at || 0;
    if (!tEnds) return true; // sin dato: no frenar
    const cMs = Date.parse(String(u.created_at || '').replace(' ', 'T') + 'Z');
    const policyEnd = cMs ? cMs + TRIAL_DAYS_FP * 86400000 : Infinity;
    const base = Math.min(tEnds, policyEnd);
    const ext = u.trial_extended_until || 0;
    return (ext > now ? Math.max(base, ext) : base) > now;
  } catch (e) {
    return true;
  }
}

// Mensaje en voz Posty: voseo rioplatense, cálido, 1 línea.
// El frontend detecta [first-publish] y lo renderiza como banner con botón
// táctil (mismo patrón que [logo-candidate:...] en chatMsgHtml).
const FP_MSG = '🚀 ¿Publicamos tu primero? Te lo dejo listo en 1 tap 👇 [first-publish]';

function markFpNudged(db, userId) {
  try {
    db.prepare("UPDATE users SET first_publish_nudged = 1, first_publish_nudged_at = datetime('now') WHERE id = ?").run(userId);
  } catch (e) {}
}

// Candidatos: no nudgedeados Y cuenta creada hace más de 24h.
// Se excluye la ventana 36-60h (ahí manda el nudge de activación a las 11:00:
// no queremos dos mensajes proactivos el mismo día).
// Además: 0 posteos publicados y trial/plan vigente. Límite: 500 por corrida.
function firstPublishNudge(db) {
  try {
    ensureFpNudgeColumn(db);
    const cands = db
      .prepare(
        `SELECT id FROM users
         WHERE COALESCE(first_publish_nudged, 0) = 0
           AND datetime(created_at) <= datetime('now', '-24 hours')
           AND (datetime(created_at) < datetime('now', '-60 hours')
                OR datetime(created_at) > datetime('now', '-36 hours'))
           AND COALESCE(plan_status, 'trial') IN ('trial', 'active')
           AND NOT EXISTS (SELECT 1 FROM posts WHERE user_id = users.id AND status = 'published')
         ORDER BY id ASC LIMIT 500`
      )
      .all();
    let sent = 0;
    for (const c of cands) {
      try {
        if (!trialActiveForNudge(db, c.id)) continue; // trial vencido: no molestar (ya hay aviso de pausa)
        // Marcar ANTES de insertar (anti-spam: nunca repetir aunque algo falle).
        markFpNudged(db, c.id);
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?, \'assistant\', ?)').run(c.id, FP_MSG);
        sent++;
      } catch (e) {
        // Un usuario roto no frena a los demás.
      }
    }
    if (sent > 0) console.log(`[posta] Nudge primer posteo: ${sent} mensaje(s) enviados`);
    return { sent };
  } catch (e) {
    // NUNCA lanza.
    console.error('[posta] Nudge primer posteo falló:', e.message);
    return { sent: 0 };
  }
}

module.exports = { firstPublishNudge, ensureFpNudgeColumn, FP_MSG, trialActiveForNudge };
