// test-lotecorazonabajo.js — LOTE CORAZÓN-ABAJO (decisión Valentino 1/11).
// El corazón de aprobar en las tiles pasa de arriba a la derecha a
// ABAJO A LA DERECHA de la foto, MÁS CHICO y en vidrio. Fundamento:
// abajo a la derecha queda a mano del pulgar, se separa del glifo de
// arriba y no tapa nada si flota sobre la foto y no sobre la chapita.
// REEMPLAZA al lote corazón-vidrio (trabajo completo SIN push: vidrio
// arriba a la derecha) — se junta todo en un solo cambio, no se
// pushea vidrio arriba para moverlo después.
// Reglas: visible 26px en vidrio v519 (::before) con caja de toque
// intacta 34px; bottom:38px despeja la franja (~31px) con ~7px de aire
// (día+hora enteros, decisión v528 intacta); se elimina el drop a
// top:32px con glifo (glifo arriba, corazón abajo, no se cruzan); la
// clase hf-has-glyph queda en el HTML como marca de glifo (la usan
// los tests; no se borra). Solo styles.css; app.js y server.js
// intactos. Node puro, lee el árbol. Uso: node test-lotecorazonabajo.js
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
function ruleBody(re) {
  const m = re.exec(css);
  return m ? m[0] : '';
}

// ---------- Versiones + censo (pines rotados a la liberación v548 con causa: bump v547→v548 de gris-tik (antes v547 de carrusel-flechas); este lote solo toca styles.css) ----------
t(srv.includes("const BUILD_ID = '20261101-v548'"), 'BUILD v532 en server.js');
t(idx.includes('app.js?v=364') && idx.includes('styles.css?v=20261083'), 'index: app 363 + styles 20261082 (bump v547 de carrusel-flechas)');
t(idxEn.includes('styles.css?v=20261083') && !idxEn.includes('app.js?v='), 'en/index: styles 20261082, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v524'"), 'CHUNK_V sigue v524 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- CSS: corazón abajo a la derecha, vidrio, 26px visible ----------
const ruleTileHeart = /\.hf-tile\s*>\s*\.hf-like-in\{[^}]*\}/.exec(css);
t(!!ruleTileHeart, 'CSS: regla .hf-tile > .hf-like-in');
t(ruleTileHeart && /bottom:38px/.test(ruleTileHeart[0]), 'corazón bottom:38px (abajo a la derecha de la foto)');
t(ruleTileHeart && /right:6px/.test(ruleTileHeart[0]), 'corazón right:6px (mismo aire que tenía arriba)');
t(ruleTileHeart && !/top:/.test(ruleTileHeart[0]), 'corazón SIN top (ya no vive arriba)');
t(ruleTileHeart && /background:transparent/.test(ruleTileHeart[0]), 'botón transparente (el vidrio lo dibuja el ::before)');
t(ruleTileHeart && /border-color:transparent/.test(ruleTileHeart[0]), 'botón sin borde opaco');
t(ruleTileHeart && /box-shadow:none/.test(ruleTileHeart[0]), 'botón sin sombra opaca');
t(ruleTileHeart && /z-index:5/.test(ruleTileHeart[0]), 'corazón z-index:5 (por encima de la foto y de la franja)');
const ruleBefore = /\.hf-tile\s*>\s*\.hf-like-in::before\{[^}]*\}/.exec(css);
t(!!ruleBefore, 'CSS: regla ::before del corazón');
t(ruleBefore && /width:26px/.test(ruleBefore[0]) && /height:26px/.test(ruleBefore[0]), 'círculo visible 26px (venía de 34px)');
t(ruleBefore && /background:rgba\(255,255,255,.55\)/.test(ruleBefore[0]), 'vidrio v519: fondo rgba(255,255,255,.55)');
t(ruleBefore && /backdrop-filter:blur\(16px\) saturate\(1.4\)/.test(ruleBefore[0]), 'vidrio v519: blur 16px saturate 1.4');
t(ruleBefore && /-webkit-backdrop-filter:blur\(16px\) saturate\(1.4\)/.test(ruleBefore[0]), 'vidrio v519: -webkit-backdrop-filter igual');
t(ruleBefore && /border:1px solid rgba\(255,255,255,.75\)/.test(ruleBefore[0]), 'vidrio v519: borde rgba(255,255,255,.75)');
t(ruleBefore && /border-radius:50%/.test(ruleBefore[0]), 'círculo redondo');
const ruleIcon = /\.hf-tile\s*>\s*\.hf-like-in\s+\.pz-ic svg\{[^}]*\}/.exec(css);
t(!!ruleIcon, 'CSS: regla del icono del corazón');
t(ruleIcon && /drop-shadow\(0 0 2px rgba\(255,255,255,.9\)\)/.test(ruleIcon[0]), 'icono con halo blanco load-bearing en fotos oscuras');
t(ruleIcon && /drop-shadow\(0 1px 2px rgba\(10,30,51,.35\)\)/.test(ruleIcon[0]), 'icono con sombra oscura sutil');
const ruleLike = /\.hf-like\{[^}]*\}/.exec(css);
t(ruleLike && /width:34px/.test(ruleLike[0]) && /height:34px/.test(ruleLike[0]), 'ZONA DE TOQUE INTACTA: caja del botón 34x34');
const ruleDrop = /\.hf-tile\.hf-has-glyph\s*>\s*\.hf-like-in\{[^}]*\}/.exec(css);
t(!ruleDrop, 'SIN regla de drop a top:32px (glifo arriba + corazón abajo ya no se cruzan)');
const ruleGlyph = /\.hf-glyph\{[^}]*\}/.exec(css);
t(!!ruleGlyph, 'CSS: regla .hf-glyph intacta');
t(ruleGlyph && /top:6px/.test(ruleGlyph[0]) && /right:6px/.test(ruleGlyph[0]), 'glifo sigue arriba a la derecha');
t(ruleGlyph && /width:20px/.test(ruleGlyph[0]) && /height:20px/.test(ruleGlyph[0]), 'glifo sigue 20px (no se achica ni se mueve)');

