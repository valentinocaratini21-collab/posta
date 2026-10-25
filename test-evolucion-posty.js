// test-evolucion-posty.js — «La evolución de Posty» en Inicio (v459).
// 1) Posty visible en la tira y CRECE con los niveles: misma ai-avatar.png
//    canónica (cara congelada), solo escala CSS + decor local fuera de la
//    cara — nada regenerado ni redibujado. 2) Próxima forma en fantasma
//    (L5: identidad fechada real). 3) Tocar a Posty reacciona sin navegar.
//    4) La subida anima la evolución antes del modal (reduced-motion: directo
//    y estático). 5) Sin puntajes, porcentajes ni lenguaje de fracaso.
'use strict';
const fs = require('fs');
const path = require('path');
const niveles = require('./niveles');

let ok = 0, fail = 0;
function t(cond, msg) {
  if (cond) { ok++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function stubDb(counts) {
  return {
    prepare() {
      return { all() { return Object.entries(counts).map(([evento, n]) => ({ evento, n })); } };
    },
  };
}
const C = (uid, counts) => niveles.computarNivel(stubDb(counts), uid, 'posty', {});
const FULL = { fundamento_leido: 1, semana_generada: 1, decision_bandeja: 1, semana_aceptada: 1, pieza_aceptada_primera: 3, semana_publicada: 4, pregunta_respondida: 2 };

console.log('— niveles del mismo módulo que el website —');
t(C(1, {}).nombre_nivel === 'Nuevo en tu feed', 'L1 Nuevo en tu feed');
t(C(1, { fundamento_leido: 1 }).nombre_nivel === 'Leyendo tu mundo', 'L2 Leyendo tu mundo');
t(C(1, { fundamento_leido: 1, semana_generada: 1, decision_bandeja: 1 }).nombre_nivel === 'De la casa', 'L3 De la casa');
t(C(1, { fundamento_leido: 1, semana_generada: 1, decision_bandeja: 1, semana_aceptada: 1, pieza_aceptada_primera: 3 }).nombre_nivel === 'Mano derecha de tu Instagram', 'L4 Mano derecha');
t(C(1, FULL).nombre_nivel === 'Tu socio de contenido', 'L5 Tu socio de contenido');

console.log('— cableado en el bundle —');
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
for (const f of ['pzEvoDecor', 'pzEvoFigure', 'pzEvoGhost', 'pzEvoMes', 'pzEvoLine', 'pzEvoReact']) {
  t(new RegExp('function ' + f + '\\(').test(app), 'definida ' + f);
  t((app.match(new RegExp(f, 'g')) || []).length >= 2, 'llamada ' + f);
}
const figBody = app.slice(app.indexOf('function pzEvoFigure'), app.indexOf('function pzEvoMes'));
t(figBody.includes('ai-avatar.png'), 'la figura usa ai-avatar.png canónica');
t((figBody.match(/src="/g) || []).length === 1, 'la figura tiene UNA sola imagen (sin variantes regeneradas)');
const decorBody = app.slice(app.indexOf('function pzEvoDecor'), app.indexOf('function pzEvoFigure'));
t(decorBody.includes('pz-evo-brote') && decorBody.includes('nivel <= 1'), 'L1: brotecito');
t(decorBody.includes('pz-evo-brillo') && decorBody.includes('nivel === 2'), 'L2: brillo en la antena');
t(decorBody.includes('pz-evo-anillo') && decorBody.includes('nivel === 3'), 'L3: anillo/medallón visible');
t(decorBody.includes('pz-evo-kit') && decorBody.includes('nivel === 4'), 'L4: kit de diseñador (tarjetas + lápiz)');
t(decorBody.includes('pz-evo-aura-oro'), 'L5: aura dorada');
const ghostBody = app.slice(app.indexOf('function pzEvoGhost'), app.indexOf('function pzEvoLine'));
t(ghostBody.includes('así crece Posty') && ghostBody.includes('how Posty grows'), 'fantasma: próxima forma L1–L4');
t(ghostBody.includes('Evolución máxima') && ghostBody.includes('Socio desde'), 'L5: identidad fechada, sin fantasma');
t(ghostBody.includes('pzEvoMes(nv.socio_desde_ts'), 'L5: la fecha viene de socio_desde_ts del endpoint');
for (const [es, en] of [
  ['recién empiezo a conocerte', "just getting to know you"],
  ['leyendo tu mundo', 'reading your world'],
  ['ya soy de la casa', 'one of the house'],
  ['soy tu mano derecha', 'your right hand'],
  ['somos socios', "we're partners"],
]) t(app.includes(es) && app.includes(en), 'línea de reacción ES+EN: ' + es);
const stripBody = app.slice(app.indexOf('function pzNivelStripHTML'), app.indexOf('function pzNivelCelebShow'));
t(stripBody.includes('pzEvoFigure(nv.nivel') && stripBody.includes('pzEvoGhost(nv, en'), 'la tira muestra Posty actual + fantasma');
t(stripBody.includes('LA EVOLUCIÓN DE POSTY') && stripBody.includes("POSTY'S EVOLUTION"), 'rótulo LA EVOLUCIÓN DE POSTY ES+EN');
t(stripBody.includes('data-pz-evo'), 'la figura es tocable (data-pz-evo)');
t(stripBody.includes('pzNivelStemHTML(nv.nivel'), 'el tallo sigue en la tira');
t(stripBody.includes("location.hash = '#/app/negocio'") || app.includes("location.hash = '#/app/negocio'"), 'la tira sigue abriendo Mi negocio');
const iStories = app.indexOf('${storiesHTML}');
const iStrip = app.indexOf('${nivelStripHTML}');
const iGrid = app.indexOf('${gridHTML}');
t(iStories > 0 && iStrip > iStories && iGrid > iStrip, 'la tira sigue entre storiesHTML y gridHTML');
const celebBody = app.slice(app.indexOf('function pzNivelCelebShow'), app.indexOf('function pzNivelStoryShow'));
t(celebBody.includes('pzEvoFigure(nv.nivel') && celebBody.includes('pz-celeb-evo'), 'la celebración muestra la forma evolucionada');
const mountBody = app.slice(app.indexOf('function pzNivelMount'), app.indexOf('function mzOpenSheet'));
t(mountBody.includes('pzEvoReact') && mountBody.includes("closest('[data-pz-evo]')"), 'tocar a Posty reacciona y no navega');
t(mountBody.includes('pz-evo-crece') && mountBody.includes('900') && mountBody.includes('prefers-reduced-motion'), 'la subida crece 900 ms antes del modal; reduced-motion directo');
t(css.includes('.pz-nivel{position:relative;min-height:88px}'), 'tira con altura reservada 88 px (sin CLS)');
for (const [cls, sc] of [['evo-L1', '.62'], ['evo-L2', '.74'], ['evo-L3', '.86'], ['evo-L4', '.97'], ['evo-L5', '1.08']]) {
  t(css.includes(`.pz-evo.${cls}{--evo-s:${sc}}`), `escala ${cls} = ${sc} (crece sin tocar layout)`);
}
t(css.includes('@keyframes pzRebote') && css.includes('@keyframes pzCrece'), 'animaciones rebote + crecimiento');
t(css.includes('.pz-evo-rebota,.pz-evo-crece,.pz-celeb-evo .pz-evo{animation:none}'), 'reduced-motion: evolución estática y completa');
t(srv.includes("const BUILD_ID = '20261025-v459'"), 'BUILD v459');
t(srv.includes('socio_desde_ts') && srv.includes("tipo = 'subida_nivel'") && srv.includes('oficina_registros'), 'socio_desde_ts real desde el río (nunca inventado)');
t(idx.includes('app.js?v=290'), 'index apunta a app.js?v=290');
const blockRaw = app.slice(app.indexOf('EVOLUCIÓN DE POSTY'), app.indexOf('function mzOpenSheet'));
const block = blockRaw.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
t(!/puntos|porcentaje|racha|perdiste/i.test(block), 'sin puntajes, porcentajes, rachas ni lenguaje de fracaso');

console.log(`\ntest-evolucion-posty: ${ok} ok / ${fail} fallas`);
process.exit(fail ? 1 : 0);
