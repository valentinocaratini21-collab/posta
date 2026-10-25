// G-09b · Reservas por los canales de Gesty — la ACEPTACIÓN de la cola,
// ejecutable: disponibilidad leída de los turnos REALES de booking
// (cada hueco declara qué lo bloquea); la reserva se crea EN booking
// con origen «gesty» y su cola administrativa enganchada (seña solo
// si la política la define, recordatorio del día anterior); dos
// pedidos al mismo hueco — uno solo gana y el otro recibe la
// alternativa o el rechazo limpio, sin media reserva; cancelar y
// reprogramar pasan por la MATRIZ de G-09 (tarjeta + OK del dueño)
// y booking refleja el desenlace; al cumplirse el turno nace el
// borrador de G-04 enlazado por origen_ref; un tema de venta se
// deriva a Venty y Gesty NO lo resuelve; separación por cuenta y
// gating (401/403/capacidad «agenda»).
// Correr: node test-gesty-reservas-canal.js
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('child_process');

const gesty = require('./gesty');
const agenda = require('./gesty-agenda'); // ANTES que el canal: el despachador delega en G-09
const canal = require('./gesty-reservas-canal');
const presupuestos = require('./gesty-presupuestos');
const facturacion = require('./gesty-facturacion');
const booking = require('./booking');

let n = 0, fails = 0;
function ok(cond, label) {
  n++;
  if (cond) console.log(`  ✓ ${label}`);
  else { fails++; console.log(`  ✗ FALLO: ${label}`); }
}
function rechaza(fn, re, label) {
  try { fn(); ok(false, `${label} — no rechazó`); }
  catch (e) { ok(re.test(String(e.message || '')), `${label} — «${e.message}»`); }
}

const FECHA = '2026-10-24';           // sábado
const HOY = '2026-10-21';             // miércoles
const AHORA = `${HOY}T08:00:00.000Z`;

function dbNueva() {
  const db = new DatabaseSync(':memory:');
  gesty.ensureSchema(db);
  agenda.ensureSchema(db);
  canal.ensureSchema(db);
  facturacion.ensureSchema(db);
  return db;
}
function cuentaConPack(db, uid, pack) {
  gesty.setPack(db, uid, pack, { origen: 'checkout', actor: 'sistema' });
}
function eventosDe(db, uid, tipo) {
  return gesty.listEvents(db, uid, { limit: 5000 }).filter((e) => e.tipo_evento === tipo);
}
function pedidosActivos(db, uid, fecha) {
  return booking.listBookings(db, uid, { from: `${fecha}T00:00:00.000Z`, to: `${fecha}T23:59:59.999Z`, limit: 500 });
}
function politicaConSena(db, uid, porcentaje, contra) {
  return presupuestos.setPolitica(db, uid, {
    validez_dias: 10, seguimiento_dias: 2,
    sena: porcentaje ? { porcentaje, contra: contra || '' } : null,
    lista_precios: [{ descripcion: 'Corte de pelo', precio_unitario: 10000, alicuota_iva: 21 }],
  });
}

