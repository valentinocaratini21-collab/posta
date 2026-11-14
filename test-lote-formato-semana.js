// test-lote-formato-semana.js — LOTE FORMATO-SEMANA-REGISTRADA
// (follow-up declarado del correctivo-5): la semana de las cuentas
// REGISTRADAS también sigue el formato dominante del feed del negocio
// (digest.formatos, siembra del correctivo-5), como ya hacen la prueba
// y el primer posteo.
// Uso: node test-lote-formato-semana.js [árbol]
//   Sin argumento corre contra ./release. Contra la base viva corre en
//   modo CONTROL: no existen los helpers, story-reel ignora el piso de
//   reels y el boot es el de la base — el dominante no manda en la semana.
// RE-PIN DEL PREPARADOR (composición sobre v1058): el builder estampó el
//   provisorio v998 y su control era la base v980; acá los stamps
//   definitivos son BUILD v1059 (release) y v1058 (base viva). Solo se
//   re-pinean la detección de modo y las expectativas de /api/version;
//   ninguna aserción funcional cambió.
// Parte 1 (unitaria, VM): extracción de los helpers de server.js con
//   fixtures de digest en la forma EXACTA que produce el correctivo-5.
// Parte 2 (estática): el cableado en generateWeekDrafts y story-reel.
// Parte 3 (funcional): generateWeekExtras real con DB en memoria: el
//   need de reels refleja el piso de la marca SIN renderizar (el feed
//   no existe en disco → retorno temprano con el need ya computado).
// Parte 4 (boot real, DATA_DIR temporal, sin claves de IA): /api/version.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.argv[2] || path.join(__dirname, 'release'));
const serverSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const storySrc = fs.readFileSync(path.join(TREE, 'story-reel.js'), 'utf8');
const MODE = serverSrc.includes('20261105-v1059') ? 'release' : 'base';
console.log(`Árbol: ${TREE} — modo: ${MODE}`);

// DATA_DIR propio ANTES de requerir módulos del árbol (alguno puede abrir
// la DB al cargarse): un temporal, jamás el árbol.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'fsem-suite-'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }

/* ============ Parte 1 · helpers (extracción VM de server.js) ============ */
console.log('— Parte 1: helpers de decisión (VM) —');
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  let i = src.indexOf('{', start), depth = 0, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return src.slice(start, j);
}
// Fixtures con la forma EXACTA que produce el correctivo-5 (client-digest):
// { dominante, conteos: { carrusel, foto, reel }, total, fuente: 'feed' }.
const DG_CARRUSEL = { formatos: { dominante: 'carrusel', conteos: { carrusel: 6, foto: 0, reel: 0 }, total: 6, fuente: 'feed' } };
const DG_REEL = { formatos: { dominante: 'reel', conteos: { carrusel: 0, foto: 2, reel: 4 }, total: 6, fuente: 'feed' } };
const DG_FOTO = { formatos: { dominante: 'foto', conteos: { carrusel: 0, foto: 6, reel: 0 }, total: 6, fuente: 'feed' } };
const DG_SINDATO = { formatos: { dominante: null, conteos: { carrusel: 3, foto: 3, reel: 0 }, total: 6, fuente: 'feed' } };
const DG_VACIO = {};                 // digest sin el campo (correctivo-5 no aterrizó)
const DG_NULO = { formatos: null };  // bloque nunca calculado

