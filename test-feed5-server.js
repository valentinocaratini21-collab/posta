#!/usr/bin/env node
// test-feed5-server.js — Tanda feed 5 (servidor): fijados 📌 con tope 3,
// señales del dueño ♡/🔖 persistidas (+ evento) y la ubicación del
// fundamento en /api/home/profile. Todo contra el server real booteado
// en un DATA_DIR descartable.
// Uso: node test-feed5-server.js   (modos internos: --seed / --dump)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

if (process.argv.includes('--seed')) {
  // Siembra el digest con ciudad para el usuario del email dado.
  const db = require('./db').db || require('./db');
  const u = db.prepare('SELECT id FROM users WHERE email = ?').get(process.env.FEED5_EMAIL);
  if (!u) { console.error('seed: sin usuario'); process.exit(1); }
  db.prepare(`INSERT INTO client_digest (user_id, digest_json, hash, version) VALUES (?, ?, '', 1)
    ON CONFLICT(user_id) DO UPDATE SET digest_json = excluded.digest_json`)
    .run(u.id, JSON.stringify({ ciudad: 'Palermo, Buenos Aires', productos: [], servicios: [] }));
  console.log('seed ok', u.id);
  process.exit(0);
}
if (process.argv.includes('--dump')) {
  const db = require('./db').db || require('./db');
  const rows = db.prepare(`SELECT name, COUNT(*) AS c FROM events WHERE name LIKE 'post_%' GROUP BY name`).all();
  console.log(JSON.stringify(rows));
  process.exit(0);
}

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.log('  ✗', name, extra !== undefined ? String(extra).slice(0, 250) : ''); }
};

const PORT = 4411;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-feed5-'));
const EMAIL = 'feed5@x.example';

async function call(method, p, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const r = await fetch(BASE + p, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const txt = await r.text();
  let data = null; try { data = JSON.parse(txt); } catch (e) { data = txt; }
  const setC = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const sid = setC.map((c) => c.split(';')[0]).filter((c) => c.startsWith('connect.sid=')).pop() || cookie || '';
  return { status: r.status, data, text: txt, cookie: sid };
}
function boot() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_TOKEN: 'test-admin', SESSION_SECRET: 'test-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    (async () => {
      for (let i = 0; i < 60; i++) {
        try { const r = await fetch(BASE + '/api/version'); if (r.ok) return resolve(child); } catch (e) {}
        await new Promise((r) => setTimeout(r, 500));
      }
      try { child.kill('SIGKILL'); } catch (e) {}
      reject(new Error('no booteó: ' + log.slice(-400)));
    })();
  });
}
function runSelf(mode, extraEnv) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [__filename, mode], {
      cwd: __dirname, env: { ...process.env, DATA_DIR: dataDir, ...(extraEnv || {}) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out));
  });
}

