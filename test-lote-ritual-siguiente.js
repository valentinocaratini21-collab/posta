'use strict';
/* test-lote-ritual-siguiente.js — LOTE RITUAL-SIGUIENTE · 7/11
 * (LOTE SACAR-CARTA-VELADA · 9/11 · orden Valentino 00:49: la carta
 * velada y la línea de destape se fueron; el próximo SIEMPRE rinde
 * abierto. Este lote queda como registro del destape por reloj, ya
 * retirado; el ritual en sí — aviso 9:00, confirmar/cambiar — sigue.)
 * Directiva Valentino 7/11 ~17:07 (captura del home): «Apenas sale el
 * posteo del día, ya tiene que aparecer el próximo posteo oculto, y que
 * lo pueden ver a las 00:00». Concreción de RITUAL FECHA+HORA+MÁGICA.
 *
 * Lo que ya existía en v761 (verificado en el código, no re-hecho):
 * - La carta cambia al publicar (LOTE PROXIMO-ATASCADO 6/11: el diff
 *   vivo sigue la carta 'oculta:<id>' y hfLiveApply la reemplaza).
 * - A las 00:00 se destapa (LOTE PROXIMO-DESTAPADO 6/11:
 *   pzProximoYaAbierto + el tick de 1 s fuerza hfLiveTick(true)).
 * - Sin próximo no hay carta (fail-closed en homeGridCompose).
 * - La carta nunca publica (sin data-post-id, sin botón).
 *
 * Lo que FALTABA y construye este lote (con evidencia):
 * 1) La carta velada NUNCA decía «Se destapa a las 00:00»: llevaba
 *    la cuenta («faltan X para ver tu próximo posteo») y la chapita
 *    («Mañana · 17:00»), pero no nombraba la hora del destape
 *    (homeTileHTML, rama 'oculta', app.js ~19465-19474). Ahora la
 *    lleva, derivada de la misma medianoche de la cuenta.
 * 2) La carta avanzaba con el RELOJ, no con la publicación: la
 *    selección es «próximo futuro mínimo» (scheduled_at > now). Si el
 *    posteo de hoy vencía sin salir (programado con hora pasada, en
 *    publicación o fallido), la carta saltaba a mañana aunque hoy no
 *    salió nada — el código mismo nombra el caso («ya vencido, en
 *    publicación», app.js ~18429). Ahora el freno: si hoy hay un
 *    posteo pendiente, la carta del próximo de día futuro NO aparece.
 *    La fuente es la lista completa (input.all; sin ella, upcoming):
 *    'publishing'/'failed' no viven en upcoming.
 *
 * El test reproduce los escenarios con el código real extraído de
 * public/app.js (bloque HOME_FEED + hfLiveApply + pzRitualCuentaTxt +
 * hfCuentaAbreTick) y un DOM falso mínimo. Reloj mutable por escenario.
 * Uso: node test-lote-ritual-siguiente.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');

let NOW_MS = Date.parse('2026-11-06T22:30:00.000Z'); // 6/11 17:30 EST (por defecto)

class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- DOM falso mínimo (del lote proximo-atascado) ----------
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
  getAttribute(k) { return this['attr_' + k] === undefined ? null : this['attr_' + k]; }
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
const ritFlag = { pendiente: true };
const selFlag = { id: 0 };
const appended = [];
const sonidos = [];
const liveTickCalls = [];
let syncCalls = 0;
const store = new Map();
const grid = new Grid();
const root = new Root(grid);
const PROF = { posts_count: 12, followers: 8, following: 1, recents: [] };

const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
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
    createElement: (tag) => new El(tag),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  },
  window: { addEventListener: () => {} },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  sessionStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  },
  pzRitualPendiente: () => ritFlag.pendiente,
  pzRitualSelLeer: () => selFlag.id,
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

// Bloque HOME_FEED real.
const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
t(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');
vm.runInContext(APP.slice(a, b), sb);
// Bloque HOY-R1 real (R1 · 8/11): la rama futura de homeTileHTML llama a
// pzHoyPillSalida / pzHoyCuentaSaleTxt — sin este bloque la cartita
// abierta caería al strip viejo («El próximo» + chip).
const h1 = APP.indexOf('/* ===== LOTE REDISEÑO R1 · HOY');
const h2 = APP.indexOf('async function inicioView() {', h1);
t(h1 > 0 && h2 > h1, 'bloque HOY-R1 delimitado en app.js');
vm.runInContext(APP.slice(h1, h2), sb);
t(typeof sb.homeGridCompose === 'function' && typeof sb.homeTileHTML === 'function'
  && typeof sb.hfLiveSnapshot === 'function' && typeof sb.hfLiveDiff === 'function'
  && typeof sb.pzProximoYaAbierto === 'function' && typeof sb.pzDiaInicioMs === 'function',
  'HOME_FEED carga en el sandbox (compose, tile, snapshot, diff, destape)');

// Funciones reales fuera del bloque (cuenta, tick, vivo, celebración).
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
for (const n of ['pzRitualCuentaTxt', 'hfCuentaAbreTick', 'hfLiveApply', 'pzPubCelebMaybe', 'pzPubCelebShow']) {
  const code = extractFn(APP, n);
  t(code.length > 0, 'existe ' + n);
  if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
}
t(typeof sb.pzRitualCuentaTxt === 'function' && typeof sb.hfCuentaAbreTick === 'function'
  && typeof sb.hfLiveApply === 'function',
  'cuenta, tick de 1 s y vivo cargan en el sandbox');

// ---------- Marcadores del lote ----------
t(APP.includes('LOTE RITUAL-SIGUIENTE'), 'app.js lleva el marcador LOTE RITUAL-SIGUIENTE');
t(!APP.includes('hf-carta-destapa') && !APP.includes('Se destapa a las <b>00:00</b>')
  && !APP.includes('It opens at <b>00:00</b>'), 'app.js YA NO lleva la línea de destape ES+EN (LOTE SACAR-CARTA-VELADA)');
t(APP.includes('pendienteHoy'), 'app.js lleva el freno pendienteHoy');
t(!CSS.includes('.hf-carta-destapa'), 'styles.css YA NO lleva la regla .hf-carta-destapa (LOTE SACAR-CARTA-VELADA)');
t(SRV.includes("if (publicadoHoy)") && SRV.includes("abre_hora: '00:00'"),
  'server.js intacto: el próximo del ritual sigue gateado por publicadoHoy (00:00)');

// ---------- Fixtures ----------
// 6/11 17:00 EST = 22:00Z · 7/11 17:00 EST = 22:00Z 7/11 · 00:00 EST 7/11 = 05:00Z 7/11.
const P518 = { id: 518, status: 'published', media_type: 'image', image_path: '/m/518.jpg', caption: 'El perfume de siempre', published_at: '2026-11-05T22:00:00.000Z', scheduled_at: '2026-11-05T22:00:00.000Z', pinned: 0, approval: 'approved' };
const P519s = { id: 519, status: 'scheduled', media_type: 'image', image_path: '/m/519.jpg', caption: 'La torta del día', scheduled_at: '2026-11-06T22:00:00.000Z', pinned: 0, approval: 'approved' };
const P519p = Object.assign({}, P519s, { status: 'published', published_at: '2026-11-06T22:05:00.000Z' });
const P519pub = Object.assign({}, P519s, { status: 'publishing' });
const P519f = Object.assign({}, P519s, { status: 'failed' });
const P521 = { id: 521, status: 'scheduled', media_type: 'image', image_path: '/m/521.jpg', caption: 'Mañana sale esto', scheduled_at: '2026-11-07T22:00:00.000Z', pinned: 0, approval: 'approved' };
const P521old = Object.assign({}, P521, { created_at: '2026-11-03T12:00:00.000Z' });
const P522 = { id: 522, status: 'scheduled', media_type: 'image', image_path: '/m/522.jpg', caption: 'Pasado mañana', scheduled_at: '2026-11-08T22:00:00.000Z', pinned: 0, approval: 'approved' };
const STORY = { id: 553, status: 'scheduled', media_type: 'story', image_path: '/m/553.jpg', caption: 'Hoy 22:00', scheduled_at: '2026-11-07T22:00:00.000Z', pinned: 0 };
const PINNED = { id: 530, status: 'scheduled', media_type: 'image', image_path: '/m/530.jpg', caption: 'Fijado', scheduled_at: '2026-11-07T22:00:00.000Z', pinned: 1 };

function compose(upcoming, published, all) {
  const input = { upcoming, published, recents: [], ritual: null };
  if (all !== undefined) input.all = all;
  return sb.homeGridCompose(input);
}
function renderIntoGrid(tiles) {
  grid.cells = tiles.map((tl, i) => new Cell(sb.homeTileHTML(tl, i), grid));
}
function setNow(iso) { NOW_MS = Date.parse(iso); }
function setLang(lang) { sb.ME.lang = lang; }

// ---------- A: al publicar hoy, aparece la próxima con fecha+hora y «Se destapa a las 00:00» ----------
console.log('— A: 519 sale a las 17:00, aparece la carta 521 ABIERTA con pill y cuenta de salida (R1)');
setNow('2026-11-06T22:30:00.000Z'); // 17:30 EST
setLang('es');
ritFlag.pendiente = true; selFlag.id = 0;
const allA = [P519p, P521, P518];
const tilesA = compose([{ p: P521, ymd: '2026-11-07' }], [P519p, P518], allA);
t(tilesA.length === 3 && tilesA[0].kind === 'oculta' && tilesA[0].post.id === 521
  && tilesA[1].kind === 'post' && tilesA[1].post.id === 519,
  'A: tras publicar, la composición es [oculta 521, publicado 519, publicado 518]');
const htmlA = sb.homeTileHTML(tilesA[0], 0);
// (LOTE REDISEÑO R1 · 8/11) La decisión 8/11 00:05 (cartita SIN velo) SUPERSEDE
// el destape «a las 00:00» del 6/11 SOLO para el posteo de un día futuro:
// la carta de mañana va ABIERTA (foto, pill, cuenta de salida).
// (LOTE SACAR-CARTA-VELADA · 9/11 · orden Valentino 00:49) SUPERSEDE R1 en
// lo de hoy: la carta de HOY sin elegir TAMBIÉN va ABIERTA. Sin velo, nunca.
t(htmlA.includes('data-post-id="521"') && htmlA.includes('<img') && !htmlA.includes('hf-carta-oculta') && !htmlA.includes('hf-carta-velo'),
  'A: la carta 521 es ABIERTA (R1: foto, data-post-id, sin velo)');
t(htmlA.includes('Se postea mañana') && htmlA.includes('17:00'),
  'A: la pill dice «Se postea mañana · 17:00»');
t(!htmlA.includes('Se destapa') && htmlA.includes('data-pz-cuenta-sale="2026-11-07T22:00:00.000Z"'),
  'A: sin «Se destapa a las 00:00»; la cuenta es hasta que SALE');
t(htmlA.includes('sale en') && !htmlA.includes('para ver tu próximo posteo'),
  'A: la cuenta dice «sale en …» (no «faltan X para ver tu próximo posteo»)');
t(!htmlA.includes('data-pz-abrir-ritual'),
  'A: la carta abierta NO abre el ritual (va al detalle del posteo)');

// El vivo aplica el cambio en el mismo tick que celebra la publicación.
// El «antes» se compone a las 16:30 EST (519 todavía programado, futuro).
setNow('2026-11-06T21:30:00.000Z');
const tilesPrevA = compose([{ p: P519s, ymd: '2026-11-06' }, { p: P521, ymd: '2026-11-07' }], [P518], [P519s, P521, P518]);
setNow('2026-11-06T22:30:00.000Z');
const snapPrevA = sb.hfLiveSnapshot(tilesPrevA, PROF);
const snapNextA = sb.hfLiveSnapshot(tilesA, PROF);
const diffA = sb.hfLiveDiff(snapPrevA, snapNextA);
t(diffA.justPublished.length === 1 && diffA.justPublished[0] === '519'
  && diffA.added.includes('oculta:521') && diffA.removed.includes('oculta:519'),
  'A: el diff ve la publicación del 519 y el cambio de carta (sale oculta:519, entra oculta:521)');
renderIntoGrid(tilesPrevA);
appended.length = 0;
sb.hfLiveApply({ tiles: tilesA, props: {}, prof: PROF, diff: diffA });
const liveA = grid.live();
t(liveA.length === 3 && !liveA[0].hasOculta() && liveA[0].postId() === '521' && liveA[0].schedAt() === '2026-11-07T22:00:00.000Z'
  && liveA[0].html.includes('Se postea mañana'),
  'A: tras aplicar, idx 0 es la carta 521 ABIERTA (R1)');
t(liveA.filter((c) => c.hasOculta()).length === 0, 'A: CERO cartas veladas en la grilla (la de mañana ya va abierta)');
t(appended.length === 1 && appended[0].innerHTML.includes('¡Tu posteo salió!'),
  'A: la celebración al publicar sigue viva en el mismo tick');

// ---------- B: hoy vencido sin salir → la próxima NO aparece (el loop no avanza con el reloj) ----------
console.log('— B: 519 vencido sin salir, la carta de mañana NO aparece');
setNow('2026-11-06T23:30:00.000Z'); // 18:30 EST, 519 sigue scheduled con hora pasada
const allB = [P519s, P521, P518];
const tilesB = compose([{ p: P519s, ymd: '2026-11-06' }, { p: P521, ymd: '2026-11-07' }], [P518], allB);
t(tilesB.every((tl) => tl.kind !== 'oculta'),
  'B: con el 519 vencido y sin publicar, NO hay carta del próximo (con input.all)');
const tilesB2 = compose([{ p: P519s, ymd: '2026-11-06' }, { p: P521, ymd: '2026-11-07' }], [P518]);
t(tilesB2.every((tl) => tl.kind !== 'oculta'),
  'B: lo mismo sin input.all (fallback a upcoming: el freno también lo ve ahí)');
t(tilesB.some((tl) => tl.kind === 'post' && tl.post.id === 519),
  'B: el 519 vencido sigue rindiendo como tile de hoy (no desaparece en silencio)');
// El vivo también respeta el freno: la carta vieja se quita y no entra ninguna.
const snapB = sb.hfLiveSnapshot(tilesB, PROF);
const diffB = sb.hfLiveDiff(snapPrevA, snapB);
t(diffB.removed.includes('oculta:519') && !diffB.added.some((id) => String(id).startsWith('oculta:'))
  && diffB.justPublished.length === 0,
  'B: el diff quita la carta 519 sin agregar carta nueva ni celebrar nada');
renderIntoGrid(tilesPrevA);
sb.hfLiveApply({ tiles: tilesB, props: {}, prof: PROF, diff: diffB });
t(grid.live().filter((c) => c.hasMagia()).length === 0,
  'B: tras aplicar, la grilla no tiene carta del próximo');

// ---------- C: hoy en publicación → NO aparece ----------
console.log('— C: 519 en publicación, la carta de mañana NO aparece');
setNow('2026-11-06T22:30:00.000Z');
const tilesC = compose([{ p: P521, ymd: '2026-11-07' }], [P518], [P519pub, P521, P518]);
t(tilesC.every((tl) => tl.kind !== 'oculta'),
  'C: con el 519 en publishing, NO hay carta del próximo');

// ---------- D: hoy fallido → NO aparece ----------
console.log('— D: 519 fallido, la carta de mañana NO aparece');
const tilesD = compose([{ p: P521, ymd: '2026-11-07' }], [P518], [P519f, P521, P518]);
t(tilesD.every((tl) => tl.kind !== 'oculta'),
  'D: con el 519 en failed, NO hay carta del próximo');

// ---------- E: hoy programado a futuro → la carta es la de hoy (entrada al ritual) ----------
console.log('— E: 519 programado para las 17:00, la carta sigue siendo la de hoy');
setNow('2026-11-06T21:30:00.000Z'); // 16:30 EST
const P519hoy = Object.assign({}, P519s, { created_at: '2026-11-06T12:00:00.000Z' }); // creado hoy: no destapado
const tilesE = compose([{ p: P519hoy, ymd: '2026-11-06' }, { p: P521, ymd: '2026-11-07' }], [P518], [P519hoy, P521, P518]);
t(tilesE[0].kind === 'oculta' && tilesE[0].post.id === 519 && tilesE[0].openHoy === true,
  'E: antes de las 17:00 la carta es la de hoy, ABIERTA (openHoy true — LOTE SACAR-CARTA-VELADA)');
const htmlE = sb.homeTileHTML(tilesE[0], 0);
t(htmlE.includes('Se postea hoy · 17:00') && htmlE.includes('<img') && htmlE.includes('data-post-id="519"')
  && !htmlE.includes('hf-carta-oculta') && !htmlE.includes('hf-carta-velo'),
  'E: la carta de hoy dice «Se postea hoy · 17:00» (foto + pill de salida, sin velo)');
t(!htmlE.includes('hf-carta-destapa'),
  'E: la carta de hoy NO lleva línea de destape (su 00:00 ya pasó: no se inventa)');
t(htmlE.includes('data-post-id="519"') && !htmlE.includes('data-pz-abrir-ritual'),
  'E (LOTE SACAR-CARTA-VELADA): la carta de hoy YA NO abre el ritual (abre el detalle del posteo; el ritual sigue por el aviso de las 9:00 y #/app/ritual)');

// ---------- F: sin posteo hoy, la carta del próximo aparece igual ----------
console.log('— F: sin posteo hoy, el próximo aparece (nada que esperar)');
setNow('2026-11-06T22:30:00.000Z');
const tilesF = compose([{ p: P521, ymd: '2026-11-07' }], [P518], [P521, P518]);
t(tilesF[0].kind === 'oculta' && tilesF[0].post.id === 521,
  'F: sin posteo hoy, la carta es la del próximo (el freno solo frena si hoy hay algo pendiente)');

// ---------- G: a las 00:00 se destapa ----------
console.log('— G: a las 00:00 del día del posteo, la carta se abre sola');
setNow('2026-11-07T05:00:00.000Z'); // 00:00 EST 7/11
const tilesG = compose([{ p: P521old, ymd: '2026-11-07' }], [P519p, P518], [P521old, P519p, P518]);
t(tilesG[0].kind === 'oculta' && tilesG[0].post.id === 521 && tilesG[0].openHoy === true,
  'G: a las 00:00 el próximo es abierto (openHoy true: creado antes de medianoche)');
const htmlG = sb.homeTileHTML(tilesG[0], 0);
t(htmlG.includes('data-post-id="521"') && htmlG.includes('<img') && !htmlG.includes('hf-carta-oculta'),
  'G: la carta abierta muestra la foto y abre el detalle (sin velo)');
t(!htmlG.includes('hf-carta-destapa'),
  'G: la carta abierta NO lleva línea de destape (ya se destapó)');
t(sb.pzProximoYaAbierto(P521old, Date.parse('2026-11-07T04:59:00.000Z'), 'America/New_York') === false,
  'G: un minuto antes de las 00:00 el ritual todavía no lo marca abierto (pzProximoYaAbierto false; el destape del ritual es a las 00:00, no antes)');
// El tick de 1 s fuerza el vivo al llegar a 0.
liveTickCalls.length = 0;
const cuentaEl = {
  innerHTML: '',
  getAttribute: (k) => (k === 'data-pz-cuenta-abre' ? '2026-11-07T05:00:00.000Z' : null),
};
sb.document.querySelector = (sel) => (sel === '[data-pz-cuenta-abre]' ? cuentaEl : null);
setNow('2026-11-07T05:00:01.000Z'); // 1 s después de las 00:00
sb.hfCuentaAbreTick();
t(liveTickCalls.length === 1 && liveTickCalls[0] === true,
  'G: el tick de 1 s fuerza hfLiveTick(true) al llegar a 0 (la carta se abre sola)');
liveTickCalls.length = 0;
setNow('2026-11-07T04:59:00.000Z'); // 1 min antes
sb.hfCuentaAbreTick();
t(liveTickCalls.length === 0 && cuentaEl.innerHTML.includes('para ver tu próximo posteo'),
  'G: antes de las 00:00 el tick solo actualiza la cuenta (no fuerza el vivo)');
sb.document.querySelector = () => null;

// ---------- H: sin próximo no hay carta (honesta) ----------
console.log('— H: sin próximo programado no hay carta');
setNow('2026-11-06T22:30:00.000Z');
const tilesH = compose([], [P519p, P518], [P519p, P518]);
t(tilesH.every((tl) => tl.kind !== 'oculta'),
  'H: publicado hoy y sin próximo, no hay carta (nada inventado, nada vacío)');

// ---------- I: la carta nunca publica ----------
console.log('— I: la carta es una tarjeta, no un posteo');
t(!htmlA.includes('<button') && !htmlA.includes('Sale así') && !htmlA.includes('data-pz-ritual-ok')
  && !htmlA.includes('aprobar') && !htmlA.includes('publicar'),
  'I: la carta no tiene botón, ni «Sale así», ni publicar (jamás publica sola)');
t(tilesA[0].kind === 'oculta' && !('publish' in tilesA[0]),
  'I: el tile oculta no lleva acción de publicar en su estructura');

// ---------- J: la confirmación de las 9:00 sigue igual ----------
console.log('— J: la confirmación de las 9:00 no se tocó');
t(APP.includes('Sale así') && APP.includes('data-pz-ritual-ok')
  && APP.includes('function pzRitualConfirmar'),
  'J: el botón [Sale así] y pzRitualConfirmar siguen en app.js');
t(APP.includes('tu paquete se abre en') && APP.includes('pz-ritual-cuenta'),
  'J: la cuenta de la mañana (apertura 9:00) sigue en el ritual');
t(APP.includes("pz-ritual-pack-chip") && APP.includes('hoy · 9:00'),
  'J: el paquete de hoy sigue marcado «hoy · 9:00»');
t(!APP.includes('RITUAL-SIGUIENTE') || APP.includes('function pzRitualConfirmar'),
  'J: el lote no tocó el flujo de confirmación (solo la carta y su freno)');

// ---------- K: stories y fijados nunca son la carta ----------
console.log('— K: stories y fijados nunca son la carta');
setNow('2026-11-06T22:30:00.000Z');
const tilesK = compose([{ p: STORY, ymd: '2026-11-07' }, { p: PINNED, ymd: '2026-11-07' }], [P519p, P518], [STORY, PINNED, P519p, P518]);
t(tilesK.every((tl) => tl.kind !== 'oculta'),
  'K: solo una story y un fijado mañana → no hay carta (ni story ni fijado)');

// ---------- L: EN ----------
// (LOTE REDISEÑO R1 · 8/11) Igual que A, en inglés: pill «Goes out tomorrow»
// y cuenta de salida; sin «It opens at 00:00».
console.log('— L: EN — la carta dice «Goes out tomorrow · 05:00 PM» (R1)');
setNow('2026-11-06T22:30:00.000Z');
setLang('en');
const tilesL = compose([{ p: P521, ymd: '2026-11-07' }], [P519p, P518], [P519p, P521, P518]);
t(tilesL[0].kind === 'oculta' && tilesL[0].post.id === 521, 'L: en EN la carta sigue siendo la 521');
const htmlL = sb.homeTileHTML(tilesL[0], 0);
t(!htmlL.includes('It opens at') && htmlL.includes('data-pz-cuenta-sale="2026-11-07T22:00:00.000Z"'), 'L: EN sin «It opens at 00:00»; cuenta de salida');
t(htmlL.includes('Goes out tomorrow') && htmlL.includes('05:00 PM'),
  'L: EN la pill dice «Goes out tomorrow · 05:00 PM»');
setLang('es');

// ---------- Resumen ----------
console.log(`\nritual-siguiente: ${okN} ok, ${badN} mal`);
if (badN) process.exit(1);