// =====================================================================
// 1 · DISPONIBILIDAD REAL — los huecos salen de los turnos de booking
// =====================================================================
console.log('\n[disponibilidad real desde booking]');
{
  const db = dbNueva();
  cuentaConPack(db, 1, 'completa');
  // Sin turnos: toda la jornada (09:00–18:00, paso 30) con duración 30.
  let disp = canal.consultarDisponibilidad(db, 1, { fecha: FECHA, hoy: HOY, ahora: AHORA });
  ok(disp.laboral === true && disp.motivo === '', 'el sábado es laboral con la configuración por defecto (declarada)');
  ok(disp.config.es_default === true, 'la jornada por defecto se DECLARA como tal (es_default)');
  ok(disp.huecos.length === 18 && disp.huecos[0].hora_inicio === '09:00' && disp.huecos[17].hora_fin === '18:00',
    `sin turnos: 18 huecos de 30 min (hubo ${disp.huecos.length})`);
  ok(disp.bloqueos.length === 0, 'sin turnos: ningún bloqueo');
  // Un turno nativo ocupa 10:00–11:00: ese hueco deja de ofrecerse y el bloqueo CITA el turno.
  const nat = booking.createBooking(db, 1, { service: 'Color', customer_name: 'Lucía', starts_at: `${FECHA}T10:00:00.000Z`, duration_min: 60, autoConfirm: true });
  disp = canal.consultarDisponibilidad(db, 1, { fecha: FECHA, hoy: HOY, ahora: AHORA });
  ok(disp.huecos.length === 16, `el turno de 10:00–11:00 saca 2 huecos (quedan ${disp.huecos.length})`);
  ok(!disp.huecos.some((h) => h.hora_inicio === '10:00' || h.hora_inicio === '10:30'), 'las 10:00 y las 10:30 ya no se ofrecen');
  ok(disp.bloqueos.length === 1 && disp.bloqueos[0].bloqueado_por.booking_id === nat.id
    && disp.bloqueos[0].bloqueado_por.cliente === 'Lucía',
  'el bloqueo declara QUÉ lo bloquea: el turno real, con su id y su cliente');
  // Con duración 60, los huecos que solapan también caen.
  const disp60 = canal.consultarDisponibilidad(db, 1, { fecha: FECHA, duracion_min: 60, hoy: HOY, ahora: AHORA });
  ok(!disp60.huecos.some((h) => h.hora_inicio === '09:30'), 'con duración 60, las 09:30 tampoco entra (solapa con el turno de las 10:00)');
  ok(disp60.huecos.some((h) => h.hora_inicio === '11:00'), 'las 11:00 sí entra con duración 60');
  // Un turno CANCELADO no bloquea; un día no laboral y una fecha pasada se declaran.
  booking.cancelBooking(db, nat.id, 1, 'se bajó');
  disp = canal.consultarDisponibilidad(db, 1, { fecha: FECHA, hoy: HOY, ahora: AHORA });
  ok(disp.huecos.length === 18 && disp.bloqueos.length === 0, 'el turno cancelado deja de bloquear');
  const domingo = canal.consultarDisponibilidad(db, 1, { fecha: '2026-10-25', hoy: HOY, ahora: AHORA });
  ok(domingo.laboral === false && domingo.motivo === 'dia-no-laboral' && domingo.huecos.length === 0,
    'el domingo (fuera de la jornada por defecto) se declara no laboral, sin huecos inventados');
  const pasado = canal.consultarDisponibilidad(db, 1, { fecha: '2026-10-20', hoy: HOY, ahora: AHORA });
  ok(pasado.motivo === 'fecha-pasada' && pasado.huecos.length === 0, 'una fecha pasada se declara como tal');
  const mismoDia = canal.consultarDisponibilidad(db, 1, { fecha: HOY, hoy: HOY, ahora: `${HOY}T10:30:00.000Z` });
  ok(mismoDia.huecos.length > 0 && mismoDia.huecos[0].hora_inicio === '11:00',
    `el mismo día, los huecos ya pasados no se ofrecen (el primero es ${mismoDia.huecos[0] && mismoDia.huecos[0].hora_inicio})`);
  // La jornada es del dueño: se guarda en el fundamento y manda.
  const cfg = canal.setConfig(db, 1, { hora_apertura: '10:00', hora_cierre: '13:00', dias_semana: [6], paso_min: 60 });
  ok(cfg.es_default === false && cfg.hora_apertura === '10:00', 'la jornada se guarda en el fundamento (reglas-dueno · reservas-canal)');
  const dispCfg = canal.consultarDisponibilidad(db, 1, { fecha: FECHA, hoy: HOY, ahora: AHORA });
  ok(dispCfg.huecos.length === 3 && dispCfg.huecos[0].hora_inicio === '10:00' && dispCfg.huecos[2].hora_inicio === '12:00',
    'con la jornada del dueño, los huecos son los suyos (10:00–13:00, paso 60, duración 30)');
  rechaza(() => canal.setConfig(db, 1, { hora_cierre: '08:00' }), /posterior/, 'un cierre anterior a la apertura se rechaza');
}

// =====================================================================
// 2 · LA TOMA — la reserva nace EN booking, con origen gesty y su cola
// =====================================================================
console.log('\n[la toma: booking + cola administrativa]');
{
  const db = dbNueva();
  cuentaConPack(db, 2, 'completa');
  politicaConSena(db, 2, 30, 'el turno');
  const r = canal.ingresarPedido(db, 2, {
    canal: 'whatsapp', intencion: 'reserva', clave_pedido: 'wa-0001',
    cliente: { nombre: 'María Pérez', contacto: 'maria@example.com' },
    servicio: 'Corte de pelo', fecha: FECHA, hora: '11:00', duracion_min: 45,
  }, { hoy: HOY, ahora: AHORA });
  ok(r.ok === true && r.derivado === false && r.duplicada === false, 'el pedido de reserva se toma');
  ok(r.booking && r.booking.channel === 'gesty', 'la reserva nace EN booking con origen «gesty»');
  ok(r.booking.status === 'confirmed', 'nace confirmada: el pedido ya trae el sí del cliente');
  ok(r.booking.customer_name === 'María Pérez' && r.booking.customer_contact === 'maria@example.com'
    && r.booking.service === 'Corte de pelo' && r.booking.duration_min === 45,
  'a nombre del cliente final, con su contacto, su servicio y su duración');
  ok(r.booking.starts_at === `${FECHA}T11:00:00.000Z`, 'en el hueco pedido (ISO UTC, el contrato de booking)');
  const enBooking = booking.listBookings(db, 2, {}).filter((b) => b.channel === 'gesty');
  ok(enBooking.length === 1 && enBooking[0].id === r.booking.id, 'booking la lista como una reserva más, distinguible solo por su origen');
  // La cola: seña según política + recordatorio + eventos durables.
  ok(r.reserva.sena.estado === 'pendiente' && r.reserva.sena.monto === 3000 && r.reserva.sena.porcentaje === 30,
    `la seña nace preparada: 30% de 10000 = ${r.reserva.sena.monto}`);
  ok(r.reserva.recordatorio.fecha === '2026-10-23' && r.reserva.recordatorio.estado === 'programado',
    'el recordatorio del día anterior queda registrado');
  ok(eventosDe(db, 2, 'reserva-creada').length === 1, 'la toma queda en el registro durable');
  ok(eventosDe(db, 2, 'reserva-sena-pendiente').length === 1, 'la seña pendiente queda en el registro durable');
  ok(eventosDe(db, 2, 'reserva-recordatorio-programado').length === 1, 'el recordatorio queda en el registro durable');
  // El turno aparece en la agenda compuesta de G-09 como cualquier turno.
  const comp = agenda.componerAgenda(db, 2, { desde: FECHA, hasta: FECHA, hoy: HOY });
  ok(comp.items.some((i) => i.fuente && i.fuente.area === 'turnos' && Number(i.fuente.id) === r.booking.id),
    'la reserva tomada se ve en la agenda compuesta de G-09 (es el mismo sistema de turnos)');
  // Idempotencia del canal: el reintento devuelve la original.
  const re = canal.ingresarPedido(db, 2, {
    canal: 'whatsapp', intencion: 'reserva', clave_pedido: 'wa-0001',
    cliente: { nombre: 'María Pérez', contacto: 'maria@example.com' },
    servicio: 'Corte de pelo', fecha: FECHA, hora: '11:00', duracion_min: 45,
  }, { hoy: HOY, ahora: AHORA });
  ok(re.ok === true && re.duplicada === true && re.reserva.id === r.reserva.id, 'el reintento con la misma clave devuelve la reserva original');
  ok(booking.listBookings(db, 2, {}).length === 1, 'el reintento NO creó un segundo turno');
  ok(eventosDe(db, 2, 'reserva-creada').length === 1, 'el reintento no duplicó eventos');
  // Validaciones del contrato.
  rechaza(() => canal.ingresarPedido(db, 2, { canal: 'whatsapp', cliente: { nombre: 'X', contacto: 'x@x' }, servicio: 'Corte', fecha: '2026-10-20', hora: '10:00' }, { hoy: HOY, ahora: AHORA }),
    /ya pasó/, 'una reserva en el pasado se rechaza');
  rechaza(() => canal.ingresarPedido(db, 2, { canal: 'whatsapp', cliente: { contacto: 'x@x' }, servicio: 'Corte', fecha: FECHA, hora: '12:00' }, { hoy: HOY, ahora: AHORA }),
    /nombre/, 'sin nombre del cliente final no hay reserva');
  rechaza(() => canal.ingresarPedido(db, 2, { canal: 'paloma', cliente: { nombre: 'X', contacto: 'x' }, servicio: 'Corte', fecha: FECHA, hora: '12:00' }, { hoy: HOY, ahora: AHORA }),
    /Canal/, 'un canal fuera del contrato se rechaza');
  rechaza(() => canal.ingresarPedido(db, 2, { canal: 'whatsapp', intencion: 'magia', cliente: { nombre: 'X', contacto: 'x' }, servicio: 'Corte', fecha: FECHA, hora: '12:00' }, { hoy: HOY, ahora: AHORA }),
    /Intención no reconocida/, 'una intención fuera del mapa se rechaza en voz alta (no se adivina)');
}

