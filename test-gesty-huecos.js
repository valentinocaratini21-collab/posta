#!/usr/bin/env node
// test-gesty-huecos.js — G-18 · DETECTOR DE HUECOS.
// Spec: gesty-cola-builds.md G-18 (aceptación: «hueco sembrado
// detectado el mismo día del cierre con número exacto; proveedor
// ausente detectado al vencer ciclo + gracia; cero alertas sobre
// series completas») · gesty-sistema-operativo.md (detectar es
// autopilot; este build no envía nada).
// Cubre: correlatividad desde papeles G-03 con el rango exacto ·
// la anulada con motivo de G-04 = hueco explicado (no alerta) ·
// serie completa → cero alertas · serie de un solo papel → no se
// presume el inicio · proveedor habitual sin facturar (base y
// ciclo citados) · proveedor sin base → declarado, sin alerta ·
// papel mensual del fundamento ausente (solo período cerrado;
// el mes en curso no alerta) · texto libre del fundamento NO
// genera faltante · resolución por papel que aparece, por nota
// del dueño y por vínculo manual · re-escaneo idempotente que
// no resucita resueltos · la vista unificada con el acople de
// G-15 · separación por cuenta · gating HTTP.
// Uso: node test-gesty-huecos.js
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
const reportes = require('./gesty-reportes.js');
const huecos = require('./gesty-huecos.js');

const CUIT_PROPIO = '20123456786';
const CUIT_A = '27234567891';   // cliente
const CUIT_X = '30123456781';   // proveedor mensual (ciclo 30)
const CUIT_Y = '30234567812';   // proveedor con poca base (2)
const CUIT_Z = '30345678913';   // proveedor mensual al día
const CUIT_W = '30789012345';   // Inmobiliaria Centro (alquiler)
const HOY = '2026-11-02';

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
    grupo: 'papeles-esperados', campo: 'alquiler',
    valor: { concepto: 'Alquiler del local', periodicidad: 'mensual', contraparte_cuit: CUIT_W, contraparte_nombre: 'Inmobiliaria Centro', tipo: 'factura-recibida' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
  gesty.setData(db, uid, {
    grupo: 'papeles-esperados', campo: 'nota-suelta', valor: 'el alquiler se paga todos los meses, acordate',
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}

function papelEmitido(db, uid, numero, fecha) {
  return comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'emitida',
    emisor_nombre: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
    receptor_nombre: 'Panadería La Espiga', receptor_cuit: CUIT_A,
    numero, fecha, moneda: 'ARS', monto_total: 50000, clasificacion: 'venta', concepto: 'Servicio',
  }).comprobante;
}

function papelRecibido(db, uid, datos) {
  return comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: datos.nombre, emisor_cuit: datos.cuit,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.fecha,
    moneda: 'ARS', monto_total: datos.monto || 100000, clasificacion: 'gasto', concepto: datos.concepto || 'Insumos',
  }).comprobante;
}

const abiertos = (db, uid, tipo) => huecos.listHuecos(db, uid, { estado: 'abierto', tipo, limit: 1000 }).huecos;

