#!/usr/bin/env node
// LOTE PRIMER-POSTEO-MEJOR (Valentino 12/11 01:18 «dale, arma todo. queda
// como regla» + regla dura <30 s 01:24): las 5 mejoras del primer posteo
// de la prueba — (1) foto real primero, siempre · (2) dos candidatos, se
// muestra el mejor · (3) chequeo antes de mostrar + reintento correctivo
// en segundo plano · (4) la estrella es el más querido · (5) caption con
// la voz de la marca — más los pines de latencia de la regla <30 s y las
// regresiones v922 (idioma), v924 (estrella modelo real) y v907 (wow).
// Fixtures, sin red ni claves. Uso: desde la raíz del release,
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-primer-posteo-mejor.js
// NOTA: requerir demo.js abre la DB y crea release/data/ (preexistente,
// v907): borrarlo tras correr la suite, antes del diff/push.
const fs = require('fs');
const path = require('path');

const ROOT = fs.existsSync(path.join(__dirname, 'client-digest.js')) ? __dirname : path.join(__dirname, 'release');
const cd = require(path.join(ROOT, 'client-digest.js'));
const demo = require(path.join(ROOT, 'demo.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); }
};
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

// ── Fixture Philz (igual que la suite v907: Tesora = blend insignia,
// Mint Mojito, Jacob's Wonderbar; Philz no hace lattes ni espresso) ──
const PHILZ_DIF = 'Tesora, el primero de Phil: caramelo y nuez, pour-over taza a taza, sin espresso, sin lattes.';
function philzDigest(opts) {
  return Object.assign({
    business: 'Philz Coffee', category: 'cafeteria', subcat: null,
    productos: [
      { nombre: 'Tesora', precio: '$18' },
      { nombre: 'Mint Mojito', precio: '$12' },
      { nombre: "Jacob's Wonderbar", precio: '$19' },
    ],
    servicios: [],
    temas_feed: ['pour-over taza a taza', 'Tesora', 'Mint Mojito House Way'],
    diferencial: PHILZ_DIF,
    inferred_star: { item: 'Tesora', confidence: 0.9 },
    onboarding: { diferencial: PHILZ_DIF },
    etapa: '',
    photo_map: { entries: {
      'https://philzcoffee.com/tesora-cup.jpg': { item: 'Tesora', confianza: 0.9 },
      'https://philzcoffee.com/tesora-bag.jpg': { item: 'Tesora', confianza: 0.95, marca: true },
      'https://philzcoffee.com/mint-mojito.jpg': { item: 'Mint Mojito', confianza: 0.9 },
    }, at: new Date().toISOString() },
  }, opts || {});
}
function philzPhotos() {
  return [
    { path: '/media/tesora-cup.jpg', url: 'https://philzcoffee.com/tesora-cup.jpg', temas: ['cafe'] },
    { path: '/media/tesora-bag.jpg', url: 'https://philzcoffee.com/tesora-bag.jpg', temas: ['cafe'] },
    { path: '/media/mint-mojito.jpg', url: 'https://philzcoffee.com/mint-mojito.jpg', temas: ['cafe'] },
    { path: '/media/wonderbar.jpg', url: 'https://philzcoffee.com/wonderbar.jpg', temas: ['cafe'] },
    { path: '/media/local-1.jpg', url: 'https://philzcoffee.com/local-1.jpg', temas: ['cafe'] },
  ];
}
function trialSpec(digest, opts) {
  return demo.buildDemoSpec(Object.assign({
    business: 'Philz Coffee', category: 'cafeteria', country: 'US', tone: 'vos',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: null, feedRegister: null,
    extraPhotos: philzPhotos(), digest, lang: 'es', trialNoStock: true,
    draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null,
  }, opts || {}));
}
function wowTopic() {
  return { _wow: 1, digest_anchor: 'Tesora', tema: 'cafe', headline: 'Tesora que todos piden', caption: 'Tesora ✨\n\nCaramelo y nuez, pour-over taza a taza.\n\nPedilo hoy por DM 📩', image_prompt: 'Foto hero de Tesora de Philz Coffee' };
}
function fakeDb({ cachePayload, importedHashes }) {
  const cache = new Map();
  if (cachePayload !== undefined) cache.set('veja', cachePayload);
  const imported = new Set(importedHashes || []);
  return {
    prepare(sql) {
      if (/SELECT payload FROM trial_cache/.test(sql)) {
        return { get: (k) => (cache.has(k) ? { payload: cache.get(k) } : undefined), run: () => ({}) };
      }
      if (/FROM posts WHERE digest_hash LIKE/.test(sql)) {
        return { get: (prefix) => {
          const p = String(prefix).replace(/%$/, '');
          for (const h of imported) if (h.startsWith(p)) return { 1: 1 };
          return undefined;
        }, run: () => ({}) };
      }
      if (/INSERT INTO trial_cache/.test(sql)) {
        return { get: () => undefined, run: (k, payload) => { cache.set(k, payload); return {}; } };
      }
      return { get: () => undefined, run: () => ({}) };
    },
    _cache: cache,
  };
}

// ══════════ §1 · FOTO REAL PRIMERO, SIEMPRE ══════════
console.log('§1 · foto real primero');
{
  const topic = wowTopic();
  const pool = [
    { path: '/media/tesora-cup.jpg', producto: 'Tesora', marca_visible: false, temas: ['cafe'] },
    { path: '/media/tesora-bag.jpg', producto: 'Tesora', marca_visible: true, temas: ['cafe'] },
  ];
  const ctx = demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic, isCafe: true, neutralDefault: false, trialNoStock: true });
  // 1a · con foto real con marca, el ganador es la foto real (tier 0),
  // aunque la taza sin marca vaya primera en el pool.
  const c1 = demo.pickFirstPostCandidates({ topic, webPool: pool, used: new Set(), ctx, lang: 'es', profilePicPath: '/media/philz-logo.jpg' });
  ok('1a con foto real con marca, gana la foto real (tier 0)', c1.winner === 'a' && c1.a && c1.a.photo === '/media/tesora-bag.jpg' && c1.a.photo_source === 'real-product-brand', c1);
  ok('1a gate del ganador pasa', c1.gateA && c1.gateA.pass === true && c1.gateA.failures.length === 0, c1.gateA);
  // 1b · sin foto con marca (solo producto sin logo), gana el póster de
  // marca: la primera imagen lleva la marca (regla Valentino 01:04).
  const poolNoLogo = [{ path: '/media/tesora-cup.jpg', producto: 'Tesora', marca_visible: false, temas: ['cafe'] }];
  const c2 = demo.pickFirstPostCandidates({ topic, webPool: poolNoLogo, used: new Set(), ctx, lang: 'es', profilePicPath: '/media/philz-logo.jpg' });
  ok('1b sin foto con marca, gana el póster (logo presente)', c2.winner === 'b' && c2.b && c2.b.photo_source === 'brand-poster', c2);
  ok('1b el candidato real falla solo por logo', c2.gateA && c2.gateA.failures.join(',') === 'sin-logo' && c2.gateA.correction === 'use-poster', c2.gateA);
  // 1c · sin foto real usable, el primer posteo es el póster (nunca tema).
  const c3 = demo.pickFirstPostCandidates({ topic, webPool: [], used: new Set(), ctx, lang: 'es', profilePicPath: '/media/philz-logo.jpg' });
  ok('1c sin foto real, el póster es el único candidato', c3.winner === 'b' && c3.a === null && c3.b.photo_source === 'brand-poster', c3);
  // 1d · sin foto real ni perfil, no hay candidato: el spec lo marca
  // como póster sin foto (el render dibuja el póster igual).
  const c4 = demo.pickFirstPostCandidates({ topic, webPool: [], used: new Set(), ctx, lang: 'es', profilePicPath: null });
  ok('1d sin foto ni perfil, no hay candidato', c4.winner === null && c4.a === null && c4.b === null, c4);
  // 1e · buildDemoSpec con foto con marca: slot 0 = foto real + logo.
  const spec1 = trialSpec(philzDigest(), { profilePicPath: '/media/philz-logo.jpg' });
  ok('1e spec slot 0 usa la foto real con marca', spec1.specPosts[0].photo === '/media/tesora-bag.jpg' && spec1.specPosts[0].photo_source === 'real-product-brand', spec1.specPosts[0]);
  ok('1e spec slot 0 es camino rápido (fast)', spec1.specPosts[0].fast === true, spec1.specPosts[0]);
  ok('1e spec slot 0 trae el producto trazado', spec1.specPosts[0].photo_product === 'Tesora', spec1.specPosts[0]);
  ok('1e spec slot 0 gate pasa', spec1.specPosts[0]._gate && spec1.specPosts[0]._gate.pass === true, spec1.specPosts[0]._gate);
  // 1f · buildDemoSpec sin foto con marca: slot 0 = póster, no foto sin logo.
  const noLogoDigest = philzDigest({ photo_map: { entries: {
    'https://philzcoffee.com/tesora-cup.jpg': { item: 'Tesora', confianza: 0.9 },
    'https://philzcoffee.com/tesora-bag.jpg': { item: 'Tesora', confianza: 0.95 },
  }, at: new Date().toISOString() } });
  const spec2 = trialSpec(noLogoDigest, { profilePicPath: '/media/philz-logo.jpg' });
  ok('1f sin marca visible, slot 0 es el póster', spec2.specPosts[0].photo === '/media/philz-logo.jpg' && spec2.specPosts[0].photo_source === 'brand-poster', spec2.specPosts[0]);
  ok('1f slot 0 póster no es camino rápido de foto real', spec2.specPosts[0].fast === false, spec2.specPosts[0]);
  ok('1f el gate del ganador (póster) pasa y guarda el fallo del perdedor', spec2.specPosts[0]._gate && spec2.specPosts[0]._gate.pass === true && spec2.specPosts[0]._gate.loser && spec2.specPosts[0]._gate.loser.failures.join(',') === 'sin-logo', spec2.specPosts[0]._gate);
}

