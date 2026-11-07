'use strict';
/* test-lote-juli-etiquetas-en.js — RÓTULOS EN INGLÉS COMO TEMA (Portrait
 * Coffee, 7/11) + TEMA-ORACIÓN EN h37 (Café de Prueba Bamboo, 6/11)
 *
 * Hallazgo (auditoría Juli 7/11, producción v754 — DESPUÉS de v751):
 * v751 cerró el chrome de tienda («Country/region and currency»,
 * «your bag», slogans), pero los captions generados HOY siguen trayendo
 * rótulos en inglés que NO son chrome:
 *  - id 573 (Portrait Coffee): «Best Sellers, otro favorito de
 *    Portrait Coffee ✨» — «Best Sellers» es el nombre de una
 *    colección, no un producto.
 *  - id 571 (Portrait Coffee): «3 claves para elegir bien en single
 *    origin coffees 👇» — «single origin coffees» es el rótulo en
 *    inglés del menú.
 * Ambos pasaban isPlausibleOfferItem: 2-3 palabras, sin puntuación,
 * sin verbos de prosa, sin chrome de la lista v751.
 * Y el lint anti-empalmes dejaba pasar dos aperturas reales:
 *  - id 565 (Café de Prueba Bamboo, 6/11): «Probamos 12 versiones de
 *    Presentamos nuestro café especial del mes…» — tema-ORACIÓN con
 *    verbo conjugado («Presentamos») tras «de»; (g)/(i) miran solo
 *    tras «probar», (h) solo imperativos.
 *  - id 579 (Ladyee, 7/11): «Country/region and currency, otro
 *    favorito de Ladyee Boutique» — la barra del rótulo en la apertura.
 *
 * El fix (mismo lote, dos capas):
 *  (A) client-digest isPlausibleOfferItem: OFFER_ENGLISH_LABELS por
 *      FRASE («best sellers», «single origin», …) + el plural
 *      «coffees». Por frase, no por palabra: un «Single malt» real
 *      sigue pasando; los préstamos del rubro («latte», «flat white»,
 *      «espresso», «barista», «brunch», «makeup») tampoco se tocan.
 *  (B) hooks captionOpenIsGarbled, LINT v9: (j) verbo conjugado en 1ª
 *      del plural con mayúscula tras preposición; (k) «/» en la
 *      apertura.
 *
 * Corre con: node test-lote-juli-etiquetas-en.js (USD 0, sin red). */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-juli-en-'));
process.env.DATA_DIR = TMP;

const clientDigest = require('./client-digest');
const { captionOpenIsGarbled } = require('./hooks');

let passed = 0; let failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ok ', msg); }
  else { failed++; console.error('  ✗ ', msg); }
}

