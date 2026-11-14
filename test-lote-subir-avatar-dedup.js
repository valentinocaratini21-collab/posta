// test-lote-subir-avatar-dedup.js — LOTE SUBIR-AVATAR-DEDUP (14/11).
// Origen: captura de Valentino del tab Subir (14/11 09:15) con dos
// correcciones textuales:
//  (1) AVATAR: el ícono del encabezado de las tarjetas «¿TENÉS UNA
//      FECHA ESPECIAL?» y «¿LO ARMAMOS DE CERO?» se ve ROTO — un
//      círculo chico con el logo con wordmark (/posty-logo.png,
//      226×62) recortado por object-fit:cover, del que se lee «po».
//      La cara correcta es el avatar de Posty (ai-avatar.png), el que
//      ya usan los demás círculos de la vista.
//  (2) DEDUP: las dos últimas tarjetas son dos puertas de idea
//      apiladas — «¿LO ARMAMOS DE CERO?» (idea por voz o escrita +
//      confirmación) y «¿Tenés una idea?» (nota de voz opcional).
//      Agravante encontrado en el censo: la tarjeta de voz nace con
//      atributo hidden pero su regla CSS es display:flex SIN la regla
//      compañera [hidden] (la de .todo sí existe desde SUBIR-SIMPLE),
//      así que en el navegador NUNCA se oculta: se ve siempre, como
//      en la captura. Regla nueva: una sola puerta de idea visible a
//      la vez — sin flujo evento/cero activo manda la tarjeta de voz
//      (texto intacto); respondida la pregunta del evento (sí o no),
//      el flujo es la puerta y la de voz se oculta. Los backends no
//      se tocan; la confirmación de lo entendido del cero queda entera.
// Alcance del avatar: kick de evento, kick de cero y r-head del recibo
// del flujo evento/cero (pzEvReciboPintar, el mismo círculo de 38px
// con el mismo defecto; su gemelo pzSubirReciboPintar ya usaba el
// avatar). pzVozMsgHTML (cara de los mensajes de la tira de voz) NO
// se toca: sus tiras con hilo no se renderizan dentro de Subir (las
// de Subir no tienen hilo y pzVozEnhance saltea 'cero' y 'extra');
// queda pineado como follow-up hermano de una línea, fuera de la
// vista (regla dura del lote: nada fuera de Subir y sus estilos).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const BASE_DIR = process.env.LOTE_BASE_DIR || path.join(__dirname, '..', 'base');
let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + String(extra).slice(0, 260) : ''); }
}
const has = (s, sub) => String(s || '').includes(sub);
const count = (s, sub) => String(s || '').split(sub).length - 1;
function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  const markers = ['\nfunction ', '\nasync function ', '\nconst ', '\nlet '];
  let end = src.length;
  for (const m of markers) {
    const j = src.indexOf(m, i + 10);
    if (j > 0 && j < end) end = j;
  }
  return src.slice(i, end);
}
function ruleOf(css, sel) {
  const i = css.indexOf(sel + '{');
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i) + 1);
}
// El bloque contiguo de la vista Subir: estado + vista + flujos.
function subirSlice(src) {
  const a = src.indexOf('const PZ_SUBIR = {');
  const b = src.indexOf('function chatFullView(');
  if (a < 0 || b < 0 || b < a) return '';
  return src.slice(a, b);
}

