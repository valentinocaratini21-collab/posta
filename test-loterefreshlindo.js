// test-loterefreshlindo.js — LOTE REFRESH LINDO (2026-11-01).
// El pull-to-refresh deja de ser un indicador genérico y pasa a ser magia
// de Posty: un brote que CRECE con la distancia del tirón + destellos ✦ de
// 4 puntas (dorados #FEC14D y celestes #2793C8, nunca puntos ni polvo),
// ráfaga de esas mismas estrellas al soltar en el umbral, y brote asentado
// al completar. Sin cara, sin textos largos. El gesto, el umbral (72px),
// el progreso (tope 96), las guardas v524 y la acción de refresh NO cambian.
// Node puro, lee el árbol + vm con DOM falso (misma técnica que lotepull).
// Uso: node test-loterefreshlindo.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- Versiones + censo (re-base v600 -> v601, pines rotados con causa) ----------
t(srv.includes("const BUILD_ID = '20261101-v601'"), 'BUILD v601 en server.js');
t(idx.includes('app.js?v=405') && idx.includes('styles.css?v=20261117'), 'index: app 405 + styles 20261117 (pines rotados con causa: base v600 app 404/styles 20261116 +1)');
t(app.includes("const CHUNK_V = '20261101-v599'"), 'CHUNK_V sigue v599 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 17, 'censo server: marcador 17 (ruta espejo v582)');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6 (chats v566)');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- El bloque pull sigue siendo uno solo, sin duplicados ----------
const PULL_FNS = ['pzPullEl', 'pzPullIsFormControl', 'pzPullInInnerScroller', 'pzPullCanStart', 'pzPullArmCheck', 'pzPullProgress', 'pzPullShow', 'pzPullHide', 'pzPullInit', 'pzPullRefresh'];
for (const f of PULL_FNS) t(cnt(app, 'function ' + f) === 1, 'sin duplicados: ' + f + ' 1');
t(app.includes('pzPullInit();'), 'boot: pzPullInit tras render()');
t(app.includes("'/api/home/profile/refresh'"), 'cliente: llama /api/home/profile/refresh');
t(app.includes('pzCacheClear();'), 'cliente: vacía la caché GET en el refresh');
t(app.includes('BB.estado = null'), 'cliente: estado de oficina fuera antes del re-render');
t(app.includes('window.scrollTo(0, 0)'), 'cliente: vuelve arriba tras el refresh');

