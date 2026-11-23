// test-lote-lectura-admin-material.js — LOTE LECTURA-ADMIN-MATERIAL
// (del incidente de la película, 22/11): cuando el posteo de la
// película falló, el material subido por Subir (el asset del video
// limpio) y sus recibos no se podían ver desde NINGUNA superficie
// admin: pedidos-subir solo muestra el material que tiene un pedido
// de voz encima (y solo su file_path), el journey de support solo
// las últimas 10 fotos, y el recibo solo lo lee el propio cliente.
// El operador tuvo que reconstruir el estado leyendo la base a mano.
//
// El lote: UNA lectura admin de SOLO LECTURA, detrás de la misma
// puerta que sus hermanas (requireAdminToken), hermana de
// pedidos-subir:
//   GET /api/admin/support/conserje/material?user_id=&limit=&kind=
// Por negocio: sus assets (todos los kinds) con su recibo más
// reciente (estado + lo que el cliente confirmó), su pedido de voz
// más reciente (estado + error) y el posteo enlazado si lo hay.
// Ninguna escritura, ningún borrado, nada expuesto al cliente.
//
// CONTROL: en la base prístina v1269 la ruta no existe (404) y los
// casos [FIX] del boot fallan; la sección estática también.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-lectura-admin-material.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35513;
const ADMIN_TOKEN = 'test' + 'token-' + 'lectura-' + 'material';
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const fails = [];
function t(cond, name, extra) {
  if (cond) { pass++; console.log('ok  -', name); }
  else { fail++; fails.push(name); console.log('MAL -', name, extra !== undefined ? ':: ' + String(extra).slice(0, 300) : ''); }
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');

// ---------- Estático ----------
console.log('== 1. Estático ==');
const srvSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
{
  t(srvSrc.includes("app.get('/api/admin/support/conserje/material', requireAdminToken"), 'S1 [FIX] server: GET /api/admin/support/conserje/material detrás de requireAdminToken');
  const i0 = srvSrc.indexOf("app.get('/api/admin/support/conserje/material'");
  const i1 = srvSrc.indexOf('LOTE EVENTO + PEDIDO DE CERO', i0);
  const block = stripComments(srvSrc.slice(i0, i1 > i0 ? i1 : i0 + 4000));
  t(block.includes('FROM assets') && block.includes('FROM subir_recibos') && block.includes('FROM subir_pedidos_voz'),
    'S2 [FIX] la lectura lee assets + subir_recibos + subir_pedidos_voz');
  t(!/\bINSERT\s+INTO\b/.test(block) && !/\bUPDATE\s+[a-z_]+\s+SET\b/.test(block) && !/\bDELETE\s+FROM\b/.test(block) && !/\bREPLACE\s+INTO\b/.test(block),
    'S3 [FIX] la lectura es SOLO LECTURA: ningún INSERT/UPDATE/DELETE/REPLACE en su bloque');
  t(block.includes("error: 'sin_usuario'") && block.includes('business_name') && block.includes('ig_username'),
    'S4 [FIX] valida el usuario (sin_usuario) y devuelve el negocio (nombre + @)');
}

// ---------- Boot real ----------
console.log('== 2. Boot: la lectura del material por negocio ==');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-lectura-material-'));
const MEDIA = path.join(TMP, 'media');
const dbPath = path.join(TMP, 'posta.db');

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function req(method, p, body, cookie) {
  const r = await fetch(BASE + p, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let json = null; try { json = JSON.parse(txt); } catch (e) {}
  return { status: r.status, json, text: txt, setCookie: r.headers.get('set-cookie') || '' };
}
async function register(email, business) {
  const reg = await req('POST', '/api/auth/register', { email, password: 'secreta123', business_name: business });
  return { status: reg.status, cookie: String(reg.setCookie).split(';')[0] };
}
function dbOpen(ro) { return new DatabaseSync(dbPath, ro ? { readOnly: true } : {}); }
function snapshot() {
  const db = dbOpen(true);
  const out = {};
  for (const tabla of ['assets', 'subir_recibos', 'subir_pedidos_voz', 'posts', 'users', 'profiles']) {
    try { out[tabla] = db.prepare(`SELECT * FROM ${tabla} ORDER BY id`).all(); } catch (e) { out[tabla] = []; }
  }
  db.close();
  return crypto.createHash('sha256').update(JSON.stringify(out)).digest('hex');
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: TMP, MEDIA_DIR: MEDIA, ADMIN_TOKEN, NODE_PATH: NM },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    t(await waitBoot(), 'B0 el servidor levanta', srvLog.slice(-300));

    const uA = await register('material-a@test.local', 'Negocio A');
    const uB = await register('material-b@test.local', 'Negocio B');
    const uC = await register('material-c@test.local', 'Negocio C');
    t(uA.status < 300 && !!uA.cookie, 'B1 registro A/B/C con sesión', String(uA.status) + '/' + String(uB.status) + '/' + String(uC.status));

    // ── Semilla: el escenario del incidente, en chico ──
    // A subió la película (video, SIN pedido de voz: el caso ciego
    // del 22/11) con su recibo activo enlazado a un posteo, y una
    // foto con un pedido de voz pendiente. B tiene una foto suya.
    // C no subió nada.
    let uidA = 0, uidB = 0, uidC = 0, videoId = 0, fotoAId = 0, fotoBId = 0, postId = 0;
    {
      const db = dbOpen(false);
      const idDe = (email) => Number((db.prepare('SELECT id FROM users WHERE email = ?').get(email) || {}).id || 0);
      uidA = idDe('material-a@test.local'); uidB = idDe('material-b@test.local'); uidC = idDe('material-c@test.local');
      // El registro NO crea la fila de profiles (nace perezosa en
      // otro flujo): la semilla la crea con su nombre y su @, como
      // queda tras el onboarding real.
      const upProf = db.prepare(`INSERT INTO profiles (user_id, business_name, ig_username) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET business_name = excluded.business_name, ig_username = excluded.ig_username`);
      upProf.run(uidA, 'Negocio A', 'negocio.a');
      upProf.run(uidB, 'Negocio B', 'negocio.b');
      fotoAId = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, upload_choice, created_at) VALUES (?, '/media/foto-a.jpg', 'photo', 'semana', '2026-11-22 10:00:00')`).run(uidA).lastInsertRowid);
      videoId = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, upload_choice, created_at) VALUES (?, '/media/1795399287897-pelicula.mp4', 'video', 'armar', '2026-11-22 21:00:00')`).run(uidA).lastInsertRowid);
      fotoBId = Number(db.prepare(`INSERT INTO assets (user_id, file_path, kind, created_at) VALUES (?, '/media/foto-b.jpg', 'photo', '2026-11-22 09:00:00')`).run(uidB).lastInsertRowid);
      postId = Number(db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, scheduled_at, status, media_type, needs_review, week_key, published_at, error)
        VALUES (?, '/media/1795399287897-pelicula.mp4', 'La película', '', '2026-11-22 19:00:00', 'scheduled', 'video', 0, '2026-11-16', NULL, '')`).run(uidA).lastInsertRowid);
      // Un recibo viejo (reemplazado) y encima el vigente: la
      // lectura tiene que traer EL MÁS RECIENTE.
      db.prepare(`INSERT INTO subir_recibos (user_id, asset_id, kind, modo, datos, post_id, pedido_id, estado, created_at, updated_at)
        VALUES (?, ?, 'video', 'voz', ?, NULL, NULL, 'reemplazado', '2026-11-22 20:50:00', '2026-11-22 20:55:00')`).run(uidA, videoId, JSON.stringify({ intencion: 'borrador_viejo' }));
      db.prepare(`INSERT INTO subir_recibos (user_id, asset_id, kind, modo, datos, post_id, pedido_id, estado, created_at, updated_at)
        VALUES (?, ?, 'video', 'voz', ?, ?, NULL, 'activo', '2026-11-22 21:05:00', '2026-11-22 21:05:00')`).run(uidA, videoId, JSON.stringify({ intencion: 'publicar', fechaISO: '2026-11-22', motivo: 'lanzamiento', tratamiento: 'tal_cual', transcript: 'subí la película del lanzamiento' }), postId);
      db.prepare(`INSERT INTO subir_pedidos_voz (user_id, asset_id, kind, nota, estado, created_at)
        VALUES (?, ?, 'foto', 'que salga el viernes', 'pendiente_revision', '2026-11-22 10:05:00')`).run(uidA, fotoAId);
      db.close();
    }
    t(uidA > 0 && uidB > 0 && uidC > 0 && videoId > 0 && postId > 0, 'B2 semilla: 3 negocios, el video de A con recibo y posteo, la foto de A con pedido, la foto de B');

    const hashAntes = snapshot();
    const urlMat = (qs) => '/api/admin/support/conserje/material?' + qs + '&token=' + ADMIN_TOKEN;

    // ── La puerta admin ──
    const sinTok = await req('GET', '/api/admin/support/conserje/material?user_id=' + uidA);
    t(sinTok.status === 403, 'P1 [FIX] sin token admin → 403', String(sinTok.status));
    const malTok = await req('GET', '/api/admin/support/conserje/material?user_id=' + uidA + '&token=token-falso');
    t(malTok.status === 403, 'P2 [FIX] token admin falso → 403', String(malTok.status));
    const conCookie = await req('GET', '/api/admin/support/conserje/material?user_id=' + uidA, null, uA.cookie);
    t(conCookie.status === 403, 'P3 [FIX] la sesión del cliente NO abre la lectura admin → 403', String(conCookie.status));

    // ── Validación del negocio ──
    const sinUser = await req('GET', urlMat(''));
    t(sinUser.status === 400 && sinUser.json && sinUser.json.error === 'sin_usuario', 'V1 [FIX] sin user_id → 400 sin_usuario', String(sinUser.status));
    const noUser = await req('GET', urlMat('user_id=999999'));
    t(noUser.status === 404 && noUser.json && noUser.json.error === 'sin_usuario', 'V2 [FIX] user_id inexistente → 404 sin_usuario', String(noUser.status));

    // ── El material de A: el caso del incidente, visible ──
    const rA = await req('GET', urlMat('user_id=' + uidA));
    const matA = (rA.json && rA.json.material) || [];
    const video = matA.find((m) => m.kind === 'video');
    const fotoA = matA.find((m) => m.kind === 'photo');
    t(rA.status === 200 && rA.json && rA.json.ok === true && rA.json.total === 2 && matA.length === 2,
      'A1 [FIX] A: 200 con su material completo (2 assets)', String(rA.status) + ' total=' + (rA.json && rA.json.total));
    t(rA.json && rA.json.business_name === 'Negocio A' && rA.json.ig_username === 'negocio.a',
      'A2 [FIX] A: el negocio viene nombrado (nombre + @)', JSON.stringify({ n: rA.json && rA.json.business_name, ig: rA.json && rA.json.ig_username }));
    t(!!video && video.id === videoId && video.file_path === '/media/1795399287897-pelicula.mp4' && video.upload_choice === 'armar',
      'A3 [FIX] el video del incidente se ve: id, archivo y su elección', JSON.stringify(video || null).slice(0, 200));
    t(!!video && !!video.recibo && video.recibo.estado === 'activo' && video.recibo.datos && video.recibo.datos.intencion === 'publicar'
      && video.recibo.datos.transcript === 'subí la película del lanzamiento',
      'A4 [FIX] el recibo que viaja es el MÁS RECIENTE (activo, no el reemplazado), con lo que el cliente confirmó', JSON.stringify(video && video.recibo).slice(0, 240));
    t(!!video && !!video.post && video.post.id === postId && video.post.status === 'scheduled' && String(video.post.scheduled_at || '').includes('2026-11-22'),
      'A5 [FIX] el posteo enlazado se ve con su estado y su salida', JSON.stringify(video && video.post).slice(0, 160));
    t(!!video && video.pedido === null,
      'A6 [FIX] el video no tenía pedido de voz: pedido null (era el caso invisible para pedidos-subir)');
    t(!!fotoA && fotoA.id === fotoAId && !!fotoA.pedido && fotoA.pedido.estado === 'pendiente_revision' && fotoA.recibo === null && fotoA.post === null,
      'A7 [FIX] la foto de A trae su pedido de voz pendiente, sin recibo ni posteo', JSON.stringify(fotoA || null).slice(0, 200));

    // ── Filtro por kind ──
    const rKind = await req('GET', urlMat('user_id=' + uidA + '&kind=video'));
    t(rKind.status === 200 && rKind.json && rKind.json.total === 1 && ((rKind.json.material || [])[0] || {}).kind === 'video',
      'A8 [FIX] el filtro kind=video deja solo el video', String(rKind.status) + ' total=' + (rKind.json && rKind.json.total));

    // ── Vacío limpio y aislamiento ──
    const rC = await req('GET', urlMat('user_id=' + uidC));
    t(rC.status === 200 && rC.json && rC.json.ok === true && rC.json.total === 0 && Array.isArray(rC.json.material) && rC.json.material.length === 0,
      'C1 [FIX] C (sin material): 200 con vacío limpio', String(rC.status) + ' total=' + (rC.json && rC.json.total));
    const rB = await req('GET', urlMat('user_id=' + uidB));
    const matB = (rB.json && rB.json.material) || [];
    t(rB.status === 200 && rB.json && rB.json.total === 1 && matB.length === 1 && matB[0].id === fotoBId
      && !matB.some((m) => m.id === videoId || m.id === fotoAId),
      'C2 [FIX] B ve SOLO su foto: el material de A no se mezcla', String(rB.status) + ' total=' + (rB.json && rB.json.total));

    // ── Solo lectura, probado contra la base entera ──
    const hashDespues = snapshot();
    t(hashAntes === hashDespues, 'L1 [FIX] la base quedó IDÉNTICA tras todas las lecturas (assets/recibos/pedidos/posteos/usuarios/perfiles)');
  } catch (e) {
    t(false, 'Z0 el bloque de boot no explotó', e && e.message);
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 800));
    try { srv.kill('SIGKILL'); } catch (e) {}
  }

  console.log(`\n== RESULTADO: ${pass} ok · ${fail} MAL ==`);
  if (fails.length) console.log('Fallan:', fails.join(' | '));
  process.exit(fail ? 1 : 0);
})();
