// TIK-EN-CORAZON (5/11 ~11:03) — regresión sobre el bundle REAL.
// Decisión Valentino (captura del 518 aprobado): el tic verde va EN EL MISMO
// LUGAR que el corazón. Fundamento: un estado, un lugar.
// (SACAR-CORAZÓN 6/11 · SUPERSEDE lo del corazón: el corazón SALE del feed;
// la aprobación vive solo en el ritual [Sale así].) MÁQUINA DE ESTADOS,
// UN SOLO SLOT (el tik, sin corazón en ningún estado):
//   pendiente (draft/scheduled sin aprobar) = SIN MARCA (ni corazón ni tic)
//   aprobado sin salir (draft/scheduled)   = tic verde EN EL LUGAR donde vivía el corazón
//   publicado                              = SIN MARCA (ni corazón lleno ni tic)
// El tic NO des-aprueba: es un span sin handler, el toque abre el detalle.
// Geometría 1:1 con el slot viejo del corazón: 34px abajo-derecha sobre la foto sin chapita,
// 24px dentro de la franja (.hf-strip) con chapita. Nunca arriba a la izquierda.
// El mismo test sobre v694 PRÍSTINO debe fallar (tic arriba-izquierda + corazón
// lleno en programado no aprobado + tic fuera de la franja con chapita).
// Uso: node test-lote-tikcorazon.js
//   Prístino: SRC_PATH=/home/hatch/workspace/.lote-avatarfestejo-release/work/public/app.js STYLES_PATH=/home/hatch/workspace/.lote-avatarfestejo-release/work/public/styles.css node test-lote-tikcorazon.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC_PATH = process.env.SRC_PATH || path.join(__dirname, 'work', 'public', 'app.js');
const STYLES_PATH = process.env.STYLES_PATH || path.join(__dirname, 'work', 'public', 'styles.css');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const STYLES = fs.readFileSync(STYLES_PATH, 'utf8');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

