#!/usr/bin/env node
// LOTE PRUEBA-CHAT-GATE-FIX2 (7/11) — la prueba por chat con estudio
// SEGUÍA sin generar semana en v746: el chat ya preguntaba todo
// (v746) pero buildGenFormData() NUNCA mandaba audiencia,
// audiencia_mix, diferencial, diferencial_mix, lineas_rojas ni
// lineas_rojas_mix → el gate onboardingAnswersOk daba false SIEMPRE
// (ausente = '') → 400 «Respondé las preguntas rápidas primero…».
// La suite de v746 pasó porque probó el OBJETO OC_ANS de sprout()
// (que SÍ tiene los 6 campos) y nunca el FormData serializado que
// viaja por el cable. Este lote: (1) buildGenFormData manda los 6
// campos ES+EN, con el 'diferencial' viejo (TRIAL_ANS) solo cuando no
// hay OC_ANS — parseMultipart se queda con el ÚLTIMO valor repetido y
// un '' pisaría el del chat; (2) el minador de captions ya no admite
// fragmentos de caption en inglés («RSVP at the», «Based on true
// events.»); (3) el lector web saca productos reales de los links a
// /products/<handle> (Shopify y similares) en vez de mostrar secciones
// («Best Sellers», «Join the Club») como si fueran la oferta.
// Uso: node test-lote-prueba-chat-gate-fix2.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const es = fs.readFileSync(path.join(DIR, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(DIR, 'public', 'en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const { detectProducts } = require('./onboarding-products');
const webExtract = require('./web-extract');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 300) : '')); }
}
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

