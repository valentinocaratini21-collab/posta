// magia-postpago.js — MAGIA POST-PAGO (2026-10-25, «ARMA TODO» de Valentino
// + addendum: un solo lenguaje de magia en todas las superficies).
//
// Los 6 agregados, todos sobre registros durables (sin registro no hay
// promesa; sin dato real no hay línea):
//   1) antes/después del feed — lo sirve GET /api/postpay/status desde el
//      snapshot real de la home (ig_home_snapshot, fuente 'read') + la
//      semana real de posts; si no hay lectura real, el bloque no existe.
//   2) primera publicación paga celebrada — celebrateFirstPaidPost, llamado
//      desde publishSinglePost tras un publish exitoso con plan activo.
//      Marca durable ANTES de avisar (patrón A5): una única vez por cuenta,
//      por UN canal: push si lo habilitó, si no mensaje en el chat (app).
//      Nunca email duplicado, nunca dos canales.
//   3) primera idea proactiva en 24 h — runPostpayIdea24Sweep vive en
//      server.js (tiene runIdeasForUser); acá viven los selectores puros
//      (dueIdea24) y la adopción de la idea pendiente. La idea sale de la
//      maquinaria del loop (misma tabla posty_ideas, mismo panel, mismo
//      botón «Hacelo»): jamás una idea inventada.
//   4) garantía a la vista — el frontend la pinta solo si el derecho real
//      de week-redo dice 'available' y el botón abre ESE derecho (la fila
//      de la Bandeja), no un derecho nuevo.
//   5) historia de estreno — borrador 'estreno' con material REAL del
//      cliente (su foto o su posteo), render local sin IA; nunca se
//      publica sola: el cliente la publica con el flujo publish-now.
//   6) primer mes — month30Summary desde el ledger real: posteos
//      publicados en la ventana [pago, pago+30d], mejor posteo por el
//      puntaje de la casa (likes + 3×comentarios, el mismo de /api/analysis)
//      solo si tiene engagement real, y nivel real de posty-level. Si no
//      hay dato, esa línea no aparece; si no hay nada publicado, no hay
//      festejo (silencio, sin nag).
//
// El módulo NO requiere server.js (lo requieren server.js y scheduler.js):
// solo DB + requires perezosos (push, posty-level) dentro de cada función.
'use strict';

const DAY_MS = 24 * 3600 * 1000;

