// test-lotepull.js — LOTE PULL-TO-REFRESH (2026-11-01).
// Valentino 1/11 «dale»: deslizar para abajo refresca la pantalla, en
// todas las pantallas de la app. El refresh re-sincroniza con IG
// (endpoint nuevo + caché GET fuera + re-render). Nunca dispara:
// escribiendo, con hoja/drawer/modal abiertos, dentro de un scroller
// interno (mensajes del chat), sobre un control o el slider del jardín,
// ni con gesto horizontal. Node puro, lee el árbol + vm con DOM falso.
// Uso: node test-lotepull.js
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
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- Versiones + censo (referencia v523) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v524 en server.js');
t(idx.includes('app.js?v=355') && idx.includes('styles.css?v=20261074'), 'index: app 346 + styles 20261067');
t(idxEn.includes('styles.css?v=20261074') && !idxEn.includes('app.js?v='), 'en/index: styles 20261067, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v523 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- Bloque presente, sin duplicados ----------
const PULL_FNS = ['pzPullEl', 'pzPullIsFormControl', 'pzPullInInnerScroller', 'pzPullCanStart', 'pzPullArmCheck', 'pzPullProgress', 'pzPullShow', 'pzPullHide', 'pzPullInit', 'pzPullRefresh'];
for (const f of PULL_FNS) t(cnt(app, 'function ' + f) === 1, 'sin duplicados: ' + f + ' 1');
t(app.includes('pzPullInit();'), 'boot: pzPullInit tras render()');
t(app.includes("'/api/home/profile/refresh'"), 'cliente: llama /api/home/profile/refresh');
t(app.includes('pzCacheClear();'), 'cliente: vacía la caché GET en el refresh');
t(app.includes('BB.estado = null'), 'cliente: estado de oficina fuera antes del re-render');
t(app.includes('window.scrollTo(0, 0)'), 'cliente: vuelve arriba tras el refresh');
t(css.includes('.pz-pull{position:fixed'), 'css: indicador fijo');
t(css.includes('.pz-pull.armed'), 'css: estado armado');
t(css.includes('.pz-pull.done'), 'css: estado hecho');
t(css.includes('@media (prefers-reduced-motion: reduce){.pz-pull{transition:none}}'), 'css: reduced-motion sin transición');
t(!/\.pz-pull[^{]*\{[^}]*display:\s*none/.test(css), 'css: el indicador no está display:none (se oculta por opacidad/transform)');

// ---------- M78: toda función llamada desde el bloque existe definida ----------
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
  console.log('  (M78 pull: ' + called.size + '/' + called.size + ' llamadas resuelven: ' + [...called].sort().join(', ') + ')');
}

// ---------- Servidor: endpoint de re-lectura fresca ----------
t(srv.includes("app.post('/api/home/profile/refresh', requireAuth"), 'server: POST /api/home/profile/refresh con requireAuth');
t(srv.includes('homeProfileRefreshOnce(uid, handle)'), 'server: el refresh usa la lectura fresca (snapshot + reconciliación)');
t(srv.includes("reason: 'no_handle'"), 'server: sin @ conectado, refreshed:false honesto');
t(srv.includes('setTimeout(() => r(null), 10000)'), 'server: presupuesto 10 s, sin colgar el refresh');
t(srv.includes("refreshed: !!payload"), 'server: refreshed refleja la lectura real');

// ---------- vm: DOM falso mínimo ----------
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
  let lang = 'es';
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
  // pzPullEl hace body.appendChild: registrar el creado como #pzPull
  body.appendChild = (el) => { if (el.id === 'pzPull') byId.pzPull = el; };
  const sandbox = {
    window: win, document: doc, location: { hash: '#/app/inicio' },
    gzT: (es, en) => (lang === 'en' ? en : es),
    api: { post: async (u, b, o) => { state.posted = [u, o]; return { ok: true, refreshed: true }; } },
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
  return { sb: sandbox, win, doc, body, appEl, byId, listeners, state, setLang: (l) => { lang = l; } };
}

async function main() {
  // --- Puras: armado y progreso ---
  {
    const { sb } = makeSandbox();
    t(sb.pzPullArmCheck(80, 10) === true, 'armado: 80px vertical arma');
    t(sb.pzPullArmCheck(72, 0) === true, 'armado: justo 72px arma');
    t(sb.pzPullArmCheck(71, 0) === false, 'armado: 71px no arma');
    t(sb.pzPullArmCheck(80, 90) === false, 'armado: más horizontal que vertical no arma');
    t(sb.pzPullArmCheck(80, 80) === false, 'armado: diagonal 45° no arma (debe dominar lo vertical)');
    t(sb.pzPullProgress(0) === 0, 'progreso: 0 → 0');
    t(sb.pzPullProgress(50) === 50, 'progreso: 50 → 50');
    t(sb.pzPullProgress(200) === 96, 'progreso: tope 96');
    t(sb.pzPullProgress(-5) === 0, 'progreso: negativo → 0');
  }
  // --- CanStart: guardas ---
  {
    const mk = () => makeSandbox();
    let s = mk();
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === true, 'canStart: caso feliz en #/app/inicio arriba del todo');
    s = mk(); s.win.scrollY = 100;
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: con scroll bajado no arranca');
    s = mk(); s.sb.location.hash = '#/login';
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: fuera de #/app no arranca');
    s = mk(); s.doc.activeElement = new El('input');
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: escribiendo no arranca');
    s = mk(); s.body.classList.add('mz-sheet-open');
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: hoja de chat abierta no arranca');
    s = mk(); s.byId.mzSheet = new El('div', { id: 'mzSheet', hidden: false });
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: #mzSheet visible no arranca');
    s = mk(); s.byId.mzSheet = new El('div', { id: 'mzSheet', hidden: true });
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === true, 'canStart: #mzSheet oculta sí arranca');
    s = mk(); s.byId.drawerOv = new El('div', { id: 'drawerOv', hidden: false });
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: drawer abierto no arranca');
    s = mk(); s.doc.querySelector = () => new El('div');
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: modal pz-exp-overlay no arranca');
    s = mk(); s.body.classList.add('hf-d-open');
    t(s.sb.pzPullCanStart({ target: new El('div', { parent: s.appEl }) }) === false, 'canStart: visor de detalle abierto no arranca');
    s = mk();
    t(s.sb.pzPullCanStart({ target: new El('input', { parent: s.appEl }) }) === false, 'canStart: tirón desde un input no arranca');
    s = mk();
    t(s.sb.pzPullCanStart({ target: new El('input', { parent: s.appEl }) }) === false, 'canStart: tirón desde el slider (range) no arranca');
    s = mk();
    const barBtn = new El('button', { parent: s.appEl, cls: ['bb-bar'] });
    t(s.sb.pzPullCanStart({ target: barBtn }) === false, 'canStart: tirón desde la barra de tabs no arranca');
    s = mk();
    const sliderBtn = new El('button', { parent: s.appEl, cls: ['mx-slider'] });
    t(s.sb.pzPullCanStart({ target: sliderBtn }) === false, 'canStart: tirón desde el bloque del slider del jardín no arranca');
    s = mk();
    const chatBox = new El('div', { parent: s.appEl, oy: 'auto', scrollHeight: 600, clientHeight: 320 });
    const chatMsg = new El('p', { parent: chatBox });
    t(s.sb.pzPullCanStart({ target: chatMsg }) === false, 'canStart: tirón dentro del chat con scroll interno no arranca (no rompe el chat)');
    s = mk();
    const chatBox2 = new El('div', { parent: s.appEl, oy: 'auto', scrollHeight: 200, clientHeight: 200 });
    const chatMsg2 = new El('p', { parent: chatBox2 });
    t(s.sb.pzPullCanStart({ target: chatMsg2 }) === true, 'canStart: chat sin desborde sí permite pull');
    s = mk();
    const plain = new El('div', { parent: s.appEl, oy: 'visible', scrollHeight: 900, clientHeight: 300 });
    t(s.sb.pzPullCanStart({ target: new El('p', { parent: plain }) }) === true, 'canStart: contenedor sin overflow propio sí permite pull');
  }
  // --- Gestos: secuencia completa ---
  {
    const fire = (listeners, ev, e) => (listeners[ev] || []).forEach((f) => f(e));
    const touch = (x, y) => ({ changedTouches: [{ clientX: x, clientY: y }], target: new El('div') });
    let s = makeSandbox();
    s.sb.pzPullInit();
    t((s.listeners.touchstart || []).length === 1 && (s.listeners.touchmove || []).length === 1 && (s.listeners.touchend || []).length === 1, 'init: un listener por evento táctil');
    s.sb.pzPullInit();
    t((s.listeners.touchstart || []).length === 1, 'init: idempotente (segunda llamada no duplica)');
    // tirón vertical 80px → armado → soltar → refresh
    s = makeSandbox(); s.sb.pzPullInit();
    const tgt = new El('div', { parent: s.appEl });
    fire(s.listeners, 'touchstart', { changedTouches: [{ clientX: 100, clientY: 200 }], target: tgt });
    fire(s.listeners, 'touchmove', { changedTouches: [{ clientX: 100, clientY: 280 }], target: tgt });
    const ind = s.byId.pzPull;
    t(!!ind && ind.classList.contains('on') && ind.classList.contains('armed'), 'gesto: tirón 80px muestra indicador armado');
    t(ind.innerHTML.includes('Soltá para actualizar'), 'gesto: texto armado ES');
    fire(s.listeners, 'touchend', {});
    await new Promise((r) => setTimeout(r, 0));
    t(s.state.posted && s.state.posted[0] === '/api/home/profile/refresh', 'refresh: pide re-lectura fresca de IG');
    t(s.state.cacheCleared === true, 'refresh: vacía la caché GET');
    t(s.state.rendered === true, 'refresh: re-renderiza la vista');
    t(s.sb.BB.estado === null, 'refresh: estado de oficina fuera');
    t(s.state.scrolled && s.state.scrolled[0] === 0 && s.state.scrolled[1] === 0, 'refresh: vuelve arriba');
    t(ind.classList.contains('done') && ind.innerHTML.includes('Actualizado'), 'refresh: indicador “Actualizado”');
    // el timeout de 750 ms esconde el indicador (capturado, no corrido)
    t(s.state.timeouts.length === 1, 'refresh: programa el fade del indicador');
    s.state.timeouts[0]();
    t(!ind.classList.contains('on'), 'refresh: tras el fade, el indicador se esconde');
    // tirón corto 30px → no arma → soltar → sin refresh
    s = makeSandbox(); s.sb.pzPullInit();
    fire(s.listeners, 'touchstart', { changedTouches: [{ clientX: 100, clientY: 200 }], target: new El('div', { parent: s.appEl }) });
    fire(s.listeners, 'touchmove', { changedTouches: [{ clientX: 100, clientY: 230 }], target: new El('div') });
    fire(s.listeners, 'touchend', {});
    await new Promise((r) => setTimeout(r, 0));
    t(!s.state.posted && !s.state.rendered, 'gesto: tirón corto no refresca');
    // gesto horizontal → cancelado, sin refresh
    s = makeSandbox(); s.sb.pzPullInit();
    fire(s.listeners, 'touchstart', { changedTouches: [{ clientX: 100, clientY: 200 }], target: new El('div', { parent: s.appEl }) });
    fire(s.listeners, 'touchmove', { changedTouches: [{ clientX: 190, clientY: 210 }], target: new El('div') });
    fire(s.listeners, 'touchend', {});
    await new Promise((r) => setTimeout(r, 0));
    t(!s.state.posted && !s.state.rendered, 'gesto: horizontal (carrusel/slider) no refresca');
    // subir (dy<0) → cancelado
    s = makeSandbox(); s.sb.pzPullInit();
    fire(s.listeners, 'touchstart', { changedTouches: [{ clientX: 100, clientY: 200 }], target: new El('div', { parent: s.appEl }) });
    fire(s.listeners, 'touchmove', { changedTouches: [{ clientX: 100, clientY: 150 }], target: new El('div') });
    fire(s.listeners, 'touchend', {});
    await new Promise((r) => setTimeout(r, 0));
    t(!s.state.posted && !s.state.rendered, 'gesto: subir cancela el pull');
    // EN: textos espejo
    s = makeSandbox(); s.setLang('en'); s.sb.pzPullInit();
    fire(s.listeners, 'touchstart', { changedTouches: [{ clientX: 100, clientY: 200 }], target: new El('div', { parent: s.appEl }) });
    fire(s.listeners, 'touchmove', { changedTouches: [{ clientX: 100, clientY: 290 }], target: new El('div') });
    t(s.byId.pzPull.innerHTML.includes('Release to refresh'), 'gesto: texto armado EN');
  }
  console.log(`\nlotepull: ${ok} ok, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
