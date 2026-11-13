// test-lote-venty-slice3-cierre.js — SLICE 3 CIERRE REAL: unitarias con DB
// en memoria (node:sqlite). Maquinaria GENÉRICA (ningún negocio atado):
// cierre con link de pago del negocio desde el fundamento, registro y
// conciliación (monto + titular), aviso al dueño por umbral, reseña de
// Google solo dentro de la conversación de cierre, agenda anti no-show
// (confirmación + recordatorios día anterior y mismo día como trabajos
// programados, reagendar/cancelar dentro de políticas, no-show como
// hecho) y escalación (ticket alto e inmuebles no cierran: califican,
// agendan visita y escalan; escalación general con resumen + jugada
// recomendada). Todo en modo prueba: ningún cobro real, ningún secreto.
// Criterio de salida del plan: cierre completo de prueba sin intervención,
// un turno con su anti no-show disparado, un pago que no cuadra no cierra
// y escala.
// Uso: node test-lote-venty-slice3-cierre.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

const venty = require('./venty');
const cierre = require('./venty-cierre');
const agenda = require('./venty-agenda');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const db = new DatabaseSync(':memory:');
venty.init(db);
cierre.ensureSchema(db);
agenda.ensureSchema(db);

const LINK = 'https://link.prueba/negocio-generico';
const RESENA = 'https://resena.prueba/negocio-generico';

function usuarioConConfig(uid, extra) {
  venty.asegurarSemilla(db, uid);
  const r = cierre.fijarConfigCierre(db, uid, {
    link_pago: LINK, proveedor: 'proveedor_prueba', credencial_ref: 'VENTY_PAGO_PRUEBA_REF',
    umbral_aviso_dueno: 20000, resena_google_url: RESENA, ...(extra || {}),
  });
  if (!r.ok) throw new Error('config: ' + r.error);
  return r;
}
function nuevaPartida(uid, nombre, canal) {
  const ahora = venty.hoyYmd() + ' 09:00:00';
  const r = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uid, nombre, canal || 'simulacion', 'viva', 'gastronomía', 0, '', '', 0, '', 'simulacion', ahora, ahora);
  return Number(r.lastInsertRowid);
}
function partida(uid, id) { return db.prepare('SELECT * FROM venty_partidas WHERE id = ? AND user_id = ?').get(id, uid); }
function mensajes(uid, id) { return db.prepare('SELECT * FROM venty_mensajes WHERE partida_id = ? ORDER BY id ASC').all(id); }
function mensajesVenty(uid, id) { return mensajes(uid, id).filter((m) => m.autor === 'venty'); }

// ---------- A. Config de cierre: solo refs, nunca secretos ----------
console.log('— A. venty-cierre: config desde el fundamento, fail-closed con secretos');
{
  const U = 101;
  venty.asegurarSemilla(db, U);
  eq(cierre.fijarConfigCierre(db, U, { token: 'abc' }).error, 'campo_no_permitido', 'campo token → rechazado');
  eq(cierre.fijarConfigCierre(db, U, { api_key: 'abc' }).error, 'campo_no_permitido', 'campo api_key → rechazado');
  eq(cierre.fijarConfigCierre(db, U, { credencial_ref: 'sk-' + 'x'.repeat(48) }).error, 'credencial_ref_parece_secreto', 'credencial_ref que parece secreto → rechazado');
  eq(cierre.fijarConfigCierre(db, U, { link_pago: 'http://inseguro.example' }).error, 'link_pago_invalido', 'link sin https → inválido');
  const r = usuarioConConfig(U);
  eq(r.cierre.link_pago, LINK, 'config: link del negocio guardado en el fundamento');
  eq(r.cierre.modo, 'prueba', 'config: modo siempre prueba');
  eq(r.cierre.sena_pct, 30, 'config: seña 30% heredada de politicas.grupo_sena_pct de la semilla');
  const f = venty.leerFundamento(db, U);
  eq(f.politicas.grupo_sena_desde, 7, 'config: el resto de políticas del fundamento queda intacto');
  ok(!JSON.stringify(f.politicas).includes('sk-'), 'config: ningún secreto quedó en el fundamento');
}

