#!/usr/bin/env node
// test-gesty-precios.js — G-22 · AUDITORÍA DE PRECIOS DE PROVEEDORES.
// Spec: gesty-cola-builds.md G-22 (aceptación: «suba sembrada del
// 12% detectada con la serie correcta; variaciones menores al
// umbral no alertan; toda alerta cita comprobantes reales») ·
// gesty-sistema-operativo.md (detectar es autopilot; este build no
// envía nada a nadie).
// Cubre: la suba del 12% con el número exacto y la serie citada ·
// la referencia doble (anterior Y mediana: la de Papel obra dispara
// SOLO por mediana) · suba bajo el umbral → cero alertas, silencio
// registrado · serie de un solo precio → sin base declarado · el
// match de concepto dudoso («flete» / «flete exprés») NO une dos
// series y se declara · la serie de precios unitarios de las
// órdenes de compra de G-10 · la comparación entre dos proveedores
// del mismo concepto en la ventana · re-escaneo sin duplicar · la
// evolución de la alerta con un salto nuevo · el cierre por
// reversión · marcar vista no recrea la alerta · el papel sin
// concepto queda fuera y contado · separación por cuenta ·
// gating HTTP (401 / 403 sin pack / 403 Esencial sin la capacidad
// «proveedores» / 200 Completa).
// Uso: node test-gesty-precios.js
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
const comp = require('./gesty-comprobantes.js');
const stock = require('./gesty-stock.js');
const precios = require('./gesty-precios.js');

const CUIT_PROPIO = '20123456786';
const CUIT_SUR = '30123456781';    // Distribuidora Sur (flete + cajas)
const CUIT_ANDINA = '30234567812'; // Papelera Andina (resmas, bajo umbral)
const CUIT_NORTE = '30345678913';  // Logística Norte (flete barato)
const CUIT_CENTRAL = '30789012345';// Librería Central (papel obra, mediana)
const CUIT_SOLO = '27234567891';   // Insumos Solo (un solo precio)
const HOY = '2026-11-02';

function sembrarFundamento(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
}

// Un papel recibido: el precio de la serie es el NETO si viene; si
// neto es null, la serie usa el total (base distinta, declarada).
function papelRecibido(db, uid, datos) {
  return comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: datos.nombre, emisor_cuit: datos.cuit,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.fecha,
    moneda: 'ARS',
    monto_neto: datos.neto === undefined ? null : datos.neto,
    monto_total: datos.total !== undefined ? datos.total : (datos.neto ? Math.round(datos.neto * 1.21) : null),
    clasificacion: 'gasto', concepto: datos.concepto,
  }).comprobante;
}

function ordenCompra(db, uid, datos) {
  stock.ensureSchema(db);
  const items = [{
    item_id: 0, descripcion: datos.descripcion, cantidad: datos.cantidad || 10,
    precio_unitario: datos.precio,
    precio_fuente: { tipo: 'lista-precios', texto: 'sale de tu lista de precios del fundamento' },
    subtotal: (datos.cantidad || 10) * datos.precio,
  }];
  db.prepare(`INSERT INTO gesty_ordenes_compra
    (user_id, proveedor_campo, proveedor_nombre, proveedor_cuit, items, monto_total, moneda, estado, creado_por, created_at, updated_at)
    VALUES (?,?,?,?,?,?,'ARS','enviada','dueno',?,?)`)
    .run(uid, `cuit_${datos.cuit}`, datos.nombre, datos.cuit, JSON.stringify(items),
      (datos.cantidad || 10) * datos.precio, `${datos.fecha} 09:00:00`, `${datos.fecha} 09:00:00`);
}

const abiertas = (db, uid) => precios.listAlertas(db, uid, { estado: 'abierta', limit: 1000 }).alertas;

