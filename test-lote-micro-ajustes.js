'use strict';
// test-lote-micro-ajustes.js — LOTE MICRO-AJUSTES-API (composición del
// preparador sobre base viva v1065, BUILD v1066)
// Dos ajustes chicos e independientes de API:
//  A) El dueño tiene que poder abrir SU posteo retenido (needs_review=1) por
//     GET /api/posts/:id: 200 con la marca visible en la respuesta; para
//     terceros sigue 404 y el retenido sigue fuera de la lista /api/posts.
//     Ítem A = SIN CAMBIO (no-bug probado: en el vivo el handler ya lee por
//     id + dueño sin filtro de revisión); la suite solo lo PINea.
//  B) Freno de duplicados en la programación puntual por PATCH /api/posts/:id:
//     el mismo chequeo que ya corre en scheduleDraftsPerWeek y en la vía
//     edit-caption (helper captionDuplicadoProgramadoDe, vivo desde v1065
//     CHEQUEO-DUPLICADOS-CAPTIONS — en la base v980 del builder el helper no
//     existía y el builder lo portó a su árbol; acá ese hunk quedó SUPERSEDED
//     por el aterrizaje de v1065 y este lote suma SOLO el hook del PATCH).
//     Si el caption efectivo ya está programado para esa cuenta (o se
//     publicó en los últimos 7 días), el PATCH responde 409 caption_duplicado
//     y NO toca la fila. Con caption nuevo, programa como siempre.
// ADAPTACIONES DEL PREPARADOR (solo pins/encabezado, con causa): BUILD
// provisorio v999 del builder → v1066 definitivo; el resto de la suite es
// byte-idéntica a la del builder (md5 original 1dd503a10f00a9230e767fe9546c7264).
// Node puro: estáticos + boot real con DATA_DIR aislada. Puerto 34661.
// Uso: node test-lote-micro-ajustes.js
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
const cnt = (s, sub) => (sub ? s.split(sub).length - 1 : 0);

