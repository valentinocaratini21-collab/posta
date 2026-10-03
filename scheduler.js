// Scheduler — revisa cada minuto los posts programados vencidos y los publica.
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const { publishPost, publishVideo, publishStory, publishCarousel } = require('./instagram');
const approval = require('./approval');
const { activationNudge } = require('./activation-nudge');
const { firstPublishNudge } = require('./first-publish-nudge');

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

async function publishSinglePost(db, post, opts = {}) {
  // Red de seguridad FINAL: ningún camino (endpoint, chat, scheduler, links de
  // aprobación) puede publicar si la prueba del usuario venció. El posteo se
  // pausa con mensaje amable en vez de publicarse gratis. Excepción: dogfood
  // (Posty publicando en su propia cuenta, con aprobación explícita del dueño).
  if (!opts.house) {
  try {
    const u = db.prepare('SELECT plan_status, trial_ends_at, trial_extended_until, created_at FROM users WHERE id = ?').get(post.user_id);
    if (u && u.plan_status === 'trial' && trialExpiryEffectiveEnd(u, Date.now()) <= Date.now()) {
      db.prepare(`UPDATE posts SET status = 'paused', error = ? WHERE id = ?`)
        .run('Se terminó tu prueba gratis 😢 Elegí tu plan y seguimos publicando juntos.', post.id);
      console.log(`[posta] publishSinglePost bloqueado: trial vencido (user ${post.user_id}, post ${post.id})`);
      return { blocked: 'trial_expired' };
    }
  } catch (e) { /* ante la duda, seguir como antes */ }
  }
  // INVARIANTE: ningún posteo sale sin imagen, nunca solo palabras.
  // Si no tiene imagen válida, se pausa con mensaje claro (no silencioso).
  try {
    const { assertPublishable } = require('./image-fallback');
    const mediaDir = process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');
    const chk = assertPublishable(post, mediaDir);
    if (!chk.ok) {
      db.prepare(`UPDATE posts SET status = 'paused', error = ? WHERE id = ?`).run(chk.message, post.id);
      console.log(`[posta] publishSinglePost bloqueado: sin imagen (user ${post.user_id}, post ${post.id})`);
      return { blocked: 'no_image' };
    }
  } catch (e) { /* ante la duda, seguir como antes */ }
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
    // "Posty te avisa": la primera publicación del usuario marca el inicio de
    // su primera semana (durante esos 7 días los posteos requieren aprobación
    // explícita). Vale para cualquier vía de publicación (scheduler o "ahora").
    try {
      db.prepare(`UPDATE users SET first_post_at = datetime('now') WHERE id = ? AND (first_post_at IS NULL OR first_post_at = '')`).run(post.user_id);
    } catch (e) { /* no bloquea */ }
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
    // Aviso "ya salió": solo cuando importa — primer posteo (hito) o publicación
    // automática (el usuario no respondió al aviso de aprobación). Si lo aprobó
    // él hace 3 horas, ya lo sabe: no molestar. (respeta opt-out, no en demo)
    // El primer posteo se celebra como un hito en email y push.
    let isFirstPost = false;
    try {
      const c = db.prepare("SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'published'").get(post.user_id);
      isFirstPost = (c && c.n <= 1);
    } catch (e) {}
    const wasAuto = post.approval !== 'approved'; // 'pending'→auto o 'auto' ya marcado
    const notifyPublished = (isFirstPost || wasAuto) && !result.demo;
    try {
      if (notifyPublished) {
        const u = db.prepare('SELECT email, name, COALESCE(email_opt_out,0) AS oo FROM users WHERE id = ?').get(post.user_id);
        if (u && u.email && !u.oo) {
          const { publishedEmail } = require('./email');
          const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
          // Referido en el pico de dopamina: bloque discreto SOLO si le falta
          // (<2 referidos activos; activo = referred_by con plan_status 'active').
          let referralLink = '';
          try {
            const rc = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(post.user_id);
            const rr = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND plan_status = 'active'`).get(post.user_id);
            if (rc && rc.referral_code && (rr ? rr.n : 0) < 2) referralLink = `${base}/?ref=${rc.referral_code}`;
          } catch (e) { console.error('[email ya-salió] ref:', e.message); }
          await publishedEmail(u, post, base, result.permalink || '', isFirstPost, referralLink);
        }
      }
    } catch (e) { console.error('[email ya-salió]', e.message); }
    // Push "¡tu posteo ya salió!": solo primer posteo o publicación automática.
    try {
      if (notifyPublished) {
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
    // 🎉 Fiesta al publicar en el chat: Posty festeja cada posteo que sale
    // de VERDAD. Nunca en demo (ahí el post no está realmente en IG:
    // festejar sería mentirle al cliente).
    // El frontend detecta el marcador [celebrate] y dispara confetti+coreografía.
    // La URL del permalink va en texto plano (el chat no renderiza links cliqueables).
    // Es naturalmente idempotente: este bloque corre una sola vez, al publicar.
    try {
      if (!result.demo) {
        const fiesta = isFirstPost
          ? '¡Tu primer posteo con Posty ya está vivo! 🎉 Esto funciona de verdad 💪 [celebrate]'
          : '¡Ya está en tu Instagram! 🎉 [celebrate]';
        const msg = result.permalink ? `${fiesta}\n${result.permalink}` : fiesta;
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(post.user_id, 'assistant', msg);
      }
    } catch (e) { console.error('[chat fiesta]', e.message); }
    return { ok: true, permalink: result.permalink || '' };
  } catch (e) {
    const msg = String(e.message).slice(0, 500);
    db.prepare(`UPDATE posts SET status = 'failed', error = ? WHERE id = ?`).run(msg, post.id);
    console.error(`[posta] Post #${post.id} falló:`, e.message);
    return { ok: false, error: msg };
  }
}

// 🔴 Fix auditoría #1 (2026-09-30): el cron NO publica para quien no tiene
// plan activo ni trial vigente. Criterio = requireTrialValid de server.js:
// plan_status 'active' O fin efectivo del trial en el futuro.
function schedCanPublish(db, userId) {
  try {
    const u = db.prepare('SELECT plan_status, trial_ends_at, trial_extended_until, created_at FROM users WHERE id = ?').get(userId);
    if (!u) return true;
    if (u.plan_status === 'active') return true;
    return trialExpiryEffectiveEnd(u, Date.now()) > Date.now();
  } catch (e) { return true; } // ante la duda, no frenar el scheduler (paridad con requireTrialValid)
}

// Marca el posteo como 'paused' (status en TEXT libre, no requiere migración)
// y avisa UNA sola vez en el chat (users.trial_pause_notified se setea ANTES
// de insertar el mensaje, como win_celebrated en posts).
function pausePostTrialExpired(db, post) {
  try {
    db.prepare(`UPDATE posts SET status='paused', error='trial vencido' WHERE id=? AND status='scheduled'`).run(post.id);
    const u = db.prepare('SELECT trial_pause_notified FROM users WHERE id=?').get(post.user_id) || {};
    if (!u.trial_pause_notified) {
      db.prepare('UPDATE users SET trial_pause_notified=1 WHERE id=?').run(post.user_id);
      const msg = 'Tus posteos se pausaron porque terminó tu prueba 🥹 — reactivá tu plan y siguen solos ✨';
      db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(post.user_id, 'assistant', msg);
    }
    console.log(`[posta] Post #${post.id} pausado: trial vencido (usuario ${post.user_id})`);
  } catch (e) { console.error('[posta] pause trial:', e.message); }
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
    // 🔴 Fix auditoría #1: sin plan activo ni trial vigente, el posteo se
    // pausa en vez de publicarse (fuga de revenue).
    if (!schedCanPublish(db, post.user_id)) {
      pausePostTrialExpired(db, post);
      continue;
    }
    const ap = post.approval || 'pending';
    if (ap === 'rejected') {
      // Candado: el cliente lo rechazó → cancelado, nunca se publica.
      db.prepare(`UPDATE posts SET status='cancelled', error='' WHERE id = ?`).run(post.id);
      console.log(`[posta] Post #${post.id} cancelado (rechazado por el cliente)`);
      continue;
    }
    if (ap === 'pending') {
      if (approval.isFirstWeek(db, post.user_id)) {
        // Primera semana: sin aprobación explícita NO sale. Queda como fallido
        // y se avisa ("no se publicó porque no lo aprobaste").
        db.prepare(`UPDATE posts SET status='failed', error='sin aprobación' WHERE id = ?`).run(post.id);
        console.log(`[posta] Post #${post.id} no publicado: sin aprobación (primera semana)`);
        try { await approval.notifyMissed(db, post, 'first_week'); } catch (e) { console.error('[notif] missed:', e.message); }
        continue;
      }
      // Fuera de la primera semana: sale solo; si se publica, queda 'auto'.
      await publishSinglePost(db, post);
      try {
        const st = db.prepare(`SELECT status FROM posts WHERE id = ?`).get(post.id);
        if (st && st.status === 'published') {
          db.prepare(`UPDATE posts SET approval='auto' WHERE id = ?`).run(post.id);
        }
      } catch (e) { /* el publish ya informó su propio error */ }
      continue;
    }
    // 'approved' (o 'auto' ya marcado): publicar normal.
    await publishSinglePost(db, post);
  }
}

// "Posty te avisa": cada minuto, avisa los posteos programados para dentro de
// 3 horas que todavía no fueron notificados ni aprobados/rechazados.
async function processApprovalNotifications(db) {
  let rows = [];
  try {
    rows = db.prepare(`
      SELECT * FROM posts
      WHERE status = 'scheduled'
        AND COALESCE(approval, 'pending') = 'pending'
        AND COALESCE(notified, 0) = 0
        AND scheduled_at IS NOT NULL AND scheduled_at != ''
        AND datetime(scheduled_at, '-3 hours') <= datetime('now')
        AND scheduled_at > datetime('now')
    `).all();
  } catch (e) { return { sent: 0 }; } // tabla vieja: no bloquea el tick
  let sent = 0;
  for (const post of rows) {
    try {
      await approval.notifyApproval(db, post);
      db.prepare(`UPDATE posts SET notified = 1, notify_at = datetime('now') WHERE id = ?`).run(post.id);
      sent++;
    } catch (e) {
      console.error('[notif] post', post.id, e.message);
    }
  }
  if (sent) console.log(`[notif] avisos de aprobación enviados: ${sent}`);
  return { sent };
}

// 🎉 Festejo de wins EN EL CHAT (2026-09-30).
// Reglas duras (las pide la spec, literal):
//  - Para cada usuario con IG: posteos publicados en los últimos 7 días con
//    métricas en post_metrics (reach > 0).
//  - Se requieren >= 3 posteos con métricas para un promedio meaningful;
//    si no hay datos suficientes → SILENCIO TOTAL (ningún mensaje, para nadie).
//  - Gana si reach >= 1.4x el promedio del usuario Y reach >= 100.
//  - Mensaje: "Tu posteo del [día] llegó a [reach] — [X]% más que tu promedio 🚀 [celebrate]".
//  - Una vez por posteo (posts.win_celebrated); el flag se marca ANTES de
//    insertar el mensaje (anti-spam: nunca repetir, pase lo que pase).
//  - NUNCA se inventan números: todo sale de post_metrics. Sin datos → silencio.
const WIN_CHAT_FACTOR = 1.4;  // reach >= 1.4x el promedio del usuario
const WIN_CHAT_MIN_REACH = 100; // y reach >= 100
const WIN_CHAT_MIN_POSTS = 3; // promedio meaningful: >= 3 posteos con métricas
const DIAS_SEMANA_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const fmtMilesAR = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

async function celebrateWinsChat(db) {
  let users = [];
  try {
    users = db.prepare(`
      SELECT DISTINCT p.user_id AS id
      FROM posts p
      JOIN settings s ON s.user_id = p.user_id
      WHERE p.status = 'published'
        AND datetime(p.published_at) >= datetime('now', '-7 days')
        AND s.ig_user_id IS NOT NULL AND s.ig_user_id != ''
    `).all().map((r) => r.id);
  } catch (e) { console.error('[wins-chat] usuarios:', e.message); return { celebrated: 0 }; }
  let celebrated = 0;
  for (const uid of users) {
    try {
      // Baseline: últimos 7 días con reach > 0 (el flag win_celebrated NO entra
      // en el promedio: el promedio tiene que reflejar todos los posteos).
      const rows = db.prepare(`
        SELECT p.id,
               COALESCE(p.win_celebrated, 0) AS wc,
               CAST(strftime('%w', datetime(p.published_at, '-3 hours')) AS INTEGER) AS dow,
               pm.reach
        FROM posts p
        JOIN post_metrics pm ON pm.post_id = p.id
        WHERE p.user_id = ? AND p.status = 'published'
          AND datetime(p.published_at) >= datetime('now', '-7 days')
          AND pm.reach > 0
        ORDER BY p.published_at DESC
      `).all(uid);
      if (rows.length < WIN_CHAT_MIN_POSTS) continue; // sin datos suficientes → silencio
      const avg = rows.reduce((a, r) => a + Number(r.reach), 0) / rows.length;
      for (const r of rows) {
        if (r.wc) continue; // ya festejado
        const reach = Number(r.reach);
        if (!(reach >= WIN_CHAT_FACTOR * avg && reach >= WIN_CHAT_MIN_REACH)) continue;
        const pct = Math.round((reach / avg - 1) * 100);
        const dia = DIAS_SEMANA_ES[Number(r.dow)] || '';
        const msg = `Tu posteo del ${dia} llegó a ${fmtMilesAR(reach)} — ${pct}% más que tu promedio 🚀 [celebrate]`;
        // Marcar ANTES de insertar (anti-spam: nunca repetir aunque algo falle).
        db.prepare('UPDATE posts SET win_celebrated = 1 WHERE id = ?').run(r.id);
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(uid, 'assistant', msg);
        celebrated++;
      }
    } catch (e) { console.error('[wins-chat] usuario', uid, e.message); }
  }
  if (celebrated) console.log(`[wins-chat] festejos de chat enviados: ${celebrated}`);
  return { celebrated };
}

function startScheduler(db) {
  // Cada minuto: publicar vencidos + avisar aprobaciones pendientes (mismo tick)
  cron.schedule('* * * * *', () => {
    processDuePosts(db);
    processApprovalNotifications(db).catch((e) => console.error('[notif]', e.message));
    // Aviso pre-autopiloto (2026-10-02): push 30 min antes de publicar solo.
    autopilotPreNotify(db).catch((e) => console.error('[autopilot-notify]', e.message));
  });
  console.log('[posta] Scheduler activo (cada 1 minuto)');
  // Chequeo inicial a los 10 segundos
  setTimeout(() => {
    processDuePosts(db);
    processApprovalNotifications(db).catch((e) => console.error('[notif]', e.message));
  }, 10000);
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
  // 🧠 Resumen semanal de conocimiento de Posty: lunes 09:00 (Buenos Aires).
  // Cuenta lo que Posty aprendió de cada usuario en la semana y se lo cuenta
  // en el chat. Si no hay nada nuevo: silencio total.
  try {
    cron.schedule('0 9 * * 1', () => {
      postyWeeklyDigest(db).catch((e) => console.error('[posty-digest]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Resumen semanal de Posty: lunes 09:00 (Buenos Aires)');
  } catch (e) {
    console.error('[posty-digest] no se pudo programar:', e.message);
  }
  // 🎉 Momento WOW semanal (Punto 4, 2026-10-02): lunes 09:30 (Buenos Aires).
  // "Qué bueno que tengo esto": tu semana en números + tu mejor posteo.
  try {
    cron.schedule('30 9 * * 1', () => {
      weeklyWowSummary(db).catch((e) => console.error('[wow-semanal]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Momento WOW semanal: lunes 09:30 (Buenos Aires)');
  } catch (e) {
    console.error('[wow-semanal] no se pudo programar:', e.message);
  }
  // Email "tu semana te está esperando" (abandono de trial): todos los días
  // 10:00 (Buenos Aires). Solo leads NO registrados con email, 24-30h después
  // de generar su semana. Un solo email por lead (abandon_sent).
  try {
    cron.schedule('0 10 * * *', () => {
      sendTrialAbandonEmails(db).catch((e) => console.error('[abandono]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Email de abandono de trial: todos los días 10:00 (Buenos Aires)');
  } catch (e) {
    console.error('[abandono] no se pudo programar:', e.message);
  }
  // Email "mañana se termina tu prueba" (paywall): todos los días 10:00
  // (Buenos Aires). Solo a usuarios en trial cuyo fin efectivo cae en 20-28h.
  // Un solo email por cuenta (trial_expiry_email_sent, se setea antes de enviar).
  try {
    cron.schedule('0 10 * * *', () => {
      sendTrialExpiryEmails(db).catch((e) => console.error('[vence-mañana]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Email "vence mañana" (paywall): todos los días 10:00 (Buenos Aires)');
  } catch (e) {
    console.error('[vence-mañana] no se pudo programar:', e.message);
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
  // Nudge proactivo de activación día 2: todos los días 11:00 (Buenos Aires).
  // Si a las ~48h el usuario no completó el paso de mayor impacto, Posty le
  // manda UN mensaje en el chat. Una sola vez por usuario (activation_nudged).
  try {
    cron.schedule('0 11 * * *', () => {
      activationNudge(db);
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Nudge de activación día 2: 11:00 (Buenos Aires)');
  } catch (e) {
    console.error('[nudge-activacion] no se pudo programar:', e.message);
  }
  // Nudge "¿publicamos tu primero?": todos los días 12:00 (Buenos Aires).
  // Solo a usuarios con trial activo y 0 posteos publicados, 24h+ de creados
  // (saltea la ventana 36-60h del nudge de activación: no dos mensajes el
  // mismo día). Una sola vez por usuario (first_publish_nudged).
  try {
    cron.schedule('0 12 * * *', () => {
      firstPublishNudge(db);
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Nudge primer posteo: 12:00 (Buenos Aires)');
  } catch (e) {
    console.error('[nudge-primer-posteo] no se pudo programar:', e.message);
  }
  // Email día 2 "publicá tu primero": todos los días 14:00 (Buenos Aires).
  // Solo a usuarios con 0 posteos publicados, con CTA directo a publicar el
  // primer borrador en la app. Un solo email por cuenta (nudges.kind =
  // 'first_publish', se inserta ANTES de enviar).
  try {
    cron.schedule('0 14 * * *', () => {
      sendFirstPublishEmails(db).catch((e) => console.error('[primer-posteo]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Email día 2 "publicá tu primero": 14:00 (Buenos Aires)');
  } catch (e) {
    console.error('[primer-posteo] no se pudo programar:', e.message);
  }
  // 💡 Posty proactivo (Punto 2, 2026-10-02): todos los días 11:00 (Buenos Aires).
  // Si el usuario no estuvo activo, Posty le escribe con una idea espontánea.
  try {
    cron.schedule('0 11 * * *', () => {
      proactiveIdeas(db).catch((e) => console.error('[proactivo]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Posty proactivo: todos los días 11:00 (Buenos Aires)');
  } catch (e) {
    console.error('[proactivo] no se pudo programar:', e.message);
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
  // "Posty festeja tus wins": todos los días 11:00 (Buenos Aires).
  // Si un posteo publicado en las últimas 48h rinde >= 2x tu promedio,
  // Posty te lo festeja por push + email. Máximo 1 festejo por día.
  try {
    const { celebrateWins } = require('./wins');
    cron.schedule('0 11 * * *', () => {
      celebrateWins(db).catch((e) => console.error('[wins]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Festejo de wins: todos los días 11:00 (Buenos Aires)');
  } catch (e) {
    console.error('[wins] no se pudo programar:', e.message);
  }
  // 🎉 Festejo de wins en el chat: todos los días 18:00 (Buenos Aires).
  // Si un posteo publicado en los últimos 7 días rinde >= 1.4x el promedio
  // del usuario (reach >= 100, con al menos 3 posteos con métricas), Posty lo
  // festeja EN EL CHAT con el marcador [celebrate]. Silencio total si no hay
  // datos suficientes. No pisa el festejo de wins.js (11:00, push+email).
  try {
    cron.schedule('0 18 * * *', () => {
      celebrateWinsChat(db).catch((e) => console.error('[wins-chat]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Festejo de wins en el chat: todos los días 18:00 (Buenos Aires)');
  } catch (e) {
    console.error('[wins-chat] no se pudo programar:', e.message);
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
  // Nudges proactivos de Posty: chequeo DIARIO (Buenos Aires). Cada día, por cada
  // usuario al que le falta algo (foto > voz > estilo), si pasaron entre 6 y 9 días
  // (umbral aleatorio por ciclo) desde su último nudge, crea uno nuevo. Resultado:
  // ~1 pregunta por semana, en momentos distintos cada vez. El cliente lo ve como
  // mensaje de Posty en el chat la próxima vez que entra.
  try {
    cron.schedule('0 11 * * *', () => {
      postyNudgesDaily(db).catch((e) => console.error('[nudges]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Nudges proactivos de Posty: chequeo diario 11:00 (Buenos Aires)');
  } catch (e) {
    console.error('[nudges] no se pudo programar:', e.message);
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
  // Learning loop (learning.js): todos los días 3:30 (Buenos Aires) lee insights
  // de posteos publicados con IG conectado y registra qué estilos rinden por cliente.
  // Posty "le pega cada vez más" sin que el cliente configure nada.
  try {
    cron.schedule('30 3 * * *', () => {
      ingestLearningLoop(db).catch((e) => console.error('[learning-ingest]', e.message));
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Learning loop: ingesta diaria 3:30 (Buenos Aires)');
  } catch (e) {
    console.error('[learning-ingest] no se pudo programar:', e.message);
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

  // --- Posty Pro: stories automáticas, community y contenido reactivo ---
  try {
    cron.schedule('0 12 * * *', () => {
      try {
        require('./stories').dailyStories(db, proStoryDeps(db))
          .catch((e) => console.error('[stories]', e.message));
      } catch (e) { console.error('[stories] no se pudo ejecutar:', e.message); }
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Stories automáticas: 12:00 (Buenos Aires)');
  } catch (e) { console.error('[stories] no se pudo programar:', e.message); }
  try {
    cron.schedule('0 9,18 * * *', () => {
      try {
        require('./community').pollCommunity(db, proCommunityDeps(db))
          .catch((e) => console.error('[community]', e.message));
      } catch (e) { console.error('[community] no se pudo ejecutar:', e.message); }
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Community (comentarios): 9:00 y 18:00 (Buenos Aires)');
  } catch (e) { console.error('[community] no se pudo programar:', e.message); }
  try {
    cron.schedule('0 8 * * *', () => {
      try {
        require('./reactive').checkReactive(db, proReactiveDeps(db))
          .catch((e) => console.error('[reactive]', e.message));
      } catch (e) { console.error('[reactive] no se pudo ejecutar:', e.message); }
    }, { timezone: 'America/Argentina/Buenos_Aires' });
    console.log('[posta] Contenido reactivo: 8:00 (Buenos Aires)');
  } catch (e) { console.error('[reactive] no se pudo programar:', e.message); }

  // --- Posty dogfood: Posty como su propio primer cliente ---
  // Lun–vie publica en DOGFOOD_POST_TIME (default 18:00, DOGFOOD_TZ).
  // Generador: cada hora genera el draft del día con scheduled_for (si es
  // día de semana y falta >30min para el slot). Ticker cada minuto: notifica
  // en T-1min (push → email → badge) y auto-publica en T+2h sin respuesta.
  // Sáb/dom: cero ruido.
  const DOGFOOD_TZ = process.env.DOGFOOD_TZ || 'America/Argentina/Buenos_Aires';
  try {
    cron.schedule('7 * * * *', () => {
      try {
        require('./dogfood').generateDogfoodSlot(db, { mediaDir: PRO_MEDIA_DIR })
          .catch((e) => console.error('[dogfood]', e.message));
      } catch (e) { console.error('[dogfood] no se pudo generar:', e.message); }
    }, { timezone: DOGFOOD_TZ });
    console.log('[posta] Dogfood generador: cada hora, lun–vie (' + DOGFOOD_TZ + ')');
  } catch (e) { console.error('[dogfood] no se pudo programar el generador:', e.message); }
  try {
    cron.schedule('* * * * *', () => {
      try {
        require('./dogfood').tickDogfood(db, {
          mediaDir: PRO_MEDIA_DIR,
          publishFn: (d, post) => publishSinglePost(d, post, { house: true }),
        }).catch((e) => console.error('[dogfood] tick:', e.message));
      } catch (e) { console.error('[dogfood] no se pudo ejecutar el tick:', e.message); }
    }, { timezone: DOGFOOD_TZ });
    console.log('[posta] Dogfood ticker: cada minuto (' + DOGFOOD_TZ + ')');
  } catch (e) { console.error('[dogfood] no se pudo programar el ticker:', e.message); }
}

// ---------------------------------------------------------------------------
// Deps compartidas para stories/community/reactive (scheduler).
// Todo con db directo: sin dependencia de server.js (evita circulares).
// ---------------------------------------------------------------------------
const PRO_MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'data', 'media');

function proBrandOf(db, uid) {
  let business = '', bgHex = '#0A1E33', logoAbs = null;
  try {
    const p = db.prepare('SELECT business_name FROM profiles WHERE user_id = ?').get(uid) || {};
    business = String(p.business_name || '');
  } catch (e) {}
  try {
    const s = db.prepare('SELECT brand_colors FROM settings WHERE user_id = ?').get(uid) || {};
    const m = String(s.brand_colors || '').match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}/);
    if (m) bgHex = m[0];
  } catch (e) {}
  try {
    const r = db.prepare(
      `SELECT file_path FROM assets WHERE user_id = ? AND kind = 'logo' ORDER BY id ASC LIMIT 1`).get(uid);
    const ap = r && path.join(PRO_MEDIA_DIR, path.basename(String(r.file_path || '')));
    if (ap && fs.existsSync(ap)) logoAbs = ap;
  } catch (e) {}
  return { business, bgHex, textHex: '#FFFFFF', logoAbs };
}

function proBusinessOf(db, uid) {
  try {
    return String((db.prepare('SELECT business_name FROM profiles WHERE user_id = ?').get(uid) || {}).business_name || '');
  } catch (e) { return ''; }
}

function proStoryDeps(db) {
  return {
    mediaDir: PRO_MEDIA_DIR,
    getBrand: (uid) => proBrandOf(db, uid),
    getCtx: (uid) => {
      const ctx = {};
      try {
        const p = db.prepare(
          `SELECT caption, image_path FROM posts WHERE user_id = ? AND media_type = 'image'
           AND date(created_at) = date('now') ORDER BY id DESC LIMIT 1`).get(uid);
        if (p) {
          ctx.postCaption = String(p.caption || '').split('\n')[0];
          const abs = p.image_path && p.image_path.startsWith('/media/')
            ? path.join(PRO_MEDIA_DIR, path.basename(p.image_path)) : null;
          if (abs && fs.existsSync(abs)) ctx.postImageAbs = abs;
        }
      } catch (e) {}
      return ctx;
    },
  };
}

function proCommunityDeps(db) {
  let brief = null, cstyle = null;
  try { brief = require('./client-brief'); } catch (e) {}
  try { cstyle = require('./caption-style'); } catch (e) {}
  return {
    getBriefBlock: (uid) => { try { return brief.briefBlockFor(db, uid); } catch (e) { return ''; } },
    getStyleBlock: (uid) => {
      try { return cstyle.captionStyleBlock(cstyle.getCaptionStyle(db, uid)); }
      catch (e) { return ''; }
    },
    getBusiness: (uid) => proBusinessOf(db, uid),
    getApiKey: (uid) => {
      try {
        const s = db.prepare('SELECT openai_key FROM settings WHERE user_id = ?').get(uid) || {};
        return s.openai_key || process.env.OPENAI_API_KEY || '';
      } catch (e) { return process.env.OPENAI_API_KEY || ''; }
    },
  };
}

function proReactiveDeps(db) {
  return {
    mediaDir: PRO_MEDIA_DIR,
    getRubro: (uid) => {
      try { return String((db.prepare('SELECT category FROM profiles WHERE user_id = ?').get(uid) || {}).category || ''); }
      catch (e) { return ''; }
    },
    getBusiness: (uid) => proBusinessOf(db, uid),
    getBrand: (uid) => proBrandOf(db, uid),
    getLocText: (uid) => {
      try {
        const b = require('./client-brief').getBrief(db, uid) || {};
        return String(b.ubicacion || '');
      } catch (e) { return ''; }
    },
    generateImage: async ({ uid, headline, intent }) => {
      try {
        const srv = require('./server'); // lazy: server ya cargó a esta altura
        if (srv && typeof srv.conceptShotGenerate === 'function') {
          const p = await srv.conceptShotGenerate({ uid, idea: headline, tipo: '', intent: intent || null, headline, refs: [] });
          return p || null;
        }
      } catch (e) { console.error('[reactive] imagen IA falló, va tarjeta:', e.message); }
      return null; // ensurePostImage cae a tarjeta de marca / sólido
    },
  };
}

// Nudges proactivos de Posty (chequeo diario). Posty pide por chat lo que
// le falta para hacer mejores posteos: foto del producto > nota de voz >
// referencia de estilo. Nunca repite un kind ya completado. El umbral de
// 6-9 días es aleatorio por ciclo: cada pregunta llega en un momento distinto.
function nudgeMissingFor(db, uid) {
  try {
    const done = new Set(db.prepare(`SELECT kind FROM posty_nudges WHERE user_id = ? AND done_at > 0`).all(uid).map(r => r.kind));
    const photo = db.prepare(`SELECT id FROM assets WHERE user_id = ? AND kind = 'photo' LIMIT 1`).get(uid);
    if (!photo && !done.has('photo')) return 'photo';
    let j = {};
    try { const r = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(uid); j = JSON.parse((r && r.dna_json) || '{}'); } catch (e) {}
    const hasDesc = String(j.descripcion || j.description || j.negocio || j.business_description || '').trim().length > 20;
    if (!hasDesc && !done.has('voice')) return 'voice';
    if (!String(j.inspo || '').trim() && !done.has('inspo')) return 'inspo';
  } catch (e) {}
  return null;
}

async function postyNudgesDaily(db) {
  try { db.exec(`CREATE TABLE IF NOT EXISTS posty_nudges (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, kind TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')*1000), shown_at INTEGER DEFAULT 0, done_at INTEGER DEFAULT 0
  )`); } catch (e) {}
  let users = [];
  try { users = db.prepare(`SELECT id FROM users`).all(); } catch (e) { return; }
  const now = Date.now(), DAY = 864e5;
  for (const u of users) {
    try {
      const last = db.prepare(`SELECT MAX(MAX(shown_at, done_at), created_at) AS t FROM posty_nudges WHERE user_id = ?`).get(u.id);
      const lastT = (last && last.t) || 0;
      const gapDays = 6 + Math.random() * 3; // 6-9 días, distinto cada vez
      if (now - lastT < gapDays * DAY) continue;
      const pending = db.prepare(`SELECT id FROM posty_nudges WHERE user_id = ? AND shown_at = 0 AND done_at = 0 LIMIT 1`).get(u.id);
      if (pending) continue;
      const kind = nudgeMissingFor(db, u.id);
      if (!kind) continue;
      db.prepare(`INSERT INTO posty_nudges (user_id, kind) VALUES (?,?)`).run(u.id, kind);
      console.log(`[nudges] nudge "${kind}" creado para usuario ${u.id}`);
    } catch (e) {}
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
  const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
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
  const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
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

// Email "tu semana te está esperando" (abandono de trial, 2026-09-30).
// Candidatos: trial_cache con email, sin aviso enviado, generado hace 24-30h
// (created_at en MILISEGUNDOS unix), y cuyo email NO exista en users
// (si se registró, no se molesta). UN solo email por lead: abandon_sent = 1
// se setea ANTES de enviar (idempotencia ante doble corrida del cron).
async function sendTrialAbandonEmails(db) {
  const { emailConfigured, trialAbandonEmail } = require('./email');
  if (!emailConfigured()) {
    console.log('[abandono] sin RESEND_API_KEY: no se envía nada');
    return { sent: 0, skipped: 0 };
  }
  const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
  const now = Date.now();
  const lo = now - 30 * 3600 * 1000, hi = now - 24 * 3600 * 1000;
  let leads = [];
  try {
    leads = db.prepare(`
      SELECT ig, email, payload FROM trial_cache
      WHERE email IS NOT NULL AND email != ''
        AND COALESCE(abandon_sent, 0) = 0
        AND created_at >= ? AND created_at <= ?
    `).all(lo, hi);
  } catch (e) { console.error('[abandono] candidatos:', e.message); return { sent: 0, skipped: 0 }; }
  let sent = 0, skipped = 0;
  for (const l of leads) {
    try {
      const email = String(l.email || '').trim().toLowerCase();
      // Se registró con ese email → no molestar (y no reintentar mañana)
      const inUsers = db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').get(email);
      if (inUsers) {
        db.prepare('UPDATE trial_cache SET abandon_sent = 1 WHERE ig = ?').run(l.ig);
        skipped++;
        continue;
      }
      let biz = '';
      try { biz = String(JSON.parse(l.payload || '{}').business || '').trim(); } catch (e) {}
      const link = `${base}/prueba?ig=${encodeURIComponent(l.ig)}`;
      // Idempotencia: marcar ANTES de enviar (si el envío falla, no se reintenta:
      // es un único aviso, no una notificación crítica).
      db.prepare('UPDATE trial_cache SET abandon_sent = 1 WHERE ig = ?').run(l.ig);
      const r = await trialAbandonEmail({ email }, base, biz, link);
      if (r && r.ok) sent++;
      else console.error('[abandono] no se pudo enviar a', email);
    } catch (e) {
      console.error('[abandono] lead', l.ig, e.message);
    }
    await new Promise((r) => setTimeout(r, 400)); // no saturar el proveedor
  }
  if (sent || skipped || leads.length) console.log(`[abandono] enviados: ${sent}, omitidos (ya registrados): ${skipped}, candidatos: ${leads.length}`);
  return { sent, skipped };
}

// Fin efectivo de la prueba (réplica de trialEffectiveEnd en server.js):
// respeta la política vigente (TRIAL_DAYS desde la creación), aunque la cuenta
// se haya creado cuando la prueba duraba más; si hay extensión manual de
// soporte vigente, manda ella.
const TRIAL_DAYS_LOCAL = 3;
function trialExpiryEffectiveEnd(u, now) {
  const tEnds = u.trial_ends_at || 0;
  if (!tEnds) return 0;
  const cMs = Date.parse(String(u.created_at || '').replace(' ', 'T') + 'Z');
  const policyEnd = cMs ? cMs + TRIAL_DAYS_LOCAL * 86400000 : Infinity;
  const base = Math.min(tEnds, policyEnd);
  const ext = u.trial_extended_until || 0;
  if (ext > now) return Math.max(base, ext);
  return base;
}

// Email "mañana se termina tu prueba" (paywall, 2026-09-30).
// Candidatos: plan trial, con email, sin opt-out, sin aviso previo y con
// trial_ends_at. Se envía solo si el fin efectivo cae en [now+20h, now+28h].
// trial_expiry_email_sent = 1 se setea ANTES de enviar (un solo intento,
// idempotencia ante doble corrida del cron).
async function sendTrialExpiryEmails(db) {
  const { emailConfigured, trialExpiryEmail } = require('./email');
  if (!emailConfigured()) {
    console.log('[vence-mañana] sin RESEND_API_KEY: no se envía nada');
    return { sent: 0, skipped: 0 };
  }
  const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
  const now = Date.now();
  const lo = now + 20 * 3600 * 1000, hi = now + 28 * 3600 * 1000;
  let users = [];
  try {
    users = db.prepare(`
      SELECT id, email, trial_ends_at, trial_extended_until, created_at
      FROM users
      WHERE COALESCE(plan_status, 'trial') = 'trial'
        AND email IS NOT NULL AND email != ''
        AND COALESCE(email_opt_out, 0) = 0
        AND COALESCE(trial_expiry_email_sent, 0) = 0
        AND trial_ends_at IS NOT NULL
    `).all();
  } catch (e) { console.error('[vence-mañana] candidatos:', e.message); return { sent: 0, skipped: 0 }; }
  let sent = 0, skipped = 0;
  for (const u of users) {
    try {
      const end = trialExpiryEffectiveEnd(u, now);
      if (!end || end < lo || end > hi) { skipped++; continue; }
      db.prepare('UPDATE users SET trial_expiry_email_sent = 1 WHERE id = ?').run(u.id);
      const r = await trialExpiryEmail({ email: u.email }, base);
      if (r && r.ok) { sent++; console.log(`[vence-mañana] email enviado a ${u.email}`); }
      else console.error('[vence-mañana] no se pudo enviar a', u.email);
    } catch (e) {
      console.error('[vence-mañana] usuario', u.id, e.message);
    }
    await new Promise((r) => setTimeout(r, 400)); // no saturar el proveedor
  }
  if (sent || skipped || users.length) console.log(`[vence-mañana] enviados: ${sent}, omitidos (fuera de ventana): ${skipped}, candidatos: ${users.length}`);
  return { sent, skipped };
}

// Email día 2 "publicá tu primero" (2026-09-30, mejora "garantizar el primer posteo").
// Candidatos: cuenta creada hace 20-52h, con email, sin opt-out, trial o plan
// activo (y trial EFECTIVAMENTE vigente vía schedCanPublish), con 0 posteos
// publicados. UN solo email por cuenta: la fila nudges(kind='first_publish')
// se inserta ANTES de enviar (idempotencia ante doble corrida del cron) y de
// paso frena 3 días los nudges de contenido (anti-spam).
// Se saltea a quien recibió el nudge de chat hace menos de 24h
// (first_publish_nudged_at): no queremos el mismo "publicá tu primero" dos
// veces en el mismo día por dos canales.
async function sendFirstPublishEmails(db) {
  const { emailConfigured, firstPublishNudgeEmail } = require('./email');
  if (!emailConfigured()) {
    console.log('[primer-posteo] sin RESEND_API_KEY: no se envía nada');
    return { sent: 0, skipped: 0 };
  }
  const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
  let users = [];
  try {
    users = db.prepare(`
      SELECT id, email, client_name AS name, created_at
      FROM users
      WHERE email IS NOT NULL AND email != ''
        AND COALESCE(email_opt_out, 0) = 0
        AND COALESCE(plan_status, 'trial') IN ('trial', 'active')
        AND datetime(created_at) >= datetime('now', '-52 hours')
        AND datetime(created_at) <= datetime('now', '-20 hours')
        AND (COALESCE(first_publish_nudged_at, '') = ''
             OR datetime(first_publish_nudged_at) <= datetime('now', '-1 day'))
        AND NOT EXISTS (SELECT 1 FROM nudges WHERE user_id = users.id AND kind = 'first_publish')
        AND NOT EXISTS (SELECT 1 FROM posts WHERE user_id = users.id AND status = 'published')
    `).all();
  } catch (e) { console.error('[primer-posteo] candidatos:', e.message); return { sent: 0, skipped: 0 }; }
  let sent = 0, skipped = 0;
  for (const u of users) {
    try {
      // Trial vencido de verdad → no molestar (el aviso de pausa ya salió).
      if (!schedCanPublish(db, u.id)) { skipped++; continue; }
      let drafts = 0;
      try { drafts = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'draft'`).get(u.id).n || 0; } catch (e) {}
      // Idempotencia: marcar ANTES de enviar.
      db.prepare(`INSERT INTO nudges (user_id, kind) VALUES (?, 'first_publish')`).run(u.id);
      const nm = String(u.name || '').trim() || String(u.email || '').split('@')[0];
      const r = await firstPublishNudgeEmail({ email: u.email, name: nm, drafts }, base);
      if (r && r.ok) { sent++; console.log(`[primer-posteo] email enviado a ${u.email}`); }
      else console.error('[primer-posteo] no se pudo enviar a', u.email);
    } catch (e) {
      console.error('[primer-posteo] usuario', u.id, e.message);
    }
    await new Promise((r) => setTimeout(r, 400)); // no saturar el proveedor
  }
  if (sent || skipped || users.length) console.log(`[primer-posteo] enviados: ${sent}, omitidos (trial vencido): ${skipped}, candidatos: ${users.length}`);
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
  const base = (process.env.BASE_URL || 'https://postyhacetodo.com').replace(/\/$/, '');
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.email, u.client_name AS name FROM users u
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

// Learning loop: ingesta diaria de métricas reales (insights de IG) por posteo.
// Solo posteos publicados en los últimos 14 días, con ig_media_id y no ingeridos.
// Nunca rompe: cada posteo va en su propio try/catch.
async function ingestLearningLoop(db) {
  let L, getCreds, fetchMediaInsights;
  try {
    L = require('./learning');
    ({ getCreds, fetchMediaInsights } = require('./insights'));
  } catch (e) { console.error('[learning-ingest] módulos:', e.message); return { ingested: 0 }; }
  let rows = [];
  try {
    rows = db.prepare(`SELECT id, user_id, style_code, intent, hook_id, ig_media_id FROM posts
      WHERE status = 'published' AND learning_ingested = 0 AND ig_media_id != ''
      AND published_at > datetime('now','-14 days') LIMIT 50`).all();
  } catch (e) { console.error('[learning-ingest] query:', e.message); return { ingested: 0 }; }
  let ingested = 0;
  for (const p of rows) {
    try {
      const creds = getCreds(db, p.user_id);
      if (!creds) continue;
      const m = await fetchMediaInsights(p.ig_media_id, creds.accessToken);
      L.recordPerformance(db, { userId: p.user_id, styleCode: p.style_code || '', intent: p.intent || '', hookId: p.hook_id || '', metrics: m || {} });
      db.prepare('UPDATE posts SET learning_ingested = 1 WHERE id = ?').run(p.id);
      ingested++;
    } catch (e) { console.error('[learning-ingest] post', p.id, e.message); }
  }
  if (ingested) console.log(`[learning-ingest] métricas registradas: ${ingested} posteos`);
  return { ingested };
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

// ---------- 🧠 Resumen semanal de conocimiento de Posty ----------
// Lunes 09:00 (Buenos Aires). Para cada usuario con posty_level ≥ 1 cuenta el
// conocimiento NUEVO desde users.posty_digest_at: fotos del brand kit,
// señales 👍/👎, reglas de estilo activadas y fuentes del ADN analizadas.
// Si hay ≥1 item → mensaje en el chat ("🧠 Mirá lo que aprendí esta semana:"
// + 2-3 items concretos). Si no hay nada nuevo → silencio total (nunca un
// mensaje genérico). La marca de agua se actualiza siempre.
const normTs = (s) => String(s || '').trim().replace('T', ' ').slice(0, 19);

function ruleTextToVoseo(t) {
  let s = String(t || '').trim()
    .replace(/^El cliente prefiere /i, 'preferís ')
    .replace(/^Al cliente le sirve /i, 'te sirve ')
    .replace(/^El cliente /i, 'vos ');
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

const DIGEST_SOURCE_PHRASES = [
  ['website_analyzed_at', 'tu web 🌐'],
  ['stories_analyzed_at', 'tus historias 📱'],
  ['fb_analyzed_at', 'tu página de Facebook 📘'],
  ['comments_analyzed_at', 'los comentarios de tu Instagram 💬'],
  ['places_analyzed_at', 'las reseñas de Google ⭐'],
];

function newSourcesSince(db, userId, since) {
  const dna = readDnaSync(db, userId);
  const out = [];
  for (const [field, phrase] of DIGEST_SOURCE_PHRASES) {
    const at = normTs(dna[field]);
    if (at && at > since) out.push(`estudié ${phrase}`);
  }
  return out;
}

// 🎉 Momento WOW semanal (Punto 4, 2026-10-02).
// Lunes 09:30: "tu semana en números". Hace que el usuario piense
// "qué bueno que tengo esto". Solo si publicó al menos 1 posteo.
async function weeklyWowSummary(db) {
  let users = [];
  try {
    users = db.prepare(`
      SELECT DISTINCT u.id, u.email, p.business_name
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE EXISTS (
        SELECT 1 FROM posts 
        WHERE user_id = u.id AND status = 'published'
        AND published_at > datetime('now', '-7 days')
      )
    `).all();
  } catch (e) { console.error('[wow-semanal]', e.message); return; }

  for (const u of users) {
    try {
      const stats = db.prepare(`
        SELECT COUNT(*) AS n, COALESCE(SUM(ig_likes), 0) AS likes,
               COALESCE(SUM(ig_comments), 0) AS comments,
               COALESCE(SUM(ig_reach), 0) AS reach
        FROM posts WHERE user_id = ? AND status = 'published'
        AND published_at > datetime('now', '-7 days')
      `).get(u.id);

      const best = db.prepare(`
        SELECT caption, ig_likes, ig_comments
        FROM posts WHERE user_id = ? AND status = 'published'
        AND published_at > datetime('now', '-7 days')
        ORDER BY (COALESCE(ig_likes, 0) + COALESCE(ig_comments, 0) * 3) DESC LIMIT 1
      `).get(u.id);

      const n = (stats && stats.n) || 0;
      if (!n) continue;

      const name = (u.business_name || '').trim();
      let msg = `🎉 ¡Tu semana en Posty${name ? ', ' + name : ''}!\n\n`;
      msg += `📸 ${n} posteo${n > 1 ? 's' : ''} publicado${n > 1 ? 's' : ''}\n`;
      if (stats.likes > 0) msg += `❤️ ${stats.likes} likes\n`;
      if (stats.comments > 0) msg += `💬 ${stats.comments} comentarios\n`;
      if (stats.reach > 0) msg += `👁️ ${stats.reach} alcance\n`;
      if (best && (best.ig_likes > 0 || best.ig_comments > 0)) {
        const cap = String(best.caption || '').split('\n')[0].slice(0, 60);
        msg += `\n🏆 Tu mejor posteo: "${cap}..."\n`;
        msg += `   ${best.ig_likes || 0} likes, ${best.ig_comments || 0} comentarios`;
      }
      msg += `\n\nSeguimos esta semana 💪`;

      // Guardar en el chat del usuario.
      try {
        db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`)
          .run(u.id, msg);
      } catch (e) {}

      // Push si está suscrito.
      try {
        const { sendPushToUser } = require('./push');
        await sendPushToUser(db, u.id, {
          title: '🎉 Tu semana en Posty',
          body: `${n} posteos publicados. Tocá para ver cómo te fue.`,
          url: '/#/app/semana',
        });
      } catch (e) {}

      console.log(`[wow-semanal] enviado a usuario ${u.id} (${n} posteos)`);
    } catch (e) {
      console.error(`[wow-semanal] usuario ${u.id}:`, e.message);
    }
  }
}

// 💡 Posty proactivo ESTRATÉGICO (2026-10-02, v2).
// 6 triggers por prioridad: trial, racha, borradores, fotos, winner, oportunidad.
// Cada mensaje tiene un motivo. No hablamos "porque sí".
async function proactiveIdeas(db) {
  const { checkTriggers, logTrigger } = require('./proactive');
  let users = [];
  try {
    users = db.prepare(`
      SELECT u.id
      FROM users u
      WHERE COALESCE(u.plan_status, 'trial') IN ('trial', 'active')
      AND COALESCE(u.proactive_enabled, 1) = 1
    `).all();
  } catch (e) { console.error('[proactivo]', e.message); return; }

  for (const u of users) {
    try {
      const trigger = checkTriggers(db, u.id);
      if (!trigger) continue;

      // Guardar en el chat.
      try {
        db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`)
          .run(u.id, trigger.message);
      } catch (e) {}

      // Push.
      try {
        const { sendPushToUser } = require('./push');
        await sendPushToUser(db, u.id, {
          title: trigger.push_title,
          body: trigger.push_body,
          url: '/#/app/chat',
        });
      } catch (e) {}

      logTrigger(db, u.id, trigger);
      console.log(`[proactivo] trigger "${trigger.type}" enviado a usuario ${u.id}`);
    } catch (e) {
      console.error(`[proactivo] usuario ${u.id}:`, e.message);
    }
  }
}

// ⏰ Aviso pre-autopiloto (2026-10-02, opción 2).
// 30 min antes de que el autopiloto publique solo, manda push:
// "En 30 min publico esto 👆 Tocá para frenarlo".
// Solo una vez por posteo (autopilot_notified).
async function autopilotPreNotify(db) {
  let posts = [];
  try {
    posts = db.prepare(`
      SELECT p.id, p.user_id, p.caption, p.image_path, p.scheduled_at
      FROM posts p
      WHERE p.auto_published = 1
      AND p.status = 'scheduled'
      AND COALESCE(p.autopilot_notified, 0) = 0
      AND p.scheduled_at > datetime('now', '+25 minutes')
      AND p.scheduled_at <= datetime('now', '+35 minutes')
    `).all();
  } catch (e) { return; }

  for (const p of posts) {
    try {
      // Marcar como notificado ANTES de enviar (evita doble push si falla).
      db.prepare(`UPDATE posts SET autopilot_notified = 1 WHERE id = ?`).run(p.id);

      const cap = String(p.caption || '').split('\n')[0].slice(0, 60);
      const { sendPushToUser } = require('./push');
      await sendPushToUser(db, p.user_id, {
        title: '🚀 Publico en 30 min',
        body: `"${cap}..." — tocá para verlo o frenarlo`,
        url: `/#/app/semana?post=${p.id}`,
      });

      // También en el chat.
      try {
        db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'assistant', ?)`)
          .run(p.user_id, `🚀 En 30 minutos publico este posteo:\n\n"${cap}..."\n\nSi querés frenarlo o cambiarlo, tocá acá 👆`);
      } catch (e) {}

      console.log(`[autopilot-notify] aviso enviado para post ${p.id} (usuario ${p.user_id})`);
    } catch (e) {
      console.error(`[autopilot-notify] post ${p.id}:`, e.message);
    }
  }
}

async function postyWeeklyDigest(db) {
  let users = [];
  try {
    users = db.prepare(
      "SELECT id, COALESCE(posty_digest_at, '') AS digest_at FROM users WHERE COALESCE(posty_level, 0) >= 1"
    ).all();
  } catch (e) { console.error('[posty-digest]', e.message); return; }
  const nowIso = new Date().toISOString();
  const fallbackSince = normTs(new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
  for (const u of users) {
    try {
      const since = normTs(u.digest_at) || fallbackSince;
      const items = [];
      // 1) Fotos nuevas del brand kit
      let nPhotos = 0;
      try {
        nPhotos = db.prepare(
          "SELECT COUNT(*) AS n FROM assets WHERE user_id = ? AND kind = 'photo' AND datetime(created_at) > datetime(?)"
        ).get(u.id, since).n || 0;
      } catch (e) { /* tabla sin created_at viejo: se ignora */ }
      if (nPhotos > 0) items.push(nPhotos === 1 ? 'tu foto nueva del negocio 📷' : `tus ${nPhotos} fotos nuevas del negocio 📷`);
      // 2) Señales nuevas (👍/👎)
      let nSig = 0;
      try {
        nSig = db.prepare(
          "SELECT COUNT(*) AS n FROM post_signals WHERE user_id = ? AND client_signal IN ('approved','rejected') AND datetime(created_at) > datetime(?)"
        ).get(u.id, since).n || 0;
      } catch (e) {}
      if (nSig > 0) items.push(nSig === 1
        ? 'el posteo que marcaste 👍/👎 — ya sé más de tu gusto'
        : `los ${nSig} posteos que marcaste 👍/👎 — ya sé más de tu gusto`);
      // 3) Reglas de estilo recién activadas (concretas, en voseo)
      let newRules = [];
      try {
        newRules = db.prepare(
          'SELECT rule_text FROM style_rules WHERE user_id = ? AND active = 1 AND created_at IS NOT NULL AND datetime(created_at) > datetime(?)'
        ).all(u.id, since);
      } catch (e) {}
      for (const r of newRules.slice(0, 2)) {
        const t = ruleTextToVoseo(r.rule_text);
        if (t) items.push('que ' + t);
      }
      // 4) Fuentes del ADN analizadas esta semana
      for (const s of newSourcesSince(db, u.id, since).slice(0, 2)) items.push(s);
      // Mensaje solo si hay algo concreto que contar.
      if (items.length > 0) {
        const shown = items.slice(0, 3);
        let msg = '🧠 Mirá lo que aprendí esta semana:\n' + shown.map((i) => '• ' + i).join('\n');
        if (items.length > 3) msg += `\n• …y ${items.length - 3} más`;
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(u.id, 'assistant', msg);
      }
    } catch (e) { console.error('[posty-digest] usuario', u.id, e.message); }
    try { db.prepare('UPDATE users SET posty_digest_at = ? WHERE id = ?').run(nowIso, u.id); } catch (e) { /* no bloquea */ }
  }
}

module.exports = { startScheduler, processDuePosts, processApprovalNotifications, publishSinglePost, sendWeeklyReminders, sendContentNudges, sendTrialAbandonEmails, sendTrialExpiryEmails, sendFirstPublishEmails, sendWeeklyReports, syncAllComments, refreshBestHours, refreshContentLearnings, refreshIgComments, syncStoriesDna, postyNudgesDaily, postyWeeklyDigest, activationNudge, firstPublishNudge, celebrateWinsChat };
