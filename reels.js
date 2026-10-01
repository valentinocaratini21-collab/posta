// Reels para Posty — render server-side con ffmpeg, sin APIs externas.
// Genera un MP4 vertical 1080×1920 (15-30s) con efecto Ken Burns por foto,
// transiciones suaves (xfade), headline animado en el primer segmento,
// fade in/out desde negro y SIN audio (el audio en tendencia se agrega en la
// app de Instagram — es lo que más alcance da, ver audioNote).
// REGLA: la portada del reel sale del primer segundo del video final.

const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const W = 1080;
const H = 1920;
const FPS = 30;
const FADE_X = 0.5;      // duración de cada transición xfade (s)
const FADE_EDGE = 0.4;   // fade in/out desde negro (s)
const SEG_DEFAULT = 5;   // segundos por foto
const SEG_SOLO = 10;     // segundos cuando hay una sola foto (zoom lento)
const MAX_PHOTOS = 6;
const HEADLINE_MAX = 60;

// Máximo de reels por semana que el endpoint debe permitir.
const REEL_MAX_PER_WEEK = 2;

const AUDIO_NOTE = 'Subilo a IG como reel y agregale un audio en tendencia desde la app de Instagram (lupa → Reels → audio con ↗) — es lo que más alcance da.';

// ---------------------------------------------------------------------------
// ffmpeg
// ---------------------------------------------------------------------------

let _ffmpegOk = null;
function ffmpegAvailable() {
  if (_ffmpegOk === null) {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      // Los filtros que este módulo necesita de verdad: no alcanza con que
      // el binario exista.
      for (const f of ['zoompan', 'drawtext', 'xfade', 'fade']) {
        execFileSync('ffmpeg', ['-hide_banner', '-h', 'filter=' + f], { stdio: 'ignore' });
      }
      _ffmpegOk = true;
    } catch (e) {
      _ffmpegOk = false;
    }
  }
  return _ffmpegOk;
}

// Fuente para drawtext: bundle del repo primero, fuentes del sistema después
// (el bundle no siempre viaja en el deploy; en Docker solo hay fuentes del sistema).
function resolveFont() {
  const cands = [
    path.join(__dirname, 'assets', 'fonts', 'Montserrat-Bold.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  ];
  for (const c of cands) {
    try { if (fs.existsSync(c)) return c; } catch (e) {}
  }
  try {
    const out = execFileSync('fc-list', [':style=Bold', 'file'], { timeout: 5000 }).toString();
    const m = out.split('\n').map(l => l.trim().replace(/^file:\s*/i, '').replace(/:.*$/, '').trim())
      .find(f => f.endsWith('.ttf') || f.endsWith('.otf'));
    if (m && fs.existsSync(m)) return m;
  } catch (e) {}
  return cands[0]; // último recurso: ffmpeg va a dar el error real
}

// Escapa texto para el filtro drawtext: :, ', \, %, [ y ].
function escapeDrawtext(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

// Headline limpio para overlay: sin emojis (la fuente no tiene glifos y
// saldrían cajitas), una línea, máx ~60 caracteres sin cortar palabras.
function cleanHeadline(t) {
  const noEmoji = String(t || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, '');
  const s = noEmoji.trim().replace(/\s+/g, ' ');
  if (s.length <= HEADLINE_MAX) return s;
  const c = s.slice(0, HEADLINE_MAX);
  const i = c.lastIndexOf(' ');
  return (i > HEADLINE_MAX * 0.4 ? c.slice(0, i) : c).trim() + '…';
}

function runFfmpeg(args, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', ...args], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        let msg;
        if (err.killed) {
          msg = 'tardó demasiado en generarse (se agotó el tiempo de espera)';
        } else {
          const lines = String(stderr || '').split('\n').map(l => l.trim()).filter(Boolean);
          const errLine = lines.find(l => /error|invalid|cannot|failed|denied|no such/i.test(l) && !/^frame=/.test(l));
          msg = (errLine || lines.filter(l => !/^frame=/.test(l)).slice(-2).join(' · ') || err.message).slice(0, 300);
        }
        return reject(new Error('No se pudo generar el reel: ' + msg));
      }
      resolve(stdout);
    });
  });
}

