#!/usr/bin/env node
// LOTE FOTOS-ELEGIBILIDAD (L1+L2 del diagnóstico de la corrida Veja #6):
// la prueba entregaba placas sin foto porque las fotos nunca tuvieron
// una vía de elegibilidad viva — (L1) el photo_map se clasificaba
// contra services+catálogo+bio-link, un vocabulario DISJUNTO de los
// nombres que el feed mina de las captions (las anclas reales de los
// temas): para una tienda sin catálogo legible el mapa no podía
// existir y productHit era imposible por construcción; (L2) el
// veredicto de presencia corría una llamada de visión de hasta 45 s
// contra una carrera de 6/7 s, sin caché y sin registro: «sin
// verificar» mudo, corrida tras corrida.
// El lote: (L1) itemNames suma los productos_nombrados ADMITIDOS
// del feed (la vara de C8: namedEntryCandidata desde el lote
// FUNDAMENTO-QUE-DUDA, que separó ADMISIÓN de CORONACIÓN — la
// coronación namedEntryCorroborated exige fuente externa y el
// mapa foto→producto es justamente esa fuente: con la regla de
// coronación el vocabulario nacía vacío; el nombre suelto sin
// evidencia no entra a ninguna de las dos); (L2a) la presencia corre
// como JOB con presupuesto propio (12 s) y caché por hash de
// contenido: la carrera perdida completa en segundo plano y la
// próxima corrida del mismo negocio lee el veredicto sin re-pagar la
// visión; (L2b) el resultado del gate viaja en el payload
// (out.foto_gate: por foto — admisión, producto, veredicto, vía,
// piezas — y los estados de presencia/mapa/vocabulario).
// La puerta NO se toca: fail-closed igual (sin veredicto positivo no
// hay foto), C-FOLD y su preferencia intactos, el render intacto.
// Uso: node test-lote-fotos-elegibilidad.js (desde release/ o la raíz
// del scratch; resuelve los módulos solo). El caso Veja usa los
// insumos reales del diagnóstico si están en /tmp; si no, un fixture
// sintético con la misma forma (services [], catálogo null, captions
// que nombran los modelos, fotos con alt en francés).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const HERE = __dirname;
const ROOT = fs.existsSync(path.join(HERE, 'server.js')) ? HERE : path.join(HERE, 'release');
const clientDigest = require(path.join(ROOT, 'client-digest.js'));
const deepRead = require(path.join(ROOT, 'deep-read.js'));
const demo = require(path.join(ROOT, 'demo.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ok', name); }
  else { failed++; console.log('  MAL', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Fixture Veja (real si está; sintético si no) ---------------- */
function loadFixture() {
  const ingPath = '/tmp/diag-veja6-ingest.json';
  if (fs.existsSync(ingPath)) {
    try {
      const ing = JSON.parse(fs.readFileSync(ingPath, 'utf8'));
      const localized = (ing.localized || []).filter((w) => w && w.url && w.path && fs.existsSync(w.path));
      if (localized.length >= 3 && ing.webData && ing.feed && Array.isArray(ing.feed.posts)) {
        return { real: true, webData: ing.webData, feedPosts: ing.feed.posts, localized };
      }
    } catch (e) { /* cae al sintético */ }
  }
  // Sintético con la misma forma del caso: sitio sin services ni
  // catálogo, captions que nombran dos modelos como sujeto y repetidos
  // (+ un nombre débil de una sola mención suelta, que NO corrobora),
  // fotos de packshot con alt en francés (temas [] como en la corrida).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-elig-'));
  const mk = (name, seed) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, Buffer.alloc(4096, seed));
    return p;
  };
  const localized = [0, 1, 2, 3, 4, 5].map((i) => ({
    url: `https://media.ejemplo-store.com/images/packshot-${i}.jpg`,
    path: mk(`pack-${i}.jpg`, 65 + i),
    temas: [],
  }));
  const captions = [
    'Meet The Atlas in hairy suede. Natural materials, made to last.',
    'The Salar, where everyone\'s asking for. Back in stock this week.',
    'The Atlas returns — our most loved silhouette of the season.',
    'Salar in natural rubber and recycled mesh. The Salar goes with everything.',
    'Weekend mood at the workshop. Repair, reuse, repeat.',
    'A quick note about the Limited Whisper colorway we shot last spring.',
  ];
  return {
    real: false,
    webData: { name: 'VEJA', description: 'Sneakers en matériaux naturels et recyclés, du caoutchouc d\'Amazonie.', services: [], palette: [], url: 'https://veja-store.com' },
    feedPosts: captions.map((c) => ({ type: 'photo', caption: c, likes: 10, comments: 1 })),
    localized,
  };
}

