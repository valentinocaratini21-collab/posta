#!/usr/bin/env node
// test-gesty-contador.js — G-15 · CONTADOR ALIADO
// Spec: gesty-cola-builds.md G-15 · gesty-build-spec.md §13.1 ·
// gesty-areas-detalle.md §7/§8 · gesty-experiencia-cliente.md §5.
// Cubre: el contador en el fundamento (se aprende una vez; el
// formato preferido ORDENA el paquete y el genérico se DECLARA
// cuando no está definido) · la vara de la experiencia (un mes
// completo cierra y se empaqueta SIN un solo faltante falso) ·
// el paquete durable y versionado (la versión enviada no se
// reescribe; la nueva supera a la que no salió) · EL SELLO: sin
// OK no sale (verificado sobre el LOG de eventos: cero
// «paquete-contador-enviado» sin su aprobación previa), versión
// vieja rechazada y registrada, destinatario cambiado después
// del OK frena el envío, reenvío idempotente · el canal que
// falla no finge (sigue aprobado, queda el evento) · la entrega
// manual registrada con su medio · los pedidos del contador
// como faltantes de primera clase que entran y salen de la
// lista, con el acople tipado para G-18 · separación por
// cuenta · gating (401/403, esencial SIN capacidad «reportes»)
// en HTTP.
// Uso: node test-gesty-contador.js
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
const comp = require('./gesty-comprobantes.js');
const rep = require('./gesty-reportes.js');
const contador = require('./gesty-contador.js');

const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';      // Panadería La Espiga
const CUIT_PROV_A = '30123456781';       // Repuestos del Sur
const CUIT_PROV_B = '30567890127';       // Lubricantes Andina

// El canal de email inyectado: cuenta y guarda cada salida.
let emails = [];
contador.configure({ sendEmail: async (o) => { emails.push(o); return { ok: true, id: 'resend-contador-test' }; } });

function comprobante(db, uid, datos) {
  const r = comp.registrarManual(db, uid, {
    tipo: datos.tipo || 'factura', direccion: datos.direccion,
    emisor_nombre: datos.emisor, emisor_cuit: datos.emisor_cuit,
    receptor_nombre: datos.receptor, receptor_cuit: datos.receptor_cuit,
    numero: datos.numero, fecha: datos.fecha, vencimiento: datos.vencimiento,
    moneda: 'ARS', monto_total: datos.total, monto_neto: datos.neto,
    impuestos: datos.impuestos, clasificacion: datos.clasificacion || 'gasto',
    concepto: datos.concepto || 'Insumos',
  });
  return r.comprobante;
}

function eventosDe(db, uid, tipo) {
  return gesty.listEvents(db, uid, { limit: 5000 }).filter((e) => e.tipo_evento === tipo);
}

(async () => {

// ---------------------------------------------------------------------------
console.log('— unidad: el mes completo de Refrigeración Sosa (septiembre 2026)');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });

