// test-nivel-strip.js — Tira de nivel Posty en Inicio (v456).
// 1) El nivel se computa del MISMO modulo que el tallo del website
//    (niveles.js): nombres, próximo paso y faltantes idénticos en ambos.
// 2) La tira nace entre el perfil y la grilla, sin puntajes, sin rachas,
//    sin lenguaje de fracaso. 3) Celebración única por nivel (el servidor
//    marca en nivel_celebraciones; el test verifica el contrato estático).
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
      return {
        all() {
          return Object.entries(counts).map(([evento, n]) => ({ evento, n }));
        },
      };
    },
  };
}
const C = (uid, counts) => niveles.computarNivel(stubDb(counts), uid, 'posty', {});

console.log('— nivel desde eventos reales (mismo módulo que el website) —');
let n = C(1, {});
t(n.nivel === 1 && n.nombre_nivel === 'Nuevo en tu feed', 'sin eventos: L1 Nuevo en tu feed');
t(n.gate.pendientes.length === 1 && n.gate.pendientes[0].clave === 'fundamento_leido', 'L1: falta fundamento_leido');
t(n.proximo_paso === n.gate.pendientes[0].falta, 'proximo_paso = falta del primer pendiente');
n = C(1, { fundamento_leido: 1 });
t(n.nivel === 2 && n.nombre_nivel === 'Leyendo tu mundo', 'fundamento_leido: L2 Leyendo tu mundo');
t(n.gate.pendientes.length === 2, 'L2: faltan 2 cosas para L3');
n = C(1, { fundamento_leido: 1, semana_generada: 1, decision_bandeja: 1 });
t(n.nivel === 3 && n.nombre_nivel === 'De la casa', 'semana + decisión: L3 De la casa');
n = C(1, { fundamento_leido: 1, semana_generada: 1, decision_bandeja: 1, semana_aceptada: 1, pieza_aceptada_primera: 3 });
t(n.nivel === 4 && n.nombre_nivel === 'Mano derecha de tu Instagram', 'semana aceptada + 3 piezas: L4 Mano derecha');
n = C(1, { fundamento_leido: 1, semana_generada: 1, decision_bandeja: 1, semana_aceptada: 1, pieza_aceptada_primera: 3, semana_publicada: 4, pregunta_respondida: 2 });
t(n.nivel === 5 && n.nombre_nivel === 'Tu socio de contenido', 'constancia + respuestas: L5 Tu socio de contenido');
t(n.proximo_paso === null && n.gate.pendientes.length === 0, 'L5: sin próximo paso, sin pendientes');
t(n.color === '#2793C8', 'el tallo es celeste Posty #2793C8');

console.log('— cableado en el bundle servido —');
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const iStories = app.indexOf('${storiesHTML}');
const iStrip = app.indexOf('${nivelStripHTML}');
const iGrid = app.indexOf('${gridHTML}');
t(iStories > 0 && iStrip > iStories && iGrid > iStrip, 'la tira nace entre storiesHTML y gridHTML');
for (const f of ['pzNivelStripHTML', 'pzNivelMount', 'pzNivelCelebShow', 'pzNivelStoryShow', 'pzNivelChip', 'pzNivelUnlock', 'pzNivelStemHTML']) {
  t(new RegExp('function ' + f + '\\(').test(app), 'definida ' + f);
}
for (const clave of ['fundamento_leido', 'semana_generada', 'decision_bandeja', 'semana_aceptada', 'pieza_aceptada_primera', 'semana_publicada', 'pregunta_respondida']) {
  t(app.includes(clave), 'chip para ' + clave);
}
t(app.includes("location.hash = '#/app/negocio'"), 'un toque en la tira abre Mi negocio');
t(app.includes('/api/oficina/nivel?poder=posty') && app.includes('/api/oficina/nivel/celebrar'), 'tira y celebración usan el endpoint compartido');
t(srv.includes("app.get('/api/oficina/nivel'") && srv.includes("app.post('/api/oficina/nivel/celebrar'"), 'rutas del endpoint en server.js');
t(srv.includes('nivel_celebraciones'), 'marca durable de celebración única por nivel');
t(css.includes('.pz-nivel') && css.includes('.pz-celeb') && css.includes('.pz-story'), 'estilos de tira, celebración e historia');
t(/prefers-reduced-motion: reduce\)\{\.pz-nudo\.cur/.test(css), 'reduced-motion: celebración estática');
const blockRaw = app.slice(app.indexOf('TIRA DE NIVEL POSTY'), app.indexOf('function mzOpenSheet'));
const block = blockRaw.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
t(!/puntos|racha|fracaso|perdiste/i.test(block), 'la tira no tiene puntajes, rachas ni lenguaje de fracaso');
t(/te falta 1 cosa para ser|te faltan/.test(block), 'formato «te faltan N cosas para ser X»');

console.log(`\ntest-nivel-strip: ${ok} ok / ${fail} fallas`);
process.exit(fail ? 1 : 0);
