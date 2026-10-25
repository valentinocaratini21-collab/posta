#!/usr/bin/env node
// test-gesty-facturacion.js — G-04 · FACTURACIÓN (preparar y
// controlar). Spec: gesty-cola-builds.md G-04, gesty-areas-detalle.md
// §2, gesty-g02-build-spec.md §4/§7, gesty-build-spec.md §4/§6.
// DECISIÓN DEL DUEÑO: emitir SIEMPRE con su OK; la excepción es un
// ajuste suyo (clientes habituales + tope, default OFF, registrada,
// reversible en un toque).
// Cubre: borrador desde cero / presupuesto / duplicado · totales e
// impuestos calculados en el SERVIDOR (los del cliente se ignoran) ·
// recorrido completo borrador→esperando-ok→lista→enviada→cobrada
// todo registrado · el intento de enviar o pasar a lista SIN OK lo
// rechaza el servidor · aprobación con versión vieja rechazada ·
// idempotencia de la aprobación · envío por email con su comprobante
// y su fallo sin fingir · WhatsApp manual asistido con comprobante ·
// cobro parcial y total · la excepción (default OFF; sin tope no se
// activa; califica / no califica por cliente y por tope; queda
// registrada; apagarla corta la calificación) · anulación con motivo
// vía su tarjeta · interfaz Emisor con el adaptador manual ·
// separación por cuenta · gating (401/403) en HTTP.
// Uso: node test-gesty-facturacion.js
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
async function lanzaAsync(fn) { try { await fn(); return null; } catch (e) { return e; } }

const gesty = require('./gesty.js');
const fact = require('./gesty-facturacion.js');

const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';   // Panadería La Espiga (habitual)
const CUIT_NUEVO = '20333333334';     // cliente que NO está en el fundamento

// Canal de email falso inyectado (el patrón de la casa): registra lo
// que «sale» y puede fallar a pedido, como el proveedor real.
const emailsEnviados = [];
let emailFalla = false;
fact.configure({
  sendEmail: async (o) => {
    if (emailFalla) return { ok: false, skipped: true };
    emailsEnviados.push(o);
    return { ok: true, id: 'resend-test-1' };
  },
});

function dbConPack(pack) {
  const db = nuevaDb();
  gesty.setPack(db, 1, pack, { origen: 'checkout', actor: 'sistema' });
  return db;
}
function sembrarFundamento(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_CLIENTE}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_CLIENTE, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com', concepto_habitual: 'Instalación y service' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}
const eventosDe = (db, uid, facturaId) => gesty.listEvents(db, uid, { entidad_tipo: 'factura', entidad_id: String(facturaId) });
const tiposDe = (db, uid, facturaId) => eventosDe(db, uid, facturaId).map((e) => e.tipo_evento);

