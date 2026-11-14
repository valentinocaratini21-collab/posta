'use strict';
/* ════════════════════════════════════════════════════════════════════
   LOTE PRUEBA-SIN-VIDEO-CARO + PRIMER-POSTEO-IMAGEN — suite

   Dos reglas de Valentino (13/11, desde la corrida de Blind Barber,
   guest 101, posteos 674/675: el PRIMER posteo volvió a salir un REEL
   — slideshow local de fotos con zoom, no video real):

   REGLA 1 — COSTO («los videos 2.5 no salen en la prueba ! porque
   sino nos fundimos»): en la PRUEBA no se genera el video premium
   2.5 (fal.ai Seedance vía ai-video.js · generateSignatureClip:
   ~USD 4,73 por clip en la ruta pro/total/free). La generación de la
   prueba NUNCA invocó ese módulo (censo A): el gasto que la regla
   mata es el que ningún código le prohibía a una cuenta de prueba.
   La puerta queda FAIL-CLOSED en el punto único de llamada a fal
   (ai-video.js) + el salteo con registro en su único callsite de
   producción (story-reel.js · generateWeekExtras, solo registrado).
   El pipeline del REGISTRADO no se toca.

   REGLA 2 — EL PRIMER POSTEO ES IMAGEN, GENERALMENTE: el wow abre
   con imagen; el video vive ADENTRO de la semana. El mecanismo del
   síntoma: el video del demo es el TOUR LOCAL (demo.renderDemoVideo,
   ffmpeg, sin costo por llamada) en el slot posicional 2 del spec;
   pero la importación (server.js importTrialWeek) crea los posteos
   en el orden del payload FILTRADO — las piezas en la cadena de
   rescate se saltan — y la agenda cae por orden de creación: con las
   imágenes en rescate, el video nació primero y se quedó con el
   primer día. El enforcement vive en la importación: la pieza de
   video nunca es la primera creada si la semana trae alguna imagen.
   Excepción angosta codificada como predicado único
   (demo.trialVideoAperturaInfo): feed casi todo video (dominante
   reel con ≥ 2/3 de la ventana) Y video REAL del producto. Hoy
   ningún camino de la prueba produce un video real del producto:
   la excepción queda codificada pero sin activo que la habilite.

   Secciones:
     A · censo de callsites del video premium (la prueba jamás lo
         invoca; el único callsite de producción es el registrado)
     B · el predicado de la excepción (positivo y negativos)
     C · el spec de la prueba registra la apertura (video_apertura)
     D · la puerta de costo de ai-video.js con db falsa (invitado →
         null sin tocar fal; sin columna → no bloquea ni rompe)
     E · la importación end-to-end (boot + guest/start): la semana
         abre con IMAGEN y el video queda en su slot interior

   Uso:
     DATA_DIR=$(mktemp -d) NODE_PATH=/home/hatch/workspace/posta/node_modules \
       node test-lote-prueba-primer-posteo-imagen.js
   Control contra la base v1026 (desde este mismo directorio):
     PZ_ROOT=<base> DATA_DIR=$(mktemp -d) NODE_PATH=... \
       node test-lote-prueba-primer-posteo-imagen.js --root-label=base
     → la base REPRODUCE el síntoma: A3/A4 sin puerta, B sin
       predicado, C sin registro y en E el PRIMER posteo creado y
       programado es el VIDEO.
   ════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

let pass = 0, fail = 0;
const failures = [];
function seccion(t) { console.log('\n— ' + t); }
function ok(c, m, extra) {
  if (c) { pass++; }
  else { fail++; failures.push(m); console.log('  ✗ ' + m + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
}
function eq(a, b, m) { ok(a === b, `${m} (esperado ${JSON.stringify(b)}, vino ${JSON.stringify(a)})`); }

const SERVER = read('server.js');
const DEMO = read('demo.js');
const AIVIDEO = read('ai-video.js');
const STORYREEL = read('story-reel.js');
const GENERATOR = read('generator.js');

/* ── A · Censo de callsites del video premium ───────────────────── */
seccion('A · censo: la prueba nunca invoca la generación premium');
{
  eq(count(SERVER, 'generateSignatureClip'), 0, 'A1 server.js (donde viven /api/trial/generate, generate-stream y guest/start) no llama a generateSignatureClip');
  eq(count(SERVER, "require('./ai-video')"), 1, 'A2 server.js importa ai-video UNA sola vez…');
  ok(SERVER.includes("const { listSignatureClips } = require('./ai-video');"), 'A2b …y es listSignatureClips (la biblioteca de vidriera de la cuenta PROPIA), nunca generateSignatureClip');
  eq(count(SERVER, 'seedance'), 0, 'A3 server.js no nombra al proveedor premium');
  eq(count(DEMO, 'seedance'), 0, 'A4 demo.js (el pipeline entero de la prueba) no nombra al proveedor premium');
  eq(count(DEMO, 'generateSignatureClip'), 0, 'A5 demo.js no llama a generateSignatureClip');
  ok(count(STORYREEL, 'generateSignatureClip') >= 1, 'A6 el ÚNICO callsite de producción del video firma vive en story-reel.js (generateWeekExtras, solo flujos del registrado)');
  eq(count(GENERATOR, 'generateSignatureClip'), 0, 'A7 generator.js tampoco lo llama: el censo de callsites es exhaustivo en los módulos de semana');
  // La puerta fail-closed de la regla 1, en el punto único de fal:
  const iGuard = AIVIDEO.indexOf('el video premium NO se genera en la prueba');
  const iReuso = AIVIDEO.indexOf('FROM ai_signature_clips WHERE user_id = ? AND week_key = ?');
  ok(iGuard > 0, 'A8 ai-video.js trae la puerta de la prueba (regla de costo 13/11)');
  ok(iGuard > 0 && iReuso > iGuard, 'A9 la puerta corre ANTES de la idempotencia (la lectura de ai_signature_clips): un invitado no genera NI reusa un clip ya pago');
  ok(AIVIDEO.indexOf('SELECT is_guest FROM users WHERE id = ?') > 0, 'A10 la puerta se keya en is_guest (la identidad de la prueba), no en el plan');
  const iSkip = STORYREEL.indexOf('video firma premium omitido por regla de costo');
  ok(iSkip > 0 && iSkip < STORYREEL.indexOf('generateSignatureClip('), 'A11 story-reel.js saltea el intento para invitados ANTES de llamar a generateSignatureClip (registro en el callsite)');
}

