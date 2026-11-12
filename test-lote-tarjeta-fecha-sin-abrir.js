'use strict';
// test-lote-tarjeta-fecha-sin-abrir.js — TARJETA-FECHA-REAL / SIN-ABRIR (12/11):
// la tarjeta del posteo 610 no se abría desde Inicio y su fecha mentía.
// El 610 (foto testimonio «Lo que nos dijo una clienta…», publicado 11/11
// 19:01, permalink DfnuFrnjxae, ig_state archived_ext): su tarjeta en Inicio
// es pzHoyTiraDetalleHTML, que NO tenía handler de tap para abrir nada (su
// único cableado era chat + Impulsar), y su fecha salía de scheduled_at con
// verbo en futuro («Hoy 19:00» / «Sale hoy 19:00») aunque ya hubiera salido
// a las 19:01. El Impulsar se ofrecía para cualquier publicado, pero el
// endpoint de elegibles excluye lo que ya no está vivo en el feed
// (filtrarPosteosVivos, v867): el 610 no llega nunca a elegibles y el botón
// solo podía terminar en «ya no está disponible para impulsar».
// El fix (SOLO public/app.js): (1) la tarjeta lleva data-pz-hoy-detalle y
// abre su detalle al tocarla (pzHoyTiraBindDetalle, con guarda para que el
// tap en un botón no navegue); (2) un publicado muestra su fecha REAL de
// publicación en pasado («Salió hoy 19:01», pzHoyCuandoPub + apvWhenTextPub),
// nunca la programada; (3) Impulsar solo si publicado Y no archivado en IG
// (fail-open: solo la marca explícita archived_ext lo apaga; el toast de
// pzBoostOpenById queda como backstop); el archivado muestra su estado
// honesto con el copy del archivo. (4) igRelTime parsea con pcParseDate
// (UTC): Date.parse pelado leía los datetimes de SQLite como hora local y
// el relativo salía corrido por la zona del dispositivo (en EST, «hace 1
// min» en vez de «hace 13 min»). El badge «Publicado» NO se toca (v925) y
// chatMsgHtml tampoco. Correr bajo DOS zonas para probar la independencia
// de TZ: TZ=UTC y TZ=America/New_York.
// Uso: DATA_DIR temporal + NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-tarjeta-fecha-sin-abrir.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync, spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

// El árbol es el directorio de la suite: el release del builder acá, la
// raíz del repo en main. Los temporales van FUERA del árbol.
const SCRATCH = __dirname;
const TREE = SCRATCH;
const TMPBASE = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(TMPBASE, '.tmp-test-'));
process.env.TMPDIR = TMP;

let ok = 0, bad = 0;
const FAILURES = [];
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; FAILURES.push(name); console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

const srv = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(TREE, 'public/app.js'), 'utf8');
const idxES = fs.readFileSync(path.join(TREE, 'public/index.html'), 'utf8');
const idxEN = fs.readFileSync(path.join(TREE, 'public/en/index.html'), 'utf8');

// Extrae una function declaration por nombre (balanceo de llaves).
function extractFn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i === -1) return '';
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0, j = src.indexOf('{', i);
  if (j === -1) return '';
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

// Reloj fijo: el momento de la captura del incidente (11/11 21:40 EST).
const FIXED_INCIDENTE = Date.parse('2026-11-12T02:40:00Z');
const FIXED_DIA_SIG = Date.parse('2026-11-12T15:00:00Z'); // 12/11 10:00 EST
const FIXED_REL = Date.parse('2026-11-12T00:14:30Z'); // 11/11 19:14:30 EST
const clock = { now: FIXED_INCIDENTE };
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [clock.now])); }
  static now() { return clock.now; }
}

