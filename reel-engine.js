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

// mood → archivo dentro de assets/music (licencias en REELS-MUSIC.md)
const MUSIC_TRACKS = { upbeat: 'upbeat.mp3', chill: 'chill.mp3', groove: 'groove.mp3' };
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

function pickMusicFile(mood) {
  const name = MUSIC_TRACKS[mood] || MUSIC_TRACKS.upbeat;
  const f = path.join(MUSIC_DIR, name);
  if (fs.existsSync(f)) return f;
  for (const n of Object.values(MUSIC_TRACKS)) {
    const alt = path.join(MUSIC_DIR, n);
    if (fs.existsSync(alt)) return alt;
  }
  return null;
}

function moodForCategory(category, rubro) {
  if (rubro && RUBRO_MOOD[rubro]) return RUBRO_MOOD[rubro];
  return 'upbeat';
}

// buildReelPro({ mediaDir, photos, videos, hook, mid, cta, handle,
//                brandHex, mood }) → { file, url, duration, coverPath, music }
// photos/videos: rutas absolutas existentes. Videos ya validados (mp4/mov).
async function buildReelPro(opts) {
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
    vids.push({ kind: 'video', file: v, dur, start: Math.max(0, (info.duration - dur) / 2), hasAudio: !!info.hasAudio, srcDur: info.duration });
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
    const musicFile = pickMusicFile(opts.mood);
    let musicIdx = -1;
    if (musicFile) { args.push('-stream_loop', '-1', '-i', musicFile); musicIdx = 2 * N; }

    // ---------- Filtergraph ----------
    const fc = [];
    segs.forEach((s, i) => {
      if (s.kind === 'video') {
        fc.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},fps=${FPS},setsar=1,format=yuv420p[v${i}]`);
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

module.exports = { buildReelPro, moodForCategory, wrapLines, MUSIC_TRACKS };