// ══════════ §2 · DOS CANDIDATOS, SE MUESTRA EL MEJOR ══════════
console.log('§2 · dos candidatos');
{
  const topic = wowTopic();
  const pool = [{ path: '/media/tesora-bag.jpg', producto: 'Tesora', marca_visible: true, temas: ['cafe'] }];
  const ctx2 = demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic, isCafe: true, neutralDefault: false, trialNoStock: true });
  // 2a · los dos pasan: la voz suma a los dos por igual (es del topic,
  // no del candidato) — empate 110-110 y gana A (la foto real).
  const cA = demo.pickFirstPostCandidates({ topic: Object.assign({}, topic, { voice_used: 'dice' }), webPool: pool, used: new Set(), ctx: ctx2, lang: 'es', profilePicPath: '/media/philz-logo.jpg' });
  ok('2a los dos pasan con voz, empate 110-110, gana A', cA.winner === 'a' && cA.gateA.score === 110 && cA.gateB.score === 110, { a: cA.gateA, b: cA.gateB });
  // 2b · empate sin voz: gana A (la foto real).
  const cB = demo.pickFirstPostCandidates({ topic, webPool: pool, used: new Set(), ctx: ctx2, lang: 'es', profilePicPath: '/media/philz-logo.jpg' });
  ok('2b empate, gana A', cB.winner === 'a' && cB.gateA.score === cB.gateB.score, { a: cB.gateA, b: cB.gateB });
  // 2c · los dos fallan (idioma + estrella genérica): igual se entrega
  // el mejor disponible, nunca se bloquea.
  const badTopic = { _wow: 1, digest_anchor: 'HOMME', tema: 'cafe', headline: 'New drop for everyone today', caption: 'Shop the new collection now with free shipping', image_prompt: '' };
  const badPool = [{ path: '/media/homme.jpg', producto: 'HOMME', marca_visible: false, temas: ['cafe'] }];
  const cC = demo.pickFirstPostCandidates({ topic: badTopic, webPool: badPool, used: new Set(), ctx: demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic: badTopic, isCafe: true, neutralDefault: false, trialNoStock: true }), lang: 'es', profilePicPath: '/media/logo.jpg' });
  ok('2c los dos fallan, igual hay ganador (mejor disponible)', cC.winner !== null, cC);
  ok('2c el ganador es el póster (menos fallos)', cC.winner === 'b' && cC.gateB.failures.length < cC.gateA.failures.length, { a: cC.gateA, b: cC.gateB });
  ok('2c el gate registra idioma y estrella genérica', cC.gateA.failures.includes('idioma') && cC.gateA.failures.includes('estrella-generica'), cC.gateA);
}

