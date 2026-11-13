// test-lote-reanudar-recarga.js — LOTE REANUDAR-TRAS-RECARGA
// (diagnóstico ~/workspace/.diag-jenis-recarga/DIAGNOSIS.md: la primera
// pasada de Jeni's se perdió entera al recargar a mitad de armado).
//
// El bug: toda la prueba en curso vivía en variables en memoria de
// public/prueba.html — sin reanudación al cargar y sin persistir ni el
// @ tipeado. La recarga volvía al formulario vacío aunque el servidor
// terminaba la generación igual y guardaba la semana (caché 72 h +
// candado con payload). La recuperación era solo manual: re-tipear todo
// y reenviar. Exhibición (v1016) cubre el caso POST-entrega; este lote
// cubre el DURANTE.
//
// El arreglo (SOLO cliente, prueba.html + en-prueba.html):
//  1. El submit persiste la intención en curso en localStorage
//     (pz_trial_pending: {ig, web, star, brandLang, ts}, vigencia 24 h).
//  2. Al cargar sin ?ig=, una intención vigente precarga los campos y
//     dispara el MISMO auto-arranque del ?ig= — el camino posterior ya
//     resuelve cada sub-caso: poleo de gen-status si la generación
//     sigue en vuelo, 'done' desde caché/candado si terminó detrás,
//     regeneración si murió, guest/start al final como siempre.
//  3. La intención se borra al entrar OK (guest/start 200) y ante un
//     used/locked DEFINITIVO (stream used/locked o guest/start 409):
//     lo que el servidor ya cerró no se reanuda en bucle.
// Sin cambios de servidor; la regla de una sola prueba no se toca (el
// uso se sigue registrando solo en la entrega).
//
// Cómo se prueba: servidor REAL del árbol (DATA_DIR en /tmp) + el
// script REAL de la página ejecutado en una VM con DOM/localStorage de
// mentira pero fetch ruteado al servidor real. Dos únicos stubs,
// declarados: (a) /api/trial/prefill — la lectura de Instagram es una
// dependencia externa ajena a este lote; se responde un payload fijo y
// TODO lo demás (gen-status, generate-stream, guest/start, DB) es el
// servidor real con su estado sembrado (caché/candado/uso, el mismo
// patrón de siembra de la suite de exhibición); (b) en la «primera
// pasada» el stream se cuelga a propósito (un evento status y nunca
// cierra) para simular la generación en vuelo en el momento de la
// recarga — la generación real en vuelo ya está probada por L6 y por
// el diagnóstico; lo que se verifica acá es la mecánica de reanudación
// del cliente contra el estado real que la generación deja detrás.
//
// Modo CONTROL (REANUDAR_CONTROL=1, contra la base v1016): la parte
// estática se invierte (la base no tiene la maquinaria) y el escenario
// S1 reproduce el bug — tras la recarga, la página NO reanuda sola.
//
// Uso: node test-lote-reanudar-recarga.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.REANUDAR_CONTROL === '1';
const PORT = 35151;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = '/tmp/reanudar-suite-' + process.pid;
const ENGINE = require(path.join(ROOT, 'demo')).DEMO_ENGINE_V;
const PENDING_KEY = 'pz_trial_pending';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 300) : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);
const count = (s, sub) => String(s || '').split(sub).length - 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await fn(); } catch (e) {}
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) { console.error('    (timeout esperando: ' + label + ')'); return false; }
    await sleep(120);
  }
}

