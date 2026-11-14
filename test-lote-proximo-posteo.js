'use strict';
/* test-lote-proximo-posteo.js — LOTE PROXIMO-POSTEO-AVANZA
 * Defecto (confirmado en 4 auditorías de la serie de pruebas — Crumbl,
 * Byredo, Veja ×2): el botón «Ver próximo posteo» (la carta mágica de
 * Inicio, tile kind 'oculta' de homeTileHTML) NO avanzaba: reabría el
 * posteo 1 aunque el posteo 2 (y el 3) ya existían.
 *
 * Causa raíz: la selección de la carta en homeGridCompose elegía el
 * programado futuro más cercano. Mientras el posteo de HOY sigue
 * pendiente, ese ES el posteo de hoy — el primero del conjunto y el
 * mismo que el héroe de Hoy ya muestra. Los posteos 2 y 3 de la prueba
 * no rinden como tiles en Inicio (días futuros), así que la carta era
 * la única puerta a ellos… y apuntaba al 1.
 *
 * Arreglo (solo invitado = la prueba; el registrado no cambia):
 * la carta del invitado es el posteo SIGUIENTE al de hoy dentro del
 * conjunto, por fecha de programación. El avance 1→2→3 ocurre con la
 * composición (el patrón de avance automático de siempre: al salir el
 * de hoy, el siguiente se vuelve el «de hoy» y la carta pasa al que
 * sigue). Al llegar al último: NO hay carta (fail-closed, el patrón
 * propio de esta UI — «sin próximo no hay carta»), y el último posteo
 * sigue visible como su tile normal. Con 1 solo posteo no hay carta y
 * nada se rompe. La sesión del invitado no se toca: el camino del clic
 * sigue siendo el de v926 (scfOpenPop en la misma pantalla).
 *
 * Uso: node test-lote-proximo-posteo.js
 *      PROX_TREE=<árbol> node test-lote-proximo-posteo.js   (control)
 * Contra la BASE (v980) los checks de avance/estampado FALLAN: es el
 * control que reproduce el defecto (la carta reabre el posteo 1).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let okN = 0, badN = 0;
const t = (cond, name) => { if (cond) { okN++; } else { badN++; console.log('✗', name); } };

const TREE = process.env.PROX_TREE || __dirname;
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const IDX = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const ENIDX = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');

let NOW_MS = Date.parse('2026-11-13T15:00:00.000Z'); // día 1, 12:00 ART
class FakeDate extends Date {
  constructor(...a) { super(...(a.length ? a : [NOW_MS])); }
  static now() { return NOW_MS; }
}

// ---------- Sandbox (patrón de test-lote-ritual-siguiente) ----------
const store = new Map();
const PROF = { posts_count: 12, followers: 8, following: 1, recents: [] };
const sb = {
  console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
  Date: FakeDate, Math, JSON, Intl, Map, Set,
  esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  mv: (p) => p,
  pzIc: () => '',
  pcTz: () => 'America/Argentina/Buenos_Aires',
  pcParseDate: (s0) => { const s = String(s0 || '').replace(' ', 'T'); if (!s) return null; const x = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z'; const d = new FakeDate(x); return isNaN(d) ? null : d; },
  schedDayKeyOf: (dt, tz) => { try { return dt.toLocaleDateString('en-CA', { timeZone: tz }); } catch (e) { return ''; } },
  slotHour: () => 19,
  ME: { lang: 'es' },
  document: {
    hidden: false, activeElement: null,
    body: { appendChild: () => {} },
    getElementById: () => null,
    createElement: (tag) => ({ tagName: tag, dataset: {}, style: {}, className: '', id: '', innerHTML: '', addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [], setAttribute: () => {}, remove: () => {} }),
    querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {},
  },
  window: { addEventListener: () => {} },
  location: { hash: '#/app/inicio' },
  CSS: { escape: (s) => String(s) },
  sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
  pzRitualPendiente: () => true,
  pzRitualSelLeer: () => 0,
  pzProximoYaAbierto: () => false,
  pzIsGuest: () => true,
  HF_VISITOR: false,
  HF_LIVE: { started: false, busy: false, lastFetch: 0, snap: null, pending: null, justPub: new Set() },
  HF_CUR_PROF: PROF, HOME_PROF: PROF, HF_PROPS: {}, HF_TILES: [],
};
vm.createContext(sb);

const a = APP.indexOf('const HOME_FEED_CAP');
const b = APP.indexOf('/* ===== /HOME_FEED ===== */', a);
t(a > 0 && b > a, 'bloque HOME_FEED delimitado en app.js');
vm.runInContext(APP.slice(a, b), sb);
const h1 = APP.indexOf('/* ===== LOTE REDISEÑO R1 · HOY');
const h2 = APP.indexOf('async function inicioView() {', h1);
t(h1 > 0 && h2 > h1, 'bloque HOY-R1 delimitado en app.js');
vm.runInContext(APP.slice(h1, h2), sb);
t(typeof sb.homeGridCompose === 'function' && typeof sb.homeTileHTML === 'function',
  'HOME_FEED carga en el sandbox (compose + tile)');

