// gesty-lista-espera.js — LISTA DE ESPERA DE TURNOS (mejora 45/50).
// Si se libera un hueco, Gesty ofrece el lugar al siguiente de
// la lista; el turno se asigna cuando el cliente confirma y el
// dueño ve todo. DISTINTO de reservas (G-09b): esto es la
// ESPERA, no la reserva.
//
// · anotar: el cliente entra a la lista (servicio, fecha deseada
//   opcional, nombre y contacto). Orden FIFO por anotación.
// · liberarHueco: con un hueco libre (fecha/hora), se ofrece al
//   primero en espera (del mismo servicio, si se indica) con una
//   tarjeta 'hueco-ofrecer' que el dueño ve. El hueco NO se
//   asigna solo: se ofrece.
// · confirmarTurno: el cliente confirma → se crea la reserva por
//   el circuito G-09b (ingresarPedido, con sus validaciones) y la
//   espera queda 'confirmado'. Si el hueco ya se ocupó, no se
//   asigna: queda 'ofrecido' y se informa.
// · rechazarOferta: el cliente no quiere el hueco → la espera
//   queda 'rechazado' y el hueco se ofrece AUTOMÁTICAMENTE al
//   siguiente de la lista (si sigue libre). La cascada es la
//   lista trabajando, no una asignación sola.
// · El dueño ve toda la lista con sus estados en listEspera.
'use strict';
const gesty = require('./gesty.js');
const reservas = require('./gesty-reservas-canal.js');

const _esquemas = new WeakSet();
function ensureSchema(db) {
  if (_esquemas.has(db)) return;
  gesty.ensureSchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_lista_espera (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    servicio TEXT NOT NULL,
    fecha_deseada TEXT NOT NULL DEFAULT '',
    cliente_nombre TEXT NOT NULL,
    cliente_contacto TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'en-espera',
    hueco_fecha TEXT,
    hueco_hora TEXT,
    tarjeta_id INTEGER,
    reserva_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  _esquemas.add(db);
}

function fail(m) { throw new Error(m); }

function anotar(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  const servicio = String(d.servicio || '').trim();
  if (!servicio) fail('La espera lleva su servicio.');
  const nombre = String(d.cliente_nombre || d.nombre || '').trim();
  if (!nombre) fail('La espera lleva el nombre del cliente.');
  const contacto = String(d.cliente_contacto || d.contacto || '').trim();
  if (!contacto) fail('La espera lleva el contacto del cliente (para ofrecerle el hueco).');
  const r = db.prepare(`INSERT INTO gesty_lista_espera
    (user_id, servicio, fecha_deseada, cliente_nombre, cliente_contacto)
    VALUES (?,?,?,?,?)`)
    .run(userId, servicio, String(d.fecha_deseada || ''), nombre, contacto);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'lista-espera', entidad_id: Number(r.lastInsertRowid),
    tipo_evento: 'lista-espera-anotado',
    resumen: `${nombre} entró en lista de espera para ${servicio}.`,
    payload: { espera_id: Number(r.lastInsertRowid), servicio, cliente_nombre: nombre },
  });
  return getEspera(db, userId, Number(r.lastInsertRowid));
}

function getEspera(db, userId, id) {
  ensureSchema(db);
  return db.prepare('SELECT * FROM gesty_lista_espera WHERE user_id = ? AND id = ?').get(userId, id) || null;
}

function listEspera(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const cond = o.estado ? 'AND estado = ?' : '';
  const params = o.estado ? [userId, o.estado] : [userId];
  return db.prepare(`SELECT * FROM gesty_lista_espera WHERE user_id = ? ${cond} ORDER BY id ASC`).all(...params);
}

function ofrecer(db, userId, espera, fecha, hora) {
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'hueco-ofrecer',
    titulo: `Hueco libre para ${espera.cliente_nombre}`,
    detalle: { espera_id: espera.id, servicio: espera.servicio, cliente_nombre: espera.cliente_nombre,
      cliente_contacto: espera.cliente_contacto, hueco_fecha: fecha, hueco_hora: hora,
      nota: 'El hueco se ofrece, no se asigna: se asigna cuando el cliente confirma.' },
    vence: fecha, creado_por: 'gesty',
  });
  db.prepare(`UPDATE gesty_lista_espera SET estado = 'ofrecido', hueco_fecha = ?, hueco_hora = ?, tarjeta_id = ? WHERE id = ?`)
    .run(fecha, hora, tarjeta.id, espera.id);
  return { ...getEspera(db, userId, espera.id), tarjeta };
}

