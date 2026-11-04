// ZOOM-3 — test del lote. Sin navegador: verifica cableado por grep
// sobre el código real + simula la máquina de decisión del bloqueo
// touchstart con las constantes EXTRAÍDAS del propio app.js.
// Uso: node work/test-lotezoom3.js  (exit 0 = verde)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PUB = path.join(__dirname, 'public');
const app = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
const idxES = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(PUB, 'en', 'index.html'), 'utf8');
let ok = 0, bad = 0;
function t(name, cond, extra) {
  if (cond) { ok++; console.log('OK  ' + name); }
  else { bad++; console.log('FALLO ' + name + (extra ? ' :: ' + extra : '')); }
}
function count(s, re) { const m = s.match(re); return m ? m.length : 0; }

// ---------- 1. Constantes extraídas del código real ----------
const mWin = app.match(/now - pzZ3TapT < (\d+)/);
const mRad = app.match(/pzZ3TapX, dy = t\.clientY - pzZ3TapY;\s*if \(pzZ3TapT && now - pzZ3TapT < \d+ && \(dx \* dx \+ dy \* dy\) < (\d+)\)/);
const mStat = app.match(/\(dx \* dx \+ dy \* dy\) < (\d+)\) \{ pzZ3TapT = Date\.now/);
const WIN = mWin ? parseInt(mWin[1], 10) : NaN;
const RAD2 = mRad ? parseInt(mRad[1], 10) : NaN;
const STAT2 = mStat ? parseInt(mStat[1], 10) : NaN;
t('constante ventana touchstart = 500ms', WIN === 500, 'hallado=' + WIN);
t('constante radio touchstart = 3600px2 (60px)', RAD2 === 3600, 'hallado=' + RAD2);
t('constante estacionario = 144px2 (12px)', STAT2 === 144, 'hallado=' + STAT2);
t('v616 intacto: dedup touchend 350ms/1600px2', /now - lastTe < 350/.test(app) && /< 1600/.test(app));

