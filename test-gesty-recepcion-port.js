#!/usr/bin/env node
// test-gesty-recepcion-port.js — PORT v23+v24 a la app real.
// Cubre: un solo botón por turno (Confirmar -> El cliente llegó ->
// Su mesa está lista -> Atendido -> Pagos del día) · «Esperando ahora»
// siempre visible · llamado en turnosHoy · ruta atendido (cumplir) ->
// atendido sin pagar -> registrar cobro (el pago va directo al negocio,
// Gesty solo lo registra) · gating un solo agente (gesty_contratado) en
// Oficina/Negocio/Ajustes/Prueba · upsell en Ajustes · la palabra de la
// mesa (café) NO está hardcodeada en la app: el botón es genérico
// («Ya puede pasar») hasta que el fundamento traiga rubro estructurado.
// Uso: node test-gesty-recepcion-port.js
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 300) : ''); }
};

const gesty = require('./gesty.js');
const vistas = require('./gesty-vistas.js');
const agenda = require('./gesty-agenda.js');
const llegadas = require('./gesty-llegadas.js');
const sala = require('./gesty-sala-espera.js');
const confirmacion = require('./gesty-confirmacion-turnos.js');
const sinPagar = require('./gesty-atendidos-sin-pagar.js');
const variantes = require('./gesty-variantes.js');

const HOY = '2027-03-02';
function dbNueva() {
  const db = new DatabaseSync(':memory:');
  gesty.initGesty(db);
  gesty.setPack(db, 1, 'completa', { origen: 'test' });
  return db;
}
function turno(db, datos) {
  return agenda.crearEvento(db, 1, {
    titulo: datos.titulo || 'Turno', tipo: datos.tipo || 'turno',
    fecha: datos.fecha || HOY, hora: datos.hora || '10:00',
    duracion_min: 30,
    cliente_nombre: datos.nombre || 'Ana', cliente_contacto: datos.contacto || 'ana@test.com',
  }).evento;
}
function conEstado(db) {
  try { db.exec(`CREATE TABLE IF NOT EXISTS poderes_contratados (user_id INTEGER NOT NULL, poder TEXT NOT NULL, ts INTEGER NOT NULL, fuente TEXT NOT NULL DEFAULT '', PRIMARY KEY (user_id, poder))`); } catch (e) {}
  const cols = db.prepare(`PRAGMA table_info(poderes_contratados)`).all().map((c) => c.name);
  if (!cols.includes('estado')) { try { db.exec(`ALTER TABLE poderes_contratados ADD COLUMN estado TEXT DEFAULT 'active'`); } catch (e) {} }
}

