/* LOTE JULI v1274 — LONG OPENING ≠ SPLICE, PARIDAD EN (2026-11-23).
 * Candidato (h) de la corrida 2026-11-22 con caso real: id 710
 * (cuenta 113, PUBLISHED) abre con el menú entero en UNA oración de
 * exactamente 26 palabras — el límite mismo de la puerta ES. La
 * puerta EN no medía largo: una apertura EN de 27+ palabras pasaba
 * la dimensión entera. El checklist EN (ítem 34) ya enseñaba desde
 * v1217 que «the gate rejects it under its own reason (long
 * opening)» — era verdad solo de la puerta ES. Este lote hace que
 * la puerta EN cumpla lo que el checklist promete: mismo freno,
 * mismo motivo propio, espejo por bloque como el loop ES.
 */
'use strict';
const assert = require('assert');
const { captionPasses, captionPassesEn } = require('./generator');
const { captionOpenIsLong } = require('./hooks');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok', name); }
  catch (e) { fail++; console.log('  MAL', name, '—', e.message); }
}

// Id 710 REAL (cuenta 113, published): apertura de exactamente 26
// palabras — en el límite, NO larga. La puerta EN no debe frenarla
// por largo (su único freno conocido es el CTA, preexistente).
const CAP_710 = 'the full table, day two: tagliatelle ai funghi, strozzapreti alla salsiccia, the oak-roasted costoletta, caprese with bufala campana — and the zuppa al cioccolato to close. fresh. simple. traditional. 313 n highland ave ne, atlanta — tonight from 5:30 pm';
t('710 real: captionOpenIsLong = false (26 = en el límite)', () => {
  assert.strictEqual(captionOpenIsLong(CAP_710), false);
});
t('710 real: captionPassesEn NO lo frena por largo', () => {
  const r = captionPassesEn(CAP_710, null, null);
  assert.ok(!/long opening/.test(r.reason || ''), 'motivo inesperado: ' + r.reason);
});

// Variante del 710 con UN plato más en la misma oración (30 palabras
// de apertura) + CTA válido: antes de este lote pasaba la puerta EN
// entera; ahora se frena por largo, con su motivo propio.
const CAP_710_EXT = 'the full table, day two: tagliatelle ai funghi, strozzapreti alla salsiccia, the oak-roasted costoletta, caprese with bufala campana, the tiramisu della casa and the panna cotta to close.\n\nDM us to book your table tonight 📩';
t('710 extendido: captionOpenIsLong = true', () => {
  assert.strictEqual(captionOpenIsLong(CAP_710_EXT), true);
});
t('710 extendido: captionPassesEn lo frena por «long opening» (no por empalme)', () => {
  const r = captionPassesEn(CAP_710_EXT, null, null);
  assert.strictEqual(r.ok, false);
  assert.ok(/long opening/.test(r.reason), 'motivo: ' + r.reason);
  assert.ok(!/spliced/.test(r.reason), 'no debe decir empalme: ' + r.reason);
});

// Borde exacto EN: 26 palabras pasa la dimensión, 27 no.
const words = (n) => Array.from({ length: n }, (_, i) => 'word' + (i + 1)).join(' ');
t('borde: apertura EN de 26 palabras no es larga', () => {
  assert.strictEqual(captionOpenIsLong(words(26) + '.'), false);
});
t('borde: apertura EN de 27 palabras es larga', () => {
  assert.strictEqual(captionOpenIsLong(words(27) + '.'), true);
});

// Largo en el CUERPO (bloque 2), espejo del loop ES: apertura corta,
// segunda oración corrida de un tirón.
const CAP_BODY_LONG = 'The perfect pair ☕\n\nCoffee and pastry together at Hungry Ghost Coffee every single morning of the week with the windows open and the first batch out of the oven before the line even forms at the counter.\n\nOrder yours at the counter or by DM 📩';
t('largo en bloque 2: captionPassesEn lo frena por «long opening in the body»', () => {
  const r = captionPassesEn(CAP_BODY_LONG, null, null);
  assert.strictEqual(r.ok, false);
  assert.ok(/long opening in the body/.test(r.reason), 'motivo: ' + r.reason);
});

// Control sano: id 643 REAL (cuenta 96, published) pasa la puerta EN
// entera antes y después.
const CAP_643 = 'The perfect pair ☕\n\nCoffee and pastry together at Hungry Ghost Coffee, every morning.\n\nOrder yours at the counter or by DM 📩';
t('643 real: captionPassesEn sigue pasando entero', () => {
  const r = captionPassesEn(CAP_643, null, null);
  assert.strictEqual(r.ok, true, 'motivo: ' + r.reason);
});

// El empalme EN sigue siendo empalme (id 656 real, VEJA): el motivo
// de largo no tapa el de costura.
const CAP_656 = '3 keys to choosing your the salar well ✨\n\nOrder yours today by DM 📩';
t('656 real: sigue frenado por empalme, no por largo', () => {
  const r = captionPassesEn(CAP_656, null, null);
  assert.strictEqual(r.ok, false);
  assert.ok(/spliced/.test(r.reason), 'motivo: ' + r.reason);
});

// La puerta ES no cambia: id 741 real sigue «apertura larga».
const CAP_741 = 'así queda un posteo de café cuando lo hace posty: el Classic Espresso de The Coffee Bar, con su foto, su vapor y su caption, todo listo. si tenés un café, esto lo hago por vos todos los días.';
t('741 real: captionPasses lo sigue frenando por «apertura larga»', () => {
  const r = captionPasses(CAP_741, null, null);
  assert.strictEqual(r.ok, false);
  assert.ok(/apertura larga/.test(r.reason), 'motivo: ' + r.reason);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
