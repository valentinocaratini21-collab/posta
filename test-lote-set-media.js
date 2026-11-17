'use strict';
// test-lote-set-media.js — LOTE SET-MEDIA-ADMIN (emergencia video 695, 17/11):
// POST /api/admin/posts/:id/set-media {media, cover?} — reemplaza el medio de
// un posteo por un ARCHIVO NUEVO (data URI), escribiéndolo en MEDIA_DIR y
// actualizando image_path/media_type/carousel_paths/cover_path de la fila.
// set-image solo copia medios desde otro posteo y pieza-mano solo escribe en
// semanas de prueba de invitados: la cuenta del dueño no tenía vía de subir
// el video corregido sobre el posteo ya programado.
// Guardas espejo de set-image: sin token → 403 · inexistente → 404 ·
// published/cancelled → 400 (ya_publicado/cancelado) · media inválida → 400.
// Portada: con `cover` en el body se guarda y es la portada; sin `cover`,
// cover_path se LIMPIA (el publicador tolera la ausencia — scheduler.js pasa
// coverUrl '' e instagram.js solo agrega cover_url si hay — y las
// superficies extraen el frame del video nuevo vía asegurarCoverDeVideo).
// Node puro: estáticos + boot real con DATA_DIR/MEDIA_DIR aislados.
// Puerto 35441. Uso: node test-lote-set-media.js
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
t(srv.includes("const BUILD_ID = '20261105-v1165';"), 'server: BUILD v1165 (sin tocar el estampado)');
t(cnt(srv, '20261105-v1165') === 1, 'server: BUILD v1165 ×1');
t(srv.includes("app.post('/api/admin/posts/:id/set-media', requireAdminToken, express.json({ limit: '16mb' })"), '[FIX] server: ruta set-media presente con requireAdminToken y json 16mb');
t(cnt(srv, "'/api/admin/posts/:id/set-media'") === 1, '[FIX] server: la ruta set-media aparece una sola vez');
t(srv.includes("app.post('/api/admin/posts/:id/set-image', requireAdminToken"), 'server: set-image sigue presente sin tocar');
t(srv.includes("app.post('/api/admin/trial/pieza-mano', requireAdminToken"), 'server: pieza-mano sigue presente sin tocar');
t(srv.includes("const requireAdminToken = (req, res, next) => {"), 'server: requireAdminToken intacto (misma auth)');
t(md5(path.join(DIR, 'public/app.js')) === 'e71ecfd5d45205e55dde1d89f9c6aade', 'app.js byte-idéntico a base v1165 (el lote no toca cliente)');
t(md5(path.join(DIR, 'public/index.html')) === 'e9006ece98a683dadd8b92c6d38d8e0a', 'index ES byte-idéntico a base v1165');
t(md5(path.join(DIR, 'scheduler.js')) === '627a350a3f809bf20e2534f5c30769fa', 'scheduler.js byte-idéntico a base v1165');
t(md5(path.join(DIR, 'instagram.js')) === '92a769244629d764333cc334dcc42dea', 'instagram.js byte-idéntico a base v1165');
t(md5(path.join(DIR, 'db.js')) === '116d099f6baa81c3014a13dd78e26069', 'db.js byte-idéntico a base v1165');
try { execSync('node --check server.js', { cwd: DIR, stdio: 'pipe' }); t(true, 'server.js: node --check OK'); } catch (e) { t(false, 'server.js: node --check OK'); }

// ---------- B. Boot real ----------
const PORT = 35441;
const ADMIN_TOKEN = 'test-set-media-token';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'set-media-boot-'));
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

// Medios de prueba: bytes reconocibles (el endpoint no valida magic bytes,
// igual que pieza-mano; lo que importa es que el archivo escrito sea exacto).
const IMG_BYTES = Buffer.from('POSTY-SET-MEDIA-JPEG-695');
const IMG_URI = 'data:image/jpeg;base64,' + IMG_BYTES.toString('base64');
const VID_BYTES = Buffer.from('POSTY-SET-MEDIA-MP4-695-CORREGIDO');
const VID_URI = 'data:video/mp4;base64,' + VID_BYTES.toString('base64');
const COVER_BYTES = Buffer.from('POSTY-SET-MEDIA-COVER-PNG');
const COVER_URI = 'data:image/png;base64,' + COVER_BYTES.toString('base64');

