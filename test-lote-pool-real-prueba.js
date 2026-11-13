// test-lote-pool-real-prueba.js — LOTE POOL-REAL · ADMISIÓN REAL DEL
// POOL DE FOTOS WEB DE LA PRUEBA (diagnóstico Veja #5, lote A).
// El problema: buildDemoSpec filtraba del pool toda foto web cuyos
// temas derivados dieran [] — y los temas salen de alt/filename con
// una tabla pensada en español. Una marca EN (alt «Model Photo»,
// filenames hasheados) perdía casi todas sus fotos reales antes de
// cualquier elección. El lote: las fotos del PROPIO SITIO se admiten
// por ser suyas (temas/photo_map/URL de producto), los temas pasan a
// ser señal de ranking, y la derivación entiende vocabulario EN.
// Uso: node test-lote-pool-real-prueba.js [árbol]
//   Sin argumento corre contra el árbol donde vive el archivo.
//   Contra la base (v995) corre en modo CONTROL: la admisión vieja
//   deja el pool del fixture Veja en 1 y el slot 0 sale póster.
// Parte 1 (web-extract): vocabulario EN + temasFromUrl + ES intacto.
// Parte 2 (demo): webPhotoAdmitida con el fixture Veja (peor caso).
// Parte 3 (spec): buildDemoSpec de la prueba EN con digest tipo Veja.
// Parte 4 (no-regresión): fixture ES de café + el gate no se ablanda.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const TREE = path.resolve(process.argv[2] || __dirname);
const demoSrc = fs.readFileSync(path.join(TREE, 'demo.js'), 'utf8');
const MODE = demoSrc.includes('webPhotoAdmitida') ? 'release' : 'base';
console.log(`Árbol: ${TREE} — modo: ${MODE}`);

// DATA_DIR temporal ANTES de requerir módulos del árbol (jamás el árbol).
const SUITE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'poolreal-suite-'));
process.env.DATA_DIR = SUITE_TMP;

