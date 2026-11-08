// test-prestigio-cableado.js — R5 (8/11, decisión Valentino 01:54): el
// cableado de prestigio (posty-nivel50.js: nivelPosty con entradas P1–P9,
// premios, desbloqueos, etiquetas «Prestigio N · Nivel M») SALE. El Nivel
// nuevo es la regla XP de xp-nivel.js (500 por nivel, 1–50; sin prestigio,
// sin premios, sin desbloqueos). prestigio.js QUEDA en el árbol como
// código muerto (sin llamadores en producción; su borrado es de R7) con
// su md5 actual pineado (el v498 era rancio ya en base v793).
// Uso: node test-prestigio-cableado.js (desde la raíz del repo).
// DB real en memoria (node:sqlite). Nada de stubs de SQL.
// Cubre: helper avatarLevelData (Nv 1, Nv 2, Nv 3, techo Nv 50; sin
// prestigio.js, nunca baja), estáticos del cableado XP en server.js /
// oficina.js / app.js, vetos (sin dinero ni compra ni nivel 51) y módulo
// prestigio.js intacto (md5).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
const NIV = require(path.join(DIR, 'niveles.js'));
const PRE = require(path.join(DIR, 'prestigio.js'));
const XP = require(path.join(DIR, 'xp-nivel.js'));

let ok = 0, fail = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE oficina_nivel_eventos (user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT, registro_ref TEXT, ts INTEGER)');
  db.exec("CREATE TABLE oficina_registros (user_id INTEGER, poder TEXT, tipo TEXT, resumen TEXT, registro_ref TEXT, recibo_json TEXT, estado TEXT, ts INTEGER, salida INTEGER DEFAULT 0)");
  db.exec('CREATE TABLE posts (user_id INTEGER, status TEXT, media_type TEXT, ig_permalink TEXT, published_at INTEGER)');
  db.exec('CREATE TABLE comment_queue (user_id INTEGER, status TEXT)');
  db.exec('CREATE TABLE pz_ritual (user_id INTEGER, day_key TEXT, picked_post_id TEXT)');
  db.exec('CREATE TABLE milestones_seen (user_id INTEGER, milestone INTEGER)');
  return db;
}
// R5: n posteos publicados por Posty (foto = 40 XP c/u).
function posts(db, n) {
  const ins = db.prepare('INSERT INTO posts (user_id, status, media_type, ig_permalink) VALUES (?,?,?,?)');
  for (let i = 0; i < n; i++) ins.run(UID, 'published', 'image', 'https://www.instagram.com/p/PC_' + i + '/');
}
const UID = 7;

console.log('— Helper: Nv 1 con 3 fotos (sin prestigio, sin premios) —');
{
  const db = freshDb();
  posts(db, 3); // 3 fotos × 40 = 120 XP
  const d = XP.avatarLevelData(db, UID);
  t(d.level === 1 && d.xp === 120, 'Nv 1 con 120 XP (got ' + d.level + '/' + d.xp + ')');
  t(d.levelName === 'Recién arranca', 'nombre Nv 1: Recién arranca (got ' + d.levelName + ')');
  t(!('prestigio' in d) && !('premio' in d) && !('meta_final' in d), 'sin prestigio, premio ni meta en el objeto XP');
  t(d.tier === 'none' && d.nextXp === 500, 'tier none, siguiente 500');
  t(d.published === 3, '3 publicados contados');
}

console.log('— Helper: Nv 2 con 13 fotos —');
{
  const db = freshDb();
  posts(db, 13); // 520 XP
  const d = XP.avatarLevelData(db, UID);
  t(d.level === 2, 'Nv 2 con 520 XP (got ' + d.level + ')');
  t(d.levelName === 'Recién arranca' && d.nextName === 'Recién arranca', 'Nv 2 sigue Recién arranca');
  t(d.nextXp === 1000, 'siguiente 1000');
  t(d.xp - (d.level - 1) * 500 === 20, 'avance en XP 20/500');
}

console.log('— Helper: Nv 3 con 25 fotos + 1 video —');
{
  const db = freshDb();
  posts(db, 25);
  db.prepare('INSERT INTO posts (user_id, status, media_type, ig_permalink) VALUES (?,?,?,?)').run(UID, 'published', 'video', 'https://www.instagram.com/reel/PCv/');
  const d = XP.avatarLevelData(db, UID); // 1000 + 60 = 1060 XP
  t(d.level === 3 && d.xp === 1060, 'Nv 3 con 1060 XP (got ' + d.level + '/' + d.xp + ')');
  t(d.levelName === 'Recién arranca', 'Nv 3 Recién arranca');
}

console.log('— Helper: techo Nv 50 —');
{
  const db = freshDb();
  posts(db, 613); // 24520 XP
  const d = XP.avatarLevelData(db, UID);
  t(d.level === 50, 'Nv 50 con 613 fotos (got ' + d.level + ')');
  t(d.levelName === 'Referente del rubro', 'nombre Nv 50: Referente del rubro');
  t(d.nextXp === null && d.nextName === null, 'en Nv 50 no hay siguiente');
  t(d.xp === 24520, 'XP exacto 24520, sin bonus inventado');
}

