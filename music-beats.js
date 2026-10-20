'use strict';
/* =====================================================================
 * music-beats.js — MAPA DE BEATS OFFLINE de la biblioteca musical
 * (Motion v3, Fase 3 — spec-motion-v3.md)
 *
 * Los cortes de escena del motor v3 hacen SNAP al beat más cercano
 * (±150 ms) de la pista elegida. Para eso cada pista de assets/music/
 * se analiza UNA vez offline y el resultado queda en
 * assets/music/beats.json: { "<archivo>": { bpm, offset, beats[] } }.
 *
 * Detección sin dependencias: se decodifica la pista a PCM mono con
 * ffmpeg, se calcula el flujo espectral simple (flux de energía RMS
 * por ventanas de ~12 ms) y se estima el período por autocorrelación
 * en el rango 70–180 BPM; la fase se elige maximizando el flux sobre
 * la grilla. Si la confianza es baja (pico de autocorrelación débil),
 * se guarda bpm:null y el motor NO hace snap con esa pista — queda
 * declarado en el JSON, nunca se inventa un tempo.
 *
 * Uso CLI (regenerar el mapa):  node music-beats.js --write
 * ===================================================================== */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const MUSIC_DIR = path.join(__dirname, 'assets', 'music');
const MAP_PATH = path.join(MUSIC_DIR, 'beats.json');
const SR = 22050;          // sample rate de análisis
const HOP = 256;           // ~11,6 ms por ventana
const BPM_MIN = 70;
const BPM_MAX = 180;

function loadBeatMap() {
  try { return JSON.parse(fs.readFileSync(MAP_PATH, 'utf8')); }
  catch (e) { return {}; }
}

/* Entrada del mapa para un archivo de pista (o null si no hay beats
 * confiables): { bpm, offset, beats: [segundos...] } */
function beatsForFile(file) {
  if (!file) return null;
  const entry = loadBeatMap()[path.basename(file)];
  if (!entry || !entry.bpm || !Array.isArray(entry.beats) || !entry.beats.length) return null;
  return entry;
}

function decodePcm(file) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'],
      { timeout: 120000, maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' },
      (err, stdout) => err ? reject(new Error('ffmpeg decode: ' + err.message)) : resolve(stdout));
  });
}

/* Flujo de energía: flux[i] = max(0, RMS[i] − RMS[i−1]). */
function onsetEnvelope(samples) {
  const nWin = Math.floor(samples.length / HOP);
  const rms = new Float64Array(nWin);
  for (let w = 0; w < nWin; w++) {
    let acc = 0;
    const base = w * HOP;
    for (let i = 0; i < HOP; i++) { const v = samples[base + i]; acc += v * v; }
    rms[w] = Math.sqrt(acc / HOP);
  }
  const flux = new Float64Array(nWin);
  for (let w = 1; w < nWin; w++) flux[w] = Math.max(0, rms[w] - rms[w - 1]);
  return flux;
}

async function analyzeBeats(file) {
  const buf = await decodePcm(file);
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const duration = samples.length / SR;
  const flux = onsetEnvelope(samples);
  const hopSec = HOP / SR;
  const lagMin = Math.floor((60 / BPM_MAX) / hopSec);
  const lagMax = Math.ceil((60 / BPM_MIN) / hopSec);
  // Autocorrelación normalizada del flux en el rango de períodos.
  let bestLag = -1, bestVal = -1, sumAll = 0, cnt = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let acc = 0, n = 0;
    for (let i = lag; i < flux.length; i += 1) { acc += flux[i] * flux[i - lag]; n++; }
    const v = n ? acc / n : 0;
    sumAll += v; cnt++;
    if (v > bestVal) { bestVal = v; bestLag = lag; }
  }
  const mean = cnt ? sumAll / cnt : 0;
  const confidence = mean > 0 ? bestVal / mean : 0;
  if (bestLag < 0 || confidence < 1.6) {
    return { bpm: null, offset: null, beats: [], confidence: Math.round(confidence * 100) / 100, duration: Math.round(duration * 100) / 100 };
  }
  const period = bestLag * hopSec;
  const bpm = Math.round((60 / period) * 10) / 10;
  // Fase: el desplazamiento que maximiza el flux acumulado en la grilla.
  let bestPhase = 0, bestScore = -1;
  for (let p = 0; p < bestLag; p++) {
    let acc = 0;
    for (let i = p; i < flux.length; i += bestLag) acc += flux[i];
    if (acc > bestScore) { bestScore = acc; bestPhase = p; }
  }
  const offset = bestPhase * hopSec;
  const beats = [];
  for (let t = offset; t < duration; t += period) beats.push(Math.round(t * 1000) / 1000);
  return { bpm, offset: Math.round(offset * 1000) / 1000, beats, confidence: Math.round(confidence * 100) / 100, duration: Math.round(duration * 100) / 100 };
}

/* Beat más cercano a t dentro de ±tol segundos (o null). */
function nearestBeat(entry, t, tol = 0.15) {
  if (!entry || !entry.beats || !entry.beats.length) return null;
  let best = null, bestD = Infinity;
  for (const b of entry.beats) {
    const d = Math.abs(b - t);
    if (d < bestD) { bestD = d; best = b; }
    if (b > t + tol) break;
  }
  return bestD <= tol ? best : null;
}

module.exports = { loadBeatMap, beatsForFile, analyzeBeats, nearestBeat, MAP_PATH };

if (require.main === module && process.argv.includes('--write')) {
  (async () => {
    const files = fs.readdirSync(MUSIC_DIR).filter(f => /\.mp3$/i.test(f)).sort();
    const map = {};
    for (const f of files) {
      const entry = await analyzeBeats(path.join(MUSIC_DIR, f));
      map[f] = entry;
      console.log(`${f}: bpm=${entry.bpm} offset=${entry.offset} beats=${entry.beats.length} confianza=${entry.confidence} dur=${entry.duration}s`);
    }
    fs.writeFileSync(MAP_PATH, JSON.stringify(map, null, 2));
    console.log('escrito:', MAP_PATH);
  })().catch(e => { console.error(e.message); process.exit(1); });
}
