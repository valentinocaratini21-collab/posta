#!/usr/bin/env node
// test-gesty-conciliacion.js — G-17 · CONCILIACIÓN AUTOMÁTICA.
// Spec: gesty-cola-builds.md (tanda G-17, aceptación: «un mes de
// prueba concilia con cero matches falsos sobre los casos
// ambiguos sembrados; todo match queda asentado con su par y su
// motivo») · gesty-sistema-operativo.md (registrar pagos corre
// en automático; mover plata, no) · gesty-experiencia-cliente.md
// (conciliar sola: leer movimientos sí, mover plata solo con OK).
// Cubre: el mes sembrado de octubre (fuertes por CUIT y por
// nombre a ambos lados — cobro y pago —, el ambiguo por
// duplicado indistinguible, el de diferencia de comisión, los
// sin par declarados) · CERO asientos sobre los ambiguos · la
// propuesta de un toque (aceptar asienta, descartar no y no se
// re-propone) · la idempotencia del escaneo · deshacer revierte
// por los circuitos (factura y obligación recuperan su saldo) ·
// el extracto sin detalle declarado (ningún movimiento
// inventado) y la derivación del lector cuando el papel trae el
// detalle · la carga asistida con dedupe · separación por
// cuenta · gating HTTP (401 / 403 / capacidad «comprobantes»).
// Uso: node test-gesty-conciliacion.js
'use strict';
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
const fact = require('./gesty-facturacion.js');
const comp = require('./gesty-comprobantes.js');
const prov = require('./gesty-proveedores.js');
const conc = require('./gesty-conciliacion.js');

const CUIT_PROPIO = '20123456786';
const CUIT_A = '27234567891';   // Panadería La Espiga (cliente)
const CUIT_B = '20304050607';   // Café Aurora (cliente)
const CUIT_X = '30123456781';   // Distribuidora Sur (proveedor)
const CUIT_Y = '30234567812';   // Papelera Andina (proveedor)
const HOY = '2026-10-24';

fact.configure({ sendEmail: async () => ({ ok: true, id: 'resend-test' }) });