// ---------- B. Cierre completo de prueba, sin intervención ----------
console.log('— B. cierre completo: consulta → cotización → link → pago conciliado → cerrada_ganada → reseña');
{
  const U = 102;
  usuarioConConfig(U);
  const pid = nuevaPartida(U, 'Ana Prueba');
  const j1 = venty.jugarMensaje(db, U, pid, 'hola, cuánto sale el brunch para dos?');
  ok(j1.ok && j1.cotizacion && j1.cotizacion.total === 24000, 'cotización desde la lista: brunch $24.000');
  const ini = cierre.iniciarCierre(db, U, pid, { tipo: 'total', ahora: '2026-11-12 10:00:00' });
  ok(ini.ok && ini.estado === 'esperando_pago', 'iniciarCierre: partida esperando pago');
  eq(ini.pago.monto_esperado, 24000, 'pago esperado = lo cotizado');
  eq(ini.pago.modo, 'prueba', 'pago en modo prueba (ningún cobro real)');
  eq(ini.pago.titular_esperado, 'Ana Prueba', 'titular esperado: el cliente de la partida (sin config explícita)');
  ok(ini.mensajes.some((m) => m === LINK), 'el link del negocio salió dentro de la conversación');
  eq(partida(U, pid).estado, 'esperando_pago', 'partida esperando_pago en el registro');
  const ini2 = cierre.iniciarCierre(db, U, pid, { tipo: 'total' });
  ok(ini2.ok && ini2.ya === true && ini2.pago.id === ini.pago.id, 'iniciarCierre dos veces: idempotente, un solo pago');
  eq(cierre.listarPagos(db, U, { partida_id: pid }).length, 1, 'un solo registro de pago');
  // Aviso: 24000 >= umbral 20000 → aviso al dueño en el momento.
  const reg = cierre.registrarPago(db, U, { partida_id: pid, monto: 24000, titular: 'ana prueba', referencia: 'comp-prueba-1', ahora: '2026-11-12 10:05:00' });
  ok(reg.ok && reg.conciliado === true, 'pago conciliado (titular normalizado: mayúsculas/acentos no frenan)');
  eq(reg.estado_partida, 'cerrada_ganada', 'la partida pasó a cerrada_ganada sin intervención');
  eq(partida(U, pid).monto, 24000, 'monto cerrado registrado');
  eq(partida(U, pid).forma_cierre, 'pago total conciliado', 'forma de cierre registrada');
  ok(reg.aviso_dueno === true, 'pago >= umbral → aviso al dueño');
  const jugAviso = venty.listarBandeja(db, U).find((j) => j.tipo === 'aviso_pago');
  ok(!!jugAviso && jugAviso.propuesta.monto === 24000, 'Bandeja: jugada aviso_pago con el monto');
  ok(!!db.prepare(`SELECT id FROM venty_eventos WHERE user_id = ? AND partida_id = ? AND tipo = 'pago_conciliado'`).get(U, pid), 'evento pago_conciliado registrado');
  ok(reg.mensajes.some((m) => m.includes('quedó registrado')), 'confirmación del pago dentro de la conversación');
  // Reseña: pedida automáticamente tras ganar, dentro de la misma conversación.
  ok(reg.resena && reg.resena.ok === true, 'reseña pedida al cerrar');
  const msgs = mensajesVenty(U, pid);
  ok(msgs.some((m) => m.texto.includes('reseña en google')), 'el pedido de reseña está en el hilo de la partida');
  ok(msgs.some((m) => m.texto === RESENA), 'el link de reseña salió en la misma conversación');
  eq(cierre.listarResenas(db, U).length, 1, 'reseña registrada una vez');
  eq(cierre.pedirResena(db, U, pid, {}).kind, 'resena_ya_pedida', 'segunda vez: no se vuelve a pedir');
  eq(mensajesVenty(U, pid).filter((m) => m.texto.includes('reseña en google')).length, 1, 'un solo mensaje de reseña en el hilo');
}

