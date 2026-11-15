'use strict';
/* Suite LOTE SOULCYCLE-A (CIERRES 1+3 del diagnóstico de la corrida
 * SoulCycle, candidata 1 de 5 del gate, 15/11/2026).
 * La corrida leyó el @ bien (prefill: fitness, confianza 0,5,
 * necesita_pregunta: true, estrella sin confirmar) pero la web
 * tipeada soulcycle.com era OTRA empresa («Soulcycle is a BMX shop
 * in Amsterdam»): web_info y el digest se construyeron enteros desde
 * la tienda BMX, la categoría cayó a «otro» y el onboarding no
 * preguntó NADA. Dos cierres que viven en la misma puerta de duda:
 *  (1) RECONCILIACIÓN IG↔WEB: cada fuente se clasifica por separado
 *      (rubro-id.reconcileSources) y si describen negocios distintos
 *      la CONTRADICCIÓN queda marcada en el fundamento
 *      (digest.reconciliacion) en vez de construir desde una sola en
 *      silencio. La web canónica se toma del link del propio perfil
 *      de IG cuando existe (trialWebCanonica, ruta stream: manda
 *      sobre la tipeada antes de que nada se derive de la web).
 *  (2) NECESITA_PREGUNTA OBLIGA: la contradicción nace como PRIMERA
 *      candidata en questionCandidatesOf y la puerta existente
 *      (trialPreguntaGate → trialQuestionFor, falta_pregunta en las
 *      DOS rutas) frena el armado con opciones de un toque ANTES de
 *      generateDemo. Sin candidata consumible, la duda era
 *      inferencia silenciosa: en la corrida question_candidates salió
 *      [] porque el voto combinado dio cero (el fitness era solo de
 *      la visión del prefill y la web BMX no tiene vocabulario).
 * Uso: node test-lote-soulcycle-a.js [--no-boot]
 * Control contra la base: LOTE_BASE_DIR=<árbol base v1101>. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
// Las cadenas de require del árbol pueden inicializar la DB en
// ./data relativo al cwd: la suite jamás ensucia el árbol.
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-soulcycle-a-data-'));

const REL = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.resolve(REL, '..', 'base');
const rubro = require(path.join(REL, 'rubro-id'));
const cd = require(path.join(REL, 'client-digest'));
const SERVER_SRC = fs.readFileSync(path.join(REL, 'server.js'), 'utf8');
const APPJS_SRC = fs.readFileSync(path.join(REL, 'public', 'app.js'), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(REL, 'public', 'index.html'), 'utf8');
const tieneBase = fs.existsSync(path.join(BASE, 'rubro-id.js'));
const rubroB = tieneBase ? require(path.join(BASE, 'rubro-id')) : null;
const cdB = tieneBase ? require(path.join(BASE, 'client-digest')) : null;
const SERVER_BASE = tieneBase ? fs.readFileSync(path.join(BASE, 'server.js'), 'utf8') : '';
const APPJS_BASE = tieneBase ? fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') : '';

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function seccion(s) { console.log('\n[' + s + ']'); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }

/* ------------------------------------------------ fixtures */
// La corrida reconstruida desde done-out.json / prefill.json: los
// captions reales del feed, los servicios reales de la tienda BMX y
// el rubro del prefill (fitness, que venía SOLO de la visión).
const CAPS_SC = [
  'Warming up for one of our favorite Thanksgiving traditions. 🦃 Turkey Burns are back',
  "It's never just been about the bike 💛 Your people are waiting. It's the final week",
  'The blind box of our bear-y wildest dreams.... (Just for fun 😉)',
  'Palm Beach, we’re coming for you. 🌴 Get ready to clip in at @thecolonypalmbeach',
];
const BMX_SERVICES = [
  'BMX Wheel Building (Custom Wheel Build )', 'Rotor Set Install', 'Bars Cutting',
  'General BMX Maintenance', 'HALLOWEEN RIDE-OUT 2026 💀', 'KINK 2027 COLLECTION',
  'WHEELS OF STEEL', 'NEW PRODUCTS FROM CULT&FRIENDS',
];
const WEB_BMX = { name: 'soulcyclebmx', description: 'Soulcycle is a BMX shop in Amsterdam', services: BMX_SERVICES, url: 'https://soulcycle.com/' };

