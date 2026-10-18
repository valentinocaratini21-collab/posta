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
  // v203: "carrusel" es polisémica — gpt-image la leyó literal (calesita de
  // plaza) pese a que la frase vieja ya decía "photo cards". La entrada ahora
  // DEFINE el término (carrusel de Instagram = fotos) y trae negativos duros.
  // Auditoría del resto del mapa (misma corrida): horarios→reloj, sorteo→regalo,
  // comunidad→burbujas, auditoría→lupa/gráfico, contenido→tablet, turnos→calendario,
  // ventas→etiqueta de precio, festejo→confeti/globo — sin lectura literal
  // peligrosa; no se tocaron.
  [/carrusel|cartas|tarjetas|fotos|galer[ií]a|[aá]lbum/i, 'an Instagram photo carousel: the character proudly holding a fanned-out set of printed PHOTOS / photo cards (or a smartphone showing a swipeable stack of photos). NEVER a merry-go-round, NEVER a fairground carousel, no amusement park, no horses'],
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

// ---------- Capa de tratamientos visibles (v203, ampliación) ----------
// En el camino IA cada posteo ya tenía un ESTILO nombrado distinto, pero
// la línea visual + la fórmula dominaban el prompt y los píxeles
// convergían (personaje centrado + ambiente claro + objeto, siempre
// igual — lo vio Valentino: "siempre usás el mismo estilo"). Encima de
// la fórmula, cada pieza de la semana recibe ahora UN TRATAMIENTO visual
// a nivel prompt, mutuamente muy distinto, y la semana nunca repite:
//   flat      FLAT STUDIO   fondo pleno de paleta, personaje enorme, cero ambiente
//   poster    GRAPHIC POSTER pieza gráfica/tipográfica, personaje chico/medallón
//   duo       DUO           personaje interactuando con una persona de su rubro
//   workspace WORKSPACE     plano medio trabajando con su herramienta
//   prop      PROP SCENE    la fórmula v202 (ambiente suave + objeto gigante)
const TREATMENT_ORDER = ['flat', 'poster', 'duo', 'workspace', 'prop'];
const TREATMENT_NAMES = {
  flat: 'FLAT STUDIO',
  poster: 'GRAPHIC POSTER',
  duo: 'DUO',
  workspace: 'WORKSPACE',
  prop: 'PROP SCENE',
};

// Familias del pool de estilos → tratamiento, cuando el mapeo es
// razonable. Lo que no mapea devuelve null y lo completa la rotación.
function treatmentForStyle(style) {
  const s = String(style || '').toLowerCase();
  if (!s) return null;
  if (/poster|editorial|graphic|gr[aá]fic|collage|magazine|revista|pop/.test(s)) return 'poster';
  if (/duo|ugc|person|gente|cliente|testimon|equipo|team|pareja/.test(s)) return 'duo';
  if (/workspace|desk|escritorio|oficina|office|laptop|notebook|trabaj/.test(s)) return 'workspace';
  if (/flat|plano|minimal|studio|estudio|s[oó]lido|solid|bold/.test(s)) return 'flat';
  if (/scene|escena|foto|photo|producto|product|lifestyle|hero|corporativo/.test(s)) return 'prop';
  return null;
}

// Asignación de la semana: 1) el tratamiento que deriva del estilo
// nombrado de cada posteo (sin repetir); 2) los huecos se completan por
// rotación determinística sobre los tratamientos libres (el offset sale
// de un hash de estilos+titulares: misma semana → misma asignación,
// semanas distintas rotan distinto). Nunca repite un tratamiento ya
// usado mientras queden libres — con 5 piezas y 5 tratamientos, la
// semana sale con los 5, y PROP SCENE queda en ≤1 (su tope era 1-2).
function assignTreatments(items) {
  const list = Array.isArray(items) ? items : [];
  const used = new Set();
  const out = new Array(list.length).fill(null);
  list.forEach((it, i) => {
    const t = treatmentForStyle(it && it.style);
    if (t && !used.has(t)) { out[i] = t; used.add(t); }
  });
  let h = 0;
  const seed = list.map((it) => String((it && it.style) || '') + '|' + String((it && it.headline) || '')).join('~');
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rest = TREATMENT_ORDER.filter((t) => !used.has(t));
  let k = rest.length ? h % rest.length : 0;
  list.forEach((it, i) => {
    if (!out[i]) {
      if (rest.length) { out[i] = rest[k % rest.length]; used.add(out[i]); k++; }
      else out[i] = 'prop';
    }
  });
  return out;
}

// ---------- Directiva dura de paleta (v203) ----------
// Hasta v194 la paleta del feed solo teñía detalles (grade del titular,
// botones): las escenas IA inventaban sus propios fondos. Ahora los hex
// EXACTOS de los últimos posteos viajan como regla dura en el prompt de
// cada pieza: fondos, superficies planas y elementos de escena se
// construyen con ESTOS colores (o tintes directos de ellos).
function paletteDirectives(palette) {
  if (!palette || !palette.principal) return null;
  const line = (label, hex) => (hex ? `- ${label}: ${hex}` : null);
  return [
    'BRAND PALETTE — HARD RULE (these exact hex colors were extracted from the client\'s LATEST Instagram posts; they ARE the brand — do not invent other colors):',
    line('Main brand color', palette.principal),
    line('Accent color', palette.accent),
    line('Dark color', palette.dark),
    line('Light / cream color', palette.light),
    line('Dominant background color of the recent feed', palette.bg),
    'Every background, wall, floor, desk, flat surface, shape, prop and clothing color in this image MUST be one of these hex colors or a direct tint/shade of them. No unrelated hues: no invented greens, purples, oranges, pinks or generic pastels outside this palette. (Natural skin and hair tones of people are the only exception.)',
  ].filter(Boolean).join('\n');
}

