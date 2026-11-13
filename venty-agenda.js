// venty-agenda.js — VENTY SLICE 3 (V-08): agenda anti no-show genérica.
// Turnos asociados a una partida, con confirmación y recordatorios (día
// anterior + mismo día) como TRABAJOS PROGRAMADOS en tabla propia: el
// despachador procesarTrabajos() los dispara cuando vence su hora (lo
// puede llamar un scheduler del servidor o el endpoint de la API; acá no
// se inventa un cron nuevo). Reagendar y cancelar pasan EN LA MISMA
// conversación de la partida y solo dentro de las políticas del
// fundamento (cancelación sin cargo en horas manda como ventana).
// Si el negocio no declara sistema de turnos en el fundamento, se usa la
// agenda mínima propia ('propia'); si declara uno, el turno guarda su
// sistema_ref externo y la agenda propia queda como espejo/registro.
// El no-show se registra como hecho (turno + evento), nunca se borra.
// Voz de Venty: minúsculas, sin signos de apertura, validada con venty.validarVoz.
'use strict';

const venty = require('./venty');

function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); }
function parseTs(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
}
function fmtTs(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
function horasEntre(desdeTs, hastaTs) {
  const a = parseTs(desdeTs), b = parseTs(hastaTs);
  if (a === null || b === null) return null;
  return (b - a) / 3600000;
}
// Fecha legible corta para los mensajes: «2026-11-20 10:00:00» → «20/11 a las 10:00».
function fechaCorta(ts) {
  const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return String(ts || '');
  return `${Number(m[3])}/${Number(m[2])} a las ${m[4]}:${m[5]}`;
}

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS venty_agenda_turnos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    partida_id INTEGER,
    cliente_nombre TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'turno',
    inicio_at TEXT NOT NULL,
    sistema TEXT NOT NULL DEFAULT 'propia',
    sistema_ref TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'confirmado',
    motivo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_turnos_user ON venty_agenda_turnos(user_id, estado, inicio_at)');
  db.exec(`CREATE TABLE IF NOT EXISTS venty_agenda_trabajos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    turno_id INTEGER NOT NULL,
    partida_id INTEGER,
    tipo TEXT NOT NULL,
    programado_para TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    disparado_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_venty_trabajos_user ON venty_agenda_trabajos(user_id, estado, programado_para)');
}

// Config de agenda desde el fundamento (genérica, cualquier negocio):
// politicas.agenda_sistema / politicas.cierre.agenda_sistema declaran el
// sistema del negocio; sin declaración → agenda mínima propia.
// politicas.cancelacion_sin_cargo_horas (ya existe en la semilla) es la
// ventana de política para reagendar/cancelar sin cargo.
function configAgenda(db, userId) {
  const f = venty.leerFundamento(db, userId);
  const pol = (f && f.politicas) || {};
  const cierre = pol.cierre || {};
  const sistema = String(cierre.agenda_sistema || pol.agenda_sistema || '').trim();
  const ventana = cierre.cancelacion_sin_cargo_horas !== undefined ? cierre.cancelacion_sin_cargo_horas
    : (pol.cancelacion_sin_cargo_horas !== undefined ? pol.cancelacion_sin_cargo_horas : null);
  return {
    sistema: sistema || 'propia',
    sistema_declarado: !!sistema,
    cancelacion_sin_cargo_horas: ventana === null ? null : Number(ventana),
  };
}

// Mensaje de Venty dentro de la conversación de la partida (el único lugar
// donde Venty le habla al cliente). Valida la voz; si algo no pasa, corrige
// lo mínimo (signos de apertura fuera, primera letra en minúscula) sin
// tocar el resto del texto (un link no se deforma).
function insertarMensajesVenty(db, partida, textos, cuando) {
  const ins = db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`);
  const out = [];
  for (const t0 of textos) {
    let t = String(t0 || '');
    if (!venty.validarVoz(t).ok) {
      t = t.replace(/[¿¡]/g, '');
      t = t.charAt(0).toLowerCase() + t.slice(1);
    }
    ins.run(partida.id, 'venty', t, partida.canal || 'simulacion', cuando || ahoraIso(), '');
    out.push(t);
  }
  return out;
}

function obtenerPartida(db, userId, partidaId) {
  return db.prepare('SELECT * FROM venty_partidas WHERE id = ? AND user_id = ?').get(partidaId, userId) || null;
}

