/* LOTE 3 — checks: vista previa próximo nivel + historial 6–50 + reescalado 7 meses.
   Uso: node test-lote3.js (desde la raíz del árbol). Sin dependencias (node:sqlite).
   La racha se mide con un "ahora" fijo (lunes 2026-11-02) para que el test sea
   determinista; solo el check de registrarEvento usa Date.now() real, por diseño
   (el evento insertado cae siempre en la semana en curso → racha ≥ 1). */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const PRE = require('./prestigio');
const NIV = require('./niveles');
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
// Semanas publicadas en lunes consecutivos terminando en NOW (racha = n).
function semanasRecientes(db, n) {
  for (let i = 0; i < n; i++) ev(db, 'semana_publicada', NOW - i * 7 * 86400000);
}
// Base L5 (gates 2–5 de niveles.js) con semanas viejas (septiembre, racha 0 en NOW).
function baseL5(db) {
  ev(db, 'fundamento_leido', MONDAY(2026, 8, 31));
  ev(db, 'semana_generada', MONDAY(2026, 8, 31));
  ev(db, 'decision_bandeja', MONDAY(2026, 8, 31));
  ev(db, 'semana_aceptada', MONDAY(2026, 8, 31));
  for (let i = 0; i < 3; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 4; i++) ev(db, 'semana_publicada', MONDAY(2026, 9, 7) + i * 7 * 86400000);
  ev(db, 'pregunta_respondida', MONDAY(2026, 9, 7));
  ev(db, 'pregunta_respondida', MONDAY(2026, 9, 14));
}
// Caminata con una familia de gates sobre (conteos, racha) dados.
function caminar(baseNivel, gatesFn, conteos, racha) {
  const cumple = (r) => r.racha ? racha >= r.min : (conteos[r.evento] || 0) >= r.min;
  let n = baseNivel;
  if (n >= 5) {
    for (let L = 6; L <= 50; L++) {
      const g = gatesFn(L);
      if (g.every(cumple) && n === L - 1) n = L;
      else if (n === L - 1) break;
    }
  }
  return n;
}

console.log('== 1. Reescalado parejo 7 meses (factor 30/94) ==');
check('factor 30/94', PRE.ESCALA_7M === 30 / 94);
const g6 = PRE.gatesPara(6);
check('L6: semana 2', g6.find((g) => g.evento === 'semana_publicada').min === 2);
check('L6: pieza 1', g6.find((g) => g.evento === 'pieza_aceptada_primera').min === 1);
check('L6: racha 1', g6.find((g) => g.racha).min === 1);
const g11 = PRE.gatesPara(11);
check('L11: semana 5', g11.find((g) => g.evento === 'semana_publicada').min === 5);
check('L11: decisión 5', g11.find((g) => g.evento === 'decision_bandeja').min === 5);
check('L11: racha 2', g11.find((g) => g.racha).min === 2);
const g50 = PRE.gatesPara(50);
check('L50: semana 30 (7 meses)', g50.find((g) => g.evento === 'semana_publicada').min === 30);
check('L50: pieza 15', g50.find((g) => g.evento === 'pieza_aceptada_primera').min === 15);
const g49 = PRE.gatesPara(49);
check('L49: semana 29', g49.find((g) => g.evento === 'semana_publicada').min === 29);
check('L49: decisión 29', g49.find((g) => g.evento === 'decision_bandeja').min === 29);
check('sin gates más allá de 50', PRE.gatesPara(51).length === 0);
let mono = true, debajo = true;
let prevSem = 0;
const prevPieza = {}, prevDec = {};
for (let L = 6; L <= 50; L++) {
  const g = PRE.gatesPara(L), go = PRE.gatesParaOriginal(L);
  const sem = g.find((x) => x.evento === 'semana_publicada').min;
  if (sem < prevSem) mono = false;
  prevSem = sem;
  for (const r of g) {
    const ro = go.find((x) => (x.racha ? 'racha' : x.evento) === (r.racha ? 'racha' : r.evento));
    if (!ro || r.min > ro.min) debajo = false;
  }
  const k = L - 5;
  if (k % 2 === 1) {
    const p = g.find((x) => x.evento === 'pieza_aceptada_primera').min;
    if (prevPieza.v !== undefined && p < prevPieza.v) mono = false;
    prevPieza.v = p;
  } else {
    const d = g.find((x) => x.evento === 'decision_bandeja').min;
    if (prevDec.v !== undefined && d < prevDec.v) mono = false;
    prevDec.v = d;
  }
}
check('umbrales monótonos 6–50', mono);
check('cada umbral nuevo ≤ su viejo', debajo);
check('premios intactos P1', PRE.PRESTIGIOS[1].premio.indexOf('Brote dorado') >= 0);
check('premios intactos P9', PRE.PRESTIGIOS[9].premio.indexOf('Maestro del jardín') >= 0);
check('nombres intactos', PRE.NOMBRES_50[49] === 'Maestro del jardín' && PRE.NOMBRES_50[5] === 'Primer brote dorado');
check('desbloqueos intactos', PRE.DESBLOQUEOS[6] === 'Hoja dorada pequeña' && PRE.DESBLOQUEOS[50] === 'Corona del maestro');
check('meta final intacta', PRE.META_FINAL.indexOf('Marco dorado') >= 0);
check('premio solo en entradas', PRE.premioEn(11) !== null && PRE.premioEn(7) === null);
check('desbloqueo por nivel', PRE.desbloqueoEn(7) === 'Piedra del sendero');

