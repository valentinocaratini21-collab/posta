// gesty-fuera-horario.js — FUERA DE HORARIO (tanda 2 de recepción 3/8).
// Fuera del horario de atención del negocio, Gesty atiende igual
// (mensaje o llamada): dice cuándo abre, agenda para el día
// siguiente o toma el pedido, y deja todo anotado para la mañana
// (la cola de la mañana). Cada contacto fuera de horario queda
// además como llamada perdida con motivo 'fuera-de-horario'
// (ítem 1 de esta tanda), para devolverla.
//
// · NUNCA promete atención inmediata fuera de horario: la respuesta
//   dice cuándo abre (próxima apertura real, calculada del horario
//   del dueño) y toma el pedido para la mañana.
// · El horario lo define el dueño, por día de semana (0 = domingo).
//   Sin horario configurado para ese día, el módulo NO inventa que
//   está cerrado: devuelve abierto = null con motivo 'sin-horario',
//   toma el mensaje para la mañana, pero NO lo registra como
//   llamada perdida fuera de horario (eso sería afirmar algo que
//   no se sabe).
// · La cola de la mañana es por fecha de mañana: cada registro dice
//   para qué mañana quedó y se resuelve en un toque cuando
//   recepción lo atiende.
'use strict';
const gesty = require('./gesty.js');
const perdidas = require('./gesty-llamadas-perdidas.js');

