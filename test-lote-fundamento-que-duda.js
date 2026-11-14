'use strict';
/* Suite LOTE FUNDAMENTO-QUE-DUDA (puntos 3 y 5 del diagnóstico
 * Blind Barber, guest 101, posteos 674/675).
 * La corrida coronó estrella a «Infused» — un adjetivo de los
 * cocktails — con corroboración CIRCULAR (las clases sujeto +
 * repetida salen de las mismas captions que se validaban) y el
 * bonus «más querido» con UNA sola interacción. Los servicios
 * reales (el menú de cortes) nunca entraron al fundamento
 * (digest.servicios = []: la lista «services» de la web entraba
 * toda como productos), la basura nueva (CTAs, encabezados con
 * verbo, slogans en mayúsculas) pasaba los filtros, el mismo
 * producto salió en dos piezas, y la pregunta de estrella que el
 * sistema SÍ generó (question_candidates) no la consumía ninguna
 * superficie de la prueba. Este lote:
 *  (1) la corroboración de estrella/insignia exige UNA fuente
 *      externa (catálogo/sitio/servicios/dueño/foto mapeada): la
 *      evidencia intra-caption sola ya no corona a nadie; la
 *      ADMISIÓN al vocabulario de clasificación de fotos conserva
 *      la vara de C8 (namedEntryCandidata) — es el camino por el
 *      que un nombre del feed consigue su fuente externa.
 *  (2) piso del bonus «más querido» (INFERSTAR_LOVE_MIN = 5).
 *  (3) clases de basura nuevas en isPlausibleOfferItem: CTAs de
 *      tienda, encabezados con verbo de navegación, slogans en
 *      mayúsculas con palabra de slogan, pronombre suelto.
 *  (4) cosecha de servicios: en rubros de servicios, la lista
 *      «services» de la web también pobla digest.servicios, y la
 *      insignia sale de servicios/temas antes que de la tienda.
 *  (5) variedad dura en buildDemoSpec: ningún producto ni foto se
 *      repite entre piezas; sin alternativa, la pieza de la
 *      prueba va a póster/rescate (foto_gate.variedad lo registra).
 *  (6) LA PRUEBA PREGUNTA: trialQuestionFor consume la candidata
 *      (estrella o rubro) con opciones de un toque del fundamento;
 *      las dos rutas de la prueba (generate + generate-stream)
 *      frenan con falta_pregunta ANTES de armar; sin respuesta la
 *      estrella débil no se afirma (debil=true, effectiveStar null).
 * Uso: node test-lote-fundamento-que-duda.js [--no-boot]
 * Control contra la base: LOTE_BASE_DIR=<base v1028>. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
// Las cadenas de require del árbol pueden inicializar la DB en
// ./data relativo al cwd: la suite jamás ensucia el árbol.
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-fq-data-'));

const REL = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.resolve(REL, '..', 'base');
const cd = require(path.join(REL, 'client-digest'));
const demo = require(path.join(REL, 'demo'));
const SERVER_SRC = fs.readFileSync(path.join(REL, 'server.js'), 'utf8');
const PRUEBA = fs.readFileSync(path.join(REL, 'public', 'prueba.html'), 'utf8');
const ENPRUEBA = fs.readFileSync(path.join(REL, 'public', 'en-prueba.html'), 'utf8');
const tieneBase = fs.existsSync(path.join(BASE, 'client-digest.js'));
const cdB = tieneBase ? require(path.join(BASE, 'client-digest')) : null;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function seccion(s) { console.log('\n[' + s + ']'); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }

/* ------------------------------------------------ fixtures */
// La corrida reconstruida: «Infused» repetido como sujeto en los
// captions de los cocktails, UNA interacción en el posteo más
// querido, la vidriera con su CTA y su encabezado con verbo, y el
// menú de servicios en la lista «services» de la home.
const CAPS_BB = [
  'Infused is the word of the season at our lounge. Infused cocktails, always.',
  'Our Infused creations keep the night going. GOOD FROM EVERY ANGLE',
  'Infused, stirred and served at the bar. BETTER TOGETHER',
  'Hair Clay restock day at the shop',
  'Proof Pomade kind of morning',
  'Beard Balm season is open',
];
function mkBlindBarber(mod, extra) {
  return mod.buildFromParts(Object.assign({
    business: 'Blind Barber', category: 'barberia',
    web: { name: 'Blind Barber', description: 'Barbería y lounge', services: ['Corte de pelo', 'Arreglo de barba', 'View product details', 'Explore Blind Barber Fragrance', 'Eau De Parfum - Speakeasy'], city: '', palette: [], url: 'https://blindbarber.example', categoryHint: '' },
    feed: { bio: 'Barbería', captions: CAPS_BB, name: 'Blind Barber', handle: 'blindbarber', pic: '' },
    form: null,
    starSignals: { metrics: [{ text: CAPS_BB[0], likes: 1, comments: 0, reach: 0 }] },
  }, extra || {}));
}
// El mismo negocio con el candidato TAMBIÉN en su catálogo (fuente
// externa): la estrella sí corona.
const CAPS_EXT = [
  'Hair Clay restock day at the shop. Hair Clay is back.',
  'Hair Clay kind of morning, every morning.',
  'Proof Pomade on the shelf today.',
  'Beard Balm season is open.',
];
function mkConCatalogo(mod) {
  return mod.buildFromParts({
    business: 'Blind Barber', category: 'barberia',
    web: { name: 'Blind Barber', description: 'Barbería', services: ['Corte de pelo'], city: '', palette: [], url: 'https://bb.example', categoryHint: '' },
    feed: { bio: 'Barbería', captions: CAPS_EXT, name: 'Blind Barber', handle: 'blindbarber', pic: '' },
    form: null,
    catalog: { items: ['Hair Clay', 'Proof Pomade'], pages: 1, pdfs: 0, at: null },
  });
}

