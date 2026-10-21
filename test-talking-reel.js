// Harness del REEL HABLADO (talking-reel.js) — NO va al deploy.
// Corre: node test-talking-reel.js
// Usa la transcripción REAL de Whisper de la corrida de verificación
// (equipo-posty/hidden_files/reel-hablado-2026-10-21/assets/transcript.json)
// y los assets de práctica de esa misma carpeta. La integración renderiza
// el reel de verdad con ffmpeg y extrae frames para inspección visual.
const { execFileSync, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

const ASSETS = path.join(__dirname, '..', 'workspace', 'equipo-posty', 'hidden_files', 'reel-hablado-2026-10-21', 'assets');
const ASSETS2 = '/home/hatch/workspace/equipo-posty/hidden_files/reel-hablado-2026-10-21/assets';

function probe(file) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-show_entries', 'format=duration', '-of', 'json', file],
      (err, stdout) => { if (err) return resolve(null); try { resolve(JSON.parse(stdout)); } catch (e) { resolve(null); } });
  });
}
function frame(file, t, out) {
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-q:v', '3', out], { stdio: 'ignore' });
  return out;
}

async function main() {
  console.log('== test-talking-reel.js ==');
  const A = fs.existsSync(path.join(ASSETS2, 'transcript.json')) ? ASSETS2 : ASSETS;

  // 1. Sintaxis
  try {
    execFileSync('node', ['--check', path.join(__dirname, 'talking-reel.js')], { stdio: 'ignore' });
    ok(true, 'node --check talking-reel.js');
  } catch (e) { ok(false, 'node --check talking-reel.js', e.message); }

  const tr = require('./talking-reel');
  const raw = JSON.parse(fs.readFileSync(path.join(A, 'transcript.json'), 'utf8'));
  const words = raw.words.map(w => ({ w: String(w.word).trim(), s: w.start, e: w.end })).filter(w => w.w);
  const segments = raw.segments.map(s => ({ text: String(s.text).trim(), s: s.start, e: s.end }));
  ok(words.length >= 50, `transcripción real con timestamps por palabra (${words.length} palabras)`);

  const digest = {
    business: 'Café del Barrio', category: 'cafeteria', ciudad: 'Buenos Aires',
    productos: [
      { nombre: 'café de especialidad' },
      { nombre: 'moka de acero inoxidable' },
      { nombre: 'medialunas de manteca' },
    ],
    servicios: [{ nombre: 'cursos de barista' }],
    producto_estrella: 'café de especialidad',
  };

  // 2. Detección de menciones: las 2 del guion, con armonía
  const det = tr.detectMoments({ words, segments, digest, duration: raw.duration });
  ok(det.moments.length === 2, `detecta 2 momentos (detectó ${det.moments.length})`, JSON.stringify(det.moments.map(m => m.product)));
  ok(det.moments.some(m => /café/i.test(m.product)), 'momento 1 = café de especialidad');
  ok(det.moments.some(m => /moka/i.test(m.product)), 'momento 2 = moka de acero inoxidable');
  if (det.moments.length === 2) {
    ok(det.moments[0].start >= 2.3, `corte 1 fuera del gancho (start ${det.moments[0].start}s)`);
    ok(det.moments[1].start - det.moments[0].start >= 3.8, `respiro entre cortes (${(det.moments[1].start - det.moments[0].start).toFixed(1)}s)`);
    ok(det.moments.every(m => m.fact && m.fact.length >= 8), 'cada momento trae su placa de dato (la imagen explica)');
  }
  ok(det.hook && /café/i.test(det.hook.text), 'el gancho es la oración del producto estrella');

  // 3. Caso borde: sin menciones → cero momentos, gancho = primera oración
  const noWords = 'hola hoy abrimos temprano y hay medialunas ricas para todos los que pasen por el local'.split(' ')
    .map((w, i) => ({ w, s: i * 0.35, e: i * 0.35 + 0.3 }));
  const det0 = tr.detectMoments({ words: noWords, segments: [{ text: 'hola hoy abrimos temprano', s: 0, e: 1.4 }], digest: { productos: [{ nombre: 'café de especialidad' }] }, duration: 6 });
  ok(det0.moments.length === 0, 'sin menciones → 0 momentos (solo subtítulos)');
  ok(!!det0.hook.text, 'sin menciones → el gancho cae a la primera oración');

  // 4. Estrés de armonía: menciones cada 2 s en 30 s → tope y respiro
  const stress = [];
  for (let i = 0; i < 60; i++) {
    const t = i * 0.5;
    stress.push({ w: i % 4 === 0 ? 'moka' : 'palabra', s: t, e: t + 0.4 });
  }
  const detS = tr.detectMoments({ words: stress, segments: [], digest: { productos: [{ nombre: 'moka' }, { nombre: 'café' }] }, duration: 30 });
  ok(detS.moments.length <= 3, `estrés: máximo 3 cortes en 30 s (eligió ${detS.moments.length})`);
  let gapsOk = true;
  for (let i = 1; i < detS.moments.length; i++) if (detS.moments[i].start - detS.moments[i - 1].start < 3.8) gapsOk = false;
  ok(gapsOk, 'estrés: respiro ≥3,8 s entre todos los cortes');

  // 5. ASS: fidelidad (todas las palabras, en orden) + gancho + placas
  const ass = tr.buildAss({ words, moments: det.moments, hook: det.hook, brandHex: '#7B4B2A' });
  // Karaoke ASS: cada palabra tiene su evento Cap con la FRASE entera y
  // esa palabra resaltada. Fidelidad = las frases (sin duplicar eventos
  // consecutivos) concatenan EXACTAMENTE las palabras transcritas, y hay
  // un evento por palabra. El texto va tras la 9ª coma (10 campos ASS).
  const capTexts = ass.split('\n').filter(l => l.startsWith('Dialogue: 0,') && l.includes(',Cap,,'))
    .map(l => l.split(',').slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\[{}]/g, '').replace(/\s+/g, ' ').trim());
  const phrases = capTexts.filter((t, i) => i === 0 || t !== capTexts[i - 1]);
  const assWords = phrases.join(' ').split(/\s+/).filter(Boolean);
  const origWords = words.map(w => w.w);
  ok(JSON.stringify(assWords) === JSON.stringify(origWords), 'ASS: el subtítulo reproduce la transcripción palabra por palabra');
  ok(capTexts.length === origWords.length, 'ASS: un evento karaoke por palabra (' + capTexts.length + '/' + origWords.length + ')');
  ok(ass.includes('Style: Cap,') && ass.includes('Style: Chip,') && ass.includes('Style: Hook,'), 'ASS: estilos Cap/Chip/Hook presentes');
  ok((ass.match(/Dialogue: 1,/g) || []).length === det.moments.filter(m => m.fact).length, 'ASS: una placa de dato por momento');
  ok(tr._internals.hexToAss('#FEC14D') === '&H004DC1FE', 'hexToAss convierte #RRGGBB → &HBBGGRR');

  // 6. transcribeWithWords con fetch stub: contrato con la API
  let seen = null;
  const stubFetch = async (url, opts) => {
    seen = { url, auth: (opts.headers || {}).Authorization || '', form: opts.body };
    return { ok: true, json: async () => raw };
  };
  const tw = await tr.transcribeWithWords({ file: path.join(A, 'entrada.mp4'), apiKey: 'sk-test', lang: 'es', fetchImpl: stubFetch, tmpDir: fs.mkdtempSync(path.join(os.tmpdir(), 'tw-')) });
  ok(seen && seen.url === 'https://api.openai.com/v1/audio/transcriptions', 'transcribe: endpoint de transcripciones');
  ok(seen && seen.auth === 'Bearer sk-test', 'transcribe: Authorization bearer');
  ok(seen && seen.form.get('model') === 'whisper-1' && seen.form.get('response_format') === 'verbose_json', 'transcribe: whisper-1 + verbose_json');
  ok(seen && seen.form.getAll('timestamp_granularities[]').includes('word'), 'transcribe: pide timestamps por palabra');
  ok(tw.words.length === words.length && Math.abs(tw.costUsd - 0.0021) < 0.001, `transcribe: mapea palabras y costo (USD ${tw.costUsd})`);

  // 7. Fail-closed: sin clave no hay transcripción (ni resultado falso)
  let threw = '';
  try { await tr.transcribeWithWords({ file: path.join(A, 'entrada.mp4'), apiKey: '', lang: 'es' }); } catch (e) { threw = e.message; }
  ok(threw === 'sin_clave_openai', 'fail-closed: sin clave → sin_clave_openai');

  // 8. INTEGRACIÓN: pipeline completo → borrador en la Agenda
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talk-media-'));
  fs.copyFileSync(path.join(A, 'cafe.jpg'), path.join(mediaDir, 'cafe.jpg'));
  fs.copyFileSync(path.join(A, 'moka.jpg'), path.join(mediaDir, 'moka.jpg'));
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, image_path TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', hashtags TEXT NOT NULL DEFAULT '', scheduled_at TEXT, status TEXT NOT NULL DEFAULT 'draft', ig_permalink TEXT DEFAULT '', error TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), published_at TEXT, carousel_paths TEXT DEFAULT '', tipo TEXT DEFAULT '', media_type TEXT DEFAULT 'image', source_topic TEXT DEFAULT '', source_angle TEXT DEFAULT '', strategy_why TEXT DEFAULT '', week_key TEXT DEFAULT '', needs_review INTEGER DEFAULT 0);
    CREATE TABLE settings (user_id INTEGER PRIMARY KEY, brand_colors TEXT DEFAULT '');
    CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '', description TEXT DEFAULT '');
    CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, file_path TEXT, kind TEXT, album_tag TEXT DEFAULT '', thumb_path TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
    CREATE TABLE client_digest (user_id INTEGER PRIMARY KEY, digest_json TEXT);
    CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT);`);
  db.prepare('INSERT INTO settings (user_id, brand_colors) VALUES (7, ?)').run('#7B4B2A');
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (7, ?, ?, ?)').run('Café del Barrio', 'cafedelbarrio', 'cafeteria');
  db.prepare('INSERT INTO client_digest (user_id, digest_json) VALUES (7, ?)').run(JSON.stringify(digest));
  db.prepare(`INSERT INTO posts (user_id, image_path, caption, media_type, status) VALUES (7, '/media/cafe.jpg', 'Nuestro café de especialidad, recién tostado en tandas chicas', 'image', 'published')`).run();
  db.prepare(`INSERT INTO posts (user_id, image_path, caption, media_type, status) VALUES (7, '/media/moka.jpg', 'La moka de acero inoxidable que usamos todos los días', 'image', 'published')`).run();

  const transcribeImpl = async () => ({ text: raw.text, duration: raw.duration, words, segments, costUsd: 0.0021 });
  const t0 = Date.now();
  const res = await tr.createTalkingReelDraft({
    db, uid: 7, inputFile: path.join(A, 'entrada.mp4'), mediaDir,
    apiKey: 'sk-test', weekKey: '2026-10-19', lang: 'es', transcribeImpl,
  });
  const renderSec = ((Date.now() - t0) / 1000).toFixed(1);
  ok(!!res.postId, `integración: borrador creado (post ${res.postId}) en ${renderSec}s de pipeline`);
  ok(res.cuts === 2, `integración: 2 cortes a foto (hizo ${res.cuts})`);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(res.postId);
  ok(post && post.status === 'draft' && post.media_type === 'video' && post.tipo === 'reel', 'integración: el post es borrador video/reel de la Agenda');
  ok(post && /Reel hablado/.test(post.strategy_why) && /café/i.test(post.strategy_why), 'integración: strategy_why declara productos y cortes');
  const info = await probe(res.file);
  const v = info && info.streams.find(s => s.codec_type === 'video');
  const au = info && info.streams.find(s => s.codec_type === 'audio');
  ok(v && v.width === 1080 && v.height === 1920, 'salida: 1080×1920 vertical');
  ok(!!au, 'salida: tiene audio (la voz)');
  const durOut = info ? parseFloat(info.format.duration) : 0;
  // La referencia es la duración del VIDEO de entrada (el pipeline sigue
  // al video; en el asset sintético el audio dura 20.9s y el video 22.3s).
  const inInfo = await probe(path.join(A, 'entrada.mp4'));
  const durIn = inInfo ? parseFloat(inInfo.format.duration) : raw.duration;
  ok(Math.abs(durOut - (durIn + 2.2)) < 0.7, `salida: duración = video + placa (${durOut.toFixed(1)}s vs ${(durIn + 2.2).toFixed(1)}s)`);
  const framesDir = path.join(A, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const m1 = res.moments[0], m2 = res.moments[1];
  frame(res.file, 1.0, path.join(framesDir, 'f1-gancho.jpg'));
  frame(res.file, ((m1.start + m1.end) / 2).toFixed(2), path.join(framesDir, 'f2-corte-cafe.jpg'));
  frame(res.file, ((m2.start + m2.end) / 2).toFixed(2), path.join(framesDir, 'f3-corte-moka.jpg'));
  frame(res.file, (durOut - 1.1).toFixed(2), path.join(framesDir, 'f4-cierre.jpg'));
  frame(res.file, (m1.start - 1.2).toFixed(2), path.join(framesDir, 'f5-subtitulos.jpg'));
  console.log('  frames para inspección:', framesDir);
  console.log(`  reel de prueba: ${res.file} (copiar a assets/salida-reel-hablado.mp4)`);
  fs.copyFileSync(res.file, path.join(A, 'salida-reel-hablado.mp4'));

  console.log(`\n== ${pass} ok, ${fail} fallas ==`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('ERROR del harness:', e); process.exit(2); });
