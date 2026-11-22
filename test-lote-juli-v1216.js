// Suite JULI v1216 — corrida 2026-11-21: paridades (h) e (i) registradas
// como candidatos el 2026-11-20:
// (h) ES: el dispositivo de apertura repetido (M79) vivía DESPUÉS del
//     chequeo de CTA en captionPasses — un póster sin CTA (formato de la
//     línea a mano) que repetía dispositivo devolvía el motivo de CTA y
//     captionWeekClash lo pasaba como ok:true con nota. La EN lo resolvió
//     en v1208 poniendo su chequeo antes del CTA; hoy entra la paridad ES.
// (i) captionWeekClash corría SIEMPRE la puerta ES: el id 739 real
//     (RAZOR RICK, scheduled 2026-11-22, titular exacto del 735 publicado
//     el 20/11) devolvía ok:true con nota de CTA en español. Ahora el
//     helper elige la puerta por idioma (langOpt o detectTextLang).
const assert = require('assert');
const gen = require('./generator');
const cs = require('./caption-style');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}

// ---------- (h) dispositivo ES antes del CTA ----------
const PREV_P = '¿Cuántas veces te pasó que no sabés qué postear?\n\nTu semana armada con tus fotos.';
const CAP_P = '¿Cuántas veces te agarró una fecha sin nada listo?\n\nTu semana armada con tus fotos.';
t('H1: póster ES sin CTA que repite dispositivo cae POR dispositivo, no por CTA', () => {
  const r = gen.captionPasses(CAP_P, { business: 'Posty', prevCaptions: [PREV_P] });
  assert.strictEqual(r.ok, false);
  assert.ok(/dispositivo de apertura repetido/.test(r.reason), 'reason: ' + r.reason);
});
t('H2: captionWeekClash ES frena el mismo póster (antes ok:true con nota)', () => {
  const r = gen.captionWeekClash(CAP_P, [PREV_P], 'Posty');
  assert.strictEqual(r.ok, false);
  assert.ok(/dispositivo de apertura repetido/.test(r.reason), 'reason: ' + r.reason);
});
t('H3: póster ES sin CTA y SIN repetición sigue como nota (no es choque)', () => {
  const cap = 'el pan sale del horno a las 8.\n\ntu panadería, todos los días.';
  const r = gen.captionWeekClash(cap, [PREV_P], 'Posty');
  assert.strictEqual(r.ok, true);
});
t('H4: con CTA, la repetición ES sigue cayendo por dispositivo (sin regresión)', () => {
  const cap = '¿Cuántas veces te agarró una fecha sin nada listo?\n\nEscribinos por DM y armamos tu semana.';
  const r = gen.captionPasses(cap, { business: 'Posty', prevCaptions: [PREV_P] });
  assert.strictEqual(r.ok, false);
  assert.ok(/dispositivo de apertura repetido/.test(r.reason), 'reason: ' + r.reason);
});
t('H5: declarativa ES repetida sin CTA cae por dispositivo (mismas 3 palabras)', () => {
  const prev = 'el horno ya está caliente.\n\nel pan de la casa, como siempre.';
  const cap = 'el horno ya está listo.\n\nel pan de la casa, como siempre.';
  const r = gen.captionPasses(cap, { business: 'Panadería', prevCaptions: [prev] });
  assert.strictEqual(r.ok, false);
  assert.ok(/dispositivo de apertura repetido/.test(r.reason), 'reason: ' + r.reason);
});
t('H6: la serie que se mueve no es repetición ES', () => {
  const prev = 'día dos: la medialuna.\n\nrecién horneada, con café.';
  const cap = 'día tres: el alfajor.\n\nrecién horneado, con café. escribinos por DM.';
  const r = gen.captionPasses(cap, { business: 'Café', prevCaptions: [prev] });
  assert.ok(!/dispositivo de apertura repetido/.test(r.reason || ''), 'reason: ' + r.reason);
});

// ---------- (i) captionWeekClash por idioma ----------
const CAP735 = 'old school skill. modern style.\nthe classic cut, done right — every single time.\nwalk-ins welcome · 2105 lynnbrook dr, south austin';
const CAP739 = 'old school skill. modern style.\nthe classic cut, the fade, the hot towel shave — and a barbershop that comes to you, seven days a week.\nwalk in, or we roll up.\n2105 lynnbrook dr, south austin · mobile across austin & the hill country';
t('I1: id 739 real con prev=[735] — captionWeekClash ahora FRENA por dispositivo EN', () => {
  const r = gen.captionWeekClash(CAP739, [CAP735], 'RAZOR RICK | AUSTIN TEXAS BARBER');
  assert.strictEqual(r.ok, false);
  assert.ok(/opening device repeated/.test(r.reason), 'reason: ' + r.reason);
});
t('I2: captionWeekClash con langOpt en explícito frena igual', () => {
  const r = gen.captionWeekClash(CAP739, [CAP735], 'RAZOR RICK', 'en');
  assert.strictEqual(r.ok, false);
  assert.ok(/opening device repeated/.test(r.reason), 'reason: ' + r.reason);
});
t('I3: EN sin repetición no es choque (736 con prev 734)', () => {
  const cap734 = 'keeping austin sweet, one cupcake at a time.\nbaked fresh tuesday through saturday.\n1905 s 1st st, austin';
  const cap736 = "the cake case is full.\nunder the sea, cookie monster, from austin with love, the 70's cake, plant love — every one made to order, every one somebody's celebration.\ntell us the idea, we pipe it in buttercream.\n1905 s 1st st, austin · tue–sat 10–7";
  const r = gen.captionWeekClash(cap736, [cap734], 'Sugar Mama');
  assert.strictEqual(r.ok, true, 'reason: ' + (r.reason || r.note || ''));
});
t('I4: sin previos, captionWeekClash sigue ok:true en ambos idiomas', () => {
  assert.strictEqual(gen.captionWeekClash(CAP739, [], 'RAZOR RICK').ok, true);
  assert.strictEqual(gen.captionWeekClash(CAP_P, [], 'Posty').ok, true);
});
t('I5: duplicado exacto EN sigue siendo choque vía weekClash', () => {
  const r = gen.captionWeekClash(CAP735, [CAP735], 'RAZOR RICK');
  assert.strictEqual(r.ok, false);
});

// ---------- checklist ----------
t('C1: caption-style ES trae el ítem 31 (PARIDAD-CLASH)', () => {
  assert.ok(cs.CAPTION_CHECKLIST.includes('31. EL DISPOSITIVO REPETIDO SE VE AUNQUE NO HAYA CTA'), 'falta ítem 31 ES');
});
t('C2: caption-style EN trae el ítem 33 (CLASH-PARITY)', () => {
  assert.ok(cs.CAPTION_CHECKLIST_EN.includes('33. A REPEATED DEVICE SHOWS EVEN WITHOUT A CTA'), 'falta ítem 33 EN');
});

// ---------- el 741 de hoy sigue marcado por su motivo real ----------
t('D1: id 741 real sigue frenado — desde LINT v13 (v1217) por apertura LARGA (27 palabras), no por empalme ni por dispositivo', () => {
  const cap741 = 'así queda un posteo de café cuando lo hace posty: el Classic Espresso de The Coffee Bar, con su foto, su vapor y su caption, todo listo. si tenés un café, esto lo hago por vos todos los días.';
  const r = gen.captionPasses(cap741, { business: 'Posty' });
  assert.strictEqual(r.ok, false);
  assert.ok(/apertura larga/.test(r.reason), 'reason: ' + r.reason);
  assert.ok(!/empalmada/.test(r.reason), 'reason: ' + r.reason);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