// ---------- C. Pago que no cuadra: no cierra y escala ----------
console.log('— C. conciliación: monto o titular que no cuadran → no cierra, escala a Bandeja');
{
  const U = 103;
  usuarioConConfig(U);
  const pid = nuevaPartida(U, 'Beto Prueba');
  venty.jugarMensaje(db, U, pid, 'cuánto sale el brunch para dos?');
  cierre.iniciarCierre(db, U, pid, { tipo: 'total', ahora: '2026-11-12 11:00:00' });
  const mal = cierre.registrarPago(db, U, { partida_id: pid, monto: 20000, titular: 'Beto Prueba', referencia: 'comp-malo', ahora: '2026-11-12 11:05:00' });
  ok(!mal.ok && mal.kind === 'no_cuadra', 'monto distinto → no_cuadra');
  ok(mal.motivo.includes('el monto no cuadra'), 'motivo: el monto no cuadra');
  eq(partida(U, pid).estado, 'esperando_pago', 'la partida NO cerró (sigue esperando pago)');
  const jug = venty.listarBandeja(db, U).find((j) => j.tipo === 'pago_no_cuadra');
  ok(!!jug, 'Bandeja: jugada pago_no_cuadra');
  ok(jug && jug.porque.includes('no cuadró'), 'Bandeja: el porqué dice que no cuadró');
  ok(jug && jug.propuesta.jugada_recomendada && jug.propuesta.contexto && jug.propuesta.contexto.cliente === 'Beto Prueba', 'Bandeja: jugada recomendada + contexto completo');
  ok(!!db.prepare(`SELECT id FROM venty_eventos WHERE user_id = ? AND tipo = 'escalacion' AND partida_id = ?`).get(U, pid), 'evento de escalación registrado');
  const mal2 = cierre.registrarPago(db, U, { partida_id: pid, monto: 24000, titular: 'Otra Persona', referencia: 'comp-malo-2' });
  ok(!mal2.ok && mal2.motivo.includes('el titular no cuadra'), 'titular distinto → no_cuadra por titular');
  eq(partida(U, pid).estado, 'esperando_pago', 'sigue sin cerrar tras el segundo intento');
  const bien = cierre.registrarPago(db, U, { partida_id: pid, monto: 24000, titular: 'Beto Prueba', referencia: 'comp-bueno' });
  ok(bien.ok && bien.estado_partida === 'cerrada_ganada', 'el pago corregido se re-registra y cierra solo');
  eq(cierre.registrarPago(db, U, { partida_id: pid, monto: 24000, titular: 'Beto Prueba' }).kind, 'pago_no_encontrado', 'sin pago esperando: no se inventa conciliación');
}

// ---------- D. Sin link en el fundamento: no se cobra por Venty ----------
console.log('— D. sin link de pago en el fundamento → no arranca y pide el dato en Bandeja');
{
  const U = 104;
  venty.asegurarSemilla(db, U);
  const pid = nuevaPartida(U, 'Caro Prueba');
  venty.jugarMensaje(db, U, pid, 'cuánto sale el brunch para dos?');
  const r = cierre.iniciarCierre(db, U, pid, {});
  ok(!r.ok && r.kind === 'sin_link_pago', 'sin link → sin_link_pago');
  eq(partida(U, pid).estado, 'viva', 'la partida sigue viva, no esperando un pago inventado');
  eq(cierre.listarPagos(db, U, { partida_id: pid }).length, 0, 'ningún pago creado');
  ok(venty.listarBandeja(db, U).some((j) => j.tipo === 'dato_faltante'), 'Bandeja: dato_faltante pide cargar el link del negocio');
}

// ---------- E. Seña según política del fundamento ----------
console.log('— E. cierre con seña (pct del fundamento)');
{
  const U = 105;
  usuarioConConfig(U);
  const pid = nuevaPartida(U, 'Dani Prueba');
  venty.jugarMensaje(db, U, pid, 'cuánto sale el brunch para dos?');
  const ini = cierre.iniciarCierre(db, U, pid, { tipo: 'sena' });
  ok(ini.ok && ini.pago.monto_esperado === 7200, 'seña = 30% de $24.000 = $7.200');
  const reg = cierre.registrarPago(db, U, { partida_id: pid, monto: 7200, titular: 'Dani Prueba', referencia: 'sena-1' });
  ok(reg.ok && partida(U, pid).forma_cierre === 'seña conciliada', 'seña conciliada cierra como seña');
  ok(reg.aviso_dueno === false, 'seña bajo el umbral → sin aviso al dueño');
}

