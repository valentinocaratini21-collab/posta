'use strict';
/* LOTE L9-OBSERVABILIDAD-POPUP — suite del lote (versión del preparador,
 * re-basada sobre el vivo v1061 → v1062).
 * Corre desde la RAÍZ del scratch del preparador (L9_ROOT o __dirname con
 * base/ y release/). §A estáticos (estampado, censos, anclas) · §B VM: cada
 * gate de maybeShowIgPopup deja su motivo en window.__igPopupSkip + evento
 * ig_popup_skip, y el comportamiento visible es idéntico a la base ·
 * §C boot real del release: /api/version y el index servido.
 *
 * ADAPTACIONES DEL PREPARADOR respecto de la suite del builder (base v980),
 * cada una con su causa:
 *  1. Estampados: BUILD v993→v1062, app.js?v=684→723, styles 20261270→20261282;
 *     los censos de server de v980 (monedaCuentaAds/PLAN_UNICO/contentLangOf)
 *     se reemplazan por los censos vivos que el tablero pidió conservar
 *     (trialTextoFeedGarantizado ×3, seedTrialFeedSnapshot ×2) y los de app.js
 *     (igPopupWow ×2, pzIgMomGate ×0, pzTrialAviso ×16, pzTemaInicio ×7).
 *  2. El motivo 'ig_pending' del caller NO existe en el vivo: desde L8
 *     (v981) el caller de render() llama maybeShowIgPopup(tab) sin gate y el
 *     freno ig_pending vive ADENTRO, combinado con el wow:
 *     if (!wow && PROFILE.ig_pending) return; → se registra como 'sin_wow'
 *     (adaptación pedida por el tablero). La §H pasa a probar ese gate y la
 *     invariancia del caller (línea idéntica base/release).
 *  3. El dismiss en el vivo es igPopupDismissed() con TTL de 24 h (L8 v954):
 *     el valor legado '1' se trata como VENCIDO, no como freno. El escenario
 *     D siembra un timestamp fresco (String(Date.now())) y la aserción del
 *     skip en F espera el timestamp que guarda igPopupDismiss(), no '1'.
 *  4. El gate 'descartado' se ancla a la forma viva if (igPopupDismissed())
 *     en vez del getItem crudo de v980: mismo freno real, otra forma.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = process.env.L9_ROOT || __dirname;
const BASE = path.join(ROOT, 'base');
const REL = path.join(ROOT, 'release');
const PORT = 35093;

let ok = 0, fail = 0;
const fails = [];
function chk(name, cond, extra) {
  if (cond) { ok++; console.log('  ok  ' + name); }
  else { fail++; fails.push(name); console.log('  XX  ' + name + (extra ? ' — ' + extra : '')); }
}
const read = (p) => fs.readFileSync(p, 'utf8');
const count = (s, sub) => s.split(sub).length - 1;

const appRel = read(path.join(REL, 'public/app.js'));
const appBase = read(path.join(BASE, 'public/app.js'));
const srvRel = read(path.join(REL, 'server.js'));
const idxRel = read(path.join(REL, 'public/index.html'));
const idxEnRel = read(path.join(REL, 'public/en/index.html'));

/* ---------------- §A estáticos ---------------- */
console.log('§A estáticos');
chk("BUILD_ID v1062 en server.js ×1", count(srvRel, "const BUILD_ID = '20261105-v1062';") === 1);
chk("BUILD_ID v1061 en server.js ×0", count(srvRel, "const BUILD_ID = '20261105-v1061';") === 0);
chk("index ES app.js?v=723 ×1", count(idxRel, 'app.js?v=723') === 1);
chk("index ES app.js?v=722 ×0", count(idxRel, 'app.js?v=722') === 0);
chk("index EN sin app.js?v=", count(idxEnRel, 'app.js?v=') === 0);
chk("styles?v=20261282 en ambos index", count(idxRel, 'styles.css?v=20261282') === 1 && count(idxEnRel, 'styles.css?v=20261282') === 1);
const chunkOf = (s) => { const m = s.match(/const CHUNK_V = '([^']+)'/); return m ? m[1] : null; };
chk("CHUNK_V intacto (no se tocaron chunks)", chunkOf(appRel) !== null && chunkOf(appRel) === chunkOf(appBase), 'base=' + chunkOf(appBase) + ' rel=' + chunkOf(appRel));
chk("igPopupSkipLog definido ×1", count(appRel, 'function igPopupSkipLog') === 1);
chk("igPopupSkipLog ×0 en la base", count(appBase, 'igPopupSkipLog') === 0);
chk("maybeShowIgPopup definido ×1 (base y release)", count(appRel, 'function maybeShowIgPopup') === 1 && count(appBase, 'function maybeShowIgPopup') === 1);
for (const r of ['sin_sesion', 'ya_conectado', 'ya_visible', 'descartado', 'sin_wow', 'excepcion']) {
  chk("motivo '" + r + "' registrado ×1", count(appRel, "igPopupSkipLog('" + r + "'") === 1, 'got ' + count(appRel, "igPopupSkipLog('" + r + "'"));
}
chk("evento 'ig_popup_skip' ×1 y motivo 'ig_pending' del caller ×0 (no existe en el vivo)", count(appRel, "'ig_popup_skip'") === 1 && count(appRel, "igPopupSkipLog('ig_pending'") === 0);
chk("estado window.__igPopupSkip presente", count(appRel, '__igPopupSkip') >= 2);
chk("censo igPopupWow ×2 y pzIgMomGate ×0 (app.js)", count(appRel, 'igPopupWow') === 2 && count(appRel, 'pzIgMomGate') === 0, 'wow=' + count(appRel, 'igPopupWow') + ' mom=' + count(appRel, 'pzIgMomGate'));
chk("censo pzTrialAviso ×16 y pzTemaInicio ×7 (app.js)", count(appRel, 'pzTrialAviso') === 16 && count(appRel, 'pzTemaInicio') === 7, 'aviso=' + count(appRel, 'pzTrialAviso') + ' tema=' + count(appRel, 'pzTemaInicio'));
chk("censo trialTextoFeedGarantizado ×3 y seedTrialFeedSnapshot ×2 (server)", count(srvRel, 'trialTextoFeedGarantizado') === 3 && count(srvRel, 'seedTrialFeedSnapshot') === 2, 'ttf=' + count(srvRel, 'trialTextoFeedGarantizado') + ' seed=' + count(srvRel, 'seedTrialFeedSnapshot'));

