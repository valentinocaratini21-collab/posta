// test-lote-c13-zona-visitante.js — LOTE C13 · ZONA HORARIA DEL
// VISITANTE EN LA PRUEBA (diagnóstico corrida Veja #5: las horas del
// invitado corrían +2 h).
//
// El problema: todo se calcula con la zona de la CUENTA (userTz →
// settings.timezone) y settings.timezone nace/rellena con
// America/Argentina/Buenos_Aires (db.js) — ningún paso del flujo de la
// prueba capturaba la zona del visitante. Los posteos de Veja «a las
// 19:00» quedaron en hora argentina (17:00 de Nueva York).
//
// El lote: el navegador manda su zona (Intl.DateTimeFormat) en el
// body de los arranques del flujo invitado — guest/start (páginas
// /prueba ES/EN), set-ig (app) y chat-onboarding — sin pasos ni
// preguntas, como el idioma. El server la valida contra Intl y la
// persiste en settings.timezone SOLO si la cuenta es invitada
// (is_guest=1) y todavía tiene el default de plataforma (la primera
// captura manda; una zona ya capturada o configurada no se pisa).
// Sin zona válida (o sin campo), fallback = comportamiento actual.
// El upgrade a cuenta real conserva la zona capturada (upgradeGuest
// no toca settings).
//
// Modo CONTROL (C13_CONTROL=1, contra la base v1004): el server ignora
// el campo tz — las aserciones de integración se invierten y
// reproducen el bug (todo en hora argentina).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.C13_CONTROL === '1';
const PORT = 35113;
const BASE = `http://127.0.0.1:${PORT}`;
const TRIAL_TEST_KEY = 'test-c13-suite';
const tmpDir = '/tmp/c13-suite-' + process.pid;
const BUILD_ESPERADO = CONTROL ? 'v1004' : 'v1005';
const VESPERADO = CONTROL ? '693' : '694';
const ENGINE = require(path.join(ROOT, 'demo')).DEMO_ENGINE_V;
const NY = 'America/New_York';
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + extra : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);
const count = (s, sub) => String(s || '').split(sub).length - 1;

// ---------- Parte A: estática ----------
{
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  t('A1 BUILD del árbol', src.includes(`const BUILD_ID = '20261105-${BUILD_ESPERADO}';`));
  if (!CONTROL) {
    t('A2 helpers de captura definidos', src.includes('function browserTzOf(body)') && src.includes('function applyGuestBrowserTz(userId, tz)'));
    t('A3 validación Intl de la zona (una zona inexistente no se guarda)',
      src.includes("new Intl.DateTimeFormat('en-US', { timeZone: tz })"));
    t('A4 persistencia SOLO invitado y SOLO con el default vigente',
      src.includes('cur !== PZ_DEFAULT_TZ') && src.includes('AND EXISTS (SELECT 1 FROM users WHERE id = ? AND is_guest = 1)'));
    t('A5 captura cableada en los 4 arranques (chat-onboarding, start ×2, set-ig)',
      count(src, 'applyGuestBrowserTz(') === 5, 'ocurrencias=' + count(src, 'applyGuestBrowserTz('));
    t('A6 en guest/start la captura va ANTES de importar la semana',
      src.indexOf('applyGuestBrowserTz(g.userId, tzK)') > 0 &&
      src.indexOf('applyGuestBrowserTz(g.userId, tzK)') < src.indexOf('const nImp = importTrialWeek(g.userId'));
    const pr = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
    const pre = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
    t('A7 /prueba ES manda tz: browserTz() en guest/start', has(pr, 'tz: browserTz()') && has(pr, 'function browserTz()'));
    t('A8 /prueba EN manda tz: browserTz() en guest/start', has(pre, 'tz: browserTz()') && has(pre, 'function browserTz()'));
    const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
    t('A9 app.js: pzBrowserTz definida y los 3 set-ig mandan tz',
      count(app, 'function pzBrowserTz()') === 1 &&
      count(app, "api.post('/api/guest/set-ig', { ig, device, tz: pzBrowserTz() })") === 3 &&
      count(app, "api.post('/api/guest/set-ig', { ig, device })") === 0);
  }
  const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  t('A10 index ES sirve app.js?v=' + VESPERADO, idx.includes('app.js?v=' + VESPERADO));
}

