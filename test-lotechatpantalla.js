// test-lotechatpantalla.js — LOTE CHAT PANTALLA COMPLETA EN VIDRIO (2026-11-01).
// Reporte de Valentino 1/11 con captura (app iOS): al tocar el chat de
// Posty, el teclado tapaba todo. Causa verificada en v531: el chat vivía
// en una hoja sobre Inicio y en la app nativa (WKWebView) el teclado NO
// achica el layout viewport, así que la hoja nunca se enteraba (0 usos de
// visualViewport en app.js; interactive-widget es de Chrome; sin sección
// Keyboard en capacitor.config.ts). Fix: el chat pasa a pantalla completa
// propia (#/app/chat) con transición de siempre, cabecera Posty + atrás,
// mensajes con scroll interno, campo anclado abajo y altura mandada por
// visualViewport (que SÍ se achica con el teclado en WKWebView), todo en
// vidrio receta v519. Contenido idéntico al de la hoja (mismo chatCardHTML,
// mismos ids, mismo bindChat): solo cambia el contenedor. El chat de
// aprobación (.hf-ask-input) NO se toca. La barra accesoria ^/v/✓ es
// nativa (no es de la app) y queda para la sesión Mac del build 4.
// Node puro, lee el árbol + vm con DOM falso.
// Uso: node test-lotechatpantalla.js
// Pines de versión: re-rotados a la base de este lote (app/styles v558
// servidos; server.js del árbol es v557 — el diff Juli v558 no existe en
// ningún dir local y la liberación re-basa el server sobre el HEAD real;
// re-rotar de nuevo al liberar).
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

// ---------- Versiones + censo (base de este lote; re-rotar al liberar) ----------
t(srv.includes("const BUILD_ID = '20261101-v566'"), 'BUILD v566 en server.js');
t(idx.includes('app.js?v=379'), 'index ES: app.js?v=379');
t(idx.includes('styles.css?v=20261095'), 'index ES: styles 20261095');
t(idxEn.includes('styles.css?v=20261091') && !idxEn.includes('app.js?v='), 'en/index: styles 20261091 intacto (deriva preexistente, no se toca)');
t(app.includes("const CHUNK_V = '20261101-v565'"), 'CHUNK_V sigue v565 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6 (4 + atrás de la cabecera del chat + llamada del desliz en touchend)');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
// SUPERSEDED con causa (lote chat-website v555, posterior a v531): el
// server trae pzChatPublic para el chat público del website; la intención
// del assert (el lote no toca el server) se verifica con que el server no
// trae nada de chat-pantalla y es byte-idéntico al prístino (ver STATUS).
t(!srv.includes('chatFullView') && !srv.includes('pzChatSwipe'), 'server.js sin tocar por este lote (sin chatFullView/pzChatSwipe)');

// ---------- Ruta propia: chat ya no redirige a Inicio ----------
t(!app.includes("tab === 'chat') { location.hash = '#/app/inicio'"), 'ruta: sin redirect de chat a Inicio');
t(app.includes("else if (tab === 'chat') { pzPaintSkeleton(tab); content = await chatFullView(); }"), 'ruta: chat → chatFullView');
t(app.includes("if (tab === 'oficina' || tab === 'negocio') { location.hash = '#/app/inicio'"), 'ruta: oficina/negocio siguen redirigiendo');
t(app.includes("if (tab === 'chat') bindChatFull();"), 'bindApp: chat → bindChatFull');
t(!app.includes("if (tab === 'chat') bindChatView();"), 'bindApp: ya no llama a bindChatView');

// ---------- Atrás único: la cabecera del chat es su propio atrás ----------
for (const fn of ['pzBackHTML', 'pzBackMtopHTML', 'pzBackDesktopHTML']) {
  const body = sliceFn(app, 'function ' + fn, '\n}');
  t(body.includes("if (tab === 'chat') return '';"), fn + ': sin control atrás para chat');
}
t(!app.includes("tab === 'chat' ? '' : '<nav class=\"bb-bar\">'"), 'bbShell: sin exclusión del chat (R0: el dock está también en chat)');
t(!sliceFn(app, 'function mzTabsHTML(tab) {', '\n/* (LOTE DOCK-MAS) */').includes("if (tab === 'chat') return '';"), 'mzTabsHTML: el dock SÍ está en chat (R0)');

