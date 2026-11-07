#!/usr/bin/env node
// LOTE PRUEBA-CHAT-GATE-FIX (6/11) — la prueba por chat con estudio NO
// generaba nunca: buildPlan filtraba los huecos por `n.kind !== 'answer'`
// pero preguntasDinamicasGaps los empujaba SIN kind → con estudio el plan
// quedaba solo [rubro?, donde?, ubicacion?, etapa?] y el chat NUNCA
// preguntaba q1 (estrella), q2 (objetivo) ni q8 (líneas rojas) → sprout()
// mandaba OC_ANS con producto_mix 'uno' sin estrella y cta '' → el gate
// onboardingAnswersOk devolvía 400 «Respondé las preguntas rápidas
// primero…». Este lote: (1) los huecos llevan kind; (2) el espejo ya no
// se queda sin camino cuando no hay productos (q1 se pregunta y '__todo__'
// no se ofrece sin detectados); (3) el lector web no cuela chrome de la
// tienda como «productos»; (4) el draft no rota productos por tarjeta
// cuando no hay estrella. El picker de onda (mock v3) ya estaba bien:
// mismo producto + misma foto en las 3 tarjetas (sección H, regresión).
// Uso: node test-lote-prueba-chat-gate-fix.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const es = fs.readFileSync(path.join(DIR, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(DIR, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const gapsMod = require('./preguntas-dinamicas.js');
const { detectProducts } = require('./onboarding-products');
const webExtract = require('./web-extract');
const personalizacion = require('./personalizacion');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
function count(h, s) { return h.split(s).length - 1; }
function has(h, s) { return h.indexOf(s) >= 0; }
function fnFrom(html, sig) {
  const i = html.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}') { d--; if (d === 0) return html.slice(i, j + 1); }
  }
  return null;
}

// ---------- A) Los huecos llevan kind (módulo, fuente de verdad) ----------
const cafeInput = {
  facts: { _known: true, has_local: true, takes_reservations: false, sells_online: false, has_prices: true, has_promo: false, tone: 'vos', audience: ['vecinos del barrio'], diferencial: ['todo casero'], is_creator: false },
  productos: ['Café de especialidad'], category: 'cafeteria', lang: 'es',
};
const cafeGaps = gapsMod.preguntasDinamicasGaps(cafeInput);
ok('A1 gaps café: todos los huecos llevan kind', cafeGaps.needed.every((n) => n.kind === 'answer' || n.kind === 'fact'), JSON.stringify(cafeGaps.needed));
const cafeKinds = {};
cafeGaps.needed.forEach((n) => { cafeKinds[n.target] = n.kind; });
ok('A2 gaps café: estrella/objetivo/lineas_rojas son kind answer', cafeKinds.estrella === 'answer' && cafeKinds.objetivo === 'answer' && cafeKinds.lineas_rojas === 'answer', JSON.stringify(cafeKinds));
const barberInput = {
  facts: { _known: true, has_local: false, takes_reservations: false, sells_online: false, has_prices: false, has_promo: false, tone: 'neutral', audience: [], diferencial: [], is_creator: false },
  productos: [], category: 'barberia', lang: 'es',
};
const barberGaps = gapsMod.preguntasDinamicasGaps(barberInput);
const barberKinds = {};
barberGaps.needed.forEach((n) => { barberKinds[n.target] = n.kind; });
ok('A3 gaps barbería sin productos: producto/objetivo/lineas_rojas son kind answer', barberKinds.producto === 'answer' && barberKinds.objetivo === 'answer' && barberKinds.lineas_rojas === 'answer', JSON.stringify(barberKinds));

