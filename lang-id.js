// lang-id.js — (LOTE CORRECTIVO-9 · IDIOMA POSITIVO)
// Identificador de idioma DETERMINÍSTICO y POSITIVO para textos cortos
// (captions y frases minadas). Sin dependencias, sin red, sin IA: puntúa
// PALABRAS FUNCIÓN (artículos, preposiciones, pronombres, verbos
// auxiliares e imperativos de voseo) de cada familia — las palabras de
// contenido (productos, rubros, nombres) no puntúan, así que un nombre
// propio en otro idioma no da vuelta el veredicto y un cuerpo entero en
// un tercer idioma no puede disfrazarse de palabras sueltas.
//
// Devuelve 'es' | 'en' | 'other' | null:
//  · 'other' = hay evidencia fuerte de un idioma que NO es español ni
//    inglés (francés, portugués, italiano, alemán…): para la puerta da
//    lo mismo cuál — no es el idioma de la marca.
//  · null = evidencia insuficiente o mezclada: SIN veredicto. La puerta
//    no frena por idioma lo que no puede juzgar (criterio declarado
//    anti-falso-positivo: mejor un texto corto sin juzgar que un posteo
//    sano frenado por una heurística).
//
// UMBRAL DECLARADO (verificado por la suite del lote):
//  · evidencia total (hits de palabras función + señales fuertes) ≥ 4;
//  · la familia ganadora suma ≥ 3 hits;
//  · la ganadora concentra ≥ 55% de la evidencia total.
// Debajo de eso: null. Un caption real de 3 bloques suma decenas de
// hits de su idioma; el cuerpo francés de Veja #5 suma 6 de 'other'
// contra 4 de 'en' en el caption completo (60%) → 'other', reprobado.
'use strict';

// Palabras función por familia. Se excluyen a propósito los homógrafos
// entre familias ('a', 'no', 'e', 'o' — artículo en portugués, «o» en
// español): una palabra que vale para dos idiomas no distingue nada
// y no puntúa para ninguno.
const ES_WORDS = new Set((
  'el la los las un una unos unas de del en y que es son está están con sin por para al lo su sus tu tus ' +
  'nuestro nuestra nuestros nuestras más muy como cuando cuándo donde dónde desde hasta sobre también pero ' +
  'nos te se mi mis este esta esto estos estas ese esa eso ya hoy día días todo toda todos todas cada ' +
  'otro otra otros otras bien hace hacen han tiene tienen ser estar vamos estamos sos vos ' +
  // Voseo e imperativos rioplatenses: la firma del español de la casa.
  'podés querés tenés vení mirá escribinos escribime pedilo pedila reservá guardá guardalo sumate anotate ' +
  'aprovechá probalo probala contanos seguinos comentá pasá llegá conocé descubrí buscá sumá pedí miralo'
).split(' '));

const EN_WORDS = new Set((
  'the an and or of to in on at by for with from is are was were be been being it its this that these those ' +
  'you your yours we our ours they them their theirs he she his her hers not do does did have has had will ' +
  'would can could should may might today now just more most other others some any all every each when ' +
  'where what who whom how why if but so as than then there here us me my mine one two first get gets got ' +
  'make made new order orders yours'
).split(' '));

// Evidencia de TERCER idioma: palabras función distintivas de francés,
// portugués, italiano y alemán que no son palabras del español ni del
// inglés. No hace falta saber cuál es: alcanza con que no es ninguno
// de los dos idiomas de trabajo.
const OTHER_WORDS = new Set((
  // francés
  'des les dans une aux chez nous vous ils elles est sont avec pour sur plus très aussi cette ces ses mes ' +
  'tes notre votre leur leurs du au et ou qui quoi dont même fait faire tous toutes chaque après avant ' +
  'depuis pendant vers merci être à ' +
  // portugués
  'você vocês não obrigado obrigada são pelo pela pelos pelas isso nosso nossa nossos nossas também então ' +
  'com sem mais os ao aos das dos di uma sua seu suas seus sempre ' +
  // italiano
  'della delle dei degli nella nelle nello sono siamo anche più però già nostro nostri nostra vostro ' +
  'questo questa questi queste quello quella grazie che da per tuo tua tuoi tue mio mia ' +
  // alemán
  'und die das der den mit für ist sind nicht auch ein eine einen einem einer von zu im sich wir sie ihr ' +
  'unsere dieser diese wenn als aber oder bei nach über durch ohne schon noch sehr mehr wie wer wo'
).split(' '));

// Señales fuertes (no léxicas): ¿ ¡ y la ñ son del español; ç ã õ ß no
// existen ni en español ni en inglés corrientes.
function strongSignals(raw) {
  let es = 0, other = 0;
  if (/[¿¡]/.test(raw)) es += 3;
  const toks = raw.match(/[\p{L}]+/gu) || [];
  let enie = 0, ced = 0;
  for (const t of toks) {
    if (t.includes('ñ')) enie++;
    if (t.includes('ç') || t.includes('ã') || t.includes('õ') || t.includes('ß')) ced++;
  }
  es += Math.min(enie * 2, 4);
  other += Math.min(ced * 2, 4);
  return { es, other };
}

function detectTextLang(text) {
  const raw = String(text || '').toLowerCase();
  if (!raw.trim()) return null;
  // Fuera lo que no es cuerpo del texto: URLs, menciones (handles) y
  // hashtags (metadato, no idioma del cuerpo) no puntúan.
  const body = raw
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/www\.\S+/g, ' ')
    .replace(/@[\p{L}\p{N}._]+/gu, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ');
  const toks = body.match(/[\p{L}]+/gu) || [];
  let es = 0, en = 0, other = 0;
  for (const t of toks) {
    if (ES_WORDS.has(t)) es++;
    else if (EN_WORDS.has(t)) en++;
    else if (OTHER_WORDS.has(t)) other++;
  }
  const sig = strongSignals(body);
  es += sig.es; other += sig.other;
  const total = es + en + other;
  if (total < 4) return null;
  const win = Math.max(es, en, other);
  if (win < 3) return null;
  if (win / total < 0.55) return null;
  if (win === es) return 'es';
  if (win === en) return 'en';
  return 'other';
}

// La puerta positiva: ok si el texto ES del idioma esperado — o si no
// hay veredicto (texto demasiado corto/ambiguo para juzgar: no se
// frena lo que no se puede juzgar). Reprocha SOLO con veredicto
// contrario, y lo dice: detected trae 'es' | 'en' | 'other'.
function langCheck(text, expected) {
  const exp = expected === 'en' ? 'en' : 'es';
  const detected = detectTextLang(text);
  if (!detected) return { ok: true, detected: null, expected: exp };
  return { ok: detected === exp, detected, expected: exp };
}

module.exports = { detectTextLang, langCheck };
