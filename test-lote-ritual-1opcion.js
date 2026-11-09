// test-lote-ritual-1opcion.js — LOTE RITUAL-1-OPCION (6/11 · decisión
// Valentino «una sola opción + editar» + «un posteo por día» + flujo de
// la mañana fricción cero, 3 toques).
// Cubre los puntos 1-10:
//  A) Servidor real (boot): hoy trae 1 sola carta (la recomendada) con
//     hora_salida; elegir confirma con hora_salida; ensure reusa el
//     borrador de hoy (lo programa, no genera); idempotencia (2 llamadas
//     → 1 solo posteo hoy); fail-closed sin nada (hoy:null, nada
//     inventado); /api/week/ensure ya no genera la semana.
//  B) Bundle real (vm): el feed muestra SOLO hoy + publicados (borradores
//     y programados futuros fuera); álbum con días + 1 solo candado;
//     revelar guarda selección; [Cambiar algo] manda el pedido al chat;
//     [Sale así] toastea con la hora y vuelve al feed; [Editar] con
//     data-full.
//  C) Estáticas: deep link push→paquete; crons (domingo solo graduación
//     nivel 2, sin tanda); exports; sin código muerto de 3 opciones.
// Uso: node test-lote-ritual-1opcion.js (desde el scratch; corre contra
// work/ si existe, si no contra el árbol de este directorio). Sale 0 si
// todo pasa.
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
const CSS = fs.readFileSync(path.join(TREE, 'public', 'styles.css'), 'utf8');
const SCH = fs.readFileSync(path.join(TREE, 'scheduler.js'), 'utf8');
const MPP = fs.readFileSync(path.join(TREE, 'morning-post-push.js'), 'utf8');
const SW = fs.readFileSync(path.join(TREE, 'public', 'sw.js'), 'utf8');
const PUSH = fs.readFileSync(path.join(TREE, 'push.js'), 'utf8');
const { dayKeyInTz } = require(path.join(TREE, 'morning-post-push.js'));

const TZ = 'America/New_York';
const TODAY = dayKeyInTz(new Date(), TZ);
const shiftDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const at2200Z = (ymd) => ymd + 'T22:00:00.000Z'; // 17:00 EST, formato de producción
const TODAY_10UTC = TODAY + ' 10:00:00'; // 05:00 EST de hoy, formato espacio (lo que parsea ensure)

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
const hablarCalls = [];
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

// ---------- boot del servidor real ----------
const PORT = 34572;
const SECRET = 'ritual-1opcion-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ritual-1opcion-'));
const nodeModules = '/home/hatch/workspace/.lote-pruebaentrada-boot/node_modules';

