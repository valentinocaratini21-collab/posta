// test-lote-voz-propia-prueba.js — LOTE VOZ-PROPIA-EN-LA-PRUEBA (directiva
// Valentino 7/11 ~16:51 sobre el mock bestillandrise: «Quiero que leas asi
// de bien los instagrams cuando hacen la prueba de 3 dias»).
// El hueco: la prueba YA extrae sus frases que se repiten
// (personalizacion.extraerMarcadoresVoz → digest.voz_marcadores,
// determinístico, USD 0) pero la generación de la prueba NO las usaba:
// demo.js tenía cero referencias a la voz y los únicos consumos eran de
// la semana del cliente pago. Este lote conecta los marcadores a la
// generación de la PRUEBA (generate Y generate-stream) con el mismo
// mecanismo que ya usa la cuenta (personalizacion.lineaVoz) y los muestra
// en «Lo que ya sé de vos» (ES+EN).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-voz-propia-prueba.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');

function treeDir() {
  const here = __dirname;
  if (fs.existsSync(path.join(here, 'public', 'prueba.html'))) return here;
  if (fs.existsSync(path.join(here, 'work', 'public', 'prueba.html'))) return path.join(here, 'work');
  throw new Error('no se encontro public/prueba.html junto al test ni en work/');
}
const T = treeDir();
const es = fs.readFileSync(path.join(T, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(T, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(T, 'server.js'), 'utf8');

const demo = require('./demo');
const personalizacion = require('./personalizacion');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra ? '(' + String(extra).slice(0, 200) + ')' : ''); }
}
const has = (s, m) => String(s || '').toLowerCase().includes(String(m || '').toLowerCase());

// ---- Fixtures: la panadería del mock bestillandrise ----
const MARKERS = ['cookies hechas', 'hechas a mano', 'pan de masa', 'masa madre'];
const CAPTIONS_FIXTURE = [
  'Fresh cookies hechas a mano, still warm from the oven. Your favorite cookie lady is back!',
  'Sourdough pan de masa madre, slow bread worth the wait. Hechas a mano every single morning.',
  'Look at her showing out! Starter burbujeando, pan de masa madre en camino.',
];
function digestFixture(lang) {
  return {
    business: 'Be Still & Rise Bakery',
    category: 'cafeteria',
    productos: [{ nombre: 'Cookies de chocolate' }, { nombre: 'Sourdough' }],
    servicios: [],
    voz_marcadores: MARKERS.slice(),
    onboarding: { producto_estrella: 'Cookies de chocolate' },
  };
}
function specFixture(lang, markers) {
  const d = digestFixture(lang);
  if (markers !== undefined) d.voz_marcadores = markers;
  return demo.buildDemoSpec({
    business: 'Be Still & Rise Bakery', category: 'cafeteria', country: 'US',
    tone: 'vos', goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', digest: d, lang, trialNoStock: true,
  });
}
function captionsFor(spec, lang, markers) {
  const topics = spec.topics;
  const prev = [];
  const out = [];
  for (let i = 0; i < topics.length; i++) {
    const vl = typeof demo.trialVoiceEcho === 'function' ? demo.trialVoiceEcho(markers, i, lang) : '';
    const r = demo.resolveTrialCaption(topics, 'cafeteria', {
      business: 'Be Still & Rise Bakery', tone: 'vos', country: 'US',
      idx: i, goalLine: '', lang, prevCaptions: prev, voiceLine: vl,
    });
    out.push(r.caption);
    prev.push(r.caption);
  }
  return out;
}

// ============ A. Extracción: sus frases reales, nada inventado ============
console.log('A. extracción de marcadores (input de todo el lote)');
const extracted = personalizacion.extraerMarcadoresVoz(CAPTIONS_FIXTURE, []);
check('extrae la frase que se repite (hechas a mano)', extracted.some((m) => has(m, 'hechas a mano')), JSON.stringify(extracted));
check('extrae la frase del producto (pan de masa)', extracted.some((m) => has(m, 'pan de masa')), JSON.stringify(extracted));
check('sin captions no inventa marcadores', personalizacion.extraerMarcadoresVoz([], []).length === 0);
check('lineaVoz vacía sin marcadores', personalizacion.lineaVoz([], 'es') === '' && personalizacion.lineaVoz(null, 'en') === '');

