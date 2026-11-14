'use strict';
/* Suite LOTE CORRECTIVO-8 · ESTRELLA-CON-EVIDENCIA (BUILD v999)
 * La estrella de Veja salió «Model Photo» (corrida #5, 13/11): los
 * captions del feed cierran con créditos («Model: @x Photo: @y»), el
 * minero pelaba las menciones ANTES de minar y los rótulos quedaban
 * adyacentes como candidato «fuerte»; las menciones se contaban con
 * UNA sola palabra («model»/«photo» en 4 de 6 captions) y la puerta
 * de correctivo-4 validaba contra productos_nombrados — la lista del
 * propio minero (circular). Acá se prueba:
 *  (a) CONTROL base v995: el fixture Veja reproduce el bug byte a
 *      byte (nombrado N.º 1 «Model Photo» con 4 menciones, estrella
 *      inferida con confianza 0.76, wow que la vende como estrella).
 *  (b) Con el lote: ningún rótulo de rol entra a productos_nombrados
 *      y la estrella es un modelo REAL corroborado («The Salar»:
 *      frase-sujeto + frase repetida en el crudo).
 *  (c) Corroboración cruzada por catálogo: el mismo feed + catálogo
 *      con el modelo → la estrella calza con el catálogo.
 *  (d) Sin evidencia: no hay estrella (null) y el wow degrada
 *      honesto (star_missing, sin claim) — ni con líneas de crédito.
 *  (e) La evidencia vale para TODO slot que afirma producto: slot 2
 *      y tip ya no anclan rótulos ni nombres sin corroborar.
 *  (f) La puerta unitaria: señales, clases y legado.
 *  (g) Menciones = frase completa (pieceAnchored estricto).
 *  (h) La marca explícita del dueño sigue mandando (calce exacto).
 *  (i) Smoke de boot: /api/version sirve el BUILD del lote.
 * Uso: node test-lote-correctivo-8-estrella-evidencia.js */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const REL = __dirname;
const BASE = path.resolve(REL, '..', 'base-v995');
const cd = require(path.join(REL, 'client-digest'));
const cdB = require(path.join(BASE, 'client-digest'));

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('ok -', name); }
  else { fail++; console.log('FALLA -', name); }
}

// ---------------------------------------------------------------- fixtures
// Las 6 captions de @veja reconstruidas con los fragmentos VERBATIM
// del diagnóstico (créditos exactos de los posteos 2, 3, 4 y 6;
// frases-sujeto exactas «The Salar, where outdoor influences meet…»
// y «Meet The Atlas in hairy suede.»). La tienda real no aportó
// ítems (Salesforce sin catálogo legible): web.services vacío.
const CAPS_VEJA = [
  'The Salar, where outdoor influences meet the city streets. Organic cotton upper, Amazonian rubber sole.',
  'Small Canary in mustard suede, back in stock.\nModel: @lisaaxlu',
  'Walking Rio in the Campo chromefree leather.\nModel: @felipeariasvasquez',
  'Feito no Brasil, com materiais reciclados.\nPhotos: @vejabrasil',
  'The Salar in full-grain leather for the winter days.',
  'Meet The Atlas in hairy suede.\nModel: @micari_micari Photo: @vincentdesailly',
];
const mkVeja = (mod, extra) => mod.buildFromParts(Object.assign({
  business: 'VEJA', category: 'calzado',
  web: { name: 'VEJA', description: 'Sneakers', services: [], city: '', palette: [], url: 'https://veja-store.com', categoryHint: '' },
  feed: { bio: 'Sneakers', captions: CAPS_VEJA, name: 'VEJA', handle: 'veja', pic: '' },
  form: null,
}, extra || {}));

// ---------------------------------------------------------------- (a) control
const dVb = mkVeja(cdB);
const nb0 = (dVb.productos_nombrados || [])[0] || {};
t('a1 CONTROL base v995: el nombrado N.º 1 es «Model Photo» con 4 menciones',
  nb0.nombre === 'Model Photo' && nb0.menciones === 4);
