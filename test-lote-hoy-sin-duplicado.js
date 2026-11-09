'use strict';
/* test-lote-hoy-sin-duplicado.js — LOTE HOY-SIN-DUPLICADO · EL POSTEO DE HOY NO SE REPITE (base v844).
 * Orden Valentino 9/11 ~11:50 (captura, chat principal; registrada en
 * MEMORY.md): en Hoy el posteo de hoy aparecía dos veces — la tarjeta
 * grande «EL POSTEO DE HOY» (pill «hoy · 19:00» + badge «Hoy 19:00» en
 * la foto) y abajo de la tira otra tarjeta con el mismo posteo, el mismo
 * titular, «Se postea hoy · 19:00», «Hoy 19:00» y «sale en 7 h 10 min»,
 * que hasta decía «Es el posteo de arriba: aprobalo ahí o desde el
 * chat». La hora aparecía 4 veces. Decisión: sacar la tarjeta
 * duplicada; la cuenta regresiva va en la tarjeta principal, junto a la
 * hora, en una sola línea. Un posteo, un lugar, una hora.
 * Cubre, con el código real extraído de public/app.js (bloques de Hoy +
 * helpers) y un DOM falso mínimo, con reloj mutable, y con boot
 * aislado (DB temporal, sin tocar producción):
 *  A) estáticos: la nota «Es el posteo de arriba» y su clase mueren en
 *     todo el bundle; la cuenta vive en la principal (data-pz-cuenta-
 *     sale + sinCuando); el CSS de la cabecera existe; preservados
 *     (saludo viejo ×0, pzApertura ×0, server.js sin tocar);
 *  B) tira: 7 días, reveal sin cambios (hoy revelado; mañana
 *     bloqueado mientras el de hoy no sale; historias y borradores
 *     fuera);
 *  C) la duplicada muere: con PZ_HOY_POST_ID = el id de la tarjeta
 *     principal, el detalle de hoy NO se rinde (ni su título, ni su
 *     cuenta, ni su hora); sin el global (llamada directa) el detalle
 *     se rinde como antes pero SIN la nota; el publicado de hoy sigue
 *     con su detalle + Impulsar (no tiene tarjeta principal); mañana
 *     y los demás días siguen; hoy vacío sigue invitando al chat; si
 *     hoy hay publicado + programado (dos posteos distintos), el
 *     detalle del publicado sigue (la comparación es por id, no por
 *     día);
 *  D) la tarjeta principal: pill «hoy · 19:00» + cuenta «sale en
 *     7 h 10 min» (a las 11:50 EST, como la captura) con
 *     data-pz-cuenta-sale para el tick en vivo; SIN el badge
 *     «Hoy 19:00» (la hora aparece UNA sola vez en la tarjeta);
 *     borrador sin fecha y publicado vencido no rinden cuenta; EN
 *     espejo («today · 07:00 PM» + «goes out in»);
 *  E) Hoy compuesta: en la zona de tarjetas (principal + tira +
 *     insight) «19:00» ×1, «sale en» ×1, sin detalle duplicado, con
 *     «Tu semana recién arranca» intacta. NOTA: el saludo (v843)
 *     menciona la hora en una frase («El de hoy sale a las 19:00…»),
 *     así que en toda la pantalla compuesta «19:00» ×2 — la segunda
 *     es prosa del saludo, no una tarjeta; si Valentino quiere ×1
 *     literal en pantalla, el saludo es otro lote, no este;
 *  F) auditoría M78: todo lo que las funciones tocadas llaman existe
 *     definido en el bundle (la cuenta ya existía: pzHoyCuentaSaleTxt
 *     no es función nueva);
 *  G) boot: /api/version v844, el app.js y el styles.css servidos son
 *     los del árbol (md5 igual), con el cableado nuevo y sin la nota.
 * En el árbol prístino v844 los tests nuevos deben FALLAR (cazan el
 * cambio). Uso: node test-lote-hoy-sin-duplicado.js — sale 0 si todo pasa.
 *   HSD_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.env.HSD_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0;
const t = (cond, name, extra) => {
  if (cond) { okN++; }
  else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 400) : ''); }
};

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Hoy del lote: lunes 9/11/2026. Semana: lun 9/11 – dom 15/11.
let NOW_MS = Date.parse('2026-11-09T15:00:00.000Z'); // lun 9/11 10:00 EST
const setNow = (iso) => { NOW_MS = Date.parse(iso); };
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- DOM falso mínimo ----------
class El {
  constructor(tag) {
    this.tagName = tag || 'div';
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.removed = false;
    this.innerHTML = '';
    this.textContent = '';
    this._l = {};
    this._q = {};
    this.className = '';
    this.id = '';
    this.children = [];
    this._cls = new Set();
    this.classList = {
      toggle: (c, f) => { if (f === undefined) { if (this._cls.has(c)) this._cls.delete(c); else this._cls.add(c); } else if (f) this._cls.add(c); else this._cls.delete(c); },
      add: (c) => this._cls.add(c),
      remove: (c) => this._cls.delete(c),
      contains: (c) => this._cls.has(c),
    };
  }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  querySelector(sel) { return this._q[sel] || null; }
  querySelectorAll(sel) { return this._q[sel + ':all'] || []; }
  setAttribute(k, v) { this['attr_' + k] = v; }
  getAttribute(k) { return this['attr_' + k]; }
  remove() { this.removed = true; }
}

// ---------- Sandbox ----------
const TZ = 'America/New_York';
const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date: FakeDate, Math, JSON, Intl, Map, Set,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pzIc: () => '',
  pcTz: () => TZ,
  pcParseDate: (s0) => { const s = String(s0 || '').replace(' ', 'T'); if (!s) return null; const x = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; const d = new FakeDate(x); return isNaN(d) ? null : d; },
  schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
  slotHour: () => 17,
  ME: { lang: 'es' },
  document: {
    hidden: false, activeElement: null,
    body: { appendChild: () => {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new El(tag),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {}, scrollTo: () => {} },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {} },
  bbGo: () => {},
  pzBoostOpenById: () => {},
  HF_VISITOR: false,
};
vm.createContext(sb);

// ---------- Extracción de funciones reales ----------
function extractFunc(name) {
  const i = APP.indexOf('function ' + name + '(');
  if (i < 0) { t(false, '§0: falta function ' + name + ' en app.js'); return ''; }
  const j = APP.indexOf('{', i);
  let d = 0, k = j;
  while (k < APP.length) {
    if (APP[k] === '{') d++;
    else if (APP[k] === '}') { d--; if (d === 0) break; }
    k++;
  }
  if (d !== 0) { t(false, '§0: llaves sin cerrar en ' + name); return ''; }
  return APP.slice(i, k + 1);
}
const FUNCS = [
  'pzHoyDiaKey', 'pzHoyDowKey', 'pzHoyPostDiaKey', 'pzHoyMoverKey',
  'pzHoySemana', 'pzHoyPendientes', 'pzWhenRelDay', 'hfChipText',
  'pzHoySaludoTxt', 'pzHoyHoraCorta', 'pzHoyCuandoCorto',
  'pzHoyPillSalida', 'pzRitualCuentaTxt', 'pzHoyCuentaSaleTxt',
  'pzHoySpeechHTML',
  'pzHoyTiraDias', 'pzHoyTiraDetalleHTML', 'pzHoyTiraHTML',
  'pzHoyTiraBindDetalle', 'pzHoyTiraBind',
  'pzHoyParaAprobarHTML', 'pzHoySemanaInsightHTML',
  'pzHoyCardHTML', 'pzHoyHoyHTML',
];
console.log('— §0: bloques');
for (const f of FUNCS) {
  const code = extractFunc(f);
  if (!code) continue;
  try { vm.runInContext(code, sb); t(true, '§0: ' + f + ' cargada'); }
  catch (e) { t(false, '§0: ' + f + ' no corre en VM', e.message); }
}
// Las variables de sesión de la tira (var, no function).
try {
  vm.runInContext("var PZ_HOY_TIRA_SEL = ''; var PZ_HOY_TIRA_DIAS = []; var PZ_HOY_POST_ID = '';", sb);
  t(true, '§0: PZ_HOY_TIRA_SEL/DÍAS/POST_ID declaradas');
} catch (e) { t(false, '§0: vars de tira', e.message); }

// ---------- §0: estáticos del lote ----------
t(!APP.includes('Es el posteo de arriba'), '§0: la nota «Es el posteo de arriba» muere en app.js (×0)');
t(!APP.includes('note-line') && !CSS.includes('note-line'), '§0: la clase .note-line muere en app.js y styles.css (×0)');
t(extractFunc('pzHoyHoyHTML').includes('data-pz-cuenta-sale') && extractFunc('pzHoyHoyHTML').includes('sinCuando'),
  '§0: pzHoyHoyHTML rinde la cuenta (data-pz-cuenta-sale) y pasa sinCuando');
t(extractFunc('pzHoyTiraDetalleHTML').includes('PZ_HOY_POST_ID'),
  '§0: pzHoyTiraDetalleHTML compara contra PZ_HOY_POST_ID');
t(CSS.includes('.pz-hoy-hoy-head .pz-hoy-hoy-right') && CSS.includes('.pz-hoy-hoy-head .pz-hoy-cuenta'),
  '§0: styles.css trae el grupo derecho de la cabecera + la cuenta en cabecera');
t(!APP.includes('Sin tu OK, no sale nada'), '§0: 0 referencias al saludo viejo en app.js');
t(!APP.includes('pzApertura'), '§0: 0 referencias a pzApertura en app.js');
t(!SRV.includes('pzHoyTira'), '§0: server.js sin tocar por el lote (solo BUILD en el re-estampado)');

// ---------- Datos de prueba ----------
// 19:00 EST = 00:00 UTC del día siguiente. Ids reales de la cuenta de
// Valentino (user 12): el posteo de hoy es el 583.
const at19 = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 24)).toISOString(); };
const at20 = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 25)).toISOString(); };
const P = (id, extra) => Object.assign({ id, user_id: 12, image_path: '/media/' + id + '.jpg', caption: 'Posteo ' + id, hashtags: '', scheduled_at: null, published_at: null, status: 'scheduled', tipo: 'social', media_type: 'image', week_key: '2026-11-09', approval: 'pending', created_at: '2026-11-08 10:00:00' }, extra || {});
const HOY = P(583, { caption: 'El de hoy', scheduled_at: at19('2026-11-09'), status: 'scheduled', approval: 'pending' });
const HOY_PUB = P(583, { caption: 'El de hoy', scheduled_at: at19('2026-11-09'), published_at: at19('2026-11-09'), status: 'published', approval: 'approved' });
const MANANA = P(582, { caption: 'El de mañana', scheduled_at: at19('2026-11-10'), status: 'scheduled', approval: 'pending' });
const MIERCOLES = P(581, { caption: 'El miércoles', scheduled_at: at19('2026-11-11'), status: 'scheduled', approval: 'pending' });
const BORRADOR = P(584, { caption: 'Borrador sin fecha', scheduled_at: null, status: 'draft', approval: 'pending' });
const STORY = P(585, { caption: 'Historia de hoy', scheduled_at: at19('2026-11-09'), media_type: 'story', status: 'scheduled' });
const EXTRA = P(586, { caption: 'El extra', scheduled_at: at20('2026-11-09'), status: 'scheduled', approval: 'pending' });
const semPub = sb.pzHoySemana([HOY_PUB], TZ, new FakeDate());
const semVacia = sb.pzHoySemana([], TZ, new FakeDate());
t(semPub.n === 1 && semPub.lunes === '2026-11-09' && semPub.dias.length === 7 && semPub.dias[0].estado === 'pub',
  '§0: pzHoySemana real: lun 9/11 publicado, n=1', JSON.stringify(semPub));

// ---------- §1: tira de 7 días, una por una (regresión RS-2) ----------
console.log('— §1: tira (reveal)');
const tiraPub = sb.pzHoyTiraDias(semPub, [HOY_PUB, MANANA, MIERCOLES, BORRADOR, STORY], '2026-11-09', TZ);
t(tiraPub.length === 7, '§1: la tira tiene 7 días');
t(tiraPub[0].esHoy && tiraPub[0].revelado && tiraPub[0].post && tiraPub[0].post.id === 583,
  '§1: hoy (lun) revelado con su posteo publicado');
t(tiraPub[1].esManana && tiraPub[1].revelado && tiraPub[1].post && tiraPub[1].post.id === 582,
  '§1: mañana (mar) revelado apenas salió el de hoy, con su posteo');
t(tiraPub[2].post && tiraPub[2].post.id === 581 && !tiraPub[2].revelado,
  '§1: miércoles tiene posteo pero sigue bloqueado (futuro)');
t(!tiraPub.some((d) => d.post && d.post.id === 585), '§1: la historia NO va a la tira');
t(!tiraPub.some((d) => d.post && d.post.id === 584), '§1: el borrador sin fecha no ocupa ningún día');
const tiraPend = sb.pzHoyTiraDias(semVacia, [HOY, MANANA, MIERCOLES], '2026-11-09', TZ);
t(tiraPend[0].revelado && tiraPend[0].post && tiraPend[0].post.id === 583, '§1: hoy pendiente revelado (es hoy)');
t(!tiraPend[1].revelado && tiraPend[1].post && tiraPend[1].post.id === 582,
  '§1: mañana BLOQUEADO mientras el de hoy no sale');

// ---------- §2: la duplicada muere ----------
console.log('— §2: la duplicada muere');
const tiraOpts = (sel) => ({ en: false, tz: TZ, hoyKey: '2026-11-09', sel });
// Con la tarjeta principal arriba (inicioView pone PZ_HOY_POST_ID=583):
sb.PZ_HOY_POST_ID = '583';
const htmlPendHoy = sb.pzHoyTiraHTML(tiraPend, tiraOpts('2026-11-09'));
t((htmlPendHoy.match(/data-pz-hoy-tira-dia=/g) || []).length === 7, '§2: con la principal arriba, la tira sigue con 7 botones', htmlPendHoy.slice(0, 200));
t(htmlPendHoy.includes('pz-semana-dia today sel'), '§2: hoy pendiente lleva .today y .sel', htmlPendHoy.slice(0, 600));
t(!htmlPendHoy.includes('pz-hoy-tira-detalle'), '§2: el detalle de hoy NO se rinde (la duplicada muere)', htmlPendHoy.slice(htmlPendHoy.indexOf('pz-hoy-tira')));
t(!htmlPendHoy.includes('El de hoy'), '§2: el título del posteo de hoy NO aparece en la tira');
t(!htmlPendHoy.includes('sale en'), '§2: la cuenta NO aparece en la tira (vive en la principal)');
t(!htmlPendHoy.includes('Es el posteo de arriba'), '§2: la nota no aparece');
t(!htmlPendHoy.includes('19:00'), '§2: la hora 19:00 NO aparece en la tira (×0 ahí)');
// Sin el global (llamada directa, sin inicioView): el detalle se rinde
// como antes, pero SIN la nota (murió en todo el bundle).
sb.PZ_HOY_POST_ID = '';
const htmlPendFb = sb.pzHoyTiraHTML(tiraPend, tiraOpts('2026-11-09'));
t(htmlPendFb.includes('pz-hoy-tira-detalle') && htmlPendFb.includes('El de hoy') && htmlPendFb.includes('Hoy 19:00'),
  '§2: sin PZ_HOY_POST_ID, el detalle se rinde como antes (título + día/hora)', htmlPendFb.slice(htmlPendFb.indexOf('pz-hoy-tira-detalle')));
t(!htmlPendFb.includes('Es el posteo de arriba'), '§2: sin PZ_HOY_POST_ID, el detalle NO trae la nota (murió)');
// Hoy publicado: no hay tarjeta principal (hoyPostR1 no trae
// publicados), así que el detalle sigue con su Impulsar.
const htmlPub = sb.pzHoyTiraHTML(tiraPub, tiraOpts('2026-11-09'));
t(htmlPub.includes('El de hoy') && htmlPub.includes('Hoy 19:00'), '§2: el día publicado trae título + día/hora', htmlPub.slice(htmlPub.indexOf('pz-hoy-tira-detalle')));
t(htmlPub.includes('data-pz-boost-post="583"') && htmlPub.includes('Impulsar'), '§2: el día publicado trae botón Impulsar (contrato RS-4)');
t(!htmlPub.includes('Es el posteo de arriba'), '§2: el día publicado NO trae la nota');
// Mañana y los demás días siguen con su detalle (con la principal arriba).
sb.PZ_HOY_POST_ID = '583';
const htmlManana = sb.pzHoyTiraHTML(tiraPub, tiraOpts('2026-11-10'));
t(htmlManana.includes('El de mañana') && htmlManana.includes('Mañana 19:00') && htmlManana.includes('Se postea mañana') && htmlManana.includes('sale en'),
  '§2: el detalle de mañana sigue (título + día/hora + pill + cuenta)', htmlManana.slice(htmlManana.indexOf('pz-hoy-tira-detalle')));
const htmlFut = sb.pzHoyTiraHTML(tiraPend, tiraOpts('2026-11-11'));
t(htmlFut.includes('Todavía no hay posteo acá: los de la semana salen uno por uno, día por día.'),
  '§2: el día futuro bloqueado trae el mensaje del mock');
// Hoy vacío: la invitación al chat sigue (no hay duplicado que matar).
const htmlSinPost = sb.pzHoyTiraHTML(sb.pzHoyTiraDias(semVacia, [], '2026-11-09', TZ), tiraOpts('2026-11-09'));
t(htmlSinPost.includes('Hoy todavía no hay posteo') && htmlSinPost.includes('Abrir el chat'),
  '§2: hoy vacío trae invitación al chat');
// Dos posteos el mismo día (publicado 583 + programado 586): la
// principal es el programado (hoyPostR1 prefiere scheduled); el
// detalle del publicado sigue — la comparación es por id, no por día.
const tiraDos = sb.pzHoyTiraDias(semVacia, [HOY_PUB, EXTRA], '2026-11-09', TZ);
t(tiraDos[0].post && tiraDos[0].post.id === 583, '§2: con publicado + programado hoy, la tira prefiere el publicado');
sb.PZ_HOY_POST_ID = '586';
const htmlDos = sb.pzHoyTiraHTML(tiraDos, tiraOpts('2026-11-09'));
t(htmlDos.includes('El de hoy') && htmlDos.includes('data-pz-boost-post="583"') && !htmlDos.includes('El extra'),
  '§2: con la principal = 586, el detalle del publicado 583 sigue (+ Impulsar), sin mostrar el 586', htmlDos.slice(htmlDos.indexOf('pz-hoy-tira-detalle')));
sb.PZ_HOY_POST_ID = '';

// ---------- §3: la tarjeta principal ----------
console.log('— §3: la tarjeta principal');
setNow('2026-11-09T16:50:00.000Z'); // lun 9/11 11:50 EST — la hora de la captura de Valentino
const main = sb.pzHoyHoyHTML(HOY, { en: false, tz: TZ });
t(main.includes('EL POSTEO DE HOY'), '§3: la principal lleva su cabecera', main.slice(0, 300));
t(main.includes('hoy · 19:00'), '§3: la principal lleva el pill «hoy · 19:00»', main.slice(0, 400));
t(main.includes('data-pz-cuenta-sale="2026-11-10T00:00:00.000Z"'), '§3: la cuenta es un span propio con data-pz-cuenta-sale (el tick la actualiza)', main.slice(0, 600));
t(main.includes('sale en 7 h 10 min'), '§3: a las 11:50 EST la cuenta dice «sale en 7 h 10 min» (como la captura)', main.slice(0, 600));
t(!main.includes('class="pz-hoy-when"'), '§3: SIN el badge «Hoy 19:00» sobre la foto (el data-pz-hoy-when del botón «Dale» es metadata, no badge)');
t(main.includes('data-pz-hoy-when="2026-11-10T00:00:00.000Z"'), '§3: el botón «Dale» sigue llevando su data-pz-hoy-when (metadata del flujo aprobar)');
t(!main.includes('Hoy 19:00'), '§3: sin «Hoy 19:00» en la principal');
t((main.match(/19:00/g) || []).length === 1, '§3: la hora 19:00 aparece UNA sola vez en la tarjeta principal', main);
t((main.match(/sale en/g) || []).length === 1, '§3: «sale en» aparece UNA sola vez en la principal');
const mainDraft = sb.pzHoyHoyHTML(BORRADOR, { en: false, tz: TZ });
t(!mainDraft.includes('data-pz-cuenta-sale') && !mainDraft.includes('sale en'),
  '§3: el borrador sin fecha NO rinde cuenta');
t(mainDraft.includes('hoy') && !mainDraft.includes('19:00'), '§3: el borrador lleva el pill «hoy» sin hora');
const HOY_PUB_PASADO = P(583, { caption: 'El de hoy', scheduled_at: at19('2026-11-08'), published_at: at19('2026-11-08'), status: 'published', approval: 'approved' });
const mainPub = sb.pzHoyHoyHTML(HOY_PUB_PASADO, { en: false, tz: TZ });
t(!mainPub.includes('data-pz-cuenta-sale') && !mainPub.includes('sale en'),
  '§3: el publicado con fecha vencida NO rinde cuenta (gracia: pzHoyHoyHTML nunca lo recibe, hoyPostR1 no trae publicados)');
const mainEn = sb.pzHoyHoyHTML(HOY, { en: true, tz: TZ });
t(mainEn.includes('TODAY\u2019S POST') && mainEn.includes('today · 07:00 PM') && mainEn.includes('goes out in 7 h 10 min'),
  '§3: EN: «today · 07:00 PM» + «goes out in 7 h 10 min»', mainEn.slice(0, 500));
t(!mainEn.includes('class="pz-hoy-when"') && (mainEn.match(/07:00 PM/g) || []).length === 1,
  '§3: EN: sin badge, la hora UNA sola vez');
setNow('2026-11-09T15:00:00.000Z'); // vuelta a las 10:00 EST
const main10 = sb.pzHoyHoyHTML(HOY, { en: false, tz: TZ });
t(main10.includes('sale en 9 h 00 min'), '§3: a las 10:00 EST la cuenta dice «sale en 9 h 00 min»');

// ---------- §4: Hoy compuesta ----------
console.log('— §4: Hoy compuesta');
sb.PZ_HOY_POST_ID = '583';
const speechMan = sb.pzHoySpeechHTML({ hoyPost: HOY, pendientes: 1, haySemana: true, manual: true, needOK: 1, schedSolo: 0, en: false, tz: TZ });
t(speechMan.includes('sale cuando vos lo aprobás'), '§4: el saludo manual sigue (cuenta manual de Valentino)', speechMan);
const comp = speechMan
  + sb.pzHoyHoyHTML(HOY, { en: false, tz: TZ })
  + sb.pzHoyTiraHTML(tiraPend, tiraOpts('2026-11-09'))
  + sb.pzHoySemanaInsightHTML(semVacia, false, 0);
t((comp.match(/pz-hoy-hoy"/g) || []).length === 1, '§4: UNA sola tarjeta principal', comp.slice(0, 200));
t(!comp.includes('pz-hoy-tira-detalle'), '§4: ningún detalle duplicado en Hoy');
const compCards = sb.pzHoyHoyHTML(HOY, { en: false, tz: TZ })
  + sb.pzHoyTiraHTML(tiraPend, tiraOpts('2026-11-09'))
  + sb.pzHoySemanaInsightHTML(semVacia, false, 0);
t((compCards.match(/19:00/g) || []).length === 1, '§4: en la zona de tarjetas, «19:00» ×1', compCards);
t((compCards.match(/sale en/g) || []).length === 1, '§4: en la zona de tarjetas, «sale en» ×1');
t(compCards.includes('Tu semana recién arranca') && compCards.includes('Abrir el chat'),
  '§4: «Tu semana recién arranca» sigue después de la tira, con su botón al chat');
// La prosa del saludo menciona la hora una vez más («El de hoy sale a
// las 19:00…»): en toda la pantalla compuesta «19:00» ×2. Se pincha
// aquí para que el número no se esconda: si Valentino quiere ×1
// literal, el saludo es otro lote, no este.
t((comp.match(/19:00/g) || []).length === 2 && speechMan.includes('a las 19:00'),
  '§4: en toda la pantalla, «19:00» ×2 (tarjeta + frase del saludo)', comp.slice(0, 400));
sb.PZ_HOY_POST_ID = '';

// ---------- §5: auditoría M78 ----------
console.log('— §5: auditoría M78');
const CALLS = [
  'pzHoyTiraDias', 'pzHoyTiraHTML', 'pzHoyTiraDetalleHTML', 'pzHoyTiraBind',
  'pzHoyParaAprobarHTML', 'pzHoySemanaInsightHTML', 'pzHoySpeechHTML',
  'pzHoyHoyHTML', 'pzHoyCardHTML', 'pzHoyPendientes', 'pzHoySemana',
  'pzHoyPostDiaKey', 'pzHoyMoverKey', 'pzHoySaludoTxt', 'pzHoyHoraCorta',
  'pzHoyCuandoCorto', 'pzHoyPillSalida', 'pzHoyCuentaSaleTxt',
  'pzRitualCuentaTxt', 'pzIc', 'f3ApprovalMode',
  'pzBoostOpenById', 'pzHoyConserjeHTML', 'pzHoyAprobarUno', 'pzHoyCambiar',
];
for (const f of CALLS) {
  t(new RegExp('function ' + f + '\\s*\\(').test(APP), '§5: ' + f + ' definida en app.js');
}
// Auditoría por programa sobre las funciones TOCADAS por el lote: cada
// nombre pz*/hf* que llaman (fuera de comentarios/strings) existe
// definido en el bundle o es global del sandbox (esc, mv, window).
const isDef = (n) => new RegExp('function ' + n + '\\s*\\(').test(APP)
  || new RegExp('window\\.' + n + '\\s*=').test(APP)
  || ['esc', 'mv', 'String', 'Number', 'Math', 'Date', 'JSON', 'Intl'].includes(n);
