'use strict';
/* =====================================================================
 * video-edicion.js — Edición del video del cliente (lote EDITAR-VIDEO-
 * CLIENTE, Valentino 5/11 16:06: «cuando nos mandan videos, Posty tiene
 * que saber editarlos, ponerles música y que queden perfectos para subir»).
 *
 * Pipeline ffmpeg en LOCAL, USD 0, SIN IA, sin red. Complementa REEL-AL-
 * DÍA (reels desde fotos): esto edita los VIDEOS que manda el cliente,
 * nunca genera video nuevo. La generación premium con IA (Seedance) es
 * otro camino, con puertas apagadas — acá no se usa.
 *
 * Regla dura: el material del cliente ES el material. El video que manda
 * el cliente es el video que se usa: se edita, nunca se reemplaza.
 *
 * Qué hace, en orden:
 *   1. Probe (ffprobe): video válido, con stream de video, duración ≥1 s.
 *   2. Mejor ventana ≤90 s: cortes por escena (scene detection) → cada
 *      escena se puntúa por audio (volumedetect) + nitidez del frame
 *      medio; la mejor escena centra la ventana (trimWindow de
 *      media-cliente). Sin escenas: el frame más nítido; sin eso, la
 *      mitad. Nunca un corte al azar.
 *   3. Reencuadre vertical 9:16 con FONDO DIFUMINADO por defecto
 *      (fix 5/11, Valentino: «el video sale feo» — el recorte anterior
 *      cortaba la taza por la mitad: el latte art quedaba cortado, el
 *      asa desaparecía, y el recorte era una región chica escalada que
 *      se veía blanda). Regla: el recorte con seguimiento de sujeto
 *      SOLO se usa cuando el plano ya es vertical (o casi) y el recorte
 *      conservaría ≥85% del cuadro (decidirReencuadre). En cualquier
 *      otro caso — paisaje, cuadrado, 4:5 — va FONDO DIFUMINADO (pad,
 *      estilo CapCut): el cuadro entero se ajusta sin cortar nada y el
 *      fondo difuminado (el mismo video, escalado a cubrir y con blur)
 *      rellena el resto. Nada se corta, el plano entero se ve, no hay
 *      bandas negras y no se deforma. Nunca estirar.
 *   4. Audio: voz original normalizada por ganancia medida (volumedetect
 *      → ganancia estática a −16 dB, clamp ±12 dB) + música CC0 del
 *      bundle (pickMusicFile de reel-engine, determinística por seed)
 *      mezclada BAJO la voz (0.18 ≈ −15 dB; la voz se escucha, la
 *      música acompaña). Sin audio original: solo música a 0.9.
 *      Sin música disponible: solo voz (nunca se bloquea por eso).
 *   5. Portada: el cuadro del mejor momento de la ventana (bestT, ya
 *      medido al elegirla) sobre el video EDITADO. Un solo cuadro, sin
 *      re-medir: la medición de nitidez ya se hizo al elegir la ventana
 *      y el render de 90 s es el costo dominante.
 *   6. Salida MP4 720×1280, H.264 + AAC, faststart, lista para subir.
 *
 * Fail-closed: editarVideoCliente NUNCA lanza. Cualquier fallo devuelve
 * { ok:false, reason } y el llamador deja el video ORIGINAL (nunca un
 * edit roto, nunca un parcial). La salida se escribe a un temporal y se
 * renombra solo cuando está verificada (duración y 720×1280).
 * ===================================================================== */

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { mediaInfo, detectFocus, pickMusicFile, moodForCategory } = require('./reel-engine');
const { trimWindow, sceneSegments } = require('./media-cliente');

const OUT_W = 720;
const OUT_H = 1280;
const MAX_DUR = 90; // un reel dura ≤90 s
const MUSIC_VOL = 0.18; // música BAJO la voz (≈ −15 dB)
const MUSIC_ONLY_VOL = 0.9; // sin voz original: la música es el audio
const VOICE_TARGET_DB = -16; // la voz normalizada apunta a −16 dB
const GAIN_CLAMP_DB = 12; // la ganancia nunca pasa de ±12 dB
const EDIT_TIMEOUT_MS = 180000; // 3 min para el render completo
const ANALYZE_TIMEOUT_MS = 60000;
const TARGET_AR = OUT_W / OUT_H; // 9:16 = 0.5625
const CROP_KEEP_MIN = 0.85; // el recorte solo si conserva ≥85% del cuadro
const PAD_BLUR_SIGMA = 25; // blur del fondo difuminado (gblur, suave)

