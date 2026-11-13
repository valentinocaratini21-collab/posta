// test-lote-l8-popup-post-wow.js — LOTE L8-POPUP-POST-WOW (v981; re-base del provisional v954 sobre HEAD v980)
// Veredicto re-prueba de Veja 12/11 12:04: el popup post-wow («Este posteo
// sale hoy a las 19:00 en tu perfil») NUNCA apareció espontáneamente.
// Causas: (1) el gate `if (!(PROFILE && PROFILE.ig_pending))` en render()
// mataba el popup siempre que el banner ig_pending estaba visible;
// (2) el dismiss del popup era PERMANENTE (localStorage '1', sin vencimiento).
// FIX (solo public/app.js + estampados): el banner ig_pending ya NO mata el
// popup post-wow (el wow lo atraviesa; sin wow el banner sigue cubriendo) y
// el dismiss vence a las 24 h (la prueba dura 3 días: el popup tiene que
// poder reaparecer al día siguiente). El contenido del popup (día/hora reales
// de scheduled_at), la tarjeta de email post-wow (v929), el flujo de conexión
// (GET /api/ig/go, igAttemptAt) y el banner en sí NO se tocan.
// Uso: cd release && node test-lote-l8-popup-post-wow.js
// Secciones: A estáticos · B VM (comportamiento del popup) · C boot en vivo
// del release · D regresión v929 (anclas base v980 vs release, sin pins de
// versión: la suite v929 original está pineada a v928/v929 y no se re-corre).
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname; // release/
const BASE = path.join(ROOT, '..', 'base-v980');
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
const srvRel = read(path.join(ROOT, 'server.js'));
const idxEsRel = read(path.join(ROOT, 'public/index.html'));

// ---------- A. Estáticos ----------
console.log('A. Estáticos (L8)');
t('A1 igPopupWow definida (def + 1 uso en el gate)', countOcc(appRel, 'function igPopupWow(tab)') === 1 && countOcc(appRel, 'const wow = igPopupWow(tab);') === 1);
t('A2 igPopupDismissed/igPopupDismiss + TTL 24 h definidos', countOcc(appRel, 'function igPopupDismissed()') === 1 && countOcc(appRel, 'function igPopupDismiss()') === 1 && countOcc(appRel, 'const IG_DISMISS_TTL_MS = 24 * 60 * 60 * 1000;') === 1);
t('A3 gate nuevo: sin wow + ig_pending no sale', countOcc(appRel, 'if (!wow && PROFILE.ig_pending) return;') === 1);
t('A4 call site incondicional; el gate viejo murió', countOcc(appRel, 'maybeShowIgPopup(tab); // popup de conectar Instagram') === 1 && countOcc(appRel, 'if (!(PROFILE && PROFILE.ig_pending)) maybeShowIgPopup') === 0);
t('A5 skip guarda timestamp; el \'1\' permanente murió', countOcc(appRel, 'igPopupDismiss();') === 1 && countOcc(appRel, "localStorage.setItem(igDismissKey(), '1')") === 0);
t('A6 dismiss viejo solo se lee con TTL (nada de `if (dismissed) return`)', countOcc(appRel, 'if (dismissed) return;') === 0 && countOcc(appRel, 'if (igPopupDismissed()) return;') === 1);
t('A7 legado \'1\' se trata como vencido', appRel.includes("if (!isFinite(ts) || ts <= 0) return false; // legado '1': vencido"));
t('A8 BUILD v981 x1 en server.js, v980 x0', countOcc(srvRel, "const BUILD_ID = '20261105-v981';") === 1 && countOcc(srvRel, '20261105-v980') === 0);
t('A9 index ES app.js?v=676 x1, ?v=674 x0; styles.css?v=20261270 intacto', countOcc(idxEsRel, '/app.js?v=676') === 1 && countOcc(idxEsRel, '/app.js?v=674') === 0 && countOcc(idxEsRel, 'styles.css?v=20261270') === 1);
t('A10 styles.css e index EN byte-idénticos a la base', md5(path.join(ROOT, 'public/styles.css')) === md5(path.join(BASE, 'public/styles.css')) && md5(path.join(ROOT, 'public/en/index.html')) === md5(path.join(BASE, 'public/en/index.html')));
t('A11 banner ig_pending intacto (renderIgResume sigue con su gate)', countOcc(appRel, 'function renderIgResume()') === 1 && countOcc(appRel, 'PROFILE.ig_pending && !PROFILE.ig_connected') === 1 && countOcc(appRel, '¡Casi terminás!') === 1);
t('A12 contenido del popup intacto (overlay, Go, Skip, subtítulo wow)', countOcc(appRel, "ov.id = 'igFirstOverlay';") === 1 && countOcc(appRel, "id=\"igFirstGo\"") === 1 && countOcc(appRel, "id=\"igFirstSkip\"") === 1 && countOcc(appRel, 'Este posteo sale ${cuandoPop} en tu perfil') === 1 && countOcc(appRel, 'This post goes out ${cuandoPop} on your profile') === 1);
t('A13 gate M78: las funciones que llama el código nuevo existen definidas', ['function igPopupWow(', 'function igPopupDismissed(', 'function igPopupDismiss(', 'function igDismissKey(', 'function pzIsGuest(', 'function pzIc(', 'function igConnectHere('].every((s) => appRel.includes(s)) && ['pzWhenRelDay =', 'pzHoyHoraCorta =', 'pzHoyCuandoCorto =', 'pcTz =', 'pcParseDate ='].every((s) => appRel.includes(s)));
t('A14 app.js +30 líneas (32823 -> 32853) y server.js misma cantidad (BUILD solo)', appRel.split('\n').length === appBase.split('\n').length + 30);