function clsIgSoulCycle(mod) {
  return mod.classifyBusiness({ bio: '', fullName: 'SoulCycle', handle: 'soulcycle', captions: CAPS_SC, igCategory: '' });
}
function clsWebBmx(mod) {
  return mod.classifyBusiness({ jsonldType: '', catalogText: BMX_SERVICES.join(' · '), webText: 'soulcyclebmx Soulcycle is a BMX shop in Amsterdam' });
}
function recCorrida(mod) {
  return mod.reconcileSources({
    igCls: clsIgSoulCycle(mod), webCls: clsWebBmx(mod), igPrefillRubro: 'fitness',
    web: { servicios: BMX_SERVICES.length, catalogo: 0, descripcion: WEB_BMX.description, nombre: WEB_BMX.name, url: WEB_BMX.url },
  });
}
function digestCorrida(mod, cdm, conRec) {
  const resVacio = mod.resolveRubro({ cls: mod.classifyBusiness({}), lang: 'en' });
  return cdm.buildFromParts({
    business: 'SoulCycle', category: 'otro', rubroId: resVacio.rubroId,
    web: WEB_BMX,
    feed: { bio: '', captions: CAPS_SC, name: 'SoulCycle', handle: 'soulcycle' },
    ...(conRec ? { reconciliacion: recCorrida(mod) } : {}),
  });
}
// Caso sano: café de especialidad consistente en las dos fuentes.
const CAPS_CAFE = ['Espresso de origen único, recién molido', 'Filtrados V60 y Chemex toda la mañana', 'Café en grano de Etiopía, nuevo lote'];
const WEB_CAFE = { name: 'Café Andino', description: 'Café de especialidad. Espresso, filtrados y café en grano de origen.', services: ['Espresso', 'Filtrados', 'Café en grano'], url: 'https://cafeandino.com/' };
function clsIgCafe(mod) {
  return mod.classifyBusiness({ bio: 'Café de especialidad en Palermo. Espresso, filtrados y café en grano para tu casa.', fullName: 'Café Andino', handle: 'cafeandino', captions: CAPS_CAFE, igCategory: '' });
}
function clsWebCafe(mod) {
  return mod.classifyBusiness({ jsonldType: '', catalogText: 'Espresso · Filtrados · Café en grano · Métodos', webText: 'Café Andino: café de especialidad. Espresso, filtrados y café en grano de origen.' });
}

