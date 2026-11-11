// test-lote-sacar-frase.js — LOTE SACAR-FRASE (11/11 · orden Valentino
// «"te arme el posteo de hoy...." no crees que esta de mas?» → «sacalo del producto!»):
// Quitar del producto el anuncio «Te armé el posteo de hoy» del aviso de
// Posty en Inicio (pzHoySpeechHTML, rama saleSolo/autopilot). El posteo ya
// está a la vista — anunciarlo no agrega nada (mismo ruido que el saludo
// sacado en v892). Se saca solo la oración del anuncio; el resto del aviso
// (dato de salida + aviso 30 min + aviso al salir) queda intacto y coherente.
// La ocurrencia del chat (pzSftChatDecir, frase fija de entrega al armar
// desde fotos) NO se toca: es otra función (entrega de una propuesta nueva,
// no un preámbulo en Inicio), el slot nunca es hoy (armarNextFeedSlot
// arranca mañana) y un test vecino afirma sus 3 formas — queda documentado
// en STATUS.md como exclusión deliberada.
// Uso: node test-lote-sacar-frase.js (desde el scratch; corre contra
// release/ si existe, si no contra work/). Sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 300) : '')); }
};

const ROOT = __dirname;
const TREE = fs.existsSync(path.join(ROOT, 'release', 'server.js'))
  ? path.join(ROOT, 'release')
  : (fs.existsSync(path.join(ROOT, 'work', 'server.js')) ? path.join(ROOT, 'work') : ROOT);
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDXEN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');
const cnt = (s, re) => (String(s).match(re) || []).length;