// ---------- DOM falso mínimo ----------
class El {
  constructor(id) {
    this.id = id || ''; this.hidden = false; this.innerHTML = ''; this.textContent = '';
    this.disabled = false; this.value = ''; this.files = null; this.dataset = {}; this.style = {};
    this.onclick = null; this.onchange = null; this.children = []; this._attrs = {};
    const cls = new Set();
    this.classList = { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c) };
  }
  appendChild(c) { this.children.push(c); return c; }
  querySelector() { return new El('q'); }
  querySelectorAll() { return []; }
  scrollIntoView() {}
  focus() {}
  setSelectionRange() {}
  remove() {}
  addEventListener() {}
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
}
function buildCtx(appSrc) {
  const registry = new Map();
  const get = (id) => { if (!registry.has(id)) registry.set(id, new El(id)); return registry.get(id); };
  const btnSi = new El('evSi'); btnSi._attrs = { 'data-ev-es': 'si' }; btnSi.textContent = 'Sí, es un evento';
  const btnNo = new El('evNo'); btnNo._attrs = { 'data-ev-es': 'no' }; btnNo.textContent = '✓ No';
  const documentStub = {
    getElementById: get,
    createElement: () => new El(''),
    querySelectorAll: (sel) => (sel === '[data-ev-es]' ? [btnSi, btnNo] : []),
    querySelector: () => null,
    addEventListener: () => {},
  };
  const apiCalls = [];
  const ctx = {
    console, setTimeout, Intl, document: documentStub,
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hash: '' },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, id: 'a1', kind: 'foto', thumb: '/m/t.jpg', path: '/m/t.jpg' }) }),
    api: {
      post: async (url, body) => {
        apiCalls.push(url);
        if (url === '/api/subir/cero/entender') return { ok: true, entendido: { nombre: '', quien: 'DJ Martín', fechaISO: '2026-11-20', que: 'DJ set' } };
        if (url === '/api/subir/resolver') return { ok: true, modo: 'guardado', kind: 'foto' };
        return { ok: true };
      },
      get: async () => ({ ok: true }),
    },
    __get: get, __btnSi: btnSi, __btnNo: btnNo, __apiCalls: apiCalls,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const prelude = 'function pzVozEn() { return false; }\n'
    + 'function pzIc() { return ""; }\n'
    + 'const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");\n';
  vm.runInContext(prelude + subirSlice(appSrc), ctx);
  return ctx;
}
// Estado inicial del DOM según el template renderizado (como hace el
// navegador al parsear): hidden nace de los atributos del HTML real.
function initSegunTemplate(ctx, inner) {
  const ceroTag = (inner.match(/<div class="preg-card pz-cero"[^>]*>/) || [''])[0];
  const vozTag = (inner.match(/<section class="pz-voz voz-op"[^>]*>/) || [''])[0];
  ctx.__get('pzCeroCard').hidden = ceroTag.includes(' hidden');
  ctx.__get('pzSubirVozOp').hidden = vozTag.includes(' hidden');
  for (const id of ['pzEvPanel', 'pzSubirTodo', 'pzSubirPreg', 'pzSubirListo', 'pzSubirQVideo']) ctx.__get(id).hidden = true;
  return { ceroTag, vozTag };
}

