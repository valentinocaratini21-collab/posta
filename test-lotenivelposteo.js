// test-lotenivelposteo.js — Lote NIVELES-SOLO-POSTEOS (node, sin DOM real).
// Decisión Valentino 4/11: el nivel de Posty sube SOLO con posteos hechos
// a través de Posty. Cubre: umbrales, conteo (qué cuenta y qué no),
// nivelPosty completo (forma + caso Valentino), independencia de gates
// (Bandeja/semana sola NO sube), subida en el río solo por posteos,
// texto de la tira en posteos ES/EN, y marcadores no-tocados.
// Falla (exit 1) si algún check se rompe.
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('ok - ' + name);
  else { console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); fails++; }
}

// ---------- 1. Umbrales ----------
const np = require('./posty-nivel50');
const U = np.UMBRALES_POSTEOS;
check('umbrales: 50 niveles', U.length === 50, 'len=' + U.length);
check('umbrales: L1=0 L2=1 L3=3 L4=6 L5=10', U[0] === 0 && U[1] === 1 && U[2] === 3 && U[3] === 6 && U[4] === 10);
check('umbrales: L15=50 L30=110 L50=210', U[14] === 50 && U[29] === 110 && U[49] === 210);
let pasosOk = true;
for (let i = 1; i < U.length; i++) { const d = U[i] - U[i - 1]; if (d < 1 || d > 5) pasosOk = false; }
check('umbrales: pasos 1..5, nunca decrecen', pasosOk);
check('umbrales: pasos 1,2,3,4 al inicio', (U[1] - U[0]) === 1 && (U[2] - U[1]) === 2 && (U[3] - U[2]) === 3 && (U[4] - U[3]) === 4);

// ---------- 2. nivelPorPosteos ----------
const casos = [[0, 1], [1, 2], [2, 2], [3, 3], [5, 3], [6, 4], [9, 4], [10, 5], [13, 5], [14, 6], [50, 15], [110, 30], [209, 49], [210, 50], [1000, 50], [-5, 1]];
for (const [c, esp] of casos) check(`nivelPorPosteos(${c})=${esp}`, np.nivelPorPosteos(c) === esp, 'dio ' + np.nivelPorPosteos(c));

