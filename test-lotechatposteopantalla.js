// test-lotechatposteopantalla.js — LOTE CHAT-POSTEO-PANTALLA (2/11, SIN PUSH).
// Decisión de Valentino 2/11 ~12:42 con captura y botón: al ir al chat
// desde un posteo, la pantalla se TRANSFORMA en un chat completo y
// deslizar abajo vuelve exacto al posteo. Captura 12:41: el mini-chat de
// la hoja del detalle quedaba apretado abajo, el teclado iOS + su barra
// accesoria ^/v/✓ se comían media pantalla y cortaban el campo.
// Fix: NO se duplica el chat. Se MUEVE el #chatCard único de siempre a
// una capa fija de pantalla completa (pzPostChat) y al cerrar se devuelve
// a su padre original; la altura la manda visualViewport; el desliz
// hacia abajo (o el botón ←, o Escape) vuelve al origen exacto.
// Node puro: asserts estáticos + VM con DOM falso sobre el bloque nuevo.
// Pines de versión: base v558 servida (app ?v=373, styles ?v=20261090);
// el server.js DE ESTE ÁRBOL es v557 (caveat: el v558 real de Juli no
// existe en ningún dir local; la liberación lo re-basa ANTES de bumpear).
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
const block = sliceFn(app, 'var PZ_POSTCHAT_ORIGIN', '// (Corrección grilla 2026-10-25)');
const closeSlice = sliceFn(block, 'function pzPostChatClose', 'function pzPostChatReturn');

// ---------- Versiones + censo (base v558; server del árbol = v557, caveat) ----------
t(srv.includes("const BUILD_ID = '20261101-v566'"), 'server del árbol: BUILD v566');
t(idx.includes('app.js?v=379'), 'index ES: app.js?v=379');
t(idx.includes('styles.css?v=20261095'), 'index ES: styles 20261095');
t(idxEn.includes('styles.css?v=20261091') && !idxEn.includes('app.js?v='), 'en/index: styles 20261091 intacto (deriva preexistente, no se toca, como v562-v565)');
t(app.includes("const CHUNK_V = '20261101-v565'"), 'CHUNK_V sigue v565 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6 (posteo no lo toca: +1 cabecera chat-pantalla +1 desliz, lotes hermanos en el mismo push)');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');
t(!srv.includes('pzPostChat'), 'server.js sin tocar (sin pzPostChat)');

// ---------- El bloque existe y no duplica el chat ----------
t(block.length > 1000, 'bloque pzPostChat presente');
t(!block.includes('chatCardHTML('), 'bloque: no renderiza un chat nuevo (reutiliza el #chatCard único)');
t(block.includes('function pzPostChatOpen') && block.includes('function pzPostChatClose'), 'bloque: open + close definidos');
t(block.includes('function pzPostChatKbSync') && block.includes('visualViewport'), 'bloque: sync por visualViewport');
t(block.includes('function pzPostChatReturn') && block.includes('scfOpenPop'), 'bloque: retorno reabre la capa scf del posteo');
t(!closeSlice.includes('hfSetAnchor(null)'), 'close: no borra el ancla (el chat principal queda con su contexto)');
t(app.includes('function hfOpenChatForPost(post) {\n  if (!post) return;\n  // (LOTE CHAT-POSTEO-PANTALLA)'), 'hfOpenChatForPost redirigido a la pantalla (no a la hoja)');
t(!sliceFn(app, 'function hfOpenChatForPost', 'function hfAskChangeBtnHTML').includes('mzOpenSheet'), 'hfOpenChatForPost ya no abre mzSheet');
t(sliceFn(app, 'function hfAskChange(post)', 'function hfAskChangeBtnHTML').includes('pzPostChatCaptureOrigin'), 'hfAskChange captura el origen ANTES de cerrar el detalle');
t(sliceFn(app, 'function pzHablarDePosteo', 'async function pzHablarClick').includes('pzPostChatCaptureOrigin'), 'pzHablarDePosteo captura el origen ANTES de cerrar');
t(app.includes('PZ_POSTCHAT_PENDING_POST') && sliceFn(app, 'if (typeof HF_CHAT_OPEN_PENDING', 'function bindChat(').includes('pzPostChatOpen(_pp)'), 'bindInicio: el pendiente de un posteo abre la pantalla, no la hoja');

// ---------- Swipe: reglas en el código ----------
t(block.includes("touchstart") && block.includes("touchmove") && block.includes("touchend"), 'swipe: listeners touchstart/move/end');
t(block.includes('dy >= 90'), 'swipe: umbral de cierre 90px');
t(block.includes("ae.id === 'chatInput'") && block.includes('ae.blur()'), 'swipe: con teclado abierto el primer desliz solo cierra el teclado');
t(block.includes('pzPostChatBack'), 'botón ← visible como respaldo');
t(block.includes("e.key === 'Escape'"), 'Escape también vuelve (desktop)');
t(block.includes('scrollTop <= 0'), 'swipe: no pelea con el scroll (solo con el historial arriba del todo o desde cabecera/tirador)');

