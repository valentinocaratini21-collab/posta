#!/usr/bin/env node
// test-gesty-cobranzas-pago.js — G-27 · COBRANZA CON MEDIO DE PAGO.
// Spec: gesty-cola-builds.md G-27. El mensaje de cobranza aprobado
// (G-05) incluye el link/dato de pago del negocio cuando el
// fundamento lo trae; sin dato cargado, el mensaje sale sin link y
// la tarjeta lo declara — jamás un link inventado.
// Cubre: el dato en el fundamento (cuentas-medios ·
// medio-pago-cobranzas, la forma que G-25 fijó: { tipo, dato } y el
// marcador { estado: 'sin-medio', incluir: false }) · la validación
// AL CARGAR (link sin esquema rechazado; un alias con puntos no es
// un link) · la alineación con el detector de G-25 (mismo
// grupo/campo: cargado el dato, la pregunta deja de nacer) · el
// render por la costura de G-05 (el medio viaja DENTRO del mensaje
// congelado de la tarjeta y queda registrado en detalle.medio_pago;
// aprobar sella y despacha exactamente ese mensaje) · sin dato, el
// mensaje sale como siempre y la tarjeta lo declara · el cambio de
// medio con la tarjeta esperando la regenera declarando el cambio
// (criterio de G-05 para escalón/saldo); la tarjeta APROBADA no se
// toca: sale lo sellado · separación por cuenta · gating HTTP
// (401/403) sobre una mini-app propia con las rutas y middlewares
// exactos que server.js debe registrar (el cableado en server.js
// queda fuera de esta suite por la regla de no tocarlo en el build).
// Uso: node test-gesty-cobranzas-pago.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
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
const cob = require('./gesty-cobranzas.js');
const pago = require('./gesty-cobranzas-pago.js');
const pregunta = require('./gesty-pregunta.js');

const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';
const LINK = 'https://link.mercadopago.com.ar/refrigeracionsosa';
const ALIAS = 'refrigeracion.sosa.mp';
const DATOS = 'Banco Galicia · CBU 0070 1234 5678 9012 3456 7 · Titular: Juan Sosa';

const emailsFactura = [];
fact.configure({ sendEmail: async (o) => { emailsFactura.push(o); return { ok: true, id: 'resend-fact-1' }; } });
const emailsCobranza = [];
cob.configure({ sendEmail: async (o) => { emailsCobranza.push(o); return { ok: true, id: 'resend-cob-1' }; } });

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
// Flujo completo de G-04 hasta la factura ENVIADA (igual que la
// suite de G-05: el envío al cliente sale por WhatsApp manual).
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

