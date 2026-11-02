// test-lotecarruseldetalle.js — LOTE CARRUSEL-DETALLE (reporte Valentino 2/11 00:21)
// Uso: node test-lotecarruseldetalle.js [dir]  (dir = raíz del árbol; default: __dirname)
// En la capa .scf-pop (la tarjeta grande weekCardHTML ampliada sobre una
// tile), el carrusel dibujaba puntitos y contador 1/5 pero deslizar en
// horizontal NO avanzaba a la 2da foto.
// Diagnóstico verificado (ver STATUS.md): la superficie ES weekCardHTML
// en .scf-pop (5 marcadores: when-top con fecha+Aceptar+recorte, chip
// Borrador, contador 1/5, fila de íconos IG, botón Publicar ahora). El
// track, su geometría y su touch-action eran correctos en papel y el
// swipe táctil SÍ mueve el track en Chromium (scrollLeft 0→338 = un
// slide exacto): el fallo es específico de iOS/WKWebView, donde el
// track vive DENTRO de la tarjeta que scrollea en vertical y con
// pan-x pan-y el navegador tiene que adivinar la dirección del gesto.
// Fix: pan-x SOLO en track e imgs de la tarjeta (el horizontal va al
// track sin ambigüedad; el vertical sigue a la tarjeta) + tocar un
// puntito avanza a ese slide (los puntitos no tenían ningún handler).
// Alcance: solo app.js + styles.css de la tarjeta; detalle y aprobación
// conservan su cableado propio y no se tocan.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
function extractFn(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  const b = src.indexOf('\nfunction ', a + 10);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}
function extractConstObj(src, sig) {
  const a = src.indexOf(sig);
  if (a < 0) return '';
  let i = src.indexOf('{', a), depth = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (q) { if (c === q && src[j - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (!depth) return src.slice(a, j + 1); }
  }
  return '';
}

console.log('— 1. Fix: pan-x solo en la tarjeta (sin ambigüedad en iOS) —');
ok(css.includes('.igmock-media-car .hf-d-track{touch-action:pan-x;overscroll-behavior-x:contain}'), 'track de la tarjeta con touch-action pan-x (no pan-x pan-y)');
ok(!css.includes('.igmock-media-car .hf-d-track{touch-action:pan-x pan-y'), 'ya no existe pan-x pan-y en el track de la tarjeta');
ok(css.includes('.igmock-media-car .hf-d-slide img{touch-action:pan-x;'), 'imgs del slide con touch-action pan-x');
ok(!css.includes('.igmock-media-car .hf-d-slide img{touch-action:pan-x pan-y'), 'ya no existe pan-x pan-y en las imgs del slide');
ok(css.includes('.igmock .hf-d-dots i{cursor:pointer}'), 'puntitos de la tarjeta con cursor pointer');
ok(css.includes('.hf-d-track{display:flex;overflow-x:auto;scroll-snap-type:x mandatory'), 'regla base del track intacta (flex + overflow-x auto + snap)');
ok(css.includes('.hf-d-slide{flex:0 0 100%;scroll-snap-align:center}'), 'slides a 100% con snap intactos');

console.log('— 2. Fix: tocar un puntito avanza (mismo track) —');
ok(app.includes("e.target.closest('.hf-d-dots i')") && app.includes("dot.closest('.igmock')"), 'handler delegado de click en puntitos, solo dentro de .igmock');
ok(app.includes("track.scrollTo({ left: k * Math.max(1, track.clientWidth), behavior: 'smooth' })"), 'puntito k desplaza el track a k*ancho con smooth');
ok(app.includes('LOTE CARRUSEL-DETALLE'), 'cambio marcado con el lote');

console.log('— 3. Intacto: sync por scroll v536 + cableado propio de detalle/aprobación —');
ok(app.includes("classList.contains('hf-d-track')") && app.includes("t.closest('.igmock')"), 'sync delegado por scroll de la tarjeta intacto');
ok(app.includes("ov.querySelectorAll('.hf-d-dots i')") && app.includes("q('.hf-d-track')"), 'detalle conserva su sync propio (hfDetailWire)');
ok(app.includes("document.querySelector('.apv-media .hf-d-track')") && app.includes("document.querySelector('.apv-wrap .hf-d-dots')"), 'aprobación conserva su sync propio');
ok(!css.includes('.hf-dcard .hf-d-track{touch-action') && !css.includes('.apv-media .hf-d-track{touch-action'), 'detalle y aprobación sin touch-action nuevo (no se tocan)');

console.log('— 4. Render real en vm: la tarjeta carrusel de la captura —');
const escLine = app.split('\n').find((l) => l.startsWith('const esc = '));
const celLine = app.split('\n').find((l) => l.startsWith('const PZ_IC_CEL'));
const pzIcFn = extractFn(app, 'function pzIc');
const pzIcObj = extractConstObj(app, 'const PZ_IC = ');
const wc = extractFn(app, 'function weekCardHTML');
ok(!!escLine && !!celLine && !!pzIcFn && !!pzIcObj && !!wc, 'extrae esc + pzIc real + weekCardHTML');
const ctx = { console, LP_WEEK_ICONS: '', hfAskChangeBtnHTML: () => '', pcParseDate: () => null, pcFmtDayLong: () => '', igRelTime: () => '' };
vm.createContext(ctx);
vm.runInContext(escLine + '\n' + celLine + '\n' + pzIcObj + '\n' + pzIcFn + '\n' + wc, ctx);
const slides = ['s1', 's2', 's3', 's4', 's5'];
const d = { id: 523, status: 'draft', media_type: 'carousel', image_path: slides[0], carousel_paths: JSON.stringify(slides.slice(1)), caption: 'Deslizá 👉', hashtags: '', approval: 'pending', needs_review: false, likes: null, comments_count: null };
const card = ctx.weekCardHTML(d, { bizName: 'Posty', tz: 'America/Argentina/Buenos_Aires', prop: { label: 'lun 16 · 19:00', iso: '2026-11-16T19:00:00' }, count: null, user: 'posty.communitymanager', pic: '' });
ok(card.includes('igmock-media-car') && card.includes('hf-d-track'), 'rama carrusel con track');
ok((card.match(/hf-d-slide/g) || []).length === 5, '5 slides sin duplicar (cover + 4 de carousel_paths)');
ok(card.includes('hf-d-count">1/5'), 'contador 1/5');
ok((card.match(/<div class="hf-d-dots">/) || []).length === 1 && (card.match(/<i class=/g) || []).length === 5, '5 puntitos, primero activo');
ok(card.includes('data-lightbox="s3"'), 'cada slide abre su foto (data-lightbox por slide)');
ok(card.includes('Borrador') && card.includes('Publicar ahora') && card.includes('Aceptar'), 'chip Borrador + Publicar ahora + Aceptar (la superficie de la captura)');

console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
