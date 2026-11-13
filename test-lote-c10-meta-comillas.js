'use strict';
// (LOTE C10 META-COMILLAS) webExtract.meta(): la captura del atributo
// content respeta la comilla que DELIMITA el atributo.
//
// Bug (diagnóstico Veja #5 §2.4): la clase [^"\'] frenaba en el PRIMER
// apóstrofo interno y la descripción nacía truncada en la ingesta
// («…du caoutchouc d.» — 57 caracteres — en vez de «…d'Amazonie…»).
// Le pasa a todo sitio con apóstrofos: elisiones del francés/italiano,
// contracciones del inglés (don't), marcas (l'oreal).
//
// La suite extrae meta() + dependencias (NAMED_ENTITIES, decodeEntities,
// cleanText) del archivo REAL bajo prueba con VM — prueba el código que
// sale, no una copia — y además ejercita el camino consumidor exportado
// (extractBusinessFacts: meta description → diferencial).
//
// Uso: node test-lote-c10-meta-comillas.js [ruta-a-web-extract.js]
//   Sin argumento: el web-extract.js hermano (el del árbol del lote).
//   Contra la base v995 (bug vivo) fallan A1/A1b/A2/A3/A4, B1/B2, D4,
//   E3/E4, F2 y S1 (12 en total): ese es el control que reproduce el bug.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'web-extract.js');
console.log('archivo bajo prueba:', target);

let ok = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { ok++; console.log('  ok  ', label); }
  else { fail++; console.log('  FAIL', label, extra !== undefined ? '→ ' + JSON.stringify(extra) : ''); }
}

// ---------- meta() real, extraído del archivo ----------
const src = fs.readFileSync(target, 'utf8');
const iA = src.indexOf('const NAMED_ENTITIES');
const iB = src.indexOf('function norm(');
if (iA < 0 || iB < 0 || iB <= iA) { console.log('  FAIL no se pudo extraer meta() del archivo'); process.exit(1); }
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.slice(iA, iB) + '\nthis.__meta = meta;', ctx);
const meta = ctx.__meta;
check('S0 meta() extraído del archivo real es función', typeof meta === 'function');

// ---------- §A el bug: apóstrofo dentro de comillas dobles ----------
const VEJA = "VEJA crée des sneakers avec du coton bio, du caoutchouc d'Amazonie et des matériaux recyclés…";
const VEJA_TRUNC = 'VEJA crée des sneakers avec du coton bio, du caoutchouc d'; // 57 caracteres: el corte del bug
check('A0 la constante del corte mide 57 (el dato del diagnóstico)', VEJA_TRUNC.length === 57, VEJA_TRUNC.length);

const htmlA1 = `<html><head><meta property="og:description" content="${VEJA}"></head><body></body></html>`;
const a1 = meta(htmlA1, 'og:description');
check('A1 og:description de Veja (property primero) vuelve ENTERA', a1 === VEJA, a1);
check('A1b y no es el corte de 57 caracteres', a1 !== VEJA_TRUNC && a1.length === VEJA.length, a1.length);

const htmlA2 = `<html><head><meta content="${VEJA}" property="og:description"></head></html>`;
check('A2 og:description de Veja (content primero) vuelve ENTERA', meta(htmlA2, 'og:description') === VEJA, meta(htmlA2, 'og:description'));

const htmlA3 = `<html><head><meta name="description" content="We don't just sell sneakers, we craft them by hand."></head></html>`;
check("A3 contracción inglesa don't en name=description", meta(htmlA3, 'description') === "We don't just sell sneakers, we craft them by hand.", meta(htmlA3, 'description'));

const htmlA4 = `<html><head><meta property="og:description" content="L'atelier de l'homme: don't miss it"></head></html>`;
check('A4 tres apóstrofos en un mismo atributo', meta(htmlA4, 'og:description') === "L'atelier de l'homme: don't miss it", meta(htmlA4, 'og:description'));

// ---------- §B comilla simple como delimitante ----------
// (el apóstrofo interno «de la otra comilla» es la comilla doble)
const htmlB1 = `<html><head><meta name='description' content='La marca "premium" del barrio, desde 1998.'></head></html>`;
check('B1 delimitante simple con comillas dobles internas', meta(htmlB1, 'description') === 'La marca "premium" del barrio, desde 1998.', meta(htmlB1, 'description'));

const htmlB2 = `<html><head><meta content='Zapatillas "de autor" hechas a mano' name='description'></head></html>`;
check('B2 delimitante simple, content primero', meta(htmlB2, 'description') === 'Zapatillas "de autor" hechas a mano', meta(htmlB2, 'description'));

const htmlB3 = `<html><head><meta name='description' content='El cuidado d’Oréal, pensado para vos'></head></html>`;
check('B3 apóstrofo tipográfico (’) dentro de delimitante simple', meta(htmlB3, 'description') === 'El cuidado d’Oréal, pensado para vos', meta(htmlB3, 'description'));

