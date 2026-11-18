/* LOTE ANCLA-PRECIO — la comparación de valor pegada a la tarjeta del plan.
   Pines estáticos sobre los archivos construidos (sin servidor):
   1. La escena .cmp-scene existe en ES (plantilla de app.js) y EN (index estático),
      con las dos tarjetas alternativas y sus textos exactos.
   2. El precio 199 se rinde UNA sola vez COMO PRECIO en la sección #planes (la
      tarjeta del plan; EN: literal en el archivo; ES: la plantilla ya no trae la
      línea ancla que lo inyectaba por segunda vez — anchorLine fuera de la
      sección). La única otra aparición permitida es la mención en texto del
      párrafo fundador alineado .pc-founder («conservan los US$199 para
      siempre» / «keep US$199 forever», decisión de Valentino 18/11).
   3. El borde fundador: «50 clientes» (ES) / «first 50» (EN) junto a la tarjeta.
   4. Ningún precio futuro (249/299) en las páginas construidas.
   5. Los estilos .cmp-* existen en styles.css. */
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function seccion(html) {
  const i = html.indexOf('id="planes"');
  const j = html.indexOf('lp-final', i);
  return i < 0 || j < 0 ? '' : html.slice(i, j);
}

const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const en = fs.readFileSync(path.join(PUB, 'en/index.html'), 'utf8');
const esIdx = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
const secES = seccion(appjs);
const secEN = seccion(en);

// 1 — escena y textos ES
t('ES: escena cmp-scene', secES.includes('cmp-scene'));
t('ES: tarjeta CM', secES.includes('Un community manager') && secES.includes('US$800–1.500'));
t('ES: filas CM', secES.includes('+ entrevistas y búsqueda') && secES.includes('+ sueldo, vacaciones y bajas') && secES.includes('+ sigue siendo tu problema si falta'));
t('ES: tarjeta DIY', secES.includes('Hacerlo vos') && secES.includes('tu tiempo, todos los días'));
t('ES: filas DIY', secES.includes('pensar qué postear') && secES.includes('diseñar cada pieza') && secES.includes('responder todo'));
t('ES: plansRow dentro de la escena', secES.indexOf('cmp-scene') < secES.indexOf('plansRow') && secES.indexOf('plansRow') < secES.indexOf('cmp-diy'));
// 1 — escena y textos EN
t('EN: escena cmp-scene', secEN.includes('cmp-scene'));
t('EN: tarjeta CM', secEN.includes('A community manager') && secEN.includes('US$800–1,500'));
t('EN: filas CM', secEN.includes('+ interviews and hiring') && secEN.includes('+ salary, vacations and sick days') && secEN.includes("+ still your problem when they're out"));
t('EN: tarjeta DIY', secEN.includes('Doing it yourself') && secEN.includes('your time, every day'));
t('EN: filas DIY', secEN.includes('thinking of what to post') && secEN.includes('designing every piece') && secEN.includes('answering everything'));
// 2 — el 199 como precio una sola vez en la sección; la otra aparición es la
// mención del párrafo fundador alineado (decisión de Valentino 18/11)
t('EN: 199 = 2 en #planes (precio en la tarjeta + mención en .pc-founder)', (secEN.match(/199/g) || []).length === 2);
t('ES: anchorLine fuera de #planes', !secES.includes('anchorLine'));
t('ES: 199 literal solo en .pc-founder (el precio no es literal en la plantilla)', (secES.match(/199/g) || []).length === 1 && secES.includes('conservan los US$199 para siempre'));
// 3 — borde fundador
t('ES: «50 clientes»', secES.includes('Precio fundador:</b> solo para los primeros 50 clientes'));
t('EN: «first 50»', secEN.includes('Founder price:</b> first 50 clients only'));
// 3b — párrafo .pc-founder alineado a la regla nueva (primeros 50 · para siempre)
t('ES: .pc-founder alineado', secES.includes('para los primeros 50 clientes: los que entren ahora conservan los US$199 para siempre'));
t('EN: .pc-founder alineado', secEN.includes('for the first 50 clients: join now and keep US$199 forever'));
t('ES: sin «Primeros 200» ni «12 meses» en #planes', !secES.includes('Primeros 200') && !secES.includes('12 meses'));
t('EN: sin «First 200» ni «12 months» en #planes', !secEN.includes('First 200') && !secEN.includes('12 months'));
// 4 — sin precios futuros en las páginas
t('ES index: sin 249/299', !esIdx.includes('249') && !esIdx.includes('299'));
t('EN index: sin 249/299', !en.includes('249') && !en.includes('299'));
// 5 — estilos
t('CSS: .cmp-scene', css.includes('.cmp-scene'));
t('CSS: .cmp-alt apagada', css.includes('.cmp-alt'));
t('CSS: media mobile de la escena', css.includes('.cmp-cm{order:1}'));

console.log(`ANCLA-PRECIO: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
