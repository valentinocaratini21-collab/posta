// Scheduler — revisa cada minuto los posts programados vencidos y los publica.
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { publishPost, publishVideo, publishStory, publishCarousel } = require('./instagram');

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
    const isStory = post.media_type === 'story';
    const isCarousel = post.media_type === 'carousel';
    let carouselUrls = [];
    if (isCarousel) {
      try { carouselUrls = JSON.parse(post.carousel_paths || '[]'); } catch (e) { carouselUrls = []; }
      if (!Array.isArray(carouselUrls) || !carouselUrls.length) carouselUrls = [post.image_path];
      carouselUrls = carouselUrls.filter(Boolean).map(p => publicImageUrl(p, settings.image_base_url));
    }
    const result =
      post.media_type === 'video'
        ? await publishVideo({ videoUrl: mediaUrl, caption }, creds, demoMode)
        : isStory
          ? await publishStory({ imageUrl: mediaUrl }, creds, demoMode)
          : isCarousel
            ? await publishCarousel({ imageUrls: carouselUrls, caption }, creds, demoMode)
            : await publishPost({ imageUrl: mediaUrl, caption }, creds, demoMode);
    db.prepare(
      `UPDATE posts SET status = 'published', ig_permalink = ?, ig_media_id = ?, published_at = datetime('now') WHERE id = ?`
    ).run(result.permalink || '', result.mediaId || '', post.id);
    // Funnel: primera publicación del usuario
    try {
      const n = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'`).get(post.user_id).n;
      if (n <= 1) db.prepare(`INSERT INTO funnel_events (user_id, event) VALUES (?, 'first_published')`).run(post.user_id);
    } catch (e) { /* el tracking nunca bloquea */ }
    // La racha se alimenta con cada publicación (regla 72h)
    try { require('./streaks').feedStreak(db, post.user_id); } catch (e) {}
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
    // Aviso "ya salió": la prueba de que se publica solo (respeta opt-out, no en demo)
    // El primer posteo se celebra como un hito en email y push.
    let isFirstPost = false;
    try {
      const c = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'").get(post.user_id);
      isFirstPost = (c && c.n <= 1);
    } catch (e) {}
    try {
      if (!result.demo) {
        const u = db.prepare('SELECT email, name, COALESCE(email_opt_out,0) AS oo FROM users WHERE id = ?').get(post.user_id);
        if (u && u.email && !u.oo) {
          const { publishedEmail } = require('./email');
          const base = (process.env.BASE_URL || 'https://www.postahacetodo.com').replace(/\/$/, '');
          await publishedEmail(u, post, base, result.permalink || '', isFirstPost);
        }
      }
    } catch (e) { console.error('[email ya-salió]', e.message); }
    // Push "¡tu posteo ya salió!": avisa en el celu (respeta opt-out como el email, no en demo)
    try {
      if (!result.demo) {
        const { sendPush } = require('./push');
        const oo = db.prepare('SELECT COALESCE(email_opt_out,0) AS oo FROM users WHERE id = ?').get(post.user_id);
        if (!oo || !oo.oo) {
          await sendPush(post.user_id, isFirstPost ? {
            title: '🎉 ¡Tu primer posteo ya salió!',
            body: 'Posty lo publicó en tu Instagram. El primero de muchísimos 😍',
            url: '/#/app/semana',
          } : {
            title: '\u00A1Tu posteo ya sali\u00F3! \uD83D\uDCF2',
            body: 'Posty lo public\u00F3 en tu Instagram \uD83D\uDC4F',
            url: '/#/app/semana',
          });
        }
      }
    } catch (e) { console.error('[push ya-salió]', e.message); }
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
  // Nudge "ya tenemos tus posteos listos": todos los días 10:30 (Buenos Aires).
  // Solo a usuarios con borradores sin revisar o semana vacía, con topes anti-spam.
  try {
    cron.schedule('30 10 * * *', () => {
      sendContentNudges(db).catch((e) => console.error('[nudges]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Nudge de contenido por email: todos los días 10:30 (Buenos Aires)');
  } catch (e) {
    console.error('[nudges] no se pudo programar:', e.message);
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
  // Reporte semanal de resultados: domingo 19:30 (Buenos Aires).
  // "Tu semana en números": alcance, likes y mejor posteo de los últimos 7 días.
  try {
    cron.schedule('30 19 * * 0', () => {
      sendWeeklyReports(db).catch((e) => console.error('[reporte semanal]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Reporte semanal de resultados: domingo 19:30 (Buenos Aires)');
  } catch (e) {
    console.error('[reporte semanal] no se pudo programar:', e.message);
  }
  // Comentarios de Instagram: 9:00 y 17:00 (Buenos Aires).
  // Baja comentarios nuevos y deja la respuesta sugerida lista en la cola.
  try {
    cron.schedule('0 9,17 * * *', () => {
      syncAllComments(db).catch((e) => console.error('[comentarios]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Sync de comentarios: 9:00 y 17:00 (Buenos Aires)');
  } catch (e) {
    console.error('[comentarios] no se pudo programar:', e.message);
  }
  // Mejor horario de publicación: lunes 6:00 (Buenos Aires), una vez por semana.
  try {
    cron.schedule('0 6 * * 1', () => {
      refreshBestHours(db).catch((e) => console.error('[best-hour]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Refresh de mejor horario: lunes 6:00 (Buenos Aires)');
    // Primera pasada a los 3 minutos del arranque
    setTimeout(() => {
      refreshBestHours(db).catch((e) => console.error('[best-hour]', e.message));
    }, 3 * 60 * 1000);
  } catch (e) {
    console.error('[best-hour] no se pudo programar:', e.message);
  }
  // Análisis profundo de Instagram semanal: lunes 9:00 (Buenos Aires).
  // Track B "Conocer al cliente a fondo": aprende qué rinde en cada cuenta con IG
  // conectado y guarda los learnings en content_learnings (1 llamada GPT por usuario).
  try {
    cron.schedule('0 9 * * 1', () => {
      refreshContentLearnings(db).catch((e) => console.error('[learnings]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Análisis profundo de Instagram: lunes 9:00 (Buenos Aires)');
  } catch (e) {
    console.error('[learnings] no se pudo programar:', e.message);
  }
  // Minería de comentarios de Instagram: día 1 de cada mes, 8:00 (Buenos Aires).
  // Track 1 "Expertos en información": por cada usuario con IG conectado, lee los
  // últimos ~20 posteos + sus comentarios y gpt-4o-mini extrae preguntas frecuentes,
  // objeciones y deseos al ADN (fuente '💬 Comentarios IG'). Solo lee, nunca publica.
  // Respeta el cache de 30 días: saltea a quienes ya analizaron recientemente.
  try {
    cron.schedule('0 8 1 * *', () => {
      refreshIgComments(db).catch((e) => console.error('[ig-comments]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Minería de comentarios de IG: día 1 de cada mes, 8:00 (Buenos Aires)');
  } catch (e) {
    console.error('[ig-comments] no se pudo programar:', e.message);
  }
  // Historias recientes de IG semanal: lunes 8:00 (Buenos Aires).
  // Track 5 "Expertos en información": por cada usuario con IG conectado, lee
  // las historias de las últimas 24h y extrae promos/anuncios al ADN
  // (fuente '📱 Historias'). Solo lee, nunca publica. 1 llamada de visión
  // (gpt-4o, detail low) por historia con imagen. Saltea a quienes ya se
  // analizaron en los últimos 6 días.
  try {
    cron.schedule('0 8 * * 1', () => {
      syncStoriesDna(db).catch((e) => console.error('[stories]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Análisis de historias de IG: lunes 8:00 (Buenos Aires)');
  } catch (e) {
    console.error('[stories] no se pudo programar:', e.message);
  }
  // Pipeline perpetuo (Track 4): lunes 7:00 (Buenos Aires), respaldo del trigger
  // inline de /api/posts/schedule-all. Para cada usuario que cumple los 4 gates
  // (plan/trial vigente, activo 7 días, sin borradores de la próxima semana,
  // pipeline vivo 14 días) genera los borradores de la semana que viene.
  // Solo BORRADORES: nada se programa ni publica sin el tap del usuario.
  // Require perezoso DENTRO del callback: server.js ya está cargado a esta
  // altura (es quien requiere este módulo), así que no se re-ejecuta.
  try {
    cron.schedule('0 7 * * 1', () => {
      try {
        const srv = require('./server');
        if (srv && typeof srv.nextWeekSweep === 'function') {
          srv.nextWeekSweep().catch((e) => console.error('[next-week sweep]', e.message));
        }
      } catch (e) { console.error('[next-week sweep] no se pudo cargar el pipeline:', e.message); }
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Pipeline perpetuo (borradores semana+1): lunes 7:00 (Buenos Aires)');
  } catch (e) {
    console.error('[next-week sweep] no se pudo programar:', e.message);
  }
}

// Recordatorio semanal por email (lunes 10:00 Buenos Aires).
// Destinatarios: usuarios con email que NO instalaron la PWA en el teléfono,
// sin opt-out, con cuenta creada hace más de 1 día, en trial o plan activo.
async function sendWeeklyReminders(db) {
  const { emailConfigured, weeklyReminderEmail } = require('./email');
  const streaks = require('./streaks');
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
      const st = getSettings(db, u.id) || {};
      const tz = st.timezone || 'America/Argentina/Buenos_Aires';
      const weekKey = streaks.mondayKeyOf(streaks.tzToday(tz));
      const sk = streaks.publicStreak(db, u.id, weekKey, streaks.tzToday(tz));
      // Misión de fotos de la semana: se genera el lunes y viaja en el email
      let missionShots = null;
      try {
        const { getOrCreateMission } = require('./photo-mission');
        const pm = await getOrCreateMission(db, u.id);
        missionShots = pm.shots;
      } catch (e) { console.error('[email semanal] misión:', e.message); }
      const r = await weeklyReminderEmail(u, base, sk, missionShots);
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

// Nudge diario "ya tenemos tus posteos listos" (todos los días 10:30 Buenos Aires).
// REGLA DE ORO: el mensaje solo se manda si es verdad.
//  - Caso A (borradores sin revisar): el usuario generó pero no revisó hace >24h
//    y no tiene nada programado/publicado en los últimos 7 días → email "listos".
//  - Caso B (semana vacía): sin borradores y sin nada programado → email honesto
//    que NO promete posteos inexistentes, invita a armarlos en 2 minutos.
// Topes anti-spam: sin nudge en los últimos 3 días, respeta email_opt_out,
// solo trial o plan activo, cuenta con más de 1 día.
async function sendContentNudges(db) {
  const { emailConfigured, draftsNudgeEmail, emptyWeekEmail } = require('./email');
  if (!emailConfigured()) {
console.log('[nudges] sin RESEND_API_KEY: <redacted>');
    return { sent: 0, skipped: 0 };
  }
  const base = (process.env.BASE_URL || 'https://www.postahacetodo.com').replace(/\/$/, '');
  const users = db.prepare(`
    SELECT u.id, u.email, p.business_name FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.email IS NOT NULL AND u.email != ''
      AND COALESCE(u.email_opt_out, 0) = 0
      AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
      AND datetime(u.created_at) < datetime('now', '-1 day')
      AND NOT EXISTS (
        SELECT 1 FROM nudges n
        WHERE n.user_id = u.id AND datetime(n.sent_at) > datetime('now', '-3 days')
      )
  `).all();
  let sent = 0, skipped = 0;
  for (const u of users) {
    try {
      // ¿Tiene algo programado o publicado en los últimos 7 días? → está al día, no molestar
      const live = db.prepare(`
        SELECT COUNT(*) AS c FROM posts
        WHERE user_id = ? AND status IN ('scheduled', 'publishing', 'published')
          AND COALESCE(scheduled_at, published_at, created_at) > datetime('now', '-7 days')
      `).get(u.id).c;
      if (live > 0) { skipped++; continue; }
      // Borradores generados hace más de 24h y todavía sin revisar
      const drafts = db.prepare(`
        SELECT COUNT(*) AS c FROM posts
        WHERE user_id = ? AND status = 'draft'
          AND datetime(created_at) < datetime('now', '-1 day')
      `).get(u.id).c;
      const name = (u.business_name || '').trim() || u.email.split('@')[0];
      if (drafts > 0) {
        const r = await draftsNudgeEmail({ email: u.email, name, count: drafts }, base);
        if (r && r.ok) {
          db.prepare(`INSERT INTO nudges (user_id, kind) VALUES (?, 'drafts')`).run(u.id);
          sent++;
        }
      } else {
        const r = await emptyWeekEmail({ email: u.email, name }, base);
        if (r && r.ok) {
          db.prepare(`INSERT INTO nudges (user_id, kind) VALUES (?, 'empty')`).run(u.id);
          sent++;
        }
      }
    } catch (e) {
      console.error('[nudges] error con usuario', u.id, e.message);
    }
    await new Promise((r) => setTimeout(r, 400)); // no saturar el proveedor
  }
  console.log(`[nudges] enviados: ${sent}, omitidos (al día): ${skipped}, candidatos: ${users.length}`);
  return { sent, skipped };
}

// Reporte semanal de resultados (domingo 19:30 Buenos Aires).
// A cada usuario con posteos publicados en los últimos 7 días: alcance, likes
// y mejor posteo. La prueba visible de que Posta funciona.
async function sendWeeklyReports(db) {
  const { emailConfigured, weeklyReportEmail } = require('./email');
  const { getCreds, fetchMediaInsights } = require('./insights');
  if (!emailConfigured()) {
    console.log('[reporte semanal] sin RESEND_API_KEY: <redacted>');
    return { sent: 0 };
  }
  const base = (process.env.BASE_URL || 'https://www.postahacetodo.com').replace(/\/$/, '');
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.email, u.name FROM users u
    JOIN posts p ON p.user_id = u.id
    WHERE p.status = 'published'
      AND datetime(p.published_at) >= datetime('now', '-7 days')
      AND u.email IS NOT NULL AND u.email != ''
      AND COALESCE(u.email_opt_out, 0) = 0
      AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
  `).all();
  let sent = 0;
  for (const u of users) {
    try {
      const creds = getCreds(db, u.id);
      const posts = db.prepare(`
        SELECT id, caption, image_path, media_type, ig_media_id, published_at FROM posts
        WHERE user_id = ? AND status = 'published'
          AND datetime(published_at) >= datetime('now', '-7 days')
          AND COALESCE(ig_media_id, '') != '' AND ig_media_id NOT LIKE 'demo_%'
        ORDER BY published_at DESC LIMIT 10
      `).all(u.id);
      if (!posts.length) continue;
      const rows = [];
      for (const p of posts) {
        let m = db.prepare('SELECT reach, likes, comments, saved FROM post_metrics WHERE post_id = ?').get(p.id);
        if (creds) {
          try {
            const fresh = await fetchMediaInsights(p.ig_media_id, creds.accessToken);
            db.prepare(`INSERT INTO post_metrics (post_id, reach, likes, comments, saved, fetched_at)
                        VALUES (?,?,?,?,?,datetime('now'))
                        ON CONFLICT(post_id) DO UPDATE SET reach=excluded.reach, likes=excluded.likes,
                        comments=excluded.comments, saved=excluded.saved, fetched_at=excluded.fetched_at`)
              .run(p.id, fresh.reach, fresh.likes, fresh.comments, fresh.saved);
            m = fresh;
          } catch (e) { console.error('[reporte] métricas post', p.id, e.message); }
        }
        rows.push({ caption: p.caption, image_path: p.image_path, media_type: p.media_type, ...(m || {}) });
        await new Promise((r) => setTimeout(r, 300));
      }
      const r = await weeklyReportEmail({ email: u.email, name: u.name }, base, rows);
      if (r && r.ok) sent++;
    } catch (e) {
      console.error('[reporte semanal] falló', u.email, e.message);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`[reporte semanal] enviados: ${sent} de ${users.length}`);
  return { sent };
}

// Baja comentarios nuevos de todos los usuarios con IG conectado (2x por día).
async function syncAllComments(db) {
  const { syncComments } = require('./insights');
  const { suggestReply } = require('./generator');
  const users = db.prepare(`
    SELECT u.id FROM users u JOIN settings s ON s.user_id = u.id
    WHERE s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
      AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
  `).all();
  let total = 0;
  for (const u of users) {
    try {
      const st = getSettings(db, u.id) || {};
      const apiKey = st.openai_key || process.env.OPENAI_API_KEY || '';
      total += await syncComments(db, u.id, suggestReply, apiKey);
    } catch (e) { console.error('[comentarios] usuario', u.id, e.message); }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (total) console.log(`[comentarios] ${total} comentarios nuevos en cola`);
  return { fresh: total };
}

// Mejor horario por cuenta (1x por semana): hora con más seguidores conectados.
async function refreshBestHours(db) {
  const { getCreds, fetchBestHour } = require('./insights');
  const users = db.prepare(`
    SELECT u.id FROM users u JOIN settings s ON s.user_id = u.id
    WHERE s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
      AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
  `).all();
  let updated = 0;
  for (const u of users) {
    try {
      const creds = getCreds(db, u.id);
      if (!creds) continue;
      const h = await fetchBestHour(creds.igUserId, creds.accessToken);
      if (h !== null && h !== undefined) {
        db.prepare('UPDATE users SET best_hour = ? WHERE id = ?').run(h, u.id);
        updated++;
      }
    } catch (e) { console.error('[best-hour] usuario', u.id, e.message); }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (updated) console.log(`[best-hour] actualizado para ${updated} usuarios`);
  return { updated };
}

// Track B: análisis profundo de Instagram semanal (lunes 9:00 Buenos Aires).
// "Conocer al cliente a fondo": por cada usuario con IG conectado corre
// analyzeInstagramDeep y guarda los learnings en content_learnings.
// 1 llamada GPT por análisis (por usuario), nada en loops calientes.
// Si no hay API key o no hay usuarios, no hace nada. Errores nunca rompen el server.
async function refreshContentLearnings(db) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[learnings] sin OPENAI_API_KEY: se saltea el análisis esta semana');
    return { updated: 0 };
  }
  const { analyzeInstagramDeep } = require('./instagram');
  const users = db.prepare(`
    SELECT u.id FROM users u JOIN settings s ON s.user_id = u.id
    WHERE s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
      AND s.ig_access_token IS NOT NULL AND s.ig_access_token != ''
      AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
  `).all();
  if (!users.length) return { updated: 0 };
  let updated = 0;
  for (const u of users) {
    try {
      const st = getSettings(db, u.id) || {};
      const r = await analyzeInstagramDeep(st.ig_user_id, st.ig_access_token);
      if (r && r.learnings) {
        db.prepare(`INSERT INTO content_learnings (user_id, learnings_json, updated_at) VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET learnings_json=excluded.learnings_json, updated_at=datetime('now')`)
          .run(u.id, JSON.stringify(r.learnings));
        updated++;
      }
    } catch (e) { console.error('[learnings] usuario', u.id, e.message); }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (updated) console.log(`[learnings] learnings actualizados para ${updated} usuarios`);
  return { updated };
}

// Track 1 "Expertos en información": minería mensual de comentarios de IG.
// Por cada usuario con IG conectado corre mineComments (solo lee) y guarda
// preguntas frecuentes / objeciones / deseos en el ADN con fuente '💬 Comentarios IG'.
// Respeta el cache de 30 días (dna.comments_analyzed_at). 1 llamada GPT por usuario.
// Errores nunca rompen el server.
async function refreshIgComments(db) {
  if (!process.env.OPENAI_API_KEY) {
    console.log('[ig-comments] sin OPENAI_API_KEY: se saltea la minería este mes');
    return { updated: 0 };
  }
  const { mineComments, buildDnaPatch } = require('./ig-comments');
  const FRESH_MS = 30 * 24 * 3600 * 1000;
  const users = db.prepare(`
    SELECT u.id FROM users u JOIN settings s ON s.user_id = u.id
    WHERE s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
      AND s.ig_access_token IS NOT NULL AND s.ig_access_token != ''
      AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
  `).all();
  if (!users.length) return { updated: 0 };
  let updated = 0;
  for (const u of users) {
    try {
      let dna = {};
      try {
        const row = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(u.id);
        if (row && row.dna_json) { const o = JSON.parse(row.dna_json); dna = (o && typeof o === 'object') ? o : {}; }
      } catch (e) { /* sin ADN: arranca vacío */ }
      const at = dna.comments_analyzed_at || '';
      if (at && (Date.now() - Date.parse(at)) < FRESH_MS) continue; // cache 30 días
      const st = getSettings(db, u.id) || {};
      const r = await mineComments(st.ig_user_id, st.ig_access_token, process.env.OPENAI_API_KEY);
      if (r.error) { console.error('[ig-comments] usuario', u.id, r.error); continue; }
      const patch = buildDnaPatch(dna, r);
      db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET dna_json=excluded.dna_json, updated_at=datetime('now')`)
        .run(u.id, JSON.stringify({ ...dna, ...patch }));
      updated++;
    } catch (e) { console.error('[ig-comments] usuario', u.id, e.message); }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (updated) console.log(`[ig-comments] comentarios analizados para ${updated} usuarios`);
  return { updated };
}

// Track 5: análisis semanal de historias recientes de IG.
// Por cada usuario con IG conectado: lee las historias de las últimas 24h y
// guarda promos/anuncios en el ADN (fuente '📱 Historias'). Se saltea si ya se
// analizó en los últimos 6 días (evita re-corridas si el cron se retrasa).
// Errores nunca rompen el server.
async function syncStoriesDna(db) {
  const { analyzeStories, storiesDnaPatch } = require('./ig-stories');
  const users = db.prepare(`
    SELECT u.id FROM users u JOIN settings s ON s.user_id = u.id
    WHERE s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
      AND s.ig_access_token IS NOT NULL AND s.ig_access_token != ''
      AND COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
  `).all();
  if (!users.length) return { updated: 0 };
  let updated = 0;
  for (const u of users) {
    try {
      const st = getSettings(db, u.id) || {};
      const apiKey = st.openai_key || process.env.OPENAI_API_KEY || '';
      if (!apiKey) continue;
      const cur = readDnaSync(db, u.id);
      const analyzedAt = cur.stories_analyzed_at || '';
      if (analyzedAt && (Date.now() - Date.parse(analyzedAt)) < 6 * 24 * 3600 * 1000) continue;
      const r = await analyzeStories(st.ig_user_id, st.ig_access_token, apiKey);
      if (r && r.ok) {
        writeDnaSync(db, u.id, { ...cur, ...storiesDnaPatch(cur, r) });
        updated++;
      }
    } catch (e) { console.error('[stories] usuario', u.id, e.message); }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (updated) console.log(`[stories] historias analizadas para ${updated} usuarios`);
  return { updated };
}

// ADN local del scheduler (server.js tiene sus propios readDna/writeDna).
function readDnaSync(db, userId) {
  try {
    const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    if (r && r.dna_json) { const o = JSON.parse(r.dna_json); return (o && typeof o === 'object') ? o : {}; }
  } catch (e) {}
  return {};
}
function writeDnaSync(db, userId, obj) {
  db.prepare(`INSERT INTO business_dna (user_id, dna_json, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET dna_json=excluded.dna_json, updated_at=datetime('now')`).run(userId, JSON.stringify(obj || {}));
}

module.exports = { startScheduler, processDuePosts, publishSinglePost, sendWeeklyReminders, sendContentNudges, sendWeeklyReports, syncAllComments, refreshBestHours, refreshContentLearnings, refreshIgComments, syncStoriesDna };