/* ------------------------------------------------ A · control contra la base */
seccion('A · control: la base v1028 reproduce la corrida');
if (cdB) {
  const dBb = mkBlindBarber(cdB);
  ok(!!dBb.inferred_star && dBb.inferred_star.item === 'Infused', 'A1 base: la inferida es el adjetivo «Infused»', dBb.inferred_star);
  ok((dBb.inferred_star.evidence || []).some((e) => /más querido/.test(e)), 'A2 base: el bonus «más querido» coronó con 1 interacción', dBb.inferred_star && dBb.inferred_star.evidence);
  const effB = cdB.effectiveStarOf(dBb);
  ok(!!effB && effB.item === 'Infused', 'A3 base: la puerta circular la corona estrella efectiva', effB);
  ok((dBb.servicios || []).length === 0, 'A4 base: digest.servicios vacío (el menú de cortes nunca entró)', dBb.servicios);
  ok(typeof cdB.trialQuestionFor !== 'function', 'A5 base: no existe forma consumible de la pregunta de la prueba');
  const candB = (dBb.question_candidates || []).find((c) => c.tipo === 'estrella');
  ok(!!candB && candB.debil === undefined, 'A6 base: la candidata nacía pero sin marca de evidencia débil ni superficie', candB);
} else {
  console.log('  (sin base: sección A omitida — pasá LOTE_BASE_DIR)');
}

/* ------------------------------------------------ B · corroboración con fuente externa */
seccion('B · la evidencia intra-caption sola ya no corona');
const ent = (nombre, fuente, clases) => ({ nombre, fuente, menciones: 3, ...(clases ? { clases } : {}) });
ok(cd.namedEntryCorroborated(ent('Infused', 'caption', ['frase', 'repetida', 'sujeto'])) === false,
  'B1 sujeto + repetida (intra-caption) ya NO corrobora');
ok(cd.namedEntryCorroborated(ent('Hair Clay', 'caption', ['frase', 'repetida', 'sujeto', 'catalogo'])) === true,
  'B2 caption + clase catalogo (calce con su tienda) SÍ corrobora');
ok(cd.namedEntryCorroborated(ent('Hair Clay', 'web-catalog')) === true,
  'B3 entrada de fuente externa sin clases corrobora (legado)');
ok(cd.namedEntryCorroborated(ent('Infused', 'caption')) === false,
  'B4 entrada de caption legada sin clases no corrobora');
