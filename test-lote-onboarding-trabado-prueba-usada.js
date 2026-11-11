// test-lote-onboarding-trabado-prueba-usada.js — v920 ONBOARDING-TRABADO-PRUEBA-USADA
// Ejecuta el <script> REAL de public/prueba.html y public/en-prueba.html
// en un DOM mínimo (vm) con fetch stubbeado, y comprueba que ante una
// prueba ya usada (409 trial_used / device_used) la pantalla RESUELVE:
// el «Armando tu primer posteo…» DESAPARECE y queda solo el aviso rosa
// con camino a cuenta/plan. Sin reintento que vuelva a colgar el spinner.
// Uso: node test-lote-onboarding-trabado-prueba-usada.js  (desde el scratch)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base-v913');
const REL = path.join(ROOT, 'release');
let pass = 0, fail = 0;
const failed = [];
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; failed.push(name); console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
function scriptOf(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const a = html.indexOf('<script>');
  const b = html.indexOf('</script>', a);
  if (a < 0 || b < 0) throw new Error('sin <script> en ' + htmlPath);
  return html.slice(a + '<script>'.length, b);
}

// --- DOM mínimo + fetch stubbeado ---
function makeEl(id, hidden) {
  return { id, hidden: !!hidden, textContent: '', innerHTML: '', value: '',
    disabled: false, handlers: {}, focus() {}, addEventListener(t, f) { this.handlers[t] = f; } };
}
function runPage(scriptSrc, routes) {
  const els = {
    fIg: makeEl('fIg'), fWeb: makeEl('fWeb'), fStar: makeEl('fStar'),
    fStarWrap: makeEl('fStarWrap', true), fErr: makeEl('fErr', true),
    fStatus: makeEl('fStatus', true), btnGo: makeEl('btnGo'), fEntry: makeEl('fEntry'),
  };
  els.btnGo.textContent = 'Armar mi primer posteo';
  const store = new Map();
  const location = { href: '', search: '' };
  const fetchImpl = async (url) => {
    const u = String(url);
    const key = u.includes('/api/trial/prefill') ? 'prefill'
      : u.includes('/api/trial/generate') ? 'generate'
      : u.includes('/api/guest/start') ? 'start' : 'other';
    const r = typeof routes[key] === 'function' ? routes[key](u) : routes[key];
    if (r instanceof Error) throw r;
    if (!r) throw new Error('fetch no stubbeado: ' + u);
    return { ok: !!r.ok, status: r.status || (r.ok ? 200 : 500),
      json: async () => (r.body === undefined ? {} : r.body) };
  };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] || null },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    location, fetch: fetchImpl, FormData, URLSearchParams, console,
    setTimeout, clearTimeout,
  });
  vm.runInContext(scriptSrc, ctx, { filename: 'prueba-inline.js' });
  return { els, location, submit: (ig, web) => {
    els.fIg.value = ig; els.fWeb.value = web || '';
    return els.fEntry.handlers.submit({ preventDefault() {} });
  } };
}
const resp = (ok, status, body) => ({ ok, status, body });
const PREFILL_OK = resp(true, 200, { ok: true, ig: 'bluebottle', name: 'Blue Bottle', category: 'bebidas', productos: [{ nombre: 'Cold Brew' }] });
const PREFILL_NEED_STAR = resp(true, 200, { ok: true, ig: 'bluebottle', name: 'Blue Bottle', category: 'otro', productos: [] });
const GEN_OK = resp(true, 200, { ok: true });
const START_OK = resp(true, 200, { ok: true });
const USED_409 = resp(false, 409, { trial_used: true, error: 'Este negocio ya usó su única prueba gratis 💛 Si es tuyo, entrá a tu cuenta o elegí tu plan y Posty sigue publicando para vos cada semana.' });
const DEVICE_409 = resp(false, 409, { device_used: true, error: 'Este dispositivo ya usó su prueba gratis 💛 Entrá a tu cuenta o elegí tu plan.' });

