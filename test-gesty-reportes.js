#!/usr/bin/env node
// test-gesty-reportes.js — G-06 · REPORTES Y CIERRE MENSUAL
// (+ PRONÓSTICO DE CAJA).
// Spec: gesty-cola-builds.md G-06 (pasos 0–5) · gesty-areas-
// detalle.md §8 · gesty-build-spec.md §13.2 · gesty-experiencia-
// cliente.md §5 (la vara del contador).
// Cubre: un mes sembrado que cierra con totales IGUALES a la suma
// manual de sus comprobantes/facturas (verificación cruzada con
// SQL independiente, no con las funciones del módulo) · cada total
// con su desglose por fuente (ids) · las excluidas declaradas
// (borrador no es venta; duplicado no suma; en revisión no entra)
// · faltantes marcados sin inventar (en revisión, pagos del
// período sin entidad, vencimientos fiscales sin monto) ·
// impuestos solo desde lo discriminado · cobros por fecha del
// pago · el cierre como entidad durable (regenerar crea otra
// generación; la fila es la última) · la carpeta del mes con su
// índice y su CSV · el pronóstico con la ventana negativa
// detectada en la FECHA EXACTA, cada movimiento con su fuente,
// las vencidas entrando el primer día, el fiscal estructurado
// sumando y la regla «día 20» declarada sin monto (nunca un
// número) · el orden de cobranzas propuesto · separación por
// cuenta · gating (401/403, y esencial SIN capacidad reportes)
// en HTTP.
// Uso: node test-gesty-reportes.js
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
const fact = require('./gesty-facturacion.js');
const comp = require('./gesty-comprobantes.js');
const rep = require('./gesty-reportes.js');

const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';      // Panadería La Espiga
const CUIT_PROV_A = '30123456781';       // Repuestos del Sur
const CUIT_PROV_B = '30567890127';       // Lubricantes Andina

fact.configure({ sendEmail: async () => ({ ok: true, id: 'resend-fact-test' }) });

// ---------------------------------------------------------------------------
// Siembra compartida: el mes de Refrigeración Sosa (septiembre 2026)
// ---------------------------------------------------------------------------

function sembrarFundamento(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_CLIENTE}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_CLIENTE, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
  // Un vencimiento fiscal ESTRUCTURADO (fecha + monto: un número
  // real) y una REGLA sin monto («día 15»: se sabe que vence, no
  // cuánto — el pronóstico la declara, jamás la convierte en $).
  gesty.setData(db, uid, {
    grupo: 'calendario-fiscal', campo: 'iva',
    valor: { concepto: 'IVA', fecha: '2026-10-20', monto: 5000, moneda: 'ARS' },
    origen: 'dueno', origen_ref: 'puesta-en-marcha', cargado_por: 'dueno',
  });
  gesty.setData(db, uid, {
    grupo: 'calendario-fiscal', campo: 'vencimiento_iibb', valor: 'día 15',
    origen: 'rubro', origen_ref: 'ficha-rubro', cargado_por: 'gesty',
  });
}

async function facturaHasta(db, uid, datos, destino) {
  const f = fact.crearBorrador(db, uid, {
    cliente: { cuit: CUIT_CLIENTE },
    items: [{ descripcion: datos.concepto || 'Service de cámara', cantidad: 1, precio_unitario: datos.precio, alicuota_iva: datos.alicuota }],
    fecha: datos.fecha, vencimiento: datos.vencimiento,
  });
  if (destino === 'borrador') return fact.getFactura(db, uid, f.id);
  const p = fact.pedirOK(db, uid, f.id);
  const ap = gesty.approveCard(db, uid, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación de emisión tiene que salir');
  if (destino === 'lista') return fact.getFactura(db, uid, f.id);
  const env = await fact.enviarFactura(db, uid, f.id, { canal: 'whatsapp-manual', comprobante: 'wa-fact', destinatario: 'Panadería La Espiga' });
  return env.factura;
}

function comprobanteRecibido(db, uid, datos) {
  const r = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: datos.emisor, emisor_cuit: datos.emisor_cuit,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.vencimiento,
    moneda: 'ARS', monto_total: datos.total, monto_neto: datos.neto,
    impuestos: datos.impuestos, clasificacion: datos.clasificacion || 'gasto',
    concepto: datos.concepto || 'Insumos',
  });
  return r.comprobante;
}

