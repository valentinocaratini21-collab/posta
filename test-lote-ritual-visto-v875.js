// test-lote-ritual-visto-v875.js — LOTE RITUAL «VISTO HOY» EN EL SERVIDOR
// (v875 · BUG de Valentino 10/11 09:40, con captura: «En el website me
// sigue apareciendo esto cuando entro. Tiene que ser igual a la app el
// website!»)
// El bug: al entrar al website logueado por la mañana, el ritual (el
// paquete de hoy a pantalla completa) aparecía aunque ya se había visto
// en la app. Causa raíz: el «se mostró hoy» (pzRitualMananaVistaHoy)
// vivía en localStorage (pz-ritual-manana-<fecha>), que es por
// navegador/app — el website (Safari) y la app (nativa/PWA) tienen
// storages separados, así que el website no sabía que ya se vio en la
// app. El `ya_elegido` sí era del servidor (/api/ritual/estado), el
// «visto» no.
// El fix: el «visto hoy» es un hecho del servidor — columna visto_at en
// pz_ritual + POST /api/ritual/visto (lo marca cuando la pantalla del
// ritual se muestra, en la app O en el website) + /api/ritual/estado
// devuelve visto_hoy + la puerta matutina lo consulta (el servidor
// manda, localStorage queda como respaldo).
// Uso: node test-lote-ritual-visto-v875.js (desde el scratch; corre
// contra work/ si existe, si no contra el árbol de este directorio).
// Sale 0 si todo pasa. En el árbol SIN el fix falla A1/A2/A3/A4/A5/A6/
// A7/B2/B7/B8/S1/S2/S3/S4/S5 (control negativo verificado en v863
// prístino); con el fix pasa todo.
// NOTA: el check H1 pinea el BUILD del HEAD (v863) — el preparador lo
// re-pinea a v875 al estampar (el builder no estampa el BUILD).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

// El árbol: work/ en el scratch, o este directorio en un árbol release.
const TREE = fs.existsSync(path.join(__dirname, 'work', 'server.js'))
  ? path.join(__dirname, 'work') : __dirname;
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const RM = fs.readFileSync(path.join(TREE, 'ritual-manana.js'), 'utf8');
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

const TZ = 'America/New_York';
const TODAY = dayKeyInTz(new Date(), TZ); // día del cliente, igual que tzToday()
const shiftDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const at2200Z = (ymd) => ymd + 'T22:00:00.000Z'; // 17:00 EST, formato de producción

// ---------- sandbox vm (mínimo del patrón ritual-hoy-contrato) ----------
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
function storeStub() {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
  s._keys = () => [...m.keys()];
  return s;
}
const locObj = { hash: '#/app/inicio', href: 'https://postycommunitymanager.com/#/app/inicio', pathname: '/', search: '', host: 'postycommunitymanager.com' };
const fetchCalls = [];
const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  // fetch stub que REGISTRA las llamadas (para verificar que el cliente
  // marca el visto en el servidor) y responde ok.
  fetch: async (url, opts) => {
    fetchCalls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
    return { ok: true, status: 200, json: async () => ({ ok: true }), text: async () => '{}' };
  },
  location: locObj,
  navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', language: 'es-AR', onLine: true },
  localStorage: storeStub(), sessionStorage: storeStub(),
  performance: { now: () => Date.now() },
  AbortSignal, URL, URLSearchParams,
  CustomEvent: function CustomEvent() {}, Event: function Event() {},
  Date,
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
try {
  vm.runInContext(SRC, sandbox, { filename: 'app.js' });
} catch (e) {
  console.log('FAIL bundle no carga: ' + (e && e.message));
  process.exit(2);
}
const pzRitualPuertaManana = sandbox.pzRitualPuertaManana;
const pzRitualMananaVistaHoy = sandbox.pzRitualMananaVistaHoy;
const pzRitualMananaMarcarVista = sandbox.pzRitualMananaMarcarVista;
const pzRitualMananaMarcarVistaServidor = sandbox.pzRitualMananaMarcarVistaServidor;
if (typeof pzRitualPuertaManana !== 'function' || typeof pzRitualMananaVistaHoy !== 'function' || typeof pzRitualMananaMarcarVista !== 'function') {
  console.log('FAIL funciones del ritual no existen en el bundle');
  process.exit(2);
}