gesty.setData(db, 1, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
gesty.setData(db, 1, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
// Calendario fiscal SOLO estructurado (fecha + monto): el mes
// completo no declara ni un faltante fiscal falso.
gesty.setData(db, 1, {
  grupo: 'calendario-fiscal', campo: 'iva',
  valor: { concepto: 'IVA', fecha: '2026-10-20', monto: 5000, moneda: 'ARS' },
  origen: 'dueno', origen_ref: 'puesta-en-marcha', cargado_por: 'dueno',
});

// Todo papel del mes, leído y con sus impuestos discriminados.
const cA = comprobante(db, 1, {
  direccion: 'recibida', tipo: 'factura', emisor: 'Repuestos del Sur', emisor_cuit: CUIT_PROV_A,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: '0001-00000101', fecha: '2026-09-05', total: 121000, neto: 100000,
  impuestos: [{ concepto: 'IVA 21%', monto: 21000 }], clasificacion: 'stock', concepto: 'Repuestos',
});
const cB = comprobante(db, 1, {
  direccion: 'recibida', tipo: 'recibo', emisor: 'Lubricantes Andina', emisor_cuit: CUIT_PROV_B,
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: '0002-00000055', fecha: '2026-09-12', total: 60500, neto: 50000,
  impuestos: [{ concepto: 'IVA 21%', monto: 10500 }], clasificacion: 'gasto', concepto: 'Lubricantes',
});
const cC = comprobante(db, 1, {
  direccion: 'emitida', tipo: 'factura', emisor: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
  receptor: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
  numero: '0001-00000009', fecha: '2026-09-08', total: 48400, neto: 40000,
  impuestos: [{ concepto: 'IVA 21%', monto: 8400 }], clasificacion: 'venta', concepto: 'Service de cámara',
});

// LA VARA, parte 1: el cierre del mes completo no declara
// faltantes — ninguno real y ninguno falso.
const cierre = rep.generarCierre(db, 1, { periodo: '2026-09' });
ok('vara: el cierre del mes completo no declara faltantes', cierre.faltantes.length === 0,
  JSON.stringify(cierre.faltantes.map((f) => f.clave)));

// ---------------------------------------------------------------------------
console.log('— unidad: el contador se aprende una vez (fundamento)');
let perfil = contador.getContador(db, 1);
ok('sin contador cargado: no definido, formato genérico declarado como tal',
  perfil.definido === false && perfil.formato_efectivo === 'generico' && perfil.formato_origen === 'generico-sin-definir');

const errEmail = lanza(() => contador.setContador(db, 1, { email: 'no-es-un-email' }));
ok('email inválido: el fundamento no lo guarda', !!errEmail && /no parece válido/.test(errEmail.message));
const errFormato = lanza(() => contador.setContador(db, 1, { formato_carpeta: 'en-disco' }));
ok('formato fuera de la lista: rechazado en criollo', !!errFormato && /Formato de carpeta inválido/.test(errFormato.message));

perfil = contador.setContador(db, 1, {
  nombre: 'Estudio Contable Pérez', email: 'estudio@contador.example',
  formato_carpeta: 'por-clasificacion', dia_entrega: 5, canal: 'email',
});
ok('contador definido con su formato y su día',
  perfil.definido === true && perfil.email === 'estudio@contador.example'
  && perfil.formato_carpeta === 'por-clasificacion' && perfil.formato_efectivo === 'por-clasificacion'
  && perfil.formato_origen === 'preferido' && perfil.dia_entrega === 5);
ok('cada dato del contador guarda su procedencia en el fundamento',
  !!(perfil.fuente.email && perfil.fuente.email.dato_id && perfil.fuente.formato_carpeta && perfil.fuente.formato_carpeta.dato_id));

// ---------------------------------------------------------------------------
console.log('— unidad: el paquete — formato aplicado, durable y versionado');
const p1 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
ok('paquete v1: nace preparado, con el cierre adentro y el destinatario congelado',
  p1.version === 1 && p1.estado === 'preparado' && p1.cierre_id === cierre.id
  && p1.destinatario.email === 'estudio@contador.example');
// LA VARA, parte 2: el paquete del mes completo sale SIN
// faltantes — ni reales ni falsos.
ok('vara: el paquete del mes completo no trae faltantes', p1.faltantes.length === 0,
  JSON.stringify(p1.faltantes.map((f) => f.clave)));
ok('formato por-clasificacion: grupos recibidas por clase y emitidas aparte, con subtotales',
  p1.formato === 'por-clasificacion' && p1.contenido.grupos.length === 3
  && p1.contenido.grupos[0].clave === 'recibida:stock' && p1.contenido.grupos[0].totales_por_moneda.ARS === 121000
  && p1.contenido.grupos[2].clave === 'emitida:venta',
  JSON.stringify(p1.contenido.grupos.map((g) => g.clave)));
ok('el índice del paquete sigue el orden de SU formato (recibidas primero)',
  JSON.stringify(p1.contenido.indice.map((x) => x.id)) === JSON.stringify([cA.id, cB.id, cC.id]),
  JSON.stringify(p1.contenido.indice.map((x) => x.id)));
const csv1 = contador.paqueteCSV(db, 1, p1.id);
ok('el CSV del paquete baja el índice en el orden del formato',
  csv1.startsWith('fecha;tipo;direccion') && csv1.indexOf('0001-00000101') < csv1.indexOf('0002-00000055'));

const p2 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
ok('rearmar crea la versión 2 y la 1 queda superada (la historia no se reescribe)',
  p2.version === 2 && contador.getPaquete(db, 1, p1.id).estado === 'superado'
  && contador.getPaquete(db, 1, p1.id).contenido.indice.length === 3);
ok('listPaquetes muestra las dos versiones, la vigente primero',
  contador.listPaquetes(db, 1, { periodo: '2026-09' }).map((p) => p.version).join(',') === '2,1');

// ---------------------------------------------------------------------------
console.log('— unidad: EL SELLO — sin OK no sale (verificado sobre el log)');
const errSinOK = await lanzaAsync(() => contador.enviarPaquete(db, 1, p2.id));
ok('enviar sin aprobar: no sale', !!errSinOK && /Sin el OK del dueño no sale/.test(errSinOK.message));
ok('sobre el LOG: cero paquetes enviados y el rechazo registrado',
  eventosDe(db, 1, 'paquete-contador-enviado').length === 0
  && eventosDe(db, 1, 'envio-contador-rechazado-sin-ok').length === 1
  && emails.length === 0);

const apVieja = contador.aprobarPaquete(db, 1, p2.id, { version: 99 });
ok('aprobar con versión vieja: rechazado con su motivo', apVieja.ok === false && apVieja.motivo === 'version-vieja');
ok('el rechazo de la aprobación también queda en el registro',
  eventosDe(db, 1, 'aprobacion-contador-rechazada').length === 1);
const apOk = contador.aprobarPaquete(db, 1, p2.id, { version: 2 });
ok('aprobar la versión vigente: el sello queda', apOk.ok === true && apOk.paquete.estado === 'aprobado');
const apIdem = contador.aprobarPaquete(db, 1, p2.id, { version: 2 });
ok('aprobar de nuevo la misma versión: idempotente, no duplica el acto', apIdem.ok === true && apIdem.idempotente === true);

// El destinatario cambió DESPUÉS del OK: el sello era para otro.
contador.setContador(db, 1, { email: 'otro@contador.example' });
const errDestino = await lanzaAsync(() => contador.enviarPaquete(db, 1, p2.id));
ok('destinatario cambiado después del OK: el envío se frena', !!errDestino && /cambió después de tu OK/.test(errDestino.message) && emails.length === 0);
contador.setContador(db, 1, { email: 'estudio@contador.example' });

const envio = await contador.enviarPaquete(db, 1, p2.id);
ok('con el sello vigente, el paquete sale por el canal de email de la app',
  envio.ok === true && emails.length === 1 && emails[0].to === 'estudio@contador.example'
  && /Carpeta 2026-09/.test(emails[0].subject) && envio.envio.comprobante === 'resend-contador-test');
ok('sobre el LOG: el envío existe, con su aprobación ANTES y su comprobante',
  (() => {
    const evs = gesty.listEvents(db, 1, { limit: 5000 });
    const iAp = evs.findIndex((e) => e.tipo_evento === 'paquete-contador-aprobado' && e.entidad_id === String(p2.id));
    const iEn = evs.findIndex((e) => e.tipo_evento === 'paquete-contador-enviado' && e.entidad_id === String(p2.id));
    return iAp >= 0 && iEn > iAp && evs[iEn].comprobante_externo === 'resend-contador-test';
  })());
const envio2 = await contador.enviarPaquete(db, 1, p2.id);
ok('reenviar lo enviado: idempotente, el email no sale dos veces', envio2.idempotente === true && emails.length === 1);

// La versión ENVIADA no se supera ni se reescribe jamás.
const p3 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
ok('rearmar tras el envío: nace la v3 y la v2 SIGUE enviada (historia intacta)',
  p3.version === 3 && contador.getPaquete(db, 1, p2.id).estado === 'enviado');

// ---------------------------------------------------------------------------
console.log('— unidad: freno, canal fallido y entrega manual');
// NOTA: p3 queda como versión vigente preparada para lo que sigue.

// El canal cae: el paquete sigue aprobado y nada se finge.
contador.aprobarPaquete(db, 1, p3.id, { version: 3 });
contador.configure({ sendEmail: async () => ({ ok: false, error: 'proveedor caído' }) });
const errCanal = await lanzaAsync(() => contador.enviarPaquete(db, 1, p3.id));
ok('canal de email caído: no sale y el paquete SIGUE aprobado',
  !!errCanal && contador.getPaquete(db, 1, p3.id).estado === 'aprobado'
  && eventosDe(db, 1, 'paquete-contador-envio-fallido').length === 1
  && eventosDe(db, 1, 'paquete-contador-enviado').length === 1);
contador.configure({ sendEmail: async (o) => { emails.push(o); return { ok: true, id: 'resend-contador-test' }; } });

// Entrega manual: registrada con su medio, igual que la de email.
const errSinMedio = lanza(() => contador.registrarEntregaManual(db, 1, p3.id, {}));
ok('entrega manual sin medio: no se registra (sin medio no hay entrega)', !!errSinMedio);
const manual = contador.registrarEntregaManual(db, 1, p3.id, { medio: 'lo descargó el dueño y lo mandó desde su casilla' });
ok('entrega manual registrada: el paquete queda entregado-manual con su evento',
  manual.ok === true && manual.paquete.estado === 'entregado-manual'
  && eventosDe(db, 1, 'paquete-contador-entregado-manual').length === 1);

// Frenar: la tarjeta muere — no se aprueba ni sale.
const p4 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
contador.frenarPaquete(db, 1, p4.id, {});
const apFrenada = contador.aprobarPaquete(db, 1, p4.id, { version: 4 });
ok('paquete frenado: no se aprueba', apFrenada.ok === false && apFrenada.motivo === 'paquete-frenado'
  && contador.getPaquete(db, 1, p4.id).estado === 'frenado');

// ---------------------------------------------------------------------------
console.log('— unidad: pedidos del contador — faltantes de primera clase');
const pedido = contador.registrarPedido(db, 1, { periodo: '2026-09', texto: 'Falta el resumen de la tarjeta corporativa del mes' });
ok('el pedido nace abierto y con su evento (actor contador)',
  pedido.estado === 'abierto' && eventosDe(db, 1, 'pedido-contador-registrado').length === 1);

const p5 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
const faltPedido = p5.faltantes.find((f) => f.clave === 'pedido-del-contador');
ok('el paquete siguiente trae el pedido como faltante tipado, con su identidad',
  !!faltPedido && faltPedido.pedido_id === pedido.id && /resumen de la tarjeta/.test(faltPedido.dato_que_falta),
  JSON.stringify(p5.faltantes.map((f) => f.clave)));
const paraDetector = contador.faltantesParaDetector(db, 1, '2026-09');
ok('acople G-18: la lista tipada trae el pedido con su tipo y el cierre de origen',
  paraDetector.cierre_id === cierre.id
  && paraDetector.faltantes.some((f) => f.tipo === 'pedido-contador' && f.pedido_id === pedido.id),
  JSON.stringify(paraDetector.faltantes.map((f) => f.tipo)));

const errResSinNada = lanza(() => contador.resolverPedido(db, 1, pedido.id, {}));
ok('resolver sin papel ni nota: no se resuelve con aire', !!errResSinNada);
// El papel llega: entra como comprobante propio y se vincula.
const cD = comprobante(db, 1, {
  direccion: 'recibida', tipo: 'recibo', emisor: 'Tarjeta Corporativa SA', emisor_cuit: '30666666661',
  receptor: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
  numero: 'RES-2026-09', fecha: '2026-09-20', total: 24200, neto: 20000,
  impuestos: [{ concepto: 'IVA 21%', monto: 4200 }], clasificacion: 'gasto', concepto: 'Resumen de tarjeta',
});
const resuelto = contador.resolverPedido(db, 1, pedido.id, { comprobante_id: cD.id });
ok('el pedido se resuelve con el papel que llegó, vinculado',
  resuelto.estado === 'resuelto' && resuelto.resuelto_con_comprobante_id === cD.id);
const p6 = contador.armarPaquete(db, 1, { periodo: '2026-09' });
ok('resuelto el pedido, el paquete siguiente ya no lo declara faltante',
  !p6.faltantes.some((f) => f.clave === 'pedido-del-contador'));

// ---------------------------------------------------------------------------
console.log('— unidad: el formato genérico se DECLARA (cuenta sin formato)');
contador.setContador(db, 2, { nombre: 'Contadora López', email: 'lopez@contador.example' });
const pU2 = contador.armarPaquete(db, 2, { periodo: '2026-09' });
ok('sin formato definido: sale el genérico y queda DECLARADO en el paquete',
  pU2.formato === 'generico' && pU2.formato_origen === 'generico-sin-definir'
  && pU2.contenido.declaraciones.some((d) => /formato genérico/.test(d)));
contador.setContador(db, 2, { formato_carpeta: 'generico' });
const perfilU2 = contador.getContador(db, 2);
ok('el genérico ELEGIDO a propósito sí es un formato definido (preferido)',
  perfilU2.formato_carpeta === 'generico' && perfilU2.formato_origen === 'preferido');

// ---------------------------------------------------------------------------
console.log('— unidad: separación por cuenta');
ok('el paquete ajeno no se lee', contador.getPaquete(db, 2, p6.id) === null);
const apAjena = contador.aprobarPaquete(db, 2, p6.id, { version: 6 });
ok('aprobar un paquete ajeno: rechazado como ajeno', apAjena.ok === false && apAjena.motivo === 'paquete-ajeno');
const errEnvioAjeno = await lanzaAsync(() => contador.enviarPaquete(db, 2, p6.id));
ok('enviar un paquete ajeno: no sale', !!errEnvioAjeno && eventosDe(db, 2, 'paquete-contador-enviado').length === 0);
ok('los paquetes de cada cuenta son solo suyos',
  contador.listPaquetes(db, 2).every((p) => p.destinatario.email !== 'estudio@contador.example')
  && contador.listPaquetes(db, 1, { periodo: '2026-09' }).length === 6);
const cAjena = comprobante(db, 2, {
  direccion: 'recibida', tipo: 'factura', emisor: 'Proveedor de Otro', emisor_cuit: '30999999999',
  receptor: 'Otro Negocio', receptor_cuit: '20999999999',
  numero: 'X-1', fecha: '2026-09-03', total: 1000, neto: 1000,
  impuestos: [], clasificacion: 'gasto', concepto: 'Ajeno',
});
const pedidoU2 = contador.registrarPedido(db, 2, { periodo: '2026-09', texto: 'Falta un papel de la otra cuenta' });
const errResAjeno = lanza(() => contador.resolverPedido(db, 1, pedidoU2.id, { comprobante_id: cAjena.id }));
ok('resolver el pedido de otra cuenta: no existe para esta cuenta', !!errResAjeno);
const errResConAjeno = lanza(() => contador.resolverPedido(db, 2, pedidoU2.id, { comprobante_id: p6.contenido.indice[0].id }));
ok('resolver con un comprobante ajeno: rechazado', !!errResConAjeno && /no es de esta cuenta/.test(errResConAjeno.message));

// ---------------------------------------------------------------------------
console.log('— unidad: resumen para «La oficina» y limpieza del formato');
const resumen = contador.resumenContador(db, 1, { hoy: '2026-10-15' });
ok('resumen: período sugerido = el mes que cerró, con su último paquete y cero pedidos abiertos',
  resumen.periodo_sugerido === '2026-09' && resumen.paquete_del_periodo.version === 6
  && resumen.pedidos_abiertos === 0 && resumen.contador.definido === true,
  JSON.stringify(resumen.paquete_del_periodo));
contador.setContador(db, 1, { formato_carpeta: null });
const perfilLimpio = contador.getContador(db, 1);
ok('limpiar el formato vuelve al genérico declarado (no queda un formato fantasma)',
  perfilLimpio.formato_carpeta === null && perfilLimpio.formato_efectivo === 'generico'
  && perfilLimpio.formato_origen === 'generico-sin-definir');

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido con el server booteado');
const PORT = 3991;
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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g15-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g15@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/contador', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/contador', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));

  const ponerPack = (pack) => {
    const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
    f.exec('PRAGMA busy_timeout = 5000');
    const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g15@example.com');
    f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, pack);
    f.close();
  };
  ponerPack('esencial');
  const esencial = await call('GET', '/api/gesty/contador', null, reg.cookie);
  ok('gating http: pack esencial SIN capacidad «reportes» → 403', esencial.status === 403, String(esencial.status));

  ponerPack('completa');
  const perfilHttp = await call('GET', '/api/gesty/contador', null, reg.cookie);
  ok('http: el perfil arranca no definido, con el genérico declarado',
    perfilHttp.status === 200 && perfilHttp.data.contador.definido === false
    && perfilHttp.data.contador.formato_origen === 'generico-sin-definir',
    JSON.stringify(perfilHttp.data).slice(0, 200));
  const putHttp = await call('PUT', '/api/gesty/contador', {
    nombre: 'Estudio Contable Pérez', email: 'estudio@contador.example', formato_carpeta: 'por-tipo', dia_entrega: 5,
  }, reg.cookie);
  ok('http: el contador se guarda una vez en el fundamento',
    putHttp.status === 200 && putHttp.data.contador.definido === true && putHttp.data.contador.formato_carpeta === 'por-tipo',
    JSON.stringify(putHttp.data).slice(0, 200));
  const paqHttp = await call('POST', '/api/gesty/contador/paquetes', { periodo: '2026-09' }, reg.cookie);
  ok('http: armar el paquete lo deja preparado (no lo envía)',
    paqHttp.status === 200 && paqHttp.data.paquete.estado === 'preparado' && paqHttp.data.paquete.version === 1
    && paqHttp.data.paquete.formato === 'por-tipo',
    JSON.stringify(paqHttp.data).slice(0, 200));
  const paqId = paqHttp.data.paquete.id;
  const apViejaHttp = await call('POST', `/api/gesty/contador/paquetes/${paqId}/aprobar`, { version: 99 }, reg.cookie);
  ok('http: aprobar con versión vieja → 400 con su motivo',
    apViejaHttp.status === 400 && apViejaHttp.data.motivo === 'version-vieja', JSON.stringify(apViejaHttp.data).slice(0, 160));
  const apHttp = await call('POST', `/api/gesty/contador/paquetes/${paqId}/aprobar`, { version: 1 }, reg.cookie);
  ok('http: el sello del dueño queda sobre la versión vigente',
    apHttp.status === 200 && apHttp.data.paquete.estado === 'aprobado', JSON.stringify(apHttp.data).slice(0, 160));
  const csvRes = await fetch(BASE + `/api/gesty/contador/paquetes/${paqId}/csv`, { headers: { Cookie: reg.cookie } });
  const csvTexto = await csvRes.text();
  ok('http: el CSV del paquete baja como adjunto text/csv (patrón de la casa)',
    csvRes.status === 200 && (csvRes.headers.get('content-type') || '').includes('text/csv') && csvTexto.startsWith('fecha;tipo;direccion'),
    `${csvRes.status} ${csvRes.headers.get('content-type')}`);
  const pedHttp = await call('POST', '/api/gesty/contador/pedidos', { periodo: '2026-09', texto: 'Falta el resumen de la tarjeta del mes' }, reg.cookie);
  ok('http: el pedido del contador nace abierto', pedHttp.status === 200 && pedHttp.data.pedido.estado === 'abierto',
    JSON.stringify(pedHttp.data).slice(0, 160));
  const resHttp = await call('POST', `/api/gesty/contador/pedidos/${pedHttp.data.pedido.id}/resolver`, { nota: 'era el mismo papel ya cargado como recibo' }, reg.cookie);
  ok('http: el pedido se resuelve con su nota', resHttp.status === 200 && resHttp.data.pedido.estado === 'resuelto');
  const resumenHttp = await call('GET', '/api/gesty/contador/resumen?fecha=2026-10-15', null, reg.cookie);
  ok('http: el resumen trae el período sugerido y el paquete vigente',
    resumenHttp.status === 200 && resumenHttp.data.resumen.periodo_sugerido === '2026-09'
    && resumenHttp.data.resumen.paquete_del_periodo.estado === 'aprobado',
    JSON.stringify(resumenHttp.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