function buildDigest(fx, { photoEntries = null, brandPresence = null } = {}) {
  const captions = fx.feedPosts.map((p) => p.caption).filter(Boolean);
  const love = fx.feedPosts.map((p) => ({ text: String(p.caption || '').slice(0, 160), reach: 0, likes: Number(p.likes || 0), comments: Number(p.comments || 0) }))
    .filter((m) => m.text).sort((a, b) => ((b.likes + b.comments) - (a.likes + a.comments))).slice(0, 3);
  return clientDigest.buildFromParts({
    business: 'VEJA', category: 'otro',
    web: { name: fx.webData.name, description: fx.webData.description, services: fx.webData.services || [], palette: fx.webData.palette || [], url: fx.webData.url },
    feed: { bio: '', captions, name: 'VEJA', handle: 'veja', pic: '' },
    form: { description: 'Mix: de todo un poco, sin un único producto estrella' },
    catalog: null, bioLink: null,
    photoEntries, brandPresence,
    webCopy: fx.webData.description,
    starSignals: { metrics: love },
    feedPosts: fx.feedPosts,
  });
}

function buildSpec(fx, digest, profilePicPath) {
  const extraPhotos = fx.localized.map((w) => ({ url: w.url, path: w.path, temas: (w.temas || []).slice() }));
  if (extraPhotos.length) extraPhotos[0].temas = [...new Set([...extraPhotos[0].temas, 'marca'])];
  return demo.buildDemoSpec({
    business: 'VEJA', category: 'otro', country: 'US', tone: 'canchero',
    photoPath: null, goal: '', accent: '#FFFFFF', btn: '#000000', count: 5,
    bioText: fx.webData.description, profilePicPath,
    extraPhotos, digest, lang: 'en', trialNoStock: true,
  });
}

// Stub de visión para classifyDigestPhotos: nombra TODAS las fotos
// como `itemName` (o el mapa por índice que se pase), confianza alta.
function stubVisionFetch(itemName, marca) {
  return async (url, opts) => {
    const body = JSON.parse(opts.body);
    const nImg = (body.messages[0].content || []).filter((c) => c.type === 'image_url').length;
    const results = [];
    for (let i = 0; i < nImg; i++) results.push({ i, item: typeof itemName === 'function' ? itemName(i) : itemName, confianza: 0.9, marca: !!marca });
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results }) } }] }) };
  };
}

