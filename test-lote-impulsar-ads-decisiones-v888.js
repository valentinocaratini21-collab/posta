// test-lote-impulsar-ads-decisiones-v888.js
// LOTE IMPULSAR/ADS: TASA + CRÉDITO + COBRO EN DÓLARES (v888)
// Decisiones de Valentino 10/11 14:17: (1) tasa USD→ARS 1425 (default en
// código) · (2) si el anuncio no se crea, NO hay reembolso — el monto
// queda como CRÉDITO en la billetera del cliente · (3) el cobro puede ser
// en DÓLARES (el saldo viejo en pesos NO bloquea: queda como crédito en
// pesos y el cobro va directo con la tarjeta guardada de Stripe).
// Base: árbol re-basado del preparador de v885 (BUILD v885, ?v=597).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-impulsar-ads-decisiones-v888.js
// (§C boot requiere node_modules resoluble; si no, se salta con aviso.)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = __dirname;
const BUILD_BASE = '20261105-v888'; // (el preparador estampa v888; yo no)
const PUERTO = 18755;
const DATA_DIR = path.join(ROOT, '..', 'boot-data-v888');
const AD = require('./ads-billetera.js');
const DS = require('./destacado-semana.js');

let ok = 0, mal = 0, saltados = 0;
function check(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok - ' + nombre); }
  else { mal++; console.log('  MAL - ' + nombre + (extra ? ' :: ' + extra : '')); }
}
function skip(nombre, motivo) { saltados++; console.log('  -- - ' + nombre + ' (' + motivo + ')'); }
function leer(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── §A · tasa 1425 (decisión 1) ──
console.log('§A · tasa 1425');
check('A1 · IMPULSO_TASA_ARS_DEFAULT = 1425', DS.IMPULSO_TASA_ARS_DEFAULT === 1425);
const convDef = DS.conversionARSFromEnv({});
check('A2 · sin env → default 1425 (20→$2.850.000c, 50→$7.125.000c, 100→$14.250.000c)', typeof convDef === 'function' && convDef(20) === 2850000 && convDef(50) === 7125000 && convDef(100) === 14250000);
check('A3 · env inválido (vacía / abc / 0 / -5) → default 1425', typeof DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: '' }) === 'function' && DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: '' })(50) === 7125000 && DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: 'abc' })(50) === 7125000 && DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: '0' })(50) === 7125000 && DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: '-5' })(50) === 7125000);
const conv1200 = DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: '1200' });
check('A4 · env válido manda (1200: 20→$2.400.000c; decimales con espacios: 50→$6.002.500c)', typeof conv1200 === 'function' && conv1200(20) === 2400000 && DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: ' 1200.5 ' })(50) === 6002500);
check('A5 · conversionARSFromEnv nunca devuelve null', DS.conversionARSFromEnv({}) !== null && DS.conversionARSFromEnv({ IMPULSO_TASA_ARS: 'abc' }) !== null);

