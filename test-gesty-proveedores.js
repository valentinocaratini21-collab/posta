#!/usr/bin/env node
// test-gesty-proveedores.js — G-07 · PROVEEDORES Y PAGOS.
// Spec: gesty-cola-builds.md G-07, gesty-areas-detalle.md §6,
// gesty-sistema-operativo.md §5 (matriz: comprometer un pago =
// SIEMPRE con OK del dueño) y gesty-g02-build-spec.md §11
// (interfaz Talenty → Gesty: doble control, solo monto y fecha).
// Cubre: la ficha viva que se enriquece desde los papeles sin
// pisar lo del dueño · las obligaciones derivadas (recibidas
// leídas menos pagos) · el vigía (vencida sin orden → orden +
// tarjeta, nunca silencio; segundo escaneo sin duplicar) · el
// recorrido completo recibida → orden aprobada → pagada SOLO con
// su comprobante vinculado (sin papel no hay pago, verificado) ·
// pago parcial con saldo y sobrepago rechazado · el ejecutor que
// devuelve la tarjeta si los saldos cambiaron · la interfaz de
// liquidaciones externas (lista blanca: cualquier dato de
// personas rechaza la recepción) · pagosDelPeriodo como la fuente
// del cierre G-06 · separación por cuenta · gating (401/403) HTTP.
// Uso: node test-gesty-proveedores.js
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
const comp = require('./gesty-comprobantes.js');
const prov = require('./gesty-proveedores.js');

const CUIT_PROPIO = '20123456786';       // Refrigeración Sosa
const CUIT_PROV = '30123456781';         // Repuestos del Sur S.A.
const CUIT_OTRO = '30567890127';         // Fletes Andina
const HOY = '2026-10-24';

