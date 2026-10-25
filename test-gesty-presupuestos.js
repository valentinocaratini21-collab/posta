#!/usr/bin/env node
// test-gesty-presupuestos.js — G-08 · PRESUPUESTOS. Spec:
// gesty-cola-builds.md G-08, gesty-areas-detalle.md §1,
// gesty-sistema-operativo.md §2.1/§5, gesty-build-spec.md §3/§12.3.
// FRONTERA: el presupuesto es el DOCUMENTO y su envío; el
// recordatorio de Gesty es un aviso administrativo (venció / sin
// respuesta) — el seguimiento comercial es de Venty.
// Cubre: intake asistido con precios del fundamento (lista) o del
// último similar, CADA precio con su fuente citada · totales del
// SERVIDOR (los del cliente se ignoran) · lo que falta = UNA
// pregunta (precios / cliente) y la respuesta queda guardada para
// siempre (entra a la lista de precios) · seña SOLO si la política
// la define (ausente sin política) · pedido → OK → enviado con
// recordatorio programado · cero envíos sin OK (sobre el log) ·
// al vencer sin respuesta PREPARA la tarjeta de recordatorio y NO
// la envía · aceptado → borrador de factura por el acople
// origen_ref de G-04 · separación por cuenta · gating (401/403 y
// capacidad) en HTTP.
// Uso: node test-gesty-presupuestos.js
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
const pres = require('./gesty-presupuestos.js');
const fact = require('./gesty-facturacion.js');

const CUIT_PROPIO = '20123456786';
const CUIT_ESPIGA = '27234567891';   // Panadería La Espiga (habitual)
const CUIT_TORO = '20333333334';     // cliente nuevo

// Canal de email falso inyectado (el patrón de la casa).
const emailsEnviados = [];
let emailFalla = false;
pres.configure({
  sendEmail: async (o) => {
    if (emailFalla) return { ok: false, skipped: true };
    emailsEnviados.push(o);
    return { ok: true, id: 'resend-test-pres' };
  },
});

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
function sembrarPolitica(db, uid) {
  pres.setPolitica(db, uid, {
    validez_dias: 10,
    sena: { porcentaje: 50, contra: 'se acredita contra el total del trabajo' },
    seguimiento_dias: 4,
    canal: 'email',
    lista_precios: [
      { descripcion: 'Cámara frigorífica — instalación completa', precio_unitario: 1850000, alicuota_iva: 21 },
      { descripcion: 'Service de aire', precio_unitario: 90000, alicuota_iva: 21 },
    ],
  });
}
const eventosDe = (db, uid, presId) => gesty.listEvents(db, uid, { entidad_tipo: 'presupuesto', entidad_id: String(presId) });
const tiposDe = (db, uid, presId) => eventosDe(db, uid, presId).map((e) => e.tipo_evento);

(async () => {

// ---------------- Unidad: intake y precios con fuente ----------------
console.log('— unidad: intake asistido, precios con fuente, totales del servidor');
const db = dbConPack('completa');
sembrarBase(db, 1);
sembrarPolitica(db, 1);
let p1;
{
  p1 = pres.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    pedido_texto: 'Necesito una cámara frigorífica instalada',
    items: [{ descripcion: 'Cámara frigorífica — instalación completa', cantidad: 1 }],
    total: 5, // trampa: los totales del cliente se ignoran
    creado_por: 'dueno',
  });
  const item = p1.items[0];
  ok('intake: el precio sale de la lista del fundamento y CITA su fuente',
    item.precio_unitario === 1850000 && item.fuente && item.fuente.tipo === 'lista-precios' && /lista de precios/.test(item.fuente.texto),
    JSON.stringify(item).slice(0, 200));
  ok('totales calculados en el SERVIDOR (la trampa del cliente se ignora)',
    p1.subtotal_neto === 1850000 && p1.total === 2238500 && p1.cotizado === true,
    `total=${p1.total}`);
  ok('sin pregunta: cliente y precios resueltos', p1.pregunta === null);
  ok('la seña de la política queda en el presupuesto, con su monto',
    p1.sena && p1.sena.porcentaje === 50 && p1.sena.monto === 1119250 && /se acredita/.test(p1.sena.contra),
    JSON.stringify(p1.sena));
  ok('nace borrador P-0001 con la validez de la política',
    p1.estado === 'borrador' && p1.numero === 'P-0001' && p1.validez_dias === 10);

  const pPrecioPedido = pres.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: 'Visita de diagnóstico', cantidad: 1, precio_unitario: 30000 }],
  });
  ok('precio cargado en el pedido: fuente «pedido» citada',
    pPrecioPedido.items[0].fuente.tipo === 'pedido' && pPrecioPedido.items[0].precio_unitario === 30000);
}

