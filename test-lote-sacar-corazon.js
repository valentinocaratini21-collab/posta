// test-lote-sacar-corazon.js — SACAR CORAZÓN-APROBAR DEL FEED (6/11).
// Decisión Valentino 6/11 12:55: con 1 posteo/día la aprobación vive solo
// en el ritual ([Sale así]); el corazón en el feed era un segundo camino
// para lo mismo y fue el que confundió mostrando corazón para aprobar en
// borradores. Este archivo es la regresión de ese retiro:
//   1) ninguna tile del feed tiene corazón-aprobar (borrador, programado,
//      publicado, ES y EN — render real en vm, no solo grep);
//   2) la aprobación vive solo en el ritual (botón [Sale así] presente;
//      ni hfTileApprove ni hfLikeBind existen en ningún chunk);
//   3) M78: ninguna llamada colgando a lo eliminado;
//   4) el texto instructivo no existe en ningún idioma;
//   5) el tik verde sigue marcando lo aprobado (y solo eso);
//   6) «Aprobar todo» sigue marcando con tik (pzAprobarEnSitio +
//      pzAcceptAllWeekMark, respaldo incluido).
// Node puro, lee el árbol local. Uso: node test-lote-sacar-corazon.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
const cnt = (s, sub) => (s.split(sub).length - 1);

// ---------- 1) Ausencia estática en todo el bundle ----------
const PUB = path.join(__dirname, 'public');
for (const f of fs.readdirSync(PUB)) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(path.join(PUB, f), 'utf8');
  t(!src.includes('data-hf-like'), 'sin data-hf-like en ' + f);
  t(!src.includes('hfTileApprove'), 'sin hfTileApprove en ' + f);
  t(!src.includes('hfLikeBind'), 'sin hfLikeBind en ' + f);
  t(!src.includes('apv-like'), 'sin apv-like en ' + f);
  t(!src.includes('Tocá el corazón en los posteos para aprobar.'), 'sin nota ES en ' + f);
  t(!src.includes('Tap the heart on the posts to approve.'), 'sin nota EN en ' + f);
  t(!src.includes('Tocá el corazón para aprobar.'), 'sin nota corta ES en ' + f);
  t(!src.includes('Tap the heart to approve.'), 'sin nota corta EN en ' + f);
}
t(!css.includes('.hf-like'), 'sin regla .hf-like en styles.css');
t(!css.includes('.hf-accept-note'), 'sin regla .hf-accept-note en styles.css');
t(!css.includes('.hf-like-in'), 'sin regla .hf-like-in en styles.css');

// ---------- 2) Render real de la tile (vm): sin corazón en ningún estado ----------
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
function sandbox(lang) {
  const sb = {
    console,
    ME: { lang },
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null },
    Intl, Date, Map, Set,
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  Object.assign(sb, {
    pzIc: () => '<svg>',
    mv: (x) => x,
    hfWhenChip: () => 'vie 6 · 19:00',
    hfPlanChip: () => 'vie 6',
    HOME_PIN_SVG: '', HOME_REEL_SVG: '', HOME_CAR_SVG: '',
  });
  vm.createContext(sb);
  return sb;
}
function renderTile(lang, post) {
  const sb = sandbox(lang);
  for (const n of ['hfTileChipParts', 'homeTileHTML']) {
    const code = extractFn(app, n);
    if (!code) return null;
    vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
  }
  return sb.homeTileHTML({ kind: 'post', post, day: '2026-11-06' }, 0);
}
const STATES = [
  ['borrador', { id: 7, status: 'draft', media_type: 'image', image_path: 'x.jpg' }],
  ['programado', { id: 8, status: 'scheduled', media_type: 'image', image_path: 'x.jpg', scheduled_at: '2026-11-06T22:00:00Z' }],
  ['publicado', { id: 9, status: 'published', media_type: 'image', image_path: 'x.jpg', published_at: '2026-11-06T22:00:00Z' }],
];
for (const lang of ['es', 'en']) {
  for (const [label, post] of STATES) {
    const out = renderTile(lang, post);
    t(out !== null, 'render ' + label + ' ' + lang.toUpperCase() + ': homeTileHTML corre');
    if (out) {
      t(!out.includes('data-hf-like'), 'render ' + label + ' ' + lang.toUpperCase() + ': sin data-hf-like');
      t(!out.includes('hf-like'), 'render ' + label + ' ' + lang.toUpperCase() + ': sin clase hf-like');
      t(!out.includes('Aprobar con corazón'), 'render ' + label + ' ' + lang.toUpperCase() + ': sin aria-label de aprobar');
      t(!out.includes('hf-tik'), 'render ' + label + ' ' + lang.toUpperCase() + ' pendiente: sin tik (no está aprobado)');
      t(out.includes('scf-mini-x'), 'render ' + label + ' ' + lang.toUpperCase() + ': la foto sigue');
    }
  }
  // Aprobado sin salir: tik verde en el slot del corazón, sin corazón.
  const outAp = renderTile(lang, { id: 10, status: 'scheduled', media_type: 'image', image_path: 'x.jpg', scheduled_at: '2026-11-06T22:00:00Z', approval: 'approved' });
  t(outAp !== null && outAp.includes('hf-tik') && outAp.includes('✓'), 'render aprobado ' + lang.toUpperCase() + ': tik verde presente');
  t(outAp !== null && !outAp.includes('hf-like'), 'render aprobado ' + lang.toUpperCase() + ': sin corazón');
  // Publicado (aunque fuera aprobado): ya no lleva ninguna marca.
  const outPub = renderTile(lang, { id: 11, status: 'published', media_type: 'image', image_path: 'x.jpg', published_at: '2026-11-06T22:00:00Z', approval: 'approved' });
  t(outPub !== null && !outPub.includes('hf-tik') && !outPub.includes('hf-like'), 'render publicado ' + lang.toUpperCase() + ': sin ninguna marca');
}

