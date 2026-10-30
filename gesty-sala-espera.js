// gesty-sala-espera.js — SALA DE ESPERA EN VIVO (tanda 2 de recepción 4/8).
// El tablero de quién está esperando ahora mismo, en orden de
// llegada, desde cuándo espera. Se alimenta SOLO de los check-ins
// reales del módulo de llegadas (que quedó a propósito sin
// tablero): nadie aparece en la sala sin haber hecho check-in.
// Cuando el profesional lo llama, sale de la sala (el turno pasa
// a en curso) y queda registrado.
//
// · La sala es del día: solo llegadas de esa fecha, con turno
//   todavía activo. Un turno cumplido o cancelado ya no espera:
//   no aparece, aunque tenga llegada registrada.
// · Llamar no cumple el turno: el cliente está siendo atendido,
//   el servicio todavía no terminó. Cumplir es otro flujo (agenda).
// · minutos_espera se calcula solo cuando se pasa la hora de
//   referencia (opts.ahora, HH:MM): sin ella no se inventa un
//   "ahora" — la sala muestra desde cuándo espera (la hora del
//   check-in) y el cálculo queda en null.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const llegadas = require('./gesty-llegadas.js');

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function esHora(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); }
function minutos(hora) {
  const p = String(hora || '').split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  llegadas.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_sala_llamados (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    llegada_id INTEGER NOT NULL, evento_id INTEGER NOT NULL,
    profesional TEXT NOT NULL DEFAULT '',
    fecha TEXT NOT NULL, hora_llamado TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, llegada_id)
  )`);
  _esquemas.add(db);
}

function llamadoDe(db, userId, llegadaId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_sala_llamados WHERE user_id = ? AND llegada_id = ?')
    .get(userId, Number(llegadaId)) || null;
}

function llamadosDe(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_sala_llamados WHERE user_id = ? ORDER BY id ASC').all(userId);
  if (o.fecha) rows = rows.filter((r) => r.fecha === String(o.fecha));
  return rows;
}

// La sala de un día: llegadas con turno activo y sin llamar,
// en orden de llegada (hora del check-in, luego registro).
function salaDe(db, userId, fecha, opts) {
  ensureSchema(db);
  const o = opts || {};
  if (!esFecha(fecha)) fail('La fecha de la sala va en formato AAAA-MM-DD.');
  const ahora = norm(o.ahora);
  if (ahora && !esHora(ahora)) fail('La hora de referencia va en formato HH:MM.');
  const sala = [];
  for (const l of llegadas.llegadasDe(db, userId, { fecha })) {
    if (llamadoDe(db, userId, l.id)) continue;
    const ev = agenda.getEvento(db, userId, l.evento_id);
    if (!ev || ev.estado !== 'activo') continue;
    sala.push({
      llegada_id: l.id, evento_id: l.evento_id,
      cliente_nombre: l.cliente_nombre, cliente_contacto: l.cliente_contacto,
      titulo: ev.titulo, hora_turno: ev.hora || '',
      llego_hora: l.hora || '', medio: l.medio,
      minutos_espera: ahora && l.hora ? Math.max(0, minutos(ahora) - minutos(l.hora)) : null,
    });
  }
  return sala;
}

// El profesional llama al cliente: sale de la sala, el turno pasa
// a en curso (registrado acá; la agenda lo sigue viendo activo
// hasta que se cumpla).
function llamar(db, userId, llegadaId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const l = llegadas.llegadasDe(db, userId, {}).find((x) => x.id === Number(llegadaId));
  if (!l) fail('Esa llegada no es de esta cuenta.');
  const existente = llamadoDe(db, userId, l.id);
  if (existente) return { ...existente, ya_llamado: true };
  const ev = agenda.getEvento(db, userId, l.evento_id);
  if (!ev || ev.estado !== 'activo') fail('Ese turno ya no está activo: no se puede llamar.');
  const info = db.prepare(`INSERT INTO gesty_sala_llamados
    (user_id, llegada_id, evento_id, profesional, fecha, hora_llamado)
    VALUES (?,?,?,?,?,?)`).run(userId, l.id, l.evento_id,
    norm(o.profesional), l.fecha, norm(o.hora_llamado));
  const llamado = db.prepare('SELECT * FROM gesty_sala_llamados WHERE id = ?').get(Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'turno', entidad_id: String(l.evento_id),
    tipo_evento: 'turno-llamado',
    resumen: `${l.cliente_nombre || 'El cliente'} fue llamado a atender (${l.fecha} · ${ev.titulo}).`,
    payload: { llegada_id: l.id, evento_id: l.evento_id, profesional: norm(o.profesional) },
  });
  return { ...llamado, ya_llamado: false };
}

module.exports = { ensureSchema, salaDe, llamar, llamadoDe, llamadosDe };
