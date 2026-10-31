// Harness de ai-video.js (v329 — video firma semanal, brief §7.8).
// Corre: node test-ai-video.js
// TODO con mocks: fetch global stubbeado (cero llamadas reales a fal, cero
// FAL_KEY real) + SQLite en memoria (node:sqlite) con el schema real de
// api_costs. Los escenarios de integración usan generateWeekExtras real
// sobre una DB mínima: la semana tiene que salir IGUAL con el flag
// apagado, con fal caído y con fal OK (ahí además nace el clip firma).
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Env de test ANTES de require (polling/deadline se leen al cargar el módulo).
process.env.POSTY_AI_VIDEO_POLL_MS = '10';
process.env.POSTY_AI_VIDEO_DEADLINE_MS = '900';
delete process.env.POSTY_AI_VIDEO;
delete process.env.FAL_KEY;
delete process.env.POSTY_AI_VIDEO_UIDS;
delete process.env.POSTY_AI_VIDEO_MODEL;

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra || ''); }
}

// ---------- fixtures: clip de muestra real + foto héroe ----------
// OJO: el root de test va en el ÁRBOL, no en os.tmpdir() — /tmp es un
// tmpfs de 512MB compartido y los renders 1080×1920 lo llenan (visto en
// la primera corrida: "No space left on device" a mitad de la semana).
const tmpRoot = fs.mkdtempSync(path.join(__dirname, '.test-ai-video-'));
const sampleMp4 = path.join(tmpRoot, 'sample.mp4');
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:duration=5:rate=24', '-pix_fmt', 'yuv420p', sampleMp4], { stdio: 'ignore' });
const sampleBuf = fs.readFileSync(sampleMp4);
const heroJpg = path.join(tmpRoot, 'hero.jpg');
execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:duration=1:rate=1', '-frames:v', '1', heroJpg], { stdio: 'ignore' });

