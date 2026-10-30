// gesty-atendidos-sin-pagar.js — ATENDIDOS SIN PAGAR (tanda 2 de recepción 5/8).
// La lista del día con turnos atendidos (cumplidos) sin cobro
// registrado, para cobrarlos antes de cerrar. Que nadie se vaya
// sin pagar.
//
// · DISTINTO de la cuenta corriente: esto no es el saldo del
//   cliente, es el control del día — qué turnos de hoy se
//   atendieron y todavía no tienen cobro.
// · "Cobro registrado" tiene solo dos fuentes honestas: un cobro
//   registrado en este módulo (recepción marca "cobrado" en un
//   toque, con medio y monto) o una factura vinculada al turno
//   que tenga pagos registrados (facturación). Sin vínculo
//   explícito no se empareja por fecha ni por nombre: un pago del
//   mismo cliente el mismo día por otro concepto no salda este
//   turno.
// · Turnos cumplidos sin cliente no entran en la lista: sin cliente
//   no hay a quién cobrar. Se documenta, no se inventa un cliente.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const facturacion = require('./gesty-facturacion.js');

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  facturacion.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_turno_cobros (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    evento_id INTEGER NOT NULL, medio TEXT NOT NULL DEFAULT '',
    monto REAL NOT NULL DEFAULT 0, factura_id INTEGER,
    registrado_por TEXT NOT NULL DEFAULT 'recepcion',
    fecha TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, evento_id)
  )`);
  _esquemas.add(db);
}

function esTurno(ev) {
  return ev && (ev.tipo === 'turno' || ev.tipo === 'cita') &&
    !!(norm(ev.cliente && ev.cliente.nombre) || norm(ev.cliente && ev.cliente.contacto));
}

function getCobro(db, userId, eventoId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_turno_cobros WHERE user_id = ? AND evento_id = ?')
    .get(userId, Number(eventoId)) || null;
}

function facturaConPagos(db, userId, facturaId) {
  try {
    const f = facturacion.getFactura(db, userId, Number(facturaId));
    if (!f) return false;
    const pagos = Array.isArray(f.pagos) ? f.pagos : [];
    return pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0) > 0;
  } catch (e) { return false; }
}

function tieneCobro(db, userId, eventoId) {
  const c = getCobro(db, userId, eventoId);
  if (!c) return false;
  if (c.factura_id && !c.monto) return facturaConPagos(db, userId, c.factura_id);
  return true; // cobro directo registrado (medio/monto) o vínculo con monto
}

// Recepción marca "cobrado" en un toque. Solo turnos cumplidos.
function registrarCobro(db, userId, eventoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const ev = agenda.getEvento(db, userId, eventoId);
  if (!ev) fail('Ese turno no es de esta cuenta.');
  if (!esTurno(ev)) fail('El cobro de turno es para un turno con cliente (turno o cita).');
  if (ev.estado !== 'cumplido') fail(`Solo se cobra un turno cumplido (este está ${ev.estado}).`);
  const existente = getCobro(db, userId, ev.id);
  if (existente) return { ...existente, ya_registrado: true };
  const monto = Number(o.monto) || 0;
  if (monto < 0) fail('El monto del cobro no puede ser negativo.');
  const info = db.prepare(`INSERT INTO gesty_turno_cobros
    (user_id, evento_id, medio, monto, registrado_por, fecha)
    VALUES (?,?,?,?,?,?)`).run(userId, ev.id,
    norm(o.medio), monto, norm(o.por) || 'recepcion', ev.fecha);
  const cobro = getCobro(db, userId, ev.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'turno', entidad_id: String(ev.id),
    tipo_evento: 'turno-cobrado',
    resumen: `Turno de ${norm(ev.cliente.nombre) || 'el cliente'} (${ev.fecha} · ${ev.titulo}) cobrado${norm(o.medio) ? ` (${norm(o.medio)})` : ''}.`,
    payload: { evento_id: ev.id, medio: norm(o.medio), monto },
  });
  return { ...cobro, ya_registrado: false };
}

// Vincula una factura al turno (el cableado del pase de app puede
// hacerlo cuando la factura nace del turno). El turno queda saldado
// solo si esa factura tiene pagos registrados.
function vincularFactura(db, userId, eventoId, facturaId) {
  ensureSchema(db);
  const ev = agenda.getEvento(db, userId, eventoId);
  if (!ev) fail('Ese turno no es de esta cuenta.');
  if (!esTurno(ev)) fail('El vínculo es para un turno con cliente (turno o cita).');
  let f = null;
  try { f = facturacion.getFactura(db, userId, Number(facturaId)); } catch (e) { f = null; }
  if (!f) fail('Esa factura no es de esta cuenta.');
  const existente = getCobro(db, userId, ev.id);
  if (existente) {
    db.prepare(`UPDATE gesty_turno_cobros SET factura_id = ? WHERE id = ?`).run(Number(facturaId), existente.id);
    return getCobro(db, userId, ev.id);
  }
  db.prepare(`INSERT INTO gesty_turno_cobros
    (user_id, evento_id, factura_id, registrado_por, fecha)
    VALUES (?,?,?,?,?)`).run(userId, ev.id, Number(facturaId), 'gesty', ev.fecha);
  return getCobro(db, userId, ev.id);
}

// Turnos cumplidos del día sin cobro registrado.
function listaDelDia(db, userId, fecha) {
  ensureSchema(db);
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  const { eventos } = agenda.listEventos(db, userId, { estado: 'cumplido', desde: fecha, hasta: fecha, limit: 1000 });
  const pendientes = [];
  for (const ev of eventos) {
    if (!esTurno(ev)) continue;
    if (tieneCobro(db, userId, ev.id)) continue;
    pendientes.push({ evento: ev, cobro: null });
  }
  return { fecha, pendientes, cantidad: pendientes.length };
}

module.exports = { ensureSchema, registrarCobro, vincularFactura, getCobro, tieneCobro, listaDelDia };