/* ------------------------------------------------ A · reconciliación */
seccion('A · reconcileSources — la corrida y los casos sanos');
{
  const igCls = clsIgSoulCycle(rubro);
  const webCls = clsWebBmx(rubro);
  ok(igCls.rubro === 'otro' && igCls.candidatas.length === 0, 'A1 fidelidad: el texto del feed solo no vota (el fitness era visión del prefill)', igCls);
  ok(webCls.rubro === 'otro' && webCls.candidatas.length === 0, 'A2 fidelidad: el texto BMX no tiene vocabulario en el clasificador', webCls);
  const rec = recCorrida(rubro);
  ok(!!rec && rec.contradiccion === true, 'A3 la corrida marca CONTRADICCIÓN', rec);
  ok(rec && rec.motivo === 'web_no_encaja', 'A4 motivo web_no_encaja (la web describe una oferta que el rubro IG no explica)', rec && rec.motivo);
  ok(rec && rec.ig.rubro === 'fitness' && rec.ig.fuente === 'prefill', 'A5 el lado IG es el fitness del prefill (puente fields.category)', rec && rec.ig);
  ok(rec && rec.web.nombre === 'soulcyclebmx' && rec.web.url === 'https://soulcycle.com/', 'A6 el lado web queda registrado con nombre y url', rec && rec.web);

  // Rubros distintos determinados en las dos fuentes.
  const igBel = rubro.classifyBusiness({ bio: 'Salón de belleza: uñas, maquillaje y estética facial', fullName: 'Luna Beauty', handle: 'lunabeauty', captions: ['Uñas esculpidas de la semana', 'Maquillaje para eventos', 'Limpieza facial profunda'], igCategory: '' });
  const webGas = rubro.classifyBusiness({ jsonldType: '', catalogText: 'Pizzas a la leña · Pastas caseras · Menú del día', webText: 'Luna Ristorante: pizzería y restaurante italiano. Pizzas a la leña, pastas caseras y menú del día.' });
  const recDist = rubro.reconcileSources({ igCls: igBel, webCls: webGas, igPrefillRubro: '', web: { servicios: 3, catalogo: 0, descripcion: 'Pizzería y restaurante italiano. Pizzas a la leña, pastas caseras y menú del día.', nombre: 'Luna Ristorante', url: 'https://lunaristorante.com/' } });
  ok(!!recDist && recDist.motivo === 'rubros_distintos' && recDist.ig.rubro === 'belleza' && recDist.web.rubro === 'gastronomia', 'A7 rubros distintos determinados → contradicción rubros_distintos', recDist);

  // Sanos: ninguna contradicción.
  const recCafe = rubro.reconcileSources({ igCls: clsIgCafe(rubro), webCls: clsWebCafe(rubro), igPrefillRubro: 'cafeteria', web: { servicios: 3, catalogo: 0, descripcion: WEB_CAFE.description, nombre: WEB_CAFE.name, url: WEB_CAFE.url } });
  ok(recCafe === null, 'A8 sano: café consistente IG+web → sin contradicción', recCafe);
  const webGym = rubro.classifyBusiness({ jsonldType: '', catalogText: 'Clases de indoor cycling · Entrenamiento funcional · Planes mensuales', webText: 'SoulCycle Fitness studio: indoor cycling classes, entrenamiento y comunidad.' });
  const recGym = rubro.reconcileSources({ igCls: rubro.classifyBusiness({}), webCls: webGym, igPrefillRubro: 'fitness', web: { servicios: 3, catalogo: 0, descripcion: 'Fitness studio: indoor cycling classes, entrenamiento y comunidad en cada sede.', nombre: 'SoulCycle', url: 'https://soulcycle.com/' } });
  ok(recGym === null, 'A9 sano: la web del MISMO negocio fitness apoya al IG → sin contradicción', recGym);
  const recVacia = rubro.reconcileSources({ igCls: rubro.classifyBusiness({}), webCls: rubro.classifyBusiness({ webText: 'Hola' }), igPrefillRubro: 'fitness', web: { servicios: 0, catalogo: 0, descripcion: 'Hola', nombre: 'SoulCycle', url: 'https://soulcycle.com/' } });
  ok(recVacia === null, 'A10 sano: web sin oferta (landing vacía) no contradice', recVacia);
  const recSoloWeb = rubro.reconcileSources({ igCls: rubro.classifyBusiness({}), webCls: webGas, igPrefillRubro: '', web: { servicios: 3, catalogo: 0, descripcion: 'Pizzería y restaurante italiano con menú del día y pastas caseras.', nombre: 'Luna', url: 'https://luna.com/' } });
  ok(recSoloWeb === null, 'A11 sano: sin lectura IG determinada manda la web como hoy', recSoloWeb);
  const recSinWeb = rubro.reconcileSources({ igCls: clsIgCafe(rubro), webCls: rubro.classifyBusiness({}), igPrefillRubro: '', web: null });
  ok(recSinWeb === null, 'A12 sano: sin web no hay contradicción posible', recSinWeb);
}