// ══════════ §3 · CHEQUEO ANTES DE MOSTRAR + REINTENTO ══════════
console.log('§3 · gate y reintento');
{
  const good = { headline: 'Tesora que todos piden', caption: 'Tesora ✨\n\nCaramelo y nuez.\n\nPedilo hoy por DM 📩', star: 'Tesora', lang: 'es', photo_source: 'real-product-brand', brand_visible: true };
  const g0 = demo.firstPostGate(good);
  ok('3a el bueno pasa limpio', g0.pass === true && g0.failures.length === 0 && g0.score === 100, g0);
  const gV = demo.firstPostGate(Object.assign({}, good, { voice_used: 'dice' }));
  ok('3a la voz suma puntos, nunca resta', gV.pass === true && gV.score === 110, gV);
  // 3b · el gate frena al que falla y deja pasar al que cumple.
  const gLang = demo.firstPostGate({ headline: 'New drop for everyone today', caption: 'Shop the new collection now with free shipping', star: 'Tesora', lang: 'es', photo_source: 'real-product-brand', brand_visible: true });
  ok('3b idioma claramente inglés con marca en español → falla idioma', gLang.pass === false && gLang.failures.includes('idioma'), gLang);
  const gStar = demo.firstPostGate(Object.assign({}, good, { star: 'HOMME' }));
  ok('3b estrella categoría → falla estrella-generica', gStar.pass === false && gStar.failures.includes('estrella-generica'), gStar);
  const gChrome = demo.firstPostGate(Object.assign({}, good, { star: 'Customer Services' }));
  ok('3b estrella de cromo → falla estrella-generica', gChrome.pass === false && gChrome.failures.includes('estrella-generica'), gChrome);
  const gFoto = demo.firstPostGate(Object.assign({}, good, { photo_source: 'real-theme', brand_visible: false }));
  ok('3b foto de tema → falla foto-tema', gFoto.pass === false && gFoto.failures.includes('foto-tema'), gFoto);
  const gLogo = demo.firstPostGate(Object.assign({}, good, { photo_source: 'real-product', brand_visible: false }));
  ok('3b producto sin logo → falla sin-logo con corrección a póster', gLogo.pass === false && gLogo.failures.includes('sin-logo') && gLogo.correction === 'use-poster', gLogo);
  // 3c · la corrección solo existe cuando cambiar de candidato cura.
  ok('3c fallo de idioma no tiene corrección por candidato', gLang.correction === null, gLang);
  ok('3c fallo de estrella no tiene corrección por candidato', gStar.correction === null, gStar);
  // 3d · sin señal clara de idioma, el gate NO falla (umbral v922).
  const gWeak = demo.firstPostGate({ headline: 'Tesora que todos piden', caption: 'Tesora ✨', star: 'Tesora', lang: 'es', photo_source: 'real-product-brand', brand_visible: true });
  ok('3d sin señal clara de otro idioma, pasa', gWeak.pass === true, gWeak);
}

