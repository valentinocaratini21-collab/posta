// test-lotechatdetalleteclado.js — LOTE CHAT-DETALLE-TECLADO (reporte Valentino 2/11 ~08:44)
// Uso: node test-lotechatdetalleteclado.js [dir]  (dir = raíz del árbol; default: __dirname)
// Captura (app iOS, v547 en vivo): en la capa del detalle (weekCardHTML en
// .scf-pop: Frenar + Pedir un cambio + Por qué + mini-chat "qué le cambiamos
// a este posteo?"), al tocar el campo del mini-chat y abrirse el teclado:
// (1) la parte de ARRIBA de la capa queda cortada bajo la barra de estado;
// (2) el campo queda TAPADO por la barra accesoria nativa del teclado y el
// botón de enviar cortado en el borde. Causa verificada en código v547: en
// WKWebView el teclado NO achica el layout viewport, así que la capa
// centrada con top:50% + translate(-50%,-50%) sobre el layout viewport
// queda fuera del área visible real cuando iOS desplaza la vista. La barra
// ^/v/✓ es nativa (no se quita desde web): el fix trabaja CON ella.
// Fix (mismo patrón del lote chat-pantalla, adaptado a la capa): con el
// teclado abierto, la capa se ancla al viewport VISIBLE (visualViewport):
// arriba = offsetTop + área segura, abajo = offsetTop + alto visible - 8px,
// centrada con offsetLeft visible; el campo enfocado se lleva a la vista
// dentro del scroller. Sin teclado, vuelve a su centrado (estilos inline
// borrados). Sin visualViewport (desktop), no hace nada.
// Node puro, lee el árbol + vm con DOM falso.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = process.argv[2] || __dirname;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  ✗ FALLO: ' + label); } };
const app = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const idx = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

