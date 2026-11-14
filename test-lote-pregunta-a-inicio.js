// test-lote-pregunta-a-inicio.js
// LOTE PREGUNTA-A-INICIO — hallazgo verificado por el tablero en el
// árbol v1029: la pregunta semanal («la pregunta de los lunes», el tema
// 'lunes' de la pila de temas que sale de /api/weekly-consultas cuando
// la semana sigue sin respuesta) quedó sin puerta viva para el
// REGISTRADO. La pila (pzTemaInit/pzTemaCargar) se monta solo dentro
// de #pzChatFull (bindChatFull) y el router (tab 'chat') redirige al
// registrado a Inicio: la ruta quedó solo para el invitado. La pregunta
// es el modelo válido de duda con opciones de un toque — tiene que
// tener superficie alcanzable para un cliente que paga.
// Qué cambia (solo public/app.js):
//   (a) Inicio suma el slot #pzTemaInicio arriba del contenido del día
//       y bindInicio llama pzTemaInicioInit().
//   (b) pzTemaInicioInit/Elegir: para el registrado, si la semana sigue
//       sin respuesta, pintan LA MISMA tarjeta de la pila (mismo
//       título, mismos 4 rangos, mismas confirmaciones) y guardan por
//       el MISMO endpoint (POST /api/weekly-consultas). Al responder,
//       la tarjeta colapsa a la línea de confirmación; si el guardado
//       falla, los botones se reactivan con el error en la tarjeta.
//   (c) El invitado NO la recibe en Inicio (gate pzIsGuest(): en la
//       prueba no hay semana de consultas — el gate del lote
//       NOTA-VOZ en pzTemaCargar se conserva y se extiende a esta
//       superficie) ni el espejo «ver como visitante» (HF_VISITOR).
//   (d) Los otros dos temas NO se portan, con censo: 'hoy' ya vive en
//       Inicio (la tarjeta héroe del día) y 'comentario' tiene su
//       superficie en la pantalla Nivel (la fila despliega el borrador
//       y pzNivelEnviarRespuesta manda la misma respuesta sugerida por
//       el mismo endpoint). La vista de chat del invitado no se toca:
//       chatFullView, bindChatFull, pzTemaInit, pzTemaCargar y
//       pzTemaPintar quedan byte-idénticos (pin contra PZ_BASE).
// Se corre desde la raíz del release:
//   PZ_BASE=<base> NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-pregunta-a-inicio.js
// Control contra la base v1029 (reproduce el hallazgo: el registrado
// rebota a Inicio y la pregunta no está en ningún lado):
//   PZ_ROOT=<base> PZ_BASE=<base> NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-pregunta-a-inicio.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const BASE = process.env.PZ_BASE || '';
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const NUEVO = APP.includes('function pzTemaInicioInit');
const BASE_APP = (BASE && fs.existsSync(path.join(BASE, 'public', 'app.js')))
  ? fs.readFileSync(path.join(BASE, 'public', 'app.js'), 'utf8') : null;

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ok - ' + name); }
  else { fail++; failures.push(name); console.log('  MAL - ' + name + (extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
function eq(a, b, name) { ok(a === b, name, 'esperado ' + JSON.stringify(b) + ' — obtenido ' + JSON.stringify(a)); }
function count(hay, needle) { return String(hay).split(needle).length - 1; }
function seccion(s) { console.log('\n[' + s + ']'); }
function sliceOf(src, a, b) {
  const i = src.indexOf(a); if (i < 0) return null;
  const j = src.indexOf(b, i); if (j < 0) return null;
  return src.slice(i, j);
}
function md5File(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }

/* ── A · Censo: la puerta nueva existe (y solo ella cambia) ── */
seccion('A · la pregunta de los lunes gana su puerta en Inicio');
{
  eq(count(APP, 'id="pzTemaInicio"'), NUEVO ? 1 : 0, 'A1 el slot #pzTemaInicio en inicioView' + (NUEVO ? '' : ' — ausente en la base: el hallazgo'));
  eq(count(APP, 'function pzTemaInicioInit'), NUEVO ? 1 : 0, 'A2 pzTemaInicioInit definida una sola vez');
  eq(count(APP, 'try { pzTemaInicioInit(); } catch (e) {}'), NUEVO ? 1 : 0, 'A3 bindInicio la llama una sola vez');
  eq(count(APP, "api.post('/api/weekly-consultas', { rango })"), NUEVO ? 3 : 2, 'A4 el guardado va por el endpoint de siempre (chat ×2' + (NUEVO ? ' + Inicio ×1' : '') + ')');
  eq(count(APP, "api.get('/api/weekly-consultas')"), NUEVO ? 2 : 1, 'A5 la lectura de la semana es la del endpoint de siempre');
  eq(count(APP, "if (typeof pzIsGuest === 'function' && pzIsGuest()) return;"), NUEVO ? 1 : 0, 'A6 el gate de invitado está en la superficie nueva' + (NUEVO ? '' : ' — ausente en la base: no hay superficie nueva'));
  {
    const ini = sliceOf(APP, 'async function pzTemaInicioInit()', 'async function pzTemaInicioElegir(');
    ok(NUEVO ? (!!ini && ini.includes("typeof HF_VISITOR !== 'undefined' && HF_VISITOR")) : ini === null, 'A7 el espejo «ver como visitante» tampoco la muestra (gate dentro de pzTemaInicioInit)');
  }
  // El hallazgo, pineado en ambos árboles: el router sigue mandando al
  // registrado a Inicio y la pila sigue montándose solo en el chat.
  eq(count(APP, "tab === 'chat') { if (!(typeof pzIsGuest === 'function' && pzIsGuest())) { location.hash = '#/app/inicio'; return; }"), 1, 'A8 el router: la ruta chat sigue siendo solo del invitado');
  eq(count(APP, 'pzTemaInit();'), 1, 'A9 pzTemaInit se llama solo desde bindChatFull (la pila no se duplicó)');
  ok(APP.includes('function pzTemaCargar') && APP.includes("const esInvitado = (typeof pzIsGuest === 'function') && pzIsGuest();"), 'A10 la pila del chat y su gate de invitado quedan como estaban');
  ok(SERVER.includes("app.get('/api/weekly-consultas'") && SERVER.includes("app.post('/api/weekly-consultas'") && SERVER.includes('WEEKLY_CONSULTAS_RANGOS'), 'A11 el endpoint y sus rangos del server no se tocan');
  // Los temas que NO se portan tienen su camino vivo (censo):
  ok(APP.includes('function pzHoyCardHTML') && APP.includes('pzHoyHoyHTML(hoyPostR1'), 'A12 el tema «hoy» ya vive en Inicio: la tarjeta héroe del día');
  ok(APP.includes('function pzNivelEnviarRespuesta') && APP.includes("api.post('/api/comments/' + id + '/reply'") && APP.includes('pz-mision-borrador'), 'A13 el tema «comentario» tiene su superficie en Nivel (borrador + envío por el mismo endpoint)');
}

/* ── A2 · La vista de chat del invitado, byte-idéntica (con PZ_BASE) ── */
seccion('A2 · la superficie del invitado no se toca');
{
  if (!BASE_APP) {
    console.log('  (sin PZ_BASE: se omiten los pines de identidad byte a byte)');
  } else {
    const cortes = [
      ['function chatFullView()', '/* ===== LOTE REDISENO-R6', 'chatFullView + bindChatFull'],
      ['function pzTemaInit()', 'async function pzTemaCargar()', 'pzTemaInit'],
      ['async function pzTemaCargar()', 'function pzTemaActual()', 'pzTemaCargar (con su gate de invitado)'],
      ['function pzTemaPintar()', 'function pzTemaAvanzar()', 'pzTemaPintar'],
      ['function pzTemaLunesBoxHTML', 'async function pzTemaGuardarLunesDesdeHoy', 'la caja de los lunes del mensaje del día'],
    ];
    for (const [a, b, nombre] of cortes) {
      eq(sliceOf(APP, a, b), sliceOf(BASE_APP, a, b), 'A2 byte-idéntico: ' + nombre);
    }
    eq(md5File(path.join(ROOT, 'server.js')), md5File(path.join(BASE, 'server.js')), 'A2 server.js byte-idéntico');
    eq(md5File(path.join(ROOT, 'public', 'styles.css')), md5File(path.join(BASE, 'public', 'styles.css')), 'A2 styles.css byte-idéntico (las clases .pz-tema ya son globales)');
    eq(md5File(path.join(ROOT, 'public', 'index.html')), md5File(path.join(BASE, 'public', 'index.html')), 'A2 index.html byte-idéntico (sin bump: lo estampa el preparador)');
    eq(md5File(path.join(ROOT, 'public', 'en', 'index.html')), md5File(path.join(BASE, 'public', 'en', 'index.html')), 'A2 en/index.html byte-idéntico');
  }
}

/* ── B · Comportamiento en VM: la tarjeta vive en Inicio ── */
function makeSlot() {
  const slot = { dataset: {}, _html: '', _chips: [], _span: { textContent: '' } };
  Object.defineProperty(slot, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      this._html = String(v);
      this._chips = [];
      const re = /data-tema-op="([^"]+)"/g; let m;
      while ((m = re.exec(this._html)) !== null) {
        const chip = { dataset: { temaOp: m[1] }, disabled: false, onclick: null, _set: new Set() };
        chip.classList = { add: (c) => chip._set.add(c), remove: (c) => chip._set.delete(c), contains: (c) => chip._set.has(c) };
        this._chips.push(chip);
      }
    },
  });
  slot.querySelectorAll = function (sel) { return sel === '[data-tema-op]' ? this._chips : []; };
  slot.querySelector = function (sel) { return sel === '.pz-tema > span' ? this._span : null; };
  return slot;
}
function makeApi(consultas, opts) {
  const calls = { get: [], post: [] };
  const impl = {
    get: async (u) => { calls.get.push(u); if (u === '/api/weekly-consultas') return consultas; return null; },
    post: async (u, b) => { calls.post.push({ u, b }); if (opts && opts.postFails) return { ok: false, error: 'boom' }; return { ok: true, week_key: consultas.week_key, rango: b && b.rango }; },
  };
  return { calls, impl };
}
const tick = () => new Promise((r) => setImmediate(r));