// Hex de fondo de la pieza FLAT STUDIO: rota determinísticamente entre
// el claro, el acento y el oscuro de la paleta reciente (por índice de
// pieza) — nunca un color ajeno a sus posteos.
function flatBgHexFor(palette, index) {
  if (!palette) return null;
  const cands = [palette.light, palette.accent, palette.dark].filter(Boolean);
  if (!cands.length) return null;
  return cands[Math.abs(parseInt(index, 10) || 0) % cands.length];
}

// Restricciones DURAS de composición que se agregan al prompt ya
// ensamblado de cada pieza IA (después del brief y del fragmento de
// estilo): es la traducción operativa de la fórmula del feed, modulada
// por el TRATAMIENTO de la pieza (v203). Sin tratamiento explícito =
// PROP SCENE, el comportamiento v202. opts.palette/opts.index (v203):
// la pieza FLAT compone sobre el hex exacto rotado de la paleta.
function compositionDirectives(cls, topicText, treatment, opts) {
  const f = compositionFor(cls);
  const concept = conceptObjectFor(topicText);
  const t = TREATMENT_ORDER.includes(treatment) ? treatment : 'prop';
  const bgSoft = 'Background: a VERY soft, blurred, simple interior wash in the brand palette — out of focus, almost abstract. FORBIDDEN: detailed busy offices, big window walls, cluttered desks, shelves full of objects, city skylines.';
  const bg = f.background === 'plain'
    ? 'Background: ONE flat solid color from the brand palette (or a very subtle two-tone gradient of it). No environment, no room, no props behind the character.'
    : bgSoft;
  const topClean = '- Keep the TOP THIRD of the frame completely clean, plain and uncluttered (only the simple background) — a bold headline is composited there afterwards. No object, window, shelf or face may enter the top third.';
  const marker = `TREATMENT: ${TREATMENT_NAMES[t]}.`;
  const head = 'COMPOSITION — NON-NEGOTIABLE (this feed\'s formula):';
  if (t === 'flat') {
    const flatHex = opts && opts.palette ? flatBgHexFor(opts.palette, opts.index) : null;
    return [
      marker,
      head,
      flatHex
        ? `- Background: ONE single FLAT SOLID COLOR filling the ENTIRE frame — exactly ${flatHex}, taken from the client's latest-posts palette. ZERO environment: no room, no windows, no furniture, no floor, no sky, no cast shadows — that exact flat color only, like a brand poster.`
        : '- Background: ONE single FLAT SOLID COLOR from the brand palette filling the ENTIRE frame. ZERO environment: no room, no windows, no furniture, no floor, no sky, no cast shadows — flat color only, like a brand poster.',
      '- The character is ENORMOUS: bold close-up in the foreground, occupying 70-80% of the frame height, centered, iconic and instantly readable at thumbnail size.',
      concept
        ? `- One single bold prop, big and simple, held by or beside the character: ${concept}. Nothing else in the frame.`
        : '- No props and no secondary elements: the character alone against the flat color.',
      '- The top of the frame is the same flat color, completely clean — a bold headline is composited there afterwards.',
      '- Instant read: character + flat color + at most one prop — nothing more.',
    ].join('\n');
  }
  if (t === 'poster') {
    return [
      marker + ' This piece is a flat GRAPHIC DESIGN — an explicit exception to the big-protagonist scene rule.',
      head,
      '- A bold FLAT GRAPHIC composition: large flat shapes, bands, circles and blocks in the brand palette over a flat background. NOT a scene: no environment, no room, no perspective, no realistic setting.',
      '- The character appears SMALL, as a signature: tucked in a corner or inside a clean circular medallion, at most 25% of the frame height.',
      concept
        ? `- The post's concept is ONE simple flat graphic motif, huge and clean, drawn as flat vector-style design (not a realistic object inside a scene): ${concept}.`
        : '- The post\'s concept is ONE simple flat graphic motif, huge and clean, drawn as flat vector-style design.',
      '- Leave the top 30% of the frame as clean flat design space — a bold headline is composited there afterwards.',
      '- Instant read: a designed poster, not a picture of a place.',
    ].join('\n');
  }
  if (t === 'duo') {
    return [
      marker,
      head,
      '- A warm TWO-SHOT in the same illustration style: the character interacts with ONE human person from its trade (handing something over, explaining an idea, celebrating together). The character remains the protagonist of the pair — at least half of the combined presence, never a sidekick; the person supports and never replaces the character.',
      '- ' + bg,
      concept
        ? `- Between them, ONE large simple object carries the concept: ${concept}. Nothing else competes.`
        : '- Their interaction alone carries the concept: hands, gesture and expression. No extra props.',
      topClean,
      '- Instant read: the character helping someone — understood in one glance.',
    ].join('\n');
  }
  if (t === 'workspace') {
    return [
      marker,
      head,
      '- MEDIUM SHOT: the character DOING its job — working with its main tool (tablet, laptop or phone) front and center, typing, drawing or presenting the screen — occupying about 50% of the frame height.',
      '- Environment: MINIMAL — one simple desk surface and a plain soft backdrop in the brand palette. FORBIDDEN: window walls, cluttered shelves, detailed busy offices, city skylines.',
      concept
        ? `- On the desk, ONE single large simple object: ${concept}. Nothing else competes.`
        : '- Only the tool and the character on the desk — nothing else.',
      topClean,
      '- Instant read: the character at work with its tool.',
    ].join('\n');
  }
  // prop — PROP SCENE, la fórmula v202 tal cual.
  return [
    marker,
    head,
    '- The character is the ABSOLUTE protagonist: CLOSE-UP in the foreground, occupying 60-70% of the frame height, centered, large and instantly readable at thumbnail size. Never a small figure lost inside a big scene.',
    '- ' + bg,
    concept
      ? `- ONE single large concept object dominates the scene with the character: ${concept}. Nothing else competes — no extra props, no secondary characters, no busy details.`
      : '- ONE single large concept object, emblematic of this post\'s theme, dominates the scene with the character. Nothing else competes — no extra props, no secondary characters, no busy details.',
    topClean,
    '- Instant concept read: a viewer must get the post\'s idea in one glance from the character + the one big object alone.',
  ].join('\n');
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

// ---------- 2b) Motor Nano Banana Pro (v205) ----------
// Benchmark aprobado por Valentino (2026-10-18, comparacion en
// ~/workspace/user/files/benchmark-posty.png): gemini-3-pro-image
// iguala/supera a gpt-image en consistencia del personaje, compone
// mejor el póster y devuelve archivos ~3× más livianos; su vicio es
// AGREGAR TEXTO solo (en inglés) — lo caza el QA visual de abajo — y
// cuesta ~2× (USD 0,134 vs 0,063, precio de lista en costs.js).
// La clave llega por GEMINI_API_KEY (env de Railway): si falta o la
// llamada falla, generateDemoPieceImage cae a gpt-image (genGpt
// inyectado por el server) y si eso falla, a plantillas — la prueba
// nunca se rompe por este motor.
const NANO_MODEL = 'gemini-3-pro-image';
const NANO_USD_PER_IMAGE = 0.134;

function extractGeminiImageB64(j) {
  const cands = (j && j.candidates) || [];
  for (const c of cands) {
    const parts = (c && c.content && c.content.parts) || [];
    for (const p of parts) {
      const d = (p && (p.inlineData || p.inline_data)) || null;
      if (d && d.data) return String(d.data);
    }
  }
  return null;
}

// Genera UNA imagen con Nano Banana Pro: prompt final + la referencia
// (foto de perfil = el personaje) en base64, vertical 4:5. Devuelve el
// b64 o null ante CUALQUIER falla (sin key, sin referencia legible,
// red, HTTP, respuesta sin imagen) — nunca lanza. La configuración
// primaria pide solo IMAGE; si la API la rechaza con 400 se reintenta
// con la configuración probada en el benchmark (TEXT+IMAGE).
// fetchImpl es la costura de test: si viene inyectado no se loguea costo.
// (v209) CALIDAD MÁXIMA: se pide imageSize '2K' — el tier alto de salida
// del modelo (la pieza final es 1080×1350: 2K ya la supera ~2×; el tier
// 4K cuesta USD 0,24/img sin diferencia visible tras el downscale, por
// eso no se usa). Si la API rechaza el parámetro, se reintenta sin él.
async function genNanoImage({ prompt, refPath, apiKey, fetchImpl } = {}) {
  if (!apiKey || !refPath) return null;
  let refB64 = null; let refMime = 'image/jpeg';
  try {
    refB64 = fs.readFileSync(refPath).toString('base64');
    const ext = path.extname(refPath).toLowerCase();
    refMime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  } catch (e) { return null; }
  if (!refB64) return null;
  const doFetch = fetchImpl || fetch;
  const parts = [
    { text: String(prompt || '') },
    { inline_data: { mime_type: refMime, data: refB64 } },
  ];
  const configs = [
    { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5', imageSize: '2K' } },
    { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:5', imageSize: '2K' } },
    { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } },
    { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:5' } },
  ];
  for (let ci = 0; ci < configs.length; ci++) {
    try {
      const r = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${NANO_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: configs[ci] }),
        signal: AbortSignal.timeout(120000),
      });
      if (!r || !r.ok) {
        // 400 con una config = probablemente ESA config: se prueba la
        // siguiente. Cualquier otro error → fallback.
        if (r && r.status === 400 && ci < configs.length - 1) continue;
        return null;
      }
      const j = await r.json().catch(() => null);
      const b64 = extractGeminiImageB64(j);
      if (!b64) return null;
      if (!fetchImpl) {
        try { costs.logApiCost({ feature: 'demo-ai-nano', model: NANO_MODEL, images: 1 }); } catch (e) {}
      }
      return b64;
    } catch (e) { return null; }
  }
  return null;
}

