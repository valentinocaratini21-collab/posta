// gesty-conexiones.js — AJUSTES → CONEXIONES (auto-fetch de papeles).
// Un solo lugar donde el dueño conecta cada plataforma UNA vez: facturador,
// casilla del negocio (email con permiso) y banco. Después Gesty se ocupa
// del resto (gesty-autofetch.js). El dueño nunca mueve un papel por papel.
//
// Reglas (no se negocian):
// · Credenciales NUNCA en DB ni en texto: solo se guarda `credencial_ref`,
//   el nombre del handle en el almacenamiento seguro (mismo patrón { ref }
//   de gesty-banco.js). Si llega un secreto en claro, se rechaza.
// · El módulo nunca ve el valor del secreto: la presencia se verifica con
//   vault.tiene(ref) cuando el vault lo expone; si no, con get(ref) != null.
//   En producción el vault real se inyecta con configure(); sin vault, se
//   usa process.env. Los errores de los adaptadores nunca deben incluir
//   material de credencial (se truncan; el módulo no puede purgar lo que
//   nunca vio).
// · Estado honesto: ninguna conexión se declara «conectada» sin un fetch
//   exitoso (ultimo_fetch). Sin permiso no hay fetch (fail-closed).
// · NUNCA se toca el email personal del dueño: la plataforma `email` es
//   SOLO la casilla del negocio designada, con permiso explícito.
// · Banco: dos caminos honestos y distintos. `vivo` = conexión real con
//   adaptador (su fila vive en gesty-banco.js, fuente única para los
//   movimientos; acá solo queda el espejo con banco_conexion_id). `extractos`
//   = sin conexión viva: el camino es importar por extractos (G-17); su
//   estado dice «por extractos», nunca «conectado en vivo», y viva=false.
// · Una sola conexión activa por (plataforma, proveedor): para cambiar de
//   modo o de credencial, primero se revoca. Nada de fusiones silenciosas.
'use strict';
const gesty = require('./gesty.js');
const banco = require('./gesty-banco.js');

const PLATAFORMAS = ['facturador', 'email', 'banco'];
const MODOS = ['vivo', 'extractos'];
const ESTADOS = ['pendiente', 'conectada', 'fallida', 'necesita-atencion', 'revocada'];
const CAMPOS_SECRETO = ['secreto', 'token', 'clave', 'password', 'api_key', 'apikey', 'access_token', 'refresh_token', 'client_secret'];

let _vault = null;

function fail(m) { const e = new Error(m); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function ahora() { return new Date().toISOString(); }

function configure(opts) {
  if (opts && opts.vault !== undefined) _vault = opts.vault;
  return { vault: !!_vault };
}

function vault() {
  if (_vault) return _vault;
  return { tiene: (ref) => !!ref && process.env[String(ref)] !== undefined && process.env[String(ref)] !== '' };
}

function credencialPresente(ref) {
  if (!ref) return false;
  try {
    const v = vault();
    if (typeof v.tiene === 'function') return !!v.tiene(ref);
    if (typeof v.get === 'function') return v.get(ref) !== undefined && v.get(ref) !== null && v.get(ref) !== '';
  } catch (e) { return false; }
  return false;
}

function ensureSchema(db) {
  gesty.ensureSchema(db);
  banco.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_conexiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plataforma TEXT NOT NULL DEFAULT '',
    proveedor TEXT NOT NULL DEFAULT '',
    etiqueta TEXT NOT NULL DEFAULT '',
    credencial_ref TEXT NOT NULL DEFAULT '',
    modo TEXT NOT NULL DEFAULT 'vivo',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    banco_conexion_id INTEGER,
    ultimo_fetch TEXT NOT NULL DEFAULT '',
    ultimo_error TEXT NOT NULL DEFAULT '',
    papeles_traidos INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_conex_user ON gesty_conexiones(user_id, plataforma, estado, id)');
}

// --- Lectura (estado derivado, siempre honesto) ---------------------------

function parseRow(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id, plataforma: r.plataforma, proveedor: r.proveedor,
    etiqueta: r.etiqueta, credencial_ref: r.credencial_ref, modo: r.modo, estado: r.estado,
    banco_conexion_id: r.banco_conexion_id === null || r.banco_conexion_id === undefined ? null : Number(r.banco_conexion_id),
    ultimo_fetch: r.ultimo_fetch || '', ultimo_error: r.ultimo_error || '',
    papeles_traidos: Number(r.papeles_traidos) || 0,
  };
}

