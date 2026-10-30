// gesty-banco.js — BANCO CONECTADO (mejora 3/10).
// Framework + contrato para conexiones bancarias, sin inventar
// ninguna API de banco: cada banco real es un adaptador que llama a
// importarMovimientos con los movimientos que entrega, y la
// conciliación corre con el motor existente (G-17).
//
// Diseño honesto:
// · La conexión guarda SOLO metadatos: banco, tipo, etiqueta
//   (máscara provista por el dueño, ej. «••1234»), referencia a
//   credencial (nombre de variable de entorno, NUNCA el secreto),
//   estado y última importación. Ningún secreto, token, clave ni
//   número de cuenta completo vive en la DB ni en los eventos.
// · Los movimientos importados entran a la tabla EXISTENTE de
//   conciliación (gesty_conciliacion_movimientos) con
//   extracto_id = 0 y comprobante_id = 0 — el centinela que dice
//   «sin papel: viene del banco conectado» — y origen
//   'banco-conectado'. El motor conciliar() ya procesa todos los
//   movimientos sin-conciliar/sin-par sin importar su extracto, así
//   que el MATCH FUERTE y las propuestas funcionan sin duplicar
//   lógica. La tabla propia gesty_banco_importados deja la traza
//   (qué conexión trajo cada movimiento) sin tocar el motor.
// · Deduplicación doble: por (fecha, monto, referencia) en la tabla
//   del motor (igual que la carga asistida) y por referencia
//   externa por conexión en la tabla propia.
// · El import por extractos (papel subido) sigue intacto: este
//   módulo no toca ese flujo.
// · La conexión viva real por banco (credenciales + alta) es un
//   GATE EXTERNO en manos de Valentino: este módulo es el
//   framework y el contrato, no una conexión simulada.
'use strict';
const gesty = require('./gesty.js');
const conciliacion = require('./gesty-conciliacion.js');

function fail(m) { throw new Error(m); }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function esFechaISO(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

let _env = null;
function env() { return _env || process.env || {}; }
function configure(opts) { if (opts && opts.env !== undefined) _env = opts.env; return { env: !!_env }; }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  conciliacion.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_banco_conexiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    banco TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'banco',
    etiqueta TEXT NOT NULL DEFAULT '',
    credencial_ref TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    ultimo_error TEXT NOT NULL DEFAULT '',
    ultima_importacion TEXT NOT NULL DEFAULT '',
    movimientos_importados INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_banco_importados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    conexion_id INTEGER NOT NULL,
    movimiento_id INTEGER NOT NULL,
    referencia_externa TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, conexion_id, referencia_externa)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_banco_conex_user ON gesty_banco_conexiones(user_id, estado, id)');
  _esquemas.add(db);
}

function parseConexion(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id, banco: r.banco, tipo: r.tipo,
    etiqueta: r.etiqueta, credencial_ref: r.credencial_ref, estado: r.estado,
    ultimo_error: r.ultimo_error, ultima_importacion: r.ultima_importacion,
    movimientos_importados: r.movimientos_importados,
  };
}

function getConexion(db, userId, id) {
  ensureSchema(db);
  return parseConexion(db.prepare('SELECT * FROM gesty_banco_conexiones WHERE id = ? AND user_id = ?').get(Number(id), userId));
}

function listConexiones(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_banco_conexiones WHERE user_id = ? ORDER BY id DESC').all(userId).map(parseConexion);
}

// Registrar una conexión: solo metadatos. credencial_ref nombra la
// variable de entorno donde vive el secreto (patrón { ref } de la
// fundación); si se pasa un secreto en claro, se rechaza.
function registrarConexion(db, userId, d) {
  ensureSchema(db);
  const x = d || {};
  const banco = normTexto(x.banco);
  if (!banco) fail('La conexión bancaria necesita el nombre del banco.');
  const tipo = normTexto(x.tipo || 'banco').toLowerCase();
  if (!['banco', 'billetera'].includes(tipo)) fail(`Tipo de conexión inválido: ${tipo}. Válidos: banco, billetera.`);
  const ref = normTexto(x.credencial_ref);
  if (/[\s"':;]/.test(ref) || ref.length > 120) fail('La referencia de credencial es un nombre de variable de entorno, no el secreto.');
  if (x.secreto || x.token || x.clave || x.password) {
    fail('La conexión no acepta secretos en claro: se guarda solo la referencia al entorno.');
  }
  const info = db.prepare(`INSERT INTO gesty_banco_conexiones
    (user_id, banco, tipo, etiqueta, credencial_ref, estado)
    VALUES (?,?,?,?,?,'pendiente')`).run(userId, banco, tipo, normTexto(x.etiqueta), ref);
  const conexion = getConexion(db, userId, Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'banco-conexion', entidad_id: String(conexion.id),
    tipo_evento: 'banco-conexion-registrada',
    resumen: `Conexión bancaria registrada: ${banco} (${tipo})${conexion.etiqueta ? ` · ${conexion.etiqueta}` : ''} — pendiente de alta (gate externo).`,
    payload: { banco, tipo },
  });
  return conexion;
}

function revocarConexion(db, userId, id) {
  ensureSchema(db);
  const c = getConexion(db, userId, id);
  if (!c) fail('Esa conexión bancaria no es de esta cuenta.');
  db.prepare(`UPDATE gesty_banco_conexiones SET estado = 'revocada', updated_at = datetime('now') WHERE id = ?`).run(c.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'banco-conexion', entidad_id: String(c.id),
    tipo_evento: 'banco-conexion-revocada',
    resumen: `Conexión bancaria revocada: ${c.banco}${c.etiqueta ? ` · ${c.etiqueta}` : ''}.`,
    payload: { banco: c.banco },
  });
  return getConexion(db, userId, id);
}

