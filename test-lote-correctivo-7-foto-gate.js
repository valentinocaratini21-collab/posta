#!/usr/bin/env node
// LOTE CORRECTIVO-7 FOTO-GATE-MARCA (paquete correctivo, Valentino 12/11):
// la regla vigente desde Philz — TODA imagen lleva algo DEL negocio
// dentro de la escena — no tenía puerta para la foto REAL reutilizada:
// Hungry Ghost entregó la foto de un barista (buenísima) sin nada del
// negocio en cuadro y ninguna puerta lo frenó.
// El lote: (1) GATE — una foto real solo se entrega como imagen de una
// pieza de la prueba si la visión VERIFICÓ presencia del negocio
// (logo, producto con nombre, packaging, frente); sin marca o SIN
// VERIFICAR = no-pase, el slot cae al póster de marca de siempre.
// (2) PREFERENCIA — albumRefsForPiece ordena primero, dentro de cada
// tier, las fotos con presencia verificada. (3) El veredicto se computa
// UNA vez en la ingesta de la prueba y queda CACHEADO en el fundamento
// (digest.brand_presence): el spec y las piezas lo leen, no lo re-pagan.
// Uso: node test-lote-correctivo-7-foto-gate.js (desde la raíz del
// scratch o desde release/ — resuelve los módulos solo; bootea el
// server del release con DATA_DIR temporal en un puerto libre).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const HERE = __dirname;
const SCRATCH = fs.existsSync(path.join(HERE, 'release')) ? HERE : path.dirname(HERE);
const ROOT = fs.existsSync(path.join(HERE, 'server.js')) ? HERE : path.join(SCRATCH, 'release');
const BASE = path.join(SCRATCH, 'base-v995');
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

// ── §0 Estáticos: el gate existe, el registro existe, censos ajenos ──
{
  ok('S1 server computa presencia en la ingesta (trialBrandPresence)', srvSrc.includes('async function trialBrandPresence'));
  ok('S2 el no-pase por visión caída queda REGISTRADO ([foto-gate])', srvSrc.includes('[foto-gate]') && srvSrc.includes('SIN VERIFICAR'));
  ok('S3 el veredicto viaja al fundamento (buildTrialDigest → brandPresence)', srvSrc.includes('brandPresence: (deep && deep.brandPresence) || null'));
  ok('S4 demo exige presencia verificada en la prueba (marca_verdict)', demoSrc.includes('ctx.trialNoStock && w.marca_verdict !== true'));
  ok('S5 BUILD provisorio del lote', srvSrc.includes("const BUILD_ID = '20261105-v996'"));
  ok('S6 censo ajeno: monedaCuentaAds ×4', count(srvSrc, 'monedaCuentaAds') === 4, count(srvSrc, 'monedaCuentaAds'));
  ok('S7 censo ajeno: PLAN_UNICO ×11', count(srvSrc, 'PLAN_UNICO') === 11, count(srvSrc, 'PLAN_UNICO'));
  ok('S8 censo ajeno: contentLangOf ×6 (C3 en vivo)', count(srvSrc, 'contentLangOf') === 6, count(srvSrc, 'contentLangOf'));
  ok('S9 censo vivo: esPosteoDePruebaDelDueno ×3 (C2 en vivo, intacto)', count(srvSrc, 'esPosteoDePruebaDelDueno') === 3);
  ok('S10 censo vivo: trial_sin_retencion ×1 (C1 en vivo, intacto)', count(srvSrc, 'trial_sin_retencion') === 1);
  ok('S11 censo vivo: igInterruptedAt ×10 (C6 en vivo, intacto)', count(srvSrc, 'igInterruptedAt') === 10);
}

