// test-lote-techo-3-minutos.js — LOTE v851 EL PEDIDO DE LAS 12:13 SIGUE SIN NADA
// + REGLA DURA DE 3 MINUTOS.
// Valentino 9/11 12:59: el posteo de fitness de las 12:13 no existe 46 min
// después (56 posteos, último 09:41). Regla dura: un posteo nuevo (imagen /
// carrusel + caption) tiene que estar listo en 3 minutos como máximo desde que
// el cliente lo pide; si no se puede, Posty avisa con el estado real y ofrece
// reintentar — nunca silencio, nunca un pedido colgado. El video del exprés
// tiene su propio tiempo de edición; esta regla es para imagen/carrusel.
// Diagnóstico (ver STATUS): el cerebro devolvió solo texto en el turno 553,
// sin bloque de acción — nunca arrancó nada. Cola DESCARTADA (nada se inició),
// tope de IA DESCARTADO (la respuesta 553 no fue MSG_CAP y el gasto de
// noviembre es USD 7,51 contra un tope diario global de USD 100), clave
// DESCARTADA (openai:true y generaciones exitosas ese día). La red de v847
// cubre el «sin bloque»; este lote pone el TECHO y la DETECCIÓN:
//  - runner: timeout 4 min → 3 min (el trabajo salda 'tiempo_agotado' a los 3:00);
//  - barrido: de solo-arranque y >10 min → cada 30 s y >3 min (cubre huérfanos
//    por reinicio, runner muerto y generación colgada);
//  - transiciones con guarda: settleFallo y éxito solo si el trabajo sigue
//    'creando' (y en el éxito, updated_at igual al de arranque — el reintento
//    reabre la corrida y el runner viejo no puede saldar la corrida nueva).
// Lote SOLO servidor (app.js sin tocar: el poller ya rinde el 'fallo' con
// [Reintentar]; ?v=582 queda SIN USAR; M78 N/A como Juli v845).
// Parte A: estática. Parte B: barrido + guardas en vm con SQLite real en
// memoria. Parte C: boot real (reintentar→settled medido; barrido por intervalo
// con reloj de pared; barrido de arranque tras reinicio).
// Sin clave OpenAI en el boot: el runner salda 'fallo'/'sin_clave'. El éxito
// con imagen real + el punta-a-punta del chat con cerebro real lo verifica el
// preparador con el surrogado (el POST del chat sin clave vuelve temprano con
// «se me cortó la conexión» ANTES de la red — por diseño, mensaje honesto).
// Uso: node test-lote-techo-3-minutos.js — sale 0 si todo pasa.
// Puerto: 34595 (v847 usa 34593; ads-pantalla usa 18754 fijo).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const DIR = __dirname;
let pass = 0, fail = 0;
const fails = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ❌ ${name}${extra ? ' — ' + String(extra).slice(0, 400) : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srvSrc = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const crypto = require('crypto');
const appMd5 = crypto.createHash('md5').update(appSrc).digest('hex');

function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return null;
  let d = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
function fnBody(src, sig) {
  const f = fnFrom(src, sig);
  return f;
}

// ---------- Parte A: estática ----------
function parteA() {
  console.log('— A) estática: techo de 3 min y guardas —');
  check('A0 BUILD v851 en server.js', srvSrc.includes("const BUILD_ID = '20261105-v851';"));
  check('A1 index.html sigue en ?v=581 (?v=582 SIN USAR: lote solo servidor)', idxSrc.includes('app.js?v=581') && !idxSrc.includes('app.js?v=582'));
  check('A2 app.js sin tocar (md5 = v850 9584a1b6…)', appMd5 === '9584a1b6b53a60a2be7f73151c251eb1', appMd5);
  check('A3 styles?v= sin cambio (20261225)', idxSrc.includes('styles.css?v=20261225'));
  const runner = fnBody(srvSrc, 'async function pzTrabajoChatImagenRun(jobId) {');
  check('A4 runner existe', !!runner);
  check('A5 timeout del runner es 3 min', !!runner && runner.includes('3 * 60 * 1000'), runner ? runner.slice(runner.indexOf('timeoutP'), runner.indexOf('timeoutP') + 140) : 'sin runner');
  check('A6 ningún 4 * 60 * 1000 en todo server.js', !srvSrc.includes('4 * 60 * 1000'));
  const sweepFn = fnBody(srvSrc, 'function pzTrabajoMarcarVencidos(db) {');
  check('A7 barrido existe', !!sweepFn);
  check('A8 barrido usa umbral de 3 minutos', !!sweepFn && sweepFn.includes("'-3 minutes'"), sweepFn ? sweepFn.slice(0, 200) : 'sin barrido');
  check('A9 ningún -10 minutes en todo server.js', !srvSrc.includes('-10 minutes'));
  check('A10 el barrido corre cada 30 s (setInterval)', /setInterval\(\(\) => \{ try \{ pzTrabajoMarcarVencidos\(db\); \} catch \(e\) \{ console\.error\('\[trabajo\] sweep:', e\.message\); \} \}, 30 \* 1000\)/.test(srvSrc));
  check('A11 el barrido de arranque sigue (en app.listen)', srvSrc.includes("try { pzTrabajoMarcarVencidos(db); } catch (e) { console.error('[trabajo] sweep:', e.message); }"));
  check('A12 settleFallo con guarda estado=creando', !!runner && runner.includes("SET estado='fallo', error=?, updated_at=datetime('now') WHERE id=? AND estado='creando'"));
  check('A13 settleFallo no duplica el mensaje si ya saldó (!up.changes → return)', !!runner && /if \(!up \|\| !up\.changes\) return;/.test(runner));
  check('A14 éxito con guarda estado + updated_at', !!runner && runner.includes("SET estado='lista', post_id=?, updated_at=datetime('now') WHERE id=? AND estado='creando' AND updated_at=?"));
  check('A15 el runner captura updated_at al arrancar (token de corrida)', !!runner && runner.includes('const runUpdatedAt = job.updated_at'));
  check('A16 sin mensaje final ni push si otro ya saldó (upOk.changes)', !!runner && /if \(!upOk \|\| !upOk\.changes\) \{ console\.log\(`\[trabajo\] run \$\{job\.id\}: ya saldado/.test(runner));
  check('A17 texto de tiempo_agotado sin cambio (honesto, sin jerga)', srvSrc.includes("tardó demasiado y lo corté para no dejarte esperando"));
  check('A18 la tabla trabajos no cambió (mismas columnas que v847)', dbSrc.includes('CREATE TABLE IF NOT EXISTS trabajos') && dbSrc.includes("updated_at TEXT NOT NULL DEFAULT (datetime('now'))"));
  check('A19 dedupe de la red sigue en 3 min (sin cambio)', srvSrc.includes("AND datetime(created_at) > datetime('now', '-3 minutes')"));
  check('A20 reintentar sigue con vencido a 5 min (sin cambio)', srvSrc.includes('> 5 * 60 * 1000'));
  check('A21 comentario del techo presente (regla 3 min documentada)', srvSrc.includes('REGLA DURA 3 MIN'));
}

// ---------- Parte B: barrido + guardas en vm (SQLite real en memoria) ----------
function mkMemDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE trabajos (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tipo TEXT NOT NULL DEFAULT 'chat_imagen', estado TEXT NOT NULL DEFAULT 'creando', post_id INTEGER, mensaje_id INTEGER, mensaje_final_id INTEGER, titulo TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', estimado_seg INTEGER NOT NULL DEFAULT 60, error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))); CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL);`);
  return db;
}
function parteB() {
  console.log('— B) barrido + guardas: vm con SQLite real —');
  const sweepSrc = fnBody(srvSrc, 'function pzTrabajoMarcarVencidos(db) {');
  const falloSrc = fnBody(srvSrc, 'function pzTrabajoFalloAmable(kind, en) {');
  check('B0 se extraen barrido y textos de fallo', !!sweepSrc && !!falloSrc);
  if (!sweepSrc || !falloSrc) return;
  const runSweep = (db) => {
    const ctx = { console, db, langOfUser: () => 'es' };
    vm.createContext(ctx);
    vm.runInContext(falloSrc + '\n' + sweepSrc + '\nthis.__sweep = pzTrabajoMarcarVencidos;', ctx);
    vm.runInContext('__sweep(db);', ctx);
  };
  // siembra directa con SQL (created_at/updated_at backdateados)
  const seed = (db, uid, estado, ageMin, extra) => {
    const r = db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, titulo, caption, estimado_seg, error, created_at, updated_at) VALUES (?, 'chat_imagen', ?, ?, ?, 60, '', datetime('now', '-${ageMin} minutes'), datetime('now', '-${ageMin} minutes'))`).run(uid, estado, (extra && extra.titulo) || 'T', (extra && extra.caption) || 'C');
    return Number(r.lastInsertRowid);
  };
  const row = (db, id) => db.prepare('SELECT id, estado, error, mensaje_final_id FROM trabajos WHERE id = ?').get(id);
  const msgs = (db, uid) => db.prepare('SELECT id, text FROM chat_messages WHERE user_id = ? ORDER BY id').all(uid);

  { // B1–B4: el barrido salda >3 min, respeta <3 min, es idempotente
    const db = mkMemDb();
    const viejo = seed(db, 12, 'creando', 3.1, { titulo: 'Viejo 3:06' });
    const joven = seed(db, 12, 'creando', 2.9, { titulo: 'Joven 2:54' });
    const muyViejo = seed(db, 12, 'creando', 15, { titulo: 'Muy viejo 15:00' });
    const lista = seed(db, 12, 'lista', 20, { titulo: 'Ya lista' });
    runSweep(db);
    const rV = row(db, viejo), rJ = row(db, joven), rM = row(db, muyViejo), rL = row(db, lista);
    check('B1 el barrido salda el creando de 3:06 como fallo/tiempo_agotado', rV.estado === 'fallo' && rV.error === 'tiempo_agotado', JSON.stringify(rV));
    check('B2 el creando de 2:54 queda intacto (bajo el techo)', rJ.estado === 'creando', JSON.stringify(rJ));
    check('B3 el creando de 15 min (huérfano de reinicio) también se salda', rM.estado === 'fallo' && rM.error === 'tiempo_agotado', JSON.stringify(rM));
    check('B4 el trabajo ya lista no se toca', rL.estado === 'lista', JSON.stringify(rL));
    const m12 = msgs(db, 12);
    check('B5 el barrido avisa en el hilo con [trabajo-fallo] + motivo honesto', m12.some((m) => m.text.includes(`[trabajo-fallo:${viejo}]`)) && m12.some((m) => m.text.includes(`[trabajo-fallo:${muyViejo}]`)) && m12.every((m) => /tardó demasiado y lo corté para no dejarte esperando/.test(m.text)), JSON.stringify(m12.map((m) => m.text)));
    check('B6 el trabajo saldado guarda el id del mensaje final', Number(rV.mensaje_final_id) > 0 && Number(rM.mensaje_final_id) > 0, JSON.stringify({ v: rV, m: rM }));
    const nAntes = msgs(db, 12).length;
    runSweep(db); // segunda pasada: idempotente
    check('B7 segunda pasada del barrido: sin mensaje duplicado', msgs(db, 12).length === nAntes, `antes=${nAntes} después=${msgs(db, 12).length}`);
    db.close();
  }
  { // B8–B10: semántica de las guardas SQL (las mismas del runner)
    const db = mkMemDb();
    const id = seed(db, 12, 'creando', 0, { titulo: 'Guardas' });
    const t0 = db.prepare('SELECT updated_at FROM trabajos WHERE id = ?').get(id).updated_at;
    // éxito con updated_at viejo (barrido o reintento en el medio) → 0 cambios
    const stale = db.prepare("UPDATE trabajos SET estado='lista', post_id=?, updated_at=datetime('now') WHERE id=? AND estado='creando' AND updated_at=?").run(99, id, '2000-01-01 00:00:00');
    check('B8 éxito con updated_at viejo: 0 cambios (el runner viejo no salda)', stale.changes === 0, JSON.stringify(stale));
    check('B8b el trabajo sigue creando tras el intento viejo', row(db, id).estado === 'creando');
    // éxito con el token vigente → 1 cambio; repetir → 0
    const ok = db.prepare("UPDATE trabajos SET estado='lista', post_id=?, updated_at=datetime('now') WHERE id=? AND estado='creando' AND updated_at=?").run(99, id, t0);
    check('B9 éxito con el token vigente: 1 cambio', ok.changes === 1, JSON.stringify(ok));
    const again = db.prepare("UPDATE trabajos SET estado='lista', post_id=?, updated_at=datetime('now') WHERE id=? AND estado='creando' AND updated_at=?").run(99, id, t0);
    check('B10 segundo éxito sobre lo ya saldado: 0 cambios (sin doble mensaje)', again.changes === 0, JSON.stringify(again));
    // settleFallo con guarda: primero 1 cambio, después 0
    const id2 = seed(db, 12, 'creando', 0, { titulo: 'FalloGuard' });
    const f1 = db.prepare("UPDATE trabajos SET estado='fallo', error=?, updated_at=datetime('now') WHERE id=? AND estado='creando'").run('tiempo_agotado', id2);
    const f2 = db.prepare("UPDATE trabajos SET estado='fallo', error=?, updated_at=datetime('now') WHERE id=? AND estado='creando'").run('tiempo_agotado', id2);
    check('B11 settleFallo: primero 1 cambio, segundo 0 (sin duplicar)', f1.changes === 1 && f2.changes === 0, JSON.stringify({ f1, f2 }));
    db.close();
  }
  { // B12: el barrido es global (cubre cualquier usuario, no solo el 12)
    const db = mkMemDb();
    const otro = seed(db, 84, 'creando', 5, { titulo: 'Otro usuario' });
    runSweep(db);
    check('B12 el barrido salda el creando viejo de otro usuario también', row(db, otro).estado === 'fallo', JSON.stringify(row(db, otro)));
    db.close();
  }
}

// ---------- Parte C: boot real ----------
const PORT = 34595;
const TEST_KEY = 'boot-test-key-techo-3min';
const ADMIN_TOKEN = (() => { try { const m = fs.readFileSync(path.join(DIR, 'test-lote-chat-clicks.js'), 'utf8').match(/const ADMIN_TOKEN = '([^']+)';/); return m ? m[1] : ''; } catch (e) { return ''; } })();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'techo-3min-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
fs.writeFileSync(path.join(mediaDir, 'f1.png'), PNG_1X1);

async function reqJson(method, p, body, cookie) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  const setCookie = r.headers.get('set-cookie');
  return { status: r.status, json: j, setCookie };
}
function seedDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      try { fn(db); return; }
      catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
    }
  } finally { try { db.close(); } catch (e) {} }
}
function readDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try { return fn(db); }
  finally { try { db.close(); } catch (e) {} }
}
function trabajoRow(dbPath, id) {
  return readDb(dbPath, (db) => db.prepare('SELECT id, user_id, tipo, estado, post_id, mensaje_id, mensaje_final_id, error FROM trabajos WHERE id = ?').get(id));
}
function chatMsgs(dbPath, uid) {
  return readDb(dbPath, (db) => db.prepare('SELECT id, role, text FROM chat_messages WHERE user_id = ? ORDER BY id').all(uid));
}
async function bootServer() {
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: mediaDir, ADMIN_TOKEN,
    NODE_PATH: nodeModules, OPENAI_API_KEY: '', TRIAL_TEST_KEY: TEST_KEY,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  let up = false;
  for (let i = 0; i < 45; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
    await sleep(1000);
  }
  return { child, up, out: () => out };
}
async function killServer(child) {
  try { child.kill('SIGTERM'); } catch (e) {}
  await sleep(800);
  try { if (child.exitCode === null) child.kill('SIGKILL'); } catch (e) {}
  await sleep(300);
}

async function parteC() {
  console.log('— C) boot real: reintentar medido, barrido por intervalo, barrido de arranque —');
  const dbPath = path.join(tmpDir, 'posta.db');
  const b1 = await bootServer();
  try {
    check('C0 el servidor levanta con el lote', b1.up);
    if (!b1.up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(b1.out().split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await reqJson('GET', '/api/version');
    check('C0b /api/version trae el BUILD v851', ver.status === 200 && ver.json && ver.json.build === '20261105-v851', JSON.stringify(ver.json));
    check('C0c la tabla trabajos existe en la DB del boot', readDb(dbPath, (db) => { try { db.prepare('SELECT COUNT(*) c FROM trabajos').get(); return true; } catch (e) { return false; } }));

    const join = await reqJson('POST', '/api/trial/chat-onboarding?test_key=' + TEST_KEY,
      { kind: 'join', ig: 'techo-3min-test', device: 'test-device-techo-3min' });
    check('C0d join del invitado ok', join.status === 200 && join.json && join.json.ok === true && join.json.user_id > 0, JSON.stringify(join.json));
    if (!join.json || !join.json.user_id) throw new Error('sin join');
    const uid = join.json.user_id;
    const cookie = join.setCookie ? String(join.setCookie).split(';')[0] : '';

    let d1 = 0, tFallo = 0, tOtro = 0, otroUid = 0;
    seedDb(dbPath, (db) => {
      db.prepare('UPDATE users SET is_guest = 0 WHERE id = ?').run(uid);
      otroUid = Number(db.prepare(`INSERT INTO users (email, password_hash) VALUES (?,?)`).run('otro@test.local', 'x').lastInsertRowid);
      d1 = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid, '/media/f1.png', 'Posteo de fitness para hoy', '', null, 'draft', 'image', 0).lastInsertRowid);
      tFallo = Number(db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, post_id, titulo, caption, estimado_seg, error) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid, 'chat_imagen', 'fallo', d1, 'Posteo de fitness', 'Posteo de fitness para hoy', 60, 'fallo').lastInsertRowid);
      tOtro = Number(db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, post_id, titulo, caption, estimado_seg) VALUES (?,?,?,?,?,?,?)`)
        .run(otroUid, 'chat_imagen', 'fallo', null, 'Ajeno', 'Ajeno', 60).lastInsertRowid);
    });
    check('C0e semilla ok (borrador + 2 trabajos)', d1 > 0 && tFallo > 0 && tOtro > 0, `d=${d1} t=${tFallo},${tOtro}`);

    const g1 = await reqJson('GET', `/api/trabajos/${tFallo}`, null, cookie);
    check('C1 GET del trabajo propio responde 200', g1.status === 200 && g1.json && g1.json.ok === true, JSON.stringify(g1.json));
    const g2 = await reqJson('GET', `/api/trabajos/${tOtro}`, null, cookie);
    check('C2 GET del trabajo ajeno es 403', g2.status === 403, JSON.stringify(g2.json));

    // C3: reintentar → creando → el runner salda rápido sin clave; se mide
    // el tiempo de punta a punta (tiene que ser << 3 min).
    const t0 = Date.now();
    const rt = await reqJson('POST', `/api/trabajos/${tFallo}/reintentar`, {}, cookie);
    check('C3 POST reintentar responde 200 con estado creando', rt.status === 200 && rt.json && rt.json.ok === true && rt.json.trabajo && rt.json.trabajo.estado === 'creando', JSON.stringify(rt.json));
    let settled = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      settled = trabajoRow(dbPath, tFallo);
      if (settled && settled.estado === 'fallo') break;
    }
    const secsReintento = Math.round((Date.now() - t0) / 1000);
    check(`C4 sin clave, el runner salda el trabajo como fallo (medido: ${secsReintento}s, techo 180s)`, settled && settled.estado === 'fallo' && secsReintento < 180, JSON.stringify(settled));
    check('C5 el error es sin_clave (o fallo genérico, nunca un cuelgue)', settled && (settled.error === 'sin_clave' || settled.error === 'fallo'), JSON.stringify(settled));
    const msgs5 = chatMsgs(dbPath, uid);
    check('C6 el fallo avisa en el hilo con [trabajo-fallo] + motivo honesto', msgs5.some((m) => m.text.includes('[trabajo-fallo:')) && msgs5.some((m) => /no pude generar la imagen/.test(m.text)), JSON.stringify(msgs5.map((m) => m.text.slice(0, 90))));

    // C7: BARRIDO POR INTERVALO con reloj de pared — un creando de 3:05
    // sembrado con el servidor ARRIBA se salda solo, sin reinicio.
    let tColgado = 0;
    seedDb(dbPath, (db) => {
      tColgado = Number(db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, titulo, caption, estimado_seg, created_at, updated_at) VALUES (?,?,?,?,?,?, datetime('now','-3 minutes','-10 seconds'), datetime('now','-3 minutes','-10 seconds'))`)
        .run(uid, 'chat_imagen', 'creando', 'Colgado 3:10', 'Caption colgada', 60).lastInsertRowid);
    });
    check('C7a semilla del colgado ok', tColgado > 0, `t=${tColgado}`);
    const t1 = Date.now();
    let colgado = null;
    for (let i = 0; i < 45; i++) {
      await sleep(2000);
      colgado = trabajoRow(dbPath, tColgado);
      if (colgado && colgado.estado === 'fallo') break;
    }
    const secsSweep = Math.round((Date.now() - t1) / 1000);
    check(`C7b el barrido por intervalo salda el colgado sin reinicio (medido: ${secsSweep}s desde la siembra)`, colgado && colgado.estado === 'fallo' && colgado.error === 'tiempo_agotado', JSON.stringify(colgado));
    const msgs7 = chatMsgs(dbPath, uid);
    check('C7c el barrido avisó en el hilo con [trabajo-fallo] del colgado', msgs7.some((m) => m.text.includes(`[trabajo-fallo:${tColgado}]`)), JSON.stringify(msgs7.map((m) => m.text.slice(0, 90))));
  } catch (e) {
    console.log('error de la parte C (boot 1):', e.message);
    fail++;
  } finally {
    await killServer(b1.child);
  }

  // --- Boot 2: el barrido de arranque sigue saldando el creando viejo ---
  try {
    seedDb(dbPath, (db) => {
      db.prepare(`INSERT INTO trabajos (user_id, tipo, estado, titulo, caption, estimado_seg, created_at, updated_at) VALUES (1, 'chat_imagen', 'creando', 'Trabajo viejo', 'Caption vieja', 60, datetime('now','-15 minutes'), datetime('now','-15 minutes'))`).run();
    });
    const viejoId = readDb(dbPath, (db) => db.prepare(`SELECT id FROM trabajos WHERE titulo = 'Trabajo viejo'`).get().id);
    const b2 = await bootServer();
    try {
      check('C8 el segundo boot levanta', b2.up);
      if (!b2.up) {
        console.log('--- salida del servidor (últimas 30 líneas) ---');
        console.log(b2.out().split('\n').slice(-30).join('\n'));
        throw new Error('no levanta el boot 2');
      }
      const row = trabajoRow(dbPath, viejoId);
      check('C8b el barrido de arranque saldó el creando viejo como fallo/tiempo_agotado', row && row.estado === 'fallo' && row.error === 'tiempo_agotado', JSON.stringify(row));
      const msgs8 = chatMsgs(dbPath, 1);
      check('C8c el barrido avisó en el hilo con [trabajo-fallo]', msgs8.some((m) => m.text.includes(`[trabajo-fallo:${viejoId}]`)), JSON.stringify(msgs8.map((m) => m.text.slice(0, 100))));
    } finally {
      await killServer(b2.child);
    }
  } catch (e) {
    console.log('error de la parte C (boot 2):', e.message);
    fail++;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  parteA();
  parteB();
  await parteC();
  console.log(`\ntest-lote-techo-3-minutos: ${pass} ok, ${fail} fallos${fails.length ? ' — ' + fails.join(' | ') : ''}`);
  process.exit(fail ? 1 : 0);
})();