// ---------- 3. Conteo: qué cuenta y qué no ----------
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE posts (user_id INTEGER, status TEXT, media_type TEXT, ig_permalink TEXT, published_at INTEGER);
CREATE TABLE oficina_nivel_eventos (user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT, registro_ref TEXT, ts INTEGER);
CREATE TABLE oficina_registros (user_id INTEGER, poder TEXT, tipo TEXT, resumen TEXT, registro_ref TEXT, recibo_json TEXT, estado TEXT, ts INTEGER, salida INTEGER);`);
const ins = db.prepare('INSERT INTO posts (user_id, status, media_type, ig_permalink) VALUES (?,?,?,?)');
// Caso Valentino (user 12): 9 feed reales con permalink (los 9 verificados
// 4/11 vía /api/admin/client/12) + 3 stories con permalink vacío.
const reales = ['DertCHDmv4L', 'DeptKdqAXYp', 'DeiMgvwj4bG', 'Dehfw_HmiDl', 'DedC7FWDwQ4', 'Dec1MNgDxli', 'Dd4TeIZmKTI', 'Ddy77_Am75M', 'DdyANtRGyiM'];
for (const sc of reales) ins.run(12, 'published', 'image', 'https://www.instagram.com/p/' + sc + '/');
for (let i = 0; i < 3; i++) ins.run(12, 'published', 'story', '');
ins.run(12, 'published', 'image', 'https://www.instagram.com/p/demo_x1/'); // demo: NO
ins.run(12, 'scheduled', 'image', 'https://www.instagram.com/p/Prog1/'); // programado: NO
ins.run(12, 'draft', 'image', 'https://www.instagram.com/p/Borr1/'); // borrador: NO
check('conteo Valentino = 9 (stories/demo/programado/borrador fuera)', np.contarPosteosPosty(db, 12) === 9, 'dio ' + np.contarPosteosPosty(db, 12));
// Bordes (user 99): legacy NULL media_type cuenta; reel /reel/ cuenta;
// story con permalink NO; imagen con permalink vacío NO.
ins.run(99, 'published', null, 'https://www.instagram.com/p/Legacy1/');
ins.run(99, 'published', 'video', 'https://www.instagram.com/reel/Reel1/');
ins.run(99, 'published', 'story', 'https://www.instagram.com/p/StoryConLink/');
ins.run(99, 'published', 'image', '');
ins.run(99, 'published', 'carousel', 'https://www.instagram.com/p/Carr1/');
check('conteo bordes = 3 (legacy+reel+carrusel)', np.contarPosteosPosty(db, 99) === 3, 'dio ' + np.contarPosteosPosty(db, 99));
// Un posteo subido a mano en IG no es fila de posts: no hay nada que
// insertar para él; el conteo no lo ve por construcción (sin fila, sin
// conteo). Se documenta, no se simula.

// ---------- 4. nivelPosty completo ----------
const niveles = require('./niveles');
const v = np.nivelPosty(db, 12, {});
check('Valentino: nivel 4', v.nivel === 4, 'dio ' + v.nivel);
check('Valentino: nombre Mano derecha de tu Instagram', v.nombre_nivel === 'Mano derecha de tu Instagram', v.nombre_nivel);
check('Valentino: siguiente Tu socio de contenido', v.nombre_siguiente === 'Tu socio de contenido', v.nombre_siguiente);
check('Valentino: avance 9/10', v.avance && v.avance.hechos === 9 && v.avance.total === 10, JSON.stringify(v.avance));
check('Valentino: gate sin pendientes', Array.isArray(v.gate.pendientes) && v.gate.pendientes.length === 0);
check('Valentino: gate progreso 90', v.gate.progreso_pct === 90, 'dio ' + v.gate.progreso_pct);
check('Valentino: proximo_paso posteos', v.proximo_paso === 'Te falta 1 posteo para el Nv 5', v.proximo_paso);
check('Valentino: posteos_posty 9 + proximo_umbral 10', v.posteos_posty === 9 && v.proximo_umbral === 10);
check('Valentino: etiqueta_tirita', v.etiqueta_tirita === 'Nivel 4 · Mano derecha de tu Instagram', v.etiqueta_tirita);
check('Valentino: color posty + poder posty', v.color === '#2793C8' && v.poder === 'posty');
check('Valentino: sin hitos de gate', Array.isArray(v.hitos) && v.hitos.length === 0);
check('Valentino: siguiente_premio null en L5 (no es entrada)', v.siguiente_premio === null);
check('Valentino: meta_final null', v.meta_final === null);
// Usuario nuevo: 0 posteos -> Nv 1, falta 1 para Nv 2.
const n0 = np.nivelPosty(db, 77, {});
check('nuevo: nivel 1', n0.nivel === 1 && n0.avance && n0.avance.hechos === 0 && n0.avance.total === 1);
check('nuevo: proximo_paso 1 posteo a Nv 2', n0.proximo_paso === 'Te falta 1 posteo para el Nv 2', n0.proximo_paso);
// Tope: 210 posteos -> Nv 50, sin avance ni próximo paso, meta_final real.
for (let i = 0; i < 210; i++) ins.run(55, 'published', 'image', 'https://www.instagram.com/p/Top' + i + '/');
const t50 = np.nivelPosty(db, 55, {});
check('tope: nivel 50', t50.nivel === 50, 'dio ' + t50.nivel);
check('tope: nombre Maestro del jardín', t50.nombre_nivel === 'Maestro del jardín', t50.nombre_nivel);
check('tope: avance null + proximo_paso null + meta_final', t50.avance === null && t50.proximo_paso === null && !!t50.meta_final);
// ---------- 5. Independencia de gates ----------
// Usuario con fundamento + semana generada + decisión en Bandeja pero
// 0 posteos: el motor viejo lo pondría en Nv 2; el nuevo lo deja en 1.
const ev = db.prepare('INSERT INTO oficina_nivel_eventos (user_id, poder, evento, hecho, registro_ref, ts) VALUES (?,?,?,?,?,?)');
for (const e of ['fundamento_leido', 'semana_generada', 'decision_bandeja']) ev.run(78, 'posty', e, '', '', Date.now());
const g = np.nivelPosty(db, 78, {});
check('Bandeja sola NO sube (0 posteos -> Nv 1)', g.nivel === 1, 'dio ' + g.nivel);
check('semana generada sola NO sube (0 posteos -> Nv 1)', g.nivel === 1);
// Y el motor viejo sigue intacto para otros poderes / como referencia:
// con los 3 eventos, el base da Nv 3 (L2 por fundamento + L3 por semana
// generada y decisión en Bandeja); el nuevo, con 0 posteos, da Nv 1.
const base78 = niveles.computarNivel(db, 78, 'posty', {});
check('motor viejo intacto (base con gates daría Nv 3)', base78.nivel === 3, 'dio ' + base78.nivel);
// ---------- 6. Subida en el río solo por posteos ----------
// La subida se compara contra el río (no contra pre-evento: el posteo ya
// existe cuando se registra el evento). El río de user 12 ya está al día
// en L4 (registro legacy 'nivel:posty:4:...').
const regIns = db.prepare(`INSERT INTO oficina_registros (user_id, poder, tipo, resumen, registro_ref, recibo_json, estado, ts) VALUES (?,?,?,?,?,?,?,?)`);
regIns.run(12, 'posty', 'subida_nivel', 'Posty subió a Mano derecha de tu Instagram', 'nivel:posty:4:1000', null, 'registrado', 1000);
const contarSub = (u) => db.prepare(`SELECT COUNT(*) AS n FROM oficina_registros WHERE user_id = ? AND tipo = 'subida_nivel'`).get(u).n;
// 6a. Evento de Bandeja con posteos fijos (9) y río al día: NO hay subida.
const antesReg = contarSub(12);
const r1 = niveles.registrarEvento(db, 12, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Decidió en Bandeja', registro_ref: 'test:bandeja' }, {});
check('evento Bandeja no registra subida (nivel sin cambio)', !r1.subida && contarSub(12) === antesReg, 'subida=' + JSON.stringify(r1.subida));
// 6b. El posteo 10 (9->10) + un evento: SÍ hay subida 4->5 con registro.
ins.run(12, 'published', 'image', 'https://www.instagram.com/p/DecimoPost/');
const r2 = niveles.registrarEvento(db, 12, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:pub10' }, {});
check('posteo 10 registra subida a Nv 5', r2.subida && r2.subida.nivel === 5, 'subida=' + JSON.stringify(r2.subida));
check('posteo 10 deja registro en el río', contarSub(12) === antesReg + 1);
// 6c. Sin cambio posterior: otro evento NO duplica.
const r3 = niveles.registrarEvento(db, 12, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Otra decisión', registro_ref: 'test:bandeja2' }, {});
check('sin cambio no duplica', !r3.subida && contarSub(12) === antesReg + 1);
// 6d. Migración: usuario con 9 posteos pero río en L2 (era gates): el
// próximo evento registra su L4 actual una sola vez.
regIns.run(79, 'posty', 'subida_nivel', 'Posty subió a Leyendo tu mundo', 'nivel:posty:2:1000', null, 'registrado', 1000);
for (const sc of reales) ins.run(79, 'published', 'image', 'https://www.instagram.com/p/' + sc + '/');
const r4 = niveles.registrarEvento(db, 79, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Decidió', registro_ref: 'test:mig' }, {});
check('migración: registra L4 actual una vez', r4.subida && r4.subida.nivel === 4, 'subida=' + JSON.stringify(r4.subida));
const r5 = niveles.registrarEvento(db, 79, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Decidió 2', registro_ref: 'test:mig2' }, {});
check('migración: segundo evento ya no duplica', !r5.subida && contarSub(79) === 2);

// ---------- 7. Tira en posteos (extraída del bundle) ----------
const src = fs.readFileSync('public/app.js', 'utf8');
function sliceFn(name, nextMarker) {
  const i = src.indexOf('function ' + name);
  if (i < 0) throw new Error('no existe ' + name);
  let j = nextMarker ? src.indexOf(nextMarker, i) : src.length;
  if (j < 0) j = src.length;
  return src.slice(i, j);
}
const pi = src.indexOf('const PZ_ROPA = [');
const pe = src.indexOf('\n];', pi);
if (pi < 0 || pe < 0) throw new Error('PZ_ROPA no encontrada');
const prelude = src.slice(pi, pe + 3) + '\nlet PZ_ROPA_NIVEL = 1;\n';
const porNivel = sliceFn('pzRopaPorNivel', 'function pzRopaAvance');
const fn = sliceFn('pzProximoPremioTira', 'function mxTiraHTML');
let ME = { lang: 'es' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
eval(prelude + porNivel + fn);
const nvVal = { nivel: 4, faltantes: [], avance: { hechos: 9, total: 10 }, posteos_posty: 9, proximo_umbral: 10 };
ME = { lang: 'es' };
let out = pzProximoPremioTira(nvVal, 'posty');
check('tira Valentino: premio Nv 5 Hoja en el pelo', out.includes('Nivel 5: Hoja en el pelo'), out);
check('tira Valentino: mini real 05', out.includes('ropa/ropa-05-mini.png'), out);
check('tira Valentino: te falta 1 posteo', out.includes('te falta 1 posteo'), out);
check('tira Valentino: sin "cosa" vieja', !out.includes('cosa'), out);
ME = { lang: 'en' };
out = pzProximoPremioTira(nvVal, 'posty');
check('tira EN: Level 5 Leaf in the hair + 1 post left', out.includes('Level 5: Leaf in the hair') && out.includes('1 post left'), out);
ME = { lang: 'es' };
out = pzProximoPremioTira({ nivel: 3, faltantes: [], avance: { hechos: 7, total: 10 } }, 'posty');
check('tira plural: te faltan 3 posteos', out.includes('te faltan 3 posteos'), out);
out = pzProximoPremioTira({ nivel: 4, faltantes: [], avance: null, posteos_posty: 9, proximo_umbral: 10 }, 'posty');
check('tira fallback campos explícitos: te falta 1 posteo', out.includes('te falta 1 posteo'), out);
out = pzProximoPremioTira({ nivel: 4, faltantes: [], avance: null }, 'posty');
check('tira sin avance ni campos: premio sí, falta NO', out.includes('Nivel 5: Hoja en el pelo') && !out.includes('te falt'), out);
out = pzProximoPremioTira({ nivel: 50 }, 'posty');
check('tira Nv 50: todos desbloqueados', out.includes('todos los premios desbloqueados') && !out.includes('<img'), out);
check('tira origen no-posty vacío', pzProximoPremioTira(nvVal, 'oficina') === '');

// ---------- 8. Marcadores no-tocados ----------
const css = fs.readFileSync('public/styles.css', 'utf8');
for (const [n, re, min] of [
  ['guard echo', /pzHeadCollapseEcho/g, 7],
  ['DIAGNOSTICO2', /__pzDiag2/g, 1],
  ['FLIP v634', /pzHeadCollapseAnimate/g, 1],
  ['acceptCountSync', /pzAcceptCountSync/g, 1],
  ['mzChatPlus', /mzChatPlus/g, 1],
]) {
  const c = (src.match(re) || []).length;
  check('no-tocado: ' + n + ' x' + min, c >= min, 'hay ' + c);
}
check('no-tocado: tope max-width #inicioView', /#inicioView\s*\{[^}]*max-width\s*:\s*100%/.test(css));
check('no-tocado: cinturón min-width', css.includes('.bb-main{min-width:0}') || /\.bb-main\s*\{[^}]*min-width\s*:\s*0/.test(css));
check('no-tocado: servidor sin BUILD v637', !/20261101-v637/.test(fs.readFileSync('server.js', 'utf8')));
check('no-tocado: index sigue en app.js?v=429 (v636)', fs.readFileSync('public/index.html', 'utf8').includes('app.js?v=429'));
check('no-tocado: index sigue en styles?v=20261138 (v636)', fs.readFileSync('public/index.html', 'utf8').includes('styles.css?v=20261138'));

if (fails) { console.log('FAILURES: ' + fails); process.exit(1); }
console.log('TODOS LOS CHECKS OK');