// ---------- mini-DOM (suficiente para homeTileHTML + marcadores en vivo) ----------
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source']);
class El {
  constructor(tag, attrs) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.attrs = Object.assign({}, attrs || {});
    this.children = [];
    this.parent = null;
    this.text = '';
    this.style = {};
    this.dataset = {};
    for (const k of Object.keys(this.attrs)) {
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k];
    }
  }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = v; }
  get classList() {
    const self = this;
    const list = () => String(self.attrs.class || '').split(/\s+/).filter(Boolean);
    return {
      add: (...cs) => { const s = new Set(list()); cs.forEach((c) => s.add(c)); self.attrs.class = [...s].join(' '); },
      remove: (...cs) => { const s = new Set(list()); cs.forEach((c) => s.delete(c)); self.attrs.class = [...s].join(' '); },
      contains: (c) => list().includes(c),
      toggle: (c) => { const s = new Set(list()); if (s.has(c)) s.delete(c); else s.add(c); self.attrs.class = [...s].join(' '); },
    };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); }
  getAttribute(k) { return (k in this.attrs) ? this.attrs[k] : null; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  insertBefore(c, ref) { const i = ref ? this.children.indexOf(ref) : -1; if (i >= 0) this.children.splice(i, 0, c); else this.children.push(c); c.parent = this; return c; }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } }
  set textContent(v) { this.text = String(v); this.children = []; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  insertAdjacentHTML(pos, html) {
    const nodes = parseHTML(html);
    for (const n of nodes) { if (pos === 'afterbegin') this.children.unshift(n); else this.children.push(n); n.parent = this; }
  }
  querySelector(sel) { const all = this.querySelectorAll(sel); return all.length ? all[0] : null; }
  querySelectorAll(sel) {
    const out = [];
    const parts = String(sel).trim().split(/\s+/);
    const walk = (el, pi) => {
      for (const ch of el.children) {
        if (matchesPart(ch, parts[pi])) {
          if (pi === parts.length - 1) out.push(ch);
          else walk(ch, pi + 1);
        }
        walk(ch, pi);
      }
    };
    // soporte 'A > B': se resuelve como descendiente con chequeo de padre
    if (parts.includes('>')) {
      const idx = parts.indexOf('>');
      const parentSel = parts.slice(0, idx).join(' ');
      const childSel = parts.slice(idx + 1).join(' ');
      const parents = this.querySelectorAll(parentSel);
      for (const p of parents) for (const ch of p.children) if (matchesPart(ch, childSel)) out.push(ch);
      return out;
    }
    walk(this, 0);
    return out;
  }
  closest(sel) {
    let el = this;
    while (el) { if (matchesPart(el, [sel])) return el; el = el.parent; }
    return null;
  }
}
function matchesPart(el, part) {
  // un solo token simple: [tag][.cls][.cls][[attr]] / [[attr="v"]]
  const m = String(part).match(/^([a-zA-Z][a-zA-Z0-9]*)?((?:\.[A-Za-z0-9_-]+)*)((?:\[[^\]]+\])?)$/);
  if (!m) return false;
  if (m[1] && el.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
  const classes = (m[2] || '').split('.').filter(Boolean);
  const have = String(el.attrs.class || '').split(/\s+/).filter(Boolean);
  for (const c of classes) if (!have.includes(c)) return false;
  if (m[3]) {
    const am = m[3].match(/^\[([A-Za-z0-9_-]+)(?:="([^"]*)")?\]$/);
    if (!am) return false;
    if (!(am[1] in el.attrs)) return false;
    if (am[2] !== undefined && String(el.attrs[am[1]]) !== am[2]) return false;
  }
  return true;
}
function parseHTML(html) {
  const root = new El('div', {});
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[3] !== undefined) { const txt = m[3]; if (txt.trim()) { const top = stack[stack.length - 1]; top.text = (top.text || '') + txt; } continue; }
    if (m[0].startsWith('<!--')) continue;
    const tag = m[1].toLowerCase();
    const isClose = m[0][1] === '/';
    if (isClose) { if (stack.length > 1 && stack[stack.length - 1].tagName.toLowerCase() === tag) stack.pop(); continue; }
    const attrs = {};
    const attrRe = /([A-Za-z0-9_:-]+)(?:="([^"]*)")?/g;
    let am;
    while ((am = attrRe.exec(m[2] || '')) !== null) attrs[am[1]] = am[2] !== undefined ? am[2] : '';
    const el = new El(tag, attrs);
    stack[stack.length - 1].appendChild(el);
    const selfClose = /\/\s*$/.test(m[2] || '') || VOID.has(tag);
    if (!selfClose) stack.push(el);
  }
  return root.children;
}

// ---------- stubs de navegador (harness de avatarfestejo) ----------
function elStub() {
  return {
    tagName: 'DIV', style: {}, dataset: {}, className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild() {}, removeChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    closest: () => null,
    getBoundingClientRect: () => ({ width: 390, height: 100, top: 0, left: 0 }),
    focus() {}, click() {}, blur() {},
    innerHTML: '', textContent: '', value: '', hidden: false,
    src: '', href: '', disabled: false, checked: false,
    children: [], parentNode: null, isConnected: false,
  };
}
const bodyStub = Object.assign(elStub(), { appendChild(el) { return el; } });
const locObj = { hash: '#/app/inicio', href: 'https://postycommunitymanager.com/#/app/inicio', pathname: '/', search: '', host: 'postycommunitymanager.com' };
function storeStub() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}
async function fetchStub() { return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' }; }

const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  fetch: fetchStub,
  location: locObj,
  navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', language: 'es-AR', onLine: true },
  localStorage: storeStub(), sessionStorage: storeStub(),
  performance: { now: () => Date.now() },
  AbortSignal, URL, URLSearchParams,
  CustomEvent: function CustomEvent() {}, Event: function Event() {},
  document: null,
};
sandbox.window = {
  addEventListener() {}, removeEventListener() {},
  innerHeight: 844, innerWidth: 390, location: locObj,
  scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  navigator: sandbox.navigator, document: null,
};
sandbox.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: (tag) => new El(tag, {}), body: bodyStub, documentElement: elStub(),
  title: 'Posty', hidden: false, visibilityState: 'visible',
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
vm.createContext(sandbox);