// ---------------- El dato: forma, validación y fundamento ----------------
console.log('— unidad: el medio de pago vive en el fundamento, validado al cargar');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);

  const vacio = pago.getMedioPago(db, 1);
  ok('sin cargar: estado «sin-cargar», sin línea ni dato',
    vacio.cargado === false && vacio.estado === 'sin-cargar' && vacio.linea === null && vacio.dato_id === null,
    JSON.stringify(vacio));

  const r = pago.setMedioPago(db, 1, { tipo: 'link', url: LINK });
  const fila = gesty.getData(db, 1, { grupo: 'cuentas-medios' }).find((d) => d.campo === 'medio-pago-cobranzas');
  ok('el link queda en el fundamento (cuentas-medios · medio-pago-cobranzas) con la forma de G-25 y origen del dueño',
    !!fila && fila.id === r.dato.id && fila.origen === 'dueno' && fila.valor.tipo === 'link' && fila.valor.dato === LINK,
    JSON.stringify(fila && fila.valor));
  const m = pago.getMedioPago(db, 1);
  ok('la lectura devuelve el link y su línea con la URL tal cual',
    m.estado === 'con-medio' && m.tipo === 'link' && m.dato === LINK && m.linea === `Link de pago: ${LINK}`,
    JSON.stringify(m));
  ok('la carga queda en el registro durable',
    gesty.listEvents(db, 1, { entidad_tipo: 'cobranza', entidad_id: 'medio-pago' })
      .some((e) => e.tipo_evento === 'cobranza-medio-pago-actualizado'));

  const errSinEsquema = lanza(() => pago.setMedioPago(db, 1, { tipo: 'link', dato: 'link.mercadopago.com.ar/refrigeracionsosa' }));
  ok('link SIN esquema se rechaza al cargar (jamás se guarda como link)',
    !!errSinEsquema && /esquema/.test(errSinEsquema.message), errSinEsquema && errSinEsquema.message);
  ok('y el dato anterior queda intacto tras el rechazo',
    pago.getMedioPago(db, 1).dato === LINK);

  const errAliasComoLink = lanza(() => pago.setMedioPago(db, 1, { tipo: 'link', dato: ALIAS }));
  ok('un alias con puntos NO es un link: también se rechaza como link',
    !!errAliasComoLink && /esquema/.test(errAliasComoLink.message));

  pago.setMedioPago(db, 1, { tipo: 'alias', alias: ALIAS });
  ok('el mismo texto como alias sí: línea «Alias: …»',
    pago.getMedioPago(db, 1).linea === `Alias: ${ALIAS}`, pago.getMedioPago(db, 1).linea);

  const errAliasEspacios = lanza(() => pago.setMedioPago(db, 1, { tipo: 'alias', alias: 'mi alias con espacios' }));
  ok('alias con espacios se rechaza (para texto libre están los «datos»)', !!errAliasEspacios);
  pago.setMedioPago(db, 1, { tipo: 'datos', texto: DATOS });
  ok('los datos bancarios en texto libre viajan tal cual',
    pago.getMedioPago(db, 1).tipo === 'datos' && pago.getMedioPago(db, 1).linea === DATOS);

  ok('entradas inválidas se rechazan (vacío, tipo desconocido, link con espacios)',
    !!lanza(() => pago.setMedioPago(db, 1, {})) &&
    !!lanza(() => pago.setMedioPago(db, 1, { tipo: 'tarjeta', dato: 'x' })) &&
    !!lanza(() => pago.setMedioPago(db, 1, { tipo: 'link', url: 'https://link .com/ar' })));

  pago.setMedioPago(db, 1, { sin_medio: true });
  const sm = pago.getMedioPago(db, 1);
  const filaSM = gesty.getData(db, 1, { grupo: 'cuentas-medios' }).find((d) => d.campo === 'medio-pago-cobranzas');
  ok('«sin medio» se guarda como la elección de G-25 ({ estado: sin-medio, incluir: false })',
    sm.estado === 'sin-medio' && sm.linea === null && filaSM.valor.estado === 'sin-medio' && filaSM.valor.incluir === false,
    JSON.stringify(filaSM && filaSM.valor));
  db.close();
}

// ---------------- Alineación con G-25: el mismo hueco, el mismo campo ----------------
console.log('— unidad: G-25 detecta el hueco con el mismo nombre (y deja de preguntar al cargarse)');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  const antes = pregunta.detectarCandidatos(db, 1).candidatos.map((c) => c.clave_hueco);
  ok('sin medio cargado, el catálogo de G-25 ofrece el hueco «medio-pago-cobranzas»',
    antes.includes('medio-pago-cobranzas'), JSON.stringify(antes));
  pago.setMedioPago(db, 1, { tipo: 'link', url: LINK });
  const despues = pregunta.detectarCandidatos(db, 1).candidatos.map((c) => c.clave_hueco);
  ok('cargado por G-27 (mismo grupo/campo), G-25 ya no lo pregunta',
    !despues.includes('medio-pago-cobranzas'), JSON.stringify(despues));

  // Y a la inversa: un dato escrito por la vía de G-25 (su forma,
  // su origen) se lee igual desde G-27 — la lectura no depende de
  // quién escribió.
  const db2 = dbConPack('esencial');
  sembrarFundamento(db2, 1);
  gesty.setData(db2, 1, {
    grupo: 'cuentas-medios', campo: 'medio-pago-cobranzas', valor: { tipo: 'alias', dato: ALIAS },
    origen: 'pregunta-unica', origen_ref: 'pregunta-gesty:1', cargado_por: 'dueno', confirmado: true,
  });
  const m2 = pago.getMedioPago(db2, 1);
  ok('el dato que entró por la respuesta de G-25 se lee tal cual en G-27',
    m2.estado === 'con-medio' && m2.tipo === 'alias' && m2.linea === `Alias: ${ALIAS}`, JSON.stringify(m2));
  db.close(); db2.close();
}

