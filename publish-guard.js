// publish-guard.js — Endurecimiento de la publicación para clientes
// (tanda 2026-10-22, tras el incidente de las destacadas de la cuenta de
// marca: límite diario de Instagram alcanzado a mitad de una tanda y una
// aprobación denegada tratada como ruido. Valentino: "tenemos que aprender
// de esto para no tener el mismo problema con los posteos de nuestros
// clientes").
//
// Las cuatro piezas:
//  1. LEDGER ÚNICO + PRESUPUESTO: publish_ledger registra TODOS los
//     intentos orgánicos (feed/historia/reel/carrusel vía publishSinglePost
//     — el único choke point de publicación — y los boosts como kind
//     aparte, solo auditoría: un boost es una llamada a la Ads API sobre
//     un posteo YA publicado, no consume el presupuesto orgánico de
//     media_publish). Antes de CADA intento se cuenta lo usado en la
//     ventana móvil de 24 h contra el techo efectivo de Instagram
//     (~10/día por cuenta, observado en producción; configurable con
//     PUBLISH_DAILY_CAP). Sin margen → no se quema el intento.
//  2. COLA ÚNICA CON PRIORIDADES: el feed del cliente primero (feed,
//     carrusel y reel = prioridad 0); historias (incluidas las gemelas)
//     después (prioridad 1), compitiendo por el presupuesto restante.
//     processDuePosts ordena con este criterio.
//  3. LÍMITE ≠ FALLO: ante límite (pre-chequeo o 429 de Meta) el posteo
//     NO queda 'failed': se reprograma solo a la próxima ventana segura
//     (cuando vence la publicación más vieja de la ventana) y el cliente
//     recibe UN aviso tranquilo por chat, sin errores crudos.
//  4. DENEGADO = DECISIÓN: una aprobación denegada (el cliente vetó el
//     posteo, o Meta denegó el permiso) frena el ítem para siempre en
//     automático: queda registrado como decisión (evento
//     post_publish_denied + fila del ledger), nunca como error, y jamás
//     se reintenta solo.
//
// Todo es fail-open a favor de publicar SOLO ante errores internos del
// guard (try/catch en los call-sites): el guard jamás puede convertirse
// en la razón por la que un posteo sano no sale — salvo las dos
// decisiones explícitas de arriba (presupuesto agotado / denegado).
'use strict';

const HOUR_MS = 3600 * 1000;