async function seccionVM() {
  seccion('B · la pregunta en Inicio, respondida con un toque');
  const start = APP.indexOf('var PZ_TEMA = null;');
  const end = APP.indexOf('function pzTemaPintar()');
  ok(start > 0 && end > start, 'B0 la pila de temas se extrae para la VM');
  if (!(start > 0 && end > start)) return;
  const prelude = [
    'var CHAT = [];',
    'var HF_VISITOR = false;',
    "var ME = { lang: 'es' };",
    'var __flags = { guest: false };',
    'function pzIsGuest() { return !!__flags.guest; }',
    "function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;'); }",
    'function chatSay() {}',
    'function chatScroll() {}',
    'function chatAppendMsg() {}',
    "function chatMsgHtml() { return ''; }",
    "function chatHoraHtml() { return ''; }",
    'function pzTemaPintar() {}',
    'var __api = null;',
    'var api = { get: function (u) { return __api.get(u); }, post: function (u, b) { return __api.post(u, b); } };',
    'var __slot = null;',
    "var document = { getElementById: function (id) { return id === 'pzTemaInicio' ? __slot : null; } };",
  ].join('\n');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(prelude + '\n' + APP.slice(start, end), sandbox);

  if (!NUEVO) {
    eq(vm.runInContext('typeof pzTemaInicioInit', sandbox), 'undefined', 'B1 CONTROL BASE: pzTemaInicioInit no existe — el registrado no tiene dónde ver la pregunta');
    eq(vm.runInContext('typeof pzTemaCargar', sandbox), 'function', 'B2 CONTROL BASE: la pila existe, pero solo la monta el chat del invitado');
    return;
  }

  const WK = '2026-11-09';
  // B1 · Registrado, semana sin respuesta: la tarjeta aparece.
  {
    const api = makeApi({ ok: true, week_key: WK, rango: null });
    sandbox.__api = api.impl; sandbox.__slot = makeSlot();
    sandbox.__flags.guest = false; sandbox.HF_VISITOR = false; sandbox.ME = { lang: 'es' };
    await vm.runInContext('pzTemaInicioInit()', sandbox);
    const slot = sandbox.__slot;
    ok(slot._html.includes('La pregunta de los lunes'), 'B1 el registrado ve la pregunta en Inicio (semana sin responder)');
    eq(JSON.stringify(slot._chips.map((c) => c.dataset.temaOp)), JSON.stringify(['lunes-0', 'lunes-1-5', 'lunes-6-15', 'lunes-15+']), 'B1 los 4 rangos de un toque, los de siempre');
    eq(api.calls.get.filter((u) => u === '/api/weekly-consultas').length, 1, 'B1 la semana se lee del endpoint de siempre');
    // B2 · Un toque guarda y la tarjeta colapsa a la confirmación.
    const chip = slot._chips[1];
    eq(typeof chip.onclick, 'function', 'B2 el chip está cableado');
    chip.onclick(); await tick(); await tick(); await tick();
    eq(api.calls.post.length, 1, 'B2 un solo guardado por toque');
    eq(api.calls.post[0].u, '/api/weekly-consultas', 'B2 el endpoint recibe la respuesta');
    eq(api.calls.post[0].b && api.calls.post[0].b.rango, '1-5', 'B2 el rango tocado es el que viaja');
    ok(slot._html.includes('pz-tema-mini') && slot._html.includes('Anotado: 1 a 5 consultas.'), 'B2 la tarjeta colapsa a la confirmación');
  }
  // B3 · Semana ya respondida: no aparece.
  {
    const api = makeApi({ ok: true, week_key: WK, rango: '6-15' });
    sandbox.__api = api.impl; sandbox.__slot = makeSlot();
    await vm.runInContext('pzTemaInicioInit()', sandbox);
    eq(sandbox.__slot._html, '', 'B3 respondida la semana, la pregunta no aparece');
  }
  // B4 · Semana nueva sin responder: vuelve a aparecer.
  {
    const api = makeApi({ ok: true, week_key: '2026-11-16', rango: null });
    sandbox.__api = api.impl; sandbox.__slot = makeSlot();
    await vm.runInContext('pzTemaInicioInit()', sandbox);
    ok(sandbox.__slot._html.includes('La pregunta de los lunes'), 'B4 la semana nueva la trae de nuevo');
  }
  // B5 · Invitado: ni fetch ni tarjeta (en la prueba no hay consultas).
  {
    const api = makeApi({ ok: true, week_key: WK, rango: null });
    sandbox.__api = api.impl; sandbox.__slot = makeSlot(); sandbox.__flags.guest = true;
    await vm.runInContext('pzTemaInicioInit()', sandbox);
    eq(api.calls.get.length, 0, 'B5 el invitado no dispara la lectura');
    eq(sandbox.__slot._html, '', 'B5 el invitado no la ve en Inicio');
    sandbox.__flags.guest = false;
  }
  // B6 · Espejo «ver como visitante»: tampoco.
  {
    const api = makeApi({ ok: true, week_key: WK, rango: null });
    sandbox.__api = api.impl; sandbox.__slot = makeSlot(); sandbox.HF_VISITOR = true;
    await vm.runInContext('pzTemaInicioInit()', sandbox);
    eq(api.calls.get.length, 0, 'B6 el espejo visitante no dispara la lectura');
    eq(sandbox.__slot._html, '', 'B6 el espejo visitante no la ve');
    sandbox.HF_VISITOR = false;
  }
  // B7 · Si el guardado falla: botones vivos y error en la tarjeta.
  {
    const api = makeApi({ ok: true, week_key: WK, rango: null }, { postFails: true });
    sandbox.__api = api.impl; sandbox.__slot = makeSlot();
    await vm.runInContext('pzTemaInicioInit()', sandbox);
    const slot = sandbox.__slot;
    await vm.runInContext("pzTemaInicioElegir('lunes-0', __slot._chips[0])", sandbox);
    ok(slot._chips.every((c) => c.disabled === false), 'B7 tras el fallo los botones se reactivan');
    ok(slot._span.textContent.includes('no pude guardarlo'), 'B7 el error queda en la tarjeta, sin callejón');
  }
  // B8 · EN: la misma tarjeta en el idioma de la cuenta.
  {
    const api = makeApi({ ok: true, week_key: WK, rango: null });
    sandbox.__api = api.impl; sandbox.__slot = makeSlot(); sandbox.ME = { lang: 'en' };
    await vm.runInContext('pzTemaInicioInit()', sandbox);
    ok(sandbox.__slot._html.includes("Monday's question"), 'B8 la tarjeta sale en inglés si la cuenta es EN');
    await vm.runInContext("pzTemaInicioElegir('lunes-15+', __slot._chips[3])", sandbox);
    eq(api.calls.post[0].b.rango, '15+', 'B8 el rango viaja igual en EN');
    ok(sandbox.__slot._html.includes('Noted: more than 15'), 'B8 la confirmación sale en inglés');
    sandbox.ME = { lang: 'es' };
  }
}

