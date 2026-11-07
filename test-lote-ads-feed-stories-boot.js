// test-lote-ads-feed-stories-boot.js — LOTE ADS-FEED-STORIES (bug Valentino
// 7/11 ~16:58). Boot real + E2E por HTTP: levanta el árbol con DATA_DIR
// aislada, registra un usuario, siembra posteos del feed + stories en
// posta.db y verifica los 3 endpoints de la grilla por HTTP:
// - GET /api/ads/billetera/feed → solo los 4 posteos del feed, en orden.
// - GET /api/ads/billetera/elegibles → los mismos 4, sin stories.
// - GET /api/ads/billetera/buscar?q=estadio → solo el posteo del feed
//   (la story con el mismo texto NO).
// Sin sesión → 401. Nada cobra nada (Meta sin conectar).
// Uso: node test-lote-ads-feed-stories-boot.js (requiere npm install previo;
// NODE_PATH=/home/hatch/workspace/posta/node_modules si hace falta).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(__dirname, '..', '.tmp-boot-ads-feed-stories-')); // en el scratch (disco del workspace), NO en /tmp: /tmp es tmpfs de 512M y se llena (db.js:334 «database or disk is full»)
const PORT = 18795;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function api(cookie, method, p, body) {
  const rr = await fetch(BASE + p, {
    method, headers: { Cookie: cookie || '', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}
// Siembra con reintentos: el servidor tiene su propia conexión abierta.
function seedDb(dbPath, fn) {
  let lastErr = null;
  for (let i = 0; i < 10; i++) {
    try {
      const wdb = new DatabaseSync(dbPath);
      try { fn(wdb); } finally { wdb.close(); }
      return true;
    } catch (e) { lastErr = e; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  throw lastErr;
}

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), MEDIA_DIR: path.join(TMP, 'media'), ADMIN_TOKEN: 'boot-test-token-ads-feed-stories', OPENAI_API_KEY: '', NODE_PATH: '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v763', `/api/version 20261105-v763 (vino ${ver.build})`);

    // Sin sesión: 401 en el feed.
    const s1 = await api('', 'GET', '/api/ads/billetera/feed');
    ok(s1.status === 401, 'sin sesión: feed → 401');

    // Registro + sesión.
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ads-feed-stories@test.local', password: 'secreta123' }),
    });
    const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    ok(rr.status === 200 || rr.status === 201, `registro → ${rr.status}`);
    ok(cookie.length > 0, 'registro: sesión en cookie');

    // Siembra: 4 del feed + 1 story publicada con ig + 1 story draft +
    // 1 borrador del feed + 1 publicado sin ig.
    const dbPath = path.join(TMP, 'posta.db');
    ok(fs.existsSync(dbPath), 'la DB del boot existe en el DATA_DIR temporal');
    let uid = 0;
    seedDb(dbPath, (wdb) => {
      const u = wdb.prepare('SELECT id FROM users WHERE email = ?').get('ads-feed-stories@test.local');
      uid = u && u.id;
      const ins = wdb.prepare('INSERT INTO posts (user_id, image_path, caption, status, published_at, ig_media_id, media_type) VALUES (?,?,?,?,?,?,?)');
      ins.run(uid, '/media/f1.jpg', 'Estadio lleno, ¿te imaginás tener 3 días gratis?', 'published', '2026-11-07T17:00:00', 'ig_1', 'image');
      ins.run(uid, '/media/f2.jpg', 'Reel del café', 'published', '2026-11-06T17:00:00', 'ig_2', 'video');
      ins.run(uid, '/media/f3.jpg', 'Carrusel de medialunas', 'published', '2026-11-05T17:00:00', 'ig_3', 'carousel');
      ins.run(uid, '/media/f4.jpg', 'Posteo viejo', 'published', '2026-11-04T17:00:00', 'ig_4', 'image');
      ins.run(uid, '/media/f5.jpg', 'Estadio lleno story ¿te imaginás...?', 'published', '2026-11-07T12:00:00', 'ig_5', 'story');
      ins.run(uid, '/media/f6.jpg', 'Story borrador', 'draft', null, 'ig_6', 'story');
      ins.run(uid, '/media/f7.jpg', 'Borrador feed', 'draft', null, 'ig_7', 'image');
      ins.run(uid, '/media/f8.jpg', 'Sin ig', 'published', '2026-11-03T17:00:00', '', 'image');
    });
    ok(uid > 0, `siembra: usuario id ${uid}`);

    // /feed: solo los 4 del feed, en orden desc, sin stories.
    const feed = await api(cookie, 'GET', '/api/ads/billetera/feed');
    ok(feed.status === 200 && feed.data && feed.data.ok === true, 'feed → 200 ok');
    const ids = (feed.data && Array.isArray(feed.data.posts)) ? feed.data.posts.map((p) => p.post_id) : [];
    ok(JSON.stringify(ids) === '[1,2,3,4]', `feed: solo los 4 del feed en orden (vinieron ${JSON.stringify(ids)})`);
    ok(feed.data && feed.data.total === 4, `feed: total 4 (vino ${feed.data && feed.data.total})`);
    ok(!feed.data.posts.some((p) => String(p.caption || '').includes('story')), 'feed: ninguna story en la lista');
    ok(feed.data.posts.every((p) => p.image_path && typeof p.ya_impulsado === 'boolean'), 'feed: forma (image_path + ya_impulsado)');

    // /elegibles: los mismos 4, sin stories.
    const elig = await api(cookie, 'GET', '/api/ads/billetera/elegibles');
    ok(elig.status === 200 && elig.data && elig.data.ok === true, 'elegibles → 200 ok');
    const eids = (elig.data && Array.isArray(elig.data.elegibles)) ? elig.data.elegibles.map((p) => p.post_id) : [];
    ok(JSON.stringify(eids) === '[1,2,3,4]', `elegibles: mismos 4 sin stories (vinieron ${JSON.stringify(eids)})`);

    // /buscar: «estadio» trae solo el posteo del feed.
    const bus = await api(cookie, 'GET', '/api/ads/billetera/buscar?q=estadio');
    ok(bus.status === 200 && bus.data && bus.data.ok === true, 'buscar → 200 ok');
    const bids = (bus.data && Array.isArray(bus.data.resultados)) ? bus.data.resultados.map((p) => p.post_id) : [];
    ok(JSON.stringify(bids) === '[1]', `buscar «estadio»: solo el posteo del feed (vinieron ${JSON.stringify(bids)})`);
    const bus0 = await api(cookie, 'GET', '/api/ads/billetera/buscar?q=zzzznada');
    ok(bus0.status === 200 && Array.isArray(bus0.data.resultados) && bus0.data.resultados.length === 0, 'buscar sin match → lista vacía');

    // /hoy: sin nada programado, hoy es null (rama honesta, no se toca).
    const hoy = await api(cookie, 'GET', '/api/ads/billetera/hoy');
    ok(hoy.status === 200 && hoy.data && hoy.data.ok === true && hoy.data.hoy === null, 'hoy sin programado → null (rama honesta)');
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    if (fails) console.error('\n--- log del servidor (últimas 40 líneas) ---\n' + srvLog.split('\n').slice(-40).join('\n'));
  }
  console.log(`\ntest-lote-ads-feed-stories-boot: ${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
