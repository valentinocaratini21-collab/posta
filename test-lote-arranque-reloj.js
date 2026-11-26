'use strict';
// test-lote-arranque-reloj.js — LOTE ARRANQUE-RELOJ-OPERADOR.
// La ruta admin POST /api/admin/trial/arrancar-reloj arranca el reloj de
// prueba de una cuenta nacida «pendiente de conexión» (trial_started_at=0)
// con la misma primitiva que usa la conexión de Instagram
// (guestTrial.startTrialOnConnect): arranque = ahora, fin = ahora + 3 días.
// Sin esta vía, un invitado de la puerta del operador nunca vence y el
// cruce del paywall (modal + panel «Activá tu plan» + bloqueo 402) no se
// puede verificar en vivo.
// Verifica: auth (403 sin token), 400 sin user_id, 404 inexistente,
// 409 si no está en trial, idempotencia (reloj ya andando no se toca),
// arranque exacto de +3 días sobre el pendiente y segunda llamada sin
// efecto. Boot real con DATA_DIR aislada. Puerto 35177.
// Uso: node test-lote-arranque-reloj.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const DIR = __dirname;
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;

// ---------- A. Estáticos ----------
t(cnt(srv, "app.post('/api/admin/trial/arrancar-reloj', requireAdminToken") === 1, 'server: ruta arrancar-reloj presente ×1 con requireAdminToken');
t(srv.includes('guestTrial.startTrialOnConnect(db, uid, TRIAL_DAYS)'), 'server: la ruta usa la primitiva de la conexión (startTrialOnConnect)');
t(cnt(srv, "app.post('/api/admin/extend-trial', requireAdminToken") === 1, 'server: extend-trial sigue presente sin tocar');
try { execSync('node --check server.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'server.js: node --check OK'); } catch (e) { t(false, 'server.js: node --check OK'); }

// ---------- B. Boot real ----------
const PORT = 35177;
const ADMIN_TOKEN = ['test', 'admin', 'token', 'arranque'].join('-');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arranque-reloj-boot-'));
const mediaDir = path.join(tmpDir, 'media');
fs.mkdirSync(mediaDir, { recursive: true });
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const { DatabaseSync } = require('node:sqlite');

async function reqJson(method, p, body, timeoutMs) {
  const url = `http://127.0.0.1:${PORT}${p}`;
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs || 30000) });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
function seedDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    for (let i = 0; i < 10; i++) {
      try { return fn(db); }
      catch (e) { if (/BUSY|LOCKED/i.test(String(e.message || '')) && i < 9) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); continue; } throw e; }
    }
  } finally { try { db.close(); } catch (e) {} }
}

(async () => {
  console.log('— B) boot real: arrancar el reloj por API admin —');
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN, NODE_PATH: nodeModules, OPENAI_API_KEY: '' };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    t(up, 'boot: el servidor levanta en ' + PORT);
    if (!up) { console.log('--- salida del servidor (últimas 30 líneas) ---'); console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const dbPath = path.join(tmpDir, 'posta.db');
    t(fs.existsSync(dbPath), 'boot: la DB existe en el DATA_DIR temporal');

    const now = Date.now();
    const ids = seedDb(dbPath, (db) => {
      const ins = (email, planStatus, startedAt, endsAt, isGuest) => {
        const r = db.prepare(`INSERT INTO users (email, password_hash, plan_status, trial_ends_at, trial_started_at, is_guest) VALUES (?, '', ?, ?, ?, ?)`)
          .run(email, planStatus, endsAt, startedAt, isGuest);
        return Number(r.lastInsertRowid);
      };
      return {
        pendiente: ins('guest-pend@guest.invalid', 'trial', 0, now + 3 * DAY, 1),
        andando: ins('guest-andando@guest.invalid', 'trial', now - DAY, now + 2 * DAY, 1),
        activa: ins('activa@test.com', 'active', 0, now + 3 * DAY, 0),
      };
    });
    const readUser = (uid) => seedDb(dbPath, (db) => db.prepare('SELECT plan_status, trial_started_at, trial_ends_at FROM users WHERE id = ?').get(uid));

    const Q = `?token=${ADMIN_TOKEN}`;
    // Auth y validaciones.
    const noTok = await reqJson('POST', '/api/admin/trial/arrancar-reloj', { user_id: ids.pendiente });
    t(noTok.status === 403, 'sin token → 403', JSON.stringify(noTok));
    const noUid = await reqJson('POST', '/api/admin/trial/arrancar-reloj' + Q, {});
    t(noUid.status === 400, 'sin user_id → 400', JSON.stringify(noUid));
    const noUser = await reqJson('POST', '/api/admin/trial/arrancar-reloj' + Q, { user_id: 999999 });
    t(noUser.status === 404, 'usuario inexistente → 404', JSON.stringify(noUser));
    const noTrial = await reqJson('POST', '/api/admin/trial/arrancar-reloj' + Q, { user_id: ids.activa });
    t(noTrial.status === 409 && noTrial.json && noTrial.json.error === 'no_es_trial', 'cuenta activa → 409 no_es_trial', JSON.stringify(noTrial));

    // Reloj ya andando: no se toca.
    const before2 = readUser(ids.andando);
    const yaAndando = await reqJson('POST', '/api/admin/trial/arrancar-reloj' + Q, { user_id: ids.andando });
    t(yaAndando.status === 200 && yaAndando.json && yaAndando.json.arranco === false, 'reloj andando → arranco=false', JSON.stringify(yaAndando));
    const after2 = readUser(ids.andando);
    t(Number(after2.trial_started_at) === Number(before2.trial_started_at) && Number(after2.trial_ends_at) === Number(before2.trial_ends_at), 'reloj andando: la fila no cambió');

    // El arranque del pendiente.
    const t0 = Date.now();
    const arr = await reqJson('POST', '/api/admin/trial/arrancar-reloj' + Q, { user_id: ids.pendiente });
    const t1 = Date.now();
    t(arr.status === 200 && arr.json && arr.json.arranco === true, 'pendiente → arranco=true', JSON.stringify(arr));
    const row1 = readUser(ids.pendiente);
    const started = Number(row1.trial_started_at), ends = Number(row1.trial_ends_at);
    t(started >= t0 && started <= t1, 'trial_started_at = ahora (dentro de la ventana de la llamada)', `started=${started} ventana=${t0}..${t1}`);
    t(ends - started === 3 * DAY, 'trial_ends_at = arranque + 3 días exactos', `diff=${ends - started}`);

    // Idempotencia: la segunda llamada no mueve el reloj.
    const again = await reqJson('POST', '/api/admin/trial/arrancar-reloj' + Q, { user_id: ids.pendiente });
    t(again.status === 200 && again.json && again.json.arranco === false, 'segunda llamada → arranco=false', JSON.stringify(again));
    const row2 = readUser(ids.pendiente);
    t(Number(row2.trial_started_at) === started && Number(row2.trial_ends_at) === ends, 'segunda llamada: el reloj no se movió');
  } finally {
    kill();
    await sleep(500);
  }
  console.log(`\narranque-reloj: ${ok} ok, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