(async () => {
  console.log('== A. La puerta rechaza los rótulos en inglés (casos reales 571/573) ==');
  {
    for (const j of ['Best Sellers', 'Best Seller', 'single origin coffees', 'Single Origin Coffees', 'Single Origin', 'origin coffees']) {
      ok(!clientDigest.isPlausibleOfferItem(j), `puerta cierra "${j}"`);
    }
    // Préstamos reales del rubro y nombres propios: siguen pasando.
    for (const r of ['Flat white', 'Latte', 'Café de especialidad', 'Corte fade', 'Medialunas', 'Single malt', 'Espresso', 'Brunch Aroma', 'Torta del día']) {
      ok(clientDigest.isPlausibleOfferItem(r), `puerta abre "${r}"`);
    }
  }

  console.log('== B. Regresión v751: el chrome viejo sigue cerrado ==');
  {
    for (const j of ['Country/region and currency', 'Your bag', 'Timeless style. Effortless you', 'New arrivals', 'Wishlist', 'Shop all']) {
      ok(!clientDigest.isPlausibleOfferItem(j), `puerta sigue cerrando "${j}"`);
    }
  }

  console.log('== C. buildFromParts: el digest de Portrait Coffee queda sin rótulos ==');
  {
    const digest = clientDigest.buildFromParts({
      business: 'Portrait Coffee', category: 'cafeteria',
      web: { name: 'Portrait Coffee', description: 'Specialty coffee shop', services: ['Flat white', 'Cappuccino'], city: '', palette: [], url: 'https://portraitcoffee.example/', categoryHint: '' },
      feed: null, form: { description: 'Café de especialidad' },
      catalog: { items: [
        { nombre: 'Best Sellers', fuente: 'web-catalog' },
        { nombre: 'single origin coffees', fuente: 'web-catalog' },
        { nombre: 'Flat white', precio: '$4.800', fuente: 'web-catalog' },
        { nombre: 'Cappuccino', precio: '$5.200', fuente: 'web-catalog' },
      ] },
      bioLink: null, photoEntries: null, webCopy: '',
      onboarding: { producto_estrella: 'Flat white', diferencial: '', audiencia: '' },
    });
    const names = (digest.productos || []).map((p) => p.nombre);
    ok(!names.includes('Best Sellers'), 'digest.productos sin "Best Sellers"');
    ok(!names.includes('single origin coffees'), 'digest.productos sin "single origin coffees"');
    ok(names.includes('Flat white'), 'el producto real sigue en el digest');
  }

  console.log('== D. LINT v9 (j): tema-oración con verbo conjugado tras preposición ==');
  {
    // Caso real id 565 (cuenta 85, 6/11).
    ok(captionOpenIsGarbled('Probamos 12 versiones de Presentamos nuestro café especial del mes ☕ hasta dar con esta: Café de Prueba Bamboo', 'Café de Prueba Bamboo') === true,
      '565 real: "de Presentamos…" es empalme');
    // Hermanos de la misma clase.
    ok(captionOpenIsGarbled('El error que casi todos cometen con Traemos el mejor café de la zona', 'Café Aroma') === true,
      '"con Traemos…" es empalme');
    ok(captionOpenIsGarbled('Probamos 12 versiones de Hacemos nuestras medialunas hasta dar con esta: Café Aroma', 'Café Aroma') === true,
      '"de Hacemos…" es empalme');
    // Controles: tema sano tras preposición, en minúscula o nombre propio.
    ok(captionOpenIsGarbled('Probamos 12 versiones de la salsa bolognesa hasta dar con esta: Sabores Casa', 'Sabores Casa') === false,
      'h37 legítimo ("de la salsa…") pasa');
    ok(captionOpenIsGarbled('En Palermo el café se toma fuerte, como siempre', 'Café Aroma') === false,
      '"En Palermo" pasa');
    ok(captionOpenIsGarbled('Una promo para Halloween en Café Aroma', 'Café Aroma') === false,
      '"para Halloween" pasa');
    ok(captionOpenIsGarbled('El pan de campo de la casa, recién horneado', 'Horno de Barrio') === false,
      '"de la casa" pasa');
  }

  console.log('== E. LINT v9 (k): la barra del rótulo en la apertura ==');
  {
    // Caso real id 579 (cuenta 89, 7/11).
    ok(captionOpenIsGarbled('Country/region and currency, otro favorito de Ladyee Boutique ✨', 'Ladyee Boutique') === true,
      '579 real: la barra es empalme');
    // Controles: precios, promos y fechas sin barra en la apertura.
    ok(captionOpenIsGarbled('Llevate el 2x1 en medialunas solo hoy', 'Café Aroma') === false,
      '"2x1" sin barra pasa');
    ok(captionOpenIsGarbled('La merienda sale $12.500 en Café Aroma', 'Café Aroma') === false,
      'precio sin barra pasa');
    ok(captionOpenIsGarbled('La torta del día ya está lista 🍰', 'Café Aroma') === false,
      'apertura limpia pasa');
  }

  console.log('== F. Regresión: los empalmes viejos se siguen cazando y lo limpio pasa ==');
  {
    ok(captionOpenIsGarbled('El error que casi todos cometen con Organizá tu agenda como un pro (y cómo lo evitamos en Gesty)', 'Gesty') === true,
      '454 real (h) sigue cazado');
    ok(captionOpenIsGarbled('Lo que nos dijo una clienta después de probar Unite a nuestra comunidad de negocios en Posty', 'Posty') === true,
      '448 real (g) sigue cazado');
    ok(captionOpenIsGarbled('Lo que nos dijo una clienta después de probar Testimonio de nuestros usuarios en Gesty', 'Gesty') === true,
      '458 real (i) sigue cazado');
    ok(captionOpenIsGarbled('Lo que nos dijo una clienta después de probar el tratamiento capilar en Pelu ADN', 'Pelu ADN') === false,
      'h11 legítimo pasa');
    ok(captionOpenIsGarbled('En Lo de Marta las facturas salen calentitas y con dulce de leche casero', 'Lo de Marta') === false,
      'exención del nombre pasa');
  }

  console.log(`\n${passed} ok · ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ excepción:', e); process.exit(1); });
