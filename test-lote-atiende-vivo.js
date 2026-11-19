/* LOTE ATIENDE-VIVO — el chat en tres actos (mock aprobado por Valentino
   18/11 17:20: «esto tambien»). Pines estáticos sobre los archivos
   construidos (sin servidor):
   1. La escena .at-chat existe en ES (plantilla lpAtiendeHTML de app.js) y
      EN (index estático), con los tres actos y sus textos exactos del mock:
      comentario respondido, DM respondido y la escalada «Esto necesita tu
      criterio» que NO se responde sola — se pasa al dueño.
   2. La escena vieja (.wd-chat con sus 4 mensajes planos y la bandera
      amarilla .wd-flag) salió entera de la sección en los dos idiomas,
      markup y CSS.
   3. Estado sin JS = estado final: los 7 pasos nacen con la clase «on»
      (conversación completa visible); el ciclo (data-at-step) vive en
      lpDisenoInit (ES) y en el IIFE espejo (EN), con reduced-motion.
   4. La CTA de la sección pasa a vidrio (.at-glass-btn, ley de vidrio);
      el botón plano .btn-primary sale de la sección.
   5. Estilos .at-* en el bloque de la landing de ambos archivos
      (styles.css no se toca) y stamp app.js?v=800 solo en el índice ES.
   Enmienda MAPA-RUBROS (gemela, 19/11): la escena queda sin huella de
   Tomoko — el mapa la asigna solo a Constancia; el comentario del acto 1
   pregunta por una torta de chocolate genérica (pastelería sin nombre),
   con pines negativos de Tomoko/Mille Crepe/patisserie en la escena. */
const fs = require('fs');
const path = require('path');
const PUB = path.join(__dirname, 'public');
let ok = 0, mal = 0;
function t(nombre, cond) { if (cond) { ok++; } else { mal++; console.log('  MAL:', nombre); } }
function cuenta(s, x) { return s.split(x).length - 1; }

const appjs = fs.readFileSync(path.join(PUB, 'app.js'), 'utf8');
const en = fs.readFileSync(path.join(PUB, 'en/index.html'), 'utf8');
const esIdx = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

const iA = appjs.indexOf('function lpAtiendeHTML()');
const iB = appjs.indexOf('function lpProgresoHTML()');
const secES = iA < 0 || iB < 0 ? '' : appjs.slice(iA, iB);
const jA = en.indexOf('id="atiende"');
const jB = en.indexOf('id="crecimiento"', jA);
const secEN = jA < 0 || jB < 0 ? '' : en.slice(jA, jB);

// 1 — cabecera y escena ES
t('ES: sección #atiende única', cuenta(appjs, 'id="atiende"') === 1);
t('ES: kicker Atención', secES.includes('at-kick') && secES.includes('>Atención</div>'));
t('ES: H2 de producción', secES.includes('<h2>Atiende tu Instagram.</h2>'));
t('ES: lede del mock', secES.includes('No solo publicamos: también atendemos — con tu voz y tu estilo.'));
t('ES: tarjeta y chat', secES.includes('at-card') && secES.includes('at-chat'));
t('ES: acto 1 — comentario', secES.includes('Comentario en tu posteo') && secES.includes('¿La torta de chocolate viene en tamaño grande? Es para un cumpleaños'));
t('ES: sin huella Tomoko en la escena (enmienda MAPA-RUBROS)', !secES.includes('Tomoko') && !secES.includes('Mille Crepe') && !secES.includes('patisserie'));
t('ES: acto 1 — respuesta', secES.includes('Posty responde') && secES.includes('¡Hola! Sí — viene en tamaño grande, para 12 personas. ¿Querés que te reservemos una para el sábado?'));
t('ES: chip «respondido en el momento» ×1', cuenta(secES, 'respondido en el momento') === 1 && secES.includes('at-glass-chip'));
t('ES: acto 2 — DM y respuesta', secES.includes('¿Mañana abren? ¿Desde qué hora?') && secES.includes('¡Hola! Mañana abrimos de 9 a 19 h. ¡Te esperamos!'));
t('ES: acto 3 — DM 30 tortas', cuenta(secES, 'Quiero encargar 30 tortas para el cumpleaños de mi empresa, ¿me pasás precio?') === 2);
t('ES: escalada — Esto necesita tu criterio', secES.includes('at-esc') && secES.includes('Esto necesita tu criterio') && secES.includes('PARA VOS'));
t('ES: escalada — botón y nota', secES.includes('>Ver y responder</a>') && secES.includes('Posty no lo respondió solo: te lo pasó a vos.'));
t('ES: cierre cálido', secES.includes('¡Genial, gracias!') && secES.includes('at-warm'));
t('ES: pasos del ciclo', cuenta(secES, 'data-at-step=') === 7 && cuenta(secES, 'data-at-typing=') === 3);
t('ES: estado final al nacer (7 pasos con on)', cuenta(secES, ' on" data-at-step') === 7);
t('ES: avatar ai-avatar.png ×5', cuenta(secES, 'src="ai-avatar.png"') === 5);
t('ES: CTA de vidrio a /prueba', secES.includes('at-glass-btn') && secES.includes('href="/prueba">Empezar mi prueba gratis</a>'));
t('ES: botón de la escalada a /prueba', secES.includes('href="/prueba">Ver y responder</a>'));

