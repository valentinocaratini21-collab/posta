// test-loteplaceholderpreguntas.js — MICRO-LOTE PLACEHOLDER-PREGUNTAS.
// Valentino 3/11 dictó las preguntas que rotan en el placeholder del chat
// de Posty: 4 primero, +1 («pedime exactamente lo que querés») y +5
// («me encanta, dale»): rotación final de 9, en este orden, ES + espejo EN.
// Timing 4 s y fundido ~360 ms intactos (lotes CHAT4S/CHATTEXTO).
// Node puro, lee el árbol. Uso: node test-loteplaceholderpreguntas.js
'use strict';
const fs = require('fs');
const path = require('path');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const block = app.slice(app.indexOf('const PZ_CHAT_PH'), app.indexOf('async function bindChatView'));
t(block.length > 0, 'bloque PZ_CHAT_PH presente');

const ES = ['¿qué idea tenés para el próximo post?', '¿tenés fotos para mandarme?', '¿alguna promo esta semana?', 'pedime exactamente lo que querés', '¿qué querés vender esta semana?', '¿hay algo nuevo en tu negocio?', '¿qué te gustaría cambiar de tu feed?', 'contame qué vendiste hoy', '¿tenés un video para armar un reel?'];
const EN = ['got an idea for the next post?', 'got photos to send me?', 'any promo this week?', 'ask me for exactly what you want', 'what do you want to sell this week?', 'anything new in your business?', 'what would you like to change about your feed?', 'tell me what you sold today', 'got a video to turn into a reel?'];

// 1. Listas exactas, 9 en orden, ES + espejo EN.
t(app.includes("es: ['¿qué idea tenés para el próximo post?', '¿tenés fotos para mandarme?', '¿alguna promo esta semana?', 'pedime exactamente lo que querés', '¿qué querés vender esta semana?', '¿hay algo nuevo en tu negocio?', '¿qué te gustaría cambiar de tu feed?', 'contame qué vendiste hoy', '¿tenés un video para armar un reel?']"), 'ES: 9 preguntas exactas en orden');
t(app.includes("en: ['got an idea for the next post?', 'got photos to send me?', 'any promo this week?', 'ask me for exactly what you want', 'what do you want to sell this week?', 'anything new in your business?', 'what would you like to change about your feed?', 'tell me what you sold today', 'got a video to turn into a reel?']"), 'EN: 9 espejos exactos en orden');
let orderedES = true, prev = -1;
for (const q of ES) { const i = block.indexOf(q); if (i <= prev) orderedES = false; prev = i; }
t(orderedES, 'ES: orden 1-9 por posición en el bloque');
let orderedEN = true; prev = -1;
for (const q of EN) { const i = block.indexOf(q); if (i <= prev) orderedEN = false; prev = i; }
t(orderedEN, 'EN: orden 1-9 por posición en el bloque');

// 2. Ningún resto viejo rotando (las 4 frases viejas, ES y EN).
for (const old of ['escribile a posty…', 'preguntale por tu semana…', 'pedile una idea para hoy…', 'contale qué vendés…', 'write to posty…', 'ask about your week…', 'ask for an idea for today…', 'tell him what you sell…']) {
  t(!block.includes(old), 'sin resto viejo en la rotación: ' + old);
}

// 3. Minúscula (voz del chat de Posty): primera letra tras ¿ (si hay) en minúscula.
const low = (s) => { const c = s.replace(/^¿/, '')[0]; return c === c.toLowerCase(); };
t(ES.every(low), 'ES: las 9 en minúscula');
t(EN.every(low), 'EN: las 9 en minúscula');

// 4. Timing y fundido intactos.
t(app.includes('setInterval(pzPhTick, 4000)'), 'intervalo 4 s intacto');
t(app.includes('}, 180);') && app.includes('}, 380);'), 'fundido: cambio 180 ms, limpieza 380 ms');
t(block.includes("pzPhEls('#chatInput')") && block.includes("pzPhEls('.hf-ask-input')"), 'rotan principal + mini-chat de aprobación');

// 5. Base estática fuera de la rotación intacta (no se borró).
t(app.includes('placeholder="escribile a posty…"'), 'base estática escribile a posty… intacta');

console.log(`LOTEPLACEHOLDERPREGUNTAS: ${ok} ok, ${bad} fallos`);
process.exit(bad ? 1 : 0);