// ---------- Versiones + censo (base v597; pines rotados con causa al liberar: BUILD v547->v598, ?v= 363/20261082 -> 403/20261115, pzGoBack 4->6, /aprobar server 16->17) ----------
ok(srv.includes("const BUILD_ID = '20261101-v598'"), 'BUILD v598 en server.js');
ok(idx.includes('app.js?v=403'), 'index ES: app.js?v=403');
ok(idx.includes('styles.css?v=20261115'), 'index ES: styles 20261115');
ok(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
ok(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
ok(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
ok(cnt(srv, '/' + 'aprobar') === 17, 'censo server: marcador 17');
ok(cnt(app, 'pzGoBack') === 6, 'censo app: pzGoBack 6');
ok(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
ok(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
ok(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');
ok(cnt(app, 'pcDayKeyShift') === 7, 'censo app: pcDayKeyShift 7');
ok(!srv.includes('pzScf'), 'server.js sin tocar (sin pzScf)');

// ---------- Componente exacto + cableado intacto ----------
ok(app.includes('function weekCardHTML(d, o)'), 'componente: weekCardHTML existe');
ok(app.includes('data-pc-act="hold"') && app.includes("L('Frenar', 'Hold')"), 'weekCardHTML: Frenar para programados');
ok(app.includes('pcard-ask') && app.includes("L('Pedir un cambio', 'Request a change')"), 'weekCardHTML: Pedir un cambio');
ok(app.includes("b>Por qué:</b>"), 'weekCardHTML: Por qué');
ok(app.includes("qué le cambiamos a este posteo?"), 'mini-chat: "qué le cambiamos a este posteo?"');
ok(app.includes('class="hf-ask-input"') && app.includes('class="hf-ask-send"'), 'mini-chat: campo + enviar');
ok(app.includes("pop.className = 'scf-pop '"), 'scfOpenPop: crea la capa .scf-pop');
ok(app.includes("if (x) x.onclick = (e) => { e.stopPropagation(); scfClosePop(true); };"), '✕ de la capa intacto (cierra con scfClosePop)');
ok(css.includes('.scf-pop{position:fixed;top:50%;'), 'CSS base .scf-pop intacta (centrada 50%)');
ok(css.includes('.scf-pop .igmock{') && css.includes('overflow-y:auto'), 'scroller interno .igmock intacto');
ok(css.includes('.hf-ask-form{display:flex;gap:8px;align-items:center}'), 'form mini-chat intacto');
ok(css.includes('.hf-ask-send{flex:none;width:38px;height:38px;'), 'botón enviar intacto (38px, flex none)');

// ---------- Fix: bloque nuevo, una sola vez, enganchado en scfOpenPop ----------
ok(cnt(app, 'function pzScfKbSync') === 1, 'sin duplicados: pzScfKbSync 1');
ok(cnt(app, 'function pzScfKbBind') === 1, 'sin duplicados: pzScfKbBind 1');
ok(cnt(app, 'function pzScfSafeTop') === 1, 'sin duplicados: pzScfSafeTop 1');
ok(cnt(app, 'function pzScfScrollInput') === 1, 'sin duplicados: pzScfScrollInput 1');
ok(app.includes('SCF_POP = { wrap, card, vault, pop };\n  try { pzScfKbBind(); pzScfKbSync(); } catch (e) {}'), 'scfOpenPop engancha bind + sync');
ok(app.includes('LOTE CHAT-DETALLE-TECLADO'), 'bloque marcado con el lote');
ok(css.includes('.scf-pop.pz-kb{max-height:none}'), 'CSS: .scf-pop.pz-kb sin max-height');
ok(!app.includes('onclick="pzScf') && !app.includes('data-pzScf'), 'M78: ningún llamador en tarjetas/menús (solo JS/listeners)');

// ---------- VM con DOM falso: comportamiento del sync ----------
const a = app.indexOf('/* ===== (LOTE CHAT-DETALLE-TECLADO');
const b = app.indexOf('/* ===== FIN LOTE CHAT-DETALLE-TECLADO ===== */', a);
const block = (a === -1 || b === -1) ? '' : app.slice(a, b);
function makeEnv(vv, activeEl) {
  const listeners = { vv: 0, win: 0, doc: 0 };
  const cls = new Set();
  const pop = {
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    style: {},
    _cls: cls,
    querySelector: (sel) => (sel === '.igmock' ? scroller : null),
    contains: (el) => el === activeEl || el === pop,
  };
  const scroller = {
    scrollTop: 0,
    getBoundingClientRect: () => ({ top: 100, bottom: 500 }),
  };
  const input = {
    tagName: 'INPUT',
    getBoundingClientRect: () => ({ top: 560, bottom: 600 }),
  };
  const doc = {
    querySelector: (sel) => (sel === '.scf-pop' ? pop : null),
    getElementById: () => null,
    activeElement: activeEl === 'input' ? input : null,
    createElement: () => ({ style: {}, id: '' }),
    body: { appendChild: () => {} },
    addEventListener: () => { listeners.doc++; },
  };
  // El input vive dentro del pop para contains()
  pop.contains = (el) => el === input || el === pop;
  const win = {
    innerHeight: 800,
    visualViewport: vv,
    __pzScfKbBound: false,
    addEventListener: () => { listeners.win++; },
  };
  if (vv) vv.addEventListener = () => { listeners.vv++; };
  const sandbox = { document: doc, window: win, getComputedStyle: () => ({ paddingTop: '44px' }), setTimeout: (fn) => fn(), console };
  sandbox.window.document = doc;
  vm.createContext(sandbox);
  if (block) vm.runInContext(block, sandbox);
  return { sandbox, pop, scroller, input, listeners };
}
const hasFns = block && block.includes('function pzScfKbSync');
ok(!!hasFns, 'bloque extraíble para VM');
let lastEnv = null;
if (hasFns) {
  // 1. Teclado abierto: la capa queda DENTRO del viewport visible.
  {
    const vv = { height: 400, width: 390, offsetTop: 120, offsetLeft: 0 };
    const e = makeEnv(vv, 'input');
    e.sandbox.pzScfKbSync();
    ok(e.pop._cls.has('pz-kb'), 'teclado abierto: capa con clase pz-kb');
    ok(e.pop.style.top === '168px', 'teclado abierto: top = offsetTop(120) + segura(44+4) = 168px (no bajo la barra de estado)');
    ok(e.pop.style.height === '344px', 'teclado abierto: alto = 400 - 48 - 8 = 344px');
    ok(e.pop.style.left === '195px', 'teclado abierto: left = offsetLeft + ancho/2 = 195px');
    ok(e.pop.style.transform === 'translateX(-50%)', 'teclado abierto: solo traslación horizontal');
    ok(e.pop.style.maxHeight === 'none', 'teclado abierto: max-height none');
    const bottom = parseInt(e.pop.style.top, 10) + parseInt(e.pop.style.height, 10);
    ok(bottom === 120 + 400 - 8, 'teclado abierto: abajo de la capa = abajo del viewport visible - 8px (sobre el teclado)');
    ok(e.scroller.scrollTop === 110, 'teclado abierto: campo llevado a la vista (scroll 600-500+10=110)');
  }
  // 2. Sin teclado: vuelve al centrado (estilos inline borrados).
  {
    const vv = { height: 800, width: 390, offsetTop: 0, offsetLeft: 0 };
    const e = makeEnv(vv, null);
    e.pop._cls.add('pz-kb');
    e.pop.style.top = '168px'; e.pop.style.height = '344px'; e.pop.style.transform = 'translateX(-50%)';
    e.sandbox.pzScfKbSync();
    ok(!e.pop._cls.has('pz-kb'), 'sin teclado: clase pz-kb quitada');
    ok(e.pop.style.top === '' && e.pop.style.height === '' && e.pop.style.transform === '', 'sin teclado: estilos inline borrados (vuelve al centrado CSS)');
  }
  // 3. Sin visualViewport (desktop): no hace nada ni rompe.
  {
    const e = makeEnv(undefined, 'input');
    e.sandbox.pzScfKbSync();
    ok(!e.pop._cls.has('pz-kb') && e.pop.style.top === undefined, 'sin visualViewport: no-op sin romper');
  }
  // 4. Sin capa: no-op.
  {
    const e = makeEnv({ height: 400, width: 390, offsetTop: 0, offsetLeft: 0 }, null);
    e.sandbox.document.querySelector = () => null;
    let threw = false;
    try { e.sandbox.pzScfKbSync(); } catch (err) { threw = true; }
    ok(!threw, 'sin capa: sync no rompe');
  }
  // 5. Bind una sola vez.
  {
    const vv = { height: 800, width: 390, offsetTop: 0, offsetLeft: 0 };
    const e = makeEnv(vv, null);
    lastEnv = e;
    e.sandbox.pzScfKbBind();
    const first = e.listeners.vv + e.listeners.win + e.listeners.doc;
    e.sandbox.pzScfKbBind();
    const second = e.listeners.vv + e.listeners.win + e.listeners.doc;
    ok(first > 0 && second === first, 'bind una sola vez (2da llamada no agrega listeners)');
    ok(e.sandbox.window.__pzScfKbBound === true, 'bind marca __pzScfKbBound');
  }
  // 6. M78: las 4 funciones existen.
  for (const fn of ['pzScfKbSync', 'pzScfKbBind', 'pzScfSafeTop', 'pzScfScrollInput']) {
    ok(typeof lastEnv.sandbox[fn] === 'function', 'M78: existe ' + fn);
  }
} else {
  for (const n of ['teclado-abierto', 'sin-teclado', 'sin-vv', 'sin-capa', 'bind-una-vez', 'M78-fns']) ok(false, n + ' (sin fix)');
}
console.log('lotechatdetalleteclado: ' + pass + ' ok, ' + fail + ' fallos');
process.exit(fail ? 1 : 0);