t('a2 CONTROL base v995: la estrella inferida es «Model Photo» (confianza 0.76)',
  !!dVb.inferred_star && dVb.inferred_star.item === 'Model Photo' && dVb.inferred_star.confidence === 0.76);
const effVb = cdB.effectiveStarOf(dVb);
t('a3 CONTROL base v995: la puerta circular la corona estrella efectiva',
  !!effVb && effVb.item === 'Model Photo');
const wowVb = cdB.deriveFirstPostWow(dVb, { lang: 'en' });
t('a4 CONTROL base v995: el wow la vende como estrella (anchor + _star + claim)',
  !!wowVb && wowVb.digest_anchor === 'Model Photo' && wowVb._star === 1 && /everyone's asking for/.test(String(wowVb.headline || '')));
const topicsVb = cdB.deriveTopics(dVb, { lang: 'en', count: 5 });
t('a5 CONTROL base v995: el slot 2 es el rótulo suelto «Model»',
  topicsVb.length >= 2 && topicsVb[1].digest_anchor === 'Model');

// ---------------------------------------------------------------- (b) Veja con el lote
const dV = mkVeja(cd);
t('b1 ningún rótulo de rol entra a productos_nombrados',
  (dV.productos_nombrados || []).every((x) => !cd.isCreditRoleName(x.nombre)));
t('b2 «Model Photo» no existe como candidato',
  !(dV.productos_nombrados || []).some((x) => /model photo/i.test(x.nombre)));
const entSalar = (dV.productos_nombrados || []).find((x) => x.nombre === 'The Salar');
t('b3 «The Salar» trae sus clases de evidencia (frase + repetida + sujeto)',
  !!entSalar && ['frase', 'repetida', 'sujeto'].every((c) => (entSalar.clases || []).includes(c)));
t('b4 las menciones de «The Salar» son las de frase completa (2, no infladas)',
  !!entSalar && entSalar.menciones === 2);
const effV = cd.effectiveStarOf(dV);
// RE-PIN (lote FUNDAMENTO-QUE-DUDA, diagnóstico Blind Barber): la
// tienda de este fixture NO aportó catálogo legible (web.services
// vacío, sin foto mapeada), así que la evidencia de «The Salar»
// (frase + repetida + sujeto) es TODA intra-caption — la misma
// circularidad que coronó a «Infused». Con la regla nueva ya no
// corona: la inferida queda como DUDA (candidata debil, b7) y la
// prueba la pregunta con opciones antes de afirmar nada.
t('b5 RE-PIN fundamento-que-duda: sin fuente externa, «The Salar» ya NO es estrella efectiva',
  effV === null);
const wowV = cd.deriveFirstPostWow(dV, { lang: 'en' });
t('b6 RE-PIN fundamento-que-duda: el wow degrada honesto (anchor temático + star_missing, sin _star)',
  !!wowV && wowV.digest_anchor === 'The Salar' && wowV.star_missing === true && !wowV._star);
t('b7 la inferida débil nace como candidata de pregunta marcada debil',
  (dV.question_candidates || []).some((c) => c.tipo === 'estrella' && c.item === 'The Salar' && c.debil === true));

// ---------------------------------------------------------------- (c) corroboración por catálogo
const dC = mkVeja(cd, { catalog: { items: ['Salar', 'V-10', 'Esplar'], pages: 1, pdfs: 0, at: null } });
t('c1 con catálogo, la estrella calza con el modelo del catálogo',
  !!cd.effectiveStarOf(dC) && /salar/i.test(cd.effectiveStarOf(dC).item));
t('c2 starNamedEvidenceOk acepta el nombre del catálogo',
  cd.starNamedEvidenceOk(dC, 'Salar') === true);
const entCat = (dC.productos_nombrados || []).find((x) => x.nombre === 'Salar');
t('c3 la entrada del catálogo trae la clase catalogo + respaldo del feed',
  !!entCat && (entCat.clases || []).includes('catalogo') && (entCat.clases || []).includes('frase'));

// ---------------------------------------------------------------- (d) sin evidencia → degradado honesto
const dN = cd.buildFromParts({
  business: 'Veja', category: 'calzado',
  web: { name: 'Veja', description: 'Sneakers', services: ['Running', 'Sneakers'], city: '', palette: [], url: 'https://veja.example', categoryHint: '' },
  feed: { bio: 'Sneakers', captions: [
    'Running days are the best days. Our running line, made to move',
    'RUNNING — new colors for the running collection',
    'running running running, siempre running',
    'sneakers for running and for everything else',
    'Feito no Brasil.\nModel: @micari_micari Photo: @vincentdesailly',
  ], name: 'Veja', handle: 'veja', pic: '' },
  form: null,
});
t('d1 sin evidencia no hay estrella efectiva (ni con líneas de crédito)',
  cd.effectiveStarOf(dN) === null);
t('d2 ningún candidato nace de los créditos',
  (dN.productos_nombrados || []).every((x) => !cd.isCreditRoleName(x.nombre)));
const wowN = cd.deriveFirstPostWow(dN, { lang: 'es' });
t('d3 el wow degrada honesto: star_missing, sin _star ni claim de popularidad',
  !!wowN && wowN.star_missing === true && !wowN._star && !/todos piden|everyone/i.test(String(wowN.headline || '')));

// ---------------------------------------------------------------- (e) slots 2 y tip
const topicsV = cd.deriveTopics(dV, { lang: 'en', count: 5 });
t('e1 ningún topic ancla un rótulo de rol',
  topicsV.every((x) => !cd.isCreditRoleName(x.digest_anchor || '')));
t('e2 el tip ya no ancla «Meet The Atlas» (la apertura minada como producto)',
  !topicsV.some((x) => x.digest_anchor === 'Meet The Atlas'));
t('e3 todo anchor de producto de los topics está corroborado o no es un nombrado de caption',
  topicsV.every((x) => cd.namedItemCorroborated(dV, x.digest_anchor || '')));

// ---------------------------------------------------------------- (f) puerta unitaria
const dg = (entries) => ({ productos_nombrados: entries });
t('f1 entrada de caption sin clases (legada) NO corrobora: era la lista circular',
  cd.starNamedEvidenceOk(dg([{ nombre: 'The Salar', fuente: 'caption', menciones: 4 }]), 'The Salar') === false);
t('f2 solo «frase» (1 señal) no corrobora',
  cd.starNamedEvidenceOk(dg([{ nombre: 'The Salar', fuente: 'caption', clases: ['frase'] }]), 'The Salar') === false);
t('f3 solo «sujeto» (1 señal) no corrobora',
  cd.starNamedEvidenceOk(dg([{ nombre: 'The Atlas', fuente: 'caption', clases: ['frase', 'sujeto'] }]), 'The Atlas') === false);
// RE-PIN (lote FUNDAMENTO-QUE-DUDA): sujeto + repetida son dos
// señales de las MISMAS captions — la corroboración circular que
// coronó a «Infused» en Blind Barber. La coronación ahora exige
// una fuente externa (f5/f6 siguen pasando); las dos señales
// intra-caption quedan como ADMISIÓN al vocabulario de
// clasificación de fotos (namedEntryCandidata), no como corona.
t('f4 RE-PIN fundamento-que-duda: sujeto + repetida (intra-caption) ya NO corrobora',
  cd.starNamedEvidenceOk(dg([{ nombre: 'The Salar', fuente: 'caption', clases: ['frase', 'repetida', 'sujeto'] }]), 'The Salar') === false);
t('f5 catálogo + frase en el feed (2 superficies) corrobora',
  cd.starNamedEvidenceOk(dg([{ nombre: 'Salar', fuente: 'caption', clases: ['catalogo', 'frase'] }]), 'Salar') === true);
t('f6 entrada de fuente fuerte sin clases (legada) corrobora',
  cd.starNamedEvidenceOk(dg([{ nombre: 'Esplar', fuente: 'web-catalog', menciones: 0 }]), 'Esplar') === true);
t('f7 digest legado sin el campo: manda la composición de siempre',
  cd.starNamedEvidenceOk({}, 'Esplar') === true);
t('f8 «Model Photo» no pasa la puerta ni con una entrada a su nombre',
  cd.starNamedEvidenceOk(dg([{ nombre: 'Model Photo', fuente: 'caption', clases: ['frase', 'repetida', 'sujeto'] }]), 'Model Photo') === false);
t('f9 sin entrada en productos_nombrados no hay evidencia',
  cd.starNamedEvidenceOk(dg([]), 'The Salar') === false);
t('f10 el veto de rol no sobre-veta: «Model 3» no es rótulo (el 3 no es rol)',
  cd.isCreditRoleName('Model 3') === false && cd.isCreditRoleName('Model') === true && cd.isCreditRoleName('Model Photo') === true);

// ---------------------------------------------------------------- (g) menciones = frase completa
const anchMP = cd.anchorsFromTexts(['Model Photo']);
t('g1 pieceAnchored laxo (contrato de pertenencia) sigue aceptando 1 palabra',
  cd.pieceAnchored('the model wears new shoes today', anchMP).ok === true);
t('g2 pieceAnchored estricto: 1 palabra suelta NO es mención',
  cd.pieceAnchored('the model wears new shoes today', anchMP, { strictPhrase: true }).ok === false);
t('g3 pieceAnchored estricto: la frase completa en el crudo SÍ es mención',
  cd.pieceAnchored('behind the scenes of our model photo session', anchMP, { strictPhrase: true }).ok === true);
t('g4 en el crudo con menciones @…, «Model Photo» no existe como frase (estricto da falso)',
  cd.pieceAnchored('Model: @micari_micari Photo: @vincentdesailly', anchMP, { strictPhrase: true }).ok === false);

// ---------------------------------------------------------------- (h) dueño
const dD = cd.buildFromParts({
  business: 'Philz', category: 'cafe',
  dna: { productos: ['Tesora', 'Medialunas'], servicios: [] },
  web: null,
  feed: { bio: '', captions: ['Probá la Tesora, nuestra favorita', 'Tesora de siempre'], name: 'Philz', handle: 'philz', pic: '' },
  form: null,
});
dD.dueno = { estrella: 'Tesora' };
const effD = cd.effectiveStarOf(dD);
t('h1 la marca explícita del dueño (calce exacto) sigue mandando',
  !!effD && effD.item === 'Tesora' && effD.source === 'dueno');

// ---------------------------------------------------------------- (i) boot
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function portUsed(port) {
  try { return execSync("ss -ltn | grep -c ':" + port + " ' || true").toString().trim() !== '0'; }
  catch (e) { return false; }
}
async function main() {
  const port = 18777;
  t('i0 puerto ' + port + ' libre antes del boot', !portUsed(port));
  const dataDir = '/tmp/c8-estrella-data-' + process.pid;
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const env = Object.assign({}, process.env, {
    PORT: String(port), DATA_DIR: dataDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    OPENAI_API_KEY: '', SUPERVISION_HOOK_URL: '',
  });
  const child = spawn('node', ['server.js'], { cwd: REL, env, stdio: 'ignore' });
  let version = null;
  for (let i = 0; i < 60 && !version; i++) {
    await sleep(500);
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/api/version');
      if (r.ok) version = await r.json();
    } catch (e) { /* todavía no levanta */ }
  }
  t('i1 el server del release bootea y sirve /api/version', !!version);
  t('i2 BUILD servido = 20261105-v999',
    !!version && version.build === '20261105-v999');
  try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
  let freed = false;
  for (let i = 0; i < 20 && !freed; i++) { await sleep(300); freed = !portUsed(port); }
  if (!freed) { try { process.kill(child.pid, 'SIGKILL'); } catch (e) {} }
  for (let i = 0; i < 10 && !freed; i++) { await sleep(300); freed = !portUsed(port); }
  t('i3 puerto libre tras matar el boot por PID exacto', freed);
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\n' + pass + ' ok, ' + fail + ' fallas');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