(async () => {

// ---------------------------------------------------------------------------
console.log('— unidad: parseo de números');
ok('parseo: 0001-00000123 → pv 1, nro 123',
  (() => { const p = huecos.parseNumero('0001-00000123'); return p && p.punto_venta === 1 && p.numero === 123; })());
ok('parseo: A0002-00000007 → letra A, pv 2, nro 7',
  (() => { const p = huecos.parseNumero('A0002-00000007'); return p && p.letra === 'A' && p.punto_venta === 2 && p.numero === 7; })());
ok('parseo: número pelado → sin punto de venta',
  (() => { const p = huecos.parseNumero('123'); return p && p.punto_venta === null && p.numero === 123; })());
ok('parseo: lo inparseable no se juzga (null)', huecos.parseNumero('XYZ-ABC') === null && huecos.parseNumero('') === null);

// ---------------------------------------------------------------------------
console.log('— el mes sembrado: escaneo el mismo día del cierre');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
sembrarFundamento(db, 1);

// Serie propia pv 0001 con un hueco (falta el 103) y serie pv 0002 completa.
papelEmitido(db, 1, '0001-00000101', '2026-10-05');
papelEmitido(db, 1, '0001-00000102', '2026-10-08');
papelEmitido(db, 1, '0001-00000104', '2026-10-20');
papelEmitido(db, 1, '0001-00000105', '2026-10-25');
papelEmitido(db, 1, '0002-00000301', '2026-10-06');
papelEmitido(db, 1, '0002-00000302', '2026-10-13');
papelEmitido(db, 1, '0002-00000303', '2026-10-21');
// Serie de un solo papel: no se presume el inicio.
papelEmitido(db, 1, '0009-00000501', '2026-10-11');

// Proveedores: X mensual (ciclo 30, último en septiembre), Y con
// poca base, Z mensual al día, W alquiler (solo septiembre).
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_X, numero: '0001-00000901', fecha: '2026-07-06' });
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_X, numero: '0001-00000902', fecha: '2026-08-05' });
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_X, numero: '0001-00000903', fecha: '2026-09-04' });
papelRecibido(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_Y, numero: '0001-00000701', fecha: '2026-09-01' });
papelRecibido(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_Y, numero: '0001-00000702', fecha: '2026-10-01' });
papelRecibido(db, 1, { nombre: 'Tornillería El Faro', cuit: CUIT_Z, numero: '0001-00000501', fecha: '2026-08-01' });
papelRecibido(db, 1, { nombre: 'Tornillería El Faro', cuit: CUIT_Z, numero: '0001-00000502', fecha: '2026-08-31' });
papelRecibido(db, 1, { nombre: 'Tornillería El Faro', cuit: CUIT_Z, numero: '0001-00000503', fecha: '2026-09-30' });
papelRecibido(db, 1, { nombre: 'Tornillería El Faro', cuit: CUIT_Z, numero: '0001-00000504', fecha: '2026-10-30' });
papelRecibido(db, 1, { nombre: 'Inmobiliaria Centro', cuit: CUIT_W, numero: '0001-00000311', fecha: '2026-09-10', concepto: 'Alquiler' });

const cierre = reportes.generarCierre(db, 1, '2026-10');
ok('montaje: el cierre de octubre se generó', !!cierre && !!cierre.id);

const esc1 = huecos.escanearHuecos(db, 1, { hoy: HOY });
const hNum = abiertos(db, 1, 'numeracion');
ok('numeración: un solo hueco abierto (la serie completa y la de un papel no alertan)',
  hNum.length === 1, JSON.stringify(hNum.map((h) => h.clave)));
ok('numeración: el hueco es el 00000103, con el rango exacto',
  hNum.length === 1 && JSON.stringify(hNum[0].extra.numeros) === '[103]' && hNum[0].dato_que_falta.includes('00000103'),
  hNum.length ? hNum[0].dato_que_falta : 'sin hueco');
ok('numeración: el detalle cita los comprobantes que lo rodean (102 y 104)',
  hNum.length === 1 && hNum[0].detalle.includes('00000102') && hNum[0].detalle.includes('00000104'));
ok('numeración: el hueco pertenece al período del cierre (2026-10)',
  hNum.length === 1 && hNum[0].periodo === '2026-10', hNum.length ? hNum[0].periodo : '');

const hProv = abiertos(db, 1, 'proveedor');
ok('proveedor: Distribuidora Sur no facturó en su ciclo → un hueco',
  hProv.length === 1 && hProv[0].extra.cuit === CUIT_X, JSON.stringify(hProv.map((h) => h.extra && h.extra.proveedor)));
ok('proveedor: el hueco cita su base (3 comprobantes, ciclo ~30 días, esperado 2026-10-04)',
  hProv.length === 1 && hProv[0].extra.base_comprobantes === 3 && hProv[0].extra.ciclo_dias === 30
  && hProv[0].extra.fecha_esperada === '2026-10-04' && hProv[0].detalle.includes('3 comprobantes observados'),
  hProv.length ? hProv[0].detalle : '');
