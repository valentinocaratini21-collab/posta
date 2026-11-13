// test-lote-correctivo-3-idioma.js
// LOTE CORRECTIVO-3 · IDIOMA FAIL-CLOSED (BUILD provisorio v985)
//
// Verifica:
//  (a) Forzando respuestas del LLM que reprueban la puerta EN (fuga de
//      español, como el caso real 644/648), el caption finalmente
//      entregado PASA captionPassesEn — cero entregas en el idioma
//      equivocado (generateContent y generateCaptions).
//  (b) El prompt armado con lang='en' NO contiene «VOSEO» ni los
//      ejemplos en español del reglamento; con lang='es' SÍ (intacto).
//  (c) openaiCaptions con lang='en' construye su prompt en inglés y
//      respeta la puerta EN en lo que entrega (vía generateCaptions).
//  (d) CONTROL sobre la base (si el árbol base-v980 está al lado, en
//      ../base-v980): el mismo forzado SÍ entrega el reprobado.
//  (e) Comportamiento en español SIN cambios: la salida "mejor
//      candidato" histórica sigue entregando en 'es'.
//  (boot) El árbol bootea y /api/version reporta el BUILD del lote.
//
// Uso: node test-lote-correctivo-3-idioma.js   (desde la raíz del árbol)

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let pass = 0, fail = 0, skip = 0;
function T(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
}
function SKIP(name, why) { skip++; console.log(`  ~ SKIP ${name} (${why})`); }

// ---------- Fixtures ----------
const LEAK = '¿Te imaginás un café que te hable al alma?\n\nLo probás una vez y ya no volvés al de siempre: grano fresco, tostado en el barrio.\n\nEscribinos y pedilo hoy mismo.';
const LEAK2 = '¿Sabías que el mejor café nace de un buen grano?\n\nVení a probarlo al local, te esperamos con la taza lista.\n\nReservá tu mesa por DM.';
const GOOD_EN = 'We tried 12 versions of our house blend until this one.\n\nSmall-batch beans, roasted in-house every morning in Brooklyn.\n\nDM us to order your first bag today.';
const FAIL_ES = 'La merienda de la tarde tiene ese no sé qué.\n\nTortas caseras, café de especialidad y la vereda al sol.\n\nAsí nomás, como en casa.';
const ES_INPUT = { business: 'Café Aroma', category: 'cafeteria', description: 'Café de especialidad en Palermo', dna: null, tone: 'canchero', topic: 'la merienda de la tarde', tipo: 'social', goal: 'vender', lang: 'es', userId: 999002, usedHookIds: [] };
const EN_INPUT = { business: 'Hungry Ghost Coffee', category: 'cafeteria', description: 'Specialty coffee in Williamsburg, Brooklyn', dna: null, tone: 'canchero', topic: 'fresh good batch coffee', tipo: 'social', goal: 'vender', lang: 'en', userId: 999001, usedHookIds: [] };

// ---------- Stub de fetch (OpenAI) ----------
let fetchMode = 'leak';
let captured = []; // [{system, user}]
function installFetchStub() {
  global.fetch = async (url, opts) => {
    let body = {};
    try { body = JSON.parse(opts && opts.body ? opts.body : '{}'); } catch (e) {}
    const msgs = (body && body.messages) || [];
    const system = (msgs.find((m) => m.role === 'system') || {}).content || '';
    const user = (msgs.find((m) => m.role === 'user') || {}).content || '';
    captured.push({ system, user });
    const isBatch = system.includes('"captions"');
    let payload;
    if (fetchMode === 'leak') {
      payload = isBatch
        ? { captions: [LEAK, LEAK2], overlays: ['CAFÉ DEL BARRIO', 'TAZA LISTA'], hashtags: '#cafe' }
        : { caption: LEAK, overlay: 'CAFÉ DEL BARRIO', hashtags: '#cafe' };
    } else if (fetchMode === 'good-en') {
      payload = isBatch
        ? { captions: [GOOD_EN, GOOD_EN.replace('12 versions', '9 versions').replace('first bag', 'next bag')], overlays: ['HOUSE BLEND', 'FRESH BATCH'], hashtags: '#coffee' }
        : { caption: GOOD_EN, overlay: 'HOUSE BLEND', hashtags: '#coffee' };
    } else if (fetchMode === 'fail-es') {
      payload = isBatch
        ? { captions: [FAIL_ES], overlays: ['MERIENDA'], hashtags: '#cafe' }
        : { caption: FAIL_ES, overlay: 'MERIENDA', hashtags: '#cafe' };
    } else { throw new Error('modo desconocido'); }
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }),
    };
  };
}