// ---------- B) El plan REAL del HTML (VM) incluye q1/q2/q8 con estudio ----------
function planCtx(html, S, WEB) {
  const ctx = { S, WEB, DYN_TARGETS: gapsMod.DYN_TARGETS, preguntasDinamicasGaps: gapsMod.preguntasDinamicasGaps };
  vm.createContext(ctx);
  vm.runInContext('function chatGaps() { var input = { facts: S.facts || {}, productos: (S.products || []).map(function (p) { return p.nombre; }), category: S.cat || \'\', lang: \'es\' }; try { return preguntasDinamicasGaps(input); } catch (e) { return { needed: DYN_TARGETS.filter(function (t) { return t.kind === \'answer\'; }), known: {} }; } }', ctx);
  const m = html.match(/var DYN_TARGET_TO_KEY = (\{[^}]+\});/);
  if (!m) throw new Error('sin DYN_TARGET_TO_KEY en el HTML');
  vm.runInContext('var DYN_TARGET_TO_KEY = ' + m[1] + ';', ctx);
  const srcDonde = fnFrom(html, 'function dondeAprendido(facts) {');
  const srcPlan = fnFrom(html, 'function buildPlan() {');
  if (!srcDonde || !srcPlan) throw new Error('sin dondeAprendido/buildPlan en el HTML');
  vm.runInContext(srcDonde + '\n' + srcPlan, ctx);
  return ctx;
}
function planFor(html, S, WEB) {
  const ctx = planCtx(html, S, WEB);
  vm.runInContext('buildPlan();', ctx);
  return { plan: ctx.S.plan.slice(), ans: ctx.S.ans };
}
function mkS(source, facts, products, cat, ans) {
  return { source, rubroOptions: undefined, facts, products: products || [], cat: cat || '', ans: ans || {} };
}
const cafeFacts = { _known: true, has_local: true, takes_reservations: false, sells_online: false, has_prices: true, has_promo: false, tone: 'vos', audience: ['vecinos del barrio'], diferencial: ['todo casero'], is_creator: false };
const planCafe = planFor(es, mkS('ig', cafeFacts, [{ nombre: 'Café de especialidad' }], 'cafeteria'), undefined);
ok('B1 ES café con estudio: el plan pregunta q1 (estrella)', planCafe.plan.includes('q1'), JSON.stringify(planCafe.plan));
ok('B2 ES café con estudio: el plan pregunta q2 (objetivo)', planCafe.plan.includes('q2'), JSON.stringify(planCafe.plan));
ok('B3 ES café con estudio: el plan pregunta q8 (líneas rojas)', planCafe.plan.includes('q8'), JSON.stringify(planCafe.plan));
ok('B4 ES café con estudio: NO pregunta lo ya sabido (q3/q4/q5/q6/q7)', !planCafe.plan.includes('q3') && !planCafe.plan.includes('q4') && !planCafe.plan.includes('q5') && !planCafe.plan.includes('q6') && !planCafe.plan.includes('q7'), JSON.stringify(planCafe.plan));
const barberFacts = { _known: true, has_local: false, takes_reservations: false, sells_online: false, has_prices: false, has_promo: false, tone: 'neutral', audience: [], diferencial: [], is_creator: false };
const planBarber = planFor(es, mkS('ig', barberFacts, [], 'barberia'), undefined);
ok('B5 ES barbería sin productos: el plan pregunta q1 (qué vende)', planBarber.plan.includes('q1') && planBarber.plan.includes('q2') && planBarber.plan.includes('q8'), JSON.stringify(planBarber.plan));
const planCafeEN = planFor(en, mkS('ig', cafeFacts, [{ nombre: 'Café de especialidad' }], 'cafeteria'), undefined);
ok('B6 EN café con estudio: paridad 1:1 (q1/q2/q8)', planCafeEN.plan.includes('q1') && planCafeEN.plan.includes('q2') && planCafeEN.plan.includes('q8'), JSON.stringify(planCafeEN.plan));
const planEmail = planFor(es, mkS('email', null, [], ''), undefined);
ok('B7 ES email sin estudio: las 8 fijas, como hoy', ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'].every((k) => planEmail.plan.includes(k)), JSON.stringify(planEmail.plan));

// ---------- C) Flujo completo simulado: plan → respuestas → OC_ANS → gate ----------
// El gate real del servidor, extraído y corrido en VM (sin red ni IA).
function gateCtx() {
  const ctx = {};
  vm.createContext(ctx);
  const consts = srv.match(/const OC_CTA = \[[^\]]+\];\nconst OC_PROMO = \[[^\]]+\];\nconst OC_VOZ = \[[^\]]+\];\nconst OC_PRECIOS = \[[^\]]+\];\nconst OC_DONDE = \[[^\]]+\];\nconst OC_ETAPA = \[[^\]]+\];/);
  if (!consts) throw new Error('sin consts OC_* en server.js');
  vm.runInContext(consts[0], ctx);
  const srcGate = fnFrom(srv, 'function onboardingAnswersOk(a, opts) {');
  const srcEv = fnFrom(srv, 'function trialHasEvidencedProducts(x) {');
  if (!srcGate || !srcEv) throw new Error('sin gate/evidencia en server.js');
  vm.runInContext(srcGate + '\n' + srcEv, ctx);
  return ctx;
}
const gctx = gateCtx();
function gateOk(ans, opts) {
  gctx.a = ans; gctx.o = opts;
  return vm.runInContext('onboardingAnswersOk(a, o)', gctx);
}
function evidenced(x) {
  gctx.x = x;
  return vm.runInContext('trialHasEvidencedProducts(x)', gctx);
}
// Respuestas como las daría chatPick (un toque por pregunta del plan).
function answerPlan(plan, products) {
  const ans = {};
  for (const k of plan) {
    if (k === 'q1') {
      if (products.length) { ans.q1 = products[0]; ans.q1mix = 'uno'; }
      else { ans.q1 = 'Corte fade'; ans.q1mix = 'libre'; } // __libre__: lo escribe el dueño
    }
    if (k === 'q2') ans.q2 = 'escribirte';
    if (k === 'q3') ans.q3 = 'ninguna';
    if (k === 'q4') ans.q4 = 'cercano';
    if (k === 'q5') ans.q5 = 'si';
    if (k === 'q6') { ans.q6 = ''; ans.q6mix = 'todos'; }
    if (k === 'q7') { ans.q7 = ''; ans.q7mix = 'nose'; }
    if (k === 'q8') { ans.q8 = ''; ans.q8mix = 'nada'; }
    if (k === 'etapa') ans.etapa = 'activo';
    if (k === 'donde') ans.donde = 'instagram';
    if (k === 'ubicacion') ans.ubicacion = 'Palermo';
  }
  return ans;
}
// Mismo mapeo que sprout() en prueba.html.
function ocAnsFrom(ans) {
  return {
    producto_estrella: ans.q1 || '', producto_mix: ans.q1mix || 'uno',
    cta: ans.q2 || '', promo: ans.q3 || '', voz: ans.q4 || '', precios: ans.q5 || '',
    donde: ans.ubicacion || ans.donde || '', etapa: ans.etapa || '',
    audiencia: ans.q6 || '', audiencia_mix: ans.q6mix || 'todos',
    diferencial: ans.q7 || '', diferencial_mix: ans.q7mix || 'nose',
    lineas_rojas: ans.q8 || '', lineas_rojas_mix: ans.q8mix || 'nada',
    promo_semana: true,
  };
}
// El OC_ANS que mandaba sprout() ANTES del fix (q1/q2 nunca preguntadas):
// es el que el servidor rechazaba con 400 en las 7 pruebas del video.
const ocAnsPreFix = ocAnsFrom({ q1mix: 'uno', q3: 'ninguna', q4: 'cercano', q5: 'si', q6mix: 'todos', q7mix: 'nose', q8mix: 'nada', etapa: 'activo', donde: 'instagram' });
ok('C1 gate: el OC_ANS pre-fix NO pasa (caza el bug)', gateOk(ocAnsPreFix, { ig: 'cafearoma', web: '' }) === false, JSON.stringify(ocAnsPreFix));
const ansCafe = answerPlan(planCafe.plan, ['Café de especialidad']);
// Lo ya sabido por el estudio se pre-carga en S.ans (buildPlan lo hace).
ansCafe.q3 = 'ninguna'; ansCafe.q4 = 'cercano'; ansCafe.q5 = 'si';
ansCafe.q6 = 'vecinos del barrio'; ansCafe.q6mix = 'uno';
ansCafe.q7 = 'todo casero'; ansCafe.q7mix = 'uno';
const ocCafe = ocAnsFrom(ansCafe);
ok('C2 gate: café con estudio, plan respondido, PASA', gateOk(ocCafe, { ig: 'cafearoma', web: '' }) === true, JSON.stringify(ocCafe));
ok('C3 evidencia: café con estrella PASA trialHasEvidencedProducts', evidenced({ mix: ocCafe.producto_mix, estrella: ocCafe.producto_estrella, servicios: [], catalogItems: [], detectados: ['Café de especialidad'] }) === true);
const ansBarber = answerPlan(planBarber.plan, []);
// Lo ya sabido se pre-carga en S.ans (buildPlan: promo ausente → ninguna).
ansBarber.q3 = 'ninguna';
const ocBarber = ocAnsFrom(ansBarber);
ok('C4 gate: barbería sin productos, dueño escribe qué vende, PASA', gateOk(ocBarber, { ig: 'topclassbarber', web: '' }) === true, JSON.stringify(ocBarber));
ok('C5 evidencia: barbería libre con estrella PASA', evidenced({ mix: ocBarber.producto_mix, estrella: ocBarber.producto_estrella, servicios: [], catalogItems: [], detectados: [] }) === true);
// 'todo' sin nada detrás NO evidencia nada: por eso q1 no lo ofrece sin detectados.
ok('C6 evidencia: todo SIN productos NO pasa (justifica esconder __todo__)', evidenced({ mix: 'todo', estrella: '', servicios: [], catalogItems: [], detectados: [] }) === false);
ok('C7 evidencia: todo CON detectados sí pasa', evidenced({ mix: 'todo', estrella: '', servicios: [], catalogItems: [], detectados: ['Café de especialidad'] }) === true);