// ---------- CSS de la capa ----------
t(css.includes('.pz-postchat{position:fixed'), 'css: capa fija de pantalla completa');
t(css.includes('.pz-postchat-body .chat-box{flex:1 1 auto;max-height:none'), 'css: historial con scroll interno, sin tope de 320px');
t(css.includes('.pz-postchat-body .chat-input-row{flex:none}'), 'css: campo anclado abajo');
t(css.includes('body.pz-postchat-open{overflow:hidden}'), 'css: fondo bloqueado mientras el chat está abierto');
t(css.indexOf('.pz-postchat{') < css.indexOf('/* ============ LOTE CHAT SIMPLE'), 'css: bloque antes del marcador CHAT SIMPLE (fuera del slice CHAT4S)');

// ---------- VM con DOM falso: open / kb / close / retorno ----------
function fakeEl(id) {
  const el = {
    id: id || '', hidden: false, style: {}, dataset: {}, parentNode: null, nextSibling: null,
    children: [], scrollTop: 0, _focused: false, _removed: false, _cls: new Set(),
    classList: { add(c) { el._cls.add(c); }, remove(c) { el._cls.delete(c); }, contains(c) { return el._cls.has(c); } },
    appendChild(c) { c.parentNode = el; el.children.push(c); c.nextSibling = null; return c; },
    insertBefore(c, ref) { c.parentNode = el; const i = el.children.indexOf(ref); if (i === -1) el.children.push(c); else el.children.splice(i, 0, c); return c; },
    remove() { el._removed = true; if (el.parentNode) { const i = el.parentNode.children.indexOf(el); if (i !== -1) el.parentNode.children.splice(i, 1); } el.parentNode = null; },
    focus() { el._focused = true; },
    blur() { el._focused = false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  return el;
}
function makeCtx() {
  const byId = {};
  const card = fakeEl('chatCard');
  const sheetBody = fakeEl("mzSheetBody"); sheetBody.isConnected = true;
  sheetBody.appendChild(card);
  const input = fakeEl('chatInput');
  const box = fakeEl('chatBox');
  const body = { _cls: new Set(), classList: { add(c) { body._cls.add(c); }, remove(c) { body._cls.delete(c); }, contains(c) { return body._cls.has(c); } },
    insertAdjacentHTML(pos, html) {
      for (const m of html.matchAll(/id="([^"]+)"/g)) {
        const e = fakeEl(m[1]);
        byId[m[1]] = e;
      }
    } };
  byId.chatCard = card; byId.mzSheetBody = sheetBody; byId.chatInput = input; byId.chatBox = box;
  const calls = { anchor: [], scf: [], scrollTo: [], render: 0, closePop: 0, detailClose: 0, pcClose: 0 };
  const docListeners = {};
  const ctx = {
    console, setTimeout: (fn) => { try { fn(); } catch (e) {} },
    document: {
      body,
      getElementById: (id) => byId[id] || null,
      querySelector: (sel) => {
        if (sel.indexOf('.scf-mini-x') !== -1) return ctx.__tile || null;
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: (ev, fn) => { docListeners[ev] = fn; },
    },
    window: {},
    location: { hash: '#/app/schedule' },
    scrollY: 0,
    hfSetAnchor: (p) => { calls.anchor.push(p ? p.id : null); },
    hfPaintAnchor: () => {},
    chatScroll: () => {},
    pzReducedMotion: () => false,
    mzHomeHash: () => '#/app/inicio',
    render: () => { calls.render++; },
    scfClosePop: () => { calls.closePop++; },
    hfDetailClose: () => { calls.detailClose++; },
    pcCloseSheet: () => { calls.pcClose = (calls.pcClose || 0) + 1; },
    scfOpenPop: (w, pinned) => { calls.scf.push([w, pinned]); },
    hfIsEn: () => false,
    SCF_POP: { wrap: {} },
    ME: { lang: 'es' },
    __calls: calls, __byId: byId, __card: card, __input: input, __box: box, __sheetBody: sheetBody,
  };
  ctx.window = ctx;
  ctx.window.scrollTo = (x, y) => { calls.scrollTo.push([x, y]); };
  ctx.window.visualViewport = { height: 500, offsetTop: 10, addEventListener() {} };
  ctx.window.addEventListener = () => {};
  ctx.window.matchMedia = () => ({ matches: false });
  vm.createContext(ctx);
  const openSrc = sliceFn(app, 'function hfOpenChatForPost', '/* (ARMA TODO');
  const askSrc = sliceFn(app, 'function hfAskChange(post)', 'function hfAskChangeBind');
  const hablarSrc = sliceFn(app, 'function pzHablarDePosteo', 'async function pzHablarClick');
  vm.runInContext(openSrc + '\n' + askSrc + '\n' + hablarSrc + '\n' + block, ctx);
  return ctx;
}

// Open: mueve el nodo, muestra la capa, fija el ancla, sincroniza el teclado.
{
  const c = makeCtx();
  vm.runInContext("PZ_POSTCHAT_ORIGIN = null; PZ_POSTCHAT_NODE = null;", c);
  const post = { id: 42, image_path: 'x.jpg', caption: 'hola', status: 'scheduled' };
  const opened = vm.runInContext('pzPostChatOpen({id: 42, image_path: "x.jpg", caption: "hola", status: "scheduled"})', c);
  t(opened === true, 'vm open: devuelve true con posteo válido');
  t(c.__byId.pzPostChat && c.__byId.pzPostChat.hidden === false, 'vm open: capa visible');
  t(c.__card.parentNode === c.__byId.pzPostChatBody, 'vm open: #chatCard movido al cuerpo de la capa');
  t(c.__calls.anchor[0] === 42, 'vm open: ancla fijada con el id real del posteo');
  t(c.__byId.pzPostChat.style.height === '500px' && c.__byId.pzPostChat.style.top === '10px', 'vm kb: altura 500px + top 10px desde visualViewport');
  t(c.__input._focused === true, 'vm open: input enfocado (teclado listo)');
  t(c.document.body._cls.has('pz-postchat-open'), 'vm open: body bloqueado');
  // Close con origen scf: devuelve el nodo y reabre la capa del posteo.
  c.__tile = fakeEl('tile');
  vm.runInContext("PZ_POSTCHAT_ORIGIN = {kind: 'scf', hash: '#/app/schedule', scrollY: 321, postId: '42'};", c);
  vm.runInContext('pzPostChatClose();', c);
  t(c.__byId.pzPostChat.hidden === true, 'vm close: capa oculta');
  t(c.__card.parentNode === c.__sheetBody, 'vm close: #chatCard devuelto a su padre original');
  t(c.__calls.scf.length === 1 && c.__calls.scf[0][1] === true, 'vm close scf: scfOpenPop(tile, true) reabre el detalle');
  t(c.__calls.scrollTo[0] && c.__calls.scrollTo[0][1] === 321, 'vm close scf: scroll restaurado a 321');
  t(vm.runInContext('PZ_POSTCHAT_ORIGIN', c) === null, 'vm close: origen limpiado (el próximo chat captura uno nuevo)');
  // Close con padre desconectado: no reinyecta un nodo viejo.
  vm.runInContext('pzPostChatOpen({id: 43, image_path: "y.jpg", caption: "otro", status: "draft"});', c);
  c.__sheetBody.parentNode = null;
  // Simular vista reemplazada: el padre ya no está conectado.
  Object.defineProperty(c.__sheetBody, 'isConnected', { value: false });
  vm.runInContext("PZ_POSTCHAT_ORIGIN = {kind: 'generic', hash: '#/app/schedule', scrollY: 0, postId: '43'};", c);
  vm.runInContext('pzPostChatClose();', c);
  t(c.__card._removed === true, 'vm close desconectado: nodo viejo descartado, no reinyectado');
}
// Origen apv: cerrar navega de vuelta al hash de aprobación.
{
  const c = makeCtx();
  c.location.hash = '#/app/post/123';
  vm.runInContext('pzPostChatCaptureOrigin({id: 123}, "apv");', c);
  vm.runInContext('pzPostChatOpen({id: 123, image_path: "z.jpg", caption: "apv", status: "scheduled"});', c);
  c.location.hash = '#/app/inicio';
  vm.runInContext('pzPostChatClose();', c);
  t(c.location.hash === '#/app/post/123', 'vm close apv: vuelve al hash de aprobación');
}
// Sin chat en el DOM: pendiente + navegación a Inicio (flujo de siempre).
{
  const c = makeCtx();
  delete c.__byId.chatCard;
  vm.runInContext('hfOpenChatForPost({id: 7, image_path: "q.jpg", caption: "pend", status: "draft"});', c);
  t(vm.runInContext('PZ_POSTCHAT_PENDING_POST && PZ_POSTCHAT_PENDING_POST.id', c) === 7, 'vm pendiente: post guardado cuando no hay chat en el DOM');
  t(c.location.hash === '#/app/inicio', 'vm pendiente: navega a Inicio');
  t(vm.runInContext('pzPostChatOpen(null)', c) === false, 'vm open: sin posteo devuelve false');
  t(vm.runInContext('pzPostChatOpen({})', c) === false, 'vm open: sin id devuelve false');
}
// hfAskChange captura el origen ANTES de cerrar (kind scf con SCF_POP).
{
  const c = makeCtx();
  c.__calls.closePop = 0;
  vm.runInContext('hfAskChange({id: 99, image_path: "w.jpg", caption: "mini", status: "scheduled"});', c);
  t(c.__byId.pzPostChat && c.__byId.pzPostChat.hidden === false, 'vm hfAskChange: abre la pantalla (no la hoja)');
  t(c.__calls.closePop === 1, 'vm hfAskChange: cerró el detalle antes de abrir el chat');
  t(vm.runInContext('PZ_POSTCHAT_ORIGIN && PZ_POSTCHAT_ORIGIN.kind', c) === 'scf', 'vm hfAskChange: origen kind scf');
}

console.log(`\ntest-lotechatposteopantalla: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
