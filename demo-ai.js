'use strict';
// demo-ai.js — v198: PROYECCIÓN CON IA SOLO PARA PERFILES ILUSTRADOS/MASCOTA.
// v202: FÓRMULA DE COMPOSICIÓN DEL FEED — el clasificador también devuelve
// CÓMO compone el feed (escala del personaje, tipo de fondo, peso del
// titular) y esa fórmula se inyecta como restricciones DURAS en el prompt
// de cada pieza IA (personaje protagonista 60-70%, fondo simple, UN objeto
// concepto grande por pieza, tercio superior limpio para el titular).
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
const FORMULA_BACKGROUNDS = ['plain', 'soft', 'detailed'];
const FORMULA_HEADLINES = ['large', 'small', 'none'];

// La FÓRMULA DE COMPOSICIÓN viaja dentro de la clasificación: escala del
// personaje (fracción del alto del cuadro que ocupa en el feed), tipo de
// fondo y tratamiento del titular. Valores inválidos → null por campo (el
// consumidor aplica defaults vía compositionFor).
function parseClassifyContent(text) {
  try {
    const j = JSON.parse(String(text || ''));
    if (!j || (j.kind !== 'photo' && j.kind !== 'illustrated')) return null;
    const c = (j.composition && typeof j.composition === 'object') ? j.composition : {};
    const scale = Number(c.character_scale);
    return {
      kind: j.kind,
      character: String(j.character || '').slice(0, 400),
      style: String(j.style || '').slice(0, 400),
      formula: {
        character_scale: Number.isFinite(scale) && scale > 0 && scale <= 1 ? scale : null,
        background: FORMULA_BACKGROUNDS.includes(c.background) ? c.background : null,
        headline: FORMULA_HEADLINES.includes(c.headline) ? c.headline : null,
      },
    };
  } catch (e) { return null; }
}

const CLASSIFY_SYSTEM = [
  'Mirás una hoja de contacto con los últimos posteos del Instagram de un negocio.',
  'Tu tarea: decidir si el contenido del feed es FOTOGRAFÍA REAL (fotos de un local, productos, personas reales) o ILUSTRADO (dibujos, ilustración digital, render 3D de un personaje/mascota/avatar, animación, piezas gráficas con un personaje dibujado como protagonista).',
  'Si la mayoría de las piezas son ilustradas o hay un personaje dibujado recurrente → "illustrated". Si son fotos reales → "photo". Ante la duda → "photo".',
  'Además describí la FÓRMULA DE COMPOSICIÓN del feed (cómo están armadas típicamente las piezas):',
  '- composition.character_scale: fracción del ALTO del cuadro que ocupa el personaje/protagonista principal en una pieza típica (0.3 = chico en la escena, 0.7 = primer plano protagonista). Número entre 0 y 1.',
  '- composition.background: "plain" si los fondos son color pleno/lisos, "soft" si son interiores suaves o desenfocados, "detailed" si son escenarios detallados y ocupados.',
  '- composition.headline: "large" si las piezas llevan un titular grande y protagonista, "small" si el texto es chico/secundario, "none" si no llevan texto.',
  'Respondé SOLO un JSON válido, sin markdown:',
  '{"kind":"photo"|"illustrated","character":"descripción en INGLÉS del personaje/mascota dibujado recurrente (aspecto, colores, ropa, rasgos distintivos) o cadena vacía si no hay","style":"descripción en INGLÉS, en una línea, del estilo de ilustración (técnica, paleta dominante, luz, mood) o cadena vacía si es foto","composition":{"character_scale":0.7,"background":"plain"|"soft"|"detailed","headline":"large"|"small"|"none"}}',
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
        max_tokens: 450,
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
  const f = compositionFor(cls);
  const bgLine = f.background === 'plain'
    ? 'Feed composition formula: FLAT solid-color backgrounds in the brand palette.'
    : f.background === 'soft'
      ? 'Feed composition formula: SOFT, blurred, simple interior backgrounds.'
      : 'Feed composition formula: backgrounds stay SIMPLE even when they suggest a place.';
  const headLine = f.headline === 'large'
    ? 'The feed uses BIG bold headlines — keep the top third of every frame clean for the headline.'
    : '';
  return [
    `This client's Instagram feed is ILLUSTRATED digital art — NOT photography. Recurring brand character: ${character}.`,
    `Illustration style of the feed: ${style}. ${light}`,
    bgLine,
    headLine,
    'EVERY image must be an illustration in that EXACT same art style, with that SAME character as the protagonist in a NEW scene (never a copy of a reference scene).',
    'This brand\'s product IS its illustrated character — the character belongs in every piece. Never photorealistic, never generic stock photography, never a different character, never a real human replacing the character.',
  ].filter(Boolean).join(' ');
}

// ---------- Fórmula de composición (v202) ----------
// Normaliza la fórmula del clasificador con defaults alineados al feed
// que queremos reproducir: personaje grande, fondo simple, titular con
// peso. character_scale reportado es informativo (queda en el payload);
// las directivas duras SIEMPRE exigen el rango protagonista 60-70%.
function compositionFor(cls) {
  const f = (cls && cls.formula) || {};
  return {
    character_scale: typeof f.character_scale === 'number' ? f.character_scale : 0.4,
    background: FORMULA_BACKGROUNDS.includes(f.background) ? f.background : 'soft',
    headline: FORMULA_HEADLINES.includes(f.headline) ? f.headline : 'large',
  };
}

