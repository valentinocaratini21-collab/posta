// test-lote-post-oculto-respira.js — LOTE POST-OCULTO-RESPIRA (mock v2c,
// elegida Valentino 6/11 17:32 «2 · respira» + regla 6/11 17:12 «una sola
// carta» + «los días en los candaditos» + corrección 17:32 «sin buen día»
// + destapado «a las 00:00», re-base v734 tras copy v732 + destapado v733).
// 1) EL PAQUETE VELADO ES UNA SOLA CARTA que RESPIRA (halo dorado, 2,4 s)
//    en el ritual (cuenta + paquete velado + tardecita) y en la carta
//    del feed.
// 2) TARDECITA 17:00–00:00: hoy ya salió y hay un próximo → el ritual
//    muestra el paquete velado con la cuenta hasta las 00:00 (no el
//    vacío), «Se abre mañana {d}/{m} a las 00:00», chip «hoy · 00:00»,
//    sin «buen día», sin «9:00» en esta pantalla.
// 3) EL ÁLBUM muestra el DÍA SOBRE cada casilla (Lun…Dom en dorado,
//    sobre el candado mismo) — ya no debajo, ya no «Hoy».
// 4) SIN «buen día» en ninguna pantalla velada; el saludo queda solo en
//    el ritual de la mañana (revelada / elegida).
// 5) EL SERVIDOR devuelve `proximo` en /api/ritual/hoy cuando hoy ya
//    salió y hay un próximo tras la medianoche.
// Uso: node test-lote-post-oculto-respira.js (desde el scratch)
// M121: el boot del servidor real en DB temporal ES la prueba de carga.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const WORK = path.join(__dirname, 'work');
const TREE = fs.existsSync(WORK) ? WORK : __dirname;
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const IDX_ES = fs.readFileSync(path.join(TREE, 'public', 'index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(TREE, 'public', 'en', 'index.html'), 'utf8');

const TZ = 'America/New_York';
function tzOffsetMs(tz, ts) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const parts = dtf.formatToParts(new Date(ts));
  const g = {};
  for (const p of parts) g[p.type] = p.value;
  return Date.UTC(+g.year, +g.month - 1, +g.day, (+g.hour) % 24, +g.minute, +g.second) - ts;
}
function nyWallToUtc(dayKey, hh) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, 0);
  return new Date(guess - tzOffsetMs(TZ, guess)).toISOString();
}
function todayNY() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}
const TODAY = todayNY();
const TOMORROW = new Date(new Date(TODAY + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Fecha de mañana en formato es (d/m) para «Se abre mañana 7/11».
const mananaEs = (() => { const [y, m, d] = TOMORROW.split('-').map(Number); return d + '/' + m; })();

// ===== C) CLIENTE: bundle en vm (patrón proximoritual, reducido) =====
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
    children: [], parentNode: null, isConnected: true,
  };
}
function storeStub() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
}
const locObj = { hash: '#/app/ritual', href: 'https://postycommunitymanager.com/#/app/ritual', pathname: '/', search: '', host: 'postycommunitymanager.com' };
const els = {};
let hoyPayload = null;
const bbGoCalls = [];
const fetchCalls = [];
async function fetchStub(url, opts) {
  fetchCalls.push(String(url));
  if (String(url).includes('/api/ritual/hoy')) {
    return { ok: true, status: 200, json: async () => (hoyPayload || {}), text: async () => JSON.stringify(hoyPayload || {}) };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
}
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
  pzPackFifaOpen: () => false,
};
sandbox.window = {
  addEventListener() {}, removeEventListener() {},
  innerHeight: 844, innerWidth: 390, location: locObj,
  scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  navigator: sandbox.navigator, document: null,
};
sandbox.document = {
  addEventListener() {}, removeEventListener() {},
  getElementById: (id) => (els[id] || null),
  querySelector: () => null, querySelectorAll: () => [],
  createElement: () => elStub(), body: elStub(), documentElement: elStub(),
  title: 'Posty', hidden: false, visibilityState: 'visible',
};
sandbox.window.document = sandbox.document;
sandbox.self = sandbox.window;
vm.createContext(sandbox);

