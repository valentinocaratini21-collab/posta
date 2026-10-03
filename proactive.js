// Posty proactivo ESTRATÉGICO (2026-10-02, v2).
// No hablamos "porque sí". Cada mensaje tiene un motivo que mueve activación,
// retención o amor por el producto. 6 triggers por prioridad.

/**
 * Triggers (en orden de prioridad):
 * 1. trial_ending: quedan 2 días o menos de prueba → una sola vez
 * 2. streak_risk: racha se vence en <24h → salvar la racha
 * 3. drafts_pending: tiene borradores sin revisar hace >24h → activación
 * 4. need_photos: próximo posteo necesita foto/video del cliente → pedir material
 * 5. winner: un posteo superó 2x el promedio → prueba de que funciona
 * 6. opportunity: evento relevante (clima, fecha) → idea oportuna
 */

/**
 * checkTriggers(db, userId): evalúa todos los triggers, devuelve el de
 * mayor prioridad que aplique (o null). Cada trigger tiene su cooldown
 * para no spamear.
 */
function checkTriggers(db, userId) {
  const triggers = [];

  try {
    // 1. Trial por vencer (una sola vez, 2 días antes).
    const u = db.prepare(`
      SELECT plan_status, trial_ends_at, trial_extended_until, created_at,
             COALESCE(proactive_trial_warned, 0) AS warned
      FROM users WHERE id = ?
    `).get(userId);
    if (u && u.plan_status === 'trial' && !u.warned) {
      const end = Math.max(
        Number(u.trial_ends_at) || 0,
        Number(u.trial_extended_until) || 0,
        (new Date(u.created_at).getTime() || Date.now()) + 3 * 86400000
      );
      const hoursLeft = (end - Date.now()) / 3600000;
      if (hoursLeft > 0 && hoursLeft <= 48) {
        triggers.push({
          type: 'trial_ending',
          priority: 1,
          message: `⏰ Te quedan ${Math.ceil(hoursLeft / 24)} día(s) de prueba.\n\nYa viste lo que Posty puede hacer por tu Instagram. ¿Activamos tu plan para no frenar?`,
          push_title: '⏰ Tu prueba termina pronto',
          push_body: 'No frenes tu Instagram ahora que arrancó.',
          markSent: () => {
            try { db.prepare(`UPDATE users SET proactive_trial_warned = 1 WHERE id = ?`).run(userId); } catch (e) {}
          },
        });
      }
    }
  } catch (e) {}

  try {
    // 2. Racha en riesgo (streak se vence en <24h).
    const streak = db.prepare(`
      SELECT streak_count, last_streak_date FROM users WHERE id = ?
    `).get(userId);
    if (streak && (streak.streak_count || 0) >= 2) {
      const last = new Date(streak.last_streak_date).getTime();
      const hoursSince = (Date.now() - last) / 3600000;
      // Si pasaron >20h desde la última actividad, la racha está en riesgo.
      if (hoursSince > 20 && hoursSince < 44) {
        const sent = wasSentRecently(db, userId, 'streak_risk', 20);
        if (!sent) {
          triggers.push({
            type: 'streak_risk',
            priority: 2,
            message: `🔥 Tu racha de ${streak.streak_count} días se vence en unas horas.\n\nPublicá algo hoy y la mantenés viva. ¿Te armo un posteo rápido?`,
            push_title: '🔥 Tu racha está en riesgo',
            push_body: `${streak.streak_count} días seguidos. No la pierdas.`,
          });
        }
      }
    }
  } catch (e) {}

  try {
    // 3. Borradores sin revisar (>24h).
    const drafts = db.prepare(`
      SELECT COUNT(*) AS n FROM posts
      WHERE user_id = ? AND status = 'draft'
      AND created_at < datetime('now', '-24 hours')
    `).get(userId);
    if (drafts && drafts.n >= 2) {
      const sent = wasSentRecently(db, userId, 'drafts_pending', 44);
      if (!sent) {
        triggers.push({
          type: 'drafts_pending',
          priority: 3,
          message: `👀 Tenés ${drafts.n} posteos esperando tu revisión.\n\nEstán listos, solo falta tu OK para programarlos. ¿Los vemos juntos?`,
          push_title: '👀 Tenés posteos sin revisar',
          push_body: `${drafts.n} posteos te están esperando.`,
        });
      }
    }
  } catch (e) {}

  try {
    // 4. Necesito tus fotos (próximo posteo programado sin foto del cliente).
    // Si el usuario tiene <3 fotos en su librería y hay un borrador sin foto.
    const photos = db.prepare(`
      SELECT COUNT(*) AS n FROM assets
      WHERE user_id = ? AND kind = 'photo'
    `).get(userId);
    const draftNoPhoto = db.prepare(`
      SELECT id, caption FROM posts
      WHERE user_id = ? AND status = 'draft' AND client_photo = 0
      ORDER BY created_at DESC LIMIT 1
    `).get(userId);
    if (photos && photos.n < 3 && draftNoPhoto) {
      const sent = wasSentRecently(db, userId, 'need_photos', 72);
      if (!sent) {
        const cap = String(draftNoPhoto.caption || '').split('\n')[0].slice(0, 50);
        triggers.push({
          type: 'need_photos',
          priority: 4,
          message: `📸 Para que tu próximo posteo ("${cap}...") quede increíble, me vendría genial una foto real de tu producto/local.\n\n¿Me pasás 1 o 2 fotos? Las mejores publicaciones salen con tu material.`,
          push_title: '📸 ¿Me pasás unas fotos?',
          push_body: 'Tu próximo posteo va a quedar mucho mejor con fotos reales.',
        });
      }
    }
  } catch (e) {}

  try {
    // 5. Un posteo la rompió (>2x el promedio en 48h).
    const winner = db.prepare(`
      SELECT p.id, p.caption, p.ig_likes, p.ig_comments
      FROM posts p
      WHERE p.user_id = ? AND p.status = 'published'
      AND p.published_at > datetime('now', '-48 hours')
      AND (COALESCE(p.ig_likes, 0) + COALESCE(p.ig_comments, 0) * 3) > 0
      ORDER BY (COALESCE(p.ig_likes, 0) + COALESCE(p.ig_comments, 0) * 3) DESC
      LIMIT 1
    `).get(userId);
    if (winner) {
      const avg = db.prepare(`
        SELECT AVG(COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) AS a
        FROM posts WHERE user_id = ? AND status = 'published'
        AND published_at > datetime('now', '-30 days')
        AND published_at < datetime('now', '-48 hours')
      `).get(userId);
      const eng = (winner.ig_likes || 0) + (winner.ig_comments || 0) * 3;
      const avgEng = (avg && avg.a) || 0;
      if (avgEng > 0 && eng >= avgEng * 2) {
        const sent = wasSentRecently(db, userId, 'winner', 72);
        if (!sent) {
          const cap = String(winner.caption || '').split('\n')[0].slice(0, 50);
          const mult = (eng / avgEng).toFixed(1);
          triggers.push({
            type: 'winner',
            priority: 5,
            message: `🎉 ¡Tu posteo la rompió!\n\n"${cap}..."\n${mult}x tu promedio de engagement (${winner.ig_likes || 0} likes, ${winner.ig_comments || 0} comentarios).\n\n¿Hacemos más contenido así?`,
            push_title: '🎉 Tu posteo la rompió',
            push_body: `${mult}x tu promedio. Tocá para ver.`,
          });
        }
      }
    }
  } catch (e) {}

  // 6. Oportunidad (clima/fecha) — se implementa con reactive.js existente.
  // Por ahora lo dejamos como placeholder para no duplicar.

  // Devolver el de mayor prioridad (menor número).
  triggers.sort((a, b) => a.priority - b.priority);
  return triggers.length ? triggers[0] : null;
}

