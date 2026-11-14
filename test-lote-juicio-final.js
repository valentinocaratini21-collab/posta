'use strict';
/* test-lote-juicio-final.js — LOTE JUICIO-FINAL (vara de Valentino,
 * 14/11 05:02: «Quiero que Posty sea igual de bueno que vos haciendo
 * posteos y entendiendo el producto»): el pase de juicio sobre la
 * pieza TERMINADA de la prueba. Cubre:
 *  1) El veredicto: parser de la lista cerrada de motivos + la llamada
 *     de visión (mockeada) — un no-pasa sin motivo accionable no es
 *     veredicto; la respuesta ilegible es sin-veredicto (fail-open).
 *  2) El caption seguro (safeFallbackCaption): las tablas de la casa,
 *     sembradas por negocio, con dedupe de cuerpos, ES/EN.
 *  3) El pase sobre los fixtures REALES de la re-corrida de Blind
 *     Barber (evidencia de ~/workspace/.diag-etiqueta-tienda):
 *     el 676 (foto real + píldora NEW + titular fuera del feed) NO
 *     PASA por texto y se recompone limpio · el 678 (el banner de la
 *     web con SHOP NOW) NO PASA por cromo y sin candidato cae al
 *     armado honesto · el 677 PASA intacto · una pieza con-texto bien
 *     encajada PASA · un caption con hashtags de otro rubro NO PASA
 *     y sale con el caption seguro · con candidato admitido sin usar,
 *     el cromo sale por foto-candidato.
 *  4) Los topes: sin tope de gasto el pase no corre y las piezas
 *     malas pasan tal cual (el hueco, reproducido); nunca más de 2
 *     pasadas por pieza ni más del techo semanal declarado.
 *  5) Pins de fuente: las dos rutas de la prueba enganchan el pase y
 *     el registro viaja en el payload (out.juicio_final).
 *  6) CONTROL contra la base (../base): la base no tiene el pase —
 *     ninguna capa juzgaba la pieza final.
 *  7) Integración con visión REAL (solo si OPENAI_API_KEY está en el
 *     entorno): el modelo juzga los tres fixtures de la corrida.
 * Corre con: node test-lote-juicio-final.js   (sin red salvo §7). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jf-data-'));

const demoAi = require('./demo-ai');
const demo = require('./demo');
const captions = require('./demo-captions');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const okA = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

const SRC = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const DEMO_SRC = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');

const FX = path.join(__dirname, 'test-fixtures', 'juicio-final');
const b64De = (f) => fs.readFileSync(path.join(FX, f)).toString('base64');
const dataUri = (f) => 'data:image/jpeg;base64,' + b64De(f);

// Los captions REALES entregados en la re-corrida (user-posts del
// guest 101, evidencia de la diagnosis).
const CAP676 = 'Eau De Parfum - Speakeasy ✨\n\nBlind Barber is a neighborhood barbershop and lounge born in NYC.\n\nOrder yours today by DM 📩';
const CAP677 = 'Eau De Parfum, another favorite at Blind Barber ✨\n\nStop by or order it by DM.\n\nOrder yours today 📩';
const CAP678 = 'Bar is one of the most requested things at Blind Barber ✨\n\nThanks for choosing us and recommending us.\n\nTell us: have you tried it yet? 👇';

const B64_676 = b64De('post-676.jpg');
const B64_677 = b64De('post-677.jpg');
const B64_678 = b64De('post-678.jpg');
const nombreImagen = (b64) => (b64 === B64_676 ? '676' : b64 === B64_677 ? '677' : b64 === B64_678 ? '678' : 'otra');

// Visión mockeada: `juez({img, caption})` devuelve el veredicto; el
// fetch falso lo envuelve en la forma de la API. Cuenta las llamadas.
function mockVision(juez) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const content = body.messages[1].content;
    const img = String(content[1].image_url.url).split(',')[1];
    const texto = String(content[0].text);
    const cap = (texto.split('"""')[1] || '').trim();
    calls.push({ img: nombreImagen(img), caption: cap });
    const v = juez({ img: nombreImagen(img), b64: img, caption: cap });
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(v) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }),
    };
  };
  return { fetchImpl, calls };
}

const spFoto = (photo, extra = {}) => ({
  photo, photo_source: 'real-product-brand', photo_product: 'Eau De Parfum - Speakeasy',
  style: 'promo', style_name: '', kind: 'novedad', pill: 'NEW', bar: 'BLIND BARBER',
  headline: 'Eau De Parfum - Speakeasy', subline: '', cta: '', text_mode: 'text', ...extra,
});
const postImg = (f, extra = {}) => ({
  type: 'image', image: dataUri(f), caption: '', hashtags: '', headline: 'Eau De Parfum - Speakeasy',
  style: 'promo', style_name: '', text_mode: 'text', estilo_visual: null, ...extra,
});
const optsBase = (posts, specPosts, extra = {}) => ({
  posts, specPosts,
  digest: { texto_feed: { modo: 'limpio' }, producto_estrella: 'Eau De Parfum - Speakeasy' },
  spec: { foto_gate: { fotos: [] } },
  business: 'Blind Barber', category: 'belleza', country: 'US', tone: 'tu', lang: 'en', subcat: '',
  accent: '#0A1E33', btn: '#FEC14D', photoPath: null, extraPhotos: [],
  apiKey: 'test-key', capOk: () => true, ...extra,
});

(async () => {
  console.log('== 1) El veredicto: parser de motivos cerrados + llamada de visión ==');
  ok('pasa con motivos vacíos; no-pasa conserva solo códigos de la lista', () => {
    assert.deepStrictEqual(demoAi.parseJuicioFinalContent('{"pasa":true,"motivos":[],"detalle":"ok"}'), { pasa: true, motivos: [], detalle: 'ok' });
    const v = demoAi.parseJuicioFinalContent('{"pasa":false,"motivos":["cromo-ajeno","inventado","texto-no-encaja"],"detalle":"banner"}');
    assert.strictEqual(v.pasa, false);
    assert.deepStrictEqual(v.motivos, ['cromo-ajeno', 'texto-no-encaja']);
    const v2 = demoAi.parseJuicioFinalContent('{"pasa":true,"motivos":["cromo-ajeno"]}');
    assert.deepStrictEqual(v2.motivos, []); // pasa ⇒ sin motivos
  });
  ok('un no-pasa sin motivo accionable NO es veredicto; basura tampoco', () => {
    assert.strictEqual(demoAi.parseJuicioFinalContent('{"pasa":false,"motivos":["inventado"]}'), null);
    assert.strictEqual(demoAi.parseJuicioFinalContent('{"pasa":false}'), null);
    assert.strictEqual(demoAi.parseJuicioFinalContent('no es json'), null);
    assert.strictEqual(demoAi.parseJuicioFinalContent(''), null);
    assert.ok(demoAi.parseJuicioFinalContent('```json\n{"pasa":false,"motivos":["caption-roto"]}\n```'));
  });
  await okA('juicioFinalPieza con fetch mockeado devuelve el veredicto; sin clave o con caída devuelve null', async () => {
    const { fetchImpl } = mockVision(() => ({ pasa: false, motivos: ['titular-tapa'], detalle: 'tapa el frasco' }));
    const v = await demoAi.juicioFinalPieza({ b64: B64_677, caption: CAP677, ctx: { business: 'Blind Barber', rubro: 'belleza', estrella: 'Eau De Parfum - Speakeasy', feed_modo: 'limpio', lang: 'en' }, apiKey: 'k', fetchImpl });
    assert.deepStrictEqual(v.motivos, ['titular-tapa']);
    assert.strictEqual(await demoAi.juicioFinalPieza({ b64: B64_677, caption: 'x', ctx: {}, apiKey: '', fetchImpl }), null);
    const caido = async () => ({ ok: false, json: async () => ({}) });
    assert.strictEqual(await demoAi.juicioFinalPieza({ b64: B64_677, caption: 'x', ctx: {}, apiKey: 'k', fetchImpl: caido }), null);
  });
  ok('la lista cerrada es exactamente la de la vara (8 motivos)', () => {
    assert.deepStrictEqual(demoAi.JUICIO_FINAL_MOTIVOS, ['estrella-ausente', 'marca-no-visible', 'cromo-ajeno', 'texto-no-encaja', 'titular-tapa', 'caption-voz', 'caption-roto', 'no-vende-producto']);
  });

  console.log('== 2) El caption seguro ==');
  ok('safeFallbackCaption: nombra al negocio, respeta el kind y el idioma', () => {
    const es = captions.safeFallbackCaption({ kind: 'tip', business: 'Café Aroma', tone: 'vos', lang: 'es' });
    assert.ok(es.caption.includes('Café Aroma'));
    assert.ok(/tip/i.test(es.caption));
    const en = captions.safeFallbackCaption({ kind: 'novedad', business: 'Blind Barber', tone: 'tu', lang: 'en' });
    assert.ok(en.caption.includes('Blind Barber'));
    assert.ok(!/gracias por estar/i.test(en.caption));
  });
  ok('safeFallbackCaption: no repite un cuerpo ya usado en la semana', () => {
    const a = captions.safeFallbackCaption({ kind: 'social', business: 'Blind Barber', tone: 'tu', lang: 'en' });
    const b = captions.safeFallbackCaption({ kind: 'social', business: 'Blind Barber', tone: 'tu', lang: 'en', prevCaptions: [a.caption] });
    assert.notStrictEqual(b.caption, a.caption);
    assert.ok(b.caption.includes('Blind Barber'));
  });

  console.log('== 3) El pase sobre los fixtures de la corrida (visión mockeada) ==');
  await okA('676: NO PASA por texto (feed limpio) → se recompone sin texto y el re-juicio lo deja pasar', async () => {
    const post = postImg('post-676.jpg', { caption: CAP676 });
    const { fetchImpl, calls } = mockVision(({ img }) => (img === '676'
      ? { pasa: false, motivos: ['texto-no-encaja'], detalle: 'titular de la casa sobre feed limpio' }
      : { pasa: true, motivos: [], detalle: '' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([post], [spFoto(path.join(FX, 'foto-speakeasy.jpg'))], { fetchImpl }));
    assert.strictEqual(post.text_mode, 'clean');
    assert.strictEqual(post.headline, '');
    assert.notStrictEqual(post.image, dataUri('post-676.jpg'));
    assert.strictEqual(r.registro[0].pasa, true);
    assert.strictEqual(r.registro[0].salida, 'recompuesta-sin-texto');
    assert.deepStrictEqual(r.registro[0].motivos, ['texto-no-encaja']);
    assert.strictEqual(r.registro[0].feed_modo, 'limpio');
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(post.juicio.salida, 'recompuesta-sin-texto');
  });
  await okA('678: NO PASA por cromo (el banner con SHOP NOW) y sin candidato cae al armado honesto', async () => {
    const post = postImg('post-678.jpg', { caption: CAP678 });
    const sp = spFoto(path.join(FX, 'foto-glasshouse.jpg'), { photo_product: 'Discovery Set: Collection 1' });
    const { fetchImpl, calls } = mockVision(({ img }) => (img === '678'
      ? { pasa: false, motivos: ['cromo-ajeno'], detalle: 'banner de campaña con botón SHOP NOW' }
      : { pasa: true, motivos: [], detalle: '' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([post], [sp], { fetchImpl }));
    assert.strictEqual(post.armando, true);
    assert.strictEqual(post.image, null);
    assert.strictEqual(r.registro[0].pasa, false);
    assert.strictEqual(r.registro[0].salida, 'armado-rescate');
    assert.deepStrictEqual(r.registro[0].motivos, ['cromo-ajeno']);
    assert.strictEqual(calls.length, 1); // sin salida aplicable: no se quema el re-juicio
  });
  await okA('678 con candidato admitido sin usar: el cromo sale por foto-candidato', async () => {
    const post = postImg('post-678.jpg', { caption: CAP678 });
    const sp = spFoto(path.join(FX, 'foto-speakeasy.jpg'), { photo_product: 'Discovery Set: Collection 1' });
    const urlCand = 'https://blindbarber.com/cdn/shop/files/EauDeParfumGlasshouse-bottle.png';
    const { fetchImpl } = mockVision(({ img }) => (img === '678'
      ? { pasa: false, motivos: ['cromo-ajeno'], detalle: 'banner' }
      : { pasa: true, motivos: [], detalle: '' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([post], [sp], {
      fetchImpl,
      extraPhotos: [{ path: path.join(FX, 'foto-glasshouse.jpg'), url: urlCand }],
      spec: { foto_gate: { fotos: [{ url: urlCand, admitida: true, producto: 'Eau De Parfum - Glasshouse', piezas: [] }] } },
    }));
    assert.strictEqual(r.registro[0].salida, 'foto-candidato');
    assert.strictEqual(r.registro[0].pasa, true);
    assert.ok(post.image && post.image !== dataUri('post-678.jpg'));
    assert.ok(!post.armando);
  });
  await okA('677: PASA — la pieza queda byte a byte como estaba', async () => {
    const post = postImg('post-677.jpg', { caption: CAP677 });
    const antes = post.image;
    const { fetchImpl, calls } = mockVision(() => ({ pasa: true, motivos: [], detalle: '' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([post], [spFoto(path.join(FX, 'foto-glasshouse.jpg'))], { fetchImpl }));
    assert.strictEqual(post.image, antes);
    assert.strictEqual(r.registro[0].pasa, true);
    assert.strictEqual(r.registro[0].salida, 'directa');
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(r.cambiados, []);
  });
  await okA('pieza con-texto bien encajada (feed con-texto): PASA con su texto puesto', async () => {
    const post = postImg('post-677.jpg', { caption: CAP677 });
    const { fetchImpl } = mockVision(() => ({ pasa: true, motivos: [], detalle: '' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([post], [spFoto(path.join(FX, 'foto-glasshouse.jpg'))], {
      fetchImpl, digest: { texto_feed: { modo: 'con-texto' }, producto_estrella: 'Eau De Parfum - Speakeasy' },
    }));
    assert.strictEqual(r.registro[0].pasa, true);
    assert.strictEqual(r.registro[0].feed_modo, 'con-texto');
    assert.strictEqual(post.text_mode, 'text');
  });
  await okA('caption con hashtags de otro rubro: NO PASA → caption seguro + hashtags del rubro propio', async () => {
    const post = postImg('post-677.jpg', {
      caption: 'Fresh cuts and good vibes ✨\n\nBook your chair today.',
      hashtags: '#skincare #glowup #dermaplaning',
    });
    const { fetchImpl, calls } = mockVision(({ caption }) => (caption.includes('#skincare')
      ? { pasa: false, motivos: ['caption-voz'], detalle: 'hashtags de skincare en una barbería' }
      : { pasa: true, motivos: [], detalle: '' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([post], [spFoto(path.join(FX, 'foto-glasshouse.jpg'))], { fetchImpl, subcat: 'barberia' }));
    assert.strictEqual(r.registro[0].salida, 'caption-seguro');
    assert.strictEqual(r.registro[0].pasa, true);
    assert.ok(post.caption.includes('Blind Barber'));
    assert.ok(!post.caption.includes('#skincare'));
    assert.ok(!String(post.hashtags).includes('skincare'));
    assert.strictEqual(calls.length, 2);
  });
  await okA('re-juicio reprobado: la pieza reparada que tampoco pasa cae al armado (nunca se muestra así)', async () => {
    const post = postImg('post-676.jpg', { caption: CAP676 });
    const { fetchImpl, calls } = mockVision(() => ({ pasa: false, motivos: ['texto-no-encaja'], detalle: 'sigue mal' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([post], [spFoto(path.join(FX, 'foto-speakeasy.jpg'))], { fetchImpl }));
    assert.strictEqual(post.armando, true);
    assert.strictEqual(r.registro[0].salida, 'armado-rescate');
    assert.strictEqual(calls.length, 2); // original + una tras la reparación: nunca una tercera
  });

  console.log('== 4) Topes y piezas fuera de alcance ==');
  await okA('sin tope de gasto, el pase no corre: las piezas malas pasan tal cual, con el motivo registrado', async () => {
    const p676 = postImg('post-676.jpg', { caption: CAP676 });
    const p678 = postImg('post-678.jpg', { caption: CAP678 });
    const { fetchImpl, calls } = mockVision(() => ({ pasa: false, motivos: ['cromo-ajeno'] }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([p676, p678],
      [spFoto(path.join(FX, 'foto-speakeasy.jpg')), spFoto(path.join(FX, 'foto-glasshouse.jpg'))],
      { fetchImpl, capOk: () => false }));
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(p676.image, dataUri('post-676.jpg'));
    assert.strictEqual(p678.image, dataUri('post-678.jpg'));
    assert.ok(r.registro.every((x) => x.salida === 'sin-pase' && x.motivo === 'tope-gasto' && x.pasa === null));
  });
  await okA('techo semanal: con 8 piezas que nunca pasan, las pasadas totales no superan el tope declarado (14)', async () => {
    const posts = [];
    const sps = [];
    for (let k = 0; k < 8; k++) { posts.push(postImg('post-677.jpg', { caption: CAP677 })); sps.push(spFoto(path.join(FX, 'foto-glasshouse.jpg'))); }
    const { fetchImpl, calls } = mockVision(() => ({ pasa: false, motivos: ['caption-roto'], detalle: 'roto' }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase(posts, sps, { fetchImpl }));
    assert.ok(calls.length <= 14, `pasadas=${calls.length}`);
    assert.strictEqual(r.tope_semana, 14);
    assert.ok(r.registro.some((x) => x.motivo === 'tope-semana'));
  });
  await okA('video y armado quedan fuera del pase, registrados; la pieza en armado ni se registra', async () => {
    const pv = { type: 'video', video: 'data:video/mp4;base64,AAAA', caption: 'x', hashtags: '' };
    const pa = { type: 'image', image: null, armando: true, caption: 'x', hashtags: '' };
    const { fetchImpl, calls } = mockVision(() => ({ pasa: true, motivos: [] }));
    const r = await demo.aplicarJuicioFinalTrial(optsBase([pv, pa], [{}, {}], { fetchImpl }));
    assert.strictEqual(calls.length, 0);
    assert.strictEqual(r.registro.length, 1);
    assert.strictEqual(r.registro[0].motivo, 'pieza-video');
  });

  console.log('== 5) Pins de fuente: el enganche en las dos rutas y el registro en el payload ==');
  ok('server.js llama al pase en las DOS rutas de la prueba y guarda out.juicio_final en ambas', () => {
    const llamadas = (SRC.match(/aplicarJuicioFinalTrial/g) || []).length;
    assert.strictEqual(llamadas, 2);
    assert.ok(SRC.includes('juicio_final: juicioFinalReg,'));
    assert.ok(SRC.includes('juicio_final: juicioFinalRegS,'));
    // La ruta stream engancha ANTES del veredicto final del slot 0.
    const iJuicio = SRC.indexOf('juicioFinalRegS = jfS.registro');
    const iVeredicto = SRC.indexOf('VEREDICTO SOBRE LA\n    // PIEZA FINAL DEL SLOT 0');
    assert.ok(iJuicio > 0 && iVeredicto > iJuicio);
  });
  ok('demo.js exporta el pase y demo-ai la visión; el pase respeta el tope de gasto (pin)', () => {
    assert.strictEqual(typeof demo.aplicarJuicioFinalTrial, 'function');
    assert.strictEqual(typeof demoAi.juicioFinalPieza, 'function');
    assert.ok(DEMO_SRC.includes('JUICIO_FINAL_TOPE_POR_PIEZA = 2'));
    assert.ok(DEMO_SRC.includes('costs.demoAiCapOk()'));
  });

  console.log('== 6) CONTROL contra la base: la base no juzga ninguna pieza final ==');
  ok('en ../base no existe el pase (ni la visión, ni el orquestador, ni el caption seguro)', () => {
    const baseAi = require('../base/demo-ai');
    const baseDemo = require('../base/demo');
    const baseCap = require('../base/demo-captions');
    assert.strictEqual(typeof baseAi.juicioFinalPieza, 'undefined');
    assert.strictEqual(typeof baseDemo.aplicarJuicioFinalTrial, 'undefined');
    assert.strictEqual(typeof baseCap.safeFallbackCaption, 'undefined');
    const baseSrc = fs.readFileSync(path.join(__dirname, '..', 'base', 'server.js'), 'utf8');
    assert.ok(!baseSrc.includes('juicio_final'));
  });

  console.log('== 7) Integración con visión real (solo si hay OPENAI_API_KEY) ==');
  await okA('el modelo juzga los fixtures de la corrida', async () => {
    const key = process.env.OPENAI_API_KEY || '';
    if (!key) { console.log('    (omitida: sin OPENAI_API_KEY en el entorno)'); return; }
    const ctxBase = { business: 'Blind Barber', rubro: 'barbería', feed_modo: 'limpio', lang: 'en' };
    const v676 = await demoAi.juicioFinalPieza({ b64: B64_676, caption: CAP676, ctx: { ...ctxBase, estrella: 'Eau De Parfum - Speakeasy' }, apiKey: key });
    const v677 = await demoAi.juicioFinalPieza({ b64: B64_677, caption: CAP677, ctx: { ...ctxBase, estrella: 'Eau De Parfum - Glasshouse' }, apiKey: key });
    const v678 = await demoAi.juicioFinalPieza({ b64: B64_678, caption: CAP678, ctx: { ...ctxBase, estrella: 'Discovery Set: Collection 1' }, apiKey: key });
    console.log('    676 →', JSON.stringify(v676));
    console.log('    677 →', JSON.stringify(v677));
    console.log('    678 →', JSON.stringify(v678));
    assert.ok(v676 && v676.pasa === false, 'el 676 tiene que reprobar');
    assert.ok(v677 && v677.pasa === true, 'el 677 (foto limpia) tiene que pasar');
    assert.ok(v678 && v678.pasa === false, 'el 678 tiene que reprobar');
    assert.ok(v678.motivos.includes('cromo-ajeno'), 'el 678 reprueba por cromo');
  });

  console.log(`\nJUICIO-FINAL: ${passed} grupos OK`);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