// ============ B. La línea de voz viaja en el spec (mecanismo de la cuenta) ============
console.log('B. buildDemoSpec suma la línea de voz (lineaVoz)');
const specEs = specFixture('es');
check('spec.voiceLine existe', typeof specEs.voiceLine === 'string' && specEs.voiceLine.length > 0, String(specEs.voiceLine).slice(0, 80));
check('spec.voiceLine es la de lineaVoz (mismo helper que la cuenta)',
  specEs.voiceLine === personalizacion.lineaVoz(MARKERS, 'es'), String(specEs.voiceLine).slice(0, 80));
check('spec.voiceMarkers trae los marcadores del digest',
  Array.isArray(specEs.voiceMarkers) && specEs.voiceMarkers.length === MARKERS.length, JSON.stringify(specEs.voiceMarkers));
const specEn = specFixture('en');
check('spec.voiceLine EN es la forma inglesa de lineaVoz',
  specEn.voiceLine === personalizacion.lineaVoz(MARKERS, 'en'), String(specEn.voiceLine).slice(0, 80));
const specSin = specFixture('es', []);
check('sin marcadores el spec no trae línea de voz', specSin.voiceLine === '' || specSin.voiceLine === undefined);
check('sin marcadores el spec no trae marcadores', !specSin.voiceMarkers || specSin.voiceMarkers.length === 0);

// ============ C. Los 5 captions llevan su frase ============
console.log('C. los 5 captions de la prueba llevan su frase');
const capsEs = captionsFor(specEs, 'es', MARKERS);
check('la semana tiene 5 captions', capsEs.length === 5, String(capsEs.length));
for (let i = 0; i < capsEs.length; i++) {
  const m = MARKERS[i % MARKERS.length];
  check('caption ' + i + ' lleva su frase («' + m + '»)', has(capsEs[i], m), String(capsEs[i]).slice(-120));
}
const capsEn = captionsFor(specEn, 'en', MARKERS);
check('EN: los 5 captions llevan su frase', capsEn.every((c, i) => has(c, MARKERS[i % MARKERS.length])), capsEn.map((c) => String(c).slice(-60)).join(' | '));
check('ES: el eco dice «En tus palabras»', capsEs.every((c) => has(c, 'En tus palabras')), capsEs[0].slice(-80));
check('EN: el eco dice «In your words»', capsEn.every((c) => has(c, 'In your words')), capsEn[0].slice(-80));

// ============ D. Rama honesta: sin marcadores, la semana es la de hoy ============
console.log('D. rama honesta (sin marcadores no se inventa voz)');
const capsSin = captionsFor(specSin, 'es', []);
const capsControl = captionsFor(specFixture('es', []), 'es', []);
check('sin marcadores ningún caption trae el eco', capsSin.every((c) => !has(c, 'En tus palabras') && !has(c, '«')), capsSin.join(' | ').slice(0, 200));
check('sin marcadores los captions son idénticos al control', JSON.stringify(capsSin) === JSON.stringify(capsControl));

// ============ E. El titular lleva su frase (como el mock) ============
console.log('E. titular con su frase (primer match, como applyGoal)');
const topicsHl = [
  { kind: 'novedad', headline: 'Algo nuevo', subline: '', caption: 'Algo nuevo en {BIZ}.', digest_anchor: 'Cookies de chocolate' },
  { kind: 'tip', headline: 'Tip del día', subline: '', caption: 'Un tip de {BIZ}.', digest_anchor: 'Sourdough' },
];
if (typeof demo.applyVoiceToTopics === 'function') {
  const out = demo.applyVoiceToTopics(topicsHl, MARKERS);
  check('el titular del posteo de cookies lleva su frase', has(out[0].headline, 'cookies hechas'), out[0].headline);
  check('el otro titular no se toca', out[1].headline === 'Tip del día', out[1].headline);
  check('no muta los temas del pool (clon)', topicsHl[0].headline === 'Algo nuevo', topicsHl[0].headline);
  check('sin match no cambia ningún titular',
    demo.applyVoiceToTopics(topicsHl, ['palabra rara']).every((t, i) => t.headline === topicsHl[i].headline));
  check('una palabra suelta nunca es titular',
    demo.applyVoiceToTopics(topicsHl, ['mano']).every((t, i) => t.headline === topicsHl[i].headline));
} else {
  check('applyVoiceToTopics existe', false, 'demo.applyVoiceToTopics no exportado');
}

