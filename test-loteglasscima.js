// LOTE GLASS-CIMA — test nuevo (node, sin dependencias).
// Uso: node test-loteglasscima.js <workdir>  (workdir con public/styles.css, server.js)
// En prístino v547: fallan EXACTAMENTE los asserts del bloque nuevo (2,3,4,5).
// El resto (tira preexistente .55, modo oscuro intacto, server idéntico) pasa.
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || '.';
const css = fs.readFileSync(path.join(dir, 'public/styles.css'), 'utf8');
const MARK = 'LOTE GLASS-CIMA';
const DOCK_BG = 'rgba(255,255,255,.55)';
const DOCK_BLUR = 'blur(16px) saturate(1.4)';
const DOCK_BD = 'rgba(255,255,255,.75)';
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra ? ' :: ' + extra : '')); }
  console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name + (extra && !cond ? ' :: ' + extra : ''));
}
function ruleHas(selectorRe, props) {
  const m = css.match(new RegExp(selectorRe + '\\{[^}]*\\}'));
  if (!m) return false;
  return props.every(p => m[0].includes(p));
}
// --- bloque nuevo ---
const bi = css.indexOf(MARK);
const block = bi >= 0 ? css.slice(bi) : '';
ok('1. tira del jardín ya usa receta del dock (.55 + blur + borde)',
  ruleHas('#inicioView \\.mx-tira-jardin\\.mx-tira-posty', [DOCK_BG, DOCK_BLUR, DOCK_BD]));
ok('2. bloque GLASS-CIMA: hf-head pasa a .55 (no .40)',
  block.includes('#inicioView .hf-head{background:' + DOCK_BG));
ok('3. bloque GLASS-CIMA: fondo Inicio con resplandores subidos + mismas paradas',
  block.includes('rgba(39,147,200,.45)') && block.includes('rgba(254,193,77,.50)') &&
  block.includes('linear-gradient(165deg,#dff1fa 0%,#eef9fd 30%,#fdf9ec 62%,#fdeec2 100%)'));
ok('4. bloque GLASS-CIMA: .mx-zona (sin candado) en receta del dock',
  block.includes('.mx-zona:not(.lock){background:' + DOCK_BG) && block.includes('.mx-zona:not(.lock)') &&
  block.slice(block.indexOf('.mx-zona:not(.lock)')).split('}')[0].includes(DOCK_BLUR));
ok('5. bloque GLASS-CIMA: .card.int-advanced en receta del dock',
  block.includes('.card.int-advanced{background:' + DOCK_BG));
// --- fotos sin vidrio: el bloque no menciona selectores de foto/tile/grilla ---
const blockSelectors = block.split('}').map(s => s.split('{')[0] || '');
const photoSel = blockSelectors.some(s => /img|\.hf-tile|\.hf-grid|mx-slider-foto|mx-etapa|hf-d-track/.test(s));
ok('6. bloque GLASS-CIMA no toca fotos/tiles/grilla', !photoSel);
// --- candado y anillo preservados ---
ok('7. .mx-zona.lock conserva fondo gris propio (regla base intacta)',
  css.includes('.mx-zona.lock{filter:grayscale(1) brightness(.78);background:#F4F1F7}'));
ok('8. .mx-zona-viva conserva anillo dorado en el bloque nuevo',
  block.includes('.mx-zona-viva') && block.includes('rgba(254,193,77,.55),0 6px 16px'));
// --- modo oscuro intacto ---
ok('9. bloque modo oscuro presente con su regla .hf-head',
  css.includes('@media (prefers-color-scheme: dark)') && css.includes('.hf-head,.fp-head{background:#fff'));
// --- contraste (medido, no maquillado) ---
function lum(hex) {
  const c = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function blend(fg, bg, a) { return fg.map((v, i) => Math.round(a * v + (1 - a) * bg[i])); }
function hex(rgb) { return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join(''); }
function ratio(h1, h2) {
  const l1 = lum(h1), l2 = lum(h2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const white = [255, 255, 255];
const zones = [
  ['top-plano', [0xdf, 0xf1, 0xfa]],
  ['glow-azul', blend([39, 147, 200], [0xdf, 0xf1, 0xfa], 0.45)],
  ['glow-dorado', blend([254, 193, 77], [0xee, 0xf9, 0xfd], 0.50)],
];
let navyOk = true;
for (const [name, bg] of zones) {
  const p = hex(blend(white, bg, 0.55));
  const rn = ratio('0A1E33', p), r73 = ratio('737373', p), r8e = ratio('8e8e8e', p);
  console.log(`    contraste ${name}: panel ${p} navy=${rn.toFixed(2)} gris73=${r73.toFixed(2)} gris8e=${r8e.toFixed(2)}`);
  if (rn < 4.5) navyOk = false;
}
ok('10. navy #0A1E33 >= 4.5 en las 3 zonas (grises solo se MIDEN y se declaran en STATUS)', navyOk);
console.log(`\nTOTAL: ${pass} ok, ${fail} fail`);
if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log(' - ' + f)); }
process.exit(fail ? 1 : 0);
