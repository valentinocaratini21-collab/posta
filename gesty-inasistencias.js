// gesty-inasistencias.js — REGISTRO DE INASISTENCIAS (brecha de recepción 2/5).
// Turno pasado sin llegada ni cancelación = falta registrada en
// la ficha del cliente. Si es repetida (umbral del dueño), avisa.
// La falta se puede justificar con motivo (dueño).
//
// · DISTINTO de «clientes que no volvieron» (churn por días sin
//   compra): esto es faltar a un turno puntual. Una falta por
//   turno, idempotente: procesar dos veces no duplica.
// · NUNCA se cobra ni penaliza automáticamente: la seña o la
//   política la decide el dueño. Acá solo se registra y se avisa.
// · Solo turnos: eventos de agenda tipo turno/cita con cliente,
//   en estado activo, con fecha pasada. Un turno cancelado,
//   cumplido o con llegada no es falta.
// · La falta justificada no cuenta para «repetida»: lo explicado
//   no es lo mismo que lo repetido sin aviso.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const llegadas = require('./gesty-llegadas.js');

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function normClave(v) { return norm(v).toLowerCase().replace(/\s+/g, ' '); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  llegadas.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_inasistencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    evento_id INTEGER NOT NULL, cliente_nombre TEXT NOT NULL DEFAULT '',
    cliente_contacto TEXT NOT NULL DEFAULT '', fecha TEXT NOT NULL,
    hora TEXT NOT NULL DEFAULT '', titulo TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'falta', motivo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, evento_id)
  )`);
  _esquemas.add(db);
}

function esTurno(ev) {
  return ev && (ev.tipo === 'turno' || ev.tipo === 'cita') &&
    !!(norm(ev.cliente && ev.cliente.nombre) || norm(ev.cliente && ev.cliente.contacto));
}

function claveCliente(falta) {
  const contacto = normClave(falta.cliente_contacto);
  if (contacto) return `contacto:${contacto}`;
  return `nombre:${normClave(falta.cliente_nombre)}`;
}

function getUmbral(db, userId) {
  const fila = gesty.getData(db, userId, { grupo: 'inasistencias' })
    .find((x) => x.campo === 'umbral');
  const u = fila && fila.valor !== undefined ? Number(fila.valor) : 2;
  return Number.isFinite(u) && u >= 1 ? Math.floor(u) : 2;
}

function configurarUmbral(db, userId, umbral) {
  const u = Number(umbral);
  if (!Number.isFinite(u) || u < 1) fail('El umbral de faltas repetidas va en número (1 o más).');
  gesty.setData(db, userId, {
    grupo: 'inasistencias', campo: 'umbral', valor: Math.floor(u),
    origen: 'dueno', origen_ref: 'inasistencias', cargado_por: 'dueno',
  });
  return Math.floor(u);
}

function getFalta(db, userId, eventoId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_inasistencias WHERE user_id = ? AND evento_id = ?')
    .get(userId, Number(eventoId)) || null;
}

function marcarFaltas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = String(o.hoy || new Date().toISOString().slice(0, 10));
  if (!esFecha(hoy)) fail('La fecha de corrida va en formato AAAA-MM-DD.');
  const umbral = getUmbral(db, userId);
  const { eventos } = agenda.listEventos(db, userId, { estado: 'activo', limit: 1000 });
  const creadas = [];
  const avisos = [];
  for (const ev of eventos) {
    if (!esTurno(ev)) continue;
    if (ev.fecha >= hoy) continue;
    if (llegadas.tieneLlegada(db, userId, ev.id)) continue;
    if (getFalta(db, userId, ev.id)) continue;
    const cliente = ev.cliente || {};
    const info = db.prepare(`INSERT INTO gesty_inasistencias
      (user_id, evento_id, cliente_nombre, cliente_contacto, fecha, hora, titulo)
      VALUES (?,?,?,?,?,?,?)`).run(userId, ev.id,
      norm(cliente.nombre), norm(cliente.contacto), ev.fecha, ev.hora || '', ev.titulo);
    const falta = getFalta(db, userId, ev.id);
    creadas.push(falta);
    // Aviso cuando la cuenta de faltas SIN justificar alcanza el umbral.
    // Identidad: contacto si lo hay, si no nombre. Nunca se mezclan
    // dos clientes distintos por parecido (un contacto vacío no se
    // cuenta junto a un contacto presente aunque el nombre coincida).
    const cuenta = norm(cliente.contacto)
      ? db.prepare(`SELECT COUNT(*) AS n FROM gesty_inasistencias
          WHERE user_id = ? AND estado = 'falta' AND lower(cliente_contacto) = lower(?)`)
          .get(userId, norm(cliente.contacto)).n
      : db.prepare(`SELECT COUNT(*) AS n FROM gesty_inasistencias
          WHERE user_id = ? AND estado = 'falta' AND cliente_contacto = '' AND lower(cliente_nombre) = lower(?)`)
          .get(userId, norm(cliente.nombre)).n;
    if (cuenta === umbral) {
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'cliente', entidad_id: String(ev.id),
        tipo_evento: 'inasistencia-repetida',
        resumen: `${norm(cliente.nombre) || 'El cliente'} acumula ${cuenta} faltas sin justificar: avisar al dueño.`,
        payload: { cliente_nombre: norm(cliente.nombre), cliente_contacto: norm(cliente.contacto), faltas: cuenta, umbral },
      });
      avisos.push({ cliente_nombre: norm(cliente.nombre), cliente_contacto: norm(cliente.contacto), faltas: cuenta });
    }
    void info;
  }
  return { creadas, avisos };
}

function justificarFalta(db, userId, faltaId, motivo) {
  ensureSchema(db);
  const m = norm(motivo);
  if (!m) fail('Justificar una falta lleva su motivo.');
  const falta = db.prepare('SELECT * FROM gesty_inasistencias WHERE id = ? AND user_id = ?').get(Number(faltaId), userId);
  if (!falta) fail('Esa falta no es de esta cuenta.');
  if (falta.estado !== 'falta') fail(`Esa falta ya está ${falta.estado}.`);
  db.prepare(`UPDATE gesty_inasistencias SET estado = 'justificada', motivo = ? WHERE id = ?`).run(m, falta.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'cliente', entidad_id: String(falta.evento_id),
    tipo_evento: 'inasistencia-justificada',
    resumen: `Falta justificada: ${norm(falta.cliente_nombre) || 'cliente'} (${falta.fecha} · ${falta.titulo}): ${m}`,
    payload: { falta_id: falta.id, evento_id: falta.evento_id },
  });
  return db.prepare('SELECT * FROM gesty_inasistencias WHERE id = ?').get(falta.id);
}

function listFaltas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_inasistencias WHERE user_id = ? ORDER BY fecha DESC, id DESC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  return rows;
}

function faltasDeCliente(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const contacto = normClave(o.contacto);
  const nombre = normClave(o.nombre);
  if (!contacto && !nombre) fail('Para ver las faltas de un cliente hace falta su contacto o su nombre.');
  return listFaltas(db, userId).filter((f) => {
    if (contacto) return normClave(f.cliente_contacto) === contacto;
    return normClave(f.cliente_nombre) === nombre;
  });
}

function clientesConFaltasRepetidas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const umbral = o.umbral !== undefined ? Number(o.umbral) : getUmbral(db, userId);
  if (!Number.isFinite(umbral) || umbral < 1) fail('El umbral va en número (1 o más).');
  const porCliente = new Map();
  for (const f of listFaltas(db, userId, { estado: 'falta' })) {
    const clave = claveCliente(f);
    const cur = porCliente.get(clave) || { cliente_nombre: f.cliente_nombre, cliente_contacto: f.cliente_contacto, faltas: 0, ultima_fecha: '' };
    cur.faltas += 1;
    if (f.fecha > cur.ultima_fecha) cur.ultima_fecha = f.fecha;
    porCliente.set(clave, cur);
  }
  return [...porCliente.values()].filter((c) => c.faltas >= umbral)
    .sort((a, b) => b.faltas - a.faltas || String(b.ultima_fecha).localeCompare(String(a.ultima_fecha)));
}

module.exports = { ensureSchema, getUmbral, configurarUmbral, marcarFaltas, justificarFalta,
  getFalta, listFaltas, faltasDeCliente, clientesConFaltasRepetidas };