(async () => {
// ---------------------------------------------------------------------------
console.log('— la serie sembrada: el escaneo y sus alertas');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
sembrarFundamento(db, 1);
sembrarFundamento(db, 2);

const cfg0 = precios.getConfig(db, 1);
ok('config: sin dato en el fundamento mandan los defaults declarados (umbral 10%, ventana 90 días)',
  cfg0.umbral_pct === 10 && cfg0.ventana_comparacion_dias === 90 && cfg0.es_default === true, JSON.stringify(cfg0));

// Distribuidora Sur · Flete: 18.000 → 18.000 → 20.160 (+12,0% exactos).
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-101', fecha: '2026-08-05', neto: 18000, concepto: 'Flete' });
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-102', fecha: '2026-09-03', neto: 18000, concepto: 'Flete' });
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-103', fecha: '2026-10-02', neto: 20160, concepto: 'Flete' });
// El concepto dudoso: «Flete exprés» es OTRA serie (un solo precio).
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-104', fecha: '2026-10-05', neto: 30000, concepto: 'Flete exprés' });
// Un papel sin concepto legible: no entra a ninguna serie.
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-105', fecha: '2026-10-06', neto: 9999, concepto: '' });
// Papelera Andina · Resmas A4: +5% — bajo el umbral, silencio.
papelRecibido(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_ANDINA, numero: 'A-201', fecha: '2026-09-10', neto: 10000, concepto: 'Resmas A4' });
papelRecibido(db, 1, { nombre: 'Papelera Andina', cuit: CUIT_ANDINA, numero: 'A-202', fecha: '2026-10-10', neto: 10500, concepto: 'Resmas A4' });
// Insumos Solo · Tóner: un solo precio — sin base.
papelRecibido(db, 1, { nombre: 'Insumos Solo', cuit: CUIT_SOLO, numero: 'S-301', fecha: '2026-10-15', neto: 45000, concepto: 'Tóner' });
// Librería Central · Papel obra: el último punto SOLO supera por
// mediana (contra el anterior BAJA −7,69%; la mediana previa es 10.000).
papelRecibido(db, 1, { nombre: 'Librería Central', cuit: CUIT_CENTRAL, numero: 'C-401', fecha: '2026-07-01', neto: 10000, concepto: 'Papel obra' });
papelRecibido(db, 1, { nombre: 'Librería Central', cuit: CUIT_CENTRAL, numero: 'C-402', fecha: '2026-08-01', neto: 10000, concepto: 'Papel obra' });
papelRecibido(db, 1, { nombre: 'Librería Central', cuit: CUIT_CENTRAL, numero: 'C-403', fecha: '2026-09-01', neto: 13000, concepto: 'Papel obra' });
papelRecibido(db, 1, { nombre: 'Librería Central', cuit: CUIT_CENTRAL, numero: 'C-404', fecha: '2026-10-01', neto: 12000, concepto: 'Papel obra' });
// Logística Norte · Flete: el mismo concepto, más barato (comparación).
papelRecibido(db, 1, { nombre: 'Logística Norte', cuit: CUIT_NORTE, numero: 'N-501', fecha: '2026-10-20', neto: 16500, concepto: 'Flete' });

const esc1 = precios.escanearPrecios(db, 1, { hoy: HOY });
ok('escaneo: dos alertas nacen (el flete de Sur y el papel de Central)',
  esc1.creadas.length === 2, JSON.stringify(esc1.creadas.map((a) => a.concepto)));
const alertaFlete = esc1.creadas.find((a) => a.concepto === 'Flete' && a.familia === 'concepto-comprobante');
ok('la suba del 12% se detecta con el número exacto y su referencia (el anterior)',
  !!alertaFlete && alertaFlete.variacion_pct === 12 && alertaFlete.precio_referencia === 18000
  && alertaFlete.precio_nuevo === 20160 && alertaFlete.referencia_tipo === 'anterior',
  alertaFlete && JSON.stringify({ v: alertaFlete.variacion_pct, r: alertaFlete.precio_referencia, n: alertaFlete.precio_nuevo }));
ok('el texto de la alerta trae el número concreto y la serie',
  !!alertaFlete && alertaFlete.texto.includes('20.160,00') && alertaFlete.texto.includes('+12,0 %')
  && alertaFlete.texto.includes('18.000,00') && alertaFlete.texto.includes('Serie: 3 precios'),
  alertaFlete && alertaFlete.texto);
ok('la serie citada respalda la alerta: 3 puntos, cada uno con su comprobante real',
  !!alertaFlete && alertaFlete.serie_citada.length === 3
  && alertaFlete.serie_citada.every((p) => p.fuente === 'comprobante' && p.id > 0)
  && alertaFlete.detalle.nuevo.cita.includes('F-103'),
  alertaFlete && JSON.stringify(alertaFlete.serie_citada).slice(0, 200));
const alertaPapel = esc1.creadas.find((a) => a.concepto === 'Papel obra');
ok('la referencia doble manda: Papel obra alerta SOLO por la mediana (+20% con el anterior en baja)',
  !!alertaPapel && alertaPapel.referencia_tipo === 'mediana' && alertaPapel.precio_referencia === 10000
  && alertaPapel.variacion_pct === 20 && alertaPapel.detalle.pct_anterior < 0,
  alertaPapel && JSON.stringify({ t: alertaPapel.referencia_tipo, v: alertaPapel.variacion_pct, pa: alertaPapel.detalle.pct_anterior }));
ok('bajo el umbral no hay alerta: las resmas (+5%) quedan en silencio registrado',
  !esc1.creadas.some((a) => a.concepto === 'Resmas A4')
  && esc1.sin_alerta.some((s) => s.concepto === 'Resmas A4' && s.variacion_pct === 5),
  JSON.stringify(esc1.sin_alerta));
ok('serie de un solo precio: sin base, declarado, cero alerta (Tóner, Flete exprés y el flete de Norte)',
  esc1.sin_base.length === 3 && !esc1.creadas.some((a) => a.concepto === 'Tóner'),
  JSON.stringify(esc1.sin_base.map((s) => s.concepto)));
ok('el papel sin concepto no entra a ninguna serie y queda contado como excluido',
  esc1.excluidos.sin_concepto === 1, JSON.stringify(esc1.excluidos));
ok('el match dudoso NO une dos series: «flete» (3 puntos) y «flete exprés» (1) viven separadas',
  (() => {
    const { series } = precios.listSeries(db, 1, { proveedor: `cuit_${CUIT_SUR}` });
    const f = series.find((s) => s.concepto_clave === 'flete');
    const fe = series.find((s) => s.concepto_clave === 'flete expres');
    return !!f && !!fe && f.cantidad === 3 && fe.cantidad === 1;
  })());
ok('la relación dudosa se declara (contención), no se fusiona en silencio',
  esc1.relaciones_no_fusionadas.some((r) => r.contenida === 'flete' && r.contenedora === 'flete expres'),
  JSON.stringify(esc1.relaciones_no_fusionadas));

// ---------------------------------------------------------------------------
console.log('— la comparación entre proveedores');
const cmp = precios.compararProveedores(db, 1, { hoy: HOY });
ok('mismo concepto en dos proveedores dentro de la ventana: lado a lado con la diferencia',
  cmp.comparaciones.length === 1 && cmp.comparaciones[0].concepto_clave === 'flete'
  && cmp.comparaciones[0].precios.length === 2 && cmp.comparaciones[0].diferencia_pct === 22.18,
  JSON.stringify(cmp.comparaciones).slice(0, 240));
ok('la comparación dice quién es el más barato y quién el más caro, sin sugerir cambiar',
  cmp.comparaciones[0].mas_barato.campo === `cuit_${CUIT_NORTE}` && cmp.comparaciones[0].mas_caro.campo === `cuit_${CUIT_SUR}`
  && /no sugiere cambiar/.test(cmp.nota));

// ---------------------------------------------------------------------------
console.log('— la serie de las órdenes de compra (G-10)');
ordenCompra(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, descripcion: 'Caja de cartón corrugado', precio: 500, fecha: '2026-09-01' });
ordenCompra(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, descripcion: 'Caja de cartón corrugado', precio: 620, fecha: '2026-10-15' });
const esc2 = precios.escanearPrecios(db, 1, { hoy: HOY });
const alertaCaja = esc2.creadas.find((a) => a.familia === 'item-orden');
ok('el precio unitario de las órdenes arma su propia serie y alerta (+24%) citando la orden',
  esc2.creadas.length === 1 && !!alertaCaja && alertaCaja.variacion_pct === 24
  && alertaCaja.detalle.nuevo.cita.includes('orden de compra'),
  JSON.stringify(esc2.creadas.map((a) => [a.familia, a.variacion_pct])));
