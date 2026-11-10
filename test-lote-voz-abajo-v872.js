// test-lote-voz-abajo-v872.js — LOTE NOTA DE VOZ ABAJO DE TODO v872.
// EL SÍNTOMA (reporte de Valentino 10/11 09:09): la nota de voz SE MANDA
// pero NO aparece abajo de todo en el chat — queda en otro lugar, y no se
// entiende si se mandó o no. DISTINTO de v861 (que arregló que no saliera
// nada: burbuja perdida, silencio, sin watchdog, sin respaldo de texto).
// CAUSA RAÍZ (ver STATUS.md, probada por código + aritmética):
//  (1) chat_messages.created_at se guarda en UTC sin zona (db.js:
//      DEFAULT (datetime('now'))) y /api/ideas/chat lo devuelve tal cual.
//      chatLoadHistory, bbChatContent y el poll de supervisión lo parseaban
//      con Date.parse pelado → HORA LOCAL: en America/New_York quedaba
//      ~5 h en el FUTURO. chatAppendMsg inserta por data-ts, así que la
//      nota nueva (Date.now() real) caía ANTES del bloque reciente, nunca
//      abajo de todo; el scroll al fondo mostraba los mensajes viejos.
//      La hora mostrada también salía +5 h. El codebase ya tenía el idiom
//      correcto (creado_en con replace(' ','T')+'Z' en 9145/9163).
//  (2) La burbuja de voz no tenía garantía de quedar última: si el
//      historial venía con data-ts en el futuro, el insert por ts la
//      dejaba en el medio aunque el scroll bajara al fondo.
// EL FIX (solo app.js + BUILD + ?v=): helper pzTsUTC (parsea created_at
// como UTC) en los 3 sitios del chat + vozBubbleAlFondo (la nota mandada
// va después del último .chat-msg con data-ts) llamado en vozBubbleSending
// y en las dos ramas de vozBubbleEnviada, siempre antes de chatScroll(true).
// Parte A: estática (pins + M78). Parte B: cliente en vm con DOM falso
// (burbuja al fondo con historial sesgado; re-inserción; orden con la
// respuesta; parse UTC bajo TZ=America/New_York en proceso hijo).
// Parte C: boot real de server.js.
// Uso: node test-lote-voz-abajo-v872.js — sale 0 si todo pasa.
// En el árbol v860 prístino TIENE que fallar (A3/A4/A5 + B1b/B2/B3/B4/B6).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn, spawnSync } = require('child_process');

const DIR = __dirname;
const SKIP_BOOT = process.env.V872_SKIP_BOOT === '1';
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEnSrc = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const stySrc = fs.existsSync(path.join(DIR, 'public/styles.css')) ? fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8') : '';

// ---------- helpers de extracción (mismo patrón que test-lote-chat-clicks) ----------
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 1, j = i + sig.length;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function reFrom(src, re) {
  const m = src.match(re);
  return m ? m[0] : null;
}
function lineFrom(src, prefix) {
  const i = src.indexOf(prefix);
  if (i < 0) return null;
  const j = src.indexOf('\n', i);
  return src.slice(i, j < 0 ? src.length : j);
}
function count(src, sub) { return src.split(sub).length - 1; }

