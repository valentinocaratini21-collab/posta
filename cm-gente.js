// cm-gente.js — LOTE CEREBRO-CM, pieza 13 (3/11, SIN PUSH).
//
// GENTE REAL DEL NEGOCIO: se priorizan posteos con caras, manos y el
// lugar real del negocio por sobre producto solo, SIEMPRE con permiso
// registrado del dueño. Sin permiso, no se usa gente: los roles de
// escena con personas quedan fuera y la semana sale con producto y
// detalle.
//
// El permiso es del DUEÑO del negocio (una fila por cuenta, no por
// foto): lo registra el dueño y lo puede revocar. Sin fila, NO hay
// permiso. Esto es distinto de cm_ugc_permiso (permiso de CLIENTES
// para usar SU contenido): acá el que autoriza es el dueño sobre SU
// gente y SU lugar.
'use strict';

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_gente_permiso (
      user_id INTEGER PRIMARY KEY, permiso TEXT NOT NULL DEFAULT 'no',
      medio TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function registrarPermisoDueno(db, uid, permiso, medio) {
  try {
    if (!db || uid === undefined || uid === null) return null;
    if (permiso !== 'si' && permiso !== 'no') return null;
    asegurarTabla(db);
    db.prepare('INSERT OR REPLACE INTO cm_gente_permiso (user_id, permiso, medio) VALUES (?, ?, ?)')
      .run(uid, permiso, String(medio || ''));
    return { ok: true };
  } catch (e) { return null; }
}

function conPermisoDueno(db, uid) {
  try {
    if (!db || uid === undefined || uid === null) return false;
    asegurarTabla(db);
    const row = db.prepare('SELECT permiso FROM cm_gente_permiso WHERE user_id = ?').get(uid);
    return !!row && row.permiso === 'si';
  } catch (e) { return false; }
}

// Orden de roles de escena según permiso. rolesBase son los 5 roles
// canónicos del pipeline (persona, producto, lugar, detalle, detrás).
// Con permiso: gente primero (persona, lugar, detrás, producto, detalle).
// Sin permiso: solo roles sin personas (producto, detalle).
function rolesParaSemana(rolesBase, conPermiso) {
  const roles = Array.isArray(rolesBase) ? rolesBase.slice() : [];
  if (conPermiso) {
    const esPersona = (r) => /persona|detr[aá]s|lugar/i.test(r);
    const gente = roles.filter(esPersona);
    const resto = roles.filter((r) => !esPersona(r));
    return [...gente, ...resto];
  }
  return roles.filter((r) => !/persona|detr[aá]s|lugar/i.test(r));
}

module.exports = { asegurarTabla, registrarPermisoDueno, conPermisoDueno, rolesParaSemana };
