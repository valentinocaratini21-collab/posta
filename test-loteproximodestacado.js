// LOTE PRÓXIMO-DESTACADO — suite nueva (2/11).
// Extrae las funciones REALES de work/public/app.js y las evalúa con
// stubs mínimos; el resto de asserts son sobre el árbol de trabajo.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const W = path.join(__dirname, 'public');
const P = path.join(__dirname, '..', 'pristine-v559', 'public');
const appSrc = fs.readFileSync(path.join(W, 'app.js'), 'utf8');
const appPri = fs.readFileSync(path.join(P, 'app.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(W, 'styles.css'), 'utf8');
const cssPri = fs.readFileSync(path.join(P, 'styles.css'), 'utf8');

function extract(src, fnName) {
  const i = src.indexOf('function ' + fnName);
  assert.ok(i >= 0, fnName + ' definida');
  // Corta en el siguiente "\n}\n" a partir del inicio.
  let j = src.indexOf('\n}\n', i);
  assert.ok(j > i, fnName + ' cierre encontrado');
  return src.slice(i, j + 3);
}

let ok = 0, fail = 0;
function t(name, fn) {
  try { fn(); ok++; console.log('ok - ' + name); }
  catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + e.message); }
}

// Stubs mínimos para evaluar las funciones reales.
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pzIc = () => '';
const mv = (s) => s;
const hfWhenChip = (p) => (p && p._chip) || '';
const ctx = { esc, pzIc, mv, hfWhenChip };
const loader = new Function('esc', 'pzIc', 'mv', 'hfWhenChip',
  extract(appSrc, 'pzNextScheduledId') + '\n' +
  extract(appSrc, 'pzProximoDestacadoPost') + '\n' +
  extract(appSrc, 'pzProximoDestacadoHTML') + '\n' +
  ';return { pzNextScheduledId, pzProximoDestacadoPost, pzProximoDestacadoHTML };');
const { pzProximoDestacadoHTML } = loader(esc, pzIc, mv, hfWhenChip);

const NOW = new Date('2026-11-02T12:00:00Z');
const mk = (id, status, at, extra) => Object.assign({ id, status, scheduled_at: at, media_type: 'image', image_path: '/img/' + id + '.jpg', caption: 'Caption ' + id, _chip: 'Vie 7/11 · 19:00' }, extra || {});

t('próximo futuro correcto entre varios programados', () => {
  const posts = [
    mk(1, 'scheduled', '2026-11-01T19:00:00Z'),
    mk(2, 'scheduled', '2026-11-05T19:00:00Z'),
    mk(3, 'scheduled', '2026-11-03T19:00:00Z'),
  ];
  // pzNextScheduledId usa Date.now real; lo probamos vía HTML con now real:
  // con now=2026-11-02 los futuros son 3 y 5; el más cercano es el 3.
  // Para determinismo, evaluamos el selector con fecha fijada:
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new RealDate('2026-11-02T12:00:00Z').getTime(); } };
  try {
    const html = pzProximoDestacadoHTML(posts, false);
    assert.ok(html.includes('data-hf-nextup="3"'), 'id 3, no ' + html.slice(0, 120));
    assert.ok(html.includes('El próximo en salir'), 'título ES');
    assert.ok(html.includes('Programado'), 'estado ES');
    assert.ok(html.includes('Vie 7/11 · 19:00'), 'día/hora reales');
    assert.ok(html.includes('hf-nextup-media'), 'foto');
    assert.ok(html.includes('Caption 3'), 'caption del próximo');
  } finally { global.Date = RealDate; }
});

t('sin tarjeta cuando no hay futuro', () => {
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new RealDate('2026-11-02T12:00:00Z').getTime(); } };
  try {
    assert.strictEqual(pzProximoDestacadoHTML([mk(1, 'scheduled', '2026-11-01T19:00:00Z')], false), '');
    assert.strictEqual(pzProximoDestacadoHTML([], false), '');
    assert.strictEqual(pzProximoDestacadoHTML([mk(9, 'published', '2026-11-05T19:00:00Z')], false), '');
  } finally { global.Date = RealDate; }
});

t('borrador con fecha futura no cuenta (solo scheduled)', () => {
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new RealDate('2026-11-02T12:00:00Z').getTime(); } };
  try {
    assert.strictEqual(pzProximoDestacadoHTML([mk(7, 'draft', '2026-11-09T19:00:00Z')], false), '');
  } finally { global.Date = RealDate; }
});

t('scheduled sin scheduled_at no dibuja nada inventado', () => {
  const posts = [mk(8, 'scheduled', null)];
  assert.strictEqual(pzProximoDestacadoHTML(posts, false), '');
});

t('sin chapita real no hay tarjeta', () => {
  const posts = [Object.assign(mk(4, 'scheduled', '2026-11-05T19:00:00Z'), { _chip: '' })];
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new RealDate('2026-11-02T12:00:00Z').getTime(); } };
  try { assert.strictEqual(pzProximoDestacadoHTML(posts, false), ''); }
  finally { global.Date = RealDate; }
});

