'use strict';
/*
 * LOTE PUSH-DESTINO (22/11) — el toque de cada push aterriza en la
 * pantalla que el push anuncia.
 *
 * Caso fundante (captura del dueño, 22/11 19:02): apretó la push del
 * freno de los 30 minutos («tocá para verlo o frenarlo») y la app lo
 * dejó en Inicio (el feed), no en el posteo. Causa raíz doble:
 * (1) pzNativeRoute rechazaba toda URL con query string → el toque
 * nativo caía al default oficina → Inicio; (2) la URL del freno
 * (#/app/semana?post=<id>) no tenía consumidor: ningún código abría
 * ese posteo.
 *
 * Qué afirma esta suite, por clase:
 *  A · estática: sintaxis + las URLs nuevas en los emisores y la
 *      vieja del freno fuera.
 *  B · pzNativeRoute en VM: acepta las query de las pushes vivas,
 *      sigue rechazando URL externas y basura al default.
 *  C · emisores con pushFn capturador (node:sqlite): freno (manual,
 *      autopilot, historia) → #/app/post/<id>; recibo de prueba →
 *      inicio (intacto); problema (sendMissedPush) → #/app/post/<id>
 *      (intacto); fallo de publicación → schedule (intacto); carta
 *      del domingo → analisis (intacto y DECLARADO sin superficie en
 *      el CENSO: su arreglo es de otro lote); primer posteo pago →
 *      #/app/post/<id>.
 *  D · Chromium contra el server real: se SIGUE el toque de cada
 *      clase hasta la pantalla — el freno abre SU posteo con Aceptar
 *      y el menú del freno operables; la URL vieja del freno (ya en
 *      los teléfonos) también aterriza en el posteo, por la vía web
 *      y por la nativa; el publicado abre su detalle con el
 *      permalink; la tanda abre la bandeja; el trabajo listo baja al
 *      mensaje anunciado; el aviso al dueño traspasa a la consola
 *      con el cliente y la consola abre su ficha; la barra inferior
 *      queda íntegra (observación (b) de la captura); y el posteo de
 *      OTRO dueño responde «no existe» (la sesión manda).
 *
 * Control contra la base prístina: B2/B3, C1–C3, D2, D3, D7 y D8
 * reproducen el defecto (el toque del freno cae en el feed).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
function buscarPuerto() {
  for (let p = 36600; p < 36800; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}
function puertoLibre(p) {
  try {
    const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    return !out.includes(':' + p + ' ');
  } catch (e) { return true; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------
seccion('A · Estática');
for (const f of ['public/app.js', 'public/conserje.js', 'server.js', 'scheduler.js', 'upcoming-notice.js', 'magia-postpago.js']) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)]); t('A0 node --check ' + f, true); }
  catch (e) { t('A0 node --check ' + f, false, String(e.message).slice(0, 160)); }
}
const appJs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const unJs = fs.readFileSync(path.join(ROOT, 'upcoming-notice.js'), 'utf8');
const schJs = fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8');
const magJs = fs.readFileSync(path.join(ROOT, 'magia-postpago.js'), 'utf8');
const srvJs = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const consJs = fs.readFileSync(path.join(ROOT, 'public/conserje.js'), 'utf8');

t('A1 el freno ya no emite la URL sin consumidor (semana?post=)',
  !unJs.includes('url: `/#/app/semana?post=${p.id}`'));
t('A2 el freno emite el detalle del posteo',
  unJs.includes('url: `/#/app/post/${p.id}`'));
t('A3 la push de publicado emite el detalle del posteo (×2 payloads)',
  (schJs.match(/url: `\/\#\/app\/post\/\$\{post\.id\}`/g) || []).length === 2);
t('A4 el primer posteo pago emite el detalle; el permalink queda en el chat',
  magJs.includes("const link = `/#/app/post/${post.id}`;") && magJs.includes('acá está: ${igLink}'));
t('A5 el aviso al dueño lleva user y post a la consola',
  srvJs.includes('`/#/app/conserje?user=${Number(uid)}${post && post.id ? `&post=${Number(post.id)}` : \'\'}`'));
t('A6 la consola consume el deep link (deepUser/deepPost + gotoFicha)',
  consJs.includes("Number(qs.get('user') || 0)") && consJs.includes('gotoFicha(deepUser, deepPost || null)'));
t('A7 pzNativeRoute acepta query (la regex nueva está en el bundle)',
  appJs.includes('(\\?[A-Za-z0-9&=%._~+-]*)?'));
t('A8 la redirección semana honra ?post= y el ancla acepta Inicio',
  appJs.includes("? '#/app/post/' + _semPost") && appJs.includes("['#/app/chat', '#/app/inicio'].includes"));

// ---------------------------------------------------------------------
seccion('B · pzNativeRoute (el portero del toque nativo)');
{
  const m = appJs.match(/function pzNativeRoute\(url, isShell\) \{[\s\S]*?\n\}/);
  t('B0 pzNativeRoute se extrae del bundle', !!m);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.__f = pzNativeRoute;', ctx);
  const f = ctx.__f;
  t('B1 rutas sin query: intactas',
    f('/#/app/post/742', true) === '#/app/post/742' && f('/#/app/inicio', false) === '#/app/inicio');
  t('B2 la URL del freno (con query) ya NO cae al default',
    f('/#/app/semana?post=742', true) === '#/app/semana?post=742');
  t('B3 las query vivas pasan: plan, user+post, item, fotos, msg',
    f('/#/app/ajustes?plan=1', true) === '#/app/ajustes?plan=1'
    && f('/#/app/conserje?user=86&post=742', true) === '#/app/conserje?user=86&post=742'
    && f('/#/app/bandeja?item=5', true) === '#/app/bandeja?item=5'
    && f('/#/app/schedule?fotos=semana', true) === '#/app/schedule?fotos=semana'
    && f('/#/app/chat?msg=123', true) === '#/app/chat?msg=123');
  t('B4 lo externo y la basura siguen rechazados al default',
    f('https://www.instagram.com/p/ABC/', true) === '#/app/oficina'
    && f('javascript:alert(1)', true) === '#/app/oficina'
    && f('', false) === '#/app/inicio'
    && f(null, true) === '#/app/oficina'
    && f('/#/app/post/1?x=<script>', true) === '#/app/oficina'
    && f('/otra/ruta', true) === '#/app/oficina');
}

// ---------------------------------------------------------------------
seccion('C · Emisores (pushFn capturador)');
const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-c-'));
const dbC = new DatabaseSync(path.join(dirC, 't.db'));
dbC.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'pro', plan_status TEXT DEFAULT 'active',
  lang TEXT DEFAULT 'es', client_name TEXT DEFAULT '', trust_level INTEGER DEFAULT 0, autopilot_prenotify INTEGER DEFAULT 0,
  is_guest INTEGER DEFAULT 0, trial_ends_at INTEGER DEFAULT 0, guest_ig TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE settings (user_id INTEGER, demo_mode INTEGER DEFAULT 0, timezone TEXT DEFAULT 'America/New_York', image_base_url TEXT DEFAULT '');
CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, caption TEXT DEFAULT '', hashtags TEXT DEFAULT '',
  image_path TEXT DEFAULT '', scheduled_at TEXT, status TEXT DEFAULT 'scheduled', approval TEXT DEFAULT 'pending',
  auto_published INTEGER DEFAULT 0, autopilot_notified INTEGER DEFAULT 0, needs_review INTEGER DEFAULT 0,
  media_type TEXT DEFAULT 'image', created_at TEXT DEFAULT (datetime('now')), published_at TEXT, ig_permalink TEXT DEFAULT '');
CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, session_id TEXT DEFAULT '', name TEXT, props TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');
CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, created_at INTEGER, payload TEXT DEFAULT '{}');`);
const inMin = (n) => new Date(Date.now() + n * 60000).toISOString().replace('T', ' ').slice(0, 19);

async function cFreno() {
  const UN = require(path.join(ROOT, 'upcoming-notice'));
  dbC.prepare('INSERT INTO users (id, email, trust_level, client_name) VALUES (1, ?, 1, ?)').run('auto@test.dev', 'Auto');
  dbC.prepare('INSERT INTO settings (user_id, timezone) VALUES (1, ?)').run('America/New_York');
  dbC.prepare('INSERT INTO users (id, email, trust_level, client_name) VALUES (2, ?, 0, ?)').run('manual@test.dev', 'Manual');
  dbC.prepare('INSERT INTO settings (user_id, timezone) VALUES (2, ?)').run('America/New_York');
  const insP = dbC.prepare('INSERT INTO posts (id, user_id, caption, image_path, scheduled_at, approval, auto_published, media_type) VALUES (?,?,?,?,?,?,?,?)');
  insP.run(201, 2, 'Posteo manual del freno', '/media/f.jpg', inMin(30), 'pending', 0, 'image');
  insP.run(202, 1, 'Posteo autopiloto del freno', '/media/f.jpg', inMin(30), 'pending', 1, 'image');
  insP.run(203, 2, 'Historia del freno', '/media/f.jpg', inMin(30), 'pending', 0, 'story');
  const caps = [];
  await UN.processUpcomingNotices(dbC, { pushFn: async (uid, payload) => { caps.push(payload); return { ok: true, sent: 1 }; }, emailFn: async () => ({ ok: true }) });
  const porPost = {};
  for (const c of caps) { const mm = String(c.url || '').match(/(\d+)$/); if (mm) porPost[mm[1]] = c.url; }
  t('C1 freno manual → el detalle de SU posteo', porPost['201'] === '/#/app/post/201', JSON.stringify(caps.map((c) => c.url)));
  t('C2 freno autopilot → el detalle de SU posteo', porPost['202'] === '/#/app/post/202');
  t('C3 freno de historia → el detalle de SU posteo', porPost['203'] === '/#/app/post/203');
}

async function cTrial() {
  const TD = require(path.join(ROOT, 'trial-day-push'));
  const now = Date.parse('2026-11-24T15:00:00Z'); // 10:00 EST
  dbC.prepare('INSERT INTO users (id, email, is_guest, trial_ends_at, guest_ig, lang) VALUES (9, ?, 1, ?, ?, ?)').run('guest@test.dev', now + 86400000, 'negocioqa', 'es');
  dbC.prepare('INSERT INTO settings (user_id, timezone) VALUES (9, ?)').run('America/New_York');
  dbC.prepare('INSERT INTO push_subscriptions (user_id, endpoint) VALUES (9, ?)').run('https://push.test/9');
  dbC.prepare('INSERT INTO trial_cache (ig, created_at, payload) VALUES (?, ?, ?)').run('negocioqa', Date.parse('2026-11-23T15:00:00Z'), '{}');
  dbC.prepare("INSERT INTO posts (id, user_id, scheduled_at, status) VALUES (301, 9, '2026-11-24T19:00:00.000Z', 'scheduled')").run();
  const caps = [];
  const r = await TD.sendTrialDayPushes(dbC, { now, pushFn: async (uid, payload) => { caps.push(payload); return { ok: true, sent: 1 }; } });
  t('C4 recibo día 2 de la prueba → el posteo de hoy (regla 27/11), intacto',
    r.sent === 1 && caps.length === 1 && caps[0].url === '/#/app/post/301', JSON.stringify({ r, caps: caps.map((c) => c.url) }));
}

async function cPushJs() {
  const push = require(path.join(ROOT, 'push'));
  push.initPush(dbC);
  const caps = [];
  const sendFn = async (uid, payload) => { caps.push(payload); return { ok: true, sent: 1, subs: 1, pruned: 0, results: [] }; };
  const rf = await push.notifyPostFailed(1, { sendFn });
  t('C5 fallo de publicación → la semana (el borrador vive ahí), intacto',
    rf && rf.ok === true && caps.length === 1 && caps[0].url === '/#/app/schedule', JSON.stringify(caps.map((c) => c.url)));
  caps.length = 0;
  const rl = await push.notifySundayLetter(1, { sendFn, force: true });
  t('C6 carta del domingo → su URL declarada (analisis; superficie caída, ver CENSO)',
    rl && rl.ok === true && caps.length === 1 && caps[0].url === '/#/app/analisis', JSON.stringify(caps.map((c) => c.url)));
}

async function cMissedYMagia() {
  const push = require(path.join(ROOT, 'push'));
  const caps = [];
  const original = push.sendPush;
  push.sendPush = async (uid, payload) => { caps.push(payload); return { ok: true, sent: 1 }; };
  try {
    const NP = require(path.join(ROOT, 'notify-push'));
    const rm = await NP.sendMissedPush(dbC, { id: 909, user_id: 1, image_path: '', scheduled_at: inMin(60) }, 'sin aprobación');
    t('C7 problema (no salió por falta de aprobación) → ese posteo, intacto',
      rm && rm.ok === true && caps.length === 1 && caps[0].url === '/#/app/post/909', JSON.stringify(caps.map((c) => c.url)));
    caps.length = 0;
    dbC.prepare('INSERT INTO push_subscriptions (user_id, endpoint) VALUES (1, ?)').run('https://push.test/1');
    const MG = require(path.join(ROOT, 'magia-postpago'));
    const rc = await MG.celebrateFirstPaidPost(dbC, { id: 919, user_id: 1, ig_permalink: 'https://www.instagram.com/p/QA919/' });
    t('C8 primer posteo pago → el detalle del posteo (no el permalink externo)',
      rc && rc.celebrated === true && caps.length === 1 && caps[0].url === '/#/app/post/919', JSON.stringify({ rc, urls: caps.map((c) => c.url) }));
  } finally { push.sendPush = original; }
}

// ---------------------------------------------------------------------
const SEED_D = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
function usuario(id, email, nombre, ig) {
  db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
    VALUES (?, ?, ?, 'posty', 'active', 0, 0, 0, NULL, NULL, 1, 'es', 1, '2026-09-01 10:00:00')\`).run(id, email, hash);
  db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected) VALUES (?, ?, ?, ?, 1)')
    .run(id, nombre, ig, 'café');
  db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (?, 'America/New_York', '')").run(id);
}
usuario(501, 'dueno@pushdestino.test', 'Negocio Destino QA', 'negociodestinoqa');
usuario(502, 'otro@pushdestino.test', 'Otro Negocio QA', 'otronegocioqa');
// Los timestamps de posts van en ISO completo (toISOString), como los
// escribe producción: el scheduler compara scheduled_at contra
// new Date().toISOString() como STRING — el formato con espacio
// ('2026-11-23 01:02:46') ordena antes que cualquier ISO del mismo día
// (' ' < 'T') y el posteo nace «vencido» (failed: sin aprobación).
const en30 = new Date(Date.now() + 30 * 60000);
const hace1h = new Date(Date.now() - 3600000);
db.prepare(\`INSERT INTO posts (id, user_id, image_path, caption, status, approval, media_type, scheduled_at, created_at)
  VALUES (5011, 501, '/media/semilla.jpg', 'EL POSTEO DEL FRENO · QA PUSH DESTINO', 'scheduled', 'pending', 'image', ?, ?)\`)
  .run(en30.toISOString(), new Date().toISOString());
db.prepare(\`INSERT INTO posts (id, user_id, image_path, caption, status, media_type, scheduled_at, published_at, ig_permalink, created_at)
  VALUES (5012, 501, '/media/semilla.jpg', 'EL POSTEO YA PUBLICADO · QA PUSH DESTINO', 'published', 'image', ?, ?, 'https://www.instagram.com/p/QADESTINO/', ?)\`)
  .run(hace1h.toISOString(), hace1h.toISOString(), hace1h.toISOString());
db.prepare("INSERT INTO chat_messages (id, user_id, role, text) VALUES (5013, 501, 'user', '¿ya está la imagen que te pedí?')").run();
db.prepare("INSERT INTO chat_messages (id, user_id, role, text) VALUES (5014, 501, 'assistant', 'Tu imagen ya está lista, mirala acá.')").run();
console.log('semilla D ok');
`;

async function seccionD() {
  seccion('D · Chromium: el toque, seguido hasta la pantalla');
  const PORT = buscarPuerto();
  t('D0 hay un puerto libre verificado con ss', PORT > 0);
  if (!PORT) return;
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-boot-'));
  const seedFile = path.join(tmpD, 'seed.js');
  fs.writeFileSync(seedFile, SEED_D);
  try {
    execFileSync(process.execPath, [seedFile, tmpD, ROOT], { encoding: 'utf8', timeout: 120000 });
    t('D0b la semilla cargó (db del árbol + bcryptjs)', true);
  } catch (e) { t('D0b la semilla cargó', false, String(e.stdout || e.message).slice(-300)); return; }

  const ADMIN = 'boot-test-token-pushdestino';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: ADMIN, DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  child.stdout.on('data', (d) => { serverLog += d; });
  child.stderr.on('data', (d) => { serverLog += d; });
  const base = 'http://127.0.0.1:' + PORT;

  async function login(email) {
    const r = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'ClaveQA123' }),
    });
    const setCookie = r.headers.get('set-cookie') || '';
    const m = setCookie.match(/^([^=]+)=([^;]+)/);
    return { status: r.status, cookie: m ? { name: m[1], value: m[2] } : null };
  }

  let browser = null;
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) {}
      if (!up) await sleep(500);
    }
    t('D1 el servidor levanta en el puerto libre', up, serverLog.slice(-300));
    if (!up) return;

    const sesA = await login('dueno@pushdestino.test');
    const sesB = await login('otro@pushdestino.test');
    t('D1b login de las dos cuentas semilla', sesA.status === 200 && !!sesA.cookie && sesB.status === 200 && !!sesB.cookie);

    let pw = null;
    for (const cand of ['/tmp/pw-boot/node_modules/playwright-core',
      path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core')]) {
      try { pw = require(cand); break; } catch (e) {}
    }
    t('D1c playwright-core disponible', !!pw);
    if (!pw) return;
    let exe = null;
    const basePw = path.join(os.homedir(), '.cache/ms-playwright');
    try {
      for (const dir of fs.readdirSync(basePw)) {
        const p = path.join(basePw, dir, 'chrome-linux', 'chrome');
        if (dir.startsWith('chromium') && fs.existsSync(p)) { exe = p; break; }
      }
    } catch (e) {}
    browser = await pw.chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: sesA.cookie.name, value: sesA.cookie.value, url: base }]);
    const page = await ctx.newPage();
    const esperar = async (fn, arg, ms) => {
      try { await page.waitForFunction(fn, arg, { timeout: ms || 15000 }); return true; }
      catch (e) { return false; }
    };
    const irHash = async (h) => { await page.evaluate((hh) => { location.hash = hh; }, h); };

    await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
    const shellOk = await esperar(() => !!document.querySelector('.bb-bar'));
    t('D1d la app abre con la sesión del dueño', shellOk);

    // — El caso fundante con la URL NUEVA: el freno abre SU posteo —
    await irHash('#/app/post/5011');
    const d2 = await esperar(() => {
      const w = document.querySelector('.apv-wrap');
      return !!w && w.textContent.includes('EL POSTEO DEL FRENO');
    });
    const frenoOperable = d2 ? await page.evaluate(() => ({
      aceptar: !!document.getElementById('apvAccept'),
      menu: !!document.getElementById('apvMenuBtn'),
      pcHold: typeof pcHold === 'function',
    })) : { aceptar: false, menu: false, pcHold: false };
    t('D2 FRENO → su posteo, con Aceptar y el freno (pcHold) operables',
      d2 && frenoOperable.aceptar && frenoOperable.menu && frenoOperable.pcHold,
      JSON.stringify(frenoOperable));

    // — El caso fundante TAL CUAL le pasó al dueño: toque nativo con
    //   la URL VIEJA del freno (ya entregada en los teléfonos) —
    await irHash('#/app/schedule');
    await esperar(() => location.hash.startsWith('#/app/schedule'));
    const rutaNativa = await page.evaluate(() => pzNativeRoute('/#/app/semana?post=5011', true));
    t('D3a el portero nativo ya no descarta la URL del freno', rutaNativa === '#/app/semana?post=5011', String(rutaNativa));
    await irHash(rutaNativa);
    const d3 = await esperar(() => {
      const w = document.querySelector('.apv-wrap');
      return !!w && w.textContent.includes('EL POSTEO DEL FRENO');
    });
    t('D3b el toque con la URL vieja aterriza en el posteo anunciado (no en el feed)', d3,
      'hash final: ' + await page.evaluate(() => location.hash));

    // — Publicado: su detalle, con el permalink a un toque —
    await irHash('#/app/post/5012');
    const d4 = await esperar(() => {
      const w = document.querySelector('.apv-wrap');
      return !!w && w.textContent.includes('EL POSTEO YA PUBLICADO');
    });
    const perma = d4 ? await page.evaluate(() => {
      const a = [...document.querySelectorAll('.apv-wrap a')].find((x) => (x.href || '').includes('instagram.com/p/QADESTINO'));
      return !!a;
    }) : false;
    t('D4 PUBLICADO → su detalle, con «Ver en Instagram» al permalink', d4 && perma);

    // — La tanda: la bandeja —
    await irHash('#/app/notificaciones');
    const d5 = await esperar(() => !!document.querySelector('#pzbRoot') || !!document.querySelector('.pzb-wrap'));
    t('D5 TANDA → la bandeja de respuestas (no una vista genérica)', d5,
      'hash final: ' + await page.evaluate(() => location.hash));

    // — Referido / plan: el toque conserva su query hasta Ajustes —
    const rutaPlan = await page.evaluate(() => pzNativeRoute('/#/app/ajustes?plan=1', true));
    await irHash(rutaPlan);
    const d6 = await esperar(() => document.body.textContent.includes('Mi plan'));
    const hash6 = await page.evaluate(() => location.hash);
    t('D6 PLAN → Ajustes con la sección Mi plan y la query conservada',
      d6 && hash6 === '#/app/ajustes?plan=1', 'ruta: ' + rutaPlan + ' · hash: ' + hash6);

    // — Trabajo listo: el rebote chat→Inicio conserva el ?msg= y el
    //   ancla baja al mensaje anunciado —
    await irHash('#/app/chat?msg=5014');
    const d7a = await esperar(() => location.hash === '#/app/inicio?msg=5014'
      && !!document.querySelector('[data-msg-id="5014"]'));
    const d7b = d7a ? await esperar(() => {
      const el = document.querySelector('[data-msg-id="5014"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < innerHeight;
    }, null, 9000) : false;
    t('D7 TRABAJO LISTO → Inicio con el mensaje anunciado a la vista',
      d7a && d7b, 'hash: ' + await page.evaluate(() => location.hash));

    // — Aviso al dueño: el traspaso a la consola conserva user+post —
    await irHash('#/app/conserje?user=501&post=5011');
    const d8 = await esperar(() => location.pathname === '/conserje', null, 10000);
    const search8 = d8 ? await page.evaluate(() => location.search) : '';
    t('D8 AVISO AL DUEÑO → /conserje con el cliente y el posteo en la URL',
      d8 && search8 === '?user=501&post=5011', 'search: ' + search8);

    // — La consola abre la ficha de ESE cliente —
    await page.goto(base + '/conserje', { waitUntil: 'domcontentloaded' });
    await page.evaluate((tok) => { try { localStorage.setItem('posta_admin_token', tok); } catch (e) {} }, ADMIN);
    await page.goto(base + '/conserje?user=501&post=5011', { waitUntil: 'domcontentloaded' });
    const d9 = await esperar(() => {
      const c = document.querySelector('#centro');
      // «Ver su Instagram ↗» solo existe en la FICHA del cliente (la
      // vista de producción nombra al negocio pero no trae su ficha):
      // es el marcador que discrimina ficha abierta de lista del día.
      return !!c && c.textContent.includes('Negocio Destino QA') && c.textContent.includes('Ver su Instagram');
    }, null, 20000);
    t('D9 la consola consume el deep link y abre la ficha del cliente', d9);

    // — Observación (b): la barra inferior, íntegra —
    await page.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
    await esperar(() => !!document.querySelector('.bb-bar'));
    const barra = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.bb-bar .bb-tab')];
      const rects = tabs.map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      let solapan = false;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) solapan = true;
      }
      let centroInicio = false;
      if (tabs[0]) {
        const r = tabs[0].getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        centroInicio = !!hit && (hit === tabs[0] || tabs[0].contains(hit));
      }
      return { n: tabs.length, solapan, centroInicio };
    });
    t('D10 la barra tiene exactamente 3 pestañas, sin solapes ni manchas sobre Inicio',
      barra.n === 3 && !barra.solapan && barra.centroInicio, JSON.stringify(barra));

    // — La sesión manda: el posteo de otro dueño no existe —
    const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctxB.addCookies([{ name: sesB.cookie.name, value: sesB.cookie.value, url: base }]);
    const pageB = await ctxB.newPage();
    await pageB.goto(base + '/#/app/inicio', { waitUntil: 'domcontentloaded' });
    await pageB.evaluate(() => { location.hash = '#/app/post/5011'; });
    let d11 = false;
    try {
      await pageB.waitForFunction(() => document.body.textContent.includes('Ese posteo no existe'), null, { timeout: 15000 });
      d11 = true;
    } catch (e) {}
    const capAjena = await pageB.evaluate(() => document.body.textContent.includes('EL POSTEO DEL FRENO'));
    t('D11 el posteo de OTRA cuenta responde «no existe» (nunca se abre con la sesión ajena)',
      d11 && !capAjena);
    await ctxB.close();
  } catch (e) {
    t('D* la sección Chromium corrió sin excepciones', false, String(e && e.message).slice(0, 300));
  } finally {
    if (browser) { try { await browser.close(); } catch (e) {} }
    if (child && !child.killed) { try { process.kill(child.pid, 'SIGTERM'); } catch (e) {} }
    await sleep(1200);
    let vivo = true;
    try { process.kill(child.pid, 0); } catch (e) { vivo = false; }
    t('D12 el boot murió por su PID exacto y el puerto quedó libre', !vivo && puertoLibre(PORT));
    try { fs.rmSync(tmpD, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------------------------------------------------------------------
(async () => {
  await cFreno();
  await cTrial();
  await cPushJs();
  await cMissedYMagia();
  await seccionD();
  try { dbC.close(); } catch (e) {}
  try { fs.rmSync(dirC, { recursive: true, force: true }); } catch (e) {}
  console.log('\nRESULTADO: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