// ---------------- Unidad: último presupuesto similar ----------------
console.log('— unidad: el último similar (mismo cliente manda; si no, mismo concepto)');
{
  // Presupuesto YA cotizado con un concepto que NO está en la lista.
  const previo = pres.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: 'Instalación de equipo split', cantidad: 1, precio_unitario: 80000 }],
  });
  pres.pedirOK(db, 1, previo.id, {});
  const tj = gesty.getCard(db, 1, pres.getPresupuesto(db, 1, previo.id).tarjeta_id);
  gesty.approveCard(db, 1, tj.id, { version_documento: tj.version_documento });
  await pres.enviarPresupuesto(db, 1, previo.id, { hoy: '2026-10-20' });

  const mismoCliente = pres.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: 'Instalación de equipo split', cantidad: 2 }],
  });
  ok('último similar al MISMO cliente: precio y fuente citados',
    mismoCliente.items[0].precio_unitario === 80000 && mismoCliente.items[0].fuente.tipo === 'ultimo-presupuesto'
      && mismoCliente.items[0].fuente.presupuesto_id === previo.id && mismoCliente.items[0].fuente.mismo_cliente === true,
    JSON.stringify(mismoCliente.items[0].fuente || {}));
  const otroCliente = pres.crearBorrador(db, 1, {
    cliente: { nombre: 'Carnicería El Toro', cuit: CUIT_TORO, email: 'eltoro@example.com' },
    items: [{ descripcion: 'Instalación de equipo split', cantidad: 1 }],
  });
  ok('último similar por CONCEPTO (otro cliente): precio citado, mismo_cliente=false',
    otroCliente.items[0].precio_unitario === 80000 && otroCliente.items[0].fuente.tipo === 'ultimo-presupuesto'
      && otroCliente.items[0].fuente.mismo_cliente === false,
    JSON.stringify(otroCliente.items[0].fuente || {}));
}

// ---------------- Unidad: LA pregunta (precios y cliente) ----------------
console.log('— unidad: lo que falta es UNA pregunta; la respuesta queda guardada');
{
  const pSinPrecio = pres.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: 'Repuesto especial X', cantidad: 1 }],
  });
  ok('sin fuente de precio: total null (no se disfraza de cotizado) y pregunta de precios',
    pSinPrecio.total === null && pSinPrecio.cotizado === false
      && pSinPrecio.pregunta && pSinPrecio.pregunta.campo === 'precios'
      && pSinPrecio.pregunta.items.includes('Repuesto especial X'),
    JSON.stringify(pSinPrecio.pregunta || {}));
  ok('pedir OK con la pregunta abierta lo rechaza el servidor',
    !!lanza(() => pres.pedirOK(db, 1, pSinPrecio.id, {})));
  ok('la pregunta quedó registrada en el log durable',
    tiposDe(db, 1, pSinPrecio.id).includes('presupuesto-pregunta-hecha'));

  const respondido = pres.responderPregunta(db, 1, pSinPrecio.id, {
    precios: [{ descripcion: 'Repuesto especial X', precio_unitario: 45000 }],
  });
  ok('respondida: el precio entra con fuente pregunta-unica y el total se calcula',
    respondido.pregunta === null && respondido.total === 54450
      && respondido.items[0].fuente.tipo === 'pregunta-unica');
  const lista = pres.getPolitica(db, 1).lista_precios;
  ok('la respuesta quedó guardada PARA SIEMPRE en la lista de precios',
    lista.some((e) => e.descripcion === 'Repuesto especial X' && e.precio_unitario === 45000));
  const otro = pres.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: 'Repuesto especial X', cantidad: 1 }],
  });
  ok('el próximo presupuesto con ese concepto ya sale de la lista (no se repregunta)',
    otro.items[0].fuente.tipo === 'lista-precios' && otro.pregunta === null);

  const pSinCliente = pres.crearBorrador(db, 1, {
    pedido_texto: 'Me pidieron un service pero no sé quién',
    items: [{ descripcion: 'Service de aire', cantidad: 1 }],
  });
  ok('sin cliente: la pregunta es el cliente (una sola)',
    pSinCliente.pregunta && pSinCliente.pregunta.campo === 'cliente');
  const conCliente = pres.responderPregunta(db, 1, pSinCliente.id, {
    cliente: { nombre: 'Kiosco Luna', cuit: '20444444447' },
  });
  ok('respondida la del cliente: el borrador queda completo',
    conCliente.pregunta === null && conCliente.cliente.nombre === 'Kiosco Luna' && conCliente.cotizado === true);
}