// ---------- postes de prueba (foto real del perfume 4/11 como imagen) ----------
const IMG = '/media/mock-perfume.jpg';
function post(o) {
  return Object.assign({ id: 101, status: 'draft', approval: '', caption: 'Posteo de prueba', image_path: IMG, media_type: 'image', scheduled_at: null, published_at: null, pinned: false }, o);
}
function tileHTML(p, extra) {
  const t = Object.assign({ kind: 'post', post: p, day: null, ymd: null }, extra || {});
  return sandbox.homeTileHTML(t, 0);
}
function tree(html) { return parseHTML(html)[0]; }

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
    t('bundle carga en vm', true);
  } catch (e) {
    t('bundle carga en vm', false, e && e.message);
    console.log(`${pass} ok, ${fail} fallas`);
    process.exit(1);
  }

  // ---------- 1) render estático: máquina de estados ----------
  // 1a) borrador pendiente, sin chapita → SIN MARCA (ni corazón ni tic)
  let h = tileHTML(post({ id: 101 }));
  let tr = tree(h);
  t('1a pendiente sin chapita: sin marca (ni corazón ni tic)',
    !tr.querySelector('[data-hf-like]') && !tr.querySelector('.hf-tik'),
    h.slice(0, 200));
  // 1b) borrador aprobado, sin chapita → tic hijo directo de la tile, sin corazón
  h = tileHTML(post({ id: 102, approval: 'approved' }));
  tr = tree(h);
  t('1b aprobado sin chapita: tic en el lugar del corazón (hijo directo), sin corazón',
    !!tr.querySelector('.hf-tile > .hf-tik') && !tr.querySelector('[data-hf-like]'),
    'tik-directo=' + !!tr.querySelector('.hf-tile > .hf-tik'));
  // 1c) programado aprobado, CON chapita → tic DENTRO de la franja, sin corazón
  h = tileHTML(post({ id: 103, status: 'scheduled', approval: 'approved', scheduled_at: '2026-11-07T22:00:00.000Z' }));
  tr = tree(h);
  t('1c aprobado con chapita: hay chapita', !!tr.querySelector('.hf-chip'), 'sin chapita: el caso no aplica');
  t('1c aprobado con chapita: tic DENTRO de la franja, sin corazón',
    !!tr.querySelector('.hf-strip .hf-tik') && !tr.querySelector('.hf-tile > .hf-tik') && !tr.querySelector('[data-hf-like]'),
    'tik-strip=' + !!tr.querySelector('.hf-strip .hf-tik') + ' tik-directo=' + !!tr.querySelector('.hf-tile > .hf-tik'));
  // 1d) programado pendiente, CON chapita → SIN MARCA (ni corazón en la franja ni tic)
  h = tileHTML(post({ id: 104, status: 'scheduled', approval: '', scheduled_at: '2026-11-07T22:00:00.000Z' }));
  tr = tree(h);
  t('1d pendiente con chapita: sin marca (ni corazón en la franja ni tic)',
    !tr.querySelector('[data-hf-like]') && !tr.querySelector('.hf-tik'),
    'corazon-strip=' + !!tr.querySelector('.hf-strip [data-hf-like]'));
  // 1e) publicado → SIN MARCA (ni corazón lleno ni tic)
  h = tileHTML(post({ id: 105, status: 'published', approval: 'approved', published_at: '2026-11-04T22:00:00.000Z' }));
  tr = tree(h);
  t('1e publicado: sin marca (ni corazón lleno ni tic)',
    !tr.querySelector('[data-hf-like]') && !tr.querySelector('.hf-tik'),
    'corazon-lleno=' + (tr.querySelector('[data-hf-like]') || {}).getAttribute?.('data-hf-on'));
  // 1f) programado aprobado, SIN chapita → tic hijo directo, sin corazón
  h = tileHTML(post({ id: 106, status: 'scheduled', approval: 'approved', scheduled_at: null }));
  tr = tree(h);
  t('1f aprobado sin chapita (programado): tic hijo directo, sin corazón',
    !!tr.querySelector('.hf-tile > .hf-tik') && !tr.querySelector('[data-hf-like]'),
    'chip=' + !!tr.querySelector('.hf-chip'));

  // ---------- 2) CSS: geometría del slot, nunca arriba-izquierda ----------
  const tikRule = (STYLES.match(/\.hf-tik\{[^}]*\}/) || [''])[0];
  t('2a CSS .hf-tik ocupa el lugar del corazón (bottom:38px right:6px 34px)',
    tikRule.includes('bottom:38px') && tikRule.includes('right:6px') && tikRule.includes('width:34px'),
    tikRule.slice(0, 120));
  t('2b CSS .hf-tik NO tiene la regla vieja arriba-izquierda',
    !tikRule.includes('top:6px') && !tikRule.includes('left:6px'),
    tikRule.slice(0, 120));
  const stripRule = (STYLES.match(/\.hf-tile\s*>\s*\.hf-strip\s+\.hf-tik\{[^}]*\}/) || [''])[0];
  t('2c CSS tic en franja 24px estático',
    stripRule.includes('position:static') && stripRule.includes('width:24px'),
    stripRule.slice(0, 120));
  t('2d CSS verde #1FA855 y ✓ intactos', tikRule.includes('#1FA855'), tikRule.slice(0, 120));

  // ---------- 3) estáticas JS: ningún camino pone el tik arriba-izquierda ----------
  t('3a JS: sin estilo en línea top:6px para el tik',
    !SRC.includes('top:6px;left:6px;width:26px'),
    '');
  t('3b JS: homeTileHTML pone el tik SOLO en su slot (franja con chapita, directo sin ella) y no hay likeBtn',
    SRC.includes("${likeInStrip ? tikSpan : ''}") && SRC.includes("${likeInStrip ? '' : tikSpan}") && !SRC.includes('likeBtn'),
    '');

  // ---------- 4) marcadores en vivo ----------
  // (SACAR-CORAZÓN 6/11: la tile real ya no trae corazón; el helper arma
  // la tile sin él. El tik va en la franja si hay chapita, directo si no.)
  function buildTile({ chip }) {
    const tile = new El('span', { class: 'scf-mini-x hf-tile' + (chip ? ' hf-has-chip' : ''), 'data-post-id': '102', 'data-status': 'scheduled' });
    tile.appendChild(new El('img', { src: IMG }));
    const strip = new El('span', { class: 'hf-strip' });
    if (chip) { const c = new El('span', { class: 'hf-chip' }); c.text = 'Sáb · 19:00'; strip.appendChild(c); }
    tile.appendChild(strip);
    return { tile, strip };
  }
  // 4a) pzAprobarEnSitio, CON chapita → tic en franja
  let b = buildTile({ chip: true });
  let ok = sandbox.pzAprobarEnSitio(b.tile, '102', null);
  const tikA = b.tile.querySelector('.hf-tik');
  t('4a vivo (franja): tic EN la franja',
    ok !== false && !!tikA && tikA.parent === b.strip,
    'ok=' + ok);
  // 4b) pzAprobarEnSitio, SIN chapita → tic hijo directo
  b = buildTile({ chip: false });
  ok = sandbox.pzAprobarEnSitio(b.tile, '102', null);
  const tikB = b.tile.querySelector('.hf-tik');
  t('4b vivo (foto): tic hijo directo de la tile',
    ok !== false && !!tikB && tikB.parent === b.tile && !b.strip.querySelector('.hf-tik'),
    'ok=' + ok);
  // 4c) respaldo pzAcceptAllWeekMark sin pzAprobarEnSitio: mismo slot, sin estilos en línea
  const saved = sandbox.pzAprobarEnSitio;
  sandbox.pzAprobarEnSitio = undefined;
  b = buildTile({ chip: true });
  sandbox.pzAcceptAllWeekMark(b.tile, { id: '102', scheduled_at: null });
  const tikC = b.strip.querySelector('.hf-tik');
  t('4c respaldo (franja): tic en la franja, sin estilo en línea top:6px',
    !!tikC && !(tikC.style && tikC.style.cssText && String(tikC.style.cssText).includes('top:6px')),
    'tik-strip=' + !!tikC);
  b = buildTile({ chip: false });
  sandbox.pzAcceptAllWeekMark(b.tile, { id: '102', scheduled_at: null });
  const tikC2 = b.tile.querySelector('.hf-tik');
  t('4c respaldo (foto): tic hijo directo, sin estilo en línea top:6px',
    !!tikC2 && tikC2.parent === b.tile,
    '');
  sandbox.pzAprobarEnSitio = saved;

  console.log(`\nSRC: ${SRC_PATH}`);
  console.log(`${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('HARNESS THROW', e); process.exit(2); });
