// test-lote-etapa-instagram.js
// LOTE ETAPA-DEL-INSTAGRAM — Posty detecta la etapa del IG en el estudio
// y la propone para confirmar con un toque (hueco 'etapa', no q9 fija).
// La etapa viaja al fundamento (OC_ANS.etapa) y al espejo; con
// 'lanzamiento' la prueba genera el arco de 3 días (presenta el negocio,
// estrella como aviso completo, cómo funciona). Con 'irregular' o
// 'activo' la prueba sigue como hoy.
// Uso: node test-lote-etapa-instagram.js   (BASE no se usa: sin boot;
// el boot con IG en vivo es M121 del preparador)
// PRE (base v737, árbol release-v736): 6 ok · 62 fallas.
// POST (este árbol): 68 ok · 0 fallas.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const DIR = __dirname;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('  FALLO: ' + name + (extra !== undefined ? ' :: ' + extra : '')); }
}
function has(s, sub) { return s.indexOf(sub) >= 0; }
function count(s, sub) { return s.split(sub).length - 1; }

const es = fs.readFileSync(path.join(DIR, 'public/prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(DIR, 'public/en-prueba.html'), 'utf8');
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const genSrc = fs.readFileSync(path.join(DIR, 'generator.js'), 'utf8');
const digSrc = fs.readFileSync(path.join(DIR, 'client-digest.js'), 'utf8');
const demSrc = fs.readFileSync(path.join(DIR, 'demo.js'), 'utf8');

// ---------- A) Estático: front ES+EN ----------
ok('A1 ES: T.chatEtapa/qEtapa/etapaChip/etapaNota exactos', has(es, "chatEtapa: 'vi tu instagram y está vacío — arrancamos de cero, ¿no?',") && has(es, "qEtapa: '¿En qué etapa está tu Instagram?',") && has(es, "etapaChip: '✦ así lo veo yo',") && has(es, "etapaNota: 'La opción dorada es lo que vi en tu Instagram. Tocá para confirmar o elegí otra.',"));
ok('A1b EN: T.chatEtapa/qEtapa/etapaChip/etapaNota exactos', has(en, "chatEtapa: \"i looked at your instagram and it's empty — we're starting from zero, right?\",") && has(en, "qEtapa: 'What stage is your Instagram at?',") && has(en, "etapaChip: \"✦ that's what I see\",") && has(en, "etapaNota: 'The gold option is what I saw on your Instagram. Tap to confirm or pick another.',"));
ok('A2 ES+EN: ETAPA_OPTS con los 3 valores', has(es, "{ v: 'lanzamiento', l: 'Recién arranco', sub: 'mi Instagram está vacío o casi' }") && has(es, "{ v: 'irregular', l: 'Posteo cuando me acuerdo', sub: 'tengo posteos pero sin constancia' }") && has(es, "{ v: 'activo', l: 'Posteo seguido', sub: 'quiero vender más' }") && has(en, "{ v: 'lanzamiento', l: 'Just starting', sub: 'my instagram is empty or almost' }") && has(en, "{ v: 'irregular', l: 'I post when I remember', sub: 'i have posts but no consistency' }") && has(en, "{ v: 'activo', l: 'I post often', sub: 'i want to sell more' }"));
ok('A3 ES+EN: etapaDetectada definida 1 vez por archivo', count(es, 'function etapaDetectada() {') === 1 && count(en, 'function etapaDetectada() {') === 1);
ok('A3b ES+EN: etapaDetectada: 0–2 → lanzamiento; >30 días → irregular; ≥3 en 30 días → activo; sin dato → null', has(es, "if (total < 3) return 'lanzamiento';") && has(es, "if (days > 30) return 'irregular';") && has(es, "if (recent >= 3) return 'activo';") && has(es, 'if (total === null) return null;') && has(en, "if (total < 3) return 'lanzamiento';") && has(en, "if (days > 30) return 'irregular';") && has(en, "if (recent >= 3) return 'activo';"));
ok('A4 ES+EN: S.igStage en el estado + studyIg lo guarda del prefill', has(es, 'igFacts: null, igStage: null };') && has(es, 'S.igStage = d.ig_stage || null;') && has(en, 'igFacts: null, igStage: null };') && has(en, 'S.igStage = d.ig_stage || null;'));
ok('A5 ES+EN: screenFor + screenEtapa (paridad; el flujo vivo es el chat)', has(es, "if (key === 'etapa') return screenEtapa;") && has(es, 'function screenEtapa() {') && has(en, "if (key === 'etapa') return screenEtapa;") && has(en, 'function screenEtapa() {'));
ok('A6 ES+EN: chatQText rama etapa (burbuja solo si detección es lanzamiento)', has(es, "if (key === 'etapa') return { chat: etapaDetectada() === 'lanzamiento' ? T.chatEtapa : '', title: T.qEtapa };") && has(en, "if (key === 'etapa') return { chat: etapaDetectada() === 'lanzamiento' ? T.chatEtapa : '', title: T.qEtapa };"));
ok('A6b ES+EN: chatAnswerLabel rama etapa', has(es, "if (key === 'etapa') return etapaLabel(a.etapa);") && has(en, "if (key === 'etapa') return etapaLabel(a.etapa);"));
ok('A6c ES+EN: chatOptionsFor rama etapa (detectada con estrella)', has(es, "if (key === 'etapa') {") && has(es, "return ETAPA_OPTS.map(function (o) { return { v: o.v, l: o.l, sub: o.sub, estrella: det === o.v }; });") && has(en, "if (key === 'etapa') {") && has(en, "return ETAPA_OPTS.map(function (o) { return { v: o.v, l: o.l, sub: o.sub, estrella: det === o.v }; });"));
ok('A6d ES+EN: chatPick guarda etapa + postea la respuesta', has(es, "if (key === 'etapa') {") && has(es, 'S.ans.etapa = v;') && has(es, "chatPost('answer', { question: T.qEtapa, value: etapaLabel(v) });") && has(en, 'S.ans.etapa = v;') && has(en, "chatPost('answer', { question: T.qEtapa, value: etapaLabel(v) });"));
ok('A6e ES+EN: nota dorada (chip + nota) solo con detección', has(es, "if (key === 'etapa' && etapaDetectada()) {") && has(es, "esc(T.etapaChip) + '<br>' + esc(T.etapaNota)") && has(en, "if (key === 'etapa' && etapaDetectada()) {") && has(en, "esc(T.etapaChip) + '<br>' + esc(T.etapaNota)"));
ok('A7 ES+EN: buildPlan inserta etapa SIEMPRE, después de ubicacion, antes de las q', has(es, "if (plan.indexOf('etapa') < 0) { plan.push('etapa'); }") && has(en, "if (plan.indexOf('etapa') < 0) { plan.push('etapa'); }") && es.indexOf("plan.push('etapa')") > es.indexOf("plan.push('ubicacion')") && en.indexOf("plan.push('etapa')") > en.indexOf("plan.push('ubicacion')"));
ok('A8 ES+EN: OC_ANS.etapa en sprout + resume + fd.append', count(es, "etapa: S.ans.etapa || '',") === 2 && count(en, "etapa: S.ans.etapa || '',") === 2 && has(es, "fd.append('etapa', OC_ANS.etapa || '');") && has(en, "fd.append('etapa', OC_ANS.etapa || '');"));
ok('A9 ES+EN: espejo tiene fila etapa + bindings', has(es, "etapaLbl: 'En qué etapa está',") && has(es, 'function flEtapaRowHTML() {') && has(es, '+ flEtapaRowHTML()') && has(es, "box.querySelector('#flEtapaEdit')") && has(es, "box.querySelectorAll('.fl-etapa-opt')") && has(en, "etapaLbl: 'What stage is it at',") && has(en, 'function flEtapaRowHTML() {') && has(en, '+ flEtapaRowHTML()') && has(en, "box.querySelector('#flEtapaEdit')") && has(en, "box.querySelectorAll('.fl-etapa-opt')"));
ok('A9b ES+EN: corrección del espejo guarda en S.ans.etapa + OC_ANS.etapa', has(es, "S.ans.etapa = b.getAttribute('data-v');") && has(es, 'window.OC_ANS.etapa = S.ans.etapa || \'\';') && has(en, "S.ans.etapa = b.getAttribute('data-v');") && has(en, 'window.OC_ANS.etapa = S.ans.etapa || \'\';'));
ok('A10 ES+EN: resume guarda/restaura igStage', has(es, 'igFacts: S.igFacts || null, igStage: S.igStage || null,') && has(es, 'S.igFacts = s.igFacts || null; S.igStage = s.igStage || null;') && has(en, 'igFacts: S.igFacts || null, igStage: S.igStage || null,') && has(en, 'S.igFacts = s.igFacts || null; S.igStage = s.igStage || null;'));

// ---------- B) Estático: servidor ----------
ok('B1 server: prefill calcula ig_stage (posts_count + last_post_at + recent_30d)', has(srv, 'const igStage = (() => {') && has(srv, 'posts_count: postsCount, last_post_at: last, recent_30d: recent30d') && has(srv, "const postsCount = (typeof prof.posts_count === 'number' && prof.posts_count >= 0)") && has(srv, 'recent_30d: recent30d }'));
ok('B1b server: prefill responde ig_stage top-level', has(srv, 'ig_stage: igStage,'));
ok('B2 server: OC_ETAPA + onboardingAnswersFrom valida etapa', has(srv, "const OC_ETAPA = ['lanzamiento', 'irregular', 'activo'];") && has(srv, "etapa: OC_ETAPA.includes(clean(f.etapa, 20)) ? clean(f.etapa, 20) : '',"));
ok('B2b server: onboardingAnswersOk: etapa opcional, si viene tiene que ser uno de los 3', has(srv, "if (a.etapa && !OC_ETAPA.includes(a.etapa)) return false;"));
ok('B2c server: onboardingGoalLines agrega línea por etapa', has(srv, "if (a.etapa) lines.push((en ? 'Instagram stage: ' : 'Etapa del Instagram: ')"));
ok('B3 server: etapa confirmada manda sobre detectEtapa en generate Y stream (x2)', count(srv, "const etapaTrial = ocAns.etapa === 'lanzamiento' ? 'lanzamiento' : (() => { try { return clientDigest.detectEtapa(") === 2);

// ---------- C) Estático: generador / digest / demo ----------
ok('C1 generator: launchArcIdeas compartido (ES+EN) con guarda cap6', has(genSrc, 'function launchArcIdeas({ business, lang, star }) {') && has(genSrc, "titulo: cap6(en ? 'it all starts here' : 'todo empieza acá')") && has(genSrc, "titulo: cap6(en ? 'the star of the house' : 'la estrella de la casa')") && has(genSrc, "titulo: cap6(en ? 'that easy' : 'así de fácil')"));
ok('C1b generator: Día 2 lleva visual listing (aviso completo, nunca foto recortada)', has(genSrc, "visual: 'listing'"));
ok('C2 generator: templateIdeas + templateIdeasEn anteponen el arco con lanzamiento', has(genSrc, "if (etapa === 'lanzamiento') {\n    return launchArcIdeas({ business, lang: 'en', star: r1 }).concat(pool.slice(0, 4));") && has(genSrc, "if (etapa === 'lanzamiento') {\n    return withEphemeris(launchArcIdeas({ business, lang: 'es', star: r1 }).concat(pool.slice(0, 4)));"));
ok('C3 digest: deriveTopics antepone el arco (marcadores _launch 1/2/3, Día 2 listing)', has(digSrc, "const igEtapa = digest.onboarding && digest.onboarding.etapa;") && has(digSrc, "if (igEtapa === 'lanzamiento') {") && has(digSrc, 't1._launch = 1;') && has(digSrc, "t2._launch = 2; t2.visual = 'listing';") && has(digSrc, 't3._launch = 3;'));
ok('C4 demo: specPost propaga visual (contrato para el render)', has(demSrc, 'visual: t.visual || undefined,'));

// ---------- D) Unit: generator.templateIdeas (ideas del payload) ----------
const gen = require('./generator.js');
const dnaFits = { productos: [{ nombre: 'Remera oversize' }], producto_estrella: 'Remera oversize' };
function ideasFor(etapa, lang) {
  return gen.templateIdeas({ business: 'Fitswapp', category: 'tienda', competitors: '', goal: '', recentTopics: null, ephemeris: null, excluded: null, dna: dnaFits, description: 'tienda de ropa vintage en Atlanta', etapa, lang, productos: [{ nombre: 'Remera oversize' }] });
}
const ideasEs = ideasFor('lanzamiento', 'es');
ok('D1 ES lanzamiento: las 3 primeras ideas son el arco', Array.isArray(ideasEs) && ideasEs.length >= 3 && ideasEs[0].titulo === 'todo empieza acá' && ideasEs[1].titulo === 'la estrella de la casa' && ideasEs[2].titulo === 'así de fácil', JSON.stringify((ideasEs || []).slice(0, 3).map((i) => i.titulo)));
ok('D1b ES lanzamiento: Día 2 es la estrella como aviso completo (visual listing)', ideasEs[1].visual === 'listing' && /Remera oversize/.test(ideasEs[1].angulo || ''), JSON.stringify(ideasEs[1]));
ok('D1c ES lanzamiento: titulares de 6 palabras o menos', ideasEs.slice(0, 3).every((i) => String(i.titulo || '').split(/\s+/).filter(Boolean).length <= 6));
const ideasEn = ideasFor('lanzamiento', 'en');
ok('D2 EN lanzamiento: arco en inglés', Array.isArray(ideasEn) && ideasEn[0].titulo === 'it all starts here' && ideasEn[1].titulo === 'the star of the house' && ideasEn[2].titulo === 'that easy' && ideasEn[1].visual === 'listing', JSON.stringify((ideasEn || []).slice(0, 3).map((i) => i.titulo)));
const ideasActivo = ideasFor('activo', 'es');
ok('D3 ES activo: NO hay arco (sigue como hoy)', Array.isArray(ideasActivo) && ideasActivo.length >= 1 && ideasActivo[0].titulo !== 'todo empieza acá' && !ideasActivo.slice(0, 3).some((i) => i.visual === 'listing'), JSON.stringify((ideasActivo || []).slice(0, 3).map((i) => i.titulo)));
const ideasSin = ideasFor('', 'es');
ok('D4 ES sin etapa: NO hay arco (sigue como hoy)', Array.isArray(ideasSin) && ideasSin.length >= 1 && ideasSin[0].titulo !== 'todo empieza acá', JSON.stringify((ideasSin || []).slice(0, 3).map((i) => i.titulo)));

// ---------- E) Unit: client-digest.deriveTopics (los 3 posteos de la prueba) ----------
const cd = require('./client-digest.js');
function digestEtapa(etapa, lang) {
  const d = { business: 'Fitswapp', category: 'tienda', productos: [{ nombre: 'Remera oversize' }, { nombre: 'Campera de jean' }], servicios: [] };
  if (etapa !== undefined) d.onboarding = { etapa };
  return d;
}
const topEs = cd.deriveTopics(digestEtapa('lanzamiento'), { count: 5, lang: 'es' });
ok('E1 ES lanzamiento: 5 topics, los 3 primeros son el arco (_launch 1/2/3)', Array.isArray(topEs) && topEs.length === 5 && topEs[0]._launch === 1 && topEs[1]._launch === 2 && topEs[2]._launch === 3, JSON.stringify((topEs || []).map((t) => ({ h: t.headline, l: t._launch }))));
ok('E1b ES lanzamiento: titulares del arco', topEs[0].headline === 'todo empieza acá' && topEs[1].headline === 'la estrella de la casa' && topEs[2].headline === 'así de fácil', JSON.stringify(topEs.slice(0, 3).map((t) => t.headline)));
ok('E1c ES lanzamiento: Día 2 visual listing + ancla la estrella real', topEs[1].visual === 'listing' && /Remera oversize/.test(topEs[1].digest_anchor || ''), JSON.stringify(topEs[1]));
ok('E1d ES lanzamiento: los 2 topics restantes NO repiten la estrella del arco', !topEs.slice(3).some((t) => (t.digest_anchor || '') === 'Remera oversize'), JSON.stringify(topEs.slice(3).map((t) => t.digest_anchor)));
const topEn = cd.deriveTopics(digestEtapa('lanzamiento'), { count: 5, lang: 'en' });
ok('E2 EN lanzamiento: arco en inglés', Array.isArray(topEn) && topEn[0].headline === 'it all starts here' && topEn[1].headline === 'the star of the house' && topEn[2].headline === 'that easy' && topEn[1].visual === 'listing', JSON.stringify((topEn || []).slice(0, 3).map((t) => t.headline)));
const topActivo = cd.deriveTopics(digestEtapa('activo'), { count: 5, lang: 'es' });
ok('E3 ES activo: NO hay arco (sigue como hoy)', Array.isArray(topActivo) && topActivo.length >= 1 && !topActivo.some((t) => t._launch), JSON.stringify((topActivo || []).map((t) => t.headline)));
const topIrregular = cd.deriveTopics(digestEtapa('irregular'), { count: 5, lang: 'es' });
ok('E4 ES irregular: NO hay arco (sigue como hoy)', Array.isArray(topIrregular) && !topIrregular.some((t) => t._launch), JSON.stringify((topIrregular || []).map((t) => t.headline)));
const topSin = cd.deriveTopics(digestEtapa(undefined), { count: 5, lang: 'es' });
ok('E5 ES sin onboarding: NO hay arco (sigue como hoy)', Array.isArray(topSin) && !topSin.some((t) => t._launch), JSON.stringify((topSin || []).map((t) => t.headline)));

// ---------- F) Unit: onboardingAnswersFrom/Ok/GoalLines del servidor (vía vm) ----------
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const srvCtx = {};
let srvFnsOk = true;
try {
vm.createContext(srvCtx);
for (const c of ['OC_CTA', 'OC_PROMO', 'OC_VOZ', 'OC_PRECIOS', 'OC_DONDE', 'OC_ETAPA']) {
  const m = srv.match(new RegExp('const ' + c + ' = (\\[[^\\]]+\\]);'));
  if (!m) throw new Error('sin const ' + c + ' en server.js');
  vm.runInContext('var ' + c + ' = ' + m[1] + ';', srvCtx, { filename: 'const-' + c });
}
for (const f of ['function onboardingAnswersFrom(fields) {', 'function onboardingAnswersOk(a, opts) {', 'function onboardingGoalLines(a, lang, detectados) {']) {
  const srcFn = fnFrom(srv, f);
  if (!srcFn) throw new Error('sin ' + f + ' en server.js');
  vm.runInContext(srcFn, srvCtx, { filename: 'srv-fn' });
}
} catch (e) { srvFnsOk = false; }
const from = srvFnsOk ? vm.runInContext('onboardingAnswersFrom({ producto_estrella: "Remera", producto_mix: "uno", cta: "comprar", promo: "ninguna", voz: "cercano", precios: "si", donde: "instagram", etapa: "lanzamiento", audiencia_mix: "todos", diferencial_mix: "nose", lineas_rojas_mix: "nada" })', srvCtx) : {};
ok('F1 From: etapa lanzamiento pasa limpia', from.etapa === 'lanzamiento' && from.donde === 'instagram', JSON.stringify(from));
const fromMala = srvFnsOk ? vm.runInContext("onboardingAnswersFrom({ etapa: 'zzz' })", srvCtx) : {};
ok('F1b From: etapa inválida → vacía (nunca se guarda basura)', fromMala.etapa === '', JSON.stringify(fromMala));
const okBase = { producto_mix: 'uno', producto_estrella: 'Remera', cta: 'comprar', promo: 'ninguna', voz: 'cercano', precios: 'si', donde: 'instagram', audiencia_mix: 'todos', diferencial_mix: 'nose', lineas_rojas_mix: 'nada' };
if (srvFnsOk) vm.runInContext('var OKBASE = ' + JSON.stringify(okBase) + ';', srvCtx);
ok('F2 Ok: sin etapa pasa (prueba como hoy)', srvFnsOk && vm.runInContext("onboardingAnswersOk(OKBASE, { ig: true })", srvCtx) === true);
ok('F2b Ok: etapa lanzamiento pasa', srvFnsOk && vm.runInContext("onboardingAnswersOk(Object.assign({}, OKBASE, { etapa: 'lanzamiento' }), { ig: true })", srvCtx) === true);
ok('F2c Ok: etapa inválida NO pasa', srvFnsOk && vm.runInContext("onboardingAnswersOk(Object.assign({}, OKBASE, { etapa: 'zzz' }), { ig: true })", srvCtx) === false);
const lines = srvFnsOk ? vm.runInContext("onboardingGoalLines(Object.assign({}, OKBASE, { etapa: 'irregular' }), 'es', [])", srvCtx) : [];
ok('F3 GoalLines: la etapa viaja al digest como línea propia', Array.isArray(lines) && lines.some((l) => /Etapa del Instagram: postea cuando se acuerda/.test(l)), JSON.stringify(lines));

// ---------- G) VM: el front REAL (funciones extraídas de prueba.html) ----------
const gapsMod = require('./preguntas-dinamicas.js');
const { preguntasDinamicasGaps, DYN_TARGETS } = gapsMod;
function planCtx(html, S, WEB) {
  const ctx = { S, WEB, DYN_TARGETS, preguntasDinamicasGaps };
  vm.createContext(ctx);
  vm.runInContext('function chatGaps() { var input = { facts: S.facts || {}, productos: (S.products || []).map(function (p) { return p.nombre; }), category: S.cat || \'\', lang: \'es\' }; try { return preguntasDinamicasGaps(input); } catch (e) { return { needed: DYN_TARGETS.filter(function (t) { return t.kind === \'answer\'; }), known: {} }; } }', ctx, { filename: 'chatGaps-stub' });
  const m = html.match(/var DYN_TARGET_TO_KEY = (\{[^}]+\});/);
  if (!m) return null;
  vm.runInContext('var DYN_TARGET_TO_KEY = ' + m[1] + ';', ctx, { filename: 'dynmap' });
  const srcDonde = fnFrom(html, 'function dondeAprendido(facts) {');
  const srcEtapa = fnFrom(html, 'function etapaDetectada() {');
  const srcPlan = fnFrom(html, 'function buildPlan() {');
  if (!srcDonde || !srcEtapa || !srcPlan) return null;
  vm.runInContext(srcDonde + '\n' + srcEtapa + '\n' + srcPlan, ctx, { filename: 'buildPlan' });
  return ctx;
}
function planFor(html, S, WEB) {
  const ctx = planCtx(html, S, WEB);
  if (!ctx) return [];
  vm.runInContext('buildPlan();', ctx, { filename: 'run-plan' });
  return ctx.S.plan.slice();
}
function detFor(html, igStage) {
  const ctx = { S: { igStage } };
  vm.createContext(ctx);
  const src = fnFrom(html, 'function etapaDetectada() {');
  if (!src) return undefined;
  vm.runInContext(src, ctx, { filename: 'etapaDetectada' });
  return vm.runInContext('etapaDetectada()', ctx, { filename: 'det' });
}
function mkS(source, facts, products, cat, ans, igStage) {
  return { source, rubroOptions: undefined, facts, products: products || [], cat: cat || '', ans: ans || {}, igStage: igStage === undefined ? null : igStage };
}
const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;
const factsBarberia = { _known: true, has_local: false, address: '', category: 'barberia', rubro: '' };

ok('G1 ES detección: 0 posteos → lanzamiento', detFor(es, { posts_count: 0, last_post_at: null, recent_30d: 0 }) === 'lanzamiento');
ok('G1b ES detección: 2 posteos → lanzamiento', detFor(es, { posts_count: 2, last_post_at: NOW - 5 * DAY, recent_30d: 2 }) === 'lanzamiento');
ok('G2 ES detección: 12 posteos, último hace 40 días → irregular', detFor(es, { posts_count: 12, last_post_at: NOW - 40 * DAY, recent_30d: 0 }) === 'irregular');
ok('G3 ES detección: 12 posteos, último hace 2 días, 5 en 30 días → activo', detFor(es, { posts_count: 12, last_post_at: NOW - 2 * DAY, recent_30d: 5 }) === 'activo');
ok('G4 ES detección: 5 posteos recientes pero solo 1 en 30 días → null (sin propuesta, no se adivina)', detFor(es, { posts_count: 5, last_post_at: NOW - 2 * DAY, recent_30d: 1 }) === null);
ok('G4b ES detección: 12 posteos sin fecha → null', detFor(es, { posts_count: 12, last_post_at: null, recent_30d: 0 }) === null);
ok('G4c ES detección: sin IG estudiado → null', detFor(es, null) === null);
ok('G5 EN detección: 0 posteos → lanzamiento (paridad)', detFor(en, { posts_count: 0, last_post_at: null, recent_30d: 0 }) === 'lanzamiento');
ok('G5b EN detección: 12 posteos, último hace 40 días → irregular (paridad)', detFor(en, { posts_count: 12, last_post_at: NOW - 40 * DAY, recent_30d: 0 }) === 'irregular');

const planLanz = planFor(es, mkS('ig', factsBarberia, [{ nombre: 'Corte' }], 'barberia', {}, { posts_count: 0, last_post_at: null, recent_30d: 0 }), undefined);
ok('G6 ES plan: IG vacío pregunta etapa, después de ubicacion', planLanz.includes('etapa') && planLanz.indexOf('etapa') > planLanz.indexOf('ubicacion'), JSON.stringify(planLanz));
const planEmail = planFor(es, mkS('email', null, [], '', {}, null), undefined);
ok('G7 ES plan: sin estudio (email) pregunta etapa, después de donde y antes de q1', JSON.stringify(planEmail) === JSON.stringify(['rubro', 'donde', 'etapa', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']), JSON.stringify(planEmail));
const planActivo = planFor(es, mkS('ig', factsBarberia, [{ nombre: 'Corte' }], 'barberia', {}, { posts_count: 12, last_post_at: NOW - 2 * DAY, recent_30d: 5 }), undefined);
ok('G8 ES plan: IG activo también pregunta etapa (la confirmación siempre aporta)', planActivo.includes('etapa'), JSON.stringify(planActivo));
const planEmailEN = planFor(en, mkS('email', null, [], '', {}, null), undefined);
ok('G9 EN plan: sin estudio pregunta etapa, después de donde y antes de q1 (paridad)', JSON.stringify(planEmailEN) === JSON.stringify(['rubro', 'donde', 'etapa', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']), JSON.stringify(planEmailEN));

function optsFor(html, S, T) {
  const ctx = { S, T };
  vm.createContext(ctx);
  const m = html.match(/var ETAPA_OPTS = (\[[\s\S]*?\]);/);
  if (!m) return null;
  vm.runInContext('var ETAPA_OPTS = ' + m[1] + ';', ctx, { filename: 'etapa-opts' });
  const srcDet = fnFrom(html, 'function etapaDetectada() {');
  const srcOpts = fnFrom(html, 'function chatOptionsFor(key) {');
  if (!srcDet || !srcOpts) return null;
  vm.runInContext(srcDet + '\n' + srcOpts, ctx, { filename: 'chatOptionsFor' });
  return vm.runInContext('chatOptionsFor("etapa")', ctx, { filename: 'opts' });
}
const TES = { libre: 'Escribilo con tus palabras', libreSub: 'Escribí lo que vendés, con tus palabras' };
const oLanz = optsFor(es, { igStage: { posts_count: 0, last_post_at: null, recent_30d: 0 } }, TES);
ok('G10 ES opciones: IG vacío marca lanzamiento en dorado (estrella)', Array.isArray(oLanz) && oLanz.length === 3 && oLanz[0].v === 'lanzamiento' && oLanz[0].estrella === true && oLanz[1].estrella !== true && oLanz[2].estrella !== true, JSON.stringify(oLanz));
const oSin = optsFor(es, { igStage: null }, TES);
ok('G11 ES opciones: sin detección ninguna marcada (se pregunta sin propuesta)', Array.isArray(oSin) && oSin.length === 3 && oSin.every((o) => !o.estrella), JSON.stringify(oSin));
const oAct = optsFor(es, { igStage: { posts_count: 12, last_post_at: NOW - 2 * DAY, recent_30d: 5 } }, TES);
ok('G12 ES opciones: IG activo marca activo en dorado', Array.isArray(oAct) && oAct[2].v === 'activo' && oAct[2].estrella === true, JSON.stringify(oAct));

function qTextFor(html, S, T) {
  const ctx = { S, T };
  vm.createContext(ctx);
  const srcDet = fnFrom(html, 'function etapaDetectada() {');
  const srcQ = fnFrom(html, 'function chatQText(key) {');
  if (!srcDet || !srcQ) return {};
  vm.runInContext(srcDet + '\n' + srcQ, ctx, { filename: 'chatQText' });
  return vm.runInContext('chatQText("etapa")', ctx, { filename: 'qtext' });
}
const TET = { chatEtapa: 'vi tu instagram y está vacío — arrancamos de cero, ¿no?', qEtapa: '¿En qué etapa está tu Instagram?' };
const qLanz = qTextFor(es, { igStage: { posts_count: 0, last_post_at: null, recent_30d: 0 } }, TET);
ok('G13 ES pregunta: IG vacío trae la burbuja («vi tu instagram y está vacío…»)', qLanz && qLanz.chat === TET.chatEtapa && qLanz.title === TET.qEtapa, JSON.stringify(qLanz));
const qSin = qTextFor(es, { igStage: null }, TET);
ok('G14 ES pregunta: sin detección solo la pregunta, sin burbuja', qSin && qSin.chat === '' && qSin.title === TET.qEtapa, JSON.stringify(qSin));
const qIrr = qTextFor(es, { igStage: { posts_count: 12, last_post_at: NOW - 40 * DAY, recent_30d: 0 } }, TET);
ok('G15 ES pregunta: IG irregular tampoco trae burbuja (solo el vacío la trae)', qIrr && qIrr.chat === '' && qIrr.title === TET.qEtapa, JSON.stringify(qIrr));

function ansLabelFor(html, ans) {
  const ctx = { S: { ans, igStage: null } };
  vm.createContext(ctx);
  const m = html.match(/var ETAPA_OPTS = (\[[\s\S]*?\]);/);
  if (!m) return '';
  vm.runInContext('var ETAPA_OPTS = ' + m[1] + ';', ctx, { filename: 'etapa-opts' });
  const srcLab = fnFrom(html, 'function etapaLabel(v) {');
  const srcAns = fnFrom(html, 'function chatAnswerLabel(key) {');
  if (!srcLab || !srcAns) return '';
  vm.runInContext(srcLab + '\n' + srcAns, ctx, { filename: 'chatAnswerLabel' });
  return vm.runInContext('chatAnswerLabel("etapa")', ctx, { filename: 'anslabel' });
}
ok('G16 ES respuesta: la etapa confirmada se muestra con su rótulo', ansLabelFor(es, { etapa: 'irregular' }) === 'Posteo cuando me acuerdo', ansLabelFor(es, { etapa: 'irregular' }));

console.log(`\n${pass} ok · ${fail} fallas`);
process.exit(fail ? 1 : 0);
