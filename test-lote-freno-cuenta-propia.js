'use strict';

// =====================================================================
// LOTE FRENO-CUENTA-PROPIA — el software nunca más crea posteos para
// la cuenta propia (@posty.communitymanager, user 12)
// =====================================================================
// Caso real (Valentino, 19/11, TRES episodios en el día): borró el
// posteo de hoy de su cuenta y el asegurador lo repuso (724→725 a la
// madrugada; 730 a las 10:19, creado por ensureTodayPost sobre un día
// que quedó sin marca porque el 725 se descartó por la vía admin —
// que por diseño NO marca el día). DESCARTE-TERMINAL cerró el gesto
// del dueño, pero la clase no se cierra con marcas por día: se cierra
// a nivel CUENTA. La estrategia del feed propio es manual (tiras
// hechas a mano por bamboo); el software no genera para la casa.
//
// El lote (SPEC-FRENO §4):
//   · Helper esCuentaPropia(uid): id ∈ HOUSE_USER_IDS (env, default
//     '12') O ig_username normalizado ∈ {posty.communitymanager,
//     postycommunitymanager} (users o profiles). Fail-closed.
//   · ensureTodayPost: freno en el PASO DE GENERACIÓN (los pasos
//     1/1.5/2 no crean: reusan lo programado o promueven un borrador
//     existente — el gesto deliberado del dueño sobre su propio día
//     sigue mandando, contrato DESCARTE-TERMINAL C4).
//   · nextWeekEligible: no elegible (frena backfillThisWeek,
//     nextWeekSweep y retrySweepFailures en cadena).
//   · generateWeekDrafts: guarda a la entrada (llamadores que no
//     pasan por elegibilidad: /api/admin/generate-week, rebuild).
//   · maybeStartRebuild + autoArmWeek + /api/posts/generate-extras:
//     no corren para la casa.
//   · serieFeedSweep y rescateSemanaSweep: excluyen la identidad de
//     la casa de sus poblaciones.
//   · makeIdeaDraft: BACKSTOP — rechaza con 'cuenta_propia' salvo
//     origen manual expreso (el toque del dueño en «Hacelo», que
//     pasa manualExpreso; pieza-mano no pasa por acá).
//   · NO se toca: clientes/invitados, pieza-mano, el publicador.
//
// La suite corre en tres partes:
//   A · Estática: el helper y cada guarda existen en su camino.
//   B · vm: esCuentaPropia/nextWeekEligible reales contra una DB en
//       memoria (casa por id, casa por ig, cliente, fail-closed).
//   C · Boot real + HTTP: la cuenta espejo de la casa (12, ig en
//       profiles como en producción) y la espejo EN (21, solo por
//       ig) no generan por ninguna puerta; la prueba del borrado se
//       repite entera; el gesto «Que Posty lo arme» del dueño sobre
//       su propio día sigue andando; los controles generan/arman
//       como siempre; la mano (pieza-mano) sigue viva.
// Control: contra la base prístina la suite falla en los puntos
// marcados [FIX] (el mecanismo no existe y el 730 renace).
// Uso: node test-lote-freno-cuenta-propia.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + nombre); }
  else { mal++; console.log('  MAL ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const ROOT = __dirname;
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch (e) { return ''; } };
const TZ = 'America/New_York';
const ADMIN = 'suite-freno';

// ---------------------------------------------------------------------
// Modo siembra (parte C): cuentas espejo + invitado de la línea a mano.
// ---------------------------------------------------------------------
if (process.env.FRENO_SEED === '1') {
  const bcrypt = require('bcryptjs');
  const db = require('./db');
  require('./guest-trial').ensureSchema(db);
  const lineaMano = require('./linea-mano');
  lineaMano.ensureSchema(db);
  const hash = bcrypt.hashSync('suite-pass', 10);
  const ins = (sql, ...p) => db.prepare(sql).run(...p);
  const DESC = 'Posty es tu community manager: posteamos por tu negocio todos los días, con tu producto real.';
  const cuentas = [
    [12, 'dueno@posty.app', 'posty.communitymanager'],
    [21, 'espejo@posty.app', 'postycommunitymanager'],
    [13, 'control@posty.app', 'cafe.control'],
    [14, 'genera@posty.app', 'cafe.genera'],
    [15, 'login@posty.app', 'cafe.login'],
  ];
  for (const [id, email, ig] of cuentas) {
    ins(`INSERT INTO users (id, email, password_hash, plan, plan_status) VALUES (?, ?, ?, 'posty', 'active')`, id, email, hash);
    ins(`INSERT INTO profiles (user_id, business_name, ig_username, category, description) VALUES (?, 'Posty', ?, 'Marketing', ?)`, id, ig, DESC);
    ins(`INSERT INTO settings (user_id, timezone) VALUES (?, ?)`, id, TZ);
    ins(`INSERT INTO business_dna (user_id, dna_json) VALUES (?, ?)`, id, JSON.stringify({ producto_estrella: 'Posty, tu community manager' }));
  }
  // Invitado de la línea a mano (pieza-mano sigue viva, §5.5).
  ins(`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, guest_ig, guest_domain) VALUES (22, 'invitado@posty.app', ?, 'posty', 'trial', 1, 'casadeprueba', 'casadeprueba.com')`, hash);
  ins(`INSERT INTO profiles (user_id, business_name, ig_username, category, description) VALUES (22, 'Casa de Prueba', 'casadeprueba', 'Café', ?)`, DESC);
  ins(`INSERT INTO settings (user_id, timezone) VALUES (22, ?)`, TZ);
  const ck = lineaMano.claveCache('casadeprueba', 'casadeprueba.com');
  ins(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, 'casadeprueba', 'casadeprueba.com', 22, 'activa', ?)`, ck, Date.now());
  const payload = { engine: 25, business: 'Casa de Prueba', category: 'cafe', posts: [
    { type: 'image', image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', caption: 'Día 1 en armado', hashtags: '#cafe', armando: true },
    { type: 'image', image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', caption: 'Día 2 en armado', hashtags: '#cafe', armando: true },
    { type: 'image', image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', caption: 'Día 3 en armado', hashtags: '#cafe', armando: true },
  ] };
  ins(`INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)`, ck, JSON.stringify(payload), Date.now());
  // Borradores de hoy (la materia que los caminos automáticos moverían).
  const post = (id, uid, img, caption) =>
    ins(`INSERT INTO posts (id, user_id, status, media_type, image_path, caption, scheduled_at) VALUES (?, ?, 'draft', 'image', ?, ?, NULL)`, id, uid, img, caption);
  post(7313, 13, '/media/hoy-d.jpg', 'borrador de hoy (control: el ensure lo programa)');
  post(7321, 21, '/media/login-b.jpg', 'borrador espejo EN (el login NO lo arma)');
  post(7315, 15, '/media/login-a.jpg', 'borrador del control de login (sí se arma)');
  post(7322, 22, '/media/guest-a.jpg', 'pieza previa del invitado (la semana ya importó)');
  // Medios reales en MEDIA_DIR (DATA_DIR/media) para el gate de calidad.
  try {
    const mediaDir = path.join(process.env.DATA_DIR, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });
    for (const f of ['hoy-d.jpg', 'login-a.jpg', 'login-b.jpg', 'guest-a.jpg', 'hoy-b.jpg']) {
      execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1350:duration=1:rate=1', '-frames:v', '1', path.join(mediaDir, f)], { stdio: 'ignore' });
    }
  } catch (e) { console.log('[seed] media:', e.message); }
  console.log('[seed] cuentas 12/21/13/14/15 + invitado 22 sembradas');
  process.exit(0);
}

(async () => {
  // -------------------------------------------------------------------
  seccion('A · estática del lote');
  const SRV = read('server.js');
  const SCH = read('scheduler.js');
  t('A1 [FIX] existe el helper esCuentaPropia con la doble identidad (HOUSE_USER_IDS + igs de la casa)',
    SRV.includes('function esCuentaPropia(uid)') && SRV.includes('HOUSE_USER_IDS') && SRV.includes("'posty.communitymanager'") && SRV.includes("'postycommunitymanager'"));
  const iEnsure = SRV.indexOf('async function ensureTodayPost');
  const ensureSlice = iEnsure > 0 ? SRV.slice(iEnsure, iEnsure + 17000) : '';
  const iGuardEnsure = ensureSlice.indexOf("reason: 'cuenta_propia'");
  t('A2 [FIX] el asegurador frena la GENERACIÓN con cuenta_propia (antes de makeIdeaDraft, después del freno del dueño)',
    iGuardEnsure > 0 && iGuardEnsure < ensureSlice.indexOf('await makeIdeaDraft(uid, idea)')
    && iGuardEnsure > ensureSlice.indexOf('dia_frenado_dueno'));
  const iElig = SRV.indexOf('function nextWeekEligible');
  const eligSlice = iElig > 0 ? SRV.slice(iElig, iElig + 700) : '';
  t('A3 [FIX] nextWeekEligible devuelve cuenta_propia como primer gate',
    eligSlice.indexOf("reason: 'cuenta_propia'") > 0 && eligSlice.indexOf("reason: 'cuenta_propia'") < eligSlice.indexOf("'on_hold'"));
  const iGen = SRV.indexOf('async function generateWeekDrafts');
  const genSlice = iGen > 0 ? SRV.slice(iGen, iGen + 2600) : '';
  t('A4 [FIX] generateWeekDrafts frena a la entrada con cuenta_propia (created 0)',
    genSlice.includes("reason: 'cuenta_propia', created: 0"));
  const iReb = SRV.indexOf('function maybeStartRebuild');
  t('A5 [FIX] maybeStartRebuild no reconstruye para la casa',
    iReb > 0 && SRV.slice(iReb, iReb + 400).includes("reason: 'cuenta_propia'"));
  const iArm = SRV.indexOf('async function autoArmWeek');
  t('A6 [FIX] autoArmWeek no corre para la casa',
    iArm > 0 && SRV.slice(iArm, iArm + 700).includes("reason: 'cuenta_propia'"));
  const iExt = SRV.indexOf("app.post('/api/posts/generate-extras'");
  t('A7 [FIX] la ruta de extras automáticos frena para la casa',
    iExt > 0 && SRV.slice(iExt, iExt + 900).includes('esCuentaPropia(uid)'));
  const iSerie = SRV.indexOf('function serieFeedSweep');
  const iRescate = SRV.indexOf('async function rescateSemanaSweep');
  t('A8 [FIX] los barridos excluyen la identidad de la casa (serieFeedSweep por uid · rescateSemanaSweep por ig)',
    iSerie > 0 && SRV.slice(iSerie, iSerie + 900).includes('esCuentaPropia(a.user_id)')
    && iRescate > 0 && SRV.slice(iRescate, iRescate + 1200).includes('igEsDeLaCasa(ig)'));
  const iMake = SRV.indexOf('async function makeIdeaDraft');
  t('A9 [FIX] makeIdeaDraft tiene el backstop cuenta_propia con exención manualExpreso, y «Hacelo» del dueño la pasa',
    iMake > 0 && SRV.slice(iMake, iMake + 800).includes("if (!(opts && opts.manualExpreso) && esCuentaPropia(uid))")
    && SRV.includes('makeIdeaDraft(uid, idea, { manualExpreso: true })'));
  t('A10 la push matutina comparte el asegurador frenado (scheduler inyecta ensureTodayPost)',
    SCH.includes('ensureTodayPost'));
  t('A11 el publicador NO ganó la guarda (scheduler.js sin esCuentaPropia: publica lo agendado, como siempre)',
    !SCH.includes('esCuentaPropia'));
  const iPieza = SRV.indexOf("app.post('/api/admin/trial/pieza-mano'");
  t('A12 la puerta de la mano (pieza-mano) NO ganó la guarda: la línea a mano sigue viva',
    iPieza > 0 && !SRV.slice(iPieza, iPieza + 6000).includes('esCuentaPropia'));

  // -------------------------------------------------------------------
  seccion('B · vm: identidad y elegibilidad reales');
  const { DatabaseSync } = require('node:sqlite');
  const vm = require('vm');
  try {
    const extraer = (nombre) => {
      const i = SRV.indexOf('function ' + nombre + '(');
      if (i < 0) return null;
      const j = SRV.indexOf('\n}', i);
      return j > i ? SRV.slice(i, j + 2) : null;
    };
    const fIg = extraer('igEsDeLaCasa');
    const fEs = extraer('esCuentaPropia');
    const fElig = extraer('nextWeekEligible');
    t('B0 las tres funciones se extraen del server real', !!(fIg && fEs && fElig));
    const d = new DatabaseSync(':memory:');
    d.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, ig_username TEXT DEFAULT '');
            CREATE TABLE profiles (user_id INTEGER, ig_username TEXT DEFAULT '');
            CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, week_key TEXT, status TEXT);
            INSERT INTO users (id, ig_username) VALUES (12, ''), (21, ''), (13, ''), (55, '');
            INSERT INTO profiles (user_id, ig_username) VALUES (12, 'posty.communitymanager'), (21, 'postycommunitymanager'), (13, 'cafe.control'), (55, '');`);
    const ctx = {
      db: d, process, console,
      HOUSE_IGS: new Set(['posty.communitymanager', 'postycommunitymanager']),
      userOnHold: () => false, planOrTrialOk: () => true, activeRecently: () => true, pipelineAliveRecently: () => true,
    };
    vm.createContext(ctx);
    vm.runInContext(fIg + '\n' + fEs + '\n' + fElig + '\nthis.__x = { esCuentaPropia, nextWeekEligible, igEsDeLaCasa };', ctx);
    const X = ctx.__x;
    t('B1 [FIX] la casa por ID (12, como en producción)', X.esCuentaPropia(12) === true);
    t('B2 [FIX] la casa por IG solo (21, espejo EN sin punto)', X.esCuentaPropia(21) === true);
    t('B3 el cliente no es casa (13)', X.esCuentaPropia(13) === false);
    t('B4 ig con @ y mayúsculas normaliza (@PostyCommunitymanager)', X.igEsDeLaCasa('@PostyCommunitymanager') === true);
    const e12 = X.nextWeekEligible(12, '2026-11-23');
    const e21 = X.nextWeekEligible(21, '2026-11-23');
    const e13 = X.nextWeekEligible(13, '2026-11-23');
    t('B5 [FIX] elegibilidad semanal: la casa queda fuera con su reason', e12.ok === false && e12.reason === 'cuenta_propia' && e21.ok === false && e21.reason === 'cuenta_propia', JSON.stringify({ e12, e21 }));
    t('B6 elegibilidad semanal: el cliente pasa como siempre', e13.ok === true, JSON.stringify(e13));
    const ctxRoto = { db: { prepare() { throw new Error('db caída'); } }, process, console, HOUSE_IGS: ctx.HOUSE_IGS, userOnHold: () => false, planOrTrialOk: () => true, activeRecently: () => true, pipelineAliveRecently: () => true };
    vm.createContext(ctxRoto);
    vm.runInContext(fIg + '\n' + fEs + '\nthis.__y = { esCuentaPropia };', ctxRoto);
    t('B7 [FIX] fail-closed: identidad ilegible → el camino frena (true)', ctxRoto.__y.esCuentaPropia(55) === true);
  } catch (e) {
    t('B excepción: ' + e.message, false);
  }

  // -------------------------------------------------------------------
  seccion('C · boot real: la casa no genera por ninguna puerta');
  const { dayKeyInTz } = require('./morning-post-push');
  const hoy = dayKeyInTz(new Date(), TZ);
  const DATA = fs.mkdtempSync(path.join(ROOT, '.tmp-freno-'));
  const PORT = 18783;
  const BASE = `http://127.0.0.1:${PORT}`;
  execFileSync('node', [__filename], { cwd: ROOT, env: { ...process.env, FRENO_SEED: '1', DATA_DIR: DATA }, stdio: 'pipe' });
  // C8 (adelantado): autoArmWeek solo se dispara desde signup/login
  // CON semana importada — no hay puerta HTTP para invocarlo suelto.
  // Se lo llama como la función exportada que es, en un proceso hijo
  // con la misma DB todavía sin servidor principal: la casa (21) y el
  // control (15), uno tras otro.
  let armOut = '';
  try {
    armOut = execFileSync('node', ['-e', `
      const srv = require(process.env.SRV_PATH);
      (async () => {
        await new Promise((r) => setTimeout(r, 2500));
        const a = await srv.autoArmWeek(21, 'suite-freno');
        const b = await srv.autoArmWeek(15, 'suite-freno');
        console.log('ARM21 ' + JSON.stringify(a));
        console.log('ARM15 ' + JSON.stringify(b && { ok: b.ok, reason: b.reason, n: (b.scheduled || []).length }));
        process.exit(0);
      })().catch((e) => { console.log('ARM-ERROR ' + e.message); process.exit(0); });
    `], { cwd: ROOT, env: { ...process.env, DATA_DIR: DATA, PORT: '18784', SRV_PATH: path.join(ROOT, 'server.js'), OPENAI_API_KEY: '' }, timeout: 280000, maxBuffer: 8 * 1024 * 1024 }).toString();
  } catch (e) { armOut = 'ARM-SPAWN-ERROR ' + e.message + ' ' + (e.stdout || '').toString().slice(-300); }
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: DATA, PORT: String(PORT), ADMIN_TOKEN: ADMIN, OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  const dbFile = path.join(DATA, 'posta.db');
  const q1 = (sql, ...p) => { const d = new DatabaseSync(dbFile, { readOnly: true }); try { return d.prepare(sql).get(...p); } finally { d.close(); } };
  const wRun = (sql, ...p) => { const d = new DatabaseSync(dbFile); try { return d.prepare(sql).run(...p); } finally { d.close(); } };
  const nPosts = (uid) => q1('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?', uid).n;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitBoot(tries = 90) {
    for (let i = 0; i < tries; i++) {
      try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
      await sleep(500);
    }
    return false;
  }
  async function login(email) {
    const rr = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'suite-pass' }),
    });
    const cookie = (rr.headers.get('set-cookie') || '').split(';')[0];
    return { status: rr.status, cookie };
  }
  async function api(cookie, method, p, body) {
    const rr = await fetch(BASE + p, {
      method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await rr.json(); } catch (e) {}
    return { status: rr.status, data };
  }
  async function adminApi(method, p, body) {
    const rr = await fetch(`${BASE}${p}${p.includes('?') ? '&' : '?'}token=${ADMIN}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await rr.json(); } catch (e) {}
    return { status: rr.status, data };
  }
  async function lastResult(cookie, despuesDe) {
    for (let i = 0; i < 60; i++) {
      const r = await api(cookie, 'GET', '/api/week/last-result');
      if (r.data && r.data.has && r.data.result && (r.data.result.at || 0) >= despuesDe) return r.data.result;
      await sleep(400);
    }
    return null;
  }
  try {
    t('C0 boot: el server levanta', await waitBoot(), srvLog.slice(-400));
    const ses12 = await login('dueno@posty.app');
    const ses21 = await login('espejo@posty.app');
    const ses13 = await login('control@posty.app');
    const ses14 = await login('genera@posty.app');
    const ses15 = await login('login@posty.app');
    t('C0b login de las cinco cuentas', !!(ses12.cookie && ses21.cookie && ses13.cookie && ses14.cookie && ses15.cookie),
      `12:${ses12.status} 21:${ses21.status} 13:${ses13.status} 14:${ses14.status} 15:${ses15.status}`);
    const loginAt = Date.now();

    // C1 · la casa (12), día vacío: el asegurador NO genera.
    let t0 = Date.now();
    await api(ses12.cookie, 'POST', '/api/week/ensure', {});
    const lr12 = await lastResult(ses12.cookie, t0);
    t('C1 [FIX] ensure de la casa responde cuenta_propia (no genera reemplazo)',
      !!lr12 && lr12.reason === 'cuenta_propia', JSON.stringify(lr12));
    t('C1b la casa sigue con cero posteos', nPosts(12) === 0);
    await api(ses12.cookie, 'GET', '/api/ritual/hoy');
    await sleep(1500);
    t('C1c ni el ritual crea nada para la casa', nPosts(12) === 0);

    // C2 · la casa por IG (21, espejo EN): no CREA nada. Su borrador
    // sembrado es una pieza EXISTENTE: el paso 2 del asegurador lo
    // promueve (no es generación — es el mismo comportamiento que el
    // gesto del dueño preserva, C6); lo que la guarda corta es que
    // nazca un posteo nuevo.
    t0 = Date.now();
    await api(ses21.cookie, 'POST', '/api/week/ensure', {});
    const lr21 = await lastResult(ses21.cookie, t0);
    t('C2 [FIX] la espejo EN no genera: tras el ensure sigue teniendo UN solo posteo (el sembrado)',
      nPosts(21) === 1, JSON.stringify({ lr: lr21, n: nPosts(21) }));

    // C3 · control con borrador: el ensure lo programa como siempre.
    t0 = Date.now();
    await api(ses13.cookie, 'POST', '/api/week/ensure', {});
    const lr13 = await lastResult(ses13.cookie, t0);
    const p7313 = q1('SELECT status FROM posts WHERE id = 7313');
    t('C3 control: sin freno, el ensure programa el borrador de hoy',
      !!lr13 && lr13.ok === true && p7313 && p7313.status === 'scheduled',
      JSON.stringify({ lr: lr13, post: p7313 }));

    // C4 · control sin borrador: el asegurador INTENTA generar (su
    // reason no es el freno; sin clave de IA corta por no_key/ai_error).
    t0 = Date.now();
    await api(ses14.cookie, 'POST', '/api/week/ensure', {});
    const lr14 = await lastResult(ses14.cookie, t0);
    t('C4 control: la generación no está frenada por la guarda (reason ≠ cuenta_propia)',
      !!lr14 && lr14.reason !== 'cuenta_propia', JSON.stringify(lr14));

    // C5 · LA PRUEBA DEL BORRADO (la de esta noche, repetida, sobre
    // la espejo 21): su posteo de hoy (promovido en C2) → el dueño lo
    // ELIMINA → cadena completa (home + ritual + motor semanal en
    // C7) → cero posteos nuevos. (Sobre 12 no se puede repetir acá:
    // su último resultado fallido deja a /api/week/ensure en cooldown
    // anti-loop por 10 min — comportamiento de siempre, ajeno al
    // lote; la cuenta 21 quedó con resultado ok y sin cooldown.)
    wRun(`INSERT INTO posts (user_id, status, media_type, image_path, caption, scheduled_at) VALUES (21, 'draft', 'image', '/media/hoy-b.jpg', 'borrador de hoy (vector de resurrección)', NULL)`);
    const id7323 = q1(`SELECT id FROM posts WHERE user_id = 21 AND caption LIKE '%vector de resurrección%'`).id;
    const rd = await api(ses21.cookie, 'DELETE', '/api/posts/7321');
    t('C5 el dueño elimina el posteo de hoy (200)', rd.status === 200, JSON.stringify(rd.data).slice(0, 160));
    const stop21 = q1('SELECT * FROM day_stops WHERE user_id = 21 AND day_key = ?', hoy);
    t('C5b el día quedó frenado por el dueño (dueno_descarte, DESCARTE-TERMINAL intacto)',
      !!stop21 && stop21.origen === 'dueno_descarte', JSON.stringify(stop21));
    t0 = Date.now();
    await api(ses21.cookie, 'POST', '/api/week/ensure', {});
    const lr21c = await lastResult(ses21.cookie, t0);
    const p7323 = q1('SELECT status FROM posts WHERE id = ?', id7323);
    t('C5c [FIX] el ensure no resucita el eliminado: dia_frenado_dueno y cero posteos nuevos',
      !!lr21c && lr21c.reason === 'dia_frenado_dueno' && nPosts(21) === 1 && p7323 && p7323.status === 'draft',
      JSON.stringify({ lr: lr21c, post: p7323, n: nPosts(21) }));
    await api(ses21.cookie, 'GET', '/api/ritual/hoy');
    await sleep(1200);
    t('C5d ni el ritual resucita el eliminado', nPosts(21) === 1 && q1('SELECT status FROM posts WHERE id = ?', id7323).status === 'draft');

    // C6 · el gesto deliberado del dueño sobre SU día sigue mandando:
    // «Que Posty lo arme» limpia el stop y el borrador EXISTENTE se
    // programa (no se genera nada nuevo: el conteo no cambia).
    t0 = Date.now();
    await api(ses21.cookie, 'POST', '/api/week/ensure', { armar: 1 });
    const lr21d = await lastResult(ses21.cookie, t0);
    const p7323b = q1('SELECT status FROM posts WHERE id = ?', id7323);
    const stop21b = q1('SELECT * FROM day_stops WHERE user_id = 21 AND day_key = ?', hoy);
    t('C6 «Que Posty lo arme» rearma el día del dueño con su borrador existente (sin crear)',
      !!lr21d && lr21d.ok === true && p7323b && p7323b.status === 'scheduled' && !stop21b && nPosts(21) === 1,
      JSON.stringify({ lr: lr21d, post: p7323b, stop: stop21b, n: nPosts(21) }));

    // C7 · MOTOR B por la puerta admin: generate-week no genera para
    // la casa; para el control el pipeline corre (sin el freno).
    const logAntes = srvLog.length;
    await adminApi('POST', '/api/admin/generate-week', { user_id: 12 });
    await sleep(3000);
    t('C7 [FIX] generate-week admin: la casa frena en el pipeline (log cuenta_propia, cero posteos nuevos)',
      srvLog.slice(logAntes).includes('[pipeline:admin-rescue] usuario 12: cuenta propia') && nPosts(12) === 0,
      srvLog.slice(logAntes).slice(0, 300));
    const logAntes14 = srvLog.length;
    await adminApi('POST', '/api/admin/generate-week', { user_id: 14 });
    await sleep(3000);
    const log14 = srvLog.slice(logAntes14);
    t('C7b generate-week admin: el control NO frena por la guarda (su corte es la IA, no cuenta_propia)',
      log14.includes('[admin-rescue] usuario 14:') && !log14.includes('cuenta_propia'),
      log14.slice(0, 300));

    // C8 · AUTO-ARMADO (proceso hijo previo al boot, ver arriba):
    // autoArmWeek(21) frenó con cuenta_propia y su borrador quedó
    // intacto; autoArmWeek(15) armó la semana del control (su
    // borrador se programó y/o nacieron los extras).
    const p7315 = q1('SELECT status FROM posts WHERE id = 7315');
    t('C8 [FIX] autoArmWeek de la casa: frena con cuenta_propia (la función exportada, en el hijo)',
      armOut.includes('ARM21 {"ok":false,"reason":"cuenta_propia"'), armOut.slice(0, 300));
    t('C8b autoArmWeek del control: la semana se armó sola como siempre (extras o programación)',
      (p7315 && p7315.status === 'scheduled') || nPosts(15) > 1,
      JSON.stringify({ n: nPosts(15), post: p7315, arm: armOut.slice(0, 200) }));

    // C9 · BACKSTOP: la vía admin de ideas no crea para la casa; el
    // control pasa el backstop (corta después por falta de clave).
    wRun(`INSERT INTO posty_ideas (user_id, title, brief, status) VALUES (12, 'Idea de la casa', 'brief de prueba', 'pending')`);
    const idea12 = q1('SELECT id FROM posty_ideas WHERE user_id = 12 ORDER BY id DESC LIMIT 1');
    const rm12 = await adminApi('POST', '/api/admin/ideas/make', { idea_id: idea12.id });
    t('C9 [FIX] backstop: /api/admin/ideas/make para la casa devuelve cuenta_propia y no crea',
      rm12.data && rm12.data.ok === false && rm12.data.reason === 'cuenta_propia' && nPosts(12) === 0,
      JSON.stringify(rm12.data).slice(0, 200));
    wRun(`INSERT INTO posty_ideas (user_id, title, brief, status) VALUES (13, 'Idea del control', 'brief de prueba', 'pending')`);
    const idea13 = q1('SELECT id FROM posty_ideas WHERE user_id = 13 ORDER BY id DESC LIMIT 1');
    const rm13 = await adminApi('POST', '/api/admin/ideas/make', { idea_id: idea13.id });
    t('C9b backstop: el control pasa la guarda (su corte es otro: sin clave de IA)',
      rm13.data && rm13.data.reason !== 'cuenta_propia', JSON.stringify(rm13.data).slice(0, 200));

    // C10 · LA MANO SIGUE VIVA: pieza-mano sobre el invitado marcado
    // crea su posteo del día 1 por el camino de siempre.
    const imgB64 = execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=1080x1350:duration=1:rate=1', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { maxBuffer: 4 * 1024 * 1024 });
    const nAntes22 = nPosts(22);
    const rp = await adminApi('POST', '/api/admin/trial/pieza-mano', {
      ig: 'casadeprueba', domain: 'casadeprueba.com', dia: 1,
      media: 'data:image/jpeg;base64,' + Buffer.from(imgB64).toString('base64'),
      caption: 'LA PIEZA A MANO DEL DÍA 1',
    });
    const pieza22 = q1(`SELECT id, status FROM posts WHERE user_id = 22 AND caption LIKE '%PIEZA A MANO%' ORDER BY id DESC LIMIT 1`);
    t('C10 pieza-mano: la carga a mano crea el posteo del invitado (la guarda no la toca)',
      rp.status === 200 && rp.data && rp.data.ok === true && !!pieza22 && nPosts(22) === nAntes22 + 1,
      JSON.stringify({ status: rp.status, data: rp.data, pieza: pieza22 }).slice(0, 300));
  } catch (e) {
    t('C excepción: ' + e.message, false, srvLog.slice(-300));
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await sleep(600);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\nTOTAL: ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('suite:', e); process.exit(1); });
