// test-lote-inicio-sin-saludo.js — LOTE INICIO-SIN-SALUDO (11/11 · orden
// Valentino «No me gusta esto. Eliminalo. Quiero que si hay posteo nuevo,
// entrar directo al inicio», con captura 00:34):
// 1) Con posteo nuevo, entrar a la app cae directo en Inicio con el
// posteo visible, SIN saludo: la puerta matutina (Inicio → #/app/ritual)
// murió, y la hoja del ritual ya no lleva la ceremonia («buen día / te
// traje tu paquete de hoy / Hoy empieza tu racha / Hoy sale este» + el
// aviso de las 9:00).
// 2) La tarjeta del posteo queda intacta (imagen/video, chips,
// caption, [Sale así] / [Cambiar algo]) y la hora de salida vive como
// DATO de la tarjeta («Sale hoy a las 19:00»), no como ceremonia.
// 3) Sin posteo nuevo, Inicio no queda vacío ni roto: la rama de la
// tarde (próximo paquete con cuenta) y el vacío honesto siguen como hoy.
// 4) pzRitualPuertaManana queda como función pura (la usan los tests
// vecinos); ya nada la llama desde Inicio.
// Uso: node test-lote-inicio-sin-saludo.js (desde el scratch; corre
// contra work/ si existe, si no contra el árbol de este directorio).
// Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = fs.existsSync(path.join(__dirname, 'work', 'server.js'))
  ? path.join(__dirname, 'work') : __dirname;
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');

// ---------- sandbox vm (mínimo del patrón ritual-sin-velo) ----------
function elStub() {
  return {
    tagName: 'DIV', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild() {}, removeChild() {}, remove() {},
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    closest: () => null,
    getBoundingClientRect: () => ({ width: 390, height: 100, top: 0, left: 0 }),
    focus() {}, click() {}, blur() {},
    innerHTML: '', textContent: '', value: '', hidden: false,
    src: '', href: '', disabled: false, checked: false,
    children: [], parentNode: null, isConnected: false,
  };
}
function storeStub() {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  s._keys = () => [...m.keys()];
  return s;
}
const locObj = { hash: '#/app/inicio', href: 'https://postycommunitymanager.com/#/app/inicio', pathname: '/', search: '', host: 'postycommunitymanager.com' };
const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
  location: locObj,
  navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', language: 'es-AR', onLine: true },
  localStorage: storeStub(), sessionStorage: storeStub(),
  performance: { now: () => Date.now() },
  AbortSignal, URL, URLSearchParams,
  CustomEvent: function CustomEvent() {}, Event: function Event() {},
  Date,
};
sandbox.window = {
  addEventListener() {}, removeEventListener() {},
  innerHeight: 844, innerWidth: 390, location: locObj,
  scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  navigator: sandbox.navigator, document: null,
};
sandbox.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => elStub(), body: elStub(), documentElement: elStub(),
  title: 'Posty', hidden: false, visibilityState: 'visible',
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
vm.createContext(sandbox);

// ---------- fixtures (posteo 593: video de uñas, sale 19:00) ----------
function cartaVideo(id) {
  return { id, imagen: '/media/v593.mp4', caption: 'Así se mueve el color cuando posty lo postea', caption_corta: 'Así se mueve el color', tipo: 'video', media_type: 'video', recomendada: true, rubro: 'general', hora_salida: '19:00' };
}
function cartaImg(id) {
  return { id, imagen: '/media/a.jpg', caption: 'Café de la casa, hecho con amor', caption_corta: 'Café de la casa', tipo: 'imagen', media_type: 'image', recomendada: true, rubro: 'café', hora_salida: '19:00' };
}
function dRit(over) {
  const base = {
    hoy: '2026-11-11', racha: 0, dorada: false, elegida: 0,
    recomendada: cartaVideo(593), cartas: [cartaVideo(593)],
    album: { slots: [] },
    abre_a: new Date(Date.now() - 3600 * 1000).toISOString(),
    ahora: new Date().toISOString(), abre_hora: '9:00',
  };
  return Object.assign(base, over || {});
}
function dProximo() {
  return {
    hoy: null, racha: 0, dorada: false, elegida: 0,
    recomendada: null, cartas: [],
    album: { slots: [] },
    ahora: new Date().toISOString(),
    proximo: { abre_a: new Date(Date.now() + 5 * 3600 * 1000).toISOString(), abre_hora: '00:00' },
  };
}

