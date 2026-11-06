// test-ads-billetera-boot.js — M121: boot real + E2E por HTTP.
// Levanta el scratch con DATA_DIR aislada (en workspace, no en /tmp),
// registra un usuario y verifica los endpoints de la billetera:
// - GET /api/ads/billetera: estado completo (saldo, montos, gates previos).
// - POST /api/ads/billetera/cargar: en demo_mode → 409 demo (nada se
//   cobra); monto inválido → 400 antes de cualquier cobro.
// - GET /api/ads/billetera/elegibles: sin IG → lista vacía + motivo.
// - POST /api/ads/billetera/impulsar: flag apagado → 403.
// - POST /api/ads/boost (viejo): sigue vivo y responde 400 sin posteo.
// Uso: node test-ads-billetera-boot.js (requiere npm install previo)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

const TMP = fs.mkdtempSync(path.join(__dirname, '.tmp-boot-ads-'));
const PORT = 18753;
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
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'testtoken-billetera', OPENAI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v701', `/api/version 20261105-v701 (vino ${ver.build})`);
    const h = await (await fetch(`${BASE}/api/health`)).json();
    ok(h.ok === true, '/api/health OK');

    // Sin sesión: 401 en los cuatro endpoints nuevos + el viejo.
    const s1 = await api('', 'GET', '/api/ads/billetera');
    ok(s1.status === 401, 'sin sesión: billetera → 401');
    const s2 = await api('', 'POST', '/api/ads/billetera/cargar', { montoUSD: 50 });
    ok(s2.status === 401, 'sin sesión: cargar → 401');
    const s3 = await api('', 'GET', '/api/ads/billetera/elegibles');
    ok(s3.status === 401, 'sin sesión: elegibles → 401');
    const s4 = await api('', 'POST', '/api/ads/billetera/impulsar', { posteoId: 1, montoUSD: 50 });
    ok(s4.status === 401, 'sin sesión: impulsar → 401');
    const s5 = await api('', 'POST', '/api/ads/boost', { post_id: 1, budget_cents: 200000 });
    ok(s5.status === 401, 'sin sesión: boost viejo → 401');

    // Registro + sesión (la cuenta nueva nace en demo_mode = 1).
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'billetera-test@example.com', password: 'test1234', business_name: 'Café Aroma Test' }),
    });
    const cookies = rr.headers.getSetCookie ? rr.headers.getSetCookie() : [];
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    ok(rr.status === 200 || rr.status === 201, `registro → ${rr.status}`);
    ok(cookie.length > 0, 'registro: sesión en cookie');

    // Estado de la billetera: saldo 0, montos fijos, gates previos.
    const bil = await api(cookie, 'GET', '/api/ads/billetera');
    ok(bil.status === 200 && bil.data && bil.data.ok === true, 'billetera → 200 ok');
    ok(bil.data && bil.data.balance_cents === 0, 'billetera: saldo 0 al inicio');
    ok(bil.data && bil.data.currency === 'ARS', 'billetera: moneda inicial ARS (la vieja; migra a USD con la primera carga)');
    ok(bil.data && JSON.stringify(bil.data.montos_usd) === JSON.stringify([20, 50, 100]), 'billetera: montos $20/$50/$100');
    ok(bil.data && bil.data.dias === 7, 'billetera: duración 7 días');
    ok(bil.data && bil.data.boostHabilitado === false, 'billetera: boostHabilitado false (flag apagado)');
    ok(bil.data && bil.data.ads_permiso === null, 'billetera: ads_permiso null (Meta no configurado en el entorno aislado)');
    ok(bil.data && bil.data.conversion_pendiente === true, 'billetera: conversion_pendiente true (tasa sin definir)');
    ok(bil.data && Array.isArray(bil.data.movimientos) && bil.data.movimientos.length === 0, 'billetera: ledger vacío al inicio');

    // Cargar en demo: 409 demo, NADA se cobra ni se acredita.
    const cg = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 50 });
    ok(cg.status === 409 && cg.data && cg.data.motivo === 'demo', 'cargar en demo → 409 demo (nada se cobra)');
    const bil2 = await api(cookie, 'GET', '/api/ads/billetera');
    ok(bil2.data && bil2.data.balance_cents === 0, 'cargar en demo: el saldo sigue en 0');
    ok(bil2.data && bil2.data.movimientos.length === 0, 'cargar en demo: el ledger sigue vacío');

    // Monto inválido: 400 antes de cualquier cobro (incluso en demo).
    const cg2 = await api(cookie, 'POST', '/api/ads/billetera/cargar', { montoUSD: 30 });
    ok(cg2.status === 400 && cg2.data && cg2.data.motivo === 'monto_invalido', 'cargar $30 → 400 monto_invalido');

    // Elegibles sin IG: lista vacía + motivo honesto.
    const el = await api(cookie, 'GET', '/api/ads/billetera/elegibles');
    ok(el.status === 200 && el.data && el.data.ok === true, 'elegibles → 200 ok');
    ok(el.data && Array.isArray(el.data.elegibles) && el.data.elegibles.length === 0, 'elegibles: sin IG → lista vacía');
    ok(el.data && el.data.ads_ready === false && el.data.motivo === 'ads_not_configured', 'elegibles: ads_ready false + motivo ads_not_configured (Meta no configurado en el entorno aislado)');

    // Impulsar con el flag apagado: 403 boost_deshabilitado, sin gastar.
    const im = await api(cookie, 'POST', '/api/ads/billetera/impulsar', { posteoId: 1, montoUSD: 50 });
    ok(im.status === 403 && im.data && im.data.motivo === 'boost_deshabilitado', 'impulsar flag off → 403 boost_deshabilitado');
    const im2 = await api(cookie, 'POST', '/api/ads/billetera/impulsar', { posteoId: 1, montoUSD: 30 });
    ok(im2.status === 403 && im2.data && im2.data.motivo === 'boost_deshabilitado', 'impulsar flag off + monto inválido → sigue 403 flag (orden de gates)');

    // El flujo viejo sigue vivo: posteo inexistente → 400.
    const bv = await api(cookie, 'POST', '/api/ads/boost', { post_id: 99999, budget_cents: 200000 });
    ok(bv.status === 400, `boost viejo sin posteo → 400 (vino ${bv.status})`);
  } finally {
    try { srv.kill('SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    if (fails) console.error('\n--- log del servidor (últimas 40 líneas) ---\n' + srvLog.split('\n').slice(-40).join('\n'));
  }
  console.log(`\ntest-ads-billetera-boot: ${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
