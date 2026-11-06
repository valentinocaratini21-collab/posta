// test-lote-proximoritual.js — LOTE PROXIMO-RITUAL · AJUSTE MAÑANA (5/11 ·
// decisión Valentino 11:31 + regla co-creado 11:39 + precisión chat
// 11:51 + confirmación 2 opciones 11:53 «perfecto»).
// RITUAL DE LA MAÑANA: cada mañana el cliente se levanta con el posteo
// del día armado. Entrada a pantalla completa (puerta matutina en
// Inicio + push 9:00) → paquete velado → tocarlo muestra las 3
// opciones (veladas, por rubro) → elegir REVELA el posteo (foto +
// texto) → confirmación 2 opciones: [Sale así] / [Cambiar algo].
// [Sale así] aprueba y publica hoy (ahí vive la aprobación, con la
// revelación FIFA); [Cambiar algo] abre el chat CON ese posteo en
// pantalla (momento 2 del chat: nunca caja vacía, nunca la semana
// como contexto). Sin elección, publica la recomendada (v687 intacto).
// La carta de hoy en el feed queda VELADA hasta elegir; después de
// elegir se abre como el posteo elegido (v691 post-elección). Día con
// posteo co-creado acordado: sin ritual esa mañana (el servidor no
// devuelve paquete; la puerta es feed normal, sin error).
// 1) POSICIÓN: carta PRIMERA (idx 0, arriba a la izquierda — decisión
//    Valentino 5/11 ~13:26, SUPERSEDE v1: tras el último publicado del día).
// 2) VELO DE HOY: pre-elección velada, post-elección abierta, día
//    co-creado abierta (sin ritual).
// 3) PUERTA MATUTINA: una sola vez por mañana, solo con estado
//    positivo; sin paquete hoy = feed normal.
// 4) HOJA: V (paquete velado) → O (3 opciones veladas) → R (revelada
//    con 2 opciones). Sin auto-open, sin «Abrir mi paquete».
// 5) ELEGIR no aprueba (sin POST); OK aprueba (POST + FIFA en OK).
// 6) HELPERS: puerta/velo/selección puros + M78 22/22.
// 7) RUBRO: cardOf (servidor, intacto).
// 8) ESTÁTICA: banner ausente, fetch de estado VUELVE (propio, fuera
//    del Promise.all), push 9:00 intacta.
// Carga el bundle entero en vm (patrón repro-grid.js) + ritual-manana.js.
// Uso: node test-lote-proximoritual.js (desde el scratch)
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const SRC = fs.readFileSync(path.join(__dirname, 'work', 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(__dirname, 'work', 'server.js'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'work', 'public', 'styles.css'), 'utf8');
const MPP = fs.readFileSync(path.join(__dirname, 'work', 'morning-post-push.js'), 'utf8');
const M = require('./work/ritual-manana.js');

// --- fixture real user 12 (admin) con el 554 CANCELADO (estado vigente) ---
const rawAdmin = fs.readFileSync(path.join(__dirname, 'valentino-posts-12.json'), 'utf8');
const admin = JSON.parse(rawAdmin.slice(rawAdmin.indexOf('{')));
const adminPosts = admin.posts;
const p554 = adminPosts.find((p) => p.id === 554);
if (!p554) { console.log('FAIL fixture: no hay 554 en valentino-posts-12.json'); process.exit(1); }
p554.status = 'cancelled'; // cancelado por Valentino 5/11 ~10:35 (orden «Cancelalo ahora»)

function enrich(p, opts) {
  opts = opts || {};
  const q = {
    id: p.id, user_id: 12,
    media_type: p.media_type, status: p.status,
    scheduled_at: p.scheduled_at || null,
    published_at: p.status === 'published' ? (p.scheduled_at || null) : null,
    created_at: p.created_at || null,
    tipo: p.tipo || '', week_key: p.week_key || '',
    caption: p.cap || '', hashtags: '', source_topic: '',
    strategy_why: p.status === 'scheduled' ? 'Por qué real (fixture)' : null,
    approval: p.status === 'published' ? 'approved' : (p.id === 554 ? 'pending' : 'approved'),
    pinned: false, pinned_at: null,
    ig_permalink: p.status === 'published' && p.media_type !== 'story'
      ? (p.id === 551 ? 'https://www.instagram.com/p/DfVerQ2AQig/' : `https://www.instagram.com/p/DfPost${p.id}/`)
      : null,
    ig_state: p.status === 'published' ? (opts.del551 && p.id === 551 ? 'archived_ext' : 'live') : null,
    overlay_text: '', redo_left: 3, needs_review: 0,
    sales_intent: '', intent: '', signal: null,
    likes: null, comments_count: null, caption_on: 0,
    image_path: null, carousel_paths: null,
  };
  if (p.media_type === 'story') { q.image_path = `/media/story-${p.id}.jpg`; }
  else if (p.media_type === 'carousel') {
    q.image_path = `/media/post-${p.id}-1.jpg`;
    q.carousel_paths = JSON.stringify([`/media/post-${p.id}-1.jpg`, `/media/post-${p.id}-2.jpg`]);
  } else if (p.media_type === 'image' || p.media_type === 'video') {
    q.image_path = `/media/post-${p.id}.jpg`;
  }
  return q;
}

const TZ = 'America/Argentina/Buenos_Aires';
function realRecents() {
  const R = (shortcode, type, isoEst, img) => ({
    img, shortcode, taken_at: Date.parse(isoEst), type, pinned: false, likes: null, comments: null,
  });
  return [
    R('DfVCqgdjCrO', 'carousel', '2026-11-04T13:03:00-05:00', '/media/ig-perfume-car.jpg'),
    R('DfVDDFAjKeG', 'image',    '2026-11-04T13:01:00-05:00', '/media/ig-perfume-foto.jpg'),
    R('DfVC-LFMau1', 'video',    '2026-11-04T13:02:00-05:00', '/media/ig-perfume-reel.jpg'),
    R('DfRrm2Vj8Qa', 'carousel', '2026-11-03T18:03:00-05:00', '/media/ig-cafe-car.jpg'),
    R('DfRt0axD0G0', 'image',    '2026-11-03T18:01:00-05:00', '/media/ig-cafe-foto.jpg'),
    R('DfRsxGrSssF', 'video',    '2026-11-03T18:02:00-05:00', '/media/ig-cafe-reel.jpg'),
    R('DfSinFotos1', 'image',    '2026-11-02T05:26:00-05:00', '/media/ig-sinfotos.jpg'),
    R('DfPrimero1',  'carousel', '2026-11-01T18:00:00-05:00', '/media/ig-primero.jpg'),
    R('DfPar3110',   'image',    '2026-10-31T18:00:00-05:00', '/media/ig-par.jpg'),
  ];
}

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
const locObj = { hash: '#/app/inicio', href: 'https://postycommunitymanager.com/#/app/inicio', pathname: '/', search: '', host: 'postycommunitymanager.com' };
function storeStub() {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  s._keys = () => [...m.keys()];
  return s;
}
const fetchCalls = [];
async function fetchStub(url, opts) {
  fetchCalls.push({ url: String(url), opts: opts || null });
  if (String(url).includes('/api/ritual/elegir')) {
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{"ok":true}' };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
}

const fifaCalls = [];
const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  fetch: fetchStub,
  location: locObj,
  navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', language: 'es-AR', onLine: true },
  localStorage: storeStub(), sessionStorage: storeStub(),
  performance: { now: () => Date.now() },
  AbortSignal, URL, URLSearchParams,
  CustomEvent: function CustomEvent() {}, Event: function Event() {},
  // (lote FIFA ya aterrizado, simulado): la revelación existe y devuelve true.
  pzPackFifaOpen: (w) => { fifaCalls.push(w); return true; },
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

const kinds = (tiles) => tiles.map((x) => x.kind + ':' + (x.post ? x.post.id : (x.shortcode || ''))).join(' | ');
const idxOf = (tiles, kind, id) => tiles.findIndex((x) => x.kind === kind && (!id || String(x.post.id) === String(id)));

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const { homeGridCompose, homeTileHTML, pzRitualHTML, pzRitualCardHTML } = sandbox;

  // ===== 1) POSICIÓN con datos reales, 554 cancelado → carta = 518 =====
  const postsFixture = adminPosts.map((p) => enrich(p, { del551: true }));
  const upcoming = sandbox.hfFeedUpcoming(postsFixture, TZ);
  const published = postsFixture.filter((p) => p.status === 'published');
  const tiles = homeGridCompose({ upcoming, published, recents: realRecents() });
  const cardIdx = idxOf(tiles, 'oculta', 518);
  t('pos: con 554 cancelado la carta es el 518', cardIdx >= 0 && tiles[cardIdx].post.id === 518, kinds(tiles));
  t('pos: ningún tile es el 554 cancelado', !tiles.some((x) => x.post && x.post.id === 554));
  t('pos: ninguna tile es story (553 excluida)', !tiles.some((x) => x.post && x.post.media_type === 'story'));
  // (ajuste posición 5/11 · decisión Valentino 13:26 — SUPERSEDE v1:
  // la carta va PRIMERA, idx 0; el trío entero queda debajo. Los
  // casos v1 (idx 11 tras el trío) quedan documentados como
  // superseded, no borrados en silencio.)
  t('pos: la carta va PRIMERA (idx 0, arriba a la izquierda)', cardIdx === 0, 'cardIdx=' + cardIdx + ' :: ' + kinds(tiles));
  t('pos: la carta NO está tras el trío (posición v1 FIFA, idx 11)', cardIdx !== 11);
  t('pos: la carta NO está en idx 10 (posición v694 prístino)', cardIdx !== 10);
  t('pos: el trío de perfume está junto en idx 9-11 (entero, debajo de la carta)', tiles[9].kind === 'ig' && tiles[10].kind === 'ig' && tiles[11].kind === 'ig'
    && ['DfVCqgdjCrO', 'DfVC-LFMau1', 'DfVDDFAjKeG'].every((s) => [tiles[9].shortcode, tiles[10].shortcode, tiles[11].shortcode].includes(s)), kinds(tiles));
  t('pos: el trío de perfume empieza justo debajo de la carta (foto perfume idx 11)',
    cardIdx === 0 && tiles[11].shortcode === 'DfVDDFAjKeG');
  t('pos: sin estado conocido la carta de hoy va VELADA (fail-closed)', tiles[cardIdx].openHoy === false);
  t('pos: el trío de café sigue en idx 12-14 (el resto no cambia de orden)', tiles[12].kind === 'ig' && tiles[13].kind === 'ig' && tiles[14].kind === 'ig'
    && ['DfRrm2Vj8Qa', 'DfRsxGrSssF', 'DfRt0axD0G0'].every((s) => [tiles[12].shortcode, tiles[13].shortcode, tiles[14].shortcode].includes(s)));

  // ===== 2) VELO DE HOY: pre-elección, post-elección y día co-creado =====
  const tilesPre = homeGridCompose({ upcoming, published, recents: realRecents(), ritual: { tieneHoy: true, yaElegido: false } });
  const idxPre = idxOf(tilesPre, 'oculta', 518);
  t('velo-hoy: pre-elección la carta de hoy va velada (openHoy false)', tilesPre[idxPre].openHoy === false);
  const htmlPre = homeTileHTML(tilesPre[idxPre], idxPre);
  t('velo-hoy: pre-elección la carta lleva data-pz-abrir-ritual="1"', String(htmlPre).includes('data-pz-abrir-ritual="1"'));
  t('velo-hoy: pre-elección la carta NO lleva data-post-id (no revela el posteo)', !String(htmlPre).includes('data-post-id'));
  t('velo-hoy: pre-elección la carta NO tiene <img> (sin foto)', !/<img/.test(String(htmlPre)));
  t('velo-hoy: pre-elección la carta sigue con velo + destellos + chapita', String(htmlPre).includes('hf-carta-velo') && String(htmlPre).includes('hf-carta-destellos') && String(htmlPre).includes('El próximo'));
  const tilesPost = homeGridCompose({ upcoming, published, recents: realRecents(), ritual: { tieneHoy: true, yaElegido: true } });
  const idxPost = idxOf(tilesPost, 'oculta', 518);
  t('velo-hoy: post-elección la carta de hoy va ABIERTA (openHoy true)', tilesPost[idxPost].openHoy === true);
  const htmlPost = homeTileHTML(tilesPost[idxPost], idxPost);
  t('velo-hoy: post-elección la carta tiene foto visible', /<img/.test(String(htmlPost)));
  t('velo-hoy: post-elección la carta abre el detalle (data-post-id 518)', String(htmlPost).includes('data-post-id="518"'));
  t('velo-hoy: post-elección la carta NO abre el ritual', !String(htmlPost).includes('data-pz-abrir-ritual'));
  const tilesCo = homeGridCompose({ upcoming, published, recents: realRecents(), ritual: { tieneHoy: false, yaElegido: false } });
  const idxCo = idxOf(tilesCo, 'oculta', 518);
  t('co-creado: sin paquete hoy la carta de hoy va ABIERTA (v691, posteo acordado)', tilesCo[idxCo].openHoy === true);
  const htmlCo = homeTileHTML(tilesCo[idxCo], idxCo);
  t('co-creado: sin paquete hoy la carta abre el detalle, no el ritual', String(htmlCo).includes('data-post-id="518"') && !String(htmlCo).includes('data-pz-abrir-ritual'));
  // Carta de mañana (día futuro): velada como siempre.
  const NEXT_FUT = { id: 519, status: 'scheduled', scheduled_at: new Date(Date.now() + 86400000).toISOString(), pinned: false, media_type: 'image', image_path: '/media/fut.jpg', caption: 'Mañana' };
  const PUB_A = { id: 551, status: 'published', published_at: '2026-11-04T20:00:00Z', scheduled_at: '2026-11-04T20:00:00Z', media_type: 'image', ig_permalink: 'https://instagram.com/p/a', ig_state: 'live', image_path: '/media/a.jpg' };
  const PUB_B = { id: 550, status: 'published', published_at: '2026-11-04T19:00:00Z', scheduled_at: '2026-11-04T19:00:00Z', media_type: 'image', ig_permalink: 'https://instagram.com/p/b', ig_state: 'live', image_path: '/media/b.jpg' };
  const PUB_C = { id: 549, status: 'published', published_at: '2026-11-04T18:00:00Z', scheduled_at: '2026-11-04T18:00:00Z', media_type: 'image', ig_permalink: 'https://instagram.com/p/c', ig_state: 'live', image_path: '/media/c.jpg' };
  const fut = homeGridCompose({
    upcoming: [{ p: NEXT_FUT, ymd: '2026-11-06' }],
    published: [PUB_A, PUB_B, PUB_C], recents: [],
  });
  const futCardIdx = idxOf(fut, 'oculta', 519);
  t('velo: la carta de mañana va PRIMERA (idx 0) aunque haya 3 publicados', futCardIdx === 0, kinds(fut));
  t('velo: la carta de mañana va velada (openHoy false)', fut[futCardIdx].openHoy === false);
  const htmlVelo = homeTileHTML(fut[futCardIdx], futCardIdx);
  t('velo: la carta velada lleva data-pz-abrir-ritual="1"', String(htmlVelo).includes('data-pz-abrir-ritual="1"'), String(htmlVelo).slice(0, 400));
  t('velo: la carta velada es role=button (táctil + teclado)', String(htmlVelo).includes('role="button"'));
  t('velo: la carta velada NO lleva data-post-id (no revela el posteo)', !String(htmlVelo).includes('data-post-id'));
  t('velo: la carta velada NO tiene <img> (sin foto)', !/<img/.test(String(htmlVelo)));

  // ===== 3) PUERTA MATUTINA: helpers puros =====
  const { pzRitualPendiente, pzRitualPuertaManana, pzRitualMananaVistaHoy, pzRitualMananaMarcarVista, pzRitualSelLeer, pzRitualSelGuardar, pzRitualSelLimpiar } = sandbox;
  t('puerta: sin estado conocido hay ritual pendiente (fail-closed)', pzRitualPendiente() === true);
  t('puerta: con paquete hoy sin elegir hay pendiente', pzRitualPendiente({ tieneHoy: true, yaElegido: false }) === true);
  t('puerta: ya elegido → no pendiente', pzRitualPendiente({ tieneHoy: true, yaElegido: true }) === false);
  t('puerta: sin paquete hoy (co-creado) → no pendiente', pzRitualPendiente({ tieneHoy: false, yaElegido: false }) === false);
  t('puerta: estado positivo + no vista → dispara', pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: false }, false) === true);
  t('puerta: ya vista hoy → no dispara (una sola vez por mañana)', pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: false }, true) === false);
  t('puerta: ya elegido → no dispara', pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: true }, false) === false);
  t('puerta: sin paquete hoy (co-creado) → no dispara', pzRitualPuertaManana({ ok: true, tiene_hoy: false, ya_elegido: false }, false) === false);
  t('puerta: estado no-ok → no dispara', pzRitualPuertaManana({ ok: false, tiene_hoy: true, ya_elegido: false }, false) === false);
  t('puerta: sin estado → no dispara', pzRitualPuertaManana(null, false) === false);
  t('puerta: marcar vista hoy persiste por día', (() => { pzRitualMananaMarcarVista(); return pzRitualMananaVistaHoy() === true; })());
  t('sel: guardar/leer/limpiar por día', (() => { pzRitualSelGuardar(202); const a = pzRitualSelLeer(); pzRitualSelLimpiar(); const b = pzRitualSelLeer(); return a === 202 && b === 0; })());
  t('sel: la clave es por día (pz-ritual-sel-YYYY-MM-DD)', (() => { pzRitualSelGuardar(203); const ks = sandbox.localStorage._keys().filter((k) => String(k).startsWith('pz-ritual-sel-')); pzRitualSelLimpiar(); return ks.length === 1 && /^pz-ritual-sel-\d{4}-\d{2}-\d{2}$/.test(ks[0]); })());

  // ===== 4) HOJA: V (velado) → O (opciones) → R (revelada, 2 opciones) =====
  const dRit = {
    hoy: true, racha: 3, dorada: false, elegida: 0,
    cartas: [
      { id: 201, imagen: '/media/a.jpg', caption_corta: 'Café de la casa', tipo: 'imagen', media_type: 'image', recomendada: true, rubro: 'café' },
      { id: 202, imagen: '/media/b.jpg', caption_corta: 'Corte de pelo', tipo: 'imagen', media_type: 'image', recomendada: false, rubro: 'peluquería' },
      { id: 203, imagen: '/media/c.jpg', caption_corta: 'Posty te saluda', tipo: 'imagen', media_type: 'image', recomendada: false, rubro: 'avatar' },
    ],
    album: { slots: [] },
  };
  const htmlV = pzRitualHTML(dRit, false);
  t('hoja-V: el paquete nace VELADO a pantalla completa (data-pz-ritual-ver)', String(htmlV).includes('data-pz-ritual-ver="1"') && String(htmlV).includes('pz-ritual-velado'));
  t('hoja-V: sin botón «Abrir mi paquete» (el paquete ES la pantalla)', !String(htmlV).includes('Abrir mi paquete'));
  t('hoja-V: sin auto-open en el código (ni flag ni clase abierto)', !SRC.includes('__pzRitualAutoOpen') && !String(htmlV).includes('pz-ritual-pack abierto'));
  t('hoja-V: las 3 opciones nacen OCULTAS (hidden) hasta tocar el paquete', String(htmlV).includes('id="pzRitualCartas" hidden'));
  t('hoja-V: el velo invita a tocar («Tocá para ver las 3 opciones»)', String(htmlV).includes('Tocá para ver las 3 opciones'));
  const htmlO = String(htmlV);
  t('hoja-O: las 3 opciones llevan chip de rubro', ['café', 'peluquería', 'avatar'].every((r) => htmlO.includes(r))
    && (htmlO.match(/pz-ritual-badge rubro/g) || []).length === 3);
  t('hoja-O: las opciones NO muestran foto ni texto (elección por rubro)', !htmlO.includes('/media/a.jpg') && !htmlO.includes('Café de la casa') && !htmlO.includes('Corte de pelo'));
  t('hoja-O: cada opción es role=button con data-pz-ritual-elegir', (htmlO.match(/data-pz-ritual-elegir="/g) || []).length === 3 && htmlO.includes('role="button"'));
  const htmlR = pzRitualHTML(dRit, false, 202);
  t('hoja-R: la revelada muestra LA foto del elegido', String(htmlR).includes('/media/b.jpg'));
  t('hoja-R: la revelada muestra SU texto', String(htmlR).includes('Corte de pelo'));
  t('hoja-R: la revelada NO muestra las otras fotos', !String(htmlR).includes('/media/a.jpg') && !String(htmlR).includes('/media/c.jpg'));
  t('hoja-R: la confirmación son 2 opciones: [Sale así]', String(htmlR).includes('Sale así') && String(htmlR).includes('data-pz-ritual-ok="202"'));
  t('hoja-R: la confirmación son 2 opciones: [Cambiar algo]', String(htmlR).includes('Cambiar algo') && String(htmlR).includes('data-pz-ritual-cambio="202"'));
  t('hoja-R: NO hay tercera opción (ni «Elegir otra» ni «OK, sale este»)', !String(htmlR).includes('Elegir otra') && !String(htmlR).includes('data-pz-ritual-otra') && !String(htmlR).includes('OK, sale este'));
  t('hoja-R: la revelada lleva su chip de rubro', String(htmlR).includes('pz-ritual-badge rubro') && String(htmlR).includes('peluquería'));
  const cardHtml = pzRitualCardHTML(dRit.cartas[0], dRit, false);
  t('carta: la opción muestra su chip de rubro (rama Listo)', String(cardHtml).includes('pz-ritual-badge rubro') && String(cardHtml).includes('café'));
  const htmlVacio = pzRitualHTML({ hoy: false, racha: 0, dorada: false, elegida: 0, cartas: [], album: { slots: [] } }, false);
  t('hoja-vacio: sin paquete hoy no hay pack ni opciones (día co-creado)', !String(htmlVacio).includes('pz-ritual-pack') && !String(htmlVacio).includes('data-pz-ritual-elegir'));
  // Abrir desde la carta: solo navega (ya no hay auto-open).
  const bbGoCalls = [];
  sandbox.bbGo = (h) => { bbGoCalls.push(h); };
  sandbox.pzRitualAbrirDesdeCarta();
  t('abrir: tocar la carta navega a #/app/ritual', bbGoCalls.length === 1 && bbGoCalls[0] === '#/app/ritual', JSON.stringify(bbGoCalls));
  t('abrir: tocar la carta NO marca auto-open (ya no existe)', sandbox.window.__pzRitualAutoOpen === undefined);

  // ===== 5) ELEGIR no aprueba; OK aprueba (POST + FIFA en OK) =====
  fetchCalls.length = 0;
  fifaCalls.length = 0;
  sandbox.localStorage.clear();
  let errElegir = null;
  try { sandbox.pzRitualElegir('201'); } catch (e) { errElegir = e; }
  t('elegir: no tira', errElegir === null, errElegir && errElegir.message);
  t('elegir: NO postea al servidor (elegir selecciona, no aprueba)', !fetchCalls.some((c) => String(c.url).includes('/api/ritual/elegir')), JSON.stringify(fetchCalls.map((c) => c.url)));
  t('elegir: guarda la selección en localStorage (sobrevive al chat)', sandbox.pzRitualSelLeer() === 201);
  // La hoja con la selección guardada muestra la revelada (ida y vuelta al chat).
  const htmlSel = pzRitualHTML(dRit, false, sandbox.pzRitualSelLeer());
  t('elegir: al volver del chat la hoja muestra el posteo revelado', String(htmlSel).includes('/media/a.jpg') && String(htmlSel).includes('Sale así'));
  // OK con FIFA presente: POST + revelación con la carta elegida.
  const fakeWrap = { dataset: {}, querySelector: (s) => (s === 'img' ? { tagName: 'IMG' } : null) };
  sandbox.document.querySelector = (sel) => (String(sel).includes('data-pz-ritual-revelada') ? fakeWrap : null);
  fetchCalls.length = 0;
  fifaCalls.length = 0;
  let errOk = null;
  try { await sandbox.pzRitualConfirmar('201'); } catch (e) { errOk = e; }
  t('ok: no tira', errOk === null, errOk && errOk.message);
  t('ok: POSTea /api/ritual/elegir con el post_id elegido', fetchCalls.some((c) => String(c.url).includes('/api/ritual/elegir') && c.opts && String(c.opts.body || '').includes('201')), JSON.stringify(fetchCalls));
  t('ok: con FIFA presente se llama a la revelación con la carta elegida', fifaCalls.length === 1 && fifaCalls[0] === fakeWrap, 'fifaCalls=' + fifaCalls.length);
  t('ok: la revelación recibe el postId de la elegida', fakeWrap.dataset.postId === '201', 'postId=' + fakeWrap.dataset.postId);
  t('ok: tras confirmar se limpia la selección', sandbox.pzRitualSelLeer() === 0);
  // Estática: elegir no tiene POST; OK tiene el guard FIFA antes del render.
  const srcElegir = SRC.slice(SRC.indexOf('function pzRitualElegir(id)'));
  const srcElegirFn = srcElegir.slice(0, srcElegir.indexOf('\nasync function pzRitualConfirmar'));
  t('elegir: el código de elegir NO postea (sin api.post ni /api/ritual/elegir)', !srcElegirFn.includes('api.post') && !srcElegirFn.includes('/api/ritual/elegir'));
  const srcOk = SRC.slice(SRC.indexOf('async function pzRitualConfirmar(id)'));
  const srcOkFn = srcOk.slice(0, srcOk.indexOf('\ndocument.addEventListener'));
  t('ok: el código de OK postea /api/ritual/elegir', srcOkFn.includes("api.post('/api/ritual/elegir'"));
  t('ok: el guard FIFA precede al render en OK', srcOkFn.indexOf('pzPackFifaOpen') < srcOkFn.indexOf('render(); return;'));
  t('ok: sin FIFA el fallback es render() (línea vigente v694)', srcOkFn.includes('render(); return;'));

  // ===== 6) M78 22/22: cada función llamada desde los caminos nuevos existe =====
  const audit = [
    'pzRitualPendiente', 'pzRitualPuertaManana', 'pzRitualMananaKey', 'pzRitualMananaVistaHoy',
    'pzRitualMananaMarcarVista', 'pzRitualSelKey', 'pzRitualSelLeer', 'pzRitualSelGuardar',
    'pzRitualSelLimpiar', 'pzRitualOpcionHTML', 'pzRitualConfirmar', 'pzRitualElegir',
    'pzRitualCargar', 'pzRitualHTML', 'pzRitualCardHTML', 'pzRitualAbrirDesdeCarta',
    'pzHablarClick', 'bbGo', 'render', 'ritualView',
  ];
  const missing = audit.filter((f) => !new RegExp(`function ${f}\\s*\\(`).test(SRC));
  t('M78: 22/22 funciones auditadas definidas en el bundle', missing.length === 0, 'faltan: ' + missing.join(', '));
  t('M78: rubroDeCarta + cardOf viven en ritual-manana.js', typeof M.rubroDeCarta === 'function' && typeof M.cardOf === 'function');
  t('M78: pzPackFifaOpen NO está en este bundle y se llama SOLO tras typeof', !SRC.includes('function pzPackFifaOpen') && SRC.includes("typeof pzPackFifaOpen === 'function'"));

  // ===== 7) RUBRO en cardOf (servidor, intacto) =====
  t('rubro: con rubro guardado (columna de rubro-rotacion) → ese valor manda', M.cardOf({ id: 0, image_path: '/media/z.jpg', caption: 'X', rg_producto: 'Perfumería', rubro: 'moda', tipo: 'imagen' }, true).rubro === 'moda');
  t('rubro: con rg_producto → el producto normalizado', M.cardOf({ id: 1, image_path: '/media/a.jpg', caption: 'X', rg_producto: 'Perfumería', tipo: 'imagen' }, true).rubro === 'perfumería');
  t('rubro: posteo de Posty sin producto → avatar', M.cardOf({ id: 2, image_path: '/media/b.jpg', caption: 'Posty te saluda', image_prompt: 'Posty sonríe a cámara', tipo: 'imagen' }, false).rubro === 'avatar');
  t('rubro: sin producto ni Posty → el tipo', M.cardOf({ id: 3, image_path: '/media/c.jpg', caption: 'Foto', tipo: 'foto' }, false).rubro === 'foto');
  t('rubro: sin nada → general (nunca inventado)', M.cardOf({ id: 4, image_path: '/media/d.jpg', caption: 'Foto' }, false).rubro === 'general');

  // ===== 8) ESTÁTICA: banner ausente, fetch de estado VUELVE, push intacta =====
  t('static: sin ritualBannerHTML en app.js', !SRC.includes('ritualBannerHTML'));
  t('static: sin ritRes en app.js (contrato HOTFIX INICIO-ROTO sin objeto)', !SRC.includes('let ritRes') && !SRC.includes('ritResFetch'));
  t('static: el fetch /api/ritual/estado VUELVE en Inicio (puerta + velo)', SRC.includes("api.get('/api/ritual/estado')"));
  t('static: el fetch de estado está FUERA del Promise.all de los posteos', (() => {
    const i = SRC.indexOf("api.get('/api/ritual/estado')");
    const j = SRC.indexOf('const [postsRes, erRes, pubRes] = await Promise.all');
    return i >= 0 && j > i && !SRC.slice(j, j + 400).includes('ritual/estado');
  })());
  t('static: el fetch de estado tiene .catch propio (fail-closed)', SRC.includes("api.get('/api/ritual/estado').catch(() => null)"));
  t('static: el Promise.all de Inicio sigue con 3 fetches (sin ritual)', SRC.includes('const [postsRes, erRes, pubRes] = await Promise.all'));
  t('static: la vista del ritual y elegir siguen', SRC.includes('async function ritualView()') && SRC.includes('pzRitualElegir') && SRC.includes('/api/ritual/hoy') && SRC.includes('/api/ritual/elegir'));
  t('static: el handler de la carta velada existe', SRC.includes('pzRitualAbrirDesdeCarta') && SRC.includes('data-pz-abrir-ritual'));
  t('static: la push 9:00 sigue a #/app/ritual con texto INTOCABLE', MPP.includes("url: '/#/app/ritual'") && MPP.includes('Tu posteo de hoy ya está 👇'));
  t('static: el chip de rubro tiene estilo propio', CSS.includes('.pz-ritual-badge.rubro'));
  t('static: los estilos nuevos existen (velado, opción, revelada, ok, cambio)', ['.pz-ritual-velado', '.pz-ritual-opcion', '.pz-ritual-revelada', '.pz-ritual-ok', '.pz-ritual-cambio'].every((c) => CSS.includes(c)));
  t('static: sin auto-open ni botón Abrir en app.js (clase pz-ritual-abrir fuera del JS)', !SRC.includes('__pzRitualAutoOpen') && !SRC.includes('pz-ritual-abrir'));

  console.log(`\nPROXIMO-RITUAL: ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
