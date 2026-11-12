// test-lote-ingesta.js — LOTE INGESTA (builder).
// El digest toma menú/pie/navegación del sitio como contenido (Veja
// «PROJET», Crumbl «Dirty Soda Value Menu», Byredo «Customer Services»/
// «Legal») y la señal de idioma de la marca cae al fallback (Veja y
// Byredo postean en inglés y salieron en español).
// Autónomo (patrón de las suites del repo): fixtures, sin red ni claves.
// Se corre desde la raíz del árbol a probar (release/):
//   NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ingesta.js
// Cubre: (A) estático + cableado, (B) strip de cromo + servicesFromHtml,
// (C) deep-read itemsFromHtml, (D) guardas de estrella en client-digest,
// (E) detectBrandLang por etapas (pins v922 intactos), (F) boot local
// /api/version v932 5/5. Estampado por el preparador: BUILD v932.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';

const ROOT = process.cwd();
// La DB del require va a un DATA_DIR temporal: no ensuciar el árbol
// (demo.js abre la DB al hacer require — sin esto crea release/data/).
const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'ingesta-suite-'));
process.env.DATA_DIR = tmpData;
try { require('module').Module._initPaths(); } catch (e) {}

const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const demoSrc = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
const cdSrc = fs.readFileSync(path.join(ROOT, 'client-digest.js'), 'utf8');
const weSrc = fs.readFileSync(path.join(ROOT, 'web-extract.js'), 'utf8');

