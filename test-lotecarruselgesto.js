// test-lotecarruselgesto.js — LOTE CARRUSEL GESTO PROPIO (reporte Valentino 2/11 04:32)
// Uso: node test-lotecarruselgesto.js [dir]  (dir = raíz del árbol; default: __dirname)
// En iOS TODAVÍA no se desliza para ver la 2da foto, pese a v538 en vivo
// (pan-x + puntitos). El paso previsto en el propio lote v538 era este:
// un handler de gesto propio sobre el track, NO otro cambio de CSS.
// Mecanismo: el track vive dentro de una tarjeta que scrollea en vertical
// (.scf-pop .igmock en la capa, .hf-dback en el detalle, scroll de página
// en la aprobación) y la desambiguación del gesto la sigue ganando el
// vertical en WKWebView. El handler decide la dirección en los primeros
// píxeles: horizontal que domina -> toma el gesto (preventDefault en
// touchmove, scrollLeft manual, snap al soltar); vertical que domina ->
// NO interviene y la tarjeta scrollea como siempre. Sin cambios de CSS.
// Alcance: delegado global sobre .hf-d-track (tarjeta, detalle y
// aprobación, mismo patrón, sin tocar sus cableados). Tap sin arrastre
// = click normal (abre el lightbox); tras un arrastre, el click que
// sigue se suprime. Desktop intacto: solo eventos táctiles.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');

console.log('— 1. Fix: handler de gesto propio sobre .hf-d-track —');
ok(app.includes('(LOTE CARRUSEL GESTO PROPIO'), 'bloque del lote presente en app.js');
ok(app.includes('function pzCarGestDecide(dx, dy)'), 'helper pzCarGestDecide presente');
ok(app.includes('function pzCarGestSnap(scrollLeft, width, count, reduced)'), 'helper pzCarGestSnap presente');
ok(app.includes('function pzCarGestFinish(doSnap)'), 'helper pzCarGestFinish presente');
ok(app.includes("e.target.closest('.hf-d-track')"), 'touchstart delegado sobre .hf-d-track');
ok(app.includes('g.track.scrollLeft = g.sl0 - dx'), 'arrastre mueve el track con scrollLeft manual');
ok(app.includes("t.scrollTo(s)"), 'al soltar hace snap con scrollTo');
ok(app.includes('stopPropagation') && app.includes('g.sup.track.contains'), 'click tras arrastre se suprime (capture)');
ok(app.includes("typeof pzReducedMotion === 'function' && pzReducedMotion()"), 'snap respeta reduced-motion');

console.log('— 2. Intacto: v538 + syncs + CSS sin tocar —');
ok(app.includes('LOTE CARRUSEL-DETALLE') && app.includes("track.scrollTo({ left: k * Math.max(1, track.clientWidth), behavior: 'smooth' })"), 'puntitos v538 intactos');
ok(app.includes("classList.contains('hf-d-track')") && app.includes("t.closest('.igmock')"), 'sync por scroll de la tarjeta intacto');
ok(app.includes("ov.querySelectorAll('.hf-d-dots i')") && app.includes("q('.hf-d-track')"), 'detalle conserva su sync propio');
ok(app.includes("document.querySelector('.apv-media .hf-d-track')"), 'aprobación conserva su sync propio');
ok(css.includes('.igmock-media-car .hf-d-track{touch-action:pan-x;overscroll-behavior-x:contain}'), 'pan-x v538 intacto en CSS');
ok(!css.includes('touch-action:none'), 'ningún touch-action:none nuevo en CSS (el gesto lo toma el handler, no un CSS)');