(async () => {
  const child = await boot();
  try {
    const v = await call('GET', '/api/version');
    ok('el server bootea', v.status === 200 && v.data && v.data.ok, JSON.stringify(v.data).slice(0, 100));
    const reg = await call('POST', '/api/auth/register', { email: EMAIL, password: 'secreto1' });
    const ck = reg.cookie;
    ok('registro con sesión', !!ck, reg.status);
    const ids = [];
    for (let i = 1; i <= 5; i++) {
      const c = await call('POST', '/api/posts', { image_path: '/media/f5-' + i + '.jpg', caption: 'Pieza feed5 ' + i, media_type: i === 5 ? 'story' : 'image' }, ck);
      ok('crear pieza ' + i, c.status === 200 || c.status === 201, c.status + ' ' + String(c.text).slice(0, 120));
    }
    const list = await call('GET', '/api/posts', null, ck);
    const posts = Array.isArray(list.data) ? list.data : [];
    const imgs = posts.filter((p) => p.media_type !== 'story');
    const story = posts.find((p) => p.media_type === 'story');
    ok('las piezas se listan', imgs.length >= 4 && !!story, 'imgs=' + imgs.length);

    // — Fijados: 3 entran, el 4º rebota con pin_limit —
    for (let i = 0; i < 3; i++) {
      const r = await call('PATCH', '/api/posts/' + imgs[i].id, { action: 'pin' }, ck);
      ok('fijar #' + (i + 1), r.status === 200 && r.data && r.data.pinned === 1, r.status + ' ' + String(r.text).slice(0, 120));
    }
    const p4 = await call('PATCH', '/api/posts/' + imgs[3].id, { action: 'pin' }, ck);
    ok('el 4º fijado rebota (409 pin_limit)', p4.status === 409 && p4.data && p4.data.error === 'pin_limit', p4.status + ' ' + String(p4.text).slice(0, 120));
    const un = await call('PATCH', '/api/posts/' + imgs[0].id, { action: 'unpin' }, ck);
    ok('desfijar libera el lugar', un.status === 200 && un.data && un.data.pinned === 0);
    const p4b = await call('PATCH', '/api/posts/' + imgs[3].id, { action: 'pin' }, ck);
    ok('tras desfijar, el 4º entra', p4b.status === 200 && p4b.data && p4b.data.pinned === 1);
    const ps = await call('PATCH', '/api/posts/' + story.id, { action: 'pin' }, ck);
    ok('una historia no se fija (400)', ps.status === 400, ps.status);
    const list2 = await call('GET', '/api/posts', null, ck);
    const byId = {}; (list2.data || []).forEach((p) => { byId[p.id] = p; });
    ok('GET /api/posts expone pinned + pinned_at', byId[imgs[3].id] && byId[imgs[3].id].pinned === 1 && !!byId[imgs[3].id].pinned_at && byId[imgs[0].id].pinned === 0);

    // — Señales ♡/🔖 —
    const lk = await call('PATCH', '/api/posts/' + imgs[1].id, { action: 'like' }, ck);
    ok('♡ like responde', lk.status === 200 && lk.data && lk.data.owner_liked === 1, lk.status + ' ' + String(lk.text).slice(0, 120));
    const sv = await call('PATCH', '/api/posts/' + imgs[1].id, { action: 'save' }, ck);
    ok('🔖 save responde', sv.status === 200 && sv.data && sv.data.owner_saved === 1);
    const list3 = await call('GET', '/api/posts', null, ck);
    const b3 = {}; (list3.data || []).forEach((p) => { b3[p.id] = p; });
    ok('las señales persisten y conviven', b3[imgs[1].id].owner_liked === 1 && b3[imgs[1].id].owner_saved === 1 && b3[imgs[1].id].pinned === 1);
    const ul = await call('PATCH', '/api/posts/' + imgs[1].id, { action: 'unlike' }, ck);
    ok('quitar el ♡ no toca el 🔖 ni el 📌', ul.status === 200 && ul.data.owner_liked === 0);

    // — Ubicación desde el fundamento —
    const hp0 = await call('GET', '/api/home/profile', null, ck);
    ok('sin fundamento con ciudad: location null (no se inventa)', hp0.status === 200 && hp0.data && (hp0.data.location === null || hp0.data.location === undefined), JSON.stringify(hp0.data).slice(0, 160));
    const seedOut = await runSelf('--seed', { FEED5_EMAIL: EMAIL });
    ok('seed del digest', /seed ok/.test(seedOut), seedOut.slice(0, 120));
    const hp1 = await call('GET', '/api/home/profile', null, ck);
    ok('con ciudad en el fundamento: location servida', hp1.data && hp1.data.location === 'Palermo, Buenos Aires', JSON.stringify(hp1.data).slice(0, 200));
  } finally {
    try { child.kill('SIGKILL'); } catch (e) {}
  }
  const dump = await runSelf('--dump');
  let ev = [];
  try { ev = JSON.parse(dump.trim().split('\n').pop()); } catch (e) {}
  const liked = ev.find((r) => r.name === 'post_liked');
  const saved = ev.find((r) => r.name === 'post_saved');
  ok('las señales quedaron en el registro de eventos de la cuenta', !!liked && liked.c >= 1 && !!saved && saved.c >= 1, dump.slice(0, 160));
  console.log(`\nfeed5-server: ${passed}/${passed + failed}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