// Decisión recorte vs fondo difuminado (fix 5/11, Valentino: «el video
// sale feo»). keep = fracción del cuadro que conservaría el recorte a
// 9:16 (escala a cubrir y recorte: AR > 9:16 recorta a lo ancho,
// AR < 9:16 recorta a lo alto). Un paisaje 16:9 conservaría 32% — el
// recorte cortaría el sujeto, así que va pad. Un cuadrado, 56% —
// también pad. Un 4:5, 70% — también pad. Solo un plano ya vertical
// (o casi: AR 0.48–0.66, keep ≥85%) se recorta, con seguimiento de
// sujeto. El criterio del encargo es «si el recorte cortaría el
// sujeto, va pad» — con keep < 85% el recorte saca 15–68% del cuadro
// y el sujeto no entra entero en el caso general, así que el pad es
// el default. Devuelve { mode:'crop'|'pad', keep }.
function decidirReencuadre(info) {
  const w = info && info.width, h = info && info.height;
  if (!w || !h) return { mode: 'pad', keep: 0 };
  const ar = w / h;
  const keep = ar >= TARGET_AR ? TARGET_AR / ar : ar / TARGET_AR;
  return { mode: keep >= CROP_KEEP_MIN ? 'crop' : 'pad', keep: Math.round(keep * 1000) / 1000 };
}

function ffmpegAvailable() {
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

function runFfmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: timeoutMs || EDIT_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const lines = String(stderr || '').split('\n').map((l) => l.trim()).filter(Boolean);
        return reject(new Error('ffmpeg: ' + ((lines.slice(-2).join(' · ') || err.message).slice(0, 300))));
      }
      resolve(stdout);
    });
  });
}

// ffmpeg con salida de texto (stderr) — para scene detection y volumedetect.
function runFfmpegText(args, timeoutMs) {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-v', 'info', ...args], { timeout: timeoutMs || ANALYZE_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve(String(stderr || '') + String(stdout || ''));
    });
  });
}

// Cortes de escena (segundos): select con umbral 0.4, el estándar del
// motor de reels. Sin cortes → [] (una sola escena).
async function sceneCuts(absPath) {
  const out = await runFfmpegText(['-i', absPath, '-vf', "select='gt(scene,0.4)',showinfo", '-f', 'null', '-']);
  const cuts = [];
  const re = /pts_time:([\d.]+)/g;
  let m;
  while ((m = re.exec(out))) { const t = parseFloat(m[1]); if (t > 0.5) cuts.push(t); }
  return cuts;
}

// Volumen medio (dB) de un tramo de audio; null si no se puede medir
// (sin audio o tramo mudo). volumedetect da UN valor por tramo.
async function segmentMeanVolume(absPath, start, end) {
  const out = await runFfmpegText(['-i', absPath, '-af', `atrim=${start.toFixed(2)}:${end.toFixed(2)},volumedetect`, '-f', 'null', '-']);
  const m = /mean_volume:\s*(-?[\d.]+)\s*dB/.exec(out);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isNaN(v) ? null : v;
}

// Nitidez de un frame (energía media de bordes en grises, 96 px de
// ancho): mismo medidor que el foco del motor de reels. null si no se
// puede extraer el frame.
async function frameSharpness(absPath, tSec) {
  const buf = await new Promise((resolve) => {
    execFile('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, tSec)), '-i', absPath, '-vf', 'scale=96:-2', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'],
      { timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => resolve(err ? null : stdout));
  });
  if (!buf || buf.length < 96 * 4) return null;
  const w = 96;
  const h = Math.floor(buf.length / w);
  let sum = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      sum += Math.abs(buf[i + 1] - buf[i - 1]) + Math.abs(buf[i + w] - buf[i - w]);
      n++;
    }
  }
  return n ? sum / n : null;
}