(async () => {

// ---------------- Unidad: creación y totales del servidor ----------------
console.log('— unidad: borradores y totales calculados en el servidor');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  ok('gating: el pack esencial incluye facturacion', gesty.hasCapacidad(db, 1, 'facturacion'));

  const b = fact.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_CLIENTE },
    items: [{ descripcion: 'Instalación de cámara — seña 50%', cantidad: 1, precio_unitario: 764463, alicuota_iva: 21 }],
    fecha: '2026-10-24', vencimiento: '2026-11-07',
    total: 1, subtotal_neto: 1, total_impuestos: 1, // basura del cliente: se ignora
  });
  ok('borrador: nace en estado borrador con su numeración interna', b.estado === 'borrador' && b.numero === 'B-0001', b.numero);
  ok('totales: el servidor calcula neto e IVA (los del cliente se ignoran)',
    b.subtotal_neto === 764463 && b.total_impuestos === 160537.23 && b.total === 925000.23,
    `${b.subtotal_neto}/${b.total_impuestos}/${b.total}`);
  ok('borrador: el cliente sale del fundamento (snapshot con email y condición)',
    b.cliente.nombre === 'Panadería La Espiga' && b.cliente.email === 'laespiga@example.com' && b.cliente.condicion_iva === 'Responsable inscripto');
  ok('borrador: queda el evento factura-creada', tiposDe(db, 1, b.id).includes('factura-creada'));

  const multi = fact.calcularTotales([
    { descripcion: 'A', cantidad: 2, precio_unitario: 1000, alicuota_iva: 21 },
    { descripcion: 'B', cantidad: 1, precio_unitario: 500, alicuota_iva: 10.5 },
    { descripcion: 'C', cantidad: 3, precio_unitario: 100, alicuota_iva: 0 },
  ], [{ concepto: 'Percepción IIBB', monto: 50 }]);
  ok('totales: multi-ítem con dos alícuotas + otro impuesto',
    multi.subtotal_neto === 2800 && multi.impuestos.length === 2 && multi.total === 2800 + 420 + 52.5 + 50,
    JSON.stringify(multi.impuestos));
  ok('totales: ítem sin descripción o sin ítems se rechaza',
    !!lanza(() => fact.calcularTotales([{ cantidad: 1, precio_unitario: 10 }])) && !!lanza(() => fact.calcularTotales([])));
  ok('crear: sin cliente identificable se rechaza (Gesty no inventa clientes)',
    !!lanza(() => fact.crearBorrador(db, 1, { cliente: {}, items: [{ descripcion: 'X', cantidad: 1, precio_unitario: 10 }] })));

  const ed = fact.editarBorrador(db, 1, b.id, { items: [{ descripcion: 'Service mensual', cantidad: 2, precio_unitario: 30000, alicuota_iva: 21 }] });
  ok('editar borrador: recalcula en el servidor y registra el evento',
    ed.total === 72600 && tiposDe(db, 1, b.id).includes('factura-editada'), String(ed.total));

  const desdePres = fact.crearDesdePresupuesto(db, 1, {
    presupuesto_ref: 'PRES-77', cliente: { cuit: CUIT_CLIENTE },
    items: [{ descripcion: 'Trabajo del presupuesto', cantidad: 1, precio_unitario: 100000, alicuota_iva: 21 }],
  });
  ok('desde presupuesto: acople por referencia, origen registrado',
    desdePres.origen.tipo === 'presupuesto' && desdePres.origen.ref === 'PRES-77');
  ok('desde presupuesto: sin referencia se rechaza',
    !!lanza(() => fact.crearDesdePresupuesto(db, 1, { cliente: { cuit: CUIT_CLIENTE }, items: [{ descripcion: 'X', cantidad: 1, precio_unitario: 1 }] })));
  const dup = fact.duplicarFactura(db, 1, desdePres.id);
  ok('duplicar: borrador nuevo con los mismos ítems y su origen',
    dup.id !== desdePres.id && dup.estado === 'borrador' && dup.total === desdePres.total && dup.origen.tipo === 'duplicado');
  db.close();
}

