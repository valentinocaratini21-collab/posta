#!/usr/bin/env node
// LOTE LOGO-ESTRATÉGICO (provisorio v1001; requisito de Valentino
// 13/11 00:29): «siempre aparezca el logo del negocio en la imagen, y
// usarlo estratégicamente. pensar dónde y cómo ponerlo y usarlo».
// Extiende SIN duplicar dos lotes en fila: LOGO-INTEGRADO (rescate en
// la ingesta: foto real sin marca → UN intento de integrar el logo
// real con el editor multirreferencia, solo engine 'nano') y
// CORRECTIVO-7 FOTO-GATE (classifyBrandPresence + brand_presence).
// Este lote suma: (1) el asset del logo como campo propio del estudio
// (digest.logo {url, file, fuente, at}, desde la resolución vigente —
// foto de perfil de IG / logoPaletaYArchivo —; sin logo alcanzable,
// null y todo degrada honesto); (2) SUPERFICIES POR RUBRO: tabla
// determinística rubro→superficies y el prompt del intento NOMBRA la
// superficie elegida + la jerarquía (el logo se lee, no compite con
// la estrella; nunca sello en esquina ni banda); (3) PUERTA DE
// CALIDAD (deepRead.classifyLogoIntegration): tras la presencia, una
// llamada de visión juzga legible/impreso/invade — la editada solo se
// entrega con ok===true; si no, status 'sin-calidad' y la foto sigue
// el camino vigente. El veredicto queda cacheado en el registro.
// Uso: node test-lote-logo-estrategico.js (desde la raíz del scratch
// o desde release/ — resuelve los módulos solo; bootea el server del
// release con DATA_DIR temporal en un puerto libre).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const HERE = __dirname;
const SCRATCH = fs.existsSync(path.join(HERE, 'release')) ? HERE : path.dirname(HERE);
const ROOT = fs.existsSync(path.join(HERE, 'server.js')) ? HERE : path.join(SCRATCH, 'release');
const FUSION = path.join(SCRATCH, 'base-fusion');
const HAS_FUSION = fs.existsSync(path.join(FUSION, 'server.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); }
};
const count = (text, needle) => String(text || '').split(needle).length - 1;

const cd = require(path.join(ROOT, 'client-digest.js'));
const demo = require(path.join(ROOT, 'demo.js'));
const deepRead = require(path.join(ROOT, 'deep-read.js'));
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const digestSrc = fs.readFileSync(path.join(ROOT, 'client-digest.js'), 'utf8');
const deepSrc = fs.readFileSync(path.join(ROOT, 'deep-read.js'), 'utf8');

// ── §0 Estáticos: las piezas existen, censos, no-duplicación ──
{
  ok('E1 BUILD definitivo del lote (v1057) [RE-PIN PREPARADOR: el provisorio del builder era v1001; el definitivo se fija al componer sobre el vivo]', srvSrc.includes("const BUILD_ID = '20261105-v1057'"));
  ok('E2 deep-read exporta la puerta de calidad (classifyLogoIntegration)', typeof deepRead.classifyLogoIntegration === 'function');
  ok('E3 classifyBrandPresence queda UNA sola copia (ni duplicada ni envuelta)', count(deepSrc, 'async function classifyBrandPresence') === 1 && count(deepSrc, 'async function classifyLogoIntegration') === 1);
  ok('E4 server define la tabla de superficies y el prompt estratégico', srvSrc.includes('function logoSuperficieParaRubro') && srvSrc.includes('function logoIntPromptEstrategico') && srvSrc.includes('LOGO_SUPERFICIES_POR_RUBRO'));
  ok('E5 el pipeline pasa por la puerta de calidad (sin-calidad en server y digest)', srvSrc.includes('classifyLogoIntegration') && srvSrc.includes("'sin-calidad'") && digestSrc.includes("'sin-calidad'"));
  ok('E6 el digest suma el asset del logo (sanitizeDigestLogo + digestLogoOf + campo)', digestSrc.includes('function sanitizeDigestLogo') && digestSrc.includes('function digestLogoOf') && digestSrc.includes('logo: null') && typeof cd.sanitizeDigestLogo === 'function' && typeof cd.digestLogoOf === 'function');
  ok('E7 censos ajenos intactos: monedaCuentaAds ×4 · PLAN_UNICO ×11 · contentLangOf ×14 [RE-PIN PREPARADOR: en la base de fusión del builder (v992) era ×6; en el vivo es ×14 desde v922, idéntico en base y release]', count(srvSrc, 'monedaCuentaAds') === 4 && count(srvSrc, 'PLAN_UNICO') === 11 && count(srvSrc, 'contentLangOf') === 14, [count(srvSrc, 'monedaCuentaAds'), count(srvSrc, 'PLAN_UNICO'), count(srvSrc, 'contentLangOf')]);
  ok('E8 lo de los lotes previos sigue (trialLogoIntegracion ×4 · trialBrandPresence · brand_presence)', count(srvSrc, 'trialLogoIntegracion') === 4 && srvSrc.includes('async function trialBrandPresence') && digestSrc.includes('brand_presence'));
  ok('E9 el prompt base de logo-integrado no se tocó (EXACT/natural surface/sticker/corner/band)', srvSrc.includes('use that EXACT artwork') && srvSrc.includes('never redraw it') && srvSrc.includes('natural surface') && srvSrc.includes('never a sticker pasted on top') && srvSrc.includes('never a watermark or stamp in a corner') && srvSrc.includes('never a band across the image'));
}

// ── Utilidades de fixture ──
const JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300030202030202030303030403'
  + '0304040504050404050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0e0e101410131314'
  + '251e22251d28332d2d2d2d2d2d2d2d2d2d2dffc00011080001000103011100021101031101'
  + 'ffc4001500010100000000000000000000000000000000000008ffc4001410010000000000'
  + '000000000000000000000000000000000000ffda000c03010002110311003f00' + '00'.repeat(64) + 'ffd9', 'hex');
