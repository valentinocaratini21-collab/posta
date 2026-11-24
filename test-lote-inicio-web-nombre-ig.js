'use strict';
/*
 * LOTE NOMBRE-IG (23/11 · corrección del dueño 22:03, chat de Posty,
 * con captura): «acá el nombre tendría que ser el mismo nombre que
 * tiene el cliente en Instagram». La tarjeta del perfil espejo
 * mostraba «Posty» y el nombre visible de la cuenta en Instagram es
 * «Posty • Tus community managers».
 *
 * Regla: el nombre del espejo es el nombre REAL de la cuenta de
 * Instagram conectada, tal cual figura en Instagram, para todo
 * cliente — no el nombre del negocio del fundamento ni una forma
 * corta.
 *
 * Causas encontradas (tres vías por las que el nombre corto ganaba):
 *  1. La lectura por API (ig-profile.js, «la fuente de verdad del
 *     encabezado») traía foto/bio/conteos pero NUNCA el nombre: el
 *     campo name ni se pedía. Ahora se pide y se devuelve.
 *  2. homeProfileReadAndStore no tomaba el nombre de la API para el
 *     snapshot. Ahora: if (api.name) payload.name = api.name.
 *  3. El overlay del dueño (profiles.profile_name) pisaba el nombre
 *     incluso con lectura real: una forma corta guardada en Posty
 *     ganaba al nombre de Instagram. Ahora el guardado manda solo
 *     antes de la conexión (source 'kit'); con lectura real manda
 *     Instagram.
 *
 *  A · estática: las tres piezas + sellos.
 *  B · boot + HTTP real contra /api/home/profile:
 *      701 lectura real + nombre guardado corto -> manda Instagram.
 *      702 sin Instagram conectado + guardado -> manda el guardado.
 *      703 lectura real sin guardado -> el nombre de la lectura.
 *  C · Chromium: el encabezado de la tarjeta pinta el nombre real.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ✓ ' + nombre); }
  else { mal++; console.log('  ✗ ' + nombre + (extra ? ' — ' + extra : '')); }
}
function seccion(s) { console.log('\n== ' + s + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function buscarPuerto() {
  for (let p = 37360; p < 37560; p++) {
    try {
      const out = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
      if (!out.includes(':' + p + ' ')) return p;
    } catch (e) { return p; }
  }
  return 0;
}

const NOMBRE_IG = 'Posty • Tus community managers';
const NOMBRE_IG_3 = 'Café Aroma · Los Cardales';

const SEED_C = `
process.env.DATA_DIR = process.argv[2];
const path = require('path');
const ROOT = process.argv[3];
const db = require(path.join(ROOT, 'db'));
try { db.exec('ALTER TABLE users ADD COLUMN bambooty_shell INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE profiles ADD COLUMN profile_name TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE profiles ADD COLUMN profile_bio TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE profiles ADD COLUMN profile_link TEXT'); } catch (e) {}
try { db.exec('CREATE TABLE IF NOT EXISTS ig_home_snapshot (user_id INTEGER PRIMARY KEY, username TEXT, payload TEXT, fetched_at INTEGER)'); } catch (e) {}
require(path.join(ROOT, 'guest-trial')).ensureSchema(db);
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs'));
const hash = bcrypt.hashSync('ClaveQA123', 10);
const mkUser = (id, email) => db.prepare(\`INSERT INTO users (id, email, password_hash, plan, plan_status, is_guest, concierge, publishing_stopped, trial_started_at, trial_ends_at, bambooty_shell, lang, email_verified, created_at)
  VALUES (?, ?, ?, 'posty', 'active', 0, 0, 0, NULL, NULL, 0, 'es', 1, '2026-09-01 10:00:00')\`).run(id, email, hash);
mkUser(701, 'dueno@webqa.test');
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected, profile_name) VALUES (701, ?, ?, ?, 1, ?)')
  .run('Nombre Corto', 'webqa', 'café', 'Nombre Corto');
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (701, 'America/New_York', '')").run();
const snap701 = { source: 'read', username: 'webqa', name: ${JSON.stringify(NOMBRE_IG)}, pic: null, bio: 'Tus community managers, todos los días.', link: '', followers: 128, posts_count: 2, following: 40, is_verified: true, highlights: [], recents: [], captured_at: Date.now() };
db.prepare('INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (701, ?, ?, ?)').run('webqa', JSON.stringify(snap701), Date.now());
mkUser(702, 'kit@webqa.test');
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected, profile_name) VALUES (702, ?, ?, ?, 0, ?)')
  .run('Negocio Sin IG', '', 'café', 'Mi Nombre Guardado');
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (702, 'America/New_York', '')").run();
mkUser(703, 'read@webqa.test');
db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category, ig_connected, profile_name) VALUES (703, ?, ?, ?, 1, NULL)')
  .run('Otro Nombre', 'webqa3', 'café');
db.prepare("INSERT INTO settings (user_id, timezone, ig_page_id) VALUES (703, 'America/New_York', '')").run();
const snap703 = { source: 'read', username: 'webqa3', name: ${JSON.stringify(NOMBRE_IG_3)}, pic: null, bio: 'Café de especialidad.', link: '', followers: 64, posts_count: 3, following: 12, is_verified: false, highlights: [], recents: [], captured_at: Date.now() };
db.prepare('INSERT INTO ig_home_snapshot (user_id, username, payload, fetched_at) VALUES (703, ?, ?, ?)').run('webqa3', JSON.stringify(snap703), Date.now());
console.log('semilla ok');
`;

function seccionA() {
  seccion('A · estática');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const igp = fs.readFileSync(path.join(ROOT, 'ig-profile.js'), 'utf8');
  const idxEs = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, 'server.js')]); execFileSync(process.execPath, ['--check', path.join(ROOT, 'ig-profile.js')]); t('A0 node --check server.js + ig-profile.js', true); }
  catch (e) { t('A0 node --check server.js + ig-profile.js', false, String(e.message).slice(-160)); }
  t('A1 [FIX] la lectura por API pide el campo name y lo devuelve',
    igp.includes("'username,name,profile_picture_url,biography,followers_count,follows_count,media_count'")
    && igp.includes('name: strOrNull(d.name)'));
  t('A2 [FIX] el snapshot toma el nombre de la API (fuente de verdad del encabezado)',
    srv.includes('if (api.name) payload.name = api.name;'));
  t('A3 [FIX] el nombre guardado en Posty no pisa una lectura real (manda solo sin conexión)',
    srv.includes("if (pn && !(out && out.source === 'read')) out.name = pn;"));
  t('A4 el eco del guardado para el formulario sigue viajando (profile_display)',
    srv.includes('out.profile_display = { name: pn, bio: pb, link: pl };'));
  t('A5 sello nuevo: app.js?v=915 en el index ES', idxEs.includes('/app.js?v=915'));
}

async function bootServidor() {
  const PORT = buscarPuerto();
  if (!PORT) return null;
  const tmpD = fs.mkdtempSync(path.join(os.tmpdir(), 'nig-boot-'));
  const seedFile = path.join(tmpD, 'seed.js');
  fs.writeFileSync(seedFile, SEED_C);
  execFileSync(process.execPath, [seedFile, tmpD, ROOT], { encoding: 'utf8', timeout: 120000 });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpD, MEDIA_DIR: path.join(tmpD, 'media'), ADMIN_TOKEN: 'boot-test-token-nig', DEMO_AI_DAILY_CAP_USD: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + PORT;
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try { const r = await fetch(base + '/api/version'); up = r.status === 200; } catch (e) {}
    if (!up) await sleep(500);
  }
  return { PORT, child, base, up, log: () => log };
}

async function loginCookie(base, email) {
  const lr = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ClaveQA123' }),
  });
  const m = (lr.headers.get('set-cookie') || '').match(/^([^=]+)=([^;]+)/);
  return m ? m[1] + '=' + m[2] : null;
}

async function nombreServido(base, email) {
  const ck = await loginCookie(base, email);
  if (!ck) return { err: 'sin login' };
  const r = await fetch(base + '/api/home/profile', { headers: { Cookie: ck } });
  const j = await r.json().catch(() => null);
  return j || { err: 'sin json' };
}

async function seccionB(srv) {
  seccion('B · boot: /api/home/profile con cuentas semilla');
  t('B1 el servidor levanta en el puerto libre', srv && srv.up, srv ? srv.log().slice(-200) : 'sin puerto');
  if (!srv || !srv.up) return;
  const idxTxt = await (await fetch(srv.base + '/')).text();
  t('B2 el index servido trae app.js?v=915', idxTxt.includes('/app.js?v=915'));
  const p701 = await nombreServido(srv.base, 'dueno@webqa.test');
  t('B3 [FIX] lectura real + nombre guardado corto: el servido es el nombre de Instagram',
    p701.name === NOMBRE_IG, 'name=' + JSON.stringify(p701.name));
  const p702 = await nombreServido(srv.base, 'kit@webqa.test');
  t('B4 sin Instagram conectado, el nombre guardado sigue mandando (kit)',
    p702.name === 'Mi Nombre Guardado', 'name=' + JSON.stringify(p702.name));
  const p703 = await nombreServido(srv.base, 'read@webqa.test');
  t('B5 lectura real sin guardado: el nombre servido es el de la lectura, entero',
    p703.name === NOMBRE_IG_3, 'name=' + JSON.stringify(p703.name));
}

async function seccionC(srv) {
  seccion('C · Chromium: el encabezado de la tarjeta');
  if (!srv || !srv.up) { t('C0 sin servidor para Chromium', false); return; }
  const ck = await loginCookie(srv.base, 'dueno@webqa.test');
  t('C0 login de la cuenta semilla (shell web)', !!ck);
  if (!ck) return;
  let chromium = null;
  try { ({ chromium } = require('playwright-core')); } catch (e) {}
  if (!chromium) { try { ({ chromium } = require(path.join(os.homedir(), 'workspace/posty-stores/tools/node_modules/playwright-core'))); } catch (e) {} }
  t('C0b playwright-core disponible', !!chromium);
  if (!chromium) return;
  const fsx = require('fs');
  let exe = null;
  const cacheDir = path.join(os.homedir(), '.cache/ms-playwright');
  try {
    for (const d of fsx.readdirSync(cacheDir)) {
      const cand = path.join(cacheDir, d, 'chrome-linux/chrome');
      if (d.startsWith('chromium-') && fsx.existsSync(cand)) { exe = cand; break; }
    }
  } catch (e) {}
  const browser = await chromium.launch({ executablePath: exe || undefined, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1560, height: 950 } });
    const [name, val] = ck.split(/=(.*)/s).filter(Boolean).length ? [ck.slice(0, ck.indexOf('=')), ck.slice(ck.indexOf('=') + 1)] : [];
    await ctx.addCookies([{ name, value: val, url: srv.base }]);
    const page = await ctx.newPage();
    // Solo se corta la grilla viva (saldría a Instagram); el perfil va REAL.
    await page.route('**/api/home/live-grid', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, complete: false }) }));
    await page.goto(srv.base + '/#/app/inicio', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#inicioView .hf-user', { timeout: 30000 }).catch(() => null);
    await sleep(1200);
    const data = await page.evaluate(() => {
      const u = document.querySelector('#inicioView .hf-user');
      return { user: u ? u.textContent.trim() : null };
    });
    t('C1 [FIX] el encabezado de la tarjeta pinta el nombre real de Instagram, entero',
      data.user === NOMBRE_IG, 'hf-user=' + JSON.stringify(data.user));
  } finally { await browser.close(); }
}

(async () => {
  seccionA();
  const srv = await bootServidor();
  try {
    await seccionB(srv);
    await seccionC(srv);
  } finally {
    if (srv && srv.child) { try { srv.child.kill('SIGTERM'); } catch (e) {} }
  }
  console.log('\nTOTAL: ' + ok + ' ok · ' + mal + ' MAL');
  process.exit(mal ? 1 : 0);
})();