// ---------- D) q1: '__todo__' solo si hay productos detectados ----------
function q1Opts(html, products) {
  const T = { servicio: 'Servicio', servicioSub: '', marca: 'Marca', marcaSub: '', sinOferta: 'Sin oferta', sinOfertaSub: '', libre: 'Libre', libreSub: '', todo: 'De todo', todoSub: '' };
  const ctx = { S: { products: products || [] }, T };
  vm.createContext(ctx);
  const src = fnFrom(html, 'function chatOptionsFor(key) {');
  if (!src) throw new Error('sin chatOptionsFor en el HTML');
  vm.runInContext(src, ctx);
  return vm.runInContext('chatOptionsFor("q1").map(function (o) { return o.v; })', ctx);
}
const q1Con = q1Opts(es, [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }]);
ok('D1 ES q1 con productos: ofrece __todo__', q1Con.includes('__todo__'), JSON.stringify(q1Con));
const q1Sin = q1Opts(es, []);
ok('D2 ES q1 sin productos: NO ofrece __todo__', !q1Sin.includes('__todo__'), JSON.stringify(q1Sin));
ok('D3 ES q1 sin productos: sí ofrece libre/servicio/marca/sin_oferta', ['__libre__', '__servicio__', '__marca__', '__sin_oferta__'].every((v) => q1Sin.includes(v)), JSON.stringify(q1Sin));
const q1SinEN = q1Opts(en, []);
ok('D4 EN q1 sin productos: paridad (sin __todo__, con libre)', !q1SinEN.includes('__todo__') && q1SinEN.includes('__libre__'), JSON.stringify(q1SinEN));