// ---------- Marcadores y estampado ----------
t(APP.includes('LOTE PROXIMO-POSTEO-AVANZA'), 'app.js lleva el marcador del lote');
t((APP.split("guest: (typeof pzIsGuest === 'function' && pzIsGuest())").length - 1) === 4,
  'los 4 llamadores de homeGridCompose pasan guest (inicio, feed, vivo, F3)');
t(SRV.includes("BUILD_ID = '20261105-v1068'"), 'server.js BUILD_ID v1068');
t(IDX.includes('app.js?v=725'), 'index ES sirve app.js?v=725');
t(!ENIDX.includes('app.js?v='), 'index EN sin app.js?v= (como siempre)');

// ---------- Sesión del invitado (v926 intacta) ----------
t(APP.includes('scfOpenPop(w, true)'), 'el clic del invitado sigue abriendo en la misma pantalla (v926)');
t(APP.includes('aria-label="${en ? \'See next post\' : \'Ver próximo posteo\'}"') || APP.includes('Ver próximo posteo'),
  'el aria-label «Ver próximo posteo» sigue en la carta');

// ---------- Fixtures: la prueba de 3 posteos (días 1–3, 19:00) ----------
const P1 = { id: 101, status: 'scheduled', media_type: 'image', image_path: '/m/101.jpg', caption: 'Posteo 1', scheduled_at: '2026-11-13 19:00:00', pinned: 0, approval: 'approved' };
const P2 = { id: 102, status: 'scheduled', media_type: 'image', image_path: '/m/102.jpg', caption: 'Posteo 2', scheduled_at: '2026-11-14 19:00:00', pinned: 0, approval: 'approved' };
const P3 = { id: 103, status: 'scheduled', media_type: 'image', image_path: '/m/103.jpg', caption: 'Posteo 3', scheduled_at: '2026-11-15 19:00:00', pinned: 0, approval: 'approved' };
const P1pub = Object.assign({}, P1, { status: 'published', published_at: '2026-11-13T22:05:00.000Z' });
const P2pub = Object.assign({}, P2, { status: 'published', published_at: '2026-11-14T22:05:00.000Z' });
const up = (list) => list.map((p) => ({ p, ymd: String(p.scheduled_at).slice(0, 10) }));
function compose(upcoming, published, all, guest) {
  const input = { upcoming, published, recents: [], ritual: null, all };
  if (guest !== undefined) input.guest = guest;
  return sb.homeGridCompose(input);
}
const carta = (tiles) => tiles.find((x) => x.kind === 'oculta') || null;
function setNow(iso) { NOW_MS = Date.parse(iso); }

// ---------- 1 · Día 1: la carta AVANZA al posteo 2 (el defecto) ----------
console.log('— 1: día 1 de la prueba, el invitado toca «Ver próximo posteo»');
setNow('2026-11-13T15:00:00.000Z');
const tiles1 = compose(up([P1, P2, P3]), [], [P1, P2, P3], true);
t(!!carta(tiles1) && carta(tiles1).post.id === 102,
  '1a: la carta del invitado es el posteo 2 (102), NO reabre el 1');
t(tiles1.some((x) => x.kind === 'post' && x.post.id === 101),
  '1b: el posteo 1 sigue visible como su tile de hoy (no desaparece)');
