'use strict';
/* test-feed6c-gestures.js — Tanda feed 6C · ítem 9 (arrastrar para
 * reordenar): la máquina de gestos de B1 + la extensión de arrastre se
 * ejercita con DOM falso y eventos sintéticos de puntero, sobre el
 * código real extraído de app.js:
 *  · hold ≥350ms → peek (como siempre); primer movimiento >10px lo
 *    cierra (como siempre) y ARMA el arrastre; el movimiento siguiente
 *    con el puntero apretado convierte el gesto en arrastre: la tile
 *    sigue al puntero (transform), el destino se resalta y el espejo
 *    vivo se declara ocupado (hfLiveBusy).
 *  · soltar sobre otra tile de la semana llama POST /api/posts/swap
 *    con el plan cruzado y ofrece «Deshacer» (postToast) que restaura
 *    el estado anterior exacto por el mismo endpoint.
 *  · Esc y pointercancel cancelan sin cambios; soltar fuera de
 *    objetivo no llama a nada; una tile publicada nunca se arrastra.
 * QA declarada: sin navegador real en la VM — eventos sintéticos
 * estándar de puntero; la verificación en dispositivo real queda
 * pendiente del dueño (misma declaración que la QA geométrica de B1).
 * Uso: node test-feed6c-gestures.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

class El {
  constructor(tag) {
    this.tagName = tag || 'div';
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.removed = false;
    this.innerHTML = '';
    this._l = {};
    this._q = {};
    this._qa = {};
    this._closestMap = {};
    this._rect = { left: 0, top: 0, right: 0, bottom: 0 };
    const s = new Set();
    this.classList = {
      add: (c) => s.add(c), remove: (c) => s.delete(c),
      toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else if (f) s.add(c); else s.delete(c); },
      contains: (c) => s.has(c),
    };
  }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  removeEventListener(ev, fn) { const a = this._l[ev] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  dispatch(ev, e) { (this._l[ev] || []).slice().forEach((f) => f(e || {})); }
  querySelector(sel) { return this._q[sel] || null; }
  querySelectorAll(sel) { return this._qa[sel] || []; }
  closest(sel) { return this._closestMap[sel] || null; }
  setAttribute(k, v) { this['attr_' + k] = v; }
  getBoundingClientRect() { return this._rect; }
  remove() { this.removed = true; }
}

async function main() {
  const a = APP.indexOf('const HOME_FEED_CAP');
  const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
  const g0 = APP.indexOf('// (Tanda feed 6B · ítem 5) Estado del peek');
  const g1 = APP.indexOf('// Hoja de acciones estilo Instagram', g0);
  ok(g0 > 0 && g1 > g0, 'tramo de gestos delimitado en app.js');

  const calls = { swap: [], toasts: [], postToasts: [] };
  const appended = [];
  const docListeners = {};
  const documentStub = {
    createElement: (tag) => new El(tag),
    body: { appendChild: (el) => { appended.push(el); }, classList: { add: () => {}, remove: () => {} } },
    addEventListener: (ev, fn) => { (docListeners[ev] = docListeners[ev] || []).push(fn); },
    removeEventListener: (ev, fn) => { const arr = docListeners[ev] || []; const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); },
    getElementById: () => null,
    querySelectorAll: () => [],
    hidden: false,
    activeElement: null,
  };
  const sb = {
    console, setTimeout, clearTimeout, setInterval: () => 0, Date, Math, JSON,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    mv: (p) => p,
    pcTz: () => 'America/Argentina/Buenos_Aires',
    pcParseDate: (s0) => { const s = String(s0 || ''); if (!s) return null; let x = s.replace(' ', 'T'); if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x)) x += 'Z'; const d = new Date(x); return isNaN(d) ? null : d; },
    ME: undefined,
    document: documentStub,
    window: { addEventListener: () => {} },
    location: { hash: '#/app/inicio' },
    HF_TILES: [], HF_VISITOR: false, HF_CUR_PROF: { username: 'cafesol', pic: '' }, HF_DETAIL: null, HF_MOVE: null,
    HF_PROPS: { 7: { iso: '2999-01-03T12:00:00.000Z' } },
    hfIsEn: () => false,
    hfOpenChatForPost: () => {}, hfRedoPost: () => {}, hfPinToggle: () => {}, hfSetAnchor: () => {},
    hfOpenActionsSheet: () => {},
    api: { post: async (u, body) => { calls.swap.push({ u, body }); return { ok: true }; }, get: async () => null },
    postToast: (o) => { calls.postToasts.push(o); },
    toast: (t) => { calls.toasts.push(t); },
    render: () => {},
    isPlanLimitErr: () => false,
    planLimitModal: () => {},
  };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b), sb);
  vm.runInContext(APP.slice(g0, g1), sb);
  ok(typeof sb.hfFeedGesturesBind === 'function' && typeof sb.hfDragPerform === 'function' && typeof sb.hfDragCancel === 'function',
    'gestos + arrastre cargan en el sandbox');

  const drag = () => vm.runInContext('HF_DRAG', sb);
  const peek = () => vm.runInContext('HF_PEEK', sb);
  const postA = { id: 7, status: 'draft', media_type: 'image', image_path: '/m/7.jpg', caption: 'Borrador', redo_left: 3, pinned: 0 };
  const postB = { id: 8, status: 'scheduled', media_type: 'image', image_path: '/m/8.jpg', caption: 'Programado', scheduled_at: '2999-01-01T12:00:00.000Z', redo_left: 3, pinned: 0 };
  const postC = { id: 9, status: 'published', media_type: 'image', image_path: '/m/9.jpg', caption: 'Publicado', published_at: new Date(Date.now() - 3600e3).toISOString() };
  sb.HF_TILES = [{ kind: 'post', post: postA }, { kind: 'post', post: postB }, { kind: 'post', post: postC }];

  const mkTile = (post, rect) => {
    const t = new El('span');
    t.dataset = { postId: String(post.id), status: post.status, media: post.media_type, schedAt: post.scheduled_at || '' };
    t._q['video[data-hf-reel]'] = null;
    t._rect = rect;
    t._closestMap['.hf-tile'] = t;
    return t;
  };
  const tileA = mkTile(postA, { left: 0, top: 0, right: 100, bottom: 100 });
  const tileB = mkTile(postB, { left: 100, top: 0, right: 200, bottom: 100 });
  const tileC = mkTile(postC, { left: 200, top: 0, right: 300, bottom: 100 });
  const root = new El('div');
  root._qa['.hf-tile[data-post-id]'] = [tileA, tileB, tileC];
  sb.hfFeedGesturesBind(root);
  const evAt = (tile, x, y) => ({ target: tile, clientX: x || 0, clientY: y || 0, preventDefault: () => {}, stopPropagation: () => {} });

  // — hold → peek; primer movimiento cierra y arma; el siguiente arrastra —
  tileA.dispatch('pointerdown', evAt(tileA, 10, 10));
  await sleep(420);
  ok(peek() && peek().post.id === 7, 'hold ≥350ms: el peek se abre como siempre');
  tileA.dispatch('pointermove', evAt(tileA, 45, 10));
  ok(peek() === null && drag() === null, 'primer movimiento >10px: peek cerrado (como siempre) y arrastre todavía no');
  tileA.dispatch('pointermove', evAt(tileA, 150, 50));
  ok(drag() && drag().post.id === 7, 'movimiento siguiente con el puntero apretado: el gesto ES un arrastre');
  ok(tileA.classList.contains('hf-dragging') && String(tileA.style.transform || '').includes('translate(140px, 40px)'),
    'la tile sigue al puntero (transform) con su clase de arrastre');
  ok(tileB.classList.contains('hf-drag-over'), 'la tile destino bajo el puntero queda resaltada');
  ok(sb.hfLiveBusy() === true, 'durante el arrastre el espejo vivo se difiere (hfLiveBusy)');
  tileA.dispatch('pointerup', evAt(tileA, 150, 50));
  await sleep(30);
  ok(drag() === null && !tileA.classList.contains('hf-dragging'), 'soltar: el arrastre termina y la tile se libera');
  ok(calls.swap.length === 1 && calls.swap[0].u === '/api/posts/swap', 'soltar sobre otra tile de la semana: POST /api/posts/swap');
  const plan = calls.swap[0] && calls.swap[0].body;
  ok(plan && plan.a === 7 && plan.b === 8 && plan.a_to === '2999-01-01T12:00:00.000Z' && plan.b_to === '2999-01-03T12:00:00.000Z',
    'el plan cruza los tiempos efectivos (programado ↔ propuesta del borrador)');
  ok(calls.postToasts.length === 1 && calls.postToasts[0].actions && calls.postToasts[0].actions[0].label === 'Deshacer',
    'toast con «Deshacer» tras el intercambio');
  await calls.postToasts[0].actions[0].fn();
  const undoBody = calls.swap[1] && calls.swap[1].body;
  ok(calls.swap.length === 2 && undoBody && undoBody.a_to === null && undoBody.a_status === 'draft'
    && undoBody.b_to === '2999-01-01T12:00:00.000Z' && undoBody.b_status === 'scheduled',
    '«Deshacer» restaura el estado anterior exacto por el mismo endpoint');

  // — Esc cancela sin cambios —
  calls.swap.length = 0;
  tileA.dispatch('pointerdown', evAt(tileA, 10, 10));
  await sleep(420);
  tileA.dispatch('pointermove', evAt(tileA, 45, 10));
  tileA.dispatch('pointermove', evAt(tileA, 150, 50));
  ok(drag() !== null, 'segundo arrastre en curso');
  (docListeners.keydown || []).forEach((f) => f({ key: 'Escape' }));
  ok(drag() === null && calls.swap.length === 0, 'Esc: arrastre cancelado, sin llamadas al servidor');
  tileA.dispatch('pointerup', evAt(tileA, 150, 50));
  ok(calls.swap.length === 0, 'soltar tras Esc: tampoco intercambia');

  // — pointercancel cancela sin cambios —
  tileA.dispatch('pointerdown', evAt(tileA, 10, 10));
  await sleep(420);
  tileA.dispatch('pointermove', evAt(tileA, 45, 10));
  tileA.dispatch('pointermove', evAt(tileA, 150, 50));
  ok(drag() !== null, 'tercer arrastre en curso');
  tileA.dispatch('pointercancel', evAt(tileA, 150, 50));
  ok(drag() === null && calls.swap.length === 0, 'pointercancel: sin cambios');

  // — soltar fuera de objetivo: sin cambios —
  tileA.dispatch('pointerdown', evAt(tileA, 10, 10));
  await sleep(420);
  tileA.dispatch('pointermove', evAt(tileA, 45, 10));
  tileA.dispatch('pointermove', evAt(tileA, 500, 500));
  ok(drag() !== null && !tileB.classList.contains('hf-drag-over'), 'fuera de objetivo: arrastre vivo, nada resaltado');
  tileA.dispatch('pointerup', evAt(tileA, 500, 500));
  await sleep(30);
  ok(calls.swap.length === 0, 'soltar fuera de objetivo: sin intercambio');

  // — una publicada nunca se arrastra —
  tileC.dispatch('pointerdown', evAt(tileC, 210, 10));
  await sleep(420);
  tileC.dispatch('pointermove', evAt(tileC, 245, 10));
  tileC.dispatch('pointermove', evAt(tileC, 150, 50));
  ok(drag() === null, 'tile publicada: el movimiento tras el hold NO se convierte en arrastre');
  tileC.dispatch('pointerup', evAt(tileC, 150, 50));

  console.log(`\ntest-feed6c-gestures: ${total - fails}/${total}`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