// ---------- E) flBuild: el espejo toma la estrella del chat ----------
// (sin q1 respondida y sin productos, el espejo queda vacío: ese era el
// callejón del bug 2; con q1 respondida, el espejo tiene su producto).
function flBuildRun(html, S) {
  const ctx = { S, FL: { from: { cliente: 'cliente', bio: 'bio', web: 'web' } } };
  vm.createContext(ctx);
  const src = fnFrom(html, 'function flBuild() {');
  if (!src) throw new Error('sin flBuild en el HTML');
  vm.runInContext(src, ctx);
  return vm.runInContext('flBuild()', ctx);
}
const flConQ1 = flBuildRun(es, { source: 'ig', products: [], ans: { q1: 'Corte fade', q1mix: 'libre' } });
ok('E1 espejo: con q1 respondida (libre) el espejo tiene el producto', flConQ1.length === 1 && flConQ1[0].nombre === 'Corte fade', JSON.stringify(flConQ1));
const flSinQ1 = flBuildRun(es, { source: 'ig', products: [], ans: {} });
ok('E2 espejo: sin q1 y sin productos queda vacío (el chat lo tiene que llenar)', flSinQ1.length === 0, JSON.stringify(flSinQ1));

// ---------- F) Draft: sin estrella, el MISMO producto en las 3 tarjetas ----------
function draftProdRun(html, S, FL_E) {
  const ctx = { S, FL_E };
  vm.createContext(ctx);
  const star = fnFrom(html, 'function draftStarName() {');
  const card = fnFrom(html, 'function draftCardProduct(');
  if (!star || !card) throw new Error('sin draftStarName/draftCardProduct en el HTML');
  vm.runInContext(star + '\n' + card, ctx);
  return [0, 1, 2].map((i) => vm.runInContext('draftCardProduct(0, ' + i + ')', ctx));
}
const draftSinEstrella = draftProdRun(es, { ans: {} }, { productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }, { nombre: 'Torta' }] });
ok('F1 ES draft sin estrella: las 3 tarjetas muestran el MISMO producto (el 1º)', draftSinEstrella.every((p) => p === 'Café de especialidad'), JSON.stringify(draftSinEstrella));
const draftConEstrella = draftProdRun(es, { ans: { q1: 'Medialunas', q1mix: 'uno' } }, { productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }] });
ok('F2 ES draft con estrella: las 3 tarjetas muestran la estrella', draftConEstrella.every((p) => p === 'Medialunas'), JSON.stringify(draftConEstrella));
const draftSinEstrellaEN = draftProdRun(en, { ans: {} }, { productos: [{ nombre: 'Café de especialidad' }, { nombre: 'Medialunas' }] });
ok('F3 EN draft sin estrella: paridad (mismo producto)', draftSinEstrellaEN.every((p) => p === 'Café de especialidad'), JSON.stringify(draftSinEstrellaEN));

