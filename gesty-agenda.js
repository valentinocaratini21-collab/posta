// =====================================================================
// GESTY · G-09 — AGENDA ADMINISTRATIVA
// Spec: gesty-cola-builds.md G-09 · gesty-areas-detalle.md §4 ·
// gesty-sistema-operativo.md §2.4/§5 (matriz: mover o cancelar un
// compromiso que toca a un cliente = SIEMPRE con OK del dueño; los
// recordatorios internos corren solos) · gesty-build-spec.md §12
// (pilar «conexión»: la agenda se lee de las fuentes que el negocio
// ya usa; jamás se pide cargar dos veces).
//
// LA AGENDA ES UNA VISTA, NO OTRA BASE (cola G-09 paso 1). La vista
// unificada se COMPONE en cada lectura desde las entidades reales:
//   · vencimientos de facturas por cobrar — gesty-facturacion (G-04)
//   · obligaciones con proveedores (sus días de pago) — G-07, que a
//     su vez las deriva de los comprobantes recibidos de G-03
//   · vencimientos de presupuestos enviados — gesty-presupuestos (G-08)
//   · vencimientos fiscales del fundamento (grupo calendario-fiscal)
//     SOLO cuando el dato es estructurado {fecha, monto} — la misma
//     vara de G-06: la regla «día 20» NO se convierte en un evento
//     fechado; se declara en `compromisos_sin_fecha` con su motivo
//   · turnos del negocio — booking.js (la agenda de turnos que vive
//     en la app), leídos sin duplicar (cola G-09 paso 3)
//   · eventos propios de Gesty (citas, entregas, visitas,
//     vencimientos internos) — única tabla de este módulo
// Cada ítem de la vista cita su fuente {area, entidad, id}: cero
// eventos huérfanos — todo lo que la agenda muestra apunta a la
// entidad que lo origina (aceptación G-09).
//
// SINCRONIZACIÓN EXTERNA — LO QUE HAY (inspección 2026-10-24):
// en el repo NO existe integración con calendarios externos.
// google.js es Google Business Profile (reseñas; scope
// business.manage), calendar.js son efemérides de contenido y
// booking.js declara en su cabecera que la agenda de turnos vive
// EN la app «sin integración de calendario externo por ahora».
// La spec §12.2 marca la conexión «su agenda / sistema de turnos»
// como COLA de este build (+30 días del MVP). Entonces: la agenda
// funciona completa DENTRO de la app y cada respuesta declara
// `sincronizacion.externa: 'sin-conectar'` — nunca se finge una
// sincronización que no ocurrió.
//
// MOVER / CANCELAR (matriz §5 y áreas §4): un compromiso PROPIO que
// toca a un cliente (toca_cliente) solo se mueve o cancela por la
// tarjeta de la matriz (`compromiso-mover` / `compromiso-cancelar`)
// con el cambio COMPLETO en el detalle; el ejecutor registrado es
// el único que aplica el cambio, y valida que el compromiso siga
// como la tarjeta lo muestra (si cambió, la tarjeta vuelve con el
// motivo). Un compromiso interno (sin cliente) se mueve directo:
// es autopilot de agenda interna, y el cambio queda registrado.
// Los vencimientos derivados (facturas, obligaciones, presupuestos,
// fiscales, turnos) NO se mueven desde acá: se corrigen en su área
// o en su sistema — la agenda los refleja. Los turnos de booking.js
// se reprograman por su propia vía (Posty): acá son lectura.
//
// RECORDATORIOS: corren solos (matriz) por el canal de
// notificaciones que la app ya usa (push.js · sendPush, inyectable
// por configure para tests), con la anticipación que el dueño dejó
// en el fundamento (grupo reglas-dueno, campo «agenda»; default
// 1 día). Cada recordatorio emitido queda en el registro durable
// (gesty_events, entidad «agenda-recordatorio») con el resultado
// real del canal — sin registro no hay promesa, y sin entrega el
// evento lo dice (entrega: 'sin-entrega:…'), jamás se finge.
//
// RELOJ INYECTABLE: toda función pública acepta opts.hoy
// (YYYY-MM-DD) y las derivaciones de días se calculan desde ese
// reloj — ningún cálculo usa la fecha del sistema cuando el
// llamador pasó la suya (lección del fix de Cobranzas G-08).
//
// FECHAS FISCALES CALCULADAS: NO se calculan acá (eso es G-19:
// vencimientos desde CUIT + régimen). Acá solo se leen las fechas
// concretas que el fundamento ya trae.
// =====================================================================
'use strict';

const gesty = require('./gesty');
const facturacion = require('./gesty-facturacion');
const proveedores = require('./gesty-proveedores');
const presupuestos = require('./gesty-presupuestos');
const reportes = require('./gesty-reportes');
const booking = require('./booking');

// ---------------------------------------------------------------------------
// Utilidades (el patrón de la casa: cada módulo trae las suyas)
// ---------------------------------------------------------------------------

