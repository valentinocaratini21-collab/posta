'use strict';
/* test-lote-juli-cliche-en-v1153.js — CLICHÉ-EN-ASEGURADOR (Juli,
 * 2026-11-17): los ids reales 704 (Scorpion Studios) y 707 (Big Top
 * Candy Shop) — generaciones del asegurador frenadas por CORTE v1150,
 * ambas CANCELADAS — pasaban captionPassesEn ENTEROS (ok=true
 * reproducido en HEAD v1152): "let's make some magic happen!", "we
 * bring your visions to life", "join our community of happy customers",
 * "Looking for a sweet escape?" — folleto genérico EN sin un solo dato
 * del negocio. El 705 (misma tanda) trae "we'll bring it to life" y ya
 * caía por spanish leak; la firma lo cubre igual. Las cinco frases
 * exactas entran a BANNED_PHRASES_EN; "happy customers" a secas (un
 * testimonio real) y "share this" NO se tocan.
 * Corre con: node test-lote-juli-cliche-en-v1153.js (sin red, sin IA). */
const assert = require('assert');
const gen = require('./generator');
const { CAPTION_CHECKLIST_EN } = require('./caption-style');
let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('  ✓', name); } catch (e) { failed++; console.log('  ×', name, '—', e.message); } };

const CAP_704 = 'How many times have you turned your ideas into art? 🎨 At Scorpion Studios, we bring your visions to life with custom tattoos that tell your story.\n\nBook your appointment today and let’s make some magic happen!\n\n👉 DM to secure your slot and join our community of happy customers!';
const CAP_707 = 'Looking for a sweet escape? 🍭 At Big Top Candy Shop, every bite brings back childhood memories with our classic candy selection. \nSatisfy your cravings with our house-made fudge and giant lollipops — perfect for sharing (or not!). \nStop by the shop or message us to pick your favorites today!';

console.log('== (a) Los reales de la tanda del asegurador ==');
ok('id 704 real (Scorpion Studios, cancelado): se rechaza', () => {
  const chk = gen.captionPassesEn(CAP_704, { business: 'Scorpion Studios', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/stock phrase/i.test(chk.reason), chk.reason);
});
ok('id 707 real (Big Top Candy Shop, cancelado): se rechaza', () => {
  const chk = gen.captionPassesEn(CAP_707, { business: 'Big Top Candy Shop', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/stock phrase/i.test(chk.reason), chk.reason);
});

console.log('== (b) Cada firma sola alcanza ==');
ok('variante con SOLO "magic happen": se rechaza', () => {
  const cap = 'Custom flash Friday 🎨\n\nYour design, drawn this week at the shop on Westheimer.\n\nBook by DM and let’s make magic happen!';
  const chk = gen.captionPassesEn(cap, { business: 'Scorpion Studios', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/magic happen/i.test(chk.reason), chk.reason);
});
ok('variante con SOLO "bring it to life": se rechaza', () => {
  const cap = 'Custom work, drawn by hand 🎨\n\nBring us the sketch and we’ll bring it to life on your skin.\n\nDM to book your consultation today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'Scorpion Studios', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/bring it to life/i.test(chk.reason), chk.reason);
});
ok('variante con SOLO "community of happy customers": se rechaza', () => {
  const cap = 'House-made fudge, cut fresh today 🍬\n\nStop by the shop on South Congress and join our community of happy customers!\n\nMessage us to order yours 📩';
  const chk = gen.captionPassesEn(cap, { business: 'Big Top Candy Shop', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/community of happy customers/i.test(chk.reason), chk.reason);
});
ok('variante con SOLO "sweet escape": se rechaza', () => {
  const cap = 'Looking for a sweet escape? 🍭\n\nHouse-made fudge and giant lollipops, right on South Congress.\n\nStop by the shop today 📍';
  const chk = gen.captionPassesEn(cap, { business: 'Big Top Candy Shop', dna: null });
  assert.strictEqual(chk.ok, false); assert.ok(/sweet escape/i.test(chk.reason), chk.reason);
});

console.log('== (c) Controles: lo legítimo sigue pasando ==');
ok('control: testimonio real con "happy customers" a secas pasa', () => {
  const cap = 'House-made fudge, cut fresh today 🍬\n\nOur happy customers keep coming back for the fudge — one bite and you will know why.\n\nStop by the shop on South Congress today 📍';
  const chk = gen.captionPassesEn(cap, { business: 'Big Top Candy Shop', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la reescritura del 704 pasa', () => {
  const cap = 'Custom work, done right the first time 🎨\n\nAward-winning shop on Westheimer — your design, drawn by hand and tattooed clean.\n\nDM to book your consultation today 📩';
  const chk = gen.captionPassesEn(cap, { business: 'Scorpion Studios', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la reescritura del 707 pasa', () => {
  const cap = 'Your childhood, by the pound 🍬\n\nThe candy you grew up with, plus house-made fudge and a soda fountain, right on South Congress.\n\nStop by the shop today 📍';
  const chk = gen.captionPassesEn(cap, { business: 'Big Top Candy Shop', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (d) Checklist EN ítem 29 ==');
ok('CAPTION_CHECKLIST_EN trae la regla 29 (cliché del asegurador)', () => {
  assert.ok(CAPTION_CHECKLIST_EN.includes('29. NO BROCHURE MAGIC'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
