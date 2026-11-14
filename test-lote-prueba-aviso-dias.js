// test-lote-prueba-aviso-dias.js — LOTE PRUEBA-AVISO-DÍA-2-Y-3
// (pedido de Valentino 13/11 21:06: «Tendríamos que ver la manera de
// avisarles a los que hacen la prueba de tres días que al día
// siguiente y al otro día les van a llegar otros dos posteos más…
// hoy no tienen manera de enterarse. Es muy importante avisarles de
// la manera correcta y en el momento correcto»).
//
// El hueco: el invitado (sin cuenta, sin IG conectado, notificaciones
// sin activar) recibe el primer posteo y ningún canal le cuenta que
// los días 2 y 3 llegan dos posteos más. Censo (verificado en la
// base v1026): el email de día 2/3 YA existe (v929, trial-post-
// ready.js) pero solo llega a quien dejó email tipeándolo adentro
// de la app (tarjeta post-wow); el permiso push de un toque existe
// (pushDoSubscribe) pero se pide SIN motivo (checklist de setup,
// tarjeta genérica); la push matutina es de publicación («sale a
// las 19:00») y no distingue invitados. Nadie fija la expectativa
// «día 1 de 3» con fechas, ni pide el permiso atado a ese motivo,
// ni hay aviso PUSH de la prueba.
//
// El lote:
//  (a) La expectativa del día 1 con fechas concretas de SU semana:
//      tarjeta pzTrialAviso en Inicio (arriba de la de email) y
//      línea en la nota de la preview del wow de /prueba (ES/EN).
//      Las fechas salen de los posteos reales; si el patrón no es
//      hoy/+1/+2, silencio (nunca una promesa falsa).
//  (b) El permiso de un toque atado a esa línea: «¿Te aviso cuando
//      esté el de mañana?» → pushDoSubscribe (el mecanismo que ya
//      existe). La suscripción resultante ES el permiso del aviso.
//  (c) El aviso de día 2/3: trial-day-push.js — barrido 15 min en
//      scheduler.js; solo invitados vigentes CON suscripción; desde
//      las 9:00 en su zona; solo si el posteo de HOY está en su
//      semana (scheduled) y no es el del día 1; dedup durable por
//      posteo, marcado SOLO con envío exitoso (reintenta si falla);
//      copia de comprobante, ES/EN. El email de v929 queda intacto
//      (canal email, mismo evento). morning-post-push ahora SALTA
//      invitados: su copia de publicación no les aplica.
//
// Se corre desde la raíz del scratch (base/ y release/ hermanos):
//   node test-lote-prueba-aviso-dias.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const BASE = path.join(ROOT, 'base');
const REL = path.join(ROOT, 'release');
let pass = 0, fail = 0; const fails = [];
function ok(cond, msg) { if (cond) pass++; else { fail++; fails.push(msg); console.log('  ✗', msg); } }
function readT(p) { return fs.readFileSync(p, 'utf8'); }
function countOcc(t, s) { return t.split(s).length - 1; }
const md5 = (p) => require('crypto').createHash('md5').update(fs.readFileSync(p)).digest('hex');

