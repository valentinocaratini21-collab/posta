// test-lote-desconectar-refresca.js — LOTE DESCONECTAR-REFRESCA (17/11,
// del video de Valentino grabando la conexión para el App Review de Meta).
// En Ajustes → Conexiones, «Desconectar» desconectaba en el SERVIDOR pero la
// pantalla nunca se enteraba: el handler hacía api.post('/api/ig/disconnect')
// y render() — sin re-leer la sesión — y render() repintaba ajustesView
// desde el PROFILE en memoria, que seguía con ig_connected=1. La fila
// quedaba en «Conectada · @… — lista para publicar» para siempre y el
// cliente no podía reconectar sin salir y volver a entrar.
// El arreglo (solo el handler, en chunk-ajustes.js): la desconexión va en
// try/catch; si falla, la vista sigue conectada y el fallo se VE en
// #igVerifyMsg; si sale bien, se re-lee la sesión con refreshSession(true)
// — con force, porque sin force no viaja si la sesión se cargó hace menos
// de 45 s — y recién ahí render(): la fila pasa al estado desconectado real.
// Suma de la misma familia (nota del liberador, video 14:15): el título de
// la fila era un literal fijo «Cuenta conectada» sobre un cuerpo dinámico —
// al desconectar, la tarjeta decía «Cuenta conectada» y «Todavía no
// conectaste tu Instagram» a la vez. El título ahora sigue al mismo estado
// (conectada / sin conectar); las zonas TikTok/Google ya rendían su título
// por rama y no se tocaron.
// Corre: node test-lote-desconectar-refresca.js (sin node_modules: vm con
// stubs, cero red). Contra prístino: los asserts [FIX] fallan; los de
// no-regresión pasan.
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const chunkSrc = fs.readFileSync(path.join(ROOT, 'public', 'chunk-ajustes.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

let n = 0;
function ok(cond, label) {
  n++;
  assert.ok(cond, label);
  console.log('ok ' + n + ' - ' + label);
}

// ---------- A. Estáticos: el handler refresca antes de repintar ----------
const hStart = chunkSrc.indexOf("const bd = $('#btnIgDisc');");
const hEnd = chunkSrc.indexOf('const stampVerified', hStart);
assert.ok(hStart !== -1 && hEnd > hStart, 'handler de Desconectar extraíble');
const handler = chunkSrc.slice(hStart, hEnd);

const iPost = handler.indexOf("await api.post('/api/ig/disconnect')");
const iRefresh = handler.indexOf('await refreshSession(true)');
const iRender = handler.indexOf('render();');
ok(iPost !== -1, 'el handler sigue llamando POST /api/ig/disconnect');
ok(iRefresh > iPost, '[FIX] tras desconectar se re-lee la sesión con refreshSession(true)');
ok(iRender > iRefresh, '[FIX] render() corre recién después del refresco');
ok(handler.indexOf('try {') !== -1 && handler.indexOf('catch (e)') > iPost, '[FIX] la desconexión va envuelta en try/catch');
ok(handler.indexOf("$('#igVerifyMsg')") !== -1 && handler.indexOf('No se pudo desconectar') !== -1 && handler.indexOf('class="err"') !== -1,
  '[FIX] si la desconexión falla, el aviso visible va a #igVerifyMsg con el motivo');
const entreFalloYRefresco = handler.slice(handler.indexOf('No se pudo desconectar'), iRefresh);
ok(entreFalloYRefresco.indexOf('return;') !== -1, '[FIX] ante el fallo se vuelve sin refrescar ni repintar: la vista queda conectada');

// ---------- B. Alcance: endpoint y layout móvil intactos ----------
ok(serverSrc.indexOf("app.post('/api/ig/disconnect'") !== -1, 'el endpoint de desconexión no se tocó');
ok(serverSrc.indexOf('UPDATE profiles SET ig_connected=0') !== -1, 'el servidor sigue marcando ig_connected=0 al desconectar');
ok(serverSrc.indexOf('DELETE FROM ig_ads_connections') !== -1, 'la desconexión unificada (cae la fila de Ads) no se tocó');
ok(cssSrc.indexOf('@media(max-width:760px)') !== -1 && cssSrc.indexOf('.set-row{flex-direction:column') !== -1,
  'la regla móvil de v1158 (.set-row apilada) sigue en styles.css');
ok(chunkSrc.indexOf("${p.ig_connected ? 'Cuenta conectada' : 'Cuenta sin conectar'}") !== -1,
  '[FIX] el título de la fila de IG sigue al estado (ya no es un literal fijo «Cuenta conectada»)');

// ---------- C. Comportamiento en vm: el handler real, con la vista real ----------
const aStart = chunkSrc.indexOf('function ajustesView() {');
const aEnd = chunkSrc.indexOf('// TikTok semanal', aStart);
assert.ok(aStart !== -1 && aEnd > aStart, 'ajustesView extraíble');
const viewSrc = chunkSrc.slice(aStart, aEnd);

const PROF_CON = {
  ig_username: 'test', ig_connected: 1, business_name: 'Test',
  category: 'otro', tone: '', goal: '', monthly_goal: '', description: '',
  page_slug: 'test', whatsapp: '', page_enabled: 1,
};
const PROF_OFF = Object.assign({}, PROF_CON, { ig_connected: 0 });

function runScenario(failPost) {
  const sandbox = {
    console,
    URLSearchParams,
    IS_NATIVE: false,
    __FAIL: failPost,
    location: { hash: '#/app/ajustes?ig=1' },
    ME: { lang: 'es', plan: 'posty', is_trial: false },
    PROFILE: Object.assign({}, PROF_CON),
    SETTINGS: { ig_token_warning: false, timezone: 'America/New_York', demo_mode: false },
    pzIc: () => '',
    esc: (v) => String(v == null ? '' : v),
    brandColors: () => [],
    assetLogo: () => null,
    igSince: () => '',
    IG_VERIFIED_AT: '',
    IG_MODE_WARN: false,
    CATS: [], catSel: () => 'otro', catCustom: () => '',
    TONES: [], GOALS: [], TIMEZONES: [],
    NEUTRAL_TRIO: ['#111111', '#222222', '#333333'],
  };
  const prelude = `
    const __seq = [];
    const __els = { '#btnIgDisc': { onclick: null }, '#igVerifyMsg': { innerHTML: '' } };
    const $ = (sel) => __els[sel] || null;
    const confirm = () => true;
    const track = () => {}; const trackBeacon = () => {};
    const api = { post: async (url) => { __seq.push('post'); if (__FAIL) throw new Error('falló la red'); return { ok: true }; } };
    const __afterProfile = ${JSON.stringify(PROF_OFF)};
    async function refreshSession(force) { __seq.push('refresh:' + force); PROFILE = __afterProfile; }
    let __html = '';
    function render() { __seq.push('render'); __html = ajustesView(); }
  `;
  const driver = `
    __html = ajustesView();
    const __html0 = __html;
    this.__test = (async () => {
      let err = null;
      try { await __els['#btnIgDisc'].onclick(); } catch (e) { err = String((e && e.message) || e); }
      return { seq: __seq, html0: __html0, html: __html, msg: __els['#igVerifyMsg'].innerHTML, err };
    })();
  `;
  vm.createContext(sandbox);
  vm.runInContext(prelude + '\n' + viewSrc + '\n' + handler + '\n' + driver, sandbox);
  return sandbox.__test;
}

(async () => {
  // --- Éxito: la vista pasa al estado desconectado sin tocar nada más ---
  const r = await runScenario(false);
  ok(r.html0.indexOf('lista para publicar') !== -1 && r.html0.indexOf('id="btnIgDisc"') !== -1 && r.html0.indexOf('Conectada · @test') !== -1,
    'estado inicial conectado: rinde como la base (lista para publicar + Desconectar + resumen «Conectada · @test»)');
  ok(r.err === null, 'éxito: el handler no lanza');
  ok(JSON.stringify(r.seq) === JSON.stringify(['post', 'refresh:true', 'render']),
    '[FIX] éxito: la secuencia es desconectar → refrescar con force → repintar (fue: ' + r.seq.join(',') + ')');
  ok(r.html.indexOf('id="btnIgConn"') !== -1 && r.html.indexOf('Conectar Instagram') !== -1,
    '[FIX] éxito: la fila pasa al estado desconectado y ofrece «Conectar Instagram»');
  ok(r.html.indexOf('lista para publicar') === -1 && r.html.indexOf('Conectada ·') === -1,
    '[FIX] éxito: ya no queda rastro del estado conectado en la fila');
  ok(r.html.indexOf('Sin conectar') !== -1, '[FIX] éxito: el resumen de la sección dice «Sin conectar»');
  ok(r.html.indexOf('id="s_iguser"') !== -1, '[FIX] éxito: aparece el campo de @ del estado desconectado');
  ok(r.html0.indexOf('<div class="t">Cuenta conectada</div>') !== -1,
    'conectado: el título de la fila es «Cuenta conectada», idéntico a la base');
  ok(r.html.indexOf('<div class="t">Cuenta conectada</div>') === -1 && r.html.indexOf('<div class="t">Cuenta sin conectar</div>') !== -1
    && r.html.indexOf('Todavía no conectaste tu Instagram') !== -1,
    '[FIX] desconectado: un solo estado por tarjeta — título «Cuenta sin conectar» con su cuerpo, sin el «Cuenta conectada» fijo');
  ok(r.html.indexOf('class="set-row"') !== -1, 'éxito: la fila conserva la clase .set-row (layout apilado móvil) en el estado desconectado');
  ok(r.msg === '', 'éxito: no se escribe ningún aviso de error');

  // --- Fallo: la vista sigue conectada y el aviso se ve ---
  const f = await runScenario(true);
  ok(f.err === null, '[FIX] fallo: el handler captura el error (no queda una promesa sin manejar)');
  ok(JSON.stringify(f.seq) === JSON.stringify(['post']),
    '[FIX] fallo: no se refresca ni se repinta (fue: ' + f.seq.join(',') + ')');
  ok(f.html === f.html0 && f.html.indexOf('lista para publicar') !== -1,
    '[FIX] fallo: la vista sigue mostrando el estado conectado, sin estado intermedio');
  ok(f.msg.indexOf('No se pudo desconectar') !== -1 && f.msg.indexOf('class="err"') !== -1 && f.msg.indexOf('falló la red') !== -1,
    '[FIX] fallo: el aviso visible trae el motivo');

  console.log('\nDESCONECTAR-REFRESCA: ' + n + ' OK, 0 FALLAS');
})().catch((e) => { console.error('FALLA:', e.message); process.exit(1); });