// Cadena de motores de UNA pieza del demo ilustrado:
// Nano (si hay clave Gemini) → gpt-image (genGpt inyectado: el server
// envuelve genConceptImage con su costFeature) → null (plantilla).
// El refNote se agrega acá SOLO para Nano: genConceptImage ya lo suma
// en su rama edits, y duplicarlo en gpt no aporta.
// Devuelve { b64, engine: 'nano'|'gpt' } o null.
async function generateDemoPieceImage({ prompt, refs, geminiKey, genGpt, refNote, fetchImpl } = {}) {
  if (geminiKey) {
    const b64 = await genNanoImage({
      prompt: refNote ? `${prompt}\n\n${refNote}` : prompt,
      refPath: (refs || [])[0],
      apiKey: geminiKey,
      fetchImpl,
    }).catch(() => null);
    if (b64) return { b64, engine: 'nano' };
  }
  if (genGpt) {
    try {
      const b64 = await genGpt(prompt);
      if (b64) return { b64, engine: 'gpt' };
    } catch (e) { /* cae a plantilla */ }
  }
  return null;
}

// ---------- 2c) DIRECCIÓN DE ARTE por estilo (v205) ----------
// La vara competitiva (Valentino, 2026-10-18): "nuestros posteos
// tienen que ser mejores que los de Predis… ellos usan mejor los
// prompts". Hasta v203 el style_code NOMBRABA un estilo (fragmento de
// image-styles) pero el prompt convergía: misma gramática para todos.
// Esta capa convierte cada estilo alcanzable por la ruta ilustrada del
// demo en una DIRECCIÓN DE ARTE COMPLETA — gramática de composición,
// sistema de fondo, luz, distancia de cámara, textura/medio y uso del
// color — que MANDA sobre el brief (va después del fragmento de
// estilo) y solo cede ante las directivas duras (paleta hex,
// tratamiento, fórmula y concepto). Las familias son mutuamente
// INCOMPATIBLES a propósito (una pieza flat-lay cenital NO puede
// leerse como una escena cinemática de ángulo bajo): si dos piezas de
// la semana llevan estilos de familias distintas, sus píxeles no
// pueden converger al mismo look.
const ART_DIRECTIONS = {
  flatlay: {
    composition: 'STRICT TOP-DOWN orthographic arrangement: every element laid out on ONE surface in a deliberate grid or diagonal with generous negative space between pieces — a designed flat composition, never a scene with people standing in a place',
    background: 'ONE single textured surface fills the ENTIRE frame (linen, stone, wood or paper in a brand-palette tone) — no walls, no horizon, no room',
    light: 'flat, even, shadowless-soft light falling straight from above; no directional drama, no dark corners',
    camera: 'directly overhead at exactly 90°, zero perspective tilt, everything in the same focal plane',
    texture: 'the feed\'s exact illustration technique with crisp, detailed surface textures (fabric weave, paper grain, material detail)',
    color: 'the palette lives in the surface and the arranged objects; the accent repeats as small notes across the layout',
  },
  studio: {
    composition: 'ONE hero subject centered with symmetrical breathing room around it — a catalog hero composition, nothing competes with the hero',
    background: 'a seamless studio backdrop in ONE brand-palette color with a soft floor blend and a single soft contact shadow',
    light: 'a large softbox key light: soft, even, premium, with a gentle gradient falloff at the edges',
    camera: 'eye-level three-quarter view at medium distance, subject fully visible',
    texture: 'clean premium render finish, crisp edges, flawless surfaces',
    color: 'the palette is the backdrop plus the subject\'s wardrobe and props — exact brand tones, no extra hues',
  },
  macro: {
    composition: 'EXTREME CLOSE-UP: one single detail fills ~80% of the frame — the texture IS the composition',
    background: 'completely blurred creamy bokeh in palette tones — no recognizable shapes behind the detail',
    light: 'dramatic raking SIDE light that reveals every texture relief; deep soft shadows in the grooves',
    camera: 'macro distance, extremely shallow depth of field — only the hero detail is sharp',
    texture: 'hyper-detailed surface rendering: pores, fibers, gloss and micro-relief all visible',
    color: 'the palette concentrates inside the hero detail; the bokeh only echoes its tones',
  },
  levitation: {
    composition: 'DYNAMIC DIAGONAL: the subject floats mid-air with a few elements orbiting around it — frozen motion, energy, nothing rests on the ground',
    background: 'a clean vertical gradient of ONE brand-palette color with subtle speed streaks',
    light: 'bright studio light plus a crisp drop shadow BELOW the floating subject that proves it levitates',
    camera: 'slightly LOW angle looking up at the floating hero, medium-close',
    texture: 'glossy premium 3D-render finish, polished and playful',
    color: 'the palette is the gradient and the floating accents — saturated and joyful',
  },
  cinematic: {
    composition: 'FILM-STILL framing: subject off-center on a rule-of-thirds point, layered depth (foreground blur, subject, deep background) — a frame from a movie, not a posed photo',
    background: 'a real suggested place with atmospheric depth and darker vignetted edges',
    light: 'MOODY directional light: deep shadows and ONE strong key source; cinematic contrast',
    camera: 'LOW angle, anamorphic widescreen feel, subject at medium distance',
    texture: 'cinematic grain and rich contrast over the feed\'s illustration technique',
    color: 'the palette desaturates into the scene; ONE accent element glows against the mood',
  },
  luxury: {
    composition: 'stately, perfectly centered hero with generous DARK negative space — the composition whispers money',
    background: 'a dark elegant backdrop (deep palette tone) with a subtle reflective floor under the hero',
    light: 'ONE single dramatic spotlight pool from above; the rest falls into elegant darkness',
    camera: 'eye-level, medium-close, absolutely still and symmetrical',
    texture: 'polished, expensive, flawless — silk, glass, metal and matte perfection',
    color: 'dark palette tones dominate; the accent appears ONLY as precious small highlights',
  },
  pop: {
    composition: 'BOLD GRAPHIC POSTER: oversized flat shapes, halftone bursts and a subject that breaks the frame edges — designed, not photographed',
    background: 'flat blocks and graphic patterns of saturated brand-palette colors',
    light: 'FLAT graphic light — hard shape shadows only, NO realistic light gradients',
    camera: 'straight-on FRONTAL framing with graphic-design geometry — no photographic perspective',
    texture: 'flat vector / pop-art finish with bold outlines and print texture',
    color: 'maximum saturation of the palette, aggressive color blocking, high contrast',
  },
  lifestyle: {
    composition: 'CANDID documentary framing: the subject is caught mid-action with natural asymmetry — a real moment, not a pose',
    background: 'a believable everyday place of the trade, softly out of focus behind the action',
    light: 'warm natural WINDOW light, golden and soft, late-afternoon feeling',
    camera: 'eye-level medium shot, as if a friend took the picture',
    texture: 'the feed\'s illustration technique with a warm, photographic softness',
    color: 'the palette is woven into clothes, objects and walls of the real place — never a flat backdrop',
  },
  duo_split: {
    composition: 'DIPTYCH: the frame splits into TWO clear halves showing two moments (before/after) of the same scene — the contrast IS the composition',
    background: 'two contrasting simple settings, one per half, aligned so the halves mirror each other',
    light: 'the LEFT half is flatter and duller; the RIGHT half is brighter and warmer — the improvement reads in the light itself',
    camera: 'IDENTICAL angle and distance in both halves — only the moment changes',
    texture: 'consistent illustration finish across both halves — same technique, same character',
    color: 'the same palette in both halves, visibly richer and more saturated on the "after" side',
  },
  typo: {
    composition: 'TYPOGRAPHIC poster: VAST empty space with ONE small visual anchor tucked in a corner — minimalism as composition',
    background: 'a paper-like textured flat background in a LIGHT brand-palette tone, nothing else',
    light: 'NO directional light at all — flat even poster light',
    camera: 'straight-on frontal, zero perspective',
    texture: 'editorial print finish with subtle paper grain',
    color: 'almost everything is the one light palette tone; the accent is a single small note',
  },
  tech: {
    composition: 'sleek DIAGONAL tech composition: the subject rests on a glowing surface, dynamic and precise',
    background: 'a dark futuristic gradient with a soft neon glow in the palette accent',
    light: 'rim light tracing the subject plus the accent glow — high-tech contrast',
    camera: 'low three-quarter angle, close and confident',
    texture: 'glass, metal and glossy digital surfaces with sharp reflections',
    color: 'a dark base where the palette accent IS the light itself',
  },
  action: {
    composition: 'HANDS-IN-FRAME action moment: the work is being done RIGHT NOW — tools in hand, task mid-gesture',
    background: 'the trade\'s real workspace, minimal and softly blurred',
    light: 'bright practical light coming from the workspace itself',
    camera: 'over-the-shoulder or close action distance — inside the task, not watching it',
    texture: 'energetic and crisp, with a hint of motion blur ONLY on the moving hands',
    color: 'the palette lives in the tools, the apron/wardrobe and the workspace details',
  },
  corporate: {
    composition: 'CLEAN CORPORATE EDITORIAL: the subject plus geometric brand shapes in an ordered, grid-like composition — an annual-report cover, not a casual snapshot',
    background: 'a bright minimal office wash OR flat geometric brand shapes — extremely tidy, zero clutter',
    light: 'bright, even, corporate daylight — no mood, no drama, total clarity',
    camera: 'eye-level medium shot, straight and confident',
    texture: 'polished, vector-clean corporate illustration finish',
    color: 'the palette works as corporate identity: shapes, wardrobe and signage in exact brand tones',
  },
  miniature: {
    composition: 'a TINY DIORAMA WORLD: the subject inside a miniature model scene with toy-scale props — a tilt-shift daydream',
    background: 'a miniature model set (tiny furniture, tiny plants, tiny signs) built around the subject',
    light: 'bright, even, toy-like light with soft tiny shadows',
    camera: 'HIGH angle looking down into the miniature world',
    texture: 'clay / paper / toy-model render finish — handmade miniature feeling',
    color: 'candy-bright palette tones, cheerful and saturated',
  },
  premium_generic: {
    composition: 'premium editorial composition: ONE hero subject, deliberate asymmetry and generous negative space',
    background: 'one simple palette-toned setting, completely uncluttered',
    light: 'soft directional daylight with gentle, natural shadows',
    camera: 'eye-level medium shot, the subject large and clear',
    texture: 'the feed\'s exact illustration technique with a premium, polished finish',
    color: 'the palette leads the whole scene: background, props and wardrobe in its tones',
  },
};

