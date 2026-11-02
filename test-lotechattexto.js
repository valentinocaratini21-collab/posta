// test-lotechattexto.js — LOTE FIX ROTACIÓN DEL TEXTO DEL CHAT (2026-11-01).
// Reporte de Valentino 1/11 ~12:18 «todavía no cambia el texto del chat
// de posty en el celular». Causa doble, verificada en el bundle servido:
// (1) la guarda de foco: el tick no tocaba el campo enfocado, y desde
// v521 la hoja abre con el campo activo → la rotación quedaba bloqueada
// para siempre en el celular; (2) un solo timer global + querySelector
// first-only: con dos chats en pantalla, el segundo nunca rotaba. Y un
// tercer rotador viejo (13 frases, 4 s) peleaba con el de 4 frases sobre
// el mismo #chatInput. Fix: rotador unificado — un solo intervalo de
// ~8 s para TODOS los campos (#chatInput en todas sus instancias +
// .hf-ask-input), cada campo con su propio índice, guarda única = campo
// con texto (el foco ya NO bloquea), sobrevive a re-renders (el tick
// consulta el DOM + un observador suma los campos nuevos) y al abrir la
// hoja arranca de nuevo. Mismas 4 frases ES + espejo EN, mismo estilo.
// Node puro, lee el árbol + vm con DOM falso.
// Uso: node test-lotechattexto.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- Versiones + censo (referencia v527) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v527 en server.js');
t(idx.includes('app.js?v=354'), 'index ES: app.js?v=354 (bump al push v529)');
t(idxEn.includes('styles.css?v=20261073') && !idxEn.includes('app.js?v='), 'en/index: styles 20261070, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V sigue v523 (ningún chunk tocado)');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- Bloque nuevo presente, viejo ausente ----------
const ROT = sliceFn(app, 'const PZ_CHAT_PH = {', 'async function bindChatView()');
t(ROT.length > 2000, 'bloque rotador extraíble');
for (const f of ['pzPhEls', 'pzPhReduced', 'pzPhAdvanceOne', 'pzPhKnown', 'pzPhMark',
  'pzChatPhNext', 'pzAskPhNext', 'pzPhTick', 'pzPhInstallObs', 'pzPhEnsure',
  'pzPhStart', 'pzChatPhStart', 'pzAskPhStart'])
  t(cnt(app, 'function ' + f) === 1, 'sin duplicados: ' + f + ' 1');
t(!app.includes('PZ_CHAT_PH_I') && !app.includes('PZ_CHAT_PH_T'), 'viejo: sin PZ_CHAT_PH_I/T');
t(!app.includes('PZ_ASK_PH_I') && !app.includes('PZ_ASK_PH_T'), 'viejo: sin PZ_ASK_PH_I/T');
t(!app.includes('pzRotarPlaceholderChat') && !app.includes('PZ_CHAT_PLACEHOLDERS'), 'viejo: sin rotador de 13 frases');
t(!app.includes('PZ-PLACEHOLDER-ROTATIVO'), 'viejo: sin bloque ROTATIVO');
t(!ROT.includes('activeElement'), 'rotador: sin ninguna guarda de foco');
t(!ROT.includes("getElementById('chatInput')"), 'rotador: sin getElementById (first-only)');
t(ROT.includes("pzPhEls('#chatInput')") && ROT.includes("pzPhEls('.hf-ask-input')"), 'rotador: consulta TODOS los campos');
t(ROT.includes('setInterval(pzPhTick, 4000)') && cnt(ROT, 'setInterval(') === 1, 'rotador LOTE CHAT4S: un solo intervalo de 4000 ms (antes 8000 ms)');
t(app.includes('try { pzPhStart(); } catch (e) {}') && sliceFn(app, 'function mzOpenSheet(', 'function mzCloseSheet()').includes('pzPhStart()'), 'hoja: mzOpenSheet arranca la rotación');
t(ROT.includes("'(prefers-reduced-motion: reduce)'"), 'rotador: respeta reduced-motion');
t(app.includes("es: ['escribile a posty…', 'preguntale por tu semana…', 'pedile una idea para hoy…', 'contale qué vendés…']"), 'contenido: mismas 4 frases ES');
t(app.includes("en: ['write to posty…', 'ask about your week…', 'ask for an idea for today…', 'tell him what you sell…']"), 'contenido: espejo EN con 4 frases');

