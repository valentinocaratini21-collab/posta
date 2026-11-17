'use strict';
/* Suite LOTE CONFIRMACIÓN-CORROBORADA (fallo del tablero 16/11/2026
 * tras la corrida ×10 #2; orden de Valentino 16/11 20:09 — «tenemos
 * que tener días de 5/5 todo perfecto»: la pieza sube antes de las
 * corridas 4–8, no espera a la tercera ocurrencia).
 *
 * El caso: @tamalehouseatx (guest 114) tiene UN posteo — un collage
 * promocional. La primera duda de estrella cayó a texto libre y el
 * dueño declaró «Texas Sized Tamales». La TERCERA duda, la de
 * CONFIRMACIÓN (el conflicto estrella_dueno_sin_encaje: tu palabra
 * contra lo leído), ofreció como opciones de un toque las tres
 * frases del collage — «Match that length.», «World Cup»,
 * «Celebrate Father's Day» — junto a la respuesta del dueño.
 * MECANISMO (reproducido de punta a punta en esta suite): las tres
 * frases viven en digest.productos, pasan la puerta positiva de la
 * duda (starOptionOk) por el BRAZO B (isProductNameForm: multi-
 * palabra capitalizadas sin palabras de calendario/promo de las
 * listas) y entran a la confirmación por pushOpC — el ancla como
 * c.item de la candidata y las otras dos como rellenos — SIN
 * corroboración alguna (starNamedEvidenceOk = false: ninguna
 * superficie externa nombra producto alguno de este negocio).
 * LA CORRECCIÓN (la costura exacta: pushOpC de trialQuestionFor):
 * en la duda de CONFIRMACIÓN las opciones minadas exigen la pata de
 * CORROBORACIÓN — starOptionConfirmadaOk: las barras negativas de
 * starOptionOk y SOLO el brazo A. La palabra declarada del dueño no
 * se filtra nunca; si solo ella sobrevive, la duda sale con esa
 * sola opción válida (el front suma su «Otro» de siempre). La duda
 * REGULAR de estrella conserva el brazo B intacto (diseño de
 * ANTI-FRAGMENTO): ahí Posty aún no tiene la palabra del dueño y
 * ofrecer un nombre con forma de producto es la apuesta honesta.
 *
 * Fixtures:
 *  A · la puerta de la confirmación, nombre por nombre.
 *  B · @tamalehouseatx FIEL a la corrida: digest forma-caso →
 *      questionCandidatesOf pare el conflicto → trialQuestionFor
 *      sirve la confirmación sin fragmentos.
 *  C · confirmación sana: el ancla corroborada por el catálogo web
 *      SÍ compite contra la declarada; la frase de evento del mismo
 *      digest, no.
 *  D · invariante: la duda regular sigue ofreciendo por forma
 *      (brazo B) un producto real sin corroboración.
 *  E · CONTROL contra la base (LOTE_BASE_DIR): la base reproduce
 *      el defecto — las opciones de la confirmación SON las frases.
 * Uso: node test-lote-confirmacion-corroborada.js
 * Control: LOTE_BASE_DIR=<árbol prístino> node test-lote-confirmacion-corroborada.js
 * (y copiada al árbol prístino, los casos [FIX] fallan). */
const fs = require('fs');
const os = require('os');
const path = require('path');
// Las cadenas de require del árbol pueden inicializar la DB en
// ./data relativo al cwd: la suite jamás ensucia el árbol.
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-cc-data-'));

const REL = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.resolve(REL, '..', 'base');
const cd = require(path.join(REL, 'client-digest'));
const tieneBase = fs.existsSync(path.join(BASE, 'client-digest.js'));
const cdB = tieneBase ? require(path.join(BASE, 'client-digest')) : null;
// En el árbol prístino la puerta nueva no existe: los casos [FIX]
// tienen que fallar en limpio (MAL), no explotar.
const confirmadaOk = (d, x) => (typeof cd.starOptionConfirmadaOk === 'function') ? cd.starOptionConfirmadaOk(d, x) : false;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function seccion(s) { console.log('\n[' + s + ']'); }

const FRASES = ['Match that length.', 'World Cup', "Celebrate Father's Day"];

/* ------------------------------------------------ fixtures */
/* B · El digest FORMA-TAMALE: único posteo = collage promocional,
 * las tres frases minadas como productos (fuente caption), el
 * minero sin corroborar NADA (ninguna superficie externa — catálogo,
 * web, ADN, tienda — nombra producto alguno: productos_nombrados
 * vacío) y la estrella declarada por el dueño en texto libre,
 * depositada donde la puerta la deposita (dueno.mas_vendido /
 * onboarding.producto_estrella). Con esta forma, el camino real de
 * la corrida se reproduce entero: duenoStarConflictoOf encuentra su
 * ancla en productos (namedItemCorroborated no la frena: no hay
 * entrada nombrada que la desmienta) y la candidata del conflicto
 * nace en questionCandidatesOf, como la recomputación de la ruta
 * (server.js) la pare tras mapear la declaración. */