// Códigos del catálogo → familia de dirección. Cubre la unión de
// INTENT_STYLES de las intenciones que el demo asigna (promo, tips,
// testimonio, lanzamiento, producto) + los códigos corporativos/de
// rubro que el pool del demo alcanza (profesionales/contenido, arte…).
const ART_DIRECTION_BY_CODE = {
  '/flatlay': 'flatlay', '/knolling': 'flatlay', '/ingredientflat': 'flatlay', '/anatomy': 'flatlay',
  '/product': 'studio', '/packshot': 'studio', '/productad': 'studio', '/premium': 'studio', '/mockup': 'studio', '/360view': 'studio', '/heroshot': 'studio',
  '/macro': 'macro',
  '/levitate': 'levitation', '/floating': 'levitation', '/splash': 'levitation', '/packaging': 'levitation',
  '/cinematic': 'cinematic', '/movieposter': 'cinematic', '/billboard': 'cinematic', '/ad': 'cinematic', '/neon': 'cinematic',
  '/luxury': 'luxury', '/gold': 'luxury',
  '/popart': 'pop', '/gianttype': 'pop', '/couponburst': 'pop', '/poster': 'pop', '/infographic': 'pop',
  '/lifestyle': 'lifestyle', '/cozy': 'lifestyle', '/happyclient': 'lifestyle', '/ownerportrait': 'lifestyle',
  '/ugcselfie': 'lifestyle', '/ugcreview': 'lifestyle', '/ugchand': 'lifestyle', '/ugcvideocall': 'lifestyle',
  '/beforeafter': 'duo_split', '/ugcbeforeafter': 'duo_split',
  '/quote': 'typo',
  '/techad': 'tech', '/futuristic': 'tech',
  '/unboxing': 'action', '/timelapse': 'action', '/assemblyguide': 'action', '/workspace': 'action', '/chefaction': 'action', '/handsatwork': 'action',
  '/clay': 'miniature', '/legoify': 'miniature', '/miniatureworld': 'miniature', '/papercraft': 'miniature',
  '/isometric': 'miniature', '/actionfigure': 'miniature', '/dollhouse': 'miniature', '/crystal': 'miniature',
  '/candyversion': 'miniature', '/popup': 'miniature', '/toydoll': 'miniature', '/tinyhumans': 'miniature',
  '/branding': 'corporate',
};

