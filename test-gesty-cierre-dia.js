#!/usr/bin/env node
// test-gesty-cierre-dia.js — G-21 · CIERRE DEL DÍA + RUTINA DIARIA.
// Spec: gesty-cola-builds.md G-21 (aceptación: «El resumen de un
// día de prueba coincide ítem por ítem con el registro; día sin
// novedades = mensaje corto honesto, nunca relleno»).
// Cubre: el día sembrado con actividad — papeles que entraron
// (G-03, por su marca de ingesta), cobro registrado (G-04), lo
// que vence mañana (agenda compuesta G-09: factura, obligación y
// turno, cada uno con su fuente), el arrastre de vencidas, lo que
// espera OK (la bandeja contada, por tipo) y la foto de caja
// (entró real del día + proyección de 7 días de G-06 con su
// número exacto) · día vacío → el texto honesto, sin relleno
// (aserción sobre el texto) · regenerar = versión nueva declarada,
// la anterior queda en el historial, UNA vigente · el cierre y su
// entrega NO aprueban ni envían nada (verificado sobre el
// registro y la bandeja) · la entrega por push registra la
// entrega REAL (enviado / sin-entrega / desactivado) · la rutina
// corre los cinco escaneos en orden y un escaneo que falla se
// declara sin frenar a los demás · separación por cuenta ·
// gating HTTP (401 / 403 sin pack / 403 Esencial sin «reportes»
// / 200 Completa).
// Uso: node test-gesty-cierre-dia.js
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
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 240) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');

const gesty = require('./gesty.js');
const fact = require('./gesty-facturacion.js');
const comp = require('./gesty-comprobantes.js');
const cob = require('./gesty-cobranzas.js');
const agenda = require('./gesty-agenda.js');
const booking = require('./booking.js');
const cierreDia = require('./gesty-cierre-dia.js');
const concMod = require('./gesty-conciliacion.js');

const HOY = '2026-10-21';
const MANANA = '2026-10-22';
const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';   // Panadería La Espiga
const CUIT_PROVEEDOR = '30712345671'; // Distribuidora Sur

fact.configure({ sendEmail: async () => ({ ok: true, id: 'resend-fact-test' }) });
cob.configure({ sendEmail: async () => ({ ok: true, id: 'resend-cob-test' }) });

// Push falso para los recordatorios de G-09 (autopilot de la matriz)
const pushesAgenda = [];
agenda.configure({ notify: async (uid, payload) => { pushesAgenda.push(payload); return { ok: true }; } });
// Push falso para la entrega del cierre
let pushesCierre = [];
let cierrePushFalla = false;
cierreDia.configure({
  notify: async (uid, payload) => {
    if (cierrePushFalla) return { ok: false, reason: 'no_subs' };
    pushesCierre.push(payload);
    return { ok: true };
  },
});

function sembrarFundamento(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_CLIENTE}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_CLIENTE, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}

async function facturaEnviada(db, uid, datos) {
  const f = fact.crearBorrador(db, uid, {
    cliente: { cuit: CUIT_CLIENTE },
    items: [{ descripcion: datos.concepto || 'Service de cámara', cantidad: 1, precio_unitario: datos.precio, alicuota_iva: 0 }],
    fecha: datos.fecha, vencimiento: datos.vencimiento,
  });
  const p = fact.pedirOK(db, uid, f.id);
  const ap = gesty.approveCard(db, uid, p.tarjeta.id, { version_documento: p.tarjeta.version_documento, usuario: 'dueno' });
  assert(ap.ok, 'la aprobación de emisión tiene que salir');
  const r = await fact.enviarFactura(db, uid, f.id, { canal: 'whatsapp-manual', comprobante: 'wa-factura', destinatario: 'Panadería La Espiga' });
  return r.factura;
}

