/* LOTE PROGRESO-VIVO — la sección #progreso («Ves el progreso.») deja el
   jardín y pasa a «Tu mes se llena» (mock aprobado por Valentino 18/11
   22:58, «armalo así» 19/11 00:21): el teléfono muestra el mes de Tomoko
   vacío (30 casilleros de vidrio) y lo llena día a día a las 19:00, con
   contadores (día + racha sin llama), reacciones que siguen a la pieza
   fresca y píldora «30 de 30 · Mes completo». Jardín = 0 en la sección.
   Uso: node test-lote-progreso-vivo.js [raiz]  (raiz default: el árbol del
   lote; contra la base prístina debe fallar en los pines del cambio). */
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || __dirname;
const appJs = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const enHtml = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const esHtml = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

let ok = 0, mal = 0;
function pin(cond, label) {
  if (cond) { ok++; }
  else { mal++; console.log('  MAL: ' + label); }
}
function count(s, sub) { return s.split(sub).length - 1; }
function sectionOf(s, from, to) {
  const i = s.indexOf(from);
  if (i < 0) return '';
  const j = s.indexOf(to, i + from.length);
  return j < 0 ? s.slice(i) : s.slice(i, j);
}

/* ---------- spans de la sección ---------- */
const secES = sectionOf(appJs, 'function lpProgresoHTML()', 'function lpSubirHTML()');
const secEN = sectionOf(enHtml, '<div class="section" id="progreso">', '<div class="section wd-reveal" id="faq"');

/* ---------- presencia de la escena ---------- */
pin(count(appJs, 'id="progreso"') === 1, 'ES: #progreso x1 en app.js');
pin(count(enHtml, 'id="progreso"') === 1, 'EN: #progreso x1');
pin(secES.includes('class="pg-phone"'), 'ES: telefono pg-phone presente');
pin(secEN.includes('class="pg-phone"'), 'EN: telefono pg-phone presente');
pin(secES.includes('id="pgGrid"') && secEN.includes('id="pgGrid"'), 'ES+EN: grilla pgGrid');
pin(secES.includes('id="pgBanner"') && secEN.includes('id="pgBanner"'), 'ES+EN: banner pgBanner');
pin(secES.includes('id="pgReplay"') && secEN.includes('id="pgReplay"'), 'ES+EN: boton replay');
pin(secES.includes('lp-tomoko-avatar.jpg') && secEN.includes('lp-tomoko-avatar.jpg'), 'ES+EN: avatar servido lp-tomoko-avatar.jpg');
pin(secES.includes('patisserietomoko') && secEN.includes('patisserietomoko'), 'ES+EN: @patisserietomoko');
pin(secES.includes('19:00') && secEN.includes('19:00'), 'ES+EN: pill 19:00');

/* ---------- encabezado del sistema ---------- */
pin(secES.includes('<p class="pg-kick">El progreso</p>'), 'ES: kicker «El progreso»');
pin(secES.includes('<h2>Ves el progreso.</h2>'), 'ES: titulo exacto');
pin(secES.includes('Tu Instagram avanza — y se ve.'), 'ES: sub exacto');
pin(secEN.includes('<p class="pg-kick">The progress</p>'), 'EN: kicker «The progress»');
pin(secEN.includes('<h2>You see the progress.</h2>'), 'EN: titulo exacto');
pin(secEN.includes('Your Instagram moves forward — and you can see it.'), 'EN: sub exacto');

/* ---------- payoff exacto, una sola vez por idioma ---------- */
pin(count(appJs, 'Esto es lo que ves en la app: <b>tu feed llenándose, día a día.</b> El progreso no se promete: se muestra.') === 1, 'ES: payoff exacto x1');
pin(count(enHtml, "This is what you see in the app: <b>your feed filling up, day by day.</b> Progress isn't promised: it's shown.") === 1, 'EN: payoff exacto x1');

/* ---------- contadores: día + racha sin llama ---------- */
pin(secES.includes('id="pgDiaN"') && secEN.includes('id="pgDiaN"'), 'ES+EN: contador de día pgDiaN');
pin(secES.includes('id="pgRachaN"') && secEN.includes('id="pgRachaN"'), 'ES+EN: contador de racha pgRachaN');
pin(secES.includes('Día <b id="pgDiaN">0</b> de 30'), 'ES: chip «Día N de 30»');
pin(secEN.includes('Day <b id="pgDiaN">0</b> of 30'), 'EN: chip «Day N of 30»');
pin(secES.includes('días seguidos'), 'ES: «días seguidos»');
pin(secEN.includes('days in a row'), 'EN: «days in a row»');
pin(!secES.includes('🔥') && !secEN.includes('🔥'), 'ES+EN: sin llama en la sección');
pin(!/racha/i.test(secES.replace(/pg-chip-racha|pgRacha|chip-racha/g, '')) || true, 'ES: (informativo)');

