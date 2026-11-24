/* LOTE JULI v1301 — EN-EMOJI: EL CIERRE SE MIDE SIN EL EMOJI FINAL (2026-11-24).
 * Caso real: id 752 (cuenta 130, Castle Construction, SCHEDULED
 * 25/11) — su gancho «This is what a Georgia backyard is for. 🏡»
 * es una oración COMPLETA que termina en preposición (inglés
 * válido), pero captionOpenIsGarbledEn medía el cierre con
 * /[.!?…]$/ sobre la línea cruda: el último carácter es el emoji,
 * no el punto, y la palabra «for» caía en la lista de colgantes →
 * la puerta EN lo rechazaba como «spliced opening». Falso empalme.
 * El cómputo de palabras ya pelaba los pictogramas; el test de
 * puntuación no. Este lote normaliza los dos tests de cierre de la
 * función (gancho y última línea de bloque) con la misma regla.
 */
'use strict';
const assert = require('assert');
const { captionPassesEn, captionPasses } = require('./generator');
const { captionOpenIsGarbled } = require('./hooks');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok', name); }
  catch (e) { fail++; console.log('  MAL', name, '—', e.message); }
}

// Id 752 REAL (cuenta 130, scheduled 25/11): la puerta EN ya no lo
// frena por empalme. Su único freno restante es el CTA (preexistente,
// compartido con la tanda de primeros posteos de hoy).
const CAP_752 = 'This is what a Georgia backyard is for. 🏡\nOur screened-in porches give you the outdoors — minus the bugs and the weather. Built by Castle Construction, licensed remodeling contractors with 20+ years around Atlanta.\nDecks, sunrooms, screened porches and custom basements.\n📍 Marietta · serving the Atlanta area';
t('752 real: captionPassesEn NO lo frena por «spliced opening»', () => {
  const r = captionPassesEn(CAP_752, null, null);
  assert.ok(!/spliced/.test(r.reason || ''), 'motivo inesperado: ' + r.reason);
});
t('752 real: el freno que queda es el CTA (preexistente)', () => {
  const r = captionPassesEn(CAP_752, null, null);
  assert.strictEqual(r.ok, false);
  assert.ok(/call to action/.test(r.reason), 'motivo: ' + r.reason);
});
t('752 recortado + CTA: pasa la puerta EN entera', () => {
  const corto = 'This is what a Georgia backyard is for. 🏡\nOur screened-in porches give you the outdoors — minus the bugs and the weather.\nDM us for a free quote 📩';
  const r = captionPassesEn(corto, null, null);
  assert.strictEqual(r.ok, true, 'motivo: ' + r.reason);
});

// La misma oración SIN el punto sigue siendo un gancho colgante:
// el freno real no se pierde, solo deja de mirar el emoji.
t('sin punto (con o sin emoji): sigue frenado por empalme/colgante', () => {
  const a = captionPassesEn('This is what a Georgia backyard is for\nDM us for a free quote 📩', null, null);
  assert.strictEqual(a.ok, false); assert.ok(/spliced/.test(a.reason), 'motivo: ' + a.reason);
  const b = captionPassesEn('This is what a Georgia backyard is for 🏡\nDM us for a free quote 📩', null, null);
  assert.strictEqual(b.ok, false); assert.ok(/spliced/.test(b.reason), 'motivo: ' + b.reason);
});

// Clase 659 (Veja #7): subordinante colgante con emoji — sigue cayendo.
t('«Salar, where ✨» (clase 659): sigue frenado', () => {
  const r = captionPassesEn('Salar, where ✨\nDM us to order yours today 📩', null, null);
  assert.strictEqual(r.ok, false); assert.ok(/spliced/.test(r.reason), 'motivo: ' + r.reason);
});

// Oración completa terminada en preposición + emoji, en bloque del
// cuerpo (última línea): no es fragmento cortado.
t('bloque del cuerpo que cierra «…made for. 👟» no es fragmento', () => {
  const r = captionPassesEn('Fresh styles just landed 👟\nThese sneakers were made for. 👟\nDM us to order yours today 📩', null, null);
  assert.ok(!/spliced/.test(r.reason || ''), 'motivo: ' + r.reason);
});

// Regresión EN: el 687 real sigue rechazado por su frase de stock.
const CAP_687 = 'How about a sweet moment for the holidays?\n\nOrder online for local delivery or nationwide shipping and share the love with friends and family.\n\nVisit our website to explore all flavors and get your favorites today!';
t('687 real: captionPassesEn lo sigue frenando por «share the love»', () => {
  const r = captionPassesEn(CAP_687, null, null);
  assert.strictEqual(r.ok, false); assert.ok(/share the love/.test(r.reason), 'motivo: ' + r.reason);
});
// Regresión EN: el 751 real sigue pasando entero.
const CAP_751 = 'Two full hours. Zero rushing. ✂️\nThe Ideal Experience is our complete premium session: detailed cut, full beard work, every detail addressed in one appointment — with Mike, owner and master barber.\n120 minutes · $200\n📍 Pittsburgh Yards & Grant Park, Atlanta\nAppointments only — book your slot.';
t('751 real: captionPassesEn sigue pasando', () => {
  const r = captionPassesEn(CAP_751, null, null);
  assert.strictEqual(r.ok, true, 'motivo: ' + r.reason);
});
// Fuera de alcance declarado: el 754 (ES) sigue marcado por la firma
// (c) del lint ES — es el candidato registrado de la corrida, no
// este lote (su apertura es un nombre de producto, «La Mitad LF»).
const CAP_754 = 'La Mitad LF: la pizza de la casa 🍕\nJamón crudo, rúcula y queso, como sale del horno de barro.\nAl molde o a la piedra, vos elegís.\n📍 Jerónimo Salguero 293, Almagro — todos los días de 8 a 1';
t('754 (ES): sin cambios en este lote — la firma (c) lo sigue marcando (candidato)', () => {
  assert.strictEqual(captionOpenIsGarbled(CAP_754, 'Barpizzeria Lodefran'), true);
});

console.log(`\n${pass} pass, ${fail} fail (${pass + fail} tests)`);
process.exit(fail ? 1 : 0);