console.log('== 2. Guard no-baja + meta 7 meses (db real) ==');
(function () {
  const db = freshDb();
  baseL5(db);
  semanasRecientes(db, 30);
  for (let i = 0; i < 30; i++) ev(db, 'decision_bandeja', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 16; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
  const r = PRE.computarNivelPosty50(db, UID, undefined, NOW);
  const viejo = caminar(5, PRE.gatesParaOriginal, r.eventos, r.racha_semanas);
  check('30 semanas → nivel 50', r.nivel === 50, r.nivel);
  check('meta final en 50', !!r.meta_final && r.meta_final.indexOf('Marco dorado') >= 0);
  check('9 premios en 50', r.premios.length === 9, r.premios.length);
  check('guard: nuevo ≥ viejo', r.nivel >= viejo, viejo);
  check('viejo < 50 en ese caso', viejo < 50, viejo);
})();
(function () {
  const db = freshDb();
  baseL5(db);
  semanasRecientes(db, 10);
  for (let i = 0; i < 10; i++) ev(db, 'decision_bandeja', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 8; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
  // Totales: 14 semanas (4 viejas + 10 recientes), 11 decisiones, 11 piezas.
  const r = PRE.computarNivelPosty50(db, UID, undefined, NOW);
  const viejo = caminar(5, PRE.gatesParaOriginal, r.eventos, r.racha_semanas);
  check('migración documentada: 14 sem → nuevo 22', r.nivel === 22, r.nivel);
  check('migración documentada: viejo 8', viejo === 8, viejo);
  check('guard: 22 ≥ 8', r.nivel >= viejo);
})();
(function () {
  const db = freshDb();
  baseL5(db);
  const r = PRE.computarNivelPosty50(db, UID, undefined, NOW);
  check('usuario quieto no sube solo: sigue 5', r.nivel === 5, r.nivel);
})();

console.log('== 3. Vista previa: próximo nivel (nivelPosty) ==');
(function () {
  const db = freshDb();
  baseL5(db);
  const r = NP.nivelPosty(db, UID, undefined, NOW);
  check('en L5: siguiente es 6', r.nivel === 5 && r.nombre_siguiente === 'Primer brote dorado', r.nivel + '/' + r.nombre_siguiente);
  check('en L5: premio P1', !!r.siguiente_premio && r.siguiente_premio.indexOf('Brote dorado') >= 0, r.siguiente_premio);
  check('en L5: desbloqueo 6', r.siguiente_desbloqueo === 'Hoja dorada pequeña', r.siguiente_desbloqueo);
})();
(function () {
  const db = freshDb();
  baseL5(db);
  semanasRecientes(db, 2);
  const r = NP.nivelPosty(db, UID, undefined, NOW);
  check('con 2 sem recientes → L6', r.nivel === 6, r.nivel);
  check('en L6: siguiente es 7', r.nombre_siguiente === 'Hojas doradas', r.nombre_siguiente);
  check('en L6: sin premio (7 no abre)', r.siguiente_premio === null, r.siguiente_premio);
  check('en L6: desbloqueo 7', r.siguiente_desbloqueo === 'Piedra del sendero', r.siguiente_desbloqueo);
})();
(function () {
  const db = freshDb();
  baseL5(db);
  semanasRecientes(db, 4);
  for (let i = 0; i < 3; i++) ev(db, 'decision_bandeja', MONDAY(2026, 8, 31) + i);
  const r = NP.nivelPosty(db, UID, undefined, NOW);
  check('con 4 sem → L10', r.nivel === 10, r.nivel);
  check('en L10: siguiente es 11', r.nombre_siguiente === 'Raíz profunda', r.nombre_siguiente);
  check('en L10: premio P2', !!r.siguiente_premio && r.siguiente_premio.indexOf('Raíz firme') >= 0, r.siguiente_premio);
  check('en L10: desbloqueo 11', r.siguiente_desbloqueo === 'Raíz visible', r.siguiente_desbloqueo);
})();

console.log('== 4. Historial 6–50 ==');
(function () {
  const nombres = NIV.PODERES.posty.niveles.concat(PRE.NOMBRES_50.slice(5));
  const extra = { premioEn: (n) => PRE.premioEn(n), desbloqueoEn: (n) => PRE.desbloqueoEn(n) };
  const rows = [
    { registro_ref: 'nivel:posty:2:100', ts: 100 },
    { registro_ref: 'nivel:posty:3:200', ts: 200 },
    { registro_ref: 'nivel:posty:5:300', ts: 300 },
    { registro_ref: 'nivel:posty:6:400', ts: 400 },
    { registro_ref: 'nivel:posty:11:500', ts: 500 },
    { registro_ref: 'basura', ts: 600 },
    { registro_ref: 'nivel:posty:6:700', ts: 700 },
  ];
  const h = NIV.historialNiveles(rows, 50, nombres, extra);
  const por = (n) => h.find((x) => x.nivel === n);
  check('historial ordenado 1–11', h.map((x) => x.nivel).join(',') === '1,2,3,5,6,11', h.map((x) => x.nivel).join(','));
  check('nivel 1 por primer evento', por(1).ts === 50);
  check('2–5 sin premio ni desbloqueo', por(2).premio === null && por(2).desbloqueo === null && por(5).premio === null && por(5).desbloqueo === null);
  check('6 con nombre y premio P1', por(6).nombre_nivel === 'Primer brote dorado' && por(6).premio.indexOf('Brote dorado') >= 0);
  check('6 con desbloqueo', por(6).desbloqueo === 'Hoja dorada pequeña');
  check('11 con premio P2', por(11).nombre_nivel === 'Raíz profunda' && por(11).premio.indexOf('Raíz firme') >= 0);
  check('duplicado 6 conserva primer ts', por(6).ts === 400);
  check('sin extra: forma vieja intacta', (() => {
    const h2 = NIV.historialNiveles(rows.slice(0, 3), 50, NIV.PODERES.posty.niveles);
    return h2.length === 4 && h2[1].nivel === 2 && h2[1].premio === null && h2[1].desbloqueo === null;
  })());
})();

console.log('== 5. registrarEvento escribe subidas 6–50 ==');
(function () {
  const db = freshDb();
  baseL5(db);
  // Antes: racha 0 (semanas viejas) → extendido en 5. El evento de hoy cae en
  // la semana en curso → racha 1 → L6 (semana 2, pieza 1 ya cumplidos).
  const antes = NP.nivelPosty(db, UID, undefined, Date.now());
  check('antes del evento: 5', antes.nivel === 5, antes.nivel);
  const r = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:lote3' }, undefined);
  check('subida devuelta es 6', !!r.subida && r.subida.nivel === 6, r.subida && r.subida.nivel);
  check('subida con nombre 6', !!r.subida && r.subida.nombre_nivel === 'Primer brote dorado');
  const row = db.prepare("SELECT * FROM oficina_registros WHERE tipo = 'subida_nivel' AND registro_ref LIKE 'nivel:posty:6:%'").get();
  check('río tiene subida 6', !!row, row);
})();
(function () {
  // Base 4→5 sin subida extendida: un solo registro (el 5), nada de 6.
  const db = freshDb();
  ev(db, 'fundamento_leido', MONDAY(2026, 8, 31));
  ev(db, 'semana_generada', MONDAY(2026, 8, 31));
  ev(db, 'decision_bandeja', MONDAY(2026, 8, 31));
  ev(db, 'semana_aceptada', MONDAY(2026, 8, 31));
  for (let i = 0; i < 3; i++) ev(db, 'pieza_aceptada_primera', MONDAY(2026, 8, 31) + i);
  for (let i = 0; i < 4; i++) ev(db, 'semana_publicada', MONDAY(2026, 9, 7) + i * 7 * 86400000);
  ev(db, 'pregunta_respondida', MONDAY(2026, 9, 7));
  const r = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'pregunta_respondida', hecho: 'Pregunta', registro_ref: 'test:lote3' }, undefined);
  check('base 4→5: subida 5', !!r.subida && r.subida.nivel === 5, r.subida && r.subida.nivel);
  const rows = db.prepare("SELECT registro_ref FROM oficina_registros WHERE tipo = 'subida_nivel'").all();
  check('base 4→5: un solo registro', rows.length === 1 && rows[0].registro_ref.indexOf('nivel:posty:5:') === 0, rows.length);
})();

