// Scheduler — revisa cada minuto los posts programados vencidos y los publica.
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { publishPost, publishVideo } = require('./instagram');

function publicImageUrl(imagePath, imageBaseUrl, reqHost) {
  const file = path.basename(imagePath);
  const base =
    imageBaseUrl ||
    process.env.IMAGE_BASE_URL ||
    (reqHost ? `http://${reqHost}` : 'http://localhost:3000');
  return `${base.replace(/\/$/, '')}/media/${file}`;
}

function getSettings(db, userId) {
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId);
}

async function publishSinglePost(db, post) {
  const settings = getSettings(db, post.user_id) || {};
  const demoMode = settings.demo_mode !== 0;
  db.prepare(`UPDATE posts SET status = 'publishing', error = '' WHERE id = ?`).run(post.id);
  try {
    const mediaUrl = publicImageUrl(post.image_path, settings.image_base_url);
    const caption = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
    const creds = { igUserId: settings.ig_user_id, accessToken: settings.ig_access_token };
    const result =
      post.media_type === 'video'
        ? await publishVideo({ videoUrl: mediaUrl, caption }, creds, demoMode)
        : await publishPost({ imageUrl: mediaUrl, caption }, creds, demoMode);
    db.prepare(
      `UPDATE posts SET status = 'published', ig_permalink = ?, published_at = datetime('now') WHERE id = ?`
    ).run(result.permalink || '', post.id);
    // Loop inteligente fase 1: si salió sin que el cliente lo tocara, cuenta como aprobado.
    // No pisa una señal manual previa (ej: 👎 marcado antes de publicarse).
    try {
      const has = db.prepare('SELECT id FROM post_signals WHERE user_id = ? AND post_id = ?').get(post.user_id, post.id);
      if (!has) {
        const prof = db.prepare('SELECT category FROM profiles WHERE user_id = ?').get(post.user_id) || {};
        const d = new Date(post.scheduled_at || post.published_at || Date.now());
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const wk = d.toISOString().slice(0, 10);
        db.prepare(
          `INSERT INTO post_signals (user_id, post_id, hashtags, scheduled_for, rubro, client_signal, week_key)
           VALUES (?,?,?,?,?, 'approved', ?)`
        ).run(post.user_id, post.id, post.hashtags || '', post.scheduled_at || '', prof.category || '', wk);
      }
    } catch (e) { console.error('[posta] signal auto:', e.message); }
    console.log(`[posta] Post #${post.id} publicado${result.demo ? ' (demo)' : ''}`);
    return { ok: true, permalink: result.permalink || '' };
  } catch (e) {
    const msg = String(e.message).slice(0, 500);
    db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`).run(msg, post.id);
    console.error(`[posta] Post #${post.id} falló:`, e.message);
    return { ok: false, error: msg };
  }
}

async function processDuePosts(db) {
  // Recuperar posteos trabados en 'publishing' (ej: reinicio del servidor a mitad de publicación)
  try {
    db.prepare(`UPDATE posts SET status='scheduled', error='' WHERE status='publishing' AND scheduled_at < datetime('now', '-15 minutes')`).run();
  } catch (e) { /* tabla vieja sin scheduled_at: no bloquea */ }
  const now = new Date().toISOString();
  const due = db
    .prepare(
      `SELECT p.*, u.id AS uid FROM posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.status = 'scheduled' AND p.scheduled_at <= ?
       ORDER BY p.scheduled_at ASC LIMIT 5`
    )
    .all(now);

  for (const post of due) {
    await publishSinglePost(db, post);
  }
}

function startScheduler(db) {
  // Cada minuto
  cron.schedule('* * * * *', () => processDuePosts(db));
  console.log('[posta] Scheduler activo (cada 1 minuto)');
  // Chequeo inicial a los 10 segundos
  setTimeout(() => processDuePosts(db), 10000);
  // Recordatorio semanal por email: lunes 10:00 (Buenos Aires).
  // Solo a quienes tienen cuenta y NO instalaron la app en el teléfono.
  try {
    cron.schedule('0 10 * * 1', () => {
      sendWeeklyReminders(db).catch((e) => console.error('[email semanal]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Recordatorio semanal por email: lunes 10:00 (Buenos Aires)');
  } catch (e) {
    console.error('[email semanal] no se pudo programar:', e.message);
  }
  // Conciliación de descuentos con MercadoPago: cada 12 horas
  try {
    const { reconcileAll } = require('./billing-sync');
    cron.schedule('0 */12 * * *', () => {
      reconcileAll(db).catch((e) => console.error('[billing-sync]', e.message));
    });
    // Primera pasada a los 5 minutos del arranque (hace backfill si hace falta)
    setTimeout(() => {
      reconcileAll(db).catch((e) => console.error('[billing-sync]', e.message));
    }, 5 * 60 * 1000);
  } catch (e) {
    console.error('[billing-sync] no se pudo iniciar:', e.message);
  }
}

// Recordatorio semanal por email (lunes 10:00 Buenos Aires).
// Destinatarios: usuarios con email que NO instalaron la PWA en el teléfono,
// sin opt-out, con cuenta creada hace más de 1 día, en trial o plan activo.
async function sendWeeklyReminders(db) {
  const { emailConfigured, weeklyReminderEmail } = require('./email');
  if (!emailConfigured()) {
    console.log('[email semanal] sin RESEND_API_KEY: no se envía nada esta semana');
    return { sent: 0, skipped: 0, failed: 0, unconfigured: true };
  }
  const base = (process.env.BASE_URL || 'https://www.postahacetodo.com').replace(/\/$/, '');
  const users = db.prepare(`
    SELECT id, email FROM users
    WHERE email IS NOT NULL AND email != ''
      AND COALESCE(pwa_installed, 0) = 0
      AND COALESCE(email_opt_out, 0) = 0
      AND COALESCE(plan_status, 'trial') IN ('trial', 'active')
      AND datetime(created_at) < datetime('now', '-1 day')
  `).all();
  let sent = 0, failed = 0;
  for (const u of users) {
    try {
      const r = await weeklyReminderEmail(u, base);
      if (r && r.ok) sent++; else failed++;
    } catch (e) {
      failed++;
      console.error('[email semanal] falló', u.email, e.message);
    }
    await new Promise((r) => setTimeout(r, 400)); // no saturar el proveedor
  }
  console.log(`[email semanal] enviados: ${sent}, fallidos: ${failed}, candidatos: ${users.length}`);
  return { sent, failed };
}

module.exports = { startScheduler, processDuePosts, publishSinglePost, sendWeeklyReminders };
