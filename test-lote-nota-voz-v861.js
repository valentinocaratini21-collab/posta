// test-lote-nota-voz-v861.js — LOTE NOTA DE VOZ v861 (fix urgente 9/11 22:18).
// EL BUG (video de Valentino): la nota graba (timer 0:00→0:09, onda visible),
// al soltar no se envía nada: ni burbuja, ni error, ni transcripción. Solo
// los 3 puntos de Posty unos segundos y después nada. El mic es la ÚNICA
// entrada del chat en v846, así que el cliente quedaba sin forma de hablar.
// CAUSA RAÍZ (ver STATUS.md):
//  (1) vozBubbleSending() no pintaba burbuja desde la 2ª nota: VOICE_BUBBLE_EL
//      nunca se limpiaba tras un envío y su guard la confundía con la nueva.
//  (2) chatExchange() no pintaba NADA cuando el cerebro devolvía reply vacío
//      con un edit aplicado (el caso del cambio pedido por voz en el chat
//      anclado): los puntos se iban y quedaba silencio, sin confirmación.
//  (3) Si el onstop del MediaRecorder no disparaba, la nota se perdía sin
//      watchdog. (4) La transcripción solo existía como burbuja de audio.
// EL FIX (solo app.js + BUILD + ?v=): burbuja propia por nota (reset en
// voiceSend); confirmación «listo ✅ ya apliqué el cambio» cuando el edit
// no deja texto ni imagen; watchdog 2 s en voiceStop + guard de una sola
// vista previa por grabación; respaldo de texto si la burbuja de audio se
// pierde; fallo de mic/envoi en la barra con [Reintentar] (nunca silencio).
// Parte A: estática (pins + M78). Parte B: cliente en vm con stubs (el flujo
// de voz REAL: grabar → soltar → enviar → burbuja → transcripción →
// intercambio; 2ª nota; fallo de envío; fallo de mic; onstop muerto;
// edit sin texto; respaldo de texto). Parte C: boot real de server.js.
// Uso: node test-lote-nota-voz-v861.js — sale 0 si todo pasa.
// RE-PIN al re-basar sobre v860 (10/11): A1c/A1d styles?v= 20261225→20261226
// (el vivo v860 trae 20261226; el lote no toca styles.css, se hereda el
// valor del vivo). Sin pins de líneas en esta suite.
// En el árbol v851 prístino TIENE que fallar (B2, B4, B5, B6, B7 + A).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const DIR = __dirname;
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

// ---------- helpers de extracción (mismo patrón que test-lote-chat-clicks) ----------
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  // El sig termina en la { del cuerpo: se cuenta desde ahí (la destructuración
  // de chatExchange trae su propia { } dentro del sig y no debe contarse).
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

// ---------- Mini-DOM falso: lo justo para la barra de voz y el chat ----------
function makeFakeDom() {
  const registry = {};
  function mkBar() {
    const b = {
      style: {}, _h: '16',
      classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, toggle(c, f) { if (f === undefined) f = !this._s.has(c); if (f) this._s.add(c); else this._s.delete(c); }, contains(c) { return this._s.has(c); } },
      getAttribute(k) { return k === 'data-h' ? '16' : undefined; },
    };
    return b;
  }
  function mkEl(tag, id) {
    const el = {
      tagName: (tag || 'div').toUpperCase(), id: id || '',
      _html: '', textContent: '', value: '', src: '',
      dataset: {}, style: {}, className: '',
      children: [], onclick: null, onpointerdown: null, onpointerup: null, onpointermove: null, onpointercancel: null,
      disabled: false, hidden: false, _connected: false, _listeners: {}, _kids: {}, _box: null, _ownedIds: new Set(),
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
        // los ids del html viejo dejan de existir (como en el DOM real)
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
    }});
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
  // chatBox con lista de mensajes
  const chatBox = mkEl('div', 'chatBox');
  chatBox._msgs = [];
  Object.defineProperty(chatBox, 'lastElementChild', { get() { return chatBox._msgs.length ? chatBox._msgs[chatBox._msgs.length - 1] : null; } });
  registry.chatBox = chatBox;
  chatBox._connected = true;
  const chatMsg = mkEl('div', 'chatMsg'); registry.chatMsg = chatMsg; chatMsg._connected = true;
  const chatMicSend = mkEl('button', 'chatMicSend'); registry.chatMicSend = chatMicSend; chatMicSend._connected = true;
  const pzChatFull = mkEl('div', 'pzChatFull'); registry.pzChatFull = pzChatFull; pzChatFull._connected = true;
  const pzChatEstado = mkEl('div', 'pzChatEstado'); registry.pzChatEstado = pzChatEstado; pzChatEstado._connected = true;
  const document = {
    getElementById: (id) => registry[id] || null,
    createElement: (tag) => { const e = mkEl(tag, ''); if (tag === 'canvas') { e.getContext = () => ({ drawImage() {} }); e.toDataURL = () => ''; e.width = 0; e.height = 0; } return e; },
    querySelector: (sel) => { if (sel.startsWith('#')) return registry[sel.slice(1)] || null; return null; },
    querySelectorAll: () => [],
    body: { appendChild() {} },
  };
  return {
    els: registry, document, mkEl, chatBox, chatMsg,
    boxHTML: () => chatBox._msgs.map((m) => m._html).join('\n'),
    voiceBubbles: () => chatBox._msgs.filter((m) => m.className.includes('vb-voice')),
    barHTML: () => chatMsg._html,
  };
}

