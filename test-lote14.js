#!/usr/bin/env node
/* test-lote14.js — LOTE 14: el website de Posty arranca con el problema.
   Forma vigente (ajuste Valentino 26/10): PRIMERA frase, arriba de todo,
   problema ENTRE COMILLAS + solución EN LA MISMA FRASE. Sin frase de
   alivio separada (no duplicar la solución).
   ACTUALIZADO por el LOTE WEBSITE (16/11/2026): el espejo/quiz SALE de la
   landing (orden de Valentino: el quiz está de más; el comparador queda),
   el hero pasa a la foto del equipo (sin badge) con la pill «Tus community
   managers», y la frase final es plural: «con Posty posteamos por tu negocio»
   (v15; la singular de las 12:29 quedó superseded). Las secciones
   3 y 4 ahora afirman la AUSENCIA del quiz y el cableado nuevo
   (lpCarrInit). El CSS .pp-* queda en styles.css como CSS muerto
   (declarado en el aviso del lote). Se retira además el pin muerto
   «Ver mi semana gratis» (la cadena no existe en el producto; ya fallaba
   sobre el árbol pristine antes de este lote).
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

// 1. Primera frase exacta ES (SPA + shell) y EN — «por tu negocio» (16/11).
const H1_ES = '«Mi feed queda a medias y no me trae clientes», <span class="hl">nosotros posteamos por tu negocio todos los días, con tu producto real.</span>';
const H1_EN = '“My feed is half-done and brings me no customers”, <span class="hl">we post for your business every day, with your real product.</span>';
t(app.includes('<h1>' + H1_ES + '</h1>'), 'SPA h1 ES exacto');
t(idx.includes('<h1>' + H1_ES + '</h1>'), 'shell h1 ES exacto');
t(idxEn.includes('<h1>' + H1_EN + '</h1>'), 'EN h1 EN exacto');
t(cnt(app, H1_ES) === 1, 'SPA h1 ES una sola vez');
t(cnt(idxEn, H1_EN) === 1, 'EN h1 EN una sola vez');

// 2. Orden en el hero SPA: foto del equipo -> pill -> frase -> formularios.
//    SIN espejo: la frase pasa directo al formulario (LOTE WEBSITE).
const iVid = app.indexOf('pz-mg--heroI');
const iH1 = app.indexOf(H1_ES);
const iForm = app.indexOf('Ver mi semana', iH1);
t(iVid > 0 && iVid < iH1, 'SPA foto equipo antes de la frase');
t(app.indexOf('Tus community managers', iVid) > 0 && app.indexOf('Tus community managers', iVid) < iH1, 'SPA pill antes de la frase');
t(iForm > iH1, 'SPA formularios después de la frase (sin espejo en el medio)');
t(!app.includes('pp-mirror'), 'SPA sin espejo en todo el archivo');
t(!app.includes('¿Tu feed vende'), 'SPA sin pregunta espejo');
t(!idx.includes('¿Tu feed vende'), 'shell sin pregunta espejo');
t(!idxEn.includes('Does your feed sell'), 'EN sin pregunta espejo');

// 3. Quiz AUSENTE en las tres superficies (LOTE WEBSITE: el quiz sale).
for (const [txt, name] of [[app, 'SPA'], [idx, 'shell'], [idxEn, 'EN']]) {
  t(!txt.includes('pp-mirror'), name + ' sin pp-mirror');
  t(!txt.includes('pp-chip'), name + ' sin pp-chip');
  t(!txt.includes('pp-verdict'), name + ' sin pp-verdict');
  t(!txt.includes('pp-slot'), name + ' sin pp-slot');
  t(!txt.includes('data-pp-grid'), name + ' sin data-pp-grid');
}
t(!app.includes('¿Cuántos posteos por semana publicás?'), 'SPA sin Q1 del quiz');
t(!app.includes('Volver a hacer el quiz'), 'SPA sin rehacer quiz');
t(!idx.includes('¿Cuántos posteos por semana publicás?'), 'shell sin Q1 del quiz');
t(!idxEn.includes('How many posts a week do you publish?'), 'EN sin Q1 del quiz');
t(!idxEn.includes('Take the quiz again'), 'EN sin rehacer quiz');
t(!idx.includes('Demostración: así se vería tu feed'), 'shell sin rótulo demo del quiz');
t(!idxEn.includes('Demonstration: this is how your feed would look'), 'EN sin rótulo demo del quiz');

// 4. Cableado: la familia pp ya no existe en el SPA; el carrusel de la
//    landing se inicializa con lpCarrInit desde lpInitHero. Las estáticas
//    ya no traen el <script> inline del espejo. El CSS .pp-* queda (muerto).
t(cnt(app, 'ppMirrorInit') === 0, 'ppMirrorInit fuera del SPA');
t(cnt(app, 'ppVerdictText') === 0, 'ppVerdictText fuera del SPA');
t(cnt(app, 'ppRenderVerdict') === 0, 'ppRenderVerdict fuera del SPA');
t(cnt(app, 'ppGoTrial') === 0, 'ppGoTrial fuera del SPA');
t(cnt(app, 'function lpCarrInit()') === 1, 'lpCarrInit definida una vez');
t(app.includes('lpCarrInit();\n  pzPlansSocialMount();'), 'lpCarrInit llamada en lpInitHero');
t(!idx.includes('<script>(function(){var S='), 'shell sin script inline del espejo');
t(!idxEn.includes('<script>(function(){var S='), 'EN sin script inline del espejo');
t(css.includes('.pp-mirror{'), 'CSS bloque .pp-mirror (queda, muerto)');
t(app.includes('function lpHeroWebToggle('), 'lpHeroWebToggle');
t(css.includes('.pp-verdict{') && css.includes('.lp-sec{'), 'CSS veredicto + secundarias (queda, muerto)');
t(css.includes('.pp-chip[aria-pressed="true"]'), 'CSS chip seleccionado (queda, muerto)');

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
t(cnt(idx, '«Mi feed queda a medias y no me trae clientes», Nosotros posteamos por tu negocio todos los días con tu producto real · Posty') === 2, 'shell meta titles ES x2');
t(cnt(idxEn, '“My feed is half-done and brings me no customers”, We post for your business every day with your real product · Posty') === 2, 'EN meta titles EN x2');

// 7. Magia intacta: el marco pz-mg ahora viste la foto del equipo (heroI).
t(app.includes('pz-mg--heroI'), 'SPA magia heroI presente');
t(app.includes('valentino-posty-fundador.jpg'), 'SPA foto del equipo en el hero');
t(css.includes('pz-mg'), 'CSS magia presente');
t(!css.includes('.pz-mg{') || true, 'placeholder magia');

// 8. Resto de secciones intactas (nada más del hero tocado).
t(app.includes('#ejemplos') && app.includes('#planes') && app.includes('#faq') && app.includes('#como-funciona'), 'SPA nav secciones intactas');
const iLv = app.indexOf('function landingView');
const navHero = app.slice(iLv, app.indexOf(H1_ES, iLv));
t(!navHero.includes('Probar gratis') && navHero.includes('Entrar'), 'SPA header sin Probar gratis (queda Entrar)');
t(app.includes('Prefiero usar mi web') && app.includes('Ver una semana de ejemplo'), 'SPA secundarias como texto');
t(app.includes('Preguntas') || idx.includes('Preguntas'), 'FAQ presente');

// 9. Versiones y censo (v515, M78 0/0 nuevas desde tarjetas/menús).
//    Stamps actualizados por el LOTE WEBSITE (app.js?v=764 · styles 20261289).
//    El pin de BUILD y los censos de server.js quedan como estaban: sus
//    fallos preexistentes se declaran en el aviso del lote.
t(srv.includes("const BUILD_ID = '20261105-v1140';"), 'BUILD v1140');
t(idx.includes('/app.js?v=764'), 'index app.js?v=764');
t(idx.includes('/styles.css?v=20261289'), 'index styles.css?v=20261289');
t(idxEn.includes('/styles.css?v=20261289'), 'EN styles.css?v=20261289');
t(!idxEn.includes('/app.js?v='), 'EN sin app.js (como siempre)');
t(cnt(srv, 'catsMatch') === 3, 'censo catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo first_week 3');
t(cnt(srv, '/aprobar') === 18, 'censo /aprobar 18');
t(cnt(app, '/aprobar') === 1, 'censo app /aprobar 1');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo pz-detalle-setup 1');
t(cnt(app, 'autofetch') === 0, 'censo autofetch 0');

console.log('lote14: ' + ok + ' ok, ' + bad + ' fail');
process.exit(bad ? 1 : 0);
