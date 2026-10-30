// gesty-bloqueos.js — BLOQUEOS DE AGENDA (brecha de recepción 4/5).
// El dueño marca bloqueos: vacaciones, almuerzos, días sin
// atención, rangos. En un momento bloqueado NO se puede reservar:
// la reserva lo rechaza con motivo, nunca reserva sobre un bloqueo.
// Los bloqueos se ven en la agenda.
//
// · Tres formas, todas dato del dueño (nunca inventado):
//   - fecha: un día entero sin atención.
//   - rango: desde-hasta, días enteros (vacaciones).
//   - franja: una franja horaria en ciertos días de semana
//     (almuerzo de lunes a viernes). Días 0-6 (0 = domingo, como
//     getDay); sin días indicados, vale todos los días.
// · Desactivar no borra: el bloqueo queda inactivo y deja de
//   rechazar, con su historia intacta.
// · Cableado honesto: este módulo es la validación completa y
//   testeada (puedeReservar). Llamarla desde la creación de
//   turnos (agenda crearEvento / canal ingresarPedido) es trabajo
//   del pase de app/servidor: acá no se cambia el comportamiento
//   de ningún módulo existente, para no romper sus flujos.
'use strict';
const gesty = require('./gesty.js');

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function esHora(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); }
function aMin(hora) { const [h, m] = String(hora).split(':').map(Number); return h * 60 + m; }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_bloqueos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    motivo TEXT NOT NULL, tipo TEXT NOT NULL,
    desde_fecha TEXT NOT NULL, hasta_fecha TEXT,
    hora_desde TEXT NOT NULL DEFAULT '', hora_hasta TEXT NOT NULL DEFAULT '',
    dias_semana TEXT NOT NULL DEFAULT '[]', estado TEXT NOT NULL DEFAULT 'activo',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  _esquemas.add(db);
}

function parseDias(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  } catch { return []; }
}

function crearBloqueo(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const motivo = norm(d.motivo);
  if (!motivo) fail('El bloqueo lleva su motivo (vacaciones, almuerzo, día sin atención).');
  const tipo = String(d.tipo || '');
  if (!['fecha', 'rango', 'franja'].includes(tipo)) fail('El bloqueo va en: fecha, rango o franja.');
  let desde = ''; let hasta = null; let hDesde = ''; let hHasta = ''; let dias = [];
  if (tipo === 'fecha') {
    desde = norm(d.fecha || d.desde_fecha);
    if (!esFecha(desde)) fail('El bloqueo de un día lleva su fecha (AAAA-MM-DD).');
  } else if (tipo === 'rango') {
    desde = norm(d.desde_fecha);
    hasta = norm(d.hasta_fecha);
    if (!esFecha(desde) || !esFecha(hasta)) fail('El bloqueo de rango lleva desde y hasta (AAAA-MM-DD).');
    if (hasta < desde) fail('El hasta del bloqueo no puede ser anterior al desde.');
  } else {
    hDesde = norm(d.hora_desde);
    hHasta = norm(d.hora_hasta);
    if (!esHora(hDesde) || !esHora(hHasta)) fail('La franja lleva hora desde y hora hasta (HH:MM).');
    if (aMin(hHasta) <= aMin(hDesde)) fail('La hora hasta de la franja va después de la hora desde.');
    desde = norm(d.desde_fecha || '2000-01-01');
    hasta = norm(d.hasta_fecha || null) || null;
    if (!esFecha(desde)) fail('La franja lleva su fecha desde (AAAA-MM-DD).');
    if (hasta && !esFecha(hasta)) fail('La franja lleva su fecha hasta (AAAA-MM-DD).');
    if (hasta && hasta < desde) fail('El hasta de la franja no puede ser anterior al desde.');
    dias = Array.isArray(d.dias_semana) && d.dias_semana.length
      ? d.dias_semana.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      : [0, 1, 2, 3, 4, 5, 6];
    if (!dias.length) fail('La franja lleva al menos un día de semana.');
  }
  const info = db.prepare(`INSERT INTO gesty_bloqueos
    (user_id, motivo, tipo, desde_fecha, hasta_fecha, hora_desde, hora_hasta, dias_semana)
    VALUES (?,?,?,?,?,?,?,?)`).run(userId, motivo, tipo, desde, hasta, hDesde, hHasta, JSON.stringify(dias));
  const b = getBloqueo(db, userId, Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'bloqueo', entidad_id: String(b.id),
    tipo_evento: 'bloqueo-creado',
    resumen: `Bloqueo en agenda: ${motivo} (${tipo}${b.desde_fecha ? ' · ' + b.desde_fecha : ''}${b.hasta_fecha ? ' a ' + b.hasta_fecha : ''}).`,
    payload: { bloqueo_id: b.id, tipo, motivo },
  });
  return b;
}

