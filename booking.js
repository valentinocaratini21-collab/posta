// booking.js — Agenda de turnos y reservas de Posty (Atención al cliente,
// plan Total). La agenda vive EN Posty: sin integración de calendario
// externo por ahora (decisión del build 2026-10-20).
//
// (2026-10-20, build Atención Total) Esta pieza estaba VENDIDA en la landing
// y en config/plans.js ("Agenda tus turnos y reservas, y los confirma") con
// CERO código detrás. Este módulo es el modelo de datos + la lógica:
// crear / confirmar / reprogramar / cancelar / cumplir / no-show, y la lista
// de recordatorios anti no-show pendientes (turno confirmado que empieza en
// las próximas N horas y todavía no tuvo recordatorio).
//
// El recordatorio se ENTREGA por el canal que server.js tenga disponible
// (hoy: cola de aprobación del dueño; mañana: DM/WhatsApp cuando Meta lo
// habilite). Este módulo solo decide QUÉ hay que recordar y arma el texto.
//
// Estados: pending → confirmed → done | no_show | cancelled
//          pending → cancelled · confirmed → pending (reprogramar vuelve a
//          pending SOLO si el negocio lo pide: ver rescheduleBooking)
// Exporta: { ensureTable, createBooking, getBooking, listBookings,
//   confirmBooking, rescheduleBooking, cancelBooking, completeBooking,
//   markNoShow, dueReminders, markReminderSent, reminderText,
//   BOOKING_STATUSES }
'use strict';

const STATUSES = ['pending', 'confirmed', 'cancelled', 'done', 'no_show'];
// Transiciones válidas por estado. cancelled/done/no_show son terminales.
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['cancelled', 'done', 'no_show', 'pending'], // pending = reprogramado a confirmar
  cancelled: [],
  done: [],
  no_show: [],
};

function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_name TEXT DEFAULT '',
      customer_contact TEXT DEFAULT '',
      channel TEXT DEFAULT 'manual',
      service TEXT DEFAULT '',
      starts_at TEXT NOT NULL,
      duration_min INTEGER DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT DEFAULT '',
      previous_starts_at TEXT DEFAULT '',
      reminder_sent_at TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_user_time ON bookings(user_id, starts_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings(user_id, status)`);
  } catch (e) { /* defensivo, mismo patrón que client-digest.ensureTable */ }
}

// starts_at se guarda como ISO UTC ('2026-10-21T14:00:00.000Z'). Se acepta
// cualquier string parseable por Date; se normaliza a ISO. Sin fecha válida
// no hay turno: error explícito, nada de guardar basura.
function normStartsAt(v) {
  const d = new Date(String(v || ''));
  if (Number.isNaN(d.getTime())) throw new Error('starts_at inválido: se necesita una fecha y hora reales');
  return d.toISOString();
}

function rowToBooking(r) {
  if (!r) return null;
  return { ...r, duration_min: Number(r.duration_min || 30) };
}

function createBooking(db, userId, data) {
  ensureTable(db);
  const d = data || {};
  const service = String(d.service || '').trim();
  if (!service) throw new Error('el turno necesita un servicio');
  const startsAt = normStartsAt(d.starts_at || d.startsAt);
  const duration = Number(d.duration_min || d.durationMin || 30);
  const ins = db.prepare(
    `INSERT INTO bookings (user_id, customer_name, customer_contact, channel, service, starts_at, duration_min, status, notes)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(
    userId,
    String(d.customer_name || d.customerName || '').slice(0, 120),
    String(d.customer_contact || d.customerContact || '').slice(0, 120),
    String(d.channel || 'manual').slice(0, 24),
    service.slice(0, 160),
    startsAt,
    Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 30,
    d.autoConfirm ? 'confirmed' : 'pending',
    String(d.notes || '').slice(0, 500)
  );
  return getBooking(db, Number(ins.lastInsertRowid), userId);
}

function getBooking(db, bookingId, userId) {
  ensureTable(db);
  const r = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(bookingId, userId);
  return rowToBooking(r);
}

function listBookings(db, userId, opts) {
  ensureTable(db);
  const o = opts || {};
  const where = ['user_id = ?'];
  const args = [userId];
  if (o.status) { where.push('status = ?'); args.push(String(o.status)); }
  if (o.from) { where.push('starts_at >= ?'); args.push(normStartsAt(o.from)); }
  if (o.to) { where.push('starts_at <= ?'); args.push(normStartsAt(o.to)); }
  const limit = Math.min(Math.max(Number(o.limit || 100), 1), 500);
  return db.prepare(
    `SELECT * FROM bookings WHERE ${where.join(' AND ')} ORDER BY starts_at ASC LIMIT ?`
  ).all(...args, limit).map(rowToBooking);
}

