'use strict';
/* test-grid-pattern.js — Equilibrio de grilla (v224, pedido de Valentino).
 * El patrón visual de la grilla que el cliente YA tiene se respeta al
 * ubicar y dirigir los posteos nuevos. Este suite prueba el módulo puro
 * grid-pattern.js con fixtures:
 *  (a) cuenta con patrón FUERTE (columna izquierda oscura de producto +
 *      tablero en otra cuenta): la asignación por posición respeta la
 *      columna y el brief del generado para esa columna lleva la consigna
 *      tonal (noteForTarget);
 *  (b) cuenta sin patrón → salida idéntica al comportamiento actual
 *      (orden intacto, sin notas);
 *  (c) cuenta sin historial → no-op elegante.
 *  (d) tiles sin foto en disco (lum null): ocupan posición, no votan.
 *  (e) contrato de deploy: tabla, wiring en el pipeline, BUILD_ID v224.
 * Corre con: node test-grid-pattern.js   (sin red, sin IA paga). */
const assert = require('assert');
const fs = require('fs');

const gp = require('./grid-pattern');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log('  ✓', name); };
const tile = (lum, hueFam, extra) => Object.assign({ lum, hueFam, media_type: 'image', tipo: '', intent: '' }, extra || {});

console.log('== (a1) Patrón fuerte: columna izquierda oscura de producto ==');
// 12 tiles, del más nuevo al más viejo. Columna 0 (pos 0,3,6,9): oscura,
// de producto, familia azul. Columnas 1 y 2: claras de contenido social.
const colA = [];
for (let r = 0; r < 4; r++) {
  colA.push(tile(0.24 + r * 0.01, 'azul', { intent: 'producto' }));
  colA.push(tile(0.74, 'amarillo', { tipo: 'social' }));
  colA.push(tile(0.68, r % 2 ? 'rojo' : 'verde', { tipo: 'social' }));
}
const patA = gp.detectPattern(colA);
ok('detecta patrón (has=true) con 12 tiles', () => {
  assert.strictEqual(patA.has, true);
  assert.strictEqual(patA.tiles, 12);
  assert.strictEqual(patA.usable, 12);
});
ok('columna 0: tono oscuro + tipo producto + familia azul', () => {
  assert.strictEqual(patA.columns[0].tone, 'oscuro');
  assert.strictEqual(patA.columns[0].type, 'producto');
  assert.strictEqual(patA.columns[0].hueFam, 'azul');
});
ok('columna 1: tono claro', () => {
  assert.strictEqual(patA.columns[1].tone, 'claro');
});

console.log('== (a2) Asignación por posición + consigna tonal del brief ==');
// Tanda de 3 (deficit=3, ahead=0 → shift=3): el de producto tiene que ser
// el ÚLTIMO en salir (cae en la posición 0, columna de la izquierda).
const itemsA = [{ intent: 'social' }, { intent: 'producto' }, { intent: 'social' }];
const planA = gp.planBatch(patA, itemsA, 3, 3, (p) => gp.typeKeyOf(p));
ok('el posteo de producto queda último en el orden de salida (posición final 0)', () => {
  const ordered = planA.order.map((ix) => itemsA[ix]);
  assert.strictEqual(ordered[2].intent, 'producto');
  assert.strictEqual(ordered[0].intent, 'social');
});
ok('la posición final de cada posteo calza con la tendencia de su columna', () => {
  // ranura de creación 2 → posición final 0 → columna 0 → tono oscuro.
  assert.strictEqual(planA.targets[2].tone, 'oscuro');
  assert.strictEqual(planA.targets[2].via, 'column');
});
ok('el brief del generado para esa columna incluye la consigna tonal', () => {
  const note = gp.noteForTarget(planA.targets[2]);
  assert.ok(/OSCURA/.test(note), 'la nota pide registro oscuro');
  assert.ok(/azul/.test(note), 'la nota nombra la familia de color de la columna');
  assert.ok(/el tema.*no cambian por esto/i.test(note), 'la nota es subordinada al tema');
});

console.log('== (a3) Tablero claro/oscuro y su fase en el marco final ==');
const hues = ['rojo', 'verde', 'azul', 'amarillo'];
const tab = [];
for (let i = 0; i < 12; i++) tab.push(tile(i % 2 === 0 ? 0.78 : 0.27, hues[i % 4], { tipo: i % 3 === 0 ? 'social' : 'promo' }));
const patT = gp.detectPattern(tab);
ok('detecta el tablero (pares claros, impares oscuros)', () => {
  assert.ok(patT.checker, 'checker presente');
  assert.strictEqual(patT.checker.lightCells, 0);
  assert.ok(patT.checker.gap >= 0.4);
  assert.strictEqual(patT.columns[0].tone, null, 'sin tendencia de columna: el tablero manda');
});
ok('con shift impar la fase se invierte: la posición final 0 pide oscuro', () => {
  assert.strictEqual(gp.toneTargetForFinalPos(patT, 0, 3).tone, 'oscuro');
  assert.strictEqual(gp.toneTargetForFinalPos(patT, 1, 3).tone, 'claro');
});
ok('con shift par la fase se conserva: la posición final 0 pide claro', () => {
  assert.strictEqual(gp.toneTargetForFinalPos(patT, 0, 4).tone, 'claro');
});