function sembrarFundamento(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_A}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_A, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_B}`,
    valor: { nombre: 'Café Aurora', cuit: CUIT_B, condicion_iva: 'Monotributo', email: 'cafeaurora@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}

async function facturaEnviada(db, uid, datos) {
  const f = fact.crearBorrador(db, uid, {
    cliente: { cuit: datos.cuit },
    items: [{ descripcion: datos.concepto || 'Servicio', cantidad: 1, precio_unitario: datos.precio, alicuota_iva: 0 }],
    fecha: datos.fecha, vencimiento: datos.vencimiento,
  });
  const p = fact.pedirOK(db, uid, f.id);
  const ap = gesty.approveCard(db, uid, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  if (!ap.ok) throw new Error('la aprobación de emisión falló');
  const r = await fact.enviarFactura(db, uid, f.id, { canal: 'whatsapp-manual', comprobante: 'wa-factura', destinatario: 'cliente' });
  return r.factura;
}

function obligacionRecibida(db, uid, datos) {
  return comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: datos.nombre, emisor_cuit: datos.cuit,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.vencimiento,
    moneda: 'ARS', monto_total: datos.monto, clasificacion: 'gasto', concepto: datos.concepto || 'Insumos',
  }).comprobante;
}

function saldoObligacion(db, uid, compId) {
  const ob = prov.todasLasObligaciones(db, uid, HOY).find((x) => x.comprobante_id === compId);
  return ob ? ob.saldo : null;
}
const eventos = (db, uid, tipo) => gesty.listEvents(db, uid, { limit: 5000 }).filter((e) => e.tipo_evento === tipo);

(async () => {

// ---------------------------------------------------------------------------
console.log('— unidad: el mes sembrado (octubre 2026)');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
sembrarFundamento(db, 1);

const F1 = await facturaEnviada(db, 1, { cuit: CUIT_A, precio: 500000, fecha: '2026-10-08', vencimiento: '2026-10-22' });
const F2 = await facturaEnviada(db, 1, { cuit: CUIT_B, precio: 120000, fecha: '2026-10-09', vencimiento: '2026-10-23' });
const F3 = await facturaEnviada(db, 1, { cuit: CUIT_A, precio: 60000, fecha: '2026-10-10', vencimiento: '2026-10-24' });
const F4 = await facturaEnviada(db, 1, { cuit: CUIT_B, precio: 45000, fecha: '2026-10-11', vencimiento: '2026-10-25' });
const F5 = await facturaEnviada(db, 1, { cuit: CUIT_A, precio: 77000, fecha: '2026-10-12', vencimiento: '2026-10-26' });
ok('montaje: cinco facturas enviadas con saldo (500k/120k/60k/45k/77k)',
  [F1, F2, F3, F4, F5].every((f) => f.estado === 'enviada' && f.saldo > 0));

const OX = obligacionRecibida(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_X, numero: '0001-00010101', fecha: '2026-10-05', vencimiento: '2026-10-20', monto: 250000 });
const OY = obligacionRecibida(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_Y, numero: '0002-00020202', fecha: '2026-10-06', vencimiento: '2026-10-21', monto: 80000 });
ok('montaje: dos obligaciones con saldo (250k y 80k)',
  saldoObligacion(db, 1, OX.id) === 250000 && saldoObligacion(db, 1, OY.id) === 80000);

const papelExtracto = comp.registrarManual(db, 1, {
  tipo: 'otro', emisor_nombre: 'Banco Galicia', emisor_cuit: '',
  receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  fecha: '2026-10-31', moneda: 'ARS', concepto: 'Extracto bancario — octubre 2026',
}).comprobante;
const decl = conc.declararExtracto(db, 1, papelExtracto.id);
ok('el extracto entra SIN detalle: declarado «sin-detalle», cero movimientos inventados',
  decl.extracto.detalle === 'sin-detalle' && decl.movimientos_derivados === 0
  && conc.listMovimientos(db, 1, { comprobante_id: papelExtracto.id }).total === 0);
const EXT = decl.extracto.id;

const carga = conc.cargarMovimientos(db, 1, EXT, [
  { fecha: '2026-10-15', monto: 500000, contraparte_nombre: 'Panadería La Espiga', contraparte_cuit: CUIT_A, referencia: 'TRF-001' },   // M1 → FUERTE F1 (CUIT)
  { fecha: '2026-10-16', monto: 120000, contraparte_nombre: 'Café Aurora', contraparte_cuit: CUIT_B, referencia: 'TRF-002' },          // M2 → ambiguo (duplicado de M3)
  { fecha: '2026-10-17', monto: 120000, contraparte_nombre: 'Café Aurora', contraparte_cuit: CUIT_B, referencia: 'TRF-003' },          // M3 → ambiguo (duplicado de M2)
  { fecha: '2026-10-18', monto: 59400, contraparte_nombre: 'Panadería La Espiga', contraparte_cuit: CUIT_A, referencia: 'TRF-004' },   // M4 → propuesta (comisión $600 sobre F3)
  { fecha: '2026-10-19', monto: 45000, contraparte_nombre: 'Cafe Aurora', referencia: 'TRF-005' },                                      // M5 → FUERTE F4 (nombre, sin acento)
  { fecha: '2026-10-14', monto: -250000, contraparte_nombre: 'Distribuidora Sur', contraparte_cuit: CUIT_X, referencia: 'PAG-001' },   // M6 → FUERTE OX (CUIT)
  { fecha: '2026-10-20', monto: -80000, contraparte_nombre: 'Papelera Andina', referencia: 'PAG-002' },                                 // M7 → FUERTE OY (nombre)
  { fecha: '2026-10-21', monto: -33333, contraparte_nombre: 'Desconocido SH', referencia: 'PAG-003' },                                   // M8 → sin par
  { fecha: '2026-10-22', monto: 999999, contraparte_nombre: 'Cliente Misterioso', referencia: 'TRF-009' },                               // M9 → sin par
]);
const [M1, M2, M3, M4, M5, M6, M7, M8, M9] = carga.movimientos;
ok('la carga asistida deja 9 movimientos y el extracto pasa a «con-detalle»',
  carga.cargados === 9 && carga.extracto.detalle === 'con-detalle' && carga.movimientos.length === 9);
const dup = conc.cargarMovimientos(db, 1, EXT, [
  { fecha: '2026-10-15', monto: 500000, referencia: 'TRF-001' },
  { fecha: 'no-es-fecha', monto: 100, referencia: 'MAL-1' },
]);
ok('la carga repetida se saltea por dedupe y la inválida se declara (no se adivina)',
  dup.cargados === 0 && dup.salteados === 1 && dup.invalidos.length === 1);

// ---------------------------------------------------------------------------
console.log('— unidad: ACEPTACIÓN — el escaneo: fuertes solos, ambiguos jamás');
const esc1 = conc.conciliar(db, 1, { hoy: HOY });
ok('escaneo: 4 asentados solos (M1, M5, M6, M7), 3 propuestas (M2, M3, M4), 2 sin par (M8, M9), 0 errores',
  esc1.asentados.length === 4 && esc1.propuestas.length === 3 && esc1.sin_par.length === 2 && esc1.errores.length === 0,
  JSON.stringify({ a: esc1.asentados.length, p: esc1.propuestas.length, s: esc1.sin_par.length, e: esc1.errores }));
ok('los fuertes fueron los esperados (los dos cobros y los dos pagos)',
  [M1.id, M5.id, M6.id, M7.id].every((id) => esc1.asentados.some((a) => a.movimiento_id === id)));

const f1d = fact.getFactura(db, 1, F1.id);
const f4d = fact.getFactura(db, 1, F4.id);
ok('cobros fuertes asentados: F1 y F4 quedan COBRADAS con su pago registrado',
  f1d.estado === 'cobrada' && f1d.pagado === 500000 && f4d.estado === 'cobrada' && f4d.pagado === 45000);
ok('pagos fuertes asentados: las obligaciones X e Y quedan saldadas y el asiento de G-07 existe',
  saldoObligacion(db, 1, OX.id) === 0 && saldoObligacion(db, 1, OY.id) === 0
  && prov.pagadoDeComprobante(db, 1, OX.id) === 250000 && prov.pagadoDeComprobante(db, 1, OY.id) === 80000);
const pagosMes = prov.pagosDelPeriodo(db, 1, { desde: '2026-10-01', hasta: '2026-10-31' });
ok('el cierre (G-06) ve los pagos conciliados con su obligación imputada',
  pagosMes.pagos.some((p) => p.comprobante_obligacion_id === OX.id && p.monto === 250000)
  && pagosMes.pagos.some((p) => p.comprobante_obligacion_id === OY.id && p.monto === 80000));

const evAsentados = eventos(db, 1, 'conciliacion-asentada');
const evF1 = evAsentados.find((e) => e.payload && e.payload.par_id === F1.id);
const evOX = evAsentados.find((e) => e.payload && e.payload.par_id === OX.id);
ok('todo match asentado queda en el registro durable CON su par y su motivo',
  !!evF1 && evF1.payload.regla === 'fuerte-cuit-monto-ventana' && /Monto exacto/.test(evF1.payload.motivo || '')
  && !!evOX && evOX.payload.regla === 'fuerte-cuit-monto-ventana' && /Monto exacto/.test(evOX.payload.motivo || ''));
const matchM5 = conc.listMatches(db, 1, { movimiento_id: M5.id }).matches[0];
ok('el fuerte por nombre cita su regla (nombre normalizado, sin acento)',
  !!matchM5 && matchM5.regla === 'fuerte-nombre-monto-ventana' && matchM5.estado === 'asentado');

// CERO matches falsos: los ambiguos no tocaron un peso.
const f2d = fact.getFactura(db, 1, F2.id);
const f3d = fact.getFactura(db, 1, F3.id);
ok('CERO matches falsos: F2 sigue con su saldo entero (120k) y F3 también (60k), sin pagos',
  f2d.estado === 'enviada' && f2d.saldo === 120000 && f2d.pagos.length === 0
  && f3d.estado === 'enviada' && f3d.saldo === 60000 && f3d.pagos.length === 0);
ok('los ambiguos quedaron PROPUESTOS (M2 y M3 por duplicado indistinguible; M4 por diferencia de comisión)',
  conc.getMovimiento(db, 1, M2.id).estado === 'propuesto'
  && conc.getMovimiento(db, 1, M3.id).estado === 'propuesto'
  && conc.getMovimiento(db, 1, M4.id).estado === 'propuesto');
const propM2 = conc.listMatches(db, 1, { movimiento_id: M2.id }).matches[0];
const propM4 = conc.listMatches(db, 1, { movimiento_id: M4.id }).matches[0];
ok('las propuestas citan su causa con números (varios-candidatos / diferencia-de-monto $600)',
  propM2.regla === 'propuesta-varios-candidatos'
  && propM4.regla === 'propuesta-diferencia-de-monto' && /600/.test(propM4.motivo));
ok('los sin par quedan DECLARADOS (M8 y M9 en «sin-par», visibles en el estado)',
  conc.getMovimiento(db, 1, M8.id).estado === 'sin-par' && conc.getMovimiento(db, 1, M9.id).estado === 'sin-par');

// ---------------------------------------------------------------------------
console.log('— unidad: la propuesta de un toque (aceptar asienta; descartar, no)');
const descM3 = conc.descartarPropuesta(db, 1, conc.listMatches(db, 1, { movimiento_id: M3.id }).matches[0].id);
ok('descartar: el match queda descartado y el movimiento vuelve a «sin-par» sin tocar la factura',
  descM3.estado === 'descartada' && conc.getMovimiento(db, 1, M3.id).estado === 'sin-par'
  && fact.getFactura(db, 1, F2.id).saldo === 120000);
const acepM4 = conc.aceptarPropuesta(db, 1, propM4.id, { hoy: HOY });
const f3e = fact.getFactura(db, 1, F3.id);
ok('aceptar la de la comisión: asienta lo que REALMENTE entró (59.400) y F3 queda con saldo 600',
  acepM4.estado === 'asentado' && acepM4.via === 'propuesta-aceptada' && acepM4.monto_asentado === 59400
  && f3e.pagado === 59400 && f3e.saldo === 600 && f3e.estado === 'enviada');

const esc2 = conc.conciliar(db, 1, { hoy: HOY });
ok('idempotencia: el segundo escaneo no asienta nada nuevo ni duplica propuestas (el par descartado no se re-propone)',
  esc2.asentados.length === 0 && esc2.propuestas.length === 0 && esc2.errores.length === 0
  && conc.listMatches(db, 1, { movimiento_id: M2.id }).matches.filter((m) => m.estado === 'propuesta').length === 1
  && conc.listMatches(db, 1, { movimiento_id: M3.id }).matches.filter((m) => m.estado === 'propuesta').length === 0,
  JSON.stringify(esc2));
const acepM2 = conc.aceptarPropuesta(db, 1, propM2.id, { hoy: HOY });
ok('aceptar la propuesta de M2 salda F2 (el dueño eligió cuál de los dos créditos era)',
  acepM2.estado === 'asentado' && fact.getFactura(db, 1, F2.id).estado === 'cobrada');

// ---------------------------------------------------------------------------
console.log('— unidad: deshacer revierte por los circuitos de cada área');
const matchM1 = conc.listMatches(db, 1, { movimiento_id: M1.id }).matches[0];
const matchM6 = conc.listMatches(db, 1, { movimiento_id: M6.id }).matches[0];
const desM1 = conc.deshacerConciliacion(db, 1, matchM1.id);
const f1r = fact.getFactura(db, 1, F1.id);
ok('deshacer el cobro: F1 vuelve a ENVIADA con su saldo entero y sin el registro del cobro',
  desM1.estado === 'revertida' && f1r.estado === 'enviada' && f1r.saldo === 500000 && f1r.pagos.length === 0
  && conc.getMovimiento(db, 1, M1.id).estado === 'sin-conciliar');
conc.deshacerConciliacion(db, 1, matchM6.id);
ok('deshacer el pago: la obligación X recupera su saldo y el asiento de G-07 desaparece',
  saldoObligacion(db, 1, OX.id) === 250000 && prov.pagadoDeComprobante(db, 1, OX.id) === 0);
ok('deshacer dos veces el mismo cruce → error declarado (no se revierte a ciegas)',
  lanza(() => conc.deshacerConciliacion(db, 1, matchM1.id)) !== null);

const estado = conc.estadoConciliacion(db, 1, { desde: '2026-10-01', hasta: '2026-10-31' });
ok('el estado del período declara todo: 4 conciliados vivos con par y motivo, 3 sin-par, 2 revertidos sin esconder',
  estado.movimientos.total === 9 && estado.conciliados.length === 4
  && estado.movimientos['sin-conciliar'] === 2
  && estado.conciliados.every((c) => c.par && c.par.etiqueta && c.motivo)
  && estado.sin_par.length === 3,
  JSON.stringify({ t: estado.movimientos, c: estado.conciliados.length, sp: estado.sin_par.length }));
const resumen = conc.resumenConciliacion(db, 1, { hoy: HOY });
ok('el resumen para «La oficina» cuenta lo real (4 conciliados vivos, 0 propuestas esperando, último escaneo registrado)',
  resumen.movimientos_conciliados === 4 && resumen.propuestas_esperando === 0 && !!resumen.ultimo_escaneo);

// ---------------------------------------------------------------------------
console.log('— unidad: el lector que trae detalle + el extracto sin detalle');
// Un papel cuya extracción SÍ trae movimientos (el lector futuro):
// se siembra la fila como la dejaría G-03 y se deriva tal cual.
db.prepare(`INSERT INTO gesty_comprobantes (user_id, tipo, direccion, emisor_nombre, receptor_nombre,
  fecha, moneda, concepto, extraccion, estado_lectura)
  VALUES (1, 'otro', 'recibida', 'Mercado Pago', 'Refrigeración Sosa', '2026-10-31', 'ARS',
  'Resumen de billetera — octubre', ?, 'leido')`)
  .run(JSON.stringify({ movimientos: [{ fecha: '2026-10-23', monto: -12345, contraparte_nombre: 'Nadie Conocido', referencia: 'MP-1' }] }));
const papelLector = comp.listComprobantes(db, 1, { limit: 500 }).comprobantes
  .find((c) => c.concepto === 'Resumen de billetera — octubre');
const declLector = conc.declararExtracto(db, 1, papelLector.id);
const movsLector = conc.listMovimientos(db, 1, { comprobante_id: papelLector.id }).movimientos;
ok('si el papel trae el detalle, los movimientos se DERIVAN del lector (origen «lector», sin inventar)',
  declLector.movimientos_derivados === 1 && movsLector.length === 1
  && movsLector[0].origen === 'lector' && movsLector[0].monto === -12345);
const papelSinDetalle = comp.registrarManual(db, 1, {
  tipo: 'otro', emisor_nombre: 'Banco Nación', receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  fecha: '2026-11-30', moneda: 'ARS', concepto: 'Extracto bancario — noviembre 2026',
}).comprobante;
conc.declararExtracto(db, 1, papelSinDetalle.id);
const estado2 = conc.estadoConciliacion(db, 1, {});
ok('el extracto sin detalle queda DECLARADO como tal en el estado (su papel entró; sus movimientos, todavía no)',
  estado2.extractos_sin_detalle.some((e) => e.comprobante_id === papelSinDetalle.id)
  && conc.listMovimientos(db, 1, { comprobante_id: papelSinDetalle.id }).total === 0);
const papelDup = comp.registrarManual(db, 1, {
  tipo: 'otro', emisor_nombre: 'Banco Galicia', receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  fecha: '2026-10-31', moneda: 'ARS', concepto: 'Extracto bancario — octubre 2026 (segunda copia)',
}).comprobante;
db.prepare('UPDATE gesty_comprobantes SET duplicado_de = ? WHERE id = ?').run(papelExtracto.id, papelDup.id);
ok('declarar el duplicado de un papel → error (el mismo extracto no cuenta dos veces)',
  lanza(() => conc.declararExtracto(db, 1, papelDup.id)) !== null);

// ---------------------------------------------------------------------------
console.log('— unidad: separación por cuenta');
sembrarFundamento(db, 2);
ok('la cuenta 2 no declara el extracto de la 1 (el papel no es suyo)',
  lanza(() => conc.declararExtracto(db, 2, papelExtracto.id)) !== null);
ok('la cuenta 2 no ve movimientos ni matches de la 1',
  conc.listMovimientos(db, 2, {}).total === 0 && conc.listMatches(db, 2, {}).total === 0
  && conc.getMovimiento(db, 2, M1.id) === null);
const escU2 = conc.conciliar(db, 2, { hoy: HOY });
ok('el escaneo de la cuenta 2 no toca nada de la 1 (0 procesados; F5 de la 1 sigue esperando su par)',
  escU2.procesados === 0 && fact.getFactura(db, 1, F5.id).saldo === 77000);

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido mínimo');
const PORT = 3987;
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g17-'));
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
  const reg = await call('POST', '/api/auth/register', { email: 'g17@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/conciliacion/resumen', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/conciliacion/resumen', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f.exec('PRAGMA busy_timeout = 5000');
  const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g17@example.com');
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'esencial');
  f.close();
  const resumenHttp = await call('GET', '/api/gesty/conciliacion/resumen', null, reg.cookie);
  ok('http: con pack Esencial (capacidad «comprobantes») el resumen responde 200 y en cero',
    resumenHttp.status === 200 && resumenHttp.data.resumen.extractos === 0, JSON.stringify(resumenHttp.data).slice(0, 200));
  const escHttp = await call('POST', '/api/gesty/conciliacion/escanear', { hoy: HOY }, reg.cookie);
  ok('http: el escaneo sobre la cuenta vacía corre y no asienta nada',
    escHttp.status === 200 && escHttp.data.asentados.length === 0 && escHttp.data.errores.length === 0,
    JSON.stringify(escHttp.data).slice(0, 200));
  const declHttp = await call('POST', '/api/gesty/conciliacion/extractos', { comprobante_id: 999999 }, reg.cookie);
  ok('http: declarar un papel ajeno/inexistente → 400 del módulo (la ruta llega y el módulo manda)',
    declHttp.status === 400, String(declHttp.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
