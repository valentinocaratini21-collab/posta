// test-lote-descarte-admin.js — LOTE DESCARTE-ADMIN
// Problema (verificado el 14/11 por la cadena del tablero): descartar un
// posteo en forma TERMINAL (borrado físico o status='cancelled') vivía
// solo detrás de la sesión del dueño (DELETE /api/posts/:id y el cancel
// por PATCH exigen requireAuth de sesión; el token admin es un chequeo
// separado que NO crea sesión). Por admin solo se llegaba a borrador:
// el rehacer de soporte (sin user_stopped → el auto-arm de 24 h lo puede
// re-programar solo) o el no_sale del conserje (con user_stopped=1 pero
// re-agendable). El caso real: el posteo 653 (user 12) guarda un video
// con los subtítulos pisados y quedó frenado al 30/12 en scheduled —
// riesgo contenido por la fecha, no eliminado.
// LO QUE CONSTRUYE ESTE LOTE (modelo: schedule/set-image de v1008):
//   POST /api/admin/posts/:id/descartar (requireAdminToken) →
//   status='cancelled', el estado de descarte de la casa, con registro
//   en support_team_log (supportCases.logTeamAction, action
//   'descartar_posteo') y el motivo del body en el detalle.
//   Guardas: inexistente → 404 · published/publishing → 400 (lo
//   publicado no se descarta) · ya cancelled/dismissed → 200
//   idempotente (sin error, sin duplicar el registro) · NO escribe
//   day_stops (el descarte es de la PIEZA, no del día: espejo del
//   cancel del dueño) · no toca ningún otro posteo.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-descarte-admin.js
// (desde release/; ROOT = release/, BASE = ../base para el control).
// Boot real en el puerto 35093 con DATA_DIR temporal en /tmp: NO crea
// release/data/. Determinismo: los posteos sembrados quedan a FUTURO
// (el tick del scheduler nunca los toca) y el predicado del publicador
// se ejerce con la consulta EXACTA de scheduler.js (processDuePosts)
// ligando su parámetro `now` a +4 h: prueba que, llegada su hora, el
// publicador tomaría al programado antes del descarte y ya no después.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = __dirname;
const BASE = path.join(ROOT, '..', 'base');
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35093;
const TOKEN = 'boot-test-token-descarte';

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); console.log('  FAIL: ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}
function count(str, sub) { return str.split(sub).length - 1; }

// La consulta de vencidos EXACTA de scheduler.js processDuePosts.
const DUE_SQL = `SELECT p.*, u.id AS uid FROM posts p
       JOIN users u ON u.id = p.user_id
       WHERE p.status = 'scheduled' AND p.scheduled_at <= ?
       AND COALESCE(p.needs_review, 0) = 0
       ORDER BY (CASE WHEN p.media_type = 'story' THEN 1 ELSE 0 END) ASC, p.scheduled_at ASC LIMIT 5`;

async function main() {
  console.log('== A. Fuente: la ruta y la invariante del publicador ==');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const srvBase = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
  const sched = fs.readFileSync(path.join(ROOT, 'scheduler.js'), 'utf8');
  t(count(srv, "app.post('/api/admin/posts/:id/descartar', requireAdminToken") === 1, 'A1 la ruta descartar existe en el release, tras requireAdminToken');
  t(count(srvBase, '/api/admin/posts/:id/descartar') === 0, 'A2 control: la ruta NO existía en la base');
  t(sched.includes("WHERE p.status = 'scheduled' AND p.scheduled_at <= ?"), 'A3 el publicador solo toma status=\'scheduled\' (scheduler.js, processDuePosts)');
  t(srv.includes("action: 'descartar_posteo'") && srv.includes('supportCases.logTeamAction'), 'A4 el descarte se registra en el log del equipo (logTeamAction)');

  console.log('== B. Boot real: guardas, descarte terminal y colateral cero ==');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'descarte-admin-'));
  const dbFile = path.join(tmpDir, 'posta.db');
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), NODE_PATH: NM,
    OPENAI_API_KEY: '', ADMIN_TOKEN: TOKEN,
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += String(d); });
  child.stderr.on('data', (d) => { bootLog += String(d); });
  const dataDirAntes = fs.existsSync(path.join(ROOT, 'data'));
  async function reqJson(method, p, body) {
    const r = await fetch(`http://127.0.0.1:${PORT}${p}`, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let json = null; try { json = JSON.parse(txt); } catch (e) {}
    return { status: r.status, json, setCookie: r.headers.get('set-cookie') || '' };
  }
  try {
    let up = false;
    for (let i = 0; i < 90; i++) {
      try { const r = await fetch(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) { up = true; break; } } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    t(up, 'B0 el servidor del release levanta', bootLog.slice(-400));

    const reg = await reqJson('POST', '/api/auth/register', { email: 'descarte@test.local', password: 'secreta123' });
    t(reg.status < 300, 'B1 registro del usuario de prueba', String(reg.status));

    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbFile);
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('descarte@test.local').id;
    const H = 3600 * 1000;
    const iso = (ms) => new Date(ms).toISOString();
    const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, approval, needs_review, media_type, published_at, ig_permalink)
      VALUES (?, ?, ?, '', ?, ?, ?, 0, ?, ?, ?)`);

    const pSched = Number(ins.run(uid, '/media/descarte-p1.mp4', 'video con subtítulos pisados (réplica del caso 653)', iso(Date.now() + 2 * H), 'scheduled', 'approved', 'video', null, '').lastInsertRowid);
    const pDraft = Number(ins.run(uid, '/media/descarte-p2.jpg', 'borrador de prueba', null, 'draft', 'pending', 'image', null, '').lastInsertRowid);
    const pPub = Number(ins.run(uid, '/media/descarte-p3.jpg', 'posteo ya publicado', iso(Date.now() - 24 * H), 'published', 'approved', 'image', iso(Date.now() - 24 * H), 'https://instagram.com/p/TEST/').lastInsertRowid);
    const pCanc = Number(ins.run(uid, '/media/descarte-p4.jpg', 'posteo ya cancelado', iso(Date.now() + 2 * H), 'cancelled', 'pending', 'image', null, '').lastInsertRowid);
    const pVecino = Number(ins.run(uid, '/media/descarte-p5.jpg', 'vecino que no se toca', iso(Date.now() + 3 * H), 'scheduled', 'approved', 'image', null, '').lastInsertRowid);
    t(pSched && pDraft && pPub && pCanc && pVecino, 'B2 siembra: scheduled · draft · published · cancelled · vecino');

    const fila = (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    const snapPub = JSON.stringify(fila(pPub));
    const snapVecino = JSON.stringify(fila(pVecino));
    const stopsAntes = db.prepare('SELECT COUNT(*) AS n FROM day_stops WHERE user_id = ?').get(uid).n;
    const nowMas4h = iso(Date.now() + 4 * H);
    const dueIds = () => db.prepare(DUE_SQL).all(nowMas4h).map((r) => r.id);
    const ocupados = () => db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE user_id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL`).get(uid).n;
    const logRows = () => db.prepare(`SELECT * FROM support_team_log WHERE post_id = ? AND action = 'descartar_posteo'`).all(pSched);

    t(dueIds().includes(pSched), 'B3 control: llegada su hora, el publicador TOMARÍA al programado (predicado exacto del scheduler)');
    t(ocupados() === 2, 'B4 ocupación antes del descarte: 2 programados (el objetivo y el vecino)', String(ocupados()));

    const sinToken = await reqJson('POST', `/api/admin/posts/${pSched}/descartar`, { motivo: 'x' });
    t(sinToken.status === 403, 'B5 sin token admin: 403', String(sinToken.status));
    const tokenMalo = await reqJson('POST', `/api/admin/posts/${pSched}/descartar?token=incorrecto`, { motivo: 'x' });
    t(tokenMalo.status === 403, 'B6 token admin incorrecto: 403', String(tokenMalo.status));
    t(fila(pSched).status === 'scheduled', 'B7 los intentos sin token no tocaron el posteo');

    const r1 = await reqJson('POST', `/api/admin/posts/${pSched}/descartar?token=${TOKEN}`, { motivo: 'video con subtítulos pisados (caso 653)' });
    t(r1.status === 200 && r1.json && r1.json.ok === true && r1.json.status === 'cancelled' && r1.json.status_anterior === 'scheduled' && r1.json.descartado === true,
      'B8 descartar el programado: 200, status cancelled, anterior scheduled', JSON.stringify(r1.json).slice(0, 200));
    t(fila(pSched).status === 'cancelled', 'B9 re-lectura en la base: el posteo quedó cancelled');
    t(!dueIds().includes(pSched) && dueIds().includes(pVecino), 'B10 el publicador ya NO lo toma llegada su hora; el vecino sigue en la cola');
    t(ocupados() === 1, 'B11 su día quedó libre: la ocupación baja a 1 (solo el vecino)', String(ocupados()));
    t(db.prepare('SELECT COUNT(*) AS n FROM day_stops WHERE user_id = ?').get(uid).n === stopsAntes, 'B12 sin marcas colaterales: day_stops no ganó filas (el descarte es de la pieza, no del día)');
    t(logRows().length === 1 && String(logRows()[0].detalle).includes('caso 653'), 'B13 el log del equipo registra el descarte con su motivo', JSON.stringify(logRows()).slice(0, 200));

    const r2 = await reqJson('POST', `/api/admin/posts/${pSched}/descartar?token=${TOKEN}`, { motivo: 'otra vez' });
    t(r2.status === 200 && r2.json && r2.json.ok === true && r2.json.ya_descartado === true && r2.json.descartado === false,
      'B14 segundo descarte: idempotente (200, ya_descartado, sin error)', JSON.stringify(r2.json).slice(0, 200));
    t(logRows().length === 1 && fila(pSched).status === 'cancelled', 'B15 el segundo descarte no duplica el registro ni cambia el estado');

    const r3 = await reqJson('POST', `/api/admin/posts/${pDraft}/descartar?token=${TOKEN}`, { motivo: 'borrador que no va' });
    t(r3.status === 200 && r3.json && r3.json.status === 'cancelled' && r3.json.status_anterior === 'draft' && fila(pDraft).status === 'cancelled',
      'B16 un borrador también se descarta en forma terminal', JSON.stringify(r3.json).slice(0, 200));

    const r4 = await reqJson('POST', `/api/admin/posts/${pPub}/descartar?token=${TOKEN}`, { motivo: 'no debería' });
    t(r4.status === 400 && r4.json && r4.json.motivo === 'ya_publicado', 'B17 lo publicado NO se descarta: 400 ya_publicado', JSON.stringify(r4.json).slice(0, 200));
    t(JSON.stringify(fila(pPub)) === snapPub, 'B18 el publicado quedó byte-idéntico tras el rechazo');

    const r5 = await reqJson('POST', `/api/admin/posts/${pCanc}/descartar?token=${TOKEN}`, {});
    t(r5.status === 200 && r5.json && r5.json.ya_descartado === true, 'B19 un cancelled sembrado responde idempotente', JSON.stringify(r5.json).slice(0, 200));

    const r6 = await reqJson('POST', `/api/admin/posts/999999/descartar?token=${TOKEN}`, {});
    t(r6.status === 404, 'B20 posteo inexistente: 404', String(r6.status));

    t(JSON.stringify(fila(pVecino)) === snapVecino, 'B21 el vecino quedó byte-idéntico tras todos los descartes');
    db.close();
  } finally {
    try { child.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  t(fs.existsSync(path.join(ROOT, 'data')) === dataDirAntes, 'B22 el boot no creó release/data/');

  console.log(`\nRESULTADO: ${pass} ok · ${fail} mal`);
  if (fails.length) { console.log('FALLAS:\n- ' + fails.join('\n- ')); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