// UN objeto-concepto grande y distinto por pieza, derivado del tema del
// posteo (el feed de referencia compone por CONCEPTOS: reloj gigante,
// cartas de fotos, tablet…). Devuelve la frase en inglés para el prompt
// o null si el tema no mapea (la directiva genérica cubre el resto).
const CONCEPT_OBJECTS = [
  [/horario|hora|reloj|cu[aá]ndo|momento|puntual/i, 'one GIANT round wall clock, oversized, right beside the character'],
  [/carrusel|cartas|tarjetas|fotos|galer[ií]a|[aá]lbum/i, 'a big fanned set of oversized photo cards held up by the character'],
  [/sorte|regalo|premio|meg[aá]fono|particip/i, 'one BIG gift box with a ribbon, oversized, beside the character'],
  [/auditor[ií]a|lupa|gr[aá]fico|crecimiento|analiz|revis/i, 'one oversized magnifying glass over a large rising bar-chart board'],
  [/comunidad|responde|mensaje|comentario|chat|seguidores/i, 'a few LARGE friendly chat speech bubbles floating big beside the character'],
  [/turno|agenda|reserva|cita|calendario/i, 'one oversized calendar page with a big bold checkmark'],
  [/venta|precio|promo|oferta|compr|tienda/i, 'one BIG price tag with a bold percent sign beside the character'],
  [/contenido|tablet|ideas|mes|planific|creativ/i, 'one oversized tablet showing a bright colorful content calendar'],
  [/festejo|celebr|logro|meta|cumple/i, 'big colorful confetti and one oversized party balloon beside the character'],
];
function conceptObjectFor(text) {
  const t = String(text || '');
  for (const [re, obj] of CONCEPT_OBJECTS) { if (re.test(t)) return obj; }
  return null;
}

// Restricciones DURAS de composición que se agregan al prompt ya
// ensamblado de cada pieza IA (después del brief y del fragmento de
// estilo): es la traducción operativa de la fórmula del feed.
function compositionDirectives(cls, topicText) {
  const f = compositionFor(cls);
  const concept = conceptObjectFor(topicText);
  const bg = f.background === 'plain'
    ? 'Background: ONE flat solid color from the brand palette (or a very subtle two-tone gradient of it). No environment, no room, no props behind the character.'
    : 'Background: a VERY soft, blurred, simple interior wash in the brand palette — out of focus, almost abstract. FORBIDDEN: detailed busy offices, big window walls, cluttered desks, shelves full of objects, city skylines.';
  const lines = [
    'COMPOSITION — NON-NEGOTIABLE (this feed\'s formula):',
    '- The character is the ABSOLUTE protagonist: CLOSE-UP in the foreground, occupying 60-70% of the frame height, centered, large and instantly readable at thumbnail size. Never a small figure lost inside a big scene.',
    '- ' + bg,
    concept
      ? `- ONE single large concept object dominates the scene with the character: ${concept}. Nothing else competes — no extra props, no secondary characters, no busy details.`
      : '- ONE single large concept object, emblematic of this post\'s theme, dominates the scene with the character. Nothing else competes — no extra props, no secondary characters, no busy details.',
    '- Keep the TOP THIRD of the frame completely clean, plain and uncluttered (only the simple background) — a bold headline is composited there afterwards. No object, window, shelf or face may enter the top third.',
    '- Instant concept read: a viewer must get the post\'s idea in one glance from the character + the one big object alone.',
  ];
  return lines.join('\n');
}

// La referencia de estilo del feed: entre las fotos localizadas, la de
// mayor peso en bytes (proxy barato de la más nítida/grande disponible).
function pickSharpestRef(photoPaths) {
  let best = null; let bestSize = -1;
  for (const p of photoPaths || []) {
    try {
      const s = fs.statSync(p);
      if (s.isFile() && s.size > bestSize) { best = p; bestSize = s.size; }
    } catch (e) { /* no existe: se ignora */ }
  }
  return best;
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
function compositeDemoPiece({ b64, headline, gradeHex, workDir, index, headlineScale }) {
  return new Promise((resolve) => {
    try {
      const dir = workDir || os.tmpdir();
      const raw = path.join(dir, `ai-${index}-raw.png`);
      const fin = path.join(dir, `ai-${index}.png`);
      const jpg = path.join(dir, `ai-${index}.jpg`);
      fs.writeFileSync(raw, Buffer.from(String(b64 || ''), 'base64'));
      const args = [COMPOSITE_SCRIPT, '--in', raw, '--headline', String(headline || ''), '--out', fin];
      if (gradeHex) args.push('--grade', String(gradeHex));
      // v202: si la fórmula del feed pide titulares grandes, el composite
      // usa la escala mayor (el auto-fit del script sigue garantizando
      // que el titular entre sin cortarse).
      if (headlineScale && Number(headlineScale) > 1) args.push('--scale', String(headlineScale));
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
  compositionFor,
  conceptObjectFor,
  compositionDirectives,
  pickSharpestRef,
  REF_NOTE,
  SCENE_ROLES,
  replacePiecesWithAi,
  compositeDemoPiece,
};