function liberarHueco(db, userId, datos) {
  ensureSchema(db);
  const d = datos || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.fecha || ''))) fail('El hueco libre lleva su fecha (AAAA-MM-DD).');
  if (!String(d.hora || '').trim()) fail('El hueco libre lleva su hora.');
  const cond = d.servicio ? 'AND servicio = ?' : '';
  const params = d.servicio ? [userId, d.servicio] : [userId];
  const primero = db.prepare(`SELECT * FROM gesty_lista_espera WHERE user_id = ? AND estado = 'en-espera' ${cond} ORDER BY id ASC LIMIT 1`).get(...params);
  if (!primero) return { ok: false, motivo: 'sin-espera', detalle: 'Nadie en espera para ese servicio.' };
  const ofrecido = ofrecer(db, userId, primero, d.fecha, d.hora);
  gesty.recordEvent(db, userId, {
    actor: 'gesty', entidad_tipo: 'lista-espera', entidad_id: primero.id,
    tipo_evento: 'lista-espera-hueco-ofrecido',
    resumen: `Hueco ${d.fecha} ${d.hora} ofrecido a ${primero.cliente_nombre} (${primero.servicio}).`,
    payload: { espera_id: primero.id, hueco_fecha: d.fecha, hueco_hora: d.hora },
  });
  return { ok: true, ofrecido };
}

function confirmarTurno(db, userId, esperaId, opts) {
  ensureSchema(db);
  const espera = getEspera(db, userId, esperaId);
  if (!espera) fail('Esa espera no existe en tu cuenta.');
  if (espera.estado !== 'ofrecido') fail(`Solo se confirma un hueco ofrecido (esta espera está en ${espera.estado}).`);
  const o = opts || {};
  const res = reservas.ingresarPedido(db, userId, {
    servicio: espera.servicio, fecha: espera.hueco_fecha, hora: espera.hueco_hora,
    cliente_nombre: espera.cliente_nombre, cliente_contacto: espera.cliente_contacto,
    canal: o.canal || 'whatsapp',
  });
  if (!res.ok) return { ok: false, motivo: res.motivo || 'no-se-pudo', detalle: 'El hueco ya no está libre: la espera sigue ofrecida.', alternativas: res.alternativas || [] };
  const reservaId = res.reserva && res.reserva.id ? res.reserva.id : null;
  db.prepare(`UPDATE gesty_lista_espera SET estado = 'confirmado', reserva_id = ? WHERE id = ?`).run(reservaId, esperaId);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'lista-espera', entidad_id: esperaId,
    tipo_evento: 'lista-espera-confirmada',
    resumen: `${espera.cliente_nombre} confirmó el hueco ${espera.hueco_fecha} ${espera.hueco_hora} (${espera.servicio}).`,
    payload: { espera_id: esperaId, reserva_id: reservaId },
  });
  return { ok: true, espera: getEspera(db, userId, esperaId), reserva: res };
}

function rechazarOferta(db, userId, esperaId) {
  ensureSchema(db);
  const espera = getEspera(db, userId, esperaId);
  if (!espera) fail('Esa espera no existe en tu cuenta.');
  if (espera.estado !== 'ofrecido') fail(`Solo se rechaza un hueco ofrecido (esta espera está en ${espera.estado}).`);
  db.prepare(`UPDATE gesty_lista_espera SET estado = 'rechazado' WHERE id = ?`).run(esperaId);
  // Cascada: el mismo hueco se ofrece al siguiente (si sigue libre).
  const siguiente = db.prepare(`SELECT * FROM gesty_lista_espera WHERE user_id = ? AND estado = 'en-espera' AND servicio = ? ORDER BY id ASC LIMIT 1`)
    .get(userId, espera.servicio);
  if (!siguiente) return { ok: true, rechazado: esperaId, siguiente: null };
  const disp = reservas.consultarDisponibilidad(db, userId, { fecha: espera.hueco_fecha });
  const libre = (disp.huecos || []).some((h) => String(h.hora_inicio) === String(espera.hueco_hora));
  if (!libre) return { ok: true, rechazado: esperaId, siguiente: null, nota: 'El hueco ya no está libre: no se ofrece al siguiente.' };
  const ofrecido = ofrecer(db, userId, siguiente, espera.hueco_fecha, espera.hueco_hora);
  return { ok: true, rechazado: esperaId, siguiente: ofrecido };
}

module.exports = { ensureSchema, anotar, getEspera, listEspera, ofrecer, liberarHueco, confirmarTurno, rechazarOferta };
