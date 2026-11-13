#!/usr/bin/env node
// LOTE C-FOLD — «ESTA FOTO ES EL PRODUCTO» TAMBIÉN ES ELEGIBLE
// (diagnóstico Veja #5 imagen/formato, §5 lote C, sobre CORRECTIVO-7).
// El problema: la puerta de la foto héroe de la prueba (C7) solo admitía
// una foto web si la visión confirmaba presencia de MARCA (logo legible
// / veredicto de presencia). Una foto que ES el producto de la pieza —
// el photo_map la clasificó como ese producto — pero sin logo legible
// en escena (el packshot típico de un e-commerce) caía al póster igual.
// El pliegue: en pickWebPhoto (modo prueba), la elegibilidad pasa a ser
//   marca_verdict === true || marca_visible === true || productHit(w)
// donde productHit(w) es el ancla que POOL-REAL/C8 ya usan: el
// photo_map dice que ESTA foto es EL producto del tema de ESTA pieza
// (match estricto de nombre contra topic.digest_anchor). La vía es por
// tema y fail-closed: sin marca y sin ancla, la foto sigue al póster;
// el veredicto de presencia (classifyBrandPresence) no se toca y la
// preferencia de albumRefsForPiece queda intacta.
// Uso: node test-lote-cfold-foto-producto.js [árbol]
//   Sin argumento corre contra el árbol donde vive el archivo (release).
//   Contra la base (v1005) corre en modo CONTROL: reproduce el ANTES
//   (la foto del producto sin logo no se entrega en ningún camino).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TREE = path.resolve(process.argv[2] || __dirname);
const demoSrc = fs.readFileSync(path.join(TREE, 'demo.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const cdSrc = fs.readFileSync(path.join(TREE, 'client-digest.js'), 'utf8');
const drSrc = fs.readFileSync(path.join(TREE, 'deep-read.js'), 'utf8');
const MODE = demoSrc.includes('marca_visible !== true && !productHit(w)') ? 'release' : 'base';
console.log(`Árbol: ${TREE} — modo: ${MODE}`);

// DATA_DIR temporal ANTES de requerir módulos del árbol (jamás el árbol).
const SUITE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cfold-suite-'));
process.env.DATA_DIR = SUITE_TMP;

const clientDigest = require(path.join(TREE, 'client-digest.js'));
const demo = require(path.join(TREE, 'demo.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }
const count = (text, needle) => String(text || '').split(needle).length - 1;

/* ================= §0 Estáticos y censos ================= */
console.log('— §0: la costura y lo que NO se toca —');
{
  if (MODE === 'release') {
    ok(demoSrc.includes('if (ctx && ctx.trialNoStock && w.marca_verdict !== true && w.marca_visible !== true && !productHit(w)) return false;'),
      'la elegibilidad de pickWebPhoto suma la vía productHit (una sola línea, la puerta de C7 plegada)');
    ok(srvSrc.includes("const BUILD_ID = '20261105-v1006'"), 'BUILD provisorio del lote (v1006)');
  } else {
    ok(!demoSrc.includes('&& !productHit(w)) return false;'), 'CONTROL base: el pliegue no existe (la puerta es solo marca)');
  }
  // El veredicto de marca queda intacto: classifyBrandPresence sigue
  // definida y exportada en deep-read, una sola copia (censo C7).
  ok(count(drSrc, 'classifyBrandPresence') === 3, `classifyBrandPresence ×3 en deep-read (definición + export + comentario), intacta (fue ${count(drSrc, 'classifyBrandPresence')})`);
  // Censos acumulados de la cadena (no se pisa ningún lote vivo).
  ok(count(srvSrc, 'igInterruptedAt') === 10, 'censo C6: igInterruptedAt ×10 en server');
  ok(count(srvSrc, 'trialPayloadBrandLang') === 4, 'censo C11: trialPayloadBrandLang ×4 en server');
  ok(count(srvSrc, 'langFail') === 6, 'censo C9: langFail ×6 en server');
  ok(count(srvSrc, 'recordAutoSignal') === 4, 'censo C12: recordAutoSignal ×4 en server');
  ok(count(cdSrc, 'isCreditRoleName') === 13, 'censo C8: isCreditRoleName ×13 en client-digest');
  ok(count(cdSrc, 'brand_presence') === 14, 'censo C7: brand_presence ×14 en client-digest');
  ok(count(cdSrc, 'formatosFromPosts') === 3, 'censo C5: formatosFromPosts ×3 en client-digest');
}

/* ================= §1 El selector (unitario) ================= */
console.log('— §1: pickWebPhoto — la vía «es el producto» y sus negativos —');
{
  const ctxCafe = demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic: { tema: 'cafe', digest_anchor: 'Tesora' }, isCafe: true, trialNoStock: true });
  const pack = { path: '/media/pack.jpg', temas: ['cafe'], producto: 'Tesora', marca_verdict: false };
  const topicTesora = { tema: 'cafe', digest_anchor: 'Tesora' };
  const hitFold = demo.pickWebPhoto(topicTesora, [pack], new Set(), ctxCafe);
  if (MODE === 'release') {
    ok(!!hitFold && hitFold.path === '/media/pack.jpg', 'F1 (el caso del diagnóstico) packshot sin logo legible, marca_verdict=false, productHit=true → se entrega');
    const packSinV = { path: '/media/pack2.jpg', temas: ['cafe'], producto: 'Tesora' };
    const hitFold2 = demo.pickWebPhoto(topicTesora, [packSinV], new Set(), ctxCafe);
    ok(!!hitFold2 && hitFold2.path === '/media/pack2.jpg', 'F2 lo mismo SIN veredicto anotado (la vía producto no depende del pase de presencia)');
    const wowHit = demo.pickWebPhoto({ tema: 'cafe', digest_anchor: 'Tesora', _wow: true }, [pack], new Set(), ctxCafe);
    ok(!!wowHit && wowHit.path === '/media/pack.jpg', 'F3 la vía también corre para el tema wow (maxTier del primer posteo la consume igual)');
  } else {
    ok(hitFold === null, 'F1 CONTROL base: el packshot del producto con veredicto false NO se entregaba (el hueco)');
    const packSinV = { path: '/media/pack2.jpg', temas: ['cafe'], producto: 'Tesora' };
    ok(demo.pickWebPhoto(topicTesora, [packSinV], new Set(), ctxCafe) === null, 'F2 CONTROL base: sin veredicto tampoco se entregaba');
  }
  // Negativos — valen en AMBOS modos (el fold no ablanda nada de esto):
  const ambiente = { path: '/media/ambiente.jpg', temas: ['cafe'], marca_verdict: false };
  ok(demo.pickWebPhoto(topicTesora, [ambiente], new Set(), ctxCafe) === null,
    'N1 foto de ambiente sin marca y sin ancla de producto → sigue sin entregarse (fail-closed)');
  const sinVerificar = { path: '/media/sv.jpg', temas: ['cafe'] };
  ok(demo.pickWebPhoto(topicTesora, [sinVerificar], new Set(), ctxCafe) === null,
    'N2 foto sin verificar y sin ancla → no-pase, como siempre');
  const otroProducto = { path: '/media/otro.jpg', temas: ['cafe'], producto: 'Mint Mojito', marca_verdict: false };
  ok(demo.pickWebPhoto(topicTesora, [otroProducto], new Set(), ctxCafe) === null,
    'N3 la foto de OTRO producto (ancla de otra pieza) no sirve para esta: la vía es por tema');
  const sinAncla = { path: '/media/pack.jpg', temas: ['cafe'], producto: 'Tesora', marca_verdict: false };
  ok(demo.pickWebPhoto({ tema: 'cafe' }, [sinAncla], new Set(), ctxCafe) === null,
    'N4 pieza SIN ancla (el tema no nombra producto) → la foto del producto no entra por esta vía');
  const conMarca = { path: '/media/marca.jpg', temas: ['cafe'], marca_verdict: true };
  const hitMarca = demo.pickWebPhoto(topicTesora, [conMarca], new Set(), ctxCafe);
  ok(!!hitMarca && hitMarca.path === '/media/marca.jpg', 'N5 la vía marca sigue entregando como antes (veredicto true, sin producto)');
  // Preferencia de C7 dentro del selector (su caso (c)): dos fotos del
  // MISMO producto, la sin verificar primero — gana la verificada. En
  // la base gana porque la otra está bloqueada; con el fold, porque la
  // elegibilidad nueva no reordena ganadores (pasada de preferencia).
  const dosPack = [
    { path: '/media/sin-verificar.jpg', temas: ['cafe'], producto: 'Tesora', marca_verdict: false },
    { path: '/media/verificada.jpg', temas: ['cafe'], producto: 'Tesora', marca_verdict: true },
  ];
  const hitPref = demo.pickWebPhoto(topicTesora, dosPack, new Set(), ctxCafe);
  ok(!!hitPref && hitPref.path === '/media/verificada.jpg', 'N5b dos fotos del producto: la de marca VERIFICADA gana aunque llegó segunda (preferencia de C7 intacta)');
  // Fuera de la prueba el selector no cambia (la puerta es solo trial).
  const ctxReg = demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic: topicTesora, isCafe: true, trialNoStock: false });
  const hitReg = demo.pickWebPhoto(topicTesora, [{ path: '/media/libre.jpg', temas: ['cafe'] }], new Set(), ctxReg);
  ok(!!hitReg && hitReg.path === '/media/libre.jpg', 'N6 fuera de la prueba (registrado) el selector es el histórico: sin cambios');
}

