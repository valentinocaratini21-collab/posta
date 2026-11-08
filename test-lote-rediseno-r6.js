// test-lote-rediseno-r6.js — LOTE REDISENO-R6: CHAT POR TEMAS + CONSERJE (base v793).
// El mock posty-app-design pasa a ser el diseño del TestFlight: el chat
// es la 6ª pestaña estilo Desy — un tema puntual por vez, respuestas
// cortas para tocar, escribir solo como frase corta de excepción (máx.
// 120 caracteres, sobre el tema abierto), barra siempre visible al pie
// con botón «Enviar» a la vista. «Cambialo» mantiene el tema abierto y
// pregunta qué cambiar (foto/texto/hora), muestra la versión nueva en
// el chat y avanza solo al confirmar («Queda así») o dejarlo para
// después. Pregunta de los lunes SOLO por consultas (nueva tabla +
// endpoints /api/weekly-consultas). Conserje: entrada desde Hoy en
// ventana 19:00–00:00 (ruta #/app/conserje, gate token admin la primera
// vez; el diseño v778 ya está en vivo — este lote solo agrega la entrada).
// Rojo-primero: falla en base-v793, pasa en work-v1.
// Uso: node test-lote-rediseno-r6.js [dir-del-arbol] — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
function sliceFn(src, from, to) {
  const a = src.indexOf(from); if (a === -1) throw new Error('no se encontró: ' + from);
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  if (b === -1) throw new Error('no se encontró fin: ' + to);
  return src.slice(a, b);
}

