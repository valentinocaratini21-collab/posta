'use strict';
/* Suite LOTE LÉXICO-INGLÉS (L7 del diagnóstico de la corrida Veja #6,
 * guest 94, posteos 654–656, 13/11). La gramática de los titulares y
 * tips EN salía rota por TRES mecanismos (DIAGNOSIS.md §6.4):
 *  (1) Las fórmulas EN que agregan posesivo/verbo («choosing your X
 *      well», «that's how we do X», «Book your X») embebían el nombre
 *      minado CON su artículo: «your the salar», «we do the salar».
 *  (2) El `dice` del léxico se minaba como ventana de palabras y podía
 *      terminar en preposición: de «The Atlas in hairy suede» nacía
 *      «Atlas in» → gancho «Atlas in everyone's asking for».
 *  (3) Ningún lint determinístico frenaba esos empalmes en el texto EN
 *      generado: el anti-empalme de v1007 mira solo la primera línea
 *      de cada bloque en captionPassesEn, y los titulares/temas del
 *      camino determinístico no pasan por esa puerta al generarse.
 * Acá se prueba:
 *  (a) CONTROL (base viva v1007): los tres mecanismos reproducen los
 *      textos EXACTOS de la corrida.
 *  (b) Con el lote: el nombre se pela al embeber tras posesivo/verbo
 *      (y NO tras «to»: «3 keys to the Salar» queda), el dice ya no
 *      termina en palabra de función, el wow con un dice rancio cae a
 *      la forma neutra, el tema EN con empalme no nace (fail-closed) y
 *      captionPassesEn frena el empalme en todo el texto.
 *  (c) Regresión cero: nombre sin artículo = salida byte-idéntica
 *      (forma Crumbl del pin C619 de v958); «do the right thing» NO se
 *      frena; el camino ES queda byte-idéntico (léxico y temas).
 * Uso: node test-lote-lexico-ingles.js
 * El control se resuelve en ../control (o $LEXICO_CONTROL_DIR). */
const fs = require('fs');
const path = require('path');

const REL = __dirname;
const BASE = process.env.LEXICO_CONTROL_DIR || path.resolve(REL, '..', 'control');
if (!fs.existsSync(path.join(BASE, 'client-digest.js'))) {
  console.error('FALTA el árbol control en', BASE);
  process.exit(2);
}
const cd = require(path.join(REL, 'client-digest'));
const cdB = require(path.join(BASE, 'client-digest'));
const gen = require(path.join(REL, 'generator'));
const genB = require(path.join(BASE, 'generator'));

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('ok -', name); }
  else { fail++; console.log('FALLA -', name); }
}
const diceOf = (lex, item) => {
  const e = ((lex && lex.entries) || []).find((x) => x.item === item);
  return e ? e.dice : undefined;
};

// ---------------------------------------------------------------- (a)+(b) dice
const CAPS_VEJA = [
  'The Salar, where outdoor influences meet the city streets. Organic cotton upper, Amazonian rubber sole.',
  'Small Canary in mustard suede, back in stock.\nModel: @lisaaxlu',
  'Meet The Atlas in hairy suede.\nModel: @micari_micari Photo: @vincentdesailly',
  'The Atlas in full-grain leather for the winter days.',
  'The Salar in full-grain leather for the winter days.',
];
const lexB = cdB.buildLexicon({ texts: CAPS_VEJA, items: ['The Atlas', 'The Salar'] });
t('a1 CONTROL: el dice base de «The Atlas» es «Atlas in» (el bug de la corrida)',
  diceOf(lexB, 'The Atlas') === 'Atlas in');
const lex = cd.buildLexicon({ texts: CAPS_VEJA, items: ['The Atlas', 'The Salar'] });
t('b1 el dice ya no termina en preposición: «Atlas»',
  diceOf(lex, 'The Atlas') === 'Atlas');
t('b1b ningún dice del fixture termina en palabra de función EN/ES',
  (lex.entries || []).every((e) => !e.dice
    || !/\b(the|a|an|in|on|at|to|of|by|de|del|la|el|en|con|por|para)$/i.test(e.dice.trim())));

// ---------------------------------------------------------------- (a)+(b) tip y reserva
const mkDigestTip = (mod) => ({
  business: 'VEJA', category: 'calzado',
  productos: [{ nombre: 'The Salar' }], servicios: [{ nombre: 'The Atlas' }],
  temas_feed: [],
});
const tipOf = (topics) => (topics || []).find((x) => x.kind === 'tip');
const tipB = tipOf(cdB.deriveTopics(mkDigestTip(), { lang: 'en', count: 5 }));
t('a2 CONTROL: el tip base sale con el empalme exacto de la corrida',
  !!tipB && tipB.caption.includes('choosing your the salar well') && tipB.caption.includes("that's how we do the salar"));
