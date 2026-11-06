// test-ritual-hoy-contrato.js — LOTE RITUAL-HOY-FIX (bug en vivo 6/11 ~01:20).
// CONTRATO entre GET /api/ritual/hoy (servidor) y pzRitualHTML (cliente):
// el servidor responde el éxito con la clave `hoy` (día "YYYY-MM-DD") y el
// cliente renderiza el paquete solo si `d.hoy` es truthy.
// El bug: el servidor mandaba `dia: hoy` y el cliente chequeaba `if (!d.hoy)`
// → en éxito `d.hoy` era undefined → SIEMPRE «Hoy no tenés posteo
// programado.», aunque el 519 estaba programado. Las respuestas de vacío
// sí mandaban `hoy: null`, por eso el chequeo solo andaba para el vacío.
// Por qué el suite proximoritual (92/92) NO lo cazó: su fixture arma el
// payload A MANO con la clave que el cliente espera (`hoy: true` en la
// línea 264, `hoy: false` en la 293) — nunca pasa la respuesta REAL del
// servidor por pzRitualHTML. Este test sí: levanta el servidor real en una
// DB temporal, llama a GET /api/ritual/hoy por HTTP y pasa la respuesta
// REAL por pzRitualHTML (bundle real en vm, patrón repro-grid.js).
// Uso: node test-ritual-hoy-contrato.js (desde el scratch; corre contra
// work/ si existe, si no contra el árbol de este directorio). Sale 0 si
// todo pasa. En el árbol SIN el fix falla A2/A3/A5/A6/S1 (control negativo
// verificado); con el fix pasa todo.
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