/* ── C · Boot smoke: lo servido es lo construido ── */
async function seccionBoot() {
  seccion('C · boot smoke del servidor');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 35800 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-pregunta-inicio-'));
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: process.env.NODE_PATH || '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (dd) => { out += dd; });
  child.stderr.on('data', (dd) => { out += dd; });
  try {
    const t0 = Date.now();
    let version = null;
    while (Date.now() - t0 < 90000) {
      try { const r = await fetch('http://127.0.0.1:' + port + '/api/version'); if (r.ok) { version = await r.json(); break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    ok(!!version && !!version.build, 'C1 el servidor botea y /api/version responde', version || out.slice(-300));
    if (version) {
      const rApp = await fetch('http://127.0.0.1:' + port + '/app.js');
      const bundle = await rApp.text();
      eq(count(bundle, 'pzTemaInicioInit'), NUEVO ? 2 : 0, 'C2 el bundle servido ' + (NUEVO ? 'trae la puerta de la pregunta (definición + llamada)' : 'confirma el hallazgo (sin puerta)'));
      ok(bundle.includes('pzTemaLunesBoxHTML') && bundle.includes('La pregunta de los lunes'), 'C3 el bundle conserva la pila de temas del chat del invitado');
    }
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  await seccionVM();
  await seccionBoot();
  console.log('\n════════════════════════════════════════════════════');
  console.log('LOTE PREGUNTA-A-INICIO: ' + pass + ' ok · ' + fail + ' MAL');
  if (failures.length) { console.log('Fallaron:'); for (const f of failures) console.log(' - ' + f); }
  process.exit(fail ? 1 : 0);
})();
