'use strict';
/* test-lote-continuidad-serie.js — LOTE CONTINUIDAD-DE-SERIE (la
 * observación de Valentino, 14/11 13:37: el posteo de las medialunas
 * salió sin el texto dentro de la imagen «como veníamos haciendo»;
 * su regla: «si se viene manteniendo algo, mantenerlo»): el pase de
 * SERIE sobre la semana terminada de la prueba. El juicio final
 * (v1053) mira cada pieza sola; este pase mira la semana como serie
 * contra el patrón de ESE feed y rehace la pieza que abandona el
 * sistema. Cubre:
 *  1) El PERFIL de continuidad (función pura): sistema de texto por
 *     pieza, cantidad esperada según el patrón (estilo declarado >
 *     señal del feed), estrellas por pieza con sus alternativas del
 *     digest, ritmo de la serie vs. los recientes del feed.
 *  2) sistema-de-texto-roto: serie con sistema de banda en 2 y la
 *     tercera sin texto → la tercera se recompone CON texto · feed
 *     limpio → la serie sin texto pasa intacta y una pieza con texto
 *     se recompone limpia · sin señal del feed, la mezcla de la casa
 *     no se condena · una pieza desnudada a propósito por el juicio
 *     nunca se re-viste (el déficit queda registrado).
 *  3) estrella-repetida: las 3 piezas venden la misma estrella
 *     habiendo alternativas → las repetidas salen por foto de un
 *     producto nuevo · negocio de una sola estrella → la repetición
 *     es su verdad y no se condena · sin candidato en el pool, la
 *     repetida cae al armado honesto.
 *  4) ritmo-roto: feed de video y serie sin video ni carrusel → el
 *     motivo queda registrado en la serie, sin tocar piezas.
 *  5) Pins de fuente: las dos rutas de la prueba enganchan el pase
 *     tras el juicio y el registro viaja en el payload
 *     (out.continuidad_serie); el juicio queda exportado intacto.
 *  6) CONTROL contra la base (../base): la base no tiene el pase —
 *     la serie rota de hoy pasa sin que nadie la mire.
 * Corre con: node test-lote-continuidad-serie.js (desde la raíz del
 * árbol; los renders usan el renderer real, como la suite del
 * juicio). */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-data-'));

const demo = require('./demo');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const okA = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };

const SRC = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const DEMO_SRC = fs.readFileSync(path.join(__dirname, 'demo.js'), 'utf8');

const FX = path.join(__dirname, 'test-fixtures', 'juicio-final');
const FOTO_A = path.join(FX, 'foto-speakeasy.jpg');
const FOTO_B = path.join(FX, 'foto-glasshouse.jpg');
const FOTO_C = path.join(FX, 'post-677.jpg');
const CAND_1 = path.join(__dirname, 'public', 'demo-stock', 'bar-1.webp');
const CAND_2 = path.join(__dirname, 'public', 'demo-stock', 'bar-2.webp');
const URL_C1 = 'https://negocio.example/fotos/torta.jpg';
const URL_C2 = 'https://negocio.example/fotos/cafe.jpg';

const sp = (photo, extra = {}) => ({
  photo, photo_source: 'real-product-brand', photo_product: 'Medialuna',
  style: 'promo', style_name: '', kind: 'novedad', pill: '', bar: 'PANADERÍA SOL',
  headline: 'Medialuna tibia', subline: 'recién horneada', cta: '', text_mode: 'text',
  creatividad: { rol: 'heroe', estrella: 'Medialuna', escena_key: 'x', escena: '' },
  ...extra,
});
const post = (tm, marca, extra = {}) => ({
  type: 'image', image: 'data:image/jpeg;base64,' + marca, caption: 'cap', hashtags: '',
  headline: 'Medialuna tibia', style: 'promo', style_name: '', text_mode: tm, ...extra,
});
const opts = (posts, specPosts, extra = {}) => ({
  posts, specPosts,
  digest: { texto_feed: { modo: 'con-texto', n: 10, superpuestos: 9, ratio: 0.9 }, producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] },
  spec: { foto_gate: { fotos: [] } },
  business: 'Panadería Sol', category: 'gastronomia', country: 'AR', tone: 'vos', lang: 'es', subcat: '',
  accent: '#0A1E33', btn: '#FEC14D', photoPath: null, extraPhotos: [], feedRecents: [],
  ...extra,
});
const estrellaDistinta = (nombre) => ({ photo_product: nombre, creatividad: { rol: 'tip', estrella: nombre, escena_key: 'x', escena: '' } });