function dbConPack(pack, uid) {
  const db = nuevaDb();
  gesty.initGesty(db);
  prov.ensureSchema(db);
  gesty.setPack(db, uid || 1, pack, { origen: 'checkout', actor: 'sistema' });
  return db;
}
function sembrarFundamento(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
}
// Una factura de proveedor que entra por el registro manual
// asistido de G-03: nace leída, clasificada y archivada.
function facturaProveedor(db, uid, datos) {
  const r = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: datos.nombre || 'Repuestos del Sur S.A.', emisor_cuit: datos.cuit || CUIT_PROV,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.vencimiento,
    moneda: 'ARS', monto_total: datos.monto, concepto: datos.concepto || 'Compra de mercadería',
    clasificacion: 'gasto',
  });
  assert(r.comprobante && r.comprobante.estado_lectura === 'leido', 'la factura de proveedor de prueba tiene que nacer leída: ' + JSON.stringify(r.comprobante && r.comprobante.estado_lectura));
  return r.comprobante;
}
// El papel del pago: la transferencia que el dueño hizo en su
// banco y sube como comprobante (G-03 lo archiva; G-07 lo vincula).
let nPapel = 0;
function papelDePago(db, uid, datos) {
  nPapel++;
  const r = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'emitida',
    emisor_nombre: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
    receptor_nombre: datos.para || 'Repuestos del Sur S.A.', receptor_cuit: datos.cuit || CUIT_PROV,
    numero: `9000-${String(nPapel).padStart(8, '0')}`, fecha: datos.fecha, vencimiento: '',
    moneda: 'ARS', monto_total: datos.monto, concepto: 'Comprobante de transferencia',
  });
  assert(r.comprobante, 'el papel de pago tiene que archivarse');
  return r.comprobante;
}
const tarjetasPago = (db, uid) => gesty.listCards(db, uid, {}).filter((c) => c.tipo === 'pago-proveedor');
const eventosOrden = (db, uid, oid) => gesty.listEvents(db, uid, { entidad_tipo: 'orden-pago', entidad_id: String(oid) });
function aprobarTarjeta(db, uid, tarjeta) {
  const ap = gesty.approveCard(db, uid, tarjeta.id, { version_documento: tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación de la tarjeta de pago tiene que salir: ' + JSON.stringify(ap).slice(0, 200));
  return ap;
}

(async () => {

// ---------------- Gating por pack ----------------
console.log('— unidad: gating por capacidad');
{
  const dbE = dbConPack('esencial');
  ok('gating: el pack esencial NO incluye proveedores', !gesty.hasCapacidad(dbE, 1, 'proveedores'));
  const dbC = dbConPack('completa');
  ok('gating: el pack completa SÍ incluye proveedores', gesty.hasCapacidad(dbC, 1, 'proveedores'));
  dbE.close(); dbC.close();
}

// ---------------- Recorrido completo: recibida → orden aprobada → pagada con su papel ----------------
console.log('— recorrido completo de una factura de proveedor');
{
  const db = dbConPack('completa');
  sembrarFundamento(db, 1);
  const f = facturaProveedor(db, 1, { numero: '0003-00001234', fecha: '2026-10-05', vencimiento: '2026-10-20', monto: 185000 });

  let lista = prov.listObligaciones(db, 1, { hoy: HOY, con_saldo: true });
  ok('obligación: la factura recibida leída con vencimiento y saldo ES una obligación vencida',
    lista.total === 1 && lista.obligaciones[0].estado === 'vencida' && lista.obligaciones[0].saldo === 185000 && lista.obligaciones[0].dias_mora === 4,
    JSON.stringify(lista.obligaciones[0] || {}).slice(0, 200));

  const esc = prov.escanearObligaciones(db, 1, { hoy: HOY });
  ok('vigía: la vencida sin orden genera su orden y su tarjeta (nunca silencio)',
    esc.ordenes_creadas === 1 && esc.tarjetas_creadas === 1 && tarjetasPago(db, 1).length === 1, JSON.stringify(esc));
  const esc2 = prov.escanearObligaciones(db, 1, { hoy: HOY });
  ok('vigía: el segundo escaneo no duplica (la obligación ya está cubierta)',
    esc2.ordenes_creadas === 0 && esc2.tarjetas_creadas === 0 && esc2.cubiertas === 1 && tarjetasPago(db, 1).length === 1, JSON.stringify(esc2));

  const orden = prov.listOrdenes(db, 1, {})[0] || prov.listOrdenes(db, 1, {}).ordenes[0];
  ok('orden: nace esperando-ok, del proveedor, por el saldo exacto y con su comprobante',
    orden.estado === 'esperando-ok' && orden.tipo === 'proveedor' && orden.monto_total === 185000 &&
    orden.comprobantes.length === 1 && orden.comprobantes[0].id === f.id, JSON.stringify(orden).slice(0, 220));

  // Sin el OK del dueño no se asienta ningún pago.
  const papelPrevio = papelDePago(db, 1, { monto: 185000, fecha: HOY });
  const errSinOK = lanza(() => prov.registrarPagoOrden(db, 1, orden.id, { comprobante_pago_id: papelPrevio.id }));
  ok('matriz: sin la aprobación, el pago NO se asienta aunque el papel exista',
    !!errSinOK && /todavía no está aprobada/.test(errSinOK.message) && prov.getOrden(db, 1, orden.id).pagado === 0,
    errSinOK && errSinOK.message);

  aprobarTarjeta(db, 1, tarjetasPago(db, 1)[0]);
  const aprobada = prov.getOrden(db, 1, orden.id);
  ok('aprobada ≠ pagada: tras el OK la orden está aprobada, con pagado 0 y su evento de aprobación (regla de verdad)',
    aprobada.estado === 'aprobada' && aprobada.pagado === 0 && aprobada.saldo === 185000 &&
    eventosOrden(db, 1, orden.id).some((e) => e.tipo_evento === 'orden-pago-aprobada') &&
    !eventosOrden(db, 1, orden.id).some((e) => e.tipo_evento === 'pago-registrado'));

  // Sin papel, no hay pago.
  const errSinPapel = lanza(() => prov.registrarPagoOrden(db, 1, orden.id, {}));
  ok('regla de verdad: sin comprobante de pago vinculado, la orden NO pasa a pagada',
    !!errSinPapel && /Sin papel, no hay pago/.test(errSinPapel.message) && prov.getOrden(db, 1, orden.id).estado === 'aprobada',
    errSinPapel && errSinPapel.message);
  const errPapelObligacion = lanza(() => prov.registrarPagoOrden(db, 1, orden.id, { comprobante_pago_id: f.id }));
  ok('regla de verdad: la propia factura no puede ser su comprobante de pago', !!errPapelObligacion);

  const r = prov.registrarPagoOrden(db, 1, orden.id, { comprobante_pago_id: papelPrevio.id });
  ok('pagada: con su papel vinculado, la orden queda PAGADA y el pago imputado a la factura',
    r.orden.estado === 'pagada' && r.orden.pagado === 185000 && r.orden.saldo === 0 &&
    r.pagos.length === 1 && r.pagos[0].comprobante_id === f.id && r.pagos[0].comprobante_pago_id === papelPrevio.id,
    JSON.stringify(r.orden).slice(0, 220));
  const evPago = eventosOrden(db, 1, orden.id).find((e) => e.tipo_evento === 'pago-registrado');
  ok('registro: el pago quedó asentado con su comprobante externo (el papel archivado en G-03)',
    !!evPago && evPago.comprobante_externo === `comprobante:${papelPrevio.id}` &&
    eventosOrden(db, 1, orden.id).some((e) => e.tipo_evento === 'orden-pago-pagada'));
  lista = prov.listObligaciones(db, 1, { hoy: HOY });
  ok('obligación saldada: la factura ya no tiene saldo (derivado de los asientos)',
    lista.obligaciones[0].estado === 'saldada' && lista.obligaciones[0].saldo === 0 && lista.obligaciones[0].pagado === 185000);

  const periodo = prov.pagosDelPeriodo(db, 1, { desde: '2026-10-01', hasta: '2026-10-31' });
  ok('pagosDelPeriodo (la fuente del cierre G-06): el pago aparece con proveedor, papel y total del período',
    periodo.pagos.length === 1 && periodo.totales.ARS === 185000 && periodo.total_pagos === 1 &&
    periodo.pagos[0].proveedor.cuit === CUIT_PROV && periodo.pagos[0].comprobante_pago_id === papelPrevio.id &&
    periodo.pagos[0].comprobante_obligacion_id === f.id, JSON.stringify(periodo).slice(0, 220));
  const errReuso = lanza(() => {
    const o2 = prov.prepararOrden(db, 1, { proveedor_nombre: 'Repuestos del Sur S.A.', proveedor_cuit: CUIT_PROV, monto: 1000, fecha_propuesta: '2026-10-28' });
    prov.pedirOKOrden(db, 1, o2.id);
    aprobarTarjeta(db, 1, tarjetasPago(db, 1).find((t) => t.detalle.orden_id === o2.id));
    prov.registrarPagoOrden(db, 1, o2.id, { comprobante_pago_id: papelPrevio.id });
  });
  ok('un papel paga una sola vez: reusar el mismo comprobante de pago se rechaza', !!errReuso && /una sola vez/.test(errReuso.message), errReuso && errReuso.message);
  db.close();
}

// ---------------- Vigía: por vencer sí, vigente lejana no ----------------
console.log('— el vigía y su ventana');
{
  const db = dbConPack('completa');
  sembrarFundamento(db, 1);
  facturaProveedor(db, 1, { numero: '0003-00002001', fecha: '2026-10-10', vencimiento: '2026-10-26', monto: 50000 }); // vence en 2 días
  facturaProveedor(db, 1, { numero: '0003-00002002', fecha: '2026-10-10', vencimiento: '2026-11-20', monto: 70000 }); // vigente lejana
  const esc = prov.escanearObligaciones(db, 1, { hoy: HOY });
  ok('vigía: la que vence dentro de la ventana (3 días) genera su tarjeta; la lejana, no',
    esc.por_vencer === 1 && esc.tarjetas_creadas === 1 && tarjetasPago(db, 1).length === 1, JSON.stringify(esc));
  const resumen = prov.resumenProveedores(db, 1, { hoy: HOY });
  ok('resumen: saldos y vencimientos contados desde los registros',
    resumen.obligaciones.con_saldo === 2 && resumen.obligaciones.saldo_total === 120000 && resumen.proveedores_con_saldo === 1,
    JSON.stringify(resumen.obligaciones));
  db.close();
}

// ---------------- Pago parcial con saldo y sobrepago rechazado ----------------
console.log('— pago parcial y sobrepago');
{
  const db = dbConPack('completa');
  sembrarFundamento(db, 1);
  const f = facturaProveedor(db, 1, { numero: '0003-00003001', fecha: '2026-10-02', vencimiento: '2026-10-15', monto: 100000 });
  const orden = prov.prepararOrden(db, 1, { comprobante_ids: [f.id] });
  prov.pedirOKOrden(db, 1, orden.id);
  aprobarTarjeta(db, 1, tarjetasPago(db, 1)[0]);

  const p1 = papelDePago(db, 1, { monto: 40000, fecha: '2026-10-24' });
  const r1 = prov.registrarPagoOrden(db, 1, orden.id, { comprobante_pago_id: p1.id });
  ok('parcial: la orden queda pagada-parcial y la obligación conserva su saldo vivo',
    r1.orden.estado === 'pagada-parcial' && r1.orden.saldo === 60000 &&
    prov.listObligaciones(db, 1, { hoy: HOY }).obligaciones[0].saldo === 60000);
  const pSobre = papelDePago(db, 1, { monto: 70000, fecha: '2026-10-24' });
  const errSobre = lanza(() => prov.registrarPagoOrden(db, 1, orden.id, { comprobante_pago_id: pSobre.id }));
  ok('sobrepago rechazado con los números (la orden es por el saldo, no por lo que haya en la cuenta)',
    !!errSobre && /Sobrepago/.test(errSobre.message) && prov.getOrden(db, 1, orden.id).pagado === 40000, errSobre && errSobre.message);
  const p2 = papelDePago(db, 1, { monto: 60000, fecha: '2026-10-25' });
  const r2 = prov.registrarPagoOrden(db, 1, orden.id, { comprobante_pago_id: p2.id });
  ok('segundo pago: salda la orden y la obligación', r2.orden.estado === 'pagada' &&
    prov.listObligaciones(db, 1, { hoy: HOY }).obligaciones[0].estado === 'saldada');
  const periodo = prov.pagosDelPeriodo(db, 1, { desde: '2026-10-01', hasta: '2026-10-31' });
  ok('período: los dos pagos suman una sola vez cada uno (100000, 2 eventos)',
    periodo.totales.ARS === 100000 && periodo.total_pagos === 2 && periodo.pagos.length === 2, JSON.stringify(periodo.totales));
  db.close();
}

// ---------------- El ejecutor protege contra saldos cambiados ----------------
console.log('— el ejecutor y la tarjeta que vuelve');
{
  const db = dbConPack('completa');
  sembrarFundamento(db, 1);
  const f = facturaProveedor(db, 1, { numero: '0003-00004001', fecha: '2026-10-03', vencimiento: '2026-10-18', monto: 50000 });
  const o1 = prov.prepararOrden(db, 1, { comprobante_ids: [f.id] });
  prov.pedirOKOrden(db, 1, o1.id);
  // Otra orden paga la misma factura por completo.
  const o2 = prov.prepararOrden(db, 1, { comprobante_ids: [f.id] });
  prov.pedirOKOrden(db, 1, o2.id);
  aprobarTarjeta(db, 1, tarjetasPago(db, 1).find((t) => t.detalle.orden_id === o2.id));
  const papel = papelDePago(db, 1, { monto: 50000, fecha: '2026-10-24' });
  prov.registrarPagoOrden(db, 1, o2.id, { comprobante_pago_id: papel.id });
  // Al aprobar la primera tarjeta, el saldo ya no es el congelado.
  const t1 = tarjetasPago(db, 1).find((t) => t.detalle.orden_id === o1.id);
  const ap = gesty.approveCard(db, 1, t1.id, { version_documento: t1.version_documento, usuario: 'dueno' });
  ok('ejecutor: si el saldo cambió debajo de la tarjeta, la aprobación se devuelve con el motivo (no se compromete un pago ya hecho)',
    ap.ok === false && /saldos de los comprobantes cambiaron/.test(ap.error || '') &&
    prov.getOrden(db, 1, o1.id).estado === 'esperando-ok', JSON.stringify(ap).slice(0, 220));
  const errRepedir = lanza(() => prov.pedirOKOrden(db, 1, o1.id));
  ok('con la obligación saldada, volver a pedir el OK lo dice y no duplica tarjetas',
    !!errRepedir && /ya están saldados/.test(errRepedir.message), errRepedir && errRepedir.message);
  db.close();
}

// ---------------- Interfaz Talenty: doble control, solo monto y fecha ----------------
console.log('— la interfaz de liquidaciones externas (§11)');
{
  const db = dbConPack('completa');
  sembrarFundamento(db, 1);
  const errEmpleado = lanza(() => prov.recibirLiquidacionExterna(db, 1, { monto: 850000, fecha: '2026-10-30', empleado: 'Juan Pérez' }));
  ok('lista blanca: un campo de personas (empleado) RECHAZA la recepción entera',
    !!errEmpleado && /campo de más/.test(errEmpleado.message) && prov.listOrdenes(db, 1, {}).total === 0, errEmpleado && errEmpleado.message);
  const errAnidado = lanza(() => prov.recibirLiquidacionExterna(db, 1, { monto: 850000, fecha: '2026-10-30', detalle: { legajo: 123 } }));
  ok('lista blanca: un objeto anidado (el legajo) también se rechaza', !!errAnidado && prov.listOrdenes(db, 1, {}).total === 0);
  const errRef = lanza(() => prov.recibirLiquidacionExterna(db, 1, { monto: 850000, fecha: '2026-10-30', referencia: 'CUIL 20123456786' }));
  ok('referencia opaca: si parece un documento de una persona, se rechaza', !!errRef && /dato de personas/.test(errRef.message), errRef && errRef.message);
  const errSinMonto = lanza(() => prov.recibirLiquidacionExterna(db, 1, { fecha: '2026-10-30' }));
  ok('sin monto no hay liquidación que pagar', !!errSinMonto);

  const liq = prov.recibirLiquidacionExterna(db, 1, { monto: 850000, fecha: '2026-10-30', referencia: 'LIQ-2026-10' });
  ok('recepción: nace la orden distinguible, con SOLO monto/fecha/referencia (sin proveedor, sin personas)',
    liq.tipo === 'liquidacion-externa' && liq.monto_total === 850000 && liq.fecha_propuesta === '2026-10-30' &&
    liq.referencia === 'LIQ-2026-10' && liq.proveedor === null && liq.creado_por === 'talenty' &&
    eventosOrden(db, 1, liq.id).some((e) => e.tipo_evento === 'liquidacion-recibida' && e.actor === 'talenty'),
    JSON.stringify(liq).slice(0, 220));
  prov.pedirOKOrden(db, 1, liq.id);
  const tLiq = tarjetasPago(db, 1)[0];
  ok('misma tarjeta de la matriz: la liquidación también pasa por «Para tu OK» como pago-proveedor',
    !!tLiq && /liquidación/i.test(tLiq.titulo) && tLiq.detalle.tipo_orden === 'liquidacion-externa');
  aprobarTarjeta(db, 1, tLiq);
  const papel = papelDePago(db, 1, { monto: 850000, fecha: '2026-10-30', para: 'Personal', cuit: CUIT_PROV });
  const r = prov.registrarPagoOrden(db, 1, liq.id, { comprobante_pago_id: papel.id });
  ok('mismo cierre con comprobante: la liquidación queda pagada solo con su papel vinculado',
    r.orden.estado === 'pagada' && r.pagos[0].comprobante_id === null && r.pagos[0].comprobante_pago_id === papel.id);
  const periodo = prov.pagosDelPeriodo(db, 1, { desde: '2026-10-01', hasta: '2026-10-31' });
  ok('período: el pago de la liquidación se distingue por su referencia, sin proveedor',
    periodo.pagos.length === 1 && periodo.pagos[0].tipo_orden === 'liquidacion-externa' &&
    periodo.pagos[0].liquidacion_referencia === 'LIQ-2026-10' && periodo.pagos[0].proveedor === null);
  db.close();
}

// ---------------- La ficha viva: enriquecimiento sin pisar al dueño ----------------
console.log('— la ficha del proveedor se mantiene viva');
{
  const db = dbConPack('completa');
  sembrarFundamento(db, 1);
  const campo = `cuit_${CUIT_PROV}`;
  gesty.setData(db, 1, {
    grupo: 'proveedores', campo,
    valor: { nombre: 'Repuestos del Sur S.A.', cuit: CUIT_PROV, contacto: 'compras@repuestos.example', condiciones: 'Cuenta corriente a 15 días', dias_pago: [5] },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
  const f1 = facturaProveedor(db, 1, { numero: '0003-00005001', fecha: '2026-09-20', vencimiento: '2026-10-05', monto: 90000 });
  const f2 = facturaProveedor(db, 1, { numero: '0003-00005002', fecha: '2026-10-05', vencimiento: '2026-10-20', monto: 110000 });
  const { proveedores } = prov.listProveedores(db, 1, { hoy: HOY });
  const p = proveedores.find((x) => x.campo === campo);
  ok('enriquecimiento: plazo habitual (15 días), conteo y último comprobante salen de los papeles',
    !!p && p.ficha.plazo_dias_habitual === 15 && p.ficha.comprobantes_recibidos === 2 && p.ficha.ultimo_comprobante === f2.id,
    JSON.stringify(p && p.ficha).slice(0, 240));
  ok('sin pisar al dueño: contacto, condiciones y días de pago declarados quedan intactos',
    p.ficha.contacto === 'compras@repuestos.example' && p.ficha.condiciones === 'Cuenta corriente a 15 días' &&
    JSON.stringify(p.ficha.dias_pago) === '[5]' && p.confirmado_por_dueno === true);
  ok('números del proveedor: obligado y saldo desde las obligaciones derivadas',
    p.numeros.obligado === 200000 && p.numeros.saldo === 200000 && p.numeros.vencidas === 2, JSON.stringify(p.numeros));
  const orden = prov.prepararOrden(db, 1, { comprobante_ids: [f1.id] });
  ok('fecha propuesta: vencida + días de pago del dueño (viernes) → el próximo viernes',
    new Date(`${orden.fecha_propuesta}T00:00:00Z`).getUTCDay() === 5 && orden.fecha_propuesta >= '2026-10-20'.slice(0, 10),
    orden.fecha_propuesta);
  db.close();
}

// ---------------- Separación por cuenta ----------------
console.log('— separación por cuenta');
{
  const db = dbConPack('completa');
  gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
  sembrarFundamento(db, 1);
  sembrarFundamento(db, 2);
  const f = facturaProveedor(db, 1, { numero: '0003-00006001', fecha: '2026-10-05', vencimiento: '2026-10-20', monto: 60000 });
  prov.escanearObligaciones(db, 1, { hoy: HOY });
  const orden = prov.listOrdenes(db, 1, {}).ordenes[0];
  ok('otra cuenta no ve obligaciones ni órdenes ajenas',
    prov.listObligaciones(db, 2, { hoy: HOY }).total === 0 && prov.listOrdenes(db, 2, {}).total === 0 &&
    prov.getOrden(db, 2, orden.id) === null && prov.listProveedores(db, 2, { hoy: HOY }).total === 0);
  const errAjena = lanza(() => prov.registrarPagoOrden(db, 2, orden.id, { comprobante_pago_id: 1 }));
  ok('otra cuenta no asienta pagos sobre una orden ajena', !!errAjena && /no es de esta cuenta/.test(errAjena.message));
  db.close();
}

// ---------------- HTTP: flujo completo ----------------
const PORT = 3994;
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

console.log('— http: gating y recorrido con el server booteado');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g07-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g07@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/proveedores', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/proveedores', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g07@example.com');
  dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'completa', 'admin-familia')").run(u.id);
  dbFile.close();

  const lista = await call('GET', '/api/gesty/proveedores', null, reg.cookie);
  ok('http: la lista de proveedores responde vacía para la cuenta nueva', lista.status === 200 && lista.data.total === 0);
  const obs = await call('GET', '/api/gesty/proveedores/obligaciones', null, reg.cookie);
  ok('http: las obligaciones responden vacías', obs.status === 200 && obs.data.total === 0);
  const esc = await call('POST', '/api/gesty/proveedores/escanear', {}, reg.cookie);
  ok('http: el escaneo del vigía corre (sin papeles, todo en cero)', esc.status === 200 && esc.data.escaneo.ordenes_creadas === 0, JSON.stringify(esc.data).slice(0, 160));
  const liqMala = await call('POST', '/api/gesty/pagos/liquidaciones', { monto: 100, fecha: '2026-10-30', legajo: '123' }, reg.cookie);
  ok('http: la interfaz de liquidaciones rechaza un dato de personas (400)', liqMala.status === 400, String(liqMala.status));
  const liq = await call('POST', '/api/gesty/pagos/liquidaciones', { monto: 100, fecha: '2026-10-30', referencia: 'LIQ-X' }, reg.cookie);
  ok('http: la liquidación válida entra como orden distinguible', liq.status === 200 && liq.data.orden.tipo === 'liquidacion-externa', JSON.stringify(liq.data).slice(0, 160));
  const periodo = await call('GET', '/api/gesty/pagos/periodo?desde=2026-10-01&hasta=2026-10-31', null, reg.cookie);
  ok('http: los pagos del período responden (la fuente del cierre)', periodo.status === 200 && periodo.data.total_pagos === 0);

  const regE = await call('POST', '/api/auth/register', { email: 'g07-esencial@example.com', password: 'secreto2' });
  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  const uE = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('g07-esencial@example.com');
  dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'checkout')").run(uE.id);
  dbFile2.close();
  const sinCap = await call('GET', '/api/gesty/proveedores', null, regE.cookie);
  ok('gating http: pack esencial (sin la capacidad) → 403', sinCap.status === 403, String(sinCap.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
