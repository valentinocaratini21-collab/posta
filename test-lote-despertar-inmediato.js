'use strict';
// =====================================================================
// SUITE · LOTE DESPERTAR-INMEDIATO (familia VIGILANTE-ENTRADAS, v1118)
//
// El defecto (corrida real Rosehip, 2026-11-16): la entrada de
// @rosehipfloral nació marcada ~02:17 EST y el caso del vigilante SÍ se
// abrió (#44, 02:30:00 EST) — pero NUNCA apareció en la superficie que
// el operador vigila (GET /api/admin/support/conserje/pendientes,
// chequeos 02:29/02:31/02:43 → total 1, solo el caso viejo de chat).
// Dos causas nombradas:
//   1 · VISIBILIDAD: pendingConcierge solo proyecta clientes con
//       users.concierge = 1 y mensajes de chat sin responder; jamás lee
//       los casos prueba_linea_mano de support_cases. Y guest/start no
//       prende concierge (solo /api/trial/chat-onboarding): el
//       invitado 107 tenía concierge = 0.
//   2 · LATENCIA: la marca nace en la generación con user_id = 0 y el
//       atado exige el alta del invitado (acá llegó 02:25:19, ~9 min
//       después); encima, la cadencia */5 del barrido come 0–5 min más.
//       Marca→caso ≈ 14 min contra una promesa de 3.
//
// La corrección que esta suite pincha:
//   · scheduler.js: el barrido del vigilante corre CADA MINUTO
//     (el rescate sigue */5, intacto).
//   · server.js: /api/guest/start gatilla una pasada del barrido al
//     quedar el invitado en pie (el alta suele ser la última
//     precondición: la marca la precede).
//   · support-cases.js: pendingConcierge suma los casos ABIERTOS
//     prueba_linea_mano con la misma forma (caso_id = número del caso).
// Sin tocar el contenido del caso (4 datos, título solo-día-1, dedup)
// ni el resto del comportamiento del v1118.
//
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules \
//        node test-lote-despertar-inmediato.js [--no-boot]
// Control: PZ_ROOT=<árbol prístino v1119> node test-lote-...js
// =====================================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = process.env.PZ_ROOT || __dirname;
const SERVER = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const SCHED = fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8');
const CASES = fs.readFileSync(path.join(ROOT, 'support-cases.js'), 'utf8');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {}
let lm = null, sc = null, gt = null;
try { lm = require(path.join(ROOT, 'linea-mano')); } catch (e) {}
try { sc = require(path.join(ROOT, 'support-cases')); } catch (e) {}
try { gt = require(path.join(ROOT, 'guest-trial')); } catch (e) {}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, nombre) {
  if (cond) { pass++; console.log('  ok ·', nombre); }
  else { fail++; failures.push(nombre); console.log('  ✗ MAL ·', nombre); }
}
function eq(a, b, nombre) { ok(a === b, nombre + ' [' + JSON.stringify(a) + (a === b ? '' : ' ≠ ' + JSON.stringify(b)) + ']'); }
function seccion(t) { console.log('\n== ' + t); }

const T0 = Date.UTC(2026, 10, 16, 7, 17, 0); // 02:17 EST: nace la marca
const DIA = 24 * 3600 * 1000;
const utcTxt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');

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
  db.exec(`CREATE TABLE trial_cache (ig TEXT PRIMARY KEY, payload TEXT, created_at INTEGER)`);
  return db;
}
function payloadSemana(ig) {
  return {
    ok: true, business: 'Negocio Despertar', ig, category: 'floreria',
    digest: {
      producto_estrella: 'Bouquets',
      productos: [{ nombre: 'Bouquets' }, { nombre: 'Coronas' }, { nombre: 'Ramos de novia' }],
      servicios: [{ nombre: 'Eventos' }],
      web: { description: 'Florería en Brooklyn. Pedidos: hola@despertar-suite.com', url: 'https://despertar-suite.com' },
    },
    posts: [0, 1, 2, 3, 4].map((i) => ({ type: 'image', armando: true, headline: 'Pieza ' + i, caption: 'caption ' + i, hashtags: '#suite' })),
    week: [0, 1, 2, 3, 4].map((i) => ({ day: i + 1, date: '2026-11-16', hour: '19:00', post: i })),
  };
}
function depsBarrido() {
  return {
    findGuest: (d, ig, domain) => gt.findGuestByIdentity(d, ig, domain),
    getUser: (d, id) => d.prepare('SELECT * FROM users WHERE id = ?').get(id) || null,
    guestEnd: (u, now) => gt.guestTrialEnd(u, now),
    openCase: (d, f) => sc.openCase(d, f),
  };
}