// ---------- M78: llamadas del bloque resuelven ----------
{
  const block = sliceFn(app, '// ===== PULL-TO-REFRESH =====', '// ===== /PULL-TO-REFRESH =====');
  t(block.length > 1000, 'bloque pull extraíble');
  const called = new Set();
  for (const m of block.matchAll(/\b(pz[A-Za-z0-9_]+)\s*\(/g)) called.add(m[1]);
  const missing = [];
  for (const f of called) {
    const def = app.includes('function ' + f + '(') || app.includes('function ' + f + ' ') || new RegExp('const ' + f + ' =').test(app) || new RegExp('let ' + f + ' =').test(app);
    if (!def) missing.push(f);
  }
  t(missing.length === 0, 'M78: llamadas del bloque resuelven (' + (missing.length ? missing.join(',') : 'todas') + ')');
}

// ---------- CSS: estructura del indicador ----------
t(css.includes('.pz-pull{position:fixed'), 'css: indicador fijo');
t(css.includes('.pz-pull.armed'), 'css: estado armado');
t(css.includes('.pz-pull.busy'), 'css: estado cargando');
t(css.includes('.pz-pull.done'), 'css: estado listo');
t(css.includes('.pz-pull-sprout'), 'css: brote presente');
t(css.includes('.pz-pull-spark'), 'css: destellos presentes');
t(css.includes('#FEC14D') && css.includes('#2793C8'), 'css: dorado y celeste de Posty');
t(/\.pz-pull-spark-1\{[^}]*#FEC14D/.test(css), 'css: destello 1 dorado');
t(/\.pz-pull-spark-2\{[^}]*#2793C8/.test(css), 'css: destello 2 celeste');
t(css.includes('@keyframes pzSparkTwinkle'), 'css: titileo de destellos');
t(css.includes('@keyframes pzSparkBurst'), 'css: ráfaga al soltar');
t(css.includes('@keyframes pzSproutSway'), 'css: balanceo suave cargando');
t(css.includes('@media (prefers-reduced-motion: reduce){.pz-pull{transition:none}}'), 'css: reduced-motion sin transición');
t(css.includes('@media (prefers-reduced-motion: reduce){.pz-pull-sprout,.pz-pull-spark{animation:none}}'), 'css: reduced-motion sin animaciones (estático)');
t(!/\.pz-pull[^{]*\{[^}]*display:\s*none/.test(css), 'css: el indicador no está display:none');
t(css.includes('rgba(255,255,255,.88)') && css.includes('backdrop-filter:blur(10px)'), 'css: vidrio coherente con el home (sirve en modo oscuro igual)');
t(!/prefers-color-scheme[^}]*\.pz-pull\s*\{[^}]*display:\s*none/.test(css), 'css: ningún modo oscuro esconde el indicador');
// Sin saltos de layout: las reglas de estado solo tocan opacidad,
// transform, animación, borde, fondo y sombra (nunca top/width/height/margin/padding/display).
{
  const stateRules = [...css.matchAll(/\.pz-pull\.(g1|g2|g3|armed|busy|done|burst)[^{]*\{[^}]*\}/g)].map((m) => m[0]);
  t(stateRules.length >= 10, 'css: reglas de estado presentes (' + stateRules.length + ')');
  const badProps = stateRules.filter((r) => /(top|left|width|height|margin|padding|display)\s*:/.test(r));
  t(badProps.length === 0, 'css: estados sin propiedades de layout (' + (badProps.length ? badProps.join(' | ') : 'limpio') + ')');
}

// ---------- vm: DOM falso mínimo (con setProperty) ----------
class El {
  constructor(tag, o) {
    o = o || {};
    this.tagName = (tag || 'div').toUpperCase();
    this.id = o.id || '';
    this.hidden = !!o.hidden;
    this.scrollHeight = o.scrollHeight || 0;
    this.clientHeight = o.clientHeight || 0;
    this.parentElement = o.parent || null;
    this.style = o.style || {};
    if (typeof this.style.setProperty !== 'function') {
      this.style.setProperty = function (k, v) { this[k] = v; };
    }
    this.innerHTML = '';
    this._cls = new Set(o.cls || []);
    this._oy = o.oy || 'visible';
    this.classList = {
      add: (c) => this._cls.add(c), remove: (c) => this._cls.delete(c),
      toggle: (c, f) => { if (f === undefined) { this._cls.has(c) ? this._cls.delete(c) : this._cls.add(c); } else if (f) this._cls.add(c); else this._cls.delete(c); },
      contains: (c) => this._cls.has(c),
    };
    this._closest = o.closest || null;
  }
  closest(sel) {
    let n = this;
    while (n) {
      if (this._closest && this._closest[sel]) return this._closest[sel];
      if (n._cls && [...n._cls].some((c) => sel === '.' + c)) return n;
      n = n.parentElement;
    }
    return null;
  }
  setAttribute() {}
}

function makeSandbox() {
  const body = new El('body');
  const appEl = new El('div', { id: 'app' });
  const byId = { app: appEl };
  const listeners = {};
  const state = { cacheCleared: false, rendered: false, scrolled: null, posted: null, timeouts: [] };
  const win = {
    scrollY: 0,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    getComputedStyle: (el) => ({ overflowY: el._oy || 'visible' }),
    scrollTo: (x, y) => { state.scrolled = [x, y]; },
  };
  const doc = {
    body,
    documentElement: new El('html'),
    activeElement: null,
    getElementById: (id) => byId[id] || null,
    querySelector: () => null,
    createElement: (tag) => {
      const el = new El(tag);
      el._created = true;
      return el;
    },
  };
  body.appendChild = (el) => { if (el.id === 'pzPull') byId.pzPull = el; };
  const sandbox = {
    window: win, document: doc, location: { hash: '#/app/inicio' },
    gzT: (es) => es,
    api: { post: async (u) => { state.posted = [u]; return { ok: true, refreshed: true }; } },
    render: async () => { state.rendered = true; },
    pzCacheClear: () => { state.cacheCleared = true; },
    BB: { estado: { x: 1 } },
    setTimeout: (fn) => { state.timeouts.push(fn); return 1; },
    console,
  };
  sandbox.window.document = doc;
  const block = sliceFn(app, '// ===== PULL-TO-REFRESH =====', '// ===== /PULL-TO-REFRESH =====');
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox);
  return { sb: sandbox, win, doc, body, appEl, byId, listeners, state };
}

async function main() {
  // --- El indicador se construye una vez: brote + 5 destellos ✦ ---
  {
    const s = makeSandbox();
    const el = s.sb.pzPullEl();
    t(!!el && el.id === 'pzPull', 'dom: pzPullEl crea #pzPull');
    t(el.innerHTML.includes('pz-pull-sprout') && el.innerHTML.includes('<svg'), 'dom: brote SVG presente');
    t(el.innerHTML.includes('#2793C8') && el.innerHTML.includes('#FEC14D'), 'dom: brote en celeste y dorado');
    t(cnt(el.innerHTML, 'pz-pull-spark pz-pull-spark-') === 5, 'dom: exactamente 5 destellos');
    t(cnt(el.innerHTML, '✦') === 5, 'dom: los 5 destellos son ✦ de 4 puntas');
    t(!el.innerHTML.includes('•') && !el.innerHTML.includes('ai-avatar') && !el.innerHTML.includes('chat-face'), 'dom: sin puntos, sin cara, sin avatar');
    t(!/Soltá|Actualiz|Deslizá|Release|Pull to refresh/.test(el.innerHTML), 'dom: sin textos largos en el indicador');
    t(s.sb.pzPullEl() === el, 'dom: segunda llamada devuelve el mismo elemento (no duplica)');
  }
  // --- Crecimiento por estados: g1 chico, g2 medio, g3 entero + armado ---
  {
    const s = makeSandbox();
    const el = s.sb.pzPullEl();
    s.sb.pzPullShow(20, false);
    t(el.classList.contains('on') && el.classList.contains('g1') && !el.classList.contains('g2') && !el.classList.contains('g3'), 'crece: 20px → g1 (brote chico)');
    t(el.style['--pz-pull-p'] === '0.208', 'crece: 20px → variable 0.208 (got ' + el.style['--pz-pull-p'] + ')');
    s.sb.pzPullShow(50, false);
    t(el.classList.contains('g2') && !el.classList.contains('g1') && !el.classList.contains('g3') && !el.classList.contains('armed'), 'crece: 50px → g2 (medio, sin armar)');
    t(el.style['--pz-pull-p'] === '0.521', 'crece: 50px → variable 0.521');
    s.sb.pzPullShow(80, true);
    t(el.classList.contains('g3') && el.classList.contains('armed') && el.classList.contains('on'), 'crece: 80px → g3 + armado (umbral 72px)');
    t(el.style['--pz-pull-p'] === '0.833', 'crece: 80px → variable 0.833');
    s.sb.pzPullShow(96, true);
    t(el.style['--pz-pull-p'] === '1.000', 'crece: 96px → variable 1.000 (tope)');
    s.sb.pzPullHide();
    t(!el.classList.contains('on') && !el.classList.contains('g3') && !el.classList.contains('armed') && el.style['--pz-pull-p'] === '0', 'resetea: hide limpia clases y variable');
  }
  // --- Ráfaga al soltar, carga y asentado (ciclo completo) ---
  {
    const s = makeSandbox();
    s.sb.pzPullInit();
    const p = s.sb.pzPullRefresh();
    const el = s.byId.pzPull;
    t(!!el && el.classList.contains('burst') && el.classList.contains('busy') && el.classList.contains('g3'), 'soltar: ráfaga + cargando + brote entero');
    t(el.style['--pz-pull-p'] === '1.000', 'soltar: brote a tamaño completo');
    t(s.state.timeouts.length === 1, 'soltar: programa quitar-ráfaga (500 ms)');
    s.state.timeouts[0]();
    t(!el.classList.contains('burst') && el.classList.contains('busy'), 'cargando: sin burst, sigue cargando (titileo suave)');
    await p;
    await new Promise((r) => setTimeout(r, 0));
    t(el.classList.contains('done') && !el.classList.contains('busy'), 'listo: brote asentado, sin busy');
    t(el.style['--pz-pull-p'] === '1.000', 'listo: brote entero asentado');
    t(s.state.posted && s.state.posted[0] === '/api/home/profile/refresh', 'refresh: pide re-lectura fresca');
    t(s.state.cacheCleared === true && s.state.rendered === true, 'refresh: vacía caché y re-renderiza');
    t(s.sb.BB.estado === null, 'refresh: estado de oficina fuera');
    t(s.state.scrolled && s.state.scrolled[0] === 0 && s.state.scrolled[1] === 0, 'refresh: vuelve arriba');
    t(s.state.timeouts.length === 2, 'listo: programa el fade (750 ms)');
    s.state.timeouts[1]();
    t(!el.classList.contains('on') && !el.classList.contains('done'), 'fade: tras el fade, el indicador se esconde');
  }
  // --- Guardas v524 intactas (muestra; la suite completa vive en lotepull) ---
  {
    const mk = () => makeSandbox();
    let s = mk();
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === true, 'guardas: caso feliz en Inicio');
    s = mk(); s.doc.activeElement = new El('input');
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'guardas: escribiendo no arranca');
    s = mk(); s.body.classList.add('mz-sheet-open');
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'guardas: hoja abierta no arranca');
    s = mk();
    const sliderBtn = new El('button', { parent: s.appEl, cls: ['mx-slider'] });
    t(s.sb.pzPullCanStart({ target: sliderBtn }) === false, 'guardas: slider del jardín no arranca');
    s = mk();
    const chatBox = new El('div', { parent: s.appEl, oy: 'auto', scrollHeight: 600, clientHeight: 320 });
    t(s.sb.pzPullCanStart({ target: new El('p', { parent: chatBox }) }) === false, 'guardas: scroller interno no arranca');
    s = mk(); s.win.scrollY = 100;
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'guardas: con scroll bajado no arranca');
  }
  // --- En más de una pantalla: el mismo indicador, mismo gesto ---
  {
    for (const h of ['#/app/inicio', '#/app/schedule', '#/app/analisis']) {
      const s = makeSandbox();
      s.sb.location.hash = h;
      t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === true, 'pantallas: arranca en ' + h);
      const el = s.sb.pzPullEl();
      s.sb.pzPullShow(80, true);
      t(el.classList.contains('g3') && el.innerHTML.includes('pz-pull-sprout'), 'pantallas: brote g3 en ' + h);
    }
  }
  // --- Umbral y progreso intactos ---
  {
    const s = makeSandbox();
    t(s.sb.pzPullArmCheck(72, 0) === true && s.sb.pzPullArmCheck(71, 0) === false, 'umbral: 72 arma, 71 no');
    t(s.sb.pzPullProgress(200) === 96 && s.sb.pzPullProgress(-5) === 0, 'progreso: tope 96, negativo 0');
  }
  console.log(`\nloterefreshlindo: ${ok} ok, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