const webExtract = require(path.join(TREE, 'web-extract.js'));
const clientDigest = require(path.join(TREE, 'client-digest.js'));
const demo = require(path.join(TREE, 'demo.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }

/* ============ Fixture Veja (como llega a buildDemoSpec) ============ */
// Fotos YA localizadas y con la marca de portada aplicada (marcaWebBrand
// en server.js): la og:image trae temas ['marca']; las de producto
// traen [] — el alt era «Model Photo» y el filename un hash de CDN,
// exactamente el caso de la corrida #5.
const OG_URL = 'https://veja-store.com/cdn/shop/files/veja-hero.jpg';
const A1 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/v-10-leather-1.jpg';
const A2 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/v-10-leather-2.jpg';
const A3 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/esplar-1.jpg';
const A4 = 'https://cdn.shopify.com/s/files/1/0588/0001/files/affiche-9f3c2d.jpg';
const A5 = 'https://cdn.shopify.com/s/files/1/0588/0001/products/campo-1.jpg';
const extraPhotosVeja = [
  { path: '/media/web-og.jpg', url: OG_URL, temas: ['marca'] },
  { path: '/media/web-a1.jpg', url: A1, temas: [] },
  { path: '/media/web-a2.jpg', url: A2, temas: [] },
  { path: '/media/web-a3.jpg', url: A3, temas: [] },
  { path: '/media/web-a4.jpg', url: A4, temas: [] },
  { path: '/media/web-a5.jpg', url: A5, temas: [] },
];
// Digest como el de producción: rubro genérico 'otro', feed 6/6
// carrusel, photo_map con dos fotos clasificadas (la visión vio el
// V-10 con marca y el Esplar), productos con nombre real.
const digestVeja = clientDigest.buildFromParts({
  business: 'VEJA', category: 'otro',
  web: { name: 'VEJA', description: 'Sneakers and accessories made with organic and ecological materials', services: ['V-10 Leather', 'Esplar', 'Campo Chromefree'], url: 'https://veja-store.com', city: '', palette: [] },
  feed: {
    bio: 'Sneakers made with organic materials', name: 'Veja', handle: 'veja',
    captions: [
      'The V-10 in chromefree leather, our icon since 2005',
      'V-10 again — restocked in all sizes',
      'Esplar: the classic low-top in white leather',
      'Campo, the everyday sneaker in chromefree leather',
      'V-10 on foot, all day in the city',
      'Our running roots: the Condor story',
    ],
  },
  feedPosts: Array.from({ length: 6 }, () => ({ type: 'GraphSidecar', caption: 'post' })),
  photoEntries: {
    [A1]: { item: 'V-10 Leather', confianza: 0.92, marca: true },
    [A3]: { item: 'Esplar', confianza: 0.85 },
  },
});

/* ================= Parte 1 · derivación de temas ================= */
console.log('— Parte 1: temasFromText / temasFromUrl (web-extract) —');
{
  const T = webExtract.temasFromText;
  // ES intacto (ambos modos): la tabla histórica sigue derivando igual.
  ok(T('medialunas y café con leche').includes('cafe'), "ES: 'medialunas y café' → cafe");
  ok(T('zapatillas de lona').includes('calzado'), "ES: 'zapatillas de lona' → calzado");
  ok(T('corte de pelo y barba').includes('pelo'), "ES: 'corte de pelo' → pelo");
  if (MODE === 'release') {
    // El caso Veja: con la tabla vieja todo esto daba [].
    ok(T('Model Photo').includes('retrato'), "EN: 'Model Photo' → retrato (paridad modelo/model)");
    const runners = T('Canvas runners with natural rubber soles');
    ok(runners.includes('calzado') && runners.includes('producto'), `EN: 'Canvas runners…' → calzado+producto (${JSON.stringify(runners)})`);
    const boots = T('Leather boots, made in Portugal');
    ok(boots.includes('calzado') && boots.includes('producto'), `EN: 'Leather boots…' → calzado+producto (${JSON.stringify(boots)})`);
    ok(T('Organic cotton dress').includes('moda'), "EN: 'dress' → moda");
    ok(T('Chronograph watch in steel').includes('producto'), "EN: 'watch' → producto");
    const U = webExtract.temasFromUrl;
    ok(typeof U === 'function', 'temasFromUrl exportado');
    ok(JSON.stringify(U(A1)) === '["producto"]', 'URL /products/<handle> → [producto]');
    ok(JSON.stringify(U('https://veja-store.com/collections/all')) === '[]', 'URL sin /products/ → []');
    ok(JSON.stringify(U('')) === '[]', 'URL vacía → []');
  } else {
    // CONTROL: la tabla de la base no conoce el vocabulario EN nuevo.
    ok(T('Canvas runners with natural rubber soles').length === 0, "CONTROL base: 'Canvas runners…' → [] (el pool moría acá)");
    ok(T('Leather boots, made in Portugal').length === 0, "CONTROL base: 'Leather boots…' → []");
    ok(T('Model Photo').length === 0, "CONTROL base: 'Model Photo' → []");
  }
}

/* ================= Parte 2 · admisión del pool ================= */
console.log('— Parte 2: admisión del pool web (fixture Veja, peor caso) —');
{
  if (MODE === 'release') {
    const admitidas = extraPhotosVeja.filter((w) => demo.webPhotoAdmitida(w, digestVeja));
    ok(admitidas.length === 5, `pool admitido = 5 de 6 (fue ${admitidas.length})`);
    ok(admitidas.some((w) => w.path === '/media/web-a1.jpg'), 'a1 entra por photo_map (la visión la clasificó)');
    ok(admitidas.some((w) => w.path === '/media/web-a2.jpg'), 'a2 entra por URL de producto, sin mapa ni temas');
    ok(admitidas.some((w) => w.path === '/media/web-a5.jpg'), 'a5 entra por URL de producto');
    ok(!admitidas.some((w) => w.path === '/media/web-a4.jpg'), 'a4 (sin temas, sin mapa, sin URL de producto) sigue afuera: la admisión no es «todo vale»');
    ok(demo.webPhotoAdmitida(extraPhotosVeja[1], null) === true, 'a1 se admite aun sin digest (señal de URL)');
    ok(demo.webPhotoAdmitida({ path: '/media/x.jpg', url: 'https://x.com/foto.jpg', temas: [] }, digestVeja) === false, 'foto sin ninguna señal no se admite');
    ok(demo.digestVendeProducto(digestVeja) === true, 'el digest de Veja vende producto (productos + photo_map)');
    ok(demo.digestVendeProducto(null) === false && demo.digestVendeProducto({}) === false, 'sin fundamento no hay mundo de producto');
  } else {
    // CONTROL: el filtro viejo (path + temas con largo) sobre el fixture.
    const viejas = extraPhotosVeja.filter((w) => w && typeof w.path === 'string' && Array.isArray(w.temas) && w.temas.length);
    ok(viejas.length === 1 && viejas[0].path === '/media/web-og.jpg', `CONTROL base: el pool viejo deja ${viejas.length} foto (solo la og con 'marca')`);
  }
}

/* ================= Parte 3 · el spec de la prueba ================= */
console.log('— Parte 3: buildDemoSpec de la prueba (EN, trial) —');
{
  ok(clientDigest.formatoDominanteDe(digestVeja) === 'carrusel', 'el digest trae el dominante del feed: carrusel (6/6)');
  const spec = demo.buildDemoSpec({
    business: 'VEJA', category: 'otro', country: 'US',
    photoPath: null, goal: '', count: 5,
    bioText: 'Sneakers made with organic materials',
    profilePicPath: '/media/profile-veja.jpg', feedRegister: null,
    extraPhotos: extraPhotosVeja, digest: digestVeja, lang: 'en', trialNoStock: true,
  });
  ok(spec && Array.isArray(spec.specPosts) && spec.specPosts.length >= 3, `el spec arma la semana (${spec && spec.specPosts.length} piezas)`);
  const fotosWeb = (spec.photos || []).filter((p) => typeof p === 'string' && p.startsWith('/media/web-'));
  const distintas = new Set(fotosWeb);
  if (MODE === 'release') {
    ok(spec.photos[0] === '/media/web-a1.jpg' || spec.photos[0] === '/media/web-a3.jpg',
      `slot 0 (wow) = foto REAL del producto clasificado, no póster (fue ${spec.photos[0]})`);
    // RE-PIN DEL PREPARADOR (composición con CORRECTIVO-7 en vivo, v996):
    // la entrega como héroe la gobierna la puerta de C7 — exige marca
    // verificada por visión (marca_verdict o marca_visible). En este
    // fixture solo a1 trae esa señal (photo_map con marca); la admisión
    // ancha de ESTE lote se aserta en la Parte 2 (5/6 en el pool) y las
    // demás fotos quedan disponibles como láminas/ranking, no como
    // héroes sin verificar. Sin C7 (árbol del builder) eran ≥2.
    ok(distintas.size === 1 && distintas.has('/media/web-a1.jpg'),
      `la semana usa como héroe la única foto con marca verificada del fixture (fue ${distintas.size}: ${[...distintas].join(', ')})`);
    // RE-PIN DEL PREPARADOR (misma composición): a3 está clasificada en
    // el photo_map como Esplar pero SIN marca verificada — con C7 en
    // vivo eso no habilita la entrega como héroe (la clasificación no es
    // el veredicto de presencia) y el slot cae al póster de marca, igual
    // que el residual de Campo pineado abajo.
    ok(spec.photos[1] === '/media/profile-veja.jpg',
      `la pieza anclada a Esplar (photo_map sin marca verificada) no se entrega como héroe con C7 en vivo: póster (fue ${spec.photos[1]})`);
    // PIN DEL RESIDUAL (fuera del alcance de A, registrado en STATUS):
    // la pieza de Campo — su foto (a5) está ADMITIDA en el pool por URL
    // y viaja como lámina de carrusel, pero sin entrada en el photo_map
    // el match foto↔producto de pickWebPhoto no la puede elegir como
    // portada (exige mapa o match exacto de tema, §2.2 del diagnóstico).
    // Si un lote futuro cierra ese match, este pin salta y obliga a
    // actualizar la suite.
    ok(spec.photos[2] === '/media/profile-veja.jpg',
      'PIN residual: la pieza sin photo_map sigue a póster como portada (su foto entra como lámina, no como héroe)');
    ok(spec.formato && spec.formato.dominante === 'carrusel' && spec.formato.carrusel >= 1,
      `con el pool sano hay ≥1 carrusel importable (formato=${JSON.stringify(spec.formato)})`);
  } else {
    ok(spec.photos[0] === '/media/profile-veja.jpg',
      `CONTROL base: el slot 0 sale póster de marca (fue ${spec.photos[0]})`);
    ok(distintas.size <= 1, `CONTROL base: la semana usa ≤1 foto real (fue ${distintas.size})`);
    ok(!spec.formato || spec.formato.carrusel === 0,
      `CONTROL base: 0 carruseles pese al feed 6/6 (formato=${JSON.stringify(spec.formato)})`);
  }
}

/* ================= Parte 4 · no-regresión ================= */
console.log('— Parte 4: no-regresión ES + el gate no se ablanda —');
{
  // Marca ES con temas derivables: la semana usa sus fotos como siempre.
  const digestCafe = clientDigest.buildFromParts({
    business: 'Café Aroma', category: 'cafeteria',
    web: { name: 'Café Aroma', description: 'Cafetería de especialidad', services: ['Café de especialidad', 'Medialunas'], url: 'https://cafearoma.com.ar', city: 'Buenos Aires', palette: [] },
    feed: { bio: 'Café de especialidad', name: 'Café Aroma', handle: 'cafearoma', captions: ['Nuestro café de especialidad, recién molido', 'Medialunas tibias a las 9', 'El café de la casa, como siempre'] },
    photoEntries: { 'https://cafearoma.com.ar/fotos/latte.jpg': { item: 'Café de especialidad', confianza: 0.9, marca: true } },
  });
  const specCafe = demo.buildDemoSpec({
    business: 'Café Aroma', category: 'cafeteria', country: 'AR',
    photoPath: null, goal: '', count: 3,
    bioText: 'Cafetería de especialidad', profilePicPath: '/media/profile-cafe.jpg',
    feedRegister: null,
    extraPhotos: [
      { path: '/media/web-cafe1.jpg', url: 'https://cafearoma.com.ar/fotos/latte.jpg', temas: ['cafe'] },
      { path: '/media/web-cafe2.jpg', url: 'https://cafearoma.com.ar/fotos/medialunas.jpg', temas: ['cafe'] },
    ],
    digest: digestCafe, lang: 'es', trialNoStock: true,
  });
  const fotosCafe = (specCafe.photos || []).filter((p) => typeof p === 'string' && p.startsWith('/media/web-'));
  ok(fotosCafe.length >= 1, `ES: la semana del café usa sus fotos reales (fue ${fotosCafe.length})`);

  // El gate sigue frenando lo ajeno: una foto de uñas no ilustra un
  // negocio 'otro', ni siquiera con el mundo de producto abierto —
  // 'unas' es tema fuerte fuera del mundo y no hay productHit.
  const poolAjeno = [{ path: '/media/web-unas.jpg', url: 'https://x.com/unas.jpg', temas: ['unas'] }];
  const topicLocal = { tema: 'local', headline: 'Nuestro local' };
  const ctxSin = demo.photoGateCtx({ category: 'otro', subcat: '', topic: topicLocal, isCafe: false, neutralDefault: false, trialNoStock: true, vendeProducto: false });
  ok(demo.pickWebPhoto(topicLocal, poolAjeno, new Set(), ctxSin) === null, 'gate: foto de uñas no entra en un negocio otro');
  if (MODE === 'release') {
    const ctxCon = demo.photoGateCtx({ category: 'otro', subcat: '', topic: topicLocal, isCafe: false, neutralDefault: false, trialNoStock: true, vendeProducto: true });
    ok(demo.pickWebPhoto(topicLocal, poolAjeno, new Set(), ctxCon) === null, 'gate: ni con mundo de producto la foto ajena entra');
    // Y la foto de calzado del propio negocio SÍ pasa con el mundo
    // de producto (antes moría: 'calzado' no era del mundo 'otro').
    // RE-PIN DEL PREPARADOR (composición con CORRECTIVO-7 en vivo): la
    // foto propia llega a pickWebPhoto ANOTADA por la misma visión
    // (marca_visible) — sin esa señal la puerta de C7 la frena antes de
    // mirar temas, como aserta el chequeo siguiente. Con la señal, lo
    // que decide es el mundo de temas, que es lo que esta parte prueba.
    const poolCalzado = [{ path: '/media/web-zapa.jpg', url: A2, temas: ['calzado'], marca_visible: true }];
    const topicCalzado = { tema: 'calzado', headline: 'Nuevas' };
    const ctxZ = demo.photoGateCtx({ category: 'otro', subcat: '', topic: topicCalzado, isCafe: false, neutralDefault: false, trialNoStock: true, vendeProducto: true });
    const hit = demo.pickWebPhoto(topicCalzado, poolCalzado, new Set(), ctxZ);
    ok(hit && hit.path === '/media/web-zapa.jpg', 'gate: la foto de calzado propia pasa con mundo de producto');
    // Composición con C7, explícita: la MISMA foto sin señal de marca
    // verificada no se entrega en la prueba (fail-closed de C7).
    const poolCalzadoSinMarca = [{ path: '/media/web-zapa.jpg', url: A2, temas: ['calzado'] }];
    ok(demo.pickWebPhoto(topicCalzado, poolCalzadoSinMarca, new Set(), ctxZ) === null,
      'gate C7: la foto propia sin marca verificada no se entrega en la prueba');
    const ctxZSin = demo.photoGateCtx({ category: 'otro', subcat: '', topic: topicCalzado, isCafe: false, neutralDefault: false, trialNoStock: true, vendeProducto: false });
    ok(demo.pickWebPhoto(topicCalzado, poolCalzado, new Set(), ctxZSin) === null, 'gate: sin señal de producto en el digest, el mundo otro sigue cerrado al calzado');
  }
}

console.log(`\nTOTAL: ${pass} ok · ${fail} fail`);
try { fs.rmSync(SUITE_TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(fail ? 1 : 0);
