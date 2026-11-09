// test-lote-rediseno-r0.js — LOTE REDISEÑO R0 (8/11): shell de 6 pestañas +
// glass total + saludo que escribe + fuente autocontenida (la apertura de 3 s se sacó el 9/11).
// Decisión tablero §5.5 (8/11 01:42): el rediseño corre en paralelo con
// re-base por lote. Decisión Valentino 8/11 00:07: el mock posty-app-design
// pasa a ser el nuevo diseño del TestFlight, con el motor real adentro.
// Vara nueva del tablero (01:57) + directiva Valentino 01:56: CERO BOTONES
// MUERTOS — cada botón que R0 introduce lleva a su destino; se verifica
// navegando de verdad (repro Playwright, ver STATUS.md) y aquí simulando
// los clicks en VM sobre el HTML real del shell (§10).
// ROJO-PRIMERO: falla en base-v793, pasa en work-v1.
// Node puro: asserts estáticos + VM + boot real por HTTP con DATA_DIR
// aislada (puerto 18790; el de ads-pantalla es 18754, nunca en paralelo).
// Uso: node test-lote-rediseno-r0.js (desde la raíz del árbol).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const orderOk = (s, keys) => {
  let prev = -1;
  for (const k of keys) { const i = s.indexOf(k, prev + 1); if (i === -1 || i < prev) return false; prev = i; }
  return true;
};
// RE-PIN tras implementar (md5s de work-v1; en base fallan a propósito).
// (LOTE HOY-AVATAR-FEED · 8/11) Re-pin: app.js/styles.css del lote.
// (LOTE CHAT-NUEVO v821 · 8/11) Re-pin: app.js/styles.css del lote + BUILD v821.
const MD5_APP_WORK = '6c0faedd9bd3e7304b40a18ca765bc9b'; // (LOTE SACAR-FEED v846) re-pin al árbol final.
const MD5_CSS_WORK = '64d34e3d4550385ae46b127b766927e1'; // (LOTE SACAR-FEED v846) re-pin al árbol final.
// El woff2 es copia byte a byte del mock (no generado).
const MD5_WOFF2_MOCK = '166202cc391c71a57730bed12cbcb159';

