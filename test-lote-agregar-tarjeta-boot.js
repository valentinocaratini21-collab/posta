// test-lote-agregar-tarjeta-boot.js — LOTE AGREGAR-TARJETA (base v789, BUILD vTBD — re-base sobre v789). M121.
// Boot real + E2E por HTTP del flujo para agregar tarjeta en el estado de
// Valentino: sin tarjeta guardada, sin stripe_customer_id, demo apagada.
// Lo que se verifica (SIN claves Stripe reales: el servidor bootea sin
// STRIPE_*):
// - GET /api/ads/billetera → 200 con tarjeta: null y tiene_tarjeta false
//   (el campo nuevo no rompe el endpoint cuando Stripe no está).
// - POST /api/billing/stripe/setup → 400 fail-closed (nunca un ok falso
//   ni un 500 pelado); repetir el toque da el mismo 400.
// - POST /api/billing/stripe/setup sin sesión → 401 (autenticado).
// - POST /api/ads/billetera/cargar $20 → 409 CON motivo (el camino de
//   Cargar sigue andando con el campo tarjeta nuevo en la billetera).
// - POST /api/billing/stripe/webhook sin secreto → 503 (sin regresión).
// El camino de éxito (sesión setup real + webhook con clave + cobro real)
// NO se puede verificar sin una clave Stripe real: queda como límite
// declarado en STATUS.md; la suite cubre ese camino con cliente falso.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-agregar-tarjeta-boot.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-agregar-tarjeta-'));
const PORT = 18799;
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
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-agregar-tarjeta', OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v791', `/api/version 20261105-v789 (vino ${ver.build})`);

    // Registro (sin demo: el usuario nace en demo; la apagamos para
    // reproducir el estado de Valentino, que ya conectó su IG).
    const reg = await api('', 'POST', '/api/auth/register', { email: 'agregar-tarjeta@test.local', password: 'x1234567', nombre: 'Tarjeta' });
    ok(reg.status === 200 && reg.data && reg.data.ok, 'registro OK');
    const set = await (await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'agregar-tarjeta@test.local', password: 'x1234567' }),
    }));
    const cookie = (set.headers.get('set-cookie') || '').split(';')[0];
    ok(cookie.length > 0, 'login: cookie de sesión');
    const demoOff = await api(cookie, 'PUT', '/api/settings', { demo_mode: false });
    ok(demoOff.status === 200, 'demo apagada (estado Valentino)');

    // Estado inicial: sin tarjeta, saldo 0, campo tarjeta nuevo en null.
    const b0 = await api(cookie, 'GET', '/api/ads/billetera');
    ok(b0.status === 200 && b0.data && b0.data.ok, 'GET /api/ads/billetera → 200');
    ok(b0.data && b0.data.tiene_tarjeta === false, 'billetera inicial: tiene_tarjeta false');
    ok(b0.data && 'tarjeta' in b0.data && b0.data.tarjeta === null, 'billetera inicial: tarjeta null (sin Stripe no hay qué leer, sin romper el endpoint)');
    ok(b0.data && b0.data.balance_cents === 0, 'billetera inicial: saldo 0');

    // Sin sesión: el setup exige autenticación.
    const sNoAuth = await api('', 'POST', '/api/billing/stripe/setup', {});
    ok(sNoAuth.status === 401, 'setup sin sesión → 401');

    // Sin Stripe configurado: el setup es fail-closed (400, nunca ok falso).
    const s1 = await api(cookie, 'POST', '/api/billing/stripe/setup', {});
    ok(s1.status === 400, 'setup sin Stripe → 400 fail-closed');
    ok(s1.data && typeof s1.data.error === 'string' && s1.data.error.length > 0, 'setup sin Stripe → error no vacío');
    ok(!(s1.data && s1.data.url), 'setup sin Stripe → sin URL (nada que abrir)');
    const s2 = await api(cookie, 'POST', '/api/billing/stripe/setup', {});
    ok(s2.status === 400 && (s2.data && s2.data.error) === (s1.data && s1.data.error), 'reintento de setup: mismo 400, mismo error');

    // El camino de Cargar sigue andando con el campo tarjeta nuevo.
    const c1 = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 20 });
    ok(c1.status === 409 && c1.data && c1.data.ok === false, 'cargar $20 sin tarjeta → 409 ok:false (sin regresión)');
    ok(c1.data && typeof c1.data.motivo === 'string' && c1.data.motivo.length > 0, 'cargar $20 sin tarjeta → motivo no vacío (' + (c1.data && c1.data.motivo) + ')');
    const b1 = await api(cookie, 'GET', '/api/ads/billetera');
    ok(b1.status === 200 && b1.data && b1.data.balance_cents === 0 && b1.data.tarjeta === null, 'después del fallo: saldo 0 y tarjeta sigue null');

    // Webhook sin secreto: 503, sin regresión.
    const wh = await fetch(BASE + '/api/billing/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ok(wh.status === 503, 'webhook sin secreto → 503');
  } catch (e) {
    console.error('  ✗ excepción', e && e.stack || e);
    fails++;
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\ntest-lote-agregar-tarjeta-boot: ${total - fails} ok, ${fails} mal`);
  process.exit(fails ? 1 : 0);
})();
