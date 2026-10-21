// talking-reel.js — REEL HABLADO de Posty (2026-10-21, spec en
// equipo-posty/spec-reel-hablado.md, mandato de Valentino "Arma todo").
//
// El cliente sube un video corto del dueño/empleado HABLANDO (desde el
// momento semanal del álbum o directo a su pieza) y Posty lo devuelve
// como reel editado:
//   1) Transcripción FIEL con Whisper (whisper-1, timestamps por palabra,
//      mismo proveedor/endpoint que las notas de voz del ADN — server.js
//      transcribeAudio — sumando granularidad por palabra).
//   2) Detección de menciones de productos/servicios contra el FUNDAMENTO
//      (client-digest): las menciones y los cortes nacen del digest de ESE
//      cliente (test de pertenencia), nunca de una lista genérica.
//   3) Edición por código (ffmpeg): subtítulos cinéticos palabra por
//      palabra en la banda inferior segura, cortes a la foto real del
//      producto donde la imagen EXPLICA lo que se dice (proceso, material,
//      dato), punch-ins suaves alternados y placa de cierre con su paleta.
//
// REGLAS DURAS de la spec (no negociar):
//   - FIDELIDAD: el subtítulo es la palabra exacta que dijo la persona.
//     Nada de inventar, resumir ni reordenar dentro del subtítulo.
//   - ARMONÍA: la persona es la protagonista. Máximo 2–4 cortes según el
//     largo (nunca dos pegados: respiro ≥3,8 s entre cortes), una sola
//     gramática visual. Test: "persona explicando" ≠ "diapositivas con
//     voz". Si no hay foto del producto, NO se corta: va una placa de
//     dato sobre la persona (nunca un visual falso del producto).
//   - LA CARA NO SE EDITA: solo se edita alrededor (cortes, textos,
//     placas, zoom de cámara). Sin filtros sobre la persona.
//   - CERO ÉXITO FALSO: si la transcripción falla, el trabajo queda
//     'failed' con el motivo — no se crea ningún borrador. Si no se
//     detectan menciones, el borrador sale SOLO con subtítulos y su
//     strategy_why lo dice tal cual.
//   - COSTO MEDIDO: cada transcripción se loguea vía costs.logApiCost
//     (whisper-1 = USD 0,006/min, tabla de costs.js) y el tiempo de
//     render queda guardado en el job.
//
// Fail-closed de claves: sin OPENAI_API_KEY (ni en settings del usuario
// ni en el entorno), el job falla con 'sin_clave_openai' — el pipeline
// queda construido pero no inventa resultados.

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const W = 1080;
const H = 1920;
const FPS = 30;
const XFADE = 0.3;              // transición única de todo el reel (gramática visual)
const HOOK_SEC = 2.3;           // el gancho ocupa los primeros segundos, sin cortes
const MIN_GAP = 3.8;            // respiro mínimo entre cortes (armonía)
const PLATE_SEC = 2.2;          // placa de cierre
const WHISPER_PER_MIN = 0.006;  // espejo de costs.js MODEL_PRICES['whisper-1']

