// test-lote-l6-progreso-timeout-poleo.js
// LOTE L6 — progreso real + timeout + poleo en /prueba.
// El front consume /api/trial/generate-stream (SSE) con progreso real, el
// primer posteo se muestra en cuanto llega y un watchdog honesto si el
// stream se queda mudo; la recarga polea /api/trial/gen-status en vez de
// re-disparar la generación. El servidor paraleliza la cadena pre-render
// (embed del @ a t≈0, auditoría + pares temprano, ideas en segundo plano,
// fotos de la web + catálogo + bio-link en paralelo).
// Se corre desde la raíz del scratch:  node release/test-lote-l6-progreso-timeout-poleo.js
// (los paths se resuelven por __dirname, no por cwd).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const ROOT = __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const PRUEBA_ES = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
const PRUEBA_EN = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
const APPJS = fs.readFileSync(path.join(ROOT, 'public', 'app.js'));
const STYLES = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'));
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
eq(count(SERVER, '20261105-v961'), 1, 'A1 BUILD v961 x1 solo en server.js');
eq(count(SERVER, '20261105-v958'), 0, 'A2 BUILD v958 x0 (sin restos del viejo)');
eq(md5(APPJS), '07b476fd98e43cd0536455cf6ce33f2d', 'A3 public/app.js byte-idéntico a base v958 (sin bump de ?v=)');
eq(md5(STYLES), '0d6f6032ef69b2d688c6227de46d2f72', 'A4 styles.css byte-idéntico a base v958');
eq(count(IDX_ES, 'app.js?v=667'), 1, 'A5 index ES app.js?v=667 x1 (sin cambio)');
eq(count(IDX_ES, 'styles.css?v=20261270'), 1, 'A6 index ES styles 20261270 x1');
eq(count(IDX_EN, 'app.js?v='), 0, 'A7 index EN sin app.js?v=');
eq(count(IDX_EN, 'styles.css?v=20261270'), 1, 'A8 index EN styles 20261270 x1');
for (const [tag, html] of [['ES', PRUEBA_ES], ['EN', PRUEBA_EN]]) {
  ok(html.includes('generate-stream'), 'A9-' + tag + ' front usa /api/trial/generate-stream');
  ok(html.includes('id="fPreview"'), 'A10-' + tag + ' div #fPreview existe');
  ok(html.includes('function runTrialStream'), 'A11-' + tag + ' runTrialStream definida');
  ok(html.includes('function trialStatus'), 'A12-' + tag + ' trialStatus definida');
  ok(html.includes('function waitTrialReady'), 'A13-' + tag + ' waitTrialReady definida');
  ok(html.includes('function showFirstPostPreview'), 'A14-' + tag + ' showFirstPostPreview definida');
  ok(html.includes('L6_FIRST_POST_TIMEOUT_MS = 60000'), 'A15-' + tag + ' watchdog primer posteo 60 s');
  ok(html.includes('L6_SLOW_NOTE_MS = 25000'), 'A16-' + tag + ' aviso lento a los 25 s');
  ok(html.includes("'/api/trial/gen-status?ig='"), 'A17-' + tag + ' poleo GET /api/trial/gen-status?ig=');
  eq(count(html, "api/trial/generate'"), 0, 'A18-' + tag + ' el fetch único a /api/trial/generate NO existe más');
  ok(html.includes('reader.cancel()'), 'A19-' + tag + ' el watchdog cancela el lector');
  ok(html.includes('getReader'), 'A20-' + tag + ' consume el stream por getReader');
}
ok(SERVER.includes("app.get('/api/trial/gen-status'"), 'A21 endpoint GET /api/trial/gen-status existe');
ok(SERVER.includes('const trialGenInflight = new Map()'), 'A22 mapa trialGenInflight existe');
eq(count(SERVER, 'trialGenMarkStart(igKey);'), 2, 'A23 markStart en clásico Y stream (x2)');
eq(count(SERVER, 'trialGenMarkDone(igKey);'), 2, 'A24 markDone en los dos finally (x2)');
eq(count(SERVER, 'fetchIgEmbedHtml(ig)'), 2, 'A25 fetchIgEmbedHtml directo x2 (embedPromise + prefill, nunca en la cadena clásica)');
eq(count(SERVER, 'trialWebPhotos('), 3, 'A26 trialWebPhotos x3 (definición + 1 llamada por handler, sin duplicado)');

