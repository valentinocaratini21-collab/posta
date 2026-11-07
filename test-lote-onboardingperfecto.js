// LOTE ONBOARDING-PERFECTO (4/11) — Valentino 23:17 «dale, armalo»:
// 1) espejo con el porqué (evidencia real, nunca un ranking de likes
//    inventado) · 2) foto con guía (pide la estrella, saltar sigue igual) ·
// 3) la semana completa como premio final (CTA pegado al feed) ·
// 4) retomar donde quedó (un toque, nunca de cero) ·
// 5) sin IG ni web, la foto ES el estudio (nunca un callejón sin salida).
// SOLO aserciones sobre public/prueba.html y public/en-prueba.html +
// ejecución real de las funciones extraídas (evidencia y retomar) con
// stubs. No se importa el script entero: es código de navegador.
// NO se pushea (precedente de la serie).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function treeDir() {
  const here = __dirname;
  if (fs.existsSync(path.join(here, 'public', 'prueba.html'))) return here;
  if (fs.existsSync(path.join(here, 'work', 'public', 'prueba.html'))) return path.join(here, 'work');
  throw new Error('no se encontro public/prueba.html junto al test ni en work/');
}
const T = treeDir();
const es = fs.readFileSync(path.join(T, 'public', 'prueba.html'), 'utf8');
const en = fs.readFileSync(path.join(T, 'public', 'en-prueba.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('OK  ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function count(h, s) { return h.split(s).length - 1; }
function has(h, s) { return h.indexOf(s) >= 0; }

// ---------- estático: los 5 ítems en ambos archivos ----------
for (const [tag, html] of [['ES', es], ['EN', en]]) {
  ok(tag + ' ítem1: opEvidenceHTML definida', count(html, 'function opEvidenceHTML()') === 1);
  ok(tag + ' ítem1: flRender la llama', has(html, '+ opEvidenceHTML()'));
  ok(tag + ' ítem1: FL.ev presente', has(html, 'ev: '));
  ok(tag + ' ítem1: FL.evIn con bio/web/foto', has(html, 'evIn: { bio:') && has(html, 'web:') && has(html, 'foto:'));
  ok(tag + ' ítem1: sin ranking de likes en la evidencia', !/opEvidenceHTML[\s\S]{0,2000}likes/.test(html));
  ok(tag + ' ítem2: FM.guideTitle/guideSub', has(html, 'guideTitle:') && has(html, 'guideSub:'));
  ok(tag + ' ítem2: fmShow usa título/sub guiados', has(html, 'FM.guideTitle.replace') && has(html, 'FM.guideSub.replace'));
  ok(tag + ' ítem2: saltar sigue generando igual', has(html, "box.querySelector('#fmSkip').addEventListener('click', function () { fmGoGenerate(); });"));
  ok(tag + ' ítem3: CTA pegado al feed en renderResults', has(html, 'insertBefore(opDone, opWrap.nextSibling)'));
  ok(tag + ' ítem3: weekDone y renderWeek intactos', has(html, "id=\"weekDone\"") && has(html, 'renderWeek();'));
  ok(tag + ' ítem4: funciones retomar', ['function opResumeSave(', 'function opResumeClear(', 'function opResumeLoad(', 'function opResumeGo(', 'function opResumeShowBanner('].every((f) => count(html, f) === 1));
  // (LOTE PRUEBA-CHAT) 'preguntas' pasa de 2 a 6 guardados: el chat guarda
  // en cada paso (chatNext/chatBack/chatBackTo + ACK de texto libre) para
  // retomar a mitad del hilo, no solo en avance/retroceso de pantallas.
  // (LOTE PREGUNTA-DONDE) 'espejo' pasa de 2 a 3 guardados: corregir la
  // ubicación en el espejo también guarda, si no un refresh la pierde.
  // (LOTE ETAPA-INSTAGRAM) 'espejo' pasa de 3 a 4 guardados: corregir la
  // etapa en el espejo también guarda, por el mismo motivo.
  // (LOTE ONBOARDING-DIVERTIDO v760) 'preguntas' pasa de 6 a 7 guardados:
  // studySoftApply guarda tras rellenar con el estudio en paralelo, para
  // que un refresh no pierda lo que el estudio ya cerró.
  ok(tag + ' ítem4: guardado en avance/retroceso/espejo/draft/foto', count(html, "opResumeSave('preguntas')") === 7 && count(html, "opResumeSave('espejo')") === 4 && count(html, "opResumeSave('draft')") === 2 && count(html, "opResumeSave('foto')") === 1);
  ok(tag + ' ítem4: borrado al completar y al entrar', has(html, 'function renderResults() {\n  const t = TRIAL;\n  try { opResumeClear(); }') && has(html, 'async function doGuestEnter() {\n  try { opResumeClear(); }'));
  ok(tag + ' ítem4: banner al iniciar', has(html, 'opResumeShowBanner(); } catch (e) {}'));
  ok(tag + ' ítem4: vence a los 7 días', has(html, '7 * 24 * 3600 * 1000'));
  ok(tag + ' ítem5: screenFotoEstudio definida y llamada', count(html, 'function screenFotoEstudio()') === 1 && has(html, 'screenFotoEstudio();'));
  ok(tag + ' ítem5: visión anónima + proc foto + saltar avanza', has(html, "fetch('/api/trial/foto-vision'") && has(html, "proc: 'foto'") && has(html, "box.querySelector('#fsSkip').addEventListener('click', function () { advance(); });"));
  // (LOTE PRUEBA-CHAT) La prueba pasa de 5 a 8 preguntas y el plan es por
  // huecos: sin estudio se preguntan las 8, en orden (el literal es el
  // fallback de buildPlan; con estudio, solo los huecos).
  ok(tag + ' intacto: 8 preguntas en orden (sin estudio)', has(html, "keys = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];"));
  ok(tag + ' intacto: draft 4 rondas', has(html, 'DRAFT_SETS') && has(html, 'draftShowRound(0)'));
  ok(tag + ' intacto: entrada directa guest', has(html, 'btnGuestEnter') && has(html, 'doGuestEnter'));
  ok(tag + ' intacto: espejo aprobado exige semana', has(html, 'OC_ESPEJO = { aprobado: 1'));
}

// ---------- lógica real: evidencia (extraída del archivo ES) ----------
function extractFn(html, name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('sin ' + name);
  // el cuerpo termina con el primer '\n  }\n' a nivel de función (las
  // funciones del lote cierran con dos espacios + llave)
  let depth = 0, j = html.indexOf('{', i);
  for (; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  return html.slice(i, j);
}
function sandbox(stubs) {
  const ctx = vm.createContext(Object.assign({
    console, S: {}, FL_E: { productos: [], vetos: [] }, FL: {}, OP_L: {},
    PREFILL: undefined, window: {},
    esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  }, stubs));
  return ctx;
}
{
  const ctx = sandbox({});
  vm.runInContext(extractFn(es, 'opEvidenceHTML'), ctx);
  // caso estrella con foto real + procedencia bio
  ctx.S = { ans: { q1: 'Café de especialidad', q1mix: 'uno' }, source: 'ig', products: [{ nombre: 'Café de especialidad', foto: '/media/real.jpg' }] };
  ctx.FL_E = { productos: [{ nombre: 'Café de especialidad', procedencia: 'bio' }], vetos: [] };
  ctx.FL = { ev: 'Vi que vendés', evIn: { bio: 'en tu bio', web: 'en tu web', foto: 'en tu foto' } };
  ctx.OP_L = { evSeen: 'Lo vi' };
  const out1 = vm.runInContext('opEvidenceHTML()', ctx);
  ok('evidencia: muestra estrella + foto real + bio', out1.includes('Café de especialidad') && out1.includes('/media/real.jpg') && out1.includes('en tu bio') && out1.includes('Vi que vendés'));
  ok('evidencia: sin mención a likes', !/like/i.test(out1));
  // caso foto-estudio: procedencia foto
  ctx.S = { ans: {}, source: 'email', products: [{ nombre: 'Campos', foto: null, proc: 'foto' }] };
  ctx.FL_E = { productos: [{ nombre: 'Campos', procedencia: 'foto' }], vetos: [] };
  const out2 = vm.runInContext('opEvidenceHTML()', ctx);
  ok('evidencia: procedencia foto en solo-email', out2.includes('Campos') && out2.includes('en tu foto'));
  // caso web: procedencia web
  ctx.S = { ans: {}, source: 'web', products: [{ nombre: 'Tortas', foto: '/media/t.jpg' }] };
  ctx.FL_E = { productos: [{ nombre: 'Tortas', procedencia: 'web' }], vetos: [] };
  const out3 = vm.runInContext('opEvidenceHTML()', ctx);
  ok('evidencia: procedencia web', out3.includes('Tortas') && out3.includes('en tu web'));
  // caso sin productos: sin bloque (fail-closed, el espejo muestra su vacío)
  ctx.S = { ans: {}, source: 'email', products: [] };
  ctx.FL_E = { productos: [], vetos: [] };
  ok('evidencia: sin productos no hay bloque', vm.runInContext('opEvidenceHTML()', ctx) === '');
  // caso fallback: foto de perfil PREFILL cuando el producto no trae foto
  ctx.S = { ans: { q1: 'Brunch', q1mix: 'uno' }, source: 'ig', products: [{ nombre: 'Brunch', foto: null }] };
  ctx.FL_E = { productos: [{ nombre: 'Brunch', procedencia: 'bio' }], vetos: [] };
  ctx.PREFILL = { photo: 'data:image/jpeg;base64,PERFIL' };
  const out5 = vm.runInContext('opEvidenceHTML()', ctx);
  ok('evidencia: fallback a foto de perfil', out5.includes('data:image/jpeg;base64,PERFIL'));
}

// ---------- lógica real: retomar (extraído del archivo ES) ----------
{
  const store = {};
  const ctx = sandbox({
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  });
  for (const fn of ['opResumeSave', 'opResumeClear', 'opResumeLoad', 'opResumeStepLabel']) {
    vm.runInContext(extractFn(es, fn), ctx);
  }
  ctx.OP_RESUME_KEY = 'posta_onboarding_resume_v1';
  ctx.OP_L = { stepPreguntas: 'tus preguntas', stepEspejo: 'el espejo', stepDraft: 'el draft', stepFoto: 'la foto' };
  ctx.S = { source: 'ig', email: null, ig: 'cafearoma', web: null, biz: 'Café Aroma', cat: 'cafeteria', products: [{ nombre: 'Café' }], rubroOptions: null, plan: ['q1', 'q2'], qi: 1, ans: { q1: 'Café' } };
  ctx.FL_E = { productos: [{ nombre: 'Café', procedencia: 'bio' }], vetos: ['Tortas'] };
  ctx.DR = null;
  vm.runInContext("opResumeSave('preguntas')", ctx);
  const loaded = vm.runInContext('opResumeLoad()', ctx);
  ok('retomar: round-trip guarda paso y respuestas', !!loaded && loaded.stage === 'preguntas' && loaded.S.qi === 1 && loaded.S.ans.q1 === 'Café' && loaded.FL.vetos[0] === 'Tortas');
  ok('retomar: etiquetas de paso', vm.runInContext("opResumeStepLabel('espejo')", ctx) === 'el espejo' && vm.runInContext("opResumeStepLabel('draft')", ctx) === 'el draft' && vm.runInContext("opResumeStepLabel('foto')", ctx) === 'la foto' && vm.runInContext("opResumeStepLabel('preguntas')", ctx) === 'tus preguntas');
  // vencido >7 días → null
  const raw = JSON.parse(store['posta_onboarding_resume_v1']);
  raw.ts = Date.now() - 8 * 24 * 3600 * 1000;
  store['posta_onboarding_resume_v1'] = JSON.stringify(raw);
  ok('retomar: vencido a los 8 días no se ofrece', vm.runInContext('opResumeLoad()', ctx) === null);
  // corrupto → null, no explota
  store['posta_onboarding_resume_v1'] = '{no-json';
  ok('retomar: corrupto no explota', vm.runInContext('opResumeLoad()', ctx) === null);
  // clear borra
  store['posta_onboarding_resume_v1'] = JSON.stringify({ v: 1, ts: Date.now(), stage: 'foto', S: { plan: [] } });
  vm.runInContext('opResumeClear()', ctx);
  ok('retomar: clear borra el estado', !('posta_onboarding_resume_v1' in store));
}

// ---------- lógica real: título guiado de la foto (líneas extraídas) ----------
{
  const m = es.match(/var fmStar = [^\n]+\n\s*var fmTitle = [^\n]+\n\s*var fmSub = [^\n]+/);
  ok('foto guiada: líneas fmStar/fmTitle/fmSub extraíbles', !!m);
  if (m) {
    const ctx = sandbox({});
    ctx.S = { ans: { q1: 'Café de especialidad', q1mix: 'uno' } };
    ctx.FL_E = { productos: [{ nombre: 'Café de especialidad' }], vetos: [] };
    ctx.FM = { title: 'Subí una foto de tu negocio', sub: 'Opcional — seguí igual.', guideTitle: 'Mandame la foto de tu producto estrella', guideSub: 'Si tenés una foto de {star}, subila.' };
    vm.runInContext(m[0], ctx);
    ok('foto guiada: con estrella pide la estrella', ctx.fmTitle === 'Mandame la foto de tu producto estrella' && ctx.fmSub.includes('Café de especialidad'));
    const ctx2 = sandbox({});
    ctx2.S = { ans: {} };
    ctx2.FL_E = { productos: [], vetos: [] };
    ctx2.FM = ctx.FM;
    vm.runInContext(m[0], ctx2);
    ok('foto guiada: sin estrella usa título genérico', ctx2.fmTitle === 'Subí una foto de tu negocio');
  }
}

console.log('\n' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