function signSid(sid) {
  return sid + '.' + crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
}
function cookieFor(sid) {
  return 'connect.sid=' + encodeURIComponent('s:' + signSid(sid));
}
async function api(sid, method, p, body) {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
    method, headers: { Cookie: cookieFor(sid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}

(async () => {
  // ===== B/C primero (vm + estáticas, sin servidor) =====
  try {
    vm.runInContext(SRC, sandbox, { filename: 'app.js' });
  } catch (e) {
    console.log('FAIL bundle no carga: ' + (e && e.message));
    process.exit(2);
  }
  // El bundle define toast/bbGo: los stubs se ponen DESPUÉS de cargar.
  sandbox.toast = (m) => { toastCalls.push(m); };
  sandbox.bbGo = (h) => { bbGoCalls.push(h); };
  const { homeGridCompose, pzRitualHTML, pzRitualRevelar, pzRitualPedirCambio, pzRitualConfirmar, pzRitualSelLeer } = sandbox;

  // ----- B1: feed, un posteo por día -----
  const schedHoy = { id: 519, status: 'scheduled', scheduled_at: at2200Z(TODAY), media_type: 'image', image_path: '/media/519.jpg', caption: 'Hoy' };
  const schedHoy2 = { id: 520, status: 'scheduled', scheduled_at: TODAY + 'T23:00:00.000Z', media_type: 'image', image_path: '/media/520.jpg', caption: 'Hoy, en publicación' };
  const schedManana = { id: 521, status: 'scheduled', scheduled_at: at2200Z(shiftDays(TODAY, 1)), media_type: 'image', image_path: '/media/521.jpg', caption: 'Mañana' };
  const draftFuturo = { id: 558, status: 'draft', created_at: TODAY_10UTC, media_type: 'image', image_path: '/media/558.jpg', caption: 'Borrador futuro' };
  const publicado = { id: 551, status: 'published', published_at: shiftDays(TODAY, -2) + 'T22:00:00.000Z', scheduled_at: shiftDays(TODAY, -2) + 'T22:00:00.000Z', media_type: 'image', ig_permalink: 'https://instagram.com/p/a', ig_state: 'live', image_path: '/media/551.jpg' };
  const tiles = homeGridCompose({
    upcoming: [
      { p: schedHoy, ymd: TODAY },
      { p: schedHoy2, ymd: TODAY },
      { p: schedManana, ymd: shiftDays(TODAY, 1) },
      { p: draftFuturo, ymd: shiftDays(TODAY, 2) },
    ],
    published: [publicado], recents: [],
  });
  const tileIds = tiles.map((x) => (x.post ? x.post.id : x.shortcode));
  t('B1-feed: la carta de hoy va PRIMERA (idx 0, ABIERTA — LOTE SACAR-CARTA-VELADA)', tiles[0].kind === 'oculta' && tiles[0].post.id === 519 && tiles[0].openHoy === true, JSON.stringify(tileIds));
  t('B1-feed: ningún tile es borrador (558 fuera del feed)', !tileIds.includes(558));
  t('B1-feed: ningún tile es programado de otro día (521 fuera, vive en Semana)', !tileIds.includes(521));
  t('B1-feed: el programado de hoy que NO es la carta SÍ rinde (520, en publicación)', tileIds.includes(520));
  t('B1-feed: el publicado SÍ rinde (551)', tileIds.includes(551));

  // ----- B2: álbum con días + línea de la figurita -----
  const dRit = {
    hoy: TODAY, racha: 3, dorada: false, elegida: 0,
    recomendada: { id: 201, imagen: '/media/a.jpg', caption: 'Café de la casa, hecho con amor', caption_corta: 'Café de la casa', tipo: 'imagen', media_type: 'image', recomendada: true, rubro: 'café', hora_salida: '17:00' },
    cartas: [{ id: 201, imagen: '/media/a.jpg', caption: 'Café de la casa, hecho con amor', caption_corta: 'Café de la casa', tipo: 'imagen', media_type: 'image', recomendada: true, rubro: 'café' }],
    album: { slots: [
      { dia: shiftDays(TODAY, -4), etiqueta: 'lun', imagen: '/media/lun.jpg', dorada: false, hoy: false, jugado: true },
      { dia: shiftDays(TODAY, -3), etiqueta: 'mar', imagen: null, dorada: false, hoy: false, jugado: false },
      { dia: shiftDays(TODAY, -2), etiqueta: 'mié', imagen: '/media/mie.jpg', dorada: false, hoy: false, jugado: true },
      { dia: shiftDays(TODAY, -1), etiqueta: 'jue', imagen: '/media/jue.jpg', dorada: false, hoy: false, jugado: true },
      { dia: TODAY, etiqueta: 'vie', imagen: null, dorada: false, hoy: true, jugado: false },
      { dia: shiftDays(TODAY, 1), etiqueta: 'sáb', imagen: null, dorada: false, hoy: false, jugado: false },
      { dia: shiftDays(TODAY, 2), etiqueta: 'dom', imagen: null, dorada: false, hoy: false, jugado: false },
    ] },
  };
  const htmlV = String(pzRitualHTML(dRit, false));
  // (LOTE POST-OCULTO-RESPIRA · 6/11 · mock v2c) El día de hoy es su día
  // de semana («Vie»), no «Hoy»: el álbum muestra el DÍA sobre cada
  // casilla (Lun…Dom en dorado) y hoy se marca con el borde azul.
  t('B2-album: cada casilla lleva su día (Lun Mar Mié Jue Vie Sáb Dom)', ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].every((d) => htmlV.includes('>' + d + '<') || htmlV.includes('>' + d + '</span>')));
  t('B2-album: candado SOLO en el día pasado sin salir (1 solo 🔒)', (htmlV.match(/🔒/g) || []).length === 1);
  t('B2-album: la línea de la figurita', htmlV.includes('Cada día que sale, se desbloquea su figurita.'));
  t('B2-paquete: 1 carta adentro, sin abanico', htmlV.includes('1 carta adentro') && htmlV.includes('data-pz-ritual-rec="201"') && !htmlV.includes('id="pzRitualCartas"'));
  const htmlR = String(pzRitualHTML(dRit, false, 201));
  t('B2-revelada: foto + [Sale así] + [Editar texto] + [Cambiar algo]',
    htmlR.includes('/media/a.jpg') && htmlR.includes('data-pz-ritual-ok="201"')
    && htmlR.includes('data-pc-act="edit-cap"') && htmlR.includes('data-full="Café de la casa, hecho con amor"')
    && htmlR.includes('data-pz-ritual-cambio="201"'));

  // ----- B3/B4/B5: revelar / pedir cambio / confirmar -----
  sandbox.localStorage.clear();
  let errRev = null;
  try { pzRitualRevelar('201'); } catch (e) { errRev = e; }
  t('B3-revelar: un toque revela (guarda selección, sin POST)', errRev === null && pzRitualSelLeer() === 201 && !fetchCalls.some((c) => String(c.url).includes('/api/ritual/elegir')));
  sandbox.pzHablarClick = (id) => { hablarCalls.push(id); };
  let errCam = null;
  try { pzRitualPedirCambio('201'); } catch (e) { errCam = e; }
  t('B4-cambio: deja el pedido de otra versión para el chat', errCam === null && sandbox.HF_ASK_TEXT_PENDING === 'haceme otra versión de este posteo');
  t('B4-cambio: abre el chat CON ese posteo (nunca vacío)', hablarCalls.length === 1 && hablarCalls[0] === '201');
  fetchCalls.length = 0;
  let errOk = null;
  try { await pzRitualConfirmar('201'); } catch (e) { errOk = e; }
  t('B5-confirmar: POSTea /api/ritual/elegir con el posteo', errOk === null && fetchCalls.some((c) => String(c.url).includes('/api/ritual/elegir') && String(c.opts.body || '').includes('201')));
  t('B5-confirmar: toast «Listo, sale hoy a las 17:00»', toastCalls.some((m) => String(m).includes('Listo, sale hoy a las 17:00')), JSON.stringify(toastCalls));
  t('B5-confirmar: vuelve al feed (#/app/inicio) sin pantalla intermedia', bbGoCalls.some((h) => h === '#/app/inicio'), JSON.stringify(bbGoCalls));

  // ----- C: estáticas (deep link, crons, exports, sin código muerto) -----
  t('C1-deep-link: la push matutina lleva url /#/app/ritual', MPP.includes("url: '/#/app/ritual'") && MPP.includes('Tu posteo de hoy ya está 👇'));
  t('C1-deep-link: el transporte pasa la url (webpush data.url + APNs url)', PUSH.includes('data: { url: msg.url') && PUSH.includes('url: msg.url'));
  t('C1-deep-link: el service worker abre la url de la notificación', SW.includes('ndata.url') && SW.includes('openPushUrl(url)'));
  t('C1-deep-link: el router abre el ritual directo (tab ritual → ritualView)', SRC.includes("else if (tab === 'ritual')") && SRC.includes('content = await ritualView()'));
  t('C2-crons: el domingo 7:00 solo gradúa nivel 2 (trustLevel2Sweep)', SCH.includes("cron.schedule('0 7 * * 0'") && SCH.includes('srv.trustLevel2Sweep()'));
  t('C2-crons: NO hay cron de tanda (ni nextWeekSweep ni backfill ni retry programados)',
    !/cron\.schedule\([^)]*nextWeekSweep/.test(SCH) && !/cron\.schedule\([^)]*backfillThisWeek/.test(SCH) && !/cron\.schedule\([^)]*retrySweepFailures/.test(SCH));
  t('C2-crons: el cron de la push matutina asegura el posteo antes de avisar', SCH.includes('sendMorningPostPush(db, { ensureTodayPost: ensureFn })'));
  t('C3-exports: ensureTodayPost + trustLevel2Sweep exportados por server.js', SRV.includes('ensureTodayPost, trustLevel2Sweep'));
  t('C4-muerto: sin generador de 3 opciones (ni definición ni llamada)', !SRV.includes('function ritualResolverAlternas') && !SRV.includes('function ritualIdeasSinteticas') && !SRV.includes('reutilizarBorradores(db') && !SRC.includes('pzRitualOpcionHTML'));
  t('C4-muerto: /api/week/ensure ya NO llama a generateWeekDrafts', (() => {
    const i = SRV.indexOf("app.post('/api/week/ensure'");
    const j = SRV.indexOf('app.get', i + 10);
    return i >= 0 && !SRV.slice(i, j).includes('generateWeekDrafts(');
  })());

  // ===== A: servidor real =====
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: 'boot-test-token-ritual-1opcion',
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
    t('A-boot: el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }

    // Siembra: user 12 con programado hoy (518) + mañana (519) y fila
    // pz_ritual; user 13 vacío (fail-closed + no_dna); user 14 con UN
    // borrador creado hoy (sin programado: ensure lo programa).
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
    // Usuarios con plan activo (patrón test-morning-post-push.js): sin
    // plan_status='trial' + trial_ends_at, requireTrialValid devuelve
    // trial_expired y ensureTodayPost no_plan.
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (12, 'ritual-1opcion-12@test.invalid', 'x', 'posty', 'active', 17)`).run();
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (13, 'ritual-1opcion-13@test.invalid', 'x', 'posty', 'active', 17)`).run();
    db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (14, 'ritual-1opcion-14@test.invalid', 'x', 'posty', 'active', 17)`).run();
    for (const uid of [12, 13, 14]) db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`).run(uid);
    const insPost = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, created_at) VALUES (?, ?, ?, ?, '', ?, ?, ?, 'image', ?)`);
    insPost.run(518, 12, '/media/518.jpg', 'Café de la casa, hecho con amor', at2200Z(TODAY), 'scheduled', 'social', TODAY_10UTC);
    insPost.run(519, 12, '/media/519.jpg', 'Detrás del mostrador', at2200Z(shiftDays(TODAY, 1)), 'scheduled', 'detras', TODAY_10UTC);
    // Borrador de hoy (user 14): creado hoy 05:00 EST, con imagen, sin rechazar.
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, status, tipo, media_type, created_at) VALUES (601, 14, '/media/601.jpg', 'Borrador de hoy', '', 'draft', 'social', 'image', ?)`).run(TODAY_10UTC);
    db.prepare(`INSERT INTO pz_ritual (user_id, day_key, recommended_post_id, alt_post_ids, picked_post_id, gold) VALUES (12, ?, 518, '[519]', NULL, 0)`).run(TODAY);
    for (const uid of [12, 13, 14]) db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('ritual-1opcion-' + uid, sessJson(uid), exp);

    // A2: programado hoy → 1 carta, la recomendada, con hora de salida.
    const hoy12 = await api('ritual-1opcion-12', 'GET', '/api/ritual/hoy');
    t('A2-hoy: programado hoy → 200 + ok', hoy12.status === 200 && hoy12.json && hoy12.json.ok === true, 'status=' + hoy12.status);
    t('A2-hoy: UNA sola carta (la recomendada 518)', Array.isArray(hoy12.json.cartas) && hoy12.json.cartas.length === 1 && hoy12.json.cartas[0].id === 518, JSON.stringify((hoy12.json.cartas || []).map((c) => c.id)));
    t('A2-hoy: la carta trae la hora de salida (17:00)', hoy12.json.recomendada && hoy12.json.recomendada.hora_salida === '17:00', JSON.stringify(hoy12.json.recomendada && hoy12.json.recomendada.hora_salida));

    // A3: elegir la recomendada → ok + hora_salida + álbum.
    const el12 = await api('ritual-1opcion-12', 'POST', '/api/ritual/elegir', { post_id: 518 });
    t('A3-elegir: confirma (ok + elegida 518)', el12.status === 200 && el12.json && el12.json.ok === true && el12.json.elegida === 518, 'status=' + el12.status + ' ' + JSON.stringify(el12.json));
    t('A3-elegir: la respuesta trae la hora de salida para el toast', el12.json && el12.json.hora_salida === '17:00', JSON.stringify(el12.json && el12.json.hora_salida));
    t('A3-elegir: la respuesta trae el álbum', el12.json && Array.isArray(el12.json.album && el12.json.album.slots) && el12.json.album.slots.length === 7);

    // A7: /api/week/ensure con programado hoy → no genera, count 1.
    const we12 = await api('ritual-1opcion-12', 'POST', '/api/week/ensure', {});
    t('A7-week-ensure: con programado hoy no genera (count 1, complete)', we12.json && we12.json.generating === false && we12.json.count === 1 && we12.json.complete === true, JSON.stringify(we12.json));

    // A4: borrador de hoy (user 14) → ensure lo programa a las 17:00.
    const hoy14 = await api('ritual-1opcion-14', 'GET', '/api/ritual/hoy');
    t('A4-borrador: el borrador de hoy es la recomendada (601)', hoy14.json && hoy14.json.recomendada && hoy14.json.recomendada.id === 601, JSON.stringify(hoy14.json && hoy14.json.recomendada));
    const p601 = db.prepare('SELECT status, scheduled_at FROM posts WHERE id = 601').get();
    t('A4-borrador: el borrador quedó programado hoy a las 17:00 (fuente borrador, no generado)', p601 && p601.status === 'scheduled' && p601.scheduled_at === at2200Z(TODAY), JSON.stringify(p601));

    // A5: idempotencia — segunda llamada no duplica el posteo de hoy.
    const hoy14b = await api('ritual-1opcion-14', 'GET', '/api/ritual/hoy');
    const schedHoy14 = db.prepare(`SELECT id, scheduled_at FROM posts WHERE user_id = 14 AND status = 'scheduled'`).all();
    const nHoy14 = schedHoy14.filter((p) => dayKeyInTz(new Date(p.scheduled_at), TZ) === TODAY).length;
    t('A5-idempotencia: segunda llamada trae LA MISMA recomendada (601)', hoy14b.json && hoy14b.json.recomendada && hoy14b.json.recomendada.id === 601);
    t('A5-idempotencia: hay UN solo posteo programado para hoy (nunca dos)', nHoy14 === 1, 'n=' + nHoy14 + ' ' + JSON.stringify(schedHoy14));

    // A6: fail-closed (user 13, sin nada) → hoy:null, nada inventado.
    const hoy13 = await api('ritual-1opcion-13', 'GET', '/api/ritual/hoy');
    t('A6-fail-closed: sin posteo ni borrador → hoy null (vacío honesto)', hoy13.json && hoy13.json.hoy === null, JSON.stringify(hoy13.json));
    const n13 = db.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = 13').get().n;
    t('A6-fail-closed: NO se inventó ningún posteo (0 posteos)', n13 === 0, 'n=' + n13);

    // A8: /api/week/ensure sin ADN → no_dna (no genera a ciegas).
    const we13 = await api('ritual-1opcion-13', 'POST', '/api/week/ensure', {});
    t('A8-week-ensure: sin ADN no genera (reason no_dna)', we13.json && we13.json.reason === 'no_dna', JSON.stringify(we13.json));

    db.close();
  } finally {
    kill();
  }

  console.log(`\nRITUAL-1-OPCION: ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