function digestTamale() {
  return {
    business: 'Tamale House East', category: 'gastronomia',
    productos: FRASES.map((n) => ({ nombre: n, fuente: 'caption' })),
    servicios: [],
    productos_nombrados: [],
    dueno: { mas_vendido: 'Texas Sized Tamales' },
    onboarding: { producto_estrella: 'Texas Sized Tamales' },
  };
}
/* C · Confirmación sana: la lectura SÍ trae un producto real
 * corroborado por el catálogo web (el ancla del conflicto) y una
 * frase de evento del mismo feed convive en productos. */
function digestConfirmacionSana() {
  return {
    business: 'Patisserie Tomoko', category: 'gastronomia',
    productos: [
      { nombre: 'Berry Mille Crepe', fuente: 'web-catalog' },
      { nombre: 'World Cup', fuente: 'caption' },
    ],
    servicios: [],
    productos_nombrados: [
      { nombre: 'Berry Mille Crepe', fuente: 'web-catalog', menciones: 1, clases: ['catalogo', 'frase'] },
      { nombre: 'World Cup', fuente: 'caption', menciones: 1, clases: ['frase'] },
    ],
    dueno: { mas_vendido: 'Croissant de almendras' },
    onboarding: { producto_estrella: 'Croissant de almendras' },
  };
}
/* D · La duda regular con productos reales SOLO por forma: sin
 * corroboración (productos_nombrados vacío), la inferida y su
 * relleno tienen forma de nombre de producto. */
function digestRegularForma() {
  return {
    business: 'Noodle House', category: 'gastronomia',
    productos: [
      { nombre: 'Dan Dan Noodles', fuente: 'caption' },
      { nombre: 'Mapo Tofu', fuente: 'caption' },
    ],
    servicios: [],
    productos_nombrados: [],
    inferred_star: { item: 'Dan Dan Noodles', confidence: 0.6, evidence: ['aparece en 3 de sus últimos posteos'], score: 4 },
    question_candidates: [
      { tipo: 'estrella', item: 'Dan Dan Noodles', debil: true, texto: 'tu producto estrella es Dan Dan Noodles?' },
    ],
  };
}

/* ------------------------------------------------ A · la puerta */
seccion('A · la puerta de la confirmación — corroboración o nada');
{
  const d = digestTamale();
  ok(typeof cd.starOptionConfirmadaOk === 'function', 'A1 [FIX] la puerta de la confirmación existe (starOptionConfirmadaOk)');
  ok(FRASES.every((x) => confirmadaOk(d, x) === false), 'A2 [FIX] ninguna de las tres frases del collage pasa la puerta de la confirmación', FRASES.filter((x) => confirmadaOk(d, x)));
  ok(FRASES.every((x) => cd.starOptionOk(d, x) === true), 'A3 las tres frases SÍ pasan la puerta regular (brazo B): la fuga era de superficie, no de esa puerta', FRASES.filter((x) => !cd.starOptionOk(d, x)));
  ok(FRASES.every((x) => cd.starNamedEvidenceOk(d, x) === false), 'A4 ninguna de las tres tiene corroboración (ninguna superficie externa las nombra)');
  const dSana = digestConfirmacionSana();
  ok(confirmadaOk(dSana, 'Berry Mille Crepe') === true, 'A5 un producto corroborado por su catálogo web SÍ pasa la puerta de la confirmación');
  const dReg = digestRegularForma();
  ok(confirmadaOk(dReg, 'Dan Dan Noodles') === false && cd.starOptionOk(dReg, 'Dan Dan Noodles') === true, 'A6 un nombre real con forma pero sin corroboración NO pasa la confirmación — y sí la regular');
}