// ---------- §C sin apóstrofos ASCII: comportamiento idéntico ----------
const htmlC1 = `<html><head><meta name="description" content="Café de especialidad en Palermo. Tostado propio todas las semanas."></head></html>`;
check('C1 descripción común en comillas dobles, sin cambios', meta(htmlC1, 'description') === 'Café de especialidad en Palermo. Tostado propio todas las semanas.', meta(htmlC1, 'description'));

const htmlC2 = `<html><head><meta name='description' content='Panadería artesanal de barrio.'></head></html>`;
check('C2 descripción común en comilla simple, sin cambios', meta(htmlC2, 'description') === 'Panadería artesanal de barrio.', meta(htmlC2, 'description'));

const htmlC3 = `<html><head><meta name="description" content="Dijo &quot;hola&quot; y entró"></head></html>`;
check('C3 entidad &quot; adentro de comillas dobles se decodifica', meta(htmlC3, 'description') === 'Dijo "hola" y entró', meta(htmlC3, 'description'));

const htmlC4 = `<html><head><meta property="og:title" content="L’Oréal Paris — Tienda oficial"></head></html>`;
check('C4 apóstrofo tipográfico en comillas dobles (ya andaba), sin cambios', meta(htmlC4, 'og:title') === 'L’Oréal Paris — Tienda oficial', meta(htmlC4, 'og:title'));

// ---------- §D bordes ----------
const htmlD1 = `<html><head><meta property="og:title" content="Solo un título"></head></html>`;
check('D1 atributo ausente devuelve vacío', meta(htmlD1, 'description') === '' && meta(htmlD1, 'og:description') === '');

const htmlD2 = `<html><head><meta name="description" content=""></head></html>`;
check('D2 content vacío devuelve vacío', meta(htmlD2, 'description') === '');

const htmlD3 = `<html><head><meta property="og:description" content="Solo la og, nada más"></head></html>`;
check('D3 pedir description cuando solo hay og:description no cruza nombres', meta(htmlD3, 'description') === '');

const LARGA = "Sneakers de cuero vegetal y caucho natural d'Amazonie, hechos por artesanos que trabajan con comercio justo y materiales reciclados, con la calidad de siempre y el cuidado de cada detalle puesto a mano.";
const htmlD4 = `<html><head><meta name="description" content="${LARGA}"></head></html>`;
check('D4 descripción larga (>150) con apóstrofo en la primera mitad vuelve entera', LARGA.length > 150 && meta(htmlD4, 'description') === LARGA, (meta(htmlD4, 'description') || '').length);

// ---------- §E los demás atributos que meta() extrae ----------
const htmlE1 = `<html><head><meta name="theme-color" content="#2793C8"></head></html>`;
check('E1 theme-color intacto', meta(htmlE1, 'theme-color') === '#2793C8', meta(htmlE1, 'theme-color'));

const htmlE2 = `<html><head><meta property="og:image" content="https://example.com/foto-producto.jpg"></head></html>`;
check('E2 og:image intacto', meta(htmlE2, 'og:image') === 'https://example.com/foto-producto.jpg', meta(htmlE2, 'og:image'));

const htmlE3 = `<html><head><meta property="og:title" content="L'Atelier — Café de especialidad"></head></html>`;
check("E3 og:title con apóstrofo ASCII vuelve entero", meta(htmlE3, 'og:title') === "L'Atelier — Café de especialidad", meta(htmlE3, 'og:title'));

const htmlE4 = `<html><head><meta property="og:image:alt" content="Foto del modelo d'epoca en la vereda"></head></html>`;
check("E4 og:image:alt con apóstrofo vuelve entero", meta(htmlE4, 'og:image:alt') === "Foto del modelo d'epoca en la vereda", meta(htmlE4, 'og:image:alt'));

// ---------- §F camino consumidor real (módulo exportado) ----------
const we = require(target);
check('F1 el módulo carga y exporta extractBusinessFacts', typeof we.extractBusinessFacts === 'function');
const htmlF2 = `<html><head><meta name="description" content="Hecho a mano con cuero d'origen vegetal, desde 2010."></head><body></body></html>`;
const facts = we.extractBusinessFacts(htmlF2, null);
check("F2 la descripción alimenta el diferencial SIN el corte (llega d'origen)", Array.isArray(facts.diferencial) && facts.diferencial.some((s) => s.includes("d'origen vegetal")), facts.diferencial);

// ---------- §S chequeo estático del arreglo ----------
check('S1 la clase vieja ([^"\']{1,400}) ya no está en el archivo', !src.includes('([^"\\\']{1,400})'));

console.log(`\n${ok} ok · ${fail} fail`);
if (fail) { console.log('HAY FALLOS'); process.exit(1); }
console.log('✓ TODO OK');
