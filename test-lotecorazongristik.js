// test-lotecorazongristik.js — LOTE CORAZÓN-GRIS-TIK + ENMIENDA SIN-REFRESH
// Reporte Valentino 2/11 ~06:45: al likear, el posteo «desaparecía» del
// feed. Diagnóstico verificado en v544: NO se borra — hfTileApprove
// hacía render() completo y el orden v513 lo movía a su posición
// nueva sin que la vista lo siguiera.
// CORRECCIÓN Valentino 2/11 ~06:50: SIN GRIS — el aprobado NO debe
// parecer archivado: queda entre los próximos, con chapita día+hora,
// foto A TODO COLOR; la marca es solo el tik verde + corazón lleno.
// ENMIENDA Valentino 2/11 ~07:22 (SUPERSEDE render+scroll): al aprobar,
// el tile se actualiza EN SU LUGAR (pzAprobarEnSitio) — corazón lleno,
// tik verde, chapita si cambió la fecha — SIN render() ni salto. El
// re-orden v513 ocurre en el próximo render natural, no en el toque.
// Uso: node test-lotecorazongristik.js [dir]  (dir = raíz del árbol; default: __dirname)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label, extra) => { if (cond) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ FALLO: ' + label + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

console.log('— 1. Estáticas: fix presente, gris ANULADO, enmienda presente —');
ok(app.includes('LOTE CORAZÓN-GRIS-TIK'), 'marca del lote en app.js');
ok(css.includes('LOTE CORAZÓN-GRIS-TIK'), 'marca del lote en styles.css');
ok(css.includes('CORRECCIÓN VALENTINO 2/11: SIN GRIS'), 'marcador de corrección sin-gris en css');
ok(app.includes('ENMIENDA SIN-REFRESH'), 'marca de la enmienda en app.js');
ok(!app.includes('hf-tile-aprobado'), 'sin clase gris en app.js (anulada)');
ok(!css.includes('.hf-tile.hf-tile-aprobado'), 'sin reglas gris en styles.css (anulada; el grayscale preexistente de zonas/slider no se toca)');
for (const h of ['pzAprobadosLeer', 'pzAprobadoEs', 'pzAprobadoMarcar', 'pzAprobarEnSitio'])
  ok(cnt(app, 'function ' + h + '(') === 1, 'helper definido 1 vez: ' + h);
for (const h of ['pzScrollATile', 'pzRenderYScroll', 'pzAprobarListo'])
  ok(cnt(app, 'function ' + h + '(') === 0, 'helper viejo ELIMINADO con causa: ' + h);
