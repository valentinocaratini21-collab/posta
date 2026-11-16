'use strict';
// =====================================================================
// SUITE · LOTE REIMPORTACIÓN DEL INVITADO
//
// El defecto (hallazgo de importación, probado el 2026-11-16): en una
// semana de prueba MARCADA (línea a mano), la sesión del invitado se
// abre por la salida «todavía armando» de guest/start (202 con sesión,
// LOTE RETORNO) y la importación NUNCA corre en esa sesión: las piezas
// que bamboo carga con la palanca (POST /api/admin/trial/pieza-mano)
// viven en el payload de trial_cache — la palanca crea la fila en el
// acto SOLO si la cuenta ya tiene posteos — y ninguna superficie de la
// app las muestra. Probado dos veces (invitado 111 @shakeshack:
// importó vacía al aterrizar, antes de la carga; invitado 112
// @chipotle: el día 1 se cargó a las 08:09, ANTES del aterrizaje de
// las 08:10, y aun así cerró con cero filas) y vivo en el invitado
// 110 (Patagonia: día 1 + carrusel del día 2 aprobados, en el payload,
// con cero filas — su app muestra la semana vacía).
//
// La corrección que esta suite pincha:
//   · guest-reimport.js (NUEVO): la puerta + la corrida. Entra SOLO la
//     semana de un invitado (is_guest=1) con marca de línea a mano
//     ACTIVA sobre su clave, payload con piezas con medio y CERO filas
//     en posts. Corre importTrialWeek con el límite de la prueba (3) y
//     el cierre de guest/start inyectado. Nunca tira.
//   · server.js: el gancho reimportInvitadoSiAplica con DOS gatillos —
//     (a) el aterrizaje por la puerta de regreso (GET /api/guest/return,
//     antes del redirect) y (b) la apertura de la app (GET /api/posts,
//     antes de la consulta: la misma respuesta ya trae las piezas).
//   · IDEMPOTENCIA por construcción: la puerta exige cero filas e
//     importTrialWeek aborta si la cuenta tiene posteos — la suite lo
//     demuestra con doble corrida (módulo) y doble gatillo (HTTP).
//   · SIN GASTO: ni el módulo ni el cierre llaman generación ni
//     re-enganchan el rescate (rearmar): pines estáticos A7/A8.
//
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules \
//        node test-lote-reimportacion-invitado.js [--no-boot]
// Control: PZ_ROOT=<árbol prístino v1133> node test-lote-reimportacion-invitado.js
//   (en el control: A/B del lote caen, en C levantan el boot, el 202
//   con sesión, la palanca y el 302 del regreso — y las piezas NO se
//   importan: las filas quedan en 0, que es el defecto).
// =====================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const SERVER = read('server.js');
const MODSRC = read('guest-reimport.js');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {}
let grm = null, lm = null;
try { grm = require(path.join(ROOT, 'guest-reimport')); } catch (e) {}
try { lm = require(path.join(ROOT, 'linea-mano')); } catch (e) {}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre) {
  if (cond) { pass++; console.log('  ok ·', nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ MAL ·', nombre); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }
const DIA = 24 * 3600 * 1000;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';

// ---------- A · Pines estáticos ----------
function seccionA() {
  seccion('A · pines estáticos del mecanismo');
  ok(!!MODSRC, 'A1 el módulo guest-reimport.js existe');
  ok(SERVER.includes("require('./guest-reimport')"), 'A2 server.js carga el módulo guest-reimport');
  ok(SERVER.includes('function reimportInvitadoSiAplica') && SERVER.includes('function cierreReimportInvitado'),
    'A3 server.js define el gancho y el cierre de la importación tardía');
  // Gatillo (a): dentro del handler del aterrizaje, antes del redirect.
  const iRet = SERVER.indexOf("app.get('/api/guest/return'");
  const iTrigA = SERVER.indexOf('reimportInvitadoSiAplica(Number(row.user_id))');
  const iResume = SERVER.indexOf("app.get('/api/guest/resume'");
  ok(iRet >= 0 && iTrigA > iRet && (iResume < 0 || iTrigA < iResume),
    'A4 el gatillo (a) vive en GET /api/guest/return (el aterrizaje de la puerta de regreso)');
  // Gatillo (b): al tope de GET /api/posts, antes de la consulta.
  const iPosts = SERVER.indexOf("app.get('/api/posts'");
  const iTrigB = SERVER.indexOf('reimportInvitadoSiAplica(req.session.userId)');
  const iQuery = SERVER.indexOf('FROM posts p', iPosts);
  ok(iPosts >= 0 && iTrigB > iPosts && iQuery > iTrigB,
    'A5 el gatillo (b) vive al tope de GET /api/posts, ANTES de la consulta de posteos');
  // El cierre espeja el de guest/start, pieza por pieza.
  const iCierre = SERVER.indexOf('function cierreReimportInvitado');
  const iGancho = SERVER.indexOf('function reimportInvitadoSiAplica');
  const cierre = (iCierre >= 0 && iGancho > iCierre) ? SERVER.slice(iCierre, iGancho) : '';
  ok(!!cierre, 'A6 el cierre se puede aislar del gancho');
  for (const pieza of ['applyTrialLang(', 'seedFromTrialDigest(', 'recordTrialImport(', 'trialLockRecordDeliveredFor(', 'streakFromTrialImport(', 'scheduleAllDrafts(']) {
    ok(cierre.includes(pieza), 'A7 el cierre corre ' + pieza.replace('(', '') + ' (el mismo cierre que guest/start)');
  }
  ok(!/rearmar/.test(cierre), 'A8 el cierre NO re-engancha la cadena de rescate/generación (sin gasto)');
  // El módulo: sin requires, sin llamadas de generación — solo decide
  // y corre la importación inyectada.
  ok(MODSRC && !MODSRC.includes('require('), 'A9 el módulo no requiere nada: la maquinaria se inyecta');
  ok(MODSRC && !/rearmarSemanaPruebaPorCacheKey\(/.test(MODSRC) && !/generarSemana|generateWeek|demo\.build/.test(MODSRC),
    'A10 el módulo no llama generación ni rescate');
  // El gancho inyecta la maquinaria real.
  const gancho = (iGancho >= 0) ? SERVER.slice(iGancho, iGancho + 700) : '';
  ok(gancho.includes('guestReimport.reimportSiAplica') && gancho.includes('importTrialWeek') && gancho.includes('lineaMano') && gancho.includes('alImportar: cierreReimportInvitado'),
    'A11 el gancho inyecta lineaMano + importTrialWeek + el cierre en el módulo');
}

// ---------- B · El módulo (la puerta, razón por razón) ----------
function nuevaDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL DEFAULT '',
    is_guest INTEGER NOT NULL DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER)`);
  db.exec(`CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT, created_at INTEGER, email TEXT DEFAULT '')`);
  if (lm && lm.ensureSchema) lm.ensureSchema(db);
  else db.exec(`CREATE TABLE IF NOT EXISTS trial_linea_mano (cache_key TEXT PRIMARY KEY, ig TEXT NOT NULL DEFAULT '', domain TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'activa', creada_at INTEGER NOT NULL DEFAULT 0, aviso_entrada_at INTEGER NOT NULL DEFAULT 0, aviso_dia2_at INTEGER NOT NULL DEFAULT 0, aviso_dia3_at INTEGER NOT NULL DEFAULT 0, cerrada_at INTEGER NOT NULL DEFAULT 0, motivo_cierre TEXT NOT NULL DEFAULT '')`);
  return db;
}

function stubImport(db, state) {
  // El contrato observable de importTrialWeek: lee el payload por
  // cacheKey, importa las piezas con medio (hasta el límite), aborta
  // con 0 si la cuenta ya tiene posteos.
  return function (userId, igRaw, expectedBusiness, opts) {
    state.calls.push({ userId, igRaw, opts });
    if (state.forceZero) return 0;
    const cacheKey = (opts && opts.cacheKey) || igRaw;
    const row = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get(cacheKey);
    if (!row || !row.payload) return 0;
    let out; try { out = JSON.parse(row.payload); } catch (e) { return 0; }
    const piezas = (Array.isArray(out.posts) ? out.posts : []).filter((p) => p && (p.image || p.video));
    if (!piezas.length) return 0;
    if (db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(userId).c) return 0;
    let n = 0;
    for (const p of piezas.slice(0, (opts && opts.limit) || 7)) { db.prepare('INSERT INTO posts (user_id) VALUES (?)').run(userId); n++; }
    return n;
  };
}

function sembrarMarca(db, cacheKey, userId) {
  db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, ?, '', ?, 'activa', ?)`)
    .run(cacheKey, cacheKey.startsWith('web:') ? '' : cacheKey, userId || 0, Date.now());
}
function sembrarPayload(db, cacheKey, posts) {
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
    .run(cacheKey, JSON.stringify({ engine: 25, business: 'Suite', category: 'otro', posts }), Date.now());
}
function sembrarGuest(db, ig, domain) {
  return Number(db.prepare(`INSERT INTO users (email, is_guest, guest_ig, guest_domain) VALUES (?, 1, ?, ?)`)
    .run('guest-' + (ig || domain) + '@guest.invalid', ig || '', domain || '').lastInsertRowid);
}

