// gesty-ficha-turno.js — FICHA LISTA ANTES DE CADA TURNO (tanda 2 de recepción 8/8).
// Antes de cada turno, el profesional y recepción tienen la ficha
// lista: notas de recepción (preferencias, avisos), qué debe,
// última visita y faltas. Se compone SOLO de datos reales
// existentes (cliente, cuenta corriente, historial de turnos,
// inasistencias): no inventa nada.
//
// · DISTINTO del plan del día (la vista del día del dueño) y de la
//   vista estática del cliente: esto es por turno, en el momento,
//   para quien va a atender.
// · Las notas las escribe el dueño o nacen de interacciones reales
//   (llamada, mensaje, recepción): el texto es lo que se dijo o
//   lo que el dueño escribió, nunca un dato inferido presentado
//   como hecho. Cada nota lleva su origen.
// · "Debe" es el saldo de la cuenta corriente (facturas menos
//   pagos). Sin facturas, es null — no cero inventado: cero diría
//   "no debe nada" sin saberlo.
// · Vive en Agenda → turno + Cliente → ficha: no es una vista
//   nueva de nivel superior.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const cc = require('./gesty-cuenta-corriente.js');
const inasistencias = require('./gesty-inasistencias.js');

const AUTORES = ['dueno', 'gesty'];
const ORIGENES_NOTA = ['dueno', 'llamada', 'mensaje', 'recepcion'];

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esTurno(ev) {
  return ev && (ev.tipo === 'turno' || ev.tipo === 'cita') &&
    !!(norm(ev.cliente && ev.cliente.nombre) || norm(ev.cliente && ev.cliente.contacto));
}

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_notas_recepcion (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    cliente_nombre TEXT NOT NULL DEFAULT '', cliente_contacto TEXT NOT NULL DEFAULT '',
    nota TEXT NOT NULL, autor TEXT NOT NULL DEFAULT 'dueno',
    origen TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  _esquemas.add(db);
}

function agregarNota(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const nota = norm(d.nota);
  if (!nota) fail('La nota de recepción lleva su texto.');
  const contacto = norm(d.cliente_contacto || d.contacto);
  const nombre = norm(d.cliente_nombre || d.nombre);
  if (!contacto && !nombre) fail('La nota lleva el cliente (contacto o nombre).');
  const autor = String(d.autor || 'dueno');
  if (!AUTORES.includes(autor)) fail(`El autor de la nota va en: ${AUTORES.join(', ')}.`);
  const origen = String(d.origen || 'dueno');
  if (!ORIGENES_NOTA.includes(origen)) fail(`El origen de la nota va en: ${ORIGENES_NOTA.join(', ')}.`);
  const info = db.prepare(`INSERT INTO gesty_notas_recepcion
    (user_id, cliente_nombre, cliente_contacto, nota, autor, origen)
    VALUES (?,?,?,?,?,?)`).run(userId, nombre, contacto, nota, autor, origen);
  return db.prepare('SELECT * FROM gesty_notas_recepcion WHERE id = ?').get(Number(info.lastInsertRowid));
}

function notasDe(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const contacto = norm(d.cliente_contacto || d.contacto);
  const nombre = norm(d.cliente_nombre || d.nombre);
  let rows = db.prepare('SELECT * FROM gesty_notas_recepcion WHERE user_id = ? ORDER BY id DESC').all(userId);
  if (contacto) rows = rows.filter((r) => r.cliente_contacto === contacto);
  else if (nombre) rows = rows.filter((r) => r.cliente_nombre === nombre);
  return rows;
}

// La ficha lista para un turno: notas + debe + última visita + faltas.
function fichaParaTurno(db, userId, eventoId) {
  ensureSchema(db);
  const ev = agenda.getEvento(db, userId, eventoId);
  if (!ev) fail('Ese turno no es de esta cuenta.');
  if (!esTurno(ev)) fail('La ficha es para un turno con cliente (turno o cita).');
  const cliente = ev.cliente || {};
  const notas = notasDe(db, userId, { cliente_contacto: cliente.contacto, cliente_nombre: cliente.nombre });
  let debe = null;
  try {
    const cuenta = cc.cuentaCliente(db, userId, { nombre: cliente.nombre });
    if (cuenta && !cuenta.ambiguo && !cuenta.noEncontrado) debe = cuenta.saldo;
  } catch (e) { debe = null; }
  let faltas = [];
  try {
    faltas = inasistencias.faltasDeCliente(db, userId,
      { contacto: cliente.contacto, nombre: cliente.nombre }).filter((f) => f.estado === 'falta');
  } catch (e) { faltas = []; }
  const { eventos } = agenda.listEventos(db, userId, { estado: 'cumplido', limit: 1000 });
  const anteriores = eventos.filter((e) => e.id !== ev.id &&
    ((cliente.contacto && e.cliente && e.cliente.contacto === cliente.contacto) ||
     (!cliente.contacto && e.cliente && e.cliente.nombre === cliente.nombre)) &&
    (e.fecha < ev.fecha || (e.fecha === ev.fecha && e.id < ev.id)));
  anteriores.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) ||
    String(b.hora || '').localeCompare(String(a.hora || '')) || b.id - a.id);
  const ultima = anteriores[0] || null;
  return {
    evento: ev,
    cliente: { nombre: cliente.nombre || '', contacto: cliente.contacto || '' },
    notas,
    debe,
    debe_estado: debe === null ? 'sin-datos' : 'con-datos',
    ultima_visita: ultima ? { evento_id: ultima.id, fecha: ultima.fecha, hora: ultima.hora || '', titulo: ultima.titulo } : null,
    faltas: faltas.length,
    faltas_detalle: faltas.map((f) => ({ id: f.id, fecha: f.fecha, evento_id: f.evento_id })),
  };
}

module.exports = { ensureSchema, agregarNota, notasDe, fichaParaTurno };
