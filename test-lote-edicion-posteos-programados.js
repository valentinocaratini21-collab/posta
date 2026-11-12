'use strict';
// test-lote-edicion-posteos-programados.js — LOTE EDICION-POSTEOS-PROGRAMADOS v965
// (Valentino 12/11 14:26, emergencia): acceso admin para editar el caption de
// un posteo YA PROGRAMADO (status='scheduled'). El endpoint viejo de
// review/edit solo cubre borradores en revisión (draft + needs_review=1);
// este cubre lo programado, que antes no tenía vía por API (el duplicado
// 589=571 y el 566 de hoy quedaron trabados por eso). Solo cambia el caption:
// nunca toca status, scheduled_at ni ningún otro campo. Sin confirm=true es
// dry-run. Idempotente: caption idéntico → ya_correcto, sin escribir.
// Datos reales de calidad-captions.md (verificados por el tablero):
//  - 589/571: caption original de 185 chars (JS length) + sus rewrites.
//  - 566: fragmento verificado de dos bloques + su rewrite (el bloque del
//    fluff se reemplaza entero por la frase nueva; el caption completo de
//    producción no estaba en el archivo, la semilla usa el fragmento citado).
// Node puro: estáticos + boot real con DATA_DIR aislada. Puerto 34740.
// Uso: node test-lote-edicion-posteos-programados.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const DIR = __dirname;
const srv = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