console.log('== 6. Cliente: vista previa + vitrina (estáticos) ==');
const app = read('public/app.js');
const srv = read('server.js');
function fnBody(src, name, nextName) {
  const a = src.indexOf('function ' + name);
  if (a < 0) return '';
  const b = nextName ? src.indexOf('function ' + nextName, a + 1) : src.length;
  return src.slice(a, b < 0 ? src.length : b);
}
const premioBody = fnBody(app, 'mxPremioPostyHTML', 'mxPremioGestyHTML');
check('preview: usa siguiente_premio', premioBody.indexOf('siguiente_premio') >= 0);
check('preview: usa siguiente_desbloqueo', premioBody.indexOf('siguiente_desbloqueo') >= 0);
check('preview: meta final en 50', premioBody.indexOf('nv.nivel >= 50') >= 0 && premioBody.indexOf('meta_final') >= 0);
check('preview: sin % ni barras en jardín', premioBody.indexOf('progreso_pct') < 0 && premioBody.indexOf('width:') < 0);
check('paso siguiente hasta 49', app.indexOf('nv.nivel < 50 && nv.nombre_siguiente') >= 0);
check('paso siguiente muestra recompensa', app.indexOf('recSig') >= 0);
check('vitrina: badge con premio/desbloqueo', app.indexOf('h.premio || h.desbloqueo') >= 0);
check('Gesty intacto (Copa en 5)', fnBody(app, 'mxPremioGestyHTML', 'mxCardAgenteHTML').indexOf('nv.nivel >= 5') >= 0);
check('servidor: siguiente_premio', srv.indexOf('siguiente_premio: niv.siguiente_premio') >= 0);
check('servidor: siguiente_desbloqueo', srv.indexOf('siguiente_desbloqueo: niv.siguiente_desbloqueo') >= 0);
check('servidor: meta_final', srv.indexOf('meta_final: niv.meta_final') >= 0);
check('servidor: nombres 1–50 en historial', srv.indexOf('NOMBRES_50.slice(5)') >= 0);

console.log('== 7. M78: funciones auditadas ==');
const fns = ['mxPremioPostyHTML', 'mxVistasUnAgenteHTML', 'pzVitrinaHTML', 'mxCardAgenteHTML', 'mxVitrina', 'mxNvNum', 'pzNivelUnlock'];
let auditadas = 0;
for (const f of fns) {
  const n = count(app, 'function ' + f + '(');
  check('definida 1 vez: ' + f, n === 1, n);
  if (n === 1) auditadas++;
}
check('helpers presentes (esc, gzT)', app.indexOf('const esc =') >= 0 && app.indexOf('function gzT(') >= 0);
console.log('  -> funciones auditadas: ' + auditadas + '/' + fns.length);

console.log('\n' + ok + ' OK, ' + fail + ' FAIL' + (fails.length ? ' — ' + fails.join(', ') : ''));
process.exit(fail ? 1 : 0);
