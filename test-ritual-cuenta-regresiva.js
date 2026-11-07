// test-ritual-cuenta-regresiva.js — LOTE RITUAL-CUENTA-REGRESIVA, SOLO LA
// CUENTA (mock aprobado Valentino 6/11 01:53, «Si, perfecto»; los-3 quedó
// fuera por decisión Valentino 6/11 16:16 «Solo la cuenta regresiva»).
// 1) CUENTA REGRESIVA: antes de las 9:00 (hora de la cuenta) la pantalla
//    del ritual es el conteo en vivo con el paquete velado detrás; a las
//    9:00 se convierte en el paquete sin navegar.
// 2) EL VACÍO NUNCA APARECE: sin posteo hoy, #/app/ritual redirige a
//    Inicio sin pantalla intermedia.
// 3) SIN LOS-3: no hay endpoint elegir-tres, ni botón dorado, ni
//    tres.posible, ni tres_ids, ni aplicarTres (este suite lo afirma
//    en negativo: C12b/C12d/H1e/H4b).
// Patrón test-ritual-hoy-contrato.js: la respuesta REAL del servidor por
// HTTP pasa por el render REAL del cliente (lección dia/hoy: un suite
// puede dar 92/92 y no cazar un mismatch de claves si los fixtures se
// arman a mano).
// Uso: node test-ritual-cuenta-regresiva.js (desde el scratch)
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

function carta(id, rec, rubro, img) {
  return { id, recomendada: !!rec, rubro, imagen: img || ('/media/' + id + '.jpg'), media_type: 'image', caption_corta: 'Caption del posteo ' + id };
}
function payloadBase(over) {
  const base = {
    ok: true, hoy: TODAY, recomendada: carta(518, true, 'Café'),
    cartas: [carta(518, true, 'Café')],
    elegida: null, dorada: false, racha: 0,
    album: { lunes: TODAY, slots: [] }, publicado_hoy: false,
    abre_a: nyWallToUtc(TODAY, 9), ahora: new Date().toISOString(), abre_hora: '9:00',
  };
  return Object.assign(base, over || {});
}

