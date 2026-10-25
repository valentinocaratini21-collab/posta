#!/usr/bin/env node
// test-gesty-cobranzas.js — G-05 · COBRANZAS.
// Spec: gesty-cola-builds.md G-05, gesty-areas-detalle.md §3,
// gesty-sistema-operativo.md §2.3/§5 (matriz: CADA mensaje de
// cobranza sale con el OK del dueño, sin excepción).
// Cubre: la política del fundamento (default + escalera del dueño
// con su procedencia y su registro) · el motor de vencimientos
// (factura vencida → su tarjeta con el mensaje del escalón
// correcto, con los datos reales) · una sola cobranza por factura
// y el escalón que avanza SIN duplicar tarjetas (regenera la que
// espera) · CERO envíos sin OK verificado sobre el registro
// durable · la aprobación sella el envío y el despacho lo ejecuta
// (email por el canal inyectado; WhatsApp manual con comprobante)
// · fallo de canal registrado sin fingir · promesa de pago que
// frena la escalera y promesa incumplida que la libera · pago
// parcial que mantiene la cobranza por el saldo (tarjeta
// regenerada con el número nuevo) · pago total que la cierra sola
// · cierre reconciliado cuando el pago entra por G-04 directo ·
// el ejecutor que protege la tarjeta de una deuda saldada · el
// comprobante de pago de G-03 que se vincula y salda · respuestas
// registradas · resumen para la pantalla y G-21 · separación por
// cuenta · gating (401/403) en HTTP.
// Uso: node test-gesty-cobranzas.js
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
const comp = require('./gesty-comprobantes.js');
const cob = require('./gesty-cobranzas.js');

const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';   // Panadería La Espiga

