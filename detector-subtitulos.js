// ================= LOTE DETECTOR-SUBTÍTULOS-SUBIDOS =================
// Orden de Valentino (14/11 14:21): si un cliente sube un video con
// los subtítulos QUEMADOS mal (líneas pisadas, el defecto del 653/681),
// Posty tiene que verificarlo, avisarle y corregirlo solo.
//
// Este módulo es la verificación + la corrección. El pegamento con el
// flujo de Subir (recibo, prev_image_path, revisión) vive en server.js
// (subirDetectorSubtitulosQuemados); acá no se toca ninguna base.
//
// REGLA DE VERDAD (fail-closed, espejo de verificarVideoSinSolape):
//   · veredicto limpio SOLO si la visión vio los frames y ningún
//     fotograma muestra textos pisados;
//   · sin clave, sin frames o sin veredicto parseable ⇒
//     'no_verificado' — JAMÁS «está bien» por default;
//   · la corrección se re-verifica con el mismo chequeo y solo se
//     entrega si el resultado queda limpio.
//
// La visión es gpt-4o-mini (la misma del chequeo de solape de v1077):
// no hay OCR local confiable y las zonas de texto de un video
// arbitrario son desconocidas — el juicio es visual por frames, y la
// reconstrucción de las líneas sale de ESA lectura (qué dice cada
// línea y dónde está su caja), nunca de la transcripción del audio
// (el caso que importa, 653/681, es música sin voz).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

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

function runFfmpeg(args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message || 'ffmpeg').slice(0, 300))) : resolve());
  });
}
function runFfprobe(file) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-show_entries', 'stream=width,height', '-of', 'json', file],
      { timeout: 30000 }, (err, stdout) => {
        if (err) return resolve(null);
        try {
          const j = JSON.parse(String(stdout || '{}'));
          const st = (j.streams || []).find((s) => s.width) || {};
          resolve({ duration: Number(j.format && j.format.duration) || 0, width: Number(st.width) || 0, height: Number(st.height) || 0 });
        } catch (e) { resolve(null); }
      });
  });
}

// Muestreo uniforme: N frames repartidos por la duración (centro de
// cada tramo). Devuelve [{ t, file }] en un tmpDir que limpia el
// llamador con limpiarFrames().
async function extraerFrames(videoAbs, n = 8) {
  const info = await runFfprobe(videoAbs);
  if (!info || !info.duration || info.duration < 0.5 || !info.width) return null;
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pz-det-subs-'));
  const frames = [];
  try {
    for (let i = 0; i < n; i++) {
      const t = Math.round(((i + 0.5) * info.duration / n) * 100) / 100;
      const f = path.join(tmpDir, `f${i}.jpg`);
      await runFfmpeg(['-ss', String(t), '-i', videoAbs, '-frames:v', '1', '-q:v', '4', f], 30000);
      if (!fs.existsSync(f)) throw new Error('sin_frame');
      frames.push({ t, file: f });
    }
  } catch (e) {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e2) {}
    return null;
  }
  return { info, frames, tmpDir };
}
function limpiarFrames(m) { if (m && m.tmpDir) { try { fs.rmSync(m.tmpDir, { recursive: true, force: true }); } catch (e) {} } }

