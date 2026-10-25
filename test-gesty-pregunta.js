#!/usr/bin/env node
// test-gesty-pregunta.js — G-25 · «GESTY PREGUNTA» (la pregunta
// semanal del fundamento).
// Spec: gesty-cola-builds.md G-25 + gesty-sistema-operativo.md
// (regla de la pregunta única).
// Cubre: hueco preguntable nace con momento citado (y VERIFICADO
// contra el cierre durable de G-21) y opciones de evidencia · el
// hueco cerrable por papel (el CUIT) NO nace y queda DECLARADO en
// no_preguntables, igual que el papel en revisión de G-03 · segunda
// pregunta bloqueada mientras una está activa y por ritmo semanal
// tras responder · la respuesta escribe el fundamento con
// procedencia del dueño (origen pregunta-unica + origen_ref
// pregunta-gesty:<id>) y el hueco no renace nunca · el descarte
// mata la pregunta y no renace · la vencida se retira sin
// re-preguntar · «otra» con fecha explícita se estructura y «otra»
// ambigua queda como nota sin inventar ni escribir · el orden del
// catálogo (medio de pago → día del contador → horario → días de
// pago → confirmación) · la frontera con G-20 (su propuesta viva
// apaga el candidato de días de pago) · separación por cuenta ·
// gating HTTP (401 / 403 sin pack / 200 con pack).
// Uso: node test-gesty-pregunta.js
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
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 260) : ''); }
};
const nuevaDb = () => new DatabaseSync(':memory:');

const gesty = require('./gesty.js');
const comp = require('./gesty-comprobantes.js');
const cierreDia = require('./gesty-cierre-dia.js');
const reservasCanal = require('./gesty-reservas-canal.js');
const pregunta = require('./gesty-pregunta.js');

const CUIT_PROPIO = '20123456786';
const CUIT_PROVEEDOR = '30712345671';

// La vida de la cuenta arranca el 2026-10-05 (se fija el created_at
// del primer dato, patrón de la suite de G-24): semana 1 = 05–11 oct,
// semana 2 = 12–18, semana 3 = 19–25, semana 4 = 26 oct–01 nov,
// semana 5 = 02–08 nov.
function fijarInicio(db, uid) {
  db.prepare("UPDATE gesty_foundation SET created_at = '2026-10-05 08:00:00' WHERE user_id = ? AND campo = 'razon_social'").run(uid);
}
function dato(db, uid, grupo, campo) {
  return gesty.getData(db, uid, { grupo }).find((d) => d.campo === campo) || null;
}
function sembrarCierre(db, uid, fecha) {
  try { return cierreDia.generarCierre(db, uid, { fecha, hoy: fecha }); }
  catch (e) {
    cierreDia.ensureSchema(db);
    db.prepare(`INSERT INTO gesty_cierres_dia (user_id, fecha, version, contenido, texto, texto_resumen, generado_por)
      VALUES (?,?,1,'{}','','','dueno')`).run(uid, fecha);
    return cierreDia.getCierre(db, uid, fecha);
  }
}

