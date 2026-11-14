'use strict';
// test-lote-chequeo-duplicados-captions.js — LOTE CHEQUEO-DUPLICADOS-CAPTIONS v966
// (Valentino 12/11 14:26 — arreglo permanente: el duplicado real 589=571, Portrait
// Coffee cuenta 87, se programó porque ningún chequeo al programar miraba más allá
// del week_key; el lint solo ve la misma week_key y 571 la tiene vacía).
// El chequeo vive en scheduleDraftsPerWeek (el embudo de programar: auto con
// scheduleAllDrafts y manual con POST /api/posts/schedule-all): antes de programar
// un caption se compara (captionBodyKey: minúsculas, sin tildes, sin puntuación ni
// emojis, espacios colapsados — la misma que DEDUP-7D usa al generar) contra los
// captions YA PROGRAMADOS de esa cuenta y los PUBLICADOS en los últimos 7 días.
// Si choca, el borrador NO se programa: queda en 'draft' sin consumir cupo ni día,
// va a `waiting` con reason 'caption_duplicado' y queda el log [chequeo-duplicados].
// Entre cuentas distintas no se compara nada (cada cuenta es su propio universo).
// ADAPTACIÓN DEL PREPARADOR (re-base v942 → v1064, BUILD de aterrizaje v1065):
// los pins de versión se re-estampan a v1065/v1064 y se suma el follow-up de
// DETALLE-POSTEO (v1021): el hook del mismo helper en la vía de USUARIO
// POST /api/posts/:id/edit-caption (estáticos A2 + boot (h): editar a un
// caption duplicado → 409 caption_duplicado y el caption no cambia; editar a
// uno distinto → 200; guardar el mismo → 200 sin cambios). La vía ADMIN de
// edit-caption (v965) NO se engancha: el STATUS del builder la declara otro
// lote y este no la toca (verificado: su región no contiene el helper).
// Segunda adaptación del preparador: la siembra fija week_key = lunes de la
// semana PRÓXIMA. La suite original sembraba sin week_key (semana corriente)
// y el builder la corrió un miércoles, con 3+ días libres por delante; corrida
// un sábado, a la semana corriente le queda 1 solo día y 704/706 caen en
// 'no_slot' en AMBOS árboles (verificado: es el calendario, no el lote). Con
// la semana próxima entera libre, el boot es idéntico cualquier día.
// Node puro: estáticos + boot real con DATA_DIR aislada. Puerto 34581.
// Uso: node test-lote-chequeo-duplicados-captions.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
let ok = 0, bad = 0;
const t = (cond, name, extra) => { if (cond) { ok++; } else { bad++; console.log('✗', name + (extra ? ' :: ' + String(extra).slice(0, 500) : '')); } };
const DIR = __dirname;
const SRV = fs.readFileSync(path.join(DIR, 'server.js'), 'utf8');
const APP = fs.readFileSync(path.join(DIR, 'public/app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(DIR, 'public/styles.css'), 'utf8');
const IDX_ES = fs.readFileSync(path.join(DIR, 'public/index.html'), 'utf8');
const IDX_EN = fs.readFileSync(path.join(DIR, 'public/en/index.html'), 'utf8');
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

// ---------- A. Estáticos ----------
t(SRV.includes("const BUILD_ID = '20261105-v1065';"), 'A-estampado: BUILD v1065');
t(cnt(SRV, '20261105-v1065') === 1, 'A-estampado: BUILD v1065 ×1');
t(cnt(SRV, '20261105-v1064') === 0, 'A-estampado: sin restos de v1064');
t(!APP.includes('20261105-v1065') && !CSS.includes('20261105-v1065') && !IDX_ES.includes('20261105-v1065') && !IDX_EN.includes('20261105-v1065'), 'A-server-only: app/styles/index sin v1065');
try { execSync('node --check server.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'A-sintaxis: node --check server.js OK'); } catch (e) { t(false, 'A-sintaxis: node --check server.js OK'); }
const fnStart = SRV.indexOf('function captionDuplicadoProgramadoDe');
const fnEnd = SRV.indexOf('function scheduleDraftsPerWeek', fnStart);
const fnBody = (fnStart >= 0 && fnEnd > fnStart) ? SRV.slice(fnStart, fnEnd) : '';
t(fnBody.length > 200, 'A-código: captionDuplicadoProgramadoDe definida antes de scheduleDraftsPerWeek');
t(fnBody.includes('captionBodyKey(caption)') && fnBody.includes('captionBodyKey(r.caption)'), 'A-código: normalización captionBodyKey (misma que DEDUP-7D)');
t(fnBody.includes("status = 'scheduled'") && fnBody.includes("published_at > datetime('now', '-7 days')"), 'A-código: compara programados + publicados 7d');
t(fnBody.includes('user_id = ?') && !fnBody.includes('user_id IN'), 'A-código: el chequeo es por UNA cuenta (universo propio)');
t(SRV.includes('captionDuplicadoProgramadoDe(uid, d.caption, d.id)'), 'A-código: el chequeo corre en el loop de scheduleDraftsPerWeek, antes de aplicar');
t(SRV.includes('[chequeo-duplicados]'), 'A-código: log [chequeo-duplicados]');
t(SRV.includes("reason: 'caption_duplicado'"), 'A-código: waiting con reason caption_duplicado');
t(SRV.includes("error: 'caption_duplicado'"), 'A-código: el endpoint responde error caption_duplicado cuando todo es duplicado');
t(SRV.includes("'caption_duplicado'") && SRV.includes('scheduleAllDrafts'), 'A-código: scheduleAllDrafts distingue el motivo caption_duplicado');
// ---------- A2. Follow-up DETALLE-POSTEO: hook en edit-caption de USUARIO ----------
const ecStart = SRV.indexOf("app.post('/api/posts/:id/edit-caption'");
const ecEnd = ecStart >= 0 ? SRV.indexOf('app.post(', ecStart + 10) : -1;
const ecBody = (ecStart >= 0 && ecEnd > ecStart) ? SRV.slice(ecStart, ecEnd) : '';
t(ecBody.includes('captionDuplicadoProgramadoDe(post.user_id, nuevo, post.id)'), 'A2-código: edit-caption de usuario corre la puerta de duplicados');
t(ecBody.includes('status(409)') && ecBody.includes("error: 'caption_duplicado'"), 'A2-código: edit-caption duplicado → 409 caption_duplicado');
const admStart = SRV.indexOf("app.post('/api/admin/posts/:id/edit-caption'");
const admEnd = admStart >= 0 ? SRV.indexOf('app.', admStart + 10) : -1;
const admBody = (admStart >= 0 && admEnd > admStart) ? SRV.slice(admStart, admEnd) : '';
t(admStart >= 0 && !admBody.includes('captionDuplicadoProgramadoDe'), 'A2-código: la vía ADMIN de edit-caption (v965) NO se engancha (otro lote, declarado por el builder)');

// ---------- B. Boot real ----------
const PORT = 34581;
const SECRET = 'chequeo-duplicados-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chequeo-duplicados-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const CAP_X = 'Tres claves para elegir bien en single origin: origen, tueste y barista. Guardá este posteo 🔖';
const CAP_X_VAR = '  TRES   CLAVES para elegir bien en single origin: origen, tueste y barista. Guardá este posteo 🔖 ';
const CAP_Y = 'El tueste medio realza el chocolate del grano. Vení a probarlo esta semana.';
const CAP_Z = 'El grano fresco se siente en la primera taza. Pasá cuando quieras.';
const CAP_W = 'Café de especialidad, todos los días desde las 8. Te esperamos.';
const CAP_REAL = '3 claves para elegir bien en single origin coffees 👇\n\nCalidad, detalle y que sea de Portrait Coffee: así trabajamos single origin coffees.\n\nGuardá este posteo para cuando lo necesites 🔖';
const CAP_Q = 'Nueva carta de invierno: tres blends, un solo ritual. Vení a conocerla.';
const CAP_N = 'Texto nuevo y distinto para el posteo editado, sin repetir a ningún otro.';
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
const isoDaysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
const isoTodayAt = (h, m) => { const d = new Date(); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    SESSION_SECRET: SECRET,
    ADMIN_TOKEN: 'chequeo-duplicados-admin',
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  let code = 0;
  try {
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'B-boot: el servidor levanta con el lote');
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await (await fetch(`http://127.0.0.1:${PORT}/api/version`)).json();
    t(ver && ver.build === '20261105-v1065', 'B-boot: /api/version trae BUILD v1065', JSON.stringify(ver && ver.build));

    // Siembra: 4 usuarios con plan activo; sesiones firmadas; posteos con
    // created_at escalonados para fijar el orden del loop (created_at ASC).
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 604800000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' },
      userId: uid,
    });
    for (const uid of [12, 13, 14, 15]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (?, ?, 'x', 'posty', 'active', 17)`).run(uid, `chequeo-dup-${uid}@test.invalid`);
      db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`).run(uid);
      db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('chequeo-dup-' + uid, sessJson(uid), exp);
    }
    // Lunes de la semana próxima (UTC): semana entera libre para programar.
    const dNext = new Date(Date.now() + 8 * 24 * 3600 * 1000);
    dNext.setUTCDate(dNext.getUTCDate() - ((dNext.getUTCDay() + 6) % 7));
    const NEXT_MONDAY = dNext.toISOString().slice(0, 10);
    const insDraft = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, status, tipo, media_type, week_key, created_at) VALUES (?, ?, ?, ?, '', 'draft', 'social', 'image', '${NEXT_MONDAY}', ?)`);
    const insPub = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, status, tipo, media_type, published_at, created_at) VALUES (?, ?, ?, ?, '', 'published', 'social', 'image', ?, ?)`);
    // User 12: 701 X, 702 X (mismo), 704 Y (distinto), 705 X con otros espacios/
    // mayúsculas, 706 Z (publicado hace 10 días: fuera de ventana), 707 W
    // (publicado hace 2 días: dentro de ventana).
    insDraft.run(701, 12, '/media/701.jpg', CAP_X, isoTodayAt(10, 0));
    insDraft.run(702, 12, '/media/702.jpg', CAP_X, isoTodayAt(10, 1));
    insDraft.run(704, 12, '/media/704.jpg', CAP_Y, isoTodayAt(10, 2));
    insDraft.run(705, 12, '/media/705.jpg', CAP_X_VAR, isoTodayAt(10, 3));
    insDraft.run(706, 12, '/media/706.jpg', CAP_Z, isoTodayAt(10, 4));
    insDraft.run(707, 12, '/media/707.jpg', CAP_W, isoTodayAt(10, 5));
    insPub.run(708, 12, '/media/708.jpg', CAP_Z, isoDaysAgo(10), isoDaysAgo(10));
    insPub.run(709, 12, '/media/709.jpg', CAP_W, isoDaysAgo(2), isoDaysAgo(2));
    // User 13: mismo caption X que la 12 (otra cuenta: no es duplicado).
    insDraft.run(703, 13, '/media/703.jpg', CAP_X, isoTodayAt(10, 0));
    // User 14: caso real 589=571 — mismo caption exacto (185 chars), dos borradores.
    insDraft.run(710, 14, '/media/710.jpg', CAP_REAL, isoTodayAt(10, 0));
    insDraft.run(711, 14, '/media/711.jpg', CAP_REAL, isoTodayAt(10, 1));
    // User 15: un programado Q + un borrador Q (todo duplicado: rama 400).
    db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, created_at) VALUES (712, 15, '/media/712.jpg', ?, '', ?, 'scheduled', 'social', 'image', ?)`).run(CAP_Q, isoDaysAgo(-1).replace(/T.*/, 'T22:00:00.000Z'), isoTodayAt(9, 0));
    insDraft.run(713, 15, '/media/713.jpg', CAP_Q, isoTodayAt(10, 0));
    const st = (id) => { try { return db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').get(id); } catch (e) { return null; } };

    // (a)(c)(d)(e): user 12 programa todo junto.
    const r12 = await api('chequeo-dup-12', 'POST', '/api/posts/schedule-all', {});
    t(r12.status === 200 && r12.json && r12.json.ok === true, '(a-e) user 12: schedule-all 200 + ok', 'status=' + r12.status + ' ' + JSON.stringify(r12.json && r12.json.error));
    const sch12 = ((r12.json && r12.json.scheduled) || []).map((s) => s.id).sort((a, b) => a - b);
    const wai12 = ((r12.json && r12.json.waiting) || []).map((w) => w.id).sort((a, b) => a - b);
    t(JSON.stringify(sch12) === JSON.stringify([701, 704, 706]), '(a-e) user 12: se programan 701, 704 y 706 (y no otros)', JSON.stringify(sch12));
    t(JSON.stringify(wai12) === JSON.stringify([702, 705, 707]), '(a-e) user 12: quedan en espera 702, 705 y 707 (y no otros)', JSON.stringify(wai12));
    t(((r12.json && r12.json.waiting) || []).every((w) => w.reason === 'caption_duplicado'), '(a-e) user 12: los 3 en espera son por caption_duplicado', JSON.stringify(r12.json && r12.json.waiting));
    const w702 = ((r12.json && r12.json.waiting) || []).find((w) => w.id === 702) || {};
    const w707 = ((r12.json && r12.json.waiting) || []).find((w) => w.id === 707) || {};
    t(w702.duplicado_de === 701, '(a) 702 choca contra 701 (el primero programado)', JSON.stringify(w702));
    t(w707.duplicado_de === 709, '(e2) 707 choca contra 709 (publicado hace 2 días)', JSON.stringify(w707));
    t(st(701) && st(701).status === 'scheduled' && !!st(701).scheduled_at, '(a) 701 quedó programado con fecha', JSON.stringify(st(701)));
    t(st(702) && st(702).status === 'draft' && !st(702).scheduled_at, '(a) 702 quedó en draft sin fecha (no se programó)', JSON.stringify(st(702)));
    t(st(704) && st(704).status === 'scheduled', '(c) 704 (caption distinto) se programó', JSON.stringify(st(704)));
    t(st(705) && st(705).status === 'draft' && !st(705).scheduled_at, '(d) 705 (mismos espacios/mayúsculas) quedó en draft: es duplicado', JSON.stringify(st(705)));
    t(st(706) && st(706).status === 'scheduled', '(e) 706 (publicado hace 10 días: fuera de ventana) se programó', JSON.stringify(st(706)));
    t(st(707) && st(707).status === 'draft' && !st(707).scheduled_at, '(e2) 707 (publicado hace 2 días: dentro de ventana) quedó en draft', JSON.stringify(st(707)));
    t(out.includes('[chequeo-duplicados] post 702 (user 12)') && out.includes('[chequeo-duplicados] post 705 (user 12)') && out.includes('[chequeo-duplicados] post 707 (user 12)'), '(a-d-e2) el log marca los 3 frenados con su post y su usuario');

    // (b): mismo caption en otra cuenta se programa.
    const r13 = await api('chequeo-dup-13', 'POST', '/api/posts/schedule-all', {});
    t(r13.status === 200 && r13.json && r13.json.ok === true, '(b) user 13: schedule-all 200 + ok', 'status=' + r13.status);
    t(((r13.json && r13.json.scheduled) || []).some((s) => s.id === 703), '(b) 703 (mismo caption X, otra cuenta) se programó', JSON.stringify(r13.json && r13.json.scheduled));
    t(st(703) && st(703).status === 'scheduled', '(b) 703 quedó programado en la DB', JSON.stringify(st(703)));

    // (f): caso real 589=571 — mismo usuario, mismo caption exacto (185 chars).
    t([...CAP_REAL].length === 185, '(f) el caption del caso real mide 185 chars (code points: los 2 emojis son pares sustitutos en .length)', 'codepoints=' + [...CAP_REAL].length + ' .length=' + CAP_REAL.length);
    const r14 = await api('chequeo-dup-14', 'POST', '/api/posts/schedule-all', {});
    t(r14.status === 200 && r14.json && r14.json.ok === true, '(f) user 14: schedule-all 200 + ok', 'status=' + r14.status);
    const sch14 = ((r14.json && r14.json.scheduled) || []).map((s) => s.id);
    const wai14 = ((r14.json && r14.json.waiting) || []).map((w) => w.id);
    t(JSON.stringify(sch14) === JSON.stringify([710]), '(f) 710 se programa (el primero)', JSON.stringify(sch14));
    t(JSON.stringify(wai14) === JSON.stringify([711]), '(f) 711 queda en espera (el duplicado)', JSON.stringify(wai14));
    t(((r14.json && r14.json.waiting) || [])[0] && ((r14.json && r14.json.waiting) || [])[0].reason === 'caption_duplicado' && ((r14.json && r14.json.waiting) || [])[0].duplicado_de === 710, '(f) 711 choca contra 710 con reason caption_duplicado', JSON.stringify(r14.json && r14.json.waiting));
    t(st(710) && st(710).status === 'scheduled' && st(711) && st(711).status === 'draft' && !st(711).scheduled_at, '(f) en la DB: 710 programado, 711 en draft sin fecha', JSON.stringify({ a: st(710), b: st(711) }));
    t(out.includes('[chequeo-duplicados] post 711 (user 14)'), '(f) el log marca el frenado del 711');

    // (g): todo duplicado → el endpoint responde 400 caption_duplicado.
    const r15 = await api('chequeo-dup-15', 'POST', '/api/posts/schedule-all', {});
    t(r15.status === 400 && r15.json && r15.json.error === 'caption_duplicado', '(g) user 15: todo duplicado → 400 error caption_duplicado', 'status=' + r15.status + ' ' + JSON.stringify(r15.json && r15.json.error));
    t(Array.isArray(r15.json && r15.json.waiting) && r15.json.waiting.length === 1 && r15.json.waiting[0].id === 713 && r15.json.waiting[0].reason === 'caption_duplicado' && r15.json.waiting[0].duplicado_de === 712, '(g) el waiting trae 713 contra 712', JSON.stringify(r15.json && r15.json.waiting));
    t(st(713) && st(713).status === 'draft' && !st(713).scheduled_at, '(g) 713 quedó en draft sin fecha', JSON.stringify(st(713)));
    t(out.includes('[chequeo-duplicados] post 713 (user 15)'), '(g) el log marca el frenado del 713');

    // (h) FOLLOW-UP DETALLE-POSTEO: la vía de USUARIO edit-caption corre la
    // misma puerta. 701 quedó programado con CAP_X y 704 con CAP_Y (user 12).
    const cap = (id) => { try { const r = db.prepare('SELECT caption FROM posts WHERE id = ?').get(id); return r && r.caption; } catch (e) { return null; } };
    const hDup = await api('chequeo-dup-12', 'POST', '/api/posts/704/edit-caption', { caption: CAP_X });
    t(hDup.status === 409 && hDup.json && hDup.json.error === 'caption_duplicado' && hDup.json.duplicado_de === 701, '(h) editar 704 al caption de 701 (programado, misma cuenta) → 409 caption_duplicado contra 701', 'status=' + hDup.status + ' ' + JSON.stringify(hDup.json));
    t(cap(704) === CAP_Y, '(h) el caption de 704 NO cambió tras el 409', JSON.stringify(cap(704)));
    const hOk = await api('chequeo-dup-12', 'POST', '/api/posts/704/edit-caption', { caption: CAP_N });
    t(hOk.status === 200 && hOk.json && hOk.json.ok === true && hOk.json.cambiado === true, '(h) editar 704 a un caption distinto → 200 y cambiado', 'status=' + hOk.status + ' ' + JSON.stringify(hOk.json));
    t(cap(704) === CAP_N, '(h) el caption de 704 quedó con el texto nuevo en la DB', JSON.stringify(cap(704)));
    const hSame = await api('chequeo-dup-12', 'POST', '/api/posts/701/edit-caption', { caption: CAP_X });
    t(hSame.status === 200 && hSame.json && hSame.json.ok === true && hSame.json.ya_correcto === true, '(h) guardar 701 con su mismo caption → 200 ya_correcto (no choca consigo mismo)', 'status=' + hSame.status + ' ' + JSON.stringify(hSame.json));
    t(out.includes('[chequeo-duplicados] edit-caption post 704 (user 12)'), '(h) el log marca el frenado de la edición');
    try { db.close(); } catch (e) {}
  } catch (e) {
    console.log('ERROR suite:', e && e.message);
    code = 1;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 1500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nchequeo-duplicados-captions: ${ok} ok, ${bad} mal`);
  process.exit(code || (bad ? 1 : 0));
})();