// ---------- B. VM: comportamiento del popup ----------
console.log('B. VM (maybeShowIgPopup real, DOM falso)');
// Extrae igDismissKey + helpers + igPopupWow + maybeShowIgPopup del bundle.
const sliceStart = appRel.indexOf('function igDismissKey()');
const sliceEnd = appRel.indexOf('/* ---------- toast global ---------- */');
const slice = appRel.slice(sliceStart, sliceEnd);
t('B0 slice extraído (helpers + maybeShowIgPopup)', slice.includes('function maybeShowIgPopup(tab)') && slice.includes('function igPopupWow(tab)') && slice.includes('IG_DISMISS_TTL_MS'));

function makeCtx(opts) {
  const o = opts || {};
  const store = new Map(Object.entries(o.storage || {}));
  const els = {};
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: (k) => store.delete(k),
  };
  function makeEl() {
    const el = {
      id: '', className: '', innerHTML: '', style: {}, dataset: {}, children: [],
      _qs: {},
      querySelector(sel) { if (!this._qs[sel]) this._qs[sel] = { onclick: null, style: {} }; return this._qs[sel]; },
      querySelectorAll() { return []; },
      appendChild(c) { this.children.push(c); if (c && c.id) els[c.id] = c; return c; },
      remove() { if (this.id) delete els[this.id]; },
    };
    return el;
  }
  const body = makeEl();
  const ctx = {
    ME: o.me || { id: 94, lang: 'es' },
    PROFILE: o.profile || { ig_connected: false, ig_pending: false },
    PZ_HOY_POSTS: o.posts || {},
    PZ_HOY_POST_ID: o.postId || '',
    pzIsGuest: () => !!o.guest,
    pcTz: () => 'America/Argentina/Buenos_Aires',
    pcParseDate: (s) => new Date(String(s).replace(' ', 'T')),
    pzWhenRelDay: () => ((o.me && o.me.lang === 'en') ? 'today' : 'hoy'),
    pzHoyHoraCorta: () => ((o.me && o.me.lang === 'en') ? '7:00 PM' : '19:00'),
    pzHoyCuandoCorto: () => '',
    pzIc: () => '',
    igConnectHere: function () {},
    navigator: {},
    localStorage,
    document: {
      getElementById: (id) => els[id] || null,
      createElement: () => makeEl(),
      body,
      querySelector: () => null,
    },
    console,
    Date,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(slice, ctx, { filename: 'app-popup-slice.js' });
  return {
    ctx, store, els,
    call(tab) { return vm.runInContext('maybeShowIgPopup(' + JSON.stringify(tab) + ')', ctx); },
    overlay() { return els['igFirstOverlay'] || null; },
    sub() { const ov = els['igFirstOverlay']; if (!ov) return null; const m = String(ov.innerHTML).match(/class="pz-exp-sub">([^<]*)/); return m ? m[1] : null; },
    clickSkip() { const ov = els['igFirstOverlay']; if (!ov) return false; const b = ov.querySelector('#igFirstSkip'); if (b && b.onclick) { b.onclick({ preventDefault() {} }); return true; } return false; },
  };
}
const WOW_POSTS = { '636': { scheduled_at: '2026-11-12 19:00:00', status: 'scheduled' } };
const NOW = Date.now();

