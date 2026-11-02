// test-lotecorazonenlinea.js — LOTE CORAZÓN-EN-LÍNEA (decisión Valentino 2/11 ~06:56: «dale»)
// El corazón va MÁS CHIQUITO y EN LA MISMA LÍNEA del día y la hora.
// REEMPLAZA la posición del lote corazón-abajo (v545: chiquito 26px pero
// SOBRE la foto, arriba de la chapita) para tiles CON chapita. Sin
// chapita (borrador sin fecha) la posición abajo-sobre-foto queda intacta.
// Con chapita, el botón vive DENTRO de .hf-strip (misma fila que día+hora)
// y la tile lleva hf-has-chip; el día vuelve a recortar con ellipsis
// (v528 la había quitado solo porque la fila era toda de la chapita; con
// el corazón de vuelta en la fila, si el día no recortara, la hora se
// cortaría — y la hora NUNCA se corta). Sin chapita, ninguna regla nueva.
// Uso: node test-lotecorazonenlinea.js [dir]  (dir = raíz del árbol; default: __dirname)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

console.log('— 1. Fix presente: botón en la franja solo con chapita —');
ok(app.includes('LOTE CORAZÓN-EN-LÍNEA'), 'marca del lote en app.js');
ok(css.includes('LOTE CORAZÓN-EN-LÍNEA'), 'marca del lote en styles.css');
ok(app.includes('const likeBtn = `<button type="button" class="hf-like hf-like-in"'), 'likeBtn: un único botón, misma clase literal');
ok(app.includes('const likeInStrip = !!chipTxt;'), 'likeInStrip = hay chapita');
ok(app.includes('<span class="hf-strip">${chip}${archChip}${likeInStrip ? likeBtn : \'\'}</span>'), 'con chapita: botón DENTRO de la franja');
ok(app.includes('${despChip}${likeInStrip ? \'\' : likeBtn}'), 'sin chapita: botón hijo directo (posición abajo intacta)');
ok(app.includes("${chipTxt ? ' hf-has-chip' : ''}"), 'tile con chapita lleva hf-has-chip');
ok(cnt(app, 'class="hf-like hf-like-in"') === 1, 'un único botón corazón (sin duplicados)');
ok(!srv.includes('LOTE CORAZÓN-EN-LÍNEA'), 'server.js sin tocar por este lote');

console.log('— 2. CSS: chiquito en la fila, día recorta, hora nunca —');
ok(css.includes('.hf-tile.hf-has-chip > .hf-strip .hf-like-in{position:static'), 'corazón en flujo dentro de la franja (no flota sobre la foto)');
ok(css.includes('.hf-tile.hf-has-chip > .hf-strip .hf-like-in{position:static;flex:none;width:24px;height:24px'), 'corazón chiquito 24px en la fila');
ok(css.includes('.hf-tile.hf-has-chip > .hf-strip .hf-like-in svg{width:16px;height:16px}'), 'icono 16px dentro del botón 24px');
ok(css.includes('.hf-tile.hf-has-chip > .hf-strip .hf-chip-day{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}'), 'día recorta con ellipsis (la hora no se corta)');
ok(css.includes('.hf-tile.hf-has-chip > .hf-strip .hf-chip-hm{flex:0 0 auto;white-space:nowrap}'), 'hora flex-none, nunca se corta');
ok(css.includes('.hf-tile.hf-has-chip > .hf-strip{padding:4px 6px}'), 'franja con chapita: padding 4px para no romper la fila ~31px');

console.log('— 3. Intacto: abajo, lleno, binding, glifo, chapita —');
ok(css.includes('.hf-tile > .hf-like-in{position:absolute;bottom:38px;right:6px'), 'sin chapita: posición abajo-sobre-foto v545 intacta');
ok(css.includes('.hf-like[data-hf-on="1"] svg{fill:#2793C8;stroke:#2793C8}'), 'corazón lleno celeste v544 intacto');
ok(app.includes("e.target.closest('[data-hf-like]')") && app.includes('function hfLikeBind'), 'binding delegado por data-hf-like (tap en franja aprueba igual)');
ok(app.includes("${glyph ? ' hf-has-glyph' : ''}"), 'marca hf-has-glyph intacta');
ok(app.includes('<span class="hf-strip">${chip}${archChip}'), 'franja sigue con chapita + archivado');
ok(app.includes("data-hf-on=\"1\"") && app.includes('aria-pressed='), 'botón lleva data-hf-on + aria-pressed');

