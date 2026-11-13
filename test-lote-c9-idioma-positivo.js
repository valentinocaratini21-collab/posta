// test-lote-c9-idioma-positivo.js — LOTE CORRECTIVO-9 · IDIOMA POSITIVO
// (BUILD provisorio v1000, base v999)
//
// La puerta de idioma deja de ser una LISTA NEGATIVA (SPANISH_LEAK_RE:
// detecta español y da por bueno todo lo demás) y pasa a ser POSITIVA:
// un identificador determinístico (lang-id.js) determina el idioma del
// texto y la puerta EXIGE que sea el de la marca. Caso real que
// reproduce: corrida Veja #5, posteos 650–652 — el detalle del primer
// posteo era el og:description en FRANCÉS de veja-store.com, reusado
// palabra por palabra, y salió aprobado como «inglés» porque el cuerpo
// no contenía ningún token de la lista de fugas.
//
// Verifica, en los cuatro caminos de la spec:
//  (1) El identificador + la puerta en generator.js: captionPassesEn
//      reprueba el caption francés de producción (antes: ok) con
//      langFail; captionPasses con lang declarado reprueba inglés y
//      tercer idioma para una marca ES; el fail-closed de
//      generateContent/generateCaptions no entrega el texto en el
//      idioma equivocado en NINGÚN idioma (antes: en 'es' salía el
//      «mejor candidato» en inglés; en 'en' el francés pasaba la
//      puerta misma). Marca ES con cuerpo ES pasa; marca EN con
//      cuerpo EN pasa; sin lang declarado la puerta ES conserva su
//      comportamiento histórico (llamadores sin idioma intactos).
//  (2) El camino determinístico de la prueba: resolveTrialCaption
//      (demo-captions) rechaza el caption francés en la puerta y cae
//      al fallback seguro EN (antes: lo devolvía tal cual).
//  (3) El lint al programar (boot real): corre la puerta del idioma
//      de la marca y RETIENE (needs_review) el posteo de la prueba
//      SOLO cuando el idioma no es el de la marca — un fallo que no
//      es de idioma en la prueba sigue sin retener (correctivo-1
//      intacto). En la base: el francés nace con needs_review=0.
//  (4) Las frases minadas se filtran por idioma antes de reusarse:
//      el diferencial en francés no entra como detalle del wow (ni
//      del wow degradado), la frase de voz en francés no entra como
//      detalle, y el título de promo en francés no ancla el slot
//      promo (cae a la novedad del ítem 2). En la base: los tres
//      entran palabra por palabra.
//  Umbrales declarados del identificador (anti-falso-positivo):
//  evidencia ≥4 hits de palabras función, ganadora ≥3 y ≥55% — un
//  texto corto o ambiguo no recibe veredicto y NO se frena por
//  idioma (la suite lo verifica: nombres de producto y CTAs sueltos
//  devuelven null).
//
// Uso: node test-lote-c9-idioma-positivo.js [árbol]
//   Sin argumento corre contra ./release. Contra ./base-v999 corre en
//   modo CONTROL: cada caso reproduce el comportamiento ANTERIOR.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.argv[2] || (fs.existsSync(path.join(__dirname, 'server.js')) ? __dirname : path.join(__dirname, 'release')));
const MODE = fs.existsSync(path.join(TREE, 'lang-id.js')) ? 'release' : 'base';
console.log(`Árbol: ${TREE} — modo: ${MODE}`);

// DATA_DIR del proceso de la suite ANTES de requerir módulos del árbol.
const SUITE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-suite-'));
process.env.DATA_DIR = SUITE_TMP;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } }

// ---------- Fixtures ----------
const FR_PROD = 'Model Photo ✨\n\nVEJA crée des sneakers avec du coton bio, du caoutchouc d\u2019Amazonie et des matériaux recyclés.\n\nOrder yours today by DM 📩'; // el caption real del posteo 650
const FR_BODY = 'Créées avec du coton bio, du caoutchouc et des matériaux recyclés, dans le respect des travailleurs.';
const FR_CAP = `Esplar ✨\n\n${FR_BODY}\n\nOrder yours today by DM 📩`;
const GOOD_EN = 'We tried 12 versions of our house blend until this one.\n\nSmall-batch beans, roasted in-house every morning in Brooklyn.\n\nDM us to order your first bag today.';
const GOOD_ES = 'La merienda de la tarde tiene ese no sé qué de siempre.\n\nTortas caseras, café de especialidad y la vereda al sol.\n\nEscribinos por DM y te contamos más.';
const PT_CAP = 'A gente preparou uma coleção nova para você: produtos com materiais reciclados e o cuidado de sempre para a sua casa.\n\nChama no direct e garanta o seu.';
const LONG_EN = (GOOD_EN + '\n\nWe roast in small batches and taste every single lot before it leaves the house, week after week, because that is how we work and how we have always worked.').slice(0, 400);
const FR_CAP2 = 'V-10 ✨\n\nFaites avec du coton bio, du caoutchouc et des matériaux recyclés, pour tous les jours de la semaine.\n\nOrder yours today by DM 📩'; // otro cuerpo en francés (sin duplicar al de la prueba: el dedup no debe contaminar el caso)

