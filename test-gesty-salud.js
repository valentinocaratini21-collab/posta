#!/usr/bin/env node
// test-gesty-salud.js — G-24 · SALUD ADMINISTRATIVA («La oficina»).
// Spec: gesty-cola-builds.md G-24 + gesty-experiencia-cliente.md §5
// (las varas que este panel mide).
// Cubre: el panel compuesto con indicadores exactos contra la
// siembra, cruzados por SQL directo (papeles 60% con su fórmula:
// 6 leídos / (8 ingresados + 2 huecos); la revisión y los huecos
// bajan el número, citados) · cobranzas al día FALSO con una
// vencida impaga (y su foto anterior reconstruida por fecha de
// pagos: tendencia «empeora» con base) · huecos con tendencia
// «sin base» y luego con base · la vara de datos a mano (semana 1
// con 4 = cumple; con 6 = no cumple, declarado; semana 2: la vara
// ya no aplica) · para tu OK por tipo · precios / conciliación /
// reservas / buzón desde sus registros · fuente caída = indicador
// no disponible con motivo y el resto del panel vivo · cuenta sin
// una capacidad = ese indicador no disponible, NO un cero ·
// la foto durable versionada (congela el contenido; la nueva es
// versión nueva y la anterior queda) · separación por cuenta ·
// gating HTTP (401 / 403 sin pack / 403 Esencial sin «reportes» /
// 200 Completa).
// Uso: node test-gesty-salud.js
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
const huecosMod = require('./gesty-huecos.js');
const preciosMod = require('./gesty-precios.js');
const concMod = require('./gesty-conciliacion.js');
const reservasMod = require('./gesty-reservas-canal.js');
const buzonMod = require('./gesty-buzon.js');
const salud = require('./gesty-salud.js');

const HOY = '2026-10-21';
// Ventana de 30 días: actual [2026-09-22 .. 2026-10-21] · anterior [2026-08-23 .. 2026-09-21]
const CUIT_PROPIO = '20123456786';
const CUIT_CLIENTE = '27234567891';
const CUIT_PROVEEDOR = '30712345671';

fact.configure({ sendEmail: async () => ({ ok: true, id: 'resend-fact-test' }) });

function sembrarFundamento(db, uid) {
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Refrigeración Sosa', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, uid, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_CLIENTE}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_CLIENTE, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
}

// Un papel real de G-03 con su marca de ingesta y su estado de
// lectura fijados por SQL (la siembra manda sobre el registro,
// como en la suite de G-21: el panel lee esos campos).
let nroPapel = 4500;
function papel(db, uid, ingreso, estado) {
  nroPapel++;
  const c = comp.registrarManual(db, uid, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: 'Distribuidora Sur', emisor_cuit: CUIT_PROVEEDOR,
    receptor_nombre: 'Refrigeración Sosa', receptor_cuit: CUIT_PROPIO,
    numero: `0002-0000${nroPapel}`, fecha: ingreso, vencimiento: ingreso,
    moneda: 'ARS', monto_total: 10000, monto_neto: 10000, concepto: 'Repuestos',
  }).comprobante;
  db.prepare('UPDATE gesty_comprobantes SET created_at = ?, estado_lectura = ? WHERE id = ?')
    .run(`${ingreso} 09:00:00`, estado, c.id);
  return c;
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

