// test-lotecorazon.js — LOTE CORAZÓN FUERA DE LA FILA DE LA CHAPITA.
// Reporte de Valentino 1/11 ~12:05: «Sigue mal. No se lee entero.
// Aparece: M…19:00hrs». Causa: la franja .hf-strip tenía el corazón
// flex:0 0 auto (34px + gap 8px) y la chapita flex:1 con ellipsis en
// el día; la hora (flex-none) sobrevivía y el día colapsaba a una
// letra («Mañana» -> «M…»). Fix: el corazón sale de la fila y flota
// arriba a la derecha de la foto; la fila inferior queda 100% para
// la chapita y el día nunca lleva ellipsis. Con glifo arriba a la
// derecha (pin/reel/carrusel), el corazón baja a top:32px.
// Node puro, lee el árbol. Uso: node test-lotecorazon.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
function sandbox(lang) {
  const sb = { console, ME: { lang: lang || 'es' }, Intl, Date, Map, Set };
  sb.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  sb.pzIc = (name) => `<i data-ic="${name}"></i>`;
  sb.hfCoverState = () => ({ has: false });
  sb.slotHour = () => 19;
  vm.createContext(sb);
  return sb;
}
function loadFns(sb, names) {
  for (const n of names) {
    const code = extractFn(app, n);
    t(code.length > 0, 'existe ' + n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
}
function loadConsts(sb, names) {
  for (const n of names) {
    const a = app.indexOf('const ' + n + ' =');
    t(a >= 0, 'existe const ' + n);
    if (a < 0) continue;
    const b = app.indexOf(';', a);
    vm.runInContext(app.slice(a, b + 1).replace('const ' + n + ' =', 'globalThis.' + n + ' ='), sb);
  }
}
// Extrae el contenido completo de <span class="hf-strip">...</span> con contador de spans.
function stripInner(html) {
  const open = html.indexOf('<span class="hf-strip">');
  if (open < 0) return null;
  let i = open, depth = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) return null;
    const gt = html.indexOf('>', lt);
    if (gt < 0) return null;
    const tag = html.slice(lt + 1, gt).trim();
    if (tag.startsWith('span ') || tag === 'span') depth++;
    else if (tag === '/span') { depth--; if (depth === 0) return html.slice(open, gt + 1); }
    i = gt + 1;
  }
  return null;
}

