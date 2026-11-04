// LOTE CHAT-PERFECTO — test del lote (node, sin dependencias).
// WORK = árbol parchado, BASE = v608 servida verificada.
// Uso: node test-lotechatperfecto.js
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const WORK = path.join(DIR, 'work');
const BASE = '/home/hatch/workspace/.lotefotomejoraprueba-release-work';
let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function read(p) { return fs.readFileSync(p, 'utf8'); }
function region(src, marker, len) {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  return src.slice(i, i + (len || 4000));
}
const wApp = read(path.join(WORK, 'public', 'app.js'));
const bApp = read(path.join(BASE, 'public', 'app.js'));
const wSrv = read(path.join(WORK, 'server.js'));
const bSrv = read(path.join(BASE, 'server.js'));
const wCss = read(path.join(WORK, 'public', 'styles.css'));

// (A) Whisper: nombre real según formato iOS.
const fnSrc = (() => {
  const i = wSrv.indexOf('function whisperAudioFilename');
  const j = wSrv.indexOf('\nasync function transcribeAudio', i);
  return wSrv.slice(i, j);
})();
const whisperAudioFilename = new Function(fnSrc + '\nreturn whisperAudioFilename;')();
const ftyp = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
const ebml = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00]);
const riff = Buffer.from('RIFFxxxxWAVEfmt ');
const id3 = Buffer.from('ID3\x04\x00\x00\x00');
const flac = Buffer.from('fLaC\x00\x00\x00\x22');
const oggs = Buffer.from('OggS\x00\x02\x00\x00');
ok('A1 mp4 iOS + ftyp -> audio.mp4', whisperAudioFilename('audio/mp4', ftyp) === 'audio.mp4');
ok('A2 webm + EBML -> audio.webm', whisperAudioFilename('audio/webm', ebml) === 'audio.webm');
ok('A3 x-m4a -> audio.m4a', whisperAudioFilename('audio/x-m4a', Buffer.alloc(0)) === 'audio.m4a');
ok('A4 ogg -> audio.ogg', whisperAudioFilename('audio/ogg', Buffer.alloc(0)) === 'audio.ogg');
ok('A5 wav -> audio.wav', whisperAudioFilename('audio/wav', Buffer.alloc(0)) === 'audio.wav');
ok('A6 mpeg -> audio.mp3', whisperAudioFilename('audio/mpeg', Buffer.alloc(0)) === 'audio.mp3');
ok('A7 MIME desconocido + ftyp -> audio.mp4 (olfato)', whisperAudioFilename('application/octet-stream', ftyp) === 'audio.mp4');
ok('A8 MIME vacío + EBML -> audio.webm (olfato)', whisperAudioFilename('', ebml) === 'audio.webm');
ok('A9 RIFF/WAVE -> audio.wav (olfato)', whisperAudioFilename('', riff) === 'audio.wav');
ok('A10 ID3 -> audio.mp3 (olfato)', whisperAudioFilename('', id3) === 'audio.mp3');
ok('A11 fLaC -> audio.flac (olfato)', whisperAudioFilename('', flac) === 'audio.flac');
ok('A12 OggS -> audio.ogg (olfato)', whisperAudioFilename('', oggs) === 'audio.ogg');
ok('B1 transcribe usa el nombre real', wSrv.includes('whisperAudioFilename(m[1], buf)'));
ok('B2 base tenía el .webm fijo (delta real)', bSrv.includes("}), 'audio.webm')"));
ok('B3 parcheado ya no tiene el .webm fijo en transcribe', !wSrv.includes("new Blob([buf], { type: m[1] }), 'audio.webm'"));

// (C) Foto por chat: botón en la barra + delegado + error visible en dock.
ok('C1 botón foto en chatCardHTML', wApp.includes("id=\"chatPhotoBtn\""));
ok('C2 delegado abre el #chatFile de SU tarjeta', wApp.includes('chatPhotoDelegar') && wApp.includes("closest('#chatCard')"));
ok('C3 landing sin sesión quita el botón foto', wApp.includes("getElementById('chatPhotoBtn'); if (phb) phb.remove();"));
ok('C4 dock-picker sin chat ya no falla en silencio', wApp.includes('No pude abrir el selector de fotos') && wApp.includes('botón de la cámara'));
ok('C5 propuesta del chat muestra la visión real', wApp.includes('r.visionNote') && wApp.includes("it.vision ? esc(it.vision) : (visionNote"));
ok('C6 propuesta del chat maneja el gate honesto', wApp.includes('r.gated') && wApp.includes('pend.propuesta = null'));
ok('C7 albumPropuesta devuelve visionNote', wSrv.includes("visionNote: fotoVis.note || ''"));

// (D) Auto-envío al soltar.
const micBranch = region(wApp, "b.title = 'Mantener para hablar'", 1200);
ok('D1 mic en reposo usa pointerdown/up (no click)', micBranch.includes('onpointerdown') && micBranch.includes('onpointerup') && micBranch.includes('onpointermove'));
ok('D2 deslizar >60px a la izquierda arma cancelar', micBranch.includes('(VOICE_START_X - e.clientX) > 60') && micBranch.includes('VOICE_CANCEL = true'));
ok('D3 soltar sin cancelar llama a voiceStop', micBranch.includes('voiceStop()'));
ok('D4 soltar con cancelar descarta', micBranch.includes('voiceDiscard()'));
const pv = region(wApp, 'function voicePreview() {', 1600);
ok('D5 voicePreview manda solo (sin botón Enviar en el medio)', pv.includes('voiceSend();') && !pv.includes("id=\"vozSend\""));
ok('D6 barra de grabación tiene Cancelar', wApp.includes("id=\"vozCancel\"") && wApp.includes('voiceDiscard'));
ok('D7 mime mp4 explícito cuando webm no está', wApp.includes("MediaRecorder.isTypeSupported('audio/mp4')"));
ok('D8 soltar antes de empezar no graba en falso', wApp.includes('VOICE_EARLY_UP') && wApp.includes('if (VOICE_EARLY_UP)'));
ok('D9 cancelar antes de getUserMedia aborta limpio', wApp.includes('VOICE_ABORTED'));