(async () => {
  // ── §A (cont.) · el gate conversion_pendiente se levanta en el módulo ──
  const ENV_ON = { DESTACADO_BOOST_ENABLED: '1' };
  const baseUSD = { clienteId: 7, posteoId: 9, moneda: 'USD', montoUSD: 50, zona: 'Argentina', env: ENV_ON, adsConfigurado: true, paginaAutorizada: true, permisoAds: true, conversionARS: DS.conversionARSFromEnv({}), saldoCentsUSD: 10000, fecha: '2026-11-10', demo: false };
  function fakesUSD(over) {
    const llamadas = { crear: 0, debitar: 0, cobrarDirecto: 0, registrar: [] };
    return {
      llamadas,
      crearAnuncio: async (a) => { llamadas.crear++; return { ok: true, anuncioId: 'ad_1', campaignId: 'cmp_1', adsetId: 'ads_1', adId: 'a_1' }; },
      debitar: async (d) => { llamadas.debitar++; return { ok: true, saldoNuevo: 5000 }; },
      cobrarDirecto: async (d) => { llamadas.cobrarDirecto++; return { ok: true, cobroId: 'pi_y' }; },
      registrar: async (x) => { llamadas.registrar.push(x); return { ok: true }; },
      buscarDebito: async () => null,
      ...(over || {}),
    };
  }
  let f = fakesUSD();
  let r = await AD.impulsarConSaldo({ ...baseUSD, ...f });
  check('A6 · impulsar USD con la tasa por default: ok, spend 7125000, sin conversion_pendiente', r.ok === true && r.montoUSD === 50 && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].spendCents === 7125000, JSON.stringify(r));

  // ── §B · crédito por anuncio no creado (decisión 2) ──
  console.log('§B · crédito, no reembolso');
  function fakesCredito(over) {
    const llamadas = { mover: [], fijarMoneda: [] };
    return {
      llamadas,
      leerBilletera: async () => ({ currency: 'USD', balance_cents: 0 }),
      mover: async (cents, kind, ref, note) => { llamadas.mover.push({ cents, kind, ref, note }); return { ok: true, saldoNuevo: 5000 }; },
      yaAcreditado: async () => false,
      fijarMoneda: async (m) => { llamadas.fijarMoneda.push(m); },
      ...(over || {}),
    };
  }
  let c = fakesCredito();
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 50, cobroId: 'pi_x', ...c });
  check('B1 · crédito $50: mover exacto (5000c, credito_anuncio_fallido, credito_pi_x), saldoNuevo 5000', r.ok === true && r.ya_acreditado === false && r.saldoNuevo === 5000 && c.llamadas.mover.length === 1 && c.llamadas.mover[0].cents === 5000 && c.llamadas.mover[0].kind === 'credito_anuncio_fallido' && c.llamadas.mover[0].ref === 'credito_pi_x', JSON.stringify(r) + ' :: ' + JSON.stringify(c.llamadas.mover));
  c = fakesCredito({ yaAcreditado: async () => true });
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 50, cobroId: 'pi_x', ...c });
  check('B2 · crédito idempotente: ya acreditado → ok ya_acreditado, sin segundo mover', r.ok === true && r.ya_acreditado === true && c.llamadas.mover.length === 0, JSON.stringify(r));
  c = fakesCredito();
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: null, montoUSD: 50, cobroId: 'pi_x', ...c });
  check('B3 · crédito sin cliente: sin_cliente, sin mover', r.ok === false && r.motivo === 'sin_cliente' && c.llamadas.mover.length === 0, JSON.stringify(r));
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 15, cobroId: 'pi_x', ...c });
  check('B4 · crédito monto inválido ($15): monto_invalido, sin mover', r.ok === false && r.motivo === 'monto_invalido' && c.llamadas.mover.length === 0, JSON.stringify(r));
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 50, cobroId: '', ...c });
  check('B5 · crédito sin cobroId: sin_cobro, sin mover', r.ok === false && r.motivo === 'sin_cobro' && c.llamadas.mover.length === 0, JSON.stringify(r));
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 50, cobroId: 'pi_x', leerBilletera: async () => ({ currency: 'USD', balance_cents: 0 }) });
  check('B6 · crédito sin mover: sin_proveedores', r.ok === false && r.motivo === 'sin_proveedores', JSON.stringify(r));
  c = fakesCredito({ leerBilletera: async () => ({ currency: 'ARS', balance_cents: 0 }) });
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 50, cobroId: 'pi_x', ...c });
  check('B7 · crédito con billetera ARS saldo 0: migra a USD (fijarMoneda USD) y acredita', r.ok === true && eq(c.llamadas.fijarMoneda, ['USD']) && c.llamadas.mover.length === 1, JSON.stringify(r) + ' :: ' + JSON.stringify(c.llamadas.fijarMoneda));
  c = fakesCredito({ leerBilletera: async () => ({ currency: 'ARS', balance_cents: 2000000 }) });
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 50, cobroId: 'pi_x', ...c });
  check('B8 · crédito con billetera ARS saldo > 0: moneda_mezclada, SIN migrar, acredita igual (la plata nunca se pierde)', r.ok === true && r.moneda_mezclada === true && c.llamadas.fijarMoneda.length === 0 && c.llamadas.mover.length === 1, JSON.stringify(r));
  c = fakesCredito({ mover: async () => ({ ok: false, motivo: 'acreditar_fallido' }) });
  r = await AD.acreditarCreditoAnuncioFallido({ clienteId: 7, montoUSD: 50, cobroId: 'pi_x', ...c });
  check('B9 · crédito con mover fallido: acreditar_fallido', r.ok === false && r.motivo === 'acreditar_fallido', JSON.stringify(r));

  // ── §C · cobro directo en dólares (decisión 3) ──
  console.log('§C · cobro directo USD (saldo ARS no bloquea)');
  f = fakesUSD();
  r = await AD.impulsarConSaldo({ ...baseUSD, saldoCentsUSD: 0, ...f });
  check('C1 · bypass USD sin saldo: ok, crear 1, cobrarDirecto 1, debitar 0, saldoNuevo null (billetera intacta)', r.ok === true && r.montoUSD === 50 && r.saldoNuevo === null && f.llamadas.crear === 1 && f.llamadas.cobrarDirecto === 1 && f.llamadas.debitar === 0 && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'exito', JSON.stringify(r) + ' :: ' + JSON.stringify(f.llamadas));
  f = fakesUSD({ crearAnuncio: async () => ({ ok: false, error: 'meta' }) });
  r = await AD.impulsarConSaldo({ ...baseUSD, saldoCentsUSD: 0, ...f });
  check('C2 · bypass con anuncio fallido: anuncio_fallido, SIN cobro directo ni débito', r.ok === false && r.motivo === 'anuncio_fallido' && f.llamadas.cobrarDirecto === 0 && f.llamadas.debitar === 0, JSON.stringify(r));
  f = fakesUSD({ cobrarDirecto: async () => ({ ok: false, motivo: 'cobro_fallido' }) });
  r = await AD.impulsarConSaldo({ ...baseUSD, saldoCentsUSD: 0, ...f });
  check('C3 · bypass con cobro fallido tras crear el ad: debito_fallido + registro, con anuncioId', r.ok === false && r.motivo === 'debito_fallido' && r.anuncioId === 'ad_1' && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'debito_fallido', JSON.stringify(r));
  f = fakesUSD();
  delete f.cobrarDirecto; delete f.debitar;
  r = await AD.impulsarConSaldo({ ...baseUSD, saldoCentsUSD: 10000, ...f });
  check('C4 · USD sin cobrarDirecto ni debitar (con saldo): sin_proveedores, sin anuncio', r.ok === false && r.motivo === 'sin_proveedores' && f.llamadas.crear === 0, JSON.stringify(r));
  f = fakesUSD();
  delete f.cobrarDirecto;
  r = await AD.impulsarConSaldo({ ...baseUSD, saldoCentsUSD: 0, ...f });
  check('C5 · USD normal sin cobrarDirecto y sin saldo: saldo_insuficiente (el flujo de saldo sigue igual)', r.ok === false && r.motivo === 'saldo_insuficiente' && f.llamadas.crear === 0, JSON.stringify(r));
  // ARS: cobrarDirecto se ignora (solo USD); el débito sigue siendo del saldo.
  const splitARS = (cents) => ({ fee_cents: Math.round(cents * 0.10), spend_cents: cents - Math.round(cents * 0.10) });
  const baseARS = { clienteId: 7, posteoId: 9, moneda: 'ARS', montoARS: 10000, zona: 'Argentina', env: ENV_ON, adsConfigurado: true, paginaAutorizada: true, permisoAds: true, conversionARS: null, saldoCentsARS: 2000000, splitARS, fecha: '2026-11-10', demo: false };
  f = fakesUSD();
  r = await AD.impulsarConSaldo({ ...baseARS, ...f });
  check('C6 · ARS con cobrarDirecto presente: se ignora (debitar 1, cobrarDirecto 0)', r.ok === true && r.montoARS === 10000 && f.llamadas.debitar === 1 && f.llamadas.cobrarDirecto === 0, JSON.stringify(r));
  // El gate del módulo cargarBilletera queda como red de seguridad.
  let cobros = 0;
  r = await AD.cargarBilletera({ clienteId: 7, montoUSD: 50, monedaActual: 'ARS', saldoActual: 5000, ref: 'carga_7_v888', buscarCarga: async () => null, cobrar: async () => { cobros++; return { ok: true, cobroId: 'ch_1' }; }, acreditar: async () => ({ ok: true, saldoNuevo: 5000 }), demo: false });
  check('C7 · cargarBilletera USD saldo ARS > 0: saldo_ars_pendiente, sin cobro (el gate del módulo queda)', r.ok === false && r.motivo === 'saldo_ars_pendiente' && cobros === 0, JSON.stringify(r));

  // ── §D · fuentes (server.js / app.js / módulos) ──
  console.log('§D · fuentes');
  const srv = leer('server.js');
  const app = leer('public/app.js');
  const dsSrc = leer('destacado-semana.js');
  const adSrc = leer('ads-billetera.js');
  check('D1 · destacado-semana.js: default 1425 exportado y conversionARSFromEnv sin return null', dsSrc.includes('IMPULSO_TASA_ARS_DEFAULT = 1425') && dsSrc.includes('IMPULSO_TASA_ARS_DEFAULT,') && !/function conversionARSFromEnv[\s\S]*?return null/.test(dsSrc));
  check('D2 · server.js /cargar: bypass cobro_directo (ARS + saldo > 0 → valida tarjeta, sin cargarBilletera)', srv.includes("if (w0.currency === 'ARS' && w0.balance_cents > 0)") && srv.includes('cobro_directo: true') && srv.includes('resolverTarjetaGuardada(client, stripeCustomer)'));
  check('D3 · server.js /impulsar: bypass cobroDirectoUSD + cobrarDirecto con cobrarImpulso, sin 409 saldo_ars_pendiente', srv.includes('const cobroDirectoUSD = !esARS') && srv.includes('cobrarDirecto: async (d) =>') && srv.includes('cobrarImpulso({') && !srv.includes("motivo: 'saldo_ars_pendiente'"));
  check('D4 · server.js /destacado/impulsar: crédito en anuncio_fallido (acreditarCreditoAnuncioFallido, sin reembolso)', srv.includes('acreditarCreditoAnuncioFallido({') && srv.includes("kind = 'credito_anuncio_fallido'") && srv.includes('SIN reembolso'));
  check('D5 · app.js: pzBoostCargar muestra el mensaje de cobro directo (j.cobro_directo)', app.includes('j.cobro_directo') && app.includes('El cobro en dólares se hace directo al impulsar'));
  check('D6 · ads-billetera.js: acreditarCreditoAnuncioFallido exportado + cobrarDirecto en impulsarConSaldo', adSrc.includes('function acreditarCreditoAnuncioFallido(') && adSrc.includes('acreditarCreditoAnuncioFallido,') && adSrc.includes('cobrarDirecto') && adSrc.includes("ref = 'credito_' + String(cobroId)"));

  // ── §E · boot (servidor real, DATA_DIR fuera de release/) ──
  console.log('§E · boot');
  let expressOk = false;
  try { require.resolve('express'); expressOk = true; } catch (e) { expressOk = false; }
  if (!expressOk) {
    skip('E1–E10 · boot completo', 'express no resoluble (correr con NODE_PATH=/home/hatch/workspace/posta/node_modules)');
  } else {
    await boot();
  }

  console.log('\n== RESULTADO ==');
  console.log('ok: ' + ok + ' · mal: ' + mal + ' · saltados: ' + saltados);
  if (mal > 0) { console.log('FALLA: hay ' + mal + ' checks en rojo.'); process.exitCode = 1; }
  else { console.log('TODO VERDE.'); }

  async function boot() {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const env = { ...process.env, PORT: String(PUERTO), DATA_DIR, SESSION_SECRET: 'test-v888', ADMIN_TOKEN: 'test-admin-v888', DESTACADO_BOOST_ENABLED: '1' };
    delete env.MP_ACCESS_TOKEN; delete env.MP_PUBLIC_KEY; delete env.STRIPE_SECRET_KEY; delete env.META_APP_ID; delete env.META_APP_SECRET; delete env.META_ACCESS_TOKEN;
    const proc = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { out += d; });
    const pid = proc.pid;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function req(pathname, opts) {
      const res = await fetch('http://127.0.0.1:' + PUERTO + pathname, opts || {});
      let body = null;
      const txt = await res.text();
      try { body = JSON.parse(txt); } catch (e) { body = txt; }
      return { status: res.status, headers: res.headers, body, txt };
    }
    const cookieOf = (res) => {
      const all = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      const list = all.length ? all : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
      return list.map((c) => c.split(';')[0]).join('; ');
    };
    try {
      let vivo = false;
      for (let i = 0; i < 60; i++) {
        await sleep(500);
        try { const v = await req('/api/version'); if (v.body && v.body.build) { vivo = true; break; } } catch (e) {}
      }
      check('E1 · boot levanta y /api/version responde', vivo, out.slice(-500));
      const ver = await req('/api/version');
      check('E2 · /api/version = BUILD de la base (v888, estampado por el preparador)', ver.body && ver.body.build === BUILD_BASE, JSON.stringify(ver.body));

      const r = await req('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'stripe-v888@test.com', password: 'test-v888-x' }) });
      const cookie = cookieOf(r);
      const dbPath = path.join(DATA_DIR, 'posta.db');
      const db = new DatabaseSync(dbPath);
      const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('stripe-v888@test.com').id;
      check('E3 · registro de usuario Stripe + sesión en cookie', !!uid && cookie.length > 0, JSON.stringify(r.body));
      db.prepare('UPDATE users SET stripe_subscription_id = ? WHERE id = ?').run('sub_test_v888', uid);
      db.prepare('INSERT INTO settings (user_id, demo_mode) VALUES (?, 0) ON CONFLICT(user_id) DO UPDATE SET demo_mode = 0').run(uid);
      // Billetera ARS con saldo > 0: el caso del bypass (decisión 3).
      db.prepare("INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (?, 2000000, 'ARS')").run(uid);
      const postId = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, ig_media_id) VALUES (?, '/media/test-v888.jpg', 'test v888', 'published', '17841400008460056')").run(uid).lastInsertRowid;
      db.close();
      const H = { 'content-type': 'application/json', cookie };

      const bil = await req('/api/ads/billetera', { headers: H });
      check('E4 · billetera: conversion_pendiente false (la tasa 1425 levantó el gate)', bil.body && bil.body.conversion_pendiente === false, JSON.stringify(bil.body));
      const cUSD = await req('/api/ads/billetera/cargar', { method: 'POST', headers: H, body: JSON.stringify({ montoUSD: 50 }) });
      check('E5 · /cargar USD con billetera ARS saldo > 0 y sin Stripe: 409 stripe_no_configurado, NUNCA saldo_ars_pendiente (el bypass valida la tarjeta)', cUSD.status === 409 && cUSD.body && cUSD.body.motivo === 'stripe_no_configurado', cUSD.status + ' ' + JSON.stringify(cUSD.body));
      const iUSD = await req('/api/ads/billetera/impulsar', { method: 'POST', headers: H, body: JSON.stringify({ posteoId: postId, montoUSD: 50 }) });
      check('E6 · /impulsar USD con billetera ARS saldo > 0: llega a ads_no_configurado (gate Meta antes que el bypass)', iUSD.status === 503 && iUSD.body && iUSD.body.motivo === 'ads_no_configurado', iUSD.status + ' ' + JSON.stringify(iUSD.body));
      const home = await req('/');
      check('E7 · index / responde 200', home.status === 200, 'status ' + home.status);
      const bundle = await req('/app.js?v=597');
      check('E8 · bundle servido /app.js?v=597: trae el mensaje de cobro directo', bundle.status === 200 && bundle.txt.includes('El cobro en dólares se hace directo al impulsar'), 'status ' + bundle.status);
    } finally {
      try { process.kill(pid, 'SIGTERM'); } catch (e) {}
      await sleep(1500);
      let muerto = false;
      try { process.kill(pid, 0); } catch (e) { muerto = true; }
      check('E9 · boot muerto por PID exacto (SIGTERM)', muerto, 'pid ' + pid + ' sigue vivo');
      let puertoLibre = false;
      try { await fetch('http://127.0.0.1:' + PUERTO + '/api/version'); } catch (e) { puertoLibre = true; }
      check('E10 · puerto ' + PUERTO + ' libre tras matar el boot', puertoLibre);
    }
  }
})();
