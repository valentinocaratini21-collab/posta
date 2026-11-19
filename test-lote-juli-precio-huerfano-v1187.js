// Suite JULI-PRECIO-HUERFANO v1187 — el precio mutilado no pasa.
// Caso real: id 712 (Big Top Candy Shop, cuenta 123), programado
// 2026-11-19 00:00Z con "hand-jerked sodas .77 ... sundaes .77, the
// banana split 0.77" — la transcripción perdió signo y parte entera.
// Se publicó reescrito a mano SIN precios; esta puerta frena la clase.
const assert = require('assert');
const gen = require('./generator');
const cs = require('./caption-style');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}

const CAP712 = 'day two at the big top: the soda fountain. hand-jerked sodas .77 with nearly 50 syrup flavors, real blue bell shakes & malts .77, sundaes .77, the banana split 0.77 — plus taffy town cherry salt water taffy by the pound. 1706 s congress ave, austin — open today til 7';
const CAP712_PUBLISHED = 'day two at the big top: the soda fountain. hand-jerked sodas with nearly 50 syrup flavors, real blue bell shakes & malts, sundaes, the banana split — plus taffy town cherry salt water taffy by the pound. 1706 s congress ave, austin — open today til 7';

t('helper: ".77" suelto es huérfano', () => {
  assert.strictEqual(gen.orphanPriceToken('hand-jerked sodas .77 with syrup'), '.77');
});
t('helper: "0.77" sin signo es huérfano', () => {
  assert.strictEqual(gen.orphanPriceToken('the banana split 0.77 today'), '0.77');
});
t('helper: ",77" / "0,77" sin signo son huérfanos', () => {
  assert.strictEqual(gen.orphanPriceToken('cuesta ,77 el vaso'), ',77');
  assert.strictEqual(gen.orphanPriceToken('sale 0,77 la unidad'), '0,77');
});
t('helper: "$0.99" (id 617 real) NO es huérfano', () => {
  assert.strictEqual(gen.orphanPriceToken('Yours for $0.99, just like always'), null);
});
t('helper: "$4.77" y "$6.700" (miles ES) NO son huérfanos', () => {
  assert.strictEqual(gen.orphanPriceToken('shakes & malts $4.77 all day'), null);
  assert.strictEqual(gen.orphanPriceToken('el combo sale $6.700 toda la tarde'), null);
});
t('helper: entero real "4.77", fecha "19.11", hora "7:30", versión "v1.77" pasan', () => {
  assert.strictEqual(gen.orphanPriceToken('rated 4.77 by the neighbors'), null);
  assert.strictEqual(gen.orphanPriceToken('el 19.11 abrimos a las 7:30, v1.77 del menú'), null);
});
t('712 real (texto programado): la puerta EN lo rechaza POR precio huérfano', () => {
  const r = gen.captionPassesEn(CAP712, { business: 'Big Top Candy Shop' });
  assert.strictEqual(r.ok, false);
  assert.ok(/orphan price/i.test(r.reason), 'reason debe nombrar el precio huérfano: ' + r.reason);
});
t('712 publicado (reescritura sin precios): el chequeo NO se dispara', () => {
  assert.strictEqual(gen.orphanPriceToken(CAP712_PUBLISHED), null);
  const r = gen.captionPassesEn(CAP712_PUBLISHED, { business: 'Big Top Candy Shop' });
  assert.ok(!/orphan price/i.test(r.reason || ''), 'no debe fallar por precio: ' + r.reason);
});
t('variante ES: caption rioplatense con ".77" lo rechaza la puerta ES por precio huérfano', () => {
  const cap = 'La merienda se respeta ☕\nCafé con leche + 2 medialunas a .77, toda la tarde.\nComentá con quién la compartís 👇';
  const r = gen.captionPasses(cap, { business: 'Café Aroma' });
  assert.strictEqual(r.ok, false);
  assert.ok(/precio huérfano/i.test(r.reason), 'reason: ' + r.reason);
});
t('control ES: el mismo caption con precio completo "$6.700" pasa la puerta', () => {
  const cap = 'La merienda se respeta ☕\nCafé con leche + 2 medialunas a $6.700, toda la tarde.\nComentá con quién la compartís 👇';
  const r = gen.captionPasses(cap, { business: 'Café Aroma' });
  assert.strictEqual(r.ok, true, 'debía pasar: ' + (r.reason || ''));
});
t('control EN: caption con "$0.99" (forma del 617) no cae por precio huérfano', () => {
  const cap = 'fresh-baked cookies, still warm from the oven.\nyours for $0.99 today — come grab yours before they are gone.\ndm us to save a box 👇';
  const r = gen.captionPassesEn(cap, { business: 'Crumbl' });
  assert.ok(!/orphan price/i.test(r.reason || ''), 'no debe fallar por precio: ' + r.reason);
});
t('caption-style ES trae el ítem 29 (PRECIO-HUÉRFANO)', () => {
  assert.ok(cs.CAPTION_CHECKLIST.includes('29. EL PRECIO VA COMPLETO O NO VA'), 'falta ítem 29 ES');
});
t('caption-style EN trae el ítem 31 (ORPHAN-PRICE)', () => {
  assert.ok(cs.CAPTION_CHECKLIST_EN.includes('31. THE PRICE SHIPS WHOLE OR NOT AT ALL'), 'falta ítem 31 EN');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