// ---------- Hoja retirada de Inicio; dock navega ----------
// SUPERSEDED con causa (lote chat-website v555, posterior a v531): la
// hoja del website (pzLpChatHTML) reutiliza legítimamente el mismo markup.
// La hoja de Inicio sí está fuera: queda exactamente 1 ocurrencia y vive
// en pzLpChatHTML, no en inicioView.
t(cnt(app, 'id="mzSheet"') === 2, 'Inicio: hoja oculta CONSERVADA con causa (v566: fuente de #chatCard para pzPostChat; nunca se abre: mzOpenSheet navega a #/app/chat) + landing con clase pz-lp-sheet (CHAT-WEBSITE-LINDO)');
t(sliceFn(app, 'function pzLpChatHTML()', 'function pzLpChatBind').includes('pz-lp-sheet') && sliceFn(app, 'function pzLpChatHTML()', 'function pzLpChatBind').includes('id="mzSheet"'), 'website: su hoja sigue (segunda de 2; la primera es la oculta de Inicio para pzPostChat)');
t(app.includes("if (open) open.onclick = () => { location.hash = '#/app/chat'; };"), 'dock: campo abre la pantalla');
t(app.includes("window.__pzChatVoice = true; location.hash = '#/app/chat';"), 'dock: mic abre la pantalla + voz pendiente');
t(app.includes("if (plus) plus.onclick = clickUp;"), 'dock: + sigue subiendo al álbum (intacto)');
t(!app.includes("if (open) open.onclick = () => mzOpenSheet(true);"), 'dock: ya no abre la hoja');
t(!app.includes("if (x) x.onclick = mzCloseSheet;"), 'dock: sin cableado de X de hoja');

// ---------- Vista nueva: cabecera + mismo contenido de la hoja ----------
t(cnt(app, 'function chatFullView') === 1, 'sin duplicados: chatFullView 1');
t(cnt(app, 'function bindChatFull') === 1, 'sin duplicados: bindChatFull 1');
t(cnt(app, 'function pzChatKbSync') === 1, 'sin duplicados: pzChatKbSync 1');
t(cnt(app, 'function pzChatKbBind') === 1, 'sin duplicados: pzChatKbBind 1');
const view = sliceFn(app, 'function chatFullView()', '\n}\n');
t(view.includes('id="pzChatFull"'), 'vista: root pzChatFull');
t(view.includes('pz-chatfull-head'), 'vista: cabecera propia');
t(view.includes('onclick="pzGoBack()"'), 'vista: atrás con el atrás de siempre');
t(view.includes('ai-avatar.png'), 'vista: cara de Posty en la cabecera');
t(view.includes('Posty<span class="pdot">.</span>'), 'vista: título Posty.');
t(view.includes('chatCardHTML(true, true, true, true, true, true)'), 'vista: MISMO chatCardHTML que la hoja');
const bind = sliceFn(app, 'function bindChatFull()', '\n}\n');
t(bind.includes('bindChat();'), 'bind: mismo bindChat de siempre');
t(bind.includes('bindSchedUpload();'), 'bind: misma subida de Schedule');
t(!bind.includes("$('#ideasChip')"), 'SACAR-IDEAS (Valentino 3/11): bindChatFull SIN salto a Semana desde la píldora (el assert viejo que exigía ese salto se actualiza con esta causa)');
t(bind.includes("sessionStorage.getItem('posty-chat-prefill')"), 'bind: mismo contrato prefill');
t(bind.includes('__pzChatVoice'), 'bind: voz pendiente del dock');
t(bind.includes('hfPaintAnchor();'), 'bind: pinta el ancla');
t(bind.includes('hfDeliverAskText();'), 'bind: entrega el texto pendiente');
t(bind.includes('pzChatKbBind();'), 'bind: escucha el teclado');
t(bind.includes('pzChatKbSync();'), 'bind: sync inicial');
t(bind.includes('pzPhStart();'), 'bind: rotación arranca');
t(bind.includes('ci.focus({ preventScroll: true })'), 'bind: campo activo al abrir');