const JPEG_B64 = JPEG.toString('base64');
function writeBig(p, fill) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.concat([JPEG, Buffer.alloc(2048, fill)]));
}

// ── §1 Superficies por rubro + prompt (funciones del server, vía boot) ──
function ensureNodePath(tree) {
  try { require.resolve('express', { paths: [tree] }); return; } catch (e) {}
  const cand = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
  if (fs.existsSync(cand)) {
    process.env.NODE_PATH = cand;
    require('module').Module._initPaths();
  }
}
async function waitBoot(base, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(base + '/api/version'); if (r.ok) return await r.json(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
async function bootTree(tree, port, tag) {
  ensureNodePath(tree);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-est-' + tag + '-'));
  process.env.DATA_DIR = tmp;
  process.env.PORT = String(port);
  process.env.BASE_URL = 'http://127.0.0.1:' + port;
  delete process.env.RESEND_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const db = require(path.join(tree, 'db.js'));
  const srv = require(path.join(tree, 'server.js'));
  const ver = await waitBoot('http://127.0.0.1:' + port);
  return { tmp, db, srv, ver };
}

function seccionSuperficies(srv) {
  console.log('§1 superficies por rubro + prompt estratégico');
  ok('P0 el server exporta las funciones del lote', typeof srv.logoSuperficieParaRubro === 'function' && typeof srv.logoIntPromptEstrategico === 'function');
  const cafe = srv.logoSuperficieParaRubro('Cafetería');
  ok('P1 café → superficie de la taza/vaso', cafe.rubro === 'cafe' && cafe.superficie.includes('taza'), cafe);
  ok('P2 el rubro se normaliza (mayúsculas + acentos + texto libre)', srv.logoSuperficieParaRubro('CAFÉ de especialidad').rubro === 'cafe' && srv.logoSuperficieParaRubro('cafeteria').rubro === 'cafe');
  const ropa = srv.logoSuperficieParaRubro('Indumentaria y moda');
  ok('P3 ropa → la etiqueta de la prenda', ropa.rubro === 'ropa' && ropa.superficie.includes('etiqueta'), ropa);
  const perf = srv.logoSuperficieParaRubro('Perfumería y cosmética');
  ok('P4 perfumería → la caja del producto', perf.rubro === 'perfumeria' && perf.superficie.includes('caja'), perf);
  const comida = srv.logoSuperficieParaRubro('Restaurante · gastronomía');
  ok('P5 comida → el packaging del plato', comida.rubro === 'comida' && comida.superficie.includes('packaging'), comida);
  ok('P6 panadería → su propia superficie', srv.logoSuperficieParaRubro('Panadería').rubro === 'panaderia');
  const gen = srv.logoSuperficieParaRubro('Ferretería');
  ok('P7 rubro no reconocido → genérico (pared del local)', gen.rubro === 'generico' && gen.superficie === 'la pared del local', gen);
  ok('P8 sin rubro → genérico, sin romper', srv.logoSuperficieParaRubro('').rubro === 'generico' && srv.logoSuperficieParaRubro(null).rubro === 'generico');
  ok('P9 determinismo: mismo rubro → misma elección', JSON.stringify(srv.logoSuperficieParaRubro('cafeteria')) === JSON.stringify(srv.logoSuperficieParaRubro('cafeteria')));
  const promptCafe = srv.logoIntPromptEstrategico('cafeteria');
  ok('P10 el prompt NOMBRA la superficie del rubro', promptCafe.includes('la taza o el vaso de café'), promptCafe.slice(-320));
  ok('P11 el prompt conserva TODAS las protecciones del base', promptCafe.includes('EXACT artwork') && promptCafe.includes('never redraw it') && promptCafe.includes('natural surface') && promptCafe.includes('never a sticker pasted on top') && promptCafe.includes('never a watermark or stamp in a corner') && promptCafe.includes('never a band across the image'));
  ok('P12 el prompt suma la jerarquía (secundario, nunca sello ni banda)', promptCafe.includes('JERARQUÍA') && promptCafe.includes('secundario') && promptCafe.includes('nunca un sello en una esquina'));
  ok('P13 prompts DISTINTOS por rubro (café ≠ ropa ≠ genérico)', promptCafe !== srv.logoIntPromptEstrategico('ropa') && srv.logoIntPromptEstrategico('ropa').includes('etiqueta colgante') && srv.logoIntPromptEstrategico('').includes('la pared del local'));
}

// ── §2 La puerta de calidad (deep-read, fetch stubeado) ──
async function seccionCalidad() {
  console.log('§2 classifyLogoIntegration');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-est-cal-'));
  const f1 = path.join(stage, 'editada.jpg'); writeBig(f1, 81);
  const photos = [{ key: 'u1', path: f1 }];
  const mkFetch = (results, capture) => async (url, opts) => {
    if (capture) capture.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results }) } }] }) };
  };
  const cap = [];
  const qOk = await deepRead.classifyLogoIntegration({ photos, business: 'Café Rescate', apiKey: 'k', fetchImpl: mkFetch([{ i: 0, legible: true, impreso: true, invade: false, detalle: 'impreso en la taza' }], cap) });
  ok('Q1 integración buena → ok=true con los tres juicios', !!qOk.u1 && qOk.u1.ok === true && qOk.u1.legible === true && qOk.u1.impreso === true && qOk.u1.invade === false, qOk);
  const promptVision = cap.length && cap[0].messages && cap[0].messages[0].content[0].text;
  ok('Q2 la pregunta de visión pide legible/impreso/invade (sticker = no impreso)', typeof promptVision === 'string' && promptVision.includes('legible') && promptVision.includes('impreso') && promptVision.includes('invade') && promptVision.includes('sticker'), String(promptVision).slice(0, 120));
  const qSticker = await deepRead.classifyLogoIntegration({ photos, business: 'X', apiKey: 'k', fetchImpl: mkFetch([{ i: 0, legible: true, impreso: false, invade: false }]) });
  ok('Q3 sticker plano (impreso=false) → ok=false', !!qSticker.u1 && qSticker.u1.ok === false, qSticker);
  const qIlegible = await deepRead.classifyLogoIntegration({ photos, business: 'X', apiKey: 'k', fetchImpl: mkFetch([{ i: 0, legible: false, impreso: true, invade: false }]) });
  ok('Q4 logo ilegible → ok=false', !!qIlegible.u1 && qIlegible.u1.ok === false, qIlegible);
  const qInvade = await deepRead.classifyLogoIntegration({ photos, business: 'X', apiKey: 'k', fetchImpl: mkFetch([{ i: 0, legible: true, impreso: true, invade: true }]) });
  ok('Q5 logo que invade a la estrella → ok=false', !!qInvade.u1 && qInvade.u1.ok === false, qInvade);
  const qSinBool = await deepRead.classifyLogoIntegration({ photos, business: 'X', apiKey: 'k', fetchImpl: mkFetch([{ i: 0, legible: true, impreso: true }]) });
  ok('Q6 respuesta sin los tres booleanos → SIN entrada (fail-closed)', qSinBool && Object.keys(qSinBool).length === 0, qSinBool);
  const qFail = await deepRead.classifyLogoIntegration({ photos, business: 'X', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 500, json: async () => null }) });
  ok('Q7 HTTP caído → {} (jamás un pase)', qFail && Object.keys(qFail).length === 0, qFail);
  const qSinKey = await deepRead.classifyLogoIntegration({ photos, business: 'X', apiKey: '', fetchImpl: mkFetch([{ i: 0, legible: true, impreso: true, invade: false }]) });
  ok('Q8 sin clave → {}', qSinKey && Object.keys(qSinKey).length === 0);
  fs.rmSync(stage, { recursive: true, force: true });
}