// ---------- M78: llamadas del bloque resuelven ----------
{
  const called = new Set();
  for (const m of ROT.matchAll(/\b(pz[A-Za-z0-9_]+)\s*\(/g)) called.add(m[1]);
  const missing = [];
  for (const f of called) {
    const def = app.includes('function ' + f + '(') || app.includes('function ' + f + ' ')
      || new RegExp('const ' + f + ' =').test(app) || new RegExp('let ' + f + ' =').test(app);
    if (!def) missing.push(f);
  }
  t(missing.length === 0, 'M78: llamadas del bloque resuelven (' + (missing.length ? missing.join(',') : 'todas') + ')');
  console.log('  (M78 chattexto: ' + called.size + '/' + called.size + ' llamadas resuelven: ' + [...called].sort().join(', ') + ')');
}

// ---------- vm: DOM falso ----------
class El {
  constructor(o) {
    o = o || {};
    this.id = o.id || '';
    this._cls = new Set(o.cls || []);
    this.value = o.value || '';
    this.placeholder = o.placeholder || '';
    this.dataset = {};
  }
}
function makeSandbox(o) {
  o = o || {};
  const registry = [];
  const intervals = [];
  const obsInstances = [];
  let reduced = !!o.reduced;
  const doc = {
    body: new El({}),
    activeElement: null,
    querySelectorAll: (sel) => {
      if (sel === '#chatInput') return registry.filter(el => el.id === 'chatInput');
      if (sel === '.hf-ask-input') return registry.filter(el => el._cls.has('hf-ask-input'));
      return [];
    },
  };
  const win = { matchMedia: () => ({ matches: reduced }) };
  const ME = { lang: o.lang || 'es' };
  const sandbox = {
    document: doc, window: win, ME,
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
    clearInterval: () => {},
    MutationObserver: class { constructor(cb) { this.cb = cb; obsInstances.push(this); } observe() {} },
    console,
  };
  sandbox.window.document = doc;
  vm.createContext(sandbox);
  vm.runInContext(ROT, sandbox);
  return {
    sb: sandbox, doc, ME, registry, intervals, obsInstances,
    mk: (opts) => { const el = new El(opts); registry.push(el); return el; },
    tick: () => { for (const iv of intervals) iv.fn(); },
    setReduced: (v) => { reduced = v; },
    setLang: (l) => { ME.lang = l; },
  };
}
const ES = ['escribile a posty…', 'preguntale por tu semana…', 'pedile una idea para hoy…', 'contale qué vendés…'];
const EN = ['write to posty…', 'ask about your week…', 'ask for an idea for today…', 'tell him what you sell…'];

// --- 1. Arranque: avance inmediato + un solo intervalo ---
{
  const s = makeSandbox();
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  const b = s.mk({ id: 'chatInput', placeholder: ES[0] });
  const c = s.mk({ cls: ['hf-ask-input'], placeholder: ES[0] });
  s.sb.pzPhStart();
  t(s.intervals.length === 1 && s.intervals[0].ms === 4000, 'intervalo LOTE CHAT4S: uno solo, 4000 ms (antes 8000 ms)');
  t(a.placeholder === ES[1] && b.placeholder === ES[1] && c.placeholder === ES[1], 'arranque: los 3 campos avanzan a la frase 2');
  t(a.dataset.phI === '1' && b.dataset.phI === '1' && c.dataset.phI === '1', 'arranque: índice propio en cada campo');
  s.sb.pzPhStart(); s.sb.pzPhStart();
  t(s.intervals.length === 1, 'arranque idempotente: seguir llamando no duplica el intervalo');
}

// --- 2. Tick: ciclo completo + foco NO bloquea (el bug) ---
{
  const s = makeSandbox();
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  s.sb.pzPhStart(); // → ES[1]
  s.doc.activeElement = a; // campo enfocado, como la hoja al abrir (v521)
  s.tick();
  t(a.placeholder === ES[2], 'foco: con el campo enfocado Y vacío, el placeholder AVANZA (bug corregido)');
  s.tick();
  t(a.placeholder === ES[3], 'tick: avanza a la frase 4');
  s.tick();
  t(a.placeholder === ES[0], 'tick: envuelve a la frase 1');
}

// --- 3. Con texto: no avanza ni pisa; al vaciar, retoma ---
{
  const s = makeSandbox();
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  const b = s.mk({ id: 'chatInput', placeholder: ES[0] });
  s.sb.pzPhStart(); // ambos en ES[1]
  a.value = 'hola posty';
  s.tick();
  t(a.placeholder === ES[1] && a.value === 'hola posty', 'texto: campo con texto no cambia ni se pisa');
  t(b.placeholder === ES[2], 'texto: el campo con texto NO bloquea al otro campo');
  a.value = '';
  s.tick();
  t(a.placeholder === ES[2], 'texto: al vaciar, la rotación retoma');
}

// --- 4. Índices independientes por campo ---
{
  const s = makeSandbox();
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  const b = s.mk({ id: 'chatInput', placeholder: ES[0] });
  s.sb.pzPhStart(); // ambos avanzan a ES[1]
  a.dataset.phI = '0'; b.dataset.phI = '2'; // divergen (como dos campos reales)
  s.tick();
  t(a.placeholder === ES[1] && b.placeholder === ES[3], 'independencia: cada campo avanza desde su propio índice');
}

// --- 5. Re-render: el campo nuevo se suma solo ---
{
  const s = makeSandbox();
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  s.sb.pzPhStart(); // a en ES[1], conocido
  const i = s.registry.indexOf(a); s.registry.splice(i, 1); // re-render: elemento viejo fuera
  const n = s.mk({ id: 'chatInput', placeholder: ES[0] }); // elemento nuevo
  s.sb.pzPhEnsure(); // lo que dispara el observador al mutar el DOM
  t(n.placeholder === ES[1], 're-render: el campo nuevo arranca rotando de inmediato');
  s.tick();
  t(n.placeholder === ES[2], 're-render: el campo nuevo sigue rotando en los ticks');
}

// --- 6. Observador: suma campos nuevos sin nuevo intervalo ---
{
  const s = makeSandbox();
  s.sb.pzPhStart();
  t(s.obsInstances.length === 1, 'observador: instalado una vez');
  const n = s.mk({ cls: ['hf-ask-input'], placeholder: ES[0] });
  s.obsInstances[0].cb(); // mutación del DOM
  t(n.placeholder === ES[1], 'observador: el campo nuevo se suma y avanza');
  t(s.intervals.length === 1, 'observador: no duplica el intervalo');
}

// --- 7. EN: espejo con sus 4 frases ---
{
  const s = makeSandbox({ lang: 'en' });
  const a = s.mk({ id: 'chatInput', placeholder: EN[0] });
  const b = s.mk({ cls: ['hf-ask-input'], placeholder: EN[0] });
  s.sb.pzPhStart();
  t(a.placeholder === EN[1] && b.placeholder === EN[1], 'EN: arranque en la frase 2 inglesa');
  s.tick();
  t(a.placeholder === EN[2], 'EN: tick avanza en inglés');
  s.setLang('es');
  s.tick();
  t(a.placeholder === ES[3], 'idioma: al cambiar a ES sigue el ciclo en español');
}

// --- 8. reduced-motion: cambio instantáneo (LOTE CHAT4S: antes frase fija en la primera) ---
{
  const s = makeSandbox({ reduced: true });
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  s.sb.pzPhStart();
  t(a.placeholder === ES[1], 'reduced-motion LOTE CHAT4S: arranque avanza instantáneo a la frase 2 (antes fija en la primera)');
  s.tick(); s.tick();
  t(a.placeholder === ES[3], 'reduced-motion LOTE CHAT4S: los ticks avanzan instantáneo, sin fundido (antes no avanzaban)');
}

// --- 9. Wrappers viejos siguen existiendo y delegan ---
{
  const s = makeSandbox();
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  const b = s.mk({ cls: ['hf-ask-input'], placeholder: ES[0] });
  s.sb.pzChatPhStart();
  t(a.placeholder === ES[1], 'compat: pzChatPhStart arranca el chat principal');
  s.sb.pzAskPhStart();
  t(b.placeholder === ES[1], 'compat: pzAskPhStart arranca el mini-chat');
  t(typeof s.sb.pzChatPhNext === 'function' && typeof s.sb.pzAskPhNext === 'function', 'compat: pzChatPhNext/pzAskPhNext existen');
}

// --- 10. Re-bind no re-avanza los conocidos ---
{
  const s = makeSandbox();
  const a = s.mk({ id: 'chatInput', placeholder: ES[0] });
  s.sb.pzPhStart(); // ES[1]
  s.tick(); // ES[2]
  s.sb.pzPhStart(); // re-bind (otro render): NO re-avanza
  t(a.placeholder === ES[2], 're-bind: los campos conocidos no se re-avanzan');
  t(s.intervals.length === 1, 're-bind: sigue un solo intervalo');
}

console.log(`\ntest-lotechattexto: ${ok} ok, ${bad} fallos`);
process.exitCode = bad ? 1 : 0;