console.log('— 4. Render homeTileHTML real (vm): en línea con chapita, abajo sin ella —');
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
{
  const sb = { console, ME: { lang: 'es' }, Intl, Date, Map, Set };
  sb.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  sb.pzIc = (name) => `<i data-ic="${name}"></i>`;
  sb.hfCoverState = () => ({ has: false });
  sb.slotHour = () => 19;
  vm.createContext(sb);
  for (const n of ['pcDayKeyShift', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts', 'homeTileHTML']) {
    const code = extractFn(app, n);
    ok(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  for (const n of ['HOME_PIN_SVG', 'HOME_REEL_SVG', 'HOME_CAR_SVG']) {
    const a = app.indexOf('const ' + n + ' =');
    if (a >= 0) { const b = app.indexOf(';', a); vm.runInContext(app.slice(a, b + 1).replace('const ' + n + ' =', 'globalThis.' + n + ' ='), sb); }
  }
  const render = (o, i) => vm.runInContext(`homeTileHTML(${JSON.stringify(o)}, ${i || 0})`, sb);
  const tProg = render({ kind: 'post', post: { id: 302, status: 'scheduled', scheduled_at: '2026-11-05T19:00:00Z', media_type: 'image', caption: 'prog' } });
  ok(tProg.includes('hf-has-chip'), 'programada: tile lleva hf-has-chip');
  ok(tProg.includes('</button></span></span></span>'), 'programada: botón DENTRO de la franja (cierra franja+tile+celda tras él)', tProg.slice(tProg.indexOf('hf-strip'), tProg.indexOf('hf-strip') + 420));
  ok(tProg.includes('hf-chip-day">Jue 5</span>') && tProg.includes('hf-chip-hm"> · 19:00</span>'), 'programada: día y hora enteros en la misma fila');
  ok(cnt(tProg, 'class="hf-like hf-like-in"') === 1, 'programada: un solo botón corazón');
  ok(tProg.includes('data-hf-on="1"'), 'programada: corazón lleno intacto');
  const tDraft = render({ kind: 'post', post: { id: 301, status: 'draft', media_type: 'image', caption: 'sin fecha' } });
  ok(!tDraft.includes('hf-has-chip'), 'borrador sin fecha: sin hf-has-chip');
  ok(tDraft.includes('<span class="hf-strip"></span><button type="button" class="hf-like'), 'borrador sin fecha: botón hijo directo tras la franja vacía (abajo intacto)');
  ok(!tDraft.includes('</button></span></span></span>'), 'borrador sin fecha: botón NO dentro de la franja');
  ok(cnt(tDraft, 'class="hf-like hf-like-in"') === 1, 'borrador sin fecha: un solo botón corazón');
  const tDraftEn = render({ kind: 'post', post: { id: 303, status: 'scheduled', scheduled_at: '2026-11-05T19:00:00Z', media_type: 'image', caption: 'prog' } });
  ok(tDraftEn.includes('hf-has-chip') && tDraftEn.includes('</button></span></span></span>'), 'programada (2ª): en franja, sin duplicar');
}

console.log('— 5. Composición con gris-tik v548: el tik va en la tile, no en la franja —');
ok(app.includes("el.insertAdjacentHTML('beforeend', '<span class=\"hf-tik\""), 'pzAprobarEnSitio: el tik se agrega como hijo de la tile (arriba-izquierda)');
ok(!app.includes("like.insertAdjacentHTML('afterend', '<span class=\"hf-tik\""), 'pzAprobarEnSitio: el tik NO se inserta tras el botón (con el botón en la franja quedaría abajo, contra .hf-strip absoluta)');

console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
