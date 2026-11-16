// test-lote-venty-slice5-medicion.js — VENTY SLICE 5: medición real.
// Unitarias con DB en memoria (node:sqlite). El registro se arma a mano
// insertando filas reales en venty_partidas / venty_mensajes /
// venty_eventos / venty_leads de una DB aislada: NO se llama a la
// semilla de Café Aroma (asegurarSemilla) en ningún caso, así que
// ningún número puede venir de la semilla ni del mock.
// Uso: node test-lote-venty-slice5-medicion.js
'use strict';
const { DatabaseSync } = require('node:sqlite');
const venty = require('./venty');
const med = require('./venty-medicion');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const db = new DatabaseSync(':memory:');
venty.init(db);
med.ensureSchema(db);

const insP = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const insM = db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`);
const insE = db.prepare(`INSERT INTO venty_eventos (user_id, tipo, partida_id, datos_json, created_at) VALUES (?,?,?,?,?)`);
function partida(uid, nombre, canal, estado, monto, forma, origen, creada) {
  return Number(insP.run(uid, nombre, canal, estado, '', monto || 0, forma || '', '', 0, '', origen || 'whatsapp', creada, creada).lastInsertRowid);
}
function msg(pid, autor, texto, canal, cuando) { insM.run(pid, autor, texto, canal, cuando, ''); }
function ev(uid, tipo, pid, datos, cuando) { insE.run(uid, tipo, pid, JSON.stringify(datos || {}), cuando); }

// ============ usuario 7: dos semanas armadas a mano ============
const U = 7;
// --- semana anterior (lunes 2026-10-26) ---
const b1 = partida(U, 'Cliente Anterior Uno', 'whatsapp', 'cerrada_ganada', 5000, 'seña', 'whatsapp', '2026-10-27 09:00:00');
msg(b1, 'cliente', 'hola, cuánto sale', 'whatsapp', '2026-10-27 09:00:00');
msg(b1, 'venty', 'hola, te paso el precio', 'whatsapp', '2026-10-27 09:05:00');
ev(U, 'cotizacion', b1, { monto: 5000 }, '2026-10-27 09:05:00');
ev(U, 'cierre', b1, { forma: 'seña', monto: 5000 }, '2026-10-27 09:10:00');
const b2 = partida(U, 'Cliente Anterior Dos', 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-10-28 10:00:00');
msg(b2, 'cliente', 'hola, tienen lugar el viernes', 'whatsapp', '2026-10-28 10:00:00');
msg(b2, 'venty', 'hola, contame para cuántos', 'whatsapp', '2026-10-28 10:01:00');
ev(U, 'calificacion', b2, {}, '2026-10-28 10:01:00');
// --- semana actual (lunes 2026-11-02) ---
const a1 = partida(U, 'Cliente Uno', 'whatsapp', 'cerrada_ganada', 10000, 'pago total', 'whatsapp', '2026-11-02 09:00:00');
msg(a1, 'cliente', 'hola, cuánto sale', 'whatsapp', '2026-11-02 09:00:00');
msg(a1, 'venty', 'hola, sale diez mil', 'whatsapp', '2026-11-02 09:01:00');
ev(U, 'calificacion', a1, {}, '2026-11-02 09:01:00');
ev(U, 'cotizacion', a1, { monto: 10000 }, '2026-11-02 09:02:00');
ev(U, 'objecion', a1, { texto: 'está caro' }, '2026-11-02 09:03:00');
ev(U, 'cierre', a1, { forma: 'pago total', monto: 10000 }, '2026-11-02 09:20:00');
ev(U, 'resena_pedida', a1, {}, '2026-11-02 09:21:00');
const a2 = partida(U, 'Cliente Dos', 'whatsapp', 'cerrada_ganada', 24000, 'reserva sin seña', 'whatsapp', '2026-11-03 10:00:00');
msg(a2, 'cliente', 'hola, quiero reservar', 'whatsapp', '2026-11-03 10:00:00');
msg(a2, 'venty', 'dale, te reservo', 'whatsapp', '2026-11-03 10:03:00');
ev(U, 'cotizacion', a2, { monto: 24000 }, '2026-11-03 10:03:00');
ev(U, 'objecion', a2, { texto: 'está caro' }, '2026-11-03 10:04:00');
ev(U, 'ajuste', a2, { que: 'ofrecer la opción chica de entrada' }, '2026-11-03 10:05:00');
ev(U, 'cierre', a2, { forma: 'reserva sin seña', monto: 24000 }, '2026-11-03 10:06:00');
const a3 = partida(U, 'Cliente Tres', 'instagram', 'viva', 0, '', 'instagram', '2026-11-04 11:00:00');
msg(a3, 'cliente', 'hola, a qué hora entregan', 'instagram', '2026-11-04 11:00:00');
msg(a3, 'venty', 'entregamos desde las 8', 'instagram', '2026-11-04 11:02:00');
ev(U, 'calificacion', a3, {}, '2026-11-04 11:01:00');
ev(U, 'cotizacion', a3, { monto: 8000 }, '2026-11-04 11:02:00');
ev(U, 'objecion', a3, { texto: 'no llego con el horario' }, '2026-11-04 11:03:00');
const a4 = partida(U, 'Cliente Cuatro', 'whatsapp', 'cerrada_perdida', 0, '', 'whatsapp', '2026-11-05 12:00:00');
msg(a4, 'cliente', 'hola, cuánto sale el envío', 'whatsapp', '2026-11-05 12:00:00');
ev(U, 'calificacion', a4, {}, '2026-11-05 12:00:30');
ev(U, 'primera_respuesta', a4, { ms: 90000 }, '2026-11-05 12:01:30');
const a5 = partida(U, 'Cliente Cinco', 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-11-06 13:00:00');
msg(a5, 'cliente', 'hola, reservo para el sábado', 'whatsapp', '2026-11-06 13:00:00');
msg(a5, 'venty', 'listo, reservado', 'whatsapp', '2026-11-06 13:01:00');
ev(U, 'cotizacion', a5, { monto: 12000 }, '2026-11-06 13:01:00');
ev(U, 'turno', a5, { cuando: '2026-11-07 10:00:00' }, '2026-11-06 13:02:00');
ev(U, 'no_show', a5, {}, '2026-11-07 10:30:00');
const a6 = partida(U, 'Prospecto Seis', 'instagram', 'viva', 0, '', 'caza', '2026-11-07 14:00:00');
msg(a6, 'venty', 'hola, te escribo por una propuesta', 'instagram', '2026-11-07 14:00:00');
ev(U, 'caza_contacto', a6, { tier: 'A' }, '2026-11-07 14:00:00');
db.prepare(`INSERT INTO venty_leads (user_id, zona_id, nombre, nombre_norm, canal_preferido, contacto_ref, puntaje, porque, estado, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
  .run(U, null, 'Prospecto Seis', 'prospecto seis', 'instagram', '@seis', 90, 'tiene que buscar clientes', 'pendiente', '2026-11-03 09:00:00');

console.log('— A. parte real que cuadra al número');
{
  const p = med.computarParteReal(db, U, '2026-11-02', { ahora: '2026-11-08 09:00:00' });
  eq(p.emitido, true, 'parte emitido con datos');
  eq(p.semana, '2026-11-02', 'semana = lunes 2026-11-02');
  eq(p.consultas, 6, 'consultas: 6 partidas creadas en la semana');
  eq(p.calificadas, 5, 'calificadas: 5 (calificacion o cotizacion, distintas)');
  eq(p.cotizadas, 4, 'cotizadas: 4');
  eq(p.ventas, 2, 'ventas: 2 cierres');
  eq(p.monto, 34000, 'monto: 10000 + 24000 = 34000');
  eq(p.turnos, 2, 'turnos: reserva de a2 + evento turno de a5');
  eq(p.no_shows, 1, 'no-shows: 1 evento no_show (medido, no constante)');
  eq(p.primera_respuesta_seg, 102, 'primera respuesta: promedio (60+180+120+90+60)/5 = 102');
  eq(p.primera_respuesta_medidas, 5, 'primera respuesta: 5 medidas (4 por mensajes + 1 por evento)');
  eq(p.tasa_cierre_pct, 40, 'tasa de cierre: ventas 2 / calificadas 5 = 40%');
  eq(p.objecion_mas_frecuente, 'está caro', 'objeción que más frenó: textual del registro');
  eq(p.objecion_veces, 2, 'objeción repetida 2 veces');
  eq(p.ajuste, 'ofrecer la opción chica de entrada', 'qué ajustó: del evento ajuste');
  eq(JSON.stringify(p.aprendio_semana), JSON.stringify(['ofrecer la opción chica de entrada']), 'lo que tu oficina aprendió: lista de ajustes');
  eq(p.lineas.length, 9, 'formato fijo: 9 líneas');
  ok(p.saliente.hay_datos, 'saliente: hay datos');
  eq(p.saliente.prospectos_nuevos, 1, 'saliente: 1 lead nuevo en la semana');
  eq(p.saliente.contactos_salientes, 1, 'saliente: 1 contacto (caza_contacto)');
  eq(p.saliente.partidas_de_caza, 1, 'saliente: 1 partida de caza');
  eq(p.saliente.ventas_de_caza, 0, 'saliente: 0 ventas de caza');
  eq(p.fuente, 'registro', 'fuente: registro');
}

console.log('— B. comparación con la semana anterior real');
{
  const p = med.computarParteReal(db, U, '2026-11-02', { ahora: '2026-11-08 09:00:00' });
  const c = p.comparacion;
  eq(c.hay_anterior, true, 'comparación: hay semana anterior');
  eq(c.semana_anterior, '2026-10-26', 'semana anterior = 2026-10-26');
  eq(c.anterior.consultas, 2, 'anterior: 2 consultas');
  eq(c.anterior.calificadas, 2, 'anterior: 2 calificadas');
  eq(c.anterior.cotizadas, 1, 'anterior: 1 cotizada');
  eq(c.anterior.ventas, 1, 'anterior: 1 venta');
  eq(c.anterior.monto, 5000, 'anterior: monto 5000');
  eq(c.anterior.primera_respuesta_seg, 180, 'anterior: primera respuesta (300+60)/2 = 180');
  eq(c.anterior.tasa_cierre_pct, 50, 'anterior: tasa 1/2 = 50%');
  eq(c.deltas.consultas, 4, 'delta consultas: 6-2 = +4');
  eq(c.deltas.calificadas, 3, 'delta calificadas: 5-2 = +3');
  eq(c.deltas.cotizadas, 3, 'delta cotizadas: 4-1 = +3');
  eq(c.deltas.ventas, 1, 'delta ventas: 2-1 = +1');
  eq(c.deltas.monto, 29000, 'delta monto: 34000-5000 = +29000');
  eq(c.deltas.turnos, 2, 'delta turnos: 2-0 = +2');
  eq(c.deltas.no_shows, 1, 'delta no-shows: 1-0 = +1');
  eq(c.deltas.primera_respuesta_seg, -78, 'delta primera respuesta: 102-180 = -78');
  eq(c.deltas.tasa_cierre_pct, -10, 'delta tasa: 40-50 = -10');
}

console.log('— C. sin datos: el parte no se emite');
{
  const vacio = med.computarParteReal(db, 99, '2026-11-02');
  eq(vacio.emitido, false, 'usuario sin registro: no emitido');
  eq(vacio.razon, 'sin_datos', 'razón: sin_datos');
  eq(vacio.comparacion, null, 'sin parte no hay comparación inventada');
  const soloAnterior = med.computarParteReal(db, U, '2026-11-09', { ahora: '2026-11-16 09:00:00' });
  eq(soloAnterior.emitido, false, 'semana sin movimientos: no emitido aunque la anterior tuvo datos');
  const sinAnterior = med.computarParteReal(db, U, '2026-10-26', { ahora: '2026-11-01 09:00:00' });
  eq(sinAnterior.emitido, true, 'semana anterior como actual: emitido');
  eq(sinAnterior.comparacion.hay_anterior, false, 'sin semana previa con datos: comparación lo dice, deltas null');
  eq(sinAnterior.comparacion.deltas, null, 'deltas null cuando no hay anterior (nunca valores de ejemplo)');
}

console.log('— D. saliente sin datos: la sección lo refleja');
{
  const U2 = 12;
  const x = partida(U2, 'Cliente Solo', 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-11-02 08:00:00');
  msg(x, 'cliente', 'hola', 'whatsapp', '2026-11-02 08:00:00');
  msg(x, 'venty', 'hola, contame', 'whatsapp', '2026-11-02 08:01:00');
  ev(U2, 'cotizacion', x, { monto: 1000 }, '2026-11-02 08:01:00');
  const p = med.computarParteReal(db, U2, '2026-11-02');
  eq(p.emitido, true, 'parte emitido (hubo consulta y cotización)');
  eq(p.saliente.hay_datos, false, 'saliente: hay_datos false sin leads ni contactos');
  ok(/sin datos salientes/.test(p.saliente.nota), 'saliente: la nota lo refleja sin inventar');
  eq(p.tasa_cierre_pct, 0, 'tasa con calificadas y sin ventas: 0 medido (no null)');
}

console.log('— E. frase y línea norte desde el registro');
{
  const f = med.computarFraseReal(db, U, { fecha: '2026-11-02', ahora: '2026-11-02 23:00:00' });
  eq(f.ventas_hoy, 1, 'frase: 1 venta el 2026-11-02 (cierre de a1)');
  eq(f.monto_hoy, 10000, 'frase: monto de hoy 10000');
  eq(f.consultas_hoy, 1, 'frase: 1 consulta creada hoy');
  eq(f.frase, 'hoy cerraste 1 venta por $10.000 · 4 conversaciones vivas', 'frase exacta computada del registro (vivas: b2, a3, a5 y a6)');
  const n = med.computarLineaNorteReal(db, U, '2026-11-02');
  eq(n.tasa_cierre_pct, 40, 'línea norte: tasa 40 (misma definición que el parte)');
  eq(n.primera_respuesta_seg, 102, 'línea norte: primera respuesta 102');
  const vacia = med.computarFraseReal(db, 99, { fecha: '2026-11-02' });
  eq(vacia.frase, 'hoy no entró ninguna consulta todavía, venty está buscando', 'sin registro: la frase lo dice sin humo');
  eq(vacia.tasa_cierre_pct, null, 'sin registro: tasa null, nunca 0 inventado');
}

console.log('— F. alertas de canal caído');
{
  const U3 = 11;
  const vieja = partida(U3, 'Cliente Olvidado', 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-11-12 08:00:00');
  msg(vieja, 'cliente', 'hola, necesito una reserva', 'whatsapp', '2026-11-12 08:00:00');
  const fresca = partida(U3, 'Cliente Fresco', 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-11-12 09:55:00');
  msg(fresca, 'cliente', 'hola', 'whatsapp', '2026-11-12 09:55:00');
  const respondida = partida(U3, 'Cliente Respondido', 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-11-12 07:00:00');
  msg(respondida, 'cliente', 'hola', 'whatsapp', '2026-11-12 07:00:00');
  msg(respondida, 'venty', 'hola, te ayudo', 'whatsapp', '2026-11-12 07:01:00');
  const cerrada = partida(U3, 'Cliente Cerrado', 'whatsapp', 'cerrada_ganada', 100, 'pago total', 'whatsapp', '2026-11-12 06:00:00');
  msg(cerrada, 'cliente', 'hola', 'whatsapp', '2026-11-12 06:00:00');
  const alertas = med.detectarSinResponder(db, U3, { ahora: '2026-11-12 10:30:00' });
  eq(alertas.length, 1, 'alertas: solo la viva vieja sin responder (fresca, respondida y cerrada quedan fuera)');
  eq(alertas[0].partida_id, vieja, 'alerta: partida correcta');
  eq(alertas[0].minutos_sin_respuesta, 150, 'alerta: 150 minutos medidos desde el timestamp');
  eq(alertas[0].grave, true, 'alerta: marcada grave');
  ok(/falta grave/.test(alertas[0].texto), 'alerta: el texto dice falta grave');
  const parte = med.computarParteReal(db, U3, '2026-11-09', { ahora: '2026-11-12 10:30:00' });
  eq(parte.emitido, true, 'parte de la semana de la alerta: emitido (hubo consultas)');
  eq(parte.alertas_canal.length, 1, 'el parte trae la alerta de canal caído');
  ok(parte.lineas.some((l) => /sin responder, falta grave/.test(l)), 'el parte lo dice explícitamente en sus líneas');
  const sinUmbral = med.detectarSinResponder(db, U3, { ahora: '2026-11-12 08:30:00' });
  eq(sinUmbral.length, 0, 'antes del umbral (60 min) no hay alerta: no se grita antes de tiempo');
}

console.log('— G. niveles con hechos');
{
  const sinHechos = med.computarNivel(db, 98);
  eq(sinHechos.nivel, 1, 'sin hechos: nivel inicial 1');
  eq(sinHechos.nombre, 'recién sentado al tablero', 'nivel 1: nombre de ajedrez del plan');
  eq(sinHechos.sin_hechos, true, 'sin hechos: lo dice (sin_hechos true)');
  ok(/todavía no hay hechos registrados/.test(sinHechos.texto_falta), 'sin hechos: el texto lo dice y lista qué falta');
  ok(sinHechos.que_falta.length >= 1, 'sin hechos: qué falta para subir viene calculado');

  const U4 = 21;
  for (let i = 0; i < 5; i++) ev(U4, 'pago_suscripcion', null, { monto: 300 }, '2026-11-02 09:00:00');
  eq(med.computarNivel(db, U4).nivel, 1, 'pagar no sube: 5 eventos de pago dejan el nivel en 1');

  // usuario 9: hechos para nivel 3 exactos
  const U5 = 9;
  ev(U5, 'lectura_fuente', null, { fuente: 'lista cargada' }, '2026-11-01 09:00:00');
  for (let i = 1; i <= 10; i++) {
    const pid = partida(U5, 'Cliente Nivel ' + i, 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-11-02 09:00:00');
    ev(U5, 'primera_respuesta', pid, { ms: 30000 }, '2026-11-02 09:01:00');
    ev(U5, 'cotizacion', pid, { monto: 1000 }, '2026-11-02 09:02:00');
    if (i <= 3) ev(U5, 'objecion', pid, { texto: 'objeción número ' + i }, '2026-11-02 09:03:00');
    if (i === 1) { ev(U5, 'cierre', pid, { forma: 'pago total', monto: 1000 }, '2026-11-02 09:04:00'); ev(U5, 'resena_pedida', pid, {}, '2026-11-02 09:05:00'); }
  }
  const n3 = med.computarNivel(db, U5);
  eq(n3.nivel, 3, 'con los hechos de las compuertas 2 y 3: nivel 3');
  eq(n3.nombre, 'jugando de memoria', 'nivel 3: jugando de memoria');
  eq(n3.siguiente_nivel, 4, 'siguiente: 4');
  const faltaPartes = n3.que_falta.find((f) => f.clave === 'partes_emitidos');
  ok(faltaPartes && faltaPartes.falta === 4 && faltaPartes.hecho === 0, 'qué falta: 4 partes emitidos (0 de 4)');
  // nunca baja: pasa el tiempo y entran hechos irrelevantes, el nivel queda
  ev(U5, 'freno', null, { pausado: true }, '2026-12-01 09:00:00');
  ev(U5, 'freno', null, { pausado: false }, '2026-12-02 09:00:00');
  eq(med.computarNivel(db, U5).nivel, 3, 'el nivel no baja con el tiempo ni con hechos irrelevantes');
  // un usuario con solo la compuerta 2 queda en 2
  const U6 = 22;
  const q = partida(U6, 'Cliente Dos Pasos', 'whatsapp', 'viva', 0, '', 'whatsapp', '2026-11-02 09:00:00');
  ev(U6, 'lectura_fuente', null, {}, '2026-11-02 09:00:00');
  ev(U6, 'primera_respuesta', q, { ms: 1000 }, '2026-11-02 09:00:30');
  ev(U6, 'cotizacion', q, { monto: 500 }, '2026-11-02 09:01:00');
  eq(med.computarNivel(db, U6).nivel, 2, 'solo compuerta 2: nivel 2, no salta a 3');
  eq(med.computarNivel(db, U6).nombre, 'leyendo tu partida', 'nivel 2: leyendo tu partida');
}

console.log('— H. jobs idempotentes');
{
  const j1 = med.jobParteSemanal(db, { userId: U, semana: '2026-11-02' });
  eq(j1.resultados[0].emitido, true, 'job semanal: parte emitido');
  const filas1 = db.prepare(`SELECT COUNT(*) c FROM venty_parte WHERE user_id = ? AND semana = '2026-11-02'`).get(U).c;
  eq(filas1, 1, 'job semanal: 1 fila en venty_parte');
  const ev1 = db.prepare(`SELECT COUNT(*) c FROM venty_eventos WHERE user_id = ? AND tipo = 'parte_emitido'`).get(U).c;
  eq(ev1, 1, 'job semanal: 1 evento parte_emitido');
  med.jobParteSemanal(db, { userId: U, semana: '2026-11-02' });
  med.jobParteSemanal(db, { userId: U, semana: '2026-11-02' });
  eq(db.prepare(`SELECT COUNT(*) c FROM venty_parte WHERE user_id = ? AND semana = '2026-11-02'`).get(U).c, 1, 'job semanal re-corrido 2 veces: sigue 1 fila (idempotente)');
  eq(db.prepare(`SELECT COUNT(*) c FROM venty_eventos WHERE user_id = ? AND tipo = 'parte_emitido'`).get(U).c, 1, 'job semanal re-corrido: sigue 1 evento parte_emitido');
  const jVacio = med.jobParteSemanal(db, { userId: 99, semana: '2026-11-02' });
  eq(jVacio.resultados[0].emitido, false, 'job semanal sin datos: no emite');
  eq(db.prepare(`SELECT COUNT(*) c FROM venty_parte WHERE user_id = 99`).get().c, 0, 'job semanal sin datos: ninguna fila guardada');

  const f1 = med.jobFraseDiaria(db, { userId: U, fecha: '2026-11-02', ahora: '2026-11-02 23:00:00' });
  eq(f1.procesados, 1, 'job frase: 1 usuario procesado');
  med.jobFraseDiaria(db, { userId: U, fecha: '2026-11-02', ahora: '2026-11-02 23:00:00' });
  const filasF = db.prepare(`SELECT COUNT(*) c, MIN(datos_json) d FROM venty_medicion_frase WHERE user_id = ? AND fecha = '2026-11-02'`).get(U);
  eq(filasF.c, 1, 'job frase re-corrido: 1 fila (idempotente)');
  eq(JSON.parse(filasF.d).frase, 'hoy cerraste 1 venta por $10.000 · 4 conversaciones vivas', 'job frase: la frase guardada es la computada');

  // registrarJobs con un cron falso: registra 2 y no duplica
  const expresiones = [];
  const cronFalso = { schedule: (expr) => { expresiones.push(expr); } };
  eq(med.registrarJobs(cronFalso, db), true, 'registrarJobs: registra');
  eq(expresiones.length, 2, 'registrarJobs: 2 expresiones (diaria y semanal del viernes)');
  ok(expresiones.some((e) => e.endsWith('* * 5')), 'registrarJobs: la semanal corre los viernes');
  eq(med.registrarJobs(cronFalso, db), false, 'registrarJobs: segunda vez sobre la misma db no duplica');
}

console.log('— I. voz de venty en los textos generados');
{
  const textos = [];
  const p = med.computarParteReal(db, U, '2026-11-02', { ahora: '2026-11-08 09:00:00' });
  textos.push(...p.lineas);
  textos.push(med.computarFraseReal(db, U, { fecha: '2026-11-02' }).frase);
  textos.push(med.computarNivel(db, 98).texto_falta);
  textos.push(med.computarParteReal(db, 99, '2026-11-02').texto);
  for (const a of med.detectarSinResponder(db, 11, { ahora: '2026-11-12 10:30:00' })) textos.push(a.texto);
  // la verificación fina de signos la hace el chequeo python del lote;
  // acá se controla que ningún texto arranque con mayúscula
  ok(textos.every((t) => !/^[A-ZÁÉÍÓÚÑ]/.test(t)), 'ningún texto de venty arranca con mayúscula');
  ok(textos.length >= 10, 'textos recolectados para la verificación de voz');
}

console.log(`\n— venty-slice5-medicion (unit): ${total - fails}/${total} OK, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
