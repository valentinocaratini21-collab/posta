// test-lote-puerta-pieza.js — LOTE PUERTA-PIEZA-MANO (emergencia):
// la línea a mano no tenía puerta para cargar una pieza TERMINADA en
// una cuenta que no es invitada de prueba. La creación de posteos es
// solo por sesión del dueño (POST /api/posts, cookie httpOnly), la UI
// no tiene compositor manual, «Que Posty lo arme» no crea nada en la
// cuenta propia (freno correcto) y pieza-mano solo escribe en semanas
// de prueba (trial_cache). pedidos-subir/:id/aprobar no sirve para una
// pieza terminada: genera el caption por software, agenda desde
// mañana y aplica enhancePhotoGenerate sobre la foto.
//
// El lote: POST /api/admin/posts/cargar-pieza (requireAdminToken) —
// la puerta del OPERADOR para cualquier cuenta, con la semántica
// exacta de la creación por sesión: caption/hashtags VERBATIM,
// scheduled_at exacto, status 'scheduled', needs_review nace 0 + el
// mismo lint v198-A, anti-duplicado por caption (el de crear, 24 h, y
// el de programar, 7 días), veredicto de integridad pre-publicación en
// la respuesta, y cierre opcional del pedido-subir contra el posteo
// (queda 'armado': un aprobar posterior no crea nada). Marca de
// origen: source='pieza-mano' (la de las semanas de prueba es 'trial',
// atada a la semana importada; no se reutiliza en cuentas reales).
//
// Modo CONTROL (PPM_CONTROL=1, correr dentro del árbol base v1202):
// la ruta no existe (404). Uso: node test-lote-puerta-pieza.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const CONTROL = process.env.PPM_CONTROL === '1';
const PORT = 35171;
const BASE = `http://127.0.0.1:${PORT}`;
const tmpDir = '/tmp/ppm-suite-' + process.pid;
const TOK = 'adm-ppm';
const RUTA = '/api/admin/posts/cargar-pieza';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗', name, extra ? '— ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''); }
}
function dbOpen() { return new DatabaseSync(path.join(tmpDir, 'posta.db')); }
async function call(method, url, body, token) {
  const u = token === undefined ? url : url + (url.includes('?') ? '&' : '?') + 'token=' + token;
  const r = await fetch(BASE + u, {
    method, headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, json: j };
}
async function register(email) {
  const r = await fetch(BASE + '/api/auth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'secreto1' }),
  });
  return r.status;
}

const CAP_NEON = 'EL NEÓN ⚡ la tira nueva, tal cual salió de la zapatería  ';
const CAP_NEON_TAGS = '#sneakers  #neon #street';
const SLOT_HOY = '2026-11-21T00:00:00.000Z';