const SALUDO_ES = ['buen día', 'te traje tu paquete de hoy', 'Hoy empieza tu racha', 'Hoy sale este', 'te avisamos a las 9:00 para confirmar'];
const SALUDO_EN = ['good morning', 'I brought your pack for today', 'Your streak starts today', 'This one goes out today', 'we’ll let you know at 9:00 AM to confirm'];
const sinSaludo = (html, en) => (en ? SALUDO_EN : SALUDO_ES).every((f) => !String(html).includes(f));

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const { pzRitualHTML, pzRitualPuertaManana, inicioView } = sandbox;

  // ===== A) REVELADA con posteo nuevo (video, ES + EN) =====
  const htmlEs = String(pzRitualHTML(dRit(), false));
  t('A1: revelada ES sin saludo (ni buen día, ni paquete, ni racha, ni «Hoy sale este», ni aviso 9:00)', sinSaludo(htmlEs, false), htmlEs.slice(0, 200));
  t('A2: revelada ES muestra el video + caption + chips', htmlEs.includes('/media/v593.mp4') && htmlEs.includes('Así se mueve el color') && htmlEs.includes('Recomendada') && htmlEs.includes('general'));
  t('A3: revelada ES lleva la hora como DATO de la tarjeta', htmlEs.includes('Sale hoy a las 19:00') && !htmlEs.includes('te avisamos a las 9:00'));
  t('A4: revelada ES conserva confirmar/cambiar + marca de revelada', htmlEs.includes('Sale así') && htmlEs.includes('data-pz-ritual-ok="593"') && htmlEs.includes('Cambiar algo') && htmlEs.includes('data-pz-ritual-cambio="593"') && htmlEs.includes('data-pz-ritual-revelada="1"') && htmlEs.includes('data-post-id="593"'));
  const htmlEn = String(pzRitualHTML(dRit(), true));
  t('A5: revelada EN sin saludo', sinSaludo(htmlEn, true), htmlEn.slice(0, 200));
  t('A6: revelada EN lleva la hora como dato', htmlEn.includes('It goes out today at 19:00') && !htmlEn.includes('9:00 AM to confirm'));
  t('A7: revelada EN muestra el video + confirmar/cambiar', htmlEn.includes('/media/v593.mp4') && htmlEn.includes('Post it like this') && htmlEn.includes('Change something'));

  // ===== A8) REVELADA pre-9:00 (abre_a en el futuro): tampoco hay ceremonia =====
  const htmlPre = String(pzRitualHTML(dRit({ abre_a: new Date(Date.now() + 3 * 3600 * 1000).toISOString() }), false));
  t('A8: revelada pre-9:00 sin saludo ni aviso 9:00 (la ceremonia murió también antes de las 9:00)', sinSaludo(htmlPre, false) && htmlPre.includes('/media/v593.mp4') && htmlPre.includes('Sale hoy a las 19:00'));

  // ===== A9) REVELADA con imagen (no solo video) =====
  const htmlImg = String(pzRitualHTML(dRit({ recomendada: cartaImg(201), cartas: [cartaImg(201)] }), false));
  t('A9: revelada imagen sin saludo, con foto + hora como dato', sinSaludo(htmlImg, false) && htmlImg.includes('/media/a.jpg') && htmlImg.includes('Sale hoy a las 19:00') && htmlImg.includes('Sale así'));

  // ===== B) ELEGIDA (ya confirmada): sin saludo, con su estado =====
  const htmlEl = String(pzRitualHTML(dRit({ elegida: 593 }), false));
  t('B1: elegida sin saludo', sinSaludo(htmlEl, false), htmlEl.slice(0, 200));
  t('B2: elegida conserva «Listo, hoy sale esta» + tarjeta + hora', htmlEl.includes('Listo, hoy sale esta') && htmlEl.includes('/media/v593.mp4') && htmlEl.includes('Sale hoy a las 19:00'));

  // ===== C) SIN posteo nuevo: no queda vacío ni roto =====
  const htmlVacio = String(pzRitualHTML({ hoy: null, racha: 0, dorada: false, elegida: 0, recomendada: null, cartas: [], album: { slots: [] }, publicado_hoy: false }, false));
  t('C1: vacío honesto (sin posteo hoy) no roto: mensaje + botón Inicio', htmlVacio.includes('Hoy no tenés posteo programado.') && htmlVacio.includes('Inicio'));
  const htmlVacioPub = String(pzRitualHTML({ hoy: null, racha: 0, dorada: false, elegida: 0, recomendada: null, cartas: [], album: { slots: [] }, publicado_hoy: true }, false));
  t('C2: vacío con publicado_hoy: dice que ya salió y mañana hay otro', htmlVacioPub.includes('El posteo de hoy ya salió, mañana hay otro paquete.'));
  const htmlProx = String(pzRitualHTML(dProximo(), false));
  t('C3: rama de la tarde (próximo) intacta: cuenta + «1 carta adentro»', htmlProx.includes('tu paquete se abre en') && htmlProx.includes('1 carta adentro') && htmlProx.includes('pzRitualCuenta'));
  const htmlSinRec = String(pzRitualHTML(dRit({ recomendada: null, cartas: [] }), false));
  t('C4: hoy sin recomendada ni cartas: vacío honesto, no roto', htmlSinRec.includes('Hoy no tenés posteo programado.') && htmlSinRec.includes('Inicio'));

  // ===== D) PUERTA MATUTINA: Inicio ya no redirige al ritual =====
  t('D1: pzRitualPuertaManana sigue existiendo como función pura', typeof pzRitualPuertaManana === 'function');
  t('D2: la puerta pura sigue decidiendo bien (positivo+no vista dispara; resto no)', pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: false }, false) === true && pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: false }, true) === false && pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: true }, false) === false && pzRitualPuertaManana(null, false) === false);
  const inicioSrc = (typeof inicioView === 'function') ? String(inicioView.toString()) : '';
  // D3/D4 buscan la LLAMADA, no el nombre: el comentario de la puerta
  // menciona la función y la ruta (documentación), pero ya no se llama.
  t('D3: inicioView ya NO llama a la puerta matutina', typeof inicioView === 'function' && !inicioSrc.includes('pzRitualPuertaManana('));
  t('D4: inicioView ya NO redirige a la hoja del ritual', typeof inicioView === 'function' && !inicioSrc.includes("bbGo('#/app/ritual')") && !inicioSrc.includes("location.hash = '#/app/ritual'"));
  t('D5: la carta de hoy SIGUE abriendo el ritual al tocarla (pzRitualAbrirDesdeCarta existe)', typeof sandbox.pzRitualAbrirDesdeCarta === 'function' && String(sandbox.pzRitualAbrirDesdeCarta.toString()).includes("#/app/ritual"));

  // ===== E) M78: funciones que usa la hoja existen =====
  t('E1: funciones de la hoja existen en el bundle', typeof sandbox.pzRitualHTML === 'function' && typeof sandbox.pzRitualAnalisisHTML === 'function' && typeof sandbox.pzRitualCardHTML === 'function');

  // ===== F) ESTAMPADO provisional =====
  t('F1: BUILD_ID provisional 20261105-v892', SRV.includes("const BUILD_ID = '20261105-v892'"));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL excepción: ' + (e && e.stack || e)); process.exit(2); });
