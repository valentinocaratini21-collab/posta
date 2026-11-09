'use strict';
/* test-lote-proximo-destapado.js — LOTE PROXIMO-DESTAPADO · 6/11
 * Decisión Valentino 6/11 ~17:19 + refinamiento 17:24 («Sí, a las 00:00»):
 * de 17:00 a 00:00 el próximo sigue TAPADO; a las 00:00 se abre solo
 * (zona de la cuenta) y queda visible para editarlo o pedir un cambio.
 * La cuenta de la tardecita cuenta hasta las 00:00 (vive en la carta
 * del feed). Las 9:00 son la confirmación («Sale así»), no la revelación.
 * Corrección Valentino 6/11 ~17:32: la pantalla velada NO dice «buen día»
 * (se ve de tarde a noche) — queda solo «te traje tu paquete de hoy».
 * El test reproduce la línea de tiempo exacta con el código real extraído
 * de public/app.js (bloque HOME_FEED + bloque RITUAL) y un DOM falso
 * mínimo, con reloj mutable. En el árbol prístino v728 los tests nuevos
 * deben FALLAR (cazan el cambio).
 * Uso: node test-lote-proximo-destapado.js
 *   DESTAPADO_TREE=<dir>  árbol a probar (por defecto, este directorio)
 *   DESTAPADO_RUN_T8=1    corre T8 en serio (solo en el overlay fusionado
 *                         con el fix del próximo atascado; sin el fix, T8
 *                         SALTA con mensaje, no falla)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.env.DESTAPADO_TREE || __dirname);
const RUN_T8 = process.env.DESTAPADO_RUN_T8 === '1';
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const RM = fs.readFileSync(path.join(TREE, 'ritual-manana.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');

let okN = 0, badN = 0, skipN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };
const skip = (name) => { skipN++; console.log('— SKIP', name); };

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
let NOW_MS = Date.parse('2026-11-06T21:59:00.000Z'); // 6/11 16:59 EST
const setNow = (iso) => { NOW_MS = Date.parse(iso); };
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- DOM falso mínimo (patrón test-lote-proximo-atascado.js) ----------
class El {
  constructor(tag) {
    this.tagName = tag || 'div';
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.removed = false;
    this.innerHTML = '';
    this._l = {};
    this._q = {};
    this.className = '';
    this.id = '';
  }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  querySelector(sel) { return this._q[sel] || new El('button'); }
  querySelectorAll() { return []; }
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
  schedAt() {
    const m = /data-sched-at="([^"]+)"/.exec(this.html);
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
  insertAdjacentHTML(pos, html) {
    if (!this.grid) return;
    const cell = new Cell(html, this.grid);
    const idx = this.grid.cells.indexOf(this);
    if (pos === 'beforebegin' && idx >= 0) this.grid.cells.splice(idx, 0, cell);
    else if (pos === 'afterbegin') this.grid.cells.unshift(cell);
    else this.grid.cells.push(cell);
  }
}
class Grid {
  constructor() { this.cells = []; }
  live() { return this.cells.filter((c) => !c.removed); }
  drop(cell) { const i = this.cells.indexOf(cell); if (i >= 0) this.cells.splice(i, 1); }
  querySelector(sel) {
    const live = this.live();
    if (sel === '.hf-tile.pub') return live.find((c) => c.tileClasses().includes('pub')) || null;
    if (sel === '.hf-tile.hf-carta-magia') return live.find((c) => c.hasMagia()) || null;
    if (sel === '[data-hf-nextup]') return null;
    const m = /^\.hf-tile\[data-post-id="(.+)"\]$/.exec(sel);
    if (m) return live.find((c) => c.postId() === m[1]) || null;
    return null;
  }
  querySelectorAll() { return []; }
  insertAdjacentHTML(pos, html) {
    const cell = new Cell(html, this);
    if (pos === 'afterbegin') this.cells.unshift(cell);
    else this.cells.push(cell);
  }
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
const ritStore = new Map();
const lsStore = new Map();
const store = new Map();
const grid = new Grid();
const root = new Root(grid);
const PROF = { posts_count: 12, followers: 8, following: 1, recents: [] };
const appended = [];
const sonidos = [];
let syncCalls = 0;
let cuentaEl = null; // elemento [data-pz-cuenta-abre] del tick (T9)
const liveTickCalls = [];
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
    body: { appendChild: (el) => { appended.push(el); } },
    getElementById: (id) => (id === 'inicioView' ? root : null),
    querySelector: (sel) => {
      if (sel === '[data-pz-cuenta-abre]') return cuentaEl;
      if (sel === '.hf-grid') return grid;
      return grid.querySelector(sel);
    },
    querySelectorAll: () => [],
    createElement: (tag) => new El(tag),
    addEventListener: () => {},
  },
  window: { addEventListener: () => {} },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  localStorage: localStorageStub,
  sessionStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  },
  pzSonido: (n) => { sonidos.push(n); },
  pzSemanaAprobadaSync: () => { syncCalls++; },
  hfFeedGesturesBind: () => {},
  bindScfMinis: () => {},
  hfDurBind: () => {},
  hfIsEn: () => false,
  hfLiveTick: (force) => { liveTickCalls.push(force); },
  HF_VISITOR: false,
  HF_LIVE: { started: false, busy: false, lastFetch: 0, snap: null, pending: null, justPub: new Set() },
  HF_CUR_PROF: PROF,
  HOME_PROF: PROF,
  HF_PROPS: {},
  HF_TILES: [],
};
vm.createContext(sb);

function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}

// Bloque HOME_FEED real.
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
t(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');
vm.runInContext(APP.slice(a, b), sb);
// Bloque RITUAL real (cuenta, pzRitualHTML, pzRitualPendiente, sel, ...).
const ra = APP.indexOf('/* ===== RITUAL DE LA MAÑANA');
const rb = APP.indexOf('/* ===== TIRA DE NIVEL POSTY', ra);
t(ra > 0 && rb > ra, 'bloque RITUAL delimitado en app.js');
vm.runInContext(APP.slice(ra, rb), sb);
// Bloque HOY-R1 real (cartita SIN velo: pill + cuenta de salida).
// (LOTE REDISEÑO R1 · 8/11) La rama futura de homeTileHTML llama a
// pzHoyPillSalida / pzHoyCuentaSaleTxt con guarda typeof — sin este bloque
// la cartita abierta caería al strip viejo («El próximo» + chip).
const h1 = APP.indexOf('/* ===== LOTE REDISEÑO R1 · HOY');
const h2 = APP.indexOf('async function inicioView() {', h1);
t(h1 > 0 && h2 > h1, 'bloque HOY-R1 delimitado en app.js');
vm.runInContext(APP.slice(h1, h2), sb);
t(typeof sb.homeGridCompose === 'function' && typeof sb.homeTileHTML === 'function'
  && typeof sb.hfLiveSnapshot === 'function' && typeof sb.hfLiveDiff === 'function'
  && typeof sb.pzRitualHTML === 'function' && typeof sb.pzRitualCuentaTxt === 'function'
  && typeof sb.pzProximoYaAbierto === 'function' && typeof sb.pzDiaInicioMs === 'function',
  'HOME_FEED + RITUAL cargan en el sandbox (con helpers 00:00)');
// hfLiveApply + celebración + tick de la cuenta (fuera de los bloques).
for (const n of ['hfLiveApply', 'pzPubCelebMaybe', 'pzPubCelebShow', 'hfCuentaAbreTick']) {
  const code = extractFn(APP, n);
  t(code.length > 0, 'existe ' + n);
  if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
}

// ---------- Fixtures ----------
// 519 = hoy 17:00 EST (22:00Z 6/11) · 521 = mañana 17:00 EST (22:00Z 7/11)
// 522 = 8/11 17:00 EST · 518 = publicado 5/11.
const P518 = { id: 518, status: 'published', media_type: 'image', image_path: '/m/518.jpg', caption: 'El perfume de siempre', published_at: '2026-11-05T22:00:00.000Z', scheduled_at: '2026-11-05T22:00:00.000Z', pinned: 0, approval: 'approved' };
const P519hoy = { id: 519, status: 'scheduled', media_type: 'image', image_path: '/m/519.jpg', caption: 'La torta del día', scheduled_at: '2026-11-06T22:00:00.000Z', pinned: 0, approval: 'approved', created_at: '2026-11-06T10:00:00.000Z' }; // creado HOY 05:00 EST (después de medianoche)
const P519ayer = Object.assign({}, P519hoy, { created_at: '2026-11-05T10:00:00.000Z' }); // creado AYER (antes de medianoche)
const P519sin = Object.assign({}, P519hoy); delete P519sin.created_at; // sin created_at (fail-closed)
const P519p = Object.assign({}, P519hoy, { status: 'published', published_at: '2026-11-06T22:00:00.000Z' });
const P521 = { id: 521, status: 'scheduled', media_type: 'image', image_path: '/m/521.jpg', caption: 'Mañana sale esto', scheduled_at: '2026-11-07T22:00:00.000Z', pinned: 0, approval: 'approved', created_at: '2026-11-06T15:00:00.000Z' }; // creado 6/11 10:00 EST
const P521p = Object.assign({}, P521, { status: 'published', published_at: '2026-11-07T22:00:00.000Z' });
const P522 = { id: 522, status: 'scheduled', media_type: 'image', image_path: '/m/522.jpg', caption: 'Pasado sale esto', scheduled_at: '2026-11-08T22:00:00.000Z', pinned: 0, approval: 'approved', created_at: '2026-11-07T15:00:00.000Z' };

const RIT_PEND = { tieneHoy: true, yaElegido: false };
const RIT_ELEG = { tieneHoy: true, yaElegido: true };
function compose(upcoming, published, ritual) {
  return sb.homeGridCompose({ upcoming, published, recents: [], ritual: (ritual === undefined ? null : ritual) });
}
function renderIntoGrid(tiles) {
  grid.cells = tiles.map((tl, i) => new Cell(sb.homeTileHTML(tl, i), grid));
}
function ritD(carta, extra) {
  return Object.assign({
    hoy: '2026-11-07', racha: 3, dorada: false, elegida: 0,
    recomendada: carta,
    cartas: [carta],
    album: { slots: [] },
    abre_a: '2026-11-07T14:00:00.000Z', ahora: '2026-11-07T13:00:00.000Z', abre_hora: '9:00',
  }, extra || {});
}
const CARTA521 = { id: 521, imagen: '/m/521.jpg', caption: 'Mañana sale esto', caption_corta: 'Mañana sale esto', tipo: 'imagen', media_type: 'image', recomendada: true, rubro: 'general', created_at: '2026-11-06T15:00:00.000Z', scheduled_at: '2026-11-07T22:00:00.000Z' };

// ---------- Helpers 00:00 (unidad) ----------
console.log('— H: helpers de medianoche');
t(typeof sb.pzDiaInicioMs === 'function'
  && sb.pzDiaInicioMs(new FakeDate('2026-11-07T22:00:00.000Z'), 'America/New_York') === Date.parse('2026-11-07T05:00:00.000Z'),
  'H: pzDiaInicioMs(7/11 17:00 EST) = 7/11 00:00 EST (05:00Z)');
t(typeof sb.pzDiaInicioMs === 'function'
  && sb.pzDiaInicioMs(new FakeDate('2026-11-06T22:00:00.000Z'), 'America/New_York') === Date.parse('2026-11-06T05:00:00.000Z'),
  'H: pzDiaInicioMs(6/11 17:00 EST) = 6/11 00:00 EST (05:00Z)');
t(typeof sb.pzProximoYaAbierto === 'function'
  && sb.pzProximoYaAbierto(P521, Date.parse('2026-11-07T05:30:00.000Z'), 'America/New_York') === true
  && sb.pzProximoYaAbierto(P521, Date.parse('2026-11-06T22:01:00.000Z'), 'America/New_York') === false,
  'H: pzProximoYaAbierto(521): abierto a las 00:30, velado a las 17:01 del día anterior');
t(typeof sb.pzProximoYaAbierto === 'function'
  && sb.pzProximoYaAbierto(P519sin, Date.parse('2026-11-06T21:59:00.000Z'), 'America/New_York') === false
  && sb.pzProximoYaAbierto(P519hoy, Date.parse('2026-11-06T21:59:00.000Z'), 'America/New_York') === false
  && sb.pzProximoYaAbierto(P519ayer, Date.parse('2026-11-06T21:59:00.000Z'), 'America/New_York') === true,
  'H: fail-closed sin created_at o creado hoy; abierto si creado antes de medianoche');

// ---------- T1: 16:59, próximo = hoy, creado hoy → ABIERTO (LOTE SACAR-CARTA-VELADA 9/11: sin velo, nunca) ----------
console.log('— T1: 16:59, próximo de hoy sin elegir YA VA ABIERTO');
setNow('2026-11-06T21:59:00.000Z');
lsStore.clear();
const tilesT1 = compose([{ p: P519hoy, ymd: '2026-11-06' }, { p: P521, ymd: '2026-11-07' }], [P518], RIT_PEND);
t(tilesT1.length === 2 && tilesT1[0].kind === 'oculta' && tilesT1[0].post.id === 519 && tilesT1[0].openHoy === true,
  'T1: a las 16:59 la grilla es [oculta 519, publicado 518], carta de hoy ABIERTA');
const htmlT1 = sb.homeTileHTML(tilesT1[0], 0);
t(htmlT1.includes('Se postea hoy · 17:00') && htmlT1.includes('data-post-id="519"') && htmlT1.includes('<img') && !htmlT1.includes('hf-carta-oculta'),
  'T1: la carta de hoy es ABIERTA (foto + pill de salida + data-post-id, sin velo)');
t(!htmlT1.includes('data-pz-cuenta-abre'),
  'T1: la carta de HOY no lleva cuenta hasta las 00:00 (la medianoche de hoy ya pasó)');

// ---------- T1b: 16:59, próximo de hoy creado ANTES de medianoche → ABIERTO ----------
console.log('— T1b: 16:59, próximo de hoy creado antes de medianoche ya está abierto');
const tilesT1b = compose([{ p: P519ayer, ymd: '2026-11-06' }, { p: P521, ymd: '2026-11-07' }], [P518], RIT_PEND);
t(tilesT1b[0].kind === 'oculta' && tilesT1b[0].post.id === 519 && tilesT1b[0].openHoy === true,
  'T1b: creado antes de medianoche → openHoy true a las 16:59');
const htmlT1b = sb.homeTileHTML(tilesT1b[0], 0);
t(htmlT1b.includes('data-post-id="519"') && !htmlT1b.includes('hf-carta-oculta') && htmlT1b.includes('<img'),
  'T1b: la carta se ve abierta (foto visible, data-post-id, sin velo)');

// ---------- T2: 17:01, próximo = mañana, ABIERTO (R1; SUPERSEDE el destape 6/11) ----------
// (LOTE REDISEÑO R1 · 8/11) La decisión 8/11 00:05 (cartita SIN velo) reemplaza
// el destape «a las 00:00» del 6/11 SOLO para el posteo de un día futuro:
// la cartita de mañana va ABIERTA en la grilla, con pill «Se postea mañana»
// y cuenta hasta que SALE. La carta de HOY sin elegir sigue velada (T1).
console.log('— T2: 17:01, próximo de mañana ABIERTO con pill y cuenta de salida (R1)');
setNow('2026-11-06T22:01:00.000Z');
const tilesT2 = compose([{ p: P521, ymd: '2026-11-07' }], [P519p, P518], RIT_PEND);
t(tilesT2.length === 3 && tilesT2[0].kind === 'oculta' && tilesT2[0].post.id === 521 && tilesT2[0].openHoy === true && tilesT2[0].futuro === true,
  'T2: después de las 17:00 la grilla es [oculta 521 ABIERTA, publicado 519, publicado 518]');
const htmlT2 = sb.homeTileHTML(tilesT2[0], 0);
t(htmlT2.includes('data-post-id="521"') && htmlT2.includes('<img') && htmlT2.includes('Se postea mañana') && htmlT2.includes('17:00')
  && !htmlT2.includes('hf-carta-oculta') && !htmlT2.includes('hf-carta-velo'),
  'T2: la carta de mañana es ABIERTA (foto, data-post-id, pill «Se postea mañana · 17:00», sin velo)');
t(htmlT2.includes('data-pz-cuenta-sale="2026-11-07T22:00:00.000Z"') && !htmlT2.includes('data-pz-cuenta-abre'),
  'T2: la cuenta apunta a la SALIDA del posteo (no a la medianoche)');
t(htmlT2.includes('sale en') && !htmlT2.includes('Se destapa'),
  'T2: la cuenta dice «sale en …» (no «Se destapa a las 00:00»)');

// ---------- T3: 00:30 día siguiente → ABIERTO ----------
console.log('— T3: 00:30, el próximo se abrió solo');
setNow('2026-11-07T05:30:00.000Z');
const tilesT3 = compose([{ p: P521, ymd: '2026-11-07' }], [P519p, P518], RIT_PEND);
t(tilesT3[0].kind === 'oculta' && tilesT3[0].post.id === 521 && tilesT3[0].openHoy === true,
  'T3: a las 00:30 la carta de hoy es abierta (openHoy true)');
const htmlT3 = sb.homeTileHTML(tilesT3[0], 0);
t(htmlT3.includes('data-post-id="521"') && !htmlT3.includes('hf-carta-oculta') && htmlT3.includes('<img')
  && !htmlT3.includes('data-pz-cuenta-abre'),
  'T3: foto visible, data-post-id, sin velo y sin cuenta (ya se abrió)');

// ---------- T4: 9:00 ritual, ya abierto → revelado listo para confirmar ----------
console.log('— T4: 9:00, el ritual muestra el posteo listo para confirmar (sin velo falso)');
setNow('2026-11-07T14:00:00.000Z'); // 7/11 09:00 EST
const htmlT4 = String(sb.pzRitualHTML(ritD(CARTA521, { ahora: '2026-11-07T14:00:00.000Z' }), false, 0));
t(htmlT4.includes('data-pz-ritual-ok="521"') && htmlT4.includes('Sale así') && htmlT4.includes('/m/521.jpg'),
  'T4: carta revelada con foto + [Sale así] (confirmación, no revelación)');
t(!htmlT4.includes('pz-ritual-cuenta') && !htmlT4.includes('pz-dorso') && !htmlT4.includes('Se abre a las'),
  'T4: sin cuenta atrás falsa ni velo ni «Se abre a las»');
t(htmlT4.includes('buen día') && htmlT4.includes('te traje tu paquete de hoy'),
  'T4: el ritual de la mañana revelado SÍ dice «buen día» (el saludo queda acá)');

// ---------- T4b: 9:00 ritual, NO abierto (sin created_at) → cuenta/velo preservados, sin «buen día» ----------
console.log('— T4b: 8:00, sin created_at → cuenta y velo de siempre, sin saludo');
setNow('2026-11-07T13:00:00.000Z'); // 7/11 08:00 EST
const CARTA_SIN = Object.assign({}, CARTA521); delete CARTA_SIN.created_at;
const htmlT4b = String(sb.pzRitualHTML(ritD(CARTA_SIN), false, 0));
t(htmlT4b.includes('pz-ritual-cuenta') && htmlT4b.includes('tu paquete se abre en') && htmlT4b.includes('Se abre a las 9:00'),
  'T4b: fail-closed: cuenta regresiva a las 9:00 intacta (v726)');
t((htmlT4b.match(/<i class="pz-dorso">/g) || []).length === 1,
  'T4b: el velo es UNA SOLA carta (1 dorso, no 3)');
t(!htmlT4b.includes('buen día') && !htmlT4b.includes('good morning') && htmlT4b.includes('te traje tu paquete de hoy'),
  'T4b: la pantalla velada NO dice «buen día» — solo «te traje tu paquete de hoy»');

// ---------- T5: 17:01 del 7/11, el próximo (8/11) va ABIERTO (R1; SUPERSEDE el destape 6/11) ----------
// (LOTE REDISEÑO R1 · 8/11) Igual que T2: el posteo de un día futuro ya no
// espera a la medianoche — se ve desde que existe.
console.log('— T5: 17:01 del 7/11, el próximo (8/11) ABIERTO (R1)');
setNow('2026-11-07T22:01:00.000Z');
const tilesT5 = compose([{ p: P522, ymd: '2026-11-08' }], [P521p, P519p, P518], RIT_PEND);
t(tilesT5[0].kind === 'oculta' && tilesT5[0].post.id === 522 && tilesT5[0].openHoy === true && tilesT5[0].futuro === true,
  'T5: el próximo del 8/11 va ABIERTO a las 17:01 del 7/11');
const htmlT5 = sb.homeTileHTML(tilesT5[0], 0);
t(htmlT5.includes('data-post-id="522"') && htmlT5.includes('Se postea mañana') && htmlT5.includes('data-pz-cuenta-sale="2026-11-08T22:00:00.000Z"')
  && !htmlT5.includes('hf-carta-velo') && !htmlT5.includes('data-pz-cuenta-abre'),
  'T5: la cartita del 8/11 se ve (foto, pill «Se postea mañana», cuenta de salida)');

// ---------- T6: sin próximo futuro no hay carta ----------
console.log('— T6: sin próximo futuro no hay carta');
const tilesT6 = compose([], [P519p, P518], RIT_PEND);
t(tilesT6.every((tl) => tl.kind !== 'oculta'), 'T6: sin programados futuros la composición no trae carta');

// ---------- T7: elegido sigue abierto · T7b: revelado (sel) abre la carta en el feed ----------
console.log('— T7/T7b: elegido y revelado siguen abriendo la carta');
setNow('2026-11-06T21:59:00.000Z');
const tilesT7 = compose([{ p: P519hoy, ymd: '2026-11-06' }], [P518], RIT_ELEG);
t(tilesT7[0].kind === 'oculta' && tilesT7[0].openHoy === true,
  'T7: próximo de hoy elegido → abierto (ritual, preservado)');
lsStore.clear();
lsStore.set('pz-ritual-sel-2026-11-06', '519');
const tilesT7b = compose([{ p: P519hoy, ymd: '2026-11-06' }], [P518], RIT_PEND);
t(tilesT7b[0].kind === 'oculta' && tilesT7b[0].openHoy === true,
  'T7b: próximo de hoy revelado en el ritual (sel) → abierto en el feed (no se re-vela)');
lsStore.clear();

// ---------- T10: velo de 1 dorso + sin «buen día» en la rama velada que queda (después de las 9:00) ----------
console.log('— T10: paquete velado (después de las 9:00, sin abrir) — 1 dorso, sin saludo');
setNow('2026-11-07T15:00:00.000Z'); // 7/11 10:00 EST: abre_a 9:00 ya pasó, falta <= 0
const htmlT10 = String(sb.pzRitualHTML(ritD(CARTA_SIN, { ahora: '2026-11-07T15:00:00.000Z', abre_a: '2026-11-07T14:00:00.000Z' }), false, 0));
t(htmlT10.includes('Tocá para verla') && htmlT10.includes('1 carta adentro'),
  'T10: después de las 9:00 sin abrir, el paquete velado sigue ahí (tocá para verla)');
t((htmlT10.match(/<i class="pz-dorso">/g) || []).length === 1,
  'T10: el velo es UNA SOLA carta también acá');
t(!htmlT10.includes('buen día') && !htmlT10.includes('good morning') && htmlT10.includes('te traje tu paquete de hoy'),
  'T10: la pantalla velada NO dice «buen día» — solo «te traje tu paquete de hoy»');
t((APP.match(/'buen día'/g) || []).length === 1 && (APP.match(/'good morning'/g) || []).length === 1,
  'T10: «buen día» / «good morning» quedan UNA sola vez en app.js (el saludo del ritual revelado)');
t(CSS.includes('.pz-dorso:only-of-type') && !CSS.includes('.hf-cuenta-abre'),
  'T10 (LOTE SACAR-CARTA-VELADA): CSS con regla del dorso único; la cuenta del feed ya no es .hf-cuenta-abre (es data-pz-cuenta-sale)');
t(RM.includes('created_at: String(post.created_at') && RM.includes('scheduled_at: String(post.scheduled_at'),
  'T10: cardOf (ritual-manana.js) devuelve created_at + scheduled_at');
t(SRV.includes('cardOf(shownPost || rec'),
  'T10: /api/ritual/hoy pasa la fila completa a cardOf (SELECT * → created_at)');

// ---------- T9: tick de la cuenta de la tardecita (hfCuentaAbreTick) ----------
console.log('— T9: tick de 1 s de la cuenta hasta las 00:00');
t(typeof sb.hfCuentaAbreTick === 'function', 'T9: existe hfCuentaAbreTick');
if (typeof sb.hfCuentaAbreTick === 'function') {
  const mkEl = (abre) => {
    const el = new El('span');
    el.setAttribute('data-pz-cuenta-abre', abre);
    el.innerHTML = 'viejo';
    return el;
  };
  setNow('2026-11-06T22:01:00.000Z'); // 6/11 17:01 EST
  cuentaEl = mkEl('2026-11-07T05:00:00.000Z');
  liveTickCalls.length = 0;
  sb.hfCuentaAbreTick();
  // (R1 · 8/11, corrección de la expectativa: el tick escribe
  // «faltan … para ver tu próximo posteo», no «para las 00:00» — la
  // expectativa vieja ya fallaba en la base v793; el tick en sí no cambia.)
  t(cuentaEl.innerHTML.includes('6 h 59 min') && cuentaEl.innerHTML.includes('para ver tu próximo posteo') && liveTickCalls.length === 0,
    'T9a: el tick actualiza el texto en vivo («6 h 59 min») sin forzar el vivo');
  setNow('2026-11-07T05:00:30.000Z'); // 7/11 00:00:30 EST (medianoche pasada)
  cuentaEl = mkEl('2026-11-07T05:00:00.000Z');
  liveTickCalls.length = 0;
  sb.hfCuentaAbreTick();
  t(liveTickCalls.length === 1 && liveTickCalls[0] === true,
    'T9b: a 0 el tick fuerza hfLiveTick(true) para que la carta se abra sola');
  cuentaEl = null;
  liveTickCalls.length = 0;
  let errT9 = null;
  try { sb.hfCuentaAbreTick(); } catch (e) { errT9 = e; }
  t(errT9 === null && liveTickCalls.length === 0,
    'T9c: sin carta velada el tick no hace nada (ni tira ni fuerza)');
}

// ---------- T8: a medianoche NO hay flip — la cartita ya estaba abierta (R1) ----------
// (LOTE REDISEÑO R1 · 8/11) La decisión 8/11 00:05 (cartita SIN velo) quita
// el flip de medianoche para el posteo futuro: a las 17:01 del día anterior
// la cartita YA va abierta, así que al cruzar las 00:00 el vivo no cambia
// nada (la carta sigue abierta en el mismo lugar). Requiere el fix del
// próximo atascado (hfLiveSnapshot registra la carta como 'oculta:<id>').
// En el overlay fusionado corre en serio con DESTAPADO_RUN_T8=1.
console.log('— T8: a medianoche no hay flip (la cartita ya estaba abierta)');
setNow('2026-11-06T22:01:00.000Z');
const tilesT8a = compose([{ p: P521, ymd: '2026-11-07' }], [P519p, P518], RIT_PEND);
const snapT8a = sb.hfLiveSnapshot(tilesT8a, PROF);
if (!snapT8a.posts || !snapT8a.posts['oculta:521']) {
  skip('T8: hfLiveSnapshot no registra la carta oculta en este árbol (falta el fix atascado; se verifica en el overlay fusionado con DESTAPADO_RUN_T8=1)');
} else if (!RUN_T8) {
  skip('T8: snapshot con carta oculta, pero DESTAPADO_RUN_T8 no está en 1 (corre solo en el overlay fusionado)');
} else {
  setNow('2026-11-07T05:30:00.000Z'); // 7/11 00:30 EST
  const tilesT8b = compose([{ p: P521, ymd: '2026-11-07' }], [P519p, P518], RIT_PEND);
  const snapT8b = sb.hfLiveSnapshot(tilesT8b, PROF);
  const diffT8 = sb.hfLiveDiff(snapT8a, snapT8b);
  t(diffT8.changed.length === 0 && diffT8.justPublished.length === 0,
    'T8: a medianoche no hay flip (la cartita de mañana ya estaba abierta)');
  renderIntoGrid(tilesT8a);
  const nBefore = grid.live().length;
  sb.hfLiveApply({ tiles: tilesT8b, props: {}, prof: PROF, diff: diffT8 });
  t(grid.live().length === nBefore && grid.live()[0].postId() === '521'
    && !grid.live()[0].hasOculta() && grid.live()[0].html.includes('<img')
    && !grid.live()[0].html.includes('data-pz-cuenta-abre'),
    'T8: la cartita sigue abierta en el mismo lugar (idx 0, sin duplicar, sin cuenta)');
}

// ---------- Auditoría M78: funciones llamadas desde los caminos nuevos ----------
console.log('— M78: funciones auditadas');
const nuevas = ['pzTzOffsetMs', 'pzDiaInicioMs', 'pzProximoYaAbierto', 'hfCuentaAbreTick'];
const llamadas = ['pzProximoYaAbierto', 'pzDiaInicioMs', 'pzRitualCuentaTxt', 'hfCuentaAbreTick', 'hfLiveTick'];
t(nuevas.every((f) => APP.includes('function ' + f)),
  'M78: las 4 funciones nuevas existen definidas en el bundle (' + nuevas.join(', ') + ')');
t(llamadas.every((f) => APP.includes('function ' + f) || f === 'hfLiveTick' && APP.includes('function hfLiveTick')),
  'M78: toda función llamada desde los caminos nuevos existe definida (5/5)');
t(APP.includes('HF_CUENTA_T = setInterval'),
  'M78: hfLiveStart arma el intervalo de 1 s de la cuenta');

// ---------- A: boot M121 — el servidor levanta y /api/ritual/hoy trae created_at ----------
const PORT = 34573;
const SECRET = 'proximo-destapado-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proximo-destapado-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(sid, method, p, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-destapado',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'test',
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
    t(up, 'A-boot (M121): el servidor levanta con el lote (express 4.22.3)');
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
    const at2200Z = (ymd) => ymd + 'T22:00:00.000Z';
    const CREATED_AYER = shiftDays(TODAY, -1) + ' 10:00:00';
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    // El servidor crea el schema al arrancar; /api/version puede responder
    // antes de que la tabla users exista (carrera: 1 de cada 3 boots): se
    // espera a ver la tabla antes de sembrar, hasta 30 s.
    let schemaOk = false;
    for (let i = 0; i < 30; i++) {
      try {
        const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get();
        if (row) { schemaOk = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(schemaOk, 'A-boot (M121): el schema está listo (tabla users) antes de sembrar');
    if (!schemaOk) throw new Error('sin schema');
    db.exec(`CREATE TABLE IF NOT EXISTS pz_ritual (
      user_id INTEGER NOT NULL, day_key TEXT NOT NULL,
      recommended_post_id INTEGER NOT NULL,
      alt_post_ids TEXT NOT NULL DEFAULT '[]', picked_post_id INTEGER,
      gold INTEGER NOT NULL DEFAULT 0, picked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day_key))`);
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' },
      userId: uid,
    });
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (12, 'destapado-12@test.invalid', 'x', 'posty', 'active', 17)`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, created_at) VALUES (518, 12, '/media/518.jpg', 'Café de la casa', '', ?, 'scheduled', 'social', 'image', ?)`)
      .run(at2200Z(TODAY), CREATED_AYER);
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (12, ?, 518, '[]', NULL, 0)`).run(TODAY);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('destapado-12', sessJson(12), exp);
    const hoy12 = await api('destapado-12', 'GET', '/api/ritual/hoy');
    t(hoy12.status === 200 && hoy12.json && hoy12.json.ok === true, 'A-hoy: /api/ritual/hoy 200 + ok');
    t(Array.isArray(hoy12.json.cartas) && hoy12.json.cartas.length === 1 && hoy12.json.cartas[0].id === 518,
      'A-hoy: UNA sola carta (la recomendada 518)', JSON.stringify((hoy12.json.cartas || []).map((c) => c.id)));
    t(hoy12.json.cartas && hoy12.json.cartas[0] && hoy12.json.cartas[0].created_at === CREATED_AYER,
      'A-hoy: la carta trae created_at real (' + CREATED_AYER + ')', JSON.stringify(hoy12.json.cartas && hoy12.json.cartas[0] && hoy12.json.cartas[0].created_at));
    t(hoy12.json.cartas && hoy12.json.cartas[0] && hoy12.json.cartas[0].scheduled_at === at2200Z(TODAY),
      'A-hoy: la carta trae scheduled_at real (' + at2200Z(TODAY) + ')', JSON.stringify(hoy12.json.cartas && hoy12.json.cartas[0] && hoy12.json.cartas[0].scheduled_at));
    t(hoy12.json.recomendada && hoy12.json.recomendada.created_at === CREATED_AYER,
      'A-hoy: la recomendada también trae created_at');
    db.close();
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\nproximo-destapado: ${okN} ok, ${badN} mal, ${skipN} saltados (T8)`);
  if (badN) process.exit(1);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
