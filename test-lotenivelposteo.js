// test-lotenivelposteo.js — R5 (8/11, decisión Valentino 01:54): el nivel
// de Posty ya NO sube por posteos contados (posty-nivel50.js: umbrales,
// contarPosteosPosty, nivelPosty) sino por XP (xp-nivel.js: 500 por nivel,
// 1–50; foto 40, video 60, respuesta +25, semana +100, racha 30 +150,
// racha 100 +300, 100 respuestas +150). Cubre: umbrales XP, conteo (qué
// cuenta y qué no), avatarLevelData completo (forma + caso Valentino),
// independencia de gates (Bandeja/semana sola NO sube), subida en el río
// solo por XP, texto de la tira en XP ES/EN, y marcadores no-tocados.
// Diferencia documentada con el motor viejo: el XP no filtra por
// permalink — un posteo publicado con permalink «demo» SÍ suma (el motor
// viejo lo excluía); en producción no hay filas demo en posts.
// Falla (exit 1) si algún check se rompe.
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('ok - ' + name);
  else { console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); fails++; }
}

// ---------- 1. Umbrales XP ----------
const XP = require('./xp-nivel');
check('umbrales: 500 por nivel, 1–50', XP.XP_NIVEL === 500 && XP.XP_MAX_NIVEL === 50);
check('umbrales: foto 40 / video 60 / respuesta 25', XP.XP_POST_BASE + XP.XP_POST_FOTO === 40 && XP.XP_POST_BASE + XP.XP_POST_VIDEO === 60 && XP.XP_RESPUESTA === 25);
check('umbrales: semana 100 / racha 30 +150 / racha 100 +300 / 100 resp +150', XP.XP_PRIMERA_SEMANA === 100 && XP.XP_RACHA_30 === 150 && XP.XP_RACHA_100 === 300 && XP.XP_100_RESPUESTAS === 150);
check('nombres: 1–3 Recién arranca, 4–49 Negocio Visible, 50 Referente', XP.avatarNivelNombre(1) === 'Recién arranca' && XP.avatarNivelNombre(3) === 'Recién arranca' && XP.avatarNivelNombre(4) === 'Negocio Visible' && XP.avatarNivelNombre(49) === 'Negocio Visible' && XP.avatarNivelNombre(50) === 'Referente del rubro');

