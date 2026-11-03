// cm-gusto.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// VARA DE VALENTINO / VARA DEL DUEÑO: cada aprobación y cada rechazo del
// cliente queda como señal de gusto DURABLE, por cliente, en cm_gusto.
// El generador la consulta antes de armar la semana: lo aprobado se
// repite en su espíritu, lo rechazado/vetado NO vuelve.
//
// Señales que se registran (desde las costuras del servidor, nunca a mano):
//   aprobada  — corazón (like), aprobar de un toque, señal «approved»
//   rechazada — rechazar/cancelar, señal «rejected»
//   cambio    — pedir un cambio en el chat, señal «edited»
// Un «unlike» RETIRA la señal aprobada de ese posteo (el gusto cambió).
// Aislamiento: consultar(uid) solo ve filas de ESE uid. Jamás se usa el
// gusto de un cliente para otro.
//
// El veto es por TOKENS del tema/ángulo rechazado (palabras con contenido,
// 4+ letras, sin stopwords): un tema nuevo se considera vetado si comparte
// 2+ tokens con algo rechazado, o 1 token de 7+ letras. Es una regla
// conservadora a propósito: mejor dejar pasar un tema que vetar de más.
'use strict';

const STOP = new Set(('de la el que en y a los las un una con por para su sus al del como mas pero este esta esto eso esa sin sobre entre cuando donde es son fue eran estan'.split(' ')));

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(texto) {
  const seen = new Set();
  const out = [];
  for (const w of norm(texto).split(' ').filter(Boolean)) {
    if (w.length >= 4 && !STOP.has(w) && !seen.has(w)) { seen.add(w); out.push(w); }
  }
  return out;
}

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_gusto (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL, senal TEXT NOT NULL DEFAULT '',
      tema TEXT DEFAULT '', angulo TEXT DEFAULT '', formato TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, post_id, senal)
    )`);
  } catch (e) {}
}

function registrar(db, uid, post, senal) {
  try {
    if (!db || uid === undefined || uid === null || !post || !post.id || !senal) return null;
    asegurarTabla(db);
    let formato = '';
    try {
      const f = db.prepare('SELECT formato FROM cm_post_formato WHERE post_id = ?').get(post.id);
      if (f) formato = String(f.formato || '');
    } catch (e) {}
    db.prepare(`INSERT OR REPLACE INTO cm_gusto (user_id, post_id, senal, tema, angulo, formato)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uid, post.id, senal, String(post.source_topic || post.tema || ''),
        String(post.source_angle || post.angulo || ''), formato);
    return { ok: true };
  } catch (e) { return null; }
}

function retirar(db, uid, postId, senal) {
  try {
    if (!db || !postId || !senal) return null;
    asegurarTabla(db);
    db.prepare('DELETE FROM cm_gusto WHERE user_id = ? AND post_id = ? AND senal = ?').run(uid, postId, senal);
    return { ok: true };
  } catch (e) { return null; }
}

function consultar(db, uid) {
  const vacio = { tiene: false, aprobados: [], rechazados: [], cambios: [],
    formatosPreferidos: [], formatosVetados: [], vetoTokens: [], preferTokens: [] };
  try {
    if (!db || uid === undefined || uid === null) return vacio;
    asegurarTabla(db);
    const rows = db.prepare('SELECT * FROM cm_gusto WHERE user_id = ? ORDER BY created_at DESC').all(uid);
    const aprobados = rows.filter((r) => r.senal === 'aprobada');
    const rechazados = rows.filter((r) => r.senal === 'rechazada');
    const cambios = rows.filter((r) => r.senal === 'cambio');
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    const vetoTokens = uniq(rechazados.flatMap((r) => tokens(`${r.tema || ''} ${r.angulo || ''}`)));
    const preferTokens = uniq(aprobados.flatMap((r) => tokens(`${r.tema || ''} ${r.angulo || ''}`)));
    return {
      tiene: rows.length > 0,
      aprobados: aprobados.map((r) => ({ tema: r.tema, angulo: r.angulo, formato: r.formato })),
      rechazados: rechazados.map((r) => ({ tema: r.tema, angulo: r.angulo, formato: r.formato })),
      cambios: cambios.map((r) => ({ tema: r.tema, angulo: r.angulo, formato: r.formato })),
      formatosPreferidos: uniq(aprobados.map((r) => r.formato)),
      formatosVetados: uniq(rechazados.map((r) => r.formato)),
      vetoTokens, preferTokens,
    };
  } catch (e) { return vacio; }
}

// ¿Este tema nuevo pisa algo vetado? 2+ tokens compartidos, o 1 token largo.
function temaVetado(consulta, texto) {
  if (!consulta || !consulta.vetoTokens || !consulta.vetoTokens.length) return false;
  const toks = tokens(texto);
  const compartidos = toks.filter((t) => consulta.vetoTokens.includes(t));
  if (compartidos.length >= 2) return true;
  return compartidos.some((t) => t.length >= 7);
}

function bloqueParaBrief(consulta) {
  if (!consulta || !consulta.tiene) return '';
  const lines = [];
  if (consulta.aprobados.length) {
    lines.push('Al dueño le gustó (repetir en su espíritu, no copiar la pieza): ' +
      consulta.aprobados.slice(0, 5).map((a) => a.tema).filter(Boolean).join(' | ') + '.');
  }
  if (consulta.rechazados.length) {
    lines.push('El dueño rechazó (NO volver a estos temas ni a estos formatos): ' +
      consulta.rechazados.slice(0, 5).map((a) => a.tema).filter(Boolean).join(' | ') +
      (consulta.formatosVetados.length ? ` Formatos vetados: ${consulta.formatosVetados.join(', ')}.` : ''));
  }
  if (consulta.cambios.length) {
    lines.push('El dueño pidió cambios en: ' +
      consulta.cambios.slice(0, 5).map((a) => a.tema).filter(Boolean).join(' | ') + '.');
  }
  return lines.join('\n');
}

module.exports = { asegurarTabla, registrar, retirar, consultar, temaVetado, bloqueParaBrief, _tokens: tokens, _norm: norm };
