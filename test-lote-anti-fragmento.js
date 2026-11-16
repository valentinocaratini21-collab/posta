'use strict';
/* Suite LOTE ANTI-FRAGMENTO DE ANCLAS (orden directa de Valentino,
 * 16/11/2026 — «corregilo cuanto antes»).
 *
 * La corrida ×10 #1 (@sottosottoatl, en vivo) probó que la duda de
 * la estrella ofrece como opciones de un toque fragmentos del texto
 * cosechado: «Easter», «Dinner», «Easter Sunday April» y
 * «Melanosporum Vitt» — ninguno es un producto del negocio; la
 * estrella real (Tortelli di Michelangelo) hubo que escribirla por
 * «Other». La misma clase en @chipotle: «BOGO»/«Canada»/«ANY».
 * El lote instala la PUERTA POSITIVA de las opciones de la duda
 * (clientDigest.starOptionOk): una opción es ofrecible solo si
 * nombra un producto vendible de ESE negocio, corroborado por la
 * maquinaria de evidencia de nombre (brazo A) o por su forma de
 * nombre de producto (brazo B). Con menos de 2 candidatos reales,
 * la duda va a TEXTO LIBRE (libre: true) — la salida que el front
 * ya conoce detrás de «Otro» — en vez de opciones inventadas.
 *
 * Fixtures:
 *  A · @sottosottoatl FIEL al digest vivo del 16/11 (productos y
 *      productos_nombrados con fuente 'caption', la inferida
 *      «Easter» al 0,62): ningún fragmento sobrevive → texto libre.
 *  B · @chipotle (BOGO/Canada/ANY): ninguno sobrevive → texto libre.
 *  C · caso sano (pastelería con catálogo web): las opciones reales
 *      se siguen ofreciendo — la duda sana no se degrada.
 *  D · caso sano de una palabra (florería, estrella corroborada por
 *      su web): «Bouquets» se ofrece — la palabra del negocio manda.
 *  E · la forma (brazo B) nombre por nombre.
 *  F · el conflicto del dueño: su palabra jamás se filtra; el ancla
 *      fragmento no compite contra ella.
 *  G · el loop «Posty pregunta»: la confirmación «Sí, es X» y los
 *      huecos pasan la misma puerta.
 *  H · los frentes de la prueba: la rama libre y la guarda del skip.
 *  I · CONTROL contra la base (LOTE_BASE_DIR): la base reproduce el
 *      defecto — las opciones SON los fragmentos.
 * Uso: node test-lote-anti-fragmento.js
 * Control: LOTE_BASE_DIR=<árbol prístino> node test-lote-anti-fragmento.js */
const fs = require('fs');
const path = require('path');

const REL = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.resolve(REL, '..', 'base');
const cd = require(path.join(REL, 'client-digest'));
const pq = require(path.join(REL, 'posty-questions'));
const PRUEBA_SRC = fs.readFileSync(path.join(REL, 'public', 'prueba.html'), 'utf8');
const EN_PRUEBA_SRC = fs.readFileSync(path.join(REL, 'public', 'en-prueba.html'), 'utf8');
const tieneBase = fs.existsSync(path.join(BASE, 'client-digest.js'));
const cdB = tieneBase ? require(path.join(BASE, 'client-digest')) : null;
const pqB = tieneBase ? require(path.join(BASE, 'posty-questions')) : null;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function seccion(s) { console.log('\n[' + s + ']'); }

/* ------------------------------------------------ fixtures */
/* A · El digest VIVO de @sottosottoatl (leído de su semana de
 * prueba el 16/11): los cinco «productos» son ítems de caption —
 * la lista de opciones que la duda ofreció en vivo, textual. */
