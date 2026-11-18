// test-lote-venty-f3-canal.js — VENTY F3 CANAL DOMINANTE (lección C13):
// lectura automática del canal dominante desde la realidad conectada del
// negocio. Unitarias con DB en memoria (node:sqlite), fixtures genéricos
// (ningún negocio atado; la semilla de Café Aroma solo se usa para probar
// que sin señal clara el comportamiento actual no cambia).
// Uso: node test-lote-venty-f3-canal.js
'use strict';
const { DatabaseSync } = require('node:sqlite');

const venty = require('./venty');
const conexiones = require('./venty-conexiones');
const canal = require('./venty-canal');
const cierre = require('./venty-cierre');
const oleadas = require('./venty-oleadas');
const gobernador = require('./venty-gobernador');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const db = new DatabaseSync(':memory:');
venty.init(db);
conexiones.ensureSchema(db);
canal.ensureSchema(db);
cierre.ensureSchema(db);
oleadas.ensureSchema(db);
gobernador.ensureSchema(db);

function conectar(uid, c) {
  const ref = 'VENTY_F3_TEST_' + c.toUpperCase();
  process.env[ref] = 'valor-de-prueba';
  conexiones.iniciarConexion(db, uid, c, { credencial_ref: ref, cuenta_ref: 'cuenta-' + c + '-' + uid });
  return conexiones.marcarFetch(db, uid, c, {});
}
let seq = 0;
function consulta(uid, c, opts) {
  const o = opts || {};
  seq++;
  const ahora = '2026-11-10 09:00:00';
  const r = db.prepare(`INSERT INTO venty_partidas (user_id, cliente_nombre, canal, estado, modo_rubro, monto, forma_cierre, motivo_perdida, seguimiento_toque, proximo_toque_at, origen, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uid, 'cliente ' + seq, c, o.estado || 'viva', 'genérico', o.monto || 0, '', '', 0, '', c, ahora, ahora);
  const pid = Number(r.lastInsertRowid);
  const nResp = o.respuestas === undefined ? 1 : o.respuestas;
  for (let i = 0; i < nResp; i++) {
    db.prepare(`INSERT INTO venty_mensajes (partida_id, autor, texto, canal, enviado_at, fuente_precio) VALUES (?,?,?,?,?,?)`)
      .run(pid, 'cliente', 'hola, consulto por un producto', c, ahora, '');
  }
  return pid;
}
function consultas(uid, c, n, opts) { const ids = []; for (let i = 0; i < n; i++) ids.push(consulta(uid, c, opts)); return ids; }
function zonaYLeadSinCanal(uid, puntaje) {
  const z = venty.crearZona(db, uid, { nombre: 'Centro', ciudad: 'Ciudad Genérica' });
  const l = venty.crearLead(db, uid, { nombre: 'Local Genérico ' + uid, zona_id: z.id, contacto_ref: '@local' + uid, puntaje: puntaje || 90, porque: 'tiene que buscar clientes: evidencia de prueba' });
  return { zona: z, lead: l };
}

// ---------- A. concentración en whatsapp → dominante whatsapp ----------
console.log('— A. whatsapp concentra consultas → dominante whatsapp con evidencia');
{
  const U = 201;
  conectar(U, 'whatsapp'); conectar(U, 'instagram');
  consultas(U, 'whatsapp', 8, { respuestas: 1 });
  consultas(U, 'whatsapp', 0);
  // 3 de las de whatsapp cerradas ganadas: se re-etiquetan 3 partidas
  const ids = db.prepare(`SELECT id FROM venty_partidas WHERE user_id = ? AND canal = 'whatsapp' LIMIT 3`).all(U).map((r) => r.id);
  for (const id of ids) db.prepare(`UPDATE venty_partidas SET estado = 'cerrada_ganada' WHERE id = ?`).run(id);
  consultas(U, 'instagram', 2);
  const l = canal.leer(db, U);
  eq(l.estado, 'definido', 'estado definido');
  eq(l.canal_dominante, 'whatsapp', 'dominante whatsapp');
  eq(l.evidencia.por_canal.whatsapp.consultas, 8, 'evidencia: 8 consultas whatsapp');
  eq(l.evidencia.por_canal.instagram.consultas, 2, 'evidencia: 2 consultas instagram');
  eq(l.evidencia.por_canal.whatsapp.respuestas, 8, 'evidencia: 8 respuestas de clientes por whatsapp');
  eq(l.evidencia.por_canal.whatsapp.cierres, 3, 'evidencia: 3 cierres por whatsapp');
  eq(l.evidencia.total_consultas, 10, 'evidencia: total 10');
  eq(l.evidencia.cuota_dominante, 0.8, 'evidencia: cuota 0.8');
  ok(l.evidencia.porque.includes('8 de 10'), 'el porque trae los datos (8 de 10)');
  ok(venty.validarVoz(l.evidencia.porque).ok, 'el porque respeta la voz de venty (minúsculas, sin signos de apertura)');
  eq(l.conectado, true, 'whatsapp figura conectado');
  const snap = canal.snapshot(db, U);
  eq(snap.canal_dominante, 'whatsapp', 'snapshot persistido con el dominante');
}

// ---------- B. concentración en instagram → dominante instagram --------
console.log('— B. instagram concentra consultas → dominante instagram');
{
  const U = 202;
  conectar(U, 'whatsapp'); conectar(U, 'instagram'); conectar(U, 'email');
  consultas(U, 'instagram', 7);
  consultas(U, 'whatsapp', 2);
  consultas(U, 'email', 1);
  const l = canal.leer(db, U);
  eq(l.estado, 'definido', 'estado definido');
  eq(l.canal_dominante, 'instagram', 'dominante instagram');
  eq(l.evidencia.cuota_dominante, 0.7, 'cuota 0.7');
}

// ---------- C. sin consultas → sin_definir y oleada con criterio actual -
console.log('— C. sin consultas reales → sin_definir; la oleada sigue con el criterio actual');
{
  const U = 203;
  conectar(U, 'whatsapp'); conectar(U, 'instagram');
  const l = canal.leer(db, U);
  eq(l.estado, 'sin_definir', 'sin_definir');
  eq(l.motivo, 'sin_consultas_reales', 'motivo sin_consultas_reales');
  eq(l.canal_dominante, null, 'sin canal dominante');
  const { zona, lead } = zonaYLeadSinCanal(U);
  ok(lead.ok, 'lead sin canal creado');
  const r = oleadas.prepararOleadaZona(db, U, zona.id, { fecha: '2026-11-10', piloto: '' });
  eq(r.items.length, 0, 'lead sin canal queda fuera de la oleada, como hasta hoy');
}

// ---------- D. dominante no conectado → fallback -----------------------
console.log('— D. canal dominante no conectado → fallback al criterio actual');
{
  const U = 204;
  conectar(U, 'instagram'); // whatsapp NO conectado
  consultas(U, 'whatsapp', 8);
  consultas(U, 'instagram', 2);
  const l = canal.leer(db, U);
  eq(l.canal_dominante, 'whatsapp', 'la lectura dice whatsapp (sale de las consultas)');
  eq(l.conectado, false, 'pero whatsapp no está conectado');
  const ef = canal.canalEfectivo(db, U, { canales_permitidos: canal.CANALES_REALES, canal_actual: 'simulacion' });
  eq(ef.fuente, 'criterio_actual', 'el uso cae al criterio actual');
  eq(ef.motivo, 'canal_dominante_no_conectado', 'motivo canal_dominante_no_conectado');
  eq(ef.canal, 'simulacion', 'el canal efectivo es el actual');
  // cierre: partida sin canal real cierra con el criterio actual
  venty.asegurarSemilla(db, 904); // otro usuario: no contamina a U
  const f = venty.leerFundamento(db, U);
  ok(!f, 'U no tiene fundamento sembrado (fixture genérico puro)');
  const U2 = 205;
  conectar(U2, 'whatsapp'); // instagram NO conectado
  consultas(U2, 'instagram', 7);
  consultas(U2, 'whatsapp', 2);
  const { zona } = zonaYLeadSinCanal(U2);
  const r = oleadas.prepararOleadaZona(db, U2, zona.id, { fecha: '2026-11-10', piloto: '' });
  eq(r.items.length, 0, 'dominante instagram sin conectar: el lead sin canal no entra por fallback');
}

// ---------- E. empate → sin_definir ------------------------------------
console.log('— E. empate en la cima → sin_definir');
{
  const U = 206;
  conectar(U, 'whatsapp'); conectar(U, 'instagram');
  consultas(U, 'whatsapp', 5);
  consultas(U, 'instagram', 5);
  const l = canal.leer(db, U);
  eq(l.estado, 'sin_definir', 'sin_definir por empate');
  eq(l.motivo, 'empate', 'motivo empate');
}

// ---------- F. señal insuficiente / sin dominancia / un solo canal -----
console.log('— F. umbrales: pocas consultas, cuota baja y un solo canal posible');
{
  const U = 207;
  conectar(U, 'whatsapp'); conectar(U, 'instagram');
  consultas(U, 'whatsapp', 3); consultas(U, 'instagram', 1);
  eq(canal.leer(db, U).motivo, 'senal_insuficiente', '4 consultas reales: señal insuficiente (mínimo 5)');
  const U2 = 208;
  conectar(U2, 'whatsapp'); conectar(U2, 'instagram');
  consultas(U2, 'whatsapp', 4); consultas(U2, 'instagram', 3);
  const l2 = canal.leer(db, U2);
  eq(l2.estado, 'sin_definir', '57% no alcanza');
  eq(l2.motivo, 'sin_dominancia_clara', 'motivo sin_dominancia_clara (mínimo 60%)');
  const U3 = 209;
  conectar(U3, 'whatsapp');
  consultas(U3, 'whatsapp', 8);
  const l3 = canal.leer(db, U3);
  eq(l3.estado, 'sin_definir', 'un solo canal posible no se declara dominante');
  eq(l3.motivo, 'un_solo_canal_posible', 'motivo un_solo_canal_posible');
}

// ---------- G. el dominante manda en la oleada --------------------------
console.log('— G. oleada: el lead sin canal entra por el dominante conectado que aplica');
{
  const U = 210;
  conectar(U, 'whatsapp'); conectar(U, 'instagram');
  consultas(U, 'instagram', 7);
  consultas(U, 'whatsapp', 2);
  const { zona, lead } = zonaYLeadSinCanal(U);
  ok(lead.ok, 'lead sin canal creado');
  const r = oleadas.prepararOleadaZona(db, U, zona.id, { fecha: '2026-11-10', piloto: '' });
  eq(r.items.length, 1, 'el lead sin canal entra a la oleada por el dominante');
  const item = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE id = ?').get(r.items[0].id);
  eq(item.canal, 'instagram', 'el ítem sale por instagram, el dominante');
  const jug = db.prepare('SELECT propuesta_json FROM venty_jugadas WHERE id = ?').get(r.items[0].jugada_id);
  eq(JSON.parse(jug.propuesta_json).canal_fuente, 'canal_dominante', 'la jugada declara que el canal vino del dominante');
  // y el criterio actual sigue intacto para leads con canal propio
  const l2 = venty.crearLead(db, U, { nombre: 'Local Con Email ' + U, zona_id: zona.id, canal_preferido: 'email', contacto_ref: 'local@prueba.com', puntaje: 90, porque: 'evidencia de prueba' });
  ok(l2.ok, 'lead con email creado');
  const db2items = db.prepare('SELECT * FROM venty_s4_oleada_items WHERE oleada_id = ?').all(r.oleada.id);
  eq(db2items.length, 1, 'la oleada ya existía: no se duplica al repreparar');
}

// ---------- H. el dominante manda en el cierre --------------------------
console.log('— H. cierre: canal por defecto del cierre con dominante y con partida real');
{
  const U = 211;
  venty.asegurarSemilla(db, U);
  // se limpia la semilla de partidas para armar la señal a mano
  db.prepare('DELETE FROM venty_mensajes WHERE partida_id IN (SELECT id FROM venty_partidas WHERE user_id = ?)').run(U);
  db.prepare('DELETE FROM venty_partidas WHERE user_id = ?').run(U);
  conectar(U, 'whatsapp'); conectar(U, 'instagram');
  consultas(U, 'whatsapp', 8);
  consultas(U, 'instagram', 2);
  const cfg = cierre.fijarConfigCierre(db, U, { link_pago: 'https://link.prueba/generico', proveedor: 'proveedor_prueba' });
  ok(cfg.ok, 'config de cierre fijada');
  const pidSim = consulta(U, 'simulacion', { monto: 24000, respuestas: 0 });
  db.prepare('UPDATE venty_partidas SET monto = 24000 WHERE id = ?').run(pidSim);
  const r = cierre.iniciarCierre(db, U, pidSim, {});
  ok(r.ok, 'el cierre arranca');
  eq(r.canal_cierre.canal, 'whatsapp', 'partida sin canal real: el cierre usa el dominante whatsapp');
  eq(r.canal_cierre.fuente, 'canal_dominante', 'fuente canal_dominante');
  const pidIg = consulta(U, 'instagram', { monto: 10000, respuestas: 0 });
  db.prepare('UPDATE venty_partidas SET monto = 10000 WHERE id = ?').run(pidIg);
  const r2 = cierre.iniciarCierre(db, U, pidIg, {});
  eq(r2.canal_cierre.canal, 'instagram', 'partida de instagram: manda el canal de la partida');
  eq(r2.canal_cierre.fuente, 'canal_de_la_partida', 'fuente canal_de_la_partida');
}

// ---------- I. recálculo: consulta nueva y cambio de conexión ----------
console.log('— I. recálculo al entrar consultas y al cambiar una conexión');
{
  const U = 212;
  conectar(U, 'whatsapp'); conectar(U, 'instagram');
  consultas(U, 'whatsapp', 2); consultas(U, 'instagram', 2);
  eq(canal.leer(db, U).motivo, 'senal_insuficiente', 'arranque: señal insuficiente');
  consultas(U, 'whatsapp', 4);
  const l = canal.refrescar(db, U);
  eq(l.canal_dominante, 'whatsapp', 'tras consultas nuevas, dominante whatsapp sin tocar nada más');
  conexiones.revocarConexion(db, U, 'whatsapp');
  const ef = canal.canalEfectivo(db, U, { canales_permitidos: canal.CANALES_REALES, canal_actual: 'simulacion' });
  eq(ef.motivo, 'canal_dominante_no_conectado', 'al revocar la conexión, el uso cae a fallback');
  eq(canal.snapshot(db, U).estado, 'definido', 'el snapshot refleja la última lectura');
}

// ---------- J. semilla Café Aroma: sin señal clara, nada cambia --------
console.log('— J. semilla de Café Aroma (whatsapp 4, instagram 3): sin_definir, comportamiento actual intacto');
{
  const U = 213;
  venty.asegurarSemilla(db, U);
  const l = canal.leer(db, U);
  eq(l.evidencia.por_canal.whatsapp.consultas, 4, 'semilla: 4 consultas whatsapp');
  eq(l.evidencia.por_canal.instagram.consultas, 3, 'semilla: 3 consultas instagram');
  eq(l.estado, 'sin_definir', 'semilla: sin_definir');
  eq(l.motivo, 'sin_dominancia_clara', 'semilla: 57% no es dominancia clara');
  const pf = canal.paraFundamento(db, U);
  ok(pf.evidencia && pf.porque.includes('sin definir'), 'paraFundamento declara el bloque con su porque');
}

console.log(`\nF3 CANAL: ${total - fails}/${total} ok`);
process.exit(fails ? 1 : 0);