/* ============ §2 Primer posteo: se entrega como real-product ============ */
console.log('— §2: pickFirstPostCandidates — el candidato A del wow —');
{
  const ctxWow = demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic: { tema: 'cafe', digest_anchor: 'Tesora', _wow: true }, isCafe: true, trialNoStock: true });
  const topicWow = { tema: 'cafe', digest_anchor: 'Tesora', _wow: true, headline: 'Tesora, el primero de Phil' };
  const pool = [{ path: '/media/pack.jpg', temas: ['cafe'], producto: 'Tesora', marca_verdict: false }];
  const cands = demo.pickFirstPostCandidates({ topic: topicWow, headline: topicWow.headline, webPool: pool, used: new Set(), ctx: ctxWow, lang: 'es', profilePicPath: '/media/perfil.jpg' });
  if (MODE === 'release') {
    ok(!!cands.a && cands.a.photo === '/media/pack.jpg', 'A1 el packshot del producto ES candidato del primer posteo (antes: no existía)');
    ok(!!cands.a && cands.a.photo_source === 'real-product', 'A2 y se entrega clasificado como real-product (la fórmula del diagnóstico §5)');
    ok(!!cands.a && cands.a.brand_visible === false, 'A3 sin disfraz: brand_visible queda false (nadie afirma un logo que no se vio)');
    ok(!!cands.gateA && cands.gateA.failures.length === 1 && cands.gateA.failures[0] === 'sin-logo',
      'A4 el gate de mostrar lo puntúa solo por el logo (60): la competencia con el póster sigue siendo la de siempre');
  } else {
    ok(cands.a === null && cands.winner === 'b', 'A1 CONTROL base: sin candidato real — el wow salía sí o sí al póster');
  }
}