console.log('— 3. Simulación de gestos con el código real (vm) —');
const a = app.indexOf('// (LOTE CARRUSEL GESTO PROPIO');
const b = app.indexOf('/* ===== (Tanda feed 6B', a);
const block = (a >= 0 && b > a) ? app.slice(a, b) : '';
ok(!!block, 'bloque extraíble para vm');
if (block) {
  // Track falso con clamp realista (scrollWidth 1690, ancho 338, máx 1352).
  function mkTrack() {
    let sl = 0;
    const t = { clientWidth: 338, scrollWidth: 1690, children: { length: 5 }, _beh: null };
    Object.defineProperty(t, 'scrollLeft', { get() { return sl; }, set(v) { sl = Math.min(1352, Math.max(0, v)); } });
    t.scrollTo = (s) => { t.scrollLeft = s.left; t._beh = s.behavior; };
    t.contains = (el) => el === t || (el && el._track === t);
    return t;
  }
  function mkTarget(track) { return { _track: track || null, closest(sel) { return (sel === '.hf-d-track' && track) ? track : null; } }; }
  function mkEv(target, x, y, id) {
    const touch = { identifier: id || 7, clientX: x, clientY: y };
    return { target, touches: [touch], changedTouches: [touch],
      _pd: false, _sp: false,
      preventDefault() { this._pd = true; }, stopPropagation() { this._sp = true; } };
  }
  const handlers = {};
  const fakeDoc = { addEventListener(type, fn, opts) { (handlers[type] = handlers[type] || []).push({ fn, opts }); } };
  const ctx = { console, document: fakeDoc, reducedFlag: false, pzReducedMotion() { return ctx.reducedFlag; } };
  vm.createContext(ctx);
  vm.runInContext(block, ctx);
  const ts = handlers.touchstart[0].fn, tm = handlers.touchmove[0].fn, te = handlers.touchend[0].fn;
  const ck = handlers.click.find((h) => h.opts === true).fn;
  ok(!!ts && !!tm && !!te && !!ck, 'listeners touchstart/touchmove/touchend/click-capture registrados');
  ok(block.includes("addEventListener('touchmove'") && block.includes("{ passive: false }"), 'touchmove del bloque registrado NO pasivo');
  ok(handlers.touchmove[0].opts && handlers.touchmove[0].opts.passive === false, 'touchmove registrado NO pasivo');
  ok(handlers.touchstart[0].opts && handlers.touchstart[0].opts.passive === true, 'touchstart registrado pasivo');
  // a. Swipe horizontal -> avanza y hace snap al slide siguiente.
  let track = mkTrack();
  ts(mkEv(mkTarget(track), 300, 200));
  const m1 = mkEv(mkTarget(track), 100, 205); tm(m1);
  ok(m1._pd === true && track.scrollLeft === 200, 'horizontal: preventDefault + scrollLeft sigue al dedo (200)');
  const m2 = mkEv(mkTarget(track), 60, 206); tm(m2);
  ok(track.scrollLeft === 240, 'horizontal: sigue moviendo (240)');
  te(mkEv(mkTarget(track), 60, 206));
  ok(track.scrollLeft === 338 && track._beh === 'smooth', 'al soltar: snap al slide 2 (338, smooth)');
  // b. Click tras arrastre se suprime (no abre la foto por accidente).
  const ckEv = mkEv(mkTarget(track), 60, 206); ck(ckEv);
  ok(ckEv._pd === true && ckEv._sp === true, 'click tras arrastre suprimido');
  // c. Click en un puntito tras arrastre NO se suprime (no vive en el track).
  track = mkTrack();
  ts(mkEv(mkTarget(track), 300, 200));
  tm(mkEv(mkTarget(track), 100, 205)); te(mkEv(mkTarget(track), 100, 205));
  const dotEv = mkEv({ closest() { return null; } }, 100, 205); ck(dotEv);
  ok(dotEv._pd === false && dotEv._sp === false, 'click en puntito tras arrastre NO suprimido');
  // d. Movimiento vertical -> NO interviene, la tarjeta scrollea.
  track = mkTrack();
  ts(mkEv(mkTarget(track), 100, 200));
  const mv = mkEv(mkTarget(track), 105, 300); tm(mv);
  ok(mv._pd === false && track.scrollLeft === 0, 'vertical: sin preventDefault, track quieto');
  te(mkEv(mkTarget(track), 105, 300));
  ok(track.scrollLeft === 0 && track._beh === null, 'vertical: al soltar no hay snap');
  // e. Tap sin arrastre -> click normal (abre el lightbox).
  track = mkTrack();
  ts(mkEv(mkTarget(track), 100, 200));
  te(mkEv(mkTarget(track), 100, 200));
  const tapEv = mkEv(mkTarget(track), 100, 200); ck(tapEv);
  ok(tapEv._pd === false && tapEv._sp === false, 'tap: click normal, no suprimido');
  // f. Reduced-motion: snap instantáneo.
  ctx.reducedFlag = true;
  track = mkTrack();
  ts(mkEv(mkTarget(track), 300, 200));
  tm(mkEv(mkTarget(track), 100, 205)); te(mkEv(mkTarget(track), 100, 205));
  ok(track.scrollLeft === 338 && track._beh === 'auto', 'reduced-motion: snap instantáneo (auto)');
  ctx.reducedFlag = false;
  // g. Multitouch: se ignora (no toma el gesto).
  track = mkTrack();
  const two = mkEv(mkTarget(track), 300, 200); two.touches.push({ identifier: 8, clientX: 310, clientY: 210 });
  ts(two);
  const mm = mkEv(mkTarget(track), 100, 205); tm(mm);
  ok(mm._pd === false && track.scrollLeft === 0, 'multitouch: gesto ignorado');
  // h. Helpers puros.
  const D = ctx.pzCarGestDecide, S = ctx.pzCarGestSnap;
  ok(D(11, 5) === 1 && D(-40, 5) === 1, 'decide: horizontal domina -> 1');
  ok(D(5, 11) === 2 && D(11, 11) === 2, 'decide: vertical domina o empata -> 2 (la tarjeta sigue scrolleando)');
  ok(D(5, 5) === 0, 'decide: movimiento chico -> 0 (todavía no decide)');
  ok(S(200, 338, 5, false).left === 338 && S(200, 338, 5, false).behavior === 'smooth', 'snap: 200 -> 338 smooth');
  ok(S(90, 338, 5, false).left === 0, 'snap: 90 -> 0');
  ok(S(2000, 338, 5, false).left === 1352, 'snap: fuera de rango -> último slide (1352)');
  ok(S(200, 338, 5, true).behavior === 'auto', 'snap: reduced -> auto');
} else {
  ok(false, 'simulación imposible sin el bloque (control negativo esperado)');
}

console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
