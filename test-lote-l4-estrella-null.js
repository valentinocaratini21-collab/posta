#!/usr/bin/env node
// LOTE L4 — ESTRELLA NULL ⇒ PRIMER POSTEO DEGRADADO HONESTO, NO TEMA
// GENÉRICO COMO WOW (diagnóstico Veja Q2, 12/11).
// Cuando la estrella efectiva es null, deriveFirstPostWow vendía el
// ítem N.º 1 de la lista como si fuera la estrella («RUNNING que todos
// piden» + «El favorito de la casa»). Ahora:
//  · ancla genérica de categoría (RUNNING, SANDALES, PROJET, zapatillas…)
//    → wow degradado a invitación de marca («Conocé VEJA»), sin ancla,
//    sin _star, marcado star_missing + star_retry_hint 'rederive-from-photo';
//  · ancla real sin confirmar (Esplar) → se ancla en ella como producto
//    más visible, SIN claims de estrella (nunca «que todos piden» ni
//    «favorito de la casa»), marcado star_missing + 'confirm-from-photo';
//  · estrella confirmada (Tesora) → idéntico a hoy, con _star.
// La marca viaja en specPosts[0].star_missing (buildDemoSpec) para que
// el gate y el reintento correctivo la vean antes de mostrar.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node
//   test-lote-l4-estrella-null.js (desde la raíz del release, con
//   DATA_DIR temporal para que el require de demo.js no cree data/).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCRATCH = fs.existsSync(path.join(__dirname, 'base-v932')) ? __dirname : path.dirname(__dirname);
const BASE = path.join(SCRATCH, 'base-v932');
const REL = path.join(SCRATCH, 'release');
const ROOT = fs.existsSync(path.join(__dirname, 'client-digest.js')) ? __dirname : REL;
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

const cd = require(path.join(ROOT, 'client-digest.js'));
const demo = require(path.join(ROOT, 'demo.js'));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ''); }
};
const words = (s) => String(s || '').split(/\s+/).filter(Boolean).length;

// ── Fixtures ──
function vejaDigest() {
  // Reproducción del diagnóstico Q2: menú-cuerpo de veja-store.com,
  // sin estrella inferida ni declarada.
  return {
    business: 'Veja EMEA', category: 'moda', subcat: 'calzado',
    productos: ['RUNNING', 'SANDALES', 'accessoires', 'NOUVEAUTés', 'PROJET'].map((n) => ({ nombre: n })),
    servicios: [], temas_feed: [],
    diferencial: 'VEJA crée des sneakers avec du coton bio.',
    inferred_star: null, dueno: null, onboarding: null, etapa: '',
  };
}
function esplarSinEstrella() {
  // Pin de ingesta: inferred de cromo, ítem real Esplar en la lista.
  return {
    business: 'Veja', category: 'ropa', subcat: 'calzado',
    productos: [{ nombre: 'Customer Services' }, { nombre: 'Esplar' }], servicios: [],
    temas_feed: ['sneakers responsables'], diferencial: '',
    inferred_star: { item: 'Customer Services', confidence: 0.9, fuente: 'inferido', evidence: [] },
    dueno: null, onboarding: null, etapa: '',
  };
}
function philzDigest() {
  return {
    business: 'Philz Coffee', category: 'cafeteria', subcat: null,
    productos: [{ nombre: 'Tesora', precio: '$18' }, { nombre: 'Mint Mojito', precio: '$12' }],
    servicios: [], temas_feed: ['pour-over taza a taza'],
    diferencial: 'Tesora, el primero de Phil: caramelo y nuez, pour-over taza a taza, sin espresso, sin lattes.',
    inferred_star: { item: 'Tesora', confidence: 0.9 },
    onboarding: {}, etapa: '',
  };
}
function trialSpec(digest, opts) {
  return demo.buildDemoSpec(Object.assign({
    business: digest.business, category: digest.category || 'moda', country: 'US', tone: 'vos',
    photoPath: null, goal: '', goal_key: '', accent: '#2793C8', btn: '#FEC14D',
    count: 5, bioText: '', profilePicPath: null, feedRegister: null,
    extraPhotos: [], digest, lang: 'es', trialNoStock: true,
    draft: null, firmaStyle: null, firmaSinVideo: false, estiloVisual: null,
  }, opts || {}));
}

