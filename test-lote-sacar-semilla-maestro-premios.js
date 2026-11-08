/* LOTE SACAR-SEMILLA-MAESTRO-PREMIOS (decisión Valentino 7/11 «saca lo de
   semilla de maestro en premios»): en la pantalla Premios no queda NADA
   de semilla de maestro — ni el bloque de regalo, ni el canje, ni el
   contador de la oficina, ni los brotes.
   R5 (8/11, decisión Valentino 01:54) va más lejos: los premios de nivel
   Maestro (ropa 46-50, oficina, corona), la historia y la sección
   post-50 salen también, con el resto de la gamificación vieja; y los
   endpoints muertos de semilla se borran del servidor dentro de R5
   (decisión del tablero, no es lote aparte).
   Rojo-primero: en base v774 falla (la UI de semilla existe); en el
   árbol del lote pasa. Uso: node test-lote-sacar-semilla-maestro-premios.js
   (desde la raíz del árbol). Node puro, lee el árbol. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0, fails = [];
const t = (cond, name) => { if (cond) { ok++; } else { bad++; fails.push(name); console.log('✗', name); } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const app = read('public/app.js');
const css = read('public/styles.css');
const cnt = (s, sub) => (s.split(sub).length - 1);
const cntCI = (s, sub) => (s.toLowerCase().split(sub.toLowerCase()).length - 1);

// ---------- 1. Ausencia estática en app.js ----------
console.log('== 1. Sin semilla de maestro en app.js ==');
for (const s of ['Semillas de Maestro', 'Master seeds', 'semillas regaladas', 'seeds gifted', 'Regalar una semilla', 'Gift a seed', '¿Tenés una semilla de Maestro?', 'Have a Master seed?', 'Tu semilla', 'Your seed', 'Canjeala con el código', 'pzSemillaRegalar', 'pzSemillaCanjear', 'mxSemillaCanjeHTML', 'miSemilla', 'pzOficinaSemillas', 'pzOficinaSemillaDar', 'pzOficinaBroteSVG', 'pzSemillaCod', 'post50.semillas', 'jardin-semilla-', 'pz-post50-semillas', 'pz-post50-semilla', 'pz-semilla', 'pz-oficina-semillas', 'pz-oficina-brote', 'Master seeds: ']) {
  t(!app.includes(s), 'app.js sin «' + s + '»');
}
// Solo quedan las 2 menciones ajenas (comentarios): biblioteca semilla del
// onboarding y «semilla» en el comentario del lote avatar-festejo.
t(cntCI(app, 'semilla') === 2, 'app.js: solo 2 «semilla» restantes (comentarios ajenos, tiene ' + cntCI(app, 'semilla') + ')');
t(app.includes('biblioteca semilla'), 'queda el comentario de la biblioteca semilla (onboarding, no es Maestro)');

// ---------- 2. Ausencia estática en styles.css ----------
console.log('== 2. Sin CSS de semilla ==');
for (const s of ['.pz-semilla', '.pz-post50-semillas', '.pz-post50-semilla', '.pz-oficina-semillas', '.pz-oficina-brote']) {
  t(!css.includes(s), 'styles.css sin «' + s + '»');
}
t(!css.includes('.pz-oficina-'), 'R5: CSS de oficina fuera (.pz-oficina- cero)');

// ---------- 3. R5 (8/11, decisión Valentino 01:54): Maestro/oficina/post50 fuera ----------
// La oficina, la corona y la historia del jardín salen con el resto de la
// gamificación vieja; el Nivel nuevo es XP + racha + misiones + logros +
// escalera (suite test-lote-rediseno-r5.js).
console.log('== 3. R5: Maestro/oficina/post50 fuera ==');
t(!app.includes('Oficina Maestro: 50 cosas + 50 prendas.'), 'texto Maestro ES fuera');
t(!app.includes('Master office: 50 office items + 50 garments.'), 'texto Maestro EN fuera');
t(!app.includes('PZ_OFICINA_MAESTRO'), 'marco Maestro fuera');
t(!app.includes('Corona dorada en exhibición'), 'corona nivel 50 fuera');
t(!app.includes('La historia de tu jardín'), 'historia del jardín fuera');
t(!app.includes('Después del jardín completo'), 'sección post-50 fuera');
t(!app.includes('${pzOficinaSeccionHTML(nvNum)}'), 'Nivel ya no inserta la oficina');
t(!app.includes('${mxSemillaCanjeHTML(miSemilla)}'), 'Nivel ya no inserta el canje');
t(app.includes("api.get('/api/avatar-level')"), 'Nivel sigue pidiendo el nivel (XP)');

// ---------- 4. M78: funciones muertas fuera, vivas definidas 1 vez ----------
console.log('== 4. Funciones auditadas ==');
for (const fn of ['pzSemillaRegalar', 'pzSemillaCanjear', 'mxSemillaCanjeHTML', 'pzOficinaSemillasGet', 'pzOficinaSemillasClave', 'pzOficinaSemillaDar', 'pzOficinaBroteSVG', 'pzOficinaSemillasHTML']) {
  t(cnt(app, 'function ' + fn + '(') === 0, 'muerta: ' + fn + ' ya no definida');
}
for (const fn of ['pzOficinaEscenaHTML', 'pzOficinaSeccionHTML', 'pzOficinaListaHTML', 'mxJardinHTML', 'mxJardinPost50HTML', 'bbJardinPostyContent']) {
  t(cnt(app, 'function ' + fn + '(') === 0 && cnt(app, 'async function ' + fn + '(') === 0, 'R5 fuera: ' + fn + ' ya no definida');
}
t(!app.includes('pzOficinaEscenaHTML('), 'ninguna llamada a la escena de oficina');
t(!app.includes('pzOficinaSeccionHTML('), 'ninguna llamada a la sección de oficina');
t(!app.includes("api.get('/api/oficina/jardin-semilla-mia')"), 'Nivel ya no pide miSemilla al servidor');

// ---------- 5. Render real (vm): Nivel 50 sin semillas ni oficina ----------
console.log('== 5. Render Nivel 50 (vm) ==');
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
  for (const f of ['pzNivelNombre', 'pzNivelHitoActual', 'pzNivelDiaSemana', 'pzNivelReelSemana', 'pzNivelVideoSemana', 'pzNivelNeedEn', 'pzNivelRachaCardHTML', 'pzNivelAutoCardHTML', 'pzNivelMisionesHTML', 'pzNivelLogrosHTML', 'pzNivelEscaleraHTML', 'pzNivelPantallaHTML']) {
    const src = fnSrc(f);
    t(src.length > 0, 'vm carga ' + f);
    if (src) vm.runInContext(src + '\nthis.__' + f + ' = ' + f + ';', sb);
  }
  const D50 = { nivel: { ok: true, xp: 24500, level: 50, levelName: 'Referente del rubro', nextXp: null, nextName: null, respuestas: 120, rachaMax: 100 }, ritualHoy: { racha: 100, publicadoHoy: true }, mission: null, posts: [], assets: [], comments: [] };
  const h50 = vm.runInContext('__pzNivelPantallaHTML(' + JSON.stringify(D50) + ')', sb);
  t(typeof h50 === 'string' && h50.length > 0, 'Nivel 50 renderiza');
  t(!/semilla|maestro|corona|oficina|jard[ií]n|garden/i.test(h50), 'Nivel 50 sin semilla, Maestro, corona, oficina ni jardín');
  t(h50.includes('Referente del rubro') && h50.includes('Nivel máximo'), 'Nivel 50 con hito y Nivel máximo');
}
// ---------- 6. R5: post50 fuera ----------
console.log('== 6. post50 fuera ==');
t(app.indexOf('function mxJardinPost50HTML') === -1, 'mxJardinPost50HTML fuera (post50 sale con R5)');
t(!app.includes('La historia de tu jardín') && !app.includes('Posty vive ahí'), 'sin historia del jardín ni Posty vive ahí');
t(!app.includes("api.get('/api/oficina/jardin-post50')"), 'Nivel ya no pide jardin-post50');
// ---------- 7. Censo (pre = post en lo no tocado) ----------
console.log('== 7. Censo ==');
t(cnt(app, 'pzGoBack') === 6 && cnt(app, 'pz-detalle-setup') === 1 && cnt(app, '/aprobar') === 1 && cnt(app, 'autofetch') === 0, 'censo app intacto');
const srv = read('server.js');
t(cnt(srv, 'catsMatch') === 3 && cnt(srv, 'week-redo') === 16 && cnt(srv, 'first_week') === 3 && cnt(srv, '/aprobar') === 17, 'censo server intacto (server.js sin tocar)');
t(!srv.includes("'/api/oficina/jardin-semilla-regalo'") && !srv.includes("'/api/oficina/jardin-semilla-canjear'") && !srv.includes("'/api/oficina/jardin-semilla-mia'"), 'R5 server: endpoints de semilla fuera (la limpieza va dentro de R5, decisión del tablero)');

console.log(`\nTOTAL: ${ok} ok, ${bad} fallos${bad ? ' :: ' + fails.join(' | ') : ''}`);
process.exit(bad ? 1 : 0);
