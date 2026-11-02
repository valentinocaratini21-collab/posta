// test-lotecarruselflechas.js — LOTE CARRUSEL-FLECHAS (reporte Valentino 2/11 ~06:43)
// Tras v543 (gesto propio), deslizar en iOS a veces agarra y a veces no.
// Propuesta aprobada de Valentino: flechitas ‹ › de los dos lados; al
// tocarlas, pasa a la siguiente/anterior imagen.
// Fix: flechas superpuestas en los 3 carruseles .hf-d-track (capa, detalle,
// aprobación); tap avanza/retrocede un slide; puntitos y contador se
// sincronizan solos por los syncs por scroll existentes; sin loop en los
// extremos (la flecha del extremo se esconde); el tap no abre el lightbox;
// swipe, puntitos y gesto propio v543 intactos.
// Uso: node test-lotecarruselflechas.js [dir]  (dir = raíz del árbol; default: __dirname)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const lineWith = (s, a, b) => s.split('\n').some((ln) => ln.includes(a) && (!b || ln.includes(b)));

console.log('— 1. Estáticas: flechas en los 3 carruseles —');
ok(app.includes('LOTE CARRUSEL-FLECHAS'), 'marca del lote en app.js');
ok(css.includes('LOTE CARRUSEL-FLECHAS'), 'marca del lote en styles.css');
ok(app.includes('const carArrowsHTML'), 'capa: const carArrowsHTML');
ok(app.includes('${carTrackHTML}${carArrowsHTML}${carCountHTML}'), 'capa: flechas dentro de .igmock-media-car, tras el track');
ok(lineWith(app, '1/${slides.length}', 'hf-d-arrow'), 'detalle: flechas entre track y contador');
ok(lineWith(app, '1/${apvSlides.length}', 'hf-d-arrow'), 'aprobación: flechas entre track y contador');
ok(app.includes('data-hf-car-arrow="-1"') && app.includes('data-hf-car-arrow="1"'), 'ambos sentidos con data-hf-car-arrow');
ok(app.includes('hf-d-arrow-prev') && app.includes('hf-d-arrow-next'), 'clases prev/next');
ok(/hf-d-arrow-prev"[^>]*hidden>‹/.test(app), 'prev nace escondida (primer slide)');
ok(/hf-d-arrow-next"[^>]*>›/.test(app), 'next nace visible');
ok(app.includes("Foto anterior") && app.includes("Foto siguiente") && app.includes("Previous photo") && app.includes("Next photo"), 'aria-labels ES/EN');
ok(app.includes("closest('[data-hf-car-arrow]')"), 'handler delegado sobre las flechas');
ok(app.includes('pzCarArrowStep(track, dir)'), 'tap llama al paso');
ok(app.includes('e.preventDefault();') && app.includes('e.stopPropagation();'), 'tap no propaga (no abre lightbox)');
ok(app.includes('pzCarArrowSync(t);') && app.includes('pzCarArrowSync(track);') && app.includes('pzCarArrowSync(apvTrack);'), 'sync en los 3 scroll handlers');

console.log('— 2. CSS: visibles sobre foto clara y oscura, toque cómodo —');
ok(/\.hf-d-arrow\{[^}]*position:absolute;top:50%;transform:translateY\(-50%\)/.test(css), 'flecha centrada vertical sobre el track');
ok(/\.hf-d-arrow\{[^}]*width:36px;height:36px/.test(css), 'zona de toque 36px');
ok(/\.hf-d-arrow\{[^}]*background:rgba\(255,255,255,\.94\)/.test(css), 'círculo blanco opaco (se ve en foto clara y oscura)');
ok(/\.hf-d-arrow-prev\{left:8px\}/.test(css), 'prev a la izquierda');
ok(/\.hf-d-arrow-next\{right:8px\}/.test(css), 'next a la derecha');
ok(/\.hf-d-arrow\[hidden\]\{display:none\}/.test(css), 'hidden esconde la flecha del extremo');

console.log('— 3. Intacto: gesto, puntitos, swipe, censo, server —');
ok(app.includes('function pzCarGestDecide') && app.includes('function pzCarGestSnap') && app.includes('function pzCarGestFinish'), 'gesto propio v543 intacto');
ok(app.includes("closest('.hf-d-dots i')"), 'puntitos clicables intactos');
ok(css.includes('.igmock-media-car .hf-d-track{touch-action:pan-x'), 'pan-x v538 intacto');
ok(!srv.includes('LOTE CARRUSEL-FLECHAS'), 'server.js sin tocar');
ok(cnt(srv, 'catsMatch') === 3 && cnt(srv, 'week-redo') === 16 && cnt(srv, 'first_week') === 3 && cnt(srv, '/' + 'aprobar') === 16, 'censo server 3/16/3/16');
ok(cnt(app, 'pzGoBack') === 4 && cnt(app, 'pz-detalle-setup') === 1 && cnt(app, '/' + 'aprobar') === 1 && cnt(app, 'autofetch') === 0 && cnt(app, 'pcDayKeyShift') === 7, 'censo app 4/1/1/0/7');
ok(!/\.hf-d-arrow[^}]*top:6px/.test(css), 'las flechas no pisan la posición del corazón');

console.log('— 4. vm: funciones puras + sync + paso —');
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
{
  const sb = { console };
  vm.createContext(sb);
  for (const n of ['pzCarArrowIdx', 'pzCarArrowTarget', 'pzCarArrowHidden', 'pzCarArrowSync', 'pzCarArrowStep']) {
    const code = extractFn(app, n);
    ok(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  const run = (expr) => vm.runInContext(expr, sb);
  ok(run('pzCarArrowIdx(0, 390)') === 0, 'idx: scroll 0 -> 0');
  ok(run('pzCarArrowIdx(400, 390)') === 1, 'idx: scroll 400 -> 1');
  ok(run('pzCarArrowIdx(780, 390)') === 2, 'idx: scroll 780 -> 2');
  ok(run('pzCarArrowIdx(0, 0)') === 0, 'idx: ancho 0 no rompe');
  ok(run('pzCarArrowTarget(0, 5, 1)') === 1, 'target: 0 +1 -> 1');
  ok(run('pzCarArrowTarget(4, 5, 1)') === 4, 'target: último +1 se queda (sin loop)');
  ok(run('pzCarArrowTarget(0, 5, -1)') === 0, 'target: primero -1 se queda (sin loop)');
  ok(run('pzCarArrowTarget(2, 5, -1)') === 1, 'target: 2 -1 -> 1');
  const h0 = run('pzCarArrowHidden(0, 5)');
  ok(h0.prev === true && h0.next === false, 'hidden: primero esconde prev');
  const h4 = run('pzCarArrowHidden(4, 5)');
  ok(h4.prev === false && h4.next === true, 'hidden: último esconde next');
  const h2 = run('pzCarArrowHidden(2, 5)');
  ok(h2.prev === false && h2.next === false, 'hidden: medio muestra ambas');
  const h1 = run('pzCarArrowHidden(0, 1)');
  ok(h1.prev === true && h1.next === true, 'hidden: un solo slide esconde ambas');

  // Sync + paso con track falso (sin DOM real).
  sb.mkTrack = (scrollLeft, n) => {
    const prev = { hidden: false, getAttribute: () => '-1' };
    const next = { hidden: false, getAttribute: () => '1' };
    const calls = [];
    const track = {
      scrollLeft, clientWidth: 390, children: new Array(n),
      parentElement: { querySelectorAll: () => [prev, next] },
      scrollTo: (o) => { calls.push(o); track.scrollLeft = o.left; },
    };
    return { track, prev, next, calls };
  };
  sb.pzReducedMotion = () => false;
  sb.t0 = run('mkTrack(0, 5)');
  run('pzCarArrowSync(t0.track)');
  ok(sb.t0.prev.hidden === true && sb.t0.next.hidden === false, 'sync: en 0, prev escondida');
  sb.t2 = run('mkTrack(800, 5)');
  run('pzCarArrowSync(t2.track)');
  ok(sb.t2.prev.hidden === false && sb.t2.next.hidden === false, 'sync: en medio, ambas visibles');
  sb.t4 = run('mkTrack(1600, 5)');
  run('pzCarArrowSync(t4.track)');
  ok(sb.t4.prev.hidden === false && sb.t4.next.hidden === true, 'sync: en último, next escondida');
  sb.t1 = run('mkTrack(0, 1)');
  run('pzCarArrowSync(t1.track)');
  ok(sb.t1.prev.hidden === false && sb.t1.next.hidden === false, 'sync: un slide no toca nada (guarda)');
  sb.s1 = run('mkTrack(0, 5)');
  ok(run('pzCarArrowStep(s1.track, 1)') === 1, 'paso: 0 +1 -> 1');
  ok(sb.s1.calls.length === 1 && sb.s1.calls[0].left === 390 && sb.s1.calls[0].behavior === 'smooth', 'paso: scroll suave al slide 1');
  ok(sb.s1.prev.hidden === false && sb.s1.next.hidden === false, 'paso: tras avanzar, ambas visibles');
  ok(run('pzCarArrowStep(s1.track, -1)') === 0, 'paso: 1 -1 -> 0');
  ok(sb.s1.prev.hidden === true, 'paso: al volver al 0, prev se esconde');
  sb.s4 = run('mkTrack(1600, 5)');
  ok(run('pzCarArrowStep(s4.track, 1)') === 4 && sb.s4.calls[0].left === 1560, 'paso: en último, +1 se queda');
  sb.pzReducedMotion = () => true;
  sb.sr = run('mkTrack(0, 5)');
  run('pzCarArrowStep(sr.track, 1)');
  ok(sb.sr.calls[0].behavior === 'auto', 'paso: reduced-motion salta instantáneo, no smooth');
  sb.s0 = run('mkTrack(0, 1)');
  ok(run('pzCarArrowStep(s0.track, 1)') === -1 && sb.s0.calls.length === 0, 'paso: un slide no scrollea');
}

console.log('— 5. vm: la const de la capa evalúa en ES y EN —');
{
  const start = app.indexOf('const carArrowsHTML');
  const open = app.indexOf('`', start);
  const close = open >= 0 ? app.indexOf('`', open + 1) : -1;
  ok(start >= 0 && open > start && close > open, 'const carArrowsHTML extraíble');
  if (start >= 0 && close > open) {
    const code = app.slice(start, close + 1).replace('const carArrowsHTML =', 'globalThis.carArrowsHTML =') + " : '';"
    const sbEs = { isCar: true, enW: false };
    vm.createContext(sbEs);
    vm.runInContext(code, sbEs);
    ok(String(sbEs.carArrowsHTML).includes('Foto anterior') && String(sbEs.carArrowsHTML).includes('Foto siguiente'), 'ES: Foto anterior/siguiente');
    ok(String(sbEs.carArrowsHTML).includes('hidden>‹'), 'ES: prev con hidden');
    const sbEn = { isCar: true, enW: true };
    vm.createContext(sbEn);
    vm.runInContext(code, sbEn);
    ok(String(sbEn.carArrowsHTML).includes('Previous photo') && String(sbEn.carArrowsHTML).includes('Next photo'), 'EN: Previous/Next photo');
    const sbNo = { isCar: false, enW: false };
    vm.createContext(sbNo);
    vm.runInContext(code, sbNo);
    ok(sbNo.carArrowsHTML === '', 'sin carrusel: sin flechas');
  }
}

console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
