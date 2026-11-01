#!/usr/bin/env node
/* test-lote13.js — LOTE 13: corazón y fecha no se tocan + 5 mejoras Inicio.
   Corre con: node test-lote13.js  (sin deps, lee el árbol que lo contiene) */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');

let ok = 0, bad = 0;
function t(cond, name) {
  if (cond) { ok++; }
  else { bad++; console.log('FAIL:', name); }
}
function countLinesWith(txt, sub) {
  return txt.split('\n').filter(l => l.includes(sub)).length;
}
function ruleBody(txt, selector) {
  const i = txt.indexOf(selector);
  if (i < 0) return '';
  const j = txt.indexOf('}', i);
  return j < 0 ? '' : txt.slice(i, j + 1);
}

// 1. Franja flex: chip izq, corazón der, gap fijo 8px.
const strip = ruleBody(css, '.hf-strip{');
t(strip.includes('display:flex'), 'strip display:flex');
t(strip.includes('gap:8px'), 'strip gap 8px fijo');
t(strip.includes('padding:6px'), 'strip padding 6px');
t(strip.includes('position:absolute') && strip.includes('bottom:0'), 'strip absoluta abajo');
const stripChip = ruleBody(css, '.hf-strip .hf-chip{');
t(stripChip.includes('position:static'), 'chip en strip estática (no absoluta)');
t(stripChip.includes('min-width:0'), 'chip min-width 0');
t(stripChip.includes('overflow:hidden'), 'chip overflow hidden');
t(stripChip.includes('text-overflow:ellipsis'), 'chip ellipsis');
const stripLike = ruleBody(css, '.hf-strip .hf-like-in{');
t(stripLike.includes('position:static'), 'corazón en strip estático');
t(stripLike.includes('flex:0 0 auto'), 'corazón flex none (no se achica)');
const likeBase = ruleBody(css, '.hf-like{');
t(likeBase.includes('width:34px') && likeBase.includes('height:34px'), 'corazón 34×34 usable');

// 2. La tile emite chip + corazón DENTRO del strip, en ese orden; guards intactos.
t(app.includes('<span class="hf-strip">${chip}${archChip}<button type="button" class="hf-like hf-like-in"'),
  'tile: chip + corazón dentro de .hf-strip, chip primero');
t(app.includes('data-hf-like'), 'corazón conserva data-hf-like');
t(app.includes("[data-hf-like]"), 'guards data-hf-like presentes');
t(!app.includes('class="hf-cell-actions"'), 'sin fila abajo (no vuelve la fila del Lote 10)');

// 3. Geometría con números: tile mínima 390pt, 3 cols, gap 2px.
const tileW = Math.floor((390 - 2 * 2) / 3); // 128
const chipAvail = tileW - 12 - 34 - 8;       // padding 6+6, corazón 34, gap 8
t(tileW === 128, 'tile mínima 128px');
t(chipAvail === 74 && chipAvail > 0, 'chip dispone 74px antes de recortar (distancia mínima = gap 8 > 0)');

// 4. Tile sin imagen: algo real, nunca hueco blanco.
t(app.includes('hf-tile-ph-txt'), 'placeholder con texto existe');
t(app.includes('imagen en camino'), 'placeholder ES «imagen en camino»');
t(app.includes('Image on its way'), 'placeholder EN «Image on its way»');
const phCss = ruleBody(css, '.hf-tile-ph-txt{');
t(phCss.includes('flex-direction:column'), 'placeholder en columna');
t(phCss.includes('color:#0A1E33'), 'placeholder texto navy legible');

// 5. Tira del jardín: visual según nivel, nunca foto publicada ni avatar.
const tiraStart = app.indexOf('function mxTiraHTML');
const tiraEnd = app.indexOf('async function mxPortTop', tiraStart);
const tira = (tiraStart >= 0 && tiraEnd > tiraStart) ? app.slice(tiraStart, tiraEnd) : '';
t(tira.includes('jardin-bambu.webp'), 'tira usa bambusal completo en chico (LOTE JARDÍN: ya no el visual de la etapa)');
t(!tira.includes('mxFotoJardin(jardin)'), 'tira ya no usa la última foto publicada');
t(tira.includes(`onerror="this.closest('.mx-tira-thumb').remove()"`), 'tira sin fallback a avatar (LOTE 15: se quita el thumb entero)');
t(!tira.includes('ai-avatar'), 'tira sin avatar en su código');

// 6. Banda navy a blanco (modo oscuro) + pestañas legibles.
t(css.includes('#inicioView .hf-pacts,#inicioView .hf-tabs{background:#fff}'),
  'banda acciones+pestañas blanca en oscuro');
t(css.includes('#inicioView .hf-tab{color:#737373}'), 'pestaña inactiva legible');
t(css.includes('#inicioView .hf-tab.on{color:#0a1e33'), 'pestaña activa navy');

// 7. Racha legible: sin amarillo en .hf-racha.
t(!css.includes('.hf-racha{color:#FEC14D}'), 'racha sin amarillo');
t(css.includes('.hf-racha{color:#0A1E33}'), 'racha navy');

// 8. Despeje inferior de la grilla.
t(css.includes('#inicioView.hf-wrap{padding:4px 0 140px}'), 'grilla con despeje 140px');

// 9. Orden del feed intacto (Lote 12) + valores intactos.
t(app.includes('hfCmpDescKey'), 'orden Lote 12 intacto');
t(app.includes('hfWhenChip'), 'chapitas intactas');

// 10. Censo: sin altas ni bajas (líneas que contienen cada marcador).
t(countLinesWith(srv, 'catsMatch') === 3, 'censo catsMatch 3');
t(countLinesWith(srv, 'week-redo') === 16, 'censo week-redo 16');
t(countLinesWith(srv, 'first_week') === 3, 'censo first_week 3');
t(countLinesWith(srv, '/aprobar') === 16, 'censo /aprobar 16');
t(countLinesWith(app, '/aprobar') === 1, 'censo app /aprobar 1');
t(!srv.includes('autofetch') && !app.includes('autofetch'), 'autofetch 0');

// 11. Auditoría M78: funciones de los caminos tocados, definidas 1×.
function defCount(name) {
  const a = (app.match(new RegExp('function ' + name + '\\(', 'g')) || []).length;
  const b = (app.match(new RegExp('const ' + name + ' =', 'g')) || []).length;
  return a + b;
}
for (const fn of ['homeTileHTML', 'mxTiraHTML', 'mxHeroJardin', 'mxNvNum', 'pzIc']) {
  t(defCount(fn) === 1, 'M78 definida 1×: ' + fn);
}
// esc: 1 definición de nivel superior (línea 4, la que usa homeTileHTML) + 1 local
// preexistente dentro de renderVozPostCard, que no la afecta.
t((app.match(/^const esc = /gm) || []).length === 1, 'M78 definida 1× nivel superior: esc');

// 12. Pines de versión.
t(srv.includes('20261101-v526'), 'BUILD v522');
t(idx.includes('app.js?v=348'), 'index app.js?v=348');
t(idx.includes('styles.css?v=20261068'), 'index styles.css?v=20261068');
t(idxEn.includes('styles.css?v=20261068'), 'en/index styles.css?v=20261068');
t(!idxEn.includes('app.js?v='), 'en/index sin app.js (como siempre)');

console.log(`test-lote13: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
