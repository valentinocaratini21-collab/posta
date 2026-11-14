// test-lote-etiqueta-y-texto.js — LOTE ETIQUETA-Y-TEXTO (defecto de
// la puerta de calidad de la re-corrida Blind Barber 14/11: los
// posteos 676/678). Tres piezas contra el diagnóstico
// (.diag-etiqueta-tienda/DIAGNOSIS.md §4/§7):
//
//   A. LA PILL DE LA CASA SALE DE LA PRUEBA: la familia entera de
//      tags de catálogo (NEW/NUEVO, TIP, GIVEAWAY/SORTEO, DEAL,
//      COMBO, 2X1…) no dibuja pill en ninguna pieza de la prueba.
//      Pins a nivel spec (JSON) y a nivel render (spec.json del
//      renderer). Fuera de la prueba, la pill histórica sigue.
//   B. DETECTOR DE CROMO EN LA ADMISIÓN: la pasada de visión que ya
//      corre (classifyBrandPresence) suma cromo_tienda/cromo_texto
//      (cero llamadas nuevas); pickWebPhoto rechaza la foto con
//      cromo EN LA PRUEBA — incluso si es el producto (el caso 678:
//      el banner ES el Discovery Set) — y el veredicto queda
//      registrado en el foto_gate. El texto impreso EN el
//      producto/packaging no es cromo (packaging «NEW FORMULA»
//      admite).
//   C. LA SEÑAL DEL FEED, GARANTIZADA + DEFAULT LIMPIO + QA FINAL:
//      (C1) el armado termina siempre con digest.texto_feed presente
//      o un motivo registrado (el corte estaba en el FRONT:
//      prueba.html/en-prueba.html nunca reenviaban el `estilo` del
//      prefill — la traza completa va en el STATUS del lote);
//      (C2) sin señal, el wow sale con la foto limpia (la campeona
//      de titulares NO puede forzarlo a 'text');
//      (C3) qaTrialWowFinal juzga la imagen FINAL del wow (nueva QA
//      de demo-ai; su cableado en generate/generate-stream se pina
//      en §0 — correrla de punta a punta exige la visión real,
//      fuera del sandbox);
//      (C4) primerPosteoGate evalúa la pill con señal limpio y
//      registra el feed_modo y la ausencia de señal.
//
// Fixtures REALES del diagnóstico (evidencia/): SpeakeasyNotes
// ADMITE · el hero Discovery Set RECHAZA por cromo cuando la visión
// lo dictamina («SHOP NOW») · Glasshouse ADMITE · una grilla con
// SALE horneada RECHAZA · el packaging «NEW FORMULA» ADMITE. La
// visión está STUBEADA (no hay clave en el sandbox): lo que se pina
// es el CONTRATO — el campo viaja en la misma llamada, el parseo lo
// conserva, la admisión lo obedece y el registro lo guarda. La
// corrida real de visión con el campo nuevo queda para la próxima
// corrida de prueba en producción (declarado en el STATUS).
//
// Corre: node test-lote-etiqueta-y-texto.js (desde la raíz del
// árbol; si existe un árbol hermano ../base, corre además los
// controles de regresión contra la base).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const HERE = __dirname;
const ROOT = fs.existsSync(path.join(HERE, 'server.js')) ? HERE : path.join(HERE, 'release');
const BASE = fs.existsSync(path.join(HERE, '..', 'base', 'server.js')) ? path.join(HERE, '..', 'base') : null;
const EV = path.join(os.homedir(), 'workspace', '.diag-etiqueta-tienda', 'evidencia');

const deepRead = require(path.join(ROOT, 'deep-read.js'));
const clientDigest = require(path.join(ROOT, 'client-digest.js'));
const demo = require(path.join(ROOT, 'demo.js'));
const demoAi = require(path.join(ROOT, 'demo-ai.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ok', name); }
  else { failed++; console.log('  MAL', name, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); }
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const count = (src, s) => src.split(s).length - 1;

