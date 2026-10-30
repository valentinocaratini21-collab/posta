// gesty-llegadas.js — LLEGADA / CHECK-IN (brecha de recepción 3/5).
// El cliente llegó: recepción lo marca en un toque, o el cliente
// avisa por mensaje. Al marcarse se registra la llegada, se avisa
// al profesional (evento + listado del día, que es lo que la app
// muestra) y la ficha queda lista.
//
// · Esto es el EVENTO de llegada. La «sala de espera en vivo»
//   (tablero de quién espera) es otro ítem pendiente y NO se
//   construye acá.
// · Una llegada por turno (idempotente): marcar dos veces devuelve
//   el mismo registro, nunca dos llegadas.
// · La llegada NO cumple el turno: el cliente está acá, el servicio
//   todavía no se hizo. Cumplir es otro flujo (agenda).
// · Solo turnos: eventos de agenda tipo turno/cita con cliente.
//   Un evento cancelado o cumplido no admite llegada.
// · El aviso al profesional es evento + listado; no se simula
//   ningún envío (push/SMS) desde este módulo: eso lo cablea el
//   pase de app sobre estos mismos datos.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');

const MEDIOS = ['recepcion', 'mensaje', 'llamada', 'app'];

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_llegadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    evento_id INTEGER NOT NULL, cliente_nombre TEXT NOT NULL DEFAULT '',
    cliente_contacto TEXT NOT NULL DEFAULT '', fecha TEXT NOT NULL,
    hora TEXT NOT NULL DEFAULT '', medio TEXT NOT NULL DEFAULT 'recepcion',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, evento_id)
  )`);
  _esquemas.add(db);
}

function esTurno(ev) {
  return ev && (ev.tipo === 'turno' || ev.tipo === 'cita') &&
    !!(norm(ev.cliente && ev.cliente.nombre) || norm(ev.cliente && ev.cliente.contacto));
}

function getLlegada(db, userId, eventoId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_llegadas WHERE user_id = ? AND evento_id = ?')
    .get(userId, Number(eventoId)) || null;
}

function tieneLlegada(db, userId, eventoId) {
  return !!getLlegada(db, userId, eventoId);
}

function marcarLlegada(db, userId, eventoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const medio = String(o.medio || 'recepcion');
  if (!MEDIOS.includes(medio)) fail(`El medio de llegada va en: ${MEDIOS.join(', ')}.`);
  const ev = agenda.getEvento(db, userId, eventoId);
  if (!ev) fail('Ese turno no es de esta cuenta.');
  if (!esTurno(ev)) fail('La llegada es para un turno con cliente (turno o cita).');
  if (ev.estado !== 'activo') fail(`Ese turno ya está ${ev.estado}: no admite llegada.`);
  const existente = getLlegada(db, userId, ev.id);
  if (existente) return { ...existente, ya_registrada: true };
  const cliente = ev.cliente || {};
  const info = db.prepare(`INSERT INTO gesty_llegadas
    (user_id, evento_id, cliente_nombre, cliente_contacto, fecha, hora, medio)
    VALUES (?,?,?,?,?,?,?)`).run(userId, ev.id,
    norm(cliente.nombre), norm(cliente.contacto), ev.fecha, ev.hora || '', medio);
  const llegada = getLlegada(db, userId, ev.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'turno', entidad_id: String(ev.id),
    tipo_evento: 'turno-llegada',
    resumen: `${norm(cliente.nombre) || 'El cliente'} llegó (${ev.fecha}${ev.hora ? ' ' + ev.hora : ''} · ${ev.titulo}). Aviso al profesional.`,
    payload: { evento_id: ev.id, cliente_nombre: norm(cliente.nombre), medio, llegada_id: Number(info.lastInsertRowid) },
  });
  return { ...llegada, ya_registrada: false };
}

function llegadasDe(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fecha = norm(o.fecha);
  let rows;
  if (fecha) {
    if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
    rows = db.prepare('SELECT * FROM gesty_llegadas WHERE user_id = ? AND fecha = ? ORDER BY hora ASC, id ASC').all(userId, fecha);
  } else {
    rows = db.prepare('SELECT * FROM gesty_llegadas WHERE user_id = ? ORDER BY fecha DESC, hora ASC, id ASC').all(userId);
  }
  if (o.medio) rows = rows.filter((r) => r.medio === String(o.medio));
  return rows;
}

module.exports = { ensureSchema, marcarLlegada, getLlegada, tieneLlegada, llegadasDe, MEDIOS };