// ── A. Estático y cableado ──
{
  const srv = fs.readFileSync(path.join(REL, 'server.js'), 'utf-8');
  ok('A1 BUILD v932 ×1 en server.js (sin estampar)', (srv.match(/20261105-v932/g) || []).length === 1, (srv.match(/20261105-v932/g) || []).length);
  ok('A2 server.js SIN TOCAR (md5 == base)', md5(path.join(REL, 'server.js')) === md5(path.join(BASE, 'server.js')));
  ok('A3 client-digest.js cambió', md5(path.join(REL, 'client-digest.js')) !== md5(path.join(BASE, 'client-digest.js')));
  ok('A4 demo.js cambió', md5(path.join(REL, 'demo.js')) !== md5(path.join(BASE, 'demo.js')));
  for (const f of ['public/app.js', 'public/styles.css', 'public/index.html', 'public/en/index.html']) {
    ok(`A5 ${f} byte-idéntico a base (el lote no lo toca)`, md5(path.join(REL, f)) === md5(path.join(BASE, f)), f);
  }
  ok('A6 isGenericAnchorName exportado', typeof cd.isGenericAnchorName === 'function');
  const cdSrc = fs.readFileSync(path.join(REL, 'client-digest.js'), 'utf-8');
  ok('A7 deriveFirstPostWow marca star_missing', /star_missing: true/.test(cdSrc));
  ok('A8 demo.js propaga star_missing a specPosts[0]', /specPosts\[0\]\.star_missing = true/.test(fs.readFileSync(path.join(REL, 'demo.js'), 'utf-8')));
}

// ── B. isGenericAnchorName: forma de rótulo vs modelo real ──
{
  for (const n of ['RUNNING', 'SANDALES', 'PROJET', 'SALE']) ok(`B genérico por forma: ${n}`, cd.isGenericAnchorName(n) === true, n);
  for (const n of ['zapatillas', 'perfume', 'café', 'sneakers']) ok(`B genérico por tipo v924: ${n}`, cd.isGenericAnchorName(n) === true, n);
  for (const n of ['Esplar', 'Campo', 'V-10', 'Tesora', 'Medialuna', 'Milk Chocolate Chip', 'Mojave Ghost', 'AIR FORCE 1', 'Limpieza de cutis']) ok(`B producto real: ${n}`, cd.isGenericAnchorName(n) === false, n);
  ok('B NEW (3 letras) no lo caza la forma — límite documentado', cd.isGenericAnchorName('NEW') === false);
  ok('B accessoires/NOUVEAUTés no los caza la forma — los pela L5', cd.isGenericAnchorName('accessoires') === false && cd.isGenericAnchorName('NOUVEAUTés') === false);
  ok('B vacío es genérico', cd.isGenericAnchorName('') === true && cd.isGenericAnchorName(null) === true);
}

// ── C. Estrella confirmada: idéntico a hoy (pins v907) ──
{
  const w = cd.deriveFirstPostWow(philzDigest(), { category: 'cafeteria', lang: 'es' });
  ok('C1 Philz ES: gancho con la estrella', w && w.headline === 'Tesora que todos piden', w && w.headline);
  ok('C2 Philz: _star 1 y sin star_missing', w && w._star === 1 && !w.star_missing, w);
  ok('C3 Philz: ancla Tesora', w && w.digest_anchor === 'Tesora', w && w.digest_anchor);
  const wEn = cd.deriveFirstPostWow(philzDigest(), { category: 'cafeteria', lang: 'en' });
  ok('C4 Philz EN: gancho con la estrella ≤6', wEn && wEn.headline.includes('Tesora') && words(wEn.headline) <= 6, wEn && wEn.headline);
  ok('C5 Philz EN: CTA de producto', wEn && /Order yours today by DM/.test(wEn.caption), wEn && wEn.caption);
}