ok(cd.namedEntryCandidata(ent('Infused', 'caption', ['frase', 'repetida', 'sujeto'])) === true,
  'B5 la ADMISIÓN al vocabulario de clasificación conserva la vara de C8 (dos señales)');
ok(cd.namedEntryCandidata(ent('Whisper', 'caption', ['frase'])) === false,
  'B6 «frase» sola tampoco admite al vocabulario (el nombre suelto sigue afuera)');
{
  // La foto mapeada es la fuente externa que las captions no son.
  const dgFoto = {
    productos_nombrados: [ent('Hair Clay', 'caption', ['frase', 'repetida', 'sujeto'])],
    photo_map: { entries: { 'https://x.example/clay.jpg': { item: 'Hair Clay', confianza: 0.9 } } },
  };
  ok(cd.starNamedEvidenceOk(dgFoto, 'Hair Clay') === true,
    'B7 con foto mapeada al ítem, la evidencia de nombre pasa (fuente externa = la foto)');
  const dgSinFoto = { productos_nombrados: [ent('Hair Clay', 'caption', ['frase', 'repetida', 'sujeto'])] };
  ok(cd.starNamedEvidenceOk(dgSinFoto, 'Hair Clay') === false,
    'B8 sin foto ni catálogo, el mismo nombre NO pasa la puerta');
}

/* ------------------------------------------------ C · la corrida, con el lote */
seccion('C · Blind Barber con el lote: duda, no coronación');
const dR = mkBlindBarber(cd);
ok(!!dR.inferred_star && dR.inferred_star.item === 'Infused',
  'C1 la inferida sigue naciendo (es la DUDA, no la estrella)', dR.inferred_star);
ok(!(dR.inferred_star.evidence || []).some((e) => /más querido/.test(e)),
  'C2 el bonus «más querido» no existe con 1 interacción (piso)', dR.inferred_star && dR.inferred_star.evidence);
ok(cd.effectiveStarOf(dR) === null,
  'C3 sin fuente externa no hay estrella efectiva: «Infused» no se corona');
const candR = (dR.question_candidates || []).find((c) => c.tipo === 'estrella');
ok(!!candR && candR.item === 'Infused' && candR.debil === true,
  'C4 la candidata de estrella nace marcada débil (evidencia intra-caption)', candR);
{
  const q = cd.trialQuestionFor(dR, { lang: 'es' });
  ok(!!q && q.tipo === 'estrella' && q.item === 'Infused' && q.debil === true,
    'C5 la prueba consume la candidata: pregunta por «Infused» marcada débil', q);
  ok(!!q && q.opciones.includes('Infused') && q.opciones.includes('Eau De Parfum - Speakeasy') && q.opciones.length >= 2 && q.opciones.length <= 4,
    'C6 las opciones de un toque salen del fundamento (la candidata + servicios y producto reales)', q && q.opciones);
  ok(!!q && /Infused/.test(q.texto), 'C7 el texto de la pregunta nombra la duda', q && q.texto);
  ok(cd.trialQuestionFor(dR, { lang: 'es', answered: { estrella: true } }) === null,
    'C8 lo ya respondido no se repregunta');
  const qEn = cd.trialQuestionFor(dR, { lang: 'en' });
  ok(!!qEn && /^Is Infused your star product\?$/.test(qEn.texto), 'C9 la pregunta sale en el idioma de la prueba (EN)', qEn && qEn.texto);
}
{
  // Sin respuesta, la estrella débil no se afirma como hecho en la
  // insignia tampoco: la insignia NO es el adjetivo.
  const ins = cd.insigniaOf(dR);
  ok(!ins || ins.frase !== 'Infused', 'C10 la insignia no sale del adjetivo débil', ins);
}

