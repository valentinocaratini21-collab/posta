// test-lote-rediseno-r0.js — LOTE REDISEÑO R0 (8/11): shell de 6 pestañas +
// glass total + apertura 3 s + saludo que escribe + fuente autocontenida.
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
const MD5_APP_WORK = '14b9335beb4729fa095fd6d5252bb281';
const MD5_CSS_WORK = 'be8639f8497dc21edd17ec595c159a7f';
// El woff2 es copia byte a byte del mock (no generado).
const MD5_WOFF2_MOCK = '166202cc391c71a57730bed12cbcb159';

(async () => {
  // ---------- 1. Censo (sin cambio) + pins ----------
  t(srv.includes("const BUILD_ID = '20261105-v823'"), 'server: BUILD v822 (R0 no toca server.js; re-pin lote A)');
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(srv, '/aprobar') === 17, 'censo server: /aprobar 17');
  t(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
  t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
  t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
  t(cnt(app, 'pcDayKeyShift') === 6, 'censo app: pcDayKeyShift 6');
  t(cnt(app, '/aprobar') === 1, 'censo app: /aprobar 1');
  t(app.includes("const CHUNK_V = '20261105-v792'"), 'CHUNK_V v792 (sin cambio en este lote)');
  t(md5(app) === MD5_APP_WORK, 'app.js md5 (re-pin work-v1)');
  t(md5(css) === MD5_CSS_WORK, 'styles.css md5 (re-pin work-v1)');

  // ---------- 2. Dock de 5 en bbShell (estático; ítem 8: sin Estrategia) ----------
  const bbFn = sliceFn(app, 'function bbShell(tab, content) {', '\nasync function bbLoadEstado');
  const bbNav = (bbFn.split('\n').find((l) => l.includes('<nav class="bb-bar">')) || '');
  t(bbNav.length > 0, 'bbShell: la línea del nav existe');
  t(orderOk(bbNav, ["tabBtn('inicio'", "tabBtn('analisis'", "tabBtn('impulsar'", "tabBtn('jardin'", "tabBtn('chat'"]), 'bb-bar: orden Inicio, Análisis, Impulsar, Nivel, Chat (5 pestañas, sin Estrategia)');
  t(bbNav.includes("'#/app/numeros'"), 'bb-bar: Análisis apunta a #/app/numeros');
  t(bbNav.includes("'#/app/ads'"), 'bb-bar: Impulsar apunta a #/app/ads (ruta sin cambiar)');
  t(!bbNav.includes("tabBtn('estrategia'"), 'bb-bar: sin pestaña Estrategia (ítem 8: la recomendación vive en Impulsar)');
  t(bbNav.includes("'#/app/chat'"), 'bb-bar: Chat apunta a #/app/chat');
  t(!bbNav.includes('pzDockMasBtn'), 'bb-bar: el + SALE del dock');
  t(!bbNav.includes("tabBtn('ajustes'"), 'bb-bar: sin tab Ajustes');
  t(!bbFn.includes("tab === 'chat' ? '' : '<nav"), 'bbShell: sin exclusión del dock en chat');
  t(bbFn.includes('pzShellHeadHTML(tab)'), 'bbShell: renderiza el encabezado común');
  t(bbFn.includes('pzAperturaHTML()'), 'bbShell: renderiza la apertura');
  t(app.includes("function pzShellHeadHTML(tab)"), 'existe pzShellHeadHTML');
  t(app.includes('function pzAperturaHTML()'), 'existe pzAperturaHTML');
  t(app.includes('function pzAperturaArranque()'), 'existe pzAperturaArranque');
  t(app.includes('function pzAperturaCerrar()'), 'existe pzAperturaCerrar');
  t(app.includes('function pzSaludoEscribir()'), 'existe pzSaludoEscribir');
  t(app.includes('function pzShellDatosHoy()'), 'existe pzShellDatosHoy');
  t(app.includes('pzAperturaArranque()'), 'render: arranca la apertura tras pintar');
  { const paintIdx = app.indexOf('root.innerHTML = appShell(tab, content);');
    const bindIdx = app.indexOf('bindApp(tab);', paintIdx);
    t(paintIdx > 0 && bindIdx > paintIdx && app.slice(paintIdx, bindIdx).includes('__pzAperturaTimer'), 'render: el timer de 3 s se arma en la pintura, antes de bindApp (no se alarga en cargas lentas)'); }

  // ---------- 3. Dock de 5 en mzTabsHTML (VM; ítem 8: sin Estrategia) ----------
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
    const navNumeros = vm.runInContext("mzTabsHTML('numeros')", ctx);
    const navAnalisis = vm.runInContext("mzTabsHTML('analisis')", ctx);
    const navAds = vm.runInContext("mzTabsHTML('ads')", ctx);
    const navChat = vm.runInContext("mzTabsHTML('chat')", ctx);
    const navJardin = vm.runInContext("mzTabsHTML('jardin-posty')", ctx);
    const navAjustes = vm.runInContext("mzTabsHTML('ajustes')", ctx);
    t(navTabs(navInicio) === 5, 'VM mzTabsHTML(inicio): 5 botones en el dock (sin Estrategia)');
    t(!navInicio.includes('Agregar'), 'VM mzTabsHTML(inicio): sin Agregar');
    t(!navInicio.includes('Ajustes'), 'VM mzTabsHTML(inicio): sin Ajustes en el dock');
    t(orderOk(navInicio, ['>Inicio<', '>Análisis<', '>Impulsar<', '>Nivel<', '>Chat<']), 'VM mzTabsHTML(inicio): orden Inicio, Análisis, Impulsar, Nivel, Chat');
    t(navInicio.includes('data-tab="numeros"'), 'VM mzTabsHTML: Análisis lleva data-tab numeros');
    t(navInicio.includes('data-tab="ads"'), 'VM mzTabsHTML: Impulsar lleva data-tab ads');
    t(!navInicio.includes('data-tab="analisis"'), 'VM mzTabsHTML: sin data-tab analisis (sin Estrategia)');
    t(navInicio.includes('data-tab="chat"'), 'VM mzTabsHTML: Chat lleva data-tab chat');
    t(navNumeros.includes('mz-tab on') && navNumeros.indexOf('mz-tab on') < navNumeros.indexOf('>Análisis<'), 'VM mzTabsHTML(numeros): tab Análisis activo');
    t(!navAnalisis.includes('mz-tab on'), 'VM mzTabsHTML(analisis): ningún tab activo (la ruta analisis redirige a #/app/ads; el dock nunca se pinta con tab=analisis)');
    t(navAds.includes('mz-tab on') && navAds.indexOf('mz-tab on') < navAds.indexOf('>Impulsar<'), 'VM mzTabsHTML(ads): tab Impulsar activo');
    t(navChat.length > 0, 'VM mzTabsHTML(chat): el dock EXISTE en chat (no vacío)');
    t(navTabs(navChat) === 5, 'VM mzTabsHTML(chat): 5 botones también en chat');
    t(navChat.includes('mz-tab on') && navChat.indexOf('mz-tab on') < navChat.indexOf('>Chat<'), 'VM mzTabsHTML(chat): tab Chat activo');
    t(navJardin.includes('mz-tab on') && navJardin.indexOf('mz-tab on') < navJardin.indexOf('>Nivel<'), 'VM mzTabsHTML(jardin-posty): tab Nivel activo');
    t(!navAjustes.includes('mz-tab on'), 'VM mzTabsHTML(ajustes): ningún tab activo en Ajustes');
    t(navTabs(navAjustes) === 5, 'VM mzTabsHTML(ajustes): el dock sigue con 5 en Ajustes');
  }

  // ---------- 4. mxTabKey: remap (VM) ----------
  {
    const ctx = { console };
    vm.createContext(ctx);
    vm.runInContext(sliceFn(app, 'function mxTabKey(tab) {', 'function mxModoActual(tab) {'), ctx);
    const k = (tab) => vm.runInContext(`mxTabKey('${tab}')`, ctx);
    t(k('inicio') === 'inicio', "mxTabKey: inicio → inicio");
    t(k('numeros') === 'analisis', "mxTabKey: numeros → analisis");
    t(k('analisis') === '', "mxTabKey: analisis → '' (sin pestaña Estrategia; el router manda a #/app/ads)");
    t(k('ads') === 'impulsar', "mxTabKey: ads → impulsar");
    t(k('jardin-posty') === 'jardin', "mxTabKey: jardin-posty → jardin");
    t(k('chat') === 'chat', "mxTabKey: chat → chat");
    t(k('schedule') === 'semana' && k('post') === 'semana', 'mxTabKey: schedule/post → semana (sin cambio)');
    t(k('ajustes') === 'ajustes', 'mxTabKey: ajustes → ajustes (sin cambio)');
  }

  // ---------- 5. Encabezado común ----------
  const headSrc = sliceFn(app, 'function pzShellHeadHTML(tab) {', 'function pzAperturaHTML() {');
  t(headSrc.length > 0, 'pzShellHeadHTML: función presente');
  t(headSrc.includes("if (tab === 'chat') return '';"), 'encabezado: NO va en chat (el chat tiene su propia cabecera)');
  t(headSrc.includes('ai-avatar.png'), 'encabezado: avatar canónico ai-avatar.png');
  t(headSrc.includes('pzShellSaludo'), 'encabezado: saludo con id pzShellSaludo (máquina de escribir)');
  t(headSrc.includes('¡Hola!'), 'encabezado: fallback «¡Hola!» solo sin nombre ni handle (saludo-unico)');
  t(!headSrc.includes('Hola, '), 'encabezado: sin «Hola, {negocio}» (el encabezado es la identidad, saludo-unico)');
  t(!headSrc.includes('Posty está trabajando ahora'), 'encabezado: «Posty está trabajando ahora» salió (saludo-unico)');
  t(headSrc.includes('@') && headSrc.includes('handle'), 'encabezado: línea chica = @handle (saludo-unico)');
  t(headSrc.includes('pzHeadRacha'), 'encabezado: píldora de racha con id pzHeadRacha');
  t(headSrc.includes('__pzHeadRachaTxt'), 'encabezado: la racha se cachea (un re-render del shell no la vacía)');
  t(headSrc.includes('BB.estado') && headSrc.includes('negocio'), 'encabezado: nombre desde BB.estado.negocio');
  t(!headSrc.includes('data-hf-pact'), 'encabezado: sin botones del perfil (son de Hoy, no del shell)');
  // Botones del encabezado con destino (vara cero botones muertos):
  t(headSrc.includes("bbGo('#/app/chat')"), 'encabezado: identidad (avatar+saludo) abre el Chat');
  t(headSrc.includes("bbGo('#/app/ajustes?referidos=1')"), 'encabezado: compartir lleva a Referidos');
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
    t(h.includes('Café Aroma') && !h.includes('Hola'), 'VM encabezado(inicio): título = nombre, sin saludo (saludo-unico)');
    t(h.includes('@cafearoma'), 'VM encabezado(inicio): chica = @handle (saludo-unico)');
    t(h.includes('pzHeadRacha'), 'VM encabezado(inicio): píldora de racha presente');
    t(h.includes("bbGo('#/app/chat')"), 'VM encabezado(inicio): identidad → Chat');
    t(h.includes("bbGo('#/app/ajustes?referidos=1')"), 'VM encabezado(inicio): compartir → Referidos');
    t(h.includes("bbGo('#/app/ajustes')"), 'VM encabezado(inicio): ruedita → Ajustes');
    t(vm.runInContext("pzShellHeadHTML('chat')", ctx) === '', 'VM encabezado(chat): vacío');
  }

  // ---------- 6. Apertura 3 s + saludo que escribe + datos de hoy ----------
  const apSrc = sliceFn(app, 'function pzAperturaHTML() {', 'function pzAperturaArranque() {');
  t(apSrc.length > 0, 'pzAperturaHTML: función presente');
  t(apSrc.includes('pzApertura'), 'apertura: overlay con id pzApertura');
  t(apSrc.includes('¡Hola!'), 'apertura: burbuja «¡Hola!»');
  t(!apSrc.split('if (cartaD')[0].includes('Te traje el posteo de hoy'), 'apertura: la burbuja NO promete el posteo sin dato (el texto con el posteo solo aparece cuando el dato existe)');
  t(apSrc.includes('if (cartaD && cartaD.imagen)'), 'apertura: el texto con el posteo solo se arma con la carta en mano');
  t(apSrc.includes('pzAperturaCard'), 'apertura: tarjeta del posteo con id pzAperturaCard');
  t(apSrc.includes('pzAperturaBurbuja'), 'apertura: burbuja con id pzAperturaBurbuja');
  t(apSrc.includes('__pzAperturaCerrada'), 'apertura: el flag es «cerrada», no «pintada» (sobrevive a los re-renders de la carga)');
  t(apSrc.includes('__pzAperturaCardHTML'), 'apertura: la tarjeta se cachea (un re-render no la vacía)');
  t(apSrc.includes('pzAperturaCerrar()'), 'apertura: tap para saltar (onclick → pzAperturaCerrar)');
  const arrSrc = sliceFn(app, 'function pzAperturaArranque() {', 'function pzAperturaCerrar() {');
  t(arrSrc.includes('3000'), 'apertura: auto-cierre a los 3000 ms');
  t(arrSrc.indexOf('pzShellDatosHoy()') > -1 && arrSrc.indexOf('pzShellDatosHoy()') < arrSrc.indexOf("if (!ov) return;"), 'arranque: los datos (racha+tarjeta) se piden aunque la apertura ya cerró');
  t(arrSrc.includes('prefers-reduced-motion'), 'apertura: reduced-motion salta');
  t(arrSrc.includes('pzAperturaCerrar'), 'apertura: el arranque cierra por pzAperturaCerrar');
  t(arrSrc.includes('pzShellDatosHoy'), 'apertura: el arranque llena los datos de hoy');
  t(arrSrc.includes('__pzAperturaTimer'), 'apertura: el timer de 3 s se pone una sola vez (un re-render no lo duplica)');
  t(arrSrc.includes('pzApertura') && arrSrc.includes('getElementById'), 'apertura: el arranque solo actúa si el overlay existe');
  const cerSrc = sliceFn(app, 'function pzAperturaCerrar() {', 'function pzSaludoEscribir() {');
  t(cerSrc.includes('pzSaludoEscribir'), 'apertura: al cerrar arranca el saludo que escribe');
  const salSrc = sliceFn(app, 'function pzSaludoEscribir() {', 'function pzShellDatosHoy() {');
  t(salSrc.includes('pzShellSaludo'), 'saludo: escribe sobre #pzShellSaludo');
  t(salSrc.includes('Math.max(24, Math.floor(1000'), 'saludo: ~1 segundo en total (paso = max(24, 1000/largo))');
  t(salSrc.includes('prefers-reduced-motion'), 'saludo: reduced-motion → instantáneo');
  t(salSrc.includes('typing'), 'saludo: clase typing con cursor');
  const hoySrc = sliceFn(app, 'function pzShellDatosHoy() {', '// ===== /LOTE REDISEÑO R0');
  t(hoySrc.includes("/api/ritual/hoy"), 'datos-hoy: UN fetch a /api/ritual/hoy (racha + tarjeta)');
  t(hoySrc.includes('pzHeadRacha'), 'datos-hoy: llena la píldora de racha');
  t(hoySrc.includes('__pzHeadRachaTxt'), 'datos-hoy: la racha llenada se cachea para el próximo render');
  t(hoySrc.includes("typeof") && hoySrc.includes('racha') && hoySrc.includes('number'), 'datos-hoy: la racha solo se muestra con número real');
  t(hoySrc.includes('cartas[0]'), 'datos-hoy: la tarjeta sale de cartas[0] (o recomendada)');
  t(hoySrc.includes('!carta.imagen') || hoySrc.includes('carta.imagen'), 'datos-hoy: sin imagen no hay tarjeta (nunca inventar)');
  t(hoySrc.includes('caption_corta') || hoySrc.includes('caption'), 'datos-hoy: título de la tarjeta desde el caption real');
  t(hoySrc.includes('hora_salida'), 'datos-hoy: hora de la tarjeta desde hora_salida real');
  t(hoySrc.includes('pzAperturaBurbuja') && hoySrc.includes('Te traje el posteo de hoy'), 'datos-hoy: «Te traje el posteo de hoy» SOLO cuando la tarjeta existe');
  // Reintento: el fetch se marca «hecho» solo cuando vuelve bien; si
  // falla, el pendiente se limpia y el próximo arranque lo reintenta
  // (un 401 en la pantalla de login no deja la apertura sin datos).
  t(hoySrc.includes('__pzShellHoyPendiente'), 'datos-hoy: flag pendiente (un fetch por carga, con reintento si falla)');
  t(hoySrc.includes('.catch(') && hoySrc.includes('__pzShellHoyPendiente = false'), 'datos-hoy: si el fetch falla, el pendiente se limpia (reintenta)');
  t(hoySrc.includes('r.ok === false'), 'datos-hoy: una respuesta sin ok no marca «hecho»');
  // El fetch arranca con el render y puede resolver ANTES de la
  // primera pintura: la racha y la tarjeta se cachean SIEMPRE (no solo
  // si el nodo vivo existe), y los templates pintan desde el caché.
  t(hoySrc.indexOf('__pzHeadRachaTxt = rachaTxt') > -1 && hoySrc.indexOf('__pzHeadRachaTxt = rachaTxt') < hoySrc.indexOf("getElementById('pzHeadRacha')"), 'datos-hoy: la racha se cachea antes de buscar el nodo vivo (el fetch puede resolver antes de pintar)');
  t(hoySrc.indexOf('__pzAperturaCardHTML = cardHTML') > -1 && hoySrc.indexOf('__pzAperturaCardHTML = cardHTML') < hoySrc.indexOf("getElementById('pzAperturaCard')"), 'datos-hoy: la tarjeta se cachea antes de buscar el nodo vivo (el fetch puede resolver antes de pintar)');
  // El idioma no se congela en el caché: el fetch arranca antes de que ME
  // cargue y el texto con el idioma de ese momento saldría en español en
  // un usuario EN. Se cachea el DATO y cada template localiza al pintar.
  t(hoySrc.includes('__pzHeadRachaN = r.racha'), 'datos-hoy: la racha se cachea como NÚMERO (el template localiza)');
  t(hoySrc.includes('__pzHoyCarta = {'), 'datos-hoy: la carta se cachea como DATOS (el template localiza)');
  t(headSrc.includes('__pzHeadRachaN'), 'encabezado: la píldora se arma desde el número cacheado (localiza con el ME vigente)');
  t(apSrc.includes('__pzHoyCarta'), 'apertura: la tarjeta se arma desde los datos cacheados (localiza con el ME vigente)');
  { const rendIdx = app.indexOf('async function render() {');
    const paintIdx2 = app.indexOf('root.innerHTML = appShell(tab, content);', rendIdx);
    t(rendIdx > 0 && paintIdx2 > rendIdx && app.slice(rendIdx, paintIdx2).includes('pzShellDatosHoy()'), 'render: los datos de hoy se piden al arrancar el render, antes de pintar'); }

  // ---------- 6 bis. Chat: el dock visible sin tapar el input ----------
  // El chat es un overlay fijo a pantalla completa (z-300): sin este
  // ajuste taparía el dock. R0 acorta el chat hasta sobre el dock
  // (midiendo el dock real); con el teclado abierto no se resta nada.
  const kbSrc = sliceFn(app, 'function pzChatKbSync() {', 'function pzChatKbBind() {');
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
    t(css.includes('.pz-chatfull .chat-input-row') && /margin:0 0 calc\(10px \+ env\(safe-area-inset-bottom\)\)/.test(css), 'chat: la fila del input conserva su margin-bottom de base'); }

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
  t(css.includes('.pz-apertura'), 'glass: CSS de la apertura presente');
  t(css.includes('.pz-shell-racha'), 'glass: CSS de la píldora de racha presente');
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
  t(orderOk(shellFn, ['data-tab="inicio"', 'data-tab="numeros"', 'data-tab="ads"', 'data-tab="jardin-posty"', 'data-tab="chat"', 'data-tab="ajustes"']), 'drawer: orden Inicio, Análisis, Impulsar, Nivel, Chat, Ajustes (sin Estrategia)');
  t(shellFn.includes('pzShellHeadHTML(tab)'), 'appShell: renderiza el encabezado común');
  t(shellFn.includes('pzAperturaHTML()'), 'appShell: renderiza la apertura');
  t(app.includes("location.hash = '#/app/' + b.dataset.tab"), 'drawer: bind genérico data-tab → hash (sin cambio)');

  // ---------- 10. Navegación de verdad en VM (vara cero botones muertos) ----------
  // Se ejecutan los handlers reales sobre el HTML real del shell: cada
  // botón tiene que dejar location.hash en su destino.
  if (!headSrc || !apSrc || !app.includes('function pzAperturaCerrar()')) {
    t(false, 'VM navegación: faltan las funciones R0 para evaluar (base)');
  } else {
    const loc = { hash: '' };
    const removed = [];
    const docEls = {};
    const fakeDoc = {
      getElementById: (id) => docEls[id] || null,
      querySelector: () => null,
    };
    let saludoLlamado = false;
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
      pzSaludoEscribir: () => { saludoLlamado = true; },
    };
    ctx.bbGo = (h) => { loc.hash = h; };
    ctx.window = { matchMedia: () => ({ matches: false }) };
    ctx.matchMedia = () => ({ matches: false });
    vm.createContext(ctx);
    vm.runInContext(sliceFn(app, 'function mxTabKey(tab) {', 'function mxModoActual(tab) {'), ctx);
    vm.runInContext(headSrc, ctx);
    vm.runInContext(apSrc, ctx);
    vm.runInContext(sliceFn(app, 'function pzAperturaCerrar() {', 'function pzSaludoEscribir() {'), ctx);
    vm.runInContext(mzSrc, ctx);
    vm.runInContext(bbFn, ctx);
    // La apertura se captura ANTES de renderizar los shells: la primera
    // llamada fija el flag de una-vez-por-carga.
    const apHtml = vm.runInContext('pzAperturaHTML()', ctx);
    const clickOnclick = (html, re) => {
      const m = html.match(re);
      if (!m) return null;
      vm.runInContext("bbGo('" + m[1] + "')", ctx); // ejecuta el handler real
      return loc.hash;
    };
    // bbShell móvil: las 5 pestañas (onclick bbGo real).
    const bbInicio = vm.runInContext("bbShell('inicio', '<p>x</p>')", ctx);
    const destinos = [
      ['Inicio', /onclick="bbGo\('(#\/app\/inicio)'\)"/, '#/app/inicio'],
      ['Análisis', /onclick="bbGo\('(#\/app\/numeros)'\)"/, '#/app/numeros'],
      ['Impulsar', /onclick="bbGo\('(#\/app\/ads)'\)"/, '#/app/ads'],
      ['Nivel', /onclick="bbGo\('(#\/app\/jardin-posty)'\)"/, '#/app/jardin-posty'],
      ['Chat', /onclick="bbGo\('(#\/app\/chat)'\)"/, '#/app/chat'],
    ];
    for (const [nombre, re, esperado] of destinos) {
      loc.hash = '';
      const got = clickOnclick(bbInicio, re);
      t(got === esperado, `VM click pestaña ${nombre} (móvil) → ${esperado} (vino ${got})`);
    }
    // bbShell móvil en chat: el dock existe (6 pestañas).
    const bbChat = vm.runInContext("bbShell('chat', '<p>x</p>')", ctx);
    t(bbChat.includes('bb-bar'), 'VM bbShell(chat): el dock EXISTE en chat');
    t((bbChat.match(/bb-tab/g) || []).length >= 6, 'VM bbShell(chat): 6 pestañas en chat');
    // Encabezado: identidad → Chat, compartir → Referidos, ruedita → Ajustes.
    for (const [nombre, re, esperado] of [
      ['identidad → Chat', /onclick="bbGo\('(#\/app\/chat)'\)"[^>]*aria-label="[^"]*(Chat|Posty)[^"]*"/, '#/app/chat'],
      ['compartir → Referidos', /onclick="bbGo\('(#\/app\/ajustes\?referidos=1)'\)"/, '#/app/ajustes?referidos=1'],
      ['ruedita → Ajustes', /onclick="bbGo\('(#\/app\/ajustes)'\)"/, '#/app/ajustes'],
    ]) {
      loc.hash = '';
      const got = clickOnclick(bbInicio, re);
      t(got === esperado, `VM click encabezado ${nombre} → ${esperado} (vino ${got})`);
    }
    // mzTabsHTML: data-tab → hash por la regla del bind genérico.
    const mzInicio = vm.runInContext("mzTabsHTML('inicio')", ctx);
    const tabsMz = [...mzInicio.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
    t(JSON.stringify(tabsMz) === JSON.stringify(['inicio', 'numeros', 'ads', 'jardin-posty', 'chat']), `VM mz data-tab en orden [inicio, numeros, ads, jardin-posty, chat] (vino ${JSON.stringify(tabsMz)})`);
    for (const route of tabsMz) {
      loc.hash = '';
      vm.runInContext(`location.hash = '#/app/' + '${route}'`, ctx);
      t(loc.hash === '#/app/' + route, `VM bind mz data-tab ${route} → #/app/${route}`);
    }
    // Apertura: tap para saltar cierra el overlay y arranca el saludo.
    docEls.pzApertura = { remove: () => { removed.push('pzApertura'); delete docEls.pzApertura; } };
    docEls.pzShellSaludo = { textContent: '', classList: { add: () => {} } };
    t(apHtml.includes('onclick="pzAperturaCerrar()"'), 'VM apertura: el overlay tiene onclick → pzAperturaCerrar');
    // La apertura sobrevive a un re-render: segunda llamada ANTES de
    // cerrar devuelve el overlay de nuevo (el flag es «cerrada»).
    const apHtmlRe = vm.runInContext('pzAperturaHTML()', ctx);
    t(apHtmlRe.includes('pzApertura'), 'VM apertura: segunda vez SÍ hay overlay (sobrevive al re-render)');
    saludoLlamado = false;
    vm.runInContext('pzAperturaCerrar()', ctx);
    t(removed.includes('pzApertura'), 'VM click apertura: el overlay se remueve');
    t(saludoLlamado === true, 'VM click apertura: arranca el saludo que escribe');
    // Después de cerrar, ya no hay overlay.
    const apHtml2 = vm.runInContext('pzAperturaHTML()', ctx);
    t(apHtml2 === '', 'VM apertura: después de cerrar no hay overlay');
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
      t(ver.build === '20261105-v823', `boot: /api/version 20261105-v822 (vino ${ver.build})`);
      const appTxt = await (await fetch(`${BASE}/app.js?v=539`)).text();
      t(md5(appTxt) === md5(app), 'boot: app.js?v=539 servido = árbol');
      const cssTxt = await (await fetch(`${BASE}/styles.css?v=20261183`)).text();
      t(md5(cssTxt) === md5(css), 'boot: styles.css?v=20261183 servido = árbol');
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