// ---------- Teclado: visualViewport manda, con fallback ----------
const kb = sliceFn(app, 'function pzChatKbSync()', 'function bindChatFull()');
t(kb.includes('window.visualViewport'), 'kb: usa visualViewport');
t(kb.includes('vv.height'), 'kb: altura del viewport visible');
t(kb.includes('vv.offsetTop'), 'kb: respeta el desplazamiento');
t(kb.includes('window.innerHeight'), 'kb: fallback innerHeight');
t(kb.includes("getElementById('pzChatFull')"), 'kb: actúa sobre la pantalla');
t(kb.includes("if (!root) return;"), 'kb: sin pantalla no hace nada');
const kbb = sliceFn(app, 'function pzChatKbBind()', 'function bindChatFull()');
t(kbb.includes("__pzChatKbBound"), 'kb: bind una sola vez');
t(kbb.includes("vv.addEventListener('resize'"), 'kb: escucha resize del viewport');
t(kbb.includes("vv.addEventListener('scroll'"), 'kb: escucha scroll del viewport');
t(kbb.includes("window.addEventListener('resize'"), 'kb: fallback resize de ventana');
t(kbb.includes("window.addEventListener('orientationchange'"), 'kb: fallback orientación');

// ---------- Vidrio receta v519, solo bajo .pz-chatfull ----------
const glass = sliceFn(css, '(LOTE CHATPANTALLA', '@media(min-width:761px)');
t(glass.length > 1500, 'css: bloque vidrio presente');
t(glass.includes('.pz-chatfull{position:fixed'), 'css: pantalla fija');
t(glass.includes('z-index:300'), 'css: z-index como la hoja vieja');
t(glass.includes('linear-gradient(165deg,#dff1fa'), 'css: degradado de Inicio');
t(glass.includes('.pz-chatfull-head{'), 'css: cabecera en vidrio');
t(glass.includes('.pz-chatfull .chat-msg.ai{'), 'css: burbujas Posty en vidrio');
t(glass.includes('.pz-chatfull .chat-msg.u{'), 'css: burbujas cliente en vidrio celeste');
t(glass.includes('.pz-chatfull .chat-input-row{'), 'css: campo en vidrio');
t(glass.includes('.pz-chatfull .chat-plus-menu{'), 'css: menú + en vidrio');
t(glass.includes('.pz-chatfull .sched-chips-row'), 'css: chips subir/ideas en vidrio');
t(glass.includes('env(safe-area-inset-bottom)'), 'css: despeje inferior seguro');
t(glass.includes('env(safe-area-inset-top)'), 'css: despeje superior seguro');
t(cnt(glass, 'blur(16px) saturate(1.4)') >= 5, 'css: receta blur 16 + saturate 1.4 en paneles');
t(cnt(glass, 'rgba(255,255,255,.55)') >= 4, 'css: receta vidrio .55 en paneles');
t(glass.includes('rgba(255,255,255,.75)'), 'css: borde vidrio .75');
t(css.includes('@media(min-width:761px){.pz-chatfull{left:50%'), 'css: columna centrada en desktop');

// ---------- Contenido intacto: envío, mic, +, subida, rotación ----------
t(app.includes("inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); chatSend(); } });"), 'bindChat intacto: Enter envía');
t(app.includes("file.onchange = () => { chatUploadPhotos(file.files);"), 'bindChat intacto: #chatFile → chatUploadPhotos');
t(!app.includes("file.accept = b.dataset.k === 'video' ? 'video/*' : 'image/*';"), 'CHATBAR-MAS (Valentino 3/11): menú + foto/video SALIO de bindChat (el filtro video/* vive ahora en pzDockMasVideo)');
t(app.includes('chatUpdateSendBtn'), 'bindChat intacto: botón mic/enviar');
t(app.includes('pzPhTick'), 'rotación intacta: tick presente');
t(app.includes("pzPhEls('#chatInput')"), 'rotación intacta: #chatInput rota');
t(app.includes("pzPhEls('.mz-ph-tx')"), 'rotación intacta: dock rota');
t(app.includes("placeholder=\"escribile a posty…\""), 'rotación intacta: placeholder en minúscula');
const card = sliceFn(app, 'function chatCardHTML(', '\n}\n');
t(card.includes('id="chatBox"'), 'chatCard intacto: #chatBox');
t(card.includes('id="chatInput"'), 'chatCard intacto: #chatInput');
t(card.includes('id="chatFile"'), 'chatCard intacto: #chatFile');
t(!card.includes('id="chatPlus"'), 'CHATBAR-MAS (Valentino 3/11): #chatPlus SALIO de la barra del chat');
t(!card.includes('id="chatPlusMenu"'), 'CHATBAR-MAS: #chatPlusMenu SALIO con el + (foto/video solo por el + del dock)');
t(card.includes('id="chatPhotos"'), 'chatCard intacto: #chatPhotos');
t(card.includes('id="chatProposal"'), 'chatCard intacto: #chatProposal');
t(card.includes('id="chatMsg"'), 'chatCard intacto: #chatMsg');
t(card.includes('id="agUploadBtn"'), 'chatCard intacto: botón subir (hoja/Schedule)');
t(!card.includes('id="ideasChip"'), 'SACAR-IDEAS (Valentino 3/11): chip Ideas SALIO de la barra del chat (el assert viejo que lo exigía se actualiza con esta causa)');
t(!card.includes('id="ideasBadge"'), 'SACAR-IDEAS: badge Ideas SALIO con la píldora');

