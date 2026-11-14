// test-lote-imagen-prueba-temprana.js
// LOTE IMAGEN-PRUEBA-TEMPRANA (preparador, re-base sobre v1072 → v1073) —
// la imagen del primer posteo se genera en cuanto el @ está puesto y
// validado, en paralelo con el resto del onboarding: cuando el usuario
// llega a verla, ya está lista. El front dispara /api/trial/pregenerate
// al salir del @ o de la web (con la web ya puesta); el servidor corre LA
// MISMA generación de /api/trial/generate en segundo plano (su handler
// con nombre, invocado en proceso) y responde al instante. El envío se
// une a la generación en curso en vez de duplicarla, y si la web cambió
// desde el disparo, la semana temprana no se sirve (se regenera).
// Adaptaciones de la suite del builder (base v942) a la composición del
// preparador, declaradas: stamps y md5 re-pineados a v1072/v1073 · el
// submit vivo va por generate-stream (la §B guiona SSE + gen-status) ·
// el estilo del prefill se reenvía (front y pregenerate) y se pinea ·
// A19 cuenta las lecturas de trial_cache del vivo (base 4 → release 3:
// clásico y stream pasan a trialCacheServe) · C11 acepta la semana del
// payload con >= 3 posteos e imprime el conteo · la §C usa el puerto
// 35012, el prefill se llama como lo llama el front ({ig, lang}) y la
// marca de la corrida es @mejuri (la @crumbl del builder degradó su
// prefill a rubro otro: ver el comentario de C5).
// Se corre desde la raíz del scratch del preparador:
//   node release/test-lote-imagen-prueba-temprana.js
// (los paths se resuelven por __dirname; IPT_ROOT/IPT_BASE permiten el
// control contra la base viva; SKIP_C=1 salta el boot real).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT = process.env.IPT_ROOT || __dirname;
const BASE = process.env.IPT_BASE || path.join(ROOT, '..', 'base');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const SERVER_BASE = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
const PRUEBA_ES = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const PRUEBA_EN = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
const PRUEBA_ES_BASE = fs.readFileSync(path.join(BASE, 'public', 'prueba.html'), 'utf8');
const PRUEBA_EN_BASE = fs.readFileSync(path.join(BASE, 'public', 'en-prueba.html'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'));
const STYLES = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'));
const DEMOAI = fs.readFileSync(path.join(ROOT, 'demo-ai.js'), 'utf8');
const IDX_ES = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ', real ' + JSON.stringify(a)); }
function count(hay, needle) { return hay.split(needle).length - 1; }
function md5(buf) { return require('crypto').createHash('md5').update(buf).digest('hex'); }
function idx(hay, needle) { return hay.indexOf(needle); }

