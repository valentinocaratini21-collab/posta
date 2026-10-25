#!/usr/bin/env node
// test-gesty-reglas.js — G-20 · REGLAS APRENDIDAS DEL NEGOCIO.
// Spec: gesty-cola-builds.md G-20 (aceptación: «patrón sembrado
// (3 repeticiones) genera UNA propuesta; aprobada, el 4.º caso se
// procesa solo y el evento cita la regla; ninguna regla salta la
// matriz de aprobación») + la FRONTERA DURA de la cola («una regla
// aprendida JAMÁS habilita saltear una aprobación de la matriz;
// si un patrón sugiere tocar una acción de matriz, la propuesta
// es informativa y la tarjeta sigue naciendo igual»).
// Cubre: los tres patrones propuestos con su evidencia citada ·
// base insuficiente declarada, no propuesta · segundo escaneo sin
// duplicar · aprobar → la regla vive en el fundamento con su
// procedencia y la de clasificación SE APLICA en G-03 con el
// rastro «regla-aprendida-<id>» en el papel y en el evento · las
// sugerencias consumibles de pago (G-07) y descuento (G-08) ·
// descartar no re-propone y el refuerzo doble reaparece UNA vez ·
// revocar apaga la aplicación sin borrar la historia · la
// corrección del dueño debilita y la segunda desactiva la regla ·
// TEST DE FRONTERA: con todas las reglas activas, ninguna tarjeta
// se aprueba ni se ejecuta sola y ningún envío ocurre (verificado
// sobre el registro durable) · el ritmo de aprobaciones del dueño
// se registra como OBSERVACIÓN, sin propuesta · separación por
// cuenta · gating HTTP (401 / 403 / 200).
// Uso: node test-gesty-reglas.js
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
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 240) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');
function lanza(fn) { try { fn(); return null; } catch (e) { return e; } }

const gesty = require('./gesty.js');
const comp = require('./gesty-comprobantes.js');
const prov = require('./gesty-proveedores.js');
const pres = require('./gesty-presupuestos.js');
const reglas = require('./gesty-reglas.js');

pres.configure({ sendEmail: async () => ({ ok: true, id: 'resend-test-g20' }) });

const CUIT_PROPIO = '20123456786';    // Refrigeración Sosa
const CUIT_SUR = '30123456781';       // Distribuidora Sur S.A.
const CUIT_FLETES = '30567890127';    // Fletes Andina
const CUIT_PAPELERA = '30611223344';  // Papelera Andina
const CUIT_MOLINO = '27234567891';    // Panadería El Molino
const CUIT_TORO = '20333333334';      // cliente ocasional
const HOY = '2026-10-24';

