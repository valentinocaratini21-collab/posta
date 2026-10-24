'use strict';
/* test-feed6b-gestures.js — Tanda feed 6B · ítem 5 (peek) e ítem 7
 * (delegado del recorte): la máquina de gestos vigente
 * (hfFeedGesturesBind) se ejercita con un DOM falso mínimo y eventos
 * sintéticos de puntero, sobre el código real extraído de app.js:
 *  · hold ≥350ms sin mover abre el peek; soltar lo cierra; mover
 *    >10px tras el hold lo cierra y libera el gesto; un tap corto no
 *    abre nada; el scroll (pointercancel) cancela el hold.
 *  · En futuros, el hold largo (600ms) sigue abriendo la hoja de
 *    acciones vigente, que reemplaza al peek.
 *  · En reels, la preview muda de la tile y el peek nacen juntos.
 *  · contextmenu sobre la grilla se suprime; el 💬 no inicia gestos.
 *  · Las acciones del peek reusan las piezas de la Fase A
 *    (hfOpenChatForPost/hfRedoPost/hfPinToggle) y la vista de
 *    seguidor; el delegado data-hf-crop muestra/oculta el overlay.
 * Uso: node test-feed6b-gestures.js
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
    const s = new Set();
    this.classList = {
      add: (c) => s.add(c), remove: (c) => s.delete(c),
      toggle: (c, f) => { if (f === undefined) { s.has(c) ? s.delete(c) : s.add(c); } else if (f) s.add(c); else s.delete(c); },
      contains: (c) => s.has(c),
    };
  }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  dispatch(ev, e) { (this._l[ev] || []).slice().forEach((f) => f(e || {})); }
  querySelector(sel) { return this._q[sel] || null; }
  querySelectorAll(sel) { return this._qa[sel] || []; }
  closest(sel) { return this._closestMap[sel] || null; }
  setAttribute(k, v) { this['attr_' + k] = v; }
  remove() { this.removed = true; }
}

async function main() {
  // Sandbox: bloque HOME_FEED (funciones puras) + el tramo de gestos.
  const a = APP.indexOf('const HOME_FEED_CAP');
  const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
  const g0 = APP.indexOf('// (Tanda feed 6B · ítem 5) Estado del peek');
  const g1 = APP.indexOf('// Hoja de acciones estilo Instagram', g0);
  ok(g0 > 0 && g1 > g0, 'tramo de gestos 6B delimitado en app.js');

  const calls = { chat: [], redo: [], pin: [], sheet: [], anchor: [] };
  const appended = [];
  const docListeners = {};
  const documentStub = {
    createElement: (tag) => new El(tag),
    body: { appendChild: (el) => { appended.push(el); } },
    addEventListener: (ev, fn) => { (docListeners[ev] = docListeners[ev] || []).push(fn); },
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
    hfIsEn: () => false,
    hfOpenChatForPost: (p) => calls.chat.push(p.id),
    hfRedoPost: (id) => calls.redo.push(id),
    hfPinToggle: (pin, id) => calls.pin.push([pin, id]),
    hfSetAnchor: (p) => calls.anchor.push(p && p.id),
    hfOpenActionsSheet: (tile) => calls.sheet.push(tile.dataset.postId),
    toast: () => {},
  };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b), sb);
  vm.runInContext(APP.slice(g0, g1), sb);
  ok(typeof sb.hfFeedGesturesBind === 'function' && typeof sb.hfPeekOpen === 'function' && typeof sb.hfLiveDiff === 'function', 'gestos + peek + espejo cargan en el sandbox');

  const peek = () => vm.runInContext('HF_PEEK', sb);
  const gest = () => vm.runInContext('HF_GESTURE_ACTIVE', sb);
  const postDraft = { id: 7, status: 'draft', media_type: 'image', image_path: '/m/7.jpg', caption: 'Peek de prueba', redo_left: 2, pinned: 0 };
  const postSched = { id: 8, status: 'scheduled', media_type: 'image', image_path: '/m/8.jpg', caption: 'Sale mañana', scheduled_at: '2999-01-01T12:00:00.000Z', redo_left: 3, pinned: 0 };
  const postReel = { id: 9, status: 'published', media_type: 'video', image_path: '/m/9.mp4', caption: 'Reel', likes: null, comments_count: null, published_at: new Date(Date.now() - 3600e3).toISOString() };
  sb.HF_TILES = [{ kind: 'post', post: postDraft }, { kind: 'post', post: postSched }, { kind: 'post', post: postReel }];

  const mkTile = (post, video) => {
    const t = new El('span');
    t.dataset = { postId: String(post.id), status: post.status };
    t._q['video[data-hf-reel]'] = video || null;
    t._closestMap['.hf-tile'] = t;
    return t;
  };
  const tileDraft = mkTile(postDraft);
  const tileSched = mkTile(postSched);
  const fakeVideo = { muted: false, loop: false, currentTime: 5, played: false, paused: false, play() { this.played = true; return { catch: () => {} }; }, pause() { this.paused = true; } };
  const tileReel = mkTile(postReel, fakeVideo);
  const root = new El('div');
  root._qa['.hf-tile[data-post-id]'] = [tileDraft, tileSched, tileReel];
  sb.hfFeedGesturesBind(root);

  const evAt = (tile, x, y) => ({ target: tile, clientX: x || 0, clientY: y || 0, preventDefault: () => {}, stopPropagation: () => {} });

  // — hold 350ms abre el peek; soltar lo cierra —
  tileDraft.dispatch('pointerdown', evAt(tileDraft, 10, 10));
  await sleep(420);
  ok(peek() && peek().post.id === 7, 'hold ≥350ms: el peek se abre sobre el posteo propio');
  ok(appended.length && appended[appended.length - 1].innerHTML.includes('Peek de prueba'), 'el peek trae la tarjeta ampliada con su caption');
  tileDraft.dispatch('pointerup', evAt(tileDraft, 10, 10));
  ok(peek() === null, 'soltar: el peek se cierra');

  // — mover >10px tras el hold cierra el peek y libera el gesto —
  tileDraft.dispatch('pointerdown', evAt(tileDraft, 10, 10));
  await sleep(420);
  ok(peek() !== null, 'segundo hold: peek abierto de nuevo');
  tileDraft.dispatch('pointermove', evAt(tileDraft, 45, 10));
  ok(peek() === null && gest() === false, 'mover >10px tras el hold: peek cerrado y gesto libre (extensión B2)');

  // — tap corto: nada —
  tileDraft.dispatch('pointerdown', evAt(tileDraft, 10, 10));
  tileDraft.dispatch('pointerup', evAt(tileDraft, 10, 10));
  await sleep(420);
  ok(peek() === null, 'tap corto (<350ms): no se abre el peek (el tap sigue siendo el detalle)');

  // — el scroll cancela el hold (pointercancel) —
  tileDraft.dispatch('pointerdown', evAt(tileDraft, 10, 10));
  tileDraft.dispatch('pointercancel', evAt(tileDraft, 10, 10));
  await sleep(420);
  ok(peek() === null, 'pointercancel (scroll): el hold se cancela, sin peek');

  // — futuro: el hold largo abre la hoja vigente y reemplaza al peek —
  tileSched.dispatch('pointerdown', evAt(tileSched, 5, 5));
  await sleep(420);
  ok(peek() && peek().post.id === 8, 'futuro a los 350ms: peek abierto');
  await sleep(320);
  ok(calls.sheet.includes('8') && peek() === null, 'futuro a los 600ms: la hoja de acciones vigente reemplaza al peek');
  tileSched.dispatch('pointerup', evAt(tileSched, 5, 5));

  // — reel: preview muda de la tile + peek juntos; soltar detiene —
  tileReel.dispatch('pointerdown', evAt(tileReel, 5, 5));
  await sleep(420);
  ok(fakeVideo.played && fakeVideo.muted === true && fakeVideo.loop === true, 'reel: la preview muda en loop de siempre sigue viva');
  ok(peek() && peek().post.id === 9, 'reel: el peek se abre junto a la preview');
  tileReel.dispatch('pointerup', evAt(tileReel, 5, 5));
  ok(fakeVideo.paused && peek() === null, 'reel al soltar: preview detenida y peek cerrado');

  // — contextmenu suprimido sobre la grilla —
  let prevented = false;
  const cmTarget = new El('span');
  cmTarget._closestMap['.hf-tile'] = tileDraft;
  root.dispatch('contextmenu', { target: cmTarget, preventDefault: () => { prevented = true; } });
  ok(prevented, 'contextmenu sobre una tile: suprimido (sin menú del sistema)');

  // — el 💬 de la Fase A no inicia gestos —
  const chatTarget = new El('button');
  chatTarget._closestMap['[data-hf-chat]'] = chatTarget;
  tileDraft.dispatch('pointerdown', { target: chatTarget, clientX: 1, clientY: 1 });
  await sleep(420);
  ok(peek() === null, 'pointerdown sobre el 💬: ningún gesto (target propio de la Fase A)');

  // — acciones del peek: reusan las piezas de la Fase A —
  sb.hfPeekAct('chat', postDraft, tileDraft);
  ok(calls.chat.includes(7), 'acción 💬 del peek: hfOpenChatForPost (chat anclado de la Fase A)');
  sb.hfPeekAct('redo', postDraft, tileDraft);
  ok(calls.anchor.includes(7) && calls.redo.includes(7), 'acción ↻ del peek: ancla + hfRedoPost con su contador');
  sb.hfPeekAct('pin', postDraft, tileDraft);
  ok(calls.pin.length === 1 && calls.pin[0][0] === true && calls.pin[0][1] === '7', 'acción 📌 del peek: hfPinToggle(!pinned, id)');
  tileDraft.dispatch('pointerdown', evAt(tileDraft, 10, 10));
  await sleep(420);
  sb.hfPeekAct('followers', postDraft, tileDraft);
  ok(peek() === null && appended[appended.length - 1].innerHTML.includes('Así lo ven tus seguidores'), 'acción 👁 del peek: abre «Ver en el inicio» y cierra el peek');
  sb.hfFollowerClose();

  // — delegado del recorte (ítem 7): mostrar/ocultar el overlay —
  const cropBtn = new El('button');
  const host = new El('div');
  const cropOv = new El('div');
  cropOv.hidden = true;
  host._q['.hf-cropov'] = cropOv;
  host._q['.hf-d-media'] = null;
  cropBtn._closestMap['[data-hf-crop]'] = cropBtn;
  cropBtn._closestMap['.hf-d, .igmock'] = host;
  cropBtn.closest = (sel) => cropBtn._closestMap[sel] || null;
  const docClick = (docListeners.click || [])[0];
  ok(typeof docClick === 'function', 'delegado global data-hf-crop registrado');
  docClick({ target: cropBtn, stopPropagation: () => {}, preventDefault: () => {} });
  ok(cropOv.hidden === false && cropBtn['attr_aria-pressed'] === 'true', 'interruptor de recorte: muestra el overlay 3:4');
  docClick({ target: cropBtn, stopPropagation: () => {}, preventDefault: () => {} });
  ok(cropOv.hidden === true && cropBtn['attr_aria-pressed'] === 'false', 'interruptor de recorte: lo oculta de nuevo');

  console.log(`\ntest-feed6b-gestures: ${total - fails}/${total}`);
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error('ERROR', e); process.exit(1); });
