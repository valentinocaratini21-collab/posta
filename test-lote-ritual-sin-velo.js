// test-lote-ritual-sin-velo.js — LOTE RITUAL-SIN-VELO (9/11 · orden
// Valentino «el ritual solo confirma, no revela»): la hoja del ritual
// rinde la recomendada REVELADA directo (foto + texto + [Sale así] /
// [Editar] / [Cambiar algo]), a cualquier hora — sin paquete velado ni
// cuenta regresiva para VER. Ver ≠ elegir: ver no guarda selección ni
// confirma (sin POST al ver; solo [Sale así] confirma). La push 9:00 es
// RICA: lleva la foto del posteo adjunta (mutable-content + attachment
// en APNs, image en FCM/webpush) y la hora real de salida.
// ALCANCE (decisión del builder, ver STATUS.md §1): la rama de la
// TARDE (hoy ya salió, próximo paquete abre a las 00:00) CONSERVA su
// paquete velado con cuenta («1 carta adentro» + «tu paquete se abre
// en»): es el paquete de MAÑANA, genuinamente sin abrir. Las 4 frases
// del velo dan 0 en el render de la mañana (≥9:00 y pre-9:00, ES+EN) y
// «Tocá para verla» / «oculto. Tocá para verlo» dan 0 en todo el bundle.
// Uso: node test-lote-ritual-sin-velo.js (desde el scratch; corre contra
// work/ si existe, si no contra el árbol de este directorio). Sale 0 si
// todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

const TREE = fs.existsSync(path.join(__dirname, 'work', 'server.js'))
  ? path.join(__dirname, 'work') : __dirname;
const SRC = fs.readFileSync(path.join(TREE, 'public', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const MPP = fs.readFileSync(path.join(TREE, 'morning-post-push.js'), 'utf8');
const PUSH = fs.readFileSync(path.join(TREE, 'push.js'), 'utf8');
const SRV = fs.readFileSync(path.join(TREE, 'server.js'), 'utf8');
const M = require(path.join(TREE, 'morning-post-push.js'));

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
const fetchCalls = [];
async function fetchStub(url, opts) {
  fetchCalls.push({ url: String(url), opts: opts || null });
  if (String(url).includes('/api/ritual/elegir')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, elegida: 201, hora_salida: '17:00' }), text: async () => '{"ok":true,"hora_salida":"17:00"}' };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
}
const toastCalls = [];
const bbGoCalls = [];
const locObj = { hash: '#/app/ritual', href: 'https://postycommunitymanager.com/#/app/ritual', pathname: '/', search: '', host: 'postycommunitymanager.com' };
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

const VELO = ['1 carta adentro', 'Tocá para verla', 'oculto. Tocá para verlo', 'tu paquete se abre en',
  '1 card inside', 'Tap to see it', 'Your post for today, hidden', 'your pack opens in'];
const tieneVelo = (html) => VELO.some((f) => String(html).includes(f));

