// carta-audio.js — (v384 · ítem 8 de la ronda «Arma todo!») La Carta con
// versión de audio: el guion sale del TEXTO REAL de la carta (el mismo
// que el email envía o el que la dominical persiste), se lee con TTS una
// sola vez por carta y queda cacheado. Sin reescritura con IA: el audio
// dice lo que la carta dice, con solo 4 normalizaciones de locución
// declaradas en scriptFromSegments().
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Normalizaciones de locución (las únicas, declaradas):
//  1. La línea del CTA pierde su URL (queda la frase hablada).
//  2. @handle se lee «arroba …» con los puntos como espacios.
//  3. Fuera emojis y markdown (** y <b>): se lee texto, no formato.
//  4. La firma pierde la línea del dominio pelado.
// Los números y las palabras quedan EXACTAMENTE como la carta los trae.
function spokenSegment(seg) {
  let s = String(seg == null ? '' : seg);
  s = s.replace(/(Ver mi semana completa|See my full week)\s*:\s*https?:\/\/\S+/gi, '$1.');
  s = s.replace(/https?:\/\/\S+/g, '');
  s = s.replace(/@([a-zA-Z0-9._]+)/g, (m, h) => 'arroba ' + h.replace(/[._]+/g, ' ').trim());
  s = s.replace(/<[^>]+>/g, '').replace(/\*\*/g, '');
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '');
  s = s.split('\n').filter((ln) => !/^\s*(postycommunitymanager\.com|posta)\s*$/i.test(ln)).join('\n');
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function segmentsToScript(segments) {
  return (segments || []).map(spokenSegment).filter(Boolean).join('\n\n');
}

// El guion de la Carta de /prueba = su propio texto plano, segmento a
// segmento (el array que el builder del email une con doble salto).
function scriptFromLetterText(textBody) {
  return segmentsToScript(String(textBody || '').split('\n\n'));
}

// El guion dominical = greeting + body[] (sin el ítem foto) + closing,
// desde el letter persistido en account_analysis.
function sundayLetterSegments(analysis) {
  const L = (analysis && analysis.letter) || null;
  if (!L) return [];
  const out = [];
  if (L.greeting) out.push(String(L.greeting));
  for (const it of Array.isArray(L.body) ? L.body : []) {
    if (!it || it.t === 'photo') continue;
    if (it.text) out.push(String(it.text));
  }
  if (L.closing) out.push(String(L.closing));
  return out;
}

function scriptHash(script) {
  return crypto.createHash('sha256').update(String(script || '')).digest('hex').slice(0, 24);
}

function audioKey(kind, ref, lang, script) {
  return crypto.createHash('sha256').update(`${kind}:${ref}:${lang}:${scriptHash(script)}`).digest('hex').slice(0, 24);
}

const TTS_INSTRUCTIONS = {
  es: 'Sos Posty, un community manager amigo. Hablá en español rioplatense, con voseo natural, cálido y claro, a ritmo tranquilo de charla — nunca como locutor de call center. Sonreí al cerrar.',
  en: 'You are Posty, a friendly community manager. Speak warm, clear American English at a relaxed conversational pace — never like a call-center announcer. Smile at the close.',
};

// Síntesis: UNA llamada por carta (el llamador cachea por key). Devuelve
// el buffer mp3. TTS_API_URL permite stub en tests (espejo de RESEND_API_URL).
async function synthesize({ script, lang, apiKey }) {
  const url = process.env.TTS_API_URL || 'https://api.openai.com/v1/audio/speech';
  const key = apiKey || process.env.OPENAI_API_KEY || '';
  if (!key) throw new Error('sin clave de TTS');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: process.env.CARTA_TTS_VOICE || 'coral', // voz PROVISORIA: la fija el oído de Valentino
      instructions: TTS_INSTRUCTIONS[lang === 'en' ? 'en' : 'es'],
      input: String(script || ''),
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error('TTS ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error('TTS vacío');
  return buf;
}

async function writeAudio(mediaDir, key, buf) {
  const name = `carta-${key}.mp3`;
  await fs.promises.writeFile(path.join(mediaDir, name), buf);
  return '/media/' + name;
}

module.exports = {
  spokenSegment, segmentsToScript, scriptFromLetterText, sundayLetterSegments,
  scriptHash, audioKey, synthesize, writeAudio, TTS_INSTRUCTIONS,
};