ok('las dos familias no se mezclan: abiertas = flete + papel + caja',
  abiertas(db, 1).length === 3, String(abiertas(db, 1).length));

console.log('— re-escanear no duplica');
const esc3 = precios.escanearPrecios(db, 1, { hoy: HOY });
ok('segundo escaneo sin cambios: cero creadas, cero evolucionadas, cero cerradas',
  esc3.creadas.length === 0 && esc3.actualizadas.length === 0 && esc3.cerradas_reversion.length === 0
  && precios.listAlertas(db, 1, {}).total === 3,
  JSON.stringify({ c: esc3.creadas.length, a: esc3.actualizadas.length }));

console.log('— la evolución: un salto nuevo sobre la misma serie');
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-106', fecha: '2026-11-01', neto: 23000, concepto: 'Flete' });
const esc4 = precios.escanearPrecios(db, 1, { hoy: HOY });
ok('la alerta abierta evoluciona: mismo id, números nuevos (manda la mediana: +27,78% sobre 18.000)',
  esc4.actualizadas.length === 1 && esc4.actualizadas[0].id === alertaFlete.id
  && esc4.actualizadas[0].precio_nuevo === 23000 && esc4.actualizadas[0].variacion_pct === 27.78
  && esc4.actualizadas[0].referencia_tipo === 'mediana' && esc4.actualizadas[0].detalle.pct_anterior === 14.09
  && abiertas(db, 1).length === 3,
  JSON.stringify(esc4.actualizadas.map((a) => [a.id, a.precio_nuevo, a.variacion_pct])));

