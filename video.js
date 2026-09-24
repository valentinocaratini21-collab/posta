// Generador de video — Posta
// Crea videos verticales 1080×1920 (Reels/TikTok) con ffmpeg local, sin APIs externas.
// Cada escena: imagen con efecto Ken Burns (zoompan) + texto superpuesto abajo.
// Transiciones por corte simple. Música opcional (mp3). Límite: 60 segundos totales.

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const W = 1080;
const H = 1920;
const FPS = 30;
const MAX_TOTAL_SEC = 60;
const MAX_SCENES = 5;
const FONT = path.join(__dirname, 'assets', 'fonts', 'Montserrat-Bold.ttf');

let _ffmpegOk = null;
function ffmpegAvailable() {
  if (_ffmpegOk === null) {
    try {
      require('child_process').execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
      _ffmpegOk = true;
    } catch {
      _ffmpegOk = false;
    }
  }
  return _ffmpegOk;
}

// Escapa texto para drawtext (también vale para textfile)
function escDrawtext(t) {
  return String(t || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function runFfmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', ...args], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message).split('\n').slice(-6).join(' ').slice(0, 400);
        return reject(new Error('ffmpeg falló: ' + msg));
      }
      resolve(stdout);
    });
  });
}

// scenes: [{file (abs path), text, duration}], musicFile: abs path | null
async function renderVideo({ scenes, musicFile, mediaDir }) {
  if (!ffmpegAvailable()) {
    throw new Error('Instalá ffmpeg (ej: brew install ffmpeg)');
  }
  if (!scenes.length || scenes.length > MAX_SCENES) {
    throw new Error(`El video lleva de 1 a ${MAX_SCENES} escenas`);
  }
  const total = scenes.reduce((a, s) => a + s.duration, 0);
  if (total <= 0 || total > MAX_TOTAL_SEC) {
    throw new Error(`La duración total debe ser de 1 a ${MAX_TOTAL_SEC} segundos`);
  }
  for (const s of scenes) {
    if (!fs.existsSync(s.file)) throw new Error('Falta una imagen de escena');
    if (s.duration < 1 || s.duration > 30) throw new Error('Cada escena dura de 1 a 30 segundos');
  }
  if (musicFile && !fs.existsSync(musicFile)) throw new Error('No se encontró la música');

  const tag = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const tmpDir = path.join(mediaDir, '.tmp-' + tag);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const inputs = [];
    const filterParts = [];
    const vlabels = [];

    scenes.forEach((s, i) => {
      // Una sola imagen por entrada: zoompan d=N genera exactamente N frames
      inputs.push('-i', s.file);
      const frames = Math.round(s.duration * FPS);
      // Ken Burns: alterna zoom-in / zoom-out por escena
      const zin = i % 2 === 0;
      const zExpr = zin
        ? `z='min(1+0.12*on/${frames},1.12)'`
        : `z='max(1.12-0.12*on/${frames},1.0)'`;
      // Texto en archivo temporal para evitar problemas de escape
      const txtFile = path.join(tmpDir, `txt${i}.txt`);
      fs.writeFileSync(txtFile, escDrawtext(s.text).slice(0, 140));
      const vf =
        `scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,` +
        `zoompan=${zExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},` +
        `drawtext=fontfile=${FONT}:textfile='${txtFile}':fontsize=64:fontcolor=white:` +
        `box=1:boxcolor=black@0.55:boxborderw=36:x=(w-text_w)/2:y=h-340,` +
        `format=yuv420p`;
      filterParts.push(`[${i}:v]${vf}[v${i}]`);
      vlabels.push(`[v${i}]`);
    });

    filterParts.push(`${vlabels.join('')}concat=n=${scenes.length}:v=1:a=0[vout]`);
    const filterComplex = filterParts.join(';');

    const outName = `video-${tag}.mp4`;
    const outPath = path.join(mediaDir, outName);
    const args = [
      ...inputs,
      ...(musicFile ? ['-i', musicFile] : []),
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      ...(musicFile ? ['-map', `${scenes.length}:a`] : []),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      ...(musicFile ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []),
      '-movflags', '+faststart',
      outPath,
    ];
    await runFfmpeg(args);
    return { file: outPath, url: `/media/${outName}`, duration: total };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { renderVideo, ffmpegAvailable, MAX_TOTAL_SEC, MAX_SCENES };
