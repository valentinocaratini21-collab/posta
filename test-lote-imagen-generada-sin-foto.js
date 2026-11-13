// test-lote-imagen-generada-sin-foto.js
// LOTE IMAGEN-GENERADA-SIN-FOTO-REAL (v960) — Valentino 12/11 12:25:
// cuando la prueba de un cliente no tiene NINGUNA foto real (0 posteos
// en IG, sin fotos en su web, sin foto de perfil), la imagen del primer
// posteo SE GENERA con el modelo (cadena del demo: Nano → gpt-image,
// sin referencias), en vez de dejar un póster tipográfico sin producto.
// El prompt lleva la marca (nombre, rubro, identidad, paleta) y NUNCA
// un logo (el logo real no se regenera) ni una estrella inventada: la
// estrella viaja solo si está confirmada (digest.producto_estrella, L3).
// El póster sale primero (<30 s, sin timeout falso del watchdog de L6)
// y la imagen generada lo reemplaza por el mismo evento 'post' 0.
// (RE-PIN DEL ATERRIZAJE v1019 · LOTE PRIMER-POSTEO-PERFECTO: el
// diseño v960 de arriba —póster primero y reemplazo— quedó invertido
// por los addendums 3A/4/5/7 de ese lote: retención del evento post,
// rescate sellado con el logo real y armado honesto. Los pins A1, A4,
// A5, A7, A17, A18, A22, A23, A24, A25, C1, C2 y C5 de esta suite se
// re-pinearon 1:1 con la clasificación del STATUS de ese lote; el
// mecanismo (§B/§E: predicado, prompt, gate, generador) no cambió.)
// (RE-PIN DEL ATERRIZAJE v1020 · LOTE ILUSTRADA-BAJO-LA-VARA: ese
// lote toca app.js (pieza 7: «Sale solo» con la conexión como
// entrada) y reestructura la retención y la exención del rescate
// (piezas 5 y 3). Se re-pinean 1:1 con el mapeo de su STATUS: A1/C1/C5
// (BUILD v1020), A4/C2 (stamp app.js?v=698), A8 (md5 de app.js del
// lote), A22 (literal de retención nuevo), A24 (la exención
// incondicional quedó SUPERSEDIDA por la pieza 3), A25 (alcance del
// aterrizaje) y D1a/D1b (el pin A3 de L6 incrusta el md5 real de
// app.js en el texto del fallo: los conjuntos se comparan con los
// md5 normalizados). El mecanismo (§B/§E) no cambió.)
// Se corre desde la raíz del release:
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-imagen-generada-sin-foto.js
// (el NODE_PATH es obligatorio: la §B/§D requieren demo.js, que abre la
// DB con better-sqlite3; la §B usa DATA_DIR temporal y nunca crea
// release/data/ — si aparece, la §C lo marca como fallo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base'); // (aterrizaje v1020: la base es el árbol v1019)
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const SERVER_BASE = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
const DEMO = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const DEMO_BASE = fs.readFileSync(path.join(BASE, 'demo.js'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'));
const APPJS_BASE = fs.readFileSync(path.join(BASE, 'public', 'app.js'));
const STYLES = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'));
const STYLES_BASE = fs.readFileSync(path.join(BASE, 'public', 'styles.css'));
const IDX_ES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const IDX_EN_BASE = fs.readFileSync(path.join(BASE, 'public', 'en', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function md5(b) { return crypto.createHash('md5').update(b).digest('hex'); }

// ── §A · estáticos ──
console.log('\n[A] Estáticos (estampado + alcance)');
eq(count(SERVER, '20261105-v1020'), 1, 'A1 BUILD v1020 x1 solo en server.js (re-estampado del aterrizaje v1020)');
eq(count(SERVER, '20261105-v1014'), 0, 'A2 BUILD v1014 x0 (sin restos del viejo)');
eq(count(SERVER, '20261105-v957'), 0, 'A3 BUILD v957 x0 (el provisional chocado, nunca estampado)');
eq(count(IDX_ES, 'app.js?v=698'), 1, 'A4 index ES app.js?v=698 x1 (re-pin del aterrizaje v1020: la pieza 7 del lote ILUSTRADA-BAJO-LA-VARA toca app.js y bumpea el stamp de v1017)');
eq(count(IDX_ES, 'styles.css?v=20261278'), 1, 'A5 index ES styles 20261278 x1 (re-pin v1019: stamp de v1017, sin cambio propio)');
eq(count(IDX_EN, 'app.js?v='), 0, 'A6 index EN sin app.js?v=');
eq(count(IDX_EN, 'styles.css?v=20261278'), 1, 'A7 index EN styles 20261278 x1 (re-pin v1019)');
eq(md5(APPJS), 'b4a00196367798807c050f18c66abac6', 'A8 (re-pin del aterrizaje v1020) public/app.js = el del lote ILUSTRADA-BAJO-LA-VARA (md5 pineado): difiere de la base SOLO por la pieza 7 de ese lote');
eq(md5(STYLES), md5(STYLES_BASE), 'A9 styles.css byte-idéntico a la base');
eq(md5(IDX_EN), md5(IDX_EN_BASE), 'A10 index EN byte-idéntico a la base');
ok(DEMO.includes('function buildNoPhotoBrandPrompt(') && DEMO.includes('buildNoPhotoBrandPrompt, firstPostNeedsGeneratedImage, generateFirstPostImageIfNeeded,'), 'A11 demo.js exporta las 3 funciones nuevas');
ok(DEMO.includes("ps !== 'ai-generated'"), 'A12 firstPostGate admite photo_source ai-generated');
ok(DEMO.includes('function firstPostNeedsGeneratedImage(spec)') && DEMO.includes('function generateFirstPostImageIfNeeded('), 'A13 helpers definidos en demo.js');
ok(DEMO.includes('genFirstPromise') && DEMO.includes('compositeDemoPiece') && DEMO.includes("specPosts[0].photo_source = 'ai-generated'"), 'A14 generateDemo: generación en paralelo + composite + marca ai-generated');
ok(SERVER.includes('async function generateNoPhotoFirstPostImage(') && SERVER.includes('generateDemoPieceImage({ prompt, refs: [], geminiKey: gKey, genGpt, refNote: null })') && SERVER.includes('qaDemoPiece({ b64: gen.b64') && SERVER.includes('qaRetryDirective(qaRes)'), 'A15 helper del server: cadena Nano→gpt sin refs + QA + 1 reintento');
ok(SERVER.includes("generateImage: (a) => generateNoPhotoFirstPostImage({ prompt: a.prompt, topicText: a.topicText })"), 'A16 clásico /api/trial/generate pasa el generador a generateDemo');
ok(SERVER.includes("step: 'imagen-generada'") && SERVER.includes('const rescueIdxS = new Set()') && SERVER.includes("sp.photo_source === 'brand-poster'") && SERVER.includes('rescuePieceWithSeal') && SERVER.includes('rescueKeepalive') && SERVER.includes('emitArming'), 'A17 stream (re-pin v1019 · ADD-3A/5/7): status imagen-generada + retención rescueIdxS (ganador-póster / slot 0 sin logo) + rescate sellado + keepalive + armado honesto');
eq(count(SERVER, "step: 'imagen-generada'"), 2, 'A18 step imagen-generada x2 (re-pin v1019: inicio + keepalive; el fallo honesto sale como armado vía emitArming)');
ok(!/fal\.ai|FAL_KEY/.test(SERVER) && !/fal\.ai|FAL_KEY/.test(DEMO) && !/fal\.ai|FAL_KEY/.test(fs.readFileSync(path.join(ROOT, 'demo-ai.js'), 'utf8')), 'A19 sin fal.ai en el camino de la prueba (fal solo en ai-video.js)');
eq(count(SERVER, 'trial_used'), count(SERVER_BASE, 'trial_used'), 'A20 trial_used: mismo conteo que la base (el fallback no marca la prueba como usada)');
eq(count(DEMO, 'trial_used'), count(DEMO_BASE, 'trial_used'), 'A21 trial_used en demo.js: mismo conteo que la base');
// (RE-PIN DEL ATERRIZAJE v1019 — mapeo 1:1 con la clasificación del
// STATUS del LOTE PRIMER-POSTEO-PERFECTO: A22/A23/A24 afirmaban el
// comportamiento v960 «el póster sale primero», INVERTIDO por orden
// expresa del addendum 3A (retención): la pieza en rescate NO se
// emite en el render; su evento 'post' llega tras la cadena de
// rescate sellado, o en estado de armado honesto si sigue en fondo.
// Las aserciones de abajo pinean el comportamiento nuevo sobre los
// anclajes reales del fusionado.)
(function () {
  const renderGuard = SERVER.indexOf("if (rescueIdxS.has(i) || (i === 0 && classifyPromise)) return;");
  const rescueBlock = SERVER.indexOf('const rescateSemanaS = []');
  const statusGen = SERVER.indexOf("step: 'imagen-generada'", rescueBlock);
  const sealCall = SERVER.indexOf('rescuePieceWithSeal', rescueBlock);
  ok(renderGuard !== -1 && rescueBlock !== -1 && renderGuard < rescueBlock, 'A22 (re-pin del aterrizaje v1020 · pieza 5 del lote ilustrada) el render RETIENE el post de la pieza en rescate y el del slot 0 con la clasificación en vuelo (guardia+return reestructurada, misma semántica ADD-3A) y su evento sale recién tras la cadena de rescate — el póster NUNCA sale primero');
  ok(statusGen !== -1 && sealCall !== -1 && statusGen < sealCall, 'A23 (re-pin) el status de generación precede a la llamada de rescate sellado (progreso real, no mudo)');
  ok(SERVER.includes('if (!posts[i] || (posts[i].ai && aiPasaVaraI))') && SERVER.includes('slot0LogoAusenteS'), 'A24 (re-pin del aterrizaje v1020 · SUPERSEDIDO por la pieza 3 del lote ilustrada) la cadena saltea SOLO las piezas IA que pasan la vara final (aiPasaVaraI) — la exención incondicional ya no existe — y el disparador suma el slot 0 con logo ausente (slot0LogoAusenteS)');
})();
(function () {
  // Diff = exactamente el alcance del aterrizaje v1020 (LOTE
  // ILUSTRADA-BAJO-LA-VARA + los re-pins de este aterrizaje):
  // difieren los 6 archivos del lote + las 2 suites vecinas
  // re-pineadas (perfecto y esta), y el único archivo nuevo es la
  // suite del lote.
  let out = '';
  try { out = execFileSync('diff', ['-rq', BASE, ROOT], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }); } catch (e) { out = (e.stdout || '').toString(); }
  const lines = out.split('\n').filter(Boolean).filter((l) => !/Only in .*base: data$/.test(l));
  const expected = [
    'Files ' + path.join(BASE, 'client-digest.js') + ' and ' + path.join(ROOT, 'client-digest.js') + ' differ',
    'Files ' + path.join(BASE, 'demo.js') + ' and ' + path.join(ROOT, 'demo.js') + ' differ',
    'Files ' + path.join(BASE, 'server.js') + ' and ' + path.join(ROOT, 'server.js') + ' differ',
    'Files ' + path.join(BASE, 'demo-captions.js') + ' and ' + path.join(ROOT, 'demo-captions.js') + ' differ',
    'Files ' + path.join(BASE, 'public', 'app.js') + ' and ' + path.join(ROOT, 'public', 'app.js') + ' differ',
    'Files ' + path.join(BASE, 'public', 'index.html') + ' and ' + path.join(ROOT, 'public', 'index.html') + ' differ',
    'Files ' + path.join(BASE, 'test-lote-primer-posteo-perfecto.js') + ' and ' + path.join(ROOT, 'test-lote-primer-posteo-perfecto.js') + ' differ',
    'Files ' + path.join(BASE, 'test-lote-imagen-generada-sin-foto.js') + ' and ' + path.join(ROOT, 'test-lote-imagen-generada-sin-foto.js') + ' differ',
    'Only in ' + ROOT + ': test-lote-ilustrada-vara.js',
  ];
  const extra = lines.filter((l) => !expected.includes(l));
  const missing = expected.filter((l) => !lines.includes(l));
  ok(extra.length === 0 && missing.length === 0, 'A25 diff vs base = exactamente el alcance del aterrizaje v1020 (LOTE ILUSTRADA-BAJO-LA-VARA + re-pins) (re-pin v1020)', { extra, missing, lines: lines.slice(0, 6) });
})();

// ── §B · VM del camino nuevo (demo.js real, sin red ni claves) ──
console.log('\n[B] VM (predicado + prompt de marca + gate + generador inyectado)');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'v960-suite-b-'));
let demo;
try {
  demo = require(path.join(ROOT, 'demo.js'));
  ok(true, 'B0 demo.js carga (DATA_DIR temporal)');
} catch (e) {
  ok(false, 'B0 demo.js carga (DATA_DIR temporal)', String(e && e.message || e));
  console.log('\n== RESULTADO ==\nok: ' + pass + ' · mal: ' + fail);
  process.exit(1);
}
ok(demo.firstPostNeedsGeneratedImage({ photos: [null] }) === true, 'B1 sin foto real (photos[0] null) → genera');
ok(demo.firstPostNeedsGeneratedImage({ photos: ['/media/foto.jpg'] }) === false, 'B2 con foto real → NO genera');
ok(demo.firstPostNeedsGeneratedImage({ photos: [null, '/media/foto.jpg'] }) === true, 'B3 slot 0 null (aunque el 1 tenga foto) → genera el primero');
ok(demo.firstPostNeedsGeneratedImage({}) === false && demo.firstPostNeedsGeneratedImage(null) === false && demo.firstPostNeedsGeneratedImage({ photos: [] }) === false, 'B4 spec vacío/sin fotos → no genera (nada que reemplazar)');
(function () {
  const p = demo.buildNoPhotoBrandPrompt({ business: 'Café Aroma', category: 'cafeteria', subcat: 'café de especialidad', paletteHex: ['#1A2B3C', '#E8B04B'], paletteNames: ['azul noche', 'dorado'], description: 'Café de especialidad en Asunción, tueste propio.', star: 'Tesora' });
  ok(p.includes('Café Aroma') && p.includes('cafeteria') && p.includes('Tesora') && p.includes('#1A2B3C') && p.includes('#E8B04B'), 'B5 prompt con estrella validada: marca + rubro + estrella + paleta');
  ok(/no text/i.test(p) && /no logos/i.test(p) && !/logo de|logotipo/i.test(p), 'B6 prompt prohíbe texto y logos (el logo real no se regenera)');
})();
(function () {
  const p = demo.buildNoPhotoBrandPrompt({ business: 'Café Aroma', category: 'cafeteria', paletteHex: ['#1A2B3C'], description: '', star: null });
  ok(!p.includes('Hero product:') && !p.includes('Tesora') && /no specific product name/i.test(p), 'B7 prompt SIN estrella confirmada: escena genérica, ningún modelo inventado');
  const longDesc = 'x'.repeat(500);
  const p2 = demo.buildNoPhotoBrandPrompt({ business: 'B', category: 'cafeteria', description: longDesc, star: null });
  ok(!p2.includes('x'.repeat(201)), 'B8 la descripción se recorta a 200 caracteres');
})();
(function () {
  const g1 = demo.firstPostGate({ headline: 'H', caption: 'C', star: 'Tesora', lang: null, photo_source: 'ai-generated', brand_visible: true });
  ok(g1.pass === true && !g1.failures.includes('foto-tema'), 'B9 gate: ai-generated con marca visible pasa (no es foto de tema)');
  const g2 = demo.firstPostGate({ headline: 'H', caption: 'C', star: 'Tesora', lang: null, photo_source: 'ai-generated', brand_visible: false });
  ok(g2.pass === false && g2.failures.includes('sin-logo'), 'B10 gate: ai-generated sin marca visible falla sin-logo (el QA debe verificar la marca)');
  const g3 = demo.firstPostGate({ headline: 'H', caption: 'C', star: 'Tesora', lang: null, photo_source: 'foto-tema', brand_visible: true });
  ok(g3.pass === false && g3.failures.includes('foto-tema'), 'B11 gate control: fuente no admitida sigue fallando foto-tema');
  const g4 = demo.firstPostGate({ headline: 'H', caption: 'C', star: 'Tesora', lang: null, photo_source: 'real-product', brand_visible: true });
  ok(g4.pass === true, 'B12 gate control: real-product sigue pasando (foto-real-primero intacto)');
})();
(async function () {
  const noPhotoSpec = { photos: [null, null, null, null, null] };
  const realSpec = { photos: ['/media/foto.jpg', null, null, null, null] };
  const baseArgs = { business: 'Café Aroma', category: 'cafeteria', subcat: null, paletteHex: ['#1A2B3C'], paletteNames: null, description: 'Café de especialidad.', star: null, topicText: 'Café de especialidad' };
  let calls = 0;
  const stubOk = async (a) => { calls++; return { b64: 'AAAABBBB', engine: 'gpt' }; };
  let r = await demo.generateFirstPostImageIfNeeded({ spec: noPhotoSpec, ...baseArgs, generateImage: stubOk });
  ok(calls === 1 && r && r.b64 === 'AAAABBBB' && r.engine === 'gpt' && r.prompt.includes('Café Aroma') && r.prompt.includes('cafeteria'), 'B13 sin foto real → llama al modelo 1 vez con prompt de marca');
  calls = 0;
  r = await demo.generateFirstPostImageIfNeeded({ spec: realSpec, ...baseArgs, generateImage: stubOk });
  ok(calls === 0 && r === null, 'B14 con foto real → NO llama al modelo');
  r = await demo.generateFirstPostImageIfNeeded({ spec: noPhotoSpec, ...baseArgs, generateImage: async () => null });
  ok(r === null, 'B15 el modelo devuelve null → null (queda el póster)');
  r = await demo.generateFirstPostImageIfNeeded({ spec: noPhotoSpec, ...baseArgs, generateImage: async () => { throw new Error('red caída'); } });
  ok(r === null, 'B16 el modelo tira error → null, no rompe');
  r = await demo.generateFirstPostImageIfNeeded({ spec: noPhotoSpec, ...baseArgs });
  ok(r === null, 'B17 sin generador inyectado → null');
  const rStar = await demo.generateFirstPostImageIfNeeded({ spec: noPhotoSpec, ...baseArgs, star: 'Tesora', generateImage: stubOk });
  ok(rStar && rStar.prompt.includes('Tesora') && rStar.prompt.includes('Hero product:'), 'B18 con estrella validada → el prompt la nombra como protagonista');
  const rNoStar = await demo.generateFirstPostImageIfNeeded({ spec: noPhotoSpec, ...baseArgs, star: null, generateImage: stubOk });
  ok(rNoStar && !rNoStar.prompt.includes('Hero product:'), 'B19 sin estrella → el prompt no inventa protagonista');
  // B20: buildDemoSpec real sin fotos → slot 0 sin foto + predicado true.
  try {
    const spec = demo.buildDemoSpec({ business: 'Café Aroma', category: 'cafeteria', country: 'AR', tone: 'vos', photoPath: null, goal: '', goal_key: '', accent: '#1A2B3C', btn: '#E8B04B', count: 5, bioText: 'Café de especialidad en Asunción.', profilePicPath: null, feedRegister: null, extraPhotos: [], digest: null, lang: 'es', trialNoStock: true, draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null });
    ok(Array.isArray(spec.photos) && spec.photos[0] == null && demo.firstPostNeedsGeneratedImage(spec) === true, 'B20 buildDemoSpec sin fotos: slot 0 null y el predicado lo detecta');
  } catch (e) {
    ok(false, 'B20 buildDemoSpec sin fotos: slot 0 null y el predicado lo detecta', String(e && e.message || e));
  }
  // ── §E · ENMIENDA DE DISPARADOR (aterrizaje v1015 · auditoría
  // .diag-veja7 + orden de Valentino 13/11): el rescate generado
  // también dispara cuando el GANADOR del slot 0 fue el póster de
  // marca (photo_source 'brand-poster'), haya o no foto de perfil.
  // Fixtures = las dos formas reales de hoy: Veja (foto de perfil +
  // mapa vacío) y Mejuri (foto de perfil + mapa sin intersección) —
  // en ambas el spec termina con el póster como ganador del slot 0.
  console.log('\n[E] Enmienda de disparador (ganador = póster → generada, nunca placa)');
  const posterSpec = { photos: ['/media/logo.jpg', null, null, null, null], specPosts: [{ photo_source: 'brand-poster' }] };
  ok(demo.firstPostNeedsGeneratedImage(posterSpec) === true, 'E1 forma Mejuri/Veja a nivel spec: ganador póster (con foto de perfil) → genera');
  ok(demo.firstPostNeedsGeneratedImage({ photos: ['/media/foto.jpg'], specPosts: [{ photo_source: 'real-product' }] }) === false, 'E2 ganador foto real del producto → NO genera (foto-real-primero intacto)');
  ok(demo.firstPostNeedsGeneratedImage({ photos: ['/media/foto.jpg'], specPosts: [{ photo_source: 'real-product-brand' }] }) === false, 'E3 ganador real-product-brand → NO genera');
  {
    let callsE = 0;
    const rE = await demo.generateFirstPostImageIfNeeded({ spec: posterSpec, ...baseArgs, generateImage: async () => { callsE++; return { b64: 'CCCCDDDD', engine: 'gpt' }; } });
    ok(callsE === 1 && rE && rE.b64 === 'CCCCDDDD', 'E4 ganador póster → el rescate llama al modelo 1 vez y devuelve la generada');
    const rNull = await demo.generateFirstPostImageIfNeeded({ spec: posterSpec, ...baseArgs, generateImage: async () => null });
    ok(rNull === null, 'E5 ganador póster + modelo null → null (el póster queda solo como transitorio, sin romper)');
  }
  try {
    // Forma Veja REAL: buildDemoSpec con foto de perfil y pool vacío
    // (mapa sin candidatas) → el slot 0 lo gana el póster.
    const specV = demo.buildDemoSpec({ business: 'VEJA', category: 'moda', country: 'AR', tone: 'vos', photoPath: null, goal: '', goal_key: '', accent: '#8A6D4B', btn: '#3B2F2F', count: 5, bioText: 'Zapatillas sustentables.', profilePicPath: '/media/veja-logo.jpg', feedRegister: null, extraPhotos: [], digest: null, lang: 'en', trialNoStock: true, draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null });
    ok(specV.photos[0] != null && specV.specPosts[0] && specV.specPosts[0].photo_source === 'brand-poster' && demo.firstPostNeedsGeneratedImage(specV) === true, 'E6 forma Veja real (buildDemoSpec): slot 0 = póster con foto de perfil y el disparador enmendado lo detecta');
  } catch (e) {
    ok(false, 'E6 forma Veja real (buildDemoSpec): slot 0 = póster con foto de perfil y el disparador enmendado lo detecta', String(e && e.message || e));
  }
  await runBootAndRegressions();
})().catch((e) => { console.error('SUITE CRASH §B:', e); process.exit(2); });

// ── §C · boot real (DATA_DIR temporal, puerto 35012) ──
async function runBootAndRegressions() {
  console.log('\n[C] Boot real (DATA_DIR temporal, puerto 35012)');
  const PORT = 35012;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v960-boot-'));
  function req(method, pth, body) {
    return new Promise((resolve) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, path: pth, method, headers: body ? { 'Content-Type': 'application/octet-stream', 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      r.on('error', (e) => resolve({ status: 0, headers: {}, body: String(e && e.message || e) }));
      if (body) r.write(body);
      r.end();
    });
  }
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' }, stdio: 'ignore' });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      const r = await req('GET', '/api/version');
      if (r.status === 200) { try { up = JSON.parse(r.body).build === '20261105-v1020'; } catch (e) { up = false; } }
      if (!up) await new Promise((r2) => setTimeout(r2, 500));
    }
    ok(up, 'C1 /api/version = 20261105-v1020');
    const idx = await req('GET', '/');
    ok(idx.status === 200 && idx.body.includes('app.js?v=698'), 'C2 index servido con app.js?v=698 (re-pin del aterrizaje v1020: bump de la pieza 7 del lote ilustrada)');
    const gs = await req('POST', '/api/trial/generate-stream', 'basura');
    ok(gs.status === 200 && /text\/event-stream/.test(String(gs.headers['content-type'] || '')), 'C3 POST /api/trial/generate-stream con cuerpo inválido → 200 SSE', 'status=' + gs.status + ' ct=' + gs.headers['content-type']);
    ok(gs.body.includes('event: error'), 'C4 el stream inválido emite event: error (falla seguro, no HTML)', gs.body.slice(0, 200));
    const again = await req('GET', '/api/version');
    let alive = false;
    try { alive = again.status === 200 && JSON.parse(again.body).build === '20261105-v1020'; } catch (e) {}
    ok(alive, 'C5 el server sigue vivo tras el stream inválido');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    if (child.exitCode === null) { try { child.kill('SIGKILL'); } catch (e) {} }
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
  ok(child.exitCode !== null || child.signalCode !== null, 'C6 boot matado por PID exacto (proceso terminado, sin huérfanos)');
  const afterKill = await req('GET', '/api/version');
  ok(afterKill.status === 0, 'C7 puerto 35012 libre tras matar (conexión rechazada)');
  ok(!fs.existsSync(path.join(ROOT, 'data')), 'C8 sin release/data/ tras el boot');

  // ── §D · regresiones vecinas (base vs release, con runner propio) ──
  console.log('\n[D] Regresiones vecinas (L6 + v935, base vs release)');
  function runNeighbor(suiteSrc, treeDir) {
    const name = path.basename(suiteSrc);
    const dst = path.join(treeDir, name);
    fs.copyFileSync(suiteSrc, dst);
    let out = '';
    try {
      out = execFileSync('node', [name], { cwd: treeDir, encoding: 'utf8', timeout: 300000, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules' } });
    } catch (e) { out = (e.stdout || '').toString() + '\n' + (e.stderr || '').toString(); }
    try { fs.unlinkSync(dst); } catch (e) {}
    try { fs.rmSync(path.join(treeDir, 'data'), { recursive: true, force: true }); } catch (e) {}
    return out;
  }
  // D1 · L6 (pineada a v945: A1/A2 fallan en ambas; el delta válido es
  // que los fallos de release ⊆ fallos de base, salvo el pin A2 que
  // v960 resuelve — y ningún fallo viejo desaparece sin explicación).
  const l6Src = '/home/hatch/workspace/.lote-l6-progreso-timeout-poleo/release/test-lote-l6-progreso-timeout-poleo.js';
  const l6BaseOut = runNeighbor(l6Src, BASE);
  const l6RelOut = runNeighbor(l6Src, ROOT);
  function parseL6(out) {
    const m = out.match(/== L6: (\d+) ok, (\d+) fail ==/);
    const fails = [];
    const idx = out.indexOf('Fallos:');
    if (idx !== -1) {
      // (Re-pin del aterrizaje v1020 · mapeo D1a/D1b del STATUS del
      // lote ilustrada: el pin A3 de L6 incrusta el md5 REAL de
      // app.js en el texto de su fallo; cuando un lote toca app.js
      // —pieza 7 del ilustrada— ese texto difiere entre la base y el
      // release sin que el fallo cambie. Los conjuntos se comparan
      // con los md5 normalizados a '<md5>'.)
      out.slice(idx).split('\n').forEach((l) => { const mm = l.match(/^\s*- (.+)$/); if (mm) fails.push(mm[1].trim().replace(/[0-9a-f]{32}/g, '<md5>')); });
    }
    return { ok: m ? +m[1] : -1, fail: m ? +m[2] : -1, fails };
  }
  const l6b = parseL6(l6BaseOut);
  const l6r = parseL6(l6RelOut);
  console.log('  (L6 base: ' + l6b.ok + ' ok, ' + l6b.fail + ' fail · release: ' + l6r.ok + ' ok, ' + l6r.fail + ' fail)');
  ok(l6r.fails.every((f) => l6b.fails.includes(f)), 'D1a L6: ningún fallo NUEVO en release', { nuevos: l6r.fails.filter((f) => !l6b.fails.includes(f)) });
  ok(l6b.fails.filter((f) => !/^A2 /.test(f)).every((f) => l6r.fails.includes(f)), 'D1b L6: ningún fallo viejo desaparece salvo el pin A2 (v942 x0)', { desaparecidos: l6b.fails.filter((f) => !/^A2 /.test(f) && !l6r.fails.includes(f)) });
  // (Re-pin del aterrizaje v1015: sobre la base v942 el delta era el
  // pin A2 que v960 resolvía (+1/-1). Sobre la base v1014, la suite L6
  // — pineada a su era — falla idéntico en ambos árboles (87/8 = 87/8,
  // verificado en la corrida del aterrizaje): el delta válido es 0.)
  ok(l6r.ok === l6b.ok && l6r.fail === l6b.fail, 'D1c L6: conteos idénticos base vs release sobre la base v1014 (delta 0; el delta +1/-1 era del pin A2 sobre v942)', { base: l6b.ok + '/' + l6b.fail, release: l6r.ok + '/' + l6r.fail });
  // D2 · v935 (sin pines de versión: los fallos deben ser idénticos).
  const v935Src = '/home/hatch/workspace/.lote-primer-posteo-mejor/release/test-lote-primer-posteo-mejor.js';
  const vBaseOut = runNeighbor(v935Src, BASE);
  const vRelOut = runNeighbor(v935Src, ROOT);
  function parseV935(out) {
    const m = out.match(/(\d+) pasaron, (\d+) fallaron\./);
    const fails = out.split('\n').filter((l) => l.includes('✗')).map((l) => l.replace(/^\s*✗\s*/, '').trim());
    return { ok: m ? +m[1] : -1, fail: m ? +m[2] : -1, fails };
  }
  const vb = parseV935(vBaseOut);
  const vr = parseV935(vRelOut);
  console.log('  (v935 base: ' + vb.ok + ' pasaron, ' + vb.fail + ' fallaron · release: ' + vr.ok + ' pasaron, ' + vr.fail + ' fallaron)');
  ok(vr.ok === vb.ok && vr.fail === vb.fail, 'D2a v935: mismos conteos base vs release');
  ok(JSON.stringify(vr.fails) === JSON.stringify(vb.fails), 'D2b v935: mismos fallos (ninguno nuevo, ninguno tapado)', { base: vb.fails.slice(0, 5), release: vr.fails.slice(0, 5) });
  // D3 · anclas sin pins (VM): el comportamiento del camino de
  // generación en la base y en el release debe ser idéntico salvo lo
  // nuevo del lote (el gate ai-generated).
  function anchors(treeDir) {
    const code = `
      process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'v960-anchor-'));
      const d = require(${JSON.stringify(path.join(treeDir, 'demo.js'))});
      const topic = { _wow: 1, digest_anchor: 'Tesora', tema: 'cafe', headline: 'Tesora que todos piden', caption: 'Tesora', image_prompt: 'Foto hero de Tesora' };
      const pool = [{ path: '/media/tesora-cup.jpg', url: 'https://philzcoffee.com/tesora-cup.jpg', temas: ['cafe'] }, { path: '/media/tesora-bag.jpg', url: 'https://philzcoffee.com/tesora-bag.jpg', temas: ['cafe'] }];
      const ctx = d.photoGateCtx({ category: 'cafeteria', subcat: null, topic, isCafe: true, neutralDefault: false, trialNoStock: true });
      const cands = d.pickFirstPostCandidates({ topic, webPool: pool, used: new Set(), ctx, lang: 'es', profilePicPath: '/media/philz-logo.jpg' });
      const candsEmpty = d.pickFirstPostCandidates({ topic, webPool: [], used: new Set(), ctx, lang: 'es', profilePicPath: null });
      const gReal = d.firstPostGate({ headline: 'H', caption: 'C', star: 'Tesora', lang: null, photo_source: 'real-product', brand_visible: true });
      const gPoster = d.firstPostGate({ headline: 'H', caption: 'C', star: 'Tesora', lang: null, photo_source: 'brand-poster', brand_visible: true });
      const specNoPhoto = d.buildDemoSpec({ business: 'Café Aroma', category: 'cafeteria', country: 'AR', tone: 'vos', photoPath: null, goal: '', goal_key: '', accent: '#1A2B3C', btn: '#E8B04B', count: 5, bioText: 'Café de especialidad.', profilePicPath: null, feedRegister: null, extraPhotos: [], digest: null, lang: 'es', trialNoStock: true, draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null });
      console.log(JSON.stringify({ winner: cands.winner, winnerEmpty: candsEmpty.winner, gateReal: gReal.pass, gatePoster: gPoster.pass, photos0null: specNoPhoto.photos[0] == null, needGen: (typeof d.firstPostNeedsGeneratedImage === 'function' ? d.firstPostNeedsGeneratedImage(specNoPhoto) : specNoPhoto.photos[0] == null) }));
    `;
    try {
      return execFileSync('node', ['-e', code], { encoding: 'utf8', timeout: 120000, env: { ...process.env, NODE_PATH: '/home/hatch/workspace/posta/node_modules' } }).trim();
    } catch (e) { return 'ERROR: ' + ((e.stdout || '') + (e.stderr || '')).slice(0, 500); }
  }
  const aBase = anchors(BASE);
  const aRel = anchors(ROOT);
  console.log('  (anclas base: ' + aBase + ')');
  console.log('  (anclas release: ' + aRel + ')');
  ok(aBase === aRel && !aBase.startsWith('ERROR'), 'D3 anclas sin pins idénticas base vs release (candidatos, gates, spec sin foto)', { base: aBase, release: aRel });

  console.log('\n== RESULTADO ==');
  console.log('ok: ' + pass + ' · mal: ' + fail);
  if (failures.length) { console.log('Fallos:'); for (const f of failures) console.log(' - ' + f); }
  else console.log('TODO VERDE.');
  try { fs.rmSync(path.join(ROOT, 'data'), { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
}
