// test-lote-correctivo-6-banner.js — LOTE CORRECTIVO-6 BANNER-CONEXIÓN-HONESTO (v995)
// El banner «terminar de conectar» aparecía en TODAS las vistas apenas el
// visitante ABRÍA el OAuth de Instagram: /api/ig/go marcaba igAttemptAt y
// /api/profile derivaba ig_pending del intento (<15 min, no conectado), y la
// copia afirmaba «Tu sesión ya quedó iniciada» sin ninguna evidencia (auditorías
// Hungry Ghost y Veja, 12/11: el cartel salió sin ingresar nada en Instagram).
// FIX: la señal del banner es igInterruptedAt, que SOLO escribe
// /api/ig/callback cuando el flujo VOLVIÓ sin completarse (error de Meta,
// cuenta personal, IG duplicada o falla del canje). Abrir el OAuth ya no
// alcanza; un intento nuevo o la conexión exitosa apagan la señal; la ventana
// sigue siendo de 15 min (IG_RESUME_WINDOW_MS, override por env solo tests).
// Copia nueva honesta ES/EN: la conexión no se completó, un toque reintenta —
// ya no afirma ninguna sesión iniciada.
// Uso: cd release && node test-lote-correctivo-6-banner.js
// Secciones: A estáticos · B VM (renderIgResume) · C boot release (flujos) ·
// D control sobre la base v994 (el bug se reproduce: abrir alcanza).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const vm = require('vm');
const { spawn, execSync } = require('child_process');

const ROOT = __dirname; // release/
const BASE = path.join(ROOT, '..', 'base-v994');
let pass = 0, fail = 0;
const failed = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; failed.push(name); console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function read(p) { return fs.readFileSync(p, 'utf-8'); }
function countOcc(s, sub) { return s.split(sub).length - 1; }
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const appBase = read(path.join(BASE, 'public/app.js'));
const appRel = read(path.join(ROOT, 'public/app.js'));
const srvBase = read(path.join(BASE, 'server.js'));
const srvRel = read(path.join(ROOT, 'server.js'));
const idxEsRel = read(path.join(ROOT, 'public/index.html'));
const EMBED = 'https://www.facebook.com/v26.0/dialog/oauth?client_id=1234567890&scope=instagram_basic';

// ---------- A. Estáticos ----------
console.log('A. Estáticos (correctivo-6)');
t('A1 BUILD v995 x1 en server.js, v994 x0', countOcc(srvRel, "const BUILD_ID = '20261105-v995';") === 1 && countOcc(srvRel, '20261105-v994') === 0);
t('A2 la señal se escribe SOLO en el callback (4 vueltas sin completar)', countOcc(srvRel, 'req.session.igInterruptedAt = Date.now();') === 4, String(countOcc(srvRel, 'req.session.igInterruptedAt = Date.now();')));
t('A3 la señal se apaga en intento nuevo y en conexión exitosa', countOcc(srvRel, 'delete req.session.igInterruptedAt;') === 3, String(countOcc(srvRel, 'delete req.session.igInterruptedAt;')));
t('A4 /api/profile ya NO deriva del intento', !srvRel.includes('const at = req.session.igAttemptAt') && srvRel.includes('const iat = req.session.igInterruptedAt') && srvRel.includes('Date.now() - iat < IG_RESUME_WINDOW_MS'));
t('A5 ventana de 15 min por defecto (const + uso)', srvRel.includes('const IG_RESUME_WINDOW_MS') && srvRel.includes('15 * 60 * 1000'));
t('A6 el intento sigue existiendo como bookkeeping en /api/ig/go', countOcc(srvRel, 'req.session.igAttemptAt = Date.now();') === 1);
t('A7 copia vieja ES muerta en app.js', countOcc(appRel, 'Tu sesión ya quedó iniciada') === 0 && countOcc(appRel, 'Se interrumpió la conexión') === 0 && countOcc(appRel, 'ya quedaste logueado') === 0);
t('A8 ninguna afirmación de sesión en EN', countOcc(appRel, 'already signed in') === 0 && countOcc(appRel, 'already logged in') === 0 && countOcc(appRel, 'session has already started') === 0);
t('A9 copia nueva honesta ES+EN presente', countOcc(appRel, 'La conexión con Instagram no se completó. Con un toque más la terminás.') === 1 && countOcc(appRel, "Your Instagram connection didn't finish. One more tap and you can complete it.") === 1 && countOcc(appRel, 'Finish connecting') === 1 && countOcc(appRel, 'Terminar de conectar') === 1);
t('A10 gate del banner y botón intactos (ig_pending/ig_connected + igConnect)', countOcc(appRel, 'PROFILE.ig_pending && !PROFILE.ig_connected') === 1 && appRel.includes("b.querySelector('#igResumeGo').onclick = () => igConnect();"));
t('A11 M78: funciones del código nuevo definidas en el bundle', ['function renderIgResume()', 'function igConnect(', 'function maybeShowIgPopup(', 'function pzIc('].every((s) => appRel.includes(s)));
t('A12 render() sigue llamando a renderIgResume y al popup', appRel.includes('renderIgResume(); // banner') && appRel.includes('maybeShowIgPopup(tab);'));
t('A13 index ES app.js?v=692 x1, ?v=682 x0, styles intacto', countOcc(idxEsRel, '/app.js?v=692') === 1 && countOcc(idxEsRel, '/app.js?v=682') === 0 && countOcc(idxEsRel, 'styles.css?v=20261274') === 1);
t('A14 index EN y styles.css byte-idénticos a la base', md5(path.join(ROOT, 'public/en/index.html')) === md5(path.join(BASE, 'public/en/index.html')) && md5(path.join(ROOT, 'public/styles.css')) === md5(path.join(BASE, 'public/styles.css')));
t('A15 la base conserva el bug (control): deriva del intento y copia vieja', srvBase.includes('const at = req.session.igAttemptAt') && countOcc(appBase, 'Tu sesión ya quedó iniciada') === 1);

