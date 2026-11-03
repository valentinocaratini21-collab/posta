// test-lotechatiniciodeslizar.js — LOTE CHAT-INICIO-DESLIZAR (2/11, SIN PUSH).
// Decisión de Valentino 2/11 («Lo mismo en el inicio!»): tocar el chat en
// Inicio transforma la pantalla en el chat completo (lote chat-pantalla) y
// deslizar hacia abajo vuelve. Node puro: asserts estáticos sobre el árbol
// + VM con DOM falso que simula los gestos táctiles sobre #/app/chat.
// Uso: node test-lotechatiniciodeslizar.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const app = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sliceFn = (src, from, to) => {
  const a = src.indexOf(from); if (a === -1) return '';
  const b = to ? src.indexOf(to, a + from.length) : src.length;
  return src.slice(a, b === -1 ? src.length : b);
};

// ---------- Estáticos: el desliz existe y está cableado, nada más ----------
t(cnt(app, 'function pzChatSwipeBind') === 1, 'sin duplicados: pzChatSwipeBind 1');
t(cnt(app, 'function pzChatSwipeKbAbierto') === 1, 'sin duplicados: pzChatSwipeKbAbierto 1');
t(cnt(app, 'pzGoBack') === 6, 'censo: pzGoBack 6 (4 + atrás cabecera + llamada del desliz)');
t(app.includes('  pzChatSwipeBind();'), 'bindChatFull cablea el desliz');
t(app.includes('onclick="pzGoBack()"'), 'botón atrás intacto como respaldo');
t(!app.includes("location.hash = '#/app/inicio'; // desliz"), 'desliz no hardcodea Inicio (usa el atrás de siempre)');
const swipe = sliceFn(app, 'function pzChatSwipeKbAbierto()', 'function pzChatSwipeBind()')
  + sliceFn(app, 'function pzChatSwipeBind()', '\n}\n');
t(swipe.includes('scrollTop <= 4'), 'anti-conflicto: solo cierra con el historial arriba');
t(swipe.includes('.pz-chatfull-head'), 'anti-conflicto: la cabecera es tirador');
t(swipe.includes('pzGoBack()'), 'desliz: navega con el atrás de siempre');
t(swipe.includes('ae.blur()'), 'teclado: primer desliz solo lo cierra');
t(swipe.includes('dy > 90'), 'desliz: umbral 90px para volver');
t(swipe.includes('Math.abs(ddx) > Math.abs(dy)'), 'desliz: horizontal no cierra');
t(swipe.includes("passive: false"), 'desliz: touchmove no pasivo (puede frenar el rebote)');

// ---------- VM: gestos simulados ----------
function montar() {
  let backCalls = 0;
  const box = { scrollTop: 0 };
  const listeners = {};
  const addCalls = {};
  const root = {
    dataset: {},
    style: { transform: '', transition: '' },
    querySelector: (sel) => (sel === '.chat-box' ? box : null),
    contains: (el) => el === inputEl,
    addEventListener: (ev, fn, opts) => { listeners[ev] = fn; addCalls[ev] = (addCalls[ev] || 0) + 1; if (ev === 'touchmove') addCalls.touchmovePassive = opts && opts.passive; },
  };
  const inputEl = { tagName: 'INPUT', blurred: false, blur() { this.blurred = true; } };
  const fakeDoc = { getElementById: (id) => (id === 'pzChatFull' ? root : null), activeElement: null };
  const fakeWin = { innerHeight: 800, visualViewport: { height: 800, offsetTop: 0 }, matchMedia: () => ({ matches: false }) };
  const sandbox = {
    document: fakeDoc, window: fakeWin, console,
    pzGoBack: () => { backCalls++; },
    pzReducedMotion: () => false,
  };
  vm.createContext(sandbox);
  const start = app.indexOf('function pzChatSwipeKbAbierto()');
  const cancelIdx = start === -1 ? -1 : app.indexOf("root.addEventListener('touchcancel'", start);
  const end = cancelIdx === -1 ? start : app.indexOf('\n}', cancelIdx) + 2;
  const src = start === -1 ? '' : app.slice(start, end);
  t(src.includes('touchend') && src.includes('pzGoBack()'), 'vm: slice del desliz completo');
  // En un árbol sin el lote (control negativo en prístino) no se ejecuta
  // nada: los asserts de gestos fallan limpio en vez de romper el test.
  if (src.includes('function pzChatSwipeBind')) vm.runInContext(src + '\nthis.__bind = pzChatSwipeBind;', sandbox);
  if (typeof sandbox.__bind !== 'function') sandbox.__bind = () => {};
  const headT = { closest: (sel) => (sel === '.pz-chatfull-head' ? {} : null) };
  const bodyT = { closest: () => null };
  const ev = (y, x, target, pd) => ({ touches: [{ clientX: x, clientY: y }], target, preventDefault: pd });
  const fire = (kind, y, x, target) => {
    const flag = { called: false };
    const e = ev(y, x, target, () => { flag.called = true; });
    if (typeof listeners[kind] === 'function') listeners[kind](e);
    return flag;
  };
  return { root, box, inputEl, fakeDoc, fakeWin, sandbox, headT, bodyT, fire, listeners, addCalls, back: () => backCalls };
}