// ── §3 El circuito: presencia + calidad en trialLogoIntegracion ──
async function seccionCircuito(rel) {
  console.log('§3 trialLogoIntegracion con la puerta');
  const srv = rel.srv;
  const mediaDir = path.join(rel.tmp, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-est-fix-'));
  const PHOTO_URL = 'https://web.example/fotos/barista.jpg';
  const photoPath = path.join(stage, 'web-barista.jpg'); writeBig(photoPath, 71);
  const logoPath = path.join(mediaDir, 'logo-trial-rescate.png'); writeBig(logoPath, 72);
  const baseOpts = {
    business: 'Café Rescate', logoUrl: 'https://ig.example/logo.png', logoFile: 'logo-trial-rescate.png',
    apiKey: 'test-openai', geminiKey: 'test-gemini', capOk: () => true, rubro: 'cafeteria',
  };
  const noBrandEntries = { [PHOTO_URL]: { item: 'Blend Uno', confianza: 0.9 } };
  const editorCalls = [];
  const editorOk = async (args) => { editorCalls.push(args); return { b64: JPEG_B64, engine: 'nano' }; };
  const visionOk = async () => ({ [PHOTO_URL]: { marca: true, detalle: 'logo integrado' } });
  const visionNo = async () => ({ [PHOTO_URL]: { marca: false, detalle: '' } });

  // (a) Presencia OK + calidad OK → INTEGRADA, con la calidad cacheada
  // y el prompt con la superficie del rubro.
  let calidadCalls = 0;
  const calidadOk = async () => { calidadCalls++; return { [PHOTO_URL]: { legible: true, impreso: true, invade: false, ok: true } }; };
  const rA = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionOk, calidad: calidadOk });
  const eA = rA && rA.entries && rA.entries[PHOTO_URL];
  ok('C1 (a) presencia+calidad OK → INTEGRADA con path', !!eA && eA.status === 'integrada' && !!eA.path && fs.existsSync(eA.path), rA);
  ok('C2 (a) el veredicto de calidad queda CACHEADO en el registro', !!eA && !!eA.calidad && eA.calidad.ok === true && eA.calidad.impreso === true, eA);
  ok('C3 (a) la puerta corrió UNA sola vez (tope de costo)', calidadCalls === 1, calidadCalls);
  const callA = editorCalls[editorCalls.length - 1] || {};
  ok('C4 (a) el editor recibió el prompt ESTRATÉGICO (superficie del rubro nombrada)', typeof callA.prompt === 'string' && callA.prompt.includes('la taza o el vaso de café') && callA.prompt.includes('UBICACIÓN ESTRATÉGICA'), String(callA.prompt).slice(-260));
  ok('C5 (a) el intento sigue exigiendo la vía multirreferencia (genGpt null, engine nano)', callA.genGpt === null && !!eA && eA.engine === 'nano', eA);
  const digestA = cd.buildFromParts({
    business: 'Café Rescate', category: 'cafeteria',
    feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' },
    photoEntries: noBrandEntries, logoIntegracion: rA,
  });
  const specA = demo.buildDemoSpec({
    business: 'Café Rescate', category: 'cafeteria', country: 'AR', tone: '',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: '/media/perfil.jpg', feedRegister: null,
    extraPhotos: [{ url: PHOTO_URL, path: photoPath, temas: ['marca'] }], digest: digestA, lang: 'es', trialNoStock: true,
  });
  ok('C6 (a) el spec entrega la editada aprobada por AMBAS puertas', (specA.specPosts || []).map((p) => p.photo).includes(eA.path), (specA.specPosts || []).map((p) => p.photo));

  // (b) Presencia OK + calidad STICKER → sin-calidad: no se entrega.
  calidadCalls = 0;
  const calidadSticker = async () => { calidadCalls++; return { [PHOTO_URL]: { legible: true, impreso: false, invade: false, ok: false } }; };
  const rB = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionOk, calidad: calidadSticker });
  const eB = rB && rB.entries && rB.entries[PHOTO_URL];
  ok('C7 (b) sticker → sin-calidad SIN path (la editada no se entrega)', !!eB && eB.status === 'sin-calidad' && !eB.path, rB);
  ok('C8 (b) el porqué queda en el registro (calidad.impreso=false)', !!eB && !!eB.calidad && eB.calidad.impreso === false && eB.calidad.ok === false, eB);
  const digestB = cd.buildFromParts({
    business: 'Café Rescate', category: 'cafeteria',
    feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' },
    photoEntries: noBrandEntries, logoIntegracion: rB,
  });
  ok('C9 (b) el fundamento adopta sin-calidad CON su calidad saneada', !!digestB.logo_integrado && digestB.logo_integrado.entries[PHOTO_URL].status === 'sin-calidad' && digestB.logo_integrado.entries[PHOTO_URL].calidad.impreso === false, digestB.logo_integrado);
  const specB = demo.buildDemoSpec({
    business: 'Café Rescate', category: 'cafeteria', country: 'AR', tone: '',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: '/media/perfil.jpg', feedRegister: null,
    extraPhotos: [{ url: PHOTO_URL, path: photoPath, temas: ['marca'] }], digest: digestB, lang: 'es', trialNoStock: true,
  });
  ok('C10 (b) el spec NO usa la editada rechazada por calidad', !(specB.specPosts || []).some((p) => typeof p.photo === 'string' && path.basename(p.photo).startsWith('logo-int-')), (specB.specPosts || []).map((p) => p.photo));

  // (c) Presencia OK + calidad CAÍDA (error / sin veredicto) → fail-closed.
  const calidadRota = async () => { throw new Error('vision caida'); };
  const rC = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionOk, calidad: calidadRota });
  ok('C11 (c) puerta caída → sin-calidad (fail-closed, jamás un pase)', !!rC && rC.entries[PHOTO_URL].status === 'sin-calidad' && !rC.entries[PHOTO_URL].path, rC);
  const calidadVacia = async () => ({});
  const rC2 = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionOk, calidad: calidadVacia });
  ok('C12 (c2) puerta sin veredicto → sin-calidad', !!rC2 && rC2.entries[PHOTO_URL].status === 'sin-calidad', rC2);

  // (d) Sin presencia → sin-marca y la puerta NO corre (costo).
  calidadCalls = 0;
  const rD = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionNo, calidad: calidadOk });
  ok('C13 (d) sin presencia → sin-marca y la puerta de calidad NO se paga', !!rD && rD.entries[PHOTO_URL].status === 'sin-marca' && calidadCalls === 0, [rD, calidadCalls]);

  // (e) Engine equivocado → sin-edicion, la puerta tampoco corre.
  calidadCalls = 0;
  const editorGpt = async () => ({ b64: JPEG_B64, engine: 'gpt' });
  const rE = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorGpt, vision: visionOk, calidad: calidadOk });
  ok('C14 (e) engine gpt → sin-edicion (el logo no viajó), sin puerta', !!rE && rE.entries[PHOTO_URL].status === 'sin-edicion' && calidadCalls === 0, rE);

  // (f) Saneado extendido: sin-calidad y calidad viajan; lo inventado no.
  const sucio = cd.sanitizeLogoIntegrado({
    'https://x/1': { status: 'sin-calidad', calidad: { legible: true, impreso: false, invade: false, ok: false }, path: '/media/no.jpg', at: 5 },
    'https://x/2': { status: 'integrada', path: '/media/ok.jpg', calidad: { legible: true, impreso: true, invade: false, ok: true } },
    'https://x/3': { status: 'aprobada', calidad: { ok: true } },
    'https://x/4': { status: 'sin-calidad', calidad: { legible: 'si' } },
  });
  ok('C15 saneado: sin-calidad conserva calidad y NO conserva path; inventado fuera', !!sucio['https://x/1'] && !sucio['https://x/1'].path && sucio['https://x/1'].calidad.impreso === false && !!sucio['https://x/2'] && !!sucio['https://x/2'].path && !sucio['https://x/3'] && !!sucio['https://x/4'] && !sucio['https://x/4'].calidad, sucio);

  fs.rmSync(stage, { recursive: true, force: true });
}

