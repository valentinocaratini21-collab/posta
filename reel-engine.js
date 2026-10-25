// Motor de reels v2 — Posta (2026-10-17, v181)
// Reemplaza al slideshow viejo de video.js en el camino SEMANAL
// (story-reel.generateWeekExtras). Por qué existe: la auditoría de la
// Fase 0 (2026-10-17) verificó que el reel semanal salía SIN audio
// (ffprobe: un solo stream h264), con el caption volcado como UNA línea
// que se salía de cuadro por ambos lados (ilegible en los 4 frames),
// 4 escenas fijas de 4s con zoom ±12% alternado, sin gancho, sin cierre
// con CTA/@ y usando las imágenes 4:5 del feed ya compuestas.
//
// Este motor produce un reel que compite en el feed:
// - 1080×1920 (9:16), 30 fps, 8–14 s, H.264 + AAC, faststart.
// - Material: primero los VIDEOS del álbum del cliente (recorte central,
//   crop 9:16); si no hay, 3–5 fotos (posteos + álbum + stock del rubro).
// - Ritmo: cortes cada ~2–3,4 s; movimientos smoothstep ALTERNADOS
//   (push-in, pan, push-out) — nunca un solo zoom eterno.
// - Texto compuesto por CÓDIGO (no por la IA), por tiempos: gancho en el
//   frame 0 (0–2,6 s, zona segura superior), beat intermedio, cierre con
//   CTA + @ del negocio (últimos 2 s). Montserrat 800, colores de marca
//   del cliente, caja de texto con alfa según la LUMINANCIA real de la
//   zona (misma filosofía que composite-headline.py).
// - Música SIEMPRE: pistas CC0 de assets/music/ (ver REELS-MUSIC.md),
//   normalizadas a −14 LUFS al empaquetarlas. Si el video del cliente
//   trae audio propio, se mezcla ATENUADO (0.22) bajo la música: la cama
//   musical es identidad del reel, el ambiente aporta autenticidad.
// - Si este motor falla, story-reel cae al camino viejo (fallback):
//   un reel mediocre es mejor que ninguno.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const W = 1080;
const H = 1920;
const FPS = 30;
const MUSIC_DIR = path.join(__dirname, 'assets', 'music');

// mood → archivos dentro de assets/music (licencias en REELS-MUSIC.md)
// (Gap 8, 2026-10-25) El catálogo pasó de 3 pistas únicas a 15 (5 por
// mood): con UNA pista por mood, todos los reels de un rubro sonaban
// igual. La primera de cada lista es la histórica (compatibilidad).
const MUSIC_CATALOG = {
  upbeat: ['upbeat.mp3', 'upbeat-hop.mp3', 'upbeat-lalalatown.mp3', 'upbeat-challenge.mp3', 'upbeat-bicycle.mp3'],
  chill: ['chill.mp3', 'chill-beach.mp3', 'chill-the-beach.mp3', 'chill-chocolate-valley.mp3', 'chill-childhood.mp3'],
  groove: ['groove.mp3', 'groove-cat-city.mp3', 'groove-space-mtv.mp3', 'groove-fruitcore.mp3', 'groove-strawberry.mp3'],
};
// Compatibilidad: MUSIC_TRACKS sigue siendo mood → pista principal.
const MUSIC_TRACKS = Object.fromEntries(Object.entries(MUSIC_CATALOG).map(([m, l]) => [m, l[0]]));
const RUBRO_MOOD = {
  cafeteria: 'chill', panaderia: 'chill', belleza: 'chill', deco: 'chill', floreria: 'chill',
  barberia: 'groove', moda: 'groove', mascotas: 'groove', heladeria: 'groove',
  gastronomia: 'upbeat', pizzeria: 'upbeat', fitness: 'upbeat',
};

function resolveFontFile() {
  const cands = [
    path.join(__dirname, 'fonts', 'Montserrat-800.ttf'),
    path.join(__dirname, 'assets', 'fonts', 'Montserrat-Bold.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return cands[0];
}
const FONT = resolveFontFile();

function runFfmpeg(args, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const lines = String(stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
        return reject(new Error('ffmpeg: ' + ((lines.slice(-2).join(' · ') || err.message).slice(0, 300))));
      }
      resolve(stdout);
    });
  });
}

function probe(file) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-show_entries', 'format=duration', '-of', 'json', file],
      { timeout: 30000 }, (err, stdout) => {
        if (err) return resolve(null);
        try { resolve(JSON.parse(stdout)); } catch (e) { resolve(null); }
      });
  });
}

async function mediaInfo(file) {
  const p = await probe(file);
  if (!p) return null;
  const streams = p.streams || [];
  const v = streams.find(s => s.codec_type === 'video');
  return {
    duration: Number((p.format && p.format.duration) || 0) || 0,
    hasAudio: streams.some(s => s.codec_type === 'audio'),
    width: v ? v.width : 0,
    height: v ? v.height : 0,
  };
}

// ---------- (Gap 4 + Gap 11, 2026-10-25) FOCO Y MEJOR FRAME ----------
// El crop 9:16 era central y ciego: un sujeto a un costado de un video
// horizontal quedaba afuera. detectFocus mide el FOCO real del material
// (centroide de la energía de bordes sobre un frame chico en grises,
// determinístico, sin IA) y el crop lo sigue. bestFrameTimeIn elige el
// mejor instante de un video con el medidor de fotos de la casa
// (photo-quality.py): mayor nitidez entre frames con luz sana.
async function frameGray(file, { isVideo = false, tSec = 0, width = 96 } = {}) {
  const args = [];
  if (isVideo) args.push('-ss', String(Math.max(0, tSec)));
  args.push('-i', file, '-vf', `scale=${width}:-2`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1');
  const buf = await new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-v', 'error', ...args], { timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout) => err ? reject(err) : resolve(stdout));
  });
  if (!buf || buf.length < width * 4) return null;
  return { buf, w: width, h: Math.floor(buf.length / width) };
}
function focusFromGray({ buf, w, h }) {
  const colE = new Float64Array(w);
  const rowE = new Float64Array(h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const e = Math.abs(buf[i + 1] - buf[i - 1]) + Math.abs(buf[i + w] - buf[i - w]);
      if (e) { colE[x] += e; rowE[y] += e; }
    }
  }
  const centroid = (arr) => {
    let max = 0, tot = 0, sum = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
    if (!max) return null;
    const thr = max * 0.25;
    for (let i = 0; i < arr.length; i++) {
      const v = Math.max(0, arr[i] - thr);
      tot += v; sum += v * i;
    }
    return tot > 0 ? (sum / tot) / Math.max(1, arr.length - 1) : null;
  };
  const cx = centroid(colE);
  const cy = centroid(rowE);
  if (cx === null && cy === null) return null;
  const clamp = (v) => Math.min(0.8, Math.max(0.2, v));
  return { x: cx === null ? 0.5 : clamp(cx), y: cy === null ? 0.5 : clamp(cy), energy: colE.reduce((a, b) => a + b, 0) };
}
async function detectFocus(file, { isVideo = false, duration = 0 } = {}) {
  try {
    const times = isVideo && duration > 2 ? [0.25, 0.5, 0.75].map(f => duration * f) : [isVideo ? duration / 2 : 0];
    let wx = 0, wy = 0, we = 0;
    for (const t of times) {
      const g = await frameGray(file, { isVideo, tSec: t });
      if (!g) continue;
      const f = focusFromGray(g);
      if (!f || !f.energy) continue;
      wx += f.x * f.energy; wy += f.y * f.energy; we += f.energy;
    }
    if (!we) return { x: 0.5, y: 0.5 };
    return { x: Math.round((wx / we) * 100) / 100, y: Math.round((wy / we) * 100) / 100 };
  } catch (e) { return { x: 0.5, y: 0.5 }; }
}
function cropFocusExpr(fx, fy) {
  const x = typeof fx === 'number' ? fx : 0.5;
  const y = typeof fy === 'number' ? fy : 0.5;
  return `crop=${W}:${H}:x='(iw-ow)*${x}':y='(ih-oh)*${y}'`;
}
function measureFrameQuality(absJpg) {
  return new Promise((resolve) => {
    execFile('python3', [path.join(__dirname, 'photo-quality.py'), absJpg], { timeout: 20000 }, (err, stdout) => {
      if (err) return resolve(null);
      try { const j = JSON.parse(String(stdout || '').trim()); resolve(j && !j.error ? j : null); }
      catch (e) { resolve(null); }
    });
  });
}
// Mejor instante de un video: muestrea N frames, los mide y elige el de
// mayor nitidez entre los de luz sana (lum ≥ 38, el umbral de la casa);
// si ninguno tiene luz sana, el de mayor nitidez y listo.
async function bestFrameTimeIn(file, duration, { samples = 5, tmpDir } = {}) {
  if (!tmpDir || !duration) return null;
  const fracs = samples <= 3 ? [0.25, 0.5, 0.75] : [0.1, 0.3, 0.5, 0.7, 0.9];
  const frames = [];
  for (let i = 0; i < fracs.length; i++) {
    const t = Math.max(0.1, duration * fracs[i]);
    const fAbs = path.join(tmpDir, `bf-${i}.jpg`);
    const okF = await new Promise((resolve) => {
      execFile('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-q:v', '4', fAbs],
        { timeout: 30000 }, (err) => resolve(!err && fs.existsSync(fAbs)));
    });
    if (okF) frames.push({ t, metrics: await measureFrameQuality(fAbs) });
  }
  if (!frames.length) return null;
  const lit = frames.filter(f => f.metrics && typeof f.metrics.lum === 'number' && f.metrics.lum >= 38);
  const pool = lit.length ? lit : frames;
  let best = pool[0];
  for (const f of pool) {
    if ((f.metrics && f.metrics.edge || 0) > (best.metrics && best.metrics.edge || 0)) best = f;
  }
  return best;
}