(async () => {
  // ---------- 1. Censo (sin cambio) + pins ----------
  t(srv.includes("const BUILD_ID = '20261105-v846'"), 'server: BUILD v846 en el árbol (estampado por el preparador)');
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v793'"), 'CHUNK_V v792 (sin cambio en este lote)');
  t(md5(app) === MD5_APP_WORK, 'app.js md5 (re-pin work-v1)');
  t(md5(css) === MD5_CSS_WORK, 'styles.css md5 (re-pin work-v1)');

  // ---------- 2. Dock de 3 en bbShell (RS-5; estático; ítem 8: sin Estrategia) ----------
  const bbFn = sliceFn(app, 'function bbShell(tab, content) {', '\nasync function bbLoadEstado');
  const bbNav = (bbFn.split('\n').find((l) => l.includes('<nav class="bb-bar">')) || '');
  t(bbNav.length > 0, 'bbShell: la línea del nav existe');
  t(orderOk(bbNav, ["tabBtn('inicio'", "tabBtn('chat'"]) && !bbNav.includes("tabBtn('feed'"), 'bb-bar: orden Hoy, Chat (2 pestañas, v846: Feed fuera)');
  t(!bbNav.includes("'#/app/feed'"), 'bb-bar: sin Feed en la barra (v846)');
  t(!bbNav.includes("tabBtn('analisis'"), 'bb-bar: sin pestaña Análisis (vive como línea en Hoy, RS-2)');
  t(!bbNav.includes("tabBtn('impulsar'"), 'bb-bar: sin pestaña Impulsar (vive en el Feed, RS-4)');
  t(!bbNav.includes("tabBtn('jardin'"), 'bb-bar: sin pestaña Nivel (sin hogar, RS-5)');
  t(!bbNav.includes("tabBtn('estrategia'"), 'bb-bar: sin pestaña Estrategia (ítem 8: la recomendación vive en Impulsar)');
  t(bbNav.includes("'#/app/chat'"), 'bb-bar: Chat apunta a #/app/chat');
  t(!bbNav.includes('pzDockMasBtn'), 'bb-bar: el + SALE del dock');
  t(!bbNav.includes("tabBtn('ajustes'"), 'bb-bar: sin tab Ajustes');
  t(!bbFn.includes("tab === 'chat' ? '' : '<nav"), 'bbShell: sin exclusión del dock en chat');
  t(bbFn.includes('pzShellHeadHTML(tab)'), 'bbShell: renderiza el encabezado común');
  t(!bbFn.includes('pzApertura'), 'bbShell: sin apertura (la app abre directo en Hoy)');
  t(app.includes("function pzShellHeadHTML(tab)"), 'existe pzShellHeadHTML');
  t(!app.includes('function pzAperturaHTML()'), 'sin pzAperturaHTML (9/11)');
  t(!app.includes('function pzAperturaArranque()'), 'sin pzAperturaArranque (9/11)');
  t(!app.includes('function pzAperturaCerrar()'), 'sin pzAperturaCerrar (9/11)');
  t(!app.includes('function pzSaludoEscribir()'), 'pzSaludoEscribir murió en v846 (título fijo Posty., sin máquina de escribir)');
  t(app.includes('function pzShellDatosHoy()'), 'existe pzShellDatosHoy');
  t(!app.includes('pzSaludoEscribir'), 'render: la máquina de escribir no arranca (v846)');
  { const paintIdx = app.indexOf('root.innerHTML = appShell(tab, content);');
    const bindIdx = app.indexOf('bindApp(tab);', paintIdx);
    t(paintIdx > 0 && bindIdx > paintIdx && !app.slice(paintIdx, bindIdx).includes('__pzAperturaTimer'), 'render: sin timer de apertura entre pintar y bindApp (9/11)'); }

  // ---------- 3. Dock de 3 en mzTabsHTML (VM; RS-5; ítem 8: sin Estrategia) ----------
  const mzSrc = sliceFn(app, 'function mzTabsHTML(tab) {', '\n/* (LOTE DOCK-MAS) */');
  t(!mzSrc.includes("if (tab === 'chat') return '';"), 'mzTabsHTML: sin early-return en chat');
  t(!mzSrc.includes('pzDockMasBtn'), 'mzTabsHTML: el + SALE del dock');
  {
    const ctx = { gzT: (es) => es, pzIc: () => '[ic]', console };
    ctx.pzDockMasBtn = () => '';
    ctx.pzDockMasHTML = () => '';
    vm.createContext(ctx);
    vm.runInContext(mzSrc, ctx);
    const navTabs = (s) => (s.match(/<button type="button" class="mz-tab/g) || []).length;
    const navInicio = vm.runInContext("mzTabsHTML('inicio')", ctx);
    const navFeed = vm.runInContext("mzTabsHTML('feed')", ctx);
    const navChat = vm.runInContext("mzTabsHTML('chat')", ctx);
    const navAjustes = vm.runInContext("mzTabsHTML('ajustes')", ctx);
    t(navTabs(navInicio) === 2, 'VM mzTabsHTML(inicio): 2 botones en el dock (v846: Hoy, Chat)');
    t(!navInicio.includes('Agregar'), 'VM mzTabsHTML(inicio): sin Agregar');
    t(!navInicio.includes('Ajustes'), 'VM mzTabsHTML(inicio): sin Ajustes en el dock');
    t(orderOk(navInicio, ['>Hoy<', '>Chat<']) && !navInicio.includes('>Feed<'), 'VM mzTabsHTML(inicio): orden Hoy, Chat (v846: sin Feed)');
    t(!navInicio.includes('data-tab="feed"'), 'VM mzTabsHTML: sin data-tab feed (v846)');
    t(!navInicio.includes('data-tab="numeros"'), 'VM mzTabsHTML: sin data-tab numeros (RS-5)');
    t(!navInicio.includes('data-tab="ads"'), 'VM mzTabsHTML: sin data-tab ads (RS-5)');
    t(!navInicio.includes('data-tab="jardin-posty"'), 'VM mzTabsHTML: sin data-tab jardin-posty (RS-5)');
    t(!navInicio.includes('data-tab="analisis"'), 'VM mzTabsHTML: sin data-tab analisis (sin Estrategia)');
    t(navInicio.includes('data-tab="chat"'), 'VM mzTabsHTML: Chat lleva data-tab chat');
    t(!navFeed.includes('>Feed<'), 'VM mzTabsHTML(feed): la ruta feed ya no rinde pestaña (v846: redirige a Hoy)');
    t(navChat.length > 0, 'VM mzTabsHTML(chat): el dock EXISTE en chat (no vacío)');
    t(navTabs(navChat) === 2, 'VM mzTabsHTML(chat): 2 botones también en chat (v846)');
    t(navChat.includes('mz-tab on') && navChat.indexOf('mz-tab on') < navChat.indexOf('>Chat<'), 'VM mzTabsHTML(chat): tab Chat activo');
    t(!navInicio.includes('>Nivel<'), 'VM mzTabsHTML(inicio): sin Nivel en el dock (RS-5)');
    t(!navAjustes.includes('mz-tab on'), 'VM mzTabsHTML(ajustes): ningún tab activo en Ajustes');
    t(navTabs(navAjustes) === 2, 'VM mzTabsHTML(ajustes): el dock sigue con 2 en Ajustes (v846)');
  }

  // ---------- 4. mxTabKey: remap (VM) ----------
  {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(sliceFn(app, 'function mxTabKey(tab) {', 'function mxModoActual(tab) {'), ctx);
    const k = (tab) => vm.runInContext(`mxTabKey('${tab}')`, ctx);
    t(k('inicio') === 'inicio', "mxTabKey: inicio → inicio");
    t(k('feed') === '', "mxTabKey: feed → '' (v846: sin pestaña Feed)");
    t(k('numeros') === '', "mxTabKey: numeros → '' (sin pestaña; la ruta vive por URL)");
    t(k('analisis') === '', "mxTabKey: analisis → '' (sin pestaña Estrategia; el router manda a #/app/ads)");
    t(k('ads') === '', "mxTabKey: ads → '' (sin pestaña; Impulsar vive en el Feed, RS-4)");
    t(k('jardin-posty') === '', "mxTabKey: jardin-posty → '' (sin pestaña; Nivel sin hogar)");
    t(k('chat') === 'chat', "mxTabKey: chat → chat");
    t(k('schedule') === 'semana' && k('post') === 'semana', 'mxTabKey: schedule/post → semana (sin cambio)');
    t(k('ajustes') === 'ajustes', 'mxTabKey: ajustes → ajustes (sin cambio)');
  }

  // ---------- 5. Encabezado común ----------
  const headSrc = sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzShellDatosHoy() {'); // (v846) pzSaludoEscribir murió
  t(headSrc.length > 0, 'pzShellHeadHTML: función presente');
  t(headSrc.includes("if (tab === 'chat') return '';"), 'encabezado: NO va en chat (el chat tiene su propia cabecera)');
  t(headSrc.includes('ai-avatar.png'), 'encabezado: avatar canónico ai-avatar.png');
  t(!headSrc.includes('pzShellSaludo'), 'encabezado: sin máquina de escribir (v846)');
  t(!headSrc.includes('¡Hola!'), 'encabezado: sin fallback «¡Hola!» (v846: título fijo Posty.)');
  t(!headSrc.includes('Hola, '), 'encabezado: sin «Hola, {negocio}» (el encabezado es la identidad, saludo-unico)');
  t(!headSrc.includes('Posty está trabajando ahora'), 'encabezado: «Posty está trabajando ahora» salió (saludo-unico)');
  t(headSrc.includes('<small>') && headSrc.includes('tu community manager'), 'encabezado: línea chica «tu community manager» (v846)');
  t(!headSrc.includes('pzHeadRacha'), 'encabezado: píldora de racha fuera (simplificar-app p5)');
  t(!headSrc.includes('__pzHeadRacha'), 'encabezado: sin caché de racha (simplificar-app p5)');
  t(!headSrc.includes('BB.estado.negocio') && !headSrc.includes('PROFILE.business_name'), 'encabezado: ya NO lee el nombre del negocio (v846: título fijo Posty.)');
  t(!headSrc.includes('data-hf-pact'), 'encabezado: sin botones del perfil (son de Hoy, no del shell)');
  // Botones del encabezado con destino (vara cero botones muertos):
  t(headSrc.includes("bbGo('#/app/chat')"), 'encabezado: identidad (avatar+saludo) abre el Chat');
  t(headSrc.includes('rsShareOpen()'), 'encabezado: compartir abre la hoja (RS-1)');
  t(headSrc.includes("bbGo('#/app/ajustes')"), 'encabezado: ruedita lleva a Ajustes');
  t(headSrc.includes('pz-shell-head'), 'encabezado: clase pz-shell-head');
  if (headSrc.length === 0) {
    t(false, 'VM encabezado: sin pzShellHeadHTML para evaluar (base)');
  } else {
    // VM: el encabezado rinde los 3 botones con sus destinos.
    const ctx = {
      gzT: (es) => es, pzIc: () => '[ic]', console,
      esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      BB: { estado: { negocio: 'Café Aroma', bandeja_count: 0 } },
      ME: { lang: 'es' },
      HOME_PROF: { username: 'cafearoma' },
      PROFILE: { ig_username: 'cafearoma' },
    };
    vm.createContext(ctx);
    vm.runInContext(headSrc, ctx);
    const h = vm.runInContext("pzShellHeadHTML('inicio')", ctx);
    t(h.includes('ai-avatar.png'), 'VM encabezado(inicio): avatar presente');
    t(h.includes('Posty<span class="pdot">.</span>') && h.includes('tu community manager') && !h.includes('Café Aroma'), 'VM encabezado(inicio): título fijo Posty. + subtítulo, nunca el negocio (v846)');
    t(!h.includes('@'), 'VM encabezado(inicio): sin @ en el encabezado (simplificar-app p5)');
    t(h.includes('pz-shell-dot'), 'VM encabezado(inicio): punto verde de online (v846)');
    t(!h.includes('pzHeadRacha'), 'VM encabezado(inicio): píldora de racha fuera (simplificar-app p5)');
    t(h.includes("bbGo('#/app/chat')"), 'VM encabezado(inicio): identidad → Chat');
    t(h.includes('rsShareOpen()'), 'VM encabezado(inicio): compartir → hoja (RS-1)');
    t(h.includes("bbGo('#/app/ajustes')"), 'VM encabezado(inicio): ruedita → Ajustes');
    t(vm.runInContext("pzShellHeadHTML('chat')", ctx) === '', 'VM encabezado(chat): vacío');
  }

  // ---------- 6. Sin apertura + saludo que escribe + datos de hoy ----------
  // (PANTALLA-APERTURA · 9/11) La apertura de 3 s se sacó entera: la app
  // abre directo en Hoy. El saludo que escribe y los datos de hoy
  // (racha) siguen, ahora al pintar.
  t(!app.includes('pzApertura'), 'sin apertura: pzApertura ×0 en app.js');
  t(!app.includes('__pzHoyCarta'), 'sin apertura: __pzHoyCarta ×0');
  t(!app.includes('Tocá para saltar'), 'sin apertura: «Tocá para saltar» ×0');
  t(!app.includes('Te traje el posteo de hoy'), 'sin apertura: «Te traje el posteo de hoy» ×0');
  // (v846) La máquina de escribir se retiró entera con el título fijo:
  // no hay función que escriba, ni cursor, ni reduced-motion del saludo.
  t(!app.includes('function pzSaludoEscribir()'), 'saludo: pzSaludoEscribir ausente (v846)');
  t(!app.includes('pzShellSaludo'), 'saludo: sin #pzShellSaludo (v846)');
  t(!app.includes('typing::after') || !app.includes('pzShellBlink'), 'saludo: sin cursor de máquina de escribir (v846)');
  const hoySrc = sliceFn(app, 'function pzShellDatosHoy() {', '// ===== /LOTE REDISEÑO R0');
  t(hoySrc.includes("/api/ritual/hoy"), 'datos-hoy: UN fetch a /api/ritual/hoy');
  t(!hoySrc.includes('pzHeadRacha'), 'datos-hoy: ya no llena píldora de racha (simplificar-app p5)');
  t(!hoySrc.includes('__pzHeadRacha'), 'datos-hoy: sin caché de racha (simplificar-app p5)');
  t(!hoySrc.includes('r.racha'), 'datos-hoy: el fetch ya no lee r.racha (simplificar-app p5)');
  t(!hoySrc.includes('cartas'), 'datos-hoy: sin carta (la tarjeta de la apertura se fue con ella)');
  t(!hoySrc.includes('pzApertura'), 'datos-hoy: sin mención a la apertura');
  // Reintento: el fetch se marca «hecho» solo cuando vuelve bien; si
  // falla, el pendiente se limpia y el próximo arranque lo reintenta
  // (un 401 en la pantalla de login no deja la apertura sin datos).
  t(hoySrc.includes('__pzShellHoyPendiente'), 'datos-hoy: flag pendiente (un fetch por carga, con reintento si falla)');
  t(hoySrc.includes('.catch(') && hoySrc.includes('__pzShellHoyPendiente = false'), 'datos-hoy: si el fetch falla, el pendiente se limpia (reintenta)');
  t(hoySrc.includes('r.ok === false'), 'datos-hoy: una respuesta sin ok no marca «hecho»');
  // El fetch arranca con el render y puede resolver ANTES de la
  // primera pintura: la tarjeta se cachea SIEMPRE (no solo
  // si el nodo vivo existe), y el template pinta desde el caché.
  t(!hoySrc.includes('__pzHeadRachaTxt'), 'datos-hoy: sin caché de racha antes del nodo (simplificar-app p5)');
  // El idioma no se congela en el caché: el fetch arranca antes de que ME
  // cargue y el texto con el idioma de ese momento saldría en español en
  // un usuario EN. Se cachea el DATO y cada template localiza al pintar.
  t(!hoySrc.includes('__pzHeadRachaN'), 'datos-hoy: sin caché de racha como número (simplificar-app p5)');
  t(!headSrc.includes('__pzHeadRachaN'), 'encabezado: sin número de racha cacheado (simplificar-app p5)');
  { const rendIdx = app.indexOf('async function render() {');
    const paintIdx2 = app.indexOf('root.innerHTML = appShell(tab, content);', rendIdx);
    t(rendIdx > 0 && paintIdx2 > rendIdx && app.slice(rendIdx, paintIdx2).includes('pzShellDatosHoy()'), 'render: los datos de hoy se piden al arrancar el render, antes de pintar'); }

  // ---------- 6 bis. Chat: el dock visible sin tapar el input ----------
  // El chat es un overlay fijo a pantalla completa (z-300): sin este
  // ajuste taparía el dock. R0 acorta el chat hasta sobre el dock
  // (midiendo el dock real); con el teclado abierto no se resta nada.
  const kbSrc = sliceFn(app, 'function pzChatKbSync(', 'function pzChatKbBind() {');
  t(kbSrc.length > 100, 'chat: pzChatKbSync delimitada (la firma cambió en SIMPLIFICAR-APP p4: esAsentado)');
  t(kbSrc.includes('getBoundingClientRect'), 'chat: pzChatKbSync mide el dock real (no un número fijo)');
  t(kbSrc.includes("'.bb-bar'") && kbSrc.includes("'.mz-tabs'"), 'chat: pzChatKbSync busca el dock en ambas shells');
  t(kbSrc.includes('dockH'), 'chat: pzChatKbSync resta la altura del dock a la altura del chat');
  t(kbSrc.includes('> 100'), 'chat: pzChatKbSync detecta el teclado abierto (ventana - viewport > 100)');
  // Corrección del tablero 8/11 02:59 (nota (a) R6): el offset del input
  // del chat es margin-bottom, no bottom — la fila es hija flex. R0 NO
  // toca ese offset: pzChatKbSync solo achica la altura del contenedor
  // (height/top) y la implementación con :has() es de R6, no se pisa.
  t(!kbSrc.includes('style.bottom'), 'chat: pzChatKbSync nunca pone bottom (el offset del input es margin-bottom, R6)');
  t(!kbSrc.includes('.style.bottom'), 'chat: pzChatKbSync no toca bottom por ninguna vía');
  { const r0css = css.slice(css.indexOf('/* ============ LOTE REDISEÑO R0'));
    // (El sticky bottom:0 de .chat-home/.main-chat .chat-input-row es
    // base preexistente, no de R0: por eso el corte es el bloque R0.
    // El regex excluye margin-bottom con lookbehind: la regla :has() de
    // R6 (margin-bottom 72px) es el offset correcto, no un bottom.)
    t(!/\.chat-input-row[^{]*\{[^}]*(?<!margin-)\bbottom\s*:/.test(r0css), 'chat: el bloque R0 no pone bottom en la fila del input (su offset es margin-bottom, R6)');
    t(css.includes('.pz-chatfull .chat-input-row') && /padding:0 12px calc\(10px \+ env\(safe-area-inset-bottom\)\)/.test(css), 'chat: la fila del input conserva su espacio inferior de base (ahora en padding, LOTE CHAT-MUSE: sin píldora glass)');
    t(css.includes('.bb-app:has(.bb-bar) .pz-chatfull .chat-input-row') && css.includes('margin-bottom:calc(72px + 10px + env(safe-area-inset-bottom))'), 'chat: el offset del dock (margin-bottom 72px, R6) sigue intacto'); }

  // ---------- 6 ter. Atrás fijo vs encabezado común + layout escritorio (R0) ----------
  // El círculo fijo (top:10px, left:10px) caía encima del avatar del
  // encabezado en Análisis y Estrategia y le robaba el toque a la
  // identidad (que abre el chat). En las pestañas del dock manda el
  // dock; el atrás fijo queda para pantallas sin pestaña (Ajustes...).
  // Y .app-shell es flex en FILA por base: con el encabezado como segundo
  // hijo, la fila lo estiraba a toda la altura y le comía 920px de ancho
  // al contenido (escritorio roto: el contenido quedaba una tirita a la
  // derecha). Columna: encabezado arriba, .main debajo.
  { const r0css3 = css.slice(css.indexOf('/* ============ LOTE REDISEÑO R0'));
    t(/\.app-shell\s*\{\s*flex-direction\s*:\s*column/.test(r0css3), 'desktop: .app-shell en columna (el header no estira la fila ni come el ancho)'); }
  {
    const ctx = { pzIc: () => '[ic]', console };
    vm.createContext(ctx);
    vm.runInContext(sliceFn(app, 'function pzBackHTML(tab) {', 'function pzBackMtopHTML(tab) {'), ctx);
    t(vm.runInContext("pzBackHTML('numeros')", ctx) === '', "VM pzBackHTML(numeros): sin círculo fijo (el dock manda, no tapa el avatar)");
    t(vm.runInContext("pzBackHTML('analisis')", ctx) === '', "VM pzBackHTML(analisis): sin círculo fijo (el dock manda, no tapa el avatar)");
    t(vm.runInContext("pzBackHTML('ajustes')", ctx).includes('pz-back-fixed'), "VM pzBackHTML(ajustes): el atrás fijo SIGUE en pantallas sin pestaña");
    t(vm.runInContext("pzBackHTML('inicio')", ctx) === '', "VM pzBackHTML(inicio): sin atrás en Hoy (sin cambio)");
  }

  // ---------- 7. Glass total (CSS) ----------
  t(css.includes('--glass:rgba(255,255,255,.52)'), 'glass: var --glass .52 del mock');
  t(css.includes('--glass-line:rgba(255,255,255,.72)'), 'glass: var --glass-line .72 del mock');
  t(css.includes('--glass-blur:blur(16px) saturate(165%)'), 'glass: var --glass-blur del mock');
  t(css.includes('--glass-blur-lg:blur(22px) saturate(175%)'), 'glass: var --glass-blur-lg del mock');
  t(css.includes('--glass-blue:linear-gradient(135deg, rgba(62,166,219,.82), rgba(27,111,160,.78))'), 'glass: var --glass-blue del mock');
  t(/\.bb-app[^{]*\{[^}]*#9ED6F4/.test(css), 'glass: fondo de la app con el azul del mock (#9ED6F4)');
  t(/\.bb-app[^{]*\{[^}]*#2793C8/.test(css), 'glass: fondo de la app con el celeste Posty (#2793C8)');
  t(/\.bb-bar\{[^}]*rgba\(255,255,255,\.44\)/.test(css), 'glass: dock móvil vidrio .44');
  t(/\.bb-bar\{[^}]*(blur\(22px\)|var\(--glass-blur-lg\))/.test(css), 'glass: dock móvil blur-lg 22px (o var --glass-blur-lg del mock)');
  t(/\.mz-tabs\{[^}]*rgba\(255,255,255,\.44\)/.test(css), 'glass: dock escritorio vidrio .44');
  t(/\.bb-tab\.on\{[^}]*#0D4E73/.test(css), 'glass: tab activo #0D4E73 (azul oscuro del mock)');
  t(/\.bb-tab\{[^}]*rgba\(10,30,51,\.52\)/.test(css), 'glass: tab inactiva rgba(10,30,51,.52)');
  t(/\.bb-app\{[^}]*--mut:#33506B/.test(css), 'glass: secundarios más oscuros en la app (--mut #33506B)');
  t(/\.bb-app \.btn[^{]*\{[^}]*rgba\(255,255,255,\.52\)/.test(css), 'glass: botones .btn en vidrio dentro de la app');
  t(/\.bb-app \.bb-btn[^{]*\{[^}]*rgba\(255,255,255,\.52\)/.test(css), 'glass: botones .bb-btn en vidrio dentro de la app');
  t(css.includes('.pz-shell-head'), 'glass: CSS del encabezado presente');
  t(!css.includes('.pz-apertura'), 'glass: CSS de la apertura FUERA (9/11)');
  t(!css.includes('.pz-shell-racha'), 'glass: CSS de la píldora de racha fuera (simplificar-app p5)');
  t(/\.pz-chatfull\{[^}]*height:calc\(100dvh - 72px - env\(safe-area-inset-bottom\)\)/.test(css), 'chat: la pantalla termina sobre el dock (altura 100dvh - 72px - safe-area)');

  // ---------- 8. Fuente autocontenida ----------
  {
    let woffOk = false, woffMd5 = '';
    try { const b = fs.readFileSync(path.join(__dirname, 'fonts/nunito-var.woff2')); woffOk = b.length > 10000; woffMd5 = md5(b); } catch (e) {}
    t(woffOk, 'fuente: fonts/nunito-var.woff2 existe (>10KB)');
    t(woffMd5 === MD5_WOFF2_MOCK, 'fuente: woff2 byte a byte igual al del mock (no generado)');
  }
  t(css.includes('@font-face') && css.includes('nunito-var.woff2'), 'fuente: @font-face con nunito-var.woff2');
  t(/@font-face\s*\{[^}]*font-weight:\s*400 900/.test(css), 'fuente: @font-face weight 400 900 (variable)');
  t(/@font-face\s*\{[^}]*font-display:\s*swap/.test(css), 'fuente: @font-face font-display swap');
  t(/\.bb-app[^{]*\{[^}]*font-family:[^;}]*Nunito/.test(css), 'fuente: Nunito en .bb-app');
  t(/\.app-shell[^{]*\{[^}]*font-family:[^;}]*Nunito/.test(css), 'fuente: Nunito en .app-shell');
  t(idx.includes('fonts.googleapis.com'), 'fuente: links de Google Fonts se MANTIENEN en index.html (landing + carta)');

  // ---------- 9. Drawer: 6 pestañas + Ajustes ----------
  const shellFn = sliceFn(app, 'function appShell(tab, content) {', '\n/* Drawer mobile');
  t(orderOk(shellFn, ['data-tab="inicio"', 'data-tab="chat"', 'data-tab="ajustes"']) && !shellFn.includes('data-tab="feed"'), 'drawer: orden Hoy, Chat, Ajustes (v846: sin Feed)');
  t(shellFn.includes('pzShellHeadHTML(tab)'), 'appShell: renderiza el encabezado común');
  t(!shellFn.includes('pzApertura'), 'appShell: sin apertura (9/11)');
  t(app.includes("location.hash = '#/app/' + b.dataset.tab"), 'drawer: bind genérico data-tab → hash (sin cambio)');

  // ---------- 10. Navegación de verdad en VM (vara cero botones muertos) ----------
  // Se ejecutan los handlers reales sobre el HTML real del shell: cada
  // botón tiene que dejar location.hash en su destino.
  if (!headSrc) {
    t(false, 'VM navegación: faltan las funciones R0 para evaluar (base)');
  } else {
    const loc = { hash: '' };
    const removed = [];
    const docEls = {};
    const fakeDoc = {
      getElementById: (id) => docEls[id] || null,
      querySelector: () => null,
    };
    const ctx = {
      gzT: (es) => es, pzIc: () => '[ic]', console,
      esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      location: loc, document: fakeDoc,
      BB: { estado: { negocio: 'Café Aroma', bandeja_count: 0 } },
      ME: { lang: 'es', bambooty_shell: true },
      mxModoActual: () => 'posty',
      pzBackHTML: () => '',
      pzDockMasBtn: () => '',
      pzDockMasHTML: () => '',
      rsShareSheetHTML: () => '', // (RS-1) la hoja se rinde en bbShell/appShell; en el VM va stubbeada.
    };
    ctx.bbGo = (h) => { loc.hash = h; };
    ctx.window = { matchMedia: () => ({ matches: false }) };
    ctx.matchMedia = () => ({ matches: false });
    vm.createContext(ctx);
    vm.runInContext(sliceFn(app, 'function mxTabKey(tab) {', 'function mxModoActual(tab) {'), ctx);
    vm.runInContext(headSrc, ctx);
    vm.runInContext(mzSrc, ctx);
    vm.runInContext(bbFn, ctx);
    const clickOnclick = (html, re) => {
      const m = html.match(re);
      if (!m) return null;
      vm.runInContext("bbGo('" + m[1] + "')", ctx); // ejecuta el handler real
      return loc.hash;
    };
    // bbShell móvil: las 2 pestañas (v846; onclick bbGo real).
    const bbInicio = vm.runInContext("bbShell('inicio', '<p>x</p>')", ctx);
    const destinos = [
      ['Hoy', /onclick="bbGo\('(#\/app\/inicio)'\)"/, '#/app/inicio'],
      ['Chat', /onclick="bbGo\('(#\/app\/chat)'\)"/, '#/app/chat'],
    ];
    for (const [nombre, re, esperado] of destinos) {
      loc.hash = '';
      const got = clickOnclick(bbInicio, re);
      t(got === esperado, `VM click pestaña ${nombre} (móvil) → ${esperado} (vino ${got})`);
    }
    // bbShell móvil en chat: el dock existe (2 pestañas, v846).
    const bbChat = vm.runInContext("bbShell('chat', '<p>x</p>')", ctx);
    t(bbChat.includes('bb-bar'), 'VM bbShell(chat): el dock EXISTE en chat');
    t((bbChat.match(/bb-tab/g) || []).length === 4, 'VM bbShell(chat): 2 pestañas en chat (4 × bb-tab: botón + icono por pestaña)');
    // Encabezado: identidad → Chat, compartir → hoja (RS-1), ruedita → Ajustes.
    for (const [nombre, re, esperado] of [
      ['identidad → Chat', /onclick="bbGo\('(#\/app\/chat)'\)"[^>]*aria-label="[^"]*(Chat|Posty)[^"]*"/, '#/app/chat'],
      ['ruedita → Ajustes', /onclick="bbGo\('(#\/app\/ajustes)'\)"/, '#/app/ajustes'],
    ]) {
      loc.hash = '';
      const got = clickOnclick(bbInicio, re);
      t(got === esperado, `VM click encabezado ${nombre} → ${esperado} (vino ${got})`);
    }
    // (RS-1) Compartir ya no navega a Referidos: abre la hoja (rsShareOpen, sin hash).
    t(bbInicio.includes('onclick="rsShareOpen()"'), 'VM encabezado: compartir → hoja (RS-1)');
    // mzTabsHTML: data-tab → hash por la regla del bind genérico.
    const mzInicio = vm.runInContext("mzTabsHTML('inicio')", ctx);
    const tabsMz = [...mzInicio.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
    t(JSON.stringify(tabsMz) === JSON.stringify(['inicio', 'chat']), `VM mz data-tab en orden [inicio, chat] (vino ${JSON.stringify(tabsMz)})`);
    for (const route of tabsMz) {
      loc.hash = '';
      vm.runInContext(`location.hash = '#/app/' + '${route}'`, ctx);
      t(loc.hash === '#/app/' + route, `VM bind mz data-tab ${route} → #/app/${route}`);
    }
    // Sin apertura: los shells rinden directo en Hoy, sin overlay ni
    // «Tocá para saltar» (9/11).
    t(!bbInicio.includes('pzApertura'), 'VM bbShell(inicio): sin overlay de apertura');
    t(!bbInicio.includes('Tocá para saltar'), 'VM bbShell(inicio): sin «Tocá para saltar»');
    t(!bbChat.includes('pzApertura'), 'VM bbShell(chat): sin overlay de apertura');
  }

  // ---------- 11. Boot aislado ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida (como test-lote-prueba-chat.js)');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-r0-'));
    const PORT = 18790;
    const BASE = `http://127.0.0.1:${PORT}`;
    const waitBoot = async (tries = 60) => {
      for (let i = 0; i < tries; i++) {
        try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      return false;
    };
    const srvProc = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      t(await waitBoot(), 'boot: server levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v846', `boot: /api/version 20261105-v846 (vino ${ver.build})`);
      const appTxt = await (await fetch(`${BASE}/app.js?v=578`)).text();
      t(md5(appTxt) === md5(app), 'boot: app.js?v=578 servido = árbol');
      const cssTxt = await (await fetch(`${BASE}/styles.css?v=20261223`)).text();
      t(md5(cssTxt) === md5(css), 'boot: styles.css?v=20261223 servido = árbol');
      const woff = await fetch(`${BASE}/fonts/nunito-var.woff2`);
      t(woff.ok, 'boot: /fonts/nunito-var.woff2 se sirve (200)');
      if (woff.ok) {
        const buf = Buffer.from(await woff.arrayBuffer());
        t(md5(buf) === MD5_WOFF2_MOCK, 'boot: woff2 servido = mock');
      }
      const rHoy = await fetch(`${BASE}/api/ritual/hoy`);
      t(rHoy.status === 401, `boot: sin sesión, /api/ritual/hoy → 401 (vino ${rHoy.status})`);
    } finally {
      try { srvProc.kill(); } catch (e) {}
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log(`\ntest-lote-rediseno-r0: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
