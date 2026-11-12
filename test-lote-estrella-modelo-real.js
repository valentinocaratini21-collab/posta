// test-lote-estrella-modelo-real.js — LOTE ESTRELLA-MODELO-REAL v924.
// Regla: el producto estrella es un MODELO REAL por nombre, nunca una
// categoría. Caso Veja (11/11): el posteo dijo «HOMME» — «homme» es
// francés para «hombre», la categoría de la tienda, no un modelo
// (Esplar, Campo, V-10).
// Autónomo (patrón de las suites del repo): node:sqlite + spawn + fetch,
// sin harness externo. Bootea el server con DATA_DIR en /tmp (nunca
// producción). Corre desde la raíz del scratch o desde release/:
// TREE es el dir que contiene client-digest.js.
//   node test-lote-estrella-modelo-real.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

process.env.NODE_PATH = '/home/hatch/workspace/posta/node_modules';

const TREE = fs.existsSync(path.join(__dirname, 'client-digest.js'))
  ? __dirname : path.join(__dirname, 'release');
const cd = require(path.join(TREE, 'client-digest.js'));

let pass = 0, fail = 0;
const failed = [];
function ok(id, label, cond) {
  if (cond) { pass++; }
  else { fail++; failed.push(id + ' ' + label); console.log('  FAIL ' + id + ': ' + label); }
}
function eq(id, label, got, want) { ok(id, label + ' (got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want) + ')', got === want); }

// ---------- A · la puerta: género, no producto ----------
console.log('— A) puerta isPlausibleOfferItem: género no es ítem —');
ok('A1', 'HOMME no es ítem', cd.isPlausibleOfferItem('HOMME') === false);
ok('A2', 'Femme no es ítem', cd.isPlausibleOfferItem('Femme') === false);
ok('A3', 'Para hombre no es ítem', cd.isPlausibleOfferItem('Para hombre') === false);
ok('A4', 'Men no es ítem', cd.isPlausibleOfferItem('Men') === false);
ok('A5', 'Women no es ítem', cd.isPlausibleOfferItem('Women') === false);
ok('A6', 'Corte hombre SÍ es ítem (corte no es género)', cd.isPlausibleOfferItem('Corte hombre') === true);
ok('A7', 'Esplar SÍ es ítem', cd.isPlausibleOfferItem('Esplar') === true);
ok('A8', 'Campo SÍ es ítem', cd.isPlausibleOfferItem('Campo') === true);
ok('A9', 'Tesora SÍ es ítem', cd.isPlausibleOfferItem('Tesora') === true);
ok('A10', 'Best Sellers sigue rechazado (preexistente)', cd.isPlausibleOfferItem('Best Sellers') === false);
ok('A11', 'Dr. Martens sigue pasando (preexistente)', cd.isPlausibleOfferItem('Dr. Martens') === true);
ok('A12', 'Comercios sigue rechazado (preexistente)', cd.isPlausibleOfferItem('Comercios') === false);

// ---------- B · el clasificador de categoría ----------
console.log('— B) isGenericCategoryName —');
const GEN = ['HOMME', 'Homme', 'Femme', 'Hombre', 'Mujer', 'Men', 'Women', 'Zapatillas', 'Zapatillas Hombre', 'Perfume', 'Café', 'Coffee', 'Ropa'];
for (const g of GEN) ok('B-gen-' + g, JSON.stringify(g) + ' es categoría', cd.isGenericCategoryName(g) === true);
const SPEC = ['Esplar', 'Campo', 'V-10', 'Tesora', 'Mint Mojito', "Jacob's Wonderbar", 'Té Verde', 'Holiday Gel Mani System', 'Dr. Martens', 'Esplar Leather'];
for (const s of SPEC) ok('B-esp-' + s, JSON.stringify(s) + ' es modelo real', cd.isGenericCategoryName(s) === false);

// ---------- C · inferStar: la categoría no puntúa ----------
console.log('— C) inferStar —');
const vejaItems = [
  { nombre: 'HOMME' }, { nombre: 'Esplar' }, { nombre: 'Campo' }, { nombre: 'V-10' },
];
const vejaCaps = [
  'New Esplar in white leather, made in Brazil.',
  'The Esplar is our icon. Shop the new colors.',
  'Campo suede, back in stock.',
  'Veja Esplar — timeless, simple, responsible.',
];
const vejaStar = cd.inferStar({
  items: vejaItems,
  captions: vejaCaps,
  orderNames: ['HOMME', 'Esplar', 'Campo', 'V-10'],
  metrics: [], dnaStar: '',
});
ok('C1', 'Veja: hay estrella inferida', !!vejaStar);
ok('C2', 'Veja: la estrella NO es HOMME', !vejaStar || vejaStar.item !== 'HOMME');
ok('C3', 'Veja: la estrella es Esplar o Campo', !!vejaStar && (vejaStar.item === 'Esplar' || vejaStar.item === 'Campo'));
eq('C4', 'Veja: la estrella es Esplar (más menciones)', vejaStar && vejaStar.item, 'Esplar');

const philzStar = cd.inferStar({
  items: [{ nombre: 'Tesora' }, { nombre: 'Mint Mojito' }, { nombre: "Jacob's Wonderbar" }],
  captions: ['Tesora, the first blend of Phil. Caramel and walnut.', 'Tesora is back.', 'Mint Mojito season.'],
  orderNames: ['Tesora', 'Mint Mojito', "Jacob's Wonderbar"],
  metrics: [], dnaStar: '',
});
ok('C5', 'Philz: hay estrella inferida', !!philzStar);
eq('C6', 'Philz: la estrella es Tesora (sin regresión)', philzStar && philzStar.item, 'Tesora');

const onlyGeneric = cd.inferStar({
  items: [{ nombre: 'HOMME' }, { nombre: 'Zapatillas' }, { nombre: 'Perfume' }],
  captions: ['Homme collection is here.', 'Zapatillas para hombre.'],
  orderNames: ['HOMME', 'Zapatillas', 'Perfume'],
  metrics: [], dnaStar: '',
});
ok('C7', 'Solo categorías: NO hay inferencia (no se adivina)', onlyGeneric === null);

const byredoStar = cd.inferStar({
  items: [{ nombre: 'Mojave Ghost' }, { nombre: "Bal d'Afrique" }, { nombre: 'Perfume' }],
  captions: ['Mojave Ghost, our most loved scent.', 'Bal d\u2019Afrique in the morning light.', 'Mojave Ghost — woody, warm, unforgettable.'],
  orderNames: ['Mojave Ghost', "Bal d'Afrique", 'Perfume'],
  metrics: [], dnaStar: '',
});
ok('C8', 'Byredo: hay estrella inferida', !!byredoStar);
ok('C9', 'Byredo: la estrella NO es "Perfume" (categoría)', !byredoStar || byredoStar.item !== 'Perfume');
ok('C10', 'Byredo: la estrella es un perfume con nombre', !!byredoStar && (byredoStar.item === 'Mojave Ghost' || byredoStar.item === "Bal d'Afrique"));

// ---------- D · effectiveStarOf: digest envenenado ----------
console.log('— D) effectiveStarOf —');
const poisoned = cd.effectiveStarOf({
  productos: [{ nombre: 'HOMME' }, { nombre: 'Esplar' }],
  inferred_star: { item: 'HOMME', confidence: 0.9, fuente: 'inferido', evidence: [] },
});
ok('D1', 'Digest envenenado (inferida HOMME): NO es estrella', poisoned === null);
const clean = cd.effectiveStarOf({
  productos: [{ nombre: 'Esplar' }, { nombre: 'Campo' }],
  inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
});
eq('D2', 'Inferida Esplar: estrella Esplar', clean && clean.item, 'Esplar');
eq('D3', 'Inferida Esplar: fuente inferred', clean && clean.source, 'inferred');
const dueno = cd.effectiveStarOf({
  productos: [{ nombre: 'HOMME' }],
  dueno: { estrella: 'HOMME' },
  inferred_star: { item: 'Esplar', confidence: 0.8, fuente: 'inferido', evidence: [] },
});
eq('D4', 'Dueño confirmó HOMME: manda la palabra del dueño (no es inferencia del picker)', dueno && dueno.item, 'HOMME');
const sales = cd.effectiveStarOf({
  productos: [{ nombre: 'Esplar' }],
  connections: { tiendanube: { star: { name: 'Esplar', units_30d: 12 } } },
  inferred_star: { item: 'Campo', confidence: 0.8, fuente: 'inferido', evidence: [] },
});
eq('D5', 'Ventas reales mandan sobre la inferida', sales && sales.item, 'Esplar');
eq('D6', 'Ventas reales: fuente sales', sales && sales.source, 'sales');

// ---------- E · deriveTopics: el titular no es la categoría ----------
console.log('— E) deriveTopics (titular del primer posteo) —');
function vejaDigest() {
  return {
    business: 'Veja', category: 'ropa', subcat: 'calzado',
    productos: [{ nombre: 'HOMME' }, { nombre: 'Esplar' }, { nombre: 'Campo' }, { nombre: 'V-10' }],
    servicios: [], temas_feed: ['sneakers responsables', 'cuero reciclado'],
    inferred_star: { item: 'HOMME', confidence: 0.9, fuente: 'inferido', evidence: [] },
    dueno: null, onboarding: null, etapa: '', lanzamiento_fecha: null,
  };
}
const vejaTopics = cd.deriveTopics(vejaDigest(), { count: 5, lang: 'en' });
ok('E1', 'Veja: hay topics', Array.isArray(vejaTopics) && vejaTopics.length > 0);
const anchors = vejaTopics.map((t) => t.digest_anchor || t.headline || '');
ok('E2', 'Veja: ningún topic ancla HOMME', !anchors.some((a) => String(a).toLowerCase().includes('homme')));
ok('E3', 'Veja: el primer topic es Esplar o Campo', vejaTopics.length > 0 && (vejaTopics[0].digest_anchor === 'Esplar' || vejaTopics[0].digest_anchor === 'Campo'));
eq('E4', 'Veja: el primer topic es Esplar', vejaTopics[0] && vejaTopics[0].digest_anchor, 'Esplar');
ok('E5', 'Veja: el primer titular no dice HOMME', vejaTopics.length > 0 && !String(vejaTopics[0].headline || '').toLowerCase().includes('homme'));

// ---------- F · estático: estampado y alcance ----------
console.log('— F) estático —');
const srvSrc = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const cdSrc = fs.readFileSync(path.join(TREE, 'client-digest.js'), 'utf8');
ok('F1', 'BUILD v924 x1', (srvSrc.match(/20261105-v924/g) || []).length === 1);
ok('F2', 'BUILD v900 x0 en server.js', (srvSrc.match(/20261105-v900/g) || []).length === 0);
ok('F3', 'guarda presente en client-digest.js', cdSrc.includes('isGenericCategoryName') && cdSrc.includes('OFFER_GENDER_NOUNS'));
ok('F4', 'la puerta rechaza género', cdSrc.includes('isGenderOnlyName(s)'));
ok('F5', 'app.js sin tocar (md5 == base v923)', require('crypto').createHash('md5').update(fs.readFileSync(path.join(TREE, 'public/app.js'))).digest('hex').startsWith('b0d67756946c'));
ok('F6', 'styles.css sin tocar (md5 == base v923)', require('crypto').createHash('md5').update(fs.readFileSync(path.join(TREE, 'public/styles.css'))).digest('hex').startsWith('e36d954aae3b'));

// ---------- G · boot aislado: /api/version v924 5/5 ----------
console.log('— G) boot real —');
const PORT = 34995;
const ADMIN_TOKEN = 'test-v924-admin';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-estrella-v924-'));
const BASE = `http://127.0.0.1:${PORT}`;
let srvProc = null;
async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
function boot() {
  return new Promise((resolve) => {
    srvProc = spawn('node', ['server.js'], {
      cwd: TREE, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN, TRIAL_TEST_KEY: 'test-v924' },
    });
    let out = '';
    srvProc.stdout.on('data', (d) => { out += String(d); });
    srvProc.stderr.on('data', (d) => { out += String(d); });
    setTimeout(() => resolve(out), 500);
  });
}
function killBoot() {
  return new Promise((res) => {
    if (!srvProc) return res();
    const p = srvProc; srvProc = null;
    let done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    p.once('exit', finish);
    p.kill('SIGTERM');
    setTimeout(() => { try { p.kill('SIGKILL'); } catch (e) {} setTimeout(finish, 800); }, 3000);
  }).then(async () => {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${BASE}/api/version`); } catch (e) { return; }
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log('  (aviso: el puerto ' + PORT + ' siguió ocupado 20 s tras matar el boot)');
  });
}

(async () => {
  await boot();
  const booted = await waitBoot();
  ok('G1', 'server booteó (/api/version)', booted);
  let okV = 0;
  for (let i = 0; i < 5; i++) {
    try {
      const v = await (await fetch(`${BASE}/api/version`)).json();
      if (i === 0) console.log('  (version[0]:', JSON.stringify(v), ')');
      if (v && v.build === '20261105-v924') okV++;
    } catch (e) {}
  }
  eq('G2', '/api/version v924 5/5', okV, 5);
  await killBoot();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  console.log(`\nestrella-modelo-real: ${pass} passed, ${fail} failed`);
  if (failed.length) { console.log('FALLIDOS:'); for (const f of failed) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR SUITE:', e); process.exit(2); });