// (E) Preservado piezas 1-3 / lotes vecinos.
ok('E1 preguntas rotativas v572 intactas', wApp.includes('PZ_CHAT_PH'));
ok('E2 placeholder edición posteo v569 intacto', wApp.includes('PZ_PC_EDIT_PH'));
ok('E3 mcVoiceUI (voz sobre reel) intacto', wApp.includes('Mezclar mi voz') || wApp.includes('mcVoiceUI'));
ok('E4 hfAnchorChip del chat principal intacto', wApp.includes('function hfAnchorChip(kind)') && wApp.includes("data-hf-chipq"));
ok('E5 KbSync post-chat sigue usando visualViewport', wApp.includes('visualViewport') && wApp.includes('pzPostChatKbSync'));
ok('E6 swipe-cierre post-chat intacto', wApp.includes('pzSwipeDy'));

// (G) Pieza 4: los 4 atajos disparan su acción real.
const pcCards = region(wApp, 'pzPcRenderHero', 1500);
ok('G1 tarjetas del posteo llaman a pzPcChipAction (no a hfAnchorChip)', pcCards.includes('pzPcChipAction(b.dataset.pzPcChip)') && !pcCards.includes('hfAnchorChip(b.dataset.pzPcChip)'));
const act = region(wApp, 'function pzPcChipAction(kind) {', 1800);
ok('G2 foto abre el picker de foto del propio chat', act.includes("querySelector('#chatPhotoBtn')") && act.includes("querySelector('#chatFile')"));
ok('G3 texto manda el pedido anclado', act.includes('pzPcSendAnchored') && wApp.includes("function pzPcSendAnchored(text)") && region(wApp, 'function pzPcSendAnchored(text) {', 400).includes('chatSend()'));
ok('G4 día/hora abre el picker de reprogramación', act.includes('pzPcReschedSheet()') && wApp.includes('pz-pc-resched-inp') && wApp.includes("type=\"datetime-local\""));
const rs = region(wApp, 'async function pzPcReschedSave(post, bd) {', 1800);
ok('G5 guardar fecha usa el PATCH vigente + cupo', rs.includes('hfReschedQuotaOk') && rs.includes("scheduled_at: iso") && rs.includes("api.patch('/api/posts/'"));
const rd = region(wApp, 'async function pzPcRedo() {', 3200);
ok('G6 rehacer usa photo-restyle sin render() duplicador', rd.includes("photo-restyle") && !/[^a-zA-Z]render\(\)/.test(rd));
ok('G7 rehacer actualiza el hero y marca sucio (feed al cerrar)', rd.includes('pzPcRenderHero') && rd.includes('PZ_PC_DIRTY = true'));
ok('G8 publicado/video no llama a restyle (mensaje honesto)', rd.includes("=== 'published'") && rd.includes("=== 'video'"));
const close = region(wApp, 'function pzPostChatClose() {', 1600);
ok('G9 al cerrar, si algo cambió, un solo render() refresca el feed', close.includes('PZ_PC_DIRTY') && close.includes('render()'));
ok('G10 open guarda el post completo para hero y picker', wApp.includes('PZ_PC_POST = post;'));

// (H) Pieza 4: pantalla completa con foto fija + campo arriba del teclado.
const layerFn = region(wApp, 'function pzPostChatLayerHTML() {', 800);
ok('H1 capa sin grip de hoja', !layerFn.includes('pz-postchat-grip'));
ok('H2 head con safe-area (el grip la aportaba)', wCss.includes('.pz-postchat-head{display:flex;align-items:center;gap:10px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;flex:none}'));
ok('H3 KbSync marca teclado abierto', wApp.includes("layer.classList.add('pz-pc-kb')") && wApp.includes("(window.innerHeight - vv.height) > 120"));
ok('H4 con teclado: foto fija compacta 64px (no se va)', wCss.includes('.pz-postchat.pz-pc-kb .pz-pc-hero-imgwrap{max-height:64px}') && wCss.includes('.pz-postchat.pz-pc-kb .pz-pc-hero-img{max-height:64px}'));
ok('H5 con teclado: tarjetas ocultas para dar lugar al campo', wCss.includes('.pz-postchat.pz-pc-kb .pz-pc-grid{display:none}'));
ok('H6 hero flex:none (no scrollea) + capa fixed fullscreen', wCss.includes('.pz-pc-hero{flex:none') && wCss.includes('.pz-postchat{position:fixed;inset:0'));
ok('H7 campo fijo abajo en post-chat (input-row flex:none)', wCss.includes('.pz-postchat-body .chat-input-row{flex:none}'));
const openFn = region(wApp, 'function pzPostChatOpen(post) {', 1400);
ok('H8 sin foco automático al abrir (teclado no tapa foto y atajos)', !openFn.includes('setTimeout(function () { try { inp.focus'));
ok('H9 placeholder de edición sigue puesto al abrir', openFn.includes('PZ_PC_EDIT_PH'));

console.log('\n' + pass + ' ok / ' + fail + ' fail');
if (fail) { console.log('FALLOS: ' + fails.join(', ')); process.exit(1); }