{
  // 1. Desliz abajo con el historial arriba → vuelve, siguiendo al dedo.
  const m = montar();
  m.sandbox.__bind();
  m.fire('touchstart', 100, 50, m.bodyT);
  const pd = m.fire('touchmove', 150, 50, m.bodyT);
  t(pd.called, 'gesto: touchmove frena el rebote al tirar abajo');
  t(m.root.style.transform === 'translateY(50px)', 'gesto: el panel sigue al dedo (50px)');
  m.fire('touchmove', 230, 50, m.bodyT);
  t(m.root.style.transform === 'translateY(130px)', 'gesto: el panel sigue al dedo (130px)');
  m.fire('touchend', 230, 50, m.bodyT);
  t(m.back() === 1, 'gesto: desliz abajo arriba del todo → vuelve (1 vez)');
  t(m.root.style.transform === '', 'gesto: al soltar se limpia el transform');
}
{
  // 2. Historial a la mitad: bajar NO cierra (el scroll sigue su curso).
  const m = montar();
  m.box.scrollTop = 200;
  m.sandbox.__bind();
  m.fire('touchstart', 100, 50, m.bodyT);
  m.fire('touchmove', 230, 50, m.bodyT);
  t(m.root.style.transform === '', 'gesto: a mitad del historial no se mueve el panel');
  m.fire('touchend', 230, 50, m.bodyT);
  t(m.back() === 0, 'gesto: a mitad del historial no vuelve');
}
{
  // 3. Desde la cabecera (tirador) sí cierra aunque el historial no esté arriba.
  const m = montar();
  m.box.scrollTop = 200;
  m.sandbox.__bind();
  m.fire('touchstart', 20, 50, m.headT);
  m.fire('touchmove', 150, 50, m.headT);
  m.fire('touchend', 150, 50, m.headT);
  t(m.back() === 1, 'gesto: desde la cabecera cierra aunque el historial no esté arriba');
}
{
  // 4. Horizontal, hacia arriba y corto: ninguno vuelve.
  const m = montar();
  m.sandbox.__bind();
  m.fire('touchstart', 100, 50, m.bodyT);
  m.fire('touchmove', 120, 200, m.bodyT);
  m.fire('touchend', 120, 200, m.bodyT);
  t(m.back() === 0, 'gesto: horizontal no vuelve');
  m.fire('touchstart', 200, 50, m.bodyT);
  m.fire('touchmove', 100, 50, m.bodyT);
  m.fire('touchend', 100, 50, m.bodyT);
  t(m.back() === 0, 'gesto: hacia arriba no vuelve');
  m.fire('touchstart', 100, 50, m.bodyT);
  m.fire('touchmove', 150, 50, m.bodyT);
  m.fire('touchend', 150, 50, m.bodyT);
  t(m.back() === 0, 'gesto: desliz corto (50px) no vuelve (umbral 90)');
}
{
  // 5. Teclado abierto: primer desliz solo lo cierra; el segundo vuelve.
  const m = montar();
  m.fakeDoc.activeElement = m.inputEl;
  m.sandbox.__bind();
  m.fire('touchstart', 100, 50, m.bodyT);
  m.fire('touchmove', 230, 50, m.bodyT);
  t(m.root.style.transform === '', 'gesto: con teclado abierto el panel no sigue al dedo');
  m.fire('touchend', 230, 50, m.bodyT);
  t(m.back() === 0, 'gesto: con teclado abierto el primer desliz no vuelve');
  t(m.inputEl.blurred, 'gesto: con teclado abierto el primer desliz cierra el teclado');
  m.fakeDoc.activeElement = null;
  m.fire('touchstart', 100, 50, m.bodyT);
  m.fire('touchmove', 230, 50, m.bodyT);
  m.fire('touchend', 230, 50, m.bodyT);
  t(m.back() === 1, 'gesto: sin teclado el siguiente desliz vuelve');
}
{
  // 6. Bind una sola vez por vista; touchcancel no navega.
  const m = montar();
  m.sandbox.__bind();
  m.sandbox.__bind();
  t(m.addCalls.touchstart === 1 && m.addCalls.touchmove === 1 && m.addCalls.touchend === 1, 'bind: una sola vez por vista');
  t(m.addCalls.touchmovePassive === false, 'bind: touchmove no pasivo');
  m.fire('touchstart', 100, 50, m.bodyT);
  m.fire('touchmove', 230, 50, m.bodyT);
  if (typeof m.listeners.touchcancel === 'function') m.listeners.touchcancel({});
  t(m.back() === 0, 'gesto: touchcancel no navega');
  t(m.root.style.transform === '', 'gesto: touchcancel limpia el transform');
}

console.log(`lotechatiniciodeslizar: ${ok} ok, ${bad} mal`);
process.exit(bad ? 1 : 0);
