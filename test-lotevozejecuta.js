// LOTE VOZ-EJECUTA (construcción sin push, base v580).
// Pedido Valentino 3/11 (nota de voz) + refinamiento: la nota de voz se ve
// linda, tiene BOTÓN DE ENVIAR visible, muestra la transcripción EXACTA como
// mensaje del cliente y Posty EJECUTA lo pedido (no solo responde).
// Qué cambia: (1) tap para grabar (no mantener): 1er toque graba, 2do para
// a vista previa, Enviar manda, Descartar borra — nada se manda solo;
// (2) al enviar, primero /api/ideas/transcribe y la burbuja del cliente
// muestra el transcript verbatim + audio; el texto entra por chatExchange
// como texto escrito (mismo pipeline: edits, publish, rule);
// (3) el embudo «convertí en un posteo concreto» sale: la nota nueva manda
// ejecutar el pedido y confirmar con el resultado real, nunca fingir;
// (4) si Whisper falla: mensaje honesto + Reintentar envío / Grabar de nuevo,
// nunca texto inventado; grabación vacía no se manda.
// Intacto: mcVoiceUI (voz sobre el reel), pnVoice (/api/dna/from-audio),
// landing sin sesión (pzLpChatBind reemplaza el mic por Enviar simple),
// chatbar-mas (sin #chatPlus), chat a pantalla completa (bindChatFull usa
// voiceToggle), subir-foto-todo (adjuntos del chat).
// Uso: node test-lotevozejecuta.js [dir]
const fs = require('fs');
const dir = process.argv[2] || '.';
const app = fs.readFileSync(dir + '/public/app.js', 'utf8');
const css = fs.readFileSync(dir + '/public/styles.css', 'utf8');
const srv = fs.readFileSync(dir + '/server.js', 'utf8');
let ok = 0, bad = 0;
function t(name, cond) { if (cond) { ok++; } else { bad++; console.log('FALLA: ' + name); } }
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
const appCode = stripComments(app);
const srvCode = stripComments(srv);

// ---------- 1. Tap para grabar, vista previa, Enviar visible, nada auto ----------
t('voiceToggle existe y es tap (sin mantener)', appCode.includes('async function voiceToggle'));
t('voiceStop existe (2do toque para, no manda)', appCode.includes('function voiceStop'));
t('voicePreview existe', appCode.includes('function voicePreview'));
t('voiceDiscard existe', appCode.includes('function voiceDiscard'));
t('voiceSend existe (Enviar)', appCode.includes('async function voiceSend'));
t('barra de voz renderiza Enviar + Descartar', app.includes('id="vozSend"') && app.includes('id="vozDiscard"'));
t('barra de voz renderiza Parar al grabar', app.includes('id="vozStop"'));
t('barra de voz tiene punto rojo + timer + nivel', app.includes('voz-dot') && app.includes('vozTm') && app.includes('vozLvl'));
t('NO auto-envío al parar: onstop va a vista previa, no a voiceSend',
  appCode.includes('voicePreview()') && !/rec\.onstop\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*voiceSend\(\)/.test(appCode));
t('NO queda el mantener-para-enviar: pointerup ya no para la grabación',
  !/onpointerup\s*=\s*\(\)\s*=>\s*\{[^}]*voiceStop/.test(appCode));
t('tope 90 segundos sigue', app.includes('90000'));
t('estado VOICE_STATE gobierna la barra', app.includes("VOICE_STATE = 'idle'") && app.includes("VOICE_STATE = 'preview'") && app.includes("VOICE_STATE = 'sending'") && app.includes("VOICE_STATE = 'failed'"));
t('chatUpdateSendBtn no pisa la barra de voz', appCode.includes("VOICE_STATE !== 'idle'"));

// ---------- 2. Transcripción verbatim como mensaje ----------
t('endpoint /api/ideas/transcribe existe', srv.includes("app.post('/api/ideas/transcribe'"));
t('transcribe usa transcribeAudio existente', srvCode.slice(srvCode.indexOf('/api/ideas/transcribe')).includes('transcribeAudio('));
t('transcribe exige sesión', srvCode.slice(srvCode.indexOf('/api/ideas/transcribe')).includes('no_session'));
t('transcribe exige prueba válida', srvCode.slice(srvCode.indexOf('/api/ideas/transcribe')).includes('requireTrialValid'));
t('transcribe no escribe historial (lo hace el chat de texto después)',
  !srvCode.slice(srvCode.indexOf('/api/ideas/transcribe'), srvCode.indexOf('/api/ideas/transcribe') + 2000).includes('chat_messages'));
