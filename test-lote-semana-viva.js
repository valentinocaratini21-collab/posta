/* SEMANA-VIVA — suite del lote «Una semana, posteo por posteo.»
 * Uso: node test-lote-semana-viva.js [raíz]   (raíz contiene public/;
 * por defecto, la carpeta del propio test = tree/).
 * Pines: sección ×1 por idioma y su posición (tras Estrategia, antes de
 * la puerta) · 7 tarjetas con el mix 2 Imagen · 2 Reel · 2 Carrusel ·
 * 1 Video · censo de vocabulario vedado = 0 en la rebanada de la sección
 * (nombres de la casa para los formatos con nombre propio, la palabra
 * del plan y las líneas de propósito) · sin precio · fila 2 centrada
 * (flex + justify-content:center) · reduced-motion · assets presentes. */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const appjs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

let ok = 0, mal = 0;
function pin(cond, label) {
  if (cond) { ok++; }
  else { mal++; console.log('  ✗ ' + label); }
}
const count = (s, sub) => s.split(sub).length - 1;
const blocks = s => s.match(/\/\* SEMANA-VIVA[\s\S]*?\/\* \/SEMANA-VIVA \*\//g) || [];
const VEDADO = /La Estrella|El Ritual|La Prueba|La Persona|La Invitación|estrategia|strategy|busca/i;
const PRECIO = /US\$|precio fundador|precio|price/i;

/* ---------- ES · app.js ---------- */
pin(count(appjs, 'id="semana"') === 1, 'ES: id="semana" ×1');
pin(count(appjs, 'function lpSemanaHTML()') === 1, 'ES: lpSemanaHTML definida ×1');
pin(count(appjs, 'function lpSemanaInit()') === 1, 'ES: lpSemanaInit definida ×1');
const iCrec = appjs.indexOf('${lpCrecimientoHTML()}');
const iSem = appjs.indexOf('${lpSemanaHTML()}');
const iDoor = appjs.indexOf('lp-week-sec');
pin(iCrec > -1 && iSem > iCrec, 'ES: la llamada va tras lpCrecimientoHTML (Estrategia)');
pin(iSem > -1 && iDoor > iSem, 'ES: la llamada va antes de la puerta (#prueba)');
const iHero = appjs.indexOf('function lpInitHero()');
pin(iHero > -1 && appjs.indexOf('lpSemanaInit();', iHero) > iHero, 'ES: lpSemanaInit() llamada en lpInitHero');

const dataStart = appjs.indexOf('const LP_SEMANA = [');
const dataEnd = appjs.indexOf('];', dataStart);
const data = dataStart > -1 ? appjs.slice(dataStart, dataEnd) : '';
pin(count(data, 'dshort:') === 7, 'ES: LP_SEMANA tiene 7 días');
for (const d of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'])
  pin(data.includes("dshort: '" + d + "'"), 'ES: día ' + d);
pin(count(data, "fmt: 'Imagen'") === 2, 'ES: 2 Imagen');
pin(count(data, "fmt: 'Reel'") === 2, 'ES: 2 Reel');
pin(count(data, "fmt: 'Carrusel'") === 2, 'ES: 2 Carrusel');
pin(count(data, "fmt: 'Video'") === 1, 'ES: 1 Video');
for (const t of ['The Pepperoni', 'La masa, al aire', 'La fila no miente', 'Las manos de la casa', 'Hoy: una porción y listo', 'The Slice, la película', 'La Blanca, espinaca y ricotta'])
  pin(data.includes(t), 'ES: título «' + t + '»');
pin(data.includes('Siete posteos') || appjs.includes('Siete posteos y ninguno de relleno'), 'ES: subtítulo de la sección');
pin(appjs.includes('Una semana, posteo por posteo.'), 'ES: título de la sección');
pin(appjs.includes('Lo que armamos para tu negocio'), 'ES: kicker de la sección');
pin(appjs.includes('@homeslicepizza'), 'ES: @ del negocio');
pin(appjs.includes('Semana tipo · 7 posteos'), 'ES: chip de semana tipo');

const esBlocks = blocks(appjs);
pin(esBlocks.length === 2, 'ES: 2 bloques SEMANA-VIVA (CSS + JS)');
const esSlice = esBlocks.join('\n');
pin(!VEDADO.test(esSlice), 'ES: censo de vocabulario vedado = 0 en la sección');
pin(!PRECIO.test(esSlice), 'ES: sin precio en la sección');
pin(!/US\$|\$\d/.test(esSlice), 'ES: sin monto en la sección');
const css = esBlocks.find(b => b.includes('.sv-week')) || '';
pin(/\.sv-week\{[^}]*display:flex/.test(css) && /\.sv-week\{[^}]*justify-content:center/.test(css),
  'ES: .sv-week es flex con justify-content:center (segunda fila centrada)');
pin(css.includes('flex:0 1 calc(25% - 14px)'), 'ES: tarjetas a 4 por fila (4 + 3)');
pin(/prefers-reduced-motion/.test(css) && /\.sv-day\{transition:none\}/.test(css),
  'ES: reduced-motion presente para la sección');
pin(css.includes('.sv-lb.open{display:flex}'), 'ES: visor presente en CSS');

/* ---------- EN · en/index.html ---------- */
pin(count(en, 'id="semana"') === 1, 'EN: id="semana" ×1');
const eCrec = en.indexOf('id="crecimiento"');
const eSem = en.indexOf('id="semana"');
const eDoor = en.indexOf('id="prueba"');
pin(eCrec > -1 && eSem > eCrec, 'EN: la sección va tras #crecimiento (Strategy)');
pin(eSem > -1 && eDoor > eSem, 'EN: la sección va antes de la puerta (#prueba)');
pin(count(en, '<article class="sv-day"') === 7, 'EN: 7 tarjetas');
for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  pin(en.includes('<span class="sv-dname">' + d + '</span>'), 'EN: día ' + d);
pin(count(en, '<span class="sv-f">Photo</span>') === 2, 'EN: 2 Photo');
pin(count(en, '<span class="sv-f">Reel</span>') === 2, 'EN: 2 Reel');
pin(count(en, '<span class="sv-f">Carousel</span>') === 2, 'EN: 2 Carousel');
pin(count(en, '<span class="sv-f">Video</span>') === 1, 'EN: 1 Video');
pin(en.includes('One week, post by post.'), 'EN: título de la sección');
pin(en.includes('What we make for your business'), 'EN: kicker de la sección');
pin(en.includes('Sample week · 7 posts'), 'EN: chip de semana tipo');
const enBlocks = blocks(en);
pin(enBlocks.length === 2, 'EN: 2 bloques SEMANA-VIVA (CSS + script)');
const enSecStart = en.indexOf('<div class="section" id="semana">');
const enSecEnd = en.indexOf('/* /SEMANA-VIVA */', enSecStart);
const enSlice = enSecStart > -1 ? en.slice(enSecStart, enSecEnd) : '';
pin(!VEDADO.test(enSlice), 'EN: censo de vocabulario vedado = 0 en la sección');
pin(!PRECIO.test(enSlice) && !/US\$|\$\d/.test(enSlice), 'EN: sin precio en la sección');
const enCss = enBlocks.find(b => b.includes('.sv-week')) || '';
pin(/\.sv-week\{[^}]*justify-content:center/.test(enCss), 'EN: segunda fila centrada (CSS espejo)');

/* ---------- assets ---------- */
const ASSETS = [
  'lp-semana-avatar.jpg', 'lp-semana-lun.jpg', 'lp-semana-jue.jpg',
  'lp-semana-mie-1.jpg', 'lp-semana-mie-2.jpg', 'lp-semana-mie-3.jpg', 'lp-semana-mie-4.jpg', 'lp-semana-mie-5.jpg',
  'lp-semana-dom-1.jpg', 'lp-semana-dom-2.jpg', 'lp-semana-dom-3.jpg',
  'lp-semana-reel-mar.mp4', 'lp-semana-reel-mar.jpg',
  'lp-semana-reel-vie.mp4', 'lp-semana-reel-vie.jpg',
  'lp-semana-sab.mp4', 'lp-semana-sab.jpg'
];
for (const a of ASSETS) {
  const p = path.join(ROOT, 'public', a);
  pin(fs.existsSync(p) && fs.statSync(p).size > 8000, 'asset presente: ' + a);
  pin(appjs.includes(a) && en.includes(a), 'asset referenciado ES+EN: ' + a);
}
const sab = path.join(ROOT, 'public', 'lp-semana-sab.mp4');
pin(fs.existsSync(sab) && fs.statSync(sab).size > 1000000, 'el video del sábado es el archivo grande (la película)');

console.log(`SEMANA-VIVA: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