const webExtract = require(path.join(ROOT, 'web-extract.js'));
const deepRead = require(path.join(ROOT, 'deep-read.js'));
const cd = require(path.join(ROOT, 'client-digest.js'));
const demo = require(path.join(ROOT, 'demo.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; failed.push(name); console.log('  FAIL -', name, extra ? '(' + extra + ')' : ''); }
}
function count(re, src) { return (src.match(re) || []).length; }
const has = (list, v) => (list || []).some((x) => String((x && (x.nombre || x)) || '') === v);
const hasStr = (list, v) => (list || []).includes(v);

// ---------- Fixtures: HTML de tienda (sin red) ----------
const VEJA_HTML = `<!DOCTYPE html><html lang="en"><head><title>Veja - Sneakers</title>
<meta property="og:site_name" content="Veja">
<meta property="og:description" content="Veja is a French sneaker brand. Esplar, Campo and V-10 are our icons.">
</head><body>
<header><nav><h2>PROJET</h2><h2>HOMME</h2><h2>FEMME</h2></nav></header>
<main>
<h1>Esplar</h1>
<a href="/products/esplar">Esplar</a>
<a href="/products/campo">Campo</a>
<a href="/products/v-10">V-10</a>
<h2>Campo</h2>
<h2>V-10</h2>
</main>
<footer><h3>Customer Services</h3><h3>Legal</h3></footer>
</body></html>`;
const BYREDO_HTML = `<!DOCTYPE html><html lang="en"><head><title>Byredo</title>
<meta property="og:description" content="Byredo is a European luxury brand founded in Stockholm.">
</head><body>
<nav><a href="/shop">Shop</a><a href="/about">About</a></nav>
<main>
<a href="/products/mojave-ghost">Mojave Ghost</a>
<a href="/products/bal-d-afrique">Bal d'Afrique</a>
<h2>Mojave Ghost</h2>
<h2>Bal d'Afrique</h2>
</main>
<footer><h2>Customer Services</h2><h2>Legal</h2><h2>Shipping &amp; Returns</h2></footer>
</body></html>`;
const CRUMBL_HTML = `<!DOCTYPE html><html lang="en"><head><title>Crumbl Cookies</title></head><body>
<main>
<h2>NEW Dirty Soda Value Menu</h2>
<a href="/products/milk-chocolate-chip">Milk Chocolate Chip</a>
<a href="/products/chilled-sugar">Chilled Sugar</a>
<h2>Milk Chocolate Chip</h2>
<h2>Chilled Sugar</h2>
</main>
</body></html>`;
const PHILZ_HTML = `<!DOCTYPE html><html lang="en"><head><title>Philz Coffee</title></head><body>
<main>
<a href="/products/tesora">Tesora</a>
<a href="/products/mint-mojito">Mint Mojito</a>
<a href="/products/jacobs-wonderbar">Jacob's Wonderbar</a>
<h2>Tesora</h2>
</main>
</body></html>`;
const CAFE_AROMA_HTML = `<!DOCTYPE html><html lang="es"><head><title>Café Aroma</title>
<meta property="og:description" content="Café Aroma es una cafetería de barrio en Palermo. Nuestro blend insignia es el Blend Aroma.">
</head><body>
<main>
<a href="/products/blend-aroma">Blend Aroma</a>
<a href="/products/medialuna">Medialuna de manteca</a>
<h2>Blend Aroma</h2>
</main>
<footer><h2>Contacto</h2><h2>Aviso legal</h2></footer>
</body></html>`;

async function main() {
  // ---------- A) Estático: estampado + cableado ----------
  console.log('== A) estático y cableado ==');
  ok(count(/20261105-v932/g, serverSrc) === 1, 'BUILD v932 x1 en server.js (estampado)');
  ok(count(/20261105-v929/g, serverSrc) === 0, 'sin rastro de BUILD v929 en server.js');
  ok(typeof webExtract.stripSiteChrome === 'function', 'stripSiteChrome exportada en web-extract');
  ok(typeof webExtract.servicesFromHtml === 'function', 'servicesFromHtml exportada en web-extract');
  ok(typeof webExtract.siteLangFromHtml === 'function', 'siteLangFromHtml exportada en web-extract');
  ok(typeof cd.isChromeDerivedName === 'function', 'isChromeDerivedName exportada en client-digest');
  ok(typeof demo.detectBrandLang === 'function', 'detectBrandLang exportada en demo.js');
  ok(count(/function detectBrandLang\(\{ captions, webText, siteLang \}/g, demoSrc) === 1, 'detectBrandLang recibe siteLang');
  ok(count(/siteLang: webData && webData\.siteLang,/g, serverSrc) === 2, 'los 2 call sites pasan siteLang (generate + stream)');
  ok(weSrc.includes('siteLang: siteLangFromHtml(html)'), 'fetchBusinessSite devuelve siteLang');
  // (LOTE INGESTA) Los dos scans de encabezado de web-extract eran
  // GREEDY en v928 y fundían varios encabezados en un solo servicio /
  // contexto de foto («Margherita Tomate, mozzarella Marinara»): los
  // dos son non-greedy ahora (deep-read ya lo era).
  ok(!weSrc.includes('[\\s\\S]{1,140})</h[123]>') && !weSrc.includes('[\\s\\S]{1,120})</h[123]>'), 'sin regex de encabezado greedy en web-extract');

  // ---------- B) Strip de cromo + servicesFromHtml ----------
  console.log('== B) strip de cromo + servicesFromHtml ==');
  const vejaStripped = webExtract.stripSiteChrome(VEJA_HTML);
  ok(!/PROJET|HOMME|FEMME/.test(vejaStripped), 'Veja: el nav (PROJET/HOMME/FEMME) se pela');
  ok(!/Customer Services|Legal/.test(vejaStripped), 'Veja: el pie (Customer Services/Legal) se pela');
  ok(/Esplar/.test(vejaStripped) && /Campo/.test(vejaStripped) && /V-10/.test(vejaStripped), 'Veja: el contenido principal sobrevive al strip');
  const vejaServices = webExtract.servicesFromHtml(VEJA_HTML, null);
  ok(hasStr(vejaServices, 'Esplar') && hasStr(vejaServices, 'Campo') && hasStr(vejaServices, 'V-10'), 'Veja: servicios = Esplar/Campo/V-10');
  ok(!vejaServices.some((s) => /PROJET|HOMME|FEMME|Customer Services|Legal/i.test(s)), 'Veja: ni PROJET ni HOMME ni pie en servicios');
  ok(webExtract.siteLangFromHtml(VEJA_HTML) === 'en', 'Veja: siteLang en');
  ok(webExtract.siteLangFromHtml('<html lang="en-US">') === 'en', 'siteLang en-US → en');
  ok(webExtract.siteLangFromHtml('<html lang="es-ES">') === 'es', 'siteLang es-ES → es');
  ok(webExtract.siteLangFromHtml('<html lang="pt-BR">') === '', 'siteLang pt-BR → vacío (solo en/es)');
  ok(webExtract.siteLangFromHtml('<html>') === '', 'siteLang sin lang → vacío');

  const byredoServices = webExtract.servicesFromHtml(BYREDO_HTML, null);
  ok(hasStr(byredoServices, 'Mojave Ghost') && hasStr(byredoServices, "Bal d'Afrique"), 'Byredo: servicios = Mojave Ghost / Bal d’Afrique');
  ok(!byredoServices.some((s) => /Customer Services|Legal|Shipping/i.test(s)), 'Byredo: ni Customer Services ni Legal ni Shipping en servicios');
  ok(webExtract.siteLangFromHtml(BYREDO_HTML) === 'en', 'Byredo: siteLang en');

  const crumblServices = webExtract.servicesFromHtml(CRUMBL_HTML, null);
  ok(hasStr(crumblServices, 'Milk Chocolate Chip') && hasStr(crumblServices, 'Chilled Sugar'), 'Crumbl: servicios = sabores reales');
  ok(hasStr(crumblServices, 'NEW Dirty Soda Value Menu'), 'Crumbl: el menú de soda SOBREVIVE al strip (es contenido principal, no cromo de nav/pie — lo frena la guarda de estrella, sección D)');

  const philzServices = webExtract.servicesFromHtml(PHILZ_HTML, null);
  ok(hasStr(philzServices, 'Tesora') && hasStr(philzServices, 'Mint Mojito') && hasStr(philzServices, "Jacob's Wonderbar"), 'Philz: servicios intactos (regresión)');

  const aromaServices = webExtract.servicesFromHtml(CAFE_AROMA_HTML, null);
  ok(hasStr(aromaServices, 'Blend Aroma') && hasStr(aromaServices, 'Medialuna de manteca'), 'Marca ES: servicios reales');
  ok(!aromaServices.some((s) => /Contacto|Aviso legal/i.test(s)), 'Marca ES: ni Contacto ni Aviso legal en servicios');
  ok(webExtract.siteLangFromHtml(CAFE_AROMA_HTML) === 'es', 'Marca ES: siteLang es');

  // Contenedor de cromo por clase/id + role (sin elementos semánticos).
  const classChrome = '<div class="site-footer"><h2>Customer Services</h2><p>Links</p></div><main><h2>Esplar</h2></main>';
  ok(!/Customer Services/.test(webExtract.stripSiteChrome(classChrome)) && /Esplar/.test(webExtract.stripSiteChrome(classChrome)), 'div.site-footer se pela, el contenido sobrevive');
  const roleChrome = '<div role="contentinfo"><h2>Legal</h2></div><main><h2>Esplar</h2></main>';
  ok(!/Legal/.test(webExtract.stripSiteChrome(roleChrome)), 'role=contentinfo se pela');
  const shopifyChrome = '<div id="shopify-section-footer"><h2>Customer Services</h2></div><main><h2>Esplar</h2></main>';
  ok(!/Customer Services/.test(webExtract.stripSiteChrome(shopifyChrome)), 'id shopify-section-footer se pela');
  // La clase «menu» a secas NO se pela: en un restaurante es la carta.
  const restoMenu = '<div class="menu"><h2>Margherita</h2><p>Tomate, mozzarella</p><h2>Marinara</h2></div><nav><h2>Inicio</h2></nav>';
  ok(/Margherita/.test(webExtract.stripSiteChrome(restoMenu)) && /Marinara/.test(webExtract.stripSiteChrome(restoMenu)), 'div.menu (carta real) SOBREVIVE al strip');
  ok(!/Inicio/.test(webExtract.stripSiteChrome(restoMenu)), '…pero el <nav> con Inicio se pela');
  const restoServices = webExtract.servicesFromHtml(restoMenu, null);
  ok(hasStr(restoServices, 'Margherita') && hasStr(restoServices, 'Marinara'), 'restaurante: Margherita y Marinara son servicios separados');
  ok(!restoServices.some((s) => /Tomate|mozzarella/.test(s)), 'restaurante: ningún servicio fundido (sin «Margherita Tomate, mozzarella Marinara»)');
  // La dirección del pie se sigue leyendo aunque el pie se pele.
  const addrHtml = '<main><h1>Esplar</h1><p>We sell sneakers.</p></main><footer><address>123 Main Street, New York</address><h2>Customer Services</h2></footer>';
  const facts = webExtract.extractBusinessFacts(addrHtml, null);
  ok(facts.has_local === true && String(facts.address || '').includes('123 Main Street'), 'la dirección del pie se sigue leyendo (es un hecho real)');

  // ---------- C) deep-read itemsFromHtml ----------
  console.log('== C) deep-read itemsFromHtml ==');
  const deepHtml = '<!DOCTYPE html><html><head><title>Byredo</title></head><body>'
    + '<main><h2>Mojave Ghost</h2><p>Eau de parfum $180.00</p></main>'
    + '<footer><h2>Customer Services</h2><p>Need help? $85.00</p></footer>'
    + '</body></html>';
  const deepItems = deepRead.itemsFromHtml(deepHtml, 'web-catalog');
  ok(deepItems.some((x) => x.nombre === 'Mojave Ghost' && String(x.precio || '').includes('180')), 'deep-read: Mojave Ghost con precio es ítem');
  ok(!deepItems.some((x) => /Customer Services/i.test(x.nombre || '')), 'deep-read: el heading de pie con precio cerca NO es ítem');

  // ---------- D) Guardas de estrella en client-digest ----------
  console.log('== D) guardas de estrella (client-digest) ==');
  const CHROME = ['Customer Services', 'Customer Service', 'Legal', 'Privacy Policy', 'Terms of Service', 'Help Center', 'FAQ', 'Shipping and Returns', 'NEW Dirty Soda Value Menu', 'Dirty Soda Value Menu', 'Soda Value Menu', 'Shop All', 'My Account', 'Contacto', 'Aviso legal', 'Preguntas frecuentes', ''];
  for (const c of CHROME) ok(cd.isChromeDerivedName(c) === true, 'cromo: ' + JSON.stringify(c) + ' es sección, no producto');
  const REAL = ['Esplar', 'Campo', 'V-10', 'Mojave Ghost', "Bal d'Afrique", 'Tesora', 'Mint Mojito', "Jacob's Wonderbar", 'Milk Chocolate Chip', 'Chilled Sugar', 'Blend Aroma', 'Menu Keto', 'Menú del día', 'Legal advice', 'Corte hombre', 'Dr. Martens', 'Holiday Gel Mani System'];
  for (const r of REAL) ok(cd.isChromeDerivedName(r) === false, 'real: ' + JSON.stringify(r) + ' NO es cromo');
  // inferStar: Veja (servicios ya sin cromo) → Esplar.
  const vejaStar = cd.inferStar({
    items: vejaServices.map((s) => ({ nombre: s })),
    captions: [
      'The new Esplar is here. Designed in Paris, made in Brazil with organic cotton and wild rubber from the Amazon.',
      'Our bestseller is back in stock. Shop the Campo now, free shipping on orders over $150.',
      'Thank you for all the love this week. The new collection drops on Friday, stay tuned for more.',
    ],
    orderNames: vejaServices,
    metrics: [], dnaStar: '',
  });
  ok(!!vejaStar && vejaStar.item === 'Esplar', 'Veja: la estrella es Esplar (no PROJET/HOMME)');
  // inferStar: Crumbl — el menú de soda encabeza el catálogo y NO puntúa.
  const crumblStar = cd.inferStar({
    items: [{ nombre: 'NEW Dirty Soda Value Menu' }, { nombre: 'Milk Chocolate Chip' }, { nombre: 'Chilled Sugar' }],
    captions: ['Milk Chocolate Chip is back this week, warm and gooey.', 'Chilled Sugar, the one everyone asks for.'],
    orderNames: ['NEW Dirty Soda Value Menu', 'Milk Chocolate Chip', 'Chilled Sugar'],
    metrics: [], dnaStar: '',
  });
  ok(!!crumblStar && crumblStar.item === 'Milk Chocolate Chip', 'Crumbl: la estrella es un sabor, nunca el menú de soda');
  // inferStar: Philz (regresión) → Tesora.
  const philzStar = cd.inferStar({
    items: [{ nombre: 'Tesora' }, { nombre: 'Mint Mojito' }, { nombre: "Jacob's Wonderbar" }],
    captions: ['Tesora, the first blend of Phil. Caramel and walnut.', 'Tesora is back.', 'Mint Mojito season.'],
    orderNames: ['Tesora', 'Mint Mojito', "Jacob's Wonderbar"],
    metrics: [], dnaStar: '',
  });
  ok(!!philzStar && philzStar.item === 'Tesora', 'Philz: la estrella sigue siendo Tesora');
  // inferStar: solo cromo → null (no se inventa).
  const onlyChrome = cd.inferStar({
    items: [{ nombre: 'Customer Services' }, { nombre: 'Legal' }, { nombre: 'Dirty Soda Value Menu' }],
    captions: ['Customer services for everyone.'],
    orderNames: ['Customer Services', 'Legal', 'Dirty Soda Value Menu'],
    metrics: [], dnaStar: '',
  });
  ok(onlyChrome === null, 'Solo cromo: NO hay inferencia (no se adivina)');
  // inferStar: marca ES → estrella intacta.
  const aromaStar = cd.inferStar({
    items: [{ nombre: 'Blend Aroma' }, { nombre: 'Medialuna de manteca' }],
    captions: ['Ya llegó el nuevo Blend Aroma, tostado cada semana en nuestro local.', 'El Blend Aroma es el más pedido, con notas de caramelo y nuez.'],
    orderNames: ['Blend Aroma', 'Medialuna de manteca'],
    metrics: [], dnaStar: '',
  });
  ok(!!aromaStar && aromaStar.item === 'Blend Aroma', 'Marca ES: la estrella es Blend Aroma');
  // effectiveStarOf: inferida de cromo (digest envenenado) → null.
  const poisoned = cd.effectiveStarOf({
    productos: [{ nombre: 'Customer Services' }, { nombre: 'Esplar' }],
    inferred_star: { item: 'Customer Services', confidence: 0.9, fuente: 'inferido', evidence: [] },
  });
  ok(poisoned === null, 'Digest envenenado (inferida Customer Services): NO es estrella');
  const clean = cd.effectiveStarOf({
    productos: [{ nombre: 'Esplar' }, { nombre: 'Campo' }],
    inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
  });
  ok(!!clean && clean.item === 'Esplar' && clean.source === 'inferred', 'Inferida Esplar: estrella Esplar (inferred)');
  const dueno = cd.effectiveStarOf({
    productos: [{ nombre: 'Esplar' }],
    dueno: { estrella: 'Esplar' },
    inferred_star: { item: 'Campo', confidence: 0.8, fuente: 'inferido', evidence: [] },
  });
  ok(!!dueno && dueno.item === 'Esplar' && dueno.source === 'dueno', 'Dueño confirmó Esplar: manda su palabra');
  // deriveTopics: digest con inferida de cromo → ningún topic la ancla.
  function mkDigest(productos, inferredStar, lang) {
    return {
      business: 'Veja', category: 'ropa', subcat: 'calzado',
      productos: productos.map((n) => ({ nombre: n })), servicios: [],
      temas_feed: ['sneakers responsables', 'cuero reciclado'],
      inferred_star: inferredStar, dueno: null, onboarding: null, etapa: '', lanzamiento_fecha: null,
    };
  }
  const vejaTopics = cd.deriveTopics(mkDigest(['Customer Services', 'Esplar', 'Campo', 'V-10'], { item: 'Customer Services', confidence: 0.9, fuente: 'inferido', evidence: [] }), { count: 5, lang: 'en' });
  ok(Array.isArray(vejaTopics) && vejaTopics.length > 0, 'Veja (digest con cromo): hay topics');
  ok(!vejaTopics.some((t) => /customer services/i.test(String((t && (t.digest_anchor || t.headline)) || ''))), 'Veja: ningún topic ancla Customer Services');
  ok(vejaTopics.length > 0 && vejaTopics[0].digest_anchor === 'Esplar', 'Veja: el primer topic es Esplar');
  const crumblTopics = cd.deriveTopics(mkDigest(['NEW Dirty Soda Value Menu', 'Milk Chocolate Chip', 'Chilled Sugar'], { item: 'Milk Chocolate Chip', confidence: 0.8, fuente: 'inferido', evidence: [] }), { count: 5, lang: 'en' });
  ok(!crumblTopics.some((t) => /soda value menu/i.test(String((t && (t.digest_anchor || t.headline)) || ''))), 'Crumbl: ningún topic ancla el menú de soda');
  ok(crumblTopics.length > 0 && crumblTopics[0].digest_anchor === 'Milk Chocolate Chip', 'Crumbl: el primer topic es un sabor');
  const philzTopics = cd.deriveTopics(mkDigest(['Tesora', 'Mint Mojito', "Jacob's Wonderbar"], { item: 'Tesora', confidence: 0.8, fuente: 'inferido', evidence: [] }), { count: 5, lang: 'en' });
  ok(philzTopics.length > 0 && philzTopics[0].digest_anchor === 'Tesora', 'Philz: el primer topic sigue siendo Tesora');
  // deriveFirstPostWow: el primer posteo no ancla cromo.
  const wow = cd.deriveFirstPostWow(mkDigest(['Customer Services', 'Esplar'], { item: 'Customer Services', confidence: 0.9, fuente: 'inferido', evidence: [] }), { lang: 'en' });
  ok(!!wow && !/customer services/i.test(String(wow.headline || '')) && /Esplar/.test(String(wow.headline || '')), 'Wow: el primer posteo es Esplar, no Customer Services');
  // scrubDigestItems: el choke point limpia el cromo guardado.
  const scrubbed = cd.scrubDigestItems({
    productos: [{ nombre: 'Customer Services' }, { nombre: 'Esplar' }, { nombre: 'Legal' }],
    servicios: [], promos: [],
    inferred_star: { item: 'Customer Services', confidence: 0.9, fuente: 'inferido', evidence: [] },
  });
  ok(scrubbed.productos.length === 1 && scrubbed.productos[0].nombre === 'Esplar', 'Scrub: productos sin cromo (queda Esplar)');
  ok(scrubbed.inferred_star === null, 'Scrub: la inferida de cromo se anula');

  // ---------- E) detectBrandLang por etapas ----------
  console.log('== E) detectBrandLang ==');
  // Pins v922 (umbral ≥3 / ventaja ≥2 por fuente, intactos).
  const vejaCaps = [
    'The new Esplar is here. Designed in Paris, made in Brazil with organic cotton and wild rubber from the Amazon.',
    'Our bestseller is back in stock. Shop the Campo now, free shipping on orders over $150.',
    'Thank you for all the love this week. The new collection drops on Friday, stay tuned for more.',
  ];
  ok(demo.detectBrandLang({ captions: vejaCaps, webText: '' }) === 'en', 'v922: Veja captions EN → en');
  const esCaps = [
    'Ya llegó el nuevo blend Tesora, el primero de Phil. Caramelo y nuez en cada taza, probalo hoy en tu local.',
    'Gracias por venir esta semana, los esperamos todos los días con café recién hecho y medialunas.',
    'Nuestro Mint Mojito es la bebida más pedida del verano, con menta fresca y crema de la casa.',
  ];
  ok(demo.detectBrandLang({ captions: esCaps, webText: '' }) === 'es', 'v922: marca ES captions ES → es');
  ok(demo.detectBrandLang({ captions: ['🔥🔥🔥', '✨ new drop ✨', 'Veja'], webText: '' }) === null, 'v922: sin señal (emojis/corto) → null');
  ok(demo.detectBrandLang({ captions: [], webText: '' }) === null, 'v922: sin captions ni web → null');
  ok(demo.detectBrandLang({ captions: ['New drop 🔥'], webText: '' }) === null, 'v922: dos palabras sueltas → null (umbral ≥3)');
  ok(demo.detectBrandLang({ captions: ['The new styles are here now', 'La nueva colección está aquí ahora'], webText: '' }) === null, 'v922: bilingüe parejo (margen 1) → null');
  ok(demo.detectBrandLang({ captions: [], webText: 'Somos una cafetería de barrio. Nuestro café se tuesta todos los días y las medialunas salen del horno cada mañana.' }) === 'es', 'v922: sin captions, web ES → es');
  ok(demo.detectBrandLang({ captions: [], webText: 'We are a family bakery in Brooklyn. Our sourdough is baked every morning and we ship nationwide.' }) === 'en', 'v922: sin captions, web EN → en');
  ok(demo.detectBrandLang({ captions: vejaCaps, webText: 'Somos una tienda de zapatillas en Madrid con envíos a toda España.' }) === 'en', 'v922: IG EN + web ES → en (IG manda)');
  ok(demo.detectBrandLang({ captions: ['#sneakers #veja https://veja-store.com/shop', 'New styles just landed in store now, come and see them all today.'], webText: '' }) === 'en', 'v922: hashtags/URLs ignorados, el texto decide');
  // (INGESTA) Pool combinado: dos fuentes débiles que apuntan al mismo
  // idioma deciden juntas (ninguna sola llega al umbral).
  ok(demo.detectBrandLang({ captions: ['New drop 🔥'], webText: 'Byredo is a brand.' }) === 'en', 'pool: IG 2 hits + web 1 hit (mismo idioma) → en');
  // «Nuevo» NO es stopword en ES: el pool ES es IG 1 hit («el») +
  // web 2 hits («somos», «una») = 3 → es. (El fixture viejo usaba
  // «Nuevo drop» = 0 hits en ES y el pool no llegaba al umbral.)
  ok(demo.detectBrandLang({ captions: ['El nuevo blend'], webText: 'Somos una marca.' }) === 'es', 'pool: IG 1 hit + web 2 hits ES → es');
  ok(demo.detectBrandLang({ captions: ['New drop 🔥'], webText: 'Somos una marca.' }) === null, 'pool: fuentes débiles en idiomas DISTINTOS → null (no se adivina)');
  // (INGESTA) Byredo poético: ni captions ni web llegan al umbral —
  // sin siteLang es null; con siteLang en es EN (el caso vivo 00:17).
  const byredoCaps = ['Mojave Ghost.', 'Bal d’Afrique — now in store.', 'A scented tribute.'];
  const byredoWeb = 'Byredo is a European luxury brand founded in Stockholm.';
  ok(demo.detectBrandLang({ captions: byredoCaps, webText: byredoWeb }) === null, 'Byredo poético sin siteLang → null (documenta el hueco v922)');
  ok(demo.detectBrandLang({ captions: byredoCaps, webText: byredoWeb, siteLang: 'en' }) === 'en', 'Byredo poético + siteLang en → en');
  ok(demo.detectBrandLang({ captions: byredoCaps, webText: byredoWeb, siteLang: 'es' }) === 'es', 'siteLang manda cuando no hay texto que decida (es)');
  ok(demo.detectBrandLang({ captions: vejaCaps, webText: '', siteLang: 'es' }) === 'en', 'IG decide ANTES que siteLang (IG manda)');
  ok(demo.detectBrandLang({ captions: [], webText: '', siteLang: 'en' }) === 'en', 'solo siteLang en → en');
  ok(demo.detectBrandLang({ captions: [], webText: '', siteLang: 'es' }) === 'es', 'solo siteLang es → es');
  ok(demo.detectBrandLang({ captions: [], webText: '', siteLang: 'fr' }) === null, 'siteLang fr → null (solo en/es)');
  ok(demo.detectBrandLang({ captions: [], webText: '' }) === null, 'digest vacío → null (fallback del llamador, sin romper)');
  // (INGESTA) Marca ES con siteLang: el idioma es ES y la estrella intacta.
  const aromaCaps = [
    'Ya llegó el nuevo Blend Aroma, tostado cada semana en nuestro local.',
    'Gracias por venir, los esperamos todos los días con café recién hecho.',
    'El Blend Aroma es el más pedido, con notas de caramelo y nuez.',
  ];
  ok(demo.detectBrandLang({ captions: aromaCaps, webText: 'Café Aroma es una cafetería de barrio.', siteLang: 'es' }) === 'es', 'marca ES: lang ES (no hardcodeada a EN)');

  // ---------- F) Boot local /api/version v932 5/5 ----------
  console.log('== F) boot local ==');
  const port = 34996;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingesta-boot-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getVersion = () => new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/api/version', timeout: 5000 }, (res) => {
      let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
  let up = false;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await getVersion();
    if (r.status === 200) { up = true; break; }
  }
  ok(up, 'boot levanta y responde /api/version');
  if (up) {
    let hits = 0;
    for (let i = 0; i < 5; i++) {
      const r = await getVersion();
      try { if (JSON.parse(r.body).build === '20261105-v932') hits++; } catch (e) {}
    }
    ok(hits === 5, '/api/version v932 5/5 (estampado)');
  }
  const errLines = bootLog.split('\n').filter((l) => /error|Error|EADDRINUSE|Cannot find|MODULE_NOT_FOUND/i.test(l) && !/no se pudo|sin voz/i.test(l));
  ok(errLines.length === 0, 'boot sin errores en el log', errLines.slice(0, 3).join(' | '));
  const pid = child.pid;
  child.kill('SIGTERM');
  await sleep(1500);
  let alive = true;
  try { process.kill(pid, 0); } catch (e) { alive = false; }
  if (alive) { try { process.kill(pid, 'SIGKILL'); } catch (e) {} await sleep(500); }
  ok(!alive || (() => { try { process.kill(pid, 0); return false; } catch (e) { return true; } })(), 'boot matado por PID exacto (' + pid + ')');
  await sleep(500);
  const after = await getVersion();
  ok(after.status === 0, 'puerto ' + port + ' libre tras matar el boot');
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(tmpData, { recursive: true, force: true }); } catch (e) {}

  // ---------- G) El árbol queda limpio ----------
  ok(!fs.existsSync(path.join(ROOT, 'data')), 'sin release/data/ tras la suite');
  ok(!fs.existsSync(path.join(ROOT, 'node_modules')), 'sin node_modules/ en el release');

  console.log('\n== RESULTADO ==');
  console.log('pass:', pass, 'fail:', fail);
  if (failed.length) console.log('fallidos:', failed.join(' | '));
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