// ---------------- Unidad: seña — solo si la política la define ----------------
console.log('— unidad: la seña aparece SOLO con política (regla de verdad)');
{
  const docCon = pres.documentoPresupuesto(db, 1, p1.id);
  ok('con política de seña: el documento la muestra', /Seña: 50%/.test(docCon));
  const db2 = dbConPack('completa');
  sembrarBase(db2, 1);
  const pol2 = pres.getPolitica(db2, 1);
  ok('sin política: validez default declarada y seña null',
    pol2.validez_dias === pres.VALIDEZ_DEFAULT_DIAS && pol2.origen_validez === 'default' && pol2.sena === null);
  const pSinSena = pres.crearBorrador(db2, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: 'Trabajo puntual', cantidad: 1, precio_unitario: 10000 }],
  });
  const docSin = pres.documentoPresupuesto(db2, 1, pSinSena.id);
  ok('sin política de seña: el documento NO la menciona y el presupuesto no la trae',
    !/Seña/.test(docSin) && pSinSena.sena === null);
}

// ---------------- Unidad: flujo OK → enviado, cero envíos sin OK ----------------
console.log('— unidad: el recorrido del OK y el sello; sin OK no sale nada');
{
  const emailsAntesFlujo = emailsEnviados.length;
  const errSinOk = await lanzaAsync(() => pres.enviarPresupuesto(db, 1, p1.id, {}));
  ok('enviar un borrador sin OK: el servidor lo rechaza', !!errSinOk);
  ok('y no salió ningún email ni quedó evento de envío',
    emailsEnviados.length === emailsAntesFlujo && !tiposDe(db, 1, p1.id).includes('presupuesto-enviado'));

  const { tarjeta } = pres.pedirOK(db, 1, p1.id, {});
  ok('pedir OK crea la tarjeta «presupuesto» con el DOCUMENTO completo congelado',
    tarjeta.tipo === 'presupuesto' && tarjeta.detalle.accion === 'envio'
      && tarjeta.detalle.documento.total === 2238500 && tarjeta.detalle.documento.sena.porcentaje === 50);
  const malVersion = gesty.approveCard(db, 1, tarjeta.id, { version_documento: 99 });
  ok('aprobar con versión vieja: rechazado y SIN sello',
    malVersion.ok === false && pres.getPresupuesto(db, 1, p1.id).envios.length === 0);
  const buena = gesty.approveCard(db, 1, tarjeta.id, { version_documento: tarjeta.version_documento });
  ok('aprobar la vigente: el ejecutor SELLA el envío (todavía no salió)',
    buena.ok === true && pres.getPresupuesto(db, 1, p1.id).envios.some((e) => e.estado === 'aprobado')
      && pres.getPresupuesto(db, 1, p1.id).estado === 'esperando-ok' && emailsEnviados.length === emailsAntesFlujo);

  const enviado = await pres.enviarPresupuesto(db, 1, p1.id, { hoy: '2026-10-24' });
  ok('despachado tras el OK: enviado, con vigencia y recordatorio PROGRAMADOS',
    enviado.presupuesto.estado === 'enviado' && enviado.presupuesto.vigencia.hasta === '2026-11-03'
      && enviado.presupuesto.recordatorio_en === '2026-10-28' && emailsEnviados.length === emailsAntesFlujo + 1,
    JSON.stringify(enviado.presupuesto.vigencia || {}));
  const tipos = tiposDe(db, 1, p1.id);
  ok('el log prueba el orden: primero el sello (envio-aprobado), después el envío',
    tipos.includes('presupuesto-envio-aprobado') && tipos.includes('presupuesto-enviado')
      && tipos.indexOf('presupuesto-envio-aprobado') < tipos.indexOf('presupuesto-enviado'));
  const ultimoEmail = emailsEnviados[emailsEnviados.length - 1];
  ok('el email lleva el total y la seña reales',
    /2\.238\.500/.test(ultimoEmail.text) && /Seña: 50%/.test(ultimoEmail.text));
}