if (MODE === 'release') {
  const sandbox = {};
  vm.createContext(sandbox);
  for (const n of ['formatoDominanteDeDigest', 'aplicarFormatoMarcaSemana', 'minReelsMarcaSemana']) {
    const code = extractFn(serverSrc, n);
    ok(!!code, `helper ${n} extraíble de server.js`);
    if (code) vm.runInContext(code, sandbox);
  }
  const { formatoDominanteDeDigest, aplicarFormatoMarcaSemana, minReelsMarcaSemana } = sandbox;
  ok(formatoDominanteDeDigest(DG_CARRUSEL) === 'carrusel', "(a) digest 6/6 carrusel → dominante 'carrusel'");
  ok(formatoDominanteDeDigest(DG_REEL) === 'reel', "(c) digest reels 4/6 → dominante 'reel'");
  ok(formatoDominanteDeDigest(DG_FOTO) === 'foto', "(b) digest de fotos → dominante 'foto'");
  ok(formatoDominanteDeDigest(DG_SINDATO) === null, '(d) dominante null («sin dato») → null');
  ok(formatoDominanteDeDigest(DG_VACIO) === null, '(d) digest SIN el campo formatos → null (defensivo, semana como hoy)');
  ok(formatoDominanteDeDigest(DG_NULO) === null, '(d) formatos null → null');
  ok(formatoDominanteDeDigest(null) === null && formatoDominanteDeDigest(undefined) === null, '(d) digest ausente → null, sin lanzar');
  ok(formatoDominanteDeDigest({ formatos: { dominante: 'video' } }) === null, '(d) dominante fuera del vocabulario → null');

  // Carrusel: la tanda entera queda elegible y el cupo cubre la ventana.
  const ctx = { picks: [{}, {}, {}, {}, {}], carouselQuota: 2, carouselSet: new Set([0]), carouselReason: { 0: 'estrella' } };
  const ap = aplicarFormatoMarcaSemana('carrusel', ctx);
  ok(ap.aplicado === true && ap.carouselQuota === 5, `(a) dominante carrusel: cupo 2 → ${ap.carouselQuota} (cubre la tanda de 5)`);
  ok(ctx.carouselSet.size === 5 && ap.agregados === 4, `(a) las 5 piezas quedan elegibles (${ap.agregados} agregadas por la marca)`);
  ok(ctx.carouselReason[0] === 'estrella', "(a) la pieza que la estrategia ya eligió conserva su razón ('estrella')");
  ok(ctx.carouselReason[3] === 'formato-marca', "(a) las piezas de la marca llevan razón 'formato-marca' (queda registrada en el posteo)");
  // Foto / reel / sin dato: la elección de carruseles no se toca.
  for (const dom of ['foto', 'reel', null]) {
    const c2 = { picks: [{}, {}], carouselQuota: 2, carouselSet: new Set([1]), carouselReason: { 1: 'oferta' } };
    const r2 = aplicarFormatoMarcaSemana(dom, c2);
    ok(r2.aplicado === false && r2.carouselQuota === 2 && c2.carouselSet.size === 1, `(b) dominante ${dom} → elección de carruseles intacta (como hoy)`);
  }
  // Piso de reels.
  ok(minReelsMarcaSemana('reel', 3) === 3, '(c) dominante reel + ventana 3 → piso de reels 3');
  ok(minReelsMarcaSemana('reel', 0) === 0, '(c) dominante reel sin ventana → piso 0');
  ok(minReelsMarcaSemana('reel', undefined) === 0, '(c) dominante reel sin déficit → piso 0, sin lanzar');
  ok(minReelsMarcaSemana('carrusel', 3) === 0 && minReelsMarcaSemana('foto', 5) === 0 && minReelsMarcaSemana(null, 3) === 0, '(b) sin dominante reel el piso es 0 (extras como hoy)');
} else {
  for (const n of ['formatoDominanteDeDigest', 'aplicarFormatoMarcaSemana', 'minReelsMarcaSemana']) {
    ok(extractFn(serverSrc, n) === null, `CONTROL base: el helper ${n} no existe en la base viva (v1058)`);
  }
}

/* ============ Parte 2 · cableado (estático) ============ */
console.log('— Parte 2: cableado en el planificador y en story-reel —');
if (MODE === 'release') {
  ok(serverSrc.includes('formatoDominanteDeDigest(clientDigest.getDigest(db, uid))'), 'generateWeekDrafts lee el dominante del digest (defensivo, fail-open)');
  ok(serverSrc.includes('aplicarFormatoMarcaSemana(formatoMarcaSemana, { picks, carouselQuota, carouselSet, carouselReason })'), 'la elección de carruseles pasa por el helper de la marca');
  ok(serverSrc.includes('minReels: minReelsMarcaSemana(formatoMarcaSemana, deficit)'), 'los extras reciben el piso de reels de la marca');
  ok(serverSrc.includes("carouselReason[i] === 'formato-marca'"), 'el fallback de una pieza de la marca queda registrado ([formato-marca])');
  ok(storySrc.includes('needsReview, minReels })'), 'generateWeekExtras acepta el piso opcional minReels');
  ok(storySrc.includes('Math.max(Number(plan.reelsPerWeek) || 0, Math.max(0, Number(minReels) || 0))'), 'el need de reels es max(plan, piso): el plan manda si da más');
} else {
  // RE-PIN DEL PREPARADOR: en v980 no existía el tag [formato-marca] en
  // ningún lado; en la base viva el tag YA existe por el correctivo-5
  // (las rutas de la prueba y el primer posteo), así que el control
  // asserta la ausencia de los identificadores PROPIOS de este lote.
  ok(!serverSrc.includes('formatoDominanteDeDigest') && !storySrc.includes('minReels'), 'CONTROL base: sin cableado de ESTE lote en la base viva (v1058)');
}