function dbConPack(pack) {
  const db = nuevaDb();
  gesty.initGesty(db);
  reglas.ensureSchema(db);
  gesty.setPack(db, 1, pack, { origen: 'checkout', actor: 'sistema' });
  return db;
}
function sembrarPropio(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
}
function sembrarCliente(db, uid, cuit, nombre) {
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${cuit}`,
    valor: { nombre, cuit, condicion_iva: 'Responsable inscripto', email: 'cliente@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}
function facturaProveedor(db, uid, d) {
  const r = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: d.nombre, emisor_cuit: d.cuit,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: d.numero, fecha: d.fecha, vencimiento: d.vencimiento || d.fecha,
    moneda: 'ARS', monto_total: d.monto, concepto: d.concepto || 'Compra de mercadería',
    ...(d.clasificacion ? { clasificacion: d.clasificacion } : {}),
  });
  assert(r.comprobante && r.comprobante.estado_lectura === 'leido', 'la factura semilla tiene que nacer leída: ' + JSON.stringify(r.comprobante));
  return r.comprobante;
}
let nPapelPago = 0;
function papelDePago(db, uid, d) {
  nPapelPago++;
  const r = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'emitida',
    emisor_nombre: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
    receptor_nombre: d.para, receptor_cuit: d.cuit,
    numero: `9000-${String(nPapelPago).padStart(8, '0')}`, fecha: d.fecha, vencimiento: '',
    moneda: 'ARS', monto_total: d.monto, concepto: 'Comprobante de transferencia',
  });
  assert(r.comprobante, 'el papel de pago tiene que archivarse');
  return r.comprobante;
}
// El recorrido REAL de G-07: orden → tarjeta → OK del dueño →
// pago asentado con su papel. Es la única forma de que exista un
// pago observable: Gesty no mueve plata.
function pagarFactura(db, uid, factura, d) {
  const orden = prov.prepararOrden(db, uid, { comprobante_ids: [factura.id] });
  prov.pedirOKOrden(db, uid, orden.id);
  const tarjeta = gesty.listCards(db, uid, {}).find((c) => c.tipo === 'pago-proveedor' && c.detalle.orden_id === orden.id);
  const ap = gesty.approveCard(db, uid, tarjeta.id, { version_documento: tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación de la orden semilla tiene que salir');
  const papel = papelDePago(db, uid, { para: d.nombre, cuit: d.cuit, monto: factura.monto_total, fecha: d.fechaPago });
  return prov.registrarPagoOrden(db, uid, orden.id, { comprobante_pago_id: papel.id });
}
async function presupuestoEnviado(db, uid, d) {
  const p = pres.crearBorrador(db, uid, { cliente: { cuit: d.cuit }, items: d.items, fecha: d.fecha });
  pres.pedirOK(db, uid, p.id, {});
  const t = gesty.getCard(db, uid, pres.getPresupuesto(db, uid, p.id).tarjeta_id);
  const ap = gesty.approveCard(db, uid, t.id, { version_documento: t.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación del presupuesto semilla tiene que salir');
  await pres.enviarPresupuesto(db, uid, p.id, { hoy: d.fecha });
  return pres.getPresupuesto(db, uid, p.id);
}
const propuestaDe = (esc, tipo) => (esc.creadas || []).find((p) => p.tipo === tipo);

(async () => {

// ---------------- Unidad: piezas puras ----------------
console.log('— unidad: mediana y clave de contraparte (la misma de G-03/G-07)');
ok('mediana de los plazos sembrados = 7', reglas.mediana([7, 7, 8, 6, 7]) === 7);
ok('la clave de contraparte coincide con la de G-07',
  reglas.campoContraparte('Repuestos del Sur S.A.', CUIT_SUR) === prov.campoProveedorDe('Repuestos del Sur S.A.', CUIT_SUR));

// ---------------- Bloque A: detección de los tres patrones ----------------
console.log('— detección: los tres patrones, con su evidencia citada');
{
  const db = dbConPack('completa');
  sembrarPropio(db, 1);
  sembrarCliente(db, 1, CUIT_MOLINO, 'Panadería El Molino');
  sembrarCliente(db, 1, CUIT_TORO, 'Carnicería El Toro');
  pres.setPolitica(db, 1, { lista_precios: [{ descripcion: 'Service de aire', precio_unitario: 90000, alicuota_iva: 21 }] });

  // (a) Distribuidora Sur: 5 pagos, plazos 7·7·8·6·7 (mediana 7).
  const fechasSur = [['2026-08-03', '2026-08-10'], ['2026-08-17', '2026-08-24'], ['2026-09-01', '2026-09-09'], ['2026-09-15', '2026-09-21'], ['2026-09-29', '2026-10-06']];
  fechasSur.forEach(([f, fp], i) => {
    const fac = facturaProveedor(db, 1, { nombre: 'Distribuidora Sur S.A.', cuit: CUIT_SUR, numero: `0003-0000010${i}`, fecha: f, monto: 120000 });
    pagarFactura(db, 1, fac, { nombre: 'Distribuidora Sur S.A.', cuit: CUIT_SUR, fechaPago: fp });
  });
  // Fletes Andina: solo 2 pagos → sin base para el plazo.
  [['2026-09-02', '2026-09-12'], ['2026-09-16', '2026-09-26']].forEach(([f, fp], i) => {
    const fac = facturaProveedor(db, 1, { nombre: 'Fletes Andina', cuit: CUIT_FLETES, numero: `0003-0000020${i}`, fecha: f, monto: 80000, clasificacion: 'gasto' });
    pagarFactura(db, 1, fac, { nombre: 'Fletes Andina', cuit: CUIT_FLETES, fechaPago: fp });
  });
  // (b) El Molino: 5 presupuestos cotizados, 4 con 10 % bajo lista.
  for (let i = 0; i < 4; i++) {
    await presupuestoEnviado(db, 1, { cuit: CUIT_MOLINO, fecha: `2026-0${8 + (i % 2)}-1${i}`, items: [{ descripcion: 'Service de aire', cantidad: 1, precio_unitario: 81000 }] });
  }
  await presupuestoEnviado(db, 1, { cuit: CUIT_MOLINO, fecha: '2026-10-05', items: [{ descripcion: 'Service de aire', cantidad: 1 }] });
  // El Toro: solo 2 con descuento → sin base.
  for (let i = 0; i < 2; i++) {
    await presupuestoEnviado(db, 1, { cuit: CUIT_TORO, fecha: `2026-09-0${3 + i}`, items: [{ descripcion: 'Service de aire', cantidad: 1, precio_unitario: 81000 }] });
  }
  // (c) Papelera Andina: 6 papeles, todos «stock» — 4 de entrada y
  // 2 por corrección del dueño (la señal más fuerte).
  for (let i = 0; i < 4; i++) {
    facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: `0003-0000030${i}`, fecha: `2026-09-0${2 + i}`, monto: 45000, concepto: 'Papel e insumos', clasificacion: 'stock' });
  }
  for (let i = 0; i < 2; i++) {
    const papel = facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: `0003-0000031${i}`, fecha: `2026-09-1${2 + i}`, monto: 47000, concepto: 'Papel e insumos' });
    comp.corregirComprobante(db, 1, papel.id, { clasificacion: 'stock' });
  }

  const esc = reglas.escanearPatrones(db, 1, { hoy: HOY });
  ok('escaneo: se crean exactamente 3 propuestas (una por patrón)', esc.creadas.length === 3, JSON.stringify(esc.creadas.map((p) => p.tipo)));
  const pPago = propuestaDe(esc, 'pago-proveedor');
  ok('plazo de pago: mediana 7 días, con los 5 pagos citados en la evidencia',
    !!pPago && pPago.patron.dias_plazo === 7 && pPago.evidencia.pagos.length === 5 && pPago.observaciones === 5,
    pPago && JSON.stringify(pPago.patron));
  const pDesc = propuestaDe(esc, 'descuento-cliente');
  ok('descuento: 10 % para El Molino, «4 de 5» presupuestos citados',
    !!pDesc && pDesc.patron.porcentaje === 10 && pDesc.evidencia.presupuestos.length === 4 && /4 de 5/.test(pDesc.evidencia.base),
    pDesc && JSON.stringify(pDesc.evidencia.base));
  const pClas = propuestaDe(esc, 'clasificacion-contraparte');
  ok('clasificación: «stock» para Papelera, 6 papeles y las 2 correcciones del dueño citadas',
    !!pClas && pClas.patron.clasificacion === 'stock' && pClas.evidencia.comprobantes.length === 6 && pClas.evidencia.correcciones_dueno === 2,
    pClas && JSON.stringify(pClas.evidencia.correcciones_dueno));
  ok('sin base DECLARADO: Fletes (2 pagos) y El Toro (2 descuentos) no se proponen',
    esc.declarados_sin_base.some((s) => s.tipo === 'pago-proveedor' && s.clave.includes(CUIT_FLETES))
    && esc.declarados_sin_base.some((s) => s.tipo === 'descuento-cliente' && s.clave.includes(CUIT_TORO)),
    JSON.stringify(esc.declarados_sin_base.map((s) => s.clave)));
  const esc2 = reglas.escanearPatrones(db, 1, { hoy: HOY });
  ok('segundo escaneo: UNA propuesta por patrón, sin duplicar (quedan esperando)',
    esc2.creadas.length === 0 && esc2.esperando.length === 3, JSON.stringify(esc2.esperando));
  db.close();
}

// ---------------- Bloque B: aprobar → fundamento → aplicación → revocar ----------------
console.log('— ciclo de vida: aprobar, aplicar con rastro, sugerir, revocar');
{
  const db = dbConPack('completa');
  sembrarPropio(db, 1);
  sembrarCliente(db, 1, CUIT_MOLINO, 'Panadería El Molino');
  pres.setPolitica(db, 1, { lista_precios: [{ descripcion: 'Service de aire', precio_unitario: 90000, alicuota_iva: 21 }] });
  // Patrón de clasificación (3 papeles «stock» de Papelera).
  for (let i = 0; i < 3; i++) {
    facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: `0003-0000040${i}`, fecha: `2026-09-0${3 + i}`, monto: 45000, concepto: 'Papel e insumos', clasificacion: 'stock' });
  }
  // Patrón de plazo (3 pagos a Sur, siempre a los 5 días).
  [['2026-09-07', '2026-09-12'], ['2026-09-21', '2026-09-26'], ['2026-10-05', '2026-10-10']].forEach(([f, fp], i) => {
    const fac = facturaProveedor(db, 1, { nombre: 'Distribuidora Sur S.A.', cuit: CUIT_SUR, numero: `0003-0000050${i}`, fecha: f, monto: 90000 });
    pagarFactura(db, 1, fac, { nombre: 'Distribuidora Sur S.A.', cuit: CUIT_SUR, fechaPago: fp });
  });
  // Patrón de descuento (3 de 3 al 10 %).
  for (let i = 0; i < 3; i++) {
    await presupuestoEnviado(db, 1, { cuit: CUIT_MOLINO, fecha: `2026-09-1${i}`, items: [{ descripcion: 'Service de aire', cantidad: 1, precio_unitario: 81000 }] });
  }
  const esc = reglas.escanearPatrones(db, 1, { hoy: HOY });
  ok('escaneo del bloque: 3 propuestas pendientes', esc.creadas.length === 3, JSON.stringify(esc.creadas.map((p) => p.tipo)));
  const pClas = propuestaDe(esc, 'clasificacion-contraparte');
  const pPago = propuestaDe(esc, 'pago-proveedor');
  const pDesc = propuestaDe(esc, 'descuento-cliente');

  const apClas = reglas.aprobarPropuesta(db, 1, pClas.id, {});
  ok('aprobar: la regla vive en el fundamento con procedencia aprendida y confirmación del dueño',
    apClas.dato.grupo === 'reglas-dueno' && apClas.dato.campo === `regla-aprendida-${pClas.id}`
    && apClas.dato.origen === 'inferido' && apClas.dato.origen_ref === `propuesta-regla-${pClas.id}`
    && apClas.dato.confirmado_por_dueno === true && apClas.dato.valor.activa === true,
    JSON.stringify(apClas.dato).slice(0, 220));
  const errDoble = lanza(() => reglas.aprobarPropuesta(db, 1, pClas.id, {}));
  ok('aprobar dos veces: rechazado (la propuesta ya no está pendiente)', !!errDoble);

  // El 4.º caso se procesa SOLO y el evento cita la regla (cola G-20).
  const papel4 = facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: '0003-00000409', fecha: '2026-10-20', monto: 46000, concepto: 'Papel e insumos' });
  ok('aplicación: el 4.º papel se clasifica SOLO como «stock» (el genérico daría «gasto»)',
    papel4.clasificacion === 'stock', papel4.clasificacion);
  ok('rastro en el papel: la extracción cita «regla-aprendida-<id>»',
    papel4.extraccion.clasificacion_regla === `regla-aprendida-${pClas.id}`, papel4.extraccion.clasificacion_regla);
  const evLeido = gesty.listEvents(db, 1, { entidad_tipo: 'comprobante', entidad_id: String(papel4.id) })
    .find((e) => e.tipo_evento === 'comprobante-leido');
  ok('rastro en el EVENTO: el registro durable cita la regla que clasificó',
    !!evLeido && evLeido.payload.regla === `regla-aprendida-${pClas.id}`, evLeido && JSON.stringify(evLeido.payload));

  reglas.aprobarPropuesta(db, 1, pPago.id, {});
  reglas.aprobarPropuesta(db, 1, pDesc.id, {});
  const sugPago = reglas.sugerenciaPagoProveedor(db, 1, { cuit: CUIT_SUR });
  ok('sugerencia consumible G-07: plazo de 5 días con su cita (sin tocar ninguna orden)',
    !!sugPago && sugPago.dias_plazo === 5 && sugPago.regla === `regla-aprendida-${pPago.id}` && /regla aprendida/.test(sugPago.texto),
    sugPago && sugPago.texto);
  const sugDesc = reglas.sugerenciaDescuentoCliente(db, 1, { cuit: CUIT_MOLINO });
  ok('sugerencia consumible G-08: 10 % VISIBLE con su cita (ningún total se toca)',
    !!sugDesc && sugDesc.porcentaje === 10 && /SUGERENCIA visible|Sugerencia visible/.test(sugDesc.texto),
    sugDesc && sugDesc.texto);
  ok('reglas activas: las 3, listadas para «Lo que Gesty aprendió»',
    reglas.listReglasActivas(db, 1).total === 3);

  // Revocar: se apaga la aplicación y la historia queda.
  reglas.revocarRegla(db, 1, pClas.id, {});
  const papel5 = facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: '0003-00000410', fecha: '2026-10-22', monto: 46000, concepto: 'Papel e insumos' });
  ok('revocar apaga la aplicación: el papel nuevo vuelve a la regla genérica («gasto»)',
    papel5.clasificacion === 'gasto' && papel5.extraccion.clasificacion_regla === 'recibida-es-gasto',
    `${papel5.clasificacion} / ${papel5.extraccion.clasificacion_regla}`);
  const datoRev = gesty.getData(db, 1, { grupo: 'reglas-dueno' }).find((d) => d.campo === `regla-aprendida-${pClas.id}`);
  ok('la historia queda: propuesta «revocada», dato inactivo y el cambio registrado en su historial',
    reglas.getPropuesta(db, 1, pClas.id).estado === 'revocada' && datoRev.valor.activa === false
    && datoRev.historial.length >= 1 && datoRev.historial[datoRev.historial.length - 1].valor_nuevo.activa === false,
    JSON.stringify({ estado: reglas.getPropuesta(db, 1, pClas.id).estado, hist: datoRev.historial.length }));
  ok('el evento de revocación está en el registro',
    gesty.listEvents(db, 1, { entidad_tipo: 'regla-aprendida', entidad_id: String(pClas.id) })
      .some((e) => e.tipo_evento === 'regla-aprendida-revocada'));
  db.close();
}

// ---------------- Bloque C: descartar y reaparición única ----------------
console.log('— descartar: no re-propone; con el doble de evidencia reaparece UNA vez');
{
  const db = dbConPack('completa');
  sembrarPropio(db, 1);
  let nFac = 0;
  const sumarPagos = (cantidad, desdeDia) => {
    for (let i = 0; i < cantidad; i++) {
      nFac++;
      const f = `2026-0${8 + Math.floor((desdeDia + i * 14) / 30)}-${String(((desdeDia + i * 14) % 28) + 1).padStart(2, '0')}`;
      // fechas simples y crecientes construidas a mano por tramo:
      const fechas = ['2026-08-03', '2026-08-17', '2026-08-31', '2026-09-14', '2026-09-28', '2026-10-12',
        '2026-10-26', '2026-11-09', '2026-11-23', '2026-12-07', '2026-12-21', '2027-01-04'];
      const fecha = fechas[nFac - 1];
      const fp = new Date(Date.parse(fecha) + 10 * 86400000).toISOString().slice(0, 10);
      const fac = facturaProveedor(db, 1, { nombre: 'Fletes Andina', cuit: CUIT_FLETES, numero: `0003-000006${String(nFac).padStart(2, '0')}`, fecha, monto: 80000, clasificacion: 'gasto' });
      pagarFactura(db, 1, fac, { nombre: 'Fletes Andina', cuit: CUIT_FLETES, fechaPago: fp });
      void f;
    }
  };
  sumarPagos(3, 3);
  const esc1 = reglas.escanearPatrones(db, 1, { hoy: HOY });
  const g1 = propuestaDe(esc1, 'pago-proveedor');
  ok('generación 1: propuesta con la base mínima (3 pagos)', !!g1 && g1.generacion === 1 && g1.observaciones === 3, g1 && `gen=${g1.generacion}`);
  reglas.descartarPropuesta(db, 1, g1.id, { motivo: 'todavía no' });
  const esc2 = reglas.escanearPatrones(db, 1, { hoy: HOY });
  ok('descartada con la misma evidencia: NO se re-propone (queda declarado «sin refuerzo»)',
    esc2.creadas.length === 0 && esc2.sin_refuerzo.some((s) => s.clave === g1.clave && s.necesita === 6),
    JSON.stringify(esc2.sin_refuerzo));
  sumarPagos(3, 45);
  const esc3 = reglas.escanearPatrones(db, 1, { hoy: HOY });
  const g2 = propuestaDe(esc3, 'pago-proveedor');
  ok('con el DOBLE de evidencia (6 pagos) reaparece: generación 2, marcada como reaparición',
    !!g2 && g2.generacion === 2 && g2.reaparicion === true && g2.observaciones === 6,
    g2 && `gen=${g2.generacion} obs=${g2.observaciones}`);
  reglas.descartarPropuesta(db, 1, g2.id, {});
  sumarPagos(6, 90);
  const esc4 = reglas.escanearPatrones(db, 1, { hoy: HOY });
  ok('descartada la reaparición, no vuelve nunca más (aunque la evidencia se duplique otra vez)',
    esc4.creadas.length === 0 && esc4.sin_reaparicion.some((s) => s.clave === g1.clave),
    JSON.stringify(esc4.sin_reaparicion));
  db.close();
}

// ---------------- Bloque D: LA FRONTERA DURA ----------------
console.log('— FRONTERA DURA: con todas las reglas activas, la matriz no se mueve sola');
{
  const db = dbConPack('completa');
  sembrarPropio(db, 1);
  sembrarCliente(db, 1, CUIT_MOLINO, 'Panadería El Molino');
  pres.setPolitica(db, 1, { lista_precios: [{ descripcion: 'Service de aire', precio_unitario: 90000, alicuota_iva: 21 }] });
  for (let i = 0; i < 3; i++) {
    facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: `0003-0000070${i}`, fecha: `2026-09-0${3 + i}`, monto: 45000, concepto: 'Papel e insumos', clasificacion: 'stock' });
  }
  [['2026-09-07', '2026-09-12'], ['2026-09-21', '2026-09-26'], ['2026-10-05', '2026-10-10']].forEach(([f, fp], i) => {
    const fac = facturaProveedor(db, 1, { nombre: 'Distribuidora Sur S.A.', cuit: CUIT_SUR, numero: `0003-0000080${i}`, fecha: f, monto: 90000 });
    pagarFactura(db, 1, fac, { nombre: 'Distribuidora Sur S.A.', cuit: CUIT_SUR, fechaPago: fp });
  });
  for (let i = 0; i < 3; i++) {
    await presupuestoEnviado(db, 1, { cuit: CUIT_MOLINO, fecha: `2026-09-1${i}`, items: [{ descripcion: 'Service de aire', cantidad: 1, precio_unitario: 81000 }] });
  }
  const esc = reglas.escanearPatrones(db, 1, { hoy: HOY });
  for (const p of esc.creadas) reglas.aprobarPropuesta(db, 1, p.id, {});
  ok('las 3 reglas quedan activas para la prueba de frontera', reglas.listReglasActivas(db, 1).total === 3);

  // Dos tarjetas de la matriz esperando el toque del dueño.
  gesty.createCard(db, 1, { tipo: 'cobranza', titulo: 'Recordatorio de cobro — prueba de frontera', detalle: { texto: 'borrador' }, monto: 5000, moneda: 'ARS' });
  const borrador = pres.crearBorrador(db, 1, { cliente: { cuit: CUIT_MOLINO }, items: [{ descripcion: 'Service de aire', cantidad: 1, precio_unitario: 81000 }] });
  pres.pedirOK(db, 1, borrador.id, {});
  const ejecutadasAntes = db.prepare("SELECT COUNT(*) AS n FROM gesty_approvals WHERE user_id = 1 AND resultado = 'ejecutada'").get().n;
  const aprobadasAntes = gesty.listEvents(db, 1, {}).filter((e) => e.tipo_evento === 'tarjeta-aprobada').length;
  ok('antes: 2 tarjetas esperando y el conteo de ejecuciones es el de las semillas',
    gesty.countPending(db, 1) === 2 && ejecutadasAntes === 6, `pendientes=${gesty.countPending(db, 1)} ejec=${ejecutadasAntes}`);

  // Todo lo que las reglas pueden hacer, junto: escanear, aplicar
  // la clasificación a papeles nuevos y servir sugerencias.
  reglas.escanearPatrones(db, 1, { hoy: HOY });
  const papelX = facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: '0003-00000709', fecha: '2026-10-21', monto: 46000, concepto: 'Papel e insumos' });
  reglas.sugerenciaPagoProveedor(db, 1, { cuit: CUIT_SUR });
  reglas.sugerenciaDescuentoCliente(db, 1, { cuit: CUIT_MOLINO });
  reglas.resumenReglas(db, 1, { hoy: HOY });

  ok('el autopiloto legítimo SÍ corrió: el papel nuevo se clasificó por la regla',
    papelX.clasificacion === 'stock' && /^regla-aprendida-/.test(papelX.extraccion.clasificacion_regla));
  ok('FRONTERA: las 2 tarjetas siguen «esperando» — ninguna se aprobó sola',
    gesty.countPending(db, 1) === 2 && gesty.listCards(db, 1, {}).every((c) => c.estado === 'esperando' || c.estado === 'aprobada'),
    JSON.stringify(gesty.listCards(db, 1, {}).map((c) => c.estado)));
  const ejecutadasDespues = db.prepare("SELECT COUNT(*) AS n FROM gesty_approvals WHERE user_id = 1 AND resultado = 'ejecutada'").get().n;
  const aprobadasDespues = gesty.listEvents(db, 1, {}).filter((e) => e.tipo_evento === 'tarjeta-aprobada').length;
  ok('FRONTERA: cero ejecuciones nuevas en el registro (approvals y eventos «tarjeta-aprobada» idénticos)',
    ejecutadasDespues === ejecutadasAntes && aprobadasDespues === aprobadasAntes,
    `ejec ${ejecutadasAntes}→${ejecutadasDespues} · eventos ${aprobadasAntes}→${aprobadasDespues}`);
  const eventos = gesty.listEvents(db, 1, {});
  ok('FRONTERA: ningún envío ni emisión ocurrió (ni cobranza enviada; el presupuesto sigue esperando su OK)',
    !eventos.some((e) => e.tipo_evento === 'cobranza-enviada')
    && pres.getPresupuesto(db, 1, borrador.id).estado === 'esperando-ok');
  db.close();
}

// ---------------- Bloque E: la corrección del dueño debilita y apaga ----------------
console.log('— debilitamiento: corregir en contra debilita; dos veces, apaga la regla');
{
  const db = dbConPack('completa');
  sembrarPropio(db, 1);
  for (let i = 0; i < 3; i++) {
    facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: `0003-0000090${i}`, fecha: `2026-09-0${3 + i}`, monto: 45000, concepto: 'Papel e insumos', clasificacion: 'stock' });
  }
  const esc = reglas.escanearPatrones(db, 1, { hoy: HOY });
  const pClas = propuestaDe(esc, 'clasificacion-contraparte');
  reglas.aprobarPropuesta(db, 1, pClas.id, {});
  const papel4 = facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: '0003-00000909', fecha: '2026-10-20', monto: 46000, concepto: 'Papel e insumos' });
  ok('papel por la regla: «stock» con su rastro', papel4.clasificacion === 'stock');
  comp.corregirComprobante(db, 1, papel4.id, { clasificacion: 'gasto' });
  const trasUna = reglas.getPropuesta(db, 1, pClas.id);
  ok('primera corrección en contra: la regla sigue activa pero DEBILITADA (1 contradicción)',
    trasUna.estado === 'aprobada' && trasUna.activa === true && trasUna.contradicciones === 1,
    JSON.stringify({ estado: trasUna.estado, contradicciones: trasUna.contradicciones }));
  const papel5 = facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: '0003-00000910', fecha: '2026-10-21', monto: 46000, concepto: 'Papel e insumos' });
  ok('debilitada pero vigente: el papel siguiente todavía se clasifica por la regla', papel5.clasificacion === 'stock');
  comp.corregirComprobante(db, 1, papel5.id, { clasificacion: 'gasto' });
  const trasDos = reglas.getPropuesta(db, 1, pClas.id);
  ok('segunda corrección en contra: la regla se DESACTIVA (el dueño manda sobre lo aprendido)',
    trasDos.estado === 'desactivada' && trasDos.activa === false && trasDos.contradicciones === 2,
    JSON.stringify({ estado: trasDos.estado, contradicciones: trasDos.contradicciones }));
  const papel6 = facturaProveedor(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_PAPELERA, numero: '0003-00000911', fecha: '2026-10-22', monto: 46000, concepto: 'Papel e insumos' });
  ok('apagada: el papel nuevo vuelve a la clasificación genérica',
    papel6.clasificacion === 'gasto' && papel6.extraccion.clasificacion_regla === 'recibida-es-gasto');
  const evs = gesty.listEvents(db, 1, { entidad_tipo: 'regla-aprendida', entidad_id: String(pClas.id) });
  ok('el debilitamiento y la desactivación quedaron en el registro',
    evs.some((e) => e.tipo_evento === 'regla-aprendida-debilitada') && evs.some((e) => e.tipo_evento === 'regla-aprendida-desactivada'));
  db.close();
}

// ---------------- Bloque F: observación fuera de alcance + separación ----------------
console.log('— observación (fuera de alcance) y separación por cuenta');
{
  const db = dbConPack('completa');
  gesty.setPack(db, 2, 'completa', { origen: 'checkout', actor: 'sistema' });
  sembrarPropio(db, 1);
  // El dueño aprobó cobranzas 4 lunes de 5 veces (siembra directa
  // del libro de aprobaciones: el ritmo es SUYO, no de Gesty).
  const ins = db.prepare(`INSERT INTO gesty_approvals (user_id, tarjeta_id, tipo, version_documento, fundamento_version, usuario, accion, resultado, motivo, ts)
    VALUES (1, ?, 'cobranza', 1, 0, 'dueno', 'aprobar', 'ejecutada', '', ?)`);
  ['2026-10-05 10:00:00', '2026-10-12 10:00:00', '2026-10-19 10:00:00', '2026-10-26 10:00:00', '2026-10-06 10:00:00']
    .forEach((ts, i) => ins.run(999001 + i, ts));
  const esc = reglas.escanearPatrones(db, 1, { hoy: HOY });
  ok('el ritmo de aprobación se registra como OBSERVACIÓN (lunes, 4 de 5), sin propuesta de regla',
    esc.observaciones_registradas >= 1 && esc.creadas.length === 0
    && reglas.listObservaciones(db, 1).observaciones.some((o) => o.clave === 'ritmo-aprobacion-cobranza' && /lunes/.test(o.texto) && /4 de 5/.test(o.texto)),
    JSON.stringify(reglas.listObservaciones(db, 1).observaciones.map((o) => o.clave)));
  const escAjena = reglas.escanearPatrones(db, 2, { hoy: HOY });
  ok('separación por cuenta: la cuenta 2 no ve patrones, propuestas ni observaciones de la 1',
    escAjena.creadas.length === 0 && reglas.listPropuestas(db, 2).total === 0 && reglas.listObservaciones(db, 2).total === 0);
  db.close();
}

// ---------------- Bloque G: HTTP ----------------
console.log('— http: gating y recorrido mínimo');
const PORT = 3984;
const BASE = `http://127.0.0.1:${PORT}`;
async function call(method, p, body, cookie) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  const texto = await r.text();
  try { data = JSON.parse(texto); } catch (e) { data = { texto }; }
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid, texto };
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g20-'));
const child = spawn(process.execPath, ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret', OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let bootLog = '';
child.stdout.on('data', (d) => { bootLog += d; });
child.stderr.on('data', (d) => { bootLog += d; });
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(BASE + '/api/version'); up = r.ok; } catch (e) {}
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  ok('server bootea', up, bootLog.slice(-300));
  const reg = await call('POST', '/api/auth/register', { email: 'g20@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/reglas/resumen', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/reglas/resumen', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f.exec('PRAGMA busy_timeout = 5000');
  const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g20@example.com');
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'completa');
  f.close();
  const resumenHttp = await call('GET', '/api/gesty/reglas/resumen?hoy=2026-10-24', null, reg.cookie);
  ok('http: con pack Completa el resumen responde 200 (sin patrones todavía: honesto)',
    resumenHttp.status === 200 && resumenHttp.data.resumen.propuestas_pendientes === 0 && resumenHttp.data.resumen.reglas_activas === 0,
    JSON.stringify(resumenHttp.data).slice(0, 220));
  const escHttp = await call('POST', '/api/gesty/reglas/escanear', { hoy: HOY }, reg.cookie);
  ok('http: el escaneo explícito responde 200 con su salida declarada',
    escHttp.status === 200 && Array.isArray(escHttp.data.escaneo.creadas) && escHttp.data.escaneo.creadas.length === 0,
    JSON.stringify(escHttp.data).slice(0, 200));
  const propHttp = await call('GET', '/api/gesty/reglas/propuestas', null, reg.cookie);
  ok('http: las propuestas se listan (vacías en esta cuenta)',
    propHttp.status === 200 && propHttp.data.total === 0, JSON.stringify(propHttp.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