ok(!app.includes('pzScrollATile') && !app.includes('pzRenderYScroll') && !app.includes('pzAprobarListo'), 'cero menciones de helpers viejos en app.js');
ok(app.includes("const tikSpan = hfAprobado ? '<span class=\"hf-tik"), 'tikSpan en homeTileHTML');
ok(app.includes("(typeof pzAprobadoEs === 'function')"), 'guardia typeof: harnesses viejos no rompen');
ok(app.includes("${likeInStrip ? '' : likeBtn}${tikSpan}</span></span>`;"), 'tik DESPUÉS del botón/slot, hijo de la tile (CORAZÓN-EN-LÍNEA 2/11: con chapita el botón vive en la franja y el slot queda vacío; el tik sigue cerrando la tile, arriba-izquierda)');
ok(app.includes("${glyph}${despChip}${talkBtn}${likeInStrip ? '' : likeBtn}"), 'prefijo despChip+botón intacto (CORAZÓN-EN-LÍNEA 2/11: sin chapita el botón sigue hijo directo tras despChip; con chapita vive en la franja; HABLAR 2/11: el botón 💬 precede al corazón, la regla no cambia)');
ok(css.includes('.hf-tik{') && css.includes('background:#1FA855') && css.includes('top:6px') && css.includes('left:6px'), 'CSS tik verde arriba-izquierda');
ok(cnt(app, '!pzAprobarEnSitio(tile, id') === 2, 'salida en-sitio 2 veces (scheduled + draft-ok)');
ok(cnt(app, "typeof pzAprobarEnSitio === 'function'") === 2, 'guardia en las 2 salidas: sin helper, igual renderiza (fallback)');
{
  const fnStart = app.indexOf('async function hfTileApprove(');
  const fn = app.slice(fnStart, app.indexOf('\n}\n', fnStart));
  const iWarn = fn.indexOf("res.warning === 'sin_dia_libre'");
  const iSitio = fn.indexOf('pzAprobarEnSitio(tile, id', iWarn);
  ok(iWarn >= 0 && iSitio > iWarn && fn.slice(iWarn, iSitio).includes('return;'), 'warning retorna ANTES de marcar (sin_dia_libre no marca)');
  ok(!fn.includes('pzRenderYScroll') && !fn.includes('pzAprobarListo'), 'hfTileApprove: sin rastro del enfoque render+scroll');
  ok(cnt(fn, 'render();') === 5, 'hfTileApprove: render() solo 5 veces (warning 1 + fallback 2 por rama, nunca en éxito)');
}
{
  const hs = app.indexOf('function pzAprobarEnSitio(');
  const he = app.indexOf('\n}\n', hs);
  const hb = app.slice(hs, he);
  ok(!hb.includes('scrollIntoView'), 'pzAprobarEnSitio: sin scroll (el tile no se mueve)');
  ok(!hb.includes('render();') && !hb.includes('typeof render'), 'pzAprobarEnSitio: nunca llama a render()');
  ok(hb.includes("data-hf-on', '1'") && hb.includes("aria-pressed', 'true'"), 'pzAprobarEnSitio: corazón lleno (data-hf-on + aria-pressed)');
  ok(hb.includes('hf-tik') && hb.includes("dataset.status = 'scheduled'"), 'pzAprobarEnSitio: tik + status scheduled en el nodo');
  ok(hb.includes('hfWhenChip') && hb.includes('hfTileChipParts') && hb.includes('hf-strip'), 'pzAprobarEnSitio: chapita desde hfWhenChip en .hf-strip');
  ok(hb.includes('return false') && hb.includes('return true'), 'pzAprobarEnSitio: false si falta el nodo (fallback a render), true si actualizó');
}
ok(!srv.includes('LOTE CORAZÓN-GRIS-TIK'), 'server.js sin tocar');
ok(cnt(srv, 'catsMatch') === 3 && cnt(srv, 'week-redo') === 16 && cnt(srv, 'first_week') === 3 && cnt(srv, '/' + 'aprobar') === 16, 'censo server 3/16/3/16');
ok(cnt(app, 'pzGoBack') === 4 && cnt(app, 'pz-detalle-setup') === 1 && cnt(app, '/' + 'aprobar') === 1 && cnt(app, 'autofetch') === 0 && cnt(app, 'pcDayKeyShift') === 7, 'censo app 4/1/1/0/7');

console.log('— 2. M78: llamadas resuelven a definiciones —');
ok(app.includes("pzAprobadoEs(p.id)"), 'homeTileHTML llama pzAprobadoEs');
ok(cnt(app, 'pzAprobadosLeer()') >= 2, 'pzAprobadosLeer llamada desde Es y Marcar');
ok(app.includes('pzAprobadoMarcar(id)') && app.includes('hfWhenChip({ scheduled_at: schedAt })'), 'pzAprobarEnSitio llama Marcar + hfWhenChip');

