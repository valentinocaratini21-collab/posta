'use strict';
/* =====================================================================
 * media-cliente.js — Mejoras de fotos y videos del cliente, 2ª tanda
 * (autorizada por Valentino 27/10/2026, «dale. arma todo», los 6).
 * Helpers PUROS (sin db, sin IA, sin red). Reglas duras que este
 * módulo hace cumplir en código, no en promesas:
 *   · Nunca cortar el producto ni el sujeto: un recorte solo existe
 *     si hay caja de sujeto y queda ENTERA dentro del recorte; si no,
 *     ese formato NO se produce (modo 'pad', sin corte, siempre).
 *   · Misma foto reconocible, nunca regeneración: la limpieza y los
 *     subtítulos/recortes viajan como PROPUESTA con acepto del dueño.
 *   · Texto de subtítulos solo real: transcripción Whisper del audio
 *     o texto del caption del borrador; nunca inventado.
 *   · Producto solo con evidencia: pick del dueño o match exacto
 *     (bordes de palabra, un solo producto); si no, sin clasificar
 *     y se pregunta, nunca se adivina.
 * ===================================================================== */

// Etiquetas amables de los issues del gate de calidad (v237).
const ISSUE_LABEL_ES = {
  oscura: 'se ve oscura',
  movida: 'salió movida',
  'baja-res': 'tiene poca definición',
  cortada: 'quedó cortada',
};
const ISSUE_LABEL_EN = {
  oscura: 'looks dark',
  movida: 'came out blurry',
  'baja-res': 'low resolution',
  cortada: 'came out cropped',
};
function issueLabel(issue, en) {
  const table = en ? ISSUE_LABEL_EN : ISSUE_LABEL_ES;
  return table[issue] || issue;
}
function issuesText(issues, en) {
  return (issues || []).map((i) => issueLabel(i, en)).join(en ? ' and ' : ' y ');
}

// Formatos de salida: feed 4:5, historia 9:16, portada 1:1.
const FORMATS = [
  { key: 'feed', w: 1080, h: 1350 },
  { key: 'historia', w: 1080, h: 1920 },
  { key: 'portada', w: 1080, h: 1080 },
];

// Plan de variante para UNA foto y UN formato.
//   srcW/srcH: dimensiones reales.
//   subjectBox: {x, y, w, h} en píxeles de la foto original, o null.
// Devuelve:
//   { mode: 'pad', ... }  — siempre producible: la foto entera cabe
//     (fondo difuminado, cero corte). Nunca corta nada.
//   { mode: 'crop', rect } — solo si subjectBox existe y queda ENTERA
//     dentro del rectángulo de recorte (con 2% de margen).
//   { mode: 'refused', reason } — recorte sin caja de sujeto, o con la
//     caja fuera del recorte: ese formato NO se hace y se reporta.
function cropPlan(srcW, srcH, fmt, subjectBox) {
  if (!srcW || !srcH) return { mode: 'refused', reason: 'sin-dimensiones' };
  const target = fmt.w / fmt.h;
  const src = srcW / srcH;
  if (Math.abs(src - target) < 0.005) {
    return { mode: 'crop', rect: { x: 0, y: 0, w: srcW, h: srcH }, note: 'ya-en-formato' };
  }
  // Rectángulo de recorte centrado para el aspecto objetivo.
  let cw, ch, cx, cy;
  if (src > target) { ch = srcH; cw = Math.round(srcH * target); cx = Math.round((srcW - cw) / 2); cy = 0; }
  else { cw = srcW; ch = Math.round(srcW / target); cx = 0; cy = Math.round((srcH - ch) / 2); }
  if (!subjectBox) return { mode: 'refused', reason: 'sin-caja-sujeto' };
  const m = 0.02; // 2% de margen dentro del recorte
  const bx = subjectBox.x, by = subjectBox.y, bw = subjectBox.w, bh = subjectBox.h;
  const inside = bx >= cx + cw * m && by >= cy + ch * m &&
    (bx + bw) <= (cx + cw - cw * m) && (by + bh) <= (cy + ch - ch * m);
  if (!inside) return { mode: 'refused', reason: 'sujeto-fuera-recorte' };
  return { mode: 'crop', rect: { x: cx, y: cy, w: cw, h: ch } };
}

