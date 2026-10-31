// test-prestigio-cableado.js — CABLEADO PRESTIGIO POSTY v498.
// Uso: node test-prestigio-cableado.js (desde la raíz del repo).
// DB real en memoria (node:sqlite). Nada de stubs de SQL.
// Cubre: helper nivelPosty (L3 P0, L6 entrada, L7 no-entrada, L50 techo,
// fallback sin prestigio.js, nunca baja), estáticos del cableado en
// server.js / oficina.js / app.js, vetos (sin dinero ni compra ni nivel 51)
// y módulo prestigio.js intacto (md5).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
const NIV = require(path.join(DIR, 'niveles.js'));
const PRE = require(path.join(DIR, 'prestigio.js'));
const HP = require(path.join(DIR, 'posty-nivel50.js'));

let ok = 0, fail = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE oficina_nivel_eventos (user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT, registro_ref TEXT, ts INTEGER)');
  db.exec("CREATE TABLE oficina_registros (user_id INTEGER, poder TEXT, tipo TEXT, resumen TEXT, registro_ref TEXT, recibo_json TEXT, estado TEXT, ts INTEGER, salida INTEGER DEFAULT 0)");
  return db;
}
const UID = 7;
const MONDAY = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getTime();
function ev(db, evento, ts) {
  db.prepare('INSERT INTO oficina_nivel_eventos VALUES (?,?,?,?,?,?)').run(UID, 'posty', evento, evento, 'ev:' + evento + ':' + ts, ts);
}
function semanas(db, n, desde) {
  const base = desde || MONDAY(2026, 9, 7);
  for (let i = 0; i < n; i++) ev(db, 'semana_publicada', base + i * 7 * 86400000);
}
function baseL5(db) {
  ev(db, 'fundamento_leido', MONDAY(2026, 8, 31));
  ev(db, 'semana_generada', MONDAY(2026, 8, 31));
  ev(db, 'decision_bandeja', MONDAY(2026, 8, 31));
  ev(db, 'semana_aceptada', MONDAY(2026, 8, 31));
  for (let i = 0; i < 3; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
  semanas(db, 4, MONDAY(2026, 9, 7));
  ev(db, 'pregunta_respondida', MONDAY(2026, 9, 7));
  ev(db, 'pregunta_respondida', MONDAY(2026, 9, 14));
}
function semillaL6(db) {
  baseL5(db);
  semanas(db, 2, MONDAY(2026, 10, 5));
  ev(db, 'pieza_aceptada_primera', MONDAY(2026, 10, 5));
}

console.log('— Helper: P0 conserva base + etiqueta formato viejo —');
{
  const db = freshDb();
  ev(db, 'fundamento_leido', MONDAY(2026, 8, 31));
  ev(db, 'semana_generada', MONDAY(2026, 8, 31));
  ev(db, 'decision_bandeja', MONDAY(2026, 8, 31));
  const r = HP.nivelPosty(db, UID, {}, MONDAY(2026, 8, 31));
  t(r.nivel === 3, 'L3 con fundamento + semana + decisión (got ' + r.nivel + ')');
  t(r.prestigio === 0 && r.nombre_prestigio === null && r.insignia === null, 'P0 sin prestigio ni insignia');
  t(r.etiqueta_tirita === 'Nivel 3 · De la casa', 'etiqueta P0: «Nivel 3 · De la casa» (got ' + r.etiqueta_tirita + ')');
  t(r.nombre_siguiente === 'Mano derecha de tu Instagram', 'nombre_siguiente L4 (got ' + r.nombre_siguiente + ')');
  t(r.premio_actual === null && r.desbloqueo_actual === null, 'sin premio ni desbloqueo actual en P0');
  t(r.premios.length === 0 && r.desbloqueos.length === 0 && r.meta_final === null, 'sin premios ni meta en P0');
  t(r.color === '#2793C8' && r.nombre === 'Posty', 'color y nombre del poder intactos');
  t(r.gate && r.gate.pendientes.every((p) => p.clave && p.falta), 'faltantes con forma base {clave, falta}');
}

console.log('— Helper: entrada a prestigio 1 (L6) —');
{
  const db = freshDb();
  semillaL6(db);
  const r = HP.nivelPosty(db, UID, {}, MONDAY(2026, 10, 12));
  t(r.nivel === 6, 'L6 con 6 semanas + 4 piezas + racha (got ' + r.nivel + ')');
  t(r.etiqueta_tirita === 'Prestigio 1 · Nivel 6', 'etiqueta: «Prestigio 1 · Nivel 6» (got ' + r.etiqueta_tirita + ')');
  t(r.prestigio === 1 && r.nombre_prestigio === 'Brote dorado' && r.insignia === 'Brote dorado', 'P1 Brote dorado con insignia');
  t(r.premios.length === 1 && r.premios[0].premio.includes('Brote dorado'), 'un premio: el de P1');
  t(r.desbloqueos.length === 1 && r.desbloqueos[0].desbloqueo === 'Hoja dorada pequeña', 'un desbloqueo: el de L6');
  t(r.nombre_siguiente === PRE.nombreNivel(7), 'nombre_siguiente = nombre de L7 (got ' + r.nombre_siguiente + ')');
  t(r.gate && r.gate.nivel_objetivo === 7, 'gate en curso apunta a L7');
  t(typeof r.proximo_paso === 'string' && r.proximo_paso.includes('Semanas publicadas') && !r.proximo_paso.includes('semana_publicada'), 'proximo_paso es frase, no clave cruda (got ' + r.proximo_paso + ')');
  t(r.premio_actual && r.premio_actual.includes('Brote dorado'), 'premio_actual = premio de entrada P1');
  t(r.desbloqueo_actual === 'Hoja dorada pequeña', 'desbloqueo_actual = desbloqueo de L6');
  t(r.hitos.length > 0 && r.hitos_cumplidos > 0, 'hitos extendidos presentes y contados');
  t(r.nivel >= NIV.computarNivel(db, UID, 'posty', {}).nivel, 'el extendido nunca baja del base');
}

console.log('— Helper: nivel sin entrada (L7) —');
{
  const db = freshDb();
  semillaL6(db);
  semanas(db, 2, MONDAY(2026, 10, 19)); // total 8 semanas
  for (let i = 0; i < 7; i++) ev(db, 'decision_bandeja', MONDAY(2026, 10, 19) + i); // total 8
  const r = HP.nivelPosty(db, UID, {}, MONDAY(2026, 10, 26));
  t(r.nivel === 7, 'L7 con 8 semanas + 8 decisiones (got ' + r.nivel + ')');
  t(r.etiqueta_tirita === 'Prestigio 1 · Nivel 7', 'etiqueta L7 (got ' + r.etiqueta_tirita + ')');
  t(r.premio_actual === null, 'sin premio_actual en nivel sin entrada');
  t(r.desbloqueo_actual === 'Piedra del sendero', 'desbloqueo_actual = desbloqueo de L7');
}

console.log('— Helper: techo L50 —');
{
  const db = freshDb();
  baseL5(db);
  semanas(db, 90, MONDAY(2026, 10, 5)); // 94 semanas consecutivas en total
  for (let i = 0; i < 45; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 10, 5) + i);
  for (let i = 0; i < 91; i++) ev(db, 'decision_bandeja', MONDAY(2026, 10, 5) + i);
  const fin = MONDAY(2026, 10, 5) + 89 * 7 * 86400000;
  const r = HP.nivelPosty(db, UID, {}, fin);
  t(r.nivel === 50, 'L50 con todos los hechos (got ' + r.nivel + ')');
  t(r.etiqueta_tirita === 'Prestigio 9 · Nivel 50', 'etiqueta L50 (got ' + r.etiqueta_tirita + ')');
  t(r.nombre_siguiente === null, 'en L50 no hay siguiente');
  t(r.meta_final !== null && r.premios.length === 9, 'meta final + 9 premios');
  t(r.proximo_paso === null, 'en L50 no hay próximo paso');
  t(r.desbloqueo_actual === 'Corona del maestro' && r.premio_actual === null, 'L50 celebra su desbloqueo, no un premio de entrada');
}