function fail(msg) { const e = new Error(msg); e.gesty = true; throw e; }
function normTexto(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function esFechaISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(String(s))); }
function esHora(h) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h || '')); }
function diffDias(desdeISO, hastaISO) {
  if (!esFechaISO(desdeISO) || !esFechaISO(hastaISO)) return null;
  return Math.round((Date.parse(String(hastaISO).slice(0, 10)) - Date.parse(String(desdeISO).slice(0, 10))) / 86400000);
}
function addDias(iso, n) {
  const t = Date.parse(String(iso).slice(0, 10)) + Number(n) * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function safeJson(s, def) { try { const v = JSON.parse(s); return v === null || v === undefined ? def : v; } catch (e) { return def; } }
function minutosDe(hora) { const p = String(hora || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
// El reloj del llamador manda: opts.hoy válido o, en su defecto, hoy.
function hoyDe(opts) { const o = opts || {}; return esFechaISO(o.hoy) ? String(o.hoy) : hoyISO(); }

const TIPOS_EVENTO = ['turno', 'entrega', 'visita', 'vencimiento-interno', 'cita', 'tarea', 'compromiso'];
const ESTADOS_EVENTO = ['activo', 'cancelado', 'cumplido'];
const CONFIG_DEFAULT = { anticipacion_dias: 1, activo: true };

// ---------------------------------------------------------------------------
// Configuración inyectable: el canal de notificaciones de la app.
// Por default se resuelve push.js (Web Push / VAPID) de forma perezosa;
// server.js inyecta su instancia y los tests, una falsa.
// ---------------------------------------------------------------------------

let notifyInyectado = null;
function configure(opts) {
  const o = opts || {};
  if (typeof o.notify === 'function') notifyInyectado = o.notify;
}
async function notificar(userId, payload) {
  if (notifyInyectado) return notifyInyectado(userId, payload);
  try {
    const push = require('./push');
    return await push.sendPush(userId, payload);
  } catch (e) {
    return { ok: false, reason: 'push-no-disponible' };
  }
}

// ---------------------------------------------------------------------------
// Esquema propio (idempotente): SOLO los eventos propios de Gesty.
// Todo lo demás de la vista se compone desde las áreas, sin copiar.
// ---------------------------------------------------------------------------

function ensureSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS gesty_agenda_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    titulo TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'compromiso',
    fecha TEXT NOT NULL,
    hora TEXT DEFAULT '',
    duracion_min INTEGER DEFAULT 0,
    detalle TEXT DEFAULT '',
    cliente_nombre TEXT DEFAULT '',
    cliente_contacto TEXT DEFAULT '',
    toca_cliente INTEGER NOT NULL DEFAULT 0,
    estado TEXT NOT NULL DEFAULT 'activo',
    motivo_estado TEXT DEFAULT '',
    creado_por TEXT NOT NULL DEFAULT 'dueno',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gesty_agenda_user_fecha ON gesty_agenda_eventos (user_id, fecha)');
}

// ---------------------------------------------------------------------------
// Sincronización externa: el estado honesto (ver cabecera). Ningún
// calendario externo está conectado hoy; la agenda vive en la app.
// ---------------------------------------------------------------------------

function estadoSincronizacion() {
  return {
    externa: 'sin-conectar',
    detalle: 'La agenda vive dentro de la app: ningún calendario externo está conectado, así que nada se sincroniza hacia afuera todavía.',
  };
}

// ---------------------------------------------------------------------------
// Eventos propios — entidad
// ---------------------------------------------------------------------------

function parseEventoRow(r) {
  if (!r) return null;
  return {
    id: r.id, user_id: r.user_id,
    titulo: r.titulo || '', tipo: r.tipo || 'compromiso',
    fecha: r.fecha || '', hora: r.hora || '',
    duracion_min: Number(r.duracion_min) || 0,
    detalle: r.detalle || '',
    cliente: (r.cliente_nombre || r.cliente_contacto)
      ? { nombre: r.cliente_nombre || '', contacto: r.cliente_contacto || '' } : null,
    toca_cliente: r.toca_cliente === 1,
    estado: r.estado || 'activo',
    motivo_estado: r.motivo_estado || '',
    creado_por: r.creado_por || 'dueno',
    creado_en: r.created_at, actualizado_en: r.updated_at,
  };
}

// Solapamiento entre dos compromisos propios con hora el mismo día:
// [hora, hora+duración) contra [hora, hora+duración); sin duración
// declarada se asumen 30 minutos (la duración típica de booking.js).
function solapan(a, b) {
  if (a.fecha !== b.fecha || !a.hora || !b.hora) return false;
  const iniA = minutosDe(a.hora); const finA = iniA + (Number(a.duracion_min) || 30);
  const iniB = minutosDe(b.hora); const finB = iniB + (Number(b.duracion_min) || 30);
  return iniA < finB && iniB < finA;
}

function conflictosDe(db, userId, candidato, excluirId) {
  const rows = db.prepare("SELECT * FROM gesty_agenda_eventos WHERE user_id = ? AND fecha = ? AND estado = 'activo' ORDER BY hora ASC, id ASC")
    .all(userId, candidato.fecha);
  return rows.map(parseEventoRow)
    .filter((e) => e.id !== Number(excluirId || 0) && solapan(candidato, e))
    .map((e) => ({ evento_id: e.id, titulo: e.titulo, hora: e.hora }));
}

function crearEvento(db, userId, datos, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const o = opts || {};
  const d = datos || {};
  const titulo = normTexto(d.titulo);
  if (!titulo) fail('El compromiso necesita un título.');
  const fecha = normTexto(d.fecha);
  if (!esFechaISO(fecha)) fail('La fecha del compromiso tiene que ser una fecha válida (AAAA-MM-DD).');
  const hora = normTexto(d.hora);
  if (hora && !esHora(hora)) fail('La hora tiene que ser HH:MM (24 h).');
  const tipo = TIPOS_EVENTO.includes(String(d.tipo || '')) ? String(d.tipo) : 'compromiso';
  const cliente = d.cliente && typeof d.cliente === 'object' ? d.cliente : {};
  const tocaCliente = d.toca_cliente === true || d.toca_cliente === 1
    || !!(normTexto(d.cliente_nombre) || normTexto(cliente.nombre));
  const creadoPor = normTexto(o.creado_por || d.creado_por) === 'gesty' ? 'gesty' : 'dueno';
  const info = db.prepare(`INSERT INTO gesty_agenda_eventos
    (user_id, titulo, tipo, fecha, hora, duracion_min, detalle, cliente_nombre, cliente_contacto, toca_cliente, creado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, titulo, tipo, fecha, hora,
      Math.max(0, Math.round(Number(d.duracion_min) || 0)),
      normTexto(d.detalle),
      normTexto(d.cliente_nombre || cliente.nombre),
      normTexto(d.cliente_contacto || cliente.contacto),
      tocaCliente ? 1 : 0, creadoPor);
  const ev = getEvento(db, userId, Number(info.lastInsertRowid));
  // Nada se pisa en silencio (áreas §4): el conflicto se detecta y
  // se muestra en la respuesta; el evento nace igual y el dueño decide.
  const conflictos = conflictosDe(db, userId, ev, ev.id);
  gesty.recordEvent(db, userId, {
    actor: creadoPor, entidad_tipo: 'agenda-evento', entidad_id: String(ev.id),
    tipo_evento: 'agenda-evento-creado',
    resumen: `Compromiso cargado: ${ev.titulo} · ${ev.fecha}${ev.hora ? ' ' + ev.hora : ''}`,
    payload: { tipo: ev.tipo, fecha: ev.fecha, hora: ev.hora, toca_cliente: ev.toca_cliente, conflictos: conflictos.map((c) => c.evento_id) },
  });
  return { evento: ev, conflictos };
}

function getEvento(db, userId, id) {
  ensureSchema(db);
  const r = db.prepare('SELECT * FROM gesty_agenda_eventos WHERE id = ? AND user_id = ?').get(Number(id), userId);
  return r ? parseEventoRow(r) : null;
}

function listEventos(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const rows = db.prepare('SELECT * FROM gesty_agenda_eventos WHERE user_id = ? ORDER BY fecha ASC, hora ASC, id ASC').all(userId);
  let out = rows.map(parseEventoRow);
  if (o.estado) out = out.filter((e) => e.estado === String(o.estado));
  if (esFechaISO(o.desde)) out = out.filter((e) => e.fecha >= String(o.desde));
  if (esFechaISO(o.hasta)) out = out.filter((e) => e.fecha <= String(o.hasta));
  const total = out.length;
  const lim = Math.min(Math.max(Number(o.limit) || 500, 1), 1000);
  const off = Math.max(Number(o.offset) || 0, 0);
  return { eventos: out.slice(off, off + lim), total };
}

// Editar lo que NO es el cuándo: título, detalle, cliente, duración.
// Cambiar fecha/hora es MOVER (su propio flujo, con tarjeta si toca
// a un cliente) — por acá no pasa, para que ninguna edición esconda
// un cambio de compromiso.
function editarEvento(db, userId, id, cambios) {
  ensureSchema(db);
  const ev = getEvento(db, userId, id);
  if (!ev) fail('Ese compromiso no es de esta cuenta.');
  if (ev.estado !== 'activo') fail(`Ese compromiso ya está ${ev.estado}: no se edita.`);
  const c = cambios || {};
  if (c.fecha !== undefined || c.hora !== undefined) {
    fail('Cambiar la fecha o la hora es mover el compromiso: usá el flujo de mover (pide OK si toca a un cliente).');
  }
  const sets = [];
  const args = [];
  if (c.titulo !== undefined) { const t = normTexto(c.titulo); if (!t) fail('El título no puede quedar vacío.'); sets.push('titulo = ?'); args.push(t); }
  if (c.tipo !== undefined && TIPOS_EVENTO.includes(String(c.tipo))) { sets.push('tipo = ?'); args.push(String(c.tipo)); }
  if (c.detalle !== undefined) { sets.push('detalle = ?'); args.push(normTexto(c.detalle)); }
  if (c.duracion_min !== undefined) { sets.push('duracion_min = ?'); args.push(Math.max(0, Math.round(Number(c.duracion_min) || 0))); }
  const cli = c.cliente && typeof c.cliente === 'object' ? c.cliente : {};
  if (c.cliente_nombre !== undefined || cli.nombre !== undefined) { sets.push('cliente_nombre = ?'); args.push(normTexto(c.cliente_nombre !== undefined ? c.cliente_nombre : cli.nombre)); }
  if (c.cliente_contacto !== undefined || cli.contacto !== undefined) { sets.push('cliente_contacto = ?'); args.push(normTexto(c.cliente_contacto !== undefined ? c.cliente_contacto : cli.contacto)); }
  if (c.toca_cliente !== undefined) { sets.push('toca_cliente = ?'); args.push(c.toca_cliente ? 1 : 0); }
  if (!sets.length) return { evento: ev };
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE gesty_agenda_eventos SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).run(...args, ev.id, userId);
  const nuevo = getEvento(db, userId, ev.id);
  gesty.recordEvent(db, userId, {
    actor: 'dueno', entidad_tipo: 'agenda-evento', entidad_id: String(ev.id),
    tipo_evento: 'agenda-evento-editado', resumen: `Compromiso editado: ${nuevo.titulo}`,
    payload: { campos: sets.filter((s) => !s.startsWith('updated_at')).map((s) => s.split(' ')[0]) },
  });
  return { evento: nuevo };
}

function cumplirEvento(db, userId, id, opts) {
  ensureSchema(db);
  const ev = getEvento(db, userId, id);
  if (!ev) fail('Ese compromiso no es de esta cuenta.');
  if (ev.estado !== 'activo') fail(`Ese compromiso ya está ${ev.estado}.`);
  db.prepare("UPDATE gesty_agenda_eventos SET estado = 'cumplido', updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(ev.id, userId);
  const nuevo = getEvento(db, userId, ev.id);
  gesty.recordEvent(db, userId, {
    actor: (opts || {}).creado_por === 'gesty' ? 'gesty' : 'dueno',
    entidad_tipo: 'agenda-evento', entidad_id: String(ev.id),
    tipo_evento: 'agenda-evento-cumplido', resumen: `Compromiso cumplido: ${ev.titulo} · ${ev.fecha}`,
    payload: { fecha: ev.fecha },
  });
  return { evento: nuevo };
}

// ---------------------------------------------------------------------------
// MOVER / CANCELAR — la matriz manda (áreas §4, OS §2.4)
// ---------------------------------------------------------------------------

function aplicarMovimiento(db, userId, ev, destino, motivo, actor, tarjetaId) {
  db.prepare("UPDATE gesty_agenda_eventos SET fecha = ?, hora = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(destino.fecha, destino.hora, ev.id, userId);
  const nuevo = getEvento(db, userId, ev.id);
  gesty.recordEvent(db, userId, {
    actor, entidad_tipo: 'agenda-evento', entidad_id: String(ev.id),
    tipo_evento: 'agenda-evento-movido',
    resumen: `Compromiso movido: ${ev.titulo} · del ${ev.fecha}${ev.hora ? ' ' + ev.hora : ''} al ${destino.fecha}${destino.hora ? ' ' + destino.hora : ''}`,
    payload: { de: { fecha: ev.fecha, hora: ev.hora }, a: { fecha: destino.fecha, hora: destino.hora }, motivo: motivo || '', tarjeta_id: tarjetaId || null },
  });
  return nuevo;
}

function aplicarCancelacion(db, userId, ev, motivo, actor, tarjetaId) {
  db.prepare("UPDATE gesty_agenda_eventos SET estado = 'cancelado', motivo_estado = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(motivo || '', ev.id, userId);
  const nuevo = getEvento(db, userId, ev.id);
  gesty.recordEvent(db, userId, {
    actor, entidad_tipo: 'agenda-evento', entidad_id: String(ev.id),
    tipo_evento: 'agenda-evento-cancelado',
    resumen: `Compromiso cancelado: ${ev.titulo} · ${ev.fecha}${ev.hora ? ' ' + ev.hora : ''}`,
    payload: { fecha: ev.fecha, hora: ev.hora, motivo: motivo || '', tarjeta_id: tarjetaId || null },
  });
  return nuevo;
}

// Pedir mover: con cliente → tarjeta de la matriz con el cambio
// COMPLETO y el compromiso queda como está hasta el OK; interno →
// se aplica en el acto (autopilot de agenda interna). Sin
// excepciones: el «toca a un cliente» lo decide el dato, no el pedido.
function pedirMover(db, userId, id, cambios, opts) {
  ensureSchema(db);
  const ev = getEvento(db, userId, id);
  if (!ev) fail('Ese compromiso no es de esta cuenta.');
  if (ev.estado !== 'activo') fail(`Ese compromiso ya está ${ev.estado}: no se mueve.`);
  const c = cambios || {};
  const fecha = normTexto(c.fecha || c.nueva_fecha);
  if (!esFechaISO(fecha)) fail('Para mover hace falta la fecha nueva (AAAA-MM-DD).');
  const hora = c.hora !== undefined || c.nueva_hora !== undefined ? normTexto(c.hora !== undefined ? c.hora : c.nueva_hora) : ev.hora;
  if (hora && !esHora(hora)) fail('La hora nueva tiene que ser HH:MM (24 h).');
  const motivo = normTexto(c.motivo);
  if (fecha === ev.fecha && hora === ev.hora) fail('El compromiso ya está en esa fecha y hora: no hay cambio para aplicar.');
  const destino = { fecha, hora };
  if (!ev.toca_cliente) {
    const nuevo = aplicarMovimiento(db, userId, ev, destino, motivo, (opts || {}).creado_por === 'gesty' ? 'gesty' : 'dueno', null);
    return { aplicado: true, requiere_ok: false, evento: nuevo, tarjeta: null, conflictos: conflictosDe(db, userId, nuevo, nuevo.id) };
  }
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'compromiso-mover',
    titulo: `Mover «${ev.titulo}» al ${fecha}${hora ? ' ' + hora : ''}`,
    detalle: {
      evento_id: ev.id, titulo: ev.titulo, tipo_evento: ev.tipo,
      cliente: ev.cliente, de: { fecha: ev.fecha, hora: ev.hora }, a: destino, motivo,
    },
    creado_por: 'gesty',
  });
  return { aplicado: false, requiere_ok: true, evento: ev, tarjeta };
}

function pedirCancelar(db, userId, id, datos, opts) {
  ensureSchema(db);
  const ev = getEvento(db, userId, id);
  if (!ev) fail('Ese compromiso no es de esta cuenta.');
  if (ev.estado !== 'activo') fail(`Ese compromiso ya está ${ev.estado}.`);
  const motivo = normTexto((datos || {}).motivo);
  if (!ev.toca_cliente) {
    const nuevo = aplicarCancelacion(db, userId, ev, motivo, (opts || {}).creado_por === 'gesty' ? 'gesty' : 'dueno', null);
    return { aplicado: true, requiere_ok: false, evento: nuevo, tarjeta: null };
  }
  const tarjeta = gesty.createCard(db, userId, {
    tipo: 'compromiso-cancelar',
    titulo: `Cancelar «${ev.titulo}» del ${ev.fecha}${ev.hora ? ' ' + ev.hora : ''}`,
    detalle: {
      evento_id: ev.id, titulo: ev.titulo, tipo_evento: ev.tipo,
      cliente: ev.cliente, fecha: ev.fecha, hora: ev.hora, motivo,
    },
    creado_por: 'gesty',
  });
  return { aplicado: false, requiere_ok: true, evento: ev, tarjeta };
}

// Los ejecutores de la matriz: el ÚNICO camino que aplica un cambio
// sobre un compromiso con cliente. Validan que el compromiso siga
// exactamente como la tarjeta lo preparó (si cambió debajo, la
// tarjeta vuelve con el motivo — patrón R6 de la fundación).
// Una tarjeta genérica sin evento_id (no nació de esta área) se
// sella «sin motor», como manda la semántica de G-02.
function ejecutarMoverCompromiso(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  if (!d.evento_id) return { ok: true, sin_motor: true };
  const ev = getEvento(db, userId, Number(d.evento_id));
  if (!ev) return { ok: false, motivo: 'El compromiso de esta tarjeta ya no existe.' };
  if (ev.estado !== 'activo') return { ok: false, motivo: `El compromiso ya está ${ev.estado}: no se mueve.` };
  if (!d.de || ev.fecha !== d.de.fecha || ev.hora !== (d.de.hora || '')) {
    return { ok: false, motivo: 'El compromiso cambió desde que se preparó esta tarjeta: hay que preparar el cambio de nuevo.' };
  }
  if (!d.a || !esFechaISO(d.a.fecha)) return { ok: false, motivo: 'La tarjeta no trae la fecha nueva del compromiso.' };
  const nuevo = aplicarMovimiento(db, userId, ev, { fecha: d.a.fecha, hora: d.a.hora || '' }, d.motivo || '', 'gesty', card.id);
  return {
    ok: true,
    evento: 'agenda-evento-movido', entidad_tipo: 'agenda-evento', entidad_id: String(ev.id),
    resumen: `Se movió «${ev.titulo}» al ${nuevo.fecha}${nuevo.hora ? ' ' + nuevo.hora : ''} (OK del dueño)`,
    payload: { tarjeta_id: card.id, de: d.de, a: { fecha: nuevo.fecha, hora: nuevo.hora } },
  };
}

function ejecutarCancelarCompromiso(db, userId, card) {
  ensureSchema(db);
  const d = (card && card.detalle) || {};
  if (!d.evento_id) return { ok: true, sin_motor: true };
  const ev = getEvento(db, userId, Number(d.evento_id));
  if (!ev) return { ok: false, motivo: 'El compromiso de esta tarjeta ya no existe.' };
  if (ev.estado !== 'activo') return { ok: false, motivo: `El compromiso ya está ${ev.estado}.` };
  if (ev.fecha !== d.fecha || ev.hora !== (d.hora || '')) {
    return { ok: false, motivo: 'El compromiso cambió desde que se preparó esta tarjeta: hay que preparar la cancelación de nuevo.' };
  }
  aplicarCancelacion(db, userId, ev, d.motivo || '', 'gesty', card.id);
  return {
    ok: true,
    evento: 'agenda-evento-cancelado', entidad_tipo: 'agenda-evento', entidad_id: String(ev.id),
    resumen: `Se canceló «${ev.titulo}» del ${ev.fecha} (OK del dueño)`,
    payload: { tarjeta_id: card.id, motivo: d.motivo || '' },
  };
}

gesty.registerExecutor('compromiso-mover', ejecutarMoverCompromiso);
gesty.registerExecutor('compromiso-cancelar', ejecutarCancelarCompromiso);

// ---------------------------------------------------------------------------
// LA VISTA COMPUESTA — se compone de las áreas, no se guarda
// ---------------------------------------------------------------------------

function itemFactura(f, hoy) {
  const fecha = f.vencimiento || f.fecha;
  if (!esFechaISO(fecha)) return null;
  return {
    fecha, hora: '', tipo: 'vencimiento-factura',
    titulo: `Vence la factura ${f.numero} · ${f.cliente.nombre || 'cliente'}`,
    detalle: `Saldo a cobrar · estado ${f.estado}`,
    monto: f.saldo, moneda: f.moneda || '',
    estado: fecha < hoy ? 'vencida' : 'por-vencer',
    fuente: { area: 'facturacion', entidad: 'factura', id: f.id, detalle: `Factura ${f.numero} de ${f.cliente.nombre || ''}`.trim() },
    propio: false, movible: false,
  };
}

function itemObligacion(ob, hoy) {
  if (!esFechaISO(ob.vencimiento)) return null;
  return {
    fecha: ob.vencimiento, hora: '', tipo: 'pago-proveedor',
    titulo: `Pagar a ${ob.proveedor.nombre || 'proveedor'}`,
    detalle: ob.saldo === null
      ? `Factura ${ob.comprobante.numero || ''} recibida · monto sin confirmar`.trim()
      : `Factura ${ob.comprobante.numero || ''} recibida · saldo a pagar`.trim(),
    monto: ob.saldo, moneda: ob.moneda || '',
    estado: ob.estado,
    fuente: { area: 'proveedores', entidad: 'comprobante', id: ob.comprobante_id, detalle: `Comprobante recibido de ${ob.proveedor.nombre || ''}`.trim() },
    propio: false, movible: false,
  };
}

function itemPresupuesto(p, hoy) {
  const hasta = p.vigencia && p.vigencia.hasta;
  if (!esFechaISO(hasta)) return null;
  return {
    fecha: hasta, hora: '', tipo: 'vencimiento-presupuesto',
    titulo: `Vence el presupuesto ${p.numero} · ${p.cliente.nombre || 'cliente'}`,
    detalle: p.estado === 'vencido' ? 'Venció sin respuesta registrada' : 'Enviado, esperando respuesta',
    monto: p.total, moneda: p.moneda || '',
    estado: p.estado === 'vencido' || hasta < hoy ? 'vencido' : 'por-vencer',
    fuente: { area: 'presupuestos', entidad: 'presupuesto', id: p.id, detalle: `Presupuesto ${p.numero} para ${p.cliente.nombre || ''}`.trim() },
    propio: false, movible: false,
  };
}

function itemFiscal(it) {
  return {
    fecha: it.fecha, hora: '', tipo: 'vencimiento-fiscal',
    titulo: `Vencimiento fiscal · ${it.concepto}`,
    detalle: 'Del calendario fiscal de tu fundamento',
    monto: it.monto, moneda: it.moneda || '',
    estado: 'por-vencer',
    fuente: { area: 'fiscal', entidad: 'calendario-fiscal', id: it.dato_id, detalle: `Dato «${it.fuente_campo}» del fundamento` },
    propio: false, movible: false,
  };
}

function itemTurno(b) {
  const bruto = String(b.starts_at || '');
  const fecha = bruto.slice(0, 10);
  if (!esFechaISO(fecha)) return null;
  const hora = esHora(bruto.slice(11, 16)) ? bruto.slice(11, 16) : '';
  return {
    fecha, hora, tipo: 'turno',
    titulo: `Turno · ${b.service || 'sin servicio'}${b.customer_name ? ' · ' + b.customer_name : ''}`,
    detalle: `Estado ${b.status} · se lee de la agenda de turnos, no se duplica`,
    monto: null, moneda: '',
    estado: b.status,
    fuente: { area: 'turnos', entidad: 'booking', id: b.id, detalle: `Turno de ${b.customer_name || 'cliente'} (${b.service || ''})`.trim() },
    propio: false, movible: false,
  };
}

function itemPropio(ev, conflictosIds) {
  return {
    fecha: ev.fecha, hora: ev.hora || '', tipo: 'evento',
    titulo: ev.titulo,
    detalle: ev.detalle || (ev.cliente ? `Con ${ev.cliente.nombre}` : ''),
    monto: null, moneda: '',
    estado: ev.estado,
    fuente: { area: 'agenda', entidad: 'agenda-evento', id: ev.id, detalle: `Compromiso propio (${ev.tipo})` },
    propio: true, movible: true,
    evento_id: ev.id, toca_cliente: ev.toca_cliente,
    conflicto: conflictosIds.has(ev.id),
  };
}

function ordenarItems(items) {
  return items.sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha))
    || String(a.hora || '99:99').localeCompare(String(b.hora || '99:99'))
    || String(a.tipo).localeCompare(String(b.tipo))
    || String(a.titulo).localeCompare(String(b.titulo)));
}

// Compone la agenda entre dos fechas (inclusive). Cada fuente se lee
// en vivo; si una falla, queda declarada en `fuentes` y las demás
// siguen — la vista nunca se cae por una fuente, ni inventa la que falta.
function componerAgenda(db, userId, opts) {
  ensureSchema(db);
  gesty.ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const desde = esFechaISO(o.desde) ? String(o.desde) : hoy;
  const hasta = esFechaISO(o.hasta) ? String(o.hasta) : desde;
  if (hasta < desde) fail('El rango de la agenda está invertido (hasta < desde).');
  const enRango = (f) => f >= desde && f <= hasta;
  const items = [];
  const fuentes = [];
  const sinFecha = [];

  const leerFuente = (clave, etiqueta, fn) => {
    try { const n = fn(); fuentes.push({ clave, etiqueta, estado: 'ok', cantidad: n }); }
    catch (e) { fuentes.push({ clave, etiqueta, estado: 'error', cantidad: 0, detalle: e.message }); }
  };

  leerFuente('facturas', 'Facturas por cobrar (Facturación)', () => {
    const { facturas } = facturacion.listFacturas(db, userId, { a_cobrar: true, limit: 500 });
    let n = 0;
    for (const f of facturas) { const it = itemFactura(f, hoy); if (it && enRango(it.fecha)) { items.push(it); n++; } }
    return n;
  });

  leerFuente('proveedores', 'Obligaciones con proveedores (Proveedores)', () => {
    const obs = proveedores.todasLasObligaciones(db, userId, hoy);
    let n = 0;
    for (const ob of obs) {
      if (ob.saldo !== null && ob.saldo <= 0) continue; // saldada: ya no compromete la agenda
      const it = itemObligacion(ob, hoy); if (it && enRango(it.fecha)) { items.push(it); n++; }
    }
    return n;
  });

  leerFuente('presupuestos', 'Presupuestos enviados (Presupuestos)', () => {
    const { presupuestos: lista } = presupuestos.listPresupuestos(db, userId, { hoy, limit: 500 });
    let n = 0;
    for (const p of lista) {
      if (p.estado !== 'enviado' && p.estado !== 'vencido') continue;
      const it = itemPresupuesto(p, hoy); if (it && enRango(it.fecha)) { items.push(it); n++; }
    }
    return n;
  });

  leerFuente('fiscal', 'Calendario fiscal (fundamento)', () => {
    const { conMonto, sinMonto } = reportes.vencimientosFiscalesFundamento(db, userId);
    let n = 0;
    for (const it of conMonto) { const item = itemFiscal(it); if (enRango(item.fecha)) { items.push(item); n++; } }
    // Lo que el fundamento trae SIN {fecha, monto} concretos NO se
    // fecha: se declara, con su motivo (patrón de honestidad G-06).
    for (const s of sinMonto) {
      const crudo = JSON.stringify(s.valor === undefined ? null : s.valor);
      const tieneFecha = /\d{4}-\d{2}-\d{2}/.test(crudo);
      sinFecha.push({
        fuente: { area: 'fiscal', entidad: 'calendario-fiscal', id: s.dato_id, detalle: `Dato «${s.campo}» del fundamento` },
        descripcion: typeof s.valor === 'string' ? s.valor : crudo,
        motivo: tieneFecha
          ? 'fecha-sin-monto: trae una fecha cargada pero ningún monto — no se convierte en evento de la agenda'
          : 'sin-fecha-concreta: es una regla (ej. «día 20»), no una fecha de este período — no se convierte en evento',
      });
    }
    return n;
  });

  leerFuente('turnos', 'Turnos del negocio (agenda de turnos)', () => {
    const lista = booking.listBookings(db, userId, { from: `${desde} 00:00`, to: `${hasta} 23:59`, limit: 500 });
    let n = 0;
    for (const b of lista) {
      if (b.status !== 'pending' && b.status !== 'confirmed') continue;
      const it = itemTurno(b); if (it && enRango(it.fecha)) { items.push(it); n++; }
    }
    return n;
  });

  leerFuente('agenda', 'Compromisos propios (Agenda)', () => {
    const { eventos } = listEventos(db, userId, { desde, hasta, estado: 'activo', limit: 1000 });
    const idsConflicto = new Set();
    for (const ev of eventos) for (const c of conflictosDe(db, userId, ev, ev.id)) idsConflicto.add(c.evento_id);
    for (const ev of eventos) if (conflictosDe(db, userId, ev, ev.id).length) idsConflicto.add(ev.id);
    for (const ev of eventos) items.push(itemPropio(ev, idsConflicto));
    return eventos.length;
  });

  ordenarItems(items);
  const porDia = {};
  for (let f = desde; f <= hasta; f = addDias(f, 1)) porDia[f] = [];
  for (const it of items) { if (!porDia[it.fecha]) porDia[it.fecha] = []; porDia[it.fecha].push(it); }

  return {
    desde, hasta, hoy,
    items, por_dia: porDia,
    compromisos_sin_fecha: sinFecha,
    fuentes,
    sincronizacion: estadoSincronizacion(),
  };
}

// El día de hoy compuesto, más el arrastre de lo que ya venció y
// sigue abierto (facturas por cobrar y obligaciones): es la base
// que consume la apertura del día y el Cierre del día (G-21).
function agendaHoy(db, userId, opts) {
  const o = opts || {};
  const hoy = hoyDe(o);
  const compuesta = componerAgenda(db, userId, { desde: hoy, hasta: hoy, hoy });
  const arrastreFacturas = [];
  const arrastreObligaciones = [];
  try {
    const { facturas } = facturacion.listFacturas(db, userId, { a_cobrar: true, limit: 500 });
    for (const f of facturas) { const it = itemFactura(f, hoy); if (it && it.fecha < hoy) arrastreFacturas.push(it); }
  } catch (e) { /* la fuente ya quedó declarada en `fuentes` */ }
  try {
    const obs = proveedores.todasLasObligaciones(db, userId, hoy);
    for (const ob of obs) {
      if (ob.estado !== 'vencida' || (ob.saldo !== null && ob.saldo <= 0)) continue;
      const it = itemObligacion(ob, hoy); if (it) arrastreObligaciones.push(it);
    }
  } catch (e) { /* idem */ }
  ordenarItems(arrastreFacturas);
  ordenarItems(arrastreObligaciones);
  return {
    fecha: hoy,
    items: compuesta.items,
    arrastre: {
      facturas_vencidas: arrastreFacturas.slice(0, 20),
      obligaciones_vencidas: arrastreObligaciones.slice(0, 20),
    },
    conteos: {
      hoy: compuesta.items.length,
      vencidas_sin_resolver: arrastreFacturas.length + arrastreObligaciones.length,
      sin_fecha: compuesta.compromisos_sin_fecha.length,
    },
    compromisos_sin_fecha: compuesta.compromisos_sin_fecha,
    fuentes: compuesta.fuentes,
    sincronizacion: compuesta.sincronizacion,
  };
}

// La semana desde hoy (7 días), día por día — la misma vista que
// entra en el reporte semanal (OS §3).
function agendaSemana(db, userId, opts) {
  const o = opts || {};
  const hoy = hoyDe(o);
  return componerAgenda(db, userId, { desde: hoy, hasta: addDias(hoy, 6), hoy });
}

// ---------------------------------------------------------------------------
// Configuración de recordatorios (fundamento · reglas del dueño)
// ---------------------------------------------------------------------------

function getConfig(db, userId) {
  gesty.ensureSchema(db);
  const dato = gesty.getData(db, userId, { grupo: 'reglas-dueno' }).find((d) => d.campo === 'agenda');
  const v = dato && dato.valor && typeof dato.valor === 'object' && !Array.isArray(dato.valor) ? dato.valor : {};
  return {
    anticipacion_dias: Number.isInteger(Number(v.anticipacion_dias)) && Number(v.anticipacion_dias) >= 0 && Number(v.anticipacion_dias) <= 30
      ? Number(v.anticipacion_dias) : CONFIG_DEFAULT.anticipacion_dias,
    activo: v.activo === undefined ? CONFIG_DEFAULT.activo : !!v.activo,
    es_default: !dato,
  };
}

function setConfig(db, userId, cambios) {
  const actual = getConfig(db, userId);
  const c = cambios || {};
  const nueva = {
    anticipacion_dias: c.anticipacion_dias === undefined ? actual.anticipacion_dias : Number(c.anticipacion_dias),
    activo: c.activo === undefined ? actual.activo : !!c.activo,
  };
  if (!Number.isInteger(nueva.anticipacion_dias) || nueva.anticipacion_dias < 0 || nueva.anticipacion_dias > 30) {
    fail('La anticipación de los recordatorios va de 0 a 30 días.');
  }
  gesty.setData(db, userId, {
    grupo: 'reglas-dueno', campo: 'agenda', valor: nueva,
    origen: 'dueno', origen_ref: 'ajustes-agenda', cargado_por: 'dueno',
  });
  return getConfig(db, userId);
}

// ---------------------------------------------------------------------------
// Recordatorios — corren solos, quedan en el registro durable
// ---------------------------------------------------------------------------

function claveRecordatorio(item) {
  return `${item.fuente.area}:${item.fuente.entidad}:${item.fuente.id}:${item.fecha}`;
}

function cuandoTexto(item, hoy) {
  const d = diffDias(hoy, item.fecha);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  return `el ${item.fecha}`;
}

// Procesa los recordatorios de la ventana [hoy, hoy + anticipación]
// según la configuración del fundamento. Un recordatorio por ítem y
// fecha (la clave vive en el registro: re-correr no duplica). La
// entrega REAL del canal queda en el evento: si el canal no entregó,
// el evento lo dice — jamás se registra un envío que no ocurrió.
async function procesarRecordatorios(db, userId, opts) {
  ensureSchema(db);
  const o = opts || {};
  const hoy = hoyDe(o);
  const config = getConfig(db, userId);
  const hasta = addDias(hoy, config.anticipacion_dias);
  const salida = { ventana: { desde: hoy, hasta }, config, emitidos: [], ya_emitidos: 0, desactivados: false };
  if (!config.activo) { salida.desactivados = true; return salida; }
  const compuesta = componerAgenda(db, userId, { desde: hoy, hasta, hoy });
  for (const item of compuesta.items) {
    const clave = claveRecordatorio(item);
    const previos = gesty.listEvents(db, userId, { entidad_tipo: 'agenda-recordatorio', entidad_id: clave })
      .filter((e) => e.tipo_evento === 'recordatorio-emitido');
    if (previos.length) { salida.ya_emitidos++; continue; }
    let entrega = 'sin-canal';
    try {
      const r = await notificar(userId, {
        title: 'Gesty · Tu agenda',
        body: `${item.titulo} — vence ${cuandoTexto(item, hoy)}${item.hora ? ' a las ' + item.hora : ''}.`,
        url: '/#/app',
        data: { codigo: clave, tipo: item.tipo },
      });
      entrega = r && r.ok ? 'enviado' : `sin-entrega:${(r && r.reason) || 'canal-sin-respuesta'}`;
    } catch (e) {
      entrega = `sin-entrega:${e.message || 'error-del-canal'}`;
    }
    gesty.recordEvent(db, userId, {
      actor: 'gesty', entidad_tipo: 'agenda-recordatorio', entidad_id: clave,
      tipo_evento: 'recordatorio-emitido',
      resumen: `Recordatorio: ${item.titulo} · ${cuandoTexto(item, hoy)}`,
      payload: {
        // («codigo», no «clave»: el registro durable depura toda clave
        // cuyo nombre huela a secreto — patrón de la fundación.)
        codigo: clave, fecha: item.fecha, hora: item.hora || '', tipo: item.tipo,
        fuente: item.fuente, anticipacion_dias: config.anticipacion_dias,
        canal: 'push', entrega,
      },
    });
    salida.emitidos.push({ clave, tipo: item.tipo, fecha: item.fecha, entrega });
  }
  return salida;
}

// ---------------------------------------------------------------------------

module.exports = {
  // constantes
  TIPOS_EVENTO, ESTADOS_EVENTO, CONFIG_DEFAULT,
  // configuración / inyección
  configure,
  // esquema
  ensureSchema,
  // sincronización (estado honesto)
  estadoSincronizacion,
  // eventos propios
  crearEvento, getEvento, listEventos, editarEvento, cumplirEvento,
  // mover / cancelar (matriz)
  pedirMover, pedirCancelar, ejecutarMoverCompromiso, ejecutarCancelarCompromiso,
  // la vista compuesta
  componerAgenda, agendaHoy, agendaSemana,
  // recordatorios
  getConfig, setConfig, procesarRecordatorios,
  // piezas internas, exportadas para tests y reuso
  claveRecordatorio, conflictosDe,
};
