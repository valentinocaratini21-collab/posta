/* LOTE 3 — R5 (8/11, decisión Valentino 01:54): el motor de nivel 1–50
   por posteos (posty-nivel50.js, prestigio, premios, desbloqueos) SALE.
   El Nivel nuevo es la regla XP de xp-nivel.js (500 por nivel, 1–50;
   foto 40, video 60, respuesta +25, semana +100, racha 30 +150, racha
   100 +300, 100 respuestas +150; venta por anuncio nunca por proyección).
   Las secciones 1 y 2 (helpers puros de prestigio.js) quedan intactas:
   prestigio.js sigue en el árbol como código muerto (sin llamadores en
   producción; su borrado es de R7). Las secciones 3, 4, 5, 6 y 7 pasan
   al motor XP.
   Uso: node test-lote3.js (desde la raíz del árbol). Sin dependencias
   (node:sqlite). La racha se mide con un "ahora" fijo (lunes 2026-11-02)
   para que el test sea determinista; solo el check de registrarEvento
   usa Date.now() real, por diseño (el evento insertado cae siempre en
   la semana en curso → racha ≥ 1). */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const PRE = require('./prestigio');
const NIV = require('./niveles');
const XP = require('./xp-nivel');

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
  db.exec('CREATE TABLE posts (user_id INTEGER, status TEXT, media_type TEXT, ig_permalink TEXT, published_at INTEGER)');
  db.exec('CREATE TABLE comment_queue (user_id INTEGER, status TEXT)');
  db.exec('CREATE TABLE pz_ritual (user_id INTEGER, day_key TEXT, picked_post_id TEXT)');
  db.exec('CREATE TABLE milestones_seen (user_id INTEGER, milestone INTEGER)');
  return db;
}
// R5: n posteos publicados por Posty (foto = 40 XP c/u).
function posts(db, n) {
  const ins = db.prepare('INSERT INTO posts (user_id, status, media_type, ig_permalink) VALUES (?,?,?,?)');
  for (let i = 0; i < n; i++) ins.run(UID, 'published', 'image', 'https://www.instagram.com/p/L3_' + i + '/');
}
// R5: n videos publicados (video = 60 XP c/u).
function postsVideo(db, n) {
  const ins = db.prepare('INSERT INTO posts (user_id, status, media_type, ig_permalink) VALUES (?,?,?,?)');
  for (let i = 0; i < n; i++) ins.run(UID, 'published', 'video', 'https://www.instagram.com/reel/L3v_' + i + '/');
}
// R5: n consultas respondidas (+25 XP c/u).
function respuestas(db, n) {
  const ins = db.prepare('INSERT INTO comment_queue (user_id, status) VALUES (?,?)');
  for (let i = 0; i < n; i++) ins.run(UID, 'replied');
}
// R5: n días seguidos eligiendo en el ritual (terminan el 2026-11-02).
function ritualDias(db, n) {
  const ins = db.prepare('INSERT INTO pz_ritual (user_id, day_key, picked_post_id) VALUES (?,?,?)');
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 10, 2) - (n - 1 - i) * 86400000);
    ins.run(UID, d.toISOString().slice(0, 10), 'post-' + i);
  }
}
function subidaRec(db, nivel) {
  db.prepare("INSERT INTO oficina_registros (user_id, poder, tipo, resumen, registro_ref, recibo_json, estado, ts) VALUES (?,?,?,?,?,?,?,?)")
    .run(UID, 'posty', 'subida_nivel', 'subida', 'nivel:posty:' + nivel + ':test', '{}', 'ok', Date.now());
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

console.log('== 3. R5: la regla XP (xp-nivel.js, única fuente de verdad) ==');
check('constantes XP', XP.XP_NIVEL === 500 && XP.XP_MAX_NIVEL === 50 && XP.XP_POST_BASE === 15 && XP.XP_POST_FOTO === 25 && XP.XP_POST_VIDEO === 45 && XP.XP_RESPUESTA === 25 && XP.XP_PRIMERA_SEMANA === 100 && XP.XP_RACHA_30 === 150 && XP.XP_RACHA_100 === 300 && XP.XP_100_RESPUESTAS === 150);
check('nombres por banda', XP.avatarNivelNombre(1) === 'Recién arranca' && XP.avatarNivelNombre(3) === 'Recién arranca' && XP.avatarNivelNombre(4) === 'Negocio Visible' && XP.avatarNivelNombre(49) === 'Negocio Visible' && XP.avatarNivelNombre(50) === 'Referente del rubro');
check('tiers del marco', XP.avatarTier(1) === 'none' && XP.avatarTier(15) === 'bronze' && XP.avatarTier(25) === 'silver' && XP.avatarTier(35) === 'gold');
(function () {
  const db = freshDb();
  posts(db, 10); // 10 fotos × 40 = 400 XP
  const d = XP.avatarLevelData(db, UID);
  check('10 fotos → 400 XP, Nv 1', d.xp === 400 && d.level === 1 && d.published === 10, d.xp + '/' + d.level);
  check('10 fotos: siguiente 500', d.nextXp === 500 && d.nextName === 'Recién arranca');
})();
(function () {
  const db = freshDb();
  posts(db, 13); // 13 fotos × 40 = 520 XP
  const d = XP.avatarLevelData(db, UID);
  check('13 fotos → 520 XP, Nv 2', d.xp === 520 && d.level === 2, d.xp + '/' + d.level);
  check('13 fotos: siguiente 1000', d.nextXp === 1000 && d.levelName === 'Recién arranca');
})();
(function () {
  const db = freshDb();
  postsVideo(db, 1); // 1 video = 60 XP
  const d = XP.avatarLevelData(db, UID);
  check('1 video → 60 XP, Nv 1', d.xp === 60 && d.level === 1, d.xp);
})();
(function () {
  const db = freshDb();
  posts(db, 12); postsVideo(db, 1); // 480 + 60 = 540 XP
  const d = XP.avatarLevelData(db, UID);
  check('12 fotos + 1 video → 540 XP, Nv 2', d.xp === 540 && d.level === 2, d.xp + '/' + d.level);
})();
(function () {
  const db = freshDb();
  respuestas(db, 100); // 100 × 25 + 150 (logro) = 2650 XP
  const d = XP.avatarLevelData(db, UID);
  check('100 respuestas → 2650 XP, Nv 6', d.xp === 2650 && d.level === 6 && d.respuestas === 100, d.xp + '/' + d.level);
})();
(function () {
  const db = freshDb();
  ritualDias(db, 7); // primera semana completa +100
  const d = XP.avatarLevelData(db, UID);
  check('racha 7 días → +100, rachaMax 7', d.xp === 100 && d.rachaMax === 7, d.xp + '/' + d.rachaMax);
})();
(function () {
  const db = freshDb();
  ritualDias(db, 30); // +100 (semana) +150 (racha 30) = 250
  const d = XP.avatarLevelData(db, UID);
  check('racha 30 días → +250, rachaMax 30', d.xp === 250 && d.rachaMax === 30, d.xp + '/' + d.rachaMax);
})();
(function () {
  const db = freshDb();
  posts(db, 1250); // 50000 XP → tope Nv 50
  const d = XP.avatarLevelData(db, UID);
  check('tope: 50000 XP → Nv 50, sin siguiente', d.level === 50 && d.nextXp === null && d.nextName === null && d.levelName === 'Referente del rubro', d.level);
})();

console.log('== 4. Historial 6–50 con nombres XP (sin premios) ==');
(function () {
  const nombres = [];
  for (let i = 1; i <= 50; i++) nombres.push(XP.avatarNivelNombre(i));
  const rows = [
    { registro_ref: 'nivel:posty:2:100', ts: 100 },
    { registro_ref: 'nivel:posty:3:200', ts: 200 },
    { registro_ref: 'nivel:posty:5:300', ts: 300 },
    { registro_ref: 'nivel:posty:6:400', ts: 400 },
    { registro_ref: 'nivel:posty:11:500', ts: 500 },
    { registro_ref: 'basura', ts: 600 },
    { registro_ref: 'nivel:posty:6:700', ts: 700 },
  ];
  const h = NIV.historialNiveles(rows, 50, nombres, null);
  const por = (n) => h.find((x) => x.nivel === n);
  check('historial ordenado 1–11', h.map((x) => x.nivel).join(',') === '1,2,3,5,6,11', h.map((x) => x.nivel).join(','));
  check('nivel 1 por primer evento', por(1).ts === 50);
  check('2–5 sin premio ni desbloqueo', por(2).premio === null && por(2).desbloqueo === null && por(5).premio === null && por(5).desbloqueo === null);
  check('6 con nombre XP, sin premio', por(6).nombre_nivel === 'Negocio Visible' && por(6).premio === null);
  check('6 sin desbloqueo', por(6).desbloqueo === null);
  check('11 con nombre XP', por(11).nombre_nivel === 'Negocio Visible' && por(11).premio === null);
  check('duplicado 6 conserva primer ts', por(6).ts === 400);
  check('sin extra: forma vieja intacta', (() => {
    const h2 = NIV.historialNiveles(rows.slice(0, 3), 50, NIV.PODERES.posty.niveles);
    return h2.length === 4 && h2[1].nivel === 2 && h2[1].premio === null && h2[1].desbloqueo === null;
  })());
})();

console.log('== 5. registrarEvento escribe subidas SOLO por XP ==');
(function () {
  const db = freshDb();
  posts(db, 13); // 520 XP → Nv 2, río vacío (último = 1)
  const r = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:lote3' }, undefined);
  check('subida devuelta es 2 (XP)', !!r.subida && r.subida.nivel === 2, r.subida && r.subida.nivel);
  check('subida con nombre XP 2', !!r.subida && r.subida.nombre_nivel === 'Recién arranca');
  const row = db.prepare("SELECT * FROM oficina_registros WHERE tipo = 'subida_nivel' AND registro_ref LIKE 'nivel:posty:2:%'").get();
  check('río tiene subida 2', !!row, row);
})();
(function () {
  // Idempotente: mismo nivel XP, sin duplicados.
  const db = freshDb();
  posts(db, 13);
  const r1 = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:lote3' }, undefined);
  const r2 = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:lote3' }, undefined);
  check('segunda vez: sin subida', !r2.subida, r2.subida);
  const rows = db.prepare("SELECT registro_ref FROM oficina_registros WHERE tipo = 'subida_nivel'").all();
  check('un solo registro en el río', rows.length === 1 && rows[0].registro_ref.indexOf('nivel:posty:2:') === 0, rows.length);
})();
(function () {
  // Sin XP no hay subida: Nv 1 no supera al último (1).
  const db = freshDb();
  const r = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:lote3' }, undefined);
  check('sin XP: sin subida', !r.subida, r.subida);
})();
(function () {
  // Semana + Bandeja sin nada publicado: NO sube el Nivel (es XP).
  const db = freshDb();
  const r = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'semana_generada', hecho: 'Semana generada', registro_ref: 'test:lote3' }, undefined);
  check('semana sin posteo: sin subida', !r.subida, r.subida);
})();
(function () {
  // El río manda: si el último registrado es 5, el Nv 2 XP no sube.
  const db = freshDb();
  subidaRec(db, 5);
  posts(db, 13);
  const r = NIV.registrarEvento(db, UID, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:lote3' }, undefined);
  check('río en 5: Nv 2 XP no sube', !r.subida, r.subida);
  const rows = db.prepare("SELECT registro_ref FROM oficina_registros WHERE tipo = 'subida_nivel'").all();
  check('río sigue con 1 solo registro', rows.length === 1, rows.length);
})();

console.log('== 6. Cliente: pantalla Nivel + servidor XP (estáticos) ==');
const app = read('public/app.js');
const srv = read('server.js');
function fnBody(src, name, nextName) {
  const a = src.indexOf('function ' + name);
  if (a < 0) return '';
  const b = nextName ? src.indexOf('function ' + nextName, a + 1) : src.length;
  return src.slice(a, b < 0 ? src.length : b);
}
check('mxPremioPostyHTML fuera', app.indexOf('function mxPremioPostyHTML') < 0);
const pantalla = fnBody(app, 'pzNivelPantallaHTML', 'pzNivelEnviarRespuesta');
check('pantalla Nivel: barra XP', pantalla.indexOf('pz-nivel-xpbar') >= 0);
check('pantalla Nivel: 500 XP por nivel', pantalla.indexOf('/ 500 XP') >= 0);
check('pantalla Nivel: sin jardín ni premios', pantalla.indexOf('jardín') < 0 && pantalla.indexOf('premio') < 0);
check('dispatch: jardin-posty → bbNivelContent', /else if \(tab === 'jardin-posty'\)[^\n]*bbNivelContent\(\)/.test(app));
check('paso siguiente en XP', app.indexOf('XP para el Nv') >= 0);
check('vitrina: sin badge de premio', app.indexOf('h.premio || h.desbloqueo') < 0);
check('Gesty intacto (Copa en 5)', fnBody(app, 'mxPremioGestyHTML', 'mxCardAgenteHTML').indexOf('nv.nivel >= 5') >= 0);
check('servidor: /api/avatar-level', srv.indexOf("'/api/avatar-level'") >= 0);
check('servidor: nivXp (rama Posty XP)', srv.indexOf('const nivXp = xpD ? {') >= 0);
check('servidor: Posty sin siguiente_premio', srv.indexOf('siguiente_premio: null') >= 0);
check('servidor: historial con nombres XP', srv.indexOf('avatarNivelNombre(i)') >= 0);
check('servidor: sin NOMBRES_50 en historial', srv.indexOf('NOMBRES_50.slice(5)') < 0);
check('servidor: sin require posty-nivel50', srv.indexOf("require('./posty-nivel50')") < 0);

console.log('== 7. M78: funciones auditadas ==');
const fns = ['pzNivelPantallaHTML', 'pzNivelHoyHTML', 'pzNivelHoyToggleComentario', 'pzNivelLogrosHTML', 'pzNivelEscaleraHTML', 'pzNivelEnviarRespuesta', 'pzNivelRecargar'];
let auditadas = 0;
for (const f of fns) {
  const n = count(app, 'function ' + f + '(');
  check('definida 1 vez: ' + f, n === 1, n);
  if (n === 1) auditadas++;
}
check('definida 1 vez: bbNivelContent (async)', count(app, 'async function bbNivelContent(') === 1, count(app, 'async function bbNivelContent('));
if (count(app, 'async function bbNivelContent(') === 1) auditadas++;
check('helpers presentes (esc, gzT)', app.indexOf('const esc =') >= 0 && app.indexOf('function gzT(') >= 0);
console.log('  -> funciones auditadas: ' + auditadas + '/' + (fns.length + 1));

console.log('\n' + ok + ' OK, ' + fail + ' FAIL' + (fails.length ? ' — ' + fails.join(', ') : ''));
process.exit(fail ? 1 : 0);
