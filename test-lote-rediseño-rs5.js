// test-lote-rediseño-rs5.js — LOTE REDISEÑO SIMPLE RS-5 (9/11, mock v10):
// (a) barra de 3 pestañas Hoy · Feed · Chat (sin Análisis, sin Impulsar,
// sin Nivel; la pestaña Ads se quita porque Impulsar ya vive en el Feed
// por RS-4); (b) chat reglas 10-13: sin temas (un solo hilo), todo con
// toques (otra foto / otro texto / otra idea; «Escribir» solo como
// excepción), la voz es la entrada principal (micrófono GRANDE, el
// teclado detrás de «Escribir»), un mensaje de Posty por día (la
// pregunta de los lunes va ADENTRO de ese mensaje); (c) recomendación
// de Impulsar en el chat (mismo recomendado y mismo texto que RS-4);
// (e) copy «jardín» fuera (el jardín no tiene lugar en el rediseño).
// Servidor: SIN CAMBIO salvo el BUILD (re-pin v846; base v831; la recomendación usa el endpoint
// existente /api/estrategia/mejor-posteo y la pregunta de los lunes el
// existente /api/weekly-consultas).
// Node puro: asserts estáticos + VM con DOM falso sobre las secciones
// RS-5 de app.js + auditoría de funciones + boot real por HTTP (solo si
// express resuelve, como test-lote-rediseño-rs4.js). Puerto 34584.
// Uso: node test-lote-rediseño-rs5.js
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
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const md5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const sliceBetween = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

