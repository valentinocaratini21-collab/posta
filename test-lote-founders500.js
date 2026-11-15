// test-lote-founders500.js — LOTE FOUNDERS-500 (QA nocturna 5/11; re-bases v744 6/11 y v1097 14/11, base v1096).
// /api/founders devolvía 500 founders_unavailable siempre: el SELECT pedía
// p.industry y p.city pero profiles no tenía esas columnas (el contador de
// /fundadores quedaba en "– / 200"). El fix agrega ambas columnas con la
// migración liviana de db.js (mismo patrón que las demás de profiles).
// Levanta server.js en DATA_DIR temporal propio (sin tocar la DB real) y
// verifica por HTTP: /api/founders 200 con taken 0 en DB fresca, y con un
// fundador sembrado (founder_number + founder_public + perfil) la lista lo
// trae con rubro y ciudad. Uso: node test-lote-founders500.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const PORT = 34563;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'founders500-boot-'));
const dataDir = path.join(tmpDir, 'data');
fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });

async function getJson(p) {
  const r = await fetch('http://127.0.0.1:' + PORT + p);
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}

const server = spawn('node', ['server.js'], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });

function waitForBoot() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(async () => {
      if (Date.now() - t0 > 20000) { clearInterval(iv); resolve(false); return; }
      try {
        const r = await fetch('http://127.0.0.1:' + PORT + '/api/version');
        if (r.ok) { clearInterval(iv); resolve(true); }
      } catch (e) { /* aún no levanta */ }
    }, 300);
  });
}

(async () => {
  const up = await waitForBoot();
  check('servidor levanta (v1097)', up);
  if (up) {
    const v = await getJson('/api/version');
    check('BUILD v1097', v.json && v.json.build === '20261105-v1097', JSON.stringify(v.json));
    const f0 = await getJson('/api/founders');
    check('/api/founders 200 en DB fresca', f0.status === 200, 'status ' + f0.status);
    check('/api/founders ok:true taken 0 total 200', !!(f0.json && f0.json.ok && f0.json.taken === 0 && f0.json.total === 200 && Array.isArray(f0.json.list)), JSON.stringify(f0.json));
    // Sembrar un fundador y verificar la lista (rubro + ciudad reales).
    const db = new DatabaseSync(path.join(dataDir, 'posta.db'));
    const cols = db.prepare('PRAGMA table_info(profiles)').all().map((r) => r.name);
    check('profiles tiene industry', cols.includes('industry'));
    check('profiles tiene city', cols.includes('city'));
    db.prepare("INSERT INTO users (email, password_hash, founder_number, founder_public) VALUES ('fundador@test.local', 'x', 1, 1)").run();
    const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('fundador@test.local').id;
    db.prepare('INSERT INTO profiles (user_id, business_name, industry, city) VALUES (?, ?, ?, ?)').run(uid, 'Café Fundador', 'Cafetería', 'Atlanta');
    const f1 = await getJson('/api/founders');
    check('/api/founders taken 1 con fundador', !!(f1.json && f1.json.taken === 1), JSON.stringify(f1.json));
    check('lista trae negocio + rubro + ciudad', !!(f1.json && f1.json.list && f1.json.list[0] && f1.json.list[0].negocio === 'Café Fundador' && f1.json.list[0].rubro === 'Cafetería' && f1.json.list[0].ciudad === 'Atlanta'), JSON.stringify(f1.json && f1.json.list));
    db.close();
  }
  server.kill('SIGTERM');
  setTimeout(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
    console.log(`\nFOUNDERS-500: ${pass} pasaron, ${fail} fallaron.`);
    process.exit(fail ? 1 : 0);
  }, 800);
})().catch((e) => { console.error('ERROR test:', e); try { server.kill('SIGTERM'); } catch (_) {} process.exit(1); });
