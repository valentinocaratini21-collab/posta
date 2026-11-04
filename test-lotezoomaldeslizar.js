// LOTE ZOOM-AL-DESLIZAR + DOCK-ESPACIADO — test estático (sin JS nuevo).
// Geometría medida con Chromium CDP: ver cdp-measure.js + cdp-result.json
// en el scratch (dock-bb base: spread 24.89/39.89/59.89 -> parche: 0;
// mz ya era 0.02; inicio docScrollW == viewport en ambos estados).
const fs = require('fs');
const path = require('path');
const W = path.join(__dirname);
let ok = 0, fail = 0;
function t(name, cond) { if (cond) { ok++; } else { fail++; console.log('FAIL:', name); } }
function read(rel) { return fs.readFileSync(path.join(W, rel), 'utf8'); }
const app = read('public/app.js');
const css = read('public/styles.css');
const idx = read('public/index.html');
const idxEn = read('public/en/index.html');

// 1) Viewport meta bloquea zoom en ambos index (exactamente 1 vez cada uno).
t('meta ES con maximum-scale=1 + user-scalable=no', (idx.match(/maximum-scale=1, user-scalable=no/g) || []).length === 1);
t('meta EN con maximum-scale=1 + user-scalable=no', (idxEn.match(/maximum-scale=1, user-scalable=no/g) || []).length === 1);
t('meta ES conserva width=device-width + initial-scale=1', idx.includes('width=device-width, initial-scale=1, maximum-scale=1'));
t('meta EN conserva width=device-width + initial-scale=1', idxEn.includes('width=device-width, initial-scale=1, maximum-scale=1'));
// 2) Reglas nuevas del lote.
t('touch-action acotado a Inicio + dock + bottomstack', css.includes('#inicioView,.bb-bar,.mz-tabs,.mz-bottomstack{touch-action:pan-x pan-y}'));
t('colapsado: user/name con min-width:0', css.includes('#inicioView.hf-collapsed .hf-head .hf-user,#inicioView.hf-collapsed .hf-head .hf-name{min-width:0}'));
t('dock bb: 5 columnas iguales', css.includes('.bb-bar .bb-tab{flex:1;min-width:0}'));
t('mz-tabs sigue flex:1 (no se toca)', css.includes('.mz-tab{flex:1;text-align:center'));
// 3) Ningún handler de página escala al deslizar.
t('sin gesturestart', !/gesturestart/.test(app));
t('sin gesturechange', !/gesturechange/.test(app));
t('sin gestureend', !/gestureend/.test(app));
t('sin zoom sobre body/document', !/\.style\.zoom\s*=/.test(app));
t('sin escritura de visualViewport.scale', !/visualViewport\.scale\s*=/.test(app));
// 4) Preservados: F3 pinch manual, pull, carrusel, inputs sin zoom, grilla, aceptar, tik.
t('F3 pinch manual intacto', app.includes('function f3PinchMove'));
t('pull-to-refresh intacto', app.includes('pzPullInit'));
t('parte Z intacta (pzBlurActivo)', app.includes('pzBlurActivo'));
t('carrusel flechas intacto', css.includes('.car-arrow'));
t('grilla v609 intacta', css.includes('.hf-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'));
t('Aceptar todo arriba intacto', css.includes('.hf-pacts-accept .hf-accept-bar{position:static}'));
t('tik oculto v614 intacto', css.includes('#inicioView .hf-tile .hf-tik{display:none}'));
t('encabezado colapsable intacto', app.includes('hf-collapsed'));
console.log(`test-lotezoomaldeslizar: ${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