function programarTrabajos(db, userId, turno, ahora) {
  const ins = db.prepare(`INSERT INTO venty_agenda_trabajos (user_id, turno_id, partida_id, tipo, programado_para, estado, created_at) VALUES (?,?,?,?,?,'pendiente',?)`);
  const ini = parseTs(turno.inicio_at);
  const trabajos = [];
  const mk = (tipo, para) => {
    const r = ins.run(userId, turno.id, turno.partida_id || null, tipo, para, ahora);
    trabajos.push({ id: Number(r.lastInsertRowid), tipo, programado_para: para });
  };
  mk('confirmacion', ahora);
  // día anterior: misma hora, 24 h antes.
  mk('recordatorio_dia_anterior', fmtTs(ini - 24 * 3600000));
  // mismo día: 09:00 de ese día; si el turno es antes de las 10:00, 1 h antes.
  const dia = String(turno.inicio_at).slice(0, 10);
  let mismoDia = dia + ' 09:00:00';
  if (parseTs(mismoDia) >= ini) mismoDia = fmtTs(ini - 3600000);
  mk('recordatorio_mismo_dia', mismoDia);
  return trabajos;
}

function cancelarTrabajosPendientes(db, turnoId) {
  db.prepare(`UPDATE venty_agenda_trabajos SET estado = 'cancelado' WHERE turno_id = ? AND estado = 'pendiente'`).run(turnoId);
}

// Crear un turno asociado a la partida: queda confirmado, manda la
// confirmación a la conversación y programa los dos recordatorios.
// opts: { inicio_at, tipo ('turno'|'visita'|'reserva'), sistema_ref, ahora,
//         avisar (default true) }
function crearTurno(db, userId, partidaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const partida = obtenerPartida(db, userId, partidaId);
  if (!partida) return { ok: false, kind: 'partida_no_encontrada' };
  const inicio = String(o.inicio_at || '').trim();
  if (parseTs(inicio) === null) return { ok: false, kind: 'fecha_invalida' };
  const ahora = o.ahora || ahoraIso();
  if (parseTs(inicio) <= parseTs(ahora)) return { ok: false, kind: 'fecha_pasada' };
  const cfg = configAgenda(db, userId);
  const sistema = o.sistema ? String(o.sistema) : cfg.sistema;
  const tipo = ['turno', 'visita', 'reserva'].includes(String(o.tipo || '')) ? String(o.tipo) : 'turno';
  const r = db.prepare(`INSERT INTO venty_agenda_turnos
    (user_id, partida_id, cliente_nombre, tipo, inicio_at, sistema, sistema_ref, estado, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,'confirmado',?,?)`)
    .run(userId, partidaId, partida.cliente_nombre || '', tipo, inicio, sistema, String(o.sistema_ref || '').slice(0, 200), ahora, ahora);
  const turno = db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ?').get(Number(r.lastInsertRowid));
  const trabajos = programarTrabajos(db, userId, turno, ahora);
  venty.registrarEvento(db, userId, 'turno_creado', partidaId, { turno_id: turno.id, tipo, inicio_at: inicio, sistema });
  let mensajes = [];
  if (o.avisar !== false) {
    const etiqueta = tipo === 'visita' ? 'la visita' : (tipo === 'reserva' ? 'la reserva' : 'el turno');
    mensajes = insertarMensajesVenty(db, partida, [
      `listo, ${etiqueta} quedó para el ${fechaCorta(inicio)} a tu nombre`,
      'te escribo el día anterior y el mismo día para confirmar, así no se te pasa',
    ], ahora);
  }
  return { ok: true, turno, trabajos, mensajes };
}

function listarTurnos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  if (o.partida_id) return db.prepare('SELECT * FROM venty_agenda_turnos WHERE user_id = ? AND partida_id = ? ORDER BY inicio_at ASC').all(userId, Number(o.partida_id));
  if (o.estado) return db.prepare('SELECT * FROM venty_agenda_turnos WHERE user_id = ? AND estado = ? ORDER BY inicio_at ASC').all(userId, String(o.estado));
  return db.prepare('SELECT * FROM venty_agenda_turnos WHERE user_id = ? ORDER BY inicio_at ASC').all(userId);
}

function listarTrabajos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  if (o.turno_id) return db.prepare('SELECT * FROM venty_agenda_trabajos WHERE user_id = ? AND turno_id = ? ORDER BY programado_para ASC').all(userId, Number(o.turno_id));
  if (o.estado) return db.prepare('SELECT * FROM venty_agenda_trabajos WHERE user_id = ? AND estado = ? ORDER BY programado_para ASC').all(userId, String(o.estado));
  return db.prepare('SELECT * FROM venty_agenda_trabajos WHERE user_id = ? ORDER BY programado_para ASC').all(userId);
}