function ensureSchema(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS postpay_milestones (
      user_id INTEGER PRIMARY KEY,
      paid_at_ms INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL DEFAULT 'activation',
      idea24_done INTEGER NOT NULL DEFAULT 0,
      idea24_idea_id INTEGER,
      story_post_id INTEGER,
      story_dismissed INTEGER NOT NULL DEFAULT 0,
      month30_done INTEGER NOT NULL DEFAULT 0,
      month30_dismissed INTEGER NOT NULL DEFAULT 0,
      first_paid_celebrated INTEGER NOT NULL DEFAULT 0
    )`);
  } catch (e) { /* la tabla nunca frena una publicación ni un webhook */ }
}

function getMilestone(db, uid) {
  try {
    ensureSchema(db);
    return db.prepare('SELECT * FROM postpay_milestones WHERE user_id = ?').get(uid) || null;
  } catch (e) { return null; }
}

// Activación (webhooks Stripe/MP): la primera vez gana — un reintento del
// webhook o una reactivación posterior no reescribe la fecha del pago.
function markPaid(db, uid, origin) {
  try {
    ensureSchema(db);
    db.prepare(`INSERT OR IGNORE INTO postpay_milestones (user_id, paid_at_ms, origin)
      VALUES (?, ?, ?)`).run(uid, Date.now(), origin || 'activation');
  } catch (e) { /* el webhook nunca falla por este registro */ }
  return getMilestone(db, uid);
}

// Cuenta ya activa antes de este deploy (o sin milestone por cualquier
// vía): se siembra con la fecha del primer avistaje. El hito 24 h y la
// historia siguen valiendo (llegan pronto); el mes se mide desde acá —
// queda documentado en origin='seeded', nunca disfrazado de activación.
function ensureMilestoneForActive(db, uid) {
  try {
    const u = db.prepare('SELECT plan_status FROM users WHERE id = ?').get(uid);
    if (!u || u.plan_status !== 'active') return getMilestone(db, uid);
    const m = getMilestone(db, uid);
    if (m) return m;
    ensureSchema(db);
    db.prepare(`INSERT OR IGNORE INTO postpay_milestones (user_id, paid_at_ms, origin)
      VALUES (?, ?, 'seeded')`).run(uid, Date.now());
    return getMilestone(db, uid);
  } catch (e) { return null; }
}

function hasPush(db, uid) {
  try {
    const r = db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?').get(uid);
    return !!(r && r.n > 0);
  } catch (e) { return false; }
}

function userLang(db, uid) {
  try {
    const r = db.prepare('SELECT lang FROM users WHERE id = ?').get(uid);
    return (r && r.lang === 'en') ? 'en' : 'es';
  } catch (e) { return 'es'; }
}

// (2) Primera publicación paga. Se llama DESPUÉS de un publish exitoso.
// Condición: plan activo en el momento + sin celebración previa. La marca
// se escribe ANTES de avisar: un segundo publish concurrente no duplica.
function celebrateFirstPaidPost(db, post) {
  try {
    ensureSchema(db);
    if (!post || !post.user_id) return { celebrated: false, reason: 'no_post' };
    const u = db.prepare('SELECT plan_status FROM users WHERE id = ?').get(post.user_id);
    if (!u || u.plan_status !== 'active') return { celebrated: false, reason: 'not_active' };
    let m = getMilestone(db, post.user_id);
    if (!m) m = markPaid(db, post.user_id, 'seeded');
    if (m && m.first_paid_celebrated) return { celebrated: false, reason: 'already' };
    db.prepare('UPDATE postpay_milestones SET first_paid_celebrated = 1 WHERE user_id = ?').run(post.user_id);
    const lang = userLang(db, post.user_id);
    const link = (post.ig_permalink && String(post.ig_permalink)) || '/#/app/schedule';
    const title = lang === 'en' ? '🎉 Your first post as a client is live!' : '🎉 ¡Tu primer posteo como cliente ya está en tu Instagram!';
    const body = lang === 'en'
      ? 'Posty just published your first paid post — tap to see it on your Instagram.'
      : 'Posty acaba de publicar tu primer posteo como cliente — tocá para verlo en tu Instagram.';
    if (hasPush(db, post.user_id)) {
      try {
        const { sendPush } = require('./push');
        sendPush(post.user_id, { title, body, url: link }).catch(() => {});
      } catch (e) {}
      try {
        require('./push-oficina')._log(db, { user_id: post.user_id, agente: 'posty', motivo: 'primer_posteo_pago', titulo: title, cuerpo: body, url: link, estado: 'enviada', causa: 'magia_postpago_primer_posteo' });
      } catch (e) {}
      return { celebrated: true, channel: 'push' };
    }
    // Sin push: el canal es la app — mensaje en el chat único de Posty.
    const text = lang === 'en'
      ? `🎉 your first post as a client is already on your instagram! here it is: ${link}`
      : `🎉 ¡tu primer posteo como cliente ya está en tu instagram! acá está: ${link}`;
    try {
      db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(post.user_id, 'assistant', text);
    } catch (e) {}
    return { celebrated: true, channel: 'app' };
  } catch (e) {
    console.error('[magia-postpago] celebración primer posteo:', e.message);
    return { celebrated: false, reason: 'error' };
  }
}

// (3) Selectores puros para el sweep de idea 24 h (corre en server.js,
// donde vive runIdeasForUser): pago hace menos de 24 h, idea sin entregar,
// cuenta todavía activa. Pasada la ventana sin idea, el llamador marca
// idea24_done = 2 (omitida en silencio: jamás una idea inventada).
function dueIdea24(db, nowMs) {
  try {
    ensureSchema(db);
    return db.prepare(`
      SELECT m.user_id, m.paid_at_ms
      FROM postpay_milestones m JOIN users u ON u.id = m.user_id
      WHERE COALESCE(m.idea24_done, 0) = 0
        AND u.plan_status = 'active'
        AND m.paid_at_ms > ? AND m.paid_at_ms <= ?
    `).all(nowMs - DAY_MS, nowMs);
  } catch (e) { return []; }
}

function markIdea24(db, uid, ideaId, done) {
  try {
    ensureSchema(db);
    db.prepare('UPDATE postpay_milestones SET idea24_done = ?, idea24_idea_id = ? WHERE user_id = ?').run(done, ideaId || null, uid);
  } catch (e) {}
}

// La idea pendiente más reciente del loop normal (para adoptar sin
// regenerar ni expirar lo que el cliente ya tiene esperando).
function newestPendingIdea(db, uid) {
  try {
    return db.prepare(`SELECT id, title, why, format FROM posty_ideas
      WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1`).get(uid) || null;
  } catch (e) { return null; }
}

function ideaById(db, uid, id) {
  try {
    return db.prepare(`SELECT id, title, why, format FROM posty_ideas
      WHERE id = ? AND user_id = ? AND status = 'pending'`).get(id, uid) || null;
  } catch (e) { return null; }
}

// (6) Resumen del primer mes desde el ledger. Ventana real [pago, +30d].
// Devuelve null si el hito no existe o la ventana aún no cerró.
function month30Summary(db, uid, milestone) {
  try {
    const m = milestone || getMilestone(db, uid);
    if (!m || !m.paid_at_ms) return null;
    const startMs = Number(m.paid_at_ms);
    const endMs = startMs + 30 * DAY_MS;
    if (Date.now() < endMs) return null;
    const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    const start = fmt(startMs), end = fmt(endMs);
    let publishedCount = 0;
    try {
      const r = db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ?
        AND status = 'published' AND published_at >= ? AND published_at < ?`).get(uid, start, end);
      publishedCount = (r && r.n) || 0;
    } catch (e) {}
    let best = null;
    try {
      const b = db.prepare(`SELECT id, caption, image_path, ig_permalink, ig_likes, ig_comments FROM posts
        WHERE user_id = ? AND status = 'published' AND published_at >= ? AND published_at < ?
        ORDER BY (COALESCE(ig_likes, 0) + 3 * COALESCE(ig_comments, 0)) DESC LIMIT 1`).get(uid, start, end);
      if (b && ((Number(b.ig_likes) || 0) + 3 * (Number(b.ig_comments) || 0)) > 0) {
        best = { id: b.id, caption_first: String(b.caption || '').split('\n')[0].slice(0, 80), image_path: b.image_path || '', permalink: b.ig_permalink || '', likes: Number(b.ig_likes) || 0, comments: Number(b.ig_comments) || 0 };
      }
    } catch (e) {}
    let level = null;
    try {
      const { postyLevel } = require('./posty-level');
      const lv = postyLevel(db, uid);
      level = { level: lv.level, level_name: lv.level_name, next_missing: lv.next_missing || [] };
    } catch (e) {}
    return { published_count: publishedCount, best, level, window_start: start, window_end: end };
  } catch (e) { return null; }
}

