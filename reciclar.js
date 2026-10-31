// reciclar.js — RECICLAR GANADORES (mejora 4/5 de Posty, aprobada por
// Valentino el 30/10 ~01:22 EDT con «dale, arma todo»).
//
// QUÉ: el mejor posteo por alcance REAL de hace ≥90 días vuelve en versión
// fresca: la misma idea que ya probó que funciona, con foto real nueva del
// producto. No se inventa nada: se reutiliza lo que rindió.
//
// REGLAS DURAS (todas verificadas por tests, no solo declaradas):
//  1. Selección SOLO por alcance real > 0 (post_metrics.reach, con fallback
//     a posts.ig_reach: ambos vienen de insights de Instagram, nunca de
//     estimaciones). Alcance 0 o sin métrica = no es ganador.
//  2. El posteo origen debe tener ≥90 días desde published_at
//     (RECYCLE_MIN_AGE_DAYS; 90 días = un trimestre: el público ya no tiene
//     el posteo fresco y el alcance viejo no compite con el feed actual).
//     Sin published_at no se puede probar la edad → no se elige.
//  3. Foto real NUEVA del producto: sale de la tabla assets (fotos que el
//     cliente subió), NUNCA se regenera una imagen y NUNCA se republica la
//     imagen original tal cual. Además la foto no debe haberse usado en
//     ningún posteo anterior (si ya salió, no es nueva).
//     Sin foto real nueva disponible NO hay propuesta: se registra el
//     pedido (status 'needs_photo') para pedirla con un toque, o se omite.
//     Jamás se inventa una imagen.
//  4. Misma idea probada, texto fresco: el borrador conserva la idea
//     central del caption origen (su primera frase, un hecho del registro)
//     y cambia el resto: no copia el caption viejo tal cual. El cierre
//     «de nuevo, porque funcionó» remite al alcance real registrado, no
//     agrega ninguna afirmación nueva sin registro.
//  5. El dueño aprueba con un toque; nunca se publica solo: el borrador
//     nace con status='draft', approval='pending' y scheduled_at=NULL.
//     El scheduler solo publica posteos 'scheduled', así que un borrador
//     reciclado no puede salir sin que el dueño lo apruebe (flujo de
//     aprobación existente POST /api/posts/:id/approve) y lo programe.
//     Este módulo JAMÁS programa ni publica nada.
//  6. Un ganador se recicla una sola vez (UNIQUE(user_id, origin_post_id))
//     y un reciclado nunca vuelve a ser origen (source='recicla' excluido):
//     sin cadenas de reciclaje ni bucles.
//  7. Sin IA y sin generación de imágenes en este módulo: todo sale de
//     registros existentes (posteos, métricas, álbum del cliente).
'use strict';