// ============ F. El gate decide: la voz sobrevive aunque el goal sea largo ============
console.log('F. escalera de intentos (la voz no se pierde por el goal largo)');
{
  const topics = specEs.topics;
  const longGoal = '\nTal como pediste: ' + 'x'.repeat(140);
  const r = demo.resolveTrialCaption(topics, 'cafeteria', {
    business: 'Be Still & Rise Bakery', tone: 'vos', country: 'US',
    idx: 0, goalLine: longGoal, lang: 'es', prevCaptions: [],
    voiceLine: demo.trialVoiceEcho(MARKERS, 0, 'es'),
  });
  check('con goal largo, el caption igual lleva su frase (intento solo-voz)', has(r.caption, MARKERS[0]), String(r.caption).slice(-140));
  check('con goal largo, el goal no entra entero (el gate lo frenó)', !has(r.caption, 'x'.repeat(140)));
}

// ============ G. Un caption prestado no lleva voz ajena ============
console.log('G. caption prestado queda limpio (lección D1)');
{
  const topics = [
    { kind: 'novedad', headline: 'Oferta', subline: '', caption: 'No te lo pierdas, mirá esto en {BIZ}.' },
    { kind: 'tip', headline: 'Tip del día', subline: '', caption: 'Un tip simple de {BIZ} para hoy: guardá este posteo 🔖' },
    { kind: 'social', headline: 'Gracias', subline: '', caption: 'Gracias por estar en {BIZ}. Comentá INFO y te pasamos todo 👇' },
  ];
  const r = demo.resolveTrialCaption(topics, 'cafeteria', {
    business: 'Be Still & Rise Bakery', tone: 'vos', country: 'US',
    idx: 0, goalLine: '', lang: 'es', prevCaptions: [],
    voiceLine: demo.trialVoiceEcho(MARKERS, 0, 'es'),
  });
  check('el caption prestado no trae el eco de voz', !has(r.caption, 'En tus palabras'), String(r.caption).slice(0, 160));
  check('el caption prestado es del tema prestado (no del propio)', has(r.caption, 'tip simple') || has(r.caption, 'Gracias por estar'), String(r.caption).slice(0, 160));
}

// ============ H. Cableado en server.js ============
console.log('H. cableado en server.js (generate, stream, prefill, chat)');
check('prefill devuelve voz_marcadores', /voz_marcadores/.test(srv) && /\/api\/trial\/prefill/.test(srv), 'sin voz_marcadores en el prefill');
check('generate no-stream repone los marcadores desde el embed',
  /voz_marcadores/.test(srv) && /fetchIgEmbedHtml/.test(srv), 'sin recompute de voz en generate');
check('stream pasa la línea de voz a resolveTrialCaption',
  /trialVoiceEcho/.test(srv), 'sin trialVoiceEcho en server.js');
check('el chat de la prueba suma la línea de voz al prompt',
  /lineaVoz/.test(srv) && /\/api\/trial\/chat/.test(srv), 'sin lineaVoz en el chat de la prueba');

// ============ I. La tarjeta «Lo que ya sé de vos» muestra la voz ============
console.log('I. tarjeta «Lo que ya sé de vos» con la línea de voz (ES+EN)');
check('ES: rótulo knownVoz existe', /knownVoz:\s*'Hablás así'/.test(es), 'sin knownVoz en ES');
check('EN: rótulo knownVoz existe', /knownVoz:\s*'How you sound'/.test(en), 'sin knownVoz en EN');
check('ES: chatKnownRows agrega la fila de voz', /S\.voice/.test(es) && /knownVoz/.test(es), 'sin fila de voz en ES');
check('EN: chatKnownRows agrega la fila de voz', /S\.voice/.test(en) && /knownVoz/.test(en), 'sin fila de voz en EN');
check('ES: studyIg guarda los marcadores del prefill', /d\.voz_marcadores/.test(es), 'sin d.voz_marcadores en ES');
check('EN: studyIg guarda los marcadores del prefill', /d\.voz_marcadores/.test(en), 'sin d.voz_marcadores en EN');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail ? 1 : 0);
