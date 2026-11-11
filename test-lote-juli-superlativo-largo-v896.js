/* test-lote-juli-superlativo-largo-v896.js — LOTE JULI-SUPERLATIVO-LARGO v896
 * (a) SUPERLATIVO-PROPIO en captionPasses (generator.js): el superlativo
 *     sobre la oferta propia sin prueba ("los mejores diseños", "la mejor
 *     selección de granos") ya no pasa — ids 591/564/569 reales, 10-11/11.
 *     El checklist lo prohíbe (ítem 1) pero la puerta no lo miraba.
 * (b) LINT v11 en captionOpenIsGarbled (hooks.js): el tope de 26 palabras
 *     mide la primera ORACIÓN, no la primera línea — ids 592/570 reales
 *     (captions de una sola línea, 30/33 palabras, primera oración 10/24)
 *     se marcaban empalmados siendo copia limpia.
 * Base: v894 (HEAD b9842f10; re-base desde v893 2acc5ee4 tras aterrizar TAB ADS:
 * generator.js y hooks.js byte-idénticos entre v893 y v894; server.js difiere
 * SOLO en la línea BUILD). Sin app.js -> sin ?v=, sin M78.
 */
const assert = require('assert');
const gen = require('./generator');
const { captionOpenIsGarbled } = require('./hooks');
const fs = require('fs');
let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok -', name); }
  catch (e) { fail++; console.log('  MAL -', name, '::', e.message); }
}
const IN = { business: 'Café de Prueba Bamboo', dna: null, ig_username: 'pruebabamboov699' };
const IN12 = { business: 'Posty. ', dna: null, ig_username: 'posty.communitymanager' };
const C591 = "El momento de mirar el Instagram y no saber qué postear no tiene que ser parte de tu día. 😅 \nYo me encargo de armar tu semana con los mejores diseños, textos y hashtags. ¡Sin estrés, solo aprobás y listo! Contame en los comentarios cómo te va con las ideas para tu contenido.";
const C564 = "¿Cuál es tu café favorito de Bamboo? ☕\nAcá nos tomamos muy en serio el oficio del café de especialidad. Cada taza está hecha con la mejor selección de granos, porque un buen café es la base de un gran día. \nContanos en los comentarios cuál es tu favorito y vení a disfrutarlo con nosotros. ¡Te esperamos!";
const C592 = "Así queda un posteo de uñas cuando lo hace posty. La foto, el color, el caption: todo listo. Si tenés un salón, esto lo hago por vos todos los días.";
const C570 = "En Posty, manejo tu Instagram como un amigo: tu semana de contenido, con diseños, textos y hashtags, listos para que vos solo digas \"¡Sí!\". Así evitamos momentos de duda y ganamos claridad. \n\nDejá tus dudas de lado y escribime. ¿Qué problema de posteos tenés hoy?";
const C565 = "Probamos 12 versiones de Presentamos nuestro café especial del mes ☕ hasta dar con esta: Café de Prueba Bamboo\n\n¿Te imaginás un café que te haga sentir en el cielo? Reservá tu taza enviándonos un DM y acompaña tu momento con nuestro café de especialidad.";
const C593 = "así se mueve el color cuando posty lo postea. un video así cada semana, para tu salón, sin que muevas un dedo.";
const C594 = "las que vuelven no vuelven por el esmalte. vuelven por el color que les queda. y ese posteo lo hizo posty.";