function resolveFont(file) {
  const cands = [
    path.join(__dirname, 'fonts', file),
    path.join(__dirname, 'assets', 'fonts', file),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return cands[0];
}
const FONT_XB = () => resolveFont('Montserrat-800.ttf');
const FONT_SB = () => resolveFont('Montserrat-600.ttf');

function runFfmpeg(args, timeoutMs = 900000) {
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
  const streams = (p && p.streams) || [];
  const v = streams.find(s => s.codec_type === 'video');
  const a = streams.find(s => s.codec_type === 'audio');
  return {
    duration: parseFloat(p && p.format && p.format.duration) || 0,
    hasVideo: !!v, hasAudio: !!a,
    width: v ? v.width : 0, height: v ? v.height : 0,
  };
}

function localFile(mediaDir, mediaPath) {
  if (!mediaPath) return null;
  const f = path.join(mediaDir, path.basename(String(mediaPath)));
  try { return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// Texto: normalización SOLO para matchear (el subtítulo jamás la usa).
// ---------------------------------------------------------------------
function normTxt(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokensOf(s) { return normTxt(s).split(' ').filter(Boolean); }

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'con', 'sin', 'para', 'por', 'en', 'y', 'o', 'a', 'al', 'que', 'es', 'son', 'mi', 'tu', 'su', 'nuestro', 'nuestra', 'nuestros', 'nuestras', 'este', 'esta', 'esto', 'estos', 'estas', 'ese', 'esa']);

// Palabras que delatan que la frase EXPLICA (proceso, material, dato,
// tiempo): suben el valor explicativo de una mención.
const EXPLAIN_HINTS = new Set(['hora', 'horas', 'dia', 'dias', 'minuto', 'minutos', 'segundo', 'segundos', 'artesanal', 'artesanales', 'casero', 'casera', 'caseros', 'hecho', 'hecha', 'hechos', 'acero', 'inoxidable', 'cuero', 'madera', 'organico', 'organica', 'natural', 'naturales', 'fresco', 'fresca', 'recien', 'proceso', 'tostado', 'tostada', 'reposo', 'reposa', 'reposar', 'lento', 'lenta', 'mano', 'kilo', 'kilos', 'gramo', 'gramos', 'litro', 'litros', 'grados', 'relleno', 'cremoso', 'cremosa', 'intenso', 'intensa', 'suave', 'crocrante', 'crocante']);

// ---------------------------------------------------------------------
// 1) Transcripción con timestamps por palabra.
//    Mismo endpoint y patrón que server.transcribeAudio, pidiendo
//    verbose_json + granularidad por palabra. El audio se extrae antes
//    (uniforme, liviano: un video de 90 s queda en ~700 KB, lejos del
//    tope de 25 MB de la API aunque el video pese 60 MB).
// ---------------------------------------------------------------------
async function transcribeWithWords({ file, apiKey, lang = 'es', userId = null, logCost = null, fetchImpl = null, tmpDir = null }) {
  if (!apiKey) throw new Error('sin_clave_openai');
  const doFetch = fetchImpl || fetch;
  const dir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'talk-w-'));
  const audioFile = path.join(dir, 'audio.mp3');
  await runFfmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audioFile], 180000);
  const buf = fs.readFileSync(audioFile);
  if (!buf.length) throw new Error('sin_audio');
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (lang === 'es' || lang === 'en') form.append('language', lang);
  const r = await doFetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!r.ok) throw new Error(`whisper ${r.status}`);
  const j = await r.json();
  const words = (Array.isArray(j.words) ? j.words : [])
    .map(w => ({ w: String(w.word || '').trim(), s: Number(w.start) || 0, e: Number(w.end) || 0 }))
    .filter(w => w.w);
  if (!words.length) throw new Error('whisper_sin_timestamps');
  const segments = (Array.isArray(j.segments) ? j.segments : [])
    .map(sg => ({ text: String(sg.text || '').trim(), s: Number(sg.start) || 0, e: Number(sg.end) || 0 }))
    .filter(sg => sg.text);
  const duration = Number(j.duration) || (words.length ? words[words.length - 1].e : 0);
  const minutes = Math.max(0.05, duration / 60);
  if (typeof logCost === 'function') {
    try { logCost({ userId, feature: 'talking-reel', model: 'whisper-1', minutes }); } catch (e) {}
  }
  return {
    text: String(j.text || '').trim(),
    duration,
    words: restorePunctuation(words, segments),
    segments,
    costUsd: Math.round(minutes * WHISPER_PER_MIN * 1e6) / 1e6,
  };
}

// ---------------------------------------------------------------------
// 2) Detección de menciones contra el fundamento.
// ---------------------------------------------------------------------
function digestTargets(digest) {
  const out = [];
  const push = (item, kind) => {
    const name = typeof item === 'string' ? item : (item && item.nombre) || '';
    if (!name) return;
    const toks = tokensOf(name);
    if (!toks.length) return;
    const content = toks.filter(t => !STOP.has(t));
    const variants = [];
    const seen = new Set();
    const addVar = (arr) => {
      if (!arr.length) return;
      const key = arr.join(' ');
      if (seen.has(key)) return;
      seen.add(key);
      variants.push(arr);
    };
    addVar(toks);                                   // nombre completo
    if (content.length && content.length !== toks.length) addVar(content);
    for (let i = 0; i + 1 < content.length; i++) addVar([content[i], content[i + 1]]); // pares
    for (const t of content) if (t.length >= 4) addVar([t]);                            // token fuerte
    out.push({ name: String(name), kind, variants, foto: (item && (item.foto || item.imagen || item.photo)) || '' });
  };
  for (const p of (digest && digest.productos) || []) push(p, 'producto');
  for (const s of (digest && digest.servicios) || []) push(s, 'servicio');
  return out;
}

function starNameOf(digest) {
  if (!digest) return '';
  const inf = digest.inferred_star && digest.inferred_star.item;
  return String(digest.producto_estrella || inf || '');
}

// Frase (segmento de Whisper) que contiene un instante dado.
function sentenceAt(segments, words, t) {
  for (const sg of segments || []) if (t >= sg.s - 0.05 && t <= sg.e + 0.35) return sg;
  // Fallback: palabras entre pausas largas alrededor de t.
  let a = 0, b = words.length - 1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].s <= t) a = i;
    if (words[i].e >= t && b === words.length - 1) { /* sigue */ }
  }
  let lo = a, hi = a;
  while (lo > 0 && words[lo].s - words[lo - 1].e < 0.6) lo--;
  while (hi < words.length - 1 && words[hi + 1].s - words[hi].e < 0.6) hi++;
  const slice = words.slice(lo, hi + 1);
  return { text: slice.map(w => w.w).join(' '), s: slice[0].s, e: slice[slice.length - 1].e };
}

