// Suite JULI v1208 — dos firmas de la corrida 2026-11-20:
// (A) LINT v12 (hooks.js, regla b''): la voz en minúscula con un
//     nombre propio en mitad de oración NO es empalme — id 740 real
//     (cuenta 12): «…vuelven por la Volt, la chunky de siempre…» era
//     marcado por la mayúscula de «Volt»; la costura real abre una
//     oración con mayúscula y esa sigue cayendo.
// (B) M79-EN (generator.js captionPassesEn): el dispositivo de
//     apertura no se repite dentro de la semana en inglés — ids
//     735/739 reales (RAZOR RICK, cuenta 125): el 739 programado para
//     el 22/11 abre con el titular EXACTO del 735 publicado el 20/11
//     («old school skill. modern style.») y la puerta EN lo dejaba
//     pasar entero cuando le pasaban los previos.
const assert = require('assert');
const gen = require('./generator');
const hooks = require('./hooks');
const cs = require('./caption-style');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' — ' + e.message); }
}

// ---------- (A) LINT v12 ----------
const CAP740 = 'los que vuelven no vuelven por cualquier par. vuelven por la Volt, la chunky de siempre. y ese posteo lo hizo posty.';
t('A1: id 740 real ya NO es empalme (voz en minúscula + nombre propio)', () => {
  assert.strictEqual(hooks.captionOpenIsGarbled(CAP740, 'Posty.'), false);
  assert.strictEqual(hooks.captionOpenIsGarbled(CAP740, 'Posty'), false);
  assert.strictEqual(hooks.captionOpenIsGarbled(CAP740, ''), false);
});
t('A2: la puerta ES ya no rechaza el 740 por apertura empalmada', () => {
  const r = gen.captionPasses(CAP740, { business: 'Posty.' });
  assert.ok(!/empalmada/.test(r.reason || ''), 'no debe fallar por empalme: ' + r.reason);
});
t('A3: siembra nails aprobada (592) sigue limpia', () => {
  assert.strictEqual(hooks.captionOpenIsGarbled('este color no se elige en la vidriera. se elige en la mano.', 'Posty'), false);
});
t('A4: costura con oración que ABRE en mayúscula sigue marcada (esquema id 91)', () => {
  assert.strictEqual(hooks.captionOpenIsGarbled('El set de mate de siempre. sin margen de ganancia, solo hasta el domingo', 'Mates del Sur'), true);
});
t('A5: variante — fragmento capitalizado tras terminador + oración en minúscula', () => {
  assert.strictEqual(hooks.captionOpenIsGarbled('Probamos el blend nuevo de la casa. sin decirle a nadie todavía', 'Café Aroma'), true);
});
t('A6: nombre propio tras artículo en minúscula, sin costura, pasa', () => {
  assert.strictEqual(hooks.captionOpenIsGarbled('el café de la esquina. el que hace la Coca bien fría desde siempre.', 'Posty'), false);
});
t('A7: empalme clásico del 112 sigue marcado', () => {
  assert.strictEqual(hooks.captionOpenIsGarbled('El De escéptica a fan: cómo cambió mi rutina', 'Posty'), true);
});
t('A8: id 518 real sigue marcado con la ficha con punto', () => {
  assert.strictEqual(hooks.captionOpenIsGarbled('El ingrediente de Así trabajamos detrás de escena en Posty que casi nadie usa (y nosotros sí, en Posty.)', 'Posty.'), true);
});

