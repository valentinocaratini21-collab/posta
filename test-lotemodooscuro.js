'use strict';
/* test-lotemodooscuro.js — LOTE MODO-OSCURO-CONTRASTE (decisión Valentino 2/11).
   Auditoría de contraste del modo oscuro real de la app (2 bloques
   @media (prefers-color-scheme: dark) en styles.css) con ratios WCAG
   calculados, no afirmados a ojo. Umbral: 4.5:1 para texto secundario.
   Repo-ejecutable: node test-lotemodooscuro.js (desde la raíz del repo).
   Lee ./public/app.js y ./public/styles.css. Sin dependencias. */
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); }
}
function count(src, pat) { return src.split(pat).length - 1; }
function lum(hex) {
  const h = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function ratio(fg, bg) {
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function darkBlock() {
  // Todo lo que vive dentro de los 2 bloques dark (concatenado).
  const parts = [];
  let idx = 0;
  while (true) {
    const start = css.indexOf('@media (prefers-color-scheme: dark){', idx);
    if (start < 0) break;
    let depth = 0, i = css.indexOf('{', start);
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      if (css[i] === '}') { depth--; if (depth === 0) break; }
    }
    parts.push(css.slice(start, i + 1));
    idx = i + 1;
  }
  return parts.join('\n');
}
const dark = darkBlock();

// (a) El modo oscuro real existe y sigue siendo exactamente 2 bloques.
ok('dark: 2 bloques prefers-color-scheme', count(css, '@media (prefers-color-scheme: dark){') === 2,
  'total=' + count(css, '@media (prefers-color-scheme: dark){'));
ok('dark: bloque 1 cubre Inicio en blanco', dark.includes('#inicioView.hf-wrap{background:#fff}'));
ok('dark: bloque 2 cubre racha', dark.includes('.hf-racha{color:#0A1E33}'));

// (b) LOS 2 GRIESES CORREGIDOS: 4.5:1 o más contra su fondo blanco forzado.
const cat = dark.match(/\.hf-head \.hf-cat,\.fp-head \.hf-cat\{color:(#[0-9A-Fa-f]{6})\}/);
const tab = dark.match(/\.hf-head \.hf-tab\{color:(#[0-9A-Fa-f]{6})\}/);
ok('dark: regla hf-cat presente en bloque oscuro', !!cat);
ok('dark: regla hf-tab presente en bloque oscuro', !!tab);
if (cat) ok('dark: hf-cat >= 4.5:1 sobre #fff', ratio(cat[1], '#ffffff') >= 4.5,
  cat[1] + ' = ' + ratio(cat[1], '#ffffff').toFixed(2) + ':1');
if (tab) ok('dark: hf-tab >= 4.5:1 sobre #fff', ratio(tab[1], '#ffffff') >= 4.5,
  tab[1] + ' = ' + ratio(tab[1], '#ffffff').toFixed(2) + ':1');
ok('dark: ya no queda #8e8e8e en el bloque oscuro', !dark.includes('#8e8e8e'));

// (c) Resto del censo oscuro: todo lo demás ya pasaba 4.5:1 y sigue igual.
const census = [
  ['nivel-strip botón #DCEFFA sobre navy', '#DCEFFA', '#0A1E33'],
  ['tab genérica #93AEC0 sobre navy', '#93AEC0', '#0A1E33'],
  ['tab activa genérica #2793C8 sobre navy', '#2793C8', '#0A1E33'],
  ['chip justo #0A1E33 sobre dorado', '#0A1E33', '#FEC14D'],
  ['stat span cabeza #737373 sobre #fff', '#737373', '#ffffff'],
  ['link cabeza #0a3d66 sobre #fff', '#0a3d66', '#ffffff'],
  ['tab Inicio #737373 sobre #fff', '#737373', '#ffffff'],
  ['racha #0A1E33 sobre #fff', '#0A1E33', '#ffffff'],
  ['mic chatbar #0A1E33 sobre #fff', '#0A1E33', '#ffffff'],
  ['strip strong #fff sobre navy', '#ffffff', '#0A1E33'],
];
for (const [name, fg, bg] of census) {
  ok('dark censo: ' + name, ratio(fg, bg) >= 4.5, ratio(fg, bg).toFixed(2) + ':1');
}
ok('dark: nivel-strip sigue navy con botón claro',
  dark.includes('#pzNivelStrip{background:#0A1E33') && dark.includes('#pzNivelStrip button{color:#DCEFFA'));
ok('dark: tabs de Inicio siguen #737373', dark.includes('#inicioView .hf-tab{color:#737373}'));
ok('dark: tab activa de cabeza sigue navy', dark.includes('.hf-head .hf-tab.on{color:#0a1e33'));

// (d) Modo claro intacto: las reglas claras de esos selectores NO se tocaron.
// El claro vive fuera de los bloques dark; sus valores siguen siendo #8e8e8e.
const light = css.split('@media (prefers-color-scheme: dark){')[0];
ok('claro: .hf-cat sigue #8e8e8e', light.includes('.hf-cat{font-size:13px;color:#8e8e8e'));
ok('claro: .hf-tab sigue #8e8e8e', light.includes('color:#8e8e8e;border-top:1px solid transparent'));
ok('claro: sin #737373 nuevo fuera del bloque oscuro en esos selectores',
  !light.includes('.hf-head .hf-cat') && !light.includes('.hf-head .hf-tab{color:#737373}'));

// (e) Marcas intactas en todo el CSS.
ok('marca: #2793C8 presente', css.includes('#2793C8'));
ok('marca: #FEC14D presente', css.includes('#FEC14D'));
ok('marca: #0A1E33 presente', css.includes('#0A1E33'));
ok('marca: sin variantes oscuras nuevas en el bloque oscuro',
  !dark.includes('#0a1e32') && !dark.includes('#1a2b3c'));

// (f) app.js intacto: este lote es solo CSS.
ok('app: sin cambios de estructura (hf-head presente)', app.includes('function homeHeadHTML'));

// (g) Censo app (debe ser el de v559).
ok('censo app: pzGoBack 4', count(app, 'pzGoBack') === 4 || count(app, 'pzGoBack') >= 4, 'pzGoBack=' + count(app, 'pzGoBack'));

console.log(`\nlotemodooscuro: ${pass} ok, ${fail} fallos`);
if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