// ── D. Estrella null + producto real: ancla sin claim de estrella ──
{
  const wEn = cd.deriveFirstPostWow(esplarSinEstrella(), { lang: 'en' });
  ok('D1 Esplar EN: nombra Esplar (pin ingesta)', wEn && /Esplar/.test(String(wEn.headline || '')), wEn && wEn.headline);
  ok('D2 Esplar EN: sin claim de popularidad', wEn && !/everyone's asking for/i.test(String(wEn.headline || '')), wEn && wEn.headline);
  ok('D3 Esplar EN: headline neutro', wEn && wEn.headline === 'Try Esplar today', wEn && wEn.headline);
  ok('D4 Esplar: star_missing + confirm-from-photo', wEn && wEn.star_missing === true && wEn.star_retry_hint === 'confirm-from-photo', wEn);
  ok('D5 Esplar: sin _star (no es estrella confirmada)', wEn && !wEn._star, wEn);
  ok('D6 Esplar: ancla Esplar (producto más visible)', wEn && wEn.digest_anchor === 'Esplar', wEn && wEn.digest_anchor);
  ok('D7 Esplar: caption sin favorito de la casa', wEn && !/favorito de la casa|house favorite/i.test(String(wEn.caption || '')), wEn && wEn.caption);
  ok('D8 Esplar: image_prompt sigue nombrando el producto', wEn && /Esplar/.test(String(wEn.image_prompt || '')), wEn && wEn.image_prompt);
  const wEs = cd.deriveFirstPostWow(esplarSinEstrella(), { lang: 'es' });
  ok('D9 Esplar ES: headline neutro con Esplar', wEs && wEs.headline === 'Esplar, probalo hoy', wEs && wEs.headline);
  ok('D10 Esplar ES: sin que todos piden', wEs && !/que todos piden/i.test(String(wEs.headline || '')), wEs && wEs.headline);
}

// ── E. Estrella null + ancla genérica (Veja real): invitación de marca ──
{
  const w = cd.deriveFirstPostWow(vejaDigest(), { category: 'moda', lang: 'es' });
  ok('E1 Veja ES: headline de marca', w && w.headline === 'Conocé Veja EMEA', w && w.headline);
  ok('E2 Veja: sin RUNNING/SANDALES/PROJET en headline', w && !/RUNNING|SANDALES|PROJET/i.test(String(w.headline || '')), w && w.headline);
  ok('E3 Veja: sin tema genérico en caption', w && !/RUNNING|SANDALES|PROJET/i.test(String(w.caption || '')), w && w.caption);
  ok('E4 Veja: sin tema genérico en image_prompt', w && !/RUNNING|SANDALES|PROJET/i.test(String(w.image_prompt || '')), w && w.image_prompt);
  ok('E5 Veja: digest_anchor null', w && w.digest_anchor === null, w && w.digest_anchor);
  ok('E6 Veja: star_missing + rederive-from-photo', w && w.star_missing === true && w.star_retry_hint === 'rederive-from-photo', w);
  ok('E7 Veja: sin _star', w && !w._star, w);
  ok('E8 Veja: sigue siendo el wow del día 1', w && w._wow === 1 && w._digest === 1, w);
  ok('E9 Veja: caption sin favorito ni que todos piden', w && !/favorito|que todos piden/i.test(String(w.caption || '')), w && w.caption);
  ok('E10 Veja: CTA de marca (Quiero saber más)', w && w.cta === 'Quiero saber más', w && w.cta);
  const wEn = cd.deriveFirstPostWow(vejaDigest(), { category: 'moda', lang: 'en' });
  ok('E11 Veja EN: headline de marca', wEn && wEn.headline === 'Meet Veja EMEA', wEn && wEn.headline);
  ok('E12 Veja EN: CTA de marca', wEn && wEn.cta === 'Tell me more', wEn && wEn.cta);
}

// ── F. Estrella null + tipo genérico v924: también degrada ──
{
  const d = { business: 'Zapatería León', category: 'moda', subcat: 'calzado',
    productos: [{ nombre: 'zapatillas' }, { nombre: 'perfume' }], servicios: [], temas_feed: [],
    diferencial: '', inferred_star: null, dueno: null, onboarding: null, etapa: '' };
  const w = cd.deriveFirstPostWow(d, { category: 'moda', lang: 'es' });
  ok('F1 tipo genérico: headline de marca', w && w.headline === 'Conocé Zapatería León', w && w.headline);
  ok('F2 tipo genérico: anchor null + star_missing', w && w.digest_anchor === null && w.star_missing === true, w);
}

// ── G. La marca viaja en el spec (buildDemoSpec) ──
{
  const sV = trialSpec(vejaDigest());
  ok('G1 spec Veja: star_missing en specPosts[0]', sV.specPosts[0] && sV.specPosts[0].star_missing === true, sV.specPosts[0]);
  ok('G2 spec Veja: hint rederive-from-photo', sV.specPosts[0] && sV.specPosts[0].star_retry_hint === 'rederive-from-photo', sV.specPosts[0]);
  ok('G3 spec Veja: headline de marca en el spec', sV.specPosts[0] && sV.specPosts[0].headline === 'Conocé Veja EMEA', sV.specPosts[0] && sV.specPosts[0].headline);
  ok('G4 spec Veja: topics[0] también marcado', sV.topics[0] && sV.topics[0].star_missing === true, sV.topics[0]);
  const sE = trialSpec(esplarSinEstrella(), { lang: 'en' });
  ok('G5 spec Esplar: star_missing + confirm-from-photo', sE.specPosts[0] && sE.specPosts[0].star_missing === true && sE.specPosts[0].star_retry_hint === 'confirm-from-photo', sE.specPosts[0]);
  const sP = trialSpec(philzDigest(), { extraPhotos: [{ path: '/media/tesora-cup.jpg', url: 'https://philzcoffee.com/tesora-cup.jpg', temas: ['cafe'] }] });
  ok('G6 spec Philz: sin star_missing (confirmada)', sP.specPosts[0] && !sP.specPosts[0].star_missing, sP.specPosts[0]);
  ok('G7 spec Philz: headline intacto', sP.specPosts[0] && sP.specPosts[0].headline === 'Tesora que todos piden', sP.specPosts[0] && sP.specPosts[0].headline);
}

// ── H. Sin evidencia: no se inventa nada (comportamiento previo) ──
{
  ok('H1 sin fundamento no hay wow', cd.deriveFirstPostWow(cd.emptyDigest(), { category: 'cafeteria', lang: 'es' }) === null);
  const soloCromo = { business: 'X', category: 'moda', subcat: null,
    productos: [{ nombre: 'Customer Services' }, { nombre: 'Legal' }], servicios: [], temas_feed: [],
    diferencial: '', inferred_star: null, dueno: null, onboarding: null, etapa: '' };
  ok('H2 solo cromo no hay wow', cd.deriveFirstPostWow(soloCromo, { category: 'moda', lang: 'es' }) === null);
  const dPre = philzDigest(); dPre.etapa = 'pre-lanzamiento';
  ok('H3 pre-lanzamiento no hay wow', cd.deriveFirstPostWow(dPre, { category: 'cafeteria', lang: 'es' }) === null);
}

// ── I. Limpieza ──
{
  ok('I1 sin release/data/', !fs.existsSync(path.join(REL, 'data')));
  ok('I2 sin node_modules/ en release', !fs.existsSync(path.join(REL, 'node_modules')));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