// (6) Barrido: a los 30 días, UN mensaje en el chat con el resumen real.
// Solo si hay algo publicado (sin publicaciones no hay festejo). Marca
// month30_done = 1 en ambos casos para no reintentar: la Bandeja sigue
// mostrando el resumen vía /api/postpay/status hasta que el cliente lo
// descarte (month30_dismissed = 1).
function sweepMonth30(db, nowMs) {
  const out = { delivered: 0, silent: 0 };
  try {
    ensureSchema(db);
    const rows = db.prepare(`
      SELECT m.user_id, m.paid_at_ms
      FROM postpay_milestones m JOIN users u ON u.id = m.user_id
      WHERE COALESCE(m.month30_done, 0) = 0 AND m.paid_at_ms > 0 AND m.paid_at_ms <= ?
    `).all(nowMs - 30 * DAY_MS);
    for (const row of rows) {
      try {
        const s = month30Summary(db, row.user_id, row);
        db.prepare('UPDATE postpay_milestones SET month30_done = 1 WHERE user_id = ?').run(row.user_id);
        if (!s || s.published_count <= 0) { out.silent++; continue; }
        const lang = userLang(db, row.user_id);
        const lines = [];
        if (lang === 'en') {
          lines.push(`🎉 your first month with posty! in these 30 days i published ${s.published_count} post${s.published_count === 1 ? '' : 's'} for you.`);
          if (s.best) lines.push(`your best one: “${s.best.caption_first}” — ${s.best.likes} likes, ${s.best.comments} comments.`);
          if (s.level) lines.push(`and i already know you this well: ${s.level.level_name}.`);
        } else {
          lines.push(`🎉 ¡tu primer mes con posty! en estos 30 días publiqué ${s.published_count} posteo${s.published_count === 1 ? '' : 's'} para vos.`);
          if (s.best) lines.push(`el que mejor rindió: “${s.best.caption_first}” — ${s.best.likes} likes, ${s.best.comments} comentarios.`);
          if (s.level) lines.push(`y esto es lo que ya aprendí de vos: ${s.level.level_name}.`);
        }
        db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)').run(row.user_id, 'assistant', lines.join(' '));
        out.delivered++;
      } catch (e) { console.error('[magia-postpago] mes 30 usuario', row.user_id, e.message); }
    }
  } catch (e) { console.error('[magia-postpago] sweep mes 30:', e.message); }
  return out;
}

function setStoryPost(db, uid, postId) {
  try { ensureSchema(db); db.prepare('UPDATE postpay_milestones SET story_post_id = ? WHERE user_id = ?').run(postId, uid); } catch (e) {}
}

function dismiss(db, uid, kind) {
  try {
    ensureSchema(db);
    if (kind === 'month30') db.prepare('UPDATE postpay_milestones SET month30_dismissed = 1 WHERE user_id = ?').run(uid);
    if (kind === 'story') db.prepare('UPDATE postpay_milestones SET story_dismissed = 1 WHERE user_id = ?').run(uid);
    return true;
  } catch (e) { return false; }
}

module.exports = {
  ensureSchema, getMilestone, markPaid, ensureMilestoneForActive, hasPush,
  celebrateFirstPaidPost, dueIdea24, markIdea24, newestPendingIdea, ideaById,
  month30Summary, sweepMonth30, setStoryPost, dismiss, DAY_MS,
};