// ---------- G) Extracción: captions como último recurso + sin anuncios ----------
const capsBarber = ['Fresh fade Friday 🔥 Book your chair', 'Clean taper + beard lineup', 'Walk-ins welcome today'];
ok('G1 detectProducts: bio vacía + captions de barbería → encuentra el servicio', (() => {
  const out = detectProducts({ bio: '', captions: capsBarber, excludeNames: ['topclassbarbersquad'] });
  return out.includes('Clean taper + beard lineup');
})(), JSON.stringify(detectProducts({ bio: '', captions: capsBarber, excludeNames: ['topclassbarbersquad'] })));
ok('G2 detectProducts: slogans/anuncios NO son productos', detectProducts({ bio: '', captions: ['Timeless style. Effortless you.', 'New arrivals just landed ✨', 'Walk-ins welcome today'], excludeNames: ['ladyee'] }).length === 0);
ok('G3 detectProducts: la bio sigue mandando (captions no la pisan)', (() => {
  const out = detectProducts({ bio: 'Café de especialidad | Medialunas', captions: capsBarber, excludeNames: [] });
  return out.includes('Café de especialidad') && !out.includes('Clean taper + beard lineup');
})());
ok('G4 detectProducts: bio con anuncio no lo cuela como producto', !detectProducts({ bio: 'Top Class Barber Squad | Walk-ins welcome', captions: [], excludeNames: [] }).some((p) => /walk-ins/i.test(p)));

