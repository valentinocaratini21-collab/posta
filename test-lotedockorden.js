// LOTE DOCK-ORDEN — decisión Valentino 2/11 ~12:40 (botón):
// barra inferior Inicio → Estrategia → Nivel → Ajustes.
// La pestaña Jardín pasó a llamarse Nivel (ES) / Level (EN) el 7/11
// (antes Premios/Prizes, 2/11), misma ruta #/app/jardin-posty, mismo icono
// sprout. El título interno de la pantalla («El jardín de Posty») NO cambia
// en esta pasada.
// Uso: node test-lotedockorden.js [dir] (dir = raíz del árbol; default: __dirname).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let ok = 0, fail = 0, fails = [];
function check(name, cond) {
  if (cond) { ok++; console.log('  OK  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name); }
}
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const slice = (from, to) => {
  const a = app.indexOf(from);
  const b = to ? app.indexOf(to, a) : app.length;
  return (a < 0 || b < 0) ? '' : app.slice(a, b);
};
const bb = slice('function bbShell(tab, content)', 'async function bbLoadEstado');
const mz = slice('function mzTabsHTML(tab)', 'function appShell');
const dr = slice('<aside class="drawer"', '</aside>');

// ---------- 1. bb-bar (bbShell) ----------
check('bb-bar: Inicio < Estrategia < Nivel < Ajustes',
  bb.indexOf("tabBtn('inicio'") < bb.indexOf("tabBtn('analisis'")
  && bb.indexOf("tabBtn('analisis'") < bb.indexOf("tabBtn('jardin'")
  && bb.indexOf("tabBtn('jardin'") < bb.indexOf("tabBtn('ajustes'"));
check("bb-bar: etiqueta gzT('Nivel', 'Level')",
  bb.includes("gzT('Nivel', 'Level')"));
check('bb-bar: sin etiqueta Jardín en la barra',
  !bb.includes("gzT('Jardín'"));
check("bb-bar: clave y ruta intactas tabBtn('jardin', '#/app/jardin-posty')",
  bb.includes("tabBtn('jardin', '#/app/jardin-posty'"));
check('bb-bar: orden viejo ausente',
  !bb.includes("tabBtn('jardin', '#/app/jardin-posty', gzT('Jardín', 'Garden'))}${tabBtn('analisis'"));

// ---------- 2. mz-tabs (móvil) ----------
check('mz-tabs: Inicio < Estrategia < Nivel < Ajustes',
  mz.indexOf("t('inicio'") < mz.indexOf("t('analisis'")
  && mz.indexOf("t('analisis'") < mz.indexOf("t('jardin'")
  && mz.indexOf("t('jardin'") < mz.indexOf("t('ajustes'"));
check("mz-tabs: etiqueta gzT('Nivel', 'Level')",
  mz.includes("gzT('Nivel', 'Level')"));
check('mz-tabs: sin Jardín en la barra',
  !mz.includes("'Jardín'"));
check("mz-tabs: ruta y clave intactas t('jardin', 'jardin-posty', sprout)",
  mz.includes("t('jardin', 'jardin-posty', pzIc('sprout')"));

// VM: render real de mzTabsHTML en ES y EN.
// (LOTE DOCK-MAS · adaptación con causa: mzTabsHTML ahora llama a
// pzDockMasBtn/pzDockMasHTML — el + entre Estrategia y Nivel — y el
// sandbox necesita esos stubs; el orden de las 4 pestañas no cambia.)
function renderMz(lang) {
  const m = app.match(/function mzTabsHTML\(tab\) \{[\s\S]*?\n\}/);
  if (!m) return '';
  const sandbox = { ME: { lang }, pzIc: (k) => k, console };
  sandbox.gzT = (es, en) => (sandbox.ME.lang === 'en' ? en : es);
  sandbox.pzDockMasBtn = () => '<button class="mz-tab-mas">+</button>';
  sandbox.pzDockMasHTML = () => '<div class="pz-dockmas"></div>';
  vm.createContext(sandbox);
  vm.runInContext(m[0] + '\nthis.__mz = mzTabsHTML;', sandbox);
  return vm.runInContext('__mz("inicio")', sandbox);
}
const mzEs = renderMz('es'), mzEn = renderMz('en');
check('mz-tabs VM ES: orden Inicio, Estrategia, Nivel, Ajustes',
  mzEs.indexOf('Inicio') < mzEs.indexOf('Estrategia')
  && mzEs.indexOf('Estrategia') < mzEs.indexOf('Nivel')
  && mzEs.indexOf('Nivel') < mzEs.indexOf('Ajustes'));
check('mz-tabs VM EN: orden Inicio, Estrategia, Level, Ajustes',
  mzEn.indexOf('Inicio') < mzEn.indexOf('Estrategia')
  && mzEn.indexOf('Estrategia') < mzEn.indexOf('Level')
  && mzEn.indexOf('Level') < mzEn.indexOf('Ajustes'));
check('mz-tabs VM: Nivel apunta a data-tab jardin-posty',
  /data-tab="jardin-posty"[^>]*>.*Nivel|Nivel/.test(mzEs) && mzEs.includes('data-tab="jardin-posty"'));
check('mz-tabs VM ES: + entre Estrategia y Nivel (dock-mas)',
  mzEs.indexOf('Estrategia') < mzEs.indexOf('mz-tab-mas') && mzEs.indexOf('mz-tab-mas') < mzEs.indexOf('Nivel'));
check('mz-tabs VM EN: + entre Estrategia y Level (dock-mas)',
  mzEn.indexOf('Estrategia') < mzEn.indexOf('mz-tab-mas') && mzEn.indexOf('mz-tab-mas') < mzEn.indexOf('Level'));

// ---------- 3. Drawer ----------
check('drawer: Inicio < Estrategia < Nivel < Ajustes',
  dr.indexOf('data-tab="inicio"') < dr.indexOf('data-tab="analisis"')
  && dr.indexOf('data-tab="analisis"') < dr.indexOf('data-tab="jardin-posty"')
  && dr.indexOf('data-tab="jardin-posty"') < dr.indexOf('data-tab="ajustes"'));
check('drawer: etiqueta Nivel/Level con ternario EN',
  dr.includes("? 'Level' : 'Nivel'"));
check('drawer: icono sprout sigue en el botón jardin-posty',
  dr.includes('data-tab="jardin-posty"><span class="di">${pzIc(\'sprout\')}'));
check('drawer: sin botón Jardín',
  !dr.includes('>Jardín</button>'));

// ---------- 4. Alcance: lo que NO cambia ----------
check('título interno intacto: El jardín de Posty',
  app.includes("gzT('El jardín de Posty'"));
check('recuento jardin-posty intacto (15)',
  (app.match(/jardin-posty/g) || []).length === 15);
check('etiqueta atrás de aprobación intacta (Garden/Jardín)',
  app.includes("(en ? 'Garden' : 'Jardín')"));
check('tirita de Inicio sigue yendo a #/app/jardin-posty',
  app.includes("mxJardinIr('#/app/jardin-posty'"));

console.log(`\nRESULTADO: ${ok} ok, ${fail} fallos`);
if (fails.length) console.log('FALLOS: ' + fails.join(' | '));
process.exit(fail ? 1 : 0);
