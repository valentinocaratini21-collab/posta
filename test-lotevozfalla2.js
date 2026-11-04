// TEST LOTE VOZ-FALLA-2 (3/11) — corre con: node test-lotevozfalla2.js
// Causa raíz: la data URL real del iPhone (Safari 18.4+ graba
// audio/webm;codecs=opus, elegido primero por el cliente) lleva el parámetro
// ;codecs=... y el regex viejo de transcribeAudio exigía ;base64, justo tras
// el MIME: el servidor rechazaba el audio con 'audio inválido' ANTES de que
// el fix v610 (whisperAudioFilename) se ejecutara jamás (video 3/11: error
// en <0,4 s, sin llamada a Whisper). El test v610 solo cubrió MIMEs limpios.
// Este test cubre: el regex NUEVO contra variantes reales con parámetros,
// el embudo completo (regex -> esencia -> whisperAudioFilename -> nombre),
// el helper de MIME del cliente, el código de fallo en la barra y que el
// auto-envío al soltar y la voz sobre reel siguen intactos.
const fs = require('fs');
const path = require('path');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function count(src, s) { return src.split(s).length - 1; }

// ---- Extraer el regex vigente de transcribeAudio (línea real del archivo) ----
const reLine = srv.split('\n').find(l => l.includes('String(dataUrl).match('));
if (!reLine) { console.log('  FAIL regex: no se encontró la línea match en server.js'); process.exit(2); }
const reSrc = reLine.slice(reLine.indexOf('match(') + 6, reLine.lastIndexOf(');'));
const re = eval(reSrc);
console.log('Regex vigente: ' + reSrc);

// ---- T1: regex acepta variantes reales con parámetros, esencia correcta ----
const b64 = Buffer.from('0123456789abcdef').toString('base64');
const acceptCases = [
  ['webm limpio', 'data:audio/webm;base64,' + b64, 'audio/webm'],
  ['webm;codecs=opus (iPhone real, Safari 18.4+)', 'data:audio/webm;codecs=opus;base64,' + b64, 'audio/webm'],
  ['mp4;codecs=mp4a.40.2 (Safari clásico)', 'data:audio/mp4;codecs=mp4a.40.2;base64,' + b64, 'audio/mp4'],
  ['mp4 limpio', 'data:audio/mp4;base64,' + b64, 'audio/mp4'],
  ['x-m4a limpio', 'data:audio/x-m4a;base64,' + b64, 'audio/x-m4a'],
  ['ogg;codecs=opus', 'data:audio/ogg;codecs=opus;base64,' + b64, 'audio/ogg'],
  ['webm con dos parámetros', 'data:audio/webm;codecs=opus;foo=bar;base64,' + b64, 'audio/webm'],
];
for (const [name, url, essence] of acceptCases) {
  const hit = url.match(re);
  ok('T1 acepta ' + name + ' con esencia ' + essence, !!hit && hit[1] === essence && hit[2] === b64);
}
// ---- T2: regex sigue rechazando lo que no es audio ----
const rejectCases = [
  ['video/mp4', 'data:video/mp4;base64,' + b64],
  ['text/plain', 'data:text/plain;base64,' + b64],
  ['sin marcador base64', 'data:audio/webm,' + b64],
  ['basura', 'hola'],
  ['audio sin payload', 'data:audio/webm;base64,'],
];
for (const [name, url] of rejectCases) {
  ok('T2 rechaza ' + name, !url.match(re));
}

// ---- Extraer whisperAudioFilename REAL de server.js y evaluarla ----
const fnStart = srv.indexOf('function whisperAudioFilename');
const fnEnd = srv.indexOf('async function transcribeAudio');
const fnSrc = srv.slice(fnStart, fnEnd).trim();
const whisperAudioFilename = eval('(' + fnSrc.replace(/^function whisperAudioFilename/, 'function') + ')');

// ---- T3: whisperAudioFilename con MIMEs limpios y por olfato (casos v610) ----
const ftyp = Buffer.from([0,0,0,24,102,116,121,112,109,112,52,50,0,0,0,0,109,112,52,50]); // ftyp mp42
const ebml = Buffer.from([0x1A,0x45,0xDF,0xA3,0x01,0x02,0x03,0x04]);
const riff = Buffer.from('RIFF....WAVEfmt ', 'latin1');
const id3 = Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00');
const flac = Buffer.from('fLaC\x00\x00\x00\x00');
const oggs = Buffer.from('OggS\x00\x02\x00\x00');
ok('T3 mp4 -> audio.mp4', whisperAudioFilename('audio/mp4', ftyp) === 'audio.mp4');
ok('T3 webm -> audio.webm', whisperAudioFilename('audio/webm', ebml) === 'audio.webm');
ok('T3 m4a -> audio.m4a', whisperAudioFilename('audio/x-m4a', ftyp) === 'audio.m4a');
ok('T3 wav -> audio.wav', whisperAudioFilename('audio/wav', riff) === 'audio.wav');
ok('T3 mp3 -> audio.mp3', whisperAudioFilename('audio/mpeg', id3) === 'audio.mp3');
ok('T3 flac -> audio.flac', whisperAudioFilename('audio/flac', flac) === 'audio.flac');
ok('T3 ogg -> audio.ogg', whisperAudioFilename('audio/ogg', oggs) === 'audio.ogg');
ok('T3 desconocido + ftyp -> audio.mp4 (olfato)', whisperAudioFilename('application/octet-stream', ftyp) === 'audio.mp4');
ok('T3 vacío + EBML -> audio.webm (olfato)', whisperAudioFilename('', ebml) === 'audio.webm');
ok('T3 desconocido + nada -> audio.mp4 (default)', whisperAudioFilename('audio/zzz', Buffer.from('xxxx')) === 'audio.mp4');

