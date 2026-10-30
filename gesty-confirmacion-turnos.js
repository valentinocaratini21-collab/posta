// gesty-confirmacion-turnos.js — CONFIRMACIÓN DE TURNOS (brecha de recepción 1/5).
// El cliente confirma su turno (por mensaje, llamada, app, o lo
// marca recepción). Confirmado queda marcado. Sin confirmación
// antes del límite que define el dueño, el turno se libera: aviso
// al dueño y hueco ofrecido al siguiente en la lista de espera
// EXISTENTE (no se duplica).
//
// · DISTINTO del recordatorio (que solo avisa): acá hace falta la
//   RESPUESTA del cliente. Sin respuesta = sin confirmar, NUNCA
//   confirmado inventado.
// · El límite lo define el dueño (horas antes del turno, default
//   24). Es su regla: vencido el límite, la liberación es
//   automática y queda registrada (como la mora automática).
// · Liberar no es borrar: el turno queda cancelado con motivo
//   'sin-confirmacion' y se puede reservar de nuevo.
// · Un turno con llegada no se libera: si el cliente ya llegó, el
//   turno pasó. Los turnos pasados sin llegada son dominio de las
//   inasistencias, no de acá (procesarVencidas solo mira turnos
//   de hoy en adelante).
// · Solo turnos: eventos de agenda tipo turno/cita con cliente.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const llegadas = require('./gesty-llegadas.js');
const espera = require('./gesty-lista-espera.js');