let audN = 0, audOk = 0;
for (const fn of ['pzHoyHoyHTML', 'pzHoyTiraDetalleHTML', 'pzHoyCardHTML']) {
  const src = extractFunc(fn).replace(/\/\/[^\n]*/g, '').replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\])*'/g, "''");
  const cands = [...new Set(src.match(/\b(pz[A-Za-z0-9_$]*|hf[A-Za-z0-9_$]*|esc|mv)\s*\(/g) || [])]
    .map((s) => s.replace(/\s*\($/, ''))
    .filter((n) => n !== fn);
  for (const c of cands) {
    audN++;
    if (isDef(c)) audOk++;
    else t(false, '§5: ' + fn + ' llama a ' + c + ' pero NO está definida', c);
  }
}
t(audN > 0 && audOk === audN, `§5: funciones auditadas: ${audOk}/${audN} (todo lo que las funciones tocadas llaman existe)`, `${audOk}/${audN}`);
// La cuenta NO es función nueva: ya la llamaba el detalle (línea 21172
// en v844) y la cartita; el lote solo la llama desde la principal.
t(APP.includes('function pzHoyCuentaSaleTxt('), '§5: pzHoyCuentaSaleTxt ya existía (no es función nueva del lote)');

// ---------- §6: boot ----------
console.log('— §6: boot');
const PORT = 34593;
const SECRET = 'lote-hoy-sin-duplicado-secret';
const TOKEN = 'boot-test-token-hsd';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoy-sin-duplicado-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(sid, method, p, body, token) {
  const url = `http://127.0.0.1:${PORT}${p}${token ? (p.includes('?') ? '&' : '?') + 'token=' + token : ''}`;
  const r = await fetch(url, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
async function apiText(p) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`);
  return { status: r.status, text: await r.text() };
}
(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-admin-hsd',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'sk-test-hsd',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, '§6: el servidor levanta con el lote (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await api('x', 'GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v848',
      '§6: /api/version trae el BUILD v848 (estampado)', JSON.stringify(ver.json));
    const appJs = await apiText('/app.js?v=999');
    t(appJs.status === 200 && appJs.text.includes('PZ_HOY_POST_ID') && appJs.text.includes('sinCuando')
      && appJs.text.includes('pzHoyCuentaSaleTxt'),
      '§6: el app.js servido trae el cableado del lote (PZ_HOY_POST_ID + sinCuando)');
    t(appJs.status === 200 && !appJs.text.includes('Es el posteo de arriba'),
      '§6: el app.js servido NO trae la nota');
    t(appJs.status === 200 && !appJs.text.includes('Sin tu OK, no sale nada'),
      '§6: el app.js servido NO trae el saludo viejo');
    t(md5(appJs.text) === md5(APP), '§6: el app.js servido es el del árbol (md5 igual)');
    const css = await apiText('/styles.css?v=999');
    t(css.status === 200 && css.text.includes('.pz-hoy-hoy-right') && !css.text.includes('note-line'),
      '§6: el styles.css servido trae la cabecera nueva y sin .note-line');
    t(md5(css.text) === md5(CSS), '§6: el styles.css servido es el del árbol (md5 igual)');
  } catch (e) {
    t(false, '§6: boot', e.message);
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nHOY-SIN-DUPLICADO: ${okN} ok, ${badN} fallos`);
  process.exit(badN ? 1 : 0);
})();
