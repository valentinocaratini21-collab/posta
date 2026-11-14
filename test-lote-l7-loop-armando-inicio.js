// test-lote-l7-loop-armando-inicio.js
// LOTE L7 · LOOP-ARMANDO-INICIO — el loop «armando» de 5 s x 24 tambien en Inicio.
// Se corre desde la raiz del scratch: node release/test-lote-l7-loop-armando-inicio.js
// (las rutas se resuelven por __dirname, no por cwd).
// ADAPTACION DEL PREPARADOR (base viva v1059 -> v1060): re-pines de estampado
// (BUILD v946->v1060, ?v=656->722, styles 20261270->20261282, BASE base-v942->base),
// A12 por membresia de funcion (los rangos numericos de v942 quedaron viejos) y
// A13 con la forma viva de la condicion (generating || trial_arming, deriva
// v1026/v1034: el lote no toca las condiciones, solo la linea del timer).
// El resto de la suite es byte-identica a la del builder.
// [A] estaticos de estampado · [B] VM del loop (fakes de timers/DOM) · [C] boot real.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.dirname(__dirname); // raiz del scratch
const REL = path.join(ROOT, 'release');
const BASE = path.join(ROOT, 'base');
const PORT = 35009;

let ok = 0, mal = 0;
function t(name, cond, extra) {
  if (cond) { ok++; console.log('  ok - ' + name); }
  else { mal++; console.log('  FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}
const cnt = (s, sub) => (s.split(sub).length - 1);
const md5 = (f) => crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex');
const read = (f) => fs.readFileSync(f, 'utf8');
const lines = (s) => s.split('\n');

console.log('== A) estaticos ==');
const SRV = read(path.join(REL, 'server.js'));
const SRV_B = read(path.join(BASE, 'server.js'));
const APP = read(path.join(REL, 'public', 'app.js'));
const APP_B = read(path.join(BASE, 'public', 'app.js'));
const IDX = read(path.join(REL, 'public', 'index.html'));
const IDX_EN = read(path.join(REL, 'public', 'en', 'index.html'));
const STY = read(path.join(REL, 'public', 'styles.css'));

// A1-A3 estampado
t('A1 BUILD v1060 x1 en server.js, v1059 x0', cnt(SRV, "20261105-v1060") === 1 && cnt(SRV, "20261105-v1059") === 0);
t('A2 app.js?v=722 x1 en index ES; ?v=721/656 x0', cnt(IDX, 'app.js?v=722') === 1 && cnt(IDX, 'app.js?v=721') === 0 && cnt(IDX, 'app.js?v=656') === 0);
t('A3 styles?v=20261282 x1 en ambos index; EN sin app.js?v=', cnt(IDX, 'styles.css?v=20261282') === 1 && cnt(IDX_EN, 'styles.css?v=20261282') === 1 && cnt(IDX_EN, 'app.js?v=') === 0);
// A4 md5s: app.js e index ES cambiaron; styles e index EN identicos a base
t('A4 app.js cambio vs base; styles.css e index EN identicos', md5(path.join(REL, 'public', 'app.js')) !== md5(path.join(BASE, 'public', 'app.js')) && md5(path.join(REL, 'public', 'styles.css')) === md5(path.join(BASE, 'public', 'styles.css')) && md5(path.join(REL, 'public', 'en', 'index.html')) === md5(path.join(BASE, 'public', 'en', 'index.html')));
// A5 server.js: exactamente 1 linea distinta (el BUILD)
{
  const a = lines(SRV_B), b = lines(SRV);
  let diff = 0, diffLine = '';
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { diff++; diffLine = b[i] || ''; }
  t('A5 server.js difiere de base en exactamente 1 linea (BUILD)', a.length === b.length && diff === 1 && diffLine.includes("20261105-v1060"), 'diff=' + diff);
}
// A6 index ES: exactamente 1 linea distinta (el ?v=)
{
  const a = lines(read(path.join(BASE, 'public', 'index.html'))), b = lines(IDX);
  let diff = 0, diffLine = '';
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { diff++; diffLine = b[i] || ''; }
  t('A6 index ES difiere de base en exactamente 1 linea (?v=)', a.length === b.length && diff === 1 && diffLine.includes('app.js?v=722'), 'diff=' + diff);
}
// A7 guardian y helper presentes con los conteos exactos
t('A7 pzScheduleRender(8000) x3 (chat/schedule/inicio)', cnt(APP, 'pzScheduleRender(8000)') === 3);
t('A8 pzScheduleRender(5000) x1 (el loop de 5 s)', cnt(APP, 'pzScheduleRender(5000)') === 1);
const codeLines = (src) => lines(src).filter((ln) => !ln.trim().startsWith('//'));
const codeCnt = (src, sub) => codeLines(src).join('\n').split(sub).length - 1;
t('A9 pzScheduleRender def x1 + PZ_RENDER_T x4 en codigo', cnt(APP, 'function pzScheduleRender(delayMs)') === 1 && codeCnt(APP, 'PZ_RENDER_T') === 4);
t('A10 pzHsGenLoop def x1 + llamada en bindApp x1', cnt(APP, 'function pzHsGenLoop()') === 1 && cnt(APP, 'pzHsGenLoop();') === 1);
// A11 el patron viejo de 8 s queda SOLO en el bloque muerto de bindChatView
{
  const ls = lines(APP);
  const oldIdx = [];
  ls.forEach((ln, i) => { if (ln.includes("setTimeout(() => { try { if ((location.hash")) oldIdx.push(i + 1); });
  const bindStart = ls.findIndex((ln) => ln.includes('async function bindChatView()')) + 1;
  const bindEnd = ls.findIndex((ln) => ln.includes('// Nudge proactivo')) + 1;
  t('A11 patron viejo de 8 s x1 y dentro de bindChatView (muerto, intacto)', oldIdx.length === 1 && oldIdx[0] > bindStart && oldIdx[0] < bindEnd, 'lineas=' + oldIdx.join(','));
}
// A12 los tres sitios de 8 s estan en chatView / scheduleView / inicioView
// (membresia por funcion contenedora: los rangos numericos de la base v942
// quedaron viejos con la deriva; la contenedora se busca hacia arriba)
{
  const ls = lines(APP);
  const sites = [];
  ls.forEach((ln, i) => { if (ln.includes('pzScheduleRender(8000)')) sites.push(i + 1); });
  const holder = (ln) => {
    for (let j = ln - 1; j >= 0; j--) {
      const m = ls[j].match(/^(?:async )?function ([A-Za-z_$][\w$]*)/);
      if (m) return m[1];
    }
    return '';
  };
  t('A12 los 3 sitios 8 s estan en chatView/scheduleView/inicioView', sites.length === 3 && holder(sites[0]) === 'chatView' && holder(sites[1]) === 'scheduleView' && holder(sites[2]) === 'inicioView', 'lineas=' + sites.join(',') + ' holders=' + sites.map(holder).join('/'));
}
// A13 condiciones de 8 s intactas (la condicion viva generating||trial_arming a <=10 lineas arriba de cada sitio)
{
  const ls = lines(APP);
  const sites = [];
  ls.forEach((ln, i) => { if (ln.includes('pzScheduleRender(8000)')) sites.push(i); });
  const allOk = sites.every((idx) => { const w = ls.slice(Math.max(0, idx - 10), idx + 1).join('\n'); return w.includes('generating') && w.includes('er.trial_arming'); });
  t('A13 condiciones (generating || trial_arming) intactas arriba de cada sitio 8 s', allOk);
}
// A14 hs_gen_retry: x4 en el bloque muerto + x4 en el helper = x8 total
t('A14 hs_gen_retry x8 en codigo (x4 muerto + x4 helper)', codeCnt(APP, 'hs_gen_retry') === 8 && codeCnt(APP_B, 'hs_gen_retry') === 4);
// A15 bindChatView byte-identico a base (codigo muerto preservado)
{
  const slice = (src) => src.slice(src.indexOf('async function bindChatView()'), src.indexOf('// Nudge proactivo'));
  t('A15 bindChatView byte-identico a base (no se toco el muerto)', slice(APP) === slice(APP_B));
}
// A16 f3MaybeWatchLive intacto (loop del feed: 4 s x 75)
{
  const s0 = APP.indexOf('function f3MaybeWatchLive()');
  const s1 = APP.slice(s0, APP.indexOf('/* ---------- Init Frente 3', s0));
  t('A16 f3MaybeWatchLive intacto (4 s, tope 75)', s1.includes('4000') && s1.includes('polls >= 75') && s1.includes('setInterval'));
}
// A17 el helper mira las tres clases de tarjeta
{
  const s0 = APP.indexOf('function pzHsGenLoop()');
  const s1 = APP.slice(s0, APP.indexOf('function bindApp(tab)', s0));
  t('A17 pzHsGenLoop mira .hs-generating/.hs-completing/.igmock-pending', s1.includes('.hs-generating') && s1.includes('.hs-completing') && s1.includes('.igmock-pending'));
}
// A18 el helper corre en Inicio y en chat, con tope 24
{
  const s0 = APP.indexOf('function pzHsGenLoop()');
  const s1 = APP.slice(s0, APP.indexOf('function bindApp(tab)', s0));
  t('A18 pzHsGenLoop gate inicio+chat y tope n < 24', s1.includes("startsWith('#/app/chat')") && s1.includes("startsWith('#/app/inicio')") && s1.includes('n < 24'));
}
// A19 sin release/data/
t('A19 sin release/data/', !fs.existsSync(path.join(REL, 'data')));

console.log('== B) VM del loop ==');
// Extraer el bloque helper (var + 2 funciones) tal cual vive en app.js
const hStart = APP.indexOf('var PZ_RENDER_T = null;');
const hEnd = APP.indexOf('function bindApp(tab) {');
if (hStart < 0 || hEnd < 0 || hEnd <= hStart) { t('B0 bloque helper extraible', false); }
else t('B0 bloque helper extraible', true);

function freshCtx(opts) {
  const store = {};
  if (opts.store) Object.assign(store, opts.store);
  let renderCalls = 0;
  let now = 0;
  let nextId = 1;
  const timers = [];
  const sandbox = {
    console,
    location: { hash: opts.hash || '#/app/inicio' },
    document: { querySelector: (sel) => (opts.cardClass ? String(sel).includes(opts.cardClass) : !!opts.card) },
    sessionStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    render: () => { renderCalls++; },
    setTimeout: (fn, ms) => { const id = nextId++; timers.push({ id, fn, at: now + (ms || 0) }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
  };
  sandbox.__state = { store, timers, get renderCalls() { return renderCalls; }, get now() { return now; } };
  sandbox.__advance = (ms) => {
    const end = now + ms;
    for (;;) {
      let best = -1;
      for (let i = 0; i < timers.length; i++) if (timers[i].at <= end && (best < 0 || timers[i].at < timers[best].at)) best = i;
      if (best < 0) break;
      const [tm] = timers.splice(best, 1);
      now = tm.at;
      tm.fn();
    }
    now = end;
  };
  vm.createContext(sandbox);
  vm.runInContext(APP.slice(hStart, hEnd), sandbox);
  return sandbox;
}

{
  // B1 Inicio + tarjeta -> agenda 5 s, contador 1, sin render todavia
  const ctx = freshCtx({ hash: '#/app/inicio', card: true });
  ctx.pzHsGenLoop();
  t('B1 inicio+tarjeta agenda 1 timer de 5000, contador 1, sin render', ctx.__state.timers.length === 1 && ctx.__state.timers[0].at === 5000 && ctx.__state.store.hs_gen_retry === '1' && ctx.__state.renderCalls === 0);
  // B2 avanzar 5 s -> render 1 vez, flag liberado, se puede agendar de nuevo
  ctx.__advance(5000);
  t('B2 a los 5 s render x1 y flag liberado', ctx.__state.renderCalls === 1 && ctx.__state.timers.length === 0);
  ctx.pzHsGenLoop();
  t('B2b tras el render el loop agenda de nuevo (contador 2)', ctx.__state.timers.length === 1 && ctx.__state.store.hs_gen_retry === '2');
}
{
  // B3 chat + tarjeta -> mismo comportamiento que inicio
  const ctx = freshCtx({ hash: '#/app/chat', card: true });
  ctx.pzHsGenLoop();
  t('B3 chat+tarjeta agenda 1 timer de 5000, contador 1', ctx.__state.timers.length === 1 && ctx.__state.timers[0].at === 5000 && ctx.__state.store.hs_gen_retry === '1');
}
{
  // B4 sin tarjeta -> no agenda y limpia el contador
  const ctx = freshCtx({ hash: '#/app/inicio', card: false, store: { hs_gen_retry: '3' } });
  ctx.pzHsGenLoop();
  t('B4 sin tarjeta no agenda y limpia el contador', ctx.__state.timers.length === 0 && !('hs_gen_retry' in ctx.__state.store));
}
{
  // B5 otra tab (ajustes) + tarjeta -> no agenda y limpia el contador
  const ctx = freshCtx({ hash: '#/app/ajustes', card: true, store: { hs_gen_retry: '3' } });
  ctx.pzHsGenLoop();
  t('B5 ajustes+tarjeta no agenda y limpia el contador', ctx.__state.timers.length === 0 && !('hs_gen_retry' in ctx.__state.store));
}
{
  // B6 tope 24 -> no agenda y limpia el contador
  const ctx = freshCtx({ hash: '#/app/inicio', card: true, store: { hs_gen_retry: '24' } });
  ctx.pzHsGenLoop();
  t('B6 contador 24: no agenda y limpia el contador', ctx.__state.timers.length === 0 && !('hs_gen_retry' in ctx.__state.store));
}
{
  // B7 guardian: un sitio de 8 s agenda primero -> el loop difiere (1 solo timer)
  const ctx = freshCtx({ hash: '#/app/inicio', card: true });
  const first = ctx.pzScheduleRender(8000);
  ctx.pzHsGenLoop();
  t('B7 sitio 8 s primero: el loop difiere, 1 solo timer, contador sin tocar', first === true && ctx.__state.timers.length === 1 && ctx.__state.timers[0].at === 8000 && !('hs_gen_retry' in ctx.__state.store));
  // B8 al disparar el timer de 8 s, el loop puede agendar de nuevo
  ctx.__advance(8000);
  t('B8 tras el render de 8 s el flag se libera (render x1)', ctx.__state.renderCalls === 1 && ctx.__state.timers.length === 0);
  ctx.pzHsGenLoop();
  t('B8b el loop agenda 5 s tras liberarse (contador 1)', ctx.__state.timers.length === 1 && (ctx.__state.timers[0].at - ctx.__state.now) === 5000 && ctx.__state.store.hs_gen_retry === '1');
}
{
  // B9 navegacion inicio->chat con timer pendiente: el render igual ocurre (#/app/)
  const ctx = freshCtx({ hash: '#/app/inicio', card: true });
  ctx.pzHsGenLoop();
  ctx.location.hash = '#/app/chat';
  ctx.__advance(5000);
  t('B9 navegar inicio->chat con timer pendiente: el render ocurre igual', ctx.__state.renderCalls === 1);
  ctx.pzHsGenLoop();
  t('B9b en chat el loop sigue (un solo timer, contador 2)', ctx.__state.timers.length === 1 && ctx.__state.store.hs_gen_retry === '2');
}
{
  // B10 doble bindApp en el mismo render: sigue habiendo 1 solo timer
  const ctx = freshCtx({ hash: '#/app/inicio', card: true });
  ctx.pzHsGenLoop();
  ctx.pzHsGenLoop();
  t('B10 doble llamada en el mismo render: 1 solo timer, contador 1', ctx.__state.timers.length === 1 && ctx.__state.store.hs_gen_retry === '1');
}
{
  // B11 el contador solo avanza cuando agenda de verdad (tope 23->24 y stop)
  const ctx = freshCtx({ hash: '#/app/inicio', card: true, store: { hs_gen_retry: '23' } });
  ctx.pzHsGenLoop();
  t('B11 contador 23->24 al agendar', ctx.__state.store.hs_gen_retry === '24' && ctx.__state.timers.length === 1);
  ctx.__advance(5000);
  ctx.pzHsGenLoop();
  t('B11b en 24 ya no agenda y limpia', ctx.__state.timers.length === 0 && !('hs_gen_retry' in ctx.__state.store));
}
{
  // B12 .hs-completing tambien dispara el loop (no solo .hs-generating)
  const ctx = freshCtx({ hash: '#/app/inicio', cardClass: '.hs-completing' });
  ctx.pzHsGenLoop();
  t('B12 .hs-completing dispara el loop', ctx.__state.timers.length === 1 && ctx.__state.store.hs_gen_retry === '1');
  const ctx2 = freshCtx({ hash: '#/app/inicio', cardClass: '.igmock-pending' });
  ctx2.pzHsGenLoop();
  t('B12b .igmock-pending dispara el loop', ctx2.__state.timers.length === 1);
}

console.log('== C) boot real ==');
function getJSON(port, p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, timeout: 5000 }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}
async function bootTest() {
  const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'l7-boot-'));
  const env = Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: dd, NODE_PATH: '/home/hatch/workspace/posta/node_modules' });
  const child = spawn('node', ['server.js'], { cwd: REL, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => { out += c; });
  child.stderr.on('data', (c) => { out += c; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { const r = await getJSON(PORT, '/api/version'); if (r.status === 200) up = true; } catch (e) {}
    }
    t('C1 boot levanta en puerto ' + PORT, up, out.slice(-300));
    if (up) {
      let n = 0;
      for (let i = 0; i < 5; i++) {
        try { const r = await getJSON(PORT, '/api/version'); const j = JSON.parse(r.body); if (j.build === '20261105-v1060') n++; } catch (e) {}
      }
      t('C2 /api/version v1060 5/5', n === 5, 'n=' + n);
      try {
        const r = await getJSON(PORT, '/?v=9');
        t('C3 index ES servido con app.js?v=722 x1 + styles 20261282 x1', r.status === 200 && cnt(r.body, 'app.js?v=722') === 1 && cnt(r.body, 'styles.css?v=20261282') === 1, 'status=' + r.status);
      } catch (e) { t('C3 index ES servido', false, String(e)); }
      try {
        const r = await getJSON(PORT, '/en/?v=9');
        t('C4 index EN servido solo styles, sin app.js?v=', r.status === 200 && cnt(r.body, 'app.js?v=') === 0 && cnt(r.body, 'styles.css?v=20261282') === 1, 'status=' + r.status);
      } catch (e) { t('C4 index EN servido', false, String(e)); }
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => { let done = false; child.on('exit', () => { done = true; r(); }); setTimeout(() => { if (!done) { try { child.kill('SIGKILL'); } catch (e) {} r(); } }, 5000); });
    try { fs.rmSync(dd, { recursive: true, force: true }); } catch (e) {}
  }
}
bootTest().then(() => {
  t('C5 sin release/data/ tras la suite', !fs.existsSync(path.join(REL, 'data')));
  console.log('\ntest-lote-l7-loop-armando-inicio: ' + ok + ' ok, ' + mal + ' mal');
  process.exit(mal ? 1 : 0);
}).catch((e) => { console.log('SUITE CRASH: ' + (e && e.stack || e)); process.exit(2); });