console.log('== (A) SUPERLATIVO-PROPIO — ids reales ==');
ok('A1 id 591 real: "los mejores diseños, textos y hashtags" se rechaza', () => {
  const chk = gen.captionPasses(C591, IN12);
  assert.strictEqual(chk.ok, false, '591 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/superlativo propio/i.test(chk.reason), chk.reason);
});
ok('A2 id 564 real (= 569): "la mejor selección de granos" se rechaza', () => {
  const chk = gen.captionPasses(C564, IN);
  assert.strictEqual(chk.ok, false, '564 pasó limpio: ' + JSON.stringify(chk));
  assert.ok(/superlativo propio/i.test(chk.reason), chk.reason);
});
ok('A3 variante: "los mejores precios" sin precio se rechaza', () => {
  const cap = 'Tenemos los mejores precios del rubro, vení a comprobarlo.\n\nEscribime por DM y te paso la lista.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false, JSON.stringify(chk));
  assert.ok(/superlativo propio/i.test(chk.reason), chk.reason);
});
ok('A4 variante: "el mejor café" sin prueba se rechaza', () => {
  const cap = 'Vení a probar el mejor café de la casa, hecho con el grano de esta semana.\n\nEscribime por DM y reservá tu mesa.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false, JSON.stringify(chk));
  assert.ok(/superlativo propio/i.test(chk.reason), chk.reason);
});

console.log('== (B) SUPERLATIVO-PROPIO — controles que pasan ==');
ok('B1 control con prueba (elegida + año) pasa', () => {
  const cap = 'La mejor selección de granos, elegida en cata ciega en 2024: este es el blend de la casa.\n\nPasá por el local y probalo. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('B2 control "del barrio" (caso #3100) pasa', () => {
  const cap = 'El mejor café de especialidad del barrio, tostado cada mañana en el local.\n\nPasá por el local hoy y probalo. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('B3 control cita de cliente ("dice María") pasa', () => {
  const cap = '«El mejor café que probé en años», dice María, clienta del local.\n\nVení a probarlo vos también. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('B4 control con precio ($) pasa', () => {
  const cap = 'Los mejores diseños de la semana salen $12.500 el pack, con tu marca.\n\nEscribime por DM y lo armamos.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('B5 control "el mejor de todos" (sin sustantivo de oferta) pasa', () => {
  const cap = 'Este es el mejor de todos los que probamos esta semana, y eso que probamos doce.\n\nPasá por el local y elegí el tuyo. Escribime por DM.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('B6 control "tu mejor posteo" (sustantivo fuera de la lista) pasa', () => {
  const cap = '¿Querés que tu mejor posteo lo vea más gente esta semana?\n\nCon Posty identifico el posteo que más rindió y te propongo empujarlo con pauta, con el tope que vos fijás.\n\nEscribinos por DM y lo vemos juntos.';
  const chk = gen.captionPasses(cap, { business: 'Café de Prueba Bamboo', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('B7 LÍMITE documentado: "lo mejor" a secas NO entra en esta regla', () => {
  const cap = 'Y lo mejor, vos solo aprobás: tu semana sale sola.\n\nEscribime por DM y probalo gratis por 3 días.';
  const chk = gen.captionPasses(cap, IN12);
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (C) LINT v11 — la primera oración, no la primera línea ==');
ok('C1 id 592 real (30 palabras en la línea, 10 en la primera oración) ya NO es empalme', () => {
  assert.strictEqual(captionOpenIsGarbled(C592, 'Posty. '), false);
});
ok('C2 sintético: una línea de 32 palabras con primera oración de 20 ya NO es empalme', () => {
  const cap = 'El café de la mañana sale con el grano de la semana y el tiempo que se merece cada taza. Vení a probarlo al local hoy mismo y contanos qué te pareció.';
  assert.strictEqual(captionOpenIsGarbled(cap, 'Café de Prueba Bamboo'), false);
});
ok('C2b LÍMITE documentado: id 570 real sigue marcado, pero NO por el largo — la cita «¡Sí!» dispara la regla ¿/¡ (candidato aparte, no tocado por v11)', () => {
  assert.strictEqual(captionOpenIsGarbled(C570, 'Posty. '), true);
  // Sin la cita, la misma apertura pasa: el largo ya no la marca.
  assert.strictEqual(captionOpenIsGarbled(C570.replace('"¡Sí!"', 'sí'), 'Posty. '), false);
});
ok('C3 primera oración corrida (>26 palabras, sin terminador) SÍ se frena', () => {
  const cap = 'En Posty manejo tu Instagram como un amigo con tu semana de contenido con diseños textos y hashtags listos para que vos solo digas que sí sin pensar en nada más todos los días del año';
  assert.strictEqual(captionOpenIsGarbled(cap, 'Posty. '), true);
});
ok('C4 primera oración de 27 palabras con punto después SÍ se frena', () => {
  const cap = 'En Posty manejo tu Instagram como un amigo con tu semana de contenido con diseños textos y hashtags listos para que vos solo digas que sí sin pensar. El resto del caption sigue normal.';
  assert.strictEqual(captionOpenIsGarbled(cap, 'Posty. '), true);
});
ok('C5 segunda oración larga con primera corta NO se frena (el lint mira la apertura)', () => {
  const cap = 'Corto. Esta segunda oración es larga y sigue y sigue con muchas palabras más de las que debería tener una sola oración normal en un caption de Instagram.';
  assert.strictEqual(captionOpenIsGarbled(cap, 'Posty. '), false);
});
ok('C6 id 565 real sigue empalmado (clase LINT v9, sin regresión)', () => {
  assert.strictEqual(captionOpenIsGarbled(C565, 'Café de Prueba Bamboo'), true);
});
ok('C7 controles 593/594 (voz minúscula, LINT v10) siguen limpios', () => {
  assert.strictEqual(captionOpenIsGarbled(C593, 'Posty. '), false);
  assert.strictEqual(captionOpenIsGarbled(C594, 'Posty. '), false);
});

console.log('== (D) Estampado del lote ==');
ok('D1 BUILD_ID v896 en server.js', () => {
  const src = fs.readFileSync('./server.js', 'utf8');
  assert.ok(src.includes("const BUILD_ID = '20261105-v896'"), 'BUILD_ID no es v896');
  assert.ok(!src.includes("20261105-v895'"), 'queda resto de v895');
});
ok('D2 marcadores del lote presentes', () => {
  const g = fs.readFileSync('./generator.js', 'utf8');
  const h = fs.readFileSync('./hooks.js', 'utf8');
  assert.ok(g.includes('SUPERLATIVO-PROPIO'), 'falta SUPERLATIVO-PROPIO en generator.js');
  assert.ok(h.includes('LINT v11'), 'falta LINT v11 en hooks.js');
});

console.log('\nRESULTADO: ' + pass + ' ok, ' + fail + ' mal');
process.exit(fail ? 1 : 0);