(async () => {
  const db = nuevaDb();
  const U = 1;
  gesty.setPack(db, U, 'completa', { origen: 'test' });
  sembrarFundamento(db, U);
  // Vida de la cuenta desde el 2026-10-01 (el fundamento manda):
  // con hoy=2026-10-21 la cuenta está en su semana 3.
  db.prepare("UPDATE gesty_foundation SET created_at = '2026-10-01 08:00:00' WHERE user_id = ? AND campo = 'razon_social'").run(U);

  // ---- Papeles: ventana actual 6 leídos + 2 en revisión + 1 duplicado;
  // ---- ventana anterior 4 leídos.
  for (let i = 0; i < 6; i++) papel(db, U, '2026-10-05', 'leido');
  papel(db, U, '2026-10-12', 'necesita-revision');
  papel(db, U, '2026-10-15', 'necesita-revision');
  const dup = papel(db, U, '2026-10-18', 'duplicado');
  db.prepare('UPDATE gesty_comprobantes SET duplicado_de = ? WHERE id = ?').run(1, dup.id);
  for (let i = 0; i < 4; i++) papel(db, U, '2026-09-01', 'leido');
  papel(db, U, '2026-08-01', 'leido'); // fuera de ambas ventanas: no cuenta

  // ---- Huecos: H1 numeración abierto (ventana actual), H2 proveedor
  // ---- abierto (ventana actual), H3 fundamento resuelto (ventana actual).
  huecosMod.ensureSchema(db);
  const insHueco = db.prepare(`INSERT INTO gesty_huecos (user_id, tipo, clave, periodo, dato_que_falta, detalle, estado, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const h1 = insHueco.run(U, 'numeracion', 'num-1', '2026-10', 'Falta el comprobante 0001-00000107', '', 'abierto', '2026-10-05 09:00:00', '2026-10-05 09:00:00');
  insHueco.run(U, 'proveedor', 'prov-1', '2026-10', 'Distribuidora Sur no facturó este mes', '', 'abierto', '2026-10-18 09:00:00', '2026-10-18 09:00:00');
  insHueco.run(U, 'fundamento', 'fund-1', '2026-10', 'Falta el papel esperado: alquiler', '', 'resuelto', '2026-10-02 09:00:00', '2026-10-03 09:00:00');

  // ---- Facturas: F0 venció 09-10 y se pagó 09-15 · F1 venció 10-10,
  // ---- impaga · F2 venció 10-15 y se pagó 10-14 · F3 vence 11-05.
  const f0 = await facturaEnviada(db, U, { fecha: '2026-08-20', vencimiento: '2026-09-10', precio: 2000 });
  fact.registrarCobro(db, U, f0.id, { monto: 2000, fecha: '2026-09-15', medio: 'transferencia' });
  await facturaEnviada(db, U, { fecha: '2026-09-01', vencimiento: '2026-10-10', precio: 1000 });
  const f2 = await facturaEnviada(db, U, { fecha: '2026-10-01', vencimiento: '2026-10-15', precio: 500 });
  fact.registrarCobro(db, U, f2.id, { monto: 500, fecha: '2026-10-14', medio: 'transferencia' });
  await facturaEnviada(db, U, { fecha: '2026-10-05', vencimiento: '2026-11-05', precio: 700 });

  // ---- Precios: 2 alertas abiertas + 1 vista (registros de G-22).
  preciosMod.ensureSchema(db);
  const insAlerta = db.prepare(`INSERT INTO gesty_precios_alertas
    (user_id, serie, salto, proveedor_nombre, concepto, variacion_pct, texto, estado, ultima_fecha)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  insAlerta.run(U, 's1', 'salto-test-1', 'Distribuidora Sur', 'Flete', 19.4, 'Distribuidora Sur: el flete subió +19,4%', 'abierta', '2026-10-19');
  insAlerta.run(U, 's2', 'salto-test-2', 'Distribuidora Sur', 'Repuesto X', 12.0, 'Distribuidora Sur: el repuesto subió +12,0%', 'abierta', '2026-10-18');
  insAlerta.run(U, 's3', 'salto-test-3', 'Distribuidora Sur', 'Gas', 11.0, 'Distribuidora Sur: el gas subió +11,0%', 'vista', '2026-10-10');

  // ---- Conciliación: 3 sin-conciliar + 1 sin-par + 2 propuestos + 1 conciliado.
  concMod.ensureSchema(db);
  const insMov = db.prepare(`INSERT INTO gesty_conciliacion_movimientos
    (user_id, extracto_id, comprobante_id, fecha, monto, moneda, estado) VALUES (?,?,?,?,?,?,?)`);
  for (let i = 0; i < 3; i++) insMov.run(U, 0, 0, '2026-10-15', 1000, 'ARS', 'sin-conciliar');
  insMov.run(U, 0, 0, '2026-10-15', 1000, 'ARS', 'sin-par');
  insMov.run(U, 0, 0, '2026-10-15', 1000, 'ARS', 'propuesto');
  insMov.run(U, 0, 0, '2026-10-15', 1000, 'ARS', 'propuesto');
  insMov.run(U, 0, 0, '2026-10-15', 1000, 'ARS', 'conciliado');

  // ---- Reservas del canal: 2 tomadas + 1 derivada (ventana) + 1 cumplida (fuera).
  reservasMod.ensureSchema(db);
  const insRes = db.prepare(`INSERT INTO gesty_reservas_canal
    (user_id, canal, clave_pedido, estado, cliente_nombre, servicio, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?)`);
  insRes.run(U, 'whatsapp', 'ped-1', 'tomada', 'Ana', 'Service', '2026-10-10 10:00:00', '2026-10-10 10:00:00');
  insRes.run(U, 'whatsapp', 'ped-2', 'tomada', 'Beto', 'Service', '2026-10-20 10:00:00', '2026-10-20 10:00:00');
  insRes.run(U, 'whatsapp', 'ped-3', 'derivada', 'Ceci', 'Consulta de venta', '2026-10-11 10:00:00', '2026-10-11 10:00:00');
  insRes.run(U, 'whatsapp', 'ped-4', 'cumplida', 'Dani', 'Service', '2026-08-01 10:00:00', '2026-08-01 10:00:00');

  // ---- Buzón: 2 con papeles + 1 sin papel (ventana) + 1 con papeles (fuera).
  buzonMod.ensureSchema(db);
  const insIng = db.prepare(`INSERT INTO gesty_buzon_ingestas
    (user_id, remitente, asunto, resultado, papeles, detalle, created_at) VALUES (?,?,?,?,?,?,?)`);
  insIng.run(U, 'facturas@distribuidorasur.example', 'Factura', 'con-papeles', 2, '{}', '2026-10-03 09:00:00');
  insIng.run(U, 'facturas@distribuidorasur.example', 'Factura', 'con-papeles', 1, '{}', '2026-10-19 09:00:00');
  insIng.run(U, 'promo@otra.example', 'Promo', 'sin-papel', 0, '{}', '2026-10-11 09:00:00');
  insIng.run(U, 'facturas@distribuidorasur.example', 'Factura vieja', 'con-papeles', 5, '{}', '2026-08-05 09:00:00');

  console.log('— panel compuesto: los números exactos de la siembra');
  const panel = salud.componerPanel(db, U, { hoy: HOY });
  ok('cobertura: los 9 indicadores disponibles con la siembra completa',
    panel.cobertura.total === 9 && panel.cobertura.disponibles === 9,
    JSON.stringify(panel.cobertura));
  ok('el período es la ventana de 30 días y su anterior comparable',
    panel.periodo.desde === '2026-09-22' && panel.periodo.hasta === HOY
    && panel.periodo.anterior_desde === '2026-08-23' && panel.periodo.anterior_hasta === '2026-09-21',
    JSON.stringify(panel.periodo));
  ok('semana de vida: inicio 2026-10-01 → semana 3 al 2026-10-21',
    panel.semana_vida && panel.semana_vida.inicio === '2026-10-01' && panel.semana_vida.numero === 3,
    JSON.stringify(panel.semana_vida));

  const pap = panel.indicadores.papeles_al_dia;
  // Cruce por SQL directo, independiente del módulo:
  const sqlIng = db.prepare(`SELECT COUNT(*) n FROM gesty_comprobantes WHERE user_id = ? AND duplicado_de IS NULL
    AND estado_lectura != 'duplicado' AND date(created_at) BETWEEN '2026-09-22' AND '2026-10-21'`).get(U).n;
  const sqlLeidos = db.prepare(`SELECT COUNT(*) n FROM gesty_comprobantes WHERE user_id = ? AND duplicado_de IS NULL
    AND estado_lectura = 'leido' AND date(created_at) BETWEEN '2026-09-22' AND '2026-10-21'`).get(U).n;
  const sqlHuecosAbiertos = db.prepare(`SELECT COUNT(*) n FROM gesty_huecos WHERE user_id = ? AND estado = 'abierto'`).get(U).n;
  ok('papeles: ingresados/leídos coinciden con el SQL directo (8 y 6)',
    pap.ingresados === 8 && pap.leidos === 6 && sqlIng === 8 && sqlLeidos === 6,
    `panel=${pap.ingresados}/${pap.leidos} sql=${sqlIng}/${sqlLeidos}`);
  ok('papeles: la revisión (2) y los duplicados (1) están citados, no escondidos',
    pap.en_revision === 2 && pap.duplicados === 1);
  ok('papeles al día = 60% — 6 leídos / (8 ingresados + 2 huecos abiertos), y el SQL de huecos lo respalda',
    pap.porcentaje === 60 && pap.denominador === 10 && pap.huecos_en_el_denominador === 2 && sqlHuecosAbiertos === 2,
    `pct=${pap.porcentaje} den=${pap.denominador}`);
  ok('papeles: tendencia con base — la ventana anterior era 100% (4/4, sin huecos a su cierre) y bajó 40 pp',
    pap.tendencia.porcentaje_anterior === 100 && pap.tendencia.direccion === 'baja' && pap.tendencia.diferencia_pp === -40,
    JSON.stringify(pap.tendencia));

  const cob = panel.indicadores.cobranzas_al_dia;
  ok('cobranzas: con una vencida impaga, «al día» es FALSO (no un consuelo)',
    cob.al_dia === false && cob.vencidas_impagas === 1, JSON.stringify(cob).slice(0, 200));
  ok('cobranzas: el total vencible es 3 (F0, F1, F2; F3 todavía no vence) y el monto vencido es ARS 1000',
    cob.total_vencible === 3 && cob.monto_vencido.ARS === 1000,
    `vencible=${cob.total_vencible} monto=${JSON.stringify(cob.monto_vencido)}`);
  ok('cobranzas: la vencida citada es la de $1000 con vencimiento 2026-10-10',
    cob.detalle.length === 1 && cob.detalle[0].saldo === 1000 && cob.detalle[0].vencimiento === '2026-10-10');
  ok('cobranzas: tendencia con base — al cierre anterior estaba al día (F0 se pagó el 09-15) y empeoró',
    cob.tendencia.direccion === 'empeora' && cob.tendencia.vencidas_anterior === 0 && cob.tendencia.al_dia_anterior === true,
    JSON.stringify(cob.tendencia));

  const hue = panel.indicadores.huecos_abiertos;
  ok('huecos: 2 abiertos (numeración 1 · proveedor 1 · fundamento 0) y 1 resuelto',
    hue.abiertos === 2 && hue.por_tipo.numeracion === 1 && hue.por_tipo.proveedor === 1
    && hue.por_tipo.fundamento === 0 && hue.resueltos === 1,
    JSON.stringify(hue).slice(0, 200));
  ok('huecos: sin huecos ni escaneos antes de la ventana anterior → tendencia «sin base», declarada',
    hue.tendencia.direccion === 'sin-base' && hue.tendencia.abiertos_anterior === null,
    JSON.stringify(hue.tendencia));

  const okPanel = panel.indicadores.para_tu_ok;
  const sqlPend = db.prepare(`SELECT COUNT(*) n FROM gesty_cards WHERE user_id = ? AND estado IN ('esperando','devuelta')`).get(U).n;
  ok('para tu OK: el total coincide con el SQL directo sobre la bandeja (las del flujo de facturas ya se aprobaron)',
    okPanel.total === sqlPend && okPanel.total === gesty.countPending(db, U),
    `panel=${okPanel.total} sql=${sqlPend}`);

  const pre = panel.indicadores.alertas_precio;
  ok('precios: 2 alertas abiertas desde los registros de G-22 (la vista no cuenta)',
    pre.disponible && pre.alertas_abiertas === 2 && pre.peores_abiertas.length === 2,
    JSON.stringify(pre).slice(0, 200));

  const con = panel.indicadores.conciliacion;
  ok('conciliación: 4 sin conciliar (3 sin-conciliar + 1 sin-par) y 2 propuestas esperando',
    con.disponible && con.movimientos_sin_conciliar === 4 && con.propuestas_esperando === 2,
    JSON.stringify(con).slice(0, 200));

  const res = panel.indicadores.reservas_canal;
  ok('reservas del canal: 2 activas, 3 ingresadas en el período, 1 derivada, 1 cumplida',
    res.disponible && res.activas === 2 && res.ingresadas_en_el_periodo === 3
    && res.derivadas === 1 && res.cumplidas === 1,
    JSON.stringify(res).slice(0, 200));

  const buz = panel.indicadores.buzon;
  ok('buzón: 3 ingestas del período (2 con papeles, 1 sin papel contada) y 3 papeles entrados; sin dirección generada, declarado',
    buz.disponible && buz.ingestas_en_el_periodo === 3 && buz.con_papeles === 2
    && buz.sin_papel === 1 && buz.papeles_entrados === 3 && buz.direccion_activa === false,
    JSON.stringify(buz).slice(0, 220));

  const dat = panel.indicadores.datos_cargados_a_mano;
  ok('datos a mano (cuenta de la siembra): disponible, semana 3, y la vara declarado que ya no aplica',
    dat.disponible && dat.semana_vida === 3 && dat.vara.aplica === false && dat.vara.cumple === null,
    JSON.stringify(dat).slice(0, 220));

  console.log('— huecos: la tendencia gana base cuando un hueco abierto ya existía al cierre anterior');
  db.prepare("UPDATE gesty_huecos SET created_at = '2026-09-15 09:00:00' WHERE id = ?").run(Number(h1.lastInsertRowid));
  const panel2 = salud.componerPanel(db, U, { hoy: HOY });
  ok('huecos: abiertos hoy siguen 2; al cierre anterior había 1 → tendencia «empeora» con base',
    panel2.indicadores.huecos_abiertos.abiertos === 2
    && panel2.indicadores.huecos_abiertos.tendencia.abiertos_anterior === 1
    && panel2.indicadores.huecos_abiertos.tendencia.direccion === 'empeora',
    JSON.stringify(panel2.indicadores.huecos_abiertos.tendencia));

  console.log('— para tu OK en una cuenta limpia: conteo por tipo exacto');
  const dbT = nuevaDb();
  gesty.setPack(dbT, 7, 'completa', { origen: 'test' });
  gesty.createCard(dbT, 7, { tipo: 'factura-emision', titulo: 'Emitir la factura de La Espiga', detalle: {} });
  gesty.createCard(dbT, 7, { tipo: 'factura-emision', titulo: 'Emitir la factura de El Molino', detalle: {} });
  gesty.createCard(dbT, 7, { tipo: 'cobranza', titulo: 'Enviar la cobranza amable', detalle: {} });
  const panelT = salud.componerPanel(dbT, 7, { hoy: HOY });
  ok('para tu OK: total 3, por tipo factura-emision 2 · cobranza 1',
    panelT.indicadores.para_tu_ok.total === 3
    && panelT.indicadores.para_tu_ok.por_tipo['factura-emision'].cantidad === 2
    && panelT.indicadores.para_tu_ok.por_tipo.cobranza.cantidad === 1,
    JSON.stringify(panelT.indicadores.para_tu_ok).slice(0, 200));

  console.log('— degradación honesta: sin capacidad no es un cero; fuente caída no frena el panel');
  const dbB = nuevaDb();
  gesty.setPack(dbB, 2, 'esencial', { origen: 'test' });
  const panelB = salud.componerPanel(dbB, 2, { hoy: HOY });
  ok('cuenta Esencial: precios (capacidad «proveedores») NO disponible con motivo sin-capacidad',
    panelB.indicadores.alertas_precio.disponible === false
    && panelB.indicadores.alertas_precio.motivo === 'sin-capacidad',
    JSON.stringify(panelB.indicadores.alertas_precio).slice(0, 200));
  ok('cuenta Esencial: reservas (capacidad «agenda») NO disponible con motivo sin-capacidad',
    panelB.indicadores.reservas_canal.disponible === false
    && panelB.indicadores.reservas_canal.motivo === 'sin-capacidad');
  ok('cuenta Esencial: papeles SÍ disponible y sin datos declara porcentaje null (no un 100% de regalo)',
    panelB.indicadores.papeles_al_dia.disponible === true
    && panelB.indicadores.papeles_al_dia.porcentaje === null
    && panelB.indicadores.papeles_al_dia.estado_dato === 'sin-datos');
  ok('cuenta Esencial: cobranzas disponible sin facturas → al_dia null (sin veredicto, no «al día»)',
    panelB.indicadores.cobranzas_al_dia.disponible === true
    && panelB.indicadores.cobranzas_al_dia.al_dia === null
    && panelB.indicadores.cobranzas_al_dia.estado_dato === 'sin-datos');
  ok('cuenta sin registros: datos a mano NO disponible con motivo sin-registros, y la cobertura lo declara',
    panelB.indicadores.datos_cargados_a_mano.disponible === false
    && panelB.indicadores.datos_cargados_a_mano.motivo === 'sin-registros'
    && panelB.cobertura.no_disponibles.some((x) => x.clave === 'datos_cargados_a_mano'));

  const resumenOriginal = preciosMod.resumenPrecios;
  preciosMod.resumenPrecios = () => { throw new Error('caída simulada de la fuente de precios'); };
  let panelCaida;
  try { panelCaida = salud.componerPanel(db, U, { hoy: HOY }); }
  finally { preciosMod.resumenPrecios = resumenOriginal; }
  ok('fuente caída: precios NO disponible con motivo fuente-no-respondio y el error citado',
    panelCaida.indicadores.alertas_precio.disponible === false
    && panelCaida.indicadores.alertas_precio.motivo === 'fuente-no-respondio'
    && String(panelCaida.indicadores.alertas_precio.detalle_error).includes('simulada'),
    JSON.stringify(panelCaida.indicadores.alertas_precio).slice(0, 220));
  ok('fuente caída: el resto del panel sigue vivo (papeles 60%, cobranzas, huecos) y la cobertura bajó a 8',
    panelCaida.indicadores.papeles_al_dia.porcentaje === 60
    && panelCaida.indicadores.cobranzas_al_dia.disponible === true
    && panelCaida.indicadores.huecos_abiertos.disponible === true
    && panelCaida.cobertura.disponibles === 8,
    JSON.stringify(panelCaida.cobertura));
  ok('fuente caída: las declaraciones nombran el indicador caído',
    panelCaida.declaraciones.some((d) => d.includes('Alertas de precio')));

  console.log('— la vara de datos cargados a mano (fechas reales: la semana de vida es de la cuenta)');
  const dbD = nuevaDb();
  const UD = 5;
  gesty.setPack(dbD, UD, 'completa', { origen: 'test' });
  gesty.setData(dbD, UD, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Taller Dinámico', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(dbD, UD, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(dbD, UD, {
    grupo: 'clientes-facturacion', campo: `cuit_${CUIT_CLIENTE}`,
    valor: { nombre: 'Panadería La Espiga', cuit: CUIT_CLIENTE, condicion_iva: 'Responsable inscripto', email: 'laespiga@example.com' },
    origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno',
  });
  gesty.setData(dbD, UD, { grupo: 'negocio', campo: 'nombre_fantasia', valor: 'El Dinámico', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  // Un ajuste de configuración (reglas-dueno): NO cuenta como carga de datos.
  gesty.setData(dbD, UD, { grupo: 'reglas-dueno', campo: 'cierre-del-dia', valor: { hora: '19:00', activo: true }, origen: 'dueno', origen_ref: 'ajustes', cargado_por: 'dueno' });
  // La vida de la cuenta empezó hace 2 días.
  dbD.prepare(`UPDATE gesty_foundation SET created_at = datetime('now', '-2 days')
    WHERE id = (SELECT MIN(id) FROM gesty_foundation WHERE user_id = ?)`).run(UD);
  const hoyReal = new Date().toISOString().slice(0, 10);
  const panelD1 = salud.componerPanel(dbD, UD, { hoy: hoyReal });
  const datD1 = panelD1.indicadores.datos_cargados_a_mano;
  ok('semana 1 con 4 datos a mano (el ajuste de reglas no cuenta): la vara CUMPLE',
    datD1.disponible && datD1.semana_vida === 1 && datD1.cantidad === 4
    && datD1.vara.aplica === true && datD1.vara.cumple === true,
    JSON.stringify(datD1).slice(0, 260));
  ok('semana 1: la tendencia es «sin base» (no hay semana anterior), declarado',
    datD1.tendencia.direccion === 'sin-base' && datD1.tendencia.cantidad_anterior === null);
  gesty.setData(dbD, UD, { grupo: 'negocio', campo: 'direccion', valor: 'Calle Falsa 123', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(dbD, UD, { grupo: 'negocio', campo: 'telefono', valor: '11 5555 5555', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  const datD2 = salud.componerPanel(dbD, UD, { hoy: hoyReal }).indicadores.datos_cargados_a_mano;
  ok('semana 1 con 6 datos a mano: la vara NO cumple, declarado sin vueltas',
    datD2.cantidad === 6 && datD2.vara.aplica === true && datD2.vara.cumple === false,
    JSON.stringify(datD2).slice(0, 220));
  // La vida pasa a haber empezado hace 10 días: semana 2.
  dbD.prepare(`UPDATE gesty_foundation SET created_at = datetime('now', '-10 days')
    WHERE id = (SELECT MIN(id) FROM gesty_foundation WHERE user_id = ?)`).run(UD);
  const datD3 = salud.componerPanel(dbD, UD, { hoy: hoyReal }).indicadores.datos_cargados_a_mano;
  ok('semana 2: la vara ya no aplica (declarado) y la tendencia trae la semana 1 como base (0 cargas esa semana)',
    datD3.semana_vida === 2 && datD3.vara.aplica === false && datD3.vara.cumple === null
    && datD3.tendencia.cantidad_anterior === 0,
    JSON.stringify(datD3).slice(0, 260));

  console.log('— separación por cuenta');
  const dbX = nuevaDb();
  gesty.setPack(dbX, 1, 'completa', { origen: 'test' });
  gesty.setPack(dbX, 9, 'completa', { origen: 'test' });
  sembrarFundamento(dbX, 1);
  sembrarFundamento(dbX, 9);
  papel(dbX, 9, '2026-10-05', 'leido');
  papel(dbX, 9, '2026-10-06', 'leido');
  papel(dbX, 9, '2026-10-07', 'leido');
  const panelX9 = salud.componerPanel(dbX, 9, { hoy: HOY });
  const panelX1 = salud.componerPanel(dbX, 1, { hoy: HOY });
  ok('la cuenta 9 ve SUS 3 papeles; la cuenta 1, en la misma base, ve 0 (nada se cruza)',
    panelX9.indicadores.papeles_al_dia.ingresados === 3
    && panelX1.indicadores.papeles_al_dia.ingresados === 0,
    `c9=${panelX9.indicadores.papeles_al_dia.ingresados} c1=${panelX1.indicadores.papeles_al_dia.ingresados}`);

  console.log('— la foto durable: congela, versiona y no reescribe');
  const foto1 = salud.generarFoto(db, U, { hoy: HOY });
  ok('foto 1: versión 1 con el panel de la siembra (papeles 60%)',
    foto1.version === 1 && foto1.contenido.indicadores.papeles_al_dia.porcentaje === 60);
  papel(db, U, '2026-10-20', 'leido');
  const panelTras = salud.componerPanel(db, U, { hoy: HOY });
  ok('el panel vivo cambió con el papel nuevo (7 leídos de 11 = 63,6%)',
    panelTras.indicadores.papeles_al_dia.porcentaje === 63.6,
    `pct=${panelTras.indicadores.papeles_al_dia.porcentaje}`);
  const fotoGuardada = salud.getFoto(db, U, HOY);
  ok('la foto guardada NO cambió: sigue diciendo 60% (la historia no se reescribe)',
    fotoGuardada.version === 1 && fotoGuardada.contenido.indicadores.papeles_al_dia.porcentaje === 60);
  const foto2 = salud.generarFoto(db, U, { hoy: HOY });
  const listaFotos = salud.listFotos(db, U, { todas_las_versiones: true });
  const vigentes = salud.listFotos(db, U, {});
  ok('foto 2: versión nueva declarada; el historial guarda las 2 y la vigente es la 2',
    foto2.version === 2 && foto2.contenido.indicadores.papeles_al_dia.porcentaje === 63.6
    && listaFotos.total === 2 && vigentes.fotos.length === 1 && vigentes.fotos[0].version === 2,
    `v2=${foto2.version} total=${listaFotos.total}`);
  const resumen = salud.resumenSalud(db, U, { hoy: HOY });
  ok('resumen para «La oficina»: trae los titulares del panel y la foto de hoy',
    resumen.papeles_al_dia_pct === 63.6 && resumen.cobranzas_al_dia === false
    && resumen.huecos_abiertos === 2 && resumen.foto_de_hoy.existe === true && resumen.foto_de_hoy.version === 2
    && resumen.texto.includes('63,6') === false && resumen.texto.includes('63.6%'),
    JSON.stringify(resumen).slice(0, 260));

  // ---------------------------------------------------------------------------
  console.log('— http: gating y recorrido mínimo');
  const PORT = 3980;
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g24-'));
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
    const reg = await call('POST', '/api/auth/register', { email: 'g24@example.com', password: 'secreto1' });
    ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
    const sinSesion = await call('GET', '/api/gesty/salud/panel', null, '');
    ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
    const sinPack = await call('GET', '/api/gesty/salud/panel', null, reg.cookie);
    ok('gating http: sin pack → 403', sinPack.status === 403, String(sinPack.status));
    const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
    f.exec('PRAGMA busy_timeout = 5000');
    const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g24@example.com');
    f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'esencial');
    f.close();
    const esencial = await call('GET', '/api/gesty/salud/panel', null, reg.cookie);
    ok('gating http: pack Esencial NO trae la capacidad «reportes» → 403', esencial.status === 403, String(esencial.status));
    const f2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
    f2.exec('PRAGMA busy_timeout = 5000');
    f2.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'completa');
    f2.close();
    const panelHttp = await call('GET', '/api/gesty/salud/panel?hoy=2026-10-21', null, reg.cookie);
    ok('http: con pack Completa el panel responde 200 con sus 9 indicadores y su cobertura',
      panelHttp.status === 200 && panelHttp.data.panel.cobertura.total === 9
      && !!panelHttp.data.panel.indicadores.papeles_al_dia,
      JSON.stringify(panelHttp.data).slice(0, 220));
    const fotoHttp = await call('POST', '/api/gesty/salud/fotos', { hoy: '2026-10-21' }, reg.cookie);
    ok('http: generar la foto responde 200 con versión 1',
      fotoHttp.status === 200 && fotoHttp.data.foto.version === 1,
      JSON.stringify(fotoHttp.data).slice(0, 220));
    const getFotoHttp = await call('GET', '/api/gesty/salud/fotos/2026-10-21', null, reg.cookie);
    ok('http: la foto generada se lee por fecha', getFotoHttp.status === 200 && getFotoHttp.data.foto.fecha === '2026-10-21');
    const resumenHttp = await call('GET', '/api/gesty/salud/resumen?hoy=2026-10-21', null, reg.cookie);
    ok('http: el resumen responde 200 y declara la foto de hoy',
      resumenHttp.status === 200 && resumenHttp.data.resumen.foto_de_hoy.existe === true);
  } finally {
    child.kill('SIGKILL');
  }
  console.log(`\n${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