// ---------------- Unidad: el recorrido completo y la matriz ----------------
console.log('— unidad: borrador→OK→lista→enviada→cobrada, todo registrado');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  const f = fact.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_CLIENTE },
    items: [{ descripcion: 'Instalación de cámara frigorífica — seña 50%', cantidad: 1, precio_unitario: 764463, alicuota_iva: 21 }],
    fecha: '2026-10-24', vencimiento: '2026-11-07',
  });

  ok('sin OK: enviar un borrador lo rechaza el servidor',
    !!(await lanzaAsync(() => fact.enviarFactura(db, 1, f.id, { canal: 'email' }))));
  ok('sin OK: la transición a lista sin la tarjeta de la matriz se rechaza',
    !!lanza(() => fact.transicionLista(db, 1, f, null)) &&
    !!lanza(() => fact.transicionLista(db, 1, f, { tipo: 'factura-emision', detalle: { factura_id: f.id }, id: 999 })));

  const p = fact.pedirOK(db, 1, f.id);
  ok('pedir OK: nace la tarjeta factura-emision con el documento completo',
    p.tarjeta.tipo === 'factura-emision' && p.tarjeta.detalle.documento.total === f.total && p.tarjeta.detalle.documento.items.length === 1);
  ok('pedir OK: la factura queda esperando-ok y enlazada a su tarjeta',
    p.factura.estado === 'esperando-ok' && p.factura.tarjeta_id === p.tarjeta.id);
  ok('pedir OK dos veces se rechaza (ya tiene su tarjeta)',
    !!lanza(() => fact.pedirOK(db, 1, f.id)));
  ok('sin OK todavía: enviar sigue rechazado aunque la tarjeta exista',
    !!(await lanzaAsync(() => fact.enviarFactura(db, 1, f.id, { canal: 'email' }))));

  const rVieja = gesty.approveCard(db, 1, p.tarjeta.id, { version_documento: 99, usuario: 'dueno' });
  ok('matriz: aprobar con versión vieja se rechaza y la factura NO pasa a lista',
    rVieja.ok === false && rVieja.motivo === 'version-vieja' && fact.getFactura(db, 1, f.id).estado === 'esperando-ok');

  const ap = gesty.approveCard(db, 1, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  const fLista = fact.getFactura(db, 1, f.id);
  ok('OK del dueño: la factura pasa a lista-para-emitir', ap.ok === true && fLista.estado === 'lista-para-emitir', JSON.stringify(ap).slice(0, 160));
  ok('lista: la emisión manual queda registrada SIN fingir número ni CAE (modo respaldo)',
    fLista.emision.emisor === 'manual' && fLista.emision.numero === null && fLista.emision.codigo_autorizacion === null && fLista.emision.pendiente_en_facturador === true,
    JSON.stringify(fLista.emision));
  const ap2 = gesty.approveCard(db, 1, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  ok('idempotencia: el doble toque no re-ejecuta (una sola factura-lista en el registro)',
    ap2.ok === true && ap2.idempotente === true && tiposDe(db, 1, f.id).filter((t) => t === 'factura-lista-para-emitir').length === 1);

  emailFalla = true;
  const errEnvio = await lanzaAsync(() => fact.enviarFactura(db, 1, f.id, { canal: 'email' }));
  ok('envío: si el canal de email falla, NO se finge — la factura sigue lista y el fallo queda registrado',
    !!errEnvio && fact.getFactura(db, 1, f.id).estado === 'lista-para-emitir' && tiposDe(db, 1, f.id).includes('factura-envio-fallido'));
  emailFalla = false;
  const env = await fact.enviarFactura(db, 1, f.id, { canal: 'email' });
  ok('envío por email: sale por el canal de la app y queda enviada con su comprobante',
    env.factura.estado === 'enviada' && env.envio.comprobante === 'resend-test-1' && env.envio.destinatario === 'laespiga@example.com' && emailsEnviados.length === 1,
    JSON.stringify(env.envio));

  const cobroParcial = fact.registrarCobro(db, 1, f.id, { monto: 400000, medio: 'transferencia', comprobante: 'TRF-001' });
  ok('cobro parcial: se registra, la factura sigue enviada y el saldo es el real',
    cobroParcial.factura.estado === 'enviada' && cobroParcial.saldo === 525000.23 && cobroParcial.factura.cobro_estado === 'parcial',
    String(cobroParcial.saldo));
  ok('cobro: superar el saldo se rechaza',
    !!lanza(() => fact.registrarCobro(db, 1, f.id, { monto: 999999 })));
  const cobroTotal = fact.registrarCobro(db, 1, f.id, { medio: 'transferencia', comprobante: 'TRF-002' });
  ok('cobro total: la factura pasa a cobrada sola, con el pago que la respalda',
    cobroTotal.factura.estado === 'cobrada' && cobroTotal.saldo === 0 && cobroTotal.factura.pagos.length === 2);
  const tipos = tiposDe(db, 1, f.id);
  ok('registro: el recorrido entero está en el registro durable',
    ['factura-creada', 'factura-esperando-ok', 'factura-lista-para-emitir', 'factura-enviada', 'factura-cobro-registrado', 'factura-cobrada'].every((t) => tipos.includes(t)),
    tipos.join(','));
  const resumen = fact.resumenFacturas(db, 1);
  ok('consulta G-05: el resumen cuenta por estado y suma cobrado',
    resumen.por_estado.cobrada === 1 && resumen.cobrado === 925000.23, JSON.stringify(resumen));
  ok('editar una factura que ya salió de borrador se rechaza',
    !!lanza(() => fact.editarBorrador(db, 1, f.id, { concepto: 'tarde' })));

  // WhatsApp manual asistido: sin comprobante no hay envío.
  const f2 = fact.crearBorrador(db, 1, {
    cliente: { nombre: 'Cliente Mostrador', cuit: CUIT_NUEVO, email: 'mostrador@example.com' },
    items: [{ descripcion: 'Reparación', cantidad: 1, precio_unitario: 50000, alicuota_iva: 21 }],
    fecha: '2026-10-20', vencimiento: '2026-10-21', // ya vencida: para la consulta de vencidas
  });
  const p2 = fact.pedirOK(db, 1, f2.id);
  gesty.approveCard(db, 1, p2.tarjeta.id, { version_documento: p2.tarjeta.version_documento, usuario: 'dueno' });
  ok('whatsapp manual: sin comprobante el registro del envío se rechaza',
    !!(await lanzaAsync(() => fact.enviarFactura(db, 1, f2.id, { canal: 'whatsapp-manual' }))));
  const env2 = await fact.enviarFactura(db, 1, f2.id, { canal: 'whatsapp-manual', comprobante: 'captura-wa-2026-10-24', destinatario: 'Cliente Mostrador' });
  ok('whatsapp manual: con su comprobante queda enviada y registrada',
    env2.factura.estado === 'enviada' && env2.envio.comprobante === 'captura-wa-2026-10-24');
  const vencidas = fact.listFacturas(db, 1, { vencidas: true });
  ok('consulta G-05: las vencidas a cobrar se listan por estado y vencimiento',
    vencidas.total === 1 && vencidas.facturas[0].id === f2.id, JSON.stringify(vencidas.total));

  // Anulación con motivo, vía su tarjeta de la matriz.
  ok('anulación: sin motivo se rechaza', !!lanza(() => fact.solicitarAnulacion(db, 1, f2.id, {})));
  const an = fact.solicitarAnulacion(db, 1, f2.id, { motivo: 'El cliente canceló la reparación' });
  const apAn = gesty.approveCard(db, 1, an.tarjeta.id, { version_documento: an.tarjeta.version_documento, usuario: 'dueno' });
  const f2An = fact.getFactura(db, 1, f2.id);
  ok('anulación: con el OK queda anulada, con el motivo en su registro',
    apAn.ok === true && f2An.estado === 'anulada' && f2An.motivo_anulacion === 'El cliente canceló la reparación' && tiposDe(db, 1, f2.id).includes('factura-anulada'));

  // El documento armado del modo respaldo.
  const doc = fact.documentoFactura(db, 1, f.id);
  ok('documento: el armado trae cliente, ítems y total, rotulado como NO fiscal',
    doc.includes('Panadería La Espiga') && doc.includes('925.000,23') && doc.includes('No es un comprobante fiscal válido'));
  db.close();
}

// ---------------- Unidad: la excepción de emisión automática ----------------
console.log('— unidad: la excepción del dueño (G-02 §7)');
{
  const db = dbConPack('completa');
  sembrarFundamento(db, 1);
  const mkFactura = (cliente, precio) => fact.crearBorrador(db, 1, {
    cliente, items: [{ descripcion: 'Service', cantidad: 1, precio_unitario: precio, alicuota_iva: 21 }], fecha: '2026-10-24',
  });

  const ajuste0 = fact.getAjusteExcepcion(db, 1);
  ok('excepción: nace APAGADA por default', ajuste0.activa === false);
  const fHab = mkFactura({ cuit: CUIT_CLIENTE }, 100000); // total 121.000
  const ev0 = fact.evaluarExcepcion(db, 1, fHab);
  ok('excepción apagada: ni el cliente habitual califica', ev0.califica === false && ev0.motivos.includes('excepcion-apagada'));
  ok('excepción: activarla sin monto tope es imposible',
    !!lanza(() => fact.setAjusteExcepcion(db, 1, { activa: true })) &&
    !!lanza(() => fact.setAjusteExcepcion(db, 1, { activa: true, monto_tope: 0 })));

  const ajuste1 = fact.setAjusteExcepcion(db, 1, { activa: true, monto_tope: 200000 });
  ok('excepción: el dueño la activa con su tope y queda registrada',
    ajuste1.activa === true && ajuste1.monto_tope === 200000 &&
    gesty.listEvents(db, 1, {}).some((e) => e.tipo_evento === 'excepcion-activada'));
  const evHab = fact.evaluarExcepcion(db, 1, fHab);
  ok('excepción: cliente habitual bajo el tope CALIFICA', evHab.califica === true && evHab.cliente_habitual === true, JSON.stringify(evHab.motivos));
  const fNuevo = mkFactura({ nombre: 'Cliente Nuevo', cuit: CUIT_NUEVO }, 50000);
  const evNuevo = fact.evaluarExcepcion(db, 1, fNuevo);
  ok('excepción: cliente NO habitual no califica (va a la bandeja)',
    evNuevo.califica === false && evNuevo.motivos.includes('cliente-no-habitual'));
  const fGrande = mkFactura({ cuit: CUIT_CLIENTE }, 500000); // total 605.000 > tope
  const evGrande = fact.evaluarExcepcion(db, 1, fGrande);
  ok('excepción: sobre el tope no califica aunque el cliente sea habitual',
    evGrande.califica === false && evGrande.motivos.includes('supera-tope'));

  const p = fact.pedirOK(db, 1, fHab.id);
  const fMarcada = fact.getFactura(db, 1, fHab.id);
  ok('excepción: el borrador calificado queda marcado y con su evento — y SIGUE el flujo normal con tarjeta',
    fMarcada.excepcion_aplicable === true && p.tarjeta.tipo === 'factura-emision' && tiposDe(db, 1, fHab.id).includes('factura-excepcion-aplicable'));

  fact.setAjusteExcepcion(db, 1, { activa: false });
  const evOff = fact.evaluarExcepcion(db, 1, mkFactura({ cuit: CUIT_CLIENTE }, 10000));
  ok('excepción: apagarla corta la siguiente calificación (queda para OK)',
    evOff.califica === false && evOff.motivos.includes('excepcion-apagada') &&
    gesty.listEvents(db, 1, {}).some((e) => e.tipo_evento === 'excepcion-desactivada'));
  db.close();
}

// ---------------- Unidad: interfaz Emisor y separación por cuenta ----------------
console.log('— unidad: interfaz Emisor (build-spec §6) y separación por cuenta');
{
  const db = dbConPack('total');
  sembrarFundamento(db, 1);
  ok('emisor: el adaptador manual está registrado y es el activo por default',
    fact.listEmisores().includes('manual') && fact.emisorActivo(db, 1).nombre === 'manual' && fact.emisorActivo(db, 1).impl.estado().conectado === false);
  ok('emisor: un adaptador incompleto se rechaza (la interfaz es emitir/anular/estado)',
    !!lanza(() => fact.registerEmisor('roto', { emitir: () => ({}) })));
  const em = fact.emisorManual.emitir({ numero: 'B-0001', total: 10 });
  ok('emisor manual: emitir NO inventa número ni CAE (quedan null, pendiente en el facturador)',
    em.numero === null && em.codigo_autorizacion === null && em.pendiente_en_facturador === true);

  gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
  const f = fact.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_CLIENTE }, items: [{ descripcion: 'X', cantidad: 1, precio_unitario: 1000 }], fecha: '2026-10-24',
  });
  ok('cuentas: la factura ajena no se lee, no se pide OK ni se envía desde otra cuenta',
    fact.getFactura(db, 2, f.id) === null &&
    !!lanza(() => fact.pedirOK(db, 2, f.id)) &&
    fact.listFacturas(db, 2, {}).total === 0);
}