// ══════════ §4 · LA ESTRELLA ES EL MÁS QUERIDO ══════════
console.log('§4 · estrella más querido');
{
  const items = [{ nombre: 'Esplar' }, { nombre: 'Campo' }, { nombre: 'V-10' }];
  const caps = ['Esplar all day', 'Campo vibes', 'Esplar again', 'Campo sale'];
  // 4a · el más querido gana: menciones empatadas (2-2) y Campo con más
  // alcance (500 vs 100) — sin cariño gana Campo (7-6); con cariño
  // (Esplar 150 interacciones vs Campo 12) gana Esplar (9-7).
  const loveMetrics = [
    { text: 'Campo vibes', reach: 500, likes: 10, comments: 2 },
    { text: 'Esplar all day', reach: 100, likes: 120, comments: 30 },
  ];
  const sLove = cd.inferStar({ items, captions: caps, orderNames: [], metrics: loveMetrics, dnaStar: '' });
  ok('4a con cariño, la estrella es el más querido (Esplar)', sLove && sLove.item === 'Esplar', sLove);
  ok('4a la evidencia nombra el cariño', sLove && sLove.evidence.some((e) => /más querido/.test(e)), sLove && sLove.evidence);
  const sNoLove = cd.inferStar({ items, captions: caps, orderNames: [], metrics: [
    { text: 'Campo vibes', reach: 500 }, { text: 'Esplar all day', reach: 100 },
  ], dnaStar: '' });
  ok('4a sin cariño, gana el de más alcance (Campo)', sNoLove && sNoLove.item === 'Campo', sNoLove);
  // 4b · métricas viejas (solo reach) no cambian nada: retrocompatible.
  const sOld = cd.inferStar({ items, captions: caps, orderNames: ['Esplar', 'Campo', 'V-10'], metrics: [{ text: 'Esplar all day', reach: 1200 }], dnaStar: '' });
  ok('4b métricas sin likes/comments siguen funcionando', sOld && sOld.item === 'Esplar', sOld);
  // 4c · la estrella del dueño manda sobre la inferida.
  // (LOTE L3, v934) La estrella del dueño solo manda si CALZA con lo
  // evidenciado: el digest tiene que traer a Campo como producto (sin
  // evidencia, L3 la trata como no declarada y gana la inferida).
  const effOwner = cd.effectiveStarOf({ dueno: { estrella: 'Campo' }, productos: [{ nombre: 'Campo' }], inferred_star: { item: 'Esplar', confidence: 0.9 } });
  ok('4c dueño manda (Campo sobre Esplar inferido)', effOwner && effOwner.item === 'Campo' && effOwner.source === 'dueno', effOwner);
  // 4d · las ventas reales (Tiendanube) mandan sobre la inferida.
  const effSales = cd.effectiveStarOf({ connections: { tiendanube: { star: { name: 'V-10', units_30d: 12 } } }, inferred_star: { item: 'Esplar', confidence: 0.9 } });
  ok('4d ventas reales mandan (V-10 sobre Esplar inferido)', effSales && effSales.item === 'V-10' && effSales.source === 'sales', effSales);
  // 4e · el cariño nunca crea una estrella genérica.
  const sGen = cd.inferStar({ items: [{ nombre: 'HOMME' }, { nombre: 'Esplar' }], captions: ['HOMME new drop', 'HOMME for men'], orderNames: [], metrics: [{ text: 'HOMME new drop', reach: 10, likes: 500, comments: 200 }], dnaStar: '' });
  ok('4e ni con cariño, HOMME es estrella', !sGen || sGen.item !== 'HOMME', sGen);
}

