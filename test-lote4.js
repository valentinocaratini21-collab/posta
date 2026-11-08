/* LOTE 4 — R5 (8/11, decisión Valentino 01:54): después del jardín
   completo (postjardin.js: estaciones, zonas, años, historia, semillas,
   estadoPost50, mxJardinPost50HTML, /api/oficina/jardin-post50) SALE con
   el resto de la gamificación vieja. El Nivel nuevo es XP 1–50
   (xp-nivel.js) y la pantalla Nivel; el momento del avance QUEDA, con el
   copy reescrito a XP (sin premio ni jardín). Los pins de versión
   (BUILD v533, index ?v=355) eran rancios ya en base v793 y se retiran;
   el BUILD lo cubre la suite R5 (no se bumpea en R5).
   Uso: node test-lote4.js (desde la raíz del árbol). Sin dependencias
   (node:sqlite). «Ahora» fijo: lunes 2026-11-02 (como test-lote3) para
   determinismo. */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const XP = require('./xp-nivel');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }
function count(s, sub) { return s.split(sub).length - 1; }

const UID = 7;
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
function ritual(db, dayKey, picked) {
  db.prepare('INSERT INTO pz_ritual (user_id, day_key, picked_post_id) VALUES (?,?,?)').run(UID, dayKey, picked === undefined ? 'post-x' : picked);
}

console.log('== 1. Puras: regla XP + racha máxima del ritual ==');
check('500 por nivel, tope 50', XP.XP_NIVEL === 500 && XP.XP_MAX_NIVEL === 50);
check('foto 40 / video 60', XP.XP_POST_BASE + XP.XP_POST_FOTO === 40 && XP.XP_POST_BASE + XP.XP_POST_VIDEO === 60);
check('nombres por banda', XP.avatarNivelNombre(1) === 'Recién arranca' && XP.avatarNivelNombre(4) === 'Negocio Visible' && XP.avatarNivelNombre(50) === 'Referente del rubro' && XP.avatarNivelNombre(99) === 'Referente del rubro');
check('tiers 15/25/35', XP.avatarTier(14) === 'none' && XP.avatarTier(15) === 'bronze' && XP.avatarTier(25) === 'silver' && XP.avatarTier(35) === 'gold');
(function () {
  const db = freshDb();
  check('racha vacía = 0', XP.rachaMaximaRitual(db, UID) === 0);
  ritual(db, '2026-10-26'); ritual(db, '2026-10-28'); ritual(db, '2026-10-29');
  check('racha no consecutiva: máx 2', XP.rachaMaximaRitual(db, UID) === 2);
  ritual(db, 'nope');
  check('day_key inválido se ignora', XP.rachaMaximaRitual(db, UID) === 2);
  ritual(db, '2026-10-30', null);
  check('sin picked_post_id no cuenta', XP.rachaMaximaRitual(db, UID) === 2);
  ritual(db, '2026-10-30'); ritual(db, '2026-10-31'); ritual(db, '2026-11-01'); ritual(db, '2026-11-02');
  check('6 seguidos = 6 (28, 29, 30, 31, 01, 02)', XP.rachaMaximaRitual(db, UID) === 6);
})();