// El día con actividad: 2 papeles que entran hoy, 1 cobro de hoy,
// mañana vencen factura + obligación + turno, hay una factura
// vencida abierta (arrastre) y 2 tarjetas esperando el OK.
async function sembrarActividad(db, uid) {
  sembrarFundamento(db, uid);
  // Papeles que entran HOY (su marca de ingesta se fija al día
  // sembrado: en producción created_at es el instante real).
  const pRecibida = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: 'Distribuidora Sur', emisor_cuit: CUIT_PROVEEDOR,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: '0002-00004510', fecha: '2026-10-20', vencimiento: MANANA,
    moneda: 'ARS', monto_total: 184500, monto_neto: 152479, concepto: 'Repuestos de refrigeración',
  }).comprobante;
  const pEmitida = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'emitida',
    emisor_nombre: 'Refrigeración Sosa', emisor_cuit: CUIT_PROPIO,
    receptor_nombre: 'Panadería La Espiga', receptor_cuit: CUIT_CLIENTE,
    numero: '0001-00000101', fecha: HOY, vencimiento: '2026-10-28',
    moneda: 'ARS', monto_total: 96000, monto_neto: 96000, concepto: 'Service de cámara',
  }).comprobante;
  // Papel de control: entró OTRO día (marca real del sistema) —
  // el cierre de HOY no lo cuenta.
  comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: 'Distribuidora Sur', emisor_cuit: CUIT_PROVEEDOR,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: '0002-00004480', fecha: '2026-09-20', vencimiento: '2026-10-04',
    moneda: 'ARS', monto_total: 50000, monto_neto: 50000, concepto: 'Repuestos (mes anterior)',
  });
  db.prepare('UPDATE gesty_comprobantes SET created_at = ? WHERE id = ?').run(`${HOY} 09:12:00`, pRecibida.id);
  db.prepare('UPDATE gesty_comprobantes SET created_at = ? WHERE id = ?').run(`${HOY} 11:03:00`, pEmitida.id);

  // Factura que vence MAÑANA, con un cobro parcial registrado HOY
  const fManana = await facturaEnviada(db, uid, { fecha: '2026-10-15', vencimiento: MANANA, precio: 50000 });
  fact.registrarCobro(db, uid, fManana.id, { monto: 20000, fecha: HOY, medio: 'transferencia' });
  // Factura VENCIDA abierta (el arrastre) — su cobranza ya escaneada
  const fVencida = await facturaEnviada(db, uid, { fecha: '2026-10-10', vencimiento: '2026-10-20', precio: 80000, concepto: 'Instalación de cámara' });
  cob.escanearVencimientos(db, uid, { hoy: HOY });
  // Turno de mañana (booking.js guarda starts_at en ISO UTC: la
  // semilla va en UTC explícito, como manda su contrato)
  booking.createBooking(db, uid, {
    service: 'Service de cámara', customer_name: 'Panadería La Espiga', customer_contact: 'laespiga@example.com',
    starts_at: `${MANANA}T13:00:00.000Z`, duration_min: 60, autoConfirm: true,
  });
  // Una segunda tarjeta esperando: la emisión de un borrador sin aprobar
  const borrador = fact.crearBorrador(db, uid, {
    cliente: { cuit: CUIT_CLIENTE },
    items: [{ descripcion: 'Mantenimiento mensual', cantidad: 1, precio_unitario: 30000, alicuota_iva: 0 }],
    fecha: HOY, vencimiento: '2026-10-30',
  });
  fact.pedirOK(db, uid, borrador.id);
  return { fManana, fVencida, borrador };
}