/* ------------------------------------------------ B · el caso */
seccion('B · @tamalehouseatx — la confirmación, de punta a punta');
{
  const d = digestTamale();
  d.question_candidates = cd.questionCandidatesOf(d);
  const cand = (d.question_candidates || []).find((c) => c.motivo === 'estrella_dueno_sin_encaje');
  ok(!!cand && cand.declarada === 'Texas Sized Tamales', 'B1 el camino real pare la candidata del conflicto con la palabra del dueño', d.question_candidates);
  ok(!!cand && FRASES.some((f) => cd.sameItemName(cand.item, f)), 'B2 el ancla del conflicto es una de las frases minadas (el mecanismo, textual)', cand && cand.item);
  // La puerta pregunta de nuevo: estrella y rubro ya respondidos,
  // el conflicto todavía no (así llegó la tercera duda de la corrida).
  const q = cd.trialQuestionFor(d, { lang: 'en', answered: { estrella: true, rubro: true } });
  ok(!!q && q.motivo === 'estrella_dueno_sin_encaje', 'B3 [FIX] la duda de confirmación se sirve (no desaparece ni se inventa otra)', q);
  ok(!!q && !FRASES.some((f) => (q.opciones || []).some((o) => cd.sameItemName(o, f))), 'B4 [FIX] NINGUNA de las tres frases es opción de la confirmación', q && q.opciones);
  ok(!!q && q.opciones[0] === 'Texas Sized Tamales', 'B5 [FIX] la primera opción es la palabra literal del dueño (jamás se filtra)', q && q.opciones);
  ok(!!q && q.opciones.length === 1, 'B6 [FIX] tras el filtro queda solo la declarada: la duda sale con esa sola opción válida', q && q.opciones);
  ok(cd.trialQuestionFor(d, { lang: 'en', answered: { estrella: true, rubro: true, estrella_conflicto: true } }) === null, 'B7 el conflicto respondido no se repregunta');
}

/* ------------------------------------------------ C · sana */
seccion('C · confirmación sana — la lectura corroborada sí compite');
{
  const d = digestConfirmacionSana();
  d.question_candidates = cd.questionCandidatesOf(d);
  const cand = (d.question_candidates || []).find((c) => c.motivo === 'estrella_dueno_sin_encaje');
  ok(!!cand && cand.item === 'Berry Mille Crepe', 'C1 el ancla del conflicto es el producto corroborado del catálogo', cand);
  const q = cd.trialQuestionFor(d, { lang: 'en', answered: { estrella: true, rubro: true } });
  ok(!!q && q.opciones.length === 2 && q.opciones[0] === 'Croissant de almendras' && q.opciones[1] === 'Berry Mille Crepe', 'C2 [FIX] declarada + lectura corroborada: las dos opciones reales, en ese orden', q && q.opciones);
  ok(!!q && !(q.opciones || []).includes('World Cup'), 'C3 [FIX] la frase de evento del mismo digest NO compite en la confirmación', q && q.opciones);
  ok(cd.starOptionOk(d, 'World Cup') === true, 'C4 la puerta regular sigue ofreciendo «World Cup» en ESTE digest (no cambió: la confirmación es otra puerta)');
}

/* ------------------------------------------------ D · invariante */
seccion('D · la duda REGULAR conserva el brazo B (ANTI-FRAGMENTO intacto)');
{
  const d = digestRegularForma();
  ok(cd.starNamedEvidenceOk(d, 'Dan Dan Noodles') === false && cd.starNamedEvidenceOk(d, 'Mapo Tofu') === false, 'D1 los productos del fixture no tienen corroboración (la forma es su único brazo)');
  const q = cd.trialQuestionFor(d, { lang: 'en' });
  ok(!!q && q.tipo === 'estrella' && !q.libre && q.opciones.includes('Dan Dan Noodles') && q.opciones.includes('Mapo Tofu'), 'D2 la duda regular ofrece los productos reales por forma, sin caer a texto libre', q);
  ok(!!q && q.texto === 'Is Dan Dan Noodles your star product?', 'D3 la duda regular encabeza con la inferida, como siempre', q && q.texto);
}

/* ------------------------------------------------ E · control base */
seccion('E · control contra la base (la base reproduce el defecto)');
if (tieneBase) {
  ok(typeof cdB.starOptionConfirmadaOk !== 'function', 'E1 base: la puerta de la confirmación no existe');
  const dB = digestTamale();
  dB.question_candidates = cdB.questionCandidatesOf(dB);
  const qB = cdB.trialQuestionFor(dB, { lang: 'en', answered: { estrella: true, rubro: true } });
  ok(!!qB && FRASES.every((f) => (qB.opciones || []).some((o) => cdB.sameItemName(o, f))), 'E2 base: las opciones de la confirmación SON las tres frases del collage (el defecto, textual)', qB && qB.opciones);
  ok(!!qB && qB.opciones[0] === 'Texas Sized Tamales' && qB.opciones.length === 4, 'E3 base: declarada + ancla + dos rellenos = la forma exacta de la corrida', qB && qB.opciones);
} else {
  console.log('  (sin LOTE_BASE_DIR: se salta el control)');
}

console.log('\n════════════════════════════════════════════════════');
console.log(`LOTE CONFIRMACIÓN-CORROBORADA: ${pass} ok · ${fail} MAL`);
if (failures.length) { console.log('Fallaron:\n - ' + failures.join('\n - ')); process.exit(1); }