// Canal de email falso inyectado (el patrón de la casa), uno por
// módulo como en producción: el de facturación manda las facturas
// y el de cobranzas, los recordatorios.
const emailsFactura = [];
fact.configure({ sendEmail: async (o) => { emailsFactura.push(o); return { ok: true, id: 'resend-fact-1' }; } });
const emailsCobranza = [];
let emailCobFalla = false;
cob.configure({
  sendEmail: async (o) => {
    if (emailCobFalla) return { ok: false, skipped: true };
    emailsCobranza.push(o);
    return { ok: true, id: 'resend-cob-1' };
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
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_CLIENTE, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}

// Lleva una factura a ENVIADA por el flujo completo de G-04 (el
// envío al cliente sale por WhatsApp manual, con su comprobante).
function facturaEnviada(db, uid, datos) {
  const f = fact.crearBorrador(db, uid, {
    cliente: { cuit: CUIT_CLIENTE },
    items: [{ descripcion: datos.concepto || 'Instalación de cámara', cantidad: 1, precio_unitario: datos.precio, alicuota_iva: 0 }],
    fecha: datos.fecha, vencimiento: datos.vencimiento,
  });
  const p = fact.pedirOK(db, uid, f.id);
  const ap = gesty.approveCard(db, uid, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación de emisión tiene que salir');
  return fact.enviarFactura(db, uid, f.id, { canal: 'whatsapp-manual', comprobante: 'wa-factura', destinatario: 'Panadería La Espiga' })
    .then((r) => r.factura);
}
const tarjetasCobranza = (db, uid) => gesty.listCards(db, uid, {}).filter((c) => c.tipo === 'cobranza');
const eventosCobranza = (db, uid, cobId) => gesty.listEvents(db, uid, { entidad_tipo: 'cobranza', entidad_id: String(cobId) });
const tiposCobranza = (db, uid, cobId) => eventosCobranza(db, uid, cobId).map((e) => e.tipo_evento);

// La propiedad de la matriz, verificada SOBRE EL LOG: cada envío
// registrado tiene su sello de aprobación (misma tarjeta) antes.
function logSinEnviosSinOK(db, uid) {
  const evs = gesty.listEvents(db, uid, { limit: 5000 });
  const sellos = new Set();
  for (const e of evs) {
    if (e.tipo_evento === 'cobranza-envio-aprobado' && e.payload) sellos.add(`${e.entidad_id}:${e.payload.tarjeta_id}`);
    if (e.tipo_evento === 'cobranza-enviada') {
      if (!e.payload || !sellos.has(`${e.entidad_id}:${e.payload.tarjeta_id}`)) return false;
    }
  }
  return true;
}

(async () => {

// ---------------- La política: default y la del dueño ----------------
console.log('— unidad: la política de cobranza vive en el fundamento');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  ok('gating: el pack esencial incluye cobranzas', gesty.hasCapacidad(db, 1, 'cobranzas'));

  const def = cob.getPolitica(db, 1);
  ok('política default: escalera amable@1 / firme@7 / ultimo@15, canal email, sin recargo',
    def.origen === 'default' && def.canal === 'email' && def.recargo_mora === '' &&
    def.escalones.map((e) => `${e.clave}@${e.dias_desde}`).join(',') === 'amable@1,firme@7,ultimo@15',
    JSON.stringify(def.escalones));
  ok('las plantillas default no mencionan recargos ni consecuencias (regla de verdad)',
    def.escalones.every((e) => !/recargo|intim|judicial|veraz|deuda.*report/i.test(e.plantilla)));

  const nueva = cob.setPolitica(db, 1, {
    escalones: [
      { clave: 'suave', dias_desde: 3, plantilla: 'Hola {cliente}, de {negocio}: la factura {factura} por {moneda} {saldo} venció el {vencimiento}. ¿Nos confirmás el pago?' },
      { clave: 'directo', dias_desde: 10, plantilla: 'Hola {cliente}, de {negocio}: pasaron {dias} días del vencimiento de la factura {factura} ({moneda} {saldo}). Esperamos tu pago hoy.' },
    ],
    canal: 'whatsapp-manual',
  });
  ok('la escalera del dueño manda: claves, días y canal propios, origen fundamento',
    nueva.origen === 'fundamento' && nueva.canal === 'whatsapp-manual' && nueva.escalones.length === 2 && nueva.escalones[0].clave === 'suave');
  const dato = gesty.getData(db, 1, { grupo: 'reglas-cobro' }).find((d) => d.campo === 'cobranza_escalones');
  ok('la escalera queda en el fundamento con origen del dueño y su procedencia',
    !!dato && dato.origen === 'dueno' && Array.isArray(dato.valor) && dato.valor.length === 2);
  ok('el cambio de política queda en el registro durable',
    gesty.listEvents(db, 1, { entidad_tipo: 'cobranza', entidad_id: 'politica' }).some((e) => e.tipo_evento === 'cobranza-politica-actualizada'));
  ok('política inválida se rechaza (escalón sin plantilla; canal desconocido)',
    !!lanza(() => cob.setPolitica(db, 1, { escalones: [{ clave: 'x', dias_desde: 1, plantilla: '' }] })) &&
    !!lanza(() => cob.setPolitica(db, 1, { canal: 'paloma-mensajera' })));
  db.close();
}

// ---------------- Motor: la tarjeta del escalón correcto ----------------
console.log('— unidad: vencimiento → tarjeta con el mensaje del escalón');
let dbA, cobA, tarjetaA;
{
  dbA = dbConPack('esencial');
  sembrarFundamento(dbA, 1);
  const f = await facturaEnviada(dbA, 1, { precio: 925000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  ok('la factura de prueba quedó enviada con saldo', f.estado === 'enviada' && f.saldo === 925000, f.estado);

  const esc = cob.escanearVencimientos(dbA, 1, { hoy: '2026-10-24' }); // 7 días de mora → firme
  ok('escaneo: una cobranza creada y una tarjeta nueva', esc.creadas === 1 && esc.tarjetas_nuevas === 1, JSON.stringify(esc));
  const lista = cob.listCobranzas(dbA, 1, { hoy: '2026-10-24' }); // mismo reloj que el escaneo: la suite no depende de la fecha del sistema
  cobA = lista.cobranzas[0];
  ok('la cobranza nace abierta, atada a su factura, con 7 días de mora',
    lista.total === 1 && cobA.estado === 'abierta' && cobA.factura_id === f.id && cobA.dias_mora === 7 && cobA.factura.saldo === 925000);
  const tjs = tarjetasCobranza(dbA, 1);
  tarjetaA = tjs[0];
  ok('la tarjeta es de la matriz (tipo cobranza) y trae el escalón FIRME',
    tjs.length === 1 && tarjetaA.tipo === 'cobranza' && tarjetaA.detalle.escalon === 'firme' && tarjetaA.detalle.dias_mora === 7,
    JSON.stringify(tarjetaA && tarjetaA.detalle));
  ok('el mensaje viene LISTO con los datos reales (cliente, saldo, días, negocio)',
    tarjetaA.detalle.mensaje.includes('Panadería La Espiga') && tarjetaA.detalle.mensaje.includes('925.000,00') &&
    tarjetaA.detalle.mensaje.includes('7 días') && tarjetaA.detalle.mensaje.includes('Refrigeración Sosa'),
    tarjetaA.detalle.mensaje);
  ok('el mensaje no inventa recargos ni consecuencias',
    !/recargo|intim|judicial/i.test(tarjetaA.detalle.mensaje));
  ok('la tarjeta NO nace vencida (no hereda el vencimiento de la factura)', tarjetaA.vence === '');

  const esc2 = cob.escanearVencimientos(dbA, 1, { hoy: '2026-10-24' });
  ok('reescanear el mismo día no duplica: ni cobranza ni tarjeta nuevas',
    esc2.creadas === 0 && esc2.tarjetas_nuevas === 0 && tarjetasCobranza(dbA, 1).length === 1 && cob.listCobranzas(dbA, 1, {}).total === 1);

  const errSinOK = await lanzaAsync(() => cob.enviarCobranza(dbA, 1, cobA.id, {}));
  ok('SIN OK no sale: el despacho sin aprobación se rechaza', !!errSinOK && /OK del dueño/.test(errSinOK.message), errSinOK && errSinOK.message);
  ok('y el log lo prueba: cero envíos registrados hasta acá',
    logSinEnviosSinOK(dbA, 1) && !tiposCobranza(dbA, 1, cobA.id).includes('cobranza-enviada') && emailsCobranza.length === 0);
}

// ---------------- Aprobación → sello → despacho por email ----------------
console.log('— unidad: aprobar sella el envío; despachar lo ejecuta');
{
  const ap = gesty.approveCard(dbA, 1, tarjetaA.id, { version_documento: tarjetaA.version_documento, usuario: 'dueno' });
  ok('aprobar la tarjeta de cobranza sale bien', ap.ok === true, JSON.stringify(ap).slice(0, 160));
  const tras = cob.getCobranza(dbA, 1, cobA.id);
  const sello = tras.envios.find((e) => e.estado === 'aprobado');
  ok('el ejecutor selló el envío: mensaje, canal y tarjeta congelados (todavía NO enviado)',
    !!sello && sello.tarjeta_id === tarjetaA.id && sello.canal === 'email' && sello.mensaje === tarjetaA.detalle.mensaje &&
    !tiposCobranza(dbA, 1, cobA.id).includes('cobranza-enviada'), JSON.stringify(tras.envios));
  const desp = await cob.enviarCobranza(dbA, 1, cobA.id, {});
  ok('el despacho manda EL mensaje aprobado por el canal de la app, con su comprobante',
    desp.envio.estado === 'enviado' && desp.envio.comprobante === 'resend-cob-1' && emailsCobranza.length === 1 &&
    emailsCobranza[0].text === tarjetaA.detalle.mensaje && emailsCobranza[0].to === 'laespiga@example.com',
    JSON.stringify(emailsCobranza[0] || {}).slice(0, 200));
  ok('el log verifica la propiedad: cada cobranza-enviada tiene su sello previo (misma tarjeta)',
    logSinEnviosSinOK(dbA, 1) && tiposCobranza(dbA, 1, cobA.id).includes('cobranza-envio-aprobado'));
  ok('la cobranza sigue ABIERTA tras el envío (la deuda vive hasta que pague) y el escalón quedó gestionado',
    desp.cobranza.estado === 'abierta' && desp.cobranza.escalon_actual === 'firme');
  const errRepetir = await lanzaAsync(() => cob.enviarCobranza(dbA, 1, cobA.id, {}));
  ok('el mismo envío no se despacha dos veces', !!errRepetir);
  const esc = cob.escanearVencimientos(dbA, 1, { hoy: '2026-10-26' }); // 9 días: todavía firme
  ok('con el escalón firme ya gestionado, el escaneo no prepara otra tarjeta',
    esc.tarjetas_nuevas === 0 && esc.tarjetas_regeneradas === 0 && tarjetasCobranza(dbA, 1).length === 0);
}

// ---------------- Pago total: la cobranza se cierra sola ----------------
console.log('— unidad: el pago total cierra la cobranza');
{
  const esc = cob.escanearVencimientos(dbA, 1, { hoy: '2026-11-05' }); // 19 días → último aviso
  ok('al avanzar al último escalón nace UNA tarjeta nueva (la anterior ya se aprobó)',
    esc.tarjetas_nuevas === 1 && tarjetasCobranza(dbA, 1).length === 1 && tarjetasCobranza(dbA, 1)[0].detalle.escalon === 'ultimo');
  const pago = cob.registrarPago(dbA, 1, cobA.id, { medio: 'transferencia', comprobante: 'TRF-COB-1' });
  ok('el pago por el registro de G-04 salda la factura', pago.factura.estado === 'cobrada' && pago.factura.saldo === 0);
  const cerrada = cob.getCobranza(dbA, 1, cobA.id);
  ok('la cobranza se CIERRA sola, con su motivo en el registro',
    cerrada.estado === 'cerrada' && cerrada.motivo_cierre === 'pago-registrado' && tiposCobranza(dbA, 1, cobA.id).includes('cobranza-cerrada'));
  ok('pagar una cobranza cerrada se rechaza', !!lanza(() => cob.registrarPago(dbA, 1, cobA.id, {})));
  dbA.close();
}

// ---------------- Avance de escalón SIN duplicar (regenera) ----------------
console.log('— unidad: el escalón avanza sobre la misma tarjeta');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  const f = await facturaEnviada(db, 1, { precio: 100000, fecha: '2026-10-20', vencimiento: '2026-10-23' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' }); // 1 día → amable
  const t1 = tarjetasCobranza(db, 1)[0];
  ok('día 1: tarjeta AMABLE', t1.detalle.escalon === 'amable' && t1.version_documento === 1);
  const esc = cob.escanearVencimientos(db, 1, { hoy: '2026-10-31' }); // 8 días → firme
  const t2 = tarjetasCobranza(db, 1)[0];
  ok('día 8: la MISMA tarjeta se regeneró a FIRME (mismo id, versión nueva, una sola en la bandeja)',
    esc.tarjetas_regeneradas === 1 && tarjetasCobranza(db, 1).length === 1 && t2.id === t1.id && t2.version_documento === 2 && t2.detalle.escalon === 'firme',
    JSON.stringify({ esc, n: tarjetasCobranza(db, 1).length }));
  cob.escanearVencimientos(db, 1, { hoy: '2026-11-09' }); // 17 días → último
  const t3 = tarjetasCobranza(db, 1)[0];
  ok('día 17: sigue siendo UNA tarjeta, ahora ÚLTIMO aviso',
    tarjetasCobranza(db, 1).length === 1 && t3.id === t1.id && t3.detalle.escalon === 'ultimo' && t3.version_documento === 3);
  ok('y una sola cobranza para la factura en todo el recorrido', cob.listCobranzas(db, 1, {}).total === 1);
  db.close();
}

// ---------------- Pago parcial: sigue por el saldo ----------------
console.log('— unidad: pago parcial — la cobranza sigue por el saldo');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  const f = await facturaEnviada(db, 1, { precio: 200000, fecha: '2026-10-01', vencimiento: '2026-10-14' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' }); // 10 días → firme, saldo 200.000
  const lista = cob.listCobranzas(db, 1, {});
  const cobId = lista.cobranzas[0].id;
  const parcial = cob.registrarPago(db, 1, cobId, { monto: 80000, medio: 'efectivo' });
  ok('el pago parcial se registra contra la factura (saldo real: 120.000)',
    parcial.factura.estado === 'enviada' && parcial.factura.saldo === 120000, String(parcial.factura.saldo));
  const abierta = cob.getCobranza(db, 1, cobId);
  ok('la cobranza SIGUE abierta por el saldo, con el pago parcial en su registro',
    abierta.estado === 'abierta' && abierta.factura.saldo === 120000 && tiposCobranza(db, 1, cobId).includes('cobranza-pago-parcial'));
  const t = tarjetasCobranza(db, 1)[0];
  ok('la tarjeta que esperaba se regeneró con el saldo NUEVO (el documento cambió)',
    t.detalle.saldo === 120000 && t.detalle.mensaje.includes('120.000,00') && t.version_documento === 2,
    JSON.stringify(t.detalle));
  const resto = cob.registrarPago(db, 1, cobId, { medio: 'transferencia' });
  ok('el resto salda: factura cobrada y cobranza cerrada',
    resto.factura.estado === 'cobrada' && cob.getCobranza(db, 1, cobId).estado === 'cerrada');
  db.close();
}

// ---------------- Cierre reconciliado por un camino ajeno (G-04) ----------------
console.log('— unidad: si el pago entra por G-04 directo, la cobranza se entera sola');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  const f = await facturaEnviada(db, 1, { precio: 50000, fecha: '2026-10-10', vencimiento: '2026-10-20' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const cobId = cob.listCobranzas(db, 1, {}).cobranzas[0].id;
  const t = tarjetasCobranza(db, 1)[0];
  fact.registrarCobro(db, 1, f.id, { medio: 'transferencia', comprobante: 'TRF-DIRECTO' }); // sin pasar por cobranzas
  const vista = cob.listCobranzas(db, 1, {});
  ok('la lectura reconcilia: la cobranza aparece CERRADA (nadie la tocó a mano)',
    vista.cobranzas[0].estado === 'cerrada' && vista.cobranzas[0].motivo_cierre === 'pago-registrado');
  const ap = gesty.approveCard(db, 1, t.id, { version_documento: t.version_documento, usuario: 'dueno' });
  ok('la tarjeta de la deuda saldada NO se puede ejecutar: vuelve devuelta con su motivo',
    ap.ok === false && ap.devuelta === true && /saldó/.test(ap.motivo || ''), JSON.stringify(ap).slice(0, 200));
  ok('y sigue habiendo cero envíos en el log', logSinEnviosSinOK(db, 1));
  db.close();
}

// ---------------- Promesas: frenan la escalera, su vencimiento la libera ----------------
console.log('— unidad: promesa de pago registrada y respetada');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  const f = await facturaEnviada(db, 1, { precio: 75000, fecha: '2026-10-15', vencimiento: '2026-10-23' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' }); // amable
  const cobId = cob.listCobranzas(db, 1, {}).cobranzas[0].id;
  const conPromesa = cob.registrarRespuesta(db, 1, cobId, { texto: 'Te pago el jueves sin falta', canal: 'whatsapp', promesa_fecha: '2026-10-29' });
  ok('la respuesta y la promesa quedan registradas en la cobranza',
    conPromesa.respuestas.length === 1 && conPromesa.promesa_fecha === '2026-10-29' &&
    tiposCobranza(db, 1, cobId).includes('cobranza-respuesta') && tiposCobranza(db, 1, cobId).includes('cobranza-promesa'));
  const escP = cob.escanearVencimientos(db, 1, { hoy: '2026-10-28' }); // 5 días: amable sigue; promesa vigente
  ok('con promesa vigente, el escaneo NO apura: ni tarjeta nueva ni regenerada',
    escP.promesas_vigentes === 1 && escP.tarjetas_regeneradas === 0 && escP.tarjetas_nuevas === 0 &&
    tarjetasCobranza(db, 1)[0].detalle.escalon === 'amable');
  const escV = cob.escanearVencimientos(db, 1, { hoy: '2026-10-31' }); // promesa vencida; 8 días → firme
  ok('promesa vencida sin pago: queda asentada y la escalera sigue (tarjeta a FIRME)',
    escV.tarjetas_regeneradas === 1 && tiposCobranza(db, 1, cobId).includes('cobranza-promesa-incumplida') &&
    tarjetasCobranza(db, 1)[0].detalle.escalon === 'firme');
  db.close();
}

// ---------------- Fallo de canal: registrado, nada fingido ----------------
console.log('— unidad: el canal falla → queda registrado y la cobranza sigue abierta');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  cob.setPolitica(db, 1, { canal: 'whatsapp-manual' });
  const f = await facturaEnviada(db, 1, { precio: 60000, fecha: '2026-10-05', vencimiento: '2026-10-23' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const cobId = cob.listCobranzas(db, 1, {}).cobranzas[0].id;
  const t = tarjetasCobranza(db, 1)[0];
  ok('la política del dueño manda en la tarjeta: canal WhatsApp manual', t.detalle.canal === 'whatsapp-manual');
  const errSinComp = await lanzaAsync(() => cob.enviarCobranza(db, 1, cobId, { canal: 'whatsapp-manual' }));
  ok('antes del OK, ni siquiera el registro manual pasa', !!errSinComp);
  gesty.approveCard(db, 1, t.id, { version_documento: t.version_documento, usuario: 'dueno' });
  const errComp = await lanzaAsync(() => cob.enviarCobranza(db, 1, cobId, {}));
  ok('WhatsApp manual SIN comprobante no hay envío (aunque esté aprobado)', !!errComp && /comprobante/.test(errComp.message));
  const env = await cob.enviarCobranza(db, 1, cobId, { comprobante: 'captura-wa-cob-1' });
  ok('con su comprobante, el envío manual queda registrado como enviado',
    env.envio.estado === 'enviado' && env.envio.comprobante === 'captura-wa-cob-1' && logSinEnviosSinOK(db, 1));

  // Ahora el canal email que falla:
  cob.setPolitica(db, 1, { canal: 'email' });
  const f2 = await facturaEnviada(db, 1, { precio: 30000, fecha: '2026-10-06', vencimiento: '2026-10-20', concepto: 'Service' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const cob2 = cob.listCobranzas(db, 1, { factura_id: f2.id }).cobranzas[0];
  const t2 = tarjetasCobranza(db, 1).find((x) => x.detalle.cobranza_id === cob2.id);
  gesty.approveCard(db, 1, t2.id, { version_documento: t2.version_documento, usuario: 'dueno' });
  emailCobFalla = true;
  const antes = emailsCobranza.length;
  const errFalla = await lanzaAsync(() => cob.enviarCobranza(db, 1, cob2.id, {}));
  emailCobFalla = false;
  ok('si el proveedor de email falla, el despacho NO se finge',
    !!errFalla && !tiposCobranza(db, 1, cob2.id).includes('cobranza-enviada') && emailsCobranza.length === antes);
  const c2 = cob.getCobranza(db, 1, cob2.id);
  ok('el fallo queda registrado, la cobranza sigue abierta y el envío queda reintentable',
    c2.estado === 'abierta' && tiposCobranza(db, 1, cob2.id).includes('cobranza-envio-fallido') &&
    c2.envios.some((e) => e.estado === 'fallido'));
  const reintento = await cob.enviarCobranza(db, 1, cob2.id, {});
  ok('el reintento con el canal sano sale con el MISMO sello (sin OK nuevo)',
    reintento.envio.estado === 'enviado' && reintento.envio.intentos === 2 && logSinEnviosSinOK(db, 1));
  db.close();
}

// ---------------- Comprobante de pago (G-03) que salda ----------------
console.log('— unidad: el papel del pago entra por G-03 y salda la deuda');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  const f = await facturaEnviada(db, 1, { precio: 45000, fecha: '2026-10-08', vencimiento: '2026-10-22' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const cobId = cob.listCobranzas(db, 1, {}).cobranzas[0].id;
  const papel = comp.registrarManual(db, 1, {
    tipo: 'recibo', direccion: 'recibida',
    emisor_nombre: 'Panadería La Espiga', emisor_cuit: CUIT_CLIENTE,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: 'TRF-9988', fecha: '2026-10-24', monto_total: 45000, concepto: 'Pago factura cámara',
  }).comprobante;
  ok('el comprobante de pago quedó leído en G-03 con su monto', papel && papel.monto_total === 45000, JSON.stringify(papel && papel.monto_total));
  const vinc = cob.vincularComprobantePago(db, 1, { cobranza_id: cobId, comprobante_id: papel.id, medio: 'transferencia' });
  ok('vincular el papel salda la factura y cierra la cobranza, todo asentado',
    vinc.factura.estado === 'cobrada' && vinc.cobranza.estado === 'cerrada' &&
    tiposCobranza(db, 1, cobId).includes('cobranza-pago-vinculado') && vinc.pago.comprobante === `comprobante:${papel.id}`);
  ok('un papel ajeno no se vincula', !!lanza(() => cob.vincularComprobantePago(db, 2, { cobranza_id: cobId, comprobante_id: papel.id })));
  db.close();
}

// ---------------- Resumen y separación por cuenta ----------------
console.log('— unidad: resumen del área y separación por cuenta');
{
  const db = dbConPack('esencial');
  gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
  sembrarFundamento(db, 1);
  sembrarFundamento(db, 2);
  const f = await facturaEnviada(db, 1, { precio: 110000, fecha: '2026-10-02', vencimiento: '2026-10-09' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' }); // 15 días → ultimo
  const r = cob.resumenCobranzas(db, 1);
  ok('resumen: una abierta en el último escalón, con su monto y su tarjeta esperando',
    r.abiertas === 1 && r.por_escalon.ultimo === 1 && r.monto_vencido === 110000 && r.con_tarjeta_pendiente === 1,
    JSON.stringify(r));
  const cobId = cob.listCobranzas(db, 1, {}).cobranzas[0].id;
  ok('separación: la otra cuenta no ve ni opera cobranzas ajenas',
    cob.getCobranza(db, 2, cobId) === null && cob.listCobranzas(db, 2, {}).total === 0 &&
    !!lanza(() => cob.registrarRespuesta(db, 2, cobId, { texto: 'x' })) &&
    !!lanza(() => cob.registrarPago(db, 2, cobId, {})));
  const esc2 = cob.escanearVencimientos(db, 2, { hoy: '2026-10-24' });
  ok('el escaneo de la otra cuenta no crea nada con facturas ajenas',
    esc2.creadas === 0 && cob.listCobranzas(db, 2, {}).total === 0);
  db.close();
}

// ---------------- Wiring ----------------
console.log('— wiring: rutas, ejecutor y BUILD_ID');
{
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const modSrc = fs.readFileSync(path.join(__dirname, 'gesty-cobranzas.js'), 'utf8');
  ok('wiring: las rutas /api/gesty/cobranzas* están montadas con gating + capacidad',
    serverSrc.includes("app.get('/api/gesty/cobranzas'") && serverSrc.includes("gesty.capacidadMiddleware(db, 'cobranzas')"));
  ok('wiring: el ejecutor de la matriz está registrado en el módulo',
    modSrc.includes("registerExecutor('cobranza'"));
  ok('wiring: el módulo no monta rutas propias (las monta server.js)', !modSrc.includes('app.post') && !modSrc.includes('app.get'));
  ok('wiring: BUILD_ID presente con la convención vigente (el módulo no lo gestiona)', /const BUILD_ID = '20261024-v[0-9]+';/.test(serverSrc));
}

// ---------------- HTTP: flujo completo ----------------
const PORT = 3997;
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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g05-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g05@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/cobranzas', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/cobranzas', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const dbFile = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile.exec('PRAGMA busy_timeout = 5000');
  const u = dbFile.prepare('SELECT id FROM users WHERE email = ?').get('g05@example.com');
  dbFile.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'esencial', 'admin-familia')").run(u.id);
  dbFile.close();

  const pol = await call('GET', '/api/gesty/cobranzas/politica', null, reg.cookie);
  ok('http: la política se lee con su escalera default',
    pol.status === 200 && pol.data.politica.escalones.length === 3 && pol.data.politica.canal === 'email',
    JSON.stringify(pol.data).slice(0, 200));
  const esc = await call('POST', '/api/gesty/cobranzas/escanear', {}, reg.cookie);
  ok('http: el escaneo corre (sin facturas, todo en cero)', esc.status === 200 && esc.data.escaneo.creadas === 0, JSON.stringify(esc.data).slice(0, 160));
  const lista = await call('GET', '/api/gesty/cobranzas', null, reg.cookie);
  ok('http: la lista de cobranzas responde vacía para la cuenta nueva', lista.status === 200 && lista.data.total === 0);
  const resumen = await call('GET', '/api/gesty/cobranzas/resumen', null, reg.cookie);
  ok('http: el resumen responde con sus contadores en cero',
    resumen.status === 200 && resumen.data.resumen.abiertas === 0 && resumen.data.resumen.monto_vencido === 0);

  const regB = await call('POST', '/api/auth/register', { email: 'g05-otra@example.com', password: 'secreto2' });
  const dbFile2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  dbFile2.exec('PRAGMA busy_timeout = 5000');
  const uB = dbFile2.prepare('SELECT id FROM users WHERE email = ?').get('g05-otra@example.com');
  dbFile2.prepare("INSERT INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, 'total', 'checkout')").run(uB.id);
  dbFile2.close();
  const listaB = await call('GET', '/api/gesty/cobranzas', null, regB.cookie);
  ok('http: otra cuenta con pack ve SUS cobranzas (vacío), nunca las ajenas', listaB.status === 200 && listaB.data.total === 0);
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
