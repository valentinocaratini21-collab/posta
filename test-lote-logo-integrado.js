#!/usr/bin/env node
// LOTE LOGO-INTEGRADO-EN-LA-FOTO (pieza mayor fuera del paquete
// correctivo; regla de Valentino desde Philz): toda imagen lleva algo
// del negocio dentro de la escena y el cliente tiene que sentir «esto
// es mío» — «hubiese quedado increíble que en la pared esté el logo de
// la marca» sobre la foto real de un barista sin nada del negocio.
// El correctivo-7 FRENA la foto real sin marca; este lote intenta
// RESCATARLA antes: cuando una pieza de la prueba va a usar una foto
// real que NO muestra el negocio, UN intento de integración en la
// INGESTA — el editor multirreferencia (Nano: el único de la casa que
// recibe varias imágenes) integra el LOGO REAL (el archivo, jamás
// redibujado) en una superficie natural de la escena — y el chequeo de
// presencia decide: marca verificada → se entrega la editada; si no →
// comportamiento vigente (con el 7: póster). Un intento por foto,
// cacheado en el fundamento (digest.logo_integrado).
// Uso: node test-lote-logo-integrado.js (desde la raíz del scratch o
// desde release/ — resuelve los módulos solo; bootea el server del
// release con DATA_DIR temporal en un puerto libre).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const HERE = __dirname;
const SCRATCH = fs.existsSync(path.join(HERE, 'release')) ? HERE : path.dirname(HERE);
const ROOT = fs.existsSync(path.join(HERE, 'server.js')) ? HERE : path.join(SCRATCH, 'release');
const BASE = path.join(SCRATCH, 'base-v980');
const HAS_BASE = fs.existsSync(path.join(BASE, 'demo.js'));

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
const demoSrc = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const digestSrc = fs.readFileSync(path.join(ROOT, 'client-digest.js'), 'utf8');

// ── §0 Estáticos: el rescate existe, el registro existe, censos ──
{
  ok('S1 server intenta la integración en la ingesta (trialLogoIntegracion)', srvSrc.includes('async function trialLogoIntegracion'));
  ok('S2 el intento usa SOLO la vía multirreferencia (genGpt: null — el logo tiene que VIAJAR)', srvSrc.includes("genGpt: null, refNote: LOGO_INT_REF_NOTE"));
  ok('S3 el prompt protege el logo real (EXACT artwork / never redraw)', srvSrc.includes('use that EXACT artwork') && srvSrc.includes('never redraw it'));
  ok('S4 el prompt prohíbe sticker/esquina/banda', srvSrc.includes('never a sticker pasted on top') && srvSrc.includes('never a watermark or stamp in a corner') && srvSrc.includes('never a band across the image'));
  ok('S5 el registro viaja al fundamento (buildTrialDigest → logoIntegracion)', srvSrc.includes('logoIntegracion: (deep && deep.logoIntegracion) || null'));
  ok('S6 el digest adopta el registro (logo_integrado + sanitize + lector)', digestSrc.includes('logo_integrado: null') && digestSrc.includes('function sanitizeLogoIntegrado') && digestSrc.includes('function logoIntegradoOf'));
  ok('S7 demo usa la foto editada cuando el rescate verificó (logoIntegradoOf)', demoSrc.includes('clientDigest.logoIntegradoOf(digest, w.url)') && demoSrc.includes('w.logo_integrado = true'));
  ok('S8 deep-read exporta el chequeo de presencia (contrato del foto-gate)', typeof deepRead.classifyBrandPresence === 'function');
  ok('S9 BUILD del lote (re-pin del preparador: el provisorio v997 del builder → v1056 definitivo)', srvSrc.includes("const BUILD_ID = '20261105-v1056'"));
  ok('S10 censo ajeno: monedaCuentaAds ×4', count(srvSrc, 'monedaCuentaAds') === 4, count(srvSrc, 'monedaCuentaAds'));
  ok('S11 censo ajeno: PLAN_UNICO ×11', count(srvSrc, 'PLAN_UNICO') === 11, count(srvSrc, 'PLAN_UNICO'));
  ok('S12 censo ajeno: contentLangOf ×14 (re-pin del preparador: ×4 era sobre v980; v922 lo extendió en la base viva)', count(srvSrc, 'contentLangOf') === 14, count(srvSrc, 'contentLangOf'));
  ok('S13 censo ajeno: esPosteoDePruebaDelDueno ×3 (re-pin del preparador: en v980 era ×0; C2 lo aterrizó en v984 y vive en la base)', count(srvSrc, 'esPosteoDePruebaDelDueno') === 3, count(srvSrc, 'esPosteoDePruebaDelDueno'));
  ok('S14 censo ajeno: trial_sin_retencion ×1 (re-pin del preparador: en v980 era ×0; C1 lo aterrizó en v983)', count(srvSrc, 'trial_sin_retencion') === 1, count(srvSrc, 'trial_sin_retencion'));
  ok('S15 censo ajeno: igInterruptedAt ×10 (re-pin del preparador: en v980 era ×0; C6 lo aterrizó y vive en la base)', count(srvSrc, 'igInterruptedAt') === 10, count(srvSrc, 'igInterruptedAt'));
}

