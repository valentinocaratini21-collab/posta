// cm-objetivo.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// OBJETIVO COMERCIAL SEMANAL: una pieza por semana con un objetivo
// comercial concreto (reservar, ir al local, comprar, escribirte) sacado
// del fundamento del negocio (objetivo declarado, campaña activa, promo).
// El objetivo se REGISTRA (cm_semana.objetivo + cm_post_objetivo) y se
// MIDE DESPUÉS con datos reales (publicados de esa semana + sus
// métricas). Nunca se promete un resultado; nunca se estima.
//
// Sin señal en el fundamento no hay objetivo forzado: elegirObjetivo
// devuelve null y la semana sale sin pieza-objetivo. Forzar un objetivo
// que el negocio no tiene sería inventar.
'use strict';

const OBJETIVOS = ['reservar', 'ir-al-local', 'comprar', 'escribirte'];

const PALABRAS = [
  { objetivo: 'reservar', rx: /reserv|turno|reserva/i },
  { objetivo: 'comprar', rx: /compr|vend|pedido|tienda|shop/i },
  { objetivo: 'ir-al-local', rx: /visit|ven[ií]|pas[aá]\s+por|local|direcci[oó]n/i },
  { objetivo: 'escribirte', rx: /escrib|mensaje|whatsapp|dm|contact/i },
];

function elegirObjetivo({ goal, campaign, promos = [] } = {}) {
  const texto = [goal || '', campaign || '', ...(promos || []).map((p) => String((p && p.nombre) || p || ''))].join(' ');
  if (!texto.trim()) return null;
  for (const p of PALABRAS) {
    if (p.rx.test(texto)) return { objetivo: p.objetivo, origen: 'fundamento' };
  }
  return null;
}

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_post_objetivo (
      post_id INTEGER PRIMARY KEY, user_id INTEGER, objetivo TEXT DEFAULT '',
      week_key TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function registrarObjetivoPost(db, postId, uid, objetivo, weekKey) {
  try {
    if (!db || !postId || !objetivo) return null;
    asegurarTabla(db);
    db.prepare('INSERT OR REPLACE INTO cm_post_objetivo (post_id, user_id, objetivo, week_key) VALUES (?, ?, ?, ?)')
      .run(postId, uid, objetivo, String(weekKey || ''));
    return { ok: true };
  } catch (e) { return null; }
}

// Medición real del objetivo de una semana: solo posteos PUBLICADOS de
// esa semana con ese objetivo + sus métricas. Sin publicados, null
// (no hay nada que medir, y no se estima).
function medirObjetivo(db, uid, weekKey, objetivo) {
  try {
    if (!db || !uid || !weekKey || !objetivo) return null;
    asegurarTabla(db);
    const rows = db.prepare(`
      SELECT p.id AS id, p.status AS status,
        pm.likes AS pm_likes, pm.comments AS pm_comments, pm.saved AS pm_saved,
        pl.likes AS pl_likes, pl.comments AS pl_comments, pl.saves AS pl_saves
      FROM cm_post_objetivo o JOIN posts p ON p.id = o.post_id
      LEFT JOIN post_metrics pm ON pm.post_id = p.id
      LEFT JOIN piece_learning pl ON pl.post_id = p.id
      WHERE o.user_id = ? AND o.week_key = ? AND o.objetivo = ? AND p.status = 'published'`).all(uid, weekKey, objetivo);
    if (!rows.length) return null;
    let likes = 0, comments = 0, saves = 0;
    for (const r of rows) {
      const tienePm = r.pm_likes !== null && r.pm_likes !== undefined;
      likes += tienePm ? (+r.pm_likes || 0) : (+r.pl_likes || 0);
      comments += tienePm ? (+r.pm_comments || 0) : (+r.pl_comments || 0);
      saves += tienePm ? (+r.pm_saved || 0) : (+r.pl_saves || 0);
    }
    return { objetivo, weekKey, publicados: rows.length, likes, comments, saves };
  } catch (e) { return null; }
}

module.exports = { OBJETIVOS, elegirObjetivo, asegurarTabla, registrarObjetivoPost, medirObjetivo };