ok('proveedor: Papelera Andina (2 comprobantes) queda declarada sin base y NO alerta',
  esc1.sin_base.some((s) => s.cuit === CUIT_Y && s.motivo === 'base-insuficiente')
  && !hProv.some((h) => h.extra.cuit === CUIT_Y));
ok('proveedor: Tornillería El Faro está dentro de su ciclo → no alerta',
  !hProv.some((h) => h.extra.cuit === CUIT_Z));

const hFun = abiertos(db, 1, 'fundamento');
ok('fundamento: falta el alquiler de octubre (período cerrado)',
  hFun.length === 1 && hFun[0].periodo === '2026-10' && hFun[0].dato_que_falta.includes('Alquiler del local'),
  JSON.stringify(hFun.map((h) => h.clave)));
ok('fundamento: el mes en curso (2026-11) se declara en curso y NO alerta',
  esc1.fundamento.en_curso.includes('2026-11') && !hFun.some((h) => h.periodo === '2026-11'));
ok('fundamento: la nota en texto libre se cuenta como no estructurada y no genera nada',
  esc1.fundamento.no_estructurados >= 1 && esc1.fundamento.declarados === 1);

const unif = huecos.faltantesDelPeriodo(db, 1, '2026-10');
ok('vista unificada: los 3 huecos del detector entran como faltantes tipados del período',
  unif.totales.del_detector === 3 && unif.faltantes.filter((f) => f.tipo === 'hueco').length === 3,
  JSON.stringify(unif.totales));
ok('vista unificada: convive con el acople de G-15 (cierre_id del cierre generado)',
  unif.cierre_id === cierre.id && Array.isArray(unif.faltantes), String(unif.cierre_id));

// ---------------------------------------------------------------------------
console.log('— idempotencia: re-escanear no duplica');
const esc2 = huecos.escanearHuecos(db, 1, { hoy: HOY });
ok('re-escaneo: cero creados y los abiertos siguen siendo 3',
  esc2.creados.length === 0 && huecos.listHuecos(db, 1, { estado: 'abierto' }).total === 3,
  `creados=${esc2.creados.length}`);

// ---------------------------------------------------------------------------
console.log('— resolución: el papel aparece');
const p103 = papelEmitido(db, 1, '0001-00000103', '2026-10-15');
const esc3 = huecos.escanearHuecos(db, 1, { hoy: HOY });
const h103 = huecos.listHuecos(db, 1, { tipo: 'numeracion' }).huecos.find((h) => (h.extra.numeros || []).includes(103));
ok('resolución: el 103 apareció → hueco resuelto-papel con el vínculo al comprobante',
  !!h103 && h103.estado === 'resuelto-papel' && h103.resolucion.comprobante_id === p103.id,
  h103 ? `${h103.estado}/${JSON.stringify(h103.resolucion)}` : 'sin hueco');

const pAlqOct = papelRecibido(db, 1, { nombre: 'Inmobiliaria Centro', cuit: CUIT_W, numero: '0001-00000312', fecha: '2026-10-15', concepto: 'Alquiler' });
huecos.escanearHuecos(db, 1, { hoy: HOY });
const hAlq = huecos.listHuecos(db, 1, { tipo: 'fundamento' }).huecos[0];
ok('resolución: el alquiler de octubre apareció → hueco de fundamento resuelto-papel',
  !!hAlq && hAlq.estado === 'resuelto-papel' && hAlq.resolucion.comprobante_id === pAlqOct.id,
  hAlq ? hAlq.estado : 'sin hueco');

papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_X, numero: '0001-00000904', fecha: '2026-11-02' });
huecos.escanearHuecos(db, 1, { hoy: HOY });
const hX = huecos.listHuecos(db, 1, { tipo: 'proveedor' }).huecos[0];
ok('resolución: Distribuidora Sur volvió a facturar → hueco resuelto-papel',
  !!hX && hX.estado === 'resuelto-papel', hX ? hX.estado : 'sin hueco');