// ---------------- Unidad: seguimiento — prepara, no envía ----------------
console.log('— unidad: seguimiento y recordatorio (tarjeta nueva, jamás envío solo)');
{
  pres.procesarSeguimiento(db, 1, { hoy: '2026-10-27' });
  ok('antes de la regla (día 3 de 4): el recordatorio de p1 todavía no se prepara',
    !pres.getPresupuesto(db, 1, p1.id, { hoy: '2026-10-27' }).recordatorio_tarjeta_id);
  const emailsAntes = emailsEnviados.length;
  const seg = pres.procesarSeguimiento(db, 1, { hoy: '2026-10-28' });
  const p1Ahora = pres.getPresupuesto(db, 1, p1.id, { hoy: '2026-10-28' });
  ok('a los días de la regla sin respuesta: PREPARA la tarjeta de recordatorio',
    seg.recordatorios_creados === 1 && !!p1Ahora.recordatorio_tarjeta_id && p1Ahora.estado === 'enviado');
  const tjRec = gesty.getCard(db, 1, p1Ahora.recordatorio_tarjeta_id);
  ok('la tarjeta es de la matriz, acción recordatorio, con el aviso administrativo',
    tjRec.tipo === 'presupuesto' && tjRec.detalle.accion === 'recordatorio' && /sigue vigente/.test(tjRec.detalle.mensaje));
  ok('y NO la envió: ningún email nuevo, ningún evento de recordatorio-enviado',
    emailsEnviados.length === emailsAntes && !tiposDe(db, 1, p1.id).includes('presupuesto-recordatorio-enviado'));
  const seg2 = pres.procesarSeguimiento(db, 1, { hoy: '2026-10-28' });
  ok('segunda pasada: no duplica la tarjeta', seg2.recordatorios_creados === 0 && seg2.ya_con_tarjeta >= 1);

  const errRecSinOk = await lanzaAsync(() => pres.enviarRecordatorio(db, 1, p1.id, {}));
  ok('despachar el recordatorio sin su OK: rechazado', !!errRecSinOk);
  gesty.approveCard(db, 1, tjRec.id, { version_documento: tjRec.version_documento });
  const recEnviado = await pres.enviarRecordatorio(db, 1, p1.id, {});
  ok('con su OK: el recordatorio sale y queda registrado',
    recEnviado.recordatorio.estado === 'enviado' && emailsEnviados.length === emailsAntes + 1
      && tiposDe(db, 1, p1.id).includes('presupuesto-recordatorio-enviado'));
}