// ---------- Parte A: estática ----------
{
  const es = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
  const en = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
  const anchors = [
    "var PENDING_KEY = 'pz_trial_pending';",
    'var PENDING_TTL_MS = 24 * 60 * 60 * 1000;',
    'function savePending(ig, web, star)',
    'function loadPending()',
    'savePending(ig, web, star);',
    'var pend = loadPending();',
    "igEl.value = '@' + pend.ig;",
    "if (outcomeUsed) { clearPending();",
  ];
  if (!CONTROL) {
    for (const a of anchors) {
      t(`A1 ES trae «${a.slice(0, 44)}» ×1`, count(es, a) === 1, 'count=' + count(es, a));
      t(`A2 EN trae «${a.slice(0, 44)}» ×1`, count(en, a) === 1, 'count=' + count(en, a));
    }
    t('A3 clearPending() ×5 en cada página (def + vencida + used del stream + 409 + entrada OK)',
      count(es, 'clearPending()') === 5 && count(en, 'clearPending()') === 5,
      'es=' + count(es, 'clearPending()') + ' en=' + count(en, 'clearPending()'));
    t('A4 paridad ES/EN: la etiqueta del lote aparece ×3 en cada una',
      count(es, 'REANUDAR-TRAS-RECARGA') === 3 && count(en, 'REANUDAR-TRAS-RECARGA') === 3);
  } else {
    t('A1c CONTROL la base NO tiene la maquinaria de reanudación',
      !has(es, 'pz_trial_pending') && !has(en, 'pz_trial_pending') && !has(es, 'savePending'));
  }
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  t('A5 server.js no conoce la clave del cliente (lote solo-cliente)', !has(srv, 'pz_trial_pending'));
}

// ---------- Siembra y lectura de DB (patrón de la suite de exhibición) ----------
function imgDataUri() {
  const buf = fs.readFileSync(path.join(ROOT, 'public', 'siembra-nails', 'tira-nails-1.jpg'));
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}
function payloadFor(ig) {
  const img = imgDataUri();
  const captions = [
    'Café de especialidad, recién tostado: el de la casa, el que vuelve todos los días.',
    'Medialunas y café de especialidad, la pareja de cada mañana en Reanudar Café.',
    'Grano fresco, molienda al momento: así sale cada taza en Reanudar Café.',
  ];
  const posts = captions.map((caption, i) => ({
    type: 'image', image: img, caption, hashtags: '#reanudar #suite',
    headline: ['Uno', 'Dos', 'Tres'][i % 3], style: 'foto', style_name: 'foto', text_mode: 'text',
  }));
  return {
    ok: true, engine: ENGINE, lang: 'es', business: 'Reanudar Café', ig, category: 'cafeteria',
    posts,
    design: { posts: posts.map((pp) => ({ headline: pp.headline, style: 'foto', kind: 'foto' })) },
    digest: { business: 'Reanudar Café', productos: [{ nombre: 'Café de especialidad' }], servicios: [], ciudad: '' },
    content_lang: 'es',
  };
}
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
function seedCache(ig, payload) {
  const db = dbOpen();
  db.prepare('INSERT OR REPLACE INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), Date.now());
  db.close();
}
function seedLock(ig, domain, payloadStr) {
  const db = dbOpen();
  const now = Date.now();
  db.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ig, domain, 'Reanudar Café', 'es', payloadStr, now, now);
  db.close();
}
function seedUsed(ig, userId) {
  const db = dbOpen();
  db.exec(`CREATE TABLE IF NOT EXISTS trial_used (
    kind TEXT NOT NULL, value TEXT NOT NULL, user_id INTEGER,
    created_at INTEGER NOT NULL, PRIMARY KEY (kind, value))`);
  db.prepare('INSERT OR REPLACE INTO trial_used (kind, value, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run('ig', ig, userId, Date.now());
  db.close();
}
function guestByIg(ig) {
  const db = dbOpen();
  const u = db.prepare('SELECT id, is_guest FROM users WHERE guest_ig = ?').get(ig);
  db.close();
  return u;
}
function postsOf(uid) {
  const db = dbOpen();
  const r0 = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uid);
  db.close();
  return (r0 && r0.n) || 0;
}

