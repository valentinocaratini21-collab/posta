'use strict';
/* Suite LOTE CORRECTIVO-4 · ESTRELLA-CON-NOMBRE (BUILD provisorio v986)
 * La estrella de un negocio nuevo salía genérica («cafe», «RUNNING»)
 * porque la extracción no levantaba productos con nombre y la
 * validación calzaba contra ese mismo material flojo; y la bienvenida
 * afirmaba «con tu producto real» sin verificación.
 * Acá se prueba:
 *  (a) tipo Hungry Ghost: captions con producto con nombre + categorías
 *      → la estrella es el producto con nombre, nunca el genérico.
 *  (b) tipo Veja: solo la línea «running» y categorías → sin estrella
 *      (star_missing, wow neutro) y la bienvenida NO afirma producto.
 *  (c) el dueño declara un genérico → rechazado como estrella.
 *  (d) el dueño declara un producto real con evidencia → aceptado
 *      (una palabra «Tesora», sigla con guion «V-10», catálogo «Esplar»).
 *  (e) el camino del demo no usa/guarda estrella sin validar
 *      (mas_vendido genérico no corona; la estrella guardada como del
 *      dueño sin evidencia no manda; el scrub al guardar la anula).
 *  (f) bienvenida honesta: afirma solo con verificación (ES/EN) y la
 *      frase marcadora de L10 se conserva en ambas redacciones.
 *  (g) smoke de boot: /api/version sirve el BUILD del lote.
 * Control sobre la BASE v980: (a),(b),(c),(e),(f) reproducen el
 * comportamiento viejo (estrella genérica / afirmación sin chequear).
 * Uso: node test-lote-correctivo-4-estrella.js */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const REL = __dirname;
const BASE = path.resolve(REL, '..', 'base-v980');
const cd = require(path.join(REL, 'client-digest'));
const gt = require(path.join(REL, 'guest-trial'));
const cdB = require(path.join(BASE, 'client-digest'));
const gtB = require(path.join(BASE, 'guest-trial'));

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('ok -', name); }
  else { fail++; console.log('FALLA -', name); }
}

// ---------------------------------------------------------------- fixtures
const CAPS_HG = [
  'Fresh Good Batch is back this week ☕ small-batch beans, roasted in house',
  'the Fresh Good Batch with oat milk, our way',
  'Fresh Good Batch restock — grab yours',
  'coffee and pastry kind of morning at the shop',
  'slow mornings, good coffee, fresh pastry',
];
const mkHG = (mod) => mod.buildFromParts({
  business: 'Hungry Ghost Coffee', category: 'cafe',
  web: { name: 'Hungry Ghost Coffee', description: 'Coffee shop', services: ['Coffee', 'Pastry', 'Catering'], city: 'NYC', palette: [], url: 'https://hungryghost.example', categoryHint: '' },
  feed: { bio: 'Coffee & pastry', captions: CAPS_HG, name: 'Hungry Ghost Coffee', handle: 'hungryghostcoffee', pic: '' },
  form: null,
});
const CAPS_VJ = [
  'Running days are the best days. Our running line, made to move',
  'RUNNING — new colors for the running collection',
  'running running running, siempre running',
  'sneakers for running and for everything else',
];
const mkVJ = (mod) => mod.buildFromParts({
  business: 'Veja', category: 'calzado',
  web: { name: 'Veja', description: 'Sneakers', services: ['Running', 'Sneakers'], city: '', palette: [], url: 'https://veja.example', categoryHint: '' },
  feed: { bio: 'Sneakers', captions: CAPS_VJ, name: 'Veja', handle: 'veja', pic: '' },
  form: null,
});

// ---------------------------------------------------------------- (a) HG
const dHG = mkHG(cd);
t('a1 el digest guarda productos_nombrados con el producto de las captions',
  Array.isArray(dHG.productos_nombrados) && dHG.productos_nombrados.some((x) => x.nombre === 'Fresh Good Batch' && x.fuente === 'caption'));
t('a2 productos_nombrados no incluye categorías (coffee/pastry)',
  !dHG.productos_nombrados.some((x) => /^(coffee|cafe|pastry)$/i.test(x.nombre)));
const effHG = cd.effectiveStarOf(dHG);
// RE-PIN (lote FUNDAMENTO-QUE-DUDA, diagnóstico Blind Barber):
// «Fresh Good Batch» vive SOLO en las captions de este fixture
// (fuente 'caption', clases frase+repetida+sujeto, sin catálogo ni
// foto mapeada) — la coronación con evidencia intra-caption es la
// circularidad que coronó a «Infused». Con la regla nueva degrada
// a DUDA: candidata debil que la prueba pregunta con opciones.
t('a3 RE-PIN fundamento-que-duda: sin fuente externa, «Fresh Good Batch» ya NO es estrella efectiva',
  effHG === null);
const wowHG = cd.deriveFirstPostWow(dHG, { lang: 'en' });
t('a4 RE-PIN fundamento-que-duda: el wow degrada honesto (star_missing, sin _star) y la duda nace como candidata debil',
  !!wowHG && wowHG.star_missing === true && !wowHG._star &&
  (dHG.question_candidates || []).some((c) => c.tipo === 'estrella' && c.item === 'Fresh Good Batch' && c.debil === true));
