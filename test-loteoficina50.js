// test-loteoficina50.js — R5 (8/11, decisión Valentino 01:54): la oficina ×50
// SALE con el resto de la gamificación vieja. El lote OFICINA ×50 (decisión
// Valentino 3/11 «arma todo»: 50 ítems, zonas, corona, marco Maestro) queda
// SUPERSEDED: ni el bloque, ni PZ_OFICINA, ni PZ_ROPA, ni la escena SVG,
// ni la sección en Premios. El Nivel nuevo es XP + racha + misiones +
// logros + escalera (suite test-lote-rediseno-r5.js). Las Semillas de
// Maestro siguen fuera (decisión Valentino 7/11, ya vigente en base).
// Node puro, lee el árbol. Uso: node test-loteoficina50.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const fails = [];
const t = (cond, name) => { if (cond) { ok++; } else { bad++; fails.push(name); console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.split(sub).length - 1);

// ---------- 1. El bloque OFICINA ×50 ya no existe ----------
t(app.indexOf('// (LOTE OFICINA ×50') === -1, 'bloque OFICINA ×50 fuera de app.js');
t(app.indexOf('// FIN LOTE OFICINA ×50') === -1, 'fin de bloque OFICINA ×50 fuera');
t(!app.includes('PZ_OFICINA') && !app.includes('PZ_OFICINA_MAESTRO'), 'sin PZ_OFICINA ni PZ_OFICINA_MAESTRO');
t(cnt(app, 'const PZ_ROPA = [') === 0, 'PZ_ROPA fuera (el guardarropa sale con R5)');
for (const fn of ['pzOficinaDesbloqueados', 'pzOficinaNombre', 'pzOficinaEscenaHTML', 'pzOficinaSeccionHTML', 'pzOficinaListaHTML', 'pzOficinaSemillasGet', 'pzOficinaSemillasClave', 'pzOficinaSemillaDar', 'pzOficinaBroteSVG', 'pzOficinaSemillasHTML', 'pzRopaPorNivel', 'pzRopaAvatarHTML', 'pzRopaListaHTML', 'pzRopaUnlock', 'pzRopaAvance', 'mxJardinHTML', 'mxJardinPost50HTML', 'bbJardinPostyContent']) {
  t(cnt(app, 'function ' + fn + '(') === 0 && cnt(app, 'async function ' + fn + '(') === 0, 'R5 fuera: ' + fn);
}
t(!app.includes('Corona dorada en exhibición') && !app.includes('Oficina Maestro: 50 cosas + 50 prendas.'), 'sin corona ni texto Maestro');

// ---------- 2. CSS de oficina fuera; servidor sin PZ_OFICINA ----------
t(!css.includes('.pz-oficina-'), 'CSS de oficina fuera (.pz-oficina- cero)');
t(!srv.includes('PZ_OFICINA'), 'server.js sin PZ_OFICINA');
t(!srv.includes("require('./posty-nivel50')") && !srv.includes("require('./postjardin')"), 'server.js sin require de los módulos del jardín (queda 1 mención en un comentario que explica la regla XP)');

// ---------- 3. Semillas siguen fuera ----------
t(cnt(app, 'Semillas de Maestro') === 0, 'sin texto «Semillas de Maestro» en app.js');
t(cnt(app, 'pzOficinaSemillaDar(') === 0, 'pzOficinaSemillaDar ya no existe');
t(!srv.includes("'/api/oficina/jardin-semilla-regalo'") && !srv.includes("'/api/oficina/jardin-semilla-canjear'") && !srv.includes("'/api/oficina/jardin-semilla-mia'"), 'R5 server: endpoints de semilla fuera');

// ---------- 4. Render real (vm): la pantalla Nivel reemplaza a Premios ----------
{
  const fnSrc = (name) => {
    const m = app.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
    return m ? m[0] : '';
  };
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
  for (const f of ['pzNivelNombre', 'pzNivelHitoActual', 'pzNivelDiaSemana', 'pzNivelReelSemana', 'pzNivelVideoSemana', 'pzNivelNeedEn', 'pzNivelHoyHTML', 'pzNivelHoyToggleComentario', 'pzNivelLogrosHTML', 'pzNivelEscaleraHTML', 'pzNivelPantallaHTML']) {
    const src = fnSrc(f);
    t(src.length > 0, 'vm carga ' + f);
    if (src) vm.runInContext(src + '\nthis.__' + f + ' = ' + f + ';', sb);
  }
  const D4 = { nivel: { ok: true, xp: 1620, level: 4, levelName: 'Negocio Visible', nextXp: 380, nextName: 'Nivel 5', respuestas: 3, rachaMax: 12 }, ritualHoy: { racha: 12, publicadoHoy: false }, mission: null, posts: [], assets: [], comments: [] };
  const h4 = vm.runInContext('__pzNivelPantallaHTML(' + JSON.stringify(D4) + ')', sb);
  t(typeof h4 === 'string' && h4.includes('NIVEL') && h4.includes('Negocio Visible'), 'Nivel 4 renderiza con hito');
  t(!/oficina|corona|jard[ií]n|garden|premio|prize/i.test(h4), 'Nivel 4 sin oficina, corona, jardín ni premios');
  const D50 = { nivel: { ok: true, xp: 24500, level: 50, levelName: 'Referente del rubro', nextXp: null, nextName: null, respuestas: 120, rachaMax: 100 }, ritualHoy: { racha: 100, publicadoHoy: true }, mission: null, posts: [], assets: [], comments: [] };
  const h50 = vm.runInContext('__pzNivelPantallaHTML(' + JSON.stringify(D50) + ')', sb);
  t(h50.includes('Referente del rubro') && h50.includes('Nivel máximo'), 'Nivel 50 con hito y Nivel máximo');
  t(!/M10 62L20 8|PZ_OFICINA_MAESTRO|Corona/.test(h50), 'Nivel 50 sin corona ni marco Maestro');
}
console.log(ok + ' ok / ' + bad + ' fallas' + (bad ? ' :: ' + fails.join(' | ') : ''));
process.exit(bad ? 1 : 0);