console.log('— 3. Render homeTileHTML real (vm): aprobado visible, a color, con tik —');
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
const store = {};
const sb = { console, ME: { lang: 'es' }, Intl, Date, Map, Set,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  matchMedia: () => ({ matches: false }) };
sb.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
sb.pzIc = (name) => `<i data-ic="${name}"></i>`;
sb.hfCoverState = () => ({ has: false });
sb.slotHour = () => 19;
sb.mv = (p) => p;
vm.createContext(sb);
vm.runInContext('let PZ_APROBADOS = null;', sb);
for (const n of ['pcDayKeyShift', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts', 'homeTileHTML', 'pzAprobadosLeer', 'pzAprobadoEs', 'pzAprobadoMarcar', 'pzAprobarEnSitio']) {
  const code = extractFn(app, n);
  ok(code.length > 0, 'existe ' + n);
  if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
}
for (const n of ['HOME_PIN_SVG', 'HOME_REEL_SVG', 'HOME_CAR_SVG']) {
  const a = app.indexOf('const ' + n + '=');
  if (a >= 0) { const b = app.indexOf(';', a); vm.runInContext(app.slice(a, b + 1).replace('const ' + n + ' =', 'globalThis.' + n + ' ='), sb); }
}
const render = (o, i) => vm.runInContext(`homeTileHTML(${JSON.stringify(o)}, ${i || 0})`, sb);
const mark = (id) => vm.runInContext(`pzAprobadoMarcar(${id})`, sb);
const sched = (id) => ({ kind: 'post', post: { id, status: 'scheduled', scheduled_at: '2026-11-05T19:00:00Z', media_type: 'image', image_path: 'fotos/x.jpg', caption: 'promo' } });
{
  mark(301);
  const h = render(sched(301));
  ok(h.includes('hf-tik') && h.includes('✓'), 'scheduled marcado: tik verde presente');
  ok(h.includes('data-hf-on="1"'), 'scheduled marcado: corazón lleno intacto');
  ok(h.includes('hf-chip'), 'scheduled marcado: chapita día+hora intacta');
  ok(h.includes('<img'), 'scheduled marcado: foto presente');
  ok(!h.includes('grayscale'), 'scheduled marcado: foto SIN filtro gris');
  ok(!h.includes('Archivado'), 'scheduled marcado: sin tratamiento de archivado');
}
{
  const h = render(sched(302));
  ok(!h.includes('hf-tik'), 'scheduled SIN marcar: sin tik');
  ok(h.includes('data-hf-on="1"'), 'scheduled SIN marcar: corazón lleno igual (v544)');
}
{
  mark(303);
  const h = render({ kind: 'post', day: '2026-11-06', post: { id: 303, status: 'draft', media_type: 'image', image_path: 'fotos/y.jpg', caption: 'borrador' } });
  ok(h.includes('hf-tik'), 'draft marcado: tik presente (sigue sin salir)');
}
{
  mark(304);
  const h = render({ kind: 'post', post: { id: 304, status: 'published', media_type: 'image', image_path: 'fotos/z.jpg', caption: 'salió' } });
  ok(!h.includes('hf-tik'), 'published marcado: sin tik (el tik es solo mientras no sale)');
}
{
  const h = render({ kind: 'ig', img: 'fotos/ig.jpg', type: 'image' });
  ok(!h.includes('hf-tik'), 'tile IG: sin tik, sin crash');
}
{
  mark(305);
  const h1 = render(sched(305)), h2 = render(sched(305));
  ok(cnt(h1, 'hf-tik') === 1 && cnt(h2, 'hf-tik') === 1, 'segundo toque/re-render: tik único, no duplica');
}
{
  mark(777);
  ok(store['posta-aprobados'] && store['posta-aprobados'].includes('777'), 'persistido en localStorage');
  vm.runInContext('PZ_APROBADOS = null;', sb);
  ok(vm.runInContext('pzAprobadoEs(777)', sb) === true, 'tras reset de memoria: sigue marcado');
  ok(vm.runInContext('pzAprobadoEs(778)', sb) === false, 'id nunca marcado: no marcado');
}

console.log('— 3b. Sin helpers cargados (harness viejo): no rompe —');
{
  const sb2 = { console, ME: { lang: 'es' }, Intl, Date, Map, Set };
  sb2.esc = sb.esc; sb2.gzT = sb.gzT; sb2.pzIc = sb.pzIc; sb2.hfCoverState = sb.hfCoverState; sb2.slotHour = sb.slotHour; sb2.mv = sb.mv;
  vm.createContext(sb2);
  for (const n of ['pcDayKeyShift', 'hfWhenChip', 'hfPlanChip', 'hfTileChipParts', 'homeTileHTML']) {
    const code = extractFn(app, n);
    if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb2);
  }
  for (const n of ['HOME_PIN_SVG', 'HOME_REEL_SVG', 'HOME_CAR_SVG']) {
    const a = app.indexOf('const ' + n + '=');
    if (a >= 0) { const b = app.indexOf(';', a); vm.runInContext(app.slice(a, b + 1).replace('const ' + n + ' =', 'globalThis.' + n + ' ='), sb2); }
  }
  let h2 = null, threw = false;
  try { h2 = vm.runInContext(`homeTileHTML(${JSON.stringify(sched(302))}, 0)`, sb2); } catch (e) { threw = true; }
  ok(!threw && h2 && !h2.includes('hf-tik'), 'sin helpers: renderiza sin tik y sin excepción (marca/lotecorazon no se rompen)');
}

