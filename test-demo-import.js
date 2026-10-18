// test-demo-import.js — v182: el style_code viaja de la semana de prueba a
// posts + post_signals al registrarse; las semanas de motores viejos NO se
// importan; POST /api/admin/extend-trial funciona con token y 403 sin él.
// Bootea el server real contra una DB temporal. Sin IA paga.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-test-import-'));
const PORT = 18741;
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = 'testtoken182';
const TINY_JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwH/2Q==';

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }

function payload(engine, styles) {
  return JSON.stringify({
    ok: true, engine, business: 'Milagros Makeup', category: 'belleza',
    posts: styles.map((s, i) => ({ type: 'image', image: TINY_JPG, caption: `Caption ${i}`, hashtags: '#makeup' })),
    design: {
      posts: styles.map((s, i) => ({ style: s, kind: i === 0 ? 'novedad' : 'social' })),
      styles: [], photos: [], videoIdx: 0, count: styles.length, engine,
    },
    week: [],
  });
}

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: TOKEN },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'server booteó');
    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('milagrosmakeup', payload(10, ['/cosmetic', '/quote']), Date.now());
    db.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)')
      .run('viejoengine', payload(1, ['/cosmetic']), Date.now());

    // Registro con la semana del motor actual → importa con style_code.
    let r = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'mili-test@example.com', password: 'secreto1', trial_ig: 'milagrosmakeup' }),
    });
    ok(r.ok, `register motor nuevo (${r.status})`);
    const u1 = db.prepare('SELECT id FROM users WHERE email = ?').get('mili-test@example.com');
    const posts = db.prepare('SELECT style_code FROM posts WHERE user_id = ? ORDER BY id').all(u1.id);
    ok(posts.length === 2, `2 posteos importados (van ${posts.length})`);
    ok(posts.map((p) => p.style_code).join(',') === '/cosmetic,/quote',
      `posts.style_code = ${posts.map((p) => p.style_code).join(',')}`);
    const sigs = db.prepare('SELECT style_code, client_signal FROM post_signals WHERE user_id = ? ORDER BY post_id').all(u1.id);
    ok(sigs.length === 2 && sigs.every((s) => s.client_signal === 'approved'),
      `post_signals: ${sigs.length} filas approved`);
    ok(sigs.map((s) => s.style_code).join(',') === '/cosmetic,/quote',
      `post_signals.style_code = ${sigs.map((s) => s.style_code).join(',')}`);

    // Registro con semana de motor viejo → NO importa nada.
    r = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'viejo-test@example.com', password: 'secreto1', trial_ig: 'viejoengine' }),
    });
    ok(r.ok, `register motor viejo (${r.status})`);
    const u2 = db.prepare('SELECT id FROM users WHERE email = ?').get('viejo-test@example.com');
    const n2 = db.prepare('SELECT COUNT(*) AS c FROM posts WHERE user_id = ?').get(u2.id).c;
    ok(n2 === 0, `motor viejo importa 0 posteos (van ${n2})`);

    // extend-trial sin token → 403 (requireAdminToken).
    r = await fetch(`${BASE}/api/admin/extend-trial`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u1.id, days: 10 }),
    });
    ok(r.status === 403, `extend-trial sin token → ${r.status} (esperado 403)`);

    // extend-trial con token → 200 y fecha efectiva = ahora + 10 días.
    const before = Date.now();
    r = await fetch(`${BASE}/api/admin/extend-trial?token=${TOKEN}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: u1.id, days: 10 }),
    });
    const body = await r.json().catch(() => ({}));
    ok(r.ok && body.ok, `extend-trial con token → ${r.status}`);
    const eff = Number(body.effective_trial_end || 0);
    ok(Math.abs(eff - (before + 10 * 86400000)) < 120000,
      `fin efectivo ≈ +10 días (diff ${Math.round((eff - before) / 60000)} min)`);
    const row = db.prepare('SELECT trial_extended_until FROM users WHERE id = ?').get(u1.id);
    ok(Number(row.trial_extended_until) === Number(body.trial_extended_until),
      'trial_extended_until persistido en la DB');
    db.close();
  } finally {
    srv.kill('SIGKILL');
  }
  console.log(fails ? `\n✗ ${fails} FALLAS` : '\n✓ TODO OK');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