// Estado de la conexión: presencia de credencial (sin revelarla) y
// última importación. Nunca afirma «conectado» sin haber importado.
function estadoConexion(db, userId, id) {
  const c = getConexion(db, userId, id);
  if (!c) fail('Esa conexión bancaria no es de esta cuenta.');
  const tieneCredencial = !!(c.credencial_ref && env()[c.credencial_ref]);
  return {
    ...c,
    credencial_presente: tieneCredencial,
    viva: c.estado === 'activa' && !!c.ultima_importacion,
    nota: c.estado === 'revocada' ? 'revocada por el dueño'
      : !tieneCredencial ? 'sin credencial en el entorno: la conexión viva es un gate externo'
      : c.estado === 'pendiente' ? 'registrada, pendiente de primera importación'
      : 'activa',
  };
}

// Contrato de importación: lo que cualquier adaptador de banco real
// entrega. Cada movimiento se valida con el normalizador del motor
// (misma regla que la carga asistida), se deduplica y entra al pool
// de conciliación con origen 'banco-conectado'.
function importarMovimientos(db, userId, conexionId, movimientos, opts) {
  ensureSchema(db);
  const c = getConexion(db, userId, conexionId);
  if (!c) fail('Esa conexión bancaria no es de esta cuenta.');
  if (c.estado === 'revocada') fail('La conexión está revocada: no importa movimientos.');
  if (!Array.isArray(movimientos) || !movimientos.length) fail('La importación trae al menos un movimiento.');
  const o = opts || {};
  const salida = { conexion_id: c.id, cargados: 0, salteados: 0, invalidos: [], movimientos: [] };
  for (let i = 0; i < movimientos.length; i++) {
    const crudo = movimientos[i] || {};
    const m = conciliacion.normalizarMovimiento(crudo, { moneda: normTexto(crudo.moneda || 'ARS') });
    if (!m) { salida.invalidos.push(i); continue; }
    const refExt = normTexto(crudo.referencia_externa || crudo.referencia || '');
    if (refExt) {
      const ya = db.prepare(`SELECT id FROM gesty_banco_importados WHERE user_id = ? AND conexion_id = ? AND referencia_externa = ?`)
        .get(userId, c.id, refExt);
      if (ya) { salida.salteados++; continue; }
    }
    if (m.referencia) {
      const dup = db.prepare(`SELECT id FROM gesty_conciliacion_movimientos
        WHERE user_id = ? AND extracto_id = 0 AND fecha = ? AND monto = ? AND referencia = ? LIMIT 1`)
        .get(userId, m.fecha, m.monto, m.referencia);
      if (dup) { salida.salteados++; continue; }
    }
    const info = db.prepare(`INSERT INTO gesty_conciliacion_movimientos
      (user_id, extracto_id, comprobante_id, fecha, monto, moneda, moneda_declarada,
       contraparte_nombre, contraparte_cuit, referencia, descripcion, origen, estado)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'banco-conectado','sin-conciliar')`).run(
      userId, 0, 0, m.fecha, m.monto, m.moneda, m.moneda_declarada ? 1 : 0,
      m.contraparte_nombre, m.contraparte_cuit, m.referencia, m.descripcion);
    const movId = Number(info.lastInsertRowid);
    if (refExt) {
      db.prepare(`INSERT OR IGNORE INTO gesty_banco_importados (user_id, conexion_id, movimiento_id, referencia_externa)
        VALUES (?,?,?,?)`).run(userId, c.id, movId, refExt);
    }
    salida.cargados++;
    salida.movimientos.push(conciliacion.getMovimiento(db, userId, movId));
  }
  db.prepare(`UPDATE gesty_banco_conexiones
    SET estado = 'activa', ultima_importacion = datetime('now'),
        movimientos_importados = movimientos_importados + ?, updated_at = datetime('now')
    WHERE id = ?`).run(salida.cargados, c.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'banco-conexion', entidad_id: String(c.id),
    tipo_evento: 'banco-movimientos-importados',
    resumen: `Banco ${c.banco}: ${salida.cargados} movimiento(s) importado(s)${salida.salteados ? `, ${salida.salteados} repetido(s) salteado(s)` : ''}${salida.invalidos.length ? `, ${salida.invalidos.length} inválido(s)` : ''}. Van al motor de conciliación existente.`,
    payload: { conexion_id: c.id, cargados: salida.cargados, salteados: salida.salteados, invalidos: salida.invalidos.length },
  });
  return salida;
}

// La conciliación de lo importado ES el motor existente: los
// movimientos del banco ya están en su pool.
function conciliarImportados(db, userId, opts) {
  return conciliacion.conciliar(db, userId, opts || {});
}

module.exports = {
  ensureSchema, configure, registrarConexion, getConexion, listConexiones,
  revocarConexion, estadoConexion, importarMovimientos, conciliarImportados,
};