// Familia por vocabulario del código/nombre/prompt — para los códigos
// del catálogo completo (202 + rubros) que el mapa exacto no lista:
// la dirección sigue siendo COMPLETA y de su familia, nunca un vacío.
function artFamilyFor(style) {
  const code = String((style && style.code) || (typeof style === 'string' ? style : '') || '').toLowerCase();
  if (code && ART_DIRECTION_BY_CODE[code]) return ART_DIRECTION_BY_CODE[code];
  const name = String((style && style.name) || '').toLowerCase();
  const pr = String((style && style.prompt) || '').toLowerCase();
  const t = `${code} ${name} ${pr}`;
  if (/before/.test(t) && /after|despu/.test(t)) return 'duo_split';
  if (/flat[ -]?lay|knolling|cenital|top[ -]?down/.test(t)) return 'flatlay';
  if (/macro|close[ -]?up|detalle extremo/.test(t)) return 'macro';
  if (/levitat|floating|flot|splash/.test(t)) return 'levitation';
  if (/cinematic|cinematogr|movie|film|noir|neon|billboard|cartelera/.test(t)) return 'cinematic';
  if (/luxury|lujo|gold|premium elegant|elegante oscuro/.test(t)) return 'luxury';
  if (/pop|poster|póster|infographic|infograf|graphic|gr[aá]fic|collage|magazine|revista|editorial/.test(t)) return 'pop';
  if (/quote|frase|tipograf|typograph/.test(t)) return 'typo';
  if (/tech|futur|digital|cyber/.test(t)) return 'tech';
  if (/unboxing|assembly|timelapse|workspace|escritorio|hands at work|manos/.test(t)) return 'action';
  if (/ugc|lifestyle|estilo de vida|cozy|acogedor|client|owner|portrait|retrato|candid/.test(t)) return 'lifestyle';
  if (/brand|corpor|identidad|oficina|office|juntas|lobby|jur[ií]d|legal|biblioteca|consult|profes|prof-/.test(t)) return 'corporate';
  if (/clay|lego|miniatur|papercraft|paper|isometric|toy|doll|diorama/.test(t)) return 'miniature';
  if (/product|packshot|studio|estudio|mockup|hero|catalog|cat[aá]logo/.test(t)) return 'studio';
  return 'premium_generic';
}

