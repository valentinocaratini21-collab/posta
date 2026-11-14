// test-lote-pregunta-sin-repetir.js — LOTE PREGUNTA-SIN-REPETIR
// (diagnóstico Veja 3.ª corrida, causa 3): la respuesta del formulario
// de la prueba a «¿qué vende más?» quedaba en onboarding.producto_estrella
// y nunca mapeaba al dato que la máquina de preguntas consulta
// (digest.dueno.mas_vendido / ADN mas_vendido) → el hueco nacía abierto
// y Posty volvía a preguntar lo que el cliente ya había dicho.
//
// §A estáticos (estampado v1067 sobre base viva v1066 — adaptación del
// preparador: la suite del builder pineaba v996/v980 y los censos de
// v980; acá van los valores del árbol vivo, verificados por conteo) ·
// §B VM: buildTrialDigest REAL extraído (release mapea; base no) +
// contrato de candidatesFor (el hueco se cubre con el dato en
// cualquiera de los dos lugares que la máquina mira) ·
// §C boot real: guest/start con payload de prueba en forma de la base
// (digest con onboarding pero SIN dueno.mas_vendido) → la siembra
// mapea: la pregunta ofrecida NO es la de «qué se vende más» y el
// dato queda en el digest Y en el ADN. Invitado sin declaración →
// la pregunta se ofrece como hoy. Control sobre la base: con dato
// declarado, la pregunta se ofrece igual (bug reproducido).
// Corre desde la raíz del scratch: node test-lote-pregunta-sin-repetir.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn, execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const REL = path.join(__dirname, 'release');
const BASE = path.join(__dirname, 'base');
const PORT_REL = 35041;
const PORT_BASE = 35042;
const TEST_KEY = 'psrkey';