// ---------- F. Reseña: solo tras ganar, solo en la conversación ----------
console.log('— F. reseña de Google: guardas');
{
  const U = 106;
  usuarioConConfig(U);
  const pid = nuevaPartida(U, 'Eli Prueba');
  const antes = mensajesVenty(U, pid).length;
  eq(cierre.pedirResena(db, U, pid, {}).kind, 'partida_no_ganada', 'partida viva → la reseña no se pide');
  eq(mensajesVenty(U, pid).length, antes, 'ningún mensaje de reseña salió');
  eq(cierre.listarResenas(db, U).length, 0, 'ningún registro de reseña');
  // La semilla de Martín ya ganó y ya tiene reseña pedida (slice 1): el
  // registro previo manda, no se pide de nuevo.
  const semilla = venty.listarPartidas(db, U).find((p) => p.cliente_nombre === 'Martín');
  eq(cierre.pedirResena(db, U, semilla.id, {}).kind, 'resena_ya_pedida', 'semilla Martín: reseña previa detectada, no se repite');
  eq(cierre.listarResenas(db, U).filter((r) => r.partida_id === semilla.id).length, 1, 'la reseña previa queda registrada en la tabla nueva');
}

// ---------- G. Ticket alto e inmuebles: no cierran, escalan ----------
console.log('— G. escalación previa: ticket alto e inmuebles');
{
  const U = 107;
  usuarioConConfig(U, { ticket_alto_desde: 10000 });
  const pid = nuevaPartida(U, 'Fede Prueba');
  venty.jugarMensaje(db, U, pid, 'cuánto sale el brunch para dos?');
  const r = cierre.iniciarCierre(db, U, pid, { fecha_visita: '2026-11-20 10:00:00', ahora: '2026-11-12 12:00:00' });
  ok(!r.ok && r.kind === 'escalada' && r.tipo === 'ticket_alto', 'ticket alto (>= umbral) → escalada, no cierre');
  eq(partida(U, pid).estado, 'escalada', 'partida escalada');
  eq(cierre.listarPagos(db, U, { partida_id: pid }).length, 0, 'ticket alto: ningún pago creado');
  const jug = venty.listarBandeja(db, U).find((j) => j.tipo === 'escalacion');
  ok(!!jug && jug.propuesta.tipo === 'ticket_alto', 'Bandeja: escalación ticket_alto');
  ok(jug && jug.propuesta.contexto.ultimos_mensajes.length > 0 && !!jug.propuesta.jugada_recomendada, 'Bandeja: contexto completo + jugada recomendada');
  ok(!!r.visita && r.visita.tipo === 'visita', 'ticket alto: visita agendada');
  eq(agenda.listarTurnos(db, U, { partida_id: pid }).length, 1, 'la visita quedó en la agenda');
  // Inmuebles: rubro que escala siempre, aunque el monto sea chico.
  const U2 = 108;
  usuarioConConfig(U2, { escala_rubros: ['inmuebles'] });
  const pid2 = nuevaPartida(U2, 'Gala Prueba');
  db.prepare(`UPDATE venty_partidas SET modo_rubro = 'inmuebles', monto = 5000 WHERE id = ?`).run(pid2);
  const r2 = cierre.iniciarCierre(db, U2, pid2, { fecha_visita: '2026-11-21 11:00:00', ahora: '2026-11-12 12:00:00' });
  ok(!r2.ok && r2.kind === 'escalada' && r2.tipo === 'inmuebles', 'inmuebles → escalada aunque el monto sea chico');
  ok(!!r2.visita, 'inmuebles: visita agendada');
  eq(cierre.listarPagos(db, U2, { partida_id: pid2 }).length, 0, 'inmuebles: ningún pago creado');
}