// ---------- Aprobación NO tocada; sus caminos llevan a la pantalla ----------
t(app.includes('hf-ask-input'), 'aprobación intacta: mini-chat presente');
t(app.includes('function pzPostChatOpen'), 'SUPERSEDED v566 (posteo posee hfOpenChatForPost): Schedule-origina va a pzPostChat, no a scroll; verificado en suite posteo');
t(app.includes('PZ_POSTCHAT_PENDING_POST = post;'), 'SUPERSEDED v566 (posteo): sin chat en vista queda pendiente de posteo, no a #/app/chat');
t(app.includes('pzPostChatOpen(_pp)'), 'SUPERSEDED v566 (posteo): el pendiente lo abre bindInicio con pzPostChat, no #/app/chat');
t(app.includes('function pzPostChatOpen'), 'SUPERSEDED v566 (posteo): el foco en pantalla lo da pzPostChatOpen, no la rama onChat de R8');

// ---------- Shim: abrir la hoja vieja = navegar (red de seguridad) ----------
const shim = sliceFn(app, 'function mzOpenSheet(focus)', 'function mzCloseSheet()');
t(shim.includes("if ((location.hash || '').split('?')[0] !== '#/app/chat') { location.hash = '#/app/chat'; return; }"), 'shim: abrir hoja vieja navega a la pantalla');
t(app.includes('function mzCloseSheet()'), 'shim: mzCloseSheet sigue existiendo (guardado)');

// ---------- VM: pzChatKbSync con DOM falso ----------
// (Guardia control negativo, agregada en este lote: en un árbol sin el
// lote, el bloque VM no se ejecuta; se cuenta un fallo en vez de romper
// el test con ReferenceError. En el árbol con el lote no cambia nada.)
if (!app.includes('function pzChatKbSync')) { t(false, 'vm kb: código ausente (control negativo)'); } else {
  const src = sliceFn(app, 'function pzChatKbSync()', 'function bindChatFull()');
  const style = {};
  const root = { style };
  const listeners = [];
  const fakeDoc = { getElementById: (id) => (id === 'pzChatFull' ? root : null) };
  const fakeWin = {
    innerHeight: 800,
    visualViewport: {
      height: 400, offsetTop: 0,
      addEventListener: (ev, fn) => listeners.push(ev),
    },
    addEventListener: () => {},
  };
  const sandbox = { document: fakeDoc, window: fakeWin, console };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.__sync = pzChatKbSync; this.__bind = pzChatKbBind;', sandbox);
  sandbox.__sync();
  t(style.height === '400px', 'vm kb: altura = viewport visible (400px)');
  t(style.top === '0px', 'vm kb: top 0 sin desplazamiento');
  fakeWin.visualViewport.height = 320; fakeWin.visualViewport.offsetTop = 50;
  sandbox.__sync();
  t(style.height === '320px', 'vm kb: se achica con el teclado (320px)');
  t(style.top === '50px', 'vm kb: respeta offsetTop 50');
  fakeWin.visualViewport = undefined;
  sandbox.__sync();
  t(style.height === '800px', 'vm kb: sin viewport, fallback innerHeight');
  fakeWin.visualViewport = {
    height: 400, offsetTop: 0,
    addEventListener: (ev, fn) => listeners.push(ev),
  };
  sandbox.__bind(); sandbox.__bind();
  t(listeners.filter((e) => e === 'resize').length === 1, 'vm kb: bind una sola vez (resize 1)');
  fakeDoc.getElementById = () => null;
  let threw = false;
  try { sandbox.__sync(); } catch (e) { threw = true; }
  t(!threw, 'vm kb: sin pantalla no rompe');
}

console.log(`lotechatpantalla: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