function textoRecordatorio(tipo, turno) {
  const fc = fechaCorta(turno.inicio_at);
  const etiqueta = turno.tipo === 'visita' ? 'la visita' : (turno.tipo === 'reserva' ? 'la reserva' : 'el turno');
  if (tipo === 'confirmacion') return `confirmado: ${etiqueta} es el ${fc}`;
  if (tipo === 'recordatorio_dia_anterior') return `te recuerdo que mañana, ${fc}, tenés ${etiqueta}. si necesitás moverlo, avisame por acá`;
  return `hoy es el día: ${etiqueta} es el ${fc}, te esperamos`;
}

// Despachador de trabajos programados: dispara todo trabajo pendiente cuya
// hora ya llegó. Cada disparo deja su mensaje en la conversación de la
// partida y su evento; un trabajo disparado nunca se repite, y los de un
// turno cancelado se cancelan sin disparar. opts: { ahora }
function procesarTrabajos(db, userId, opts) {
  ensureSchema(db);
  const ahora = (opts && opts.ahora) || ahoraIso();
  const rows = db.prepare(`SELECT * FROM venty_agenda_trabajos WHERE user_id = ? AND estado = 'pendiente' AND programado_para <= ? ORDER BY programado_para ASC, id ASC`).all(userId, ahora);
  const disparados = [];
  for (const t of rows) {
    const turno = db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ?').get(t.turno_id);
    if (!turno || turno.estado === 'cancelado') {
      db.prepare(`UPDATE venty_agenda_trabajos SET estado = 'cancelado' WHERE id = ?`).run(t.id);
      continue;
    }
    if (turno.estado === 'no_show' || turno.estado === 'cumplido') {
      db.prepare(`UPDATE venty_agenda_trabajos SET estado = 'cancelado' WHERE id = ?`).run(t.id);
      continue;
    }
    db.prepare(`UPDATE venty_agenda_trabajos SET estado = 'disparado', disparado_at = ? WHERE id = ?`).run(ahora, t.id);
    let mensaje = '';
    if (turno.partida_id) {
      const partida = obtenerPartida(db, userId, turno.partida_id);
      if (partida) mensaje = insertarMensajesVenty(db, partida, [textoRecordatorio(t.tipo, turno)], ahora)[0] || '';
    }
    venty.registrarEvento(db, userId, t.tipo === 'confirmacion' ? 'turno_confirmacion' : 'recordatorio_enviado', turno.partida_id || null,
      { turno_id: turno.id, trabajo_id: t.id, tipo_trabajo: t.tipo, inicio_at: turno.inicio_at });
    disparados.push({ id: t.id, turno_id: turno.id, tipo: t.tipo, mensaje });
  }
  return { ok: true, disparados, cantidad: disparados.length, ahora };
}

// Ventana de política: reagendar/cancelar sin cargo exige estar fuera de
// la ventana de cancelación del fundamento (horas antes del turno).
// Sin ventana cargada, no hay restricción (política no cargada ≠ inventada).
function dentroDePolitica(db, userId, turno, ahora) {
  const cfg = configAgenda(db, userId);
  if (cfg.cancelacion_sin_cargo_horas === null) return { ok: true, ventana_horas: null };
  const h = horasEntre(ahora, turno.inicio_at);
  if (h === null) return { ok: false, motivo: 'fecha_invalida' };
  if (h < cfg.cancelacion_sin_cargo_horas) {
    return { ok: false, ventana_horas: cfg.cancelacion_sin_cargo_horas, horas_restantes: Math.round(h * 10) / 10,
      motivo: `faltan menos de ${cfg.cancelacion_sin_cargo_horas} h para el turno: la política del fundamento no permite moverlo sin cargo` };
  }
  return { ok: true, ventana_horas: cfg.cancelacion_sin_cargo_horas };
}

function reagendarTurno(db, userId, turnoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const turno = db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ? AND user_id = ?').get(turnoId, userId);
  if (!turno) return { ok: false, kind: 'turno_no_encontrado' };
  if (turno.estado !== 'confirmado') return { ok: false, kind: 'turno_no_confirmado', estado: turno.estado };
  const nuevo = String(o.nuevo_inicio_at || '').trim();
  if (parseTs(nuevo) === null) return { ok: false, kind: 'fecha_invalida' };
  const ahora = o.ahora || ahoraIso();
  if (parseTs(nuevo) <= parseTs(ahora)) return { ok: false, kind: 'fecha_pasada' };
  const pol = dentroDePolitica(db, userId, turno, ahora);
  if (!pol.ok) {
    venty.registrarEvento(db, userId, 'turno_reagenda_fuera_de_politica', turno.partida_id || null, { turno_id: turno.id, motivo: pol.motivo });
    return { ok: false, kind: 'fuera_de_politica', motivo: pol.motivo, ventana_horas: pol.ventana_horas };
  }
  const anterior = turno.inicio_at;
  cancelarTrabajosPendientes(db, turno.id);
  db.prepare(`UPDATE venty_agenda_turnos SET inicio_at = ?, estado = 'confirmado', updated_at = ? WHERE id = ?`).run(nuevo, ahora, turno.id);
  const actualizado = db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ?').get(turno.id);
  const trabajos = programarTrabajos(db, userId, actualizado, ahora);
  venty.registrarEvento(db, userId, 'turno_reagendado', turno.partida_id || null, { turno_id: turno.id, de: anterior, a: nuevo });
  let mensajes = [];
  if (turno.partida_id && o.avisar !== false) {
    const partida = obtenerPartida(db, userId, turno.partida_id);
    if (partida) mensajes = insertarMensajesVenty(db, partida, [`listo, lo moví al ${fechaCorta(nuevo)}`, 'te vuelvo a recordar el día anterior y el mismo día'], ahora);
  }
  return { ok: true, turno: actualizado, trabajos, mensajes };
}

