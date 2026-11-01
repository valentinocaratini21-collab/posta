// test-lotechat.js — LOTE HOJA DE CHAT SIMPLE (2026-11-01).
// Valentino 1/11 ~05:55, con captura: al tocar para escribirle a Posty
// la hoja queda casi toda vacía y una barra flotante tapa el campo.
// 5 ítems: sin hueco vacío · sin barra tapando el campo · campo activo
// y nada tapado por el teclado · Subir/Ideas como chips chicos · solo
// lo necesario al abrir. Node puro, lee el árbol. Uso: node test-lotechat.js
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

// ---------- Versiones + censo (referencia v520) ----------
t(srv.includes("const BUILD_ID = '20261101-v529'"), 'BUILD v522 en server.js');
t(idx.includes('app.js?v=350') && idx.includes('styles.css?v=20261069'), 'index: app 343 + styles 20261064');
t(idxEn.includes('styles.css?v=20261069') && !idxEn.includes('app.js?v='), 'en/index: styles 20261064, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v516 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
t(cnt(app, 'function chatCardHTML') === 1, 'sin duplicados: chatCardHTML 1');
t(cnt(app, 'function mzOpenSheet') === 1, 'sin duplicados: mzOpenSheet 1');
t(cnt(app, 'function mzCloseSheet') === 1, 'sin duplicados: mzCloseSheet 1');

// ---------- 1) La hoja abraza su contenido (sin vacío) ----------
t(css.includes('.mz-sheet{bottom:calc(12px + env(safe-area-inset-bottom));}'), 'hoja: anclada abajo con margen chico (no 136px)');
t(css.includes('.mz-sheet-card{height:auto;max-height:calc(100dvh - 24px - env(safe-area-inset-bottom));}'), 'hoja: tarjeta a medida, tope dvh');
t(css.includes('.mz-sheet-body{display:flex;flex-direction:column;overflow:hidden;}'), 'hoja: body columna sin scroll propio');
t(css.includes('.mz-sheet #chatCard{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;}'), 'hoja: chatCard columna flexible');
t(css.includes('.mz-sheet .chat-box{flex:1 1 auto;max-height:none;min-height:0;overflow-y:auto;}'), 'hoja: mensajes con scroll interno, sin tope 46dvh');
t(css.includes('.mz-sheet .chat-input-row{flex:none;}'), 'hoja: campo abajo fijo, no se comprime');

// ---------- 2) Campo visible con el teclado (sin barra tapando) ----------
t(idx.includes('interactive-widget=resizes-content'), 'viewport: resizes-content (el teclado achica el layout, nada queda tapado)');
t(!/\.mz-sheet[^{]*\{[^}]*position:\s*fixed[^}]*bottom:\s*calc\(136px/.test(css), 'hoja: ya no flota a 136px (no queda a mitad de aire con el teclado)');
{
  const open = sliceFn(app, 'function mzOpenSheet', 'function mzCloseSheet');
  t(open.includes('ci.focus'), 'campo activo al abrir: mzOpenSheet enfoca #chatInput');
  t(open.includes('chatScroll()'), 'al abrir, el chat baja al último mensaje');
}

// ---------- 3) Chips chicos SOLO en la hoja ----------
t(app.includes('function chatCardHTML(compact, noEditChip, bareWrap, schedMode, mainScr, sheetChips)'), 'chatCardHTML: 6to param sheetChips');
t(app.includes("class=\"${sheetChips ? 'sched-chips-row' : 'sched-up-row'}\""), 'upRow: wrapper cambia solo con sheetChips');
t(app.includes('<div class="mz-sheet-body">${chatCardHTML(true, true, true, true, true, true)}</div>'), 'hoja (inicioView): pasa sheetChips=true');
t(app.includes('<div style="margin-top:18px">${chatCardHTML(true, true, true, true, true)}</div>'), 'Schedule: sigue con 5 args (botones grandes intactos)');
t(css.includes('.mz-sheet .sched-chips-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0 2px;}'), 'chips: fila chica en la hoja');
t(css.includes('.mz-sheet .sched-chips-row .ag-upload-btn{padding:8px 14px;font-size:13px;'), 'chips: Subir chico en la hoja');
t(css.includes('.mz-sheet .sched-chips-row .ideas-chip{padding:8px 14px;font-size:13px;'), 'chips: Ideas chico en la hoja');
t(css.includes('.ag-upload-btn{pointer-events:auto;'), 'Schedule: botón grande base intacto');

// ---------- 4) Sin animaciones nuevas (reduced-motion trivial) ----------
{
  const blk = css.slice(css.indexOf('LOTE CHAT SIMPLE'));
  t(!/animation|transition/.test(blk), 'hoja: el bloque nuevo no agrega animaciones ni transiciones');
}

// ---------- 5) Render funcional (vm) ----------
function sandboxChat(chat) {
  const sb = {
    console, Intl, Date, Map, Set,
    CHAT: chat,
    ME: { lang: 'es' },
    IDEAS_PENDING_COUNT: 0, IDEAS_PANEL_OPEN: false,
    pzIc: (n) => '<span class="pz-ic">' + n + '</span>',
    chatMsgHtml: (r, tx) => '<div class="chat-msg ' + r + '">' + tx + '</div>',
    chatNextWeekHTML: () => '',
    proposalHTML: () => '',
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], activeElement: null, createElement: () => ({}) },
  };
  vm.createContext(sb);
  const code = sliceFn(app, 'function chatCardHTML', '// Agrega un mensaje del asistente');
  t(code.length > 0, 'existe chatCardHTML para el sandbox');
  if (code) vm.runInContext(code.replace('function chatCardHTML', 'globalThis.chatCardHTML = function'), sb);
  return sb;
}
{
  const sb = sandboxChat([{ role: 'ai', text: 'tenés 17 posteos esperando tu revisión.' }]);
  if (sb.chatCardHTML) {
    const sheet = sb.chatCardHTML(true, true, true, true, true, true);
    t(sheet.includes('sched-chips-row'), 'render hoja: fila de chips');
    t(!sheet.includes('sched-up-row'), 'render hoja: sin fila de botones grandes');
    t(sheet.includes('id="agUploadBtn"') && sheet.includes('id="ideasChip"'), 'render hoja: mismos ids (handlers por id intactos)');
    t(sheet.includes('id="albumFile"'), 'render hoja: input de álbum presente');
    t(sheet.includes('id="chatInput"') && sheet.includes('id="chatBox"'), 'render hoja: campo + caja de mensajes');
    t(sheet.includes('tenés 17 posteos'), 'render hoja: solo lo necesario, el mensaje de Posty');
    t(!sheet.includes('qué hacemos hoy'), 'render hoja: sin saludo extra (mainScr)');
    const sched = sb.chatCardHTML(true, true, true, true, true);
    t(sched.includes('sched-up-row') && !sched.includes('sched-chips-row'), 'render Schedule: botones grandes, sin chips');
  }
}

// ---------- 6) No se rompe lo del chat (Lote 10) ni el resto ----------
{
  const sc = sliceFn(app, 'function chatScroll', 'function chatRenderProposal');
  t(sc.includes('scrollTop = b.scrollHeight'), 'chatScroll intacto (el chat baja al enviar)');
  const ub = sliceFn(app, 'function chatUpdateSendBtn', 'function chatSend');
  t(ub.includes("pzIc('send'"), 'chatUpdateSendBtn intacto (mic <-> enviar)');
  const cs = sliceFn(app, 'function chatSend(', 'function chatUpdateSendBtn');
  t(cs.includes('CHAT.push'), 'chatSend intacto');
}

console.log(`\nLOTECHAT: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
