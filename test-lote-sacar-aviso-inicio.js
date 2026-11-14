// test-lote-sacar-aviso-inicio.js — LOTE SACAR-AVISO-INICIO v901 (11/11 ·
// corrección Valentino 14:33 «sacar TODA la tarjeta del aviso, no solo la
// frase»): la tarjeta del aviso de Inicio (pzHoySpeechHTML, rama saleSolo)
// sale ENTERA — ya no se rinde la burbuja cuando el posteo de hoy sale
// solo (autopilot o manual aprobado). Las demás ramas de pzHoySpeechHTML
// (yaSalio, pendientes, semana armada, haySemana, sin semana) quedan
// intactas, igual que el héroe (v897), la tarjeta del posteo, la frase del
// chat (pzSftChatDecir) y los pushes de 30 min y al salir (servidor).
// RE-PIN 13/11 · lote TARJETA-REVISIÓN v1031: el pin B3 afirmaba la rama de pendientes
// («pide revisar») de pzHoySpeechHTML; esa rama era la tarjeta «Tenés N posteos para
// revisar» que Valentino ordenó eliminar entera (13/11 19:43), así que B3 se re-pinea
// para afirmar el NUEVO comportamiento: sin hoyPost y con needOK>0 el saludo no
// muestra nada. El resto de la suite no se toca.
// Uso: node test-lote-sacar-aviso-inicio.js (desde el scratch; corre contra
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
const MPP = fs.readFileSync(path.join(TREE, 'morning-post-push.js'), 'utf8');
const AP = fs.readFileSync(path.join(TREE, 'autopilot.js'), 'utf8');
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
  const { pzHoySpeechHTML, pzHoyCardHTML, pzHoyHoraCorta, pzSftChatDecir, esc } = sandbox;
  const speechSrc = typeof pzHoySpeechHTML === 'function' ? String(pzHoySpeechHTML.toString()) : '';

  // ===== A) LA TARJETA DEL AVISO (saleSolo) YA NO ESTÁ EN INICIO =====
  t('A1: pzHoySpeechHTML existe (la función queda para las demás ramas)', typeof pzHoySpeechHTML === 'function');
  t('A2: la fuente de pzHoySpeechHTML ya no tiene el aviso ES', !speechSrc.includes('<b>El de hoy sale') && !speechSrc.includes('miralo si querés, te aviso 30 min antes por si querés frenarlo y te aviso cuando salga'), speechSrc.slice(0, 200));
  t('A3: la fuente de pzHoySpeechHTML ya no tiene el aviso EN', !speechSrc.includes("<b>Today's goes out") && !speechSrc.includes("take a look if you want, I'll let you know 30 min before in case you want to stop it, and when it's out"));
  const sEs = String(pzHoySpeechHTML(speechOpts()));
  t('A4: render saleSolo ES es vacío (la burbuja no se rinde)', sEs === '', sEs.slice(0, 300));
  const sEn = String(pzHoySpeechHTML(speechOpts({ en: true })));
  t('A5: render saleSolo EN es vacío', sEn === '', sEn.slice(0, 300));
  const sManAp = String(pzHoySpeechHTML(speechOpts({ manual: true, hoyPost: postHoy({ approval: 'approved' }) })));
  t('A6: render manual aprobado (sale solo) ES es vacío', sManAp === '', sManAp.slice(0, 300));
  t('A7: en todo app.js no queda el aviso saleSolo ES ni EN', !SRC.includes('<b>El de hoy sale') && !SRC.includes("<b>Today's goes out"));

  // ===== B) LAS DEMÁS RAMAS DE pzHoySpeechHTML INTACTAS =====
  const hhEs = String(pzHoyHoraCorta('2026-11-11T19:00:00-05:00', TZ, false));
  const sPub = String(pzHoySpeechHTML(speechOpts({ hoyPost: postHoy({ status: 'published', published_at: '2026-11-11T19:00:00-05:00' }) })));
  t('B1: yaSalio (publicado) intacto: «El de hoy ya salió» + hora, sin anuncio', sPub.includes('El de hoy ya salió') && sPub.includes(hhEs) && !sPub.includes('Te armé el posteo de hoy'), sPub.slice(0, 300));
  const sDraft = String(pzHoySpeechHTML(speechOpts({ hoyPost: postHoy({ status: 'draft' }) })));
  t('B2: esBorrador sigue vacío (solo la tarjeta, como en v879)', sDraft === '');
  const sPend = String(pzHoySpeechHTML(speechOpts({ hoyPost: null, pendientes: 2, needOK: 2 })));
  t('B3: rama pendientes (sin hoyPost): SIN aviso — el saludo no muestra nada (re-pin TARJETA-REVISIÓN v1031)', sPend === '' && !sPend.includes('para revisar'), sPend.slice(0, 300));
  const sSem = String(pzHoySpeechHTML(speechOpts({ hoyPost: null, pendientes: 2, needOK: 0 })));
  t('B4: semana armada (needOK 0) intacta: «Tu semana ya está armada» + aviso 30 min de cada uno', sSem.includes('Tu semana ya está armada') && sSem.includes('Te aviso 30 min antes de cada uno'), sSem.slice(0, 300));
  const sSemAp = String(pzHoySpeechHTML(speechOpts({ hoyPost: null, pendientes: 0, haySemana: true })));
  t('B5: haySemana intacta: «Tu semana ya está aprobada»', sSemAp.includes('Tu semana ya está aprobada'), sSemAp.slice(0, 300));
  const sVacia = String(pzHoySpeechHTML(speechOpts({ hoyPost: null, pendientes: 0, haySemana: false })));
  t('B6: sin semana intacta: «¿Armamos tu semana?»', sVacia.includes('¿Armamos tu semana?'), sVacia.slice(0, 300));
  const sManPend = String(pzHoySpeechHTML(speechOpts({ manual: true, hoyPost: postHoy({ approval: 'pending' }) })));
  t('B7: manual pendiente sigue vacío (v879)', sManPend === '');

  // ===== C) EL HÉROE (TARJETA DEL POSTEO) INTACTO =====
  const card = String(pzHoyCardHTML(postHoy(), { en: false, tz: TZ }));
  t('C1: la tarjeta del posteo sigue visible: foto + caption + data-post-id', card.includes('/media/v593.mp4') && card.includes('Así se mueve el color') && card.includes('data-post-id="593"'), card.slice(0, 300));
  // (notaOk usa pill || cuando || 'Agendado': con scheduled_at válido el
  // cuando («Hoy 19:00») gana al fallback; el estado «Agendado» es esa nota.)
  t('C2: la tarjeta conserva el estado Agendado (nota «Hoy 19:00» + historia)', card.includes('Posty también lo sube como historia') && (card.includes('Hoy 19:00') || card.includes('Agendado')), card.slice(0, 500));
  t('C3: la tarjeta conserva la hora de salida', card.includes('19:00') || card.includes(hhEs), card.slice(0, 300));
  const heroCard = String(pzHoyCardHTML(postHoy(), { en: false, tz: TZ, hero: true }));
  t('C4: el héroe intacto: «Ver el posteo completo» + botón pz-hoy-hero-link', heroCard.includes('Ver el posteo completo') && heroCard.includes('pz-hoy-hero-link'), heroCard.slice(0, 300));

  // ===== D) FUERA DE ALCANCE, INTACTO =====
  t('D1: la frase del chat queda ×1 en app.js (ES, pzSftChatDecir)', cnt(SRC, /Te armé el posteo de hoy/g) === 1, 'count=' + cnt(SRC, /Te armé el posteo de hoy/g));
  t('D2: la frase del chat queda ×1 en app.js (EN)', cnt(SRC, /I put together today's post for you/g) === 1, 'count=' + cnt(SRC, /I put together today's post for you/g));
  t('D3: pzSftChatDecir existe', typeof pzSftChatDecir === 'function');
  t('D4: los pushes de 30 min no se tocan (servidor intacto)', MPP.includes('Esto NO reemplaza el aviso de 30 min') && AP.includes('aviso pre-publicación de 30 min') && AP.includes('Si querés que te avise 30 min antes igual'));

  // ===== E) M78: funciones que usa el aviso / Inicio existen =====
  // (esc es un const de nivel superior del bundle — no cuelga del global
  // del vm — así que se verifica por fuente, no por typeof.)
  t('E1: funciones de Inicio existen en el bundle', typeof pzHoySpeechHTML === 'function' && typeof pzHoyHoraCorta === 'function' && typeof pzHoyCardHTML === 'function' && typeof sandbox.pzHoyPillSalida === 'function' && typeof sandbox.pzHoyCuandoCorto === 'function' && SRC.includes('const esc = '));

  // ===== F) ESTAMPADO =====
  t('F1: BUILD_ID 20261105-v901', SRV.includes("const BUILD_ID = '20261105-v901'"));
  t('F2: index ES con app.js?v=614 y styles?v=20261238 intacto (styles.css no se toca)', IDX.includes('app.js?v=614') && IDX.includes('styles.css?v=20261238'));
  t('F3: index EN no carga app.js y styles?v=20261238 intacto', !IDXEN.includes('app.js?v=') && IDXEN.includes('styles.css?v=20261238'));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('FAIL excepción: ' + (e && e.stack || e)); process.exit(2); });
