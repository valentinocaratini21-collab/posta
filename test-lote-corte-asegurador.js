// Suite LOTE CORTE-ASEGURADOR — el asegurador del posteo del día
// (ensureTodayPost, LOTE RITUAL-1-OPCION) NUNCA genera para un invitado
// con semana de prueba marcada LÍNEA A MANO. La guarda vieja leía la
// tabla posts (source='trial') y la semana cáscara de PUERTA-SIN-GASTO
// no tiene filas al entrar el invitado: quedaba ciega y el asegurador
// generó para los invitados 122/123 al abrir la casa (posteos 704/705/
// 707, descartados a mano; gasto concept-shot fuera del tope demo).
// El corte: (1) una puerta nueva dentro de ensureTodayPost, ANTES de
// generar, que lee LA MARCA (trial_linea_mano) resuelta desde el uid —
// por el user_id atado o, si el barrido todavía no ató (la marca nace
// con user_id=0), por la identidad del invitado (guest_ig/guest_domain
// → claveCache → marcaActiva) — solo para invitados (is_guest), y
// fail-closed ante cualquier error de lectura (reason
// 'prueba_linea_mano'); (2) el catch de la guarda vieja dado vuelta a
// fail-closed (reason 'prueba_ilegible'). La garantía de un posteo por
// día para clientes reales no se toca.
// Uso: node test-lote-corte-asegurador.js [raíz-del-árbol] [--no-boot]
// Sin argumento usa el directorio de este archivo. El control sobre el
// árbol base (v1149) tiene que fallar exactamente en los puntos [FIX].
const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
// Las cadenas de require del árbol pueden inicializar la DB en
// ./data relativo al cwd: la suite jamás ensucia el árbol.
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-corte-data-'));

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

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

/* ── A · Censo de fuente ─────────────────────────────────────────── */
function seccionA() {
  seccion('A · censo de cableado (fuente)');
  const iEnsure = SERVER.indexOf('async function ensureTodayPost');
  ok(iEnsure >= 0, 'A0 existe ensureTodayPost (el asegurador del posteo del día)');
  const iGate = iEnsure >= 0 ? SERVER.indexOf("reason: 'prueba_linea_mano'", iEnsure) : -1;
  const iGen = iEnsure >= 0 ? SERVER.indexOf('await makeIdeaDraft(uid, idea)', iEnsure) : -1;
  ok(iGate > iEnsure && iGen > iGate, 'A1 [FIX] la puerta de la marca está DENTRO del asegurador y ANTES de generar (makeIdeaDraft)');
  const region = iEnsure >= 0 && iGen > iEnsure ? SERVER.slice(iEnsure, iGen) : '';
  ok(region.includes('trial_linea_mano WHERE user_id') && region.includes('guest_ig') && region.includes('marcaActiva(db, ck'),
    'A2 [FIX] la marca se resuelve desde el uid: user_id atado O identidad del invitado (guest_ig/guest_domain → marcaActiva)');
  ok(region.includes('is_guest'), 'A3 [FIX] la puerta solo frena a INVITADOS (is_guest): la garantía del cliente real no se toca');
  const iFin = iEnsure >= 0 ? SERVER.indexOf('\nfunction ritualLang', iEnsure) : -1;
  const cuerpo = iEnsure >= 0 && iFin > iEnsure ? SERVER.slice(iEnsure, iFin) : '';
  ok(!cuerpo.includes('el pipeline decide'), 'A4 [FIX] dentro del asegurador no queda NINGÚN catch «el pipeline decide»');
  ok(SERVER.includes("reason: 'prueba_ilegible'"), 'A5 [FIX] el catch de la guarda de prueba quedó dado vuelta a fail-closed (prueba_ilegible)');
  ok(SERVER.includes("reason: 'prueba_por_empezar'"), 'A6 la guarda de prueba de siempre sigue viva (prueba_por_empezar)');
  ok(cuerpo.includes("fuente: 'generado'") && cuerpo.includes('await makeIdeaDraft(uid, idea)'),
    'A7 la generación para usuarios sin marca sigue intacta (la garantía de un posteo por día no se desmanteló)');
  ok(SERVER.includes("const BUILD_ID = '20261105-v1150'"), 'A8 [FIX] BUILD_ID del lote (v1150)');
}