// ── Utilidades de fixture ──
const JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300030202030202030303030403'
  + '0304040504050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0e0e101410131314'
  + '251e22251d28332d2d2d2d2d2d2d2d2d2d2dffc00011080001000103011100021101031101'
  + 'ffc4001500010100000000000000000000000000000000000008ffc4001410010000000000'
  + '000000000000000000000000000000000000ffda000c03010002110311003f00' + '00'.repeat(64) + 'ffd9', 'hex');
const JPEG_B64 = JPEG.toString('base64');
function writeBig(p, fill) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.concat([JPEG, Buffer.alloc(2048, fill)]));
}

// ── §1 La visión de presencia (deep-read, fetch stubeado) ──
async function seccionVision() {
  console.log('§1 classifyBrandPresence');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-int-vis-'));
  const f1 = path.join(stage, 'a.jpg'); writeBig(f1, 65);
  const f2 = path.join(stage, 'b.jpg'); writeBig(f2, 66);
  const photos = [{ key: 'u1', path: f1 }, { key: 'u2', path: f2 }];
  const fetchOk = async () => ({
    ok: true, status: 200,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [{ i: 0, marca: true, detalle: 'logo en la pared' }, { i: 1, marca: false, detalle: '' }] }) } }] }),
  });
  const v = await deepRead.classifyBrandPresence({ photos, business: 'Café Rescate', apiKey: 'k', fetchImpl: fetchOk });
  ok('V1 veredictos para TODAS las fotos (el false también es veredicto)', v.u1 && v.u1.marca === true && v.u2 && v.u2.marca === false, v);
  ok('V2 el detalle viaja saneado', v.u1.detalle === 'logo en la pared', v.u1);
  const vFail = await deepRead.classifyBrandPresence({ photos, business: 'X', apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 500, json: async () => null }) });
  ok('V3 HTTP caído → {} (sin verificar, jamás un pase)', vFail && Object.keys(vFail).length === 0, vFail);
  const vSinBool = await deepRead.classifyBrandPresence({
    photos, business: 'X', apiKey: 'k',
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [{ i: 0, detalle: 'sin booleano' }] }) } }] }) }),
  });
  ok('V4 respuesta sin booleano → sin entrada', vSinBool && Object.keys(vSinBool).length === 0, vSinBool);
  const vSinKey = await deepRead.classifyBrandPresence({ photos, business: 'X', apiKey: '', fetchImpl: fetchOk });
  ok('V5 sin clave → {}', vSinKey && Object.keys(vSinKey).length === 0);
  fs.rmSync(stage, { recursive: true, force: true });
}

// ── Boot in-process (patrón de la casa) para §2/§4 ──
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-int-' + tag + '-'));
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

