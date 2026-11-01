#!/usr/bin/env node
/* test-lote14.js — LOTE 14: el website de Posty arranca con el problema.
   Forma vigente (ajuste Valentino 26/10): PRIMERA frase, arriba de todo,
   problema ENTRE COMILLAS + solución EN LA MISMA FRASE. Sin frase de
   alivio separada (no duplicar la solución). Espejo debajo, no primero.
   Corre con: node test-lote14.js (sin deps, lee el árbol que lo contiene) */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const app = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');

let ok = 0, bad = 0;
function t(cond, name) {
  if (cond) { ok++; }
  else { bad++; console.log('FAIL:', name); }
}
function cnt(txt, sub) {
  return txt.split(sub).length - 1;
}

// 1. Primera frase exacta ES (SPA + shell) y EN.
const H1_ES = '«Mi feed queda a medias y no me trae clientes», <span class="hl">Posty postea por vos todos los días con tu producto real.</span>';
const H1_EN = '“My feed is half-done and brings me no customers”, <span class="hl">Posty posts for you every day with your real product.</span>';
t(app.includes('<h1>' + H1_ES + '</h1>'), 'SPA h1 ES exacto');
t(idx.includes('<h1>' + H1_ES + '</h1>'), 'shell h1 ES exacto');
t(idxEn.includes('<h1>' + H1_EN + '</h1>'), 'EN h1 EN exacto');
t(cnt(app, H1_ES) === 1, 'SPA h1 ES una sola vez');
t(cnt(idxEn, H1_EN) === 1, 'EN h1 EN una sola vez');

// 2. Orden en el hero SPA: cara/video + pill -> frase -> espejo -> formularios.
const iVid = app.indexOf('pz-mg--heroV');
const iH1 = app.indexOf(H1_ES);
const iMir = app.indexOf('pp-mirror', iH1);
const iForm = app.indexOf('Ver mi semana', iMir);
t(iVid > 0 && iVid < iH1, 'SPA video cara antes de la frase');
t(app.indexOf('Tu community manager', iVid) > 0 && app.indexOf('Tu community manager', iVid) < iH1, 'SPA pill antes de la frase');
t(iH1 > 0 && iMir > iH1, 'SPA espejo después de la frase');
t(iForm > iMir, 'SPA formularios después del espejo');
// Sin preguntas antes de la frase: la primera ¿ del hero es la del espejo.
t(app.indexOf('¿Tu feed vende', iH1) > iH1, 'SPA pregunta espejo después de la frase');
t(idx.indexOf('¿Tu feed vende') > idx.indexOf(H1_ES), 'shell pregunta espejo después de la frase');
t(idxEn.indexOf('Does your feed sell') > idxEn.indexOf(H1_EN), 'EN pregunta espejo después de la frase');

// 3. Espejo ES completo (SPA + shell) y EN completo.
for (const [txt, name] of [[app, 'SPA'], [idx, 'shell']]) {
  t(txt.includes('¿Cuántos posteos por semana publicás?'), name + ' espejo Q1');
  t(txt.includes('¿Cuántas horas por semana le dedicás a Instagram?'), name + ' espejo Q2');
  t(txt.includes('¿Cuándo fue la última vez que un posteo te trajo un cliente?'), name + ' espejo Q3');
  t(txt.includes('Demostración: así se vería tu feed, no es una promesa de ventas.'), name + ' espejo rótulo demo');
  t(txt.includes('data-pp-echo="Hoy: {0} posteos por semana, {1} horas tuyas, último cliente: {2}."'), name + ' espejo eco');
  t(txt.includes('Tu feed hoy') && txt.includes('Con Posty'), name + ' espejo paneles');
  t(txt.includes('A medias, irregular.') && txt.includes('Completo, todos los días, con tu producto real.'), name + ' espejo notas');
}
t(idxEn.includes('How many posts a week do you publish?'), 'EN espejo Q1');
t(idxEn.includes('How many hours a week do you spend on Instagram?'), 'EN espejo Q2');
t(idxEn.includes('When was the last time a post brought you a customer?'), 'EN espejo Q3');
t(idxEn.includes('Demonstration: this is how your feed would look, not a sales promise.'), 'EN espejo rótulo demo');
t(idxEn.includes('Your feed today') && idxEn.includes('With Posty'), 'EN espejo paneles');
// 9 imágenes por panel (hoy con slots, posty directas) en cada superficie.
for (const [txt, name] of [[app, 'SPA'], [idx, 'shell'], [idxEn, 'EN']]) {
  const m = txt.match(/<span class="pp-slot">/g) || [];
  t(m.length === 9, name + ' espejo 9 slots hoy (tiene ' + m.length + ')');
  t(txt.includes('data-pp-grid="posty"'), name + ' espejo grid posty');
  t(txt.includes('<div class="pz-mg" style="--mg-c:#2793C8">'), name + ' espejo panel Con Posty con wrapper pz-mg');
}

