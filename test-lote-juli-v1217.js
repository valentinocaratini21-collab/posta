'use strict';
// LOTE JULI-LINT-V13 (2026-11-22) — APERTURA LARGA ≠ EMPALME (M256).
// La regla (l) del lint vivía dentro de captionOpenIsGarbled: una primera
// oración de más de 26 palabras SIN costura se reportaba «empalmada»
// (id 741 real, publicado 2026-11-22 con su apertura de 27 palabras: la
// corrida del 21/11 lo bisecó firma por firma — ninguna disparaba, solo
// medía el largo). Desde v13: captionOpenIsGarbled caza SOLO costuras;
// captionOpenIsLong mide el largo; captionPasses frena el largo con su
// propio motivo («apertura larga») — se frena igual, se diagnostica bien.
const assert = require('assert');
const hooks = require('./hooks');
const gen = require('./generator');
const cs = require('./caption-style');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('ok -', name); }
  catch (e) { fail++; console.log('FAIL -', name, '::', e.message); }
}

const CAP741 = 'así queda un posteo de café cuando lo hace posty: el Classic Espresso de The Coffee Bar, con su foto, su vapor y su caption, todo listo. si tenés un café, esto lo hago por vos todos los días.';
const CAP741_CORTA = 'así queda un posteo de café cuando lo hace posty: el Classic Espresso, con su foto, su vapor y su caption, todo listo. si tenés un café, esto lo hago por vos todos los días.';
const CAP592 = 'Así queda un posteo de uñas cuando lo hace posty. La foto, el color, el caption: todo listo. Si tenés un salón, esto lo hago por vos todos los días.';

// ---------- el caso real: 741 es larga, no empalmada ----------
t('L1: id 741 real — captionOpenIsLong=true, captionOpenIsGarbled=false', () => {
  assert.strictEqual(hooks.captionOpenIsLong(CAP741), true);
  assert.strictEqual(hooks.captionOpenIsGarbled(CAP741, 'posty'), false);
});
t('L2: id 741 real — la puerta lo frena por «apertura larga», nunca «empalmada»', () => {
  const r = gen.captionPasses(CAP741, { business: 'Posty' });
  assert.strictEqual(r.ok, false);
  assert.ok(/apertura larga/.test(r.reason), 'reason: ' + r.reason);
  assert.ok(!/empalmada/.test(r.reason), 'reason: ' + r.reason);
});
t('L3: la reescritura del 741 (24 palabras) ya no es larga ni empalmada', () => {
  assert.strictEqual(hooks.captionOpenIsLong(CAP741_CORTA), false);
  assert.strictEqual(hooks.captionOpenIsGarbled(CAP741_CORTA, 'posty'), false);
});

// ---------- la costura real sigue siendo empalme, y no es «larga» ----------
t('L4: empalme real (firma del id 112) — garbled=true, long=false', () => {
  const cap = 'El De escéptica a fan: cómo cambió mi rutina';
  assert.strictEqual(hooks.captionOpenIsGarbled(cap, 'Posty'), true);
  assert.strictEqual(hooks.captionOpenIsLong(cap), false);
});
t('L5: la puerta reporta el empalme real como empalme (motivo intacto)', () => {
  const cap = 'El De escéptica a fan: cómo cambió mi rutina de todos los días en el local.\n\nProbá el blend de la casa y contanos qué te parece.\n\nPasá por el local o escribinos por DM.';
  const r = gen.captionPasses(cap, { business: 'Posty' });
  assert.strictEqual(r.ok, false);
  assert.ok(/apertura empalmada/.test(r.reason), 'reason: ' + r.reason);
});

// ---------- la medición v11 no cambia: la apertura es la primera oración ----------
t('L6: id 592 real (línea de 30 palabras, oraciones cortas) — ni larga ni empalmada', () => {
  assert.strictEqual(hooks.captionOpenIsLong(CAP592), false);
  assert.strictEqual(hooks.captionOpenIsGarbled(CAP592, 'posty'), false);
});
t('L7: borde exacto — 26 palabras no es larga, 27 sí', () => {
  const w26 = Array(26).fill('palabra').join(' ') + '.';
  const w27 = Array(27).fill('palabra').join(' ') + '.';
  assert.strictEqual(hooks.captionOpenIsLong(w26), false);
  assert.strictEqual(hooks.captionOpenIsLong(w27), true);
});

// ---------- el largo también se frena en el cuerpo, con su motivo ----------
t('L8: bloque 2 con primera oración de 30 palabras — «apertura larga en el cuerpo»', () => {
  const larga = Array(30).fill('sol').join(' ');
  const cap = 'Las medialunas salen del horno a las ocho.\n\n' + larga + '.\n\nPasá por el local o escribinos por DM.';
  const r = gen.captionPasses(cap, { business: 'Lo de Marta' });
  assert.strictEqual(r.ok, false);
  assert.ok(/apertura larga en el cuerpo/.test(r.reason), 'reason: ' + r.reason);
});

// ---------- un caption sano sigue pasando entero ----------
t('L9: id 557 real sigue pasando la puerta', () => {
  const cap = 'Flat white o latte? ☕\n\nEl flat white lleva menos leche y más café: más intenso. El latte, más suave.\n\nGuardá este post 🔖';
  const r = gen.captionPasses(cap, {});
  assert.strictEqual(r.ok, true, 'reason: ' + (r.reason || ''));
});

// ---------- el checklist enseña la distinción ----------
t('C1: caption-style ES trae el ítem 32 (APERTURA LARGA NO ES EMPALME)', () => {
  assert.ok(cs.CAPTION_CHECKLIST.includes('32. APERTURA LARGA NO ES EMPALME'), 'falta ítem 32 ES');
});
t('C2: caption-style EN trae el ítem 34 (A LONG OPENING IS NOT A SPLICE)', () => {
  assert.ok(cs.CAPTION_CHECKLIST_EN.includes('34. A LONG OPENING IS NOT A SPLICE'), 'falta ítem 34 EN');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