// ---------- A · Pines estáticos del mecanismo ----------
function seccionA() {
  seccion('A · pines estáticos (cadencia, gatillo, proyección)');
  // A1: el cron.schedule inmediatamente anterior a la llamada del
  // vigilante es el de cada minuto (no el */5 del rescate, que va antes).
  const iV = SCHED.indexOf('lineaManoSweep');
  ok(iV > 0, 'A0 scheduler.js conoce el barrido del vigilante');
  if (iV > 0) {
    const antes = SCHED.slice(0, iV);
    const ultCron = antes.slice(antes.lastIndexOf('cron.schedule('), antes.lastIndexOf('cron.schedule(') + 40);
    ok(ultCron.includes("'* * * * *'"), 'A1 el vigilante corre CADA MINUTO (su cron es * * * * *)');
  }
  // A1b: el rescate de semanas sigue en */5 (sin regresión).
  const iR = SCHED.indexOf('rescateSemanaSweep');
  if (iR > 0) {
    const antesR = SCHED.slice(0, iR);
    const ultCronR = antesR.slice(antesR.lastIndexOf('cron.schedule('), antesR.lastIndexOf('cron.schedule(') + 40);
    ok(ultCronR.includes("'*/5 * * * *'"), 'A1b el rescate sigue cada 5 minutos (intacto)');
  } else ok(false, 'A1b el rescate sigue presente en scheduler.js');
  // A2: guest/start gatilla el barrido DESPUÉS de crear/reusar el invitado.
  const iG = SERVER.indexOf("app.post('/api/guest/start'");
  ok(iG > 0, 'A2a la ruta /api/guest/start existe');
  if (iG > 0) {
    const seg = SERVER.slice(iG, iG + 40000);
    const iTrig = seg.indexOf('lineaManoSweep();');
    const iAlta = seg.indexOf('guestTrial.createGuest');
    ok(iTrig > 0, 'A2b guest/start gatilla una pasada del barrido (lineaManoSweep())');
    ok(iAlta > 0 && iTrig > iAlta, 'A2c el gatillo va DESPUÉS del alta del invitado');
  }
  // A3: pendingConcierge (esa función, no el registro de tipos) lee los
  // casos prueba_linea_mano.
  const iP = CASES.indexOf('function pendingConcierge');
  ok(iP > 0, 'A3a pendingConcierge existe');
  if (iP > 0) {
    const resto = CASES.slice(iP + 10);
    const fin = resto.indexOf('\nfunction ');
    const cuerpo = fin > 0 ? resto.slice(0, fin) : resto;
    ok(cuerpo.includes('prueba_linea_mano'), 'A3b pendingConcierge suma los casos prueba_linea_mano');
    ok(cuerpo.includes("c.estado <> 'cerrado'") || cuerpo.includes('estado_abierto') || cuerpo.includes('abierto'), 'A3c solo casos no cerrados');
  }
}

