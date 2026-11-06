// LOTE SACAR-CHATBAR-INICIO (5/11 ~11:55) — decisión Valentino: «si, entonces
// dejemos el boton abajo de agregar. y listo».
// El chat como caja vacía SALE de Inicio; el dock QUEDA con 5 pestañas
// incluyendo Agregar (el lote DOCK-SIN-AGREGAR queda CANCELADO, no se libera).
// Inicio queda: feed + carta del próximo + encabezado, sin caja de chat.
// El chat se abre solo en dos momentos (doctrina vigente): (1) subir una
// imagen → el chat abre con la foto (puerta 1: Agregar → hoja «Subir foto /
// Subir video» → chat con la foto, v573) · (2) cambiar algo del posteo
// seleccionado → el chat abre con ese posteo (puerta 2: hfOpenChatForPost
// con la hoja mzSheet). Posty escribe primero, el cliente responde con 2
// opciones. El micrófono vive adentro del chat (voz-linda v693).
// Cambios exactos vs v695: app.js −8/+1 (sale el bloque mz-bottomstack de
// inicioView; la hoja mzSheet queda) · styles.css −1/+4 (el despeje inferior
// de #inicioView pasa de 148px a 96px+safe, solo el dock; .sched-wrap no se
// toca). Sin cambios de server.js, sin bumps, sin M36.
// El mismo test sobre v695 PRÍSTINO debe fallar (la chatbar está en Inicio).
// RE-BASE preparador 6/11 sobre v707 (BUILD v708 candidato): el ancla del slice
// es la plantilla real de inicioView — un stub pz-ritual-conjuro (lote ritual,
// v704/v706) trae otro id="inicioView" antes y arrastraba un comentario viejo
// con '.mz-bottomstack' al slice; y la aserción de BUILD pasa a v708.
// Uso: node test-lote-sacarchatbar.js
//   Prístino: SRC_PATH=/home/hatch/workspace/.lote-pushfuncionando-push/public/app.js node test-lote-sacarchatbar.js
const fs = require('fs');
const path = require('path');

const SRC_PATH = process.env.SRC_PATH || path.join(__dirname, 'work', 'public', 'app.js');
const DIR = path.dirname(SRC_PATH);
const app = fs.readFileSync(SRC_PATH, 'utf8');
const css = fs.readFileSync(path.join(DIR, 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'work', 'server.js'), 'utf8');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
const cnt = (s, sub) => (s.split(sub).length - 1);
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');

// Slice de inicioView (del template al cierre de la función).
const ivStart = app.indexOf('id="inicioView" class="hf-wrap${'); // plantilla real (no el stub pz-ritual-conjuro)
const ivEnd = app.indexOf('/* ===== RITUAL DE LA MA', ivStart);
const iv = (ivStart > 0 && ivEnd > ivStart) ? app.slice(ivStart, ivEnd) : '';
t('inicioView existe', ivStart > 0 && ivEnd > ivStart);

// ---------- 1. Inicio SIN caja de chat ----------
t('Inicio: SIN mz-bottomstack', !iv.includes('mz-bottomstack') && !iv.includes('mzBottomStack'));
t('Inicio: SIN #mzChatBar', !iv.includes('id="mzChatBar"'));
t('Inicio: SIN #mzChatPlus (el + de la chatbar)', !iv.includes('id="mzChatPlus"'));
t('Inicio: SIN #mzChatOpen (el campo «escribile a posty…»)', !iv.includes('id="mzChatOpen"'));
t('Inicio: SIN #mzMic (el micrófono de Inicio)', !iv.includes('id="mzMic"'));
t('Inicio: SIN #mzVoiceBar (la barra de voz de Inicio)', !iv.includes('id="mzVoiceBar"'));
t('Inicio: SIN el texto «escribile a posty»', !iv.toLowerCase().includes('escribile a posty'));
t('Inicio: SIN «Pedir con nota de voz»', !iv.includes('Pedir con nota de voz'));
t('app.js: cero #mzChatBar en todo el bundle', cnt(app, 'id="mzChatBar"') === 0);
t('app.js: cero #mzVoiceBar en todo el bundle', cnt(app, 'id="mzVoiceBar"') === 0);
t('app.js: cero #mzChatPlus en todo el bundle', cnt(app, 'id="mzChatPlus"') === 0);
t('app.js: cero #mzMic en todo el bundle', cnt(app, 'id="mzMic"') === 0);
t('app.js: un solo #mzChatOpen (el de la landing, pzLpChatHTML)', cnt(app, 'id="mzChatOpen"') === 1);
t('landing: su chat sigue (pzLpChatHTML con mzChatOpen + mzSheet)', app.includes('function pzLpChatHTML()') && app.includes("'<button type=\"button\" class=\"mz-ph\" id=\"mzChatOpen\""));