// ---------- sandbox vm (mínimo del patrón proximoritual) ----------
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
const locObj = { hash: '#/app/ritual', href: 'https://postycommunitymanager.com/#/app/ritual', pathname: '/', search: '', host: 'postycommunitymanager.com' };
const sandbox = {
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' }),
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
const pzRitualHTML = sandbox.pzRitualHTML;
if (typeof pzRitualHTML !== 'function') {
  console.log('FAIL pzRitualHTML no existe en el bundle');
  process.exit(2);
}

// ---------- boot del servidor real ----------
const PORT = 34571;
const SECRET = 'ritual-hoy-contrato-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritual-hoy-contrato-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function getHoy(sid) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/ritual/hoy`, {
    headers: { Cookie: cookieFor(sid) },
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
    ADMIN_TOKEN: 'boot-test-token-ritual-hoy',
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
    t('boot: el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }

    // Siembra directa en la DB del boot (patrón conserje-panel-v2-boot):
    // user 12 con posteo de hoy (518, 17:00 EST) + 2 alternas (519, 521) y
    // fila pz_ritual ya armada (así NO se dispara la generación de alternas
    // por IA); user 13 sin posteos (vacío real).
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    // La tabla pz_ritual se crea LAZY (ensureRitualTable, al primer llamado
    // a un endpoint del ritual): la creo acá con el mismo DDL antes de
    // sembrar, igual que haría el servidor.
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
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (12, 'ritual-hoy-boot@test.invalid', 'x')`).run();
    db.prepare(`INSERT INTO users (id, email, password_hash) VALUES (13, 'ritual-hoy-vacio@test.invalid', 'x')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (12, 'America/New_York')`).run();
    db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (13, 'America/New_York')`).run();
    const insPost = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type) VALUES (?, 12, ?, ?, '', ?, 'scheduled', ?, 'image')`);
    insPost.run(518, '/media/518.jpg', 'Café de la casa, hecho con amor', at2200Z(TODAY), 'social');
    insPost.run(519, '/media/519.jpg', 'Detrás del mostrador', at2200Z(shiftDays(TODAY, 1)), 'detras');
    insPost.run(521, '/media/521.jpg', 'Lo nuevo de la semana', at2200Z(shiftDays(TODAY, 2)), 'novedad');
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (12, ?, 518, '[519,521]', NULL, 0)`).run(TODAY);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES ('ritual-hoy-12', ?, ?)`).run(sessJson(12), exp);
    db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES ('ritual-hoy-13', ?, ?)`).run(sessJson(13), exp);
    db.close();

    // ===== A) ÉXITO REAL: la respuesta del servidor pasa por el cliente =====
    const res = await getHoy('ritual-hoy-12');
    t('A1: GET /api/ritual/hoy con sesión → 200 + ok', res.status === 200 && res.json && res.json.ok === true,
      'status=' + res.status + ' body=' + JSON.stringify(res.json).slice(0, 300));
    const d = res.json || {};
    t('A2: CONTRATO — el éxito trae la clave `hoy` con el día de hoy', d.hoy === TODAY,
      'hoy=' + JSON.stringify(d.hoy) + ' esperado=' + TODAY + ' claves=' + Object.keys(d).join(','));
    t('A3: CONTRATO — el éxito NO trae la clave vieja `dia`', !('dia' in d),
      'claves=' + Object.keys(d).join(','));
    t('A4: el éxito trae 3 cartas (recomendada + 2 alternas)', Array.isArray(d.cartas) && d.cartas.length === 3,
      'cartas=' + JSON.stringify((d.cartas || []).map((c) => c.id)));
    const html = String(pzRitualHTML(d, false));
    t('A5: el cliente renderiza EL PAQUETE con la respuesta real (sin «Hoy no tenés posteo programado»)',
      !html.includes('Hoy no tenés posteo programado'), html.slice(0, 200));
    // El paquete nace VELADO (sin foto a propósito): la foto aparece al
    // ELEGIR. Con la respuesta real, elegir la recomendada revela su foto.
    const htmlR = String(pzRitualHTML(d, false, d.recomendada && d.recomendada.id));
    t('A6: al elegir la recomendada (respuesta real) se revela SU foto (518)',
      htmlR.includes('/media/518.jpg') && htmlR.includes('Sale así'),
      htmlR.slice(0, 300));
    t('A7: el paquete es el velado (data-pz-ritual-ver) con las 3 opciones ocultas',
      html.includes('data-pz-ritual-ver="1"') && html.includes('id="pzRitualCartas" hidden'));

    // ===== B) VACÍO REAL: sin posteo hoy el estado vacío sigue andando =====
    const resV = await getHoy('ritual-hoy-13');
    t('B1: sin posteo hoy → 200 + hoy null', resV.status === 200 && resV.json && resV.json.ok === true && resV.json.hoy === null,
      'status=' + resV.status + ' body=' + JSON.stringify(resV.json).slice(0, 200));
    const htmlV = String(pzRitualHTML(resV.json, false));
    t('B2: el vacío real SÍ renderiza «Hoy no tenés posteo programado.»',
      htmlV.includes('Hoy no tenés posteo programado'));

    // ===== C) MECANISMO DEL BUG (estático): el payload viejo con `dia` =====
    // Documenta por qué el 92/92 no lo cazó: el cliente solo mira `d.hoy`.
    const dViejo = { ok: true, dia: TODAY, recomendada: d.recomendada, cartas: d.cartas || [], elegida: null, dorada: false, racha: 0, album: { slots: [] }, publicado_hoy: false };
    const htmlViejo = String(pzRitualHTML(dViejo, false));
    t('C1: el payload VIEJO ({dia} sin {hoy}) renderiza el estado vacío — así era el bug',
      htmlViejo.includes('Hoy no tenés posteo programado'));

    // ===== S) ESTÁTICA: el fix vive en el handler de /api/ritual/hoy =====
    // OJO: /api/ritual/estado está definido ANTES que /api/ritual/hoy en el
    // archivo: el fin del handler es la siguiente ruta, no /estado.
    const h0 = SRV.indexOf("app.get('/api/ritual/hoy'");
    const hN = h0 >= 0 ? SRV.indexOf('\napp.', h0 + 1) : -1;
    const handler = h0 >= 0 && hN > h0 ? SRV.slice(h0, hN) : '';
    t('S1: el handler de éxito responde `hoy: hoy`', handler.includes('hoy: hoy'),
      'handler=' + (handler ? handler.slice(-200) : 'no encontrado'));
    t('S2: el handler ya NO responde `dia: hoy`', !handler.includes('dia: hoy'));
    t('S3: los vacíos del mismo handler siguen con `hoy: null`',
      (handler.match(/hoy: null/g) || []).length === 2);
    // La otra `dia:` del servidor (POST /api/admin/support/:userId/manana)
    // es otro endpoint con otro consumidor: NO se toca.
    t('S4: la `dia:` de /api/admin/support/:userId/manana sigue intacta (otro contrato)',
      SRV.includes("res.json({ ok: true, dia: r.dia, posts: r.posts, enviado: r.enviado })"));

    console.log(`\nRITUAL-HOY-CONTRATO: ${pass} ok, ${fail} fallas`);
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