console.log('— 4. En-sitio real (vm + DOM falso): aprobar NO renderiza, el nodo cambia ahí —');
// Mini-DOM: solo lo que toca pzAprobarEnSitio.
class FE {
  constructor(cls, attrs) {
    this.children = []; this.parent = null;
    this._cls = new Set((cls || '').split(' ').filter(Boolean));
    this.dataset = {}; this.attrs = Object.assign({}, attrs || {}); this._rawHtml = '';
    this.classList = { contains: (c) => this._cls.has(c), add: (c) => { this._cls.add(c); }, remove: (c) => { this._cls.delete(c); } };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  querySelector(sel) {
    const m = sel.match(/^\.([A-Za-z0-9_-]+)(?:\[data-post-id="([^"]+)"\])?$/);
    if (!m) return null;
    const cls = m[1], pid = m[2];
    const walk = (node) => {
      for (const ch of node.children) {
        if (ch._cls.has(cls) && (pid === undefined || String(ch.dataset.postId) === pid)) return ch;
        const r = walk(ch); if (r) return r;
      }
      return null;
    };
    return walk(this);
  }
  insertAdjacentHTML(pos, html) {
    const node = new FE('');
    const cm = html.match(/class="([^"]+)"/);
    if (cm) cm[1].split(' ').forEach((c) => node._cls.add(c));
    node._rawHtml = html;
    if (pos === 'afterend' && this.parent) { const i = this.parent.children.indexOf(this); this.parent.children.splice(i + 1, 0, node); node.parent = this.parent; }
    else if (pos === 'beforeend') this.appendChild(node);
    else if (pos === 'afterbegin') { this.children.unshift(node); node.parent = this; }
  }
}
Object.defineProperty(FE.prototype, 'outerHTML', {
  set(html) {
    const node = new FE('');
    const cm = html.match(/class="([^"]+)"/);
    if (cm) cm[1].split(' ').forEach((c) => node._cls.add(c));
    node._rawHtml = html;
    if (this.parent) { const i = this.parent.children.indexOf(this); this.parent.children.splice(i, 1, node); node.parent = this.parent; }
    this._replacedBy = node;
  },
  get() { return this._rawHtml || ''; }
});
const countCls = (node, cls) => {
  let n = node._cls.has(cls) ? 1 : 0;
  for (const ch of node.children) n += countCls(ch, cls);
  return n;
};
function makeTile(id, status, chipHtml) {
  const tile = new FE('hf-tile' + (status === 'draft' ? ' hf-tile-draft' : ''));
  tile.dataset.postId = String(id); tile.dataset.status = status; tile.dataset.schedAt = '';
  const strip = new FE('hf-strip');
  const chip = new FE('hf-chip'); chip._rawHtml = chipHtml || '';
  strip.appendChild(chip);
  const like = new FE('hf-like hf-like-in'); like.setAttribute('aria-pressed', 'false');
  tile.appendChild(strip); tile.appendChild(like);
  return { tile, strip, like };
}
sb.document = { querySelector: () => null };
{
  // Draft con chapita de plan -> aprobado con fecha real: corazón, tik, chapita nueva, mismo nodo.
  const { tile } = makeTile(401, 'draft', 'PLAN-VIEJO');
  sb.tile401 = tile;
  const txt = vm.runInContext('hfWhenChip({ scheduled_at: "2026-11-06T19:00:00Z" })', sb);
  const hm = String(txt).split(' · ')[1] || '';
  let r = null, threw = false;
  try { r = vm.runInContext('pzAprobarEnSitio(tile401, "401", "2026-11-06T19:00:00Z")', sb); } catch (e) { threw = true; }
  ok(!threw && r === true, 'en-sitio draft: devuelve true, sin excepción');
  ok(tile.querySelector('.hf-like').getAttribute('data-hf-on') === '1' && tile.querySelector('.hf-like').getAttribute('aria-pressed') === 'true', 'en-sitio: corazón lleno (data-hf-on + aria-pressed)');
  ok(countCls(tile, 'hf-tik') === 1, 'en-sitio: tik verde agregado, único');
  ok(tile.dataset.status === 'scheduled' && tile.dataset.schedAt === '2026-11-06T19:00:00Z', 'en-sitio: dataset actualizado a scheduled + fecha real');
  ok(!tile._cls.has('hf-tile-draft'), 'en-sitio: ya no es borrador (sin borde punteado)');
  const chipNow = tile.querySelector('.hf-strip').querySelector('.hf-chip');
  ok(chipNow && chipNow._rawHtml.includes('hf-chip-day') && hm && chipNow._rawHtml.includes(hm), 'en-sitio: chapita reemplazada con día+hora reales (' + hm + ')');
  ok(chipNow && !chipNow._rawHtml.includes('PLAN-VIEJO'), 'en-sitio: la chapita vieja de plan ya no está');
  ok(vm.runInContext('pzAprobadoEs("401")', sb) === true, 'en-sitio: queda marcado (el próximo render natural pinta el tik)');
  // Segundo toque: tik no duplica, nodo sigue siendo el mismo.
  vm.runInContext('pzAprobarEnSitio(tile401, "401", "2026-11-06T19:00:00Z")', sb);
  ok(countCls(tile, 'hf-tik') === 1, 'en-sitio segundo toque: tik sigue único');
}
{
  // Scheduled sin fecha nueva: corazón + tik, chapita intacta.
  const { tile } = makeTile(402, 'scheduled', 'CHIP-VIEJA');
  sb.tile402 = tile;
  const r = vm.runInContext('pzAprobarEnSitio(tile402, "402", null)', sb);
  ok(r === true, 'en-sitio scheduled: devuelve true');
  ok(countCls(tile, 'hf-tik') === 1, 'en-sitio scheduled: tik agregado');
  ok(tile.querySelector('.hf-strip').querySelector('.hf-chip')._rawHtml === 'CHIP-VIEJA', 'en-sitio scheduled sin fecha: chapita intacta');
}
{
  // Nodo ausente: false, sin excepción (el llamador hace render()).
  let r = null, threw = false;
  try { r = vm.runInContext('pzAprobarEnSitio(null, "999", null)', sb); } catch (e) { threw = true; }
  ok(!threw && r === false, 'en-sitio nodo ausente: false sin excepción (fallback a render)');
}

console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
process.exit(fail ? 1 : 0);
