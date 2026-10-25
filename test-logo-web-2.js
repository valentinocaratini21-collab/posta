#!/usr/bin/env node
// test-logo-web-2.js — (v474, auditoría logo 2º reclamo) El rebote REAL del
// logo de Posty NO estaba en el mecanismo one-shot (v469/v470, sano) sino en
// el handler 401 de api.req + la cláusula de cuentas guardadas de
// hasSessionContext():
//
//   Cadena del rebote (determinista, solo si el dispositivo tiene una
//   cuenta guardada con token en localStorage 'posty_saved_accounts',
//   o sea el caso de Valentino, usuario diario con "Continuar como"):
//   1. Tap en el logo de #/login → onclick marca posta_ver_web=1 →
//      navegación a "/" → ramas one-shot sanas → render #/ pinta la landing.
//   2. Cada render programa ttEnhance a los 80 ms, SIN guarda de slot.
//      ttEnhance corre hasSessionContext(): ME null, hash '#/' (no #/app),
//      PERO la cuenta guardada con token lo hace TRUE → llama
//      /api/tiktok/status → 401 real sin sesión (verificado en vivo).
//   3. api.req ante el 401 (URL fuera de /api/auth/) vuelve a preguntar
//      hasSessionContext() → TRUE por la cuenta guardada →
//      location.hash = '#/login' → render #/login → LA MISMA PANTALLA.
//   En el propio #/login el rebote es invisible (el hash ya es #/login);
//   por eso solo se ve tras el tap del logo. Un tester SIN cuenta guardada
//   NO lo reproduce (hasSessionContext false → sin llamada ni rebote),
//   por eso el censo del bundle parecía sano.
//   pzFillRelacion y enhanceWeekReport NO son vectores en la landing:
//   retornan antes por falta de slot (#relacionSlot / #hs-report no los
//   renderiza landingView).
//
// FIX MÍNIMO (esta tanda): hasSessionContext() ya NO mira las cuentas
// guardadas. Una cuenta guardada NO es una sesión viva y jamás debe
// autorizar un rebote fuera de una ruta pública. Definición nueva:
// hash #/app… O ME vivo. Efectos:
//   - 401 en ruta pública con ME null → NUNCA rebota (v371 restaurado
//     por completo), haya o no cuenta guardada.
//   - ttEnhance retorna antes en rutas públicas sin sesión (además deja
//     de gastar una llamada 401 en cada render público).
//   - Sin regresión: con ME vivo, o en ruta #/app, el rebote se conserva
//     (sesión muerta a mitad de uso / deep-link a la app).
// hasSessionContext() solo tiene 2 consumidores (api.req y ttEnhance).
//
// Este test EJECUTA DE VERDAD el código extraído de app.js (hasSessionContext,
// api, ttStatusOnce, ttEnhance) en vm con fetch/location/storage simulados,
// más la ejecución de los head scripts ES/EN (heredada de test-logo-web).
// Uso: node test-logo-web-2.js  (corre en el dir que contiene public/)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 400) : ''); }
};

const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const enIdx = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');

// ---------- Extractor: del inicio de un símbolo al cierre de su bloque ----------
function extractBlock(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error('no hallado: ' + startMarker);
  const end = endMarker ? src.indexOf(endMarker, start) : -1;
  const slice = end < 0 ? src.slice(start) : src.slice(start, end);
  return slice;
}
function extractBraced(src, startMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error('no hallado: ' + startMarker);
  const open = src.indexOf('{', start);
  let depth = 0, i = open, mode = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (mode === 'line') { if (c === '\n') mode = null; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = null; i++; } continue; }
    if (mode === 'sq' || mode === 'dq' || mode === 'bt') {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"') || (mode === 'bt' && c === '`')) mode = null;
      continue;
    }
    if (c === '/' && n === '/') { mode = 'line'; continue; }
    if (c === '/' && n === '*') { mode = 'block'; continue; }
    if (c === "'") { mode = 'sq'; continue; }
    if (c === '"') { mode = 'dq'; continue; }
    if (c === '`') { mode = 'bt'; continue; }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('sin cierre: ' + startMarker);
}

const hasCtxSrc = extractBraced(app, 'function hasSessionContext()');
const apiSrc = extractBraced(app, 'const api = {');
const ttSrc = extractBlock(app, 'function ttStatusOnce()', 'async function pcShareTikTok');

// ---------- Censo del fix ----------
console.log('— censo: hasSessionContext sin cláusula de cuentas guardadas');
ok('hasSessionContext ya NO lee posty_saved_accounts', !hasCtxSrc.includes('posty_saved_accounts'));
ok('hasSessionContext sigue viendo rutas #/app', hasCtxSrc.includes("startsWith('#/app')"));
ok('hasSessionContext sigue viendo ME vivo', hasCtxSrc.includes('ME'));
ok('api.req conserva el rebote 401 (para sesión viva / ruta app)', app.includes("location.hash = '#/login'"));
ok('one-shot intacto: 3 onclick del logo de auth', (app.split("sessionStorage.setItem('posta_ver_web','1')").length - 1) === 3);
ok('one-shot intacto: PZ_VER_WEB_ONCE en las 2 ramas', app.includes('PZ_VER_WEB_ONCE'));

