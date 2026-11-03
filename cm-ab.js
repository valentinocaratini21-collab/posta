// cm-ab.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// PRUEBA A/B DE GANCHOS: dos ganchos para el mismo tema, y el ganador
// se decide SOLO con datos reales de ambos publicados. Sin datos de
// los dos lados no hay ganador: medirYGanar devuelve { ganador: null,
// reason: 'sin_datos' } y nadie declara nada.
//
// Cómo se arman las parejas: el pipeline marca UNA pieza por semana como
// pieza A/B (su gancho queda registrado como variante A). Cuando otra
// pieza posterior usa el MISMO tema con un gancho distinto, se registra
// como variante B y la pareja queda medible. El puntaje usa los mismos
// pesos documentados de cm-numeros (likes 1, comentarios 2, guardados 3).
// Esto NO duplica posteos: las variantes son piezas reales en semanas
// distintas, no dos publicaciones del mismo día.
'use strict';

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_ab (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      tema TEXT DEFAULT '', gancho_a TEXT DEFAULT '', gancho_b TEXT DEFAULT '',
      post_id_a INTEGER, post_id_b INTEGER, ganador TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

// Registra una variante: si hay una prueba abierta del mismo tema con
// otro gancho, la completa como B; si no, abre una nueva como A.
function registrarVariante(db, uid, { postId, tema, gancho } = {}) {
  try {
    if (!db || !postId || !tema || !gancho) return null;
    asegurarTabla(db);
    const abierta = db.prepare(`SELECT * FROM cm_ab WHERE user_id = ? AND tema = ?
      AND post_id_b IS NULL ORDER BY created_at DESC, id DESC LIMIT 1`).get(uid, String(tema));
    if (abierta && String(abierta.gancho_a) !== String(gancho)) {
      db.prepare('UPDATE cm_ab SET gancho_b = ?, post_id_b = ? WHERE id = ?')
        .run(String(gancho), postId, abierta.id);
      return { ok: true, id: abierta.id, rol: 'B' };
    }
    if (abierta) return { ok: true, id: abierta.id, rol: 'A-existente' };
    const r = db.prepare('INSERT INTO cm_ab (user_id, tema, gancho_a, post_id_a) VALUES (?, ?, ?, ?)')
      .run(uid, String(tema), String(gancho), postId);
    return { ok: true, id: r && r.lastInsertRowid, rol: 'A' };
  } catch (e) { return null; }
}

function metricasPost(db, postId) {
  try {
    const pm = db.prepare('SELECT likes, comments, saved FROM post_metrics WHERE post_id = ?').get(postId);
    if (pm && (pm.likes !== null && pm.likes !== undefined)) {
      return { likes: +pm.likes || 0, comments: +pm.comments || 0, saves: +pm.saved || 0, medido: true };
    }
    const pl = db.prepare('SELECT likes, comments, saves FROM piece_learning WHERE post_id = ?').get(postId);
    if (pl && (pl.likes !== null && pl.likes !== undefined || pl.comments !== null && pl.comments !== undefined || pl.saves !== null && pl.saves !== undefined)) {
      return { likes: +pl.likes || 0, comments: +pl.comments || 0, saves: +pl.saves || 0, medido: true };
    }
    return { likes: 0, comments: 0, saves: 0, medido: false };
  } catch (e) { return { likes: 0, comments: 0, saves: 0, medido: false }; }
}

// Mide una pareja completa y, solo con datos de ambos lados, declara
// ganador. Empate = sin ganador.
function medirYGanar(db, pruebaId) {
  try {
    if (!db || !pruebaId) return { ganador: null, reason: 'sin_prueba' };
    asegurarTabla(db);
    const p = db.prepare('SELECT * FROM cm_ab WHERE id = ?').get(pruebaId);
    if (!p || !p.post_id_a || !p.post_id_b) return { ganador: null, reason: 'sin_datos' };
    const ma = metricasPost(db, p.post_id_a);
    const mb = metricasPost(db, p.post_id_b);
    if (!ma.medido || !mb.medido) return { ganador: null, reason: 'sin_datos' };
    const pa = ma.likes + 2 * ma.comments + 3 * ma.saves;
    const pb = mb.likes + 2 * mb.comments + 3 * mb.saves;
    if (pa === pb) return { ganador: null, reason: 'empate' };
    const ganador = pa > pb ? 'A' : 'B';
    db.prepare('UPDATE cm_ab SET ganador = ? WHERE id = ?').run(ganador, pruebaId);
    return { ganador, puntosA: pa, puntosB: pb };
  } catch (e) { return { ganador: null, reason: 'error' }; }
}

module.exports = { asegurarTabla, registrarVariante, medirYGanar, metricasPost };
