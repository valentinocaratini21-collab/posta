#!/usr/bin/env node
// test-gesty-agenda.js — G-09 · AGENDA ADMINISTRATIVA. Spec:
// gesty-cola-builds.md G-09, gesty-areas-detalle.md §4,
// gesty-sistema-operativo.md §2.4/§5, gesty-build-spec.md §12.
// Cubre: la vista compuesta se arma desde las áreas (factura que
// vence hoy, obligación de proveedor, presupuesto que vence,
// vencimiento fiscal estructurado, turno de booking.js leído y
// compromiso propio) con la FUENTE citada en cada ítem — cero
// eventos huérfanos · la regla fiscal «día 15» NO se fecha: se
// declara en compromisos_sin_fecha (y la que trae fecha sin monto,
// también, con su motivo) · lo vencido y abierto va al arrastre ·
// mover un compromiso CON cliente exige la tarjeta de la matriz
// (sin OK no se mueve; con OK lo aplica el ejecutor) · el interno
// se mueve directo · cancelar sigue la misma regla · el conflicto
// de horario se detecta y se muestra · recordatorios por el canal
// inyectado con su evento en el registro durable, sin duplicar al
// re-correr, y con la entrega REAL (sin-entrega cuando el canal no
// entrega) · sincronización declarada «sin-conectar» (no existe
// integración de calendario externo en la app) · separación por
// cuenta · gating (401/403 y capacidad «agenda») en HTTP.
// Uso: node test-gesty-agenda.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 220) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');
function lanza(fn) { try { fn(); return null; } catch (e) { return e; } }

const gesty = require('./gesty.js');
const agenda = require('./gesty-agenda.js');
const fact = require('./gesty-facturacion.js');
const comp = require('./gesty-comprobantes.js');
const pres = require('./gesty-presupuestos.js');
const booking = require('./booking.js');

const HOY = '2026-10-21';
const CUIT_PROPIO = '20123456786';
const CUIT_ESPIGA = '27234567891';
const CUIT_PROV = '30555555551';

// Email falso para el envío del presupuesto sembrado (patrón casa).
pres.configure({ sendEmail: async () => ({ ok: true, id: 'resend-test-g09' }) });