console.log('— Helper: fallback sin prestigio.js (base intacto) —');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-cableado-'));
  fs.copyFileSync(path.join(DIR, 'niveles.js'), path.join(tmp, 'niveles.js'));
  fs.copyFileSync(path.join(DIR, 'posty-nivel50.js'), path.join(tmp, 'posty-nivel50.js'));
  const db = freshDb();
  semillaL6(db);
  const HP2 = require(path.join(tmp, 'posty-nivel50.js'));
  const r = HP2.nivelPosty(db, UID, {}, MONDAY(2026, 10, 12));
  t(r.nivel === 5, 'sin prestigio.js el nivel queda en el tope base 5 (got ' + r.nivel + ')');
  t(r.prestigio === 0 && r.premios.length === 0 && r.etiqueta_tirita === 'Nivel 5 · Tu socio de contenido', 'fallback P0 con etiqueta base');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('— Estáticos: cableado en server.js / oficina.js / app.js —');
{
  const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
  const ofi = fs.readFileSync(path.join(DIR, 'oficina.js'), 'utf8');
  const app = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
  t(srv.includes("require('./posty-nivel50')") && srv.includes('nivelPosty(db, uid'), 'server.js usa el helper en /nivel');
  t(srv.includes("resolverPoder(poder) === 'posty' ? 50 : 5"), 'celebrar: tope 50 solo para posty');
  t(srv.includes('etiqueta_tirita: niv.etiqueta_tirita') && srv.includes('premio_actual: niv.premio_actual'), 'respuesta /nivel expone etiqueta y premio actual');
  t(srv.includes("nombre_siguiente: niv.nombre_siguiente !== undefined"), 'nombre_siguiente extendido con fallback viejo');
  t(srv.includes("BUILD_ID = '20261031-v498'"), 'BUILD v498');
  t(ofi.includes("require('./posty-nivel50')") && ofi.includes("if (poder === 'posty')"), 'estadoPoder usa el helper solo para posty');
  t(app.includes('nv.etiqueta_tirita') && app.includes('const etiqueta = (nv && nv.etiqueta_tirita)'), 'tirita usa etiqueta_tirita con fallback');
  t(app.includes('nv.premio_actual || nv.desbloqueo_actual || pzNivelUnlock'), 'celebración prefiere premio/desbloqueo del servidor');
  t(app.includes('function pzVitrinaHTML(hist, en, etiqueta)') && app.includes('Nivel actual: '), 'vitrina acepta etiqueta actual');
  t(app.includes('nivJ.etiqueta_tirita'), 'Mi negocio pasa la etiqueta a la vitrina');
  t(app.includes('p.nivel.etiqueta_tirita ? esc(p.nivel.etiqueta_tirita)'), 'tarjeta de LA OFICINA usa la etiqueta');
  const idx = fs.readFileSync(path.join(DIR, 'public', 'index.html'), 'utf8');
  t(idx.includes('app.js?v=324'), 'index.html bumpeado a app.js?v=324');
}