// Fixtures con los datos REALES del 610 (GET /api/admin/client/12).
const p610 = { id: 610, status: 'published', media_type: 'image', scheduled_at: '2026-11-12T00:00:00.000Z', published_at: '2026-11-12 00:01:11', created_at: '2026-11-12 00:00:52', ig_permalink: 'https://www.instagram.com/p/DfnuFrnjxae/', ig_media_id: '18164190202453509', ig_state: 'archived_ext', caption: 'Lo que nos dijo una clienta después de probar community manager en Posty.\n\n¿Cuántas veces te pasó que mirás tu Instagram y no sabés qué postear? 😅', image_path: '/media/1794441649390-6f1916be9cc2.jpg' };
const p593 = { id: 593, status: 'published', media_type: 'video', scheduled_at: '2026-11-12T00:00:00.000Z', published_at: '2026-11-12 00:00:35', ig_permalink: 'https://www.instagram.com/reel/Dfnt-fls8P4/', ig_media_id: '18116049578145678', ig_state: 'live', caption: 'así se mueve el color cuando posty lo postea.', image_path: '/media/tira-nails-2.mp4' };
const pSched = { id: 594, status: 'scheduled', approval: 'pending', media_type: 'image', scheduled_at: '2026-11-12T00:00:00.000Z', published_at: null, ig_state: 'live', ig_permalink: '', ig_media_id: '', caption: 'las que vuelven no vuelven por el esmalte.', image_path: '/media/tira-nails-3.jpg' };
const TZ = 'America/New_York';

