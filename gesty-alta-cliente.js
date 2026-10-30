// gesty-alta-cliente.js — ALTA DE CLIENTE NUEVO DESDE LLAMADA/MENSAJE
// (brecha de recepción 5/5).
// Si llama o escribe alguien sin ficha, Gesty crea la ficha sola
// con SOLO lo que la interacción realmente dio (nombre, contacto,
// motivo), marcada como creada desde esa llamada o mensaje, y
// pendiente de confirmación del dueño en un toque.
//
// · Sin confirmación queda como BORRADOR visible, nunca como
//   cliente verificado. La confirmación vive en Bandeja (tarjeta
//   'cliente-nuevo', el único lugar de decisión) y también en un
//   toque desde el listado de borradores.
// · NINGÚN dato inventado: lo que la interacción no dio queda
//   vacío, nunca completado con un supuesto. Sin nombre ni
//   contacto no hay ficha (no hay a quién identificar).
// · Una ficha por contacto: el mismo contacto no genera dos
//   borradores ni dos fichas. Sin contacto, solo el nombre no
//   alcanza para deduplicar (dos Marías pueden ser dos personas):
//   ahí pueden convivir borradores, y el dueño los distingue.
// · El origen es obligatorio (llamada, mensaje, app, recepción):
//   decir de dónde salió la ficha es parte de la ficha, no un
//   detalle que se adivina después.
'use strict';
const gesty = require('./gesty.js');

const ORIGENES = ['llamada', 'mensaje', 'app', 'recepcion'];

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function normClave(v) { return norm(v).toLowerCase().replace(/\s+/g, ' '); }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_clientes_nuevos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    nombre TEXT NOT NULL DEFAULT '', contacto TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT '', origen TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador', tarjeta_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT
  )`);
  _esquemas.add(db);
}

function getFicha(db, userId, id) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_clientes_nuevos WHERE id = ? AND user_id = ?')
    .get(Number(id), userId) || null;
}

function buscarPorContacto(db, userId, contacto, estado) {
  ensureSchema(db);
  const clave = normClave(contacto);
  if (!clave) return null;
  let rows = db.prepare('SELECT * FROM gesty_clientes_nuevos WHERE user_id = ? ORDER BY id ASC').all(userId);
  if (estado) rows = rows.filter((r) => r.estado === estado);
  return rows.find((r) => normClave(r.contacto) === clave) || null;
}

function confirmarBorrador(db, userId, borradorId) {
  ensureSchema(db);
  const f = getFicha(db, userId, borradorId);
  if (!f) fail('Esa ficha no es de esta cuenta.');
  if (f.estado !== 'borrador') fail(`Esa ficha ya está ${f.estado}.`);
  db.prepare(`UPDATE gesty_clientes_nuevos SET estado = 'confirmado', confirmed_at = datetime('now') WHERE id = ?`)
    .run(f.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'cliente', entidad_id: String(f.id),
    tipo_evento: 'cliente-nuevo-confirmado',
    resumen: `Cliente nuevo confirmado: ${norm(f.nombre) || norm(f.contacto)} (desde ${f.origen}).`,
    payload: { ficha_id: f.id, origen: f.origen },
  });
  return getFicha(db, userId, f.id);
}

function ejecutorClienteNuevo(db, userId, card) {
  const d = (card && card.detalle) || {};
  if (!d.borrador_id) return { ok: false, motivo: 'La tarjeta no trae su borrador.' };
  const ficha = confirmarBorrador(db, userId, d.borrador_id);
  return { ok: true, ficha };
}
gesty.registerExecutor('cliente-nuevo', ejecutorClienteNuevo);

function registrarDesdeInteraccion(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const origen = String(d.origen || '');
  if (!ORIGENES.includes(origen)) fail(`El origen de la ficha va en: ${ORIGENES.join(', ')}.`);
  const nombre = norm(d.nombre);
  const contacto = norm(d.contacto);
  if (!nombre && !contacto) fail('Para abrir una ficha hace falta al menos el nombre o el contacto que dio la interacción.');
  // Una ficha por contacto: ni dos borradores ni dos fichas.
  if (contacto) {
    const borrador = buscarPorContacto(db, userId, contacto, 'borrador');
    if (borrador) return { ...borrador, ya_existe: true, existente_estado: 'borrador' };
    const confirmado = buscarPorContacto(db, userId, contacto, 'confirmado');
    if (confirmado) return { ...confirmado, ya_existe: true, existente_estado: 'confirmado' };
  }
  const motivo = norm(d.motivo); // vacío si la interacción no lo dio: nunca inventado
  const info = db.prepare(`INSERT INTO gesty_clientes_nuevos
    (user_id, nombre, contacto, motivo, origen) VALUES (?,?,?,?,?)`)
    .run(userId, nombre, contacto, motivo, origen);
  const ficha = getFicha(db, userId, Number(info.lastInsertRowid));
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'cliente-nuevo',
    titulo: `Cliente nuevo para confirmar: ${nombre || contacto}`,
    detalle: { borrador_id: ficha.id, nombre, contacto, motivo, origen,
      nota: 'Ficha creada sola desde la interacción. Confirmar en un toque; sin confirmar sigue siendo borrador.' },
    creado_por: 'gesty',
  });
  db.prepare(`UPDATE gesty_clientes_nuevos SET tarjeta_id = ? WHERE id = ?`).run(tarjeta.id, ficha.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cliente', entidad_id: String(ficha.id),
    tipo_evento: 'cliente-nuevo-creado',
    resumen: `Cliente nuevo desde ${origen}: ${nombre || contacto} (borrador, pendiente de confirmar).`,
    payload: { ficha_id: ficha.id, origen, tarjeta_id: tarjeta.id },
  });
  return { ...getFicha(db, userId, ficha.id), ya_existe: false, tarjeta_id: tarjeta.id };
}

function descartarBorrador(db, userId, borradorId) {
  ensureSchema(db);
  const f = getFicha(db, userId, borradorId);
  if (!f) fail('Esa ficha no es de esta cuenta.');
  if (f.estado !== 'borrador') fail(`Esa ficha ya está ${f.estado}.`);
  db.prepare(`UPDATE gesty_clientes_nuevos SET estado = 'descartado' WHERE id = ?`).run(f.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'cliente', entidad_id: String(f.id),
    tipo_evento: 'cliente-nuevo-descartado',
    resumen: `Borrador descartado: ${norm(f.nombre) || norm(f.contacto)} (desde ${f.origen}).`,
    payload: { ficha_id: f.id, origen: f.origen },
  });
  return getFicha(db, userId, f.id);
}

function listBorradores(db, userId) {
  ensureSchema(db);
  return db.prepare(`SELECT * FROM gesty_clientes_nuevos WHERE user_id = ? AND estado = 'borrador' ORDER BY id ASC`).all(userId);
}

function listFichas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_clientes_nuevos WHERE user_id = ? ORDER BY id ASC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  if (o.origen) rows = rows.filter((r) => r.origen === String(o.origen));
  return rows;
}

module.exports = { ensureSchema, registrarDesdeInteraccion, confirmarBorrador, descartarBorrador,
  getFicha, listBorradores, listFichas, ORIGENES };
