/* LOTE EQUIPO-VIVO — la sección #equipo pasa a ser la escena del mock
   aprobado por Valentino 18/11 («esto me encanta»): la foto conjunta al
   centro, las tareas que emanan por lado (VALENTINO · EL CRITERIO /
   POSTY · LA CONSTANCIA) y la tira profesional de tres pasos. Más el
   escape «No tengo web» del formulario del hero (regla de la puerta
   18/11: los dos campos siempre + un escape que exime la web).
   Pines estáticos sobre los archivos construidos (sin servidor):
   1. La sección nueva está 1 vez por idioma, con la foto de producción
      (md5 idéntico al mock: sin asset nuevo), los dos paneles, las 6
      tareas, las dos stats en 0 y la tira de pasos.
   2. La tarjeta vieja (.eq-card / .eq-role) salió del markup de la
      sección en ambos idiomas; en el lado de Valentino NO hay línea de
      audios (los audios viven solo del lado de Posty).
   3. El hero conserva los DOS campos (Instagram + web) y suma el escape
      «No tengo web» con su función lpNoWeb (limpia + desactiva + revierte).
   4. El id homeFounderCard se conserva en ES (la medición home_founder
      lo observa); styles.css intacto; stamp app.js?v=799 solo ES. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PUB = path.join(__dirname, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function seccion(html, lang) {
  const i = html.indexOf('id="equipo"');
  const j = html.indexOf('wd-scrolly', i);
  return i < 0 || j < 0 ? '' : html.slice(i, j);
}
function heroForm(html) {
  const i = html.indexOf('<form class="lp-igform" onsubmit="return lpGoTrial(event)">');
  const j = html.indexOf('</form>', i);
  return i < 0 || j < 0 ? '' : html.slice(i, j);
}
const count = (s, sub) => s.split(sub).length - 1;

const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const en = fs.readFileSync(path.join(PUB, 'en/index.html'), 'utf8');
const esIdx = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const cssBase = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
const secES = seccion(appjs, 'es');
const secEN = seccion(en, 'en');
const heroES = heroForm(appjs);
const heroEN = heroForm(en);

// — 1. la escena, una vez por idioma
t('ES: una sola sección #equipo', count(appjs, 'id="equipo"') === 1);
t('EN: una sola sección #equipo', count(en, 'id="equipo"') === 1);
t('ES: kicker «Tus community managers»', secES.includes('eqv-kicker">Tus community managers'));
t('EN: kicker «Your community managers»', secEN.includes('eqv-kicker">Your community managers'));
t('ES: título del mock', secES.includes('<h2>Somos un equipo, Posty y yo</h2>'));
t('EN: título del mock', secEN.includes("<h2>We're a team, Posty and I</h2>"));
t('ES: intro aprobada', secES.includes('Contratás a un equipo: un community manager de verdad + la tecnología que creó'));
t('EN: intro aprobada', secEN.includes('You hire a team: a real community manager + the technology he built'));
t('ES: panel VALENTINO · EL CRITERIO', secES.includes('eqv-pname">VALENTINO') && secES.includes('eqv-chip eqv-chip-y">EL CRITERIO'));
t('ES: panel POSTY · LA CONSTANCIA', secES.includes('eqv-pname">POSTY') && secES.includes('eqv-chip eqv-chip-s">LA CONSTANCIA'));
t('EN: chips espejo', secEN.includes('eqv-chip eqv-chip-y">THE EYE') && secEN.includes('eqv-chip eqv-chip-s">THE CONSTANCY'));
t('ES: 6 tareas (3 por lado)', count(secES, 'eqv-pic') === 6);
t('EN: 6 tareas (3 por lado)', count(secEN, 'eqv-pic') === 6);
t('ES: tareas de Valentino', secES.includes('Estudia tu negocio') && secES.includes('Mira cada posteo antes de que salga') && secES.includes('Arma la estrategia de tu semana'));
t('ES: tareas de Posty', secES.includes('Postea todos los días') && secES.includes('Responde tus comentarios') && secES.includes('Convierte tus audios en cambios'));
t('EN: tareas espejo', secEN.includes('Studies your business') && secEN.includes('Turns your voice notes into changes'));
t('ES: stats en 0', secES.includes('Posteos feos que se escaparon: <b>0</b>') && secES.includes('Días sin postear: <b>0</b>'));
t('EN: stats en 0', secEN.includes('Ugly posts that slipped through: <b>0</b>') && secEN.includes('Days without posting: <b>0</b>'));
t('ES: tira de pasos', secES.includes('TU PRODUCTO') && secES.includes('PUBLICADO TODOS LOS DÍAS'));
t('EN: tira de pasos', secEN.includes('YOUR PRODUCT') && secEN.includes('POSTED EVERY DAY'));
t('ES: nombres sobre la foto', secES.includes('eqv-pn">VALENTINO') && secES.includes('eqv-pn">POSTY'));
t('ES: CSS .eqv- en la plantilla', appjs.includes('.eqv-scene{display:grid;grid-template-columns:1fr 372px 1fr'));
t('EN: CSS .eqv- inline', en.includes('.eqv-scene{display:grid;grid-template-columns:1fr 372px 1fr'));
t('ES: responsive sin conectores', appjs.includes('.eqv-panel-v::after,.eqv-panel-v::before,.eqv-panel-p::after,.eqv-panel-p::before{display:none}'));

// — la foto: asset de producción, byte-idéntico al mock aprobado
const foto = fs.readFileSync(path.join(PUB, 'valentino-posty-fundador.jpg'));
const md5 = crypto.createHash('md5').update(foto).digest('hex');
t('foto = la del mock aprobado (md5)', md5 === '574c3b5082b7e2382dc486f89f17f861');
t('ES: la sección usa la foto de producción', secES.includes('src="valentino-posty-fundador.jpg?v=2"'));
t('EN: la sección usa la foto de producción', secEN.includes('src="valentino-posty-fundador.jpg?v=2"'));

// — 2. lo viejo fuera; el audio solo del lado de Posty
t('ES: sin eq-card en la sección', !secES.includes('eq-card'));
t('EN: sin eq-card en la sección', !secEN.includes('eq-card'));
t('ES: sin eq-role en la sección', !secES.includes('eq-role'));
const ladoV = secES.slice(secES.indexOf('VALENTINO'), secES.indexOf('eqv-photo-card'));
t('ES: Valentino NO responde audios (su lado, sin «audio»)', !/audio/i.test(ladoV));
t('ES: la frase vieja «te responde los audios» = 0 en app.js', count(appjs, 'te responde los audios') === 0);
t('EN: la frase vieja «answers your voice notes himself» = 0', count(en, 'answers your voice notes himself') === 0);
t('ES: homeFounderCard conservado (medición)', secES.includes('id="homeFounderCard"'));

// — 3. puerta del hero: dos campos + escape
t('ES hero: campo Instagram', heroES.includes('id="lpIg"'));
t('ES hero: campo web presente', heroES.includes('data-lp-web'));
t('ES hero: placeholder «tu web o tu link»', heroES.includes('placeholder="tu web o tu link"'));
t('EN hero: placeholder espejo', heroEN.includes('placeholder="your website or your link"'));
t('ES hero: escape «No tengo web» x1', count(appjs, '>No tengo web</button>') === 1);
t('EN hero: escape x1', count(en, ">I don't have a website</button>") === 1);
t('ES: lpNoWeb definida', appjs.includes('function lpNoWeb(btn)'));
t('EN: lpNoWeb definida', en.includes('function lpNoWeb(btn)'));
t('ES: lpNoWeb limpia y desactiva la web', appjs.includes("web.value = ''; web.disabled = true"));
t('ES: CSS del escape', appjs.includes('.lp-noweb-row{') && appjs.includes('.lp-igform.lp-noweb-on input[data-lp-web]{opacity:.45}'));
t('ES: el form de la galería NO se tocó (placeholder viejo sigue ahí)', appjs.includes('placeholder="tu-negocio.com"'));

// — 4. invariantes del lote
t('stamp ES app.js?v=799', esIdx.includes('app.js?v=799'));
t('stamp ES viejo fuera', !esIdx.includes('app.js?v=798'));
t('styles.css sin reglas nuevas del lote', !cssBase.includes('.eqv-'));
t('la sección conserva wd-reveal (ES)', appjs.includes('<div class="section wd-reveal eqv" id="equipo">'));
t('la sección conserva wd-reveal (EN)', en.includes('<div class="section eqv" wd-reveal id="equipo">'));
console.log(`\nLOTE EQUIPO-VIVO: ${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
