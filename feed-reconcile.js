// feed-reconcile.js — Reconciliación del espejo de Instagram (2026-10-24).
//
// Defecto que corrige: un posteo publicado por Posty quedaba 'published'
// para siempre en la tabla posts, aunque el dueño lo ARCHIVARA o borrara
// en Instagram — el feed de Posty lo seguía mostrando como publicado
// (cuenta 12: la grilla entera archivada el 19/10 seguía rindiendo,
// incluida la «remera Nike» del 27/9). La lectura del perfil solo SUMABA;
// nunca validaba los publicados propios contra la grilla real.
//
// Regla: en cada lectura COMPLETA y exitosa del perfil, todo posteo
// propio 'published' (no historia) con permalink cuyo shortcode ya NO
// está en la grilla leída pasa a ig_state='archived_ext' y deja de
// rendirse en el feed (grilla, pestañas, visitante, detalle). Si vuelve
// a la grilla (desarchivado), vuelve a 'live'. El registro NO se borra:
// status, ledger de publicación y analítica quedan intactos.
//
// SEGURIDAD DURA: la lectura se considera completa SOLO si el contador
// real del perfil (posts_count) es <= a los posteos de primer nivel
// efectivamente leídos — es decir, la lectura cubre la grilla entera.
// Una lectura parcial (grilla más grande que lo leído), fallida o sin
// contador NO toca nada. Los posteos sin permalink no se tocan: sin id
// de Instagram no se puede probar que desaparecieron.
'use strict';

// Shortcode desde un permalink de IG (/p/<sc>/, /reel/<sc>/, /reels/<sc>/).
function igShortcodeOf(url) {
  const m = /\/(?:p|reel|reels)\/([A-Za-z0-9_-]{5,20})/.exec(String(url || ''));
  return m ? m[1] : null;
}

// ¿Es un posteo de PRIMER NIVEL de la grilla? El parser del embed también
// devuelve los hijos de los carruseles (GraphImage sueltos dentro del
// GraphSidecar): llegan sin fecha y sin caption, y NO son posteos — son
// placas del carrusel. Tratarlos como posteos infla la lectura (la cuenta
// 12 leía 8 «posteos» con 2 reales) y, en cuentas sin publicados propios
// que los enmascaren, rinde placas ajenas como posteos del perfil.
function isTopLevelReadPost(p) {
  if (!p || typeof p !== 'object') return false;
  const hasDate = typeof p.taken_at === 'number' && p.taken_at > 0;
  const hasCaption = !!String(p.caption || '').trim();
  return hasDate || hasCaption;
}

// data = resultado de feedAudit.fetchAuditData (ok/profile/posts).
// Devuelve {archived, restored, total, seen} o {skipped: motivo}.
function reconcilePublishedMirror(db, userId, data) {
  if (!db || !userId) return { skipped: 'no-db-or-user' };
  if (!data || !data.ok || !data.profile) return { skipped: 'read-not-ok' };
  const total = (typeof data.profile.posts_count === 'number' && Number.isFinite(data.profile.posts_count))
    ? data.profile.posts_count : null;
  if (total == null) return { skipped: 'no-count' };
  const tops = (Array.isArray(data.posts) ? data.posts : []).filter(isTopLevelReadPost);
  const fresh = new Set();
  for (const p of tops) { if (p.shortcode) fresh.add(String(p.shortcode)); }
  // Lectura parcial: la grilla real es más grande que lo leído. NO tocar.
  if (total > fresh.size) return { skipped: 'partial-read', total, seen: fresh.size };
  const rows = db.prepare(
    `SELECT id, ig_permalink, ig_state FROM posts
      WHERE user_id = ? AND status = 'published' AND COALESCE(media_type, '') != 'story'`
  ).all(userId);
  const upd = db.prepare(`UPDATE posts SET ig_state = ?, ig_state_at = datetime('now') WHERE id = ? AND user_id = ?`);
  let archived = 0, restored = 0;
  for (const r of rows) {
    const sc = igShortcodeOf(r.ig_permalink);
    if (!sc) continue; // sin permalink no hay prueba: no se toca
    const live = fresh.has(sc);
    if (!live && r.ig_state !== 'archived_ext') { upd.run('archived_ext', r.id, userId); archived++; }
    else if (live && r.ig_state === 'archived_ext') { upd.run('live', r.id, userId); restored++; }
  }
  return { archived, restored, total, seen: fresh.size };
}

module.exports = { igShortcodeOf, isTopLevelReadPost, reconcilePublishedMirror };