// Placa de dato: la ORACIÓN que explica dentro del segmento (un segmento
// de Whisper puede traer varias oraciones: la placa es solo la que
// contiene la mención, nunca el saludo de al lado). Sale de las palabras
// dichas, jamás inventada; si la oración es larga, ventana alrededor de
// la mención.
function factFromWords(sentWords, mentionIdx) {
  if (!sentWords || !sentWords.length) return '';
  let start = 0, end = sentWords.length - 1, s0 = 0;
  for (let i = 0; i < sentWords.length; i++) {
    if (/[.!?…]$/.test(sentWords[i].w) || i === sentWords.length - 1) {
      if (mentionIdx >= s0 && mentionIdx <= i) { start = s0; end = i; break; }
      s0 = i + 1;
    }
  }
  let slice = sentWords.slice(start, end + 1);
  if (slice.length > 11) {
    const lo = Math.max(0, (mentionIdx - start) - 3);
    slice = slice.slice(lo, lo + 9);
    // La ventana no puede terminar en un conector colgando ("…todos los").
    while (slice.length > 4 && /^(de|la|el|los|las|un|una|unos|unas|y|o|que|en|con|para|por|del|al)$/i.test(slice[slice.length - 1].w.replace(/[.,;:!?…]+$/, ''))) slice.pop();
  }
  const txt = slice.map(w => w.w).join(' ').replace(/\s+/g, ' ').trim();
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function detectMoments({ words, segments, digest, duration }) {
  const targets = digestTargets(digest);
  const star = normTxt(starNameOf(digest));
  const stream = (words || []).map(w => normTxt(w.w));
  const candidates = [];
  for (const tg of targets) {
    let best = null;
    for (const variant of tg.variants) {
      const L = variant.length;
      for (let i = 0; i + L <= stream.length; i++) {
        let hit = true;
        for (let k = 0; k < L; k++) if (stream[i + k] !== variant[k]) { hit = false; break; }
        if (hit) {
          if (!best || L > best.len || (L === best.len && i < best.at)) best = { at: i, len: L };
          break; // esta variante ya matcheó; alcanza el primer hit
        }
      }
    }
    if (!best) continue;
    const w0 = words[best.at];
    const sent = sentenceAt(segments, words, w0.s);
    const sentWords = words.filter(w => w.s >= sent.s - 0.05 && w.e <= sent.e + 0.35);
    const localIdx = Math.max(0, sentWords.findIndex(w => Math.abs(w.s - w0.s) < 0.05));
    const sentToks = tokensOf(sent.text);
    let score = 1;
    if (sentToks.some(t => EXPLAIN_HINTS.has(t) || /\d/.test(t))) score += 1; // explica: dato/proceso/material
    if (star && normTxt(tg.name) === star) score += 1;                          // es el estrella
    if (best.len >= 2) score += 0.5;                                            // match de nombre completo
    candidates.push({
      product: tg.name, kind: tg.kind, fotoDigest: tg.foto || '',
      start: w0.s, score,
      sentence: sent.text,
      fact: factFromWords(sentWords, localIdx),
    });
  }
  // Gancho: la oración del mejor momento; si no hay momentos, la primera.
  let hook = { text: '', s: 0, e: 0 };
  if (candidates.length) {
    const top = [...candidates].sort((a, b) => b.score - a.score || a.start - b.start)[0];
    hook = { text: top.sentence, s: top.start, e: top.start + 2 };
  } else if (segments && segments.length) {
    hook = { text: segments[0].text, s: segments[0].s, e: segments[0].e };
  } else if (words && words.length) {
    hook = { text: words.slice(0, 10).map(w => w.w).join(' '), s: words[0].s, e: words[Math.min(9, words.length - 1)].e };
  }
  hook.text = String(hook.text || '').replace(/\s+/g, ' ').trim().slice(0, 110);

  // Armonía: pocos cortes, con respiro, fuera del gancho y del cierre.
  const maxCuts = duration <= 22 ? 2 : duration <= 40 ? 3 : 4;
  const usableEnd = duration - 0.6;
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.start - b.start);
  const picked = [];
  for (const c of ranked) {
    if (picked.length >= maxCuts) break;
    const start = Math.max(HOOK_SEC, c.start - 0.15);
    const end = Math.min(start + 2.2, usableEnd);
    if (end - start < 1.6) continue;
    if (picked.some(p => Math.abs(p.start - start) < MIN_GAP)) continue;
    picked.push({ ...c, start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 });
  }
  picked.sort((a, b) => a.start - b.start);
  return { moments: picked, hook, candidates: candidates.length };
}

