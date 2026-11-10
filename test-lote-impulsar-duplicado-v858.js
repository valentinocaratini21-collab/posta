// test-lote-impulsar-duplicado-v858.js — LOTE v858 IMPULSAR DUPLICADO EN HOY:
// EL MISMO POSTEO, DOS BOTONES.
// Bug (captura de Valentino 9/11 21:41, causa verificada por bamboo en el
// bundle vivo app.js?v=581): el posteo 583 (publicado hoy 19:00) muestra
// «Impulsar» dos veces en Hoy: una en la tarjeta del detalle de la tira
// (pzHoyTiraDetalleHTML) y otra en la sección «Impulsar posteo»
// (pzHoyImpulsarHTML, el recomendado de la semana). Es el mismo posteo,
// mismo destino (la hoja de impulso).
// Causa: pzHoyTiraDetalleHTML rinde el botón Impulsar para todo posteo
// publicado; pzHoyImpulsarHTML rinde el recomendado de la semana
// (PZ_HOY_MEJOR, de /api/estrategia/mejor-posteo). Hoy lunes el 583 es el
// único posteo con datos reales (2 de alcance, 1 me gusta), así que es a
// la vez el posteo de hoy y el mejor de la semana — y el botón sale dos
// veces.
// Fix (mismo principio que HOY-SIN-DUPLICADO: un posteo, un lugar, una
// hora): en el detalle de la tira, NO rendir el botón Impulsar cuando el
// posteo es el recomendado de la sección (mismo post_id que PZ_HOY_MEJOR
// Y la sección rinde su botón — datos reales, la misma condición `ok` de
// pzHoyImpulsarHTML). La sección queda como la única entrada para
// impulsar ese posteo. Si el recomendado es otro posteo distinto, el
// botón de la tarjeta queda (impulsan posteos distintos, no hay
// duplicado). Sin recomendado (PZ_HOY_MEJOR null) o sin datos reales, la
// sección no muestra botón y el detalle conserva el suyo: el posteo
// nunca pierde su única entrada.
// Valores: BUILD 20261105-v858 · ?v=586 en el index ES (app.js tocado) ·
// styles?v=20261225 heredado · CHUNK_V sin cambio (el fix está en app.js
// mismo, no en un chunk lazy) · M78: funciones auditadas 7/7 (todo lo
// que el camino de render+bind de Impulsar en Hoy llama existe definido
// en el bundle).
// Parte A: estática. Parte B: pzHoyTiraDetalleHTML + pzHoyImpulsarHTML
// REALES en vm (recomendado = posteo de hoy / recomendado distinto / sin
// recomendado / recomendado sin datos / no publicado / EN / early return
// HOY-SIN-DUPLICADO intacto). Parte C: boot real.
// Uso: node test-lote-impulsar-duplicado-v858.js — sale 0 si todo pasa.
// Re-pin al re-basar sobre v857 (re-estampador v858, precedente v854/v856/v857):
// A7 pasaba de 30557 líneas (30546 base v851 + 11) a 30561 (30550 vivo v857 + 11);
// el vivo trae 4 líneas más por la guarda IS_NATIVE de v853 (+3) y el fix M180 de v857 (+1). El fix no cambia esto.
// Puerto: 34634 (34632/34633 fueron los boots de v853/v854; 34586/34578
// las suites de v854; ads-pantalla usa 18754 fijo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEnSrc = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const crypto = require('crypto');
const appMd5 = crypto.createHash('md5').update(appSrc).digest('hex');