// --- Fixtures ---
function mondayOf(dayKey) {
  const d = new Date(dayKey + 'T12:00:00Z');
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * 86400000).toISOString().slice(0, 10);
}
const DIAS_ES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
function albumFixture() {
  const lun = mondayOf(TODAY);
  const slots = [];
  for (let i = 0; i < 7; i++) {
    const dia = new Date(new Date(lun + 'T12:00:00Z').getTime() + i * 86400000).toISOString().slice(0, 10);
    slots.push({ dia, etiqueta: DIAS_ES[i], imagen: null, dorada: false, hoy: dia === TODAY, jugado: dia < TODAY });
  }
  return { lunes: lun, slots };
}
function carta(id, rec, rubro, img) {
  return { id, recomendada: !!rec, rubro, imagen: img || ('/media/' + id + '.jpg'), media_type: 'image', caption_corta: 'Caption del posteo ' + id };
}
function payloadBase(over) {
  const base = {
    ok: true, hoy: TODAY, recomendada: carta(518, true, 'Café'),
    cartas: [carta(518, true, 'Café')],
    elegida: null, dorada: false, racha: 0,
    album: albumFixture(), publicado_hoy: false,
    abre_a: nyWallToUtc(TODAY, 9), ahora: new Date().toISOString(), abre_hora: '9:00',
  };
  return Object.assign(base, over || {});
}
const countDorso = (html) => (html.match(/<i class="pz-dorso">/g) || []).length;

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const S = sandbox;
  const { pzRitualHTML, pzRitualCuentaTxt, pzRitualAbreFecha, homeTileHTML } = S;
  // La zona de la cuenta en el sandbox es NY (como Valentino): app.js
  // declara `let SETTINGS = null` (no se puede inyectar por el sandbox),
  // así que se asigna tras cargar el bundle. Sin esto, pcTz() cae al
  // default Buenos Aires y la medianoche del feed sería la de BA.
  vm.runInContext('SETTINGS = { timezone: "America/New_York" };', sandbox);

  // --- C1) cuenta de la mañana: 1 dorso, respira, sin «buen día» ---
  // abre_a fabricado en el futuro (determinista, como la cuenta v726):
  // UN solo instante `ahoraMs` para `abre_a` y `ahora`.
  const ahoraMs = Date.now();
  const abreFuturo = new Date(ahoraMs + (7 * 3600 + 17 * 60 + 24) * 1000).toISOString();
  const dCuenta = payloadBase({ abre_a: abreFuturo, ahora: new Date(ahoraMs).toISOString() });
  const htmlCuenta = String(pzRitualHTML(dCuenta, false));
  t('C1a: la cuenta de la mañana sigue: id pzRitualCuenta + 07:17', htmlCuenta.includes('id="pzRitualCuenta"') && htmlCuenta.includes('<span class="pz-ritual-cuenta-hm">07:17</span>'));
  t('C1b: UNA SOLA carta en la cuenta (1 dorso, no 3)', countDorso(htmlCuenta) === 1, 'dorsos=' + countDorso(htmlCuenta));
  t('C1c: la carta de la cuenta RESPIRA (clase pz-respira en el velo)', htmlCuenta.includes('pz-ritual-pack-velo pz-respira'));
  t('C1d: la cuenta NO dice «buen día» (pantalla velada, de tarde a noche)', !htmlCuenta.includes('buen día') && !htmlCuenta.includes('good morning'));
  t('C1e: la cuenta dice «te traje tu paquete de hoy» (sin saludo)', htmlCuenta.includes('te traje tu paquete de hoy'));
  t('C1f: la cuenta dice «para ver tu próximo posteo» (no «para las 9:00»; la hora sigue en la chapita y en «Se abre»)', htmlCuenta.includes('para ver tu próximo posteo') && htmlCuenta.includes('hoy · 9:00') && htmlCuenta.includes('Se abre a las 9:00') && !htmlCuenta.includes('para las 9:00') && !htmlCuenta.includes('para las 00:00'));

  // --- C2) tardecita: hoy ya salió + próximo → cuenta hasta las 00:00 ---
  const medianocheManana = nyWallToUtc(TOMORROW, 0);
  const dProx = { ok: true, hoy: null, racha: 3, album: albumFixture(), publicado_hoy: true, ahora: new Date().toISOString(), proximo: { abre_a: medianocheManana, abre_hora: '00:00' } };
  const htmlProx = String(pzRitualHTML(dProx, false));
  t('C2a: tardecita NO es el vacío («El posteo de hoy ya salió» no aparece; hay cuenta)', !htmlProx.includes('El posteo de hoy ya salió') && htmlProx.includes('id="pzRitualCuenta"'), htmlProx.slice(0, 200));
  t('C2b: la cuenta de la tardecita apunta a las 00:00 (data-pz-cuenta-abre = medianoche)', htmlProx.includes('data-pz-cuenta-abre="' + medianocheManana + '"'));
  t('C2c: la cuenta dice «faltan … para ver tu próximo posteo» (no «para las 00:00»)', /faltan <b>[^<]+<\/b> para ver tu próximo posteo/.test(htmlProx) && !htmlProx.includes('para las 00:00'), htmlProx.slice(0, 400));
  t('C2d: la chapita es «hoy · 00:00»', htmlProx.includes('hoy · 00:00'));
  t('C2e: «Se abre mañana ' + mananaEs + ' a las 00:00»', htmlProx.includes('Se abre mañana ' + mananaEs + ' a las 00:00'), htmlProx.slice(0, 600));
  t('C2f: la nota es «A las 00:00 se abre solo, o te llega la push»', htmlProx.includes('A las 00:00 se abre solo') && htmlProx.includes('te llega la push'));
  t('C2g: UNA SOLA carta en la tardecita (1 dorso) + respira', countDorso(htmlProx) === 1 && htmlProx.includes('pz-ritual-pack-velo pz-respira'), 'dorsos=' + countDorso(htmlProx));
  t('C2h: la tardecita NO dice «buen día» ni «9:00» ni «para las 00:00» (la hora 00:00 sigue en la chapita y en «Se abre»)', !htmlProx.includes('buen día') && !htmlProx.includes('good morning') && !htmlProx.includes('9:00') && !htmlProx.includes('para las 00:00'), htmlProx.slice(0, 400));
  t('C2i: la tardecita muestra el álbum (tu álbum)', htmlProx.includes('tu álbum'));

  // --- C3) el álbum: el día SOBRE la casilla, no debajo, no «Hoy» ---
  t('C3a: el álbum lleva el día EN la casilla (.pz-ritual-dia-en)', (htmlProx.match(/pz-ritual-dia-en/g) || []).length === 7, 'dia-en=' + (htmlProx.match(/pz-ritual-dia-en/g) || []).length);
  t('C3b: el álbum ya NO lleva el día debajo (.pz-ritual-dia fuera; el álbum sí está)', htmlProx.includes('tu álbum') && !htmlProx.includes('pz-ritual-dia">') && !htmlProx.includes('class="pz-ritual-dia"'));
  t('C3c: el día de hoy es su día de semana (no «Hoy»)', !htmlProx.includes('>Hoy<') && htmlProx.includes('pz-ritual-dia-en'));
  t('C3d: los 7 días aparecen (Lun…Dom, capitalizados)', DIAS_ES.every((d) => htmlProx.includes('>' + d.charAt(0).toUpperCase() + d.slice(1) + '<')), htmlProx.slice(htmlProx.indexOf('pz-ritual-slots'), htmlProx.indexOf('pz-ritual-slots') + 800));

  // --- C4) paquete velado (después de las 9:00, antes de revelar) ---
  const dPaquete = payloadBase({ abre_a: new Date(Date.now() - 3600 * 1000).toISOString() });
  const htmlPaquete = String(pzRitualHTML(dPaquete, false));
  t('C4a: el paquete velado sigue: data-pz-ritual-ver + «Tocá para verla»', htmlPaquete.includes('data-pz-ritual-ver="1"') && htmlPaquete.includes('Tocá para verla'));
  t('C4b: UNA SOLA carta en el paquete velado (1 dorso) + respira', countDorso(htmlPaquete) === 1 && htmlPaquete.includes('pz-ritual-pack-velo pz-respira'), 'dorsos=' + countDorso(htmlPaquete));
  t('C4c: el paquete velado NO dice «buen día»', !htmlPaquete.includes('buen día') && !htmlPaquete.includes('good morning'));

  // --- C5) revelada / elegida: el saludo de la mañana QUEDA ---
  const dEleg = payloadBase({ abre_a: new Date(Date.now() - 3600 * 1000).toISOString(), elegida: 518 });
  const htmlEleg = String(pzRitualHTML(dEleg, false));
  t('C5: revelada/elegida SIGUE diciendo «buen día» (saludo de la mañana intacto)', htmlEleg.includes('buen día') && htmlEleg.includes('Listo, hoy sale esta'));

  // --- C6) helper pzRitualAbreFecha (con guarda: en prístino no existe
  // y llamar a undefined rompería la suite en vez de marcar FAIL) ---
  const tieneAbreFecha = typeof pzRitualAbreFecha === 'function';
  t('C6a: abre_a mañana 00:00 → {es: ' + mananaEs + '}', tieneAbreFecha && eq(pzRitualAbreFecha(medianocheManana, TODAY), (() => { const [y, m, d] = TOMORROW.split('-').map(Number); return { es: d + '/' + m, en: m + '/' + d }; })()));
  t('C6b: abre_a hoy 9:00 → null (misma fecha, sin «mañana»)', tieneAbreFecha && pzRitualAbreFecha(nyWallToUtc(TODAY, 9), TODAY) === null);
  t('C6c: abre_a pasado mañana → null (no es mañana)', tieneAbreFecha && pzRitualAbreFecha(nyWallToUtc(new Date(new Date(TODAY + 'T12:00:00Z').getTime() + 2 * 86400000).toISOString().slice(0, 10), 0), TODAY) === null);
  t('C6d: abre_a inválido / hoyKey inválido → null (fail-closed)', tieneAbreFecha && pzRitualAbreFecha('nope', TODAY) === null && pzRitualAbreFecha(medianocheManana, 'nope') === null && pzRitualAbreFecha(medianocheManana, null) === null);

  // --- C7) carta del feed (día futuro): VARIANTE B «MÁS MAGIA» (elección Valentino 19:31) ---
  const tileFut = {
    kind: 'oculta', openHoy: false, hoy: false, justPub: false,
    day: TOMORROW,
    post: { id: 521, media_type: 'image', image_path: '/media/521.jpg', caption: 'Lo nuevo de la semana', status: 'scheduled', scheduled_at: nyWallToUtc(TOMORROW, 17) },
  };
  let htmlFeed = '';
  try { htmlFeed = String(homeTileHTML(tileFut, 0)); } catch (e) { htmlFeed = 'ERROR ' + (e && e.message); }
  t('C7a: la carta del feed es velada (hf-carta-oculta + velo)', htmlFeed.includes('hf-carta-oculta') && htmlFeed.includes('hf-carta-velo'), htmlFeed.slice(0, 200));
  t('C7b: la carta del feed RESPIRA (clase hf-carta-respira)', htmlFeed.includes('hf-carta-respira'), htmlFeed.slice(0, 300));
  t('C7c: la carta del feed lleva la cuenta «para ver tu próximo posteo» (.hf-cuenta-abre, sin «para las 00:00»)', htmlFeed.includes('hf-cuenta-abre') && htmlFeed.includes('para ver tu próximo posteo') && !htmlFeed.includes('para las 00:00'), htmlFeed.slice(0, 500));
  t('C7d: la cuenta del feed apunta a la medianoche (data-pz-cuenta-abre)', htmlFeed.includes('data-pz-cuenta-abre="' + medianocheManana + '"'), htmlFeed.slice(0, 500));
  t('C7e: la carta del feed NO abre a las 9:00 (sin «a las 9:00» ni «para las 9:00»; la chapita con la hora real 17:00 sí va)', !/(^|[^0-9])9:00/.test(htmlFeed), htmlFeed.slice(0, 400));
  t('C7f: VARIANTE B — la carta es DESTACADA a todo lo ancho (hf-cell-velada)', htmlFeed.includes('hf-cell hf-cell-velada'), htmlFeed.slice(0, 200));
  t('C7g: VARIANTE B — halo dorado que respira (hf-carta-halo envuelve la carta)', htmlFeed.includes('hf-carta-halo'), htmlFeed.slice(0, 300));
  t('C7h: VARIANTE B — 7 destellos ✦ (no 4)', (htmlFeed.match(/<i>✦<\/i>/g) || []).length === 7, 'destellos=' + (htmlFeed.match(/<i>✦<\/i>/g) || []).length);
  t('C7i: VARIANTE B — Posty asomando (hf-carta-posty con ai-avatar.png) + «Posty lo está cuidando ✨»', htmlFeed.includes('hf-carta-posty') && htmlFeed.includes('ai-avatar.png') && htmlFeed.includes('Posty lo está cuidando ✨'), htmlFeed.slice(-400));
  t('C7j: VARIANTE B — contenido centrado (hf-carta-contenido: píldora, cuenta, chip en ese orden)', htmlFeed.includes('hf-carta-contenido') && htmlFeed.indexOf('hf-carta-proximo') < htmlFeed.indexOf('hf-cuenta-abre') && htmlFeed.indexOf('hf-cuenta-abre') < htmlFeed.indexOf('hf-chip'), htmlFeed.slice(0, 600));
  t('C7k: VARIANTE B — la cuenta es la protagonista en 3 líneas (faltan / número en <b> / para ver…)', htmlFeed.includes('faltan<br><b>') && htmlFeed.includes('</b><br>para ver tu próximo posteo'), htmlFeed.slice(0, 600));
  t('C7l: VARIANTE B — la celda entera abre el ritual (data-pz-abrir-ritual en la celda, tocar Posty también)', htmlFeed.includes('hf-cell hf-cell-velada" data-hf-filtro="pendientes" data-pz-abrir-ritual="1"'), htmlFeed.slice(0, 200));

  // --- C8) M78 + estática ---
  const fns = ['pzTzOffsetMs', 'pzDiaInicioMs', 'pzRitualAbreFecha', 'hfCuentaAbreTick'];
  t('C8a: M78 — las 4 funciones nuevas existen definidas en el bundle', fns.every((f) => typeof S[f] === 'function'), fns.filter((f) => typeof S[f] !== 'function').join(','));
  t('C8b: M78 — ?v= bumpeado SOLO en ES (494) y EN sin app.js', IDX_ES.includes('app.js?v=494') && !IDX_ES.includes('app.js?v=489') && !IDX_EN.includes('app.js?v='));
  t('C8c: CSS — halo + cuenta + día-en existen; keyframes pzRespira/hfRespira existen; VARIANTE B (celda ancha, halo, 7 destellos, Posty, cuenta dorada)',
    CSS.includes('.pz-ritual-pack-velo.pz-respira') && CSS.includes('@keyframes pzRespira') && CSS.includes('@keyframes hfRespira')
    && CSS.includes('.hf-tile.hf-carta-respira') && CSS.includes('.hf-cuenta-abre') && CSS.includes('.pz-ritual-dia-en')
    && CSS.includes('.pz-dorso:only-of-type')
    && CSS.includes('.hf-cell-velada{grid-column:1/-1') && CSS.includes('.hf-carta-halo::before') && CSS.includes('.hf-carta-posty') && CSS.includes('.hf-carta-leyenda') && CSS.includes('.hf-carta-contenido')
    && CSS.includes('.hf-cell-velada .hf-carta-destellos i:nth-child(7)') && CSS.includes('.hf-cell-velada .hf-cuenta-abre b{color:#FEC14D'));  
  t('C8d: CSS — reduced-motion apaga el latido (ritual + feed)', CSS.includes('.pz-ritual-pack-velo.pz-respira,.pz-ritual-pack-velo.pz-respira .pz-dorso{animation:none}') && CSS.includes('.hf-tile.hf-carta-respira::before{animation:none'));
  t('C8e: «buen día» queda UNA sola vez en app.js (el saludo del ritual revelado)', (SRC.match(/buen día/g) || []).length === 1 && (SRC.match(/good morning/g) || []).length === 1, 'buen día=' + (SRC.match(/buen día/g) || []).length);
  t('C8f: el servidor calcula `proximo` en /api/ritual/hoy (medianoche + próximo programado)', SRV.includes('const medianoche = zonedWallToUtc(manana + \' 00:00\', tz)') && SRV.includes('proximo = { abre_a: medianoche, abre_hora: \'00:00\' }') && SRV.includes('publicado_hoy: publicadoHoy, proximo'));
  t('C8g: sin próximo, el vacío honesto sigue (hoy null sin proximo cuando no hay publicado)', SRV.includes('if (!rec) return res.json({ ok: true, hoy: null, racha, album, publicado_hoy: publicadoHoy, proximo })'));
  t('C8h: VARIANTE B — el tick de 1 s reescribe la cuenta en 3 líneas (mismo formato que el render)', String(S.hfCuentaAbreTick).includes('faltan<br><b>') && String(S.hfCuentaAbreTick).includes('</b><br>para ver tu próximo posteo') && String(S.hfCuentaAbreTick).includes('<b>${esc(cu.faltan)}</b><br>left to see your next post'));

  // ===== H) HTTP: servidor real en DB temporal (M121: boot en copia aislada) =====
  const PORT = 34573;
  const SECRET = 'test-secret-post-oculto-respira';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-oculto-respira-boot-'));
  const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';
  function signSid(sid) {
    return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
  }
  function cookieFor(sid) {
    return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
  }
  async function api(sid, method, url, body) {
    const r = await fetch(`http://127.0.0.1:${PORT}${url}`, {
      method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    return { status: r.status, json: j };
  }
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-post-oculto-respira',
    SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: 'test',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: TREE, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    t('H0: boot M121 — el servidor levanta con el lote en copia aislada', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    // Siembra: user 12 (publicado hoy + programado mañana 17:00 NY),
    // user 13 (vacío), user 14 (publicado hoy, sin próximo).
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
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
    for (const uid of [12, 13, 14]) {
      db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')`).run(uid, 'respira-' + uid + '@test.invalid');
      db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`).run(uid);
      db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('respira-' + uid, sessJson(uid), exp);
    }
    const insPost = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, 'image')`);
    // 519 publicado hoy 17:00 NY (publicado_hoy = true).
    insPost.run(519, 12, '/media/519.jpg', 'El de hoy', nyWallToUtc(TODAY, 17), nyWallToUtc(TODAY, 17), 'published', 'social');
    // 521 programado mañana 17:00 NY (el próximo tras la medianoche).
    insPost.run(521, 12, '/media/521.jpg', 'Lo nuevo de la semana', nyWallToUtc(TOMORROW, 17), null, 'scheduled', 'novedad');
    // 619 publicado hoy 17:00 NY, sin próximo (user 14).
    insPost.run(619, 14, '/media/619.jpg', 'El de hoy', nyWallToUtc(TODAY, 17), nyWallToUtc(TODAY, 17), 'published', 'social');
    db.close();

    // --- H1) user 12: hoy ya salió + próximo → proximo a las 00:00 ---
    const res12 = await api('respira-12', 'GET', '/api/ritual/hoy');
    const d12 = res12.json || {};
    t('H1a: GET /api/ritual/hoy user 12 → 200 + ok + hoy null (ya salió, sin posteo para hoy)', res12.status === 200 && d12.ok === true && d12.hoy === null, 'status=' + res12.status + ' body=' + JSON.stringify(d12).slice(0, 250));
    t('H1b: CONTRATO — publicado_hoy es true', d12.publicado_hoy === true);
    t('H1c: CONTRATO — proximo.abre_a es mañana 00:00 en la zona de la cuenta (NY)', d12.proximo && d12.proximo.abre_a === nyWallToUtc(TOMORROW, 0), 'proximo=' + JSON.stringify(d12.proximo));
    t('H1d: CONTRATO — proximo.abre_hora es 00:00', d12.proximo && d12.proximo.abre_hora === '00:00');
    const htmlReal12 = String(pzRitualHTML(d12, false));
    t('H1e: con la respuesta REAL, el render es la tardecita (cuenta «para ver tu próximo posteo»), nunca el vacío',
      htmlReal12.includes('id="pzRitualCuenta"') && htmlReal12.includes('para ver tu próximo posteo') && !htmlReal12.includes('para las 00:00') && !htmlReal12.includes('Hoy no tenés posteo programado') && !htmlReal12.includes('El posteo de hoy ya salió'), 'html=' + htmlReal12.slice(0, 200));

    // --- H2) user 13: vacío, sin publicado, sin próximo ---
    const res13 = await api('respira-13', 'GET', '/api/ritual/hoy');
    const d13 = res13.json || {};
    t('H2a: user 13 vacío → 200 + hoy null + publicado_hoy false', res13.status === 200 && d13.ok === true && d13.hoy === null && d13.publicado_hoy === false, 'body=' + JSON.stringify(d13).slice(0, 200));
    t('H2b: user 13 → proximo es null (sin próximo tras la medianoche)', d13.proximo === null || d13.proximo === undefined, 'proximo=' + JSON.stringify(d13.proximo));

    // --- H3) user 14: publicado hoy, sin próximo → proximo null ---
    const res14 = await api('respira-14', 'GET', '/api/ritual/hoy');
    const d14 = res14.json || {};
    t('H3a: user 14 → 200 + hoy null + publicado_hoy true', res14.status === 200 && d14.ok === true && d14.hoy === null && d14.publicado_hoy === true, 'body=' + JSON.stringify(d14).slice(0, 200));
    t('H3b: user 14 → proximo es null (publicado hoy pero sin próximo)', d14.proximo === null || d14.proximo === undefined, 'proximo=' + JSON.stringify(d14.proximo));
    const htmlReal14 = String(pzRitualHTML(d14, false));
    t('H3c: con la respuesta REAL de user 14, el render es el vacío honesto (sin cuenta)', htmlReal14.includes('El posteo de hoy ya salió, mañana hay otro paquete.') && !htmlReal14.includes('id="pzRitualCuenta"'), 'html=' + htmlReal14.slice(0, 200));

    console.log(`\nPOST-OCULTO-RESPIRA: ${pass} ok, ${fail} fallas`);
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(fail ? 1 : 0);
  } catch (e) {
    console.error('ERROR:', e && e.message);
    console.log(out.split('\n').slice(-30).join('\n'));
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }
})();