// ------------------------------------------------- C. Orden de la cadena (fuente)
console.log('\n[C] Paralelización de la cadena pre-render (orden en la fuente)');
ok(idx(SERVER, 'const embedPromise') < idx(SERVER, 'const _htmlVoz0'), 'C1 el embed arranca (t≈0) ANTES de su primer consumo');
ok(idx(SERVER, 'const embedPromise') < idx(SERVER, 'const _htmlVoz ='), 'C2 el embed arranca ANTES de su segundo consumo');
ok(idx(SERVER, 'const auditPromise') < idx(SERVER, 'dataJson = await raceMs(auditPromise'), 'C3 la auditoría arranca temprano y se recoge al final');
ok(idx(SERVER, 'const peersPromise =') < idx(SERVER, 'peersJ = (await raceMs(peersPromise'), 'C4 los pares (clásico) arrancan temprano y se recogen al final');
ok(idx(SERVER, 'const profilePicPathP') < idx(SERVER, 'profilePicPath = await raceMs(profilePicPathP'), 'C5 el medallón arranca temprano y se recoge antes del render');
ok(idx(SERVER, 'let webPhotosP = null') < idx(SERVER, 'webExtraPhotos = await webPhotosP'), 'C6 (clásico) webPhotos arranca antes del bloque deep');
ok(idx(SERVER, 'const deepCatalogP') < idx(SERVER, 'const catalog = await deepCatalogP'), 'C7 (clásico) el catálogo corre en paralelo con las fotos');
ok(idx(SERVER, 'const ideasPromiseS') < idx(SERVER, 'renderSpecPngsStream'), 'C8 (stream) las ideas arrancan ANTES del render, no como primer await');
ok(idx(SERVER, 'renderSpecPngsStream') < idx(SERVER, 'const ideas = (await raceMs(ideasPromiseS'), 'C9 (stream) las ideas se recogen DESPUÉS del render, antes del done');
ok(idx(SERVER, 'const peersPromiseS') < idx(SERVER, 'peers = (await raceMs(peersPromiseS'), 'C10 (stream) los pares arrancan temprano y se recogen al final');
ok(idx(SERVER, 'let webPhotosP = null') < idx(SERVER, 'const photosP = webPhotosP'), 'C11 (stream) webPhotos arranca antes del bloque deep');
ok(idx(SERVER, 'const catalogP = webData') < idx(SERVER, 'await Promise.all([catalogP, bioLinkP, photosP])'), 'C12 (stream) catálogo + bio-link + fotos se esperan JUNTAS (Promise.all)');
ok(!SERVER.includes('const ideas = await generateIdeas({ business, category, tone, description: richGoal'), 'C13 el await directo a generateIdeas del stream ya no existe (las ideas arrancan en segundo plano)');
ok(SERVER.includes('const ideasPromise = Promise.resolve(generateIdeas('), 'C13b el flujo de ideas del clásico sigue intacto');
ok(SERVER.includes('trialGenMarkStart(igKey);\n\n  let photoPath = null;\n  let ok = false;'), 'C14 (clásico) el mark va tras anti-spam, antes del try');
ok(SERVER.includes('trialGenMarkStart(igKey);\n\n  let photoPath = null;\n  let runDir = null;'), 'C15 (stream) el mark va tras anti-spam, antes del try');

// ------------------------------------------------- B. VM del front
console.log('\n[B] VM del front (flujo real por submit, con reloj falso y SSE guionado)');

// Reloj falso: setTimeout/setInterval/Date.now controlados por la prueba.
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
// Lector SSE guionado: la prueba alimenta los chunks y decide cuándo cierra.
function makeSse() {
  const chunks = []; const waiters = []; let cancelled = false; let closed = false;
  const reader = {
    read() {
      if (cancelled) return Promise.resolve({ done: true, value: undefined });
      if (chunks.length) return Promise.resolve({ done: false, value: chunks.shift() });
      if (closed) return Promise.resolve({ done: true, value: undefined });
      return new Promise((resolve) => waiters.push(resolve));
    },
    cancel() { cancelled = true; const w = waiters.splice(0); w.forEach((r) => r({ done: true, value: undefined })); return Promise.resolve(); },
    releaseLock() {},
  };
  return {
    reader,
    feed(text) { const b = new TextEncoder().encode(text); if (waiters.length) waiters.shift()({ done: false, value: b }); else chunks.push(b); },
    close() { closed = true; const w = waiters.splice(0); w.forEach((r) => r({ done: true, value: undefined })); },
    get cancelled() { return cancelled; },
  };
}
function el(id) {
  return { id, value: '', hidden: true, textContent: '', innerHTML: '', disabled: false,
    listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; }, focus() {}, click() {} };
}
function makeDom() {
  const ids = ['fIg', 'fWeb', 'fStar', 'fStarWrap', 'fLangWrap', 'fLangEn', 'fLangEs', 'fErr', 'fStatus', 'fPreview', 'btnGo', 'fEntry'];
  const byId = {}; for (const id of ids) byId[id] = el(id);
  byId.fStarWrap.hidden = true; byId.fLangWrap.hidden = true;
  return byId;
}
function extractScript(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('sin <script> en el front');
  return m[1];
}
const tick = () => new Promise((r) => setImmediate(r));
const sseEvent = (ev, data) => 'event: ' + ev + '\ndata: ' + JSON.stringify(data) + '\n\n';