// ---------------------------------------------------------------------
// 3) Foto real del cliente para un producto: primero la que el digest
//    asocie, después posteos cuyo texto nombre el producto, después una
//    foto del álbum categorizada como producto. Sin match: null (la
//    spec prohíbe disfrazar un visual genérico de producto exacto).
// ---------------------------------------------------------------------
function pickPhotoForProduct({ db, uid, mediaDir, productName, digestFoto }) {
  if (digestFoto) {
    const f = localFile(mediaDir, digestFoto);
    if (f) return f;
  }
  const toks = tokensOf(productName).filter(t => !STOP.has(t) && t.length >= 4);
  if (!toks.length || !db) return null;
  const scoreText = (txt) => {
    const n = normTxt(txt);
    return toks.reduce((acc, t) => acc + (n.includes(t) ? 1 : 0), 0);
  };
  try {
    const posts = db.prepare(`SELECT image_path, caption, source_topic FROM posts WHERE user_id = ? AND media_type = 'image' AND image_path <> '' ORDER BY created_at DESC LIMIT 24`).all(uid);
    let best = null, bestScore = 0;
    for (const p of posts) {
      const sc = scoreText(`${p.caption || ''} ${p.source_topic || ''}`);
      if (sc > bestScore) { const f = localFile(mediaDir, p.image_path); if (f) { best = f; bestScore = sc; } }
    }
    if (best && bestScore >= 1) return best;
  } catch (e) {}
  try {
    const rows = db.prepare(`SELECT file_path FROM assets WHERE user_id = ? AND kind = 'photo' AND album_tag = 'producto' ORDER BY created_at DESC LIMIT 4`).all(uid);
    for (const r of rows) { const f = localFile(mediaDir, r.file_path); if (f) return f; }
  } catch (e) {}
  return null;
}