// ---------- 2. Cableado ----------
t('pzZoomTapExcluded definida x1', count(app, /function pzZoomTapExcluded/g) === 1);
t('pzZoomTapExcluded llamada en touchstart y touchend', count(app, /pzZoomTapExcluded\(tg\)/g) === 2);
t('listener touchstart non-passive en el bloque zoom', /addEventListener\('touchstart', \(e\) => \{[\s\S]{0,1200}?pzZ3TapT/.test(app));
t('listener touchend ZOOM-3 presente', /pzZ3Single/.test(app));
t('sin stopPropagation en el bloque ZOOM-3', (() => {
  const i = app.indexOf('let pzZ3DownX');
  const j = app.indexOf('try { pzZoomBlockInit(); }');
  return i > 0 && j > i && !app.slice(i, j).includes('stopPropagation');
})());
t('v616 intacto: gesture*/dblclick preventDefault', /gesturestart/.test(app) && /gesturechange/.test(app) && /gestureend/.test(app) && /addEventListener\('dblclick'/.test(app));
t('v616 intacto: touchmove 2 dedos salvo F3', /touches\.length < 2/.test(app) && /pzZoomInF3\(e\.target\)/.test(app));
t('v616 intacto: guardia PZ_ZOOM_ON + init top-level', /PZ_ZOOM_ON/.test(app) && /try \{ pzZoomBlockInit\(\); \} catch/.test(app));
t('styles: .hf-tile pasa a manipulation x1', count(css, /\.hf-tile\{touch-action:manipulation\}/g) === 1);
t('styles: ya no queda .hf-tile pan-y', !/\.hf-tile\{touch-action:pan-y\}/.test(css));
t('styles: belt manipulation v616 intacto', /#inicioView,\.bb-bar,\.mz-tabs,\.mz-bottomstack\{touch-action:manipulation\}/.test(css));
t('styles: dock v615 intacto (5x flex:1)', /\.bb-bar \.bb-tab\{flex:1;min-width:0\}/.test(css));
t('styles: F3 intacto (pan-y en imgs, pan-x en track)', /\.apv-media img,\.igmock-media img\{touch-action:pan-y/.test(css) && /\.igmock-media-car \.hf-d-track\{touch-action:pan-x/.test(css));
t('meta viewport v615 intacto en ambos index', /maximum-scale=1, user-scalable=no/.test(idxES) && /maximum-scale=1, user-scalable=no/.test(idxEN));
t('F3 doble toque intacto (pointerup 320/42)', /function f3OnPointerUp/.test(app) && /< 320/.test(app) && /< 42/.test(app));
t('gestos tiles intactos (hold/peek/arrastre pointer)', /function hfFeedGesturesBind/.test(app) && /hfDragStart/.test(app));
t('pull intacto (guardas v524)', /function pzPullCanStart/.test(app) && /function pzPullIsFormControl/.test(app));
t('parte Z intacta (pzBlurActivo)', /function pzBlurActivo/.test(app));
t('CHUNK_V presente (lo bumpea el liberador solo si cambia un chunk; este lote no los toca)', /CHUNK_V/.test(app));
t('sin data/ en el árbol de trabajo', !fs.existsSync(path.join(__dirname, 'data')));
try { execSync('node --check ' + JSON.stringify(path.join(PUB, 'app.js')), { stdio: 'pipe' }); t('node --check app.js', true); }
catch (e) { t('node --check app.js', false, String(e.message).slice(0, 200)); }

// ---------- 3. Simulación de la máquina de decisión ----------
// Espejo fiel del código: touchstart decide, touchend registra solo
// toques estacionarios no excluidos; un toque bloqueado no registra.
const EXCL = new Set(['input', 'button', 'a', 'f3', 'dock']);
function sim(events) {
  let down = null, tap = null; // tap: {t,x,y}
  const out = [];
  for (const ev of events) {
    if (ev.k === 'start') {
      if (ev.n !== 1) { down = null; out.push('pass'); continue; }
      down = { x: ev.x, y: ev.y, blocked: false };
      if (EXCL.has(ev.tg)) { tap = null; out.push('pass'); continue; }
      const dx = ev.x - (tap ? tap.x : 0), dy = ev.y - (tap ? tap.y : 0);
      if (tap && ev.t - tap.t < WIN && dx * dx + dy * dy < RAD2) {
        down.blocked = true; tap = null; out.push('BLOCKED');
      } else out.push('pass');
    } else if (ev.k === 'end') {
      if (!down || down.blocked) { down = null; out.push('pass'); continue; }
      if (ev.n !== 0 || ev.c !== 1) { out.push('pass'); continue; }
      if (EXCL.has(ev.tg)) { tap = null; down = null; out.push('pass'); continue; }
      const dx = ev.x - down.x, dy = ev.y - down.y;
      if (dx * dx + dy * dy < STAT2) tap = { t: ev.t, x: ev.x, y: ev.y };
      else tap = null;
      down = null; out.push('pass');
    } else if (ev.k === 'move') {
      // un arrastre: el touchend posterior medirá el desplazamiento
      out.push('pass');
    }
  }
  return out;
}
function seq(name, events, want) {
  const got = sim(events);
  t(name, JSON.stringify(got) === JSON.stringify(want), 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
}
const tapTile = (t0, x, y) => [{ k: 'start', n: 1, t: t0, x, y, tg: 'tile' }, { k: 'end', n: 0, c: 1, t: t0 + 80, x, y, tg: 'tile' }];
seq('toque simple en tile pasa y se registra', tapTile(1000, 200, 300), ['pass', 'pass']);
seq('doble toque estático en tile: 2º BLOQUEADO (mata el zoom)',
  [...tapTile(1000, 200, 300), ...tapTile(1200, 210, 305)], ['pass', 'pass', 'BLOCKED', 'pass']);
seq('segundo toque a 600ms pasa (fuera de ventana)',
  [...tapTile(1000, 200, 300), ...tapTile(1600, 205, 305)], ['pass', 'pass', 'pass', 'pass']);
seq('segundo toque a 100px pasa (otra zona)',
  [...tapTile(1000, 200, 300), ...tapTile(1200, 300, 300)], ['pass', 'pass', 'pass', 'pass']);
seq('arrastre que arranca dentro de la ventana de un tap: su touchstart se bloquea (costo conocido: un toque muerto; el siguiente pasa)',
  [...tapTile(1000, 200, 300),
   { k: 'start', n: 1, t: 1200, x: 200, y: 300, tg: 'tile' }, { k: 'move' },
   { k: 'end', n: 0, c: 1, t: 1400, x: 200, y: 360, tg: 'tile' },
   ...tapTile(1500, 205, 305)], ['pass', 'pass', 'BLOCKED', 'pass', 'pass', 'pass', 'pass']);
seq('arrastre sin tap previo no se bloquea (el scroll normal nunca se toca)',
  [{ k: 'start', n: 1, t: 1000, x: 200, y: 300, tg: 'tile' }, { k: 'move' },
   { k: 'end', n: 0, c: 1, t: 1200, x: 200, y: 360, tg: 'tile' },
   ...tapTile(1300, 205, 305)], ['pass', 'pass', 'pass', 'pass', 'pass']);
seq('tap, arrastre fuera de ventana (no registra), tap rápido: pasa',
  [...tapTile(1000, 200, 300),
   { k: 'start', n: 1, t: 2000, x: 200, y: 300, tg: 'tile' }, { k: 'move' },
   { k: 'end', n: 0, c: 1, t: 2200, x: 200, y: 360, tg: 'tile' },
   ...tapTile(2300, 205, 305)], ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
seq('toque en botón pasa y rompe la pareja',
  [...tapTile(1000, 200, 300),
   { k: 'start', n: 1, t: 1200, x: 210, y: 305, tg: 'button' }, { k: 'end', n: 0, c: 1, t: 1280, x: 210, y: 305, tg: 'button' },
   ...tapTile(1400, 205, 305)], ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
seq('toques en F3 pasan siempre (doble toque F3 intacto)',
  [...tapTile(1000, 200, 300).map(e => ({ ...e, tg: 'f3' })),
   ...tapTile(1200, 205, 305).map(e => ({ ...e, tg: 'f3' }))], ['pass', 'pass', 'pass', 'pass']);
seq('toque en dock pasa y rompe la pareja',
  [...tapTile(1000, 200, 300),
   { k: 'start', n: 1, t: 1200, x: 210, y: 305, tg: 'dock' }, { k: 'end', n: 0, c: 1, t: 1280, x: 210, y: 305, tg: 'dock' },
   ...tapTile(1400, 205, 305)], ['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
seq('toque bloqueado no registra: el 3º pasa',
  [...tapTile(1000, 200, 300), ...tapTile(1200, 210, 305), ...tapTile(1400, 205, 305)],
  ['pass', 'pass', 'BLOCKED', 'pass', 'pass', 'pass']);
seq('inicio multi-dedo no bloquea ni registra',
  [...tapTile(1000, 200, 300),
   { k: 'start', n: 2, t: 1200, x: 210, y: 305, tg: 'tile' }, { k: 'end', n: 0, c: 1, t: 1300, x: 210, y: 305, tg: 'tile' }],
  ['pass', 'pass', 'pass', 'pass']);
seq('tiles vecinas (130px) pasan aunque sean rápidas',
  [...tapTile(1000, 200, 300), ...tapTile(1200, 330, 300)], ['pass', 'pass', 'pass', 'pass']);
seq('martilleo en la misma zona: se come uno de cada dos',
  [...tapTile(1000, 200, 300), ...tapTile(1200, 205, 305), ...tapTile(1400, 205, 305), ...tapTile(1600, 205, 305)],
  ['pass', 'pass', 'BLOCKED', 'pass', 'pass', 'pass', 'BLOCKED', 'pass']);
seq('parada brusca real: tap para frenar + rearranque rápido BLOQUEADO',
  [{ k: 'start', n: 1, t: 5000, x: 180, y: 400, tg: 'tile' }, { k: 'end', n: 0, c: 1, t: 5080, x: 180, y: 400, tg: 'tile' },
   { k: 'start', n: 1, t: 5400, x: 195, y: 415, tg: 'tile' }, { k: 'end', n: 0, c: 1, t: 5600, x: 195, y: 500, tg: 'tile' }],
  ['pass', 'pass', 'BLOCKED', 'pass']);

console.log(`\n${ok} OK, ${bad} FALLOS`);
process.exit(bad ? 1 : 0);