// ---------- DB de costos (schema real de api_costs) ----------
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE api_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER, feature TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '',
  in_tokens INTEGER NOT NULL DEFAULT 0, out_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0,
  est_cost_usd REAL NOT NULL DEFAULT 0
);`);
const costs = require('./costs');
costs.initCosts(db, { planFor: () => null });
const videoCostRows = (uid) => db.prepare(`SELECT * FROM api_costs WHERE user_id = ? AND feature = 'ai-video' ORDER BY id`).all(uid);

// ---------- mock de fal (fetch global) ----------
const fal = { mode: 'ok', submits: 0, statusCalls: 0, cancels: 0, uploads: 0, bodies: [], urls: [] };
function resetFal(mode) {
  fal.mode = mode; fal.submits = 0; fal.statusCalls = 0; fal.cancels = 0; fal.uploads = 0; fal.bodies = []; fal.urls = [];
}
function mkRes({ status = 200, json = null, buf = null, text = '' }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text || (json ? JSON.stringify(json) : ''),
    arrayBuffer: async () => (buf ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : new ArrayBuffer(0)),
  };
}
const SUBMIT_OK = {
  request_id: 'req-1',
  status_url: 'https://queue.fal.run/status/req-1',
  response_url: 'https://queue.fal.run/result/req-1',
  cancel_url: 'https://queue.fal.run/cancel/req-1',
};
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  const method = (opts.method || 'GET').toUpperCase();
  fal.urls.push(`${method} ${u}`);
  if (u === 'https://rest.alpha.fal.ai/storage/upload/initiate') {
    fal.uploads++;
    return mkRes({ json: { upload_url: 'https://storage.test/put-hero', file_url: 'https://storage.test/hero.jpg' } });
  }
  if (u === 'https://storage.test/put-hero') return mkRes({ json: {} });
  if (u.startsWith('https://queue.fal.run/bytedance/')) {
    fal.submits++;
    let body = {};
    try { body = JSON.parse(opts.body || '{}'); } catch (e) {}
    fal.bodies.push(body);
    if (fal.mode === 'auth') return mkRes({ status: 401, json: { detail: 'Unauthorized' } });
    if (fal.mode === 'submit500once' && fal.submits === 1) return mkRes({ status: 500, json: { detail: 'boom' } });
    if (fal.mode === 'aspect422' && fal.submits === 1) return mkRes({ status: 422, text: 'aspect_ratio is not supported for this model', json: { detail: 'aspect_ratio is not supported' } });
    return mkRes({ json: SUBMIT_OK });
  }
  if (u === 'https://queue.fal.run/status/req-1') {
    fal.statusCalls++;
    if (fal.mode === 'content') return mkRes({ json: { status: 'COMPLETED', error_type: 'content_policy_violation', error: 'blocked by content policy' } });
    if (fal.mode === 'hang') return mkRes({ json: { status: 'IN_PROGRESS' } });
    if (fal.statusCalls === 1) return mkRes({ json: { status: 'IN_PROGRESS' } });
    return mkRes({ json: { status: 'COMPLETED' } });
  }
  if (u === 'https://queue.fal.run/result/req-1') {
    return mkRes({ json: { video: { url: 'https://cdn.test/clip.mp4', content_type: 'video/mp4' }, seed: 42 } });
  }
  if (u === 'https://queue.fal.run/cancel/req-1') { fal.cancels++; return mkRes({ json: {} }); }
  if (u === 'https://cdn.test/clip.mp4') {
    if (fal.mode === 'badclip') return mkRes({ buf: Buffer.from('esto no es un mp4') });
    return mkRes({ buf: sampleBuf });
  }
  throw new Error('fetch mock: URL inesperada ' + u);
};

const aiVideo = require('./ai-video');
const reelScript = require('./reel-script');

function newMediaDir() { return fs.mkdtempSync(path.join(tmpRoot, 'media-')); }
function setEnvOn(uids) {
  process.env.POSTY_AI_VIDEO = '1';
  process.env.FAL_KEY = 'test-key-no-real';
  process.env.POSTY_AI_VIDEO_UIDS = uids;
}
function setEnvOff() {
  delete process.env.POSTY_AI_VIDEO;
  delete process.env.FAL_KEY;
  delete process.env.POSTY_AI_VIDEO_UIDS;
}

async function main() {
  console.log('== test-ai-video.js ==');

  // 0. Sintaxis de todos los archivos tocados por v329
  for (const f of ['ai-video.js', 'costs.js', 'reel-script.js', 'story-reel.js', 'reel-engine.js', 'server.js']) {
    try { execFileSync('node', ['--check', path.join(__dirname, f)], { stdio: 'ignore' }); ok(true, `node --check ${f}`); }
    catch (e) { ok(false, `node --check ${f}`, e.message); }
  }

  // 1. Puertas cerradas: sin flag / sin key / uid no habilitado → null, CERO fetch
  {
    setEnvOff(); resetFal('ok');
    const fetchCalls = () => fal.urls.length;
    const before = fetchCalls();
    const r1 = await aiVideo.generateSignatureClip({ db, uid: 12, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(r1 === null && fetchCalls() === before, 'sin flag POSTY_AI_VIDEO → null y cero llamadas a fal');
    process.env.POSTY_AI_VIDEO = '1'; process.env.POSTY_AI_VIDEO_UIDS = '12'; // sin FAL_KEY
    const r2 = await aiVideo.generateSignatureClip({ db, uid: 12, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(r2 === null && fetchCalls() === before, 'sin FAL_KEY → null y cero llamadas a fal');
    process.env.FAL_KEY = 'test-key-no-real'; process.env.POSTY_AI_VIDEO_UIDS = '99'; // uid 12 no habilitado
    const r3 = await aiVideo.generateSignatureClip({ db, uid: 12, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(r3 === null && fetchCalls() === before, 'uid fuera de POSTY_AI_VIDEO_UIDS → null y cero llamadas a fal');
  }

  // 2. Happy path PRO (2.5): archivo, payload, costo logueado
  const mediaPro = newMediaDir();
  {
    setEnvOn('12'); resetFal('ok');
    const r = await aiVideo.generateSignatureClip({ db, uid: 12, planId: 'pro', imageFile: heroJpg, prompt: 'test prompt', mediaDir: mediaPro, weekKey: '2026-10-19' });
    ok(!!r && r.file === path.join(mediaPro, 'ai-signature-12-2026-10-19.mp4'), 'pro: devuelve el clip con nombre determinístico (con uid: MEDIA_DIR es compartido)', JSON.stringify(r));
    ok(fs.existsSync(r.file), 'pro: el archivo existe en el mediaDir');
    const info = await require('./reel-engine').mediaInfo(r.file);
    ok(info && info.duration >= 4 && info.width > 0, 'pro: el clip valida por ffprobe (mediaInfo)', JSON.stringify(info));
    ok(fal.urls.some(u => u.includes('bytedance/seedance-2.5/image-to-video')), 'pro: submit al endpoint 2.5');
    ok(fal.uploads === 1 && fal.bodies.length === 1, 'pro: 1 subida a storage + 1 submit');
    const b = fal.bodies[0];
    ok(b.generate_audio === false && b.duration === '10' && b.resolution === '720p' && b.aspect_ratio === '9:16' && b.image_url === 'https://storage.test/hero.jpg',
      'pro: payload según brief (audio off, duration string "10", 720p, 9:16, image_url de storage)', JSON.stringify(b));
    const rows = videoCostRows(12);
    ok(rows.length === 1 && rows[0].model === 'bytedance/seedance-2.5/image-to-video' && Math.abs(rows[0].est_cost_usd - 4.73) < 0.001,
      'pro: costo logueado en api_costs (feature ai-video, USD 4.73)', JSON.stringify(rows));
    ok(r.model === 'bytedance/seedance-2.5/image-to-video' && r.requestId === 'req-1' && Math.abs(r.costUsd - 4.73) < 0.001,
      'pro: el retorno trae modelo/requestId/costo');
  }

  // 3. Idempotencia: segunda corrida de la misma semana NO gasta
  {
    resetFal('ok');
    const submitsBefore = fal.submits;
    const r = await aiVideo.generateSignatureClip({ db, uid: 12, planId: 'pro', imageFile: heroJpg, prompt: 'otro prompt', mediaDir: mediaPro, weekKey: '2026-10-19' });
    ok(!!r && r.reused === true && fal.submits === submitsBefore && videoCostRows(12).length === 1,
      'idempotencia: segunda corrida devuelve el clip sin nuevo submit ni nuevo costo');
    // Incluso con el flag apagado, el clip existente se reusa (no se pierde la firma ya paga)
    setEnvOff();
    const r2 = await aiVideo.generateSignatureClip({ db, uid: 12, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: mediaPro, weekKey: '2026-10-19' });
    ok(!!r2 && r2.reused === true, 'idempotencia: con flag apagado el clip existente se sigue reusando');
  }

  // 4. Routing ESENCIAL (2.0 Fast, 8s) y su costo
  {
    setEnvOn('21'); resetFal('ok');
    const r = await aiVideo.generateSignatureClip({ db, uid: 21, planId: 'esencial', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(!!r && fal.urls.some(u => u.includes('bytedance/seedance-2.0/fast/image-to-video')), 'esencial: submit al endpoint 2.0 Fast');
    ok(fal.bodies[0] && fal.bodies[0].duration === '8', 'esencial: duration string "8"');
    const rows = videoCostRows(21);
    ok(rows.length === 1 && Math.abs(rows[0].est_cost_usd - 1.9352) < 0.001, 'esencial: costo logueado USD 1.9352 (0.2419 × 8)', JSON.stringify(rows));
  }

  // 5. Cap de video alcanzado → null ANTES de gastar (cero submits)
  {
    setEnvOn('77'); resetFal('ok');
    db.prepare(`INSERT INTO api_costs (user_id, feature, model, est_cost_usd) VALUES (77, 'ai-video', 'previo', 40)`).run();
    const r = await aiVideo.generateSignatureClip({ db, uid: 77, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(r === null && fal.submits === 0 && fal.uploads === 0, 'cap: con el mes de video lleno (USD 40 > tope Pro 32) → null sin gastar');
    ok(costs.aiVideoCapUsd('pro') === 32 && costs.aiVideoCapUsd('esencial') === 14 && costs.aiVideoCapUsd('total') === 32,
      'cap: línea separada por plan (Esencial 14 · Pro 32 · Total 32)');
  }

  // 6. FAL_KEY inválida (401) → null, SIN reintento, sin costo
  {
    setEnvOn('31'); resetFal('auth');
    const r = await aiVideo.generateSignatureClip({ db, uid: 31, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(r === null && fal.submits === 1 && videoCostRows(31).length === 0, 'auth 401: null con 1 solo submit (sin reintento) y sin costo');
  }

  // 7. Rechazo de contenido → null, SIN reintento
  {
    setEnvOn('32'); resetFal('content');
    const r = await aiVideo.generateSignatureClip({ db, uid: 32, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(r === null && fal.submits === 1 && videoCostRows(32).length === 0, 'rechazo de contenido: null con 1 solo submit (sin reintento)');
  }

  // 8. Fallo técnico en submit (500) → 1 reintento y éxito; costo logueado 1 vez
  {
    setEnvOn('33'); resetFal('submit500once');
    const r = await aiVideo.generateSignatureClip({ db, uid: 33, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(!!r && fal.submits === 2, '500 en submit: reintenta 1 vez y genera el clip');
    ok(videoCostRows(33).length === 1, '500 en submit: el costo se loguea solo por la generación exitosa');
    ok(fal.bodies[1] && Number.isFinite(fal.bodies[1].seed), 'reintento: el segundo submit lleva seed distinta');
  }

  // 9. Timeout de polling (deadline) → null, con cancel best-effort, sin colgar
  {
    setEnvOn('34'); resetFal('hang');
    const t0 = Date.now();
    const r = await aiVideo.generateSignatureClip({ db, uid: 34, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    const elapsed = Date.now() - t0;
    ok(r === null && fal.cancels >= 1 && elapsed < 8000, `timeout: deadline corta, cancela y devuelve null (tardó ${elapsed}ms)`);
  }

  // 10. Clip descargado inválido → reintento técnico → null; costos de AMBAS generaciones logueados
  {
    setEnvOn('35'); resetFal('badclip');
    const media = newMediaDir();
    const r = await aiVideo.generateSignatureClip({ db, uid: 35, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: media, weekKey: '2026-10-19' });
    ok(r === null && fal.submits === 2, 'clip inválido: 1 reintento técnico y null');
    ok(videoCostRows(35).length === 2, 'clip inválido: ambas generaciones quedaron logueadas (fal las cobró)');
    ok(!fs.existsSync(path.join(media, 'ai-signature-35-2026-10-19.mp4')) && !fs.existsSync(path.join(media, '.tmp-ai-signature-35-2026-10-19.mp4')),
      'clip inválido: no queda archivo final ni temporal');
  }

  // 11. 422 por aspect_ratio → reintento del submit con 'auto' (no consume el reintento técnico)
  {
    setEnvOn('36'); resetFal('aspect422');
    const r = await aiVideo.generateSignatureClip({ db, uid: 36, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: newMediaDir(), weekKey: '2026-10-19' });
    ok(!!r && fal.submits === 2 && fal.bodies[0].aspect_ratio === '9:16' && fal.bodies[1].aspect_ratio === 'auto',
      '422 aspect: segundo submit con aspect_ratio "auto" y clip generado');
    ok(videoCostRows(36).length === 1, '422 aspect: una sola generación cobrada');
  }

  // 12. buildVideoPrompt: plantillas por rubro del brief + genérica segura
  {
    const pPelu = reelScript.buildVideoPrompt({ digest: { category: 'peluqueria', subcat: 'peluqueria', servicios: [{ nombre: 'Balayage' }], productos: [] } });
    ok(/hair/i.test(pPelu), 'videoPrompt peluquería: plantilla del pelo (§5.1)');
    const pCafe = reelScript.buildVideoPrompt({ digest: { category: 'gastronomia', subcat: 'cafeteria', productos: [{ nombre: 'Flat white' }], servicios: [] } });
    ok(/latte art/i.test(pCafe), 'videoPrompt cafetería: plantilla del latte art (§5.3)');
    const pMuebles = reelScript.buildVideoPrompt({ digest: { category: 'muebles', subcat: '', productos: [{ nombre: 'Sillón Oslo' }], servicios: [] } });
    ok(/sofa/i.test(pMuebles), 'videoPrompt muebles: plantilla del living (§5.6)');
    const pBarber = reelScript.buildVideoPrompt({ digest: { category: 'peluqueria', subcat: 'barberia', servicios: [{ nombre: 'Corte' }], productos: [] } });
    ok(!/hair/i.test(pBarber) && /push-in/.test(pBarber), 'videoPrompt barbería: NO usa la de pelo — genérica segura (banco extra = fase 2)');
    const pGen = reelScript.buildVideoPrompt({ digest: { category: 'otro', productos: [{ nombre: 'Sillón Oslo' }], servicios: [] } });
    ok(pGen.includes('Sillón Oslo') && /stays perfectly still/.test(pGen), 'videoPrompt genérico: nombra el producto estrella y lo deja quieto (§7.5.3)');
    const pVacio = reelScript.buildVideoPrompt({ digest: {} });
    ok(typeof pVacio === 'string' && pVacio.length > 30, 'videoPrompt sin fundamento: nunca vacío');
  }

  // 13. buildReelScript: el campo videoPrompt viaja en el guion (IA y degradado)
  {
    const digestPelu = {
      v: 1, business: 'Salón Aurora', category: 'peluqueria', subcat: 'peluqueria',
      servicios: [{ nombre: 'Balayage' }, { nombre: 'Corte y brushing' }], productos: [{ nombre: 'Máscara nutritiva de karité' }],
      promos: [], temas_feed: [], protagonista: '', paleta: [], registro: null, ciudad: 'Palermo', diferencial: '', has_booking: true, fuentes: {},
    };
    const SCRIPT_OK = { scenes: [
      { role: 'hook', line: '¿Tu balayage perdió el brillo del primer día?', visualHint: 'pelo opaco que pasa a brillar' },
      { role: 'problem', line: 'Sin máscara nutritiva, el color se lava y queda opaco', visualHint: 'lavado con espuma' },
      { role: 'solution', line: 'Nuestro balayage incluye nutrición profunda con karité siempre', visualHint: 'aplicación de máscara' },
      { role: 'cta', line: 'Reservá tu turno de balayage por DM', visualHint: 'agenda del salón' },
    ] };
    const sAi = await reelScript.buildReelScript({ digest: digestPelu, post: {}, durationSec: 15, intent: 'reserva', aiCall: async () => SCRIPT_OK, apiKey: 'x' });
    ok(sAi.source === 'ai' && /hair/i.test(sAi.videoPrompt || ''), 'buildReelScript IA: incluye videoPrompt de la plantilla del rubro');
    const sDeg = await reelScript.buildReelScript({ digest: null, post: { caption: 'Balayage nuevo en el salón' }, durationSec: 15, aiCall: async () => { throw new Error('sin key'); } });
    ok(sDeg.degraded === true && typeof sDeg.videoPrompt === 'string' && sDeg.videoPrompt.length > 30,
      'buildReelScript degradado: también incluye videoPrompt (fallback no bloquea)');
  }

  // ---------- Integración: generateWeekExtras (la semana sale igual) ----------
  const storyReel = require('./story-reel');
  function buildExtrasDb() {
    const d = new DatabaseSync(':memory:');
    d.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, plan TEXT, plan_status TEXT);
      CREATE TABLE profiles (user_id INTEGER, business_name TEXT, category TEXT, ig_username TEXT, description TEXT);
      CREATE TABLE settings (user_id INTEGER, brand_colors TEXT);
      CREATE TABLE assets (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, kind TEXT, file_path TEXT, created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE business_dna (user_id INTEGER, dna_json TEXT);
      CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, image_path TEXT, caption TEXT, hashtags TEXT,
        status TEXT, media_type TEXT, source_topic TEXT, source_angle TEXT, tipo TEXT, strategy_why TEXT, week_key TEXT, needs_review INTEGER);
      INSERT INTO users (id, plan, plan_status) VALUES (12, 'esencial', 'trial');
      INSERT INTO profiles (user_id, business_name, category, ig_username) VALUES (12, 'Café Bruma', 'gastronomia', 'cafebruma');
    `);
    return d;
  }
  function seedFeed(mediaDir) {
    const drafts = [];
    for (let i = 1; i <= 3; i++) {
      const f = path.join(mediaDir, `hero${i}.jpg`);
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `testsrc=size=1080x1920:duration=1:rate=1`, '-frames:v', '1', f], { stdio: 'ignore' });
      drafts.push({ image_path: `/media/hero${i}.jpg`, caption: `Posteo ${i} de la semana en Café Bruma`, hashtags: '#cafe', source_topic: 'Flat white', source_angle: '', tipo: 'post' });
    }
    return drafts;
  }
  const countVideoPosts = (d) => d.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = 12 AND media_type = 'video'`).get().n;

  // 14. Flag APAGADO: la semana sale como hoy (1 reel del plan trial), cero fal
  {
    setEnvOff(); resetFal('ok');
    const d = buildExtrasDb();
    const mediaDir = newMediaDir();
    const drafts = seedFeed(mediaDir);
    const r = await storyReel.generateWeekExtras({ db: d, uid: 12, weekKey: '2026-10-19', tag: 'test-off', mediaDir, feedDrafts: drafts, needsReview: true });
    ok(r.reels === 1 && countVideoPosts(d) === 1, 'integración flag OFF: se genera el reel de la semana como hoy', JSON.stringify(r));
    ok(fal.urls.length === 0 && !fs.existsSync(path.join(mediaDir, 'ai-signature-12-2026-10-19.mp4')),
      'integración flag OFF: cero llamadas a fal y ningún clip firma');
  }

  // 15. Flag ON + fal caído (401): la semana sale IGUAL, sin firma, sin costo
  {
    setEnvOn('12'); resetFal('auth');
    const d = buildExtrasDb();
    const mediaDir = newMediaDir();
    const drafts = seedFeed(mediaDir);
    const costsBefore = videoCostRows(12).length;
    const r = await storyReel.generateWeekExtras({ db: d, uid: 12, weekKey: '2026-10-19', tag: 'test-fail', mediaDir, feedDrafts: drafts, needsReview: true });
    ok(r.reels === 1 && countVideoPosts(d) === 1, 'integración fal caído: la semana sale completa por el pipeline actual', JSON.stringify(r));
    ok(!fs.existsSync(path.join(mediaDir, 'ai-signature-12-2026-10-19.mp4')) && videoCostRows(12).length === costsBefore,
      'integración fal caído: sin clip firma y sin costo');
  }

  // 16. Flag ON + fal OK: nace el clip firma y el reel de la semana se genera
  {
    setEnvOn('12'); resetFal('ok');
    const d = buildExtrasDb();
    const mediaDir = newMediaDir();
    const drafts = seedFeed(mediaDir);
    const r = await storyReel.generateWeekExtras({ db: d, uid: 12, weekKey: '2026-10-19', tag: 'test-ok', mediaDir, feedDrafts: drafts, needsReview: true });
    ok(r.reels === 1 && countVideoPosts(d) === 1, 'integración fal OK: el reel de la semana se genera', JSON.stringify(r));
    ok(fs.existsSync(path.join(mediaDir, 'ai-signature-12-2026-10-19.mp4')), 'integración fal OK: el clip firma quedó guardado como material del cliente');
    ok(fal.urls.some(u => u.includes('seedance-2.0/fast')), 'integración fal OK: plan trial→esencial rutea a 2.0 Fast');
    // Segunda pasada de la misma semana: extras ya completos, cero gasto nuevo
    const submitsBefore = fal.submits;
    const r2 = await storyReel.generateWeekExtras({ db: d, uid: 12, weekKey: '2026-10-19', tag: 'test-ok2', mediaDir, feedDrafts: drafts, needsReview: true });
    ok(r2.already === true && fal.submits === submitsBefore, 'integración fal OK: segunda pasada no duplica ni gasta');
  }

  // ---------- Biblioteca de vidriera (misión sumada 2026-10-22) ----------
  // 17. Registro persistente + aislamiento entre usuarios en el MISMO
  // mediaDir compartido + backfill de clips pre-registro.
  {
    const all = aiVideo.listSignatureClips(db, {});
    const row12 = all.find(r => r.user_id === 12 && r.week_key === '2026-10-19');
    ok(!!row12 && row12.plan_id === 'pro' && row12.model === 'bytedance/seedance-2.5/image-to-video'
      && Math.abs(row12.cost_usd - 4.73) < 0.001 && row12.file_name === 'ai-signature-12-2026-10-19.mp4'
      && row12.url === '/media/ai-signature-12-2026-10-19.mp4' && row12.duration_sec >= 4,
      'biblioteca: el clip pro quedó registrado (plan, modelo, costo, archivo, URL, duración)', JSON.stringify(row12));
    const row21 = all.find(r => r.user_id === 21 && r.week_key === '2026-10-19');
    ok(!!row21 && row21.plan_id === 'esencial' && /seedance-2\.0\/fast/.test(row21.model),
      'biblioteca: el clip esencial quedó registrado con su tier');

    // Mismo mediaDir + misma semana, dos usuarios: archivos distintos,
    // cero reuso cruzado (el bug que el nombre con uid previene).
    setEnvOn('12,21'); resetFal('ok');
    const shared = newMediaDir();
    const a = await aiVideo.generateSignatureClip({ db, uid: 12, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: shared, weekKey: '2026-11-02' });
    const submitsAfterA = fal.submits;
    const b = await aiVideo.generateSignatureClip({ db, uid: 21, planId: 'esencial', imageFile: heroJpg, prompt: 'x', mediaDir: shared, weekKey: '2026-11-02' });
    ok(!!a && !!b && a.file !== b.file && fal.submits === submitsAfterA + 1,
      'biblioteca: dos usuarios en el mismo mediaDir generan clips distintos (sin reuso cruzado)');
    const libShared = aiVideo.listSignatureClips(db, {});
    ok(libShared.some(r => r.user_id === 12 && r.week_key === '2026-11-02') && libShared.some(r => r.user_id === 21 && r.week_key === '2026-11-02'),
      'biblioteca: ambos clips de la semana compartida quedaron registrados');

    // Backfill: un clip que ya existe en disco (sin fila) se registra al
    // reusarlo — el registro es la garantía de no-borrado (janitor).
    setEnvOff(); resetFal('ok');
    const backDir = newMediaDir();
    fs.copyFileSync(sampleMp4, path.join(backDir, 'ai-signature-55-2026-12-07.mp4'));
    const rb = await aiVideo.generateSignatureClip({ db, uid: 55, planId: 'pro', imageFile: heroJpg, prompt: 'x', mediaDir: backDir, weekKey: '2026-12-07' });
    const rowBack = aiVideo.listSignatureClips(db, { userId: 55 });
    ok(!!rb && rb.reused === true && rowBack.length === 1 && rowBack[0].file_name === 'ai-signature-55-2026-12-07.mp4',
      'biblioteca: clip preexistente sin registro → backfill al reusar (protegido del janitor)');
    ok(fal.submits === 0, 'biblioteca: el backfill no gastó nada en fal');
  }

  setEnvOff();
  console.log(`\n== test-ai-video.js: ${pass} PASS · ${fail} FAIL ==`);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('ERROR FATAL en el harness:', e);
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (err) {}
  process.exit(2);
});
