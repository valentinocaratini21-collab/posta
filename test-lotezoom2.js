// LOTE ZOOM-2 — bloqueo JS del zoom de viewport (doble toque + pellizco).
// Lee el código servible real (work/public/*) y verifica cableado,
// constantes y preservación. No prueba un gesto vivo en WKWebView:
// el veredicto final es el físico en el iPhone de Valentino.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, 'public');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(ROOT, 'en', 'index.html'), 'utf8');
let ok = 0, bad = 0;
function t(name, cond, extra) {
  if (cond) { ok++; console.log('OK  ' + name); }
  else { bad++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function count(s, sub) { return s.split(sub).length - 1; }
// Región del bloque nuevo (entre el encabezado ZOOM-2 y su invocación).
const b0 = app.indexOf('ZOOM-2: bloquear el zoom de viewport');
const b1 = app.indexOf('try { pzZoomBlockInit(); }');
const blk = (b0 >= 0 && b1 > b0) ? app.slice(b0, b1) : '';

// A. v615 no se quita: meta en ambos index.
t('meta ES intacto (maximum-scale=1 + user-scalable=no)',
  idx.includes('maximum-scale=1') && idx.includes('user-scalable=no'));
t('meta EN intacto (maximum-scale=1 + user-scalable=no)',
  idxEn.includes('maximum-scale=1') && idxEn.includes('user-scalable=no'));

// B. Bloque nuevo: definición, helper, invocación, idempotencia.
t('pzZoomBlockInit definida ×1', count(app, 'function pzZoomBlockInit()') === 1);
t('pzZoomInF3 definida ×1', count(app, 'function pzZoomInF3(') === 1);
t('invocación top-level ×1', count(app, 'try { pzZoomBlockInit(); }') === 1);
t('guardia de idempotencia PZ_ZOOM_ON', blk.includes('if (PZ_ZOOM_ON) return;'));

// C. Los 6 listeners, todos non-passive y con preventDefault.
// Conteo a nivel document (verificado por grep): touchmove ×3
// (zoom-2 + carrusel 21786 + swipe post-chat 23333, los dos últimos
// passive:true y de un dedo); touchend ×3 (zoom-2 + fin carrusel
// 21815 + fin swipe post-chat 23350); gesture* y dblclick ×1 (zoom-2).
const DOC_COUNT = { gesturestart: 1, gesturechange: 1, gestureend: 1, dblclick: 1, touchend: 3, touchmove: 3 };
for (const ev of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'touchend', 'touchmove']) {
  const needle = "document.addEventListener('" + ev + "'";
  t('listener ' + ev + ' non-passive con preventDefault',
    blk.includes(needle) && blk.includes('preventDefault'));
  t('listener ' + ev + ' document ×' + DOC_COUNT[ev] + ' en todo app.js',
    count(app, needle) === DOC_COUNT[ev], 'n=' + count(app, needle));
}
t('touchmove listener declara passive:false',
  /addEventListener\('touchmove'[\s\S]{0,400}?passive: false/.test(blk));
t('touchend listener declara passive:false',
  /addEventListener\('touchend'[\s\S]{0,900}?passive: false/.test(blk));

// D. Constantes del guard parseadas del código real + tabla de decisión.
const mMs = blk.match(/now - lastTe < (\d+)/);
const mPx = blk.match(/dx \* dx \+ dy \* dy\) < (\d+)/);
t('ventana de doble toque parseada (350ms)', !!mMs && mMs[1] === '350', mMs && mMs[1]);
t('radio de doble toque parseado (1600 = 40px²)', !!mPx && mPx[1] === '1600', mPx && mPx[1]);
const WIN = mMs ? +mMs[1] : 0, RAD2 = mPx ? +mPx[1] : 0;
function dedup(dt, dx, dy) { return dt < WIN && (dx * dx + dy * dy) < RAD2; }
t('decisión: 2º toque 200ms/10px → bloqueado', dedup(200, 10, 0) === true);
t('decisión: 2º toque 400ms/10px → libre', dedup(400, 10, 0) === false);
t('decisión: 2º toque 200ms/100px → libre', dedup(200, 100, 0) === false);
t('decisión: 2º toque justo en 350ms → libre (estricto)', dedup(350, 0, 0) === false);
t('decisión: 2º toque justo en 40px → libre (estricto)', dedup(100, 40, 0) === false);
// touchmove dos dedos: bloquea fuera de F3, nunca dentro, nunca con 1 dedo.
t('touchmove: guarda touches<2', blk.includes('e.touches.length < 2'));
t('touchmove: exclusión F3 vía pzZoomInF3', blk.includes('if (pzZoomInF3(e.target)) return;'));
t('pzZoomInF3 cubre .apv-media y .igmock-media',
  blk.includes("'.apv-media, .igmock-media'"));

// E. El guard no rompe handlers propios: ninguna llamada stopPropagation
// dentro del bloque (el comentario que la nombra no cuenta: sin paréntesis).
t('sin llamada stopPropagation() en el bloque nuevo', !blk.includes('stopPropagation('));
// F. Inputs fuera del dedup de touchend (parte Z intacta por otro lado).
t('touchend excluye input/textarea/select/contenteditable',
  blk.includes("closest('input, textarea, select, [contenteditable=\"true\"]')"));
t('touchend solo con touches.length===0 (último dedo levantado)',
  blk.includes('e.touches.length !== 0'));

// G. F3 preservado: doble toque por pointerup + pinch por PointerEvents.
t('F3 doble toque (f3OnPointerUp) presente', app.includes('function f3OnPointerUp('));
t('F3 pinch (f3PinchImg + F3_PINCH) presente',
  app.includes('function f3PinchImg(') && app.includes('F3_PINCH'));
t('F3 CSS pan-y intacto (.apv-media img, .igmock-media img)',
  css.includes('.apv-media img,.igmock-media img{touch-action:pan-y'));

// H. Pull-to-refresh preservado (single finger, passive).
t('pull pzPullInit presente', app.includes('function pzPullInit()'));
t('pull touchend sigue passive:true',
  /window\.addEventListener\('touchend', pzPullEnd, \{ passive: true \}\)/.test(app));

// I. Carrusel preservado (single finger).
t('carrusel PZ_CAR_GEST presente', app.includes('PZ_CAR_GEST'));
t('carrusel exige 1 dedo en touchstart',
  app.includes("if (!e.touches || e.touches.length !== 1) return;"));

// J. Parte Z preservada (sin zoom al enfocar).
t('pzBlurActivo definida y llamada', app.includes('function pzBlurActivo()') && app.includes('pzBlurActivo();'));

// K. Dock v615 preservado (5 columnas flex:1).
t('dock v615 intacto (.bb-bar .bb-tab flex:1)',
  css.includes('.bb-bar .bb-tab{flex:1;min-width:0}'));

// L. Cinturón v615 pasa a manipulation (doble-toque-zoom no).
t('cinturón belt en manipulation',
  css.includes('#inicioView,.bb-bar,.mz-tabs,.mz-bottomstack{touch-action:manipulation}'));
t('cinturón viejo pan-x pan-y ya no está en la regla belt',
  !css.includes('#inicioView,.bb-bar,.mz-tabs,.mz-bottomstack{touch-action:pan-x pan-y}'));

console.log('\nZOOM-2: ' + ok + ' OK, ' + bad + ' FAIL');
process.exit(bad ? 1 : 0);