const MIN_AGE_DAYS = 90;
const MIN_AGE_MS = MIN_AGE_DAYS * 24 * 3600 * 1000;

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS posty_recicla (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    origin_post_id INTEGER NOT NULL,
    draft_post_id INTEGER,
    photo_asset_id INTEGER,
    photo_path TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_at TEXT,
    UNIQUE(user_id, origin_post_id)
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posty_recicla_user ON posty_recicla(user_id, status)`);
}

// El ganador: mayor alcance real, con ≥90 días, publicado, con caption
// (sin idea no hay nada que reutilizar), nunca reciclado antes y nunca un
// reciclado previo. published_at es la fecha que prueba la edad.
function pickWinner(db, userId, nowMs) {
  ensureSchema(db);
  const cutoff = new Date(nowMs - MIN_AGE_MS).toISOString().slice(0, 19).replace('T', ' ');
  const row = db.prepare(`
    SELECT p.id, p.image_path, p.caption, p.hashtags, p.published_at,
           COALESCE(m.reach, p.ig_reach, 0) AS reach
    FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id
    WHERE p.user_id = ?
      AND p.status = 'published'
      AND p.published_at IS NOT NULL AND p.published_at <> ''
      AND p.published_at <= ?
      AND COALESCE(m.reach, p.ig_reach, 0) > 0
      AND COALESCE(p.caption, '') <> ''
      AND COALESCE(p.source, '') <> 'recicla'
      AND p.id NOT IN (SELECT origin_post_id FROM posty_recicla WHERE user_id = ?)
    ORDER BY reach DESC, p.published_at ASC
    LIMIT 1`).get(userId, cutoff, userId);
  return row || null;
}

// Foto real nueva: del álbum del cliente (assets kind='photo'), distinta de
// la imagen origen y sin uso previo en ningún posteo del cliente.
// Preferencia: fotos etiquetadas 'producto' (el producto, no el local).
function pickFreshPhoto(db, userId, originImagePath) {
  ensureSchema(db);
  const row = db.prepare(`
    SELECT id, file_path, thumb_path, album_tag FROM assets
    WHERE user_id = ? AND kind = 'photo'
      AND file_path <> ?
      AND file_path NOT IN (SELECT image_path FROM posts WHERE user_id = ?)
    ORDER BY (CASE WHEN COALESCE(album_tag, '') = 'producto' THEN 0 ELSE 1 END), id ASC
    LIMIT 1`).get(userId, originImagePath, userId);
  return row || null;
}

// Texto fresco sin afirmaciones nuevas: la idea central (primera frase del
// caption origen, sin el bloque final de hashtags) + un cierre neutro que
// remite al rendimiento registrado. Nunca devuelve el caption tal cual.
function freshCaption(originCaption, originHashtags) {
  const raw = String(originCaption || '').trim();
  if (!raw) return null;
  // Quita los hashtags (son etiquetas, no idea): si solo quedaban
  // hashtags, no hay idea que reutilizar.
  const noTags = raw.replace(/#[^\s#]+/g, '').replace(/\s+/g, ' ').trim();
  if (!noTags) return null;
  const firstSentence = (noTags.split(/(?<=[.!?…])\s+/)[0] || '').trim();
  const core = firstSentence || noTags;
  const tags = String(originHashtags || '').trim();
  return core + '\n\n✦ de nuevo, porque funcionó.' + (tags ? '\n\n' + tags : '');
}

function winnerPublic(w) {
  if (!w) return null;
  return {
    id: w.id, image_path: w.image_path, caption: w.caption,
    hashtags: w.hashtags, published_at: w.published_at, reach: w.reach,
  };
}

function createDraft(db, userId, winner, photo, caption) {
  const why = '♻️ Reciclaje del ganador del ' + String(winner.published_at || '').slice(0, 10) +
    ' (alcance real ' + winner.reach + '): misma idea que ya funcionó, con foto real nueva. ' +
    'Falta tu aprobación: no se publica solo.';
  const ins = db.prepare(`INSERT INTO posts
    (user_id, image_path, caption, hashtags, status, media_type, needs_review, source, client_photo, approval, strategy_why)
    VALUES (?,?,?,?, 'draft', 'image', 0, 'recicla', 1, 'pending', ?)`)
    .run(userId, photo.file_path, caption, winner.hashtags || '', why);
  return Number(ins.lastInsertRowid);
}

// Estado actual para el dueño, sin crear nada: si hay un pedido de foto
// pendiente se muestra ese; si no, el ganador elegible y si tiene foto
// nueva disponible.
function candidate(db, userId, nowMs) {
  ensureSchema(db);
  const pendingPhoto = db.prepare(`
    SELECT r.id AS recicla_id, r.origin_post_id, p.image_path, p.caption,
           p.hashtags, p.published_at, COALESCE(m.reach, p.ig_reach, 0) AS reach
    FROM posty_recicla r JOIN posts p ON p.id = r.origin_post_id
    LEFT JOIN post_metrics m ON m.post_id = p.id
    WHERE r.user_id = ? AND r.status = 'needs_photo'
    ORDER BY r.id ASC LIMIT 1`).get(userId);
  if (pendingPhoto) {
    return { state: 'needs_photo', recicla_id: pendingPhoto.recicla_id, winner: winnerPublic(pendingPhoto) };
  }
  const winner = pickWinner(db, userId, nowMs);
  if (!winner) return { state: 'none', winner: null };
  const photo = pickFreshPhoto(db, userId, winner.image_path);
  return {
    state: photo ? 'ready' : 'no_fresh_photo',
    winner: winnerPublic(winner),
    hasFreshPhoto: !!photo,
  };
}

// Crea la propuesta (borrador). Idempotente por origen: un ganador con fila
// en posty_recicla ya no lo vuelve a elegir pickWinner, así que un segundo
// llamado propone al siguiente ganador o devuelve no_winner.
function propose(db, userId, nowMs) {
  ensureSchema(db);
  const winner = pickWinner(db, userId, nowMs);
  if (!winner) return { ok: false, reason: 'no_winner' };
  const photo = pickFreshPhoto(db, userId, winner.image_path);
  if (!photo) {
    // Sin foto real nueva NO se inventa nada: queda el pedido registrado
    // (un toque del dueño cuando suba la foto lo resuelve vía fotoLista).
    const ins = db.prepare(`INSERT INTO posty_recicla
      (user_id, origin_post_id, status) VALUES (?, ?, 'needs_photo')`).run(userId, winner.id);
    return { ok: false, reason: 'no_fresh_photo', recicla_id: Number(ins.lastInsertRowid), winner: winnerPublic(winner) };
  }
  const caption = freshCaption(winner.caption, winner.hashtags);
  if (!caption) return { ok: false, reason: 'no_caption', winner: winnerPublic(winner) };
  const draftId = createDraft(db, userId, winner, photo, caption);
  const ins = db.prepare(`INSERT INTO posty_recicla
    (user_id, origin_post_id, draft_post_id, photo_asset_id, photo_path, status)
    VALUES (?, ?, ?, ?, ?, 'pending')`).run(userId, winner.id, draftId, photo.id, photo.file_path);
  return {
    ok: true, recicla_id: Number(ins.lastInsertRowid), draft_post_id: draftId,
    winner: winnerPublic(winner), photo_path: photo.file_path, caption,
  };
}

// El dueño avisa (un toque) que ya subió una foto nueva: reintenta solo
// sobre el pedido pendiente, sin tocar ningún otro ganador.
function fotoLista(db, userId, reciclaId) {
  ensureSchema(db);
  const row = db.prepare(`SELECT * FROM posty_recicla WHERE id = ? AND user_id = ?`).get(reciclaId, userId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'needs_photo') return { ok: false, reason: 'not_pending_photo', status: row.status };
  const origin = db.prepare(`
    SELECT p.id, p.image_path, p.caption, p.hashtags, p.published_at,
           COALESCE(m.reach, p.ig_reach, 0) AS reach
    FROM posts p LEFT JOIN post_metrics m ON m.post_id = p.id
    WHERE p.id = ? AND p.user_id = ?`).get(row.origin_post_id, userId);
  if (!origin) return { ok: false, reason: 'origin_missing' };
  const photo = pickFreshPhoto(db, userId, origin.image_path);
  if (!photo) return { ok: false, reason: 'no_fresh_photo', recicla_id: row.id, winner: winnerPublic(origin) };
  const caption = freshCaption(origin.caption, origin.hashtags);
  if (!caption) return { ok: false, reason: 'no_caption' };
  const draftId = createDraft(db, userId, origin, photo, caption);
  db.prepare(`UPDATE posty_recicla SET draft_post_id = ?, photo_asset_id = ?, photo_path = ?, status = 'pending'
    WHERE id = ?`).run(draftId, photo.id, photo.file_path, row.id);
  return {
    ok: true, recicla_id: row.id, draft_post_id: draftId,
    winner: winnerPublic(origin), photo_path: photo.file_path, caption,
  };
}

// El dueño descarta el pedido de foto: ese ganador no vuelve a proponerse
// (la fila queda como memoria, status 'dismissed').
function dismiss(db, userId, reciclaId) {
  ensureSchema(db);
  const row = db.prepare(`SELECT * FROM posty_recicla WHERE id = ? AND user_id = ?`).get(reciclaId, userId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.status !== 'needs_photo') return { ok: false, reason: 'not_pending_photo', status: row.status };
  db.prepare(`UPDATE posty_recicla SET status = 'dismissed', decided_at = datetime('now') WHERE id = ?`).run(reciclaId);
  return { ok: true, recicla_id: reciclaId };
}

module.exports = {
  MIN_AGE_DAYS, ensureSchema, pickWinner, pickFreshPhoto, freshCaption,
  candidate, propose, fotoLista, dismiss,
};
