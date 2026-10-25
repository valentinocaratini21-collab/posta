// test-evolucion-posty.js — TIRA SIMPLE DE NIVEL (v461).
// NOTA: este archivo se llamaba «evolución» en v459. La redirección de
// Valentino (2026-10-25) ELIMINÓ la evolución: la tira ahora tiene solo
// 3 elementos (avatar canónico chico + nivel + barrita fina). El nombre
// del archivo se conserva porque el push por API no puede expresar
// borrados; el contenido es el vigente. 1) El avatar es el mismo
// ai-avatar.png canónico, 52 px inline (cara congelada, sin decor, sin
// fantasma, sin segunda figura). 2) La barrita (7 px) se llena desde
// avance.hechos/total del endpoint, sin mostrar ningún número ni %.
// 3) El paso es corto («te falta 1 cosa») y de un toque. 4) Sin puntajes,
// porcentajes en texto ni lenguaje de fracaso. 5) El resto (celebración
// única por nivel, endpoint compartido) sigue intacto.
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
t(C(1, FULL).nombre_nivel === 'Tu socio de contenido', 'L5 Tu socio de contenido');
t(C(1, FULL).gate.pendientes.length === 0, 'L5: sin pendientes (barrita llena)');

console.log('— avance del gate: inputs del endpoint —');
const g2 = C(1, { fundamento_leido: 1, semana_generada: 1 });
const h3 = g2.hitos.filter((h) => h.nivel_objetivo === 3);
t(h3.length === 2 && h3.filter((h) => h.cumplido).length === 1, 'L2: gate a L3 1/2 -> barrita a la mitad');
const g1 = C(1, {});
const h2 = g1.hitos.filter((h) => h.nivel_objetivo === 2);
t(h2.length === 1 && h2.filter((h) => h.cumplido).length === 0, 'L1: gate a L2 0/1 -> barrita vacía');

console.log('— tira simple en el bundle —');
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
t(/function pzNivelAvance\(/.test(app), 'definida pzNivelAvance');
const stripFn = app.slice(app.indexOf('function pzNivelStripHTML'), app.indexOf('function pzNivelCelebShow'));
t(stripFn.length > 0, 'existe pzNivelStripHTML');
t(!/pzEvo|pz-evo|fantasma/.test(stripFn), 'cero evolución en la tira: sin fantasma, sin decor, sin figuras dobles');
t((stripFn.match(/ai-avatar\.png/g) || []).length === 1, 'un solo avatar en la tira');
t(/width:52px;height:52px/.test(stripFn), 'avatar chico 52 px con tamaño inline');
t(/height:7px/.test(stripFn), 'barrita fina 7 px');
t(/data-pz-fill/.test(stripFn), 'la barrita se llena desde avance');
t(!/svg|scale\(/.test(stripFn), 'sin SVG ni escalas en la tira');
t(/te falta 1 cosa/.test(stripFn) && /te faltan/.test(stripFn), 'paso corto «te falta 1 cosa»');
t(!/para ser/.test(stripFn), 'sin "para ser X" en la tira');
t(!/%/.test(stripFn.replace(/style="[^"]*"/g, '')), 'ningún % fuera de los estilos');
t(!/puntos|racha|fracaso|perdiste/i.test(stripFn), 'sin puntajes, rachas ni lenguaje de fracaso');
t(srv.includes('avance'), 'el endpoint expone avance');
t(/function pzNivelCelebShow\(/.test(app) && /function pzNivelStoryShow\(/.test(app), 'celebración y compartir-historia intactos');
t(/prefers-reduced-motion/.test(app), 'reduced-motion contemplado en el mount');

console.log(`\ntest-evolucion-posty (tira simple v461): ${ok} ok / ${fail} fallas`);
process.exit(fail ? 1 : 0);
