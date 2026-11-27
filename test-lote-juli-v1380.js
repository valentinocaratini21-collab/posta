// test-lote-juli-v1380.js — LINT v14 APERTURA-ENTRECOMILLADA (Juli, 2026-11-27)
// Id 808 real (cuenta 12, programado 2026-11-28): «¿Qué posteo hoy?» —
// la firma (b) de captionOpenIsGarbled marcaba empalme porque el «¿»
// cae en el índice 1 tras la comilla angular, aunque la pregunta citada
// ABRE la línea. Fix: la firma mira el prefijo — un «¿»/«¡» solo es
// empalme si antes de él hay contenido (palabra o puntuación de frase);
// si solo hay marcas de apertura, es cita legítima.
// Controles: los empalmes de los ids 93/109 siguen cayendo, la apertura
// con «¿» pelado sigue pasando, y la cita a mitad de línea sigue
// marcada (la exención es solo para la apertura de la línea).
const { captionOpenIsGarbled } = require('./hooks.js');
const { captionPasses } = require('./generator.js');
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('ok -', name); }
  else { fail++; console.log('FAIL -', name); }
}
const c808 = '«¿Qué posteo hoy?» Esa pregunta ya no es tu problema.\n🚀 Arrancamos el 1° de febrero. Sumate a la lista desde el link.';
check('808 real: la cita «¿…?» que abre ya no es empalme', captionOpenIsGarbled(c808, 'Posty') === false);
check('808 real pasa la puerta ES completa', captionPasses(c808, { business: 'Posty' }).ok === true);
check('variante «¡…!» que abre pasa', captionOpenIsGarbled('«¡Llegó el día!» Hoy abrimos las puertas del local nuevo.', 'Posty') === false);
check('variante con comillas rectas que abre pasa', captionOpenIsGarbled('"¿Cuánto sale?" La pregunta de siempre, respondida con la lista en la mano.', 'Posty') === false);
check('apertura con «¿» pelado sigue pasando', captionOpenIsGarbled('¿Qué posteo hoy? Esa pregunta ya no es tu problema.', 'Posty') === false);
check('empalme 93 (pregunta cosida a mitad) sigue cayendo', captionOpenIsGarbled('El truco haciendo ¿Cómo crear contenido sin estrés? en Posty.', 'Posty') === true);
check('empalme 109 (exclamación tras coma) sigue cayendo', captionOpenIsGarbled('Probá esto, ¡Novedades de la semana! en el local.', 'Posty') === true);
check('cita a mitad de línea sigue marcada (exención solo al abrir)', captionOpenIsGarbled('El secreto es simple: «¿Sabías que viene con regalo?» y listo.', 'Posty') === true);
console.log(`${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