// ---------- H. Escalación general con resumen + jugada recomendada ----------
console.log('— H. escalación general (V-10)');
{
  const U = 109;
  usuarioConConfig(U);
  const pid = nuevaPartida(U, 'Hugo Prueba');
  venty.jugarMensaje(db, U, pid, 'hola, cuánto sale el brunch para dos?');
  const r = cierre.escalarPartida(db, U, pid, { tipo: 'queja', resumen: 'el cliente se quejó del horario de entrega', jugada_recomendada: 'ofrecer la franja de las 8:00 y un café de cortesía' });
  ok(r.ok && r.estado === 'escalada', 'queja → partida escalada');
  const jug = venty.listarBandeja(db, U).find((j) => j.id === r.jugada_id);
  ok(jug.propuesta.resumen.includes('se quejó') && jug.propuesta.jugada_recomendada.includes('franja de las 8:00'), 'Bandeja: resumen + jugada recomendada');
  ok(jug.propuesta.contexto.cotizacion && jug.propuesta.contexto.cotizacion.monto === 24000, 'Bandeja: contexto con la cotización');
  const otra = nuevaPartida(U, 'Iris Prueba');
  eq(partida(U, otra).estado, 'viva', 'escalar una partida no frena las demás');
}

// ---------- I. Agenda anti no-show: ciclo completo ----------
console.log('— I. venty-agenda: turno, recordatorios, reagendar, cancelar, no-show');
{
  const U = 110;
  usuarioConConfig(U); // la semilla trae cancelacion_sin_cargo_horas = 2
  const pid = nuevaPartida(U, 'Juan Prueba');
  eq(agenda.configAgenda(db, U).sistema, 'propia', 'sin sistema declarado → agenda mínima propia');
  eq(agenda.configAgenda(db, U).cancelacion_sin_cargo_horas, 2, 'ventana de política: 2 h (de la semilla)');
  const t = agenda.crearTurno(db, U, pid, { inicio_at: '2026-11-15 10:00:00', ahora: '2026-11-12 09:00:00' });
  ok(t.ok && t.turno.estado === 'confirmado', 'turno creado y confirmado');
  eq(t.trabajos.length, 3, 'tres trabajos: confirmación + día anterior + mismo día');
  const porTipo = Object.fromEntries(t.trabajos.map((x) => [x.tipo, x.programado_para]));
  eq(porTipo.recordatorio_dia_anterior, '2026-11-14 10:00:00', 'recordatorio día anterior: 24 h antes');
  eq(porTipo.recordatorio_mismo_dia, '2026-11-15 09:00:00', 'recordatorio mismo día: 09:00 de ese día');
  ok(t.mensajes.some((m) => m.includes('quedó para el 15/11')), 'confirmación dentro de la conversación');
  // El despachador dispara lo vencido, una sola vez.
  const d1 = agenda.procesarTrabajos(db, U, { ahora: '2026-11-12 09:01:00' });
  eq(d1.cantidad, 1, 'al crear: solo la confirmación está vencida');
  const d2 = agenda.procesarTrabajos(db, U, { ahora: '2026-11-14 10:00:01' });
  eq(d2.cantidad, 1, 'día anterior: el recordatorio anti no-show disparó');
  ok(d2.disparados[0].mensaje.includes('mañana'), 'mensaje del día anterior en la conversación');
  eq(agenda.procesarTrabajos(db, U, { ahora: '2026-11-14 10:00:01' }).cantidad, 0, 'un trabajo disparado no se repite');
  const d3 = agenda.procesarTrabajos(db, U, { ahora: '2026-11-15 09:00:00' });
  eq(d3.cantidad, 1, 'mismo día: el segundo recordatorio disparó');
  ok(!!db.prepare(`SELECT id FROM venty_eventos WHERE user_id = ? AND tipo = 'recordatorio_enviado' AND partida_id = ?`).get(U, pid), 'eventos de recordatorio registrados');
  // Reagendar dentro de políticas: se reprograman los recordatorios.
  const t2 = agenda.crearTurno(db, U, pid, { inicio_at: '2026-11-18 12:00:00', ahora: '2026-11-12 09:00:00' });
  const re = agenda.reagendarTurno(db, U, t2.turno.id, { nuevo_inicio_at: '2026-11-19 12:00:00', ahora: '2026-11-12 10:00:00' });
  ok(re.ok && re.turno.inicio_at === '2026-11-19 12:00:00', 'reagendar dentro de políticas: ok');
  const trabajos2 = agenda.listarTrabajos(db, U, { turno_id: t2.turno.id });
  ok(trabajos2.filter((x) => x.estado === 'cancelado').length >= 2, 'reagendar: trabajos viejos cancelados');
  ok(trabajos2.some((x) => x.estado === 'pendiente' && x.tipo === 'recordatorio_dia_anterior' && x.programado_para === '2026-11-18 12:00:00'), 'reagendar: recordatorios reprogramados a la nueva fecha');
  // Cancelar dentro de políticas: libera el lugar y apaga los recordatorios.
  const ca = agenda.cancelarTurno(db, U, t2.turno.id, { ahora: '2026-11-12 11:00:00' });
  ok(ca.ok && ca.turno.estado === 'cancelado' && ca.lugar_liberado === true, 'cancelar dentro de políticas: ok, lugar liberado');
  eq(agenda.procesarTrabajos(db, U, { ahora: '2026-11-19 12:00:00' }).disparados.filter((d) => d.turno_id === t2.turno.id).length, 0, 'turno cancelado: ningún recordatorio dispara');
  // Fuera de políticas: turno en 1 h con ventana de 2 h → no se mueve ni se cancela.
  const t3 = agenda.crearTurno(db, U, pid, { inicio_at: '2026-11-12 13:00:00', ahora: '2026-11-12 09:00:00' });
  const reMal = agenda.reagendarTurno(db, U, t3.turno.id, { nuevo_inicio_at: '2026-11-13 13:00:00', ahora: '2026-11-12 12:00:00' });
  ok(!reMal.ok && reMal.kind === 'fuera_de_politica', 'reagendar a 1 h del turno (ventana 2 h) → fuera de política');
  const caMal = agenda.cancelarTurno(db, U, t3.turno.id, { ahora: '2026-11-12 12:00:00' });
  ok(!caMal.ok && caMal.kind === 'fuera_de_politica', 'cancelar a 1 h del turno → fuera de política');
  eq(agenda.listarTurnos(db, U, { partida_id: pid }).find((x) => x.id === t3.turno.id).estado, 'confirmado', 'el turno sigue confirmado tras los intentos fuera de política');
  // No-show: hecho registrado, no disfrazado.
  const ns = agenda.registrarNoShow(db, U, t.turno.id, { ahora: '2026-11-15 11:00:00' });
  ok(ns.ok && ns.turno.estado === 'no_show', 'no-show registrado en el turno');
  eq(agenda.contarNoShows(db, U, '2026-11-01', '2026-12-01'), 1, 'conteo de no-shows: 1');
  ok(!!db.prepare(`SELECT id FROM venty_eventos WHERE user_id = ? AND tipo = 'no_show' AND partida_id = ?`).get(U, pid), 'evento no_show registrado');
  eq(agenda.crearTurno(db, U, pid, { inicio_at: '2020-01-01 10:00:00' }).kind, 'fecha_pasada', 'turno en el pasado → rechazado');
  eq(agenda.crearTurno(db, U, 999999, { inicio_at: '2026-11-20 10:00:00' }).kind, 'partida_no_encontrada', 'partida inexistente → rechazado');
}

// ---------- J. Voz de Venty en todo lo que salió ----------
console.log('— J. voz: todo mensaje de venty pasa el validador y ningún texto lleva signos de apertura');
{
  const rows = db.prepare(`SELECT texto FROM venty_mensajes WHERE autor = 'venty'`).all();
  ok(rows.length > 20, `mensajes de venty generados en la suite: ${rows.length}`);
  ok(rows.every((r) => venty.validarVoz(r.texto).ok), 'todos los mensajes de venty pasan validarVoz');
  ok(rows.every((r) => !/[¿¡]/.test(r.texto)), 'ningún mensaje de venty lleva ¿ ni ¡');
  const jugadas = db.prepare(`SELECT porque FROM venty_jugadas`).all();
  ok(jugadas.every((r) => !/[¿¡]/.test(r.porque || '')), 'ningún porqué de Bandeja del lote lleva ¿ ni ¡');
}

db.close();
console.log(`\n— venty-slice3-cierre (unit): ${total - fails}/${total} OK, ${fails} FAIL`);
process.exit(fails ? 1 : 0);
