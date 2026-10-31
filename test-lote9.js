'use strict';
// Tests del LOTE 9 — onboarding un clic, versión repo (sin dependencias).
// Uso: node test-lote9.js [repo-dir]   (default: .)
// Cubre: detección de productos, mapeo foto→producto, gate sin atajo,
// líneas del fundamento y presencia estática del flujo nuevo en ambas
// páginas de prueba. NO gasta IA, NO toca red, NO toca producción.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || '.');
let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
function eq(a, b, name) { ok(JSON.stringify(a) === JSON.stringify(b), name + ' (esperado ' + JSON.stringify(b) + ', dio ' + JSON.stringify(a) + ')'); }

// ---------- módulo puro ----------
const mod = require(path.join(repo, 'onboarding-products.js'));

// Servicios de la web mandan, con tope 4 y dedupe.
eq(mod.detectProducts({ services: ['Café de especialidad', 'Medialunas', 'Brunch', 'Torta de chocolate', 'Café de especialidad', 'Alfajores'] }),
  ['Café de especialidad', 'Medialunas', 'Brunch', 'Torta de chocolate'], 'servicios: tope 4 + dedupe');
// Sin servicios: bio minada (misma puerta que el digest).
const bioProds = mod.detectProducts({ bio: 'Cafetería de especialidad. Medialunas recién horneadas y brunch los domingos.' });
ok(bioProds.length >= 1 && bioProds.length <= 4, 'bio minada: 1-4 productos, dio ' + JSON.stringify(bioProds));
// Vacío -> vacío (Q1 degenerada: solo "de todo un poco").
eq(mod.detectProducts({}), [], 'sin fuentes: lista vacía');
// Mapeo foto→producto por contención de palabras (con singular liviano).
eq(mod.mapProductPhotos(
  ['Medialunas', 'Café de especialidad', 'Brunch'],
  [{ url: 'https://x/medialuna-recien-salida.jpg', text: '' },
   { url: 'https://x/foto1.jpg', text: 'nuestro café de especialidad de la casa' },
   { url: 'https://x/brunch-domingo.jpg', text: 'brunch del domingo' }]),
  [{ nombre: 'Medialunas', foto: 'https://x/medialuna-recien-salida.jpg' },
   { nombre: 'Café de especialidad', foto: 'https://x/foto1.jpg' },
   { nombre: 'Brunch', foto: 'https://x/brunch-domingo.jpg' }], 'mapeo por palabras + singular');
// Sin coincidencia -> null (tarjeta con nombre, nunca foto ajena).
eq(mod.mapProductPhotos(['Torta de chocolate'], [{ url: 'https://x/paisaje.jpg', text: 'atardecer en la playa' }]),
  [{ nombre: 'Torta de chocolate', foto: null }], 'sin coincidencia: foto null');
// Una foto se usa una sola vez (primer producto gana).
eq(mod.mapProductPhotos(['Café', 'Café frío'], [{ url: 'https://x/cafe.jpg', text: 'café' }]),
  [{ nombre: 'Café', foto: 'https://x/cafe.jpg' }, { nombre: 'Café frío', foto: null }], 'foto usada una sola vez');