const dHGb = mkHG(cdB);
const effHGb = cdB.effectiveStarOf(dHGb);
t('a5 CONTROL base v980: la estrella NO es el producto con nombre',
  !effHGb || effHGb.item !== 'Fresh Good Batch');
t('a6 CONTROL base v980: el digest no trae productos_nombrados',
  !Array.isArray(dHGb.productos_nombrados));

// ---------------------------------------------------------------- (b) Veja
const dVJ = mkVJ(cd);
t('b1 sin estrella efectiva (ni Running ni Sneakers)',
  cd.effectiveStarOf(dVJ) === null);
const wowVJ = cd.deriveFirstPostWow(dVJ, { lang: 'es' });
t('b2 wow neutro: star_missing, sin anchor ni _star ni claim de popularidad',
  !!wowVJ && wowVJ.star_missing === true && !wowVJ.digest_anchor && !wowVJ._star
  && !/todos piden|everyone/i.test(String(wowVJ.headline || '')));
const dVJb = mkVJ(cdB);
const effVJb = cdB.effectiveStarOf(dVJb);
t('b3 CONTROL base v980: la estrella es la línea «Running»',
  !!effVJb && effVJb.item === 'Running');
const wowVJb = cdB.deriveFirstPostWow(dVJb, { lang: 'es' });
t('b4 CONTROL base v980: el wow vende Running como estrella (_star)',
  !!wowVJb && wowVJb._star === 1 && wowVJb.digest_anchor === 'Running');

// ---------------------------------------------------------------- (c) dueño genérico
const mkCafe = (mod) => {
  const d = mod.buildFromParts({
    business: 'Cafe Sur', category: 'cafe',
    dna: { productos: ['Cafe', 'Medialunas'], servicios: [] },
    web: null, feed: null, form: null,
  });
  d.dueno = { estrella: 'lo que más vendo es café' };
  return d;
};
const dC = mkCafe(cd);
t('c1 el genérico del dueño NO calza (match vacío)',
  cd.duenoStarEvidenceMatch(dC, 'lo que más vendo es café') === '');
t('c2 sin estrella efectiva desde el genérico',
  cd.effectiveStarOf(dC) === null);
const dCb = mkCafe(cdB);
t('c3 CONTROL base v980: el genérico calzaba contra el propio digest',
  cdB.duenoStarEvidenceMatch(dCb, 'lo que más vendo es café') === 'Cafe');
t('c4 CONTROL base v980: la estrella efectiva era «Cafe»',
  !!cdB.effectiveStarOf(dCb) && cdB.effectiveStarOf(dCb).item === 'Cafe');

// ---------------------------------------------------------------- (d) dueño real
const dD = cd.buildFromParts({
  business: 'Philz', category: 'cafe',
  dna: { productos: ['Tesora', 'Medialunas'], servicios: [] },
  web: null,
  feed: { bio: '', captions: ['Probá la Tesora, nuestra favorita', 'Tesora de siempre'], name: 'Philz', handle: 'philz', pic: '' },
  form: null,
});
dD.dueno = { estrella: 'Tesora' };
t('d1 «Tesora» (una palabra, evidencia en captions) calza',
  cd.duenoStarEvidenceMatch(dD, 'Tesora') === 'Tesora');
const effD = cd.effectiveStarOf(dD);
t('d2 estrella efectiva del dueño = Tesora',
  !!effD && effD.item === 'Tesora' && effD.source === 'dueno');
const dD2 = cd.buildFromParts({
  business: 'Veja', category: 'calzado', web: null, feed: null, form: null,
  catalog: { items: ['V-10', 'Esplar'], pages: 1, pdfs: 0, at: null },
});
dD2.dueno = { estrella: 'V-10' };
t('d3 «V-10» (sigla con guion, del catálogo) calza',
  cd.duenoStarEvidenceMatch(dD2, 'V-10') === 'V-10');
dD2.dueno = { estrella: 'Esplar' };
t('d4 «Esplar» (modelo del catálogo) calza',
  cd.duenoStarEvidenceMatch(dD2, 'Esplar') === 'Esplar');
const wowD = cd.deriveFirstPostWow(dD, { lang: 'es' });
t('d5 con estrella real el wow la vende como hoy (anchor + _star)',
  !!wowD && wowD.digest_anchor === 'Tesora' && wowD._star === 1);

// ---------------------------------------------------------------- (e) demo
const dE = mkVJ(cd);
dE.dueno = { mas_vendido: 'Running' };
const wowE = cd.deriveFirstPostWow(dE, { lang: 'es' });
t('e1 demo: mas_vendido genérico NO corona el wow (star_missing)',
  !!wowE && wowE.star_missing === true && !wowE._star && !wowE.digest_anchor);
const dEb = mkVJ(cdB);
dEb.inferred_star = null;
dEb.dueno = { mas_vendido: 'Running' };
const wowEb = cdB.deriveFirstPostWow(dEb, { lang: 'es' });
t('e2 CONTROL base v980: mas_vendido genérico coronaba el wow',
  !!wowEb && wowEb._star === 1 && wowEb.digest_anchor === 'Running');