function digestSotto() {
  return {
    business: 'Sotto Sotto', category: 'gastronomia',
    productos: [
      { nombre: 'Easter', fuente: 'caption' },
      { nombre: 'Dinner', fuente: 'caption' },
      { nombre: 'Easter Sunday April', fuente: 'caption' },
      { nombre: 'Melanosporum Vitt', fuente: 'caption' },
      { nombre: 'Friends It', fuente: 'caption' },
    ],
    servicios: [],
    productos_nombrados: [
      { nombre: 'Easter', fuente: 'caption', menciones: 2, clases: ['frase', 'repetida'] },
      { nombre: 'Dinner', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'Easter Sunday April', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'Melanosporum Vitt', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'Friends It', fuente: 'caption', menciones: 1, clases: ['frase', 'sujeto'] },
      { nombre: 'France', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'Digital Gift', fuente: 'caption', menciones: 1, clases: ['frase'] },
    ],
    inferred_star: { item: 'Easter', confidence: 0.62, evidence: ['aparece en 2 de sus últimos 6 posteos'], score: 4 },
    question_candidates: [
      { tipo: 'estrella', item: 'Easter', debil: true, texto: 'tu producto estrella es Easter?' },
    ],
  };
}
/* B · @chipotle: la mecánica de la promo y el selector de país. */
function digestChipotle() {
  return {
    business: 'Chipotle', category: 'gastronomia',
    productos: [
      { nombre: 'BOGO', fuente: 'caption' },
      { nombre: 'Canada', fuente: 'caption' },
      { nombre: 'ANY', fuente: 'caption' },
    ],
    servicios: [],
    productos_nombrados: [
      { nombre: 'BOGO', fuente: 'caption', menciones: 2, clases: ['frase', 'repetida'] },
      { nombre: 'Canada', fuente: 'caption', menciones: 1, clases: ['frase'] },
      { nombre: 'ANY', fuente: 'caption', menciones: 1, clases: ['frase'] },
    ],
    inferred_star: { item: 'BOGO', confidence: 0.55, evidence: ['aparece en 2 de sus últimos 6 posteos'], score: 3 },
    question_candidates: [
      { tipo: 'estrella', item: 'BOGO', debil: true, texto: 'tu producto estrella es BOGO?' },
    ],
  };
}
/* C · Caso sano: pastelería con catálogo web legible — productos
 * con nombre, precio y superficie externa que los corrobora. */
function digestSano() {
  return {
    business: 'Patisserie Tomoko', category: 'gastronomia',
    productos: [
      { nombre: 'Berry Mille Crepe', precio: '$58', fuente: 'web-catalog' },
      { nombre: 'Hojicha Mille Crepe', precio: '$56', fuente: 'web-catalog' },
      { nombre: 'Yuzu Mousse', precio: '$14', fuente: 'web-catalog' },
    ],
    servicios: [],
    productos_nombrados: [
      { nombre: 'Berry Mille Crepe', fuente: 'web-catalog', menciones: 1, clases: ['catalogo', 'frase'] },
      { nombre: 'Hojicha Mille Crepe', fuente: 'web-catalog', menciones: 1, clases: ['catalogo', 'frase'] },
      { nombre: 'Yuzu Mousse', fuente: 'web-catalog', menciones: 1, clases: ['catalogo', 'frase'] },
    ],
    inferred_star: { item: 'Berry Mille Crepe', confidence: 0.8, evidence: ['catálogo web'], score: 6 },
    question_candidates: [
      { tipo: 'estrella', item: 'Berry Mille Crepe', debil: false, texto: 'tu producto estrella es Berry Mille Crepe?' },
    ],
  };
}
/* D · Caso sano de UNA palabra: la florería cuya estrella es un
 * sustantivo común corroborado por su propia web. */
function digestFloreria() {
  return {
    business: 'Rosehip Social Florist', category: 'floreria',
    productos: [
      { nombre: 'Bouquets', fuente: 'web' },
      { nombre: 'Wedding Bouquets', fuente: 'web' },
      { nombre: 'Centerpieces', fuente: 'web' },
    ],
    servicios: [],
    productos_nombrados: [
      { nombre: 'Bouquets', fuente: 'web', menciones: 1, clases: ['catalogo', 'frase'] },
      { nombre: 'Wedding Bouquets', fuente: 'web', menciones: 1, clases: ['catalogo', 'frase'] },
      { nombre: 'Centerpieces', fuente: 'web', menciones: 1, clases: ['catalogo', 'frase'] },
    ],
    inferred_star: { item: 'Bouquets', confidence: 0.7, evidence: ['su web'], score: 5 },
    question_candidates: [
      { tipo: 'estrella', item: 'Bouquets', debil: false, texto: 'tu producto estrella es Bouquets?' },
    ],
  };
}

/* ------------------------------------------------ A · sottosottoatl */
seccion('A · la corrida ×10 #1 — ningún fragmento sobrevive');
{
  const d = digestSotto();
  const fragmentos = ['Easter', 'Dinner', 'Easter Sunday April', 'Melanosporum Vitt', 'Friends It', 'France'];
  ok(fragmentos.every((x) => cd.starOptionOk(d, x) === false), 'A1 la puerta positiva frena cada fragmento de la corrida', fragmentos.filter((x) => cd.starOptionOk(d, x)));
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && q.tipo === 'estrella', 'A2 la duda EXISTE y frena (no se salta en silencio)', q);
  ok(!!q && q.libre === true && Array.isArray(q.opciones) && q.opciones.length === 0, 'A3 sin candidatos reales la pregunta es de TEXTO LIBRE (libre, sin opciones)', q);
  ok(!!q && /sell the most/.test(q.texto), 'A4 el texto EN es la pregunta de texto libre', q && q.texto);
  const qEs = cd.trialQuestionFor(d, { lang: 'es' });
  ok(!!qEs && qEs.libre === true && /más vendés/.test(qEs.texto), 'A5 el texto ES es la pregunta de texto libre', qEs && qEs.texto);
  ok(cd.trialQuestionFor(d, { lang: 'en', answered: { estrella: true } }) === null, 'A6 lo respondido no se repregunta');
}