(async () => {
  console.log('== 1) El perfil de continuidad (puro) ==');
  ok('rasgos por pieza + esperadas según el patrón: feed con-texto 0.9 → 3 de 3', () => {
    const posts = [post('text', 'A'), post('text', 'B'), post('clean', 'C')];
    const sps = [sp(FOTO_A), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, estrellaDistinta('Café de especialidad'))];
    const p = demo.perfilContinuidadSerie(posts, sps, { texto_feed: { modo: 'con-texto', n: 10, superpuestos: 9, ratio: 0.9 } }, []);
    assert.deepStrictEqual(p.piezas.map((z) => z.texto), ['con-texto', 'con-texto', 'sin-texto']);
    assert.strictEqual(p.texto.con_texto, 2);
    assert.strictEqual(p.texto.esperadas, 3);
    assert.strictEqual(p.feed_modo, 'con-texto');
  });
  ok('esperadas: feed limpio → 0 · estilo banda → todas · estilo limpia → 0 · sin señal → null', () => {
    const posts = [post('text', 'A'), post('clean', 'B')];
    const sps = [sp(FOTO_A), sp(FOTO_B)];
    assert.strictEqual(demo.perfilContinuidadSerie(posts, sps, { texto_feed: { modo: 'limpio', n: 10, superpuestos: 0, ratio: 0 } }, []).texto.esperadas, 0);
    const spsBanda = [sp(FOTO_A, { estilo_visual: 'banda' }), sp(FOTO_B, { estilo_visual: 'banda' })];
    assert.strictEqual(demo.perfilContinuidadSerie(posts, spsBanda, {}, []).texto.esperadas, 2);
    const spsLimpia = [sp(FOTO_A, { estilo_visual: 'limpia' }), sp(FOTO_B, { estilo_visual: 'limpia' })];
    assert.strictEqual(demo.perfilContinuidadSerie(posts, spsLimpia, { texto_feed: { modo: 'con-texto', ratio: 0.9 } }, []).texto.esperadas, 0);
    assert.strictEqual(demo.perfilContinuidadSerie(posts, sps, {}, []).texto.esperadas, null);
    assert.strictEqual(demo.perfilContinuidadSerie(posts, sps, { texto_feed: { modo: 'sin-senal', n: 2 } }, []).texto.esperadas, null);
  });
  ok('estrellas: grupos por nombre y alternativas del digest sin usar', () => {
    const posts = [post('text', 'A'), post('text', 'B'), post('text', 'C')];
    const sps = [sp(FOTO_A), sp(FOTO_B), sp(FOTO_C, estrellaDistinta('Torta de chocolate'))];
    const p = demo.perfilContinuidadSerie(posts, sps, { producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] }, []);
    const g = p.estrellas.grupos.find((x) => x.nombre === 'Medialuna');
    assert.deepStrictEqual(g.indices, [0, 1]);
    assert.deepStrictEqual(p.estrellas.alternativas, ['Café de especialidad']);
  });
  ok('ritmo del perfil: ratio de video de los recientes del feed', () => {
    const recents = [
      { type: 'video' }, { type: 'video' }, { type: 'image' }, { type: 'video' },
      { type: 'image' }, { type: 'video' }, { type: 'image' }, { type: 'video' },
    ];
    const p = demo.perfilContinuidadSerie([post('text', 'A')], [sp(FOTO_A)], {}, recents);
    assert.strictEqual(p.ritmo.feed_n, 8);
    assert.strictEqual(p.ritmo.feed_ratio_video, 0.63);
    assert.deepStrictEqual(p.ritmo.serie, ['image']);
  });

  console.log('== 2) sistema-de-texto-roto ==');
  await okA('serie con banda en 2 y la tercera sin texto: la tercera se recompone CON texto y pasa', async () => {
    const posts = [post('text', 'P0'), post('text', 'P1'), post('clean', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, estrellaDistinta('Café de especialidad'))];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps));
    assert.strictEqual(posts[2].text_mode, 'text');
    assert.notStrictEqual(posts[2].image, 'data:image/jpeg;base64,P2');
    assert.strictEqual(posts[0].image, 'data:image/jpeg;base64,P0');
    assert.strictEqual(posts[1].image, 'data:image/jpeg;base64,P1');
    const rec2 = r.registro.find((x) => x.i === 2);
    assert.deepStrictEqual(rec2.motivos, ['sistema-de-texto-roto']);
    assert.strictEqual(rec2.salida, 'recompuesta-con-texto');
    assert.strictEqual(rec2.pasa, true);
    assert.strictEqual(r.registro.find((x) => x.i === 0).salida, 'directa');
    assert.ok(r.cambiados.includes(2) && !r.cambiados.includes(0));
    assert.strictEqual(posts[2].continuidad.salida, 'recompuesta-con-texto');
    assert.strictEqual(r.perfil.texto.con_texto, 3);
  });
  await okA('serie consistente con el feed: pasa entera sin tocar una imagen', async () => {
    const posts = [post('text', 'P0'), post('text', 'P1'), post('text', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, estrellaDistinta('Café de especialidad'))];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps));
    assert.deepStrictEqual(r.cambiados, []);
    assert.ok(r.registro.every((x) => x.pasa === true && x.salida === 'directa'));
    assert.strictEqual(posts[1].image, 'data:image/jpeg;base64,P1');
  });
  await okA('feed limpio: la serie sin texto pasa intacta — no se le impone texto', async () => {
    const posts = [post('clean', 'P0'), post('clean', 'P1'), post('clean', 'P2')];
    const sps = [sp(FOTO_A, { text_mode: 'clean' }), sp(FOTO_B, { text_mode: 'clean', ...estrellaDistinta('Torta de chocolate') }), sp(FOTO_C, { text_mode: 'clean', ...estrellaDistinta('Café de especialidad') })];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, {
      digest: { texto_feed: { modo: 'limpio', n: 12, superpuestos: 0, ratio: 0 }, producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] },
    }));
    assert.deepStrictEqual(r.cambiados, []);
    assert.ok(r.registro.every((x) => x.pasa === true));
    assert.strictEqual(r.perfil.texto.esperadas, 0);
  });
  await okA('feed limpio con una pieza con texto: se recompone limpia', async () => {
    const posts = [post('clean', 'P0'), post('text', 'P1'), post('clean', 'P2')];
    const sps = [sp(FOTO_A, { text_mode: 'clean' }), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, { text_mode: 'clean', ...estrellaDistinta('Café de especialidad') })];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, {
      digest: { texto_feed: { modo: 'limpio', n: 12, superpuestos: 0, ratio: 0 }, producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] },
    }));
    assert.strictEqual(posts[1].text_mode, 'clean');
    assert.strictEqual(posts[1].headline, '');
    const rec1 = r.registro.find((x) => x.i === 1);
    assert.deepStrictEqual(rec1.motivos, ['sistema-de-texto-roto']);
    assert.strictEqual(rec1.salida, 'recompuesta-sin-texto');
    assert.strictEqual(rec1.pasa, true);
  });
  await okA('sin señal del feed, la mezcla de la casa (2 con texto, 1 sin) no se condena', async () => {
    const posts = [post('text', 'P0'), post('text', 'P1'), post('clean', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, estrellaDistinta('Café de especialidad'))];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, { digest: { producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] } }));
    assert.strictEqual(r.perfil.texto.esperadas, null);
    assert.deepStrictEqual(r.cambiados, []);
    assert.ok(r.registro.every((x) => x.pasa === true));
  });
  await okA('estilo banda declarado: la pieza limpia se recompone con texto aunque no haya señal', async () => {
    const posts = [post('text', 'P0'), post('clean', 'P1'), post('text', 'P2')];
    const banda = { estilo_visual: 'banda' };
    const sps = [sp(FOTO_A, banda), sp(FOTO_B, { ...banda, ...estrellaDistinta('Torta de chocolate') }), sp(FOTO_C, { ...banda, ...estrellaDistinta('Café de especialidad') })];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, { digest: { producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] } }));
    assert.strictEqual(posts[1].text_mode, 'text');
    assert.strictEqual(r.registro.find((x) => x.i === 1).salida, 'recompuesta-con-texto');
  });
  await okA('la pieza que el juicio desnudó a propósito NUNCA se re-viste: el déficit queda registrado', async () => {
    const posts = [post('text', 'P0'), post('clean', 'P1', { juicio: { pasa: true, motivos: ['texto-no-encaja'], salida: 'recompuesta-sin-texto' } }), post('clean', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, estrellaDistinta('Café de especialidad'))];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps));
    // Déficit 2 (esperadas 3, con texto 1): solo la pieza 2 es
    // reparable; la 1 conserva la decisión del juicio, intacta.
    assert.strictEqual(posts[1].image, 'data:image/jpeg;base64,P1');
    assert.strictEqual(posts[1].text_mode, 'clean');
    assert.strictEqual(r.registro.find((x) => x.i === 1).salida, 'directa');
    assert.strictEqual(posts[2].text_mode, 'text');
    assert.ok(r.serie.notas.some((n) => n.detalle === 'deficit-sin-salida'));
  });

  console.log('== 3) estrella-repetida ==');
  await okA('las 3 venden la misma estrella habiendo alternativas: las repetidas salen por foto de producto nuevo', async () => {
    const posts = [post('text', 'P0'), post('text', 'P1'), post('text', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_C), sp(FOTO_B)];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, {
      extraPhotos: [{ path: CAND_1, url: URL_C1 }, { path: CAND_2, url: URL_C2 }],
      spec: { foto_gate: { fotos: [
        { url: URL_C1, admitida: true, producto: 'Torta de chocolate' },
        { url: URL_C2, admitida: true, producto: 'Café de especialidad' },
      ] } },
    }));
    assert.strictEqual(posts[0].image, 'data:image/jpeg;base64,P0');
    for (const i of [1, 2]) {
      const rec = r.registro.find((x) => x.i === i);
      assert.deepStrictEqual(rec.motivos, ['estrella-repetida']);
      assert.strictEqual(rec.salida, 'foto-candidato');
      assert.strictEqual(rec.pasa, true);
      assert.notStrictEqual(posts[i].image, 'data:image/jpeg;base64,P' + i);
    }
    assert.deepStrictEqual(r.perfil.estrellas.grupos.map((g) => g.nombre).sort(), ['Café de especialidad', 'Medialuna', 'Torta de chocolate']);
  });
  await okA('negocio de una sola estrella: la repetición es su verdad, no se condena', async () => {
    const posts = [post('text', 'P0'), post('text', 'P1'), post('text', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_C), sp(FOTO_B)];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, {
      digest: { texto_feed: { modo: 'con-texto', n: 10, superpuestos: 9, ratio: 0.9 }, producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna'] },
    }));
    assert.deepStrictEqual(r.cambiados, []);
    assert.ok(r.registro.every((x) => x.pasa === true));
    assert.strictEqual(r.perfil.estrellas.grupos.length, 1);
  });
  await okA('estrella repetida sin candidato en el pool: la repetida cae al armado honesto', async () => {
    const posts = [post('text', 'P0'), post('text', 'P1')];
    const sps = [sp(FOTO_A), sp(FOTO_C)];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, {
      digest: { texto_feed: { modo: 'con-texto', n: 10, superpuestos: 9, ratio: 0.9 }, producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate'] },
    }));
    // Exceso 1 y 1 alternativa: la falla se sostiene; sin fotos
    // candidatas, la salida es el armado (el rescate la rearma con
    // la rotación de la cadena), nunca mostrarla rompiendo.
    const rec1 = r.registro.find((x) => x.i === 1);
    assert.deepStrictEqual(rec1.motivos, ['estrella-repetida']);
    assert.strictEqual(rec1.salida, 'armado-rescate');
    assert.strictEqual(rec1.pasa, false);
    assert.strictEqual(posts[1].armando, true);
    assert.strictEqual(posts[1].image, null);
  });

  console.log('== 4) ritmo-roto ==');
  await okA('feed de video y serie sin video ni carrusel: motivo registrado, ninguna pieza tocada', async () => {
    const posts = [post('text', 'P0'), post('text', 'P1'), post('text', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, estrellaDistinta('Café de especialidad'))];
    const recents = [{ type: 'video' }, { type: 'video' }, { type: 'image' }, { type: 'video' }, { type: 'video' }, { type: 'image' }];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, { feedRecents: recents }));
    assert.deepStrictEqual(r.serie.motivos, ['ritmo-roto']);
    assert.strictEqual(r.serie.pasa, false);
    assert.strictEqual(r.serie.salida, 'registrado');
    assert.deepStrictEqual(r.cambiados, []);
  });
  await okA('feed de video y serie CON su video: el ritmo pasa · la pieza de video no se juzga por texto', async () => {
    const pv = { type: 'video', video: 'data:video/mp4;base64,AAAA', caption: 'cap', hashtags: '', text_mode: 'text' };
    const posts = [post('text', 'P0'), pv, post('text', 'P2')];
    const sps = [sp(FOTO_A), sp(FOTO_B, estrellaDistinta('Torta de chocolate')), sp(FOTO_C, estrellaDistinta('Café de especialidad'))];
    const recents = [{ type: 'video' }, { type: 'video' }, { type: 'image' }, { type: 'video' }];
    const r = await demo.aplicarContinuidadSerieTrial(opts(posts, sps, {
      feedRecents: recents,
      digest: { texto_feed: { modo: 'limpio', n: 12, superpuestos: 0, ratio: 0 }, producto_estrella: 'Medialuna', productos_nombrados: ['Medialuna', 'Torta de chocolate', 'Café de especialidad'] },
    }));
    assert.strictEqual(r.serie.pasa, true);
    const recV = r.registro.find((x) => x.i === 1);
    assert.strictEqual(recV.salida, 'sin-pase');
    assert.strictEqual(recV.motivo, 'pieza-video');
    // Y las dos imágenes con texto sobre feed limpio SÍ se corrigen:
    // el video no entra en las comparables de texto.
    assert.strictEqual(posts[0].text_mode, 'clean');
    assert.strictEqual(posts[2].text_mode, 'clean');
  });

  console.log('== 5) Pins de fuente ==');
  ok('la lista cerrada de motivos es exactamente la de la vara de serie', () => {
    assert.deepStrictEqual(demo.CONTINUIDAD_SERIE_MOTIVOS, ['sistema-de-texto-roto', 'estrella-repetida', 'ritmo-roto']);
  });
  ok('las dos rutas enganchan el pase tras el juicio y el registro viaja en el payload', () => {
    assert.strictEqual((SRC.match(/aplicarContinuidadSerieTrial/g) || []).length, 2);
    assert.strictEqual((SRC.match(/continuidad_serie:/g) || []).length, 2);
    const iJ = SRC.indexOf('aplicarJuicioFinalTrial');
    const iC = SRC.indexOf('aplicarContinuidadSerieTrial');
    assert.ok(iJ > 0 && iC > iJ);
    assert.ok(SRC.includes('feedRecents: trialFeedRecentsFromEmbed(_embedPostsVoz)'));
    assert.ok(SRC.includes('feedRecents: trialFeedRecentsFromEmbed(trialData && trialData.posts)'));
  });
  ok('el juicio final queda intacto y exportado (este pase no lo re-juzga)', () => {
    assert.strictEqual(typeof demo.aplicarJuicioFinalTrial, 'function');
    assert.ok(DEMO_SRC.includes('const JUICIO_FINAL_TOPE_POR_PIEZA = 2;'));
    const iJ = DEMO_SRC.indexOf('async function aplicarJuicioFinalTrial');
    const iC = DEMO_SRC.indexOf('async function aplicarContinuidadSerieTrial');
    assert.ok(iJ > 0 && iC > iJ);
  });

  console.log('== 6) CONTROL contra la base: la base no mira la serie ==');
  ok('en ../base no existe el pase ni el perfil, y el payload no lo conoce', () => {
    const baseDemo = require('../base/demo');
    assert.strictEqual(typeof baseDemo.aplicarContinuidadSerieTrial, 'undefined');
    assert.strictEqual(typeof baseDemo.perfilContinuidadSerie, 'undefined');
    const baseSrc = fs.readFileSync(path.join(__dirname, '..', 'base', 'server.js'), 'utf8');
    assert.ok(!baseSrc.includes('continuidad_serie'));
    assert.ok(!baseSrc.includes('aplicarContinuidadSerieTrial'));
  });

  console.log(`\nCONTINUIDAD-DE-SERIE: ${passed} grupos de aserciones OK`);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