/* ===== Parte 3 · generateWeekExtras real: el need sigue a la marca ===== */
console.log('— Parte 3: extras (story-reel) con DB en memoria —');
(async () => {
  try {
    const storyReel = require(path.join(TREE, 'story-reel.js'));
    const { getPlan, TRIAL_PLAN } = require(path.join(TREE, 'config/plans.js'));
    const baseReels = Number(getPlan(TRIAL_PLAN).reelsPerWeek) || 0;
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, plan TEXT, plan_status TEXT);
             CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, image_path TEXT, caption TEXT, hashtags TEXT, status TEXT, media_type TEXT, source_topic TEXT, source_angle TEXT, tipo TEXT, strategy_why TEXT, week_key TEXT, needs_review INTEGER);`);
    db.prepare(`INSERT INTO users (id, plan, plan_status) VALUES (1, 'esencial', 'trial')`).run();
    const MEDIA = fs.mkdtempSync(path.join(os.tmpdir(), 'fsem-media-'));
    const feedDrafts = [{ image_path: '/media/no-existe-en-disco.jpg' }]; // no existe → retorno temprano sin renderizar
    const args = { db, uid: 1, weekKey: '2026-11-09', tag: 'suite', mediaDir: MEDIA, feedDrafts, needsReview: false };
    const r0 = await storyReel.generateWeekExtras({ ...args });
    ok(r0 && r0.reason === 'no_feed_images' && r0.need.reels === baseReels, `sin piso: need.reels = el del plan (${baseReels}) — got ${r0 && r0.need.reels}`);
    const r3 = await storyReel.generateWeekExtras({ ...args, minReels: 3 });
    if (MODE === 'release') ok(r3 && r3.need.reels === 3, `(c) con piso de marca reel: need.reels = 3 — got ${r3 && r3.need.reels}`);
    else ok(r3 && r3.need.reels === baseReels, `CONTROL base: el piso se ignora, need.reels = ${baseReels} — got ${r3 && r3.need.reels}`);
    const r1 = await storyReel.generateWeekExtras({ ...args, minReels: 1 });
    ok(r1 && r1.need.reels === Math.max(baseReels, 1), 'un piso menor que el plan no baja el need (manda el plan)');
    const nPosts = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
    ok(Number(nPosts) === 0, 'la decisión se verificó sin crear posteos (sin render)');
    try { db.close(); } catch (e) {}
  } catch (e) {
    ok(false, 'Parte 3 explotó: ' + (e && e.message));
  }

  /* ============ Parte 4 · boot real ============ */
  console.log('— Parte 4: boot —');
  const PORT = 18791;
  const BASE = `http://127.0.0.1:${PORT}`;
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fsem-boot-'));
  const NODE_MODULES_PIN = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
  const envHijo = { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-fsem' };
  if (fs.existsSync(NODE_MODULES_PIN)) envHijo.NODE_PATH = NODE_MODULES_PIN;
  for (const k of Object.keys(envHijo)) if (/OPENAI|ANTHROPIC|FAL_KEY|GEMINI|GOOGLE_API/.test(k)) delete envHijo[k];
  const srv = spawn('node', ['server.js'], { cwd: TREE, env: envHijo, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  srv.stdout.on('data', (d) => { bootLog += d; });
  srv.stderr.on('data', (d) => { bootLog += d; });
  try {
    let ver = null;
    for (let i = 0; i < 70 && !ver; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) ver = await r.json(); } catch (e) {}
      if (!ver) await new Promise((r) => setTimeout(r, 500));
    }
    ok(!!ver, 'el server bootea y responde /api/version');
    if (ver) {
      const b = String(ver.build || '');
      if (MODE === 'release') ok(b.includes('v1059'), `/api/version = ${b} (v1059)`);
      else ok(b.includes('v1058'), `CONTROL base: /api/version = ${b} (v1058)`);
    }
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\n== ${pass} ok · ${fail} fallas ==`);
  process.exit(fail ? 1 : 0);
})();