// ---------- sandbox vm (mínimo del patrón ritual-sin-velo) ----------
function elStub() {
  return {
    tagName: 'DIV', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute: {},
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
const TZ = 'America/New_York';
function postHoy(over) {
  return Object.assign({
    id: 593, status: 'scheduled', approval: 'approved',
    scheduled_at: '2026-11-11T19:00:00-05:00',
    published_at: null, media_type: 'video',
    image_path: '/media/v593.mp4',
    caption: 'Así se mueve el color cuando posty lo postea',
  }, over || {});
}
function speechOpts(over) {
  return Object.assign({
    en: false, tz: TZ, hoyPost: postHoy(), pendientes: 0,
    haySemana: true, insight: '', manual: false, needOK: 0, schedSolo: 0,
  }, over || {});
}

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const { pzHoySpeechHTML, pzHoyCardHTML, pzHoyHoraCorta, esc } = sandbox;
  const speechSrc = typeof pzHoySpeechHTML === 'function' ? String(pzHoySpeechHTML.toString()) : '';

  // ===== A) LA FRASE YA NO ESTÁ EN EL AVISO DE INICIO =====
  t('A1: pzHoySpeechHTML existe', typeof pzHoySpeechHTML === 'function');
  t('A2: la fuente de pzHoySpeechHTML ya no tiene el anuncio ES', !speechSrc.includes('Te armé el posteo de hoy'), speechSrc.slice(0, 200));
  t('A3: la fuente de pzHoySpeechHTML ya no tiene el anuncio EN', !speechSrc.includes("I put together today's post for you"));
  t('A4: en todo app.js queda UNA sola ocurrencia ES (la del chat, exclusión deliberada)', cnt(SRC, /Te armé el posteo de hoy/g) === 1, 'count=' + cnt(SRC, /Te armé el posteo de hoy/g));
  t('A5: en todo app.js queda UNA sola ocurrencia EN (la del chat, exclusión deliberada)', cnt(SRC, /I put together today's post for you/g) === 1, 'count=' + cnt(SRC, /I put together today's post for you/g));
  t('A6: la única ocurrencia restante vive en el chat (pzSftChatDecir), no en Inicio', SRC.includes("pzSftChatDecir") && (() => { const i = SRC.indexOf('Te armé el posteo de hoy'); return SRC.slice(Math.max(0, i - 400), i).includes('pzSftChatDecir') || SRC.slice(Math.max(0, i - 1200), i).includes('fraseDicha'); })());

  // ===== B) RENDER saleSolo (autopilot, programado aprobado): sin anuncio, con el dato =====
  const hhEs = String(pzHoyHoraCorta('2026-11-11T19:00:00-05:00', TZ, false));
  const sEs = String(pzHoySpeechHTML(speechOpts()));
  t('B1: render saleSolo ES sin el anuncio', !sEs.includes('Te armé el posteo de hoy'), sEs.slice(0, 300));
  t('B2: render saleSolo ES arranca con el dato de salida (sin preámbulo)', sEs.includes('<span><b>El de hoy sale'), sEs.slice(0, 300));
  t('B3: render saleSolo ES conserva hora + «solo» + aviso 30 min + aviso al salir', sEs.includes(hhEs) && sEs.includes('solo') && sEs.includes('te aviso 30 min antes') && sEs.includes('te aviso cuando salga') && sEs.includes('miralo si querés'), sEs.slice(0, 300));
  const hhEn = String(pzHoyHoraCorta('2026-11-11T19:00:00-05:00', TZ, true));
  const sEn = String(pzHoySpeechHTML(speechOpts({ en: true })));
  t('B4: render saleSolo EN sin el anuncio', !sEn.includes("I put together today's post for you"), sEn.slice(0, 300));
  t('B5: render saleSolo EN conserva hora + «on its own» + avisos', sEn.includes(hhEn) && sEn.includes('on its own') && sEn.includes('30 min before') && sEn.includes("when it's out") && sEn.includes('take a look if you want'), sEn.slice(0, 300));

  // ===== C) OTRAS RAMAS DE pzHoySpeechHTML INTACTAS =====
  const sPub = String(pzHoySpeechHTML(speechOpts({ hoyPost: postHoy({ status: 'published', published_at: '2026-11-11T19:00:00-05:00' }) })));
  t('C1: yaSalio (publicado) intacto: «El de hoy ya salió» + hora, sin anuncio', sPub.includes('El de hoy ya salió') && sPub.includes(hhEs) && !sPub.includes('Te armé el posteo de hoy'), sPub.slice(0, 300));
  const sDraft = String(pzHoySpeechHTML(speechOpts({ hoyPost: postHoy({ status: 'draft' }) })));
  t('C2: esBorrador sigue vacío (solo la tarjeta, como en v879)', sDraft === '');
  const sPend = String(pzHoySpeechHTML(speechOpts({ hoyPost: null, pendientes: 2, needOK: 2 })));
  t('C3: rama pendientes intacta (sin hoyPost): pide revisar', sPend.includes('2 posteos para revisar') && sPend.includes('miralo'), sPend.slice(0, 300));

  // ===== D) EL POSTEO SIGUE VISIBLE (tarjeta intacta, con hora y Agendado) =====
  const card = String(pzHoyCardHTML(postHoy(), { en: false, tz: TZ }));
  t('D1: la tarjeta del posteo sigue visible: foto + caption + data-post-id', card.includes('/media/v593.mp4') && card.includes('Así se mueve el color') && card.includes('data-post-id="593"'), card.slice(0, 300));
  // (notaOk usa pill || cuando || 'Agendado': con scheduled_at válido el
  // cuando («Hoy 19:00») gana al fallback; el estado «Agendado» es esa nota.)
  t('D2: la tarjeta conserva el estado Agendado (nota «Hoy 19:00» + historia)', card.includes('Posty también lo sube como historia') && (card.includes('Hoy 19:00') || card.includes('Agendado')), card.slice(0, 500));
  t('D3: la tarjeta conserva la hora de salida', card.includes('19:00') || card.includes(hhEs), card.slice(0, 300));

  // ===== E) M78: funciones que usa el aviso existen =====
  // (esc es un const de nivel superior del bundle — no cuelga del global
  // del vm — así que se verifica por fuente, no por typeof.)
  t('E1: funciones del aviso existen en el bundle', typeof pzHoySpeechHTML === 'function' && typeof pzHoyHoraCorta === 'function' && typeof pzHoyCardHTML === 'function' && typeof sandbox.pzHoyPillSalida === 'function' && typeof sandbox.pzHoyCuandoCorto === 'function' && SRC.includes('const esc = '));

  // ===== F) ESTAMPADO =====
  t('F1: BUILD_ID 20261105-v895', SRV.includes("const BUILD_ID = '20261105-v895'"));
  t('F2: index ES con app.js?v=610 y styles?v=20261235 intacto', IDX.includes('app.js?v=610') && IDX.includes('styles.css?v=20261235'));
  t('F3: index EN no carga app.js y styles?v=20261235 intacto', !IDXEN.includes('app.js?v=') && IDXEN.includes('styles.css?v=20261235'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL excepción: ' + (e && e.stack || e)); process.exit(2); });
