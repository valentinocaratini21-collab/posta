'use strict';
// =====================================================================
// SUITE · LOTE RETORNO DEL INVITADO
//
// Los defectos (recorrido real con Top Team, 2026-11-16, perfil
// limpio): el invitado que vuelve en un navegador fresco re-escribe su
// @ y cae en el login pelado — aunque su semana exista. Dos ramas de
// guest/start divergían: la semana COMPLETA abre sesión al importar (y
// su re-entrada sin sesión frena antes, en la puerta de prueba usada),
// pero la semana EN ARMADO respondía 202 SIN abrir la sesión, y la
// página de la prueba lee el 202 como éxito (res.ok cubre 200–299) y
// navega a la app → sin sesión, #/login. Además: no existía ninguna
// puerta de regreso (solo el link del email, si había email público),
// las fotos de la pantalla de armado podían salir rotas (la
// localización guardaba como .jpg cualquier cuerpo ≥200 B, incluso la
// página de error de la CDN), y el título del login quedaba en español
// llegando desde /en/prueba.
//
// La corrección que esta suite pincha:
//   · server.js: las salidas 202 de guest/start abren la sesión del
//     invitado (responder202Invitado) — en armado o sin medio, la app
//     muestra SU semana; nunca el login pelado.
//   · guest-return.js + server.js: la puerta «Volver a mi semana»
//     (POST /api/guest/return-request → GET /api/guest/return): token
//     de un solo uso (24 h, hash en DB), link SOLO por canales que
//     prueban (DM a su IG + email público cosechado); el email escrito
//     recibe el aviso sin link y se confirma como contacto al
//     consumirse el token. El DM sin conversación previa va a la línea
//     a mano (caso prueba_retorno_dm, visible en pendingConcierge).
//   · feed-audit.js: locOne valida la firma de imagen (JPEG/PNG/WebP/
//     GIF) al descargar y al reusar la caché — lo que no es imagen es
//     null y el bloque no se muestra.
//   · prueba/en-prueba: la puerta montada en ambas páginas + guardas
//     onerror en las imágenes de la pantalla de armado.
//   · app.js: la puerta bajo el login + el título de las vistas de
//     auth sigue al idioma de la entrada (pzAuthDocTitle/authLang).
//
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules \
//        node test-lote-retorno-invitado.js [--no-boot]
// Control: PZ_ROOT=<árbol prístino v1124> node test-lote-retorno-invitado.js
// =====================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const read = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
const SERVER = read('server.js');
const CASES = read('support-cases.js');
const FEED = read('feed-audit.js');
const EMAIL = read('email.js');
const APPJS = read('public/app.js');
const P_ES = read('public/prueba.html');
const P_EN = read('public/en-prueba.html');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {}
let gr = null, sc = null, fa = null;
try { gr = require(path.join(ROOT, 'guest-return')); } catch (e) {}
try { sc = require(path.join(ROOT, 'support-cases')); } catch (e) {}
try { fa = require(path.join(ROOT, 'feed-audit')); } catch (e) {}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre) {
  if (cond) { pass++; console.log('  ok ·', nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ MAL ·', nombre); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }
const DIA = 24 * 3600 * 1000;

// ---------- A · Pines estáticos ----------
function seccionA() {
  seccion('A · pines estáticos del mecanismo');
  // La puerta y el aterrizaje existen.
  ok(SERVER.includes("app.post('/api/guest/return-request'"), 'A1 server.js monta POST /api/guest/return-request');
  ok(SERVER.includes("app.get('/api/guest/return'"), 'A2 server.js monta GET /api/guest/return');
  ok(SERVER.includes("require('./guest-return')"), 'A3 server.js carga el módulo guest-return');
  // Pieza 1: las salidas 202 abren la sesión.
  ok(SERVER.includes('responder202Invitado'), 'A4 guest/start define responder202Invitado');
  eq((SERVER.match(/responder202Invitado\(\{/g) || []).length, 2, 'A5 las DOS salidas 202 (en armado / sin medio) pasan por responder202Invitado');
  ok(!SERVER.includes('return res.status(202).json({ ok: false, week_pending'), 'A6 ya no queda ninguna salida 202 pelada sin sesión en guest/start');
  ok(SERVER.includes("session: true"), 'A7 la respuesta 202 declara la sesión abierta');
  // La guarda de identidad está en el handler: el aviso al email
  // escrito va SIN link (returnNoticeEmail) y el link completo solo al
  // email público (returnLinkEmail) y al DM.
  ok(SERVER.includes('returnNoticeEmail(typedEmail, doorLang)'), 'A8 el email escrito recibe el AVISO (returnNoticeEmail), no el link');
  ok(SERVER.includes('returnLinkEmail(harvested, link, doorLang)'), 'A9 el link completo va al email público cosechado');
  ok(SERVER.includes("tipo: 'prueba_retorno_dm'"), 'A10 sin conversación previa, el DM abre el caso de la línea a mano');
  // support-cases: el tipo existe y la proyección del operador lo ve.
  ok(CASES.includes("prueba_retorno_dm: { label:"), 'A11 CASE_TYPES registra prueba_retorno_dm');
  ok(CASES.includes("'prueba_linea_mano', 'prueba_retorno_dm'"), 'A12 pendingConcierge suma los casos prueba_retorno_dm (visibles desde el acto)');
  // feed-audit: la firma de imagen manda en locOne.
  ok(FEED.includes('const esImagen = (buf)'), 'A13 feed-audit define la validación de firma de imagen');
  ok((FEED.match(/esImagen/g) || []).length >= 3, 'A14 locOne valida al descargar Y al reusar la caché');
  // email.js: los dos envíos de la puerta existen y se exportan.
  ok(EMAIL.includes('function returnLinkEmail(') && EMAIL.includes('function returnNoticeEmail('), 'A15 email.js trae returnLinkEmail + returnNoticeEmail');
  ok(EMAIL.includes('returnLinkEmail, returnNoticeEmail'), 'A16 email.js los exporta');
  // Las dos páginas de la prueba montan la puerta y las guardas.
  for (const [nombre, P] of [['prueba.html (ES)', P_ES], ['en-prueba.html (EN)', P_EN]]) {
    ok(P.includes('id="returnDoor"') && P.includes('/api/guest/return-request'), 'A17 ' + nombre + ' monta la puerta de regreso');
    ok(P.includes('id="rEmail"'), 'A18 ' + nombre + ' trae el campo de email opcional');
    ok(P.includes('wMirrorImg" alt="" onerror='), 'A19 ' + nombre + ': el espejo se oculta si su foto no carga');
    ok(P.includes('wHeroBlur" alt="" hidden onerror='), 'A20 ' + nombre + ': el héroe se oculta si su foto no carga');
    ok(P.includes("qs.get('return') === 'expired'"), 'A21 ' + nombre + ' explica el link vencido junto a la puerta');
  }
  // app.js: la puerta bajo el login + el título por idioma de entrada.
  ok(APPJS.includes('function pzGuestReturnHtml(') && APPJS.includes('function pzGuestReturnSend(') && APPJS.includes('function pzGuestReturnToggle('),
    'A22 app.js define la puerta del login y sus dos handlers (auditoría de funciones)');
  ok(APPJS.includes('${isLogin ? pzGuestReturnHtml(S) : \'\'}'), 'A23 la puerta se pinta bajo el login (solo login)');
  ok(APPJS.includes('function pzAuthDocTitle(') && APPJS.includes('pzAuthDocTitle();'), 'A24 el título de auth se ajusta al idioma de la entrada');
  ok(APPJS.includes("'Posty — Your community manager on autopilot'") && APPJS.includes("'Posty — Tu community manager 🤖'"),
    'A25 los dos títulos son las cadenas exactas de las cáscaras EN/ES');
  ok(APPJS.includes('retDoorSub') && APPJS.includes("'Back to my week'") && APPJS.includes("'Volver a mi semana'"),
    'A26 AUTH_STR trae la puerta en los dos idiomas');
}

// ---------- B · Módulos ----------
function nuevaDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_guest INTEGER NOT NULL DEFAULT 0, guest_ig TEXT DEFAULT '', guest_domain TEXT DEFAULT '',
    concierge INTEGER NOT NULL DEFAULT 0, plan TEXT DEFAULT '', plan_status TEXT DEFAULT '',
    trial_ends_at INTEGER DEFAULT 0, trial_extended_until INTEGER DEFAULT 0)`);
  db.exec(`CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, business_name TEXT DEFAULT '', ig_username TEXT DEFAULT '', category TEXT DEFAULT '')`);
  db.exec(`CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role TEXT, text TEXT DEFAULT '', body TEXT DEFAULT '', created_at TEXT)`);
  db.exec(`CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT, created_at INTEGER, email TEXT DEFAULT '')`);
  return db;
}

async function seccionB() {
  seccion('B · módulos (tokens, guarda de identidad, proyección, fotos)');
  if (!gr) { ok(false, 'B0 el módulo guest-return existe'); }
  else {
    const db = nuevaDb();
    const T0 = Date.UTC(2026, 10, 16, 8, 0, 0);
    const uid = Number(db.prepare(`INSERT INTO users (email, is_guest, guest_ig) VALUES ('guest-r@guest.invalid', 1, 'retorno.suite')`).run().lastInsertRowid);
    // Token: emisión + consumo de un solo uso.
    const em1 = gr.issueToken(db, { userId: uid, ig: 'retorno.suite', lang: 'en', typedEmail: 'dueno@retorno-suite.com', now: T0 });
    ok(typeof em1.token === 'string' && em1.token.length >= 32, 'B1 el token emitido es una cadena larga (32 B)');
    eq(em1.expiresAt - T0, DIA, 'B2 el token vive exactamente 24 h');
    const rowDb = db.prepare('SELECT token_hash FROM guest_return_tokens WHERE user_id = ?').get(uid);
    ok(rowDb && rowDb.token_hash !== em1.token && rowDb.token_hash === gr.hashToken(em1.token), 'B3 en la DB vive solo el HASH del token');
    const c1 = gr.consumeToken(db, em1.token, T0 + 60000);
    ok(!!c1 && Number(c1.user_id) === uid && c1.ig === 'retorno.suite', 'B4 el consumo devuelve la fila del invitado');
    eq(gr.consumeToken(db, em1.token, T0 + 120000), null, 'B5 el segundo consumo es null (un solo uso)');
    const em2 = gr.issueToken(db, { userId: uid, ig: 'retorno.suite', lang: 'en', now: T0 });
    eq(gr.consumeToken(db, em2.token, T0 + DIA + 1000), null, 'B6 el token vencido (>24 h) no consume');
    eq(gr.consumeToken(db, 'token-inventado', T0), null, 'B7 un token inventado no consume');
    eq(gr.recentCount(db, 'retorno.suite', T0 + 1000), 2, 'B8 el contador de la ventana cuenta las emisiones del @');
    eq(gr.recentCount(db, 'retorno.suite', T0 + 2 * DIA), 0, 'B9 fuera de la ventana de 1 h el contador es 0');
    // Email cosechado: el canal que prueba.
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at, email) VALUES (?, ?, ?, ?)').run('retorno.suite', '{}', T0, 'publico@retorno-suite.com');
    eq(gr.harvestedEmailFor(db, 'retorno.suite', ''), 'publico@retorno-suite.com', 'B10 el email público sale de trial_cache');
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at, email) VALUES (?, ?, ?, ?)').run('webdom.suite', '{}', T0, 'hola@webdom-suite.com');
    eq(gr.harvestedEmailFor(db, 'sinig.suite', 'webdom.suite'), '', 'B11 sin fila por @ ni invitado por dominio, la clave web: no se inventa');
    eq(gr.harvestedEmailFor(db, '', 'webdom-suite.com'), '', 'B12 el dominio sin normalizar no matchea (la normalización es del llamador)');
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at, email) VALUES (?, ?, ?, ?)').run('web:webdom-suite.com', '{}', T0, 'hola@webdom-suite.com');
    eq(gr.harvestedEmailFor(db, '', 'webdom-suite.com'), 'hola@webdom-suite.com', 'B13 la clave web:<dominio> cosecha el email del que entró solo con web');
    // El email escrito: contacto sin confirmar → confirmado solo por
    // el consumo del token que lo traía.
    ok(gr.saveTypedEmail(db, 'retorno.suite', 'dueno@retorno-suite.com', T0), 'B14 el email escrito se guarda como contacto');
    let ct = gr.contactFor(db, 'retorno.suite');
    ok(!!ct && ct.confirmed === 0, 'B15 nace SIN confirmar (escribirlo no prueba identidad)');
    eq(gr.confirmTypedEmail(db, 'retorno.suite', 'otro@retorno-suite.com', T0), false, 'B16 confirmar con otro email no confirma nada');
    eq(gr.confirmTypedEmail(db, 'retorno.suite', 'dueno@retorno-suite.com', T0), true, 'B17 el consumo del token confirma SU email escrito');
    gr.saveTypedEmail(db, 'retorno.suite', 'nuevo@retorno-suite.com', T0 + 1000);
    ct = gr.contactFor(db, 'retorno.suite');
    ok(!!ct && ct.email === 'dueno@retorno-suite.com' && ct.confirmed === 1, 'B18 un email escrito nuevo NO pisa el contacto confirmado');
    // El texto del DM trae el link y la salida de re-pedido.
    ok(gr.dmMessage('en', 'https://x/abc').includes('https://x/abc') && gr.dmMessage('es', 'https://x/abc').includes('24 h'), 'B19 el texto del DM trae link y vencimiento en los dos idiomas');
    try { db.close(); } catch (e) {}
  }
  // support-cases: el caso del DM es visible en la superficie del
  // operador desde el acto, con su número; y no rompe lo anterior.
  if (!sc) { ok(false, 'B20 support-cases carga'); }
  else {
    const db = nuevaDb();
    const uid = Number(db.prepare(`INSERT INTO users (email, is_guest, guest_ig) VALUES ('guest-r@guest.invalid', 1, 'retorno.suite')`).run().lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uid, 'Retorno Suite', 'retorno.suite');
    const r = sc.openCase(db, { userId: uid, tipo: 'prueba_retorno_dm', titulo: 'Mandar el link de regreso por DM a @retorno.suite', detalle: 'link', dedupKey: 'retorno-dm:' + uid + ':abcd1234' });
    ok(!!(r && r.ok && r.caso && r.caso.id), 'B20 el caso prueba_retorno_dm se abre');
    if (r && r.caso && r.caso.id) {
      const pend = sc.pendingConcierge(db);
      const ent = (pend.pendientes || []).find((p) => p.user_id === uid);
      ok(!!ent && ent.caso_id === r.caso.id && ent.ig_username === 'retorno.suite', 'B21 pendingConcierge lo muestra con su caso_id (la superficie del operador lo ve)');
      const r2 = sc.openCase(db, { userId: uid, tipo: 'prueba_retorno_dm', titulo: 'otro', dedupKey: 'retorno-dm:' + uid + ':abcd1234' });
      ok(!!(r2 && r2.duplicado), 'B22 el mismo pedido no abre dos casos (dedup)');
      db.prepare('UPDATE support_cases SET estado = ? WHERE id = ?').run('cerrado', r.caso.id);
      const pend2 = sc.pendingConcierge(db);
      ok(!(pend2.pendientes || []).some((p) => p.caso_id === r.caso.id), 'B23 el caso cerrado sale de la superficie');
    } else { ok(false, 'B21 pendingConcierge lo muestra con su caso_id (la superficie del operador lo ve)'); ok(false, 'B22 el mismo pedido no abre dos casos (dedup)'); ok(false, 'B23 el caso cerrado sale de la superficie'); }
    // Regresión: el pendiente de chat conserje sigue saliendo.
    const uidC = Number(db.prepare(`INSERT INTO users (email, concierge) VALUES ('cliente@suite.com', 1)`).run().lastInsertRowid);
    db.prepare(`INSERT INTO chat_messages (user_id, role, text) VALUES (?, 'user', 'hola, una consulta')`).run(uidC);
    const pend3 = sc.pendingConcierge(db);
    ok((pend3.pendientes || []).some((p) => p.user_id === uidC), 'B24 el pendiente de chat conserje sigue visible (sin regresión)');
    try { db.close(); } catch (e) {}
  }
  // feed-audit: la foto que no es imagen no se localiza (null), la que
  // sí, sí — el espejo nunca lleva una URL muerta.
  if (!fa || typeof fa.localizeTrialPhotos !== 'function') { ok(false, 'B25 feed-audit exporta localizeTrialPhotos'); }
  else {
    const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-retorno-media-'));
    const CDN = 'https://scontent.cdninstagram.com/v/t51/test.jpg';
    const htmlErr = Buffer.from('<html><head><title>Error</title></head><body>'.padEnd(1500, 'x') + '</body></html>');
    const jpg = Buffer.alloc(1500); jpg[0] = 0xFF; jpg[1] = 0xD8; jpg[2] = 0xFF;
    const prof1 = { handle: 'suite', photos: [CDN], best_post: { thumb: CDN, caption: 'la que más gustó', likes: 42 } };
    await fa.localizeTrialPhotos(prof1, mediaDir, async () => htmlErr);
    eq(prof1.best_post.thumb, null, 'B25 el cuerpo de error de la CDN NO se guarda como foto (espejo en null)');
    eq(prof1.photos[0], null, 'B26 la grilla tampoco recibe el cuerpo de error');
    const prof2 = { handle: 'suite', photos: [CDN], best_post: { thumb: CDN, caption: 'la que más gustó', likes: 42 } };
    await fa.localizeTrialPhotos(prof2, mediaDir, async () => jpg);
    ok(typeof prof2.best_post.thumb === 'string' && prof2.best_post.thumb.startsWith('/media/igthumb-'), 'B27 una imagen de verdad se localiza a /media/igthumb-*');
    const f2 = path.join(mediaDir, String(prof2.best_post.thumb || '').replace('/media/', ''));
    ok(fs.existsSync(f2) && fs.readFileSync(f2)[0] === 0xFF, 'B28 el archivo localizado es la imagen descargada');
    // Segunda pasada con la caché ya escrita pero CORROMPIDA (una
    // corrida vieja guardó el error): se detecta y se reintenta.
    fs.writeFileSync(f2, htmlErr);
    const prof3 = { handle: 'suite', photos: [CDN], best_post: { thumb: CDN, caption: 'la que más gustó', likes: 42 } };
    await fa.localizeTrialPhotos(prof3, mediaDir, async () => jpg);
    ok(typeof prof3.best_post.thumb === 'string' && fs.readFileSync(f2)[0] === 0xFF, 'B29 la caché corrupta se detecta, se borra y se vuelve a bajar');
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

// ---------- C · Boot real: la puerta por HTTP, de punta a punta ----------
async function seccionC() {
  seccion('C · boot aislado + la puerta por HTTP (claves inventadas)');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!DatabaseSync) { ok(false, 'C0 node:sqlite disponible para sembrar'); return; }
  const port = 19600 + Math.floor(Math.random() * 300);
  const ADMIN_TOK = 'token-suite';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-retorno-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-retorno-media-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: ADMIN_TOK, NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
    // Invitado con semana COMPLETA (la vuelta clásica) + email público.
    const uidR = Number(db.prepare(`INSERT INTO users (email, password_hash, is_guest, guest_ig, lang, trial_ends_at) VALUES ('guest-r@guest.invalid', '', 1, 'retorno.suite', 'en', ?)`)
      .run(ahora + 2 * DIA).lastInsertRowid);
    db.prepare('INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)').run(uidR, 'Retorno Suite', 'retorno.suite');
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at, email) VALUES (?, ?, ?, ?)').run('retorno.suite', '{"posts":[]}', ahora, 'publico@retorno-suite.com');
    // Semana EN ARMADO de otro negocio inventado (la forma del defecto).
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)')
      .run('armando.suite', JSON.stringify({ business: 'Armando Suite', category: 'otro', posts: [{ armando: true, headline: 'Pieza 1' }, { armando: true, headline: 'Pieza 2' }] }), ahora);

    const cookieDe = (r) => {
      const sc2 = (typeof r.headers.getSetCookie === 'function') ? r.headers.getSetCookie() : [];
      return sc2.map((c) => c.split(';')[0]).filter((c) => c.includes('=')).join('; ');
    };
    const meCon = async (cookie) => {
      const r = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } }).catch(() => null);
      return r ? { status: r.status, json: await r.json().catch(() => ({})) } : { status: 0, json: {} };
    };

    // La puerta: @ desconocido → 404 honesto, sin token ni caso.
    const r404 = await fetch(base + '/api/guest/return-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'nadie.suite', lang: 'en' }) });
    eq(r404.status, 404, 'C3 un @ sin semana recibe 404 (no se finge un envío)');
    // La puerta: el invitado pide su link con email escrito.
    const rr = await fetch(base + '/api/guest/return-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'retorno.suite', email: 'dueno@retorno-suite.com', lang: 'en' }) });
    const rrJ = await rr.json().catch(() => ({}));
    ok(rr.status === 200 && rrJ.ok === true, 'C4 la puerta responde ok para el invitado [' + rr.status + ']');
    eq(rrJ.sent && rrJ.sent.dm, 'linea_mano', 'C5 sin conversación previa, el DM va a la línea a mano (declarado en la respuesta)');
    let caso = null;
    try { caso = db.prepare(`SELECT * FROM support_cases WHERE user_id = ? AND tipo = 'prueba_retorno_dm' ORDER BY id DESC`).get(uidR); } catch (e) {}
    ok(!!caso, 'C6 el caso del DM existe en support_cases');
    const mLink = caso && String(caso.detalle || '').match(/\/api\/guest\/return\?token=([a-f0-9]{32,})/);
    ok(!!mLink, 'C7 el caso lleva el link de regreso (la línea a mano tiene qué mandar)');
    // La superficie del operador lo ve desde el acto.
    const pend = await (await fetch(base + '/api/admin/support/conserje/pendientes?token=' + ADMIN_TOK)).json().catch(() => ({}));
    ok((pend.pendientes || []).some((p) => p.caso_id === (caso && caso.id)), 'C8 el caso del DM ya es visible en pendientes del Conserje');
    // El aterrizaje: el link abre LA sesión del invitado.
    if (mLink) {
      const land = await fetch(base + '/api/guest/return?token=' + mLink[1], { redirect: 'manual' });
      eq(land.status, 302, 'C9 el link responde 302');
      eq(land.headers.get('location'), '/#/app/inicio', 'C10 el link aterriza en la app (su semana), no en el login');
      const ck = cookieDe(land);
      ok(!!ck, 'C11 el aterrizaje deja la cookie de sesión');
      const me = await meCon(ck);
      ok(me.status === 200 && Number((me.json.user && me.json.user.id) || me.json.id || 0) === uidR, 'C12 la sesión abierta ES la del invitado dueño de la semana');
      const ct = db.prepare('SELECT confirmed FROM guest_return_contacts WHERE ig = ?').get('retorno.suite');
      ok(!!ct && ct.confirmed === 1, 'C13 el consumo confirmó el email escrito como contacto');
      // Un solo uso: el mismo link, de nuevo → a pedir otro.
      const again = await fetch(base + '/api/guest/return?token=' + mLink[1], { redirect: 'manual' });
      eq(again.headers.get('location'), '/en/prueba?return=expired', 'C14 el link reusado cae en la puerta de su idioma (vencido/usado)');
    } else { ok(false, 'C9-C14 el aterrizaje no se pudo probar (sin link en el caso)'); }
    // Pieza 1 por la puerta real: guest/start con la semana EN ARMADO
    // abre la sesión (antes: 202 sin sesión → la app caía al login).
    const gs = await fetch(base + '/api/guest/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ig: 'armando.suite', lang: 'en', device: 'suite-retorno-1' }) });
    const gsJ = await gs.json().catch(() => ({}));
    eq(gs.status, 202, 'C15 guest/start con semana en armado responde 202 [' + gs.status + ']');
    ok(gsJ.week_pending === true, 'C16 la respuesta declara week_pending');
    ok(gsJ.session === true, 'C17 la respuesta 202 declara la sesión abierta');
    const ckG = cookieDe(gs);
    const meG = await meCon(ckG);
    const guestArm = db.prepare('SELECT id FROM users WHERE guest_ig = ?').get('armando.suite');
    ok(meG.status === 200 && !!guestArm && Number((meG.json.user && meG.json.user.id) || meG.json.id || 0) === Number(guestArm.id),
      'C18 la cookie del 202 autentica como ESE invitado (su semana en armado se abre, no el login)');
    try { db.close(); } catch (e) {}
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(mediaDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  seccionA();
  await seccionB();
  await seccionC();
  console.log(`\n== RETORNO DEL INVITADO: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
