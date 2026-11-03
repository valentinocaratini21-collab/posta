// cm-numeros.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// APRENDIZAJE POR NÚMEROS REALES: amplía semana-aprende (que mira
// aprobaciones, preguntas y guardados) con el puntaje POR FORMATO.
// Lee métricas reales de los publicados del cliente: post_metrics y
// piece_learning, unidos por cm_post_formato (el formato que el pipeline
// registró al crear cada posteo).
//
// REGLA DE VERDAD: si un dato no existe, NO se inventa. Un posteo solo
// cuenta como medido si tiene fila en post_metrics o en piece_learning
// con al menos una métrica no nula. Sin posteos medidos no hay ganador:
// { tiene: false }, y el generador sigue como siempre.
// El puntaje es una HEURÍSTICA DE ORDEN documentada (likes 1, comentarios
// 2, guardados 3), no una promesa de ventas ni de alcance.
'use strict';

const PESOS = { likes: 1, comments: 2, saves: 3 };

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_post_formato (
      post_id INTEGER PRIMARY KEY, user_id INTEGER, formato TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function registrarFormato(db, postId, uid, formato) {
  try {
    if (!db || !postId || !formato) return null;
    asegurarTabla(db);
    db.prepare('INSERT OR REPLACE INTO cm_post_formato (post_id, user_id, formato) VALUES (?, ?, ?)')
      .run(postId, uid, formato);
    return { ok: true };
  } catch (e) { return null; }
}

function formatoDePost(db, postId) {
  try {
    if (!db || !postId) return null;
    asegurarTabla(db);
    const row = db.prepare('SELECT formato FROM cm_post_formato WHERE post_id = ?').get(postId);
    return row ? String(row.formato || '') : null;
  } catch (e) { return null; }
}

// Puntaje por formato para ESTA cuenta. Solo posteos medidos.
function puntajePorFormato(db, uid) {
  const vacio = { tiene: false, porFormato: [], medidos: 0 };
  try {
    if (!db || uid === undefined || uid === null) return vacio;
    asegurarTabla(db);
    const rows = db.prepare(`
      SELECT f.formato AS formato,
        pm.likes AS pm_likes, pm.comments AS pm_comments, pm.saved AS pm_saved,
        pl.likes AS pl_likes, pl.comments AS pl_comments, pl.saves AS pl_saves
      FROM cm_post_formato f
      LEFT JOIN post_metrics pm ON pm.post_id = f.post_id
      LEFT JOIN piece_learning pl ON pl.post_id = f.post_id
      WHERE f.user_id = ?`).all(uid);
    const acc = new Map();
    let medidos = 0;
    for (const r of rows) {
      const formato = String(r.formato || '').trim();
      if (!formato) continue;
      const tienePm = r.pm_likes !== null && r.pm_likes !== undefined;
      const tienePl = r.pl_likes !== null && r.pl_likes !== undefined ||
        r.pl_comments !== null && r.pl_comments !== undefined ||
        r.pl_saves !== null && r.pl_saves !== undefined;
      if (!tienePm && !tienePl) continue; // sin medición: no cuenta, no se estima
      medidos++;
      const likes = tienePm ? (+r.pm_likes || 0) : (+r.pl_likes || 0);
      const comments = tienePm ? (+r.pm_comments || 0) : (+r.pl_comments || 0);
      const saves = tienePm ? (+r.pm_saved || 0) : (+r.pl_saves || 0);
      const puntos = likes * PESOS.likes + comments * PESOS.comments + saves * PESOS.saves;
      const cur = acc.get(formato) || { formato, puntos: 0, posteos: 0, likes: 0, comments: 0, saves: 0 };
      cur.puntos += puntos; cur.posteos += 1; cur.likes += likes; cur.comments += comments; cur.saves += saves;
      acc.set(formato, cur);
    }
    const porFormato = [...acc.values()].sort((a, b) => b.puntos - a.puntos);
    return { tiene: medidos > 0, porFormato, medidos };
  } catch (e) { return vacio; }
}

// Ganador claro o null: empate en el primer puesto = sin ganador
// (declarar un ganador empatado sería inventar).
function ganador(db, uid) {
  const p = puntajePorFormato(db, uid);
  if (!p.tiene || !p.porFormato.length) return null;
  if (p.porFormato.length > 1 && p.porFormato[0].puntos === p.porFormato[1].puntos) return null;
  return p.porFormato[0];
}

module.exports = { PESOS, asegurarTabla, registrarFormato, formatoDePost, puntajePorFormato, ganador };
