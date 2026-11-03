// LOTE CHATBAR-MAS (construcción sin push, base v575).
// Decisión Valentino 3/11: «Saquemos el + de la barra del chat. Ya
// aparece abajo.» + corrección del mismo día: el + del dock es FOTO O
// VIDEO, no nota de voz (las notas van solo por el micrófono de la
// barra del chat, que queda intacto).
// Qué cambia: (1) la fila de escritura del chat ya no renderiza
// #chatPlus ni #chatPlusMenu; (2) la barra fija de Inicio (mz-chatbar)
// ya no renderiza #mzPlus; (3) la hoja del dock pasa de
// «Agregar foto / Nota de voz» a «Agregar foto / Agregar video» y
// pzDockMasVoz deja de existir (pzDockMasVideo dispara el picker
// #chatFile filtrado a video/*, mismo flujo directo de v573).
// Intacto: micrófono (#chatMicSend, #mzMic), campo, enviar, #chatFile
// oculto + su onchange, el + del dock (pzDockMasBtn), el mini-chat
// (input + enviar, nunca tuvo +) y la landing (su guarda sin sesión
// ya quitaba el +; con sesión el chat tampoco lo renderiza).
// Uso: node test-lotechatbarmas.js [dir]
const fs = require('fs');
const dir = process.argv[2] || '.';
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const css = fs.readFileSync(dir + '/public/styles.css', 'utf8');
const idx = fs.readFileSync(dir + '/public/index.html', 'utf8');
const idxEn = fs.readFileSync(dir + '/public/en/index.html', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
let ok = 0, bad = 0;
function t(name, cond) { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } }
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');

// ---------- stubs para ejecutar el bloque dock real ----------
let ME = { lang: 'es' };
function gzT(es, en) { return (ME && ME.lang === 'en') ? en : es; }
function pzIc(name) { return '[' + name + ']'; }
let els = {};
let intervals = [];
let abrirLlamadas = 0;
const windowStub = {};
const documentStub = { getElementById: (id) => els[id] || null };
function setTimeout(fn) { /* el video no depende del timeout del test */ }
function setInterval(fn) { intervals.push(fn); return intervals.length; }
function clearInterval() {}
function pzSftChatAbrirYEnfocar() { abrirLlamadas++; }
function pzSftFotoAlChat() {}
function voiceToggle() {}
const start = app.indexOf('function pzDockMasBtn');
const end = app.indexOf('function appShell(', start);
if (start < 0 || end < 0) { console.log('FALLA: bloque dock-mas no encontrado'); process.exit(1); }
const block = app.slice(start, end);
// El bloque usa document/window/location globales: se evalúa con los stubs por nombre.
const document = documentStub;
const window = windowStub;
const location = { hash: '#/app/analisis' };
eval(block);

// ---------- 1. la fila de escritura del chat ya no tiene + ----------
const cardStart = app.indexOf('function chatCardHTML(');
const cardEnd = app.indexOf('\n}\n', cardStart);
const card = app.slice(cardStart, cardEnd);
t('chatCard: SIN id="chatPlus"', !card.includes('id="chatPlus"'));
t('chatCard: SIN id="chatPlusMenu"', !card.includes('id="chatPlusMenu"'));
t('chatCard: SIN botón Foto/Video del menú viejo', !card.includes('data-k="photo"') && !card.includes('data-k="video"'));
t('chatCard: campo intacto', card.includes('id="chatInput"'));
t('chatCard: micrófono intacto', card.includes('id="chatMicSend"'));
t('chatCard: #chatFile oculto intacto', card.includes('id="chatFile"') && card.includes('accept="image/*,video/*"') && card.includes('hidden'));
t('chatCard: historial y propuesta intactos', card.includes('id="chatBox"') && card.includes('id="chatProposal"'));
t('bindChat: SIN cableado del menú del +', !stripComments(app).includes("$('#chatPlus')"));
t('bindChat: onchange de #chatFile intacto (flujo dock + foto/video)', stripComments(app).includes("file.onchange = () => { chatUploadPhotos(file.files);"));
t('chatUploadPhotos: maneja video (kind video -> /api/assets?kind=video)', app.includes("'/api/assets?kind=video'"));

// ---------- 2. la barra fija de Inicio ya no tiene + ----------
const ivStart = app.indexOf('id="mzChatBar"');
const iv = app.slice(ivStart - 400, ivStart + 600);
t('mz-chatbar: SIN id="mzPlus"', !iv.includes('id="mzPlus"'));
t('mz-chatbar: campo del chat intacto (mzChatOpen)', iv.includes('id="mzChatOpen"'));
t('mz-chatbar: micrófono intacto (mzMic)', iv.includes('id="mzMic"'));
t('mz-chatbar: el binding viejo es no-op guardado (plus null sin render)', app.includes("const plus = $('#mzPlus');") && app.includes('if (plus) plus.onclick = pzSftMzPlus;'));

// ---------- 3. mini-chat: nunca tuvo +, sigue igual ----------
const miniStart = app.indexOf('function hfAskChangeBtnHTML');
const mini = app.slice(miniStart, miniStart + 1500);
t('mini-chat: input + enviar, SIN +', mini.includes('hf-ask-input') && mini.includes('hf-ask-send') && !mini.includes('chatPlus') && !mini.includes('mzPlus'));

