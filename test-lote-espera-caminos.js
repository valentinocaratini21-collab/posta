// test-lote-espera-caminos.js — LOTE ESPERA-EN-TODOS-LOS-CAMINOS
// (punto 2 del diagnóstico Blind Barber, ~/workspace/.diag-blind-barber/DIAGNOSIS.md).
//
// El bug: la pantalla de espera APROBADA (addendum 8: revelado
// progresivo, insignia dorada, «Lo estoy haciendo bien, no rápido.»,
// medallones por hito real, espejo) vivía SOLO en el stream
// (showWait() al arrancar runTrialStream). La fase previa
// (buildFirstPost → prefill: «Buscando tu Instagram…», «Armando…») y
// la de poleo/resume (waitTrialReady) mostraban la línea de estado
// pelada en #fStatus. La corrida Blind Barber recargó 3 veces y
// vivió en las fases sin diseño.
//
// El arreglo (SOLO cliente, prueba.html + en-prueba.html):
//  1. buildFirstPost monta la espera aprobada ANTES del prefill
//     (resetWait() + showWait()): los estados de la fase entran como
//     la línea «Ahora:» por el ruteo que showStatus ya tenía.
//  2. Al volver el prefill OK, lightHito('ig'): el prefill leyó su
//     Instagram (embed + perfil + rubro) — el mismo hito que en el
//     stream. La estrella NO se enciende: este camino no la conoce.
//  3. El poleo (waitTrialReady) reusa la espera montada: gen-status
//     no informa hitos, así que ningún medallón nuevo se enciende —
//     lo que el camino no sabe queda apagado, como manda el diseño.
//  4. showWait ya no reconstruye una espera construida (buildWait
//     reseteaba los hitos al pasar de fase); el reinicio por corrida
//     es explícito (resetWait en buildFirstPost).
//  5. La salida need_star apaga la espera: la pregunta vive en el
//     formulario, con su aviso en la línea de estado de siempre.
// La estética aprobada no se toca: buildWait, WSTEPS y el CSS quedan
// byte-idénticos (los pins de la parte A lo fijan).
//
// Cómo se prueba: el script REAL de la página en una VM con DOM de
// mentira que SÍ modela la espera (los hijos que buildWait inyecta:
// medallones, #wNow, héroe, espejo) y fetch totalmente stubbeado —
// el lote cambia solo QUÉ pantalla muestra el cliente en cada fase;
// el comportamiento del servidor no se toca y lo cubren las vecinas
// con servidor real (reanudar-recarga, primer-posteo-perfecto).
// Stubs declarados: prefill (payload fijo o diferido), gen-status
// (cola de respuestas), generate-stream (SSE guionado por el test)
// y guest/start (ok). Los TRES caminos se ejercen: pre-stream (S1),
// stream (S2) y poleo/resume (S3, con la intención persistida de la
// recarga); S4 fija la salida need_star.
//
// Modo CONTROL (ESPERA_CONTROL=1, suite copiada a la base v1028):
// la parte estática se invierte y S1/S3 reproducen la corrida —
// durante el prefill y durante el poleo la espera nunca se monta y
// la línea pelada es lo único en pantalla.
//
// Uso: node test-lote-espera-caminos.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const CONTROL = process.env.ESPERA_CONTROL === '1';

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
    await sleep(100);
  }
}