// ---------------------------------------------------------------------
// 4) ASS: subtítulos cinéticos palabra por palabra + placas de dato +
//    gancho. Todo el texto vive SOLO en bandas (abajo los subtítulos,
//    arriba gancho y placas): nunca el centro, nunca sobre la cara.
// ---------------------------------------------------------------------
function assTime(t) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
  const c = Math.round((t - Math.floor(t)) * 100);
  const cc = c === 100 ? 99 : c;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cc).padStart(2, '0')}`;
}
function hexToAss(hex, alpha = '00') {
  const m = String(hex || '').match(/#?([0-9a-fA-F]{6})/);
  const v = m ? m[1] : '2793C8';
  const r = v.slice(0, 2), g = v.slice(2, 4), b = v.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`;
}
function assEsc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r?\n/g, ' ');
}
// Whisper devuelve las palabras SIN puntuación y los segmentos CON
// puntuación. Si por segmento los conteos coinciden, cada palabra adopta
// el token del segmento (la misma palabra, con su puntuación real): los
// subtítulos quedan como se dijo el texto y las oraciones se pueden
// cortar para las placas. Sin coincidencia, se deja la palabra cruda.
function restorePunctuation(words, segments) {
  if (!Array.isArray(words) || !words.length || !Array.isArray(segments) || !segments.length) return words;
  const out = words.map(w => ({ ...w }));
  for (const seg of segments) {
    const toks = String(seg.text || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const idxs = [];
    out.forEach((w, i) => { if (w.s >= seg.s - 0.05 && w.s < seg.e - 0.01) idxs.push(i); });
    if (idxs.length !== toks.length) continue;
    idxs.forEach((wi, k) => { out[wi] = { ...out[wi], w: toks[k] }; });
  }
  return out;
}
function phraseGroups(words) {
  const groups = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const w = words[i];
    const next = words[i + 1];
    const gap = next ? next.s - w.e : 99;
    const endsSentence = /[.!?…]$/.test(w.w);
    if (cur.length >= 4 || gap > 0.5 || endsSentence || !next) { groups.push(cur); cur = []; }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function buildAss({ words, moments, hook, brandHex }) {
  const accent = hexToAss(brandHex || '#FEC14D');
  const head = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,Montserrat ExtraBold,64,&H00FFFFFF,&H00FFFFFF,&H96141414,&H00000000,-1,0,0,0,100,100,0,0,1,5,1,2,60,60,330,1`,
    `Style: Chip,Montserrat SemiBold,44,&H00FFFFFF,&H00FFFFFF,${hexToAss(brandHex || '#0A1E33', '30')},&H00000000,-1,0,0,0,100,100,0,0,3,14,0,8,70,70,120,1`,
    `Style: Hook,Montserrat ExtraBold,88,&H00FFFFFF,&H00FFFFFF,&H96141414,&H00000000,-1,0,0,0,100,100,0,0,1,6,2,8,60,60,150,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const lines = [...head];
  if (hook && hook.text) {
    lines.push(`Dialogue: 2,${assTime(0.1)},${assTime(HOOK_SEC)},Hook,,0,0,0,,${assEsc(hook.text)}`);
  }
  for (const g of phraseGroups(words || [])) {
    // Un evento por palabra CON ventana visible. Las palabras relámpago
    // (Whisper a veces les da el mismo inicio que a la siguiente: ventana
    // de 0–40 ms) no se descartan: se funden con la palabra vecina y se
    // resaltan juntas — cada palabra dicha se resalta exactamente una vez
    // y la frase nunca desaparece de pantalla entre eventos.
    const evs = [];
    let pending = [];
    for (let i = 0; i < g.length; i++) {
      const start = g[i].s;
      const end = i + 1 < g.length ? g[i + 1].s : g[i].e;
      if (end - start < 0.05 && i + 1 < g.length) { pending.push(i); continue; }
      const colored = new Set([...pending, i]);
      const evStart = pending.length ? g[pending[0]].s : start;
      if (end - evStart < 0.05 && evs.length) {
        evs[evs.length - 1].end = end;
        for (const k of colored) evs[evs.length - 1].colored.add(k);
      } else {
        evs.push({ start: evStart, end, colored });
      }
      pending = [];
    }
    for (const ev of evs) {
      const text = g.map((w, k) => ev.colored.has(k)
        ? `{\\c${accent}&\\b1}${assEsc(w.w)}{\\c&HFFFFFF&}`
        : assEsc(w.w)).join(' ');
      lines.push(`Dialogue: 0,${assTime(ev.start)},${assTime(ev.end)},Cap,,0,0,0,,${text}`);
    }
  }
  for (const mo of moments || []) {
    if (!mo.fact) continue;
    lines.push(`Dialogue: 1,${assTime(mo.start)},${assTime(mo.end)},Chip,,0,0,0,,${assEsc(mo.fact)}`);
  }
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------
// 5) Render: segmentos persona (punch-in alternado) + cortes a foto con
//    deriva suave + placa de cierre, unidos por xfade único; segunda
//    pasada quema subtítulos y normaliza el audio (la voz jamás se
//    altera: solo nivelación suave con loudnorm).
// ---------------------------------------------------------------------
function luminance(hex) {
  const m = String(hex || '').match(/#?([0-9a-fA-F]{6})/);
  if (!m) return 0;
  const v = m[1];
  const r = parseInt(v.slice(0, 2), 16) / 255, g = parseInt(v.slice(2, 4), 16) / 255, b = parseInt(v.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function drawtextEsc(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%');
}

async function renderTalkingReel({ inputFile, outFile, words, moments, hook, brandHex, handle, lang, tmpDir }) {
  const info = await mediaInfo(inputFile);
  if (!info || !info.hasVideo || !info.hasAudio) throw new Error('video_sin_audio_o_imagen');
  const dur = info.duration;
  if (!dur || dur < 3) throw new Error('video_muy_corto');
  const dir = tmpDir || fs.mkdtempSync(path.join(os.tmpdir(), 'talk-r-'));
  const assFile = path.join(dir, 'subs.ass');
  fs.writeFileSync(assFile, buildAss({ words, moments, hook, brandHex }));

  // Línea de tiempo: la persona manda; los cortes con foto la interrumpen
  // solo en los momentos elegidos (los sin foto quedan como placa ASS).
  const cuts = (moments || []).filter(m => m.photoFile);
  const segs = [];
  let cursor = 0;
  for (const c of cuts) {
    if (c.start > cursor + 0.05) segs.push({ type: 'person', from: cursor, to: c.start });
    segs.push({ type: 'insert', from: c.start, to: c.end, photo: c.photoFile });
    cursor = c.end;
  }
  if (cursor < dur - 0.05) segs.push({ type: 'person', from: cursor, to: dur });
  if (!segs.length) segs.push({ type: 'person', from: 0, to: dur });

  const inputs = ['-i', inputFile];
  const filters = [];
  // Base normalizada una sola vez (cualquier entrada → 1080×1920@30).
  filters.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p,setsar=1[base]`);
  const personSegs = segs.filter(s => s.type === 'person');
  if (personSegs.length > 1) filters.push(`[base]split=${personSegs.length}${personSegs.map((_, i) => `[bp${i}]`).join('')}`);
  else filters.push('[base]null[bp0]');
  const PUNCH = [1.0, 1.08, 1.03, 1.12, 1.05];
  const labels = [];
  let pIdx = 0;
  segs.forEach((sg, i) => {
    const len = Math.max(0.2, sg.to - sg.from);
    const out = `s${i}`;
    if (sg.type === 'person') {
      const p = PUNCH[pIdx % PUNCH.length]; pIdx++;
      const sw = Math.round(W * p / 2) * 2, sh = Math.round(H * p / 2) * 2;
      // Trim extendido +XFADE (lo consume el empalme) y tpad por si el
      // segmento cierra el video y no hay frames reales para extender.
      filters.push(`[bp${pIdx - 1}]trim=start=${sg.from.toFixed(3)}:end=${(sg.to + XFADE).toFixed(3)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${XFADE},scale=${sw}:${sh},crop=${W}:${H},fps=${FPS},format=yuv420p,setsar=1[${out}]`);
    } else {
      inputs.push('-loop', '1', '-framerate', String(FPS), '-t', (len + XFADE).toFixed(3), '-i', sg.photo);
      const idx = (inputs.filter(a => a === '-i').length) - 1;
      const frames = Math.max(2, Math.round((len + XFADE) * FPS));
      // zoompan con d=1: la entrada ya es video (foto loopeada); 'on'
      // avanza frame a frame y la deriva completa dura el segmento.
      filters.push(`[${idx}:v]scale=1296:2304,zoompan=z='1+0.05*on/${frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p,setsar=1[${out}]`);
    }
    labels.push(out);
  });
  // Placa de cierre (segmento final): paleta del negocio; el nombre del
  // negocio NO va impreso (regla de piezas 2026-10-18) — va su @ y una
  // línea de texto, jamás un botón dibujado.
  const plateHex = (brandHex && /#?[0-9a-fA-F]{6}/.test(brandHex)) ? brandHex.replace('#', '') : '0A1E33';
  const plateText = luminance('#' + plateHex) > 0.62 ? '0A1E33' : 'FFFFFF';
  const plateIdx = inputs.filter(a => a === '-i').length;
  inputs.push('-f', 'lavfi', '-i', `color=c=0x${plateHex}:s=${W}x${H}:r=${FPS}:d=${PLATE_SEC}`);
  const closeLine = lang === 'en' ? 'follow along for more' : 'seguinos para ver más';
  const handleTxt = handle ? drawtextEsc(handle) : '';
  let plateFilter = `[${plateIdx}:v]format=yuv420p,setsar=1`;
  if (handleTxt) {
    plateFilter += `,drawtext=fontfile='${FONT_XB()}':text='${handleTxt}':fontcolor=${plateText}:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2-70`;
    plateFilter += `,drawtext=fontfile='${FONT_SB()}':text='${drawtextEsc(closeLine)}':fontcolor=${plateText}:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2+60`;
  } else {
    plateFilter += `,drawtext=fontfile='${FONT_XB()}':text='${drawtextEsc(closeLine)}':fontcolor=${plateText}:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2`;
  }
  filters.push(plateFilter + '[plate]');
  labels.push('plate');

  // Cadena xfade: cada segmento (salvo el último) trae +XFADE de material
  // (trim extendido o loop más largo) que el empalme consume, así que el
  // offset del i-ésimo xfade es la suma de los largos de CONTENIDO
  // previos. Duración final = Σ largos = duración del habla + placa.
  // (Verificado por ffprobe en test-talking-reel.js.)
  const lengths = segs.map(sg => Math.max(0.2, sg.to - sg.from));
  lengths.push(PLATE_SEC);
  let prev = labels[0];
  for (let i = 1; i < labels.length; i++) {
    const offCalc = lengths.slice(0, i).reduce((a, b) => a + b, 0);
    const outL = i === labels.length - 1 ? 'vcat' : `x${i}`;
    filters.push(`[${prev}][${labels[i]}]xfade=transition=fade:duration=${XFADE}:offset=${offCalc.toFixed(3)}[${outL}]`);
    prev = outL;
  }
  const totalDur = dur + PLATE_SEC;
  const segFile = path.join(dir, 'timeline.mp4');
  await runFfmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[vcat]', '-an', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', segFile]);

  // Pasada final: subtítulos + audio original nivelado (apad hasta la placa).
  const assEscaped = assFile.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  await runFfmpeg([
    '-i', segFile, '-i', inputFile,
    '-filter_complex', `[0:v]ass='${assEscaped}'[v];[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=${PLATE_SEC + 1},atrim=0:${totalDur.toFixed(3)},afade=t=out:st=${(totalDur - 0.5).toFixed(3)}:d=0.5[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile,
  ]);
  const out = await mediaInfo(outFile);
  return { file: outFile, duration: out ? out.duration : totalDur, segments: segs.length, cuts: cuts.length };
}

// ---------------------------------------------------------------------
// 6) Orquestador: video → borrador en la Agenda.
// ---------------------------------------------------------------------
async function createTalkingReelDraft({ db, uid, inputFile, mediaDir, apiKey, weekKey, lang = 'es', logCost = null, transcribeImpl = null }) {
  const t0 = Date.now();
  const tr = transcribeImpl
    ? await transcribeImpl({ file: inputFile, apiKey, lang, userId: uid, logCost })
    : await transcribeWithWords({ file: inputFile, apiKey, lang, userId: uid, logCost });
  const digest = (() => { try { return require('./client-digest').getDigest(db, uid); } catch (e) { return null; } })();
  const trWords = restorePunctuation(tr.words, tr.segments);
  const { moments, hook } = detectMoments({ words: trWords, segments: tr.segments, digest, duration: tr.duration });
  for (const mo of moments) {
    mo.photoFile = pickPhotoForProduct({ db, uid, mediaDir, productName: mo.product, digestFoto: mo.fotoDigest });
  }
  let brandHex = '';
  let handle = '';
  try {
    const s = db.prepare('SELECT brand_colors FROM settings WHERE user_id = ?').get(uid);
    const m = String((s && s.brand_colors) || '').match(/#?[0-9a-fA-F]{6}/);
    if (m) brandHex = m[0].startsWith('#') ? m[0] : '#' + m[0];
    const p = db.prepare('SELECT business_name, ig_username FROM profiles WHERE user_id = ?').get(uid) || {};
    handle = p.ig_username ? '@' + String(p.ig_username).replace(/^@/, '') : '';
  } catch (e) {}
  const name = `talk-${uid}-${crypto.randomBytes(4).toString('hex')}.mp4`;
  const outFile = path.join(mediaDir, name);
  const render = await renderTalkingReel({
    inputFile, outFile, words: trWords, moments, hook,
    brandHex, handle, lang,
  });
  const renderMs = Date.now() - t0;
  // Caption del borrador: las PRIMERAS palabras del dueño (su texto, sin
  // inventar marketing: la edición fina del caption es del flujo normal).
  const capSentences = (tr.segments || []).slice(0, 2).map(s => s.text).join(' ');
  const caption = (capSentences || tr.text || '').slice(0, 240);
  const withPhoto = moments.filter(m => m.photoFile).length;
  const why = lang === 'en'
    ? (moments.length
      ? `Talking reel: the owner presents ${moments.map(m => m.product).join(' + ')} — subtitles from their own words, ${withPhoto} cut(s) to their real product photo${moments.length - withPhoto ? `, ${moments.length - withPhoto} data plate(s)` : ''}`
      : 'Talking reel: subtitles from the owner’s own words (no product mentions detected to cut to)')
    : (moments.length
      ? `Reel hablado: el dueño presenta ${moments.map(m => m.product).join(' + ')} — subtítulos de sus palabras, ${withPhoto} corte(s) a su foto real de producto${moments.length - withPhoto ? `, ${moments.length - withPhoto} placa(s) de dato` : ''}`
      : 'Reel hablado: subtítulos de las palabras del dueño (no detecté menciones de productos para cortar)');
  const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, source_topic, source_angle, tipo, strategy_why, week_key, needs_review)
    VALUES (?,?,?,?, 'draft', 'video', 'Reel hablado', 'video del dueño', 'reel', ?, ?, 1)`)
    .run(uid, `/media/${name}`, caption, '', why, weekKey || '');
  return {
    postId: ins.lastInsertRowid, url: `/media/${name}`, file: outFile,
    transcript: tr.text, words: tr.words.length, moments, hook,
    costUsd: tr.costUsd || 0, renderMs, duration: render.duration,
    cuts: render.cuts, segments: render.segments,
  };
}

// ---------------------------------------------------------------------
// 7) Jobs + rutas. La tabla la crea el módulo (ensureTable), sin tocar
//    db.js. El procesamiento es asíncrono: la subida responde al toque y
//    el borrador aparece en la Agenda cuando está listo.
// ---------------------------------------------------------------------
function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS talking_reels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    input_path TEXT NOT NULL DEFAULT '',
    output_path TEXT NOT NULL DEFAULT '',
    post_id INTEGER,
    status TEXT NOT NULL DEFAULT 'processing',
    error TEXT NOT NULL DEFAULT '',
    moments_json TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '',
    cost_usd REAL NOT NULL DEFAULT 0,
    render_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
}

const STR = {
  es: {
    badType: 'Ese formato de video no lo puedo usar 😅 Probá con un MP4 o MOV, el que sale del celular.',
    unreadable: 'No pude leer ese video 😅 Probá con otro.',
    tooShort: 'Ese video es muy cortito 🎬 Grabá uno de 15 a 90 segundos contando tu producto.',
    tooLong: 'Ese video dura más de 90 segundos 🎬 Grabá uno más corto (20 a 40 segundos es ideal).',
    noAudio: 'Ese video no tiene sonido 😅 El reel hablado necesita que se te escuche hablar.',
    notFound: 'No encontré ese video en tu álbum.',
    failedGeneric: 'Algo salió mal editando tu reel. Posty ya lo registró; probá de nuevo en un rato.',
  },
  en: {
    badType: 'I can’t use that video format 😅 Try an MP4 or MOV, the kind your phone records.',
    unreadable: 'I couldn’t read that video 😅 Try another one.',
    tooShort: 'That video is too short 🎬 Record one of 15 to 90 seconds talking about your product.',
    tooLong: 'That video is over 90 seconds 🎬 Record a shorter one (20 to 40 seconds is ideal).',
    noAudio: 'That video has no sound 😅 The talking reel needs to hear you speak.',
    notFound: 'I couldn’t find that video in your album.',
    failedGeneric: 'Something went wrong editing your reel. Posty logged it; try again in a bit.',
  },
};

function registerTalkingReel(app, db, deps) {
  const { requireAuth, mediaDir, apiKeyFor, weekKeyFor, langFor, logCost } = deps;
  ensureTable(db);
  const express = require('express');
  const rawVid = express.raw({ type: 'video/*', limit: '60mb' });

  async function processJob(jobId, uid, inputFile, lang) {
    try {
      const apiKey = apiKeyFor(uid);
      if (!apiKey) throw new Error('sin_clave_openai');
      const r = await createTalkingReelDraft({
        db, uid, inputFile, mediaDir, apiKey,
        weekKey: weekKeyFor(uid), lang, logCost,
        transcribeImpl: deps.transcribeImpl || null,
      });
      db.prepare(`UPDATE talking_reels SET status = 'done', post_id = ?, output_path = ?, moments_json = ?, transcript = ?, cost_usd = ?, render_ms = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(r.postId, r.url, JSON.stringify(r.moments.map(m => ({ product: m.product, start: m.start, end: m.end, photo: !!m.photoFile }))), r.transcript, r.costUsd || 0, r.renderMs, jobId);
      console.log(`[talking-reel] usuario ${uid}: job ${jobId} listo → post ${r.postId} (${r.cuts} cortes, ${Math.round(r.renderMs / 1000)}s)`);
    } catch (e) {
      console.error(`[talking-reel] job ${jobId} falló:`, e.message);
      try {
        db.prepare(`UPDATE talking_reels SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(String(e.message || 'error').slice(0, 200), jobId);
      } catch (e2) {}
    }
  }

  function startJob(uid, inputFile, lang) {
    const ins = db.prepare(`INSERT INTO talking_reels (user_id, input_path) VALUES (?, ?)`).run(uid, inputFile);
    const jobId = ins.lastInsertRowid;
    setImmediate(() => { processJob(jobId, uid, inputFile, lang).catch(() => {}); });
    return jobId;
  }

  // Subida directa del video hablado (mismo patrón crudo que el álbum).
  app.post('/api/talking-reel', requireAuth, rawVid, async (req, res) => {
    const uid = req.session.userId;
    const lang = langFor(uid) === 'en' ? 'en' : 'es';
    const T = STR[lang];
    try {
      if (!req.body || !req.body.length) return res.status(400).json({ error: T.unreadable });
      const ct = req.get('Content-Type') || '';
      if (!/mp4|quicktime/i.test(ct)) return res.status(400).json({ error: T.badType });
      const ext = ct.includes('quicktime') ? 'mov' : 'mp4';
      const name = `talk-in-${uid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const abs = path.join(mediaDir, name);
      fs.writeFileSync(abs, req.body);
      const info = await mediaInfo(abs);
      if (!info || !info.hasVideo) { try { fs.unlinkSync(abs); } catch (e) {} return res.status(400).json({ error: T.unreadable }); }
      if (!info.hasAudio) { try { fs.unlinkSync(abs); } catch (e) {} return res.status(400).json({ error: T.noAudio }); }
      if (info.duration < 8) { try { fs.unlinkSync(abs); } catch (e) {} return res.status(400).json({ error: T.tooShort }); }
      if (info.duration > 95) { try { fs.unlinkSync(abs); } catch (e) {} return res.status(400).json({ error: T.tooLong }); }
      const jobId = startJob(uid, abs, lang);
      return res.json({ ok: true, id: jobId, status: 'processing' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: T.failedGeneric });
    }
  });

  // Desde un video que ya está en el álbum (el momento semanal).
  app.post('/api/talking-reel/from-asset', requireAuth, async (req, res) => {
    const uid = req.session.userId;
    const lang = langFor(uid) === 'en' ? 'en' : 'es';
    const T = STR[lang];
    try {
      const assetId = parseInt((req.body || {}).asset_id, 10);
      if (!assetId) return res.status(400).json({ error: T.notFound });
      const row = db.prepare(`SELECT file_path FROM assets WHERE id = ? AND user_id = ? AND kind = 'video'`).get(assetId, uid);
      const abs = row ? localFile(mediaDir, row.file_path) : null;
      if (!abs) return res.status(404).json({ error: T.notFound });
      const info = await mediaInfo(abs);
      if (!info || !info.hasAudio) return res.status(400).json({ error: T.noAudio });
      if (info.duration > 95) return res.status(400).json({ error: T.tooLong });
      const jobId = startJob(uid, abs, lang);
      return res.json({ ok: true, id: jobId, status: 'processing' });
    } catch (e) {
      return res.status(500).json({ ok: false, error: T.failedGeneric });
    }
  });

  app.get('/api/talking-reel/:id', requireAuth, (req, res) => {
    const uid = req.session.userId;
    const row = db.prepare(`SELECT id, status, error, post_id, output_path FROM talking_reels WHERE id = ? AND user_id = ?`).get(parseInt(req.params.id, 10), uid);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true, ...row });
  });

  return { processJob, startJob };
}

module.exports = {
  registerTalkingReel,
  createTalkingReelDraft,
  transcribeWithWords,
  detectMoments,
  buildAss,
  renderTalkingReel,
  pickPhotoForProduct,
  digestTargets,
  ensureTable,
  _internals: { phraseGroups, factFromWords, restorePunctuation, sentenceAt, hexToAss, assTime, normTxt },
};