async function main() {
  console.log('== A. ES: generate 409 trial_used (Blue Bottle, el caso real) ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: PREFILL_OK, generate: USED_409, start: START_OK });
    await p.submit('@bluebottle', 'bluebottlecoffee.com');
    t('A1 status «Armando…» OCULTO tras el 409', p.els.fStatus.hidden === true, 'hidden=' + p.els.fStatus.hidden);
    t('A2 aviso rosa VISIBLE con el mensaje de prueba usada', p.els.fErr.hidden === false && p.els.fErr.innerHTML.includes('ya usó su única prueba gratis'), p.els.fErr.innerHTML.slice(0, 80));
    t('A3 el aviso trae camino: Entrá a tu cuenta', p.els.fErr.innerHTML.includes('Entrá a tu cuenta'));
    t('A4 el aviso trae camino: Elegí tu plan', p.els.fErr.innerHTML.includes('Elegí tu plan'));
    t('A5 botón re-habilitado con su texto original', p.els.btnGo.disabled === false && p.els.btnGo.textContent === 'Armar mi primer posteo');
    t('A6 no entra al producto', p.location.href === '');
    // Reintento: no vuelve a colgar el spinner.
    await p.submit('@bluebottle', 'bluebottlecoffee.com');
    t('A7 reintento: status sigue OCULTO y el aviso sigue visible', p.els.fStatus.hidden === true && p.els.fErr.hidden === false);
    t('A8 reintento: botón sigue habilitado', p.els.btnGo.disabled === false);
  }
  console.log('== B. ES: generate ok + guest/start 409 device_used (el aviso de dispositivo) ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: PREFILL_OK, generate: GEN_OK, start: DEVICE_409 });
    await p.submit('@bluebottle', 'bluebottlecoffee.com');
    t('B1 status «Entrando…» OCULTO tras el 409', p.els.fStatus.hidden === true, 'hidden=' + p.els.fStatus.hidden);
    t('B2 aviso rosa VISIBLE con mensaje de dispositivo', p.els.fErr.hidden === false && p.els.fErr.innerHTML.includes('dispositivo ya usó su prueba gratis'));
    t('B3 aviso trae camino a cuenta y plan', p.els.fErr.innerHTML.includes('Entrá a tu cuenta') && p.els.fErr.innerHTML.includes('Elegí tu plan'));
    t('B4 botón re-habilitado', p.els.btnGo.disabled === false);
    t('B5 no entra al producto', p.location.href === '');
  }
  console.log('== C. ES: generate ok + guest/start 409 trial_used ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: PREFILL_OK, generate: GEN_OK, start: USED_409 });
    await p.submit('@bluebottle', '');
    t('C1 status OCULTO tras el 409 de guest/start', p.els.fStatus.hidden === true);
    t('C2 aviso rosa VISIBLE de prueba usada', p.els.fErr.hidden === false && p.els.fErr.innerHTML.includes('ya usó su única prueba gratis'));
    t('C3 botón re-habilitado', p.els.btnGo.disabled === false);
  }
  console.log('== D. ES: prefill falla (IG no encontrado) ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: resp(false, 200, { ok: false, error: 'No encontramos ese Instagram' }), generate: GEN_OK, start: START_OK });
    await p.submit('@noexiste123', '');
    t('D1 status «Buscando…» OCULTO tras el fallo de prefill', p.els.fStatus.hidden === true);
    t('D2 error visible', p.els.fErr.hidden === false && p.els.fErr.textContent.includes('No encontramos'));
    t('D3 botón re-habilitado', p.els.btnGo.disabled === false);
  }
  console.log('== E. ES: generate 500 genérico ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: PREFILL_OK, generate: resp(false, 500, { error: 'boom' }), start: START_OK });
    await p.submit('@bluebottle', '');
    t('E1 status OCULTO tras error genérico de generate', p.els.fStatus.hidden === true);
    t('E2 error visible', p.els.fErr.hidden === false);
    t('E3 botón re-habilitado', p.els.btnGo.disabled === false);
  }
  console.log('== F. ES: la red se cae (fetch rechaza) ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: new Error('network down'), generate: GEN_OK, start: START_OK });
    await p.submit('@bluebottle', '');
    t('F1 status OCULTO tras excepción de red', p.els.fStatus.hidden === true);
    t('F2 error visible y botón re-habilitado', p.els.fErr.hidden === false && p.els.btnGo.disabled === false);
  }
  console.log('== G. ES: negocio fresco (Philz) — el flujo feliz sigue intacto ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: PREFILL_OK, generate: GEN_OK, start: START_OK });
    await p.submit('@philzcoffee', 'philzcoffee.com');
    t('G1 entra al producto (/#/app/inicio)', p.location.href === '/#/app/inicio', p.location.href);
    t('G2 sin error visible', p.els.fErr.hidden === true);
  }
  console.log('== H. ES: need_star — la instrucción SÍ queda visible (no es un error) ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/prueba.html')), { prefill: PREFILL_NEED_STAR, generate: GEN_OK, start: START_OK });
    await p.submit('@bluebottle', '');
    t('H1 status VISIBLE con la instrucción de la estrella', p.els.fStatus.hidden === false && p.els.fStatus.textContent.includes('decímelo arriba'));
    t('H2 campo estrella visible', p.els.fStarWrap.hidden === false);
    t('H3 sin error', p.els.fErr.hidden === true);
    t('H4 botón re-habilitado', p.els.btnGo.disabled === false);
  }
  console.log('== I. EN: generate 409 trial_used (mirror) ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/en-prueba.html')), { prefill: PREFILL_OK, generate: resp(false, 409, { trial_used: true, error: 'This business already used its one free trial 💛' }), start: START_OK });
    await p.submit('@bluebottle', 'bluebottlecoffee.com');
    t('I1 status «Building…» OCULTO tras el 409', p.els.fStatus.hidden === true);
    t('I2 aviso VISIBLE en inglés con camino', p.els.fErr.hidden === false && p.els.fErr.innerHTML.includes('already used') && p.els.fErr.innerHTML.includes('Log in to your account') && p.els.fErr.innerHTML.includes('Pick your plan'));
    t('I3 botón re-habilitado', p.els.btnGo.disabled === false);
  }
  console.log('== J. EN: negocio fresco — flujo feliz en inglés ==');
  {
    const p = runPage(scriptOf(path.join(REL, 'public/en-prueba.html')), { prefill: PREFILL_OK, generate: GEN_OK, start: START_OK });
    await p.submit('@philzcoffee', 'philzcoffee.com');
    t('J1 entra al producto', p.location.href === '/#/app/inicio');
  }
  console.log('== K. Regresión: la BASE (v913) SÍ deja el «Armando…» colgado ==');
  {
    const p = runPage(scriptOf(path.join(BASE, 'public/prueba.html')), { prefill: PREFILL_OK, generate: USED_409, start: START_OK });
    await p.submit('@bluebottle', 'bluebottlecoffee.com');
    t('K1 en base-v913 el status queda VISIBLE tras el 409 (el bug existe)', p.els.fStatus.hidden === false, 'hidden=' + p.els.fStatus.hidden);
    t('K2 en base-v913 el aviso rosa ya aparecía (el 409 sí llegaba)', p.els.fErr.hidden === false);
  }
  console.log('== L. Estático: el fix está en ambas páginas y el estampado es solo v920 ==');
  for (const f of ['public/prueba.html', 'public/en-prueba.html']) {
    const s = fs.readFileSync(path.join(REL, f), 'utf-8');
    t('L1 ' + f + ': showErr apaga el status', s.includes("function showErr(m) { statusEl.hidden = true; errEl.textContent = m; errEl.hidden = false; }"));
    t('L2 ' + f + ': showErrHtml apaga el status', s.includes("function showErrHtml(h) { statusEl.hidden = true; errEl.innerHTML = h; errEl.hidden = false; }"));
    t('L3 ' + f + ': comentario v908 presente', s.includes('v908'));
    t('L4 ' + f + ': usedHtml con links a login y plan', s.includes('/#/login') && s.includes('/#/app/ajustes?plan=1'));
  }
  {
    const srv = fs.readFileSync(path.join(REL, 'server.js'), 'utf-8');
    t('L5 BUILD v920 ×1 en server.js', (srv.match(/20261105-v920/g) || []).length === 1);
    t('L6 BUILD v913 ×0 en server.js', (srv.match(/20261105-v913/g) || []).length === 0);
    const es = fs.readFileSync(path.join(REL, 'public/index.html'), 'utf-8');
    const en = fs.readFileSync(path.join(REL, 'public/en/index.html'), 'utf-8');
    t('L7 index ES app.js?v=618 intacto (el lote no toca app.js)', (es.match(/app\.js\?v=618/g) || []).length === 1);
    t('L8 styles?v=20261243 ×1 ES + ×1 EN intacto', (es.match(/styles\.css\?v=20261243/g) || []).length === 1 && (en.match(/styles\.css\?v=20261243/g) || []).length === 1);
    t('L9 EN sin app.js?v=', !/app\.js\?v=/.test(en));
  }
  console.log('== M. Diff release/ vs base-v913: exactamente el lote + estampado ==');
  {
    const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };
    const relOf = (p, root) => path.relative(root, p);
    const baseFiles = new Map(walk(BASE).map((p) => [relOf(p, BASE), md5(p)]));
    const relFiles = new Map(walk(REL).map((p) => [relOf(p, REL), md5(p)]));
    const diff = [];
    for (const [k, h] of relFiles) if (baseFiles.get(k) !== h) diff.push(k);
    for (const k of baseFiles.keys()) if (!relFiles.has(k)) diff.push(k + ' (FALTA en release)');
    diff.sort();
    console.log('  archivos que difieren: ' + JSON.stringify(diff));
    const expected = ['public/en-prueba.html', 'public/prueba.html', 'server.js', 'test-lote-onboarding-trabado-prueba-usada.js'].sort();
    t('M1 difieren exactamente los 4 esperados', JSON.stringify(diff) === JSON.stringify(expected), JSON.stringify(diff));
  }
  console.log('\nTOTAL: ' + pass + ' passed, ' + fail + ' failed');
  if (failed.length) { console.log('FALLARON: ' + failed.join(' | ')); process.exit(1); }
}
main().catch((e) => { console.error('SUITE ROTA: ', e); process.exit(1); });
