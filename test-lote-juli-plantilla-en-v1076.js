'use strict';
/* test-lote-juli-plantilla-en-v1076.js — PLANTILLA-CRUZADA-EN + ESTRELLA-GENÉRICA
 * (Juli, 2026-11-14): el esqueleto "[producto], another favorite/service at
 * [negocio]" corrió idéntico en 6 negocios en 48 h (ids reales 660 VEJA,
 * 663 MEJURI, 666 Jeni's, 669 The Ordinary, 677 Blind Barber) y la estrella
 * genérica "Bar/cafe is one of the most requested things at…" (ids 678
 * Blind Barber, 641 Hungry Ghost) pasaban captionPassesEn enteros.
 * Corre con: node test-lote-juli-plantilla-en-v1076.js (sin red, sin IA). */
const assert = require('assert');
const gen = require('./generator');
const { CAPTION_CHECKLIST_EN } = require('./caption-style');
let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ×', name, '—', e.message); } };

console.log('== (a) Plantilla cruzada: another favorite/service at ==');
ok('id 660 real (VEJA): "The Salar, another favorite at VEJA" se rechaza', () => {
  const cap = 'The Salar, another favorite at VEJA ✨\n\nStop by or order it by DM.\n\nOrder yours today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'VEJA', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/cross-account template/i.test(chk.reason), chk.reason);
});
ok('id 663 real (MEJURI): "another favorite at" se rechaza', () => {
  const cap = 'Piercing Aftercare Saline Solution Spray, another favorite at MEJURI ✨\n\nStop by or order it by DM.\n\nOrder yours today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'MEJURI', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/cross-account template/i.test(chk.reason), chk.reason);
});
ok('id 669 real (The Ordinary): "another service at" se rechaza', () => {
  const cap = 'The Holiday Bundle, another service at The Ordinary ✨\n\nTell us what you need and we\'ll reply with a clear proposal.\n\nMessage us to ask 📩';
  const chk = gen.captionPassesEn(cap, { business: 'The Ordinary', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/cross-account template/i.test(chk.reason), chk.reason);
});
ok('id 677 real (Blind Barber): "another favorite at" se rechaza', () => {
  const cap = 'Eau De Parfum, another favorite at Blind Barber ✨\n\nStop by or order it by DM.\n\nOrder yours today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'Blind Barber', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/cross-account template/i.test(chk.reason), chk.reason);
});
ok('control: "a house favorite at" (sin "another") NO es la plantilla y pasa', () => {
  const cap = 'A house favorite at MEJURI 👀\n\nMade with our usual care, every day.\n\nStop by the store today 📍';
  const chk = gen.captionPassesEn(cap, { business: 'MEJURI', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la reescritura del 660 pasa', () => {
  const cap = 'The Salar, up close ✨\n\nA VEJA classic people come back for, ready when you are.\n\nOrder yours today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'VEJA', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (b) Estrella genérica: categoría por producto ==');
ok('id 678 real (Blind Barber): "Bar is one of the most requested…" se rechaza', () => {
  const cap = 'Bar is one of the most requested things at Blind Barber ✨\n\nThanks for choosing us and recommending us.\n\nTell us: have you tried it yet? 👇';
  const chk = gen.captionPassesEn(cap, { business: 'Blind Barber', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/generic star/i.test(chk.reason), chk.reason);
});
ok('id 641 real (Hungry Ghost): "cafe is one of the most requested…" se rechaza', () => {
  const cap = 'cafe is one of the most requested things at Hungry Ghost Coffee ✨\n\nThanks for choosing us and recommending us.\n\nTell us: have you tried it yet? 👇';
  const chk = gen.captionPassesEn(cap, { business: 'Hungry Ghost Coffee', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/generic star/i.test(chk.reason), chk.reason);
});
ok('control: producto real con la misma fórmula ("our house blend is one of the most requested") pasa', () => {
  const cap = 'Our house blend is one of the most requested things at Hungry Ghost Coffee ✨\n\nThanks for choosing us and recommending us.\n\nTell us: have you tried it yet? 👇';
  const chk = gen.captionPassesEn(cap, { business: 'Hungry Ghost Coffee', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la reescritura del 678 pasa', () => {
  const cap = 'The bar, after the cut ✨\n\nGet the cut, stay for the lounge: that is Blind Barber.\n\nTell us: have you tried it yet? 👇';
  const chk = gen.captionPassesEn(cap, { business: 'Blind Barber', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (c) Checklist EN ítem 26 ==');
ok('CAPTION_CHECKLIST_EN trae la regla 26 (plantilla cruzada / estrella genérica)', () => {
  assert.ok(CAPTION_CHECKLIST_EN.includes('26. NO CROSS-ACCOUNT TEMPLATE, NO GENERIC STAR'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