// ---------- 2. La hoja del chat queda (superficie de la puerta 2) ----------
t('Inicio: la hoja mzSheet SIGUE', iv.includes('id="mzSheet"'));
t('Inicio: la hoja lleva chatCardHTML', iv.includes('chatCardHTML('));
t('hfOpenChatForPost sigue (mzSheet en Inicio)', app.includes('function hfOpenChatForPost') || app.includes('hfOpenChatForPost(post)'));
t('mzCloseSheet sigue', app.includes('function mzCloseSheet()'));
t('bindInicio: cableado de la chatbar con guarda null (no rompe sin los elementos)', app.includes("const open = $('#mzChatOpen');") && app.includes("const mic = $('#mzMic');"));

// ---------- 3. Dock con 5 incl. Agregar (DOCK-SIN-AGREGAR cancelado) ----------
const bbNav = app.slice(app.indexOf('<nav class="bb-bar">'), app.indexOf('<nav class="bb-bar">') + 900);
t('bb-bar: 5 elementos (4 tabBtn + pzDockMasBtn)', (bbNav.match(/tabBtn\(/g) || []).length === 4 && bbNav.includes("pzDockMasBtn('bb')"));
t('bb-bar: orden Inicio < Estrategia < Agregar < Premios < Ajustes',
  bbNav.indexOf("tabBtn('inicio'") < bbNav.indexOf("tabBtn('analisis'") &&
  bbNav.indexOf("tabBtn('analisis'") < bbNav.indexOf("pzDockMasBtn('bb')") &&
  bbNav.indexOf("pzDockMasBtn('bb')") < bbNav.indexOf("tabBtn('jardin'") &&
  bbNav.indexOf("tabBtn('jardin'") < bbNav.indexOf("tabBtn('ajustes'"));
t('bb-bar: la hoja sigue concatenada (pzDockMasHTML)', bbNav.includes('pzDockMasHTML()'));
const mzStart = app.indexOf('function mzTabsHTML');
const mzNav = app.slice(mzStart, app.indexOf('function appShell(', mzStart));
t('mz-tabs: CON pzDockMasBtn (Agregar)', mzNav.includes("pzDockMasBtn('mz')"));
t('mz-tabs: la hoja sigue interpolada (pzDockMasHTML)', mzNav.includes('${pzDockMasHTML()}'));
t('pzDockMasBtn: definida 1 vez', cnt(app, 'function pzDockMasBtn') === 1);
t('hoja: título «¿Qué querés subir?»', app.includes('¿Qué querés subir?'));
t('hoja: «Subir foto» y «Subir video»', app.includes('Subir foto') && app.includes('Subir video'));
t('hoja: pzDockMasFoto → pzSftFotoAlChat', app.includes('function pzDockMasFoto()') && app.slice(app.indexOf('function pzDockMasFoto()'), app.indexOf('function pzDockMasFoto()') + 400).includes('pzSftFotoAlChat()'));
t('hoja: pzDockMasVideo → picker de video del chat', app.includes('function pzDockMasVideo()') && app.slice(app.indexOf('function pzDockMasVideo()'), app.indexOf('function pzDockMasVideo()') + 900).includes("cf.accept = 'video/*'"));

// ---------- 4. Puerta 1 end-to-end (código): Agregar → chat con la foto ----------
t('pzSftFotoAlChat: abre el chat y dispara el picker #chatFile', app.includes('function pzSftFotoAlChat()') && app.slice(app.indexOf('function pzSftFotoAlChat()'), app.indexOf('function pzSftFotoAlChat()') + 600).includes('document.getElementById("chatFile")'));
t('chat: el input #chatFile existe (picker del chat)', app.includes('id="chatFile"') || app.includes("id='chatFile'"));
t('chat: chatUploadPhotos maneja la foto subida', app.includes('function chatUploadPhotos') || app.includes('chatUploadPhotos('));

// ---------- 5. Chat propio intacto (pantalla de chat + voz adentro) ----------
t('chatFullView existe (#/app/chat, pantalla completa)', app.includes('#/app/chat') && app.includes('pzChatFull'));
t('chat: campo propio #chatInput', app.includes('id="chatInput"') || app.includes("getElementById('chatInput')"));
t('chat: mic propio #chatMicSend (voz-linda v693)', app.includes('chatMicSend'));
t('voz: vozHostEl cae a #chatMsg sin mzVoiceBar (fail-closed)', app.includes("return document.getElementById('chatMsg');"));
t('voz: vozEnInicio exige mzVoiceBar (false sin ella)', app.includes("function vozEnInicio()") && app.slice(app.indexOf('function vozEnInicio()'), app.indexOf('function vozEnInicio()') + 200).includes("getElementById('mzVoiceBar')"));
t('voz: vozFalloInicio con guarda (!vb → return)', app.includes('function vozFalloInicio') && app.slice(app.indexOf('function vozFalloInicio'), app.indexOf('function vozFalloInicio') + 300).includes('if (!vb) return;'));

// ---------- 6. CSS: despeje inferior de Inicio = solo el dock ----------
t('CSS: #inicioView padding-bottom 96px+safe (sin chatbar)', /#inicioView\.hf-wrap\{padding-bottom:calc\(96px \+ env\(safe-area-inset-bottom\)\)\}/.test(css));
t('CSS: SIN regla 148px para #inicioView', !/#inicioView\.hf-wrap\{padding-bottom:calc\(148px/.test(css));
t('CSS: .sched-wrap SIGUE en 148px (Agenda no se toca)', /\.sched-wrap\{padding-bottom:calc\(148px \+ env\(safe-area-inset-bottom\)\)\}/.test(css));
t('CSS: reglas .mz-chatbar/.mz-bottomstack quedan como CSS muerto (no se borran)', css.includes('.mz-chatbar') && css.includes('.mz-bottomstack'));

// ---------- 7. Censo idéntico a v695 ----------
const cntRe = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
t('censo server: catsMatch 3', cntRe(srv, 'catsMatch') === 3);
t('censo server: week-redo 16', cntRe(srv, 'week-redo') === 16);
t('censo server: first_week 3', cntRe(srv, 'first_week') === 3);
t('censo server: /aprobar 17', cntRe(srv, '/aprobar') === 17);
t('censo app: pzGoBack 6', cntRe(app, 'pzGoBack') === 6);
t('censo app: pz-detalle-setup 1', cntRe(app, 'pz-detalle-setup') === 1);
t('censo app: autofetch 0', cntRe(app, 'autofetch') === 0);
t('censo app: pcDayKeyShift 6', cntRe(app, 'pcDayKeyShift') === 6);
t('censo app: /aprobar 1', cntRe(app, '/aprobar') === 1);

// ---------- 8. M78: funciones auditadas (cero nuevas, cero borradas en el lote) ----------
['pzDockMasBtn', 'pzDockMasHTML', 'pzDockMasToggle', 'pzDockMasClose', 'pzDockMasFoto', 'pzDockMasVideo', 'pzSftFotoAlChat', 'hfOpenChatForPost', 'mzCloseSheet', 'pzSftMzPlus'].forEach((f) => {
  t('M78: definida 1 vez ' + f, cnt(app, 'function ' + f) === 1);
});
t('M78: server.js SIN cambios del lote (solo BUILD v708)', srv.includes("const BUILD_ID = '20261105-v708';"));

console.log(`\ntest-lote-sacarchatbar: ${pass} ok, ${fail} mal`);
process.exit(fail ? 1 : 0);
