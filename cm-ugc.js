// cm-ugc.js — LOTE CEREBRO-CM (3/11, SIN PUSH).
//
// CONTENIDO DE CLIENTES (UGC): fotos/videos que suben los clientes del
// negocio se usan SOLO con permiso registrado de ESE cliente. Sin
// permiso no se usa nada: el default es NO.
//
// El permiso se registra con referencia al cliente (nombre/apodo/handle)
// y/o al archivo. Si hay varias filas para la misma referencia, manda la
// MÁS RECIENTE (un «no» posterior revoca un «sí» anterior). El formato
// testimonio-permiso de cm-formatos exige este permiso antes de usarse.
'use strict';

function asegurarTabla(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS cm_ugc_permiso (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      cliente_ref TEXT DEFAULT '', asset_ref TEXT DEFAULT '',
      permiso TEXT NOT NULL DEFAULT 'no', medio TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  } catch (e) {}
}

function registrarPermiso(db, uid, { clienteRef = '', assetRef = '', permiso = 'no', medio = '' } = {}) {
  try {
    if (!db || uid === undefined || uid === null) return null;
    if (!clienteRef && !assetRef) return null;
    if (permiso !== 'si' && permiso !== 'no') return null;
    asegurarTabla(db);
    db.prepare(`INSERT INTO cm_ugc_permiso (user_id, cliente_ref, asset_ref, permiso, medio)
      VALUES (?, ?, ?, ?, ?)`).run(uid, String(clienteRef), String(assetRef), permiso, String(medio));
    return { ok: true };
  } catch (e) { return null; }
}

// ¿Hay permiso vigente para esta referencia? Sin fila, NO.
function conPermiso(db, uid, ref) {
  try {
    if (!db || !ref) return false;
    asegurarTabla(db);
    const row = db.prepare(`SELECT permiso FROM cm_ugc_permiso
      WHERE user_id = ? AND (cliente_ref = ? OR asset_ref = ?)
      ORDER BY created_at DESC, id DESC LIMIT 1`).get(uid, String(ref), String(ref));
    return !!row && row.permiso === 'si';
  } catch (e) { return false; }
}

// Gate para usar un archivo de cliente: solo con permiso de su cliente
// o del archivo mismo. Sin referencia, NO.
function puedeUsar(db, uid, { clienteRef = '', assetRef = '' } = {}) {
  if (!clienteRef && !assetRef) return false;
  if (clienteRef && conPermiso(db, uid, clienteRef)) return true;
  if (assetRef && conPermiso(db, uid, assetRef)) return true;
  return false;
}

module.exports = { asegurarTabla, registrarPermiso, conPermiso, puedeUsar };