(async () => {
  // =========================================================================
  console.log('— cuenta A: el recorrido completo del catálogo, semana a semana');
  const db = nuevaDb();
  const A = 1;
  gesty.setPack(db, A, 'total', { origen: 'test' });
  gesty.setData(db, A, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Heladería La Nieve', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  fijarInicio(db, A);
  // Contador cargado SIN día de entrega (candidato 2).
  gesty.setData(db, A, { grupo: 'contador', campo: 'nombre', valor: 'Estudio López', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(db, A, { grupo: 'contador', campo: 'email', valor: 'lopez@example.com', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  // Proveedor habitual sin días de pago declarados (candidato 4):
  // pagos observados cayendo viernes (5) y miércoles (3).
  gesty.setData(db, A, {
    grupo: 'proveedores', campo: 'cuit_30712345671',
    valor: { nombre: 'Distribuidora Sur', cuit: CUIT_PROVEEDOR, comprobantes_recibidos: 4, dias_pago_observados: [5, 5, 3] },
    origen: 'comprobante', origen_ref: 'papel-1', cargado_por: 'gesty',
  });
  // Dato inferido escalar sin confirmar (candidato 5, el último).
  const inferido = gesty.setData(db, A, { grupo: 'reglas-cobro', campo: 'canal_preferido', valor: 'whatsapp', origen: 'inferido', origen_ref: 'patron-observado', cargado_por: 'gesty' });
  // Un papel en revisión: su pregunta es de G-03, no de esta superficie.
  const papelRev = comp.registrarManual(db, A, {
    tipo: 'factura', direccion: 'recibida',
    emisor_nombre: 'Distribuidora Sur', emisor_cuit: CUIT_PROVEEDOR,
    receptor_nombre: 'Heladería La Nieve', receptor_cuit: CUIT_PROPIO,
    numero: '0002-00004501', fecha: '2026-10-05', vencimiento: '2026-10-20',
    moneda: 'ARS', monto_total: 10000, monto_neto: 10000, concepto: 'Insumos',
  }).comprobante;
  db.prepare("UPDATE gesty_comprobantes SET estado_lectura = 'necesita-revision' WHERE id = ?").run(papelRev.id);

  // ---- La frontera, declarada antes de que nazca nada.
  const det0 = pregunta.detectarCandidatos(db, A, {});
  ok('frontera: el CUIT faltante se declara NO preguntable (lo lee un papel)',
    det0.no_preguntables.some((h) => h.tipo === 'dato-fiscal-faltante' && /no se pregunta/.test(h.motivo)),
    JSON.stringify(det0.no_preguntables).slice(0, 200));
  ok('frontera: el papel en revisión se declara de G-03, no de esta pregunta',
    det0.no_preguntables.some((h) => h.tipo === 'papel-en-revision' && h.dato === `comprobante-${papelRev.id}`));
  ok('detección: hay candidatas y la primera del catálogo es el medio de pago',
    det0.candidatos.length >= 4 && det0.candidatos[0].clave_hueco === 'medio-pago-cobranzas',
    JSON.stringify(det0.candidatos.map((c) => c.clave_hueco)));
  ok('detección: ningún candidato es un dato que un papel cierra (ni cuit ni el papel)',
    !det0.candidatos.some((c) => c.campo === 'cuit' || /comprobante/.test(c.clave_hueco)));

  // ---- Semana 1: nace el medio de pago, pegada al cierre del día.
  sembrarCierre(db, A, '2026-10-06');
  const ev1 = pregunta.evaluarPregunta(db, A, { hoy: '2026-10-06', momento: { tipo: 'cierre-del-dia', ref: '2026-10-06', detalle: 'al cerrar el día' } });
  ok('semana 1: nace la pregunta del medio de pago', ev1.creada === true && ev1.pregunta.clave_hueco === 'medio-pago-cobranzas', JSON.stringify(ev1).slice(0, 200));
  ok('la pregunta nace con su momento citado y VERIFICADO contra el cierre durable',
    ev1.pregunta.momento.tipo === 'cierre-del-dia' && ev1.pregunta.momento.ref === '2026-10-06' && ev1.pregunta.momento.verificado === true,
    JSON.stringify(ev1.pregunta.momento));
  ok('la pregunta trae opciones de un toque + la salida «otra» y su evidencia',
    Array.isArray(ev1.pregunta.opciones) && ev1.pregunta.opciones.length >= 2 && ev1.pregunta.otra_respuesta === true && /sin link ni alias/.test(ev1.pregunta.evidencia));
  ok('la pregunta nace en la semana 1 de la cuenta', ev1.pregunta.semana === 1 && ev1.semana.numero === 1, JSON.stringify(ev1.semana));
  const p1 = ev1.pregunta;

  const ev1b = pregunta.evaluarPregunta(db, A, { hoy: '2026-10-06', momento: { tipo: 'escaneo', ref: 'x' } });
  ok('con una activa, no nace otra (máximo una activa)', ev1b.creada === false && ev1b.motivo === 'ya-hay-una-activa' && ev1b.pregunta.id === p1.id);

  // Responder: la opción con link exige el dato en el texto.
  assert.throws(() => pregunta.responderPregunta(db, A, p1.id, { tipo: 'opcion', clave: 'con-link' }, { hoy: '2026-10-06' }), /necesita el dato/);
  ok('la opción «con link» sin el link escrito se rechaza en voz alta', true);
  const r1 = pregunta.responderPregunta(db, A, p1.id, { tipo: 'opcion', clave: 'con-link', texto: 'https://link.mercadopago.com.ar/heladerialanieve' }, { hoy: '2026-10-06' });
  const dMedio = dato(db, A, 'cuentas-medios', 'medio-pago-cobranzas');
  ok('la respuesta escribe el fundamento UNA vez: medio de pago como link',
    !!dMedio && dMedio.valor && dMedio.valor.tipo === 'link' && dMedio.valor.dato === 'https://link.mercadopago.com.ar/heladerialanieve',
    JSON.stringify(dMedio && dMedio.valor));
  ok('la escritura lleva la procedencia del dueño: origen pregunta-unica, la pregunta citada, confirmada',
    dMedio.origen === 'pregunta-unica' && dMedio.origen_ref === `pregunta-gesty:${p1.id}` && dMedio.confirmado_por_dueno === true && dMedio.cargado_por === 'dueno',
    JSON.stringify({ o: dMedio.origen, ref: dMedio.origen_ref, c: dMedio.confirmado_por_dueno }));
  ok('la pregunta queda respondida con el dato citado', r1.pregunta.estado === 'respondida' && r1.pregunta.dato_id === dMedio.id && r1.pregunta.respuesta.tipo === 'opcion');

  const ev1c = pregunta.evaluarPregunta(db, A, { hoy: '2026-10-08', momento: { tipo: 'apertura-panel' } });
  ok('tras responder, el ritmo semanal bloquea otro nacimiento en la misma semana',
    ev1c.creada === false && ev1c.motivo === 'ritmo-semanal', JSON.stringify(ev1c).slice(0, 160));

  // ---- Semana 2: el día de entrega al contador.
  const ev2 = pregunta.evaluarPregunta(db, A, { hoy: '2026-10-13', momento: { tipo: 'apertura-panel', detalle: 'el dueño abrió el panel' } });
  ok('semana 2: nace la pregunta del día de entrega (el medio de pago no renace)',
    ev2.creada === true && ev2.pregunta.clave_hueco === 'dia-entrega-contador' && ev2.pregunta.semana === 2,
    JSON.stringify(ev2.pregunta && ev2.pregunta.clave_hueco));
  const r2 = pregunta.responderPregunta(db, A, ev2.pregunta.id, { tipo: 'otra', texto: 'el día 5 de cada mes' }, { hoy: '2026-10-13' });
  const dDia = dato(db, A, 'contador', 'dia_entrega');
  ok('«otra» con el día explícito se estructura a número y escribe el fundamento',
    !!dDia && dDia.valor === 5 && r2.pregunta.respuesta.estructurada === true, JSON.stringify(dDia && dDia.valor));

  // ---- Semana 3: el horario de reservas del canal.
  const ev3 = pregunta.evaluarPregunta(db, A, { hoy: '2026-10-20', momento: { tipo: 'rutina-diaria', ref: '2026-10-20' } });
  ok('semana 3: nace la pregunta del horario de reservas',
    ev3.creada === true && ev3.pregunta.clave_hueco === 'horario-reservas-canal', JSON.stringify(ev3.pregunta && ev3.pregunta.clave_hueco));
  pregunta.responderPregunta(db, A, ev3.pregunta.id, { tipo: 'opcion', clave: 'extendido' }, { hoy: '2026-10-20' });
  const cfgA = reservasCanal.getConfig(db, A);
  ok('la respuesta deja SU horario declarado en G-09b (08:00–20:00, ya no es el default)',
    cfgA.es_default === false && cfgA.hora_apertura === '08:00' && cfgA.hora_cierre === '20:00',
    JSON.stringify(cfgA));

  // ---- Semana 4: los días de pago al proveedor, con su evidencia.
  const ev4 = pregunta.evaluarPregunta(db, A, { hoy: '2026-10-27', momento: { tipo: 'escaneo', ref: 'rutina' } });
  ok('semana 4: nace la pregunta de días de pago al proveedor habitual',
    ev4.creada === true && ev4.pregunta.clave_hueco === 'dias-pago-proveedor:cuit_30712345671',
    JSON.stringify(ev4.pregunta && ev4.pregunta.clave_hueco));
  ok('sus opciones nacen de la evidencia observada (viernes y miércoles) + el vencimiento',
    ev4.pregunta.opciones.some((o) => o.clave === 'dias-5' && Array.isArray(o.valor.dias_pago) && o.valor.dias_pago[0] === 5)
    && ev4.pregunta.opciones.some((o) => o.clave === 'al-vencimiento')
    && /cayeron en/.test(ev4.pregunta.evidencia),
    JSON.stringify(ev4.pregunta.opciones.map((o) => o.clave)));
  pregunta.responderPregunta(db, A, ev4.pregunta.id, { tipo: 'opcion', clave: 'dias-5' }, { hoy: '2026-10-27' });
  const fichaA = dato(db, A, 'proveedores', 'cuit_30712345671');
  ok('la ficha gana dias_pago [5] SIN perder sus claves observadas de G-07',
    !!fichaA && Array.isArray(fichaA.valor.dias_pago) && fichaA.valor.dias_pago[0] === 5
    && fichaA.valor.comprobantes_recibidos === 4 && Array.isArray(fichaA.valor.dias_pago_observados),
    JSON.stringify(fichaA && fichaA.valor));

  // ---- Semana 5: la confirmación del dato inferido.
  const ev5 = pregunta.evaluarPregunta(db, A, { hoy: '2026-11-03', momento: { tipo: 'apertura-panel' } });
  ok('semana 5: nace la confirmación del dato inferido sin papel que lo avale',
    ev5.creada === true && ev5.pregunta.clave_hueco === `confirmacion:${inferido.id}` && /ningún papel lo confirma/.test(ev5.pregunta.texto),
    JSON.stringify(ev5.pregunta && ev5.pregunta.clave_hueco));
  pregunta.responderPregunta(db, A, ev5.pregunta.id, { tipo: 'opcion', clave: 'si-es-asi' }, { hoy: '2026-11-03' });
  const dInf = dato(db, A, 'reglas-cobro', 'canal_preferido');
  ok('el «sí» confirma el dato en el fundamento, con el mismo valor y la pregunta citada',
    !!dInf && dInf.valor === 'whatsapp' && dInf.confirmado_por_dueno === true && dInf.origen === 'pregunta-unica' && dInf.origen_ref === `pregunta-gesty:${ev5.pregunta.id}`);

  // ---- Semana 6: ya no queda nada preguntable; nada renace.
  const ev6 = pregunta.evaluarPregunta(db, A, { hoy: '2026-11-10', momento: { tipo: 'apertura-panel' } });
  ok('semana 6: sin huecos preguntables — y ningún hueco respondido vuelve a nacer, jamás',
    ev6.creada === false && ev6.motivo === 'sin-huecos-preguntables',
    JSON.stringify(ev6).slice(0, 160));
  const hist = pregunta.listPreguntas(db, A, {});
  ok('el historial durable guarda las 5 preguntas, todas respondidas',
    hist.total === 5 && hist.preguntas.every((p) => p.estado === 'respondida'), JSON.stringify(hist.preguntas.map((p) => p.estado)));
  const resumenA = pregunta.resumenPregunta(db, A, { hoy: '2026-11-10' });
  ok('el resumen declara semana 6, sin activa, con los conteos reales',
    resumenA.semana_actual.numero === 6 && resumenA.hay_activa === false && resumenA.conteos.respondida === 5, JSON.stringify(resumenA).slice(0, 200));

  // =========================================================================
  console.log('— cuenta B: descarte que no renace, vencida sin re-pregunta, «otra» ambigua = nota');
  const dbB = nuevaDb();
  const B = 2;
  gesty.setPack(dbB, B, 'completa', { origen: 'test' });
  gesty.setData(dbB, B, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Peluquería Norte', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(dbB, B, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  fijarInicio(dbB, B);
  gesty.setData(dbB, B, { grupo: 'contador', campo: 'nombre', valor: 'Estudio Sur', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  // Dato inferido con forma de FECHA: su «otra» sí se puede estructurar.
  const infB = gesty.setData(dbB, B, { grupo: 'calendario-fiscal', campo: 'proximo_vencimiento_estimado', valor: '2026-11-20', origen: 'inferido', origen_ref: 'estimacion', cargado_por: 'gesty' });

  const evB1 = pregunta.evaluarPregunta(dbB, B, { hoy: '2026-10-06', momento: { tipo: 'apertura-panel' } });
  ok('B semana 1: nace el medio de pago', evB1.creada === true && evB1.pregunta.clave_hueco === 'medio-pago-cobranzas');
  pregunta.descartarPregunta(dbB, B, evB1.pregunta.id, { hoy: '2026-10-06' });
  const pB1 = pregunta.getPregunta(dbB, B, evB1.pregunta.id);
  ok('el descarte es una respuesta válida: la pregunta muere como descartada, sin escribir nada',
    pB1.estado === 'descartada' && !dato(dbB, B, 'cuentas-medios', 'medio-pago-cobranzas'));
  const detB = pregunta.detectarCandidatos(dbB, B, {});
  ok('el hueco descartado NO vuelve a ser candidato (jamás se repite)',
    !detB.candidatos.some((c) => c.clave_hueco === 'medio-pago-cobranzas')
    && detB.candidatos.some((c) => c.clave_hueco === 'dia-entrega-contador'),
    JSON.stringify(detB.candidatos.map((c) => c.clave_hueco)));

  const evB2 = pregunta.evaluarPregunta(dbB, B, { hoy: '2026-10-13', momento: { tipo: 'apertura-panel' } });
  ok('B semana 2: nace el día de entrega', evB2.creada === true && evB2.pregunta.clave_hueco === 'dia-entrega-contador');
  // Nadie responde: al cumplirse su semana, se retira sola.
  const activaB = pregunta.preguntaActiva(dbB, B, { hoy: '2026-10-20' });
  const pB2 = pregunta.getPregunta(dbB, B, evB2.pregunta.id);
  ok('la no respondida se retira al cumplirse su semana (vencida) y no queda activa',
    activaB === null && pB2.estado === 'vencida', JSON.stringify({ activa: activaB, estado: pB2.estado }));
  assert.throws(() => pregunta.responderPregunta(dbB, B, evB2.pregunta.id, { tipo: 'opcion', clave: 'dia-5' }, { hoy: '2026-10-20' }), /ya está vencida|ya no está activa/);
  ok('responder una vencida se rechaza: no se revive ni se re-pregunta', true);
  const evB3 = pregunta.evaluarPregunta(dbB, B, { hoy: '2026-10-20', momento: { tipo: 'apertura-panel' } });
  ok('B semana 3: nace el horario (el día de entrega vencido tampoco renace)',
    evB3.creada === true && evB3.pregunta.clave_hueco === 'horario-reservas-canal', JSON.stringify(evB3.pregunta && evB3.pregunta.clave_hueco));
  const rB3 = pregunta.responderPregunta(dbB, B, evB3.pregunta.id, { tipo: 'otra', texto: 'cuando pueda, a la tarde nomás' }, { hoy: '2026-10-20' });
  ok('«otra» ambigua queda como NOTA del dueño: respondida, sin estructurar, sin escribir el fundamento',
    rB3.pregunta.estado === 'respondida' && rB3.pregunta.respuesta.estructurada === false && rB3.pregunta.respuesta.nota === true
    && rB3.pregunta.dato_id === null && !dato(dbB, B, 'reglas-dueno', 'reservas-canal'),
    JSON.stringify(rB3.pregunta.respuesta));
  const evB4 = pregunta.evaluarPregunta(dbB, B, { hoy: '2026-10-27', momento: { tipo: 'apertura-panel' } });
  ok('B semana 4: nace la confirmación del dato con forma de fecha',
    evB4.creada === true && evB4.pregunta.clave_hueco === `confirmacion:${infB.id}`, JSON.stringify(evB4.pregunta && evB4.pregunta.clave_hueco));
  const rB4 = pregunta.responderPregunta(dbB, B, evB4.pregunta.id, { tipo: 'otra', texto: 'en realidad vence el 2026-11-25' }, { hoy: '2026-10-27' });
  const dB4 = dato(dbB, B, 'calendario-fiscal', 'proximo_vencimiento_estimado');
  ok('«otra» con la fecha explícita se estructura y corrige el dato, confirmado por el dueño',
    !!dB4 && dB4.valor === '2026-11-25' && dB4.confirmado_por_dueno === true && rB4.pregunta.respuesta.estructurada === true,
    JSON.stringify(dB4 && dB4.valor));

  // =========================================================================
  console.log('— cuenta C: capacidades, la frontera con G-20 y la separación por cuenta');
  const dbC = nuevaDb();
  const C = 3;
  gesty.setPack(dbC, C, 'esencial', { origen: 'test' });
  gesty.setData(dbC, C, { grupo: 'datos-fiscales', campo: 'razon_social', valor: 'Taller Uno', origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  gesty.setData(dbC, C, { grupo: 'datos-fiscales', campo: 'cuit', valor: CUIT_PROPIO, origen: 'dueno', origen_ref: 'alta', cargado_por: 'dueno' });
  fijarInicio(dbC, C);
  const detC = pregunta.detectarCandidatos(dbC, C, {});
  ok('pack Esencial (sin «agenda»): el horario de reservas NO es candidato — la pregunta sigue a la capacidad',
    !detC.candidatos.some((c) => c.clave_hueco === 'horario-reservas-canal')
    && detC.candidatos.some((c) => c.clave_hueco === 'medio-pago-cobranzas'),
    JSON.stringify(detC.candidatos.map((c) => c.clave_hueco)));
  // Frontera G-20: si «Lo que Gesty aprendió» ya trata el plazo de un
  // proveedor (propuesta viva), los días de pago de ESE proveedor no
  // se preguntan acá.
  gesty.setPack(dbC, C, 'completa', { origen: 'test' });
  gesty.setData(dbC, C, {
    grupo: 'proveedores', campo: 'cuit_30712345671',
    valor: { nombre: 'Distribuidora Sur', cuit: CUIT_PROVEEDOR, comprobantes_recibidos: 5, dias_pago_observados: [2] },
    origen: 'comprobante', origen_ref: 'papel-9', cargado_por: 'gesty',
  });
  const reglasMod = require('./gesty-reglas.js');
  reglasMod.ensureSchema(dbC);
  dbC.prepare(`INSERT INTO gesty_reglas_propuestas (user_id, tipo, clave, titulo, texto, patron, evidencia, estado, observaciones)
    VALUES (?, 'pago-proveedor', 'pago-proveedor:cuit_30712345671', 'Pagar a Distribuidora Sur a los ~10 días', 'x', '{}', '{}', 'pendiente', 4)`).run(C);
  const detC2 = pregunta.detectarCandidatos(dbC, C, {});
  ok('frontera G-20: con una propuesta de plazo viva, los días de pago de ese proveedor no se preguntan acá',
    !detC2.candidatos.some((c) => c.clave_hueco === 'dias-pago-proveedor:cuit_30712345671'),
    JSON.stringify(detC2.candidatos.map((c) => c.clave_hueco)));
  dbC.prepare("UPDATE gesty_reglas_propuestas SET estado = 'descartada' WHERE user_id = ?").run(C);
  const detC3 = pregunta.detectarCandidatos(dbC, C, {});
  ok('sin propuesta viva de G-20, el candidato de días de pago vuelve a existir',
    detC3.candidatos.some((c) => c.clave_hueco === 'dias-pago-proveedor:cuit_30712345671'));

  // Separación por cuenta: C no ve ni responde preguntas de A.
  const ajenas = pregunta.listPreguntas(db, C, {});
  ok('separación: la cuenta C no tiene preguntas de A (cada base es su cuenta; y su lista propia está vacía)',
    ajenas.total === 0);
  assert.throws(() => pregunta.responderPregunta(db, C, p1.id, { tipo: 'descarte' }, { hoy: '2026-10-06' }), /no es de esta cuenta/);
  ok('responder la pregunta de OTRA cuenta se rechaza en voz alta', true);

  // =========================================================================
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
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-gesty-g25-'));
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
    const reg = await call('POST', '/api/auth/register', { email: 'g25@example.com', password: 'secreto1' });
    ok('registro de la cuenta: 200', reg.status === 200, JSON.stringify(reg.data).slice(0, 160));
    const sinSesion = await call('GET', '/api/gesty/pregunta/activa', null, '');
    ok('gating http: sin sesión → 401', sinSesion.status === 401, String(sinSesion.status));
    const sinPack = await call('GET', '/api/gesty/pregunta/activa', null, reg.cookie);
    ok('gating http: sin pack → 403 (el gating del fundamento, como G-20)', sinPack.status === 403, String(sinPack.status));
    const f = new DatabaseSync(path.join(dataDir, 'posta.db'));
    f.exec('PRAGMA busy_timeout = 5000');
    const u = f.prepare('SELECT id FROM users WHERE email = ?').get('g25@example.com');
    f.prepare("INSERT OR REPLACE INTO gesty_subscriptions (user_id, pack, origen) VALUES (?, ?, 'test')").run(u.id, 'completa');
    f.close();
    const activa0 = await call('GET', '/api/gesty/pregunta/activa', null, reg.cookie);
    ok('http: con pack, la activa responde 200 (todavía ninguna)', activa0.status === 200 && activa0.data.pregunta === null, JSON.stringify(activa0.data).slice(0, 160));
    const evH = await call('POST', '/api/gesty/pregunta/evaluar', { momento: { tipo: 'escaneo', ref: 'test-http' } }, reg.cookie);
    ok('http: evaluar nace la primera pregunta del catálogo (medio de pago)',
      evH.status === 200 && evH.data.creada === true && evH.data.pregunta.clave_hueco === 'medio-pago-cobranzas',
      JSON.stringify(evH.data).slice(0, 220));
    const respH = await call('POST', `/api/gesty/pregunta/${evH.data.pregunta.id}/responder`,
      { tipo: 'opcion', clave: 'con-alias', texto: 'heladeria.nieve.mp' }, reg.cookie);
    ok('http: responder con el alias escribe el dato (tipo alias) y cierra la pregunta',
      respH.status === 200 && respH.data.pregunta.estado === 'respondida' && respH.data.dato && respH.data.dato.valor && respH.data.dato.valor.tipo === 'alias',
      JSON.stringify(respH.data).slice(0, 220));
    const histH = await call('GET', '/api/gesty/pregunta/historial', null, reg.cookie);
    ok('http: el historial muestra la pregunta respondida', histH.status === 200 && histH.data.total === 1 && histH.data.preguntas[0].estado === 'respondida');
    const respDup = await call('POST', `/api/gesty/pregunta/${evH.data.pregunta.id}/responder`, { tipo: 'descarte' }, reg.cookie);
    ok('http: responder dos veces la misma pregunta → 400', respDup.status === 400, String(respDup.status));
    const resumenH = await call('GET', '/api/gesty/pregunta/resumen', null, reg.cookie);
    ok('http: el resumen responde 200 con la regla declarada', resumenH.status === 200 && /jamás se repite/.test(resumenH.data.resumen.regla));
  } finally {
    child.kill('SIGKILL');
  }
  console.log(`\n${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR del test:', e); process.exit(1); });
