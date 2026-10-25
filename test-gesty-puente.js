#!/usr/bin/env node
// test-gesty-puente.js — G-16 · PUENTE POSTY → GESTY.
// Spec: gesty-cola-builds.md G-16 · gesty-build-spec.md §13.4 ·
// gesty-g02-build-spec.md §11 (interfaz nombrada).
// Cubre la aceptación de la cola: una promo de prueba sobre un
// producto SIN stock genera el aviso de Gesty ANTES de
// publicarse (orden verificado en el registro durable) y sin
// el chequeo la acción NO sale (contrato de salida: sin
// evaluación, bloqueada; con aviso sin enterar, bloqueada; con
// aviso frenado, bloqueada; con aviso enterado, sale registrada
// COMO salida con aviso) · con stock suficiente no hay aviso y
// el chequeo queda registrado · caja comprometida esa semana →
// no cierra con el número (umbral del fundamento) · agenda
// llena ese día → no cierra con el número · «sin-datos» se
// declara y jamás se lee como «cierra» (global «sin-verificar»)
// · el inverso: la semana con vencimiento grande genera UN
// aviso (dedupe por registro, reescanear no duplica, el
// enterado no resucita) · la disciplina del aviso (precedente
// G-15): acuses rechazados registrados, enterado idempotente ·
// la matriz de G-02 intacta (10 tipos, el puente no crea
// tarjetas) · separación por cuenta · gating HTTP (401 sin
// sesión, 403 sin pack y 403 con pack sin la capacidad; la
// cuenta sin pack no genera NI una evaluación).
// Uso: node test-gesty-puente.js
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
const stock = require('./gesty-stock.js');
const agenda = require('./gesty-agenda.js');
const comp = require('./gesty-comprobantes.js');
const puente = require('./gesty-puente.js');

const HOY = '2026-10-21'; // miércoles; su semana: 2026-10-19 → 2026-10-25
function eventosDe(db, uid, tipo) {
  return gesty.listEvents(db, uid, { limit: 5000 }).filter((e) => e.tipo_evento === tipo);
}
function comprobanteRecibido(db, uid, datos) {
  return comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: 'Repuestos del Sur', emisor_cuit: '30123456781',
    receptor_nombre: 'El negocio', receptor_cuit: '20123456786',
    moneda: 'ARS', clasificacion: 'stock', concepto: 'Repuestos',
    ...datos,
  }).comprobante;
}

