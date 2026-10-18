'use strict';
// demo-ai.js — v198: PROYECCIÓN CON IA SOLO PARA PERFILES ILUSTRADOS/MASCOTA.
//
// Decisión de Valentino (2026-10-18): en /prueba, si el Instagram del
// visitante es una marca ILUSTRADA (avatar/mascota/personaje dibujado —
// como @posty.hacetodo), las piezas de su semana se generan con el motor
// de IA real del producto: el personaje en escena, siguiendo la línea de
// su feed. Para perfiles de FOTO REAL (la mayoría) no cambia nada: el
// demo de plantillas actual, costo cero.
//
// Este módulo trae las piezas testeables sin server ni red:
//   1) buildContactSheet: hoja 2x2 de las fotos del feed ya localizadas.
//   2) classifyFeedKind: UNA llamada de visión barata (gpt-4o-mini) →
//      'photo' | 'illustrated' + descripción del personaje y del estilo.
//      Cualquier falla → null (el llamador trata null como 'photo').
//   3) replacePiecesWithAi: corre el reemplazo pieza por pieza con
//      fallback individual (la que falla queda de plantilla) y freno de
//      tope diario antes de lanzar cada pieza.
//   4) compositeDemoPiece: titular compuesto por código (mismo
//      composite-headline.py del pipeline real) + JPEG 1080x1350 como
//      las piezas de plantilla.
// El gasto se loguea en api_costs vía costs.trackUsage con feature
// 'demo-ai-*' (ver costs.js: DEMO_AI_DAILY_CAP_USD).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const costs = require('./costs');

const CLASSIFY_MODEL = 'gpt-4o-mini';
const SHEET_SCRIPT = path.join(__dirname, 'feed-sheet.py');
const COMPOSITE_SCRIPT = path.join(__dirname, 'composite-headline.py');