// ================= A. ANCLAS ESTÁTICAS (base vs release) ==========
console.log('A. Anclas estáticas');
{
  const tdpR = fs.existsSync(path.join(REL, 'trial-day-push.js'));
  const tdpB = fs.existsSync(path.join(BASE, 'trial-day-push.js'));
  ok(tdpR && !tdpB, 'A1 el módulo trial-day-push.js existe solo en release (el hueco en la base)');
  const tdp = tdpR ? readT(path.join(REL, 'trial-day-push.js')) : '';
  ok(countOcc(tdp, 'trial_day_push_sent') >= 3, 'A2 dedup durable trial_day_push_sent');
  ok(countOcc(tdp, 'Tu posteo de hoy está listo') === 1 && countOcc(tdp, 'Your post for today is ready') === 1, 'A3 copia de comprobante ES/EN');
  ok(countOcc(tdp, "url: '/#/app/inicio'") === 1, 'A4 el aviso abre Inicio (su semana), no el ritual');
  ok(countOcc(tdp, 'is_guest') >= 1 && countOcc(tdp, 'r.ok || Number(r.sent) > 0') === 1, 'A5 solo invitados + marca solo con envío exitoso');
  const copiaPush = tdp.slice(tdp.indexOf('function trialDayText'), tdp.indexOf('function ensureTrialDayPushTable'));
  ok(!/sale|publica/.test(copiaPush) && copiaPush.includes('ya está en tu semana') && copiaPush.includes('already in your week'), 'A6 la copia del aviso es comprobante de trabajo entregado, nunca de publicación');

  const schB = readT(path.join(BASE, 'scheduler.js')), schR = readT(path.join(REL, 'scheduler.js'));
  ok(countOcc(schB, 'trial-day-push') === 0 && countOcc(schR, "require('./trial-day-push')") === 1, 'A7 scheduler: barrido cableado solo en release');
  ok(countOcc(schR, 'trial-post-ready') === countOcc(schB, 'trial-post-ready'), 'A8 el barrido del email de v929 queda intacto');

  const morB = readT(path.join(BASE, 'morning-post-push.js')), morR = readT(path.join(REL, 'morning-post-push.js'));
  ok(countOcc(morB, 'isGuest') === 0 && countOcc(morR, 'if (isGuest) { res.skipped++; continue; }') === 1, 'A9 la push matutina salta invitados solo en release');

  const appB = readT(path.join(BASE, 'public/app.js')), appR = readT(path.join(REL, 'public/app.js'));
  ok(countOcc(appB, 'pzTrialAviso') === 0 && countOcc(appR, 'pzTrialAviso') >= 10, 'A10 la tarjeta pzTrialAviso existe solo en release');
  ok(countOcc(appR, 'Esto es el día 1 de 3: mañana, ') === 1 && countOcc(appR, 'This is day 1 of 3: tomorrow, ') === 1, 'A11 la línea de expectativa ES/EN con fechas');
  ok(countOcc(appR, '¿Te aviso cuando esté el de mañana?') >= 1 && countOcc(appR, 'data-pz-aviso-yes') >= 1, 'A12 el permiso con motivo, de un toque');
  ok(countOcc(appR, 'pushDoSubscribe') >= 2, 'A13 el toque reusa pushDoSubscribe (el mecanismo existente)');
  ok(countOcc(appR, 'try { pzTrialAvisoBind(root); }') === 1, 'A14 bind cableado junto al de la tarjeta de email');
  ok(countOcc(appR, 'pzPostWowEmailHTML') === countOcc(appB, 'pzPostWowEmailHTML'), 'A15 la tarjeta de email de v929 queda intacta');

  for (const f of ['public/prueba.html', 'public/en-prueba.html']) {
    const b = readT(path.join(BASE, f)), r = readT(path.join(REL, f));
    ok(countOcc(b, 'pvDiasTxt') === 0 && countOcc(r, 'pvDiasTxt') === 2, 'A16 ' + f + ': la línea de expectativa del wow solo en release');
    ok(countOcc(r, 'día 1 de 3') >= 1 && countOcc(r, 'day 1 of 3') >= 1, 'A17 ' + f + ': las dos ramas de idioma presentes');
    ok(countOcc(r, "id === 'armando'") === countOcc(b, "id === 'armando'"), 'A18 ' + f + ': la línea nunca sale en la pieza transitoria (armando intacto)');
  }

  // Vecinos que NO se tocan (canales existentes intactos):
  // RE-PIN DEL PREPARADOR (v1040, con causa): server.js sale de la
  // comparación byte a byte y pasa a compararse sin la línea BUILD_ID
  // — el preparador estampa BUILD v1040 sobre la base viva v1039 y esa
  // es la ÚNICA diferencia permitida en server.js; el resto del archivo
  // (incluido el cuerpo del email de posteo listo) queda byte-idéntico.
  for (const f of ['trial-post-ready.js', 'email.js', 'push.js', 'public/sw.js']) {
    ok(md5(path.join(BASE, f)) === md5(path.join(REL, f)), 'A19 intacto byte a byte: ' + f);
  }
  {
    const strip = (p) => readT(p).replace(/const BUILD_ID = '[^']*';/, "const BUILD_ID = 'X';");
    ok(strip(path.join(BASE, 'server.js')) === strip(path.join(REL, 'server.js')), 'A19 server.js idéntico salvo la línea BUILD_ID (stamp del preparador)');
  }
}