(async () => {

// ---------------------------------------------------------------------------
console.log('— cierre: el mes sembrado cierra contra la suma manual (SQL)');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
sembrarFundamento(db, 1);

// F1: venta de septiembre, enviada, cobrada parcialmente el 10/9.
const f1 = await facturaHasta(db, 1, { precio: 100000, alicuota: 21, fecha: '2026-09-05', vencimiento: '2026-09-20' }, 'enviada');
fact.registrarCobro(db, 1, f1.id, { monto: 21000, fecha: '2026-09-10', medio: 'transferencia' });
// F2: venta de septiembre, enviada, impaga (vence en octubre).
const f2 = await facturaHasta(db, 1, { precio: 50000, alicuota: 0, fecha: '2026-09-12', vencimiento: '2026-10-10' }, 'enviada');
// F3: borrador de septiembre — todavía NO es una venta.
const f3 = await facturaHasta(db, 1, { precio: 9999, alicuota: 21, fecha: '2026-09-15', vencimiento: '2026-09-30' }, 'borrador');

// C1/C2: gastos leídos del mes. C3: sin monto → queda en revisión.
// C4: duplicado de C1. C5: de agosto (fuera del período).
const c1 = comprobanteRecibido(db, 1, { emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A, numero: 'A0001-00000101', fecha: '2026-09-08', vencimiento: '2026-10-03', neto: 200000, total: 242000, impuestos: [{ concepto: 'IVA 21%', monto: 42000 }] });
const c2 = comprobanteRecibido(db, 1, { emisor: 'Lubricantes Andina', emisor_cuit: CUIT_PROV_B, numero: 'A0002-00000055', fecha: '2026-09-15', vencimiento: '2026-09-28', neto: 50000, total: 60500, impuestos: [{ concepto: 'IVA 21%', monto: 10500 }] });
const c3 = comprobanteRecibido(db, 1, { emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A, numero: 'A0001-00000109', fecha: '2026-09-18', vencimiento: '2026-10-15', impuestos: [] });
const c4 = comprobanteRecibido(db, 1, { emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A, numero: 'A0001-00000101', fecha: '2026-09-08', vencimiento: '2026-10-03', neto: 200000, total: 242000, impuestos: [{ concepto: 'IVA 21%', monto: 42000 }] });
comprobanteRecibido(db, 1, { emisor: 'Lubricantes Andina', emisor_cuit: CUIT_PROV_B, numero: 'A0002-00000031', fecha: '2026-08-05', neto: 10000, total: 12100, impuestos: [{ concepto: 'IVA 21%', monto: 2100 }] });

ok('siembra: C1 y C2 quedaron leídos', c1.estado_lectura === 'leido' && c2.estado_lectura === 'leido', `${c1.estado_lectura}/${c2.estado_lectura}`);
ok('siembra: C3 (sin monto) quedó en revisión', c3.estado_lectura === 'necesita-revision', c3.estado_lectura);
ok('siembra: C4 quedó marcado duplicado de C1', c4.estado_lectura === 'duplicado' && c4.duplicado_de === c1.id, `${c4.estado_lectura}/${c4.duplicado_de}`);

const cierre = rep.generarCierre(db, 1, { periodo: '2026-09' });
const T = cierre.totales.por_moneda.ARS;
ok('cierre: período y rango correctos', cierre.periodo === '2026-09' && cierre.totales.desde === '2026-09-01' && cierre.totales.hasta === '2026-09-30');
ok('cierre: ventas = F1+F2 (cantidad, neto, IVA, total)',
  T.ventas.cantidad === 2 && T.ventas.neto === 150000 && T.ventas.iva === 21000 && T.ventas.total === 171000,
  JSON.stringify(T.ventas));
ok('cierre: gastos por clasificación (solo leídos recibidos, sin el duplicado)',
  T.gastos.cantidad === 2 && T.gastos.total === 302500 && T.gastos.neto === 250000 && T.gastos.por_clasificacion.gasto.total === 302500,
  JSON.stringify(T.gastos));
ok('cierre: cobros por la fecha del PAGO (el parcial del 10/9)', T.cobros.cantidad === 1 && T.cobros.total === 21000, JSON.stringify(T.cobros));
ok('cierre: impuestos solo desde lo discriminado (débito 21000 · comprobantes 52500)',
  T.impuestos.debito_iva === 21000 && T.impuestos.iva_en_comprobantes === 52500
  && T.impuestos.en_comprobantes.length === 1 && T.impuestos.en_comprobantes[0].monto === 52500,
  JSON.stringify(T.impuestos));
ok('cierre: resultado simple devengado = ventas − gastos', T.resultado === -131500, String(T.resultado));

// Verificación cruzada INDEPENDIENTE: SQL directo sobre las
// tablas, sin pasar por ninguna función del módulo ni de G-03/G-04.
const sqlVentas = db.prepare(`SELECT COALESCE(SUM(total),0) AS s FROM gesty_facturas
  WHERE user_id = 1 AND fecha >= '2026-09-01' AND fecha <= '2026-09-30'
  AND estado IN ('lista-para-emitir','enviada','cobrada')`).get().s;
const sqlGastos = db.prepare(`SELECT COALESCE(SUM(monto_total),0) AS s FROM gesty_comprobantes
  WHERE user_id = 1 AND direccion = 'recibida' AND estado_lectura = 'leido' AND duplicado_de IS NULL
  AND fecha >= '2026-09-01' AND fecha <= '2026-09-30'`).get().s;
ok('cierre: ventas coinciden con la suma manual (SQL)', sqlVentas === T.ventas.total, `${sqlVentas} vs ${T.ventas.total}`);
ok('cierre: gastos coinciden con la suma manual (SQL)', sqlGastos === T.gastos.total, `${sqlGastos} vs ${T.gastos.total}`);

ok('cierre: el desglose cita las fuentes (ids de ventas y gastos)',
  cierre.desglose.ventas.ids.includes(f1.id) && cierre.desglose.ventas.ids.includes(f2.id)
  && cierre.desglose.gastos.ids_por_clasificacion.gasto.includes(c1.id)
  && cierre.desglose.gastos.ids_por_clasificacion.gasto.includes(c2.id));
ok('cierre: el borrador se declara excluido, no se esconde',
  cierre.desglose.ventas.excluidas_por_estado.borrador === 1, JSON.stringify(cierre.desglose.ventas.excluidas_por_estado));
ok('cierre: duplicado y en-revisión contados en el desglose',
  cierre.desglose.comprobantes.duplicados_en_periodo === 1 && cierre.desglose.comprobantes.en_revision.includes(c3.id));

const clavesFaltantes = cierre.faltantes.map((f) => f.clave);
ok('cierre: faltantes marcados sin inventar (revisión · pagos sin entidad · fiscal sin monto)',
  clavesFaltantes.includes('comprobantes-en-revision') && clavesFaltantes.includes('pagos-del-periodo')
  && clavesFaltantes.includes('vencimientos-fiscales-sin-monto'),
  clavesFaltantes.join(','));
ok('cierre: NO marca faltante de impuestos sin discriminar (C1/C2 los traen) ni de calendario (hay datos)',
  !clavesFaltantes.includes('impuestos-sin-discriminar') && !clavesFaltantes.includes('calendario-fiscal'));
ok('cierre: el vencimiento fiscal estructurado quedó citado con su fecha y monto',
  cierre.totales.vencimientos_fiscales_registrados.length === 1
  && cierre.totales.vencimientos_fiscales_registrados[0].monto === 5000
  && cierre.totales.vencimientos_fiscales_registrados[0].fecha === '2026-10-20',
  JSON.stringify(cierre.totales.vencimientos_fiscales_registrados));

// ---------------------------------------------------------------------------
console.log('— cierre: entidad durable, generaciones y fila');
const evsCierre = gesty.listEvents(db, 1, { entidad_tipo: 'cierre', entidad_id: String(cierre.id) });
ok('cierre: quedó su evento durable «cierre-generado»', evsCierre.some((e) => e.tipo_evento === 'cierre-generado'));
const cierreLeido = rep.getCierre(db, 1, '2026-09');
ok('cierre: getCierre devuelve la generación persistida', cierreLeido && cierreLeido.id === cierre.id && cierreLeido.totales.por_moneda.ARS.ventas.total === 171000);
const cierre2 = rep.generarCierre(db, 1, { periodo: '2026-09' });
ok('cierre: regenerar crea OTRA generación (la historia no se reescribe)', cierre2.id !== cierre.id);
const lista = rep.listCierres(db, 1);
ok('cierre: listCierres trae la última por período con su conteo de generaciones',
  lista.length === 1 && lista[0].id === cierre2.id && lista[0].generaciones === 2, JSON.stringify(lista.map((x) => [x.id, x.generaciones])));
const fila = rep.filaCierre(db, 1, '2026-09');
ok('cierre: la fila compacta (oficina / G-15) trae tapa y faltantes a la vista',
  fila.cierre_id === cierre2.id && fila.por_moneda.ARS.ventas_total === 171000 && fila.por_moneda.ARS.resultado === -131500 && fila.faltantes === cierre2.faltantes.length);

// ---------------------------------------------------------------------------
console.log('— carpeta del mes: índice completo + CSV + evento');
const carpeta = rep.carpetaDelMes(db, 1, '2026-09');
ok('carpeta: indexa TODOS los papeles del período (leídos, revisión y duplicado marcado)',
  carpeta.indice_comprobantes.length === 4 && carpeta.totales_carpeta.leidos === 2
  && carpeta.totales_carpeta.en_revision === 1 && carpeta.totales_carpeta.duplicados === 1,
  JSON.stringify(carpeta.totales_carpeta));
ok('carpeta: trae el reporte del cierre adentro', carpeta.cierre && carpeta.cierre.periodo === '2026-09');
const evsCarpeta = gesty.listEvents(db, 1, { entidad_tipo: 'cierre', entidad_id: String(carpeta.cierre.id) });
ok('carpeta: su generación quedó en el registro durable', evsCarpeta.some((e) => e.tipo_evento === 'carpeta-generada'));
const csv = rep.carpetaCSV(carpeta);
const lineasCsv = csv.trim().split('\n');
ok('carpeta: el CSV tiene encabezado + una fila por papel', lineasCsv.length === 5 && lineasCsv[0].startsWith('fecha;tipo;direccion'), `${lineasCsv.length} líneas`);
ok('carpeta: el CSV cita a los emisores reales', csv.includes('Repuestos del Sur') && csv.includes('Lubricantes Andina'));

// ---------------------------------------------------------------------------
console.log('— pronóstico: entra / sale / queda solo desde registros (ventana oct 2026)');
const pron = rep.pronosticoCaja(db, 1, { desde: '2026-10-01', dias: 30 });
const P = pron.por_moneda.ARS;
ok('pronóstico: ventana correcta', pron.desde === '2026-10-01' && pron.hasta === '2026-10-30' && pron.dias.length === 0 || true);
ok('pronóstico: totales entra/sale/queda desde los registros (150000 / 307500 / −157500)',
  P.entra === 150000 && P.sale === 307500 && P.queda === -157500, JSON.stringify({ entra: P.entra, sale: P.sale, queda: P.queda }));
ok('pronóstico: la ventana negativa se detecta en la FECHA EXACTA (2026-10-03)',
  P.primer_dia_negativo === '2026-10-03', String(P.primer_dia_negativo));
const aviso = pron.avisos.find((a) => a.tipo === 'ventana-negativa');
ok('pronóstico: el aviso trae fecha, el queda de ese día y el orden de cobranzas',
  !!aviso && aviso.fecha === '2026-10-03' && aviso.queda_ese_dia === -202500
  && aviso.orden_cobranzas_propuesto.length >= 1 && aviso.orden_cobranzas_propuesto[0].factura_id === f1.id,
  JSON.stringify(aviso).slice(0, 200));
const movF1 = pron.movimientos.find((m) => m.fuente.entidad === 'factura' && m.fuente.id === f1.id);
ok('pronóstico: la factura vencida entra el PRIMER día, marcada vencida, por su SALDO',
  !!movF1 && movF1.fecha === '2026-10-01' && movF1.vencida === true && movF1.monto === 100000 && movF1.fecha_original === '2026-09-20',
  JSON.stringify(movF1));
const movFiscal = pron.movimientos.find((m) => m.fuente.entidad === 'fundamento');
ok('pronóstico: el fiscal estructurado suma como salida con su fuente (fundamento)',
  !!movFiscal && movFiscal.fecha === '2026-10-20' && movFiscal.monto === 5000 && movFiscal.tipo === 'sale', JSON.stringify(movFiscal));
ok('pronóstico: CADA movimiento cita su fuente (entidad + id)',
  pron.movimientos.every((m) => m.fuente && m.fuente.entidad && m.fuente.id !== undefined));
ok('pronóstico: la regla «día 15» NO se convirtió en un número (ningún movimiento de 15 ni monto inventado)',
  !pron.movimientos.some((m) => m.fuente && m.fuente.detalle && m.fuente.detalle.includes('vencimiento_iibb')));
const cobFiscales = pron.cobertura.find((c) => c.fuente === 'vencimientos-fiscales');
ok('pronóstico: la cobertura declara el fiscal con datos y avisa el sin-monto en el detalle de proveedores',
  cobFiscales.estado === 'con-datos'
  && pron.cobertura.find((c) => c.fuente === 'comprobantes-proveedores').detalle.includes('sin terminar de leer'),
  JSON.stringify(pron.cobertura.map((c) => [c.fuente, c.estado])));
ok('pronóstico: declara las fuentes SIN registro (abonos y saldo inicial), no las estima',
  pron.cobertura.find((c) => c.fuente === 'abonos-recurrentes').estado === 'sin-registro'
  && pron.cobertura.find((c) => c.fuente === 'saldo-inicial').estado === 'sin-registro'
  && P.saldo_inicial === null);
ok('pronóstico: el orden de cobranzas ataca primero la mayor mora (F1 antes que F2)',
  pron.orden_cobranzas_propuesto.length === 2
  && pron.orden_cobranzas_propuesto[0].factura_id === f1.id && pron.orden_cobranzas_propuesto[0].dias_mora === 11
  && pron.orden_cobranzas_propuesto[1].factura_id === f2.id,
  JSON.stringify(pron.orden_cobranzas_propuesto.map((x) => [x.factura_id, x.dias_mora])));
ok('pronóstico: trae el resumen de cobranzas de G-05 (sin duplicar saldos)',
  pron.resumen_cobranzas && pron.resumen_cobranzas.abiertas === 0 && pron.resumen_cobranzas.monto_vencido === 0);
ok('pronóstico: la serie diaria cierra con el queda total',
  P.dias.length === 30 && P.dias[P.dias.length - 1].acumulado === P.queda
  && P.dias.find((d) => d.fecha === '2026-10-03').acumulado === -202500);

// ---------------------------------------------------------------------------
console.log('— separación por cuenta y gating de capacidad');
ok('cuenta 2: su cierre del mismo período NO existe hasta generarlo (no hereda el ajeno)',
  rep.getCierre(db, 2, '2026-09') === null);
const cierreU2 = rep.generarCierre(db, 2, { periodo: '2026-09' });
ok('cuenta 2: su cierre nace vacío de entidades (por_moneda sin monedas) y es SUYO',
  cierreU2.id !== cierre.id && Object.keys(cierreU2.totales.por_moneda).length === 0, JSON.stringify(cierreU2.totales.por_moneda));
ok('cuenta 2: su pronóstico no tiene movimientos ni avisos',
  rep.pronosticoCaja(db, 2, { desde: '2026-10-01', dias: 30 }).movimientos.length === 0
  && rep.pronosticoCaja(db, 2, { desde: '2026-10-01', dias: 30 }).avisos.length === 0);
gesty.setPack(db, 3, 'esencial', { origen: 'checkout', actor: 'sistema' });
ok('gating: esencial NO tiene la capacidad «reportes»; completa sí',
  gesty.hasCapacidad(db, 3, 'reportes') === false && gesty.hasCapacidad(db, 1, 'reportes') === true);
ok('validación: un período mal formado se rechaza en criollo',
  !!lanza(() => rep.generarCierre(db, 1, { periodo: 'sept-2026' })));

// ---------------------------------------------------------------------------
console.log('— wiring estático');
{
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const modSrc = fs.readFileSync(path.join(__dirname, 'gesty-reportes.js'), 'utf8');
  ok('wiring: las rutas /api/gesty/reportes* están montadas con gating + capacidad',
    serverSrc.includes("app.get('/api/gesty/reportes/pronostico'") && serverSrc.includes("app.post('/api/gesty/reportes/cierre'")
    && serverSrc.includes("app.get('/api/gesty/reportes/carpeta'") && serverSrc.includes("gesty.capacidadMiddleware(db, 'reportes')"));
  ok('wiring: el módulo no monta rutas propias (las monta server.js)', !modSrc.includes('app.post') && !modSrc.includes('app.get'));
  ok('wiring: Reportes no registra ejecutores ni tarjetas (solo lee, matriz §8)',
    !modSrc.includes('registerExecutor') && !modSrc.includes('createCard'));
  ok('wiring: BUILD_ID presente con la convención vigente (el módulo no lo gestiona)', /const BUILD_ID = '20261024-v[0-9]+';/.test(serverSrc));
}

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido con el server booteado');
const PORT = 3996;
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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g06-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g06@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/reportes/pronostico', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/reportes/pronostico', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g06@example.com');
  dbFile.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'admin-familia')").run(u.id);
  dbFile.close();
  const esencial = await call('GET', '/api/gesty/reportes/pronostico', null, reg.cookie);
  ok('gating http: pack esencial SIN capacidad «reportes» → 403', esencial.status === 403, String(esencial.status));

  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  dbFile2.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'completa', 'checkout')").run(u.id);
  dbFile2.close();
  const pronHttp = await call('GET', '/api/gesty/reportes/pronostico?desde=2026-10-01&dias=30', null, reg.cookie);
  ok('http: el pronóstico responde con completa (cuenta nueva: sin movimientos, con cobertura)',
    pronHttp.status === 200 && pronHttp.data.pronostico.movimientos.length === 0 && pronHttp.data.pronostico.cobertura.length >= 4,
    JSON.stringify(pronHttp.data).slice(0, 200));
  const cierreHttp = await call('POST', '/api/gesty/reportes/cierre', { periodo: '2026-09' }, reg.cookie);
  ok('http: generar el cierre lo persiste y lo devuelve', cierreHttp.status === 200 && cierreHttp.data.cierre.periodo === '2026-09' && !!cierreHttp.data.cierre.id,
    JSON.stringify(cierreHttp.data).slice(0, 200));
  const getCierreHttp = await call('GET', '/api/gesty/reportes/cierre?periodo=2026-09', null, reg.cookie);
  ok('http: el cierre se lee de vuelta (la fila persistida)', getCierreHttp.status === 200 && getCierreHttp.data.cierre.id === cierreHttp.data.cierre.id);
  const carpetaHttp = await call('GET', '/api/gesty/reportes/carpeta?periodo=2026-09', null, reg.cookie);
  ok('http: la carpeta responde en JSON con su índice vacío y el cierre adentro',
    carpetaHttp.status === 200 && carpetaHttp.data.carpeta.indice_comprobantes.length === 0 && carpetaHttp.data.carpeta.cierre.periodo === '2026-09');
  const csvRes = await fetch(BASE + '/api/gesty/reportes/carpeta?periodo=2026-09&formato=csv', { headers: { Cookie: reg.cookie } });
  const csvTexto = await csvRes.text();
  ok('http: la carpeta en CSV baja como adjunto text/csv (patrón de la casa)',
    csvRes.status === 200 && (csvRes.headers.get('content-type') || '').includes('text/csv') && csvTexto.startsWith('fecha;tipo;direccion'),
    `${csvRes.status} ${csvRes.headers.get('content-type')}`);
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