// ---------- 1) Hoja de contacto 2x2 ----------
function buildContactSheet(photoPaths) {
  return new Promise((resolve) => {
    const paths = (photoPaths || []).filter((p) => {
      try { return typeof p === 'string' && fs.statSync(p).isFile(); } catch (e) { return false; }
    }).slice(0, 4);
    if (!paths.length) return resolve(null);
    const out = path.join(os.tmpdir(), `posta-feed-sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
    execFile('python3', [SHEET_SCRIPT, out, ...paths], { timeout: 15000 }, (err) => {
      if (err) return resolve(null);
      try { if (!fs.statSync(out).isFile()) return resolve(null); } catch (e) { return resolve(null); }
      resolve(out);
    });
  });
}

// ---------- 2) Clasificación del feed ----------
function parseClassifyContent(text) {
  try {
    const j = JSON.parse(String(text || ''));
    if (!j || (j.kind !== 'photo' && j.kind !== 'illustrated')) return null;
    return {
      kind: j.kind,
      character: String(j.character || '').slice(0, 400),
      style: String(j.style || '').slice(0, 400),
    };
  } catch (e) { return null; }
}

const CLASSIFY_SYSTEM = [
  'Mirás una hoja de contacto con los últimos posteos del Instagram de un negocio.',
  'Tu tarea: decidir si el contenido del feed es FOTOGRAFÍA REAL (fotos de un local, productos, personas reales) o ILUSTRADO (dibujos, ilustración digital, render 3D de un personaje/mascota/avatar, animación, piezas gráficas con un personaje dibujado como protagonista).',
  'Si la mayoría de las piezas son ilustradas o hay un personaje dibujado recurrente → "illustrated". Si son fotos reales → "photo". Ante la duda → "photo".',
  'Respondé SOLO un JSON válido, sin markdown:',
  '{"kind":"photo"|"illustrated","character":"descripción en INGLÉS del personaje/mascota dibujado recurrente (aspecto, colores, ropa, rasgos distintivos) o cadena vacía si no hay","style":"descripción en INGLÉS, en una línea, del estilo de ilustración (técnica, paleta dominante, luz, mood) o cadena vacía si es foto"}',
].join('\n');

// Clasifica el feed UNA vez. Devuelve {kind, character, style} o null si
// algo falla (sin key, sin fotos, red, JSON ilegible): null = 'photo'
// para el llamador (cero gasto extra, demo de plantillas de siempre).
// fetchImpl es la costura de test: si viene inyectado no se loguea costo.
async function classifyFeedKind({ photoPaths, apiKey, fetchImpl } = {}) {
  if (!apiKey) return null;
  const paths = (photoPaths || []).filter((p) => {
    try { return typeof p === 'string' && fs.statSync(p).isFile(); } catch (e) { return false; }
  }).slice(0, 4);
  if (!paths.length) return null;
  const doFetch = fetchImpl || fetch;
  let sheet = null;
  try {
    sheet = await buildContactSheet(paths);
    if (!sheet) return null;
    const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(sheet).toString('base64');
    const r = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: CLASSIFY_MODEL,
        temperature: 0.2,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLASSIFY_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Clasificá este feed.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!fetchImpl) {
      try { costs.trackUsage({ feature: 'demo-ai-classify', model: CLASSIFY_MODEL, json: j }); } catch (e) {}
    }
    const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    return parseClassifyContent(content);
  } catch (e) {
    return null;
  } finally {
    if (sheet) { try { fs.unlinkSync(sheet); } catch (e) {} }
  }
}

// Línea visual que viaja a expandArtBrief (bloque LÍNEA VISUAL
// OBLIGATORIA del pipeline real): el feed ES ilustrado y el personaje
// ES el producto — la regla anti-mascota de los rubros de producto no
// aplica acá (es la excepción que el propio brief contempla).
function visualStyleForFeed(cls, feedRegister) {
  const character = (cls && cls.character) || 'the illustrated brand mascot from the reference images';
  const style = (cls && cls.style) || 'clean modern digital illustration, bright and friendly';
  const light = feedRegister === 'light'
    ? 'The feed is BRIGHT: light backgrounds, airy scenes, daylight mood.'
    : feedRegister === 'dark'
      ? 'The feed is DARK/moody: deep backgrounds, dramatic light.'
      : '';
  return [
    `This client's Instagram feed is ILLUSTRATED digital art — NOT photography. Recurring brand character: ${character}.`,
    `Illustration style of the feed: ${style}. ${light}`,
    'EVERY image must be an illustration in that EXACT same art style, with that SAME character as the protagonist in a NEW scene (never a copy of a reference scene).',
    'This brand\'s product IS its illustrated character — the character belongs in every piece. Never photorealistic, never generic stock photography, never a different character, never a real human replacing the character.',
  ].join(' ');
}

const REF_NOTE = 'IMPORTANT: the FIRST reference image is the client\'s brand character/mascot (its profile picture); if there is a second one, it is a post from its feed showing the illustration style. Keep the SAME character — identical design, colors, proportions and art style — as the protagonist in a NEW scene. Do NOT redesign or reinterpret the character.';

// Roles de escena por posición: la semana IA tiene que verse VARIADA
// (cada pieza cumple un rol distinto, como en el pipeline real).
const SCENE_ROLES = [
  'el personaje trabajando concentrado y contento en la tarea central de su negocio',
  'el personaje presentando una idea mirando a cámara, gesto de "mirá esto"',
  'el personaje celebrando un logro, energía alta, brazos arriba',
  'el personaje ayudando a un cliente o persona del rubro, escena cálida de a dos',
  'el personaje cerrando el día relajado, sonrisa satisfecha, luz cálida',
];

// ---------- 3) Reemplazo progresivo con fallback y freno de tope ----------
// indexes: qué piezas reemplazar. capOk(): se consulta ANTES de lanzar
// cada pieza — si el tope diario del demo se alcanzó, no se lanzan más
// (las ya lanzadas terminan; el costo de una tanda está acotado a ~5
// imágenes). makePiece(i) → Buffer|null (null o error = queda plantilla).
// onPiece(i, buf): se invoca apenas cada pieza está (stream progresivo).
async function replacePiecesWithAi({ indexes, capOk, makePiece, onPiece } = {}) {
  const replaced = new Map();
  let stoppedByCap = false;
  const tasks = [];
  for (const i of indexes || []) {
    if (capOk && !capOk()) { stoppedByCap = true; break; }
    tasks.push((async () => {
      try {
        const buf = await makePiece(i);
        if (buf) {
          replaced.set(i, buf);
          if (onPiece) { try { await onPiece(i, buf); } catch (e) { /* el stream sigue */ } }
        }
      } catch (e) { /* fallback silencioso: la pieza queda de plantilla */ }
    })());
  }
  await Promise.all(tasks);
  return { replaced, stoppedByCap };
}

// ---------- 4) Composite del titular + JPEG final ----------
// La IA genera la escena LIMPIA (sin texto); el titular lo compone el
// código con composite-headline.py — el mismo del pipeline real — y la
// pieza final sale JPEG 1080x1350 como las de plantilla.
function compositeDemoPiece({ b64, headline, gradeHex, workDir, index }) {
  return new Promise((resolve) => {
    try {
      const dir = workDir || os.tmpdir();
      const raw = path.join(dir, `ai-${index}-raw.png`);
      const fin = path.join(dir, `ai-${index}.png`);
      const jpg = path.join(dir, `ai-${index}.jpg`);
      fs.writeFileSync(raw, Buffer.from(String(b64 || ''), 'base64'));
      const args = [COMPOSITE_SCRIPT, '--in', raw, '--headline', String(headline || ''), '--out', fin];
      if (gradeHex) args.push('--grade', String(gradeHex));
      execFile('python3', args, { timeout: 30000 }, (err) => {
        if (err) return resolve(null);
        const conv = 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB")\nim = im.resize((1080, 1350), Image.LANCZOS)\nim.save(sys.argv[2], "JPEG", quality=88)\n';
        execFile('python3', ['-c', conv, fin, jpg], { timeout: 20000 }, (err2) => {
          try { fs.unlinkSync(raw); } catch (e) {}
          try { fs.unlinkSync(fin); } catch (e) {}
          if (err2) return resolve(null);
          try {
            const buf = fs.readFileSync(jpg);
            fs.unlinkSync(jpg);
            resolve(buf.length ? buf : null);
          } catch (e) { resolve(null); }
        });
      });
    } catch (e) { resolve(null); }
  });
}

module.exports = {
  CLASSIFY_MODEL,
  buildContactSheet,
  parseClassifyContent,
  classifyFeedKind,
  visualStyleForFeed,
  REF_NOTE,
  SCENE_ROLES,
  replacePiecesWithAi,
  compositeDemoPiece,
};
