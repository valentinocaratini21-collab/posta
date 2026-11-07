'use strict';
/* test-lote-estilo-propio.js — LOTE ESTILO-PROPIO · 7/11
 * Decisión de Valentino 7/11 ~15:57: «lo que más hay que estudiar es el
 * tipo de posteo que hacen, que muestran, cómo lo muestran y intentar hacer
 * algo parecido a eso. Por lo menos los primeros posteos de prueba».
 *
 * El lote: (1) ESTUDIO — firma de estilo por cliente: de sus últimos 12
 * posteos del IG (+ imágenes de su web cuando el IG es flaco) se extrae por
 * posteo TIPO / QUÉ SE MUESTRA / CÓMO SE MUESTRA, con conteos y procedencia
 * en el fundamento; si falta el dato, rama honesta — nunca se inventa un
 * estilo. (2) GENERACIÓN — los primeros posteos de la prueba (3+1) nacen
 * constreñidos a la firma: mismo mix de tipos, mismo encuadre, misma manera
 * de mostrar el producto. El mock v2 sigue dejando elegir entre estilos,
 * pero el DEFAULT es el estilo propio del cliente (su firma primero).
 * (3) NO se toca: las 5 preguntas, su orden, la condicional de ubicación
 * por email, el flujo de onboarding, los campos del estudio en paralelo ni
 * las garantías de rubro del 3/11 (la firma NUNCA pasa por encima de la
 * puerta de rubro: cada posteo sigue siendo de un producto real del
 * fundamento).
 *
 * Fixtures: A — feed todo producto en primer plano → posteos de prueba en
 * primer plano, no lifestyle. B — feed todo persona a cámara → persona a
 * cámara, no solo producto. C — cliente sin video → el reel de muestra se
 * presenta como muestra en estilo neutro y etiquetado como muestra, no se
 * le inventa un estilo de video. + cliente sin IG (rama honesta: sin
 * posteos no hay firma; la web puede aportarla).
 *
 * En prístino v760 debe FALLAR (no existe la firma). En este árbol debe dar
 * 0 fallos. Uso: node test-lote-estilo-propio.js (árbol actual)
 *      BASE=/ruta/al/arbol node test-lote-estilo-propio.js
 * El boot (sección B) levanta el server aislado con DATA_DIR propio y
 * genera una prueba real con la firma aplicada (python + ffmpeg locales).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');

// DATA_DIR propio ANTES de requerir módulos del árbol (db.js abre la DB
// al cargar; el árbol no debe ganar un data/ por correr la suite).
const SUITE_TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-estilo-propio-'));
process.env.DATA_DIR = SUITE_TMP;

function treeDir() {
  const here = __dirname;
  if (fs.existsSync(path.join(here, 'public', 'prueba.html'))) return here;
  if (fs.existsSync(path.join(here, 'work', 'public', 'prueba.html'))) return path.join(here, 'work');
  throw new Error('no se encontro public/prueba.html junto al test ni en work/');
}
const T = treeDir();
const es = fs.readFileSync(path.join(T, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(T, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(T, 'server.js'), 'utf8');
const faSrc = fs.readFileSync(path.join(T, 'feed-audit.js'), 'utf8');
const dmSrc = fs.readFileSync(path.join(T, 'demo.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('OK  ' + name); }
  else { fail++; fails.push(name); console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); }
}
function has(h, s) { return h.indexOf(s) >= 0; }
function count(h, s) { return h.split(s).length - 1; }

// Extrae una función/objeto por conteo de llaves desde su firma.
function fnFrom(html, sig) {
  const i = html.indexOf(sig);
  if (i < 0) return null;
  let j = i, dPar = 0, seenParen = false, bodyStart = -1;
  for (; j < html.length; j++) {
    const c = html[j];
    if (c === '(') { dPar++; seenParen = true; }
    else if (c === ')') dPar--;
    else if (c === '{' && (!seenParen || dPar === 0)) { bodyStart = j; break; }
  }
  if (bodyStart < 0) return null;
  let d = 0;
  for (j = bodyStart; j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); }
  }
  return null;
}

const feedAudit = require(path.join(T, 'feed-audit.js'));
const demo = require(path.join(T, 'demo.js'));

// ---------- fixtures ----------
function mkPost(i, type, extra) {
  return Object.assign({
    type, shortcode: 'sc' + i, caption: 'posteo ' + i, likes: 10 + i,
    comments: 0, taken_at: 1700000000 + i * 86400,
    thumb: 'data:image/jpeg;base64,AAA' + i, pinned: false,
  }, extra || {});
}
// A: 12 posteos, todo producto en primer plano (8 foto + 2 video + 2 carrusel).
const FEED_A = [];
for (let i = 0; i < 8; i++) FEED_A.push(mkPost(i, 'GraphImage'));
for (let i = 8; i < 10; i++) FEED_A.push(mkPost(i, 'GraphVideo', { video_duration: i === 8 ? 15 : 30 }));
for (let i = 10; i < 12; i++) FEED_A.push(mkPost(i, 'GraphSidecar'));
const VISION_A = async (items) => items.map(() => ({
  que: 'producto_primer_plano', encuadre: 'primer_plano', angulo: 'frontal',
  luz: 'natural', texto: false,
}));
// B: 12 posteos, todo persona a cámara.
const FEED_B = [];
for (let i = 0; i < 12; i++) FEED_B.push(mkPost(i, i < 6 ? 'GraphImage' : 'GraphVideo', i >= 6 ? { video_duration: 20 } : {}));
const VISION_B = async (items) => items.map(() => ({
  que: 'persona_camara', encuadre: 'plano_medio', angulo: 'frontal',
  luz: 'calida', texto: true,
}));
// C: 12 posteos, sin video.
const FEED_C = [];
for (let i = 0; i < 12; i++) FEED_C.push(mkPost(i, 'GraphImage'));
const FIRMA_A = {
  n: 12, procedencia: 'tu feed', sin_video: false,
  tipos: { foto: 8, video: 2, carrusel: 2 },
  que: { producto_primer_plano: 12 },
  dominante: { que: 'producto_primer_plano', encuadre: 'primer_plano', count: 12 },
};
const FIRMA_C = {
  n: 12, procedencia: 'tu feed', sin_video: true,
  tipos: { foto: 12, video: 0, carrusel: 0 },
  que: { producto_primer_plano: 12 },
  dominante: { que: 'producto_primer_plano', encuadre: 'primer_plano', count: 12 },
};

function buildSpec(firmaStyle, firmaSinVideo) {
  return demo.buildDemoSpec({
    business: 'Café Aroma', category: 'gastronomia', country: 'AR', tone: 'vos',
    goal: 'vender más café', accent: '#2793C8', btn: '#FEC14D', count: 5,
    lang: 'es', trialNoStock: true, digest: null, draft: null,
    firmaStyle: firmaStyle || null, firmaSinVideo: !!firmaSinVideo,
  });
}
// buildDemoSpec devuelve specPosts (el spec guardado de generateDemo usa posts).
const spOf = (spec) => (spec && spec.specPosts) || (spec && spec.posts) || [];

async function main() {
  // ---------- S) estático: marcadores del lote ----------
  console.log('— S) estático —');
  ok('S0 feed-audit expone trialStyleSignature', has(faSrc, 'trialStyleSignature'));
  ok('S0 feed-audit expone firmaStyleCode', has(faSrc, 'firmaStyleCode'));
  ok('S0 feed-audit expone firmaGoalLines', has(faSrc, 'firmaGoalLines'));
  ok('S0 feed-audit define el vocabulario FIRMA_QUE', has(faSrc, 'FIRMA_QUE'));
  ok('S0 parseEmbedPosts extrae video_duration', has(faSrc, 'video_duration'));
  ok('S0 server tiene classifyFeedPostStyles (visión por posteo)', has(srv, 'classifyFeedPostStyles'));
  ok('S0 server llama trialStyleSignature en el prefill', count(srv, 'trialStyleSignature') >= 2);
  ok('S0 server valida firma en parseTrialStyle', (() => { const p = fnFrom(srv, 'function parseTrialStyle('); return !!p && p.indexOf('firma') >= 0; })());
  ok('S0 server pasa firmaStyle/firmaSinVideo a la generación', has(srv, 'firmaStyle') && has(srv, 'firmaSinVideo'));
  ok('S0 demo aplica firmaStyle', has(dmSrc, 'firmaStyle'));
  ok('S0 demo marca muestra_neutra', has(dmSrc, 'muestra_neutra'));
  for (const [tag, html] of [['ES', es], ['EN', en]]) {
    ok(tag + ' (S) draftFirmaFotoOpt existe', has(html, 'function draftFirmaFotoOpt('));
    ok(tag + ' (S) mergeStyle mezcla la firma', (() => { const m = fnFrom(html, 'function mergeStyle('); return !!m && m.indexOf('firma') >= 0; })());
    ok(tag + ' (S) T.styleFirma existe', has(html, 'styleFirma:'));
    ok(tag + ' (S) T.draftFirmaChip existe', has(html, 'draftFirmaChip:'));
    ok(tag + ' (S) mapa FIRMA_QUE_L existe', has(html, 'FIRMA_QUE_L'));
    ok(tag + ' (S) draftShowRound usa el default de la firma', has(html, 'draftFirmaFotoOpt()'));
    ok(tag + ' (S) la tarjeta elegida por la firma lleva chip', has(html, 'T.draftFirmaChip'));
  }

  // ---------- F) firma de estilo (feed-audit.js) ----------
  console.log('— F) firma de estilo —');
  const firmaFns = typeof feedAudit.trialStyleSignature === 'function' && typeof feedAudit.firmaStyleCode === 'function' && typeof feedAudit.firmaGoalLines === 'function';
  ok('F0 trialStyleSignature/firmaStyleCode/firmaGoalLines existen', firmaFns);
  if (firmaFns) {
  const sigA = await feedAudit.trialStyleSignature(FEED_A, { vision: VISION_A, source: 'tu feed' });
  ok('F1 A: firma con n=12', sigA && sigA.n === 12, JSON.stringify(sigA && sigA.n));
  ok('F1 A: tipos contados 8/2/2', sigA && sigA.tipos && sigA.tipos.foto === 8 && sigA.tipos.video === 2 && sigA.tipos.carrusel === 2, JSON.stringify(sigA && sigA.tipos));
  ok('F1 A: hay video (sin_video false)', sigA && sigA.sin_video === false);
  ok('F1 A: duraciones de video 15s y 30s, mediana 22.5', sigA && sigA.duraciones && sigA.duraciones.n === 2 && sigA.duraciones.mediana_seg === 22.5, JSON.stringify(sigA && sigA.duraciones));
  ok('F1 A: dominante producto en primer plano 12/12', sigA && sigA.dominante && sigA.dominante.que === 'producto_primer_plano' && sigA.dominante.count === 12 && sigA.dominante.encuadre === 'primer_plano', JSON.stringify(sigA && sigA.dominante));
  ok('F1 A: procedencia tu feed', sigA && sigA.procedencia === 'tu feed');
  ok('F1 A: visión aplicada (vision_ok)', sigA && sigA.vision_ok === true);
  ok('F1 A: que_counts con 12 en producto_primer_plano', sigA && sigA.que && sigA.que.producto_primer_plano === 12);
  ok('F1 A: firmaStyleCode → /product', feedAudit.firmaStyleCode(sigA) === '/product', String(feedAudit.firmaStyleCode(sigA)));

  const sigB = await feedAudit.trialStyleSignature(FEED_B, { vision: VISION_B, source: 'tu feed' });
  ok('F2 B: dominante persona a cámara', sigB && sigB.dominante && sigB.dominante.que === 'persona_camara' && sigB.dominante.count === 12, JSON.stringify(sigB && sigB.dominante));
  ok('F2 B: firmaStyleCode → /lifestyle', feedAudit.firmaStyleCode(sigB) === '/lifestyle', String(feedAudit.firmaStyleCode(sigB)));
  ok('F2 B: texto en imagen contado (12 sí)', sigB && sigB.texto_en_imagen && sigB.texto_en_imagen.si === 12, JSON.stringify(sigB && sigB.texto_en_imagen));

  const sigC = await feedAudit.trialStyleSignature(FEED_C, { vision: VISION_A, source: 'tu feed' });
  ok('F3 C: sin video → sin_video true', sigC && sigC.sin_video === true);
  ok('F3 C: duraciones vacías (n=0)', sigC && sigC.duraciones && sigC.duraciones.n === 0);
  ok('F3 C: firmaStyleCode sigue siendo /product', feedAudit.firmaStyleCode(sigC) === '/product');

  const sigNoVision = await feedAudit.trialStyleSignature(FEED_A, { vision: async () => { throw new Error('vision caída'); }, source: 'tu feed' });
  ok('F4 visión caída: lo determinista sobrevive (tipos 8/2/2)', sigNoVision && sigNoVision.tipos && sigNoVision.tipos.foto === 8 && sigNoVision.tipos.video === 2, JSON.stringify(sigNoVision && sigNoVision.tipos));
  ok('F4 visión caída: dominante nulo (no se inventa)', sigNoVision && (sigNoVision.dominante == null || sigNoVision.dominante.que == null));
  ok('F4 visión caída: vision_ok false', sigNoVision && sigNoVision.vision_ok === false);

  const sigBadVision = await feedAudit.trialStyleSignature(FEED_A, {
    vision: async (items) => items.map(() => ({ que: 'nave_espacial', encuadre: 'desde_arriba', angulo: 'torcido', luz: 'neón', texto: 'quizás' })),
    source: 'tu feed',
  });
  ok('F5 visión con valores fuera de vocabulario: dominante nulo', sigBadVision && (sigBadVision.dominante == null || sigBadVision.dominante.que == null), JSON.stringify(sigBadVision && sigBadVision.dominante));

  const sigWeb = await feedAudit.trialStyleSignature(FEED_A.slice(0, 4), { vision: VISION_A, source: 'tu web' });
  ok('F6 web: procedencia tu web, n=4', sigWeb && sigWeb.procedencia === 'tu web' && sigWeb.n === 4);
  ok('F6 web: firmaStyleCode → /product', feedAudit.firmaStyleCode(sigWeb) === '/product');

  ok('F7 sin posteos: no hay firma (null)', (await feedAudit.trialStyleSignature([], { source: 'tu feed' })) === null);
  ok('F7 sin IG y sin web: no hay firma (null)', (await feedAudit.trialStyleSignature(null, { source: 'tu feed' })) === null);
  ok('F8 firmaStyleCode(null) → null', feedAudit.firmaStyleCode(null) === null);
  ok('F8 firmaStyleCode local → /workspace', feedAudit.firmaStyleCode({ dominante: { que: 'local', encuadre: 'plano_general', count: 9 } }) === '/workspace');
  ok('F8 firmaStyleCode texto → /quote', feedAudit.firmaStyleCode({ dominante: { que: 'texto', encuadre: 'plano_general', count: 9 } }) === '/quote');
  ok('F8 firmaStyleCode producto en acción → /lifestyle', feedAudit.firmaStyleCode({ dominante: { que: 'producto_accion', encuadre: 'plano_medio', count: 9 } }) === '/lifestyle');
  ok('F8 firmaStyleCode cenital + producto → /flatlay', feedAudit.firmaStyleCode({ dominante: { que: 'producto_primer_plano', encuadre: 'cenital', count: 9 } }) === '/flatlay');
  ok('F8 firmaStyleCode otro → null', feedAudit.firmaStyleCode({ dominante: { que: 'otro', encuadre: 'otro', count: 9 } }) === null);

  const linesEs = feedAudit.firmaGoalLines(FIRMA_A, 'es');
  ok('F9 líneas ES: cuentan 12 de 12 y la procedencia', Array.isArray(linesEs) && linesEs.length >= 1 && linesEs[0].indexOf('12 de 12') >= 0 && linesEs[0].indexOf('tu feed') >= 0, JSON.stringify(linesEs));
  ok('F9 líneas ES: nombran el qué en palabras simples', linesEs.length >= 1 && linesEs[0].indexOf('primer plano') >= 0, JSON.stringify(linesEs));
  const linesEn = feedAudit.firmaGoalLines(FIRMA_A, 'en');
  ok('F9 líneas EN: cuentan 12 of 12', Array.isArray(linesEn) && linesEn.length >= 1 && linesEn[0].indexOf('12 of 12') >= 0, JSON.stringify(linesEn));
  const linesC = feedAudit.firmaGoalLines(FIRMA_C, 'es');
  ok('F9 líneas C (sin video): avisan que el reel es muestra', linesC.length >= 2 && linesC.some((l) => l.indexOf('muestra') >= 0), JSON.stringify(linesC));
  ok('F9 líneas null: cero líneas', feedAudit.firmaGoalLines(null, 'es').length === 0);
  }

  // ---------- P) parseTrialStyle + styleGoalLines (server.js, en vm) ----------
  console.log('— P) parseTrialStyle + styleGoalLines —');
  const parseSrc = fnFrom(srv, 'function parseTrialStyle(');
  const goalSrc = fnFrom(srv, 'function styleGoalLines(');
  ok('P0 parseTrialStyle extraíble', !!parseSrc);
  ok('P0 styleGoalLines extraíble', !!goalSrc);
  if (parseSrc && goalSrc) {
    const ctx = vm.createContext({ feedAudit, console });
    vm.runInContext(parseSrc + '\n' + goalSrc, ctx);
    const parsed = vm.runInContext('parseTrialStyle(JSON.stringify({ posts_per_week: 7, firma: ' + JSON.stringify(FIRMA_A) + ' }))', ctx);
    ok('P1 parseTrialStyle guarda la firma válida', parsed && parsed.firma && parsed.firma.n === 12 && parsed.firma.procedencia === 'tu feed' && parsed.firma.sin_video === false, JSON.stringify(parsed && parsed.firma));
    ok('P1 parseTrialStyle guarda el dominante', parsed && parsed.firma && parsed.firma.dominante && parsed.firma.dominante.que === 'producto_primer_plano' && parsed.firma.dominante.count === 12, JSON.stringify(parsed && parsed.firma && parsed.firma.dominante));
    const parsedBad = vm.runInContext('parseTrialStyle(JSON.stringify({ firma: { n: 999, procedencia: "inventado", sin_video: "si", tipos: { foto: 99 }, que: { nave_espacial: 5 }, dominante: { que: "nave_espacial", encuadre: "desde_arriba", count: 99 } } }))', ctx);
    ok('P2 parseTrialStyle tira la firma inventada (n, procedencia, que, dominante)', !parsedBad || !parsedBad.firma, JSON.stringify(parsedBad && parsedBad.firma));
    const parsedStr = vm.runInContext('parseTrialStyle(JSON.stringify({ firma: "un estilo" }))', ctx);
    ok('P2 parseTrialStyle tira la firma no-objeto', !parsedStr || !parsedStr.firma);
    const gl = vm.runInContext('styleGoalLines({ posts_per_week: 7, firma: ' + JSON.stringify(FIRMA_A) + ' }, "es")', ctx);
    ok('P3 styleGoalLines suma la línea de la firma', Array.isArray(gl) && gl.some((l) => l.indexOf('12 de 12') >= 0), JSON.stringify(gl));
    const glNoFirma = vm.runInContext('styleGoalLines({ posts_per_week: 7 }, "es")', ctx);
    ok('P3 styleGoalLines sin firma no inventa línea', Array.isArray(glNoFirma) && !glNoFirma.some((l) => l.indexOf('Estilo propio') >= 0 || l.indexOf('estilo') >= 0), JSON.stringify(glNoFirma));
    const glNull = vm.runInContext('styleGoalLines(null, "es")', ctx);
    ok('P3 styleGoalLines(null) → []', Array.isArray(glNull) && glNull.length === 0);
  }

  // ---------- D) generación constreñida a la firma (demo.js) ----------
  console.log('— D) generación constreñida —');
  ok('D0 buildDemoSpec exportado', typeof demo.buildDemoSpec === 'function');
  let aOk = 0, bOk = 0, cOk = 0;
  for (let k = 0; k < 3; k++) {
    const specA = buildSpec('/product', false);
    if (spOf(specA)[0] && spOf(specA)[0].style === '/product') aOk++;
    const specB = buildSpec('/lifestyle', false);
    if (spOf(specB)[0] && spOf(specB)[0].style === '/lifestyle') bOk++;
    const specC = buildSpec('/product', true);
    if (spOf(specC)[specC.videoIdx] && spOf(specC)[specC.videoIdx].muestra_neutra === true) cOk++;
  }
  ok('D1 A (3×): el primer posteo es /product (primer plano, no lifestyle)', aOk === 3, 'aOk=' + aOk);
  ok('D2 B (3×): el primer posteo es /lifestyle (persona a cámara)', bOk === 3, 'bOk=' + bOk);
  ok('D3 C (3×): el reel de muestra lleva muestra_neutra', cOk === 3, 'cOk=' + cOk);
  const specC1 = buildSpec('/product', true);
  ok('D3 C: el video usa el estilo de la firma (no uno inventado)', spOf(specC1)[specC1.videoIdx] && spOf(specC1)[specC1.videoIdx].style === '/product', JSON.stringify(spOf(specC1)[specC1.videoIdx] && spOf(specC1)[specC1.videoIdx].style));
  const specBase = buildSpec(null, false);
  ok('D4 sin firma: el primer posteo es un estilo del pool (no forzado)', spOf(specBase)[0] && typeof spOf(specBase)[0].style === 'string' && spOf(specBase)[0].style.length > 0, JSON.stringify(spOf(specBase)[0] && spOf(specBase)[0].style));
  ok('D4 sin firma: ningún posteo lleva muestra_neutra', spOf(specBase).length > 0 && !spOf(specBase).some((p) => p.muestra_neutra));
  ok('D4 sin firma y sin video: ningún posteo lleva muestra_neutra', spOf(buildSpec(null, false)).every((p) => !p.muestra_neutra));
  // D5: el dataset puede sumar ~450 a un estilo que encaja con el perfil
  // del feed — la firma observada tiene que ganar igual (lección del boot:
  // con paleta clara el primer posteo salía /aerialview con +500).
  const specPal = demo.buildDemoSpec({
    business: 'Café Aroma', category: 'gastronomia', country: 'AR', tone: 'vos',
    goal: 'vender más café', accent: '#2793C8', btn: '#FEC14D', count: 5,
    lang: 'es', trialNoStock: true,
    digest: { paleta: [{ hex: '#F5E6D3', rol: 'fondo' }, { hex: '#8B5E3C', rol: 'acento' }] },
    draft: null, firmaStyle: '/product', firmaSinVideo: true,
  });
  ok('D5 con digest y paleta: la firma sigue mandando en el primer posteo', spOf(specPal)[0] && spOf(specPal)[0].style === '/product', JSON.stringify(spOf(specPal)[0] && spOf(specPal)[0].style));
  ok('D5 con digest y paleta: el video sigue con la firma y muestra_neutra', spOf(specPal)[specPal.videoIdx] && spOf(specPal)[specPal.videoIdx].style === '/product' && spOf(specPal)[specPal.videoIdx].muestra_neutra === true, JSON.stringify(spOf(specPal)[specPal.videoIdx] && spOf(specPal)[specPal.videoIdx].style));

  // ---------- M) mock v2: la firma es el default (prueba.html, en vm) ----------
  console.log('— M) mock v2 default = firma —');
  const tSrc = fnFrom(es, 'var T = {');
  const mergeSrc = fnFrom(es, 'function mergeStyle(');
  const fotoOptSrc = fnFrom(es, 'function draftFirmaFotoOpt(');
  const styleLineSrc = fnFrom(es, 'function chatStyleLine() {');
  const queLSrc = fnFrom(es, 'var FIRMA_QUE_L = {');
  ok('M0 T extraíble', !!tSrc);
  ok('M0 mergeStyle extraíble', !!mergeSrc);
  ok('M0 draftFirmaFotoOpt extraíble', !!fotoOptSrc);
  ok('M0 chatStyleLine extraíble', !!styleLineSrc);
  ok('M0 FIRMA_QUE_L extraíble', !!queLSrc);
  if (mergeSrc) {
    const ctx = vm.createContext({});
    vm.runInContext(mergeSrc, ctx);
    const m1 = vm.runInContext('mergeStyle({ firma: ' + JSON.stringify(FIRMA_A) + ' }, null)', ctx);
    ok('M1 mergeStyle: firma IG sola sobrevive', m1 && m1.firma && m1.firma.n === 12);
    const m2 = vm.runInContext('mergeStyle({ firma: { n: 2, procedencia: "tu feed" } }, { firma: { n: 10, procedencia: "tu web" } })', ctx);
    ok('M2 mergeStyle: IG con n>=4 gana sobre web flaca', m2 && m2.firma && m2.firma.n === 10 && m2.firma.procedencia === 'tu web');
    const m3 = vm.runInContext('mergeStyle({ firma: { n: 10, procedencia: "tu web" } }, { firma: { n: 2, procedencia: "tu feed" } })', ctx);
    ok('M3 mergeStyle: web con n>=4 gana sobre IG flaco', m3 && m3.firma && m3.firma.n === 10 && m3.firma.procedencia === 'tu web');
    const m4 = vm.runInContext('mergeStyle({ posts_per_week: 7 }, { posts_per_week: 5 })', ctx);
    ok('M4 mergeStyle: sin firmas no inventa firma', m4 && m4.firma == null);
  }
  if (fotoOptSrc) {
    const ctx = vm.createContext({ S: { style: { firma: FIRMA_A } } });
    vm.runInContext(fotoOptSrc, ctx);
    ok('M5 draftFirmaFotoOpt: producto en primer plano → producto', vm.runInContext('draftFirmaFotoOpt()', ctx) === 'producto');
    vm.runInContext('S = { style: { firma: { dominante: { que: "persona_camara" } } } }', ctx);
    ok('M5 draftFirmaFotoOpt: persona a cámara → accion', vm.runInContext('draftFirmaFotoOpt()', ctx) === 'accion');
    vm.runInContext('S = { style: { firma: { dominante: { que: "texto" } } } }', ctx);
    ok('M5 draftFirmaFotoOpt: texto → marca', vm.runInContext('draftFirmaFotoOpt()', ctx) === 'marca');
    vm.runInContext('S = { style: {} }', ctx);
    ok('M5 draftFirmaFotoOpt: sin firma → null', vm.runInContext('draftFirmaFotoOpt()', ctx) === null);
  }
  if (tSrc && styleLineSrc && queLSrc) {
    const ctx = vm.createContext({ document: { documentElement: { lang: 'es' } }, S: { style: Object.assign({ posts_per_week: 7, palette_names: ['azul'], avg_caption_words: 10, hashtags_top: ['#cafe'], tone: 'vos' }, { firma: FIRMA_A }) } });
    vm.runInContext(tSrc + '\n' + queLSrc + '\n' + styleLineSrc, ctx);
    const line = vm.runInContext('chatStyleLine()', ctx);
    ok('M6 chatStyleLine muestra la firma (12 de 12, primer plano)', typeof line === 'string' && line.indexOf('12 de 12') >= 0 && line.indexOf('primer plano') >= 0, line);
    vm.runInContext('S = { style: { posts_per_week: 7 } }', ctx);
    const lineNo = vm.runInContext('chatStyleLine()', ctx);
    ok('M6 chatStyleLine sin firma no inventa línea de estilo', typeof lineNo === 'string' && lineNo.indexOf('estilo') < 0, lineNo);
  }
  // La ronda foto del mock reordena con la firma primero y marca la tarjeta.
  for (const [tag, html] of [['ES', es], ['EN', en]]) {
    const round = fnFrom(html, 'function draftShowRound(');
    ok(tag + ' (M7) draftShowRound reordena la foto con la firma primero', !!round && round.indexOf('draftFirmaFotoOpt') >= 0, round ? 'sin draftFirmaFotoOpt en draftShowRound' : 'sin draftShowRound');
    ok(tag + ' (M7) draftShowRound marca la tarjeta con el chip de la firma', !!round && round.indexOf('draftFirmaChip') >= 0, round ? 'sin draftFirmaChip en draftShowRound' : 'sin draftShowRound');
  }

  // ---------- B) boot aislado + generación real con la firma ----------
  console.log('— B) boot aislado —');
  const buildM = srv.match(/const BUILD_ID = '([^']+)'/);
  const BUILD = buildM ? buildM[1] : null;
  ok('B0 BUILD_ID legible del server', !!BUILD, String(BUILD));
  const PORT = 34571;
  const bootTmp = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-estilo-'));
  const child = spawn('node', ['server.js'], {
    cwd: T,
    env: Object.assign({}, process.env, {
      NODE_PATH: '/home/hatch/workspace/posta/node_modules',
      DATA_DIR: bootTmp, PORT: String(PORT),
      ADMIN_TOKEN: 't-estilo', TRIAL_TEST_KEY: 'k-estilo',
      OPENAI_API_KEY: '', GEMINI_API_KEY: '',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let childOut = '';
  child.stdout.on('data', (d) => { childOut += String(d); });
  child.stderr.on('data', (d) => { childOut += String(d); });
  const getJson = (p) => new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: 10000 }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('no-json: ' + b.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
  const postMultipart = (p, fields) => new Promise((resolve, reject) => {
    const boundary = '----estilo-boundary-' + Date.now();
    let body = '';
    for (const [k, v] of Object.entries(fields)) {
      body += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
    }
    body += '--' + boundary + '--\r\n';
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary, 'Content-Length': Buffer.byteLength(body) }, timeout: 300000 }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(new Error('no-json: ' + b.slice(0, 300))); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout 300s')); });
    req.end(body);
  });
  try {
    let ver = null;
    for (let i = 0; i < 60 && !ver; i++) {
      try { ver = await getJson('/api/version'); } catch (e) { await new Promise((r) => setTimeout(r, 500)); }
    }
    ok('B1 el server levanta y /api/version responde', !!ver, childOut.slice(-500));
    ok('B1 /api/version trae el BUILD del árbol (' + BUILD + ')', ver && ver.build === BUILD, JSON.stringify(ver && ver.build));
    if (ver) {
      const estilo = JSON.stringify({ posts_per_week: 7, firma: FIRMA_C });
      const gen = await postMultipart('/api/trial/generate?test_key=k-estilo', {
        business: 'Café Aroma', category: 'gastronomia', country: 'AR', tone: 'vos',
        goal: 'vender más café', producto_estrella: 'Café de especialidad',
        producto_mix: 'solo', cta: 'Escribinos', cta_mix: 'solo',
        promo: 'Sin promo', promo_mix: 'solo', voz: 'Cercano', voz_mix: 'solo',
        precios: 'Sí', precios_mix: 'solo', donde: 'Palermo', etapa: 'abierto',
        audiencia: 'Vecinos', diferencial: 'Café de especialidad tostado en casa',
        estilo,
      });
      ok('B2 la prueba genera (ok true, 5 posteos)', gen && gen.ok === true && Array.isArray(gen.posts) && gen.posts.length === 5, JSON.stringify(gen && { ok: gen.ok, posts: gen.posts && gen.posts.length, error: gen.error }));
      if (gen && Array.isArray(gen.posts) && gen.posts.length === 5) {
        ok('B2 el primer posteo de la prueba es /product (firma)', gen.posts[0].style === '/product', JSON.stringify(gen.posts[0].style));
        const vid = gen.posts.find((p) => p.type === 'video');
        ok('B2 hay un posteo video en la prueba', !!vid);
        ok('B2 el reel de muestra lleva muestra_neutra (cliente sin video)', vid && vid.muestra_neutra === true, JSON.stringify(vid && vid.muestra_neutra));
        ok('B2 el video usa el estilo de la firma', vid && vid.style === '/product', JSON.stringify(vid && vid.style));
        ok('B2 el spec guardado lleva la firma en el primer posteo', gen.design && gen.design.posts && gen.design.posts[0] && gen.design.posts[0].style === '/product', JSON.stringify(gen.design && gen.design.posts && gen.design.posts[0] && gen.design.posts[0].style));
      }
    }
  } catch (e) {
    ok('B boot sin excepciones', false, e.message + ' :: ' + childOut.slice(-800));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(bootTmp, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(SUITE_TMP, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n— RESUMEN —\n' + pass + ' ok / ' + fail + ' mal' + (fails.length ? '\nFALLOS: ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('SUITE ROTA:', e); process.exit(2); });