function dailyCap() {
  const n = parseInt(process.env.PUBLISH_DAILY_CAP || '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 10;
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS publish_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER,
    kind TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_publish_ledger_user_time ON publish_ledger(user_id, created_at)`);
}

const ORGANIC_KINDS = ['feed', 'story', 'reel', 'carousel'];

function kindOf(post) {
  const mt = String((post && post.media_type) || 'image');
  if (mt === 'video') return 'reel';
  if (mt === 'story') return 'story';
  if (mt === 'carousel') return 'carousel';
  return 'feed';
}

// Prioridad de cola: 0 = feed del cliente (image/video/carousel),
// 1 = historias (incluye gemelas), 2 = boosts (no pasan por la cola
// orgánica; el valor existe para que el criterio sea total y testeable).
function priorityOf(post) {
  if (!post) return 1;
  if (post.kind === 'boost') return 2;
  return kindOf(post) === 'story' ? 1 : 0;
}

function compareDue(a, b) {
  const pa = priorityOf(a), pb = priorityOf(b);
  if (pa !== pb) return pa - pb;
  return String(a.scheduled_at || '') < String(b.scheduled_at || '') ? -1 : 1;
}

function record(db, { userId, postId = null, kind = '', status = '', detail = '' }) {
  ensureSchema(db);
  db.prepare('INSERT INTO publish_ledger (user_id, post_id, kind, status, detail) VALUES (?,?,?,?,?)')
    .run(userId, postId, kind, status, String(detail || '').slice(0, 500));
}

// Uso orgánico de la ventana móvil de 24 h: intentos+publicados del
// ledger MÁS los posteos publicados en la ventana que el ledger no
// conoce (filas previas a esta tanda), sin doble conteo por posteo.
function usedLast24h(db, userId) {
  ensureSchema(db);
  const led = db.prepare(
    `SELECT COUNT(*) AS c FROM publish_ledger
     WHERE user_id = ? AND kind IN ('feed','story','reel','carousel')
       AND status IN ('attempted','published')
       AND datetime(created_at) > datetime('now', '-24 hours')`
  ).get(userId);
  let legacy = 0;
  try {
    const leg = db.prepare(
      `SELECT COUNT(*) AS c FROM posts
       WHERE user_id = ? AND status = 'published'
         AND datetime(published_at) > datetime('now', '-24 hours')
         AND id NOT IN (SELECT post_id FROM publish_ledger WHERE user_id = ? AND post_id IS NOT NULL)`
    ).get(userId, userId);
    legacy = leg ? leg.c : 0;
  } catch (e) { /* tabla posts sin published_at en esquemas mínimos */ }
  return (led ? led.c : 0) + legacy;
}

// Próxima ventana segura: cuando expira el ítem contado más viejo de
// la ventana (su timestamp + 24 h). Si no hay ninguno, +1 h.
function nextWindowAt(db, userId) {
  ensureSchema(db);
  let oldest = null;
  try {
    const r = db.prepare(
      `SELECT MIN(t) AS t FROM (
         SELECT created_at AS t FROM publish_ledger
           WHERE user_id = ? AND kind IN ('feed','story','reel','carousel')
             AND status IN ('attempted','published')
             AND datetime(created_at) > datetime('now', '-24 hours')
         UNION ALL
         SELECT published_at AS t FROM posts
           WHERE user_id = ? AND status = 'published'
             AND datetime(published_at) > datetime('now', '-24 hours')
             AND id NOT IN (SELECT post_id FROM publish_ledger WHERE user_id = ? AND post_id IS NOT NULL)
       )`
    ).get(userId, userId, userId);
    oldest = r && r.t ? r.t : null;
  } catch (e) { /* esquema mínimo sin posts */ }
  const base = oldest ? new Date(String(oldest).replace(' ', 'T') + 'Z').getTime() : NaN;
  const when = Number.isFinite(base) ? new Date(base + 24 * HOUR_MS + 60 * 1000) : new Date(Date.now() + HOUR_MS);
  // Nunca en el pasado (relojes/zonas): mínimo 5 minutos desde ahora.
  const min = new Date(Date.now() + 5 * 60 * 1000);
  return (when < min ? min : when).toISOString();
}

function preflight(db, post) {
  const cap = dailyCap();
  const used = usedLast24h(db, post.user_id);
  if (used >= cap) {
    return { ok: false, reason: 'budget', used, cap, nextAt: nextWindowAt(db, post.user_id) };
  }
  return { ok: true, used, cap };
}

// Clasificación de errores de Meta para la publicación:
//  - 'limit'  → 429 / límites de la plataforma: reprogramar, no fallar.
//  - 'denied' → permiso denegado: decisión, frenar, no reintentar jamás.
//  - 'other'  → el camino de error de siempre.
function classifyError(msg) {
  const m = String(msg || '');
  if (/\b429\b|too many (requests|calls|actions)|rate.?limit|request limit|#\s?80004|publishing limit|media publish.*limit|action blocked/i.test(m)) return 'limit';
  if (/permission|not authorized|unauthori[sz]ed action|#\s?200\b|OAuthException|\b190\b|access denied|was denied|denied/i.test(m)) return 'denied';
  return 'other';
}

function guardEvent(db, userId, name, props) {
  try {
    db.prepare('INSERT INTO events (user_id, session_id, name, props) VALUES (?,?,?,?)')
      .run(userId || null, '', name, JSON.stringify(props || {}).slice(0, 2000));
  } catch (e) { /* el instrumento nunca frena nada */ }
}

const CALM_DEFER_ERROR = 'Instagram está limitando las publicaciones de tu cuenta por hoy 🙏 Lo reprogramé solo y sale apenas se libere el cupo.';

// Pieza 3: reprogramar a la próxima ventana segura + aviso tranquilo
// (chat, deduplicado: un aviso por posteo por día como máximo).
function deferPost(db, post, info = {}) {
  const nextAt = info.nextAt || nextWindowAt(db, post.user_id);
  db.prepare(`UPDATE posts SET status = 'scheduled', scheduled_at = ?, error = ? WHERE id = ?`)
    .run(nextAt, CALM_DEFER_ERROR, post.id);
  record(db, { userId: post.user_id, postId: post.id, kind: kindOf(post), status: 'limit_deferred', detail: info.reason || '' });
  guardEvent(db, post.user_id, 'post_publish_deferred', {
    post_id: post.id, kind: 'rate_limit', cause: String(info.reason || '').slice(0, 300),
    next_at: nextAt, media_type: post.media_type || '',
  });
  try {
    // El evento recién insertado es el primero si no hay OTRO anterior:
    // si hay más de 1 con esta clave exacta, el aviso ya salió (un aviso
    // por posteo como máximo; la coma/cierre final evita que el id 5
    // matchee al 55).
    const keyA = `%"post_id":${post.id},%`, keyB = `%"post_id":${post.id}}%`;
    const count = db.prepare(
      `SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND name = 'post_publish_deferred' AND (props LIKE ? OR props LIKE ?)`
    ).get(post.user_id, keyA, keyB);
    if (count && count.c <= 1) {
      const day = new Date(nextAt).toISOString().slice(0, 10);
      db.prepare('INSERT INTO chat_messages (user_id, role, text) VALUES (?,?,?)')
        .run(post.user_id, 'assistant', `instagram está frenando las publicaciones de tu cuenta por hoy 🙏 tu posteo no se perdió: lo reprogramé y sale solo apenas se libere el cupo (ventana del ${day}). vos no tenés que hacer nada ✨`);
    }
  } catch (e) { /* sin chat, la reprogramación ya quedó hecha */ }
  return { deferred: true, nextAt };
}

// Pieza 4: denegado = decisión registrada. `decision` =
// 'client_rejected' (el cliente vetó el posteo) o 'meta_denied'
// (Meta denegó el permiso). Nunca se reintenta en automático.
function denyPost(db, post, decision, cause = '') {
  if (decision === 'client_rejected') {
    db.prepare(`UPDATE posts SET status = 'cancelled', error = '' WHERE id = ?`).run(post.id);
  } else {
    db.prepare(`UPDATE posts SET status = 'paused', error = ? WHERE id = ?`)
      .run('Este posteo quedó pausado: Instagram no autorizó la publicación. Revisá la conexión de tu cuenta y lo retomamos juntos 🙏', post.id);
  }
  record(db, { userId: post.user_id, postId: post.id, kind: kindOf(post), status: 'denied', detail: decision });
  guardEvent(db, post.user_id, 'post_publish_denied', {
    post_id: post.id, kind: 'denied_decision', decision,
    cause: String(cause || '').slice(0, 300), media_type: post.media_type || '',
  });
  return { denied: true, decision };
}

module.exports = {
  dailyCap, ensureSchema, kindOf, priorityOf, compareDue, record,
  usedLast24h, nextWindowAt, preflight, classifyError, deferPost, denyPost,
  CALM_DEFER_ERROR, ORGANIC_KINDS,
};