(async () => {
// ---------------------------------------------------------------------------
console.log('— config: default declarado y ajuste del dueño');
const dbCfg = nuevaDb();
gesty.initGesty(dbCfg);
const cfgDef = cierreDia.getConfig(dbCfg, 5);
ok('config default declarado: 19:00, activo, es_default', cfgDef.hora === '19:00' && cfgDef.activo === true && cfgDef.es_default === true, JSON.stringify(cfgDef));
const cfgSet = cierreDia.setConfig(dbCfg, 5, { hora: '20:30', activo: false });
ok('config del dueño: se guarda en el fundamento y se relee', cfgSet.hora === '20:30' && cfgSet.activo === false && cfgSet.es_default === false);

// ---------------------------------------------------------------------------
console.log('— el día con actividad: el cierre coincide con el registro');
const db = nuevaDb();
gesty.initGesty(db);
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
const sem = await sembrarActividad(db, 1);
const cierre1 = cierreDia.generarCierre(db, 1, { hoy: HOY });
ok('cierre generado: fecha del reloj inyectable, versión 1', cierre1.fecha === HOY && cierre1.version === 1, JSON.stringify({ f: cierre1.fecha, v: cierre1.version }));
const c = cierre1.contenido;
ok('entró: 2 papeles hoy (el de control, de otro día, NO cuenta), los 2 leídos',
  c.entro.papeles.cantidad === 2 && c.entro.papeles.leidos === 2, JSON.stringify(c.entro.papeles));
ok('entró: el monto de los papeles por moneda es el de los papeles (184.500 + 96.000)',
  c.entro.papeles.por_moneda.ARS && c.entro.papeles.por_moneda.ARS.monto === 280500, JSON.stringify(c.entro.papeles.por_moneda));
ok('entró: 1 cobro registrado hoy por ARS 20.000, citado a su factura',
  c.entro.cobros.cantidad === 1 && c.entro.cobros.por_moneda.ARS === 20000
  && c.entro.cobros.items[0].factura_id === sem.fManana.id, JSON.stringify(c.entro.cobros));
ok('entró: sin pagos a proveedores hoy (declarado en cero, no inventado)',
  c.entro.pagos_proveedores.cantidad === 0 && !c.entro.pagos_proveedores.por_moneda.ARS);
ok('mañana: 3 compromisos — factura, obligación y turno — cada uno con su tipo',
  c.manana.cantidad === 3 && c.manana.por_tipo['vencimiento-factura'] === 1
  && c.manana.por_tipo['pago-proveedor'] === 1 && c.manana.por_tipo['turno'] === 1,
  JSON.stringify(c.manana.por_tipo));
const itemFacManana = c.manana.items.find((i) => i.tipo === 'vencimiento-factura');
ok('mañana: la factura entra por su SALDO (50.000 − 20.000 cobrados) y cita Facturación',
  !!itemFacManana && itemFacManana.monto === 30000 && itemFacManana.fuente.area === 'facturacion',
  JSON.stringify(itemFacManana || {}));
ok('arrastre: 1 factura vencida abierta y 1 obligación vencida (la del papel de control, vencido el 4/10 y sin pagar — aparte de «mañana»)',
  c.arrastre.facturas_vencidas === 1 && c.arrastre.obligaciones_vencidas === 1, JSON.stringify(c.arrastre));
ok('espera OK: 2 tarjetas — 1 cobranza y 1 factura-emision — con sus ids',
  c.espera_ok.total === 2 && c.espera_ok.por_tipo.cobranza.cantidad === 1
  && c.espera_ok.por_tipo['factura-emision'].cantidad === 1, JSON.stringify(c.espera_ok.por_tipo));
ok('caja: entró hoy ARS 20.000 (el cobro) y no salió nada por proveedores',
  c.caja.entro_hoy.ARS === 20000 && !c.caja.salio_hoy.ARS, JSON.stringify({ e: c.caja.entro_hoy, s: c.caja.salio_hoy }));
const proy = c.caja.proyeccion_7d && c.caja.proyeccion_7d.por_moneda.ARS;
ok('caja: la proyección de G-06 da el número exacto (entra 110.000; sale 234.500 = 184.500 de mañana + 50.000 de la obligación vencida del papel de control; queda −124.500)',
  !!proy && proy.entra === 110000 && proy.sale === 234500 && proy.queda === -124500, JSON.stringify(proy || {}));
ok('caja: el primer día negativo es mañana y el saldo inicial se declara SIN registro (null)',
  !!proy && proy.primer_dia_negativo === MANANA && proy.saldo_inicial === null, JSON.stringify(proy || {}));
ok('el día no es «vacío» y el texto nombra los hechos (sin felicitaciones)',
  c.vacio === false && /Entraron 2 papel\(es\)/.test(cierre1.texto) && /tu OK/.test(cierre1.texto)
  && !/felicit|buen trabajo|genial|increíble/i.test(cierre1.texto), cierre1.texto);

// ---------------------------------------------------------------------------
console.log('— regenerar: versión nueva declarada, historial íntegro');
const pendientesAntes = gesty.countPending(db, 1);
const cierre2 = cierreDia.generarCierre(db, 1, { hoy: HOY });
ok('regenerar crea la versión 2 de la MISMA fecha', cierre2.version === 2 && cierre2.fecha === HOY);
ok('getCierre devuelve la vigente (la última)', cierreDia.getCierre(db, 1, HOY).version === 2);
const histTodas = cierreDia.listCierres(db, 1, { todas_las_versiones: true });
ok('el historial guarda las 2 versiones y solo la última es vigente',
  histTodas.cierres.length === 2 && histTodas.cierres[0].es_vigente === true && histTodas.cierres[1].es_vigente === false,
  JSON.stringify(histTodas.cierres.map((x) => [x.version, x.es_vigente])));
ok('la vista por defecto trae UNA fila por día (la vigente)',
  cierreDia.listCierres(db, 1, {}).cierres.length === 1);
const evGen = gesty.listEvents(db, 1, { entidad_tipo: 'cierre-dia', entidad_id: HOY }).filter((e) => e.tipo_evento === 'cierre-dia-generado');
ok('cada generación quedó en el registro durable (2 eventos, con su versión)',
  evGen.length === 2 && evGen[1].payload.version === 2 && evGen[1].payload.reemplaza_version === 1);

// ---------------------------------------------------------------------------
console.log('— el cierre no aprueba ni envía nada; la entrega registra la verdad');
ok('generar el cierre no tocó la bandeja (siguen las 2 esperando)',
  gesty.countPending(db, 1) === pendientesAntes
  && gesty.listCards(db, 1, {}).every((t) => t.estado === 'esperando' || t.estado === 'devuelta'));
pushesCierre = [];
const ent1 = await cierreDia.entregarCierre(db, 1, { hoy: HOY });
ok('entrega por push: salió y quedó registrada como «enviado» en la fila',
  ent1.entregado === true && ent1.entrega === 'enviado' && ent1.cierre.entrega.estado === 'enviado'
  && pushesCierre.length === 1 && pushesCierre[0].title === 'Gesty · Cierre del día',
  JSON.stringify({ e: ent1.entrega, n: pushesCierre.length }));
cierrePushFalla = true;
const ent2 = await cierreDia.entregarCierre(db, 1, { hoy: HOY });
ok('canal caído: la entrega se registra «sin-entrega:no_subs» — jamás se finge',
  ent2.entregado === false && ent2.entrega === 'sin-entrega:no_subs' && ent2.cierre.entrega.estado === 'sin-entrega:no_subs');
cierrePushFalla = false;
cierreDia.setConfig(db, 1, { activo: false });
const ent3 = await cierreDia.entregarCierre(db, 1, { hoy: HOY });
ok('cierre desactivado por el dueño: no se entrega y el motivo queda dicho',
  ent3.entregado === false && ent3.motivo === 'cierre-desactivado' && pushesCierre.length === 1);
cierreDia.setConfig(db, 1, { activo: true });
ok('después de entregar, la bandeja sigue intacta (ninguna tarjeta se aprobó sola)',
  gesty.countPending(db, 1) === pendientesAntes
  && !gesty.listEvents(db, 1, { limit: 5000 }).some((e) => e.tipo_evento === 'tarjeta-aprobada' && e.entidad_tipo === 'cierre-dia'));

// ---------------------------------------------------------------------------
console.log('— día vacío: mensaje corto y honesto, jamás relleno');
const dbVacia = nuevaDb();
gesty.initGesty(dbVacia);
const cierreVacio = cierreDia.generarCierre(dbVacia, 9, { hoy: HOY });
const cv = cierreVacio.contenido;
ok('día vacío: todos los conteos en cero y la marca «vacio» puesta',
  cv.vacio === true && cv.entro.papeles.cantidad === 0 && cv.manana.cantidad === 0 && cv.espera_ok.total === 0);
ok('día vacío: el texto dice la verdad en corto («no entró ningún papel nuevo»)',
  cierreVacio.texto.toLowerCase().includes('no entró ningún papel nuevo')
  && cierreVacio.texto.includes('Mañana no vence nada')
  && cierreVacio.texto.toLowerCase().includes('nada espera tu ok'), cierreVacio.texto);
ok('día vacío: CERO relleno (sin felicitaciones ni frases de ánimo inventadas)',
  !/felicit|buen trabajo|genial|increíble|bravo|a seguir/i.test(cierreVacio.texto), cierreVacio.texto);
ok('día vacío: la proyección no inventa monedas (por_moneda vacío, con su cobertura)',
  Object.keys(cv.caja.proyeccion_7d.por_moneda).length === 0 && Array.isArray(cv.caja.proyeccion_7d.cobertura));

// ---------------------------------------------------------------------------
console.log('— separación por cuenta y resumen de La oficina');
const cierreAjena = cierreDia.generarCierre(db, 2, { hoy: HOY });
ok('cuenta 2 no ve la actividad de la 1: su cierre del mismo día es el vacío honesto',
  cierreAjena.contenido.vacio === true && cierreAjena.contenido.entro.papeles.cantidad === 0);
const resOfi = cierreDia.resumenCierreDia(db, 1, { hoy: HOY });
ok('resumen de La oficina: cierre de hoy existe (versión vigente), entrega registrada, OK al día',
  resOfi.cierre_de_hoy.existe === true && resOfi.cierre_de_hoy.version === 2 && resOfi.espera_ok_ahora === 2,
  JSON.stringify(resOfi.cierre_de_hoy));

// ---------------------------------------------------------------------------
console.log('— la rutina diaria: los cinco escaneos, y un fallo no frena a los demás');
const dbR = nuevaDb();
gesty.initGesty(dbR);
gesty.setPack(dbR, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
await sembrarActividad(dbR, 1);
pushesAgenda.length = 0;
const pendientesRutinaAntes = gesty.countPending(dbR, 1);
const concReal = concMod.conciliar;
concMod.conciliar = () => { throw new Error('fuente de conciliación caída (stub del test)'); };
const rut1 = await cierreDia.correrRutinaDiaria(dbR, 1, { hoy: HOY });
concMod.conciliar = concReal;
ok('rutina con un escaneo caído: ok=false y los 5 pasos están, en orden',
  rut1.ok === false && rut1.pasos.length === 5
  && rut1.pasos.map((p) => p.paso).join(',') === 'recordatorios-agenda,vencimientos-cobranzas,huecos,patrones-aprendidos,conciliacion',
  JSON.stringify(rut1.pasos.map((p) => [p.paso, p.estado])));
ok('el paso caído se declara con su motivo; los otros cuatro corrieron',
  rut1.pasos[4].estado === 'error' && /caída/.test(rut1.pasos[4].detalle || '')
  && rut1.pasos.slice(0, 4).every((p) => p.estado === 'ok'), JSON.stringify(rut1.pasos[4]));
ok('recordatorios (autopilot G-09): se emitieron los 3 de la ventana (los de mañana)',
  rut1.pasos[0].resultado.emitidos === 3 && pushesAgenda.length === 3, JSON.stringify(rut1.pasos[0].resultado));
const rut2 = await cierreDia.correrRutinaDiaria(dbR, 1, { hoy: HOY });
ok('rutina sana: ok=true y los recordatorios NO se duplican (ya_emitidos=3)',
  rut2.ok === true && rut2.pasos[0].resultado.emitidos === 0 && rut2.pasos[0].resultado.ya_emitidos === 3,
  JSON.stringify(rut2.pasos[0].resultado));
const evRut = gesty.listEvents(dbR, 1, { entidad_tipo: 'cierre-dia', entidad_id: HOY }).filter((e) => e.tipo_evento === 'rutina-diaria');
ok('cada corrida de la rutina quedó en el registro durable con el resultado por paso',
  evRut.length === 2 && evRut[0].payload.pasos.length === 5 && evRut[0].payload.pasos[4].estado === 'error');
ok('la rutina no aprobó nada: la bandeja quedó como estaba (los escaneos preparan, el dueño decide)',
  gesty.countPending(dbR, 1) === pendientesRutinaAntes
  && gesty.listCards(dbR, 1, {}).every((t) => t.estado === 'esperando' || t.estado === 'devuelta'),
  `antes=${pendientesRutinaAntes} ahora=${gesty.countPending(dbR, 1)}`);

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido mínimo');
const PORT = 3983;
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
  const sid = setC.map((x) => x.split(';')[0]).filter((x) => x.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, cookie: sid, texto };
}
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g21-'));
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
  const reg = await call('POST', '/api/auth/register', { email: 'g21@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/cierre-dia/resumen', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/cierre-dia/resumen', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f.exec('PRAGMA busy_timeout = 5000');
  const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g21@example.com');
  f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'esencial');
  f.close();
  const esencial = await call('GET', '/api/gesty/cierre-dia/resumen', null, reg.cookie);
  ok('gating http: pack Esencial NO trae la capacidad «reportes» → 403', esencial.status === 403, String(esencial.status));
  const f2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
  f2.exec('PRAGMA busy_timeout = 5000');
  f2.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'completa');
  f2.close();
  const resumenHttp = await call('GET', '/api/gesty/cierre-dia/resumen?hoy=2026-10-21', null, reg.cookie);
  ok('http: con pack Completa el resumen responde 200 (sin cierre todavía: honesto)',
    resumenHttp.status === 200 && resumenHttp.data.resumen.cierre_de_hoy.existe === false,
    JSON.stringify(resumenHttp.data).slice(0, 220));
  const genHttp = await call('POST', '/api/gesty/cierre-dia/generar', { hoy: '2026-10-21' }, reg.cookie);
  ok('http: generar el cierre del día vacío responde con su texto honesto',
    genHttp.status === 200 && genHttp.data.cierre.version === 1
    && genHttp.data.cierre.texto.toLowerCase().includes('no entró ningún papel nuevo'),
    JSON.stringify(genHttp.data).slice(0, 220));
  const getHttp = await call('GET', '/api/gesty/cierre-dia/2026-10-21', null, reg.cookie);
  ok('http: el cierre generado se lee por fecha', getHttp.status === 200 && getHttp.data.cierre.fecha === '2026-10-21');
  const rutHttp = await call('POST', '/api/gesty/cierre-dia/rutina', { hoy: '2026-10-21' }, reg.cookie);
  ok('http: la rutina corre los 5 escaneos sobre la cuenta vacía y declara ok',
    rutHttp.status === 200 && rutHttp.data.rutina.ok === true && rutHttp.data.rutina.pasos.length === 5,
    JSON.stringify(rutHttp.data).slice(0, 260));
  const histHttp = await call('GET', '/api/gesty/cierre-dia/historial', null, reg.cookie);
  ok('http: el historial trae el cierre generado', histHttp.status === 200 && histHttp.data.cierres.length === 1);
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