// ================= B. UNIDAD: trial-day-push ======================
console.log('B. Unidad — el aviso push de los días 2 y 3');
const TZ = 'America/Argentina/Buenos_Aires';
// 2026-11-13 = viernes · 14 = sábado · 15 = domingo (BA = UTC-3)
const CREATED = Date.parse('2026-11-13T18:00:00Z');           // vie 15:00 BA
const P1 = '2026-11-13T22:00:00Z';                              // vie 19:00 BA
const P2 = '2026-11-14T22:00:00Z';                              // sáb 19:00 BA
const P3 = '2026-11-15T22:00:00Z';                              // dom 19:00 BA
const D2_10AM = Date.parse('2026-11-14T13:00:00Z');             // sáb 10:00 BA
const D2_8AM = Date.parse('2026-11-14T11:00:00Z');              // sáb 08:00 BA
const D1_10AM = Date.parse('2026-11-13T13:00:00Z');             // vie 10:00 BA
const D3_10AM = Date.parse('2026-11-15T13:00:00Z');             // dom 10:00 BA

function mkDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, is_guest INTEGER DEFAULT 0, trial_ends_at INTEGER, guest_ig TEXT, lang TEXT DEFAULT 'es');
           CREATE TABLE settings (user_id INTEGER, timezone TEXT);
           CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, created_at INTEGER, payload TEXT, email TEXT);
           CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, scheduled_at TEXT);
           CREATE TABLE push_subscriptions (user_id INTEGER, endpoint TEXT, keys_json TEXT, transport TEXT);`);
  return db;
}
function seedGuest(db, uid, o) {
  o = o || {};
  db.prepare('INSERT INTO users (id, is_guest, trial_ends_at, guest_ig, lang) VALUES (?,?,?,?,?)')
    .run(uid, o.guest === false ? 0 : 1, o.ends === undefined ? CREATED + 3 * 86400000 : o.ends, o.ig || ('guest' + uid), o.lang || 'es');
  db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?,?)').run(uid, TZ);
  db.prepare('INSERT INTO trial_cache (ig, created_at, payload, email) VALUES (?,?,?,?)')
    .run(o.ig || ('guest' + uid), CREATED, JSON.stringify({ lang: o.plang || 'es' }), o.email || null);
  if (o.sub !== false) db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, keys_json, transport) VALUES (?, 'https://push.example/x', '{}', 'webpush')").run(uid);
  return uid;
}
function seedPosts(db, uid, p2status) {
  db.prepare('INSERT INTO posts (id, user_id, status, scheduled_at) VALUES (?,?,?,?)').run(uid * 10 + 1, uid, 'scheduled', P1);
  db.prepare('INSERT INTO posts (id, user_id, status, scheduled_at) VALUES (?,?,?,?)').run(uid * 10 + 2, uid, p2status || 'scheduled', P2);
  db.prepare('INSERT INTO posts (id, user_id, status, scheduled_at) VALUES (?,?,?,?)').run(uid * 10 + 3, uid, 'scheduled', P3);
}
function mkPush(fail) {
  const calls = [];
  const fn = async (uid, payload) => { calls.push({ uid, payload }); return fail ? { ok: false, reason: 'sin_clave' } : { ok: true, sent: 1 }; };
  fn.calls = calls;
  return fn;
}

async function unidad() {
  const TDP = require(path.join(REL, 'trial-day-push.js'));

  // B1: el día 2 a las 10:00 avisa UNA vez, solo el posteo del día 2.
  {
    const db = mkDb(); seedGuest(db, 1); seedPosts(db, 1);
    const push = mkPush();
    const r1 = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM });
    ok(r1.sent === 1 && push.calls.length === 1 && String(push.calls[0].payload.data.postId) === '12', 'B1 día 2 listo → un aviso, del posteo del día 2');
    ok(push.calls[0].payload.url === '/#/app/inicio' && push.calls[0].payload.title === 'Tu posteo de hoy está listo 👀', 'B2 copia de comprobante ES + link a su semana');
    const r2 = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM + 15 * 60000 });
    ok(r2.sent === 0 && push.calls.length === 1, 'B3 idempotente: el mismo posteo no avisa dos veces');
    const r3 = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D3_10AM });
    ok(r3.sent === 1 && String(push.calls[1].payload.data.postId) === '13', 'B4 el día 3 avisa su propio posteo');
  }
  // B5: el día 1 no avisa (el posteo del wow ya se vio).
  {
    const db = mkDb(); seedGuest(db, 1); seedPosts(db, 1);
    const push = mkPush();
    const r = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D1_10AM });
    ok(r.sent === 0 && push.calls.length === 0, 'B5 día 1: silencio (es el posteo del wow)');
  }
  // B6: antes de las 9:00 no avisa; a las 10:00 sí.
  {
    const db = mkDb(); seedGuest(db, 1); seedPosts(db, 1);
    const push = mkPush();
    const r = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_8AM });
    ok(r.sent === 0 && push.calls.length === 0, 'B6 08:00 en su zona: todavía no (el aviso es de la mañana, con el posteo ya en su semana)');
  }
  // B7: sin suscripción (sin permiso) no hay push.
  {
    const db = mkDb(); seedGuest(db, 1, { sub: false }); seedPosts(db, 1);
    const push = mkPush();
    const r = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM });
    ok(r.sent === 0 && push.calls.length === 0 && r.checked === 0, 'B7 sin permiso no hay aviso push');
  }
  // B8: posteo del día todavía no listo (draft) → silencio; cuando
  // queda scheduled, el barrido siguiente avisa (la cadena sigue).
  {
    const db = mkDb(); seedGuest(db, 1); seedPosts(db, 1, 'draft');
    const push = mkPush();
    const r1 = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM });
    ok(r1.sent === 0 && push.calls.length === 0, 'B8a día sin posteo listo: no avisa ni declara nada');
    db.prepare("UPDATE posts SET status = 'scheduled' WHERE id = 12").run();
    const r2 = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM + 15 * 60000 });
    ok(r2.sent === 1 && push.calls.length === 1, 'B8b cuando el posteo queda listo ese día, el aviso sale');
  }
  // B9: envío fallido → no marca; el próximo barrido reintenta.
  {
    const db = mkDb(); seedGuest(db, 1); seedPosts(db, 1);
    const bad = mkPush(true);
    const r1 = await TDP.sendTrialDayPushes(db, { pushFn: bad, now: D2_10AM });
    ok(r1.sent === 0, 'B9a push fallida: no cuenta como enviada');
    const good = mkPush();
    const r2 = await TDP.sendTrialDayPushes(db, { pushFn: good, now: D2_10AM + 15 * 60000 });
    ok(r2.sent === 1 && good.calls.length === 1, 'B9b reintenta y avisa cuando el envío sale');
  }
  // B10: registrado con suscripción → este módulo no lo toca.
  {
    const db = mkDb(); seedGuest(db, 1, { guest: false }); seedPosts(db, 1);
    const push = mkPush();
    const r = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM });
    ok(r.sent === 0 && push.calls.length === 0, 'B10 el registrado no recibe el aviso de la prueba');
  }
  // B11: prueba vencida → silencio.
  {
    const db = mkDb(); seedGuest(db, 1, { ends: D2_10AM - 1000 }); seedPosts(db, 1);
    const push = mkPush();
    const r = await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM });
    ok(r.sent === 0 && push.calls.length === 0, 'B11 prueba vencida: silencio');
  }
  // B12: idioma de la prueba EN → copia EN.
  {
    const db = mkDb(); seedGuest(db, 1, { plang: 'en', lang: 'en' }); seedPosts(db, 1);
    const push = mkPush();
    await TDP.sendTrialDayPushes(db, { pushFn: push, now: D2_10AM });
    ok(push.calls.length === 1 && push.calls[0].payload.title === 'Your post for today is ready 👀', 'B12 copia EN según el idioma de la prueba');
  }
  // B13: CONTROL contra la base — el módulo no existe: el hueco.
  {
    let threw = false;
    try { require(path.join(BASE, 'trial-day-push.js')); } catch (e) { threw = true; }
    ok(threw, 'B13 control base: sin módulo, ningún aviso push de día 2/3 (el hueco reproducido)');
  }
  // B14: la push matutina salta al invitado y sigue con el registrado.
  {
    const MOR = require(path.join(REL, 'morning-post-push.js'));
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, lang TEXT DEFAULT 'es', publishing_stopped INTEGER DEFAULT 0, is_guest INTEGER DEFAULT 0);
             CREATE TABLE settings (user_id INTEGER, timezone TEXT);
             CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, scheduled_at TEXT, image_path TEXT, media_type TEXT);
             CREATE TABLE push_subscriptions (user_id INTEGER, endpoint TEXT);`);
    const NOW930 = new Date('2026-11-14T12:30:00Z'); // sáb 09:30 BA, ventana 9–10
    for (const [uid, guest] of [[1, 1], [2, 0]]) {
      db.prepare('INSERT INTO users (id, lang, publishing_stopped, is_guest) VALUES (?,?,0,?)').run(uid, 'es', guest);
      db.prepare('INSERT INTO settings (user_id, timezone) VALUES (?,?)').run(uid, TZ);
      db.prepare("INSERT INTO push_subscriptions (user_id, endpoint) VALUES (?, 'https://push.example/x')").run(uid);
      db.prepare("INSERT INTO posts (id, user_id, status, scheduled_at) VALUES (?,?, 'scheduled', ?)").run(uid * 10 + 2, uid, P2);
    }
    const push = mkPush();
    const r = await MOR.sendMorningPostPush(db, { pushFn: push, now: NOW930 });
    const uids = push.calls.map((c) => c.uid);
    ok(!uids.includes(1) && uids.includes(2) && r.sent === 1, 'B14 morning-post-push: el invitado ya no recibe la copia de publicación; el registrado sí');
  }
}

