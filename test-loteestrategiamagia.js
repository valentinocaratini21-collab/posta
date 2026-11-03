/* LOTE ESTRATEGIA-MAGIA — checks: al entrar a la carta de Estrategia,
   destellos estrella de 4 puntas dorado/celeste, solo en la entrada,
   que se desvanecen solos, sin tapar contenido ni bloquear toques,
   sin repetirse mientras la carta está abierta, anulados con
   reduced-motion. Decisión Valentino 2/11.
   Uso: node test-loteestrategiamagia.js (desde la raíz del árbol). */
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

const chunk = read('public/chunk-analisis.js');
const css = read('public/styles.css');

console.log('== 1. Cableado: solo en la entrada a la carta actual ==');
check('anaMagiaEntrada definida 1 vez', (chunk.match(/function anaMagiaEntrada\(\)/g) || []).length === 1);
// TANDA (conciliación): anaLoad suma Mount (próximo-paso) y WeekNums
// (números) entre BoostRec y Magia; la llamada sigue siendo única y en
// anaLoad tras pintar la carta (el assert estricto de secuencia ya no
// aplica al árbol combinado).
const _loadStart = chunk.indexOf('async function anaLoad');
const _loadEnd = chunk.indexOf('\nfunction ', _loadStart + 1);
const _loadBody = chunk.slice(_loadStart, _loadEnd);
check('anaLoad la llama tras pintar la carta', _loadBody.includes('rootEl.innerHTML = anaCartaHTML(d);') && _loadBody.includes('anaMagiaEntrada();'));
check('anaOpenPast NO la llama: un único sitio de llamada, en anaLoad', (chunk.match(/[^a-zA-Z]anaMagiaEntrada\(\);/g) || []).length === 1);
check('anaCartaHTML intacta', /function anaCartaHTML\(d\)/.test(chunk));
check('anaBoostRecLoad sigue en anaLoad', /anaBoostRecLoad\(\);/.test(chunk));

console.log('== 2. Regla de magia: estrella 4 puntas, dorado/celeste, nunca puntos ni polvo ==');
const fnSrc = chunk.slice(chunk.indexOf('function anaMagiaEntrada()'));
check('función extraíble', fnSrc.length > 100);
check('dorado #FEC14D y celeste #2793C8 en la función', fnSrc.includes('#FEC14D') && fnSrc.includes('#2793C8'));
check('5 destellos', (fnSrc.match(/i < 5/) || []).length === 1);
check('clip-path estrella 4 puntas en CSS', css.includes('clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)'));
check('sin puntos: los destellos no son círculos', !/ana-magia-entrada i\{[^}]*border-radius:50%/.test(css));
check('estela suave (drop-shadow) por destello', fnSrc.includes('drop-shadow'));

console.log('== 3. Solo entrada, liviana, sin tapar ni bloquear ==');
check('contenedor pointer-events:none', /\.ana-magia-entrada\{[^}]*pointer-events:none/.test(css));
check('contenedor aria-hidden en la función', fnSrc.includes("setAttribute('aria-hidden', 'true')"));
check('animación 1 sola vez (no infinite)', /animation:anaMagiaEntradaKF 1\.8s ease-in-out 1 forwards/.test(css) && !/anaMagiaEntradaKF[^}]*infinite/.test(css));
check('keyframes terminan en opacidad 0', /@keyframes anaMagiaEntradaKF\{[\s\S]*100%\{opacity:0/.test(css));
check('se retira sola con timeout', /setTimeout\(function \(\) \{ try \{ box\.remove\(\); \} catch \(e\) \{\} \}, 3000\)/.test(fnSrc));
check('guarda anti-repetición mientras está abierta', fnSrc.includes("head.querySelector('.ana-magia-entrada')"));

console.log('== 4. Reduced-motion la anula ==');
check('JS consulta prefers-reduced-motion', fnSrc.includes("matchMedia('(prefers-reduced-motion: reduce)')"));
check('CSS oculta el contenedor con reduced-motion', /@media \(prefers-reduced-motion: reduce\)\{\.ana-magia-entrada\{display:none\}\.ana-magia-entrada i\{animation:none\}\}/.test(css));

const fnFound = chunk.includes('function anaMagiaEntrada()');
if (!fnFound) { console.log('\n== 5. omitida: función ausente (esperable en prístino) =='); console.log('\n' + ok + ' ok, ' + fail + ' fallos' + (fails.length ? ' — ' + fails.join(' | ') : '')); process.exit(1); }
console.log('== 5. Comportamiento real en vm con DOM falso ==');
function makeDom(reduced) {
  let box = null;
  const timers = [];
  const head = {
    children: [],
    querySelector: function (sel) { return sel === '.ana-magia-entrada' ? box : null; },
    appendChild: function (el) { box = el; head.children.push(el); return el; }
  };
  function el() {
    return {
      className: '', style: {}, children: [], removed: false,
      setAttribute: function (k, v) { this[k] = v; },
      appendChild: function (c) { this.children.push(c); return c; },
      remove: function () { this.removed = true; }
    };
  }
  const sandbox = {
    document: {
      querySelector: function (sel) { return sel === '.ana-lhead' ? head : null; },
      createElement: el
    },
    window: { matchMedia: function () { return { matches: !!reduced }; } },
    setTimeout: function (cb) { timers.push(cb); return 1; },
    console: console
  };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + ';anaMagiaEntrada();', sandbox);
  return { head, box: function () { return box; }, timers, sandbox };
}
let d1 = makeDom(false);
check('primera entrada agrega el contenedor', !!d1.box() && d1.box().className === 'ana-magia-entrada');
check('contenedor con 5 destellos', d1.box() && d1.box().children.length === 5);
check('colores alternan dorado/celeste', d1.box() && d1.box().children.map(function (c) { return c.style.background; }).join(',') === '#FEC14D,#2793C8,#FEC14D,#2793C8,#FEC14D');
check('delays escalonados (entrada, no golpe único)', d1.box() && d1.box().children[4].style.animationDelay === '0.72s');
check('aria-hidden en el contenedor real', d1.box() && d1.box()['aria-hidden'] === 'true');
/* segunda llamada con la carta todavía abierta: no duplica */
vm.runInContext('anaMagiaEntrada();', d1.sandbox);
check('segunda llamada mientras está abierta no duplica', d1.head.children.length === 1);
check('el timeout de retiro queda programado', d1.timers.length === 1);
d1.timers[0]();
check('el timeout retira el contenedor', d1.box().removed === true);
let d2 = makeDom(true);
check('reduced-motion: no agrega nada', d2.head.children.length === 0);
let d3 = (function () {
  const sandbox = {
    document: { querySelector: function () { return null; }, createElement: function () { throw new Error('no debe crear'); } },
    window: { matchMedia: function () { return { matches: false }; } },
    setTimeout: function () {}, console: console
  };
  vm.createContext(sandbox);
  let threw = false;
  try { vm.runInContext(fnSrc + ';anaMagiaEntrada();', sandbox); } catch (e) { threw = true; }
  return threw;
})();
check('sin encabezado no rompe (no lanza)', d3 === false);

console.log('\n' + ok + ' ok, ' + fail + ' fallos' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