let ok = 0, mal = 0; const fails = [];
function t(name, cond, extra) {
  if (cond) { ok++; }
  else { mal++; fails.push(name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); console.log('FAIL:', name, extra ? String(extra).slice(0, 400) : ''); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function read(p) { return fs.readFileSync(p, 'utf8'); }
function count(hay, needle) { return ('' + hay).split(needle).length - 1; }
function linesWith(hay, needle) { return ('' + hay).split('\n').filter((l) => l.includes(needle)).length; }
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('no está ' + name);
  const skipStr = (i) => {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; return i; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; return i + 1; }
    if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < src.length) { if (src[i] === '\\') { i += 2; continue; } if (src[i] === q) break; i++; } return i; }
    return -1;
  };
  // La firma puede desestructurar ({...}): el cuerpo abre en el primer
  // '{' DESPUÉS del ')' que cierra la lista de parámetros.
  let i = src.indexOf('(', start);
  let par = 0;
  for (; i < src.length; i++) {
    const s = skipStr(i); if (s >= 0) { i = s; continue; }
    if (src[i] === '(') par++;
    else if (src[i] === ')') { par--; if (par === 0) { i++; break; } }
  }
  i = src.indexOf('{', i);
  if (i < 0) throw new Error('sin cuerpo ' + name);
  let depth = 0;
  for (; i < src.length; i++) {
    const s = skipStr(i); if (s >= 0) { i = s; continue; }
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('sin cierre ' + name);
}
function loadFns(tree, names) {
  const src = read(path.join(tree, 'server.js'));
  const code = names.map((n) => extractFn(src, n)).join('\n');
  const sandbox = {
    clientDigest: require(path.join(tree, 'client-digest.js')),
    studyFeedMap: { isFeedMap: () => false },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;this.__out = { ' + names.map((n) => `${n}: (typeof ${n} !== 'undefined' ? ${n} : null)`).join(', ') + ' };', sandbox);
  return sandbox.__out;
}

// ---------- §A. Estáticos ----------
function sectionA() {
  const srv = read(path.join(REL, 'server.js'));
  const srvB = read(path.join(BASE, 'server.js'));
  t('A1 BUILD v1067 ×1 / v1066 ×0 en release (base: v1066 ×1)',
    count(srv, "const BUILD_ID = '20261105-v1067';") === 1 && count(srv, "const BUILD_ID = '20261105-v1066';") === 0
    && count(srvB, "const BUILD_ID = '20261105-v1066';") === 1);
  t('A2 censos ajenos en release/server.js: monedaCuentaAds ×4 · PLAN_UNICO ×11 · contentLangOf 14 líneas (valor del vivo; en v980 eran 4)',
    count(srv, 'monedaCuentaAds') === 4 && count(srv, 'PLAN_UNICO') === 11 && linesWith(srv, 'contentLangOf') === 14,
    `moneda=${count(srv, 'monedaCuentaAds')} plan=${count(srv, 'PLAN_UNICO')} lang=${linesWith(srv, 'contentLangOf')}`);
  t('A3 el mapeo existe: applyTrialMasVendido ×0 en base → ×4 en release · mas_vendido = base +12 (el delta exacto del lote; la base viva ya traía ×1 en una lectura de nombres de estrella)',
    count(srv, 'applyTrialMasVendido') === 4 && count(srvB, 'applyTrialMasVendido') === 0 && count(srvB, 'mas_vendido') === 1 && count(srv, 'mas_vendido') === count(srvB, 'mas_vendido') + 12,
    `apply=${count(srv, 'applyTrialMasVendido')} base_mv=${count(srvB, 'mas_vendido')} rel_mv=${count(srv, 'mas_vendido')}`);
  for (const f of ['posty-questions.js', 'client-digest.js', 'guest-trial.js', 'public/app.js', 'public/index.html', 'public/en/index.html']) {
    t('A4 sin cambios: ' + f, read(path.join(REL, f)) === read(path.join(BASE, f)));
  }
}

// ---------- §B. VM: buildTrialDigest + contrato de la máquina ----------
function buildFixtureDigest(tree, onboarding) {
  const fns = loadFns(tree, tree === REL ? ['applyTrialMasVendido', 'buildTrialDigest'] : ['buildTrialDigest']);
  const digest = fns.buildTrialDigest({ business: 'Veja PSR', category: 'moda', onboarding });
  // La estrella inferida por el estudio cubre el hueco nº4 en el
  // fixture: así el primer hueco abierto es (o no) el de mas_vendido.
  if (digest) {
    digest.inferred_star = { item: 'Esplar', confidence: 0.9, evidence: ['fixture'], fuente: 'dueno' };
    if (!Array.isArray(digest.productos) || !digest.productos.length) digest.productos = [{ nombre: 'Esplar' }];
    // Fixture: el estudio resolvió el rubro y no derivó candidatos —
    // el primer candidato posible es un hueco (estrella ya cubierta).
    digest.question_candidates = [];
    digest.contradictions = [];
  }
  return digest;
}
function sectionB() {
  const pq = require(path.join(REL, 'posty-questions.js'));
  const ocFull = { producto_estrella: 'Esplar', producto_mix: 'uno', diferencial: 'caucho natural', audiencia: 'corredores urbanos' };

  const dgRel = buildFixtureDigest(REL, ocFull);
  t('B1 release: buildTrialDigest mapea onboarding.producto_estrella → dueno.mas_vendido',
    !!dgRel && dgRel.onboarding && dgRel.onboarding.producto_estrella === 'Esplar'
    && !!dgRel.dueno && dgRel.dueno.mas_vendido === 'Esplar',
    JSON.stringify(dgRel && dgRel.dueno));

  const dgRelSin = buildFixtureDigest(REL, { producto_mix: 'todo' });
  t('B2 release: sin declaración, el digest nace SIN dueno.mas_vendido',
    !!dgRelSin && !(dgRelSin.dueno && String(dgRelSin.dueno.mas_vendido || '').trim().length >= 3),
    JSON.stringify(dgRelSin && dgRelSin.dueno));

  const fns = loadFns(REL, ['applyTrialMasVendido']);
  const dNoPisa = { onboarding: { producto_estrella: 'Esplar' }, dueno: { mas_vendido: 'Campo' } };
  t('B3 el mapeo no pisa un dato existente más fuerte',
    fns.applyTrialMasVendido(dNoPisa) === false && dNoPisa.dueno.mas_vendido === 'Campo');
  const dCorto = { onboarding: { producto_estrella: 'ab' }, dueno: null };
  t('B4 umbral de la máquina: declaración <3 caracteres no mapea',
    fns.applyTrialMasVendido(dCorto) === false && !(dCorto.dueno && dCorto.dueno.mas_vendido));
  const dNulo = { onboarding: { producto_estrella: 'Esplar' }, dueno: null };
  t('B5 con dueno null, el mapeo crea el bloque y mapea',
    fns.applyTrialMasVendido(dNulo) === true && dNulo.dueno.mas_vendido === 'Esplar');

  const hasGap = (digest, dna) => pq.candidatesFor(digest, dna, {}).some((c) => c.qkey === 'hueco:mas_vendido');
  t('B6 contrato: con dueno.mas_vendido, candidatesFor NO ofrece el hueco',
    hasGap(dgRel, {}) === false);
  t('B7 contrato: sin ningún dato, candidatesFor SÍ ofrece el hueco',
    hasGap(dgRelSin, {}) === true);
  t('B8 contrato: el dato en el ADN (otra fuente válida) también cubre el hueco',
    hasGap(dgRelSin, { mas_vendido: 'Esplar' }) === false);

  const dgBase = buildFixtureDigest(BASE, ocFull);
  t('B9 CONTROL base viva v1066: buildTrialDigest NO mapea (bug en el nacimiento del digest)',
    !!dgBase && dgBase.onboarding && dgBase.onboarding.producto_estrella === 'Esplar'
    && !(dgBase.dueno && String(dgBase.dueno.mas_vendido || '').trim().length >= 3),
    JSON.stringify(dgBase && dgBase.dueno));
  t('B10 CONTROL base viva v1066: con ese digest, el hueco queda ofrecido',
    hasGap(dgBase, {}) === true);

  return { dgBaseFixture: dgBase };
}

// ---------- §C. Boot real: guest/start → siembra → pregunta ----------
const IMG_B64 = fs.readFileSync(path.join(REL, 'stock/barberia/2061820.jpg')).toString('base64');
function payloadFor(ig, digest, onboarding) {
  const caps = [
    'Zapatillas de caña baja en lona de algodón orgánico, suela de caucho natural. Pedilas por DM y retiralas hoy.',
    'El modelo de la casa en tus pies: liviano, flexible, listo en tres minutos. Vení a probarlo al local hoy.',
    'Par nuevo del lote de este mes, guardado ayer para que llegue impecable. Encargalo por mensaje directo.',
  ];
  return {
    ok: true, engine: 25, lang: 'es', business: 'Veja PSR', ig, category: 'moda',
    posts: caps.map((c) => ({ type: 'image', image: 'data:image/jpeg;base64,' + IMG_B64, caption: c, hashtags: '#veja', headline: '', style: '' })),
    design: { posts: caps.map(() => ({ headline: '', style: 'foto', kind: 'foto' })) },
    digest, onboarding,
  };
}
function openDb(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
  try { db.exec('PRAGMA busy_timeout = 8000'); } catch (e) {}
  return db;
}
function seedTrialCache(dataDir, ig, payload) {
  const db = openDb(dataDir);
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function dbOne(dataDir, sql, arg) {
  const db = openDb(dataDir);
  const r = db.prepare(sql).get(arg);
  db.close();
  return r;
}
function cookieOf(res) {
  const arr = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  return (arr || []).map((c) => String(c).split(';')[0]).join('; ');
}
async function postJ(port, p, body, cookie, qs) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p + (qs || ''), { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j, cookie: cookieOf(r) };
}
async function getJ(port, p, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const r = await fetch('http://127.0.0.1:' + port + p, { headers });
  const j = await r.json().catch(() => null);
  return { status: r.status, j };
}
async function bootTree(tree, port, bootBase, expectBuild) {
  const dataDir = bootBase + '/data';
  fs.rmSync(bootBase, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const logFd = fs.openSync(bootBase + '/boot.log', 'w');
  const env = Object.assign({}, process.env, {
    PORT: String(port), DATA_DIR: dataDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    ADMIN_TOKEN: 'psr-admin-token', TRIAL_TEST_KEY: TEST_KEY, OPENAI_API_KEY: '',
  });
  const child = spawn('node', ['server.js'], { cwd: tree, env, stdio: ['ignore', logFd, logFd] });
  let ver = null;
  for (let i = 0; i < 120 && !ver; i++) {
    await sleep(500);
    try { const r = await fetch('http://127.0.0.1:' + port + '/api/version'); if (r.ok) { const j = await r.json(); if (j.build === expectBuild) ver = j; } } catch (e) {}
  }
  return { child, dataDir, ver };
}
function killExact(child) {
  try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
}
async function portFree(port) {
  await sleep(700);
  try { const ss = execSync('ss -ltn').toString(); return !ss.includes(':' + port + ' '); } catch (e) { return false; }
}
async function guestFlow(port, dataDir, ig, payload) {
  seedTrialCache(dataDir, ig, payload);
  const st = await postJ(port, '/api/guest/start', { ig, domain: ig + '.com', device: 'psr-device-' + ig, lang: 'es' }, null, '?test_key=' + TEST_KEY);
  const uid = st.j && st.j.user_id;
  let question = null;
  if (st.cookie) { const q = await getJ(port, '/api/questions/current', st.cookie); question = q.j && q.j.question; }
  let digestRow = null, dnaRow = null;
  if (uid) {
    const dr = dbOne(dataDir, 'SELECT digest_json FROM client_digest WHERE user_id = ?', uid);
    if (dr && dr.digest_json) { try { digestRow = JSON.parse(dr.digest_json); } catch (e) {} }
    const nr = dbOne(dataDir, 'SELECT dna_json FROM business_dna WHERE user_id = ?', uid);
    if (nr && nr.dna_json) { try { dnaRow = JSON.parse(nr.dna_json); } catch (e) {} }
  }
  return { st, uid, question, digestRow, dnaRow };
}

async function sectionC(fixture) {
  const ocFull = { producto_estrella: 'Esplar', producto_mix: 'uno', diferencial: 'caucho natural', audiencia: 'corredores urbanos' };
  const ocVacio = { producto_mix: 'todo' };
  // El digest del payload en forma de la base (buildTrialDigest de la base):
  // trae el namespace onboarding pero NUNCA dueno.mas_vendido.
  const dgDeclarado = JSON.parse(JSON.stringify(fixture.dgBaseFixture));
  const dgSinNs = JSON.parse(JSON.stringify(fixture.dgBaseFixture)); delete dgSinNs.onboarding;
  const dgNada = buildFixtureDigest(BASE, ocVacio);

  const ss0 = execSync('ss -ltn').toString();
  t('C0 puertos ' + PORT_REL + '/' + PORT_BASE + ' libres antes de los boots', !ss0.includes(':' + PORT_REL) && !ss0.includes(':' + PORT_BASE));

  // --- Boot RELEASE ---
  const bRel = await bootTree(REL, PORT_REL, '/tmp/boot-psr-rel', '20261105-v1067');
  t('C1 boot release: /api/version = 20261105-v1067', !!bRel.ver);
  if (bRel.ver) {
    const a = await guestFlow(PORT_REL, bRel.dataDir, 'psrdeclara', payloadFor('psrdeclara', dgDeclarado, ocFull));
    t('C2 release · declarado (digest con onboarding): guest/start ok', a.st.status === 200 && a.st.j && a.st.j.ok === true && !!a.uid, a.st.status + ' ' + JSON.stringify(a.st.j).slice(0, 200));
    t('C3 release · declarado: la pregunta ofrecida NO es «qué se vende más»',
      !!a.question && a.question.kind !== 'mas_vendido',
      JSON.stringify(a.question));
    t('C4 release · declarado: el digest sembrado trae dueno.mas_vendido = lo declarado',
      !!a.digestRow && !!a.digestRow.dueno && a.digestRow.dueno.mas_vendido === 'Esplar',
      JSON.stringify(a.digestRow && a.digestRow.dueno));
    t('C5 release · declarado: el ADN sembrado trae mas_vendido = lo declarado',
      !!a.dnaRow && a.dnaRow.mas_vendido === 'Esplar',
      JSON.stringify(a.dnaRow && a.dnaRow.mas_vendido));

    const a2 = await guestFlow(PORT_REL, bRel.dataDir, 'psrdeclara2', payloadFor('psrdeclara2', dgSinNs, ocFull));
    t('C6 release · declarado solo a nivel payload (digest sin namespace): guest/start ok', a2.st.status === 200 && !!a2.uid, a2.st.status + '');
    t('C7 release · payload-level: el digest sembrado igual trae dueno.mas_vendido (namespace restaurado)',
      !!a2.digestRow && !!a2.digestRow.dueno && a2.digestRow.dueno.mas_vendido === 'Esplar'
      && !!a2.question && a2.question.kind !== 'mas_vendido',
      JSON.stringify(a2.digestRow && a2.digestRow.dueno) + ' q=' + JSON.stringify(a2.question));

    const b = await guestFlow(PORT_REL, bRel.dataDir, 'psrnada', payloadFor('psrnada', dgNada, ocVacio));
    t('C8 release · sin declaración: guest/start ok', b.st.status === 200 && !!b.uid, b.st.status + '');
    t('C9 release · sin declaración: la pregunta ofrecida ES «qué se vende más» (como hoy)',
      !!b.question && b.question.kind === 'mas_vendido',
      JSON.stringify(b.question));
    t('C10 release · sin declaración: ni digest ni ADN traen mas_vendido',
      !(b.digestRow && b.digestRow.dueno && String(b.digestRow.dueno.mas_vendido || '').trim().length >= 3)
      && !(b.dnaRow && String(b.dnaRow.mas_vendido || '').trim().length >= 3));
  }
  killExact(bRel.child);
  t('C11 puerto release libre tras matar por PID exacto', await portFree(PORT_REL));

  // --- Boot BASE (control) ---
  const bBase = await bootTree(BASE, PORT_BASE, '/tmp/boot-psr-base', '20261105-v1066');
  t('C12 boot base: /api/version = 20261105-v1066', !!bBase.ver);
  if (bBase.ver) {
    const a = await guestFlow(PORT_BASE, bBase.dataDir, 'psrdeclara', payloadFor('psrdeclara', dgDeclarado, ocFull));
    t('C13 CONTROL base · declarado: guest/start ok', a.st.status === 200 && !!a.uid, a.st.status + '');
    t('C14 CONTROL base · declarado: la pregunta ofrecida ES «qué se vende más» (bug reproducido)',
      !!a.question && a.question.kind === 'mas_vendido',
      JSON.stringify(a.question));
    t('C15 CONTROL base · declarado: el digest sembrado NO trae dueno.mas_vendido',
      !(a.digestRow && a.digestRow.dueno && String(a.digestRow.dueno.mas_vendido || '').trim().length >= 3),
      JSON.stringify(a.digestRow && a.digestRow.dueno));
  }
  killExact(bBase.child);
  t('C16 puerto base libre tras matar por PID exacto', await portFree(PORT_BASE));
}

(async () => {
  try {
    sectionA();
    const fixture = sectionB();
    await sectionC(fixture);
  } catch (e) {
    mal++; fails.push('EXCEPCIÓN: ' + (e && e.stack || e));
    console.log('EXCEPCIÓN:', e && e.stack || e);
  }
  console.log(`\n== test-lote-pregunta-sin-repetir: ${ok} ok · ${mal} fallas ==`);
  if (fails.length) { console.log('FALLAS:'); for (const f of fails) console.log(' -', f); }
  process.exit(mal ? 1 : 0);
})();