// ── §2 El circuito del rescate (helper con editor/visión stubeados) ──
async function seccionRescate() {
  console.log('§2 trialLogoIntegracion + spec');
  const ss = await import('child_process').then(() => null).catch(() => null);
  void ss;
  const { execSync } = require('child_process');
  try { execSync("ss -ltn | grep -E ':(18796|18795) ' ", { stdio: 'pipe' }); console.log('  ! puertos 18795/18796 ocupados — la §2/§4 puede fallar'); } catch (e) { /* libres */ }
  const rel = await bootTree(ROOT, 18796, 'rel');
  ok('R0 el server del release bootea y sirve v1056 (re-pin del preparador)', !!rel.ver && rel.ver.build === '20261105-v1056', rel.ver);
  const srv = rel.srv;
  ok('R0b el server exporta trialLogoIntegracion', typeof srv.trialLogoIntegracion === 'function');

  const mediaDir = path.join(rel.tmp, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-int-fix-'));
  const PHOTO_URL = 'https://web.example/fotos/barista.jpg';
  const photoPath = path.join(stage, 'web-barista.jpg'); writeBig(photoPath, 71);
  const logoPath = path.join(mediaDir, 'logo-trial-rescate.png'); writeBig(logoPath, 72);
  const baseOpts = {
    business: 'Café Rescate', logoUrl: 'https://ig.example/logo.png', logoFile: 'logo-trial-rescate.png',
    apiKey: 'test-openai', geminiKey: 'test-gemini', capOk: () => true,
  };
  const noBrandEntries = { [PHOTO_URL]: { item: 'Blend Uno', confianza: 0.9 } };

  // (a) Foto sin marca + integración que el chequeo APRUEBA → se
  // entrega la editada; el editor recibió foto + logo real y el prompt
  // de integración.
  let editorCalls = [];
  const editorOk = async (args) => { editorCalls.push(args); return { b64: JPEG_B64, engine: 'nano' }; };
  const visionOk = async () => ({ [PHOTO_URL]: { marca: true, detalle: 'logo en la pared' } });
  // (PIN DEL PREPARADOR DE LOGO-ESTRATÉGICO, según la nota del builder
  // de ese lote: con la puerta de calidad viva, el fixture §2(a) debe
  // inyectar la costura `calidad` aprobada; sin ella la puerta real no
  // devuelve veredicto en sandbox y el intento cae 'sin-calidad'
  // fail-closed — el comportamiento nuevo correcto, no el de este §.)
  const calidadOk = async () => ({ [PHOTO_URL]: { legible: true, impreso: true, invade: false, ok: true } });
  const rA = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionOk, calidad: calidadOk });
  const eA = rA && rA.entries && rA.entries[PHOTO_URL];
  ok('A1 (a) el intento se registra como INTEGRADA', !!eA && eA.status === 'integrada', rA);
  ok('A2 (a) la foto editada quedó escrita en el volumen de media', !!eA && !!eA.path && fs.existsSync(eA.path) && path.basename(eA.path).startsWith('logo-int-'), eA);
  ok('A3 (a) el editor se llamó UNA vez', editorCalls.length === 1, editorCalls.length);
  const call = editorCalls[0] || {};
  ok('A4 (a) al editor viajaron la FOTO y el LOGO REAL (en ese orden)', Array.isArray(call.refs) && call.refs[0] === photoPath && call.refs[1] === logoPath, call.refs);
  ok('A5 (a) el prompt ordena integrar el logo EXACTO sin redibujarlo', typeof call.prompt === 'string' && call.prompt.includes('EXACT artwork') && call.prompt.includes('never redraw it') && call.prompt.includes('natural surface'), String(call.prompt).slice(0, 120));
  ok('A6 (a) la nota de roles declara la foto como escena y el logo como arte intocable', typeof call.refNote === 'string' && call.refNote.includes('Image 1') && call.refNote.includes('Image 2') && call.refNote.includes('unaltered'), call.refNote);
  ok('A7 (a) el intento NO usa la vía de una imagen (genGpt null)', call.genGpt === null);
  // El fundamento adopta el registro y el spec USA la editada.
  const digestA = cd.buildFromParts({
    business: 'Café Rescate', category: 'cafeteria',
    feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' },
    photoEntries: noBrandEntries, logoIntegracion: rA,
  });
  ok('A8 (a) el fundamento adopta el registro (logo_integrado)', !!digestA.logo_integrado && digestA.logo_integrado.entries[PHOTO_URL].status === 'integrada', digestA.logo_integrado);
  const specA = demo.buildDemoSpec({
    business: 'Café Rescate', category: 'cafeteria', country: 'AR', tone: '',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: '/media/perfil.jpg', feedRegister: null,
    extraPhotos: [{ url: PHOTO_URL, path: photoPath, temas: ['marca'] }], digest: digestA, lang: 'es', trialNoStock: true,
  });
  const fotosA = (specA.specPosts || []).map((p) => p.photo);
  ok('A9 (a) el spec entrega la foto EDITADA (no la original sin marca)', fotosA.includes(eA.path) && !fotosA.includes(photoPath), fotosA);

  // (b) Integración que el chequeo REPRUEBA → sin rescate: el spec
  // sigue con la foto original (comportamiento de hoy; con el
  // correctivo-7 encima, el gate la frena a póster).
  editorCalls = [];
  const visionNo = async () => ({ [PHOTO_URL]: { marca: false, detalle: '' } });
  const rB = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionNo });
  const eB = rB && rB.entries && rB.entries[PHOTO_URL];
  ok('B1 (b) el intento queda registrado como sin-marca (sin path)', !!eB && eB.status === 'sin-marca' && !eB.path, rB);
  const digestB = cd.buildFromParts({
    business: 'Café Rescate', category: 'cafeteria',
    feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' },
    photoEntries: noBrandEntries, logoIntegracion: rB,
  });
  const specB = demo.buildDemoSpec({
    business: 'Café Rescate', category: 'cafeteria', country: 'AR', tone: '',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: '/media/perfil.jpg', feedRegister: null,
    extraPhotos: [{ url: PHOTO_URL, path: photoPath, temas: ['marca'] }], digest: digestB, lang: 'es', trialNoStock: true,
  });
  const fotosB = (specB.specPosts || []).map((p) => p.photo);
  ok('B2 (b) sin veredicto de marca el spec NO usa ninguna editada y la original tampoco se entrega como foto de pieza (re-pin del preparador: en v980 seguía la original; en la base viva manda el gate del correctivo-7, que frena la foto real sin marca verificada)', !fotosB.some((f) => typeof f === 'string' && path.basename(f).startsWith('logo-int-')) && !fotosB.includes(photoPath), fotosB);

  // (b2) La vía equivocada: si el b64 viniera de gpt (una imagen), el
  // logo no viajó → sin-edicion, jamás se entrega.
  const editorGpt = async (args) => { editorCalls.push(args); return { b64: JPEG_B64, engine: 'gpt' }; };
  const rB2 = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorGpt, vision: visionOk });
  ok('B3 (b2) engine gpt → sin-edicion (el logo no viajó, no se entrega)', !!rB2 && rB2.entries[PHOTO_URL].status === 'sin-edicion' && !rB2.entries[PHOTO_URL].path, rB2);

  // (c) Foto CON marca → ni se intenta.
  editorCalls = [];
  const rC = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], { [PHOTO_URL]: { item: 'Blend Uno', confianza: 0.9, marca: true } }, { ...baseOpts, editor: editorOk, vision: visionOk });
  ok('C1 (c) foto con marca verificada → sin intento (editor intacto, sin registro)', rC === null && editorCalls.length === 0, rC);

  // (d) Un solo intento por foto: con el registro previo, no se repite.
  editorCalls = [];
  const rD = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, editor: editorOk, vision: visionOk, previo: rA.entries });
  ok('D1 (d) foto ya intentada (caché en el fundamento) → no se reintenta', rD === null && editorCalls.length === 0, rD);

  // (e) Sin logo real disponible → no hay intento.
  editorCalls = [];
  const rE = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, logoUrl: '', logoFile: '', editor: editorOk, vision: visionOk });
  ok('E1 (e) sin logo real → no hay intento ni registro', rE === null && editorCalls.length === 0, rE);
  // (e2) Sin clave del editor multirreferencia → intento no viable.
  const rE2 = await srv.trialLogoIntegracion([{ url: PHOTO_URL, path: photoPath }], noBrandEntries, { ...baseOpts, geminiKey: '', editor: editorOk, vision: visionOk });
  ok('E2 (e2) sin transporte multirreferencia → no se intenta (declarado no viable)', rE2 === null && editorCalls.length === 0, rE2);

  // Saneado del registro: statuses inventados y paths sin integrada no pasan.
  const sucio = cd.sanitizeLogoIntegrado({
    'https://x/1': { status: 'integrada', path: '/media/logo-int-x.jpg', engine: 'nano', at: 5 },
    'https://x/2': { status: 'aprobada', path: '/media/y.jpg' },
    'https://x/3': { status: 'integrada' },
    'https://x/4': { status: 'sin-marca', path: '/media/z.jpg' },
  });
  ok('G1 el saneado conserva solo el contrato (integrada con path; sin-marca sin path)', !!sucio['https://x/1'] && !sucio['https://x/2'] && !sucio['https://x/3'] && !!sucio['https://x/4'] && !sucio['https://x/4'].path, sucio);

  fs.rmSync(stage, { recursive: true, force: true });
  return rel;
}

