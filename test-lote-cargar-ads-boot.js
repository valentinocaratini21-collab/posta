// test-lote-cargar-ads-boot.js — LOTE CARGAR-ADS (base v784, re-estampado v786). M121.
// Boot real + E2E por HTTP del endpoint de Cargar en el estado de
// Valentino: sin tarjeta guardada, sin stripe_customer_id, demo apagada.
// Lo que se verifica:
// - POST /api/ads/billetera/cargar $20 → 409 CON motivo (no un 500 pelado
//   ni un ok falso): el cliente tiene algo que mostrar pegado al botón.
// - La billetera NO cambia (saldo 0, sin movimientos): nada se cobra.
// - Repetir el toque no cobra dos veces (ni una: sin tarjeta no hay cobro).
// - Monto inválido → 400 antes de cualquier cobro.
// El camino de éxito (cobro real + acreditación) NO se puede verificar
// sin una clave Stripe real: queda como límite declarado en STATUS.md.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-cargar-ads-boot.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-cargar-ads-'));
const PORT = 18798;
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
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-cargar-ads', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v786', `/api/version 20261105-v786 (vino ${ver.build})`);

    // Registro (sin demo: el usuario nace en demo; la apagamos para
    // reproducir el estado de Valentino, que ya conectó su IG).
    const reg = await api('', 'POST', '/api/auth/register', { email: 'cargar-ads@test.local', password: 'x1234567', nombre: 'Cargar' });
    ok(reg.status === 200 && reg.data && reg.data.ok, 'registro OK');
    const set = await (await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'cargar-ads@test.local', password: 'x1234567' }),
    }));
    const cookie = (set.headers.get('set-cookie') || '').split(';')[0];
    ok(cookie.length > 0, 'login: cookie de sesión');
    const demoOff = await api(cookie, 'PUT', '/api/settings', { demo_mode: false });
    ok(demoOff.status === 200, 'demo apagada (estado Valentino)');

    // Estado inicial: sin tarjeta, saldo 0.
    const b0 = await api(cookie, 'GET', '/api/ads/billetera');
    ok(b0.status === 200 && b0.data && b0.data.balance_cents === 0, 'billetera inicial: saldo 0');
    ok(b0.data && b0.data.tiene_tarjeta === false, 'billetera inicial: sin tarjeta guardada');

    // El toque de Valentino: POST cargar $20 → 409 CON motivo.
    const c1 = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 20 });
    ok(c1.status === 409 && c1.data && c1.data.ok === false, 'cargar $20 sin tarjeta → 409 ok:false');
    ok(c1.data && typeof c1.data.motivo === 'string' && c1.data.motivo.length > 0, 'cargar $20 sin tarjeta → motivo no vacío (' + (c1.data && c1.data.motivo) + ')');
    ok(c1.data && ['sin_cliente_stripe', 'sin_tarjeta_guardada', 'stripe_no_configurado'].includes(c1.data.motivo), 'motivo es uno de los de Cargar (sin tarjeta / Stripe sin configurar)');
    // El cliente usa anaCargarMotivo para ese motivo: texto sin «impulsar».
    const motivosCargar = ['sin_cliente_stripe', 'sin_tarjeta_guardada', 'stripe_no_configurado', 'cobro_fallido', 'cobro_requiere_accion', 'cobro_no_confirmado', 'sin_proveedores'];
    ok(motivosCargar.includes(c1.data.motivo), 'el motivo devuelto tiene su texto propio de Cargar en el cliente');

    // Nada se cobró: saldo 0 y sin movimientos (vienen en el mismo GET).
    const b1 = await api(cookie, 'GET', '/api/ads/billetera');
    ok(b1.status === 200 && b1.data && b1.data.balance_cents === 0, 'después del fallo: saldo sigue en 0');
    ok(b1.data && Array.isArray(b1.data.movimientos) && b1.data.movimientos.length === 0, 'después del fallo: sin movimientos en el ledger (nada acreditado)');

    // Repetir el toque: mismo fallo, nada se cobra dos veces.
    const c2 = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 20 });
    ok(c2.status === 409 && c2.data && c2.data.motivo === c1.data.motivo, 'reintento: mismo 409, mismo motivo');
    const b2 = await api(cookie, 'GET', '/api/ads/billetera');
    ok(b2.status === 200 && b2.data && b2.data.balance_cents === 0, 'después del reintento: saldo sigue en 0');

    // Monto inválido → 400 antes de cualquier cobro.
    const c3 = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 30 });
    ok(c3.status === 400 && c3.data && c3.data.motivo === 'monto_invalido', 'cargar $30 → 400 monto_invalido');
  } catch (e) {
    console.error('  ✗ excepción', e && e.stack || e);
    fails++;
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\ntest-lote-cargar-ads-boot: ${total - fails} ok, ${fails} mal`);
  process.exit(fails ? 1 : 0);
})();
