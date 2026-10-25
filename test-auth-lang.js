#!/usr/bin/env node
// test-auth-lang.js — (v399 · paridad) Login en español entrando desde el website EN.
//
// Bug (Valentino, 2026-10-24): desde la home EN y la /prueba EN, «Log in»
// abría el login («Bienvenido de vuelta») en español. Causa: authView/
// forgotView/resetView y los errores de auth estaban fijos en ES; las
// superficies EN no estampaban el idioma al entrar; y el alta desde EN
// nacía users.lang='es' (el mail de acceso y todo lo posterior salía ES).
//
// Este test cubre:
//  A) estático: AUTH_STR bilingüe + authLang (?lang= > sello de superficie >
//     navegador), sellos en los links de entrada de las 4 superficies,
//     lang en los POST de auth y en el doRegister de /prueba, server con
//     lang en register/magic/forgot/reset y páginas de error bilingües.
//  B) boot sin RESEND_API_KEY: el alta EN nace lang='en' (register y magic
//     con sesión inmediata y canje), la sin lang nace 'es', y TODOS los
//     errores de auth salen en el idioma pedido — con el ES byte-exacto
//     histórico cuando no se pide idioma.
//
// Uso: node test-auth-lang.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 260) : ''); }
};

// ---------- A) estático ----------
console.log('— estático: wiring del fix');
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const enIdx = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const enPr = fs.readFileSync(path.join(__dirname, 'public/en-prueba.html'), 'utf8');
const esPr = fs.readFileSync(path.join(__dirname, 'public/prueba.html'), 'utf8');