t('cliente llama a transcribe antes de mandar', appCode.includes("/api/ideas/transcribe"));
t('burbuja del cliente muestra transcript exacto + audio',
  app.includes('esc(transcript)') && app.includes('<audio controls src="' + "' + esc(audioUrl) + '"));
t('el transcript entra por chatExchange como texto (pushed, sin audio)',
  appCode.includes('chatExchange({ text: transcript, pushed: true })'));
t('CHAT guarda el transcript (historial verbatim)', appCode.includes("CHAT.push({ role: 'user', text: transcript })"));

// ---------- 3. Ejecución, no embudo ----------
t('embudo viejo ELIMINADO', !srv.includes('convertí lo que pide en un posteo concreto'));
t('nota nueva manda ejecutar', srv.includes('Ejecutalo como si lo hubiera escrito'));
t('nota nueva prohíbe fingir', srv.includes('Nunca finjas haber hecho algo que no hiciste'));
t('nota nueva nombra los mecanismos (edit, publish, rule)', srv.includes('bloques edit, publish, rule'));
t('camino viejo de audio sigue vivo (defensa en profundidad)', srv.includes("data:audio/") && srv.includes('transcribeAudio(audio, akey)'));

// ---------- 4. Fallo honesto, nunca invento ----------
t('fallo Whisper: estado failed con Reintentar envío + Grabar de nuevo',
  app.includes('id="vozRetrySend"') && app.includes('id="vozRetry"'));
t('fallo Whisper: la rama de fallo pone failed + render y RETORNA sin mandar',
  appCode.includes("if (!tr || !tr.ok || !tr.transcript) { VOICE_STATE = 'failed'; voiceRenderBar(); return; }") &&
  appCode.includes("if (!dataUrl) { VOICE_STATE = 'failed'; voiceRenderBar(); return; }"));
t('grabación vacía no se manda (umbral 1500 + mensaje)', app.includes('1500') && app.includes('no se grabó nada'));
t('sin dataUrl no se manda', appCode.includes("if (!dataUrl) { VOICE_STATE = 'failed'"));

// ---------- 5. ES y EN ----------
t('textos ES/EN en la barra (Enviar/Send, Parar/Stop, Descartar/Discard)',
  app.includes("'Enviar'") && app.includes("'Send'") && app.includes("'Parar'") && app.includes("'Stop'") && app.includes("'Descartar'") && app.includes("'Discard'"));
t('textos ES/EN en fallo (Grabar de nuevo / Record again)',
  app.includes("'Grabar de nuevo'") && app.includes("'Record again'"));

// ---------- 6. Estilos ----------
t('CSS: .voz-bar vidrio', css.includes('.voz-bar') && css.includes('blur(16px)'));
t('CSS: .voz-dot rojo latiendo', css.includes('.voz-dot') && css.includes('recpulse'));
t('CSS: .voz-lvl barra de nivel', css.includes('.voz-lvl'));

// ---------- 7. Intacto ----------
t('mcVoiceUI intacto (voz sobre el reel, otro feature)', app.includes('Mezclar mi voz') && app.includes('video-voiceover'));
t('pnVoice intacto (nudges, otro flujo)', app.includes('/api/dna/from-audio'));
t('landing sin sesión sigue sin voz (mic reemplazado por Enviar)',
  app.includes("mic.replaceWith(send)") && app.includes("id = 'pzLpSend'"));
t('chatbar-mas intacto (sin #chatPlus en la tarjeta)', (() => { const s = app.indexOf('function chatCardHTML('); const e = app.indexOf('\n}\n', s); return s >= 0 && e > s && !app.slice(s, e).includes('id="chatPlus"'); })());
t('fullscreen usa el mismo flujo (bindChatFull → voiceToggle)', app.includes('__pzChatVoice') && app.includes('voiceToggle()'));
t('subir-foto-todo intacto (CHAT_PHOTOS en chatSend)', app.includes('CHAT_PHOTOS'));

// ---------- 8. M78: funciones llamadas desde UI existen definidas ----------
const uiFns = ['voiceToggle', 'voiceStop', 'voiceSend', 'voiceDiscard'];
let m78ok = true;
for (const f of uiFns) { if (!appCode.includes('function ' + f) && !appCode.includes('async function ' + f)) { m78ok = false; console.log('M78 FALTA: ' + f); } }
t('M78: 4/4 funciones UI de voz definidas en el bundle', m78ok);

console.log(`test-lotevozejecuta: ${ok} OK / ${bad} FALLAS`);
process.exit(bad ? 1 : 0);