function wasSentRecently(db, userId, type, hours) {
  try {
    const r = db.prepare(`
      SELECT created_at FROM proactive_log
      WHERE user_id = ? AND idea_title = ?
      AND created_at > datetime('now', '-' || ? || ' hours')
      LIMIT 1
    `).get(userId, `[trigger:${type}]`, hours);
    return !!r;
  } catch (e) { return false; }
}

function logTrigger(db, userId, trigger) {
  try {
    db.prepare(`INSERT INTO proactive_log (user_id, idea_title) VALUES (?, ?)`)
      .run(userId, `[trigger:${trigger.type}]`);
  } catch (e) {
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS proactive_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        idea_title TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.prepare(`INSERT INTO proactive_log (user_id, idea_title) VALUES (?, ?)`)
        .run(userId, `[trigger:${trigger.type}]`);
    } catch (e2) {}
  }
  if (trigger.markSent) {
    try { trigger.markSent(); } catch (e) {}
  }
}

// Compatibilidad con la versión anterior.
function shouldSendProactive(db, userId) {
  const t = checkTriggers(db, userId);
  return t ? { ok: true, trigger: t } : { ok: false, reason: 'no_trigger' };
}

module.exports = {
  checkTriggers,
  logTrigger,
  wasSentRecently,
  shouldSendProactive,
  // pickSpontaneousIdea se mantiene por compatibilidad pero ya no se usa.
  pickSpontaneousIdea: () => ({ titulo: '', angulo: '' }),
};