// ══════════ §5 · CAPTION CON LA VOZ DE LA MARCA ══════════
console.log('§5 · voz de la marca');
{
  // 5a · el nombre mostrado usa la forma `dice` del léxico; el ancla
  // formal sigue siendo el nombre formal (match de foto).
  const dDice = philzDigest({ lexicon: { entries: [{ item: 'Tesora', dice: 'la Tesora', apodos: [] }], frases: [] } });
  const wDice = cd.deriveFirstPostWow(dDice, { category: 'cafeteria', lang: 'es' });
  ok('5a headline usa la forma dice de la marca', wDice && wDice.headline === 'la Tesora que todos piden', wDice && wDice.headline);
  ok('5a caption suena como la marca', wDice && wDice.caption.startsWith('la Tesora ✨'), wDice && wDice.caption);
  ok('5a el ancla formal no cambia', wDice && wDice.digest_anchor === 'Tesora', wDice && wDice.digest_anchor);
  ok('5a voice_used dice', wDice && wDice.voice_used === 'dice', wDice && wDice.voice_used);
  // 5b · sin ritual ni precio, el detalle es una frase REAL de la marca:
  // la que habla de la estrella manda sobre la primera de la lista.
  const dVoz = philzDigest({
    productos: [{ nombre: 'Tesora' }, { nombre: 'Mint Mojito' }, { nombre: "Jacob's Wonderbar" }],
    diferencial: '', onboarding: { diferencial: '' },
    voz_marcadores: ['taza a taza, como siempre', 'la Tesora de siempre'],
  });
  const wVoz = cd.deriveFirstPostWow(dVoz, { category: 'cafeteria', lang: 'es' });
  ok('5b sin ritual ni precio, el detalle es la frase de la estrella', wVoz && wVoz.caption.includes('la Tesora de siempre'), wVoz && wVoz.caption);
  ok('5b voice_used frase', wVoz && wVoz.voice_used === 'frase', wVoz && wVoz.voice_used);
  ok('5b no sale el genérico favorito de la casa', wVoz && !wVoz.caption.includes('favorito de la casa'), wVoz && wVoz.caption);
  // 5b2 · si ninguna frase habla de la estrella, va la primera.
  const dVoz2 = philzDigest({
    productos: [{ nombre: 'Tesora' }, { nombre: 'Mint Mojito' }, { nombre: "Jacob's Wonderbar" }],
    diferencial: '', onboarding: { diferencial: '' },
    voz_marcadores: ['taza a taza, como siempre', 'hecho a mano'],
  });
  const wVoz2 = cd.deriveFirstPostWow(dVoz2, { category: 'cafeteria', lang: 'es' });
  ok('5b2 sin frase de la estrella, va la primera', wVoz2 && wVoz2.caption.includes('taza a taza, como siempre'), wVoz2 && wVoz2.caption);
  // 5c · sin léxico ni voz, idéntico a hoy (regresión cero): el detalle
  // es ritual + precio (el fixture los tiene); el genérico solo sale
  // cuando no hay ritual, ni precio, ni voz (5c2).
  const wBase = cd.deriveFirstPostWow(philzDigest(), { category: 'cafeteria', lang: 'es' });
  ok('5c sin voz, headline igual que hoy', wBase && wBase.headline === 'Tesora que todos piden', wBase && wBase.headline);
  ok('5c sin voz, detalle = ritual + precio (como hoy)', wBase && wBase.caption.includes('caramelo y nuez') && wBase.caption.includes('$18'), wBase && wBase.caption);
  ok('5c sin voz, voice_used null', wBase && wBase.voice_used === null, wBase && wBase.voice_used);
  ok('5c sin voz, ancla Tesora', wBase && wBase.digest_anchor === 'Tesora', wBase && wBase.digest_anchor);
  const dPlain = philzDigest({
    productos: [{ nombre: 'Tesora' }, { nombre: 'Mint Mojito' }, { nombre: "Jacob's Wonderbar" }],
    diferencial: '', onboarding: { diferencial: '' },
  });
  const wPlain = cd.deriveFirstPostWow(dPlain, { category: 'cafeteria', lang: 'es' });
  ok('5c2 sin ritual, precio ni voz, sale el genérico de siempre', wPlain && wPlain.caption.includes('El favorito de la casa, listo para vos.'), wPlain && wPlain.caption);
}

