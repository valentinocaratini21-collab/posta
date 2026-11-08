/* LOTE SACAR-SEMILLA-MAESTRO-PREMIOS (decisión Valentino 7/11 «saca lo de
   semilla de maestro en premios»): en la pantalla Premios no queda NADA
   de semilla de maestro — ni el bloque de regalo, ni el canje, ni el
   contador de la oficina, ni los brotes. Los premios de nivel Maestro
   (ropa 46-50, oficina, corona) y el resto de Premios quedan intactos.
   El servidor NO se toca: los endpoints de semilla quedan sin UI que los
   llame (muertos, para un lote aparte).
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
t(css.includes('.pz-oficina-escena') && css.includes('.pz-oficina-fila') && css.includes('.pz-post50') && css.includes('.pz-post50-hist'), 'CSS de oficina/post50 intacto');

// ---------- 3. Lo que queda: Maestro (premios) intacto ----------
console.log('== 3. Premios Maestro intactos ==');
t(app.includes('Oficina Maestro: 50 cosas + 50 prendas.'), 'texto Maestro ES intacto');
t(app.includes('Master office: 50 office items + 50 garments.'), 'texto Maestro EN intacto');
t(app.includes('PZ_OFICINA_MAESTRO'), 'marco Maestro de la escena intacto');
t(app.includes('Corona dorada en exhibición'), 'corona nivel 50 intacta');
t(app.includes('La historia de tu jardín'), 'historia del jardín intacta');
t(app.includes('Después del jardín completo'), 'sección post-50 intacta');
t(app.includes('${pzOficinaSeccionHTML(nvNum)}'), 'mxJardinHTML inserta la oficina');
t(!app.includes('${mxSemillaCanjeHTML(miSemilla)}'), 'mxJardinHTML ya no inserta el canje');
t(app.includes("mxNivel('posty')"), 'Premios sigue pidiendo el nivel');

// ---------- 4. M78: funciones muertas fuera, vivas definidas 1 vez ----------
console.log('== 4. Funciones auditadas ==');
for (const fn of ['pzSemillaRegalar', 'pzSemillaCanjear', 'mxSemillaCanjeHTML', 'pzOficinaSemillasGet', 'pzOficinaSemillasClave', 'pzOficinaSemillaDar', 'pzOficinaBroteSVG', 'pzOficinaSemillasHTML']) {
  t(cnt(app, 'function ' + fn + '(') === 0, 'muerta: ' + fn + ' ya no definida');
}
for (const fn of ['pzOficinaEscenaHTML', 'pzOficinaSeccionHTML', 'pzOficinaListaHTML', 'mxJardinHTML', 'mxJardinPost50HTML', 'bbJardinPostyContent']) {
  t(cnt(app, 'function ' + fn + '(') === 1 || cnt(app, 'async function ' + fn + '(') === 1, 'viva 1 vez: ' + fn);
}
t(/function pzOficinaEscenaHTML\(nivel\)/.test(app), 'pzOficinaEscenaHTML con 1 parámetro (nivel)');
t(app.includes('pzOficinaEscenaHTML(nv)'), 'la sección llama a la escena con 1 argumento');
t(!app.includes('pzOficinaEscenaHTML(nv, semillas)'), 'ninguna llamada con semillas');
t(!app.includes("api.get('/api/oficina/jardin-semilla-mia')"), 'Premios ya no pide miSemilla al servidor');

// ---------- 5. Render real (vm): oficina sin semillas ----------
console.log('== 5. Render oficina (vm) ==');
{
  const a = app.indexOf('// (LOTE OFICINA ×50');
  const b = app.indexOf('// FIN LOTE OFICINA ×50', a);
  t(a >= 0 && b > a, 'bloque OFICINA ×50 presente');
  const block = (a >= 0 && b > a) ? app.slice(a, b) : '';
  const sb = {
    console, Intl, Date, Map, Set,
    ME: { lang: 'es', id: '12' },
    PZ_PREMIOS_NUEVOS_MARCA: [],
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    document: { getElementById: () => null },
    // Usuario con 3 semillas guardadas: en base, la sección muestra el
    // contador y la escena la tira; tras el corte, nada de eso existe.
    localStorage: { getItem: (k) => (String(k).indexOf('posta-oficina-semillas') === 0 ? '3' : null), setItem: () => {} },
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  vm.createContext(sb);
  if (block) vm.runInContext(block, sb);
  const sec50 = sb.pzOficinaSeccionHTML(50);
  t(!sec50.includes('Semillas de Maestro') && !sec50.includes('pz-oficina-semillas'), 'sección Nv 50 sin semillas ni tira');
  t(sec50.includes('Tu oficina') && sec50.includes('Oficina Maestro: 50 cosas + 50 prendas.'), 'sección Nv 50 con título y texto Maestro');
  t(!sb.pzOficinaEscenaHTML(50).includes('pz-oficina-semillas'), 'escena Nv 50 sin tira de semillas');
  t(sb.pzOficinaEscenaHTML(50).includes('M10 62L20 8'), 'escena Nv 50 trae la corona');
  const sec5 = sb.pzOficinaSeccionHTML(5);
  t(!sec5.includes('Semillas de Maestro') && !sec5.includes('pz-oficina-semillas'), 'sección Nv 5 sin semillas');
  t(sec5.includes('Tu oficina') && sec5.includes('pz-oficina-lista'), 'sección Nv 5 con título y lista');
  sb.ME.lang = 'en';
  const sec50en = sb.pzOficinaSeccionHTML(50);
  t(!sec50en.includes('Master seeds') && sec50en.includes('Your office') && sec50en.includes('Master office: 50 office items + 50 garments.'), 'sección Nv 50 EN sin semillas, con texto Maestro');
  sb.ME.lang = 'es';
}

// ---------- 6. Render real (vm): post50 sin bloque de semillas ----------
console.log('== 6. Render post50 (vm) ==');
{
  const sb = {
    console, Intl, Date, Map, Set,
    ME: { lang: 'es', id: '12' },
    PZ_MOMENTO_REPLAY: {},
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    pzMesNombre: (m) => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][((m || 1) - 1)] || '',
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  vm.createContext(sb);
  const start = app.indexOf('function mxJardinPost50HTML');
  const end = app.indexOf('\n}\n', start);
  t(start >= 0 && end > start, 'mxJardinPost50HTML extraíble');
  if (start >= 0 && end > start) vm.runInContext(app.slice(start, end + 3), sb);
  const post50 = {
    ok: true, completo: true, hora: 21, semanas_post50: 4,
    estacion: { estacion: 'Primavera', estado: 'En flor', flor: 'Ceibo' },
    zonas: [{ nombre: 'Zona A', descripcion: 'd', desbloqueada: true }],
    postyVive: { anios: 0, flores_especiales: 0 },
    semillas: [{ codigo: 'POSTY-ABCD-EFGH', canjeada: true, canje_negocio: 'Tienda Nueva' }],
    historia: [{ mes: '2026-10', semanas_publicadas: 4, regalos: 2, subidas: [{ nivel: 50, premio: 'Corona', desbloqueo: 'Corona' }] }],
  };
  const html = sb.mxJardinPost50HTML(post50);
  t(!html.includes('Semillas de Maestro') && !html.includes('pz-post50-semillas') && !html.includes('Regalar una semilla'), 'post50 sin bloque de regalo aunque vengan semillas');
  t(!html.includes('semillas regaladas') && !html.includes('Seeds gifted'), 'historia sin «semillas regaladas»');
  t(html.includes('La historia de tu jardín') && html.includes('Después del jardín completo'), 'post50 conserva historia y sección completa');
  t(html.includes('Posty vive ahí'), 'post50 conserva Posty vive ahí');
  sb.ME.lang = 'en';
  const htmlEn = sb.mxJardinPost50HTML(post50);
  t(!htmlEn.includes('Master seeds') && !htmlEn.includes('Gift a seed') && htmlEn.includes('The story of your garden'), 'post50 EN sin semillas, con historia');
  sb.ME.lang = 'es';
}

// ---------- 7. Censo (pre = post en lo no tocado) ----------
console.log('== 7. Censo ==');
t(cnt(app, 'pzGoBack') === 6 && cnt(app, 'pz-detalle-setup') === 1 && cnt(app, '/aprobar') === 1 && cnt(app, 'autofetch') === 0, 'censo app intacto');
const srv = read('server.js');
t(cnt(srv, 'catsMatch') === 3 && cnt(srv, 'week-redo') === 16 && cnt(srv, 'first_week') === 3 && cnt(srv, '/aprobar') === 17, 'censo server intacto (server.js sin tocar)');
t(srv.includes("'/api/oficina/jardin-semilla-regalo'") && srv.includes("'/api/oficina/jardin-semilla-canjear'") && srv.includes("'/api/oficina/jardin-semilla-mia'"), 'server: endpoints de semilla quedan (muertos, lote aparte)');

console.log(`\nTOTAL: ${ok} ok, ${bad} fallos${bad ? ' :: ' + fails.join(' | ') : ''}`);
process.exit(bad ? 1 : 0);