const tip = tipOf(cd.deriveTopics(mkDigestTip(), { lang: 'en', count: 5 }));
t('b2 el tip sale con el nombre pelado tras posesivo/verbo',
  !!tip && tip.caption.includes('choosing your salar well') && tip.caption.includes("that's how we do salar"));
t('b2b el tip no contiene ningún empalme de la familia',
  !!tip && !cd.enSpliceLint(`${tip.headline}\n${tip.caption}`, ['The Salar', 'The Atlas']));
t('b2c el titular del tip conserva el artículo tras «to» (gramatical, no se toca)',
  !!tip && tip.headline === '3 keys to the salar');

const mkDigestBook = () => ({
  business: 'VEJA', category: 'calzado', has_booking: true,
  productos: [{ nombre: 'The Salar' }], servicios: [{ nombre: 'The Salar' }],
  temas_feed: [],
});
const resOf = (topics) => (topics || []).find((x) => x.kind === 'reserva');
const resB = resOf(cdB.deriveTopics(mkDigestBook(), { lang: 'en', count: 5 }));
t('a3 CONTROL: el titular de reserva base es «Book your the salar»',
  !!resB && resB.headline === 'Book your the salar');
const res = resOf(cd.deriveTopics(mkDigestBook(), { lang: 'en', count: 5 }));
t('b3 el titular de reserva sale pelado: «Book your salar»',
  !!res && res.headline === 'Book your salar');

// ---------------------------------------------------------------- (a)+(b) wow con dice rancio
const mkDigestWow = () => ({
  business: 'VEJA', category: 'calzado',
  productos: [{ nombre: 'The Atlas' }, { nombre: 'The Salar' }],
  servicios: [],
  inferred_star: { item: 'The Atlas', confidence: 0.8 },
  lexicon: { entries: [{ item: 'The Atlas', dice: 'Atlas in' }], frases: [] },
});
const wowB = cdB.deriveFirstPostWow(mkDigestWow(), { lang: 'en' });
t('a4 CONTROL: el wow base titula «Atlas in everyone\'s asking for» (posteo 654)',
  !!wowB && wowB.headline === "Atlas in everyone's asking for");
const wow = cd.deriveFirstPostWow(mkDigestWow(), { lang: 'en' });
t('b4 el wow con dice rancio cae a la forma neutra con el nombre limpio',
  !!wow && wow.headline === 'Try Atlas today');

// ---------------------------------------------------------------- (b) tema con empalme no nace
const mkDigestSocial = () => ({
  business: 'VEJA', category: 'calzado',
  productos: [{ nombre: 'The Salar' }], servicios: [],
  temas_feed: ["In everyone's asking for"],
});
const socOf = (topics) => (topics || []).find((x) => x.kind === 'social');
t('b5 CONTROL: en la base el tema social con el fragmento roto SÍ nace',
  !!socOf(cdB.deriveTopics(mkDigestSocial(), { lang: 'en', count: 5 })));
t('b5b con el lote el tema social con empalme NO nace (fail-closed)',
  !socOf(cd.deriveTopics(mkDigestSocial(), { lang: 'en', count: 5 })));

// ---------------------------------------------------------------- (b) lint unitario + nombre pelado
t('b6 enSpliceLint caza los 4 textos reales de la corrida',
  cd.enSpliceLint("Atlas in everyone's asking for") === true
  && cd.enSpliceLint('3 keys to choosing your the salar well', ['The Salar']) === true
  && cd.enSpliceLint("that's how we do the salar", ['The Salar']) === true
  && cd.enSpliceLint('your the salar', ['The Salar']) === true);
t('b6b «do the salar» sin conocer el nombre NO se juzga (sin nombre no hay empalme probado)',
  cd.enSpliceLint("that's how we do the salar") === false);
t('b6c enSpliceLint no frena inglés válido',
  cd.enSpliceLint('3 keys to choosing your Salar well') === false
  && cd.enSpliceLint("that's how we do Salar") === false
  && cd.enSpliceLint("Atlas everyone's asking for") === false
  && cd.enSpliceLint('do the right thing') === false
  && cd.enSpliceLint('Book your Salar today') === false
  && cd.enSpliceLint('your theme park guide') === false
  && cd.enSpliceLint('3 keys to the Salar') === false);
t('b6d bareEnName pela solo el artículo inicial',
  cd.bareEnName('The Salar') === 'Salar' && cd.bareEnName('An Atlas') === 'Atlas'
  && cd.bareEnName('Salar') === 'Salar' && cd.bareEnName('The') === 'The' && cd.bareEnName('') === '');