(async () => {
  console.log('— B) boot real: reemplazar medios por API admin set-media —');
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
    t(ver.status === 200 && ver.json && ver.json.build === '20261105-v1165', 'boot: /api/version trae el BUILD v1165', JSON.stringify(ver.json));
    const dbPath = path.join(tmpDir, 'posta.db');
    t(fs.existsSync(dbPath), 'boot: la DB existe en el DATA_DIR temporal');

    const F1 = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const F2 = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const F_PAST = new Date(Date.now() - 3600 * 1000).toISOString();

    const ids = {};
    seedDb(dbPath, (db) => {
      const u1 = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?,?)`).run('dueno@posty.test', 'x');
      const u2 = db.prepare(`INSERT INTO users (email, password_hash) VALUES (?,?)`).run('otro@posty.test', 'x');
      ids.u1 = Number(u1.lastInsertRowid); ids.u2 = Number(u2.lastInsertRowid);
      const ins = db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, carousel_paths, cover_path, cover_origin, cover_pos, user_stopped, week_key, needs_review)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      // Programado que hoy es carrusel con portada vieja: recibe una imagen nueva.
      ids.pCarr = Number(ins.run(ids.u1, '/media/car1.jpg', 'caption que no se toca', '#intacto', F1, 'scheduled', 'carousel', '["/media/car1.jpg","/media/car2.jpg"]', '/media/cover-viejo.jpg', 'frame@0.5', 30, 0, '', 0).lastInsertRowid);
      // El caso 695: programado, video con póster del video viejo.
      ids.pVideo = Number(ins.run(ids.u1, '/media/video-viejo.mp4', 'video de hoy', '', F2, 'scheduled', 'video', '', '/media/cover-del-video-viejo.jpg', 'frame@1.2', 30, 0, '', 0).lastInsertRowid);
      // Borrador que recibe video CON portada nueva.
      ids.pDraft = Number(ins.run(ids.u1, '/media/borrador.jpg', 'borrador para video con portada', '', null, 'draft', 'image', '', '', '', 50, 0, '', 0).lastInsertRowid);
      // Publicado y cancelado (rechazos) + un programado de otro usuario (intocable).
      ids.pPub = Number(ins.run(ids.u1, '/media/pub.jpg', 'ya publicado', '', F_PAST, 'published', 'image', '', '', '', 50, 0, '', 0).lastInsertRowid);
      ids.pCanc = Number(ins.run(ids.u1, '/media/canc.mp4', 'cancelado', '', null, 'cancelled', 'video', '', '/media/cover-canc.jpg', '', 50, 0, '', 0).lastInsertRowid);
      ids.pOtro = Number(ins.run(ids.u2, '/media/otro.jpg', 'de otro usuario', '', F1, 'scheduled', 'image', '', '', '', 50, 0, '', 0).lastInsertRowid);
    });
    t(ids.pCarr > 0 && ids.pVideo > 0 && ids.pDraft > 0 && ids.pPub > 0 && ids.pCanc > 0 && ids.pOtro > 0, 'boot: siembra completa ok', JSON.stringify(ids));
    const readPost = (id) => seedDb(dbPath, (db) => db.prepare(`SELECT * FROM posts WHERE id = ?`).get(id));
    const setMedia = (id, body, tokenMode) => {
      const q = tokenMode === 'none' ? '' : tokenMode === 'wrong' ? '?token=mal' : `?token=${ADMIN_TOKEN}`;
      return reqJson('POST', `/api/admin/posts/${id}/set-media` + q, body);
    };
    const mediaFileBytes = (imagePath) => {
      const name = String(imagePath || '').replace('/media/', '');
      const abs = path.join(mediaDir, name);
      return fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    };

    // ---------- rechazos ----------
    let r = await setMedia(ids.pCarr, { media: IMG_URI }, 'none');
    t(r.status === 403, 'set-media: sin token admin → 403', 'status=' + r.status);
    r = await setMedia(ids.pCarr, { media: IMG_URI }, 'wrong');
    t(r.status === 403, 'set-media: token equivocado → 403', 'status=' + r.status);
    r = await setMedia(999999, { media: IMG_URI });
    t(r.status === 404 && r.json && r.json.error === 'no_existe', 'set-media: posteo inexistente → 404 no_existe', JSON.stringify(r.json));
    r = await setMedia(ids.pCarr, { media: 'esto-no-es-una-data-uri' });
    t(r.status === 400 && r.json && /media inválida/.test(r.json.error || ''), 'set-media: media que no es data URI → 400', JSON.stringify(r.json));
    r = await setMedia(ids.pCarr, { media: 'data:text/plain;base64,AAAA' });
    t(r.status === 400, 'set-media: data URI de texto → 400', 'status=' + r.status);
    r = await setMedia(ids.pCarr, {});
    t(r.status === 400, 'set-media: sin media → 400', 'status=' + r.status);
    r = await setMedia(ids.pCarr, { media: 'data:image/png;base64,!!!' });
    t(r.status === 400, 'set-media: base64 que decodifica vacío → 400', 'status=' + r.status);
    r = await setMedia(ids.pPub, { media: IMG_URI });
    t(r.status === 400 && r.json && r.json.motivo === 'ya_publicado', 'set-media: publicado → 400 ya_publicado', JSON.stringify(r.json));
    t(readPost(ids.pPub).image_path === '/media/pub.jpg', 'set-media: el rechazo no tocó el publicado');
    r = await setMedia(ids.pCanc, { media: VID_URI });
    t(r.status === 400 && r.json && r.json.motivo === 'cancelado', 'set-media: cancelado → 400 cancelado', JSON.stringify(r.json));
    const cancRow = readPost(ids.pCanc);
    t(cancRow.image_path === '/media/canc.mp4' && cancRow.cover_path === '/media/cover-canc.jpg', 'set-media: el rechazo no tocó el cancelado');
    t(fs.readdirSync(mediaDir).length === 0, 'set-media: ningún rechazo escribió archivos', fs.readdirSync(mediaDir).join(','));

    // ---------- imagen válida sobre un programado (que era carrusel) ----------
    r = await setMedia(ids.pCarr, { media: IMG_URI });
    t(r.status === 200 && r.json && r.json.ok === true && r.json.cambiado === true, '[FIX] set-media: imagen válida sobre programado → 200 cambiado', JSON.stringify(r.json));
    t(/^\/media\/admin-\d+-[0-9a-f]{12}\.jpg$/.test((r.json || {}).image_path || ''), '[FIX] set-media: image_path nuevo con nombre admin-*.jpg (jpeg→jpg)', (r.json || {}).image_path);
    t(r.json && r.json.media_type === 'image' && r.json.carousel_paths === '' && r.json.cover_path === '', '[FIX] set-media: la respuesta trae media_type image, sin carrusel, sin portada', JSON.stringify(r.json));
    let row = readPost(ids.pCarr);
    t(row.image_path === r.json.image_path && row.media_type === 'image' && row.carousel_paths === '' && row.cover_path === '' && row.cover_origin === '', '[FIX] set-media: la fila quedó con la imagen nueva y dejó de ser carrusel', JSON.stringify({ img: row.image_path, mt: row.media_type, car: row.carousel_paths, cov: row.cover_path }));
    t(row.caption === 'caption que no se toca' && row.hashtags === '#intacto' && row.status === 'scheduled' && row.scheduled_at === F1, 'set-media: caption, hashtags, status y scheduled_at intactos', JSON.stringify({ cap: row.caption, at: row.scheduled_at }));
    const imgFile = mediaFileBytes(r.json.image_path);
    t(imgFile && imgFile.equals(IMG_BYTES), '[FIX] set-media: el archivo escrito en MEDIA_DIR tiene los bytes exactos');

    // Repetir con el mismo archivo: mismo contenido visible, nombre nuevo.
    const primeraPath = r.json.image_path;
    r = await setMedia(ids.pCarr, { media: IMG_URI });
    t(r.status === 200 && r.json && r.json.image_path !== primeraPath, 'set-media: repetir la llamada → nombre de archivo nuevo (declarado)', JSON.stringify({ a: primeraPath, b: (r.json || {}).image_path }));
    const imgFile2 = mediaFileBytes((r.json || {}).image_path);
    t(imgFile2 && imgFile2.equals(IMG_BYTES) && readPost(ids.pCarr).image_path === r.json.image_path, 'set-media: el contenido visible tras repetir es el mismo archivo lógico');

    // ---------- video válido SIN portada sobre el programado (caso 695) ----------
    r = await setMedia(ids.pVideo, { media: VID_URI });
    t(r.status === 200 && r.json && r.json.ok === true && r.json.media_type === 'video', '[FIX] set-media: video válido sobre programado → 200 video', JSON.stringify(r.json));
    t(/^\/media\/admin-\d+-[0-9a-f]{12}\.mp4$/.test((r.json || {}).image_path || ''), '[FIX] set-media: image_path nuevo admin-*.mp4', (r.json || {}).image_path);
    row = readPost(ids.pVideo);
    t(row.image_path === r.json.image_path && row.media_type === 'video' && row.carousel_paths === '', '[FIX] set-media: la fila quedó con el video nuevo', JSON.stringify({ img: row.image_path, mt: row.media_type }));
    t(row.cover_path === '' && row.cover_origin === '' && row.cover_pos === 50, '[FIX] set-media: sin portada en el body, la portada vieja se LIMPIA (cover/origin/pos como quitar-portada)', JSON.stringify({ cov: row.cover_path, ori: row.cover_origin, pos: row.cover_pos }));
    t(row.caption === 'video de hoy' && row.status === 'scheduled' && row.scheduled_at === F2, 'set-media: el video conserva caption, status y horario', JSON.stringify({ cap: row.caption, at: row.scheduled_at }));
    const vidFile = mediaFileBytes(r.json.image_path);
    t(vidFile && vidFile.equals(VID_BYTES), '[FIX] set-media: el .mp4 escrito tiene los bytes exactos');

    // ---------- portada inválida, después video CON portada ----------
    r = await setMedia(ids.pDraft, { media: VID_URI, cover: 'data:video/mp4;base64,AAAA' });
    t(r.status === 400 && r.json && /portada inválida/.test(r.json.error || ''), 'set-media: portada que no es imagen → 400', JSON.stringify(r.json));
    t(readPost(ids.pDraft).image_path === '/media/borrador.jpg', 'set-media: la portada inválida no tocó el borrador');
    r = await setMedia(ids.pDraft, { media: VID_URI, cover: COVER_URI });
    t(r.status === 200 && r.json && r.json.media_type === 'video' && /^\/media\/admin-\d+-[0-9a-f]{12}\.png$/.test(r.json.cover_path || ''), '[FIX] set-media: video con portada → cover_path nuevo admin-*.png', JSON.stringify(r.json));
    row = readPost(ids.pDraft);
    t(row.cover_path === r.json.cover_path && row.cover_origin === 'admin' && row.media_type === 'video', '[FIX] set-media: la fila guarda la portada nueva con origen admin', JSON.stringify({ cov: row.cover_path, ori: row.cover_origin }));
    const covFile = mediaFileBytes(r.json.cover_path);
    t(covFile && covFile.equals(COVER_BYTES), '[FIX] set-media: el archivo de portada tiene los bytes exactos');

    // ---------- ningún otro posteo se tocó ----------
    const otro = readPost(ids.pOtro);
    t(otro.image_path === '/media/otro.jpg' && otro.status === 'scheduled' && otro.scheduled_at === F1, 'set-media: el posteo de otro usuario quedó intacto');
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
  console.log(`\nset-media-admin: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})();