const generator = require(path.join(TREE, 'generator.js'));
const clientDigest = require(path.join(TREE, 'client-digest.js'));
const demoCaptions = require(path.join(TREE, 'demo-captions.js'));

/* ================= Parte 1 · el identificador ================= */
console.log('— Parte 1: identificador de idioma (lang-id) —');
if (MODE === 'release') {
  const { detectTextLang, langCheck } = require(path.join(TREE, 'lang-id.js'));
  ok(detectTextLang(FR_PROD) === 'other', `el caption francés de producción se detecta 'other' (es '${detectTextLang(FR_PROD)}')`);
  ok(detectTextLang(FR_BODY) === 'other', 'el cuerpo francés solo (el diferencial minado) se detecta \'other\'');
  ok(detectTextLang(GOOD_EN) === 'en', 'caption EN sano → \'en\'');
  ok(detectTextLang(GOOD_ES) === 'es', 'caption ES sano → \'es\'');
  ok(detectTextLang(PT_CAP) === 'other', 'caption en portugués → \'other\' (tercer idioma también reprocha)');
  ok(detectTextLang('Esplar') === null, 'un nombre de producto suelto → null (sin veredicto, no se frena)');
  ok(detectTextLang('Pedilo hoy por DM 📩') === null, 'un CTA corto → null (evidencia insuficiente, criterio declarado)');
  ok(detectTextLang('Tacos al pastor, as they should be 🌮\n\nMade fresh every morning at our place in Austin.\n\nDM us to order yours today.') === 'en', 'caption EN con una frase corta en español (nombre del plato) sigue \'en\': sin falso positivo');
  ok(langCheck(GOOD_EN, 'en').ok === true && langCheck(FR_PROD, 'en').ok === false && langCheck(FR_PROD, 'es').ok === false, 'langCheck: exige el idioma de la marca en los dos sentidos');
} else {
  ok(!fs.existsSync(path.join(TREE, 'lang-id.js')), 'CONTROL base: lang-id.js no existe — no hay identificador de idioma en ninguna puerta');
}

/* ================= Parte 2 · las puertas de generator ================= */
console.log('— Parte 2: puertas captionPasses / captionPassesEn —');
{
  const enFr = generator.captionPassesEn(FR_PROD, { business: 'VEJA' });
  if (MODE === 'release') {
    ok(enFr.ok === false && enFr.langFail === true && enFr.detected === 'other', `puerta EN reprueba el francés de producción con langFail (reason: ${enFr.reason})`);
  } else {
    ok(enFr.ok === true, 'CONTROL base: la puerta EN APRUEBA el caption en francés (la lista negativa lo deja pasar — el bug de Veja #5)');
  }
  ok(generator.captionPassesEn(GOOD_EN, { business: 'Hungry Ghost Coffee' }).ok === true, 'puerta EN: caption EN sano pasa en los dos árboles');
  ok(generator.captionPasses(GOOD_ES, { business: 'Café Aroma', lang: 'es' }).ok === true, 'puerta ES con lang declarado: caption ES sano pasa en los dos árboles');
  const esEn = generator.captionPasses(GOOD_EN, { business: 'Cualquiera', lang: 'es' });
  const esFr = generator.captionPasses(FR_CAP, { business: 'Veja Store', lang: 'es' });
  const esPt = generator.captionPasses(PT_CAP, { business: 'Loja', lang: 'es' });
  if (MODE === 'release') {
    ok(esEn.ok === false && esEn.langFail === true && esEn.detected === 'en', 'puerta ES (lang declarado): un caption en inglés reprocha por idioma');
    ok(esFr.ok === false && esFr.langFail === true && esFr.detected === 'other', 'puerta ES (lang declarado): un caption en francés reprocha por idioma');
    ok(esPt.ok === false && esPt.langFail === true && esPt.detected === 'other', 'puerta ES (lang declarado): un caption en portugués reprocha por idioma');
  } else {
    ok(generator.captionPasses(GOOD_EN, { business: 'Cualquiera' }).ok === true, 'CONTROL base: la puerta ES aprueba un caption en inglés (nunca verifica que sea español)');
  }
  ok(generator.captionPasses(GOOD_EN, { business: 'Cualquiera' }).ok === true, 'puerta ES SIN lang declarado: comportamiento histórico intacto (los llamadores sin idioma no cambian)');
}