ok('tras las resoluciones no queda ningún hueco abierto',
  huecos.listHuecos(db, 1, { estado: 'abierto' }).total === 0);

// ---------------------------------------------------------------------------
console.log('— resolución: la nota del dueño y el vínculo manual');
papelEmitido(db, 1, '0004-00000011', '2026-10-03');
papelEmitido(db, 1, '0004-00000013', '2026-10-06');
huecos.escanearHuecos(db, 1, { hoy: HOY });
const h12 = abiertos(db, 1, 'numeracion').find((h) => (h.extra.numeros || []).includes(12));
ok('nota: nace el hueco del 00000012 en la serie 0004', !!h12);
const h12r = huecos.explicarHueco(db, 1, h12.id, { nota: 'Se anuló en el facturador del negocio antes de usar Gesty' });
ok('nota: explicar resuelve como resuelto-nota y la nota queda en el registro',
  h12r.estado === 'resuelto-nota' && h12r.resolucion.nota.includes('Se anuló en el facturador'));
ok('nota: explicar sin nota se rechaza en voz alta',
  !!lanza(() => huecos.explicarHueco(db, 1, h12.id, { nota: '' })));
const escNota = huecos.escanearHuecos(db, 1, { hoy: HOY });
const h12b = huecos.getHueco(db, 1, h12.id);
ok('nota: el re-escaneo NO resucita el hueco explicado aunque el número siga faltando',
  h12b.estado === 'resuelto-nota' && !escNota.creados.some((h) => h.clave === h12.clave));

papelEmitido(db, 1, '0005-00000021', '2026-10-03');
papelEmitido(db, 1, '0005-00000023', '2026-10-06');
huecos.escanearHuecos(db, 1, { hoy: HOY });
const h22 = abiertos(db, 1, 'numeracion').find((h) => (h.extra.numeros || []).includes(22));
ok('vínculo: nace el hueco del 00000022 en la serie 0005', !!h22);
ok('vínculo: un papel que no cubre el número se rechaza',
  !!lanza(() => huecos.vincularPapel(db, 1, h22.id, { comprobante_id: p103.id })));
const p22 = papelEmitido(db, 1, '0005-00000022', '2026-10-05');
const h22r = huecos.vincularPapel(db, 1, h22.id, { comprobante_id: p22.id });
ok('vínculo: el papel correcto cierra el hueco como resuelto-papel',
  h22r.estado === 'resuelto-papel' && h22r.resolucion.comprobante_id === p22.id);

// ---------------------------------------------------------------------------
console.log('— G-04: la anulada con motivo es hueco EXPLICADO, no alerta');
const colaNumeros = [401, 402, 404];
fact.registerEmisor('fake-huecos', {
  emitir() {
    const n = colaNumeros.shift();
    return { numero: `0003-${String(n).padStart(8, '0')}`, codigo_autorizacion: 'CAE-FAKE', pdf: null, modo: 'fake' };
  },
  anular(f, opts) { return { anulada_en_registro: true, modo: 'fake', motivo: (opts || {}).motivo || '' }; },
  estado() { return { conectado: true, modo: 'fake', nombre: 'fake-huecos' }; },
});
gesty.setData(db, 1, { grupo: 'reglas-dueno', campo: 'emisor_activo', valor: 'fake-huecos', origen: 'dueno', origen_ref: 'test', cargado_por: 'dueno' });

