'use strict';
/* test-lote-juli-cromo-tip-v1108.js — CROMO-WEB + TIP-ESQUELETO (Juli,
 * 2026-11-15): el cuerpo copia el cromo del sitio (662 MEJURI publicado:
 * "Shop All Jewelry – …" como cuerpo; 668 The Ordinary publicado:
 * "…is your destination for…" = meta-descripción) y la fórmula del tip
 * anuncia llaves y entrega virtudes ("Quality, detail and the [negocio]
 * standard: that's how we do X" en 661 VEJA / 664 MEJURI / 667 Jeni's /
 * 672 Tartine, este último publicado hoy). Los tres pasaban
 * captionPassesEn enteros en HEAD v1107.
 * Corre con: node test-lote-juli-cromo-tip-v1108.js (sin red, sin IA). */
const assert = require('assert');
const gen = require('./generator');
const { CAPTION_CHECKLIST_EN } = require('./caption-style');
let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ×', name, '—', e.message); } };

console.log('== (a) Cromo web: rótulo de navegación como cuerpo ==');
ok('id 662 real (MEJURI, publicado): "Shop All Jewelry – …" se rechaza', () => {
  const cap = 'Tube Huggie Hoops ✨\n\nShop All Jewelry – Solid Gold, Silver, Diamonds & More.\n\nOrder yours today by DM 📩';
  const chk = gen.captionPassesEn(cap, { business: 'MEJURI', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/web chrome/i.test(chk.reason), chk.reason);
});
ok('id 668 real (The Ordinary, publicado): "is your destination for…" se rechaza', () => {
  const cap = 'retinol route ✨\n\nThe Ordinary is your destination for Skincare, Makeup, Hair, and Body solutions.\n\nDM us and we\'ll walk you through how to start 📩';
  const chk = gen.captionPassesEn(cap, { business: 'The Ordinary', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/web chrome/i.test(chk.reason), chk.reason);
});
ok('control: "shop" dentro de una oración (no rótulo al arranque) pasa', () => {
  const cap = 'Tube Huggie Hoops ✨\n\nCome shop the new hoops in store today: solid gold, made to wear every day.\n\nOrder yours today by DM 📩';
  const chk = gen.captionPassesEn(cap, { business: 'MEJURI', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la reescritura del 662 pasa', () => {
  const cap = 'Tube Huggie Hoops ✨\n\nSolid gold hoops made to wear every day.\n\nOrder yours today by DM 📩';
  const chk = gen.captionPassesEn(cap, { business: 'MEJURI', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la reescritura del 668 pasa', () => {
  const cap = 'Retinol, step by step ✨\n\nStart low, twice a week, and let your skin build tolerance.\n\nDM us and we\'ll walk you through how to start 📩';
  const chk = gen.captionPassesEn(cap, { business: 'The Ordinary', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (b) Tip-esqueleto: llaves anunciadas, virtudes entregadas ==');
for (const [id, biz, topic] of [
  [661, 'VEJA', 'salar'],
  [664, 'MEJURI', 'tube medium hoops'],
  [667, "Jeni's Splendid Ice Creams", 'pint club subscription'],
  [672, 'Tartine Bakery', 'special order cakes'],
]) {
  ok(`id ${id} real (${biz}): el esqueleto "Quality, detail and the … standard" se rechaza`, () => {
    const cap = `3 keys to choosing your ${topic} well 👇\n\nQuality, detail and the ${biz} standard: that's how we do ${topic}.\n\nSave this post for when you need it 🔖`;
    const chk = gen.captionPassesEn(cap, { business: biz, dna: null });
    assert.strictEqual(chk.ok, false); assert.ok(/empty tip skeleton/i.test(chk.reason), chk.reason);
  });
}
ok('control: tip con llaves concretas del producto pasa', () => {
  const cap = '3 keys to choosing your Salar well 👇\n\nFit first, then the sole, then how it ages: that\'s how we pick at VEJA.\n\nSave this post for when you need it 🔖';
  const chk = gen.captionPassesEn(cap, { business: 'VEJA', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: mencionar "quality" sin el esqueleto pasa', () => {
  const cap = 'The Salar, up close ✨\n\nQuality you can feel from the first wear, ready when you are.\n\nOrder yours today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'VEJA', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (c) Checklist EN ítem 27 ==');
ok('CAPTION_CHECKLIST_EN trae la regla 27 (cromo web / tip-esqueleto)', () => {
  assert.ok(CAPTION_CHECKLIST_EN.includes('27. NO WEB CHROME, NO EMPTY TIP SKELETON'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