// ── §1 La visión de presencia (deep-read, fetch stubeado) ──
const STAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'foto-gate-'));
const JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300030202030202030303030403'
  + '0304050805050404050a070706080c0a0c0c0b0a0b0b0d0e12100d0e110e0b0b101610111314'
  + '1515150c0f1718181614121a1514161a141a141a141affdb0043010304040504050905050914'
  + '0d0b0d141414141414141414141414141414141414141414141414141414141414141414'
  + '141414141414141414ffc0001108000100010301220002'
  + '1101031101ffc40014000100000000000000000000000000000000000008ffc400141001'
  + '00000000000000000000000000000000000008ffc400140101000000000000000000000000'
  + '0000000000ffc40014110100000000000000000000000000000000000008ffda000c0301'
  + '0002110311003f003f00bfffd9', 'hex');
const F1 = path.join(STAGE, 'barista.jpg'); fs.writeFileSync(F1, Buffer.concat([JPEG, Buffer.alloc(1200, 65)]));
const F2 = path.join(STAGE, 'bolsa.jpg'); fs.writeFileSync(F2, Buffer.concat([JPEG, Buffer.alloc(1200, 66)]));
const visionStub = (results) => {
  const cap = { calls: 0, body: null };
  const fn = async (url, opts) => {
    cap.calls++; cap.body = opts && opts.body;
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results }) } }] }) };
  };
  fn.cap = cap;
  return fn;
};
async function seccionVision() {
  const stub = visionStub([{ i: 0, marca: false, detalle: 'barista sirviendo, sin marca visible' }, { i: 1, marca: true, detalle: 'bolsa con el logo del negocio' }]);
  const v = await deepRead.classifyBrandPresence({ photos: [{ key: 'u1', path: F1 }, { key: 'u2', path: F2 }], business: 'Hungry Ghost Coffee', items: ['Fresh Good Batch'], apiKey: 'sk-test', fetchImpl: stub });
  ok('V1 veredicto para TODAS las fotos respondidas (también las sin producto)', !!v.u1 && !!v.u2, v);
  ok('V2 el false ES veredicto (la visión la vio y el negocio no está)', v.u1 && v.u1.marca === false, v.u1);
  ok('V3 el true llega con su detalle', v.u2 && v.u2.marca === true && /logo/.test(v.u2.detalle || ''), v.u2);
  ok('V4 una sola llamada con las dos fotos (gpt-4o-mini, la infra de siempre)', stub.cap.calls === 1 && count(stub.cap.body, 'data:image/jpeg;base64') === 2 && stub.cap.body.includes('gpt-4o-mini'), { calls: stub.cap.calls });
  const vFail = await deepRead.classifyBrandPresence({ photos: [{ key: 'u1', path: F1 }], apiKey: 'sk-test', fetchImpl: async () => { throw new Error('red caída'); } });
  ok('V5 visión caída → {} (SIN VERIFICAR, jamás un pase)', vFail && Object.keys(vFail).length === 0, vFail);
  const vHttp = await deepRead.classifyBrandPresence({ photos: [{ key: 'u1', path: F1 }], apiKey: 'sk-test', fetchImpl: async () => ({ ok: false, json: async () => ({}) }) });
  ok('V6 HTTP no-ok → {} (sin verificar)', vHttp && Object.keys(vHttp).length === 0);
  const vKey = await deepRead.classifyBrandPresence({ photos: [{ key: 'u1', path: F1 }], apiKey: '', fetchImpl: stub });
  ok('V7 sin clave → {} (sin verificar)', vKey && Object.keys(vKey).length === 0);
  const vBad = await deepRead.classifyBrandPresence({ photos: [{ key: 'u1', path: F1 }], apiKey: 'sk-test', fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'no es json' } }] }) }) });
  ok('V8 respuesta ilegible → {} (sin verificar)', vBad && Object.keys(vBad).length === 0);
}