// ── §3 Control sobre la BASE v980: el rescate no existe ──
async function seccionBase(rel) {
  console.log('§3 control sobre la base');
  if (!HAS_BASE) { ok('X0 base presente para el control', false); return; }
  const baseSrvSrc = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
  ok('X1 (control) en la base no hay intento de integración', !baseSrvSrc.includes('trialLogoIntegracion') && !baseSrvSrc.includes('logo_integrado'));
  const bas = await bootTree(BASE, 18795, 'base');
  ok('X2 (control) el server de la base bootea en v980', !!bas.ver && bas.ver.build === '20261105-v980', bas.ver);
  ok('X3 (control) la base no exporta el helper', typeof bas.srv.trialLogoIntegracion !== 'function');
  const baseCd = require(path.join(BASE, 'client-digest.js'));
  const dBase = baseCd.buildFromParts({
    business: 'Café Rescate', category: 'cafeteria',
    feed: { pic: 'https://ig.example/logo.png', captions: [], bio: '', name: 'Café Rescate', handle: 'cafe.rescate' },
    logoIntegracion: { entries: { 'https://web.example/fotos/barista.jpg': { status: 'integrada', path: '/media/logo-int-x.jpg' } } },
  });
  ok('X4 (control) la base ignora el registro (sin logo_integrado en su fundamento)', !dBase.logo_integrado, dBase.logo_integrado);
  void rel;
}

(async () => {
  console.log('LOTE LOGO-INTEGRADO — suite');
  await seccionVision();
  const rel = await seccionRescate();
  await seccionBase(rel);
  console.log(`\nRESULTADO: ${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(2); });
