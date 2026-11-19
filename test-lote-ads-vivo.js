/* LOTE ADS-VIVO — «el botón, en tres tiempos» (mock aprobado por Valentino
   18/11 15:03: «me encantó!!! armalo asi»). Pines estáticos sobre los archivos
   construidos (sin servidor):
   1. La escena .av-stage existe en ES (plantilla lpAdsHTML de app.js) y EN
      (index estático), con los tres tiempos y sus textos exactos: el posteo
      publicado con UN botón de vidrio «Impulsar», la hoja YA LLENA (público
      estudiado en una línea, hechos con tilde — nunca formulario) y el estado
      activo con el contador en 1.240.
   2. La escena vieja (la hoja fiel a la app con los grupos de chips
      wd-agroup/wd-achip) salió entera de la sección en los dos idiomas.
   3. La plata rinde una sola vez por sección: «US$22» ×1 (y «US$20» ×1);
      el 199 no aparece en la sección (rinde una vez, en #planes).
   4. El legal es UNA línea, la del mock, en los dos idiomas; el legal largo
      anterior = 0.
   5. Estado sin JS = estado final: el markup nace con la hoja y el activo
      visibles y el contador en 1.240/1,240; el ciclo (.av-play) vive en
      lpDisenoInit (ES) y en el IIFE espejo (EN), con reduced-motion.
   6. Estilos .av-* en el bloque de la landing de ambos archivos (styles.css
      no se toca) y stamps: app.js?v=787 solo en el índice ES. */
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