/* ============ §3 Spec completo Philz (fixture de C7 §3) ============ */
console.log('— §3: buildDemoSpec Philz — la semana entrega la foto del producto —');
{
  const U = { cup: 'https://philzcoffee.com/tesora-cup.jpg', local: 'https://philzcoffee.com/local-1.jpg' };
  const digest = {
    business: 'Philz Coffee', category: 'cafeteria', subcat: null,
    productos: [{ nombre: 'Tesora', precio: '$18' }, { nombre: 'Mint Mojito', precio: '$12' }, { nombre: "Jacob's Wonderbar", precio: '$19' }],
    servicios: [], temas_feed: ['pour-over taza a taza', 'Tesora', 'Mint Mojito House Way'],
    diferencial: 'Tesora, el primero de Phil: caramelo y nuez, pour-over taza a taza.',
    inferred_star: { item: 'Tesora', confidence: 0.9 },
    onboarding: { diferencial: 'Tesora, el primero de Phil: caramelo y nuez.' }, etapa: '',
    photo_map: { entries: { [U.cup]: { item: 'Tesora', confianza: 0.9 } }, at: new Date().toISOString() },
    brand_presence: { entries: { [U.cup]: { marca: false }, [U.local]: { marca: false } }, at: new Date().toISOString() },
  };
  const photos = [
    { path: '/media/tesora-cup.jpg', url: U.cup, temas: ['cafe'] },
    { path: '/media/local-1.jpg', url: U.local, temas: ['cafe'] },
  ];
  const spec = demo.buildDemoSpec({
    business: 'Philz Coffee', category: 'cafeteria', country: 'US', tone: 'vos',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: '/media/perfil.jpg', feedRegister: null,
    extraPhotos: photos, digest, lang: 'es', trialNoStock: true,
    draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null,
  });
  const usadas = (spec.specPosts || []).map((p) => p.photo);
  ok(!usadas.includes('/media/local-1.jpg'), 'P1 la foto del local (sin marca, sin ancla de producto) no se entrega en ninguna pieza');
  if (MODE === 'release') {
    ok(usadas.includes('/media/tesora-cup.jpg'), 'P2 la foto del producto (anclada, veredicto false) SÍ ilustra una pieza de la semana');
    const g0 = spec.specPosts[0]._gate;
    ok(!!g0 && !!g0.loser && g0.loser.failures.length === 1 && g0.loser.failures[0] === 'sin-logo',
      'P3 el wow registra al candidato real como perdedor SOLO por logo (el gate de mostrar no se tocó)');
  } else {
    ok(!usadas.includes('/media/tesora-cup.jpg'), 'P2 CONTROL base: la foto del producto no se entregaba en ninguna pieza (todo póster)');
    const g0 = spec.specPosts[0]._gate;
    ok(!!g0 && g0.loser === null, 'P3 CONTROL base: el wow ni siquiera tenía candidato real (loser null)');
  }
}