const html1 = sb.homeTileHTML(carta(tiles1), 0);
t(html1.includes('data-post-id="102"') && html1.includes('Ver próximo posteo'),
  '1c: el botón rendido lleva data-post-id=102 con su aria-label');

// ---------- 2 · Día 2: el avance sigue, 2 es el de hoy y la carta es el 3 ----------
console.log('— 2: día 2, el avance 1→2→3 continúa');
setNow('2026-11-14T15:00:00.000Z');
const tiles2 = compose(up([P2, P3]), [P1pub], [P1pub, P2, P3], true);
t(!!carta(tiles2) && carta(tiles2).post.id === 103,
  '2a: con el 1 publicado y el 2 como posteo de hoy, la carta es el 3 (103)');

// ---------- 3 · Día 3: el último — comportamiento honesto ----------
console.log('— 3: día 3, el último posteo del conjunto');
setNow('2026-11-15T15:00:00.000Z');
const tiles3 = compose(up([P3]), [P1pub, P2pub], [P1pub, P2pub, P3], true);
t(!carta(tiles3), '3a: siendo el 3 el último, NO hay carta (fail-closed, sin próximo no hay carta)');
t(tiles3.some((x) => x.kind === 'post' && x.post.id === 103),
  '3b: el posteo 3 sigue visible como su tile normal');

// ---------- 4 · Un solo posteo: no rompe nada ----------
console.log('— 4: conjunto de 1 solo posteo');
setNow('2026-11-13T15:00:00.000Z');
let tiles4 = null, err4 = null;
try { tiles4 = compose(up([P1]), [], [P1], true); } catch (e) { err4 = e; }
t(!err4 && tiles4 && !carta(tiles4) && tiles4.some((x) => x.kind === 'post' && x.post.id === 101),
  '4a: con 1 posteo no hay carta, el posteo rinde y nada se rompe');

// ---------- 5 · Antes de que arranque: el próximo por salir NO se salta ----------
console.log('— 5: víspera de la prueba (hoy sin posteo)');
setNow('2026-11-12T15:00:00.000Z');
const tiles5 = compose(up([P1, P2, P3]), [], [P1, P2, P3], true);
t(!!carta(tiles5) && carta(tiles5).post.id === 101,
  '5a: sin posteo de hoy, la carta es el próximo por salir (101), sin saltarlo');

// ---------- 6 · Posteo 1 vencido y retenido: la carta igual avanza ----------
console.log('— 6: día 1 a la noche, el posteo 1 sigue programado (retenido)');
setNow('2026-11-13T23:30:00.000Z');
const tiles6 = compose(up([P1, P2, P3]), [], [P1, P2, P3], true);
t(!!carta(tiles6) && carta(tiles6).post.id === 102,
  '6a: con el 1 vencido pero pendiente, la carta avanza al 2 (102)');

// ---------- 7 · Registrado: comportamiento intacto ----------
console.log('— 7: el flujo registrado NO cambia');
setNow('2026-11-13T15:00:00.000Z');
const tiles7 = compose(up([P1, P2, P3]), [], [P1, P2, P3], false);
t(!!carta(tiles7) && carta(tiles7).post.id === 101,
  '7a: sin flag de invitado, la carta sigue siendo la vigente (el de hoy, 101)');
const tiles7b = compose(up([P1, P2, P3]), [], [P1, P2, P3], undefined);
t(!!carta(tiles7b) && carta(tiles7b).post.id === 101,
  '7b: sin flag (extracciones viejas), mismo comportamiento histórico');

// ---------- 8 · EN: el botón en inglés también avanza ----------
console.log('— 8: interfaz en inglés');
sb.ME.lang = 'en';
setNow('2026-11-13T15:00:00.000Z');
const tiles8 = compose(up([P1, P2, P3]), [], [P1, P2, P3], true);
const html8 = sb.homeTileHTML(carta(tiles8), 0);
t(html8.includes('data-post-id="102"') && html8.includes('See next post'),
  '8a: «See next post» también resuelve al posteo 2');
sb.ME.lang = 'es';

console.log(`\nTOTAL: ${okN} OK · ${badN} FALLOS`);
process.exit(badN ? 1 : 0);