// 1 — escena y textos ES
t('ES: escena av-stage', secES.includes('av-stage') && secES.includes('data-av-stage'));
t('ES: H2 de producción', secES.includes('Impulsá ads en tus posteos con un click'));
t('ES: viñetas del mock', secES.includes('Tu mejor posteo, detectado solo.') && secES.includes('El público ya viene estudiado: nada que llenar.') && secES.includes('Sale y lo gestionamos nosotros.'));
t('ES: tiempo 1 — posteo + botón Impulsar', secES.includes('Tu posteo, ya publicado') && secES.includes('data-av-boost') && secES.includes('> Impulsar</button>') && secES.includes('lp-tomoko-yuzu.jpg') && secES.includes('lp-tomoko-avatar.jpg'));
t('ES: marca Impulsado', secES.includes('av-mark') && secES.includes(' Impulsado</span>'));
t('ES: tiempo 2 — hoja llena', secES.includes('RECOMENDACIÓN DE POSTY') && secES.includes('Este fue tu posteo con más llegada esta semana'));
t('ES: público en una línea', secES.includes('Mujeres de 25 a 44 años, cerca de tu negocio, que compran postres para regalar y siguen la pastelería japonesa'));
t('ES: hechos, no formulario', secES.includes('av-fact') && secES.includes('Cerca de tu negocio') && secES.includes('Parecido a tus seguidores'));
t('ES: botón Sale así', secES.includes('data-av-sale') && secES.includes('>Sale así</button>'));
t('ES: tiempo 3 — activo + contador', secES.includes('Tu anuncio está activo') && secES.includes('data-av-count') && secES.includes('>1.240</span>'));
t('ES: ver de nuevo', secES.includes('data-av-replay') && secES.includes('Ver de nuevo'));
// 1 — escena y textos EN
t('EN: escena av-stage', secEN.includes('av-stage') && secEN.includes('data-av-stage'));
t('EN: H2 de producción', secEN.includes('Boost ads on your posts with one click'));
t('EN: viñetas espejo', secEN.includes('Your best post, spotted on its own.') && secEN.includes('The audience comes studied: nothing to fill in.') && secEN.includes('It goes out and we manage it.'));
t('EN: tiempo 1 — post + botón Boost', secEN.includes('Your post, already live') && secEN.includes('data-av-boost') && secEN.includes('> Boost</button>') && secEN.includes('/lp-tomoko-yuzu.jpg') && secEN.includes('/lp-tomoko-avatar.jpg'));
t('EN: marca Boosted', secEN.includes('av-mark') && secEN.includes(' Boosted</span>'));
t('EN: tiempo 2 — hoja llena', secEN.includes("POSTY'S RECOMMENDATION") && secEN.includes('This was your top-reaching post this week'));
t('EN: público en una línea', secEN.includes('Women aged 25 to 44, near your business, who buy desserts as gifts and follow Japanese patisserie'));
t('EN: botón Go with this', secEN.includes('data-av-sale') && secEN.includes('>Go with this</button>'));
t('EN: tiempo 3 — activo + contador', secEN.includes('Your ad is live') && secEN.includes('data-av-count') && secEN.includes('>1,240</span>'));
t('EN: ver de nuevo', secEN.includes('data-av-replay') && secEN.includes('Watch again'));
// 2 — la escena vieja salió de la sección
t('ES: sin grupos de chips en la sección', !secES.includes('wd-agroup') && !secES.includes('class="wd-achip') && !secES.includes('wd-boost') && !secES.includes('wd-reco'));
t('EN: sin grupos de chips en la sección', !secEN.includes('wd-agroup') && !secEN.includes('class="wd-achip') && !secEN.includes('wd-boost') && !secEN.includes('wd-reco'));
// 3 — la plata, una sola vez por sección; sin 199 en la sección
t('ES: US$22 ×1 en la sección', cuenta(secES, 'US$22') === 1);
t('EN: US$22 ×1 en la sección', cuenta(secEN, 'US$22') === 1);
t('ES: US$20 ×1 en la sección', cuenta(secES, 'US$20') === 1);
t('EN: US$20 ×1 en la sección', cuenta(secEN, 'US$20') === 1);
t('ES: sin 199 en la sección', !secES.includes('199'));
t('EN: sin 199 en la sección', !secEN.includes('199'));
// 4 — legal de una línea
t('ES: legal del mock', secES.includes('La pauta va por tu cuenta de Meta, aparte de la suscripción. Nada se gasta sin tu OK.'));
t('EN: legal del mock', secEN.includes('The spend runs on your Meta account, separate from the subscription. Nothing is spent without your OK.'));
t('ES: legal largo fuera', !appjs.includes('la gestión se cobra al impulsar con tu tarjeta guardada'));
t('EN: legal largo fuera', !en.includes('our management fee is charged when you boost'));
// 5 — ciclo y estado final
t('ES: ciclo en lpDisenoInit', appjs.includes('function avPlay') && appjs.includes("q('#ads .av-stage')") && appjs.includes('avIO.observe(avStage)'));
t('EN: ciclo en el IIFE espejo', en.includes('function avPlay') && en.includes("q('#ads .av-stage')") && en.includes("toLocaleString('en-US')"));
t('ES: formato del contador es-AR', appjs.includes("toLocaleString('es-AR')"));
t('ES+EN: clases del ciclo en el CSS', appjs.includes('.av-stage.av-play.av-t3 .av-sheet') && en.includes('.av-stage.av-play.av-t3 .av-sheet'));
t('ES+EN: reduced-motion del ciclo', appjs.includes('.av-stage.av-play.av-t1 .av-boost::after{animation:none}') && en.includes('.av-stage.av-play.av-t1 .av-boost::after{animation:none}'));
t('ES+EN: móvil apilado', appjs.includes('.av-sheet-wrap{position:static') && en.includes('.av-sheet-wrap{position:static'));
// 6 — estilos y stamps
t('ES+EN: bloque .av- en la landing', appjs.includes('.av-sheet{') && en.includes('.av-sheet{') && appjs.includes('#ads .av-grid{') && en.includes('#ads .av-grid{'));
t('ES index: app.js?v=793', esIdx.includes('/app.js?v=793') && !esIdx.includes('/app.js?v=792'));
t('ES index: styles sin tocar', esIdx.includes('/styles.css?v=20261298'));
t('EN index: no carga app.js', !en.includes('app.js?v='));

console.log('ADS-VIVO: ' + ok + ' ok · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