// ---------------- El render: el medio viaja en el mensaje congelado ----------------
console.log('— unidad: la tarjeta de G-05 nace con el medio dentro del mensaje');
{
  // (a) con link cargado ANTES de preparar la tarjeta
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  pago.setMedioPago(db, 1, { tipo: 'link', url: LINK });
  await facturaEnviada(db, 1, { precio: 925000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  const esc = cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const t = tarjetasCobranza(db, 1)[0];
  ok('la tarjeta nace con el link en su línea propia, al final del mensaje',
    esc.tarjetas_nuevas === 1 && !!t && t.detalle.mensaje.endsWith(`\nLink de pago: ${LINK}`),
    t && t.detalle.mensaje);
  ok('la tarjeta REGISTRA qué medio viajó (detalle.medio_pago)',
    t.detalle.medio_pago && t.detalle.medio_pago.tipo === 'link' && t.detalle.medio_pago.dato === LINK,
    JSON.stringify(t.detalle.medio_pago));
  ok('con medio cargado no hay aviso de «sin medio»',
    !(t.detalle.avisos || []).includes(pago.AVISO_SIN_MEDIO), JSON.stringify(t.detalle.avisos));
  ok('la tarjeta declara que usa el dato del medio (usa_datos lo incluye)',
    t.usa_datos.includes(pago.idDatoMedio(db, 1)), JSON.stringify(t.usa_datos));

  const cobId = cob.listCobranzas(db, 1, { hoy: '2026-10-24' }).cobranzas[0].id;
  const ap = gesty.approveCard(db, 1, t.id, { version_documento: t.version_documento, usuario: 'dueno' });
  ok('aprobar la tarjeta sale bien', ap.ok === true, JSON.stringify(ap).slice(0, 160));
  const sello = cob.getCobranza(db, 1, cobId).envios.find((e) => e.estado === 'aprobado');
  ok('el sello congela EL mensaje con el link (lo aprobado es lo que sale)',
    !!sello && sello.mensaje === t.detalle.mensaje && sello.mensaje.includes(LINK));
  const desp = await cob.enviarCobranza(db, 1, cobId, {});
  ok('el despacho manda el mensaje aprobado, con el link, al cliente',
    desp.envio.estado === 'enviado' && emailsCobranza.length === 1 && emailsCobranza[0].text === t.detalle.mensaje &&
    emailsCobranza[0].text.includes(LINK) && logSinEnviosSinOK(db, 1),
    JSON.stringify(emailsCobranza[0] || {}).slice(0, 200));
  db.close();
}
{
  // (b) con alias y con datos: la línea de cada forma
  const dbA = dbConPack('esencial');
  sembrarFundamento(dbA, 1);
  pago.setMedioPago(dbA, 1, { tipo: 'alias', alias: ALIAS });
  await facturaEnviada(dbA, 1, { precio: 100000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  cob.escanearVencimientos(dbA, 1, { hoy: '2026-10-24' });
  const tA = tarjetasCobranza(dbA, 1)[0];
  ok('con alias, el mensaje incluye «Alias: …» y la tarjeta lo registra',
    !!tA && tA.detalle.mensaje.includes(`\nAlias: ${ALIAS}`) && tA.detalle.medio_pago.tipo === 'alias',
    tA && tA.detalle.mensaje);
  dbA.close();

  const dbD = dbConPack('esencial');
  sembrarFundamento(dbD, 1);
  pago.setMedioPago(dbD, 1, { tipo: 'datos', texto: DATOS });
  await facturaEnviada(dbD, 1, { precio: 100000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  cob.escanearVencimientos(dbD, 1, { hoy: '2026-10-24' });
  const tD = tarjetasCobranza(dbD, 1)[0];
  ok('con datos, el texto del dueño viaja palabra por palabra',
    !!tD && tD.detalle.mensaje.includes(`\n${DATOS}`) && tD.detalle.medio_pago.tipo === 'datos',
    tD && tD.detalle.mensaje);
  dbD.close();
}
{
  // (c) sin dato: el mensaje sale como siempre y la tarjeta lo declara
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  await facturaEnviada(db, 1, { precio: 100000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const t = tarjetasCobranza(db, 1)[0];
  ok('sin dato, el mensaje es el de siempre: sin link, sin alias, sin nada inventado',
    !!t && !/Link de pago:|Alias:/.test(t.detalle.mensaje) && t.detalle.medio_pago === null, t && t.detalle.mensaje);
  ok('y la tarjeta lo DECLARA en sus avisos',
    (t.detalle.avisos || []).includes(pago.AVISO_SIN_MEDIO), JSON.stringify(t.detalle.avisos));
  db.close();

  // (d) elección «sin medio»: sin línea y SIN el aviso (fue decidido)
  const db2 = dbConPack('esencial');
  sembrarFundamento(db2, 1);
  pago.setMedioPago(db2, 1, { sin_medio: true });
  await facturaEnviada(db2, 1, { precio: 100000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  cob.escanearVencimientos(db2, 1, { hoy: '2026-10-24' });
  const t2 = tarjetasCobranza(db2, 1)[0];
  ok('con la elección «sin medio», el mensaje sale sin línea y la tarjeta NO avisa «no está cargado»',
    !!t2 && t2.detalle.medio_pago && t2.detalle.medio_pago.estado === 'sin-medio' &&
    !(t2.detalle.avisos || []).includes(pago.AVISO_SIN_MEDIO) && !/Link de pago:|Alias:/.test(t2.detalle.mensaje),
    JSON.stringify(t2 && t2.detalle));
  db2.close();
}

// ---------------- Cambio de medio con la tarjeta esperando ----------------
console.log('— unidad: cambiar el medio regenera la tarjeta que espera (y jamás la aprobada)');
{
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  await facturaEnviada(db, 1, { precio: 100000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const t1 = tarjetasCobranza(db, 1)[0];
  const cobId = cob.listCobranzas(db, 1, { hoy: '2026-10-24' }).cobranzas[0].id;
  ok('preparación: tarjeta sin medio, versión 1',
    !!t1 && t1.detalle.medio_pago === null && t1.version_documento === 1);

  pago.setMedioPago(db, 1, { tipo: 'link', url: LINK });
  const esc = cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const t2 = tarjetasCobranza(db, 1)[0];
  ok('cargar el medio con la tarjeta esperando la REGENERA (misma tarjeta, versión nueva, cambio declarado)',
    esc.tarjetas_regeneradas === 1 && t2.id === t1.id && t2.version_documento === 2 &&
    t2.detalle.mensaje.includes(LINK) && t2.detalle.medio_pago.tipo === 'link' &&
    gesty.listEvents(db, 1, { entidad_tipo: 'cobranza', entidad_id: String(cobId) })
      .some((e) => e.tipo_evento === 'cobranza-escalon-actualizado'),
    JSON.stringify(esc));

  const esc2 = cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  ok('sin cambios, reescanear NO regenera (nada de regeneración espuria)',
    esc2.tarjetas_regeneradas === 0 && tarjetasCobranza(db, 1)[0].version_documento === 2);

  pago.setMedioPago(db, 1, { tipo: 'alias', alias: ALIAS });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const t3 = tarjetasCobranza(db, 1)[0];
  ok('cambiar el medio por otro vuelve a regenerar, con el medio nuevo',
    t3.version_documento === 3 && t3.detalle.mensaje.includes(`Alias: ${ALIAS}`) && !t3.detalle.mensaje.includes(LINK),
    t3.detalle.mensaje);
  db.close();
}
{
  // La aprobada no se toca: viaja el medio de LA tarjeta aprobada.
  const db = dbConPack('esencial');
  sembrarFundamento(db, 1);
  pago.setMedioPago(db, 1, { tipo: 'link', url: LINK });
  await facturaEnviada(db, 1, { precio: 100000, fecha: '2026-10-03', vencimiento: '2026-10-17' });
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const t = tarjetasCobranza(db, 1)[0];
  const cobId = cob.listCobranzas(db, 1, { hoy: '2026-10-24' }).cobranzas[0].id;
  gesty.approveCard(db, 1, t.id, { version_documento: t.version_documento, usuario: 'dueno' });
  pago.setMedioPago(db, 1, { tipo: 'alias', alias: ALIAS }); // el medio cambia DESPUÉS del OK
  cob.escanearVencimientos(db, 1, { hoy: '2026-10-24' });
  const antes = emailsCobranza.length;
  await cob.enviarCobranza(db, 1, cobId, {});
  ok('con el envío ya sellado, cambiar el medio no altera lo que sale: viaja el de la tarjeta aprobada',
    emailsCobranza.length === antes + 1 && emailsCobranza[antes].text.includes(LINK) &&
    !emailsCobranza[antes].text.includes('Alias:'), (emailsCobranza[antes] || {}).text);
  db.close();
}

// ---------------- Separación por cuenta ----------------
console.log('— unidad: el medio de una cuenta no existe para otra');
{
  const db = dbConPack('esencial');
  gesty.setPack(db, 2, 'esencial', { origen: 'checkout', actor: 'sistema' });
  sembrarFundamento(db, 1); sembrarFundamento(db, 2);
  pago.setMedioPago(db, 1, { tipo: 'link', url: LINK });
  ok('la cuenta 2 no tiene medio aunque la 1 lo cargó',
    pago.getMedioPago(db, 2).estado === 'sin-cargar' && pago.snapshotActual(db, 2) === null);
  const r = pago.aplicarAlMensaje(db, 2, 'Mensaje de prueba');
  ok('y su render sale sin línea, con el aviso de no cargado',
    r.mensaje === 'Mensaje de prueba' && r.medio_pago === null && r.aviso === pago.AVISO_SIN_MEDIO);
  db.close();
}

// ---------------- Wiring del módulo (sin server.js) ----------------
console.log('— wiring: el módulo no monta rutas; la costura vive en G-05');
{
  const modSrc = fs.readFileSync(path.join(__dirname, 'gesty-cobranzas-pago.js'), 'utf8');
  const cobSrc = fs.readFileSync(path.join(__dirname, 'gesty-cobranzas.js'), 'utf8');
  ok('wiring: el módulo no monta rutas propias (las monta server.js)',
    !modSrc.includes('app.post') && !modSrc.includes('app.get'));
  ok('wiring: G-05 integra el medio SOLO en su render (aplicarAlMensaje en el detalle de la tarjeta)',
    cobSrc.includes("require('./gesty-cobranzas-pago')") && cobSrc.includes('cobranzasPago.aplicarAlMensaje'));
  ok('wiring: el dato usa el grupo/campo que G-25 detecta',
    pago.GRUPO_MEDIO === 'cuentas-medios' && pago.CAMPO_MEDIO === 'medio-pago-cobranzas');
}

// ---------------- HTTP: mini-app con las rutas exactas ----------------
console.log('— http: gating y recorrido sobre mini-app (rutas como las debe montar server.js)');
{
  const express = require('express');
  const dbH = nuevaDb();
  gesty.setPack(dbH, 1, 'esencial', { origen: 'checkout', actor: 'sistema' });
  gesty.setPack(dbH, 3, 'esencial', { origen: 'checkout', actor: 'sistema' });
  // user 2: sin pack (ninguno)

  // La cadena EXACTA que server.js debe usar (la suya, gestyCobMW =
  // [requireAuth, gestyMiddleware, capacidadMiddleware('cobranzas')]),
  // con la sesión de la app reemplazada por una de prueba.
  const sesionPrueba = (req, res, next) => {
    const uid = Number(req.headers['x-user-id'] || 0);
    req.session = uid ? { userId: uid } : {};
    next();
  };
  const requireAuthPrueba = (req, res, next) => {
    if (!req.session || !req.session.userId) return res.status(401).json({ ok: false, error: 'No autenticado' });
    next();
  };
  const MW = [sesionPrueba, requireAuthPrueba, gesty.gestyMiddleware(dbH), gesty.capacidadMiddleware(dbH, 'cobranzas')];
  const app = express();
  app.get('/api/gesty/cobranzas/medio-pago', ...MW, (req, res) => {
    try { res.json({ ok: true, medio: pago.getMedioPago(dbH, req.session.userId) }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  app.post('/api/gesty/cobranzas/medio-pago', ...MW, express.json(), (req, res) => {
    try { res.json({ ok: true, ...pago.setMedioPago(dbH, req.session.userId, req.body || {}) }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  const PORT = 3995;
  const server = await new Promise((resolve) => { const s = app.listen(PORT, () => resolve(s)); });
  const call = async (method, uid, body) => {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/gesty/cobranzas/medio-pago`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(uid ? { 'x-user-id': String(uid) } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    return { status: r.status, data };
  };
  try {
    const sinSesion = await call('GET', 0);
    ok('http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
    const sinPack = await call('GET', 2);
    ok('http: sin pack Gesty → 403', sinPack.status === 403, String(sinPack.status));
    const inicial = await call('GET', 1);
    ok('http: con pack, GET responde «sin-cargar» (la ruta no cae en /:id)',
      inicial.status === 200 && inicial.data.medio && inicial.data.medio.estado === 'sin-cargar',
      JSON.stringify(inicial.data).slice(0, 160));
    const malo = await call('POST', 1, { tipo: 'link', dato: 'link.mercadopago.com.ar/sin-esquema' });
    ok('http: POST de link sin esquema → 400 y nada se guarda',
      malo.status === 400 && (await call('GET', 1)).data.medio.estado === 'sin-cargar',
      JSON.stringify(malo.data).slice(0, 160));
    const bueno = await call('POST', 1, { tipo: 'link', url: LINK });
    ok('http: POST del link válido → 200 con el medio leído de vuelta',
      bueno.status === 200 && bueno.data.medio && bueno.data.medio.tipo === 'link' && bueno.data.medio.linea === `Link de pago: ${LINK}`,
      JSON.stringify(bueno.data).slice(0, 200));
    const otra = await call('GET', 3);
    ok('http: otra cuenta con pack ve SU medio (sin cargar), nunca el ajeno',
      otra.status === 200 && otra.data.medio.estado === 'sin-cargar');
    const apagar = await call('POST', 1, { sin_medio: true });
    ok('http: el dueño puede apagar el medio (elección «sin medio»)',
      apagar.status === 200 && apagar.data.medio.estado === 'sin-medio', JSON.stringify(apagar.data).slice(0, 160));
  } finally {
    await new Promise((r) => server.close(r));
    dbH.close();
  }
}

console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