ok('app: AUTH_STR con EN «Welcome back» y ES «Bienvenido de vuelta»', app.includes('Welcome back 👋') && app.includes('Bienvenido de vuelta 👋'));
ok('app: authLang() resuelve ?lang= del hash', app.includes('function authLang()') && app.includes("q.get('lang')"));
ok('app: savedAccountsLang delega en anonUiLang', app.includes('function savedAccountsLang() { return anonUiLang(); }'));
ok('app: las 3 vistas de auth usan authStr()', (app.match(/const S = authStr\(\);/g) || []).length === 3);
ok('app: login/registro mandan lang en el POST', app.includes('const body = { email, password, lang: authLang() };'));
ok('app: forgot manda lang en el POST', app.includes("api.post('/api/auth/forgot', { email, lang: authLang() })"));
ok('app: reset manda lang en el POST', app.includes("api.post('/api/auth/reset', { token, password, lang: authLang() })"));
ok('app: doLogout estampa el lang de la cuenta', app.includes("localStorage.setItem('posty-lang', ME.lang)"));
ok('app: la landing ES estampa es en «Entrar» (x3)', (app.match(/href="#\/login" onclick="try\{localStorage\.setItem\('posty-lang','es'\)/g) || []).length === 3);
ok('shell ES: app.js?v=308 + «Entrar» estampado', idx.includes('/app.js?v=308') && idx.includes('href="#/login" onclick='));
ok('home EN: 3 «Log in» estampan en', (enIdx.match(/href="\/#\/login" onclick="try\{localStorage\.setItem\('posty-lang','en'\)/g) || []).length === 3);
ok('/prueba EN: entradas estampan en + doRegister manda lang en', (enPr.match(/onclick="try\{localStorage\.setItem\('posty-lang','en'\)/g) || []).length >= 3 && enPr.includes("const body = { email, lang: 'en' };"));
ok('/prueba ES: entradas estampan es + doRegister manda lang es', (esPr.match(/onclick="try\{localStorage\.setItem\('posty-lang','es'\)/g) || []).length >= 3 && esPr.includes("const body = { email, lang: 'es' };"));
ok('server: register guarda lang y localiza errores', srv.includes('const regEn = lang === \'en\';') && srv.includes('autopilot_enabled, lang) VALUES'));
ok('server: magic guarda lang en el payload y en el alta', srv.includes('lang: magicLang,') && srv.includes("payload.lang === 'en' ? 'en' : 'es'"));
ok('server: el link de reset lleva &lang= de la cuenta', srv.includes("&lang=${user.lang === 'en' ? 'en' : 'es'}"));
ok('server: reset resuelve idioma (body > cuenta > es)', srv.includes('const rsEn = rsLang === \'en\';'));
ok('server: htmlLinkPage acepta lang', srv.includes('function htmlLinkPage(title, msg, lang)'));

// ---------- B) boot ----------
async function boot(port) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-authlang-'));
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' };
  delete env.RESEND_API_KEY; delete env.RESEND_API_URL; delete env.EMAIL_FROM;
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 80 && !up; i++) {
    try { const r = await fetch(base + '/api/version'); up = r.ok; } catch {}
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) throw new Error('el servidor no levantó:\n' + bootLog.slice(-1200));
  return { child, base, dataDir };
}

function jarFetch(jar) {
  return async (url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (jar.cookie) headers.Cookie = jar.cookie;
    const r = await fetch(url, { ...opts, headers, redirect: 'manual' });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) jar.cookie = sc.map((c) => c.split(';')[0]).join('; ');
    return r;
  };
}
const post = (f, base, p, body) => f(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const me = async (f, base) => { const j = await (await f(base + '/api/auth/me')).json(); return j.user || j; };

(async () => {
  console.log('— boot: altas y errores por idioma');
  const { child, base, dataDir } = await boot(4321);
  try {
    const suf = String(Date.now()).slice(-6);
    // register EN -> nace lang en
    let jar = {}; let f = jarFetch(jar);
    let r = await post(f, base, '/api/auth/register', { email: `en${suf}@example.com`, password: 'secreto1', lang: 'en' });
    ok('register EN responde 200', r.status === 200, r.status);
    ok('alta desde EN nace lang=en', (await me(f, base)).lang === 'en');
    // register sin lang -> es
    jar = {}; f = jarFetch(jar);
    r = await post(f, base, '/api/auth/register', { email: `es${suf}@example.com`, password: 'secreto1' });
    ok('alta sin lang nace lang=es', (await me(f, base)).lang === 'es');
    // errores de register
    r = await post(jarFetch({}), base, '/api/auth/register', { email: `en${suf}@example.com`, password: 'secreto1', lang: 'en' });
    ok('duplicado EN', (await r.json()).error === 'That email already has an account 😄 Try logging in instead');
    r = await post(jarFetch({}), base, '/api/auth/register', { email: `en${suf}@example.com`, password: 'secreto1' });
    ok('duplicado ES exacto', (await r.json()).error === 'Ese email ya tiene cuenta 😄 Probá entrando directamente');
    r = await post(jarFetch({}), base, '/api/auth/register', { email: `x${suf}@example.com`, password: '123', lang: 'en' });
    ok('validación EN', (await r.json()).error === 'I need your email and a password of at least 6 characters 🔑');
    r = await post(jarFetch({}), base, '/api/auth/register', { email: `x${suf}@example.com`, password: '123' });
    ok('validación ES exacta', (await r.json()).error === 'Necesito tu email y una contraseña de 6 caracteres como mínimo 🔑');
    // login 401
    r = await post(jarFetch({}), base, '/api/auth/login', { email: `en${suf}@example.com`, password: 'wrongpass', lang: 'en' });
    ok('login 401 EN', r.status === 401 && (await r.json()).error === "Hmm, that email or password doesn't look right 🤔 Try again");
    r = await post(jarFetch({}), base, '/api/auth/login', { email: `en${suf}@example.com`, password: 'wrongpass' });
    ok('login 401 ES exacto', r.status === 401 && (await r.json()).error === 'Mmm, ese email o contraseña no me cierran 🤔 Probá de nuevo');
    // magic con sesión inmediata
    jar = {}; f = jarFetch(jar);
    r = await post(f, base, '/api/auth/magic-request', { email: `men${suf}@example.com`, lang: 'en', trial_profile: { business_name: 'Test' } });
    ok('magic EN: sesión inmediata + lang=en', r.status === 200 && (await me(f, base)).lang === 'en');
    jar = {}; f = jarFetch(jar);
    r = await post(f, base, '/api/auth/magic-request', { email: `mes${suf}@example.com`, trial_profile: { business_name: 'Test' } });
    ok('magic sin lang: sesión inmediata + lang=es', r.status === 200 && (await me(f, base)).lang === 'es');
    // forgot sin RESEND -> 503 localizado
    r = await post(jarFetch({}), base, '/api/auth/forgot', { email: `en${suf}@example.com`, lang: 'en' });
    ok('forgot 503 EN', r.status === 503 && (await r.json()).error === 'Email delivery is under maintenance 😅 Please try again in a bit.');
    r = await post(jarFetch({}), base, '/api/auth/forgot', { email: `en${suf}@example.com` });
    ok('forgot 503 ES exacto', r.status === 503 && (await r.json()).error === 'El envío de emails está en mantenimiento 😅 Probá de nuevo en un rato.');
    // reset token inválido
    r = await post(jarFetch({}), base, '/api/auth/reset', { token: 'invalido', password: 'secreto1', lang: 'en' });
    ok('reset malo EN', r.status === 400 && (await r.json()).error === 'That link expired or was already used 😅 Request a new one');
    r = await post(jarFetch({}), base, '/api/auth/reset', { token: 'invalido', password: 'secreto1' });
    ok('reset malo ES exacto', r.status === 400 && (await r.json()).error === 'Ese link venció o ya se usó 😅 Pedí uno nuevo');

    // canje magic: la cuenta nace con el lang del payload; página de error por idioma
    console.log('— boot: canje magic y páginas de error');
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = path.join(dataDir, 'posta.db');
    const db = new DatabaseSync(dbPath);
    const mk = (email, lang, expired) => {
      const tok = crypto.randomBytes(32).toString('hex');
      const th = crypto.createHash('sha256').update(tok).digest('hex');
      db.prepare('INSERT INTO magic_tokens (token_hash, email, payload, created_at, expires_at, used) VALUES (?,?,?,?,?,0)')
        .run(th, email, JSON.stringify(lang ? { lang } : {}), Date.now(), Date.now() + (expired ? -1000 : 15 * 60 * 1000));
      return tok;
    };
    jar = {}; f = jarFetch(jar);
    const tokEn = mk(`redeem-en${suf}@example.com`, 'en', false);
    r = await f(base + '/api/auth/magic?token=' + tokEn);
    ok('canje EN redirige a la app', r.status === 302, r.status);
    ok('cuenta del canje EN nace lang=en', (await me(f, base)).lang === 'en');
    const tokExpEn = mk(`exp-en${suf}@example.com`, 'en', true);
    r = await jarFetch({})(base + '/api/auth/magic?token=' + tokExpEn);
    const htmlEn = await r.text();
    ok('página de link vencido EN', r.status === 400 && htmlEn.includes('That link expired or was already used') && htmlEn.includes('Back to Posty') && htmlEn.includes('<html lang="en">'), htmlEn.slice(0, 160));
    const tokExpEs = mk(`exp-es${suf}@example.com`, null, true);
    r = await jarFetch({})(base + '/api/auth/magic?token=' + tokExpEs);
    const htmlEs = await r.text();
    ok('página de link vencido ES exacta', r.status === 400 && htmlEs.includes('Ese link venció o ya se usó 😅') && htmlEs.includes('Volver a Posty') && htmlEs.includes('<html lang="es">'), htmlEs.slice(0, 160));
    db.close();
  } finally { child.kill('SIGKILL'); }

  console.log(`\ntest-auth-lang: ${passed} ✓ · ${failed} ✗`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