function getBloqueo(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_bloqueos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  if (!r) return null;
  return { ...r, dias_semana: parseDias(r.dias_semana) };
}

function desactivarBloqueo(db, userId, id) {
  ensureSchema(db);
  const b = getBloqueo(db, userId, id);
  if (!b) fail('Ese bloqueo no es de esta cuenta.');
  if (b.estado !== 'activo') fail(`Ese bloqueo ya está ${b.estado}.`);
  db.prepare(`UPDATE gesty_bloqueos SET estado = 'inactivo' WHERE id = ?`).run(b.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'bloqueo', entidad_id: String(b.id),
    tipo_evento: 'bloqueo-desactivado', resumen: `Bloqueo desactivado: ${b.motivo}.`,
    payload: { bloqueo_id: b.id },
  });
  return getBloqueo(db, userId, b.id);
}

function listBloqueos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_bloqueos WHERE user_id = ? ORDER BY desde_fecha ASC, id ASC').all(userId);
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  return rows.map((r) => ({ ...r, dias_semana: parseDias(r.dias_semana) }));
}

// ¿El bloqueo cubre este DÍA? (sin horas: una franja afecta su día
// aunque no lo cubra entero; el momento exacto lo decide cubre).
function cubreDia(b, fecha) {
  if (b.tipo === 'fecha') return b.desde_fecha === fecha;
  if (b.tipo === 'rango') {
    return fecha >= b.desde_fecha && (!b.hasta_fecha || fecha <= b.hasta_fecha);
  }
  if (fecha < b.desde_fecha) return false;
  if (b.hasta_fecha && fecha > b.hasta_fecha) return false;
  return b.dias_semana.includes(new Date(`${fecha}T12:00:00`).getDay());
}

// ¿El bloqueo cubre este MOMENTO? (fecha + hora + duración). Una
// franja sin hora no bloquea nada: solo bloquea sus horas.
function cubre(b, fecha, hora, duracionMin) {
  if (b.tipo !== 'franja') return cubreDia(b, fecha);
  if (!cubreDia(b, fecha)) return false;
  if (!hora) return false;
  const ini = aMin(hora);
  const fin = ini + (Number(duracionMin) || 30);
  return ini < aMin(b.hora_hasta) && aMin(b.hora_desde) < fin;
}

function bloqueosDeFecha(db, userId, fecha) {
  ensureSchema(db);
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  return listBloqueos(db, userId, { estado: 'activo' }).filter((b) => cubreDia(b, fecha));
}

function afectaA(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fecha = norm(d.fecha);
  if (!esFecha(fecha)) fail('Para verificar hace falta la fecha (AAAA-MM-DD).');
  const hora = norm(d.hora);
  if (hora && !esHora(hora)) fail('La hora va en formato HH:MM.');
  const dur = d.duracion_min === undefined || d.duracion_min === null ? 30 : Number(d.duracion_min);
  const afectados = listBloqueos(db, userId, { estado: 'activo' })
    .filter((b) => cubre(b, fecha, hora, dur));
  return { bloqueado: afectados.length > 0, bloqueos: afectados };
}

function puedeReservar(db, userId, datos) {
  const r = afectaA(db, userId, datos);
  if (!r.bloqueado) return { ok: true };
  const b = r.bloqueos[0];
  return { ok: false, motivo: 'bloqueado',
    detalle: `Ese momento está bloqueado (${b.motivo}).`,
    bloqueos: r.bloqueos.map((x) => ({ id: x.id, motivo: x.motivo, tipo: x.tipo })) };
}

module.exports = { ensureSchema, crearBloqueo, getBloqueo, desactivarBloqueo,
  listBloqueos, bloqueosDeFecha, afectaA, puedeReservar };