// ---------- La página en VM: DOM de mentira, fetch al servidor real ----------
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
function extractScript(html) {
  const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
  if (!m) throw new Error('no se encontró el bloque <script> de la página');
  return m[1];
}
function makePage({ file, search, storage, ctl }) {
  const html = fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
  const src = extractScript(html);
  const hidden0 = { fStarWrap: true, fLangWrap: true, fErr: true, fStatus: true, fPreview: true };
  const els = {};
  const mkEl = (id) => ({
    id, value: '', hidden: !!hidden0[id], textContent: '', innerHTML: '',
    disabled: false, focused: false,
    focus() { this.focused = true; },
    addEventListener() {},
  });
  for (const id of ['fIg', 'fWeb', 'fStar', 'fStarWrap', 'fLangWrap', 'fErr', 'fStatus', 'fPreview', 'btnGo', 'fLangEn', 'fLangEs']) els[id] = mkEl(id);
  const form = mkEl('fEntry');
  form.listeners = {};
  form.addEventListener = function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); };
  form.dispatchEvent = function (ev) {
    for (const fn of this.listeners[ev.type] || []) fn(ev);
    return true;
  };
  els.fEntry = form;
  const timers = new Set();
  const location = { search: search || '', href: '' };
  const calls = [];
  const realFetch = fetch;
  const pageFetch = async (url, opts) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('/api/trial/prefill')) {
      return new Response(JSON.stringify({
        ok: true, name: 'Reanudar Café',
        productos: [{ nombre: 'Café de especialidad' }], category: 'cafeteria',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.startsWith('/api/trial/generate-stream') && ctl.hangStream) {
      const stream = new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('event: status\ndata: {"text":"Armando tu primer posteo…"}\n\n')); },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (u.startsWith('/api/trial/gen-status') && ctl.fakeGenerating > 0) {
      ctl.fakeGenerating--;
      const igQ = decodeURIComponent((u.split('ig=')[1] || '').split('&')[0]);
      return new Response(JSON.stringify({ ok: true, ig: igQ, cached: false, generating: true }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return realFetch(BASE + u, opts);
  };
  const sandbox = {
    document: { getElementById: (id) => els[id] || null },
    localStorage: storage,
    location,
    fetch: pageFetch,
    URLSearchParams, FormData, TextDecoder, Event, Intl, console,
    setTimeout: (fn, ms, ...a) => { const h = setTimeout(fn, ms, ...a); timers.add(h); return h; },
    clearTimeout: (h) => { timers.delete(h); clearTimeout(h); },
    setInterval: (fn, ms, ...a) => { const h = setInterval(fn, ms, ...a); timers.add(h); return h; },
    clearInterval: (h) => { timers.delete(h); clearInterval(h); },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: file });
  return {
    els, form, location, calls,
    teardown() { for (const h of timers) { clearTimeout(h); clearInterval(h); } timers.clear(); },
  };
}
function submitForm(page) { page.form.dispatchEvent(new Event('submit')); }

// ---------- Escenarios ----------
async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: 'adm-reanudar', SUPERVISION_HOOK_URL: '', TRIAL_TEST_KEY: 'test-reanudar-suite', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await sleep(1000);
    }
    t('C0 server booteó', up, log.slice(-400));
    if (!up) return;

    const served = await (await fetch(BASE + '/prueba')).text();
    if (!CONTROL) t('C0b el servidor sirve /prueba con la maquinaria nueva', has(served, 'pz_trial_pending'));
    else t('C0b CONTROL el servidor sirve /prueba SIN la maquinaria', !has(served, 'pz_trial_pending'));

    // ── S1 · Recarga a mitad de generación: la página reanuda sola,
    //        polea gen-status (sigue en vuelo) y llega a la semana ──
    {
      const ig = 'reanudar1';
      const storage = makeStorage();
      const p1 = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: true, fakeGenerating: 0 } });
      t('S1.1 sin intención ni ?ig=, la carga no dispara ningún fetch', p1.calls.length === 0, JSON.stringify(p1.calls));
      p1.els.fIg.value = '@' + ig;
      p1.els.fWeb.value = ig + '.com';
      submitForm(p1);
      const saved = await waitFor(() => storage.getItem(PENDING_KEY), CONTROL ? 3000 : 8000, 'intención persistida al submit');
      let pend = null;
      try { pend = JSON.parse(storage.getItem(PENDING_KEY) || 'null'); } catch (e) {}
      if (!CONTROL) {
        t('S1.2 el submit persiste la intención {ig, web, ts} antes de armar',
          saved && !!pend && pend.ig === ig && pend.web === 'https://' + ig + '.com' && Date.now() - pend.ts < 60000,
          JSON.stringify(pend));
      } else {
        t('S1.2c CONTROL la base no persiste NADA al submit (el estado vive solo en memoria)',
          !saved && storage.getItem(PENDING_KEY) === null);
      }
      const inFlight = await waitFor(() => p1.calls.some((u) => u.startsWith('/api/trial/generate-stream')), 8000, 'la primera pasada llega al stream');
      t('S1.3 la primera pasada quedó en vuelo (stream colgado, sin entrar)',
        inFlight && p1.location.href === '', 'calls=' + JSON.stringify(p1.calls));
      p1.teardown(); // ← LA RECARGA: la página muere con la generación en vuelo

      // Detrás, la generación termina: quedan caché + candado con payload.
      const payload = payloadFor(ig);
      seedCache(ig, payload);
      seedLock(ig, ig + '.com', JSON.stringify(payload));

      const p2 = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: false, fakeGenerating: 2 } });
      let entered = false;
      if (CONTROL) { await sleep(4000); entered = p2.location.href === '/#/app/inicio'; }
      else entered = await waitFor(() => p2.location.href === '/#/app/inicio', 45000, 'la página reanudada entra a la app');
      if (!CONTROL) {
        t('S1.4 tras la recarga la página reanuda SOLA y entra a la app', entered, 'href=' + p2.location.href);
        t('S1.5 la reanudación precargó el @ desde la intención', p2.els.fIg.value === '@' + ig, p2.els.fIg.value);
        t('S1.6 poleó gen-status (2 en vuelo + el real con caché)',
          p2.calls.filter((u) => u.startsWith('/api/trial/gen-status')).length >= 3,
          'gen-status calls=' + p2.calls.filter((u) => u.startsWith('/api/trial/gen-status')).length);
        const g = guestByIg(ig);
        t('S1.7 guest/start importó la semana (invitado con 3 posteos)', !!g && postsOf(g.id) === 3,
          g ? 'posts=' + postsOf(g.id) : 'sin invitado');
        t('S1.8 al entrar OK la intención se borró', storage.getItem(PENDING_KEY) === null);
      } else {
        t('S1.4c CONTROL la base NO reanuda: tras la recarga no entra ni llama', !entered && p2.calls.length === 0,
          'href=' + p2.location.href + ' calls=' + p2.calls.length);
      }
      p2.teardown();
    }

    if (!CONTROL) {
      // ── S2 · La generación termina con la página cerrada: al
      //        reabrir, 'done' desde el registro y guest/start entrega ──
      {
        const ig = 'reanudar2';
        const storage = makeStorage();
        const p1 = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: true, fakeGenerating: 0 } });
        p1.els.fIg.value = '@' + ig;
        p1.els.fWeb.value = ig + '.com';
        submitForm(p1);
        await waitFor(() => storage.getItem(PENDING_KEY), 8000, 'intención persistida (S2)');
        p1.teardown(); // la página se cierra antes del done
        const payload = payloadFor(ig);
        seedCache(ig, payload);
        seedLock(ig, ig + '.com', JSON.stringify(payload));
        const p2 = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: false, fakeGenerating: 0 } });
        const entered = await waitFor(() => p2.location.href === '/#/app/inicio', 45000, 'reapertura entra a la app (S2)');
        const g = guestByIg(ig);
        t('S2.1 al reabrir, la semana sale del registro y guest/start la entrega',
          entered && !!g && postsOf(g.id) === 3, 'href=' + p2.location.href + (g ? ' posts=' + postsOf(g.id) : ' sin invitado'));
        t('S2.2 la intención se borró al entrar', storage.getItem(PENDING_KEY) === null);
        p2.teardown();
      }

      // ── S3 · Used definitivo: la intención se borra y la recarga
      //        NO reanuda en bucle ──
      {
        const ig = 'reanudar3';
        seedUsed(ig, 999003);
        const storage = makeStorage();
        const p1 = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: false, fakeGenerating: 0 } });
        p1.els.fIg.value = '@' + ig;
        p1.els.fWeb.value = ig + '.com';
        submitForm(p1);
        const showedUsed = await waitFor(() => !p1.els.fErr.hidden && has(p1.els.fErr.innerHTML, 'ya usó'), 30000, 'cartel de prueba usada (S3)');
        t('S3.1 el stream responde used y la página muestra el cartel de siempre', showedUsed,
          'errHidden=' + p1.els.fErr.hidden + ' html=' + String(p1.els.fErr.innerHTML).slice(0, 120));
        t('S3.2 ante el used definitivo la intención se borró', storage.getItem(PENDING_KEY) === null);
        p1.teardown();
        const p2 = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: false, fakeGenerating: 0 } });
        await sleep(2500);
        t('S3.3 la recarga tras el used NO reanuda (cero fetch, formulario limpio)',
          p2.calls.length === 0 && p2.els.fIg.value === '', 'calls=' + JSON.stringify(p2.calls));
        p2.teardown();
      }

      // ── S4 · Intención vencida (>24 h): formulario limpio ──
      {
        const storage = makeStorage();
        storage.setItem(PENDING_KEY, JSON.stringify({ ig: 'reanudar4', web: 'https://reanudar4.com', star: '', brandLang: '', ts: Date.now() - 25 * 3600 * 1000 }));
        const p = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: false, fakeGenerating: 0 } });
        await sleep(1500);
        t('S4.1 la intención vencida no reanuda (cero fetch, formulario limpio)',
          p.calls.length === 0 && p.els.fIg.value === '', 'calls=' + JSON.stringify(p.calls));
        t('S4.2 la intención vencida se descarta del localStorage', storage.getItem(PENDING_KEY) === null);
        p.teardown();
      }

      // ── S5 · Sin intención: la página se comporta exactamente como hoy ──
      {
        const storage = makeStorage();
        const p = makePage({ file: 'prueba.html', search: '', storage, ctl: { hangStream: false, fakeGenerating: 0 } });
        await sleep(1200);
        t('S5.1 sin intención no hay ningún fetch al cargar', p.calls.length === 0, JSON.stringify(p.calls));
        t('S5.2 el foco va al campo del @, como siempre', p.els.fIg.focused === true);
        t('S5.3 no se escribe ninguna intención', storage.getItem(PENDING_KEY) === null);
        p.teardown();
      }

      // ── S6 · El auto-arranque ?ig= sigue intacto (y también persiste) ──
      {
        const storage = makeStorage();
        const p = makePage({ file: 'prueba.html', search: '?ig=reanudar6&web=reanudar6.com', storage, ctl: { hangStream: true, fakeGenerating: 0 } });
        const saved = await waitFor(() => storage.getItem(PENDING_KEY), 8000, 'intención desde ?ig= (S6)');
        let pend = null;
        try { pend = JSON.parse(storage.getItem(PENDING_KEY) || 'null'); } catch (e) {}
        t('S6.1 ?ig= arranca solo como siempre y su submit también persiste la intención',
          saved && !!pend && pend.ig === 'reanudar6', JSON.stringify(pend));
        p.teardown();
      }

      // ── S7 · Espejo EN: la reanudación también dispara sola ──
      {
        const storage = makeStorage();
        storage.setItem(PENDING_KEY, JSON.stringify({ ig: 'reanudar7', web: 'https://reanudar7.com', star: '', brandLang: '', ts: Date.now() }));
        const p = makePage({ file: 'en-prueba.html', search: '', storage, ctl: { hangStream: true, fakeGenerating: 0 } });
        const resumed = await waitFor(() => p.calls.some((u) => u.startsWith('/api/trial/generate-stream')), 15000, 'reanudar en EN');
        t('S7.1 EN: la intención vigente precarga el @ y dispara el auto-arranque',
          resumed && p.els.fIg.value === '@reanudar7', 'ig=' + p.els.fIg.value + ' calls=' + JSON.stringify(p.calls));
        p.teardown();
      }
    }
  } finally {
    try { srv.kill('SIGKILL'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${CONTROL ? 'CONTROL ' : ''}REANUDAR-TRAS-RECARGA: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('suite error:', e); process.exit(2); });
