// Suite LOTE RENDER-CASA — la casa del invitado se renderiza como su
// perfil: el espejo del negocio va ATENUADO («en oscurito», de fondo)
// y la pieza de la prueba va protagonista en su lugar de la grilla,
// con su cartel de agenda computado de su scheduled_at real
// («sale hoy/mañana/día · hora»). Corrección de Valentino 23:54 +
// pin 23:57 (16/11):
//  (1) la pieza sin conectar lleva el CTA de conectar EN EL CENTRO
//      (.hf-pieza-lock: tarjeta azul Posty con el @ del negocio) —
//      verla limpia exige conectar; al conectar, la superposición no
//      se rinde y la pieza queda limpia;
//  (2) la muestra limpia de arriba SALIÓ: la tarjeta wow previa a la
//      conexión (pzWowConnectHTML con la foto entera de la pieza
//      arriba de la casa) ya no se rinde — la única aparición de la
//      pieza es su lugar en la grilla, con el candado;
//  (3) sin conectar, la pieza NO se abre por ningún camino: las
//      cuatro puertas de apertura de la casa (hfDetailBind en
//      captura, scfOpenPop, hfPeekOpen, hfOpenActionsSheet) se
//      cierran ante una tile con candado — la presencia del candado
//      ES el estado bloqueado, y solo existe en la rama del invitado
//      sin conectar: la casa del cliente conectado no cambia en nada.
// [A CONFIRMAR — censado, NO tocado por este lote] pzHoyHoyHTML →
// pzHoyCardHTML(hero) («EL POSTEO DE HOY») también muestra la pieza
// de hoy arriba de Inicio, pero es la superficie diaria COMPARTIDA
// con el cliente conectado (su tarjeta de aprobar/editar): es
// estructural y su salida de la superficie del invitado es decisión
// del tablero, no de este lote. Los modales de conexión
// (igPopupShow, pzGuestMaybeIgPrompt) son solo texto: sin muestra.
// Uso: node test-lote-render-casa.js [raíz-del-árbol] [--no-boot]
// Sin argumento usa el directorio de este archivo. El control sobre
// el árbol base (v1150) tiene que fallar exactamente en los [FIX].
// La casa se renderiza en el cliente: la sección B ejecuta las
// funciones REALES de app.js en vm y aserta sobre el HTML que
// producen; la sección C (boot) aserta sobre lo SERVIDO (versión,
// index y el bundle con las piezas del lote).
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
if (!process.env.DATA_DIR) process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-render-data-'));

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const APP = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'public', 'styles.css'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
const ENIDX = fs.readFileSync(path.join(ROOT, 'public', 'en', 'index.html'), 'utf8');
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre, extra) {
  if (cond) { pass++; console.log('  ✓ ' + nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ ' + nombre + (extra !== undefined ? '  → ' + JSON.stringify(extra).slice(0, 380) : '')); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }

function extraer(src, nombre) {
  const re = new RegExp('function ' + nombre + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}');
  const m = src.match(re);
  return m ? m[0] : '';
}
function ventana(src, desde, n) { const i = src.indexOf(desde); return i < 0 ? '' : src.slice(i, i + n); }

const F_TILE = extraer(APP, 'homeTileHTML');
const F_HEAD = extraer(APP, 'homeHeadHTML');
const F_SALE = extraer(APP, 'hfSaleChipTxt');
const F_LOCK = extraer(APP, 'hfPiezaLockHTML');

/* ── A · Censo de fuente ─────────────────────────────────────────── */
function seccionA() {
  seccion('A · censo de fuente (app.js · styles.css · indexes · server.js)');
  ok(F_SALE.length > 0, 'A1 [FIX] hfSaleChipTxt está definida en app.js');
  ok(F_SALE.includes('pcDayKeyShift') && F_SALE.includes('toLocaleDateString') && F_SALE.includes("return (en ? 'goes out ' : 'sale ') + dia + ' · ' + hh;"),
    'A2 [FIX] el cartel se COMPUTA de la agenda (día relativo por zona + hora real): la única salida es la composición, sin fecha fija');
  ok(!/19:00|7:00 PM/.test(F_SALE.replace(/19:00 en el ejemplo/g, '')), 'A3 [FIX] hfSaleChipTxt no hardcodea ninguna hora (ni 19:00 ni 7:00 PM) como salida');
  ok(F_TILE.includes("const guestTile = (typeof pzIsGuest === 'function' && pzIsGuest());"), 'A4 [FIX] homeTileHTML computa la rama del invitado una sola vez (guestTile ← pzIsGuest)');
  ok(F_TILE.includes("guestTile ? ' hf-tile-espejo' : ''"), 'A5 [FIX] la tile del espejo (kind ig) lleva .hf-tile-espejo SOLO si invitado');
  ok(F_TILE.includes("const esPieza = guestTile && !!p && String(p.source || '') === 'trial';"), 'A6 [FIX] la pieza se reconoce por la rama del invitado + el marcador confiable source=trial');
  ok(F_TILE.includes("const saleTxt = (esPieza && p.status === 'scheduled') ? hfSaleChipTxt(p) : '';"), 'A7 [FIX] el cartel vive solo en la pieza programada del invitado (un borrador no afirma salida)');
  ok(F_TILE.includes("const piezaLock = (esPieza && !igConectado) ? hfPiezaLockHTML("), 'A8 [FIX] el candado se computa solo para la pieza del invitado NO conectado (al conectar, no se rinde)');
  eq((F_TILE.match(/\$\{piezaLock\}/g) || []).length, 2, 'A9 [FIX] el candado se inserta en las DOS formas de la pieza (tile común y carta del próximo)');
  ok(F_LOCK.includes('hf-pieza-lock-btn') && F_LOCK.includes('igConnect()') && F_LOCK.includes('stopPropagation') && F_LOCK.includes('pzHomeProfGet'),
    'A10 [FIX] hfPiezaLockHTML: tarjeta con botón que abre igConnect (la puerta de siempre), traga el toque y trae el @ de pzHomeProfGet');
  ok(!F_LOCK.includes('data-ig-connect'), 'A11 [FIX] el botón del candado NO usa data-ig-connect (el binder global pisaría su onclick y el stopPropagation)');
  const puertas = [
    ['scfOpenPop', ventana(APP, 'function scfOpenPop(', 700)],
    ['hfDetailBind', ventana(APP, 'function hfDetailBind(', 2200)],
    ['hfPeekOpen', ventana(APP, 'function hfPeekOpen(', 700)],
    ['hfOpenActionsSheet', ventana(APP, 'function hfOpenActionsSheet(', 800)],
  ];
  for (const [nombre, v] of puertas) {
    ok(v.includes("querySelector('.hf-pieza-lock')"), 'A12 [FIX] la puerta ' + nombre + ' se cierra ante una tile con candado (sin candado, su camino es el de siempre)');
  }
  eq((APP.match(/querySelector\('\.hf-pieza-lock'\)/g) || []).length, 4, 'A13 [FIX] son exactamente 4 las puertas con la guarda del candado');
  ok(F_HEAD.includes('hfHighlightsTrayHTML'), 'A14 la extracción de homeHeadHTML es completa (llega hasta las destacadas)');
  ok(F_HEAD.includes("${guestHead ? ' hf-head-invitado' : ''}") && F_HEAD.includes("const guestHead = (typeof pzIsGuest === 'function' && pzIsGuest());"),
    'A15 [FIX] la cabecera lleva .hf-head-invitado SOLO en la rama del invitado');
  ok(!APP.includes('pz-wow-img'), 'A16 [FIX] la muestra limpia de arriba salió: no queda NINGÚN render con la clase pz-wow-img (la foto entera de la pieza fuera de la grilla)');
  const iWow = APP.indexOf('function pzWowConnectHTML(');
  const wowBody = iWow < 0 ? '' : APP.slice(iWow, APP.indexOf('\nfunction pzWowGo', iWow));
  ok(wowBody.includes('pz-wow-done') && wowBody.includes('pzWowQuietHTML'), 'A17 la función wow conserva la confirmación post-conexión (solo texto) y la puerta quieta sin imagen');
  ok(wowBody.includes("return '';"), 'A18 [FIX] la rama previa a la conexión de pzWowConnectHTML devuelve vacío (la tarjeta con la pieza limpia no se rinde)');
  for (const regla of ['.hf-head-invitado .hf-prow', '.hf-tile-espejo{', '.hf-tile-pieza{', '.hf-chip-sale{', '.hf-tile-cap .hf-chip-sale{', '.hf-pieza-lock{', '.hf-pieza-lock-card{', '.hf-pieza-lock-btn{']) {
    ok(CSS.includes(regla), 'A19 [FIX] styles.css trae la regla ' + regla);
  }
  ok(CSS.includes('.hf-head-invitado .hf-hls'), 'A20 [FIX] el atenuado de la cabecera cubre también las destacadas del espejo');
  ok(!/\.hf-head-invitado [^{]*\{[^}]*igHeadChip|hf-head-invitado \.hf-racha/.test(CSS), 'A21 el atenuado NO alcanza al chip de conexión ni a la fila de info de la cabecera (conectar es la acción)');
  ok(IDX.includes('/app.js?v=766'), 'A22 [FIX] index.html carga app.js?v=766');
  ok(IDX.includes('/styles.css?v=20261292') && ENIDX.includes('/styles.css?v=20261292'), 'A23 [FIX] styles.css?v=20261292 en AMBOS index (ES y EN, el mismo valor)');
  ok(!IDX.includes('app.js?v=764') && !IDX.includes('styles.css?v=20261291') && !ENIDX.includes('styles.css?v=20261291'), 'A24 [FIX] no quedan los ?v= viejos en los index servidos');
  ok(SERVER.includes("const BUILD_ID = '20261105-v1152';"), 'A25 [FIX] BUILD_ID del lote (v1152)');
  for (const fn of ['hfSaleChipTxt', 'hfPiezaLockHTML', 'pzIsGuest', 'pcParseDate', 'pcDayKeyShift', 'pcTz', 'pzHomeProfGet', 'igConnect']) {
    const esNueva = (fn === 'hfSaleChipTxt' || fn === 'hfPiezaLockHTML');
    ok(APP.includes('function ' + fn + '('), 'A26 funciones auditadas: ' + fn + ' existe definida en el bundle' + (esNueva ? ' [FIX]' : ''));
  }
  // Censo documental de rutas de apertura (pasa en ambos árboles):
  const postRegion = F_TILE.slice(F_TILE.indexOf('const esPieza'));
  ok(postRegion.length > 0 && !postRegion.includes('data-lightbox'), 'A27 censo: la tile de posteo (rama post, tras la rama ig) NO lleva data-lightbox — el lightbox no es alcanzable desde el toque en la pieza');
  ok(F_TILE.includes('data-lightbox="${esc(t.img)}"'), 'A28 censo: las baldosas del espejo (kind ig) SÍ abren por [data-lightbox] — es SU camino propio (posteos ya publicados del negocio), reportado y fuera del pin');
  ok(APP.includes('function pzHoyHoyHTML('), 'A29 censo [A CONFIRMAR]: pzHoyHoyHTML (el héroe «EL POSTEO DE HOY», compartido con el dueño) sigue presente y NO fue tocado por este lote');
}

/* ── B · Las funciones reales, ejecutadas (vm) ───────────────────── */
function tzOffsetMs(date, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date);
  const g = (t) => { const x = p.find((q) => q.type === t); return x ? Number(x.value) : 0; };
  let h = g('hour'); if (h === 24) h = 0;
  return Date.UTC(g('year'), g('month') - 1, g('day'), h, g('minute'), g('second')) - Math.floor(date.getTime() / 1000) * 1000;
}
function nyInstante(dias, hora) {
  const tz = 'America/New_York';
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => Number(p.find((q) => q.type === t).value);
  const guess = Date.UTC(g('year'), g('month') - 1, g('day') + dias, hora, 0, 0);
  let inst = guess - tzOffsetMs(new Date(guess), tz);
  inst = guess - tzOffsetMs(new Date(inst), tz);
  return new Date(inst);
}

let PILL_CUR = '';
function armarCaja() {
  const caja = {
    console,
    __guest: true,
    ME: { lang: 'es' },
    PROFILE: { ig_connected: false },
    HOME_PIN_SVG: '', HOME_REEL_SVG: '', HOME_CAR_SVG: '',
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    pzIc: () => '',
    mv: (s) => String(s || ''),
    pcTz: () => 'America/New_York',
    pzIsGuest: () => caja.__guest,
    pzHomeProfGet: () => ({ username: 'fixturebiz', recents: [] }),
    hfCoverState: () => ({ has: false, path: '', pos: 50 }),
    pzHoyPillSalida: () => PILL_CUR,
    pzHoyCuentaSaleTxt: () => '',
    hfChipText: () => '',
    pzDiaEsFutura: () => false,
    pzDiaHoyKey: () => '',
    albumMondayKey: () => '',
    hfBorradorCapTxt: () => '',
    pzAprobadoEs: () => false,
    pzDecEnt: (s) => String(s || ''),
    pzIsIgTitleBio: () => false,
    igConnect: () => {},
  };
  vm.createContext(caja);
  const piezas = [
    extraer(APP, 'pcParseDate'), extraer(APP, 'pcDayKeyShift'), extraer(APP, 'slotHour'),
    extraer(APP, 'hfWhenChip'), extraer(APP, 'hfPlanChip'), extraer(APP, 'hfTileChipParts'),
    F_SALE, F_LOCK, F_TILE, F_HEAD,
  ];
  vm.runInContext(piezas.join('\n') + '\nthis.__tile = homeTileHTML; this.__head = homeHeadHTML; this.__sale = hfSaleChipTxt;', caja);
  return caja;
}

function seccionB() {
  seccion('B · homeTileHTML / homeHeadHTML / hfSaleChipTxt reales, ejecutados en vm');
  ok(F_TILE.includes('capSubir') && F_TILE.includes('hf-carta-magia'), 'B0 la extracción de homeTileHTML es completa (llega a la carta y al return final)');
  let caja = null;
  try { caja = armarCaja(); } catch (e) { caja = null; }
  if (!caja) { ok(false, 'B0b [FIX] el vm arma con las funciones del lote (en el árbol control faltan y la sección no corre)', 'sin hfSaleChipTxt/hfPiezaLockHTML'); return; }
  const isoMan = nyInstante(1, 19).toISOString();
  const isoHoy = nyInstante(0, 19).toISOString();
  const isoLejos = nyInstante(4, 19).toISOString();
  // El cartel, computado de la agenda:
  eq(caja.__sale({ scheduled_at: isoMan }), 'sale mañana · 19:00', 'B1 [FIX] cartel de una fila de mañana 19:00 (zona del invitado)');
  eq(caja.__sale({ scheduled_at: isoHoy }), 'sale hoy · 19:00', 'B2 [FIX] cartel de una fila de hoy 19:00');
  const wd = nyInstante(4, 19).toLocaleDateString('es-AR', { timeZone: 'America/New_York', weekday: 'short' }).replace(/\./g, '');
  eq(caja.__sale({ scheduled_at: isoLejos }), 'sale ' + (wd.charAt(0).toUpperCase() + wd.slice(1)) + ' · 19:00', 'B3 [FIX] cartel de una fila lejana: el día de semana real');
  eq(caja.__sale({}), '', 'B4 sin scheduled_at no hay cartel (nunca se inventa una salida)');
  eq(caja.__sale({ scheduled_at: 'no-es-fecha' }), '', 'B5 con fecha ilegible no hay cartel');
  const postPieza = { id: 901, status: 'scheduled', source: 'trial', media_type: 'image', image_path: '/media/trial-fixture.jpg', caption: 'fixture', scheduled_at: isoMan, created_at: isoHoy, pinned: false };
  const tilePieza = { kind: 'post', post: postPieza, ymd: null, day: null, isNew: false };
  // Invitado SIN conectar:
  caja.__guest = true; caja.PROFILE = { ig_connected: false };
  const hIg = caja.__tile({ kind: 'ig', img: 'https://img.example/x.jpg', type: 'image' }, 0);
  ok(hIg.includes('hf-tile pub hf-tile-espejo'), 'B6 [FIX] invitado: la baldosa del espejo va atenuada (.hf-tile-espejo)');
  const hPieza = caja.__tile(tilePieza, 1);
  ok(hPieza.includes('hf-tile-pieza'), 'B7 [FIX] invitado: la pieza va protagonista (.hf-tile-pieza)');
  ok(hPieza.includes('hf-chip-sale') && hPieza.includes('sale mañana · 19:00'), 'B8 [FIX] invitado: la pieza lleva su cartel de agenda real en la franja');
  ok(hPieza.includes('hf-pieza-lock') && hPieza.includes('hf-pieza-lock-btn') && hPieza.includes('Conectar @fixturebiz') && hPieza.includes('igConnect()'),
    'B9 [FIX] invitado sin conectar: la pieza lleva el candado centrado con el @ del negocio y el botón a igConnect');
  ok(!hPieza.includes('Mañana ') || hPieza.includes('sale mañana'), 'B10 [FIX] invitado: la chapita genérica del dueño no compite con el cartel (sale el cartel, no «Mañana d/m»)');
  // La carta del próximo (misma pieza, otra forma):
  PILL_CUR = 'Pendiente: conectá tu Instagram';
  const hCarta = caja.__tile({ kind: 'oculta', post: postPieza, ymd: null, day: null, isNew: false }, 0);
  ok(hCarta.includes('hf-carta-magia') && hCarta.includes('hf-pieza-lock') && hCarta.includes('sale mañana · 19:00') && hCarta.includes('Pendiente: conectá tu Instagram'),
    'B11 [FIX] invitado: la carta del próximo lleva candado + cartel junto a su píldora');
  PILL_CUR = '';
  // Invitado YA conectado: la pieza queda limpia (sin candado), el resto igual.
  caja.PROFILE = { ig_connected: true };
  const hPiezaOk = caja.__tile(tilePieza, 1);
  ok(hPiezaOk.includes('hf-tile-pieza') && hPiezaOk.includes('sale mañana · 19:00') && !hPiezaOk.includes('hf-pieza-lock'),
    'B12 [FIX] invitado conectado: la pieza queda LIMPIA (sin candado) y conserva protagonista + cartel');
  const hIgOk = caja.__tile({ kind: 'ig', img: 'https://img.example/x.jpg', type: 'image' }, 0);
  ok(hIgOk.includes('hf-tile-espejo'), 'B13 invitado conectado: el espejo sigue atenuado (el fondo no cambia al conectar; lo que se limpia es la pieza)');
  // Cliente conectado (NO invitado): la casa no cambia en nada.
  caja.__guest = false; caja.PROFILE = { ig_connected: true };
  const hIgDueno = caja.__tile({ kind: 'ig', img: 'https://img.example/x.jpg', type: 'image' }, 0);
  ok(!hIgDueno.includes('hf-tile-espejo') && hIgDueno.includes('class="hf-tile pub" data-hf-filtro="publicados"'), 'B14 [FIX] dueño: la baldosa del espejo es byte-forma la de siempre (sin clase espejo)');
  const hPostDueno = caja.__tile(tilePieza, 1);
  ok(!hPostDueno.includes('hf-tile-pieza') && !hPostDueno.includes('hf-pieza-lock') && !hPostDueno.includes('hf-chip-sale') && !hPostDueno.includes('sale mañana'),
    'B15 [FIX] dueño: ni protagonista, ni candado, ni cartel — aunque el posteo traiga source=trial');
  ok(hPostDueno.includes('hf-chip-day">Mañana<'), 'B16 dueño: su chapita de siempre («Mañana» + hora) sigue viva, intacta');
  // La cabecera:
  caja.__guest = true;
  const prof = { username: 'fixturebiz', name: 'Fixture Biz', posts_count: 147, followers: 6500, following: 10, bio: 'Fixture bio', pic: '' };
  const hHeadInv = caja.__head(prof, 'Fixture Biz', { en: false, splitHead: true });
  ok(hHeadInv.includes('hf-head hf-head-invitado'), 'B17 [FIX] invitado: la cabecera nace con .hf-head-invitado (el espejo atenuado)');
  caja.__guest = false;
  const hHeadDueno = caja.__head(prof, 'Fixture Biz', { en: false, splitHead: true });
  ok(hHeadDueno.includes('class="hf-head"') && !hHeadDueno.includes('hf-head-invitado'), 'B18 [FIX] dueño: la cabecera es la de siempre, sin la clase del invitado');
}

/* ── C · Boot aislado: lo servido ────────────────────────────────── */
async function seccionC() {
  seccion('C · boot aislado: versión e index/bundle servidos');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  const port = 20300 + Math.floor(Math.random() * 120);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-render-boot-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-render-boot-media-'));
  const childEnv = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: 'token-suite', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' };
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN', 'DEMO_AI_DAILY_CAP_USD', 'TRIAL_TEST_KEY']) delete childEnv[k];
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  try {
    let vivo = false, buildVivo = '';
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.status === 200) { vivo = true; const j = await resp.json().catch(() => ({})); buildVivo = String(j.build || ''); }
    }
    ok(vivo, 'C1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    eq(buildVivo, '20261105-v1152', 'C2 [FIX] el build vivo es el del lote (v1152)');
    const idxHtml = await (await fetch(base + '/')).text();
    ok(idxHtml.includes('/app.js?v=766') && idxHtml.includes('/styles.css?v=20261292'), 'C3 [FIX] el index servido trae los ?v= del lote (app.js 766 · styles 20261292)');
    const bundle = await (await fetch(base + '/app.js?v=766')).text();
    ok(bundle.includes('hf-pieza-lock') && bundle.includes('function hfSaleChipTxt') && bundle.includes('hf-head-invitado') && !bundle.includes('pz-wow-img'),
      'C4 [FIX] el bundle servido trae el render nuevo (candado + cartel + cabecera atenuada) y ya no trae la muestra wow');
    const enHtml = await (await fetch(base + '/en/')).text();
    ok(enHtml.includes('/styles.css?v=20261292'), 'C5 [FIX] el index EN servido trae styles.css?v=20261292 (el mismo valor)');
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await Promise.race([new Promise((r) => child.on('exit', r)), new Promise((r) => setTimeout(r, 5000))]);
    try { child.kill('SIGKILL'); } catch (e) {}
  }
}

(async () => {
  seccionA();
  seccionB();
  await seccionC();
  console.log('\n== RENDER-CASA: ' + pass + ' ok · ' + fail + ' mal ==');
  if (failures.length) { console.log('Fallaron:\n - ' + failures.join('\n - ')); }
  process.exit(fail ? 1 : 0);
})();
