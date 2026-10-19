'use strict';
/* test-deep-read.js — LECTURA PROFUNDA (v230, 2026-10-18)
 * Aprobado por Valentino: "armá todo" sobre los 6 bloques para que Posty
 * lea aún mejor la web y el Instagram del cliente. Negocio fixture
 * "Café Aroma" con TODO plantado:
 *  (a) web multipágina: el ítem estrella SOLO existe en /catalogo;
 *  (b) menú PDF enlazado con 3 ítems (uno exclusivo del PDF);
 *  (c) link de bio tipo linktree con tienda;
 *  (d) captions donde el cliente nombra el producto con apodo propio;
 *  (e) fotos mapeables a productos (visión mockeada);
 *  (f) contradicción de precio web vs bio-link.
 * El digest resultante tiene que mostrar los 6 bloques y sus
 * consumidores: temas con el estrella primero, gate foto↔PRODUCTO,
 * léxico en el bloque de prompt. USD 0: IO inyectado, visión mockeada.
 * Corre con: node test-deep-read.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-deep-'));
process.env.DATA_DIR = TMP;

const clientDigest = require('./client-digest');
const deepRead = require('./deep-read');
const demo = require('./demo');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

// ---------- fixture: PDF mínimo con stream comprimido ----------
function makePdf(lines) {
  const esc = (s) => s.replace(/([()\\])/g, '\\$1');
  const content = 'BT /F1 14 Tf 40 800 Td ' + lines.map((l) => `(${esc(l)}) Tj 0 -22 Td`).join(' ') + ' ET';
  const stream = zlib.deflateSync(Buffer.from(content, 'latin1'));
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n${stream.toString('latin1')}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
const PDF_BUF = makePdf([
  'MENU CAFE AROMA',
  'Blend Patagonia 500g .... $11.900',
  'Tarta de limon artesanal $4.200',
  'Medialunas de manteca $1.200',
]);

// ---------- fixture: el sitio + el linktree ----------
const HOME_HTML = `<html><head><title>Café Aroma</title></head><body>
  <h1>Café Aroma</h1>
  <h2>Café en grano 250g</h2><p>Nuestro clásico de todos los días. Precio: $6.500</p>
  <nav><a href="/catalogo">Catálogo completo</a></nav>
</body></html>`;
const CATALOGO_HTML = `<html><head><title>Catálogo — Café Aroma</title></head><body>
  <h2>Blend Patagonia 500g</h2><p>Tueste medio, notas de cacao. $11.900</p>
  <h2>Café en grano 250g</h2><p>$6.500</p>
  <h2>Medialunas de manteca</h2><p>$1.200 la unidad</p>
  <a href="/menu.pdf">Ver el menú en PDF</a>
</body></html>`;
const LINKTREE_HTML = `<html><head><title>Café Aroma links</title></head><body>
  <a href="https://tienda.cafearoma.example/">Nuestra tienda</a>
  <a href="https://www.instagram.com/cafearoma">Instagram</a>
</body></html>`;
const TIENDA_HTML = `<html><head><title>Tienda Café Aroma</title></head><body>
  <h2>Blend Patagonia 500g</h2><p>Llevátelo hoy: $12.500</p>
  <h2>Suscripción mensual de café</h2><p>Todos los meses en tu casa. $18.000</p>
</body></html>`;
const PAGES = {
  'https://cafearoma.example/': { body: HOME_HTML, contentType: 'text/html' },
  'https://cafearoma.example/catalogo': { body: CATALOGO_HTML, contentType: 'text/html' },
  'https://cafearoma.example/menu.pdf': { body: PDF_BUF, contentType: 'application/pdf' },
  'https://linktr.ee/cafearoma': { body: LINKTREE_HTML, contentType: 'text/html' },
  'https://tienda.cafearoma.example/': { body: TIENDA_HTML, contentType: 'text/html' },
};
const ioFixture = {
  fetchBuf: async (url) => {
    const p = PAGES[url];
    if (!p) throw new Error('fixture 404: ' + url);
    return { body: Buffer.isBuffer(p.body) ? p.body : Buffer.from(p.body), contentType: p.contentType, finalUrl: url };
  },
};

const CAPTIONS = [
  'Ya llegó el Patagonia ☕ recién tostado, como siempre',
  'El Patagonia voló esta semana: gracias por tanto amor',
  'Sale el Patagonia para los de siempre',
  'Recién tostado, como siempre ☕',
  'Recién tostado, como siempre ☕',
  'Medialunas del día, recién horneadas',
];
const BLEND_URL = 'https://cafearoma.example/fotos/local.jpg';
const CAFE_URL = 'https://cafearoma.example/fotos/cafe.jpg';

(async () => {
  console.log('== PDF: extractor de respaldo (sin poppler) y vía completa ==');
  {
    const t = deepRead.pdfTextFallback(PDF_BUF);
    ok(/Tarta de limon artesanal/.test(t), 'el fallback extrae el texto del PDF comprimido');
    const full = await deepRead.pdfTextFromBuffer(PDF_BUF);
    ok(/Blend Patagonia/.test(full), 'pdfTextFromBuffer devuelve el menú');
  }

  console.log('== (a)+(b) Catálogo profundo: página de catálogo + PDF ==');
  const crawl = await deepRead.fetchDeepCatalog('cafearoma.example', ioFixture);
  ok(!!crawl, 'el crawl devolvió lectura');
  const catNames = (crawl ? crawl.items : []).map((x) => x.nombre);
  ok(catNames.includes('Blend Patagonia 500g'), 'ítem SOLO de la página de catálogo presente');
  ok(catNames.includes('Tarta de limon artesanal'), 'ítem EXCLUSIVO del PDF presente');
  ok(crawl.items.find((x) => x.nombre === 'Tarta de limon artesanal').fuente === 'pdf', 'el ítem del PDF lleva fuente pdf');
  ok(crawl.pages >= 2, `páginas leídas: ${crawl.pages} (home + catálogo)`);
  ok(crawl.pdfs === 1, `PDFs leídos: ${crawl.pdfs}`);

  console.log('== (c) Link de la bio: linktree → tienda ==');
  const bioLink = await deepRead.fetchBioLink('https://linktr.ee/cafearoma', ioFixture);
  ok(!!bioLink && bioLink.kind === 'linktree', `kind = ${bioLink && bioLink.kind}`);
  ok(bioLink.destinations.includes('https://tienda.cafearoma.example/'), 'destinos reales del linktree');
  const shopNames = bioLink.items.map((x) => x.nombre);
  ok(shopNames.includes('Suscripción mensual de café'), 'ítem de la tienda (1 salto) leído');
  const blendShop = bioLink.items.find((x) => x.nombre === 'Blend Patagonia 500g');
  ok(blendShop && blendShop.precio === '$12.500', `precio del blend en la tienda: ${blendShop && blendShop.precio}`);

  console.log('== (e) Mapa foto→producto con visión mockeada ==');
  const blendFile = path.join(TMP, 'local.jpg');
  const cafeFile = path.join(TMP, 'cafe.jpg');
  fs.writeFileSync(blendFile, Buffer.alloc(4096, 7));
  fs.writeFileSync(cafeFile, Buffer.alloc(4096, 9));
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ results: [
      { i: 0, item: 'Blend Patagonia 500g', confianza: 0.93 },
      { i: 1, item: '', confianza: 0.1 },
      { i: 0, item: 'Producto inventado XYZ', confianza: 0.99 },
    ] }) } }] }),
  });
  const photoEntries = await deepRead.classifyDigestPhotos({
    photos: [{ key: BLEND_URL, path: blendFile }, { key: CAFE_URL, path: cafeFile }],
    items: ['Blend Patagonia 500g', 'Café en grano 250g'],
    apiKey: 'test-key', fetchImpl: mockFetch,
  });
  ok(photoEntries[BLEND_URL] && photoEntries[BLEND_URL].item === 'Blend Patagonia 500g', 'foto mapeada a su producto');
  ok(!photoEntries[CAFE_URL], 'foto sin match seguro queda fuera del mapa');
  ok(Object.keys(photoEntries).length === 1, 'un ítem inventado por la visión NO entra al mapa');

  console.log('== El digest completo: los 6 bloques ==');
  const catalogPart = { ...crawl, at: '2026-10-10T00:00:00.000Z' };   // la web se leyó el 10
  const bioPart = { ...bioLink, at: '2026-10-17T00:00:00.000Z' };      // el link de bio, el 17 (más fresco)
  const digest = clientDigest.buildFromParts({
    business: 'Café Aroma', category: 'cafeteria',
    web: { name: 'Café Aroma', description: 'Café de especialidad en el barrio', services: ['Café en grano 250g'], city: '', palette: [], url: 'https://cafearoma.example/' },
    feed: { bio: 'Café de especialidad · Recién tostado, como siempre', captions: CAPTIONS, name: 'Café Aroma', handle: 'cafearoma' },
    catalog: catalogPart, bioLink: bioPart, photoEntries,
    starSignals: { metrics: [{ text: 'El Patagonia voló: se agotó en dos días', reach: 2400 }] },
  });
  const catBlockNames = (digest.catalog.items || []).map((x) => x.nombre);
  ok(catBlockNames.includes('Blend Patagonia 500g') && catBlockNames.includes('Tarta de limon artesanal'),
    'bloque catalog: ítem de catálogo + exclusivo del PDF');
  ok(digest.fuentes && digest.fuentes.catalog && digest.fuentes.bio_link, 'fuentes con fecha por bloque profundo');
  ok(digest.bio_link && digest.bio_link.kind === 'linktree'
    && digest.bio_link.destinations.includes('https://tienda.cafearoma.example/'), 'bloque bio_link con la tienda');
  const lexEntry = (digest.lexicon.entries || []).find((e) => e.item === 'Blend Patagonia 500g');
  ok(!!lexEntry, 'bloque lexicon: entrada para el blend');
  ok(lexEntry && /patagonia/i.test(lexEntry.dice || ''), `el cliente lo nombra: "${lexEntry && lexEntry.dice}" (apodo de (d))`);
  ok((digest.lexicon.frases || []).some((f) => /recién tostado/i.test(f)), 'frase característica repetida minada');
  ok(clientDigest.lexiconBlock(digest.lexicon).includes('LÉXICO DEL CLIENTE'), 'el léxico sale como bloque de prompt para captions');
  ok(digest.photo_map && digest.photo_map.entries[BLEND_URL]
    && digest.photo_map.entries[BLEND_URL].item === 'Blend Patagonia 500g', 'bloque photo_map cubre la foto');
  ok(digest.inferred_star && digest.inferred_star.item === 'Blend Patagonia 500g',
    `estrella inferido: ${digest.inferred_star && digest.inferred_star.item}`);
  ok(digest.inferred_star && digest.inferred_star.evidence.length >= 2,
    `evidencia del estrella: ${(digest.inferred_star && digest.inferred_star.evidence || []).join(' · ')}`);
  ok(digest.inferred_star && digest.inferred_star.confidence >= 0.5, `confianza ${digest.inferred_star && digest.inferred_star.confidence} (entra a rotación y a pregunta)`);
  const contra = (digest.contradictions || []).find((c) => c.item === 'Blend Patagonia 500g');
  ok(!!contra, '(f) contradicción de precio detectada');
  ok(contra && contra.resolucion === '$12.500' && contra.fuente_resolucion === 'bio-link',
    `resolución por frescura: ${contra && contra.resolucion} (${contra && contra.fuente_resolucion})`);
  const blendMain = digest.productos.find((x) => x.nombre === 'Blend Patagonia 500g');
  ok(blendMain && blendMain.precio === '$12.500', 'el precio que ve el sistema ES la resolución (nada mezclado en silencio)');
  ok(digest.question_candidates.some((q) => q.tipo === 'estrella'), 'question_candidate: confirmar el estrella');
  ok(digest.question_candidates.some((q) => q.tipo === 'contradiccion'), 'question_candidate: resolver la contradicción');
  const frag = clientDigest.dnaFragmentFromDigest(digest);
  ok(frag.producto_estrella === 'Blend Patagonia 500g', 'la siembra al registrarse usa el estrella inferido');

  console.log('== Consumidor 1: deriveTopics abre con el estrella ==');
  {
    const topics = clientDigest.deriveTopics(digest, { count: 5, category: 'cafeteria' });
    ok(topics.length >= 3, `${topics.length} temas derivados`);
    ok(topics[0].digest_anchor === 'Blend Patagonia 500g' && topics[0]._star === 1,
      `primer tema = el estrella (${topics[0].digest_anchor})`);
    const anchors = clientDigest.anchorsOf(digest);
    ok(anchors.some((a) => a.kind === 'lexico'), 'el léxico también ancla (pertenencia)');
    ok(clientDigest.pieceAnchored('El Patagonia recién tostado, pedilo hoy', anchors).ok,
      'una pieza que lo nombra como ÉL pertenece');
  }

  console.log('== Consumidor 2: el gate sube a foto↔PRODUCTO ==');
  {
    const extraPhotos = [
      { path: blendFile, temas: ['local'], url: BLEND_URL },
      { path: cafeFile, temas: ['cafe'], url: CAFE_URL },
    ];
    const spec = demo.buildDemoSpec({ business: 'Café Aroma', category: 'cafeteria', country: 'AR', tone: 'vos', count: 5, extraPhotos, digest });
    const starIdx = spec.topics.findIndex((t) => t && t.digest_anchor === 'Blend Patagonia 500g');
    ok(starIdx >= 0, 'el tema del estrella está en la semana');
    ok(spec.specPosts[starIdx].photo_product === 'Blend Patagonia 500g',
      'la foto elegida es LA del producto (rango 0 del mapa), no la genérica de café');
    ok(spec.photos[starIdx] === blendFile, 'la foto del posteo del estrella es la mapeada');
    // Control: SIN mapa, la misma foto (tags: local) pierde contra la de café.
    const digestSinMapa = { ...digest, photo_map: null };
    const spec2 = demo.buildDemoSpec({ business: 'Café Aroma', category: 'cafeteria', country: 'AR', tone: 'vos', count: 5, extraPhotos, digest: digestSinMapa });
    const starIdx2 = spec2.topics.findIndex((t) => t && t.digest_anchor === 'Blend Patagonia 500g');
    ok(starIdx2 >= 0 && !spec2.specPosts[starIdx2].photo_product && spec2.photos[starIdx2] === cafeFile,
      'control: sin mapa manda el match de tema (foto de café) — el mapa es lo que sube el gate');
  }

  console.log('== Hash de anclas: los bloques nuevos NO lo invalidan ==');
  {
    const stripped = { ...digest };
    delete stripped.catalog; delete stripped.bio_link; delete stripped.lexicon;
    delete stripped.photo_map; delete stripped.inferred_star;
    delete stripped.contradictions; delete stripped.question_candidates;
    ok(clientDigest.digestHashOf(digest) === clientDigest.digestHashOf(stripped),
      'digestHashOf ignora los bloques extendidos (trazabilidad v229 intacta)');
  }

  console.log('== applyDeepBlocks: merge del refresco semanal ==');
  {
    const stored = clientDigest.buildFromParts({
      business: 'Café Aroma', category: 'cafeteria',
      feed: { bio: 'Café de especialidad', captions: CAPTIONS, name: 'Café Aroma', handle: 'cafearoma' },
      photoEntries: { 'file:abc': { item: 'Café en grano 250g', confianza: 0.9 } },
    });
    ok(stored.lexicon && stored.photo_map, 'stored base con léxico y mapa');
    const freshWebOnly = clientDigest.buildFromParts({
      business: 'Café Aroma', category: 'cafeteria',
      web: { name: 'Café Aroma', description: '', services: ['Café en grano 250g'], city: '', palette: [], url: 'https://cafearoma.example/' },
      catalog: catalogPart,
    });
    const merged = clientDigest.applyDeepBlocks(stored, freshWebOnly);
    ok(merged.catalog && merged.catalog.items.length >= 3, 'el catálogo fresco entra');
    ok(merged.lexicon && merged.lexicon.entries.length === stored.lexicon.entries.length,
      'corrida SIN feed no pisa el léxico guardado');
    ok(merged.photo_map.entries['file:abc'] && merged.photo_map.entries['file:abc'].item === 'Café en grano 250g',
      'el mapa guardado sobrevive a una corrida sin fotos nuevas');
    const freshFeed = clientDigest.buildFromParts({
      business: 'Café Aroma', category: 'cafeteria',
      feed: { bio: 'Café de especialidad', captions: CAPTIONS, name: 'Café Aroma', handle: 'cafearoma' },
      photoEntries,
    });
    const merged2 = clientDigest.applyDeepBlocks(merged, freshFeed);
    ok(merged2.photo_map.entries[BLEND_URL] && merged2.photo_map.entries['file:abc'],
      'el mapa se fusiona por clave (lo viejo queda, lo nuevo entra)');
  }

  console.log('== Cableado (contrato de fuentes) ==');
  {
    const srv = fs.readFileSync('server.js', 'utf8');
    const demoSrc = fs.readFileSync('demo.js', 'utf8');
    const feedSrc = fs.readFileSync('feed-audit.js', 'utf8');
    ok(srv.includes("const BUILD_ID = '20261019-v237'"), 'BUILD_ID v230');
    ok(srv.includes('deepRead.fetchDeepCatalog(webUrl)'), 'el sweep lee el catálogo profundo');
    ok(srv.includes('deepRead.fetchBioLink(feedLink)'), 'el sweep sigue el link de la bio');
    ok(srv.includes('classifyDigestPhotos'), 'el sweep clasifica fotos con guarda de gasto');
    ok(srv.includes('clientDigest.applyDeepBlocks(merged, fresh)'), 'el sweep fusiona con applyDeepBlocks');
    ok(srv.includes('clientDigest.lexiconBlock(dg.lexicon)'), 'captionExtrasFor inyecta el léxico');
    ok(srv.includes('photoMappedRefsFor(uid,'), 'el pipeline usa la foto del producto como referencia');
    ok(srv.includes('trialDeepCatalog(webData)') && srv.includes('trialBioLink('), 'la prueba recolecta catálogo y bio-link');
    ok(demoSrc.includes('photoProductFor') && demoSrc.includes('const DEMO_ENGINE_V = 24;'), 'demo: mapa en el gate + motor v22');
    ok(feedSrc.includes('external_url'), 'feed-audit expone el link de la bio');
  }

  console.log(fails ? `\n✗ ${fails} fallas` : '\n✓ TODO VERDE — test-deep-read');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('✗ excepción:', e); process.exit(1); });