// ---------- Parte A: estática ----------
console.log('Parte A — estática');
check('A1 BUILD v872 x1 en server.js', count(srvSrc, "20261105-v872") === 1);
check('A1b cero v860 en server.js', count(srvSrc, '20261105-v860') === 0);
check('A2 ?v=592 x1 en index ES', count(idxSrc, 'app.js?v=592') === 1);
check('A2b ?v=588 x0 en index ES', count(idxSrc, 'app.js?v=588') === 0);
check('A2c styles?v=20261226 x1 en ambos index', count(idxSrc, 'styles.css?v=20261226') === 1 && count(idxEnSrc, 'styles.css?v=20261226') === 1);
check('A3 pzTsUTC definido x1', count(appSrc, 'function pzTsUTC(s) {') === 1);
check('A3b pzTsUTC usado en los 3 sitios del chat', count(appSrc, 'pzTsUTC(m.created_at)') === 3);
check('A4 parse ingenuo de created_at x0', count(appSrc, 'Date.parse(String(m.created_at') === 0);
check('A5 vozBubbleAlFondo definido x1', count(appSrc, 'function vozBubbleAlFondo(el) {') === 1);
check('A5b vozBubbleAlFondo llamado x3 (sending + enviada x2)', count(appSrc, 'vozBubbleAlFondo(') === 4); // 1 def + 3 llamadas
check('A6 sin data/ en el árbol', !fs.existsSync(path.join(DIR, 'data')));
// M78: toda función que llama el fix existe definida x1 en el bundle.
const M78 = ['pzTsUTC', 'vozBubbleAlFondo', 'chatAppendMsg', 'pzVoiceBubbleHTML', 'pzVoicePlayerHTML', 'pzVoiceBubbleInit', 'chatHoraHtml', 'pzChatHoraFmt', 'chatScroll', 'pzChatToBottom', 'vozFmt', 'vozEn', 'pzVoiceWaveBars'];
let m78ok = 0;
for (const f of M78) {
  const n = count(appSrc, 'function ' + f + '(');
  if (n === 1) m78ok++;
  else console.log(`  ❌ M78 ${f}: definidos=${n}`);
}
// esc es const flecha, no function: se cuenta aparte (línea 4, tope del bundle).
if (count(appSrc, 'const esc = (s) =>') >= 1) m78ok++;
check(`A7 M78 funciones auditadas ${m78ok}/${M78.length + 1}`, m78ok === M78.length + 1);