// ══════════ §6 · PRIMER POSTEO EN MENOS DE 30 SEGUNDOS ══════════
console.log('§6 · menos de 30 segundos');
{
  // 6a · el camino rápido es instantáneo: un spec completo + sus
  // candidatos + gate, <1 s; y lo que agrega este lote (candidatos +
  // gate, 100 vueltas) <500 ms. Síncrono, sin red ni modelos.
  const t0 = Date.now();
  const sOnce = trialSpec(philzDigest(), { profilePicPath: '/media/philz-logo.jpg' });
  const dtOnce = Date.now() - t0;
  ok('6a un spec + candidatos + gate < 1000 ms', sOnce.specPosts[0] && sOnce.specPosts[0]._gate && dtOnce < 1000, dtOnce + ' ms');
  const t1 = Date.now();
  const topic0 = wowTopic();
  const pool0 = [{ path: '/media/tesora-bag.jpg', producto: 'Tesora', marca_visible: true, temas: ['cafe'] }];
  const ctx0 = demo.photoGateCtx({ category: 'cafeteria', subcat: null, topic: topic0, isCafe: true, neutralDefault: false, trialNoStock: true });
  for (let i = 0; i < 100; i++) {
    const c = demo.pickFirstPostCandidates({ topic: topic0, webPool: pool0, used: new Set(), ctx: ctx0, lang: 'es', profilePicPath: '/media/philz-logo.jpg' });
    if (!c.winner) throw new Error('sin ganador en vuelta ' + i);
  }
  const dt100 = Date.now() - t1;
  ok('6a 100× candidatos + gate < 500 ms', dt100 < 500, dt100 + ' ms');
  // 6b · el timeout existe y no bloquea: una promesa que nunca resuelve
  // devuelve null en ~50 ms, no cuelga.
  // (asíncrono: se mide en el bloque final; acá solo el presupuesto.)
  ok('6b presupuesto de render = 20000 ms', demo.FIRST_POST_RENDER_BUDGET_MS === 20000, demo.FIRST_POST_RENDER_BUDGET_MS);
  ok('6b presupuesto de video = 8000 ms', demo.FIRST_POST_VIDEO_BUDGET_MS === 8000, demo.FIRST_POST_VIDEO_BUDGET_MS);
  ok('6b presupuesto de reintento = 60000 ms', demo.FIRST_POST_RETRY_BUDGET_MS === 60000, demo.FIRST_POST_RETRY_BUDGET_MS);
  ok('6b renderSpecPngsStream acepta deadlineMs', demo.renderSpecPngsStream.length >= 4, demo.renderSpecPngsStream.length);
}