/* ---------------- §B VM ---------------- */
console.log('§B VM (gates + equivalencia con la base)');
function sliceBlock(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error('anclas de extracción no encontradas: ' + from);
  return src.slice(a, b);
}
const blockRel = sliceBlock(appRel, 'function igPopupSkipLog', '/* ---------- toast global');
const blockBase = sliceBlock(appBase, 'function igDismissKey()', '/* ---------- toast global');

function makeCtx(opts) {
  const appended = [], trackEvents = [];
  const lsData = new Map(Object.entries(opts.ls || {}));
  const documentStub = {
    getElementById(id) {
      if (opts.getByIdThrows) throw new Error('boom');
      return (id === 'igFirstOverlay' && opts.overlayExists) ? { id: 'igFirstOverlay' } : null;
    },
    createElement() {
      const el = { id: '', className: '', innerHTML: '', style: {}, _q: {},
        querySelector(sel) { return (el._q[sel] = el._q[sel] || { style: {}, onclick: null }); },
        remove() { el.removed = true; } };
      return el;
    },
    body: { appendChild(el) { appended.push(el); } },
  };
  const ctx = {
    console, setTimeout, clearTimeout,
    window: {},
    ME: opts.me, PROFILE: opts.profile,
    document: documentStub,
    localStorage: {
      getItem(k) { return lsData.has(k) ? lsData.get(k) : null; },
      setItem(k, v) { lsData.set(k, String(v)); },
    },
    navigator: {},
    track(name, props) { trackEvents.push({ name, props }); },
    pzIc: () => '[ic]',
    pzIsGuest: () => false,
    igConnectHere: () => {},
    location: { hash: '#/app/inicio' },
  };
  vm.createContext(ctx);
  return { ctx, appended, trackEvents, lsData };
}
const ME_OK = { id: 42, email: 'a@b.c', lang: 'es' };
const PROF_OK = { ig_connected: false, ig_pending: false, business_name: 'X' };
function runPopup(block, opts, tab) {
  const h = makeCtx(opts);
  vm.runInContext(block, h.ctx, { filename: 'block.js' });
  vm.runInContext('maybeShowIgPopup(' + JSON.stringify(tab || 'inicio') + ')', h.ctx);
  return h;
}
const shown = (h) => h.appended.length;
const skipOf = (h) => (h.ctx.window && h.ctx.window.__igPopupSkip) || null;
const LS_FRESCO = () => ({ 'posta_ig_dismissed_42': String(Date.now()) });