/* ------------------------------------------------ B · digest + puerta */
seccion('B · el fundamento marca y la puerta pregunta (corrida) / no frena (sano)');
{
  const d = digestCorrida(rubro, cd, true);
  ok(d.reconciliacion && d.reconciliacion.contradiccion === true, 'B1 la marca queda EN EL FUNDAMENTO (digest.reconciliacion)', d.reconciliacion);
  const cand = (d.question_candidates || []).find((c) => c.motivo === 'contradiccion_fuentes');
  ok(!!cand, 'B2 la contradicción es candidata a pregunta', d.question_candidates);
  ok(!!cand && d.question_candidates[0] === cand, 'B3 y es la PRIMERA candidata (antes que rubro/estrella)');
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && q.tipo === 'rubro' && q.motivo === 'contradiccion_fuentes', 'B4 la puerta devuelve la pregunta de contradicción (EN)', q);
  ok(!!q && Array.isArray(q.opciones) && q.opciones.length >= 1 && q.opciones.some((o) => o.rubro === 'fitness'), 'B5 con opciones de un toque que incluyen el rubro del IG (fitness)', q && q.opciones);
  ok(!!q && /Instagram/i.test(q.texto) && /website/i.test(q.texto), 'B6 el texto nombra el conflicto entre las fuentes', q && q.texto);
  const qEs = cd.trialQuestionFor(d, { lang: 'es' });
  ok(!!qEs && /Instagram/.test(qEs.texto) && /web/i.test(qEs.texto), 'B7 la pregunta en español también nombra el conflicto', qEs && qEs.texto);
  const qSkip = cd.trialQuestionFor(d, { lang: 'en', answered: { rubro: true } });
  ok(qSkip === null || qSkip.motivo !== 'contradiccion_fuentes', 'B8 lo respondido/salteado no se repregunta', qSkip);

  // Sano: sin marca, sin candidata de contradicción, sin freno nuevo.
  const resCafe = rubro.resolveRubro({ cls: clsIgCafe(rubro), lang: 'es' });
  const dSano = cd.buildFromParts({
    business: 'Café Andino', category: resCafe.category, rubroId: resCafe.rubroId,
    web: WEB_CAFE,
    feed: { bio: 'Café de especialidad en Palermo.', captions: CAPS_CAFE.slice(0, 2), name: 'Café Andino', handle: 'cafeandino' },
    reconciliacion: null,
  });
  ok(!dSano.reconciliacion, 'B9 sano: el fundamento no lleva marca de contradicción');
  ok(!(dSano.question_candidates || []).some((c) => c.motivo === 'contradiccion_fuentes'), 'B10 sano: ninguna candidata de contradicción');
  const qSano = cd.trialQuestionFor(dSano, { lang: 'es' });
  ok(qSano === null || qSano.motivo !== 'contradiccion_fuentes', 'B11 sano: la puerta no frena por contradicción', qSano);
  const qSanoResp = cd.trialQuestionFor(dSano, { lang: 'es', answered: { rubro: true, estrella: true } });
  ok(qSanoResp === null, 'B12 sano: con lo de siempre respondido, el armado sigue sin preguntas', qSanoResp);
}

/* ------------------------------------------------ C · control contra la base */
seccion('C · control contra la base v1101 (la corrida pasaba en silencio)');
if (tieneBase) {
  ok(typeof rubroB.reconcileSources !== 'function', 'C1 base: reconcileSources no existe');
  const dB = digestCorrida(rubroB, cdB, false);
  ok(!(dB.question_candidates || []).some((c) => c.motivo === 'contradiccion_fuentes'), 'C2 base: el fixture de la corrida no produce candidata de contradicción', dB.question_candidates);
  const qB = cdB.trialQuestionFor(dB, { lang: 'en' });
  ok(qB === null || qB.motivo !== 'contradiccion_fuentes', 'C3 base: la puerta NO frenaba por contradicción — el fundamento se construía', qB);
  ok(count(SERVER_BASE, 'trialWebCanonica') === 0, 'C4 base: no hay web canónica');
  ok(count(SERVER_BASE, 'reconcileSources') === 0, 'C5 base: resolveTrialRubro no reconcilia');
} else {
  console.log('  (sin LOTE_BASE_DIR: se salta el control)');
}

