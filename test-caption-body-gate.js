'use strict';
/* test-caption-body-gate.js — CUERPO-M79 (Juli, 2026-10-19): el gate de
 * cuerpo en captionPasses + el control de repetición intra-semana.
 * Casos reales de producción:
 *  - id 407 (2026-10-18): "El día de mamá se merece lo mejor. ¿Sabías
 *    que con Posty…" pasó TODOS los gates de su día.
 *  - id 113 (scheduled): "¿Sabías que un community manager humano te
 *    puede salir $300.000 al mes?…" — la muletilla como apertura.
 *  - id 423 (cuenta 3, 2026-10-19): "La madera que hace la diferencia".
 *  - Semana 2026-10-19 cuenta 12: ids 407/408/409/414 abrieron con el
 *    mismo dispositivo "¿Cuántas veces te pasó/agarró…?".
 * Corre con: node test-caption-body-gate.js  (sin red, sin IA paga). */
const assert = require('assert');
const gen = require('./generator');

let passed = 0, failed = 0;
const ok = (name, fn) => {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { failed++; console.log('  ×', name, '—', e.message); }
};
const IN = { business: 'Posty', dna: null };

console.log('== (a) Muletilla de cuerpo: ¿sabías que como apertura de oración ==');
ok('id 113 real: sabías-que abriendo el caption se rechaza', () => {
  const cap = '¿Sabías que un community manager humano te puede salir $300.000 al mes? 😱\n\nCon Posty tenés tu semana armada por mucho menos: escribinos por DM.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/sabías que|muletilla de cuerpo/i.test(chk.reason), chk.reason);
});
ok('id 407 real: sabías-que abriendo la SEGUNDA oración se rechaza', () => {
  const cap = 'Otra semana sin publicar es otra semana en la que vende tu competencia directa.\n\n¿Sabías que con Posty tu semana sale armada hoy? Escribinos por DM y la dejamos lista.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/muletilla de cuerpo/i.test(chk.reason), chk.reason);
});
ok('control: sabías-que subordinado (no abre oración) NO se rechaza por este gate', () => {
  const cap = 'Maru repite lo que le dijo una clienta ayer: que no sabías que había combos nuevos para la semana.\n\nPasá por el local hoy y llevate el tuyo calentito.';
  const chk = gen.captionPasses(cap, { business: 'Dietética Maru', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (b) Vacío: superlativo sin dato + frase quemada ==');
ok('id 407 real: "se merece lo mejor" sin dato se rechaza', () => {
  const cap = 'El día de mamá se merece lo mejor, sin vueltas ni frases hechas de folleto.\n\nPasá por el local hoy y elegí el regalo con tiempo.';
  const chk = gen.captionPasses(cap, { business: 'Regalería Luz', dna: null });
  assert.strictEqual(chk.ok, false);
  assert.ok(/superlativo vacío/i.test(chk.reason), chk.reason);
});
ok('id 423 real: "hace la diferencia" se rechaza', () => {
  const cap = 'La madera que hace la diferencia en cada mueble que sale del taller.\n\nPasá por el local hoy y mirá los modelos nuevos en persona.';
  const chk = gen.captionPasses(cap, { business: 'De otro tiempo', dna: null });
  assert.strictEqual(chk.ok, false);
  assert.ok(/hace la diferencia/i.test(chk.reason), chk.reason);
});
ok('control: superlativo CON dato concreto pasa', () => {
  const cap = 'El mejor regalo para mamá sale $12.500 y lo armamos hoy mismo en el local, con moño y tarjeta.\n\nPasá por el local hoy y reservá el tuyo.';
  const chk = gen.captionPasses(cap, { business: 'Regalería Luz', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (c) Repetición intra-semana del dispositivo de apertura ==');
const PREV_CUANTAS = '¿Cuántas veces te pasó que te quedaste sin ideas para tu Instagram? 🤔\n\nCon Posty eso no pasa más: escribinos por DM.';
const OTRO_CUANTAS = '¿Cuántas veces te agarró una fecha importante sin nada preparado? 🎃\n\nCon Posty no pasa más: escribinos por DM y armamos tu semana.';
ok('sin anterior, el "¿cuántas veces…" pasa (no es frase prohibida en sí)', () => {
  const chk = gen.captionPasses(OTRO_CUANTAS, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('con un anterior de la misma semana con el mismo dispositivo, se rechaza', () => {
  const chk = gen.captionPasses(OTRO_CUANTAS, { ...IN, prevCaptions: [PREV_CUANTAS] });
  assert.strictEqual(chk.ok, false);
  assert.ok(/misma semana|intra/i.test(chk.reason), chk.reason);
});
ok('control intra-semana: apertura distinta con el mismo anterior pasa', () => {
  const cap = 'El freno de mano es tuyo: vos decidís qué sale y qué no en tu cuenta, siempre.\n\nEscribinos por DM y te mostramos cómo queda tu semana.';
  const chk = gen.captionPasses(cap, { ...IN, prevCaptions: [PREV_CUANTAS] });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: caption limpio de referencia sigue pasando (sin regresión)', () => {
  const cap = 'El pan de masa madre sale del horno a las 8 en punto.\n\nHarina, agua, sal y 18 horas de fermentación. Nada más.\n\nPasá por el local hoy y llevate el tuyo calentito.';
  const chk = gen.captionPasses(cap, { business: 'Panadería La Espiga', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});


console.log('== (d) Tuteo inequívoco (CUERPO-57, M82 — id 413 real) ==');
ok('id 413 original: "¿Te imaginas…?" se rechaza por tuteo', () => {
  const cap = '¿Te imaginas que tu Instagram brille en Halloween? 🎃\n\nCon Posty tu semana sale armada hoy con tus fotos: escribinos por DM.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/tuteo/i.test(chk.reason), chk.reason);
});
ok('variantes: te quieres / te tienes / te puedes también se rechazan', () => {
  for (const frag of ['te quieres quedar sin publicar otra semana', 'te tienes que encargar de todo el Instagram', 'te puedes perder la fecha que más vende']) {
    const cap = `Si ${frag}, el problema no es tu negocio: es el tiempo.\n\nEscribinos por DM y armamos tu semana con tus fotos.`;
    const chk = gen.captionPasses(cap, IN);
    assert.strictEqual(chk.ok, false, frag);
    assert.ok(/tuteo/i.test(chk.reason), chk.reason);
  }
});
ok('control voseo: "¿Te imaginás…?" pasa', () => {
  const cap = '¿Te imaginás que tu Instagram brille en Halloween? 🎃\n\nCon Posty tu semana sale armada hoy con tus fotos: escribinos por DM.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control cita: "te quiero / te puedo mostrar" NO es tuteo y pasa', () => {
  const cap = 'Te quiero mostrar cómo queda tu semana armada con tus fotos y tus colores, y te puedo armar la primera hoy.\n\nEscribinos por DM y la ves.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (e) Dispositivo repetido FUERA de la apertura (CUERPO-57 — id 418 real) ==');
const CAP_418 = 'Nuestras mesas terminan siendo el centro de la casa 🏡\n\n¿Cuántas veces te pasó que entrás a una casa y ves una mesa que te enamora?\n\nPasá por el local hoy y mirá las mesas nuevas en persona.'; // formato REAL del id 418: la fórmula vive en su propio bloque (con las dos oraciones en una línea, el lint de empalmes la frena antes, por otra puerta)
ok('id 418: la familia ya usada en la semana no reaparece como segunda oración', () => {
  const chk = gen.captionPasses(CAP_418, { business: 'De otro tiempo', dna: null, prevCaptions: [PREV_CUANTAS] });
  assert.strictEqual(chk.ok, false);
  assert.ok(/fuera de la apertura/i.test(chk.reason), chk.reason);
});
ok('control: la misma segunda oración SIN uso previo en la semana pasa', () => {
  const chk = gen.captionPasses(CAP_418, { business: 'De otro tiempo', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (f) Lenguaje corporativo: "potenciar" (CUERPO-CORP, M90 — id 114 real) ==');
ok('id 114 real: "¿Te gustaría potenciar tu mejor posteo…?" se rechaza', () => {
  const cap = '¿Te gustaría potenciar tu mejor posteo y llegar a más personas? 🚀\n\nCon Posty identifico el posteo que más rindió y te propongo empujarlo con pauta, con el tope que vos fijás.\n\nEscribinos por DM y lo vemos juntos.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/corporativo|potenciar/i.test(chk.reason), chk.reason);
});
ok('variante imperativa: "Potenciá tu cuenta…" también se rechaza', () => {
  const cap = 'Potenciá tu cuenta esta semana y llegá a más clientes con el posteo que ya te rindió en el local.\n\nEscribinos por DM y te mostramos cuál es.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/corporativo|potenciar/i.test(chk.reason), chk.reason);
});
ok('control sustantivo legítimo: "la potencia del motor" NO es el verbo de folleto y pasa', () => {
  const cap = 'La potencia se mide en el banco de pruebas, no de oído: este motor quedó en 180 caballos reales después del service completo.\n\nPasá por el local hoy y dejá tu turno reservado.';
  const chk = gen.captionPasses(cap, { business: 'Taller Mecánico Sur', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la versión concreta del 114 (sin "potenciar") pasa', () => {
  const cap = '¿Querés que tu mejor posteo lo vea más gente esta semana? 🚀\n\nCon Posty identifico el posteo que más rindió y te propongo empujarlo con pauta, con el tope que vos fijás.\n\nEscribinos por DM y lo vemos juntos.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (g) Binomio vacío de folleto (CUERPO-BINOMIO — id 422 real) ==');
ok('id 422 real: "elegancia y funcionalidad" se rechaza', () => {
  const cap = 'Nuevos muebles de oficina que combinan elegancia y funcionalidad. 🪑✨\n\nTransformá tu espacio de trabajo con escritorios a medida, en la madera que elijas.\n\nPasá por el taller y lo dibujamos sobre tus medidas.';
  const chk = gen.captionPasses(cap, { business: 'De otro tiempo', dna: null });
  assert.strictEqual(chk.ok, false);
  assert.ok(/binomio/i.test(chk.reason), chk.reason);
});
ok('variante: "calidad y diseño" también se rechaza', () => {
  const cap = 'Trabajamos con calidad y diseño en cada mueble que sale del taller, uno por uno y a medida.\n\nPasá por el local y mirá los últimos terminados en persona.';
  const chk = gen.captionPasses(cap, { business: 'De otro tiempo', dna: null });
  assert.strictEqual(chk.ok, false);
  assert.ok(/binomio/i.test(chk.reason), chk.reason);
});
ok('control par concreto: "mesas y sillas" NO es binomio vacío y pasa', () => {
  const cap = 'Salieron las mesas y sillas nuevas del taller: roble macizo, patas reforzadas y listas para entregar esta semana.\n\nPasá por el local y probá la altura en persona.';
  const chk = gen.captionPasses(cap, { business: 'De otro tiempo', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: la versión concreta del 422 (material + medida) pasa', () => {
  const cap = 'Nuevos escritorios de oficina: tapa de roble macizo de 4 cm y cajonera que se hace a tu medida. 🪑\n\nPasá por el taller y lo dibujamos sobre tus medidas.';
  const chk = gen.captionPasses(cap, { business: 'De otro tiempo', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});

console.log('== (h) Lista truncada (LISTA-TRUNCADA — ids 449/436 reales, 2026-10-24) ==');
ok('id 449 reconstruido con CTA: cierra con «3.» vacío y se rechaza', () => {
  const cap = '¿Qué posteo hoy? 🤔\nSi querés que tu negocio brille en Instagram, seguí estas ideas. 1. Un posteo mostrando tu producto estrella. 2. Una historia detrás de tu negocio. 3.\nEscribime por DM y lo armamos.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/lista truncada/i.test(chk.reason), chk.reason);
});
ok('id 436 reconstruido: anuncia «los 3 errores…: 1.» y salta al CTA — se rechaza', () => {
  const cap = 'El secreto está en un buen servicio.\nTe comparto los 3 errores más comunes al elegir un servicio: 1.\nReservá tu lugar en Gesty hoy mismo. Escribime por DM.';
  const chk = gen.captionPasses(cap, { business: 'Gesty', dna: null });
  assert.strictEqual(chk.ok, false);
  assert.ok(/lista truncada/i.test(chk.reason), chk.reason);
});
ok('ítem vacío a mitad de caption (salto de línea tras «2.») se rechaza', () => {
  const cap = 'Tres ideas para tu semana 📅\n1. Mostrá tu producto estrella.\n2.\nEscribime por DM y lo armamos juntos esta semana.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/lista truncada/i.test(chk.reason), chk.reason);
});
ok('control: lista COMPLETA con los 3 ítems escritos pasa', () => {
  const cap = 'Tres ideas para tu semana 📅\n1. Mostrá tu producto estrella. 2. Contá cómo trabajás. 3. Cerrá con una promo real.\nEscribime por DM y lo armamos.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('control: precio con decimales «$12.500» no es ítem truncado y pasa', () => {
  const cap = 'Salió la docena de medialunas a $12.500 para retirar hoy por el local, recién horneadas como siempre.\n\nPasá por el local hoy y llevate la tuya calentita.';
  const chk = gen.captionPasses(cap, { business: 'Lo de Marta', dna: null });
  assert.strictEqual(chk.ok, true, chk.reason);
});
ok('id 448 real pasa por la puerta vía lint (g): empalme h11 sin puntuación', () => {
  const cap = 'Lo que nos dijo una clienta después de probar Unite a nuestra comunidad de negocios en Posty.\n\n¿Te imaginás tener un Instagram activo sin mover un dedo? Escribime por DM y contame qué te gustaría lograr.';
  const chk = gen.captionPasses(cap, IN);
  assert.strictEqual(chk.ok, false);
  assert.ok(/empalm/i.test(chk.reason), chk.reason);
});

console.log('== (i) Empalme fórmula + imperativo tras preposición (LINT v6 — id 454 real, 2026-10-25) ==');
ok('id 454 real pasa por la puerta vía lint (h): «cometen con Organizá…» se rechaza', () => {
  const cap = 'El error que casi todos cometen con Organizá tu agenda como un pro (y cómo lo evitamos en Gesty)\n\n¿Cuántas veces te pasó que te perdés entre reuniones y tareas pendientes? 😅\nTener una agenda organizada es clave. Escribime por DM y empezamos.';
  const chk = gen.captionPasses(cap, { business: 'Gesty', dna: null });
  assert.strictEqual(chk.ok, false);
  assert.ok(/empalm/i.test(chk.reason), chk.reason);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