// =====================================================================
// 3 · DOS PEDIDOS AL MISMO HUECO — uno solo gana, sin media reserva
// =====================================================================
console.log('\n[dos pedidos, un hueco]');
{
  const db = dbNueva();
  cuentaConPack(db, 3, 'completa');
  const pedido = (nombre, contacto) => canal.ingresarPedido(db, 3, {
    canal: 'whatsapp', intencion: 'reserva',
    cliente: { nombre, contacto }, servicio: 'Corte de pelo', fecha: FECHA, hora: '15:00', duracion_min: 30,
  }, { hoy: HOY, ahora: AHORA });
  const primero = pedido('Ana', 'ana@example.com');
  const segundo = pedido('Beto', 'beto@example.com');
  ok(primero.ok === true, 'el primer pedido toma el hueco');
  ok(segundo.ok === false && segundo.motivo === 'hueco-ocupado', 'el segundo recibe el rechazo limpio «hueco-ocupado»');
  ok(Array.isArray(segundo.alternativas) && segundo.alternativas.length > 0
    && segundo.alternativas.every((a) => a.hora_inicio !== '15:00'),
  'y recibe alternativas reales del mismo día (ninguna es el hueco ocupado)');
  ok(pedidosActivos(db, 3, FECHA).filter((b) => b.starts_at === `${FECHA}T15:00:00.000Z`).length === 1,
    'en booking quedó UN solo turno a las 15:00: sin doble reserva');
  ok(canal.listReservas(db, 3, {}).total === 1, 'del pedido perdedor no quedó ninguna fila a medias');
  ok(eventosDe(db, 3, 'reserva-creada').length === 1, 'ni eventos a medias: la toma es atómica');
  // La carrera real: la disponibilidad dice libre, OTRO camino toma el
  // hueco, y la reverificación de adentro de la transacción frena la toma.
  const dispLibre = canal.consultarDisponibilidad(db, 3, { fecha: FECHA, hoy: HOY, ahora: AHORA });
  ok(dispLibre.huecos.some((h) => h.hora_inicio === '16:00'), 'las 16:00 figuran libres al consultar');
  booking.createBooking(db, 3, { service: 'Color', customer_name: 'Otra', starts_at: `${FECHA}T16:00:00.000Z`, duration_min: 30, autoConfirm: true });
  const tarde = canal.ingresarPedido(db, 3, {
    canal: 'llamada', intencion: 'reserva', cliente: { nombre: 'Caro', contacto: 'caro@example.com' },
    servicio: 'Corte de pelo', fecha: FECHA, hora: '16:00',
  }, { hoy: HOY, ahora: AHORA });
  ok(tarde.ok === false && tarde.motivo === 'hueco-ocupado',
    'si el hueco se ocupó entre la consulta y la toma, la reverificación atómica lo frena igual');
  ok(!booking.listBookings(db, 3, {}).some((b) => b.customer_contact === 'caro@example.com'), 'el pedido frenado no creó turno alguno');
  // Dos tomas directas seguidas al mismo hueco (síncrono = la misma carrera).
  const t1 = canal.ingresarPedido(db, 3, { canal: 'llamada', cliente: { nombre: 'Dani', contacto: 'dani@example.com' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '17:00' }, { hoy: HOY, ahora: AHORA });
  const t2 = canal.ingresarPedido(db, 3, { canal: 'llamada', cliente: { nombre: 'Eli', contacto: 'eli@example.com' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '17:00' }, { hoy: HOY, ahora: AHORA });
  ok(t1.ok === true && t2.ok === false && t2.motivo === 'hueco-ocupado', 'dos tomas directas al mismo hueco: gana una sola');
  ok(pedidosActivos(db, 3, FECHA).filter((b) => b.starts_at === `${FECHA}T17:00:00.000Z`).length === 1, 'booking confirma: un solo turno a las 17:00');
  // Un hueco que SOLAPA parcialmente también está ocupado.
  const solapa = canal.ingresarPedido(db, 3, { canal: 'whatsapp', cliente: { nombre: 'Fer', contacto: 'fer@example.com' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '17:15', duracion_min: 30 }, { hoy: HOY, ahora: AHORA });
  ok(solapa.ok === false && solapa.motivo === 'hueco-ocupado', 'un pedido que solapa parcialmente (17:15 sobre el turno de 17:00–17:30) también se frena');
}

// =====================================================================
// 4 · LA SEÑA — solo si la política la define; nunca un cobro inventado
// =====================================================================
console.log('\n[la seña y la política]');
{
  const db = dbNueva();
  cuentaConPack(db, 4, 'completa');
  // Sin política de seña: la reserva nace sin ningún ítem de cobro.
  presupuestos.setPolitica(db, 4, { validez_dias: 10, seguimiento_dias: 2, sena: null, lista_precios: [{ descripcion: 'Corte de pelo', precio_unitario: 10000, alicuota_iva: 21 }] });
  const sin = canal.ingresarPedido(db, 4, { canal: 'whatsapp', cliente: { nombre: 'Ana', contacto: 'ana@x' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '10:00' }, { hoy: HOY, ahora: AHORA });
  ok(sin.ok && sin.reserva.sena.estado === 'sin-sena' && sin.reserva.sena.monto === null,
    'sin política de seña: la reserva no genera ningún ítem de cobro');
  ok(eventosDe(db, 4, 'reserva-sena-pendiente').length === 0, 'y no hay evento de seña');
  // Con política pero SIN precio del servicio: el monto NO se inventa.
  politicaConSena(db, 4, 50, 'el turno');
  const sinPrecio = canal.ingresarPedido(db, 4, { canal: 'whatsapp', cliente: { nombre: 'Beto', contacto: 'beto@x' }, servicio: 'Peinado de fiesta', fecha: FECHA, hora: '11:00' }, { hoy: HOY, ahora: AHORA });
  ok(sinPrecio.ok && sinPrecio.reserva.sena.estado === 'pendiente' && sinPrecio.reserva.sena.monto === null
    && /sin-precio/.test(sinPrecio.reserva.sena.motivo),
  'política sin precio del servicio: seña pendiente SIN monto y con el motivo (no se inventa)');
  // Con política y precio: el monto sale de la lista del fundamento.
  const con = canal.ingresarPedido(db, 4, { canal: 'llamada', cliente: { nombre: 'Caro', contacto: 'caro@x' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '12:00' }, { hoy: HOY, ahora: AHORA });
  ok(con.ok && con.reserva.sena.monto === 5000, `con política y precio: 50% de 10000 = ${con.reserva.sena.monto}`);
  // La seña registrada NO es una factura ni un cobro: cero facturas creadas.
  ok(facturacion.listFacturas(db, 4, {}).total === 0, 'la seña registrada no creó ninguna factura (no es un cobro: es el registro durable)');
  const res = canal.resumenReservasCanal(db, 4, { hoy: HOY });
  ok(res.senas_pendientes.cantidad === 2 && res.senas_pendientes.monto_conocido === 5000 && res.senas_pendientes.sin_monto === 1,
    'el resumen declara las señas pendientes: 2, con 5000 conocidos y 1 sin monto');
}

// =====================================================================
// 5 · CANCELAR / REPROGRAMAR — la matriz de G-09 manda
// =====================================================================
console.log('\n[cancelar y reprogramar por la matriz]');
{
  const db = dbNueva();
  cuentaConPack(db, 5, 'completa');
  politicaConSena(db, 5, 30, 'el turno');
  const r = canal.ingresarPedido(db, 5, {
    canal: 'whatsapp', cliente: { nombre: 'María Pérez', contacto: 'maria@example.com' },
    servicio: 'Corte de pelo', fecha: FECHA, hora: '11:00', duracion_min: 30,
  }, { hoy: HOY, ahora: AHORA });
  const rid = r.reserva.id, bid = r.booking.id;

  // Cancelar SIN OK: la tarjeta nace y el turno no se toca.
  const pc = canal.pedirCancelacion(db, 5, rid, { motivo: 'la clienta avisó que no puede' });
  ok(pc.aplicado === false && pc.requiere_ok === true && pc.tarjeta && pc.tarjeta.tipo === 'compromiso-cancelar',
    'la cancelación nace como tarjeta compromiso-cancelar de la matriz');
  ok(pc.tarjeta.detalle.booking_id === bid && pc.tarjeta.detalle.fecha === FECHA && pc.tarjeta.detalle.hora === '11:00',
    'la tarjeta trae el cambio completo: el turno, su día y su hora');
  ok(booking.getBooking(db, bid, 5).status === 'confirmed', 'sin OK del dueño el turno sigue firme');
  const dup = canal.pedirCancelacion(db, 5, rid, {});
  ok(dup.ya_preparada === true && dup.tarjeta.id === pc.tarjeta.id, 'una segunda preparación devuelve la misma tarjeta viva (no se duplican tarjetas)');
  // Con el OK: booking refleja el desenlace y la cola se cierra.
  const cardV = gesty.getCard(db, 5, pc.tarjeta.id);
  const res = gesty.approveCard(db, 5, pc.tarjeta.id, { version_documento: cardV.version_documento, usuario: 'dueno' });
  ok(res.ok === true && gesty.getCard(db, 5, pc.tarjeta.id).estado === 'aprobada', 'el OK ejecuta la cancelación por la vía de la fundación');
  ok(booking.getBooking(db, bid, 5).status === 'cancelled', 'la reserva en booking refleja el desenlace: cancelada');
  const rv = canal.getReserva(db, 5, rid);
  ok(rv.estado === 'cancelada' && rv.recordatorio.estado === 'cancelado' && rv.sena.estado === 'anulada',
    'la fila refleja el desenlace y su cola se cierra (recordatorio cancelado, seña anulada)');
  ok(eventosDe(db, 5, 'reserva-cancelada').length === 1, 'la cancelación aplicada queda en el registro durable');
  const disp = canal.consultarDisponibilidad(db, 5, { fecha: FECHA, hoy: HOY, ahora: AHORA });
  ok(disp.huecos.some((h) => h.hora_inicio === '11:00'), 'el hueco cancelado vuelve a ofrecerse');

  // Reprogramar: la tarjeta trae de→a; sin OK no se mueve; con OK, se mueve.
  const r2 = canal.ingresarPedido(db, 5, {
    canal: 'llamada', cliente: { nombre: 'Sofía', contacto: 'sofia@example.com' },
    servicio: 'Corte de pelo', fecha: FECHA, hora: '12:00', duracion_min: 30,
  }, { hoy: HOY, ahora: AHORA });
  rechaza(() => canal.pedirReprogramacion(db, 5, r2.reserva.id, { fecha: FECHA, hora: '12:00' }, { hoy: HOY, ahora: AHORA }),
    /ya está en esa fecha/, 'reprogramar al mismo horario se rechaza');
}
{
  // (bloque aparte: el hueco de las 11:00 quedó libre en el bloque de
  // arriba por la cancelación; acá el ocupado es un turno vigente)
  const db = dbNueva();
  cuentaConPack(db, 55, 'completa');
  canal.ingresarPedido(db, 55, { canal: 'whatsapp', cliente: { nombre: 'A', contacto: 'a@x' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '11:00' }, { hoy: HOY, ahora: AHORA });
  const rB = canal.ingresarPedido(db, 55, { canal: 'whatsapp', cliente: { nombre: 'B', contacto: 'b@x' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '12:00' }, { hoy: HOY, ahora: AHORA });
  rechaza(() => canal.pedirReprogramacion(db, 55, rB.reserva.id, { fecha: FECHA, hora: '11:00' }, { hoy: HOY, ahora: AHORA }),
    /hueco nuevo está ocupado/, 'reprogramar a un hueco ocupado se frena ANTES de preparar la tarjeta');
  const pm = canal.pedirReprogramacion(db, 55, rB.reserva.id, { fecha: FECHA, hora: '13:00', motivo: 'pidió más tarde' }, { hoy: HOY, ahora: AHORA });
  ok(pm.requiere_ok === true && pm.tarjeta.tipo === 'compromiso-mover'
    && pm.tarjeta.detalle.de.hora === '12:00' && pm.tarjeta.detalle.a.hora === '13:00',
  'la reprogramación nace como tarjeta compromiso-mover con el cambio completo (de → a)');
  ok(booking.getBooking(db, rB.booking.id, 55).starts_at === `${FECHA}T12:00:00.000Z`, 'sin OK, el turno no se movió');
  const cardV = gesty.getCard(db, 55, pm.tarjeta.id);
  const res2 = gesty.approveCard(db, 55, pm.tarjeta.id, { version_documento: cardV.version_documento, usuario: 'dueno' });
  ok(res2.ok === true && gesty.getCard(db, 55, pm.tarjeta.id).estado === 'aprobada', 'el OK ejecuta el movimiento');
  const movido = booking.getBooking(db, rB.booking.id, 55);
  ok(movido.starts_at === `${FECHA}T13:00:00.000Z` && movido.status === 'confirmed',
    'booking refleja el desenlace: el turno está a las 13:00 y sigue confirmado');
  const rvB = canal.getReserva(db, 55, rB.reserva.id);
  ok(rvB.fecha === FECHA && rvB.hora === '13:00' && rvB.recordatorio.fecha === '2026-10-23',
    'la fila lee el horario nuevo del turno y el recordatorio sigue siendo el día anterior');
  ok(eventosDe(db, 55, 'reserva-reprogramada').length === 1, 'el movimiento aplicado queda en el registro durable');
  // El despachador NO rompe a G-09: un compromiso PROPIO sigue por su ejecutor.
  const ev = agenda.crearEvento(db, 55, { titulo: 'Pagar AFIP', fecha: FECHA }, { hoy: HOY }).evento;
  const cardEv = gesty.createCard(db, 55, {
    tipo: 'compromiso-mover', titulo: 'Mover «Pagar AFIP»',
    detalle: { evento_id: ev.id, titulo: ev.titulo, de: { fecha: ev.fecha, hora: ev.hora || '' }, a: { fecha: '2026-10-26', hora: ev.hora || '' }, motivo: '' },
    creado_por: 'gesty',
  });
  const cardEvV = gesty.getCard(db, 55, cardEv.id);
  const resEv = gesty.approveCard(db, 55, cardEv.id, { version_documento: cardEvV.version_documento, usuario: 'dueno' });
  ok(resEv.ok === true && eventosDe(db, 55, 'agenda-evento-movido').length >= 1,
    'con el despachador cargado, un compromiso propio de G-09 se mueve por SU ejecutor (delegación intacta)');
  ok(agenda.getEvento(db, 55, ev.id).fecha === '2026-10-26', 'el compromiso propio quedó movido como siempre');
}

// =====================================================================
// 6 · TURNO CUMPLIDO → el borrador de factura nace enlazado (G-04)
// =====================================================================
console.log('\n[turno cumplido → borrador enlazado]');
{
  const db = dbNueva();
  cuentaConPack(db, 6, 'completa');
  politicaConSena(db, 6, null, '');
  gesty.setData(db, 6, {
    grupo: 'clientes-facturacion', campo: 'maria-example-com',
    valor: { nombre: 'María Pérez', email: 'maria@example.com', cuit: '27-20333444-9' },
    origen: 'dueno', origen_ref: 'prueba-gesty-reservas', cargado_por: 'dueno',
  });
  const r = canal.ingresarPedido(db, 6, {
    canal: 'whatsapp', cliente: { nombre: 'María Pérez', contacto: 'maria@example.com' },
    servicio: 'Corte de pelo', fecha: FECHA, hora: '11:00',
  }, { hoy: HOY, ahora: AHORA });
  // Todavía no se cumplió: nada nace.
  let proc = canal.procesarCumplidas(db, 6, { hoy: HOY });
  ok(proc.creadas.length === 0 && facturacion.listFacturas(db, 6, {}).total === 0, 'antes de cumplirse el turno, ningún borrador nace');
  booking.completeBooking(db, r.booking.id, 6);
  ok(canal.getReserva(db, 6, r.reserva.id).estado === 'cumplida', 'la fila espeja el turno cumplido');
  proc = canal.procesarCumplidas(db, 6, { hoy: FECHA });
  ok(proc.creadas.length === 1, 'al cumplirse, el borrador nace');
  const f = facturacion.getFactura(db, 6, proc.creadas[0].factura_id);
  ok(f && f.estado === 'borrador', 'nace como BORRADOR (no se emite solo)');
  ok(f.origen.tipo === 'reserva-canal' && f.origen.ref === String(r.booking.id),
    'enlazado a la reserva por el acople de G-04 (origen_ref = el turno)');
  ok(f.cliente.nombre === 'María Pérez' && f.total === 12100,
    `con el cliente del fundamento y el precio de la lista: total ${f.total} (10000 + IVA 21%)`);
  const rv = canal.getReserva(db, 6, r.reserva.id);
  ok(rv.factura.estado === 'borrador-creado' && rv.factura.id === f.id, 'la fila declara su borrador');
  ok(eventosDe(db, 6, 'reserva-factura-creada').length === 1, 'el nacimiento del borrador queda registrado');
  const proc2 = canal.procesarCumplidas(db, 6, { hoy: FECHA });
  ok(proc2.creadas.length === 0 && facturacion.listFacturas(db, 6, {}).total === 1, 'reprocesar no duplica el borrador');
  // Cliente NO identificable: el borrador NO se inventa — queda pendiente con su motivo.
  const r2 = canal.ingresarPedido(db, 6, {
    canal: 'llamada', cliente: { nombre: 'Desconocida Total', contacto: 'nadie@example.com' },
    servicio: 'Corte de pelo', fecha: FECHA, hora: '12:00',
  }, { hoy: HOY, ahora: AHORA });
  booking.completeBooking(db, r2.booking.id, 6);
  const proc3 = canal.procesarCumplidas(db, 6, { hoy: FECHA });
  ok(proc3.creadas.length === 0 && proc3.pendientes.length === 1 && /no está identificado/.test(proc3.pendientes[0].motivo),
    'sin cliente en el fundamento: el borrador queda pendiente con el motivo (ni cliente ni factura se inventan)');
  ok(facturacion.listFacturas(db, 6, {}).total === 1, 'y ninguna factura apareció de la nada');
  const rv2 = canal.getReserva(db, 6, r2.reserva.id);
  ok(rv2.factura.estado === 'pendiente', 'la fila declara el pendiente');
  // Cuando la pieza aparece, el reintento lo completa.
  gesty.setData(db, 6, {
    grupo: 'clientes-facturacion', campo: 'nadie-example-com',
    valor: { nombre: 'Desconocida Total', email: 'nadie@example.com' },
    origen: 'dueno', origen_ref: 'ajustes-clientes', cargado_por: 'dueno',
  });
  const proc4 = canal.procesarCumplidas(db, 6, { hoy: FECHA, reintentar: true });
  ok(proc4.creadas.length === 1 && facturacion.listFacturas(db, 6, {}).total === 2,
    'con el cliente ya en el fundamento, el reintento crea el borrador pendiente');
}

// =====================================================================
// 7 · DERIVACIÓN POR FRONTERA — venta a Venty, queja a Atenty
// =====================================================================
console.log('\n[derivación por frontera]');
{
  const db = dbNueva();
  cuentaConPack(db, 7, 'completa');
  const venta = canal.ingresarPedido(db, 7, {
    canal: 'whatsapp', intencion: 'venta', cliente: { nombre: 'Pedro', contacto: 'pedro@x' },
    texto: 'quiero comprar dos shampoo para revender',
  }, { hoy: HOY, ahora: AHORA });
  ok(venta.ok === true && venta.derivado === true && venta.destino === 'venty', 'un tema de venta se deriva a Venty');
  ok(venta.reserva.estado === 'derivada' && venta.reserva.agente_destino === 'venty' && !venta.reserva.booking_id,
    'queda registrado como derivado, sin turno alguno');
  const queja = canal.ingresarPedido(db, 7, {
    canal: 'llamada', intencion: 'queja', cliente: { nombre: 'Luisa', contacto: 'luisa@x' },
    texto: 'el color me quedó mal, quiero que lo vean',
  }, { hoy: HOY, ahora: AHORA });
  ok(queja.derivado === true && queja.destino === 'atenty', 'un tema de queja/cuidado se deriva a Atenty');
  ok(booking.listBookings(db, 7, {}).length === 0, 'Gesty no resolvió ninguno de los dos: cero turnos creados');
  ok(eventosDe(db, 7, 'reserva-pedido-derivado').length === 2, 'ambas derivaciones quedan en el registro durable');
  ok(eventosDe(db, 7, 'reserva-creada').length === 0, 'ninguna derivación se disfrazó de reserva');
  const res = canal.resumenReservasCanal(db, 7, { hoy: HOY });
  ok(res.derivadas.total === 2 && res.derivadas.a_venty === 1 && res.derivadas.a_atenty === 1 && res.activas === 0,
    'el resumen declara los derivados por destino');
  const lista = canal.listReservas(db, 7, { estado: 'derivada' });
  ok(lista.total === 2, 'las consultas por estado encuentran los derivados');
  rechaza(() => canal.pedirCancelacion(db, 7, venta.reserva.id, {}), /no es una reserva tomada/,
    'un derivado no se cancela como si fuera una reserva');
}

// =====================================================================
// 8 · SEPARACIÓN POR CUENTA — nada se cruza
// =====================================================================
console.log('\n[separación por cuenta]');
{
  const db = dbNueva();
  cuentaConPack(db, 8, 'completa');
  cuentaConPack(db, 9, 'completa');
  const r8 = canal.ingresarPedido(db, 8, { canal: 'whatsapp', cliente: { nombre: 'De Ocho', contacto: 'ocho@x' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '10:00' }, { hoy: HOY, ahora: AHORA });
  ok(r8.ok === true, 'la cuenta 8 toma su reserva');
  const r9 = canal.ingresarPedido(db, 9, { canal: 'whatsapp', cliente: { nombre: 'De Nueve', contacto: 'nueve@x' }, servicio: 'Corte de pelo', fecha: FECHA, hora: '10:00' }, { hoy: HOY, ahora: AHORA });
  ok(r9.ok === true, 'la misma hora en OTRA cuenta no choca: los huecos son por cuenta');
  ok(canal.getReserva(db, 9, r8.reserva.id) === null, 'la cuenta 9 no ve la reserva de la 8');
  ok(canal.listReservas(db, 9, {}).total === 1 && canal.listReservas(db, 8, {}).total === 1, 'cada cuenta lista solo lo suyo');
  rechaza(() => canal.pedirCancelacion(db, 9, r8.reserva.id, {}), /no es de esta cuenta/, 'la cuenta 9 no puede cancelar la reserva de la 8');
}

// =====================================================================
// 9 · CABLEADO EN server.js — rutas detrás de sesión + pack + «agenda»
// =====================================================================
console.log('\n[cableado en server.js]');
{
  const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  ok(src.includes("require('./gesty-reservas-canal')"), 'server.js carga el módulo de reservas del canal');
  ok(src.includes("gesty.capacidadMiddleware(db, 'agenda')]\napp.get('/api/gesty/reservas-canal/disponibilidad'")
    || src.includes("capacidadMiddleware(db, 'agenda')"), 'las rutas van detrás de la capacidad «agenda»');
  ok(src.includes("app.post('/api/gesty/reservas-canal/pedidos'"), 'la ruta de ingesta existe');
  ok(src.includes("app.post('/api/gesty/reservas-canal/procesar-cumplidas'"), 'la ruta de cumplidas existe');
  ok(!/gesty-reservas-canal/.test(src.split('const gestyReservas =')[0] || ''), 'el módulo G-14 (website) no se tocó');
}

// =====================================================================
// 10 · HTTP — gating real: 401 sin sesión, 403 sin pack, 403 Esencial
// =====================================================================
const PORT = 3988;
async function http(method, p, { cookie, body } = {}) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, json, cookie: sid };
}

async function httpYFin() {
  console.log('\n[http: gating y flujo por la API]');
  const dir = fs.mkdtempSync('/tmp/posta-gesty-reservas-canal-');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: dir, NODE_ENV: 'test',
    EMAIL_PROVIDER: 'none', PUSH_PROVIDER: 'none',
    ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  try {
    let listo = false;
    for (let i = 0; i < 60 && !listo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { const v = await fetch(`http://127.0.0.1:${PORT}/api/version`); listo = v.ok; } catch (e) { /* sigue */ }
    }
    ok(listo, 'el servidor levanta con el módulo cargado');
    if (!listo) { console.log(bootLog.slice(-2000)); return; }

    const anon = await http('GET', `/api/gesty/reservas-canal/disponibilidad?fecha=${FECHA}`);
    ok(anon.status === 401, `sin sesión: 401 (fue ${anon.status})`);

    async function alta(email) {
      const r = await http('POST', '/api/auth/register', { body: { email, password: 'clave-larga-123', name: 'Peluquería Test' } });
      assert.strictEqual(r.status, 200, `alta ${email}: ${JSON.stringify(r.json).slice(0, 200)}`);
      assert.ok(r.cookie, `alta ${email}: sin cookie de sesión`);
      return r.cookie;
    }
    const { DatabaseSync: DBS } = require('node:sqlite');
    const fileDb = new DBS(path.join(dir, 'posta.db'));
    fileDb.exec('PRAGMA busy_timeout = 5000');
    function ponerPack(email, pack) {
      const u = fileDb.prepare('SELECT id FROM users WHERE email = ?').get(email);
      fileDb.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, pack);
      return u.id;
    }

    // Sin pack: el middleware de Gesty frena todo (módulo apagado).
    const tokSin = await alta('reserva-sin-pack@example.com');
    const sinPack = await http('GET', `/api/gesty/reservas-canal/disponibilidad?fecha=${FECHA}`, { cookie: tokSin });
    ok(sinPack.status === 403, `sin pack Gesty: 403 (fue ${sinPack.status})`);

    // Esencial: NO tiene la capacidad «agenda» → 403 de capacidad.
    const tokEsc = await alta('reserva-esencial@example.com');
    ponerPack('reserva-esencial@example.com', 'esencial');
    const esc = await http('GET', `/api/gesty/reservas-canal/disponibilidad?fecha=${FECHA}`, { cookie: tokEsc });
    ok(esc.status === 403 && /agenda/.test(`${esc.json.error || ''} ${esc.json.message || ''}`),
      `con Esencial (sin «agenda»): 403 de capacidad (fue ${esc.status})`);

    // Completa: disponibilidad, toma, derivación y resumen por HTTP.
    const tokCom = await alta('reserva-completa@example.com');
    const uidCom = ponerPack('reserva-completa@example.com', 'completa');
    politicaConSena(fileDb, uidCom, 30, 'el turno');
    gesty.setData(fileDb, uidCom, {
      grupo: 'clientes-facturacion', campo: 'maria-example-com',
      valor: { nombre: 'María Pérez', email: 'maria@example.com' },
      origen: 'dueno', origen_ref: 'ajustes-clientes', cargado_por: 'dueno',
    });
    const disp = await http('GET', `/api/gesty/reservas-canal/disponibilidad?fecha=${FECHA}&hoy=${HOY}&ahora=${encodeURIComponent(AHORA)}`, { cookie: tokCom });
    ok(disp.status === 200 && disp.json.disponibilidad.huecos.length === 18,
      `con Completa: la disponibilidad responde ${disp.json.disponibilidad ? disp.json.disponibilidad.huecos.length : '?'} huecos`);
    const toma = await http('POST', `/api/gesty/reservas-canal/pedidos?hoy=${HOY}&ahora=${encodeURIComponent(AHORA)}`, {
      cookie: tokCom,
      body: {
        canal: 'whatsapp', intencion: 'reserva', clave_pedido: 'http-0001',
        cliente: { nombre: 'María Pérez', contacto: 'maria@example.com' },
        servicio: 'Corte de pelo', fecha: FECHA, hora: '11:00',
      },
    });
    ok(toma.status === 200 && toma.json.resultado.ok === true && toma.json.resultado.booking.channel === 'gesty',
      'la toma por HTTP crea la reserva en booking con origen gesty');
    ok(toma.json.resultado.reserva.sena.monto === 3000, 'la seña viaja en la respuesta (30% de 10000)');
    const rid = toma.json.resultado.reserva.id;
    const disp2 = await http('GET', `/api/gesty/reservas-canal/disponibilidad?fecha=${FECHA}&hoy=${HOY}&ahora=${encodeURIComponent(AHORA)}`, { cookie: tokCom });
    ok(disp2.json.disponibilidad.huecos.length === 17
      && disp2.json.disponibilidad.bloqueos.length === 1,
    'tras la toma, la disponibilidad ya declara el bloqueo del turno creado');
    const deriv = await http('POST', `/api/gesty/reservas-canal/pedidos?hoy=${HOY}&ahora=${encodeURIComponent(AHORA)}`, {
      cookie: tokCom, body: { canal: 'whatsapp', intencion: 'venta', cliente: { nombre: 'Pedro', contacto: 'p@x' }, texto: 'quiero comprar' },
    });
    ok(deriv.status === 200 && deriv.json.resultado.derivado === true && deriv.json.resultado.destino === 'venty',
      'la derivación por HTTP llega a Venty sin crear turno');
    const lista = await http('GET', '/api/gesty/reservas-canal', { cookie: tokCom });
    ok(lista.status === 200 && lista.json.total === 2, `la lista por HTTP trae la toma y la derivada (total ${lista.json.total})`);
    const resumen = await http('GET', `/api/gesty/reservas-canal/resumen?hoy=${HOY}`, { cookie: tokCom });
    ok(resumen.status === 200 && resumen.json.resumen.activas === 1 && resumen.json.resumen.derivadas.a_venty === 1,
      'el resumen por HTTP declara 1 activa y 1 derivada');
    const una = await http('GET', `/api/gesty/reservas-canal/${rid}`, { cookie: tokCom });
    ok(una.status === 200 && una.json.reserva.id === rid, 'la consulta individual responde');
    const ajena = await http('GET', `/api/gesty/reservas-canal/${rid}`, { cookie: tokEsc });
    ok(ajena.status === 403, 'otra cuenta (Esencial) ni siquiera pasa la capacidad');
    fileDb.close();
  } finally {
    child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

httpYFin()
  .catch((e) => { fails++; console.log('  ✗ FALLO HTTP:', e.message); })
  .finally(() => {
    console.log(`\n${n - fails}/${n} verificaciones OK · ${fails} fallos`);
    process.exit(fails ? 1 : 0);
  });