const CANALES = ['mensaje', 'llamada', 'app', 'recepcion'];

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function esHora(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  llegadas.ensureSchema(db);
  espera.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_confirmaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    evento_id INTEGER NOT NULL, cliente_nombre TEXT NOT NULL DEFAULT '',
    cliente_contacto TEXT NOT NULL DEFAULT '', fecha TEXT NOT NULL,
    hora TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'pendiente',
    canal TEXT NOT NULL DEFAULT '', limite_horas INTEGER NOT NULL DEFAULT 24,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT,
    UNIQUE(user_id, evento_id)
  )`);
  _esquemas.add(db);
}

function esTurno(ev) {
  return ev && (ev.tipo === 'turno' || ev.tipo === 'cita') &&
    !!(norm(ev.cliente && ev.cliente.nombre) || norm(ev.cliente && ev.cliente.contacto));
}

function getLimite(db, userId) {
  const fila = gesty.getData(db, userId, { grupo: 'confirmacion-turnos' })
    .find((x) => x.campo === 'horas_limite');
  const h = fila && fila.valor !== undefined ? Number(fila.valor) : 24;
  return Number.isFinite(h) && h >= 0 ? Math.floor(h) : 24;
}

function configurarLimite(db, userId, horas) {
  const h = Number(horas);
  if (!Number.isFinite(h) || h < 0) fail('El límite de confirmación va en horas (0 o más).');
  gesty.setData(db, userId, {
    grupo: 'confirmacion-turnos', campo: 'horas_limite', valor: Math.floor(h),
    origen: 'dueno', origen_ref: 'confirmacion-turnos', cargado_por: 'dueno',
  });
  return Math.floor(h);
}

function getConfirmacion(db, userId, eventoId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_confirmaciones WHERE user_id = ? AND evento_id = ?')
    .get(userId, Number(eventoId)) || null;
}

function confirmar(db, userId, eventoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const canal = String(o.canal || 'recepcion');
  if (!CANALES.includes(canal)) fail(`El canal de confirmación va en: ${CANALES.join(', ')}.`);
  const ev = agenda.getEvento(db, userId, eventoId);
  if (!ev) fail('Ese turno no es de esta cuenta.');
  if (!esTurno(ev)) fail('La confirmación es para un turno con cliente (turno o cita).');
  if (ev.estado !== 'activo') fail(`Ese turno ya está ${ev.estado}: no se confirma.`);
  const existente = getConfirmacion(db, userId, ev.id);
  if (existente && existente.estado === 'confirmada') return { ...existente, ya_confirmada: true };
  if (existente && existente.estado === 'vencida') fail('Ese turno ya se liberó por falta de confirmación: hay que reservar de nuevo.');
  const cliente = ev.cliente || {};
  if (existente) {
    db.prepare(`UPDATE gesty_confirmaciones SET estado = 'confirmada', canal = ?, confirmed_at = datetime('now') WHERE id = ?`)
      .run(canal, existente.id);
  } else {
    db.prepare(`INSERT INTO gesty_confirmaciones
      (user_id, evento_id, cliente_nombre, cliente_contacto, fecha, hora, estado, canal, limite_horas)
      VALUES (?,?,?,?,?,?,'confirmada',?,?)`).run(userId, ev.id,
      norm(cliente.nombre), norm(cliente.contacto), ev.fecha, ev.hora || '', canal, getLimite(db, userId));
  }
  const conf = getConfirmacion(db, userId, ev.id);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'turno', entidad_id: String(ev.id),
    tipo_evento: 'turno-confirmado',
    resumen: `${norm(cliente.nombre) || 'El cliente'} confirmó su turno (${ev.fecha}${ev.hora ? ' ' + ev.hora : ''} · ${ev.titulo}, por ${canal}).`,
    payload: { evento_id: ev.id, canal },
  });
  return { ...conf, ya_confirmada: false };
}

function turnosPendientes(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = String(o.hoy || new Date().toISOString().slice(0, 10));
  const { eventos } = agenda.listEventos(db, userId, { estado: 'activo', desde: hoy, limit: 1000 });
  return eventos.filter((ev) => esTurno(ev) && !llegadas.tieneLlegada(db, userId, ev.id))
    .filter((ev) => {
      const c = getConfirmacion(db, userId, ev.id);
      return !c || c.estado === 'pendiente';
    })
    .map((ev) => {
      const c = getConfirmacion(db, userId, ev.id);
      return { evento: ev, confirmacion: c || null };
    });
}

function listConfirmaciones(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_confirmaciones WHERE user_id = ? ORDER BY fecha ASC, hora ASC, id ASC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  return rows;
}

// Fecha/hora del turno como milisegundos (sin hora, medianoche).
function msTurno(ev) {
  const hora = esHora(ev.hora) ? ev.hora : '00:00';
  const ms = Date.parse(`${ev.fecha}T${hora}:00`);
  return Number.isFinite(ms) ? ms : null;
}

function procesarVencidas(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const ahoraMs = Date.parse(String(o.ahora || new Date().toISOString()));
  if (!Number.isFinite(ahoraMs)) fail('La hora de corrida va en formato ISO.');
  const hoy = new Date(ahoraMs).toISOString().slice(0, 10);
  const limiteGlobal = getLimite(db, userId);
  const { eventos } = agenda.listEventos(db, userId, { estado: 'activo', desde: hoy, limit: 1000 });
  const resultado = { liberadas: [], avisadas: [], ofrecidas: [], sin_espera: [] };
  for (const ev of eventos) {
    if (!esTurno(ev)) continue;
    if (llegadas.tieneLlegada(db, userId, ev.id)) continue;
    const c = getConfirmacion(db, userId, ev.id);
    if (c && c.estado === 'confirmada') continue;
    if (c && c.estado === 'vencida') continue;
    // El límite del registro manda si existe; si no, el global actual.
    const limite = c && Number.isFinite(Number(c.limite_horas)) ? Number(c.limite_horas) : limiteGlobal;
    const ms = msTurno(ev);
    if (ms === null) continue;
    if (ms - limite * 3600000 > ahoraMs) continue;
    // Vencida: se libera el turno (regla del dueño, registrada) y se avisa.
    const cliente = ev.cliente || {};
    if (c) {
      db.prepare(`UPDATE gesty_confirmaciones SET estado = 'vencida' WHERE id = ?`).run(c.id);
    } else {
      db.prepare(`INSERT INTO gesty_confirmaciones
        (user_id, evento_id, cliente_nombre, cliente_contacto, fecha, hora, estado, limite_horas)
        VALUES (?,?,?,?,?,?,'vencida',?)`).run(userId, ev.id,
        norm(cliente.nombre), norm(cliente.contacto), ev.fecha, ev.hora || '', limite);
    }
    db.prepare(`UPDATE gesty_agenda_eventos SET estado = 'cancelado', motivo_estado = 'sin-confirmacion',
      updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(ev.id, userId);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'turno', entidad_id: String(ev.id),
      tipo_evento: 'turno-sin-confirmar',
      resumen: `${norm(cliente.nombre) || 'El cliente'} no confirmó su turno (${ev.fecha}${ev.hora ? ' ' + ev.hora : ''} · ${ev.titulo}): se liberó el hueco.`,
      payload: { evento_id: ev.id, limite_horas: limite },
    });
    resultado.liberadas.push(ev.id);
    resultado.avisadas.push(ev.id);
    // Hueco ofrecido al siguiente en espera (servicio = título del turno).
    if (ev.hora) {
      const of = espera.liberarHueco(db, userId, { fecha: ev.fecha, hora: ev.hora, servicio: ev.titulo });
      if (of.ok) resultado.ofrecidas.push({ evento_id: ev.id, espera_id: of.ofrecido.id });
      else resultado.sin_espera.push({ evento_id: ev.id, motivo: of.motivo || 'sin-espera' });
    } else {
      resultado.sin_espera.push({ evento_id: ev.id, motivo: 'sin-hora' });
    }
  }
  return resultado;
}

module.exports = { ensureSchema, getLimite, configurarLimite, confirmar, getConfirmacion,
  turnosPendientes, listConfirmaciones, procesarVencidas, CANALES };