t('EN: título y estado espejo', () => {
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new RealDate('2026-11-02T12:00:00Z').getTime(); } };
  try {
    const html = pzProximoDestacadoHTML([mk(5, 'scheduled', '2026-11-04T19:00:00Z')], true);
    assert.ok(html.includes('Next up'), 'título EN');
    assert.ok(html.includes('Scheduled'), 'estado EN');
  } finally { global.Date = RealDate; }
});

t('video usa elemento video, no img', () => {
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new RealDate('2026-11-02T12:00:00Z').getTime(); } };
  try {
    const html = pzProximoDestacadoHTML([mk(6, 'scheduled', '2026-11-04T19:00:00Z', { media_type: 'video', image_path: '/vid/6.mp4' })], false);
    assert.ok(html.includes('<video'), 'video presente');
    assert.ok(!html.includes('<img'), 'sin img');
  } finally { global.Date = RealDate; }
});

t('sin imagen: texto real, nada inventado', () => {
  const RealDate = Date;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : ['2026-11-02T12:00:00Z'])); } static now() { return new RealDate('2026-11-02T12:00:00Z').getTime(); } };
  try {
    const html = pzProximoDestacadoHTML([mk(10, 'scheduled', '2026-11-04T19:00:00Z', { image_path: '', caption: 'Texto real' })], false);
    assert.ok(html.includes('Texto real'), 'caption real');
    assert.ok(!html.includes('<img'), 'sin foto inventada');
  } finally { global.Date = RealDate; }
});

t('inicioView inserta la tarjeta entre pestañas y grilla, sin visitante', () => {
  const i = appSrc.indexOf('pzProximoDestacadoHTML(allPosts, enHome)');
  assert.ok(i > 0, 'llamada en inicioView');
  // (Liberación v588 · causa: la tanda INICIO x5 pone etiqueta y semanaOk
  // entre pestañas y la tarjeta; la ventana pasa de 120 a 400 para
  // seguir afirmando el mismo orden pestañas -> tarjeta -> grilla.)
  const seg = appSrc.slice(Math.max(0, i - 400), i + 80);
  assert.ok(seg.includes('hfTabsHTML'), 'después de pestañas');
  assert.ok(seg.includes('gridHTML'), 'antes de grilla');
  assert.ok(seg.includes('!HF_VISITOR'), 'guardia visitante');
});

t('toque abre el detalle del posteo correcto (#/app/post/:id)', () => {
  assert.ok(appSrc.includes("location.hash = '#/app/post/' + encodeURIComponent(id)"), 'destino detalle');
  assert.ok(appSrc.includes("closest('[data-hf-nextup]')"), 'delegación en la tarjeta');
  assert.ok(appSrc.includes('_pzNextupBound'), 'binding idempotente');
});

t('refresh vivo re-compone la tarjeta con el payload nuevo', () => {
  const i = appSrc.indexOf('La tarjeta sigue al próximo real');
  assert.ok(i > 0, 'bloque vivo presente');
  const seg = appSrc.slice(i, i + 900);
  assert.ok(seg.includes('pzProximoDestacadoHTML(livePosts'), 're-compone');
  assert.ok(seg.includes('cur.remove()'), 'sin próximo: se quita');
  assert.ok(seg.includes("insertAdjacentHTML('beforebegin', fresh)"), 'si aparece: se inserta');
});

t('CSS: foto sin cortar y resto de la grilla intacto', () => {
  assert.ok(cssSrc.includes('.hf-nextup-media') && cssSrc.includes('object-fit:contain'), 'contain');
  const gridW = (cssSrc.match(/\.hf-grid\{[^}]*\}/) || [''])[0];
  const gridP = (cssPri.match(/\.hf-grid\{[^}]*\}/) || [''])[0];
  assert.strictEqual(gridW, gridP, '.hf-grid intacto');
});

t('homeGridCompose y tiles intactos', () => {
  const block = (s) => { const a = s.indexOf('function homeGridCompose'); const b = s.indexOf('const HOME_REEL_SVG'); return s.slice(a, b); };
  assert.strictEqual(block(appSrc), block(appPri), 'composición sin tocar');
  assert.ok(appSrc.includes('function homeTileHTML'), 'tiles intactos');
});

t('M78: helpers nuevos definidos una vez y llamadores resueltos', () => {
  const count = (s, n) => (s.match(new RegExp('function ' + n, 'g')) || []).length;
  assert.strictEqual(count(appSrc, 'pzProximoDestacadoPost'), 1);
  assert.strictEqual(count(appSrc, 'pzProximoDestacadoHTML'), 1);
  assert.ok(appSrc.includes('pzProximoDestacadoHTML(allPosts, enHome)'), 'llamador inicioView');
  assert.ok(appSrc.includes('pzProximoDestacadoHTML(livePosts'), 'llamador vivo');
  assert.ok(appSrc.includes('pzProximoDestacadoPost(posts, new Date())'), 'llamador interno');
});

// (Liberación v588 · causa: BUILD v560–v587; el hecho del lote es que
// server no trae sus marcas.)
t('server.js sin marcas del lote', () => {
  const srvW = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.ok(!srvW.includes('pzProximoDestacado'), 'server intacto');
});

console.log(`\n${ok} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