async function facturaConNumero(fecha) {
  const f = fact.crearBorrador(db, 1, {
    cliente: { nombre: 'Panadería La Espiga', cuit: CUIT_A }, letra: 'A',
    items: [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 10000, alicuota_iva: 0 }],
    fecha, vencimiento: '2026-10-24',
  });
  const p = fact.pedirOK(db, 1, f.id);
  const ap = gesty.approveCard(db, 1, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  if (!ap.ok) throw new Error('la aprobación de emisión falló');
  return fact.getFactura(db, 1, f.id);
}
const f401 = await facturaConNumero('2026-10-10');
const f402 = await facturaConNumero('2026-10-12');
const f404 = await facturaConNumero('2026-10-18');
ok('montaje G-04: tres facturas con número real del emisor (401, 402, 404)',
  f401.emision.numero === '0003-00000401' && f402.emision.numero === '0003-00000402' && f404.emision.numero === '0003-00000404',
  `${f401.emision.numero}/${f402.emision.numero}/${f404.emision.numero}`);
const an = fact.solicitarAnulacion(db, 1, f402.id, { motivo: 'El cliente canceló el trabajo' });
gesty.approveCard(db, 1, an.tarjeta.id, { version_documento: an.tarjeta.version_documento, usuario: 'dueno' });
ok('montaje G-04: la 402 quedó anulada con su motivo',
  fact.getFactura(db, 1, f402.id).estado === 'anulada');

const escAn = huecos.escanearHuecos(db, 1, { hoy: HOY });
const hG04 = abiertos(db, 1, 'numeracion').filter((h) => String(h.extra.serie_clave || '').startsWith('g04|'));
ok('anulada: el único hueco de la serie de G-04 es el 403 (el 402 NO alerta)',
  hG04.length === 1 && JSON.stringify(hG04[0].extra.numeros) === '[403]',
  JSON.stringify(hG04.map((h) => h.extra.numeros)));
ok('anulada: el escaneo la reporta como explicada, con su motivo',
  escAn.explicados.some((e) => e.numero === '0003-00000402' && e.motivo === 'El cliente canceló el trabajo'),
  JSON.stringify(escAn.explicados));

// ---------------------------------------------------------------------------
console.log('— separación por cuenta');
ok('cuenta 2: sin huecos, su escaneo no crea nada y no ve los de la 1',
  huecos.listHuecos(db, 2, {}).total === 0
  && huecos.escanearHuecos(db, 2, { hoy: HOY }).creados.length === 0
  && huecos.getHueco(db, 2, h103.id) === null);
ok('cuenta 2: no puede explicar un hueco ajeno',
  !!lanza(() => huecos.explicarHueco(db, 2, h103.id, { nota: 'ajeno' })));

const resumen = huecos.resumenHuecos(db, 1, { hoy: HOY });
ok('resumen para La oficina: abiertos y resueltos coherentes con el registro',
  resumen.abiertos === huecos.listHuecos(db, 1, { estado: 'abierto' }).total
  && resumen.resueltos >= 4 && !!resumen.ultimo_escaneo);

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido mínimo');
const PORT = 3986;
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g18-'));
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
  const reg = await call('POST', '/api/auth/register', { email: 'g18@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/huecos/resumen', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/huecos/resumen', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f.exec('PRAGMA busy_timeout = 5000');
  const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g18@example.com');
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'esencial');
  f.close();
  const resumenHttp = await call('GET', '/api/gesty/huecos/resumen', null, reg.cookie);
  ok('http: con pack Esencial (capacidad «comprobantes») el resumen responde 200 y en cero',
    resumenHttp.status === 200 && resumenHttp.data.resumen.abiertos === 0, JSON.stringify(resumenHttp.data).slice(0, 200));
  const escHttp = await call('POST', '/api/gesty/huecos/escanear', { hoy: HOY }, reg.cookie);
  ok('http: el escaneo sobre la cuenta vacía corre y no detecta nada',
    escHttp.status === 200 && escHttp.data.creados.length === 0,
    JSON.stringify(escHttp.data).slice(0, 200));
  const faltHttp = await call('GET', '/api/gesty/huecos/faltantes?periodo=2026-10', null, reg.cookie);
  ok('http: la vista unificada responde con su forma (faltantes + totales)',
    faltHttp.status === 200 && Array.isArray(faltHttp.data.faltantes) && typeof faltHttp.data.totales.total === 'number',
    JSON.stringify(faltHttp.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