let _getStyleSafe = null;
function styleOf(style) {
  if (style && typeof style === 'object') return style;
  try {
    if (!_getStyleSafe) _getStyleSafe = require('./image-styles').getStyle;
    return _getStyleSafe(style) || null;
  } catch (e) { return null; }
}

// El bloque de dirección de arte que se inyecta en el prompt final:
// completo (las 6 dimensiones) + la firma del estilo del catálogo.
// Va DESPUÉS del brief y del fragmento de estilo y ANTES de las
// directivas duras: manda sobre todo lo anterior.
function artDirectionFor(style) {
  const st = styleOf(style);
  const code = String((st && st.code) || (typeof style === 'string' ? style : '') || '');
  const fam = artFamilyFor(st || style);
  const d = ART_DIRECTIONS[fam] || ART_DIRECTIONS.premium_generic;
  const name = (st && st.name) || code || 'estilo del posteo';
  return [
    `ART DIRECTION — "${name}"${code ? ` (${code})` : ''} — THIS DIRECTION GOVERNS THE LOOK OF THIS IMAGE. Compose, light and render the scene EXACTLY under this direction (always inside the feed's illustration style and with the brand character as protagonist). Only the HARD RULES that come after this block (palette hex, treatment, composition formula, concept prohibitions) may override it — the brief above may NOT soften it into a generic scene:`,
    `- Composition grammar: ${d.composition}.`,
    `- Background system: ${d.background}.`,
    `- Light: ${d.light}.`,
    `- Camera: ${d.camera}.`,
    `- Texture / medium: ${d.texture}.`,
    `- Color usage: ${d.color}.`,
    st && st.prompt ? `- Style signature (from the catalog): ${st.prompt}` : null,
  ].filter(Boolean).join('\n');
}

// ---------- 2d) QA VISUAL con reintento (v205) ----------
// La garantía dura que faltaba: la definición anti-calesita subía la
// probabilidad, no la garantizaba (en v203 la calesita cayó 1 vez
// pese al NEVER). Ahora CADA pieza IA del demo pasa UN chequeo de
// visión barato (gpt-4o-mini, la misma infra del clasificador) contra
// su brief ANTES de componer el titular:
//   (a) CONCEPTO: el objeto-concepto esperado está y NINGÚN elemento
//       prohibido por su definición (las NEVER del mapa) aparece.
//   (b) SIN TEXTO: la escena cruda no trae texto renderizado por el
//       modelo (el vicio de Nano Banana: agrega palabras en inglés).
//       El titular lo compone el código DESPUÉS — en la imagen cruda
//       no puede haber ni una palabra legible.
//   (c) TRATAMIENTO: el tratamiento asignado se materializó (un fondo
//       pleno se distingue de una escena; un póster, de una foto).
// Si falla → el llamador regenera UNA vez con qaRetryDirective y se
// queda con la mejor. Si el chequeo mismo falla (red/parseo) → null:
// la pieza se conserva sin QA (el demo nunca se rompe por el control).
const QA_MODEL = 'gpt-4o-mini';

const TREATMENT_QA_EXPECT = {
  flat: 'FLAT STUDIO: the background is ONE flat solid color filling the ENTIRE frame — zero environment (no room, no windows, no furniture, no floor), the character enormous in close-up (70-80% of the frame height)',
  poster: 'GRAPHIC POSTER: a flat graphic design (flat shapes and blocks, not a scene or a place), the character SMALL (at most ~25% of the frame height) or inside a clean circular medallion',
  duo: 'DUO: the character interacts with ONE human person from its trade (handing something over, explaining, celebrating together) and stays a protagonist of the pair',
  workspace: 'WORKSPACE: a MEDIUM SHOT of the character DOING its job with its main tool (tablet/laptop/phone) front and center, with a MINIMAL environment (one desk surface, plain soft backdrop)',
  prop: 'PROP SCENE: the character is a big CLOSE-UP protagonist (60-70% of the frame height) with ONE single large concept object and a very soft, blurred, simple background',
};