// ---------------------------------------------------------------- (a)+(b) captionPassesEn
const GOOD = 'Balayage season is open ✨\n\nSoft, lived-in color is what everyone is booking at Glow Studio.\n\nBook your chair by DM 📩';
const YOUR_THE_L2 = 'Balayage season is open ✨\n\nSoft, lived-in color is what everyone is booking at Glow Studio.\nAsk about your the balayage ritual when you come in.\n\nBook your chair by DM 📩';
const THE_THE_L2 = 'Balayage season is open ✨\n\nSoft, lived-in color is what everyone is booking at Glow Studio.\nIt pairs with the the balayage ritual everyone loves.\n\nBook your chair by DM 📩';
const EVERYONES_MID = 'Balayage season is open ✨\n\nSoft, lived-in color is what everyone is booking at Glow Studio. It is the cut in everyone\'s asking for this season.\n\nBook your chair by DM 📩';
const DO_RIGHT = 'Balayage season is open ✨\n\nSoft, lived-in color is what everyone is booking at Glow Studio. Come in and we do the right thing for your hair.\n\nBook your chair by DM 📩';
t('a5 CONTROL: la base deja pasar el empalme fuera de la primera línea de bloque',
  genB.captionPassesEn(YOUR_THE_L2, {}).ok === true
  && genB.captionPassesEn(THE_THE_L2, {}).ok === true
  && genB.captionPassesEn(EVERYONES_MID, {}).ok === true);
t('b7 captionPassesEn frena posesivo+artículo en todo el texto',
  gen.captionPassesEn(YOUR_THE_L2, {}).ok === false
  && /spliced name/.test(gen.captionPassesEn(YOUR_THE_L2, {}).reason));
t('b7b captionPassesEn frena el artículo duplicado en todo el texto',
  gen.captionPassesEn(THE_THE_L2, {}).ok === false
  && /doubled article/.test(gen.captionPassesEn(THE_THE_L2, {}).reason));
t('b7c captionPassesEn frena la preposición colgante ante «everyone\'s»',
  gen.captionPassesEn(EVERYONES_MID, {}).ok === false
  && /spliced hook/.test(gen.captionPassesEn(EVERYONES_MID, {}).reason));
t('b7d el caption del tip TAL COMO SALIÓ en la corrida no pasa la puerta (ni base ni lote)',
  genB.captionPassesEn(tipB.caption, {}).ok === false && gen.captionPassesEn(tipB.caption, {}).ok === false);
t('c1 captionPassesEn no frena «do the right thing» ni el caption válido',
  gen.captionPassesEn(DO_RIGHT, {}).ok === true && gen.captionPassesEn(GOOD, {}).ok === true);

// ---------------------------------------------------------------- (c) regresión cero
const mkDigestCrumbl = () => ({
  business: 'Crumbl', category: 'gastronomia',
  productos: [{ nombre: 'Scoopable Cookie Dough' }], servicios: [{ nombre: 'Cookie Dough' }],
  temas_feed: [],
});
const tipCrumbB = tipOf(cdB.deriveTopics(mkDigestCrumbl(), { lang: 'en', count: 5 }));
const tipCrumb = tipOf(cd.deriveTopics(mkDigestCrumbl(), { lang: 'en', count: 5 }));
t('c2 nombre sin artículo: el caption del tip es byte-idéntico a la base (forma C619 de v958)',
  !!tipCrumb && !!tipCrumbB && tipCrumb.caption === tipCrumbB.caption
  && tipCrumb.caption.includes('choosing your scoopable cookie dough well')
  && tipCrumb.caption.includes("that's how we do scoopable cookie dough"));

const CAPS_ES = [
  'El Blend Patagonia, nuestro blend de la casa, en grano o molido.',
  'Blend Patagonia recién tostado, como lo pedís siempre.',
  'Probá el Blend Patagonia con leche de almendras.',
];
const lexSinFecha = (m) => {
  const l = m.buildLexicon({ texts: CAPS_ES, items: ['Blend Patagonia'] });
  return JSON.stringify({ entries: l && l.entries, frases: l && l.frases });
};
t('c3 el léxico ES no cambia: entradas idénticas a la base',
  lexSinFecha(cd) === lexSinFecha(cdB));
const mkDigestES = () => ({
  business: 'Café Aroma', category: 'cafeteria',
  productos: [{ nombre: 'Blend Patagonia' }], servicios: [{ nombre: 'Café en grano 250g' }],
  temas_feed: [],
});
t('c4 los temas ES no cambian: salida idéntica a la base',
  JSON.stringify(cd.deriveTopics(mkDigestES(), { lang: 'es', count: 5 }))
  === JSON.stringify(cdB.deriveTopics(mkDigestES(), { lang: 'es', count: 5 })));

console.log(`\nRESULTADO: ${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
