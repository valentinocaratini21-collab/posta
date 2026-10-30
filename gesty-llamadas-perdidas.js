// gesty-llamadas-perdidas.js — LLAMADAS PERDIDAS PARA DEVOLVER (tanda 2 de recepción 1/8).
// La cola de llamadas NO atendidas: número, hora, motivo. Recepción
// devuelve en un toque y la llamada queda devuelta; mientras tanto
// queda pendiente y visible. Se alimenta de G-13 (llamadas sin
// atender, cuando ese módulo vive en el mismo árbol) y del fuera
// de horario (ítem 3 de esta tanda, que registra acá cada llamada
// que entra con el negocio cerrado).
//
// · NUNCA se inventa una devolución: solo la marca explícita de
//   recepción (o del dueño) deja la llamada como devuelta, con
//   quién la devolvió y cuándo. Sin esa marca, sigue pendiente.
// · Una llamada pendiente por contacto y día se agrupa: si el mismo
//   número vuelve a quedar sin atender el mismo día, el registro
//   suma un intento (veces), no se crean dos pendientes iguales.
//   Devolver salda todos los intentos de ese registro.
// · Motivos cerrados: sin-respuesta (nadie atendió), fuera-de-horario
//   (el negocio estaba cerrado), derivacion-pendiente (se tomó el
//   mensaje pero nadie lo devolvió todavía), ocupado (la línea
//   estaba ocupada). Un motivo fuera de la lista falla.
'use strict';
const gesty = require('./gesty.js');

const MOTIVOS = ['sin-respuesta', 'fuera-de-horario', 'derivacion-pendiente', 'ocupado'];

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function esHora(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_llamadas_perdidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    contacto TEXT NOT NULL, nombre TEXT NOT NULL DEFAULT '',
    fecha TEXT NOT NULL, hora TEXT NOT NULL DEFAULT '',
    motivo TEXT NOT NULL DEFAULT 'sin-respuesta',
    estado TEXT NOT NULL DEFAULT 'pendiente',
    veces INTEGER NOT NULL DEFAULT 1,
    nota TEXT NOT NULL DEFAULT '',
    devuelta_por TEXT NOT NULL DEFAULT '',
    devuelta_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  _esquemas.add(db);
}

function getPerdida(db, userId, id) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_llamadas_perdidas WHERE user_id = ? AND id = ?')
    .get(userId, Number(id)) || null;
}

// Registrar una llamada no atendida. Si ya hay una pendiente del
// mismo contacto, el mismo día y el mismo motivo, suma un intento.
function registrar(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const contacto = norm(d.contacto || d.numero);
  if (!contacto) fail('La llamada perdida lleva el número o contacto de quien llamó.');
  const motivo = String(d.motivo || 'sin-respuesta');
  if (!MOTIVOS.includes(motivo)) fail(`El motivo de la llamada perdida va en: ${MOTIVOS.join(', ')}.`);
  const fecha = norm(d.fecha) || new Date().toISOString().slice(0, 10);
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  const hora = norm(d.hora);
  if (hora && !esHora(hora)) fail('La hora va en formato HH:MM.');
  const pendiente = db.prepare(`SELECT * FROM gesty_llamadas_perdidas
    WHERE user_id = ? AND contacto = ? AND fecha = ? AND motivo = ? AND estado = 'pendiente'
    ORDER BY id ASC LIMIT 1`).get(userId, contacto, fecha, motivo);
  if (pendiente) {
    db.prepare(`UPDATE gesty_llamadas_perdidas SET veces = veces + 1,
      hora = COALESCE(NULLIF(?, ''), hora) WHERE id = ?`).run(hora, pendiente.id);
    return { ...getPerdida(db, userId, pendiente.id), ya_registrada: true };
  }
  const info = db.prepare(`INSERT INTO gesty_llamadas_perdidas
    (user_id, contacto, nombre, fecha, hora, motivo)
    VALUES (?,?,?,?,?,?)`).run(userId, contacto, norm(d.nombre), fecha, hora, motivo);
  const reg = getPerdida(db, userId, Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'llamada-perdida', entidad_id: String(reg.id),
    tipo_evento: 'llamada-perdida',
    resumen: `Llamada sin atender de ${norm(d.nombre) || contacto} (${fecha}${hora ? ' ' + hora : ''}, ${motivo}): quedó para devolver.`,
    payload: { contacto, motivo, fecha },
  });
  return { ...reg, ya_registrada: false };
}

// Devolver en un toque: solo esta marca explícita salda la llamada.
function devolver(db, userId, id, opts) {
  ensureSchema(db);
  const o = opts || {};
  const reg = getPerdida(db, userId, id);
  if (!reg) fail('Esa llamada perdida no es de esta cuenta.');
  if (reg.estado === 'devuelta') return { ...reg, ya_devuelta: true };
  const por = norm(o.por) || 'recepcion';
  db.prepare(`UPDATE gesty_llamadas_perdidas SET estado = 'devuelta',
    nota = ?, devuelta_por = ?, devuelta_at = datetime('now') WHERE id = ?`)
    .run(norm(o.nota), por, reg.id);
  const dev = getPerdida(db, userId, reg.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'llamada-perdida', entidad_id: String(reg.id),
    tipo_evento: 'llamada-devuelta',
    resumen: `Llamada de ${reg.nombre || reg.contacto} devuelta (${por}).`,
    payload: { contacto: reg.contacto, motivo: reg.motivo, veces: reg.veces },
  });
  return { ...dev, ya_devuelta: false };
}

function pendientes(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare(`SELECT * FROM gesty_llamadas_perdidas
    WHERE user_id = ? AND estado = 'pendiente' ORDER BY fecha ASC, hora ASC, id ASC`).all(userId);
  if (o.motivo) rows = rows.filter((r) => r.motivo === String(o.motivo));
  if (o.fecha) rows = rows.filter((r) => r.fecha === String(o.fecha));
  return rows;
}

function listLlamadas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare(`SELECT * FROM gesty_llamadas_perdidas
    WHERE user_id = ? ORDER BY fecha DESC, hora DESC, id DESC`).all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  return rows;
}

module.exports = { ensureSchema, registrar, devolver, getPerdida, pendientes, listLlamadas, MOTIVOS };