(async () => {
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  const S = sandbox;
  const { pzRitualHTML, pzRitualCuentaTxt, pzRitualCuentaTick } = S;

  // --- C1) cuenta regresiva con payload fabricado (determinista) ---
  // C1b determinista (re-base v726): UN solo instante `ahoraMs` para
  // `abre_a` y `ahora` — si se toman dos Date.now() distintos, el floor
  // de pzRitualCuentaTxt da :23 en vez de :24 salvo mismo milisegundo
  // (flaky 1/5 corridas). El render calcula falta = abre_a − ahora, así
  // que con un solo instante falta es exactamente 7h17m24s.
  const ahoraMs = Date.now();
  const abreFuturo = new Date(ahoraMs + (7 * 3600 + 17 * 60 + 24) * 1000).toISOString();
  const dCuenta = payloadBase({ abre_a: abreFuturo, ahora: new Date(ahoraMs).toISOString() });
  const htmlCuenta = String(pzRitualHTML(dCuenta, false));
  t('C1a: antes de las 9:00 renderiza la cuenta regresiva (id pzRitualCuenta)', htmlCuenta.includes('id="pzRitualCuenta"'));
  t('C1b: el conteo muestra 07:17 grande y :24 chico (segundos incluidos)', htmlCuenta.includes('<span class="pz-ritual-cuenta-hm">07:17</span><span class="pz-ritual-cuenta-ss">:24</span>'), htmlCuenta.slice(0, 400));
  t('C1c: la línea «faltan 7 h 17 min para ver tu próximo posteo» (corrección Valentino 19:26: la cuenta es para VER el posteo, no «para las 9:00»)', htmlCuenta.includes('faltan <b>7 h 17 min</b> para ver tu próximo posteo'));
  t('C1d: el paquete velado detrás: 3 dorsos navy con ✦', (htmlCuenta.match(/pz-dorso/g) || []).length >= 3);
  t('C1e: nada tocable en la cuenta: sin data-pz-ritual-elegir ni data-pz-ritual-ver', !htmlCuenta.includes('data-pz-ritual-elegir') && !htmlCuenta.includes('data-pz-ritual-ver'));
  t('C1f: sin botón de los 3 ni «Tocá para ver» antes de las 9:00', !htmlCuenta.includes('data-pz-ritual-tres') && !htmlCuenta.includes('Tocá para ver'));
  t('C1g: la cuenta dice «Se abre a las 9:00» + nota de la push', htmlCuenta.includes('Se abre a las 9:00') && htmlCuenta.includes('te llega la push'));

  // --- C2) paquete después de las 9:00 (abre_a pasado) ---
  const dPaquete = payloadBase({ abre_a: new Date(Date.now() - 3600 * 1000).toISOString() });
  const htmlPaquete = String(pzRitualHTML(dPaquete, false));
  t('C2a: pasada las 9:00 NO hay cuenta regresiva, hay paquete velado', !htmlPaquete.includes('id="pzRitualCuenta"') && htmlPaquete.includes('data-pz-ritual-ver="1"'));

  // --- C6) elegido con UNA sola sigue igual que antes ---
  const dElegUna = payloadBase({ abre_a: new Date(Date.now() - 3600 * 1000).toISOString(), elegida: 518 });
  const htmlUna = String(pzRitualHTML(dElegUna, false));
  t('C6: elegido con una: «Listo, hoy sale esta» y sin línea de los 3', htmlUna.includes('Listo, hoy sale esta') && !htmlUna.includes('hoy salen las 3'));

  // --- C7) helpers puros ---
  t('C7a: pzRitualCuentaTxt(7h17m24s) = {07:17:24, hm 07:17, ss :24, 7 h 17 min}', eq(pzRitualCuentaTxt((7 * 3600 + 17 * 60 + 24) * 1000), { reloj: '07:17:24', hm: '07:17', ss: ':24', faltan: '7 h 17 min' }));
  t('C7b: pzRitualCuentaTxt(45min) = {00:45:00, 45 min}', eq(pzRitualCuentaTxt(45 * 60 * 1000), { reloj: '00:45:00', hm: '00:45', ss: ':00', faltan: '45 min' }));
  t('C7c: pzRitualCuentaTxt(30s) = {00:00:30, 30 s}', eq(pzRitualCuentaTxt(30 * 1000), { reloj: '00:00:30', hm: '00:00', ss: ':30', faltan: '30 s' }));

  // --- C8) tick de la cuenta regresiva ---
  const abreTick = new Date(Date.now() + (3600 + 5) * 1000).toISOString();
  els.pzRitualCuenta = { textContent: '01:00:05', innerHTML: '', getAttribute: (k) => (k === 'data-pz-cuenta-abre' ? abreTick : (k === 'data-pz-cuenta-sesgo' ? '0' : null)) };
  els.pzRitualCuentaSub = { innerHTML: '', getAttribute: () => null };
  pzRitualCuentaTick();
  t('C8a: el tick actualiza el conteo en vivo (01:00:0X, segundos chicos)', /^<span class="pz-ritual-cuenta-hm">01:00<\/span><span class="pz-ritual-cuenta-ss">:0[3-5]<\/span>$/.test(els.pzRitualCuenta.innerHTML), 'innerHTML=' + els.pzRitualCuenta.innerHTML);
  t('C8b: el tick actualiza la línea «faltan … para ver tu próximo posteo»', els.pzRitualCuentaSub.innerHTML.includes('faltan <b>1 h 00 min</b> para ver tu próximo posteo'), els.pzRitualCuentaSub.innerHTML);

  // --- C9) tick a cero → recarga y aparece el paquete (sin navegar) ---
  els.pzRitual = { isConnected: true, innerHTML: '' };
  hoyPayload = payloadBase({ abre_a: new Date(Date.now() - 1000).toISOString() });
  els.pzRitualCuenta = { textContent: '00:00:00', getAttribute: (k) => (k === 'data-pz-cuenta-abre' ? new Date(Date.now() - 1000).toISOString() : '0') };
  delete els.pzRitualCuentaSub;
  pzRitualCuentaTick();
  await new Promise((r) => setTimeout(r, 100));
  t('C9: al llegar a 0 el tick recarga y la pantalla es el paquete (no la cuenta)', els.pzRitual.innerHTML.includes('data-pz-ritual-ver="1"') && !els.pzRitual.innerHTML.includes('id="pzRitualCuenta"'), els.pzRitual.innerHTML.slice(0, 200));

  // --- C10) redirección del vacío + publicado_hoy ---
  S.bbGo = (h) => { bbGoCalls.push(h); };
  t('C10a: el stub de bbGo quedó instalado', (() => { S.bbGo('#/test'); return bbGoCalls[0] === '#/test'; })());
  bbGoCalls.length = 0;
  els.pzRitual = { isConnected: true, innerHTML: 'ANTES' };
  hoyPayload = { ok: true, hoy: null, racha: 0, album: { lunes: TODAY, slots: [] }, publicado_hoy: false };
  await S.pzRitualCargar();
  t('C10b: sin posteo hoy → redirige a Inicio (bbGo #/app/inicio)', bbGoCalls.includes('#/app/inicio'), JSON.stringify(bbGoCalls));
  t('C10c: sin posteo hoy → NO renderiza el vacío «Hoy no tenés posteo programado.»', els.pzRitual.innerHTML === 'ANTES' && !els.pzRitual.innerHTML.includes('Hoy no tenés posteo programado'));
  bbGoCalls.length = 0;
  hoyPayload = { ok: true, hoy: null, racha: 0, album: { lunes: TODAY, slots: [] }, publicado_hoy: true };
  await S.pzRitualCargar();
  t('C10d: publicado_hoy → NO redirige y muestra «El posteo de hoy ya salió»', !bbGoCalls.includes('#/app/inicio') && els.pzRitual.innerHTML.includes('El posteo de hoy ya salió, mañana hay otro paquete.'), els.pzRitual.innerHTML.slice(0, 200));

  // --- C12) auditoría M78 + estática (solo la cuenta; los-3 en negativo) ---
  const fns = ['pzRitualCuentaTxt', 'pzRitualCuentaTick'];
  t('C12a: M78 — las 2 funciones nuevas de la cuenta existen definidas en el bundle', fns.every((f) => typeof S[f] === 'function'), fns.filter((f) => typeof S[f] !== 'function').join(','));
  t('C12b: M78 — SIN los-3: ninguna función ni delegación de los 3 en el bundle', !SRC.includes('pzRitualTres') && !SRC.includes("data-pz-ritual-tres") && !SRC.includes('PZ_RITUAL_D'));
  t('C12c: CSS — las clases nuevas de la cuenta existen y NO hay clases de los 3 (.pz-ritual-cuenta-num sí; .pz-ritual-tres, .pz-ritual-badge.hora, .pz-ritual-slot.tres no)',
    CSS.includes('.pz-ritual-cuenta-num') && !CSS.includes('.pz-ritual-tres{') && !CSS.includes('.pz-ritual-badge.hora') && !CSS.includes('.pz-ritual-slot.tres'));
  t('C12d: el servidor NO expone POST /api/ritual/elegir-tres', !SRV.includes("app.post('/api/ritual/elegir-tres'"));
  t('C12e: el servidor responde abre_a/ahora/abre_hora en /api/ritual/hoy', SRV.includes('abre_a: abreA') && SRV.includes('ahora: new Date().toISOString()') && SRV.includes("abre_hora: '9:00'"));
  t('C12f: la rama de vacío sigue existiendo solo como fallback (test B2 intacto)', SRC.includes('Hoy no tenés posteo programado.'));

  // ===== H) HTTP: servidor real en DB temporal (M121: boot en copia aislada) =====
  const PORT = 34572;
  const SECRET = 'test-secret-cuenta-regresiva';
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritual-cuenta-boot-'));
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
    ADMIN_TOKEN: 'boot-test-token-cuenta-regresiva',
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
    // Siembra: user 12 (rec 17:00 NY), user 13 (vacío),
    // user 15 (rec 17:00 NY, para elegir UNA sola).
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
    for (const uid of [12, 13, 15]) {
      db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (?, ?, 'x')`).run(uid, 'ritual-cr-' + uid + '@test.invalid');
      db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`).run(uid);
      db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('ritual-cr-' + uid, sessJson(uid), exp);
    }
    const insPost = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type) VALUES (?, ?, ?, ?, '', ?, ?, ?, 'image')`);
    insPost.run(518, 12, '/media/518.jpg', 'Café de la casa, hecho con amor', nyWallToUtc(TODAY, 17), 'scheduled', 'social');
    insPost.run(519, 12, '/media/519.jpg', 'Detrás del mostrador', null, 'draft', 'detras');
    insPost.run(521, 12, '/media/521.jpg', 'Lo nuevo de la semana', null, 'draft', 'novedad');
    insPost.run(718, 15, '/media/718.jpg', 'Rec uno', nyWallToUtc(TODAY, 17), 'scheduled', 'social');
    insPost.run(719, 15, '/media/719.jpg', 'Alt uno 1', null, 'draft', 'detras');
    insPost.run(721, 15, '/media/721.jpg', 'Alt uno 2', null, 'draft', 'novedad');
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (12, ?, 518, '[519,521]', NULL, 0)`).run(TODAY);
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (15, ?, 718, '[719,721]', NULL, 0)`).run(TODAY);
    db.close();

    // --- H1) /api/ritual/hoy real → contrato de la cuenta ---
    const res12 = await api('ritual-cr-12', 'GET', '/api/ritual/hoy');
    const d12 = res12.json || {};
    t('H1a: GET /api/ritual/hoy user 12 → 200 + ok + hoy', res12.status === 200 && d12.ok === true && d12.hoy === TODAY, 'status=' + res12.status + ' body=' + JSON.stringify(d12).slice(0, 200));
    t('H1b: CONTRATO — abre_a es hoy 9:00 en la zona de la cuenta (NY)', d12.abre_a === nyWallToUtc(TODAY, 9), 'abre_a=' + d12.abre_a + ' esperado=' + nyWallToUtc(TODAY, 9));
    t('H1c: CONTRATO — ahora es un ISO reciente del servidor', typeof d12.ahora === 'string' && Math.abs(Date.parse(d12.ahora) - Date.now()) < 120000, 'ahora=' + d12.ahora);
    t('H1d: CONTRATO — abre_hora es 9:00', d12.abre_hora === '9:00');
    t('H1e: CONTRATO — la respuesta NO trae clave `tres` (los-3 fuera)', !('tres' in d12), 'claves=' + Object.keys(d12).join(','));
    t('H1f: el éxito trae UNA sola carta (la recomendada)', Array.isArray(d12.cartas) && d12.cartas.length === 1 && d12.cartas[0].id === 518, 'cartas=' + JSON.stringify((d12.cartas || []).map((c) => c.id)));

    // La cuenta regresiva real por HTTP: si ahora < 9:00 NY, el render real
    // es la cuenta; si ya pasó, es el paquete. En ambos casos, nunca el vacío.
    const htmlReal = String(pzRitualHTML(d12, false));
    const antes9 = Date.parse(d12.abre_a) > Date.now();
    t('H1g: con la respuesta REAL, el render es cuenta (antes 9:00) o paquete (después), nunca vacío',
      !htmlReal.includes('Hoy no tenés posteo programado')
      && (antes9 ? htmlReal.includes('id="pzRitualCuenta"') : htmlReal.includes('data-pz-ritual-ver="1"')),
      'antes9=' + antes9 + ' html=' + htmlReal.slice(0, 150));

    // --- H4) elegir UNA sola sigue andando (v687 intacto) ---
    const rUno = await api('ritual-cr-15', 'POST', '/api/ritual/elegir', { post_id: 719 });
    t('H4a: POST /api/ritual/elegir (una sola) sigue ok', rUno.status === 200 && rUno.json && rUno.json.ok === true && rUno.json.elegida === 719, 'status=' + rUno.status + ' body=' + JSON.stringify(rUno.json).slice(0, 200));
    const res15 = await api('ritual-cr-15', 'GET', '/api/ritual/hoy');
    const d15 = res15.json || {};
    t('H4b: tras elegir una, /hoy muestra elegida y NO trae clave `tres`', d15.elegida === 719 && !('tres' in d15), 'tres=' + JSON.stringify(d15.tres));
    t('H4c: el render de elegir una NO muestra la línea de los 3', !String(pzRitualHTML(d15, false)).includes('hoy salen las 3'));

    // --- H5) vacío real (user 13) ---
    const res13 = await api('ritual-cr-13', 'GET', '/api/ritual/hoy');
    t('H5: sin posteo hoy → 200 + hoy null (el cliente redirige, C10)', res13.status === 200 && res13.json && res13.json.ok === true && res13.json.hoy === null, 'status=' + res13.status + ' body=' + JSON.stringify(res13.json).slice(0, 200));

    console.log(`\nRITUAL-CUENTA-REGRESIVA: ${pass} ok, ${fail} fallas`);
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