// ============ C. CLIENTE: la tarjeta y la línea del wow ============
console.log('C. Cliente — expectativa con fechas y permiso');
function cliente() {
  const app = readT(path.join(REL, 'public/app.js'));
  const i0 = app.indexOf('function pzTrialAvisoDismissKey()');
  const i1 = app.indexOf('function pzHoyHoyHTML(p, o) {');
  ok(i0 > 0 && i1 > i0, 'C0 bloque pzTrialAviso extraíble de app.js');
  const mIdx = app.indexOf('// (LOTE PRUEBA-AVISO-DÍA-2-Y-3');
  const block = app.slice(mIdx, i1);
  const dayKeyDef = (() => {
    const j = app.indexOf('function pzHoyDiaKey(fecha, tz)');
    return app.slice(j, app.indexOf('\n}', j) + 2);
  })();
  const store = {};
  const sandbox = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    ME: { id: 555, lang: 'es' },
    HF_VISITOR: false,
    esc: (s) => String(s == null ? '' : s),
    pzIsGuest: () => true,
    pushSupported: () => true,
    pushPerm: () => 'default',
    Intl, Date, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(dayKeyDef + '\n' + block + '\nthis.__aviso = { pzTrialAvisoHTML, pzTrialAvisoDias };', sandbox);
  const A = sandbox.__aviso;
  const posts = [
    { id: 11, status: 'scheduled', scheduled_at: P1 },
    { id: 12, status: 'scheduled', scheduled_at: P2 },
    { id: 13, status: 'scheduled', scheduled_at: P3 },
  ];
  const hoyKey = '2026-11-13';
  const o = { hoyPost: posts[0], posts, hoyKey, tz: TZ, en: false };
  const html = A.pzTrialAvisoHTML(o);
  ok(html.includes('Esto es el día 1 de 3: mañana, sábado 14, te llega otro posteo, y el domingo 15 el último de la prueba.'), 'C1 la línea ES con las fechas reales de SU semana (tz del invitado)');
  ok(html.includes('¿Te aviso cuando esté el de mañana?') && html.includes('data-pz-aviso-yes') && html.includes('Ahora no'), 'C2 el permiso con motivo, de un toque, con salida');
  const htmlEn = A.pzTrialAvisoHTML({ ...o, en: true });
  ok(htmlEn.includes('This is day 1 of 3: tomorrow, Saturday 14') && htmlEn.includes('Sunday 15'), 'C3 la línea EN espejo con sus fechas');
  ok(A.pzTrialAvisoHTML({ ...o, posts: posts.slice(0, 2) }) === '', 'C4 sin día 3 en la semana, no se promete nada');
  ok(A.pzTrialAvisoHTML({ ...o, hoyKey: '2026-11-14' }) === '', 'C5 el día 2 ya no muestra la tarjeta del día 1');
  ok(A.pzTrialAvisoHTML({ ...o, posts: [posts[0], posts[2], { id: 14, status: 'scheduled', scheduled_at: '2026-11-16T22:00:00Z' }] }) === '', 'C6 hueco en la secuencia (+2/+3): silencio antes que promesa falsa');
  sandbox.pzIsGuest = () => false;
  vm.runInContext(block + '\nthis.__aviso2 = { pzTrialAvisoHTML };', sandbox);
  ok(sandbox.__aviso2.pzTrialAvisoHTML(o) === '', 'C7 el registrado no ve la tarjeta de la prueba');
  // La línea de la preview del wow (prueba.html / en-prueba.html).
  for (const [f, lang] of [['public/prueba.html', 'es'], ['public/en-prueba.html', 'en']]) {
    const h = readT(path.join(REL, f));
    const a = h.indexOf('function pvDiasTxt()');
    const b = h.indexOf('function showFirstPostPreview', a);
    const fn = h.slice(a, b);
    const sb = { LANG: lang, Intl, Date, console };
    vm.createContext(sb);
    vm.runInContext(fn + '\nthis.__t = pvDiasTxt();', sb);
    const t = sb.__t;
    const loc = lang === 'en' ? 'en-US' : 'es-ES';
    const f1 = new Date(Date.now() + 86400000);
    const m = new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(f1) + ' ' + new Intl.DateTimeFormat(loc, { day: 'numeric' }).format(f1);
    const frase = lang === 'en' ? 'This is day 1 of 3: tomorrow, ' : 'Esto es el día 1 de 3: mañana, ';
    ok(t.startsWith(frase) && t.includes(m), 'C8 ' + f + ': la línea del wow trae la fecha real de mañana en su idioma');
  }
}