// ---------- boot del servidor real ----------
const PORT = 34690;
const SECRET = 'ritual-visto-v875-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritual-visto-v875-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function call(method, p, sid) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method,
    headers: { ...(sid ? { Cookie: cookieFor(sid) } : {}), 'Content-Type': 'application/json' },
    body: method === 'POST' ? '{}' : undefined,
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
    ADMIN_TOKEN: 'boot-test-token-ritual-visto',
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
    t('H1: boot — el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json().catch(() => null);
    t('H2: /api/version trae el BUILD del HEAD (v863; el preparador lo re-pinea a v875)',
      ver && ver.build === '20261105-v875', 'build=' + JSON.stringify(ver && ver.build));

    // Siembra directa en la DB del boot (patrón ritual-hoy-contrato):
    // user 12 con posteo de hoy (518, 17:00 EST) + fila pz_ritual SIN
    // visto (la puerta todavía no se marcó); user 13 sin posteos.
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    // La tabla pz_ritual se crea LAZY (ensureRitualTable, al primer
    // llamado a un endpoint del ritual): la creo acá con el mismo DDL
    // ANTES de sembrar, igual que haría el servidor (sin visto_at: la
    // migración del lote la agrega al primer ensureRitualTable).
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
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (12, 'ritual-visto-boot@test.invalid', 'x')`).run();
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (13, 'ritual-visto-vacio@test.invalid', 'x')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (13, 'America/New_York')`).run();
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type) VALUES (518, 12, '/media/518.jpg', 'Café de la casa, hecho con amor', '', ?, 'scheduled', 'social', 'image')`).run(at2200Z(TODAY));
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (12, ?, 518, '[]', NULL, 0)`).run(TODAY);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES ('ritual-visto-12', ?, ?)`).run(sessJson(12), exp);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES ('ritual-visto-13', ?, ?)`).run(sessJson(13), exp);
    db.close();

    // ===== A) SERVIDOR: estado + visto =====
    const e0 = await call('GET', '/api/ritual/estado', 'ritual-visto-12');
    t('A1: estado ANTES del visto → 200 + tiene_hoy true + ya_elegido false + visto_hoy false',
      e0.status === 200 && e0.json && e0.json.ok === true && e0.json.tiene_hoy === true && e0.json.ya_elegido === false && e0.json.visto_hoy === false,
      'status=' + e0.status + ' body=' + JSON.stringify(e0.json).slice(0, 200));
    const v1 = await call('POST', '/api/ritual/visto', 'ritual-visto-12');
    t('A2: POST /api/ritual/visto → 200 + ok + visto_hoy true',
      v1.status === 200 && v1.json && v1.json.ok === true && v1.json.visto_hoy === true,
      'status=' + v1.status + ' body=' + JSON.stringify(v1.json).slice(0, 200));
    const e1 = await call('GET', '/api/ritual/estado', 'ritual-visto-12');
    t('A3: estado DESPUÉS del visto → visto_hoy true (tiene_hoy sigue true, ya_elegido sigue false)',
      e1.status === 200 && e1.json && e1.json.visto_hoy === true && e1.json.tiene_hoy === true && e1.json.ya_elegido === false,
      'body=' + JSON.stringify(e1.json).slice(0, 200));
    const v2 = await call('POST', '/api/ritual/visto', 'ritual-visto-12');
    const db2 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const rows12 = db2.prepare(`SELECT COUNT(*) AS n FROM pz_ritual WHERE user_id = 12 AND day_key = ?`).get(TODAY);
    // Defensivo: en el árbol SIN el fix no hay columna visto_at (la
    // contra-prueba debe fallar limpio, no romper con la excepción).
    let visto12 = null;
    try { visto12 = db2.prepare(`SELECT visto_at FROM pz_ritual WHERE user_id = 12 AND day_key = ?`).get(TODAY); } catch (e) { visto12 = null; }
    db2.close();
    t('A4: POST visto IDEMPOTENTE (2ª vez) → 200 + una sola fila, visto_at no nulo',
      v2.status === 200 && v2.json && v2.json.ok === true && v2.json.visto_hoy === true
      && rows12 && rows12.n === 1 && visto12 && !!visto12.visto_at,
      'status=' + v2.status + ' filas=' + JSON.stringify(rows12) + ' visto_at=' + JSON.stringify(visto12 && visto12.visto_at));
    const v3 = await call('POST', '/api/ritual/visto', 'ritual-visto-13');
    const db3 = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const rows13 = db3.prepare(`SELECT COUNT(*) AS n FROM pz_ritual WHERE user_id = 13 AND day_key = ?`).get(TODAY);
    db3.close();
    t('A5: POST visto SIN paquete hoy → 200 + sin_paquete true y NO crea fila',
      v3.status === 200 && v3.json && v3.json.ok === true && v3.json.sin_paquete === true && rows13 && rows13.n === 0,
      'status=' + v3.status + ' body=' + JSON.stringify(v3.json).slice(0, 150) + ' filas=' + JSON.stringify(rows13));
    const e3 = await call('GET', '/api/ritual/estado', 'ritual-visto-13');
    t('A6: estado SIN paquete → tiene_hoy false + visto_hoy false',
      e3.status === 200 && e3.json && e3.json.tiene_hoy === false && e3.json.visto_hoy === false,
      'body=' + JSON.stringify(e3.json).slice(0, 200));
    const vNoAuth = await call('POST', '/api/ritual/visto', null);
    t('A7: POST visto SIN sesión → 401', vNoAuth.status === 401, 'status=' + vNoAuth.status);
    const eNoAuth = await call('GET', '/api/ritual/estado', null);
    t('A8: GET estado SIN sesión → 401', eNoAuth.status === 401, 'status=' + eNoAuth.status);

    // ===== B) CLIENTE: la puerta (bundle real en vm) =====
    const estOk = { ok: true, tiene_hoy: true, ya_elegido: false };
    t('B1: puerta sin visto → DISPARA', pzRitualPuertaManana(estOk, false) === true);
    t('B2: puerta con visto del SERVIDOR → NO dispara', pzRitualPuertaManana(estOk, true) === false);
    t('B3: puerta con ya_elegido → NO dispara', pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: true }, false) === false);
    t('B4: puerta sin paquete → NO dispara', pzRitualPuertaManana({ ok: true, tiene_hoy: false, ya_elegido: false }, false) === false);
    t('B5: puerta con estado no ok → NO dispara', pzRitualPuertaManana({ ok: false }, false) === false);
    // localStorage como respaldo: empieza vacío, tras MarcarVista queda.
    sandbox.localStorage.clear();
    t('B6a: VistaHoy local empieza en false', pzRitualMananaVistaHoy() === false);
    pzRitualMananaMarcarVista();
    t('B6b: tras MarcarVista, VistaHoy local es true (respaldo)', pzRitualMananaVistaHoy() === true);
    // La expresión de la puerta: servidor manda, local es respaldo.
    sandbox.localStorage.clear();
    const estVisto = { ok: true, tiene_hoy: true, ya_elegido: false, visto_hoy: true };
    const vistoPorServidor = estVisto.visto_hoy || pzRitualMananaVistaHoy();
    t('B7a: visto del servidor solo (local vacío) → la puerta NO dispara', vistoPorServidor === true && pzRitualPuertaManana(estVisto, vistoPorServidor) === false);
    sandbox.localStorage.clear();
    pzRitualMananaMarcarVista();
    const vistoPorLocal = false || pzRitualMananaVistaHoy();
    t('B7b: visto LOCAL solo (servidor false) → la puerta NO dispara (respaldo)', vistoPorLocal === true && pzRitualPuertaManana({ ok: true, tiene_hoy: true, ya_elegido: false }, vistoPorLocal) === false);
    sandbox.localStorage.clear();
    const vistoNinguno = false || pzRitualMananaVistaHoy();
    t('B7c: sin visto en ningún lado → la puerta DISPARA', vistoNinguno === false && pzRitualPuertaManana(estOk, vistoNinguno) === true);
    // MarcarVistaServidor: existe, no tira, y dispara el POST.
    t('B8a: pzRitualMananaMarcarVistaServidor existe en el bundle', typeof pzRitualMananaMarcarVistaServidor === 'function');
    fetchCalls.length = 0;
    let noTira = true;
    try { pzRitualMananaMarcarVistaServidor(); } catch (e) { noTira = false; }
    await new Promise((r) => setTimeout(r, 100));
    const postVisto = fetchCalls.find((c) => c.url === '/api/ritual/visto' && c.method === 'POST');
    t('B8b: MarcarVistaServidor NO tira y hace POST /api/ritual/visto (fire-and-forget)',
      noTira === true && !!postVisto, 'llamadas=' + JSON.stringify(fetchCalls.slice(0, 5)));

    // ===== S) ESTÁTICA: el fix vive donde debe =====
    t('S1: server.js tiene POST /api/ritual/visto', SRV.includes("app.post('/api/ritual/visto'"));
    t('S2: /api/ritual/estado responde visto_hoy', SRV.includes('visto_hoy: !!(row && row.visto_at)'));
    t('S3: ritual-manana.js exporta marcarVisto y migra visto_at', RM.includes('function marcarVisto(') && RM.includes('marcarVisto,') && RM.includes('ADD COLUMN visto_at TEXT'));
    t('S4: app.js define MarcarVistaServidor y la puerta lee ritEstado.visto_hoy',
      SRC.includes('function pzRitualMananaMarcarVistaServidor()') && SRC.includes('(ritEstado && ritEstado.visto_hoy)'));
    t('S5: el reset de la recomendada limpia visto_at (paquete nuevo = no visto)',
      SRV.includes('picked_post_id = NULL, gold = 0, visto_at = NULL'));
    // S6: marcarVisto NO toca la elección (su cuerpo no menciona
    // picked_post_id — ver ≠ elegir sigue intacto).
    const m0 = RM.indexOf('function marcarVisto(');
    const mN = m0 >= 0 ? RM.indexOf('\n}\n', m0) : -1;
    const marcarBody = m0 >= 0 && mN > m0 ? RM.slice(m0, mN) : '';
    t('S6: marcarVisto NO toca la elección (sin picked_post_id en su cuerpo)',
      marcarBody.length > 0 && !marcarBody.includes('picked_post_id'),
      'cuerpo=' + marcarBody.slice(0, 80));

    console.log(`\nRITUAL-VISTO-v875: ${pass} ok, ${fail} fallas`);
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