function main() {
  // --- gesty_contratado ---
  const db0 = dbNueva(); conEstado(db0);
  ok('hoy: sin fila Gesty -> gesty_contratado false', vistas.gestyHoy(db0, 1, { hoy: HOY }).gesty_contratado === false);
  db0.prepare(`INSERT INTO poderes_contratados (user_id, poder, ts, fuente, estado) VALUES (1, 'gesty', ?, 'test', 'active')`).run(Date.now());
  ok('hoy: con fila active -> gesty_contratado true', vistas.gestyHoy(db0, 1, { hoy: HOY }).gesty_contratado === true);
  db0.prepare(`DELETE FROM poderes_contratados WHERE user_id = 1 AND poder = 'gesty'`).run();
  ok('hoy: fila borrada -> gesty_contratado false', vistas.gestyHoy(db0, 1, { hoy: HOY }).gesty_contratado === false);

  // Fallback sin columna estado (DB anterior a la migración).
  const dbF = dbNueva();
  dbF.exec(`CREATE TABLE IF NOT EXISTS poderes_contratados (user_id INTEGER NOT NULL, poder TEXT NOT NULL, ts INTEGER NOT NULL, fuente TEXT NOT NULL DEFAULT '', PRIMARY KEY (user_id, poder))`);
  dbF.prepare(`INSERT INTO poderes_contratados (user_id, poder, ts, fuente) VALUES (1, 'gesty', ?, 'test')`).run(Date.now());
  ok('hoy: fallback sin columna estado -> gesty_contratado true', vistas.gestyHoy(dbF, 1, { hoy: HOY }).gesty_contratado === true);

  // --- Flujo completo de recepción ---
  const db = dbNueva(); conEstado(db);
  const ev = turno(db, { titulo: 'Brunch para 2', hora: '10:30', nombre: 'Lucía Fernández' });
  const rec0 = vistas.vistaRecepcion(db, 1, { hoy: HOY }).secciones.turnos;
  const t0 = rec0.turnos_hoy.find((t) => t.id === ev.id);
  ok('recepción: turno nuevo sin llegada ni llamado', t0 && t0.llegada === false && t0.llamado === false);
  confirmacion.confirmar(db, 1, ev.id, { canal: 'recepcion' });
  const t1 = vistas.vistaRecepcion(db, 1, { hoy: HOY }).secciones.turnos.turnos_hoy.find((t) => t.id === ev.id);
  ok('recepción: tras confirmar -> confirmacion confirmada', t1 && t1.confirmacion === 'confirmada' && t1.llamado === false);
  llegadas.marcarLlegada(db, 1, ev.id, { medio: 'recepcion' });
  const rec2 = vistas.vistaRecepcion(db, 1, { hoy: HOY }).secciones.turnos;
  const t2 = rec2.turnos_hoy.find((t) => t.id === ev.id);
  ok('recepción: tras llegada -> llegada true, llamado false, en sala', t2 && t2.llegada === true && t2.llamado === false && rec2.sala.some((s) => s.evento_id === ev.id));
  const llegadaId = llegadas.llegadasDe(db, 1, { fecha: HOY }).find((l) => l.evento_id === ev.id).id;
  sala.llamar(db, 1, llegadaId, {});
  const rec3 = vistas.vistaRecepcion(db, 1, { hoy: HOY }).secciones.turnos;
  const t3 = rec3.turnos_hoy.find((t) => t.id === ev.id);
  ok('recepción: tras mesa lista -> llamado true, fuera de sala', t3 && t3.llamado === true && !rec3.sala.some((s) => s.evento_id === ev.id));
  agenda.cumplirEvento(db, 1, ev.id, {});
  ok('recepción: tras atendido -> en Pagos del día sin pagar', sinPagar.listaDelDia(db, 1, HOY).pendientes.some((p) => p.evento.id === ev.id));
  sinPagar.registrarCobro(db, 1, ev.id, { medio: 'transferencia', monto: 15000 });
  ok('recepción: tras registrar cobro -> fuera de sin pagar', !sinPagar.listaDelDia(db, 1, HOY).pendientes.some((p) => p.evento.id === ev.id));

  // --- Filas del frontend: un solo botón = próximo paso ---
  const appJs = fs.readFileSync(__dirname + '/public/app.js', 'utf8');
  const esc = (s) => String(s == null ? '' : s);
  const gzT = (es, en) => es; // ME indefinido en el test -> español (igual que gzT real)
  const linea = (nombre) => {
    const ls = appJs.split('\n').filter((l) => l.includes('const ' + nombre + ' = '));
    if (ls.length !== 1) throw new Error('línea ' + nombre + ': ' + ls.length);
    return ls[0];
  };
  const turnoRow = new Function('esc', 'gzT', linea('turnoRow') + '; return turnoRow;')(esc, gzT);
  const salaRowGen = (turnos) => new Function('esc', 'gzT', 'turnos', linea('salaRow') + '; return salaRow;')(esc, gzT, turnos);
  const salaRow = salaRowGen({});
  const btns = (h) => (h.match(/<button/g) || []).length;
  const base = { id: 7, titulo: 'Brunch para 2', hora: '10:30', cliente_nombre: 'Lucía', estado: 'activo' };
  const h0 = turnoRow({ ...base, llegada: false, llamado: false, confirmacion: null });
  ok('fila: sin confirmar -> solo Confirmar', btns(h0) === 1 && h0.includes('>Confirmar<') && !h0.includes('El cliente llegó') && !h0.includes('Atendido'));
  const h1 = turnoRow({ ...base, llegada: false, llamado: false, confirmacion: 'confirmada' });
  ok('fila: confirmado -> solo El cliente llegó', btns(h1) === 1 && h1.includes('>El cliente llegó<') && !h1.includes('>Confirmar<'));
  const h2 = turnoRow({ ...base, llegada: true, llamado: false, confirmacion: 'confirmada' });
  ok('fila: esperando -> ningún botón (el paso vive en Esperando ahora)', btns(h2) === 0 && h2.includes('✓ llegó'));
  const h3 = turnoRow({ ...base, llegada: true, llamado: true, confirmacion: 'confirmada' });
  ok('fila: avisado -> solo Atendido', btns(h3) === 1 && h3.includes('>Atendido<') && h3.includes('avisado'));
  const h4 = turnoRow({ ...base, estado: 'cumplido', llegada: true, llamado: true, confirmacion: 'confirmada' });
  ok('fila: cumplido -> ningún botón, dice atendido', btns(h4) === 0 && h4.includes('atendido'));
  const hs = salaRow({ cliente_nombre: 'Lucía', titulo: 'Brunch para 2', llego_hora: '10:25', hora_turno: '10:30', llegada_id: 3 });
  ok('sala: servicio + Esperando desde las + Ya puede pasar', hs.includes('Brunch para 2') && hs.includes('Esperando desde las 10:25') && hs.includes('>Ya puede pasar<'));
  const hsCafe = salaRowGen({ llamar_texto: 'Su mesa está lista' })({ cliente_nombre: 'Lucía', titulo: 'Brunch para 2', llego_hora: '10:25', hora_turno: '10:30', llegada_id: 3 });
  ok('sala: con variante café -> Su mesa está lista', hsCafe.includes('>Su mesa está lista<'));

  // --- Cableado y especialización ---
  const serverJs = fs.readFileSync(__dirname + '/server.js', 'utf8');
  ok('ruta: POST /api/gesty/vistas/atendido existe', serverJs.includes("'/api/gesty/vistas/atendido'"));
  ok('ruta: atendido usa cumplirEvento', serverJs.includes("vistas/atendido") && serverJs.includes('gestyAgenda.cumplirEvento'));
  ok('app: gzAtendido existe', appJs.includes('async function gzAtendido'));
  ok('app: Esperando ahora siempre visible', appJs.includes('Esperando ahora') && appJs.includes('Nadie esperando por ahora.'));
  ok('app: upsell Sumar un agente en Ajustes', appJs.includes('Sumar un agente') && appJs.includes('gzUpsellGestyProbar') && appJs.includes('gz-upsell-contacto'));
  ok('app: gating gesty_contratado en Oficina/Prueba/Negocio/Ajustes', (appJs.match(/gesty_contratado === false/g) || []).length >= 4);
  ok('app: sin palabra de café hardcodeada (la especialización es por rubro, no por default)', !appJs.includes('Su mesa está lista'));
  ok('app: tarjeta Tipo de negocio + guardar', appJs.includes('Tipo de negocio') && appJs.includes('gzTipoGuardar') && appJs.includes('gz-tipo-select'));
  ok('ruta: negocio-tipo existe', serverJs.includes("'/api/gesty/vistas/negocio-tipo'"));

  // --- Variantes por rubro ---
  ok('variantes: café -> Su mesa está lista', variantes.llamarPara('cafe') === 'Su mesa está lista');
  ok('variantes: peluquería -> Te toca', variantes.llamarPara('peluqueria') === 'Te toca');
  ok('variantes: clínica -> Pasá al consultorio', variantes.llamarPara('clinica') === 'Pasá al consultorio');
  ok('variantes: estética -> Pasá al box', variantes.llamarPara('estetica') === 'Pasá al box');
  ok('variantes: veterinaria -> Pasá al consultorio', variantes.llamarPara('veterinaria') === 'Pasá al consultorio');
  ok('variantes: taller -> Te toca', variantes.llamarPara('taller') === 'Te toca');
  ok('variantes: entrenamiento -> Te toca', variantes.llamarPara('entrenamiento') === 'Te toca');
  ok('variantes: estudio -> Pasá a la oficina', variantes.llamarPara('estudio') === 'Pasá a la oficina');
  ok('variantes: sin tipo o desconocido -> Ya puede pasar', variantes.llamarPara('') === 'Ya puede pasar' && variantes.llamarPara('invento') === 'Ya puede pasar' && variantes.lista().length === 8);
  const dbV = dbNueva();
  ok('tipo: sin declarar -> vacío', variantes.getTipo(dbV, 1) === '');
  ok('tipo: guardar café -> café', variantes.setTipo(dbV, 1, 'cafe') === 'cafe' && variantes.getTipo(dbV, 1) === 'cafe');
  let rechaza = false; try { variantes.setTipo(dbV, 1, 'invento'); } catch (e) { rechaza = true; }
  ok('tipo: lista cerrada, desconocido se rechaza', rechaza);
  const dbW = dbNueva();
  ok('recepción: sin tipo -> llamar_texto genérico', vistas.vistaRecepcion(dbW, 1, { hoy: HOY }).secciones.turnos.llamar_texto === 'Ya puede pasar');
  variantes.setTipo(dbW, 1, 'cafe');
  ok('recepción: con tipo café -> llamar_texto Su mesa está lista', vistas.vistaRecepcion(dbW, 1, { hoy: HOY }).secciones.turnos.llamar_texto === 'Su mesa está lista');

  console.log(`\ntest-gesty-recepcion-port: ${passed} ok, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
}

main();