// ---------- Parte A: estática ----------
{
  const es = fs.readFileSync(path.join(ROOT, 'public', 'prueba.html'), 'utf8');
  const en = fs.readFileSync(path.join(ROOT, 'public', 'en-prueba.html'), 'utf8');
  if (!CONTROL) {
    t('A1 ES: la espera se monta antes del prefill (resetWait+showWait+«Buscando…»)',
      count(es, "resetWait();\n    showWait();\n    showStatus('Buscando tu Instagram…')") === 1);
    t('A2 EN: ídem espejo', count(en, "resetWait();\n    showWait();\n    showStatus('Looking up your Instagram…')") === 1);
    t('A3 ES/EN: el hito «ig» del prefill se enciende una sola vez por archivo',
      count(es, "lightHito('ig')") === 1 && count(en, "lightHito('ig')") === 1,
      'es=' + count(es, "lightHito('ig')") + ' en=' + count(en, "lightHito('ig')"));
    t('A4 ES/EN: showWait construye solo si no está construida',
      count(es, 'if (!waitState.built) buildWait();') === 1 && count(en, 'if (!waitState.built) buildWait();') === 1);
    t('A5 ES/EN: resetWait definido ×1',
      count(es, 'function resetWait()') === 1 && count(en, 'function resetWait()') === 1);
    t('A6 ES/EN: la salida need_star apaga la espera justo antes de su aviso ×1',
      count(es, "if (waitEl) waitEl.hidden = true;\n      showStatus('Veo tu perfil pero no qué vendés") === 1
      && count(en, "if (waitEl) waitEl.hidden = true;\n      showStatus('I can see your profile but not what you sell") === 1);
    t('A7 ES/EN: la etiqueta del lote aparece ×5 (showWait, buildFirstPost, hito ig, need_star, poleo)',
      count(es, 'ESPERA-EN-TODOS-LOS-CAMINOS') === 5 && count(en, 'ESPERA-EN-TODOS-LOS-CAMINOS') === 5,
      'es=' + count(es, 'ESPERA-EN-TODOS-LOS-CAMINOS') + ' en=' + count(en, 'ESPERA-EN-TODOS-LOS-CAMINOS'));
    // La estética aprobada, intacta: los anclajes del diseño de ADD-8.
    t('A8 ES: el diseño aprobado sigue byte a byte en sus anclajes',
      has(es, 'Lo estoy haciendo bien, no rápido.') && has(es, "src=\"/ai-avatar.png\" alt=\"Posty\"")
      && has(es, 'LEÍ TU<br>INSTAGRAM') && has(es, 'TU<br>ESTRELLA') && has(es, 'LA<br>ESCENA') && has(es, 'CHEQUEO<br>FINAL')
      && has(es, '<span id="wNow">leyendo tu cuenta…</span>'));
    t('A9 EN: ídem espejo',
      has(en, "I'm doing it well, not fast.") && has(en, "src=\"/ai-avatar.png\" alt=\"Posty\"")
      && has(en, 'READ YOUR<br>INSTAGRAM') && has(en, 'YOUR<br>STAR') && has(en, 'THE<br>SCENE') && has(en, 'FINAL<br>CHECK')
      && has(en, '<span id="wNow">reading your account…</span>'));
  } else {
    t('A1c CONTROL: la base NO monta la espera fuera del stream',
      !has(es, 'ESPERA-EN-TODOS-LOS-CAMINOS') && !has(en, 'ESPERA-EN-TODOS-LOS-CAMINOS')
      && !has(es, 'resetWait') && has(es, 'function showWait() { if (!waitEl) return; buildWait();'));
  }
}