// SRT desde texto REAL (transcripción o caption), repartido en cues de
// hasta ~42 caracteres, sin partir palabras, sobre la duración real.
// Sin texto no hay SRT (null): nunca subtítulos inventados.
function srtFromText(text, durSec) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean || !durSec || durSec <= 0) return null;
  const words = clean.split(' ');
  const cues = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 42 && cur) { cues.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) cues.push(cur.trim());
  const per = durSec / cues.length;
  const fmt = (s) => {
    const ms = Math.floor((s % 1) * 1000);
    const t = Math.floor(s);
    const hh = String(Math.floor(t / 3600)).padStart(2, '0');
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const ss = String(t % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss},${String(ms).padStart(3, '0')}`;
  };
  return cues.map((c, i) => `${i + 1}\n${fmt(i * per)} --> ${fmt((i + 1) * per)}\n${c}\n`).join('\n');
}

// Ventana de recorte sugerida alrededor del mejor momento (segundo
// bestT, del muestreo de frames): máx. 30 s, centrada cuando se puede,
// siempre dentro de [0, dur]. Pura matemática, sin adivinar contenido.
function trimWindow(durSec, bestT, maxLen) {
  const dur = Number(durSec) || 0;
  if (dur <= 0) return null;
  const max = Math.min(maxLen || 30, dur);
  let t = (bestT === null || bestT === undefined || isNaN(bestT)) ? dur / 2 : Number(bestT);
  t = Math.max(0, Math.min(dur, t));
  let start = t - max / 2;
  if (start < 0) start = 0;
  if (start + max > dur) start = dur - max;
  return { start: Math.round(start * 10) / 10, end: Math.round((start + max) * 10) / 10 };
}

// Producto con evidencia: match EXACTO por bordes de palabra contra la
// lista real de productos del negocio; si 0 o 2+ coinciden, null (se
// pregunta, nunca se adivina). `productos` = nombres reales (dna).
function productoDeEvidencia(texto, productos) {
  const t = String(texto || '');
  if (!t || !Array.isArray(productos) || !productos.length) return null;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = [];
  for (const p of productos) {
    const name = String(p || '').trim();
    if (!name) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(name)}([^\\p{L}\\p{N}]|$)`, 'iu');
    if (re.test(t)) hits.push(name);
  }
  return hits.length === 1 ? hits[0] : null;
}

// Nombres de propuesta (misma convención que enhance: sufijo antes de
// la extensión; nunca sobrescriben la mostrada).
function proposalName(fileName, suffix) {
  const out = String(fileName).replace(/(\.[a-z0-9]+)$/i, `-${suffix}$1`);
  return out === fileName ? `${fileName}-${suffix}` : out;
}

