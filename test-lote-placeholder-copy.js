'use strict';
/* test-lote-placeholder-copy.js — BUG MARCADOR «Country/region and
 * currency» Y «your bag» EN LA SEMANA GENERADA (Ladyee Boutique, 7/11)
 *
 * Hallazgo (grabación del video de la prueba, en vivo v748): el picker
 * de onda muestra «Country/region and currency» en las 3 tarjetas en
 * vez del producto, el mismo marcador es el título del reel y aparece
 * en su caption, y el caption del domingo dice «3 claves de your bag».
 *
 * Causa raíz (reproducida con las funciones reales contra ladyee.com):
 * deep-read.itemsFromHtml paso 2 convierte CADA encabezado h2-h4 en
 * «ítem» de catálogo aunque NO tenga precio cerca (el comentario del
 * módulo dice «con un precio en los ~500 caracteres siguientes» pero el
 * código empujaba el heading igual). En una tienda Shopify eso mete
 * el chrome de la tienda como productos: el h2 sr-only del selector
 * de país/moneda («Country/region and currency»), el h2 del carrito
 * («Your bag»), el slogan del hero («Timeless style. Effortless you.»)
 * y la sección («New arrivals»). Como buildFromParts pone el catálogo
 * profundo PRIMERO (antes que los servicios de la home), el digest
 * queda productos[0] = el marcador → picker, título del reel y
 * captions usan basura en vez del producto real (Zahra Dress).
 * La puerta isPlausibleOfferItem los dejaba pasar a todos: la barra
 * «/» no estaba prohibida, «your» no estaba en segunda persona y no
 * había rechazo de slogans de dos oraciones ni de frases de chrome.
 *
 * El fix (tres capas, mismo lote):
 *  (1) deep-read paso 2: un heading solo es ítem si hay precio cerca
 *      (≤900 caracteres después) Y no es chrome de tienda
 *      (isJunkServiceHeading, la misma puerta que la home).
 *  (2) deep-read paso 3 (líneas con precio) y JUNK_NAME_RE: mismo
 *      filtro de chrome para líneas y PDFs.
 *  (3) client-digest isPlausibleOfferItem (puerta compartida, última
 *      línea para prueba Y semana normal): rechaza «/», «your»,
 *      slogans de dos oraciones y frases de chrome de tienda.
 *
 * Corre con: node test-lote-placeholder-copy.js (USD 0, sin red: IO
 * inyectado + fixtures inline que replican la home de ladyee.com). */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-placeholder-'));
process.env.DATA_DIR = TMP;

const clientDigest = require('./client-digest');
const deepRead = require('./deep-read');
const personalizacion = require('./personalizacion');

let passed = 0; let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ok ', msg); }
  else { failed++; console.error('  ✗ ', msg); }
}

// ---------- fixture: home tipo Shopify (Ladyee, recortada) ----------
// Chrome real de la tienda + tarjetas de producto reales con precio.
// El h2 del carrito trae UN precio cerca a propósito (un ítem del
// carrito dentro de los 900 caracteres): el filtro de chrome tiene
// que rechazarlo igual — la regla de precio sola no alcanza.
const HOME_HTML = `<html><head><title>Ladyee</title></head><body>
<header><nav><a href="/collections/all">Shop all</a></nav></header>
<section><h2>Timeless style.<br>Effortless you.</h2>
<p>Thoughtfully curated wardrobe options for the modern woman.</p></section>
<section><h2>New arrivals</h2>
<div class="grid">
<article><h3>Yvonne linen caftan</h3><span>$85.00</span></article>
<article><h3>Eni Two Piece Set</h3><span>$98.00</span></article>
<article><h3>Shayo Two Piece Pant Set</h3><span>$95.00</span></article>
<article><h3>Yeni print dress</h3><span>$85.00</span></article>
</div></section>
<section><h2>Join our tribe</h2><p>Subscribe for early access.</p></section>
<section><h2>Wishlist</h2><p>Your saved pieces live here.</p></section>
<div id="cart-drawer"><h2>Your bag</h2><div class="line"><span>Zahra Dress</span><span>$120.00</span></div></div>
<footer><h2 class="sr-only">Country/region and currency</h2>
<ul><li><button>United States (USD $)</button></li></ul></footer>
</body></html>`;
const COLLECTIONS_HTML = `<html><head><title>Shop all — Ladyee</title></head><body>
<h2>Shop all</h2><h2>Filter</h2>
<div class="grid">
<article><h3>A dream midi length dress</h3><span>$89.00</span></article>
<article><h3>Abbi sequin dress</h3><span>$118.00</span></article>
</div>
<footer><h2 class="sr-only">Country/region and currency</h2></footer>
</body></html>`;
const PAGES = {
  'https://ladyee.example/': { body: HOME_HTML, contentType: 'text/html' },
  'https://ladyee.example/collections/all': { body: COLLECTIONS_HTML, contentType: 'text/html' },
};
const ioFixture = {
  fetchBuf: async (url) => {
    const p = PAGES[url];
    if (!p) throw new Error('fixture 404: ' + url);
    return { body: Buffer.from(p.body), contentType: p.contentType, finalUrl: url };
  },
};

