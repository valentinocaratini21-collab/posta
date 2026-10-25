'use strict';
/* =====================================================================
 * test-single-clip.js — Gap 2 (motor) + Gap 4a (foco) sin servidor:
 * buildSingleClipReel y detectFocus de reel-engine.js, directos.
 *
 *  - Un video de 40 s con audio propio sale ENTERO (≥80% de duración),
 *    con SU audio como protagonista (sin música) y portada real.
 *  - Un video de 100 s sale como ventana de 60 s (el camino «largo»:
 *    por las puertas de subida el tope es 90 s, pero el motor no puede
 *    volcar un video largo entero si alguna vez llega uno).
 *  - detectFocus sigue al sujeto: con el detalle cargado al tercio
 *    izquierdo de un video horizontal, el foco medido cae a la izquierda
 *    del centro (el crop viejo, central, lo dejaba afuera).
 * Costo IA: CERO (no hay IA en este camino).
 * ===================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-clip-'));
const MEDIA = path.join(TMP, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
function ff(args) { execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: 240000 }); }
function probeDur(abs) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', abs], { encoding: 'utf8' });
  return Number(JSON.parse(out).format.duration) || 0;
}
function hasAudioStream(abs) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', abs], { encoding: 'utf8' });
  return (JSON.parse(out).streams || []).some((s) => s.codec_type === 'audio');
}

(async () => {
  let passed = 0, failed = 0;
  const ok = (name, cond, extra) => {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  const re = require('./reel-engine');

  // Fixtures
  const v40 = path.join(TMP, 'v40.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=duration=40:size=720x1280:rate=15', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=40', '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', v40]);
  const v100 = path.join(TMP, 'v100.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=duration=100:size=360x640:rate=10', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', v100]);
  const vLeft = path.join(TMP, 'vleft.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=0xB0B0B0:duration=4:size=1280x720:rate=10', '-f', 'lavfi', '-i', 'testsrc2=duration=4:size=300x300:rate=10',
    '-filter_complex', '[0:v][1:v]overlay=60:200', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', vLeft]);

  // Foco (Gap 4a)
  const foc = await re.detectFocus(vLeft, { isVideo: true, duration: 4 });
  ok('(4) detectFocus ubica el foco a la izquierda con el sujeto al tercio izquierdo', foc.x < 0.4, JSON.stringify(foc));

  // Single-clip 40 s con audio propio
  const out40 = await re.buildSingleClipReel({
    mediaDir: MEDIA, file: v40, hook: 'Mirá este video', cta: 'Escribinos 👇', handle: '@cafearoma',
    brandHex: '#2793C8', mood: 'chill', musicSeed: 'test:40',
  });
  const dur40 = probeDur(out40.file);
  ok('(2) single-clip: el video de 40 s conserva ≥80% de su duración', dur40 >= 32, 'dur=' + dur40 + ' reportada=' + out40.duration);
  ok('(2) single-clip: el audio del cliente es el protagonista (sin música encima)', out40.clientAudio === true && out40.music === false, JSON.stringify({ a: out40.clientAudio, m: out40.music }));
  ok('(2) single-clip: el reel tiene stream de audio', hasAudioStream(out40.file));
  ok('(2/11) single-clip: la portada es el mejor frame, un archivo real', !!out40.coverPath && fs.existsSync(out40.coverPath), String(out40.coverPath));

  // Single-clip 100 s sin audio → ventana de 60 s con música
  const out100 = await re.buildSingleClipReel({
    mediaDir: MEDIA, file: v100, hook: 'Video largo', cta: 'Escribinos 👇', handle: '@cafearoma',
    brandHex: '#2793C8', mood: 'upbeat', musicSeed: 'test:100',
  });
  ok('(2) single-clip: el video de 100 s sale como ventana de 60 s', out100.segmentDur === 60 && probeDur(out100.file) >= 57, 'seg=' + out100.segmentDur + ' dur=' + probeDur(out100.file));
  ok('(2) single-clip: sin audio propio, entra la música de la casa', out100.music === true && hasAudioStream(out100.file));

  console.log(`\ntest-single-clip: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
