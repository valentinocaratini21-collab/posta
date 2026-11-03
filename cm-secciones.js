// cm-secciones.js — LOTE CEREBRO-CM, pieza 14 (3/11, SIN PUSH).
//
// SECCIONES FIJAS SEMANALES: cada negocio puede tener secciones que se
// repiten cada semana (ej. «los lunes, X») definidas en su fundamento.
// La semana las respeta y la gente vuelve esperando algo, no posteos
// sueltos.
//
// Mapa: la semana son 5 piezas (lunes a viernes) → dia_idx 0..4.
// Las secciones viven en cm_secciones (el fundamento del negocio, con
// ruta propia para definirlas y listarlas) y se mezclan con dna.secciones
// si el fundamento ya trae alguna (la tabla manda por día).
// El pipeline marca cada pick con su sección (pick.cmSeccion) y la
// registra por posteo (cm_post_seccion): la sección viaja en el brief
// para que la idea nazca dentro de ella, no como etiqueta posterior.
'use strict';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_secciones (
      user_id INTEGER NOT NULL, dia_idx INTEGER NOT NULL,
      nombre TEXT NOT NULL DEFAULT '', detalle TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, dia_idx)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS cm_post_seccion (
      post_id INTEGER PRIMARY KEY, user_id INTEGER, seccion TEXT DEFAULT '',
      week_key TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function definir(db, uid, diaIdx, nombre, detalle) {
  try {
    if (!db || uid === undefined || uid === null) return null;
    if (!Number.isInteger(diaIdx) || diaIdx < 0 || diaIdx > 4) return null;
    const nom = String(nombre || '').trim();
    if (!nom || nom.length > 80) return null;
    asegurarTabla(db);
    db.prepare('INSERT OR REPLACE INTO cm_secciones (user_id, dia_idx, nombre, detalle) VALUES (?, ?, ?, ?)')
      .run(uid, diaIdx, nom, String(detalle || ''));
    return { ok: true };
  } catch (e) { return null; }
}

function listar(db, uid) {
  try {
    if (!db || uid === undefined || uid === null) return [];
    asegurarTabla(db);
    return db.prepare('SELECT dia_idx, nombre, detalle FROM cm_secciones WHERE user_id = ? ORDER BY dia_idx ASC')
      .all(uid).map((r) => ({ dia_idx: r.dia_idx, dia: DIAS[r.dia_idx] || '', nombre: r.nombre, detalle: r.detalle || '' }));
  } catch (e) { return []; }
}

// Secciones de la semana: array de 5 (null donde no hay sección).
// dna.secciones (si existe) aporta días no cubiertos por la tabla.
function paraSemana(db, uid, dna) {
  const out = [null, null, null, null, null];
  try {
    const tabla = listar(db, uid);
    for (const s of tabla) out[s.dia_idx] = s.nombre;
    const dnaSec = dna && Array.isArray(dna.secciones) ? dna.secciones : [];
    for (const s of dnaSec) {
      const idx = DIAS.indexOf(String((s && s.dia) || '').toLowerCase());
      const nom = String((s && s.nombre) || '').trim();
      if (idx >= 0 && nom && !out[idx]) out[idx] = nom;
    }
  } catch (e) {}
  return out;
}

function bloqueParaBrief(secciones) {
  if (!secciones || !secciones.some(Boolean)) return '';
  const partes = secciones.map((s, i) => (s ? `${DIAS[i]}: ${s}` : null)).filter(Boolean);
  return 'SECCIONES FIJAS DE LA SEMANA (la gente vuelve esperándolas, respetarlas): ' + partes.join(' · ') + '.';
}

function registrarPost(db, postId, uid, seccion, weekKey) {
  try {
    if (!db || !postId || !seccion) return null;
    asegurarTabla(db);
    db.prepare('INSERT OR REPLACE INTO cm_post_seccion (post_id, user_id, seccion, week_key) VALUES (?, ?, ?, ?)')
      .run(postId, uid, String(seccion), String(weekKey || ''));
    return { ok: true };
  } catch (e) { return null; }
}

module.exports = { DIAS, asegurarTabla, definir, listar, paraSemana, bloqueParaBrief, registrarPost };
