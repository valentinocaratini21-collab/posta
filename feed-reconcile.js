// feed-reconcile.js — Reconciliación del espejo de Instagram (2026-10-24).
//
// Defecto que corrige: un posteo publicado por Posty quedaba 'published'
// para siempre en la tabla posts, aunque el dueño lo ARCHIVARA o borrara
// en Instagram — el feed de Posty lo seguía mostrando como publicado
// (cuenta 12: la grilla entera archivada el 19/10 seguía rindiendo,
// incluida la «remera Nike» del 27/9). La lectura del perfil solo SUMABA;
// nunca validaba los publicados propios contra la grilla real.
//
// Regla: en cada lectura exitosa del perfil, todo posteo propio
// 'published' (no historia) con permalink cuyo shortcode ya NO está
// en la grilla leída pasa a ig_state='archived_ext' y deja de
// rendirse en el feed (grilla, pestañas, visitante, detalle). Si
// vuelve a la grilla (desarchivado), vuelve a 'live'. El registro NO
// se borra: status, ledger de publicación y analítica quedan intactos.
//
// ASIMETRÍA (LOTE PERFIL-GRILLA-PARTE-2 · v927 — corrige la regla
// 2026-10-24 «lectura parcial NO toca nada»): la parcialidad solo
// invalida la AUSENCIA, nunca la presencia.
//  · RESTAURAR por presencia corre SIEMPRE, también en lectura
//    parcial: que un shortcode APAREZCA en la lectura es prueba
//    positiva de que el posteo está vivo en Instagram (la página del
//    embed lo sirvió como parte de la grilla, o la API oficial lo
//    devolvió). Antes, la guarda de lectura parcial frenaba también
//    la restauración: una marca archived_ext errónea quedaba para
//    siempre, porque las lecturas siguientes seguían siendo parciales
//    (el embed capa en ~11 nodos) y la restauración nunca corría.
//    Caso real @posty.communitymanager 11/11: 5 publicados vivos
//    (perfume 4/11 ×3, café 3/11 ×2) con ig_state='archived_ext' no
//    rendían ni como tile DB (el filtro de publicados los excluye)
//    ni como recent (el dedupe por shortcode los mata en los dos
//    caminos) — la grilla mostraba 6 contra 10 del encabezado, y el
//    fix de la unión (v913) no podía curar una marca.
//  · ARCHIVAR solo en lectura COMPLETA (la guarda vigente): la
//    ausencia solo prueba algo cuando la ventana cubre la grilla
//    entera. Un posteo borrado en IG sale de la grilla igual que
//    antes; un posteo vivo ausente de una ventana truncada no se toca.
//
// SEGURIDAD DURA: la lectura se considera completa SOLO si el contador
// real del perfil (posts_count) es <= a los posteos de primer nivel
// efectivamente leídos — es decir, la lectura cubre la grilla entera.
// Una lectura parcial (grilla más grande que lo leído), fallida o sin
// contador NO archiva nada. Los posteos sin permalink no se tocan: sin id
// de Instagram no se puede probar que desaparecieron.
// (v927) El total ya no es solo el del embed: la página del embed puede
// venir cacheada con un conteo rancio (menor que el real) y hacer pasar
// por completa una lectura parcial — con ese total, la reconciliación
// archivaba posteos vivos ausentes de la ventana. Cuando el llamador
// trae el conteo autoritativo de la API oficial (opts.totalOverride,
// la fuente de la cuenta conectada), el total es el MAYOR de los dos:
// fail-closed en ambas direcciones (un conteo rancio-bajo no abre la
// puerta; uno rancio-alto solo retrasa un archivado, nunca lo inventa).
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
// opts.totalOverride (opcional): conteo autoritativo de la API oficial
// para la cuenta conectada; el total efectivo es el mayor entre ese y
// el del embed (fail-closed). Devuelve {archived, restored, total, seen}
// o {skipped: motivo, restored, total, seen} cuando la lectura parcial
// frena el archivado (la restauración por presencia ya corrió).
function reconcilePublishedMirror(db, userId, data, opts) {
  if (!db || !userId) return { skipped: 'no-db-or-user' };
  if (!data || !data.ok || !data.profile) return { skipped: 'read-not-ok' };
  const embedTotal = (typeof data.profile.posts_count === 'number' && Number.isFinite(data.profile.posts_count))
    ? data.profile.posts_count : null;
  const apiTotal = (opts && typeof opts.totalOverride === 'number' && Number.isFinite(opts.totalOverride))
    ? opts.totalOverride : null;
  if (embedTotal == null && apiTotal == null) return { skipped: 'no-count' };
  const total = (embedTotal == null) ? apiTotal : (apiTotal == null ? embedTotal : Math.max(embedTotal, apiTotal));
  const tops = (Array.isArray(data.posts) ? data.posts : []).filter(isTopLevelReadPost);
  const fresh = new Set();
  for (const p of tops) { if (p.shortcode) fresh.add(String(p.shortcode)); }
  const rows = db.prepare(
    `SELECT id, ig_permalink, ig_state FROM posts
      WHERE user_id = ? AND status = 'published' AND COALESCE(media_type, '') != 'story'`
  ).all(userId);
  const upd = db.prepare(`UPDATE posts SET ig_state = ?, ig_state_at = datetime('now') WHERE id = ? AND user_id = ?`);
  let archived = 0, restored = 0;
  // (v927) RESTAURAR por presencia — siempre, también en lectura
  // parcial (ver la asimetría en el encabezado): estar en la lectura
  // es prueba de estar vivo. Sin permalink no hay prueba: no se toca.
  for (const r of rows) {
    const sc = igShortcodeOf(r.ig_permalink);
    if (!sc) continue;
    if (fresh.has(sc) && r.ig_state === 'archived_ext') { upd.run('live', r.id, userId); restored++; }
  }
  // Lectura parcial: la grilla real es más grande que lo leído. La
  // AUSENCIA no prueba nada: NO se archiva (la restauración de arriba
  // ya corrió y se reporta en `restored`).
  if (total > fresh.size) return { skipped: 'partial-read', total, seen: fresh.size, restored };
  // Lectura completa: la ausencia SÍ prueba que el posteo ya no está.
  for (const r of rows) {
    const sc = igShortcodeOf(r.ig_permalink);
    if (!sc) continue; // sin permalink no hay prueba: no se toca
    if (!fresh.has(sc) && r.ig_state !== 'archived_ext') { upd.run('archived_ext', r.id, userId); archived++; }
  }
  return { archived, restored, total, seen: fresh.size };
}

module.exports = { igShortcodeOf, isTopLevelReadPost, reconcilePublishedMirror };
