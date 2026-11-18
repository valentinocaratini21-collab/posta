'use strict';
/* test-lote-juli-hashtags-rubro-v1178.js — HASHTAGS-RUBRO (Juli,
 * 2026-11-18): el campo hashtags vive separado del cuerpo y ninguna
 * puerta lo miraba. El id 700 (Bill Lawrence Salon, peluquería de
 * Washington DC, caption "precision cuts and color") PUBLICÓ el
 * 2026-11-18 con el set de skincare (#beautyroutine #selfcare
 * #skincare #glowingskin) y el id 701 (All Life is Yoga, Atlanta)
 * PUBLICÓ el mismo día con el set de gym (#training #personaltrainer
 * #gymlife #fitness). hashtagsPass es la puerta de ese campo: firmas
 * angostas por familia (>=2 tags) + contexto que habilita (si el
 * negocio, el rubro o el caption hablan de ese mundo, el set es
 * legítimo). La consultan captionPasses/captionPassesEn cuando el
 * llamador pasa input.hashtags y el lint al programar en server.js.
 * Corre con: node test-lote-juli-hashtags-rubro-v1178.js (sin red). */
const assert = require('assert');
const gen = require('./generator');
const { CAPTION_CHECKLIST, CAPTION_CHECKLIST_EN } = require('./caption-style');
let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ×', name, '—', e.message); } };

const TAGS_700 = '#beautyroutine #beauty #selfcare #skincare #glowingskin';
const CAP_700 = 'precision cuts and color, in the heart of adams morgan.\n2120 18th st nw, washington dc';
const TAGS_701 = '#training #healthylifestyle #personaltrainer #gymlife #fitness';
const CAP_701 = 'the great wall changes what a pose can teach you.\nheart-centered, alignment-based yoga in inman park.\n27 waddell st ne, atlanta';

console.log('== (a) Los reales que PUBLICARON con el set cruzado ==');
ok('id 700 real (peluquería con set de skincare): hashtagsPass lo rechaza', () => {
  const chk = gen.hashtagsPass(TAGS_700, { business: 'Bill Lawrence Salon', category: 'belleza', caption: CAP_700 });
  assert.strictEqual(chk.ok, false); assert.ok(/HASHTAGS-RUBRO/.test(chk.reason), chk.reason);
});
ok('id 701 real (yoga con set de gym): hashtagsPass lo rechaza', () => {
  const chk = gen.hashtagsPass(TAGS_701, { business: 'All Life is Yoga', category: 'fitness', caption: CAP_701 });
  assert.strictEqual(chk.ok, false); assert.ok(/HASHTAGS-RUBRO/.test(chk.reason), chk.reason);
});
ok('id 700 vía captionPassesEn con input.hashtags: se rechaza por hashtags', () => {
  const cap = 'Custom work, done right the first time 🎨\n\nAward-winning shop on Westheimer — your design, drawn by hand and tattooed clean.\n\nDM to book your consultation today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'Bill Lawrence Salon', category: 'belleza', dna: null, hashtags: TAGS_700 });
  assert.strictEqual(chk.ok, false); assert.ok(/HASHTAGS-RUBRO/.test(chk.reason), chk.reason);
});
ok('id 701 vía captionPasses (ES) con input.hashtags: se rechaza por hashtags', () => {
  const cap = 'Clase de yoga al amanecer 🧘\n\nRespiración, postura y calma para arrancar el día en el estudio del barrio.\n\nReservá tu lugar por DM y vení a probar tu primera clase.';
  const chk = gen.captionPasses(cap, { business: 'Yoga del Barrio', category: 'fitness', dna: null, hashtags: '#gymlife #personaltrainer #fitness' });
  assert.strictEqual(chk.ok, false); assert.ok(/HASHTAGS-RUBRO/.test(chk.reason), chk.reason);
});

console.log('== (b) Controles: el contexto habilita y lo fino no se toca ==');
ok('control: una estética que habla de la piel usa el set de skincare', () => {
  const chk = gen.hashtagsPass('#skincare #glowingskin #facial', { business: 'Piel Sana Estética', category: 'belleza', caption: 'Tratamiento facial para tu piel: limpieza profunda e hidratación.\n\nReservá tu turno por DM.' });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: un gimnasio usa el set de gym', () => {
  const chk = gen.hashtagsPass(TAGS_701, { business: 'Smart Gym', category: 'fitness', caption: 'Entrenamiento de fuerza y musculación.\n\nEscribinos por DM.' });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: el set propio de yoga pasa', () => {
  const chk = gen.hashtagsPass('#yoga #yogalife #inmanpark', { business: 'All Life is Yoga', category: 'fitness', caption: CAP_701 });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: UN solo tag de la familia no alcanza (firma angosta)', () => {
  const chk = gen.hashtagsPass('#skincare #peluqueria #cortedepelo', { business: 'Bill Lawrence Salon', category: 'belleza', caption: CAP_700 });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: sin hashtags no hay nada que rechazar', () => {
  assert.strictEqual(gen.hashtagsPass('', { business: 'Bill Lawrence Salon' }).ok, true);
  assert.strictEqual(gen.hashtagsPass(undefined, {}).ok, true);
});
ok('control: sin input.hashtags, captionPassesEn no cambia su veredicto', () => {
  const cap = 'Custom work, done right the first time 🎨\n\nAward-winning shop on Westheimer — your design, drawn by hand and tattooed clean.\n\nDM to book your consultation today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'Scorpion Studios', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: el caption ES de yoga sin hashtags cruzados pasa entero', () => {
  const cap = 'Clase de yoga al amanecer 🧘\n\nRespiración, postura y calma para arrancar el día en el estudio del barrio.\n\nReservá tu lugar por DM y vení a probar tu primera clase.';
  const chk = gen.captionPasses(cap, { business: 'Yoga del Barrio', category: 'fitness', dna: null, hashtags: '#yoga #yogalife #barrio' });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (c) Checklist: ítem ES 28 / EN 30 ==');
ok('CAPTION_CHECKLIST trae la regla 28 (hashtags del rubro)', () => {
  assert.ok(CAPTION_CHECKLIST.includes('28. LOS HASHTAGS SON DEL RUBRO DE ESTE NEGOCIO'));
});
ok('CAPTION_CHECKLIST_EN trae la regla 30 (hashtags del rubro)', () => {
  assert.ok(CAPTION_CHECKLIST_EN.includes('30. HASHTAGS BELONG TO THIS BUSINESS'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