// ── §2 El veredicto en el fundamento (client-digest) ──
function seccionDigest() {
  const dMap = { photo_map: { entries: { uBag: { item: 'Tesora', confianza: 0.9, marca: true }, uCup: { item: 'Tesora', confianza: 0.9 } }, at: 'x' } };
  ok('D1 photo_map con marca:true → presencia true', cd.brandPresenceOf(dMap, 'uBag') === true);
  ok('D2 photo_map sin marca y sin veredicto → null (sin verificar, NO false)', cd.brandPresenceOf(dMap, 'uCup') === null);
  const dPres = { brand_presence: { entries: { u1: { marca: false }, u2: { marca: true } }, at: 'x' } };
  ok('D3 brand_presence false → false', cd.brandPresenceOf(dPres, 'u1') === false);
  ok('D4 brand_presence true → true', cd.brandPresenceOf(dPres, 'u2') === true);
  ok('D5 foto jamás chequeada → null', cd.brandPresenceOf(dPres, 'uX') === null);
  ok('D6 digest vacío → null', cd.brandPresenceOf(null, 'u1') === null);
  const built = cd.buildFromParts({ business: 'Café Gate', category: 'cafeteria', brandPresence: { u1: { marca: false, detalle: 'sin marca' }, u2: { marca: true }, u3: { detalle: 'sin booleano' } } });
  ok('D7 buildFromParts adopta los veredictos (la caché nace con el fundamento)', !!built.brand_presence && built.brand_presence.entries.u1.marca === false && built.brand_presence.entries.u2.marca === true, built.brand_presence);
  ok('D8 entrada sin booleano no es veredicto (se descarta)', !(built.brand_presence && built.brand_presence.entries.u3));
  ok('D9 el lector lee la caché adoptada', cd.brandPresenceOf(built, 'u1') === false && cd.brandPresenceOf(built, 'u2') === true);
  const merged = cd.applyDeepBlocks(
    { brand_presence: { entries: { a: { marca: true }, b: { marca: false } }, at: '1' } },
    { brand_presence: { entries: { b: { marca: true }, c: { marca: false } }, at: '2' } },
  );
  ok('D10 la fusión conserva veredictos viejos y el fresco pisa por clave', merged.brand_presence.entries.a.marca === true && merged.brand_presence.entries.b.marca === true && merged.brand_presence.entries.c.marca === false, merged.brand_presence);
}

