// LOTE JULI v1344 — BOOKED-NO-ES-CTA: 'booked' descriptivo no es CTA en la puerta EN.
const assert = require('assert');
const g = require('./generator.js');
const passesEn = g.captionPassesEn || (g.__test && g.__test.captionPassesEn);
if (!passesEn) { console.log('SKIP: captionPassesEn no exportado'); process.exit(0); }
let n = 0, ok = 0;
function t(name, fn) { n++; try { fn(); ok++; console.log('ok -', name); } catch (e) { console.log('FAIL -', name, e.message); } }
const c773 = "Your chair, your hour 💈\nBooked, on time, seven days a week: at Ideal Barbers the chair is yours the minute you sit down. No waiting room, no walk-in chaos.\n📍 Grant Park & Pittsburgh Yards, Atlanta";
t('773 real: booked descriptivo ya no cuenta como CTA', () => {
  const r = passesEn(c773, { business: 'Ideal Barbers' });
  assert.strictEqual(r.ok, false); assert.match(r.reason, /call to action/i);
});
t('imperativo book sigue siendo CTA válido', () => {
  const r = passesEn("The line-up is the signature ✂️\nEvery edge checked twice before you leave the chair: that is the Ideal Barbers finish, every single time.\nBook your chair today.\n📍 Grant Park, Atlanta", { business: 'Ideal Barbers' });
  assert.ok(!/call to action/i.test(r.reason || ""), "no debio frenar por CTA: " + (r.reason||""));
});
t('booked + CTA real pasa el chequeo de CTA', () => {
  const r = passesEn("Fully booked weekends, always 💈\nThe chair stays busy because the finish holds all week: clean edges, checked twice, no rush at Ideal Barbers.\nDM us to grab your slot.\n📍 Grant Park, Atlanta", { business: 'Ideal Barbers' });
  assert.ok(!/call to action/i.test(r.reason || ""), "no debio frenar por CTA: " + (r.reason||""));
});
console.log(`${ok}/${n}`); process.exit(ok === n ? 0 : 1);