// A: sin sesión
let h = runPopup(blockRel, { me: null, profile: null });
chk('A sin_sesion: motivo registrado', skipOf(h) && skipOf(h).last === 'sin_sesion' && skipOf(h).counts.sin_sesion === 1);
chk('A sin_sesion: evento ig_popup_skip al servidor', h.trackEvents.length === 1 && h.trackEvents[0].name === 'ig_popup_skip' && h.trackEvents[0].props.reason === 'sin_sesion');
chk('A sin_sesion: popup NO mostrado', shown(h) === 0);
// B: ya conectado
h = runPopup(blockRel, { me: ME_OK, profile: Object.assign({}, PROF_OK, { ig_connected: true }) });
chk('B ya_conectado: motivo registrado', skipOf(h) && skipOf(h).last === 'ya_conectado');
chk('B ya_conectado: popup NO mostrado', shown(h) === 0);
// C: overlay ya visible
h = runPopup(blockRel, { me: ME_OK, profile: PROF_OK, overlayExists: true });
chk('C ya_visible: motivo registrado', skipOf(h) && skipOf(h).last === 'ya_visible');
chk('C ya_visible: popup NO mostrado (no duplica)', shown(h) === 0);
// D: descartado vigente (dismiss con timestamp fresco, TTL 24 h de L8)
h = runPopup(blockRel, { me: ME_OK, profile: PROF_OK, ls: LS_FRESCO() });
chk('D descartado: motivo registrado', skipOf(h) && skipOf(h).last === 'descartado');
chk('D descartado: popup NO mostrado', shown(h) === 0);
// E: excepción interna (getElementById lanza) → motivo excepcion, sin crash
h = runPopup(blockRel, { me: ME_OK, profile: PROF_OK, getByIdThrows: true });
chk('E excepcion: motivo registrado y sin crash', skipOf(h) && skipOf(h).last === 'excepcion');
chk('E excepcion: popup NO mostrado', shown(h) === 0);
// F: camino feliz — se muestra, sin motivo, handlers como hoy
h = runPopup(blockRel, { me: ME_OK, profile: PROF_OK });
chk('F feliz: popup mostrado (overlay appendido)', shown(h) === 1 && h.appended[0].id === 'igFirstOverlay');
chk('F feliz: ningún motivo registrado', skipOf(h) === null);
chk('F feliz: handlers go/skip seteados', typeof h.appended[0]._q['#igFirstGo'].onclick === 'function' && typeof h.appended[0]._q['#igFirstSkip'].onclick === 'function');
h.appended[0]._q['#igFirstSkip'].onclick({ preventDefault() {} });
{ const v = h.lsData.get('posta_ig_dismissed_42');
  chk('F feliz: el skip guarda el dismiss como hoy (timestamp)', !!v && /^\d+$/.test(v) && (Date.now() - Number(v)) < 60000 && h.appended[0].removed === true, 'v=' + v); }