// ══════════ §7 · REGRESIONES v922 / v924 / v907 ══════════
console.log('§7 · regresiones');
{
  // v922 · idioma del posteo = idioma de la marca (umbrales intactos).
  ok('7a v922 dos palabras sueltas → null (umbral ≥3)', demo.detectBrandLang({ captions: ['New drop 🔥'], webText: '' }) === null);
  ok('7a v922 bilingüe parejo → null', demo.detectBrandLang({ captions: ['The new styles are here now', 'La nueva colección está aquí ahora'], webText: '' }) === null);
  ok('7a v922 inglés claro → en', demo.detectBrandLang({ captions: ['The new collection is here now with free shipping for you'], webText: '' }) === 'en');
  ok('7a v922 español claro → es', demo.detectBrandLang({ captions: ['La nueva colección está aquí ahora con envío gratis para ti'], webText: '' }) === 'es');
  // v924 · estrella = modelo real, nunca categoría ni cromo.
  ok('7b v924 HOMME no es ítem', cd.isPlausibleOfferItem('HOMME') === false);
  ok('7b v924 Campo SÍ es ítem', cd.isPlausibleOfferItem('Campo') === true);
  ok('7b v924 Customer Services es cromo', cd.isChromeDerivedName('Customer Services') === true);
  const vejaStar = cd.inferStar({
    items: [{ nombre: 'HOMME' }, { nombre: 'Esplar' }, { nombre: 'Campo' }, { nombre: 'V-10' }],
    captions: ['Campo suede, back in stock.', 'Esplar all day'],
    orderNames: ['HOMME', 'Esplar', 'Campo', 'V-10'], metrics: [], dnaStar: '',
  });
  ok('7b v924 Veja: la estrella NO es HOMME', !vejaStar || vejaStar.item !== 'HOMME', vejaStar);
  // v907 · wow del primer posteo (Philz): Tesora, titular ≤6, caption
  // en bloques, image_prompt con ritual + negativos.
  const w907 = cd.deriveFirstPostWow(philzDigest(), { category: 'cafeteria', lang: 'es' });
  ok('7c v907 wow es Tesora', w907 && w907.digest_anchor === 'Tesora' && w907.headline === 'Tesora que todos piden', w907 && w907.headline);
  ok('7c v907 titular ≤6 palabras', w907 && words(w907.headline) <= 6, w907 && w907.headline);
  ok('7c v907 caption en 3 bloques', w907 && w907.caption.split('\n\n').length === 3, w907 && w907.caption);
  ok('7c v907 image_prompt nombra la estrella y el ritual', w907 && /Tesora/.test(w907.image_prompt) && /caramelo/.test(w907.image_prompt), w907 && w907.image_prompt);
  ok('7c v907 negativos prohíben lo que no vende', w907 && w907.negativos.some((n) => /espresso/i.test(n)), w907 && w907.negativos);
}

