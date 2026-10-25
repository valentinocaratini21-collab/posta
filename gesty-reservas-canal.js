// =====================================================================
// GESTY · G-09b — RESERVAS POR LOS CANALES DE GESTY (la capacidad)
// Spec: gesty-cola-builds.md G-09b (DECISIÓN de Valentino, 2026-10-24)
// + gesty-g02-build-spec.md §11 (registro de fronteras) +
// gesty-sistema-operativo.md §2.4/§5 (matriz de compromisos).
//
// QUÉ ES ESTE BUILD: la CAPACIDAD de agenda, del lado servidor.
// Cuando el pedido de un cliente final entra por los canales de
// Gesty (el WhatsApp del negocio desde Completa, las llamadas en
// Total), Gesty TOMA la reserva. La conversación que habla con el
// cliente NO vive acá: llega con G-12 (WhatsApp) y G-13 (llamadas)
// y va a llamar a ESTAS funciones. Acá no hay transporte.
//
// EL SISTEMA DE TURNOS ES booking.js — JAMÁS UNO PARALELO (la
// frontera que fijó Valentino): la disponibilidad se lee de los
// turnos reales de booking y la reserva se CREA con
// booking.createBooking, con channel 'gesty' como su origen durable
// (la reserva es indistinguible de una nativa salvo por ese origen
// y por la fila de este módulo, que guarda el vínculo y la cola
// administrativa). Una reserva que no nace por Gesty no gana ni
// pierde nada: este módulo no toca filas ajenas.
//
// LA JORNADA: booking.js no define horarios de atención (un turno
// puede nacer a cualquier hora), así que la ventana de huecos sale
// del fundamento del dueño (grupo reglas-dueno, campo
// «reservas-canal») con defaults DECLARADOS en cada respuesta
// (09:00–18:00, lunes a sábado, paso 30 min) — el mismo patrón de
// defaults visibles de G-09 (anticipación) y G-16 (umbrales). La
// agenda de turnos es UNA (booking.js no modela recursos ni
// profesionales): todo turno activo bloquea su ventana, sea del
// servicio que sea, y cada bloqueo cita el turno que lo ocupa.
//
// SIN DOBLE RESERVA: verificar el hueco y crear la reserva es UN
// acto atómico — BEGIN IMMEDIATE (el precedente de server.js) con la
// reverificación ADENTRO de la transacción. Dos pedidos al mismo
// hueco: gana el primero; el segundo recibe el rechazo limpio con
// las alternativas reales de ese día. La ingesta acepta además una
// clave de pedido (clave_pedido) como idempotencia: el reintento
// del canal devuelve la reserva original, no crea otra.
//
// LA COLA ADMINISTRATIVA (lo que la reserva engancha sola):
// · SEÑA — la política de seña es UNA y vive en el fundamento
//   (grupo reglas-cobro, campo politica_sena: la misma de
//   Presupuestos G-08) y el precio sale de la lista del fundamento.
//   Para un cliente de canal no hay circuito de cobro limpio: G-04
//   exige un cliente identificable en clientes-facturacion y G-05
//   cobra facturas ENVIADAS — facturar o cobrar una seña por esta
//   vía sería inventar un cobro. Entonces la seña queda como
//   REGISTRO DURABLE «seña pendiente» (monto calculado cuando hay
//   precio; sin precio, el monto queda vacío y el motivo lo dice:
//   no se inventa). El dueño la cobra por su circuito.
// · RECORDATORIO — el del día anterior queda registrado al crear
//   (fecha + estado en la fila y su evento). El turno además ya
//   vive en la agenda compuesta de G-09 y, al nacer confirmado,
//   en el anti no-show de booking (dueReminders).
// · FACTURA — al cumplirse el turno, procesarCumplidas crea el
//   BORRADOR de G-04 enlazado por el acople (origen
//   {tipo: 'reserva-canal', ref: booking_id}), SIN emitirse solo.
//   Solo si el cliente se identifica en clientes-facturacion Y el
//   servicio tiene precio en la lista: si falta alguna de las dos
//   piezas, queda «pendiente» con el motivo — ni cliente ni precio
//   se inventan jamás.
//
// CANCELAR / REPROGRAMAR (matriz de G-09): una reserva del canal
// toca a un cliente, así que el cambio nace como tarjeta de la
// matriz (compromiso-cancelar / compromiso-mover) con el cambio
// COMPLETO y SOLO se aplica tras el OK del dueño; la reserva en
// booking refleja el desenlace. Como las tarjetas son de la matriz
// de G-09 pero su entidad es un turno (no un evento propio), los
// ejecutores de esos dos tipos pasan a ser un DESPACHADOR que este
// módulo registra AL CARGARSE — por eso server.js lo requiere
// DESPUÉS de gesty-agenda: si la tarjeta trae booking_id, aplica
// sobre booking; si no, DELEGA en los ejecutores de G-09
// (exportados por gesty-agenda), cuyo comportamiento queda
// intacto. Sin OK no se mueve ni se cancela nada (testeado).
//
// DERIVACIÓN POR FRONTERA (§11): la ingesta clasifica el pedido
// SOLO para enrutarlo, por la INTENCIÓN DECLARADA en el contrato
// (mapa fijo INTENCIONES, sin clasificador mágico): reserva/agenda
// sigue; venta → derivado a Venty; queja/cuidado → derivado a
// Atenty. El derivado queda registrado con su evento y Gesty NO
// lo resuelve. Una intención fuera del mapa se rechaza en voz
// alta: no se adivina el destino de un pedido.
//
// LA TARJETA «hueco-ofrecer» sigue sin ejecutor en este build: su
// acto es la conversación con el cliente (G-12/G-13). Acá vive la
// capacidad que esa conversación va a usar (disponibilidad real +
// toma atómica + cola administrativa).
//
// RELOJ INYECTABLE: toda función pública acepta opts.hoy
// (AAAA-MM-DD) y opts.ahora (ISO); ningún cálculo de pasado usa la
// fecha del sistema cuando el llamador pasó la suya. Las semillas
// y los turnos viven en ISO UTC (el contrato de booking.js).
// =====================================================================
'use strict';

const gesty = require('./gesty');
const agenda = require('./gesty-agenda');
const presupuestos = require('./gesty-presupuestos');
const facturacion = require('./gesty-facturacion');
const booking = require('./booking');