console.log('== (b) Sin patrón → comportamiento actual, intacto ==');
const lumsB = [0.50, 0.53, 0.48, 0.52, 0.49, 0.54, 0.51, 0.50, 0.52];
// OJO: rotar intents con período 3 crearía un patrón de columna REAL (cada
// columna quedaría de un solo tipo) — la mezcla va desalineada a propósito.
const intentsB = ['tips', 'social', 'promo', 'social', 'promo', 'tips', 'promo', 'tips', 'social'];
const sinPatron = lumsB.map((l, i) => tile(l, hues[i % 4], { intent: intentsB[i] }));
const patB = gp.detectPattern(sinPatron);
ok('no detecta patrón (todo medio, sin mayorías)', () => {
  assert.strictEqual(patB.has, false);
  assert.strictEqual(patB.checker, null);
});
ok('la tanda sale en el orden original y sin notas', () => {
  const items = [{ intent: 'tips' }, { intent: 'producto' }, { intent: 'social' }];
  const plan = gp.planBatch(patB, items, 3, 3, (p) => gp.typeKeyOf(p));
  assert.deepStrictEqual(plan.order, [0, 1, 2]);
  assert.strictEqual(plan.moved, 0);
  assert.ok(plan.targets.every((t) => t === null));
  assert.strictEqual(gp.noteForTarget(plan.targets[0]), '');
  assert.strictEqual(gp.reportLine(patB, 3), '');
});

console.log('== (c) Sin historial → no-op ==');
ok('0 tiles, 3 tiles y patrón null no rompen nada', () => {
  assert.strictEqual(gp.detectPattern([]).has, false);
  assert.strictEqual(gp.detectPattern([tile(0.2, 'azul'), tile(0.8, 'rojo'), tile(0.2, 'azul')]).has, false);
  const plan = gp.planBatch(null, [{ intent: 'x' }, { intent: 'y' }], 2, 2, (p) => gp.typeKeyOf(p));
  assert.deepStrictEqual(plan.order, [0, 1]);
  assert.strictEqual(gp.toneTargetForFinalPos(null, 0, 0), null);
  assert.strictEqual(gp.reportLine(null, 0), '');
});

console.log('== (d) Tiles sin foto en disco: ocupan posición, no votan ==');
const conHuecos = [];
for (let r = 0; r < 4; r++) {
  conHuecos.push(r === 1 ? tile(null, null, { intent: 'producto' }) : tile(0.25, 'azul', { intent: 'producto' }));
  conHuecos.push(tile(0.55, 'verde', { tipo: 'social' }));
  conHuecos.push(tile(0.52, 'rojo', { tipo: 'social' }));
}
const patD = gp.detectPattern(conHuecos);
ok('la columna 0 se detecta oscura con 3 votos de 4 posiciones', () => {
  assert.strictEqual(patD.tiles, 12);
  assert.strictEqual(patD.usable, 11);
  assert.strictEqual(patD.columns[0].tone, 'oscuro');
});

console.log('== (e) Línea del reporte ==');
ok('reportLine nombra la columna y su tono en el marco final', () => {
  const line = gp.reportLine(patA, 3);
  assert.ok(/izquierda/.test(line) && /oscura/.test(line), 'línea: ' + line);
});
ok('reportLine del tablero habla del ritmo', () => {
  assert.ok(/tablero/.test(gp.reportLine(patT, 3)));
});

console.log('== (f) Contrato de deploy ==');
ok('db.js: tabla grid_pattern_snapshots', () => {
  assert.ok(fs.readFileSync('./db.js', 'utf8').includes('grid_pattern_snapshots'));
});
ok('server.js: motor + wiring en el pipeline + reporte + BUILD_ID v224', () => {
  const srv = fs.readFileSync('./server.js', 'utf8');
  for (const needle of ['gridPatternFor', 'computeGridPattern', 'markGridApplied', 'gridAheadCount', '_gridNote', 'gridNote: idea._gridNote', 'gridNote,', "const BUILD_ID = '20261018-v230'"]) {
    assert.ok(srv.includes(needle), 'falta en server.js: ' + needle);
  }
});
ok('app.js: el reporte muestra la línea de grilla', () => {
  assert.ok(fs.readFileSync('./public/app.js', 'utf8').includes('r.gridNote'));
});
ok('grid-stats.py existe y es determinístico (sin red ni IA)', () => {
  const py = fs.readFileSync('./grid-stats.py', 'utf8');
  assert.ok(py.includes('hueFam') && !/requests|urllib|openai/i.test(py));
});

console.log(`\n${passed} checks OK — test-grid-pattern`);