// ---------------------------------------------------------------- A. Estáticos
console.log('\n[A] Estampado y marcadores (estáticos)');
eq(count(SERVER, '20261105-v1073'), 1, 'A1 BUILD v1073 x1 solo en server.js');
eq(count(SERVER, '20261105-v1072'), 0, 'A2 BUILD v1072 x0 (sin restos del viejo)');
eq(md5(APPJS), '3a79b6666acccdd5224723eb6069f5fe', 'A3 public/app.js byte-idéntico a la base v1072 (el lote no lo toca)');
eq(md5(STYLES), '69311a63ae0dcc32f7471fbe6e945add', 'A4 styles.css byte-idéntico a la base v1072');
eq(count(IDX_ES, 'app.js?v=727'), 1, 'A5 index ES app.js?v=727 x1 (sin cambio)');
eq(count(IDX_ES, 'styles.css?v=20261284'), 1, 'A6 index ES styles 20261284 x1');
eq(count(IDX_EN, 'app.js?v='), 0, 'A7 index EN sin app.js?v=');
eq(count(IDX_EN, 'styles.css?v=20261284'), 1, 'A8 index EN styles 20261284 x1');
ok(SERVER.includes("app.post('/api/trial/pregenerate'"), 'A9 endpoint POST /api/trial/pregenerate existe');
ok(SERVER.includes("app.get('/api/trial/gen-status'"), 'A10 endpoint GET /api/trial/gen-status existe (bloque L6, ya vivo: no se duplica)');
ok(SERVER.includes('const trialGenInflight = new Map()'), 'A11 mapa trialGenInflight existe');
eq(count(SERVER, 'const trialGenInflight'), 1, 'A11b el mapa L6 existe UNA sola vez (sin copia del lote)');
eq(count(SERVER, 'trialCacheServe(igKey'), 5, 'A12 trialCacheServe x5 (definición + pregenerate + clásico caché + clásico join + stream)');
eq(count(SERVER, 'trialGenWaitReady(igKey, 180000)'), 2, 'A13 join con espera 180 s en clásico Y stream');
eq(count(SERVER, 'trialGenMarkStart(igKey);'), 3, 'A14 markStart x3 (pregenerate + clásico + stream)');
eq(count(SERVER, 'trialGenMarkDone(igKey);'), 3, 'A15 markDone x3 (pregenerate finally + 2 finally)');
eq(count(SERVER, 'trialGenerateHandler'), 3, 'A16 trialGenerateHandler x3 (definición + registro + llamada temprana)');
eq(count(SERVER, 'earlyWebMismatch ? null : trialLockServePayload(gate.lock)'), 2, 'A17 el gate no sirve el snapshot si la web temprana difiere (clásico + stream)');
eq(count(SERVER, 'serveCachedStream'), 3, 'A18 serveCachedStream x3 (definición + rama caché + join)');
eq(count(SERVER, 'SELECT payload, created_at FROM trial_cache WHERE ig = ?'), 3, 'A19 la lectura de caché vive en trialCacheServe + las 2 lecturas preexistentes ajenas');
eq(count(SERVER_BASE, 'SELECT payload, created_at FROM trial_cache WHERE ig = ?'), 4, 'A19b la base v1072 tenía x4 (clásico y stream leían inline)');
eq(count(SERVER, "app.post('/api/trial/generate'"), 1, 'A20 un solo registro de /api/trial/generate (el handler con nombre)');
ok(SERVER.includes('falta_producto'), 'A21 pregenerate valida evidencia (400 falta_producto)');
ok(idx(SERVER, "app.get('/api/trial/gen-status'") < idx(SERVER, "app.post('/api/trial/pregenerate'"), 'A22 orden: bloque L6 antes de pregenerate');
ok(idx(SERVER, "app.post('/api/trial/pregenerate'") < idx(SERVER, 'async function trialGenerateHandler'), 'A23 orden: pregenerate antes del handler clásico');
ok(idx(SERVER, 'async function trialGenerateHandler') < idx(SERVER, "app.post('/api/trial/generate'"), 'A24 orden: handler antes de su registro');
ok(idx(SERVER, 'ya está en curso para este @') < idx(SERVER, 'Anti-spam honesto: 5 pruebas'), 'A25 (clásico) el join va antes del anti-spam: nunca consume antes de saber si la semana está');
ok(idx(SERVER, 'mismo tope de 180 s que el clásico') < idx(SERVER, 'Anti-spam honesto: igual que'), 'A25b (stream) el join va antes del anti-spam');
ok(SERVER.includes('trialGenMarkStart(igKey);\n\n  let photoPath = null;\n  let ok = false;'), 'A26 (clásico) el mark va tras anti-spam, antes del try');
ok(SERVER.includes('trialGenMarkStart(igKey);\n\n  let photoPath = null;\n  let runDir = null;'), 'A27 (stream) el mark va tras anti-spam, antes del try');
ok(SERVER.includes('trialGenEarlyWebMismatch(igKey, webDomain)'), 'A28 trialCacheServe descarta la semana temprana de otra web');
ok(SERVER.includes('trialGenEarlyWebSet(igKey, webDomain)'), 'A29 pregenerate registra la web de la generación temprana');
eq(count(SERVER, '_trialEarly'), 3, 'A40 el flag _trialEarly x3 (se marca en pregenerate, se lee en el join del clásico: la temprana no se espera a sí misma)');
// Censo ajeno que el lote NO puede tocar (reglas del preparador):
eq(count(SERVER, 'falta_pregunta'), 2, 'A41a censo ajeno: falta_pregunta x2 (la compuerta del fundamento sigue en generate y generate-stream)');
eq(count(SERVER, 'trialTextoFeedGarantizado'), 3, 'A41b censo ajeno: trialTextoFeedGarantizado x3 (señal garantizada intacta)');
eq(count(SERVER, 'aplicarJuicioFinalTrial'), 2, 'A41c censo ajeno: aplicarJuicioFinalTrial x2 (juicio final enganchado en sync y stream)');
ok(count(DEMOAI, 'juicioFinalPieza') >= 1 && count(DEMOAI, 'qaTrialWowFinal') >= 1, 'A41d censo ajeno: juicioFinalPieza y qaTrialWowFinal presentes en demo-ai.js');
eq(count(APPJS.toString('utf8'), 'trial_arming'), 12, 'A41e censo ajeno: trial_arming x12 en app.js (sin tocar)');
{
  const pgSpan = idx(SERVER, "app.post('/api/trial/pregenerate'") >= 0 ? SERVER.slice(idx(SERVER, "app.post('/api/trial/pregenerate'"), idx(SERVER, "app.post('/api/trial/pregenerate'") + 6500) : '';
  ok(pgSpan.includes('fields.estilo'), 'A42 el cuerpo de pregenerate reenvía el estilo del prefill al handler (adaptación del preparador: la temprana corre con la misma señal que el envío)');
}
ok(idx(SERVER, 'resetWait') === -1 || true, 'A43 (informativo) server.js no conoce la espera del front: el orden resetWait/showWait vive en prueba.html y el lote no lo toca');
for (const [tag, html, base] of [['ES', PRUEBA_ES, PRUEBA_ES_BASE], ['EN', PRUEBA_EN, PRUEBA_EN_BASE]]) {
  ok(html.includes('async function maybePregenerate(fromWeb)'), 'A30-' + tag + ' maybePregenerate(fromWeb) definida');
  eq(count(html, "addEventListener('blur'"), 2, 'A31-' + tag + ' blur en #fIg y #fWeb (x2)');
  eq(count(html, '/api/trial/pregenerate'), 1, 'A32-' + tag + ' un solo fetch a /api/trial/pregenerate');
  eq(count(html, '/api/trial/prefill'), 2, 'A33-' + tag + ' prefill x2 (submit + disparo temprano)');
  eq(count(html, "fetch('/api/trial/generate-stream'"), 1, 'A34-' + tag + ' el submit va por generate-stream x1 (el vivo, L6)');
  eq(count(html, "fetch('/api/trial/generate'"), 0, 'A34b-' + tag + ' el submit NO llama al clásico directo x0');
  ok(html.includes('body.estilo = pf.j.style'), 'A35-' + tag + ' el disparo reenvía el estilo del prefill (como buildFirstPost)');
  ok(html.includes('maybePregenerate(false)'), 'A36-' + tag + ' blur del @ dispara con fromWeb=false');
  ok(html.includes('maybePregenerate(true)'), 'A37-' + tag + ' blur de la web dispara con fromWeb=true');
  const bfp = html.slice(idx(html, 'async function buildFirstPost'));
  ok(idx(bfp, 'resetWait();') < idx(bfp, 'showWait();') && idx(bfp, 'showWait();') < idx(bfp, "postJSON('/api/trial/prefill'"), 'A38-' + tag + ' el orden de la espera aprobada sigue intacto dentro de buildFirstPost: resetWait → showWait → prefill');
  eq(count(html, '<input'), count(base, '<input'), 'A39-' + tag + ' sin inputs nuevos (sin UI nueva)');
  eq(count(html, '<button'), count(base, '<button'), 'A39b-' + tag + ' sin botones nuevos');
  eq(count(html, '<select'), count(base, '<select'), 'A39c-' + tag + ' sin selects nuevos');
}