/* ------------------------------------------------ B · chipotle */
seccion('B · chipotle — la promo y el selector tampoco son opciones');
{
  const d = digestChipotle();
  ok(['BOGO', 'Canada', 'ANY'].every((x) => cd.starOptionOk(d, x) === false), 'B1 BOGO/Canada/ANY frenados por la puerta');
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && q.libre === true && q.opciones.length === 0, 'B2 la duda cae a texto libre', q);
}

/* ------------------------------------------------ C · caso sano */
seccion('C · caso sano — la duda sana NO se degrada');
{
  const d = digestSano();
  ok(['Berry Mille Crepe', 'Hojicha Mille Crepe', 'Yuzu Mousse'].every((x) => cd.starOptionOk(d, x) === true), 'C1 los productos reales corroborados pasan la puerta');
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && q.tipo === 'estrella' && !q.libre, 'C2 la pregunta sigue siendo de opciones (no cae a texto libre)', q);
  ok(!!q && q.item === 'Berry Mille Crepe' && q.texto === 'Is Berry Mille Crepe your star product?', 'C3 la pregunta encabeza con la estrella real', q);
  // La deduplicación por familia es la de siempre (sameItemName:
  // «Berry Mille Crepe» y «Hojicha Mille Crepe» cuentan como la
  // misma familia) — idéntica en la base: lo que este lote garantiza
  // es que TODA opción ofrecida es un producto real del negocio.
  ok(!!q && q.opciones.length >= 2 && q.opciones.every((o) => ['Berry Mille Crepe', 'Hojicha Mille Crepe', 'Yuzu Mousse'].includes(o)), 'C4 toda opción ofrecida es un producto real del negocio', q && q.opciones);
}

/* ------------------------------------------------ D · una palabra real */
seccion('D · la estrella de una palabra, corroborada, se ofrece');
{
  const d = digestFloreria();
  ok(cd.starOptionOk(d, 'Bouquets') === true, 'D1 «Bouquets» pasa por corroboración (su web)');
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && !q.libre && q.opciones.includes('Bouquets') && q.opciones.length >= 2, 'D2 la duda ofrece las opciones reales de la florería', q);
}

/* ------------------------------------------------ E · la forma */
seccion('E · brazo B — la forma de nombre de producto, nombre por nombre');
{
  // Digest con el campo de nombrados PRESENTE pero vacío: el brazo
  // A no corrobora a nadie y la decisión es pura forma.
  const dVacio = { productos: [], servicios: [], productos_nombrados: [] };
  const reales = ['Tortelli di Michelangelo', 'Skin Fade', 'Berry Mille Crepe', 'Dan Dan Noodles', 'Bouquets', 'Croissants'];
  ok(reales.every((x) => cd.isProductNameForm(x) === true), 'E1 los nombres de producto reales tienen la forma', reales.filter((x) => !cd.isProductNameForm(x)));
  const frags = ['Easter', 'Easter Sunday April', 'Melanosporum Vitt', 'Dinner', 'BOGO', 'Canada', 'ANY', 'Friends It', 'Infused'];
  ok(frags.every((x) => cd.isProductNameForm(x) === false), 'E2 ningún fragmento tiene la forma', frags.filter((x) => cd.isProductNameForm(x)));
  ok(cd.starOptionOk(dVacio, 'From USD') === false, 'E3 el fragmento de precio sigue frenado (la barra negativa manda primero)');
  ok(cd.starOptionOk(dVacio, 'Tortelli di Michelangelo') === true, 'E4 sin corroboración, la forma alcanza para OFRECER (nunca para afirmar)');
}

