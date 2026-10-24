// publish-watchdog.js — VIGÍA DE VENCIDOS (2026-10-23, v353).
//
// Doctrina del dueño: "sin registro durable, no hay promesa" — ningún
// posteo comprometido a publicar puede perderse en silencio.
//
// El scheduler publica cada minuto los posteos 'scheduled' vencidos
// (processDuePosts, la ÚNICA cola de publicación). Pero un posteo puede
// quedar 'scheduled' con la hora pasada sin salir ni fallar: el proceso
// estuvo caído, la cola de 5/min no lo alcanzó nunca, quedó retenido por
// needs_review, o cualquier hueco futuro entre el tick y la publicación.
// Sin vigía, eso es silencio: el cliente espera un posteo que no existe.
//
// Qué hace el vigía (barrido cada PUBLISH_WATCHDOG_INTERVAL_MIN minutos,
// default 12, + una pasada al boot, DESPUÉS del primer processDuePosts):
//   Detecta posteos que cumplen TODO:
//     - status = 'scheduled' (comprometidos a publicar; un borrador o un
//       posteo en modo manual NO es un vencido y jamás se toca),
//     - scheduled_at ya pasó hace más del margen de gracia
//       (PUBLISH_WATCHDOG_GRACE_MIN, default 15 min — el tick normal
//       tiene su ventana y no se lo pisa),
//     - SIN recibo verificado de publicación: ninguna fila 'published'
//       en publish_ledger para ese posteo y ninguna evidencia legacy en
//       su propia fila (ig_media_id / ig_permalink / published_at).
//   Y actúa, una sola vez por posteo por barrido (sin ráfagas):
//     - REINTENTABLE → lo reprograma a AHORA (scheduled_at = now) para
//       que la cola única (processDuePosts) lo tome en su próximo tick.
//       El vigía NUNCA publica por su cuenta: todos los candados
//       (trial, imagen, presupuesto del publish-guard, aprobación,
//       autopiloto) siguen aplicando en publishSinglePost. Cada
//       reprogramación queda asentada en el ledger
//       (status 'watchdog_requeue') y como evento post_watchdog_requeued.
//     - NO REINTENTABLE o REINCIDENTE → ESCALA con nombre propio:
//       * retenido por needs_review (lo tiene que mirar un humano), o
//       * ya reprogramado PUBLISH_WATCHDOG_MAX_REQUEUES veces (default 3)
//         sin recibo.
//       La escalación es durable (tabla publish_watchdog_escalations +
//       fila del ledger + evento post_watchdog_escalated), identificable
//       (log estructurado [publish-watchdog] con user_id, post_id, hora
//       original y motivo) y avisa por el mismo canal que usa el
//       scheduler para un posteo fallido (push notifyPostFailed,
//       fire-and-forget). El reincidente además queda 'paused' con un
//       error tranquilo y visible, para que deje de contar como
//       programado sano. Una misma escalación (posteo + hora original +
//       motivo) no se repite.
//   Exclusiones explícitas (decisiones, no pérdidas):
//     - usuarios con publishing_stopped = 1 (el dueño frenó su cuenta),
//     - posteos con approval = 'rejected' (veto del cliente: lo resuelve
//       la vía de decisiones del publish-guard / processDuePosts).
//
// Todo el barrido es fail-safe: un error del vigía jamás frena al
// scheduler ni toca posteos fuera de su criterio (try/catch por posteo
// y en los call-sites).
'use strict';

const publishGuard = require('./publish-guard');

