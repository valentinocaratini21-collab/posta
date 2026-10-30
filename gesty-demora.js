// gesty-demora.js — DEMORA DEL PROFESIONAL (tanda 2 de recepción 7/8).
// Si el profesional viene demorado, Gesty avisa a los que esperan
// (sala de espera + próximos turnos del día) y ofrece reprogramar
// en un toque.
//
// · NUNCA se inventa la demora: o la marca recepción explícitamente
//   (registrarDemora, con minutos y motivo), o se detecta de
//   hechos reales (detectarDemora: un turno llamado —en curso—
//   que ya pasó su fin programado mientras otros turnos esperan).
//   La detección solo propone la demora; recepción la confirma
//   con registrarDemora. Nada se avisa sin una demora registrada.
// · Avisar es un registro por afectado (idempotente): una demora
//   no avisa dos veces al mismo turno. Los afectados son la sala
//   de espera del día + los turnos activos del día.
// · Reprogramar por demora usa el flujo de mover de agenda
//   (pedirMover): si el turno toca a un cliente, queda la tarjeta
//   'compromiso-mover' para OK del dueño — el mismo camino que
//   cualquier movimiento de un compromiso con cliente. Nunca se
//   mueve un turno por debajo de ese flujo.
'use strict';
const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const sala = require('./gesty-sala-espera.js');

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function esHora(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); }
function minutos(hora) {
  const p = String(hora || '').split(':');
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
}
function hhmm(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  sala.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_demoras (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    fecha TEXT NOT NULL, minutos INTEGER NOT NULL,
    motivo TEXT NOT NULL DEFAULT '', profesional TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'activa',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_demora_avisos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    demora_id INTEGER NOT NULL, evento_id INTEGER NOT NULL,
    cliente_nombre TEXT NOT NULL DEFAULT '', cliente_contacto TEXT NOT NULL DEFAULT '',
    origen TEXT NOT NULL DEFAULT 'turno',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, demora_id, evento_id)
  )`);
  _esquemas.add(db);
}

function getDemora(db, userId, id) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_demoras WHERE user_id = ? AND id = ?').get(userId, Number(id)) || null;
}

// La marca explícita de recepción: la única forma de que una
// demora exista y se avise.
function registrarDemora(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fecha = norm(d.fecha) || new Date().toISOString().slice(0, 10);
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  const min = Number(d.minutos);
  if (!Number.isFinite(min) || min <= 0) fail('La demora va en minutos (más de 0).');
  const info = db.prepare(`INSERT INTO gesty_demoras
    (user_id, fecha, minutos, motivo, profesional)
    VALUES (?,?,?,?,?)`).run(userId, fecha, Math.floor(min), norm(d.motivo), norm(d.profesional));
  const demora = getDemora(db, userId, Number(info.lastInsertRowid));
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'demora', entidad_id: String(demora.id),
    tipo_evento: 'demora-profesional',
    resumen: `El profesional viene demorado ${Math.floor(min)} minutos (${fecha}${norm(d.motivo) ? ` · ${norm(d.motivo)}` : ''}).`,
    payload: { demora_id: demora.id, minutos: Math.floor(min) },
  });
  return demora;
}

// Candidata desde hechos reales, sin registrar nada: un turno
// llamado (en curso) que ya pasó su fin programado mientras otros
// turnos esperan. Recepción la confirma con registrarDemora.
function detectarDemora(db, userId, fecha, opts) {
  ensureSchema(db);
  const o = opts || {};
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  const ahora = norm(o.ahora);
  if (!esHora(ahora)) fail('Para detectar hace falta la hora actual (HH:MM).');
  const ahoraMin = minutos(ahora);
  const enCurso = sala.llamadosDe(db, userId, { fecha });
  for (const ll of enCurso) {
    const ev = agenda.getEvento(db, userId, ll.evento_id);
    if (!ev || ev.estado !== 'activo' || !ev.hora) continue;
    const fin = minutos(ev.hora) + (Number(ev.duracion_min) || 30);
    if (ahoraMin <= fin) continue;
    const esperando = sala.salaDe(db, userId, fecha, { ahora });
    if (!esperando.length) continue;
    return { candidata: true, demora_minutos: ahoraMin - fin,
      turno_en_curso_id: ev.id, titulo: ev.titulo,
      esperando: esperando.length,
      detalle: `«${ev.titulo}» debía terminar a las ${hhmm(fin)} y son las ${ahora} (${ahoraMin - fin} minutos tarde); ${esperando.length} en espera.` };
  }
  return { candidata: false };
}

// Afectados: sala de espera del día + turnos activos del día.
// Un aviso por afectado (idempotente).
function avisarDemora(db, userId, demoraId) {
  ensureSchema(db);
  const demora = getDemora(db, userId, demoraId);
  if (!demora) fail('Esa demora no es de esta cuenta.');
  if (demora.estado !== 'activa') fail(`Esa demora ya está ${demora.estado}: no se avisa.`);
  const vistos = new Set();
  const avisados = [];
  const registrar = (eventoId, origen, cliente) => {
    if (vistos.has(eventoId)) return;
    vistos.add(eventoId);
    const ex = db.prepare(`SELECT * FROM gesty_demora_avisos
      WHERE user_id = ? AND demora_id = ? AND evento_id = ?`).get(userId, demora.id, eventoId);
    if (ex) { avisados.push({ ...ex, ya_avisado: true }); return; }
    const info = db.prepare(`INSERT INTO gesty_demora_avisos
      (user_id, demora_id, evento_id, cliente_nombre, cliente_contacto, origen)
      VALUES (?,?,?,?,?,?)`).run(userId, demora.id, eventoId,
      norm(cliente && cliente.nombre), norm(cliente && cliente.contacto), origen);
    avisados.push({ ...db.prepare('SELECT * FROM gesty_demora_avisos WHERE id = ?').get(Number(info.lastInsertRowid)), ya_avisado: false });
  };
  for (const s of sala.salaDe(db, userId, demora.fecha, {})) {
    registrar(s.evento_id, 'sala-espera', { nombre: s.cliente_nombre, contacto: s.cliente_contacto });
  }
  const { eventos } = agenda.listEventos(db, userId, { estado: 'activo', desde: demora.fecha, hasta: demora.fecha, limit: 1000 });
  for (const ev of eventos) {
    if (ev.tipo !== 'turno' && ev.tipo !== 'cita') continue;
    registrar(ev.id, 'turno', ev.cliente);
  }
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'demora', entidad_id: String(demora.id),
    tipo_evento: 'demora-avisada',
    resumen: `Demora de ${demora.minutos} minutos avisada a ${avisados.length} turnos del ${demora.fecha}.`,
    payload: { demora_id: demora.id, avisados: avisados.length },
  });
  return { demora, avisados, cantidad: avisados.length };
}

// Ofrecer reprogramar a un afectado: usa el flujo de mover de
// agenda (tarjeta para OK del dueño si toca a un cliente).
function ofrecerReprogramacion(db, userId, demoraId, eventoId, datos) {
  ensureSchema(db);
  const demora = getDemora(db, userId, demoraId);
  if (!demora) fail('Esa demora no es de esta cuenta.');
  const aviso = db.prepare(`SELECT * FROM gesty_demora_avisos
    WHERE user_id = ? AND demora_id = ? AND evento_id = ?`).get(userId, demora.id, Number(eventoId));
  if (!aviso) fail('Ese turno no fue avisado de esta demora.');
  const d = datos || {};
  const fecha = norm(d.fecha);
  const hora = norm(d.hora);
  if (!esFecha(fecha)) fail('Para reprogramar hace falta la fecha nueva (AAAA-MM-DD).');
  if (hora && !esHora(hora)) fail('La hora nueva va en formato HH:MM.');
  return agenda.pedirMover(db, userId, Number(eventoId),
    { fecha, hora: hora || undefined, motivo: `Demora del profesional (${demora.minutos} min)` },
    { creado_por: 'gesty' });
}

function resolverDemora(db, userId, demoraId) {
  ensureSchema(db);
  const demora = getDemora(db, userId, demoraId);
  if (!demora) fail('Esa demora no es de esta cuenta.');
  if (demora.estado === 'resuelta') return { ...demora, ya_resuelta: true };
  db.prepare(`UPDATE gesty_demoras SET estado = 'resuelta',
    resolved_at = datetime('now') WHERE id = ?`).run(demora.id);
  return { ...getDemora(db, userId, demora.id), ya_resuelta: false };
}

// PASE DE APP — listado por día para la vista de recepción: sin esta
// lectura, una demora registrada no tenía superficie donde aparecer.
// Solo lectura; no cambia el flujo (la demora se avisa solo cuando
// recepción la confirma, nunca por detectar sola).
function listDemoras(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare('SELECT * FROM gesty_demoras WHERE user_id = ? ORDER BY id ASC').all(userId);
  if (o.fecha) rows = rows.filter((r) => r.fecha === String(o.fecha));
  if (o.estado) rows = rows.filter((r) => r.estado === String(o.estado));
  return rows;
}

function avisosDe(db, userId, demoraId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_demora_avisos WHERE user_id = ? AND demora_id = ? ORDER BY id ASC')
    .all(userId, Number(demoraId));
}

module.exports = { ensureSchema, registrarDemora, detectarDemora, avisarDemora,
  ofrecerReprogramacion, resolverDemora, getDemora, avisosDe, listDemoras };