// ---------------------------------------------------------------------------
// buildReel
// ---------------------------------------------------------------------------

// Efecto Ken Burns por segmento, variado por índice para que no se vea mecánico.
function kenBurnsExprs(idx, frames, solo) {
  const D = frames;
  const cx = 'iw/2-(iw/zoom/2)';
  const cy = 'ih/2-(ih/zoom/2)';
  if (solo) {
    // Una sola foto: zoom-in lento y elegante.
    return { z: `1+0.08*on/${D}`, x: cx, y: cy, effect: 'zoom-in lento' };
  }
  const v = idx % 3;
  if (v === 0) return { z: `1+0.18*on/${D}`, x: cx, y: cy, effect: 'zoom-in' };
  if (v === 1) return { z: `1.18-0.18*on/${D}`, x: cx, y: cy, effect: 'zoom-out' };
  // Pan lateral; alterna dirección para no repetirse.
  const ltr = (idx % 6) === 2;
  return {
    z: '1.3',
    x: ltr ? `(iw-iw/zoom)*on/${D}` : `(iw-iw/zoom)*(1-on/${D})`,
    y: cy,
    effect: ltr ? 'pan izquierda→derecha' : 'pan derecha→izquierda',
  };
}

function validHex(h) {
  return /^#?[0-9a-fA-F]{6}$/.test(String(h || '').trim());
}