// ---------- gate sin atajo (extraído de server.js, sin requires) ----------
const serverSrc = fs.readFileSync(path.join(repo, 'server.js'), 'utf8');
const helperStart = serverSrc.indexOf('const OC_CTA = ');
const helperEnd = serverSrc.indexOf('function trialLockGate');
if (helperStart < 0 || helperEnd < 0 || helperEnd <= helperStart) {
  console.log('FAIL: helper OC no encontrado en server.js');
  fail++;
} else {
  const helper = serverSrc.slice(helperStart, helperEnd);
  const fns = new Function(helper + '; return { onboardingAnswersFrom, onboardingAnswersOk, onboardingGoalLines };')();
  const good = { producto_estrella: 'Medialunas', producto_mix: 'uno', cta: 'reservar', promo: 'ninguna', voz: 'cercano', precios: 'si', donde: '' };
  ok(fns.onboardingAnswersOk(good, { ig: 'cafe', web: '' }), 'gate: 5 respuestas con @ pasan');
  ok(fns.onboardingAnswersOk({ ...good, donde: 'whatsapp' }, { ig: '', web: '' }), 'gate: sin @ ni web, donde válido pasa');
  ok(!fns.onboardingAnswersOk({ ...good, donde: '' }, { ig: '', web: '' }), 'gate: sin @ ni web y sin donde NO pasa');
  ok(!fns.onboardingAnswersOk({ ...good, cta: '' }, { ig: 'cafe', web: '' }), 'gate: sin CTA NO pasa');
  ok(!fns.onboardingAnswersOk({ ...good, producto_mix: 'uno', producto_estrella: '' }, { ig: 'cafe', web: '' }), 'gate: mix uno sin estrella NO pasa');
  ok(fns.onboardingAnswersOk({ ...good, producto_mix: 'todo', producto_estrella: '' }, { ig: 'cafe', web: '' }), 'gate: mix todo sin estrella pasa');
  ok(!fns.onboardingAnswersOk({ ...good, promo: 'inventada' }, { ig: 'cafe', web: '' }), 'gate: promo fuera de enum NO pasa');
  ok(!fns.onboardingAnswersOk({ ...good, voz: 'raro' }, { ig: 'cafe', web: '' }), 'gate: voz fuera de enum NO pasa');
  const lines = fns.onboardingGoalLines(good, 'es');
  ok(lines.some((l) => l.includes('Medialunas')) && lines.some((l) => l.includes('reservas')) && !lines.some((l) => l.toLowerCase().includes('promo')), 'goal ES: estrella + CTA, sin línea de promo cuando es ninguna');
  const linesEn = fns.onboardingGoalLines({ ...good, promo: '2x1', precios: 'ofertas' }, 'en');
  ok(linesEn.some((l) => l.includes('2x1')) && linesEn.some((l) => l.includes('only on offers')), 'goal EN: promo real + regla de precio');
  ok(fns.onboardingAnswersFrom({ cta: '  reservar  ', promo: '2x1' }).cta === 'reservar', 'parse: trim de campos');
}

// ---------- presencia estática en las páginas ----------
for (const [file, js, probes] of [
  ['public/prueba.html', 'oc-es.js', ['¿Qué es lo que más vendés?', '¿Dónde te encuentran?', 'de todo un poco']],
  ['public/en-prueba.html', 'oc-en.js', ['What do you sell most?', 'Where can people find you?', 'A bit of everything']],
]) {
  const html = fs.readFileSync(path.join(repo, file), 'utf8');
  ok(html.includes('<div id="v-ocq"'), file + ': vista v-ocq presente');
  ok(html.includes('ocDeepStart()'), file + ': deep link re-cableado a ocDeepStart');
  ok(!html.includes('if (PREFILL) startTrialPrefill()'), file + ': bypass viejo del auto-submit eliminado');
  ok(html.includes("window.OC_ANS") && html.includes('producto_estrella'), file + ': respuestas viajan al generate');
  ok(html.includes("['business_name', 'category', 'subcat', 'description', 'competitors', 'ig_username', 'tone', 'brand_colors', 'onboarding']"), file + ': onboarding viaja en trial_profile');
  for (const p of probes) ok(html.includes(p), file + ': texto presente: ' + p);
  // El script del flujo vive inline en el HTML (no hay src/ en el repo):
  // se extrae el bloque inline que contiene el flujo (screenQ1) y se audita ahí.
  const blocks0 = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const srcJs = blocks0.filter((b) => b.includes('screenQ1'))[0] || '';
  ok(srcJs.length > 1000, file + ': bloque inline del flujo presente');
  // Sin botón de omitir en el flujo nuevo (el viejo qSkip queda sin entrada, no se borra acá).
  ok(!srcJs.includes('Omitir') && !srcJs.includes("'Skip'") && !srcJs.includes('"Skip"'), file + ': flujo nuevo sin botón de omitir');
  // Todos los <script> inline parsean (vm.Script no ejecuta).
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  let bad = 0;
  blocks.forEach((m, i) => { try { new vm.Script(m[1]); } catch (e) { bad++; console.log('FAIL: ' + file + ' script inline ' + i + ': ' + e.message); } });
  ok(bad === 0 && blocks.length >= 2, file + ': ' + blocks.length + ' scripts inline parsean');
}

// ---------- presencia estática en server.js ----------
ok(serverSrc.includes("require('./onboarding-products')"), 'server: require del módulo nuevo');
ok(serverSrc.includes('onboardingAnswersOk(ocAns'), 'server: gate en generate/stream');
ok((serverSrc.match(/onboarding: ocAns\s*[,}]/g) || []).length >= 4, 'server: onboarding en digest (2) + out (2)');
ok((serverSrc.match(/productos: ocProductos,/g) || []).length === 2, 'server: productos en prefill + web-prefill');
ok(serverSrc.includes('clientDigest.getStoredDigest(db, userId)'), 'server: merge en applyTrialProfile');

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