function carta(id, horaSalida) {
  const c = { id, imagen: '/media/a.jpg', caption: 'Café de la casa, hecho con amor', caption_corta: 'Café de la casa', tipo: 'imagen', media_type: 'image', recomendada: true, rubro: 'café' };
  if (horaSalida) c.hora_salida = horaSalida;
  return c;
}
function dRit(over) {
  const base = {
    hoy: '2026-11-09', racha: 3, dorada: false, elegida: 0,
    recomendada: carta(201), cartas: [carta(201)],
    album: { slots: [] },
    abre_a: new Date(Date.now() - 3600 * 1000).toISOString(),
    ahora: new Date().toISOString(), abre_hora: '9:00',
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
  sandbox.toast = (m) => { toastCalls.push(m); };
  sandbox.bbGo = (h) => { bbGoCalls.push(h); };
  const { pzRitualHTML, pzRitualConfirmar, pzRitualSelLeer } = sandbox;

  // ===== 1) HOJA ≥9:00: rinde revelada (ES + EN) =====
  const htmlEs = String(pzRitualHTML(dRit(), false));
  t('1-hoja-9: ES rinde revelada (foto + caption + 3 botones)', htmlEs.includes('/media/a.jpg') && htmlEs.includes('Café de la casa') && htmlEs.includes('Sale así') && htmlEs.includes('data-pz-ritual-ok="201"') && htmlEs.includes('Editar texto') && htmlEs.includes('data-pc-act="edit-cap"') && htmlEs.includes('Cambiar algo') && htmlEs.includes('data-pz-ritual-cambio="201"'));
  t('1-hoja-9: ES lleva la marca de revelada (data-pz-ritual-revelada + postId)', htmlEs.includes('data-pz-ritual-revelada="1"') && htmlEs.includes('data-post-id="201"'));
  const htmlEn = String(pzRitualHTML(dRit(), true));
  t('1-hoja-9: EN rinde revelada (foto + caption + 3 botones en inglés)', htmlEn.includes('/media/a.jpg') && htmlEn.includes('Café de la casa') && htmlEn.includes('Post it like this') && htmlEn.includes('Edit text') && htmlEn.includes('Change something'));
  t('1-hoja-9: ≥9:00 NO lleva el aviso de las 9:00 (ya pasó)', !htmlEs.includes('te avisamos a las 9:00 para confirmar') && !htmlEn.includes("we’ll let you know at 9:00 AM to confirm"));

  // ===== 2) 0 REFERENCIAS AL VELO EN EL RENDER DE LA MAÑANA =====
  t('2-velo: ≥9:00 ES tiene 0 frases del velo', !tieneVelo(htmlEs), VELO.filter((f) => htmlEs.includes(f)).join(', '));
  t('2-velo: ≥9:00 EN tiene 0 frases del velo', !tieneVelo(htmlEn), VELO.filter((f) => htmlEn.includes(f)).join(', '));
  const htmlPreEs = String(pzRitualHTML(dRit({ abre_a: new Date(Date.now() + 2 * 3600 * 1000).toISOString() }), false));
  const htmlPreEn = String(pzRitualHTML(dRit({ abre_a: new Date(Date.now() + 2 * 3600 * 1000).toISOString() }), true));
  t('2-velo: pre-9:00 ES tiene 0 frases del velo', !tieneVelo(htmlPreEs), VELO.filter((f) => htmlPreEs.includes(f)).join(', '));
  t('2-velo: pre-9:00 EN tiene 0 frases del velo', !tieneVelo(htmlPreEn), VELO.filter((f) => htmlPreEn.includes(f)).join(', '));
  // Estático: el gesto de revelar murió por completo (0 en el bundle).
  const count = (s) => (SRC.split(s).length - 1);
  t('2-velo: «Tocá para verla» ×0 en app.js', count('Tocá para verla') === 0);
  t('2-velo: «Tap to see it» ×0 en app.js', count('Tap to see it') === 0);
  t('2-velo: aria «oculto. Tocá para verlo» ×0 en app.js', count('oculto. Tocá para verlo') === 0);
  t('2-velo: aria EN «hidden. Tap to see it» ×0 en app.js', count('Your post for today, hidden. Tap to see it') === 0);
  t('2-velo: data-pz-ritual-ver ×0 en app.js (sin handler ni markup)', !SRC.includes('data-pz-ritual-ver'));
  t('2-velo: pzRitualElegir/pzRitualRevelar ×0 en app.js', !SRC.includes('pzRitualElegir') && !SRC.includes('pzRitualRevelar'));
  t('2-velo: .pz-ritual-velado ×0 en styles.css (regla muerta)', !CSS.includes('.pz-ritual-velado{'));
  // Las 2 frases que quedan viven SOLO en la rama de la tarde (el
  // paquete de mañana, abre a las 00:00): exactamente 1 ocurrencia
  // cada una en app.js.
  t('2-velo: «1 carta adentro» ×1 en app.js (solo la rama de la tarde)', count('1 carta adentro') === 1);
  t('2-velo: «tu paquete se abre en» ×1 en app.js (solo la rama de la tarde)', count('tu paquete se abre en') === 1);

  // ===== 3) VER ≠ ELEGIR: ver no guarda ni confirma =====
  fetchCalls.length = 0;
  sandbox.localStorage.clear();
  const htmlVer = String(pzRitualHTML(dRit(), false));
  t('3-ver: ver rinde la hoja sin llamar al servidor', htmlVer.includes('/media/a.jpg') && fetchCalls.length === 0, JSON.stringify(fetchCalls));
  t('3-ver: ver NO guarda selección (SelLeer 0)', pzRitualSelLeer() === 0);
  t('3-ver: ver NO confirma (sin POST a /api/ritual/elegir)', !fetchCalls.some((c) => String(c.url).includes('/api/ritual/elegir')));
  // Solo [Sale así] confirma: POST + toast + feed.
  fetchCalls.length = 0;
  let errOk = null;
  try { await pzRitualConfirmar('201'); } catch (e) { errOk = e; }
  t('3-ver: [Sale así] SÍ confirma (POST /api/ritual/elegir con el posteo)', errOk === null && fetchCalls.some((c) => String(c.url).includes('/api/ritual/elegir') && String(c.opts.body || '').includes('201')), JSON.stringify(fetchCalls));
  t('3-ver: [Sale así] toastea con la hora y vuelve al feed', toastCalls.some((m) => String(m).includes('Listo, sale hoy a las 17:00')) && bbGoCalls.some((h) => h === '#/app/inicio'));

  // ===== 4) RAMA PRE-9:00: revelada + aviso de las 9:00 (ES + EN) =====
  t('4-pre9: ES rinde revelada (foto + 3 botones)', htmlPreEs.includes('/media/a.jpg') && htmlPreEs.includes('Sale así') && htmlPreEs.includes('data-pz-ritual-ok="201"'));
  t('4-pre9: ES avisa «Sale hoy a las 19:00 — te avisamos a las 9:00 para confirmar»', htmlPreEs.includes('Sale hoy a las 19:00') && htmlPreEs.includes('te avisamos a las 9:00 para confirmar'));
  t('4-pre9: EN rinde revelada (foto + 3 botones)', htmlPreEn.includes('/media/a.jpg') && htmlPreEn.includes('Post it like this'));
  t("4-pre9: EN avisa «It goes out today at 7:00 PM — we’ll let you know at 9:00 AM to confirm»", htmlPreEn.includes('It goes out today at 7:00 PM') && htmlPreEn.includes("we’ll let you know at 9:00 AM to confirm"));
  t('4-pre9: la hora del aviso es la REAL del posteo (no el default)', String(pzRitualHTML(dRit({ abre_a: new Date(Date.now() + 2 * 3600 * 1000).toISOString(), recomendada: carta(201, '17:00'), cartas: [carta(201, '17:00')] }), false)).includes('Sale hoy a las 17:00'));
  t('4-pre9: pre-9:00 NO hay cuenta regresiva (sin id pzRitualCuenta)', !htmlPreEs.includes('id="pzRitualCuenta"') && !htmlPreEn.includes('id="pzRitualCuenta"'));

  // ===== 5) PUSH 9:00 RICA (módulo + payload real capturado) =====
  t('5-push: texto ES exacto de Valentino', M.morningText('es').body === 'Hoy sale este — sale a las 19:00');
  t('5-push: texto EN espejo', M.morningText('en').body === "Today's post is ready — goes out at 7:00 PM");
  const fnText = MPP.slice(MPP.indexOf('function morningText'), MPP.indexOf('function saleHourInTz'));
  t('5-push: el cuerpo viejo murió (morningText ya no devuelve «Tu posteo de hoy ya está 👇»)', !fnText.includes('Tu posteo de hoy ya está') && !fnText.includes('Your post for today is ready'));
  // APNs: mutable-content siempre + attachment cuando hay imagen.
  t('5-push: APNs lleva mutable-content: 1', PUSH.includes("'mutable-content': 1"));
  t('5-push: APNs adjunta la imagen (payload.image) cuando hay', PUSH.includes('if (msg.image) payload.image = msg.image'));
  t('5-push: sendPush acepta image y la pasa (webpush/FCM/APNs)', PUSH.includes('image: image ? String(image)') && PUSH.includes('image: msg.image || undefined') && PUSH.includes('if (msg.image) message.message.notification.image = msg.image'));
  // Payload real: barrido con DB en memoria + pushFn stub.
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, lang TEXT DEFAULT 'es', publishing_stopped INTEGER DEFAULT 0);
    CREATE TABLE settings (user_id INTEGER, timezone TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, scheduled_at TEXT, status TEXT, image_path TEXT, media_type TEXT);
    CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY, user_id INTEGER, endpoint TEXT, keys_json TEXT DEFAULT '{}', transport TEXT DEFAULT 'webpush');`);
  db.prepare(`INSERT INTO users (id, email, lang, publishing_stopped) VALUES (1, 'u1@test.dev', 'es', 0)`).run();
  db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (1, 'America/Argentina/Buenos_Aires')`).run();
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint) VALUES (1, 'https://push.test/1')`).run();
  db.prepare(`INSERT INTO posts (id, user_id, scheduled_at, status, image_path, media_type) VALUES (11, 1, '2026-11-02T22:00:00Z', 'scheduled', '/media/11.jpg', 'image')`).run();
  const sent = [];
  const pushFn = async (uid, payload) => { sent.push({ uid, payload }); return { ok: true, sent: 1 }; };
  const r = await M.sendMorningPostPush(db, { now: new Date('2026-11-02T12:00:00Z'), pushFn });
  t('5-push: el barrido 9:00 envía 1 push', r.sent === 1 && sent.length === 1, 'sent=' + r.sent);
  const p = sent[0] && sent[0].payload;
  t('5-push: el payload lleva el texto nuevo ES', p && p.body === 'Hoy sale este — sale a las 19:00');
  t('5-push: el payload lleva la foto adjunta (URL absoluta canónica)', p && p.image === 'https://postycommunitymanager.com/media/11.jpg', JSON.stringify(p && p.image));
  t('5-push: el deep link es /#/app/ritual con postId', p && p.url === '/#/app/ritual' && p.data && p.data.postId === '11', JSON.stringify(p && p.url) + ' ' + JSON.stringify(p && p.data));

  // ===== 6) /media/ ALCANZABLE (boot real: la URL del adjunto resuelve) =====
  // La URL del adjunto es https://postycommunitymanager.com/media/11.jpg:
  // se verifica que la MISMA ruta (/media/11.jpg) sirve 200 en el
  // servidor real (express.static público, sin auth). La comprobación
  // contra el dominio en vivo no se hace (Cloudflare + puerta).
  const PORT = 34573;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritual-sin-velo-media-'));
  const mediaDir = path.join(tmpDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, '11.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]));
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir,
    ADMIN_TOKEN: 'boot-test-token-ritual-sin-velo',
    SESSION_SECRET: 'ritual-sin-velo-secret',
    NODE_PATH: '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules',
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
        const rr = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (rr.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((res) => setTimeout(res, 1000));
    }
    t('6-media: el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const m = await fetch(`http://127.0.0.1:${PORT}/media/11.jpg`);
    t('6-media: GET /media/11.jpg → 200 (la URL del adjunto resuelve)', m.status === 200, 'status=' + m.status);
    const ct = m.headers.get('content-type') || '';
    t('6-media: /media/11.jpg se sirve como imagen', /image\//.test(ct), 'content-type=' + ct);
    const m404 = await fetch(`http://127.0.0.1:${PORT}/media/no-existe.jpg`);
    t('6-media: /media/ sin archivo → 404 (no se inventa nada)', m404.status === 404, 'status=' + m404.status);
  } finally {
    kill();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  // ===== 7) ESTÁTICA: la cuenta y el aviso de las 9:00 quedan =====
  t('7-intacto: el aviso de las 9:00 y la confirmación siguen (pzRitualConfirmar + /api/ritual/elegir)', SRC.includes('async function pzRitualConfirmar(id)') && SRC.includes("api.post('/api/ritual/elegir'"));
  t('7-intacto: el servidor sigue mandando abre_a/ahora/abre_hora en /api/ritual/hoy', SRV.includes('abre_a: abreA') && SRV.includes('ahora: new Date().toISOString()') && SRV.includes("abre_hora: '9:00'"));
  t('7-intacto: la rama de la tarde (paquete de mañana, 00:00) sigue con su cuenta', SRC.includes("if (!d.hoy && d.proximo && d.proximo.abre_a)") && SRC.includes('id="pzRitualCuenta"'));
  t('7-intacto: el tick de la cuenta sigue (pzRitualCuentaTick para la rama de la tarde)', SRC.includes('function pzRitualCuentaTick()') && SRC.includes('function pzRitualCuentaTxt('));

  console.log(`\nRITUAL-SIN-VELO: ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