// ── §3 El gate en el spec de la prueba (demo) ──
const U = {
  cup: 'https://philzcoffee.com/tesora-cup.jpg',
  bag: 'https://philzcoffee.com/tesora-bag.jpg',
  local: 'https://philzcoffee.com/local-1.jpg',
};
function gateDigest(presence) {
  return {
    business: 'Philz Coffee', category: 'cafeteria', subcat: null,
    productos: [{ nombre: 'Tesora', precio: '$18' }, { nombre: 'Mint Mojito', precio: '$12' }, { nombre: "Jacob's Wonderbar", precio: '$19' }],
    servicios: [], temas_feed: ['pour-over taza a taza', 'Tesora', 'Mint Mojito House Way'],
    diferencial: 'Tesora, el primero de Phil: caramelo y nuez, pour-over taza a taza, sin espresso, sin lattes.',
    inferred_star: { item: 'Tesora', confidence: 0.9 },
    onboarding: { diferencial: 'Tesora, el primero de Phil: caramelo y nuez, pour-over taza a taza, sin espresso, sin lattes.' },
    etapa: '',
    // SIN marca en el photo_map a propósito: el único pase posible es el
    // veredicto de presencia del lote (brand_presence).
    photo_map: { entries: {
      [U.cup]: { item: 'Tesora', confianza: 0.9 },
      [U.bag]: { item: 'Tesora', confianza: 0.95 },
    }, at: new Date().toISOString() },
    ...(presence ? { brand_presence: { entries: presence, at: new Date().toISOString() } } : {}),
  };
}
const PHOTOS = {
  cup: { path: '/media/tesora-cup.jpg', url: U.cup, temas: ['cafe'] },
  bag: { path: '/media/tesora-bag.jpg', url: U.bag, temas: ['cafe'] },
  local: { path: '/media/local-1.jpg', url: U.local, temas: ['cafe'] },
};
function gateSpec(digest, photos, demoMod) {
  return (demoMod || demo).buildDemoSpec({
    business: 'Philz Coffee', category: 'cafeteria', country: 'US', tone: 'vos',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: '/media/perfil.jpg', feedRegister: null,
    extraPhotos: photos, digest, lang: 'es', trialNoStock: true,
    draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null,
  });
}
const fotosUsadas = (spec) => (spec.specPosts || []).map((p) => p.photo);
function seccionDemo() {
  // (a) Foto real SIN marca ofrecida → no se entrega; cae al póster.
  const specA = gateSpec(gateDigest({ [U.cup]: { marca: false }, [U.local]: { marca: false } }), [PHOTOS.cup, PHOTOS.local]);
  ok('A1 (a) la foto sin marca NO se entrega en ninguna pieza', !fotosUsadas(specA).includes(PHOTOS.cup.path) && !fotosUsadas(specA).includes(PHOTOS.local.path), fotosUsadas(specA));
  ok('A2 (a) el slot 0 cae al camino de siempre sin foto válida: póster de marca', specA.specPosts[0].photo_source === 'brand-poster' && specA.specPosts[0].photo === '/media/perfil.jpg', specA.specPosts[0]);
  // (d) Visión no disponible (sin veredictos en el fundamento) → no-pase honesto.
  const specD = gateSpec(gateDigest(null), [PHOTOS.cup, PHOTOS.local]);
  ok('D1 (d) sin verificar = no-pase: la foto tampoco se entrega', !fotosUsadas(specD).includes(PHOTOS.cup.path) && !fotosUsadas(specD).includes(PHOTOS.local.path), fotosUsadas(specD));
  ok('D2 (d) el slot 0 también cae al póster', specD.specPosts[0].photo_source === 'brand-poster', specD.specPosts[0] && specD.specPosts[0].photo_source);
  // (b) Foto real CON marca verificada → se entrega, como real-product-brand.
  const specB = gateSpec(gateDigest({ [U.bag]: { marca: true } }), [PHOTOS.bag]);
  ok('B1 (b) la foto con presencia verificada SÍ se entrega en el wow', specB.specPosts[0].photo === PHOTOS.bag.path, specB.specPosts[0] && specB.specPosts[0].photo);
  ok('B2 (b) y su origen es real-product-brand (producto + marca en escena)', specB.specPosts[0].photo_source === 'real-product-brand' && specB.specPosts[0].photo_product === 'Tesora', specB.specPosts[0]);
  // (b2) Equivalencia de producción: la marca que el mapa de fotos ya
  // clasificó (el camino Philz de siempre) también es verificación.
  const dB2 = gateDigest(null);
  dB2.photo_map.entries[U.bag].marca = true;
  const specB2 = gateSpec(dB2, [PHOTOS.bag]);
  ok('B3 (b2) photo_map con marca:true (sin pase de presencia) también entrega la foto', specB2.specPosts[0].photo === PHOTOS.bag.path && specB2.specPosts[0].photo_source === 'real-product-brand', specB2.specPosts[0]);
  // Unitario del selector: la señal marca_visible manda como pase; su
  // ausencia (sin veredicto) frena.
  const ctxG = demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic: { tema: 'cafe' }, isCafe: true, trialNoStock: true });
  const hitMV = demo.pickWebPhoto({ tema: 'cafe' }, [{ path: '/w/mv.jpg', temas: ['cafe'], marca_visible: true }], new Set(), ctxG);
  ok('B4 selector: marca_visible:true es pase verificado', !!hitMV && hitMV.path === '/w/mv.jpg', hitMV);
  const hitNV = demo.pickWebPhoto({ tema: 'cafe' }, [{ path: '/w/nv.jpg', temas: ['cafe'], marca_visible: false }], new Set(), ctxG);
  ok('B5 selector: sin ninguna señal de visión no hay entrega en la prueba', hitNV === null, hitNV);
  // (c) Dos candidatas: la sin marca va PRIMERA en la lista; gana la con marca.
  const specC = gateSpec(gateDigest({ [U.cup]: { marca: false }, [U.bag]: { marca: true } }), [PHOTOS.cup, PHOTOS.bag]);
  ok('C1 (c) se elige la foto CON marca aunque la sin marca llegó primero', specC.specPosts[0].photo === PHOTOS.bag.path, specC.specPosts[0] && specC.specPosts[0].photo);
  ok('C2 (c) la sin marca no se usa en ninguna otra pieza', !fotosUsadas(specC).includes(PHOTOS.cup.path), fotosUsadas(specC));
  // (e) Caché: con los veredictos en el fundamento, armar el spec dos
  // veces (y que lo consuman 5 piezas) no llama a la visión ni una vez.
  const origFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error('red cortada por la suite'); };
  let s1, s2;
  try { s1 = gateSpec(gateDigest({ [U.bag]: { marca: true } }), [PHOTOS.bag]); s2 = gateSpec(gateDigest({ [U.bag]: { marca: true } }), [PHOTOS.bag]); }
  finally { globalThis.fetch = origFetch; }
  ok('E1 (e) el spec lee la caché: cero llamadas de visión al armar (×2 specs, 5 piezas)', fetchCalls === 0, fetchCalls);
  ok('E2 (e) y la elección es idéntica entre armados (veredicto reutilizado)', s1.specPosts[0].photo === PHOTOS.bag.path && s2.specPosts[0].photo === PHOTOS.bag.path);
  // Control sobre la BASE: sin el lote, la foto sin marca SÍ se entregaba.
  if (HAS_BASE) {
    const baseDemo = require(path.join(BASE, 'demo.js'));
    const specBase = gateSpec(gateDigest({ [U.cup]: { marca: false }, [U.local]: { marca: false } }), [PHOTOS.cup, PHOTOS.local], baseDemo);
    ok('X1 CONTROL BASE v995: la foto sin marca se entregaba igual (el bug)', fotosUsadas(specBase).includes(PHOTOS.cup.path) || fotosUsadas(specBase).includes(PHOTOS.local.path), fotosUsadas(specBase));
  } else {
    console.log('  · control base omitido (base-v995 no está junto a la suite)');
  }
}

