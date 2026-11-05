// test-lote-conserje-boot.js — M121 del lote conserje (base v697).
// Levanta server.js en una copia aislada (DATA_DIR temporal propio, sin
// tocar la DB real) y verifica: /api/version con el BUILD vigente,
// /api/health, y que las rutas nuevas de conserje están montadas BAJO
// requireAdminToken (sin token 403, con token 200 con datos reales de
// una DB fresca) y que la migración users.concierge corrió (el panel no
// falla por falta de columna). No toca producción.
// Uso: node test-lote-conserje-boot.js — sale 0 si todo pasa.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ' — ' + extra : ''}`); }
}

const PORT = 34561;
const TOKEN = 'boot-test-token-conserje';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conserje-boot-'));
const nodeModules = path.join(__dirname, '..', '.lote-pruebaentrada-boot', 'node_modules');

async function getJson(p, token) {
  const url = `http://127.0.0.1:${PORT}${p}${p.includes('?') ? '&' : '?'}token=${token || ''}`;
  const r = await fetch(url);
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}
async function postJson(p, token, body) {
  const url = `http://127.0.0.1:${PORT}${p}${p.includes('?') ? '&' : '?'}token=${token || ''}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  return { status: r.status, json: j };
}

(async () => {
  const env = {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'),
    ADMIN_TOKEN: TOKEN,
    NODE_PATH: nodeModules,
    OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => { out += String(d); });
  child.stderr.on('data', (d) => { out += String(d); });
  const kill = () => { try { child.kill('SIGTERM'); } catch (e) {} };
  try {
    // Esperar a que /api/version responda (hasta 45 s).
    let up = false;
    for (let i = 0; i < 45; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/api/version`);
        if (r.ok) { up = true; break; }
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 1000));
    }
    check('el servidor levanta con el lote', up);
    if (!up) {
      console.log('--- salida del servidor (últimas 30 líneas) ---');
      console.log(out.split('\n').slice(-30).join('\n'));
      throw new Error('no levanta');
    }
    const ver = await getJson('/api/version');
    check('/api/version trae el BUILD v698', ver.status === 200 && ver.json && ver.json.build === '20261105-v698',
      JSON.stringify(ver.json));
    const health = await getJson('/api/health');
    check('/api/health ok', health.status === 200 && health.json && health.json.ok === true);

    const noTok = await getJson('/api/admin/support/conserje/panel');
    check('panel del dueño sin token → 403', noTok.status === 403);
    const panel = await getJson('/api/admin/support/conserje/panel', TOKEN);
    check('panel del dueño con token → 200 con estructura real', panel.status === 200 && panel.json && panel.json.ok === true
      && Array.isArray(panel.json.clientes) && Array.isArray(panel.json.registro)
      && Array.isArray(panel.json.bandeja) && panel.json.contadores
      && panel.json.contadores.clientes_conserje === 0, JSON.stringify(panel.json && panel.json.contadores));
    const pend = await getJson('/api/admin/support/conserje/pendientes', TOKEN);
    check('pendientes con token → 200, total 0 en DB fresca', pend.status === 200 && pend.json && pend.json.ok === true && pend.json.total === 0);
    const list = await getJson('/api/admin/support/conserje', TOKEN);
    check('lista de conserje con token → 200, vacía en DB fresca', list.status === 200 && list.json && list.json.ok === true && Array.isArray(list.json.clientes) && list.json.clientes.length === 0);
    const noUser = await postJson('/api/admin/support/999/conserje', TOKEN, { concierge: true });
    check('prender conserje sin usuario → 404 sin_usuario', noUser.status === 404 && noUser.json && noUser.json.error === 'sin_usuario');
    const noUserMan = await getJson('/api/admin/support/999/manana', TOKEN);
    check('mañana sin usuario → 404', noUserMan.status === 404);
    const noUserAcc = await postJson('/api/admin/support/999/accion', TOKEN, { action: 'foto_mejorada', detalle: 'x' });
    check('acción sin usuario → 400', noUserAcc.status === 400);
  } catch (e) {
    console.log('error del test:', e.message);
    fail++;
  } finally {
    kill();
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n${pass} ok, ${fail} mal`);
  process.exit(fail ? 1 : 0);
})();