// ---------- A) El cable: buildGenFormData REAL → gate REAL ----------
// El gate del servidor, extraído y corrido en VM (sin red ni IA),
// igual que la suite de v746, más onboardingAnswersFrom (el parseo
// que convierte los campos del FormData en el objeto del gate).
function gateCtx() {
  const ctx = {};
  vm.createContext(ctx);
  const consts = srv.match(/const OC_CTA = \[[^\]]+\];\nconst OC_PROMO = \[[^\]]+\];\nconst OC_VOZ = \[[^\]]+\];\nconst OC_PRECIOS = \[[^\]]+\];\nconst OC_DONDE = \[[^\]]+\];\nconst OC_ETAPA = \[[^\]]+\];/);
  if (!consts) throw new Error('sin consts OC_* en server.js');
  vm.runInContext(consts[0], ctx);
  const srcFrom = fnFrom(srv, 'function onboardingAnswersFrom(fields) {');
  const srcGate = fnFrom(srv, 'function onboardingAnswersOk(a, opts) {');
  if (!srcFrom || !srcGate) throw new Error('sin onboardingAnswersFrom/Ok en server.js');
  vm.runInContext(srcFrom + '\n' + srcGate, ctx);
  return ctx;
}
const gctx = gateCtx();
function gateOk(fields, opts) {
  gctx.f = fields; gctx.o = opts;
  return vm.runInContext('onboardingAnswersOk(onboardingAnswersFrom(f), o)', gctx);
}
// El buildGenFormData REAL del HTML, corrido en VM con un DOM mínimo
// (los mismos stubs que tocaría el navegador en el flujo del chat).
function formDataFor(html, ocAns, trialAns, ig) {
  const srcFn = fnFrom(html, 'function buildGenFormData() {');
  if (!srcFn) throw new Error('sin buildGenFormData en el HTML');
  const ctx = {
    FormData,
    TRIAL_BIZ: 'Portrait Coffee',
    cleanIg: (v) => String(v || '').trim().replace(/^@+/, ''),
    bizNameFromIg: (v) => v,
    $: (sel) => {
      if (sel === '#f_ig') return { value: '@' + ig };
      if (sel === '#hp_empresa') return { value: '' };
      if (sel === '#wf_desc') return { value: '' };
      return { value: 'cafeteria' };
    },
    OC_CAT: 'cafeteria',
    GEN_WEB: false, WEB: null, GEN_PREFILL: true,
    COUNTRY: 'US', TONE: 'vos', LANG: 'en',
    TRIAL_DESC: '',
    TRIAL_ANS: trialAns || { goal_key: '', producto: '', diferencial: '' },
    OC_ANS: ocAns,
    OC_DETECTADOS: ['Café de especialidad'],
    OC_ESPEJO: undefined, OC_DRAFT: undefined, OPT_PHOTO: null,
    RUBRO_ANS: undefined,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(srcFn, ctx);
  return vm.runInContext('buildGenFormData()', ctx);
}
function fieldsOf(fd) {
  const out = {};
  for (const [k, v] of fd.entries()) out[k] = String(v);
  return out;
}
const cafeAns = {
  producto_estrella: 'Café de especialidad', producto_mix: 'uno',
  cta: 'escribirte', promo: 'ninguna', voz: 'cercano', precios: 'si',
  donde: 'Online', etapa: 'activo',
  audiencia: 'vecinos del barrio', audiencia_mix: 'uno',
  diferencial: 'todo casero', diferencial_mix: 'uno',
  lineas_rojas: 'nada de descuentos', lineas_rojas_mix: 'uno',
  promo_semana: true,
};
const barberAns = {
  producto_estrella: 'Corte fade', producto_mix: 'libre',
  cta: 'reservar', promo: 'ninguna', voz: 'cercano', precios: 'no',
  donde: 'A domicilio', etapa: 'activo',
  audiencia: '', audiencia_mix: 'todos',
  diferencial: '', diferencial_mix: 'nose',
  lineas_rojas: '', lineas_rojas_mix: 'nada',
  promo_semana: true,
};
const fdCafeES = formDataFor(es, cafeAns, undefined, 'portraitcoffee');
const fCafeES = fieldsOf(fdCafeES);
ok('A1 ES café: el FormData trae audiencia/diferencial/lineas_rojas', fCafeES.audiencia === 'vecinos del barrio' && fCafeES.diferencial === 'todo casero' && fCafeES.lineas_rojas === 'nada de descuentos', JSON.stringify(fCafeES));
ok('A2 ES café: el FormData trae los 3 mix (uno/uno/uno)', fCafeES.audiencia_mix === 'uno' && fCafeES.diferencial_mix === 'uno' && fCafeES.lineas_rojas_mix === 'uno', JSON.stringify(fCafeES));
ok('A3 ES café: el gate REAL pasa con los campos del cable', gateOk(fCafeES, { ig: 'portraitcoffee', web: '' }) === true);
const fdBarberES = formDataFor(es, barberAns, undefined, 'topclassbarbersquad');
const fBarberES = fieldsOf(fdBarberES);
ok('A4 ES barbería sin productos: el gate REAL pasa (mix todos/nose/nada)', gateOk(fBarberES, { ig: 'topclassbarbersquad', web: '' }) === true, JSON.stringify(fBarberES));
ok('A5 ES: un solo valor de diferencial en el FormData (sin duplicado)', [...fdCafeES.entries()].filter(([k]) => k === 'diferencial').length === 1, JSON.stringify([...fdCafeES.entries()].map(([k]) => k)));
const fdCafeEN = formDataFor(en, cafeAns, undefined, 'portraitcoffee');
const fCafeEN = fieldsOf(fdCafeEN);
ok('A6 EN café: paridad 1:1, los 6 campos viajan y el gate pasa', fCafeEN.audiencia_mix === 'uno' && fCafeEN.diferencial_mix === 'uno' && fCafeEN.lineas_rojas_mix === 'uno' && gateOk(fCafeEN, { ig: 'portraitcoffee', web: '' }) === true, JSON.stringify(fCafeEN));
const fdOld = formDataFor(es, undefined, { goal_key: '', producto: '', diferencial: 'atención personalizada' }, 'portraitcoffee');
ok('A7 ES sin OC_ANS (flujo viejo): el diferencial viejo se sigue mandando', fieldsOf(fdOld).diferencial === 'atención personalizada', JSON.stringify(fieldsOf(fdOld)));
ok('A8 ES sin OC_ANS: el gate NO pasa sin respuestas (control: el gate sigue vivo)', gateOk(fieldsOf(fdOld), { ig: 'portraitcoffee', web: '' }) === false);

// ---------- B) Minador de captions: basura de cafés fuera, barbería intacta ----------
// Captions REALES del embed de IG (7/11, solo lectura): Portrait
// terminaba en «rsvp at the» (truncado por el embed) y Stumptown en
// «Based on true events.» — en v746 los dos llegaban al espejo como
// «productos». La bio del embed viene vacía para estos @ (verificado
// con fetchIgEmbedHtml + extractIgBiography en local y por el propio
// prefill en vivo, que minó captions y no bio): por eso el minador
// caía a los captions.
const portraitCaps = ['this friday morning, the roastery’s open and you’re invited 🤎 every bag of our coffee gets roasted right downstairs from the cafe, and we’re rolling the garage door up so y’all can see it happen. we’ll have the roaster going, the team’s giving tours, and you can ask all the questions: how it works, what everything does, how green coffee turns into your morning cup. slide through whenever between 10 and noon, stay as long as you like. rsvp at the'];
ok('B1 Portrait (captions reales): «Rsvp at the» ya no es producto', JSON.stringify(detectProducts({ bio: '', captions: portraitCaps, excludeNames: ['Portrait Coffee', 'portraitcoffee'] })) === '[]', JSON.stringify(detectProducts({ bio: '', captions: portraitCaps, excludeNames: ['Portrait Coffee', 'portraitcoffee'] })));
const stumptownCaps = ['Based on true events. 🎄 Come taste the new holiday blend at the roastery', 'Friday plans: a fresh cup in the Impassable Wilderness. 🌲🍃'];
ok('B2 Stumptown (captions reales): «Based on true events.» ya no es producto', JSON.stringify(detectProducts({ bio: '', captions: stumptownCaps, excludeNames: ['Stumptown Coffee', 'stumptowncoffee'] })) === '[]', JSON.stringify(detectProducts({ bio: '', captions: stumptownCaps, excludeNames: ['Stumptown Coffee', 'stumptowncoffee'] })));
ok('B3 Caption suelta «RSVP at the link in bio» → []', JSON.stringify(detectProducts({ bio: '', captions: ['RSVP at the link in bio for our Fall Menu'] })) === '[]');
ok('B4 Caption «Café de» (recorte colgando) → []', JSON.stringify(detectProducts({ bio: '', captions: ['Café de'] })) === '[]');
ok('B5 Caption «Join us Saturday» (llamado, no producto) → []', JSON.stringify(detectProducts({ bio: '', captions: ['Join us Saturday for cars & coffee'] })) === '[]');
ok('B6 Caption con producto real sigue minando: «Cold brew de la casa»', JSON.stringify(detectProducts({ bio: '', captions: ['Cold brew de la casa'] })) === '["Cold brew de la casa"]', JSON.stringify(detectProducts({ bio: '', captions: ['Cold brew de la casa'] })));
const capsBarber = ['Fresh fade Friday 🔥 Book your chair', 'Clean taper + beard lineup', 'Walk-ins welcome today'];
ok('B7 Barbería (regresión v746): «Clean taper + beard lineup» sigue', JSON.stringify(detectProducts({ bio: '', captions: capsBarber, excludeNames: ['topclassbarbersquad'] })).includes('Clean taper + beard lineup'), JSON.stringify(detectProducts({ bio: '', captions: capsBarber, excludeNames: ['topclassbarbersquad'] })));
ok('B8 Slogans → [] (regresión v746)', JSON.stringify(detectProducts({ bio: '', captions: ['Timeless style. Effortless you.', 'Based on true events.'] })) === '[]');
ok('B9 Bio con oferta sigue minando (regresión test-lote9)', JSON.stringify(detectProducts({ bio: 'Cafetería de especialidad. Medialunas recién horneadas y brunch los domingos.' })) !== '[]', JSON.stringify(detectProducts({ bio: 'Cafetería de especialidad. Medialunas recién horneadas y brunch los domingos.' })));

// ---------- C) Productos reales de la web: links /products/ ----------
// Fixtures modelados sobre el HTML real de portrait.coffee y
// stumptowncoffee.com (7/11): los nombres viven en los links a
// /products/<handle>, no en los h2/h3 (que son secciones).
const pnf = typeof webExtract.productNamesFromHtml === 'function' ? webExtract.productNamesFromHtml : null;
const portraitFixture = '<h2 class="section-title">Best Sellers</h2>\n'
  + '<a class="product-card-link" href="/products/atliens-coffee">ATLiens Coffee</a>\n'
  + '<a class="product-card-link" href="/products/barry">BARRY</a>\n'
  + '<a class="product-card-link" href="/products/colombia-sugarcane-decaf">COLOMBIA SUGARCANE DECAF</a>\n'
  + '<a href="/products/ethiopia-metu-illubabor">ETHIOPIA METU ILLUBABOR</a>\n'
  + '<a href="/products/x">View options</a>\n'
  + '<h3 class="grid-item__title">Single Origin Coffees</h3>';
ok('C1 Portrait (fixture real): productos reales, sin secciones ni «View options»', pnf && JSON.stringify(pnf(portraitFixture)) === '["ATLiens Coffee","BARRY","COLOMBIA SUGARCANE DECAF","ETHIOPIA METU ILLUBABOR"]', pnf ? JSON.stringify(pnf(portraitFixture)) : 'sin productNamesFromHtml');
const stumpFixture = '<a href="/products/ethiopia-nano-challa" class="__button">Get Nano Challa</a>\n'
  + '<a href="/products/hair-bender">Hair Bender</a>\n'
  + '<h2>Join the Club</h2>';
ok('C2 Stumptown (fixture real): el botón «Get Nano Challa» da «Nano Challa»', pnf && JSON.stringify(pnf(stumpFixture)) === '["Nano Challa","Hair Bender"]', pnf ? JSON.stringify(pnf(stumpFixture)) : 'sin productNamesFromHtml');
const wooFixture = '<a href="/product/corte-fade">Corte fade</a><a href="/product/barba">Barba</a>';
ok('C3 /product/ singular (WooCommerce) también se lee', pnf && JSON.stringify(pnf(wooFixture)) === '["Corte fade","Barba"]', pnf ? JSON.stringify(pnf(wooFixture)) : 'sin productNamesFromHtml');
ok('C4 Sin links /products/ → [] (el camino de encabezados no cambia)', pnf && JSON.stringify(pnf('<h2>Best Sellers</h2><p>hola</p>')) === '[]', pnf ? JSON.stringify(pnf('<h2>Best Sellers</h2><p>hola</p>')) : 'sin productNamesFromHtml');

// ---------- D) Regresión: lo que ya andaba sigue andando ----------
ok('D1 Servicios listados siguen pasando tal cual (test-lote9)', JSON.stringify(detectProducts({ services: ['Café de especialidad', 'Medialunas', 'Brunch', 'Torta de chocolate', 'Café de especialidad', 'Alfajores'] })) === '["Café de especialidad","Medialunas","Brunch","Torta de chocolate"]', JSON.stringify(detectProducts({ services: ['Café de especialidad', 'Medialunas', 'Brunch', 'Torta de chocolate', 'Café de especialidad', 'Alfajores'] })));
ok('D2 isJunkServiceHeading sigue filtrando el chrome de Ladyee', webExtract.isJunkServiceHeading('Country/region and currency') === true && webExtract.isJunkServiceHeading('Your bag') === true && webExtract.isJunkServiceHeading('Corte fade') === false, 'Ladyee');

console.log('\n' + pass + ' ok · ' + fail + ' fallas' + (fails.length ? ' — ' + fails.join(' | ') : ''));
process.exit(fail ? 1 : 0);
