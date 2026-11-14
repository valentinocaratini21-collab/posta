'use strict';
/* test-lote-texto-feed.js — LOTE TEXTO-SEGÚN-EL-FEED (regla de
 * Valentino, 13/11 18:08): el texto dentro de la imagen sigue al
 * feed de la marca. Cubre las 6 piezas:
 *  1) La señal texto_feed (feed-audit): contrato texto_superpuesto
 *     de la misma pasada de visión de la firma, conteos que ya no se
 *     descartan y la vara (limpio/con-texto/mixto/sin-senal).
 *  2) La asignación de la prueba gobernada por la señal, incluidos
 *     slot 0 y los forzados de póster/wow/campeona subordinados.
 *  3) La puerta: slot 0 con texto sobre feed limpio NO pasa
 *     (texto-superpuesto-feed-limpio); limpio+clean no exige titular.
 *  4) Defensa en el compuesto (pins de fuente en server.js).
 *  5) Registrados: planWeekTextModes/modeFromWeekKinds con la vara.
 *  6) El peso: headlineScaleForTextoFeed + pins de --scale.
 *  + CONTROL contra la base (../base): la falla exacta de la corrida
 *    Tartine — slot 0 con titular pasando el gate sobre feed limpio.
 * Corre con: node test-lote-texto-feed.js   (sin red, sin IA paga). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const feedAudit = require('./feed-audit');
const demo = require('./demo');
const cp = require('./clean-pieces');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const okA = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

const SRC = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const DEMO_SRC = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');

(async () => {
  console.log('== 1) La señal texto_feed: la vara sobre los conteos ==');
  ok('Tartine: 12 juzgados, 1 superpuesto (la colaboración) → limpio, ratio 0.08', () => {
    const tf = feedAudit.textoFeedFromCounts({ n: 12, superpuestos: 1 });
    assert.strictEqual(tf.modo, 'limpio');
    assert.strictEqual(tf.ratio, 0.08);
  });
  ok('solo texto en escena (carteles): 0 superpuestos → limpio', () => {
    const tf = feedAudit.textoFeedFromCounts({ n: 12, superpuestos: 0 });
    assert.strictEqual(tf.modo, 'limpio');
    assert.strictEqual(tf.ratio, 0);
  });
  ok('8 de 12 con superpuesto → con-texto, ratio 0.67', () => {
    const tf = feedAudit.textoFeedFromCounts({ n: 12, superpuestos: 8 });
    assert.strictEqual(tf.modo, 'con-texto');
    assert.strictEqual(tf.ratio, 0.67);
  });
  ok('borde con-texto: ratio 0.5 → con-texto', () => {
    assert.strictEqual(feedAudit.textoFeedFromCounts({ n: 10, superpuestos: 5 }).modo, 'con-texto');
  });
  ok('4 de 12 → mixto (ratio 0.33); 2 de 10 → mixto (ratio 0.2, más de 1)', () => {
    assert.strictEqual(feedAudit.textoFeedFromCounts({ n: 12, superpuestos: 4 }).modo, 'mixto');
    assert.strictEqual(feedAudit.textoFeedFromCounts({ n: 10, superpuestos: 2 }).modo, 'mixto');
  });
  ok('muestra chica (<5) → sin-senal aunque todos lleven texto', () => {
    assert.strictEqual(feedAudit.textoFeedFromCounts({ n: 4, superpuestos: 4 }).modo, 'sin-senal');
    assert.strictEqual(feedAudit.textoFeedFromCounts({ n: 0, superpuestos: 0 }).modo, 'sin-senal');
  });
  ok('textoFeedValido RE-DERIVA el modo: una señal «limpio» con 6/12 superpuestos no pasa', () => {
    const tf = feedAudit.textoFeedValido({ modo: 'limpio', n: 12, superpuestos: 6, ratio: 0.5, tamano: null });
    assert.strictEqual(tf.modo, 'con-texto');
  });
  ok('textoFeedValido: basura → null (sin-señal manda); tamano fuera de vocabulario → null', () => {
    assert.strictEqual(feedAudit.textoFeedValido(null), null);
    assert.strictEqual(feedAudit.textoFeedValido({ modo: 'limpio' }), null);
    assert.strictEqual(feedAudit.textoFeedValido({ modo: 'raro', n: 12, superpuestos: 1 }), null);
    assert.strictEqual(feedAudit.textoFeedFromCounts({ n: 12, superpuestos: 8, tamano: 'enorme' }).tamano, null);
    assert.strictEqual(feedAudit.textoFeedFromCounts({ n: 12, superpuestos: 8, tamano: 'large' }).tamano, 'large');
  });

  console.log('== 1b) La firma: el contrato texto_superpuesto en la pasada de visión ==');
  const POSTS12 = Array.from({ length: 12 }, (_, i) => ({ type: 'GraphImage', thumb: 'https://x/' + i + '.jpg', shortcode: 'S' + i }));
  const visItem = (texto, sup) => ({ que: 'producto_primer_plano', encuadre: 'primer_plano', angulo: 'frontal', luz: 'natural', texto, texto_superpuesto: sup });
  await okA('firma Tartine: 11 sin texto + 1 colaboración con superpuesto + carteles en escena en 4 → limpio', async () => {
    const vision = async (items) => items.map((_, i) => visItem(i < 4, i === 0));
    const firma = await feedAudit.trialStyleSignature(POSTS12, { vision, source: 'tu feed' });
    assert.ok(firma, 'hay firma');
    assert.deepStrictEqual(firma.superpuestos, { si: 1, no: 11 });
    assert.deepStrictEqual(firma.texto_en_imagen, { si: 4, no: 8 });
    assert.strictEqual(firma.texto_feed.modo, 'limpio');
    assert.strictEqual(firma.texto_feed.n, 12);
    assert.strictEqual(firma.texto_feed.ratio, 0.08);
  });
  await okA('firma con-texto: 8 de 12 con superpuesto → con-texto', async () => {
    const vision = async (items) => items.map((_, i) => visItem(i < 8, i < 8));
    const firma = await feedAudit.trialStyleSignature(POSTS12, { vision, source: 'tu feed' });
    assert.strictEqual(firma.texto_feed.modo, 'con-texto');
    assert.strictEqual(firma.texto_feed.ratio, 0.67);
  });
  await okA('firma solo-escena: texto en 6 (carteles), superpuesto en 0 → limpio', async () => {
    const vision = async (items) => items.map((_, i) => visItem(i < 6, false));
    const firma = await feedAudit.trialStyleSignature(POSTS12, { vision, source: 'tu feed' });
    assert.strictEqual(firma.texto_feed.modo, 'limpio');
    assert.strictEqual(firma.texto_feed.superpuestos, 0);
  });
  await okA('sin visión → la firma trae texto_feed sin-senal (la cadena actual manda)', async () => {
    const firma = await feedAudit.trialStyleSignature(POSTS12, { source: 'tu feed' });
    assert.ok(firma);
    assert.strictEqual(firma.texto_feed.modo, 'sin-senal');
  });
  await okA('visión vieja (sin el campo nuevo) → sin-senal, sin romper la firma', async () => {
    const vision = async (items) => items.map(() => ({ que: 'producto_primer_plano', encuadre: 'primer_plano', angulo: 'frontal', luz: 'natural', texto: true }));
    const firma = await feedAudit.trialStyleSignature(POSTS12, { vision, source: 'tu feed' });
    assert.ok(firma);
    assert.strictEqual(firma.texto_feed.modo, 'sin-senal');
    assert.strictEqual(firma.texto_en_imagen.si, 12);
  });

  console.log('== 2) La asignación de la prueba gobernada por la señal ==');
  const TF_LIMPIO = { modo: 'limpio', n: 12, superpuestos: 1, ratio: 0.08, tamano: null };
  const TF_CONTEXTO = { modo: 'con-texto', n: 10, superpuestos: 6, ratio: 0.6, tamano: 'large' };
  const TF_MIXTO = { modo: 'mixto', n: 12, superpuestos: 4, ratio: 0.33, tamano: null };
  const DRAFT_TITULARES = { rondas: [{ dim: 'texto', elegida: 'titulares' }], dims: ['texto'], campeona: { dim: 'texto', v: 'titulares' } };
  const specDe = (digest, extra) => demo.buildDemoSpec(Object.assign({
    business: 'Tartine Test', category: 'panaderia', country: 'US', tone: 'vos', goal: '', count: 5,
    profilePicPath: '/tmp/pic-test.jpg', digest,
  }, extra || {}));
  ok('feed limpio → las 5 piezas clean, incluido el slot 0', () => {
    const spec = specDe({ texto_feed: TF_LIMPIO });
    assert.strictEqual(spec.specPosts.length, 5);
    assert.ok(spec.specPosts.every((p) => p.text_mode === 'clean'), 'modos: ' + spec.specPosts.map((p) => p.text_mode).join(','));
    assert.strictEqual(spec.specPosts[0].text_mode, 'clean');
    assert.strictEqual(spec.texto_feed.modo, 'limpio');
  });
  ok('feed limpio SUBORDINA al draft del visitante (titulares=3 + campeona text): igual 0 con texto', () => {
    const spec = specDe({ texto_feed: TF_LIMPIO }, { draft: DRAFT_TITULARES });
    assert.strictEqual(spec.specPosts.filter((p) => p.text_mode === 'text').length, 0);
    assert.strictEqual(spec.specPosts[0].text_mode, 'clean');
  });
  ok('sin señal, el mismo draft manda como hoy (3 con texto, campeona en el slot 0)', () => {
    const spec = specDe({}, { draft: DRAFT_TITULARES });
    assert.strictEqual(spec.specPosts.filter((p) => p.text_mode === 'text').length, 3);
    assert.strictEqual(spec.specPosts[0].text_mode, 'text');
  });
  ok('con-texto ratio 0.6 → 3 piezas con texto (la frecuencia copia al feed)', () => {
    const spec = specDe({ texto_feed: TF_CONTEXTO });
    assert.strictEqual(spec.specPosts.filter((p) => p.text_mode === 'text').length, 3);
  });
  ok('mixto ratio 0.33 → 2 piezas con texto (round acotado 1..3)', () => {
    const spec = specDe({ texto_feed: TF_MIXTO });
    assert.strictEqual(spec.specPosts.filter((p) => p.text_mode === 'text').length, 2);
  });
  ok('sin señal (sin digest / sin-senal): el fallback de siempre, 2 con texto', () => {
    assert.strictEqual(specDe(null).specPosts.filter((p) => p.text_mode === 'text').length, 2);
    assert.strictEqual(specDe({ texto_feed: { modo: 'sin-senal', n: 3, superpuestos: 3, ratio: 1, tamano: null } }).specPosts.filter((p) => p.text_mode === 'text').length, 2);
  });

  console.log('== 3) La puerta del primer posteo ==');
  const GATE_BASE = {
    star: 'Morning Bun', temaFinal: 'Morning Bun', modo: 'nombre', lang: 'en',
    caption: 'Fresh from the oven every morning.', photoSource: 'real-product-brand', brandVisible: true,
    dominante: 'foto', formatoSlot0: 'foto',
  };
  ok('limpio + slot 0 con texto → NO pasa, motivo texto-superpuesto-feed-limpio', () => {
    const g = demo.primerPosteoGate(Object.assign({}, GATE_BASE, { headline: 'Try our Morning Bun today', textMode: 'text', textoFeed: TF_LIMPIO }));
    assert.strictEqual(g.veredicto.pasa, false);
    assert.ok(g.veredicto.motivos.includes('texto-superpuesto-feed-limpio'), 'motivos: ' + g.veredicto.motivos.join(','));
    assert.strictEqual(g.texto.feed_modo, 'limpio');
    assert.strictEqual(g.texto.modo_pieza, 'text');
  });
  ok('limpio + slot 0 clean → pasa SIN exigir titular (por_feed_limpio, titular null)', () => {
    const g = demo.primerPosteoGate(Object.assign({}, GATE_BASE, { headline: 'Try Welcome to Tartine today', textMode: 'clean', textoFeed: TF_LIMPIO }));
    assert.strictEqual(g.veredicto.pasa, true, 'motivos: ' + g.veredicto.motivos.join(','));
    assert.strictEqual(g.texto.por_feed_limpio, true);
    assert.strictEqual(g.texto.titular, null);
    assert.strictEqual(g.texto.titular_ok, true);
    assert.ok(!g.veredicto.motivos.includes('titular-largo-o-vacio'));
  });
  ok('sin señal + slot 0 con texto válido → pasa como hoy (contrato intacto)', () => {
    const g = demo.primerPosteoGate(Object.assign({}, GATE_BASE, { headline: 'Try our Morning Bun today', textMode: 'text' }));
    assert.strictEqual(g.veredicto.pasa, true, 'motivos: ' + g.veredicto.motivos.join(','));
    assert.strictEqual(g.texto.por_feed_limpio, false);
    assert.strictEqual(g.texto.feed_modo, null);
  });
  ok('con-texto + slot 0 con texto → pasa (el feed usa texto: no hay veto)', () => {
    const g = demo.primerPosteoGate(Object.assign({}, GATE_BASE, { headline: 'Try our Morning Bun today', textMode: 'text', textoFeed: TF_CONTEXTO }));
    assert.strictEqual(g.veredicto.pasa, true, 'motivos: ' + g.veredicto.motivos.join(','));
    assert.ok(!g.veredicto.motivos.includes('texto-superpuesto-feed-limpio'));
  });
  ok('CONTROL contra la base: el gate de v1020 DEJA PASAR el slot 0 con titular sobre el feed limpio (la falla Tartine)', () => {
    const demoBase = require('../base/demo');
    const g = demoBase.primerPosteoGate(Object.assign({}, GATE_BASE, { headline: 'Try our Morning Bun today', textMode: 'text', textoFeed: TF_LIMPIO }));
    assert.strictEqual(g.veredicto.pasa, true, 'la base debería reproducir la falla (pasa con texto sobre feed limpio)');
    assert.ok(!g.veredicto.motivos.includes('texto-superpuesto-feed-limpio'));
  });

  console.log('== 4+6) Defensa en el compuesto y peso: pins de fuente ==');
  ok('rescuePieceWithSeal: defensa feed-limpio + escala por señal', () => {
    const i = SRC.indexOf('async function rescuePieceWithSeal');
    const seg = SRC.slice(i, i + 5200);
    assert.ok(seg.includes("texto: 'sin-titular-feed-limpio'"), 'registro sin-titular-feed-limpio');
    assert.ok(seg.includes('headline: headlineRes'), 'compone con el titular efectivo');
    assert.ok(seg.includes('headlineScale: scaleRes'), 'escala por señal');
    assert.ok(seg.includes('demo.headlineScaleForTextoFeed(tfRes)'), 'escala del helper');
    assert.ok(seg.includes('if (headlineRes)'), 'sin titular no hay QA de titular');
  });
  ok('makePiece del stream: pieza text sobre feed limpio se compone SIN titular, con motivo', () => {
    assert.ok(SRC.includes("headline: feedLimpioMake ? '' : made[i].headline"));
    assert.ok(SRC.includes("motivo: 'sin-titular-feed-limpio'"));
  });
  ok('los dos llamadores del rescate pasan la señal (stream: digest; fondo: payload)', () => {
    assert.ok(SRC.includes('textoFeed: (trialDigest && trialDigest.texto_feed) || null'));
    assert.ok(SRC.includes('textoFeed: (payload && payload.digest && payload.digest.texto_feed) || null'));
  });
  ok('headlineScaleForTextoFeed: con-texto+large → 1.45; todo lo demás → 1', () => {
    assert.strictEqual(demo.headlineScaleForTextoFeed(TF_CONTEXTO), 1.45);
    assert.strictEqual(demo.headlineScaleForTextoFeed({ modo: 'con-texto', tamano: 'small' }), 1);
    assert.strictEqual(demo.headlineScaleForTextoFeed({ modo: 'con-texto', tamano: null }), 1);
    assert.strictEqual(demo.headlineScaleForTextoFeed(TF_LIMPIO), 1);
    assert.strictEqual(demo.headlineScaleForTextoFeed(TF_MIXTO), 1);
    assert.strictEqual(demo.headlineScaleForTextoFeed(null), 1);
  });
  ok('compuestos con escala por señal: demo (sello + rescate de semana) y registrados (--scale)', () => {
    assert.ok((DEMO_SRC.match(/headlineScale: headlineScaleForTextoFeed\(digest && digest\.texto_feed\)/g) || []).length === 2);
    assert.ok(SRC.includes("if (scaleReg > 1) compArgs.push('--scale', String(scaleReg));"));
  });
  ok('el clasificador completa el tamano en el stream (cls.formula.headline → digest)', () => {
    assert.ok(SRC.includes('trialDigest.texto_feed.tamano = cls.formula.headline'));
  });
  ok('el veredicto final del stream registra señal y modo final de la pieza', () => {
    assert.ok(SRC.includes('ppRecS.texto_feed = (trialDigest && trialDigest.texto_feed) || null'));
    assert.ok(SRC.includes('ppRecS.texto_modo_final'));
  });

  console.log('== 1c) Cableado de la señal: prompt, sanitizador y digest ==');
  ok('el prompt de la firma pide texto_superpuesto con la definición superpuesto vs en-escena (EN+ES)', () => {
    assert.ok(SRC.includes('"texto_superpuesto"'));
    assert.ok(SRC.includes('is NOT overlaid'));
    assert.ok(SRC.includes('NO es superpuesto'));
    assert.ok(SRC.includes('texto_superpuesto: v.texto_superpuesto == null ? null : !!v.texto_superpuesto'));
  });
  ok('parseTrialStyle deja pasar texto_en_imagen/superpuestos/texto_feed (re-derivado)', () => {
    const i = SRC.indexOf('function parseTrialStyle');
    const seg = SRC.slice(i, i + 9000);
    assert.ok(seg.includes('fm.texto_en_imagen = tei'));
    assert.ok(seg.includes('fm.superpuestos = spu'));
    assert.ok(seg.includes('feedAudit.textoFeedValido(s.firma.texto_feed)'));
  });
  ok('el digest de la prueba recibe la señal en AMBAS rutas (generate y stream)', () => {
    assert.strictEqual((SRC.match(/trialDigest\.texto_feed = estilo\.firma\.texto_feed/g) || []).length, 2);
  });
  ok('buildDemoSpec lee la señal del digest y la registra en el spec', () => {
    assert.ok(DEMO_SRC.includes('const tfSpec = (digest && digest.texto_feed'));
    assert.ok(DEMO_SRC.includes('texto_feed: tfSpec || null'));
    assert.ok(DEMO_SRC.includes("if (tfModo !== 'limpio') for (const pi of posterAt)"));
  });

  console.log('== 5) Registrados: la misma señal, la misma vara ==');
  const PICKS5 = [
    { tipo: 'social', titulo: 'Gracias por estar ahí' },
    { tipo: 'promo', titulo: '2x1 en medialunas' },
    { tipo: 'detras', titulo: 'Así amasamos cada mañana' },
    { tipo: 'novedad', titulo: 'Llegó el pan dulce' },
    { tipo: 'reserva', titulo: 'Reservá tu mesa del finde' },
  ];
  ok('planWeekTextModes con feed limpio → 0 con texto', () => {
    const { modes } = cp.planWeekTextModes(PICKS5, 5, TF_LIMPIO);
    assert.strictEqual(modes.filter((m) => m === 'text').length, 0);
  });
  ok('planWeekTextModes con-texto ratio 0.6 → 3 con texto', () => {
    const { modes } = cp.planWeekTextModes(PICKS5, 5, TF_CONTEXTO);
    assert.strictEqual(modes.filter((m) => m === 'text').length, 3);
  });
  ok('planWeekTextModes sin señal → 2 con texto (fallback intacto)', () => {
    assert.strictEqual(cp.planWeekTextModes(PICKS5, 5).modes.filter((m) => m === 'text').length, 2);
    assert.strictEqual(cp.planWeekTextModes(PICKS5, 5, { modo: 'sin-senal', n: 0, superpuestos: 0, ratio: null, tamano: null }).modes.filter((m) => m === 'text').length, 2);
  });
  ok('pieza suelta (modeFromWeekKinds) en semana de cliente limpio → clean', () => {
    assert.strictEqual(cp.modeFromWeekKinds(['promo', 'social', 'reserva'], 0, TF_LIMPIO), 'clean');
    assert.strictEqual(cp.modeFromWeekKinds(['promo', 'social', 'reserva'], 0), 'text');
  });
  ok('textCountForBatch: limpio 0 · con-texto .6→3 · mixto .33→2 · sin señal 2', () => {
    assert.strictEqual(cp.textCountForBatch(5, TF_LIMPIO), 0);
    assert.strictEqual(cp.textCountForBatch(5, TF_CONTEXTO), 3);
    assert.strictEqual(cp.textCountForBatch(5, TF_MIXTO), 2);
    assert.strictEqual(cp.textCountForBatch(5), 2);
  });
  ok('server: la semana y la pieza suelta leen el texto_feed del digest del cliente', () => {
    assert.ok(SRC.includes('planWeekTextModes(picks, deficit, tfWeek)'));
    assert.ok(SRC.includes('cleanPieces.modeFromWeekKinds(kinds, selfPos, tfSingle)'));
  });

  console.log(`\nTOTAL: ${passed} pasaron, 0 fallaron`);
})().catch((e) => { console.error('FALLÓ:', e && e.message); console.error(e && e.stack); process.exit(1); });