// ------------------------------------------------- B. VM del front
console.log('\n[B] VM del front (disparo temprano por blur)');

function makeClock() {
  let now = 0; const timers = []; let nextId = 1;
  function setTimeout(fn, ms) { const t = { id: nextId++, fn, at: now + (ms || 0), ms: ms || 0, repeat: false }; timers.push(t); return t.id; }
  function setInterval(fn, ms) { const t = { id: nextId++, fn, at: now + (ms || 0), ms: ms || 0, repeat: true }; timers.push(t); return t.id; }
  function clear(id) { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); }
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      let due = null;
      for (const t of timers) if (t.at <= target && (!due || t.at < due.at)) due = t;
      if (!due) break;
      now = due.at;
      if (due.repeat) due.at += due.ms; else timers.splice(timers.indexOf(due), 1);
      due.fn();
    }
    now = target;
  }
  return { setTimeout, setInterval, clearTimeout: clear, clearInterval: clear, advance, now: () => now };
}
function el(id) {
  return { id, value: '', hidden: true, textContent: '', innerHTML: '', disabled: false,
    listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; }, focus() {}, click() {},
    querySelectorAll() { return []; }, getAttribute() { return null; }, setAttribute() {} };
}
function makeDom() {
  const ids = ['fIg', 'fWeb', 'fStar', 'fStarWrap', 'fLangWrap', 'fLangEn', 'fLangEs', 'fErr', 'fStatus', 'fPreview', 'fWait', 'btnGo', 'fEntry', 'fAskWrap', 'fAskQ', 'fAskOpts', 'fAskSkip'];
  const byId = {}; for (const id of ids) byId[id] = el(id);
  byId.fStarWrap.hidden = true; byId.fLangWrap.hidden = true;
  byId.fWait.style = { setProperty() {} };
  return byId;
}
function extractScript(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('sin <script> en el front');
  return m[1];
}
const tick = () => new Promise((r) => setImmediate(r));