// ---------------------------------------------------------------------------
// Utilidades (el patrón de la casa: cada módulo trae las suyas)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function esHora(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || '')); }
function addDias(iso, n) {
  const t = Date.parse(String(iso).slice(0, 10)) + Number(n) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function minutosDe(hora) { const p = String(hora || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
function horaDeMinutos(min) {
  const h = Math.floor(Number(min) / 60); const m = Number(min) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
// La convención de la casa (booking.js guarda ISO UTC; la agenda de
// G-09 lee fecha/hora cortando el string): fecha = chars 0-10, hora
// = chars 11-16 del ISO guardado. Todo este módulo trabaja así.
function fechaDeIso(iso) { return String(iso || '').slice(0, 10); }
function horaDeIso(iso) { const h = String(iso || '').slice(11, 16); return esHora(h) ? h : ''; }
function isoDe(fecha, hora) { return `${fecha}T${hora}:00.000Z`; }
function msDe(fecha, minutos) { return Date.parse(`${fecha}T00:00:00.000Z`) + Number(minutos) * 60000; }
function diaSemanaDe(fecha) { return new Date(`${fecha}T00:00:00.000Z`).getUTCDay(); }
function normNombre(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
// El reloj del llamador manda: opts.ahora (ISO) u opts.hoy (fecha);
// sin ninguno, el del sistema.
function ahoraDe(opts) {
  const o = opts || {};
  if (o.ahora && !Number.isNaN(Date.parse(String(o.ahora)))) return new Date(String(o.ahora)).toISOString();
  if (esFechaISO(o.hoy)) return `${String(o.hoy)}T00:00:00.000Z`;
  return new Date().toISOString();
}
function hoyDe(opts) {
  const o = opts || {};
  if (esFechaISO(o.hoy)) return String(o.hoy);
  return fechaDeIso(ahoraDe(o)) || hoyISO();
}

// Los canales del contrato (G-12 WhatsApp · G-13 llamadas). El
// transporte llega con esos builds; la ingesta valida el canal
// declarado, no lo transporta.
const CANALES = ['whatsapp', 'llamada'];
// Clasificación DECLARADA del pedido entrante (solo enrutamiento):
// la intención viene en el contrato; este mapa es toda la «magia»
// que hay — y está a la vista.
const INTENCIONES = {
  reserva: { tipo: 'reserva' },
  turno: { tipo: 'reserva' },
  agenda: { tipo: 'reserva' },
  venta: { tipo: 'derivada', agente: 'venty' },
  ventas: { tipo: 'derivada', agente: 'venty' },
  queja: { tipo: 'derivada', agente: 'atenty' },
  reclamo: { tipo: 'derivada', agente: 'atenty' },
  cuidado: { tipo: 'derivada', agente: 'atenty' },
  atencion: { tipo: 'derivada', agente: 'atenty' },
};
const ESTADOS_RESERVA = ['tomada', 'derivada', 'cancelada', 'cumplida', 'no-show'];
const CONFIG_DEFAULT = {
  hora_apertura: '09:00', hora_cierre: '18:00',
  dias_semana: [1, 2, 3, 4, 5, 6], paso_min: 30, duracion_default_min: 30,
};

// ---------------------------------------------------------------------------
// Esquema propio (idempotente): SOLO el vínculo con el turno y la
// cola administrativa. El turno vive en booking (su tabla), jamás
// se duplica acá — fecha/hora/duración se leen del turno.
// ---------------------------------------------------------------------------

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_reservas_canal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    booking_id INTEGER,
    canal TEXT NOT NULL DEFAULT '',
    clave_pedido TEXT NOT NULL DEFAULT '',
    intencion TEXT NOT NULL DEFAULT 'reserva',
    agente_destino TEXT NOT NULL DEFAULT '',
    cliente_nombre TEXT NOT NULL DEFAULT '',
    cliente_contacto TEXT NOT NULL DEFAULT '',
    servicio TEXT NOT NULL DEFAULT '',
    texto_pedido TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'tomada',
    sena_estado TEXT NOT NULL DEFAULT 'sin-sena',
    sena_porcentaje REAL,
    sena_monto REAL,
    sena_motivo TEXT NOT NULL DEFAULT '',
    recordatorio_fecha TEXT NOT NULL DEFAULT '',
    recordatorio_estado TEXT NOT NULL DEFAULT 'no-aplica',
    factura_estado TEXT NOT NULL DEFAULT 'esperando-turno',
    factura_id INTEGER,
    factura_motivo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_reservas_canal_user ON gesty_reservas_canal (user_id, estado, id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_reservas_canal_booking ON gesty_reservas_canal (user_id, booking_id)');
  // Idempotencia del canal: una clave de pedido por cuenta no crea
  // dos reservas (el reintento devuelve la original).
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gesty_reservas_canal_clave
    ON gesty_reservas_canal (user_id, clave_pedido) WHERE clave_pedido <> ''`);
}

function filaReserva(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_reservas_canal WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r || null;
}

function parseReservaRow(db, userId, r) {
  if (!r) return null;
  const b = r.booking_id ? booking.getBooking(db, r.booking_id, userId) : null;
  return {
    id: r.id, user_id: r.user_id,
    booking_id: r.booking_id || null,
    canal: r.canal || '', intencion: r.intencion || 'reserva',
    agente_destino: r.agente_destino || '',
    cliente: { nombre: r.cliente_nombre || '', contacto: r.cliente_contacto || '' },
    servicio: r.servicio || '',
    texto_pedido: r.texto_pedido || '',
    estado: r.estado || 'tomada',
    // El cuándo se lee del turno (su fuente de verdad), no de una copia.
    fecha: b ? fechaDeIso(b.starts_at) : '',
    hora: b ? horaDeIso(b.starts_at) : '',
    duracion_min: b ? b.duration_min : null,
    booking: b ? { id: b.id, estado: b.status, channel: b.channel, starts_at: b.starts_at } : null,
    sena: {
      estado: r.sena_estado || 'sin-sena',
      porcentaje: r.sena_porcentaje === null || r.sena_porcentaje === undefined ? null : Number(r.sena_porcentaje),
      monto: r.sena_monto === null || r.sena_monto === undefined ? null : Number(r.sena_monto),
      motivo: r.sena_motivo || '',
    },
    recordatorio: { fecha: r.recordatorio_fecha || '', estado: r.recordatorio_estado || 'no-aplica' },
    factura: {
      estado: r.factura_estado || 'esperando-turno',
      id: r.factura_id || null,
      motivo: r.factura_motivo || '',
    },
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

function getReserva(db, userId, id) {
  ensureSchema(db);
  sincronizarEstados(db, userId);
  const r = filaReserva(db, userId, id);
  return r ? parseReservaRow(db, userId, r) : null;
}

// El estado de la fila espeja al turno (su fuente de verdad): si el
// dueño canceló o cumplió el turno por la vía de la app, la fila lo
// refleja en la lectura — sin eventos (no es un acto de este
// módulo) y sin tocar el turno.
function sincronizarEstados(db, userId) {
  ensureSchema(db);
  const rows = db.prepare("SELECT * FROM gesty_reservas_canal WHERE user_id = ? AND booking_id IS NOT NULL AND estado = 'tomada'").all(userId);
  for (const r of rows) {
    const b = booking.getBooking(db, r.booking_id, userId);
    if (!b) continue;
    if (b.status === 'cancelled') {
      db.prepare(`UPDATE gesty_reservas_canal SET estado = 'cancelada',
        recordatorio_estado = CASE WHEN recordatorio_estado = 'programado' THEN 'cancelado' ELSE recordatorio_estado END,
        sena_estado = CASE WHEN sena_estado = 'pendiente' THEN 'anulada' ELSE sena_estado END,
        updated_at = datetime('now') WHERE id = ?`).run(r.id);
    } else if (b.status === 'done') {
      db.prepare("UPDATE gesty_reservas_canal SET estado = 'cumplida', updated_at = datetime('now') WHERE id = ?").run(r.id);
    } else if (b.status === 'no_show') {
      db.prepare("UPDATE gesty_reservas_canal SET estado = 'no-show', updated_at = datetime('now') WHERE id = ?").run(r.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Configuración de la jornada (fundamento · reglas del dueño)
// ---------------------------------------------------------------------------

function getConfig(db, userId) {
  gesty.ensureSchema(db);
  const dato = gesty.getData(db, userId, { grupo: 'reglas-dueno' }).find((d) => d.campo === 'reservas-canal');
  const v = dato && dato.valor && typeof dato.valor === 'object' && !Array.isArray(dato.valor) ? dato.valor : {};
  const dias = Array.isArray(v.dias_semana) ? v.dias_semana.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  return {
    hora_apertura: esHora(v.hora_apertura) ? String(v.hora_apertura) : CONFIG_DEFAULT.hora_apertura,
    hora_cierre: esHora(v.hora_cierre) ? String(v.hora_cierre) : CONFIG_DEFAULT.hora_cierre,
    dias_semana: dias.length ? [...new Set(dias)].sort() : CONFIG_DEFAULT.dias_semana.slice(),
    paso_min: Number.isInteger(Number(v.paso_min)) && Number(v.paso_min) >= 5 && Number(v.paso_min) <= 120
      ? Number(v.paso_min) : CONFIG_DEFAULT.paso_min,
    duracion_default_min: Number.isInteger(Number(v.duracion_default_min)) && Number(v.duracion_default_min) >= 5 && Number(v.duracion_default_min) <= 480
      ? Number(v.duracion_default_min) : CONFIG_DEFAULT.duracion_default_min,
    es_default: !dato,
  };
}

function setConfig(db, userId, cambios) {
  const actual = getConfig(db, userId);
  const c = cambios || {};
  const nueva = {
    hora_apertura: c.hora_apertura === undefined ? actual.hora_apertura : String(c.hora_apertura),
    hora_cierre: c.hora_cierre === undefined ? actual.hora_cierre : String(c.hora_cierre),
    dias_semana: c.dias_semana === undefined ? actual.dias_semana : (Array.isArray(c.dias_semana) ? c.dias_semana.map(Number) : []),
    paso_min: c.paso_min === undefined ? actual.paso_min : Number(c.paso_min),
    duracion_default_min: c.duracion_default_min === undefined ? actual.duracion_default_min : Number(c.duracion_default_min),
  };
  if (!esHora(nueva.hora_apertura) || !esHora(nueva.hora_cierre)) fail('Las horas de la jornada tienen que ser HH:MM (24 h).');
  if (minutosDe(nueva.hora_cierre) <= minutosDe(nueva.hora_apertura)) fail('La hora de cierre tiene que ser posterior a la de apertura.');
  if (!nueva.dias_semana.length || nueva.dias_semana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    fail('Los días de atención son una lista de días de semana (0 = domingo a 6 = sábado), al menos uno.');
  }
  if (!Number.isInteger(nueva.paso_min) || nueva.paso_min < 5 || nueva.paso_min > 120) fail('El paso de la grilla va de 5 a 120 minutos.');
  if (!Number.isInteger(nueva.duracion_default_min) || nueva.duracion_default_min < 5 || nueva.duracion_default_min > 480) fail('La duración por defecto va de 5 a 480 minutos.');
  gesty.setData(db, userId, {
    grupo: 'reglas-dueno', campo: 'reservas-canal', valor: nueva,
    origen: 'dueno', origen_ref: 'ajustes-reservas-canal', cargado_por: 'dueno',
  });
  return getConfig(db, userId);
}

// ---------------------------------------------------------------------------
// Disponibilidad real — se lee de booking, no se duplica su agenda
// ---------------------------------------------------------------------------

// Los turnos ACTIVOS (pendientes o confirmados) que tocan el día:
// booking.listBookings es la única lectura; el solape se calcula
// sobre los timestamps ISO que booking guarda.
function intervalosActivos(db, userId, fecha) {
  const lista = booking.listBookings(db, userId, {
    from: `${addDias(fecha, -1)}T12:00:00.000Z`,
    to: `${addDias(fecha, 1)}T12:00:00.000Z`,
    limit: 500,
  });
  return lista
    .filter((b) => b.status === 'pending' || b.status === 'confirmed')
    .map((b) => ({
      booking: b,
      ini: Date.parse(b.starts_at),
      fin: Date.parse(b.starts_at) + (Number(b.duration_min) || 30) * 60000,
    }))
    .filter((x) => Number.isFinite(x.ini) && Number.isFinite(x.fin));
}

function huecoOcupado(db, userId, iniIso, finIso, excluirBookingId) {
  const ini = Date.parse(iniIso); const fin = Date.parse(finIso);
  const activos = intervalosActivos(db, userId, fechaDeIso(iniIso));
  return activos.find((a) => Number(a.booking.id) !== Number(excluirBookingId || 0) && ini < a.fin && a.ini < fin) || null;
}

// Los huecos de un día: la ventana de la jornada menos los turnos
// reales. Cada bloqueo cita el turno que lo ocupa (qué bloquea qué
// queda declarado, no escondido).
function consultarDisponibilidad(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const fecha = normTexto(o.fecha);
  if (!esFechaISO(fecha)) fail('Para consultar los huecos hace falta la fecha (AAAA-MM-DD).');
  const config = getConfig(db, userId);
  const dur = o.duracion_min === undefined || o.duracion_min === null ? config.duracion_default_min : Number(o.duracion_min);
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) fail('La duración del turno va de 5 a 480 minutos.');
  const hoy = hoyDe(o);
  const ahoraMs = Date.parse(ahoraDe(o));
  const dow = diaSemanaDe(fecha);
  const salida = {
    fecha, dia_semana: dow, laboral: config.dias_semana.includes(dow),
    duracion_min: dur, servicio: normTexto(o.servicio || ''),
    ventana: { apertura: config.hora_apertura, cierre: config.hora_cierre },
    config, huecos: [], bloqueos: [], motivo: '',
  };
  if (fecha < hoy) { salida.motivo = 'fecha-pasada'; return salida; }
  if (!salida.laboral) { salida.motivo = 'dia-no-laboral'; return salida; }
  const activos = intervalosActivos(db, userId, fecha);
  const apMin = minutosDe(config.hora_apertura);
  const ciMin = minutosDe(config.hora_cierre);
  const ventanaIni = msDe(fecha, apMin);
  const ventanaFin = msDe(fecha, ciMin);
  salida.bloqueos = activos
    .filter((a) => a.ini < ventanaFin && a.fin > ventanaIni)
    .map((a) => ({
      inicio_iso: new Date(a.ini).toISOString(), fin_iso: new Date(a.fin).toISOString(),
      hora_inicio: horaDeIso(a.booking.starts_at),
      bloqueado_por: { booking_id: a.booking.id, servicio: a.booking.service || '', cliente: a.booking.customer_name || '', estado: a.booking.status },
    }));
  for (let m = apMin; m + dur <= ciMin; m += config.paso_min) {
    const ini = msDe(fecha, m);
    const fin = ini + dur * 60000;
    if (fecha === fechaDeIso(ahoraDe(o)) && ini <= ahoraMs) continue; // ese horario ya pasó
    const choque = activos.find((a) => ini < a.fin && a.ini < fin);
    if (!choque) {
      salida.huecos.push({
        inicio_iso: new Date(ini).toISOString(), fin_iso: new Date(fin).toISOString(),
        hora_inicio: horaDeMinutos(m), hora_fin: horaDeMinutos(m + dur),
      });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// La seña — política única del fundamento + precio de la lista
// ---------------------------------------------------------------------------

function computarSena(db, userId, servicio) {
  let politica = { sena: null, lista_precios: [] };
  try { politica = presupuestos.getPolitica(db, userId); } catch (e) { /* sin política legible: sin seña */ }
  if (!politica.sena) {
    return {
      estado: 'sin-sena', porcentaje: null, monto: null,
      motivo: 'La política del negocio no define seña (fundamento · reglas-cobro · politica_sena): la reserva no genera ningún ítem de cobro.',
    };
  }
  const pct = Number(politica.sena.porcentaje);
  const entrada = presupuestos.precioDeLista(politica, servicio);
  if (!entrada) {
    return {
      estado: 'pendiente', porcentaje: pct, monto: null,
      motivo: `sin-precio: la política define una seña del ${pct}% pero «${servicio}» no tiene precio en la lista del fundamento — el monto no se inventa. Queda registrada para cobrarla por el circuito del dueño.`,
    };
  }
  return {
    estado: 'pendiente', porcentaje: pct,
    monto: round2(Number(entrada.precio_unitario) * pct / 100),
    motivo: politica.sena.contra ? `Según tu política, la seña se acredita: ${politica.sena.contra}.` : '',
  };
}

// ---------------------------------------------------------------------------
// La ingesta del canal — clasificación declarada + toma atómica
// ---------------------------------------------------------------------------

function buscarPorClave(db, userId, clave) {
  if (!clave) return null;
  const r = db.prepare('SELECT * FROM gesty_reservas_canal WHERE user_id = ? AND clave_pedido = ?').get(userId, clave);
  return r || null;
}

// Verificación + creación en UN acto (BEGIN IMMEDIATE, el
// precedente de server.js): dentro de la transacción se reverifica
// el hueco contra booking y recién ahí se crea el turno, la fila y
// los eventos de la cola. Si el hueco se ocupó, no se escribe nada.
function crearReservaAtomica(db, userId, datos) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const choque = huecoOcupado(db, userId, datos.inicio_iso, datos.fin_iso, null);
    if (choque) { db.exec('ROLLBACK'); return { ocupado: true, choque }; }
    const b = booking.createBooking(db, userId, {
      service: datos.servicio,
      customer_name: datos.cliente.nombre,
      customer_contact: datos.cliente.contacto,
      channel: 'gesty',
      starts_at: datos.inicio_iso,
      duration_min: datos.duracion_min,
      // El pedido del canal ya trae el «sí» del cliente (la
      // conversación ofreció el hueco y el cliente lo eligió):
      // nace confirmado — entra a la agenda firme y al anti
      // no-show de booking.
      autoConfirm: true,
      notes: `Reserva tomada por Gesty · canal ${datos.canal}`,
    });
    const info = db.prepare(`INSERT INTO gesty_reservas_canal
      (user_id, booking_id, canal, clave_pedido, intencion, cliente_nombre, cliente_contacto,
       servicio, texto_pedido, estado, sena_estado, sena_porcentaje, sena_monto, sena_motivo,
       recordatorio_fecha, recordatorio_estado)
      VALUES (?,?,?,?,?,?,?,?,?,'tomada',?,?,?,?,?,?)`)
      .run(userId, b.id, datos.canal, datos.clave_pedido, 'reserva',
        datos.cliente.nombre, datos.cliente.contacto, datos.servicio, datos.texto_pedido,
        datos.sena.estado, datos.sena.porcentaje, datos.sena.monto, datos.sena.motivo,
        datos.recordatorio.fecha, datos.recordatorio.estado);
    const id = Number(info.lastInsertRowid);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'reserva-canal', entidad_id: String(id),
      tipo_evento: 'reserva-creada',
      resumen: `Reserva tomada por ${datos.canal}: ${datos.servicio} · ${datos.fecha} ${datos.hora} · ${datos.cliente.nombre}`,
      payload: {
        booking_id: b.id, canal: datos.canal, servicio: datos.servicio,
        fecha: datos.fecha, hora: datos.hora, duracion_min: datos.duracion_min,
        sena_estado: datos.sena.estado,
      },
    });
    if (datos.sena.estado === 'pendiente') {
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'reserva-canal', entidad_id: String(id),
        tipo_evento: 'reserva-sena-pendiente',
        resumen: datos.sena.monto !== null
          ? `Seña pendiente de cobro: ${datos.sena.porcentaje}% de «${datos.servicio}» = ${datos.sena.monto}`
          : `Seña pendiente sin monto calculable: ${datos.sena.motivo}`,
        payload: { booking_id: b.id, porcentaje: datos.sena.porcentaje, monto: datos.sena.monto, motivo: datos.sena.motivo },
      });
    }
    if (datos.recordatorio.estado === 'programado') {
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'reserva-canal', entidad_id: String(id),
        tipo_evento: 'reserva-recordatorio-programado',
        resumen: `Recordatorio del turno programado para el ${datos.recordatorio.fecha} (el día anterior)`,
        payload: { booking_id: b.id, fecha_turno: datos.fecha, fecha_recordatorio: datos.recordatorio.fecha },
      });
    }
    db.exec('COMMIT');
    return { booking: b, id };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* la transacción ya no estaba */ }
    throw e;
  }
}

function esErrorDeClave(e) { return /UNIQUE constraint/i.test(String((e && e.message) || '')); }

// EL contrato de ingesta que G-12/G-13 van a llamar. Clasifica por
// la intención DECLARADA y actúa: reserva → toma atómica con su
// cola; venta/queja/cuidado → derivado registrado, jamás resuelto.
function ingresarPedido(db, userId, pedido, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const o = opts || {};
  const p = pedido || {};
  const canal = normTexto(p.canal || 'whatsapp').toLowerCase();
  if (!CANALES.includes(canal)) fail(`Canal de reserva no reconocido: ${canal || '(vacío)'}. Canales del contrato: ${CANALES.join(', ')}.`);
  const intencion = normTexto(p.intencion || 'reserva').toLowerCase();
  const clase = INTENCIONES[intencion];
  if (!clase) {
    fail(`Intención no reconocida: ${intencion || '(vacía)'}. La clasificación es declarada, no se adivina: ${Object.keys(INTENCIONES).join(', ')}.`);
  }
  const cliente = {
    nombre: normTexto((p.cliente || {}).nombre || p.cliente_nombre),
    contacto: normTexto((p.cliente || {}).contacto || p.cliente_contacto),
  };
  const texto = normTexto(p.texto || p.texto_pedido || '');

  if (clase.tipo === 'derivada') {
    const info = db.prepare(`INSERT INTO gesty_reservas_canal
      (user_id, canal, clave_pedido, intencion, agente_destino, cliente_nombre, cliente_contacto,
       servicio, texto_pedido, estado, factura_estado)
      VALUES (?,?,?,?,?,?,?,?,?,'derivada','no-aplica')`)
      .run(userId, canal, normTexto(p.clave_pedido || p.clave || ''), intencion, clase.agente,
        cliente.nombre, cliente.contacto, normTexto(p.servicio || ''), texto);
    const id = Number(info.lastInsertRowid);
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'reserva-canal', entidad_id: String(id),
      tipo_evento: 'reserva-pedido-derivado',
      resumen: `Pedido por ${canal} derivado a ${clase.agente === 'venty' ? 'Venty' : 'Atenty'}: es un tema de ${intencion}, no de agenda — Gesty no lo resuelve`,
      payload: { canal, intencion, destino: clase.agente, cliente: cliente.nombre || '' },
    });
    return { ok: true, derivado: true, destino: clase.agente, reserva: parseReservaRow(db, userId, filaReserva(db, userId, id)) };
  }

  // --- intención de reserva ---
  const servicio = normTexto(p.servicio);
  if (!servicio) fail('El pedido de reserva necesita el servicio.');
  if (!cliente.nombre) fail('La reserva va a nombre del cliente final: falta su nombre.');
  if (!cliente.contacto) fail('La reserva necesita el contacto del cliente final (por ahí se le confirma y se le recuerda).');
  let fecha = normTexto(p.fecha);
  let hora = normTexto(p.hora);
  if ((!fecha || !hora) && p.starts_at) { fecha = fechaDeIso(p.starts_at); hora = horaDeIso(p.starts_at); }
  if (!esFechaISO(fecha)) fail('La reserva necesita su fecha (AAAA-MM-DD).');
  if (!esHora(hora)) fail('La reserva necesita su hora (HH:MM, 24 h).');
  const config = getConfig(db, userId);
  const dur = p.duracion_min === undefined || p.duracion_min === null ? config.duracion_default_min : Number(p.duracion_min);
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) fail('La duración del turno va de 5 a 480 minutos.');
  const inicioIso = isoDe(fecha, hora);
  const finIso = new Date(Date.parse(inicioIso) + dur * 60000).toISOString();
  if (Date.parse(inicioIso) <= Date.parse(ahoraDe(o))) fail('Ese horario ya pasó: una reserva no nace en el pasado.');

  const clave = normTexto(p.clave_pedido || p.clave || '');
  const previa = buscarPorClave(db, userId, clave);
  if (previa) {
    return { ok: true, duplicada: true, derivado: false, reserva: parseReservaRow(db, userId, previa), booking: previa.booking_id ? booking.getBooking(db, previa.booking_id, userId) : null };
  }

  const sena = computarSena(db, userId, servicio);
  const hoy = hoyDe(o);
  const recFecha = addDias(fecha, -1);
  const recordatorio = { fecha: recFecha, estado: recFecha < hoy ? 'no-aplica' : 'programado' };

  let creada;
  try {
    creada = crearReservaAtomica(db, userId, {
      canal, clave_pedido: clave, cliente, servicio,
      texto_pedido: texto, fecha, hora, duracion_min: dur,
      inicio_iso: inicioIso, fin_iso: finIso, sena, recordatorio,
    });
  } catch (e) {
    // La clave es el candado final de idempotencia: si el índice
    // único frenó la inserción, el reintento devuelve la original.
    if (clave && esErrorDeClave(e)) {
      const original = buscarPorClave(db, userId, clave);
      if (original) {
        return { ok: true, duplicada: true, derivado: false, reserva: parseReservaRow(db, userId, original), booking: original.booking_id ? booking.getBooking(db, original.booking_id, userId) : null };
      }
    }
    throw e;
  }
  if (creada.ocupado) {
    const disp = consultarDisponibilidad(db, userId, { fecha, duracion_min: dur, hoy: o.hoy, ahora: o.ahora });
    return {
      ok: false, motivo: 'hueco-ocupado',
      mensaje: `El hueco del ${fecha} a las ${hora} está ocupado por el turno de ${creada.choque.booking.service || 'otro servicio'} (${creada.choque.booking.customer_name || 'otro cliente'}). No se creó ninguna reserva.`,
      alternativas: disp.huecos.slice(0, 3), disponibilidad: disp,
    };
  }
  return { ok: true, duplicada: false, derivado: false, reserva: getReserva(db, userId, creada.id), booking: creada.booking };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

function listReservas(db, userId, opts) {
  ensureSchema(db);
  sincronizarEstados(db, userId);
  const o = opts || {};
  const rows = db.prepare('SELECT * FROM gesty_reservas_canal WHERE user_id = ? ORDER BY id DESC').all(userId);
  let out = rows.map((r) => parseReservaRow(db, userId, r));
  if (o.estado) out = out.filter((r) => r.estado === String(o.estado));
  if (o.canal) out = out.filter((r) => r.canal === String(o.canal));
  if (esFechaISO(o.desde)) out = out.filter((r) => r.fecha && r.fecha >= String(o.desde));
  if (esFechaISO(o.hasta)) out = out.filter((r) => r.fecha && r.fecha <= String(o.hasta));
  const total = out.length;
  const lim = Math.min(Math.max(Number(o.limit) || 200, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { reservas: out.slice(off, off + lim), total };
}

function resumenReservasCanal(db, userId, opts) {
  ensureSchema(db);
  sincronizarEstados(db, userId);
  const o = opts || {};
  const hoy = hoyDe(o);
  const rows = db.prepare('SELECT * FROM gesty_reservas_canal WHERE user_id = ?').all(userId).map((r) => parseReservaRow(db, userId, r));
  const tomadas = rows.filter((r) => r.estado === 'tomada');
  const derivadas = rows.filter((r) => r.estado === 'derivada');
  const senas = rows.filter((r) => r.sena.estado === 'pendiente' && r.estado === 'tomada');
  return {
    fecha: hoy,
    activas: tomadas.length,
    de_hoy: tomadas.filter((r) => r.fecha === hoy).length,
    proximos_7_dias: tomadas.filter((r) => r.fecha >= hoy && r.fecha <= addDias(hoy, 6)).length,
    derivadas: {
      total: derivadas.length,
      a_venty: derivadas.filter((r) => r.agente_destino === 'venty').length,
      a_atenty: derivadas.filter((r) => r.agente_destino === 'atenty').length,
    },
    senas_pendientes: {
      cantidad: senas.length,
      monto_conocido: round2(senas.reduce((a, r) => a + (r.sena.monto || 0), 0)),
      sin_monto: senas.filter((r) => r.sena.monto === null).length,
    },
    facturas: {
      borradores_creados: rows.filter((r) => r.factura.estado === 'borrador-creado').length,
      pendientes: rows.filter((r) => r.factura.estado === 'pendiente').length,
    },
    config: getConfig(db, userId),
  };
}

// ---------------------------------------------------------------------------
// Cancelar / reprogramar — la matriz de G-09 manda (tarjeta + OK)
// ---------------------------------------------------------------------------

function tarjetaVivaDe(db, userId, tipo, bookingId) {
  return gesty.listCards(db, userId, {})
    .find((t) => t.tipo === tipo && t.detalle && Number(t.detalle.booking_id) === Number(bookingId)) || null;
}

function filaTomada(db, userId, reservaId) {
  const r = filaReserva(db, userId, reservaId);
  if (!r) fail('Esa reserva no es de esta cuenta.');
  if (!r.booking_id) fail('Ese pedido no es una reserva tomada (fue derivado): no hay turno para mover ni cancelar.');
  sincronizarEstados(db, userId);
  const vigente = filaReserva(db, userId, reservaId);
  if (vigente.estado !== 'tomada') fail(`Esa reserva ya está ${vigente.estado}: no se mueve ni se cancela desde acá.`);
  const b = booking.getBooking(db, vigente.booking_id, userId);
  if (!b) fail('El turno de esta reserva ya no existe.');
  if (!['pending', 'confirmed'].includes(b.status)) fail(`El turno ya está ${b.status}: no se mueve ni se cancela desde acá.`);
  return { fila: vigente, booking: b };
}

function pedirCancelacion(db, userId, reservaId, datos) {
  ensureSchema(db);
  const { fila, booking: b } = filaTomada(db, userId, reservaId);
  const motivo = normTexto((datos || {}).motivo || '');
  const viva = tarjetaVivaDe(db, userId, 'compromiso-cancelar', b.id);
  if (viva) return { aplicado: false, requiere_ok: true, ya_preparada: true, reserva: parseReservaRow(db, userId, fila), tarjeta: viva };
  const fecha = fechaDeIso(b.starts_at); const hora = horaDeIso(b.starts_at);
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'compromiso-cancelar',
    titulo: `Cancelar el turno de ${b.customer_name || 'el cliente'} · ${b.service} · ${fecha}${hora ? ' ' + hora : ''}`,
    detalle: {
      booking_id: b.id, reserva_id: fila.id, origen: 'reserva-canal',
      titulo: b.service, cliente: { nombre: b.customer_name || '', contacto: b.customer_contact || '' },
      fecha, hora, motivo,
    },
    creado_por: 'gesty',
  });
  return { aplicado: false, requiere_ok: true, reserva: parseReservaRow(db, userId, fila), tarjeta };
}

function pedirReprogramacion(db, userId, reservaId, cambios, opts) {
  ensureSchema(db);
  const { fila, booking: b } = filaTomada(db, userId, reservaId);
  const c = cambios || {};
  const fecha = normTexto(c.fecha || c.nueva_fecha);
  if (!esFechaISO(fecha)) fail('Para reprogramar hace falta la fecha nueva (AAAA-MM-DD).');
  const hora = c.hora !== undefined || c.nueva_hora !== undefined ? normTexto(c.hora !== undefined ? c.hora : c.nueva_hora) : horaDeIso(b.starts_at);
  if (!esHora(hora)) fail('La hora nueva tiene que ser HH:MM (24 h).');
  const motivo = normTexto(c.motivo || '');
  const de = { fecha: fechaDeIso(b.starts_at), hora: horaDeIso(b.starts_at) };
  if (fecha === de.fecha && hora === de.hora) fail('El turno ya está en esa fecha y hora: no hay cambio para aplicar.');
  const inicioIso = isoDe(fecha, hora);
  if (Date.parse(inicioIso) <= Date.parse(ahoraDe(opts))) fail('El horario nuevo ya pasó: una reserva no se mueve al pasado.');
  const finIso = new Date(Date.parse(inicioIso) + (Number(b.duration_min) || 30) * 60000).toISOString();
  const choque = huecoOcupado(db, userId, inicioIso, finIso, b.id);
  if (choque) {
    fail(`El hueco nuevo está ocupado por el turno de ${choque.booking.service || 'otro servicio'} (${choque.booking.customer_name || 'otro cliente'}): no se prepara una tarjeta para un cambio imposible.`);
  }
  const viva = tarjetaVivaDe(db, userId, 'compromiso-mover', b.id);
  if (viva) return { aplicado: false, requiere_ok: true, ya_preparada: true, reserva: parseReservaRow(db, userId, fila), tarjeta: viva };
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'compromiso-mover',
    titulo: `Mover el turno de ${b.customer_name || 'el cliente'} · ${b.service} · al ${fecha}${hora ? ' ' + hora : ''}`,
    detalle: {
      booking_id: b.id, reserva_id: fila.id, origen: 'reserva-canal',
      titulo: b.service, cliente: { nombre: b.customer_name || '', contacto: b.customer_contact || '' },
      de, a: { fecha, hora }, motivo,
    },
    creado_por: 'gesty',
  });
  return { aplicado: false, requiere_ok: true, reserva: parseReservaRow(db, userId, fila), tarjeta };
}

// Los ejecutores despachadores: el ÚNICO camino que aplica un
// cambio sobre una reserva del canal. Validan que el turno siga
// exactamente como la tarjeta lo preparó (si cambió debajo, la
// tarjeta vuelve con el motivo — patrón R6 de la fundación) y que
// el hueco nuevo siga libre al momento de aplicar.
function aplicarCancelacionReserva(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  const fila = d.reserva_id ? filaReserva(db, userId, Number(d.reserva_id)) : null;
  if (!fila || Number(fila.booking_id) !== Number(d.booking_id)) {
    return { ok: false, motivo: 'La reserva de esta tarjeta ya no existe.' };
  }
  const b = booking.getBooking(db, Number(d.booking_id), userId);
  if (!b) return { ok: false, motivo: 'El turno de esta tarjeta ya no existe.' };
  if (!['pending', 'confirmed'].includes(b.status)) return { ok: false, motivo: `El turno ya está ${b.status}: no se cancela.` };
  if (fechaDeIso(b.starts_at) !== d.fecha || horaDeIso(b.starts_at) !== (d.hora || '')) {
    return { ok: false, motivo: 'El turno cambió desde que se preparó esta tarjeta: hay que preparar la cancelación de nuevo.' };
  }
  booking.cancelBooking(db, b.id, userId, d.motivo || 'Cancelado con el OK del dueño (reserva tomada por Gesty)');
  db.prepare(`UPDATE gesty_reservas_canal SET estado = 'cancelada',
    recordatorio_estado = CASE WHEN recordatorio_estado = 'programado' THEN 'cancelado' ELSE recordatorio_estado END,
    sena_estado = CASE WHEN sena_estado = 'pendiente' THEN 'anulada' ELSE sena_estado END,
    updated_at = datetime('now') WHERE id = ?`).run(fila.id);
  return {
    ok: true,
    evento: 'reserva-cancelada', entidad_tipo: 'reserva-canal', entidad_id: String(fila.id),
    resumen: `Se canceló el turno de ${b.customer_name || 'el cliente'} · ${b.service} · ${d.fecha} (OK del dueño)`,
    payload: { tarjeta_id: card.id, booking_id: b.id, motivo: d.motivo || '' },
  };
}

function aplicarReprogramacionReserva(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  const fila = d.reserva_id ? filaReserva(db, userId, Number(d.reserva_id)) : null;
  if (!fila || Number(fila.booking_id) !== Number(d.booking_id)) {
    return { ok: false, motivo: 'La reserva de esta tarjeta ya no existe.' };
  }
  const b = booking.getBooking(db, Number(d.booking_id), userId);
  if (!b) return { ok: false, motivo: 'El turno de esta tarjeta ya no existe.' };
  if (!['pending', 'confirmed'].includes(b.status)) return { ok: false, motivo: `El turno ya está ${b.status}: no se mueve.` };
  if (!d.de || fechaDeIso(b.starts_at) !== d.de.fecha || horaDeIso(b.starts_at) !== (d.de.hora || '')) {
    return { ok: false, motivo: 'El turno cambió desde que se preparó esta tarjeta: hay que preparar el cambio de nuevo.' };
  }
  if (!d.a || !esFechaISO(d.a.fecha) || !esHora(d.a.hora || '')) return { ok: false, motivo: 'La tarjeta no trae el horario nuevo del turno.' };
  const inicioIso = isoDe(d.a.fecha, d.a.hora);
  const finIso = new Date(Date.parse(inicioIso) + (Number(b.duration_min) || 30) * 60000).toISOString();
  const choque = huecoOcupado(db, userId, inicioIso, finIso, b.id);
  if (choque) {
    return { ok: false, motivo: `El hueco del ${d.a.fecha} a las ${d.a.hora} se ocupó desde que se preparó esta tarjeta (turno de ${choque.booking.service || 'otro servicio'}): hay que preparar el cambio de nuevo.` };
  }
  const movido = booking.rescheduleBooking(db, b.id, userId, inicioIso, { keepConfirmed: b.status === 'confirmed' });
  const recFecha = addDias(d.a.fecha, -1);
  db.prepare(`UPDATE gesty_reservas_canal SET
    recordatorio_fecha = CASE WHEN recordatorio_estado = 'programado' THEN ? ELSE recordatorio_fecha END,
    updated_at = datetime('now') WHERE id = ?`).run(recFecha, fila.id);
  return {
    ok: true,
    evento: 'reserva-reprogramada', entidad_tipo: 'reserva-canal', entidad_id: String(fila.id),
    resumen: `Se movió el turno de ${b.customer_name || 'el cliente'} · ${b.service} · al ${d.a.fecha} ${d.a.hora} (OK del dueño)`,
    payload: { tarjeta_id: card.id, booking_id: b.id, de: d.de, a: { fecha: fechaDeIso(movido.starts_at), hora: horaDeIso(movido.starts_at) } },
  };
}

// EL DESPACHADOR de la matriz para los compromisos: booking_id →
// la reserva del canal es de este módulo; sin booking_id → el
// compromiso propio es de G-09 y se DELEGA en su ejecutor (su
// comportamiento no cambia en nada). Este módulo se carga DESPUÉS
// de gesty-agenda en server.js: el registro de acá es el vigente.
function ejecutarCancelarCompromisoCanal(db, userId, card) {
  const d = (card && card.detalle) || {};
  if (d.booking_id) return aplicarCancelacionReserva(db, userId, card);
  return agenda.ejecutarCancelarCompromiso(db, userId, card);
}
function ejecutarMoverCompromisoCanal(db, userId, card) {
  const d = (card && card.detalle) || {};
  if (d.booking_id) return aplicarReprogramacionReserva(db, userId, card);
  return agenda.ejecutarMoverCompromiso(db, userId, card);
}

gesty.registerExecutor('compromiso-cancelar', ejecutarCancelarCompromisoCanal);
gesty.registerExecutor('compromiso-mover', ejecutarMoverCompromisoCanal);

// ---------------------------------------------------------------------------
// Al cumplirse el turno: el borrador de factura enlazado (G-04)
// ---------------------------------------------------------------------------

function clienteDatoPara(db, userId, b) {
  const datos = gesty.getData(db, userId, { grupo: 'clientes-facturacion' });
  const contacto = String(b.customer_contact || '').toLowerCase().trim();
  const nombre = normNombre(b.customer_name || '');
  return datos.find((d) => {
    const v = d.valor && typeof d.valor === 'object' ? d.valor : {};
    if (contacto && v.email && String(v.email).toLowerCase().trim() === contacto) return true;
    if (nombre && normNombre(v.nombre || v.razon_social || '') === nombre) return true;
    return false;
  }) || null;
}

// Recorre las reservas cuyo turno ya se cumplió y les nace el
// borrador. Idempotente: un borrador creado no se recrea; un
// «pendiente» solo se reintenta si el llamador lo pide
// (opts.reintentar), para no re-fallar en silencio cada corrida.
function procesarCumplidas(db, userId, opts) {
  ensureSchema(db);
  sincronizarEstados(db, userId);
  const o = opts || {};
  const hoy = hoyDe(o);
  const rows = db.prepare(`SELECT * FROM gesty_reservas_canal WHERE user_id = ? AND estado = 'cumplida'
    AND (factura_estado = 'esperando-turno' OR (? = 1 AND factura_estado = 'pendiente')) ORDER BY id ASC`)
    .all(userId, o.reintentar ? 1 : 0);
  const salida = { fecha: hoy, creadas: [], pendientes: [] };
  let politica = { sena: null, lista_precios: [] };
  try { politica = presupuestos.getPolitica(db, userId); } catch (e) { /* sin lista legible: todo queda pendiente con su motivo */ }
  for (const r of rows) {
    const b = r.booking_id ? booking.getBooking(db, r.booking_id, userId) : null;
    if (!b || b.status !== 'done') continue;
    const dato = clienteDatoPara(db, userId, b);
    const entrada = presupuestos.precioDeLista(politica, r.servicio || b.service);
    if (dato && entrada) {
      const f = facturacion.crearBorrador(db, userId, {
        cliente: { campo: dato.campo },
        items: [{ descripcion: r.servicio || b.service, cantidad: 1, precio_unitario: entrada.precio_unitario, alicuota_iva: entrada.alicuota_iva }],
        fecha: hoy,
        concepto: `Turno cumplido · ${r.servicio || b.service} · reserva del canal n.º ${r.id}`,
        origen_tipo: 'reserva-canal', origen_ref: String(b.id),
        creado_por: 'gesty',
      });
      db.prepare(`UPDATE gesty_reservas_canal SET factura_estado = 'borrador-creado', factura_id = ?, factura_motivo = '', updated_at = datetime('now') WHERE id = ?`)
        .run(f.id, r.id);
      gesty.recordEvent(db, userId, {
        actor: 'gesty', entidad_tipo: 'reserva-canal', entidad_id: String(r.id),
        tipo_evento: 'reserva-factura-creada',
        resumen: `Del turno cumplido nació el borrador ${f.numero} para ${f.cliente.nombre} · ${f.moneda} ${f.total} (sin emitir: espera su circuito de Facturación)`,
        payload: { booking_id: b.id, factura_id: f.id, numero: f.numero, total: f.total, origen_ref: String(b.id) },
      });
      salida.creadas.push({ reserva_id: r.id, factura_id: f.id, numero: f.numero, total: f.total });
    } else {
      const faltan = [];
      if (!dato) faltan.push('el cliente no está identificado en tu fundamento de facturación');
      if (!entrada) faltan.push(`«${r.servicio || b.service}» no tiene precio en la lista del fundamento`);
      const motivo = `${faltan.join(' · ')} — la factura no se inventa: queda pendiente hasta que la pieza exista.`;
      const cambio = r.factura_estado !== 'pendiente' || r.factura_motivo !== motivo;
      db.prepare("UPDATE gesty_reservas_canal SET factura_estado = 'pendiente', factura_motivo = ?, updated_at = datetime('now') WHERE id = ?")
        .run(motivo, r.id);
      if (cambio) {
        gesty.recordEvent(db, userId, {
          actor: 'gesty', entidad_tipo: 'reserva-canal', entidad_id: String(r.id),
          tipo_evento: 'reserva-factura-pendiente',
          resumen: `El turno se cumplió pero el borrador no nació: ${motivo}`,
          payload: { booking_id: b.id, motivo },
        });
      }
      salida.pendientes.push({ reserva_id: r.id, motivo });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------

module.exports = {
  // constantes
  CANALES, INTENCIONES, ESTADOS_RESERVA, CONFIG_DEFAULT,
  // esquema
  ensureSchema,
  // configuración de la jornada
  getConfig, setConfig,
  // disponibilidad (la capacidad que la conversación usa)
  consultarDisponibilidad, huecoOcupado,
  // ingesta del canal
  ingresarPedido,
  // consultas
  getReserva, listReservas, resumenReservasCanal,
  // matriz: pedir + ejecutar (el despachador delega en G-09)
  pedirCancelacion, pedirReprogramacion,
  ejecutarCancelarCompromisoCanal, ejecutarMoverCompromisoCanal,
  // cierre del ciclo
  procesarCumplidas,
  // piezas internas, exportadas para tests y reuso
  computarSena, sincronizarEstados, intervalosActivos,
};