/* ------------------------------------------------ D · con fuente externa, corona */
seccion('D · el candidato con fuente externa sí corona');
const dE = mkConCatalogo(cd);
{
  const entHC = (dE.productos_nombrados || []).find((x) => x.nombre === 'Hair Clay');
  ok(!!entHC && cd.namedEntryCorroborated(entHC) === true,
    'D1 la entrada con clase catalogo corrobora', entHC);
  const effE = cd.effectiveStarOf(dE);
  ok(!!effE && effE.item === 'Hair Clay' && effE.source === 'inferred',
    'D2 la estrella efectiva es el producto real del catálogo', effE);
  const candE = (dE.question_candidates || []).find((c) => c.tipo === 'estrella');
  ok(!!candE && candE.debil === false,
    'D3 la candidata del candidato corroborado nace SIN marca de débil', candE);
}

/* ------------------------------------------------ E · clases de basura nuevas */
seccion('E · CTAs, encabezados con verbo, slogans y pronombres no son ítems');
ok(cd.isPlausibleOfferItem('View product details') === false, 'E1 el CTA «View product details» no es un ítem');
ok(cd.isPlausibleOfferItem('Add to cart') === false, 'E2 el CTA «Add to cart» no es un ítem');
ok(cd.isPlausibleOfferItem('Explore Blind Barber Fragrance') === false, 'E3 encabezado con verbo «Explore…» no es un ítem');
ok(cd.isPlausibleOfferItem('Upgrade Your Grooming Routine') === false, 'E4 encabezado con verbo «Upgrade…» no es un ítem');
ok(cd.isPlausibleOfferItem('GOOD FROM EVERY ANGLE') === false, 'E5 el slogan en mayúsculas no es un ítem');
ok(cd.isPlausibleOfferItem('BETTER TOGETHER') === false, 'E6 el slogan corto en mayúsculas no es un ítem');
ok(cd.isPlausibleOfferItem('Our') === false, 'E7 el pronombre suelto no es un ítem');
ok(cd.isPlausibleOfferItem('Hair Clay') === true, 'E8 un producto real sigue pasando');
ok(cd.isPlausibleOfferItem('HAIR CLAY') === true, 'E9 un producto en mayúsculas SIN palabra de slogan no se toca');
ok(cd.isPlausibleOfferItem('Discovery Set') === true, 'E10 «Discovery Set» no es el verbo «discover»: sigue pasando');
ok(cd.isPlausibleOfferItem('Eau De Parfum - Speakeasy') === true, 'E11 el producto de la corrida sigue pasando');
ok(cd.isPlausibleOfferItem('Corte de pelo') === true, 'E12 el servicio real sigue pasando');
{
  const nombres = (dR.productos || []).map((x) => x.nombre);
  ok(!nombres.includes('View product details') && !nombres.includes('Explore Blind Barber Fragrance'),
    'E13 la basura nueva no entra a digest.productos', nombres);
}

/* ------------------------------------------------ F · cosecha de servicios + insignia */
seccion('F · el menú de servicios entra al fundamento');
{
  const servs = (dR.servicios || []).map((x) => x.nombre);
  ok(servs.includes('Corte de pelo') && servs.includes('Arreglo de barba'),
    'F1 digest.servicios trae el menú de servicios cosechado de la web', servs);
  ok((dR.servicios || []).some((x) => x.nombre === 'Corte de pelo' && x.fuente === 'web'),
    'F2 los servicios cosechados conservan su fuente (web)');
  const dgIns = {
    category: 'barberia', temas_feed: [], productos: [{ nombre: 'Discovery Set' }],
    servicios: [{ nombre: 'Corte y barba', fuente: 'web' }], inferred_star: null, dueno: {}, onboarding: null,
  };
  const ins = cd.insigniaOf(dgIns);
  ok(!!ins && ins.frase === 'Corte y barba' && ins.fuente === 'servicios',
    'F3 en un rubro de servicios la insignia sale de los servicios, no del ítem de tienda', ins);
  const dgDebil = {
    category: 'barberia', temas_feed: [], productos: [],
    servicios: [{ nombre: 'Corte y barba', fuente: 'web' }],
    inferred_star: { item: 'Infused', confidence: 0.76 },
    productos_nombrados: [ent('Infused', 'caption', ['frase', 'repetida', 'sujeto'])],
    dueno: {}, onboarding: null,
  };
  const ins2 = cd.insigniaOf(dgDebil);
  ok(!!ins2 && ins2.frase === 'Corte y barba',
    'F4 la inferida débil tampoco es insignia por la vía del feed: manda el servicio', ins2);
}