// 1 — cabecera y escena EN
t('EN: sección #atiende única', cuenta(en, 'id="atiende"') === 1);
t('EN: kicker Care', secEN.includes('at-kick') && secEN.includes('>Care</div>'));
t('EN: H2 de producción', secEN.includes('<h2>It looks after your Instagram.</h2>'));
t('EN: lede espejo', secEN.includes("We don't just post: we also look after your account — in your voice and your style."));
t('EN: acto 1', secEN.includes('Comment on your post') && secEN.includes('Does the chocolate cake come in a large size?') && secEN.includes('Want us to set one aside for you for Saturday?'));
t('EN: no Tomoko trace in the scene (MAPA-RUBROS amendment)', !secEN.includes('Tomoko') && !secEN.includes('Mille Crepe') && !secEN.includes('patisserie'));
t('EN: chip ×1', cuenta(secEN, 'answered on the spot') === 1);
t('EN: acto 2', secEN.includes('Are you open tomorrow? From what time?') && secEN.includes("Tomorrow we're open 9 AM to 7 PM. See you then!"));
t('EN: acto 3 — 30 cakes ×2', cuenta(secEN, "I'd like to order 30 cakes for my company's birthday — can you send me a price?") === 2);
t('EN: escalada', secEN.includes('This needs your judgment') && secEN.includes('FOR YOU') && secEN.includes('>See it and reply</a>') && secEN.includes("Posty didn't answer this one on its own: it passed it to you."));
t('EN: cierre cálido', secEN.includes('Great, thank you!'));
t('EN: pasos del ciclo', cuenta(secEN, 'data-at-step=') === 7 && cuenta(secEN, 'data-at-typing=') === 3 && cuenta(secEN, ' on" data-at-step') === 7);
t('EN: avatar ai-avatar.png ×5', cuenta(secEN, 'src="ai-avatar.png"') === 5);
t('EN: CTA de vidrio a /en/prueba', secEN.includes('href="/en/prueba">Start my free trial</a>') && secEN.includes('href="/en/prueba">See it and reply</a>'));

// 2 — la escena vieja salió entera
t('ES: markup viejo = 0 en la sección', !secES.includes('wd-chat') && !secES.includes('wd-msg') && !secES.includes('wd-flag'));
t('EN: markup viejo = 0 en la sección', !secEN.includes('wd-chat') && !secEN.includes('wd-msg') && !secEN.includes('wd-flag'));
t('ES: CSS viejo = 0 en el archivo', !appjs.includes('.wd-chat{') && !appjs.includes('.wd-msg') && !appjs.includes('.wd-flag') && !appjs.includes('.wd-who'));
t('EN: CSS viejo = 0 en el archivo', !en.includes('.wd-chat{') && !en.includes('.wd-msg') && !en.includes('.wd-flag') && !en.includes('.wd-who'));
t('ES: párrafo largo viejo = 0', !appjs.includes('Respondemos los comentarios de tus posteos y los mensajes que te llegan'));
t('EN: párrafo largo viejo = 0', !en.includes('We reply to the comments on your posts and the messages that come in'));
t('ES: bandera vieja = 0', !appjs.includes('Lo que necesita tu criterio te lo avisamos a vos'));
t('EN: bandera vieja = 0', !en.includes('Anything that needs your judgment gets flagged to you'));

// 3 — ciclo y targets
t('ES: ciclo en lpDisenoInit', appjs.includes("q('#atiende .at-chat')") && appjs.includes('data-at-step') && appjs.includes('atPlay'));
t('EN: ciclo en el IIFE espejo', en.includes("q('#atiende .at-chat')") && en.includes('atPlay'));
t('ES: targets sin #atiende .wd-chat', !appjs.includes('#atiende .wd-chat'));
t('EN: targets sin #atiende .wd-chat', !en.includes('#atiende .wd-chat'));
t('ES: CSS .at- en el bloque landing', appjs.includes('.at-esc{') && appjs.includes('.at-glass-btn{') && appjs.includes('@keyframes at-bounce'));
t('EN: CSS .at- en el bloque landing', en.includes('.at-esc{') && en.includes('.at-glass-btn{') && en.includes('@keyframes at-bounce'));

// 4 — botón plano fuera de la sección
t('ES: sin btn-primary en la sección', !secES.includes('btn btn-primary'));
t('EN: sin btn-primary en la sección', !secEN.includes('btn btn-primary'));

// 5 — stamps
t('índice ES: app.js?v=800', esIdx.includes('app.js?v=800') && !esIdx.includes('app.js?v=799'));
t('índice EN: no carga app.js con sello del lote', !en.includes('app.js?v=800'));

console.log('LOTE ATIENDE-VIVO: ' + ok + ' ok · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