/* ── B · El predicado de la excepción ───────────────────────────── */
seccion('B · trialVideoAperturaInfo: la excepción angosta, codificada');
const demo = require(path.join(ROOT, 'demo.js'));
{
  eq(typeof demo.trialVideoAperturaInfo, 'function', 'B1 demo.js exporta el predicado único de apertura');
  if (typeof demo.trialVideoAperturaInfo === 'function') {
    const casiTodo = { dominante: 'reel', conteos: { reel: 4, foto: 1, carrusel: 0 }, total: 5 };
    // POSITIVO: feed casi todo video + video real del producto → la
    // excepción habilita que un video abra la semana.
    const pos = demo.trialVideoAperturaInfo({ ...casiTodo, realVideo: { path: '/real.mp4' } });
    eq(pos.feed_casi_todo_video, true, 'B2 positivo: dominante reel con 4/5 (≥ 2/3) es «casi todo video»');
    eq(pos.excepcion, true, 'B3 positivo: con video REAL del producto, la excepción se habilita');
    // NEGATIVO 1: el mismo feed, SIN video real (el caso de TODA
    // prueba hoy: el único «video» disponible es el tour generado).
    const neg1 = demo.trialVideoAperturaInfo({ ...casiTodo, realVideo: null });
    eq(neg1.feed_casi_todo_video, true, 'B4 negativo: el feed sigue siendo casi todo video…');
    eq(neg1.excepcion, false, 'B5 negativo: …pero sin video real NO hay excepción (jamás abre un reel generado)');
    // NEGATIVO 2: video real pero el feed no es casi todo video.
    const neg2 = demo.trialVideoAperturaInfo({ dominante: 'reel', conteos: { reel: 2, foto: 2, carrusel: 0 }, total: 4, realVideo: { path: '/real.mp4' } });
    eq(neg2.feed_casi_todo_video, false, 'B6 negativo: dominante reel con 2/4 (< 2/3) no es «casi todo video»');
    eq(neg2.excepcion, false, 'B7 negativo: sin feed casi todo video no hay excepción aunque haya video real');
    // NEGATIVO 3: feed de fotos con video real suelto.
    const neg3 = demo.trialVideoAperturaInfo({ dominante: 'foto', conteos: { foto: 5, reel: 0, carrusel: 0 }, total: 5, realVideo: { path: '/real.mp4' } });
    eq(neg3.excepcion, false, 'B8 negativo: un feed de fotos abre con imagen aunque exista un video real');
    // NEGATIVO 4: sin datos del feed.
    const neg4 = demo.trialVideoAperturaInfo({ dominante: null, conteos: null, total: 0, realVideo: { path: '/real.mp4' } });
    eq(neg4.excepcion, false, 'B9 negativo: sin señal del feed, la apertura es imagen (fail-closed a la regla)');
  }
}