/* ------------------------------------------------ G · la pregunta de rubro */
seccion('G · la candidata de rubro también se consume');
{
  const dgRubro = {
    question_candidates: [{ tipo: 'rubro', rubro: 'barberia', opciones: [] }],
    rubro_id: { rubro: 'barberia', nivel_duda: 'rubro', candidatas: [{ rubro: 'barberia', subrubro: '' }, { rubro: 'belleza', subrubro: 'peluqueria' }] },
  };
  const q = cd.trialQuestionFor(dgRubro, { lang: 'es' });
  ok(!!q && q.tipo === 'rubro' && q.opciones.length >= 2,
    'G1 la pregunta de rubro sale con sus opciones de un toque', q);
  ok(!!q && q.opciones.every((o) => o.rubro && typeof o.label === 'string' && o.label),
    'G2 las opciones de rubro traen rubro + rótulo (el front las reenvía como confirmación)', q && q.opciones);
  ok(cd.trialQuestionFor(dgRubro, { lang: 'es', answered: { rubro: true } }) === null,
    'G3 el rubro respondido no se repregunta');
  ok(cd.trialQuestionFor({ question_candidates: [] }, { lang: 'es' }) === null,
    'G4 sin candidata no hay pregunta (no se pregunta por preguntar)');
  ok(cd.trialQuestionFor(null) === null && cd.trialQuestionFor({}) === null,
    'G5 digest vacío o ausente: sin pregunta, sin error');
}

/* ------------------------------------------------ H · variedad dura */
seccion('H · ningún producto ni foto se repite en la semana');
async function variedad() {
  // Fixture mínimo y determinístico de la repetición de la corrida:
  // el pool trae DOS fotos del MISMO producto (el set Speakeasy) y
  // la segunda, con tema 'marca', la toma una pieza anclada a un
  // SERVICIO — la pieza no registra el producto (photo_product
  // vacío): el duplicado solo se ve mirando el producto del pool.
  const photoEntries = {
    'https://bb.example/hero.jpg': { item: 'Eau De Parfum - Speakeasy', confianza: 0.9 },
    'https://bb.example/seat.jpg': { item: 'Eau De Parfum - Speakeasy', confianza: 0.9 },
  };
  const brandPresence = {
    'https://bb.example/hero.jpg': { marca: true }, 'https://bb.example/seat.jpg': { marca: true },
  };
  const caps = [
    'Hair Clay restock day at the shop. Hair Clay is back.',
    'Eau De Parfum - Speakeasy, our signature scent at the lounge.',
    'Speakeasy nights at the bar, always.',
    'Late nights at the bar with the crew.',
    'Beard Balm season is open.',
  ];
  const dV = cd.buildFromParts({
    business: 'Blind Barber', category: 'barberia',
    web: { name: 'Blind Barber', description: 'Barbería y lounge', services: ['Corte de pelo', 'Arreglo de barba'], city: '', palette: [], url: 'https://bb.example', categoryHint: '' },
    feed: { bio: 'Barbería', captions: caps, name: 'Blind Barber', handle: 'blindbarber', pic: '' },
    form: null,
    catalog: { items: ['Eau De Parfum - Speakeasy', 'Hair Clay'], pages: 1, pdfs: 0, at: null },
    photoEntries, brandPresence,
  });
  const extraPhotos = [
    { url: 'https://bb.example/hero.jpg', path: '/tmp/fq-hero.jpg', temas: ['producto'] },
    { url: 'https://bb.example/seat.jpg', path: '/tmp/fq-seat.jpg', temas: ['producto', 'marca'] },
  ];
  const args = {
    business: 'Blind Barber', category: 'barberia', country: 'US', tone: 'canchero',
    photoPath: null, goal: '', accent: '#FFFFFF', btn: '#000000', count: 3,
    bioText: '', profilePicPath: '/tmp/fq-pic.jpg', extraPhotos, digest: dV, lang: 'en', trialNoStock: true,
  };
  const spec = demo.buildDemoSpec(args);
  const poolProd = { '/tmp/fq-hero.jpg': 'Eau De Parfum - Speakeasy', '/tmp/fq-seat.jpg': 'Eau De Parfum - Speakeasy' };
  const fotosUsadas = spec.specPosts.filter((p) => !p.poster).map((p) => p.photo);
  ok(new Set(fotosUsadas).size === fotosUsadas.length,
    'H1 ninguna foto se repite entre las piezas con foto', fotosUsadas);
  const prodsUsados = spec.specPosts.filter((p) => !p.poster).map((p) => p.photo_product || poolProd[p.photo] || null).filter(Boolean);
  ok(new Set(prodsUsados.map((x) => cd.norm(x))).size === prodsUsados.length,
    'H2 ningún producto se repite entre las piezas con foto', prodsUsados);
  const varReg = spec.foto_gate && spec.foto_gate.variedad;
  ok(!!varReg && varReg.repetidas >= 1,
    'H3 la pasada de variedad actuó y quedó registrada en foto_gate.variedad', varReg);
  ok(!!varReg && varReg.resueltas + varReg.a_poster === varReg.repetidas,
    'H4 toda repetición detectada se resolvió (otra foto o póster/rescate)', varReg);
  if (cdB && tieneBase) {
    const demoB = require(path.join(BASE, 'demo'));
    const specB = demoB.buildDemoSpec(args);
    const prodsB = specB.specPosts.filter((p) => !p.poster).map((p) => p.photo_product || poolProd[p.photo] || null).filter(Boolean);
    ok(new Set(prodsB.map((x) => cd.norm(x))).size < prodsB.length,
      'H5 control base: la repetición de producto EXISTÍA en la base (el mismo set en dos piezas)', prodsB);
  }
}