/* ------------------------------------------------ F · el conflicto */
seccion('F · el conflicto del dueño — su palabra no se filtra, el fragmento no compite');
{
  const d = digestSotto();
  d.question_candidates = [
    { tipo: 'estrella', motivo: 'estrella_dueno_sin_encaje', declarada: 'Tortelli di Michelangelo', nombre: 'Tortelli di Michelangelo', item: 'Easter', debil: true, texto: 'nos dijiste que tu estrella es Tortelli di Michelangelo, pero en lo que leímos de tu negocio el que manda es Easter — ¿cuál es tu producto estrella?' },
  ];
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && q.motivo === 'estrella_dueno_sin_encaje', 'F1 la pregunta del conflicto se sirve', q);
  ok(!!q && q.opciones[0] === 'Tortelli di Michelangelo', 'F2 la primera opción es la palabra literal del dueño', q && q.opciones);
  ok(!!q && !q.opciones.includes('Easter') && !q.opciones.includes('Dinner') && !q.opciones.includes('Melanosporum Vitt'), 'F3 ningún fragmento compite contra su palabra', q && q.opciones);
}

/* ------------------------------------------------ G · Posty pregunta */
seccion('G · el loop semanal — la misma puerta en la otra superficie');
{
  const dS = digestSotto();
  const candsS = pq.candidatesFor(dS, {}, {});
  ok(!candsS.some((c) => c.qkey && c.qkey.indexOf('estrella-inf:') === 0), 'G1 la confirmación «Sí, es Easter» no se ofrece', candsS.map((c) => c.qkey));
  const huecoMv = candsS.find((c) => c.qkey === 'hueco:mas_vendido');
  ok(!!huecoMv && Array.isArray(huecoMv.opciones) && huecoMv.opciones.length === 0 && huecoMv.allow_text === true, 'G2 el hueco «qué se vende más» queda en texto libre, sin opciones fragmento', huecoMv);
  const dSano = digestSano();
  const candsOk = pq.candidatesFor(dSano, {}, {});
  const inf = candsOk.find((c) => c.qkey && c.qkey.indexOf('estrella-inf:') === 0);
  ok(!!inf && inf.opciones.some((o) => o.label === 'Sí, es Berry Mille Crepe'), 'G3 con estrella real corroborada, la confirmación se ofrece como siempre', inf);
}

/* ------------------------------------------------ H · los frentes */
seccion('H · los frentes de la prueba — la rama libre y el skip');
{
  ok(PRUEBA_SRC.includes('p.libre') && PRUEBA_SRC.includes('starWrap.hidden = false'), 'H1 ES: showAsk tiene la rama de texto libre');
  ok(EN_PRUEBA_SRC.includes('p.libre') && EN_PRUEBA_SRC.includes('starWrap.hidden = false'), 'H2 EN: showAsk tiene la rama de texto libre');
  ok(PRUEBA_SRC.includes('!starWrap.hidden && !star && !askSkipStar'), 'H3 ES: «Seguir sin responder» no choca con la guarda del campo estrella');
  ok(EN_PRUEBA_SRC.includes('!starWrap.hidden && !star && !askSkipStar'), 'H4 EN: «Seguir sin responder» no choca con la guarda del campo estrella');
  ok(PRUEBA_SRC.includes("bOtro.textContent = 'Otro'") && EN_PRUEBA_SRC.includes("bOtro.textContent = 'Other'"), 'H5 la salida «Otro/Other» de las preguntas con opciones queda intacta');
}

/* ------------------------------------------------ I · control base */
seccion('I · control contra la base (la base reproduce el defecto)');
if (tieneBase) {
  ok(typeof cdB.starOptionOk !== 'function', 'I1 base: la puerta positiva no existe');
  const qB = cdB.trialQuestionFor(digestSotto(), { lang: 'en' });
  ok(!!qB && Array.isArray(qB.opciones) && ['Easter', 'Dinner', 'Easter Sunday April', 'Melanosporum Vitt'].every((x) => qB.opciones.includes(x)), 'I2 base: las opciones de Sotto Sotto SON los cuatro fragmentos (el defecto, textual)', qB && qB.opciones);
  ok(!!qB && !qB.libre, 'I3 base: no existe la salida de texto libre para la duda');
  const qBc = cdB.trialQuestionFor(digestChipotle(), { lang: 'en' });
  ok(!!qBc && ['BOGO', 'Canada', 'ANY'].every((x) => qBc.opciones.includes(x)), 'I4 base: chipotle ofrecía BOGO/Canada/ANY', qBc && qBc.opciones);
  const candsB = pqB.candidatesFor(digestSotto(), {}, {});
  ok(candsB.some((c) => c.qkey && c.qkey.indexOf('estrella-inf:') === 0), 'I5 base: el loop semanal ofrecía «Sí, es Easter»');
} else {
  console.log('  (sin LOTE_BASE_DIR: se salta el control)');
}

console.log('\n════════════════════════════════════════════════════');
console.log(`LOTE ANTI-FRAGMENTO DE ANCLAS: ${pass} ok · ${fail} MAL`);
if (failures.length) { console.log('Fallaron:\n - ' + failures.join('\n - ')); process.exit(1); }