console.log('== 2. R5: postjardin fuera; el Nivel 50 es la pantalla Nivel ==');
check('postjardin.js fuera del árbol', !fs.existsSync(path.join(__dirname, 'postjardin.js')));
check('posty-nivel50.js fuera del árbol', !fs.existsSync(path.join(__dirname, 'posty-nivel50.js')));
check('xp-nivel.js exporta la regla', typeof XP.avatarLevelData === 'function' && typeof XP.rachaMaximaRitual === 'function' && typeof XP.avatarNivelNombre === 'function');
{
  const app = read('public/app.js');
  const fnSrc = (name) => {
    const m = app.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
    return m ? m[0] : '';
  };
  const vm = require('vm');
  const sb = {
    console, Intl, Date, Map, Set,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    bbGo: () => {},
    albumMondayKey: () => '2026-11-09',
    pcTz: () => 'America/Argentina/Buenos_Aires',
    pzSftFotoAlChat: () => {},
    pzDockMasFoto: () => {},
    pzDockMasVideo: () => {},
    document: { getElementById: () => null, querySelector: () => null },
    api: { get: async () => null, post: async () => ({ ok: true }) },
    location: { hash: '' },
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  vm.createContext(sb);
  for (const f of ['pzNivelNombre', 'pzNivelHitoActual', 'pzNivelDiaSemana', 'pzNivelReelSemana', 'pzNivelVideoSemana', 'pzNivelNeedEn', 'pzNivelRachaCardHTML', 'pzNivelAutoCardHTML', 'pzNivelMisionesHTML', 'pzNivelLogrosHTML', 'pzNivelEscaleraHTML', 'pzNivelPantallaHTML']) {
    const src = fnSrc(f);
    if (src) vm.runInContext(src + '\nthis.__' + f + ' = ' + f + ';', sb);
  }
  const D50 = { nivel: { ok: true, xp: 24500, level: 50, levelName: 'Referente del rubro', nextXp: null, nextName: null, respuestas: 120, rachaMax: 100 }, ritualHoy: { racha: 100, publicadoHoy: true }, mission: null, posts: [], assets: [], comments: [] };
  const h50 = vm.runInContext('__pzNivelPantallaHTML(' + JSON.stringify(D50) + ')', sb);
  check('Nivel 50 renderiza', typeof h50 === 'string' && h50.length > 0);
  check('Nivel 50: Referente + Nivel máximo', h50.includes('Referente del rubro') && h50.includes('Nivel máximo'));
  check('Nivel 50: sin post50, corona, semillas ni jardín', !/post50|corona|semilla|jard[ií]n|garden|premio|prize/i.test(h50));
  check('Nivel 50: escalera con los 5 hitos', (h50.match(/pz-nivel-hito/g) || []).length >= 5);
}

console.log('== 3. Bundle: momento queda (copy XP), post50 fuera (estático) ==');
const app = read('public/app.js');
const css = read('public/styles.css');
const srv = read('server.js');
for (const fn of ['pzMomentoAvanceShow', 'pzMomentoSonido', 'pzMomentoVibrar', 'pzCelebTarjetaShow', 'pzMomentoReplayShow', 'pzMesNombre']) {
  check('definida 1 vez: ' + fn, count(app, 'function ' + fn + '(') === 1, count(app, 'function ' + fn + '('));
}
for (const fn of ['mxJardinPost50HTML', 'mxJardinPost50']) {
  check('R5 fuera: ' + fn, count(app, 'function ' + fn + '(') === 0, count(app, 'function ' + fn + '('));
}
check('momento primero en celebración', app.indexOf('pzMomentoAvanceShow') < app.indexOf('function pzNivelStoryShow') && /function pzNivelCelebShow[\s\S]{0,1200}pzMomentoAvanceShow/.test(app));
check('momento auto-play (setTimeout avanzar)', app.indexOf('setTimeout(avanzar') >= 0);
check('momento con candado + premio dorado', app.indexOf('pz-momento-candado') >= 0 && app.indexOf('pz-momento-premio') >= 0);
check('momento con antes/después', app.indexOf('pz-momento-antes') >= 0 && app.indexOf('pz-momento-ahora') >= 0);
check('momento con sonido WebAudio + vibrar', app.indexOf('AudioContext') >= 0 && app.indexOf('navigator.vibrate') >= 0);
check('compartir momento vía tarjeta existente', app.indexOf('pzCelebTarjetaShow') >= 0 && app.indexOf('data-pz-celeb-share') >= 0);
check('R5: momento sin copy de premio ni jardín', app.indexOf('Posty trajo tu premio') < 0 && app.indexOf('Tu jardín avanza') < 0 && app.indexOf('Subiste de nivel con Posty.') >= 0);
check('replay ya no se llama desde la historia (post50 fuera)', app.indexOf('pzMomentoReplayShow(${s.nivel})') < 0);
check('semilla: sin botón ni POST en cliente (fuera de Premios 7/11)', app.indexOf('pzSemillaRegalar()') < 0 && app.indexOf("'/api/oficina/jardin-semilla-regalo'") < 0);
check('R5: jardín-post50 fuera del cliente', app.indexOf("'/api/oficina/jardin-post50'") < 0 && app.indexOf('mxJardinPost50HTML(post50)') < 0);
check('CSS momento + magia', css.indexOf('.pz-momento') >= 0 && css.indexOf('.pz-momento-magia') >= 0 && css.indexOf('.pz-momento-premio.brilla') >= 0);
check('CSS post50 remanente (reglas muertas, fuera de alcance R5)', css.indexOf('.pz-post50') >= 0 && css.indexOf('.pz-post50-hist') >= 0);
check('CSS reduced-motion quieto', css.indexOf('.pz-momento,.pz-momento-magia i{animation:none}') >= 0);
const pantalla = app.slice(app.indexOf('function pzNivelPantallaHTML'), app.indexOf('\n}\n', app.indexOf('function pzNivelPantallaHTML')));
check('pantalla Nivel: sin barra de juego', pantalla.indexOf('pz-barra') < 0 && pantalla.indexOf('progress') < 0);
check('R5: rutas post50/semilla fuera del servidor', srv.indexOf("'/api/oficina/jardin-post50'") < 0 && srv.indexOf("'/api/oficina/jardin-semilla-regalo'") < 0);
check('R5: sin jardin_no_completo en servidor', srv.indexOf('jardin_no_completo') < 0);
check('BUILD estampado preparador R5 (v799)', srv.indexOf("BUILD_ID = '20261105-v799'") >= 0);

console.log('== 4. Censo (pre = post; R5 no toca /aprobar) ==');
check('server catsMatch 3', count(srv, 'catsMatch') === 3, count(srv, 'catsMatch'));
check('server week-redo 16', count(srv, 'week-redo') === 16, count(srv, 'week-redo'));
check('server first_week 3', count(srv, 'first_week') === 3, count(srv, 'first_week'));
check('server /aprobar 17 (base v793 también 17; el 16 del lote era rancio)', count(srv, '/aprobar') === 17, count(srv, '/aprobar'));
check('app catsMatch 0', count(app, 'catsMatch') === 0);
check('app week-redo 0', count(app, 'week-redo') === 0);
check('app first_week 4', count(app, 'first_week') === 4, count(app, 'first_week'));
check('app /aprobar 1', count(app, '/aprobar') === 1, count(app, '/aprobar'));
check('autofetch 0', count(srv, 'autofetch') + count(app, 'autofetch') === 0);
check('tope XP en 50, nunca 51', XP.XP_MAX_NIVEL === 50 && XP.avatarNivelNombre(99) === 'Referente del rubro');

console.log('\nLOTE4: ' + ok + ' OK, ' + fail + ' FAIL' + (fail ? ' :: ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