const F = {
  speakeasy: path.join(EV, 'src-SpeakeasyNotes.webp'),
  hero: path.join(EV, 'src-BB_Discovery_Set_mobile-hero-v1.webp'),
  glasshouse: path.join(EV, 'src-EauDeParfumGlasshouse-bottle.webp'),
  packaging: path.join(EV, 'src-EauDeParfumSpeakeasy-Packaging.webp'),
};
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'etq-suite-'));
const salePath = path.join(stage, 'grilla-sale.webp');
fs.copyFileSync(F.glasshouse, salePath); // portador de la grilla con SALE (el veredicto lo dicta la visión stubeada)

/* ================= §0 Pins estáticos de las costuras ================= */
console.log('— §0: costuras —');
{
  const dr = read('deep-read.js'), cd = read('client-digest.js'), dm = read('demo.js'), srv = read('server.js'), dai = read('demo-ai.js');
  const pru = read('public/prueba.html'), enp = read('public/en-prueba.html');
  ok('deep-read: la consigna de presencia pregunta por el CROMO DE TIENDA WEB', dr.includes('CROMO DE TIENDA WEB') && dr.includes('SHOP NOW') && dr.includes('new formula'));
  ok('deep-read: el JSON pedido trae cromo_tienda y cromo_texto', dr.includes('"cromo_tienda"') && dr.includes('"cromo_texto"'));
  ok('deep-read: el parseo conserva el cromo solo cuando es booleano', dr.includes('(res.cromo_tienda === true) ? true : (res.cromo_tienda === false ? false : null)'));
  ok('client-digest: sanitize conserva el cromo y exporta los getters', cd.includes('brandCromoOf') && cd.includes('brandCromoTextoOf') && cd.includes('cromo_tienda'));
  ok('demo: el pool anota el veredicto de cromo desde el digest', dm.includes('w.cromo_verdict = cv'));
  ok('demo: pickWebPhoto rechaza el cromo en la prueba', dm.includes('w.cromo_verdict === true) return false'));
  ok('demo (pieza A): la pill sale de toda la prueba junto a la regla de subline', dm.includes('if (trialNoStock) specPosts.forEach((sp) => { if (sp) sp.pill = \'\'; });'));
  ok('demo (C2): el default sin señal está gateado por la prueba', dm.includes('const sinSenalTextoFeed = !!(trialNoStock && tfModo === null);') && dm.includes('texto_sin_senal = true'));
  ok('demo (C4): el gate frena la pill con feed limpio y registra el feed_modo', dm.includes('pill-superpuesta-feed-limpio') && dm.includes('pill_frenada') && dm.includes('sin_senal: feedModoGate === null'));
  ok('demo: el foto_gate registra el cromo por foto y en el resumen', dm.includes('cromo_tienda: typeof cvGate') && dm.includes('con_cromo'));
  ok('demo-ai: qaTrialWowFinal existe y está exportada', typeof demoAi.qaTrialWowFinal === 'function');
  ok('server: la garantía de la señal existe (helper + generate + stream)', count(srv, 'trialTextoFeedGarantizado') === 3);
  ok('server: trialWowFinalQa existe y se aplica en las DOS rutas', count(srv, 'trialWowFinalQa') >= 3 && srv.includes("accion === 'recomponer'") && srv.includes('wowBufLimpio0'));
  ok('prueba.html: el front REENVÍA el estilo del prefill (el corte C1)', pru.includes("fd.append('estilo', JSON.stringify(pf.j.style))"));
  ok('en-prueba.html: el espejo EN también reenvía el estilo', enp.includes("fd.append('estilo', JSON.stringify(pf.j.style))"));
}