function transition(db, bookingId, userId, to, extra) {
  const b = getBooking(db, bookingId, userId);
  if (!b) throw new Error('turno no encontrado');
  const allowed = TRANSITIONS[b.status] || [];
  if (!allowed.includes(to)) {
    throw new Error(`no se puede pasar un turno de '${b.status}' a '${to}'`);
  }
  const sets = ['status = ?', "updated_at = datetime('now')"];
  const args = [to];
  for (const [k, v] of Object.entries(extra || {})) { sets.push(`${k} = ?`); args.push(v); }
  args.push(bookingId, userId);
  db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args);
  return getBooking(db, bookingId, userId);
}

function confirmBooking(db, bookingId, userId) {
  return transition(db, bookingId, userId, 'confirmed');
}

function cancelBooking(db, bookingId, userId, reason) {
  return transition(db, bookingId, userId, 'cancelled',
    reason ? { notes: String(reason).slice(0, 500) } : {});
}

function completeBooking(db, bookingId, userId) {
  return transition(db, bookingId, userId, 'done');
}

function markNoShow(db, bookingId, userId) {
  return transition(db, bookingId, userId, 'no_show');
}

// Reprogramar: mueve la fecha, guarda la anterior (historial mínimo) y
// RESETEA el recordatorio (el aviso viejo ya no sirve). El turno vuelve a
// 'pending' salvo keepConfirmed — el anti no-show parte de que un turno
// movido se confirma de nuevo con el cliente.
function rescheduleBooking(db, bookingId, userId, newStartsAt, opts) {
  const b = getBooking(db, bookingId, userId);
  if (!b) throw new Error('turno no encontrado');
  if (!['pending', 'confirmed'].includes(b.status)) {
    throw new Error(`no se puede reprogramar un turno en estado '${b.status}'`);
  }
  const to = (opts && opts.keepConfirmed && b.status === 'confirmed') ? 'confirmed' : 'pending';
  const sets = ['starts_at = ?', 'previous_starts_at = ?', 'status = ?', 'reminder_sent_at = \'\'', "updated_at = datetime('now')"];
  const args = [normStartsAt(newStartsAt), b.starts_at, to, bookingId, userId];
  db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args);
  return getBooking(db, bookingId, userId);
}

// Anti no-show: turnos CONFIRMADOS que empiezan entre ahora y ahora +
// withinHours y todavía no recibieron recordatorio.
function dueReminders(db, userId, opts) {
  ensureTable(db);
  const o = opts || {};
  const now = o.now ? new Date(o.now) : new Date();
  const withinHours = Number(o.withinHours || 24);
  const until = new Date(now.getTime() + withinHours * 3600000);
  return db.prepare(
    `SELECT * FROM bookings WHERE user_id = ? AND status = 'confirmed'
       AND (reminder_sent_at IS NULL OR reminder_sent_at = '')
       AND starts_at >= ? AND starts_at <= ?
     ORDER BY starts_at ASC`
  ).all(userId, now.toISOString(), until.toISOString()).map(rowToBooking);
}

function markReminderSent(db, bookingId, userId, at) {
  ensureTable(db);
  const when = at ? new Date(at).toISOString() : new Date().toISOString();
  const r = db.prepare(
    `UPDATE bookings SET reminder_sent_at = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).run(when, bookingId, userId);
  return { ok: Number(r.changes) > 0 };
}

// Texto del recordatorio (puro, sin IA): nombra servicio y hora, pide
// confirmación — el anti no-show clásico. Nunca inventa datos: todo sale
// de la fila del turno. Tercer parámetro opcional: idioma de la cuenta.
function reminderText(booking, business, lang) {
  const b = booking || {};
  const when = new Date(b.starts_at || '');
  const nombre = String(b.customer_name || '').trim();
  const negocio = String(business || '').trim();
  if (lang === 'en') {
    const fecha = Number.isNaN(when.getTime()) ? ''
      : when.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const hi = nombre ? `Hi ${nombre.split(' ')[0]}!` : 'Hi there!';
    return `${hi} A quick reminder about your ${b.service || 'appointment'} ${fecha ? `on ${fecha}` : ''}${negocio ? ` at ${negocio}` : ''}. Can you confirm you are coming? That way we keep your spot 🙌`.replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  const fecha = Number.isNaN(when.getTime()) ? ''
    : when.toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const saludo = nombre ? `¡Hola ${nombre.split(' ')[0]}!` : '¡Hola!';
  return `${saludo} Te recordamos tu turno de ${b.service || 'tu servicio'} ${fecha ? `el ${fecha}` : ''}${negocio ? ` en ${negocio}` : ''}. ¿Nos confirmás que venís? Así te guardamos el lugar 🙌`.replace(/\s+/g, ' ').trim().slice(0, 300);
}

module.exports = {
  ensureTable, createBooking, getBooking, listBookings,
  confirmBooking, rescheduleBooking, cancelBooking, completeBooking, markNoShow,
  dueReminders, markReminderSent, reminderText,
  BOOKING_STATUSES: STATUSES, BOOKING_TRANSITIONS: TRANSITIONS,
};