// ---------- Versiones + censo (base v527 + este lote = v528) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v528 en server.js');
t(idx.includes('app.js?v=355') && idx.includes('styles.css?v=20261074'), 'index: app 351 + styles 20261070');
t(idxEn.includes('styles.css?v=20261074') && !idxEn.includes('app.js?v='), 'en/index: styles 20261070, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v523 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- Render de tiles ----------
const sb = sandbox('es');
loadFns(sb, ['pcDayKeyShift', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts', 'homeTileHTML']);
loadConsts(sb, ['HOME_PIN_SVG', 'HOME_REEL_SVG', 'HOME_CAR_SVG']);
const render = (tileObj, i) => vm.runInContext(`homeTileHTML(${JSON.stringify(tileObj)}, ${i || 0})`, sb);

// Día entero a nivel de datos: «Mañana» no se recorta (función real, now explícito).
const chipManana = vm.runInContext(`hfWhenChip({scheduled_at:'2026-11-03T19:00:00Z'}, new Date('2026-11-02T12:00:00Z'))`, sb);
t(chipManana.indexOf('Mañana') === 0, 'hfWhenChip mañana: ' + chipManana);
const parts = vm.runInContext(`hfTileChipParts('Mañana 2/11 · 19:00', false)`, sb);
t(parts && parts.day === 'Mañana 2' && parts.hm === '19:00', 'hfTileChipParts: día Mañana 2 entero + 19:00 (Lote 16: recorta el mes, no el día)');

// Tile programada para mañana (sin imagen -> rama placeholder, misma franja).
const man = new Date(); man.setDate(man.getDate() + 1); man.setHours(19, 0, 0, 0);
const tileProg = render({ kind: 'post', post: { id: 101, status: 'scheduled', scheduled_at: man.toISOString(), media_type: 'image', caption: 'promo' } });
const stripProg = stripInner(tileProg);
t(stripProg !== null, 'franja .hf-strip presente en tile programada');
t(stripProg.indexOf('data-hf-like') < 0, 'corazón FUERA de la franja (tile programada)');
t(stripProg.indexOf('hf-chip') >= 0, 'chapita dentro de la franja');
t(stripProg.indexOf('…') < 0, 'sin ningún «…» en la franja (día entero)');
t(tileProg.indexOf('data-hf-like') >= 0, 'corazón presente en la tile');
t(tileProg.indexOf('hf-like hf-like-in') >= 0, 'corazón con clases hf-like hf-like-in');
t(tileProg.indexOf('hf-has-glyph') < 0, 'tile foto sin glifo: sin clase hf-has-glyph');
t(tileProg.indexOf('Aprobar con corazón') >= 0, 'aria-label corazón ES');
t(tileProg.indexOf('hf-chip-day') >= 0 && tileProg.indexOf('hf-chip-hm') >= 0, 'chapita con día + hora separados');
// El corazón es hijo directo de la tile: aparece después del cierre de la franja.
t(tileProg.indexOf('data-hf-like') > tileProg.indexOf(stripProg) + stripProg.length, 'corazón después de la franja (hijo de la tile)');

// Tile video (glifo reel): el corazón baja para no tapar el glifo.
const tileVid = render({ kind: 'post', post: { id: 102, status: 'scheduled', scheduled_at: man.toISOString(), media_type: 'video', image_path: 'x.mp4', caption: 'reel' } });
t(tileVid.indexOf('hf-has-glyph') >= 0, 'tile video: clase hf-has-glyph');
t(tileVid.indexOf('hf-glyph') >= 0, 'tile video: glifo presente');
t(stripInner(tileVid).indexOf('data-hf-like') < 0, 'corazón FUERA de la franja (tile video)');

// Tile archivada (publicada, sin chapita): archChip en la franja, corazón arriba.
const tileArch = render({ kind: 'post', archivedExt: true, post: { id: 103, status: 'published', media_type: 'image', caption: 'viejo' } });
const stripArch = stripInner(tileArch);
t(stripArch.indexOf('Archivado') >= 0, 'archChip Archivado en la franja');
t(stripArch.indexOf('data-hf-like') < 0, 'corazón FUERA de la franja (tile archivada)');
t(stripArch.indexOf('hf-chip') < 0, 'publicada archivada: sin chapita día+hora (regla vigente)');

// Espejo EN.
sb.ME.lang = 'en';
const tileEn = render({ kind: 'post', post: { id: 104, status: 'scheduled', scheduled_at: man.toISOString(), media_type: 'image', caption: 'promo' } });
t(tileEn.indexOf('Approve with heart') >= 0, 'aria-label corazón EN');
const chipEn = vm.runInContext(`hfWhenChip({scheduled_at:'2026-11-03T19:00:00Z'}, new Date('2026-11-02T12:00:00Z'))`, sb);
t(chipEn.indexOf('Tomorrow') === 0, 'hfWhenChip tomorrow EN: ' + chipEn);
sb.ME.lang = 'es';

// ---------- CSS: corazón top-right, día sin ellipsis, archivado cede ----------
const ruleTileHeart = /\.hf-tile\s*>\s*\.hf-like-in\{[^}]*\}/.exec(css);
t(!!ruleTileHeart, 'CSS: regla .hf-tile > .hf-like-in');
t(ruleTileHeart && /top:6px/.test(ruleTileHeart[0]) && /right:6px/.test(ruleTileHeart[0]), 'corazón top:6px right:6px');
t(ruleTileHeart && /background:#fff/.test(ruleTileHeart[0]), 'corazón fondo blanco opaco');
const ruleGlyph = /\.hf-tile\.hf-has-glyph\s*>\s*\.hf-like-in\{[^}]*\}/.exec(css);
t(!!ruleGlyph && /top:32px/.test(ruleGlyph[0]), 'con glifo: corazón top:32px (no tapa el glifo)');
const ruleDay = /\.hf-strip\s+\.hf-chip-day\{[^}]*\}/.exec(css);
t(!!ruleDay, 'CSS: regla .hf-strip .hf-chip-day');
t(ruleDay && /flex:0 0 auto/.test(ruleDay[0]), 'día flex:0 0 auto (nunca se achica)');
t(ruleDay && !/ellipsis/.test(ruleDay[0]), 'día SIN ellipsis (nunca «M…»)');
const ruleChip = /\.hf-strip\s+\.hf-chip\{[^}]*\}/.exec(css);
t(ruleChip && !/ellipsis/.test(ruleChip[0]), 'chapita SIN text-overflow:ellipsis');
const ruleArch = /\.hf-arch-chip\{[^}]*\}/.exec(css);
t(ruleArch && /min-width:0/.test(ruleArch[0]), 'archChip min-width:0 (cede primero si coincide)');
t(!/\.hf-strip\s+\.hf-like-in\{position:static/.test(css), 'regla vieja corazón-en-franja retirada');

// ---------- Handlers intactos: corazón aprueba sin abrir detalle; detalle sin corazón ----------
t(app.indexOf("closest('[data-hf-like]')") >= 0, 'guards data-hf-like en hfDetailBind/hfLikeBind');
t(app.indexOf("closest('.hf-strip, [data-hf-like]')") >= 0, 'SCF web: hover corazón también disuelve el pop');
t(cnt(app, '<button type="button" class="hf-like hf-like-in"') === 1, 'un único botón corazón en app.js (detalle NO lo recupera)');
t(app.indexOf('function hfLikeBind') >= 0 && app.indexOf('function hfDetailBind') >= 0, 'handlers hfLikeBind/hfDetailBind presentes');
// Doble toque intacto (Lote 2): el guard de 300 ms sigue en hfDetailBind.
t(/HF_DBL/.test(app) && /300/.test(app), 'doble toque 300 ms intacto');

console.log(`lotecorazon: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