function seccionB() {
  seccion('B · el módulo guest-reimport (puerta, razones, doble corrida)');
  if (!grm || typeof grm.reimportSiAplica !== 'function') { ok(false, 'B0 el módulo guest-reimport exporta reimportSiAplica'); return; }
  ok(true, 'B0 el módulo guest-reimport exporta reimportSiAplica');
  const depsDe = (db, state) => ({
    lineaMano: lm,
    importTrialWeek: stubImport(db, state),
    alImportar: (...a) => state.cierres.push(a),
    evTrack: (...a) => state.eventos.push(a),
  });
  const mkState = () => ({ calls: [], cierres: [], eventos: [], forceZero: false });
  const CON_MEDIO = [{ type: 'image', image: PNG, caption: 'uno' }, { type: 'carousel', image: JPG, images: [JPG, PNG], caption: 'dos' }];
  const SIN_MEDIO = [{ armando: true }, { armando: true }];

  { // Sin dependencias no hay corrida (y no tira).
    const db = nuevaDb(); const st = mkState();
    eq(grm.reimportSiAplica(db, 1, null).reason, 'sin-deps', 'B1 sin deps → sin-deps');
    eq(grm.reimportSiAplica(db, 999, depsDe(db, st)).reason, 'sin-usuario', 'B2 usuario inexistente → sin-usuario');
    db.close();
  }
  { // Cuenta registrada: byte-idéntica, la importación ni se llama.
    const db = nuevaDb(); const st = mkState();
    const uid = Number(db.prepare(`INSERT INTO users (email, is_guest) VALUES ('cliente@suite.com', 0)`).run().lastInsertRowid);
    sembrarMarca(db, 'reg.suite', uid); sembrarPayload(db, 'reg.suite', CON_MEDIO);
    db.prepare(`UPDATE users SET guest_ig = 'reg.suite' WHERE id = ?`).run(uid);
    const r = grm.reimportSiAplica(db, uid, depsDe(db, st));
    eq(r.reason, 'no-invitado', 'B3 cuenta registrada → no-invitado');
    eq(st.calls.length, 0, 'B4 la importación no se llama para una cuenta registrada');
    db.close();
  }
  { // Ya importada: la puerta ni llama a la importación.
    const db = nuevaDb(); const st = mkState();
    const uid = sembrarGuest(db, 'ya.suite', '');
    sembrarMarca(db, 'ya.suite', uid); sembrarPayload(db, 'ya.suite', CON_MEDIO);
    db.prepare('INSERT INTO posts (user_id) VALUES (?)').run(uid);
    const r = grm.reimportSiAplica(db, uid, depsDe(db, st));
    eq(r.reason, 'ya-importada', 'B5 invitado con filas → ya-importada');
    eq(st.calls.length, 0, 'B6 la importación no se llama si ya hay filas');
    db.close();
  }
  { // Sin marca: la semana del software no es de este lote.
    const db = nuevaDb(); const st = mkState();
    const uid = sembrarGuest(db, 'soft.suite', '');
    sembrarPayload(db, 'soft.suite', CON_MEDIO);
    const r = grm.reimportSiAplica(db, uid, depsDe(db, st));
    eq(r.reason, 'sin-marca', 'B7 invitado sin marca → sin-marca');
    eq(st.calls.length, 0, 'B8 sin marca, la importación no se llama');
    db.close();
  }
  { // La marca es de otro invitado.
    const db = nuevaDb(); const st = mkState();
    const uid = sembrarGuest(db, 'otro.suite', '');
    sembrarMarca(db, 'otro.suite', uid + 100); sembrarPayload(db, 'otro.suite', CON_MEDIO);
    eq(grm.reimportSiAplica(db, uid, depsDe(db, st)).reason, 'marca-de-otro', 'B9 marca atada a otro invitado → marca-de-otro');
    db.close();
  }
  { // Marca sí, piezas todavía no.
    const db = nuevaDb(); const st = mkState();
    const uid = sembrarGuest(db, 'armando.suite', '');
    sembrarMarca(db, 'armando.suite', 0); sembrarPayload(db, 'armando.suite', SIN_MEDIO);
    eq(grm.reimportSiAplica(db, uid, depsDe(db, st)).reason, 'sin-piezas', 'B10 marca sin piezas con medio → sin-piezas');
    db.close();
  }
  { // La importación decide cero (sus guardas mandan): nada se cierra.
    const db = nuevaDb(); const st = mkState(); st.forceZero = true;
    const uid = sembrarGuest(db, 'cero.suite', '');
    sembrarMarca(db, 'cero.suite', uid); sembrarPayload(db, 'cero.suite', CON_MEDIO);
    const r = grm.reimportSiAplica(db, uid, depsDe(db, st));
    eq(r.reason, 'import-en-cero', 'B11 importTrialWeek en 0 → import-en-cero');
    eq(st.cierres.length, 0, 'B12 con importación en 0 no corre el cierre');
    db.close();
  }
  { // LA CORRIDA + LA DOBLE CORRIDA (idempotencia demostrada).
    const db = nuevaDb(); const st = mkState();
    const uid = sembrarGuest(db, 'doble.suite', '');
    sembrarMarca(db, 'doble.suite', uid); sembrarPayload(db, 'doble.suite', CON_MEDIO);
    const r1 = grm.reimportSiAplica(db, uid, depsDe(db, st));
    ok(r1.applied === true && r1.imported === 2 && r1.cacheKey === 'doble.suite', 'B13 la corrida importa las 2 piezas del payload');
    eq(st.cierres.length, 1, 'B14 el cierre corre una vez');
    ok(st.cierres.length && st.cierres[0][0] === uid && st.cierres[0][3] === 2, 'B15 el cierre recibe (uid, ig, cacheKey, importados)');
    ok(st.eventos.some((e) => e[1] === 'trial_reimport'), 'B16 el evento trial_reimport queda registrado');
    const r2 = grm.reimportSiAplica(db, uid, depsDe(db, st));
    ok(r2.applied === false && r2.reason === 'ya-importada', 'B17 la SEGUNDA corrida no aplica (ya-importada)');
    eq(st.calls.length, 1, 'B18 la importación corrió UNA sola vez entre las dos corridas');
    eq(db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(uid).c, 2, 'B19 las filas son 2 tras la doble corrida (sin duplicados)');
    db.close();
  }
  { // Solo-web: la clave web:<dominio> también es puerta.
    const db = nuevaDb(); const st = mkState();
    const uid = sembrarGuest(db, '', 'suite-web.com');
    sembrarMarca(db, 'web:suite-web.com', uid); sembrarPayload(db, 'web:suite-web.com', CON_MEDIO);
    const r = grm.reimportSiAplica(db, uid, depsDe(db, st));
    ok(r.applied === true && r.cacheKey === 'web:suite-web.com', 'B20 el invitado solo-web importa por su clave web:<dominio>');
    db.close();
  }
  eq(grm.piezasConMedio({ posts: CON_MEDIO.concat(SIN_MEDIO) }), 2, 'B21 piezasConMedio cuenta solo las piezas con medio (el filtro de la importación)');
}

