'use strict';
/* test-lote-rediseno-r1.js — LOTE REDISEÑO R1 · HOY (base v793).
 * Decisión Valentino 8/11 00:07 (mock posty-app-design = nuevo diseño del
 * TestFlight, con el motor real adentro) + tablero §5.5 (paralelo con
 * re-base por lote) + directiva 8/11 01:56 / tablero 01:57 (cero botones
 * muertos). Spec: PLAN-REDISENO-MOCK.md §1.1 (Hoy) y §4 fila R1.
 * Cubre, con el código real extraído de public/app.js (bloque HOY-R1 +
 * bloque HOME_FEED + bloque RITUAL) y un DOM falso mínimo, con reloj
 * mutable, y con boot aislado (DB temporal, sin tocar producción):
 *  A) semana de un vistazo: anillo N/7 + tira LUN–DOM con posteos
 *     PUBLICADOS reales de la semana (de la DB, no del mock);
 *  B) «Por aprobar»: pendientes (borradores de la semana + programados
 *     pendientes) ordenados por salida; la cartita (mañana) primera;
 *  C) cartita SIN VELO (decisión 8/11 00:05, SUPERSEDE el destape
 *     «a las 00:00» del 6/11 SOLO para el posteo de un día futuro):
 *     el posteo de mañana visible, pill «Se postea mañana · HH:MM»,
 *     cuenta hasta que SALE (no hasta un destape); el de HOY sigue
 *     velado hasta elegir en el ritual (no-regresión);
 *  D) hoja «Subir foto o video» (Cámara/Galería → selector del chat,
 *     misma subida v784) con fila del álbum real;
 *  E) mensaje de Posty → chat; entrada al conserje con contador
 *     «X de N revisados» (solo con token de admin);
 *  F) auditoría M78: todo lo que las tarjetas/botones nuevos llaman
 *     existe definido en el bundle;
 *  G) boot: endpoints reales (approve de un posteo, accept de un
 *     borrador, /api/album, revisión del conserje) con datos reales.
 * En el árbol prístino v793 los tests nuevos deben FALLAR (cazan el
 * cambio). Uso: node test-lote-rediseno-r1.js — sale 0 si todo pasa.
 *   R1_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.env.R1_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Hoy real del lote: domingo 8/11/2026. Semana: lun 2/11 – dom 8/11.
let NOW_MS = Date.parse('2026-11-08T15:00:00.000Z'); // dom 8/11 10:00 EST
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
class Cell {
  constructor(html, grid) {
    this.html = html;
    this.grid = grid || null;
    this.removed = false;
  }
  tileClasses() {
    const m = /<(?:span|button)[^>]*class="([^"]*hf-tile[^"]*)"/.exec(this.html);
    return m ? m[1].split(/\s+/) : [];
  }
  postId() {
    const m = /data-post-id="([^"]+)"/.exec(this.html);
    return m ? m[1] : null;
  }
  hasOculta() { return this.tileClasses().includes('hf-carta-oculta'); }
  hasMagia() { return this.tileClasses().includes('hf-carta-magia'); }
  closest(sel) { return sel === '.hf-cell' ? this : null; }
  remove() {
    this.removed = true;
    if (this.grid) this.grid.drop(this);
  }
  set outerHTML(h) { this.html = h; }
  get outerHTML() { return this.html; }
}
class Grid {
  constructor() { this.cells = []; }
  live() { return this.cells.filter((c) => !c.removed); }
  drop(cell) { const i = this.cells.indexOf(cell); if (i >= 0) this.cells.splice(i, 1); }
  querySelector(sel) {
    const live = this.live();
    if (sel === '.hf-tile.pub') return live.find((c) => c.tileClasses().includes('pub')) || null;
    if (sel === '.hf-tile.hf-carta-magia') return live.find((c) => c.hasMagia()) || null;
    const m = /^\.hf-tile\[data-post-id="(.+)"\]$/.exec(sel);
    if (m) return live.find((c) => c.postId() === m[1]) || null;
    return null;
  }
  querySelectorAll() { return []; }
}
class Root {
  constructor(grid) { this.grid = grid; }
  querySelector(sel) {
    if (sel === '.hf-grid') return this.grid;
    return this.grid.querySelector(sel);
  }
  querySelectorAll() { return []; }
}

// ---------- Sandbox ----------
const lsStore = new Map();
const store = new Map();
const grid = new Grid();
const root = new Root(grid);
const PROF = { posts_count: 12, followers: 8, following: 1, recents: [] };
const localStorageStub = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => { lsStore.set(k, String(v)); },
  removeItem: (k) => { lsStore.delete(k); },
  clear: () => { lsStore.clear(); },
};
const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  Date: FakeDate, Math, JSON, Intl, Map, Set,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pzIc: () => '',
  pcTz: () => 'America/New_York',
  pcParseDate: (s0) => { const s = String(s0 || '').replace(' ', 'T'); if (!s) return null; const x = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; const d = new FakeDate(x); return isNaN(d) ? null : d; },
  schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
  slotHour: () => 17,
  ME: { lang: 'es' },
  document: {
    hidden: false,
    activeElement: null,
    body: { appendChild: () => {} },
    getElementById: (id) => (id === 'inicioView' ? root : null),
    querySelector: (sel) => grid.querySelector(sel),
    querySelectorAll: () => [],
    createElement: (tag) => new El(tag),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {}, scrollTo: () => {} },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  localStorage: localStorageStub,
  sessionStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  },
  pzSonido: () => {},
  pzSemanaAprobadaSync: () => {},
  hfFeedGesturesBind: () => {},
  bindScfMinis: () => {},
  hfDurBind: () => {},
  hfIsEn: () => false,
  hfLiveTick: () => {},
  HF_VISITOR: false,
  HF_LIVE: { started: false, busy: false, lastFetch: 0, snap: null, pending: null, justPub: new Set() },
  HF_CUR_PROF: PROF,
  HOME_PROF: PROF,
  HF_PROPS: {},
  HF_TILES: [],
};
vm.createContext(sb);

// ---------- Carga de bloques reales ----------
console.log('— §0: bloques');
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
t(a > 0 && b > a, '§0: bloque HOME_FEED delimitado en app.js');
vm.runInContext(APP.slice(a, b), sb);
const ra = APP.indexOf('/* ===== RITUAL DE LA MAÑANA');
const rb = APP.indexOf('/* ===== TIRA DE NIVEL POSTY', ra);
t(ra > 0 && rb > ra, '§0: bloque RITUAL delimitado en app.js');
vm.runInContext(APP.slice(ra, rb), sb);
const h1 = APP.indexOf('/* ===== LOTE REDISEÑO R1 · HOY');
const h2 = APP.indexOf('async function inicioView() {', h1);
t(h1 > 0 && h2 > h1, '§0: bloque HOY-R1 delimitado en app.js');
vm.runInContext(APP.slice(h1, h2), sb);
t(typeof sb.homeGridCompose === 'function' && typeof sb.homeTileHTML === 'function'
  && typeof sb.pzRitualCuentaTxt === 'function' && typeof sb.pzHoySemana === 'function'
  && typeof sb.pzHoyPendientes === 'function' && typeof sb.pzHoyCardHTML === 'function'
  && typeof sb.pzHoySpeechHTML === 'function' && typeof sb.pzHoyUploadHTML === 'function'
  && typeof sb.pzHoySemanaHTML === 'function' && typeof sb.pzHoyPillSalida === 'function'
  && typeof sb.pzHoySaludoTxt === 'function' && typeof sb.pzHoySetView === 'function'
  && typeof sb.pzHoyBind === 'function' && typeof sb.pzHoyAprobarUno === 'function',
  '§0: HOME_FEED + RITUAL + HOY-R1 cargan en el sandbox');
// Rojo-primero: sin el bloque HOY-R1 no hay nada que probar — se sale
// con 1 y mensaje claro en vez de reventar en el primer uso.
if (h1 < 0 || typeof sb.pzHoySemana !== 'function') {
  console.log('\nRED: el árbol ' + TREE + ' no trae el lote R1 (bloque HOY-R1 ausente)');
  console.log(`${okN} ok, ${badN} mal`);
  process.exit(1);
}

// ---------- Fixtures ----------
// Semana lun 2/11 – dom 8/11/2026 (hoy = dom 8/11, 10:00 EST).
// Publicados: lun 2, mar 3, mié 4, vie 6 (4 días). Hoy dom 8 sin salir.
// Programados: hoy dom 8 19:30 EST (lunes 9/11 00:30Z), mañana lun 9 19:00 EST.
const pub = (id, ymd) => ({ id, status: 'published', media_type: 'image', image_path: '/m/' + id + '.jpg', caption: 'Publicado ' + id, published_at: ymd + 'T22:00:00.000Z', scheduled_at: ymd + 'T22:00:00.000Z', pinned: 0, approval: 'approved' });
const PUBL = [pub(601, '2026-11-02'), pub(602, '2026-11-03'), pub(603, '2026-11-04'), pub(604, '2026-11-06')];
const HOY_POST = { id: 610, status: 'scheduled', media_type: 'image', image_path: '/m/610.jpg', caption: 'El posteo de hoy sale con todo', scheduled_at: '2026-11-09T00:30:00.000Z', pinned: 0, approval: 'pending', created_at: '2026-11-08T10:00:00.000Z', week_key: '2026-11-02' }; // creado HOY 05:00 EST (después de medianoche → velado hasta el ritual)
const MANANA_POST = { id: 611, status: 'scheduled', media_type: 'image', image_path: '/m/611.jpg', caption: 'Mañana sale esto, miralo', scheduled_at: '2026-11-10T00:00:00.000Z', pinned: 0, approval: 'pending', created_at: '2026-11-07T15:00:00.000Z', week_key: '2026-11-02' };
const MANANA_APROB = Object.assign({}, MANANA_POST, { id: 612, approval: 'approved' });
const DRAFT = { id: 613, status: 'draft', media_type: 'image', image_path: '/m/613.jpg', caption: 'Borrador de la semana', scheduled_at: null, pinned: 0, approval: 'pending', created_at: '2026-11-07T15:00:00.000Z', week_key: '2026-11-02' };
const DRAFT_VIEJO = Object.assign({}, DRAFT, { id: 614, week_key: '2026-10-26' });
const PASADO_PEND = { id: 615, status: 'scheduled', media_type: 'image', image_path: '/m/615.jpg', caption: 'Ayer quedó pendiente', scheduled_at: '2026-11-08T00:30:00.000Z', pinned: 0, approval: 'pending', created_at: '2026-11-06T15:00:00.000Z', week_key: '2026-11-02' };
const HISTORIA = { id: 616, status: 'scheduled', media_type: 'story', image_path: '/m/616.jpg', caption: 'Historia', scheduled_at: '2026-11-10T00:00:00.000Z', pinned: 0, approval: 'pending', week_key: '2026-11-02' };
const MANANA_FIJADO = Object.assign({}, MANANA_POST, { id: 617, pinned: 1 });
const RIT_PEND = { tieneHoy: true, yaElegido: false };
const RIT_ELEG = { tieneHoy: true, yaElegido: true };
function compose(upcoming, published, ritual) {
  return sb.homeGridCompose({ upcoming, published, recents: [], ritual: (ritual === undefined ? null : ritual) });
}

// ---------- §1: semana de un vistazo (datos reales de publicados) ----------
console.log('— §1: semana');
setNow('2026-11-08T15:00:00.000Z'); // dom 8/11 10:00 EST
const sem = sb.pzHoySemana(PUBL, 'America/New_York', new FakeDate());
t(sem.n === 4 && sem.lunes === '2026-11-02', '§1: 4 días publicados de la semana lun 2/11');
t(sem.dias.map((d) => d.estado).join(',') === 'pub,pub,pub,vacio,pub,vacio,hoy',
  '§1: tira LUN–DOM: lun/mar/mié pub, jue vacío, vie pub, sáb vacío, dom hoy');
const semHoy = sb.pzHoySemana(PUBL.concat([pub(605, '2026-11-08')]), 'America/New_York', new FakeDate());
t(semHoy.n === 5 && semHoy.dias[6].estado === 'pub', '§1: publicado hoy suma un día (5/7)');
const semVacia = sb.pzHoySemana([], 'America/New_York', new FakeDate());
t(semVacia.n === 0 && semVacia.dias[6].estado === 'hoy' && semVacia.dias[0].estado === 'vacio',
  '§1: semana vacía: 0/7, hoy marcado, resto vacío');
const semHtml = sb.pzHoySemanaHTML(sem, false);
t(semHtml.includes('4/7') && semHtml.includes('pz-hoy-ring') && semHtml.includes('pz-hoy-dias')
  && /LUN|MAR|MIÉ/.test(semHtml) && semHtml.includes('Tu semana viene en camino'),
  '§1: HTML del anillo: 4/7, días LUN–DOM, título honesto con 4 días');
t(sb.pzHoySemanaHTML(semVacia, false).includes('0/7')
  && sb.pzHoySemanaHTML(semVacia, false).includes('Todavía no salió nada esta semana'),
  '§1: semana vacía no inventa logros (copy honesto)');

// ---------- §2: «Por aprobar» (orden + cartita primera, sin duplicar) ----------
console.log('— §2: por aprobar');
const pend = sb.pzHoyPendientes([MANANA_POST, HOY_POST, DRAFT, DRAFT_VIEJO, PASADO_PEND, HISTORIA, MANANA_FIJADO], '2026-11-08', '2026-11-09', '2026-11-02', 'America/New_York');
t(pend.cartita && pend.cartita.id === 611, '§2: la cartita es el posteo de mañana (el más cercano, no fijado, no historia)');
t(pend.resto.map((p) => p.id).join(',') === '610,617,613',
  '§2: resto = hoy (610) + fijado de mañana (617) + borrador de la semana (613, sin fecha va último)');
t(pend.total === 4, '§2: total = cartita + 3 (borrador viejo, historia y posteo pasado quedan fuera)');
t(!pend.resto.some((p) => p.id === 611), '§2: la cartita no se duplica en el resto');
const pendAprob = sb.pzHoyPendientes([MANANA_APROB, HOY_POST], '2026-11-08', '2026-11-09', '2026-11-02', 'America/New_York');
t(pendAprob.cartita && pendAprob.cartita.id === 612 && pendAprob.total === 1 && pendAprob.resto.length === 1,
  '§2: cartita aprobada sigue primera (visible) y no suma a «por aprobar»');

// ---------- §3: saludo, pill de salida, cuenta ----------
console.log('— §3: saludo / pill / cuenta');
t(sb.pzHoySaludoTxt(new FakeDate(2026, 10, 8, 8, 0, 0), false) === '¡Buen día! ☀️',
  '§3: saludo 08:00 local = «¡Buen día!»');
t(sb.pzHoySaludoTxt(new FakeDate(2026, 10, 8, 15, 0, 0), false) === '¡Buenas tardes! 🌤️',
  '§3: saludo 15:00 local = «¡Buenas tardes!»');
t(sb.pzHoySaludoTxt(new FakeDate(2026, 10, 8, 22, 0, 0), true) === 'Good evening! 🌙',
  '§3: saludo 22:00 local en inglés = «Good evening!»');
t(sb.pzHoyPillSalida(MANANA_POST, 'America/New_York', false) === 'Se postea mañana · 19:00',
  '§3: pill de la cartita = «Se postea mañana · 19:00»');
t(sb.pzHoyPillSalida(HOY_POST, 'America/New_York', false) === 'Se postea hoy · 19:30',
  '§3: pill de hoy = «Se postea hoy · 19:30»');
t(sb.pzHoyPillSalida(MANANA_POST, 'America/New_York', true) === 'Goes out tomorrow · 07:00 PM',
  '§3: pill en inglés = «Goes out tomorrow · 07:00 PM»');
const en3 = { id: 620, scheduled_at: '2026-11-12T00:00:00.000Z' };
t(sb.pzHoyPillSalida(en3, 'America/New_York', false) === 'Se postea en 3 días · 19:00',
  '§3: pill a 3 días = «Se postea en 3 días · 19:00»');
const cuenta = sb.pzHoyCuentaSaleTxt(MANANA_POST.scheduled_at, false);
t(cuenta.includes('sale en') && cuenta.includes('h'), '§3: cuenta hasta que SALE: «sale en …» (no «para ver»)');
t(sb.pzHoyCuentaSaleTxt('2026-11-08T15:00:00.000Z', false) === '', '§3: cuenta vencida = vacío');

// ---------- §4: tarjetas / mensaje / subida ----------
console.log('— §4: tarjetas');
const cardMan = sb.pzHoyCardHTML(MANANA_POST, { cartita: true, en: false, tz: 'America/New_York' });
t(cardMan.includes('Se postea mañana · 19:00') && cardMan.includes('data-pz-cuenta-sale="2026-11-10T00:00:00.000Z"')
  && cardMan.includes('Dale, publicalo') && cardMan.includes('Cambialo')
  && !cardMan.includes('Se destapa') && !cardMan.includes('hf-carta-velo')
  && !cardMan.includes('Se destapa a las'), '§4: cartita abierta: pill, cuenta de salida, Dale/Cambialo, sin velo ni destape');
t(cardMan.includes('data-pz-hoy-aprobar="611"') && cardMan.includes('data-pz-hoy-cambiar="611"')
  && cardMan.includes('data-pz-hoy-detalle="611"'), '§4: la cartita lleva sus data attrs (aprobar, cambiar, detalle)');
const cardAprob = sb.pzHoyCardHTML(MANANA_APROB, { cartita: true, en: false, tz: 'America/New_York' });
t(cardAprob.includes('Posty también lo sube como historia') && !cardAprob.includes('data-pz-hoy-aprobar'),
  '§4: cartita aprobada muestra la nota «✓ … Posty también lo sube como historia» y no repite el botón Dale');
const cardDraft = sb.pzHoyCardHTML(DRAFT, { cartita: false, en: false, tz: 'America/New_York' });
t(cardDraft.includes('Borrador') && cardDraft.includes('data-pz-hoy-aprobar="613"')
  && cardDraft.includes('data-pz-hoy-when') && cardDraft.includes('Cambialo'),
  '§4: borrador: chip Borrador, Dale con fecha propuesta, Cambialo');
const cardSinFoto = sb.pzHoyCardHTML({ id: 621, status: 'scheduled', media_type: 'image', image_path: '', caption: 'Sin foto todavía', scheduled_at: '2026-11-10T00:00:00.000Z', pinned: 0, approval: 'pending' }, { cartita: false, en: false, tz: 'America/New_York' });
t(!cardSinFoto.includes('<img') && cardSinFoto.includes('Dale, publicalo'),
  '§4: sin foto no hay bloque de color ni <img> (y la tarjeta sigue funcionando)');
const speech = sb.pzHoySpeechHTML({ hoyPost: HOY_POST, en: false, tz: 'America/New_York' });
t(speech.includes('El de hoy sale a las 19:30') && speech.includes('¿Lo largamos?') && speech.includes('data-pz-hoy-chat'),
  '§4: mensaje con el posteo de hoy: hora real 19:30 y entrada al chat');
const speechSin = sb.pzHoySpeechHTML({ hoyPost: null, en: false, tz: 'America/New_York' });
t(!speechSin.includes('19:30') && speechSin.includes('¿Armamos tu semana?'),
  '§4: sin posteo de hoy no se inventa hora (el mensaje no miente)');
const upHtml = sb.pzHoyUploadHTML([{ id: 1, path: '/m/1.jpg' }, { id: 2, path: '/m/2.jpg' }], false);
t(upHtml.includes('Subir foto o video') && upHtml.includes('data-pz-hoy-subir') && upHtml.includes('/m/1.jpg')
  && upHtml.includes('pz-hoy-album') && upHtml.includes('TU ÁLBUM'),
  '§4: subida: botón + fila del álbum real (fotos del /api/album)');
t(sb.pzHoyUploadHTML([], false).includes('TU ÁLBUM') && !sb.pzHoyUploadHTML([], false).includes('<img'),
  '§4: álbum vacío: fila con «+» y sin fotos inventadas');
const conHtml = sb.pzHoyConserjeHTML(2, 3, false);
t(conHtml.includes('2 de 3 revisados') && conHtml.includes('data-pz-hoy-conserje'),
  '§4: conserje: contador «2 de 3 revisados» + entrada real');

// ---------- §5: grilla — cartita de mañana ABIERTA, la de hoy velada ----------
console.log('— §5: grilla');
setNow('2026-11-08T15:00:00.000Z'); // dom 8/11 10:00 EST (antes de las 17:00)
const tilesFut = compose([{ p: MANANA_POST, ymd: '2026-11-09' }], [PUBL[3], PUBL[2]], RIT_PEND);
t(tilesFut.length >= 1 && tilesFut[0].kind === 'oculta' && tilesFut[0].post.id === 611
  && tilesFut[0].openHoy === true && tilesFut[0].futuro === true,
  '§5: el posteo de mañana compone como oculta ABIERTA (openHoy + futuro), primera');
const htmlFut = sb.homeTileHTML(tilesFut[0], 0);
t(htmlFut.includes('Se postea mañana') && htmlFut.includes('data-pz-cuenta-sale="2026-11-10T00:00:00.000Z"')
  && htmlFut.includes('<img') && htmlFut.includes('data-post-id="611"')
  && !htmlFut.includes('hf-carta-velo') && !htmlFut.includes('Se destapa')
  && !htmlFut.includes('data-pz-cuenta-abre'),
  '§5: la cartita de mañana se VE (foto, pill, cuenta de salida) — sin velo, sin destape, sin cuenta de apertura');
const tilesHoy = compose([{ p: HOY_POST, ymd: '2026-11-08' }, { p: MANANA_POST, ymd: '2026-11-09' }], PUBL, RIT_PEND);
t(tilesHoy[0].kind === 'oculta' && tilesHoy[0].post.id === 610 && tilesHoy[0].openHoy === false,
  '§5 (no-regresión): el posteo de HOY sin elegir sigue velado (ritual intacto)');
const htmlHoy = sb.homeTileHTML(tilesHoy[0], 0);
t(htmlHoy.includes('hf-carta-velo') && htmlHoy.includes('Posty lo está cuidando')
  && !htmlHoy.includes('data-post-id') && !htmlHoy.includes('data-pz-cuenta-sale'),
  '§5 (no-regresión): la carta de hoy sigue velada (velo + «Posty lo está cuidando», sin foto ni cuenta de salida)');
const tilesEleg = compose([{ p: HOY_POST, ymd: '2026-11-08' }, { p: MANANA_POST, ymd: '2026-11-09' }], PUBL, RIT_ELEG);
t(tilesEleg[0].kind === 'oculta' && tilesEleg[0].post.id === 610 && tilesEleg[0].openHoy === true,
  '§5: con el ritual elegido, la carta de hoy se abre (la puerta de las 9:00 intacta)');
t(sb.pzProximoYaAbierto(MANANA_POST, Date.parse('2026-11-09T05:30:00.000Z'), 'America/New_York') === true,
  '§5: pzProximoYaAbierto intacto (medianoche del día del posteo)');

// ---------- §6: inicioView + CSS (cableado estático) ----------
console.log('— §6: inicioView / CSS');
const ivStart = APP.indexOf('async function inicioView() {');
const ivNext = APP.slice(ivStart + 10).match(/\n(?:async )?function [a-zA-Z0-9_]+\(/);
const ivEnd = ivStart + 10 + (ivNext ? ivNext.index : APP.length);
const ivSrc = APP.slice(ivStart, ivEnd);
t(ivSrc.includes("api.get('/api/album')") && ivSrc.includes('hoyAprobarHTML') && ivSrc.includes('hoySegHTML') && ivSrc.includes('#/app/feed')
  && ivSrc.includes('pzHoySubirSheet') && ivSrc.includes('data-pz-hoy-view') && ivSrc.includes('pzHoyConserjeHTML'),
  '§6: inicioView trae /api/album + secciones Hoy (seg + aprobar + hoja + conserje; «Mi feed» del seg es enlace a #/app/feed, RE-BASE v794)');
t(APP.includes('pzHoyBind(document.getElementById(\'inicioView\'))'),
  '§6: bindInicio cablea pzHoyBind en #inicioView');
t(APP.includes("if (t.openHoy && t.futuro)") && APP.includes('esFuturoR1'),
  '§6: homeGridCompose/homeTileHTML tienen la rama futura (esFuturoR1)');
t(APP.includes('data-pz-cuenta-sale') && APP.includes("document.querySelectorAll('[data-pz-cuenta-sale]')"),
  '§6: el tick de 1 s actualiza las cuentas de salida (hfCuentaAbreTick)');
['.pz-hoy-seg', '.pz-hoy-speech', '.pz-hoy-upload', '.pz-hoy-ring', '.pz-hoy-card', '.pz-hoy-sheet', '.pz-hoy-cuenta', '.pz-hoy-conserje'].forEach((c) => {
  t(CSS.includes(c), '§6: styles.css trae ' + c);
});
t(CSS.includes('#pzHoyAprobar[hidden]')
  && CSS.includes('#pzHoySubirSheet[hidden]'), '§6: CSS esconde las secciones/hoja con [hidden]');

// ---------- §7: auditoría M78 ----------
console.log('— §7: M78 funciones auditadas');
const nuevas = ['pzHoySaludoTxt', 'pzHoySemana', 'pzHoyPendientes', 'pzHoyPillSalida', 'pzHoyCuentaSaleTxt',
  'pzHoyCardHTML', 'pzHoySpeechHTML', 'pzHoyUploadHTML', 'pzHoySemanaHTML', 'pzHoyConserjeHTML',
  'pzHoySetView', 'pzHoySubirAbrir', 'pzHoySubirCerrar', 'pzHoySubirCamara', 'pzHoySubirGaleria',
  'pzHoyAprobarUno', 'pzHoyCambiar', 'pzHoyConserjeFill', 'pzHoyBind'];
t(nuevas.every((f) => APP.includes('function ' + f)),
  '§7: las 19 funciones nuevas de Hoy existen definidas en el bundle');
const llamadas = ['pzHoySetView', 'pzHoyAprobarUno', 'pzHoyCambiar', 'pzHoySubirAbrir', 'pzHoySubirCamara',
  'pzHoySubirGaleria', 'pzHoySubirCerrar', 'pzHoyConserjeFill', 'hfOpenChatForPost', 'bbGo',
  'f3ApprovalMode', 'igGateFeedback', 'pzSftChatAbrirYEnfocar', 'render', 'toast',
  'proposedLabelFor', 'pzRitualCuentaTxt', 'pzWhenRelDay', 'hfChipText', 'pcParseDate',
  'schedDayKeyOf', 'albumMondayKey', 'pzProximoYaAbierto', 'pzDiaInicioMs'];
t(llamadas.every((f) => APP.includes('function ' + f)),
  '§7: toda función llamada desde los caminos nuevos de Hoy existe definida (24/24 — corrección del preparador: el array trae 24, no 25)');
t(APP.split('Se destapa a las <b>00:00</b>').length === 2,
  '§7: «Se destapa a las 00:00» queda UNA sola vez en el bundle (rama velada de futuro, hoy inalcanzable)');
t(SRV.includes("app.post('/api/posts/:id/approve'") && SRV.includes("app.post('/api/posts/accept-all'")
  && SRV.includes("app.get('/api/admin/support/conserje/revision'"),
  '§7: server.js expone /approve, /accept-all y la revisión del conserje (sin cambios de servidor)');
t(APP.includes('CHAT_FOTOS_MAX = 10') && APP.includes('pzSftPartirMedios'),
  '§7: la subida del chat sigue con tope 10 y aviso al partir (v784 intacta)');

// ---------- §8: huellas del lote (server.js NO cambia en R1) ----------
console.log('— §8: huellas');
t(md5(SRV) === 'ecee1b385be4755f9220f9bb13296a14', '§8: server.js intacto (md5 estampado v801; server.js SOLO línea BUILD)');
t(md5(APP) === '633242798e3e6407d1350471957ea92a', '§8: public/app.js = build R1 re-basado sobre v800 (merge R4+R1)');
t(md5(CSS) === '5e8e7446258ef39d4651b9fa24900292', '§8: public/styles.css = build R1 re-basado sobre v799');
t(APP.includes('CHUNK_V'), '§8: CHUNK_V presente en app.js');

// ---------- §9: boot M121 — endpoints reales con datos reales ----------
console.log('— §9: boot');
const PORT = 34574;
const SECRET = 'lote-rediseno-r1-secret';
const TOKEN = 'boot-test-token-r1';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rediseno-r1-'));
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
    ADMIN_TOKEN: TOKEN,
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'x',
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
    t(up, '§9: el servidor levanta con el lote R1 (puerto ' + PORT + ')');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));
    const TZ = 'America/New_York';
    const TODAY = dayKeyInTz(new Date(), TZ);
    const shiftDays = (ymd, n) => {
      const [y, m, d] = ymd.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12));
      dt.setUTCDate(dt.getUTCDate() + n);
      return dt.toISOString().slice(0, 10);
    };
    const MON = shiftDays(TODAY, -(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1));
    const ver = await api('x', 'GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v801',
      '§9: /api/version trae el BUILD v801 (estampado; base v799)', JSON.stringify(ver.json));
    const appJs = await apiText('/app.js?v=537');
    t(appJs.status === 200 && appJs.text.includes('pzHoyCardHTML')
      && appJs.text.includes('data-pz-cuenta-sale') && appJs.text.includes('pzHoyPendientes'),
      '§9: el app.js servido trae el bloque HOY-R1');
    t(md5(appJs.text) === md5(APP), '§9: el app.js servido es el del árbol R1 (md5 igual)');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    let schemaOk = false;
    for (let i = 0; i < 30; i++) {
      try {
        const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get();
        if (row) { schemaOk = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(schemaOk, '§9: el schema está listo (tabla users) antes de sembrar');
    if (!schemaOk) throw new Error('sin schema');
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 7 * 24 * 3600 * 1000, expires: new Date(exp).toISOString(), httpOnly: true, path: '/' },
      userId: uid,
    });
    const at2200Z = (ymd) => ymd + 'T22:00:00.000Z';
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (12, 'r1-12@test.invalid', 'x', 'posty', 'active', 17)`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    // La revisión del conserje solo lista clientes con negocio (profiles.business_name).
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username) VALUES (12, 'Negocio R1', 'r1test')`).run();
    // Publicados de esta semana (lun/mié/vie) + programados hoy y mañana + borrador.
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type, week_key, approval, created_at) VALUES (701, 12, '/media/701.jpg', 'Lunes', '', ?, ?, 'published', 'social', 'image', ?, 'approved', ?)`).run(at2200Z(shiftDays(TODAY, -6)), at2200Z(shiftDays(TODAY, -6)), MON, at2200Z(shiftDays(TODAY, -7)));
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type, week_key, approval, created_at) VALUES (702, 12, '/media/702.jpg', 'Miércoles', '', ?, ?, 'published', 'social', 'image', ?, 'approved', ?)`).run(at2200Z(shiftDays(TODAY, -4)), at2200Z(shiftDays(TODAY, -4)), MON, at2200Z(shiftDays(TODAY, -5)));
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type, week_key, approval, created_at) VALUES (703, 12, '/media/703.jpg', 'Viernes', '', ?, ?, 'published', 'social', 'image', ?, 'approved', ?)`).run(at2200Z(shiftDays(TODAY, -2)), at2200Z(shiftDays(TODAY, -2)), MON, at2200Z(shiftDays(TODAY, -3)));
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (704, 12, '/media/704.jpg', 'Hoy', '', ?, 'scheduled', 'social', 'image', ?, 'pending', ?)`).run(shiftDays(TODAY, 1) + 'T00:30:00.000Z', MON, shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (705, 12, '/media/705.jpg', 'Mañana', '', ?, 'scheduled', 'social', 'image', ?, 'pending', ?)`).run(shiftDays(TODAY, 2) + 'T00:00:00.000Z', shiftDays(MON, 7), shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (706, 12, '/media/706.jpg', 'Borrador', '', NULL, 'draft', 'social', 'image', ?, 'pending', ?)`).run(MON, shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO assets (id, user_id, file_path, kind, album_tag, created_at) VALUES (801, 12, '/media/801.jpg', 'photo', 'producto', ?)`).run(at2200Z(shiftDays(TODAY, -1)));
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('r1-12', sessJson(12), exp);
    const posts = await api('r1-12', 'GET', '/api/posts');
    const list = (posts.json && (posts.json.posts || posts.json.items || posts.json)) || [];
    const byId = (id) => (Array.isArray(list) ? list.find((p) => Number(p.id) === id) : null);
    t(posts.status === 200 && byId(704) && byId(705) && byId(706),
      '§9: /api/posts trae hoy (704), mañana (705) y el borrador (706)', JSON.stringify(posts.json && posts.json.error));
    t(byId(701) && byId(701).status === 'published' && byId(703) && byId(703).status === 'published',
      '§9: /api/posts trae los publicados de la semana (701, 703) — la materia de la semana de un vistazo');
    const ap = await api('r1-12', 'POST', '/api/posts/705/approve', {});
    t(ap.status === 200 && ap.json && ap.json.ok === true,
      '§9: «Dale» del posteo de mañana: POST /api/posts/705/approve → 200 ok', JSON.stringify(ap.json));
    const posts2 = await api('r1-12', 'GET', '/api/posts');
    const list2 = (posts2.json && (posts2.json.posts || posts2.json.items || posts2.json)) || [];
    const p705 = Array.isArray(list2) ? list2.find((p) => Number(p.id) === 705) : null;
    t(p705 && p705.approval === 'approved', '§9: el posteo 705 queda aprobado en la DB');
    const patch = await api('r1-12', 'PATCH', '/api/posts/706', { scheduled_at: shiftDays(TODAY, 2) + 'T00:00:00.000Z' });
    t(patch.status === 200 && patch.json && patch.json.ok === true,
      '§9: «Dale» del borrador: PATCH /api/posts/706 {scheduled_at} → 200 ok', JSON.stringify(patch.json));
    const posts3 = await api('r1-12', 'GET', '/api/posts');
    const list3 = (posts3.json && (posts3.json.posts || posts3.json.items || posts3.json)) || [];
    const p706 = Array.isArray(list3) ? list3.find((p) => Number(p.id) === 706) : null;
    // /api/posts devuelve la ventana vigente (la semana en curso); el
    // borrador aceptado puede quedar en la semana que viene, así que se
    // verifica en la DB, que es la fuente de verdad del estado.
    const row706 = db.prepare(`SELECT status, scheduled_at FROM posts WHERE id = 706`).get();
    t(row706 && row706.status === 'scheduled',
      '§9: el borrador 706 queda programado en la DB (status=scheduled)', JSON.stringify(row706));
    const sig = await api('r1-12', 'POST', '/api/posts/706/signal', { signal: 'approved' });
    t(sig.status === 200 && sig.json && sig.json.ok === true,
      '§9: señal approved del borrador aceptado → 200 ok', JSON.stringify(sig.json));
    const album = await api('r1-12', 'GET', '/api/album');
    t(album.status === 200 && album.json && album.json.ok === true
      && Array.isArray(album.json.photos) && album.json.photos.some((p) => Number(p.id) === 801),
      '§9: /api/album trae la foto 801 (la fila del álbum de Hoy)', JSON.stringify(album.json && album.json.error));
    const rev = await api('x', 'GET', '/api/admin/support/conserje/revision', null, TOKEN);
    t(rev.status === 200 && rev.json && rev.json.ok === true && Array.isArray(rev.json.items)
      && rev.json.items.some((i) => Number(i.user_id) === 12),
      '§9: revisión del conserje con token → 200 e incluye al cliente 12 (su posteo de mañana)', JSON.stringify(rev.json && rev.json.error));
    const revSin = await api('x', 'GET', '/api/admin/support/conserje/revision');
    t(revSin.status === 403, '§9: revisión del conserje sin token → 403');
    try { db.close(); } catch (e) {}
  } catch (e) {
    console.log('error del test:', e.message);
    badN++;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
})().then(() => {
  console.log(`\n${okN} ok, ${badN} mal`);
  process.exit(badN ? 1 : 0);
});