// ---------- A. Estáticos ----------
t(SRV.includes("const BUILD_ID = '20261105-v1066';"), 'E-estampado: BUILD v1066');
t(cnt(SRV, '20261105-v1066') === 1, 'E-estampado: BUILD v1066 ×1');
try { execSync('node --check server.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'E-sintaxis: node --check server.js OK'); } catch (e) { t(false, 'E-sintaxis: node --check server.js OK'); }
// Ítem A: el handler del detalle es por dueño y SIN filtro de revisión.
const getStart = SRV.indexOf("app.get('/api/posts/:id'");
const getEnd = SRV.indexOf("app.post('/api/posts/:id/cover'", getStart);
const getBody = (getStart >= 0 && getEnd > getStart) ? SRV.slice(getStart, getEnd) : '';
t(getBody.includes('WHERE id = ? AND user_id = ?'), 'A-código: GET /api/posts/:id lee por id + dueño');
t(!getBody.includes('needs_review'), 'A-código: GET /api/posts/:id NO filtra por needs_review (el dueño lee su retenido)');
// Ítem B: helper presente (verbatim v966) + hook en el PATCH.
const fnStart = SRV.indexOf('function captionDuplicadoProgramadoDe');
const fnEnd = SRV.indexOf('function scheduleDraftsPerWeek', fnStart);
const fnBody = (fnStart >= 0 && fnEnd > fnStart) ? SRV.slice(fnStart, fnEnd) : '';
t(fnBody.length > 200, 'B-código: captionDuplicadoProgramadoDe definida antes de scheduleDraftsPerWeek');
t(fnBody.includes('captionBodyKey(caption)') && fnBody.includes('captionBodyKey(r.caption)'), 'B-código: el helper normaliza con captionBodyKey (semántica v966)');
t(fnBody.includes("status = 'scheduled'") && fnBody.includes("published_at > datetime('now', '-7 days')"), 'B-código: el helper compara programados + publicados 7d');
const patchStart = SRV.indexOf("app.patch('/api/posts/:id'");
const patchEnd = SRV.indexOf('// POST /api/posts/:id/reject-reason', patchStart);
const patchBody = (patchStart >= 0 && patchEnd > patchStart) ? SRV.slice(patchStart, patchEnd) : '';
t(patchBody.includes('captionDuplicadoProgramadoDe(req.session.userId, capEfectivoPatch, post.id)'), 'B-código: el PATCH pasa por el helper con el caption efectivo y excludeId propio');
t(patchBody.includes("error: 'caption_duplicado'") && patchBody.includes('duplicado_de: dupPuntual.id'), 'B-código: el PATCH responde el conflicto caption_duplicado con el id contra el que choca');
t(patchBody.indexOf('captionDuplicadoProgramadoDe(req.session.userId') < patchBody.indexOf("status='scheduled', error=''"), 'B-código: el freno corre ANTES del UPDATE que programa');

// ---------- B. Boot real ----------
const PORT = 34661;
const SECRET = 'micro-ajustes-secret';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'micro-ajustes-'));
const nodeModules = '/home/hatch/workspace/posta/node_modules';
const CAP_DUP = 'El ritual de la mañana empieza con un buen café: grano fresco, agua justa y dos minutos de calma. Guardá este posteo 🔖';
const CAP_NEW = 'Nueva carta de invierno: tres blends, un solo ritual. Vení a conocerla esta semana.';
const CAP_OTRO = 'Tarde de filtrados: probamos dos métodos nuevos y quedó uno ganador. Pasá a probarlo.';
const CAP_R = 'Posteo retenido de prueba: la marca tiene que verse en la respuesta del detalle.';
const CAP_R2 = 'Segundo retenido de prueba, ya programado: también se abre por el detalle.';
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
const isoInDays = (n) => { const d = new Date(Date.now() + n * 24 * 3600 * 1000); return d.toISOString().replace(/T.*/, 'T22:00:00.000Z'); };
const isoTodayAt = (h, m) => { const d = new Date(); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    SESSION_SECRET: SECRET,
    ADMIN_TOKEN: 'micro-ajustes-admin',
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
    t(ver && ver.build === '20261105-v1066', 'B-boot: /api/version trae el BUILD v1066', JSON.stringify(ver && ver.build));

    // Siembra: 2 usuarios con plan activo; sesiones firmadas.
    const db = new DatabaseSync(path.join(tmpDir, 'posta.db'));
    const exp = Date.now() + 7 * 24 * 3600 * 1000;
    const sessJson = (uid) => JSON.stringify({
      cookie: { originalMaxAge: 30 * 24 * 3600 * 1000, expires: new Date(exp).toISOString(), secure: false, httpOnly: true, path: '/' },
      userId: uid,
    });
    for (const uid of [21, 22]) {
      db.prepare(`INSERT INTO users (id, email, password_hash, plan, plan_status, best_hour) VALUES (?, ?, 'x', 'posty', 'active', 17)`).run(uid, `micro-ajustes-${uid}@test.invalid`);
      db.prepare(`INSERT INTO settings (user_id, timezone) VALUES (?, 'America/New_York')`).run(uid);
      db.prepare(`INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)`).run('micro-ajustes-' + uid, sessJson(uid), exp);
    }
    const ins = db.prepare(`INSERT INTO posts (id, user_id, image_path, caption, hashtags, scheduled_at, status, tipo, media_type, needs_review, created_at) VALUES (?, ?, ?, ?, '', ?, ?, 'social', 'image', ?, ?)`);
    ins.run(801, 21, '/media/801.jpg', CAP_DUP, isoInDays(1), 'scheduled', 0, isoTodayAt(9, 0));
    ins.run(802, 21, '/media/802.jpg', CAP_DUP, null, 'draft', 0, isoTodayAt(9, 1));
    ins.run(803, 21, '/media/803.jpg', CAP_NEW, null, 'draft', 0, isoTodayAt(9, 2));
    ins.run(804, 21, '/media/804.jpg', CAP_R, null, 'draft', 1, isoTodayAt(9, 3));
    ins.run(805, 21, '/media/805.jpg', CAP_R2, isoInDays(4), 'scheduled', 1, isoTodayAt(9, 4));
    ins.run(806, 22, '/media/806.jpg', CAP_DUP, null, 'draft', 0, isoTodayAt(9, 0));
    const st = (id) => { try { return db.prepare('SELECT status, scheduled_at FROM posts WHERE id = ?').get(id); } catch (e) { return null; } };

    // ----- Ítem A: el dueño abre su retenido; el tercero no; la lista no lo muestra -----
    const aMine = await api('micro-ajustes-21', 'GET', '/api/posts/804');
    t(aMine.status === 200 && aMine.json && aMine.json.post && aMine.json.post.id === 804, 'A-boot: el dueño lee su posteo retenido (draft, nr=1) — 200', 'status=' + aMine.status);
    t(aMine.json && aMine.json.post && Number(aMine.json.post.needs_review) === 1, 'A-boot: la respuesta trae la marca needs_review=1 visible', JSON.stringify(aMine.json && aMine.json.post && aMine.json.post.needs_review));
    const aMine2 = await api('micro-ajustes-21', 'GET', '/api/posts/805');
    t(aMine2.status === 200 && aMine2.json && aMine2.json.post && Number(aMine2.json.post.needs_review) === 1, 'A-boot: el dueño lee su posteo retenido ya programado (nr=1) — 200 con marca', 'status=' + aMine2.status);
    const aThird = await api('micro-ajustes-22', 'GET', '/api/posts/804');
    t(aThird.status === 404, 'A-boot: un tercero recibe 404 para el retenido ajeno', 'status=' + aThird.status);
    const aGone = await api('micro-ajustes-21', 'GET', '/api/posts/999999');
    t(aGone.status === 404, 'A-boot: un posteo inexistente sigue 404', 'status=' + aGone.status);
    const aList = await api('micro-ajustes-21', 'GET', '/api/posts');
    const listIds = Array.isArray(aList.json) ? aList.json.map((p) => p.id) : [];
    t(listIds.includes(801) && !listIds.includes(804) && !listIds.includes(805), 'A-boot: la lista sigue SIN mostrar retenidos (804/805 fuera, 801 visible)', JSON.stringify(listIds));

    // ----- Ítem B: freno de duplicados en el PATCH puntual -----
    const before802 = st(802);
    const bDup = await api('micro-ajustes-21', 'PATCH', '/api/posts/802', { scheduled_at: isoInDays(2) });
    t(bDup.status === 409 && bDup.json && bDup.json.error === 'caption_duplicado', 'B-boot: PATCH que programa un duplicado → 409 caption_duplicado', 'status=' + bDup.status + ' ' + JSON.stringify(bDup.json && bDup.json.error));
    t(bDup.json && bDup.json.duplicado_de === 801, 'B-boot: la respuesta dice contra qué posteo choca (duplicado_de=801)', JSON.stringify(bDup.json && bDup.json.duplicado_de));
    t(bDup.json && typeof bDup.json.message === 'string' && bDup.json.message.length > 10, 'B-boot: la respuesta trae un mensaje claro', JSON.stringify(bDup.json && bDup.json.message));
    const after802 = st(802);
    t(after802 && after802.status === 'draft' && !after802.scheduled_at && before802 && before802.status === 'draft', 'B-boot: el duplicado frenado NO cambió de estado (sigue draft sin fecha)', JSON.stringify(after802));
    t(out.includes('[chequeo-duplicados] PATCH post 802 (user 21)'), 'B-boot: el log registra el frenado del PATCH');
    const bNew = await api('micro-ajustes-21', 'PATCH', '/api/posts/803', { scheduled_at: isoInDays(3) });
    t(bNew.status === 200 && bNew.json && bNew.json.ok === true && !!bNew.json.scheduled_at, 'B-boot: PATCH con caption nuevo programa como siempre (200 + fecha)', 'status=' + bNew.status + ' ' + JSON.stringify(bNew.json));
    t(st(803) && st(803).status === 'scheduled' && !!st(803).scheduled_at, 'B-boot: el 803 quedó programado en la DB', JSON.stringify(st(803)));
    const bOther = await api('micro-ajustes-22', 'PATCH', '/api/posts/806', { scheduled_at: isoInDays(2) });
    t(bOther.status === 200 && bOther.json && bOther.json.ok === true, 'B-boot: el mismo caption en OTRA cuenta no es duplicado (programa)', 'status=' + bOther.status + ' ' + JSON.stringify(bOther.json && bOther.json.error));
    const bFixed = await api('micro-ajustes-21', 'PATCH', '/api/posts/802', { scheduled_at: isoInDays(5), caption: CAP_OTRO });
    t(bFixed.status === 200 && bFixed.json && bFixed.json.ok === true, 'B-boot: el mismo posteo con el texto cambiado sí programa (el freno mira el caption efectivo)', 'status=' + bFixed.status + ' ' + JSON.stringify(bFixed.json && bFixed.json.error));
    t(st(802) && st(802).status === 'scheduled', 'B-boot: el 802 quedó programado tras cambiar el texto', JSON.stringify(st(802)));
  } catch (e) {
    t(false, 'B-boot: excepción', e && e.message);
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 600));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\nMICRO-AJUSTES-API: ok ${ok} · fallas ${bad}`);
  process.exit(bad ? 1 : 0);
})();
