/* LOTE ENCABEZADO-COLAPSABLE — checks: encabezado de Inicio se compacta
   al bajar y vuelve completo al subir; Editar/Compartir siempre visibles.
   Uso: node test-loteencabezadocolapsable.js (desde la raíz del árbol).
   Sin dependencias. PZ_TARGET permite correrlo contra otro árbol. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = process.env.PZ_TARGET || __dirname;
let ok = 0, fail = 0, fails = [];
function check(name, cond, extra) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

const app = read('public/app.js');
const css = read('public/styles.css');
const srv = read('server.js');
const srvPristine = fs.readFileSync(path.join(__dirname, '..', 'pristine-v559', 'server.js'), 'utf8');

console.log('== ESTÁTICOS: funciones y listener ==');
check('pzHeadCollapseNext definida 1 vez', (app.match(/function pzHeadCollapseNext\(/g) || []).length === 1);
check('pzHeadCollapseNext llamada solo desde el sync', (app.match(/pzHeadCollapseNext\(/g) || []).length === 2);
check('pzHeadCollapseSync definida 1 vez', (app.match(/function pzHeadCollapseSync\(/g) || []).length === 1);
check('listener scroll pasivo', /window\.addEventListener\('scroll', pzHeadCollapseSync, \{ passive: true \}\)/.test(app));
check('bind único con guarda', /__pzHeadCollapseBound/.test(app));
check('umbral colapso 120', /y > 120/.test(app));
check('tope expansión 40', /y <= 40/.test(app));
check('delta subida 10', /y < last - 10/.test(app));
check('sin desborde: no colapsa (guarda maxScroll)', /maxScroll <= 0/.test(app));
check('sync no-op sin #inicioView', /if \(!iv\) return/.test(app));

console.log('== ESTÁTICOS: CSS del estado compacto ==');
const collapsed = css.split('LOTE ENCABEZADO-COLAPSABLE')[1] || '';
check('bloque hf-collapsed existe', !!collapsed);
check('head compacto en flex una fila', /#inicioView\.hf-collapsed \.hf-head\{display:flex;align-items:center/.test(css));
check('avatar compacto 40px', /#inicioView\.hf-collapsed \.hf-head \.hf-ava-in\{width:40px;height:40px\}/.test(css));
for (const sel of ['hf-stats', 'hf-cat', 'hf-bio', 'hf-link', 'hf-racha', 'ig-head-chip']) {
  check('oculto en compacto: ' + sel, collapsed.includes('.hf-head .' + sel));
}
check('pacts NUNCA ocultos en compacto', !collapsed.includes('hf-pacts'));
check('sin transición en el bloque (instantáneo)', !/transition/.test(collapsed));
const collapsedSelectors = [...css.matchAll(/([^{}]*hf-collapsed[^{}]*)\{/g)].map((m) => m[1]);
check('todas las reglas hf-collapsed son de #inicioView', collapsedSelectors.length > 0 && collapsedSelectors.every((s) => s.includes('#inicioView')));

console.log('== INTACTOS ==');
// (Liberación v588 · causa: BUILD v560–v587; el hecho del lote es que no toca server.)
check('server.js sin marcas del lote', !srv.includes('pzHeadCollapse'));
// (Liberación v588 · causa: inicio-3 (v585) cambió la firma a (en, acceptHTML);
// el hecho es la composición head + actions + tabs, en ese orden.)
check('inicioView compone head + pacts + tabs', app.includes('homeHeadHTML(prof, bizName') && app.includes('hfProfileActionsHTML(enHome') && app.includes('hfTabsHTML(HF_TAB, enHome)'));
check('clase base de inicioView intacta', app.includes('id="inicioView" class="hf-wrap'));
check('regla base .hf-head intacta', /#inicioView \.hf-head\{background:rgba\(255,255,255,\.40\)/.test(css));
check('avatar base 72px intacto', /#inicioView \.hf-ava-in\{width:72px;height:72px\}/.test(css));
const ivSlice = app.slice(app.indexOf('id="inicioView"'), app.indexOf('id="inicioView"') + 3000);
check('orden feed intacto (pacts -> tabs -> grilla)', ivSlice.indexOf('hfProfileActionsHTML') > 0 && ivSlice.indexOf('hfProfileActionsHTML') < ivSlice.indexOf('hfTabsHTML') && ivSlice.indexOf('hfTabsHTML') < ivSlice.indexOf('gridHTML'));

console.log('== FUNCIONALES: pzHeadCollapseNext en vm ==');
const mNext = app.match(/function pzHeadCollapseNext[\s\S]*?\n\}\n/);
check('bloque Next extraíble', !!mNext);
const mSync = app.match(/let pzHeadCollapseState[\s\S]*?window\.addEventListener\('scroll', pzHeadCollapseSync, \{ passive: true \}\);?\n?\}/);
check('bloque Sync extraíble', !!mSync);
if (mNext && mSync) {
  const sandbox = { console };
  sandbox.window = {
    innerHeight: 800, scrollY: 0,
    addEventListener: () => {},
  };
  sandbox.document = {
    documentElement: { scrollHeight: 2000, scrollTop: 0 },
    getElementById: () => null,
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(mNext[0] + '\n' + mSync[0], sandbox);
  const Next = sandbox.pzHeadCollapseNext;
  check('tope: completo', Next(0, 0, false).collapsed === false);
  check('bajar a 121: compacto', Next(121, 0, false).collapsed === true);
  check('exacto 120: sigue completo', Next(120, 0, false).collapsed === false);
  check('bajar lento 100: sigue completo', Next(100, 90, false).collapsed === false);
  check('subir 20px desde 200: vuelve completo', Next(180, 200, true).collapsed === false);
  check('subir 5px: histéresis, sigue compacto', Next(495, 500, true).collapsed === true);
  check('tope 40: vuelve completo', Next(40, 500, true).collapsed === false);
  check('41 con delta chico: sigue compacto', Next(41, 45, true).collapsed === true);
  check('salto directo 0→300: compacto', Next(300, 0, false).collapsed === true);

  console.log('== FUNCIONALES: pzHeadCollapseSync con DOM falso ==');
  const cls = new Set();
  const el = {
    classList: {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      toggle: (c, f) => { if (f) cls.add(c); else cls.delete(c); },
      contains: (c) => cls.has(c),
    },
  };
  sandbox.document.getElementById = (id) => (id === 'inicioView' ? el : null);
  sandbox.document.documentElement.scrollHeight = 2000;
  const Sync = sandbox.pzHeadCollapseSync;
  sandbox.window.scrollY = 0; Sync();
  check('sync tope: sin clase', !cls.has('hf-collapsed'));
  sandbox.window.scrollY = 300; Sync();
  check('sync bajar: clase puesta', cls.has('hf-collapsed'));
  sandbox.window.scrollY = 295; Sync();
  check('sync subir poco (5px): clase sigue', cls.has('hf-collapsed'));
  sandbox.window.scrollY = 270; Sync();
  check('sync subir 25px: clase quitada', !cls.has('hf-collapsed'));
  sandbox.window.scrollY = 30; Sync();
  check('sync volver arriba: clase quitada', !cls.has('hf-collapsed'));
  sandbox.document.documentElement.scrollHeight = 800; // = innerHeight: sin desborde
  sandbox.window.scrollY = 300; Sync();
  check('sync sin desborde: clase quitada y reseteada', !cls.has('hf-collapsed'));
  sandbox.document.getElementById = () => null;
  let threw = false;
  try { Sync(); } catch (e) { threw = true; }
  check('sync sin #inicioView: no rompe', !threw);
}

console.log('\n' + ok + ' ok, ' + fail + ' fallos' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