// ---------- (B) M79-EN ----------
const CAP735 = 'old school skill. modern style.\nthe classic cut, done right — every single time.\nwalk-ins welcome · 2105 lynnbrook dr, south austin';
const CAP739 = 'old school skill. modern style.\nthe classic cut, the fade, the hot towel shave — and a barbershop that comes to you, seven days a week.\nwalk in, or we roll up.\n2105 lynnbrook dr, south austin · mobile across austin & the hill country';
t('B1: id 739 real con prev=[735] cae POR dispositivo repetido (antes de CTA)', () => {
  const r = gen.captionPassesEn(CAP739, { business: 'RAZOR RICK | AUSTIN TEXAS BARBER', prevCaptions: [CAP735] });
  assert.strictEqual(r.ok, false);
  assert.ok(/opening device repeated/i.test(r.reason), 'reason debe nombrar el dispositivo: ' + r.reason);
});
t('B2: id 739 SIN previos no cae por dispositivo (solo por CTA de póster)', () => {
  const r = gen.captionPassesEn(CAP739, { business: 'RAZOR RICK | AUSTIN TEXAS BARBER' });
  assert.ok(!/opening device/i.test(r.reason || ''), 'sin previos no hay choque: ' + r.reason);
});
t('B3: id 736 real con prev=[734] pasa entero (aperturas distintas)', () => {
  const cap734 = 'keeping austin sweet, one cupcake at a time.\nbaked fresh tuesday through saturday.\n1905 s 1st st, austin';
  const cap736 = "the cake case is full.\nunder the sea, cookie monster, from austin with love, the 70's cake, plant love — every one made to order, every one somebody's celebration.\ntell us the idea, we pipe it in buttercream.\n1905 s 1st st, austin · tue–sat 10–7";
  const r = gen.captionPassesEn(cap736, { business: 'Sugar Mama', prevCaptions: [cap734] });
  assert.strictEqual(r.ok, true, 'debía pasar: ' + (r.reason || ''));
});
t('B4: la serie que se mueve NO es repetición («day two» → «day three»)', () => {
  const prev = 'day two: the calzone.\nfolded around ricotta & mozzarella, marinara on the side — for the pour.\nby the slice or the whole pie, till late.\n1415 s congress ave, austin';
  const cap = 'day three: the slice, up close.\nhand-tossed, straight off the pie — the one we saved for last.\nby the slice or the whole pie, till late.\n1415 s congress ave, austin';
  const r = gen.captionPassesEn(cap, { business: 'Home Slice', prevCaptions: [prev] });
  assert.ok(!/opening device/i.test(r.reason || ''), 'la serie que avanza no repite dispositivo: ' + r.reason);
});
t('B5: familia interrogativa repetida («how many times…») cae', () => {
  const prev = 'how many times have you walked past the good chair?\nthe classic cut, done right.\nwalk-ins welcome · austin';
  const cap = 'how many times have you settled for a bad fade?\nthe classic cut, done right — dm us to book your chair today.\nwalk-ins welcome · austin';
  const r = gen.captionPassesEn(cap, { business: 'RAZOR RICK | AUSTIN TEXAS BARBER', prevCaptions: [prev] });
  assert.strictEqual(r.ok, false);
  assert.ok(/opening device repeated/i.test(r.reason), 'reason: ' + r.reason);
});
t('B6: pregunta con las mismas 3 palabras cae; pregunta distinta pasa el chequeo', () => {
  const prev = 'ready for the weekend?\nthe classic cut, done right.\nwalk-ins welcome · austin';
  const same = 'ready for the weekend? we are.\nthe fade, done right — dm us to book your chair today.\nwalk-ins welcome · austin';
  const rSame = gen.captionPassesEn(same, { business: 'RAZOR RICK | AUSTIN TEXAS BARBER', prevCaptions: [prev] });
  assert.ok(/opening device repeated/i.test(rSame.reason || ''), 'misma pregunta = mismo dispositivo: ' + rSame.reason);
  const diff = 'booked out again?\nthe fade, done right — dm us to book your chair today.\nwalk-ins welcome · austin';
  const rDiff = gen.captionPassesEn(diff, { business: 'RAZOR RICK | AUSTIN TEXAS BARBER', prevCaptions: [prev] });
  assert.ok(!/opening device/i.test(rDiff.reason || ''), 'pregunta distinta no es el dispositivo: ' + rDiff.reason);
});
t('B7: captionWeekClash reconoce el motivo EN como choque de semana', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, 'generator.js'), 'utf8');
  assert.ok(src.includes("'opening device repeated in the same week'"), 'WEEK_CLASH_REASONS debe incluir el motivo EN');
});

// ---------- checklist ----------
t('C1: caption-style ES trae el ítem 30 (LINT v12)', () => {
  assert.ok(cs.CAPTION_CHECKLIST.includes('30. LA VOZ EN MINÚSCULA CON NOMBRE PROPIO NO ES EMPALME'), 'falta ítem 30 ES');
});
t('C2: caption-style EN trae el ítem 32 (M79-EN)', () => {
  assert.ok(cs.CAPTION_CHECKLIST_EN.includes('32. THE OPENING DOES NOT REPEAT WITHIN THE WEEK'), 'falta ítem 32 EN');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