function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: valores del lote y alcance —');
  check('A0 BUILD v858 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v858';"));
  check('A0b cero v851 en server.js', !srvSrc.includes('20261105-v851'));
  check('A1 index ES en ?v=586', idxSrc.includes('app.js?v=586') && !idxSrc.includes('app.js?v=581'));
  check('A1b styles?v=20261225 heredado en ES', idxSrc.includes('styles.css?v=20261225'));
  check('A1c index EN sin cambio (styles?v=20261225, sin app.js?v=)', idxEnSrc.includes('styles.css?v=20261225') && !idxEnSrc.includes('app.js?v='));
  check('A2 CHUNK_V sin cambio (el fix está en app.js, no en un chunk)', appSrc.includes("const CHUNK_V = '20261105-v850';"));
  const fn = fnFrom(appSrc, 'function pzHoyTiraDetalleHTML(d, o) {');
  check('A3 pzHoyTiraDetalleHTML existe', !!fn);
  check('A3b el detalle compara contra PZ_HOY_MEJOR.post_id (v858)',
    !!fn && fn.includes('PZ_HOY_MEJOR.post_id') && fn.includes('String(PZ_HOY_MEJOR.post_id) === String(p.id)'));
  check('A3c la condición espeja el `ok` de la sección (likes+comments+saved > 0)',
    !!fn && fn.includes('Number(PZ_HOY_MEJOR.likes || 0) + Number(PZ_HOY_MEJOR.comments || 0) + Number(PZ_HOY_MEJOR.saved || 0)) > 0'));
  check('A3d el comentario v858 explica el porqué',
    !!fn && fn.includes('v858') && fn.includes('un posteo, un lugar'));
  check('A3e el botón del detalle sigue intacto (data-pz-boost-post + texto)',
    !!fn && fn.includes('data-pz-boost-post') && fn.includes('Impulsar'));
  check('A4 la sección Impulsar sigue intacta (su botón + «Elegir otro posteo»)',
    appSrc.includes('pzHoyImpulsarRec()') && appSrc.includes('Elegir otro posteo')
    && appSrc.includes('Impulsar este posteo →'));
  check('A5 el early return HOY-SIN-DUPLICADO sigue intacto (tarjeta principal)',
    !!fn && fn.includes('PZ_HOY_POST_ID') && fn.includes("String(d.post.id) === String(PZ_HOY_POST_ID)"));
  const defs = (appSrc.match(/^function [A-Za-z0-9_$]+\s*\(/gm) || []).length;
  check('A6 1005 definiciones function (igual que la base v851: nada borrado ni agregado)', defs === 1005, `defs=${defs}`);
  check('A7 app.js tiene 30561 líneas (base 30550 vivo v857 + 11 del comentario y la condición)', appSrc.split('\n').length === 30562, `líneas=${appSrc.split('\n').length}`);
  // M78 — las 7 funciones del camino de render+bind de Impulsar en Hoy.
  const audit = ['pzHoyTiraDetalleHTML', 'pzHoyTiraHTML', 'pzHoyTiraBindDetalle', 'pzHoyImpulsarHTML', 'pzHoyImpulsarRec', 'pzBoostOpen', 'pzBoostOpenById'];
  let audOk = 0;
  for (const n of audit) {
    if (new RegExp('function ' + n + '\\s*\\(').test(appSrc)) audOk++;
    else check('A8 M78: ' + n + ' existe definida en el bundle', false, n);
  }
  check(`A8 M78: funciones auditadas: ${audOk}/${audit.length}`, audOk === audit.length, `${audOk}/${audit.length}`);
}

// ---------- Parte B: funciones REALES en vm ----------
function runHoy(opts) {
  // opts: { mejor, post, en, hoyPostId } — mejor = PZ_HOY_MEJOR (null = sin recomendado).
  const escLine = (appSrc.match(/^const esc = .*;$/m) || [null])[0];
  const sandbox = {
    console,
    PZ_HOY_MEJOR: opts.mejor === undefined ? null : opts.mejor,
    PZ_HOY_POST_ID: opts.hoyPostId === undefined ? '999' : opts.hoyPostId,
    pzHoyCuandoCorto: () => 'Hoy · 19:00',
    pzHoyPillSalida: () => 'Sale hoy 19:00',
    pzHoyCuentaSaleTxt: () => '',
    pzBoostRecTexto: () => 'Alcance 2 · 1 me gusta',
    mv: (p) => p,
    __imgFb: () => {},
  };
  vm.createContext(sandbox);
  const code = [
    escLine,
    fnFrom(appSrc, 'function pzHoyTiraDetalleHTML(d, o) {'),
    fnFrom(appSrc, 'function pzHoyImpulsarHTML(mejor, en) {'),
    '({ detalle: pzHoyTiraDetalleHTML({ esHoy: true, idx: 0, revelado: true, post: POST }, { en: EN }), seccion: pzHoyImpulsarHTML(MEJOR, EN) });',
  ].join('\n');
  sandbox.POST = opts.post;
  sandbox.MEJOR = opts.mejor === undefined ? null : opts.mejor;
  sandbox.EN = !!opts.en;
  return vm.runInContext(code, sandbox);
}

const POST_583 = { id: 583, status: 'published', caption: '¿Cuántas veces te pasó de no tener idea qué postear para tu gimnasio?', image_path: '/media/post-583.jpg', scheduled_at: null, approval: 'approved' };
const MEJOR_583 = { post_id: 583, caption: '¿Cuántas veces te pasó…', image_path: '/media/post-583.jpg', reach: 2, likes: 1, comments: 0, saved: 0 };
const MEJOR_570 = { post_id: 570, caption: 'El mejor de la semana', image_path: '/media/post-570.jpg', reach: 40, likes: 5, comments: 2, saved: 1 };
const MEJOR_583_SIN_DATOS = { post_id: 583, caption: '¿Cuántas veces te pasó…', image_path: '/media/post-583.jpg', reach: 0, likes: 0, comments: 0, saved: 0 };

function parteB() {
  console.log('— B) vm: el detalle y la sección, posteo recomendado vs otro —');
  // B1: el caso de Valentino — el posteo de hoy (583) ES el recomendado con datos.
  const b1 = runHoy({ mejor: MEJOR_583, post: POST_583 });
  check('B1 recomendado = posteo de hoy: el detalle NO rinde el botón Impulsar', !b1.detalle.includes('data-pz-boost-post'), b1.detalle.slice(0, 200));
  check('B1b recomendado = posteo de hoy: la sección SÍ rinde su botón', b1.seccion.includes('pzHoyImpulsarRec()') && b1.seccion.includes('Impulsar este posteo →'), b1.seccion.slice(0, 200));
  check('B1c una sola entrada para impulsar el 583 (detalle 0 + sección 1)', (b1.detalle.match(/data-pz-boost-post/g) || []).length === 0 && (b1.seccion.match(/pzHoyImpulsarRec\(\)/g) || []).length === 1);
  check('B1d el detalle sigue mostrando la tarjeta (foto + caption + Publicado)', b1.detalle.includes('/media/post-583.jpg') && b1.detalle.includes('Publicado'), b1.detalle.slice(0, 200));
  // B2: el recomendado es OTRO posteo distinto → el detalle conserva su botón.
  const b2 = runHoy({ mejor: MEJOR_570, post: POST_583 });
  check('B2 recomendado distinto: el detalle SÍ rinde su botón Impulsar', b2.detalle.includes('data-pz-boost-post="583"'), b2.detalle.slice(0, 200));
  check('B2b recomendado distinto: la sección rinde su botón para el 570', b2.seccion.includes('pzHoyImpulsarRec()') && b2.seccion.includes('El mejor de la semana'), b2.seccion.slice(0, 200));
  check('B2c dos posteos distintos, dos entradas (no hay duplicado)', (b2.detalle.match(/data-pz-boost-post/g) || []).length === 1 && (b2.seccion.match(/pzHoyImpulsarRec\(\)/g) || []).length === 1);
  // B3: sin recomendado (PZ_HOY_MEJOR null) → el detalle conserva su botón, la sección dice la verdad.
  const b3 = runHoy({ mejor: null, post: POST_583 });
  check('B3 sin recomendado: el detalle SÍ rinde su botón', b3.detalle.includes('data-pz-boost-post="583"'));
  check('B3b sin recomendado: la sección muestra el estado vacío (sin botón) + «Elegir otro posteo»', !b3.seccion.includes('pzHoyImpulsarRec()') && b3.seccion.includes('Todavía no hay un posteo con resultados reales') && b3.seccion.includes('Elegir otro posteo'), b3.seccion.slice(0, 200));
  // B4: recomendado sin datos reales → la sección no muestra botón y el detalle conserva el suyo.
  const b4 = runHoy({ mejor: MEJOR_583_SIN_DATOS, post: POST_583 });
  check('B4 recomendado sin datos: la sección NO muestra botón (estado vacío)', !b4.seccion.includes('pzHoyImpulsarRec()') && b4.seccion.includes('Todavía no hay un posteo con resultados reales'));
  check('B4b recomendado sin datos: el detalle CONSERVA su botón (el posteo nunca pierde su única entrada)', b4.detalle.includes('data-pz-boost-post="583"'), b4.detalle.slice(0, 200));
  // B5: posteo no publicado → sin botón en el detalle, como antes.
  const b5 = runHoy({ mejor: MEJOR_583, post: { id: 582, status: 'scheduled', caption: 'Mañana', image_path: '/media/post-582.jpg', scheduled_at: '2026-11-10T14:00:00Z', approval: 'pending' } });
  check('B5 posteo programado: el detalle NO rinde Impulsar (como antes)', !b5.detalle.includes('data-pz-boost-post'));
  // B6: EN — mismo comportamiento, texto «Boost».
  const b6 = runHoy({ mejor: MEJOR_583, post: POST_583, en: true });
  check('B6 EN recomendado = posteo de hoy: el detalle NO rinde el botón', !b6.detalle.includes('data-pz-boost-post'));
  check('B6b EN recomendado = posteo de hoy: la sección SÍ rinde «Boost this post →»', b6.seccion.includes('Boost this post →'));
  const b6c = runHoy({ mejor: MEJOR_570, post: POST_583, en: true });
  check('B6c EN recomendado distinto: el detalle SÍ rinde «Boost»', b6c.detalle.includes('data-pz-boost-post="583"') && b6c.detalle.includes('>Boost<'));
  // B7: el early return HOY-SIN-DUPLICADO sigue intacto (hoy + tarjeta principal → detalle vacío).
  const b7 = runHoy({ mejor: MEJOR_583, post: POST_583, hoyPostId: '583' });
  check('B7 hoy + tarjeta principal: el detalle es vacío (early return intacto)', b7.detalle === '', b7.detalle.slice(0, 120));
  // B8: PZ_HOY_MEJOR indefinido (bundle viejo) → no explota, el detalle conserva su botón.
  let b8 = null, b8err = null;
  try {
    const escLine = (appSrc.match(/^const esc = .*;$/m) || [null])[0];
    const sandbox = { console, PZ_HOY_POST_ID: '999', pzHoyCuandoCorto: () => 'Hoy · 19:00', pzHoyPillSalida: () => '', pzHoyCuentaSaleTxt: () => '', pzBoostRecTexto: () => '', mv: (p) => p, __imgFb: () => {}, POST: POST_583, MEJOR: null, EN: false };
    vm.createContext(sandbox);
    b8 = vm.runInContext([escLine, fnFrom(appSrc, 'function pzHoyTiraDetalleHTML(d, o) {'), 'pzHoyTiraDetalleHTML({ esHoy: true, idx: 0, revelado: true, post: POST }, { en: EN });'].join('\n'), sandbox);
  } catch (e) { b8err = e; }
  check('B8 PZ_HOY_MEJOR indefinido: no explota y el detalle conserva su botón', !b8err && b8 && b8.includes('data-pz-boost-post="583"'), b8err ? String(b8err) : '');
}

// ---------- Parte C: boot real ----------
const PORT = 34634;
const TEST_KEY = 'boot-test-key-impulsar-duplicado';
const ADMIN_TOKEN = 'boot-admin-token-impulsar-duplicado';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'impulsar-dup-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';

async function bootServer() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
    await sleep(1000);
  }
  return { child, up, out: () => out };
}
async function killServer(child) {
  try { child.kill('SIGTERM'); } catch (e) {}
  await sleep(800);
  try { if (child.exitCode === null) child.kill('SIGKILL'); } catch (e) {}
  await sleep(300);
}