/* ── B · La función real, ejecutada (vm) ─────────────────────────── */
const lmReal = require(path.join(ROOT, 'linea-mano.js'));
const tlReal = require(path.join(ROOT, 'trial-lock.js'));
const F_ENSURE = (SERVER.match(/async function ensureTodayPost\(uid, tz, now\) \{[\s\S]*?\n\}/) || [])[0] || null;
const F_RITUAL = (SERVER.match(/function ritualPublicadoHoy\(uid, tz, dayKey\) \{[\s\S]*?\n\}/) || [])[0] || null;

function dayKeyInTzStub(d, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = {}; for (const p of parts) g[p.type] = p.value;
  return g.year + '-' + g.month + '-' + g.day;
}

const DDL_POSTS = `CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, scheduled_at TEXT, published_at TEXT, image_path TEXT, media_type TEXT, approval TEXT, source TEXT, user_stopped INTEGER DEFAULT 0, frenada INTEGER DEFAULT 0, created_at TEXT)`;
const DDL_POSTS_SIN_SOURCE = `CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, scheduled_at TEXT, published_at TEXT, image_path TEXT, media_type TEXT, approval TEXT, user_stopped INTEGER DEFAULT 0, frenada INTEGER DEFAULT 0, created_at TEXT)`;
const DDL_USERS = `CREATE TABLE users (id INTEGER PRIMARY KEY, is_guest INTEGER DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '', lang TEXT DEFAULT 'en')`;
const DDL_USERS_ROTA = `CREATE TABLE users (id INTEGER PRIMARY KEY, is_guest INTEGER DEFAULT 0)`;