// Luminancia media (0–255) de una banda de la imagen/fotograma: decide el
// alfa de la caja de texto, igual que composite-headline.py con el titular.
async function zoneLuminance(file, { isVideo = false, tSec = 0, yFrac = 0.1, hFrac = 0.35 } = {}) {
  try {
    const args = [];
    if (isVideo) args.push('-ss', String(Math.max(0, tSec)));
    args.push('-i', file, '-vf', `crop=w='iw':h='ih*${hFrac}':x=0:y='ih*${yFrac}',scale=1:1`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1');
    const buf = await new Promise((resolve, reject) => {
      execFile('ffmpeg', ['-v', 'error', ...args], { timeout: 30000, maxBuffer: 1024, encoding: 'buffer' }, (err, stdout) => err ? reject(err) : resolve(stdout));
    });
    if (!buf || buf.length < 3) return 128;
    return 0.299 * buf[0] + 0.587 * buf[1] + 0.114 * buf[2];
  } catch (e) { return 128; }
}

function boxAlphaFor(lum) {
  if (lum < 90) return 0.38;
  if (lum < 150) return 0.52;
  if (lum < 200) return 0.64;
  return 0.74;
}

// Parte texto en líneas sin cortar palabras (drawtext no hace wrap).
function wrapLines(text, maxChars, maxLines) {
  const clean = String(text || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (t.length > maxChars && cur) { lines.push(cur); cur = w; if (lines.length === maxLines) { cur = ''; break; } }
    else cur = t;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

// Elige el tamaño MÁS GRANDE en el que el texto entra COMPLETO en maxLines
// líneas: un gancho jamás se corta a mitad de frase (si no entra a 88px,
// baja la fuente hasta que entre). Último recurso: tier menor con "…".
function fitText(text, tiers, maxLines) {
  const clean = String(text || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  for (const t of tiers) {
    const all = wrapLines(clean, t.ch, 99);
    if (all.length && all.length <= maxLines) return { lines: all, size: t.size, lh: t.lh };
  }
  const t = tiers[tiers.length - 1];
  const lines = wrapLines(clean, t.ch, maxLines);
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/[\s.]*$/, '') + '…';
  return { lines, size: t.size, lh: t.lh };
}

function validHex(h) {
  const s = String(h || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : null;
}

// Curva smoothstep (la receta de demo_video.py): s(u) = u²(3−2u).
function smoothExpr(frames) {
  const D = Math.max(1, frames - 1);
  const U = `(on/${D})`;
  return `(${U}*${U}*(3-2*${U}))`;
}

function photoMovement(idx, frames) {
  const S = smoothExpr(frames);
  const cx = 'iw/2-(iw/zoom/2)';
  switch (idx % 4) {
    case 0: return { z: `1+0.15*${S}`, x: cx, y: '(ih-ih/zoom)*0.42' };            // push-in
    case 1: return { z: '1.25', x: `(iw-iw/zoom)*${S}`, y: '(ih-ih/zoom)/2' };      // pan →
    case 2: return { z: `1.15-0.15*${S}`, x: cx, y: '(ih-ih/zoom)*0.42' };          // push-out
    default: return { z: '1.25', x: `(iw-iw/zoom)*(1-${S})`, y: '(ih-ih/zoom)/2' }; // pan ←
  }
}

// (Gap 8, 2026-10-25) Rotación DETERMINÍSTICA por seed: el llamador
// pasa `${uid}:${weekKey}` (+ salt) y la pista sale del hash — dos
// reels del mismo negocio en semanas seguidas no repiten pista, y el
// resultado es reproducible (auditable). SIN seed no hay azar: sale la
// pista histórica del mood (la primera del catálogo), para que todo
// render sin contexto de negocio sea reproducible tal cual.
function moodTracksFor(mood) {
  const list = MUSIC_CATALOG[mood] || MUSIC_CATALOG.upbeat;
  return list.map((f) => path.join(MUSIC_DIR, f)).filter((p) => fs.existsSync(p));
}
function pickMusicFile(mood, seed) {
  let tracks = moodTracksFor(mood);
  if (!tracks.length) {
    for (const m of Object.keys(MUSIC_CATALOG)) {
      tracks = moodTracksFor(m);
      if (tracks.length) break;
    }
  }
  if (!tracks.length) return null;
  if (seed === undefined || seed === null || seed === '') return tracks[0];
  const s = String(seed);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return tracks[h % tracks.length];
}

function moodForCategory(category, rubro) {
  if (rubro && RUBRO_MOOD[rubro]) return RUBRO_MOOD[rubro];
  return 'upbeat';
}

// =====================================================================
// MOTION v3 (2026-10-20) — render CON GUION (Fases 2/3/4 de
// spec-motion-v3.md). buildReelPro despacha acá SOLO si el llamador
// pasa script + captionPlan (story-reel con POSTY_REEL_SCRIPT=1); sin
// ellos el camino es el v2 de siempre, byte a byte (regresión cero).
//
// Diferencias contra v2:
// - Un segmento visual POR ESCENA del guion (reel-script.js), con las
//   duraciones del guion (10–20 s totales; el sweet spot es 15 s).
// - Transiciones xfade entre escenas (porte del patrón de reels.js)
//   con acrossfade en el audio ambiente; la duración de salida es
//   total − (N−1)·xf y TODOS los tiempos de texto se remapean a esa
//   línea de tiempo de salida (cada borde de escena se corre −xf).
// - Subtítulos CINÉTICOS: un drawtext por chunk de 2–4 palabras
//   (kinetic-captions.js), en la banda del plan (hook/cta arriba,
//   problema/solución abajo) — nunca en el centro, nunca fijos en
//   píxeles heredados: la Y sale de la banda.
// - PULIDO 2026-10-20 (feedback de Valentino: "el fondo de las
//   palabras se ve como un BORDADO" + "más efectos visuales, DE
//   PROMPTS" + "las fotos no pueden sentirse estáticas"): estilo de
//   subtítulos limpio SIN cajas (scrim con pluma de intensidad ÚNICA
//   por reel según la peor banda, texto con trazo+sombra, fades y
//   asentamiento por chunk, palabra clave del gancho en color de
//   marca medida al píxel); capa de EFECTOS POR PROMPT
//   (reel-effects.js: el prompt gobierna grado/overlays de la escena
//   y queda registrado en el resultado); movimientos VARIADOS por
//   escena con easing suave y parallax de dos capas; cierre con
//   pastilla de marca redondeada, halo que late y asentamiento.
//   Detalle y diagnóstico en el bloque PULIDO DE SUBTÍTULOS de
//   buildReelV3 y en reel-effects.js.
// - Cortes con snap al beat de la pista (music-beats.js, ±150 ms) si
//   la pista tiene grilla confiable; si no, duraciones del guion
//   intactas (declarado en el resultado: beatsSnapped).
// - Plantilla de motion por intención de venta (Fase 4): transición y
//   movimiento dominante según la intención; el guion no cambia.
// =====================================================================

const MOTION_TEMPLATES = {
  venta:     { transition: 'fade',      xf: 0.40, move: 'push-in' },
  reserva:   { transition: 'slideleft', xf: 0.45, move: 'pan' },
  consulta:  { transition: 'fade',      xf: 0.40, move: 'calm' },
  prueba:    { transition: 'fade',      xf: 0.20, move: 'dynamic' },
  // fadeblack: el fundido a negro breve es el corte editorial de las
  // piezas de autoridad (respira, separa actos). wipe/circle y demás
  // xfades de fantasía se evaluaron y se RECHAZARON: en reels de
  // negocios locales se leen como plantilla barata, no como dirección.
  autoridad: { transition: 'fadeblack', xf: 0.40, move: 'push-out' },
};
function templateFor(intent) {
  return MOTION_TEMPLATES[intent] || { transition: 'fade', xf: 0.4, move: 'cycle' };
}

function photoMovementFor(move, idx, frames) {
  const S = smoothExpr(frames);
  const S2 = smoothExpr2(frames);
  const cx = 'iw/2-(iw/zoom/2)';
  switch (move) {
    case 'push-in':  return { z: `1+0.15*${S}`, x: cx, y: `(ih-ih/zoom)*${idx % 2 ? 0.5 : 0.42}` };
    case 'push-out': return { z: `1.18-0.18*${S}`, x: cx, y: '(ih-ih/zoom)*0.42' };
    case 'pan':      return idx % 2
      ? { z: '1.25', x: `(iw-iw/zoom)*(1-${S})`, y: '(ih-ih/zoom)/2' }
      : { z: '1.25', x: `(iw-iw/zoom)*${S}`, y: '(ih-ih/zoom)/2' };
    case 'pan-r':    return { z: '1.25', x: `(iw-iw/zoom)*${S2}`, y: '(ih-ih/zoom)/2' };
    case 'pan-l':    return { z: '1.25', x: `(iw-iw/zoom)*(1-${S2})`, y: '(ih-ih/zoom)/2' };
    case 'calm':     return { z: `1+0.06*${S2}`, x: cx, y: '(ih-ih/zoom)/2' };
    case 'dynamic':  return idx % 2
      ? { z: '1.3', x: `(iw-iw/zoom)*${S}`, y: '(ih-ih/zoom)/2' }
      : { z: `1+0.22*${S}`, x: cx, y: '(ih-ih/zoom)*0.42' };
    default:         return photoMovement(idx, frames);
  }
}

// Smootherstep (Ken Perlin): u³(u(6u−15)+10) — easing más suave que el
// smoothstep en los extremos; se usa en paneos y en el parallax, donde
// el ojo más nota el arranque/frenada robóticos del zoom lineal.
function smoothExpr2(frames) {
  const D = Math.max(1, frames - 1);
  const U = `(on/${D})`;
  return `(${U}*${U}*${U}*((${U}*6-15)*${U}+10))`;
}

// MOVIMIENTO POR ESCENA (pulido 2026-10-20, precisión de Valentino:
// "las fotos no pueden sentirse estáticas"). photoMovementFor es el
// piso, no el techo: cada plantilla declara una SECUENCIA de
// movimientos y el plan garantiza (a) dos escenas seguidas NUNCA
// repiten movimiento, (b) parallax como máximo 2 veces por reel,
// (c) variedad real — paneos con smootherstep, push con anclas
// alternadas y parallax fondo/sujeto en las escenas marcadas.
const MOVE_SEQUENCES = {
  'push-in':  ['push-in', 'pan-r', 'parallax', 'push-in', 'pan-l', 'push-out'],
  'pan':      ['pan-l', 'parallax', 'pan-r', 'push-in', 'parallax', 'pan-l'],
  'calm':     ['calm', 'parallax', 'calm', 'pan-r', 'calm', 'parallax'],
  'dynamic':  ['dynamic', 'parallax', 'push-in', 'dynamic', 'pan-r', 'parallax'],
  'push-out': ['push-out', 'parallax', 'pan-l', 'push-out', 'calm', 'parallax'],
  'cycle':    ['push-in', 'pan-r', 'parallax', 'push-out', 'pan-l', 'parallax'],
};
function movementPlanFor(move, n) {
  const seq = MOVE_SEQUENCES[move] || MOVE_SEQUENCES.cycle;
  const plan = [];
  let parallaxCount = 0;
  for (let i = 0; i < n; i++) {
    let m = seq[i % seq.length];
    if (m === 'parallax') { parallaxCount++; if (parallaxCount > 2) m = (i % 2 ? 'pan-r' : 'push-in'); }
    if (i > 0 && plan[i - 1] === m) m = (m === 'pan-r' ? 'pan-l' : 'pan-r');
    if (i > 0 && plan[i - 1] === m) m = 'calm';
    plan.push(m);
  }
  return plan;
}

let _reelEffects = null;
function reelEffectsMod() {
  if (_reelEffects === null) { try { _reelEffects = require('./reel-effects'); } catch (e) { _reelEffects = false; } }
  return _reelEffects || null;
}

// ---------- Medición tipográfica exacta (para la palabra clave) ----------
// drawtext no expone el avance de un texto ajeno: para pintar SOLO la
// palabra clave del gancho en color de marca, alineada al píxel con
// el resto de su línea, se mide el avance real de cada segmento con
// el "truco del pipe": el avance de S = borde de tinta derecho de
// "S|" − borde de tinta derecho de "|" (la barra testigo cancela su
// propio bearing). Verificado: error ≤1 px contra la línea completa.
function ffmpegBuffer(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-v', 'error', ...args], { timeout: 30000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout) => err ? reject(err) : resolve(stdout));
  });
}
let _measureN = 0;
async function drawTextGray(text, size, tmpDir) {
  const wpx = Math.ceil(size * 1.05 * text.length) + 400;
  const hpx = Math.ceil(size * 2.2);
  const tf = path.join(tmpDir, `m${_measureN++}.txt`);
  fs.writeFileSync(tf, text, 'utf8');
  const buf = await ffmpegBuffer(['-f', 'lavfi', '-i', `color=black:s=${wpx}x${hpx}`,
    '-vf', `drawtext=fontfile='${FONT}':textfile='${tf}':fontsize=${size}:fontcolor=white:x=100:y=40,format=gray`,
    '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  return { buf, wpx, hpx };
}
function inkRightEdge(buf, w, h) {
  for (let x = w - 1; x >= 0; x--) for (let y = 0; y < h; y++) if (buf[y * w + x] > 40) return x;
  return -1;
}
const _advCache = new Map();
const _pipeCache = new Map();
async function measureAdvance(text, size, tmpDir) {
  const key = size + ':' + text;
  if (_advCache.has(key)) return _advCache.get(key);
  if (!_pipeCache.has(size)) {
    const r = await drawTextGray('|', size, tmpDir);
    _pipeCache.set(size, inkRightEdge(r.buf, r.wpx, r.hpx));
  }
  const r = await drawTextGray(text + '|', size, tmpDir);
  const adv = inkRightEdge(r.buf, r.wpx, r.hpx) - _pipeCache.get(size);
  _advCache.set(key, adv);
  return adv;
}

function normalizeWord(w) {
  return String(w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/* Palabra clave del gancho: primero la que coincide con un producto/
 * servicio real del fundamento (opts.keywords); si no hay match, la
 * palabra más larga (≥5 letras) del primer chunk del gancho. Una sola
 * por reel: el énfasis que se repite deja de ser énfasis. */
function findKeyword(chunks, keywords) {
  const kwTokens = new Set();
  for (const k of keywords || []) {
    for (const tok of String(k).split(/\s+/)) {
      const n = normalizeWord(tok);
      if (n.length >= 3) kwTokens.add(n);
    }
  }
  const hooks = (chunks || []).filter(c => c && c.role === 'hook' && !c.skip && c.fit);
  const eachWord = (fn) => {
    for (const rc of hooks) {
      for (let li = 0; li < rc.fit.lines.length; li++) {
        const line = rc.fit.lines[li];
        const re = /\S+/g;
        let m;
        while ((m = re.exec(line))) {
          const hit = fn(normalizeWord(m[0]), rc, li, m.index, m.index + m[0].length);
          if (hit) return hit;
        }
      }
    }
    return null;
  };
  const byDigest = eachWord((n, rc, li, s, e) => kwTokens.has(n) ? { chunk: rc, lineIdx: li, start: s, end: e } : null);
  if (byDigest) return byDigest;
  let best = null;
  eachWord((n, rc, li, s, e) => {
    if (n.length >= 5 && (!best || n.length > best.len)) best = { chunk: rc, lineIdx: li, start: s, end: e, len: n.length };
    return null;
  });
  return best;
}

// ---------- Activos gráficos del pulido (PNG en tmpDir) ----------
// Scrim de banda: negro con alfa en meseta sobre la zona del texto y
// pluma hacia el centro. UNA sola intensidad por reel (ver buildReelV3).
async function genScrimPng(tmpDir, peak, flip) {
  const out = path.join(tmpDir, flip ? 'scrim-bottom.png' : 'scrim-top.png');
  const vf = `format=rgba,geq=r=0:g=0:b=0:a='${peak}*(1-clip((Y-540)/260,0,1))'${flip ? ',vflip' : ''}`;
  await runFfmpeg(['-f', 'lavfi', '-i', 'color=black:s=1080x800', '-vf', vf, '-frames:v', '1', out]);
  return out;
}
// Banda de luz diagonal para el barrido (gaussiana suave, se anima la
// posición en el overlay; el alfa ya trae la forma). El alfa se
// ventana a CERO en los cuatro bordes del lienzo: sin eso, la cola de
// la gaussiana se corta en el borde del PNG y al entrar al cuadro se
// ve un escalón vertical de brillo (cazado en frames, 2026-10-20).
async function genSweepPng(tmpDir) {
  const out = path.join(tmpDir, 'sweep.png');
  const ss = (u) => `((${u})*(${u})*(3-2*(${u})))`;
  const win = `*${ss('clip(X/220,0,1)')}` + `*${ss('clip((1040-X)/220,0,1)')}` + `*${ss('clip(Y/280,0,1)')}` + `*${ss('clip((1707-Y)/280,0,1)')}`;
  await runFfmpeg(['-f', 'lavfi', '-i', 'color=white:s=1040x1707', '-vf',
    `format=rgba,geq=r=255:g=255:b=255:a='255*exp(-pow((X-520)*0.80+(Y-853)*0.60,2)/(2*pow(210,2)))${win}'`,
    '-frames:v', '1', out]);
  return out;
}
// Partículas en contraluz: ruido → umbral alto → blur = puntos suaves
// escasos sobre lienzo alto (2160) para derivar sin repetir en escena.
async function genParticlesPng(tmpDir) {
  const out = path.join(tmpDir, 'particles.png');
  await runFfmpeg(['-f', 'lavfi', '-i', 'color=white:s=1080x2160',
    '-f', 'lavfi', '-i', `color=black:s=1080x2160,noise=alls=95:allf=t,format=gray,lut=y='if(gt(val,238),255,0)',gblur=sigma=2.4`,
    '-filter_complex', '[0:v][1:v]alphamerge,format=rgba', '-frames:v', '1', out]);
  return out;
}
// Tarjeta del @: pastilla de marca con esquinas redondeadas (SDF en
// geq, antialias de 1 px) y el handle compuesto adentro. Reemplaza al
// rectángulo de drawtext de bordes rectos.
async function genPlatePng(tmpDir, handle, brandHex) {
  const advH = await measureAdvance(handle, 82, tmpDir);
  const PW = advH + 96, PH = 150;
  const CX = Math.floor(PW / 2), HX = Math.floor(PW / 2) - 34, HY = 75 - 34;
  const r = parseInt(brandHex.slice(1, 3), 16), g = parseInt(brandHex.slice(3, 5), 16), b = parseInt(brandHex.slice(5, 7), 16);
  const f = path.join(tmpDir, 'handle.txt');
  fs.writeFileSync(f, handle, 'utf8');
  const out = path.join(tmpDir, 'plate.png');
  await runFfmpeg(['-f', 'lavfi', '-i', `color=black:s=${PW}x${PH}`, '-vf',
    `format=rgba,geq=r=${r}:g=${g}:b=${b}:a='255*clip(34.5-sqrt(pow(max(abs(X-${CX})-${HX},0),2)+pow(max(abs(Y-75)-${HY},0),2))-min(max(abs(X-${CX})-${HX},abs(Y-75)-${HY}),0),0,1)',drawtext=fontfile='${FONT}':textfile='${f}':fontsize=82:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-frames:v', '1', out]);
  return { file: out, w: PW, h: PH };
}

let _musicBeats = null;
function musicBeatsMod() {
  if (_musicBeats === null) { try { _musicBeats = require('./music-beats'); } catch (e) { _musicBeats = false; } }
  return _musicBeats || null;
}

// buildReelV3({ mediaDir, photos, videos, script, captionPlan, handle,
//              brandHex, mood }) → { file, url, duration, coverPath,
//              music, scripted:true, template, beatsSnapped }
async function buildReelV3(opts) {
  const { mediaDir } = opts || {};
  if (!mediaDir) throw new Error('falta mediaDir');
  const photos = (opts.photos || []).filter(f => f && fs.existsSync(f));
  const videos = (opts.videos || []).filter(f => f && fs.existsSync(f));
  if (!photos.length && !videos.length) throw new Error('sin material para el reel');
  const script = opts.script;
  const scenes = (script.scenes || []).filter(s => s && s.line);
  if (scenes.length < 2) throw new Error('guion sin escenas suficientes');
  const tplName = MOTION_TEMPLATES[opts.template || script.intent] ? (opts.template || script.intent) : 'default';
  const tpl = templateFor(opts.template || script.intent);
  const XF = tpl.xf;
  const brand = validHex(opts.brandHex) || '#2793C8';
  const handleLine = String(opts.handle || '').trim();

  // ---------- Música + grilla de beats (para el snap) ----------
  const musicFile = pickMusicFile(opts.mood, opts.musicSeed);
  const mb = musicBeatsMod();
  const beatEntry = (mb && musicFile) ? mb.beatsForFile(musicFile) : null;

  // ---------- Plan de segmentos: un visual por escena ----------
  const segs = []; // { kind, file, dur, start, hasAudio, srcDur, sceneIdx }
  const vidQueue = videos.slice(0, 3);
  let photoIdx = 0;
  for (let i = 0; i < scenes.length; i++) {
    const want = Math.max(1.2, Math.min(6.5, Number(scenes[i].seconds) || 3));
    let seg = null;
    if (vidQueue.length) {
      const v = vidQueue.shift();
      const info = await mediaInfo(v);
      if (info && info.duration >= 1.0) {
        const dur = Math.max(1.0, Math.min(want, info.duration));
        seg = { kind: 'video', file: v, dur, start: Math.max(0, (info.duration - dur) / 2), hasAudio: !!info.hasAudio, srcDur: info.duration, sceneIdx: i };
        // (Gap 4) El crop sigue al sujeto medido, no al centro ciego.
        const foc = await detectFocus(v, { isVideo: true, duration: info.duration });
        seg.fx = foc.x; seg.fy = foc.y;
      }
    }
    if (!seg && photos.length) {
      seg = { kind: 'photo', file: photos[photoIdx++ % photos.length], dur: want, start: 0, hasAudio: false, srcDur: 0, sceneIdx: i };
    }
    if (!seg) throw new Error('sin visual para la escena ' + i);
    segs.push(seg);
  }
  const N = segs.length;

  // ---------- Snap de bordes al beat (±150 ms; el total no cambia) ----------
  let beatsSnapped = 0;
  if (beatEntry && mb) {
    let acc = 0;
    for (let i = 0; i < N - 1; i++) {
      acc += segs[i].dur;
      const snapped = mb.nearestBeat(beatEntry, acc, 0.15);
      if (snapped !== null) {
        const newDur = snapped - (acc - segs[i].dur);
        if (newDur >= 1.0 && segs[i + 1].dur - (snapped - acc) >= 1.0) {
          segs[i + 1].dur = Math.round((segs[i + 1].dur - (snapped - acc)) * 100) / 100;
          segs[i].dur = Math.round(newDur * 100) / 100;
          acc = snapped;
          beatsSnapped++;
        }
      }
    }
  }

  const starts = []; // inicio de cada escena en la línea del guion (ya ajustada)
  { let a = 0; for (const s of segs) { starts.push(Math.round(a * 100) / 100); a += s.dur; } }
  const total = Math.round(segs.reduce((a, s) => a + s.dur, 0) * 100) / 100;
  const totalOut = Math.round((total - (N - 1) * XF) * 100) / 100;
  if (totalOut < 4) throw new Error('material demasiado corto para un reel');
  // Corrimiento de un instante del guion a la línea de SALIDA: el borde
  // de la escena i se corre −i·xf por los solapes del xfade, más el
  // delta entre el inicio real de la escena y el que pedía el guion.
  const scriptStarts = scenes.map(s => Number(s.start) || 0);
  const shiftFor = (sceneIdx, t) => t + (starts[sceneIdx] - scriptStarts[sceneIdx]) - sceneIdx * XF;

  const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tmpDir = path.join(mediaDir, '.tmp-reel3-' + tag);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // ---------- Luminancia por escena y banda ----------
    const lumCache = new Map();
    const lumFor = async (seg, band) => {
      const key = seg.sceneIdx + ':' + band;
      if (lumCache.has(key)) return lumCache.get(key);
      const yFrac = band === 'top' ? 0.07 : 0.66;
      const hFrac = band === 'top' ? 0.23 : 0.22;
      const lum = await zoneLuminance(seg.file, { isVideo: seg.kind === 'video', tSec: seg.start + seg.dur / 2, yFrac, hFrac });
      lumCache.set(key, lum);
      return lum;
    };

    // =====================================================
    // PULIDO DE SUBTÍTULOS (2026-10-20 — feedback de Valentino:
    // "el fondo de las palabras se ve como un BORDADO").
    //
    // DIAGNÓSTICO (verificado en frames de los renders de prueba):
    // el dtChunk anterior dibujaba UNA CAJA POR LÍNEA (drawtext con
    // box=1 por cada línea del chunk). Tres defectos compuestos:
    //  1. Cada línea tenía su propio rectángulo pegado a su texto →
    //     anchos escalonados entre líneas, silueta de parche.
    //  2. La caja de una línea (alto de glifo + 2×boxborderw=44)
    //     superaba el interlineado (lh=88 con fuente 72) → las cajas
    //     de líneas vecinas se SOLAPABAN y la franja de solape se
    //     oscurecía al doble: la "costura" literal del bordado.
    //  3. El alfa salía de la luminancia de ESA escena en 4 escalones
    //     discretos (boxAlphaFor) y la caja entraba/salía en corte
    //     seco (enable between): entre chunk y chunk el parche
    //     cambiaba de tamaño, de tono y de golpe.
    //
    // ESTILO NUEVO ("limpio premium"): SIN cajas. Texto blanco
    // Montserrat 800 con trazo fino (borderw) y sombra suave sobre
    // un SCRIM con pluma por banda (gradiente con meseta sobre la
    // zona del texto, nunca un rectángulo). El contraste lo decide
    // la PEOR banda del reel y el pico del scrim es UNO SOLO para
    // todo el reel → cero saltos de tono entre chunks. Cada chunk
    // entra con fade de 0,13 s + asentamiento vertical de 10 px
    // (smoothstep) y sale con fade: nada aparece de golpe.
    // =====================================================
    const CHUNK_TIERS = [{ size: 72, ch: 15, lh: 88 }, { size: 64, ch: 17, lh: 80 }, { size: 56, ch: 20, lh: 70 }];
    const BAND_Y = { top: 150, bottom: 1330 }; // dentro de [0.07,0.30] y [0.66,0.88] de 1920
    // Ventanas de salida de cada chunk. Al remapear, el primer chunk de
    // una escena arranca −xf ANTES de que termine el último chunk de la
    // escena anterior (el solape del xfade): en bandas DISTINTAS eso se
    // ve como un fundido cruzado de textos (bien), pero en la MISMA
    // banda dos drawtext activos a la vez se pisan y el texto sale
    // doble/fantasma (verificado en frames, 2026-10-20). Regla: por
    // banda, un chunk nunca arranca antes de que termine el anterior —
    // el arranque se corre, nada se borra.
    const renderChunks = [];
    let worstLum = 0;
    for (const chunk of (opts.captionPlan.chunks || [])) {
      const seg = segs[chunk.sceneIndex];
      if (!seg) continue;
      const a0 = Math.max(0, shiftFor(chunk.sceneIndex, Number(chunk.start) || 0));
      const b = Math.max(a0 + 0.2, shiftFor(chunk.sceneIndex, Number(chunk.end) || 0));
      if (a0 >= totalOut) continue;
      const fit = fitText(chunk.text, CHUNK_TIERS, 2);
      if (!fit) continue;
      const band = chunk.band === 'top' ? 'top' : 'bottom';
      worstLum = Math.max(worstLum, await lumFor(seg, band));
      renderChunks.push({ fit, band, a: a0, b: Math.min(b, totalOut), role: chunk.role });
    }
    const bandFreeAt = { top: 0, bottom: 0 };
    for (const rc of renderChunks) {
      if (rc.a < bandFreeAt[rc.band]) rc.a = bandFreeAt[rc.band];
      if (rc.b - rc.a < 0.25) rc.skip = true; // sin aire tras el corrimiento: no destella
      else bandFreeAt[rc.band] = rc.b;
    }
    // Pico del scrim: la banda más brillante del reel tiene que bajar
    // a luminancia efectiva ≤115 tras el scrim (contraste ≥4,5:1
    // contra el blanco del texto); piso 0,30 (presencia de estilo
    // aun en escenas oscuras) y techo 0,66 (que no ensucie la foto).
    const scrimPeak = Math.round(255 * Math.min(0.66, Math.max(0.30, 1 - 115 / Math.max(worstLum, 1))));
    // Corridas de texto por banda: chunks pegados (gap ≤0,4 s) comparten
    // UN scrim que respira con la corrida, no un fundido por chunk.
    const runs = { top: [], bottom: [] };
    for (const rc of renderChunks) {
      if (rc.skip) continue;
      const list = runs[rc.band];
      const last = list[list.length - 1];
      if (last && rc.a - last.b <= 0.4) last.b = Math.max(last.b, rc.b);
      else list.push({ a: rc.a, b: rc.b });
    }

    // ---------- Efectos por prompt + movimientos por escena ----------
    const fxm = reelEffectsMod();
    const fxPlan = fxm
      ? fxm.effectsForReel({ intent: opts.template || script.intent, mood: opts.mood, rubro: opts.rubro, scenes })
      : { effect: { id: 'neutro-limpio' }, perScene: scenes.map(() => ({ effectId: 'neutro-limpio', prompt: '', grade: [], glow: 0, overlay: null })) };
    const movePlan = movementPlanFor(tpl.move, N);
    const appliedMoves = segs.map((s, i) => (s.kind === 'video' ? 'video' : movePlan[i]));

    // ---------- Palabra clave del gancho (énfasis de marca) ----------
    const kwHit = findKeyword(renderChunks, opts.keywords);
    if (kwHit) kwHit.chunk.kw = { lineIdx: kwHit.lineIdx, start: kwHit.start, end: kwHit.end };

    // ---------- Constructores de texto del estilo limpio ----------
    let dtN = 0;
    const clampE = (e) => `min(1,max(0,${e}))`;
    const ssE = (u) => `(${u}*${u}*(3-2*${u}))`;
    const alphaExpr = (a, b) => {
      const fi = Math.min(0.13, (b - a) / 2);
      return `if(lt(t,${a.toFixed(2)}),0,if(lt(t,${(a + fi).toFixed(2)}),(t-${a.toFixed(2)})/${fi.toFixed(2)},if(lt(t,${(b - fi).toFixed(2)}),1,max(0,1-(t-${(b - fi).toFixed(2)})/${fi.toFixed(2)}))))`;
    };
    const dtLine = (text, { size, yBase, x, color, a, b }) => {
      const f = path.join(tmpDir, `t${dtN++}.txt`);
      fs.writeFileSync(f, text, 'utf8');
      const bw = Math.max(2, Math.round(size / 24));
      const y = `${Math.round(yBase)}+10*(1-${ssE(clampE(`(t-${a.toFixed(2)})/0.20`))})`;
      return `drawtext=fontfile='${FONT}':textfile='${f}':fontsize=${size}:fontcolor=${color}:` +
        `borderw=${bw}:bordercolor=black@0.5:shadowcolor=black@0.35:shadowx=${bw}:shadowy=${bw}:` +
        `x=${x}:y='${y}':alpha='${alphaExpr(a, b)}':enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`;
    };
    const textFilters = [];
    let hookMaxLines = 0, hookLh = 88, hookOutEnd = 0;
    const brandDraw = '0x' + brand.slice(1);
    for (const rc of renderChunks) {
      if (rc.skip) continue;
      const size = rc.fit.size;
      for (let i = 0; i < rc.fit.lines.length; i++) {
        const line = rc.fit.lines[i];
        const yBase = BAND_Y[rc.band] + i * rc.fit.lh;
        if (rc.kw && rc.kw.lineIdx === i) {
          // Línea con la palabra clave: tres segmentos medidos al
          // píxel (pre / clave en color de marca / sufijo), misma
          // línea base y mismos fades que una línea común.
          const pre = line.slice(0, rc.kw.start);
          const kw = line.slice(rc.kw.start, rc.kw.end);
          const suf = line.slice(rc.kw.end);
          const advLine = await measureAdvance(line, size, tmpDir);
          const advPre = pre ? await measureAdvance(pre, size, tmpDir) : 0;
          const advKw = await measureAdvance(kw, size, tmpDir);
          const xLine = Math.round((W - advLine) / 2);
          if (pre) textFilters.push(dtLine(pre, { size, yBase, x: xLine, color: 'white', a: rc.a, b: rc.b }));
          textFilters.push(dtLine(kw, { size, yBase, x: xLine + advPre, color: brandDraw, a: rc.a, b: rc.b }));
          if (suf) textFilters.push(dtLine(suf, { size, yBase, x: xLine + advPre + advKw, color: 'white', a: rc.a, b: rc.b }));
        } else {
          textFilters.push(dtLine(line, { size, yBase, x: '(w-text_w)/2', color: 'white', a: rc.a, b: rc.b }));
        }
      }
      if (rc.role === 'hook') {
        if (rc.fit.lines.length > hookMaxLines) { hookMaxLines = rc.fit.lines.length; hookLh = rc.fit.lh; }
        hookOutEnd = Math.max(hookOutEnd, rc.b);
      }
    }
    // Barra de acento de marca bajo el gancho: CRECE desde el centro
    // (antes aparecía de golpe, un rectángulo más del bordado).
    if (hookMaxLines) {
      const barY = Math.round(BAND_Y.top + hookMaxLines * hookLh + 28);
      const grow = clampE('(t-0.05)/0.40');
      textFilters.push(`drawbox=x='(1080-150*${grow})/2':y=${barY}:w='150*${grow}':h=10:color=${brand}@0.95:t=fill:enable='between(t,0,${hookOutEnd.toFixed(2)})'`);
    }
    // Cierre: la @ vive en una PASTILLA de marca redondeada (PNG,
    // genPlatePng) en la BANDA INFERIOR — el centro está prohibido
    // también en reels. Entra asentándose con un halo de marca que
    // late una vez (ver cadena final). closeStart = últimos 2 s.
    const closeStart = Math.max(0, Math.round((totalOut - 2) * 100) / 100);
    let plate = null, plateX = 0;
    const PLATE_Y = 1530;
    if (handleLine) {
      plate = await genPlatePng(tmpDir, handleLine, brand);
      plateX = Math.round((W - plate.w) / 2);
    }

    // ---------- Activos de efecto según el plan ----------
    const needSweep = fxPlan.perScene.some(s => s.overlay && s.overlay.kind === 'sweep');
    const needParticles = fxPlan.perScene.some(s => s.overlay && s.overlay.kind === 'particles');
    const scrimTopFile = runs.top.length ? await genScrimPng(tmpDir, scrimPeak, false) : null;
    const scrimBottomFile = runs.bottom.length ? await genScrimPng(tmpDir, scrimPeak, true) : null;
    const sweepFile = needSweep ? await genSweepPng(tmpDir) : null;
    const particlesFile = needParticles ? await genParticlesPng(tmpDir) : null;

    // ---------- Inputs (índices dinámicos) ----------
    const args = [];
    segs.forEach((s) => {
      if (s.kind === 'video') args.push('-ss', String(s.start.toFixed(2)), '-t', String(s.dur.toFixed(2)), '-i', s.file);
      else args.push('-i', s.file);
    });
    segs.forEach((s) => {
      if (s.kind === 'video' && s.hasAudio) args.push('-ss', String(s.start.toFixed(2)), '-t', String(s.dur.toFixed(2)), '-i', s.file);
      else args.push('-f', 'lavfi', '-t', String(s.dur.toFixed(2)), '-i', 'anullsrc=r=48000:cl=stereo');
    });
    let nextIn = 2 * N;
    let musicIdx = -1;
    if (musicFile) { args.push('-stream_loop', '-1', '-i', musicFile); musicIdx = nextIn++; }
    const assetIdx = {};
    if (scrimTopFile) { args.push('-loop', '1', '-framerate', String(FPS), '-t', String(totalOut), '-i', scrimTopFile); assetIdx.scrimTop = nextIn++; }
    if (scrimBottomFile) { args.push('-loop', '1', '-framerate', String(FPS), '-t', String(totalOut), '-i', scrimBottomFile); assetIdx.scrimBottom = nextIn++; }
    if (sweepFile) { args.push('-loop', '1', '-framerate', String(FPS), '-t', String(totalOut), '-i', sweepFile); assetIdx.sweep = nextIn++; }
    if (particlesFile) { args.push('-loop', '1', '-framerate', String(FPS), '-t', String(totalOut), '-i', particlesFile); assetIdx.particles = nextIn++; }
    if (plate) { args.push('-loop', '1', '-framerate', String(FPS), '-t', String(totalOut), '-i', plate.file); assetIdx.plate = nextIn++; }

    // ---------- Filtergraph: conformar → grado/efectos → xfade ----------
    const fc = [];
    const sweepScenes = fxPlan.perScene.map((s, i) => i).filter(i => fxPlan.perScene[i].overlay && fxPlan.perScene[i].overlay.kind === 'sweep');
    const partScenes = fxPlan.perScene.map((s, i) => i).filter(i => fxPlan.perScene[i].overlay && fxPlan.perScene[i].overlay.kind === 'particles');
    if (sweepScenes.length) fc.push(`[${assetIdx.sweep}:v]split=${sweepScenes.length}${sweepScenes.map((_, j) => `[swi${j}]`).join('')}`);
    if (partScenes.length) fc.push(`[${assetIdx.particles}:v]split=${partScenes.length}${partScenes.map((_, j) => `[pti${j}]`).join('')}`);
    const clampE2 = (e) => `min(1,max(0,${e}))`;
    segs.forEach((s, i) => {
      const frames = Math.max(2, Math.round(s.dur * FPS));
      let cur;
      if (s.kind === 'video') {
        fc.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,${cropFocusExpr(s.fx, s.fy)},fps=${FPS},setsar=1,format=yuv420p[s${i}raw]`);
        cur = `s${i}raw`;
      } else if (appliedMoves[i] === 'parallax') {
        // PARALLAX simple (dos capas de la MISMA foto): fondo con más
        // zoom, blur y push-in lento; frente apenas más grande, con
        // bordes plumados (alphaextract+boxblur+alphamerge) y deriva
        // lateral contraria con smootherstep. La diferencia de
        // velocidades entre capas se lee como profundidad.
        const S = smoothExpr(frames);
        const S2 = smoothExpr2(frames);
        const drift = i % 2 ? `(iw-iw/zoom)*(0.56-0.12*${S2})` : `(iw-iw/zoom)*(0.44+0.12*${S2})`;
        fc.push(`[${i}:v]scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840,setsar=1,` +
          `zoompan=z='1.30+0.05*${S}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*0.42':d=${frames}:s=${W}x${H}:fps=${FPS},gblur=sigma=10,format=yuv420p[pbg${i}]`);
        fc.push(`[${i}:v]scale=2376:4224:force_original_aspect_ratio=increase:flags=lanczos,crop=2376:4224,setsar=1,` +
          `zoompan=z='1.10':x='${drift}':y='(ih-ih/zoom)/2':d=${frames}:s=1188x2112:fps=${FPS},format=rgba,split[pfgc${i}][pfga${i}]`);
        fc.push(`[pfga${i}]alphaextract,boxblur=luma_radius=26:luma_power=2[pfgb${i}]`);
        fc.push(`[pfgc${i}][pfgb${i}]alphamerge[pfgf${i}]`);
        fc.push(`[pbg${i}][pfgf${i}]overlay=x=-54:y=-96,format=yuv420p[s${i}raw]`);
        cur = `s${i}raw`;
      } else {
        const mv = photoMovementFor(appliedMoves[i], i, frames);
        fc.push(`[${i}:v]scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840,setsar=1,` +
          `zoompan=z='${mv.z}':x='${mv.x}':y='${mv.y}':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p[s${i}raw]`);
        cur = `s${i}raw`;
      }
      // Grado del prompt de efecto (sutil, el mismo en todo el reel).
      const fxi = fxPlan.perScene[i] || { grade: [], glow: 0, overlay: null };
      if (fxi.grade && fxi.grade.length) {
        fc.push(`[${cur}]${fxi.grade.join(',')}[s${i}g]`);
        cur = `s${i}g`;
      }
      // Glow (fitness): copia borrosa en blend screen de baja
      // opacidad. OJO: el blend va en RGB (gbrp) — en YUV el modo
      // screen opera por plano y destruye el croma neutro (128):
      // todo el cuadro sale magenta (verificado en laboratorio).
      if (fxi.glow > 0) {
        fc.push(`[${cur}]split[s${i}ga][s${i}gb]`);
        fc.push(`[s${i}ga]format=gbrp[s${i}gar]`);
        fc.push(`[s${i}gb]gblur=sigma=12,format=gbrp[s${i}gbl]`);
        fc.push(`[s${i}gar][s${i}gbl]blend=all_mode=screen:all_opacity=${fxi.glow},format=yuv420p[s${i}gl]`);
        cur = `s${i}gl`;
      }
      // Overlays del prompt: barrido de luz (pasa y se va) o partículas
      // en contraluz (ambiente, deriva lenta hacia arriba).
      if (fxi.overlay && fxi.overlay.kind === 'sweep') {
        const j = sweepScenes.indexOf(i);
        const scaleW = fxi.overlay.scaleW || 1300;
        const scaleH = Math.max(2000, Math.round(scaleW * 1707 / 1040));
        const durS = Math.max(0.5, Math.min(fxi.overlay.dur || 1.7, s.dur - 0.4));
        const oy = Math.round((H - scaleH) / 2);
        fc.push(`[swi${j}]scale=${scaleW}:${scaleH},format=rgba,colorchannelmixer=aa=${fxi.overlay.opacity}[swf${i}]`);
        fc.push(`[${cur}][swf${i}]overlay=x='-${scaleW + 100}+${W + scaleW + 200}*${clampE2(`(t-0.25)/${durS.toFixed(2)}`)}':y=${oy}:enable='between(t,0.25,${(0.25 + durS).toFixed(2)})'[s${i}fx]`);
        cur = `s${i}fx`;
      } else if (fxi.overlay && fxi.overlay.kind === 'particles') {
        const j = partScenes.indexOf(i);
        fc.push(`[pti${j}]format=rgba,colorchannelmixer=aa=${fxi.overlay.opacity}[ptf${i}]`);
        fc.push(`[${cur}][ptf${i}]overlay=x=0:y='-60-14*t'[s${i}fx]`);
        cur = `s${i}fx`;
      }
      fc.push(`[${cur}]settb=AVTB[v${i}]`);
      fc.push(`[${N + i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${s.dur.toFixed(2)},atrim=0:${s.dur.toFixed(2)}[a${i}]`);
    });
    let vCur = 'v0', aCur = 'a0';
    for (let k = 1; k < N; k++) {
      const off = Math.max(0, starts[k] - k * XF);
      fc.push(`[${vCur}][v${k}]xfade=transition=${tpl.transition}:duration=${XF}:offset=${off.toFixed(2)}[x${k}]`);
      fc.push(`[${aCur}][a${k}]acrossfade=d=${XF}[ax${k}]`);
      vCur = `x${k}`; aCur = `ax${k}`;
    }
    // ---------- Cadena final: fades → scrims → texto → cierre ----------
    fc.push(`[${vCur}]fade=t=in:st=0:d=0.25,fade=t=out:st=${(totalOut - 0.45).toFixed(2)}:d=0.45[vt0]`);
    vCur = 'vt0';
    for (const band of ['top', 'bottom']) {
      const list = runs[band];
      if (!list.length) continue;
      const srcIdx = band === 'top' ? assetIdx.scrimTop : assetIdx.scrimBottom;
      fc.push(`[${srcIdx}:v]split=${list.length}${list.map((_, j) => `[scr${band}${j}]`).join('')}`);
      list.forEach((run, j) => {
        const aIn = Math.max(0, run.a - 0.02);
        fc.push(`[scr${band}${j}]format=rgba,fade=t=in:st=${aIn.toFixed(2)}:d=0.18:alpha=1,fade=t=out:st=${Math.max(aIn, run.b - 0.2).toFixed(2)}:d=0.2:alpha=1[scr${band}${j}f]`);
        fc.push(`[${vCur}][scr${band}${j}f]overlay=x=0:y=${band === 'top' ? 0 : H - 800}:enable='between(t,${aIn.toFixed(2)},${(run.b + 0.02).toFixed(2)})'[vt${band}${j}]`);
        vCur = `vt${band}${j}`;
      });
    }
    if (textFilters.length) {
      fc.push(`[${vCur}]${textFilters.join(',')}[vtxt]`);
      vCur = 'vtxt';
    }
    if (plate) {
      // Remate del cierre: halo de marca (la pastilla premultiplicada,
      // borrosa, en screen) que sube y late UNA vez suave, y la
      // pastilla nítida que se asienta sobre él.
      const cs = closeStart.toFixed(2);
      // premultiply inplace (con su propio alfa): la variante de dos
      // entradas multiplica por el primer plano del segundo stream y
      // el halo sale rectangular. Y el blend screen va en RGB (gbrp):
      // en YUV corrompe el croma de todo el cuadro a magenta.
      fc.push(`[${assetIdx.plate}:v]split=2[plg][plc]`);
      fc.push(`[plg]premultiply=inplace=1,pad=${W}:${H}:x=${plateX}:y=${PLATE_Y},gblur=sigma=16,format=gbrp,` +
        `fade=t=in:st=${cs}:d=0.3,fade=t=out:st=${(closeStart + 0.6).toFixed(2)}:d=0.3,fade=t=in:st=${(closeStart + 1.05).toFixed(2)}:d=0.35[plgf]`);
      fc.push(`[${vCur}]format=gbrp[vtg]`);
      fc.push(`[vtg][plgf]blend=all_mode=screen:all_opacity=0.5:enable='between(t,${cs},${totalOut.toFixed(2)})',format=yuv420p[vglow]`);
      fc.push(`[plc]format=rgba,fade=t=in:st=${cs}:d=0.25:alpha=1[plcf]`);
      const settle = ssE(clampE(`(t-${cs})/0.30`));
      fc.push(`[vglow][plcf]overlay=x=${plateX}:y='${PLATE_Y}+16*(1-${settle})':enable='gte(t,${cs})'[vout]`);
      vCur = 'vout';
    }

    let alabel;
    if (musicIdx >= 0) {
      fc.push(`[${musicIdx}:a]atrim=0:${totalOut},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.9,afade=t=in:st=0:d=0.4,afade=t=out:st=${(totalOut - 1.2).toFixed(2)}:d=1.2[mus]`);
      fc.push(`[${aCur}]volume=0.22[amb]`);
      fc.push(`[amb][mus]amix=inputs=2:duration=first:normalize=0[aout]`);
      alabel = 'aout';
    } else {
      alabel = aCur;
    }

    if (process.env.POSTY_REEL_DEBUG) console.log('[reel3] filtergraph:', fc.join(';'));
    args.push(
      '-filter_complex', fc.join(';'),
      '-map', `[${vCur}]`, '-map', `[${alabel}]`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart', '-video_track_timescale', '30000',
      '-t', String(totalOut),
    );
    try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (e) {}
    const outName = `reel3-${tag}.mp4`;
    const outPath = path.join(mediaDir, outName);
    args.push(outPath);
    await runFfmpeg(args);

    const coverPath = path.join(mediaDir, `reel3-${tag}-cover.jpg`);
    try { await runFfmpeg(['-ss', '0.5', '-i', outPath, '-frames:v', '1', '-q:v', '3', coverPath]); }
    catch (e) { /* la portada es un plus; el reel manda */ }

    return {
      file: outPath, url: `/media/${outName}`, duration: totalOut,
      coverPath: fs.existsSync(coverPath) ? coverPath : null, music: !!musicFile,
      scripted: true, template: tplName, beatsSnapped,
      // Trazabilidad del pulido: estilo de subtítulos, prompt de
      // efecto por escena (con su texto) y movimiento aplicado.
      captionStyle: 'limpio-v2',
      effects: fxPlan.perScene.map((s, i) => ({ scene: i, effectId: s.effectId, prompt: s.prompt })),
      movements: segs.map((s, i) => ({ scene: i, move: appliedMoves[i] })),
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// buildReelPro({ mediaDir, photos, videos, hook, mid, cta, handle,
//                brandHex, mood }) → { file, url, duration, coverPath, music }
// Con script + captionPlan (Motion v3) despacha a buildReelV3.
// photos/videos: rutas absolutas existentes. Videos ya validados (mp4/mov).
async function buildReelPro(opts) {
  if (opts && opts.script && opts.captionPlan && Array.isArray(opts.script.scenes) && opts.script.scenes.length >= 2) {
    return buildReelV3(opts);
  }
  const { mediaDir } = opts || {};
  if (!mediaDir) throw new Error('falta mediaDir');
  const photos = (opts.photos || []).filter(f => f && fs.existsSync(f));
  const videos = (opts.videos || []).filter(f => f && fs.existsSync(f));
  if (!photos.length && !videos.length) throw new Error('sin material para el reel');

  // ---------- Plan de segmentos ----------
  const segs = []; // { kind:'video'|'photo', file, dur, start, hasAudio }
  const vids = [];
  for (const v of videos.slice(0, 3)) {
    const info = await mediaInfo(v);
    if (!info || !info.duration) continue;
    const dur = Math.min(3.4, info.duration);
    if (dur < 1.2) continue;
    // (Gap 4) El crop sigue al sujeto medido, no al centro ciego.
    const foc = await detectFocus(v, { isVideo: true, duration: info.duration });
    vids.push({ kind: 'video', file: v, dur, start: Math.max(0, (info.duration - dur) / 2), hasAudio: !!info.hasAudio, srcDur: info.duration, fx: foc.x, fy: foc.y });
  }
  let total = vids.reduce((a, s) => a + s.dur, 0);
  segs.push(...vids);
  // Fotos: completar hasta ~11 s (o todo el reel si no hay video).
  const photoPool = photos.slice(0, 5);
  if (photoPool.length && (total < 8 || !segs.length)) {
    let per = segs.length ? 2.2 : Math.min(2.8, Math.max(2.0, 11 / photoPool.length));
    for (const p of photoPool) {
      if (segs.length && total >= 12.5) break;
      segs.push({ kind: 'photo', file: p, dur: per, start: 0, hasAudio: false });
      total += per;
    }
  }
  if (!segs.length) throw new Error('sin segmentos válidos');
  // Recorte final a 14 s máximo.
  if (total > 14) {
    let acc = 0;
    for (const s of segs) { if (acc + s.dur > 14) s.dur = Math.max(0, 14 - acc); acc += s.dur; }
    while (segs.length && segs[segs.length - 1].dur < 0.3) segs.pop();
    total = segs.reduce((a, s) => a + s.dur, 0);
  }
  // Piso de 8 s (spec 8–14): si el material quedó corto, estirar primero las
  // fotos (hasta 3,4 s c/u) y después los videos (hasta su duración real,
  // tope 5 s por segmento, re-centrando el recorte).
  if (total < 8) {
    for (const s of segs) {
      if (total >= 8) break;
      if (s.kind !== 'photo') continue;
      const add = Math.min(3.4 - s.dur, 8 - total);
      if (add > 0) { s.dur += add; total += add; }
    }
    for (const s of segs) {
      if (total >= 8) break;
      if (s.kind !== 'video') continue;
      const add = Math.min(5 - s.dur, (s.srcDur || s.dur) - s.dur, 8 - total);
      if (add > 0) { s.dur += add; s.start = Math.max(0, ((s.srcDur || s.dur) - s.dur) / 2); total += add; }
    }
  }
  if (total < 4) throw new Error('material demasiado corto para un reel');
  total = Math.round(total * 100) / 100;

  const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tmpDir = path.join(mediaDir, '.tmp-reel2-' + tag);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // ---------- Textos (compuestos por código) ----------
    const hookFit = fitText(opts.hook, [{ size: 88, ch: 17, lh: 106 }, { size: 74, ch: 20, lh: 92 }, { size: 64, ch: 23, lh: 80 }], 3);
    const midFit = fitText(opts.mid, [{ size: 56, ch: 26, lh: 70 }, { size: 50, ch: 29, lh: 64 }], 2);
    const ctaFit = fitText(opts.cta, [{ size: 62, ch: 22, lh: 78 }, { size: 54, ch: 25, lh: 68 }], 2);
    const hookLines = hookFit ? hookFit.lines : [];
    const midLines = midFit ? midFit.lines : [];
    const ctaLines = ctaFit ? ctaFit.lines : [];
    const handleLine = String(opts.handle || '').trim();
    const brand = validHex(opts.brandHex) || '#2793C8';

    // Segmento activo en un instante t (para sondear luminancia).
    const segAt = (t) => {
      let acc = 0;
      for (const s of segs) { if (t < acc + s.dur) return { seg: s, local: t - acc }; acc += s.dur; }
      const last = segs[segs.length - 1];
      return { seg: last, local: last.dur - 0.1 };
    };
    const lumOf = async (t, yFrac, hFrac) => {
      const { seg, local } = segAt(Math.min(t, total - 0.05));
      return zoneLuminance(seg.file, { isVideo: seg.kind === 'video', tSec: seg.start + local, yFrac, hFrac });
    };
    const [lumHook, lumMid, lumClose] = [
      await lumOf(0.3, 0.08, 0.40),
      await lumOf(total * 0.5, 0.55, 0.20),
      await lumOf(total - 1, 0.36, 0.28),
    ];

    // drawtext por línea (centrado real por línea, sin depender de text_align).
    const dt = (lines, { size, y0, lineH, alpha, enable, color = 'white' }) => lines.map((ln, i) => {
      const f = path.join(tmpDir, `t${dt.n++}.txt`);
      fs.writeFileSync(f, ln, 'utf8');
      return `drawtext=fontfile='${FONT}':textfile='${f}':fontsize=${size}:fontcolor=${color}:` +
        `box=1:boxcolor=black@${alpha}:boxborderw=22:shadowcolor=black@0.4:shadowx=3:shadowy=3:` +
        `x=(w-text_w)/2:y=${Math.round(y0 + i * lineH)}:enable='${enable}'`;
    }).join(',');
    dt.n = 0;

    const hookEnd = Math.min(2.6, total * 0.3);
    const midStart = Math.round(total * 0.38 * 10) / 10;
    const midEnd = Math.round((total - 2.1) * 10) / 10;
    const closeStart = Math.round((total - 2.0) * 10) / 10;

    const textFilters = [];
    if (hookLines.length) {
      const y0 = 240;
      textFilters.push(dt(hookLines, { size: hookFit.size, y0, lineH: hookFit.lh, alpha: boxAlphaFor(lumHook), enable: `between(t,0,${hookEnd})` }));
      // Barra de acento con el color de marca del cliente (firma, como en
      // composite-headline): bajo el gancho, mismo enable. OJO: en drawbox
      // la variable w es el ancho de la CAJA (no del frame) → x literal.
      const barY = Math.round(y0 + hookLines.length * hookFit.lh + 28);
      textFilters.push(`drawbox=x=465:y=${barY}:w=150:h=10:color=${brand}@0.95:t=fill:enable='between(t,0,${hookEnd})'`);
    }
    if (midLines.length && midEnd > midStart + 0.5) {
      textFilters.push(dt(midLines, { size: midFit.size, y0: 1180, lineH: midFit.lh, alpha: boxAlphaFor(lumMid), enable: `between(t,${midStart},${midEnd})` }));
    }
    if (ctaLines.length || handleLine) {
      const parts = [];
      if (ctaLines.length) parts.push(dt(ctaLines, { size: ctaFit.size, y0: 800, lineH: ctaFit.lh, alpha: boxAlphaFor(lumClose), enable: `between(t,${closeStart},${total})` }));
      if (handleLine) {
        const f = path.join(tmpDir, `t${dt.n++}.txt`);
        fs.writeFileSync(f, handleLine, 'utf8');
        parts.push(`drawtext=fontfile='${FONT}':textfile='${f}':fontsize=82:fontcolor=white:` +
          `box=1:boxcolor=${brand}@0.92:boxborderw=24:shadowcolor=black@0.4:shadowx=3:shadowy=3:` +
          `x=(w-text_w)/2:y=${ctaLines.length ? 800 + ctaLines.length * ctaFit.lh + 36 : 880}:enable='between(t,${closeStart},${total})'`);
      }
      textFilters.push(parts.join(','));
    }

    // ---------- Inputs ----------
    const args = [];
    segs.forEach((s) => {
      if (s.kind === 'video') args.push('-ss', String(s.start.toFixed(2)), '-t', String(s.dur.toFixed(2)), '-i', s.file);
      else args.push('-i', s.file);
    });
    const N = segs.length;
    segs.forEach((s) => {
      if (s.kind === 'video' && s.hasAudio) args.push('-ss', String(s.start.toFixed(2)), '-t', String(s.dur.toFixed(2)), '-i', s.file);
      else args.push('-f', 'lavfi', '-t', String(s.dur.toFixed(2)), '-i', 'anullsrc=r=48000:cl=stereo');
    });
    const musicFile = pickMusicFile(opts.mood, opts.musicSeed);
    let musicIdx = -1;
    if (musicFile) { args.push('-stream_loop', '-1', '-i', musicFile); musicIdx = 2 * N; }

    // ---------- Filtergraph ----------
    const fc = [];
    segs.forEach((s, i) => {
      if (s.kind === 'video') {
        fc.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,${cropFocusExpr(s.fx, s.fy)},fps=${FPS},setsar=1,format=yuv420p[v${i}]`);
      } else {
        const frames = Math.max(2, Math.round(s.dur * FPS));
        const mv = photoMovement(i, frames);
        fc.push(`[${i}:v]scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840,setsar=1,` +
          `zoompan=z='${mv.z}':x='${mv.x}':y='${mv.y}':d=${frames}:s=${W}x${H}:fps=${FPS},format=yuv420p[v${i}]`);
      }
      fc.push(`[${N + i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${s.dur.toFixed(2)},atrim=0:${s.dur.toFixed(2)}[a${i}]`);
    });
    const pairs = segs.map((s, i) => `[v${i}][a${i}]`).join('');
    fc.push(`${pairs}concat=n=${N}:v=1:a=1[vcat][acat]`);

    let vlabel = 'vcat';
    const vf = [`fade=t=in:st=0:d=0.25`, `fade=t=out:st=${(total - 0.45).toFixed(2)}:d=0.45`, ...textFilters].filter(Boolean).join(',');
    if (vf) { fc.push(`[vcat]${vf}[vout]`); vlabel = 'vout'; }

    let alabel;
    if (musicIdx >= 0) {
      fc.push(`[${musicIdx}:a]atrim=0:${total},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.9,afade=t=in:st=0:d=0.4,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[mus]`);
      fc.push(`[acat]volume=0.22[amb]`);
      fc.push(`[amb][mus]amix=inputs=2:duration=first:normalize=0[aout]`);
      alabel = 'aout';
    } else {
      alabel = 'acat';
    }

    args.push(
      '-filter_complex', fc.join(';'),
      '-map', `[${vlabel}]`, '-map', `[${alabel}]`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart', '-video_track_timescale', '30000',
      '-t', String(total),
    );
    try { fs.mkdirSync(mediaDir, { recursive: true }); } catch (e) {}
    const outName = `reel2-${tag}.mp4`;
    const outPath = path.join(mediaDir, outName);
    args.push(outPath);
    await runFfmpeg(args);

    // Portada: fotograma del gancho (0,5 s), pensado para miniatura.
    const coverPath = path.join(mediaDir, `reel2-${tag}-cover.jpg`);
    try { await runFfmpeg(['-ss', '0.5', '-i', outPath, '-frames:v', '1', '-q:v', '3', coverPath]); }
    catch (e) { /* la portada es un plus; el reel manda */ }

    return { file: outPath, url: `/media/${outName}`, duration: total, coverPath: fs.existsSync(coverPath) ? coverPath : null, music: !!musicFile };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ---------- (Gap 2, 2026-10-25) EL VIDEO DEL CLIENTE COMO PROTAGONISTA ----------
// buildSingleClipReel({ mediaDir, file, hook, cta, handle, brandHex,
//   mood, musicSeed }) → { file, url, duration, coverPath, music,
//   singleClip: true, segmentStart, segmentDur }
// EL camino «posteá ESTE video»: el video del cliente ES el reel — no un
// ingrediente trozado de un montaje. Si dura ≤90 s sale ENTERO; si dura
// más, sale la mejor ventana de 60 s (la de mejor luz/nitidez medida).
// Su audio, si lo trae, es el audio principal (sin música encima: su
// voz/ambiente manda); sin audio propio, entra la música de la casa.
// Gancho por código en la zona segura superior y cierre con CTA + @,
// como en todo reel de Posty. La portada es el MEJOR frame medido del
// reel terminado (Gap 11) — y con cover_url en la publicación (Gap 1),
// esa portada es la que ve Instagram.
async function buildSingleClipReel(opts) {
  const { mediaDir } = opts || {};
  if (!mediaDir) throw new Error('falta mediaDir');
  const file = opts.file;
  if (!file || !fs.existsSync(file)) throw new Error('ese video no está en el servidor');
  const info = await mediaInfo(file);
  if (!info || !info.duration || info.duration < 1) throw new Error('no pude leer ese video');
  const srcDur = info.duration;

  // ---------- Tramo: entero si es corto; mejor ventana si es largo ----------
  let segStart = 0;
  let segDur = srcDur;
  const MAX_FULL = 90;
  const LONG_WIN = 60;
  const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tmpDir = path.join(mediaDir, '.tmp-single-' + tag);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    if (srcDur > MAX_FULL) {
      const best = await bestFrameTimeIn(file, srcDur, { samples: 10, tmpDir });
      const anchor = best ? best.t : srcDur / 2;
      segDur = LONG_WIN;
      segStart = Math.max(0, Math.min(srcDur - LONG_WIN, anchor - 15));
    }
    const total = Math.round(segDur * 100) / 100;
    const foc = await detectFocus(file, { isVideo: true, duration: srcDur });
    const brand = validHex(opts.brandHex) || '#2793C8';

    // ---------- Textos por código (gancho + cierre, como el motor) ----------
    const hookFit = fitText(opts.hook, [{ size: 88, ch: 17, lh: 106 }, { size: 74, ch: 20, lh: 92 }, { size: 64, ch: 23, lh: 80 }], 3);
    const ctaFit = fitText(opts.cta, [{ size: 62, ch: 22, lh: 78 }, { size: 54, ch: 25, lh: 68 }], 2);
    const hookLines = hookFit ? hookFit.lines : [];
    const ctaLines = ctaFit ? ctaFit.lines : [];
    const handleLine = String(opts.handle || '').trim();
    const lumHook = await zoneLuminance(file, { isVideo: true, tSec: segStart + 0.3, yFrac: 0.08, hFrac: 0.40 });
    const lumClose = await zoneLuminance(file, { isVideo: true, tSec: segStart + Math.max(0.3, segDur - 1), yFrac: 0.36, hFrac: 0.28 });
    let dtN = 0;
    const dt = (lines, { size, y0, lineH, alpha, enable, color = 'white' }) => lines.map((ln) => {
      const f = path.join(tmpDir, `t${dtN++}.txt`);
      fs.writeFileSync(f, ln, 'utf8');
      return `drawtext=fontfile='${FONT}':textfile='${f}':fontsize=${size}:fontcolor=${color}:` +
        `box=1:boxcolor=black@${alpha}:boxborderw=22:shadowcolor=black@0.4:shadowx=3:shadowy=3:` +
        `x=(w-text_w)/2:y=${Math.round(y0)}:enable='${enable}'`;
    }).join(',');
    const textFilters = [];
    const hookEnd = Math.min(2.6, total * 0.3);
    if (hookLines.length) {
      const y0 = 240;
      textFilters.push(dt(hookLines, { size: hookFit.size, y0, lineH: hookFit.lh, alpha: boxAlphaFor(lumHook), enable: `between(t,0,${hookEnd})` }));
      const barY = Math.round(y0 + hookLines.length * hookFit.lh + 28);
      textFilters.push(`drawbox=x=465:y=${barY}:w=150:h=10:color=${brand}@0.95:t=fill:enable='between(t,0,${hookEnd})'`);
    }
    const closeStart = Math.round((total - 2.0) * 10) / 10;
    if (ctaLines.length || handleLine) {
      const parts = [];
      if (ctaLines.length) parts.push(dt(ctaLines, { size: ctaFit.size, y0: 800, lineH: ctaFit.lh, alpha: boxAlphaFor(lumClose), enable: `between(t,${closeStart},${total})` }));
      if (handleLine) {
        const f = path.join(tmpDir, `t${dtN++}.txt`);
        fs.writeFileSync(f, handleLine, 'utf8');
        parts.push(`drawtext=fontfile='${FONT}':textfile='${f}':fontsize=82:fontcolor=white:` +
          `box=1:boxcolor=${brand}@0.92:boxborderw=24:shadowcolor=black@0.4:shadowx=3:shadowy=3:` +
          `x=(w-text_w)/2:y=${ctaLines.length ? 800 + ctaLines.length * ctaFit.lh + 36 : 880}:enable='between(t,${closeStart},${total})'`);
      }
      textFilters.push(parts.join(','));
    }

    // ---------- Audio: el suyo manda; música solo si el video es mudo ----------
    const musicFile = info.hasAudio ? null : pickMusicFile(opts.mood, opts.musicSeed);
    const args = ['-ss', String(segStart.toFixed(2)), '-t', String(segDur.toFixed(2)), '-i', file];
    let musicIdx = -1;
    if (musicFile) { args.push('-stream_loop', '-1', '-i', musicFile); musicIdx = 1; }
    else if (!info.hasAudio) { args.push('-f', 'lavfi', '-t', String(segDur.toFixed(2)), '-i', 'anullsrc=r=48000:cl=stereo'); musicIdx = -2; }

    const fc = [];
    const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`, cropFocusExpr(foc.x, foc.y), `fps=${FPS}`, 'setsar=1', 'format=yuv420p',
      'fade=t=in:st=0:d=0.25', `fade=t=out:st=${(total - 0.45).toFixed(2)}:d=0.45`, ...textFilters].filter(Boolean).join(',');
    fc.push(`[0:v]${vf}[vout]`);
    if (info.hasAudio) {
      fc.push(`[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${segDur.toFixed(2)},atrim=0:${segDur.toFixed(2)},volume=1.0,afade=t=in:st=0:d=0.3,afade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8[aout]`);
    } else if (musicIdx === 1) {
      fc.push(`[1:a]atrim=0:${total},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.9,afade=t=in:st=0:d=0.4,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[aout]`);
    } else {
      fc.push(`[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
    }
    const outName = `reel-single-${tag}.mp4`;
    const outPath = path.join(mediaDir, outName);
    args.push(
      '-filter_complex', fc.join(';'),
      '-map', '[vout]', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart', '-video_track_timescale', '30000',
      '-t', String(total), outPath,
    );
    await runFfmpeg(args);

    // ---------- Portada: el mejor frame medido del reel terminado ----------
    let coverPath = null;
    const bestOut = await bestFrameTimeIn(outPath, total, { samples: 5, tmpDir });
    const coverName = `reel-single-${tag}-cover.jpg`;
    const coverAbs = path.join(mediaDir, coverName);
    try {
      await runFfmpeg(['-ss', String(bestOut ? bestOut.t : Math.min(0.5, total / 2)), '-i', outPath, '-frames:v', '1', '-q:v', '3', coverAbs]);
      if (fs.existsSync(coverAbs)) coverPath = coverAbs;
    } catch (e) { /* la portada es un plus; el reel manda */ }

    return {
      file: outPath, url: `/media/${outName}`, duration: total,
      coverPath, music: !!musicFile, singleClip: true,
      segmentStart: Math.round(segStart * 100) / 100, segmentDur: total,
      focus: foc, clientAudio: !!info.hasAudio,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { buildReelPro, buildReelV3, buildSingleClipReel, detectFocus, bestFrameTimeIn, measureFrameQuality, moodForCategory, wrapLines, MUSIC_TRACKS, MUSIC_CATALOG, pickMusicFile, moodTracksFor, MOTION_TEMPLATES, templateFor, movementPlanFor, measureAdvance, findKeyword };
