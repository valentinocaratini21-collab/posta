'use strict';
/* test-lote-sacar-carta-velada.js — LOTE SACAR-CARTA-VELADA (base v824).
 * Orden Valentino 9/11 00:49 («Esto está mal. Sacalo», con captura):
 * la carta velada (Variante B) del próximo posteo en la grilla del feed
 * se va. El tile del próximo SIEMPRE rinde ABIERTO (foto visible + pill
 * de salida + cuenta hasta que SALE), en todos los estados: hoy
 * pendiente (ritual sin elegir), hoy ya elegido, futuro. Sin «Se
 * destapa a las 00:00», sin cuenta para VERLO, sin «Posty lo está
 * cuidando». El ritual (#/app/ritual: puerta matutina + aviso 9:00)
 * NO se toca; la cartita de Inicio (pzHoyCardHTML) ya era abierta y
 * tampoco se toca. En el árbol prístino v824 los tests nuevos deben
 * FALLAR (cazan el cambio). Uso: node test-lote-sacar-carta-velada.js.
 *   SCV_TREE=<dir>  árbol a probar (por defecto, este directorio)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TREE = path.resolve(process.env.SCV_TREE || __dirname);
const APP = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

let okN = 0, badN = 0;
const t = (cond, name, extra) => { if (cond) { okN++; } else { badN++; console.log('✗', name, extra ? String(extra).slice(0, 300) : ''); } };

// ---------- Reloj mutable (EST = UTC-5 en noviembre) ----------
// Hoy = dom 8/11/2026, 10:00 EST (el caso de la captura: posteo de hoy
// 19:30 EST, ritual pendiente).
let NOW_MS = Date.parse('2026-11-08T15:00:00.000Z');
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
const lsStore = new Map();
const store = new Map();
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
    getElementById: () => null,
    querySelector: () => null,
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
  && typeof sb.pzHoyPillSalida === 'function' && typeof sb.pzHoyCuentaSaleTxt === 'function'
  && typeof sb.pzHoyCardHTML === 'function' && typeof sb.hfLiveSnapshot === 'function'
  && typeof sb.hfLiveDiff === 'function' && typeof sb.pzRitualPendiente === 'function',
  '§0: HOME_FEED + RITUAL + HOY-R1 cargan en el sandbox');
if (h1 < 0 || typeof sb.homeTileHTML !== 'function') {
  console.log('\nRED: el árbol ' + TREE + ' no trae los bloques (HOME_FEED/HOY-R1 ausentes)');
  console.log(`${okN} ok, ${badN} mal`);
  process.exit(1);
}

// ---------- §0b: pines estáticos — la velada no existe más ----------
console.log('— §0b: pines estáticos');
t(!APP.includes('hf-cell-velada') && !APP.includes('hf-carta-velo') && !APP.includes('hf-carta-oculta')
  && !APP.includes('hf-carta-respira') && !APP.includes('hf-carta-leyenda') && !APP.includes('hf-carta-posty')
  && !APP.includes('hf-carta-destapa') && !APP.includes('hf-cuenta-abre') && !APP.includes('hf-carta-contenido')
  && !APP.includes('hf-carta-proximo') && !APP.includes('Posty lo está cuidando')
  && !APP.includes('Se destapa a las <b>00:00</b>') && !APP.includes('data-pz-abrir-ritual="1"'),
  '§0b: app.js ya no trae la carta velada (clases, destape, leyenda, abrir-ritual ×0; los listeners del ritual quedan, sin emisor)');
t(APP.includes('const openHoy = true'), '§0b: homeGridCompose fuerza openHoy = true (siempre abierta)');
t(APP.includes('hf-carta-magia') && APP.includes('hf-carta-destellos'),
  '§0b: la magia del borde (hf-carta-magia + destellos) sigue en la carta abierta');
t(!CSS.includes('hf-cell-velada') && !CSS.includes('hf-carta-velo') && !CSS.includes('hf-carta-oculta')
  && !CSS.includes('hf-carta-halo') && !CSS.includes('hf-carta-respira') && !CSS.includes('hf-carta-leyenda')
  && !CSS.includes('hf-carta-posty') && !CSS.includes('hf-carta-destapa') && !CSS.includes('hf-cuenta-abre')
  && !CSS.includes('hf-carta-contenido') && !CSS.includes('hf-carta-proximo') && !CSS.includes('hfRespira'),
  '§0b: styles.css ya no trae el CSS de la carta velada (×0 en las 12 clases + hfRespira)');
t(CSS.includes('.hf-tile.hf-carta-magia') && CSS.includes('.hf-carta-destellos'),
  '§0b: el CSS de la magia (borde + destellos) sigue para la carta abierta');
t(md5(SRV) === '1e0e70dcc918ee2b1f235586de3e2a40', '§0b: server.js = v829 (sin tocar salvo BUILD v833)');

// ---------- Fixtures (mismos que r1 §5) ----------
const pub = (id, ymd) => ({ id, status: 'published', media_type: 'image', image_path: '/m/' + id + '.jpg', caption: 'Publicado ' + id, published_at: ymd + 'T22:00:00.000Z', scheduled_at: ymd + 'T22:00:00.000Z', pinned: 0, approval: 'approved' });
const PUBL = [pub(601, '2026-11-02'), pub(602, '2026-11-03'), pub(603, '2026-11-04'), pub(604, '2026-11-06')];
const HOY_POST = { id: 610, status: 'scheduled', media_type: 'image', image_path: '/m/610.jpg', caption: 'El posteo de hoy sale con todo', scheduled_at: '2026-11-09T00:30:00.000Z', pinned: 0, approval: 'pending', created_at: '2026-11-08T10:00:00.000Z', week_key: '2026-11-02' }; // hoy dom 8/11 19:30 EST
const MANANA_POST = { id: 611, status: 'scheduled', media_type: 'image', image_path: '/m/611.jpg', caption: 'Mañana sale esto, miralo', scheduled_at: '2026-11-10T00:00:00.000Z', pinned: 0, approval: 'pending', created_at: '2026-11-07T15:00:00.000Z', week_key: '2026-11-02' }; // lun 9/11 19:00 EST
const RIT_PEND = { tieneHoy: true, yaElegido: false };
const RIT_ELEG = { tieneHoy: true, yaElegido: true };
function compose(upcoming, published, ritual) {
  return sb.homeGridCompose({ upcoming, published, recents: [], ritual: (ritual === undefined ? null : ritual) });
}

// ---------- §1: EL CASO DE LA CAPTURA — hoy 19:30, ritual pendiente ----------
console.log('— §1: la captura (hoy pendiente, ritual sin elegir)');
setNow('2026-11-08T15:00:00.000Z'); // dom 8/11 10:00 EST
const tilesHoy = compose([{ p: HOY_POST, ymd: '2026-11-08' }, { p: MANANA_POST, ymd: '2026-11-09' }], PUBL, RIT_PEND);
t(tilesHoy.length >= 1 && tilesHoy[0].kind === 'oculta' && tilesHoy[0].post.id === 610
  && tilesHoy[0].openHoy === true && tilesHoy[0].hoy === true,
  '§1: el posteo de hoy compone como carta ABIERTA (openHoy true), PRIMERA (idx 0), con marca HOY');
const htmlHoy = sb.homeTileHTML(tilesHoy[0], 0);
t(htmlHoy.includes('<img') && htmlHoy.includes('/m/610.jpg'),
  '§1: la carta de hoy MUESTRA LA FOTO (ya no es un velo oscuro)', htmlHoy.slice(0, 200));
t(htmlHoy.includes('data-post-id="610"') && htmlHoy.includes('role="button"'),
  '§1: la carta abre el detalle (data-post-id + role=button: aprobar/cambiar alcanzables)');
t(htmlHoy.includes('Se postea hoy · 19:30') && htmlHoy.includes('data-pz-cuenta-sale="2026-11-09T00:30:00.000Z"')
  && htmlHoy.includes('sale en'),
  '§1: pill «Se postea hoy · 19:30» + cuenta hasta que SALE (sale en …)');
t(htmlHoy.includes('hf-tile-cap') && htmlHoy.includes('hf-carta-magia') && htmlHoy.includes('hf-carta-destellos'),
  '§1: banda de caption debajo de la foto + borde dorado con destellos (magia del borde intacta)');
t(htmlHoy.includes('hf-hoy-badge') && htmlHoy.includes('>HOY<'),
  '§1: la carta de hoy lleva la marca HOY');
t(!htmlHoy.includes('hf-cell-velada') && !htmlHoy.includes('hf-carta-velo') && !htmlHoy.includes('hf-carta-oculta')
  && !htmlHoy.includes('Se destapa') && !htmlHoy.includes('Posty lo está cuidando')
  && !htmlHoy.includes('data-pz-cuenta-abre') && !htmlHoy.includes('data-pz-abrir-ritual')
  && !htmlHoy.includes('hf-carta-posty') && !htmlHoy.includes('hf-carta-leyenda')
  && !htmlHoy.includes('para ver tu próximo posteo'),
  '§1: NADA de la carta velada (sin velo, sin destape, sin «Posty lo está cuidando», sin cuenta para verlo)', htmlHoy.slice(0, 300));

// ---------- §2: hoy ya elegido (ritual hecho) — sigue abierta ----------
console.log('— §2: hoy ya elegido');
const tilesEleg = compose([{ p: HOY_POST, ymd: '2026-11-08' }, { p: MANANA_POST, ymd: '2026-11-09' }], PUBL, RIT_ELEG);
t(tilesEleg[0].kind === 'oculta' && tilesEleg[0].post.id === 610 && tilesEleg[0].openHoy === true,
  '§2: con el ritual elegido, la carta de hoy sigue ABIERTA (openHoy true)');
const htmlEleg = sb.homeTileHTML(tilesEleg[0], 0);
t(htmlEleg.includes('<img') && htmlEleg.includes('Se postea hoy · 19:30') && !htmlEleg.includes('hf-carta-velo'),
  '§2: la carta elegida se ve igual: foto + pill + sin velo');

// ---------- §3: futuro solo — abierto como siempre (R1 intacto) ----------
console.log('— §3: futuro');
const tilesFut = compose([{ p: MANANA_POST, ymd: '2026-11-09' }], [PUBL[3], PUBL[2]], RIT_PEND);
t(tilesFut.length >= 1 && tilesFut[0].kind === 'oculta' && tilesFut[0].post.id === 611
  && tilesFut[0].openHoy === true && tilesFut[0].futuro === true,
  '§3: el posteo de mañana compone como carta ABIERTA (openHoy + futuro), primera');
const htmlFut = sb.homeTileHTML(tilesFut[0], 0);
t(htmlFut.includes('Se postea mañana · 19:00') && htmlFut.includes('data-pz-cuenta-sale="2026-11-10T00:00:00.000Z"')
  && htmlFut.includes('<img') && htmlFut.includes('data-post-id="611"')
  && !htmlFut.includes('hf-carta-velo') && !htmlFut.includes('Se destapa')
  && !htmlFut.includes('data-pz-cuenta-abre'),
  '§3: la cartita de mañana se VE (foto, pill, cuenta de salida) — sin velo, sin destape, sin cuenta de apertura');

// ---------- §4: EN — la carta abierta en inglés ----------
console.log('— §4: inglés');
sb.ME = { lang: 'en' };
const htmlHoyEn = sb.homeTileHTML(tilesHoy[0], 0);
t(htmlHoyEn.includes('Goes out today · 07:30 PM') && htmlHoyEn.includes('goes out in')
  && htmlHoyEn.includes('<img') && !htmlHoyEn.includes('hf-carta-velo')
  && !htmlHoyEn.includes('Posty is looking after it'),
  '§4: EN: pill «Goes out today · 07:30 PM» + cuenta «goes out in …», sin velo ni leyenda');
sb.ME = { lang: 'es' };

// ---------- §5: lo que NO cambia — Inicio y el diff vivo ----------
console.log('— §5: lo que no cambia');
const cardMan = sb.pzHoyCardHTML(MANANA_POST, { cartita: true, en: false, tz: 'America/New_York' });
t(cardMan.includes('Se postea mañana · 19:00') && cardMan.includes('data-pz-cuenta-sale="2026-11-10T00:00:00.000Z"')
  && cardMan.includes('Dale, publicalo') && cardMan.includes('Cambialo')
  && !cardMan.includes('Se destapa') && !cardMan.includes('hf-carta-velo'),
  '§5: la cartita de Inicio sigue ABIERTA (pill, cuenta, Dale/Cambialo, sin velo ni destape)');
const snap = sb.hfLiveSnapshot(tilesHoy, PROF);
t(snap.posts['oculta:610'] && snap.posts['oculta:610'].openHoy === 1
  && snap.posts['oculta:610'].scheduled_at === '2026-11-09T00:30:00.000Z',
  '§5: el diff vivo sigue la carta por su clave oculta:610 (openHoy 1, scheduled_at real)');
const snap2 = sb.hfLiveSnapshot(tilesFut, PROF);
const diff = sb.hfLiveDiff(snap2, snap);
t(diff.changed.includes('oculta:610') || diff.added.includes('oculta:610'),
  '§5: el diff ve el cambio de carta (mañana 611 → hoy 610) sin perder la clave oculta');
t(typeof sb.pzRitualPendiente === 'function' && typeof sb.pzProximoYaAbierto === 'function'
  && APP.includes('function pzRitualAbrirDesdeCarta') && APP.includes("bbGo('#/app/ritual')"),
  '§5: el ritual sigue vivo (pzRitualPendiente, pzProximoYaAbierto, abrir #/app/ritual)');

// ---------- §6: boot real con DB sembrada ----------
console.log('— §6: boot');
const PORT = 34579;
const SECRET = 'lote-sacar-carta-velada-secret';
const TOKEN = 'boot-test-token-scv';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sacar-carta-velada-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
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
ADMIN_TOKEN: 'scv-admin-token',
SESSION_SECRET: SECRET,
    NODE_PATH: nodeModules,
OPENAI_API_KEY: '',
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
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v833',
      '§6: /api/version trae el BUILD v833', JSON.stringify(ver.json));
    const appJs = await apiText('/app.js?v=567');
    t(appJs.status === 200 && md5(appJs.text) === md5(APP),
      '§6: el app.js servido es el del árbol (md5 igual)');
    t(!appJs.text.includes('hf-cell-velada') && !appJs.text.includes('hf-carta-velo')
      && !appJs.text.includes('Se destapa a las <b>00:00</b>') && !appJs.text.includes('Posty lo está cuidando')
      && appJs.text.includes('const openHoy = true') && appJs.text.includes('hf-carta-magia'),
      '§6: el app.js SERVIDO ya no trae la carta velada (y trae la abierta)');
    const css = await apiText('/styles.css?v=20261212');
    t(css.status === 200 && md5(css.text) === md5(CSS),
      '§6: el styles.css servido es el del árbol (md5 igual)');
    t(!css.text.includes('hf-cell-velada') && !css.text.includes('hf-carta-oculta')
      && css.text.includes('.hf-tile.hf-carta-magia') && css.text.includes('.hf-carta-destellos'),
      '§6: el styles.css SERVIDO ya no trae la velada (y trae la magia)');
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    let schemaOk = false;
    for (let i = 0; i < 30; i++) {
      try {
        const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).get();
        if (row) { schemaOk = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(schemaOk, '§6: el schema está listo (tabla users) antes de sembrar');
    if (!schemaOk) throw new Error('sin schema');
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 7 * 24 * 3600 * 1000, expires: new Date(exp).toISOString(), httpOnly: true, path: '/' },
      userId: uid,
    });
    const at2200Z = (ymd) => ymd + 'T22:00:00.000Z';
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (12, 'scv-12@test.invalid', 'x', 'posty', 'active', 17)`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username) VALUES (12, 'Negocio SCV', 'scvtest')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, published_at, status, tipo, media_type, week_key, approval, created_at) VALUES (701, 12, '/media/701.jpg', 'Publicado', '', ?, ?, 'published', 'social', 'image', ?, 'approved', ?)`).run(at2200Z(shiftDays(TODAY, -2)), at2200Z(shiftDays(TODAY, -2)), MON, at2200Z(shiftDays(TODAY, -3)));
    // El posteo de HOY, 19:30 local (mañana 00:30Z), pendiente: el caso de la captura.
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (704, 12, '/media/704.jpg', 'Hoy', '', ?, 'scheduled', 'social', 'image', ?, 'pending', ?)`).run(shiftDays(TODAY, 1) + 'T00:30:00.000Z', MON, shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, week_key, approval, created_at) VALUES (705, 12, '/media/705.jpg', 'Mañana', '', ?, 'scheduled', 'social', 'image', ?, 'pending', ?)`).run(shiftDays(TODAY, 2) + 'T00:00:00.000Z', shiftDays(MON, 7), shiftDays(TODAY, -1) + ' 10:00:00');
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('scv-12', sessJson(12), exp);
    const posts = await api('scv-12', 'GET', '/api/posts');
    const list = (posts.json && (posts.json.posts || posts.json.items || posts.json)) || [];
    const byId = (id) => (Array.isArray(list) ? list.find((p) => Number(p.id) === id) : null);
    t(posts.status === 200 && byId(704) && byId(704).status === 'scheduled' && byId(704).approval === 'pending',
      '§6: /api/posts trae el posteo de hoy (704, scheduled, pendiente)', JSON.stringify(posts.json && posts.json.error));
    t(byId(701) && byId(701).status === 'published' && byId(705) && byId(705).status === 'scheduled',
      '§6: /api/posts trae el publicado (701) y el de mañana (705)');
    // Cierre del círculo: los datos REALES del servidor, compuestos por
    // homeGridCompose con el reloj REAL, rinden la carta ABIERTA.
    setNow(new Date().toISOString());
    const liveTiles = compose(
      [{ p: byId(704), ymd: TODAY }, { p: byId(705), ymd: shiftDays(TODAY, 1) }],
      [byId(701)], RIT_PEND);
    t(liveTiles.length >= 1 && liveTiles[0].kind === 'oculta' && liveTiles[0].post.id === 704
      && liveTiles[0].openHoy === true,
      '§6: con datos reales del boot, el posteo de hoy compone ABIERTA y primera');
    const liveHtml = sb.homeTileHTML(liveTiles[0], 0);
    t(liveHtml.includes('/media/704.jpg') && liveHtml.includes('Se postea hoy')
      && liveHtml.includes('data-pz-cuenta-sale') && !liveHtml.includes('hf-carta-velo')
      && !liveHtml.includes('Posty lo está cuidando'),
      '§6: con datos reales, la carta se VE (foto + pill + cuenta) sin velo ni leyenda');
  } catch (e) {
    console.log('✗ §6 error:', e && e.message);
    badN++;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(`\n${okN} ok, ${badN} mal`);
  process.exit(badN ? 1 : 0);
})();