(async () => {
  // ---------- 1. Estampado (provisional: el preparador re-numera) ----------
  t(srv.includes("const BUILD_ID = '20261105-v941';"), 'server: BUILD v891');
  t(cnt(srv, '20261105-v941') === 1, 'server: BUILD v891 ×1');
  t(!srv.includes('20261105-v940'), 'server: sin restos de v940');
  t(idxES.includes('/app.js?v=651'), 'index ES: app.js?v=651');
  t(cnt(idxES, 'app.js?v=651') === 1, 'index ES: app.js?v=651 ×1');
  t(idxES.includes('/styles.css?v=20261270'), 'index ES: styles?v=20261270 sin cambio (el lote no toca styles.css)');
  t(idxEN.includes('/styles.css?v=20261270'), 'index EN: styles?v=20261270 (mismo valor que ES)');
  t(!idxEN.includes('/app.js?v='), 'index EN: no carga app.js (landing)');
  t(!idxES.includes('v=650'), 'sin restos de v940 (?v=650)');
  // El fix es SOLO cliente: server.js solo cambia el BUILD.
  t(!srv.includes('pzHoyCuandoPub') && !srv.includes('apvWhenTextPub'), 'server: sin cambios de lógica (solo BUILD)');

  // ---------- 2. Estáticos: el fix y lo que NO se toca ----------
  t(cnt(app, 'function pzHoyCuandoPub(') === 1, 'M78: pzHoyCuandoPub definida ×1');
  t(cnt(app, 'function apvWhenTextPub(') === 1, 'M78: apvWhenTextPub definida ×1');
  t(app.includes("if (p && typeof p === 'object' && typeof pzIsPubReal === 'function' && pzIsPubReal(p)) {"), 'fecha: pzHoyCuandoCorto deriva al publicado real');
  t(app.includes('data-pz-hoy-detalle="${esc(String(p.id))}"'), 'tarjeta: la tira detalle lleva data-pz-hoy-detalle');
  t(app.includes("const archivadoIg = String(p.ig_state || '') === 'archived_ext';"), 'impulsar: gate archivadoIg en la tira detalle');
  t(app.includes('No disponible en Instagram mientras esté archivado'), 'impulsar: estado honesto ES cuando archivado');
  t(app.includes('Not available on Instagram while archived'), 'impulsar: estado honesto EN cuando archivado');
  t(app.includes("cont.querySelector('.pz-hoy-tira-detalle[data-pz-hoy-detalle]')"), 'bind: la tarjeta se cablea por su data-pz-hoy-detalle');
  t(app.includes("t.closest('button, a, [data-pz-hoy-chat], [data-pz-boost-post]')"), 'bind: el tap en botón/link no navega');
  t(app.includes('(whenPub || apvWhenText(d, tz))'), 'detalle: whenTxt prefiere la fecha de publicación');
  t(app.includes('apvWhenTextPub(dPub, tz)'), 'detalle: whenPub sale de apvWhenTextPub');
  t(app.includes('function chatMsgHtml(role, text, ts, id, reply, cap, photos, post)'), 'chat: firma chatMsgHtml intacta (8 params)');
  t(app.includes("String(p.ig_state || '') !== 'archived_ext'"), 'pill: apvPill sigue apagando el link con archived_ext (v925 intacta)');
  t(app.includes('function pzIsPubReal('), 'M78: pzIsPubReal intacta');
  t(app.includes('pzHoyHoyHTML(hoyPostR1,'), 'héroe: su único llamador sigue siendo hoyPostR1 (programado/borrador)');
  t(app.includes('function pzHoyTiraDetalleHTML('), 'M78: pzHoyTiraDetalleHTML existe');
  t(app.includes('function pzHoyTiraBindDetalle('), 'M78: pzHoyTiraBindDetalle existe');

  // ---------- 3. VM: fecha real (pzHoyCuandoCorto / pzHoyCuandoPub) ----------
  const fechaSrc = ['pzIsPubReal', 'pcParseDate', 'pzWhenRelDay', 'pzHoyHoraCorta', 'hfChipText', 'pzHoyCuandoPub', 'pzHoyCuandoCorto'].map((n) => extractFn(app, n)).join('\n');
  t(fechaSrc.includes('function pzHoyCuandoPub(') && fechaSrc.includes('function pzHoyCuandoCorto('), 'VM fecha: helpers extraídos');
  const fechaCtx = {
    Date: FixedDate, ME: { lang: 'es' }, pcTz: () => TZ,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  };
  vm.createContext(fechaCtx);
  vm.runInContext(fechaSrc + '\nthis.__f = { pzHoyCuandoCorto, pzHoyCuandoPub };', fechaCtx);
  const cuando = fechaCtx.__f.pzHoyCuandoCorto;
  const cuandoPub = fechaCtx.__f.pzHoyCuandoPub;
  clock.now = FIXED_INCIDENTE; // 11/11 21:40 EST: el 610 salió hoy 19:01
  t(cuando(p610, TZ, false) === 'Salió hoy 19:01', 'fecha 610 hoy: «Salió hoy 19:01», no «Hoy 19:00»', cuando(p610, TZ, false));
  t(cuandoPub(p610, TZ, false) === 'Salió hoy 19:01', 'fecha pub 610 hoy: «Salió hoy 19:01»', cuandoPub(p610, TZ, false));
  t(cuando(p610, TZ, true) === 'Posted today 7:01 PM', 'fecha 610 EN: «Posted today 7:01 PM»', cuando(p610, TZ, true));
  t(cuando(p593, TZ, false) === 'Salió hoy 19:00', 'fecha 593 vivo: «Salió hoy 19:00» (19:00:35)', cuando(p593, TZ, false));
  t(cuando(pSched, TZ, false) === 'Hoy 19:00', 'fecha programado hoy: sigue «Hoy 19:00» (sin cambio)', cuando(pSched, TZ, false));
  t(cuando({ id: 595, status: 'scheduled', scheduled_at: '2026-11-11T00:00:00.000Z' }, TZ, false) === 'mar 10 · 19:00', 'fecha programado de ayer: «mar 10 · 19:00» (sin cambio)', cuando({ id: 595, status: 'scheduled', scheduled_at: '2026-11-11T00:00:00.000Z' }, TZ, false));
  t(cuando({ id: 596, status: 'published', ig_media_id: '123', scheduled_at: '2026-11-12T00:00:00.000Z' }, TZ, false) === 'Hoy 19:00', 'fecha publicado sin published_at: cae al camino de siempre, no inventa', cuando({ id: 596, status: 'published', ig_media_id: '123', scheduled_at: '2026-11-12T00:00:00.000Z' }, TZ, false));
  clock.now = FIXED_DIA_SIG; // 12/11 10:00 EST: el 610 salió ayer
  t(cuando(p610, TZ, false) === 'Salió ayer 19:01', 'fecha 610 mañana: «Salió ayer 19:01», nunca «Hoy» de un posteo de ayer', cuando(p610, TZ, false));
  t(cuando(p610, TZ, true) === 'Posted yesterday 7:01 PM', 'fecha 610 EN mañana: «Posted yesterday 7:01 PM»', cuando(p610, TZ, true));
  t(cuando({ ...p610, published_at: '2026-11-11T00:00:00.000Z' }, TZ, false) === 'Salió mar 10 · 19:00', 'fecha publicado viejo: «Salió mar 10 · 19:00»', cuando({ ...p610, published_at: '2026-11-11T00:00:00.000Z' }, TZ, false));
  clock.now = FIXED_INCIDENTE;

  // ---------- 4. VM: la tarjeta de la tira (pzHoyTiraDetalleHTML) ----------
  const tiraSrc = ['pzIsPubReal', 'pcParseDate', 'pzWhenRelDay', 'pzHoyHoraCorta', 'hfChipText', 'pzHoyCuandoPub', 'pzHoyCuandoCorto', 'pzHoyPillSalida', 'pzHoyTiraDetalleHTML'].map((n) => extractFn(app, n)).join('\n');
  t(tiraSrc.includes('function pzHoyTiraDetalleHTML('), 'VM tira: pzHoyTiraDetalleHTML extraída');
  const tiraCtx = {
    Date: FixedDate, ME: { lang: 'es' }, pcTz: () => TZ,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    mv: (s) => String(s || ''),
    pzIc: (n) => '[' + n + ']',
    pzHoyCuentaSaleTxt: () => '',
  };
  vm.createContext(tiraCtx);
  vm.runInContext(tiraSrc + '\nthis.__t = { pzHoyTiraDetalleHTML };', tiraCtx);
  const tiraDetalle = tiraCtx.__t.pzHoyTiraDetalleHTML;
  const dia610 = { esHoy: false, esManana: false, esPasado: true, revelado: true, idx: 1, key: '2026-11-11', post: p610 };
  const dia593 = { esHoy: false, esManana: false, esPasado: true, revelado: true, idx: 1, key: '2026-11-11', post: p593 };
  const diaSched = { esHoy: false, esManana: false, esPasado: false, revelado: true, idx: 2, key: '2026-11-12', post: pSched };
  clock.now = FIXED_INCIDENTE;
  let th = tiraDetalle(dia610, { en: false, tz: TZ });
  t(th.includes('data-pz-hoy-detalle="610"') && th.includes('data-post-id="610"'), 'tira 610: la tarjeta lleva su id y abre (data-pz-hoy-detalle)', th.slice(0, 300));
  t(th.includes('Publicado'), 'tira 610: la píldora «Publicado» queda (v925)', th.slice(0, 300));
  t(th.includes('Salió hoy 19:01'), 'tira 610: la fecha es «Salió hoy 19:01»', th.slice(0, 300));
  t(!th.includes('Hoy 19:00') && !th.includes('Sale hoy'), 'tira 610: ya no dice «Hoy 19:00» ni «Sale hoy»', th.slice(0, 300));
  t(!th.includes('data-pz-boost-post'), 'tira 610: SIN botón Impulsar (archivado: no se puede impulsar)', th.slice(0, 300));
  t(th.includes('No disponible en Instagram mientras esté archivado'), 'tira 610: estado honesto en vez de Impulsar', th.slice(0, 300));
  t(!th.includes('DfnuFrnjxae'), 'tira 610: su permalink no se vende en la tarjeta', th.slice(0, 300));
  th = tiraDetalle(dia593, { en: false, tz: TZ });
  t(th.includes('data-pz-hoy-detalle="593"'), 'tira 593: la tarjeta también abre', th.slice(0, 300));
  t(th.includes('data-pz-boost-post="593"') && th.includes('Impulsar'), 'tira 593 vivo: SÍ ofrece Impulsar', th.slice(0, 300));
  t(th.includes('Publicado') && th.includes('Salió hoy 19:00'), 'tira 593 vivo: «Publicado» + «Salió hoy 19:00»', th.slice(0, 300));
  t(!th.includes('No disponible en Instagram'), 'tira 593 vivo: sin estado de archivado', th.slice(0, 300));
  th = tiraDetalle(diaSched, { en: false, tz: TZ });
  t(th.includes('data-pz-hoy-detalle="594"') && !th.includes('data-pz-boost-post'), 'tira 594 programado: abre, sin Impulsar (como antes)', th.slice(0, 300));
  t(th.includes('Hoy 19:00') && th.includes('Se postea hoy'), 'tira 594 programado: fecha y pill sin cambio', th.slice(0, 300));
  tiraCtx.ME.lang = 'en';
  th = tiraDetalle(dia610, { en: true, tz: TZ });
  t(th.includes('Published') && th.includes('Posted today 7:01 PM'), 'tira 610 EN: «Published» + «Posted today 7:01 PM»', th.slice(0, 300));
  t(th.includes('Not available on Instagram while archived') && !th.includes('data-pz-boost-post'), 'tira 610 EN: estado honesto, sin Impulsar', th.slice(0, 300));
  tiraCtx.ME.lang = 'es';
  // Sin ig_state no se esconde nada (fail-open, igual que pzIgLinkVivo).
  const pSinEstado = { ...p593, ig_state: undefined };
  th = tiraDetalle({ ...dia593, post: pSinEstado }, { en: false, tz: TZ });
  t(th.includes('data-pz-boost-post="593"'), 'tira sin ig_state: Impulsar sigue (fail-open)', th.slice(0, 300));

  // ---------- 5. VM: el cableado del tap (pzHoyTiraBindDetalle) ----------
  const bindSrc = extractFn(app, 'pzHoyTiraBindDetalle');
  t(bindSrc.includes('function pzHoyTiraBindDetalle('), 'VM bind: pzHoyTiraBindDetalle extraída');
  const bindCtx = { location: { hash: '' } };
  vm.createContext(bindCtx);
  vm.runInContext(bindSrc + '\nthis.__b = { pzHoyTiraBindDetalle };', bindCtx);
  const bindDetalle = bindCtx.__b.pzHoyTiraBindDetalle;
  const cardEl = {
    _attrs: { 'data-pz-hoy-detalle': '610' },
    getAttribute(k) { return this._attrs[k] || null; },
    onclick: null, onkeydown: null,
  };
  const fakeCont = {
    querySelector(sel) { return sel === '.pz-hoy-tira-detalle[data-pz-hoy-detalle]' ? cardEl : null; },
    querySelectorAll() { return []; },
  };
  bindDetalle(fakeCont);
  t(typeof cardEl.onclick === 'function', 'bind: la tarjeta queda cableada (onclick)');
  t(typeof cardEl.onkeydown === 'function', 'bind: la tarjeta queda cableada (onkeydown)');
  cardEl.onclick({ target: { closest: () => null } });
  t(bindCtx.location.hash === '#/app/post/610', 'bind: tap en la tarjeta abre #/app/post/610', bindCtx.location.hash);
  bindCtx.location.hash = '';
  cardEl.onclick({ target: { closest: () => ({}) } });
  t(bindCtx.location.hash === '', 'bind: tap en un botón de adentro NO navega', bindCtx.location.hash);
  bindCtx.location.hash = '';
  cardEl.onkeydown({ key: 'Enter', preventDefault() {} });
  t(bindCtx.location.hash === '#/app/post/610', 'bind: Enter abre el detalle', bindCtx.location.hash);
  bindCtx.location.hash = '';
  cardEl.onkeydown({ key: 'x', preventDefault() {} });
  t(bindCtx.location.hash === '', 'bind: otra tecla no navega', bindCtx.location.hash);
  // Sin tarjeta no hay nada que cablear (no rompe).
  t(bindDetalle({ querySelector: () => null, querySelectorAll: () => [] }) === undefined, 'bind: sin tarjeta no rompe');

  // ---------- 6. VM: el detalle /app/post/:id (apvWhenTextPub) ----------
  const apvSrc = ['apvParse', 'apvDayKey', 'apvHM', 'pcDayKeyShift', 'apvWhenText', 'apvWhenTextPub'].map((n) => extractFn(app, n)).join('\n');
  t(apvSrc.includes('function apvWhenTextPub('), 'VM detalle: apvWhenTextPub extraída');
  const apvCtx = { Date: FixedDate };
  vm.createContext(apvCtx);
  vm.runInContext(apvSrc + '\nthis.__w = { apvWhenText, apvWhenTextPub, apvParse };', apvCtx);
  const whenPub = apvCtx.__w.apvWhenTextPub;
  const whenSale = apvCtx.__w.apvWhenText;
  const apvParse = apvCtx.__w.apvParse;
  clock.now = FIXED_INCIDENTE;
  t(whenPub(apvParse(p610.published_at), TZ) === 'Salió hoy 19:01', 'detalle 610 hoy: «Salió hoy 19:01»', whenPub(apvParse(p610.published_at), TZ));
  t(whenSale(apvParse(p610.scheduled_at), TZ) === 'Sale hoy 19:00', 'detalle programado: «Sale hoy 19:00» sigue (sin cambio)', whenSale(apvParse(p610.scheduled_at), TZ));
  clock.now = FIXED_DIA_SIG;
  t(whenPub(apvParse(p610.published_at), TZ) === 'Salió ayer 19:01', 'detalle 610 mañana: «Salió ayer 19:01»', whenPub(apvParse(p610.published_at), TZ));
  t(whenPub(apvParse('2026-11-11T00:00:00Z'), TZ) === 'Salió el martes, 10 de noviembre a las 19:00', 'detalle publicado viejo: «Salió el martes, 10 de noviembre a las 19:00» (misma coma que apvWhenText)', whenPub(apvParse('2026-11-11T00:00:00Z'), TZ));
  t(whenPub(new Date('invalid'), TZ) === '', 'detalle sin fecha válida: sin texto (no inventa)');
  clock.now = FIXED_INCIDENTE;

  // ---------- 7. VM: igRelTime (la zona del dispositivo no manda) ----------
  const relSrc = extractFn(app, 'pcParseDate') + '\n' + extractFn(app, 'igRelTime');
  t(relSrc.includes('function igRelTime('), 'VM rel: igRelTime extraída');
  t(extractFn(app, 'igRelTime').includes('pcParseDate(iso)'), 'VM rel: igRelTime parsea con pcParseDate (UTC)');
  const relCtx = { Date: FixedDate };
  vm.createContext(relCtx);
  vm.runInContext(relSrc + '\nthis.__r = { igRelTime };', relCtx);
  const rel = relCtx.__r.igRelTime;
  clock.now = FIXED_REL; // 11/11 19:14 EST
  t(rel('2026-11-12 00:01:11', false) === 'hace 13 min', 'rel 610: «hace 13 min» desde published_at sin zona', rel('2026-11-12 00:01:11', false));
  t(rel('2026-11-12T00:00:35Z', false) === 'hace 13 min', 'rel 593: «hace 13 min» desde ISO con Z', rel('2026-11-12T00:00:35Z', false));
  t(rel('2026-11-12T00:13:00Z', false) === 'hace 1 min', 'rel recién: «hace 1 min»', rel('2026-11-12T00:13:00Z', false));
  t(rel('2026-11-11T00:00:00Z', false) === 'hace 1 día', 'rel ayer: «hace 1 día»', rel('2026-11-11T00:00:00Z', false));
  t(rel('', false) === '', 'rel sin fecha: sin texto');
  // Control: el parseo pelado SÍ depende de la TZ del proceso; el fix no.
  const offMin = (Date.parse('2026-11-12 00:01:11') - Date.parse('2026-11-12T00:01:11Z')) / 60000;
  t(rel('2026-11-12 00:01:11', false) === 'hace 13 min', 'rel TZ: «hace 13 min» aunque el proceso corra en TZ con offset ' + offMin + ' min', rel('2026-11-12 00:01:11', false));
  clock.now = FIXED_INCIDENTE;

  // ---------- 8. Boot real ----------
  const BOOT = fs.mkdtempSync(path.join(TMPBASE, '.tmp-boot-'));
  const BOOT_DATA = path.join(BOOT, 'data');
  fs.mkdirSync(BOOT_DATA, { recursive: true });
  fs.cpSync(TREE, BOOT, { recursive: true });
  const PORT = 35006;
  const envBoot = Object.assign({}, process.env, {
    DATA_DIR: BOOT_DATA, PORT: String(PORT),
    NODE_PATH: '/home/hatch/workspace/posta/node_modules',
    TZ: 'America/Argentina/Buenos_Aires',
  });
  const child = spawn('node', ['server.js'], { cwd: BOOT, env: envBoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d.toString(); });
  child.stderr.on('data', (d) => { bootLog += d.toString(); });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let version = null;
  for (let i = 0; i < 160 && !version; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
      if (r.ok) version = await r.json();
    } catch (e) { /* aún no levanta */ }
    if (!version) await sleep(500);
  }
  t(version && version.build === '20261105-v941', 'boot: /api/version = v891', JSON.stringify(version));
  if (version) {
    let ok5 = 0;
    for (let i = 0; i < 5; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); const j = await r.json(); if (j && j.build === '20261105-v941') ok5++; } catch (e) {}
    }
    t(ok5 === 5, 'boot: /api/version 5/5', ok5 + '/5');
    const idx = await (await fetch(`http://127.0.0.1:${PORT}/`)).text();
    t(idx.includes('/app.js?v=651') && idx.includes('/styles.css?v=20261270'), 'boot: el index servido trae ?v=651 y styles?v=20261270');
    const bundle = await (await fetch(`http://127.0.0.1:${PORT}/app.js?v=651`)).text();
    t(bundle.includes('function pzHoyCuandoPub(') && bundle.includes('Salió hoy'), 'boot: el bundle trae pzHoyCuandoPub y «Salió»');
    t(bundle.includes('data-pz-hoy-detalle') && bundle.includes('No disponible en Instagram mientras esté archivado'), 'boot: el bundle trae la apertura de la tarjeta y el estado honesto');
    t(bundle.includes('function apvWhenTextPub('), 'boot: el bundle trae apvWhenTextPub');
    const reg = await fetch(`http://127.0.0.1:${PORT}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'tarjeta-test@postyhacetodo.com', password: 'test123456', terms_accepted: true }),
    });
    const regJ = await reg.json().catch(() => ({}));
    const cookie = (reg.headers.get('set-cookie') || '').split(';')[0];
    t(reg.ok && regJ.ok === true && cookie.length > 0, 'boot: registro de usuario de prueba', reg.status + ' ' + JSON.stringify(regJ).slice(0, 200));
    if (reg.ok && cookie) {
      const dbFile = path.join(BOOT_DATA, 'posta.db');
      const db = new DatabaseSync(dbFile);
      const u = db.prepare('SELECT id FROM users WHERE email = ?').get('tarjeta-test@postyhacetodo.com');
      t(!!u && !!u.id, 'boot: el usuario de prueba existe en la DB', JSON.stringify(u));
      if (u && u.id) {
        const ins = db.prepare('INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, needs_review, ig_permalink, ig_media_id, ig_state, scheduled_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
        const r610 = ins.run(u.id, '/media/test-610.jpg', 'Lo que nos dijo una clienta después de probar community manager en Posty.', '', 'published', 'image', 0, 'https://www.instagram.com/p/DfnuFrnjxae/', '18164190202453509', 'archived_ext', '2026-11-12T00:00:00.000Z', '2026-11-12 00:01:11');
        const r593 = ins.run(u.id, '/media/test-593.jpg', 'así se mueve el color cuando posty lo postea.', '', 'published', 'video', 0, 'https://www.instagram.com/reel/Dfnt-fls8P4/', '18116049578145678', 'live', '2026-11-12T00:00:00.000Z', '2026-11-12 00:00:35');
        // El cliente recibe ig_state + published_at: sin esos datos ni el
        // gate de Impulsar ni la fecha real podrían correr.
        const list = await (await fetch(`http://127.0.0.1:${PORT}/api/posts`, { headers: { cookie } })).json().catch(() => null);
        const byId = {};
        if (Array.isArray(list)) for (const p of list) byId[Number(p.id)] = p;
        const g610 = byId[Number(r610.lastInsertRowid)];
        const g593 = byId[Number(r593.lastInsertRowid)];
        t(g610 && g610.ig_state === 'archived_ext' && String(g610.published_at || '').includes('2026-11-12 00:01:11'), 'boot vivo: GET /api/posts trae el 610 con ig_state archived_ext + published_at', JSON.stringify(g610 || null).slice(0, 250));
        t(g593 && g593.ig_state === 'live' && String(g593.published_at || '').includes('2026-11-12 00:00:35'), 'boot vivo: GET /api/posts trae el 593 con ig_state live + published_at', JSON.stringify(g593 || null).slice(0, 250));
        const det610 = await (await fetch(`http://127.0.0.1:${PORT}/api/posts/${r610.lastInsertRowid}`, { headers: { cookie } })).json().catch(() => null);
        t(det610 && det610.post && det610.post.ig_state === 'archived_ext' && det610.post.status === 'published', 'boot vivo: GET /api/posts/:id del 610 trae ig_state + status published', JSON.stringify(det610 && det610.post ? { ig_state: det610.post.ig_state, status: det610.post.status } : det610));
        const arch = await (await fetch(`http://127.0.0.1:${PORT}/api/archive`, { headers: { cookie } })).json().catch(() => null);
        const archIds = Array.isArray(arch && arch.archived) ? arch.archived.map((p) => Number(p.id)) : [];
        t(archIds.includes(Number(r610.lastInsertRowid)), 'boot vivo: GET /api/archive trae el 610 en archived', JSON.stringify(archIds));
        t(!archIds.includes(Number(r593.lastInsertRowid)), 'boot vivo: GET /api/archive NO trae el 593 vivo', JSON.stringify(archIds));
      }
      try { db.close(); } catch (e) {}
    }
  } else {
    t(false, 'boot: el servidor no levantó', bootLog.slice(0, 500));
  }
  // Matar por PID exacto y verificar que el puerto quedó libre.
  const bootPid = child.pid;
  try { process.kill(bootPid, 'SIGTERM'); } catch (e) {}
  await sleep(1500);
  let stillAlive = true;
  try { process.kill(bootPid, 0); } catch (e) { stillAlive = false; }
  if (stillAlive) { try { process.kill(bootPid, 'SIGKILL'); } catch (e) {} await sleep(800); }
  try { process.kill(bootPid, 0); stillAlive = true; } catch (e) { stillAlive = false; }
  t(!stillAlive, 'boot: el proceso murió por PID exacto', bootPid);
  let portFree = false;
  try {
    const ssOut = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    portFree = !ssOut.split('\n').some((l) => l.includes(':' + PORT + ' '));
  } catch (e) { portFree = true; }
  t(portFree, 'boot: el puerto ' + PORT + ' quedó libre');

  // ---------- Epílogo ----------
  console.log(`\ntest-lote-tarjeta-fecha-sin-abrir: ${ok} OK, ${bad} FAIL`);
  if (bad) { console.log('FAILURES:'); FAILURES.forEach((f) => console.log('  -', f)); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(BOOT, { recursive: true, force: true }); } catch (e) {}
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