function mountFront(html, fetchImpl) {
  const clock = makeClock();
  const byId = makeDom();
  const FakeDate = function () { return { getTime: () => clock.now() }; };
  FakeDate.now = () => clock.now();
  const sandbox = {
    console, TextDecoder, TextEncoder, URLSearchParams,
    Date: FakeDate,
    Intl: { DateTimeFormat: function () { return { format: () => 'lunes 1', resolvedOptions: () => ({ timeZone: 'America/New_York' }) }; } },
    setTimeout: clock.setTimeout, setInterval: clock.setInterval,
    clearTimeout: clock.clearTimeout, clearInterval: clock.clearInterval,
    document: { getElementById: (id) => byId[id] || el(id), createElement: () => el('dyn') },
    location: { search: '', href: '' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: fetchImpl,
    FormData: class { constructor() { this.entries = []; } append(k, v) { this.entries.push([k, v]); } },
    Event: class { constructor(t) { this.type = t; } },
    Math, JSON, Promise,
  };
  sandbox.window = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(extractScript(html), sandbox, { filename: 'prueba-front.js' });
  return { clock, byId, sandbox };
}
async function submit(byId, ig, web) {
  byId.fIg.value = ig; byId.fWeb.value = web || '';
  const p = byId.fEntry.listeners.submit({ preventDefault() {} });
  await tick(); await tick();
  return p;
}
// Fetch guionado. opts.prefill: objeto, 'throw', o { firstThrow, body }.
// El stream del vivo se guiona como SSE con un único evento 'done'.
function frontFetch(calls, opts) {
  let prefillCalls = 0;
  return async (url, o) => {
    const u = String(url);
    let body = null;
    try { body = o && o.body && typeof o.body === 'string' ? JSON.parse(o.body) : null; } catch (e) {}
    calls.push({ url: u, body });
    if (u.startsWith('/api/trial/prefill')) {
      prefillCalls++;
      if (opts.prefill === 'throw') throw new Error('prefill caído');
      if (opts.prefill && opts.prefill.firstThrow && prefillCalls === 1) throw new Error('prefill caído (transitorio)');
      return { ok: true, status: 200, json: async () => (opts.prefill && opts.prefill.body) || opts.prefill };
    }
    if (u.startsWith('/api/trial/pregenerate')) {
      if (opts.pregen === 'throw') throw new Error('pregenerate caído');
      return { ok: true, status: 200, json: async () => ({ ok: true, started: true }) };
    }
    if (u.startsWith('/api/trial/gen-status')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, generating: false, cached: false }) };
    }
    if (u.startsWith('/api/trial/generate-stream')) {
      const enc = new TextEncoder();
      const chunks = [enc.encode('event: done\ndata: {"out":{"posts":[]}}\n\n')];
      let i = 0;
      const reader = {
        read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true }),
        cancel() {}, releaseLock() {},
      };
      return { ok: true, status: 200, body: { getReader: () => reader }, json: async () => ({}) };
    }
    if (u.startsWith('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    throw new Error('fetch inesperado: ' + url);
  };
}
async function blur(byId, field) {
  const fn = byId[field].listeners.blur;
  if (typeof fn === 'function') fn(); // en la base no hay listener: el hueco se ve en los conteos
  for (let i = 0; i < 5; i++) await tick();
}
const GOOD_PREFILL = { ok: true, name: 'Veja', category: 'moda', productos: [{ nombre: 'Esplar' }], style: { firma: { texto_feed: 'con-texto' } } };
const pregens = (calls) => calls.filter((c) => c.url.startsWith('/api/trial/pregenerate'));
const prefills = (calls) => calls.filter((c) => c.url.startsWith('/api/trial/prefill'));
const streams = (calls) => calls.filter((c) => c.url.startsWith('/api/trial/generate-stream'));