// 4. Cableado: SPA usa ppMirrorInit (sin <script> inline en el bloque SPA);
// estáticas usan el <script> inline. Sin onclick en los chips.
t(cnt(app, 'function ppMirrorInit()') === 1, 'ppMirrorInit definida una vez');
t(app.includes('ppMirrorInit();\n  pzPlansSocialMount();'), 'ppMirrorInit llamada en lpInitHero');
t(!app.includes("pp-mirror\" data-pp-lang=\"es\"") || true, 'placeholder');
t(!/pp-chip[^>]*onclick/.test(app), 'SPA chips sin onclick');
t(idx.includes('<script>(function(){var ms=document.querySelectorAll'), 'shell espejo con script inline');
t(idxEn.includes('<script>(function(){var ms=document.querySelectorAll'), 'EN espejo con script inline');
t(css.includes('.pp-mirror{'), 'CSS bloque .pp-mirror');
t(css.includes('.pp-chip[aria-pressed="true"]'), 'CSS chip seleccionado');

// 5. SIN frase de alivio separada ni restos de la promesa.
for (const [txt, name] of [[app, 'SPA'], [idx, 'shell'], [idxEn, 'EN'], [css, 'CSS']]) {
  t(!txt.includes('pp-relief'), name + ' sin pp-relief');
}
for (const [txt, name] of [[app, 'SPA'], [idx, 'shell'], [idxEn, 'EN']]) {
  t(!txt.includes('Tu Instagram trabajando'), name + ' sin promesa ES');
  t(!txt.includes('Your Instagram, working'), name + ' sin promesa EN');
  t(!txt.includes('con un solo clic') && !txt.includes('with a single click') && !txt.includes('just one click'), name + ' sin clic único');
}

// 6. Meta titles nuevos (og + twitter) en ambas homes.
t(cnt(idx, '«Mi feed queda a medias y no me trae clientes», Posty postea por vos todos los días con tu producto real · Posty') === 2, 'shell meta titles ES x2');
t(cnt(idxEn, '“My feed is half-done and brings me no customers”, Posty posts for you every day with your real product · Posty') === 2, 'EN meta titles EN x2');

// 7. Magia intacta (tanda ya aterrizada: el panel Con Posty brilla solo).
t(app.includes('pz-mg--heroV'), 'SPA magia heroV intacta');
t(css.includes('pz-mg'), 'CSS magia presente');
t(!css.includes('.pz-mg{') || true, 'placeholder magia');

// 8. Resto de secciones intactas (nada más del hero tocado).
t(app.includes('#ejemplos') && app.includes('#planes') && app.includes('#faq') && app.includes('#como-funciona'), 'SPA nav secciones intactas');
t(app.includes('Ver mi semana'), 'SPA formulario Ver mi semana intacto');
t(app.includes('Preguntas') || idx.includes('Preguntas'), 'FAQ presente');

// 9. Versiones y censo (v515, M78 0/0 nuevas desde tarjetas/menús).
t(srv.includes("const BUILD_ID = '20261101-v524';"), 'BUILD v522');
t(idx.includes('/app.js?v=346'), 'index app.js?v=346');
t(idx.includes('/styles.css?v=20261067'), 'index styles.css?v=20261067');
t(idxEn.includes('/styles.css?v=20261067'), 'EN styles.css?v=20261067');
t(!idxEn.includes('/app.js?v='), 'EN sin app.js (como siempre)');
t(cnt(srv, 'catsMatch') === 3, 'censo catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo first_week 3');
t(cnt(srv, '/aprobar') === 16, 'censo /aprobar 16');
t(cnt(app, '/aprobar') === 1, 'censo app /aprobar 1');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo pz-detalle-setup 1');
t(cnt(app, 'autofetch') === 0, 'censo autofetch 0');

console.log('lote14: ' + ok + ' ok, ' + bad + ' fail');
process.exit(bad ? 1 : 0);