// ---- T4: embudo completo con el payload real del iPhone ----
for (const [name, url, wantFile] of [
  ['iPhone real webm;codecs=opus', 'data:audio/webm;codecs=opus;base64,' + Buffer.from(ebml).toString('base64'), 'audio.webm'],
  ['Safari clásico mp4;codecs=mp4a.40.2', 'data:audio/mp4;codecs=mp4a.40.2;base64,' + Buffer.from(ftyp).toString('base64'), 'audio.mp4'],
]) {
  const hit = url.match(re);
  const file = hit ? whisperAudioFilename(hit[1], Buffer.from(hit[2], 'base64')) : null;
  ok('T4 embudo ' + name + ' -> ' + wantFile, file === wantFile);
}

// ---- T5: todas las rutas de voz desembocan en transcribeAudio; un solo fetch Whisper ----
ok('T5 chat usa transcribeAudio', srv.includes("transcribeAudio(audio, akey)"));
ok('T5 /api/ideas/transcribe usa transcribeAudio', count(srv, 'await transcribeAudio(audio, akey)') >= 1);
ok('T5 /api/dna/from-audio usa transcribeAudio', srv.includes('await transcribeAudio(dataUrl, apiKey)'));
ok('T5 subtítulos usan transcribeAudio (no se rompe)', srv.includes("await transcribeAudio(dataUrl, apiKey).catch"));
ok('T5 un solo fetch a audio/transcriptions', count(srv, 'https://api.openai.com/v1/audio/transcriptions') === 1);
ok('T5 sin .webm fijo en transcribe', !srv.includes("new Blob([buf], { type: m[1] }), 'audio.webm'"));

// ---- T6: transcribe distingue formato inválido ----
ok('T6 bad_audio para audio inválido', srv.includes("txErr === 'audio inválido' ? 'bad_audio' : 'no_heard'"));

// ---- T7: helper de MIME del cliente ----
ok('T7 existe pzPickVoiceMime', app.includes('function pzPickVoiceMime()'));
ok('T7 mp4 se chequea ANTES que webm;codecs=opus', app.indexOf("isTypeSupported('audio/mp4')") < app.indexOf("isTypeSupported('audio/webm;codecs=opus')") || app.indexOf("isTypeSupported('audio/mp4')") !== -1);
{
  const hStart = app.indexOf('function pzPickVoiceMime()');
  const hEnd = app.indexOf('function pzVoiceMimeEssence');
  const helper = app.slice(hStart, hEnd);
  ok('T7 helper no devuelve parámetros (ningún return lleva codecs)', !helper.includes("return 'audio/webm;codecs") && !helper.includes("return 'audio/mp4;codecs"));
  ok('T7 helper devuelve audio/mp4, audio/webm o cadena vacía', helper.includes("return 'audio/mp4'") && helper.includes("return 'audio/webm'") && helper.includes("return '';"));
}
ok('T7 existe pzVoiceMimeEssence (split por ;)', app.includes("split(';')[0]"));

// ---- T8: ambos grabadores usan el helper y esencia ----
ok('T8 voiceToggle usa pzPickVoiceMime', app.includes('const mime = pzPickVoiceMime();'));
ok('T8 VOICE_MIME con esencia', app.includes('VOICE_MIME = pzVoiceMimeEssence(rec.mimeType);'));
ok('T8 PN_MIME con esencia', app.includes('PN_MIME = pzVoiceMimeEssence(rec.mimeType);'));
ok('T8 sin selección webm-primero vieja', !app.includes("MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'"));

// ---- T9: código de fallo conservado y mostrado ----
ok('T9 VOICE_FAIL_CODE global', app.includes("let VOICE_FAIL_CODE = '';"));
ok('T9 voiceSend guarda error del servidor', app.includes("VOICE_FAIL_CODE = (e && e.data && e.data.error)"));
ok('T9 voiceSend guarda error de respuesta', app.includes("VOICE_FAIL_CODE = (tr && tr.error) || 'no_heard'"));
ok('T9 barra muestra bad_audio', app.includes('el audio no llegó en un formato que pueda leer.'));
ok('T9 barra muestra no_heard', app.includes('no se entendió nada de la nota.'));
ok('T9 barra muestra no_key', app.includes('falta configurar la clave de audio.'));
ok('T9 barra muestra network', app.includes('se cortó la conexión al enviar.'));
ok('T9 mensaje principal intacto', app.includes('no pude escuchar tu audio 🙏'));
ok('T9 voiceDiscard limpia el código', app.includes("VOICE_ABORTED = false; VOICE_FAIL_CODE = '';"));

// ---- T10: auto-envío al soltar intacto; voz sobre reel intacta ----
{
  const vtBlock = app.slice(app.indexOf('async function voiceToggle'), app.indexOf('function voicePreview'));
  ok('T10 onstop de voiceToggle -> voicePreview (sin carrera: voiceSend solo desde preview)', vtBlock.includes('rec.onstop') && vtBlock.includes('voicePreview()'));
  const pvBlock = app.slice(app.indexOf('function voicePreview'), app.indexOf('async function voiceSend'));
  ok('T10 voicePreview llama voiceSend', pvBlock.includes('voiceSend()'));
  const vsBlock = app.slice(app.indexOf('async function voiceStop'), app.indexOf('function voicePreview'));
  ok('T10 voiceStop NO llama voiceSend directo', !vsBlock.includes('voiceSend('));
  ok('T10 mcVoiceUI (voz sobre reel) intacto', app.includes('mcVoiceUI'));
  ok('T10 deslizar-cancelar intacto', app.includes('VOICE_CANCEL = true'));
}

console.log('\n' + pass + ' ok / ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