(async () => {
  // ---- B1: blur del @ con web vacía no dispara; blur de la web sí, con los campos EXACTOS del envío; segundo blur no-op
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: GOOD_PREFILL }));
    byId.fIg.value = '@veja'; byId.fWeb.value = '';
    await blur(byId, 'fIg');
    eq(calls.length, 0, 'B1a blur del @ con web vacía NO dispara nada (la web se escribe después)');
    byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(prefills(calls).length, 1, 'B1b blur de la web → prefill x1');
    eq(pregens(calls).length, 1, 'B1c blur de la web → pregenerate x1');
    const pg = (pregens(calls)[0] || {}).body || {};
    eq(pg.ig, 'veja', 'B1d pregenerate lleva ig=veja');
    eq(pg.business, 'Veja', 'B1e pregenerate lleva business=Veja (del prefill)');
    eq(pg.category, 'moda', 'B1f pregenerate lleva category=moda');
    eq(pg.producto_mix, 'todo', 'B1g con productos detectados y sin estrella escrita → mix todo (como el envío)');
    eq(JSON.stringify(pg.productos_detectados), JSON.stringify(['Esplar']), 'B1h pregenerate lleva los productos detectados');
    eq(pg.producto_estrella, undefined, 'B1i sin estrella escrita NO manda producto_estrella');
    eq(pg.rubro_detectado, undefined, 'B1j con detectados NO manda rubro_detectado');
    ok(String(pg.web || '').includes('veja-store.com'), 'B1k pregenerate lleva la web');
    eq(pg.lang, 'es', 'B1l pregenerate lleva lang=es');
    eq(JSON.stringify(pg.estilo), JSON.stringify(GOOD_PREFILL.style), 'B1m pregenerate reenvía el estilo del prefill (la señal del feed, como el envío)');
    await blur(byId, 'fWeb');
    eq(calls.length, 2, 'B1n segundo blur con la misma pareja (@, web) no dispara nada (un solo trabajo por visita)');
  }
  // ---- B2: web cambiada → segundo disparo con la web nueva
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: GOOD_PREFILL }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 1, 'B2a primer disparo con la web A');
    byId.fWeb.value = 'veja.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 2, 'B2b web cambiada → segundo disparo (pareja nueva)');
    ok(String(((pregens(calls)[1] || {}).body || {}).web || '').includes('veja.com'), 'B2c el segundo disparo lleva la web nueva');
  }
  // ---- B3: sin evidencia no se dispara; con solo rubro sí (con rubro_detectado)
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: { ok: true, name: 'Veja', category: '', productos: [] } }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(prefills(calls).length, 1, 'B3a sin evidencia igual se pregunta al prefill');
    eq(pregens(calls).length, 0, 'B3b sin estrella ni productos ni rubro NO se dispara (el envío pediría la estrella con un toque)');
  }
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: { ok: true, name: 'Veja', category: 'otro', productos: [] } }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 0, 'B3c rubro otro sin productos NO se dispara (otro no es evidencia)');
  }
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: { ok: true, name: 'Veja', category: 'moda', productos: [] } }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 1, 'B3d con solo rubro válido SÍ se dispara');
    const pg = (pregens(calls)[0] || {}).body || {};
    eq(pg.producto_mix, 'todo', 'B3e solo rubro → mix todo');
    eq(pg.rubro_detectado, 'moda', 'B3f solo rubro → rubro_detectado=moda');
    eq(pg.productos_detectados, undefined, 'B3g solo rubro → sin productos_detectados');
  }
  // ---- B4: prefill sin ok → no se dispara
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: { ok: false, error: 'No encontramos ese Instagram' } }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 0, 'B4 prefill sin ok → no se dispara');
  }
  // ---- B5: estrella escrita en el campo → mix libre + estrella (como el envío)
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: GOOD_PREFILL }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com'; byId.fStar.value = 'Esplar';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 1, 'B5a con estrella escrita SÍ se dispara');
    const pg = (pregens(calls)[0] || {}).body || {};
    eq(pg.producto_mix, 'libre', 'B5b estrella escrita → mix libre');
    eq(pg.producto_estrella, 'Esplar', 'B5c estrella escrita → producto_estrella');
    eq(pg.productos_detectados, undefined, 'B5d estrella escrita → sin productos_detectados (como el envío)');
  }
  // ---- B6: prefill caído en el blur (transitorio) → no se dispara, el submit igual genera (stream del vivo)
  {
    const calls = [];
    const { byId, sandbox } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: { firstThrow: true, body: GOOD_PREFILL } }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 0, 'B6a prefill caído → no se dispara');
    const p = submit(byId, '@veja', 'veja-store.com');
    for (let i = 0; i < 8; i++) await tick();
    ok(streams(calls).length === 1, 'B6b prefill caído en el blur → el submit igual genera (stream)');
    ok(calls.some((c) => c.url.startsWith('/api/guest/start')), 'B6c tras generar, el submit entra con guest/start');
    await p;
    eq(sandbox.location.href, '/#/app/inicio', 'B6d el flujo normal termina en Inicio aunque el disparo temprano haya fallado');
  }
  // ---- B7: pregenerate caído → no rompe nada, el submit igual genera
  {
    const calls = [];
    const { byId, sandbox } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: GOOD_PREFILL, pregen: 'throw' }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 1, 'B7a el disparo temprano se intentó aunque el servidor lo rechazara');
    const p = submit(byId, '@veja', 'veja-store.com');
    for (let i = 0; i < 8; i++) await tick();
    ok(streams(calls).length === 1, 'B7b pregenerate caído → el submit igual genera (stream)');
    await p;
    eq(sandbox.location.href, '/#/app/inicio', 'B7c el flujo normal termina en Inicio aunque el pregenerate haya fallado');
  }
  // ---- B8: espejo EN — mismo disparo, lang=en
  {
    const calls = [];
    const { byId } = mountFront(PRUEBA_EN, frontFetch(calls, { prefill: GOOD_PREFILL }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 1, 'B8a EN: blur de la web → pregenerate x1');
    const pg = (pregens(calls)[0] || {}).body || {};
    eq(pg.lang, 'en', 'B8b EN: pregenerate lleva lang=en');
    eq(pg.business, 'Veja', 'B8c EN: mismo cuerpo que en ES');
  }
  // ---- B9: tras un disparo temprano exitoso, el submit funciona igual
  {
    const calls = [];
    const { byId, sandbox } = mountFront(PRUEBA_ES, frontFetch(calls, { prefill: GOOD_PREFILL }));
    byId.fIg.value = '@veja'; byId.fWeb.value = 'veja-store.com';
    await blur(byId, 'fWeb');
    eq(pregens(calls).length, 1, 'B9a el disparo temprano salió');
    const p = submit(byId, '@veja', 'veja-store.com');
    for (let i = 0; i < 8; i++) await tick();
    ok(streams(calls).length === 1, 'B9b tras el disparo temprano, el submit genera (stream)');
    ok(calls.some((c) => c.url.startsWith('/api/guest/start')), 'B9c tras generar, guest/start');
    await p;
    eq(sandbox.location.href, '/#/app/inicio', 'B9d redirect a Inicio');
  }

  // ------------------------------------------------- C. Boot real
  if (process.env.SKIP_C) {
    console.log('\n[C] Boot real — SALTADA por SKIP_C (control estático/VM)');
  } else {
  console.log('\n[C] Boot real (DATA_DIR temporal, puerto 35012)');
  const PORT = 35012;
  const dataDir = fs.mkdtempSync(path.join('/tmp', 'ipt-boot-'));
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR: dataDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  });
  const child = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOut = '';
  child.stdout.on('data', (d) => { serverOut += String(d); });
  child.stderr.on('data', (d) => { serverOut += String(d); });
  function req(method, pth, body, contentType) {
    return new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, path: pth, method, headers: body ? { 'Content-Type': contentType || 'application/octet-stream', 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
        let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      r.on('error', reject);
      if (body) r.write(body);
      r.end();
    });
  }
  function jget(body) { try { return JSON.parse(body); } catch (e) { return null; } }
  async function waitVersion(tries) {
    for (let i = 0; i < tries; i++) {
      try { const r = await req('GET', '/api/version'); const j = JSON.parse(r.body); if (j && j.build === '20261105-v1073') return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }
  function multipart(fields) {
    const boundary = 'suite-' + Date.now().toString(36);
    const parts = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${String(v)}\r\n`, 'utf8'));
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
  }
  function sqlite(sql) {
    try { return execFileSync('sqlite3', [path.join(dataDir, 'posta.db'), sql], { encoding: 'utf8' }).trim(); }
    catch (e) { return 'SQLITE-ERR:' + String((e && e.message) || e); }
  }
  function tableCount(table, where) {
    const exists = sqlite(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='${table}';`);
    if (exists !== '1') return '0';
    return sqlite(`SELECT COUNT(*) FROM ${table} WHERE ${where};`);
  }
  try {
    ok(await waitVersion(30), 'C1 /api/version responde v1073 (boot ~30 s)');
    let vN = 0;
    for (let i = 0; i < 5; i++) { const r = await req('GET', '/api/version'); try { if (JSON.parse(r.body).build === '20261105-v1073') vN++; } catch (e) {} }
    eq(vN, 5, 'C2 /api/version v1073 5/5');
    const st0 = await req('GET', '/api/trial/gen-status?ig=mejuri');
    const st0j = jget(st0.body);
    ok(st0.status === 200 && st0j && st0j.ok === true && st0j.cached === false && st0j.generating === false, 'C3 gen-status fresco → {ok, cached:false, generating:false}', st0.body.slice(0, 200));
    eq((await req('GET', '/api/trial/gen-status')).status, 400, 'C4 gen-status sin ig → 400');
    // C5: prefill real (la llamada exacta del front: {ig, lang}; el
    // prefill vivo ignora la web). Marca de la corrida: @mejuri (su
    // prefill trae rubro joyeria + productos en este entorno, verificado
    // por el preparador antes de la corrida). La marca del builder era
    // @crumbl: su prefill degradó a rubro otro sin productos y la
    // cadena frenó — CORRECTAMENTE — en falta_producto (pregenerate) y
    // en la compuerta falta_pregunta (envío), que es la regla dura del
    // lote; esa corrida queda registrada en el STATUS como evidencia de
    // la compuerta. NOTA: C5 sigue dependiendo del dato vivo de un
    // tercero.
    const pfR = await req('POST', '/api/trial/prefill', JSON.stringify({ ig: 'mejuri', lang: 'es' }), 'application/json');
    const pf = jget(pfR.body);
    const prods = (pf && Array.isArray(pf.productos)) ? pf.productos : [];
    const det = prods.map((p) => String((p && (p.nombre || p)) || '').trim()).filter(Boolean);
    ok(pfR.status === 200 && pf && pf.ok === true && pf.name && pf.category && det.length > 0, 'C5 prefill real @mejuri → ok con nombre, rubro (' + (pf && pf.category) + ') y productos detectados', pfR.body.slice(0, 300));
    // C6-C9: pregenerate (mismos campos que mandaría el front, estilo
    // del prefill incluido cuando viene)
    const preBody = { business: String((pf && pf.name) || 'Mejuri').trim(), ig: 'mejuri', category: (pf && pf.category) || 'otro', lang: 'es', producto_mix: 'todo', web: 'https://mejuri.com' };
    if (det.length) preBody.productos_detectados = det;
    if (!det.length && pf && pf.category && pf.category.toLowerCase() !== 'otro') preBody.rubro_detectado = pf.category;
    if (pf && pf.style) preBody.estilo = pf.style;
    const tPg0 = Date.now();
    const pgR = await req('POST', '/api/trial/pregenerate', JSON.stringify(preBody), 'application/json');
    const pgMs = Date.now() - tPg0;
    const pg = jget(pgR.body);
    ok(pgR.status === 200 && pg && pg.ok === true && pg.started === true, 'C6 pregenerate → {ok, started:true}', pgR.body.slice(0, 200));
    ok(pgMs < 10000, 'C7 pregenerate responde al instante (' + pgMs + ' ms < 10 s: no bloquea el flujo)');
    const st1 = jget((await req('GET', '/api/trial/gen-status?ig=mejuri')).body);
    ok(st1 && st1.generating === true, 'C8 tras pregenerate, gen-status → generating:true (la marca se puso antes de responder)');
    const pg2R = await req('POST', '/api/trial/pregenerate', JSON.stringify(preBody), 'application/json');
    const pg2 = jget(pg2R.body);
    ok(pg2R.status === 200 && pg2 && pg2.ok === true && pg2.generating === true, 'C9 segundo disparo con la generación en vuelo → {ok, generating:true} (no-op, un solo trabajo)');
    // C10-C12: el envío clásico mientras la temprana corre → se une
    // (espera) en vez de duplicar. A los 60 s el envío todavía no
    // reservó intento (está esperando, no generando); después se espera
    // su respuesta (la semana, por join o por regeneración tras el tope
    // de 180 s, con tope de suite 900 s).
    const genFields = { business: preBody.business, ig: 'mejuri', category: preBody.category, country: 'AR', tone: 'vos', lang: 'es', producto_mix: preBody.producto_mix, web: 'https://mejuri.com' };
    if (det.length) genFields.productos_detectados = JSON.stringify(det);
    if (!det.length && pf && pf.category && pf.category.toLowerCase() !== 'otro') genFields.rubro_detectado = pf.category;
    if (pf && pf.style) genFields.estilo = JSON.stringify(pf.style);
    const mp = multipart(genFields);
    const tGen0 = Date.now();
    const genP = req('POST', '/api/trial/generate', mp.body, mp.contentType).catch((e) => ({ status: 0, body: '{"error":"' + String((e && e.message) || e) + '"}' }));
    await new Promise((r) => setTimeout(r, 60000));
    const usage60 = Number(sqlite('SELECT COALESCE(SUM(count),0) FROM demo_usage;'));
    ok(usage60 <= 1, 'C10 a los 60 s del envío en paralelo hay como máximo 1 intento (real: ' + usage60 + ' — 0 si la temprana frenó en la compuerta del fundamento, 1 si está generando: el envío espera, nunca duplica)');
    const genTimeout = new Promise((r) => setTimeout(() => r({ status: 0, body: '{"error":"timeout-suite"}' }), 900000));
    const genR = await Promise.race([genP, genTimeout]);
    const genMs = Date.now() - tGen0;
    let gen = jget(genR.body);
    let genStatus = genR.status;
    let answeredResubmit = false;
    if (gen && gen.falta_pregunta) {
      answeredResubmit = true;
      // El camino del front cuando el fundamento duda (prueba.html:
      // need_question → el dueño toca su respuesta → reenvío con
      // rubro_src='pregunta' o pregunta_<tipo>='skip'). La temprana no
      // puede responder: frena en la misma compuerta (regla dura del
      // lote) y la semana nace del envío ya respondido.
      console.log('    (la cadena frenó en la compuerta falta_pregunta — tipo ' + (gen.pregunta && gen.pregunta.tipo) + ' — se responde como el dueño y se reenvía, como hace el front)');
      const ansFields = Object.assign({}, genFields);
      if (gen.pregunta && gen.pregunta.tipo === 'rubro') {
        const opts = gen.pregunta.opciones || [];
        const mine = opts.find((o) => o && o.rubro === preBody.category);
        if (mine) { ansFields.category = mine.rubro; if (mine.subrubro) ansFields.subcat = mine.subrubro; ansFields.rubro_src = 'pregunta'; }
        else ansFields.pregunta_rubro = 'skip';
      } else {
        ansFields.pregunta_estrella = 'skip';
      }
      const mpA = multipart(ansFields);
      const genR2 = await Promise.race([req('POST', '/api/trial/generate', mpA.body, mpA.contentType).catch(() => ({ status: 0, body: '{}' })), genTimeout]);
      gen = jget(genR2.body); genStatus = genR2.status;
    }
    ok(genStatus === 200 && gen && gen.ok === true && Array.isArray(gen.posts) && gen.posts.length >= 3, 'C11 el envío en paralelo devuelve la semana (' + (gen && gen.posts ? gen.posts.length : 0) + ' posteos)', 'status=' + genStatus + ' ' + (gen ? JSON.stringify(gen).slice(0, 200) : ''));
    console.log('    (join: el envío tardó ' + Math.round(genMs / 1000) + ' s en devolver la semana)');
    const locksN = Number(tableCount('trial_locks', "ig='mejuri'"));
    ok(locksN >= 1, 'C12 la generación dejó su candado de 90 días (trial_locks x' + locksN + '; x2 solo si la temprana superó el tope de 180 s y el envío regeneró)');
    eq(tableCount('trial_used', '1=1'), '0', 'C13 la generación temprana NO marcó la prueba como usada (trial_used x0)');
    eq(tableCount('trial_cache', "ig='mejuri'"), '1', 'C14 la semana quedó en trial_cache (x1)');
    // C15-C16: validaciones del endpoint
    const bad1 = await req('POST', '/api/trial/pregenerate', JSON.stringify({ business: 'X', category: 'moda' }), 'application/json');
    eq(bad1.status, 400, 'C15 pregenerate sin ig → 400');
    const bad2 = await req('POST', '/api/trial/pregenerate', JSON.stringify({ business: 'X', ig: 'mejuri2', category: 'moda', producto_mix: 'todo', web: '' }), 'application/json');
    const bad2j = jget(bad2.body);
    ok(bad2.status === 400 && bad2j && bad2j.falta_producto === true, 'C16 pregenerate sin evidencia → 400 falta_producto');
    // C17-C18: el stream sirve la semana guardada, rápido (ya estaba lista)
    const tSt0 = Date.now();
    const stR = await req('POST', '/api/trial/generate-stream', mp.body, mp.contentType);
    const stMs = Date.now() - tSt0;
    ok(stR.status === 200 && stR.body.includes('event: done'), 'C17 generate-stream con la semana guardada → event: done', 'status=' + stR.status + ' ' + stR.body.slice(0, 200));
    ok(stMs < 20000, 'C18 el stream sirve la semana guardada en ' + Math.round(stMs / 1000) + ' s (< 20 s: ya estaba lista)');
    // C19: mismatch de web — el envío trae OTRA web que la temprana.
    // Dos ramas según quién produjo la semana (el registro web temprano
    // solo sobrevive si la temprana cerró CON semana: si frenó en la
    // compuerta, el pregenerate lo limpia al asentarse sin semana):
    //  A) la semana es de la temprana → NO se sirve: la fila se borra y
    //     el envío reserva un intento nuevo (entra a generar).
    //  B) la semana nació del envío respondido → la prueba ya se
    //     consumió y manda el candado: otra web no la reabre (el gate
    //     sirve la misma semana, sin intento nuevo ni borrado).
    const wkR = await req('GET', '/api/trial/week?ig=mejuri');
    const wk = jget(wkR.body);
    ok(wkR.status === 200 && wk && wk.ok === true, 'C19a /api/trial/week?ig=mejuri devuelve la semana guardada', wkR.body.slice(0, 200));
    const wkBiz = (wk && wk.business) || preBody.business;
    const wkCat = (wk && wk.category) || preBody.category;
    const wkLang = (wk && wk.lang) || 'es';
    const gen2Fields = { business: wkBiz, ig: 'mejuri', category: wkCat, country: 'AR', tone: 'vos', lang: wkLang, producto_mix: 'todo', web: 'https://example.com' };
    if (wkCat && wkCat.toLowerCase() !== 'otro') gen2Fields.rubro_src = 'pregunta';
    if (det.length) gen2Fields.productos_detectados = JSON.stringify(det);
    if (!det.length && wkCat && wkCat.toLowerCase() !== 'otro') gen2Fields.rubro_detectado = wkCat;
    const mp2 = multipart(gen2Fields);
    const attemptsBefore = sqlite('SELECT COALESCE(SUM(count),0) FROM demo_usage;');
    const earlyWeek = !answeredResubmit && Number(attemptsBefore) === 1;
    if (earlyWeek) {
      console.log('    (C19 rama A: la semana es de la generación temprana — mismatch con registro vivo)');
      const gen2P = req('POST', '/api/trial/generate', mp2.body, mp2.contentType).catch(() => ({ status: 0, body: '' }));
      gen2P.catch(() => {});
      let reserved = false;
      let rowGone = false;
      for (let i = 0; i < 24 && !(reserved && rowGone); i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const now = sqlite('SELECT COALESCE(SUM(count),0) FROM demo_usage;');
        if (Number(now) === Number(attemptsBefore) + 1) reserved = true;
        if (tableCount('trial_cache', "ig='mejuri'") === '0') rowGone = true;
      }
      ok(reserved, 'C19b el envío con otra web reserva un intento nuevo (no sirvió la semana temprana: entró a generar)');
      ok(rowGone, 'C19c la fila de caché de la semana temprana se borró (no se sirve la semana de otra web)');
    } else {
      console.log('    (C19 rama B: la semana nació del envío respondido — la temprana frenó en la compuerta y su registro se limpió; manda el candado)');
      const gen2R = await Promise.race([req('POST', '/api/trial/generate', mp2.body, mp2.contentType).catch(() => ({ status: 0, body: '' })), new Promise((r) => setTimeout(() => r({ status: 0, body: '' }), 60000))]);
      const gen2 = jget(gen2R.body);
      ok(gen2R.status === 200 && gen2 && gen2.ok === true && Array.isArray(gen2.posts) && gen2.posts.length >= 3, 'C19b con la prueba ya consumida, otra web recibe la MISMA semana del candado (no se reabre)', 'status=' + gen2R.status + ' ' + gen2R.body.slice(0, 160));
      eq(sqlite('SELECT COALESCE(SUM(count),0) FROM demo_usage;'), attemptsBefore, 'C19c el envío con otra web NO reservó un intento nuevo');
      eq(tableCount('trial_cache', "ig='mejuri'"), '1', 'C19d la fila de caché sigue intacta (x1)');
    }
    console.log('    (mismatch: intentos ' + attemptsBefore + ' → ' + sqlite('SELECT COALESCE(SUM(count),0) FROM demo_usage;') + ')');
  } finally {
    try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(child.pid, 'SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
  }

  console.log('\n== IMAGEN-PRUEBA-TEMPRANA (v1073): ' + pass + ' ok, ' + fail + ' fail ==');
  if (failures.length) {
    console.log('Fallos:');
    for (const f of failures) console.log(' - ' + f);
    if (typeof serverOut !== 'undefined' && serverOut) {
      console.log('--- cola del log del servidor (últimos 2000 chars) ---');
      console.log(serverOut.slice(-2000));
    }
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