/* ================= Parte 3 · fail-closed en generateContent/generateCaptions ================= */
console.log('— Parte 3: la salida «mejor candidato» ya no entrega el idioma equivocado —');
let stubMode = 'fr';
const realFetch = global.fetch; // el boot (Parte 6) habla HTTP de verdad: no pasa por el stub
function installFetchStub() {
  global.fetch = async (url, opts) => {
    let body = {};
    try { body = JSON.parse(opts && opts.body ? opts.body : '{}'); } catch (e) {}
    const msgs = (body && body.messages) || [];
    const system = (msgs.find((m) => m.role === 'system') || {}).content || '';
    const isBatch = system.includes('"captions"');
    const cap = stubMode === 'fr' ? FR_CAP : GOOD_EN;
    const payload = isBatch
      ? { captions: [cap, cap.replace('12 versions', '9 versions')], overlays: ['X', 'Y'], hashtags: '#x' }
      : { caption: cap, overlay: 'X', hashtags: '#x' };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }) };
  };
}
const EN_INPUT = { business: 'VEJA', category: 'moda', description: 'Sneakers made with organic cotton and recycled materials', dna: null, tone: 'canchero', topic: 'esplar sneakers', tipo: 'social', goal: 'vender', lang: 'en', userId: 999101, usedHookIds: [] };
const ES_INPUT = { business: 'Café Aroma', category: 'cafeteria', description: 'Café de especialidad en Palermo', dna: null, tone: 'canchero', topic: 'la merienda de la tarde', tipo: 'social', goal: 'vender', lang: 'es', userId: 999102, usedHookIds: [] };

/* ================= Parte 4 · frases minadas (client-digest) ================= */
console.log('— Parte 4: el camino determinístico no reusa frases en otro idioma —');
{
  const dgVeja = {
    business: 'VEJA', category: 'moda',
    productos: [{ nombre: 'Esplar' }, { nombre: 'V-10' }], servicios: [],
    diferencial: FR_BODY, onboarding: {}, temas_feed: [],
    promos: [{ titulo: 'Les sneakers en coton bio avec des matériaux recyclés pour tous les jours' }],
  };
  const wow = clientDigest.deriveFirstPostWow(dgVeja, { lang: 'en' });
  ok(!!wow, 'el wow de la marca EN nace');
  if (MODE === 'release') {
    ok(wow && !/caoutchouc|matériaux/.test(wow.caption), 'el diferencial en francés NO entra como detalle del wow');
    ok(wow && wow.caption.includes('We make it our way.'), 'sin detalle en su idioma, el wow cae a la línea honesta de la casa');
  } else {
    ok(wow && /caoutchouc/.test(wow.caption), 'CONTROL base: el wow lleva el diferencial en francés palabra por palabra (posteo 650)');
  }
  const topics = clientDigest.deriveTopics(dgVeja, { lang: 'en', count: 5 });
  const anyFr = topics.some((t) => /caoutchouc|matériaux/.test(t.caption));
  if (MODE === 'release') {
    ok(!anyFr, 'ningún topic de la semana lleva francés');
    ok(!topics.some((t) => t.kind === 'promo'), 'el título de promo en francés no ancla el slot promo: cae a la novedad del ítem 2');
  } else {
    ok(anyFr && topics.some((t) => t.kind === 'promo'), 'CONTROL base: el slot promo nace sobre el título en francés');
  }
  const dgDeg = { business: 'VEJA', category: 'moda', productos: [{ nombre: 'Zapatillas' }], servicios: [], diferencial: FR_BODY, onboarding: {}, temas_feed: [] };
  const wowDeg = clientDigest.deriveFirstPostWow(dgDeg, { lang: 'en' });
  if (MODE === 'release') ok(wowDeg && !/caoutchouc/.test(wowDeg.caption), 'el wow degradado tampoco reusa el diferencial en francés');
  else ok(wowDeg && /caoutchouc/.test(wowDeg.caption), 'CONTROL base: el wow degradado también lleva el francés');
  const dgVoice = { business: 'VEJA', category: 'moda', productos: [{ nombre: 'Esplar' }], servicios: [], diferencial: '', onboarding: {}, temas_feed: [], inferred_star: { item: 'Esplar', confidence: 0.9 }, voz_marcadores: ['Fait avec amour et avec des matériaux recyclés, pour tous les jours de la semaine'] };
  const wowVoice = clientDigest.deriveFirstPostWow(dgVoice, { lang: 'en' });
  if (MODE === 'release') ok(wowVoice && !/matériaux/.test(wowVoice.caption) && wowVoice.caption.includes('The house favorite'), 'la frase de voz en francés no entra como detalle: cae al favorito de la casa');
  else ok(wowVoice && /matériaux/.test(wowVoice.caption), 'CONTROL base: la frase de voz en francés entra como detalle');
  // Espejo ES: marca en español, diferencial minado en inglés.
  const dgEs = { business: 'Café Aroma', category: 'cafeteria', productos: [{ nombre: 'Medialuna' }], servicios: [], diferencial: 'Small-batch beans, roasted in-house every morning with our own recipe and a lot of care for every cup we serve.', onboarding: {}, temas_feed: [] };
  const wowEs = clientDigest.deriveFirstPostWow(dgEs, { lang: 'es' });
  if (MODE === 'release') ok(wowEs && !/Small-batch/.test(wowEs.caption) && wowEs.caption.includes('Lo hacemos a nuestra manera.'), 'espejo ES: el diferencial en inglés no entra en el wow de una marca en español');
  else ok(wowEs && /Small-batch/.test(wowEs.caption), 'CONTROL base (espejo): el diferencial en inglés entra en el wow ES');
}

