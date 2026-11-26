// test-lote-juli-v1350.js — WAITLIST-CTA (Juli, 2026-11-26)
// La puerta EN rechazaba el cierre canónico de la casa «Join the waitlist
// from the link.» como «missing a clear call to action» (ids reales 790
// PUBLICADO y 792 programado, cuenta 138), mientras el espejo ES pasaba.
// Fix: 'join the waitlist' / 'join the list' entran a CTA_SIGNALS_EN.
// Controles: el 773 real sigue frenado (booked no es CTA), un caption sin
// CTA sigue frenado, y «join our community of happy customers» sigue
// siendo frase quemada (la firma es la frase con objeto, no «join» suelto).
const { captionPassesEn, captionPasses } = require('./generator.js');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('ok -', name); }
  else { fail++; console.log('FAIL -', name); }
}
const c790 = 'One plan: US$199 a month, founder price.\n🚀 We launch on February 1. Join the waitlist from the link.';
const c792 = "We're a team: Posty and me. Behind every post there is a real person, with a name and a face — and a community manager who never sleeps.\n🚀 We launch on February 1. Join the waitlist from the link.";
const c773 = 'Your chair, your hour 💈\nBooked, on time, seven days a week: at Ideal Barbers the chair is yours.\n📍 Ideal Barbers · Atlanta';
const sinCta = 'Fresh croissants out of the oven every morning at seven.\nThe coffee is roasted here, in the back room.';
const comunidad = 'Our croissants come out of the oven at seven every morning.\nJoin our community of happy customers and taste the difference.';
const joinSuelto = 'Fresh croissants out of the oven every morning at seven.\nCome join the fun at the bakery today.';

check('790 real (publicado) pasa la puerta EN', captionPassesEn(c790, {}).ok === true);
check('792 real (programado) pasa la puerta EN', captionPassesEn(c792, {}).ok === true);
check('773 real sigue frenado por falta de CTA', captionPassesEn(c773, {}).ok === false && /call to action/.test(captionPassesEn(c773, {}).reason));
check('caption EN sin CTA sigue frenado', captionPassesEn(sinCta, {}).ok === false && /call to action/.test(captionPassesEn(sinCta, {}).reason));
check('«join our community of happy customers» sigue frenado (frase quemada)', captionPassesEn(comunidad, {}).ok === false && /stock phrase/.test(captionPassesEn(comunidad, {}).reason));
check('«join» suelto sin objeto no cuenta como CTA', captionPassesEn(joinSuelto, {}).ok === false && /call to action/.test(captionPassesEn(joinSuelto, {}).reason));
check('espejo ES 786 sigue pasando la puerta ES', captionPasses('Un solo plan: US$199 por mes, precio fundador.\n🚀 Arrancamos el 1° de febrero. Sumate a la lista desde el link.', { business: 'Posty' }).ok === true);
console.log(`${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