async function main() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const srv = spawn('node', ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: tmpDir, OPENAI_API_KEY: '', ADMIN_TOKEN: TOK, SUPERVISION_HOOK_URL: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const srvPid = srv.pid;
  let log = '';
  srv.stdout.on('data', (d) => { log += d; });
  srv.stderr.on('data', (d) => { log += d; });
  try {
    let up = false;
    for (let i = 0; i < 90 && !up; i++) {
      try { const r = await fetch(BASE + '/api/version'); if (r.ok) up = true; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    t('B0 server booteó', up, log.slice(-400));
    if (!up) return;

    // ---------- Siembra: cuentas + material + pedido ----------
    // La cuenta A lleva el email del fundador (la forma de la cuenta
    // 12: el lint v198-A exime al fundador, needs_review queda 0).
    const stA = await register('valentino_bamboo@hotmail.com');
    const stB = await register('otra-duena@example.com');
    const stG = await register('invitada@example.com');
    t('B0b registros ok', [stA, stB, stG].every((s) => s === 200 || s === 201), [stA, stB, stG].join(','));

    const mediaDir = path.join(tmpDir, 'media');
    fs.mkdirSync(mediaDir, { recursive: true });
    const FILES = {
      neon: ['ppm-neon.jpg', Buffer.from('JPEGDATA-NEON-' + 'x'.repeat(500))],
      neon2: ['ppm-neon2.jpg', Buffer.from('JPEGDATA-NEON2-' + 'y'.repeat(500))],
      pub: ['ppm-pub.jpg', Buffer.from('JPEGDATA-PUB-' + 'z'.repeat(500))],
      pub2: ['ppm-pub2.jpg', Buffer.from('JPEGDATA-PUB-' + 'z'.repeat(500))], // bytes idénticos a pub
      ajena: ['ppm-ajena.jpg', Buffer.from('JPEGDATA-AJENA-' + 'w'.repeat(500))],
      invitada: ['ppm-invitada.jpg', Buffer.from('JPEGDATA-INV-' + 'v'.repeat(500))],
      video: ['ppm-video.mp4', Buffer.from('MP4DATA-VIDEO-' + 'u'.repeat(500))],
    };
    for (const k of Object.keys(FILES)) fs.writeFileSync(path.join(mediaDir, FILES[k][0]), FILES[k][1]);

    const db = dbOpen();
    const uidOf = (email) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) || {}).id;
    const uidA = uidOf('valentino_bamboo@hotmail.com');
    const uidB = uidOf('otra-duena@example.com');
    const uidG = uidOf('invitada@example.com');
    db.prepare('UPDATE users SET is_guest = 1 WHERE id = ?').run(uidG);
    const insAsset = db.prepare('INSERT INTO assets (user_id, file_path, kind) VALUES (?, ?, ?)');
    const assetNeon = Number(insAsset.run(uidA, '/media/ppm-neon.jpg', 'photo').lastInsertRowid);
    const assetNeon2 = Number(insAsset.run(uidA, '/media/ppm-neon2.jpg', 'photo').lastInsertRowid);
    insAsset.run(uidA, '/media/ppm-pub.jpg', 'photo');
    const assetPub2 = Number(insAsset.run(uidA, '/media/ppm-pub2.jpg', 'photo').lastInsertRowid);
    insAsset.run(uidB, '/media/ppm-ajena.jpg', 'photo');
    const assetInv = Number(insAsset.run(uidG, '/media/ppm-invitada.jpg', 'photo').lastInsertRowid);
    const assetVideo = Number(insAsset.run(uidA, '/media/ppm-video.mp4', 'video').lastInsertRowid);
    // Posteo YA publicado de A con la foto pub (para el veredicto de integridad).
    const pubId = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, media_type, needs_review, source, published_at)
      VALUES (?, '/media/ppm-pub.jpg', 'la pieza del lunes, ya publicada', '', 'published', 'image', 0, '', datetime('now'))`).run(uidA).lastInsertRowid);
    // El pedido-subir abierto de A sobre el asset neon2 (el caso real:
    // el dueño subió la pieza y nació el pedido; la carga lo cierra).
    const pedId = Number(db.prepare(`INSERT INTO subir_pedidos_voz (user_id, asset_id, kind, respuestas, estado)
      VALUES (?, ?, 'foto', '{}', 'pendiente_revision')`).run(uidA, assetNeon2).lastInsertRowid);
    db.close();
    t('B0c siembra completa (3 cuentas, 7 assets, 1 publicado, 1 pedido abierto)',
      !!(uidA && uidB && uidG && assetNeon && pedId && pubId));

    if (CONTROL) {
      const r404 = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-neon.jpg', caption: 'x', hashtags: '', scheduled_at: SLOT_HOY, media_type: 'image' }, TOK);
      t('C1 CONTROL: la ruta no existe en el árbol base (404)', r404.status === 404, String(r404.status));
      return;
    }

    // ---------- (2) Token ----------
    const rNoTok = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-neon.jpg', caption: 'x', hashtags: '', scheduled_at: SLOT_HOY, media_type: 'image' });
    const rBadTok = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-neon.jpg', caption: 'x', hashtags: '', scheduled_at: SLOT_HOY, media_type: 'image' }, 'token-malo');
    t('T1 sin token → 403 · token malo → 403', rNoTok.status === 403 && rBadTok.status === 403, [rNoTok.status, rBadTok.status].join(','));

    // ---------- (4) Material ajeno o inexistente ----------
    const rAjena = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-ajena.jpg', caption: 'no es mi material', hashtags: '', scheduled_at: SLOT_HOY, media_type: 'image' }, TOK);
    const rInex = await call('POST', RUTA, { user_id: uidA, image_path: '/media/no-existe.jpg', caption: 'no existe', hashtags: '', scheduled_at: SLOT_HOY, media_type: 'image' }, TOK);
    t('T2 asset de OTRO usuario → 400 asset_ajeno_o_inexistente', rAjena.status === 400 && rAjena.json.error === 'asset_ajeno_o_inexistente', rAjena);
    t('T3 asset inexistente → 400 asset_ajeno_o_inexistente', rInex.status === 400 && rInex.json.error === 'asset_ajeno_o_inexistente', rInex);

    // ---------- (1) La carga de la emergencia (cuenta real, no invitada) ----------
    const r1 = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-neon.jpg', caption: CAP_NEON, hashtags: CAP_NEON_TAGS, scheduled_at: SLOT_HOY, media_type: 'image' }, TOK);
    t('T4 la carga responde ok con id', r1.status === 200 && r1.json.ok === true && Number(r1.json.id) > 0, r1);
    const postId = Number(r1.json.id);
    const db1 = dbOpen();
    const row = db1.prepare('SELECT * FROM posts WHERE id = ?').get(postId) || {};
    t('T5 caption VERBATIM byte a byte (emoji, doble espacio, espacios finales)',
      row.caption === CAP_NEON, JSON.stringify(row.caption));
    t('T6 hashtags VERBATIM byte a byte', row.hashtags === CAP_NEON_TAGS, JSON.stringify(row.hashtags));
    t('T7 scheduled_at EXACTO al milisegundo, tal como vino', row.scheduled_at === SLOT_HOY, String(row.scheduled_at));
    t('T8 status scheduled · media_type image · image_path el del asset',
      row.status === 'scheduled' && row.media_type === 'image' && row.image_path === '/media/ppm-neon.jpg', [row.status, row.media_type, row.image_path].join('|'));
    t("T9 source = 'pieza-mano' (la marca del operador)", row.source === 'pieza-mano', String(row.source));
    t('T10 needs_review = 0 (nace 0; el lint exime al fundador como en sesión)',
      Number(row.needs_review) === 0, String(row.needs_review));
    const pred = db1.prepare(`SELECT id FROM posts WHERE id = ? AND status = 'scheduled' AND scheduled_at IS NOT NULL AND COALESCE(needs_review, 0) = 0`).get(postId);
    t('T11 el publicador la tomaría en su slot (predicado del scheduler: scheduled + needs_review 0)', !!pred);
    db1.close();
    t('T12 veredicto de integridad en la respuesta: ok (pieza nueva, sin puntero)',
      !!(r1.json.integridad && r1.json.integridad.ok === true), r1.json.integridad);

    // ---------- (3) Anti-duplicado por caption ----------
    const antes = (() => { const d = dbOpen(); const n = (d.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uidA) || {}).n; d.close(); return n; })();
    const rDup = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-neon2.jpg', caption: CAP_NEON, hashtags: '', scheduled_at: '2026-11-22T00:00:00.000Z', media_type: 'image' }, TOK);
    const despues = (() => { const d = dbOpen(); const n = (d.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uidA) || {}).n; d.close(); return n; })();
    t('T13 caption duplicado → 409 y NO se crea otra fila', rDup.status === 409 && despues === antes, [rDup.status, antes, despues].join(','));

    // ---------- (5) Cierre del pedido-subir contra el posteo ----------
    const CAP_PED = 'la segunda pieza del día, cargada a mano contra su pedido';
    const r2 = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-neon2.jpg', caption: CAP_PED, hashtags: '', scheduled_at: '2026-11-22T00:00:00.000Z', media_type: 'image', pedido_id: pedId }, TOK);
    t('T14 carga con pedido_id responde ok y declara el cierre',
      r2.status === 200 && r2.json.ok === true && r2.json.pedido && r2.json.pedido.estado === 'armado' && Number(r2.json.pedido.post_id) === Number(r2.json.id), r2.json);
    const db2 = dbOpen();
    const ped = db2.prepare('SELECT * FROM subir_pedidos_voz WHERE id = ?').get(pedId) || {};
    const nAntesAprobar = (db2.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uidA) || {}).n;
    db2.close();
    t("T15 el pedido quedó 'armado' contra el posteo creado, decidido por el equipo",
      ped.estado === 'armado' && Number(ped.post_id) === Number(r2.json.id) && ped.decided_by === 'equipo', ped);
    const rApr = await call('POST', `/api/admin/support/conserje/pedidos-subir/${pedId}/aprobar`, {}, TOK);
    const db3 = dbOpen();
    const nDespuesAprobar = (db3.prepare('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(uidA) || {}).n;
    db3.close();
    t('T16 aprobar el pedido ya cerrado NO crea nada (rama «ya armado», repetido)',
      rApr.status === 200 && rApr.json.ok === true && nDespuesAprobar === nAntesAprobar, [rApr.status, nAntesAprobar, nDespuesAprobar].join(','));

    // ---------- Integridad: misma imagen que un publicado ----------
    const rInt = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-pub2.jpg', caption: 'otra pieza distinta con la misma foto del lunes', hashtags: '', scheduled_at: '2026-11-23T00:00:00.000Z', media_type: 'image' }, TOK);
    t('T17 integridad: la carga nace (como en sesión) pero el veredicto la marca duplicado de un publicado',
      rInt.status === 200 && rInt.json.ok === true && rInt.json.integridad && rInt.json.integridad.ok === false && rInt.json.integridad.motivo === 'duplicado' && Number(rInt.json.integridad.contra_id) === pubId,
      rInt.json.integridad);

    // ---------- Video con portada ----------
    const rVid = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-video.mp4', caption: 'el video de la semana, a mano', hashtags: '', scheduled_at: '2026-11-24T00:00:00.000Z', media_type: 'video', cover_path: '/media/ppm-pub.jpg' }, TOK);
    const db4 = dbOpen();
    const vrow = db4.prepare('SELECT * FROM posts WHERE id = ?').get(Number(rVid.json.id)) || {};
    db4.close();
    t('T18 video: media_type video + cover_path guardada', rVid.status === 200 && vrow.media_type === 'video' && vrow.cover_path === '/media/ppm-pub.jpg', vrow);

    // ---------- (6) Una cuenta invitada también carga ----------
    const rG = await call('POST', RUTA, { user_id: uidG, image_path: '/media/ppm-invitada.jpg', caption: 'la pieza de la invitada, también a mano', hashtags: '', scheduled_at: '2026-11-22T00:00:00.000Z', media_type: 'image' }, TOK);
    const db5 = dbOpen();
    const grow = db5.prepare('SELECT * FROM posts WHERE id = ?').get(Number(rG.json.id)) || {};
    db5.close();
    t('T19 cualquier cuenta: la invitada también carga (scheduled, pieza-mano)',
      rG.status === 200 && rG.json.ok === true && grow.status === 'scheduled' && grow.source === 'pieza-mano', rG.json);

    // ---------- Validaciones de forma ----------
    const rBadFecha = await call('POST', RUTA, { user_id: uidA, image_path: '/media/ppm-neon.jpg', caption: 'fecha rota', hashtags: '', scheduled_at: 'no-es-una-fecha', media_type: 'image' }, TOK);
    const rNoUser = await call('POST', RUTA, { user_id: 999999, image_path: '/media/ppm-neon.jpg', caption: 'sin cuenta', hashtags: '', scheduled_at: SLOT_HOY, media_type: 'image' }, TOK);
    t('T20 scheduled_at inválido → 400 · usuario inexistente → 404',
      rBadFecha.status === 400 && rNoUser.status === 404, [rBadFecha.status, rNoUser.status].join(','));
  } finally {
    try { process.kill(srvPid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1500));
    try { process.kill(srvPid, 'SIGKILL'); } catch (e) {}
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log(`\n${CONTROL ? 'CONTROL' : 'RELEASE'}: ${pass} pass · ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