/* ── C · El spec de la prueba registra la apertura ──────────────── */
seccion('C · buildDemoSpec: video_apertura auditable, video en slot interior');
{
  const specReel = demo.buildDemoSpec({
    business: 'Blind Barber Test', category: 'profesionales', country: 'US', tone: '',
    goal: '', count: 5, lang: 'en', trialNoStock: true,
    digest: { hash: 'suite', formatos: { dominante: 'reel', conteos: { reel: 4, foto: 1, carrusel: 0 }, total: 5 } },
  });
  eq(specReel.specPosts.length, 5, 'C1 el spec de prueba trae 5 piezas');
  ok(specReel.video_apertura && typeof specReel.video_apertura === 'object', 'C2 el spec de la PRUEBA trae el registro video_apertura');
  if (specReel.video_apertura) {
    eq(specReel.video_apertura.feed_casi_todo_video, true, 'C3 el registro ve el feed casi todo video del fixture');
    eq(specReel.video_apertura.excepcion, false, 'C4 el registro declara excepcion=false: la prueba no tiene video real del producto (el tour no cuenta)');
  }
  eq(specReel.videoIdx, 2, 'C5 el video (tour local) vive en su slot INTERIOR (índice 2), no abriendo');
  const specFoto = demo.buildDemoSpec({
    business: 'Blind Barber Test', category: 'profesionales', country: 'US', tone: '',
    goal: '', count: 5, lang: 'en', trialNoStock: true,
    digest: { hash: 'suite', formatos: { dominante: 'foto', conteos: { foto: 5, reel: 0, carrusel: 0 }, total: 5 } },
  });
  ok(specFoto.video_apertura && specFoto.video_apertura.feed_casi_todo_video === false, 'C6 con feed de fotos el registro dice feed_casi_todo_video=false');
  const specSinTrial = demo.buildDemoSpec({
    business: 'Blind Barber Test', category: 'profesionales', country: 'US', tone: '',
    goal: '', count: 5, lang: 'en', trialNoStock: false,
    digest: { hash: 'suite', formatos: { dominante: 'reel', conteos: { reel: 4, foto: 1, carrusel: 0 }, total: 5 } },
  });
  eq(specSinTrial.video_apertura, null, 'C7 fuera de la prueba no hay registro de apertura (el pipeline del registrado no se toca)');
}

