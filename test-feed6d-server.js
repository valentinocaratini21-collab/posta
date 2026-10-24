'use strict';
/* test-feed6d-server.js — Tanda feed 6D · ítems 13 y 14 (servidor, boot
 * in-process como test-feed6c-server; la lectura de IG cae al kit por
 * fetch stubbeado — cero red y cero IA):
 *  · ítem 13: perfiles gana profile_name/profile_bio/profile_link;
 *    PUT /api/profile guarda SOLO el display sin business_name (la rama
 *    parcial nueva, sin tocar el resto del perfil); link inválido → 400;
 *    /api/home/profile sirve el override (nombre/bio/link) y la paleta
 *    de la cuenta (fundamento o colores de marca).
 *  · ítem 14: GET /api/archive junta las tres fuentes reales
 *    (post_versions, recycled_posts + cancelled, ig_state archived_ext);
 *    restore-version hace el INTERCAMBIO de la Fase A (la vigente queda
 *    guardada, redo_left intacto) y rechaza publicados con 409;
 *    restore-post devuelve un descartado a borrador y rechaza el resto.
 * Uso: node test-feed6d-server.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-feed6d-'));
process.env.DATA_DIR = TMP;
process.env.PORT = '18778';
process.env.BASE_URL = 'http://127.0.0.1:18778';
process.env.OPENAI_API_KEY = 'sk-test';
delete process.env.GEMINI_API_KEY;
fs.mkdirSync(path.join(TMP, 'media'), { recursive: true });

const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  if (u.includes('127.0.0.1:18778')) return realFetch(url, opts);
  // Toda lectura externa (IG/OpenAI) falla en silencio: la home cae al kit.
  return { ok: false, status: 500, json: async () => ({}), text: async () => '' };
};

let cookie = '';
async function call(method, p, body, useCookie = true) {
  const r = await realFetch('http://127.0.0.1:18778' + p, {
    method, headers: { 'Content-Type': 'application/json', ...(useCookie && cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const sc = r.headers.get('set-cookie');
  if (sc && useCookie) cookie = sc.split(';')[0];
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, json: j };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 220) : ''); }
};

(async () => {
  const dbmod = require('./db');
  const db = dbmod.db || dbmod;
  require('./server');
  for (let i = 0; i < 60; i++) {
    try { const r = await realFetch('http://127.0.0.1:18778/api/version'); if (r.ok) break; } catch (e) {}
    await sleep(500);
    if (i === 59) throw new Error('el server no levantó');
  }
  const pcols = db.prepare('PRAGMA table_info(profiles)').all().map((c) => c.name);
  ok('migración: profiles.profile_name/profile_bio/profile_link existen',
    pcols.includes('profile_name') && pcols.includes('profile_bio') && pcols.includes('profile_link'));

  const reg = await call('POST', '/api/auth/register', { email: 'feed6d@x.example', password: 'secreto1' });
  ok('registro con sesión', reg.status === 200 && !!cookie, reg.status);
  const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('feed6d@x.example').id;
  await call('GET', '/api/profile'); // la fila de profiles nace lazy en el primer GET
  db.prepare("UPDATE profiles SET business_name = 'Café Sol', category = 'cafeteria', ig_username = 'cafesol' WHERE user_id = ?").run(uid);
  db.prepare("INSERT INTO settings (user_id, brand_colors) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET brand_colors = excluded.brand_colors")
    .run(uid, '["#3B2314","#FEC14D"]');

  // ---------- Ítem 13: guardado del display del perfil ----------
  const put1 = await call('PUT', '/api/profile', { profile_name: 'Café Sol ☕', profile_bio: 'Café de especialidad\nEnvíos a todo el país', profile_link: 'cafesol.example.com' });
  ok('PUT /api/profile: guarda el display SIN business_name (rama parcial)', put1.status === 200 && put1.json && put1.json.ok === true,
    put1.status + ' ' + JSON.stringify(put1.json).slice(0, 140));
  const profRow = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uid);
  ok('el display quedó en profiles y el resto del perfil intacto',
    profRow.profile_name === 'Café Sol ☕' && profRow.profile_link === 'https://cafesol.example.com'
    && profRow.business_name === 'Café Sol' && profRow.category === 'cafeteria');
  const putBad = await call('PUT', '/api/profile', { profile_link: 'no-es-un-link' });
  ok('PUT /api/profile: link inválido → 400', putBad.status === 400, putBad.status);
  const putLong = await call('PUT', '/api/profile', { profile_bio: 'x'.repeat(300) });
  const profRow2 = db.prepare('SELECT profile_bio FROM profiles WHERE user_id = ?').get(uid);
  ok('PUT /api/profile: la bio se corta a 150 (el tope de Instagram)', putLong.status === 200 && profRow2.profile_bio.length === 150,
    String(profRow2.profile_bio.length));
  await call('PUT', '/api/profile', { profile_bio: 'Café de especialidad\nEnvíos a todo el país' });
  const home = await call('GET', '/api/home/profile');
  ok('/api/home/profile: el espejo sirve el override guardado (nombre/bio/link)',
    home.json && home.json.name === 'Café Sol ☕' && home.json.bio === 'Café de especialidad\nEnvíos a todo el país'
    && home.json.link === 'https://cafesol.example.com', JSON.stringify(home.json).slice(0, 220));
  ok('/api/home/profile: viaja la paleta de la cuenta para las cubiertas',
    home.json && Array.isArray(home.json.palette) && home.json.palette.includes('#3B2314'),
    JSON.stringify(home.json && home.json.palette));

  // ---------- Ítem 14: archivo ----------
  const seed = (f) => db.prepare(`INSERT INTO posts (user_id, image_path, caption, hashtags, status, scheduled_at, published_at, ig_permalink, ig_state)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(uid, f.img || '/media/x.jpg', f.cap || 'Pieza', '', f.status || 'draft',
      f.at || null, f.pub || null, f.perma || '', f.igs || 'live').lastInsertRowid;
  const row = (id) => db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  const pDraft = seed({ cap: 'Caption vigente', img: '/media/actual.jpg', status: 'draft' });
  db.prepare('INSERT INTO post_versions (post_id, caption, hashtags, image_path) VALUES (?,?,?,?)')
    .run(pDraft, 'Caption vieja', '#viejo', '/media/vieja.jpg');
  const pPub = seed({ cap: 'Publicado', status: 'published', pub: '2026-09-01 10:00:00' });
  const vPub = db.prepare('INSERT INTO post_versions (post_id, caption, hashtags, image_path) VALUES (?,?,?,?)')
    .run(pPub, 'Versión del publicado', '', '/media/vp.jpg').lastInsertRowid;
  const pArch = seed({ cap: 'Archivado en IG', status: 'published', pub: '2026-09-02 10:00:00', perma: 'https://www.instagram.com/p/ABC123/', igs: 'archived_ext' });
  const pCanc = seed({ cap: 'Descartado', status: 'cancelled' });
  const pWin = seed({ cap: 'El que voló', status: 'published', pub: '2026-08-01 10:00:00' });
  const pNew = seed({ cap: 'Rehecho del que voló', status: 'draft' });
  db.prepare('INSERT INTO recycled_posts (post_id, new_post_id, created_at) VALUES (?,?,?)').run(pWin, pNew, Date.now());

  const arch401 = await call('GET', '/api/archive', null, false);
  ok('GET /api/archive sin sesión → 401', arch401.status === 401, arch401.status);
  const arch = await call('GET', '/api/archive');
  ok('GET /api/archive: las tres fuentes reales en un payload',
    arch.json && arch.json.ok === true && arch.json.versions.length === 2 && arch.json.recycled.length === 1
    && arch.json.cancelled.length === 1 && arch.json.archived.length === 1, JSON.stringify(arch.json).slice(0, 220));
  ok('archivo: la versión trae su posteo y su estado',
    arch.json.versions.some((v) => v.post_id === pDraft && v.post_status === 'draft' && v.caption === 'Caption vieja'));
  ok('archivo: el reciclado une el que voló con su borrador nuevo',
    arch.json.recycled[0].post_id === pWin && arch.json.recycled[0].new_post_id === pNew && arch.json.recycled[0].new_status === 'draft');
  ok('archivo: el archivado es el de ig_state archived_ext, con permalink',
    arch.json.archived[0].id === pArch && arch.json.archived[0].ig_permalink.includes('/p/ABC123/'));

  const redoBefore = row(pDraft).redo_left;
  const rv = await call('POST', '/api/archive/restore-version', { version_id: arch.json.versions.find((v) => v.post_id === pDraft).id });
  ok('restore-version: el intercambio deja la versión elegida vigente',
    rv.json && rv.json.ok === true && row(pDraft).caption === 'Caption vieja' && row(pDraft).image_path === '/media/vieja.jpg',
    JSON.stringify(rv.json).slice(0, 140));
  const versAfter = db.prepare('SELECT * FROM post_versions WHERE post_id = ?').all(pDraft);
  ok('restore-version: la que era vigente quedó guardada (intercambio, no borrado)',
    versAfter.length === 1 && versAfter[0].caption === 'Caption vigente' && versAfter[0].image_path === '/media/actual.jpg');
  ok('restore-version: gratis — redo_left intacto', row(pDraft).redo_left === redoBefore);
  const rvPub = await call('POST', '/api/archive/restore-version', { version_id: Number(vPub) });
  ok('restore-version sobre un publicado → 409', rvPub.status === 409, rvPub.status);
  const rv404 = await call('POST', '/api/archive/restore-version', { version_id: 999999 });
  ok('restore-version inexistente → 404', rv404.status === 404, rv404.status);

  const rp = await call('POST', '/api/archive/restore-post', { post_id: pCanc });
  ok('restore-post: el descartado vuelve a borrador sin fecha',
    rp.json && rp.json.ok === true && row(pCanc).status === 'draft' && !row(pCanc).scheduled_at);
  const rp409 = await call('POST', '/api/archive/restore-post', { post_id: pDraft });
  ok('restore-post sobre un borrador → 409', rp409.status === 409, rp409.status);
  const arch2 = await call('GET', '/api/archive');
  ok('archivo tras restaurar: el descartado ya no figura como cancelled',
    arch2.json && arch2.json.cancelled.length === 0 && arch2.json.versions.length === 2);

  console.log(`\nfeed6d-server: ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