// --- Agregados 2ª tanda, segunda oleada (27/10, 18 ítems) ----------------
// Movimiento medio de vidstabdetect (formato .trf: listas LM con dx dy).
// Sin vectores: null. Umbral calibrado en video sintético: quieto ≈ 0–1,
// con saltos de mano ≈ 10+.
function parseVidstabShake(trfText) {
  const re = /\(LM\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
  let m; let sum = 0; let n = 0;
  const text = String(trfText || '');
  while ((m = re.exec(text))) { sum += Math.abs(parseFloat(m[1])) + Math.abs(parseFloat(m[2])); n++; }
  if (!n) return null;
  return sum / n;
}
const SHAKE_UMBRAL = 3;
const LUM_OSCURO_VIDEO = 80;
// ¿El video se puede mejorar? Solo dos razones medibles: oscuro
// (luminancia mediana < 80) o movido (shake medio > 3). Si ninguna,
// no aparece nada: un video que ya está bien no se toca.
function videoMejorable(lumMedian, shake) {
  const razones = [];
  if (typeof lumMedian === 'number' && lumMedian < LUM_OSCURO_VIDEO) razones.push('oscuro');
  if (typeof shake === 'number' && shake > SHAKE_UMBRAL) razones.push('movido');
  return { mejorable: razones.length > 0, razones };
}
// Mejor foto entre varias del mismo producto: criterios medibles
// (nitidez, luz, resolución). Devuelve PALABRAS, nunca puntajes.
// Menos de 2 fotos: null (no hay sugerencia).
function rankFotos(photos) {
  const list = (photos || []).filter((p) => p && typeof p.edge === 'number');
  if (list.length < 2) return null;
  const lumScore = (lum) => 1 - Math.min(1, Math.abs((lum || 120) - 120) / 120);
  const sizeScore = (s) => Math.min(1, (s || 0) / 1080);
  const scored = list.map((p) => ({
    p,
    score: Math.min(1, p.edge / 20) * 0.5 + lumScore(p.lum) * 0.3 + sizeScore(p.minSide) * 0.2,
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0].p;
  const motivosES = [];
  const motivosEN = [];
  if (best.edge >= Math.max(...list.map((x) => x.edge))) { motivosES.push('la más nítida'); motivosEN.push('the sharpest'); }
  if (Math.abs((best.lum || 120) - 120) <= Math.min(...list.map((x) => Math.abs((x.lum || 120) - 120)))) { motivosES.push('con mejor luz'); motivosEN.push('the best lit'); }
  if ((best.minSide || 0) >= Math.max(...list.map((x) => x.minSide || 0))) { motivosES.push('con más resolución'); motivosEN.push('the highest resolution'); }
  return { bestId: best.id, motivosES, motivosEN };
}
function hexRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
// Aviso de paleta: distancia media de cada color dominante de la foto
// a la paleta del feed. >90 = desentona. Solo aviso, nunca bloqueo.
function paletteAviso(photoHexes, paletteHexes) {
  const photos = (photoHexes || []).map(hexRgb).filter(Boolean);
  const pal = (paletteHexes || []).map(hexRgb).filter(Boolean);
  if (!photos.length || !pal.length) return { aviso: false, distMedia: null, razon: 'sin-paleta' };
  const dist = (c, p) => Math.sqrt((c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + (c[2] - p[2]) ** 2);
  const mins = photos.map((c) => Math.min(...pal.map((p) => dist(c, p))));
  const media = mins.reduce((a, b) => a + b, 0) / mins.length;
  return { aviso: media > 90, distMedia: Math.round(media), razon: media > 90 ? 'desentona' : 'combina' };
}
// Caja de sujeto válida (0–1000): área entre 5% y 85%, dentro del marco.
function validBokehBox(box) {
  if (!box) return false;
  const { x, y, w, h } = box;
  if ([x, y, w, h].some((v) => typeof v !== 'number' || isNaN(v))) return false;
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1000 || y + h > 1000) return false;
  const area = (w * h) / 1000000;
  return area >= 0.05 && area <= 0.85;
}
// Ángulo de visión: JSON {"angulo": grados, "confianza": "alta|baja"}.
// Fuera de ±45° o sin datos: null (no se endereza a ciegas).
function parseVisionAngle(raw) {
  try {
    const j = JSON.parse(String(raw || '').trim());
    if (j && typeof j.angulo === 'number' && Math.abs(j.angulo) <= 45) return { angulo: j.angulo, confianza: String(j.confianza || 'baja') };
  } catch (e) {}
  const m = /"angulo"\s*:\s*(-?[\d.]+)/.exec(String(raw || ''));
  const c = /"confianza"\s*:\s*"(alta|media|baja)"/.exec(String(raw || ''));
  if (m && Math.abs(parseFloat(m[1])) <= 45) return { angulo: parseFloat(m[1]), confianza: c ? c[1] : 'baja' };
  return null;
}
// Caja de visión: JSON {"x":..,"y":..,"w":..,"h":..} en 0–1000.
function parseVisionBox(raw) {
  let j = null;
  try { j = JSON.parse(String(raw || '').trim()); } catch (e) {}
  if (!j) {
    const m = /\{\s*"x"\s*:\s*([\d.]+)\s*,\s*"y"\s*:\s*([\d.]+)\s*,\s*"w"\s*:\s*([\d.]+)\s*,\s*"h"\s*:\s*([\d.]+)\s*\}/.exec(String(raw || ''));
    if (m) j = { x: parseFloat(m[1]), y: parseFloat(m[2]), w: parseFloat(m[3]), h: parseFloat(m[4]) };
  }
  if (!j) return null;
  const box = { x: Number(j.x), y: Number(j.y), w: Number(j.w), h: Number(j.h) };
  if (!validBokehBox(box)) return null;
  return box;
}
// Cortes por escena → piezas: bordes en 0 y duración; las piezas
// menores de 3 s se fusionan con la anterior (nunca piezas inútiles).
function sceneSegments(cuts, dur, minLen) {
  const min = minLen || 3;
  if (!(dur > 0)) return [];
  const bounds = [0, ...(cuts || []).filter((c) => c > 0 && c < dur).sort((a, b) => a - b), dur];
  const segs = [];
  for (let i = 0; i < bounds.length - 1; i++) segs.push({ start: bounds[i], end: bounds[i + 1] });
  const out = [];
  segs.forEach((s) => {
    if (s.end - s.start < min && out.length) out[out.length - 1].end = s.end;
    else out.push({ ...s });
  });
  if (out.length > 1 && out[out.length - 1].end - out[out.length - 1].start < min) {
    const last = out.pop();
    out[out.length - 1].end = last.end;
  }
  return out.map((s) => ({ start: Math.round(s.start * 10) / 10, end: Math.round((s.end * 10)) / 10 }));
}
// Ánimo de la biblioteca licenciada de Posty, por prefijo de archivo.
// Solo estos archivos existen como fuente: nunca Spotify ni IG.
function musicMood(file) {
  const f = String(file || '').toLowerCase();
  if (f.startsWith('chill')) return 'tranquilo';
  if (f.startsWith('groove')) return 'alegre';
  if (f.startsWith('upbeat')) return 'enérgico';
  return null;
}
const MUSIC_MOODS = ['alegre', 'tranquilo', 'enérgico'];

// --- Agregados 2ª tanda, tercera oleada (reels y negocio) ---------------
// Cadena xfade para N clips: offsets acumulados, duración total.
// fade=0 → null (concat simple, sin transiciones).
function xfadeChain(durations, fade) {
  const ds = (durations || []).filter((d) => d > 0);
  if (ds.length < 2) return null;
  const f = fade || 0;
  if (!(f > 0)) return null;
  if (ds.some((d) => d <= f)) return null;
  const parts = [];
  let cur = '[0:v]';
  let off = 0;
  for (let i = 1; i < ds.length; i++) {
    off += ds[i - 1] - (i === 1 ? 0 : 0);
    const offset = ds.slice(0, i).reduce((a, b) => a + b, 0) - i * f;
    parts.push(`${cur}[${i}:v]xfade=transition=fade:duration=${f}:offset=${offset.toFixed(2)}[v${i}]`);
    cur = `[v${i}]`;
  }
  const total = ds.reduce((a, b) => a + b, 0) - (ds.length - 1) * f;
  return { filter: parts.join(';'), total: Math.round(total * 100) / 100, out: cur };
}
// Zoom Ken Burns seguro: la foto va en un lienzo con 5% de margen por
// lado (90% útil). Con caja del producto (0–1000 en la foto), la caja
// se mapea al lienzo y Z se limita para que nunca se corte. Sin caja:
// Z=1.08 (el margen lo garantiza). Z < 1.02 → null (no se hace).
function kenburnsZoom(caja) {
  if (!caja) return { z: 1.08, margen: 0.05 };
  if (!validBokehBox(caja)) return null;
  const mx = 0.05 + 0.9 * (caja.x / 1000);
  const my = 0.05 + 0.9 * (caja.y / 1000);
  const mx2 = 0.05 + 0.9 * ((caja.x + caja.w) / 1000);
  const my2 = 0.05 + 0.9 * ((caja.y + caja.h) / 1000);
  const m = Math.min(mx, my, 1 - mx2, 1 - my2);
  if (m < 0.005) return null;
  const zMax = 1 / (1 - 2 * m);
  if (zMax < 1.02) return null;
  return { z: Math.min(1.15, Math.round(zMax * 100) / 100), margen: m };
}
// Hex #rrggbb → color ASS &HBBGGRR& (para subtítulos con estilo).
function assColor(hex) {
  const rgb = hexRgb(hex);
  if (!rgb) return null;
  const p = (v) => v.toString(16).padStart(2, '0').toUpperCase();
  return `&H${p(rgb[2])}${p(rgb[1])}${p(rgb[0])}&`;
}
// Texto real → ASS con palabras clave en el color del negocio.
// Solo palabras que ESTÁN en el texto (nunca agregadas): el resto del
// texto queda igual. Sin texto o sin duración: null.
function assFromText(text, dur, keywords, colorAss, fontName) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean || !(dur > 0)) return null;
  const words = clean.split(' ');
  const cues = [];
  for (let i = 0; i < words.length; i += 8) cues.push(words.slice(i, i + 8));
  const kws = (keywords || []).map((k) => String(k || '').trim().toLowerCase()).filter(Boolean);
  const escRe2 = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const paint = (cueWords) => cueWords.map((w) => {
    const bare = w.toLowerCase().replace(/^[^a-záéíóúñ0-9]+|[^a-záéíóúñ0-9]+$/gi, '');
    if (kws.includes(bare) && colorAss) return `{\\c${colorAss}}${w}{\\c}`;
    return w;
  }).join(' ');
  const fmt = (s) => {
    const t = Math.floor(s);
    const cs = Math.floor((s - t) * 100);
    return `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Alignment, MarginV\nStyle: Default,' + (fontName || 'DejaVu Sans') + ',26,&HFFFFFF&,&H80000000&,&H80000000&,0,1,2,2,120\n[Events]\nFormat: Layer, Start, End, Style, Text\n';
  let t = 0;
  const lines = cues.map((cue, i) => {
    const d = i === cues.length - 1 ? Math.max(1.2, dur - t) : Math.max(1.2, (dur * cue.length) / words.length);
    const line = `Dialogue: 0,${fmt(t)},${fmt(t + d)},Default,,0,0,0,,${paint(cue)}`;
    t += d;
    return line;
  });
  return header + lines.join('\n') + '\n';
}
// Cadena atempo para velocidades >2x (cada atempo acepta 0.5–2.0).
function atempoChain(speed) {
  if (!(speed >= 0.5) || speed > 16) return null;
  let rest = speed;
  const parts = [];
  while (rest > 2.0) { parts.push('atempo=2.0'); rest /= 2.0; }
  parts.push(`atempo=${Math.round(rest * 1000) / 1000}`);
  return parts.join(',');
}
function lumBucket(lum) {
  if (typeof lum !== 'number') return null;
  if (lum < 60) return 'oscura';
  if (lum > 170) return 'clara';
  return 'normal';
}
function aspectLabel(w, h) {
  if (!w || !h) return null;
  if (h > w * 1.1) return 'vertical';
  if (w > h * 1.1) return 'horizontal';
  return 'cuadrada';
}

// Fecha real de vencimiento desde texto libre: 'YYYY-MM-DD' o
// 'DD/MM/YYYY' / 'DD-MM-YYYY' con fecha válida. Si no parsea: null.
function vigenciaParse(texto) {
  const t = String(texto || '');
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }
  m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(t);
  if (m) {
    const dd = String(+m[1]).padStart(2, '0'), mm = String(+m[2]).padStart(2, '0');
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    if (d.getUTCFullYear() === +m[3] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[1]) return `${m[3]}-${mm}-${dd}`;
    return null;
  }
  return null;
}

module.exports = {
  ISSUE_LABEL_ES,
  ISSUE_LABEL_EN,
  issueLabel,
  issuesText,
  FORMATS,
  cropPlan,
  srtFromText,
  trimWindow,
  productoDeEvidencia,
  proposalName,
  parseVidstabShake,
  SHAKE_UMBRAL,
  LUM_OSCURO_VIDEO,
  videoMejorable,
  rankFotos,
  hexRgb,
  paletteAviso,
  validBokehBox,
  parseVisionAngle,
  parseVisionBox,
  sceneSegments,
  musicMood,
  MUSIC_MOODS,
  xfadeChain,
  kenburnsZoom,
  assColor,
  assFromText,
  atempoChain,
  lumBucket,
  aspectLabel,
  vigenciaParse,
};
