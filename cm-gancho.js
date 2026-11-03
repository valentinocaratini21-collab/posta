// cm-gancho.js — LOTE CEREBRO-CM, pieza 12 (3/11, SIN PUSH).
//
// GANCHO PRIMERO: cada posteo abre con un gancho que pare el scroll —
// la primera frase (texto) o los primeros 3 segundos (video, donde el
// guion ya estructura hook/problem/solution/cta con hook en [0, 3s]).
// Nunca una presentación: «somos…», «bienvenidos…», «te presentamos…»
// es tarjeta de visita, no gancho.
//
// El gancho se REGISTRA por posteo (cm_post_gancho: primera línea del
// caption + tipo texto/video) y se MIDE después con datos reales
// (medirGancho: métricas del posteo o null si no está medido).
// La detección de presentación es ADICIONAL a captionPasses (que ya
// frena intros genéricas tipo «hola»/«les contamos»): no cambia ningún
// criterio del filtro, suma un motivo propio en revisión.
'use strict';

function primerGancho(caption) {
  const lines = String(caption || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  return lines[0].slice(0, 140);
}

// Apertura de presentación (tarjeta de visita, no gancho).
const PRESENTACION = /^(somos|bienvenid[oa]s?(\s+a)?|te\s+presentamos|les\s+presentamos|este\s+es\s+nuestro|esta\s+es\s+nuestra|conoc[eé]\s+nuestro|conoc[eé]\s+nuestra)\b/i;

function abreConPresentacion(caption) {
  const g = primerGancho(caption);
  if (!g) return false;
  return PRESENTACION.test(g);
}

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_post_gancho (
      post_id INTEGER PRIMARY KEY, user_id INTEGER, gancho TEXT DEFAULT '',
      tipo TEXT DEFAULT 'texto',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function registrar(db, postId, uid, gancho, tipo) {
  try {
    if (!db || !postId || !gancho) return null;
    asegurarTabla(db);
    db.prepare('INSERT OR REPLACE INTO cm_post_gancho (post_id, user_id, gancho, tipo) VALUES (?, ?, ?, ?)')
      .run(postId, uid, String(gancho), String(tipo || 'texto'));
    return { ok: true };
  } catch (e) { return null; }
}

function ganchoDePost(db, postId) {
  try {
    if (!db || !postId) return null;
    asegurarTabla(db);
    const row = db.prepare('SELECT gancho, tipo FROM cm_post_gancho WHERE post_id = ?').get(postId);
    return row ? { gancho: row.gancho, tipo: row.tipo } : null;
  } catch (e) { return null; }
}

// Medición del gancho: métricas reales del posteo, o null sin medición.
function medirGancho(db, postId) {
  try {
    if (!db || !postId) return null;
    const pm = db.prepare('SELECT likes, comments, saved FROM post_metrics WHERE post_id = ?').get(postId);
    if (pm && pm.likes !== null && pm.likes !== undefined) {
      return { likes: +pm.likes || 0, comments: +pm.comments || 0, saves: +pm.saved || 0 };
    }
    const pl = db.prepare('SELECT likes, comments, saves FROM piece_learning WHERE post_id = ?').get(postId);
    if (pl && (pl.likes !== null && pl.likes !== undefined || pl.comments !== null && pl.comments !== undefined || pl.saves !== null && pl.saves !== undefined)) {
      return { likes: +pl.likes || 0, comments: +pl.comments || 0, saves: +pl.saves || 0 };
    }
    return null;
  } catch (e) { return null; }
}

module.exports = { primerGancho, abreConPresentacion, asegurarTabla, registrar, ganchoDePost, medirGancho };