// ---------- Ejecución real del código extraído ----------
console.log('— ejecución: 401 anónimo en ruta pública con cuenta guardada');
function makeCtx({ hash, me, saved }) {
  const ls = new Map();
  if (saved) ls.set('posty_saved_accounts', JSON.stringify([{ email: 'v@test.com', token: 'tok1' }]));
  const ss = new Map();
  const fetched = [];
  let hashVal = hash;
  const sandbox = {
    console,
    setTimeout, clearTimeout, Promise,
    location: { get hash() { return hashVal; }, set hash(v) { hashVal = v; } },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, v),
      removeItem: (k) => ls.delete(k),
    },
    sessionStorage: {
      getItem: (k) => (ss.has(k) ? ss.get(k) : null),
      setItem: (k, v) => ss.set(k, v),
      removeItem: (k) => ss.delete(k),
    },
    document: { querySelectorAll: () => [] },
    fetch: async (url) => {
      fetched.push(String(url));
      return { ok: false, status: 401, json: async () => ({ error: 'No autenticado' }) };
    },
    AbortSignal: { timeout: () => undefined },
    ME: me || null,
    __ttStatusP: null,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext('let ME = null; let __ttStatusP = null;\n' + hasCtxSrc + '\n' + apiSrc + '\n' + ttSrc, sandbox);
  // ME vive en el contexto: lo seteamos vía el propio contexto
  vm.runInContext('ME = ' + (me ? JSON.stringify(me) : 'null') + ';', sandbox);
  return { sandbox, fetched, get hash() { return hashVal; } };
}

(async () => {
  // CASO 1 — EL RECLAMO: anónimo + cuenta guardada + ruta pública + 401.
  let c = makeCtx({ hash: '#/', me: null, saved: true });
  await vm.runInContext('ttEnhance()', c.sandbox);
  ok('CASO 1 (reclamo): ttEnhance NO llama /api/tiktok/status sin sesión', !c.fetched.some((u) => u.includes('/api/tiktok/status')), c.fetched.join(','));
  ok('CASO 1 (reclamo): el hash NO rebota a #/login', c.hash === '#/', c.hash);
  c = makeCtx({ hash: '#/', me: null, saved: true });
  await vm.runInContext("api.get('/api/tiktok/status').catch(() => {})", c.sandbox);
  ok('CASO 1b: un 401 directo en ruta pública NO rebota con cuenta guardada', c.hash === '#/', c.hash);

  // CASO 2 — v371 preservado: anónimo SIN cuenta guardada, ruta pública.
  c = makeCtx({ hash: '#/', me: null, saved: false });
  await vm.runInContext('ttEnhance()', c.sandbox);
  ok('CASO 2 (v371): sin cuenta guardada tampoco hay llamada ni rebote', c.fetched.length === 0 && c.hash === '#/', JSON.stringify({ f: c.fetched, h: c.hash }));

  // CASO 3 — sin regresión: sesión VIVA + 401 → rebota a #/login.
  c = makeCtx({ hash: '#/app/inicio', me: { id: 1 }, saved: true });
  await vm.runInContext("api.get('/api/tiktok/status').catch(() => {})", c.sandbox);
  ok('CASO 3 (sin regresión): con sesión viva el 401 SÍ rebota a #/login', c.hash === '#/login', c.hash);

  // CASO 4 — sin regresión: ruta #/app sin sesión (deep-link) + 401 → rebota.
  c = makeCtx({ hash: '#/app/inicio', me: null, saved: false });
  await vm.runInContext("api.get('/api/tiktok/status').catch(() => {})", c.sandbox);
  ok('CASO 4 (sin regresión): en ruta #/app el 401 SÍ rebota a #/login', c.hash === '#/login', c.hash);

  // ---------- Head scripts ES/EN (heredado de test-logo-web) ----------
  console.log('— ejecución: head scripts con PWA standalone simulada');
  const headEs = (idx.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  const headEn = (enIdx.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
  function runHead(script, { standalone, hash, flag }) {
    const store = new Map();
    if (flag) store.set('posta_ver_web', '1');
    let replaced = null;
    const sandbox = {
      window: {},
      navigator: { standalone: false },
      screen: { width: 390 },
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
      location: { hash, replace: (u) => { replaced = u; } },
    };
    sandbox.window.matchMedia = () => ({ matches: standalone });
    sandbox.window.innerWidth = 390;
    sandbox.window.screen = { width: 390 };
    sandbox.matchMedia = sandbox.window.matchMedia;
    sandbox.screen = { width: 390 };
    vm.createContext(sandbox);
    vm.runInContext(script, sandbox);
    return { replaced, flagLeft: store.has('posta_ver_web') };
  }
  let r;
  r = runHead(headEs, { standalone: true, hash: '', flag: true });
  ok('ES + flag: NO redirige (se ve la landing)', r.replaced === null, r.replaced);
  ok('ES + flag: la intención queda para app.js', r.flagLeft === true);
  r = runHead(headEs, { standalone: true, hash: '', flag: false });
  ok('ES sin flag: redirige a la app como siempre', r.replaced === '/#/app/inicio' || (typeof r.replaced === 'string' && r.replaced.includes('#/app/')), r.replaced);
  r = runHead(headEn, { standalone: true, hash: '', flag: true });
  ok('EN + flag: NO redirige y consume (página estática)', r.replaced === null && r.flagLeft === false, JSON.stringify(r));

  console.log(`\nlogo-web-2: ${passed} ok, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR DEL HARNESS:', e); process.exit(2); });
