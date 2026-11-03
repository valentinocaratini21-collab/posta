/* LOTE CARGA-PUNTITOS — checks: entre rutas, solo 3 puntitos animados
   sobre el degradado de la app (nunca pantalla blanca), sin textos, sin
   ilustraciones, solo mientras carga de verdad, reduced-motion estático.
   Decisión Valentino 2/11: el esqueleto con cara + shimmer queda
   reemplazado (ver assert superseded en test-lote15).
   Uso: node test-lotecargapuntitos.js (desde la raíz del árbol). */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function read(f) { return fs.readFileSync(path.join(__dirname, f), 'utf8'); }

const app = read('public/app.js');
const css = read('public/styles.css');
const idx = read('public/index.html');
const srv = read('server.js');
const srvPri = read('../pristine-v544/server.js');

console.log('== 1. La pintura intermedia es solo 3 puntitos (función real en vm) ==');
check('pzSkeletonHTML definida con (tab)', /function pzSkeletonHTML\(tab\)/.test(app));
let html = null;
try {
  const m = app.match(/function pzSkeletonHTML\(tab\) \{[\s\S]*?\n\}/);
  check('pzSkeletonHTML extraíble', !!m);
  if (m) html = vm.runInNewContext(m[0] + ';pzSkeletonHTML("inicio");');
} catch (e) { check('pzSkeletonHTML evaluable en vm', false, String(e).slice(0, 160)); }
check('devuelve .pz-load', typeof html === 'string' && html.includes('class="pz-load"'));
check('exactamente 3 puntitos', typeof html === 'string' && (html.match(/pz-dot /g) || []).length === 3);
check('orden celeste/dorado/navy', typeof html === 'string' &&
  html.indexOf('pz-dot-1') < html.indexOf('pz-dot-2') && html.indexOf('pz-dot-2') < html.indexOf('pz-dot-3'));
check('sin textos: solo spans vacíos', typeof html === 'string' && !/>[^<a-z][^<]*</.test(html.replace(/<span[^>]*><\/span>/g, '')));
check('sin ilustraciones: sin <img', typeof html === 'string' && !html.includes('<img'));
check('sin botones ni handlers', typeof html === 'string' && !/onclick|on[A-Z][a-z]+ *=/.test(html));
check('aria-hidden (decorativa)', typeof html === 'string' && html.includes('aria-hidden="true"'));

console.log('== 2. CSS: puntitos Posty sobre degradado, nunca blanco ==');
const loadRule = (css.match(/\.pz-load\{[^}]*\}/) || [''])[0];
check('.pz-load con degradado de la app', loadRule.includes('linear-gradient(165deg,#dff1fa') && loadRule.includes('#fdeec2'));
check('.pz-load sin fondo blanco', !/#fff|white/.test(loadRule));
check('puntito 1 celeste #2793C8', /\.pz-dot-1\{background:#2793C8\}/.test(css));
check('puntito 2 dorado #FEC14D', /\.pz-dot-2\{background:#FEC14D/.test(css));
check('puntito 3 navy #0A1E33', /\.pz-dot-3\{background:#0A1E33/.test(css));
check('rebote con delays escalonados', css.includes('@keyframes pz-dot-bounce') && css.includes('animation-delay:.15s') && css.includes('animation-delay:.3s'));
check('reduced-motion: puntitos quietos', /@media \(prefers-reduced-motion: reduce\)\{\.pz-dot\{animation:none\}\}/.test(css));

console.log('== 3. Solo durante carga real + cableado intacto ==');
check('pzPaintSkeleton sigue pintando vía appShell', /root\.innerHTML = appShell\(tab, pzSkeletonHTML\(tab\)\)/.test(app));
check('pintura final reemplaza la carga', /root\.innerHTML = appShell\(tab, content\)/.test(app));
check('esqueleto en inicio/schedule/analisis/ajustes/jardin/bandeja/post',
  /tab === 'inicio'\) \{ pzPaintSkeleton\(tab\);/.test(app) &&
  /tab === 'schedule'\) \{ pzPaintSkeleton\(tab\);/.test(app) &&
  /tab === 'analisis'\) \{ pzPaintSkeleton\(tab\);/.test(app) &&
  /tab === 'ajustes'\) \{ pzPaintSkeleton\(tab\);/.test(app) &&
  /tab === 'jardin-posty'\) \{ pzPaintSkeleton\(tab\);/.test(app) &&
  /tab === 'bandeja'\) \{ pzPaintSkeleton\(tab\);/.test(app) &&
  /tab === 'post'\) \{ pzPaintSkeleton\(tab\);/.test(app));
const skBody = (app.split('function pzSkeletonHTML')[1] || '').split('function pzPaintSkeleton')[0] || '';
const paintBody = (app.split('function pzPaintSkeleton')[1] || '').split('let PZ_PREFETCHED')[0] || '';
check('sin espera artificial: sin setTimeout en el loader', !skBody.includes('setTimeout') && !paintBody.includes('setTimeout'));

console.log('== 4. Lo viejo fuera + splash de arranque intacto ==');
check('sin pz-sk-wrap/pz-sk-block/pz-sk-head en app.js', !app.includes('pz-sk-wrap') && !app.includes('pz-sk-block') && !app.includes('pz-sk-head'));
check('sin reglas .pz-sk ni shimmer en CSS', !css.includes('.pz-sk-') && !css.includes('pz-sk-shimmer'));
check('splash de arranque intacto (no es esta pantalla)', idx.includes('#posty-boot{position:fixed;inset:0;background:linear-gradient(165deg,#dff1fa') && idx.includes('pz-dot pz-dot-1') && app.includes('bootSplashOff')); // DOBLE-SPLASH (decisión Valentino 2/11, SUPERSEDE el fondo #F4FAFE): el boot es solo puntitos v549 sobre el degradado; el retiro al pintar sigue intacto

console.log('== 5. Censo + M78 + server intacto ==');
const count = (s, re) => (s.match(re) || []).length;
check('censo server 3/16/3/16', count(srv, /catsMatch/g) === 3 && count(srv, /week-redo/g) === 16 && count(srv, /first_week/g) === 3 && count(srv, /\/aprobar/g) === 16);
check('censo app 4/1/1/0/7', count(app, /pzGoBack/g) === 4 && count(app, /pz-detalle-setup/g) === 1 && count(app, /\/aprobar/g) === 1 && count(app, /autofetch/g) === 0 && count(app, /pcDayKeyShift/g) === 7);
// RE-BASE v549 (liberación sobre v548, con causa): la base v548 trae 978
// funciones (los lotes v545–v548 sumaron 9); puntitos no agrega ninguna.
// El server de v548 difiere del v544 SOLO en la línea BUILD (verificado
// por diff), así que el assert compara ignorando BUILD: sigue cazando
// cualquier cambio real de servidor y sobrevive al bump v548→v549.
check('M78 0/0 (sin funciones nuevas)', count(app, /function /g) === 978);
const stripBuild = s => s.replace(/const BUILD_ID = '[^']+';/, '');
check('server.js = base salvo BUILD (sin cambios de servidor)', stripBuild(srv) === stripBuild(srvPri));

console.log(`\nCARGA-PUNTITOS: ${ok} OK, ${fail} FAIL`);
if (fails.length) console.log('FALLOS:', fails.join(' | '));
process.exit(fail ? 1 : 0);