// ---------------- Unidad: vencido genera su recordatorio; respuesta y factura ----------------
console.log('— unidad: vencimiento, respuesta del cliente y el acople con G-04');
let pV;
{
  pV = pres.crearBorrador(db, 1, {
    cliente: { cuit: CUIT_ESPIGA },
    items: [{ descripcion: 'Service de aire', cantidad: 1 }],
  });
  pres.pedirOK(db, 1, pV.id, {});
  const tjV = gesty.getCard(db, 1, pres.getPresupuesto(db, 1, pV.id).tarjeta_id);
  gesty.approveCard(db, 1, tjV.id, { version_documento: tjV.version_documento });
  await pres.enviarPresupuesto(db, 1, pV.id, { hoy: '2026-10-24' }); // vence 03/11

  pres.procesarSeguimiento(db, 1, { hoy: '2026-11-05' });
  const pVNow = pres.getPresupuesto(db, 1, pV.id, { hoy: '2026-11-05' });
  ok('vencida la validez sin respuesta: el estado es vencido y su recordatorio quedó PREPARADO',
    pVNow.estado === 'vencido' && !!pVNow.recordatorio_tarjeta_id);
  const tjRecV = gesty.getCard(db, 1, pVNow.recordatorio_tarjeta_id);
  ok('el aviso del vencido dice que venció (administrativo, sin argumento de venta)',
    /venció el/.test(tjRecV.detalle.mensaje) && !/descuento|oferta|no te pierdas/i.test(tjRecV.detalle.mensaje));
  const p1Vencida = pres.getPresupuesto(db, 1, p1.id, { hoy: '2026-11-05' });
  ok('el primer presupuesto también quedó vencido (su recordatorio ya había salido: no se repite)',
    p1Vencida.estado === 'vencido' && p1Vencida.recordatorios.filter((x) => x.estado === 'enviado').length === 1);

  const aceptado = pres.registrarRespuesta(db, 1, pV.id, { texto: 'Dale, lo hacemos', resultado: 'aceptado', canal: 'whatsapp' });
  ok('la respuesta del cliente queda registrada y mueve el estado a aceptado',
    aceptado.estado === 'aceptado' && aceptado.respuestas.length === 1 && aceptado.sin_respuesta === false);
  const recViejo = gesty.approveCard(db, 1, tjRecV.id, { version_documento: tjRecV.version_documento });
  ok('aprobar el recordatorio DESPUÉS de la respuesta: el ejecutor lo rechaza (ya no corresponde)',
    recViejo.ok === false);

  const { factura } = pres.crearFacturaDesdePresupuesto(db, 1, pV.id, {});
  ok('aceptado → G-04: nace el borrador de factura por el acople origen_ref, con el mismo total',
    factura.estado === 'borrador' && factura.origen.tipo === 'presupuesto' && factura.origen.ref === String(pV.id)
      && factura.total === pV.total && pres.getPresupuesto(db, 1, pV.id).factura_id === factura.id,
    JSON.stringify(factura.origen || {}));
  ok('no se duplica: la segunda creación la rechaza el servidor',
    !!lanza(() => pres.crearFacturaDesdePresupuesto(db, 1, pV.id, {})));

  const pR = pres.crearBorrador(db, 1, {
    cliente: { nombre: 'Carnicería El Toro', cuit: CUIT_TORO, email: 'eltoro@example.com' },
    items: [{ descripcion: 'Service de aire', cantidad: 1 }],
  });
  pres.pedirOK(db, 1, pR.id, {});
  const tjR = gesty.getCard(db, 1, pres.getPresupuesto(db, 1, pR.id).tarjeta_id);
  gesty.approveCard(db, 1, tjR.id, { version_documento: tjR.version_documento });
  await pres.enviarPresupuesto(db, 1, pR.id, { hoy: '2026-10-24' });
  ok('crear la factura de un presupuesto NO aceptado: rechazado',
    !!lanza(() => pres.crearFacturaDesdePresupuesto(db, 1, pR.id, {})));
  const rechazado = pres.registrarRespuesta(db, 1, pR.id, { texto: 'Esta vez no', resultado: 'rechazado' });
  ok('rechazado queda cerrado con su respuesta registrada',
    rechazado.estado === 'rechazado' && tiposDe(db, 1, pR.id).includes('presupuesto-rechazado'));
}

// ---------------- Unidad: separación por cuenta ----------------
console.log('— unidad: separación por cuenta');
{
  gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
  ok('otra cuenta no ve el presupuesto ajeno',
    pres.getPresupuesto(db, 2, p1.id) === null && pres.listPresupuestos(db, 2, {}).total === 0);
  ok('ni puede alimentarle una factura', !!lanza(() => pres.crearFacturaDesdePresupuesto(db, 2, pV.id, {})));
  ok('ni responder su pregunta', !!lanza(() => pres.responderPregunta(db, 2, p1.id, {})));
}