// ================= D. BOOT SMOKE (release) =========================
console.log('D. Boot smoke del release');
function boot(tree) {
  return new Promise((resolve) => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pz-aviso-data-'));
    const port = 19700 + Math.floor(Math.random() * 200);
    const child = spawn('node', ['server.js'], {
      cwd: tree,
      env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const t0 = Date.now();
    const iv = setInterval(async () => {
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/api/version');
        if (r.ok) {
          const j = await r.json();
          clearInterval(iv);
          try { child.kill('SIGKILL'); } catch (e) {}
          resolve({ ok: true, version: j, log: out });
        }
      } catch (e) {}
      if (Date.now() - t0 > 45000) { clearInterval(iv); try { child.kill('SIGKILL'); } catch (e) {} resolve({ ok: false, log: out }); }
    }, 700);
  });
}
async function main() {
  await unidad();
  cliente();
  const b = await boot(REL);
  ok(b.ok, 'D1 el release levanta y responde /api/version');
  if (b.ok) ok(/v1026|BUILD/.test(JSON.stringify(b.version)) || true, 'D2 (informativo) versión: ' + JSON.stringify(b.version).slice(0, 120));
  ok(b.log.includes('trial-day-push') || b.log.includes('Push posteo-listo de prueba'), 'D3 el scheduler anuncia el barrido nuevo al arrancar');
  console.log(`\n== PRUEBA-AVISO-DÍA-2-Y-3: ${pass} ok · ${fail} fallos ==`);
  if (fails.length) { console.log('FALLOS:'); fails.forEach((f) => console.log(' -', f)); }
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('ERROR FATAL', e); process.exit(2); });
