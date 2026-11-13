'use strict';
// test-lote-admin-programar-imagen.js — LOTE ADMIN-PROGRAMAR-IMAGEN (emergencia
// tira pastelería 13/11): dos endpoints admin que faltaban para operar el feed
// propio sin la app:
//  1) POST /api/admin/posts/:id/schedule {scheduled_at} — fija la fecha/hora
//     de un borrador (o mueve uno ya programado) espejando la escritura del
//     flujo normal (status='scheduled', ISO UTC completo, error='', notified=0,
//     user_stopped=0, week_key re-derivada). El video de la tira había quedado
//     asignado a un martes y frenado: no existía vía de ponerlo el sábado.
//  2) POST /api/admin/posts/:id/set-image {from_post_id} — copia la imagen de
//     otro posteo del MISMO usuario (image_path, media_type, carousel_paths,
//     cover_path): la foto correcta había quedado en un posteo donante y el
//     del día con la imagen vieja, sin vía de reemplazarla en el lugar.
// Misma autenticación que edit-caption (requireAdminToken, ?token=).
// Node puro: estáticos + boot real con DATA_DIR aislada. Puerto 35121.
// Uso: node test-lote-admin-programar-imagen.js
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

// Réplicas exactas de los helpers del server (para la expectativa week_key).
function mondayKeyOf(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1, 12));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}
function ymdInTz(iso, tz) {
  if (!iso) return null;
  try {
    const d = new Date(String(iso).length === 16 ? iso : String(iso).replace(' ', 'T'));
    if (isNaN(d)) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch { return null; }
}
const TZ_DEFAULT = 'America/Argentina/Buenos_Aires'; // userTz sin settings sembrados

// ---------- A. Estáticos ----------
t(srv.includes("const BUILD_ID = '20261105-v1008';"), 'server: BUILD v1008');
t(cnt(srv, '20261105-v1008') === 1, 'server: BUILD v1008 ×1 (solo el estampado)');
t(cnt(srv, '20261105-v1007') === 0, 'server: sin restos de v1007');
t(srv.includes("app.post('/api/admin/posts/:id/schedule', requireAdminToken"), 'server: ruta schedule presente con requireAdminToken');
t(srv.includes("app.post('/api/admin/posts/:id/set-image', requireAdminToken"), 'server: ruta set-image presente con requireAdminToken');
t(srv.includes("app.post('/api/admin/posts/:id/edit-caption', requireAdminToken"), 'server: edit-caption (v965) sigue presente sin tocar');
t(srv.includes("const requireAdminToken = (req, res, next) => {"), 'server: requireAdminToken intacto (misma auth)');
t(md5(path.join(DIR, 'public/app.js')) === '2da0803d824db348797073cdcf12ab56', 'app.js byte-idéntico a base v1007 (sin ?v=)');
t(md5(path.join(DIR, 'public/styles.css')) === '112435a0ccd1ec98678e80c645a43c38', 'styles.css byte-idéntico a base v1007');
t(md5(path.join(DIR, 'public/index.html')) === '5f0758dcdee743633dec56576132e4e3', 'index ES byte-idéntico a base v1007');
t(md5(path.join(DIR, 'db.js')) === 'bdbcd6da368b5c4c6fba1ff0386468cf', 'db.js byte-idéntico a base v1007');
t(md5(path.join(DIR, 'scheduler.js')) === '11464386cb1bb21f94647ecc4813c906', 'scheduler.js byte-idéntico a base v1007');
t(md5(path.join(DIR, 'generator.js')) === 'b1138d3b920136ef873530fed7e6e7e3', 'generator.js byte-idéntico a base v1007 (lo de Juli intacto)');
t(md5(path.join(DIR, 'demo-captions.js')) === '57fb508dadb8fb52ef1b2acfb24fd6df', 'demo-captions.js byte-idéntico a base v1007 (lo de Juli intacto)');
t(md5(path.join(DIR, 'caption-style.js')) === '0144a4265dcfb27211aec084715c12df', 'caption-style.js byte-idéntico a base v1007 (lo de Juli intacto)');
try { execSync('node --check server.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'server.js: node --check OK'); } catch (e) { t(false, 'server.js: node --check OK'); }

// ---------- B. Boot real ----------
const PORT = 35121;
const ADMIN_TOKEN = 'boot-test-token-admin-programar-imagen';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-programar-imagen-boot-'));
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
  console.log('— B) boot real: programar y copiar imagen por API admin —');
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
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v1008', 'boot: /api/version trae el BUILD v1008', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    t(fs.existsSync(dbPath), 'boot: la DB existe en el DATA_DIR temporal');

    // Instantes de la corrida (siempre futuros respecto del boot).
    const F1 = new Date(Date.now() + 48 * 3600 * 1000).toISOString();       // destino del video frenado
    const F_MAL = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(); // fecha equivocada original
    const F2 = new Date(Date.now() + 72 * 3600 * 1000).toISOString();        // destino del programado a mover
    const F_HOY = new Date(Date.now() + 5 * 3600 * 1000).toISOString();      // el posteo de hoy (caso 649)
    const F_DOM = new Date(Date.now() + 55 * 3600 * 1000).toISOString();     // el del domingo (caso 582)
    const F_PAST = new Date(Date.now() - 3600 * 1000).toISOString();

    const ids = {};
    seedDb(dbPath, (db) => {
      const u1 = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?,?)`).run('dueno@posty.test', 'x');
      const u2 = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?,?)`).run('otro@posty.test', 'x');
      ids.u1 = Number(u1.lastInsertRowid); ids.u2 = Number(u2.lastInsertRowid);
      const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, carousel_paths, cover_path, user_stopped, week_key, needs_review)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      // El video de la tira: frenado (draft + user_stopped) tras asignarse mal.
      ids.pVideo = Number(ins.run(ids.u1, '/media/video-tira.mp4', 'video del sábado', '', null, 'draft', 'video', '', '/media/video-tira-cover.jpg', 1, '', 0).lastInsertRowid);
      // El donante de la foto correcta (borrador, caso 657).
      ids.pDonorFoto = Number(ins.run(ids.u1, '/media/medialunas-posty.jpg', 'foto correcta del domingo', '', null, 'draft', 'image', '', '', 0, '', 0).lastInsertRowid);
      // El posteo del domingo: programado, caption exacto, imagen vieja (caso 582).
      ids.pDomingo = Number(ins.run(ids.u1, '/media/imagen-vieja.jpg', 'caption exacto del domingo', '', F_DOM, 'scheduled', 'image', '', '', 0, '', 0).lastInsertRowid);
      // El posteo de hoy: programado, imagen equivocada (caso 649) + su donante de banda correcta.
      ids.pHoy = Number(ins.run(ids.u1, '/media/titulo-arriba.jpg', 'posteo de hoy', '', F_HOY, 'scheduled', 'image', '', '', 0, '', 0).lastInsertRowid);
      ids.pDonorHoy = Number(ins.run(ids.u1, '/media/banda-inferior.jpg', 'donante de hoy', '', null, 'draft', 'image', '', '', 0, '', 0).lastInsertRowid);
      // Un programado con fecha equivocada (para mover) y un borrador simple.
      ids.pMover = Number(ins.run(ids.u1, '/media/mover.jpg', 'programado en fecha mala', '', F_MAL, 'scheduled', 'image', '', '', 0, '', 0).lastInsertRowid);
      ids.pSimple = Number(ins.run(ids.u1, '/media/simple.jpg', 'borrador simple', '', null, 'draft', 'image', '', '', 0, '', 0).lastInsertRowid);
      // Donante carrusel.
      ids.pDonorCar = Number(ins.run(ids.u1, '/media/car1.jpg', 'donante carrusel', '', null, 'draft', 'carousel', '["/media/car1.jpg","/media/car2.jpg"]', '', 0, '', 0).lastInsertRowid);
      // Publicado, cancelado y borrador sin imagen.
      ids.pPub = Number(ins.run(ids.u1, '/media/pub.jpg', 'ya publicado', '', F_PAST, 'published', 'image', '', '', 0, '', 0).lastInsertRowid);
      ids.pCanc = Number(ins.run(ids.u1, '/media/canc.jpg', 'cancelado', '', null, 'cancelled', 'image', '', '', 0, '', 0).lastInsertRowid);
      ids.pSinImg = Number(ins.run(ids.u1, '', 'borrador sin imagen', '', null, 'draft', 'image', '', '', 0, '', 0).lastInsertRowid);
      // Posteo de OTRO usuario (donante cross-usuario).
      ids.pOtro = Number(ins.run(ids.u2, '/media/otro.jpg', 'de otro usuario', '', null, 'draft', 'image', '', '', 0, '', 0).lastInsertRowid);
    });
    t(ids.pVideo > 0 && ids.pDonorFoto > 0 && ids.pDomingo > 0 && ids.pHoy > 0 && ids.pMover > 0 && ids.pPub > 0 && ids.pOtro > 0, 'boot: siembra completa ok', JSON.stringify(ids));
    const readPost = (id) => seedDb(dbPath, (db) => db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id));
    const sched = (id, body, withToken) => reqJson('POST', `/api/admin/posts/${id}/schedule` + (withToken === false ? '' : `?token=${ADMIN_TOKEN}`), body);
    const setImg = (id, body, withToken) => reqJson('POST', `/api/admin/posts/${id}/set-image` + (withToken === false ? '' : `?token=${ADMIN_TOKEN}`), body);

    // ---------- schedule: rechazos ----------
    let r = await sched(ids.pVideo, { scheduled_at: F1 }, false);
    t(r.status === 403, 'schedule: sin token admin → 403', 'status=' + r.status);
    r = await sched(999999, { scheduled_at: F1 });
    t(r.status === 404 && r.json && r.json.error === 'no_existe', 'schedule: id inexistente → 404', JSON.stringify(r.json));
    r = await sched(ids.pVideo, {});
    t(r.status === 400 && r.json && r.json.error === 'falta scheduled_at', 'schedule: sin scheduled_at → 400', JSON.stringify(r.json));
    r = await sched(ids.pVideo, { scheduled_at: 'no-es-una-fecha' });
    t(r.status === 400 && r.json && r.json.motivo === 'fecha_invalida', 'schedule: fecha inválida → 400 fecha_invalida', JSON.stringify(r.json));
    r = await sched(ids.pVideo, { scheduled_at: F_PAST });
    t(r.status === 400 && r.json && r.json.motivo === 'fecha_pasada', 'schedule: fecha pasada → 400 fecha_pasada', JSON.stringify(r.json));
    r = await sched(ids.pPub, { scheduled_at: F1 });
    t(r.status === 400 && r.json && r.json.motivo === 'ya_publicado', 'schedule: publicado → 400 ya_publicado', JSON.stringify(r.json));
    r = await sched(ids.pCanc, { scheduled_at: F1 });
    t(r.status === 400 && r.json && r.json.motivo === 'cancelado', 'schedule: cancelado → 400 cancelado', JSON.stringify(r.json));
    t(readPost(ids.pVideo).status === 'draft', 'schedule: los rechazos no tocaron el borrador');

    // ---------- schedule: el video frenado va a su fecha ----------
    r = await sched(ids.pVideo, { scheduled_at: F1 });
    t(r.status === 200 && r.json && r.json.ok === true && r.json.status === 'scheduled' && r.json.scheduled_at === F1, 'schedule: borrador frenado → programado en el instante exacto', JSON.stringify(r.json));
    let row = readPost(ids.pVideo);
    t(row.status === 'scheduled' && row.scheduled_at === F1 && row.user_stopped === 0 && (row.error || '') === '', 'schedule: la fila queda como la del flujo normal (scheduled, sin stop, sin error)', JSON.stringify({ status: row.status, at: row.scheduled_at, stop: row.user_stopped }));
    const wkEsperada = mondayKeyOf(ymdInTz(F1, TZ_DEFAULT));
    t(row.week_key === wkEsperada && r.json.week_key === wkEsperada, 'schedule: week_key re-derivada de la fecha (lunes de su semana)', `db=${row.week_key} esperada=${wkEsperada}`);
    t(row.image_path === '/media/video-tira.mp4' && row.caption === 'video del sábado', 'schedule: no tocó imagen ni caption');

    // La consulta EXACTA del scheduler (processDuePosts) lo ve como propio:
    // vencido a su hora, invisible un minuto antes.
    const DUE_SQL = `SELECT p.*, u.id AS uid FROM posts p JOIN users u ON u.id = p.user_id
       WHERE p.status = 'scheduled' AND p.scheduled_at <= ?
       AND COALESCE(p.needs_review, 0) = 0
       ORDER BY (CASE WHEN p.media_type = 'story' THEN 1 ELSE 0 END) ASC, p.scheduled_at ASC LIMIT 5`;
    const dueAt = (nowIso) => seedDb(dbPath, (db) => db.prepare(DUE_SQL).all(nowIso).map((p) => p.id));
    t(dueAt(F1).includes(ids.pVideo), 'scheduler: la consulta de vencidos lo incluye a su hora');
    t(!dueAt(new Date(Date.parse(F1) - 60 * 1000).toISOString()).includes(ids.pVideo), 'scheduler: un minuto antes NO está vencido');

    // Mover un programado con fecha equivocada + idempotencia del mismo instante.
    r = await sched(ids.pMover, { scheduled_at: F2 });
    t(r.status === 200 && r.json && r.json.movido === true && r.json.scheduled_at === F2, 'schedule: programado con fecha mala → movido', JSON.stringify(r.json));
    t(readPost(ids.pMover).scheduled_at === F2, 'schedule: la fila quedó con la fecha nueva');
    r = await sched(ids.pMover, { scheduled_at: F2 });
    t(r.status === 200 && r.json && r.json.ya_programado === true && r.json.movido === false, 'schedule: mismo instante de nuevo → ya_programado, sin daño', JSON.stringify(r.json));

    // ---------- set-image: rechazos ----------
    r = await setImg(ids.pDomingo, { from_post_id: ids.pDonorFoto }, false);
    t(r.status === 403, 'set-image: sin token admin → 403', 'status=' + r.status);
    r = await setImg(999999, { from_post_id: ids.pDonorFoto });
    t(r.status === 404 && r.json && r.json.error === 'no_existe', 'set-image: destino inexistente → 404', JSON.stringify(r.json));
    r = await setImg(ids.pDomingo, { from_post_id: 999999 });
    t(r.status === 404 && r.json && r.json.error === 'origen_no_existe', 'set-image: origen inexistente → 404', JSON.stringify(r.json));
    r = await setImg(ids.pDomingo, {});
    t(r.status === 400 && r.json && r.json.error === 'falta from_post_id', 'set-image: sin from_post_id → 400', JSON.stringify(r.json));
    r = await setImg(ids.pDomingo, { from_post_id: ids.pDomingo });
    t(r.status === 400 && r.json && r.json.motivo === 'mismo_posteo', 'set-image: mismo posteo → 400', JSON.stringify(r.json));
    r = await setImg(ids.pSimple, { from_post_id: ids.pOtro });
    t(r.status === 400 && r.json && r.json.motivo === 'otro_usuario', 'set-image: donante de otro usuario → 400 otro_usuario', JSON.stringify(r.json));
    t(readPost(ids.pSimple).image_path === '/media/simple.jpg', 'set-image: el rechazo cross-usuario no tocó el destino');
    r = await setImg(ids.pPub, { from_post_id: ids.pDonorFoto });
    t(r.status === 400 && r.json && r.json.motivo === 'ya_publicado', 'set-image: destino publicado → 400 ya_publicado', JSON.stringify(r.json));
    r = await setImg(ids.pSimple, { from_post_id: ids.pSinImg });
    t(r.status === 400 && r.json && r.json.motivo === 'origen_sin_imagen', 'set-image: origen sin imagen → 400', JSON.stringify(r.json));

    // ---------- set-image: caso domingo (destino programado, caption y fecha intocados) ----------
    const donorAntes = readPost(ids.pDonorFoto);
    r = await setImg(ids.pDomingo, { from_post_id: ids.pDonorFoto });
    t(r.status === 200 && r.json && r.json.ok === true && r.json.cambiado === true && r.json.image_path === '/media/medialunas-posty.jpg', 'set-image: el domingo recibe la foto del donante', JSON.stringify(r.json));
    row = readPost(ids.pDomingo);
    t(row.image_path === '/media/medialunas-posty.jpg' && row.media_type === 'image' && row.caption === 'caption exacto del domingo' && row.status === 'scheduled' && row.scheduled_at === F_DOM, 'set-image: imagen nueva con caption, status y fecha intactos', JSON.stringify({ img: row.image_path, cap: row.caption, at: row.scheduled_at }));
    const donorDespues = readPost(ids.pDonorFoto);
    t(donorDespues.image_path === donorAntes.image_path && donorDespues.status === donorAntes.status && donorDespues.caption === donorAntes.caption, 'set-image: el donante queda intacto');
    r = await setImg(ids.pDomingo, { from_post_id: ids.pDonorFoto });
    t(r.status === 200 && r.json && r.json.cambiado === false, 'set-image: repetir la copia → cambiado=false (idempotente)', JSON.stringify(r.json));

    // ---------- set-image: caso de hoy (649) y viajes completos de medios ----------
    r = await setImg(ids.pHoy, { from_post_id: ids.pDonorHoy });
    t(r.status === 200 && r.json && r.json.image_path === '/media/banda-inferior.jpg', 'set-image: el posteo de hoy recibe la imagen buena', JSON.stringify(r.json));
    row = readPost(ids.pHoy);
    t(row.status === 'scheduled' && row.scheduled_at === F_HOY && row.image_path === '/media/banda-inferior.jpg', 'set-image: el de hoy conserva su horario de hoy');
    r = await setImg(ids.pSimple, { from_post_id: ids.pVideo });
    t(r.status === 200 && r.json && r.json.media_type === 'video' && r.json.cover_path === '/media/video-tira-cover.jpg', 'set-image: un video viaja con su portada', JSON.stringify(r.json));
    row = readPost(ids.pSimple);
    t(row.image_path === '/media/video-tira.mp4' && row.media_type === 'video' && row.cover_path === '/media/video-tira-cover.jpg', 'set-image: la fila destino es el video completo');
    const pSimple2 = seedDb(dbPath, (db) => Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, status) VALUES (?,?,?,?)`).run(ids.u1, '/media/otra.jpg', 'otro borrador', 'draft').lastInsertRowid));
    r = await setImg(pSimple2, { from_post_id: ids.pDonorCar });
    t(r.status === 200 && r.json && r.json.media_type === 'carousel' && r.json.carousel_paths === '["/media/car1.jpg","/media/car2.jpg"]', 'set-image: un carrusel viaja con todas sus fotos', JSON.stringify(r.json));
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
  console.log(`\nadmin-programar-imagen: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