// ---------- 2. Nivel por XP (fronteras) ----------
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE posts (user_id INTEGER, status TEXT, media_type TEXT, ig_permalink TEXT, published_at INTEGER);
CREATE TABLE comment_queue (user_id INTEGER, status TEXT);
CREATE TABLE pz_ritual (user_id INTEGER, day_key TEXT, picked_post_id TEXT);
CREATE TABLE milestones_seen (user_id INTEGER, milestone INTEGER);
CREATE TABLE oficina_nivel_eventos (user_id INTEGER, poder TEXT, evento TEXT, hecho TEXT, registro_ref TEXT, ts INTEGER);
CREATE TABLE oficina_registros (user_id INTEGER, poder TEXT, tipo TEXT, resumen TEXT, registro_ref TEXT, recibo_json TEXT, estado TEXT, ts INTEGER, salida INTEGER);`);
const ins = db.prepare('INSERT INTO posts (user_id, status, media_type, ig_permalink) VALUES (?,?,?,?)');
function fotos(u, n, tag) {
  for (let i = 0; i < n; i++) ins.run(u, 'published', 'image', 'https://www.instagram.com/p/' + tag + i + '/');
}
// Fronteras con fotos (40 XP c/u): 12 fotos = 480 XP → Nv 1; 13 = 520 →
// Nv 2; 24 = 960 → Nv 2; 25 = 1000 → Nv 3; 612 = 24480 → Nv 49;
// 613 = 24520 → Nv 50; 1000 fotos → Nv 50 (tope).
for (const [n, esp] of [[0, 1], [12, 1], [13, 2], [24, 2], [25, 3], [210, 17], [612, 49], [613, 50], [1000, 50]]) {
  const u = 1000 + n;
  fotos(u, n, 'F' + n + '_');
  const d = XP.avatarLevelData(db, u);
  check(`nivelPorXP(${n} fotos)=${esp}`, d.level === esp, 'dio ' + d.level + ' (' + d.xp + ' XP)');
}

// ---------- 3. Conteo: qué cuenta y qué no ----------
// Caso Valentino (user 12): 9 feed reales con permalink (los 9 verificados
// 4/11 vía /api/admin/client/12) + 3 stories con permalink vacío.
const reales = ['DertCHDmv4L', 'DeptKdqAXYp', 'DeiMgvwj4bG', 'Dehfw_HmiDl', 'DedC7FWDwQ4', 'Dec1MNgDxli', 'Dd4TeIZmKTI', 'Ddy77_Am75M', 'DdyANtRGyiM'];
for (const sc of reales) ins.run(12, 'published', 'image', 'https://www.instagram.com/p/' + sc + '/');
for (let i = 0; i < 3; i++) ins.run(12, 'published', 'story', '');
ins.run(12, 'published', 'image', 'https://www.instagram.com/p/demo_x1/'); // demo: SÍ suma en XP (sin filtro por permalink)
ins.run(12, 'scheduled', 'image', 'https://www.instagram.com/p/Prog1/'); // programado: NO
ins.run(12, 'draft', 'image', 'https://www.instagram.com/p/Borr1/'); // borrador: NO
const d12 = XP.avatarLevelData(db, 12);
check('conteo Valentino = 400 XP, 10 publicados (9 reales + demo; stories/programado/borrador fuera)', d12.xp === 400 && d12.published === 10, 'dio ' + d12.xp + ' XP / ' + d12.published);
check('Valentino: Nv 1, siguiente 500', d12.level === 1 && d12.nextXp === 500);
// Bordes (user 99): legacy NULL media_type NO cuenta (en SQL, NULL !=
// 'story' es NULL, no verdadero — diferencia con el motor viejo, que lo
// contaba); reel /reel/ cuenta como video (60); story con permalink NO;
// imagen con permalink vacío SÍ (sin filtro por permalink); carrusel (40).
ins.run(99, 'published', null, 'https://www.instagram.com/p/Legacy1/');
ins.run(99, 'published', 'video', 'https://www.instagram.com/reel/Reel1/');
ins.run(99, 'published', 'story', 'https://www.instagram.com/p/StoryConLink/');
ins.run(99, 'published', 'image', '');
ins.run(99, 'published', 'carousel', 'https://www.instagram.com/p/Carr1/');
const d99 = XP.avatarLevelData(db, 99);
check('conteo bordes = 140 XP, 3 publicados (video 60 + vacío 40 + carrusel 40; legacy NULL fuera)', d99.xp === 140 && d99.published === 3, 'dio ' + d99.xp + ' XP / ' + d99.published);
// Un posteo subido a mano en IG no es fila de posts: no hay nada que
// insertar para él; el conteo no lo ve por construcción (sin fila, sin
// conteo). Se documenta, no se simula.

// ---------- 4. avatarLevelData completo ----------
// Valentino: 400 XP → Nv 1, Recién arranca, siguiente 500.
check('Valentino: nivel 1', d12.level === 1);
check('Valentino: nombre Recién arranca', d12.levelName === 'Recién arranca', d12.levelName);
check('Valentino: siguiente Recién arranca', d12.nextName === 'Recién arranca', d12.nextName);
check('Valentino: tier none', d12.tier === 'none');
check('Valentino: respuestas 0, rachaMax 0', d12.respuestas === 0 && d12.rachaMax === 0);
check('Valentino: sin niveles sin ver', Array.isArray(d12.unseenLevels) && d12.unseenLevels.length === 0);
// Usuario nuevo: 0 posteos -> Nv 1, siguiente 500.
const n0 = XP.avatarLevelData(db, 77);
check('nuevo: nivel 1, 0 XP', n0.level === 1 && n0.xp === 0 && n0.published === 0);
check('nuevo: siguiente 500', n0.nextXp === 500 && n0.nextName === 'Recién arranca');
// Tope: 613 fotos -> Nv 50, sin siguiente, nombre Referente.
const t50 = XP.avatarLevelData(db, 1000 + 613);
check('tope: nivel 50', t50.level === 50, 'dio ' + t50.level);
check('tope: nombre Referente del rubro', t50.levelName === 'Referente del rubro', t50.levelName);
check('tope: sin siguiente', t50.nextXp === null && t50.nextName === null);
// 210 fotos (el viejo tope): 8400 XP -> Nv 17, Negocio Visible.
const v210 = XP.avatarLevelData(db, 1000 + 210);
check('210 fotos: 8400 XP, Nv 17', v210.xp === 8400 && v210.level === 17, 'dio ' + v210.xp + '/' + v210.level);
check('210 fotos: Negocio Visible', v210.levelName === 'Negocio Visible');
// ---------- 5. Independencia de gates ----------
// Usuario con fundamento + semana generada + decisión en Bandeja pero
// 0 posteos: el motor viejo lo pondría en Nv 2; el XP lo deja en 1.
const niveles = require('./niveles');
const ev = db.prepare('INSERT INTO oficina_nivel_eventos (user_id, poder, evento, hecho, registro_ref, ts) VALUES (?,?,?,?,?,?)');
for (const e of ['fundamento_leido', 'semana_generada', 'decision_bandeja']) ev.run(78, 'posty', e, '', '', Date.now());
const g = XP.avatarLevelData(db, 78);
check('Bandeja sola NO sube (0 posteos -> Nv 1)', g.level === 1, 'dio ' + g.level);
check('semana generada sola NO sube (0 posteos -> Nv 1)', g.level === 1);
// Y el motor viejo sigue intacto para otros poderes / como referencia:
// con los 3 eventos, el base da Nv 3 (L2 por fundamento + L3 por semana
// generada y decisión en Bandeja); el XP, con 0 posteos, da Nv 1.
const base78 = niveles.computarNivel(db, 78, 'posty', {});
check('motor viejo intacto (base con gates daría Nv 3)', base78.nivel === 3, 'dio ' + base78.nivel);
// ---------- 6. Subida en el río solo por XP ----------
// La subida se compara contra el río (no contra pre-evento: el posteo ya
// existe cuando se registra el evento). El río de user 12 ya está al día
// en L4 (registro legacy 'nivel:posty:4:...').
const regIns = db.prepare(`INSERT INTO oficina_registros (user_id, poder, tipo, resumen, registro_ref, recibo_json, estado, ts) VALUES (?,?,?,?,?,?,?,?)`);
regIns.run(12, 'posty', 'subida_nivel', 'Posty subió a Negocio Visible', 'nivel:posty:4:1000', null, 'registrado', 1000);
const contarSub = (u) => db.prepare(`SELECT COUNT(*) AS n FROM oficina_registros WHERE user_id = ? AND tipo = 'subida_nivel'`).get(u).n;
// 6a. Evento de Bandeja con XP fijo (400 XP, Nv 1) y río en L4: NO hay subida.
const antesReg = contarSub(12);
const r1 = niveles.registrarEvento(db, 12, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Decidió en Bandeja', registro_ref: 'test:bandeja' }, {});
check('evento Bandeja no registra subida (Nv 1 XP < río L4)', !r1.subida && contarSub(12) === antesReg, 'subida=' + JSON.stringify(r1.subida));
// 6b. 40 fotos más (50 en total, 2000 XP → Nv 5) + un evento: SÍ hay subida 4->5.
fotos(12, 40, 'Decimo_');
const r2 = niveles.registrarEvento(db, 12, { poder: 'posty', evento: 'semana_publicada', hecho: 'Semana publicada', registro_ref: 'test:pub50' }, {});
check('50 fotos registran subida a Nv 5', r2.subida && r2.subida.nivel === 5, 'subida=' + JSON.stringify(r2.subida));
check('subida 5 con nombre Negocio Visible', r2.subida && r2.subida.nombre_nivel === 'Negocio Visible');
check('50 fotos dejan registro en el río', contarSub(12) === antesReg + 1);
// 6c. Sin cambio posterior: otro evento NO duplica.
const r3 = niveles.registrarEvento(db, 12, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Otra decisión', registro_ref: 'test:bandeja2' }, {});
check('sin cambio no duplica', !r3.subida && contarSub(12) === antesReg + 1);
// 6d. Migración: usuario con río en L2 y 50 fotos (2000 XP → Nv 5): el
// próximo evento registra su Nv 5 actual una sola vez.
regIns.run(79, 'posty', 'subida_nivel', 'Posty subió a Leyendo tu mundo', 'nivel:posty:2:1000', null, 'registrado', 1000);
fotos(79, 50, 'Mig_');
const r4 = niveles.registrarEvento(db, 79, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Decidió', registro_ref: 'test:mig' }, {});
check('migración: registra Nv 5 actual una vez', r4.subida && r4.subida.nivel === 5, 'subida=' + JSON.stringify(r4.subida));
const r5 = niveles.registrarEvento(db, 79, { poder: 'posty', evento: 'decision_bandeja', hecho: 'Decidió 2', registro_ref: 'test:mig2' }, {});
check('migración: segundo evento ya no duplica', !r5.subida && contarSub(79) === 2);

// ---------- 7. Tira en XP (extraída del bundle) ----------
const src = fs.readFileSync('public/app.js', 'utf8');
function sliceFn(name, nextMarker) {
  const i = src.indexOf('function ' + name);
  if (i < 0) throw new Error('no existe ' + name);
  let j = nextMarker ? src.indexOf(nextMarker, i) : src.length;
  if (j < 0) j = src.length;
  return src.slice(i, j);
}
const fn = sliceFn('pzProximoPremioTira', 'function mxTiraHTML');
let ME = { lang: 'es' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
eval(fn);
const nvVal = { nivel: 4, faltantes: [], avance: { hechos: 120, total: 500 }, nombre_siguiente: 'Negocio Visible' };
ME = { lang: 'es' };
let out = pzProximoPremioTira(nvVal, 'posty');
check('tira Valentino: Nivel 5: Negocio Visible', out.includes('Nivel 5: Negocio Visible'), out);
check('tira Valentino: te faltan 380 XP para el Nv 5', out.includes('te faltan 380 XP para el Nv 5'), out);
check('tira Valentino: sin ropa ni posteos', !out.includes('ropa/') && !out.includes('posteos') && !out.includes('próximo premio'), out);
ME = { lang: 'en' };
out = pzProximoPremioTira(nvVal, 'posty');
check('tira EN: Level 5 + 380 XP to Level 5', out.includes('Level 5') && out.includes('380 XP to Level 5'), out);
ME = { lang: 'es' };
out = pzProximoPremioTira({ nivel: 3, faltantes: [], avance: { hechos: 7, total: 500 } }, 'posty');
check('tira plural: te faltan 493 XP para el Nv 4', out.includes('te faltan 493 XP para el Nv 4'), out);
out = pzProximoPremioTira({ nivel: 4, faltantes: [], avance: { hechos: 499, total: 500 } }, 'posty');
check('tira singular: te falta 1 XP para el Nv 5', out.includes('te falta 1 XP para el Nv 5'), out);
out = pzProximoPremioTira({ nivel: 4, faltantes: [], avance: null }, 'posty');
check('tira sin avance: nivel sí, falta NO', out.includes('Nivel 5') && !out.includes('te falt'), out);
out = pzProximoPremioTira({ nivel: 50 }, 'posty');
check('tira Nv 50: nivel máximo, sin img', out.includes('nivel máximo') && !out.includes('<img'), out);
check('tira origen no-posty vacío', pzProximoPremioTira(nvVal, 'oficina') === '');

// ---------- 8. Marcadores no-tocados ----------
const css = fs.readFileSync('public/styles.css', 'utf8');
for (const [n, re, min] of [
  ['guard echo', /pzHeadCollapseEcho/g, 7],
  ['DIAGNOSTICO2', /__pzDiag2/g, 1],
  ['FLIP v634', /pzHeadCollapseAnimate/g, 1],
  ['acceptCountSync', /pzAcceptCountSync/g, 1],
  // mzChatPlus: 0 también en base v793 (el nombre ya no existe en el árbol).
]) {
  const c = (src.match(re) || []).length;
  check('no-tocado: ' + n + ' x' + min, c >= min, 'hay ' + c);
}
check('no-tocado: tope max-width #inicioView', /#inicioView\s*\{[^}]*max-width\s*:\s*100%/.test(css));
check('no-tocado: cinturón min-width', css.includes('.bb-main{min-width:0}') || /\.bb-main\s*\{[^}]*min-width\s*:\s*0/.test(css));
check('no-tocado: servidor sin BUILD v637', !/20261101-v637/.test(fs.readFileSync('server.js', 'utf8')));
check('estampado preparador R5: index en app.js?v=534', fs.readFileSync('public/index.html', 'utf8').includes('app.js?v=534'));
check('estampado preparador R5: index en styles?v=20261186', fs.readFileSync('public/index.html', 'utf8').includes('styles.css?v=20261186'));

if (fails) { console.log('FAILURES: ' + fails); process.exit(1); }
console.log('TODOS LOS CHECKS OK');
