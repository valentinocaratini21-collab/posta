#!/usr/bin/env node
// LOTE PRIMER-POSTEO-ESPECTACULAR v907 (Valentino 11/11 + refinamiento):
// el primer posteo de la prueba es el wow: la estrella real POR NOMBRE
// (Tesora / Mint Mojito / Jacob's Wonderbar), el ritual propio de la
// marca, y NUNCA lo que la marca no vende (Philz: nada de latte art ni
// nada con espresso).
// La suite prueba el PROMPT del primer posteo (tema wow + spec + caption
// final), no una llamada real a la IA: el boot local no tiene claves.
// Uso: node test-lote-primer-posteo-espectacular.js  (desde la raíz del
// scratch o desde release/ — resuelve los módulos solo).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRATCH = fs.existsSync(path.join(__dirname, 'base-v903')) ? __dirname : path.dirname(__dirname);
const BASE = path.join(SCRATCH, 'base-v903');
const REL = path.join(SCRATCH, 'release');
const ROOT = fs.existsSync(path.join(__dirname, 'client-digest.js')) ? __dirname : REL;
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

const cd = require(path.join(ROOT, 'client-digest.js'));
const demo = require(path.join(ROOT, 'demo.js'));
const captions = require(path.join(ROOT, 'demo-captions.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); }
};
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

// ── Fixture Philz (sintético, con los datos verificados por Valentino:
// Tesora = blend insignia, el primero de Phil, caramelo y nuez · Mint
// Mojito = la más vendida, menta fresca con crema, «House Way» ·
// Jacob's Wonderbar = tueste oscuro, chocolate y humo. Philz no hace
// lattes ni nada con espresso.) ───────────────
const PHILZ_DIF = 'Tesora, el primero de Phil: caramelo y nuez, pour-over taza a taza, sin espresso, sin lattes.';
const PHILZ_STARS = ['Tesora', 'Mint Mojito', "Jacob's Wonderbar"];
function philzDigest() {
  return {
    business: 'Philz Coffee', category: 'cafeteria', subcat: null,
    productos: [
      { nombre: 'Tesora', precio: '$18' },
      { nombre: 'Mint Mojito', precio: '$12' },
      { nombre: "Jacob's Wonderbar", precio: '$19' },
    ],
    servicios: [],
    temas_feed: ['pour-over taza a taza', 'Tesora', 'Mint Mojito House Way'],
    diferencial: PHILZ_DIF,
    inferred_star: { item: 'Tesora', confidence: 0.9 },
    onboarding: { diferencial: PHILZ_DIF },
    etapa: '',
    // (v907 · marca en la foto) Dos fotos de Tesora: la taza sola (sin
    // marca visible) y la bolsa con marca (vaso + bolsas, la foto de
    // referencia). La taza va PRIMERA en la lista: la preferencia por
    // la foto con marca tiene que ganarle al orden de la lista.
    photo_map: { entries: {
      'https://philzcoffee.com/tesora-cup.jpg': { item: 'Tesora', confianza: 0.9 },
      'https://philzcoffee.com/tesora-bag.jpg': { item: 'Tesora', confianza: 0.95, marca: true },
      'https://philzcoffee.com/mint-mojito.jpg': { item: 'Mint Mojito', confianza: 0.9 },
    }, at: new Date().toISOString() },
  };
}
function philzPhotos() {
  return [
    { path: '/media/tesora-cup.jpg', url: 'https://philzcoffee.com/tesora-cup.jpg', temas: ['cafe'] },
    { path: '/media/tesora-bag.jpg', url: 'https://philzcoffee.com/tesora-bag.jpg', temas: ['cafe'] },
    { path: '/media/mint-mojito.jpg', url: 'https://philzcoffee.com/mint-mojito.jpg', temas: ['cafe'] },
    { path: '/media/wonderbar.jpg', url: 'https://philzcoffee.com/wonderbar.jpg', temas: ['cafe'] },
    { path: '/media/local-1.jpg', url: 'https://philzcoffee.com/local-1.jpg', temas: ['cafe'] },
  ];
}
function trialSpec(digest, opts) {
  return demo.buildDemoSpec(Object.assign({
    business: 'Philz Coffee', category: 'cafeteria', country: 'US', tone: 'vos',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: null, feedRegister: null,
    extraPhotos: philzPhotos(), digest, lang: 'es', trialNoStock: true,
    draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null,
  }, opts || {}));
}

// ── A. Negativos por marca (de SUS palabras, no de una lista fija) ──
{
  const negs = cd.brandNegatives(philzDigest());
  ok('A1 negativos: sale espresso', negs.includes('espresso'), negs);
  ok('A2 negativos: sale lattes', negs.includes('lattes'), negs);
  ok('A3 negativos: latte art implicado (sin latte/espresso no hay latte art)', negs.includes('latte art'), negs);
  ok('A4 negativos: el método propio NO es negativo (pour-over no se prohíbe)', !negs.some((t) => /pour-over|pour over/.test(t)), negs);
  ok('A5 negativos: como mucho 4', negs.length <= 4, negs);
  ok('A6 sin texto de negación no se inventa ningún negativo', cd.brandNegatives({ diferencial: 'Café de especialidad tostado en casa.', temas_feed: [] }).length === 0);
}

// ── B. El tema wow (Philz, ES) ──
{
  const w = cd.deriveFirstPostWow(philzDigest(), { category: 'cafeteria', lang: 'es' });
  ok('B1 wow existe', !!w, w);
  ok('B2 wow ancla la estrella inferida (Tesora)', w && w.digest_anchor === 'Tesora', w && w.digest_anchor);
  ok('B3 titular nombra la estrella', w && w.headline.includes('Tesora'), w && w.headline);
  ok('B4 titular es gancho (no el nombre pelado)', w && w.headline !== 'Tesora' && /que todos piden/.test(w.headline), w && w.headline);
  ok('B5 titular ≤6 palabras', w && words(w.headline) <= 6, w && w.headline);
  ok('B6 titular no es la plantilla genérica', w && w.headline !== 'Nuevo blend de la casa', w && w.headline);
  ok('B7 caption nombra la estrella', w && w.caption.includes('Tesora'), w && w.caption);
  ok('B8 caption trae el ritual propio (pour-over taza a taza)', w && /pour-over taza a taza/.test(w.caption), w && w.caption);
  ok('B9 caption trae el precio real ($18)', w && w.caption.includes('$18'), w && w.caption);
  ok('B10 caption cierra con CTA por DM', w && /Pedilo hoy por DM/.test(w.caption), w && w.caption);
  ok('B11 caption: 3 bloques como mucho', w && w.caption.split(/\n\s*\n/).filter(Boolean).length <= 3, w && w.caption);
  ok('B12 image_prompt nombra la estrella', w && w.image_prompt.includes('Tesora'), w && w.image_prompt);
  ok('B13 image_prompt trae el ritual', w && /pour-over taza a taza/.test(w.image_prompt), w && w.image_prompt);
  ok('B14 image_prompt PROHÍBE lo que no vende (NO mostrar)', w && /NO mostrar:/.test(w.image_prompt), w && w.image_prompt);
  ok('B15 image_prompt prohíbe latte art', w && /latte art/.test(w.image_prompt), w && w.image_prompt);
  ok('B16 image_prompt prohíbe espresso', w && /espresso/.test(w.image_prompt), w && w.image_prompt);
  ok('B17 tema foto = cafe (la foto real de Tesora puede calzar)', w && w.tema === 'cafe', w && w.tema);
  ok('B18 marcador _wow + _digest + _star', w && w._wow === 1 && w._digest === 1 && w._star === 1, w);
  ok('B19 image_prompt: la marca va DENTRO de la escena', w && /dentro de la escena/.test(w.image_prompt), w && w.image_prompt);
  ok('B20 image_prompt: nunca como banda diseñada ni logo aplicado', w && /Nunca como banda diseñada ni logo aplicado/.test(w.image_prompt), w && w.image_prompt);
  ok('B21 image_prompt: foto real del cliente', w && /Foto real del cliente/.test(w.image_prompt), w && w.image_prompt);
}

// ── C. La semana de prueba: el slot 0 es el wow ──
{
  const spec = trialSpec(philzDigest());
  const t0 = spec.topics[0];
  ok('C1 slot 0 es el wow', !!t0._wow, t0);
  ok('C2 slot 0 ancla Tesora', t0.digest_anchor === 'Tesora', t0.digest_anchor);
  ok('C3 slot 0 titular gancho ≤6', t0.headline === 'Tesora que todos piden' && words(t0.headline) <= 6, t0.headline);
  ok('C4 día 2 no repite la estrella (rotación)', spec.topics[1].digest_anchor !== 'Tesora', spec.topics[1].digest_anchor);
  ok('C5 ningún día repite el producto del anterior', spec.topics.every((t, i, a) => i === 0 || String(t.digest_anchor || '') !== String(a[i - 1].digest_anchor || '')), spec.topics.map((t) => t.digest_anchor));
  ok('C6 la plantilla genérica no aparece en ningún titular', !spec.topics.some((t) => t.headline === 'Nuevo blend de la casa'), spec.topics.map((t) => t.headline));
  ok('C7 slot 0 lleva texto quemado (el gancho SE VE)', spec.specPosts[0].text_mode === 'text', spec.specPosts[0].text_mode);
  ok('C8 dosificación intacta: exactamente 2 piezas con texto', spec.specPosts.filter((p) => p.text_mode === 'text').length === 2, spec.specPosts.map((p) => p.text_mode));
  ok('C9 slot 0 con foto REAL de Tesora CON LA MARCA en la escena (la bolsa le gana a la taza sola aunque la taza vaya primera en la lista)', spec.specPosts[0].photo === '/media/tesora-bag.jpg' && spec.specPosts[0].photo_product === 'Tesora', { photo: spec.specPosts[0].photo, pp: spec.specPosts[0].photo_product });
  ok('C9b slot 1 (no wow) no roba la foto con marca: usa su foto de producto', spec.specPosts[1].photo === '/media/mint-mojito.jpg', spec.specPosts[1].photo);
  ok('C10 image_prompt viaja en el spec (slot 0)', /NO mostrar:.*latte art/.test(spec.specPosts[0].image_prompt || ''), spec.specPosts[0].image_prompt);
  ok('C11 solo el slot 0 lleva image_prompt', spec.specPosts.slice(1).every((p) => !p.image_prompt), spec.specPosts.map((p) => p.image_prompt || null));
  ok('C12 slot 0 titular en el diseño ≤6 palabras', words(spec.specPosts[0].headline) <= 6 && spec.specPosts[0].headline.includes('Tesora'), spec.specPosts[0].headline);
}

// ── C2. La línea de voz no pisa el gancho ──
{
  const d = philzDigest();
  d.voz_marcadores = ['Tesora es lo mejor'];
  const spec = trialSpec(d);
  ok('C13 voz propia no reescribe el titular wow', spec.specPosts[0].headline === 'Tesora que todos piden', spec.specPosts[0].headline);
}

// ── D. El caption final (el que ve el cliente) ──
{
  const spec = trialSpec(philzDigest());
  const r = captions.resolveTrialCaption(spec.topics, 'cafeteria', { business: 'Philz Coffee', tone: 'vos', country: 'US', idx: 0, goalLine: '', lang: 'es', prevCaptions: [], voiceLine: '' });
  ok('D1 caption final es el del tema wow (sin fallback)', !r.fallback && r.topicIndex === 0, { fallback: r.fallback, topicIndex: r.topicIndex });
  ok('D2 caption final nombra Tesora', r.caption.includes('Tesora'), r.caption);
  ok('D3 caption final trae ritual + precio', /pour-over taza a taza/.test(r.caption) && r.caption.includes('$18'), r.caption);
  ok('D4 caption final no es el genérico', !r.caption.includes('Nuevo blend de la casa') && !r.caption.includes('Tostado esta semana, de origen único'), r.caption);
}

// ── E. Regresión: fuera de la prueba nada cambia ──
{
  const spec = trialSpec(philzDigest(), { trialNoStock: false });
  ok('E1 sin trial el slot 0 NO es wow', !spec.topics[0]._wow, spec.topics[0]);
  ok('E2 sin trial el slot 0 sigue siendo la novedad clásica (nombre pelado)', spec.topics[0].headline === 'Tesora' && spec.topics[0].digest_anchor === 'Tesora', spec.topics[0].headline);
  ok('E3 sin trial no viaja image_prompt', spec.specPosts[0].image_prompt === undefined, spec.specPosts[0].image_prompt);
  const baseCd = require(path.join(BASE, 'client-digest.js'));
  const a = cd.deriveTopics(philzDigest(), { count: 5, category: 'cafeteria', lang: 'es' });
  const b = baseCd.deriveTopics(philzDigest(), { count: 5, category: 'cafeteria', lang: 'es' });
  ok('E4 deriveTopics byte-idéntico a v903 (el lote no lo toca)', JSON.stringify(a) === JSON.stringify(b), { a: a.length, b: b.length });
}

// ── F. Sin evidencia / pre-lanzamiento: no se inventa nada ──
{
  ok('F1 sin fundamento no hay wow', cd.deriveFirstPostWow(cd.emptyDigest(), { category: 'cafeteria', lang: 'es' }) === null);
  const d = philzDigest(); d.etapa = 'pre-lanzamiento';
  ok('F2 pre-lanzamiento no hay wow (presentación, no venta)', cd.deriveFirstPostWow(d, { category: 'cafeteria', lang: 'es' }) === null);
  const spec = trialSpec(cd.emptyDigest());
  ok('F3 sin fundamento el slot 0 es el catálogo de siempre (documentado: la puerta fail-closed lo frena antes en /api/trial/generate)', spec.topics[0].headline === 'Nuevo blend de la casa', spec.topics[0].headline);
}

// ── G. EN ──
{
  const w = cd.deriveFirstPostWow(philzDigest(), { category: 'cafeteria', lang: 'en' });
  ok('G1 EN: gancho con la estrella ≤6', w && w.headline.includes('Tesora') && words(w.headline) <= 6, w && w.headline);
  ok('G2 EN: image_prompt prohíbe (DO NOT show)', w && /DO NOT show:/.test(w.image_prompt), w && w.image_prompt);
  ok('G3 EN: prohíbe latte art + espresso', w && /latte art/.test(w.image_prompt) && /espresso/.test(w.image_prompt), w && w.image_prompt);
  ok('G4 EN: caption con CTA en inglés', w && /Order yours today by DM/.test(w.caption), w && w.caption);
}

// ── H. Servicios (otra familia, mismo mecanismo) ──
{
  const d = {
    business: 'Estudio Alma', category: 'belleza', subcat: null,
    productos: [], servicios: [{ nombre: 'Limpieza de cutis', precio: '$45' }],
    temas_feed: ['limpieza de cutis'],
    diferencial: 'Limpieza profunda con aparatología, sin agujas, sin dolor.',
    inferred_star: { item: 'Limpieza de cutis', confidence: 0.8 },
    onboarding: {}, etapa: '',
  };
  const w = cd.deriveFirstPostWow(d, { category: 'belleza', lang: 'es' });
  ok('H1 servicios: gancho con el servicio por nombre', w && w.headline.includes('Limpieza de cutis') && words(w.headline) <= 6, w && w.headline);
  ok('H2 servicios: CTA de servicio (Quiero saber más)', w && w.cta === 'Quiero saber más', w && w.cta);
  ok('H3 servicios: negativo propio (sin agujas)', w && w.negativos.includes('agujas'), w && w.negativos);
  ok('H4 servicios: image_prompt prohíbe agujas', w && /NO mostrar:.*agujas/.test(w.image_prompt), w && w.image_prompt);
}

// ── I. Antes / después con Philz (la plantilla real vs el wow) ──
{
  const antes = captions.DEMO_TOPICS.cafeteria[0];
  const despues = cd.deriveFirstPostWow(philzDigest(), { category: 'cafeteria', lang: 'es' });
  ok('I1 ANTES es la plantilla real del catálogo', antes.headline === 'Nuevo blend de la casa' && antes.caption.includes('Tostado esta semana, de origen único'), antes.headline);
  ok('I2 DESPUÉS nombra una estrella real', PHILZ_STARS.some((s) => despues.headline.includes(s)), despues.headline);
  ok('I3 DESPUÉS no es el genérico', despues.headline !== antes.headline && !despues.caption.includes('Tostado esta semana, de origen único'), despues.headline);
  ok('I4 DESPUÉS trae nombre real + ritual propio', despues.caption.includes('Tesora') && /pour-over taza a taza/.test(despues.caption), despues.caption);
  ok('I5 DESPUÉS prohíbe lo que Philz no vende', /latte art/.test(despues.image_prompt), despues.image_prompt);
}

// ── J. Estampado ──
{
  const srv = fs.readFileSync(path.join(REL, 'server.js'), 'utf-8');
  ok('J1 BUILD v907 ×1 en server.js', (srv.match(/20261105-v907/g) || []).length === 1, (srv.match(/20261105-v907/g) || []).length);
  ok('J2 BUILD v903 ×0 en server.js', !srv.includes('20261105-v903'));
  ok('J3 trialPostPrompt muestra el image_prompt en el detalle (1 línea: guarda + uso)', srv.split('\n').filter((l) => l.includes('sp.image_prompt')).length === 1, srv.split('\n').filter((l) => l.includes('sp.image_prompt')).length);
  for (const f of ['public/app.js', 'public/styles.css', 'public/index.html', 'public/en/index.html']) {
    ok(`J4 ${f} byte-idéntico a v903 (el lote no lo toca)`, md5(path.join(REL, f)) === md5(path.join(BASE, f)), f);
  }
  ok('J5 demo.js cambió (el swap del wow)', md5(path.join(REL, 'demo.js')) !== md5(path.join(BASE, 'demo.js')));
  ok('J6 client-digest.js cambió (deriveFirstPostWow)', md5(path.join(REL, 'client-digest.js')) !== md5(path.join(BASE, 'client-digest.js')));
  ok('J7 deep-read.js cambió (visión: marca visible en la foto)', md5(path.join(REL, 'deep-read.js')) !== md5(path.join(BASE, 'deep-read.js')));
}

// ── L. La marca va dentro de la foto (refinamiento 2 de Valentino) ──
{
  // L1: la visión clasifica también si la marca se ve en la foto.
  const dr = fs.readFileSync(path.join(ROOT, 'deep-read.js'), 'utf8');
  ok('L1 el prompt de visión de fotos pregunta si se ve LA MARCA (logo/packaging/letrero)', /LA MARCA del negocio \(su logo, su packaging con marca, su letrero/.test(dr), 'prompt classifyDigestPhotos');
  ok('L2 el prompt pide "marca":true en el JSON de respuesta', /"marca":true/.test(dr), 'shape classifyDigestPhotos');
  // L3: el mapa guarda la marca (sanitize no la tira).
  const san = cd.sanitizePhotoEntries({ u1: { item: 'Tesora', confianza: 0.95, marca: true }, u2: { item: 'Mint Mojito', confianza: 0.9 } });
  ok('L3 sanitizePhotoEntries guarda marca:true', san.u1 && san.u1.marca === true, san.u1);
  ok('L4 sanitizePhotoEntries no inventa marca donde no la hay', san.u2 && !('marca' in san.u2), san.u2);
  // L5: el helper lee el dato.
  const dg = philzDigest();
  ok('L5 photoBrandVisible: bolsa con marca = true', cd.photoBrandVisible(dg, 'https://philzcoffee.com/tesora-bag.jpg') === true);
  ok('L6 photoBrandVisible: taza sola = false', cd.photoBrandVisible(dg, 'https://philzcoffee.com/tesora-cup.jpg') === false);
  // L7: el image_prompt EN lleva la marca dentro de la escena.
  const wEn = cd.deriveFirstPostWow(philzDigest(), { lang: 'en' });
  ok('L7 image_prompt EN: brand inside the scene', wEn && /inside the scene/.test(wEn.image_prompt), wEn && wEn.image_prompt);
  ok('L8 image_prompt EN: never as a designed band', wEn && /Never as a designed band/.test(wEn.image_prompt), wEn && wEn.image_prompt);
  // L9: el pickWebPhoto del wow prefiere la foto con marca (C9 ya lo
  // prueba en la semana completa; acá queda asentado el mecanismo).
  const demoSrc = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');
  ok('L9 demo.js: rango 0 del wow = producto + marca_visible', /topic\._wow && productHit\(w\) && w\.marca_visible/.test(demoSrc));
  ok('L10 demo.js: el webPool se anota con marca_visible', /clientDigest\.photoBrandVisible\(digest, w\.url\)/.test(demoSrc));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