// ---------- Despeje geométrico: el corazón NO pisa la franja ----------
const stripRule = /\.hf-strip\{[^}]*\}/.exec(css);
const chipRule = /\.hf-chip\{[^}]*\}/.exec(css);
const padM = stripRule && /padding:([\d.]+)px/.exec(stripRule[0]);
const fsM = chipRule && /font-size:([\d.]+)px/.exec(chipRule[0]);
const lhM = chipRule && /line-height:([\d.]+)/.exec(chipRule[0]);
const cpM = chipRule && /padding:([\d.]+)px/.exec(chipRule[0]);
t(!!(stripRule && chipRule && padM && fsM && lhM && cpM), 'métricas de franja+chapita legibles en CSS');
if (stripRule && chipRule && padM && fsM && lhM && cpM) {
  const stripH = 2 * parseFloat(padM[1]) + (parseFloat(fsM[1]) * parseFloat(lhM[1]) + 2 * parseFloat(cpM[1]));
  const heartBottom = 38;
  t(heartBottom > stripH, `despeje: bottom ${heartBottom}px > alto franja ${stripH}px (aire ${(heartBottom - stripH).toFixed(1)}px, nunca sobre la chapita)`);
}
t(stripRule && /bottom:0/.test(stripRule[0]) && /left:0/.test(stripRule[0]) && /right:0/.test(stripRule[0]), 'franja sigue abajo a lo ancho (toda la fila para día+hora)');
const ruleDay = /\.hf-strip\s+\.hf-chip-day\{[^}]*\}/.exec(css);
t(ruleDay && /flex:0 0 auto/.test(ruleDay[0]), 'día flex:0 0 auto (nunca se achica)');
t(ruleDay && !/ellipsis/.test(ruleDay[0]), 'día SIN ellipsis (decisión v528 intacta)');

// ---------- Render: HTML intacto (solo CSS cambió) ----------
const sb = sandbox('es');
loadFns(sb, ['pcDayKeyShift', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts', 'homeTileHTML']);
loadConsts(sb, ['HOME_PIN_SVG', 'HOME_REEL_SVG', 'HOME_CAR_SVG']);
const render = (tileObj, i) => vm.runInContext(`homeTileHTML(${JSON.stringify(tileObj)}, ${i || 0})`, sb);
const man = new Date(); man.setDate(man.getDate() + 1); man.setHours(19, 0, 0, 0);
const tileProg = render({ kind: 'post', post: { id: 101, status: 'scheduled', scheduled_at: man.toISOString(), media_type: 'image', caption: 'promo' } });
const stripProg = stripInner(tileProg);
t(stripProg !== null, 'franja .hf-strip presente en tile programada');
t(stripProg.indexOf('data-hf-like') < 0, 'corazón FUERA de la franja (tile programada)');
t(tileProg.indexOf('data-hf-like') >= 0, 'corazón presente en la tile');
t(tileProg.indexOf('hf-like hf-like-in') >= 0, 'corazón con clases hf-like hf-like-in');
t(tileProg.indexOf('data-hf-like') > tileProg.indexOf(stripProg) + stripProg.length, 'corazón después de la franja (hijo de la tile)');
t(tileProg.indexOf('hf-has-glyph') < 0, 'tile foto sin glifo: sin clase hf-has-glyph');
t(tileProg.indexOf('Aprobar con corazón') >= 0, 'aria-label corazón ES');
t(tileProg.indexOf('hf-chip-day') >= 0 && tileProg.indexOf('hf-chip-hm') >= 0, 'chapita con día + hora separados');
const tileVid = render({ kind: 'post', post: { id: 102, status: 'scheduled', scheduled_at: man.toISOString(), media_type: 'video', image_path: 'x.mp4', caption: 'reel' } });
t(tileVid.indexOf('hf-has-glyph') >= 0, 'tile video: clase hf-has-glyph (marca, sin regla de drop)');
t(tileVid.indexOf('hf-glyph') >= 0, 'tile video: glifo presente arriba');
t(stripInner(tileVid).indexOf('data-hf-like') < 0, 'corazón FUERA de la franja (tile video)');
sb.ME.lang = 'en';
const tileEn = render({ kind: 'post', post: { id: 104, status: 'scheduled', scheduled_at: man.toISOString(), media_type: 'image', caption: 'promo' } });
t(tileEn.indexOf('Approve with heart') >= 0, 'aria-label corazón EN');
sb.ME.lang = 'es';

// ---------- Handlers intactos: aprobar desde el corazón, doble toque, detalle sin corazón ----------
t(app.indexOf("closest('[data-hf-like]')") >= 0, 'guards data-hf-like en hfDetailBind/hfLikeBind');
t(app.indexOf("closest('.hf-strip, [data-hf-like]')") >= 0, 'SCF web: hover corazón también disuelve el pop');
t(cnt(app, '<button type="button" class="hf-like hf-like-in"') === 1, 'un único botón corazón en app.js (detalle NO lo recupera)');
t(app.indexOf('function hfLikeBind') >= 0 && app.indexOf('function hfDetailBind') >= 0, 'handlers hfLikeBind/hfDetailBind presentes');
t(/HF_DBL/.test(app) && /300/.test(app), 'doble toque 300 ms intacto (Lote 2)');

console.log(`lotecorazonabajo: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