function filaBancoVivo(db, userId, row) {
  if (row.plataforma !== 'banco' || row.modo !== 'vivo' || !row.banco_conexion_id) return null;
  try { return banco.getConexion(db, userId, row.banco_conexion_id); } catch (e) { return null; }
}

function estadoConexion(db, userId, id) {
  ensureSchema(db);
  const row = parseRow(db.prepare('SELECT * FROM gesty_conexiones WHERE id = ? AND user_id = ?').get(Number(id), userId));
  if (!row) fail('Esa conexión no es de esta cuenta.');
  // Banco vivo: la fila de gesty-banco.js manda sobre revocación y
  // credencial (fuente única); acá solo se espeja el vínculo.
  let estado = row.estado;
  let credencial_presente = row.modo === 'extractos' ? true : credencialPresente(row.credencial_ref);
  let bancoFila = null;
  if (row.plataforma === 'banco' && row.modo === 'vivo') {
    bancoFila = filaBancoVivo(db, userId, row);
    if (!bancoFila) { estado = 'necesita-atencion'; credencial_presente = false; }
    else if (bancoFila.estado === 'revocada') { estado = 'revocada'; }
    else { credencial_presente = credencialPresente(bancoFila.credencial_ref); }
  }
  const viva = row.modo === 'extractos' ? false
    : estado === 'conectada' && !!row.ultimo_fetch && credencial_presente;
  const nota = estado === 'revocada' ? 'revocada por el dueño'
    : row.modo === 'extractos' ? 'por extractos, no en vivo: el banco llega por archivo, no por conexión'
    : !credencial_presente ? 'sin credencial en el almacenamiento seguro: conectá de nuevo para buscar'
    : estado === 'pendiente' ? 'registrada, pendiente del primer fetch'
    : estado === 'fallida' ? `último fetch falló: ${row.ultimo_error || 'sin detalle'}`
    : estado === 'necesita-atencion' ? `necesita atención: ${row.ultimo_error || 'sin detalle'}`
    : viva ? 'conectada y buscando sola'
    : 'conectada';
  return { ...row, estado, credencial_presente, viva, nota };
}

function getConexion(db, userId, id) { return estadoConexion(db, userId, id); }

function listConexiones(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_conexiones WHERE user_id = ? ORDER BY id ASC').all(userId)
    .map((r) => estadoConexion(db, userId, r.id));
}

function conexionesActivas(db, userId, plataforma) {
  ensureSchema(db);
  const rows = plataforma
    ? db.prepare('SELECT * FROM gesty_conexiones WHERE user_id = ? AND plataforma = ? AND estado != ? ORDER BY id ASC').all(userId, String(plataforma), 'revocada')
    : db.prepare('SELECT * FROM gesty_conexiones WHERE user_id = ? AND estado != ? ORDER BY id ASC').all(userId, 'revocada');
  return rows.map((r) => estadoConexion(db, userId, r.id));
}

// --- Escritura -------------------------------------------------------------

function validarRef(ref) {
  if (/[\s"':;]/.test(ref) || ref.length > 120) {
    fail('La referencia de credencial es un nombre de handle en el almacenamiento seguro, no el secreto.');
  }
}

function conectar(db, userId, d) {
  ensureSchema(db);
  const x = d || {};
  for (const campo of CAMPOS_SECRETO) {
    if (x[campo] !== undefined && x[campo] !== null && String(x[campo]) !== '') {
      fail(`La conexión no acepta secretos en claro (${campo}): se guarda solo la referencia al almacenamiento seguro.`);
    }
  }
  const plataforma = normTexto(x.plataforma).toLowerCase();
  if (!PLATAFORMAS.includes(plataforma)) fail(`Plataforma inválida: ${plataforma || '(vacía)'}. Válidas: ${PLATAFORMAS.join(', ')}.`);
  const proveedor = normTexto(x.proveedor);
  if (!proveedor) fail('La conexión necesita el nombre del proveedor (facturador, casilla o banco).');
  const modo = normTexto(x.modo || 'vivo').toLowerCase();
  if (!MODOS.includes(modo)) fail(`Modo inválido: ${modo}. Válidos: ${MODOS.join(', ')}.`);
  if (modo === 'extractos' && plataforma !== 'banco') {
    fail('El modo por extractos es solo para el banco: facturador y email son en vivo o nada.');
  }
  const ref = normTexto(x.credencial_ref);
  if (modo === 'vivo') {
    if (!ref) fail('La conexión en vivo necesita credencial_ref: el handle en el almacenamiento seguro, nunca el secreto.');
    validarRef(ref);
  } else if (ref) { validarRef(ref); }
  const activa = db.prepare(`SELECT id FROM gesty_conexiones WHERE user_id = ? AND plataforma = ? AND proveedor = ? AND estado != 'revocada' LIMIT 1`)
    .get(userId, plataforma, proveedor);
  if (activa) fail(`Ya hay una conexión activa para ${plataforma} · ${proveedor}: revocá primero para cambiarla.`);
  let bancoConexionId = null;
  if (plataforma === 'banco' && modo === 'vivo') {
    const bc = banco.registrarConexion(db, userId, { banco: proveedor, tipo: 'banco', etiqueta: normTexto(x.etiqueta), credencial_ref: ref });
    bancoConexionId = bc.id;
  }
  const info = db.prepare(`INSERT INTO gesty_conexiones
    (user_id, plataforma, proveedor, etiqueta, credencial_ref, modo, estado, banco_conexion_id)
    VALUES (?,?,?,?,?,?,'pendiente',?)`)
    .run(userId, plataforma, proveedor, normTexto(x.etiqueta), plataforma === 'banco' && modo === 'vivo' ? '' : ref, modo, bancoConexionId);
  const conexion = estadoConexion(db, userId, Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'conexion', entidad_id: String(conexion.id),
    tipo_evento: 'conexion-registrada',
    resumen: `Conexión registrada: ${plataforma} · ${proveedor} (${modo}) — pendiente del primer fetch.`,
    payload: { plataforma, proveedor, modo },
  });
  return conexion;
}

