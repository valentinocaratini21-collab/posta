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

async function processDuePosts(db) {
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
      console.log(`[posta] Post #${post.id} publicado${result.demo ? ' (demo)' : ''}`);
    } catch (e) {
      db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`).run(
        String(e.message).slice(0, 500),
        post.id
      );
      console.error(`[posta] Post #${post.id} falló:`, e.message);
    }
  }
}

function startScheduler(db) {
  // Cada minuto
  cron.schedule('* * * * *', () => processDuePosts(db));
  console.log('[posta] Scheduler activo (cada 1 minuto)');
  // Chequeo inicial a los 10 segundos
  setTimeout(() => processDuePosts(db), 10000);
}

module.exports = { startScheduler, processDuePosts };