// ---------- Fakes de audio ----------
function fakeStream() { return { getTracks: () => [{ stop() {} }] }; }
class FakeMediaRecorder {
  static isTypeSupported(m) { return m === 'audio/mp4'; }
  constructor(stream, opts) {
    this.stream = stream;
    this.mimeType = (opts && opts.mimeType) || 'audio/mp4';
    this.ondataavailable = null; this.onstop = null;
    this._stopped = false;
  }
  start() {
    setTimeout(() => { if (this.ondataavailable) this.ondataavailable({ data: new Blob(['x'.repeat(5000)], { type: 'audio/mp4' }) }); }, 0);
  }
  stop() {
    if (this._stopped) return; this._stopped = true;
    if (FakeMediaRecorder._noOnStop) return; // B5: el onstop no dispara nunca
    setTimeout(() => { if (this.onstop) this.onstop(); }, 0);
  }
}
FakeMediaRecorder._noOnStop = false;
class FakeFileReader {
  constructor() { this.result = ''; this.onload = null; this.onerror = null; }
  readAsDataURL(blob) {
    setTimeout(() => {
      if (FakeFileReader._fail) { if (this.onerror) this.onerror(); return; }
      this.result = 'data:audio/mp4;base64,QUJD';
      if (this.onload) this.onload();
    }, 0);
  }
}
let _blobN = 0;
const fakeURL = {
  createObjectURL: () => 'blob:fake-' + (++_blobN),
  revokeObjectURL: () => {},
};
class FakeAudio {
  constructor(url) { this.src = url; this.preload = ''; this.duration = 9; this.currentTime = 0; this.paused = true; this._l = {}; FakeAudio._created.push(url); }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
FakeAudio._created = [];

// ---------- Extracción del cliente (tolerante a v851: sin VOICE_PREVIEW_DONE) ----------
function extractClient() {
  const parts = [];
  const escLine = reFrom(appSrc, /const esc = \(s\) =>[^\n]+/);
  if (!escLine) return { error: 'falta esc' };
  parts.push(escLine);
  for (const sig of [
    'function vozEn() {', 'function vozHostEl() {', 'function vozMsgEl() {', 'function vozMicEl() {',
    'function vozEnInicio() {', 'function vozFmt(s) {',
    'function pzVoiceWaveBars() {', 'function pzVoicePlayerHTML(audioUrl, durMs, state) {',
    'function pzVoiceBubbleHTML(audioUrl, durMs, state, ts) {',
    'function vozBubbleSending() {', 'function vozBubbleQuitar() {', 'function vozBubbleEnviada(durMs) {',
    'function pzVoiceBubbleInit(el, audioUrl, durMs) {',
    'function vozUIgrabando(on) {', 'function voiceTick() {', 'function voiceLevelLoop() {',
    'function voiceRenderBar() {', 'function vozFalloInicio(texto) {', 'function voiceCleanup() {',
    'function pzPickVoiceMime() {', 'function pzVoiceMimeEssence(m) {',
    'async function voiceToggle() {', 'function voiceStop() {', 'function voicePreview() {',
    'function voiceDiscard() {', 'async function voiceSend() {',
    'function pzChatMicIdle(b) {', 'function chatUpdateSendBtn() {',
    'function chatHoraHtml(ts) {', 'function chatAppendMsg(box, html, ts) {',
    'async function chatExchange({ text, display, extra, pushed }) {',
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
    "let VOICE_REC = null, VOICE_CHUNKS = [], VOICE_TIMER = null, VOICE_START = 0, VOICE_MIME = '';",
    "let VOICE_STATE = 'idle', VOICE_URL = '', VOICE_BLOB = null, VOICE_DUR = 0;",
    "let VOICE_FAIL_CODE = '';",
    'let VOICE_CANCEL = false, VOICE_START_X = 0, VOICE_START_Y = 0, VOICE_EARLY_UP = false, VOICE_ABORTED = false;',
    'let VOICE_CTX = null, VOICE_AN = null, VOICE_RAF = 0;',
    "var VOICE_BUBBLE_EL = null, VOICE_BUBBLE_URL = '', VOICE_BUBBLE_TS = 0;",
    'let CHAT_X_QUEUE = Promise.resolve();',
    'const CHAT_X_WATCHDOG_MS = 95000;',
  ]) {
    if (!appSrc.includes(decl)) return { error: 'falta decl ' + decl.slice(0, 40) };
    parts.push(decl);
  }
  // (v861) VOICE_PREVIEW_DONE no existe en v851: si falta, se define igual
  // para que el resto cargue (en v851 nadie lo referencia).
  if (appSrc.includes('let VOICE_PREVIEW_DONE = false;')) parts.push('let VOICE_PREVIEW_DONE = false;');
  else parts.push('let VOICE_PREVIEW_DONE = false; // fallback v851');
  return { code: parts.join('\n') };
}

function mkCtx(apiPost, opts) {
  const dom = makeFakeDom();
  const said = [];
  const ctx = {
    console, ME: { lang: 'es' },
    CHAT: [], CHAT_PHOTOS: [],
    CHAT_IDEA: null, CUSTOM_PAL: null, CHAT_PREVIEWS: [], CHAT_PREV_SEL: 0, CHAT_LOADED: false,
    HF_CHAT_ANCHOR: (opts && opts.anchor) || null,
    document: dom.document,
    navigator: { mediaDevices: { getUserMedia: (opts && opts.getUserMedia) ? opts.getUserMedia : async () => fakeStream() } },
    location: { hash: '#/app/chat' },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
    Blob, URL: fakeURL, FileReader: FakeFileReader, MediaRecorder: FakeMediaRecorder, Audio: FakeAudio,
    api: { post: apiPost, get: async () => ({ ok: true }), patch: async () => ({ ok: true }) },
    $: (sel) => (typeof sel === 'string' && sel[0] === '#' ? dom.document.getElementById(sel.slice(1)) : dom.document.querySelector(sel)),
    $$: (sel) => dom.document.querySelectorAll(sel),
    chatSay: (t) => { said.push(t); },
    chatScroll: () => {},
    chatStripMcMarker: (t) => String(t || ''),
    chatLibThumbs: async () => [],
    chatDraftsCtx: () => [],
    chatRenderProposal: () => {},
    postyTyping: () => {}, stopPostyThinking: () => {}, postyWorking: () => {},
    pzSupervisionPoll: () => {},
    renderChatOptions: () => {}, chatAcceptIdea: () => {}, renderChatIdeaOptions: () => {},
    renderChatShowDrafts: () => {}, renderVozPostCard: () => {}, pzTrabajoPoller: () => {},
    render: () => {}, pzCambioRefrescarTarjeta: () => {}, postyNotify: () => {},
    pzIc: () => '[ic]',
    chatMsgHtml: (role, text, ts, id) => `<div class="chat-msg ${role === 'user' ? 'u' : 'ai'}" data-ts="${Number(ts) || ''}">${String(text || '')}</div>`,
    pzChatHoraFmt: () => '19:00',
  };
  ctx.window = ctx;
  ctx._dom = dom; ctx._said = said;
  return ctx;
}
function loadCtx(ctx) {
  const loaded = extractClient();
  if (loaded.error) throw new Error(loaded.error);
  vm.createContext(ctx);
  vm.runInContext(loaded.code, ctx);
  return ctx;
}
// Graba una nota completa (pointerdown del mic → soltar) y la deja enviada.
async function grabarNota(ctx, transcript) {
  await vm.runInContext('chatUpdateSendBtn()', ctx); // cablea el mic
  const mic = ctx._dom.document.getElementById('chatMicSend');
  mic.onpointerdown({ preventDefault() {}, pointerId: 1, clientX: 100, clientY: 100 });
  await sleep(30); // llega el chunk de audio
  mic.onpointerup({ pointerId: 1, clientX: 100, clientY: 100 });
  await sleep(120); // onstop → preview → send → transcribe → exchange
}

const TRANSCRIPT_A = 'cambiá el avatar del posteo de mañana';
const TRANSCRIPT_B = 'segunda nota de prueba';
async function apiStub({ transcriptFails, editEmpty, transcriptDelay, transcripts } = {}) {
  let txN = 0;
  return async (url, body) => {
    if (String(url).includes('/api/ideas/transcribe')) {
      if (transcriptFails) { const e = new Error('Transcription failed'); e.networkError = true; throw e; }
      if (transcriptDelay) await sleep(transcriptDelay);
      const t = (transcripts && transcripts[txN]) || TRANSCRIPT_A;
      txN++;
      return { ok: true, transcript: t };
    }
    if (String(url).includes('/api/ideas/chat')) {
      if (editEmpty) return { reply: '', edit: { ok: true } };
      return { reply: 'dale, lo hago', edit: null };
    }
    return { ok: true };
  };
}

(async () => {
  // ================= Parte A — estática =================
  console.log('— Parte A: estática —');
  const count = (src, re) => (src.match(re) || []).length;
  check('A0 BUILD 20261105-v861 en server.js (x1)', count(srvSrc, /20261105-v861/g) === 1, `x${count(srvSrc, /20261105-v861/g)}`);
  check('A0b cero restos de v851 en server.js', !srvSrc.includes('20261105-v851'));
  check('A0c BUILD definido x1 en server.js', count(srvSrc, /const BUILD_ID = '20261105-v861';/g) === 1, `x${count(srvSrc, /const BUILD_ID = '20261105-v861';/g)}`);
  check('A1 app.js?v=589 x1 en index ES', count(idxSrc, /app\.js\?v=589/g) === 1, `x${count(idxSrc, /app\.js\?v=589/g)}`);
  check('A1b ?v=581 ya no está en index ES', !idxSrc.includes('app.js?v=581'));
  check('A1c styles.css?v=20261226 x1 en index ES', count(idxSrc, /styles\.css\?v=20261226/g) === 1, `x${count(idxSrc, /styles\.css\?v=20261226/g)}`);
  check('A1d styles.css?v=20261226 x1 en index EN', count(idxEnSrc, /styles\.css\?v=20261226/g) === 1, `x${count(idxEnSrc, /styles\.css\?v=20261226/g)}`);
  check('A1e CHUNK_V sigue v850 (sin cambio)', appSrc.includes("CHUNK_V = '20261105-v850'") || appSrc.includes('CHUNK_V = "20261105-v850"'));
  check('A2 sin carpeta data/ ni node_modules en release', !fs.existsSync(path.join(DIR, 'data')) && !fs.existsSync(path.join(DIR, 'node_modules')));
  // (en v851 la línea existe x1, en vozBubbleQuitar; v861 la suma en voiceSend)
  check('A3 v861: reset de la burbuja en voiceSend (x2: quitar + voiceSend)', count(appSrc, /VOICE_BUBBLE_EL = null; VOICE_BUBBLE_URL = ''; VOICE_BUBBLE_TS = 0;/g) === 2, `x${count(appSrc, /VOICE_BUBBLE_EL = null; VOICE_BUBBLE_URL = ''; VOICE_BUBBLE_TS = 0;/g)}`);
  check('A3b v861: guard de una sola vista previa', appSrc.includes('let VOICE_PREVIEW_DONE = false;') && appSrc.includes('if (VOICE_PREVIEW_DONE) return;'));
  check('A3c v861: watchdog 2 s en voiceStop', appSrc.includes("if (VOICE_STATE === 'rec' && !VOICE_REC) { voiceCleanup(); voicePreview(); }"));
  check('A3d v861: fallo de mic va a la barra', appSrc.includes("VOICE_FAIL_CODE = 'mic'"));
  check('A3e v861: confirmación de edit sin texto', appSrc.includes('ya apliqué el cambio'));
  check('A3f v861: respaldo de texto de la transcripción', appSrc.includes("chatAppendMsg(_box, chatMsgHtml('user', transcript, Date.now())"));
  // M78: toda función llamada por el código cambiado existe en el bundle
  const m78 = ['chatAppendMsg', 'chatMsgHtml', 'chatScroll', 'vozBubbleQuitar', 'voiceDiscard', 'voiceToggle', 'voiceSend', 'vozEnInicio', 'vozFalloInicio', 'voiceRenderBar', 'chatUpdateSendBtn', 'pzPickVoiceMime', 'pzVoiceMimeEssence', 'voiceCleanup', 'voicePreview', 'voiceTick', 'vozUIgrabando', 'vozBubbleEnviada', 'chatExchange', 'render', 'pzCambioRefrescarTarjeta', 'pzVoiceBubbleHTML', 'pzVoiceBubbleInit'];
  const missing78 = m78.filter((f) => !new RegExp('function ' + f + '\\(').test(appSrc));
  check(`A4 M78: funciones auditadas ${m78.length - missing78.length}/${m78.length}`, missing78.length === 0, 'faltan: ' + missing78.join(','));

  // ================= Parte B — cliente en vm =================
  console.log('— Parte B: flujo de voz en cliente (vm) —');
  const loadOk = (() => { const r = extractClient(); return !r.error; })();
  check('B0 carga del cliente (extracción + vm)', loadOk, extractClient().error);

  if (loadOk) {
    // B1 — control: la 1ª nota se envía y deja burbuja + transcripción
    {
      const ctx = loadCtx(mkCtx(await apiStub()));
      await grabarNota(ctx, TRANSCRIPT_A);
      const vb = ctx._dom.voiceBubbles();
      const state = vm.runInContext('VOICE_STATE', ctx);
      check('B1 1ª nota: burbuja de voz enviada (control)', vb.length === 1 && vb[0]._html.includes('vb-ticks'), `burbujas=${vb.length} estado=${state}`);
      check('B1b 1ª nota: estado vuelve a idle', state === 'idle', state);
      check('B1c 1ª nota: transcripción llegó al historial', ctx.CHAT.some((m) => String(m.text || '') === TRANSCRIPT_A), JSON.stringify(ctx.CHAT.map((m) => m.text)));
      check('B1d 1ª nota: respuesta del cerebro pintada', ctx._dom.boxHTML().includes('dale, lo hago'));
    }
    // B2 — LA 2ª nota en la misma sesión tiene su propia burbuja (agujero 1)
    {
      FakeAudio._created = [];
      const ctx = loadCtx(mkCtx(await apiStub({ transcripts: [TRANSCRIPT_A, TRANSCRIPT_B] })));
      await grabarNota(ctx, TRANSCRIPT_A);
      await grabarNota(ctx, TRANSCRIPT_B);
      const vb = ctx._dom.voiceBubbles();
      // La URL del audio no vive en el html (la usa pzVoiceBubbleInit con new
      // Audio): los srcs de Audio creados prueban que cada burbuja suena con
      // su propio audio. En v851 la 2ª nota reescribía la burbuja VIEJA con el
      // audio VIEJO (mismo src dos veces).
      const srcs = FakeAudio._created.slice();
      check('B2 2ª nota: su propia burbuja (no reutiliza la vieja)', vb.length === 2, `burbujas=${vb.length}`);
      check('B2b 2ª nota: audio nuevo (src distinto por nota)', srcs.length === 2 && srcs[0] && srcs[1] && srcs[0] !== srcs[1], srcs.join(' vs '));
      check('B2c 2ª nota: las dos transcripciones en el historial', ctx.CHAT.some((m) => String(m.text || '') === TRANSCRIPT_A) && ctx.CHAT.some((m) => String(m.text || '') === TRANSCRIPT_B), JSON.stringify(ctx.CHAT.map((m) => m.text)));
    }
    // B3 — control: fallo de transcripción → error visible con reintento, y el reintento reenvía
    {
      const api = await apiStub({ transcriptFails: true });
      const ctx = loadCtx(mkCtx(api));
      await grabarNota(ctx, TRANSCRIPT_A);
      const bar = ctx._dom.barHTML();
      const state = vm.runInContext('VOICE_STATE', ctx);
      check('B3 fallo de transcripción: barra de fallo visible', state === 'failed' && bar.includes('Reintentar envío'), `estado=${state} barra=${bar.slice(0, 120)}`);
      check('B3b fallo de transcripción: mensaje de audio', bar.includes('no pude escuchar tu audio'), bar.slice(0, 200));
      // el reintento reenvía (ahora la transcripción anda)
      const api2 = await apiStub({});
      ctx.api.post = api2;
      const retryBtn = ctx._dom.document.getElementById('vozRetrySend');
      if (retryBtn) retryBtn.click();
      await sleep(150);
      check('B3c reintento: la nota se envía tras reintentar', ctx._dom.voiceBubbles().length === 1 && vm.runInContext('VOICE_STATE', ctx) === 'idle', `estado=${vm.runInContext('VOICE_STATE', ctx)}`);
    }
    // B4 — fallo del mic (permiso denegado): barra de fallo visible, sin silencio
    {
      const ctx = loadCtx(mkCtx(await apiStub(), { getUserMedia: async () => { throw new Error('Permission denied'); } }));
      await vm.runInContext('chatUpdateSendBtn()', ctx);
      const mic = ctx._dom.document.getElementById('chatMicSend');
      mic.onpointerdown({ preventDefault() {}, pointerId: 1, clientX: 100, clientY: 100 });
      await sleep(60);
      const bar = ctx._dom.barHTML();
      const state = vm.runInContext('VOICE_STATE', ctx);
      check('B4 fallo del mic: barra de fallo visible (no chatSay)', state === 'failed' && ctx._said.length === 0, `estado=${state} chatSay=${JSON.stringify(ctx._said)}`);
      check('B4b fallo del mic: texto del permiso + Reintentar', bar.includes('no pude usar el micrófono') && bar.includes('Reintentar'), bar.slice(0, 200));
      check('B4c fallo del mic: hay botón para grabar de nuevo', !!ctx._dom.document.getElementById('vozRetry'), bar.slice(0, 200));
      // grabar de nuevo: el permiso ahora anda
      ctx.navigator.mediaDevices.getUserMedia = async () => fakeStream();
      const retryMic = ctx._dom.document.getElementById('vozRetry');
      if (retryMic) retryMic.click();
      await sleep(60);
      check('B4d reintento del mic: vuelve a grabar', vm.runInContext('VOICE_STATE', ctx) === 'rec', vm.runInContext('VOICE_STATE', ctx));
      await vm.runInContext('voiceStop()', ctx); // cerrar limpio
      await sleep(60);
    }
    // B5 — onstop nunca dispara: el watchdog fuerza la vista previa y el envío
    {
      FakeMediaRecorder._noOnStop = true;
      try {
        const ctx = loadCtx(mkCtx(await apiStub()));
        await vm.runInContext('chatUpdateSendBtn()', ctx);
        const mic = ctx._dom.document.getElementById('chatMicSend');
        mic.onpointerdown({ preventDefault() {}, pointerId: 1, clientX: 100, clientY: 100 });
        await sleep(30);
        mic.onpointerup({ pointerId: 1, clientX: 100, clientY: 100 });
        await sleep(120);
        const mid = vm.runInContext('VOICE_STATE', ctx);
        check('B5 onstop muerto: sin watchdog el estado queda trabado en rec (pre-wd)', mid === 'rec', `estado=${mid}`);
        await sleep(2300);
        const fin = vm.runInContext('VOICE_STATE', ctx);
        check('B5b watchdog: la nota sale igual (estado sale de rec)', fin !== 'rec', `estado=${fin}`);
        check('B5c watchdog: burbuja enviada', ctx._dom.voiceBubbles().length === 1 && ctx._dom.voiceBubbles()[0]._html.includes('vb-ticks'), `burbujas=${ctx._dom.voiceBubbles().length}`);
      } finally { FakeMediaRecorder._noOnStop = false; }
    }
    // B6 — edit aplicado sin texto ni imagen: confirmación visible (agujero 2)
    {
      const ctx = loadCtx(mkCtx(await apiStub({ editEmpty: true }), { anchor: { id: 586 } }));
      ctx.CHAT.push({ role: 'user', text: 'cambiá el avatar', ts: Date.now() });
      await vm.runInContext("chatExchange({ text: 'cambiá el avatar', pushed: true })", ctx);
      await sleep(150);
      const box = ctx._dom.boxHTML();
      check('B6 edit sin texto: confirmación «ya apliqué el cambio» visible', box.includes('ya apliqué el cambio'), box.slice(0, 400));
      check('B6b edit sin texto: la confirmación quedó en el historial', ctx.CHAT.some((m) => String(m.text || '').includes('ya apliqué el cambio')), JSON.stringify(ctx.CHAT.map((m) => m.text)));
      check('B6c edit sin texto: no quedan los 3 puntos', !box.includes('chatTyping'), box.slice(0, 300));
    }
    // B7 — la burbuja de audio se pierde (re-render): la transcripción aparece como texto (agujero 4)
    {
      // La transcripción tarda 80 ms: la mutación cae mientras voiceSend la
      // espera (si llegara al instante, voiceSend ya habría pasado el respaldo
      // antes de que la burbuja se pierda y el test no probaría nada).
      const ctx = loadCtx(mkCtx(await apiStub({ transcriptDelay: 80 })));
      await vm.runInContext('chatUpdateSendBtn()', ctx);
      const mic = ctx._dom.document.getElementById('chatMicSend');
      mic.onpointerdown({ preventDefault() {}, pointerId: 1, clientX: 100, clientY: 100 });
      await sleep(30);
      mic.onpointerup({ pointerId: 1, clientX: 100, clientY: 100 });
      await sleep(20); // la burbuja "Enviando…" ya está pintada; el envío sigue en vuelo
      // simular un re-render que borra la burbuja y pierde su referencia
      const vb = ctx._dom.voiceBubbles();
      vb.forEach((b) => b.remove());
      vm.runInContext("VOICE_BUBBLE_EL = null; VOICE_BUBBLE_URL = '';", ctx);
      await sleep(250);
      const box = ctx._dom.boxHTML();
      check('B7 burbuja perdida: la transcripción queda como burbuja de texto', box.includes(TRANSCRIPT_A) && box.includes('chat-msg u'), box.slice(0, 500));
    }
  }

  // ================= Parte C — boot real =================
  if (!process.env.V861_SKIP_BOOT) {
    console.log('— Parte C: boot real —');
    const PORT = 34655;
    const http = require('http');
    const { execSync } = require('child_process');
    const portFree = () => {
      try { return !execSync(`ss -ltn | grep -q ':${PORT} '`).toString(); } catch (e) { return true; }
    };
    const getJson = (p) => new Promise((res, rej) => {
      const req = http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
        let b = '';
        r.on('data', (c) => { b += c; });
        r.on('end', () => res({ status: r.statusCode, body: b }));
      });
      req.on('error', rej);
      req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    });
    check('C0 puerto libre antes del boot (ss)', portFree());
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v861-boot-'));
    let child = null;
    try {
      child = spawn('node', [path.join(DIR, 'server.js')], {
        env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules', DATA_DIR: dataDir, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });
      let ver = null;
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        try { ver = await getJson('/api/version'); break; } catch (e) { if (child.exitCode !== null) break; }
      }
      check('C1 boot levanta y /api/version responde', !!ver && ver.status === 200, ver ? ver.status : 'sin respuesta');
      check('C2 /api/version = 20261105-v861', !!ver && ver.body.includes('20261105-v861'), ver ? ver.body.slice(0, 200) : '');
      const idx = ver ? await getJson('/') : null;
      check('C3 index 200 con app.js?v=589', !!idx && idx.status === 200 && idx.body.includes('app.js?v=589'), idx ? idx.status + ' ' + idx.body.slice(0, 120) : '');
      check('C4 0 errores en stderr del boot', !/Error:|Uncaught|EADDRINUSE/.test(stderr), stderr.slice(0, 300));
      check('C5 proceso vivo al final del check', child.exitCode === null);
    } finally {
      if (child && child.exitCode === null) {
        const pid = child.pid;
        child.kill('SIGTERM');
        for (let i = 0; i < 20; i++) { await sleep(250); if (child.exitCode !== null) break; }
        if (child.exitCode === null) child.kill('SIGKILL');
        await sleep(300);
        try { process.kill(pid, 0); check('C6 proceso muerto por PID exacto', false, 'pid ' + pid + ' sigue vivo'); } catch (e) { check('C6 proceso muerto por PID exacto', true); }
      }
      check('C7 puerto libre después del boot (ss)', portFree());
      try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    }
  } else {
    console.log('— Parte C: saltada (V861_SKIP_BOOT) —');
  }

  // ================= Resultado =================
  console.log(`\nTOTAL: ${pass} ok, ${fail} fallos`);
  if (fails.length) { console.log('FALLOS:'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR DE LA SUITE:', e && e.stack || e); process.exit(2); });