// Qué tiene que verificar el QA de una pieza: el concepto esperado
// (del mapa tema→objeto; si el tema no mapea, el tema mismo) y la
// expectativa de su tratamiento.
function qaBriefFor(topicText, treatment) {
  const concept = conceptObjectFor(topicText);
  const t = TREATMENT_ORDER.includes(treatment) ? treatment : 'prop';
  return {
    concept: concept || `one large object or scene element that clearly embodies this post's theme: "${String(topicText || '').slice(0, 120)}"`,
    conceptDefined: !!concept,
    treatment: t,
    treatmentExpect: TREATMENT_QA_EXPECT[t],
  };
}

function parseQaContent(text) {
  try {
    const j = JSON.parse(String(text || ''));
    if (!j || typeof j !== 'object') return null;
    const concept_ok = j.concepto_ok === true;
    const no_text = j.sin_texto === true;
    const treatment_ok = j.tratamiento_ok === true;
    const failures = [];
    if (!concept_ok) failures.push('concept');
    if (!no_text) failures.push('text');
    if (!treatment_ok) failures.push('treatment');
    return {
      concept_ok, no_text, treatment_ok,
      passed: failures.length === 0,
      score: (concept_ok ? 1 : 0) + (no_text ? 1 : 0) + (treatment_ok ? 1 : 0),
      failures,
      detalle: String(j.detalle || '').slice(0, 300),
    };
  } catch (e) { return null; }
}

const QA_SYSTEM = [
  'Sos el control de calidad de las piezas ILUSTRADAS de una agencia. Mirás la imagen CRUDA generada por IA (todavía SIN el titular, que se compone después por código) y la evaluás contra su brief. Respondé SOLO un JSON válido, sin markdown:',
  '{"concepto_ok":true,"sin_texto":true,"tratamiento_ok":true,"detalle":"una frase concreta nombrando un elemento visible"}',
  '- concepto_ok: la imagen muestra CLARAMENTE el concepto esperado que te paso (el objeto-concepto presente y reconocible) y NO contiene NINGÚN elemento que la definición del concepto prohíba expresamente (si la definición dice NEVER / never / no debe aparecer X, y X aparece → false). Si aparece el objeto EQUIVOCADO o una lectura literal errónea del tema → false.',
  '- sin_texto: la imagen NO contiene texto renderizado: ni palabras, ni letras sueltas formando palabras, ni carteles/letreros con texto, ni texto en pantallas, ni marcas de agua con palabras. El titular va DESPUÉS por código: en esta imagen cruda no puede haber NI UNA palabra legible en ningún idioma. Formas abstractas o íconos sin letras → eso no es texto.',
  '- tratamiento_ok: el tratamiento visual asignado se MATERIALIZÓ según la expectativa que te paso — si la imagen se parece a otro tratamiento (ej.: pedían fondo pleno y salió una escena con ambiente) → false.',
].join('\n');