console.log('— el cierre por reversión');
papelRecibido(db, 1, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-107', fecha: '2026-11-02', neto: 18500, concepto: 'Flete' });
const esc5 = precios.escanearPrecios(db, 1, { hoy: HOY });
const fleteTrasReversion = precios.getAlerta(db, 1, alertaFlete.id);
ok('cuando entra un precio que revierte el salto, la alerta se cierra con su motivo',
  esc5.cerradas_reversion.length === 1 && esc5.cerradas_reversion[0].id === alertaFlete.id
  && fleteTrasReversion.estado === 'cerrada-reversion' && fleteTrasReversion.motivo_cierre.length > 10,
  JSON.stringify({ c: esc5.cerradas_reversion.length, e: fleteTrasReversion.estado }));
ok('la baja queda registrada en la serie (última variación con signo negativo)',
  (() => {
    const s = precios.getSerie(db, 1, fleteTrasReversion.serie);
    return !!s && s.cantidad === 5 && s.ultimo_precio === 18500 && s.variacion_ultima_pct < 0;
  })());

console.log('— marcar vista: sale de abiertas y no vuelve a nacer');
const vista = precios.marcarVista(db, 1, alertaCaja.id);
ok('marcar vista sella la alerta con su momento',
  vista.estado === 'vista' && vista.vista_en.length > 0);
const esc6 = precios.escanearPrecios(db, 1, { hoy: HOY });
ok('el mismo salto ya surfaceado no se recrea tras marcarla vista',
  esc6.creadas.length === 0 && precios.listAlertas(db, 1, { estado: 'vista' }).total === 1
  && precios.listAlertas(db, 1, {}).total === 3,
  JSON.stringify({ c: esc6.creadas.length }));
ok('marcar vista dos veces es idempotente; sobre una cerrada por reversión se rechaza en voz alta',
  precios.marcarVista(db, 1, alertaCaja.id).estado === 'vista'
  && !!lanza(() => precios.marcarVista(db, 1, alertaFlete.id)));

console.log('— el resumen para La oficina');
const res = precios.resumenPrecios(db, 1, { hoy: HOY });
ok('resumen: abiertas 1 (papel), vistas 1, cerradas por reversión 1, con último escaneo real',
  res.alertas_abiertas === 1 && res.alertas_vistas === 1 && res.alertas_cerradas_reversion === 1
  && !!res.ultimo_escaneo && res.peores_abiertas.length === 1 && res.peores_abiertas[0].concepto === 'Papel obra',
  JSON.stringify({ a: res.alertas_abiertas, v: res.alertas_vistas, c: res.alertas_cerradas_reversion }));

console.log('— el umbral del fundamento manda');
const cfg2 = precios.setConfig(db, 1, { umbral_pct: 30 });
ok('el dueño sube el umbral a 30% y queda guardado con su procedencia',
  cfg2.umbral_pct === 30 && cfg2.es_default === false
  && !!lanza(() => precios.setConfig(db, 1, { umbral_pct: 0 })));
const esc7 = precios.escanearPrecios(db, 1, { hoy: HOY });
ok('con el umbral nuevo, la alerta del papel (+20% contra su mediana) se cierra por reversión',
  esc7.cerradas_reversion.some((a) => a.id === alertaPapel.id) && abiertas(db, 1).length === 0,
  JSON.stringify(esc7.cerradas_reversion.map((a) => a.id)));

console.log('— separación por cuenta');
papelRecibido(db, 2, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-201', fecha: '2026-10-01', neto: 10000, concepto: 'Flete' });
papelRecibido(db, 2, { nombre: 'Distribuidora Sur', cuit: CUIT_SUR, numero: 'F-202', fecha: '2026-10-20', neto: 15000, concepto: 'Flete' });
const escU2 = precios.escanearPrecios(db, 2, { hoy: HOY });
ok('la otra cuenta detecta su propia suba (+50%) y no ve las alertas ajenas',
  escU2.creadas.length === 1 && escU2.creadas[0].variacion_pct === 50
  && precios.listAlertas(db, 2, {}).total === 1 && precios.listAlertas(db, 1, {}).total === 3
  && precios.getAlerta(db, 1, escU2.creadas[0].id) === null,
  JSON.stringify({ u2: escU2.creadas.length }));

console.log('— la base del precio: sin neto, la serie usa el total (y no se mezcla)');
precios.setConfig(db, 1, { umbral_pct: 10 });
papelRecibido(db, 1, { nombre: 'Librería Central', cuit: CUIT_CENTRAL, numero: 'C-501', fecha: '2026-09-05', neto: null, total: 5000, concepto: 'Cinta de embalar' });
papelRecibido(db, 1, { nombre: 'Librería Central', cuit: CUIT_CENTRAL, numero: 'C-502', fecha: '2026-10-05', neto: null, total: 5900, concepto: 'Cinta de embalar' });
const escBase = precios.escanearPrecios(db, 1, { hoy: HOY });
ok('un papel sin neto arma su serie sobre el total (+18%) y la base queda declarada en la alerta',
  escBase.creadas.length === 1 && escBase.creadas[0].base_monto === 'total' && escBase.creadas[0].variacion_pct === 18,
  JSON.stringify(escBase.creadas.map((a) => [a.concepto, a.base_monto, a.variacion_pct])));

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido mínimo');
const PORT = 3982;
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g22-'));
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
  const reg = await call('POST', '/api/auth/register', { email: 'g22@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/precios/resumen', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/precios/resumen', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f.exec('PRAGMA busy_timeout = 5000');
  const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g22@example.com');
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'esencial');
  const esencial = await call('GET', '/api/gesty/precios/resumen', null, reg.cookie);
  ok('gating http: pack Esencial (sin la capacidad «proveedores») → 403',
    esencial.status === 403, String(esencial.status));
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'completa');
  f.close();
  const resumenHttp = await call('GET', '/api/gesty/precios/resumen', null, reg.cookie);
  ok('http: con pack Completa el resumen responde 200 y en cero',
    resumenHttp.status === 200 && resumenHttp.data.resumen.alertas_abiertas === 0,
    JSON.stringify(resumenHttp.data).slice(0, 200));
  const escHttp = await call('POST', '/api/gesty/precios/escanear', { hoy: HOY }, reg.cookie);
  ok('http: el escaneo sobre la cuenta vacía corre y no detecta nada',
    escHttp.status === 200 && escHttp.data.creadas.length === 0,
    JSON.stringify(escHttp.data).slice(0, 200));
  const seriesHttp = await call('GET', '/api/gesty/precios/series', null, reg.cookie);
  ok('http: la consulta de series responde con su forma',
    seriesHttp.status === 200 && Array.isArray(seriesHttp.data.series),
    JSON.stringify(seriesHttp.data).slice(0, 200));
  const cmpHttp = await call('GET', '/api/gesty/precios/comparacion', null, reg.cookie);
  ok('http: la comparación responde con su forma y su nota',
    cmpHttp.status === 200 && Array.isArray(cmpHttp.data.comparaciones) && /no sugiere cambiar/.test(cmpHttp.data.nota || ''),
    JSON.stringify(cmpHttp.data).slice(0, 200));
  const cfgHttp = await call('GET', '/api/gesty/precios/config', null, reg.cookie);
  ok('http: la config expone el umbral default declarado',
    cfgHttp.status === 200 && cfgHttp.data.config.umbral_pct === 10,
    JSON.stringify(cfgHttp.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