// ---------- H) Lector web: el chrome de la tienda no es un servicio ----------
const isJunk = webExtract.isJunkServiceHeading;
ok('H1 web-extract exporta isJunkServiceHeading', typeof isJunk === 'function');
if (typeof isJunk === 'function') {
  const ladyee = ['Country/region and currency', 'Your bag', 'Timeless style. Effortless you.', 'New arrivals'];
  ok('H2 Ladyee: los 4 textos de chrome son basura', ladyee.every((s) => isJunk(s)), JSON.stringify(ladyee.map((s) => [s, isJunk(s)])));
  const reales = ['Corte fade', 'Café de especialidad', 'Masajes relajantes', 'Cold Brew', 'Espresso', 'Vestidos de fiesta'];
  ok('H3 servicios reales NO son basura', reales.every((s) => !isJunk(s)), JSON.stringify(reales.map((s) => [s, isJunk(s)])));
  const nav = ['Inicio', 'Contacto', 'Servicios', 'Menú'];
  ok('H4 navegación vieja sigue siendo basura', nav.every((s) => isJunk(s)));
}

// ---------- I) Picker de onda (mock v3): mismo producto, misma foto, 3 ángulos ----------
for (const lang of ['es', 'en']) {
  const ops = personalizacion.generarOpcionesOnda({ producto: 'Remera Corteiz', precio: '$100.000', foto: 'https://x.com/foto.jpg', lang });
  ok('I1 onda ' + lang + ': 3 opciones vender/historia/ensenar', ops.length === 3 && ops.map((o) => o.id).join(',') === 'vender,historia,ensenar', JSON.stringify(ops.map((o) => o.id)));
  ok('I2 onda ' + lang + ': el MISMO producto en título y caption de las 3', ops.every((o) => (o.titulo + ' ' + o.caption).includes('Remera Corteiz')), JSON.stringify(ops.map((o) => o.titulo)));
  ok('I3 onda ' + lang + ': la MISMA foto en las 3', ops.every((o) => o.foto === 'https://x.com/foto.jpg'));
  ok('I4 onda ' + lang + ': variantes heroe/detalle/aviso (mock v3)', ops.map((o) => o.variante).join(',') === 'heroe,detalle,aviso', JSON.stringify(ops.map((o) => o.variante)));
}
ok('I5 onda: sin producto no hay opciones (fail-closed)', personalizacion.generarOpcionesOnda({ producto: '', foto: 'https://x.com/f.jpg' }).length === 0);

// ---------- J) El bloque de gaps del IIFE sigue idéntico al módulo ----------
function normGaps(code) {
  return code.split('\n').map((l) => l.replace(/^\s+/, '')).join('\n').trim();
}
function gapsBlockFrom(html) {
  const i = html.indexOf('// Los 12 targets posibles.');
  const j = html.indexOf('  var DYN_TARGET_TO_KEY', i);
  return html.slice(i, j).split('\n').filter((l) => !/\/\/ \(LOTE PRUEBA-CHAT\) (Del target|From the gap target)/.test(l)).join('\n');
}
function gapsBlockFromModule() {
  const src = fs.readFileSync(path.join(DIR, 'preguntas-dinamicas.js'), 'utf8');
  const i = src.indexOf('// Los 12 targets posibles.');
  const j = src.indexOf('// UMD.');
  return src.slice(i, j);
}
ok('J1 ES: bloque gaps idéntico a preguntas-dinamicas.js', normGaps(gapsBlockFrom(es)) === normGaps(gapsBlockFromModule()));
ok('J2 EN: bloque gaps idéntico a preguntas-dinamicas.js', normGaps(gapsBlockFrom(en)) === normGaps(gapsBlockFromModule()));

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