/* ── D · La puerta de costo con db falsa ────────────────────────── */
seccion('D · generateSignatureClip: el invitado no genera ni reusa');
const aiVideo = require(path.join(ROOT, 'ai-video.js'));
async function seccionD() {
  delete process.env.POSTY_AI_VIDEO;
  delete process.env.FAL_KEY;
  const pieza = { topic: { media: 'foto' }, designPath: null };
  const baseArgs = { weekKey: '2026-W46', brandName: 'Suite', category: 'belleza', piezas: [pieza], logoFile: null, mediaDir: os.tmpdir() };
  // D1: cuenta invitada → null SIN tocar fal ni la tabla de jobs (la
  // db falsa solo sabe responder la consulta de la puerta; cualquier
  // otro prepare/get explotaría el conteo de consultas).
  let consultas = 0;
  const dbGuest = { prepare: (sql) => { consultas++; if (!/is_guest/.test(sql)) throw new Error('consulta inesperada tras la puerta: ' + sql); return { get: () => ({ is_guest: 1 }), all: () => [], run: () => ({}) }; } };
  const r1 = await aiVideo.generateSignatureClip({ ...baseArgs, db: dbGuest, uid: 4242 });
  eq(r1, null, 'D1 invitado (is_guest=1) → null: el video premium no se genera en la prueba');
  eq(consultas, 1, 'D2 la puerta corta en la PRIMERA consulta: ni idempotencia, ni job, ni fal');
  // D3: db sin la columna is_guest (fixtures mínimos) → la puerta no
  // bloquea ni rompe: la función sigue su camino histórico y, sin la
  // habilitación por env, devuelve null como siempre.
  const dbSinColumna = { prepare: (sql) => { if (/is_guest/.test(sql)) throw new Error('no such column: is_guest'); return { get: () => undefined, all: () => [], run: () => ({ changes: 1 }) }; } };
  let r3 = 'sin-resultado', err3 = null;
  try { r3 = await aiVideo.generateSignatureClip({ ...baseArgs, db: dbSinColumna, uid: 12 }); } catch (e) { err3 = e; }
  eq(err3, null, 'D3 sin columna is_guest la función no explota');
  eq(r3, null, 'D4 sin columna y sin habilitación env → null (comportamiento histórico intacto)');
  // D5: cuenta registrada (is_guest=0) sin habilitación env → null,
  // idéntico a la base: el registrado no cambia en nada.
  const dbReg = { prepare: (sql) => ({ get: () => (/is_guest/.test(sql) ? { is_guest: 0 } : undefined), all: () => [], run: () => ({ changes: 1 }) }) };
  const r5 = await aiVideo.generateSignatureClip({ ...baseArgs, db: dbReg, uid: 12 });
  eq(r5, null, 'D5 registrado sin POSTY_AI_VIDEO → null como siempre (pipeline del registrado intacto)');
}