function mkDb(opciones) {
  const o = opciones || {};
  const d = new DatabaseSync(':memory:');
  d.exec(o.usersRota ? DDL_USERS_ROTA : DDL_USERS);
  d.exec(o.postsSinSource ? DDL_POSTS_SIN_SOURCE : DDL_POSTS);
  lmReal.ensureSchema(d);
  return d;
}
function sembrarUsuario(d, id, isGuest, ig, domain) {
  d.prepare('INSERT INTO users (id, is_guest, guest_ig, guest_domain) VALUES (?, ?, ?, ?)').run(id, isGuest, ig || '', domain || '');
}
function sembrarMarca(d, key, userId, estado) {
  d.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, '', '', ?, ?, ?)`).run(key, userId || 0, estado || 'activa', Date.now());
}

function armarEnsure(dbCaso, spy) {
  const caja = {
    console,
    db: dbCaso,
    lineaMano: lmReal,
    trialLock: tlReal,
    ENSURE_TODAY_RUNNING: new Map(),
    morningPostPush: {
      dayKeyInTz: dayKeyInTzStub,
      pickTodayPost: (sched, tz, at) => {
        if (!Array.isArray(sched) || !sched.length) return null;
        const hoyK = dayKeyInTzStub(at || new Date(), tz);
        for (const r of sched) {
          if (!r.scheduled_at) continue;
          const d = new Date(String(r.scheduled_at).replace(' ', 'T'));
          if (!isNaN(d) && dayKeyInTzStub(d, tz) === hoyK) return r;
        }
        return null;
      },
    },
    planOrTrialOk: () => true,
    closedDaysOf: () => new Set(),
    weekdayOfYmd: (ymd) => new Date(ymd + 'T12:00:00Z').getUTCDay(),
    publishingStopped: () => false,
    dayStopGet: () => null,
    serieFeed: { piezaDuenaDelDia: () => null, diaDerivadoDe: () => null },
    programarHoy: (u, postId) => ({ id: postId, user_id: u, status: 'scheduled' }),
    shiftDays: (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); },
    quotaFor: () => ({ left: 5 }),
    ideaDiariaSintetica: () => ({ id: 1, title: 'Idea de la suite', brief: 'brief', format: 'image' }),
    makeIdeaDraft: async () => { spy.llamadas++; return { ok: true, post_id: 9000 + spy.llamadas }; },
  };
  vm.createContext(caja);
  vm.runInContext(F_ENSURE + '\n' + F_RITUAL + '\nthis.__ensure = ensureTodayPost;', caja);
  return caja.__ensure;
}

async function caso(opcionesDb, siembra, nombre) {
  const d = mkDb(opcionesDb);
  siembra(d);
  const spy = { llamadas: 0 };
  const ensure = armarEnsure(d, spy);
  const r = await ensure(42, 'America/New_York', new Date());
  try { d.close(); } catch (e) {}
  return { r, spy };
}

async function seccionB() {
  seccion('B · ensureTodayPost ejecutado de verdad (vm, espía en makeIdeaDraft)');
  if (!DatabaseSync) { ok(false, 'B0 node:sqlite disponible'); return; }
  ok(!!F_ENSURE && F_ENSURE.includes("fuente: 'generado'") && F_ENSURE.includes('ENSURE_TODAY_RUNNING.delete'),
    'B0 la extracción de la función es completa (llega hasta el final)');
  if (!F_ENSURE || !F_RITUAL) { for (const n of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9']) ok(false, n + ' (sin extracción)'); return; }

  // B1: marca activa ya atada por user_id (el barrido ya pasó).
  {
    const { r, spy } = await caso({}, (d) => { sembrarUsuario(d, 42, 1, 'suite.marca', ''); sembrarMarca(d, 'suite.marca', 42, 'activa'); });
    eq(spy.llamadas, 0, 'B1 [FIX] invitado con marca atada por user_id: el asegurador NO genera');
    eq(r && r.reason, 'prueba_linea_mano', 'B1 [FIX] el motivo es el nombrado (prueba_linea_mano)');
  }
  // B2: EL ESTADO DEL INCIDENTE — la marca nació con user_id=0 y el
  // barrido todavía no ató cuando el invitado abre la casa.
  {
    const { r, spy } = await caso({}, (d) => { sembrarUsuario(d, 42, 1, 'suite.marca', ''); sembrarMarca(d, 'suite.marca', 0, 'activa'); });
    eq(spy.llamadas, 0, 'B2 [FIX] marca SIN atar (user_id=0): la identidad del invitado la resuelve igual — NO genera');
    eq(r && r.reason, 'prueba_linea_mano', 'B2 [FIX] el motivo es el nombrado (prueba_linea_mano)');
  }
  // B3: identidad solo por dominio (entró sin @): la clave es web:<dom>.
  {
    const { r, spy } = await caso({}, (d) => { sembrarUsuario(d, 42, 1, '', 'suite.example.com'); sembrarMarca(d, 'web:suite.example.com', 0, 'activa'); });
    eq(spy.llamadas, 0, 'B3 [FIX] invitado solo-dominio con marca web: NO genera');
    eq(r && r.reason, 'prueba_linea_mano', 'B3 [FIX] el motivo es el nombrado (prueba_linea_mano)');
  }
  // B4: la lectura de la marca EXPLOTA (la fila del usuario no tiene
  // las columnas de identidad: esquema viejo) → fail-closed.
  {
    const { r, spy } = await caso({ usersRota: true }, (d) => { d.prepare('INSERT INTO users (id, is_guest) VALUES (42, 1)').run(); });
    eq(spy.llamadas, 0, 'B4 [FIX] error leyendo la marca: NO genera (fail-closed)');
    eq(r && r.reason, 'prueba_linea_mano', 'B4 [FIX] el motivo es el nombrado (prueba_linea_mano)');
  }
  // B5: invitado SIN marca → el comportamiento de hoy, intacto.
  {
    const { r, spy } = await caso({}, (d) => { sembrarUsuario(d, 42, 1, 'suite.libre', ''); });
    eq(spy.llamadas, 1, 'B5 invitado SIN marca: el asegurador genera como hoy');
    eq(r && r.fuente, 'generado', 'B5 el posteo sale por la vía de siempre (generado)');
  }
  // B6: cliente real sin marca → genera como hoy.
  {
    const { r, spy } = await caso({}, (d) => { sembrarUsuario(d, 42, 0, '', ''); });
    eq(spy.llamadas, 1, 'B6 cliente real sin marca: el asegurador genera como hoy');
    eq(r && r.fuente, 'generado', 'B6 la garantía de un posteo por día sigue viva');
  }
  // B7: cliente CONVERTIDO con la marca vieja todavía activa (el
  // barrido aún no la levantó): su garantía NO se toca.
  {
    const { r, spy } = await caso({}, (d) => { sembrarUsuario(d, 42, 0, 'suite.marca', ''); sembrarMarca(d, 'suite.marca', 42, 'activa'); });
    eq(spy.llamadas, 1, 'B7 convertido (is_guest=0) con marca vieja activa: genera — la garantía del cliente real no se toca');
    eq(r && r.fuente, 'generado', 'B7 el posteo sale por la vía de siempre (generado)');
  }
  // B8: marca levantada (cerrada) → no frena a nadie.
  {
    const { r, spy } = await caso({}, (d) => { sembrarUsuario(d, 42, 1, 'suite.marca', ''); sembrarMarca(d, 'suite.marca', 42, 'cerrada'); });
    eq(spy.llamadas, 1, 'B8 marca cerrada (levantada): el asegurador genera como hoy');
  }
  // B9: la guarda vieja con la lectura rota (posts sin columna source):
  // antes el catch tragaba y se generaba; ahora fail-closed.
  {
    const { r, spy } = await caso({ postsSinSource: true }, (d) => { sembrarUsuario(d, 42, 1, 'suite.libre', ''); });
    eq(spy.llamadas, 0, 'B9 [FIX] guarda de prueba con lectura rota: NO genera (el catch ya no traga)');
    eq(r && r.reason, 'prueba_ilegible', 'B9 [FIX] el motivo es el nombrado (prueba_ilegible)');
  }
}

/* ── C · Boot HTTP: el incidente, reproducido por la puerta real ─── */
async function seccionC() {
  seccion('C · boot aislado: entrada cáscara → apertura de la casa → el asegurador NO genera');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'C0 node:sqlite disponible para sembrar'); return; }
  const port = 20100 + Math.floor(Math.random() * 120);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-corte-boot-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-corte-boot-media-'));
  const childEnv = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN_TOK, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' };
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN', 'DEMO_AI_DAILY_CAP_USD', 'TRIAL_TEST_KEY']) delete childEnv[k];
  // La web del negocio, servida local: lectura pública sin costo.
  const webSrv = http.createServer((rq, rs) => {
    rs.writeHead(200, { 'Content-Type': 'text/html' });
    rs.end('<html><head><title>Corte Suite Bakery</title><meta name="description" content="Custom cakes made to order for weddings and parties"></head><body><h1>Corte Suite Bakery</h1><p>Custom cakes, wedding cakes and cupcakes made to order for weddings and parties.</p></body></html>');
  });
  await new Promise((r) => webSrv.listen(0, '127.0.0.1', r));
  const webUrl = 'http://127.0.0.1:' + webSrv.address().port + '/';
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  let vivo = false;
  try {
    let buildVivo = '';
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.status === 200) { vivo = true; const j = await resp.json().catch(() => ({})); buildVivo = String(j.build || ''); }
    }
    ok(vivo, 'C1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    eq(buildVivo, '20261105-v1150', 'C1 [FIX] el build vivo es el del lote (v1150)');
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
    const filasDe = (uid) => { try { return db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid).n; } catch (e) { return -1; } };

    // La entrada por la puerta nueva: semana cáscara + marca.
    const boundary = 'posta-suite-' + Date.now().toString(36);
    const fields = { business: 'Corte Suite Bakery', ig: 'corte.suite', category: 'otro', lang: 'en', web: webUrl, producto_estrella: 'Custom cakes', producto_mix: 'libre', country: 'US', tone: 'vos' };
    const parts = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, 'utf8'));
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const rStream = await fetch(base + '/api/trial/generate-stream', { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(parts), signal: AbortSignal.timeout(120000) }).catch(() => null);
    const txt = rStream ? await rStream.text().catch(() => '') : '';
    let out = null;
    for (const bloque of txt.split('\n\n')) {
      if (bloque.includes('event: done')) {
        const m = /data: (.*)/.exec(bloque);
        if (m) { try { out = JSON.parse(m[1]).out || null; } catch (e) {} }
      }
    }
    ok(!!out && out.puerta_sin_gasto === true, 'C3 la entrada crea la semana cáscara de la puerta sin gasto');
    const marca = (() => { try { return db.prepare('SELECT estado FROM trial_linea_mano WHERE cache_key = ?').get('corte.suite'); } catch (e) { return null; } })();
    ok(!!marca && marca.estado === 'activa', 'C4 la marca línea a mano quedó ACTIVA desde el nacimiento', marca);

    // La casa del invitado (el disparador del incidente: abrir la casa).
    const gs = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'corte.suite', lang: 'en', tz: 'America/New_York', device: 'suite-corte' }), signal: AbortSignal.timeout(60000) }).catch(() => null);
    const ck = gs ? cookieDe(gs) : '';
    const guest = db.prepare("SELECT id FROM users WHERE guest_ig = 'corte.suite'").get();
    const uid = guest ? Number(guest.id) : 0;
    ok(!!uid, 'C5 el invitado de la cáscara existe');
    // Espejo del estado de producción: el invitado real trae ADN
    // (descripción de su web) — sin ADN el handler ni dispara el
    // asegurador y la prueba no probaría nada.
    if (uid) { try { db.prepare('UPDATE profiles SET description = ? WHERE user_id = ?').run('Custom cakes made to order for weddings and parties in Austin', uid); } catch (e) {} }
    eq(filasDe(uid), 0, 'C6 antes de abrir la casa, el invitado no tiene NINGÚN posteo (la cáscara no crea filas)');

    // Apertura de la casa: /api/week/ensure dispara el asegurador en
    // segundo plano; su resultado queda en /api/week/last-result.
    if (ck) await fetch(base + '/api/week/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: '{}' }).catch(() => null);
    let ultimo = null;
    for (let i = 0; i < 24 && !ultimo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const lr = ck ? await fetch(base + '/api/week/last-result', { headers: { Cookie: ck } }).catch(() => null) : null;
      const j = lr ? await lr.json().catch(() => ({})) : {};
      if (j && j.has && j.result) ultimo = j.result;
    }
    ok(!!ultimo, 'C7 el asegurador corrió tras la apertura (hay resultado registrado)', ultimo);
    eq(ultimo && ultimo.reason, 'prueba_linea_mano', 'C7 [FIX] el asegurador frenó en la MARCA (prueba_linea_mano): no generó para el invitado marcado');
    eq(filasDe(uid), 0, 'C8 tras el ensure, el invitado sigue con CERO posteos (ningún 704/705 nuevo)');
    eq(costos(), 0, 'C9 el ledger de costos sigue en cero (cero gasto)');
    const cacheRow = db.prepare("SELECT payload FROM trial_cache WHERE ig = 'corte.suite'").get();
    const payloadVivo = cacheRow ? JSON.parse(cacheRow.payload) : null;
    ok(!!payloadVivo && payloadVivo.posts.every((p) => p.armando === true),
      'C10 los 3 lugares de la cáscara siguen en armado honesto (la prueba la arma bamboo)');

    // Segunda apertura: el freno se sostiene (sin cooldown que tape
    // una generación — los ceros mandan).
    if (ck) await fetch(base + '/api/week/ensure', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ck }, body: '{}' }).catch(() => null);
    await new Promise((r) => setTimeout(r, 2000));
    eq(filasDe(uid), 0, 'C11 segunda apertura: el invitado sigue con CERO posteos');
    eq(costos(), 0, 'C12 segunda apertura: el ledger sigue en cero');
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
  await seccionB();
  await seccionC();
  console.log(`\n== CORTE-ASEGURADOR: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
  process.exit(0);
})();