/* ================= Parte 5 · resolveTrialCaption (la puerta en la prueba) ================= */
console.log('— Parte 5: resolveTrialCaption gatea con la puerta positiva —');
{
  const r = demoCaptions.resolveTrialCaption(
    [{ kind: 'novedad', headline: 'Esplar', caption: FR_CAP, digest_anchor: 'Esplar' }],
    'moda',
    { business: 'VEJA', tone: 'canchero', country: 'US', idx: 0, goalLine: '', lang: 'en', prevCaptions: [], voiceLine: '' }
  );
  if (MODE === 'release') ok(r.ok && !/caoutchouc|matériaux/.test(r.caption), 'el caption francés reprueba la puerta y la pieza sale con el fallback seguro EN');
  else ok(r.ok && /caoutchouc/.test(r.caption), 'CONTROL base: resolveTrialCaption devuelve el caption en francés tal cual (la puerta lo aprobaba)');
}

/* ================= Parte 6 · boot + lint al programar ================= */
const PORT = 18783;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'testtoken-c9';
async function waitBoot(tries = 70) {
  for (let i = 0; i < tries; i++) {
    try { const r = await realFetch(`${BASE}/api/version`); if (r.ok) return await r.json(); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

(async () => {
  installFetchStub();
  console.log('— Parte 3 (cont.): generateContent / generateCaptions con la IA forzada —');
  stubMode = 'fr';
  const outEn = await generator.generateContent(EN_INPUT, 'sk-test-c9');
  if (MODE === 'release') ok(outEn && !/caoutchouc|matériaux/.test(outEn.caption), 'generateContent EN con respuestas en francés: lo entregado NO es el texto en francés (plantilla EN gateada)');
  else ok(outEn && /caoutchouc/.test(outEn.caption), 'CONTROL base: generateContent EN entrega el caption en francés (pasaba su propia puerta)');
  stubMode = 'en';
  const outEs = await generator.generateContent(ES_INPUT, 'sk-test-c9');
  if (MODE === 'release') ok(outEs && !/Small-batch/.test(outEs.caption), 'generateContent ES con respuestas en inglés: lo entregado NO es el texto en inglés (fail-closed de idioma también en ES)');
  else ok(outEs && /Small-batch/.test(outEs.caption), 'CONTROL base: generateContent ES entrega el «mejor candidato» en inglés');
  stubMode = 'fr';
  const batch = await generator.generateCaptions({ ...EN_INPUT }, 2, 'sk-test-c9');
  const batchFr = (batch.captions || []).some((c) => /caoutchouc|matériaux/.test(c));
  if (MODE === 'release') ok(!batchFr, 'generateCaptions EN: ningún caption de la tanda sale en francés');
  else ok(batchFr, 'CONTROL base: la tanda EN sale con captions en francés');

  console.log('— Parte 6: boot + lint al programar por idioma de marca —');
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'c9-boot-'));
  const envHijo = { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: TOKEN, NODE_PATH: '/home/hatch/workspace/posta/node_modules' };
  for (const k of Object.keys(envHijo)) if (/OPENAI|ANTHROPIC|FAL_KEY|GEMINI|GOOGLE_API/.test(k)) delete envHijo[k];
  const srv = spawn('node', ['server.js'], { cwd: TREE, env: envHijo, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    const ver = await waitBoot();
    ok(!!ver, 'el server booteó');
    const build = String((ver && ver.build) || '');
    if (MODE === 'release') ok(build.includes('v1000'), `/api/version = ${build} (v1000 provisorio del lote)`);
    else ok(build.includes('v999'), `CONTROL base: /api/version = ${build} (v999)`);

    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const register = async (email) => {
      const r = await realFetch(`${BASE}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'secreto1' }),
      });
      const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).join('; ');
      return { ok: r.ok, status: r.status, cookies };
    };
    const seedLang = (uid, lang) => {
      const dg = { business: lang === 'en' ? 'Veja Store' : 'Café Aroma', category: lang === 'en' ? 'moda' : 'cafeteria', productos: [{ nombre: lang === 'en' ? 'Esplar' : 'Medialuna' }], servicios: [], temas_feed: [], post_lang: lang };
      clientDigest.saveDigest(db, uid, dg);
    };
    const mkPost = (uid, caption, source) => {
      const r = db.prepare("INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, source, week_key) VALUES (?, '', ?, '', NULL, 'draft', 'image', ?, '')").run(uid, caption, source);
      return Number(r.lastInsertRowid);
    };
    const schedule = async (cookies, id) => {
      const r = await realFetch(`${BASE}/api/posts/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: cookies },
        body: JSON.stringify({ scheduled_at: '2026-11-20 19:00' }),
      });
      return r.status;
    };
    const held = (id) => (db.prepare('SELECT needs_review FROM posts WHERE id = ?').get(id) || {}).needs_review;

    // Usuario A: marca en INGLÉS (post_lang 'en' en su digest).
    const regA = await register('a-c9@example.com');
    ok(regA.ok, `registro marca EN (${regA.status})`);
    const uA = db.prepare('SELECT id FROM users WHERE email = ?').get('a-c9@example.com');
    seedLang(uA.id, 'en');
    const pFr = mkPost(uA.id, FR_CAP, 'trial');
    const stFr = await schedule(regA.cookies, pFr);
    if (MODE === 'release') ok(held(pFr) === 1, `prueba EN con caption en francés: RETENIDO al programar (needs_review=1, PATCH ${stFr})`);
    else ok(held(pFr) === 0, `CONTROL base: prueba EN con caption en francés nace SIN retener (needs_review=0, PATCH ${stFr})`);
    const pLong = mkPost(uA.id, LONG_EN, 'trial');
    await schedule(regA.cookies, pLong);
    ok(held(pLong) === 0, 'prueba EN con caption en inglés pero demasiado largo: NO se retiene (el fallo no es de idioma — correctivo-1 intacto)');
    const pOk = mkPost(uA.id, GOOD_EN, 'trial');
    await schedule(regA.cookies, pOk);
    ok(held(pOk) === 0, 'prueba EN con caption en inglés sano: no se retiene');
    const pFrReg = mkPost(uA.id, FR_CAP2, '');
    await schedule(regA.cookies, pFrReg);
    if (MODE === 'release') ok(held(pFrReg) === 1, 'posteo REGISTRADO (no prueba) EN con caption en francés: retenido — el lint ahora usa la puerta de la marca');
    else ok(held(pFrReg) === 0, 'CONTROL base: el registrado EN con francés tampoco se retenía (el lint corría la puerta ES)');

    // Usuario B: marca en ESPAÑOL.
    const regB = await register('b-c9@example.com');
    ok(regB.ok, `registro marca ES (${regB.status})`);
    const uB = db.prepare('SELECT id FROM users WHERE email = ?').get('b-c9@example.com');
    seedLang(uB.id, 'es');
    const pEn = mkPost(uB.id, GOOD_EN, 'trial');
    await schedule(regB.cookies, pEn);
    if (MODE === 'release') ok(held(pEn) === 1, 'prueba ES con caption en inglés: RETENIDO al programar (el idioma no es el de la marca)');
    else ok(held(pEn) === 0, 'CONTROL base: prueba ES con caption en inglés nace sin retener (la puerta ES lo aprobaba)');
    const pEs = mkPost(uB.id, GOOD_ES, 'trial');
    await schedule(regB.cookies, pEs);
    ok(held(pEs) === 0, 'prueba ES con caption en español sano: no se retiene');
  } catch (e) {
    fail++; console.log('  ✗ EXCEPCIÓN en boot:', e.message);
    console.log(srvLog.slice(-1500));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
  }
  console.log(`\nTOTAL: ${pass} ok · ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