function dbConPack(pack) {
  const db = nuevaDb();
  gesty.setPack(db, 1, pack, { origen: 'checkout', actor: 'sistema' });
  return db;
}
function sembrarBase(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_ESPIGA}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_ESPIGA, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}
async function facturaEnviada(db, uid, datos) {
  const f = fact.crearBorrador(db, uid, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: datos.concepto || 'Service de cámara', cantidad: 1, precio_unitario: datos.precio, alicuota_iva: 21 }],
    fecha: datos.fecha, vencimiento: datos.vencimiento,
  });
  const p = fact.pedirOK(db, uid, f.id);
  const ap = gesty.approveCard(db, uid, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación de emisión tiene que salir');
  const env = await fact.enviarFactura(db, uid, f.id, { canal: 'whatsapp-manual', comprobante: 'wa-fact-g09', destinatario: 'Panadería La Espiga' });
  return env.factura;
}
function obligacionProveedor(db, uid, datos) {
  const r = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: datos.nombre || 'Repuestos del Sur S.A.', emisor_cuit: datos.cuit || CUIT_PROV,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.vencimiento,
    moneda: 'ARS', monto_total: datos.monto, concepto: datos.concepto || 'Compra de repuestos',
    clasificacion: 'gasto',
  });
  assert(r.comprobante && r.comprobante.estado_lectura === 'leido', 'el comprobante sembrado tiene que nacer leído');
  return r.comprobante;
}
async function presupuestoEnviado(db, uid) {
  pres.setPolitica(db, uid, { validez_dias: 2, seguimiento_dias: 1, canal: 'email' });
  const p = pres.crearBorrador(db, uid, {
    cliente: { cuit: CUIT_ESPIGA },
    pedido_texto: 'Instalación de cámara frigorífica',
    canal: 'email',
    items: [{ descripcion: 'Cámara frigorífica — instalación completa', cantidad: 1, precio_unitario: 100000, alicuota_iva: 21 }],
  });
  const ped = pres.pedirOK(db, uid, p.id);
  const ap = gesty.approveCard(db, uid, ped.tarjeta.id, { version_documento: ped.tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación del presupuesto tiene que salir');
  const env = await pres.enviarPresupuesto(db, uid, p.id, { hoy: HOY });
  assert(env.presupuesto.estado === 'enviado' && env.presupuesto.vigencia.hasta === '2026-10-23',
    'el presupuesto sembrado vence el 2026-10-23: ' + JSON.stringify(env.presupuesto.vigencia));
  return env.presupuesto;
}
const fuenteDe = (items, tipo) => items.find((i) => i.tipo === tipo);

(async () => {

// ---------------- La vista compuesta: el día y la semana ----------------
console.log('— unidad: la agenda se compone de las áreas, con fuente citada');
const db = dbConPack('completa');
sembrarBase(db, 1);

const fHoy = await facturaEnviada(db, 1, { fecha: '2026-10-10', vencimiento: HOY, precio: 100000, concepto: 'Service de cámara' });
const fVencida = await facturaEnviada(db, 1, { fecha: '2026-10-05', vencimiento: '2026-10-19', precio: 50000, concepto: 'Reparación de motor' });
const compProv = obligacionProveedor(db, 1, { numero: '0001-00001234', fecha: '2026-10-15', vencimiento: '2026-10-22', monto: 80000 });
const presEnv = await presupuestoEnviado(db, 1);
gesty.setData(db, 1, {
  grupo: 'calendario-fiscal', campo: 'iva',
  valor: { concepto: 'IVA', fecha: '2026-10-23', monto: 5000, moneda: 'ARS' },
  origen: 'dueno', origen_ref: 'puesta-en-marcha', cargado_por: 'dueno',
});
gesty.setData(db, 1, { grupo: 'calendario-fiscal', campo: 'vencimiento_iibb', valor: 'día 15', origen: 'rubro', origen_ref: 'ficha-rubro', cargado_por: 'gesty' });
gesty.setData(db, 1, {
  grupo: 'calendario-fiscal', campo: 'ganancias',
  valor: { concepto: 'Ganancias', fecha: '2026-10-25' },
  origen: 'dueno', origen_ref: 'puesta-en-marcha', cargado_por: 'dueno',
});
const turno = booking.createBooking(db, 1, {
  service: 'Service de cámara', customer_name: 'Panadería La Espiga', customer_contact: 'laespiga@example.com',
  starts_at: `${HOY}T10:00:00.000Z`, duration_min: 60, autoConfirm: true, // booking.js guarda starts_at como ISO UTC (su contrato): la semilla va en UTC explícito para que la suite no dependa de la zona horaria del proceso
});
const entrega = agenda.crearEvento(db, 1, {
  titulo: 'Entrega de cámara reparada', tipo: 'entrega', fecha: HOY, hora: '09:00', duracion_min: 60,
  cliente_nombre: 'Panadería La Espiga', cliente_contacto: 'laespiga@example.com',
}, { creado_por: 'dueno' }).evento;

const hoy = agenda.agendaHoy(db, 1, { hoy: HOY });
const itemF = fuenteDe(hoy.items, 'vencimiento-factura');
ok('hoy: la factura que vence hoy está, con su fuente de Facturación',
  !!itemF && itemF.fuente.area === 'facturacion' && itemF.fuente.id === fHoy.id && itemF.monto === fHoy.saldo && itemF.estado === 'por-vencer',
  JSON.stringify(itemF || {}));
const itemT = fuenteDe(hoy.items, 'turno');
ok('hoy: el turno de la agenda de turnos se lee sin duplicar (fuente booking)',
  !!itemT && itemT.fuente.area === 'turnos' && itemT.fuente.id === turno.id && itemT.hora === '10:00',
  JSON.stringify(itemT || {}));
const itemE = fuenteDe(hoy.items, 'evento');
ok('hoy: el compromiso propio está, marcado propio y movible',
  !!itemE && itemE.propio === true && itemE.movible === true && itemE.evento_id === entrega.id,
  JSON.stringify(itemE || {}));
ok('hoy: la factura vencida NO se cuela en el día — va al arrastre',
  !hoy.items.some((i) => i.tipo === 'vencimiento-factura' && i.fuente.id === fVencida.id)
  && hoy.arrastre.facturas_vencidas.some((i) => i.fuente.id === fVencida.id && i.estado === 'vencida'),
  JSON.stringify(hoy.arrastre));
ok('hoy: conteos coherentes (día, arrastre y sin-fecha)',
  hoy.conteos.hoy === hoy.items.length && hoy.conteos.vencidas_sin_resolver === 1 && hoy.conteos.sin_fecha === 2,
  JSON.stringify(hoy.conteos));
ok('sincronización: la respuesta declara «sin-conectar» (nada se finge)',
  hoy.sincronizacion.externa === 'sin-conectar' && /ningún calendario externo/.test(hoy.sincronizacion.detalle));
ok('fuentes: las seis leyeron bien y declaran su cantidad',
  hoy.fuentes.length === 6 && hoy.fuentes.every((f) => f.estado === 'ok'),
  JSON.stringify(hoy.fuentes));

const semana = agenda.agendaSemana(db, 1, { hoy: HOY });
ok('semana: el rango es hoy + 6 con los 7 días presentes en por_dia',
  semana.desde === HOY && semana.hasta === '2026-10-27' && Object.keys(semana.por_dia).length === 7,
  JSON.stringify({ desde: semana.desde, hasta: semana.hasta }));
const itemOb = fuenteDe(semana.items, 'pago-proveedor');
ok('semana: la obligación del proveedor vence el 22 con la fuente en su comprobante',
  !!itemOb && itemOb.fecha === '2026-10-22' && itemOb.fuente.area === 'proveedores' && itemOb.fuente.id === compProv.id && itemOb.monto === 80000,
  JSON.stringify(itemOb || {}));
const itemP = fuenteDe(semana.items, 'vencimiento-presupuesto');
ok('semana: el presupuesto enviado vence el 23 con su fuente en Presupuestos',
  !!itemP && itemP.fecha === '2026-10-23' && itemP.fuente.area === 'presupuestos' && itemP.fuente.id === presEnv.id,
  JSON.stringify(itemP || {}));
const itemFis = fuenteDe(semana.items, 'vencimiento-fiscal');
ok('semana: el vencimiento fiscal estructurado {fecha, monto} entra fechado, con su monto',
  !!itemFis && itemFis.fecha === '2026-10-23' && itemFis.monto === 5000 && itemFis.fuente.area === 'fiscal',
  JSON.stringify(itemFis || {}));
ok('cero eventos huérfanos: TODO ítem de la semana cita área, entidad e id de su fuente',
  semana.items.length >= 6 && semana.items.every((i) => i.fuente && i.fuente.area && i.fuente.entidad
    && i.fuente.id !== undefined && i.fuente.id !== null && i.fuente.id !== ''),
  JSON.stringify(semana.items.map((i) => i.fuente)));
ok('la regla «día 15» NO se convirtió en evento fechado: ningún ítem sale de ese dato',
  !semana.items.some((i) => i.tipo === 'vencimiento-fiscal' && i.fecha === '2026-10-15'),
  JSON.stringify(semana.items.filter((i) => i.tipo === 'vencimiento-fiscal')));
const sinFecha = semana.compromisos_sin_fecha;
const declRegla = sinFecha.find((s) => s.fuente.detalle.includes('vencimiento_iibb'));
const declFechaSinMonto = sinFecha.find((s) => s.fuente.detalle.includes('ganancias'));
ok('sin fecha: la regla «día 15» se declara con su motivo (sin-fecha-concreta)',
  !!declRegla && declRegla.motivo.startsWith('sin-fecha-concreta'), JSON.stringify(sinFecha));
ok('sin fecha: la que trae fecha pero no monto se declara con SU motivo (fecha-sin-monto), no se fecha',
  !!declFechaSinMonto && declFechaSinMonto.motivo.startsWith('fecha-sin-monto')
  && !semana.items.some((i) => i.tipo === 'vencimiento-fiscal' && i.fecha === '2026-10-25'),
  JSON.stringify(sinFecha));

// ---------------- Conflictos: se detectan y se muestran ----------------
console.log('— unidad: conflictos de horario');
const choque = agenda.crearEvento(db, 1, {
  titulo: 'Visita que pisa la entrega', tipo: 'visita', fecha: HOY, hora: '09:15', duracion_min: 30,
}, {});
ok('conflicto: crear un compromiso que pisa otro lo DETECTA y lo muestra (no lo pisa en silencio)',
  choque.conflictos.length === 1 && choque.conflictos[0].evento_id === entrega.id,
  JSON.stringify(choque.conflictos));
const hoy2 = agenda.agendaHoy(db, 1, { hoy: HOY });
ok('conflicto: la vista marca los dos compromisos en conflicto',
  hoy2.items.filter((i) => i.propio && i.conflicto).length === 2,
  JSON.stringify(hoy2.items.filter((i) => i.propio)));

// ---------------- Mover / cancelar: la matriz manda ----------------
console.log('— unidad: mover y cancelar (con cliente = tarjeta; interno = directo)');
const antes = agenda.getEvento(db, 1, entrega.id);
const pedidoMover = agenda.pedirMover(db, 1, entrega.id, { fecha: '2026-10-24', hora: '11:00', motivo: 'el cliente pidió pasarla' });
ok('mover con cliente: nace la tarjeta «compromiso-mover» con el cambio completo',
  pedidoMover.aplicado === false && pedidoMover.requiere_ok === true && pedidoMover.tarjeta.tipo === 'compromiso-mover'
  && pedidoMover.tarjeta.detalle.de.fecha === HOY && pedidoMover.tarjeta.detalle.a.fecha === '2026-10-24'
  && pedidoMover.tarjeta.detalle.cliente.nombre === 'Panadería La Espiga',
  JSON.stringify(pedidoMover.tarjeta || {}));
ok('mover con cliente: SIN el OK el compromiso NO se movió',
  agenda.getEvento(db, 1, entrega.id).fecha === antes.fecha && agenda.getEvento(db, 1, entrega.id).hora === antes.hora);
const apMover = gesty.approveCard(db, 1, pedidoMover.tarjeta.id, { version_documento: pedidoMover.tarjeta.version_documento, usuario: 'dueno' });
const movido = agenda.getEvento(db, 1, entrega.id);
ok('mover con cliente: tras el OK, el ejecutor aplicó el cambio',
  apMover.ok === true && movido.fecha === '2026-10-24' && movido.hora === '11:00',
  JSON.stringify({ ok: apMover.ok, movido }));
ok('mover con cliente: el cambio quedó en el registro durable, con su motivo',
  gesty.listEvents(db, 1, { entidad_tipo: 'agenda-evento', entidad_id: String(entrega.id) })
    .some((e) => e.tipo_evento === 'agenda-evento-movido' && e.payload.motivo === 'el cliente pidió pasarla' && e.payload.tarjeta_id === pedidoMover.tarjeta.id));

const interno = agenda.crearEvento(db, 1, {
  titulo: 'Ordenar el depósito', tipo: 'tarea', fecha: '2026-10-22', hora: '08:00',
}, {}).evento;
const moverInterno = agenda.pedirMover(db, 1, interno.id, { fecha: '2026-10-23' });
ok('mover interno: se aplica directo, SIN tarjeta (autopilot de agenda interna)',
  moverInterno.aplicado === true && moverInterno.tarjeta === null && agenda.getEvento(db, 1, interno.id).fecha === '2026-10-23',
  JSON.stringify(moverInterno));
const cancelInterno = agenda.pedirCancelar(db, 1, interno.id, { motivo: 'ya se hizo' });
ok('cancelar interno: directo, con el motivo en el registro',
  cancelInterno.aplicado === true && agenda.getEvento(db, 1, interno.id).estado === 'cancelado'
  && gesty.listEvents(db, 1, { entidad_tipo: 'agenda-evento', entidad_id: String(interno.id) })
    .some((e) => e.tipo_evento === 'agenda-evento-cancelado' && e.payload.motivo === 'ya se hizo'));

const conCliente2 = agenda.crearEvento(db, 1, {
  titulo: 'Visita de medición', tipo: 'visita', fecha: '2026-10-25', hora: '10:00',
  cliente_nombre: 'Panadería La Espiga',
}, {}).evento;
const pedidoCancelar = agenda.pedirCancelar(db, 1, conCliente2.id, { motivo: 'el cliente canceló' });
ok('cancelar con cliente: tarjeta «compromiso-cancelar» y el compromiso sigue activo hasta el OK',
  pedidoCancelar.aplicado === false && pedidoCancelar.tarjeta.tipo === 'compromiso-cancelar'
  && agenda.getEvento(db, 1, conCliente2.id).estado === 'activo');
const apCanc = gesty.approveCard(db, 1, pedidoCancelar.tarjeta.id, { version_documento: pedidoCancelar.tarjeta.version_documento, usuario: 'dueno' });
ok('cancelar con cliente: tras el OK queda cancelado, con su motivo guardado',
  apCanc.ok === true && agenda.getEvento(db, 1, conCliente2.id).estado === 'cancelado'
  && agenda.getEvento(db, 1, conCliente2.id).motivo_estado === 'el cliente canceló');

const errEditar = lanza(() => agenda.editarEvento(db, 1, entrega.id, { fecha: '2026-10-26' }));
ok('editar con fecha se rechaza: cambiar el cuándo es MOVER, con su flujo',
  !!errEditar && /mover/i.test(errEditar.message), errEditar && errEditar.message);
const errMoverCancelado = lanza(() => agenda.pedirMover(db, 1, conCliente2.id, { fecha: '2026-10-26' }));
ok('un compromiso cancelado no se mueve', !!errMoverCancelado);

// La tarjeta preparada sobre un compromiso que CAMBIÓ debajo vuelve.
const conCliente3 = agenda.crearEvento(db, 1, {
  titulo: 'Entrega de repuestos', tipo: 'entrega', fecha: '2026-10-26', hora: '09:00', cliente_nombre: 'Panadería La Espiga',
}, {}).evento;
const pedido3 = agenda.pedirMover(db, 1, conCliente3.id, { fecha: '2026-10-27' });
// El dueño mueve el compromiso por la vía interna de otro pedido? No:
// toca cliente — lo movemos a mano en la base para simular el cambio debajo.
db.prepare("UPDATE gesty_agenda_eventos SET fecha = '2026-10-28' WHERE id = ?").run(conCliente3.id);
const apVieja = gesty.approveCard(db, 1, pedido3.tarjeta.id, { version_documento: pedido3.tarjeta.version_documento, usuario: 'dueno' });
ok('tarjeta vieja: si el compromiso cambió desde la preparación, la aprobación se devuelve y NO aplica',
  apVieja.ok === false && agenda.getEvento(db, 1, conCliente3.id).fecha === '2026-10-28',
  JSON.stringify({ ok: apVieja.ok, motivo: apVieja.motivo }));

// ---------------- Recordatorios: canal, registro, sin duplicar ----------------
console.log('— unidad: recordatorios con registro durable');
const avisos = [];
agenda.configure({ notify: async (uid, payload) => { avisos.push({ uid, payload }); return { ok: true }; } });
agenda.setConfig(db, 1, { anticipacion_dias: 1, activo: true });
const rec1 = await agenda.procesarRecordatorios(db, 1, { hoy: HOY });
const claveFactura = agenda.claveRecordatorio({ fuente: { area: 'facturacion', entidad: 'factura', id: fHoy.id }, fecha: HOY });
ok('recordatorios: la ventana [hoy, hoy+1] emitió por el canal inyectado',
  rec1.emitidos.length >= 3 && avisos.length === rec1.emitidos.length,
  JSON.stringify({ emitidos: rec1.emitidos.length, avisos: avisos.length }));
const evRec = gesty.listEvents(db, 1, { entidad_tipo: 'agenda-recordatorio', entidad_id: claveFactura });
ok('recordatorios: el de la factura quedó en el registro durable con entrega «enviado»',
  evRec.some((e) => e.tipo_evento === 'recordatorio-emitido' && e.payload.entrega === 'enviado' && e.payload.codigo === claveFactura),
  JSON.stringify(evRec.map((e) => e.tipo_evento)));
const rec2 = await agenda.procesarRecordatorios(db, 1, { hoy: HOY });
ok('recordatorios: re-correr NO duplica (la clave vive en el registro)',
  rec2.emitidos.length === 0 && rec2.ya_emitidos === rec1.emitidos.length && avisos.length === rec1.emitidos.length,
  JSON.stringify({ emitidos: rec2.emitidos.length, ya: rec2.ya_emitidos }));

// El canal que no entrega: el registro lo DICE, no lo finge.
const db2 = dbConPack('completa');
gesty.setPack(db2, 2, 'completa', { origen: 'checkout', actor: 'sistema' });
sembrarBase(db2, 2);
const f2 = await facturaEnviada(db2, 2, { fecha: '2026-10-10', vencimiento: HOY, precio: 10000 });
agenda.configure({ notify: async () => ({ ok: false, reason: 'no_subs' }) });
const recFallo = await agenda.procesarRecordatorios(db2, 2, { hoy: HOY });
const clave2 = agenda.claveRecordatorio({ fuente: { area: 'facturacion', entidad: 'factura', id: f2.id }, fecha: HOY });
const evFallo = gesty.listEvents(db2, 2, { entidad_tipo: 'agenda-recordatorio', entidad_id: clave2 });
ok('recordatorios sin entrega: el evento registra «sin-entrega:no_subs», jamás un envío fingido',
  recFallo.emitidos.length === 1 && evFallo.length === 1 && evFallo[0].payload.entrega === 'sin-entrega:no_subs',
  JSON.stringify(evFallo.map((e) => e.payload)));
agenda.setConfig(db2, 2, { activo: false });
const recOff = await agenda.procesarRecordatorios(db2, 2, { hoy: '2026-10-20' });
ok('recordatorios desactivados en el fundamento: no sale ninguno y se declara',
  recOff.desactivados === true && recOff.emitidos.length === 0);

// ---------------- Separación por cuenta ----------------
console.log('— unidad: separación por cuenta');
const hoyAjena = agenda.agendaHoy(db, 2, { hoy: HOY });
ok('otra cuenta (sin datos) ve SU agenda vacía, nunca la ajena',
  hoyAjena.items.length === 0 && hoyAjena.conteos.vencidas_sin_resolver === 0);
ok('el compromiso ajeno no se lee ni se mueve desde otra cuenta',
  agenda.getEvento(db, 2, entrega.id) === null
  && !!lanza(() => agenda.pedirMover(db, 2, entrega.id, { fecha: '2026-10-30' })));

// ---------------- Cableado (estático, el patrón de la casa) ----------------
console.log('— cableado en server.js');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
ok('server.js monta gesty-agenda detrás de requireAuth + gating + capacidad «agenda»',
  srv.includes("require('./gesty-agenda')") && srv.includes('const gestyAgendaMW = [requireAuth, gesty.gestyMiddleware(db), gesty.capacidadMiddleware(db, \'agenda\')]'));
ok('server.js inyecta el push de la app como canal de recordatorios',
  srv.includes('gestyAgenda.configure({ notify: (uid, payload) => push.sendPush(uid, payload) })'));
ok('el módulo registra los ejecutores de la matriz «compromiso-mover» y «compromiso-cancelar»',
  fs.readFileSync(path.join(__dirname, 'gesty-agenda.js'), 'utf8').includes("registerExecutor('compromiso-mover'")
  && fs.readFileSync(path.join(__dirname, 'gesty-agenda.js'), 'utf8').includes("registerExecutor('compromiso-cancelar'"));

// ---------------- HTTP: flujo completo ----------------
const PORT = 3992;
const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, body, cookie) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid };
}

console.log('— http: gating, capacidad y recorrido con el server booteado');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g09-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let listo = false;
for (let i = 0; i < 60 && !listo; i++) {
  try { const r = await fetch(`${BASE}/api/version`); listo = r.status > 0; } catch (e) { await new Promise((r) => setTimeout(r, 500)); }
}
try {
  ok('el server booteó', listo);
  const reg = await call('POST', '/api/auth/register', { email: 'g09@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/agenda/hoy', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/agenda/hoy', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g09@example.com');
  dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'admin-familia')").run(u.id);
  const conEsencial = await call('GET', '/api/gesty/agenda/hoy', null, reg.cookie);
  ok('gating http: pack Esencial NO trae la capacidad agenda → 403', conEsencial.status === 403, String(conEsencial.status));
  dbFile.prepare("UPDATE gesty_subscriptions SET pack = 'completa' WHERE user_id = ?").run(u.id);
  dbFile.close();

  const creado = await call('POST', '/api/gesty/agenda/eventos', {
    titulo: 'Entrega al cliente web', tipo: 'entrega', fecha: HOY, hora: '12:00',
    cliente_nombre: 'Cliente Web', cliente_contacto: 'web@example.com',
  }, reg.cookie);
  ok('http: crear el compromiso propio → 200, nace con cliente (toca_cliente)',
    creado.status === 200 && creado.data.evento && creado.data.evento.toca_cliente === true,
    JSON.stringify(creado.data).slice(0, 200));
  const evId = creado.data.evento.id;

  const hoyHttp = await call('GET', `/api/gesty/agenda/hoy?fecha=${HOY}`, null, reg.cookie);
  ok('http: el día compuesto incluye el compromiso y declara la sincronización',
    hoyHttp.status === 200 && hoyHttp.data.items.some((i) => i.propio && i.evento_id === evId)
    && hoyHttp.data.sincronizacion.externa === 'sin-conectar',
    JSON.stringify(hoyHttp.data).slice(0, 200));

  const moverHttp = await call('POST', `/api/gesty/agenda/eventos/${evId}/mover`, { fecha: '2026-10-24' }, reg.cookie);
  ok('http: mover CON cliente prepara la tarjeta y NO aplica el cambio',
    moverHttp.status === 200 && moverHttp.data.aplicado === false && moverHttp.data.tarjeta.tipo === 'compromiso-mover',
    JSON.stringify(moverHttp.data).slice(0, 200));
  const sigueHoy = await call('GET', `/api/gesty/agenda/hoy?fecha=${HOY}`, null, reg.cookie);
  ok('http: sin el OK, el compromiso sigue en su fecha en la agenda',
    sigueHoy.data.items.some((i) => i.propio && i.evento_id === evId));
  const aprobHttp = await call('POST', `/api/gesty/bandeja/${moverHttp.data.tarjeta.id}/aprobar`,
    { version_documento: moverHttp.data.tarjeta.version_documento }, reg.cookie);
  ok('http: aprobar la tarjeta en la bandeja → 200 y el ejecutor mueve el compromiso',
    aprobHttp.status === 200 && aprobHttp.data.ok === true, JSON.stringify(aprobHttp.data).slice(0, 160));
  const dia24 = await call('GET', '/api/gesty/agenda/hoy?fecha=2026-10-24', null, reg.cookie);
  ok('http: el compromiso ya se lee en su fecha nueva',
    dia24.data.items.some((i) => i.propio && i.evento_id === evId));

  const regB = await call('POST', '/api/auth/register', { email: 'g09-otra@example.com', password: 'secreto2' });
  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  const uB = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('g09-otra@example.com');
  dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'total', 'checkout')").run(uB.id);
  dbFile2.close();
  const hoyB = await call('GET', `/api/gesty/agenda/hoy?fecha=${HOY}`, null, regB.cookie);
  ok('http: otra cuenta con pack ve SU agenda (vacía), nunca la ajena',
    hoyB.status === 200 && hoyB.data.items.length === 0);
  const detalleB = await call('GET', `/api/gesty/agenda/eventos/${evId}`, null, regB.cookie);
  ok('http: el compromiso ajeno → 400', detalleB.status === 400, String(detalleB.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