function cancelarTurno(db, userId, turnoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const turno = db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ? AND user_id = ?').get(turnoId, userId);
  if (!turno) return { ok: false, kind: 'turno_no_encontrado' };
  if (turno.estado !== 'confirmado') return { ok: false, kind: 'turno_no_confirmado', estado: turno.estado };
  const ahora = o.ahora || ahoraIso();
  const pol = dentroDePolitica(db, userId, turno, ahora);
  if (!pol.ok) {
    venty.registrarEvento(db, userId, 'turno_cancelacion_fuera_de_politica', turno.partida_id || null, { turno_id: turno.id, motivo: pol.motivo });
    return { ok: false, kind: 'fuera_de_politica', motivo: pol.motivo, ventana_horas: pol.ventana_horas };
  }
  cancelarTrabajosPendientes(db, turno.id);
  db.prepare(`UPDATE venty_agenda_turnos SET estado = 'cancelado', motivo = ?, updated_at = ? WHERE id = ?`)
    .run(String(o.motivo || 'lo canceló el cliente').slice(0, 200), ahora, turno.id);
  venty.registrarEvento(db, userId, 'turno_cancelado', turno.partida_id || null,
    { turno_id: turno.id, inicio_at: turno.inicio_at, lugar_liberado: true, motivo: String(o.motivo || '').slice(0, 200) });
  let mensajes = [];
  if (turno.partida_id && o.avisar !== false) {
    const partida = obtenerPartida(db, userId, turno.partida_id);
    if (partida) mensajes = insertarMensajesVenty(db, partida, ['listo, quedó cancelado. si querés otro día, avisame por acá'], ahora);
  }
  return { ok: true, turno: db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ?').get(turno.id), lugar_liberado: true, mensajes };
}

// No-show: el cliente no vino. Queda como hecho (turno + evento); los
// trabajos que quedaran se cancelan. Nunca se disfraza de otra cosa.
function registrarNoShow(db, userId, turnoId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const turno = db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ? AND user_id = ?').get(turnoId, userId);
  if (!turno) return { ok: false, kind: 'turno_no_encontrado' };
  if (turno.estado === 'no_show') return { ok: true, ya: true, turno };
  if (turno.estado !== 'confirmado') return { ok: false, kind: 'turno_no_confirmado', estado: turno.estado };
  const ahora = o.ahora || ahoraIso();
  cancelarTrabajosPendientes(db, turno.id);
  db.prepare(`UPDATE venty_agenda_turnos SET estado = 'no_show', updated_at = ? WHERE id = ?`).run(ahora, turno.id);
  venty.registrarEvento(db, userId, 'no_show', turno.partida_id || null, { turno_id: turno.id, inicio_at: turno.inicio_at, cliente: turno.cliente_nombre });
  return { ok: true, turno: db.prepare('SELECT * FROM venty_agenda_turnos WHERE id = ?').get(turno.id) };
}

function contarNoShows(db, userId, desde, hasta) {
  ensureSchema(db);
  const r = db.prepare(`SELECT COUNT(*) c FROM venty_agenda_turnos WHERE user_id = ? AND estado = 'no_show' AND inicio_at >= ? AND inicio_at < ?`)
    .get(userId, String(desde || '0000-01-01'), String(hasta || '9999-12-31'));
  return (r && r.c) || 0;
}

module.exports = {
  ensureSchema, configAgenda, crearTurno, listarTurnos, listarTrabajos,
  procesarTrabajos, reagendarTurno, cancelarTurno, registrarNoShow,
  contarNoShows, dentroDePolitica, fechaCorta, parseTs, horasEntre, norm,
  insertarMensajesVenty,
};