/* ── E · La importación end-to-end: la semana abre con imagen ───── */
seccion('E · boot + guest/start: el primer posteo creado y programado es IMAGEN');
async function seccionE() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const { DatabaseSync } = require('node:sqlite');
  const port = 35400 + Math.floor(Math.random() * 400);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-prueba-imagen-'));
  const TEST_KEY = 'suite-prueba-imagen';
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '', TRIAL_TEST_KEY: TEST_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    const t0 = Date.now();
    let version = null;
    while (Date.now() - t0 < 90000) {
      try { const r = await fetch('http://127.0.0.1:' + port + '/api/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    ok(!!version && !!version.build, 'E1 el servidor botea y /api/version responde', version || out.slice(-300));
    if (!version) return;
    // Semana cacheada como la de Blind Barber: la PRIMERA pieza con
    // medio del payload es el VIDEO (las imágenes del spec estaban
    // en la cadena de rescate y no llegaron al payload).
    const engineV = Number((DEMO.match(/const DEMO_ENGINE_V = (\d+)/) || [])[1] || 0);
    const b64 = (bytes) => Buffer.from(bytes).toString('base64');
    const img = 'data:image/png;base64,' + b64([137, 80, 78, 71, 1, 2, 3, 4]);
    const vid = 'data:video/mp4;base64,' + b64([0, 0, 0, 24, 102, 116, 121, 112]);
    const payload = {
      engine: engineV,
      business: 'Suite Barber',
      posts: [
        { type: 'video', video: vid, caption: 'El tour de la semana', hashtags: ['#barber'] },
        { type: 'image', image: img, caption: 'El corte insignia', hashtags: ['#barber'] },
        { type: 'image', image: img, caption: 'La barra', hashtags: ['#barber'] },
      ],
      digest: { hash: 'suitehash', formatos: { dominante: 'foto', conteos: { foto: 4, reel: 1, carrusel: 0 }, total: 5 } },
    };
    const dbf = new DatabaseSync(path.join(dataDir, 'posta.db'));
    dbf.exec('PRAGMA busy_timeout = 10000');
    dbf.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('suitebarber', JSON.stringify(payload), Date.now());
    dbf.close();
    const resp = await fetch('http://127.0.0.1:' + port + '/api/guest/start?test_key=' + TEST_KEY, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ig: 'suitebarber', device: 'suite-prueba-imagen', lang: 'en', tz: 'America/New_York' }),
    });
    const gj = await resp.json().catch(() => ({}));
    ok(resp.status === 200 && gj && gj.ok === true && !!gj.user_id, 'E2 guest/start importa la semana cacheada', JSON.stringify(gj).slice(0, 200));
    if (!gj || !gj.user_id) return;
    const dbf2 = new DatabaseSync(path.join(dataDir, 'posta.db'));
    dbf2.exec('PRAGMA busy_timeout = 10000');
    const rows = dbf2.prepare('SELECT media_type, status, scheduled_at, created_at FROM posts WHERE user_id = ? ORDER BY id ASC').all(gj.user_id);
    dbf2.close();
    eq(rows.length, 3, 'E3 se importaron los 3 posteos de la semana');
    if (rows.length === 3) {
      eq(rows[0].media_type, 'image', 'E4 el PRIMER posteo CREADO es IMAGEN (en la base v1026 es el video: el síntoma de Blind Barber)');
      eq(rows[2].media_type, 'video', 'E5 el video vive en su slot INTERIOR: es el último creado de la semana importada');
      // La agenda consume EXACTAMENTE este orden: scheduleAllDrafts
      // trae los borradores ORDER BY created_at ASC y
      // scheduleDraftsPerWeek asigna los días en ese orden — el
      // primer creado ES el primer día de la semana.
      ok(SERVER.includes("ORDER BY created_at ASC`)"), 'E6a pin: el embudo de agenda ordena por created_at ASC');
      const cre = rows.map((r) => String(r.created_at));
      ok(cre[0] <= cre[1] && cre[1] <= cre[2], 'E6b el orden de creación importado es imagen · imagen · video: el primer día de la semana es la imagen');
      // Si el gate de calidad dejó programar algo (con medios reales
      // lo hace; los bytes sintéticos de esta suite los retiene como
      // borrador, que es su comportamiento correcto), el primero
      // programado también es la imagen.
      const porAgenda = rows.filter((r) => r.scheduled_at).slice().sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
      if (porAgenda.length) {
        eq(porAgenda[0].media_type, 'image', 'E7 con posteos programados, el primer día programado es la imagen');
      } else {
        console.log('  (E7 informativo: el gate de calidad retuvo los medios sintéticos de la suite — sin programados que ordenar)');
        pass++;
      }
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await seccionD();
  await seccionE();
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE PRUEBA-SIN-VIDEO-CARO + PRIMER-POSTEO-IMAGEN: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