// ---------- B · Módulos: la forma Rosehip, de punta a punta ----------
function seccionB() {
  seccion('B · módulos (marca → alta → barrido → pendientes del Conserje)');
  if (!lm || !sc || !gt) { ok(false, 'B0 módulos linea-mano + support-cases + guest-trial disponibles'); return; }
  const db = nuevaDb();
  sc.ensureSchema(db);
  const deps = depsBarrido();
  const IG = 'despertar.suite';
  // La marca nace en la generación, SIN invitado todavía (forma Rosehip).
  lm.nace(db, { ig: IG, domain: '', testMode: false, allowlisted: false, now: T0 });
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(IG, JSON.stringify(payloadSemana(IG)), T0);
  let r = lm.barrido(db, deps, T0 + 5 * 60 * 1000);
  eq(r.avisos, 0, 'B1 sin alta del invitado no hay caso todavía (la marca espera, no se pierde)');
  eq(sc.pendingConcierge(db).total, 0, 'B1b y la superficie del operador está vacía');
  // El alta llega ~9 minutos después (02:25:19 en la corrida real), con
  // concierge = 0 — guest/start NO prende el modo conserje.
  db.prepare(`INSERT INTO users (email, is_guest, guest_ig, created_at, trial_ends_at) VALUES ('guest-d@guest.invalid', 1, ?, ?, ?)`)
    .run(IG, utcTxt(T0 + 9 * 60 * 1000), T0 + 3 * DIA);
  const uid = Number(db.prepare('SELECT id FROM users WHERE guest_ig = ?').get(IG).id);
  // La pasada que gatilla el alta (o el tick del minuto siguiente):
  const tIni = Date.now();
  r = lm.barrido(db, deps, T0 + 9 * 60 * 1000 + 1000);
  const pend = sc.pendingConcierge(db);
  const demoraMs = Date.now() - tIni;
  eq(r.avisos, 1, 'B2 con el alta en pie, la pasada abre el caso de entrada');
  const caso = db.prepare(`SELECT * FROM support_cases WHERE tipo = 'prueba_linea_mano'`).get();
  ok(!!caso, 'B2b el caso existe en support_cases');
  const entrada = pend.pendientes.find((p) => p.caso_id === (caso && caso.id));
  ok(!!entrada, 'B3 EL CASO ES VISIBLE en pendingConcierge (la superficie del operador)');
  if (entrada) {
    eq(entrada.user_id, uid, 'B3b la entrada apunta al invitado');
    eq(entrada.ig_username, IG, 'B3c el @ sale de la identidad del invitado (sin fila en profiles)');
    ok(String(entrada.ultimo_mensaje).includes('día 1'), 'B3d el «mensaje» es el título del caso: dispara SOLO el día 1');
    eq(entrada.mensajes_pendientes, 1, 'B3e cuenta como 1 pendiente (la clave caso-<id> del cron deduplica)');
  }
  if (caso) {
    eq(caso.detalle.split('\n').length, 4, 'B4 el caso conserva EXACTAMENTE los 4 datos (contenido intacto)');
    eq(caso.dedup_key, 'trial-mano:' + uid + ':entrada', 'B4b el dedup es el del v1118 (intacto)');
  }
  ok(demoraMs < 60000, 'B5 la pasada + la proyección corren en mucho menos que el presupuesto de 1 minuto (' + demoraMs + ' ms)');
  // Barridos repetidos: ni caso duplicado ni pendiente duplicado.
  lm.barrido(db, deps, T0 + 10 * 60 * 1000);
  lm.barrido(db, deps, T0 + 11 * 60 * 1000);
  const pend2 = sc.pendingConcierge(db);
  eq(db.prepare(`SELECT COUNT(*) AS n FROM support_cases WHERE tipo = 'prueba_linea_mano'`).get().n, 1, 'B6 barridos repetidos NO duplican el caso');
  eq(pend2.pendientes.filter((p) => p.caso_id === (caso && caso.id)).length, 1, 'B6b ni el pendiente');
  // Entrada SIN marca: ningún caso, ningún pendiente.
  const IG2 = 'sinmarca.suite';
  db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(IG2, JSON.stringify(payloadSemana(IG2)), T0);
  db.prepare(`INSERT INTO users (email, is_guest, guest_ig, created_at, trial_ends_at) VALUES ('guest-s@guest.invalid', 1, ?, ?, ?)`)
    .run(IG2, utcTxt(T0), T0 + 3 * DIA);
  lm.barrido(db, deps, T0 + 12 * 60 * 1000);
  const pend3 = sc.pendingConcierge(db);
  ok(!pend3.pendientes.some((p) => p.ig_username === IG2), 'B7 una entrada SIN marca no produce caso ni pendiente');
  // El caso cerrado sale de la superficie.
  db.prepare(`UPDATE support_cases SET estado = 'cerrado' WHERE id = ?`).run(caso.id);
  const pend4 = sc.pendingConcierge(db);
  ok(!pend4.pendientes.some((p) => p.caso_id === caso.id), 'B8 el caso cerrado ya no se lista');
  // Regresión: el pendiente de chat de un cliente conserje sigue saliendo.
  db.prepare(`INSERT INTO users (email, is_guest, concierge, created_at) VALUES ('cliente@suite.com', 0, 1, ?)`).run(utcTxt(T0));
  const uidC = Number(db.prepare('SELECT id FROM users WHERE email = ?').get('cliente@suite.com').id);
  db.prepare(`INSERT INTO chat_messages (user_id, role, text, created_at) VALUES (?, 'user', 'hola, una consulta', ?)`).run(uidC, utcTxt(T0 + 1000));
  const pend5 = sc.pendingConcierge(db);
  const entC = pend5.pendientes.find((p) => p.user_id === uidC);
  ok(!!entC && entC.mensajes_pendientes >= 1, 'B9 el pendiente de chat conserje sigue visible (sin regresión)');
}