// Chequea UNA pieza cruda (b64 sin componer). Devuelve
// {passed, score, failures, detalle, concept, treatmentExpect} o null
// si el chequeo no se pudo hacer. fetchImpl = costura de test.
async function qaDemoPiece({ b64, topicText, treatment, apiKey, fetchImpl } = {}) {
  if (!apiKey || !b64) return null;
  const brief = qaBriefFor(topicText, treatment);
  const doFetch = fetchImpl || fetch;
  try {
    const r = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: QA_MODEL,
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: QA_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Concepto esperado: ${brief.concept}\nTratamiento esperado: ${brief.treatmentExpect}\nEvaluá esta imagen contra ese brief.` },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!fetchImpl) {
      try { costs.trackUsage({ feature: 'demo-ai-qa', model: QA_MODEL, json: j }); } catch (e) {}
    }
    const content = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    const parsed = parseQaContent(content);
    if (!parsed) return null;
    return { ...parsed, concept: brief.concept, treatmentExpect: brief.treatmentExpect };
  } catch (e) {
    return null;
  }
}

// Directiva REFORZADA para la única regeneración tras un QA fallido:
// nombra en imperativo exactamente qué falló y cómo se corrige.
function qaRetryDirective(qa) {
  if (!qa || !Array.isArray(qa.failures) || !qa.failures.length) return '';
  const fixes = [];
  if (qa.failures.includes('concept')) {
    fixes.push(`CONCEPT: the scene MUST clearly show exactly this: ${qa.concept}. Remove any wrong or literally-misread object — if the concept definition prohibits something (NEVER...), it MUST NOT appear in any form.`);
  }
  if (qa.failures.includes('text')) {
    fixes.push('NO TEXT: absolutely NO rendered text anywhere — no words, no letters, no signs, no labels, no text on screens, no watermark words, in ANY language. A completely clean scene: the headline is composited afterwards by code.');
  }
  if (qa.failures.includes('treatment')) {
    fixes.push(`TREATMENT: the assigned treatment MUST be unmistakable this time: ${qa.treatmentExpect}.`);
  }
  return [
    'QA RETRY — the previous version of this image FAILED visual quality control. Regenerate the scene fixing EXACTLY these failures, keeping everything else (same character, same palette, same art direction) the same:',
    ...fixes.map((f) => '- ' + f),
  ].join('\n');
}

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

// ---------- 3c-bis) QA DEL TEXTO COMPUESTO (v209: 4º chequeo) ----------
// El QA de la pieza cruda (qaDemoPiece) mira la imagen ANTES del titular.
// Este chequeo mira la pieza TERMINADA: ¿el titular compuesto por código
// tapa una cara, los ojos o el producto/personaje protagonista? Es la
// versión IA de la regla "el texto nunca pelea con la foto" (en la ruta
// de fotos la cumple el selector de zonas de demo_render.py). Si falla,
// el server recompone en la zona opuesta (ese es el reintento de la
// pieza; la imagen NO se regenera). Fail-open como el resto del QA:
// null = sin veredicto (red/caída) y la pieza sigue su curso.
const QA_COMPOSED_SYSTEM = [
  'You are a strict visual QA reviewer for a finished Instagram post image.',
  'The image already has a software-composited headline (large bold text with a small colored bar) placed in ONE zone: the TOP or the BOTTOM (the user message tells you which).',
  'Judge ONLY this question: does the composited headline text (or its colored bar) overlap or cover a FACE, EYES, or the MAIN SUBJECT (the central character, person, product or hero object of the scene)?',
  'Covering background, sky, floor, walls or empty space is FINE. Partially touching hair, shoulders or clothing edges is FINE. Covering any part of a face, an eye, or the hero product/character body is a FAIL.',
  'Return ONLY a JSON object: {"texto_no_tapa": true|false, "detalle": "<short reason, max 15 words>"}. No markdown, no prose outside the JSON.',
].join(' ');

function parseComposedQaContent(content) {
  let txt = String((content && content.trim()) || '');
  if (!txt) return null;
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let j = null;
  try { j = JSON.parse(txt); } catch (e) {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { j = JSON.parse(m[0]); } catch (e2) { /* cae a null */ } }
  }
  if (!j || typeof j !== 'object') return null;
  if (typeof j.texto_no_tapa !== 'boolean') return null;
  return { passed: j.texto_no_tapa, detalle: String(j.detalle || '').slice(0, 200) };
}

async function qaComposedText({ b64, zone, apiKey, fetchImpl } = {}) {
  try {
    if (!b64 || !apiKey) return null;
    const doFetch = fetchImpl || fetch;
    const z = zone === 'bottom' ? 'BOTTOM' : 'TOP';
    const r = await doFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: 'system', content: QA_COMPOSED_SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: `The composited headline is in the ${z} zone of this image. Does it cover a face, eyes, or the main subject? Answer with the JSON only.` },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!r || !r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!fetchImpl && j && j.usage) {
      try {
        costs.logApiCost({
          feature: 'demo-ai-qa', model: 'gpt-4o-mini',
          inTokens: (j.usage.prompt_tokens | 0) || 0,
          outTokens: (j.usage.completion_tokens | 0) || 0,
        });
      } catch (e) { /* medir nunca rompe */ }
    }
    const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return parseComposedQaContent(content);
  } catch (e) {
    return null;
  }
}

// ---------- 4) Composite del titular + JPEG final ----------
// La IA genera la escena LIMPIA (sin texto); el titular lo compone el
// código con composite-headline.py — el mismo del pipeline real — y la
// pieza final sale JPEG 1080x1350 como las de plantilla.
function compositeDemoPiece({ b64, headline, gradeHex, workDir, index, headlineScale, inkHex, zone }) {
  return new Promise((resolve) => {
    try {
      const dir = workDir || os.tmpdir();
      const raw = path.join(dir, `ai-${index}-raw.png`);
      const fin = path.join(dir, `ai-${index}.png`);
      const jpg = path.join(dir, `ai-${index}.jpg`);
      fs.writeFileSync(raw, Buffer.from(String(b64 || ''), 'base64'));
      const args = [COMPOSITE_SCRIPT, '--in', raw, '--headline', String(headline || ''), '--out', fin];
      if (gradeHex) args.push('--grade', String(gradeHex));
      // v203: piezas de fondo plano/gráficas (FLAT STUDIO, GRAPHIC
      // POSTER) llevan el titular en tinta oscura de su paleta, sin el
      // scrim oscuro de las piezas de escena.
      if (inkHex) args.push('--ink', String(inkHex));
      // v202: si la fórmula del feed pide titulares grandes, el composite
      // usa la escala mayor (el auto-fit del script sigue garantizando
      // que el titular entre sin cortarse).
      if (headlineScale && Number(headlineScale) > 1) args.push('--scale', String(headlineScale));
      // (v209) Zona del titular: 'bottom' cuando el QA de texto compuesto
      // (qaComposedText) detectó que arriba tapa al sujeto.
      if (zone === 'bottom') args.push('--zone', 'bottom');
      execFile('python3', args, { timeout: 30000 }, (err) => {
        if (err) return resolve(null);
        const conv = 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB")\nim = im.resize((1080, 1350), Image.LANCZOS)\nim.save(sys.argv[2], "JPEG", quality=92)\n';
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
  TREATMENT_ORDER,
  TREATMENT_NAMES,
  treatmentForStyle,
  assignTreatments,
  paletteDirectives,
  flatBgHexFor,
  compositionDirectives,
  pickSharpestRef,
  REF_NOTE,
  SCENE_ROLES,
  NANO_MODEL,
  NANO_USD_PER_IMAGE,
  extractGeminiImageB64,
  genNanoImage,
  generateDemoPieceImage,
  ART_DIRECTIONS,
  ART_DIRECTION_BY_CODE,
  artFamilyFor,
  artDirectionFor,
  QA_MODEL,
  TREATMENT_QA_EXPECT,
  qaBriefFor,
  parseQaContent,
  qaDemoPiece,
  qaRetryDirective,
  qaComposedText,
  parseComposedQaContent,
  QA_COMPOSED_SYSTEM,
  replacePiecesWithAi,
  compositeDemoPiece,
};