/* ------------------------------------------------ D · cableado y stamps */
seccion('D · cableado en server.js, web canónica y stamps de la cadena');
{
  ok(count(SERVER_SRC, 'rubroId.reconcileSources(') === 1, 'D1 resolveTrialRubro llama a reconcileSources una vez (las dos rutas comparten la función)');
  ok(count(SERVER_SRC, 'res.reconciliacion = reconciliacion') === 1 && count(SERVER_SRC, 'resC.reconciliacion') === 1, 'D2 la marca viaja en el resultado (normal y confirmado)');
  ok(count(SERVER_SRC, 'reconciliacion: rubro ? rubro.reconciliacion : null') === 1, 'D3 buildTrialDigest la pasa a buildFromParts (las dos rutas compilan por ahí)');
  ok(count(SERVER_SRC, 'trialPreguntaGate(trialDigest, fields, ocAns, lang)') === 2, 'D4 la puerta sigue cableada en las DOS rutas (generate + generate-stream)');
  ok(count(SERVER_SRC, 'async function trialWebCanonica(') === 1, 'D5 existe el helper de web canónica');
  ok(count(SERVER_SRC, 'webData = await trialWebCanonica(webData, webRaw, trialProfile && trialProfile.link)') === 1, 'D6 la ruta stream lo aplica con el link del perfil');
  const iCanon = SERVER_SRC.indexOf('webData = await trialWebCanonica');
  const iSheet = SERVER_SRC.indexOf('trialOfferSheetS = trialOfferBuildSheet({', iCanon);
  ok(iCanon > 0 && iSheet > iCanon, 'D7 la canónica corre ANTES de que la ficha/goal/fotos se deriven de la web');
  ok(count(SERVER_SRC, "const BUILD_ID = '20261105-v1102'") === 1, 'D8 BUILD_ID v1102');
  ok(count(APPJS_SRC, "const PZ_BUILD = '20261105-v1102'") === 1, 'D9 PZ_BUILD en paridad v1102');
  ok(count(INDEX_SRC, 'app.js?v=748') === 1, 'D10 index ES sirve app.js?v=748');
  if (tieneBase) {
    const defs = (src) => (src.match(/function [A-Za-z_$][A-Za-z0-9_$]*\s*\(/g) || []).sort().join('|');
    ok(defs(APPJS_SRC) === defs(APPJS_BASE), 'D11 funciones auditadas: las definiciones de app.js son idénticas a la base (solo cambió el stamp)');
  }
}

/* ------------------------------------------------ E · boot */
async function boot() {
  if (process.argv.includes('--no-boot')) { console.log('\n[E · boot] salteado por --no-boot'); return; }
  seccion('E · boot aislado del árbol final');
  const PORT = 34571;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-soulcycle-a-boot-'));
  // El árbol del repo no trae node_modules (el fetch lo saltea): el
  // boot lo resuelve del snapshot local, como las suites hermanas.
  const nmSnapshot = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
  const nodePath = process.env.NODE_PATH || (fs.existsSync(nmSnapshot) ? nmSnapshot : '');
  const server = spawn('node', ['server.js'], {
    cwd: REL,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'development', ...(nodePath ? { NODE_PATH: nodePath } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logBuf = '';
  server.stdout.on('data', (d) => { logBuf += d; });
  server.stderr.on('data', (d) => { logBuf += d; });
  const getJson = async (p) => {
    const r = await fetch('http://127.0.0.1:' + PORT + p);
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  try {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try { const v = await getJson('/api/version'); up = v.status === 200; } catch (e) { /* todavía no */ }
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    ok(up, 'E1 el servidor levanta en el puerto aislado', logBuf.slice(-300));
    if (up) {
      const v = await getJson('/api/version');
      ok(v.body && v.body.build === '20261105-v1102', 'E2 /api/version del boot = v1102', v.body);
      const f = await getJson('/api/founders');
      ok(f.status === 200 && f.body && f.body.ok === true, 'E3 /api/founders responde 200 en el boot (sin regresión)', f);
    }
  } finally {
    try { server.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 300));
    try { if (!server.killed) server.kill('SIGKILL'); } catch (e) {}
  }
}

boot().then(() => {
  console.log(`\n== test-lote-soulcycle-a: ${pass} ok · ${fail} mal ==`);
  if (failures.length) console.log('fallaron:', failures.join(' | '));
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error('ERROR test:', e); process.exit(1); });
