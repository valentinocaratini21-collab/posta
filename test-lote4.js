/* LOTE 4 — checks: después del jardín completo (las 4) + momento del avance (las 5).
   Uso: node test-lote4.js (desde la raíz del árbol). Sin dependencias (node:sqlite).
   «Ahora» fijo: lunes 2026-11-02 (como test-lote3) para determinismo. */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const PJ = require('./postjardin');
const PRE = require('./prestigio');
const NP = require('./posty-nivel50');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

const UID = 7;
const NOW = Date.UTC(2026, 10, 2); // lunes 2026-11-02
const DAY = 86400000;
const MONDAY = (y, m, d) => Date.UTC(y, m - 1, d);
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE oficina_nivel_eventos (user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT, registro_ref TEXT, ts INTEGER)');
  db.exec("CREATE TABLE oficina_registros (user_id INTEGER, poder TEXT, tipo TEXT, resumen TEXT, registro_ref TEXT, recibo_json TEXT, estado TEXT, ts INTEGER, salida INTEGER DEFAULT 0)");
  return db;
}
function ev(db, evento, ts) {
  db.prepare('INSERT INTO oficina_nivel_eventos VALUES (?,?,?,?,?,?)').run(UID, 'posty', evento, evento, 'ev:' + evento + ':' + ts, ts);
}
function semanasRecientes(db, n) {
  for (let i = 0; i < n; i++) ev(db, 'semana_publicada', NOW - i * 7 * DAY);
}
function baseL5(db) {
  ev(db, 'fundamento_leido', MONDAY(2026, 8, 31));
  ev(db, 'semana_generada', MONDAY(2026, 8, 31));
  ev(db, 'decision_bandeja', MONDAY(2026, 8, 31));
  ev(db, 'semana_aceptada', MONDAY(2026, 8, 31));
  for (let i = 0; i < 3; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 4; i++) ev(db, 'semana_publicada', MONDAY(2026, 9, 7) + i * 7 * DAY);
  ev(db, 'pregunta_respondida', MONDAY(2026, 9, 7));
  ev(db, 'pregunta_respondida', MONDAY(2026, 9, 14));
}
function usuarioL50(db) {
  baseL5(db);
  semanasRecientes(db, 30);
  for (let i = 0; i < 30; i++) ev(db, 'decision_bandeja', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 16; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
}
function subida(db, nivel, ts) {
  db.prepare('INSERT INTO oficina_registros (user_id, poder, tipo, resumen, registro_ref, recibo_json, estado, ts) VALUES (?,?,?,?,?,?,?,?)')
    .run(UID, 'posty', 'subida_nivel', 'subida', 'nivel:posty:' + nivel + ':test', '{}', 'ok', ts);
}

console.log('== 1. Puras: hemisferio / estaciones / zonas / años / meses ==');
check('hemisferio sur AR', PJ.hemisferioDe('America/Argentina/Buenos_Aires') === 'sur');
check('hemisferio sur Santiago', PJ.hemisferioDe('America/Santiago') === 'sur');
check('hemisferio sur Australia', PJ.hemisferioDe('Australia/Sydney') === 'sur');
check('hemisferio norte NY', PJ.hemisferioDe('America/New_York') === 'norte');
check('hemisferio norte vacío', PJ.hemisferioDe('') === 'norte');
check('noviembre sur = Primavera', PJ.estacionPara(NOW, 'America/Argentina/Buenos_Aires').estacion === 'Primavera');
check('noviembre norte = Otoño', PJ.estacionPara(NOW, 'America/New_York').estacion === 'Otoño');
check('enero norte = Invierno', PJ.estacionPara(Date.UTC(2026, 0, 15), 'America/New_York').estacion === 'Invierno');
check('enero sur = Verano', PJ.estacionPara(Date.UTC(2026, 0, 15), 'America/Argentina/Buenos_Aires').estacion === 'Verano');
check('estación trae estado y flor', !!PJ.estacionPara(NOW, 'America/New_York').estado && !!PJ.estacionPara(NOW, 'America/New_York').flor);
const z0 = PJ.zonasPara(0);
check('zonas 0: solo estanque', z0[0].desbloqueada && !z0[1].desbloqueada && !z0[2].desbloqueada && !z0[3].desbloqueada, JSON.stringify(z0.map((z) => z.desbloqueada)));
check('zonas 2: estanque+arroyo', PJ.zonasPara(2)[1].desbloqueada && !PJ.zonasPara(2)[2].desbloqueada);
check('zonas 5: +sendero', PJ.zonasPara(5)[2].desbloqueada && !PJ.zonasPara(5)[3].desbloqueada);
check('zonas 9: las 4', PJ.zonasPara(9).every((z) => z.desbloqueada));
check('zonas negativas = 0', PJ.zonasPara(-3)[0].desbloqueada && !PJ.zonasPara(-3)[1].desbloqueada);
check('años: 1 año exacto', PJ.aniosConPosty(Date.UTC(2025, 10, 2), Date.UTC(2026, 10, 2), 'America/Argentina/Buenos_Aires') === 1);
check('años: sin año cumplido', PJ.aniosConPosty(Date.UTC(2024, 10, 3), Date.UTC(2026, 10, 2), 'America/Argentina/Buenos_Aires') === 1);
check('años: sin primer hecho = 0', PJ.aniosConPosty(null, NOW, 'America/Argentina/Buenos_Aires') === 0);
check('años: 0 si no cumplió', PJ.aniosConPosty(Date.UTC(2026, 5, 1), NOW, 'America/Argentina/Buenos_Aires') === 0);
(function () {
  const rows = [
    { tipo: 'semana_publicada', ts: MONDAY(2026, 9, 7) },
    { tipo: 'semana_publicada', ts: MONDAY(2026, 9, 14) },
    { tipo: 'subida_nivel', ts: MONDAY(2026, 10, 5), nivel: 11 },
    { tipo: 'semilla_regalo', ts: MONDAY(2026, 10, 12) },
    { tipo: 'semana_publicada', ts: null },
  ];
  const m = PJ.historiaMesesPara(rows, 'America/Argentina/Buenos_Aires', (n) => ({ premio: 'P' + n, desbloqueo: 'D' + n }));
  check('meses ordenados', m.map((x) => x.mes).join(',') === '2026-09,2026-10', m.map((x) => x.mes).join(','));
  check('septiembre: 2 semanas', m[0].semanas_publicadas === 2 && m[0].subidas.length === 0);
  check('octubre: subida 11 + 1 regalo', m[1].subidas.length === 1 && m[1].subidas[0].nivel === 11 && m[1].subidas[0].premio === 'P11' && m[1].regalos === 1);
  check('meses vacíos = []', PJ.historiaMesesPara([], 'America/New_York', null).length === 0);
})();

console.log('== 2. estadoPost50 con DB (nivel 50 vs nivel 5) ==');
(function () {
  const db = freshDb();
  usuarioL50(db);
  subida(db, 6, MONDAY(2026, 9, 7));
  subida(db, 11, MONDAY(2026, 10, 5));
  db.exec('CREATE TABLE IF NOT EXISTS jardin_semillas_regalo (user_id INTEGER NOT NULL, ts INTEGER NOT NULL)');
  db.prepare('INSERT INTO jardin_semillas_regalo VALUES (?,?)').run(UID, MONDAY(2026, 10, 12));
  const est = PJ.estadoPost50(db, UID, undefined, 'America/Argentina/Buenos_Aires', NOW);
  check('L50: nivel 50', est && est.nivel === 50, est && est.nivel);
  check('L50: completo', est && est.completo === true);
  check('L50: 34 semanas, 4 post-50', est && est.semanas_publicadas === 34 && est.semanas_post50 === 4, est && est.semanas_publicadas + '/' + est.semanas_post50);
  check('L50: estación Primavera sur', est && est.estacion && est.estacion.estacion === 'Primavera', est && est.estacion && est.estacion.estacion);
  check('L50: hora en zona (21 ART)', est && est.hora === 21, est && est.hora);
  check('L50: zonas 2 abiertas, 2 con candado', est && est.zonas[0].desbloqueada && est.zonas[1].desbloqueada && !est.zonas[2].desbloqueada && !est.zonas[3].desbloqueada);
  check('L50: posty vive, 0 años', est && est.postyVive && est.postyVive.anios === 0 && est.postyVive.flores_especiales === 0);
  check('L50: 1 semilla real', est && est.semillas.length === 1);
  const sep = est && est.historia.find((x) => x.mes === '2026-09');
  const oct = est && est.historia.find((x) => x.mes === '2026-10');
  check('L50: historia trae septiembre', !!sep);
  check('L50: subida 6 con premio real', sep && sep.subidas.some((s) => s.nivel === 6 && s.premio && s.premio.indexOf('Brote dorado') >= 0), sep && JSON.stringify(sep.subidas));
  check('L50: subida 6 con desbloqueo real', sep && sep.subidas.some((s) => s.nivel === 6 && s.desbloqueo === 'Hoja dorada pequeña'));
  check('L50: octubre trae regalo', oct && oct.regalos === 1);
})();
(function () {
  const db = freshDb();
  baseL5(db);
  const r = NP.nivelPosty(db, UID, undefined, NOW);
  const est = PJ.estadoPost50(db, UID, undefined, 'America/Argentina/Buenos_Aires', NOW);
  check('L5: no completo', est && est.completo === false && r.nivel === 5, 'nivelPosty=' + r.nivel);
  check('L5: sin estación ni zonas ni vive', est && est.estacion === null && est.zonas.length === 0 && est.postyVive === null);
  check('L5: sin semillas', est && est.semillas.length === 0);
  check('L5: historia igual sirve', est && est.historia.length > 0);
})();
(function () {
  const db = new DatabaseSync(':memory:'); // sin tablas de verdad: fail-closed
  const est = PJ.estadoPost50(db, UID, undefined, 'America/Argentina/Buenos_Aires', NOW);
  check('fail-closed sin tablas = null', est === null);
})();

console.log('== 3. Bundle: momento + secciones + rutas (estático) ==');
const app = read('public/app.js');
const css = read('public/styles.css');
const srv = read('server.js');
const idx = read('public/index.html');
const enIdx = read('public/en/index.html');
const pjSrc = read('postjardin.js');
for (const fn of ['pzMomentoAvanceShow', 'pzMomentoSonido', 'pzMomentoVibrar', 'pzCelebTarjetaShow', 'pzMomentoReplayShow', 'mxJardinPost50HTML', 'pzSemillaRegalar', 'mxJardinPost50', 'pzMesNombre']) {
  // Con paréntesis: 'mxJardinPost50' es prefijo de 'mxJardinPost50HTML'.
  check('definida 1 vez: ' + fn, count(app, 'function ' + fn + '(') === 1, count(app, 'function ' + fn + '('));
}
check('momento primero en celebración', app.indexOf('pzMomentoAvanceShow') < app.indexOf('function pzNivelStoryShow') && /function pzNivelCelebShow[\s\S]{0,1200}pzMomentoAvanceShow/.test(app));
check('momento auto-play (setTimeout avanzar)', app.indexOf('setTimeout(avanzar') >= 0);
check('momento con candado + premio dorado', app.indexOf('pz-momento-candado') >= 0 && app.indexOf('pz-momento-premio') >= 0);
check('momento con antes/después', app.indexOf('pz-momento-antes') >= 0 && app.indexOf('pz-momento-ahora') >= 0);
check('momento con sonido WebAudio + vibrar', app.indexOf('AudioContext') >= 0 && app.indexOf('navigator.vibrate') >= 0);
check('compartir momento vía tarjeta existente', app.indexOf('pzCelebTarjetaShow') >= 0 && app.indexOf('data-pz-celeb-share') >= 0);
check('replay desde historia (onclick por nivel)', app.indexOf('pzMomentoReplayShow(${s.nivel})') >= 0);
check('semilla: botón + POST', app.indexOf('pzSemillaRegalar()') >= 0 && app.indexOf("'/api/oficina/jardin-semilla-regalo'") >= 0);
check('jardín pide post50', app.indexOf("'/api/oficina/jardin-post50'") >= 0 && app.indexOf('mxJardinPost50HTML(post50)') >= 0);
check('CSS momento + magia', css.indexOf('.pz-momento') >= 0 && css.indexOf('.pz-momento-magia') >= 0 && css.indexOf('.pz-momento-premio.brilla') >= 0);
check('CSS post50 + historia', css.indexOf('.pz-post50') >= 0 && css.indexOf('.pz-post50-hist') >= 0);
check('CSS reduced-motion quieto', css.indexOf('.pz-momento,.pz-momento-magia i{animation:none}') >= 0);
const fnPost50 = app.slice(app.indexOf('function mxJardinPost50HTML'), app.indexOf('\n}\n', app.indexOf('function mxJardinPost50HTML')));
check('sin barra de juego en post50', fnPost50.indexOf('pz-barra') < 0 && fnPost50.indexOf('progress') < 0 && fnPost50.indexOf('%') < 0);
check('rutas nuevas en server', srv.indexOf("'/api/oficina/jardin-post50'") >= 0 && srv.indexOf("'/api/oficina/jardin-semilla-regalo'") >= 0);
check('semilla solo con nivel 50 (403)', srv.indexOf('jardin_no_completo') >= 0);
check('BUILD v504', srv.indexOf("BUILD_ID = '20261031-v505'") >= 0);
check('bumps index', idx.indexOf('app.js?v=329') >= 0 && idx.indexOf('styles.css?v=20261050') >= 0);
check('en index: styles 20261050, sin app.js', enIdx.indexOf('styles.css?v=20261050') >= 0 && enIdx.indexOf('app.js?v=') < 0);
check('postjardin exporta puras', pjSrc.indexOf('zonasPara') >= 0 && pjSrc.indexOf('estacionPara') >= 0 && pjSrc.indexOf('historiaMesesPara') >= 0 && pjSrc.indexOf('estadoPost50') >= 0);

console.log('== 4. Censo (pre = post; rutas nuevas no son /aprobar) ==');
check('server catsMatch 3', count(srv, 'catsMatch') === 3, count(srv, 'catsMatch'));
check('server week-redo 16', count(srv, 'week-redo') === 16, count(srv, 'week-redo'));
check('server first_week 3', count(srv, 'first_week') === 3, count(srv, 'first_week'));
check('server /aprobar 15', count(srv, '/aprobar') === 15, count(srv, '/aprobar'));
check('app catsMatch 0', count(app, 'catsMatch') === 0);
check('app week-redo 0', count(app, 'week-redo') === 0);
check('app first_week 4', count(app, 'first_week') === 4, count(app, 'first_week'));
check('app /aprobar 1', count(app, '/aprobar') === 1, count(app, '/aprobar'));
check('autofetch 0', count(srv, 'autofetch') + count(app, 'autofetch') === 0);
check('completo exige nivel >= 50, nunca 51', pjSrc.indexOf('nivel >= 50') >= 0 && pjSrc.indexOf('nivel === 51') < 0 && pjSrc.indexOf('nivel: 51') < 0);

console.log('\nLOTE4: ' + ok + ' OK, ' + fail + ' FAIL' + (fail ? ' :: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