(async () => {

// ---------------------------------------------------------------------------
console.log('— unidad: montaje (stock real de G-10)');
const db = nuevaDb();
gesty.setPack(db, 1, 'completa', { origen: 'checkout', actor: 'sistema' });
gesty.setPack(db, 2, 'total', { origen: 'checkout', actor: 'sistema' });
const itemComp = stock.crearItem(db, 1, { nombre: 'Compresor 1/4 HP', unidad: 'unidades', minimo: 3 }, { creado_por: 'dueno', hoy: HOY }).item;
stock.registrarMovimiento(db, 1, { item_id: itemComp.id, tipo: 'entrada', cantidad: 2, fecha: HOY }, { hoy: HOY });
const itemFiltro = stock.crearItem(db, 1, { nombre: 'Filtro de aire', unidad: 'unidades', minimo: 1 }, { creado_por: 'dueno', hoy: HOY }).item;
stock.registrarMovimiento(db, 1, { item_id: itemFiltro.id, tipo: 'entrada', cantidad: 20, fecha: HOY }, { hoy: HOY });
ok('montaje: dos ítems con su stock derivado (2 y 20)',
  stock.stockDe(db, 1, itemComp.id) === 2 && stock.stockDe(db, 1, itemFiltro.id) === 20);

// ---------------------------------------------------------------------------
console.log('— unidad: ACEPTACIÓN — la promo sin stock avisa ANTES de salir, y sin enterar no sale');
const ing1 = puente.ingresarAccionComercial(db, 1, {
  titulo: 'Promo 2x1 en compresores', tipo: 'promo', producto_ref: 'Compresor 1/4 HP',
  fecha: '2026-10-23', magnitud: 10,
}, { hoy: HOY, origen_ref: 'posty:post-9001' });
const ev1 = ing1.evaluacion;
ok('la evaluación devuelve el veredicto por pata, con el número y su fuente',
  ev1.veredicto.patas.stock.estado === 'no-cierra'
  && ev1.veredicto.patas.stock.numero.faltan === 8
  && ev1.veredicto.patas.stock.numero.hay === 2
  && /Stock \(G-10\)/.test(ev1.veredicto.patas.stock.fuente)
  && /Faltan 8/.test(ev1.veredicto.patas.stock.detalle),
  JSON.stringify(ev1.veredicto.patas.stock).slice(0, 240));
ok('el veredicto global es «no-cierra» y la acción NO puede salir',
  ev1.veredicto_global === 'no-cierra' && ev1.puede_salir === false && ing1.puede_salir === false);
ok('el aviso de oficina nació con la evaluación (mismo acto, antes de cualquier salida)',
  !!ing1.aviso && ing1.aviso.tipo === 'accion-comercial' && ing1.aviso.estado === 'esperando'
  && ev1.aviso_id === ing1.aviso.id,
  JSON.stringify(ing1.aviso || {}).slice(0, 200));
const evAvisoCreado = eventosDe(db, 1, 'puente-aviso-creado').find((e) => e.entidad_id === String(ing1.aviso.id));
ok('el aviso quedó en el registro durable (sin registro no hay chequeo)',
  !!evAvisoCreado && eventosDe(db, 1, 'puente-accion-evaluada').some((e) => e.entidad_id === String(ev1.id)));
const salidaSinEnterar = puente.registrarSalidaAccion(db, 1, { evaluacion_id: ev1.id, referencia: 'post-9001' });
ok('sin el enterado del dueño, la acción NO sale (contrato del puente)',
  salidaSinEnterar.ok === false && salidaSinEnterar.motivo === 'aviso-sin-enterado',
  JSON.stringify(salidaSinEnterar).slice(0, 200));
const evBloqueo = eventosDe(db, 1, 'puente-salida-bloqueada').pop();
ok('ORDEN EN EL LOG: el aviso nació ANTES del intento de publicación (y el bloqueo quedó registrado)',
  !!evBloqueo && evAvisoCreado.id < evBloqueo.id,
  `aviso=${evAvisoCreado && evAvisoCreado.id} bloqueo=${evBloqueo && evBloqueo.id}`);
const salidaSinChequeo = puente.registrarSalidaAccion(db, 1, { referencia: 'post-fantasma' });
ok('sin chequeo previo, la acción tampoco sale (motivo «sin-chequeo», registrado)',
  salidaSinChequeo.ok === false && salidaSinChequeo.motivo === 'sin-chequeo');
const acuse = puente.reconocerAviso(db, 1, ing1.aviso.id, {});
ok('el dueño se entera: el aviso pasa a «enterado» con su acuse',
  acuse.ok === true && acuse.aviso.estado === 'enterado');
const acuse2 = puente.reconocerAviso(db, 1, ing1.aviso.id, {});
ok('re-enterar el mismo aviso es idempotente', acuse2.ok === true && acuse2.idempotente === true);
const salidaConAviso = puente.registrarSalidaAccion(db, 1, { evaluacion_id: ev1.id, referencia: 'post-9001' });
const evSalio = eventosDe(db, 1, 'puente-accion-salio').pop();
ok('con el aviso enterado, la acción sale — registrada COMO salida con aviso, no como chequeo aprobado',
  salidaConAviso.ok === true && salidaConAviso.con_aviso === true
  && !!evSalio && evSalio.id > evAvisoCreado.id && evSalio.payload.con_aviso === true,
  JSON.stringify(salidaConAviso).slice(0, 200));

// ---------------------------------------------------------------------------
console.log('— unidad: con stock suficiente NO hay aviso, y el chequeo queda registrado');
// Un movimiento de caja chico en la semana para que la pata de
// caja tenga datos (debajo del umbral: la semana NO está cargada).
comprobanteRecibido(db, 1, { numero: '0001-00000101', fecha: '2026-10-20', vencimiento: '2026-10-22', monto_total: 10000, monto_neto: 8264 });
const ing2 = puente.ingresarAccionComercial(db, 1, {
  titulo: 'Promo filtros de aire', tipo: 'promo', producto_ref: 'Filtro de aire',
  fecha: '2026-10-23', magnitud: 5,
}, { hoy: HOY, origen_ref: 'posty:post-9002' });
ok('las tres patas cierran (stock 20 ≥ 5 · agenda libre · caja con $10.000 < umbral $500.000)',
  ing2.evaluacion.veredicto.patas.stock.estado === 'cierra'
  && ing2.evaluacion.veredicto.patas.agenda.estado === 'cierra'
  && ing2.evaluacion.veredicto.patas.caja.estado === 'cierra',
  JSON.stringify(ing2.evaluacion.veredicto.patas).slice(0, 300));
ok('veredicto «cierra»: puede salir y NO nace aviso',
  ing2.evaluacion.veredicto_global === 'cierra' && ing2.puede_salir === true && ing2.aviso === null);
ok('el chequeo quedó registrado aunque no haya aviso (la evaluación está en el log)',
  eventosDe(db, 1, 'puente-accion-evaluada').some((e) => e.entidad_id === String(ing2.evaluacion.id)));
const salidaOk = puente.registrarSalidaAccion(db, 1, { evaluacion_id: ing2.evaluacion.id, referencia: 'post-9002' });
ok('la salida de una acción que cierra se registra sin aviso',
  salidaOk.ok === true && salidaOk.con_aviso === false);

// ---------------------------------------------------------------------------
console.log('— unidad: caja comprometida esa semana → no cierra, con el número');
comprobanteRecibido(db, 1, { numero: '0001-00000102', fecha: '2026-10-21', vencimiento: '2026-10-30', monto_total: 800000, monto_neto: 661157 });
const ing3 = puente.ingresarAccionComercial(db, 1, {
  titulo: 'Campaña de fin de mes', tipo: 'campana', producto_ref: 'Filtro de aire',
  fecha: '2026-10-29', magnitud: 1,
}, { hoy: HOY, origen_ref: 'posty:post-9003' });
const pataCaja3 = ing3.evaluacion.veredicto.patas.caja;
// La semana del 26/10 carga $810.000: los $800.000 que vencen
// el 30/10 + los $10.000 vencidos sin pagar, que el pronóstico
// de G-06 hace caer el primer día de la ventana (su semántica).
ok('la semana del 26/10 ya tiene ARS 810.000 de vencimientos (umbral 500.000): la caja no cierra',
  pataCaja3.estado === 'no-cierra'
  && pataCaja3.numero.por_moneda.ARS.sale === 810000
  && pataCaja3.numero.por_moneda.ARS.umbral_vencimiento === 500000
  && /810\.000/.test(pataCaja3.detalle),
  JSON.stringify(pataCaja3).slice(0, 300));
ok('…y nació su aviso de oficina', !!ing3.aviso && ing3.evaluacion.veredicto_global === 'no-cierra');
// El freno del dueño sobre ESTE aviso frena la acción del todo.
const freno = puente.frenarAviso(db, 1, ing3.aviso.id, { motivo: 'esa semana no vendemos nada' });
ok('frenar el aviso queda registrado con su motivo', freno.ok === true && freno.aviso.estado === 'frenado');
const salidaFrenada = puente.registrarSalidaAccion(db, 1, { evaluacion_id: ing3.evaluacion.id });
ok('con el aviso FRENADO, la acción no sale aunque alguien la publique',
  salidaFrenada.ok === false && salidaFrenada.motivo === 'aviso-frenado');
const reEnterar = puente.reconocerAviso(db, 1, ing3.aviso.id, {});
ok('un aviso frenado ya no se puede enterar (rechazo registrado, disciplina G-15)',
  reEnterar.ok === false && reEnterar.motivo === 'aviso-no-esperando'
  && db.prepare("SELECT COUNT(*) AS n FROM gesty_puente_acuses WHERE aviso_id = ? AND resultado = 'rechazada'").get(ing3.aviso.id).n >= 1);

// ---------------------------------------------------------------------------
console.log('— unidad: agenda llena ese día → no cierra, con el número');
for (const [hora, tituloEv] of [['09:00', 'Entrega de equipo reparado'], ['11:00', 'Visita del proveedor'], ['15:00', 'Cierre de caja con el contador']]) {
  agenda.crearEvento(db, 1, { titulo: tituloEv, tipo: 'entrega', fecha: '2026-10-24', hora, duracion_min: 60, cliente_nombre: 'Cliente', cliente_contacto: 'cliente@example.com' }, { creado_por: 'dueno' });
}
const ing4 = puente.ingresarAccionComercial(db, 1, {
  titulo: 'Promo del sábado', tipo: 'promo', producto_ref: 'Filtro de aire',
  fecha: '2026-10-24', magnitud: 1,
}, { hoy: HOY, origen_ref: 'posty:post-9004' });
const pataAgenda4 = ing4.evaluacion.veredicto.patas.agenda;
ok('el sábado ya tiene 3 compromisos (el máximo por día): la agenda no cierra',
  pataAgenda4.estado === 'no-cierra' && pataAgenda4.numero.compromisos_dia === 3
  && pataAgenda4.numero.max_compromisos_dia === 3,
  JSON.stringify(pataAgenda4).slice(0, 240));

// ---------------------------------------------------------------------------
console.log('— unidad: «sin-datos» se declara y JAMÁS se lee como «cierra»');
const ing5 = puente.ingresarAccionComercial(db, 2, {
  titulo: 'Promo de lanzamiento', tipo: 'promo', producto_ref: 'Producto Que No Existe',
  fecha: '2026-10-23', magnitud: 10,
}, { hoy: HOY, origen_ref: 'posty:post-8001' });
ok('cuenta sin stock ni caja: stock «sin-datos» y caja «sin-datos», con su declaración',
  ing5.evaluacion.veredicto.patas.stock.estado === 'sin-datos'
  && ing5.evaluacion.veredicto.patas.caja.estado === 'sin-datos'
  && /no puede verificar/.test(ing5.evaluacion.veredicto.patas.stock.detalle),
  JSON.stringify(ing5.evaluacion.veredicto.patas).slice(0, 300));
ok('el global es «sin-verificar» (no «cierra»), no puede salir y nace el aviso que lo declara',
  ing5.evaluacion.veredicto_global === 'sin-verificar' && ing5.puede_salir === false
  && !!ing5.aviso && /no lo pudo verificar todo/.test(ing5.aviso.titulo));
const ing6 = puente.ingresarAccionComercial(db, 2, {
  titulo: 'Promo sin producto', tipo: 'promo', fecha: '2026-10-23',
}, { hoy: HOY });
ok('una promo que no declara producto tampoco se verifica (stock «sin-datos», no «no-aplica»)',
  ing6.evaluacion.veredicto.patas.stock.estado === 'sin-datos'
  && /no declara qué producto vende/.test(ing6.evaluacion.veredicto.patas.stock.detalle));

// ---------------------------------------------------------------------------
console.log('— unidad: el INVERSO — la semana con vencimiento grande avisa UNA sola vez');
const esc1 = puente.escanearVencimientosGrandes(db, 1, { hoy: HOY, semanas: 4 });
const vtoGrande = esc1.creados.find((a) => a.tipo === 'vencimiento-grande');
ok('el escaneo detectó la semana del 26/10: ARS 800.000 ≥ umbral 500.000 → un aviso',
  esc1.creados.length === 1 && !!vtoGrande
  && vtoGrande.clave_dedupe === 'vto-grande:2026-10-26:ARS'
  && vtoGrande.detalle.total === 800000 && vtoGrande.detalle.umbral === 500000,
  JSON.stringify(esc1.creados).slice(0, 300));
ok('la semana del 19/10 ($10.000) NO supera el umbral: sin aviso',
  !esc1.semanas.some((s) => s.semana_desde === '2026-10-19' && s.supera));
const esc2 = puente.escanearVencimientosGrandes(db, 1, { hoy: HOY, semanas: 4 });
ok('reescanear NO duplica: 0 creados, 1 existente (dedupe por registro)',
  esc2.creados.length === 0 && esc2.existentes.length === 1
  && puente.listAvisos(db, 1, { tipo: 'vencimiento-grande', solo_pendientes: false }).total === 1);
puente.reconocerAviso(db, 1, vtoGrande.id, {});
const esc3 = puente.escanearVencimientosGrandes(db, 1, { hoy: HOY, semanas: 4 });
ok('el aviso enterado NO resucita en el escaneo siguiente',
  esc3.creados.length === 0 && esc3.existentes.length === 1);
const escU2 = puente.escanearVencimientosGrandes(db, 2, { hoy: HOY, semanas: 4 });
ok('separación por cuenta: la cuenta 2 no tiene vencimientos ni avisos del inverso',
  escU2.creados.length === 0 && puente.listAvisos(db, 2, { solo_pendientes: false }).total === 2,
  `avisos U2: ${puente.listAvisos(db, 2, { solo_pendientes: false }).total}`);

// ---------------------------------------------------------------------------
console.log('— unidad: la disciplina del aviso y la matriz intacta');
const ajeno = puente.reconocerAviso(db, 2, ing1.aviso.id, {});
ok('enterar un aviso AJENO se rechaza y queda en la tabla de acuses',
  ajeno.ok === false && ajeno.motivo === 'aviso-ajeno'
  && db.prepare("SELECT COUNT(*) AS n FROM gesty_puente_acuses WHERE aviso_id = ? AND accion = 'enterado' AND resultado = 'rechazada'").get(ing1.aviso.id).n === 1);
ok('la matriz de G-02 sigue cerrada en 10 tipos (el puente NO agregó un tipo 11)',
  gesty.MATRIX_TIPOS.length === 10);
ok('el puente no creó NI una tarjeta de la bandeja: su aviso vive en su módulo (precedente G-15)',
  db.prepare('SELECT COUNT(*) AS n FROM gesty_cards WHERE user_id IN (1, 2)').get().n === 0);
const cfg2 = puente.getConfig(db, 2);
ok('la config nace con los defaults DECLARADOS (umbral ARS 500.000, es_default)',
  cfg2.es_default === true && cfg2.umbrales_vencimiento.ARS === 500000 && cfg2.max_compromisos_dia === 3);
const errCfg = lanza(() => puente.setConfig(db, 2, { umbrales_vencimiento: { ARS: -5 } }));
ok('un umbral inválido se rechaza en voz alta', !!errCfg && /mayor que cero/.test(errCfg.message));
puente.setConfig(db, 2, { umbrales_vencimiento: { ARS: 900000 } });
ok('el dueño puede fijar su umbral en el fundamento (queda como su regla)',
  puente.getConfig(db, 2).umbrales_vencimiento.ARS === 900000 && puente.getConfig(db, 2).es_default === false);
const resumen = puente.resumenPuente(db, 1, { hoy: HOY });
ok('el resumen para «La oficina» trae los avisos pendientes y las últimas evaluaciones',
  resumen.avisos_pendientes >= 1 && resumen.ultimas_evaluaciones.length >= 4,
  `pendientes=${resumen.avisos_pendientes} evals=${resumen.ultimas_evaluaciones.length}`);

// ---------------------------------------------------------------------------
console.log('— http: gating y recorrido con el server booteado');
const PORT = 3989;
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

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g16-'));
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

  const reg = await call('POST', '/api/auth/register', { email: 'g16@example.com', password: 'secreto1' });
  ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
  const sinSesion = await call('GET', '/api/gesty/puente/resumen', null, '');
  ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
  const sinPack = await call('GET', '/api/gesty/puente/resumen', null, reg.cookie);
  ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
  const ingSinPack = await call('POST', '/api/gesty/puente/acciones', {
    accion: { titulo: 'Promo fantasma', tipo: 'promo', producto_ref: 'Compresor 1/4 HP', fecha: '2026-10-23', magnitud: 10 }, hoy: HOY,
  }, reg.cookie);
  ok('gating http: ingresar una acción sin pack → 403 (la acción ni se evalúa)',
    ingSinPack.status === 403, String(ingSinPack.status));
  const ponerPack = (pack) => {
    const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
    f.exec('PRAGMA busy_timeout = 5000');
    const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g16@example.com');
    f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, pack);
    f.close();
    return u.id;
  };
  ponerPack('esencial');
  const esencial = await call('GET', '/api/gesty/puente/resumen', null, reg.cookie);
  ok('gating http: pack esencial SIN capacidad «stock» → 403', esencial.status === 403, String(esencial.status));
  const uidHttp = ponerPack('completa');
  // CERO EFECTOS de la cuenta sin pack: ni una evaluación suya
  // en la base del server booteado.
  const fdb = new DatabaseSync(path.join(dataDir, 'posta.db'));
  const hayTabla = fdb.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'gesty_puente_evaluaciones'").get().n === 1;
  const evalsSinPack = hayTabla ? fdb.prepare('SELECT COUNT(*) AS n FROM gesty_puente_evaluaciones WHERE user_id = ?').get(uidHttp).n : 0;
  fdb.close();
  ok('cuenta sin pack = cero efectos: ninguna evaluación registrada a su nombre',
    evalsSinPack === 0, `hayTabla=${hayTabla} evals=${evalsSinPack}`);

  // El recorrido completo por HTTP: ítem + entrada por la API
  // de stock, y la promo que no cierra por el puente.
  const itemHttp = await call('POST', '/api/gesty/stock/items', { nombre: 'Compresor 1/4 HP', unidad: 'unidades', minimo: 1 }, reg.cookie);
  ok('http: el ítem de stock se crea por su API', itemHttp.status === 200 && !!itemHttp.data.item, JSON.stringify(itemHttp.data).slice(0, 160));
  const movHttp = await call('POST', `/api/gesty/stock/items/${itemHttp.data.item.id}/movimientos`, { tipo: 'entrada', cantidad: 2, fecha: HOY }, reg.cookie);
  ok('http: la entrada deja el stock derivado en 2', movHttp.status === 200 && movHttp.data.stock === 2, JSON.stringify(movHttp.data).slice(0, 160));
  const ingHttp = await call('POST', '/api/gesty/puente/acciones', {
    accion: { titulo: 'Promo 2x1 en compresores', tipo: 'promo', producto_ref: 'Compresor 1/4 HP', fecha: '2026-10-23', magnitud: 10 },
    hoy: HOY, origen_ref: 'posty:post-http-1',
  }, reg.cookie);
  ok('http: la ingesta evalúa y el aviso nace en la misma respuesta (antes de salir)',
    ingHttp.status === 200 && ingHttp.data.puede_salir === false
    && ingHttp.data.evaluacion.veredicto.patas.stock.numero.faltan === 8
    && !!ingHttp.data.aviso && ingHttp.data.aviso.estado === 'esperando',
    JSON.stringify(ingHttp.data).slice(0, 300));
  const evalHttpId = ingHttp.data.evaluacion.id;
  const avisoHttpId = ingHttp.data.aviso.id;
  const salidaHttp = await call('POST', `/api/gesty/puente/acciones/${evalHttpId}/salida`, { referencia: 'post-http-1' }, reg.cookie);
  ok('http: la salida sin enterar → 400 «aviso-sin-enterado» (no sale)',
    salidaHttp.status === 400 && salidaHttp.data.motivo === 'aviso-sin-enterado', JSON.stringify(salidaHttp.data).slice(0, 200));
  const entHttp = await call('POST', `/api/gesty/puente/avisos/${avisoHttpId}/enterado`, {}, reg.cookie);
  ok('http: el enterado del dueño queda registrado', entHttp.status === 200 && entHttp.data.aviso.estado === 'enterado', JSON.stringify(entHttp.data).slice(0, 200));
  const salidaHttp2 = await call('POST', `/api/gesty/puente/acciones/${evalHttpId}/salida`, { referencia: 'post-http-1' }, reg.cookie);
  ok('http: con el aviso enterado, la salida se registra (con_aviso)',
    salidaHttp2.status === 200 && salidaHttp2.data.con_aviso === true, JSON.stringify(salidaHttp2.data).slice(0, 200));
  const avisosHttp = await call('GET', '/api/gesty/puente/avisos', null, reg.cookie);
  ok('http: la lista de avisos pendientes ya no trae el enterado',
    avisosHttp.status === 200 && avisosHttp.data.total === 0, JSON.stringify(avisosHttp.data).slice(0, 160));
  const escHttp = await call('POST', '/api/gesty/puente/escanear-vencimientos', { hoy: HOY, semanas: 4 }, reg.cookie);
  ok('http: el escaneo inverso corre (sin vencimientos en esta cuenta: 0 avisos)',
    escHttp.status === 200 && escHttp.data.creados.length === 0, JSON.stringify(escHttp.data).slice(0, 200));
} finally {
  child.kill('SIGKILL');
}
console.log(`\n${passed} ✓ · ${failed} ✗`);
process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
