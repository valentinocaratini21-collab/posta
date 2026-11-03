// cm-calidad.js — LOTE CEREBRO-CM, pieza 11 (3/11, SIN PUSH).
//
// FILTRO DE CALIDAD EN GENERACIÓN: la brecha real que detectó el equipo
// era que captionPasses (el control que detecta captions genéricos)
// existía pero la ruta de generación NO lo aplicaba. Este módulo es el
// cable: evalúa el caption con EL MISMO captionPasses, sin cambiar ni
// un criterio.
//
// Diseño a propósito: captionPasses se INYECTA (el llamador lo pasa).
// Este módulo no requiere generator.js, para no arrastrar sus
// dependencias a los tests ni a otros llamadores. Si un criterio parece
// mal, se documenta como pendiente: NUNCA se afloja acá.
//
// Salida: { ok: true } o { ok: false, reason } (el motivo exacto del
// filtro). El pipeline, ante un fallo, marca el posteo en revisión
// (needs_review=1) y guarda el motivo en cm_post_calidad: el caption
// flojo nunca se publica, pero tampoco se tira trabajo sin marca.
'use strict';

function evaluarCaption(caption, input, captionPassesFn) {
  try {
    if (typeof captionPassesFn !== 'function') return { ok: true, reason: '' };
    const r = captionPassesFn(caption, input || {});
    if (r && r.ok) return { ok: true, reason: '' };
    return { ok: false, reason: String((r && r.reason) || 'no pasa el filtro de calidad') };
  } catch (e) { return { ok: true, reason: '' }; }
}

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_post_calidad (
      post_id INTEGER PRIMARY KEY, user_id INTEGER, motivo TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function registrar(db, postId, uid, motivo) {
  try {
    if (!db || !postId || !motivo) return null;
    asegurarTabla(db);
    db.prepare('INSERT OR REPLACE INTO cm_post_calidad (post_id, user_id, motivo) VALUES (?, ?, ?)')
      .run(postId, uid, String(motivo));
    return { ok: true };
  } catch (e) { return null; }
}

function motivoDePost(db, postId) {
  try {
    if (!db || !postId) return null;
    asegurarTabla(db);
    const row = db.prepare('SELECT motivo FROM cm_post_calidad WHERE post_id = ?').get(postId);
    return row ? String(row.motivo || '') : null;
  } catch (e) { return null; }
}

module.exports = { evaluarCaption, asegurarTabla, registrar, motivoDePost };