// Mejor ventana ≤90 s del video: la escena con más audio + más nitidez
// centra la ventana (trimWindow). Determinístico, sin IA.
async function elegirVentana(absPath, info) {
  const dur = info.duration;
  if (dur <= MAX_DUR) return { start: 0, end: dur, bestT: dur / 2, via: 'entero' };
  let bestT = null;
  let via = 'mitad';
  try {
    const cuts = await sceneCuts(absPath);
    const segs = sceneSegments(cuts, dur, 3);
    // Tope de 6 escenas puntuadas (repartidas): cada escena cuesta una
    // medición de audio + una de nitidez; sin tope un video con 20 cortes
    // pagaría ~80 s solo en análisis. 6 escenas cubren el video entero.
    let cand = segs;
    if (cand.length > 6) {
      const step = cand.length / 6;
      cand = Array.from({ length: 6 }, (_, i) => cand[Math.min(cand.length - 1, Math.floor(i * step))]);
    }
    if (cand.length > 1) {
      const norm = (v, lo, hi) => (v === null || v === undefined) ? 0.5 : Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
      let best = null, bestScore = -1;
      for (const s of cand) {
        const mid = (s.start + s.end) / 2;
        const sharp = await frameSharpness(absPath, mid);
        const vol = info.hasAudio ? await segmentMeanVolume(absPath, s.start, s.end) : null;
        // Audio: −60..−5 dB → 0..1 (sin audio: 0.5 neutro). Nitidez: 0..30.
        const score = 0.6 * norm(vol, -60, -5) + 0.4 * norm(sharp, 0, 30);
        if (score > bestScore) { bestScore = score; best = s; }
      }
      if (best) { bestT = (best.start + best.end) / 2; via = 'escena'; }
    }
  } catch (e) { /* fallback abajo */ }
  if (bestT === null) {
    try {
      const times = [0.15, 0.35, 0.5, 0.65, 0.85].map((f) => dur * f);
      let bt = null, bs = -1;
      for (const t of times) {
        const s = await frameSharpness(absPath, t);
        if (s !== null && s > bs) { bs = s; bt = t; }
      }
      if (bt !== null) { bestT = bt; via = 'frame-nitido'; }
    } catch (e) {}
  }
  if (bestT === null) { bestT = dur / 2; via = 'mitad'; }
  const w = trimWindow(dur, bestT, MAX_DUR);
  return { start: w.start, end: w.end, bestT: Math.round(bestT * 10) / 10, via };
}

// Portada del video editado: el cuadro del mejor momento (coverT, en
// coordenadas del video EDITADO: bestT de la ventana menos su inicio).
// Un solo cuadro, sin re-medir nitidez — el mejor momento ya se midió al
// elegir la ventana. Si no se puede extraer, '' (el posteo sigue sin
// portada, nunca se bloquea por esto).
async function extraerPortada(outAbs, coverT, outDur, mediaDir, outBase) {
  try {
    const t = Math.min(Math.max(Number(coverT) || 1, 0.2), Math.max(0.2, outDur - 0.2));
    const coverAbs = path.join(mediaDir, `${outBase}-cover.jpg`);
    await runFfmpeg(['-ss', String(t), '-i', outAbs, '-vf', `scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${OUT_W}:${OUT_H}`, '-frames:v', '1', '-q:v', '4', coverAbs], 60000);
    if (fs.existsSync(coverAbs)) return `/media/${path.basename(coverAbs)}`;
  } catch (e) {}
  return '';
}

/* editarVideoCliente({ absPath, mediaDir, uid, rubro, category, seed,
 *   outBase }) → { ok:true, outRel, coverRel, duration, width, height,
 *   musicFile, musicMood, trim:{start,end,via}, focus:{x,y}, ms }
 * o { ok:false, reason, detail }. NUNCA lanza. */