// ---------- B. VM: renderIgResume ----------
console.log('B. VM (renderIgResume real, DOM falso)');
{
  const start = appRel.indexOf('function renderIgResume()');
  const endMarker = appRel.indexOf('\n}\n', start);
  const slice = appRel.slice(start, endMarker + 3);
  t('B0 slice extraído', slice.includes('function renderIgResume()') && slice.includes('igResumeGo'));
  function makeCtx(profile, me) {
    const els = {};
    function makeEl() {
      const el = {
        id: '', innerHTML: '', children: [],
        querySelector() { return { onclick: null }; },
        appendChild(c) { this.children.push(c); if (c && c.id) els[c.id] = c; return c; },
        remove() { if (this.id) delete els[this.id]; },
      };
      return el;
    }
    const ctx = {
      PROFILE: profile, ME: me, pzIc: () => '', igConnect: () => {},
      document: { getElementById: (id) => els[id] || null, createElement: () => makeEl(), body: makeEl() },
      console,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(slice, ctx);
    return { ctx, els };
  }
  const es = makeCtx({ ig_pending: true, ig_connected: false }, { lang: 'es' });
  es.ctx.renderIgResume();
  const bEs = es.els.igResumeBanner;
  t('B1 con señal y lang ES: banner con copia nueva honesta', !!bEs && bEs.innerHTML.includes('La conexión con Instagram no se completó') && bEs.innerHTML.includes('Terminar de conectar') && !bEs.innerHTML.includes('sesión ya quedó iniciada'));
  const en = makeCtx({ ig_pending: true, ig_connected: false }, { lang: 'en' });
  en.ctx.renderIgResume();
  const bEn = en.els.igResumeBanner;
  t('B2 con señal y lang EN: banner en inglés honesto', !!bEn && bEn.innerHTML.includes("Your Instagram connection didn't finish") && bEn.innerHTML.includes('Finish connecting'));
  const sin = makeCtx({ ig_pending: false, ig_connected: false }, { lang: 'es' });
  sin.ctx.renderIgResume();
  t('B3 sin señal: no hay banner', !sin.els.igResumeBanner);
  const con = makeCtx({ ig_pending: true, ig_connected: true }, { lang: 'es' });
  con.ctx.renderIgResume();
  t('B4 conectado con señal residual: no hay banner', !con.els.igResumeBanner);
}

// ---------- helpers de boot ----------
function cookieJar() {
  const jar = new Map();
  return {
    absorb(headers) {
      const cs = headers.getSetCookie ? headers.getSetCookie() : [];
      for (const c of cs) { const [kv] = c.split(';'); const i = kv.indexOf('='); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
    },
    str() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); },
  };
}
async function boot(cwd, port, dataDir, extraEnv) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const env = { ...process.env, PORT: String(port), DATA_DIR: dataDir, SESSION_SECRET: 'test-c6', ADMIN_TOKEN: 'test-admin-c6', NODE_PATH: '/home/hatch/workspace/posta/node_modules', META_IG_EMBED_URL: EMBED, ...(extraEnv || {}) };
  delete env.MP_ACCESS_TOKEN; delete env.MP_PUBLIC_KEY; delete env.STRIPE_SECRET_KEY;
  delete env.META_APP_ID; delete env.META_APP_SECRET; delete env.META_ACCESS_TOKEN;
  const proc = spawn('node', ['server.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    await sleep(500);
    try { const r = await fetch(`http://127.0.0.1:${port}/api/version`); up = r.ok; } catch (e) {}
  }
  return { proc, up, out: () => out };
}
async function registrar(base, jar, email) {
  const rr = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test1234', business_name: 'Banner Test' }),
  });
  jar.absorb(rr.headers);
  return rr.status;
}
async function get(base, jar, p) {
  const rr = await fetch(base + p, { headers: { Cookie: jar.str() }, redirect: 'manual' });
  jar.absorb(rr.headers);
  let data = null; try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data, location: rr.headers.get('location') || '' };
}
async function killBoot(proc, port) {
  const pid = proc.pid;
  try { process.kill(pid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let muerto = false;
  try { process.kill(pid, 0); } catch (e) { muerto = true; }
  let libre = false;
  try { await fetch(`http://127.0.0.1:${port}/api/version`); } catch (e) { libre = true; }
  return muerto && libre;
}

// ---------- C. Boot release: flujos (a)-(d) ----------
const PUERTO_REL = 35031;
const PUERTO_BASE = 35032;
const DATA_REL = '/tmp/c6-banner-release-data';
const DATA_BASE = '/tmp/c6-banner-base-data';
(async () => {
  console.log('C. Boot release (ventana corta por env: 3000 ms)');
  try { execSync('ss -ltn | grep -q ":' + PUERTO_REL + '"') && t('C0 puerto ' + PUERTO_REL + ' libre', false, 'ocupado'); } catch (e) {}
  const rel = await boot(ROOT, PUERTO_REL, DATA_REL, { PZ_IG_RESUME_WINDOW_MS: '3000' });
  const B = `http://127.0.0.1:${PUERTO_REL}`;
  try {
    t('C1 boot levanta', rel.up, rel.out().slice(-300));
    const ver = await (await fetch(`${B}/api/version`)).json();
    t('C2 /api/version = v995', ver && ver.build === '20261105-v995', JSON.stringify(ver));
    const jar = cookieJar();
    const st = await registrar(B, jar, 'banner-c6@example.com');
    t('C3 registro fresco con sesión', (st === 200 || st === 201) && jar.str().length > 0, 'status ' + st);
    // (a) abrir el OAuth y NO volver por el callback → sin cartel
    const go = await get(B, jar, '/api/ig/go');
    t('C4 /api/ig/go redirige a Meta (302)', go.status === 302 && go.location.includes('facebook.com'), go.status + ' ' + go.location.slice(0, 60));
    const pA = await get(B, jar, '/api/profile');
    t('C5 (a) abrir el OAuth ya NO arma el cartel: ig_pending=false', pA.data && pA.data.ig_pending === false, JSON.stringify(pA.data && pA.data.ig_pending));
    // (b) retorno del flujo con error → cartel activo
    const cb = await get(B, jar, '/api/ig/callback?error=access_denied&error_description=denied');
    t('C6 callback con error redirige a la app con ig=error', cb.status === 302 && cb.location.includes('ig=error'), cb.status + ' ' + cb.location.slice(0, 80));
    const pB = await get(B, jar, '/api/profile');
    t('C7 (b) vuelta sin completar: ig_pending=true', pB.data && pB.data.ig_pending === true, JSON.stringify(pB.data && pB.data.ig_pending));
    // (d) señal vencida → sin cartel
    await sleep(3400);
    const pD = await get(B, jar, '/api/profile');
    t('C8 (d) señal fuera de ventana: ig_pending=false', pD.data && pD.data.ig_pending === false, JSON.stringify(pD.data && pD.data.ig_pending));
    // señal fresca otra vez, y (c) conexión completada → sin cartel
    await get(B, jar, '/api/ig/callback?error=access_denied&error_description=denied');
    const pB2 = await get(B, jar, '/api/profile');
    t('C9 la señal se puede rearmar tras vencer', pB2.data && pB2.data.ig_pending === true);
    const me = await get(B, jar, '/api/auth/me');
    const uid = me.data && me.data.user && me.data.user.id;
    let dbOk = false;
    try {
      const { DatabaseSync } = require('node:sqlite');
      for (let i = 0; i < 10 && !dbOk; i++) {
        try {
          const db = new DatabaseSync(path.join(DATA_REL, 'posta.db'));
          db.exec('PRAGMA busy_timeout = 5000');
          db.prepare('UPDATE profiles SET ig_connected = 1 WHERE user_id = ?').run(uid);
          db.close(); dbOk = true;
        } catch (e) { await sleep(300); }
      }
    } catch (e) {}
    const pC = await get(B, jar, '/api/profile');
    t('C10 (c) conectado: ig_pending=false e ig_connected verdadero', dbOk && pC.data && pC.data.ig_pending === false && !!pC.data.ig_connected, JSON.stringify(pC.data && { p: pC.data.ig_pending, c: pC.data.ig_connected }));
    // bundle e index servidos
    const idx = await (await fetch(`${B}/`)).text();
    t('C11 index servido trae app.js?v=692', idx.includes('/app.js?v=692'));
    const bundle = await (await fetch(`${B}/app.js?v=692`)).text();
    t('C12 bundle servido: copia nueva ES+EN, sin afirmación vieja', bundle.includes('La conexión con Instagram no se completó') && bundle.includes("Your Instagram connection didn't finish") && !bundle.includes('Tu sesión ya quedó iniciada'));
  } finally {
    const okKill = await killBoot(rel.proc, PUERTO_REL);
    t('C13 boot release muerto por PID exacto y puerto libre', okKill, 'pid ' + rel.proc.pid);
    fs.rmSync(DATA_REL, { recursive: true, force: true });
  }

  // ---------- D. Control sobre la base ----------
  console.log('D. Control base v994 (el bug se reproduce)');
  const bas = await boot(BASE, PUERTO_BASE, DATA_BASE, {});
  const BB = `http://127.0.0.1:${PUERTO_BASE}`;
  try {
    t('D1 boot base levanta', bas.up, bas.out().slice(-300));
    const verB = await (await fetch(`${BB}/api/version`)).json();
    t('D2 /api/version base = v994', verB && verB.build === '20261105-v994', JSON.stringify(verB));
    const jarB = cookieJar();
    await registrar(BB, jarB, 'banner-c6-base@example.com');
    await get(BB, jarB, '/api/ig/go');
    const pBase = await get(BB, jarB, '/api/profile');
    t('D3 BASE: abrir el OAuth SÍ arma el cartel (ig_pending=true) — bug reproducido', pBase.data && pBase.data.ig_pending === true, JSON.stringify(pBase.data && pBase.data.ig_pending));
  } finally {
    const okKill = await killBoot(bas.proc, PUERTO_BASE);
    t('D4 boot base muerto por PID exacto y puerto libre', okKill, 'pid ' + bas.proc.pid);
    fs.rmSync(DATA_BASE, { recursive: true, force: true });
  }

  console.log(`\n=== correctivo-6 banner: ${pass} ok · ${fail} fail ===`);
  if (failed.length) console.log('fallaron: ' + failed.join(' | '));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXCEPCIÓN', e); process.exit(2); });