// ---------- Mini-DOM falso: lo justo para la caja del chat y la burbuja ----------
function makeFakeDom() {
  const registry = {};
  function mkBar() {
    const b = { style: {}, _h: '16', classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } }, getAttribute(k) { return k === 'data-h' ? '16' : undefined; } };
    return b;
  }
  function mkEl(tag, id) {
    const el = {
      tagName: (tag || 'div').toUpperCase(), id: id || '',
      _html: '', textContent: '', value: '', src: '',
      dataset: {}, style: {}, className: '',
      children: [], onclick: null, disabled: false, hidden: false,
      _connected: false, _listeners: {}, _kids: {}, _box: null, _ownedIds: new Set(),
      _scrollTop: 0,
    };
    el.classList = {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    };
    Object.defineProperty(el, 'isConnected', { get() { return el._connected; } });
    Object.defineProperty(el, 'innerHTML', {
      get() { return el._html; },
      set(v) {
        for (const oid of el._ownedIds) { const o = registry[oid]; if (o) { o._connected = false; delete registry[oid]; } }
        el._ownedIds = new Set();
        el._html = String(v);
        const re = /id="([^"]+)"/g; let m;
        while ((m = re.exec(el._html))) {
          const cid = m[1];
          el._ownedIds.add(cid);
          if (!registry[cid]) { const c = mkEl('div', cid); c._connected = true; registry[cid] = c; }
        }
      },
    });
    Object.defineProperty(el, 'previousElementSibling', { get() {
      if (!el._box) return null;
      const i = el._box._msgs.indexOf(el);
      return i > 0 ? el._box._msgs[i - 1] : null;
    } });
    el.setPointerCapture = () => {};
    el.appendChild = (c) => { el.children.push(c); c._connected = true; if (c.id) registry[c.id] = c; return c; };
    el.remove = () => {
      el._connected = false;
      if (el.id) delete registry[el.id];
      if (el._box) { const i = el._box._msgs.indexOf(el); if (i >= 0) el._box._msgs.splice(i, 1); }
    };
    el.addEventListener = (ev, fn) => { (el._listeners[ev] = el._listeners[ev] || []).push(fn); };
    el.setAttribute = (k, v) => { el['attr:' + k] = v; };
    el.getAttribute = (k) => el['attr:' + k];
    el.click = () => { if (el.onclick) el.onclick(); };
    el.focus = () => {};
    el.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 20 });
    el.querySelector = (sel) => fakeQuery(el, sel);
    el.querySelectorAll = (sel) => fakeQueryAll(el, sel);
    el.insertAdjacentHTML = (pos, html) => fakeInsert(el, pos, html);
    el.insertAdjacentElement = (pos, target) => {
      if (!el._box || !target) return null;
      const msgs = el._box._msgs;
      const ti = msgs.indexOf(target);
      if (ti >= 0) msgs.splice(ti, 1);
      const i = msgs.indexOf(el);
      if (pos === 'afterend') msgs.splice(i + 1, 0, target);
      else if (pos === 'beforebegin') msgs.splice(i < 0 ? msgs.length : i, 0, target);
      else if (pos === 'afterbegin') msgs.unshift(target);
      else msgs.push(target);
      target._box = el._box;
      return target;
    };
    return el;
  }
  function msgFromHtml(html) {
    const m = mkEl('div', '');
    const cm = html.match(/class="([^"]*)"/);
    if (cm) m.className = cm[1];
    const tm = html.match(/data-ts="(\d+)"/);
    if (tm) m.dataset.ts = tm[1];
    const im = html.match(/ id="([^"]+)"/);
    if (im) { m.id = im[1]; registry[m.id] = m; }
    m._html = html;
    m._connected = true;
    return m;
  }
  function fakeInsert(el, pos, html) {
    const msg = msgFromHtml(html);
    if (el._msgs) { // chatBox
      if (pos === 'afterbegin') el._msgs.unshift(msg); else el._msgs.push(msg);
      msg._box = el;
      return msg;
    }
    if (el._box) { // un mensaje: beforebegin/afterend en la lista
      const i = el._box._msgs.indexOf(el);
      if (pos === 'beforebegin') el._box._msgs.splice(i < 0 ? el._box._msgs.length : i, 0, msg);
      else el._box._msgs.splice(i < 0 ? el._box._msgs.length : i + 1, 0, msg);
      msg._box = el._box;
      return msg;
    }
    return msg;
  }
  function fakeQuery(el, sel) {
    if (el._msgs) {
      const tsm = sel.match(/data-ts="(\d+)"/);
      if (tsm) return el._msgs.find((m) => String(m.dataset.ts) === tsm[1] && m.className.includes('vb-voice')) || null;
      if (sel.includes('vb-voice')) return el._msgs.find((m) => m.className.includes('vb-voice')) || null;
      return null;
    }
    if (sel === '.vb-play' || sel === '.vb-wave' || sel === '.vb-dur') {
      if (!el._kids[sel]) {
        const k = mkEl(sel === '.vb-play' ? 'button' : sel === '.vb-wave' ? 'div' : 'span', '');
        k._connected = true;
        if (sel === '.vb-wave') k.querySelectorAll = (s) => (s === 'i' ? (k._bars || (k._bars = Array.from({ length: 28 }, () => mkBar()))) : []);
        el._kids[sel] = k;
      }
      return el._kids[sel];
    }
    if (sel.startsWith('#')) return registry[sel.slice(1)] || null;
    return null;
  }
  function fakeQueryAll(el, sel) {
    if (el._msgs && sel.includes('.chat-msg[data-ts]')) return el._msgs.filter((m) => m.dataset.ts);
    if (el._msgs && sel.includes('.chat-msg')) return el._msgs.slice();
    return [];
  }
  const chatBox = mkEl('div', 'chatBox');
  chatBox._msgs = [];
  chatBox._clientHeight = 200;
  Object.defineProperty(chatBox, 'lastElementChild', { get() { return chatBox._msgs.length ? chatBox._msgs[chatBox._msgs.length - 1] : null; } });
  Object.defineProperty(chatBox, 'scrollHeight', { get() { return chatBox._msgs.length * 60; } });
  Object.defineProperty(chatBox, 'clientHeight', { get() { return chatBox._clientHeight; } });
  Object.defineProperty(chatBox, 'scrollTop', { get() { return chatBox._scrollTop; }, set(v) { chatBox._scrollTop = v; } });
  registry.chatBox = chatBox;
  chatBox._connected = true;
  const document = {
    getElementById: (id) => registry[id] || null,
    createElement: (tag) => mkEl(tag, ''),
    querySelector: (sel) => { if (sel.startsWith('#')) return registry[sel.slice(1)] || null; return null; },
    querySelectorAll: () => [],
    body: { appendChild() {} },
  };
  return {
    els: registry, document, mkEl, chatBox,
    lastTsMsg: () => { const ts = chatBox._msgs.filter((m) => m.dataset.ts); return ts.length ? ts[ts.length - 1] : null; },
    voiceBubbles: () => chatBox._msgs.filter((m) => m.className.includes('vb-voice')),
  };
}

