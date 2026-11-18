// test-lote-venty-f1-fundamento-api.js — VENTY F1: rutas con boot real.
// Levanta el scratch con DATA_DIR aislada, registra usuarios, canjea el
// código web y juega las rutas nuevas: lectura a mano con fuentes
// simuladas (web e instagram), borrador en Bandeja, aceptación con un
// clic por Bandeja y por la ruta propia, actualización con diff que no
// pisa el aceptado, y lectura vacía que no se acepta a ciegas.
// Uso: node test-lote-venty-f1-fundamento-api.js (NODE_PATH con node_modules)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} (esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)})`);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-venty-f1-'));
const PORT = 18771;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://ventysalesmanager.com';

const SITIO_CAFE = { ok: true, url: 'https://cafearoma.example', name: 'Café Aroma', description: 'café de especialidad y brunch en el centro, querés probar el flat white', services: [], productos: [{ nombre: 'Brunch Aroma para dos', precio: 24000 }, { nombre: 'Flat white', precio: 5500 }, { nombre: 'Café con leche', precio: 4800 }], city: 'CABA', palette: ['#7A4A21'], facts: { tone: 'vos', has_prices: true }, categoryHint: 'CafeOrCoffeeShop' };

async function waitBoot(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/api/version`); if (r.ok) return true; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function req(method, p, opts = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, ...(opts.headers || {}) };
  const rr = await fetch(BASE + p, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data };
}

(async () => {
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), ADMIN_TOKEN: 'test', WHATSAPP_APP_SECRET: 'x', WHATSAPP_VERIFY_TOKEN: 'x', INSTAGRAM_APP_SECRET: 'x', INSTAGRAM_VERIFY_TOKEN: 'x' },
  });
  srv.stdout.on('data', () => {});
  srv.stderr.on('data', () => {});
  try {
    ok(await waitBoot(), 'boot: server levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    eq(ver.build, '20261105-v1176', `/api/version sigue en v1111 (${ver.build})`);

    const db = new DatabaseSync(path.join(TMP, 'posta.db'));
    const vwt = require('./venty-web-tokens');
    async function registrar(email, negocio) {
      const rr = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'test1234', business_name: negocio }),
      });
      ok(rr.status === 200 || rr.status === 201, `register ${email} (${rr.status})`);
      let row = null;
      for (let i = 0; i < 20 && !row; i++) { row = db.prepare('SELECT id FROM users WHERE email = ?').get(email); if (!row) await new Promise((r) => setTimeout(r, 250)); }
      ok(!!row, `usuario ${email} visible en la DB de test`);
      const issued = vwt.issueCode(db, row.id, email);
      const canje = await req('POST', '/api/auth/venty-token', { body: { code: issued.code } });
      ok(canje.status === 200 && /^[0-9a-f]{64}$/.test(canje.data.token || ''), `canje token ${email}`);
      return { uid: row.id, B: { Authorization: 'Bearer ' + canje.data.token } };
    }

    // ---------- usuario 1: web simulada, aceptar por Bandeja ----------
    const u1 = await registrar('venty-f1@test.com', 'Café Aroma Test');
    const sinAuth = await req('GET', '/api/venty/fundamento-auto', {});
    eq(sinAuth.status, 401, 'sin Bearer: fundamento-auto 401');
    const sinAuthLeer = await req('POST', '/api/venty/fundamento-auto/leer', { body: {} });
    eq(sinAuthLeer.status, 401, 'sin Bearer: fundamento-auto/leer 401');

    const leer1 = await req('POST', '/api/venty/fundamento-auto/leer', { headers: u1.B, body: { fuentes: { web: SITIO_CAFE } } });
    eq(leer1.status, 200, 'leer (web simulada): 200');
    eq(leer1.data.tipo_jugada, 'fundamento_auto', 'leer: borrador fundamento_auto');
    eq(leer1.data.fundamento.rubro, 'cafeteria', 'leer: rubro cafeteria desde la web');
    eq(leer1.data.fundamento.precios.length, 3, 'leer: oferta con nombre y precio (3)');
    const est1 = await req('GET', '/api/venty/fundamento-auto', { headers: u1.B });
    eq(est1.status, 200, 'GET fundamento-auto: 200');
    eq(est1.data.aceptado, false, 'estado: todavía sin aceptado');
    ok(est1.data.borrador_pendiente && est1.data.borrador_pendiente.id === leer1.data.lectura_id, 'estado: borrador pendiente visible');
    const bandeja1 = await req('GET', '/api/venty/bandeja', { headers: u1.B });
    const jugadasF1 = (bandeja1.data.jugadas || []).filter((j) => j.tipo === 'fundamento_auto');
    eq(jugadasF1.length, 1, 'bandeja: 1 jugada fundamento_auto esperando el clic');
    ok(!/[¿¡]/.test(jugadasF1[0].porque || ''), 'bandeja: texto de la jugada sin signos de apertura');
    const fundAntes = await req('GET', '/api/venty/fundamento', { headers: u1.B });
    eq((fundAntes.data.fundamento.precios || []).length, 10, 'el borrador no pisó el fundamento vigente (semilla Café Aroma intacta)');

    const accBandeja = await req('POST', `/api/venty/bandeja/${leer1.data.jugada_id}/aceptar`, { headers: u1.B, body: {} });
    eq(accBandeja.status, 200, 'aceptar el borrador en Bandeja: 200');
    const fundDespues = await req('GET', '/api/venty/fundamento', { headers: u1.B });
    eq(fundDespues.data.fundamento.rubro, 'cafeteria', 'tras aceptar: rubro aplicado');
    eq((fundDespues.data.fundamento.precios || []).length, 3, 'tras aceptar: la lista es la publicada (3 ítems)');
    const est2 = await req('GET', '/api/venty/fundamento-auto', { headers: u1.B });
    eq(est2.data.aceptado, true, 'estado: aceptado registrado');

    // ---------- actualización con diff: no pisa hasta aceptar ----------
    const sitioNuevo = { ...SITIO_CAFE, productos: [{ nombre: 'Brunch Aroma para dos', precio: 26000 }, { nombre: 'Flat white', precio: 5500 }, { nombre: 'Café con leche', precio: 4800 }] };
    const leer2 = await req('POST', '/api/venty/fundamento-auto/leer', { headers: u1.B, body: { fuentes: { web: sitioNuevo } } });
    eq(leer2.data.tipo_jugada, 'fundamento_actualizacion', 'segunda lectura con aceptado previo: actualización');
    ok((leer2.data.diff || []).some((x) => x.campo === 'precio' && x.despues === 26000), 'la actualización trae el diff de precio');
    const fundSinPisar = await req('GET', '/api/venty/fundamento', { headers: u1.B });
    eq(fundSinPisar.data.fundamento.precios.find((p) => p.item === 'Brunch Aroma para dos').precio, 24000, 'sin aceptar, el precio aceptado no se pisó');
    const accRuta = await req('POST', `/api/venty/fundamento-auto/lecturas/${leer2.data.lectura_id}/aceptar`, { headers: u1.B, body: {} });
    eq(accRuta.status, 200, 'aceptar la actualización por la ruta propia: 200');
    const fundFinal = await req('GET', '/api/venty/fundamento', { headers: u1.B });
    eq(fundFinal.data.fundamento.precios.find((p) => p.item === 'Brunch Aroma para dos').precio, 26000, 'tras aceptar la actualización, el precio nuevo aplica');

    // ---------- usuario 2: lectura vacía, no se acepta a ciegas ----------
    const u2 = await registrar('venty-f1-vacio@test.com', 'Negocio Vacío Test');
    const leerVacia = await req('POST', '/api/venty/fundamento-auto/leer', { headers: u2.B, body: { fuentes: { web: { ok: true, url: 'https://vacio.example', name: '', description: '', services: [], city: '', palette: [], categoryHint: '', facts: {} } } } });
    eq(leerVacia.status, 200, 'leer vacía: 200 (la duda también es resultado)');
    eq(leerVacia.data.tipo_jugada, 'fundamento_duda', 'leer vacía: jugada de duda');
    ok((leerVacia.data.dudas || []).some((d) => d.tipo === 'lectura_vacia'), 'leer vacía: duda lectura_vacia presente');
    const accDuda = await req('POST', `/api/venty/fundamento-auto/lecturas/${leerVacia.data.lectura_id}/aceptar`, { headers: u2.B, body: {} });
    eq(accDuda.status, 400, 'aceptar una lectura con dudas sin confirmar: 400');
    const accDudaBandeja = await req('POST', `/api/venty/bandeja/${leerVacia.data.jugada_id}/aceptar`, { headers: u2.B, body: {} });
    eq(accDudaBandeja.status, 400, 'aceptar la duda en Bandeja sin confirmar: 400');
    const recDuda = await req('POST', `/api/venty/fundamento-auto/lecturas/${leerVacia.data.lectura_id}/rechazar`, { headers: u2.B, body: { nota: 'el sitio estaba mal' } });
    eq(recDuda.status, 200, 'rechazar la lectura de duda: 200');

    // ---------- usuario 3: instagram simulado ----------
    const u3 = await registrar('venty-f1-ig@test.com', 'Peluquería Luna Test');
    const leerIg = await req('POST', '/api/venty/fundamento-auto/leer', { headers: u3.B, body: { fuentes: { instagram: { handle: 'peluqueria.luna', name: 'Peluquería Luna', bio: 'peluquería y color en Palermo, escribinos para tu turno', category: 'Hair Salon', productos: [{ nombre: 'Corte y brushing', precio: 18000 }, { nombre: 'Color completo', precio: 35000 }], ciudad: 'Palermo' } } } });
    eq(leerIg.status, 200, 'leer (instagram simulado): 200');
    eq(leerIg.data.tipo_jugada, 'fundamento_auto', 'leer IG: borrador');
    eq(leerIg.data.fundamento.rubro, 'belleza', 'leer IG: rubro belleza');
    eq(leerIg.data.fundamento.estrella, 'Corte y brushing', 'leer IG: estrella por nombre');

    db.close();
  } finally {
    srv.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`\n— venty-f1-fundamento (api): ${total - fails}/${total} OK, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