// ---------------- Wiring ----------------
console.log('— wiring: rutas montadas y sin atajos');
{
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const modSrc = fs.readFileSync(path.join(__dirname, 'gesty-presupuestos.js'), 'utf8');
  ok('wiring: las rutas /api/gesty/presupuestos* están montadas con gating + capacidad',
    serverSrc.includes("app.post('/api/gesty/presupuestos'") && serverSrc.includes("gesty.capacidadMiddleware(db, 'presupuestos')"));
  ok('wiring: NO existe ruta directa de envío — el despacho va por el módulo sellado',
    !serverSrc.includes('/api/gesty/presupuestos/:id/enviar-directo') && !modSrc.includes('app.post'));
  ok('wiring: el ejecutor de la matriz está registrado en el módulo',
    modSrc.includes("registerExecutor('presupuesto'"));
  ok('wiring: BUILD_ID presente con la convención vigente (el módulo no lo gestiona)', /const BUILD_ID = '20261024-v[0-9]+';/.test(serverSrc));
}

// ---------------- HTTP: flujo completo ----------------
const PORT = 3993;
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g08-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g08@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/presupuestos', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/presupuestos', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g08@example.com');
  dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'admin-familia')").run(u.id);
  const conEsencial = await call('GET', '/api/gesty/presupuestos', null, reg.cookie);
  ok('gating http: pack Esencial NO trae la capacidad presupuestos → 403', conEsencial.status === 403, String(conEsencial.status));
  dbFile.prepare("UPDATE gesty_subscriptions SET pack = 'completa' WHERE user_id = ?").run(u.id);
  dbFile.close();

  const creado = await call('POST', '/api/gesty/presupuestos', {
    cliente: { nombre: 'Cliente Web', cuit: '20222222229', email: 'web@example.com' },
    pedido_texto: 'Necesito el trabajo publicado',
    canal: 'whatsapp-manual',
    items: [{ descripcion: 'Trabajo web', cantidad: 1, precio_unitario: 100000, alicuota_iva: 21 }],
    total: 5,
  }, reg.cookie);
  ok('http: crear el borrador → 200 con los totales del SERVIDOR',
    creado.status === 200 && creado.data.presupuesto.total === 121000 && creado.data.presupuesto.estado === 'borrador',
    JSON.stringify(creado.data).slice(0, 200));
  const pId = creado.data.presupuesto.id;

  const envioTemprano = await call('POST', `/api/gesty/presupuestos/${pId}/enviar`, { canal: 'whatsapp-manual', comprobante: 'x' }, reg.cookie);
  ok('http: enviar sin OK → 400 (el servidor lo rechaza)', envioTemprano.status === 400, String(envioTemprano.status));

  const pedida = await call('POST', `/api/gesty/presupuestos/${pId}/pedir-ok`, {}, reg.cookie);
  ok('http: pedir-ok crea la tarjeta «presupuesto»',
    pedida.status === 200 && pedida.data.tarjeta && pedida.data.tarjeta.tipo === 'presupuesto',
    JSON.stringify(pedida.data).slice(0, 200));
  const aprob = await call('POST', `/api/gesty/bandeja/${pedida.data.tarjeta.id}/aprobar`, { version_documento: pedida.data.tarjeta.version_documento }, reg.cookie);
  ok('http: aprobar la tarjeta → 200', aprob.status === 200 && aprob.data.ok === true, JSON.stringify(aprob.data).slice(0, 160));
  const envioWa = await call('POST', `/api/gesty/presupuestos/${pId}/enviar`, { canal: 'whatsapp-manual', comprobante: 'captura-wa-http' }, reg.cookie);
  ok('http: despacho manual asistido con comprobante → enviado, con vigencia',
    envioWa.status === 200 && envioWa.data.presupuesto.estado === 'enviado' && !!envioWa.data.presupuesto.vigencia.hasta,
    JSON.stringify(envioWa.data).slice(0, 200));

  const regB = await call('POST', '/api/auth/register', { email: 'g08-otra@example.com', password: 'secreto2' });
  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  const uB = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('g08-otra@example.com');
  dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'total', 'checkout')").run(uB.id);
  dbFile2.close();
  const listaB = await call('GET', '/api/gesty/presupuestos', null, regB.cookie);
  ok('http: otra cuenta con pack ve SUS presupuestos (vacío), nunca los ajenos', listaB.status === 200 && listaB.data.total === 0);
  const detalleB = await call('GET', `/api/gesty/presupuestos/${pId}`, null, regB.cookie);
  ok('http: el detalle ajeno → 400', detalleB.status === 400, String(detalleB.status));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