// ── §4 digest.logo: extracción en el estudio y degradación ──
function seccionDigestLogo() {
  console.log('§4 digest.logo');
  const dCon = cd.buildFromParts({
    business: 'Café Rescate', category: 'cafeteria',
    feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' },
  });
  ok('L1 con foto de perfil, el estudio guarda el asset (url + fuente ig)', !!dCon.logo && dCon.logo.url === 'https://ig.example/logo.png' && dCon.logo.fuente === 'ig' && dCon.logo_url === 'https://ig.example/logo.png', dCon.logo);
  const dSin = cd.buildFromParts({ business: 'Sin Logo', category: 'otros', feed: { pic: '', captions: [], bio: '', name: 'Sin Logo', handle: 'sinlogo' } });
  ok('L2 sin logo alcanzable → digest.logo null (degradación honesta)', dSin.logo === null, dSin.logo);
  const dAsset = cd.buildFromParts({
    business: 'Web Logo', category: 'ropa',
    feed: { pic: 'https://ig.example/otra.png', captions: [], bio: '', name: 'Web Logo', handle: 'weblogo' },
    logoAsset: { url: 'https://web.example/logo.png', file: 'logo-web.png', fuente: 'web', at: 123 },
  });
  ok('L3 el asset resuelto por el llamador se adopta tal cual (fuente web + archivo)', !!dAsset.logo && dAsset.logo.url === 'https://web.example/logo.png' && dAsset.logo.file === 'logo-web.png' && dAsset.logo.fuente === 'web', dAsset.logo);
  ok('L4 sanitizeDigestLogo: path traversal no pasa como file; url no-https sola no alcanza', (() => { const s = cd.sanitizeDigestLogo({ url: 'http://x/logo.png', file: '../evil.png' }); return s === null; })() && (() => { const s2 = cd.sanitizeDigestLogo({ url: 'https://x/logo.png', file: 'a/b.png' }); return !!s2 && s2.file === ''; })());
  ok('L5 fuente inventada cae a ig; sin url ni file → null', (() => { const s = cd.sanitizeDigestLogo({ url: 'https://x/l.png', fuente: 'magia' }); return !!s && s.fuente === 'ig'; })() && cd.sanitizeDigestLogo({}) === null && cd.sanitizeDigestLogo(null) === null);
  ok('L6 digestLogoOf deriva en digest viejos (solo logo_url/logo_file)', (() => { const d = cd.digestLogoOf({ logo_url: 'https://ig.example/viejo.png', logo_file: 'logo-1.png' }); return !!d && d.url === 'https://ig.example/viejo.png' && d.file === 'logo-1.png'; })() && cd.digestLogoOf({}) === null && cd.digestLogoOf(dCon).url === 'https://ig.example/logo.png');
  const stored = { ...dCon, logo_file: 'logo-9.png', logo: { url: 'https://ig.example/logo.png', file: 'logo-9.png', fuente: 'ig', at: 1 } };
  const freshSinLogo = cd.buildFromParts({ business: 'Café Rescate', category: 'cafeteria', feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' } });
  const merged = cd.applyDeepBlocks(stored, freshSinLogo);
  ok('L7 el refresco conserva el archivo del asset cuando la URL no cambió', !!merged.logo && merged.logo.file === 'logo-9.png', merged.logo);
}

// ── §5 Control sobre la base de fusión (v992 + C7 + logo-integrado) ──
function seccionControl() {
  console.log('§5 control sobre la base de fusión');
  if (!HAS_FUSION) { ok('K0 base de fusión presente para el control', false); return; }
  const fSrv = fs.readFileSync(path.join(FUSION, 'server.js'), 'utf8');
  const fDeep = fs.readFileSync(path.join(FUSION, 'deep-read.js'), 'utf8');
  ok('K1 (control) la fusión NO tiene superficies por rubro ni prompt estratégico', !fSrv.includes('logoSuperficieParaRubro') && !fSrv.includes('UBICACIÓN ESTRATÉGICA'));
  ok('K2 (control) la fusión NO tiene puerta de calidad (la presencia sola entregaba)', !fSrv.includes('classifyLogoIntegration') && !fDeep.includes('classifyLogoIntegration') && !fSrv.includes("'sin-calidad'"));
  const fCd = require(path.join(FUSION, 'client-digest.js'));
  const dF = fCd.buildFromParts({ business: 'Café Rescate', category: 'cafeteria', feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' } });
  ok('K3 (control) la fusión NO guarda el asset estructurado (digest.logo ausente)', !('logo' in dF) || dF.logo == null, dF.logo);
}

(async () => {
  console.log('LOTE LOGO-ESTRATÉGICO — suite');
  const { execSync } = require('child_process');
  try { execSync("ss -ltn | grep -E ':(18799) '", { stdio: 'pipe' }); console.log('  ! puerto 18799 ocupado — el boot puede fallar'); } catch (e) { /* libre */ }
  const rel = await bootTree(ROOT, 18799, 'rel');
  ok('B1 el server del release bootea y sirve v1057 [RE-PIN PREPARADOR: provisorio del builder v1001]', !!rel.ver && rel.ver.build === '20261105-v1057', rel.ver);
  seccionSuperficies(rel.srv);
  await seccionCalidad();
  await seccionCircuito(rel);
  seccionDigestLogo();
  seccionControl();
  console.log(`\nRESULTADO: ${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(2); });