function graceMin() {
  const n = parseInt(process.env.PUBLISH_WATCHDOG_GRACE_MIN || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 15;
}
function intervalMin() {
  const n = parseInt(process.env.PUBLISH_WATCHDOG_INTERVAL_MIN || '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 12;
}
function maxRequeues() {
  const n = parseInt(process.env.PUBLISH_WATCHDOG_MAX_REQUEUES || '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 3;
}

function ensureSchema(db) {
  publishGuard.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS publish_watchdog_escalations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    original_scheduled_at TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_watchdog_esc_post ON publish_watchdog_escalations(post_id, reason, created_at)`);
}

// Las horas en posts conviven en dos formatos: 'YYYY-MM-DD HH:MM:SS'
// (datetime('now') de SQLite, UTC) e ISO con 'T'/'Z'. Ambas se leen como UTC.
function parseTime(s) {
  if (!s) return NaN;
  let t = String(s).trim().replace(' ', 'T');
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(t)) t += 'Z';
  return new Date(t).getTime();
}

// Recibo verificado: fila 'published' en el ledger (la fuente nueva) o
// evidencia en la propia fila (posteos previos al ledger).
function hasVerifiedReceipt(db, post) {
  if (post.ig_media_id || post.ig_permalink || post.published_at) return true;
  try {
    const r = db.prepare(
      `SELECT COUNT(*) AS c FROM publish_ledger WHERE post_id = ? AND status = 'published'`
    ).get(post.id);
    return !!(r && r.c > 0);
  } catch (e) { return false; }
}

function ledgerCount(db, postId, status) {
  try {
    const r = db.prepare(
      `SELECT COUNT(*) AS c FROM publish_ledger WHERE post_id = ? AND status = ?`
    ).get(postId, status);
    return r ? r.c : 0;
  } catch (e) { return 0; }
}

function watchdogEvent(db, userId, name, props) {
  try {
    db.prepare('INSERT INTO events (user_id, session_id, name, props) VALUES (?,?,?,?)')
      .run(userId || null, '', name, JSON.stringify(props || {}).slice(0, 2000));
  } catch (e) { /* el instrumento nunca frena nada */ }
}

function alreadyEscalated(db, post, reason) {
  try {
    const r = db.prepare(
      `SELECT COUNT(*) AS c FROM publish_watchdog_escalations
       WHERE post_id = ? AND reason = ? AND original_scheduled_at = ?`
    ).get(post.id, reason, String(post.scheduled_at || ''));
    return !!(r && r.c > 0);
  } catch (e) { return false; }
}

// Escalación con nombre propio: registro durable + evento + log
// estructurado + aviso por el canal del scheduler (push de posteo
// fallido). `pause: true` deja el posteo 'paused' (reincidente: ya no
// es un programado sano); el retenido por revisión NO se pausa (su
// estado ya lo gobierna el humano que lo retuvo).
function escalate(db, post, reason, detail, opts = {}) {
  const attempts = ledgerCount(db, post.id, 'attempted') + ledgerCount(db, post.id, 'watchdog_requeue');
  ensureSchema(db);
  db.prepare(
    `INSERT INTO publish_watchdog_escalations (user_id, post_id, original_scheduled_at, reason, attempts, detail)
     VALUES (?,?,?,?,?,?)`
  ).run(post.user_id, post.id, String(post.scheduled_at || ''), reason, attempts, String(detail || '').slice(0, 500));
  publishGuard.record(db, {
    userId: post.user_id, postId: post.id, kind: publishGuard.kindOf(post),
    status: 'watchdog_escalated', detail: reason,
  });
  watchdogEvent(db, post.user_id, 'post_watchdog_escalated', {
    post_id: post.id, user_id: post.user_id,
    original_scheduled_at: post.scheduled_at || '', reason, attempts,
  });
  if (opts.pause) {
    db.prepare(`UPDATE posts SET status = 'paused', error = ? WHERE id = ? AND status = 'scheduled'`)
      .run('Tu posteo no pudo salir solo y lo pausamos para revisarlo nosotros 🙏 No se perdió: quedó guardado y lo retomamos juntos.', post.id);
  }
  console.error(`[publish-watchdog] ESCALATED user_id=${post.user_id} post_id=${post.id} original_scheduled_at=${post.scheduled_at || ''} reason=${reason} attempts=${attempts}`);
  // Aviso identificable por el canal que ya usa el scheduler para un
  // posteo que no salió (push, con su propio dedupe de 30 min).
  try {
    if (opts.notify === false) { /* tests / call-site lo suprime */ }
    else if (typeof opts.notify === 'function') { opts.notify(post, reason); }
    else {
      const p = require('./push').notifyPostFailed(post.user_id, { db });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch (e) { /* sin aviso, la escalación ya quedó registrada */ }
  return { escalated: true, reason, attempts };
}

// Reprogramación para reintento inmediato por la cola única: solo se
// mueve la hora a ahora; publicar sigue siendo trabajo (y decisión) de
// processDuePosts → publishSinglePost con todos sus candados.
function requeue(db, post, now) {
  const newAt = now.toISOString();
  const requeues = ledgerCount(db, post.id, 'watchdog_requeue');
  db.prepare(`UPDATE posts SET scheduled_at = ? WHERE id = ? AND status = 'scheduled'`).run(newAt, post.id);
  publishGuard.record(db, {
    userId: post.user_id, postId: post.id, kind: publishGuard.kindOf(post),
    status: 'watchdog_requeue', detail: `vencido sin recibo (reprogramación #${requeues + 1})`,
  });
  watchdogEvent(db, post.user_id, 'post_watchdog_requeued', {
    post_id: post.id, user_id: post.user_id,
    original_scheduled_at: post.scheduled_at || '', new_scheduled_at: newAt,
    requeue_count: requeues + 1,
  });
  console.log(`[publish-watchdog] REQUEUED user_id=${post.user_id} post_id=${post.id} original_scheduled_at=${post.scheduled_at || ''} new_scheduled_at=${newAt} requeue_count=${requeues + 1}`);
  return { requeued: true, nextAt: newAt };
}

function userStopped(db, userId) {
  try {
    const u = db.prepare('SELECT COALESCE(publishing_stopped, 0) AS s FROM users WHERE id = ?').get(userId);
    return !!(u && u.s);
  } catch (e) { return false; }
}

// Un barrido. Devuelve conteos; nunca lanza (cada posteo va en su
// propio try/catch y un fallo se cuenta como 'errors', no silencio:
// queda en el log estructurado).
function sweep(db, opts = {}) {
  const out = { scanned: 0, requeued: 0, escalated: 0, skipped: 0, errors: 0 };
  try { ensureSchema(db); } catch (e) { console.error('[publish-watchdog] schema:', e.message); return out; }
  const now = opts.now ? new Date(opts.now) : new Date();
  const grace = Number.isFinite(opts.graceMin) ? opts.graceMin : graceMin();
  const maxR = Number.isFinite(opts.maxRequeues) ? opts.maxRequeues : maxRequeues();
  const cutoff = now.getTime() - grace * 60 * 1000;
  let candidates = [];
  try {
    candidates = db.prepare(
      `SELECT * FROM posts WHERE status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 50`
    ).all();
  } catch (e) { console.error('[publish-watchdog] query:', e.message); return out; }
  for (const post of candidates) {
    try {
      const t = parseTime(post.scheduled_at);
      if (!Number.isFinite(t) || t > cutoff) { out.skipped++; continue; } // dentro de la gracia / sin hora válida
      if ((post.approval || '') === 'rejected') { out.skipped++; continue; } // decisión del cliente, otra vía
      if (userStopped(db, post.user_id)) { out.skipped++; continue; } // freno explícito del dueño
      out.scanned++;
      if (hasVerifiedReceipt(db, post)) { out.skipped++; continue; } // publicado con recibo: no es vencido
      if (Number(post.needs_review || 0) === 1) {
        // Retenido por un humano: no es reintentable en automático.
        if (alreadyEscalated(db, post, 'needs_review_hold')) { out.skipped++; continue; }
        escalate(db, post, 'needs_review_hold', 'posteo vencido retenido por needs_review, sin recibo de publicación', opts);
        out.escalated++;
        continue;
      }
      const requeues = ledgerCount(db, post.id, 'watchdog_requeue');
      if (requeues >= maxR) {
        if (alreadyEscalated(db, post, 'repeated_overdue_no_receipt')) { out.skipped++; continue; }
        escalate(db, post, 'repeated_overdue_no_receipt', `reprogramado ${requeues} veces por el vigía y sigue sin recibo`, { ...opts, pause: true });
        out.escalated++;
        continue;
      }
      requeue(db, post, now);
      out.requeued++;
    } catch (e) {
      out.errors++;
      console.error(`[publish-watchdog] ERROR user_id=${post.user_id} post_id=${post.id} reason=sweep_post_error detail=${String(e.message || e).slice(0, 300)}`);
    }
  }
  if (out.scanned || out.errors) {
    console.log(`[publish-watchdog] sweep scanned=${out.scanned} requeued=${out.requeued} escalated=${out.escalated} skipped=${out.skipped} errors=${out.errors}`);
  }
  return out;
}

module.exports = {
  sweep, escalate, requeue, ensureSchema, hasVerifiedReceipt, parseTime,
  graceMin, intervalMin, maxRequeues,
};