console.log('— Helper: sin prestigio.js (el XP no lo requiere) —');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-cableado-'));
  fs.copyFileSync(path.join(DIR, 'xp-nivel.js'), path.join(tmp, 'xp-nivel.js'));
  const db = freshDb();
  posts(db, 13);
  const XP2 = require(path.join(tmp, 'xp-nivel.js'));
  const d = XP2.avatarLevelData(db, UID);
  t(d.level === 2 && d.xp === 520, 'xp-nivel.js solo, sin prestigio.js: Nv 2 (got ' + d.level + ')');
  t(typeof XP2.avatarNivelNombre === 'function' && typeof XP2.rachaMaximaRitual === 'function', 'exporta nombres y racha sin dependencias');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('— Estáticos: cableado XP en server.js / oficina.js / app.js —');
{
  const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
  const ofi = fs.readFileSync(path.join(DIR, 'oficina.js'), 'utf8');
  const app = fs.readFileSync(path.join(DIR, 'public', 'app.js'), 'utf8');
  t(!srv.includes("require('./posty-nivel50')") && srv.includes("require('./xp-nivel')"), 'server.js usa xp-nivel, no posty-nivel50');
  t(srv.includes("'/api/avatar-level'") && srv.includes('avatarLevelData(db, uid'), 'server.js sirve /api/avatar-level con avatarLevelData');
  t(srv.includes("resolverPoder(poder) === 'posty' ? 50 : 5"), 'celebrar: tope 50 solo para posty');
  t(srv.includes('etiqueta_tirita: niv.etiqueta_tirita') && srv.includes('premio_actual: niv.premio_actual'), 'respuesta /nivel expone etiqueta y premio actual (null en Posty)');
  t(srv.includes("nombre_siguiente: niv.nombre_siguiente !== undefined"), 'nombre_siguiente extendido con fallback viejo');
  t(srv.includes("BUILD_ID = '20261105-v799'"), 'BUILD v799 (estampado preparador R5)');
  t(ofi.includes("require('./xp-nivel')") && ofi.includes("if (poder === 'posty')"), 'estadoPoder usa xp-nivel solo para posty');
  t(!ofi.includes("require('./posty-nivel50')"), 'oficina.js sin posty-nivel50');
  t(app.includes('nv.etiqueta_tirita') && app.includes('const etiqueta = (nv && nv.etiqueta_tirita)'), 'tirita usa etiqueta_tirita con fallback');
  t(app.includes("(en ? 'Level ' : 'Nivel ') + nv.nivel + ': ' + (nv.nombre_nivel || '')"), 'celebración XP: «Nivel N: nombre», sin premio');
  t(app.includes('function pzVitrinaHTML(hist, en, etiqueta)') && app.includes('Nivel actual: '), 'vitrina acepta etiqueta actual');
  t(app.includes('nivJ.etiqueta_tirita'), 'Mi negocio pasa la etiqueta a la vitrina');
  t(app.includes('p.nivel.etiqueta_tirita ? esc(p.nivel.etiqueta_tirita)'), 'tarjeta de LA OFICINA usa la etiqueta');
  const idx = fs.readFileSync(path.join(DIR, 'public', 'index.html'), 'utf8');
  t(idx.includes('app.js?v=534'), 'index.html en app.js?v=534 (estampado preparador R5)');
}

console.log('— Vetos: sin dinero, sin compra, sin nivel 51 —');
{
  // Las líneas de guarda («nunca descuentos», «ningún premio es descuento»)
  // enuncian la prohibición: se excluyen del grep; lo que se veta es OFRECER.
  const sinGuardas = (s) => s.split('\n').filter((l) => !/nunca|ningún/i.test(l)).join('\n');
  const xp = sinGuardas(fs.readFileSync(path.join(DIR, 'xp-nivel.js'), 'utf8'));
  const pre = sinGuardas(fs.readFileSync(path.join(DIR, 'prestigio.js'), 'utf8'));
  t(!fs.existsSync(path.join(DIR, 'posty-nivel50.js')), 'posty-nivel50.js fuera del árbol');
  t(!/descuento|comprar|nivel 51/i.test(xp), 'módulo XP sin descuento, compra ni nivel 51 ofrecidos');
  t(!/descuento|comprar/i.test(pre), 'módulo prestigio sin descuento ni compra ofrecidos');
  t(!/descuento|comprar|nivel 51/i.test(PRE.PRESTIGIOS.map((p) => p.premio || '').join(' ')), 'premios sin dinero');
}

console.log('— Módulo prestigio.js intacto —');
{
  const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(DIR, 'prestigio.js'))).digest('hex');
  t(md5 === '9e7d3c512732fdb529c270604295972d', 'md5 prestigio.js = 9e7d3c51 (got ' + md5 + ')');
}

console.log(`\nCABLEADO: ${ok} ok, ${fail} fail`);
if (fail) process.exit(1);
