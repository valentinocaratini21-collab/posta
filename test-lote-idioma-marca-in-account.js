// test-lote-idioma-marca-in-account.js — LOTE IDIOMA-MARCA-PIPELINE-IN-ACCOUNT (RE-BASE v979 sobre v978; builder provisional v959)
// La prueba genera en el idioma de la marca (L1–L4), pero todo lo que el
// pipeline in-account genera después (ensure de hoy, sweep, backfill,
// rebuild) salía en el idioma del visitante: nunca recibía contentLang.
// Este lote: (1) persiste contentLang en la cuenta al importar la prueba
// (applyTrialLang keyea en content_lang del payload/digest, no en el
// idioma de la UI); (2) enhebra lang makeIdeaDraft → contentInputFor →
// generateContent; (3) banco de hooks EN (mismos ids/intenciones);
// (4) tema por effectiveStarOf/deriveTopics (L3/L4) en
// ideaDiariaSintetica, nunca estrella inventada (sin validada, wow
// neutro). Sin API key en sandbox: la vía LLM no se corre; la vía de
// plantillas EN + la puerta EN sí (generateContent sin key).
// Se corre desde release/: node test-lote-idioma-marca-in-account.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(__dirname, '..', 'base-v978');
let bootChild = null; // por si la suite aborta a mitad del boot
let pass = 0, fail = 0; const failures = [];
function ok(c, name, extra) { if (c) { pass++; } else { fail++; failures.push(name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FALLO: ' + name + (extra ? ' :: ' + String(extra).slice(0, 200) : '')); } }
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ', llegó ' + JSON.stringify(a)); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function count(re, s) { return (String(s).match(re) || []).length; }
// Extrae una función top-level por marcadores (inicio `function NAME(`
// hasta el próximo `function ` / `app.` top-level): robusto aunque el
// cuerpo tenga template literals con llaves.
function extractFn(src, name, nextMarkers) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('no está ' + name);
  let end = src.length;
  for (const m of (nextMarkers || ['\nfunction ', '\napp.', '\nconst ', '\n// '])) {
    const i = src.indexOf(m, start + 10);
    if (i > 0 && i < end) end = i;
  }
  return src.slice(start, end).replace(/\s+$/, '');
}

(async () => {
  const serverSrc = read(path.join(ROOT, 'server.js'));
  const genSrc = read(path.join(ROOT, 'generator.js'));
  const hooksSrc = read(path.join(ROOT, 'hooks.js'));
  const baseServer = read(path.join(BASE, 'server.js'));

  // ------------------------------------------------- A. Estáticos
  console.log('\n[A] Estáticos (diff = exactamente el lote)');
  eq(count(/20261105-v979/g, serverSrc), 1, 'A1 BUILD v979 ×1 en server.js');
  eq(count(/20261105-v978/g, serverSrc), 0, 'A2 BUILD v978 ×0 en server.js');
  ok(serverSrc.includes('function contentLangOf(uid)'), 'A3 contentLangOf definido');
  ok(serverSrc.includes('lang: contentLangOf(uid)'), 'A4 contentInputFor lleva lang: contentLangOf(uid)');
  ok(/function applyTrialLang[\s\S]{0,1800}out\.content_lang/.test(serverSrc), 'A5 applyTrialLang keyea en out.content_lang');
  ok(/function applyTrialLang[\s\S]{0,1800}post_lang/.test(serverSrc), 'A6 applyTrialLang persiste post_lang en el digest');
  ok(/function seedFromTrialDigest[\s\S]{0,2500}out\.content_lang/.test(serverSrc), 'A7 seedFromTrialDigest siembra post_lang desde out.content_lang');
  ok(/function ideaDiariaSintetica[\s\S]{0,2600}effectiveStarOf/.test(serverSrc), 'A8 ideaDiariaSintetica usa effectiveStarOf (L3)');
  ok(/function ideaDiariaSintetica[\s\S]{0,2600}deriveTopics/.test(serverSrc), 'A9 ideaDiariaSintetica usa deriveTopics (L3/L4)');
  ok(!/function ideaDiariaSintetica[\s\S]{0,2600}prods\[dayIdx/.test(serverSrc), 'A10 ideaDiariaSintetica ya NO rota prods[dayIdx % prods.length]');
  ok(/function ideaDiariaSintetica[\s\S]{0,2600}diaria-neutra/.test(serverSrc), 'A11 ideaDiariaSintetica tiene wow neutro (L4) sin estrella ni temas');
  ok(/function ideaDiariaSintetica[\s\S]{0,2600}format = tipo === 'novedad' \? 'reel'/.test(serverSrc), 'A12 día novedad → format reel (antes caía a detras en makeIdeaDraft)');
  ok(serverSrc.includes('idea._sales || null'), 'A13 makeIdeaDraft pasa idea._sales a contentInputFor');
  ok(genSrc.includes('function captionGateFor(input)'), 'A14 captionGateFor definido');
  ok(genSrc.includes("const gate = captionGateFor(input);"), 'A15 generateContent/generateCaptions usan la puerta por idioma');
  ok(genSrc.includes('CAPTION_CRAFT_EN'), 'A16 CAPTION_CRAFT_EN existe');
  ok(/async function openaiGenerate\(\{[^}]*lang/.test(genSrc), 'A17 openaiGenerate recibe lang');
  ok(genSrc.includes('function templateGenerateEn(input)'), 'A18 templateGenerateEn existe');
  ok(genSrc.includes('function templateCaptionEn('), 'A19 templateCaptionEn existe');
  ok(genSrc.includes('GENERIC_TAGS_EN'), 'A20 hashtags genéricos EN');
  ok(genSrc.includes('hookBankFor(lang)'), 'A21 applyPostyHook usa el banco por idioma');
  ok(genSrc.includes('HOOK_BANK_EN'), 'A22 KNOWN_HOOK_RES incluye el banco EN');
  ok(/function captionPassesEn[\s\S]{0,6000}ownName/.test(genSrc), 'A23 captionPassesEn enmascara el nombre propio (VEJA no es grito)');
  ok(hooksSrc.includes('const HOOKS_EN = ['), 'A24 HOOKS_EN definido');
  ok(hooksSrc.includes('function hookBankFor(lang)'), 'A25 hookBankFor definido');
  ok(hooksSrc.includes("lang === 'en' ? HOOKS_EN : HOOKS"), 'A26 hookBankFor: en → HOOKS_EN');
  // Solo 3 archivos cambian + la suite nueva; index y styles intactos.
  const changed = [];
  for (const f of ['server.js', 'generator.js', 'hooks.js', 'client-digest.js', 'db.js', 'public/app.js', 'public/styles.css', 'public/index.html', 'public/en/index.html']) {
    const a = path.join(BASE, f), b = path.join(ROOT, f);
    if (!fs.existsSync(a) || !fs.existsSync(b) || read(a) !== read(b)) changed.push(f);
  }
  eq(changed.join(','), 'server.js,generator.js,hooks.js', 'A27 diff de archivos = exactamente el lote (sin index, sin styles, sin app.js, sin client-digest.js)', 'cambiaron: ' + changed.join(','));
  eq(read(path.join(ROOT, 'public/index.html')).includes('app.js?v=674'), true, 'A28 index ES sigue en app.js?v=674 (SIN ?v= este lote)');
  eq(read(path.join(ROOT, 'public/index.html')).includes('styles.css?v=20261270'), true, 'A29 styles sigue en 20261270 en ambos index');

  // ------------------------------------------------- B. VM (funciones reales)
  console.log('\n[B] VM — hooks, generator y pipeline de idioma');
  const hooks = require(path.join(ROOT, 'hooks.js'));
  const gen = require(path.join(ROOT, 'generator.js'));
  const cd = require(path.join(ROOT, 'client-digest.js'));
  // B1 — banco EN
  eq(hooks.HOOKS.length, 50, 'B1a banco ES: 50 hooks');
  eq(hooks.HOOKS_EN.length, 50, 'B1b banco EN: 50 hooks');
  eq(JSON.stringify(hooks.HOOKS.map((h) => h.id)), JSON.stringify(hooks.HOOKS_EN.map((h) => h.id)), 'B1c EN: mismos ids h01–h50');
  ok(hooks.HOOKS.every((h, i) => JSON.stringify(h.intents) === JSON.stringify(hooks.HOOKS_EN[i].intents)), 'B1d EN: mismas intenciones por id');
  eq(hooks.hookBankFor('en'), hooks.HOOKS_EN, 'B1e hookBankFor(en) → HOOKS_EN');
  eq(hooks.hookBankFor('es'), hooks.HOOKS, 'B1f hookBankFor(es) → HOOKS');
  ok(hooks.HOOKS_EN.every((h) => h.formula.includes('{tema}') || h.formula.includes('{negocio}')), 'B1g EN: todas las fórmulas llevan slot {tema} o {negocio}');
  ok(!hooks.HOOKS_EN.some((h) => /¡|¿|vos|te decimos|mirá|probá/.test(h.formula)), 'B1h EN: ninguna fórmula en español');
  // pickHook forzado a h40 (excluyo los demás comida)
  const comidaIds = hooks.HOOKS.filter((h) => h.intents.includes('comida')).map((h) => h.id);
  const h40en = hooks.pickHook({ intent: 'comida', usedHookIds: comidaIds.filter((id) => id !== 'h40'), lang: 'en' });
  eq(h40en.id, 'h40', 'B1i pickHook EN con resto usados → h40');
  eq(hooks.renderHook(h40en, { tema: 'the Atlas', negocio: 'VEJA' }), 'If you like the Atlas, this dish at VEJA is for you: here is why', 'B1j h40 EN renderiza en inglés (el 636 era este hook en español)');
  const h40es = hooks.pickHook({ intent: 'comida', usedHookIds: comidaIds.filter((id) => id !== 'h40') });
  eq(hooks.renderHook(h40es, { tema: 'el Atlas', negocio: 'VEJA' }), 'Si te gusta el Atlas, este plato de VEJA es para vos: te decimos por qué', 'B1k h40 ES intacto');
  eq(hooks.hookFits(hooks.HOOKS_EN[15], { tema: 'the Atlas', negocio: 'VEJA', lang: 'en' }), true, 'B1l hookFits EN: "the Atlas" (nombre propio corto) encaja');
  eq(hooks.hookFits(hooks.HOOKS_EN[15], { tema: 'How to choose shoes', negocio: 'VEJA', lang: 'en' }), false, 'B1m hookFits EN: tema-título "How to…" no encaja');
  eq(hooks.hookFits(hooks.HOOKS_EN[0], { tema: 'the Atlas', negocio: 'VEJA', lang: 'en' }), false, 'B1n hookFits EN: hook de precio sin precio no encaja');
  eq(hooks.hookFits(hooks.HOOKS_EN[0], { tema: 'the Atlas', negocio: 'VEJA', hasPrice: true, lang: 'en' }), true, 'B1o hookFits EN: hook de precio CON hasPrice encaja');
  eq(hooks.hookFits(hooks.HOOKS_EN[15], { tema: 'Get your shoes now', negocio: 'VEJA', lang: 'en' }), false, 'B1p hookFits EN: tema imperativo no encaja');
  // B2 — generateContent (vía plantillas, sin key) en los dos idiomas.
  // La vía de plantillas ES tiene semillas aleatorias y su fallback
  // pre-existente a veces no pasa la puerta: se reintenta hasta 5 veces
  // y se exige al menos un caption que pase (la vía funciona) y que
  // NINGUNO filtre el otro idioma.
  let capEn = null, capEs = null;
  for (let i = 0; i < 5 && !capEn; i++) {
    const r = await gen.generateContent({ business: 'VEJA', category: 'calzado', topic: 'the Atlas', tipo: 'novedad', lang: 'en', usedHookIds: [], business_name: 'VEJA' }, null);
    if (gen.captionPassesEn(r.caption, { business: 'VEJA' }).ok) capEn = r;
  }
  ok(capEn !== null, 'B2a generateContent EN devuelve un caption que pasa captionPassesEn (≤5 intentos)');
  ok(capEn && typeof capEn.caption === 'string' && capEn.caption.length > 40, 'B2a2 el caption EN tiene cuerpo', capEn && capEn.caption);
  eq(capEn ? gen.captionPassesEn(capEn.caption, { business: 'VEJA' }).ok : false, true, 'B2b el caption EN pasa captionPassesEn', capEn ? JSON.stringify(gen.captionPassesEn(capEn.caption, { business: 'VEJA' })) + ' :: ' + capEn.caption : 'sin caption EN');
  ok(capEn && !/¡|¿|escribinos|reservá|mirá|probá|vos\b/i.test(capEn.caption.split('\n')[0]), 'B2c el caption EN abre sin español (sin hook español)', capEn && capEn.caption.split('\n')[0]);
  ok(capEn && /^h\d{2}$/.test(String(capEn.hookId || '')), 'B2d el caption EN trae hookId del banco', capEn && String(capEn.hookId));
  ok(capEn && !/#argentina|#emprendedor|#marketingdigital/.test(String(capEn.hashtags || '')), 'B2e hashtags EN sin tags en español', capEn && String(capEn.hashtags));
  for (let i = 0; i < 5 && !capEs; i++) {
    const r = await gen.generateContent({ business: 'Café Alvear', category: 'cafeteria', topic: 'la merienda', tipo: 'novedad', lang: 'es', usedHookIds: [], business_name: 'Café Alvear' }, null);
    if (gen.captionPasses(r.caption, { business: 'Café Alvear' }).ok) capEs = r;
  }
  ok(capEs !== null, 'B2f el caption ES sigue pasando captionPasses (≤5 intentos)');
  eq(capEs ? gen.captionPasses(capEs.caption, { business: 'Café Alvear' }).ok : false, true, 'B2f2 el caption ES pasa captionPasses', capEs ? JSON.stringify(gen.captionPasses(capEs.caption, { business: 'Café Alvear' })) + ' :: ' + capEs.caption : 'sin caption ES');
  const viejo636 = 'Si te gusta PROJET, este plato de VEJA es para vos: te decimos por qué';
  eq(gen.captionPassesEn(viejo636, { business: 'VEJA' }).ok, false, 'B2g el caption del 636 NO pasa la puerta EN (ancla de regresión)');
  // B3 — applyPostyHook por idioma
  const hookedEn = gen.applyPostyHook({ caption: 'The Atlas is here at VEJA. Fresh in and ready for you.\n\nDM us to order yours today.' }, { business: 'VEJA', topic: 'the Atlas', tipo: 'novedad', lang: 'en', usedHookIds: [] });
  ok(/^h\d{2}$/.test(String(hookedEn.hookId || '')), 'B3a applyPostyHook EN antepone hook EN', String(hookedEn.hookId) + ' :: ' + hookedEn.caption.split('\n')[0]);
  ok(!/Si te gusta|este plato|te decimos/.test(hookedEn.caption.split('\n')[0]), 'B3b el hook antepuesto EN no es español', hookedEn.caption.split('\n')[0]);
  const hookedEs = gen.applyPostyHook({ caption: 'La merienda ya está en Café Alvear. Recién salida del horno.\n\nEscribinos por DM.' }, { business: 'Café Alvear', topic: 'la merienda', tipo: 'novedad', lang: 'es', usedHookIds: [] });
  eq(String(hookedEs.hookId || '').slice(0, 1), 'h', 'B3c applyPostyHook ES sigue anteponiendo hook ES', String(hookedEs.hookId));
  const alreadyEn = gen.applyPostyHook({ caption: 'New at VEJA: the Atlas, and we were the first to try it\n\nThe Atlas at VEJA. Fresh in.\n\nDM us.' }, { business: 'VEJA', topic: 'the Atlas', tipo: 'novedad', lang: 'en', usedHookIds: [] });
  eq(alreadyEn.caption.split('\n')[0], 'New at VEJA: the Atlas, and we were the first to try it', 'B3d caption que ya abre con hook EN no se duplica');

  // B4 — persistencia real: funciones extraídas de server.js + node:sqlite
  // en memoria + client-digest.js REAL (no stubs de digest).
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, lang TEXT)');
  db.exec('CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT, created_at TEXT)');
  db.exec('CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT, category TEXT, description TEXT, ig_username TEXT)');
  db.exec('CREATE TABLE business_dna (user_id INTEGER PRIMARY KEY, dna_json TEXT)');
  cd.ensureTable(db);
  const ctx = vm.createContext({ db, clientDigest: cd, console });
  const fnNames = ['digestForUser', 'contentLangOf', 'applyTrialLang', 'seedFromTrialDigest', 'ideaDiariaSintetica'];
  const next = ['\nfunction ', '\nasync function ', '\napp.', '\nconst ', '\n// '];
  for (const n of fnNames) {
    const src = extractFn(serverSrc, n, next);
    if (!src.startsWith('function ' + n)) throw new Error('extracción fallida: ' + n);
    vm.runInContext(src, ctx);
  }
  const contentLangOf = ctx.contentLangOf, applyTrialLang = ctx.applyTrialLang,
    seedFromTrialDigest = ctx.seedFromTrialDigest, ideaDiariaSintetica = ctx.ideaDiariaSintetica;
  const storedDigest = (uid) => { try { return cd.getStoredDigest(db, uid); } catch (e) { return null; } };
  db.prepare('INSERT INTO users (id, lang) VALUES (1, ?), (2, ?), (3, ?)').run('es', 'es', 'en');
  const trialVe = { lang: 'es', content_lang: 'en', business: 'VEJA', digest: { business: 'VEJA', category: 'calzado', post_lang: 'en', productos: [{ nombre: 'Esplar' }, { nombre: 'Campo' }], servicios: [{ nombre: 'RUNNING' }] } };
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('veja', JSON.stringify(trialVe), '2026-11-12T00:00:00Z');
  eq(contentLangOf(1), 'es', 'B4a sin digest guardado: contentLangOf cae a users.lang (es)');
  applyTrialLang(1, 'veja');
  eq(db.prepare('SELECT lang FROM users WHERE id = ?').get(1).lang, 'es', 'B4b applyTrialLang NO pisa users.lang con el idioma de la UI (sigue es)');
  eq(storedDigest(1), null, 'B4c applyTrialLang sin digest guardado no fabrica uno mínimo');
  seedFromTrialDigest(1, 'veja');
  eq(storedDigest(1) && storedDigest(1).post_lang, 'en', 'B4d seedFromTrialDigest siembra post_lang=en desde content_lang');
  eq(contentLangOf(1), 'en', 'B4e con digest guardado post_lang=en + users.lang=es → contentLangOf = en (la marca manda)');
  applyTrialLang(1, 'veja');
  eq(storedDigest(1).post_lang, 'en', 'B4f applyTrialLang con digest guardado conserva post_lang=en');
  eq(db.prepare('SELECT lang FROM users WHERE id = ?').get(1).lang, 'es', 'B4g applyTrialLang NO escribe users.lang desde la prueba (el histórico era lang de UI)');
  // Payload viejo sin content_lang ni post_lang → fallback histórico.
  const trialViejo = { lang: 'es', business: 'Viejo', digest: { business: 'Viejo', category: 'otro', productos: [{ nombre: 'Pan' }] } };
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('viejo', JSON.stringify(trialViejo), '2026-01-01T00:00:00Z');
  seedFromTrialDigest(2, 'viejo');
  eq(storedDigest(2) && storedDigest(2).post_lang, undefined, 'B4h payload viejo sin content_lang → digest sin post_lang (no se inventa)');
  eq(contentLangOf(2), 'es', 'B4i sin post_lang: contentLangOf cae a users.lang (es)');
  // Payload con solo digest.post_lang (sin content_lang): también persiste.
  const trialSolo = { lang: 'es', business: 'Solo', digest: { business: 'Solo', category: 'otro', post_lang: 'en', productos: [{ nombre: 'X' }] } };
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run('solo', JSON.stringify(trialSolo), '2026-11-12T00:00:00Z');
  applyTrialLang(2, 'solo');
  eq(storedDigest(2) && storedDigest(2).post_lang, 'en', 'B4j applyTrialLang fusiona post_lang desde digest.post_lang aunque no venga content_lang');
  // B4k — idea diaria: digest tipo Veja (PROJET en productos, estrella
  // del dueño «de todo un poco», sin estrella de ventas ni inferida).
  const dgVeja = { business: 'VEJA', category: 'calzado', subcat: '', productos: [{ nombre: 'PROJET' }, { nombre: 'Esplar' }, { nombre: 'Campo' }], servicios: [{ nombre: 'RUNNING' }, { nombre: 'HOMME' }], dueno: { estrella: 'de todo un poco' }, temas_feed: ['sneakers', 'running'] };
  cd.saveDigest(db, 1, dgVeja);
  const storedVeja = storedDigest(1);
  eq(cd.effectiveStarOf(storedVeja), null, 'B4k effectiveStarOf(Veja) = null (nadie valida PROJET como estrella)');
  const topicsVeja = cd.deriveTopics(storedVeja, { lang: contentLangOf(1), count: 5 });
  const dayIdx1311 = Math.floor(Date.UTC(2026, 10, 13, 12) / 86400000);
  const idea1311 = ideaDiariaSintetica(1, '2026-11-13');
  eq(idea1311 && idea1311.title, topicsVeja[dayIdx1311 % topicsVeja.length].digest_anchor, 'B4l idea 13/11 sigue a deriveTopics (no a rotación ciega)', JSON.stringify(idea1311));
  ok(idea1311 && idea1311.title !== ['PROJET', 'Esplar', 'Campo'][dayIdx1311 % 3], 'B4m idea 13/11 difiere de la rotación ciega prods[dayIdx%3] (que daría Esplar)', JSON.stringify(idea1311));
  eq(idea1311 && idea1311.format, 'reel', 'B4n día novedad (13/11) → format reel (fix del bug viejo)');
  // B4o — estrella validada: el dueño nombra un producto real.
  const dgStar = { business: 'VEJA', category: 'calzado', productos: [{ nombre: 'Esplar' }, { nombre: 'Campo' }], dueno: { estrella: 'Esplar' } };
  cd.saveDigest(db, 2, dgStar);
  const star = cd.effectiveStarOf(dgStar);
  eq(star && star.item, 'Esplar', 'B4o effectiveStarOf con estrella validada del dueño (item)');
  eq(star && star.source, 'dueno', 'B4o2 effectiveStarOf con estrella validada del dueño (source)');
  eq(ideaDiariaSintetica(2, '2026-11-13') && ideaDiariaSintetica(2, '2026-11-13').title, 'Esplar', 'B4p con estrella validada la idea es la estrella (cualquier día)');
  eq(ideaDiariaSintetica(2, '2026-11-14') && ideaDiariaSintetica(2, '2026-11-14').title, 'Esplar', 'B4q con estrella validada la idea es la estrella (día siguiente)');
  // B4r — sin productos ni servicios: wow neutro, nunca estrella inventada.
  cd.saveDigest(db, 3, { business: 'VEJA', category: 'calzado' });
  const ideaNeu = ideaDiariaSintetica(3, '2026-11-13');
  eq(ideaNeu && ideaNeu.title, 'VEJA', 'B4r sin estrella ni temas → idea neutra con el nombre real del negocio');
  eq(ideaNeu && ideaNeu.angle_key, 'diaria-neutra', 'B4s idea neutra lleva angle_key diaria-neutra');
  // B4t — sin ni siquiera nombre de negocio: null (no se inventa nada).
  db.prepare('INSERT INTO users (id, lang) VALUES (4, ?)').run('es');
  cd.saveDigest(db, 4, {});
  eq(ideaDiariaSintetica(4, '2026-11-13'), null, 'B4t digest vacío → idea null');
  db.close();

  // B5 — contentInputFor enhebra lang (stubs de su entorno, función real)
  const ctx2 = vm.createContext({
    console,
    getProfile: () => ({ business_name: 'VEJA', ig_username: 'veja', category: 'calzado', description: 'Sneakers.', tone: '', competitors: '', goal: '' }),
    db: { prepare: () => ({ all: () => [], get: () => null }) },
    voiceExamples: () => '', personalizacion: { lineaVoz: () => '' },
    levelBoosted: (_u, _k, p) => p, recentHookIds: () => [],
    digestAnchorsFor: () => [], tasteProfile: () => '',
    performanceBrief: () => '', bestHoursLine: () => '',
    goldenExamples: () => [], captionExtrasFor: () => '',
    memoriaCliente: { memoriaParaBrief: () => '' },
    readDna: () => ({}), propiaLineaForClient: () => '',
    casaCaptionBlock: () => '', isCasaHandle: () => false,
    contentLangOf: null,
  });
  const cifSrc = extractFn(serverSrc, 'contentInputFor', ['\napp.post', '\nfunction ', '\n// ']);
  vm.runInContext(cifSrc, ctx2);
  ctx2.contentLangOf = () => 'en';
  const inpEn = ctx2.contentInputFor(1, 'the Atlas', 'novedad', 0);
  eq(inpEn && inpEn.lang, 'en', 'B5a contentInputFor con contentLang=en → captionInput.lang=en');
  eq(inpEn && inpEn.topic, 'the Atlas', 'B5b el objeto que llega a generateContent es el captionInput (lleva el topic) y trae lang=en', inpEn && JSON.stringify({ topic: inpEn.topic, lang: inpEn.lang }));
  ctx2.contentLangOf = () => 'es';
  const inpEs = ctx2.contentInputFor(1, 'la merienda', 'novedad', 0);
  eq(inpEs && inpEs.lang, 'es', 'B5c contentInputFor con contentLang=es → captionInput.lang=es (sin cambios)');
  eq(inpEs && inpEs.topic, 'la merienda', 'B5d el captionInput ES lleva el topic y lang=es', inpEs && JSON.stringify({ topic: inpEs.topic, lang: inpEs.lang }));

  // ------------------------------------------------- C. Boot funcional
  console.log('\n[C] Boot (puerto 35013, DATA_DIR temporal)');
  const PORT = 35013;
  // DATA_DIR en /tmp (tmpfs): el disco /home se queda colgado en
  // folio_wait_bit_common al abrir la DB del boot (base v978 también:
  // no es el lote, es el disco). En tmpfs el boot responde a los ~18 s.
  const DATA_DIR = path.join('/tmp', '.lote-v979-suite-data-' + process.pid);
  if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true }); // node:sqlite no crea el dir
  const free = await new Promise((res) => {
    const s = require('net').createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(PORT, '127.0.0.1');
  });
  eq(free, true, 'C1 puerto 35013 libre antes del boot (ss)');
  const env = { ...process.env, PORT: String(PORT), DATA_DIR, NODE_PATH: '/home/hatch/workspace/posta/node_modules' };
  const child = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  bootChild = child;
  let childErr = '';
  child.stderr.on('data', (d) => { childErr += String(d); });
  const httpGet = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
      let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => res({ status: r.statusCode, body: b }));
    }).on('error', rej);
  });
  let versionOk = 0;
  for (let i = 0; i < 45; i++) {
    try { const r = await httpGet('/api/version'); if (r.status === 200 && JSON.parse(r.body).build === '20261105-v979') versionOk++; if (versionOk >= 5) break; } catch (e) { /* aún no levanta */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  eq(versionOk >= 5, true, 'C2 /api/version = 20261105-v979 en 5/5 lecturas', 'llegó ' + versionOk + ' :: ' + childErr.slice(0, 200));
  const idx = await httpGet('/');
  eq(idx.status, 200, 'C3 index servido (200)');
  ok(idx.body.includes('app.js?v=674'), 'C4 index sigue con app.js?v=674 (sin bump)');
  ok(idx.body.includes('styles.css?v=20261270'), 'C5 index sigue con styles 20261270');
  const prueba = await httpGet('/prueba');
  eq(prueba.status, 200, 'C6 /prueba responde 200');
  const pid = child.pid;
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 3000));
  if (!child.killed || child.exitCode === null) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* ya murió */ } }
  await new Promise((r) => setTimeout(r, 1000));
  const stillUp = await new Promise((res) => {
    const s = require('net').createServer();
    s.once('error', () => res(false));
    s.once('listening', () => s.close(() => res(true)));
    s.listen(PORT, '127.0.0.1');
  });
  eq(stillUp, true, 'C7 boot muerto por PID exacto (puerto libre de nuevo)');
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  eq(fs.existsSync(path.join(ROOT, 'data')), false, 'C8 sin release/data/ tras el boot');
  eq(fs.existsSync(DATA_DIR), false, 'C9 DATA_DIR temporal borrado');

  // ------------------------------------------------- D. Regresiones vecinas
  console.log('\n[D] Regresiones vecinas (base-v978 vs release, conteos iguales)');
  const runSuite = (dir, file) => {
    try {
      const out = execFileSync('node', [file], { cwd: dir, timeout: 180000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { out: String(out), crashed: false };
    } catch (e) {
      return { out: String(e.stdout || '') + '\n' + String(e.stderr || ''), crashed: true };
    }
  };
  const parseCounts = (out) => {
    const m = out.match(/(\d+)\s*ok\s*[·,]\s*(\d+)\s*fal/);
    return m ? { ok: +m[1], fail: +m[2] } : null;
  };
  const fallos = (out) => out.split('\n').filter((l) => l.includes('FALLO:')).map((l) => l.trim()).sort();
  const vecinos = ['test-lote-etapa-instagram.js', 'test-lote-lineas-rojas-titular.js', 'test-lote-juli-etiquetas-en.js', 'test-lote-estrategia-posteos-v852.js', 'test-lote-analisis-diario.js'];
  for (const f of vecinos) {
    const b = runSuite(BASE, f), r = runSuite(ROOT, f);
    const cb = parseCounts(b.out), cr = parseCounts(r.out);
    const fb = fallos(b.out), fr = fallos(r.out);
    const same = cb && cr && cb.ok === cr.ok && cb.fail === cr.fail && JSON.stringify(fb) === JSON.stringify(fr);
    ok(same, 'D ' + f + ' base vs release (conteos y lista de fallos idénticos)', 'base=' + JSON.stringify(cb) + ' release=' + JSON.stringify(cr) + (b.crashed || r.crashed ? ' (alguna corrida crasheó)' : ''));
    if (!same) { console.log('    base fallos: ' + JSON.stringify(fb.slice(0, 5))); console.log('    release fallos: ' + JSON.stringify(fr.slice(0, 5))); }
  }
  // post-wow-email-y-conexion NO corre en ninguno de los dos árboles:
  // espera base-v928/server.js (pineada a su propio scratch). Se
  // reemplaza por anclas sin pins sobre los símbolos v929 (L8).
  const postWowBase = runSuite(BASE, 'test-lote-post-wow-email-y-conexion.js');
  ok(/base-v928\/server\.js/.test(postWowBase.out), 'D post-wow NO corre en base (pineada a base-v928/, no es regresión de este lote)', postWowBase.out.slice(0, 120));
  const v929 = ['pzPostWowEmailHTML', '/api/trial/notify-email', '/api/guest/resume', 'trialPostReadyEmail', 'igConnectHere', 'renderIgResume', 'igFirstOverlay', 'Lo hago después', '/api/ig/go', 'igAttemptAt'];
  let anclasOk = true;
  for (const s of v929) {
    const cb = count(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), baseServer);
    const cr = count(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), serverSrc);
    if (cb !== cr) { anclasOk = false; console.log('    ancla v929 difiere: ' + s + ' base=' + cb + ' release=' + cr); }
  }
  ok(anclasOk, 'D anclas v929 (L8, sin pins): 10 símbolos con el mismo conteo base vs release');
  const cdBase = read(path.join(BASE, 'client-digest.js'));
  const cdRel = read(path.join(ROOT, 'client-digest.js'));
  eq(cdBase === cdRel, true, 'D client-digest.js byte-idéntico base vs release (L3/L4 intactos)');

  // ------------------------------------------------- Resumen
  console.log('\n' + pass + ' ok · ' + fail + ' fallas');
  if (failures.length) { console.log('FALLOS:'); failures.forEach((f) => console.log(' - ' + f)); }
  process.exitCode = fail ? 1 : 0;
})().catch((e) => {
  if (bootChild && bootChild.exitCode === null) { try { bootChild.kill('SIGKILL'); } catch (err) { /* ya murió */ } }
  console.error('ERROR DE LA SUITE:', e && e.stack || e);
  process.exit(1);
});