// ---------- La página en VM: DOM de mentira que modela la espera ----------
function makeStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
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
const PREFILL_OK = { ok: true, name: 'Espera Café', productos: [{ nombre: 'Café de especialidad' }], category: 'cafeteria' };
function jsonRes(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json' } });
}
function makePage({ file, search, storage, ctl }) {
  const html = fs.readFileSync(path.join(ROOT, 'public', file), 'utf8');
  const src = extractScript(html);
  const els = {};
  const mkStub = (id) => ({
    id, value: '', textContent: '', disabled: false, focused: false,
    style: { setProperty() {} },
    focus() { this.focused = true; },
    addEventListener() {},
    getAttribute(n) { return n in this ? this[n] : null; },
    setAttribute(n, v) { this[n] = v; },
  });
  const hidden0 = { fStarWrap: true, fLangWrap: true, fErr: true, fStatus: true, fPreview: true, fWait: true, fAskWrap: true };
  // (COMPOSICIÓN v1038) FUNDAMENTO-QUE-DUDA (v1035) sumó #fAskWrap y
  // sus hijos (fAskQ/fAskOpts/fAskSkip) a la página DESPUÉS de que
  // este lote se construyó sobre v1028: el script real los lee al
  // cargar y engancha el listener de fAskSkip, así que el DOM de
  // mentira los registra como stubs (el wrap oculto, como en la
  // página real). Los escenarios de la espera no ejercen la pregunta:
  // la cubre la suite de fundamento.
  for (const id of ['fIg', 'fWeb', 'fStar', 'fStarWrap', 'fLangWrap', 'fErr', 'fStatus', 'fPreview', 'btnGo', 'fLangEn', 'fLangEs', 'fAskWrap', 'fAskQ', 'fAskOpts', 'fAskSkip']) {
    els[id] = mkStub(id); els[id].hidden = !!hidden0[id];
  }
  // #fWait: su innerHTML (el de buildWait) registra los hijos que la
  // pintura usa de verdad: pasos .wstep con su .med, y los ids w*.
  const waitEl = mkStub('fWait');
  waitEl.hidden = true;
  waitEl._steps = [];
  Object.defineProperty(waitEl, 'innerHTML', {
    get() { return this._html || ''; },
    set(h) {
      this._html = String(h);
      this._steps = [];
      const nSteps = count(this._html, 'class="wstep"');
      for (let i = 0; i < nSteps; i++) {
        const med = { innerHTML: '' };
        this._steps.push({ className: 'wstep', _med: med, querySelector(sel) { return sel === '.med' ? this._med : null; } });
      }
      const idRe = /id="(w[A-Za-z]+)"/g;
      let mm;
      while ((mm = idRe.exec(this._html))) {
        const cid = mm[1];
        if (els[cid] && els[cid]._fromWait) continue;
        const child = mkStub(cid);
        child._fromWait = true;
        child.hidden = (cid === 'wHeroBlur' || cid === 'wHeroSharp' || cid === 'wMirror');
        els[cid] = child;
      }
    },
  });
  waitEl.querySelectorAll = function (sel) { return sel === '.wstep' ? this._steps : []; };
  els.fWait = waitEl;
  const form = mkStub('fEntry');
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
  const pageFetch = async (url, opts) => {
    const u = String(url);
    calls.push(u);
    if (u.startsWith('/api/trial/prefill')) {
      if (ctl.prefill === 'defer') return ctl.prefillPromise;
      if (ctl.prefill === 'empty') return jsonRes({ ok: true, name: 'Espera Café', productos: [], category: 'otro' });
      return jsonRes(PREFILL_OK);
    }
    if (u.startsWith('/api/trial/gen-status')) {
      const nxt = ctl.genQueue && ctl.genQueue.length ? ctl.genQueue.shift() : { ok: true, generating: false, cached: true };
      return jsonRes(nxt);
    }
    if (u.startsWith('/api/trial/generate-stream')) {
      const stream = new ReadableStream({
        start(c) {
          ctl.streamCtl = c;
          if (ctl.stream === 'done-now') {
            c.enqueue(new TextEncoder().encode('event: done\ndata: {}\n\n'));
            c.close();
          }
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (u.startsWith('/api/guest/start')) return jsonRes({ ok: true });
    return jsonRes({ ok: false }, 404);
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
    els, form, location, calls, waitEl,
    steps() { return waitEl._steps; },
    sse(text) { ctl.streamCtl.enqueue(new TextEncoder().encode(text)); },
    closeStream() { try { ctl.streamCtl.close(); } catch (e) {} },
    teardown() { for (const h of timers) { clearTimeout(h); clearInterval(h); } timers.clear(); },
  };
}
function submitForm(page, ig) {
  page.els.fIg.value = ig;
  page.form.dispatchEvent(new Event('submit'));
}
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

// ---------- Escenarios ----------
async function main() {
  // ── S1 · PRE-STREAM: durante el prefill, la espera aprobada es la
  //        pantalla (y la línea pelada, no) ──
  {
    const ctl = { prefill: 'defer', genQueue: [{ ok: true, generating: false, cached: false }], stream: 'manual' };
    const d = deferred();
    ctl.prefillPromise = d.promise.then(() => jsonRes(PREFILL_OK));
    const page = makePage({ file: 'prueba.html', search: '', storage: makeStorage(), ctl });
    submitForm(page, '@espera1');
    await sleep(250);
    if (!CONTROL) {
      t('S1.1 la espera está montada y visible DURANTE el prefill', page.waitEl.hidden === false && has(page.waitEl.innerHTML, 'wait-hero'));
      t('S1.2 la insignia dorada y la línea aprobada están en pantalla',
        has(page.waitEl.innerHTML, '/ai-avatar.png') && has(page.waitEl.innerHTML, 'Lo estoy haciendo bien, no rápido.'));
      t('S1.3 hay 4 medallones y ninguno encendido todavía (sin inventar progreso)',
        page.steps().length === 4 && page.steps().every((s) => s.className !== 'wstep done'));
      t('S1.4 el primer medallón figura como el paso en curso', page.steps()[0].className === 'wstep now', page.steps()[0] && page.steps()[0].className);
      t('S1.5 la línea pelada NO es la pantalla: #fStatus queda oculto', page.els.fStatus.hidden === true);
      t('S1.6 el estado del prefill entra como «Ahora:»: «Buscando tu Instagram…»',
        page.els.wNow && page.els.wNow.textContent === 'Buscando tu Instagram…', page.els.wNow && page.els.wNow.textContent);
    } else {
      t('S1.1c CONTROL: durante el prefill la espera NUNCA se monta (reproduce la corrida)',
        page.waitEl.hidden === true && page.waitEl.innerHTML === '');
      t('S1.2c CONTROL: lo único en pantalla es la línea pelada «Buscando tu Instagram…»',
        page.els.fStatus.hidden === false && page.els.fStatus.textContent === 'Buscando tu Instagram…',
        page.els.fStatus.textContent);
    }
    d.resolve();
    const toStream = await waitFor(() => !!ctl.streamCtl, 8000, 'arranque del stream');
    t('S1.7 el flujo llega al stream tras el prefill', toStream);
    if (!CONTROL) {
      t('S1.8 al volver el prefill, el medallón «ig» está encendido (su hito real)',
        page.steps()[0] && page.steps()[0].className === 'wstep done', page.steps()[0] && page.steps()[0].className);
      t('S1.9 la estrella NO se encendió en el pre-stream (este camino no la conoce)',
        page.steps()[1] && page.steps()[1].className !== 'wstep done');
      t('S1.10 los hitos encendidos SOBREVIVEN al arranque del stream (showWait no resetea)',
        page.steps()[0].className === 'wstep done');
    }
    if (ctl.streamCtl) { page.sse('event: done\ndata: {}\n\n'); page.closeStream(); }
    await waitFor(() => page.location.href === '/#/app/inicio', 8000, 'entrada al producto');
    page.teardown();
  }

  // ── S2 · STREAM: los hitos del servidor encienden los medallones
  //        sobre la MISMA espera; héroe y espejo con dato real ──
  if (!CONTROL) {
    const ctl = { prefill: 'ok', genQueue: [{ ok: true, generating: false, cached: false }], stream: 'manual' };
    const page = makePage({ file: 'prueba.html', search: '', storage: makeStorage(), ctl });
    submitForm(page, '@espera2');
    const toStream = await waitFor(() => !!ctl.streamCtl, 8000, 'arranque del stream');
    t('S2.1 el stream arranca con la espera visible', toStream && page.waitEl.hidden === false);
    page.sse('event: hito\ndata: {"hito":"estrella"}\n\n');
    await sleep(250);
    t('S2.2 el hito estrella enciende su medallón (y el de ig sigue encendido)',
      page.steps()[1].className === 'wstep done' && page.steps()[0].className === 'wstep done',
      page.steps().map((s) => s.className).join(','));
    t('S2.3 escena y chequeo siguen sin encender (sus hitos no llegaron)',
      page.steps()[2].className !== 'wstep done' && page.steps()[3].className !== 'wstep done');
    page.sse('event: hero\ndata: {"image":"data:image/jpeg;base64,AAAA"}\n\n');
    page.sse('event: profile\ndata: {"profile":{"best_post":{"thumb":"data:image/jpeg;base64,BBBB","caption":"El favorito"}}}\n\n');
    await sleep(250);
    t('S2.4 el héroe se revela con la foto real del evento hero',
      page.els.wHeroSharp && page.els.wHeroSharp.hidden === false && page.els.wHeroSharp.src === 'data:image/jpeg;base64,AAAA');
    t('S2.5 el espejo aparece solo con el dato real (best_post del profile)',
      page.els.wMirror && page.els.wMirror.hidden === false && page.els.wMirrorImg.src === 'data:image/jpeg;base64,BBBB');
    page.sse('event: post\ndata: {"index":0,"post":{"image":"data:image/jpeg;base64,AAAA","caption":"Un caption","headline":"Titular"}}\n\n');
    await sleep(250);
    t('S2.6 con el primer posteo listo, la espera se apaga y sale la tarjeta real',
      page.waitEl.hidden === true && page.els.fPreview.hidden === false && has(page.els.fPreview.innerHTML, 'Tu primer posteo ya está listo'));
    page.sse('event: done\ndata: {}\n\n');
    page.closeStream();
    const entered = await waitFor(() => page.location.href === '/#/app/inicio', 8000, 'entrada al producto');
    t('S2.7 el flujo entra al producto como siempre', entered);
    page.teardown();
  }

  // ── S3 · POLEO/RESUME: la recarga reanuda sola y, mientras otra
  //        cadena genera, la espera montada es la pantalla ──
  {
    const pend = JSON.stringify({ ig: 'espera3', web: '', star: '', brandLang: '', ts: Date.now() });
    const ctl = {
      prefill: 'ok', stream: 'done-now',
      genQueue: [
        { ok: true, generating: true, cached: false },
        { ok: true, generating: true, cached: false },
        { ok: true, generating: false, cached: true },
      ],
    };
    const page = makePage({ file: 'prueba.html', search: '', storage: makeStorage({ pz_trial_pending: pend }), ctl });
    await sleep(900); // dentro de la ventana del poleo (el ciclo duerme 3 s)
    if (!CONTROL) {
      t('S3.1 la página reanudó sola tras la recarga (llamó a prefill sin submit manual)',
        page.calls.some((u) => u.startsWith('/api/trial/prefill')));
      t('S3.2 DURANTE el poleo la espera aprobada es la pantalla', page.waitEl.hidden === false && has(page.waitEl.innerHTML, 'wait-steps'));
      t('S3.3 el estado del poleo entra como «Ahora:»',
        page.els.wNow && page.els.wNow.textContent === 'Ya estoy armando tu primer posteo — lo busco…',
        page.els.wNow && page.els.wNow.textContent);
      t('S3.4 el poleo NO inventa hitos: escena y chequeo apagados, estrella apagada',
        page.steps().length === 4 && page.steps()[1].className !== 'wstep done'
        && page.steps()[2].className !== 'wstep done' && page.steps()[3].className !== 'wstep done');
      t('S3.5 la línea pelada no convive: #fStatus oculto durante el poleo', page.els.fStatus.hidden === true);
    } else {
      t('S3.1c CONTROL: la página reanudó (la reanudación es de la vecina) pero el poleo va SIN diseño',
        page.waitEl.hidden === true && page.waitEl.innerHTML === '');
      t('S3.2c CONTROL: durante el poleo lo único visible es la línea pelada',
        page.els.fStatus.hidden === false && page.els.fStatus.textContent === 'Ya estoy armando tu primer posteo — lo busco…',
        page.els.fStatus.textContent);
    }
    const entered = await waitFor(() => page.location.href === '/#/app/inicio', 20000, 'fin del poleo y entrada');
    t('S3.6 el poleo termina en la entrada al producto (cached → stream → done)', entered);
    page.teardown();
  }

  // ── S4 · NEED_STAR: la pregunta sale de la espera y vuelve al
  //        formulario, como siempre ──
  if (!CONTROL) {
    const ctl = { prefill: 'empty', genQueue: [], stream: 'manual' };
    const page = makePage({ file: 'prueba.html', search: '', storage: makeStorage(), ctl });
    submitForm(page, '@espera4');
    const asked = await waitFor(() => page.els.fStarWrap.hidden === false, 8000, 'pregunta de estrella');
    t('S4.1 sin productos ni rubro, la pregunta de estrella aparece', asked);
    t('S4.2 la espera se apagó: la pregunta vive en el formulario', page.waitEl.hidden === true);
    t('S4.3 el aviso vuelve a la línea de estado, visible',
      page.els.fStatus.hidden === false && has(page.els.fStatus.textContent, 'Veo tu perfil pero no qué vendés'));
    page.teardown();
  }

  // ── S5 · EN: el pre-stream del espejo monta la misma espera ──
  if (!CONTROL) {
    const ctl = { prefill: 'defer', genQueue: [{ ok: true, generating: false, cached: false }], stream: 'manual' };
    const d = deferred();
    ctl.prefillPromise = d.promise.then(() => jsonRes(PREFILL_OK));
    const page = makePage({ file: 'en-prueba.html', search: '', storage: makeStorage(), ctl });
    submitForm(page, '@espera5');
    await sleep(250);
    t('S5.1 EN: la espera visible durante el prefill, con su línea aprobada',
      page.waitEl.hidden === false && has(page.waitEl.innerHTML, "I'm doing it well, not fast."));
    t('S5.2 EN: el «Now:» lleva el estado del prefill y #fStatus queda oculto',
      page.els.wNow && page.els.wNow.textContent === 'Looking up your Instagram…' && page.els.fStatus.hidden === true,
      page.els.wNow && page.els.wNow.textContent);
    d.resolve();
    await waitFor(() => !!ctl.streamCtl, 8000, 'arranque del stream EN');
    if (ctl.streamCtl) { page.sse('event: done\ndata: {}\n\n'); page.closeStream(); }
    await waitFor(() => page.location.href === '/#/app/inicio', 8000, 'entrada EN');
    page.teardown();
  }

  console.log(`\nESPERA-CAMINOS ${CONTROL ? '(CONTROL) ' : ''}— ok: ${pass} · MAL: ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