// ══════════ §3b · REINTENTO EN SEGUNDO PLANO (asíncrono) ══════════
(async () => {
  console.log('§3b · reintento en segundo plano');
  const cachePayload = JSON.stringify({ posts: [{ type: 'image', image: 'data:image/jpeg;base64,AAA', caption: 'x', headline: 'y' }], digest: { hash: 'abc123' } });
  const specPost0 = { photo: '/media/tesora-bag.jpg', headline: 'Tesora que todos piden', tema: 'cafe', style: 'promo' };
  const fakeRender = async () => Buffer.from('FAKEJPEG');
  // 3d · en borrador, el reintento aplica y marca.
  const db1 = fakeDb({ cachePayload, importedHashes: [] });
  const r1 = await demo.scheduleFirstPostRetry({ cacheKey: 'veja', digestHash: 'abc123', specPost0, colors: { accent: '#2793C8', btn: '#FEC14D' }, db: db1, renderFn: fakeRender });
  ok('3d en borrador, el reintento aplica', r1.applied === true && r1.reason === 'ok', r1);
  const after1 = JSON.parse(db1._cache.get('veja'));
  ok('3d la caché queda con la imagen nueva y la marca', after1.posts[0].image === 'data:image/jpeg;base64,' + Buffer.from('FAKEJPEG').toString('base64') && after1.posts[0]._first_post_retried === true, after1.posts[0]);
  // 3e · si ya se importó, NO toca nada (el posteo ya no es borrador).
  const db2 = fakeDb({ cachePayload, importedHashes: ['abc123:sin-ancla'] });
  const r2 = await demo.scheduleFirstPostRetry({ cacheKey: 'veja', digestHash: 'abc123', specPost0, colors: {}, db: db2, renderFn: fakeRender });
  ok('3e importado, el reintento no toca', r2.applied === false && r2.reason === 'imported', r2);
  ok('3e importado, la caché queda intacta', db2._cache.get('veja') === cachePayload);
  // 3f · si ya se reintentó, no corre dos veces.
  const db3 = fakeDb({ cachePayload: JSON.stringify({ posts: [{ type: 'image', image: 'data:image/jpeg;base64,AAA', _first_post_retried: true }] }) });
  const r3 = await demo.scheduleFirstPostRetry({ cacheKey: 'veja', digestHash: 'abc123', specPost0, colors: {}, db: db3, renderFn: fakeRender });
  ok('3f ya reintentado, no corre dos veces', r3.applied === false && r3.reason === 'already-retried', r3);
  // 3g · sin caché, no hace nada (y nunca tira).
  const db4 = fakeDb({ cachePayload: undefined });
  const r4 = await demo.scheduleFirstPostRetry({ cacheKey: 'veja', digestHash: 'abc123', specPost0, colors: {}, db: db4, renderFn: fakeRender });
  ok('3g sin caché, no hace nada', r4.applied === false && r4.reason === 'no-cache', r4);
  const r5 = await demo.scheduleFirstPostRetry({});
  ok('3g sin datos, nunca tira', r5.applied === false, r5);
  // 3h · el reintento no retrasa la entrega: la llamada devuelve la
  // promesa al instante (la ruta no la espera).
  let slowDone = false;
  const slowRender = () => new Promise((res) => setTimeout(() => { slowDone = true; res(Buffer.from('X')); }, 200));
  const db5 = fakeDb({ cachePayload, importedHashes: [] });
  const t0 = Date.now();
  const p = demo.scheduleFirstPostRetry({ cacheKey: 'veja', digestHash: 'abc123', specPost0, colors: {}, db: db5, renderFn: slowRender });
  const callMs = Date.now() - t0;
  ok('3h la llamada devuelve al instante (fire-and-forget)', p && typeof p.then === 'function' && callMs < 100 && slowDone === false, callMs + ' ms');
  const r6 = await p;
  ok('3h el reintento lento igual aplica después', r6.applied === true && slowDone === true, r6);
  // 6b (asíncrono) · raceMsLocal: lo que nunca resuelve devuelve null.
  const t1 = Date.now();
  const never = new Promise(() => {});
  const rv = await demo.raceMsLocal(never, 50);
  const raceMs = Date.now() - t1;
  ok('6b timeout devuelve null sin colgar (~50 ms)', rv === null && raceMs < 500, raceMs + ' ms');
  const fast = await demo.raceMsLocal(Promise.resolve(42), 50);
  ok('6b lo rápido devuelve su valor', fast === 42, fast);

  console.log(`\n${passed} pasaron, ${failed} fallaron.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ROTA:', e); process.exit(2); });