async function parteC() {
  console.log('— C) boot real —');
  let b = null;
  try {
    b = await bootServer();
    check('C0 el servidor levanta con el lote', b.up, b.out().slice(-300));
    if (!b.up) return;
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    check('C1 /api/version trae el BUILD v858', ver && ver.build === '20261105-v858', JSON.stringify(ver));
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    check('C2 el index servido trae app.js?v=586', idx.includes('app.js?v=586'));
    check('C2b el index servido trae styles?v=20261225', idx.includes('styles.css?v=20261225'));
    const app = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=586`)).text();
    check('C3 el app.js servido lleva la condición v858 (PZ_HOY_MEJOR.post_id)', app.includes('PZ_HOY_MEJOR.post_id') && app.includes('esRecomendado'));
    check('C3b el app.js servido sigue con el botón del detalle (data-pz-boost-post)', app.includes('data-pz-boost-post'));
    check('C4 cero errores en el log del boot', !/Error|error|Unhandled/i.test(b.out().replace(/api\/version/g, '')), b.out().slice(-300));
  } catch (e) {
    console.log('error de la parte C:', e.message);
    fail++;
  } finally {
    if (b) await killServer(b.child);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  parteB();
  await parteC();
  console.log(`\ntest-lote-impulsar-duplicado-v858: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