// B1: con banner ig_pending visible, el popup post-wow aparece igual (el fix).
{
  const e = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636' });
  e.call('inicio');
  t('B1 wow + ig_pending: el popup APARECE (banner no lo mata)', !!e.overlay());
  t('B1b subtítulo wow con día/hora reales', e.sub() === 'Este posteo sale hoy a las 19:00 en tu perfil');
}
// B2: sin ig_pending, el wow aparece como antes.
{
  const e = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: false }, posts: WOW_POSTS, postId: '636' });
  e.call('inicio');
  t('B2 wow sin ig_pending: aparece con subtítulo real', !!e.overlay() && e.sub() === 'Este posteo sale hoy a las 19:00 en tu perfil');
}
// B3: sin wow + ig_pending → no aparece (el banner sigue cubriendo).
{
  const e = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: {}, postId: '' });
  e.call('inicio');
  t('B3 sin wow + ig_pending: NO aparece (banner cubre)', !e.overlay());
}
// B4: sin wow y sin ig_pending → aparece con copia genérica.
{
  const e = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: false }, posts: {}, postId: '' });
  e.call('inicio');
  t('B4 sin wow y sin ig_pending: aparece genérico', !!e.overlay() && e.sub() === 'Así Posty deja tu semana lista para publicar.');
}
// B5: wow fuera de Inicio (chat) + ig_pending → no aparece (el wow es de Inicio).
{
  const e = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636' });
  e.call('chat');
  t('B5 wow en chat + ig_pending: NO aparece', !e.overlay());
}
// B6: dismiss vigente (<24 h) bloquea incluso el wow; vencido (>24 h) no; legado '1' no bloquea.
{
  const key = 'posta_ig_dismissed_94';
  const e1 = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636', storage: { [key]: String(NOW - 60 * 1000) } });
  e1.call('inicio');
  t('B6a dismiss de hace 1 min: NO aparece', !e1.overlay());
  const e2 = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636', storage: { [key]: String(NOW - 25 * 3600 * 1000) } });
  e2.call('inicio');
  t('B6b dismiss de hace 25 h: aparece (venció a las 24 h)', !!e2.overlay());
  const e3 = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636', storage: { [key]: '1' } });
  e3.call('inicio');
  t('B6c dismiss legado \'1\': aparece (no es permanente)', !!e3.overlay());
}
// B7: click en «Lo hago después» guarda timestamp y el popup no reaparece hasta vencer.
{
  const key = 'posta_ig_dismissed_94';
  const e = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636' });
  e.call('inicio');
  const clicked = e.clickSkip();
  const saved = e.store.get(key);
  t('B7a skip cierra el overlay y guarda timestamp numérico', clicked && !e.overlay() && /^\d{13}$/.test(saved || '') && Math.abs(Number(saved) - Date.now()) < 5000);
  e.call('inicio');
  t('B7b tras el skip, el popup no reaparece en el acto', !e.overlay());
}
// B8: IG ya conectado → nunca aparece, ni con wow.
{
  const e = makeCtx({ guest: true, profile: { ig_connected: true, ig_pending: false }, posts: WOW_POSTS, postId: '636' });
  e.call('inicio');
  t('B8 ig_connected: NO aparece ni con wow', !e.overlay());
}
// B9: invitado en inglés → subtítulo wow en inglés.
{
  const e = makeCtx({ guest: true, me: { id: 94, lang: 'en' }, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636' });
  e.call('inicio');
  t('B9 wow en inglés con ig_pending', !!e.overlay() && e.sub() === 'This post goes out today at 7:00 PM on your profile');
}
// B10: segundo render no duplica el overlay.
{
  const e = makeCtx({ guest: true, profile: { ig_connected: false, ig_pending: true }, posts: WOW_POSTS, postId: '636' });
  e.call('inicio');
  e.call('inicio');
  t('B10 doble render: un solo overlay', !!e.overlay() && Object.keys(e.els).filter((k) => k === 'igFirstOverlay').length === 1);
}

// ---------- C. Boot en vivo del release ----------
console.log('C. Boot (release, DATA_DIR temporal)');
const PUERTO = 35011;
const DATA_DIR = '/tmp/l8-v981-data';
const BOOT = (async () => {
  const { execSync } = require('child_process');
  try { execSync('ss -ltn | grep -q ":' + PUERTO + '"') && t('C0 puerto ' + PUERTO + ' libre antes del boot', false, 'ocupado'); } catch (e) { /* libre: grep sin match */ }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const env = { ...process.env, PORT: String(PUERTO), DATA_DIR, SESSION_SECRET: 'test-v981', ADMIN_TOKEN: 'test-admin-v981', NODE_PATH: '/home/hatch/workspace/posta/node_modules' };
  delete env.MP_ACCESS_TOKEN; delete env.MP_PUBLIC_KEY; delete env.STRIPE_SECRET_KEY;
  delete env.META_APP_ID; delete env.META_APP_SECRET; delete env.META_ACCESS_TOKEN;
  const proc = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  const pid = proc.pid;
  try {
    let vivo = false;
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      try { const v = await fetch('http://127.0.0.1:' + PUERTO + '/api/version'); const j = await v.json(); if (j && j.build) { vivo = true; break; } } catch (e) {}
    }
    t('C1 boot levanta y /api/version responde', vivo, out.slice(-300));
    const ver = await (await fetch('http://127.0.0.1:' + PUERTO + '/api/version')).json();
    t('C2 /api/version = BUILD v981', ver && ver.build === '20261105-v981', JSON.stringify(ver));
    const idx = await (await fetch('http://127.0.0.1:' + PUERTO + '/')).text();
    t('C3 index servido trae app.js?v=676', idx.includes('/app.js?v=676'));
    const bundle = await (await fetch('http://127.0.0.1:' + PUERTO + '/app.js?v=676')).text();
    t('C4 bundle servido trae igPopupWow + dismiss con TTL', bundle.includes('function igPopupWow(tab)') && bundle.includes('IG_DISMISS_TTL_MS = 24 * 60 * 60 * 1000'));
    t('C5 bundle servido NO trae el gate viejo', !bundle.includes('if (!(PROFILE && PROFILE.ig_pending)) maybeShowIgPopup'));
  } finally {
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    await sleep(1500);
    let muerto = false;
    try { process.kill(pid, 0); } catch (e) { muerto = true; }
    t('C6 boot muerto por PID exacto (SIGTERM)', muerto, 'pid ' + pid + ' sigue vivo');
    let puertoLibre = false;
    try { await fetch('http://127.0.0.1:' + PUERTO + '/api/version'); } catch (e) { puertoLibre = true; }
    t('C7 puerto ' + PUERTO + ' libre tras matar el boot', puertoLibre);
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
})();

// ---------- D. Regresión v929 (anclas base vs release) ----------
console.log('D. Regresión v929 (base v980 vs release, conteos iguales)');
const srvBase = read(path.join(BASE, 'server.js'));
const emlBase = read(path.join(BASE, 'email.js'));
const emlRel = read(path.join(ROOT, 'email.js'));
function eq(name, sub, file) {
  const b = countOcc(file === 'srv' ? srvBase : (file === 'eml' ? emlBase : appBase), sub);
  const r = countOcc(file === 'srv' ? srvRel : (file === 'eml' ? emlRel : appRel), sub);
  t(name + ' (base ' + b + ' = release ' + r + ')', b === r && b > 0);
}
eq('D1 tarjeta de email post-wow pzPostWowEmailHTML', 'pzPostWowEmailHTML', 'app');
eq('D2 POST /api/trial/notify-email', "/api/trial/notify-email", 'srv');
eq('D3 GET /api/guest/resume', "/api/guest/resume", 'srv');
eq('D4 plantilla trialPostReadyEmail (email.js)', 'trialPostReadyEmail', 'eml');
eq('D5 igConnectHere (botón Conectar del popup)', 'function igConnectHere(', 'app');
eq('D6 banner «terminar de conectar» renderIgResume', 'function renderIgResume()', 'app');
eq('D7 overlay del popup (id + Go + Skip)', 'igFirstOverlay', 'app');
eq('D8 copy «Lo hago después»', 'Lo hago después', 'app');
eq('D9 endpoint GET /api/ig/go intacto', "/api/ig/go", 'srv');
eq('D10 igAttemptAt (flujo de conexión) intacto', 'igAttemptAt', 'srv');

BOOT.then(() => {
  console.log('\n== RESULTADO ==');
  console.log('ok: ' + pass + ' · mal: ' + fail);
  if (fail > 0) { console.log('FALLA: ' + failed.join(' | ')); process.exitCode = 1; }
  else { console.log('TODO VERDE.'); }
  // Limpieza: el release no debe quedar con data/.
  if (fs.existsSync(path.join(ROOT, 'data'))) console.log('AVISO: release/data/ existe (no debería).');
});
