'use strict';
// test-lote-corrida-autocompleta.js — LOTE CORRIDA-AUTOCOMPLETA.
// Orden del dueño (27/11, tras la tanda 2 trabada ~6 h): «Soluciona
// esto para que no vuelva a suceder nunca mas». La puerta del operador
// creaba el invitado SOLO con el plan; importar la semana y arrancar
// el reloj eran dos pasos manuales posteriores que se olvidaron dos
// veces. El lote: (a) completarInvitadoOperador cierra al invitado
// (importa + arranca el reloj) en el mismo acto en pieza-mano e
// importar-semana; (b) un barrido cada 10 min completa a todo
// invitado del operador con más de 30 min a mitad de camino, con
// registro en su actividad; (c) sin semana en caché, el invitado es
// un problema VISIBLE en el conserje (corrida_incompleta). La firma
// de la puerta es la marca de línea a mano: el invitado orgánico no
// se toca (su reloj arranca con su conexión, como siempre).
// Boot real con DATA_DIR aislada. Puerto 35179.
// Uso: node test-lote-corrida-autocompleta.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const DIR = __dirname;
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const cv = fs.readFileSync(path.join(DIR, 'conserje-vista.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ---------- A. Estáticos ----------
t(cnt(srv, 'function completarInvitadoOperador(userId, via)') === 1, 'server: completarInvitadoOperador presente ×1');
t(srv.includes("out.motivo = 'sin-marca'"), 'server: la firma de la puerta es la marca (orgánico intocable)');
t(srv.includes("completarInvitadoOperador(uid, 'pieza-mano')"), 'server: pieza-mano completa en el mismo acto');
t(srv.includes("completarInvitadoOperador(uid, 'importar-semana')"), 'server: importar-semana arranca el reloj en el mismo acto');
t(cnt(srv, 'function barridoCorridaAutocompleta()') === 1, 'server: el barrido autocurativo presente ×1');
t(srv.includes("app.post('/api/admin/trial/barrido-autocompleta', requireAdminToken"), 'server: ruta admin del barrido con requireAdminToken');
t(srv.includes('10 * 60 * 1000'), 'server: el barrido corre cada 10 minutos');
t(srv.includes("evTrack(uid, 'corrida_autocompletada'"), 'server: la cura queda en la actividad del invitado');
t(cv.includes("tipo: 'corrida_incompleta'"), 'conserje-vista: el problema corrida_incompleta existe');
t(srv.includes("const BUILD_ID = '20261105-v1384';"), 'server: BUILD_ID v1384');
try { execSync('node --check server.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'server.js: node --check OK'); } catch (e) { t(false, 'server.js: node --check OK'); }
try { execSync('node --check conserje-vista.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'conserje-vista.js: node --check OK'); } catch (e) { t(false, 'conserje-vista.js: node --check OK'); }

// ---------- B. Boot real ----------
const PORT = 35179;
const ADMIN_TOKEN = 'suite-corrida-t0ken';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corrida-autocompleta-boot-'));
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
const Q = '?token=' + ADMIN_TOKEN;

(async () => {
  console.log('— B) boot real: el invitado nace completo —');
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
    if (!up) { console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const dbPath = path.join(tmpDir, 'posta.db');
    const now = Date.now();

    const mkGuest = (ig, creadoMs, conMarca, payload) => seedDb(dbPath, (db) => {
      // La tabla de marcas nace perezosa (ensureSchema al primer uso):
      // la suite la crea con el mismo esquema antes de sembrar.
      try { db.exec(`CREATE TABLE IF NOT EXISTS trial_linea_mano (cache_key TEXT PRIMARY KEY, ig TEXT NOT NULL DEFAULT '', domain TEXT NOT NULL DEFAULT '', user_id INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'activa', creada_at INTEGER NOT NULL DEFAULT 0, aviso_entrada_at INTEGER NOT NULL DEFAULT 0, aviso_dia2_at INTEGER NOT NULL DEFAULT 0)`); } catch (e) {}
      const r = db.prepare(`INSERT INTO users (email, password_hash, plan_status, trial_ends_at, trial_started_at, is_guest, guest_ig, created_at) VALUES (?, '', 'trial', ?, 0, 1, ?, ?)`)
        .run(ig + '@guest.invalid', creadoMs + 3 * DAY, ig, creadoMs);
      const uid = Number(r.lastInsertRowid);
      db.prepare('INSERT INTO profiles (user_id, business_name, ig_username, category) VALUES (?, ?, ?, ?)').run(uid, 'Negocio ' + ig, ig, 'otro');
      if (payload) db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?, ?, ?)').run(ig, JSON.stringify(payload), creadoMs);
      if (conMarca) db.prepare(`INSERT INTO trial_linea_mano (cache_key, ig, domain, user_id, estado, creada_at) VALUES (?, ?, '', ?, 'activa', ?)`).run(ig, ig, uid, creadoMs);
      return uid;
    });
    const basePayload = (biz) => ({ engine: 25, business: biz, category: 'otro', posts: [{ armando: true, headline: 'Día 1' }, { armando: true, headline: 'Día 2' }, { armando: true, headline: 'Día 3' }] });
    const readUser = (uid) => seedDb(dbPath, (db) => db.prepare('SELECT trial_started_at FROM users WHERE id = ?').get(uid));
    const nPosts = (uid) => seedDb(dbPath, (db) => db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(uid).c);

    // ===== A · atomicidad en pieza-mano (la corrida, sin pasos extra) =====
    const uidA = mkGuest('corrida.a', now, true, basePayload('Corrida A'));
    const pm1 = await reqJson('POST', '/api/admin/trial/pieza-mano' + Q, { ig: 'corrida.a', dia: 1, media: PNG, caption: 'Caption día uno', hashtags: '#uno' });
    t(pm1.status === 200 && pm1.json && pm1.json.ok === true, 'A1 pieza-mano día 1 responde ok', JSON.stringify(pm1.json).slice(0, 200));
    t(pm1.json && pm1.json.completado && pm1.json.completado.estado === 'completo', 'A2 la misma carga devuelve completado.estado=completo', JSON.stringify(pm1.json && pm1.json.completado));
    t(nPosts(uidA) >= 1, 'A3 tras la primera carga ya hay posteos reales (sin importar-semana)', 'posts=' + nPosts(uidA));
    t(Number(readUser(uidA).trial_started_at) > 0, 'A4 el reloj arrancó en el mismo acto (sin arrancar-reloj)');
    const pm2 = await reqJson('POST', '/api/admin/trial/pieza-mano' + Q, { ig: 'corrida.a', dia: 2, media: PNG, caption: 'Caption día dos', hashtags: '#dos' });
    const pm3 = await reqJson('POST', '/api/admin/trial/pieza-mano' + Q, { ig: 'corrida.a', dia: 3, media: PNG, caption: 'Caption día tres', hashtags: '#tres' });
    t(pm2.status === 200 && pm3.status === 200, 'A5 las cargas de los días 2 y 3 responden ok');
    t(nPosts(uidA) >= 3, 'A6 el invitado termina con sus 3 posteos reales', 'posts=' + nPosts(uidA));

    // ===== A2 · importar-semana también arranca el reloj =====
    const uidA2 = mkGuest('corrida.a2', now, true, basePayload('Corrida A2'));
    seedDb(dbPath, (db) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, status, media_type, source) VALUES (?, '/media/semilla.jpg', 'Pieza', 'scheduled', 'image', 'trial')`).run(uidA2));
    const imp = await reqJson('POST', '/api/admin/trial/importar-semana' + Q, { user_id: uidA2 });
    t(imp.status === 200 && imp.json && imp.json.ok === true, 'A2-1 importar-semana (ya importada) responde ok', JSON.stringify(imp.json).slice(0, 200));
    t(Number(readUser(uidA2).trial_started_at) > 0, 'A2-2 importar dejó el reloj arrancado en el mismo acto');

    // ===== B · el barrido cura al sembrado «a la antigua» =====
    const payloadA = seedDb(dbPath, (db) => { const row = db.prepare('SELECT payload FROM trial_cache WHERE ig = ?').get('corrida.a'); return row ? JSON.parse(row.payload) : null; });
    t(!!payloadA && Array.isArray(payloadA.posts) && payloadA.posts.some((p) => p && p.image), 'B0 el payload de A (forma real de pieza-mano) trae piezas con medio');
    const uidB = mkGuest('corrida.b', now - 2 * 3600000, true, payloadA);
    t(nPosts(uidB) === 0 && Number(readUser(uidB).trial_started_at) === 0, 'B1 B nace a la antigua: 0 posteos, reloj pendiente');
    const bar1 = await reqJson('POST', '/api/admin/trial/barrido-autocompleta' + Q, {});
    t(bar1.status === 200 && bar1.json && bar1.json.ok === true, 'B2 el barrido responde ok', JSON.stringify(bar1.json).slice(0, 250));
    t(nPosts(uidB) === 3, 'B3 el barrido importó las 3 piezas de B', 'posts=' + nPosts(uidB));
    t(Number(readUser(uidB).trial_started_at) > 0, 'B4 el barrido arrancó el reloj de B');
    const evB = seedDb(dbPath, (db) => db.prepare(`SELECT COUNT(*) AS c FROM events WHERE user_id = ? AND name = 'corrida_autocompletada'`).get(uidB));
    t(evB.c >= 1, 'B5 la cura de B quedó en su actividad (evento corrida_autocompletada)');

    // ===== C · sin semana en caché: problema visible, no silencio =====
    const uidC = mkGuest('corrida.c', now - 2 * 3600000, true, basePayload('Corrida C'));
    const bar2 = await reqJson('POST', '/api/admin/trial/barrido-autocompleta' + Q, {});
    t(bar2.json && Array.isArray(bar2.json.sin_semana) && bar2.json.sin_semana.includes(uidC), 'C1 el barrido marca a C como sin-semana', JSON.stringify(bar2.json).slice(0, 250));
    t(nPosts(uidC) === 0 && Number(readUser(uidC).trial_started_at) === 0, 'C2 C sigue sin posteos ni reloj (no se fabricó nada)');
    const vista = await reqJson('GET', '/api/admin/conserje/vista' + Q, null);
    let probC = null;
    try {
      const walk = (x) => { if (!x || typeof x !== 'object') return; if (x.tipo === 'corrida_incompleta' && Number(x.user_id) === uidC) probC = x; for (const k of Object.keys(x)) walk(x[k]); };
      walk(vista.json);
    } catch (e) {}
    t(!!probC && probC.clase === 'problema', 'C3 el conserje muestra a C como problema corrida_incompleta', JSON.stringify(probC).slice(0, 200));

    // ===== D · el orgánico no se toca =====
    const uidD1 = seedDb(dbPath, (db) => Number(db.prepare(`INSERT INTO users (email, password_hash, plan_status, trial_started_at, is_guest, created_at) VALUES ('organico@suite.com', '', 'trial', 0, 0, ?)`).run(now - 2 * 3600000).lastInsertRowid));
    const uidD2 = mkGuest('corrida.d2', now - 2 * 3600000, false, payloadA);
    const bar3 = await reqJson('POST', '/api/admin/trial/barrido-autocompleta' + Q, {});
    t(nPosts(uidD1) === 0 && Number(readUser(uidD1).trial_started_at) === 0, 'D1 el registrado en trial no se tocó');
    t(nPosts(uidD2) === 0 && Number(readUser(uidD2).trial_started_at) === 0, 'D2 el invitado sin marca (orgánico) no se tocó');

    // ===== E · idempotencia =====
    const antesA = nPosts(uidA), antesB = nPosts(uidB);
    const bar4 = await reqJson('POST', '/api/admin/trial/barrido-autocompleta' + Q, {});
    t(nPosts(uidA) === antesA && nPosts(uidB) === antesB, 'E1 otra corrida del barrido no duplica posteos');
    t(bar4.json && bar4.json.completados === 0, 'E2 la segunda corrida no completa a nadie de nuevo', JSON.stringify(bar4.json).slice(0, 200));
  } catch (e) {
    t(false, 'boot: excepción', e.message);
  } finally {
    kill();
    await sleep(300);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`CORRIDA-AUTOCOMPLETA: ${ok} ok, ${bad} fail`);
  process.exit(bad ? 1 : 0);
})();
