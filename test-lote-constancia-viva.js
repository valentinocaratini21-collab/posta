/* LOTE CONSTANCIA-VIVA — el mes de Tomoko portado del mock aprobado
   (Valentino, 18/11: «está buenísimo» + corrección: las 30 imágenes distintas,
   todas del mismo rubro — pastelería).
   Pines estáticos sobre los archivos construidos (sin servidor):
   1. La sección #ideas (lpIdeasHTML en app.js ES + espejo inline EN) es la
      escena del mock: calendario de Patisserie Tomoko a la izquierda, lead de
      una línea, tarjeta «Tu mes en números» como ESCENA web (censo #10: no es
      función de cliente), CTA intacta.
   2. El calendario referencia 30 imágenes DISTINTAS lp-mes-01..30.jpg, en
      orden, y los 30 archivos existen en public/ con md5 todos distintos.
   3. La mezcla de formatos del mock: 7 marcadores reel, 5 carrusel, pastillas
      de historia en los días 9/15/21, estrella el día 21, leyenda con la
      mezcla, payoff «30 de 30» una sola vez como payoff.
   4. Lo viejo fuera de la sección: nada de gt-* (rubros mezclados), ni la
      lista de bullets, ni la cap-note.
   5. El CSS .cv-* vive junto al bloque del calendario (app.js ES + EN),
      styles.css intacto; stamp app.js?v=794 solo en el índice ES (re-pineado al aterrizaje; en el scratch del lote era 787). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PUB = path.join(__dirname, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function seccionES(html) {
  const i = html.indexOf('function lpIdeasHTML()');
  const j = html.indexOf('function lpCrecimientoHTML()', i);
  return i < 0 || j < 0 ? '' : html.slice(i, j);
}
function seccionEN(html) {
  const i = html.indexOf('id="ideas"');
  const j = html.indexOf('id="crecimiento"', i);
  return i < 0 || j < 0 ? '' : html.slice(i, j);
}

const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const en = fs.readFileSync(path.join(PUB, 'en/index.html'), 'utf8');
const esIdx = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
const secES = seccionES(appjs);
const secEN = seccionEN(en);

// 1 — la escena, ES
t('ES: calendario primero (cap-side antes que cap-copy)', secES.indexOf('cap-side') < secES.indexOf('cap-copy'));
t('ES: sin cap-flip en la sección', !secES.includes('cap-flip'));
t('ES: cabeza con avatar y negocio', secES.includes('lp-tomoko-avatar.jpg') && secES.includes('Un mes con nosotros') && secES.includes('cv-biz">Patisserie Tomoko'));
t('ES: lead de una línea', secES.includes('Y a fin de mes, te llega esto: la prueba de que valió la pena.'));
t('ES: tarjeta resumen', secES.includes('Tu mes en números') && secES.includes('El resumen que te manda Posty'));
t('ES: stats del resumen', secES.includes('<b>posteos</b>, sin faltar un día') && secES.includes('<b>comentarios respondidos</b> por nosotros') && secES.includes('cv-n">214'));
t('ES: fila estrella del resumen', secES.includes('Tu pieza estrella del mes') && secES.includes('Berry Mille Crepe') && secES.includes('lp-tomoko-berry.jpg'));
t('ES: CTA intacta', secES.includes('href="/prueba"') && secES.includes('Probá gratis 3 días'));
// 1 — la escena, EN
t('EN: calendario primero (cap-side antes que cap-copy)', secEN.indexOf('cap-side') < secEN.indexOf('cap-copy'));
t('EN: sin cap-flip en la sección', !secEN.includes('cap-flip'));
t('EN: cabeza con avatar y negocio', secEN.includes('lp-tomoko-avatar.jpg') && secEN.includes('A month with us') && secEN.includes('cv-biz">Patisserie Tomoko'));
t('EN: lead de una línea', secEN.includes('And at the end of the month, this arrives: the proof that it was worth it.'));
t('EN: tarjeta resumen', secEN.includes('Your month in numbers') && secEN.includes('The summary Posty sends you'));
t('EN: stats del resumen', secEN.includes('<b>posts</b>, without missing a day') && secEN.includes('<b>comments answered</b> by us') && secEN.includes('cv-n">214'));
t('EN: fila estrella del resumen', secEN.includes('Your star piece of the month') && secEN.includes('Berry Mille Crepe'));
t('EN: CTA intacta', secEN.includes('href="/en/prueba"') && secEN.includes('Try it free for 3 days'));

// 2 — 30 imágenes distintas, en orden, archivos reales distintos
for (const [nom, sec] of [['ES', secES], ['EN', secEN]]) {
  const refs = [...sec.matchAll(/lp-mes-(\d\d)\.jpg/g)].map(m => m[1]);
  t(nom + ': 30 refs lp-mes en orden 01..30', refs.length === 30 && refs.every((v, i) => v === String(i + 1).padStart(2, '0')));
}
const hashes = new Set();
let allExist = true;
for (let d = 1; d <= 30; d++) {
  const f = path.join(PUB, 'lp-mes-' + String(d).padStart(2, '0') + '.jpg');
  if (!fs.existsSync(f)) { allExist = false; break; }
  hashes.add(crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex'));
}
t('los 30 archivos lp-mes existen', allExist);
t('los 30 archivos lp-mes son todos distintos (md5)', hashes.size === 30);

// 3 — mezcla de formatos y marcas del mock
for (const [nom, sec] of [['ES', secES], ['EN', secEN]]) {
  t(nom + ': 7 marcadores reel', (sec.match(/cv-fmt cv-reel/g) || []).length === 7);
  t(nom + ': 5 marcadores carrusel', (sec.match(/cv-fmt cv-car/g) || []).length === 5);
  t(nom + ': 3 pastillas de historia', (sec.match(/class="cv-pill/g) || []).length === 3);
  t(nom + ': estrella el día 21', (sec.match(/cv-star"/g) || []).length === 1);
  t(nom + ': payoff una sola vez', (sec.match(/<b>30 (de|of) 30\.<\/b>/g) || []).length === 1);
  t(nom + ': racha y contador de producción', sec.includes('wd-cal-streak') && sec.includes('wd-cal-count'));
}
t('ES: textos de pastillas', secES.includes('tu foto · salió ese día') && secES.includes('feriado · salió igual') && secES.includes('fecha que vende · ya planeada'));
t('EN: textos de pastillas', secEN.includes('your photo · posted that day') && secEN.includes('holiday · posted anyway') && secEN.includes('a date that sells · already planned'));
t('ES: leyenda con la mezcla', secES.includes('cv-lg-mix">18 fotos · 7 reels · 5 carruseles'));
t('EN: leyenda con la mezcla', secEN.includes('cv-lg-mix">18 photos · 7 reels · 5 carousels'));

// 4 — lo viejo, fuera
for (const [nom, sec] of [['ES', secES], ['EN', secEN]]) {
  t(nom + ': sin imágenes gt- de rubros mezclados', !/gt-[a-z]/.test(sec));
  t(nom + ': sin lista de bullets', !sec.includes('cap-list'));
  t(nom + ': sin cap-note', !sec.includes('cap-note'));
  t(nom + ': sin el párrafo viejo', !sec.includes('busiest weeks') && !sec.includes('semanas de más trabajo'));
}

// 5 — CSS y stamps
t('ES: CSS .cv-* junto al calendario en app.js', appjs.includes('.cv-pilled{overflow:visible') && appjs.includes('.cv-sum{') && appjs.includes('.cv-pill{'));
t('EN: CSS .cv-* espejado en en/index.html', en.includes('.cv-pilled{overflow:visible') && en.includes('.cv-sum{') && en.includes('.cv-pill{'));
t('styles.css intacto (sin .cv-)', !css.includes('.cv-'));
t('ES index: app.js?v=794', esIdx.includes('app.js?v=794') && !esIdx.includes('app.js?v=793'));
t('EN index: sin app.js (como producción)', !en.includes('app.js?v='));

console.log(`\nCONSTANCIA-VIVA · ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
