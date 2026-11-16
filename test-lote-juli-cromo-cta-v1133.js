'use strict';
/* test-lote-juli-cromo-cta-v1133.js — CROMO-CTA + CLICHÉ VACÍO (Juli,
 * 2026-11-16): el id 687 real (Jeni's Splendid Ice Creams, draft con
 * fecha 17/11) pasaba captionPassesEn entero (ok=true en HEAD v1131)
 * sin nombrar un solo producto: "How about a sweet moment for the
 * holidays? / Order online … and share the love with friends and
 * family. / Visit our website to explore all flavors and get your
 * favorites today!" — dos firmas: (a) el bloque que ARRANCA con
 * "Visit our website" (el CTA de folleto del sitio, familia del cromo
 * de v1108) y (b) el cliché "share the love" (frase quemada EN).
 * Corre con: node test-lote-juli-cromo-cta-v1133.js (sin red, sin IA). */
const assert = require('assert');
const gen = require('./generator');
const { CAPTION_CHECKLIST_EN } = require('./caption-style');
let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ×', name, '—', e.message); } };

const CAP_687 = 'How about a sweet moment for the holidays?\n\nOrder online for local delivery or nationwide shipping and share the love with friends and family.\n\nVisit our website to explore all flavors and get your favorites today!';

console.log('== (a) Cromo-CTA: el bloque que arranca con "Visit our website" ==');
ok('id 687 real (Jeni\'s, draft 17/11): el caption entero se rechaza', () => {
  const chk = gen.captionPassesEn(CAP_687, { business: "Jeni's Splendid Ice Creams", dna: null });
  assert.strictEqual(chk.ok, false);
});
ok('variante con SOLO el cromo-CTA (sin "share the love"): se rechaza por web chrome', () => {
  const cap = 'Brown Butter Bourbon is back ✨\n\nSmall-batch and scooped fresh every morning.\n\nVisit our website to explore all flavors and get your favorites today!';
  const chk = gen.captionPassesEn(cap, { business: "Jeni's Splendid Ice Creams", dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/web chrome/i.test(chk.reason), chk.reason);
});
ok('control: mencionar la web en el medio de una oración pasa', () => {
  const cap = 'The Holiday Pint Pack ✨\n\nFour pints ready for pickup — the full menu lives on our website, and you can order yours by DM.\n\nOrder yours today 📩';
  const chk = gen.captionPassesEn(cap, { business: "Jeni's Splendid Ice Creams", dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: "visit us" (el local, no la web) pasa', () => {
  const cap = 'Brown Butter Bourbon is back ✨\n\nSmall-batch and scooped fresh every morning.\n\nVisit us at the shop and try it today 📍';
  const chk = gen.captionPassesEn(cap, { business: "Jeni's Splendid Ice Creams", dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (b) Cliché vacío: "share the love" ==');
ok('variante con SOLO "share the love" (sin cromo-CTA): se rechaza por frase quemada', () => {
  const cap = 'A sweet moment for the holidays ✨\n\nOrder online for local delivery and share the love with friends and family.\n\nOrder yours today 📩';
  const chk = gen.captionPassesEn(cap, { business: "Jeni's Splendid Ice Creams", dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/stock phrase/i.test(chk.reason), chk.reason);
});
ok('control: "share this" (CTA concreto de compartir el posteo) pasa', () => {
  const cap = 'Brown Butter Bourbon is back ✨\n\nSmall-batch and scooped fresh every morning.\n\nShare this with the friend who always orders the second scoop 📩';
  const chk = gen.captionPassesEn(cap, { business: "Jeni's Splendid Ice Creams", dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la reescritura del 687 pasa', () => {
  const cap = 'Brown Butter Bourbon, back for the holidays ✨\n\nSmall-batch, scooped fresh every morning at the shop.\n\nOrder yours by DM for pickup today 📩';
  const chk = gen.captionPassesEn(cap, { business: "Jeni's Splendid Ice Creams", dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (c) Checklist EN ítem 28 ==');
ok('CAPTION_CHECKLIST_EN trae la regla 28 (cromo-CTA / share the love)', () => {
  assert.ok(CAPTION_CHECKLIST_EN.includes('28. NO BROCHURE CTA, NO EMPTY CLICHÉ'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