function desconectar(db, userId, id) {
  ensureSchema(db);
  const row = parseRow(db.prepare('SELECT * FROM gesty_conexiones WHERE id = ? AND user_id = ?').get(Number(id), userId));
  if (!row) fail('Esa conexión no es de esta cuenta.');
  if (row.estado === 'revocada') return estadoConexion(db, userId, id);
  if (row.plataforma === 'banco' && row.modo === 'vivo' && row.banco_conexion_id) {
    try { banco.revocarConexion(db, userId, row.banco_conexion_id); } catch (e) { /* ya revocada en su tabla: no frena */ }
  }
  db.prepare(`UPDATE gesty_conexiones SET estado = 'revocada', updated_at = datetime('now') WHERE id = ?`).run(row.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'conexion', entidad_id: String(row.id),
    tipo_evento: 'conexion-revocada',
    resumen: `Conexión revocada: ${row.plataforma} · ${row.proveedor}. Sin permiso, no hay más fetch.`,
    payload: { plataforma: row.plataforma, proveedor: row.proveedor },
  });
  return estadoConexion(db, userId, id);
}

function marcarFetchOk(db, userId, id, papeles) {
  ensureSchema(db);
  const row = parseRow(db.prepare('SELECT * FROM gesty_conexiones WHERE id = ? AND user_id = ?').get(Number(id), userId));
  if (!row) fail('Esa conexión no es de esta cuenta.');
  db.prepare(`UPDATE gesty_conexiones SET estado = 'conectada', ultimo_fetch = ?, ultimo_error = '', papeles_traidos = papeles_traidos + ?, updated_at = datetime('now') WHERE id = ?`)
    .run(ahora(), Number(papeles) || 0, row.id);
  return estadoConexion(db, userId, id);
}

function marcarFetchFallo(db, userId, id, motivo) {
  ensureSchema(db);
  const row = parseRow(db.prepare('SELECT * FROM gesty_conexiones WHERE id = ? AND user_id = ?').get(Number(id), userId));
  if (!row) fail('Esa conexión no es de esta cuenta.');
  db.prepare(`UPDATE gesty_conexiones SET estado = 'fallida', ultimo_error = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(String(motivo || 'sin detalle').slice(0, 240), row.id);
  return estadoConexion(db, userId, id);
}

function necesitaAtencion(db, userId, id, motivo) {
  ensureSchema(db);
  const row = parseRow(db.prepare('SELECT * FROM gesty_conexiones WHERE id = ? AND user_id = ?').get(Number(id), userId));
  if (!row) fail('Esa conexión no es de esta cuenta.');
  db.prepare(`UPDATE gesty_conexiones SET estado = 'necesita-atencion', ultimo_error = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(String(motivo || 'sin detalle').slice(0, 240), row.id);
  return estadoConexion(db, userId, id);
}

module.exports = {
  PLATAFORMAS, MODOS, ESTADOS,
  configure, ensureSchema,
  conectar, desconectar, getConexion, listConexiones, conexionesActivas, estadoConexion,
  marcarFetchOk, marcarFetchFallo, necesitaAtencion, credencialPresente,
};