// ── §4 Boot: albumRefsForPiece ordena por presencia (server real) ──
async function waitBoot(base, tries = 90) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(base + '/api/version'); if (r.ok) return await r.json(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
function ensureNodePath(tree) {
  // Los árboles del scratch no traen node_modules: si express no
  // resuelve desde el árbol, se apunta al node_modules del repo local
  // (el mismo NODE_PATH que usan las suites con boot de la casa).
  try { require.resolve('express', { paths: [tree] }); return; } catch (e) {}
  const cand = path.join(os.homedir(), 'workspace', 'posta', 'node_modules');
  if (fs.existsSync(cand)) {
    process.env.NODE_PATH = cand;
    require('module').Module._initPaths();
  }
}
async function bootTree(tree, port, tag) {
  ensureNodePath(tree);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foto-gate-' + tag + '-'));
  process.env.DATA_DIR = tmp;
  process.env.PORT = String(port);
  process.env.BASE_URL = 'http://127.0.0.1:' + port;
  delete process.env.RESEND_API_KEY;
  delete process.env.OPENAI_API_KEY; // boot determinístico, sin IA
  const db = require(path.join(tree, 'db.js'));
  const srv = require(path.join(tree, 'server.js'));
  const ver = await waitBoot('http://127.0.0.1:' + port);
  return { tmp, db, srv, ver };
}
function seedAlbum(tree, db, cdMod, drMod) {
  const mediaDir = path.join(process.env.DATA_DIR, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  const conMarca = path.join(mediaDir, 'con-marca.jpg');
  const sinMarca = path.join(mediaDir, 'sin-marca.jpg');
  fs.writeFileSync(conMarca, Buffer.concat([JPEG, Buffer.alloc(1500, 67)]));
  fs.writeFileSync(sinMarca, Buffer.concat([JPEG, Buffer.alloc(1500, 83)]));
  const uid = db.prepare(`INSERT INTO users (email, password_hash, plan_status, trial_ends_at, trial_extended_until, created_at, email_opt_out, pwa_installed)
    VALUES (?, 'x', 'active', 0, 0, '2026-10-09 12:00:00', 0, 0)`).run('gate-' + Date.now() + '@example.com').lastInsertRowid;
  const ins = db.prepare('INSERT INTO assets (user_id, file_path, kind, album_tag, album_quality, created_at) VALUES (?, ?, \'photo\', \'producto\', \'ok\', ?)');
  // La SIN marca es la MÁS NUEVA: por llegada (el orden histórico) gana
  // ella; la preferencia por presencia tiene que darlo vuelta.
  ins.run(uid, '/media/con-marca.jpg', '2026-11-01 10:00:00');
  ins.run(uid, '/media/sin-marca.jpg', '2026-11-02 10:00:00');
  const ck = drMod.photoContentKey(conMarca);
  cdMod.saveDigest(db, uid, {
    business: 'Café Gate', category: 'cafeteria', productos: [], servicios: [],
    photo_map: { entries: { [ck]: { item: 'Blend Uno', confianza: 0.9, marca: true } }, at: new Date().toISOString() },
  });
  return uid;
}
async function seccionAlbum() {
  const rel = await bootTree(ROOT, 18797, 'rel');
  ok('L0 el server del release bootea', !!rel.ver, rel.ver);
  ok('L0b y sirve el BUILD del lote', !!rel.ver && rel.ver.build === '20261105-v996', rel.ver && rel.ver.build);
  const uidR = seedAlbum(ROOT, rel.db, cd, deepRead);
  const pickR = rel.srv.albumRefsForPiece(uidR, { tipo: 'novedad', texts: 'promo de temporada', max: 2 });
  ok('L1 (c) albumRefsForPiece: la foto CON marca va primera aunque llegó segunda', pickR.refs[0] === '/media/con-marca.jpg', pickR.refs);
  ok('L2 la sin marca sigue disponible como segunda referencia (preferencia, no borrado)', pickR.refs[1] === '/media/sin-marca.jpg', pickR.refs);
  if (HAS_BASE) {
    const baseCd = require(path.join(BASE, 'client-digest.js'));
    const baseDr = require(path.join(BASE, 'deep-read.js'));
    const bas = await bootTree(BASE, 18798, 'base');
    ok('L3 el server de la base bootea (control)', !!bas.ver, bas.ver);
    if (bas.ver && typeof bas.srv.albumRefsForPiece === 'function') {
      const uidB = seedAlbum(BASE, bas.db, baseCd, baseDr);
      const pickB = bas.srv.albumRefsForPiece(uidB, { tipo: 'novedad', texts: 'promo de temporada', max: 2 });
      ok('L4 CONTROL BASE v995: sin preferencia, la más nueva (sin marca) iba primera', pickB.refs[0] === '/media/sin-marca.jpg', pickB.refs);
    } else {
      console.log('  · la base no exporta albumRefsForPiece (se agregó en este lote): control de orden omitido, el gate queda probado en §3-X1');
    }
  }
}

(async () => {
  console.log('§1 visión de presencia'); await seccionVision();
  console.log('§2 veredicto en el fundamento'); seccionDigest();
  console.log('§3 gate en el spec de la prueba'); seccionDemo();
  console.log('§4 preferencia en el álbum (boot)'); await seccionAlbum();
  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('suite explotó:', e); process.exit(1); });