// ---------- Fakes de audio ----------
let _blobN = 0;
const fakeURL = { createObjectURL: () => 'blob:fake-' + (++_blobN), revokeObjectURL: () => {} };
class FakeAudio {
  constructor(url) { this.src = url; this.preload = ''; this.duration = 9; this.currentTime = 0; this.paused = true; this._l = {}; FakeAudio._created.push(url); }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
FakeAudio._created = [];

// ---------- Extracción del cliente ----------
function extractClient() {
  const parts = [];
  const escLine = reFrom(appSrc, /const esc = \(s\) =>[^\n]+/);
  if (!escLine) return { error: 'falta esc' };
  parts.push(escLine);
  for (const sig of [
    'function vozEn() {', 'function vozFmt(s) {',
    'function pzVoiceWaveBars() {', 'function pzVoicePlayerHTML(audioUrl, durMs, state) {',
    'function pzVoiceBubbleHTML(audioUrl, durMs, state, ts) {',
    'function pzTsUTC(s) {',
    'function vozBubbleAlFondo(el) {',
    'function vozBubbleSending() {', 'function vozBubbleQuitar() {', 'function vozBubbleEnviada(durMs) {',
    'function pzVoiceBubbleInit(el, audioUrl, durMs) {',
    'function pzChatNearBottom(b) {', 'function pzChatToBottom(b) {', 'function chatScroll(force) {',
    'function chatHoraHtml(ts) {', 'function pzChatHoraFmt(ts) {',
    'function chatAppendMsg(box, html, ts) {',
  ]) {
    const s = fnFrom(appSrc, sig);
    if (!s) return { error: 'falta ' + sig };
    parts.push(s);
  }
  for (const prefix of ['var VB_WAVE_H = ', 'var VB_PLAY_SVG = ', 'var VB_PAUSE_SVG = ', 'var VB_TICKS_SVG = ']) {
    const l = lineFrom(appSrc, prefix);
    if (!l) return { error: 'falta ' + prefix };
    parts.push(l);
  }
  for (const decl of [
    'let PZ_CHAT_PIN = false;',
    "var VOICE_BUBBLE_EL = null, VOICE_BUBBLE_URL = '', VOICE_BUBBLE_TS = 0;",
    "let VOICE_STATE = 'idle', VOICE_URL = '', VOICE_BLOB = null, VOICE_DUR = 0;",
  ]) {
    if (!appSrc.includes(decl)) return { error: 'falta decl ' + decl.slice(0, 40) };
    parts.push(decl);
  }
  return { code: parts.join('\n') };
}

function mkCtx() {
  const dom = makeFakeDom();
  const ctx = {
    console, ME: { lang: 'es' },
    document: dom.document,
    location: { hash: '#/app/chat' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    URL: fakeURL, Audio: FakeAudio,
    $: (sel) => (typeof sel === 'string' && sel[0] === '#' ? dom.document.getElementById(sel.slice(1)) : dom.document.querySelector(sel)),
    $$: (sel) => dom.document.querySelectorAll(sel),
  };
  ctx.window = ctx;
  return { ctx, dom };
}

function msgHtml(role, ts) {
  return `<div class="chat-msg ${role}" data-ts="${ts}"><div>msg ${ts}</div></div>`;
}

async function partB() {
  console.log('Parte B — cliente en vm');
  const ex = extractClient();
  if (ex.error) {
    // En v860 prístino faltan pzTsUTC y vozBubbleAlFondo: los discriminadores fallan, no se rompe la suite.
    for (const n of ['B1b burbuja al fondo con historial sesgado', 'B2 sending al fondo + scroll', 'B3 enviada (conectada) al fondo + scroll', 'B4 enviada (desconectada) re-inserta al fondo + scroll', 'B5 orden: la respuesta queda después de la nota', 'B6a pzTsUTC parsea created_at como UTC (NY)', 'B6b parse ingenuo da +5h (el bug)', 'B6c pzTsUTC con ISO y vacío']) check(n, false, 'extracción: ' + ex.error);
    return;
  }
  // B1: el bug demostrado — historial con data-ts en el futuro (lo que
  // producía el parse ingenuo) + el camino viejo (chatAppendMsg solo).
  {
    const { ctx, dom } = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(ex.code, ctx);
    const now = Date.now();
    const box = dom.chatBox;
    vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(msgHtml('ai', now - 86400000))}, ${now - 86400000});`, ctx);
    for (const off of [5 * 3600e3, 5 * 3600e3 + 60000, 5 * 3600e3 + 120000]) {
      vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(msgHtml('ai', now + off))}, ${now + off});`, ctx);
    }
    // Camino viejo (v860): solo chatAppendMsg con ts=now → cae en el medio.
    const oldHtml = `<div class="chat-msg u vb-voice" data-ts="${now}"><div>nota vieja</div></div>`;
    const placed = vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(oldHtml)}, ${now});`, ctx);
    const lastOld = dom.lastTsMsg();
    check('B1a camino viejo: la nota cae ANTES del bloque futuro (el bug)', placed !== lastOld && lastOld && Number(lastOld.dataset.ts) > now, `último ts=${lastOld && lastOld.dataset.ts} vs now=${now}`);
    // Camino nuevo: vozBubbleSending con el mismo historial sesgado.
    // (La burbuja vieja de la demostración sigue en la caja: se busca
    // la NUEVA por su clase vb-sending, no por conteo total.)
    vm.runInContext(`VOICE_URL = 'blob:fake-9'; VOICE_DUR = 9000;`, ctx);
    vm.runInContext(`vozBubbleSending();`, ctx);
    const vb = dom.voiceBubbles();
    const fresh = vb.find((m) => m.className.includes('vb-sending'));
    check('B1b burbuja al fondo con historial sesgado', !!fresh && dom.lastTsMsg() === fresh, `burbujas=${vb.length} nueva-al-fondo=${dom.lastTsMsg() === fresh}`);
    check('B1c el chat bajó al fondo tras mandar', box.scrollTop === box.scrollHeight && box.scrollHeight > 0, `scrollTop=${box.scrollTop} scrollHeight=${box.scrollHeight}`);
  }
  // B2: sending en caja limpia con solo mensajes futuros.
  {
    const { ctx, dom } = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(ex.code, ctx);
    const now = Date.now();
    const box = dom.chatBox;
    for (const off of [5 * 3600e3, 5 * 3600e3 + 60000]) {
      vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(msgHtml('assistant', now + off))}, ${now + off});`, ctx);
    }
    vm.runInContext(`VOICE_URL = 'blob:fake-10'; VOICE_DUR = 4000;`, ctx);
    vm.runInContext(`vozBubbleSending();`, ctx);
    const vb = dom.voiceBubbles();
    check('B2 sending al fondo + scroll', vb.length === 1 && dom.lastTsMsg() === vb[0] && box.scrollTop === box.scrollHeight, `último=${dom.lastTsMsg() === vb[0]} scroll=${box.scrollTop}/${box.scrollHeight}`);
  }
  // B3: enviada, rama conectada — la burbuja estaba en el medio, vuelve al fondo.
  {
    const { ctx, dom } = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(ex.code, ctx);
    const now = Date.now();
    const box = dom.chatBox;
    for (const off of [-86400000, 5 * 3600e3, 5 * 3600e3 + 60000]) {
      vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(msgHtml('ai', now + off))}, ${now + off});`, ctx);
    }
    vm.runInContext(`VOICE_URL = 'blob:fake-11'; VOICE_DUR = 7000;`, ctx);
    vm.runInContext(`vozBubbleSending();`, ctx);
    const vb0 = dom.voiceBubbles()[0];
    // Simular un re-render que la dejó en el medio: moverla antes del bloque futuro.
    const msgs = box._msgs;
    msgs.splice(msgs.indexOf(vb0), 1);
    msgs.splice(1, 0, vb0);
    vm.runInContext(`vozBubbleEnviada(7000);`, ctx);
    const vb = dom.voiceBubbles();
    check('B3 enviada (conectada) al fondo + scroll', vb.length === 1 && dom.lastTsMsg() === vb[0] && vb[0]._html.includes('vb-ticks') && box.scrollTop === box.scrollHeight, `ticks=${vb[0] && vb[0]._html.includes('vb-ticks')}`);
  }
  // B4: enviada, rama desconectada — la burbuja se perdió en un re-render.
  {
    const { ctx, dom } = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(ex.code, ctx);
    const now = Date.now();
    const box = dom.chatBox;
    for (const off of [-86400000, 5 * 3600e3]) {
      vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(msgHtml('ai', now + off))}, ${now + off});`, ctx);
    }
    vm.runInContext(`VOICE_URL = 'blob:fake-12'; VOICE_DUR = 5000;`, ctx);
    vm.runInContext(`vozBubbleSending();`, ctx);
    const vb0 = dom.voiceBubbles()[0];
    vb0.remove(); // re-render en medio del envío
    vm.runInContext(`vozBubbleEnviada(5000);`, ctx);
    const vb = dom.voiceBubbles();
    check('B4 enviada (desconectada) re-inserta al fondo + scroll', vb.length === 1 && dom.lastTsMsg() === vb[0] && vb[0]._html.includes('vb-ticks') && box.scrollTop === box.scrollHeight, `burbujas=${vb.length}`);
  }
  // B5: orden — la respuesta del cerebro queda DESPUÉS de la nota.
  {
    const { ctx, dom } = mkCtx();
    vm.createContext(ctx);
    vm.runInContext(ex.code, ctx);
    const now = Date.now();
    const box = dom.chatBox;
    vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(msgHtml('ai', now - 3600000))}, ${now - 3600000});`, ctx);
    vm.runInContext(`VOICE_URL = 'blob:fake-13'; VOICE_DUR = 3000;`, ctx);
    vm.runInContext(`vozBubbleSending();`, ctx);
    vm.runInContext(`vozBubbleEnviada(3000);`, ctx);
    const rts = now + 1000;
    vm.runInContext(`chatAppendMsg(document.getElementById('chatBox'), ${JSON.stringify(msgHtml('assistant', rts))}, ${rts});`, ctx);
    const ts = box._msgs.filter((m) => m.dataset.ts);
    const vb = dom.voiceBubbles()[0];
    check('B5 orden: la respuesta queda después de la nota', ts[ts.length - 1].dataset.ts === String(rts) && ts[ts.length - 2] === vb, `cola=${ts.slice(-2).map((m) => m.dataset.ts).join(',')}`);
  }
  // B6: el parse UTC, bajo TZ=America/New_York, en proceso hijo.
  {
    const pz = fnFrom(appSrc, 'function pzTsUTC(s) {');
    const prog = `${pz}\nconsole.log(JSON.stringify({ fixed: pzTsUTC('2026-11-10 14:03:21'), naive: Date.parse('2026-11-10 14:03:21'), iso: pzTsUTC('2026-11-10T14:03:21Z'), empty: pzTsUTC('') }));`;
    const r = spawnSync(process.execPath, ['-e', prog], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8', timeout: 20000 });
    let out = null;
    try { out = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (e) { out = null; }
    const UTC_MS = Date.parse('2026-11-10T14:03:21Z');
    check('B6a pzTsUTC parsea created_at como UTC (NY)', !!out && out.fixed === UTC_MS, out && `fixed=${out.fixed} esperado=${UTC_MS}`);
    check('B6b parse ingenuo da +5h (el bug)', !!out && out.naive === UTC_MS + 5 * 3600e3, out && `naive=${out.naive}`);
    check('B6c pzTsUTC con ISO y vacío', !!out && out.iso === UTC_MS && out.empty === 0, out && `iso=${out.iso} empty=${out.empty}`);
  }
}

// ---------- Parte C: boot real ----------
async function partC() {
  console.log('Parte C — boot real');
  if (SKIP_BOOT) { console.log('  (skip por V872_SKIP_BOOT=1)'); return; }
  const { execSync } = require('child_process');
  let port = 0;
  try {
    const used = execSync('ss -ltn', { encoding: 'utf8' });
    for (let p = 34672; p <= 34695; p++) {
      if (!new RegExp(':' + p + '\\b').test(used)) { port = p; break; }
    }
  } catch (e) { port = 34672; }
  check('C0 puerto libre elegido', port > 0, `port=${port}`);
  if (!port) return;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-v872-'));
  const env = { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules', DATA_DIR: tmp, PORT: String(port) };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  const base = `http://127.0.0.1:${port}`;
  const get = (u) => new Promise((res) => {
    const req = require('http').get(base + u, (r) => {
      const chunks = [];
      r.on('data', (d) => { chunks.push(d); });
      // Buffer.concat (no b += d): un corte de chunk en medio de un
      // carácter multibyte corrompía el md5 de C3 de forma intermitente.
      r.on('end', () => res({ st: r.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', () => res({ st: 0, body: Buffer.alloc(0) }));
    req.setTimeout(8000, () => { req.destroy(); res({ st: 0, body: Buffer.alloc(0) }); });
  });
  try {
    let ver = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const r = await get('/api/version');
      if (r.st === 200) { try { ver = JSON.parse(r.body.toString()); } catch (e) {} if (ver) break; }
    }
    check('C1 /api/version = v872', ver && ver.build === '20261105-v872', ver && ver.build);
    const idx = await get('/');
    check('C2 index 200 con app.js?v=592', idx.st === 200 && idx.body.includes('app.js?v=592'), `st=${idx.st}`);
    const app = await get('/app.js?v=592');
    check('C3 app.js servido = árbol (md5)', app.st === 200 && require('crypto').createHash('md5').update(app.body).digest('hex') === require('crypto').createHash('md5').update(fs.readFileSync(path.join(DIR, 'public/app.js'))).digest('hex'), `st=${app.st}`);
    check('C4 0 errores en stderr', !/Error|error:/.test(err), err.slice(0, 200));
  } finally {
    try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    let alive = true;
    try { process.kill(child.pid, 0); } catch (e) { alive = false; }
    check('C5 proceso muerto por PID exacto', !alive);
    try {
      const used2 = execSync('ss -ltn', { encoding: 'utf8' });
      check('C6 puerto libre después', !new RegExp(':' + port + '\\b').test(used2));
    } catch (e) { check('C6 puerto libre después', false, String(e)); }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await partB();
  await partC();
  console.log(`\nTOTAL: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
