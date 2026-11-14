// test-lote-texto-tarjeta-voz.js — MICRO-LOTE TEXTO-TARJETA-VOZ (13/11):
// cambio de texto ordenado por Valentino con captura de la tarjeta viva.
// La tarjeta de la nota de voz de Subir (la puerta de pedir-de-cero,
// #pzSubirVozOp en subirView) decía «¿Algo más? / Si querés, contale a
// Posty con una nota de voz.» y no se entendía. Queda con sus palabras
// exactas:
//   Titular:  «¿Tenés una idea?»
//   Subtítulo: «Contale a Posty con una nota de voz y la armamos juntos.»
// Variante EN (traducción fiel, declarada en el STATUS del lote):
//   "Got an idea?" / "Tell Posty with a voice note and we'll build it
//   together."
// SOLO cambian esos dos renglones: borde punteado, botón amarillo de
// micrófono a la derecha y comportamiento, idénticos.
//
// CENSO (verificado en código sobre la base v1028): el texto citado vive
// en UN solo lugar de todo el árbol — public/app.js:26286, dentro de
// subirView(), con el ternario ES/EN en línea. La identidad visual de la
// captura cierra con su CSS (.pz-subir .voz-op, styles.css:6388:
// border:1.5px dashed + .mic-s amarillo a la derecha). Las otras dos
// tiras de voz son tarjetas DISTINTAS y quedan fuera: la del posteo
// (pzVozStripHTML, app.js:25948: «Mantené apretado y decime si
// necesitás un cambio en este posteo» — borde superior sólido, es el
// pedido de cambio anclado a un posteo) y la de la semana
// (pzVozSemanaHTML, app.js:25962: «¿Algo de tu semana?»). La suite las
// pinea intactas (A8) como pin de alcance.
//
// Control: la misma batería corre contra el árbol base (../base o
// LOTE_BASE_DIR) y tiene que REPRODUCIR la captura: los textos viejos
// presentes y los nuevos ausentes.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = __dirname;
const BASE = process.env.LOTE_BASE_DIR || path.join(__dirname, '..', 'base');
const CONTROL = process.env.LOTE_CONTROL === '1';

const root = CONTROL ? BASE : DIR;
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

let ok = 0, mal = 0;
function pin(nombre, cond) {
  if (cond) { ok++; console.log('ok  ', nombre); }
  else { mal++; console.log('MAL ', nombre); }
}
const count = (txt) => app.split(txt).length - 1;

const ES_TIT_N = '¿Tenés una idea?';
const ES_SUB_N = 'Contale a Posty con una nota de voz y la armamos juntos.';
const EN_TIT_N = "Got an idea?";
const EN_SUB_N = "we\\'ll build it together"; // forma fuente (escape en el string)
const ES_TIT_V = '¿Algo más?';
const ES_SUB_V = 'Si querés, contale a Posty con una nota de voz.';
const EN_TIT_V = 'Anything else?';
const EN_SUB_V = 'If you want, tell Posty with a voice note.';

if (!CONTROL) {
  pin('A1 titular ES nuevo ×1', count(ES_TIT_N) === 1);
  pin('A2 subtítulo ES nuevo ×1', count(ES_SUB_N) === 1);
  pin('A3 titular EN nuevo ×1', count(EN_TIT_N) === 1);
  pin('A4 subtítulo EN nuevo ×1', count(EN_SUB_N) === 1 && count('Tell Posty with a voice note and') === 1);
  pin('A5 textos viejos ES en cero', count(ES_TIT_V) === 0 && count(ES_SUB_V) === 0);
  pin('A6 textos viejos EN en cero', count(EN_TIT_V) === 0 && count(EN_SUB_V) === 0);
  pin('A7 tarjeta intacta (id, data-pz-voz=extra, gancho de texto ×2 y mic)',
    count('id="pzSubirVozOp"') === 1 && count('data-pz-voz="extra"') === 1 &&
    count('data-subir-voz-txt') === 2 && count('class="mic-s" data-pz-voz-mic') === 1);
  pin('A8 alcance: las otras dos tiras NO se tocaron',
    count('decime si necesitás un cambio en este posteo') === 1 &&
    count('¿Algo de tu semana?') === 1);
  let syntax = true;
  try { execFileSync(process.execPath, ['--check', path.join(root, 'public', 'app.js')], { stdio: 'pipe' }); }
  catch (e) { syntax = false; }
  pin('A9 node --check de app.js', syntax);
} else {
  pin('K1 base reproduce la captura: viejos ES ×1', count(ES_TIT_V) === 1 && count(ES_SUB_V) === 1);
  pin('K2 base reproduce la captura: viejos EN ×1', count(EN_TIT_V) === 1 && count(EN_SUB_V) === 1);
  pin('K3 base sin los textos nuevos', count(ES_TIT_N) === 0 && count(ES_SUB_N) === 0 && count(EN_TIT_N) === 0);
}

console.log(`\n${ok} ok · ${mal} mal`);
process.exit(mal ? 1 : 0);