// ---------- A. Estáticos ----------
t(srv.includes("const BUILD_ID = '20261105-v965';"), 'server: BUILD v965');
t(cnt(srv, '20261105-v965') === 1, 'server: BUILD v965 ×1 (solo el estampado)');
t(cnt(srv, '20261105-v942') === 0, 'server: sin restos de v942');
t(srv.includes("app.post('/api/admin/posts/:id/edit-caption', requireAdminToken"), 'server: ruta edit-caption presente con requireAdminToken');
t(srv.includes("status = 'draft' AND COALESCE(needs_review,0)=1"), 'server: review/edit sigue con su guarda draft+needs_review (sin tocar)');
t(srv.includes("app.patch('/api/posts/:id', requireAuth"), 'server: PATCH /api/posts/:id sigue con requireAuth (sin tocar)');
t(md5(path.join(DIR, 'public/app.js')) === '07b476fd98e43cd0536455cf6ce33f2d', 'app.js byte-idéntico a base v961 (sin ?v=)');
t(md5(path.join(DIR, 'public/styles.css')) === '0d6f6032ef69b2d688c6227de46d2f72', 'styles.css byte-idéntico a base v961');
t(md5(path.join(DIR, 'public/index.html')) === '04290df4677545ab69573951444e920f', 'index ES byte-idéntico a base v961');
t(md5(path.join(DIR, 'public/en/index.html')) === '2eb2f7fb09dd351995b35179209902b1', 'index EN byte-idéntico a base v961');
try { execSync('node --check server.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'server.js: node --check OK'); } catch (e) { t(false, 'server.js: node --check OK'); }

// Datos reales (calidad-captions.md).
const CAP_589 = '3 claves para elegir bien en single origin coffees 👇\nCalidad, detalle y que sea de Portrait Coffee: así trabajamos single origin coffees.\nGuardá este posteo para cuando lo necesites 🔖';
const REWRITE_589 = '¿Single origin y no sabés por dónde empezar? ☕\nTres claves para elegir bien: el origen, el tueste y quién lo prepara. Acá te contamos cada una.\nGuardá este posteo para tu próxima visita 🔖';
const REWRITE_571 = 'Cómo elegir tu café sin que te vendan cualquiera: la guía corta de Portrait Coffee\nGrano fresco, tueste parejo y que se sienta el origen: así lo elegimos nosotros.\nGuardá este posteo para cuando lo necesites 🔖';
const CAP_566 = 'Cada taza de nuestro café cuenta una historia.\nEn Café de Prueba Bamboo, la dedicación y el amor por el café de especialidad son nuestra bandera.';
const REWRITE_566 = 'Cada taza de nuestro café cuenta una historia.\nCada taza sale con el grano que elegimos a la mañana y el agua a la temperatura justa.';
t(CAP_589.length === 185, 'dato: el caption 589/571 mide 185 chars (JS length, como en producción)', 'len=' + CAP_589.length);
t(REWRITE_589 !== CAP_589 && REWRITE_571 !== CAP_589, 'dato: los rewrites 589/571 difieren del original');

// ---------- B. Boot real ----------
const PORT = 34740;
const ADMIN_TOKEN = 'boot-test-token-edicion-programados';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edicion-programados-boot-'));
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
  console.log('— B) boot real: editar posteos programados por API admin —');
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, MEDIA_DIR: mediaDir, ADMIN_TOKEN, NODE_PATH: nodeModules, OPENAI_API_KEY: '' };
  const child = spawn(process.execPath, ['server.js'], { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  const pid = child.pid;
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await sleep(1000);
    }
    t(up, 'boot: el servidor levanta en ' + PORT);
    if (!up) { console.log('--- salida del servidor (últimas 30 líneas) ---'); console.log(out.split('\n').slice(-30).join('\n')); throw new Error('no levanta'); }
    const ver = await reqJson('GET', '/api/version');
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v965', 'boot: /api/version trae el BUILD v965', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    t(fs.existsSync(dbPath), 'boot: la DB existe en el DATA_DIR temporal');

    const ids = {};
    seedDb(dbPath, (db) => {
      const u = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?,?)`).run('edicion-test@posty.test', 'x');
      const uid = Number(u.lastInsertRowid);
      const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, scheduled_at, status, needs_review) VALUES (?,?,?,?,?,?)`);
      ids.p589 = Number(ins.run(uid, 'test.jpg', CAP_589, '2026-11-13 22:00:00', 'scheduled', 0).lastInsertRowid);
      ids.p571 = Number(ins.run(uid, 'test.jpg', CAP_589, '2026-11-14 22:00:00', 'scheduled', 0).lastInsertRowid);
      ids.p566 = Number(ins.run(uid, 'test.jpg', CAP_566, '2026-11-12 22:00:00', 'scheduled', 0).lastInsertRowid);
      ids.pDraft = Number(ins.run(uid, 'test.jpg', 'borrador en revisión', null, 'draft', 1).lastInsertRowid);
      ids.pPub = Number(ins.run(uid, 'test.jpg', 'ya publicado', '2026-11-11 22:00:00', 'published', 0).lastInsertRowid);
      ids.pCanc = Number(ins.run(uid, 'test.jpg', 'cancelado', '2026-11-14 22:00:00', 'cancelled', 0).lastInsertRowid);
    });
    t(ids.p589 > 0 && ids.p571 > ids.p589 && ids.p566 > 0 && ids.pDraft > 0 && ids.pPub > 0 && ids.pCanc > 0, 'boot: siembra de 6 posteos ok', JSON.stringify(ids));
    const readPost = (id) => seedDb(dbPath, (db) => db.prepare(`SELECT id, user_id, status, scheduled_at, caption FROM posts WHERE id = ?`).get(id));
    const edit = (id, body, withToken) => reqJson('POST', `/api/admin/posts/${id}/edit-caption` + (withToken === false ? '' : `?token=${ADMIN_TOKEN}`), body);

    // (a) dry-run del 589: muestra el cambio sin escribir.
    let r = await edit(ids.p589, { caption: REWRITE_589 });
    t(r.status === 200 && r.json && r.json.ok === true && r.json.dry_run === true && r.json.cambiaria === true && r.json.caption_actual === CAP_589 && r.json.caption_nuevo === REWRITE_589, 'boot: dry-run 589 muestra el cambio', JSON.stringify(r.json));
    t(readPost(ids.p589).caption === CAP_589, 'boot: dry-run NO escribe (caption en DB sigue igual)');
    // dryRun explícito también es dry-run.
    r = await edit(ids.p589, { caption: REWRITE_589, dryRun: true });
    t(r.status === 200 && r.json && r.json.dry_run === true, 'boot: dryRun=true explícito también es dry-run');
    t(readPost(ids.p589).caption === CAP_589, 'boot: dryRun=true NO escribe');
    // (b) confirm del 589: aplica, sin tocar status ni fecha.
    r = await edit(ids.p589, { caption: REWRITE_589, confirm: true });
    t(r.status === 200 && r.json && r.json.ok === true && r.json.cambiado === true && r.json.caption === REWRITE_589, 'boot: confirm 589 aplica el rewrite', JSON.stringify(r.json));
    let row = readPost(ids.p589);
    t(row.caption === REWRITE_589 && row.status === 'scheduled' && row.scheduled_at === '2026-11-13 22:00:00', 'boot: confirm 589 deja status y fecha intactos', JSON.stringify(row));
    // (f) confirm con el mismo caption: ya_correcto, sin escribir.
    r = await edit(ids.p589, { caption: REWRITE_589, confirm: true });
    t(r.status === 200 && r.json && r.json.cambiado === false && r.json.ya_correcto === true, 'boot: confirm con caption idéntico → ya_correcto, sin escribir', JSON.stringify(r.json));
    // 571: su propio rewrite, fecha propia intacta.
    r = await edit(ids.p571, { caption: REWRITE_571, confirm: true });
    t(r.status === 200 && r.json && r.json.cambiado === true, 'boot: confirm 571 aplica su rewrite');
    row = readPost(ids.p571);
    t(row.caption === REWRITE_571 && row.status === 'scheduled' && row.scheduled_at === '2026-11-14 22:00:00', 'boot: 571 con su fecha intacta', JSON.stringify(row));
    // 566: dry-run + confirm del rewrite de hoy.
    r = await edit(ids.p566, { caption: REWRITE_566 });
    t(r.status === 200 && r.json && r.json.dry_run === true && r.json.cambiaria === true && r.json.caption_actual === CAP_566, 'boot: dry-run 566 muestra el cambio', JSON.stringify(r.json));
    r = await edit(ids.p566, { caption: REWRITE_566, confirm: true });
    t(r.status === 200 && r.json && r.json.cambiado === true, 'boot: confirm 566 aplica el rewrite de hoy');
    row = readPost(ids.p566);
    t(row.caption === REWRITE_566 && row.status === 'scheduled' && row.scheduled_at === '2026-11-12 22:00:00', 'boot: 566 con status y fecha intactos', JSON.stringify(row));
    // (c) borrador en revisión por este endpoint → 400.
    r = await edit(ids.pDraft, { caption: 'x', confirm: true });
    t(r.status === 400 && r.json && r.json.motivo === 'es_borrador', 'boot: borrador en revisión → 400 es_borrador', JSON.stringify(r.json));
    // (d) publicado → 400.
    r = await edit(ids.pPub, { caption: 'x', confirm: true });
    t(r.status === 400 && r.json && r.json.motivo === 'ya_publicado', 'boot: publicado → 400 ya_publicado', JSON.stringify(r.json));
    // cancelado → 400.
    r = await edit(ids.pCanc, { caption: 'x', confirm: true });
    t(r.status === 400 && r.json && r.json.motivo === 'cancelado', 'boot: cancelado → 400 cancelado', JSON.stringify(r.json));
    // (e) id inexistente → 404.
    r = await edit(999999, { caption: 'x', confirm: true });
    t(r.status === 404 && r.json && r.json.error === 'no_existe', 'boot: id inexistente → 404', JSON.stringify(r.json));
    // Sin caption → 400.
    r = await edit(ids.p571, { confirm: true });
    t(r.status === 400 && r.json && r.json.error === 'falta caption', 'boot: sin caption → 400 falta caption', JSON.stringify(r.json));
    // Sin token → 403.
    r = await edit(ids.p571, { caption: 'x', confirm: true }, false);
    t(r.status === 403, 'boot: sin token admin → 403', 'status=' + r.status);
    // El endpoint viejo sigue sin poder con un programado (su guarda es draft+needs_review).
    const old = await reqJson('POST', `/api/admin/review/${ids.p571}/edit?token=${ADMIN_TOKEN}`, { caption: 'x' });
    t(old.status === 404, 'boot: review/edit viejo sigue dando 404 para un programado', 'status=' + old.status);
    // PATCH sin sesión no edita (sigue exigiendo la sesión del cliente).
    const patch = await reqJson('PATCH', `/api/posts/${ids.p571}`, { caption: 'x' });
    t(patch.status === 401 || patch.status === 403, 'boot: PATCH sin sesión sigue rechazado', 'status=' + patch.status);
  } catch (e) {
    bad++;
    console.log('✗ boot: excepción ::', String((e && e.message) || e).slice(0, 400));
    console.log('--- salida del servidor (últimas 30 líneas) ---');
    console.log(out.split('\n').slice(-30).join('\n'));
  } finally {
    kill();
    try { await sleep(1500); } catch (e) {}
    try {
      const ss = execSync('ss -ltnp 2>/dev/null || ss -ltn 2>/dev/null', { encoding: 'utf8' });
      t(!ss.includes(':' + PORT + ' '), 'boot: el puerto ' + PORT + ' quedó libre tras matar por PID ' + pid);
    } catch (e) { t(true, 'boot: puerto liberado (ss no disponible)'); }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nedicion-posteos-programados: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