// Monta un front en VM con un fetch guionado. Devuelve el contexto de prueba.
function mountFront(html, fetchImpl) {
  const clock = makeClock();
  const byId = makeDom();
  const sandbox = {
    console, TextDecoder, TextEncoder, URLSearchParams,
    Date: { now: () => clock.now() },
    setTimeout: clock.setTimeout, setInterval: clock.setInterval,
    clearTimeout: clock.clearTimeout, clearInterval: clock.clearInterval,
    document: { getElementById: (id) => byId[id] || el(id) },
    location: { search: '', href: '' },
    localStorage: { getItem: () => null, setItem: () => {} },
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

(async () => {
  // ---- B1: camino feliz ES — status + primer posteo visible + done + redirect
  {
    const sse = makeSse();
    const calls = [];
    const { clock, byId, sandbox } = mountFront(PRUEBA_ES, async (url, opts) => {
      calls.push(String(url));
      if (String(url).startsWith('/api/trial/prefill')) return { ok: true, status: 200, json: async () => ({ ok: true, name: 'Veja', category: 'zapatillas', productos: [{ nombre: 'Esplar' }] }) };
      if (String(url).startsWith('/api/trial/gen-status')) return { ok: true, status: 200, json: async () => ({ ok: true, ig: 'veja', cached: false, generating: false }) };
      if (String(url).startsWith('/api/trial/generate-stream')) return { ok: true, status: 200, body: { getReader: () => sse.reader } };
      if (String(url).startsWith('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      throw new Error('fetch inesperado: ' + url);
    });
    const p = submit(byId, '@veja', 'veja-store.com');
    await tick();
    ok(calls.some((u) => u.startsWith('/api/trial/gen-status?ig=veja')), 'B1a antes de generar, el front pregunta /api/trial/gen-status?ig=veja');
    ok(calls.some((u) => u.startsWith('/api/trial/generate-stream')), 'B1b el front llama a /api/trial/generate-stream (no al clásico)');
    sse.feed(sseEvent('status', { step: 'empezando', text: 'Estoy pensando ideas para Veja…' }));
    await tick();
    ok(byId.fStatus.textContent.includes('Estoy pensando ideas'), 'B1c el status del stream se muestra (progreso real)');
    // Chunk partido a la mitad: el parser acumula hasta el \n\n completo.
    const postEv = sseEvent('post', { index: 0, day: '2026-11-13', date: '2026-11-13', post: { image: 'https://cdn.example.com/a.jpg', headline: 'Esplar, hecho para caminar', caption: 'El modelo que todos piden, en tu feed.' } });
    sse.feed(postEv.slice(0, 40));
    await tick();
    ok(byId.fPreview.hidden === true, 'B1d con el evento partido, la vista previa todavía no aparece');
    sse.feed(postEv.slice(40));
    await tick();
    ok(byId.fPreview.hidden === false, 'B1e el primer posteo se muestra en cuanto llega (sin recarga)');
    ok(byId.fPreview.innerHTML.includes('Esplar, hecho para caminar'), 'B1f la vista previa trae el titular');
    ok(byId.fPreview.innerHTML.includes('https://cdn.example.com/a.jpg'), 'B1g la vista previa trae la imagen');
    ok(byId.fPreview.innerHTML.includes('Termino tu semana'), 'B1h la vista previa avisa que la semana sigue');
    sse.feed(sseEvent('post', { index: 1, day: '2026-11-14', date: '2026-11-14', post: { image: 'https://cdn.example.com/b.jpg', headline: 'Campo', caption: 'Otro día, otro modelo.' } }));
    await tick();
    ok(byId.fStatus.textContent.includes('Posteo 2 de 5 listo'), 'B1i el segundo posteo solo actualiza el contador');
    sse.feed(sseEvent('done', { out: { ok: true } }));
    await p;
    eq(sandbox.location.href, '/#/app/inicio', 'B1j done → guest/start → redirect a /#/app/inicio');
    ok(calls.some((u) => u.startsWith('/api/guest/start')), 'B1k guest/start se llamó tras el done');
  }
  // ---- B2: stream lento sin eventos 25 s → aviso honesto, se sigue esperando
  {
    const sse = makeSse();
    const { clock, byId } = mountFront(PRUEBA_ES, async (url) => {
      if (String(url).startsWith('/api/trial/prefill')) return { ok: true, status: 200, json: async () => ({ ok: true, name: 'Veja', category: 'zapatillas', productos: [{ nombre: 'Esplar' }] }) };
      if (String(url).startsWith('/api/trial/gen-status')) return { ok: true, status: 200, json: async () => ({ ok: true, ig: 'veja', cached: false, generating: false }) };
      if (String(url).startsWith('/api/trial/generate-stream')) return { ok: true, status: 200, body: { getReader: () => sse.reader } };
      if (String(url).startsWith('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      throw new Error('fetch inesperado: ' + url);
    });
    const p = submit(byId, '@veja', 'veja-store.com');
    await tick();
    clock.advance(24000); await tick();
    ok(!byId.fStatus.textContent.includes('Tarda más de lo normal'), 'B2a a los 24 s sin evento todavía no hay aviso de lentitud');
    clock.advance(2000); await tick();
    ok(byId.fStatus.textContent.includes('Tarda más de lo normal'), 'B2b a los 26 s sin evento sale el aviso honesto (y se sigue esperando)');
    ok(byId.fErr.hidden === true && byId.fStatus.textContent.includes('Tarda más de lo normal'), 'B2c el aviso es de estado, no un error');
    sse.feed(sseEvent('post', { index: 0, day: '2026-11-13', date: '2026-11-13', post: { image: 'https://cdn.example.com/a.jpg', headline: 'Esplar', caption: 'x' } }));
    await tick();
    ok(byId.fPreview.hidden === false, 'B2d tras el aviso, el primer posteo igual aparece cuando llega');
    sse.feed(sseEvent('done', { out: { ok: true } }));
    await p;
  }
  // ---- B3: watchdog 60 s sin primer posteo → error honesto + cancel + sin redirect
  {
    const sse = makeSse();
    const { clock, byId, sandbox } = mountFront(PRUEBA_ES, async (url) => {
      if (String(url).startsWith('/api/trial/prefill')) return { ok: true, status: 200, json: async () => ({ ok: true, name: 'Veja', category: 'zapatillas', productos: [{ nombre: 'Esplar' }] }) };
      if (String(url).startsWith('/api/trial/gen-status')) return { ok: true, status: 200, json: async () => ({ ok: true, ig: 'veja', cached: false, generating: false }) };
      if (String(url).startsWith('/api/trial/generate-stream')) return { ok: true, status: 200, body: { getReader: () => sse.reader } };
      if (String(url).startsWith('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      throw new Error('fetch inesperado: ' + url);
    });
    const p = submit(byId, '@veja', 'veja-store.com');
    await tick();
    clock.advance(59000); await tick();
    ok(byId.fErr.hidden === true, 'B3a a los 59 s sin posteo todavía no hay error');
    clock.advance(2000); await tick(); await tick();
    await p;
    ok(byId.fErr.hidden === false && byId.fErr.textContent.includes('Se trabó la generación'), 'B3b a los 61 s sin primer posteo: error honesto «Se trabó la generación»');
    ok(sse.cancelled, 'B3c el watchdog canceló el lector del stream');
    eq(sandbox.location.href, '', 'B3d sin primer posteo no hay redirect');
    ok(byId.fPreview.hidden === true, 'B3e sin primer posteo no hay vista previa');
    ok(byId.btnGo.disabled === false, 'B3f el botón queda habilitado para reintentar');
  }
  // ---- B4: recarga con generación en curso → poleo de status hasta cached
  {
    const sse = makeSse();
    let statusCalls = 0;
    const { clock, byId, sandbox } = mountFront(PRUEBA_ES, async (url) => {
      if (String(url).startsWith('/api/trial/prefill')) return { ok: true, status: 200, json: async () => ({ ok: true, name: 'Veja', category: 'zapatillas', productos: [{ nombre: 'Esplar' }] }) };
      if (String(url).startsWith('/api/trial/gen-status')) {
        statusCalls++;
        // 2 poleos dicen generating, el 3º ya tiene la semana en caché.
        return { ok: true, status: 200, json: async () => (statusCalls < 3 ? { ok: true, ig: 'veja', cached: false, generating: true } : { ok: true, ig: 'veja', cached: true, generating: false }) };
      }
      if (String(url).startsWith('/api/trial/generate-stream')) return { ok: true, status: 200, body: { getReader: () => sse.reader } };
      if (String(url).startsWith('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      throw new Error('fetch inesperado: ' + url);
    });
    const p = submit(byId, '@veja', 'veja-store.com');
    await tick();
    ok(byId.fStatus.textContent.includes('Ya estoy armando tu primer posteo'), 'B4a con generating=true el front avisa que ya se está armando');
    clock.advance(3000); await tick(); await tick();
    clock.advance(3000); await tick(); await tick();
    ok(statusCalls >= 3, 'B4b el front poleó /api/trial/gen-status cada 3 s (x' + statusCalls + ')');
    sse.feed(sseEvent('done', { out: { ok: true } }));
    await p;
    eq(sandbox.location.href, '/#/app/inicio', 'B4c con la semana ya en caché, el stream devuelve done directo y se entra');
  }
  // ---- B5: mapeo de errores del stream (need_star / need_lang / used)
  {
    async function runCase(evData, check, name) {
      const sse = makeSse();
      const { byId } = mountFront(PRUEBA_ES, async (url) => {
        if (String(url).startsWith('/api/trial/prefill')) return { ok: true, status: 200, json: async () => ({ ok: true, name: 'Veja', category: 'zapatillas', productos: [{ nombre: 'Esplar' }] }) };
        if (String(url).startsWith('/api/trial/gen-status')) return { ok: true, status: 200, json: async () => ({ ok: true, ig: 'veja', cached: false, generating: false }) };
        if (String(url).startsWith('/api/trial/generate-stream')) return { ok: true, status: 200, body: { getReader: () => sse.reader } };
        if (String(url).startsWith('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
        throw new Error('fetch inesperado: ' + url);
      });
      const p = submit(byId, '@veja', 'veja-store.com');
      await tick();
      sse.feed(sseEvent(evData.ev, evData.data));
      await p;
      check(byId);
    }
    await runCase({ ev: 'error', data: { error: 'x', falta_producto: true } }, (byId) => {
      ok(byId.fStarWrap.hidden === false, 'B5a error falta_producto → se muestra el picker de estrella');
      ok(byId.fStatus.textContent.includes('Todavía no sé qué vendés'), 'B5b error falta_producto → mensaje de estrella');
    });
    await runCase({ ev: 'error', data: { error: 'x', falta_idioma_marca: true } }, (byId) => {
      ok(byId.fLangWrap.hidden === false, 'B5c error falta_idioma_marca → se muestra el picker de idioma');
    });
    await runCase({ ev: 'used', data: { message: 'Este negocio ya usó su única prueba gratis 💛' } }, (byId) => {
      ok(byId.fErr.hidden === false && byId.fErr.innerHTML.includes('ya usó su única prueba'), 'B5d evento used → aviso rosa de prueba usada');
      ok(byId.fErr.innerHTML.includes('Entrá a tu cuenta'), 'B5e el aviso de usada trae los links de siempre');
    });
    await runCase({ ev: 'error', data: { error: 'boom' } }, (byId) => {
      ok(byId.fErr.hidden === false && byId.fErr.textContent.includes('boom'), 'B5f error genérico del stream → se muestra su mensaje');
      ok(byId.fPreview.hidden === true, 'B5g error genérico → no queda vista previa vieja en pantalla');
    });
  }
  // ---- B6: espejo EN — mismo flujo, textos en inglés
  {
    const sse = makeSse();
    const { byId, sandbox } = mountFront(PRUEBA_EN, async (url) => {
      if (String(url).startsWith('/api/trial/prefill')) return { ok: true, status: 200, json: async () => ({ ok: true, name: 'Veja', category: 'sneakers', productos: [{ nombre: 'Esplar' }] }) };
      if (String(url).startsWith('/api/trial/gen-status')) return { ok: true, status: 200, json: async () => ({ ok: true, ig: 'veja', cached: false, generating: false }) };
      if (String(url).startsWith('/api/trial/generate-stream')) return { ok: true, status: 200, body: { getReader: () => sse.reader } };
      if (String(url).startsWith('/api/guest/start')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
      throw new Error('fetch inesperado: ' + url);
    });
    const p = submit(byId, '@veja', 'veja-store.com');
    await tick();
    sse.feed(sseEvent('post', { index: 0, day: '2026-11-13', date: '2026-11-13', post: { image: 'https://cdn.example.com/a.jpg', headline: 'Esplar, made for walking', caption: 'The one everyone asks for.' } }));
    await tick();
    ok(byId.fPreview.hidden === false && byId.fPreview.innerHTML.includes('Your first post is ready'), 'B6a EN: la vista previa dice «Your first post is ready»');
    ok(byId.fPreview.innerHTML.includes('Finishing your week'), 'B6b EN: la nota es «Finishing your week»');
    sse.feed(sseEvent('done', { out: { ok: true } }));
    await p;
    eq(sandbox.location.href, '/#/app/inicio', 'B6c EN: done → redirect igual que en ES');
  }

  // ------------------------------------------------- D. Boot real
  console.log('\n[D] Boot real (DATA_DIR temporal, puerto 35012)');
  const PORT = 35012;
  const dataDir = fs.mkdtempSync(path.join('/tmp', 'l6-boot-'));
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), DATA_DIR: dataDir,
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
  });
  const child = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverOut = '';
  child.stdout.on('data', (d) => { serverOut += String(d); });
  child.stderr.on('data', (d) => { serverOut += String(d); });
  function req(method, pth, body) {
    return new Promise((resolve, reject) => {
      const r = http.request({ host: '127.0.0.1', port: PORT, path: pth, method, headers: body ? { 'Content-Type': 'application/octet-stream', 'Content-Length': Buffer.byteLength(body) } : {} }, (res) => {
        let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      r.on('error', reject);
      if (body) r.write(body);
      r.end();
    });
  }
  async function waitVersion(tries) {
    for (let i = 0; i < tries; i++) {
      try { const r = await req('GET', '/api/version'); const j = JSON.parse(r.body); if (j && j.build === '20261105-v961') return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 2000));
    }
    return false;
  }
  try {
    ok(await waitVersion(30), 'D1 /api/version responde v961 (boot ~30 s)');
    let v961 = 0;
    for (let i = 0; i < 5; i++) { const r = await req('GET', '/api/version'); try { if (JSON.parse(r.body).build === '20261105-v961') v961++; } catch (e) {} }
    eq(v961, 5, 'D2 /api/version v961 5/5');
    const prueba = await req('GET', '/prueba');
    ok(prueba.status === 200 && prueba.body.includes('id="fPreview"') && prueba.body.includes('generate-stream'), 'D3 /prueba sirve el front nuevo (fPreview + generate-stream)');
    const st = await req('GET', '/api/trial/gen-status?ig=veja');
    let stj = null; try { stj = JSON.parse(st.body); } catch (e) {}
    ok(st.status === 200 && stj && stj.ok === true && stj.ig === 'veja' && stj.cached === false && stj.generating === false, 'D4 GET /api/trial/gen-status?ig=veja → {ok, cached:false, generating:false}', st.body.slice(0, 200));
    const stBad = await req('GET', '/api/trial/gen-status');
    eq(stBad.status, 400, 'D5 GET /api/trial/gen-status sin ig → 400');
    const gs = await req('POST', '/api/trial/generate-stream', 'basura');
    ok(gs.status === 200 && /text\/event-stream/.test(String(gs.headers['content-type'] || '')), 'D6 POST /api/trial/generate-stream responde 200 SSE', 'status=' + gs.status + ' ct=' + gs.headers['content-type']);
    ok(gs.body.includes('event: error'), 'D7 el stream con cuerpo inválido emite event: error (no una página HTML)', gs.body.slice(0, 200));
  } finally {
    try { process.kill(child.pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    if (!child.killed) { try { process.kill(child.pid, 'SIGKILL'); } catch (e) {} }
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n== L6: ' + pass + ' ok, ' + fail + ' fail ==');
  if (failures.length) { console.log('Fallos:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