const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(TREE, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const dbjs = fs.readFileSync(path.join(TREE, 'db.js'), 'utf8');
const rit = fs.readFileSync(path.join(TREE, 'ritual-manana.js'), 'utf8');
const idx = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');
const base = path.join(__dirname, '..', '.lote-rediseno-r6-build-scratch', 'base-v793');
const hasBase = fs.existsSync(path.join(base, 'public/app.js'));

// ---------- Parte 0: censo + pines (re-rotar al liberar) ----------
console.log('— 0) censo + pines —');
check('0a app.js del lote (md5 distinto de base v793)', !hasBase || md5(app) !== 'c3337c90429d31b7e2dd593567552023', md5(app));
check('0b styles.css del lote (md5 distinto de base v793)', !hasBase || md5(css) !== '2589972e11db8b2b393d0eae06e18cf9', md5(css));
check('0c server.js del lote (md5 distinto de base v793)', !hasBase || md5(srv) !== '54df4f468dddf78b66e7ad6a8fc3321d', md5(srv));
if (hasBase) {
  check('0d chunk-conserje.js SIN tocar (diseño v778 intacto)', md5(fs.readFileSync(path.join(TREE, 'public/chunk-conserje.js'), 'utf8')) === md5(fs.readFileSync(path.join(base, 'public/chunk-conserje.js'), 'utf8')));
  check('0e index.html ES/EN estampados v806 (?v=541, styles?v=20261192 ES / 20261193 EN)', idx.includes('/app.js?v=541') && idx.includes('/styles.css?v=20261192') && idxEn.includes('/styles.css?v=20261193'));
}
check('0f BUILD_ID estampado v806', srv.includes("const BUILD_ID = '20261105-v806'"));
check('0g CHUNK_V sigue v792 (ningún chunk tocado)', app.includes("const CHUNK_V = '20261105-v792'"));
check('0h censo server: catsMatch 3', cnt(srv, 'catsMatch') === 3);
check('0i censo server: week-redo 16', cnt(srv, 'week-redo') === 16);
check('0j censo server: first_week 3', cnt(srv, 'first_week') === 3);
check('0k censo app: pzGoBack 6', cnt(app, 'pzGoBack') === 6);
check('0l censo app: autofetch 0', cnt(app, 'autofetch') === 0);

// ---------- Parte 1: estática — el motor de temas ----------
console.log('— 1) estática: motor de temas —');
let R6 = '';
let r6SliceOk = true;
try { R6 = sliceFn(app, '/* ===== LOTE REDISENO-R6', '/* ===== (LOTE CHAT-INICIO-DESLIZAR'); } catch (e) { r6SliceOk = false; }
check('1a sección R6 existe y no copia el JS demo del mock', r6SliceOk && R6.length > 5000 && !R6.includes('CHAT_TOPICS') && !R6.includes('appendChat(') && !R6.includes('goScreen('));
for (const f of ['pzTemaCargar', 'pzTemaPintar', 'pzTemaElegir', 'pzTemaOnSend', 'pzTemaAprobarHoy', 'pzTemaGuardarLunes', 'pzTemaMandarComentario', 'pzTemaConfirmar', 'pzTemaRetocar', 'pzTemaAlbumPintar', 'pzTemaHoraChips', 'pzTemaBarraInit', 'pzTemaInit', 'pzTemaAvanzar', 'pzTemaReactivar']) {
  check('1b función ' + f + ' definida', app.includes('function ' + f));
}
check('1c temas en orden: hoy → lunes → comentario', R6.indexOf("kind: 'hoy'") < R6.indexOf("kind: 'lunes'") && R6.indexOf("kind: 'lunes'") < R6.indexOf("kind: 'comentario'"));
check('1d lunes: 4 rangos exactos del mock', R6.includes("'Sin consultas'") || R6.includes('Sin consultas'));
check('1d2 lunes: opciones Sin/1 a 5/6 a 15/Más de 15', app.includes("id: 'lunes-0'") && app.includes("id: 'lunes-1-5'") && app.includes("id: 'lunes-6-15'") && app.includes("id: 'lunes-15+'"));
check('1e cambialo: foto/texto/hora + dejarlo para después', app.includes("id: 'ch-foto'") && app.includes("id: 'ch-texto'") && app.includes("id: 'ch-hora'") && app.includes("id: 'ch-despues'"));
check('1f confirmación: Queda así + Otro cambio', app.includes("id: 'ch-confirmar'") && app.includes("id: 'ch-otro'") && R6.includes('Queda así'));
check('1g fin: Nada pendiente compacto (tira pz-tema-mini, sin Ir a Hoy/Nivel — LOTE CHAT-MEJORA)', R6.includes('Nada pendiente') && app.includes('function pzTemaMiniHTML') && !app.includes("id: 'fin-hoy'") && !app.includes("id: 'fin-nivel'"));
check('1h aprobar: POST /approve en manual, PATCH like en piloto', R6.includes("/api/posts/' + encodeURIComponent(p.id) + '/approve'") && R6.includes("{ action: 'like' }") && R6.includes('f3ApprovalMode()'));
check('1i cambiar: PATCH save-draft foto/texto, PATCH hora', R6.includes("{ action: 'save-draft', image_path:") && R6.includes("{ action: 'save-draft', caption:") && R6.includes('{ scheduled_at: cb.scheduled_at }'));
check('1j retocar: POST /api/album/:id/cambiar-imagen (v757)', R6.includes("/api/album/' + encodeURIComponent(assetId) + '/cambiar-imagen'"));
check('1k comentario: POST /api/comments/:id/reply con la sugerida', R6.includes("/api/comments/' + encodeURIComponent(c.id) + '/reply'") && R6.includes('{ message: c.suggested }'));
check('1l lunes: POST /api/weekly-consultas con el rango', R6.includes("api.post('/api/weekly-consultas', { rango })"));
check('1m hook en chatSend antes del envío normal', app.includes('pzTemaOnSend(text, unsent)') && app.indexOf('pzTemaOnSend(text, unsent)') < app.indexOf('const sendText = text'));
check('1n barra: maxlength 120 + Enviar propio + video', R6.includes('inp.maxLength = 120') && R6.includes("id = 'pzChatSendBtn'") && R6.includes("id = 'pzChatVideoBtn'"));
check('1o video: accept video/* explícito cada vez', R6.includes("picker.accept = 'video/*'"));
check('1p cámara: accept image/* explícito (subir-foto-directa intacto)', app.includes("picker.accept = 'image/*'"));
check('1q no se activa con ancla ni prefill', R6.includes('HF_CHAT_ANCHOR') && R6.includes("sessionStorage.getItem('posty-chat-prefill')"));
check('1r mic: no se convierte en enviar con Enviar propio (pzChatMicIdle)', app.includes('function pzChatMicIdle') && app.includes("document.getElementById('pzChatSendBtn')"));
check('1s al fallar, los botones se reactivan (sin callejón): pzTemaReactivar en aprobar/guardar/mandar/confirmar/retocar',
  app.includes('function pzTemaReactivar') &&
  (app.match(/pzTemaReactivar\(\);/g) || []).length >= 7);
check('1t vista previa de hora: las <b> son HTML real, no texto escapado (sin esc() envolviendo los tags)',
  !/esc\(pzTemaT\('acá está la versión nueva: sale hoy '\) \+ '<b>'/.test(R6) && R6.includes("'</b>' + esc(pzTemaT(' en vez de ', ' instead of ')) + '<b>'"));

// ---------- Parte 2: estática — servidor + conserje ----------
console.log('— 2) estática: servidor + conserje —');
check('2a tabla weekly_consultas en db.js (PK user+week)', dbjs.includes('CREATE TABLE IF NOT EXISTS weekly_consultas') && dbjs.includes('PRIMARY KEY (user_id, week_key)'));
check('2b GET /api/weekly-consultas con requireAuth', srv.includes("app.get('/api/weekly-consultas', requireAuth"));
check('2c POST /api/weekly-consultas valida los 4 rangos', srv.includes("app.post('/api/weekly-consultas', requireAuth") && srv.includes("['0', '1-5', '6-15', '15+']"));
check('2d POST upsert por semana (ON CONFLICT user+week)', srv.includes('ON CONFLICT(user_id, week_key) DO UPDATE SET rango'));
check('2e GET usa la semana del lunes (mondayKeyOf + userTz)', srv.includes('mondayKeyOf(tzToday(userTz(uid)))'));
check('2f ritual/hoy: asset_id para retocar la foto', srv.includes("recCard.asset_id = a.id"));
check('2g cardOf: approval + status para decidir el tema', rit.includes("approval: String(post.approval || '')") && rit.includes("status: String(post.status || '')"));
check('2h conserje: entrada desde Hoy con href real #/app/conserje', app.includes("href=\"#/app/conserje\"") && app.includes('function pzConserjeHoyHTML'));
check('2i conserje: solo ventana 19:00–00:00 (hora local)', app.includes('if (h < 19) return'));
check('2j conserje: solo con token de admin en el dispositivo', app.includes("localStorage.getItem('posta_admin_token')"));
check('2k conserje: sin token no hay entrada (sin callejón)', R6.length > 0 && app.includes("if (!tok) return '';"));
check('2l inicioView pinta la entrada del conserje', app.includes('${pzConserjeHoyHTML()}'));
check('2m chunk-conserje: ruta y gate sin tocar', fs.readFileSync(path.join(TREE, 'public/chunk-conserje.js'), 'utf8').includes("Ruta #/app/conserje. Gate: token de admin"));

// ---------- Parte 3: estática — CSS ----------
console.log('— 3) estática: CSS —');
check('3a tarjeta de tema .pz-tema (vidrio mock)', css.includes('.pz-tema{') && css.includes('.pz-tema-quick button'));
check('3b Enviar propio .pz-chat-send (píldora 44px)', css.includes('.pz-chat-send{') && css.includes('.pz-chat-send svg'));
check('3c offset del input con dock (:has, solo si el dock existe)', css.includes('.bb-app:has(.bb-bar) .pz-chatfull .chat-input-row') && css.includes('margin-bottom:calc(72px + 10px + env(safe-area-inset-bottom))'));
check('3d entrada conserje .pz-conserje-hoy', css.includes('.pz-conserje-hoy{'));
check('3e chat-full: sin avatar repetido en la barra', css.includes('.pz-chatfull .chat-input-row .chat-face{display:none}'));
check('3f no-regresión: tope 10 fotos intacto', app.includes('CHAT_FOTOS_MAX') && app.includes('pzSftPartirMedios(files, CHAT_FOTOS_MAX)'));
check('3g no-regresión: aviso HEIC/sobrantes intacto', app.includes('pzSftAvisoSubida(partes)'));
check('3h no-regresión: gate de invitado en chatSend intacto', app.includes('if (pzIsGuest()) { pzGuestAccountSheet(() => chatSend()); return; }'));
check('3i Enviar no aplastado a 40px en el chat completo (fix desborde 390px: width auto + padding)',
  css.includes('#pzChatFull .chat-input-row .pz-chat-send') && css.includes('width:auto') && css.includes('min-width:0'));

// ---------- Parte 4: VM — lógica pura del motor ----------
console.log('— 4) VM: lógica del motor —');
class FakeEl {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = []; this.dataset = {}; this.style = {};
    this._html = ''; this.value = ''; this.textContent = '';
    this.disabled = false; this.files = []; this.maxLength = 2000;
    this.placeholder = ''; this.title = ''; this.className = '';
    this.onclick = null; this.onchange = null; this.id = '';
    this.classList = { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false };
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  set outerHTML(v) { this._html = String(v); }
  get outerHTML() { return this._html; }
  appendChild(c) { this.children.push(c); return c; }
  insertBefore(c) { this.children.unshift(c); return c; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  setAttribute() {}
  focus() {}
}
function makeDoc() {
  const reg = {};
  const input = new FakeEl('input'); input.id = 'chatInput';
  const box = new FakeEl('div'); box.id = 'chatBox';
  const wrap = new FakeEl('div'); wrap.id = 'pzTemaWrap';
  const row = new FakeEl('div'); row.className = 'chat-input-row';
  const mic = new FakeEl('button'); mic.id = 'chatMicSend';
  const file = new FakeEl('input'); file.id = 'chatFile';
  const card = new FakeEl('div'); card.id = 'chatCard';
  reg.chatInput = input; reg.chatBox = box; reg.pzTemaWrap = wrap; reg.chatMicSend = mic; reg.chatFile = file; reg.chatCard = card;
  const doc = {
    _reg: reg, _row: row, _created: [],
    getElementById: (id) => reg[id] || null,
    querySelector: (sel) => {
      const s = String(sel);
      if (s.includes('chat-input-row')) return row;
      if (s === '#chatBox') return box;
      if (s === '#chatMicSend') return mic;
      if (s === '#chatInput') return input;
      if (s === '#chatFile') return file;
      if (s === '#chatCard') return card;
      return null;
    },
    querySelectorAll: () => [],
    createElement: (tag) => {
      const el = new FakeEl(tag);
      doc._created.push(el);
      // Registrar por id cuando se asigne (el guarda de chatUpdateSendBtn
      // busca #pzChatSendBtn por getElementById).
      Object.defineProperty(el, 'id', {
        get() { return this._id || ''; },
        set(v) { this._id = String(v); if (v) reg[v] = el; },
        configurable: true,
      });
      return el;
    },
    addEventListener: () => {},
  };
  return { doc, input, box, wrap, row, mic, file, reg };
}
function escFn(src) {
  const m = src.match(/^const esc = \(s\) => [^\n]*\n/m);
  if (!m) throw new Error('no se encontró esc global');
  return m[0];
}
let R6SRC = '', MIC_SRC = '';
let vmAsync = Promise.resolve();
if (r6SliceOk) {
  R6SRC = sliceFn(app, '/* ===== LOTE REDISENO-R6', '/* ===== (LOTE CHAT-INICIO-DESLIZAR');
  MIC_SRC = sliceFn(app, 'function pzChatMicIdle', 'function bindChat() {');
} else {
  check('4x motor ausente en base (rojo-primero)', false, 'sin sección R6');
}
if (r6SliceOk) {
  const { doc, input, box, wrap } = makeDoc();
  const apiCalls = [];
  const said = [];
  const sandbox = {
    console, setTimeout, clearTimeout,
    document: doc,
    window: {},
    localStorage: { getItem: () => '', setItem: () => {}, removeItem: () => {} },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hash: '' },
    ME: { lang: 'es' },
    CHAT: [], CHAT_PHOTOS: [], ASSETS: [],
    HF_CHAT_ANCHOR: null,
    VOICE_STATE: 'idle',
    api: {
      get: async (u) => { apiCalls.push(['GET', u]); return {}; },
      post: async (u, b) => { apiCalls.push(['POST', u, b]); return { ok: true }; },
      patch: async (u, b) => { apiCalls.push(['PATCH', u, b]); return { ok: true }; },
    },
    pzIc: (n) => '[' + n + ']',
    chatSay: (t) => { said.push(t); },
    chatScroll: () => {},
    chatUpdateSendBtn: () => {},
    f3ApprovalMode: async () => ({ manual: true, known: true }),
    assetPhotos: () => [],
    pcTz: () => 'America/New_York',
    vozEn: () => false,
    $: (s) => doc.querySelector(s),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(escFn(app) + '\n' + R6SRC + '\nthis.__r6 = { pzTemaNorm, pzTemaHora, pzTemaHoraChips, pzTemaOnSend, pzTemaElegir, pzTemaPintar, pzTemaBarraInit, pzTemaTituloTema, pzTemaConfirmQuick };', sandbox);
  const R = sandbox.__r6;
  check('4a norm: quita acentos y minúsculas', R.pzTemaNorm('Canción MÁS') === 'cancion mas');
  check('4b hora: 19:30 en zona del negocio', R.pzTemaHora('2026-11-08T19:30:00-05:00') === '19:30', R.pzTemaHora('2026-11-08T19:30:00-05:00'));
  // Chips de hora: +1h/+2h el mismo día; 23:30 no ofrece 00:30/01:30.
  sandbox.PZ_TEMA = { temas: [{ kind: 'hoy', post: { id: 7, scheduled_at: '2026-11-08T19:30:00-05:00', imagen: 'x.jpg' }, hora: '19:30' }], idx: 0, stage: 'change-hora', cambio: null };
  const chips = R.pzTemaHoraChips();
  check('4c chips de hora: 20:30 y 21:30', chips.length === 2 && chips[0].text === '20:30' && chips[1].text === '21:30', JSON.stringify(chips));
  sandbox.PZ_TEMA.temas[0].post.scheduled_at = '2026-11-08T23:30:00-05:00';
  check('4d chips de hora: a las 23:30 no hay cambio el mismo día', R.pzTemaHoraChips().length === 0);
  // Pintado del tema lunes: 4 rangos para tocar.
  sandbox.PZ_TEMA = { temas: [{ kind: 'lunes', week_key: '2026-11-02' }], idx: 0, stage: 'topic', cambio: null };
  R.pzTemaPintar();
  check('4e pinta lunes: título + 4 rangos', wrap.innerHTML.includes('La pregunta de los lunes') && wrap.innerHTML.includes("data-tema-op=\"lunes-0\"") && wrap.innerHTML.includes("data-tema-op=\"lunes-15+\""), wrap.innerHTML.slice(0, 200));
  // Pintado fin: Nada pendiente + destinos reales.
  sandbox.PZ_TEMA = { temas: [], idx: 0, stage: 'topic', cambio: null };
  R.pzTemaPintar();
  check('4f pinta fin: Nada pendiente compacto (tira, sin botones — LOTE CHAT-MEJORA)', wrap.innerHTML.includes('Nada pendiente') && wrap.innerHTML.includes('pz-tema-mini') && !wrap.innerHTML.includes('data-tema-op='));
  // onSend: un número en el lunes guarda el rango y consume el envío.
  sandbox.PZ_TEMA = { temas: [{ kind: 'lunes', week_key: '2026-11-02' }], idx: 0, stage: 'topic', cambio: null };
  input.value = '8';
  const consumed = R.pzTemaOnSend('8', []);
  check('4g onSend lunes "8" → consume y POST 6-15', consumed === true && apiCalls.some((c) => c[0] === 'POST' && c[1] === '/api/weekly-consultas' && c[2] && c[2].rango === '6-15'), JSON.stringify(apiCalls));
  check('4h onSend lunes limpia el input', input.value === '');
  // onSend: «cambialo» en el posteo abre el cambio, no el chat libre.
  sandbox.PZ_TEMA = { temas: [{ kind: 'hoy', post: { id: 7, scheduled_at: '2026-11-08T19:30:00-05:00', imagen: 'x.jpg', asset_id: 3 }, hora: '19:30' }], idx: 0, stage: 'topic', cambio: null };
  const c2 = R.pzTemaOnSend('cambialo', []);
  check('4i onSend hoy "cambialo" → consume y abre change-what', c2 === true && sandbox.PZ_TEMA.stage === 'change-what');
  // onSend: sin tema (fin) no consume → chat libre.
  sandbox.PZ_TEMA = { temas: [], idx: 0, stage: 'topic', cambio: null };
  check('4j onSend sin tema no consume', R.pzTemaOnSend('hola', []) === false);
  // Barra: video + Enviar + maxlength 120.
  const d2 = makeDoc();
  sandbox.__doc2 = d2.doc;
  vm.runInContext('document = this.__doc2;', sandbox);
  vm.runInContext('this.__barra = pzTemaBarraInit;', sandbox);
  try { sandbox.__barra(); } catch (e) { check('4k barra: pzTemaBarraInit no rompe', false, e.message); }
  check('4k barra: video + Enviar creados', d2.doc._created.some((e) => e.id === 'pzChatVideoBtn') && d2.doc._created.some((e) => e.id === 'pzChatSendBtn'));
  check('4l barra: input maxlength 120', d2.input.maxLength === 120);
  check('4m barra: video con onclick (picker)', d2.doc._created.some((e) => e.id === 'pzChatVideoBtn' && typeof e.onclick === 'function'));
  // chatUpdateSendBtn: con Enviar propio el mic queda mic; sin él, morph.
  const micSrc = MIC_SRC;
  const sbx = {
    console,
    document: d2.doc,
    VOICE_STATE: 'idle',
    CHAT_PHOTOS: [],
    pzIc: (n) => '[' + n + ']',
    vozEn: () => false,
    voiceToggle: () => {},
    voiceDiscard: () => {},
    voiceStop: () => {},
    $: (s) => curDoc.querySelector(s),
    VOICE_CANCEL: false, VOICE_EARLY_UP: false, VOICE_ABORTED: false, VOICE_START_X: 0, VOICE_START_Y: 0,
  };
  let curDoc = d2.doc;
  sbx.window = sbx;
  vm.createContext(sbx);
  vm.runInContext(micSrc + '\nthis.__upd = chatUpdateSendBtn;', sbx);
  d2.input.value = 'hola';
  sbx.__upd();
  const sendBtn = d2.doc._created.find((e) => e.id === 'pzChatSendBtn');
  check('4n send propio habilitado con texto', sendBtn && sendBtn.disabled === false);
  check('4o mic queda mic con Enviar propio', d2.mic.innerHTML === '[mic]');
  // Sin botón propio: morph a enviar.
  const d3 = makeDoc();
  sbx.__doc3 = d3.doc;
  curDoc = d3.doc;
  vm.runInContext('document = this.__doc3;', sbx);
  d3.input.value = 'hola';
  sbx.__upd();
  check('4p sin Enviar propio: mic se convierte en enviar', d3.mic.innerHTML === '[send]');
  // Conserje: gate por token + ventana (Date fija en el sandbox).
  const cjSrc = sliceFn(app, 'function pzConserjeHoyHTML()', 'async function inicioView() {');
  function conserjeCon(hora, token) {
    const sb = {
      console, ME: { lang: 'es' }, HF_VISITOR: false,
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      localStorage: { getItem: () => token || '' },
      Date: class { constructor() {} getHours() { return hora; } },
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(cjSrc + '\nthis.__cj = pzConserjeHoyHTML;', sb);
    return sb.__cj();
  }
  check('4q conserje 20:00 + token → enlace #/app/conserje', conserjeCon(hourFix(20), 'tok').includes('#/app/conserje'));
  function hourFix(h) { return h; }
  check('4r conserje 10:00 + token → sin entrada', conserjeCon(10, 'tok') === '');
  check('4s conserje 20:00 sin token → sin entrada', conserjeCon(20, '') === '');
  // 4t/4u reactivar tras fallo: los botones del tema vuelven a estar
  // tocables (el bug de la repro: sin IG, «Mandar la respuesta» dejaba
  // «Dejarla para después» deshabilitado para siempre).
  const reacBtns = [new FakeEl('button'), new FakeEl('button')];
  reacBtns.forEach((b) => { b.disabled = true; b.classList.add('picked'); });
  // pzTemaReactivar busca #pzTemaWrap en el document vigente del sandbox
  // (d2.doc): el stub va sobre ese wrap, no sobre el del primer doc.
  d2.wrap.querySelectorAll = () => reacBtns;
  vm.runInContext('this.__reac = pzTemaReactivar;', sandbox);
  sandbox.__reac();
  check('4t reactivar: botones deshabilitados vuelven a habilitarse', reacBtns.every((b) => b.disabled === false));
  vmAsync = (async () => {
    sandbox.api.post = async () => ({ ok: false, error: 'Instagram no conectado' });
    sandbox.PZ_TEMA = { temas: [{ kind: 'comentario', c: { id: 7, suggested: 'hola' } }], idx: 0 };
    reacBtns.forEach((b) => { b.disabled = true; });
    vm.runInContext('this.__mandar = pzTemaMandarComentario;', sandbox);
    await sandbox.__mandar();
    check('4u mandar con fallo: error honesto en el chat', said.some((t) => String(t).includes('no se pudo mandar')));
    check('4v mandar con fallo: botones reactivados', reacBtns.every((b) => b.disabled === false));
  })();
}

// ---------- Parte 5: boot real — weekly-consultas + ritual + aprobar ----------
console.log('— 5) boot real —');
const PORT = 34571;
const TEST_KEY = 'boot-test-key-r6';
const ADMIN_TOKEN = 'boot-test-token-r6';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r6-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function reqJson(method, p, body, cookie, contentType) {
  const headers = {};
  if (contentType) headers['Content-Type'] = contentType;
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method, headers, body: body === undefined ? undefined : (contentType ? body : JSON.stringify(body)) });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j, setCookie: r.headers.get('set-cookie') };
}

async function parteBoot() {
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN, NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    check('5a el servidor levanta con el lote', up);
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await reqJson('GET', '/api/version');
    check('5b /api/version = v806', ver.json && ver.json.build === '20261105-v806', JSON.stringify(ver.json));
    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY, { kind: 'join', ig: 'r6-test', device: 'test-device-r6' });
    check('5c join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';
    const uid = join.json.user_id;
    // El invitado de prueba es is_guest=1: para probar los endpoints de
    // cliente pago (aprobar/PATCH) se lo marca como cuenta normal, solo
    // en esta DB temporal.
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    try { db.exec('PRAGMA busy_timeout = 5000'); } catch (e) {}
    try { db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid); } catch (e) {}
    const sinCookie = await reqJson('GET', '/api/weekly-consultas');
    check('5d GET /api/weekly-consultas sin sesión → 401', sinCookie.status === 401, String(sinCookie.status));
    const g0 = await reqJson('GET', '/api/weekly-consultas', undefined, cookie);
    check('5e GET sin respuesta → rango null + week_key de lunes', g0.status === 200 && g0.json && g0.json.rango === null && /^\d{4}-\d{2}-\d{2}$/.test(g0.json.week_key || ''), JSON.stringify(g0.json));
    const bad = await reqJson('POST', '/api/weekly-consultas', { rango: 'muchas' }, cookie);
    check('5f POST rango inválido → 400', bad.status === 400, JSON.stringify(bad.json));
    const p1 = await reqJson('POST', '/api/weekly-consultas', { rango: '6-15' }, cookie);
    check('5g POST 6-15 → ok', p1.status === 200 && p1.json && p1.json.ok === true && p1.json.rango === '6-15', JSON.stringify(p1.json));
    const g1 = await reqJson('GET', '/api/weekly-consultas', undefined, cookie);
    check('5h GET tras POST → 6-15', g1.json && g1.json.rango === '6-15', JSON.stringify(g1.json));
    const p2 = await reqJson('POST', '/api/weekly-consultas', { rango: '0' }, cookie);
    const g2 = await reqJson('GET', '/api/weekly-consultas', undefined, cookie);
    check('5i POST 0 sobrescribe (una respuesta por semana)', p2.status === 200 && g2.json && g2.json.rango === '0', JSON.stringify(g2.json));
    // Posteo de hoy sembrado: foto real subida + fila programada.
    const up1 = await reqJson('POST', '/api/media', PNG_1X1, cookie, 'image/png');
    check('5j subida de foto ok (path real)', up1.status === 200 && up1.json && typeof up1.json.path === 'string', JSON.stringify(up1.json));
    const imgPath = up1.json.path;
    const cols = db.prepare('PRAGMA table_info(posts)').all().map((c) => c.name);
    const has = (c) => cols.includes(c);
    const hoy = new Date();
    const isoHoy = hoy.toISOString().slice(0, 10);
    const sched = isoHoy + 'T19:30:00-05:00';
    const fields = ['user_id', 'image_path', 'caption', 'status', 'scheduled_at'];
    const vals = [uid, imgPath, 'El taladro que te salva el finde', 'scheduled', sched];
    if (has('approval')) { fields.push('approval'); vals.push('pending'); }
    if (has('media_type')) { fields.push('media_type'); vals.push('image'); }
    if (has('tipo')) { fields.push('tipo'); vals.push(''); }
    const ins = db.prepare(`INSERT INTO posts (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...vals);
    const postId = Number(ins.lastInsertRowid);
    check('5k posteo de hoy sembrado (id ' + postId + ')', postId > 0);
    const ritHoy = await reqJson('GET', '/api/ritual/hoy', undefined, cookie);
    const card = ritHoy.json && ritHoy.json.cartas && ritHoy.json.cartas[0];
    check('5l /api/ritual/hoy trae la carta de hoy', ritHoy.status === 200 && !!card && Number(card.id) === postId, JSON.stringify((ritHoy.json && ritHoy.json.cartas || []).map((c) => c && c.id)));
    check('5m carta trae approval/status para el tema', !!card && card.approval === 'pending' && card.status === 'scheduled', JSON.stringify(card && { approval: card.approval, status: card.status }));
    check('5n carta trae asset_id (retocar la foto)', !!card && Number(card.asset_id) > 0, JSON.stringify(card && card.asset_id));
    const ap = await reqJson('POST', '/api/posts/' + postId + '/approve', {}, cookie);
    check('5o POST /api/posts/:id/approve → ok (camino manual)', ap.status === 200 && ap.json && ap.json.ok === true, JSON.stringify(ap.json));
    const rowAp = db.prepare('SELECT approval FROM posts WHERE id = ?').get(postId);
    check('5p approval guardado = approved', rowAp && rowAp.approval === 'approved', JSON.stringify(rowAp));
    // Segundo posteo para probar el cambio de texto/hora (PATCH). Va
    // MAÑANA (un posteo de feed por día: mismo día choca con el de hoy
    // y el servidor lo reprograma a otro día).
    const manana = new Date(hoy.getTime() + 86400000);
    const isoManana = manana.toISOString().slice(0, 10);
    const schedT = isoManana + 'T19:30:00-05:00';
    const ins2 = db.prepare(`INSERT INTO posts (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(uid, imgPath, 'Texto viejo', 'scheduled', schedT, ...(has('approval') ? ['pending'] : []), ...(has('media_type') ? ['image'] : []), ...(has('tipo') ? [''] : []));
    const postId2 = Number(ins2.lastInsertRowid);
    const pa = await reqJson('PATCH', '/api/posts/' + postId2, { action: 'save-draft', caption: 'Texto nuevo cortito' }, cookie);
    check('5q PATCH save-draft caption → ok', pa.status === 200 && pa.json && pa.json.ok === true, JSON.stringify(pa.json));
    const rowTx = db.prepare('SELECT caption FROM posts WHERE id = ?').get(postId2);
    check('5r caption nuevo guardado', rowTx && rowTx.caption === 'Texto nuevo cortito', JSON.stringify(rowTx));
    const sched2 = isoManana + 'T20:30:00-05:00';
    const ph = await reqJson('PATCH', '/api/posts/' + postId2, { scheduled_at: sched2 }, cookie);
    check('5s PATCH scheduled_at → ok + hora nueva', ph.status === 200 && ph.json && ph.json.ok === true && String(ph.json.scheduled_at || '').includes('20:30'), JSON.stringify(ph.json));
    db.close();
  } finally { kill(); }
}

(async () => {
  try { await vmAsync; } catch (e) { check('4w VM async sin excepción', false, e.message); }
  try { await parteBoot(); } catch (e) { check('5x boot sin excepción', false, e.message); }
  console.log(`\nlote-rediseno-r6: ${pass} ok, ${fail} mal`);
  if (fails.length) console.log('fallos:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
