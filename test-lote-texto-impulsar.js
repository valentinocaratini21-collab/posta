/* LOTE TEXTO-IMPULSAR — micro-lote de copy (decisión de Valentino 18/11
   21:36: «en vez de "sale asi" me gustaria que diga "impulsar este posteo
   con ads", para que se entienda mas»). Pines estáticos sobre los archivos
   construidos (sin servidor):
   1. En la escena de impulso de la landing (ADS-VIVO, .av-stage), el botón
      de confirmación data-av-sale pasa a decir «Impulsar este posteo con
      Ads» (ES) / «Boost this post with Ads» (EN), y la nota de la hoja que
      lo cita entre comillas dice el mismo texto nuevo — la etiqueta vieja
      («Sale así» / «Go with this») queda en 0 dentro de la escena.
   2. Nada más de la escena cambia: la plata rinde una sola vez («US$22»
      ×1, «US$20» ×1), el 199 sigue en 0 en la sección, el público sigue en
      una línea, el estado activo conserva su contador y el ciclo avPlay
      sigue cableado en los dos idiomas.
   3. Disciplina de alcance: las OTRAS superficies que dicen «Sale así»
      quedan intactas — la hoja de impulso DENTRO de la app (pzAdsAudiencia
      Sale, «Sale así 🚀») y el botón de la escena de la mañana (mv-btn-p)
      no son esta vidriera y no se tocan en este lote. */
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function cuenta(s, x) { return s.split(x).length - 1; }

const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const en = fs.readFileSync(path.join(PUB, 'en/index.html'), 'utf8');
const esIdx = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

const iA = appjs.indexOf('function lpAdsHTML()');
const iB = appjs.indexOf('function lpIdeasHTML()');
const secES = iA < 0 || iB < 0 ? '' : appjs.slice(iA, iB);
const jA = en.indexOf('id="ads"');
const jB = en.indexOf('id="subir"', jA);
const secEN = jA < 0 || jB < 0 ? '' : en.slice(jA, jB);

// 1 — la etiqueta nueva, ES+EN, y la vieja en 0 dentro de la escena
t('ES: botón data-av-sale con la etiqueta nueva', secES.includes('data-av-sale') && secES.includes('>Impulsar este posteo con Ads</button>'));
t('ES: etiqueta nueva ×2 en la escena (botón + cita de la nota)', cuenta(secES, 'Impulsar este posteo con Ads') === 2);
t('ES: nota cita la etiqueta nueva', secES.includes('nada sale hasta que digas «Impulsar este posteo con Ads»'));
t('ES: etiqueta vieja = 0 en la escena', !secES.includes('Sale así'));
t('EN: botón data-av-sale con la etiqueta nueva', secEN.includes('data-av-sale') && secEN.includes('>Boost this post with Ads</button>'));
t('EN: etiqueta nueva ×2 en la escena (botón + cita de la nota)', cuenta(secEN, 'Boost this post with Ads') === 2);
t('EN: nota cita la etiqueta nueva', secEN.includes('nothing runs until you say “Boost this post with Ads”'));
t('EN: etiqueta vieja = 0 en la escena', !secEN.includes('Go with this'));
t('EN: etiqueta vieja = 0 en todo el archivo', !en.includes('Go with this'));
// 2 — el resto de la escena, intacto
t('ES: plata del mock, una vez', secES.includes('US$20 de pauta + US$2 de gestión') && secES.includes('Total&nbsp;US$22') && cuenta(secES, 'US$22') === 1 && cuenta(secES, 'US$20') === 1);
t('EN: plata del mock, una vez', secEN.includes('US$20 in ad spend + US$2 management') && cuenta(secEN, 'US$22') === 1 && cuenta(secEN, 'US$20') === 1);
t('ES: sin 199 en la sección', !secES.includes('199'));
t('EN: sin 199 en la sección', !secEN.includes('199'));
t('ES: público en una línea, intacto', secES.includes('Mujeres de 25 a 44 años, cerca de tu negocio, que compran postres para regalar y siguen la pastelería japonesa'));
t('EN: público en una línea, intacto', secEN.includes('Women aged 25 to 44, near your business, who buy desserts as gifts and follow Japanese patisserie'));
t('ES: estado activo + contador', secES.includes('Tu anuncio está activo') && secES.includes('data-av-count') && secES.includes('>1.240</span>'));
t('EN: estado activo + contador', secEN.includes('Your ad is live') && secEN.includes('data-av-count') && secEN.includes('>1,240</span>'));
t('ES+EN: ciclo avPlay cableado', appjs.includes('function avPlay') && appjs.includes("q('#ads .av-stage')") && en.includes('function avPlay'));
t('ES+EN: CSS del botón intacto (ancho completo, vidrio)', appjs.includes('.av-sale{display:flex;width:100%') && en.includes('.av-sale{display:flex;width:100%'));
// 3 — disciplina de alcance: las otras superficies no se tocaron
t('app: la hoja interna conserva su botón', appjs.includes('pzAdsAudienciaSale') && appjs.includes('Sale así 🚀') && appjs.includes('Go with this 🚀'));
t('landing: la escena de la mañana conserva su botón', appjs.includes('<div class="mv-btn-p">Sale así</div>'));
t('app.js: «Sale así» total = 43 (45 de la base − 2 de la escena)', cuenta(appjs, 'Sale así') === 43);
t('índice ES: sin la escena (vive en app.js) y sin la etiqueta nueva', !esIdx.includes('Impulsar este posteo con Ads'));

console.log('TEXTO-IMPULSAR: ' + ok + ' ok · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