// ---------- C · Boot real: los dos gatillos por HTTP ----------
async function seccionC() {
  seccion('C · boot aislado + los dos gatillos por HTTP (claves inventadas)');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'C0 node:sqlite disponible para sembrar'); return; }
  const port = 19700 + Math.floor(Math.random() * 250);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-reimp-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-reimp-media-'));
  const childEnv = { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN_TOK, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' };
  // Sin claves de IA en el hijo: el re-enganche del 202 (guest/start)
  // falla rápido contra la nada y el bote del demo no se toca — la
  // importación de esta suite es 100% base de datos.
  for (const k of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'FAL_API_KEY', 'REPLICATE_API_TOKEN']) delete childEnv[k];
  const child = spawn('node', ['server.js'], { cwd: ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = 'http://127.0.0.1:' + port;
  let vivo = false;
  try {
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch(base + '/api/version').catch(() => null);
      if (resp && resp.status === 200) vivo = true;
    }
    ok(vivo, 'C1 el servidor del lote levanta y responde /api/version');
    if (!vivo) return;
    const dbPath = path.join(dataDir, 'posta.db');
    let db = null;
    for (let i = 0; i < 20 && !db; i++) {
      try { db = new DatabaseSync(dbPath); db.exec('PRAGMA busy_timeout = 5000'); } catch (e) { await new Promise((r) => setTimeout(r, 300)); }
    }
    ok(!!db, 'C2 la base del boot se puede abrir para sembrar');
    if (!db) return;
    const ahora = Date.now();
    const cookieDe = (r) => {
      const sc2 = (typeof r.headers.getSetCookie === 'function') ? r.headers.getSetCookie() : [];
      return sc2.map((c) => c.split(';')[0]).filter((c) => c.includes('=')).join('; ');
    };
    const filasDe = (uid) => db.prepare('SELECT * FROM posts WHERE user_id = ? ORDER BY id ASC').all(uid);
    const marcaSql = (cacheKey, uid) => db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, ?, '', ?, 'activa', ?)`)
      .run(cacheKey, cacheKey, uid || 0, ahora);
    const piezaMano = async (body) => {
      const r = await fetch(base + '/api/admin/trial/pieza-mano?token=' + ADMIN_TOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };
    const linkDeVuelta = async (ig, uid) => {
      const rr = await fetch(base + '/api/guest/return-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig, lang: 'en' }) });
      const caso = db.prepare(`SELECT * FROM support_cases WHERE user_id = ? AND tipo = 'prueba_retorno_dm' ORDER BY id DESC`).get(uid);
      const m = caso && String(caso.detalle || '').match(/\/api\/guest\/return\?token=([a-f0-9]{32,})/);
      return { status: rr.status, token: m ? m[1] : null };
    };

    // ===== Flujo 1 · GATILLO (b): la forma de Patagonia =====
    // Semana en armado → guest/start 202 CON sesión → la marca →
    // pieza-mano día 1 (foto) y día 2 (carrusel) → la apertura de la
    // app (GET /api/posts) importa. Antes del lote: 0 filas para
    // siempre; la semana del invitado, vacía.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run('reimp.suite', JSON.stringify({ engine: 25, business: 'Reimp Suite', category: 'otro', posts: [{ armando: true, headline: 'Día 1' }, { armando: true, headline: 'Día 2' }, { armando: true, headline: 'Día 3' }] }), ahora);
    const gs = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'reimp.suite', lang: 'en', device: 'suite-reimp-1' }), signal: AbortSignal.timeout(90000) }).catch(() => null);
    const gsJ = gs ? await gs.json().catch(() => ({})) : {};
    eq(gs && gs.status, 202, 'C3 guest/start con la semana en armado responde 202 [' + (gs && gs.status) + ']');
    ok(gsJ.week_pending === true && gsJ.session === true, 'C4 el 202 declara week_pending CON sesión (la salida del defecto)');
    const ckB = gs ? cookieDe(gs) : '';
    const guestB = db.prepare('SELECT id FROM users WHERE guest_ig = ?').get('reimp.suite');
    const uidB = guestB ? Number(guestB.id) : 0;
    ok(!!uidB, 'C5 el invitado del flujo (b) existe');
    eq(filasDe(uidB).length, 0, 'C6 tras la entrada, el invitado tiene 0 filas (su semana vive solo en el payload)');
    marcaSql('reimp.suite', uidB);
    const pm1 = await piezaMano({ ig: 'reimp.suite', dia: 1, media: PNG, caption: 'Caption día uno', hashtags: '#uno #prueba' });
    ok(pm1.status === 200 && pm1.json.ok === true && !pm1.json.post_id, 'C7 pieza-mano día 1 (foto) carga en el payload, sin fila (post_id null)');
    const pm2 = await piezaMano({ ig: 'reimp.suite', dia: 2, medias: [JPG, PNG, JPG], caption: 'Caption día dos', hashtags: '#dos' });
    ok(pm2.status === 200 && pm2.json.ok === true && pm2.json.placas === 3 && !pm2.json.post_id, 'C8 pieza-mano día 2 (carrusel ×3) carga en el payload, sin fila');
    eq(filasDe(uidB).length, 0, 'C9 con las dos piezas cargadas a mano, SIGUE en 0 filas (el hueco, antes del gatillo)');
    const ap1 = await fetch(base + '/api/posts', { headers: { Cookie: ckB } }).catch(() => null);
    eq(ap1 && ap1.status, 200, 'C10 la apertura de la app (GET /api/posts) responde 200');
    const filasB = filasDe(uidB);
    eq(filasB.length, 2, 'C11 el gatillo (b) importó las 2 piezas cargadas a mano');
    if (filasB.length === 2) {
      eq(filasB[0].media_type, 'image', 'C12 la primera fila es la foto del día 1 (orden del payload)');
      eq(filasB[0].caption, 'Caption día uno', 'C13 el caption del día 1 llega exacto');
      eq(filasB[0].hashtags, '#uno #prueba', 'C14 los hashtags del día 1 llegan exactos');
      eq(filasB[1].media_type, 'carousel', 'C15 la segunda fila es el CARRUSEL del día 2 (no una foto aplastada)');
      let album = []; try { album = JSON.parse(filasB[1].carousel_paths || '[]'); } catch (e) {}
      eq(album.length, 3, 'C16 el carrusel trae sus 3 placas en carousel_paths');
      ok(album.every((p) => String(p).startsWith('/media/')), 'C17 las placas del carrusel son archivos /media reales');
      eq(filasB[1].caption, 'Caption día dos', 'C18 el caption del carrusel llega exacto');
      eq(filasB[0].source, 'trial', 'C19 las filas nacen de la importación de la prueba (source=trial)');
    } else { for (const n of ['C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19']) ok(false, n + ' (sin las 2 filas del gatillo b)'); }
    const ev = db.prepare(`SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND name = 'trial_reimport'`).get(uidB);
    ok(!!ev && ev.c === 1, 'C20 el evento trial_reimport quedó registrado una vez');
    // LA DOBLE CORRIDA por HTTP: otra apertura, las mismas filas.
    const idsB = filasB.map((f) => f.id).join(',');
    const ap2 = await fetch(base + '/api/posts', { headers: { Cookie: ckB } }).catch(() => null);
    eq(ap2 && ap2.status, 200, 'C21 la segunda apertura responde 200');
    const filasB2 = filasDe(uidB);
    ok(filasB2.length === 2 && filasB2.map((f) => f.id).join(',') === idsB, 'C22 DOBLE CORRIDA: la segunda apertura no duplica ni reescribe filas (mismos ids)');

    // ===== Flujo 2 · GATILLO (a): el aterrizaje por la puerta de regreso =====
    // Las piezas YA están en el payload (cargadas antes, como chipotle)
    // y el invitado vuelve por su link: el aterrizaje importa ANTES de
    // cualquier lectura de posteos.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run('vuelve.suite', JSON.stringify({ engine: 25, business: 'Vuelve Suite', category: 'otro', posts: [
        { type: 'image', image: PNG, caption: 'Volver uno', hashtags: '#v1', armando: false },
        { type: 'carousel', image: JPG, images: [JPG, PNG], caption: 'Volver dos', hashtags: '#v2', armando: false },
        { armando: true },
      ] }), ahora);
    const uidV = Number(db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, lang, trial_ends_at) VALUES ('guest-v@guest.invalid', '', 1, 'vuelve.suite', 'en', ?)`)
      .run(ahora + 2 * DIA).lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uidV, 'Vuelve Suite', 'vuelve.suite');
    marcaSql('vuelve.suite', uidV);
    eq(filasDe(uidV).length, 0, 'C23 el invitado que vuelve tiene 0 filas antes del aterrizaje');
    const lv = await linkDeVuelta('vuelve.suite', uidV);
    ok(lv.status === 200 && !!lv.token, 'C24 la puerta de regreso emite su link (caso de la línea a mano)');
    let ckV = '';
    if (lv.token) {
      const land = await fetch(base + '/api/guest/return?token=' + lv.token, { redirect: 'manual' });
      eq(land.status, 302, 'C25 el aterrizaje responde 302');
      eq(land.headers.get('location'), '/#/app/inicio', 'C26 el aterrizaje va a su semana (la app), no al login');
      ckV = cookieDe(land);
      const filasV = filasDe(uidV);
      eq(filasV.length, 2, 'C27 el gatillo (a) importó EN EL ATERRIZAJE (antes de cualquier GET /api/posts)');
      if (filasV.length === 2) {
        ok(filasV[0].media_type === 'image' && filasV[1].media_type === 'carousel', 'C28 el aterrizaje preserva orden y tipos (foto, carrusel)');
        let albumV = []; try { albumV = JSON.parse(filasV[1].carousel_paths || '[]'); } catch (e) {}
        eq(albumV.length, 2, 'C29 el carrusel del aterrizaje trae sus 2 placas');
        eq(filasV[1].caption, 'Volver dos', 'C30 el caption del carrusel llega exacto en el aterrizaje');
      } else { ok(false, 'C28 (sin las 2 filas del gatillo a)'); ok(false, 'C29 (sin las 2 filas del gatillo a)'); ok(false, 'C30 (sin las 2 filas del gatillo a)'); }
      // LOS DOS GATILLOS sobre la misma semana: sin duplicados.
      const idsV = filasV.map((f) => f.id).join(',');
      const apV = await fetch(base + '/api/posts', { headers: { Cookie: ckV } }).catch(() => null);
      eq(apV && apV.status, 200, 'C31 la apertura tras el aterrizaje responde 200');
      const filasV2 = filasDe(uidV);
      ok(filasV2.length === 2 && filasV2.map((f) => f.id).join(',') === idsV, 'C32 DOBLE GATILLO (a)+(b): las filas son las mismas 2 (idempotencia entre gatillos)');
    } else { for (const n of ['C25', 'C26', 'C27', 'C28', 'C29', 'C30', 'C31', 'C32']) ok(false, n + ' (sin link de regreso)'); }

    // ===== Flujo 3 · LAS GUARDAS =====
    // (i) Invitado SIN marca: ni el aterrizaje ni la apertura importan.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run('sinmarca.suite', JSON.stringify({ engine: 25, business: 'Sin Marca', category: 'otro', posts: [{ type: 'image', image: PNG, caption: 'No importa', armando: false }] }), ahora);
    const uidS = Number(db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, lang, trial_ends_at) VALUES ('guest-s@guest.invalid', '', 1, 'sinmarca.suite', 'en', ?)`)
      .run(ahora + 2 * DIA).lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uidS, 'Sin Marca', 'sinmarca.suite');
    const ls = await linkDeVuelta('sinmarca.suite', uidS);
    ok(!!ls.token, 'C33 la puerta de regreso también emite para el invitado sin marca');
    if (ls.token) {
      const landS = await fetch(base + '/api/guest/return?token=' + ls.token, { redirect: 'manual' });
      eq(landS.status, 302, 'C34 su aterrizaje es el de siempre (302 a la app)');
      const ckS = cookieDe(landS);
      await fetch(base + '/api/posts', { headers: { Cookie: ckS } }).catch(() => null);
      eq(filasDe(uidS).length, 0, 'C35 GUARDA: sin marca, ningún gatillo importa (la semana del software queda intacta)');
    } else { ok(false, 'C34 (sin link)'); ok(false, 'C35 (sin link)'); }
    // (ii) Invitado CON marca pero YA importado: su fila no se toca.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run('yaimp.suite', JSON.stringify({ engine: 25, business: 'Ya Importada', category: 'otro', posts: [
        { type: 'image', image: PNG, caption: 'Pieza payload 1', armando: false },
        { type: 'image', image: JPG, caption: 'Pieza payload 2', armando: false },
      ] }), ahora);
    const uidY = Number(db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, lang, trial_ends_at) VALUES ('guest-y@guest.invalid', '', 1, 'yaimp.suite', 'en', ?)`)
      .run(ahora + 2 * DIA).lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uidY, 'Ya Importada', 'yaimp.suite');
    marcaSql('yaimp.suite', uidY);
    db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, needs_review, source) VALUES (?, '/media/pre-existente.jpg', 'Original intacto', '#orig', 'draft', 'image', 0, 'trial')`).run(uidY);
    const ly = await linkDeVuelta('yaimp.suite', uidY);
    ok(!!ly.token, 'C36 la puerta emite para el invitado ya importado');
    if (ly.token) {
      const landY = await fetch(base + '/api/guest/return?token=' + ly.token, { redirect: 'manual' });
      const ckY = cookieDe(landY);
      await fetch(base + '/api/posts', { headers: { Cookie: ckY } }).catch(() => null);
      const filasY = filasDe(uidY);
      ok(filasY.length === 1 && filasY[0].caption === 'Original intacto' && filasY[0].image_path === '/media/pre-existente.jpg',
        'C37 GUARDA: la semana ya importada no se toca (1 fila, su caption y su imagen intactos)');
    } else { ok(false, 'C37 (sin link)'); }
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionA();
  seccionB();
  await seccionC();
  console.log(`\n== REIMPORTACIÓN DEL INVITADO: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
