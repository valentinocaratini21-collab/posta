// Suite LOTE PUERTA-SIN-GASTO — la puerta de la prueba gratis deja de
// generar con IA paga (orden de Valentino 16/11 22:40: «quiero que
// nunca mas me llegue gasto de IA · lo haces vos y sin gastos en IA»).
// La entrada crea la semana cáscara marcada LÍNEA A MANO desde el
// nacimiento (forzar: ni el reseteo del operador la deja sin marca —
// la R1 de la tanda mixta rebotó 409 sin_marca), con sus 3 lugares en
// armado honesto y su día/hora real (próximo 19:00 y días corridos),
// usando solo lecturas públicas sin costo. El freno de emergencia
// DEMO_AI_DAILY_CAP_USD=0 frena DE VERDAD (el parseo viejo lo volvía
// 10 y la cadena de rescate de la semana trabada seguía quemando).
// Uso: node test-lote-puerta-sin-gasto.js [raíz-del-árbol] [--no-boot]
// Sin argumento usa el directorio de este archivo. El control sobre el
// árbol base (v1148) tiene que fallar exactamente en los puntos [FIX].
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
// Las cadenas de require del árbol pueden inicializar la DB en
// ./data relativo al cwd: la suite jamás ensucia el árbol.
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-puerta-data-'));

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const COSTS = fs.readFileSync(path.join(ROOT, 'costs.js'), 'utf8');
const DEMO = fs.readFileSync(path.join(ROOT, 'demo.js'), 'utf8');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) { DatabaseSync = null; }

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre, extra) {
  if (cond) { pass++; console.log('  ✓ ' + nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const AI_NAMES = ['generateDemo(', 'generateDemoPieceImage', 'qaDemoPiece', 'qaGeneratedLogo', 'classifyWithVision', 'classifyFeedPostStyles', 'generateIdeas', 'buildTrialDigest', 'resolveTrialRubro', 'buildDemoSpec', 'scheduleWeekRescue', 'genConceptImage', 'aplicarJuicioFinalTrial'];

/* ── A · Censo de fuente ─────────────────────────────────────────── */
function seccionA() {
  seccion('A · censo de cableado (fuente)');
  const iH = SERVER.indexOf('async function puertaSinGastoSemana(o)');
  ok(iH >= 0, 'A1 [FIX] existe el constructor de la semana cáscara (puertaSinGastoSemana)');
  const helper = iH >= 0 ? SERVER.slice(iH, iH + 9500) : '';
  ok(helper.includes('forzar: true'), 'A2 [FIX] la marca nace FORZADA (ni el reseteo del operador la deja sin marca)');
  ok(helper.includes('linea_mano: true') && helper.includes('puerta_sin_gasto: true'), 'A3 [FIX] el payload se declara línea a mano de la puerta sin gasto');
  ok(helper.includes('buildTrialWeekCasara(lang)'), 'A4 [FIX] los lugares llevan el día/hora real de la regla 19:00');
  const aiEnHelper = AI_NAMES.filter((n) => helper.includes(n));
  ok(iH >= 0 && aiEnHelper.length === 0, 'A5 [FIX] CERO entradas de IA paga dentro del constructor de la cáscara', aiEnHelper);
  const iHandler = SERVER.indexOf('async function trialGenerateHandler');
  const handlerSync = iHandler >= 0 ? SERVER.slice(iHandler, iHandler + 70000) : '';
  const iSync = handlerSync.indexOf('LA PUERTA NUEVA: fuera del modo de prueba');
  ok(iSync >= 0 && iSync < handlerSync.indexOf('demo.generateDemo({'), 'A6 [FIX] la ruta sync corta a la cáscara ANTES de la tubería de generación');
  const iStream = SERVER.indexOf('LA PUERTA NUEVA, igual que en la ruta');
  ok(iStream >= 0 && SERVER.includes("send('done', { out: outPSG })"), 'A7 [FIX] la ruta stream crea la cáscara y cierra con done');
  ok(SERVER.includes("skipped: 'puerta-sin-gasto'"), 'A8 [FIX] pregenerate no dispara generación temprana fuera del modo de prueba');
  ok(SERVER.includes('rubroId.classifyBusiness(signals)') && SERVER.includes('rubroId.classifyBusiness(webSignals)'),
    'A9 [FIX] los prefill clasifican determinístico (sin visión paga) fuera del modo de prueba');
  eq((SERVER.match(/vision: trialTestMode\(req\) \?/g) || []).length, 2, 'A10 [FIX] las dos firmas de estilo van sin visión fuera del modo de prueba');
  const iR = SERVER.indexOf('async function rearmarSemanaPruebaPorCacheKey');
  const rearmar = iR >= 0 ? SERVER.slice(iR, iR + 2600) : '';
  ok(rearmar.includes('marcaActiva(db, cacheKey)') && rearmar.includes('linea_mano: true'),
    'A11 [FIX] el re-enganche del rescate corta en la marca (defensa en profundidad)');
  ok(SERVER.includes('marcaActiva(db, ig)) continue'), 'A12 [FIX] el barrido del rescate ni revisa las semanas marcadas');
  ok(COSTS.includes('Number.isFinite(v) ? Math.max(0, v) : 10'), 'A13 [FIX] el tope del demo parsea el 0 como 0 (el freno frena)');
  ok(!SERVER.includes('Come back in a few minutes') && !SERVER.includes('Volvé en unos minutos'),
    'A14 [FIX] la entrada del invitado no promete tiempos (regla de copy de la puerta)');
  ok(SERVER.includes('being put together by hand'), 'A15 [FIX] la salida en armado dice el hecho: se arma a mano, sin estimar esperas');
  ok(SERVER.includes("reason: 'linea-mano'") || SERVER.includes('reason:"linea-mano"') || SERVER.includes("'linea-mano'"),
    'A16 la guarda de la cabeza de la cadena de rescate sigue viva (no se desmanteló)');
  ok(DEMO.includes('DEMO_LIMIT_PRELAUNCH_PER_DAY = 50'), 'A17 el tope de v1148 (ventana 50/día) queda intacto');
  ok(SERVER.includes("const BUILD_ID = '20261105-v1149'"), 'A18 [FIX] BUILD_ID del lote (v1149)');
}

/* ── B · Unidades ejecutadas ─────────────────────────────────────── */
function seccionB() {
  seccion('B · unidades ejecutadas (costs, linea-mano, horarios)');
  if (!DatabaseSync) { ok(false, 'B0 node:sqlite disponible'); return; }
  // costs: el freno 0 frena de verdad.
  const mkCostsDb = () => {
    const d = new DatabaseSync(':memory:');
    d.exec(`CREATE TABLE api_costs (id INTEGER PRIMARY KEY, user_id INTEGER, feature TEXT, model TEXT, in_tokens INTEGER, out_tokens INTEGER, cached_tokens INTEGER, images INTEGER, est_cost_usd REAL, ts TEXT DEFAULT (datetime('now')))`);
    return d;
  };
  const cargarCosts = () => {
    const p = require.resolve(path.join(ROOT, 'costs.js'));
    delete require.cache[p];
    return require(p);
  };
  process.env.DEMO_AI_DAILY_CAP_USD = '0';
  let c0 = cargarCosts();
  c0.initCosts(mkCostsDb());
  eq(c0.DEMO_AI_DAILY_CAP_USD, 0, 'B1 [FIX] con DEMO_AI_DAILY_CAP_USD=0 el tope efectivo es 0 (antes: 10)');
  eq(c0.demoAiCapOk(), false, 'B2 [FIX] con el freno en 0, demoAiCapOk() es false: la cadena de rescate no quema');
  delete process.env.DEMO_AI_DAILY_CAP_USD;
  c0 = cargarCosts();
  c0.initCosts(mkCostsDb());
  eq(c0.DEMO_AI_DAILY_CAP_USD, 10, 'B3 sin env, el tope vuelve al default de siempre (10)');
  eq(c0.demoAiCapOk(), true, 'B4 sin env y sin gasto, el tope deja pasar (comportamiento de siempre)');

  // linea-mano: la exclusión del reseteo sigue viva para el gate;
  // con forzar, la marca nace igual y la exclusión NO se consume.
  const lm = require(path.join(ROOT, 'linea-mano.js'));
  const dbL = new DatabaseSync(':memory:');
  lm.ensureSchema(dbL);
  lm.registrarReseteo(dbL, 'suite.x', 'suite.example.com');
  const n1 = lm.nace(dbL, { ig: 'suite.x', domain: 'suite.example.com' });
  eq(n1.marcada, false, 'B5 la exclusión del reseteo sigue frenando el nacimiento común (frontera con el gate intacta)');
  lm.registrarReseteo(dbL, 'suite.y', 'suitey.example.com');
  const n2 = lm.nace(dbL, { ig: 'suite.y', domain: 'suitey.example.com', forzar: true });
  eq(n2.marcada, true, 'B6 [FIX] con forzar, la semana nace marcada AUNQUE el operador reseteó antes (el caso R1)');
  ok(!!lm.marcaActiva(dbL, lm.claveCache('suite.y', 'suitey.example.com')), 'B7 [FIX] la marca forzada queda activa y consultable');
  const exViva = dbL.prepare("SELECT COUNT(*) AS n FROM trial_reset_log WHERE consumida = 0 AND value = 'suite.y'").get();
  eq(exViva.n, 1, 'B8 [FIX] el nacimiento forzado NO consume la exclusión (queda para un nacimiento del gate)');

  // buildTrialWeekCasara: 3 lugares, todos 19:00, días corridos desde
  // el próximo slot bueno (hoy si 19:00 no pasó; mañana si pasó).
  const mW = SERVER.match(/function buildTrialWeek\(n, lang\) \{[\s\S]*?\n\}/);
  const mC = SERVER.match(/function buildTrialWeekCasara\(lang\) \{[\s\S]*?\n\}/);
  ok(!!mC, 'B9 [FIX] buildTrialWeekCasara se puede extraer de server.js');
  if (mW && mC) {
    const caja = {};
    vm.createContext(caja);
    vm.runInContext(mW[0] + '\n' + mC[0] + '\nthis.__f = buildTrialWeekCasara;', caja);
    const f = caja.__f;
    const esperado = (tz) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date());
      const g = {}; for (const p of parts) g[p.type] = p.value;
      const start = (Number(g.hour) % 24) >= 19 ? 1 : 0;
      return [0, 1, 2].map((i) => {
        const dt = new Date(Date.UTC(Number(g.year), Number(g.month) - 1, Number(g.day) + start + i, 12));
        return dt.getUTCDate() + '/' + (dt.getUTCMonth() + 1);
      });
    };
    const es = f('es');
    eq(es.length, 3, 'B10 [FIX] la cáscara ES trae 3 lugares');
    ok(es.every((w) => w.hour === '19:00'), 'B11 [FIX] los 3 lugares ES salen a las 19:00 (sin rotación de horarios)');
    eq(es.map((w) => w.date.replace(/[^0-9/]/g, '').split('/').filter(Boolean).join('/')).length, 3, 'B12 [FIX] los 3 lugares traen fecha');
    const espEs = esperado('America/Argentina/Buenos_Aires');
    ok(es.every((w, i) => w.date.includes(String(Number(espEs[i].split('/')[0]))) && w.date.includes(['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(espEs[i].split('/')[1]) - 1])),
      'B13 [FIX] el día 1 es el próximo slot bueno (hoy 19:00 si no pasó; mañana si pasó) y los demás corren', { es: es.map((w) => w.date), espEs });
    const en = f('en');
    ok(en.every((w) => w.hour === '7:00 PM'), 'B14 [FIX] los 3 lugares EN salen a las 7:00 PM');
  } else { for (const n of ['B10', 'B11', 'B12', 'B13', 'B14']) ok(false, n + ' [FIX] (sin buildTrialWeekCasara extraíble)'); }
}

/* ── C · Boot HTTP: la entrada completa, sin gasto ───────────────── */
async function seccionC() {
  seccion('C · boot aislado: entrada cáscara → pieza a mano → rescate quieto → reseteo y re-entrada');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'C0 node:sqlite disponible para sembrar'); return; }
  const port = 19950 + Math.floor(Math.random() * 120);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-puerta-boot-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-puerta-boot-media-'));
  const childEnv = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN_TOK, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' };
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN', 'DEMO_AI_DAILY_CAP_USD', 'TRIAL_TEST_KEY']) delete childEnv[k];
  // La web del negocio, servida local: lectura pública sin costo.
  const webSrv = http.createServer((rq, rs) => {
    rs.writeHead(200, { 'Content-Type': 'text/html' });
    rs.end('<html><head><title>Puerta Suite Cakes</title><meta name="description" content="Custom cakes made to order"></head><body><h1>Puerta Suite Cakes</h1><p>Custom cakes, wedding cakes and cupcakes made to order.</p></body></html>');
  });
  await new Promise((r) => webSrv.listen(0, '127.0.0.1', r));
  const webUrl = 'http://127.0.0.1:' + webSrv.address().port + '/';
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  let vivo = false;
  try {
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.status === 200) vivo = true;
    }
    ok(vivo, 'C1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'C2 la base del boot se puede abrir para leer el resultado');
    if (!db) return;
    const cookieDe = (r) => {
      const sc2 = (typeof r.headers.getSetCookie === 'function') ? r.headers.getSetCookie() : [];
      return sc2.map((c) => c.split(';')[0]).filter((c) => c.includes('=')).join('; ');
    };
    const costos = () => { try { return db.prepare('SELECT COUNT(*) AS n FROM api_costs').get().n; } catch (e) { return -1; } };
    const marcaDe = (k) => { try { return db.prepare('SELECT estado FROM trial_linea_mano WHERE cache_key = ?').get(k) || null; } catch (e) { return null; } };
    const entradaStream = async () => {
      const boundary = 'posta-suite-' + Date.now().toString(36);
      const fields = { business: 'Puerta Suite Cakes', ig: 'puerta.suite', category: 'otro', lang: 'en', web: webUrl, producto_estrella: 'Custom cakes', producto_mix: 'libre', country: 'US', tone: 'vos' };
      const parts = [];
      for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
      parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
      const t0 = Date.now();
      const r = await fetch(base + '/api/trial/generate-stream', { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(parts), signal: AbortSignal.timeout(120000) }).catch(() => null);
      if (!r) return { r: null, out: null, ms: Date.now() - t0 };
      const txt = await r.text().catch(() => '');
      let out = null;
      for (const bloque of txt.split('\n\n')) {
        if (bloque.includes('event: done')) {
          const m = /data: (.*)/.exec(bloque);
          if (m) { try { out = JSON.parse(m[1]).out || null; } catch (e) {} }
        }
      }
      return { r, out, ms: Date.now() - t0 };
    };

    const e1 = await entradaStream();
    ok(!!e1.out, 'C3 [FIX] la entrada por stream cierra con done y payload', e1.out ? undefined : { status: e1.r && e1.r.status });
    if (e1.out) {
      eq(e1.out.puerta_sin_gasto, true, 'C4 [FIX] el payload es la cáscara de la puerta sin gasto');
      eq(e1.out.linea_mano, true, 'C5 [FIX] el payload nace declarado línea a mano');
      eq(e1.out.posts.length, 3, 'C6 [FIX] la semana cáscara trae sus 3 lugares');
      ok(e1.out.posts.every((p) => p.armando === true), 'C7 [FIX] los 3 lugares están en armado honesto');
      ok(e1.out.week.every((w) => w.hour === '7:00 PM'), 'C8 [FIX] los 3 lugares llevan su hora real (7:00 PM)');
      ok(e1.ms < 45000, 'C9 [FIX] la entrada aterriza en segundos, no en minutos (' + e1.ms + ' ms)');
    } else { for (const n of ['C4', 'C5', 'C6', 'C7', 'C8', 'C9']) ok(false, n + ' [FIX] (sin payload de la entrada)'); }
    const marca = marcaDe('puerta.suite');
    ok(!!marca && marca.estado === 'activa', 'C10 [FIX] la marca línea a mano quedó ACTIVA en la base desde el nacimiento', marca);
    eq(costos(), 0, 'C11 [FIX] la entrada dejó CERO filas en el ledger de costos (cero gasto de IA)');

    // La casa del invitado: entra con la semana en armado (202) y el
    // perfil ya muestra SU negocio (no el genérico).
    const gs = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'puerta.suite', lang: 'en', tz: 'America/New_York', device: 'suite-puerta' }), signal: AbortSignal.timeout(60000) }).catch(() => null);
    const gsJson = gs ? await gs.json().catch(() => ({})) : {};
    const ck = gs ? cookieDe(gs) : '';
    eq(gs && gs.status, 202, 'C12 [FIX] guest/start abre la sesión con la semana en armado (202)');
    ok(!/few minutes|minutos/i.test(String(gsJson.error || '')), 'C13 [FIX] la respuesta en armado no promete tiempos', gsJson.error);
    const guest = db.prepare("SELECT id FROM users WHERE guest_ig = 'puerta.suite'").get();
    const uid = guest ? Number(guest.id) : 0;
    ok(!!uid, 'C14 [FIX] el invitado de la cáscara existe');
    const perfil = uid ? db.prepare('SELECT business_name, category FROM profiles WHERE user_id = ?').get(uid) : null;
    ok(!!perfil && perfil.business_name === 'Puerta Suite Cakes', 'C15 [FIX] el perfil del invitado muestra SU negocio desde la entrada (SUPERFICIE)', perfil);

    // La palanca de bamboo acepta sobre la cáscara (nada de 409).
    const pm = await fetch(base + '/api/admin/trial/pieza-mano?token=' + ADMIN_TOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'puerta.suite', dia: 1, media: PNG, caption: 'custom cakes, made to order', hashtags: '#puertasuite' }) });
    const pmJson = await pm.json().catch(() => ({}));
    ok(pm.status === 200 && pmJson.ok === true, 'C16 [FIX] pieza-mano carga el día 1 sobre la cáscara (sin 409 sin_marca)', { status: pm.status, json: pmJson });
    if (ck) await fetch(base + '/api/posts', { headers: { Cookie: ck } }).catch(() => null);
    const filas = uid ? db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid).n : 0;
    eq(filas, 1, 'C17 [FIX] la pieza cargada se importa a la casa (el lugar del día 1 se llena)');

    // El rescate no se engancha: ensure no genera ni quema.
    if (ck) await fetch(base + '/api/week/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: '{}' }).catch(() => null);
    await new Promise((r) => setTimeout(r, 1500));
    const cacheRow = db.prepare("SELECT payload FROM trial_cache WHERE ig = 'puerta.suite'").get();
    const payloadVivo = cacheRow ? JSON.parse(cacheRow.payload) : null;
    ok(!!payloadVivo && payloadVivo.posts[1].armando === true && payloadVivo.posts[2].armando === true,
      'C18 [FIX] tras ensure, los lugares 2 y 3 siguen en armado honesto (la cadena no generó)');
    eq(costos(), 0, 'C19 [FIX] el ledger sigue en cero tras ensure (el rescate no quemó nada)');

    // El caso R1: reseteo del operador y re-entrada — la semana
    // re-nace marcada igual (antes: 409 sin_marca y semana del software).
    const rs = await fetch(base + '/api/admin/trial-reset?token=' + ADMIN_TOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'puerta.suite', confirm: true }) });
    ok(rs.status === 200, 'C20 [FIX] el reseteo del operador corre', { status: rs.status });
    const e2 = await entradaStream();
    ok(!!e2.out && e2.out.puerta_sin_gasto === true, 'C21 [FIX] la re-entrada tras el reseteo vuelve a nacer cáscara de la puerta');
    const marca2 = marcaDe('puerta.suite');
    ok(!!marca2 && marca2.estado === 'activa', 'C22 [FIX] tras reseteo + re-entrada la marca está ACTIVA (el 409 de la R1 no vuelve)', marca2);
    eq(costos(), 0, 'C23 [FIX] todo el recorrido, incluido el reseteo, dejó el ledger en cero');
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { webSrv.close(); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionA();
  seccionB();
  await seccionC();
  console.log(`\n== PUERTA-SIN-GASTO: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
  process.exit(0);
})();