const dE2 = mkVJ(cd);
dE2.inferred_star = { item: 'Running', confidence: 0.9, fuente: 'dueno', evidence: [] };
t('e3 la estrella guardada como del dueño sin validar NO manda',
  cd.effectiveStarOf(dE2) === null);
const dE3 = mkVJ(cd);
dE3.inferred_star = { item: 'Running', confidence: 0.9, evidence: [] };
const scr = cd.scrubDigestItems(dE3);
t('e4 el scrub al guardar anula la inferred_star genérica',
  !!scr && scr.inferred_star === null && dE3.inferred_star === null);
const dE4 = cd.buildFromParts({
  business: 'Philz', category: 'cafe',
  dna: { productos: ['Tesora', 'Medialunas'], servicios: [] },
  web: null,
  feed: { bio: '', captions: ['Probá la Tesora, nuestra favorita', 'Tesora de siempre'], name: 'Philz', handle: 'philz', pic: '' },
  form: null,
});
dE4.dueno = { mas_vendido: 'Tesora' };
const wowE4 = cd.deriveFirstPostWow(dE4, { lang: 'en' });
t('e5 demo: mas_vendido real sí corona (comportamiento intacto)',
  !!wowE4 && wowE4._star === 1 && wowE4.digest_anchor === 'Tesora');

// ---------------------------------------------------------------- (f) bienvenida
function mkDb() {
  let captured = null;
  return {
    prepare: (sql) => ({
      get: () => undefined,
      run: (uid, text) => { if (String(sql).indexOf('INSERT INTO chat_messages') === 0) captured = text; },
    }),
    cap: () => captured,
  };
}
let dbx = mkDb();
gt.welcomeGuestMessage(dbx, 1, { lang: 'es', business: 'Veja', nPosts: 3, productoReal: false });
const wN = String(dbx.cap() || '');
t('f1 bienvenida sin verificación NO afirma producto real (ES)',
  !/producto real/.test(wN) && /tu primer posteo está listo/.test(wN));
dbx = mkDb();
gt.welcomeGuestMessage(dbx, 1, { lang: 'en', business: 'Veja', nPosts: 1, productoReal: false });
const wNe = String(dbx.cap() || '');
t('f2 bienvenida sin verificación NO afirma producto real (EN)',
  !/real product/.test(wNe) && /your first post is ready/.test(wNe));
dbx = mkDb();
gt.welcomeGuestMessage(dbx, 1, { lang: 'es', business: 'Hungry Ghost', nPosts: 3, productoReal: true });
const wR = String(dbx.cap() || '');
t('f3 con estrella verificada la bienvenida afirma (ES, texto de hoy)',
  /tu primer posteo está listo para Hungry Ghost con tu producto real ✨/.test(wR));
dbx = mkDb();
gt.welcomeGuestMessage(dbx, 1, { lang: 'en', business: 'Philz', nPosts: 2, productoReal: true });
const wRe = String(dbx.cap() || '');
t('f4 con estrella verificada la bienvenida afirma (EN, texto de hoy)',
  /your first post is ready for Philz from your real product ✨/.test(wRe));
dbx = mkDb();
gtB.welcomeGuestMessage(dbx, 1, { lang: 'es', business: 'Veja', nPosts: 3, productoReal: false });
const wB = String(dbx.cap() || '');
t('f5 CONTROL base v980: la bienvenida afirmaba sin verificar',
  /con tu producto real/.test(wB));
// El llamador de server.js computa la verificación desde el digest:
const srcSrv = fs.readFileSync(path.join(REL, 'server.js'), 'utf8');
t('f6 server.js pasa productoReal computado del digest sembrado',
  /welcomeProductoReal/.test(srcSrv) && /productoReal: welcomeProductoReal/.test(srcSrv)
  && /effectiveStarOf\(dgW\)/.test(srcSrv));

// ---------------------------------------------------------------- (g) boot
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function portUsed(port) {
  try { return execSync("ss -ltn | grep -c ':" + port + " ' || true").toString().trim() !== '0'; }
  catch (e) { return false; }
}
async function main() {
  const port = 18777;
  t('g0 puerto ' + port + ' libre antes del boot', !portUsed(port));
  const dataDir = '/tmp/c4-estrella-data-' + process.pid;
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
  t('g1 el server del release bootea y sirve /api/version', !!version);
  t('g2 BUILD servido = 20261105-v986', !!version && version.build === '20261105-v986');
  // Se mata por el PID exacto del hijo (el node del boot) y se
  // verifica que el puerto quedó libre.
  try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
  let freed = false;
  for (let i = 0; i < 20 && !freed; i++) { await sleep(300); freed = !portUsed(port); }
  if (!freed) { try { process.kill(child.pid, 'SIGKILL'); } catch (e) {} }
  for (let i = 0; i < 10 && !freed; i++) { await sleep(300); freed = !portUsed(port); }
  t('g3 puerto libre tras matar el boot por PID exacto', freed);
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('\n' + pass + ' ok, ' + fail + ' fallas');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