(async () => {
  const fx = loadFixture();
  console.log(`fixture: ${fx.real ? 'insumos REALES del diagnóstico Veja #6' : 'sintético (misma forma)'} · ${fx.localized.length} fotos · services=${JSON.stringify(fx.webData.services)}`);
  const captions = fx.feedPosts.map((p) => p.caption).filter(Boolean);
  const profilePicPath = fx.localized[0].path; // placeholder; se reemplaza abajo por un archivo distinto
  const medallion = path.join(os.tmpdir(), 'fotos-elig-medallion.jpg');
  fs.writeFileSync(medallion, Buffer.alloc(4096, 90));

  /* ============ A · L1 — vocabulario del feed ============ */
  console.log('A · L1 vocabulario');
  const itemNamesAntes = [...(fx.webData.services || [])]; // services + catálogo(null) + bio(null) de la corrida
  ok('A1 sin vocabulario web: itemNames de la corrida = [] (el mapa no podía existir)', itemNamesAntes.length === 0, itemNamesAntes);
  const named = clientDigest.extractNamedProducts({ captions, items: [], business: 'VEJA', handle: 'veja' });
  ok('A2 el minero del feed encuentra nombres en las captions', named.length >= 2, named.map((e) => e.nombre));
  ok('A2b ningún rótulo de créditos («Model Photo») entra al vocabulario', !named.some((e) => /model photo/i.test(e.nombre)), named.map((e) => e.nombre));
  // RE-PIN (lote FUNDAMENTO-QUE-DUDA): el vocabulario L1 es la
  // ADMISIÓN a la clasificación de fotos, no la coronación. La
  // regla de C8 se partió en dos: namedEntryCorroborated (corona:
  // exige fuente externa — con ella el vocabulario nacía vacío y
  // el mapa foto→producto, que ES la fuente externa, no podía
  // existir) y namedEntryCandidata (admisión: la vara de C8). El
  // server (trialFeedItemNames) usa la de admisión; esta suite
  // espeja ese mismo vocabulario.
  const corroborados = named.filter((e) => clientDigest.namedEntryCandidata(e));
  ok('A3 RE-PIN fundamento-que-duda: la ADMISIÓN de C8 (namedEntryCandidata) deja pasar los modelos reales (≥1)', corroborados.length >= 1, corroborados.map((e) => e.nombre));
  if (!fx.real) {
    ok('A3b el nombre débil (1 mención suelta, «frase» sola) NO se admite y queda fuera', !corroborados.some((e) => /whisper/i.test(e.nombre)), corroborados.map((e) => e.nombre));
  }
  const sinVocab = await deepRead.classifyDigestPhotos({ photos: fx.localized.slice(0, 6).map((w) => ({ key: w.url, path: w.path })), items: [], apiKey: 'test', fetchImpl: stubVisionFetch('The Atlas', false) });
  ok('A4 con items=[] la clasificación devuelve {} (mecánica del «antes»: sin vocabulario no hay mapa)', Object.keys(sinVocab).length === 0, sinVocab);

  // El ancla del wow sale del digest sin mapa (los temas se derivan de él).
  const digest0 = buildDigest(fx, {});
  const spec0 = buildSpec(fx, digest0, medallion);
  const anchor = (spec0.topics && spec0.topics[0] && spec0.topics[0].digest_anchor) || '';
  ok('A5 el tema wow trae ancla del feed (digest_anchor presente)', !!anchor, spec0.topics && spec0.topics[0]);
  ok('A6 el ancla está entre los corroborados (el vocabulario L1 la cubre)', corroborados.some((e) => clientDigest.sameItemName(e.nombre, anchor)), { anchor, corroborados: corroborados.map((e) => e.nombre) });

  // La visión del mapa reporta también la marca en la escena: en el
  // packshot real la «V» de la zapatilla se ve (marca:true). El caso
  // sin marca visible se prueba aparte (B3c/B5): ahí manda el gate de
  // mostrar del wow (§3.4, lote propio ya registrado).
  const entries = await deepRead.classifyDigestPhotos({
    photos: fx.localized.slice(0, 6).map((w) => ({ key: w.url, path: w.path })),
    items: corroborados.map((e) => e.nombre), apiKey: 'test', fetchImpl: stubVisionFetch(anchor, true),
  });
  const entriesPlano = await deepRead.classifyDigestPhotos({
    photos: fx.localized.slice(0, 6).map((w) => ({ key: w.url, path: w.path })),
    items: corroborados.map((e) => e.nombre), apiKey: 'test', fetchImpl: stubVisionFetch(anchor, false),
  });
  ok('A7 con el vocabulario del feed, la visión clasifica las fotos como el ancla (mapa existe)', Object.keys(entries).length >= 3 && Object.values(entries).some((e) => clientDigest.sameItemName(e.item, anchor)), entries);

  /* ============ B · Spec: antes / después ============ */
  console.log('B · spec');
  const esPoster = (sp) => !!sp && (sp.photo_source === 'brand-poster' || sp.poster === true);
  ok('B1 ANTES (sin mapa, sin presencia): el wow sale póster — paridad con la corrida #6', esPoster(spec0.specPosts[0]), spec0.specPosts[0] && spec0.specPosts[0].photo_source);
  ok('B1b ANTES: foto_gate ya registra el porqué (0 con producto, wow póster)', !!spec0.foto_gate && spec0.foto_gate.resumen.con_producto === 0 && spec0.foto_gate.piezas[0].poster === true, spec0.foto_gate && spec0.foto_gate.resumen);

  const digest1 = buildDigest(fx, { photoEntries: entries });
  ok('B2 el digest con mapa trae photo_map con el ancla', !!digest1.photo_map && Object.values(digest1.photo_map.entries).some((e) => clientDigest.sameItemName(e.item, anchor)), digest1.photo_map && Object.keys(digest1.photo_map.entries).length);
  const spec1 = buildSpec(fx, digest1, medallion);
  const fotoWow = spec1.specPosts[0];
  const pathsClasificadas = new Set(fx.localized.filter((w) => entries[w.url]).map((w) => w.path));
  ok('B3 DESPUÉS: el wow gana una foto REAL clasificada como el producto (no el medallón)', pathsClasificadas.has(fotoWow.photo) && fotoWow.photo !== medallion, fotoWow.photo);
  ok('B3b DESPUÉS: photo_source del wow es de producto real', fotoWow.photo_source === 'real-product' || fotoWow.photo_source === 'real-product-brand', fotoWow.photo_source);
  const gateFotoWow = (spec1.foto_gate.fotos || []).find((f) => f.piezas.includes(0));
  ok('B4 foto_gate: la foto del wow entró por la vía «producto», con su nombre', !!gateFotoWow && gateFotoWow.via === 'producto' && clientDigest.sameItemName(gateFotoWow.producto || '', anchor), gateFotoWow);
  ok('B4b foto_gate: piezas[0] no es póster y registra el producto', spec1.foto_gate.piezas[0].poster === false && !!spec1.foto_gate.piezas[0].producto, spec1.foto_gate.piezas[0]);

  // Mapa SIN marca visible en la foto: el candidato A (producto real)
  // EXISTE y es elegible por productHit, pero el gate de MOSTRAR del
  // wow lo pierde por puntaje contra el póster (falla «sin-logo») —
  // es la falla §3.4 del diagnóstico imagen/formato, lote propio ya
  // registrado, FUERA del alcance L1+L2: acá se prueba que la
  // elegibilidad quedó viva y que el porqué queda registrado.
  const specPlano = buildSpec(fx, buildDigest(fx, { photoEntries: entriesPlano }), medallion);
  const gatePlano = specPlano.specPosts[0]._gate || {};
  ok('B3c sin marca visible: el candidato del producto se construyó y perdió SOLO en el gate de mostrar (ganador póster, perdedor con «sin-logo»)', gatePlano.winner === 'b' && !!gatePlano.loser && (gatePlano.loser.failures || []).includes('sin-logo'), gatePlano);
  const gateFotoPlano = (specPlano.foto_gate.fotos || []).find((f) => f.producto && clientDigest.sameItemName(f.producto, anchor));
  ok('B3d foto_gate registra la foto como elegible por «producto» aunque el wow la pierda en el gate de mostrar', !!gateFotoPlano && gateFotoPlano.via === 'producto' && gateFotoPlano.admitida === true, gateFotoPlano);

  // C-FOLD intacto: presencia TODA false no bloquea la vía producto —
  // el candidato se construye igual (la elegibilidad no depende del
  // veredicto de presencia) y foto_gate registra ambos datos.
  const presenciaFalse = Object.fromEntries(fx.localized.map((w) => [w.url, { marca: false, detalle: 'sin marca visible' }]));
  const digest2 = buildDigest(fx, { photoEntries: entriesPlano, brandPresence: presenciaFalse });
  const spec2 = buildSpec(fx, digest2, medallion);
  const gateFold = spec2.specPosts[0]._gate || {};
  ok('B5 con presencia toda-false, el candidato del producto igual se construye (C-FOLD: productHit no depende de presencia)', (gateFold.winner === 'a') || (!!gateFold.loser && (gateFold.loser.failures || []).includes('sin-logo')), gateFold);
  const gateF2 = (spec2.foto_gate.fotos || []).find((f) => f.producto && clientDigest.sameItemName(f.producto, anchor));
  ok('B5b foto_gate registra el veredicto false Y la vía producto (auditable)', !!gateF2 && gateF2.marca_verdict === false && gateF2.via === 'producto', gateF2);

  // …y la puerta sigue fail-closed: sin mapa y sin presencia, todo póster.
  const spec3 = buildSpec(fx, buildDigest(fx, { brandPresence: presenciaFalse }), medallion);
  ok('B6 sin mapa y presencia false: las 5 piezas póster (fail-closed intacto)', spec3.specPosts.every((sp) => esPoster(sp)), spec3.specPosts.map((sp) => sp.photo_source));

  // El mapa de OTRO producto no ensancha la puerta: productHit es por tema.
  const otroNombre = corroborados.map((e) => e.nombre).find((n) => !clientDigest.sameItemName(n, anchor));
  if (otroNombre) {
    const entriesOtro = await deepRead.classifyDigestPhotos({
      photos: fx.localized.slice(0, 6).map((w) => ({ key: w.url, path: w.path })),
      items: corroborados.map((e) => e.nombre), apiKey: 'test', fetchImpl: stubVisionFetch(otroNombre, false),
    });
    const specOtro = buildSpec(fx, buildDigest(fx, { photoEntries: entriesOtro }), medallion);
    ok('B7 mapa con OTRO producto (no el ancla del wow): el wow sigue póster (la vía es por tema)', esPoster(specOtro.specPosts[0]), { otroNombre, anchor, src: specOtro.specPosts[0].photo_source });
  } else {
    console.log('  (B7 omitido: el fixture trae un solo nombre corroborado)');
  }

  // Paridad C7: sin mapa, presencia parcial solo salva una pieza secundaria.
  const presenciaParcial = Object.fromEntries(fx.localized.map((w, i) => [w.url, { marca: i === 0, detalle: '' }]));
  const specParcial = buildSpec(fx, buildDigest(fx, { brandPresence: presenciaParcial }), medallion);
  ok('B8 sin mapa, presencia solo en la foto 0: el wow sigue póster (maxTier de producto intacto)', esPoster(specParcial.specPosts[0]), specParcial.specPosts[0].photo_source);

  // Robustez: sin digest ni fotos, el spec no rompe y el gate viene vacío.
  const specMin = demo.buildDemoSpec({ business: 'X', category: 'otro', country: 'US', tone: 'canchero', photoPath: null, goal: '', accent: '#fff', btn: '#000', count: 3, lang: 'es', trialNoStock: true });
  ok('B9 spec mínimo sin digest/fotos: foto_gate vacío y sin error', !!specMin.foto_gate && specMin.foto_gate.fotos.length === 0 && specMin.foto_gate.resumen.sitio === 0, specMin.foto_gate);

  /* ============ C · L2 — job de presencia (extraído de server.js) ============ */
  console.log('C · job de presencia');
  const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const iRace = serverSrc.indexOf('const raceMs = ');
  const iJob = serverSrc.indexOf('const TRIAL_PRESENCE_BUDGET_MS');
  const iEnd = serverSrc.indexOf('// Transferencia TOTAL al registrarse');
  ok('C0 los marcadores de extracción existen en server.js', iRace >= 0 && iJob > iRace && iEnd > iJob, { iRace, iJob, iEnd });
  const bloque = serverSrc.slice(iRace, serverSrc.indexOf('\n', iRace)) + '\n' + serverSrc.slice(iJob, iEnd)
    + '\n;globalThis.__salida = { raceMs, TRIAL_PRESENCE_BUDGET_MS, trialBrandPresenceJob, trialBrandPresence };';
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-elig-job-'));
  const fotosJob = [0, 1, 2].map((i) => {
    const p = path.join(dirC, `job-${i}.jpg`);
    fs.writeFileSync(p, Buffer.alloc(2048, 97 + i));
    return { url: `https://media.ejemplo-store.com/job-${i}.jpg`, path: p };
  });
  let llamadasVision = 0;
  let demoraVision = 30;
  let veredictosVision = Object.fromEntries(fotosJob.map((w) => [w.url, { marca: true, detalle: 'logo visible' }]));
  const stubDeepRead = {
    VISION_MAX_PHOTOS: 6,
    photoContentKey: (absPath) => {
      try { const buf = fs.readFileSync(absPath); return buf.length ? 'file:' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) : null; } catch (e) { return null; }
    },
    classifyBrandPresence: async () => { llamadasVision++; await sleep(demoraVision); return veredictosVision; },
  };
  const mkCtx = (conClave) => {
    const ctx = {
      console, Promise, Map, Set, JSON, Object, Array, String, Number, Boolean, setTimeout, clearTimeout,
      crypto, process: { env: conClave ? { OPENAI_API_KEY: 'test-key' } : {} },
      deepRead: stubDeepRead, costs: { demoAiCapOk: () => true },
    };
    vm.createContext(ctx);
    vm.runInContext(bloque, ctx);
    return ctx.__salida;
  };
  const ctx = mkCtx(true);
  ok('C1 el presupuesto propio del job es 12000 ms', ctx.TRIAL_PRESENCE_BUDGET_MS === 12000, ctx.TRIAL_PRESENCE_BUDGET_MS);
  const job1 = ctx.trialBrandPresenceJob(fotosJob, ['The Atlas'], 'VEJA');
  const res1 = await ctx.raceMs(job1.promise, ctx.TRIAL_PRESENCE_BUDGET_MS);
  ok('C2 el job resuelve ok con veredictos dentro del presupuesto', !!res1 && res1.estado === 'ok' && !!res1.verdicts && res1.verdicts[fotosJob[0].url].marca === true, res1 && res1.estado);
  ok('C2b la visión se llamó una sola vez', llamadasVision === 1, llamadasVision);
  const job2 = ctx.trialBrandPresenceJob(fotosJob, ['The Atlas'], 'VEJA');
  const res2 = await job2.promise;
  ok('C3 la segunda corrida del mismo negocio lee la CACHÉ (fuente cache, sin re-pagar visión)', res2.fuente === 'cache' && llamadasVision === 1, { fuente: res2.fuente, llamadasVision });
  // Carrera perdida: la promesa sigue y cachea para la próxima.
  llamadasVision = 0; demoraVision = 400;
  const fotosJob2 = [0, 1].map((i) => {
    const p = path.join(dirC, `jobB-${i}.jpg`);
    fs.writeFileSync(p, Buffer.alloc(2048, 120 + i));
    return { url: `https://media.ejemplo-store.com/jobB-${i}.jpg`, path: p };
  });
  veredictosVision = Object.fromEntries(fotosJob2.map((w) => [w.url, { marca: false, detalle: '' }]));
  const job3 = ctx.trialBrandPresenceJob(fotosJob2, ['The Atlas'], 'VEJA');
  const res3 = await ctx.raceMs(job3.promise, 20);
  ok('C4 con la visión lenta, la carrera corta pierde (null) — la ruta registra carrera_perdida', res3 === null, res3);
  await sleep(600);
  const job4 = ctx.trialBrandPresenceJob(fotosJob2, ['The Atlas'], 'VEJA');
  const res4 = await job4.promise;
  ok('C4b la promesa completó en segundo plano y la próxima corrida lee el veredicto de la caché (1 sola llamada)', res4.fuente === 'cache' && !!res4.verdicts && llamadasVision === 1, { fuente: res4.fuente, llamadasVision });
  const compat = await ctx.trialBrandPresence(fotosJob, ['The Atlas'], 'VEJA');
  ok('C5 el envoltorio histórico trialBrandPresence sigue devolviendo veredictos|null', !!compat && compat[fotosJob[0].url].marca === true, compat && Object.keys(compat).length);
  const ctxSin = mkCtx(false);
  const jobSin = ctxSin.trialBrandPresenceJob(fotosJob, ['The Atlas'], 'VEJA');
  ok('C6 sin clave de visión: estadoPre sin_vision (el gate queda sin verificar, declarado)', jobSin.estadoPre === 'sin_vision', jobSin.estadoPre);

  /* ============ D · Pins de fuente ============ */
  console.log('D · pins');
  const count = (s, sub) => s.split(sub).length - 1;
  const demoSrc = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
  ok('D1 trialFeedItemNames: definición + las 2 rutas', count(serverSrc, 'trialFeedItemNames') >= 3, count(serverSrc, 'trialFeedItemNames'));
  ok('D2 las 2 rutas corren el job con el presupuesto propio', count(serverSrc, 'raceMs(presenceJob.promise, TRIAL_PRESENCE_BUDGET_MS)') === 2, count(serverSrc, 'raceMs(presenceJob.promise, TRIAL_PRESENCE_BUDGET_MS)'));
  ok('D3 foto_gate enriquecido en los payloads de las 2 rutas', count(serverSrc, 'foto_gate: trialGateInfo') === 2, count(serverSrc, 'foto_gate: trialGateInfo'));
  ok('D4 ningún llamado viejo raceMs(trialBrandPresence(...)) queda en las rutas', count(serverSrc, 'raceMs(trialBrandPresence(') === 0, count(serverSrc, 'raceMs(trialBrandPresence('));
  ok('D5 demo: foto_gate en el spec y en el spec guardado', count(demoSrc, 'foto_gate: fotoGate') === 1 && count(demoSrc, 'foto_gate: spec.foto_gate') === 1, { a: count(demoSrc, 'foto_gate: fotoGate'), b: count(demoSrc, 'foto_gate: spec.foto_gate') });
  ok('D6 client-digest exporta namedEntryCorroborated (la regla de C8, una sola copia)', typeof clientDigest.namedEntryCorroborated === 'function');
  ok('D6b RE-PIN fundamento-que-duda: client-digest exporta namedEntryCandidata (la admisión L1, separada de la coronación)', typeof clientDigest.namedEntryCandidata === 'function');
  ok('D7 BUILD provisorio del lote', count(serverSrc, "BUILD_ID = '20261105-v1011'") === 1 && count(serverSrc, '20261105-v1010') === 0);

  console.log(`\n${passed} ok · ${failed} mal`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e && e.stack || e); process.exit(2); });