console.log('— Vetos: sin dinero, sin compra, sin nivel 51 —');
{
  // Las líneas de guarda («nunca descuentos», «ningún premio es descuento»)
  // enuncian la prohibición: se excluyen del grep; lo que se veta es OFRECER.
  const sinGuardas = (s) => s.split('\n').filter((l) => !/nunca|ningún/i.test(l)).join('\n');
  const hp = sinGuardas(fs.readFileSync(path.join(DIR, 'posty-nivel50.js'), 'utf8'));
  const pre = sinGuardas(fs.readFileSync(path.join(DIR, 'prestigio.js'), 'utf8'));
  t(!/descuento|comprar|nivel 51/i.test(hp), 'helper sin descuento, compra ni nivel 51 ofrecidos');
  t(!/descuento|comprar/i.test(pre), 'módulo prestigio sin descuento ni compra ofrecidos');
  t(!/descuento|comprar|nivel 51/i.test(PRE.PRESTIGIOS.map((p) => p.premio || '').join(' ')), 'premios sin dinero');
}

console.log('— Módulo prestigio.js intacto —');
{
  const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(DIR, 'prestigio.js'))).digest('hex');
  t(md5 === '38df92fe90a2fc9e6bd414a5eb6ef831', 'md5 prestigio.js = 38df92fe (got ' + md5 + ')');
}

console.log(`\nCABLEADO: ${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