async function buildReel({ photos, headline, brandHex, businessName, outDir, totalSec }) {
  if (!ffmpegAvailable()) {
    throw new Error('ffmpeg no disponible en el servidor: el reel no se puede renderizar');
  }
  const list = (Array.isArray(photos) ? photos : []).slice(0, MAX_PHOTOS);
  if (list.length === 0) {
    throw new Error('se necesitan al menos 1 foto');
  }
  for (const p of list) {
    if (!p || !fs.existsSync(p)) {
      throw new Error('foto inexistente: ' + String(p));
    }
  }
  if (!outDir) throw new Error('falta outDir: no hay carpeta de destino para el reel');
  fs.mkdirSync(outDir, { recursive: true });

  const n = list.length;
  // Duración por segmento: ~5s por foto (10s con zoom lento si hay una sola).
  // Si el llamador pasa totalSec, se reparte entre segmentos compensando el
  // solapamiento de los xfade; el total final siempre queda entre 15 y 30s.
  let segDur;
  if (n === 1) {
    segDur = totalSec ? Math.min(Math.max(totalSec, 8), 30) : SEG_SOLO;
  } else if (totalSec && totalSec > 0) {
    segDur = (totalSec + FADE_X * (n - 1)) / n;
    segDur = Math.min(Math.max(segDur, 3), 12);
  } else {
    segDur = SEG_DEFAULT;
  }
  const frames = Math.round(segDur * FPS);
  const total = n * segDur - FADE_X * (n - 1); // duración final con xfade

  const font = resolveFont();
  const head = cleanHeadline(headline || businessName || '');
  const boxColor = validHex(brandHex)
    ? ('#' + String(brandHex).trim().replace(/^#/, '') + '@0.55')
    : 'black@0.5';

  const ts = Date.now();
  const outPath = path.join(outDir, `reel-${ts}.mp4`);

  // El headline va por textfile (no text= inline): el parser de filtergraph
  // de ffmpeg se desincroniza cuando el texto inline con comillas escapadas
  // se combina con otras opciones entrecomilladas (alpha con comas).
  let headFile = null;
  if (head) {
    headFile = path.join(outDir, `reel-${ts}-headline.txt`);
    fs.writeFileSync(headFile, head, 'utf8');
  }

  const args = [];
  for (const p of list) args.push('-i', p);

  const fc = [];
  const segments = [];
  list.forEach((p, i) => {
    const kb = kenBurnsExprs(i, frames, n === 1);
    segments.push({ index: i, photo: p, seconds: segDur, effect: kb.effect });
    // Escalar a 2160px de ancho ANTES del zoompan: el zoom recorta, y así no pixela.
    let chain = `[${i}:v]scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,setsar=1,` +
      `zoompan=z='${kb.z}':x='${kb.x}':y='${kb.y}':d=${frames}:s=${W}x${H}:fps=${FPS},settb=AVTB`;
    // Headline animado SOLO en el primer segmento: fade in 0.5→1.5s,
    // visible hasta 3.5s, fade out hasta 4.5s.
    if (i === 0 && headFile) {
      const alpha = `if(lt(t,0.5),0,if(lt(t,1.5),(t-0.5),if(lt(t,3.5),1,if(lt(t,4.5),(4.5-t),0))))`;
      chain += `,drawtext=fontfile='${escapeDrawtext(font)}'` +
        `:textfile='${escapeDrawtext(headFile)}'` +
        `:fontsize=68:fontcolor=white:borderw=2:bordercolor=black@0.8` +
        `:box=1:boxcolor=${boxColor}:boxborderw=24` +
        `:x=(w-text_w)/2:y=(h-text_h)/2:alpha='${alpha}'`;
    }
    fc.push(chain + `,format=yuv420p[v${i}]`);
  });

  // Transiciones suaves entre segmentos: xfade fade de 0.5s.
  let cur = 'v0';
  for (let k = 1; k < n; k++) {
    const offset = k * segDur - k * FADE_X;
    const out = (k === n - 1) ? 'vx' : `x${k}`;
    fc.push(`[${cur}][v${k}]xfade=transition=fade:duration=${FADE_X}:offset=${offset.toFixed(3)}[${out}]`);
    cur = out;
  }
  // Fade in desde negro al inicio y fade out al final.
  fc.push(`[${cur}]fade=t=in:st=0:d=${FADE_EDGE},fade=t=out:st=${(total - FADE_EDGE).toFixed(3)}:d=${FADE_EDGE},format=yuv420p[vout]`);

  args.push(
    '-filter_complex', fc.join(';'),
    '-map', '[vout]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast',
    '-movflags', '+faststart',
    '-an',
    outPath
  );
  await runFfmpeg(args);

  // Portada: frame del primer segundo del mp4 final (regla existente).
  const coverPath = path.join(outDir, `reel-${ts}-cover.jpg`);
  await runFfmpeg(['-ss', '1', '-i', outPath, '-frames:v', '1', '-q:v', '3', coverPath]);

  // Limpieza del txt auxiliar del headline.
  if (headFile) { try { fs.unlinkSync(headFile); } catch (e) {} }

  return {
    path: outPath,
    coverPath,
    durationSec: Math.round(total * 10) / 10,
    audioNote: AUDIO_NOTE,
    segments,
  };
}

// ---------------------------------------------------------------------------
// Cuota semanal
// ---------------------------------------------------------------------------

// Cuántos reels creó el usuario en los últimos 7 días.
// OJO: la tabla posts no tiene columna `kind`; el tipo de posteo vive en `tipo`
// (ver db.js), así que se filtra por tipo='reel'.
function reelsThisWeek(db, userId) {
  const row = db.prepare(
    "SELECT COUNT(*) AS c FROM posts WHERE user_id = ? AND tipo = 'reel' AND created_at >= datetime('now', '-7 days')"
  ).get(userId);
  return row ? Number(row.c) : 0;
}

module.exports = {
  ffmpegAvailable,
  escapeDrawtext,
  buildReel,
  REEL_MAX_PER_WEEK,
  reelsThisWeek,
};