/* ------------------------------------------------ I · cableado de la pregunta */
seccion('I · la puerta está cableada en las dos rutas y en los dos frentes');
ok(count(SERVER_SRC, 'function trialPreguntaGate') === 1, 'I1 el helper de la puerta existe una sola vez');
ok(count(SERVER_SRC, 'trialPreguntaGate(trialDigest, fields, ocAns, lang)') === 2,
  'I2 la puerta se aplica en generate Y en generate-stream');
ok(count(SERVER_SRC, 'falta_pregunta: true, pregunta: preguntaG') === 1 && count(SERVER_SRC, 'falta_pregunta: true, pregunta: preguntaS') === 1,
  'I3 ambas rutas frenan con falta_pregunta + la pregunta con opciones');
for (const [nombre, src] of [['prueba.html', PRUEBA], ['en-prueba.html', ENPRUEBA]]) {
  ok(src.includes('id="fAskWrap"') && src.includes('id="fAskOpts"') && src.includes('id="fAskSkip"'),
    'I4 ' + nombre + ': el bloque de la pregunta existe (pregunta + opciones + seguir sin responder)');
  ok(src.includes('d.falta_pregunta') && src.includes("outcome = 'need_question'") && src.includes("built === 'need_question'"),
    'I5 ' + nombre + ': el stream frena en la pregunta y el submit la muestra');
  ok(src.includes("fd.append('pregunta_estrella', 'skip')") && src.includes("fd.append('pregunta_rubro', 'skip')") && src.includes("fd.append('rubro_src', 'pregunta')"),
    'I6 ' + nombre + ': las respuestas y el salteo viajan como fields en el reenvío');
  ok(src.includes('function showAsk()'), 'I7 ' + nombre + ': showAsk renderiza las opciones de un toque');
}

/* ------------------------------------------------ J · boot smoke */
seccion('J · boot smoke del servidor');
async function bootSmoke() {
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35950 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-fundamento-duda-'));
  const child = spawn('node', ['server.js'], { cwd: REL, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    const t0 = Date.now();
    let version = null;
    while (Date.now() - t0 < 90000) {
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/api/version');
        if (r.ok) { version = await r.json(); break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    ok(!!version && !!version.build, 'J1 el servidor botea y /api/version responde', version || out.slice(-300));
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await variedad();
  await bootSmoke();
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE FUNDAMENTO-QUE-DUDA: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