// ---------- 3) La aprobación vive solo en el ritual ----------
t(app.includes('class="pz-ritual-ok"') && app.includes("en ? 'Post it like this' : 'Sale así'"), 'ritual: botón [Sale así] / [Post it like this] presente');
t(app.includes('data-pz-ritual-ok'), 'ritual: handler del botón presente');
t(app.includes("pzIc('checkCircle'"), 'Aceptar todo: ícono check presente (no corazón)');

// ---------- 4) M78: nada llama a lo eliminado; lo que queda existe ----------
const defs = [];
for (const m of app.matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)) defs.push(m[1]);
const mustExist = ['hfDetailBind', 'hfDurBind', 'bindScfMinis', 'pzAprobarEnSitio', 'pzAcceptAllWeekMark', 'pzAcceptAllWeek', 'pzAcceptAllWeekCands', 'pzAcceptCountSync', 'hfTileChipParts', 'homeTileHTML', 'hfProfileActionsHTML', 'acceptBarHTML', 'f3HeartBurst', 'f3GestureApprove', 'pcApprove', 'pzAprobadoEs', 'pzAprobadoMarcar'];
const missing = mustExist.filter((f) => !defs.includes(f));
t(!missing.length, 'M78: funciones auditadas ' + (mustExist.length - missing.length) + '/' + mustExist.length + (missing.length ? ' (faltan: ' + missing.join(', ') + ')' : ''));
t(cnt(app, 'hfLikeBind') === 0 && cnt(app, 'hfTileApprove') === 0, 'M78: 0 referencias a hfLikeBind/hfTileApprove en app.js');

// ---------- 5) El tik sigue (CSS + respaldo de marca) ----------
t(css.includes('.hf-tik{') && css.includes('#1FA855'), 'tik: regla base verde presente en styles.css');
t(css.includes('.hf-tile > .hf-strip .hf-tik{'), 'tik: regla en franja presente');
t(app.includes("const tikSpan = hfAprobado ? '<span class=\"hf-tik\""), 'tik: render lo emite si aprobado');
t(app.includes("if (!el.querySelector('.hf-tik'))"), 'tik: pzAprobarEnSitio no duplica');
t(app.includes("tile.querySelector('.hf-chip')"), 'tik: pzAcceptAllWeekMark ubica por chapita, no por corazón');

// ---------- 6) El gesto de medios del detalle sigue (fuera de este lote) ----------
t(app.includes('function f3GestureApprove'), 'detalle: f3GestureApprove sigue (doble toque en media, flujo Bandeja)');
t(app.includes('function f3HeartBurst'), 'detalle: f3HeartBurst sigue en uso por el gesto de medios');

console.log(`lote-sacar-corazon: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