/* ============ §1 La visión dicta el cromo (fixtures reales) ============ */
console.log('— §1: classifyBrandPresence con los fixtures del diagnóstico —');
function visionStub(verdicts) {
  const cap = { consigna: '' };
  const fetchImpl = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const content = body.messages[0].content;
    cap.consigna = content.find((c) => c.type === 'text').text;
    const nImg = content.filter((c) => c.type === 'image_url').length;
    const results = [];
    for (let i = 0; i < nImg; i++) results.push(Object.assign({ i }, verdicts[i]));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ results }) } }] }) };
  };
  return { fetchImpl, cap };
}
(async () => {
  const fotos = [
    { key: 'k0', path: F.speakeasy },
    { key: 'k1', path: F.hero },
    { key: 'k2', path: F.glasshouse },
    { key: 'k3', path: salePath },
    { key: 'k4', path: F.packaging },
  ];
  const { fetchImpl, cap } = visionStub([
    { marca: true, tipo: 'ambos', cromo_tienda: false },
    { marca: true, tipo: 'texto', cromo_tienda: true, cromo_texto: 'SHOP NOW' },
    { marca: true, tipo: 'texto', cromo_tienda: false },
    { marca: false, tipo: 'ninguno', cromo_tienda: true, cromo_texto: 'SALE -30%' },
    { marca: true, tipo: 'ambos', cromo_tienda: false },
  ]);
  const v = await deepRead.classifyBrandPresence({ photos: fotos, business: 'Blind Barber', apiKey: 'test', fetchImpl });
  const by = (i) => v[fotos[i].key];
  ok('la MISMA llamada lleva la pregunta de cromo (cero llamadas nuevas)', cap.consigna.includes('CROMO DE TIENDA WEB') && cap.consigna.includes('SHOP NOW'));
  ok('SpeakeasyNotes: sin cromo (ADMITE por este detector)', by(0).cromo_tienda === false);
  ok('el hero Discovery Set: cromo de tienda con su texto («SHOP NOW»)', by(1).cromo_tienda === true && by(1).cromo_texto === 'SHOP NOW');
  ok('Glasshouse: sin cromo (ADMITE)', by(2).cromo_tienda === false);
  ok('la grilla con SALE horneada: cromo de tienda (RECHAZA)', by(3).cromo_tienda === true && /SALE/.test(by(3).cromo_texto));
  ok('el packaging «NEW FORMULA»: el texto del packaging NO es cromo (ADMITE)', by(4).cromo_tienda === false);
  ok('REGRESIÓN: el veredicto de marca viaja intacto junto al cromo', by(0).marca === true && by(0).tipo === 'ambos' && by(1).marca === true && by(3).marca === false);
  // Aditivo: una respuesta de visión SIN el campo nuevo no rompe nada.
  const sin = visionStub([{ marca: true, tipo: 'ambos' }]);
  const v2 = await deepRead.classifyBrandPresence({ photos: [fotos[0]], business: 'Blind Barber', apiKey: 'test', fetchImpl: sin.fetchImpl });
  ok('respuesta sin el campo cromo → el veredicto no trae la clave (compat total)', v2[fotos[0].key].cromo_tienda === undefined && v2[fotos[0].key].marca === true);

  /* ============ §2 El digest conserva el veredicto ============ */
  console.log('— §2: client-digest — el cromo sobrevive al saneado —');
  {
    const d = clientDigest.buildFromParts({
      business: 'Blind Barber', category: 'barberia',
      brandPresence: {
        uBanner: { marca: true, tipo: 'texto', detalle: 'banner', cromo_tienda: true, cromo_texto: 'SHOP NOW' },
        uBotella: { marca: true, tipo: 'ambos', cromo_tienda: false },
        uVieja: { marca: true, tipo: 'ambos' },
        uRara: { marca: true, cromo_tienda: 'si', cromo_texto: 42 },
      },
    });
    ok('brandCromoOf: true / false / null (sin campo) / null (tipo inválido)',
      clientDigest.brandCromoOf(d, 'uBanner') === true && clientDigest.brandCromoOf(d, 'uBotella') === false
      && clientDigest.brandCromoOf(d, 'uVieja') === null && clientDigest.brandCromoOf(d, 'uRara') === null
      && clientDigest.brandCromoOf(d, 'uInexistente') === null);
    ok('brandCromoTextoOf: el texto viaja solo con cromo verdadero',
      clientDigest.brandCromoTextoOf(d, 'uBanner') === 'SHOP NOW' && clientDigest.brandCromoTextoOf(d, 'uBotella') === null);
  }

  /* ============ §3 La admisión obedece (pickWebPhoto) ============ */
  console.log('— §3: pickWebPhoto — el banner no entra a la prueba —');
  {
    const topic = { tema: 'fragancia', digest_anchor: 'Discovery Set: Collection 1', _wow: true };
    const ctx = demo.photoGateCtx({ category: 'barberia', subcat: null, topic, isCafe: false, trialNoStock: true });
    const banner = { path: '/x/banner.jpg', url: 'u-banner', temas: ['producto'], producto: 'Discovery Set: Collection 1', marca_verdict: true, marca_visible: true, cromo_verdict: true, cromo_texto: 'SHOP NOW' };
    const botella = { path: '/x/botella.jpg', url: 'u-botella', temas: ['producto'], producto: 'Discovery Set: Collection 1', marca_verdict: true, marca_visible: true, cromo_verdict: false };
    const hit = demo.pickWebPhoto(topic, [banner, botella], new Set(), ctx);
    ok('el slot cae al próximo candidato: la botella limpia, no el banner', !!hit && hit.path === '/x/botella.jpg');
    ok('solo el banner en el pool → null (el slot cae al camino sin foto/generado, nunca al banner)', demo.pickWebPhoto(topic, [banner], new Set(), ctx) === null);
    const sinAnotar = { path: '/x/sin.jpg', url: 'u-sin', temas: ['producto'], producto: 'Discovery Set: Collection 1', marca_verdict: true };
    ok('sin veredicto de cromo anotado, la foto sigue elegible (null no rechaza: fail-closed solo con true)', !!demo.pickWebPhoto(topic, [sinAnotar], new Set(), ctx));
    const ctxFuera = demo.photoGateCtx({ category: 'barberia', subcat: null, topic, isCafe: false, trialNoStock: false });
    ok('FUERA de la prueba el detector no manda: el banner sigue elegible como hoy', !!demo.pickWebPhoto(topic, [banner], new Set(), ctxFuera));
  }

  /* ============ §4 El spec: pill fuera + default limpio ============ */
  console.log('— §4: buildDemoSpec — la prueba sin pill y sin señal = foto limpia —');
  const DRAFT_TITULARES = { rondas: [{ dim: 'texto', elegida: 'titulares' }], dims: ['texto'], campeona: { dim: 'texto', v: 'titulares' } };
  const specDe = (digest, extra) => demo.buildDemoSpec(Object.assign({
    business: 'Blind Barber', category: 'barberia', country: 'US', tone: 'vos',
    photoPath: F.speakeasy, goal: '', count: 5, profilePicPath: null, digest, lang: 'en', trialNoStock: true,
  }, extra || {}));
  {
    const s = specDe({ texto_feed: { modo: 'con-texto', n: 10, superpuestos: 6, ratio: 0.6, tamano: 'large' } });
    ok('PIEZA A: ninguna pieza de la prueba lleva pill (la familia entera: NEW/TREND/TIP…)', s.specPosts.every((p) => p.pill === ''), s.specPosts.map((p) => p.pill));
    ok('la semana sale ENTERA: 5 piezas (la pill no se llevó ninguna)', s.specPosts.length === 5);
    const sf = specDe(null, { trialNoStock: false });
    ok('FUERA de la prueba la pill histórica sigue presente', sf.specPosts.some((p) => p.pill), sf.specPosts.map((p) => p.pill));
  }
  {
    const s = specDe({}, { draft: DRAFT_TITULARES });
    ok('C2: sin señal, la campeona de titulares NO fuerza el wow a texto: sale limpio', s.specPosts[0].text_mode === 'clean', s.specPosts[0].text_mode);
    ok('C2: la pieza registra el porqué (texto_sin_senal) y el spec el motivo', s.specPosts[0].texto_sin_senal === true && s.texto_feed_motivo === 'sin-senal-en-digest');
    const sc = specDe({ texto_feed: { modo: 'con-texto', n: 10, superpuestos: 6, ratio: 0.6, tamano: 'large' } }, { draft: DRAFT_TITULARES });
    ok('con señal con-texto, la campeona sí fuerza el wow a texto (sin regresión)', sc.specPosts[0].text_mode === 'text', sc.specPosts[0].text_mode);
    const sl = specDe({ texto_feed: { modo: 'limpio', n: 12, superpuestos: 0, ratio: 0, tamano: null } });
    ok('con señal limpio, el wow sale limpio (regresión v1022)', sl.specPosts[0].text_mode === 'clean' && sl.texto_feed_motivo === null);
  }

  /* ============ §5 El gate evalúa la pill y registra la señal ============ */
  console.log('— §5: primerPosteoGate —');
  {
    const g = demo.primerPosteoGate;
    const sano = { identidadOk: true, legible: true, uniforme: true, marcaReal: true, headline: 'Nuevo en la casa', caption: 'Llegó el Speakeasy, la fragancia de la casa. Pedila por DM.', mode: 'text' };
    const conPill = g({ ...sano, textoFeed: { modo: 'limpio', n: 10, superpuestos: 0, ratio: 0 }, pill: 'NEW' });
    ok('C4: feed limpio + pill → el gate la frena con su motivo', conPill.veredicto.motivos.includes('pill-superpuesta-feed-limpio'), conPill.veredicto.motivos);
    ok('C4: el registro guarda la pill y su freno', conPill.texto.pill === 'NEW' && conPill.texto.pill_frenada === true);
    const sinPill = g({ ...sano, textoFeed: { modo: 'limpio', n: 10, superpuestos: 0, ratio: 0 }, pill: '' });
    ok('feed limpio sin pill → sin ese motivo y pill_frenada false', !sinPill.veredicto.motivos.includes('pill-superpuesta-feed-limpio') && sinPill.texto.pill_frenada === false);
    const conTexto = g({ ...sano, textoFeed: { modo: 'con-texto', n: 10, superpuestos: 6, ratio: 0.6 }, pill: 'NEW' });
    ok('feed con-texto + pill → la pill no se frena (jurisdicción: solo limpio)', !conTexto.veredicto.motivos.includes('pill-superpuesta-feed-limpio'));
    const sinSenal = g({ ...sano, textoFeed: null });
    ok('C4: sin señal, el registro lo dice en el acto (sin_senal true, feed_modo null)', sinSenal.texto.sin_senal === true && sinSenal.texto.feed_modo === null);
    const honesta = g({ ...sano, textoFeed: { modo: 'sin-senal', n: 0, superpuestos: 0, ratio: null } });
    ok('la señal honesta de la garantía también queda visible (feed_modo sin-senal)', honesta.texto.feed_modo === 'sin-senal' && honesta.texto.sin_senal === true);
  }

  /* ============ §6 La QA de la imagen final (unidad) ============ */
  console.log('— §6: qaTrialWowFinal — el juicio de encaje —');
  {
    const b64 = fs.readFileSync(F.speakeasy).toString('base64');
    const stubQa = (payload) => async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) });
    const rOk = await demoAi.qaTrialWowFinal({ b64, feedMode: 'limpio', apiKey: 'test', fetchImpl: stubQa({ texto_no_tapa: true, superpuestos: [], horneado: false, encaja: true, detalle: 'foto limpia' }) });
    ok('foto limpia sobre feed limpio → pasa, sin superpuestos', rOk && rOk.passed === true && rOk.superpuestos.length === 0 && rOk.horneado === false);
    const rComp = await demoAi.qaTrialWowFinal({ b64, feedMode: 'limpio', apiKey: 'test', fetchImpl: stubQa({ texto_no_tapa: true, superpuestos: ['NEW ARRIVAL'], horneado: false, encaja: false, detalle: 'titular genérico sobre foto de producto' }) });
    ok('titular compuesto que no encaja → no pasa, con el inventario', rComp && rComp.passed === false && rComp.superpuestos[0] === 'NEW ARRIVAL' && rComp.horneado === false);
    const rHorn = await demoAi.qaTrialWowFinal({ b64, feedMode: 'limpio', apiKey: 'test', fetchImpl: stubQa({ texto_no_tapa: true, superpuestos: ['SHOP NOW'], horneado: true, encaja: false, detalle: 'botón horneado en la foto fuente' }) });
    ok('texto horneado → se distingue del compuesto (horneado true)', rHorn && rHorn.horneado === true);
    ok('sin clave → null (no dictamina, el armado sigue)', (await demoAi.qaTrialWowFinal({ b64, feedMode: 'limpio', apiKey: '', fetchImpl: stubQa({}) })) === null);
    const ilegible = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'no es json' } }] }) });
    ok('respuesta ilegible → null', (await demoAi.qaTrialWowFinal({ b64, feedMode: 'limpio', apiKey: 'test', fetchImpl: ilegible })) === null);
  }

  /* ============ §7 El render sale sin pill (JSON del renderer) ============ */
  console.log('— §7: render — la spec de novedad de la prueba llega al renderer sin pill —');
  {
    const s = specDe({ texto_feed: { modo: 'con-texto', n: 10, superpuestos: 6, ratio: 0.6, tamano: 'large' } });
    const novedadCruda = s.specPosts.find((p) => p.kind === 'novedad');
    // El spec del armado marca la foto como {userPhoto:true} y la
    // ruta la resuelve generateDemo al renderizar: acá se le da la
    // ruta del fixture (la foto real del armado). El contrato
    // pineado es el pill del JSON, no la foto.
    const novedad = { ...novedadCruda, photo: F.speakeasy };
    const r = await demo.renderSpecPngs([novedad], { accent: '#112233', btn: '#445566' });
    const specJson = JSON.parse(fs.readFileSync(path.join(r.runDir, 'spec.json'), 'utf8'));
    ok('el JSON que consume el renderer trae la pieza SIN pill', specJson.posts[0].pill === '' || specJson.posts[0].pill === undefined, specJson.posts[0].pill);
    ok('el buffer de la pieza existe (la pieza se dibujó)', !!(r.bufs[0] && r.bufs[0].length > 1000));
    const conPill = { ...novedad, pill: 'NEW', text_mode: 'text' };
    const r2 = await demo.renderSpecPngs([conPill], { accent: '#112233', btn: '#445566' });
    const specJson2 = JSON.parse(fs.readFileSync(path.join(r2.runDir, 'spec.json'), 'utf8'));
    ok('CONTROL: el mecanismo de la pill existe (con pill en el spec, el JSON la trae y el dibujo cambia)', specJson2.posts[0].pill === 'NEW' && !r2.bufs[0].equals(r.bufs[0]));
    try { fs.rmSync(r.runDir, { recursive: true, force: true }); fs.rmSync(r2.runDir, { recursive: true, force: true }); } catch (e) {}
  }

  /* ============ §8 Controles contra la base (si está) ============ */
  if (BASE) {
    console.log('— §8: controles de regresión contra la base —');
    const demoB = require(path.join(BASE, 'demo.js'));
    const specB = (digest, extra) => demoB.buildDemoSpec(Object.assign({
      business: 'Blind Barber', category: 'barberia', country: 'US', tone: 'vos',
      photoPath: F.speakeasy, goal: '', count: 5, profilePicPath: null, digest, lang: 'en', trialNoStock: true,
    }, extra || {}));
    const sb = specB({ texto_feed: { modo: 'con-texto', n: 10, superpuestos: 6, ratio: 0.6, tamano: 'large' } });
    ok('CONTROL base: la prueba SÍ llevaba pill (NEW/TREND/TIP) — el hueco de la pieza A', sb.specPosts.some((p) => p.pill), sb.specPosts.map((p) => p.pill));
    const sb2 = specB({}, { draft: DRAFT_TITULARES });
    ok('CONTROL base: sin señal, la campeona forzaba el wow a texto — el hueco de C2', sb2.specPosts[0].text_mode === 'text', sb2.specPosts[0].text_mode);
    const gb = demoB.primerPosteoGate({ identidadOk: true, legible: true, uniforme: true, marcaReal: true, headline: 'Nuevo en la casa', caption: 'Llegó el Speakeasy. Pedila por DM.', mode: 'text', textoFeed: { modo: 'limpio', n: 10, superpuestos: 0, ratio: 0 }, pill: 'NEW' });
    ok('CONTROL base: el gate no conocía la pill — el hueco de C4', !gb.veredicto.motivos.includes('pill-superpuesta-feed-limpio'));
  }

  console.log(`\nRESULTADO: ${passed} ok · ${failed} MAL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL', e); process.exit(2); });