// ---------- C · Boot real: la puerta de invitado despierta sola ----------
async function seccionC() {
  seccion('C · boot aislado + guest/start real (la forma Rosehip por HTTP)');
  if (process.argv.includes('--no-boot')) { console.log('  (omitido por --no-boot)'); return; }
  if (!lm) { ok(false, 'C0 el módulo linea-mano existe para sembrar la marca'); return; }
  const port = 19400 + Math.floor(Math.random() * 300);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-despertar-data-'));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-despertar-media-'));
  const child = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN: 'token-suite', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let vivo = false;
  try {
    for (let i = 0; i < 60 && !vivo; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const resp = await fetch('http://127.0.0.1:' + port + '/api/version').catch(() => null);
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
    const IG = 'despertar.suite';
    const ahora = Date.now();
    // Semana en armado + marca nacida, SIN invitado: la forma exacta de
    // Rosehip a las 02:17 (la marca precede al alta).
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(IG, JSON.stringify(payloadSemana(IG)), ahora);
    lm.nace(db, { ig: IG, domain: '', testMode: false, allowlisted: false, now: ahora });
    const getPend = async () => {
      const r = await fetch('http://127.0.0.1:' + port + '/api/admin/support/conserje/pendientes?token=token-suite');
      return { status: r.status, json: await r.json().catch(() => ({})) };
    };
    const antes = await getPend();
    ok(antes.status === 200 && !(antes.json.pendientes || []).some((p) => p.ig_username === IG),
      'C3 antes del alta, la superficie del operador NO muestra la entrada (todavía no hay invitado)');
    // La puerta real: el invitado se da de alta (semana en armado → 202,
    // como en la corrida real; el alta queda igual).
    const gs = await fetch('http://127.0.0.1:' + port + '/api/guest/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ig: IG, lang: 'en', device: 'suite-despertar-1' }),
    });
    const gsJson = await gs.json().catch(() => ({}));
    ok(gs.status === 200 || gs.status === 202, 'C4 guest/start responde (200/202) [' + gs.status + ']');
    // SIN llamar a ningún barrido y SIN esperar ticks: el gatillo del
    // alta ya abrió el caso y la proyección ya lo muestra.
    const tIni = Date.now();
    const despues = await getPend();
    const demoraMs = Date.now() - tIni;
    const entrada = (despues.json.pendientes || []).find((p) => p.ig_username === IG);
    ok(!!entrada, 'C5 tras el alta, el caso de entrada YA es visible en pendientes (sin ticks ni barridos manuales)');
    if (entrada) {
      ok(Number.isInteger(entrada.caso_id) && entrada.caso_id > 0, 'C5b el pendiente trae el número del caso (caso_id)');
      ok(String(entrada.ultimo_mensaje).includes('día 1'), 'C5c el título dispara SOLO el día 1');
    }
    ok(demoraMs < 60000, 'C6 la visibilidad llega en menos de 1 minuto desde el alta (' + demoraMs + ' ms)');
    // Segunda entrada por la misma puerta, SIN marca: nada nuevo.
    const IG2 = 'sinmarca.suite';
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(IG2, JSON.stringify(payloadSemana(IG2)), Date.now());
    await fetch('http://127.0.0.1:' + port + '/api/guest/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ig: IG2, lang: 'en', device: 'suite-despertar-2' }),
    }).catch(() => null);
    const fin = await getPend();
    ok(!(fin.json.pendientes || []).some((p) => p.ig_username === IG2), 'C7 la entrada sin marca no aparece en pendientes');
    eq((fin.json.pendientes || []).filter((p) => p.ig_username === IG).length, 1, 'C8 la entrada marcada sigue apareciendo UNA sola vez (sin duplicados)');
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
  console.log(`\n== DESPERTAR-INMEDIATO: ${pass} ok · ${fail} mal ==`);
  if (failures.length) { console.log('fallas:', failures.join(' | ')); process.exit(1); }
})();