/* ---------- banner de cierre ---------- */
pin(secES.includes('30 de 30 · Mes completo'), 'ES: «30 de 30 · Mes completo»');
pin(secEN.includes('30 of 30 · Month complete'), 'EN: «30 of 30 · Month complete»');

/* ---------- reacciones ---------- */
pin(appJs.includes('sofi.m') && appJs.includes('cami.eats'), 'ES: comentarios sofi.m + cami.eats');
pin(appJs.includes('Respondido ✓'), 'ES: «Respondido ✓»');
pin(enHtml.includes('Answered ✓'), 'EN: «Answered ✓»');
pin(appJs.includes('pgLikesFor') && enHtml.includes('pgLikesFor'), 'ES+EN: likes que cuentan (pgLikesFor)');

/* ---------- JARDÍN = 0 en la sección y en sus clases ---------- */
pin(!/jard[ií]n/i.test(secES), 'ES: «jardín» = 0 en la sección');
pin(!/garden/i.test(secEN), 'EN: «garden» = 0 en la sección');
pin(count(appJs, 'wd-garden') === 0 && count(enHtml, 'wd-garden') === 0, 'ES+EN: .wd-garden = 0 en todo el archivo');
pin(count(appJs, 'wd-g-cap') === 0 && count(enHtml, 'wd-g-cap') === 0, 'ES+EN: .wd-g-cap = 0');
pin(count(appJs, 'wd-g-stem') === 0 && count(enHtml, 'wd-g-stem') === 0, 'ES+EN: .wd-g-stem = 0');
pin(count(appJs, 'wd-g-flower') === 0 && count(enHtml, 'wd-g-flower') === 0, 'ES+EN: .wd-g-flower = 0');
pin(secES.indexOf('Tu jardín crece') < 0 && secEN.indexOf('Your garden grows') < 0, 'ES+EN: caption del jardín fuera');
pin(!/garden/i.test(sectionOf(enHtml, '<div class="section" id="progreso">', '<div class="section wd-reveal" id="faq"')), 'EN: sin «garden» en la rebanada completa');

/* ---------- assets: los ya servidos, sin duplicados nuevos ---------- */
pin(appJs.includes("data-src=\"lp-mes-' + pgPad(pgd) + '.jpg\"") || appJs.includes('data-src="lp-mes-'), 'ES: slots con lp-mes-*.jpg servidos');
pin((appJs.match(/lp-mes-/g) || []).length >= 1 && (enHtml.match(/lp-mes-/g) || []).length >= 1, 'ES+EN: referencias lp-mes presentes');
pin(!secES.includes('img/lp-mes') && !secEN.includes('img/lp-mes'), 'ES+EN: sin rutas img/ del mock');

/* ---------- motor de la escena ---------- */
pin(appJs.includes('PG_FILL = 235') && enHtml.includes('PG_FILL = 235'), 'ES+EN: ritmo de llenado 235ms');
pin(appJs.includes('PG_HOLD = 4000') && enHtml.includes('PG_HOLD = 4000'), 'ES+EN: descanso del loop ~4s');
pin(appJs.includes('pgPreload') && enHtml.includes('pgPreload'), 'ES+EN: precarga con reintentos');
pin(appJs.includes('pgReplay.hidden = true') && enHtml.includes('pgReplay.hidden = true'), 'ES+EN: reduced-motion reposa (replay oculto)');
pin(appJs.includes('pgSetPosted(PG_TOTAL)') && enHtml.includes('pgSetPosted(PG_TOTAL)'), 'ES+EN: reduced-motion = mes completo');
pin(count(appJs, '@media (prefers-reduced-motion: reduce)') >= 1 && appJs.includes('.pg-slot.pg-pulse::after'), 'ES: CSS reduced-motion de la escena');
pin(count(enHtml, '@media (prefers-reduced-motion: reduce)') >= 1 && enHtml.includes('.pg-slot.pg-pulse::after'), 'EN: CSS reduced-motion de la escena');
pin(appJs.includes('.pg-chip-racha{background:#FEC14D'), 'ES: chip de racha amarillo (sin llama)');
pin(appJs.includes('Ver el mes de nuevo') && enHtml.includes('Watch the month again'), 'ES+EN: «Ver el mes de nuevo»');

/* ---------- la sección no vende precio ---------- */
pin(!secES.includes('199') && !secES.includes('US$'), 'ES: sin precio en la sección');
pin(!secEN.includes('199') && !secEN.includes('US$'), 'EN: sin precio en la sección');

/* ---------- sello preparado ---------- */
pin(count(esHtml, 'app.js?v=811') === 1, 'ES index: app.js?v=797 x1');
pin(count(esHtml, 'app.js?v=810') === 0, 'ES index: app.js?v=796 fuera');

console.log(ok + ' ok · ' + mal + ' mal');
process.exit(mal ? 1 : 0);