// G: dedupe del envío — mismo motivo 2 veces: contador 2, UN solo evento
{
  const h2 = makeCtx({ me: ME_OK, profile: Object.assign({}, PROF_OK, { ig_connected: true }) });
  vm.runInContext(blockRel, h2.ctx);
  vm.runInContext("maybeShowIgPopup('inicio'); maybeShowIgPopup('inicio');", h2.ctx);
  const st = skipOf(h2);
  chk('G dedupe: contador local suma 2', st && st.counts.ya_conectado === 2);
  chk('G dedupe: un solo evento al servidor por motivo', h2.trackEvents.length === 1);
  vm.runInContext('ME = null; maybeShowIgPopup(\'inicio\');', h2.ctx);
  chk('G dedupe: al cambiar el motivo se manda de nuevo', h2.trackEvents.length === 2 && h2.trackEvents[1].props.reason === 'sin_sesion');
}
// H: gate de L8 sin_wow (ig_pending vive adentro desde v981) + caller invariante
{
  const lineOf = (src) => { const m = src.match(/.*maybeShowIgPopup\(tab\);.*$/m); return m ? m[0].replace(/\/\/.*$/, '').trim() : null; };
  chk('H caller idéntico base/release (llamada sin gate, como en el vivo)', lineOf(appRel) !== null && lineOf(appRel) === lineOf(appBase), 'rel=' + lineOf(appRel) + ' base=' + lineOf(appBase));
  const hP = runPopup(blockRel, { me: ME_OK, profile: Object.assign({}, PROF_OK, { ig_pending: true }) });
  chk('H sin_wow: motivo registrado con ig_pending y sin wow', skipOf(hP) && skipOf(hP).last === 'sin_wow' && skipOf(hP).counts.sin_wow === 1);
  chk('H sin_wow: popup NO mostrado', shown(hP) === 0);
  const hW = makeCtx({ me: ME_OK, profile: Object.assign({}, PROF_OK, { ig_pending: true }) });
  vm.runInContext(blockRel, hW.ctx);
  vm.runInContext("igPopupWow = function (tab) { return { sub: 'x', en: false }; };", hW.ctx);
  vm.runInContext("maybeShowIgPopup('inicio')", hW.ctx);
  chk('H con wow: el popup atraviesa el gate ig_pending (mostrado)', shown(hW) === 1 && hW.appended[0].id === 'igFirstOverlay');
  chk('H con wow: ningún motivo registrado', skipOf(hW) === null);
  const hB = runPopup(blockBase, { me: ME_OK, profile: Object.assign({}, PROF_OK, { ig_pending: true }) });
  chk('H base: ig_pending sin wow tampoco mostraba, y sin registro (equivalencia)', shown(hB) === 0 && skipOf(hB) === null);
}
// Equivalencia visible base vs release en los escenarios A–D y F
{
  const cases = [
    ['A', { me: null, profile: null }],
    ['B', { me: ME_OK, profile: Object.assign({}, PROF_OK, { ig_connected: true }) }],
    ['C', { me: ME_OK, profile: PROF_OK, overlayExists: true }],
    ['D', { me: ME_OK, profile: PROF_OK, ls: LS_FRESCO() }],
    ['F', { me: ME_OK, profile: PROF_OK }],
  ];
  for (const [tag, opts] of cases) {
    const hb = runPopup(blockBase, opts);
    const hr = runPopup(blockRel, opts);
    chk('EQ ' + tag + ': mismo resultado visible base/release', shown(hb) === shown(hr), 'base=' + shown(hb) + ' rel=' + shown(hr));
  }
}

/* ---------------- §C boot real ---------------- */
function get(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: 4000 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}
(async () => {
  console.log('§C boot real del release (puerto ' + PORT + ')');
  const dataDir = '/tmp/l9-boot-' + process.pid;
  fs.mkdirSync(dataDir, { recursive: true });
  const srv = spawn(process.execPath, [path.join(REL, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let up = false;
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) {
      try { const r = await get('/api/version'); if (r.status === 200) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1200));
    }
    chk('boot: el server levanta', up);
    if (up) {
      const v = await get('/api/version');
      chk('boot: /api/version = 20261105-v1062', v.body.includes('20261105-v1062'), v.body.slice(0, 80));
      const home = await get('/');
      chk('boot: index servido con app.js?v=723', home.body.includes('app.js?v=723'));
    }
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    try { if (srv.exitCode === null) srv.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log('\nRESULTADO: ' + ok + ' ok · ' + fail + ' fallas' + (fails.length ? ' — ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})();
