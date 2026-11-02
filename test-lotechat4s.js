// test-lotechat4s.js — LOTE CHAT4S · placeholder 4 s + fundido + oscuro.
// Valentino 1/11 con captura: la letra del chat tiene que ser más
// oscura (el placeholder se ve pálido sobre el vidrio) y las frases
// del placeholder tienen que pasar de a poquito (fundido) cada 4 s
// (hoy ~8 s tras chat-texto). Node puro, lee el árbol.
// Uso: node test-lotechat4s.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8');
const idx = fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8');
const idxEn = fs.readFileSync(path.join(__dirname, 'public/en/index.html'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const cnt = (s, sub) => (s.match(new RegExp(sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Contraste WCAG (el mismo cálculo que en el informe del lote).
const lum = (h) => {
  const ch = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(ch[0]) + 0.7152 * f(ch[1]) + 0.0722 * f(ch[2]);
};
const cr = (a, b) => {
  const hi = Math.max(lum(a), lum(b)), lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
};

// ---------- 1. Intervalo 4 s ----------
t(app.includes('setInterval(pzPhTick, 4000)'), 'intervalo 4 s en pzPhEnsure');
t(!app.includes('setInterval(pzPhTick, 8000)'), 'sin residuo 8 s en el rotador');

// ---------- 2. Fundido: CSS ----------
t(css.includes('@keyframes pzPhFade'), 'keyframes pzPhFade existen');
t(css.includes('animation:pzPhFade .36s ease'), 'animación .36 s en la clase de fundido');
t(css.includes('#chatInput.pz-ph-fading,.hf-ask-input.pz-ph-fading'), 'clase pz-ph-fading en ambos campos');
t(css.includes("@media (prefers-reduced-motion: reduce)") && css.includes('animation:none'), 'reduced-motion: sin animación');

// ---------- 3. Fundido: JS ----------
const adv = sliceFn(app, 'function pzPhAdvanceOne', 'function pzPhKnown');
t(adv.includes('pz-ph-fading'), 'advance usa la clase de fundido');
t(adv.includes('}, 180);') && adv.includes('}, 380);'), 'fundido: cambio a los 180 ms, limpieza a los 380 ms');
t(adv.includes('classList'), 'advance con guarda de classList');
t(adv.includes("pzPhReduced() || typeof setTimeout !== 'function'"), 'reduced-motion o sin timers: cambio instantáneo');

// ---------- 4. Guardas chat-texto intactas ----------
t(adv.includes('el.value'), 'guarda: con texto no rota');
const rot = sliceFn(app, 'const PZ_CHAT_PH', 'async function bindChatView');
t(!rot.includes('activeElement'), 'el foco NO bloquea (regla chat-texto intacta)');
t(rot.includes("pzPhEls('#chatInput')") && rot.includes("pzPhEls('.hf-ask-input')"), 'ambos campos rotan (principal + aprobación)');
t(adv.includes('dataset.phI'), 'cada campo con su propio índice');

// ---------- 5. Oscuro: placeholder y dock ----------
t(css.includes('#chatInput::placeholder,.hf-ask-input::placeholder{color:#47617A}'), 'placeholder del chat #47617A');
t(css.includes('.in::placeholder{color:#A9BDD1}'), 'placeholder genérico .in sin tocar (solo el chat cambia)');
const mzRule = (css.split('.mz-ph{')[1] || '').split('}')[0];
t(mzRule.includes('color:#47617A'), 'texto del dock .mz-ph #47617A (antes #93AEC0)');
t(!mzRule.includes('#93AEC0'), 'sin residuo pálido en el dock');
t(mzRule.includes('text-shadow'), 'halo blanco suave para el vidrio sobre fotos oscuras');
t(cr('#47617A', '#FBFDFF') >= 4.5, 'contraste placeholder nuevo >= 4.5 (fue 1.89)');
t(cr('#47617A', '#FFFFFF') >= 4.5, 'contraste dock nuevo >= 4.5 (fue 2.32)');
t(cr('#47617A', '#FBFDFF') > cr('#A9BDD1', '#FBFDFF'), 'placeholder nuevo más oscuro que el viejo');
t(cr('#47617A', '#FFFFFF') > cr('#93AEC0', '#FFFFFF'), 'dock nuevo más oscuro que el viejo');

// ---------- 6. Texto escrito sin tocar ----------
t(css.includes('.in{width:100%;background:#FBFDFF') && css.includes('color:var(--txt)'), 'texto escrito .in sigue oscuro (var(--txt))');
t(css.includes('.hf-ask-input{flex:1;min-width:0') && sliceFn(css, '.hf-ask-input{', '}').includes('color:var(--txt)'), 'texto escrito .hf-ask-input sigue oscuro');

// ---------- 7. EN espejado ----------
t(app.includes("en: ['write to posty…', 'ask about your week…', 'ask for an idea for today…', 'tell him what you sell…']"), 'lista EN espejo intacta');
t(rot.includes('pzChatPhList()'), 'la lista se resuelve por idioma en cada tick');

// ---------- 8. Angosto: sin anchos nuevos ----------
t(mzRule.includes('flex:1'), 'dock sigue flexible (sin anchos fijos nuevos)');
const chat4sCss = css.slice(css.indexOf('/* (LOTE CHAT4S) Fundido'));
t(!chat4sCss.includes('width:'), 'el bloque del fundido no agrega anchos');

// ---------- 9. Versiones + censo (base v530) ----------
t(srv.includes("const BUILD_ID = '20261101-v533'"), 'BUILD v530');
t(idx.includes('app.js?v=355') && idx.includes('styles.css?v=20261074'), 'index: ?v= de v530');
t(idxEn.includes('styles.css?v=20261074') && !idxEn.includes('app.js?v='), 'en/index: styles v530, sin app.js');
t(app.includes("const CHUNK_V = '20261101-v523'"), 'CHUNK_V intacto');
t(cnt(srv, 'catsMatch') === 3, 'censo server: catsMatch 3');
t(cnt(srv, 'week-redo') === 16, 'censo server: week-redo 16');
t(cnt(srv, 'first_week') === 3, 'censo server: first_week 3');
t(cnt(srv, '/' + 'aprobar') === 16, 'censo server: marcador 16');
t(cnt(app, 'pzGoBack') === 4, 'censo app: pzGoBack 4');
t(cnt(app, 'pz-detalle-setup') === 1, 'censo app: pz-detalle-setup 1');
t(cnt(app, '/' + 'aprobar') === 1, 'censo app: marcador 1');
t(cnt(app, 'autofetch') === 0, 'censo app: autofetch 0');

// ---------- 10. Funcional: fundido, guardas, reduced-motion, por campo, EN ----------
function mockInput(placeholder) {
  const classes = new Set();
  return {
    value: '', placeholder, dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    _classes: classes,
  };
}
function rotSandbox(inputs, reduced) {
  let timers = [];
  const sb = {
    console,
    ME: { lang: 'es' },
    esc: (s) => String(s == null ? '' : s),
    document: {
      getElementById: () => null,
      activeElement: null,
      body: {},
      querySelectorAll: (sel) => (sel === '#chatInput' ? inputs.chat : sel === '.hf-ask-input' ? inputs.ask : []),
    },
    window: { matchMedia: () => ({ matches: !!reduced }) },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearInterval: (id) => { timers = timers.filter((_, i) => i + 1 !== id); },
    setTimeout,
    Intl, Date, Map, Set,
  };
  sb.gzT = (es, en) => (sb.ME && sb.ME.lang === 'en') ? en : es;
  vm.createContext(sb);
  let code = app.slice(app.indexOf('const PZ_CHAT_PH'), app.indexOf('async function bindChatView'));
  code = code.replace('const PZ_CHAT_PH', 'globalThis.PZ_CHAT_PH')
    .replace('function pzChatPhList', 'globalThis.pzChatPhList = function')
    .replace('function pzChatPhNext', 'globalThis.pzChatPhNext = function')
    .replace('function pzChatPhStart', 'globalThis.pzChatPhStart = function')
    .replace('function pzAskPhStart', 'globalThis.pzAskPhStart = function');
  vm.runInContext(code, sb);
  return { sb, timers };
}

(async () => {
  // Fundido: al arrancar no cambia de golpe; a los ~300 ms ya cambió
  // y la clase sigue; a los ~500 ms la clase se fue.
  {
    const inp = mockInput('escribile a posty…');
    const { sb, timers } = rotSandbox({ chat: [inp], ask: [] }, false);
    sb.pzChatPhStart();
    t(timers.length === 1 && timers[0].ms === 4000, 'funcional: intervalo 4000 al arrancar');
    t(inp.placeholder === 'escribile a posty…' && inp._classes.has('pz-ph-fading'), 'fundido: al arrancar se apaga sin cambiar todavía');
    await sleep(300);
    t(inp.placeholder === 'preguntale por tu semana…' && inp._classes.has('pz-ph-fading'), 'fundido: a los 300 ms ya cambió, clase todavía puesta');
    await sleep(250);
    t(!inp._classes.has('pz-ph-fading') && inp.placeholder === 'preguntale por tu semana…', 'fundido: a los 550 ms la clase se fue y la frase quedó');
    // Tick: mismo fundido.
    timers[0].fn();
    t(inp.placeholder === 'preguntale por tu semana…' && inp._classes.has('pz-ph-fading'), 'fundido: el tick apaga antes de cambiar');
    await sleep(300);
    t(inp.placeholder === 'pedile una idea para hoy…', 'fundido: el tick cambia a la tercera frase');
    // Con texto no rota ni con fundido.
    inp.value = 'hola';
    timers[0].fn();
    await sleep(450);
    t(inp.placeholder === 'pedile una idea para hoy…' && !inp._classes.has('pz-ph-fading'), 'con texto no rota');
    inp.value = '';
    // Reabrir no duplica el intervalo.
    sb.pzChatPhStart();
    t(timers.length === 1, 'reabrir no duplica el intervalo');
  }
  // Escribir durante el fundido: no pisa lo escrito.
  {
    const inp = mockInput('escribile a posty…');
    const { sb, timers } = rotSandbox({ chat: [inp], ask: [] }, false);
    sb.pzChatPhStart();
    await sleep(50);
    inp.value = 'yo escribo';
    await sleep(450);
    t(inp.placeholder === 'escribile a posty…' && !inp._classes.has('pz-ph-fading'), 'escribir durante el fundido: no pisa y quita la clase');
  }
  // Reduced-motion: instantáneo, sin clase.
  {
    const inp = mockInput('escribile a posty…');
    const { sb } = rotSandbox({ chat: [inp], ask: [] }, true);
    sb.pzChatPhStart();
    t(inp.placeholder === 'preguntale por tu semana…' && !inp._classes.has('pz-ph-fading'), 'reduced-motion: cambio instantáneo sin fundido');
  }
  // Cada campo con su propio índice.
  {
    const a = mockInput('escribile a posty…');
    const b = mockInput('escribile a posty…');
    b.dataset.phI = '2';
    const { sb, timers } = rotSandbox({ chat: [a], ask: [b] }, false);
    sb.pzChatPhStart();
    await sleep(300);
    t(a.placeholder === 'preguntale por tu semana…' && b.placeholder === 'contale qué vendés…', 'cada campo avanza desde su propio índice');
    timers[0].fn();
    await sleep(300);
    t(a.placeholder === 'pedile una idea para hoy…' && b.placeholder === 'escribile a posty…', 'tick: cada campo sigue su propia rueda');
  }
  // EN: misma rueda, 4 s, fundido.
  {
    const inp = mockInput('write to posty…');
    const { sb } = rotSandbox({ chat: [inp], ask: [] }, false);
    sb.ME.lang = 'en';
    sb.pzChatPhStart();
    await sleep(300);
    t(inp.placeholder === 'ask about your week…', 'EN: rota con la lista en inglés');
  }

  console.log(`LOTECHAT4S: ${ok} ok, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
})();
