'use strict';
/*
 * LOTE VIDEO-SUBIDO-INTACTO — suite propia.
 * Defecto probado el 14/11 (forensis de la grilla, posteo 681):
 * Valentino subió por Subir el video de pastelería YA CORREGIDO
 * (subtítulos en secuencia estricta, verificados por frames) y el
 * flujo lo RE-RENDERIZÓ con buildSingleClipReel histórico: la media
 * del posteo fue un archivo nuevo con las líneas de cada bloque
 * dibujadas a la misma altura y conviviendo en la misma ventana —
 * el defecto exacto que se acababa de corregir a mano.
 *
 * Secciones:
 *  1. Motor real sin llamador (buildSingleClipReel): sin pasar
 *     strictSubtitles, el plan estricto sale igual (chunks
 *     secuenciales por banda, sin solape) y los frames lo prueban:
 *     en cada instante hay UN chunk por banda (tinta de texto
 *     medida en píxeles sobre fondo oscuro).
 *  2. Chunk que ocupa dos líneas: apiladas con su lineH (dos
 *     racimos de tinta separados), no a la misma altura.
 *  3. Sin textos: el render no cambia (sin plan, sin tinta).
 *  4. El ejecutor de rehacer (v1077) queda byte-funcional: su
 *     strictSubtitles:true produce el MISMO plan que el camino
 *     sin opción (la opción quedó aceptada e inerte).
 *  5. buildClientVideoReelPost extraído con stubs (el camino de
 *     /api/subir al posteo): la media del posteo es el archivo del
 *     cliente BYTE A BYTE, buildSingleClipReel jamás se invoca,
 *     la portada se deriva del archivo y la receta lleva
 *     sin_render: 1. CONTROL contra base: la base SÍ re-renderiza
 *     (la media es un reel-single-* nuevo) = el caso 681.
 *  6. Pines estáticos de cableado.
 *  7. Boot smoke: /api/version responde con el BUILD del árbol.
 * Los frames de evidencia quedan en el TMP de la corrida (ruta en
 * el log) para inspección visual.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn, execFile, execFileSync } = require('child_process');

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const reelSrc = fs.readFileSync(path.join(ROOT, 'reel-engine.js'), 'utf8');
const hasBase = fs.existsSync(path.join(BASE, 'server.js'));
const baseServerSrc = hasBase ? fs.readFileSync(path.join(BASE, 'server.js'), 'utf8') : '';
const baseReelSrc = hasBase ? fs.readFileSync(path.join(BASE, 'reel-engine.js'), 'utf8') : '';

let pass = 0, fail = 0;
function ok(cond, name) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }
function eq(a, b, name) { ok(a === b, name + ` (esperado ${JSON.stringify(b)}, vino ${JSON.stringify(a)})`); }
const count = (s, sub) => String(s || '').split(sub).length - 1;
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vsi-'));
const FRAMES = path.join(TMP, 'frames');
fs.mkdirSync(FRAMES, { recursive: true });
function ff(args) { execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: 300000 }); }
function probeDur(abs) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', abs], { encoding: 'utf8' });
  return Number(JSON.parse(out).format.duration) || 0;
}
// Tinta de texto blanco (>180) en una banda del frame: el fixture es
// oscuro uniforme, así que lo único brillante es el glifo del texto
// (la barra de marca vale ~120 en gris y queda fuera del umbral).
function inkAt(file, t, y, h) {
  const raw = path.join(TMP, `ink-${Math.random().toString(36).slice(2, 8)}.raw`);
  ff(['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=1080:${h}:0:${y},format=gray`, '-f', 'rawvideo', raw]);
  const buf = fs.readFileSync(raw);
  let bright = 0;
  const rowInk = new Array(h).fill(0);
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 180) { bright++; rowInk[Math.floor(i / 1080)]++; }
  }
  // Racimos de filas con tinta (≥15 px brillantes), separados por ≥10 filas vacías.
  let clusters = 0, inRun = false, gap = 0;
  for (let r = 0; r < h; r++) {
    if (rowInk[r] >= 15) { if (!inRun) { clusters++; inRun = true; } gap = 0; }
    else if (inRun) { gap++; if (gap >= 10) inRun = false; }
  }
  return { bright, clusters };
}
// Diferencia de píxeles entre dos instantes en una banda: si el texto
// CAMBIÓ (chunk nuevo), miles de píxeles difieren; si el bloque entero
// convive (defecto), los dos instantes son casi idénticos.
function diffInk(file, t1, t2, y, h) {
  const grab = (t) => {
    const raw = path.join(TMP, `diff-${Math.random().toString(36).slice(2, 8)}.raw`);
    ff(['-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=1080:${h}:0:${y},format=gray`, '-f', 'rawvideo', raw]);
    return fs.readFileSync(raw);
  };
  const a = grab(t1), b = grab(t2);
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (Math.abs(a[i] - b[i]) > 60) d++;
  return d;
}
function saveFrame(file, t, tag) {
  const out = path.join(FRAMES, `${tag}.jpg`);
  ff(['-ss', String(t), '-i', file, '-frames:v', '1', '-q:v', '4', out]);
  return out;
}

const HOOK = 'Ese momento en que mirás';
const CTA = 'Escribinos y te contamos más';

(async () => {
  const eng = require(path.join(ROOT, 'reel-engine.js'));
  const engBase = hasBase ? require(path.join(BASE, 'reel-engine.js')) : null;

  // Fixture: video oscuro uniforme 1080×1920, 10 s, con audio propio.
  const MEDIA = path.join(TMP, 'media'); fs.mkdirSync(MEDIA, { recursive: true });
  const src = path.join(TMP, 'fuente.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=0x181828:size=1080x1920:rate=15:duration=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10',
      '-shortest', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src]);

  // ── 1. Plan estricto sin opción + frames ────────────────────────
  console.log('· 1. buildSingleClipReel sin strictSubtitles: plan estricto y un chunk por banda');
  const outFix = await eng.buildSingleClipReel({
    mediaDir: MEDIA, file: src, hook: HOOK, cta: CTA, handle: '@prueba',
    brandHex: '#2793C8', mood: 'chill', musicSeed: 'vsi:1',
  });
  ok(Array.isArray(outFix.textPlan) && outFix.textPlan.length >= 4, 'sin la opción, el render devuelve plan estricto');
  const planDirecto = eng.planEstrictoParaClip({ hook: HOOK, cta: CTA, total: 10, hookEnd: 2.6, closeStart: 8 });
  eq(JSON.stringify(outFix.textPlan), JSON.stringify(planDirecto), 'el plan del render es planEstrictoParaClip');
  const hookChunks = outFix.textPlan.filter(c => c.band === 'top').map(c => c.text);
  const ctaChunks = outFix.textPlan.filter(c => c.band === 'bottom').map(c => c.text);
  eq(JSON.stringify(hookChunks), JSON.stringify(['Ese momento en', 'que mirás']), 'gancho en chunks secuenciales (los del 653)');
  eq(JSON.stringify(ctaChunks), JSON.stringify(['Escribinos y te', 'contamos más']), 'CTA en chunks secuenciales (los del 653)');
  {
    let solape = false;
    const porBanda = {};
    for (const c of outFix.textPlan) (porBanda[c.band] = porBanda[c.band] || []).push(c);
    for (const b of Object.keys(porBanda)) {
      const l = porBanda[b].slice().sort((x, y) => x.start - y.start);
      for (let i = 1; i < l.length; i++) if (l[i].start < l[i - 1].end) solape = true;
    }
    ok(!solape, 'ningún chunk arranca antes de que termine el anterior en su banda');
  }
  // Ventanas del plan (total 10): gancho [0,1.56] y [1.56,2.6]; CTA [8,9.2] y [9.2,10].
  const h1 = inkAt(outFix.file, 0.7, 200, 360);
  const h2 = inkAt(outFix.file, 2.0, 200, 360);
  ok(h1.bright > 500, 'frame 0,7 s: el chunk 1 del gancho está en pantalla', '');
  ok(h2.bright > 300 && h2.bright < h1.bright * 0.85, `frame 2,0 s: SOLO el chunk 2 (tinta ${h2.bright} < ${h1.bright})`);
  const hGap = inkAt(outFix.file, 5.0, 200, 360);
  ok(hGap.bright < 200, 'frame 5,0 s: sin textos en la banda del gancho');
  // La banda del CTA se mide SOLO en la zona del texto (y 760–940):
  // el @ del cierre vive más abajo (y≈992) y está en los dos frames.
  // La prueba de no-convivencia es el CAMBIO: a las 9,4 s (chunk 2,
  // antes del fundido de salida de 9,55) el texto es OTRO, no el
  // chunk 1 todavía presente (comparar tinta total no distingue:
  // «contamos más» tiene glifos más anchos que «Escribinos y te»).
  const c1 = inkAt(outFix.file, 8.6, 760, 180);
  const c2 = inkAt(outFix.file, 9.4, 760, 180);
  const dCta = diffInk(outFix.file, 8.6, 9.4, 760, 180);
  ok(c1.bright > 400, 'frame 8,6 s: el chunk 1 del CTA está en pantalla');
  ok(c2.bright > 250 && dCta > 2500, `frame 9,4 s: SOLO el chunk 2 del CTA (tinta ${c2.bright}, ${dCta} px cambiaron contra 8,6 s)`);
  saveFrame(outFix.file, 0.7, 'release-gancho-chunk1');
  saveFrame(outFix.file, 2.0, 'release-gancho-chunk2');
  saveFrame(outFix.file, 8.6, 'release-cta-chunk1');

  // ── 2. Control contra la base: el histórico pisa las líneas ─────
  if (engBase) {
    console.log('· 2. CONTROL base: sin la opción, la base dibuja el bloque entero conviviendo');
    const outBase = await engBase.buildSingleClipReel({
      mediaDir: MEDIA, file: src, hook: HOOK, cta: CTA, handle: '@prueba',
      brandHex: '#2793C8', mood: 'chill', musicSeed: 'vsi:1',
    });
    eq(outBase.textPlan, null, 'base: sin strictSubtitles no hay plan (render histórico)');
    const b1 = inkAt(outBase.file, 0.7, 200, 360);
    const b2 = inkAt(outBase.file, 2.0, 200, 360);
    ok(b1.bright > 500 && b2.bright > b1.bright * 0.9, `base: la tinta del gancho es la misma a 0,7 y 2,0 s (${b1.bright} ≈ ${b2.bright}) — las dos líneas conviven`);
    saveFrame(outBase.file, 1.5, 'base-gancho-pisado');
  } else ok(false, 'control base disponible');

  // ── 3. Chunk de dos líneas: apiladas, no pisadas ────────────────
  console.log('· 3. Chunk que ocupa dos líneas: apilado con lineH');
  const hookLargo = 'Supercalifragilistico expialidoso siempre';
  const outWrap = await eng.buildSingleClipReel({
    mediaDir: MEDIA, file: src, hook: hookLargo, cta: '', handle: '',
    brandHex: '#2793C8', mood: 'chill', musicSeed: 'vsi:3',
  });
  const wFix = inkAt(outWrap.file, 1.0, 200, 420);
  eq(wFix.clusters, 2, 'release: el chunk de dos líneas forma DOS racimos de tinta separados');
  saveFrame(outWrap.file, 1.0, 'release-chunk-dos-lineas');
  if (engBase) {
    const outWrapBase = await engBase.buildSingleClipReel({
      mediaDir: MEDIA, file: src, hook: hookLargo, cta: '', handle: '',
      brandHex: '#2793C8', mood: 'chill', musicSeed: 'vsi:3', strictSubtitles: true,
    });
    const wBase = inkAt(outWrapBase.file, 1.0, 200, 420);
    eq(wBase.clusters, 1, 'base (con strict de v1077): las dos líneas caen a la misma altura — UN racimo');
    saveFrame(outWrapBase.file, 1.0, 'base-chunk-pisado');
  }

  // ── 4. Sin textos + ejecutor byte-funcional ─────────────────────
  console.log('· 4. Sin textos, y el camino del ejecutor (strictSubtitles) intacto');
  const outSin = await eng.buildSingleClipReel({
    mediaDir: MEDIA, file: src, hook: '', cta: '', handle: '',
    brandHex: '#2793C8', mood: 'chill', musicSeed: 'vsi:4',
  });
  ok(Array.isArray(outSin.textPlan) && outSin.textPlan.length === 0, 'sin textos: plan vacío');
  ok(Math.abs(probeDur(outSin.file) - 10) < 0.6 && outSin.clientAudio === true, 'sin textos: duración y audio del cliente intactos');
  const hSin = inkAt(outSin.file, 1.0, 200, 360);
  ok(hSin.bright < 200, 'sin textos: ninguna tinta en la banda del gancho');
  {
    // El plan que el ejecutor de v1077 obtiene con su opción es el
    // mismo que el camino sin opción: la opción quedó inerte.
    const pCon = eng.planEstrictoParaClip({ hook: HOOK, cta: CTA, total: 10, hookEnd: Math.min(2.6, 10 * 0.3), closeStart: Math.round((10 - 2.0) * 10) / 10 });
    eq(JSON.stringify(pCon), JSON.stringify(outFix.textPlan), 'el plan del ejecutor no cambia con el lote');
    eq(count(reelSrc, 'opts.strictSubtitles ?'), 0, 'pin: la compuerta opts.strictSubtitles desapareció del motor');
    eq(count(reelSrc, '= planEstrictoParaClip({'), 1, 'pin: buildSingleClipReel computa el plan estricto una sola vez, siempre');
  }

  // ── 5. El camino de la subida: byte a byte ──────────────────────
  console.log('· 5. buildClientVideoReelPost: la media es el archivo del cliente');
  const grabFn = (srcText) => {
    const m = srcText.match(/async function buildClientVideoReelPost[\s\S]*?\n\}/);
    return m ? m[0] : null;
  };
  async function correrCamino(srcText, engineReal, mediaDir) {
    const fnSrc = grabFn(srcText);
    if (!fnSrc) return null;
    let inserts = [];
    let engineCalls = 0;
    const spyEngine = Object.create(engineReal);
    spyEngine.buildSingleClipReel = async (opts) => { engineCalls++; return engineReal.buildSingleClipReel(opts); };
    const fakeDb = {
      prepare(sql) {
        if (String(sql).includes('INSERT INTO posts')) {
          return { run: (...a) => { inserts.push(a); return { lastInsertRowid: 4242 }; } };
        }
        return { run: () => ({ lastInsertRowid: 0 }), get: () => undefined, all: () => [] };
      },
    };
    const ctx = {
      console, fs, path, crypto, setTimeout, Promise,
      videoReelLocks: new Set(),
      MEDIA_DIR: mediaDir,
      db: fakeDb,
      costs: { assertAiOk() {} },
      openaiKeyFor: () => 'sk-test',
      albumQualityIssues: () => [],
      getProfile: () => ({ category: 'pasteleria', instagram: 'prueba' }),
      generateContent: async () => ({ caption: 'Caption generado', hashtags: '' }),
      contentInputFor: () => ({}),
      weekPrevCaptions: () => [],
      mondayKeyOf: () => '2026-11-09',
      tzToday: () => '2026-11-14',
      userTz: () => 'America/New_York',
      makeHeadline: () => 'Ese momento en que mirás',
      getSettings: () => ({ brand_colors: '#2793C8' }),
      parseBrandHexes: () => ['#2793C8'],
      trainingWheelsActive: () => false,
      require: (id) => (id === './reel-engine' ? spyEngine : require(id)),
    };
    vm.createContext(ctx);
    const fn = vm.runInContext('(' + fnSrc.replace('async function buildClientVideoReelPost', 'async function f') + ')', ctx);
    const asset = { id: 7, file_path: '/media/subido-cliente.mp4', album_quality: '', thumb_path: '/media/thumb-previa.jpg' };
    const out = await fn(99, asset, 'subir', { caption: 'Caption del cliente', hashtags: '#panaderia', headline: 'Ese momento en que mirás' });
    return { out, inserts, engineCalls };
  }
  {
    // Release
    const mediaR = path.join(TMP, 'media-release'); fs.mkdirSync(mediaR, { recursive: true });
    const cliR = path.join(mediaR, 'subido-cliente.mp4'); fs.copyFileSync(src, cliR);
    const md5Antes = md5(cliR);
    const r = await correrCamino(serverSrc, eng, mediaR);
    ok(!!r && !!r.out && r.out.postId === 4242, 'release: el camino crea el posteo');
    if (r && r.inserts.length) {
      const a = r.inserts[0];
      eq(a[1], '/media/subido-cliente.mp4', 'release: image_path del posteo ES el archivo subido');
      eq(md5(cliR), md5Antes, 'release: el archivo subido quedó byte a byte idéntico');
      eq(r.engineCalls, 0, 'release: buildSingleClipReel jamás se invocó');
      ok(!fs.readdirSync(mediaR).some(f => f.startsWith('reel-single-')), 'release: no nació ningún reel-single-* nuevo');
      ok(typeof a[7] === 'string' && a[7].startsWith('/media/reel-subido-') && fs.existsSync(path.join(mediaR, path.basename(a[7]))), 'release: la portada se derivó del archivo del cliente');
      let receta = null; try { receta = JSON.parse(a[8]); } catch (e) {}
      ok(!!receta && receta.sin_render === 1 && String(receta.file || '').endsWith('subido-cliente.mp4'), 'release: la receta lleva sin_render: 1 y la fuente del cliente');
      ok(Math.abs((r.out.duration || 0) - 10) < 0.6, 'release: la duración reportada es la del archivo');
    } else ok(false, 'release: el INSERT del posteo ocurrió');
    // Base (control 681)
    if (hasBase && engBase) {
      const mediaB = path.join(TMP, 'media-base'); fs.mkdirSync(mediaB, { recursive: true });
      fs.copyFileSync(src, path.join(mediaB, 'subido-cliente.mp4'));
      const rb = await correrCamino(baseServerSrc, engBase, mediaB);
      ok(!!rb && rb.engineCalls === 1, 'base: el camino SÍ invoca buildSingleClipReel (re-renderiza)');
      if (rb && rb.inserts.length) {
        ok(/reel-single-.*\.mp4$/.test(String(rb.inserts[0][1])), 'base: la media del posteo es un reel-single-* NUEVO, no el archivo del cliente — el caso 681');
      } else ok(false, 'base: el INSERT del posteo ocurrió');
    }
  }

  // ── 6. Pines de cableado ────────────────────────────────────────
  console.log('· 6. Pines');
  eq(count(serverSrc, '.buildSingleClipReel({'), 1, 'server: buildSingleClipReel se invoca en UN solo lugar (el ejecutor de rehacer)');
  ok(serverSrc.includes('strictSubtitles: true'), 'server: el ejecutor de rehacer sigue pidiendo su camino (aceptado e inerte)');
  ok(!serverSrc.slice(serverSrc.indexOf('async function buildClientVideoReelPost'), serverSrc.indexOf('async function buildClientVideoReelPost') + 9000).includes('.buildSingleClipReel({'), 'server: buildClientVideoReelPost no invoca el motor de reels');

  // ── 7. Boot smoke ───────────────────────────────────────────────
  console.log('· 7. Boot smoke');
  {
    const port = 35193;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vsi-data-'));
    const buildEsperado = (serverSrc.match(/const BUILD_ID = '([^']+)'/) || [])[1] || '';
    const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' }, stdio: 'ignore' });
    try {
      let version = null;
      for (let i = 0; i < 40 && !version; i++) {
        await new Promise(r => setTimeout(r, 750));
        try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
      }
      ok(!!version, 'boot: /api/version responde');
      if (version) eq(version.build, buildEsperado, 'boot: BUILD_ID del árbol');
    } finally {
      try { child.kill('SIGKILL'); } catch (e) {}
    }
  }

  console.log(`\ntest-lote-video-subido-intacto: ${pass} ✓ · ${fail} ✗`);
  console.log('frames de evidencia en ' + FRAMES);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