const JUNK = [
  'Country/region and currency', 'Your bag', 'Timeless style. Effortless you',
  'New arrivals', 'Wishlist', 'Shop all', 'Filter', 'Join our tribe',
  'Explore the collections', 'The Ladyee favourites', 'Style that moves with you',
  'Inside the Ladyee world', 'A wardrobe, thoughtfully curated',
  'More than fashion. A way of feeling',
];
const REAL = ['Zahra Dress', 'Yvonne linen caftan', 'Eni Two Piece Set', 'Shayo Two Piece Pant Set', 'Yeni print dress', 'ATLiens Coffee', 'Daily Crafting', 'Blend Patagonia 500g'];

(async () => {
  console.log('== A. itemsFromHtml: la home tipo Shopify no da chrome como producto ==');
  {
    const items = deepRead.itemsFromHtml(HOME_HTML, 'web-catalog');
    const names = items.map((x) => x.nombre);
    for (const j of JUNK.slice(0, 8)) ok(!names.includes(j), `sin "${j}" en el catálogo`);
    for (const r of ['Yvonne linen caftan', 'Eni Two Piece Set', 'Shayo Two Piece Pant Set', 'Yeni print dress']) {
      ok(names.includes(r), `producto real presente: ${r}`);
    }
    const yvonne = items.find((x) => x.nombre === 'Yvonne linen caftan');
    ok(yvonne && yvonne.precio === '$85.00', 'el producto real conserva su precio ($85.00)');
  }

  console.log('== B. itemsFromHtml: la página de colección tampoco ==');
  {
    const items = deepRead.itemsFromHtml(COLLECTIONS_HTML, 'web-catalog');
    const names = items.map((x) => x.nombre);
    for (const j of ['Shop all', 'Filter', 'Country/region and currency']) ok(!names.includes(j), `sin "${j}" en colección`);
    ok(names.includes('A dream midi length dress') && names.includes('Abbi sequin dress'), 'productos reales de la colección presentes');
  }

  console.log('== C. fetchDeepCatalog (IO inyectado): el primer ítem es un producto real ==');
  {
    const crawl = await deepRead.fetchDeepCatalog('https://ladyee.example/', ioFixture);
    ok(!!crawl, 'el crawl devolvió lectura');
    const names = (crawl ? crawl.items : []).map((x) => x.nombre);
    for (const j of JUNK) ok(!names.includes(j), `catálogo sin "${j}"`);
    ok(names.length > 0 && ['Yvonne linen caftan', 'Eni Two Piece Set', 'Shayo Two Piece Pant Set', 'Yeni print dress', 'A dream midi length dress'].includes(names[0]),
      `primer ítem del catálogo es un producto real: "${names[0]}"`);
  }

  console.log('== D. isPlausibleOfferItem: la puerta rechaza el chrome y acepta lo real ==');
  {
    // La puerta (última línea) cierra MARCADORES de tienda: lo que es
    // rótulo de sección sin precio («Filter», «Explore the collections»,
    // «Style that moves with you») lo mata la capa de extracción (A/B/C),
    // no la puerta — un producto real podría llamarse así en teoría.
    const GATE_JUNK = [
      'Country/region and currency', 'Your bag', 'Timeless style. Effortless you',
      'New arrivals', 'Wishlist', 'Shop all', 'Join our tribe',
    ];
    for (const j of GATE_JUNK) ok(!clientDigest.isPlausibleOfferItem(j), `puerta cierra "${j}"`);
    ok(!clientDigest.isPlausibleOfferItem('Country/region'), 'puerta cierra "Country/region"');
    ok(!clientDigest.isPlausibleOfferItem('Your cart'), 'puerta cierra "Your cart"');
    ok(!clientDigest.isPlausibleOfferItem('Shopping bag'), 'puerta cierra "Shopping bag"');
    for (const r of REAL) ok(clientDigest.isPlausibleOfferItem(r), `puerta abre "${r}"`);
    ok(clientDigest.isPlausibleOfferItem('Dr. Martens'), 'abreviatura real no es slogan ("Dr. Martens")');
    ok(clientDigest.isPlausibleOfferItem('Zahra Dress'), 'la estrella real pasa la puerta');
  }

  console.log('== E. buildFromParts con catálogo envenenado: el digest queda limpio ==');
  {
    const digest = clientDigest.buildFromParts({
      business: 'Ladyee', category: 'moda',
      web: { name: 'Ladyee', description: 'Shop Ladyee Boutique for contemporary women clothing', services: ['Zahra Dress', 'Yvonne linen caftan', 'Eni Two Piece Set', 'Shayo Two Piece Pant Set', 'Yeni print dress'], city: '', palette: [], url: 'https://ladyee.example/', categoryHint: '' },
      feed: null, form: { description: 'Tienda de ropa de mujer' },
      catalog: { items: [
        { nombre: 'Country/region and currency', fuente: 'web-catalog' },
        { nombre: 'Your bag', fuente: 'web-catalog' },
        { nombre: 'Timeless style. Effortless you', fuente: 'web-catalog' },
        { nombre: 'New arrivals', fuente: 'web-catalog' },
        { nombre: 'Yvonne linen caftan', precio: '$85.00', fuente: 'web-catalog' },
        { nombre: 'Eni Two Piece Set', precio: '$98.00', fuente: 'web-catalog' },
      ] },
      bioLink: null, photoEntries: null, webCopy: '',
      onboarding: { producto_estrella: 'Zahra Dress', diferencial: '', audiencia: '' },
    });
    const names = (digest.productos || []).map((p) => p.nombre);
    for (const j of JUNK) ok(!names.includes(j), `digest.productos sin "${j}"`);
    ok(names.length > 0 && ['Yvonne linen caftan', 'Eni Two Piece Set', 'Zahra Dress'].includes(names[0]),
      `productos[0] es un producto real: "${names[0]}"`);
    ok(names.includes('Zahra Dress'), 'la estrella (Zahra Dress) sigue en el digest');
  }

  console.log('== F. El picker muestra el producto real, no el marcador ==');
  {
    const digest = clientDigest.buildFromParts({
      business: 'Ladyee', category: 'moda',
      web: { name: 'Ladyee', description: '', services: ['Zahra Dress', 'Yvonne linen caftan'], city: '', palette: [], url: 'https://ladyee.example/' },
      catalog: { items: [
        { nombre: 'Country/region and currency', fuente: 'web-catalog' },
        { nombre: 'Your bag', fuente: 'web-catalog' },
        { nombre: 'Yvonne linen caftan', precio: '$85.00', fuente: 'web-catalog' },
      ] },
    });
    const producto = (digest.productos[0] && digest.productos[0].nombre) || '';
    const opciones = personalizacion.generarOpcionesOnda({ producto, precio: '', foto: null, diferencial: '', historia: '', lang: 'es' });
    ok(opciones.length === 3, 'el picker trae 3 opciones');
    for (const o of opciones) {
      ok(!/Country|region|currency|your bag/i.test(o.titulo + ' ' + o.caption), `tarjeta "${o.id}" sin marcador (${o.titulo})`);
      ok(new RegExp(producto.split(' ')[0], 'i').test(o.titulo + ' ' + o.caption), `tarjeta "${o.id}" nombra el producto real (${producto})`);
    }
  }

  console.log('== G. itemsFromText (PDF): una sección sin precio no es ítem ==');
  {
    const items = deepRead.itemsFromText('MENU\nNew arrivals\nBlend Patagonia 500g .... $11.900\nTarta de limon artesanal $4.200\n', 'pdf');
    const names = items.map((x) => x.nombre);
    ok(!names.includes('New arrivals'), 'PDF sin "New arrivals" como ítem');
    ok(names.includes('Blend Patagonia 500g') && names.includes('Tarta de limon artesanal'), 'PDF con los ítems con precio');
  }

  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ excepción:', e); process.exit(1); });