/* ============ §4 Spec Veja (fixture de POOL-REAL) ============ */
console.log('— §4: buildDemoSpec Veja — la pieza de Esplar entrega su foto —');
{
  const A1 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/v-10-leather-1.jpg';
  const A2 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/v-10-leather-2.jpg';
  const A3 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/esplar-1.jpg';
  const A4 = 'https://cdn.shopify.com/s/files/1/0588/0001/files/affiche-9f3c2d.jpg';
  const A5 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/campo-1.jpg';
  const OG = 'https://veja-store.com/cdn/shop/files/veja-hero.jpg';
  const extraPhotosVeja = [
    { path: '/media/web-og.jpg', url: OG, temas: ['marca'] },
    { path: '/media/web-a1.jpg', url: A1, temas: [] },
    { path: '/media/web-a2.jpg', url: A2, temas: [] },
    { path: '/media/web-a3.jpg', url: A3, temas: [] },
    { path: '/media/web-a4.jpg', url: A4, temas: [] },
    { path: '/media/web-a5.jpg', url: A5, temas: [] },
  ];
  const digestVeja = clientDigest.buildFromParts({
    business: 'VEJA', category: 'otro',
    web: { name: 'VEJA', description: 'Sneakers and accessories made with organic and ecological materials', services: ['V-10 Leather', 'Esplar', 'Campo Chromefree'], url: 'https://veja-store.com', city: '', palette: [] },
    feed: { bio: 'Sneakers made with organic materials', name: 'Veja', handle: 'veja',
      captions: ['The V-10 in chromefree leather, our icon since 2005', 'V-10 again — restocked in all sizes', 'Esplar: the classic low-top in white leather', 'Campo, the everyday sneaker in chromefree leather', 'V-10 on foot, all day in the city', 'Our running roots: the Condor story'] },
    feedPosts: Array.from({ length: 6 }, () => ({ type: 'GraphSidecar', caption: 'post' })),
    photoEntries: { [A1]: { item: 'V-10 Leather', confianza: 0.92, marca: true }, [A3]: { item: 'Esplar', confianza: 0.85 } },
  });
  const spec = demo.buildDemoSpec({
    business: 'VEJA', category: 'otro', country: 'US', photoPath: null, goal: '', count: 5,
    bioText: 'Sneakers made with organic materials', profilePicPath: '/media/profile-veja.jpg',
    feedRegister: null, extraPhotos: extraPhotosVeja, digest: digestVeja, lang: 'en', trialNoStock: true,
  });
  ok(!spec.photos.includes('/media/web-a5.jpg'), 'V1 la foto sin entrada en el photo_map (Campo) nunca es portada: sin ancla no hay vía');
  ok(!spec.photos.includes('/media/web-a4.jpg'), 'V2 la foto sin ninguna señal (afiche) tampoco');
  if (MODE === 'release') {
    ok(spec.photos[2] === '/media/web-a3.jpg', `V3 la pieza anclada a Esplar entrega SU foto como héroe (fue ${spec.photos[2]})`);
    ok(spec.photos.includes('/media/web-a1.jpg'), 'V4 la foto con marca verificada (V-10) sigue entregándose como antes');
  } else {
    ok(spec.photos[2] === '/media/profile-veja.jpg', `V3 CONTROL base: la pieza de Esplar caía al póster (fue ${spec.photos[2]})`);
    ok(!spec.photos.includes('/media/web-a3.jpg'), 'V4 CONTROL base: la foto de Esplar no se usaba como portada en ningún slot');
  }
}

console.log(`\nTOTAL: ${pass} ok · ${fail} fail`);
try { fs.rmSync(SUITE_TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(fail ? 1 : 0);