function fail(m) { throw new Error(m); }
function norm(v) { return String(v || '').trim(); }
function esFecha(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function esHora(v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')); }
function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diaSemana(iso) { return new Date(`${iso}T12:00:00Z`).getUTCDay(); }

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  perdidas.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_horario_atencion (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    dia_semana INTEGER NOT NULL, apertura TEXT NOT NULL, cierre TEXT NOT NULL,
    UNIQUE(user_id, dia_semana)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_cola_manana (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    fecha TEXT NOT NULL, para_manana TEXT NOT NULL,
    canal TEXT NOT NULL DEFAULT 'mensaje',
    contacto TEXT NOT NULL DEFAULT '', nombre TEXT NOT NULL DEFAULT '',
    pedido TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL DEFAULT 'pendiente',
    resuelto_por TEXT NOT NULL DEFAULT '', nota TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  )`);
  _esquemas.add(db);
}

function configurarHorario(db, userId, diaSemanaNum, apertura, cierre) {
  ensureSchema(db);
  const d = Number(diaSemanaNum);
  if (!Number.isInteger(d) || d < 0 || d > 6) fail('El día de semana va de 0 (domingo) a 6 (sábado).');
  if (!esHora(apertura) || !esHora(cierre)) fail('La apertura y el cierre van en formato HH:MM.');
  if (apertura >= cierre) fail('La apertura tiene que ser antes del cierre.');
  db.prepare(`INSERT INTO gesty_horario_atencion (user_id, dia_semana, apertura, cierre)
    VALUES (?,?,?,?) ON CONFLICT(user_id, dia_semana) DO UPDATE SET apertura = excluded.apertura, cierre = excluded.cierre`)
    .run(userId, d, apertura, cierre);
  return getHorario(db, userId, d);
}

function getHorario(db, userId, diaSemanaNum) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_horario_atencion WHERE user_id = ? AND dia_semana = ?')
    .get(userId, Number(diaSemanaNum)) || null;
}

function listHorario(db, userId) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_horario_atencion WHERE user_id = ? ORDER BY dia_semana ASC').all(userId);
}

// true = abierto, false = cerrado, null = sin horario para ese día.
function estaAbierto(db, userId, fecha, hora) {
  ensureSchema(db);
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  if (!esHora(hora)) fail('La hora va en formato HH:MM.');
  const h = getHorario(db, userId, diaSemana(fecha));
  if (!h) return null;
  return hora >= h.apertura && hora < h.cierre;
}

// Próxima apertura real desde fecha/hora (incluye hoy si todavía
// no abrió). null si no hay ningún horario configurado.
function proximaApertura(db, userId, fecha, hora) {
  ensureSchema(db);
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  if (!esHora(hora)) fail('La hora va en formato HH:MM.');
  for (let i = 0; i <= 7; i++) {
    const dia = sumarDias(fecha, i);
    const h = getHorario(db, userId, diaSemana(dia));
    if (!h) continue;
    if (i === 0 && hora >= h.cierre) continue;
    if (i === 0 && hora >= h.apertura) continue; // abierto ahora: no es "próxima"
    return { fecha: dia, hora: h.apertura };
  }
  return null;
}

// Atiende un contacto: abierto → pasa; cerrado o sin horario →
// queda anotado para la mañana (y, si está cerrado de verdad,
// también como llamada perdida para devolver).
function atender(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const fecha = norm(d.fecha) || new Date().toISOString().slice(0, 10);
  const hora = norm(d.hora);
  if (!esFecha(fecha)) fail('La fecha va en formato AAAA-MM-DD.');
  if (!esHora(hora)) fail('La hora va en formato HH:MM para atender fuera de horario.');
  const canal = norm(d.canal) || 'mensaje';
  const abierto = estaAbierto(db, userId, fecha, hora);
  if (abierto === true) return { abierto: true, cola_id: null, perdida_id: null };
  const prox = proximaApertura(db, userId, fecha, hora);
  const paraManana = prox ? prox.fecha : sumarDias(fecha, 1);
  const info = db.prepare(`INSERT INTO gesty_cola_manana
    (user_id, fecha, para_manana, canal, contacto, nombre, pedido)
    VALUES (?,?,?,?,?,?,?)`).run(userId, fecha, paraManana, canal,
    norm(d.contacto), norm(d.nombre), norm(d.pedido));
  const colaId = Number(info.lastInsertRowid);
  let perdidaId = null;
  if (abierto === false && norm(d.contacto)) {
    const p = perdidas.registrar(db, userId, {
      contacto: norm(d.contacto), nombre: norm(d.nombre),
      fecha, hora, motivo: 'fuera-de-horario',
    });
    perdidaId = p.id;
  }
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'cola-manana', entidad_id: String(colaId),
    tipo_evento: abierto === false ? 'contacto-fuera-de-horario' : 'contacto-sin-horario',
    resumen: `Contacto ${abierto === false ? 'fuera de horario' : 'sin horario configurado'} de ${norm(d.nombre) || norm(d.contacto) || 'un cliente'} (${fecha} ${hora}, por ${canal}): quedó para la mañana del ${paraManana}.`,
    payload: { cola_id: colaId, perdida_id: perdidaId, proxima_apertura: prox },
  });
  return { abierto, cola_id: colaId, perdida_id: perdidaId, proxima_apertura: prox, para_manana: paraManana };
}

function colaManana(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  let rows = db.prepare(`SELECT * FROM gesty_cola_manana
    WHERE user_id = ? AND estado = 'pendiente' ORDER BY para_manana ASC, id ASC`).all(userId);
  if (o.para_manana) rows = rows.filter((r) => r.para_manana === String(o.para_manana));
  return rows;
}

function resolverManana(db, userId, id, opts) {
  ensureSchema(db);
  const o = opts || {};
  const r = db.prepare('SELECT * FROM gesty_cola_manana WHERE user_id = ? AND id = ?').get(userId, Number(id));
  if (!r) fail('Ese pendiente de la mañana no es de esta cuenta.');
  if (r.estado === 'resuelta') return { ...r, ya_resuelta: true };
  db.prepare(`UPDATE gesty_cola_manana SET estado = 'resuelta',
    resuelto_por = ?, nota = ?, resolved_at = datetime('now') WHERE id = ?`)
    .run(norm(o.por) || 'recepcion', norm(o.nota), r.id);
  const res = db.prepare('SELECT * FROM gesty_cola_manana WHERE id = ?').get(r.id);
  return { ...res, ya_resuelta: false };
}

module.exports = { ensureSchema, configurarHorario, getHorario, listHorario,
  estaAbierto, proximaApertura, atender, colaManana, resolverManana };