(async () => {
  const app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');
  const slice = subirSlice(app);
  const subirSrc = extractFn(app, 'subirView') || '';

  // ---------- A: avatar ----------
  console.log('A · avatar de Posty en los encabezados de Subir');
  t('A1 kick de la tarjeta de evento con el avatar (no el logo con wordmark)',
    has(slice, '<div class="kick"><img src="/ai-avatar.png" alt=""> ${en ? \'DO YOU HAVE A SPECIAL DATE?\' : \'¿TENÉS UNA FECHA ESPECIAL?\'}</div>'));
  t('A2 kick de la tarjeta de cero con el avatar',
    has(slice, '<div class="kick"><img src="/ai-avatar.png" alt=""> ${en ? \'BUILD IT FROM SCRATCH?\' : \'¿LO ARMAMOS DE CERO?\'}</div>'));
  const reciboEv = extractFn(app, 'pzEvReciboPintar') || '';
  t('A3 r-head del recibo del flujo evento/cero con el avatar (gemelo del recibo de material, que ya lo usaba)',
    has(reciboEv, '<div class="r-head"><img src="/ai-avatar.png" alt="">') && !has(reciboEv, 'posty-logo'));
  t('A4 cero rastros del logo con wordmark en TODO el bloque de la vista Subir',
    count(slice, '/posty-logo.png') === 0, 'count=' + count(slice, '/posty-logo.png'));
  t('A5 fuera de Subir no se tocó nada: quedan 6 usos del logo (5 de landing/auth + pzVozMsg pineado como follow-up)',
    count(app, 'src="/posty-logo.png"') === 6
    && has(extractFn(app, 'pzVozMsgHTML') || '', 'src="/posty-logo.png"'),
    'count=' + count(app, 'src="/posty-logo.png"'));
  t('A6 regla compañera: .pz-subir .voz-op[hidden]{display:none} (sin ella el display:flex le gana al atributo)',
    has(ruleOf(css, '.pz-subir .voz-op[hidden]'), 'display:none')
    && has(ruleOf(css, '.pz-subir .voz-op'), 'display:flex'));

  // ---------- D: textos byte a byte ----------
  console.log('D · textos protegidos intactos');
  const protegidos = [
    '¿Tenés una idea?', 'Contale a Posty con una nota de voz y la armamos juntos.',
    'Got an idea?', 'Tell Posty with a voice note and we', 'build it together.',
    '¿TENÉS UNA FECHA ESPECIAL?', '¿Es un evento con fecha?', 'Sí, es un evento', 'Armar el posteo del evento',
    '¿LO ARMAMOS DE CERO?',
    'Contame una idea en una frase — por voz o escrita — y Posty te devuelve lo que entendió para que lo confirmes. Nada se arma con datos sin confirmar.',
    'Contale a Posty', 'Ej.: el viernes toca DJ Martín en el bar',
    'Esto es lo que entendí — confirmalo con un toque cada uno:',
    '/api/subir/cero/entender', '/api/subir/cero/crear', '/api/subir/evento/crear',
  ];
  t('D1 todos los textos de las dos tarjetas, la confirmación y los endpoints están byte a byte',
    protegidos.every((s) => has(app, s)),
    protegidos.filter((s) => !has(app, s)).join(' | '));

  // ---------- B: render inicial ----------
  console.log('B · render inicial: una sola puerta de idea');
  const ctxB = buildCtx(app);
  const innerB = await ctxB.subirView();
  const tagsB = initSegunTemplate(ctxB, innerB);
  t('B1 la tarjeta de cero nace oculta (es la continuación del flujo, no la puerta inicial)',
    tagsB.ceroTag.includes(' hidden') && ctxB.__get('pzCeroCard').hidden === true, tagsB.ceroTag);
  t('B2 la tarjeta de voz «¿Tenés una idea?» nace visible (la puerta por defecto)',
    !tagsB.vozTag.includes(' hidden') && ctxB.__get('pzSubirVozOp').hidden === false, tagsB.vozTag);
  t('B3 el resto del estado inicial no cambió: panel de evento, encargate, preguntas y Listo nacen ocultos en el template',
    has(innerB, 'id="pzEvPanel" hidden') && has(innerB, 'id="pzSubirTodo" hidden')
    && has(innerB, 'id="pzSubirPreg" hidden') && has(innerB, 'id="pzSubirListo" hidden'));
  t('B4 el flag del flujo existe y nace en falso',
    vm.runInContext('PZ_EVENTO.respondida', ctxB) === false
    && count(app, 'PZ_EVENTO.respondida') === 4, 'count=' + count(app, 'PZ_EVENTO.respondida'));

  // ---------- C: comportamiento por estado ----------
  console.log('C · la regla de visibilidad por estado');
  // C1: sin flujo, con material y tras resolver.
  const ctx1 = buildCtx(app);
  initSegunTemplate(ctx1, await ctx1.subirView());
  await ctx1.pzSubirUpload({ type: 'image/jpeg' });
  t('C1 sin flujo + material: la puerta sigue siendo la de voz; la de cero sigue oculta; material completo visible',
    ctx1.__get('pzSubirVozOp').hidden === false && ctx1.__get('pzCeroCard').hidden === true
    && ctx1.__get('pzSubirTodo').hidden === false && ctx1.__get('pzSubirPreg').hidden === false
    && ctx1.__get('pzSubirListo').hidden === false);
  await ctx1.pzSubirResolver(false);
  t('C2 sin flujo + resolver: la bandeja se vacía y la puerta vuelve a ser la de voz',
    ctx1.__get('pzSubirVozOp').hidden === false && ctx1.__get('pzCeroCard').hidden === true
    && ctx1.__get('pzSubirTodo').hidden === true && ctx1.__get('pzSubirListo').hidden === true);
  // C2': flujo activo por «No» + material + resolver + confirmación.
  const ctx2 = buildCtx(app);
  initSegunTemplate(ctx2, await ctx2.subirView());
  ctx2.bindEventoCero();
  ctx2.__btnNo.onclick();
  t('C3 al responder «No» el flujo queda activo: entra la tarjeta de cero y sale la de voz; el panel de evento sigue cerrado',
    vm.runInContext('PZ_EVENTO.respondida', ctx2) === true
    && ctx2.__get('pzCeroCard').hidden === false && ctx2.__get('pzSubirVozOp').hidden === true
    && ctx2.__get('pzEvPanel').hidden === true);
  await ctx2.pzSubirUpload({ type: 'image/jpeg' });
  t('C4 flujo activo + material: la de voz NO vuelve; la puerta es la de cero',
    ctx2.__get('pzSubirVozOp').hidden === true && ctx2.__get('pzCeroCard').hidden === false
    && ctx2.__get('pzSubirTodo').hidden === false);
  await ctx2.pzSubirResolver(false);
  t('C5 flujo activo + resolver: la puerta sigue siendo la de cero',
    ctx2.__get('pzSubirVozOp').hidden === true && ctx2.__get('pzCeroCard').hidden === false);
  ctx2.__get('pzCeroIdea').value = 'el viernes toca DJ Martín en el bar';
  await ctx2.pzCeroEntender();
  const confHtml = ctx2.__get('pzCeroConf').innerHTML;
  t('C6 el paso de confirmación del cero está entero: lo entendido se pinta con sus datos y el botón de armar',
    ctx2.__apiCalls.includes('/api/subir/cero/entender')
    && has(confHtml, 'Esto es lo que entendí — confirmalo con un toque cada uno:')
    && has(confHtml, 'DJ Martín') && has(confHtml, 'id="pzCeroCrear"'),
    confHtml.slice(0, 200));
  // C3': flujo activo por «Sí».
  const ctx3 = buildCtx(app);
  initSegunTemplate(ctx3, await ctx3.subirView());
  ctx3.bindEventoCero();
  ctx3.__btnSi.onclick();
  t('C7 al responder «Sí» el panel de evento se abre Y la única puerta de idea es la del flujo (cero visible, voz oculta)',
    vm.runInContext('PZ_EVENTO.es', ctx3) === true
    && ctx3.__get('pzEvPanel').hidden === false
    && ctx3.__get('pzCeroCard').hidden === false && ctx3.__get('pzSubirVozOp').hidden === true);

  // ---------- K: control contra la base (el defecto entero) ----------
  console.log('K · control contra la base viva');
  const baseAppPath = path.join(BASE_DIR, 'public', 'app.js');
  if (fs.existsSync(baseAppPath)) {
    const bApp = fs.readFileSync(baseAppPath, 'utf8');
    const bCss = fs.readFileSync(path.join(BASE_DIR, 'public', 'styles.css'), 'utf8');
    const bSlice = subirSlice(bApp);
    t('K1 en la base los dos kick y el r-head del recibo usan el logo con wordmark (9 usos en el bundle)',
      count(bApp, 'src="/posty-logo.png"') === 9 && count(bSlice, '/posty-logo.png') === 3,
      'bundle=' + count(bApp, 'src="/posty-logo.png"') + ' slice=' + count(bSlice, '/posty-logo.png'));
    t('K2 en la base la tarjeta de voz nace con hidden pero SIN regla compañera: el display:flex lo anula y se ve siempre (la captura)',
      has(bSlice, 'id="pzSubirVozOp" hidden') && !has(bCss, '.pz-subir .voz-op[hidden]')
      && has(ruleOf(bCss, '.pz-subir .voz-op'), 'display:flex'));
    t('K3 en la base la tarjeta de cero nace visible y no existe el flag del flujo: las dos puertas conviven',
      !has(bSlice, 'id="pzCeroCard" hidden') && !has(bApp, 'PZ_EVENTO.respondida'));
  } else {
    console.log('  (control omitido: no está el árbol base hermano)');
  }

  console.log(`\n== LOTE SUBIR-AVATAR-DEDUP: ${pass} ok · ${fail} mal ==`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e && e.stack || e); process.exit(2); });
