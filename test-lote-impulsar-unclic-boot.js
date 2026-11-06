// test-lote-impulsar-unclic-boot.js — M121: boot real + E2E por HTTP.
// Levanta el scratch con DATA_DIR aislada, registra un usuario y verifica
// los endpoints del lote: mejor-posteo expone ads_permiso +
// conversion_pendiente, e impulsar falla cerrado con el flag apagado.
// Uso: node test-lote-impulsar-unclic-boot.js (requiere npm install previo)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-impulsar-unclic-'));
const PORT = 18752;
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
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-impulsar', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v697', `/api/version 20261105-v697 (vino ${ver.build})`);
    const h = await (await fetch(`${BASE}/api/health`)).json();
    ok(h.ok === true, '/api/health OK');

    // Sin sesión: 401 en los dos endpoints del lote.
    const s1 = await api('', 'GET', '/api/estrategia/mejor-posteo');
    ok(s1.status === 401, 'sin sesión: mejor-posteo → 401');
    const s2 = await api('', 'POST', '/api/destacado/impulsar', { montoUSD: 50, posteoId: 1 });
    ok(s2.status === 401, 'sin sesión: impulsar → 401');

    // Registro + sesión.
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'impulsar-test@example.com', password: 'test1234', business_name: 'Café Aroma Test' }),
    });
    const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    ok(rr.status === 200 || rr.status === 201, `registro → ${rr.status}`);
    ok(cookie.length > 0, 'registro: sesión en cookie');

    // Mejor-posteo: sin datos no hay recomendación, pero el estado del
    // impulso viene completo (sin inventar un mejor).
    const mp = await api(cookie, 'GET', '/api/estrategia/mejor-posteo');
    ok(mp.status === 200 && mp.data && mp.data.ok === true, 'mejor-posteo → 200 ok');
    ok(mp.data && mp.data.mejor === null, 'mejor-posteo: sin datos = sin recomendación (mejor null)');
    ok(mp.data && mp.data.ads_permiso === null, 'mejor-posteo: ads_permiso null (Meta no configurado en el entorno aislado)');
    ok(mp.data && mp.data.conversion_pendiente === true, 'mejor-posteo: conversion_pendiente true (tasa sin definir)');
    ok(mp.data && mp.data.boostHabilitado === false, 'mejor-posteo: boostHabilitado false (flag apagado)');

    // Impulsar con el flag apagado: 403 boost_deshabilitado, sin cobrar.
    const im = await api(cookie, 'POST', '/api/destacado/impulsar', { montoUSD: 50, posteoId: 1 });
    ok(im.status === 403 && im.data && im.data.motivo === 'boost_deshabilitado', 'impulsar flag off → 403 boost_deshabilitado');

    // Monto inválido con flag off: el flag se chequea primero (fail-closed).
    const im2 = await api(cookie, 'POST', '/api/destacado/impulsar', { montoUSD: 30, posteoId: 1 });
    ok(im2.status === 403 && im2.data && im2.data.motivo === 'boost_deshabilitado', 'impulsar flag off + monto inválido → sigue 403 flag (orden de gates)');
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\ntest-lote-impulsar-unclic-boot: ${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