(async () => {
  // ---------- 1. Censo + pins del árbol RS-5 (base v831) ----------
  t(srv.includes("const BUILD_ID = '20261105-v846'"), 'server: BUILD v846 en el árbol (estampado por el preparador)');
  t(md5(srv) === '60011803ff43888371b4049514d7d64d', 'server.js md5 (v846 fusionado: Juli + lote)');
  t(md5(app) === '6c0faedd9bd3e7304b40a18ca765bc9b', 'app.js md5 (v846)');
  t(md5(css) === '64d34e3d4550385ae46b127b766927e1', 'styles.css md5 (v846)');
  t(app.split('\n').length - 1 === 30400, 'app.js 30400 líneas (v846)');
  t(css.split('\n').length - 1 === 6067, 'styles.css 6067 líneas (v846)');
  t(cnt(app, 'LOTE REDISEÑO SIMPLE RS-5') === 0 && cnt(app, 'RS-5') >= 10, 'app: marcadores RS-5 presentes');
  t(cnt(css, 'RS-5') === 1, 'styles: bloque RS-5 ×1');
  // Censo de los frentes ajenos (no se pisan).
  t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
  t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
  t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
  t(cnt(app, 'pzBoost') === 198, 'censo app: pzBoost ×198 (v846: refactor del picker por clave)');
  t(app.includes('function pzOpenBoostPick() { return pzBoostPickOpen(); }'), 'contrato RS-4: pzOpenBoostPick intacto');
  t(app.includes("function adsView() {") && app.includes("function bindAds() {"), 'app: adsView/bindAds intactos (la ruta Ads sigue viva por URL, sin pestaña)');

  // ---------- 2. (a) Barra de 3 pestañas ----------
  const mzSrc = sliceBetween(app, 'function mzTabsHTML(tab) {', '\n}\n');
  t(mzSrc.length > 200, 'barra: mzTabsHTML extraída (' + mzSrc.length + ' caracteres)');
  t(mzSrc.includes("gzT('Hoy', 'Today')") && mzSrc.includes("pzIc('navCasa')") && mzSrc.includes("gzT('Chat', 'Chat')") && !mzSrc.includes('Feed'),
    'barra: mzTabsHTML = Hoy · Chat (v846: sin Feed)');
  t(!mzSrc.includes('Análisis') && !mzSrc.includes('Impulsar') && !mzSrc.includes('Nivel') && !mzSrc.includes('numeros') && !mzSrc.includes("'ads'"),
    'barra: mzTabsHTML sin Análisis / Impulsar / Nivel / numeros / ads');
  t(cnt(mzSrc, "t('") === 2, 'barra: mzTabsHTML tiene exactamente 2 pestañas (v846)');
  const bbBar = sliceBetween(app, '<nav class="bb-bar">', '</nav>');
  t(bbBar.includes("tabBtn('inicio'") && !bbBar.includes("tabBtn('feed'") && bbBar.includes("tabBtn('chat'"),
    'barra: bb-bar = inicio · chat (v846: sin Feed)');
  t(!bbBar.includes('analisis') && !bbBar.includes('impulsar') && !bbBar.includes('jardin'),
    'barra: bb-bar sin analisis / impulsar / jardin');
  t(cnt(bbBar, 'tabBtn(') === 2, 'barra: bb-bar tiene exactamente 2 botones (v846)');
  // El drawer vive dentro de appShell (no hay función drawerHTML): 3
  // enlaces de navegación (Hoy / Feed / Chat) + Ajustes + Salir.
  const drawer = sliceBetween(app, 'function appShell(tab, content) {', 'function openDrawer(){');
  t(cnt(drawer, 'data-tab="inicio"') === 1 && cnt(drawer, 'data-tab="feed"') === 0 && cnt(drawer, 'data-tab="chat"') === 1,
    'barra: drawer tiene Hoy / Chat (1 cada uno, v846: sin Feed)');
  t(!drawer.includes('data-tab="numeros"') && !drawer.includes('data-tab="ads"') && !drawer.includes('data-tab="jardin-posty"'),
    'barra: drawer sin numeros / ads / jardin-posty');
  t(drawer.includes('data-tab="ajustes"') && drawer.includes('drawerLogout'),
    'barra: drawer conserva Ajustes y Salir');
  const mxSrc = sliceBetween(app, 'function mxTabKey(tab) {', '\n}\n');
  t(!mxSrc.includes("tab === 'feed'") && !mxSrc.includes("jardin-posty") && !mxSrc.includes("numeros") && !mxSrc.includes("'ads'"),
    'barra: mxTabKey ya NO conoce feed (v846) ni mapea numeros / ads / jardin-posty');
  t(app.includes("feed: '<svg viewBox=\"0 0 24 24\""), 'barra: icono feed (grid 2x2) en el mapa ic del bb-bar');
  // VM: mzTabsHTML con stubs de pzIc/gzT. (El slice excluye la llave de
  // cierre; se repone al evaluar.)
  const barCtx = vm.createContext({
    console,
    pzIc: (name) => '<svg data-ic="' + name + '"></svg>',
    gzT: (es, en) => es,
  });
  vm.runInContext(mzSrc + '\n}', barCtx);
  const barHTML = (tab) => { barCtx.__h = ''; vm.runInContext('__h = mzTabsHTML(' + JSON.stringify(tab) + ');', barCtx); return barCtx.__h; };
  const hInicio = barHTML('inicio');
  t((hInicio.match(/data-tab="/g) || []).length === 2, 'VM barra: 2 botones en el dock (v846)');
  t(hInicio.includes('data-tab="inicio"') && !hInicio.includes('data-tab="feed"') && hInicio.includes('data-tab="chat"'), 'VM barra: rutas inicio / chat (v846)');
  t(hInicio.includes('Hoy') && !hInicio.includes('Feed') && hInicio.includes('Chat'), 'VM barra: rótulos Hoy / Chat (v846)');
  t(hInicio.includes('mz-tab on') && hInicio.indexOf('mz-tab on') < hInicio.indexOf('data-tab="chat"'), 'VM barra: en inicio, la pestaña activa es Hoy');
  const hFeed = barHTML('feed');
  t(!hFeed.includes('mz-tab on'), 'VM barra: en feed (ruta vieja) ninguna pestaña activa (v846: redirige a Hoy)');
  const hChat = barHTML('chat');
  t(hChat.includes('mz-tab on') && hChat.indexOf('mz-tab on') > hChat.indexOf('data-tab="inicio"'), 'VM barra: en chat, la pestaña activa es Chat');
  const hNumeros = barHTML('numeros');
  t(!hNumeros.includes('mz-tab on'), 'VM barra: en numeros (ruta vieja sin pestaña) ninguna pestaña activa');
  const hAds = barHTML('ads');
  t(!hAds.includes('mz-tab on'), 'VM barra: en ads (ruta vieja sin pestaña) ninguna pestaña activa');

  // ---------- 3. (b) Chat voz primero (regla 12) ----------
  const chatCard = sliceBetween(app, 'function chatCardHTML', 'function renderVozPostCard'); // (v846) chatTopHTML ya no existe; el slice iba hasta EOF
  t(chatCard.includes('class="pz-voicebar"'), 'voz: chatCardHTML tiene .pz-voicebar');
  t(chatCard.includes('class="pz-mic-big" id="chatMicSend"'), 'voz: micrófono GRANDE con el mismo id #chatMicSend (hereda el binding de voz)');
  t(chatCard.includes("pzIc('mic', 26)"), 'voz: el mic grande usa el icono mic a 26px');
  t(chatCard.includes('Hablarle a Posty') && chatCard.includes('Tocá el micrófono grande'), 'voz: texto «Hablarle a Posty» + pista de WhatsApp');
  t(!chatCard.includes('id="pzWriteToggle"'), 'voz: el toggle «Escribir» YA NO está (v846: chat solo por audio)');
  t(!chatCard.includes('id="pzWriteRow"'), 'voz: la fila de escritura YA NO está (v846)');
  t(!chatCard.includes('id="chatInput"'), 'voz: no hay input de texto en la tarjeta (v846: solo audio)');
  t(chatCard.includes('id="chatPhotoBtn"') && chatCard.indexOf('id="chatPhotoBtn"') < chatCard.indexOf('id="chatMicSend"'), 'voz: la camarita vive en la barra, ANTES del mic (v846: izquierda, visible siempre)');
  t(chatCard.includes('id="chatFile"'), 'voz: el picker de archivo sigue en la tarjeta');
  t(chatCard.includes('Todo se responde tocando o hablando.'), 'voz: pista «Todo se responde tocando o hablando.» (v846)');
  t(!chatCard.includes('id="chatMicSend" title="Pedir con nota de voz"'), 'voz: el mic chico con título viejo ya no existe');
  t(!app.includes('(function pzWriteToggleDelegar() {'), 'voz: pzWriteToggleDelegar murió (v846)');
  t(!app.includes("window.__pzWriteToggleDelegado"), 'voz: la guarda del toggle murió con él (v846)');
  t(css.includes('.pz-mic-big') && css.includes('.pz-voicebar') && !css.includes('.pz-write-toggle') && css.includes('.pz-voice-hint') && css.includes('.pz-cam-btn'),
    'voz: estilos (mic grande, voicebar, hint, camarita; sin toggle, v846)');
  t(css.includes('width:58px;height:58px'), 'voz: el mic grande mide 58px');
  t(css.includes('.pz-mic-big svg{width:26px;height:26px;stroke:#fff}'),
    'voz: el icono del mic es BLANCO sobre el fondo celeste (pzIc pinta en celeste; sin esto el mic no se ve)');
  // VM (v846): la camarita abre el picker, sin teclado. chatPhotoDelegar
  // es una IIFE con listener de click en document: el tap en #chatPhotoBtn
  // fija accept foto+video y hace click() en #chatFile (carril exprés).
  const camSrc = sliceBetween(app, '(function chatPhotoDelegar() {', '})();');
  t(camSrc.length > 200, 'VM voz: IIFE chatPhotoDelegar extraída (' + camSrc.length + ' caracteres)');
  const camCtx = vm.createContext({ console, window: {} });
  const camHandlers = [];
  const camPicker = { accept: '', __clicked: 0, click() { this.__clicked++; } };
  const camBtn = { closest: (sel) => (sel === '#chatPhotoBtn' ? camBtn : null) };
  camCtx.document = {
    addEventListener: (ev, fn) => { if (ev === 'click') camHandlers.push(fn); },
    getElementById: (id) => (id === 'chatFile' ? camPicker : null),
    querySelector: () => null,
  };
  vm.runInContext(camSrc + '})();', camCtx);
  t(camHandlers.length === 1, 'VM voz: chatPhotoDelegar registra un solo listener de click');
  camHandlers[0]({ target: camBtn });
  t(camPicker.accept === 'image/*,video/*' && camPicker.__clicked === 1, 'VM voz: tocar la camarita abre el picker (foto o video)');
  camHandlers[0]({ target: { closest: () => null } });
  t(camPicker.__clicked === 1, 'VM voz: un click fuera de la camarita no abre el picker');

  // ---------- 4. (b) Chat sin temas + un mensaje por día (reglas 10 y 13) ----------
  t(cnt(app, 'SOBRE · TEMA') === 0, 'temas: el rótulo «SOBRE · TEMA X DE N» ya no existe (×0)');
  t(!app.includes('Estamos hablando solo de esto'), 'temas: el texto «Estamos hablando solo de esto» ya no existe');
  t(!app.includes('una frase corta, sobre este tema'), 'temas: el placeholder de tema ya no existe');
  t(!app.includes('inp.maxLength = 120'), 'temas: el maxlength 120 del tema ya no existe');
  t(!app.includes('Anotado en Análisis') && !app.includes('queda guardado en tu análisis') && !app.includes('saved in your analysis'),
    'temas: ninguna mención a Análisis en los acks de los lunes');
  t(!app.includes('¿Algo puntual sobre este tema?'), 'temas: la pregunta «¿Algo puntual sobre este tema?» ya no existe');
  const hoyCard = sliceBetween(app, "} else if (tema.kind === 'hoy') {", "} else if (tema.kind === 'lunes') {");
  t(hoyCard.includes('pz-daily-msg') && hoyCard.includes("HOY · EL ÚNICO MENSAJE DE POSTY"), 'día: la tarjeta del día es .pz-daily-msg con su rótulo');
  t(hoyCard.includes('Hola, este es tu posteo de hoy. Aprobalo con un toque, o cambialo tocando — sin escribir nada.'), 'día: intro del mock en la tarjeta del día');
  t(hoyCard.includes('pzTemaLunesBoxHTML(lunesPend)'), 'día: la pregunta de los lunes se pinta ADENTRO del mensaje del día');
  t(hoyCard.includes('Eso es todo por hoy: un solo mensaje de Posty por día.'), 'día: nota de un mensaje por día al pie de la tarjeta');
  t(!hoyCard.includes('SOBRE · TEMA'), 'día: la tarjeta del día no tiene rótulo de tema');
  const lunesCard = sliceBetween(app, "} else if (tema.kind === 'lunes') {", "} else if (tema.kind === 'comentario') {");
  t(!lunesCard.includes('SOBRE · TEMA') && lunesCard.includes('Una respuesta y queda anotado.'), 'lunes: la tarjeta propia (fallback) sin rótulo de tema ni «en Análisis»');
  t(app.includes('function pzTemaLunesBoxHTML(lunesTema) {'), 'lunes: pzTemaLunesBoxHTML existe');
  t(app.includes('function pzTemaGuardarLunesDesdeHoy(rango, btn) {'), 'lunes: pzTemaGuardarLunesDesdeHoy existe');
  t(app.includes("api.post('/api/weekly-consultas', { rango })"), 'lunes: el guardado usa el endpoint existente /api/weekly-consultas');
  t(css.includes('.pz-monday-box') && css.includes('.pz-monday-grid') && css.includes('.pz-monday-confirm') && css.includes('.pz-daily-msg') && css.includes('.pz-one-a-day'),
    'día/lunes: estilos RS-5 (daily-msg, one-a-day, monday-box, monday-grid, monday-confirm)');
  // VM: la caja de los lunes (4 rangos, pregunta, tag).
  const lunesSrc = sliceBetween(app, 'function pzTemaLunesBoxHTML(lunesTema) {', 'function pzTemaPintar() {');
  t(lunesSrc.length > 500, 'VM lunes: funciones de los lunes extraídas (' + lunesSrc.length + ' caracteres)');
  const escStub = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lunesCtx = vm.createContext({
    console,
    esc: escStub,
    pzTemaT: (es, en) => es,
    chatSay: (m) => { lunesCtx.__said = lunesCtx.__said || []; lunesCtx.__said.push(String(m)); },
    api: { post: async () => ({ ok: true }) },
    PZ_TEMA: { temas: [{ kind: 'hoy' }, { kind: 'lunes', week_key: '2026-11-09' }] },
  });
  vm.runInContext(lunesSrc, lunesCtx);
  vm.runInContext("__box = pzTemaLunesBoxHTML({ kind: 'lunes', week_key: '2026-11-09' });", lunesCtx);
  const boxHTML = lunesCtx.__box;
  t(boxHTML.includes('LOS LUNES · ADENTRO DE ESTE MISMO MENSAJE'), 'VM lunes: tag «LOS LUNES · ADENTRO DE ESTE MISMO MENSAJE»');
  t(boxHTML.includes('¿Cuántas consultas te entraron esta semana?'), 'VM lunes: la pregunta real de los lunes');
  t((boxHTML.match(/data-lunes-rango="/g) || []).length === 4, 'VM lunes: 4 rangos para tocar');
  t(boxHTML.includes('data-lunes-rango="0"') && boxHTML.includes('data-lunes-rango="1-5"') && boxHTML.includes('data-lunes-rango="6-15"') && boxHTML.includes('data-lunes-rango="15+"'),
    'VM lunes: rangos 0 / 1-5 / 6-15 / 15+');
  t(boxHTML.includes('Tocá un rango. Con eso conecto mi trabajo con tu caja'), 'VM lunes: el porqué honesto del rango');
  t(!boxHTML.includes('SOBRE · TEMA'), 'VM lunes: la caja no tiene rótulo de tema');
  // VM: guardar el rango desde el mensaje del día.
  class FakeBtn {
    constructor() { this.disabled = false; this.className = ''; this.classList = { add: (c) => { this.className = (this.className + ' ' + c).trim(); }, remove: (c) => { this.className = this.className.replace(c, '').trim(); } }; }
  }
  const lunesBtns = [new FakeBtn(), new FakeBtn(), new FakeBtn(), new FakeBtn()];
  const lunesConfirm = { textContent: '', style: { display: 'none' } };
  const lunesBox = {
    querySelectorAll: (sel) => (sel === '[data-lunes-rango]' ? lunesBtns : []),
    querySelector: (sel) => (sel === '.pz-monday-confirm' ? lunesConfirm : null),
  };
  lunesBtns.forEach((b) => { b.closest = () => lunesBox; });
  lunesCtx.__btn = lunesBtns[1];
  await vm.runInContext("pzTemaGuardarLunesDesdeHoy('1-5', __btn)", lunesCtx);
  t(lunesConfirm.textContent === '✓ Anotado: 1 a 5 consultas.' && lunesConfirm.style.display === 'block',
    'VM lunes: al tocar 1-5, la confirmación aparece ADENTRO de la caja');
  t(lunesBtns.every((b) => b.disabled === true) && lunesBtns[1].className.includes('on'),
    'VM lunes: al responder, los 4 rangos se deshabilitan y el elegido queda marcado');
  t(lunesCtx.PZ_TEMA.temas.length === 1 && lunesCtx.PZ_TEMA.temas[0].kind === 'hoy',
    'VM lunes: al responder, el tema lunes sale de la lista (no aparece como tarjeta propia)');
  // Fallo del guardado: se re-habilita y avisa, sin borrar el tema.
  const lunesCtx2 = vm.createContext({
    console,
    esc: escStub,
    pzTemaT: (es, en) => es,
    chatSay: (m) => { lunesCtx2.__said = lunesCtx2.__said || []; lunesCtx2.__said.push(String(m)); },
    api: { post: async () => ({ ok: false, error: 'fail' }) },
    PZ_TEMA: { temas: [{ kind: 'hoy' }, { kind: 'lunes', week_key: '2026-11-09' }] },
  });
  vm.runInContext(lunesSrc, lunesCtx2);
  const lunesBtns2 = [new FakeBtn(), new FakeBtn(), new FakeBtn(), new FakeBtn()];
  const lunesConfirm2 = { textContent: '', style: { display: 'none' } };
  const lunesBox2 = {
    querySelectorAll: (sel) => (sel === '[data-lunes-rango]' ? lunesBtns2 : []),
    querySelector: (sel) => (sel === '.pz-monday-confirm' ? lunesConfirm2 : null),
  };
  lunesBtns2.forEach((b) => { b.closest = () => lunesBox2; });
  lunesCtx2.__btn = lunesBtns2[3];
  await vm.runInContext("pzTemaGuardarLunesDesdeHoy('15+', __btn)", lunesCtx2);
  t(lunesBtns2.every((b) => b.disabled === false), 'VM lunes: si el guardado falla, los rangos se re-habilitan');
  t((lunesCtx2.__said || []).some((m) => m.includes('no pude guardarlo')), 'VM lunes: si el guardado falla, avisa sin inventar');
  t(lunesCtx2.PZ_TEMA.temas.length === 2, 'VM lunes: si el guardado falla, el tema lunes NO sale de la lista');

  // ---------- 5. (b) Regla 11: todo con toques ----------
  t(cnt(app, "id: 'ch-idea'") === 2, 'toques: la opción «Otra idea» existe en las dos listas de cambio');
  t(cnt(app, "text: pzTemaT('Otra foto'") === 2 && cnt(app, "text: pzTemaT('Otro texto'") === 2,
    'toques: «Otra foto» y «Otro texto» en las dos listas de cambio');
  t(!app.includes("text: pzTemaT('La foto 📸'") && !app.includes("text: pzTemaT('El texto ✍️'"),
    'toques: las opciones viejas «La foto» / «El texto» ya no se ofrecen');
  t(!app.includes("text: pzTemaT('La hora 🕖'"), 'toques: «La hora» ya no se ofrece como opción de cambio (el selector de hora, pzTemaHoraOpciones, queda para el handler)');
  t(app.includes("if (op === 'ch-idea') {"), 'toques: handler ch-idea existe');
  t(app.includes("chatExchange({ text: 'otra idea para el posteo de hoy', pushed: true })"),
    'toques: «Otra idea» pide otra idea al cerebro sin duplicar la burbuja (pushed:true)');
  t(app.includes("if (/idea|otro angulo/.test(norm)) { limpiar(); pzTemaElegir('ch-idea', null, text); return true; }"),
    'toques: escribir «otra idea» en el cambio también va a ch-idea');
  t(app.includes('otra foto, otro texto u otra idea'), 'toques: la pregunta de cambio lista las 3 opciones nuevas');
  t(app.includes("if (op === 'ch-hora') {"), 'toques: el handler ch-hora queda en código (el cambio de hora vive en el detalle)');

  // ---------- 6. (c) Recomendación Impulsar en el chat ----------
  t(app.includes('function pzBoostRecPintar() {'), 'boost-chat: pzBoostRecPintar existe');
  t(app.includes("api.get('/api/estrategia/mejor-posteo')"), 'boost-chat: usa el endpoint existente /api/estrategia/mejor-posteo');
  t(app.includes('pzBoostRecTexto({ reach: m.reach, likes: m.likes, comments: m.comments, recomendado: true })'),
    'boost-chat: el texto es el mismo de RS-4 (pzBoostRecTexto, sin promedios inventados)');
  t(app.includes('pzBoostOpenById(Number(m.post_id))'), 'boost-chat: el CTA abre la hoja Impulsar con ese posteo');
  t(app.includes("sessionStorage.getItem('pzBoostRecOff')") && app.includes("sessionStorage.setItem('pzBoostRecOff', '1')"),
    'boost-chat: una vez por sesión (dismiss o impulso la apagan)');
  t(app.includes('try { pzBoostRecPintar(); } catch (e) {}'), 'boost-chat: se re-pinta tras cada carga del historial');
  t(app.includes("if (typeof chatScroll === 'function') chatScroll();"),
    'boost-chat: al agregar la tarjeta, el hilo baja para que se vea (chatScroll respeta el pin)');
  t(css.includes('.pz-boost-rec-card') && css.includes('.pz-boost-rec-tag') && css.includes('.pz-boost-rec-x'),
    'boost-chat: estilos RS-5 (rec-card, rec-tag, rec-x)');
  // VM: pzBoostRecPintar con DOM falso.
  const recSrc = sliceBetween(app, 'async function pzBoostRecPintar() {', 'async function chatLoadHistory() {');
  t(recSrc.length > 1000, 'VM boost-chat: pzBoostRecPintar extraída (' + recSrc.length + ' caracteres)');
  const MEJOR = { post_id: 42, image_path: '/media/cafe-mejor.jpg', caption: 'Café de especialidad recién tostado', reach: 500, likes: 40, comments: 5, saved: 2 };
  const makeRecCtx = (mejor, lang) => {
    const store = {};
    const docById = {};
    class FakeEl2 {
      constructor(tag) {
        this.tagName = (tag || 'div').toUpperCase();
        this.id = '';
        this.className = '';
        this.style = {};
        this.innerHTML = '';
        this.textContent = '';
        this.children = [];
        this.__btns = {};
        this.classList = { add: (c) => { this.className = (this.className + ' ' + c).trim(); }, remove: () => {}, contains: (c) => this.className.split(' ').includes(c) };
      }
      appendChild(ch) { this.children.push(ch); if (ch.id) docById[ch.id] = ch; ch.__parent = this; return ch; }
      remove() { if (this.__parent) { this.__parent.children = this.__parent.children.filter((c) => c !== this); } delete docById[this.id]; }
      querySelector(sel) {
        if (!this.__btns[sel]) this.__btns[sel] = { onclick: null, click() { if (this.onclick) this.onclick(); } };
        return this.__btns[sel];
      }
      querySelectorAll() { return []; }
    }
    const chatBox = new FakeEl2('div'); chatBox.id = 'chatBox'; docById['chatBox'] = chatBox;
    const ctx = vm.createContext({
      console,
      document: {
        getElementById: (id) => docById[id] || null,
        createElement: (tag) => new FakeEl2(tag),
      },
      sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
      api: { get: async () => ({ ok: true, mejor }) },
      esc: escStub,
      gzT: (es, en) => (lang === 'en' ? (en || es) : es),
      pzBoostRecTexto: (p) => 'El mejor de tu semana: ' + p.reach + ' de alcance, ' + p.likes + ' me gusta, ' + p.comments + ' comentarios. Por eso Posty te recomienda este y no otro.',
      pzBoostOpenById: (id) => { ctx.__opened = id; },
      window: {},
    });
    ctx.__chatBox = chatBox; ctx.__store = store; ctx.__FakeEl2 = FakeEl2;
    vm.runInContext(recSrc, ctx);
    return ctx;
  };
  const ctxR = makeRecCtx(MEJOR, 'es');
  await vm.runInContext('pzBoostRecPintar()', ctxR);
  t(ctxR.__chatBox.children.length === 1, 'VM boost-chat: con mejor posteo, la tarjeta se agrega al final del hilo');
  const recCard = ctxR.__chatBox.children[0];
  t(recCard.id === 'pzBoostRecCard' && recCard.className === 'pz-boost-rec-card', 'VM boost-chat: la tarjeta tiene id y clase propias');
  t(recCard.innerHTML.includes('POSTY RECOMIENDA · IMPULSAR'), 'VM boost-chat: tag «POSTY RECOMIENDA · IMPULSAR»');
  t(recCard.innerHTML.includes('Café de especialidad recién tostado'), 'VM boost-chat: caption real del mejor posteo');
  t(recCard.innerHTML.includes('/media/cafe-mejor.jpg'), 'VM boost-chat: miniatura real del mejor posteo');
  t(recCard.innerHTML.includes('El mejor de tu semana: 500 de alcance, 40 me gusta, 5 comentarios.'), 'VM boost-chat: texto de RS-4 con los números reales');
  t(recCard.innerHTML.includes('Impulsar este posteo'), 'VM boost-chat: CTA «Impulsar este posteo»');
  await vm.runInContext('pzBoostRecPintar()', ctxR);
  t(ctxR.__chatBox.children.length === 1, 'VM boost-chat: segunda llamada no duplica la tarjeta');
  recCard.querySelector('.pz-boost-rec-cta').click();
  t(ctxR.__opened === 42 && ctxR.__store['pzBoostRecOff'] === '1', 'VM boost-chat: el CTA abre la hoja con el post_id 42 y apaga la tarjeta por la sesión');
  // Dismiss con ×.
  const ctxR2 = makeRecCtx(MEJOR, 'es');
  await vm.runInContext('pzBoostRecPintar()', ctxR2);
  t(ctxR2.__chatBox.children.length === 1, 'VM boost-chat: tarjeta presente antes del dismiss');
  ctxR2.__chatBox.children[0].querySelector('.pz-boost-rec-x').click();
  t(ctxR2.__chatBox.children.length === 0 && ctxR2.__store['pzBoostRecOff'] === '1', 'VM boost-chat: la × quita la tarjeta y la apaga por la sesión');
  await vm.runInContext('pzBoostRecPintar()', ctxR2);
  t(ctxR2.__chatBox.children.length === 0, 'VM boost-chat: tras descartar, no vuelve a aparecer en la sesión');
  // Sin mejor: nada. Sin engagement: nada.
  const ctxR3 = makeRecCtx(null, 'es');
  await vm.runInContext('pzBoostRecPintar()', ctxR3);
  t(ctxR3.__chatBox.children.length === 0, 'VM boost-chat: sin mejor posteo, no hay tarjeta');
  const ctxR4 = makeRecCtx({ post_id: 7, image_path: '/m/7.jpg', caption: 'Sin métricas', reach: 0, likes: 0, comments: 0, saved: 0 }, 'es');
  await vm.runInContext('pzBoostRecPintar()', ctxR4);
  t(ctxR4.__chatBox.children.length === 0, 'VM boost-chat: sin engagement, no hay tarjeta (nunca se recomienda a ciegas)');
  // EN espejado.
  const ctxR5 = makeRecCtx(MEJOR, 'en');
  await vm.runInContext('pzBoostRecPintar()', ctxR5);
  t(ctxR5.__chatBox.children.length === 1 && ctxR5.__chatBox.children[0].innerHTML.includes('POSTY RECOMMENDS · BOOST') && ctxR5.__chatBox.children[0].innerHTML.includes('Boost this post'),
    'VM boost-chat: EN espejado (tag y CTA en inglés, caption y números reales)');

  // ---------- 7. (e) Copy «jardín» fuera ----------
  t(!app.includes('Jardín en flor') && !app.includes('Maestro del jardín') && !app.includes('cómo crece tu jardín') && !app.includes('Ver tu jardín') && !app.includes('Tu jardín, antes'),
    'jardín: las 5 ubicaciones de copy visible ya no dicen «jardín»');
  t(app.includes('Nivel en flor') && app.includes('Maestro del nivel') && app.includes('cómo crece tu nivel') && app.includes('Ver tu nivel en grande') && app.includes('Tu nivel, antes y hoy'),
    'jardín: las 5 ubicaciones ahora dicen «nivel»');
  const jardinLines = app.split('\n').filter((l) => l.includes('jardín'));
  t(jardinLines.length === 18 && jardinLines.every((l) => l.trim().startsWith('//')),
    'jardín: las 18 «jardín» restantes son solo comentarios (×0 en copy visible)');
  const jardinLinesEN = app.split('\n').filter((l) => l.includes('Garden'));
  t(jardinLinesEN.length === 0, 'jardín: «Garden» ×0 en app.js (ni en copy ni en comentarios)');
  t(!app.includes('Garden in bloom') && !app.includes('Garden master') && !app.includes('how your garden grows') && !app.includes('See your garden large') && !app.includes('Your garden, before and today'),
    'jardín: las 5 ubicaciones EN ya no dicen «garden»');
  t(app.includes('Level in bloom') && app.includes('Level master') && app.includes('how your level grows') && app.includes('See your level large') && app.includes('Your level, before and today'),
    'jardín: las 5 ubicaciones EN ahora dicen «level»');
  // server.js: la ruta /api/oficina/jardin y el negocio demo quedan
  // (son código y nombre de florería demo, no el jardín del usuario).
  t(srv.includes("/api/oficina/jardin") && srv.includes('Flores del Jardín'), 'jardín: server.js conserva la ruta API y el demo (no son el jardín)');

  // ---------- 8. Auditoría de funciones (gate M69.1) ----------
  // Cada función que el código nuevo llama tiene que existir definida
  // en el bundle servido.
  const called = new Set([
    'pzTemaLunesBoxHTML', 'pzTemaGuardarLunesDesdeHoy', 'pzBoostRecPintar',
    'pzBoostRecTexto', 'pzBoostOpenById', 'pzOpenBoostPick', 'chatExchange',
    'chatSay', 'chatScroll', 'pzTemaElegir', 'pzTemaSetQuick', 'pzTemaSetSub',
    'pzTemaQuickHTML', 'pzTemaT', 'pzIc', 'gzT', 'esc', 'api',
  ]);
  // onclick del toggle y de la tarjeta de boost (delegación + onclick).
  ['chatPhotoDelegar'].forEach((f) => called.add(f)); // (v846) pzWriteToggleDelegar murió
  const defined = new Set([...app.matchAll(/function (pz[A-Za-z0-9]+|chat[A-Za-z0-9]+|gzT|esc)\s*\(/g)].map((m) => m[1]));
  // Definidas como const/let/var (esc es const arrow; api es const objeto).
  for (const m of app.matchAll(/(?:const|let|var)\s+(esc|api|gzT|pzIc)\s*=/g)) defined.add(m[1]);
  const faltan = [...called].filter((f) => !defined.has(f));
  t(faltan.length === 0, 'auditoría: funciones llamadas por RS-5 existen definidas (' + [...called].sort().join(', ') + ')' + (faltan.length ? ' — FALTAN: ' + faltan.join(', ') : ''));
  console.log(`funciones auditadas: ${called.size - faltan.length}/${called.size}`);
  // Las funciones nuevas se llaman desde el código nuevo (no son muertas).
  t(cnt(app, 'pzTemaLunesBoxHTML(') >= 2, 'auditoría: pzTemaLunesBoxHTML se llama (def + uso en la tarjeta del día)');
  t(cnt(app, 'pzTemaGuardarLunesDesdeHoy(') >= 2, 'auditoría: pzTemaGuardarLunesDesdeHoy se llama (def + binding)');
  t(cnt(app, 'pzBoostRecPintar(') >= 2, 'auditoría: pzBoostRecPintar se llama (def + hook en chatLoadHistory)');
  t(app.includes('(function chatPhotoDelegar() {') && app.includes('window.__chatPhotoDelegado'),
    'auditoría: chatPhotoDelegar es IIFE con guarda de una sola vez (v846: la camarita queda)');

  // ---------- 9. Boot real por HTTP (solo si express resuelve) ----------
  let booted = false;
  try { require.resolve('express', { paths: [__dirname] }); booted = true; } catch (e) { booted = false; }
  if (!booted) {
    console.log('boot: express no resuelve en este árbol, sección omitida (como test-lote-rediseño-rs4.js)');
  } else {
    const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-rs5-'));
    const PORT = 34584;
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
      env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-rs5', OPENAI_API_KEY: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let srvLog = '';
    srvProc.stdout.on('data', (d) => { srvLog += d; });
    srvProc.stderr.on('data', (d) => { srvLog += d; });
    try {
      t(await waitBoot(), 'boot: server levanta');
      const ver = await (await fetch(`${BASE}/api/version`)).json();
      t(ver.build === '20261105-v846', `boot: /api/version 20261105-v846 (vino ${ver.build})`);
      const bundle = await (await fetch(`${BASE}/app.js`)).text();
      t(md5(bundle) === md5(app), 'boot: /app.js servido = árbol RS-5 (md5)');
      t(bundle.includes('pz-mic-big') && bundle.includes('pz-daily-msg') && bundle.includes('pz-boost-rec-card'),
        'boot: el bundle servido trae las marcas RS-5 (mic grande, daily-msg, boost-rec)');
      const index = await (await fetch(`${BASE}/`)).text();
      t(index.includes('?v=578'), 'boot: el index ES en ?v=578 (estampado v846)');
      t(index.includes('styles.css?v=20261225'), 'boot: el index ES en styles?v=20261225 (estampado v846)');
    } catch (e) {
      t(false, 'boot: excepción ' + (e && e.message));
      if (srvLog) console.log('--- server log ---\n' + srvLog.slice(-3000));
    } finally {
      try { srvProc.kill(); } catch (e) {}
      await new Promise((r) => setTimeout(r, 500));
      try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    }
  }

  console.log(`\ntest-lote-rediseño-rs5: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