// ---------- Utilidades de integración ----------
function imgDataUri() {
  const buf = fs.readFileSync(path.join(ROOT, 'public', 'siembra-nails', 'tira-nails-1.jpg'));
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
function payloadFor(ig, business, captions) {
  const img = imgDataUri();
  const posts = captions.map((caption, i) => ({
    type: 'image', image: img, caption, hashtags: '#c13 #suite',
    headline: ['Uno', 'Dos', 'Tres'][i % 3], style: 'foto', style_name: 'foto', text_mode: 'text',
  }));
  return {
    ok: true, engine: ENGINE, lang: 'en', business, ig, category: 'sneakers',
    posts,
    design: { posts: posts.map((pp) => ({ headline: pp.headline, style: 'foto', kind: 'foto' })) },
    digest: { business, productos: [{ nombre: 'Esplar' }], servicios: [], ciudad: '' },
    content_lang: 'en',
  };
}
const CAPS = [
  'Esplar sneakers, handcrafted with organic cotton and wild rubber from the Amazon rainforest, made to last for years of daily wear.',
  'Our Esplar line pairs chrome-free leather with a recycled lining: a quiet design that goes with everything you already own.',
  'Small steps, honest materials. The Esplar is stitched by people who sign their work, in sizes for the whole family.',
];
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function seed(ig, payload) {
  const db = dbOpen();
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function cookieOf(res) {
  const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return sc.map((c) => c.split(';')[0]).join('; ');
}
function guestByIg(ig) {
  const db = dbOpen();
  const u = db.prepare('SELECT id, is_guest FROM users WHERE guest_ig = ?').get(ig);
  db.close();
  return u;
}
function tzOfUser(uid) {
  const db = dbOpen();
  const s = db.prepare('SELECT timezone FROM settings WHERE user_id = ?').get(uid);
  db.close();
  return s ? s.timezone : null;
}
function wallHM(iso, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
function scheduledWalls(uid) {
  const db = dbOpen();
  const rows = db.prepare("SELECT scheduled_at FROM posts WHERE user_id = ? AND status = 'scheduled' ORDER BY id").all(uid);
  db.close();
  return rows.map((r) => r.scheduled_at);
}
async function guestStart(body) {
  const r = await fetch(BASE + '/api/guest/start?test_key=' + TRIAL_TEST_KEY, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: cookieOf(r) };
}

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-c13', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t('C0 server booteó', up, log.slice(-400));
    if (!up) return;

    // --- Caso 1: invitado con navegador en Nueva York (guest/start) ---
    seed('c13ny', payloadFor('c13ny', 'Veja Suite', CAPS));
    const rNY = await guestStart({ ig: 'c13ny', lang: 'en', device: 'c13-dev-ny', tz: NY });
    t('C1 guest/start NY ok con 3 posteos programados', rNY.status === 200 && rNY.body.posts === 3 && rNY.body.scheduled === 3, JSON.stringify(rNY.body).slice(0, 200));
    const uNY = guestByIg('c13ny');
    t('C2 el dueño es invitado', !!(uNY && uNY.is_guest === 1), JSON.stringify(uNY));
    const tzNY = tzOfUser(uNY.id);
    const wallsNY = scheduledWalls(uNY.id);
    t('C3 los 3 posteos quedaron programados', wallsNY.length === 3, JSON.stringify(wallsNY));
    const enCuenta = wallsNY.map((w) => wallHM(w, tzNY || DEFAULT_TZ));
    t('C4 en la zona de la cuenta, los 3 salen a las 19:00 (mecanismo intacto, ambos modos)',
      enCuenta.every((h) => h === '19:00'), JSON.stringify(enCuenta));
    const enNY = wallsNY.map((w) => wallHM(w, NY));
    if (!CONTROL) {
      t('C5 settings.timezone = la zona del visitante (NY)', tzNY === NY, String(tzNY));
      t('C6 en Nueva York los posteos salen a las 19:00 (SU hora)', enNY.every((h) => h === '19:00'), JSON.stringify(enNY));
    } else {
      t('C5c CONTROL settings.timezone = default argentino (el bug)', tzNY === DEFAULT_TZ, String(tzNY));
      t('C6c CONTROL en Nueva York los posteos salen a las 17:00 (el bug +2 h)', enNY.every((h) => h === '17:00'), JSON.stringify(enNY));
    }

    // --- Caso 2: zona inválida → fallback declarado ---
    seed('c13bad', payloadFor('c13bad', 'Veja Suite', CAPS));
    const rBad = await guestStart({ ig: 'c13bad', lang: 'en', device: 'c13-dev-bad', tz: 'Marte/Olympus_Mons' });
    t('C7 zona inválida: guest/start ok igual', rBad.status === 200 && rBad.body.posts === 3, JSON.stringify(rBad.body).slice(0, 160));
    const uBad = guestByIg('c13bad');
    t('C8 zona inválida NO se guarda: queda el default (fallback, ambos modos)', tzOfUser(uBad.id) === DEFAULT_TZ, String(tzOfUser(uBad.id)));

    // --- Caso 3: sin campo tz → comportamiento actual ---
    seed('c13sin', payloadFor('c13sin', 'Veja Suite', CAPS));
    const rSin = await guestStart({ ig: 'c13sin', lang: 'en', device: 'c13-dev-sin' });
    t('C9 sin tz: guest/start ok', rSin.status === 200 && rSin.body.posts === 3, JSON.stringify(rSin.body).slice(0, 160));
    const uSin = guestByIg('c13sin');
    t('C10 sin tz: settings con el default (fallback, ambos modos)', tzOfUser(uSin.id) === DEFAULT_TZ, String(tzOfUser(uSin.id)));

    // --- Caso 4: invitado sin identidad — la captura llega en set-ig ---
    const rAnon = await guestStart({ lang: 'es', device: 'c13-dev-ig' });
    t('C11 invitado sin identidad creado', rAnon.status === 200 && rAnon.body.needs_ig === true, JSON.stringify(rAnon.body).slice(0, 160));
    seed('c13ig', payloadFor('c13ig', 'Veja Suite', CAPS));
    const rSet = await fetch(BASE + '/api/guest/set-ig', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: rAnon.cookie },
      body: JSON.stringify({ ig: 'c13ig', device: 'c13-dev-ig', tz: NY }),
    });
    const jSet = await rSet.json().catch(() => ({}));
    t('C12 set-ig ok con 3 posteos', rSet.status === 200 && jSet.posts === 3, JSON.stringify(jSet).slice(0, 160));
    const uIg = guestByIg('c13ig');
    const tzIg = tzOfUser(uIg.id);
    const enNYig = scheduledWalls(uIg.id).map((w) => wallHM(w, NY));
    if (!CONTROL) {
      t('C13 set-ig capturó la zona del visitante (NY)', tzIg === NY, String(tzIg));
      t('C14 la semana de set-ig sale a las 19:00 de SU zona', enNYig.length === 3 && enNYig.every((h) => h === '19:00'), JSON.stringify(enNYig));
    } else {
      t('C13c CONTROL set-ig no captura: default argentino', tzIg === DEFAULT_TZ, String(tzIg));
      t('C14c CONTROL la semana de set-ig sale 17:00 en NY (el bug)', enNYig.length === 3 && enNYig.every((h) => h === '17:00'), JSON.stringify(enNYig));
    }

    // --- Caso 5: primera captura manda (chat-onboarding con otra zona) ---
    const rChat = await fetch(BASE + '/api/trial/chat-onboarding?test_key=' + TRIAL_TEST_KEY, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'join', ig: 'c13ig', lang: 'es', device: 'c13-dev-ig', tz: 'America/Chicago' }),
    });
    const jChat = await rChat.json().catch(() => ({}));
    t('C15 chat-onboarding reusa al invitado', rChat.status === 200 && jChat.ok === true, JSON.stringify(jChat).slice(0, 160));
    if (!CONTROL) {
      t('C16 la zona capturada NO se pisa con otra posterior', tzOfUser(uIg.id) === NY, String(tzOfUser(uIg.id)));
    } else {
      t('C16c CONTROL sigue el default', tzOfUser(uIg.id) === DEFAULT_TZ, String(tzOfUser(uIg.id)));
    }

    // --- Caso 6: el upgrade a cuenta real CONSERVA la zona capturada ---
    const plain = 'c13token' + crypto.randomBytes(8).toString('hex');
    const hash = crypto.createHash('sha256').update(plain).digest('hex');
    {
      const db = dbOpen();
      db.prepare('INSERT INTO magic_tokens (token_hash, email, payload, created_at, expires_at, used) VALUES (?,?,?,?,?,0)')
        .run(hash, 'upgrade-c13@example.com', JSON.stringify({ guest_id: uNY.id, lang: 'en' }), Date.now(), Date.now() + 15 * 60 * 1000);
      db.close();
    }
    const rMagic = await fetch(BASE + '/api/auth/magic?token=' + plain, { redirect: 'manual' });
    t('C17 el magic link sube al invitado (302)', rMagic.status === 302, 'status ' + rMagic.status);
    const db6 = dbOpen();
    const uUp = db6.prepare('SELECT is_guest, email FROM users WHERE id = ?').get(uNY.id);
    db6.close();
    t('C18 la fila ya es cuenta real con su email', !!(uUp && uUp.is_guest === 0 && uUp.email === 'upgrade-c13@example.com'), JSON.stringify(uUp));
    if (!CONTROL) {
      t('C19 el upgrade CONSERVA la zona capturada (NY)', tzOfUser(uNY.id) === NY, String(tzOfUser(uNY.id)));
    } else {
      t('C19c CONTROL el upgrade conserva el default (nada se había capturado)', tzOfUser(uNY.id) === DEFAULT_TZ, String(tzOfUser(uNY.id)));
    }

    // --- Caso 7: cuenta REGISTRADA con zona configurada — intacta ---
    const rReg = await fetch(BASE + '/api/auth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'registrado-c13@example.com', password: 'secreto1' }),
    });
    t('C20 register ok', rReg.status === 200 || rReg.status === 201, 'status ' + rReg.status);
    const rLogin = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'registrado-c13@example.com', password: 'secreto1' }),
    });
    t('C21 login del registrado ok', rLogin.status === 200, 'status ' + rLogin.status);
    const cookieReg = cookieOf(rLogin);
    const db7 = dbOpen();
    const uReg = db7.prepare('SELECT id, is_guest FROM users WHERE email = ?').get('registrado-c13@example.com');
    // Su zona configurada (como si la hubiera elegido en Ajustes).
    db7.prepare("INSERT INTO settings (user_id, timezone) VALUES (?, 'America/Santiago') ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone").run(uReg.id);
    db7.close();
    t('C22 el registrado NO es invitado y su zona quedó configurada', !!(uReg && uReg.is_guest === 0) && tzOfUser(uReg.id) === 'America/Santiago', JSON.stringify(uReg));
    const rSetReg = await fetch(BASE + '/api/guest/set-ig', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieReg },
      body: JSON.stringify({ ig: 'c13ny', device: 'c13-dev-reg', tz: NY }),
    });
    const jSetReg = await rSetReg.json().catch(() => ({}));
    t('C23 set-ig rechaza al registrado (not_guest, ambos modos)', rSetReg.status === 400 && jSetReg.error === 'not_guest', JSON.stringify(jSetReg).slice(0, 160));
    t('C24 la zona configurada del registrado NO se tocó (ambos modos)', tzOfUser(uReg.id) === 'America/Santiago', String(tzOfUser(uReg.id)));
  } finally {
    try { process.kill(srv.pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(srv.pid, 'SIGKILL'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${CONTROL ? 'CONTROL' : 'RELEASE'}: ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