async function editarVideoCliente(opts) {
  const t0 = Date.now();
  const { absPath, mediaDir } = opts || {};
  const outBase = String((opts && opts.outBase) || `video-edit-${Date.now()}`);
  const tmpTag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tmpDir = path.join(mediaDir, `.tmp-ve-${tmpTag}`);
  const fail = (reason, detail) => ({ ok: false, reason, detail: String(detail || '').slice(0, 200) });
  try {
    if (!absPath || !fs.existsSync(absPath)) return fail('video_no_valido', 'el archivo no existe');
    if (!mediaDir || !fs.existsSync(mediaDir)) return fail('video_no_valido', 'sin carpeta de medios');
    if (!ffmpegAvailable()) return fail('ffmpeg_no_disponible', 'ffmpeg no está en el servidor');
    const info = await mediaInfo(absPath);
    if (!info || !info.width || !info.height || !(info.duration >= 1)) return fail('video_no_valido', 'sin stream de video o duración < 1 s');
    const dur = info.duration;

    // 1b. Recorte vs fondo difuminado (del aspecto del plano; antes de
    // medir foco: el pad no necesita foco y se ahorra el clip temporal).
    const reencuadre = decidirReencuadre(info);

    // 1. Mejor ventana ≤90 s.
    let win;
    try { win = await elegirVentana(absPath, info); }
    catch (e) { win = trimWindow(dur, dur / 2, MAX_DUR); win = { start: win.start, end: win.end, bestT: dur / 2, via: 'mitad' }; }
    const len = Math.max(0.5, Math.min(MAX_DUR, win.end - win.start));

    // 2. Foco del sujeto DENTRO de la ventana (solo si se recorta: el
    //    pad no recorta nada y no necesita foco). Clip temporal por
    //    copia de stream, barato; si falla, centro.
    let focus = { x: 0.5, y: 0.5 };
    if (reencuadre.mode === 'crop') {
      try {
        fs.mkdirSync(tmpDir, { recursive: true });
        const winClip = path.join(tmpDir, 'ventana.mp4');
        await runFfmpeg(['-ss', String(win.start), '-t', String(len), '-i', absPath, '-c', 'copy', winClip], 60000);
        if (fs.existsSync(winClip)) {
          const f = await detectFocus(winClip, { isVideo: true, duration: len });
          if (f && typeof f.x === 'number' && typeof f.y === 'number') focus = { x: f.x, y: f.y };
        }
      } catch (e) { /* centro */ }
    }

    // 3. Música CC0 del bundle, determinística por seed (mismo rubro +
    //    misma semilla = misma pista). Sin pista, el edit sigue sin música.
    const mood = moodForCategory(opts && opts.category, opts && opts.rubro);
    let musicFile = null;
    try { musicFile = pickMusicFile(mood, (opts && opts.seed) || `${opts && opts.uid}:${outBase}`); } catch (e) { musicFile = null; }

    // 4. Ganancia de la voz medida (volumedetect sobre la ventana):
    //    estática, a −16 dB, clamp ±12 dB. Sin medición, sin ganancia.
    let voiceGainDb = 0;
    if (info.hasAudio) {
      try {
        const mv = await segmentMeanVolume(absPath, win.start, win.end);
        if (mv !== null) voiceGainDb = Math.max(-GAIN_CLAMP_DB, Math.min(GAIN_CLAMP_DB, VOICE_TARGET_DB - mv));
      } catch (e) {}
    }

    // 5. Render: video 9:16 (pad o recorte, según el aspecto) + audio
    //    mezclado. La salida se escribe a un temporal y se publica solo
    //    verificada (paso 6).
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) {}
    const tmpOut = path.join(tmpDir, 'editado.mp4');
    const args = [];
    args.push('-ss', String(win.start.toFixed(2)), '-t', String(len.toFixed(2)), '-i', absPath);
    if (musicFile) args.push('-stream_loop', '-1', '-i', musicFile);
    const fc = [];
    if (reencuadre.mode === 'pad') {
      // Fondo difuminado (estilo CapCut): el mismo video, escalado a
      // cubrir el cuadro y con blur, rellena el fondo; el cuadro
      // entero, sin cortar y sin deformar, va centrado encima. No hay
      // bandas negras (el fondo es el video difuminado, no negro).
      fc.push(`[0:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${OUT_W}:${OUT_H},gblur=sigma=${PAD_BLUR_SIGMA},setsar=1[bg]`);
      fc.push(`[0:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=decrease:flags=lanczos:force_divisible_by=2,setsar=1[fg]`);
      fc.push('[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p,fps=30,setsar=1[vout]');
    } else {
      // Recorte con seguimiento de sujeto (solo planos ya verticales:
      // keep ≥85%, el recorte no saca casi nada).
      fc.push(`[0:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${OUT_W}:${OUT_H}:x='(iw-ow)*${focus.x}':y='(ih-oh)*${focus.y}',fps=30,setsar=1,format=yuv420p[vout]`);
    }
    let audioLabel = null;
    if (info.hasAudio && musicFile) {
      fc.push(`[0:a]volume=${voiceGainDb.toFixed(2)}dB,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[voice]`);
      fc.push(`[1:a]atrim=0:${len.toFixed(2)},asetpts=PTS-STARTPTS,volume=${MUSIC_VOL},afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, len - 0.8).toFixed(2)}:d=0.8,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[mus]`);
      fc.push('[voice][mus]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]');
      audioLabel = 'aout';
    } else if (info.hasAudio) {
      fc.push(`[0:a]volume=${voiceGainDb.toFixed(2)}dB,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
      audioLabel = 'aout';
    } else if (musicFile) {
      fc.push(`[1:a]atrim=0:${len.toFixed(2)},asetpts=PTS-STARTPTS,volume=${MUSIC_ONLY_VOL},afade=t=in:st=0:d=0.5,afade=t=out:st=${Math.max(0, len - 0.8).toFixed(2)}:d=0.8,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[aout]`);
      audioLabel = 'aout';
    }
    args.push('-filter_complex', fc.join(';'));
    args.push('-map', '[vout]');
    if (audioLabel) args.push('-map', `[${audioLabel}]`);
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', '30');
    if (audioLabel) args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000');
    args.push('-movflags', '+faststart', '-t', String(len.toFixed(2)), tmpOut);
    await runFfmpeg(args, EDIT_TIMEOUT_MS);

    // 6. Verificar la salida ANTES de publicarla como el video del posteo.
    if (!fs.existsSync(tmpOut)) return fail('edicion_fallo', 'sin archivo de salida');
    const outInfo = await mediaInfo(tmpOut);
    if (!outInfo || outInfo.width !== OUT_W || outInfo.height !== OUT_H) return fail('edicion_fallo', 'la salida no es 720x1280');
    if (!(outInfo.duration >= 0.5) || outInfo.duration > MAX_DUR + 1) return fail('edicion_fallo', 'duración de salida inválida');
    if (info.hasAudio && !outInfo.hasAudio) return fail('edicion_fallo', 'la salida perdió el audio');

    // 7. Portada del video editado + publicación del archivo final.
    const outAbs = path.join(mediaDir, `${outBase}.mp4`);
    const coverRel = await extraerPortada(tmpOut, win.bestT - win.start, outInfo.duration, mediaDir, outBase);
    fs.renameSync(tmpOut, outAbs);
    return {
      ok: true,
      outRel: `/media/${path.basename(outAbs)}`,
      coverRel,
      duration: Math.round(outInfo.duration * 10) / 10,
      width: OUT_W,
      height: OUT_H,
      musicFile: musicFile ? path.basename(musicFile) : null,
      musicMood: mood,
      trim: { start: win.start, end: win.end, via: win.via },
      focus,
      reframe: reencuadre.mode, // 'pad' (fondo difuminado) o 'crop' (recorte con foco)
      keep: reencuadre.keep, // fracción del cuadro que conservaría el recorte
      voiceGainDb: Math.round(voiceGainDb * 10) / 10,
      ms: Date.now() - t0,
    };
  } catch (e) {
    if (e && /timed out|timeout/i.test(String(e.message || ''))) return fail('tiempo_agotado', e.message);
    return fail('edicion_fallo', e && e.message);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

module.exports = {
  editarVideoCliente,
  elegirVentana,
  decidirReencuadre,
  sceneCuts,
  segmentMeanVolume,
  frameSharpness,
  OUT_W, OUT_H, MAX_DUR, MUSIC_VOL, MUSIC_ONLY_VOL,
  TARGET_AR, CROP_KEEP_MIN, PAD_BLUR_SIGMA,
};
