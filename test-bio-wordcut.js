'use strict';
/* test-bio-wordcut.js — v363: la bio NUNCA se corta a mitad de palabra.
 * Los topes duros con slice() (profileKit en analysis-engine.js y
 * extractIgBiography en demo.js) pasan a cortar por palabra con
 * cutWords: si el texto entra, pasa intacto; si no, corta en el último
 * límite de palabra que respete el tope, limpia puntuación colgante y
 * agrega '…'. Los topes numéricos (42/42/30/30/150/500) no cambian.
 * Uso: node test-bio-wordcut.js */
const ae = require('./analysis-engine');
const demo = require('./demo');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

function assertWordCut(result, source, max, label) {
  ok(typeof result === 'string' && result.length <= max, `${label}: respeta el tope ${max} (largo ${result && result.length})`);
  if (String(source).length <= max) {
    ok(result === String(source), `${label}: texto que entra pasa intacto`);
    return;
  }
  ok(result.endsWith('…'), `${label}: el corte termina en '…'`);
  const core = result.slice(0, -1);
  ok(core.length > 0, `${label}: el corte no queda vacío`);
  ok(String(source).startsWith(core), `${label}: el corte es prefijo exacto del texto fuente`);
  // La palabra final del corte está COMPLETA en la fuente: lo que sigue
  // en la fuente es un límite (espacio, salto o puntuación), no la mitad
  // restante de la palabra.
  const next = String(source).charAt(core.length);
  ok(next === '' || /[\s.,;:!?]/.test(next), `${label}: la última palabra está completa (sigue '${next}')`);
  const lastWord = core.split(/[\s\n]+/).filter(Boolean).pop() || '';
  ok(lastWord && String(source).split(/[\s\n]+/).includes(lastWord), `${label}: la última palabra ('${lastWord}') existe completa en la fuente`);
}

console.log('— cutWords: semántica del helper (analysis-engine y demo)');
for (const [name, cw] of [['ae', ae.cutWords], ['demo', demo.cutWords]]) {
  ok(typeof cw === 'function', `${name}.cutWords existe`);
  ok(cw('Hola mundo', 42) === 'Hola mundo', `${name}: corto intacto`);
  ok(cw('', 42) === '', `${name}: vacío intacto`);
  const hard = cw('Supercalifragilisticoespialidosoextraordinario', 20);
  ok(hard.length === 20 && hard.endsWith('…') && hard.slice(0, -1) === 'Supercalifragilisti'.slice(0, 19), `${name}: sin límite usable, corte duro en max-1 + '…' (${hard})`);
}
ok(ae.cutWords('uno dos tres cuatro cinco seis siete', 20) === demo.cutWords('uno dos tres cuatro cinco seis siete', 20), 'ae y demo cortan igual');

console.log('— profileKit: líneas largas reales');
const STAR = 'Esta cuenta la presenta Posty con posteos todas las semanas del año';
const DIF = 'Atención personalizada para cada cliente con seguimiento cercano y respuesta el mismo día siempre';
const CITY = 'Una ciudad con un nombre realmente muy largo para probar';
const BIZNAME = 'Un negocio con un nombre larguísimo que supera los treinta';
const kit = ae.profileKit({
  business: { name: BIZNAME, category: 'profesionales', ig_username: 'prueba', city: '' },
  digest: { inferred_star: { item: STAR }, diferencial: DIF, ciudad: CITY, productos: [], servicios: [], promos: [] },
  reviews: null, lang: 'es',
});
ok(Array.isArray(kit.bio_lines) && kit.bio_lines.length >= 3, 'kit trae líneas de bio');
const starContent = kit.bio_lines[0].replace(/^⭐ /, '');
assertWordCut(starContent, STAR, 42, 'línea estrella (42)');
const difLine = kit.bio_lines.find((l) => l.startsWith('💛 '));
ok(!!difLine, 'línea diferencial presente');
if (difLine) assertWordCut(difLine.replace(/^💛 /, ''), DIF, 42, 'línea diferencial (42)');
const cityLine = kit.bio_lines.find((l) => l.startsWith('📍 '));
ok(!!cityLine, 'línea ciudad presente');
if (cityLine) assertWordCut(cityLine.replace(/^📍 /, ''), CITY, 30, 'línea ciudad (30)');
assertWordCut(kit.display_name, BIZNAME, 30, 'display_name (30)');
const joined = kit.bio_lines.slice(0, 4).join('\n');
assertWordCut(kit.bio, joined, 150, 'bio total (150)');
// Ejercicio dedicado del tope 150: líneas con palabras cortas repetidas
// llenan cada tope individual y la suma supera 150, así la bio total
// SÍ se corta — y también por palabra.
const kitLong = ae.profileKit({
  business: { name: 'Casa', category: 'profesionales', ig_username: 'prueba', city: '' },
  digest: {
    inferred_star: { item: 'aaaaaaaaaa bbbbbbbbbb cccccccccc ddddddddd' },
    diferencial: 'eeeeeeeeee ffffffffff gggggggggg hhhhhhhhh',
    ciudad: 'iiiiiiiiii jjjjjjjjjj kkkkkkkk',
    productos: [], servicios: [], promos: [],
  },
  reviews: null, lang: 'es',
});
const joinedLong = kitLong.bio_lines.slice(0, 4).join('\n');
ok(joinedLong.length > 150, `fixture: las líneas unidas superan 150 (${joinedLong.length}), el tope de bio se ejercita`);
assertWordCut(kitLong.bio, joinedLong, 150, 'bio total larga (150)');

console.log('— profileKit: textos cortos intactos');
const kitShort = ae.profileKit({
  business: { name: 'Café Sol', category: 'cafeteria', ig_username: 'cafesol', city: 'Palermo' },
  digest: { inferred_star: { item: 'Medialunas' }, diferencial: 'Recién horneado', ciudad: '', productos: [], servicios: [], promos: [] },
  reviews: null, lang: 'es',
});
ok(kitShort.bio_lines[0] === '⭐ Medialunas', 'corto: línea estrella intacta');
ok(kitShort.display_name === 'Café Sol', 'corto: display_name intacto');
ok(kitShort.bio === kitShort.bio_lines.slice(0, 4).join('\n'), 'corto: bio intacta (sin …)');
ok(!kitShort.bio.includes('…'), 'corto: sin puntos suspensivos agregados');

console.log('— extractIgBiography: biografía de embed > 500');
const longBio = Array.from({ length: 30 }, (_, i) => 'palabra' + (i % 7) + ' completa').join(' ') + ' cierre final de la biografia publica de la cuenta';
ok(longBio.length > 500, `fixture: la biografía fuente supera 500 (${longBio.length})`);
const escBio = longBio.replace(/\n/g, '\\n');
const htmlLong = 'relleno \\"biography\\":\\"' + escBio + '\\" resto';
const bioOut = demo.extractIgBiography(htmlLong);
assertWordCut(bioOut, longBio, 500, 'biografía embed (500)');
const shortBio = 'Café de especialidad en Palermo';
const htmlShort = 'relleno \\"biography\\":\\"' + shortBio + '\\" resto';
ok(demo.extractIgBiography(htmlShort) === shortBio, 'embed corto: biografía intacta');
ok(demo.extractIgBiography('<html>sin bio</html>') === '', 'sin biografía: devuelve cadena vacía');

console.log(fails ? `\n✗ ${fails}/${total} FALLOS` : `\n✓ ${total}/${total} OK`);
process.exit(fails ? 1 : 0);