// La llamada de visión REAL (gpt-4o-mini). internals.visionChat es la
// costura de inyección: la suite la reemplaza por veredictos
// controlados (la QA con veredictos inyectados es el precedente de
// v1077); en producción corre esta.
const internals = {
  async visionChat({ key, frames }) {
    const imgs = frames.map((fr) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(fr.file).toString('base64')}` },
    }));
    const prompt = 'Te muestro fotogramas numerados de un video, en orden. Algunos pueden tener textos QUEMADOS (subtítulos o titulares dibujados en la imagen). '
      + 'El defecto a detectar: dos textos distintos SUPERPUESTOS o PISADOS en la misma zona (letras encimadas, un texto fantasma sobre otro, ilegible). '
      + 'Que un texto tenga dos líneas propias, una arriba de la otra bien separadas y legibles, NO es defecto. '
      + 'Por CADA fotograma respondé: hay_texto (true/false), pisado (true solo si hay textos superpuestos ilegibles), '
      + 'lineas (los textos que se leen, una entrada por línea, en orden de lectura; si está pisado, tu mejor lectura de CADA texto que convive), '
      + 'zona (la caja del texto principal: {"x":0-1000,"y":0-1000,"w":0-1000,"h":0-1000} en milésimas del fotograma, o null si no hay texto). '
      + 'Respondé SOLO con JSON: {"frames":[{"hay_texto":true,"pisado":false,"lineas":["..."],"zona":{"x":0,"y":0,"w":0,"h":0}}]} — un objeto por fotograma, en el mismo orden. Sin texto extra.';
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 1200, temperature: 0,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...imgs] }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    const j = await r.json().catch(() => null);
    const raw = String((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { const v = JSON.parse(m[0]); return Array.isArray(v && v.frames) ? v.frames : null; } catch (e) { return null; }
  },
};

// Agrupa frames consecutivos con el mismo juego de líneas pisadas en
// segmentos con ventana de tiempo y zona: es lo que la corrección
// re-dibuja (cada segmento, limpio, en su ventana).
function segmentosDe(frames, juicio, dur, n) {
  const paso = dur / n;
  const segs = [];
  frames.forEach((fr, i) => {
    const j = juicio[i] || {};
    if (!j.pisado) return;
    const lineas = (Array.isArray(j.lineas) ? j.lineas : []).map((s) => String(s || '').trim()).filter(Boolean);
    if (!lineas.length || !j.zona) return;
    const t0 = Math.max(0, Math.round((fr.t - paso / 2) * 100) / 100);
    const t1 = Math.min(dur, Math.round((fr.t + paso / 2) * 100) / 100);
    const clave = lineas.join('') + '|' + Math.round((j.zona.y || 0) / 120);
    const prev = segs[segs.length - 1];
    if (prev && prev.clave === clave && Math.abs(prev.t1 - t0) < paso * 0.6) {
      prev.t1 = t1;
    } else {
      segs.push({ clave, lineas, zona: j.zona, t0, t1 });
    }
  });
  return segs.map(({ clave, ...s }) => s);
}

// DETECTAR: { estado: 'ok' | 'sin_texto' | 'defecto' | 'no_verificado',
//             segmentos?, motivo? }
// 'ok' y 'sin_texto' son los únicos veredictos limpios.
async function detectar({ videoAbs, key, vision }) {
  try {
    if (!videoAbs || !fs.existsSync(videoAbs)) return { estado: 'no_verificado', motivo: 'sin_archivo' };
    if (!key) return { estado: 'no_verificado', motivo: 'sin_clave' };
    const m = await extraerFrames(videoAbs, 8);
    if (!m) return { estado: 'no_verificado', motivo: 'sin_frames' };
    try {
      const chat = vision || internals.visionChat;
      const juicio = await chat({ key, frames: m.frames, info: m.info });
      if (!Array.isArray(juicio) || juicio.length !== m.frames.length) return { estado: 'no_verificado', motivo: 'sin_veredicto' };
      const conTexto = juicio.filter((j) => j && j.hay_texto);
      if (!conTexto.length) return { estado: 'sin_texto', info: m.info };
      const pisados = juicio.filter((j) => j && j.pisado);
      if (!pisados.length) return { estado: 'ok', info: m.info };
      const segmentos = segmentosDe(m.frames, juicio, m.info.duration, m.frames.length);
      if (!segmentos.length) return { estado: 'no_verificado', motivo: 'defecto_sin_reconstruccion' };
      return { estado: 'defecto', segmentos, info: m.info };
    } finally { limpiarFrames(m); }
  } catch (e) { return { estado: 'no_verificado', motivo: 'error' }; }
}

// CORREGIR: tapa cada zona defectuosa durante su ventana (caja oscura,
// el mismo lenguaje visual de los renders de Posty) y re-dibuja las
// líneas reconstruidas APILADAS con su alto de línea — una línea por
// renglón, nunca dos a la misma altura — con el plan de ventanas que
// la detección midió. El resto del video no se toca (audio copiado,
// sin re-encode de audio; el video se re-encodea solo por el filtro).
async function corregir({ videoAbs, segmentos, outAbs, info }) {
  try {
    if (!videoAbs || !fs.existsSync(videoAbs) || !Array.isArray(segmentos) || !segmentos.length) return { ok: false, motivo: 'sin_segmentos' };
    const inf = info || (await runFfprobe(videoAbs));
    if (!inf || !inf.width || !inf.height) return { ok: false, motivo: 'sin_info' };
    const W = inf.width, H = inf.height;
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pz-det-corr-'));
    try {
      const filters = [];
      let n = 0;
      for (const s of segmentos) {
        const z = s.zona || {};
        const zx = Math.max(0, Math.round((Number(z.x) || 0) / 1000 * W));
        const zy = Math.max(0, Math.round((Number(z.y) || 0) / 1000 * H));
        const zw = Math.min(W - zx, Math.round((Number(z.w) || 1000) / 1000 * W));
        const zh = Math.min(H - zy, Math.round((Number(z.h) || 0) / 1000 * H));
        if (zw < 40 || zh < 24) continue;
        const en = `enable='between(t,${s.t0.toFixed(2)},${s.t1.toFixed(2)})'`;
        // Tapar la zona pisada durante su ventana.
        filters.push(`drawbox=x=${zx}:y=${zy}:w=${zw}:h=${zh}:color=black@0.88:t=fill:${en}`);
        // Re-dibujar las líneas apiladas, centradas en la zona.
        const lineas = s.lineas.slice(0, 3);
        const size = Math.max(28, Math.min(120, Math.floor(zh / (lineas.length * 1.45))));
        const lh = Math.round(size * 1.28);
        const y0 = zy + Math.max(0, Math.round((zh - lh * lineas.length) / 2));
        lineas.forEach((linea, i) => {
          const f = path.join(tmpDir, `l${n++}.txt`);
          fs.writeFileSync(f, linea, 'utf8');
          const bw = Math.max(2, Math.round(size / 24));
          filters.push(`drawtext=fontfile='${FONT}':textfile='${f}':fontsize=${size}:fontcolor=white:` +
            `borderw=${bw}:bordercolor=black@0.5:shadowcolor=black@0.35:shadowx=${bw}:shadowy=${bw}:` +
            `x=${zx}+(${zw}-text_w)/2:y=${y0 + i * lh}:${en}`);
        });
      }
      if (!filters.length) return { ok: false, motivo: 'sin_filtros' };
      await runFfmpeg(['-i', videoAbs, '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', outAbs], 300000);
      if (!fs.existsSync(outAbs)) return { ok: false, motivo: 'sin_salida' };
      return { ok: true };
    } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {} }
  } catch (e) { return { ok: false, motivo: 'error' }; }
}

module.exports = { detectar, corregir, internals, _extraerFrames: extraerFrames };
