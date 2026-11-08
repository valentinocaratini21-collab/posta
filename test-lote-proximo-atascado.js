'use strict';
/* test-lote-proximo-atascado.js — LOTE PROXIMO-ATASCADO · 6/11
 * Reporte Valentino 6/11 17:06 (captura iOS): la carta velada «El próximo
 * / Hoy · 17:00» quedó trabada mostrando el 519 aunque el 519 YA SALIÓ
 * (published, «Recién publicado») y el próximo real es el 521 (mañana
 * 17:00). Causa raíz: hfLiveSnapshot solo registraba kind 'post'/'ig' —
 * la carta velada (kind 'oculta', idx 0) era invisible al diff vivo, y
 * hfLiveApply buscaba por data-post-id, que la velada no lleva por
 * diseño. El vivo nunca quitaba la carta vieja ni insertaba la nueva.
 * El test reproduce el escenario exacto con el código real extraído de
 * public/app.js (bloque HOME_FEED + hfLiveApply) y un DOM falso mínimo.
 * Reloj fijo: 6/11 16:30 EST (21:30Z), antes de las 17:00.
 * Uso: node test-lote-proximo-atascado.js
 * NOTA R1 (8/11): la decisión 8/11 00:05 (cartita SIN velo) SUPERSEDE el
 * destape «a las 00:00» del 6/11 SOLO para el posteo de un día futuro: la
 * carta de mañana va ABIERTA (casos A y E actualizados a la carta abierta);
 * la carta de HOY sin elegir sigue velada (casos C y D intactos). El bug
 * que caza esta suite (el vivo no veía la carta) no cambia: el diff y el
 * snapshot siguen iguales.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };

const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const FIXED_NOW = Date.parse('2026-11-06T21:30:00.000Z'); // 6/11 16:30 EST

class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [FIXED_NOW])); }
  static now() { return FIXED_NOW; }
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
    this._l = {};
    this._q = {};
    this.className = '';
    this.id = '';
  }
  addEventListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }
  querySelector(sel) { return this._q[sel] || new El('button'); }
  querySelectorAll() { return []; }
  setAttribute(k, v) { this['attr_' + k] = v; }
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
const appended = [];
const sonidos = [];
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
  pzSonido: (n) => { sonidos.push(n); },
  pzSemanaAprobadaSync: () => { syncCalls++; },
  hfFeedGesturesBind: () => {},
  bindScfMinis: () => {},
  hfDurBind: () => {},
  hfIsEn: () => false,
  HF_VISITOR: false,
  HF_LIVE: { started: false, busy: false, lastFetch: 0, snap: null, pending: null, justPub: new Set() },
  HF_CUR_PROF: PROF,
  HOME_PROF: PROF,
  HF_PROPS: {},
  HF_TILES: [],
};
vm.createContext(sb);

// Bloque HOME_FEED real (homeGridCompose, homeTileHTML, hfLiveSnapshot,
// hfLiveDiff, hfChipText, hfWhenChip, pcDayKeyShift, ...).
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
  && typeof sb.hfLiveSnapshot === 'function' && typeof sb.hfLiveDiff === 'function',
  'HOME_FEED carga en el sandbox');

// hfLiveApply + celebración (fuera del bloque HOME_FEED).
function extractFn(src, name) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  const end = src.indexOf('\n}\n', start);
  return end < 0 ? '' : src.slice(start, end + 3);
}
for (const n of ['hfLiveApply', 'pzPubCelebMaybe', 'pzPubCelebShow']) {
  const code = extractFn(APP, n);
  t(code.length > 0, 'existe ' + n);
  if (code) vm.runInContext(code.replace('function ' + n, 'globalThis.' + n + ' = function'), sb);
}
t(typeof sb.hfLiveApply === 'function', 'hfLiveApply carga en el sandbox');

// ---------- Fixtures: el reporte exacto ----------
// 519 = hoy 17:00 EST (22:00Z 6/11) · 521 = mañana 17:00 EST (22:00Z 7/11) · 518 = publicado ayer.
const P518 = { id: 518, status: 'published', media_type: 'image', image_path: '/m/518.jpg', caption: 'El perfume de siempre', published_at: '2026-11-05T22:00:00.000Z', scheduled_at: '2026-11-05T22:00:00.000Z', pinned: 0, approval: 'approved' };
const P519s = { id: 519, status: 'scheduled', media_type: 'image', image_path: '/m/519.jpg', caption: 'La torta del día', scheduled_at: '2026-11-06T22:00:00.000Z', pinned: 0, approval: 'approved' };
const P519p = Object.assign({}, P519s, { status: 'published', published_at: '2026-11-06T22:00:00.000Z' });
const P521 = { id: 521, status: 'scheduled', media_type: 'image', image_path: '/m/521.jpg', caption: 'Mañana sale esto', scheduled_at: '2026-11-07T22:00:00.000Z', pinned: 0, approval: 'approved' };

function compose(upcoming, published, ritual) {
  return sb.homeGridCompose({ upcoming, published, recents: [], ritual: (ritual === undefined ? null : ritual) });
}
function renderIntoGrid(tiles) {
  grid.cells = tiles.map((tl, i) => new Cell(sb.homeTileHTML(tl, i), grid));
}

// ---------- Caso A: el reporte — 519 sale, el próximo pasa a ser 521 ----------
console.log('— A: 519 sale a las 17:00, el próximo es 521 (mañana 17:00)');
ritFlag.pendiente = true;
const tilesPrev = compose([{ p: P519s, ymd: '2026-11-06' }, { p: P521, ymd: '2026-11-07' }], [P518]);
t(tilesPrev.length === 2 && tilesPrev[0].kind === 'oculta' && tilesPrev[0].post.id === 519
  && tilesPrev[1].kind === 'post' && tilesPrev[1].post.id === 518,
  'A: antes de las 17:00 la grilla es [oculta 519, publicado 518]');
t(tilesPrev[0].openHoy === false, 'A: la carta de hoy sin elegir va velada (openHoy false)');
const htmlPrev = sb.homeTileHTML(tilesPrev[0], 0);
t(htmlPrev.includes('hf-carta-oculta') && !htmlPrev.includes('data-post-id') && htmlPrev.includes('Hoy'),
  'A: la carta velada no lleva data-post-id y su chapita dice Hoy');
const snapPrev = sb.hfLiveSnapshot(tilesPrev, PROF);
t(snapPrev.posts['oculta:519'] && snapPrev.posts['oculta:519'].status === 'oculta'
  && snapPrev.posts['oculta:519'].scheduled_at === '2026-11-06T22:00:00.000Z'
  && snapPrev.posts['oculta:519'].openHoy === 0,
  'A: el snapshot registra la carta oculta 519 (status oculta, scheduled_at real, openHoy 0)');
const tilesNext = compose([{ p: P521, ymd: '2026-11-07' }], [P519p, P518]);
t(tilesNext.length === 3 && tilesNext[0].kind === 'oculta' && tilesNext[0].post.id === 521
  && tilesNext[1].kind === 'post' && tilesNext[1].post.id === 519,
  'A: después de las 17:00 la composición es [oculta 521, publicado 519, publicado 518]');
const snapNext = sb.hfLiveSnapshot(tilesNext, PROF);
const diff = sb.hfLiveDiff(snapPrev, snapNext);
t(diff.added.includes('519') && diff.added.includes('oculta:521'),
  'A: el diff agrega el 519 publicado y la carta oculta 521');
t(diff.removed.includes('oculta:519'), 'A: el diff quita la carta oculta 519');
t(diff.justPublished.length === 1 && diff.justPublished[0] === '519',
  'A: justPublished es solo el 519 (la carta oculta no celebra)');
t(diff.changed.length === 0, 'A: nada cambia de lugar (solo agregado/quitado)');

renderIntoGrid(tilesPrev);
const cell518Before = grid.cells[1];
sb.hfLiveApply({ tiles: tilesNext, props: {}, prof: PROF, diff });
const live = grid.live();
t(live.length === 3, 'A: la grilla final tiene 3 celdas');
t(live[0].postId() === '521' && !live[0].hasOculta() && live[0].schedAt() === '2026-11-07T22:00:00.000Z'
  && live[0].html.includes('Se postea mañana') && live[0].html.includes('17:00') && live[0].html.includes('<img'),
  'A: idx 0 es la carta 521 ABIERTA (R1: «Se postea mañana · 17:00», foto, data-post-id)');
t(live.filter((c) => c.hasOculta()).length === 0, 'A: CERO cartas veladas en la grilla (la de mañana ya va abierta)');
t(!live.some((c) => c.hasOculta() && c.schedAt() === '2026-11-06T22:00:00.000Z'),
  'A: CERO carta oculta 519 (ni rastro de la vieja)');
t(live[1].postId() === '519' && live[1].tileClasses().includes('hf-justpub')
  && live[1].html.includes('Recién publicado'),
  'A: idx 1 es el 519 publicado con «Recién publicado»');
t(live[2] === cell518Before && live[2].postId() === '518',
  'A: el 518 no se toca (misma celda, misma posición, sin re-render)');
t(appended.length === 1 && appended[0].innerHTML.includes('¡Tu posteo salió!'),
  'A: la celebración al publicar sigue viva (overlay «¡Tu posteo salió!»)');
t((store.get('pzPubCeleb') || '').includes('519'), 'A: la celebración marca el 519 como celebrado');

// ---------- Caso B: sin próximo futuro no hay carta ----------
console.log('— B: sin próximo futuro no hay carta');
const tilesB = compose([], [P519p, P518]);
t(tilesB.every((tl) => tl.kind !== 'oculta'), 'B: sin programados futuros la composición no trae carta');
const diffB = sb.hfLiveDiff(snapPrev, sb.hfLiveSnapshot(tilesB, PROF));
t(diffB.removed.includes('oculta:519') && !diffB.added.some((id) => String(id).startsWith('oculta:')),
  'B: el diff quita la carta vieja y no agrega ninguna');
renderIntoGrid(tilesPrev);
sb.hfLiveApply({ tiles: tilesB, props: {}, prof: PROF, diff: diffB });
t(grid.live().filter((c) => c.hasMagia()).length === 0, 'B: tras aplicar, la grilla no tiene carta del próximo');

// ---------- Caso C: próximo de hoy sin elegir sigue velado ----------
console.log('— C: próximo de hoy sin elegir sigue velado');
ritFlag.pendiente = true;
const tilesC = compose([{ p: P519s, ymd: '2026-11-06' }], [P518]);
t(tilesC[0].kind === 'oculta' && tilesC[0].openHoy === false, 'C: hoy sin elegir → openHoy false');
const htmlC = sb.homeTileHTML(tilesC[0], 0);
t(htmlC.includes('hf-carta-oculta') && !htmlC.includes('data-post-id') && htmlC.includes('data-pz-abrir-ritual'),
  'C: la carta de hoy sin elegir es velada, sin data-post-id, abre el ritual');

// ---------- Caso D: próximo de hoy elegido sigue abierto (y el vivo refleja el cambio) ----------
console.log('— D: próximo de hoy elegido sigue abierto');
ritFlag.pendiente = false;
const tilesD = compose([{ p: P519s, ymd: '2026-11-06' }], [P518]);
t(tilesD[0].kind === 'oculta' && tilesD[0].openHoy === true, 'D: hoy elegido → openHoy true');
const htmlD = sb.homeTileHTML(tilesD[0], 0);
t(htmlD.includes('data-post-id="519"') && !htmlD.includes('hf-carta-oculta') && htmlD.includes('<img'),
  'D: la carta de hoy elegido es abierta (foto visible, data-post-id, sin velo)');
const snapC = sb.hfLiveSnapshot(tilesC, PROF);
const snapD = sb.hfLiveSnapshot(tilesD, PROF);
const diffD = sb.hfLiveDiff(snapC, snapD);
t(diffD.changed.length === 1 && diffD.changed[0] === 'oculta:519' && diffD.justPublished.length === 0,
  'D: elegir en el ritual se ve como changed de la carta (sin celebrar nada)');
renderIntoGrid(tilesC);
const cellsBeforeD = grid.live().length;
sb.hfLiveApply({ tiles: tilesD, props: {}, prof: PROF, diff: diffD });
t(grid.live().length === cellsBeforeD && grid.live()[0].postId() === '519'
  && !grid.live()[0].hasOculta() && grid.live()[0].html.includes('<img'),
  'D: el vivo reemplaza la velada por la abierta en el mismo lugar (idx 0, sin duplicar)');

// ---------- Caso E: reprogramar el próximo cambia su chapita en el lugar ----------
console.log('— E: el próximo reprogramado cambia su chapita en el lugar');
ritFlag.pendiente = true;
const P521b = Object.assign({}, P521, { scheduled_at: '2026-11-08T00:00:00.000Z' }); // 7/11 19:00 EST
const tilesE1 = compose([{ p: P521, ymd: '2026-11-07' }], [P518]);
const tilesE2 = compose([{ p: P521b, ymd: '2026-11-07' }], [P518]);
const diffE = sb.hfLiveDiff(sb.hfLiveSnapshot(tilesE1, PROF), sb.hfLiveSnapshot(tilesE2, PROF));
t(diffE.changed.length === 1 && diffE.changed[0] === 'oculta:521',
  'E: reprogramar el próximo se ve como changed de su carta');
renderIntoGrid(tilesE1);
sb.hfLiveApply({ tiles: tilesE2, props: {}, prof: PROF, diff: diffE });
t(grid.live().length === 2 && !grid.live()[0].hasOculta() && grid.live()[0].postId() === '521'
  && grid.live()[0].html.includes('19:00') && grid.live()[0].schedAt() === '2026-11-08T00:00:00.000Z',
  'E: la carta sigue en idx 0 con la hora nueva (19:00), sin duplicar (R1: abierta, con data-post-id)');

// ---------- Resumen ----------
console.log(`\nproximo-atascado: ${okN} ok, ${badN} mal`);
if (badN) process.exit(1);