// ---------- 4. hoja del dock: Foto + Video, SIN Nota de voz ----------
ME.lang = 'es';
let sheet = pzDockMasHTML();
t('hoja ES: Agregar foto', sheet.includes('Agregar foto'));
t('hoja ES: Agregar video', sheet.includes('Agregar video'));
t('hoja ES: SIN Nota de voz', !sheet.includes('Nota de voz'));
t('hoja ES: filas llaman Foto y Video', sheet.includes('pzDockMasFoto()') && sheet.includes('pzDockMasVideo()'));
t('hoja ES: SIN llamada a Voz', !sheet.includes('pzDockMasVoz()'));
ME.lang = 'en';
sheet = pzDockMasHTML();
t('hoja EN: Add photo', sheet.includes('Add photo'));
t('hoja EN: Add video', sheet.includes('Add video'));
t('hoja EN: SIN Voice note', !sheet.includes('Voice note'));
ME.lang = 'es';

// ---------- 5. video funcional: abre el chat y dispara el picker filtrado ----------
const videoFn = stripComments(block.slice(block.indexOf('function pzDockMasVideo')));
t('video: llama a pzSftChatAbrirYEnfocar', videoFn.includes('pzSftChatAbrirYEnfocar()'));
t('video: filtra el picker a video/*', videoFn.includes("cf.accept = 'video/*'"));
t('video: dispara el click del picker', videoFn.includes('cf.click()'));
t('video: NUNCA #albumFile ni #mzPlus', !videoFn.includes('albumFile') && !videoFn.includes('mzPlus'));
t('video: NUNCA voiceToggle ni flag de voz', !videoFn.includes('voiceToggle') && !videoFn.includes('__pzChatVoice'));
t('pzDockMasVoz YA NO EXISTE', !app.includes('function pzDockMasVoz'));
els = {
  pzDockMasSheet: { hidden: false },
  chatFile: { accept: 'image/*,video/*', clicked: false, click() { this.clicked = true; } },
};
intervals = []; abrirLlamadas = 0;
pzDockMasVideo();
t('video funcional: cierra la hoja', els.pzDockMasSheet.hidden === true);
t('video funcional: abre el chat', abrirLlamadas === 1);
t('video funcional: programa el poll del picker', intervals.length === 1);
intervals.forEach((fn) => fn());
t('video funcional: picker filtrado a video/* y clicado', els.chatFile.accept === 'video/*' && els.chatFile.clicked === true);

// ---------- 6. foto del dock intacta (v573) ----------
const fotoFn = stripComments(block.slice(block.indexOf('function pzDockMasFoto'), block.indexOf('function pzDockMasVideo')));
t('foto: sigue llamando a pzSftFotoAlChat', fotoFn.includes('pzSftFotoAlChat()'));
t('foto: NUNCA #albumFile', !fotoFn.includes('albumFile'));

// ---------- 7. el + del dock y la voz por micrófono quedan intactos ----------
const btnBb = pzDockMasBtn('bb'), btnMz = pzDockMasBtn('mz');
t('dock +: sigue abriendo la hoja', btnBb.includes('pzDockMasToggle()') && btnMz.includes('pzDockMasToggle()'));
t('dock +: muestra +', btnBb.includes('>+<') && btnMz.includes('>+<'));
t('voz por mic: #chatMicSend con voiceToggle', app.includes('id="chatMicSend"') && app.includes('voiceToggle()'));
t('voz por mic: #mzMic navega a #/app/chat con flag', app.includes("mic.onclick = () => { window.__pzChatVoice = true; location.hash = '#/app/chat'; }"));
t('voz por mic: bindChatFull consume el flag a 80 ms', app.includes('if (window.__pzChatVoice)') && app.includes('}, 80)'));

// ---------- 8. M78: funciones del menú del dock existen y se llaman ----------
['pzDockMasBtn', 'pzDockMasHTML', 'pzDockMasToggle', 'pzDockMasClose', 'pzDockMasFoto', 'pzDockMasVideo'].forEach((f) => {
  t('M78: definida ' + f, cnt(app, 'function ' + f) === 1);
});
t('M78: Foto y Video llamados por las filas', sheet.includes('pzDockMasFoto()') && sheet.includes('pzDockMasVideo()'));
t('M78: Voz YA NO es llamada por ningún menú', !pzDockMasHTML().includes('pzDockMasVoz()') && cnt(app, 'pzDockMasVoz()') === 0);

// ---------- 9. versiones + censo (base v575, sin push: pines intactos) ----------
t('BUILD v575', srv.includes("const BUILD_ID = '20261101-v577'"));
t('index: app.js?v=388', idx.includes('app.js?v=388'));
t('index: styles?v=20261102', idx.includes('styles.css?v=20261102'));
t('en/index: styles?v=20261102', idxEn.includes('styles.css?v=20261102'));
t('CHUNK_V intacto v575 (no se toca chunk lazy)', app.includes("const CHUNK_V = '20261101-v575'"));
t('censo server: catsMatch 3', cnt(srv, 'catsMatch') === 3);
t('censo server: week-redo 16', cnt(srv, 'week-redo') === 16);
t('censo server: first_week 3', cnt(srv, 'first_week') === 3);
t('censo server: /aprobar 16', cnt(srv, '/aprobar') === 16);
t('censo app: pzGoBack 6', cnt(app, 'pzGoBack') === 6);
t('censo app: pz-detalle-setup 1', cnt(app, 'pz-detalle-setup') === 1);
t('censo app: /aprobar 1', cnt(app, '/aprobar') === 1);
t('censo app: autofetch 0', cnt(app, 'autofetch') === 0);
t('censo app: pcDayKeyShift 7', cnt(app, 'pcDayKeyShift') === 7);
t('ropa/ 100 PNG intactos', (() => { try { return fs.readdirSync(dir + '/public/ropa').filter((f) => f.endsWith('.png')).length === 100; } catch (e) { return false; } })());

console.log(`LOTECHATBARMAS: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