// ---------- Boot smoke ----------
function httpGet(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 3000 }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = require('net').createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}
async function bootSection() {
  console.log('§BOOT — el árbol bootea y reporta su BUILD');
  const port = await freePort();
  const dataDir = fs.mkdtempSync('/tmp/c3-idioma-boot-');
  const child = spawn('node', ['server.js'], {
    cwd: __dirname,
    // El árbol no trae node_modules: se resuelve contra el repo posta,
    // como en las suites hermanas de imagen/moneda/plan-único.
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let booted = null;
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      try { const r = await httpGet(port, '/api/version'); if (r.status === 200) { booted = JSON.parse(r.body); break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    T('el servidor bootea y /api/version responde', !!booted);
    if (booted) T('/api/version reporta BUILD 20261105-v985', booted.build === '20261105-v985', 'build=' + booted.build);
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1200));
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- Main ----------
(async () => {
  console.log('LOTE CORRECTIVO-3 · IDIOMA FAIL-CLOSED');
  await bootSection();

  const gen = require('./generator.js');
  const cs = require('./caption-style.js');
  const baseDir = path.join(__dirname, '..', 'base-v980');
  const hasBase = fs.existsSync(path.join(baseDir, 'generator.js'));
  const genBase = hasBase ? require(path.join(baseDir, 'generator.js')) : null;

  // Precondiciones de fixtures
  console.log('§0 — fixtures');
  T('LEAK reprueba captionPassesEn (fuga de español)', gen.captionPassesEn(LEAK, EN_INPUT).ok === false, gen.captionPassesEn(LEAK, EN_INPUT).reason);
  T('GOOD_EN pasa captionPassesEn', gen.captionPassesEn(GOOD_EN, EN_INPUT).ok === true, gen.captionPassesEn(GOOD_EN, EN_INPUT).reason);
  T('FAIL_ES reprueba captionPasses (sin CTA)', gen.captionPasses(FAIL_ES, ES_INPUT).ok === false, gen.captionPasses(FAIL_ES, ES_INPUT).reason);

  installFetchStub();

  // (b) Reglamento localizado — fuente (caption-style)
  console.log('§B — reglamento localizado');
  const fakeDb = { prepare: () => ({ get: () => null, all: () => [] }) };
  const extrasEn = cs.captionPromptExtras(fakeDb, 1, 'en');
  T("captionPromptExtras(lang='en') NO contiene «VOSEO»", !extrasEn.includes('VOSEO'));
  T("captionPromptExtras(lang='en') NO contiene los ejemplos (te imaginás/querés/tenés/podés)", !/te imaginás|querés|tenés|podés/.test(extrasEn));
  T("captionPromptExtras(lang='en') trae el checklist EN", extrasEn.includes('ANTI-GENERIC CHECKLIST'));
  const extrasEs = cs.captionPromptExtras(fakeDb, 1);
  T("captionPromptExtras(sin lang) conserva el reglamento ES («VOSEO SIN EXCEPCIÓN»)", extrasEs.includes('VOSEO SIN EXCEPCIÓN'));
  T("captionPromptExtras(lang='es') conserva los ejemplos", cs.captionPromptExtras(fakeDb, 1, 'es').includes('te imaginás'));

  // (a) generateContent con fuga forzada
  console.log('§A — generateContent fail-closed');
  fetchMode = 'leak';
  const enExtras = { ...EN_INPUT, captionExtras: cs.CAPTION_CHECKLIST };
  captured = [];
  const outA = await gen.generateContent(enExtras, 'sk-test');
  T('(a) con el LLM fugando español, generateContent entrega un caption que PASA captionPassesEn', !!outA && gen.captionPassesEn(outA.caption, EN_INPUT).ok === true, outA ? gen.captionPassesEn(outA.caption, EN_INPUT).reason : 'sin salida');
  T('(a) el caption entregado no contiene la fuga', !!outA && !/¿|escribinos/i.test(outA.caption));
  const sysA = captured.length ? captured[captured.length - 1].system : '';
  T('(b) el prompt EN capturado NO contiene «VOSEO» ni ejemplos, aun con extras crudos en español', !sysA.includes('VOSEO') && !/te imaginás|querés|tenés|podés/.test(sysA));
  T('(b) el prompt EN capturado trae el checklist localizado', sysA.includes('ANTI-GENERIC CHECKLIST'));

  fetchMode = 'good-en';
  const outGood = await gen.generateContent({ ...EN_INPUT }, 'sk-test');
  T('(a) con un caption EN válido del LLM, se entrega ESE caption (no se reemplaza por plantilla)', !!outGood && outGood.caption.includes('roasted in-house') && gen.captionPassesEn(outGood.caption, EN_INPUT).ok === true);

  const outNoKey = await gen.generateContent({ ...EN_INPUT }, null);
  T('(a) sin API key, la plantilla entregada pasa captionPassesEn', !!outNoKey && gen.captionPassesEn(outNoKey.caption, EN_INPUT).ok === true, outNoKey ? gen.captionPassesEn(outNoKey.caption, EN_INPUT).reason : 'sin salida');

  let threwA = false;
  try { await gen.generateContent({ ...EN_INPUT, topic: '¿qué preferís hoy?' }, null); } catch (e) { threwA = /plantilla EN/.test(e.message); }
  T('(a) si ni la plantilla puede pasar la puerta EN, error honesto (no se entrega el reprobado)', threwA);

  fetchMode = 'leak';
  let threwB = false;
  try { await gen.generateContent({ ...EN_INPUT, topic: '¿qué preferís hoy?' }, 'sk-test'); } catch (e) { threwB = /plantilla EN|puerta de idioma/.test(e.message); }
  T('(a) LLM fugando + plantilla imposible ⇒ error honesto, cero entregas en el idioma equivocado', threwB);

  // (b) prompt ES intacto
  captured = [];
  fetchMode = 'fail-es';
  await gen.generateContent({ ...ES_INPUT, captionExtras: cs.CAPTION_CHECKLIST }, 'sk-test');
  const sysEs = captured.length ? captured[captured.length - 1].system : '';
  T('(b) el prompt ES capturado conserva «VOSEO SIN EXCEPCIÓN» (histórico)', sysEs.includes('VOSEO SIN EXCEPCIÓN'));

  // (c) openaiCaptions vía generateCaptions
  console.log('§C — openaiCaptions / generateCaptions');
  fetchMode = 'good-en';
  captured = [];
  const batch = await gen.generateCaptions({ ...EN_INPUT, captionExtras: cs.CAPTION_CHECKLIST }, 2, 'sk-test');
  const first = captured.length ? captured[0] : { system: '', user: '' };
  T('(c) el system de openaiCaptions con lang=en es el EN (US copywriter)', first.system.includes('You are an expert US Instagram copywriter'));
  T('(c) el system de openaiCaptions con lang=en NO contiene «VOSEO» (extras localizados)', !first.system.includes('VOSEO'));
  T('(c) el user de openaiCaptions con lang=en usa etiquetas en inglés', first.user.includes('Post topic:') && !first.user.includes('Tema del post:'));
  T('(c) los captions de la tanda pasan captionPassesEn', batch.captions.every((c) => gen.captionPassesEn(c, EN_INPUT).ok === true));

  fetchMode = 'leak';
  const batchLeak = await gen.generateCaptions({ ...EN_INPUT }, 2, 'sk-test');
  T('(a/c) con openaiCaptions fugando español, NINGÚN caption de la tanda sale sin pasar captionPassesEn', batchLeak.captions.length === 2 && batchLeak.captions.every((c) => gen.captionPassesEn(c, EN_INPUT).ok === true), batchLeak.captions.map((c) => gen.captionPassesEn(c, EN_INPUT).reason).join(' | '));

  const batchNoKey = await gen.generateCaptions({ ...EN_INPUT }, 2, null);
  T('(a) generateCaptions sin key con lang=en entrega captions EN que pasan la puerta (no la plantilla ES)', batchNoKey.captions.length === 2 && batchNoKey.captions.every((c) => gen.captionPassesEn(c, EN_INPUT).ok === true), batchNoKey.captions.map((c) => gen.captionPassesEn(c, EN_INPUT).reason).join(' | '));

  // (e) ES sin cambios
  console.log('§E — español sin cambios');
  fetchMode = 'fail-es';
  const outEsNew = await gen.generateContent({ ...ES_INPUT }, 'sk-test');
  T("(e) en 'es' la salida «mejor candidato» histórica SIGUE entregando el reprobado (comportamiento intacto)", !!outEsNew && outEsNew.caption.includes('no sé qué') && gen.captionPasses(outEsNew.caption, ES_INPUT).ok === false);
  const outEsTpl = await gen.generateContent({ ...ES_INPUT }, null);
  T("(e) en 'es' la vía de plantillas sigue entregando captions que pasan captionPasses", !!outEsTpl && gen.captionPasses(outEsTpl.caption, ES_INPUT).ok === true, outEsTpl ? gen.captionPasses(outEsTpl.caption, ES_INPUT).reason : 'sin salida');

  // (d) Controles sobre la base
  console.log('§D — control sobre la base v980');
  if (!hasBase) { SKIP('controles sobre la base', 'no está ../base-v980'); }
  else {
    fetchMode = 'leak';
    const outBase = await genBase.generateContent({ ...EN_INPUT, captionExtras: cs.CAPTION_CHECKLIST }, 'sk-test');
    T('(d) BASE: el mismo forzado SÍ entrega el caption reprobado por la puerta EN (bug reproducido)', !!outBase && genBase.captionPassesEn(outBase.caption, EN_INPUT).ok === false, outBase ? genBase.captionPassesEn(outBase.caption, EN_INPUT).reason : 'sin salida');
    const batchBase = await genBase.generateCaptions({ ...EN_INPUT }, 2, null);
    T('(d) BASE: generateCaptions sin key con lang=en entrega captions que reprueban la puerta EN (plantilla ES)', batchBase.captions.some((c) => genBase.captionPassesEn(c, EN_INPUT).ok === false));
    fetchMode = 'good-en';
    captured = [];
    await genBase.generateCaptions({ ...EN_INPUT }, 1, 'sk-test');
    const baseFirst = captured.length ? captured[0] : { system: '' };
    T('(d) BASE: el prompt de openaiCaptions era entero en español', baseFirst.system.includes('Sos un redactor publicitario argentino'));
    fetchMode = 'fail-es';
    const outBaseEs = await genBase.generateContent({ ...ES_INPUT }, 'sk-test');
    T('(d/e) BASE: en español también entregaba el mejor reprobado (la vara de comparación)', !!outBaseEs && outBaseEs.caption.includes('no sé qué'));
  }

  console.log(`\nRESULTADO: ${pass} pass · ${fail} fail · ${skip} skip`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR:', e); process.exit(2); });