// ---------------- Wiring estático ----------------
console.log('— wiring: rutas montadas y sin atajos');
{
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const modSrc = fs.readFileSync(path.join(__dirname, 'gesty-facturacion.js'), 'utf8');
  ok('wiring: las rutas /api/gesty/facturas* están montadas con gating + capacidad',
    serverSrc.includes("app.post('/api/gesty/facturas'") && serverSrc.includes("gesty.capacidadMiddleware(db, 'facturacion')"));
  ok('wiring: NO existe ruta directa a lista-para-emitir ni de envío sin estado',
    !serverSrc.includes('/api/gesty/facturas/:id/lista') && !modSrc.includes("app.post"));
  ok('wiring: los ejecutores de la matriz están registrados en el módulo',
    modSrc.includes("registerExecutor('factura-emision'") && modSrc.includes("registerExecutor('factura-anulacion'"));
  ok('wiring: BUILD_ID presente con la convención vigente (el módulo no lo gestiona)', /const BUILD_ID = '[0-9]{8}-v[0-9]+';/.test(serverSrc));
}

// ---------------- HTTP: flujo completo ----------------
const PORT = 3998;
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g04-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g04@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/facturas', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/facturas', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g04@example.com');
  dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'admin-familia')").run(u.id);
  dbFile.close();

  const creada = await call('POST', '/api/gesty/facturas', {
    cliente: { nombre: 'Cliente Web', cuit: '20222222229', email: 'web@example.com' },
    items: [{ descripcion: 'Trabajo web', cantidad: 1, precio_unitario: 100000, alicuota_iva: 21 }],
    fecha: '2026-10-24', vencimiento: '2026-11-07', total: 5,
  }, reg.cookie);
  ok('http: crear borrador → 200 con los totales del SERVIDOR',
    creada.status === 200 && creada.data.factura.total === 121000 && creada.data.factura.estado === 'borrador',
    JSON.stringify(creada.data).slice(0, 200));
  const fId = creada.data.factura.id;

  const envioTemprano = await call('POST', `/api/gesty/facturas/${fId}/enviar`, { canal: 'whatsapp-manual', comprobante: 'x' }, reg.cookie);
  ok('http: enviar sin OK → 400 (el servidor lo rechaza)', envioTemprano.status === 400, String(envioTemprano.status));

  const pedida = await call('POST', `/api/gesty/facturas/${fId}/pedir-ok`, {}, reg.cookie);
  ok('http: pedir-ok crea la tarjeta de emisión', pedida.status === 200 && pedida.data.tarjeta && pedida.data.tarjeta.tipo === 'factura-emision', JSON.stringify(pedida.data).slice(0, 200));
  const aprob = await call('POST', `/api/gesty/bandeja/${pedida.data.tarjeta.id}/aprobar`, { version_documento: pedida.data.tarjeta.version_documento }, reg.cookie);
  ok('http: aprobar la tarjeta → 200', aprob.status === 200 && aprob.data.ok === true, JSON.stringify(aprob.data).slice(0, 160));
  const enLista = await call('GET', `/api/gesty/facturas/${fId}`, null, reg.cookie);
  ok('http: tras el OK la factura está lista-para-emitir con su historial',
    enLista.status === 200 && enLista.data.factura.estado === 'lista-para-emitir' && enLista.data.historial.some((e) => e.tipo_evento === 'factura-lista-para-emitir'));

  const envioMail = await call('POST', `/api/gesty/facturas/${fId}/enviar`, { canal: 'email' }, reg.cookie);
  ok('http: el email sin canal configurado NO se finge (400) y la factura sigue lista',
    envioMail.status === 400 && (await call('GET', `/api/gesty/facturas/${fId}`, null, reg.cookie)).data.factura.estado === 'lista-para-emitir',
    String(envioMail.status));
  const envioWa = await call('POST', `/api/gesty/facturas/${fId}/enviar`, { canal: 'whatsapp-manual', comprobante: 'captura-wa-http' }, reg.cookie);
  ok('http: envío manual asistido con comprobante → enviada', envioWa.status === 200 && envioWa.data.factura.estado === 'enviada', JSON.stringify(envioWa.data).slice(0, 160));
  const cobro = await call('POST', `/api/gesty/facturas/${fId}/registrar-cobro`, { medio: 'transferencia', comprobante: 'TRF-HTTP' }, reg.cookie);
  ok('http: registrar el cobro → cobrada', cobro.status === 200 && cobro.data.factura.estado === 'cobrada', JSON.stringify(cobro.data).slice(0, 160));

  const exc = await call('GET', '/api/gesty/facturas/excepcion', null, reg.cookie);
  ok('http: la excepción se lee apagada por default', exc.status === 200 && exc.data.excepcion.activa === false);

  const regB = await call('POST', '/api/auth/register', { email: 'g04-otra@example.com', password: 'secreto2' });
  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  const uB = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('g04-otra@example.com');
  dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'total', 'checkout')").run(uB.id);
  dbFile2.close();
  const listaB = await call('GET', '/api/gesty/facturas', null, regB.cookie);
  ok('http: otra cuenta con pack ve SUS facturas (vacío), nunca las ajenas', listaB.status === 200 && listaB.data.total === 0);
  const detalleB = await call('GET', `/api/gesty/facturas/${fId}`, null, regB.cookie);
  ok('http: el detalle ajeno → 400', detalleB.status === 400, String(detalleB.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
