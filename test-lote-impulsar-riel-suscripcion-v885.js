// test-lote-impulsar-riel-suscripcion-v885.js
// LOTE IMPULSAR: COBRAR CON LA TARJETA DE LA SUSCRIPCIÓN (v885)
// La moneda del cobro sigue al riel de la suscripción: MP → ARS
// (preferencia de checkout, el preapproval NO permite un cargo extra
// off-session — ver STATUS.md §«La incógnita de MP»), Stripe → USD
// (off-session con la tarjeta guardada, el flujo de siempre).
// Base: v884 (BUILD 20261105-v884). Re-basado por anclas sobre v884 por
// el re-estampador; fusión v880+v885 en la hoja 3D-3H (ver STATUS.md).
// BUILD estampado a v885, ?v= a 597 y CHUNK_V a v885 por el re-estampador.
// Uso: node test-lote-impulsar-riel-suscripcion-v885.js
// (§C boot requiere npm install previo en release/; si no hay
// node_modules, §C se salta con aviso y el resto corre igual.)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = __dirname;
const BUILD_ESPERADO = '20261105-v885'; // (re-pineado por el preparador v885)
const PUERTO = 18754;
const DATA_DIR = path.join(ROOT, '..', 'boot-data-v885');
const AD = require('./ads-billetera.js');

let ok = 0, mal = 0, saltados = 0;
function check(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok - ' + nombre); }
  else { mal++; console.log('  MAL - ' + nombre + (extra ? ' :: ' + extra : '')); }
}
function skip(nombre, motivo) { saltados++; console.log('  -- - ' + nombre + ' (' + motivo + ')'); }
function leer(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── §A · módulo ads-billetera.js (puro, sin servidor) ──
console.log('§A · módulo ads-billetera.js');
check('A1 · MONTOS_CARGA_ARS = [10000,20000,50000]', eq(AD.MONTOS_CARGA_ARS, [10000, 20000, 50000]));
check('A2 · MONTOS_IMPULSO_ARS = [5000,10000,20000]', eq(AD.MONTOS_IMPULSO_ARS, [5000, 10000, 20000]));
check('A3 · MONTOS_CARGA_USD intacto [20,50,100]', eq(AD.MONTOS_CARGA_USD, [20, 50, 100]));
check('A4 · DIAS_BILLETERA = 7', AD.DIAS_BILLETERA === 7);
check('A5 · validarMontoARS acepta 10000/20000/50000', AD.validarMontoARS(10000) && AD.validarMontoARS(20000) && AD.validarMontoARS(50000));
check('A6 · validarMontoARS rechaza 7000/9999/20/50/100/"10000"/null/0', !AD.validarMontoARS(7000) && !AD.validarMontoARS(9999) && !AD.validarMontoARS(20) && !AD.validarMontoARS(50) && !AD.validarMontoARS(100) && !AD.validarMontoARS('10000') && !AD.validarMontoARS(null) && !AD.validarMontoARS(0));
check('A7 · validarPresupuestoARS acepta 5000/10000/20000', AD.validarPresupuestoARS(5000) && AD.validarPresupuestoARS(10000) && AD.validarPresupuestoARS(20000));
check('A8 · validarPresupuestoARS rechaza 4999/20001/50/100', !AD.validarPresupuestoARS(4999) && !AD.validarPresupuestoARS(20001) && !AD.validarPresupuestoARS(50) && !AD.validarPresupuestoARS(100));
check('A9 · refDebitoBoostARS: boost_ars:u7:p9:10000:2026-11-10', AD.refDebitoBoostARS({ clienteId: 7, posteoId: 9, montoARS: 10000, fecha: '2026-11-10' }) === 'boost_ars:u7:p9:10000:2026-11-10');
check('A10 · ref ARS distinto del ref USD (sin colisión de namespace)', AD.refDebitoBoostARS({ clienteId: 7, posteoId: 9, montoARS: 10000, fecha: '2026-11-10' }) !== AD.refDebitoBoost({ clienteId: 7, posteoId: 9, montoUSD: 50, fecha: '2026-11-10' }));

// ── A11–A20 · cargarBilleteraARS ──
(async () => {
  const base = { clienteId: 7, montoARS: 20000, monedaActual: 'ARS', saldoActual: 0, ref: 'adtopup_7_test', buscarCarga: async () => null, demo: false };
  let llamadas = 0;
  const prefOk = async ({ clienteId, montoARS, ref }) => { llamadas++; return { ok: true, init_point: 'https://mp.test/checkout/' + ref, clienteId, montoARS }; };
  let r = await AD.cargarBilleteraARS({ ...base, crearPreferencia: prefOk });
  check('A11 · cargarBilleteraARS ok: init_point + montoARS + ref', r.ok === true && r.init_point === 'https://mp.test/checkout/adtopup_7_test' && r.montoARS === 20000 && r.ref === 'adtopup_7_test' && llamadas === 1, JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, demo: true, crearPreferencia: prefOk });
  check('A12 · cargarBilleteraARS demo: motivo demo, sin preferencia', r.ok === false && r.motivo === 'demo' && llamadas === 1, JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, montoARS: 7000, crearPreferencia: prefOk });
  check('A13 · cargarBilleteraARS monto 7000: monto_invalido, sin preferencia', r.ok === false && r.motivo === 'monto_invalido' && llamadas === 1, JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, monedaActual: 'USD', saldoActual: 5000, crearPreferencia: prefOk });
  check('A14 · cargarBilleteraARS saldo USD > 0: saldo_usd_pendiente, sin preferencia', r.ok === false && r.motivo === 'saldo_usd_pendiente' && llamadas === 1, JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, monedaActual: 'USD', saldoActual: 0, crearPreferencia: prefOk });
  check('A15 · cargarBilleteraARS saldo USD = 0: procede (migración)', r.ok === true && llamadas === 2, JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, monedaActual: 'ARS', saldoActual: 2000000, crearPreferencia: prefOk });
  check('A16 · cargarBilleteraARS saldo ARS > 0: procede (la ARS es la viva)', r.ok === true && llamadas === 3, JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, buscarCarga: async () => ({ init_point: 'https://mp.test/checkout/viejo' }), crearPreferencia: prefOk });
  check('A17 · cargarBilleteraARS reintento: ya_creado, sin segunda preferencia', r.ok === true && r.ya_creado === true && r.init_point === 'https://mp.test/checkout/viejo' && llamadas === 3, JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, crearPreferencia: async () => ({ ok: false, motivo: 'mp_caido' }) });
  check('A18 · cargarBilleteraARS preferencia ok:false: motivo del proveedor', r.ok === false && r.motivo === 'mp_caido', JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, crearPreferencia: async () => { throw new Error('red'); } });
  check('A19 · cargarBilleteraARS preferencia que tira: preferencia_fallida', r.ok === false && r.motivo === 'preferencia_fallida', JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, crearPreferencia: async () => ({ ok: true }) });
  check('A20 · cargarBilleteraARS sin init_point: preferencia_fallida', r.ok === false && r.motivo === 'preferencia_fallida', JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, clienteId: null, crearPreferencia: prefOk });
  check('A21 · cargarBilleteraARS sin cliente: sin_cliente', r.ok === false && r.motivo === 'sin_cliente', JSON.stringify(r));
  r = await AD.cargarBilleteraARS({ ...base, crearPreferencia: undefined });
  check('A22 · cargarBilleteraARS sin crearPreferencia: sin_proveedores', r.ok === false && r.motivo === 'sin_proveedores', JSON.stringify(r));

  // ── A23–A33 · impulsarConSaldo ARS ──
  const ENV_ON = { DESTACADO_BOOST_ENABLED: '1' };
  const splitARS = (cents) => ({ fee_cents: Math.round(cents * 0.10), spend_cents: cents - Math.round(cents * 0.10) });
  function fakesARS(over) {
    const llamadas = { crear: 0, debitar: 0, registrar: [] };
    return {
      llamadas,
      crearAnuncio: async (a) => { llamadas.crear++; return { ok: true, anuncioId: 'ad_1', campaignId: 'cmp_1', adsetId: 'ads_1', adId: 'a_1' }; },
      debitar: async (d) => { llamadas.debitar++; return { ok: true, saldoNuevo: 1000000 }; },
      registrar: async (x) => { llamadas.registrar.push(x); return { ok: true }; },
      buscarDebito: async () => null,
      ...(over || {}),
    };
  }
  const baseImp = { clienteId: 7, posteoId: 9, moneda: 'ARS', montoARS: 10000, zona: 'Argentina', env: ENV_ON, adsConfigurado: true, paginaAutorizada: true, permisoAds: true, conversionARS: null, saldoCentsARS: 2000000, splitARS, fecha: '2026-11-10', demo: false };
  let f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseImp, ...f });
  check('A23 · impulsar ARS ok: spend 900000 + fee 100000 (10%), saldoNuevo 1000000, dias 7', r.ok === true && r.montoARS === 10000 && r.anuncioId === 'ad_1' && r.dias === 7 && r.saldoNuevo === 1000000 && r.ref === 'boost_ars:u7:p9:10000:2026-11-10' && f.llamadas.crear === 1 && f.llamadas.debitar === 1 && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'exito' && f.llamadas.registrar[0].feeCents === 100000, JSON.stringify(r));
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseImp, splitARS: undefined, ...f });
  check('A24 · impulsar ARS sin splitARS: sin_proveedores, sin anuncio', r.ok === false && r.motivo === 'sin_proveedores' && f.llamadas.crear === 0, JSON.stringify(r));
  check('A25 · impulsar ARS con conversionARS null: NO es conversion_pendiente', r.motivo !== 'conversion_pendiente');
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseImp, montoARS: 7000, ...f });
  check('A26 · impulsar ARS monto 7000: monto_invalido, sin anuncio', r.ok === false && r.motivo === 'monto_invalido' && f.llamadas.crear === 0, JSON.stringify(r));
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseImp, saldoCentsARS: 500000, ...f });
  check('A27 · impulsar ARS saldo $5.000 < $10.000: saldo_insuficiente, sin anuncio ni débito', r.ok === false && r.motivo === 'saldo_insuficiente' && f.llamadas.crear === 0 && f.llamadas.debitar === 0, JSON.stringify(r));
  f = fakesARS({ crearAnuncio: async () => ({ ok: false, error: 'meta' }) });
  r = await AD.impulsarConSaldo({ ...baseImp, ...f });
  check('A28 · impulsar ARS anuncio fallido: anuncio_fallido, SIN débito', r.ok === false && r.motivo === 'anuncio_fallido' && f.llamadas.debitar === 0, JSON.stringify(r));
  f = fakesARS({ buscarDebito: async () => ({ anuncioId: 'ad_viejo', meta_campaign_id: 'cmp_viejo' }) });
  r = await AD.impulsarConSaldo({ ...baseImp, saldoCentsARS: 0, ...f });
  check('A29 · impulsar ARS reintento (ya creado): ok ya_creado aunque el saldo ya bajó', r.ok === true && r.ya_creado === true && r.anuncioId === 'ad_viejo' && f.llamadas.crear === 0 && f.llamadas.debitar === 0, JSON.stringify(r));
  f = fakesARS({ debitar: async () => ({ ok: false, motivo: 'saldo_insuficiente' }) });
  r = await AD.impulsarConSaldo({ ...baseImp, ...f });
  check('A30 · impulsar ARS débito fallido: debito_fallido + registro, con anuncioId', r.ok === false && r.motivo === 'debito_fallido' && r.anuncioId === 'ad_1' && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'debito_fallido', JSON.stringify(r));
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseImp, demo: true, ...f });
  check('A31 · impulsar ARS demo: motivo demo, sin anuncio', r.ok === false && r.motivo === 'demo' && f.llamadas.crear === 0, JSON.stringify(r));
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseImp, env: {}, ...f });
  check('A32 · impulsar ARS flag apagado: boost_deshabilitado', r.ok === false && r.motivo === 'boost_deshabilitado' && f.llamadas.crear === 0, JSON.stringify(r));

  // ── A33–A36 · impulsarConSaldo USD (regresión: el flujo de siempre) ──
  const baseUSD = { clienteId: 7, posteoId: 9, moneda: 'USD', montoUSD: 50, zona: 'Argentina', env: ENV_ON, adsConfigurado: true, paginaAutorizada: true, permisoAds: true, conversionARS: (usd) => usd * 100 * 1425, saldoCentsUSD: 10000, fecha: '2026-11-10', demo: false };
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f });
  // $50 × 1425 = $71.250 ARS = 7.125.000 centavos; el flujo USD no lleva
  // fee (el registro no trae feeCents, no 0).
  check('A33 · impulsar USD con tasa: ok, spend 7125000, sin fee, ref boost_usd', r.ok === true && r.montoUSD === 50 && r.ref === 'boost_usd:u7:p9:50:2026-11-10' && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].feeCents == null && f.llamadas.registrar[0].spendCents === 7125000, JSON.stringify(r) + ' :: registro=' + JSON.stringify(f.llamadas.registrar[0]));
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseUSD, conversionARS: null, ...f });
  check('A34 · impulsar USD sin tasa: conversion_pendiente, sin anuncio', r.ok === false && r.motivo === 'conversion_pendiente' && f.llamadas.crear === 0, JSON.stringify(r));
  f = fakesARS();
  r = await AD.impulsarConSaldo({ ...baseUSD, saldoCentsUSD: 4000, ...f });
  check('A35 · impulsar USD saldo $40 < $50: saldo_insuficiente', r.ok === false && r.motivo === 'saldo_insuficiente' && f.llamadas.crear === 0, JSON.stringify(r));
  f = fakesARS({ buscarDebito: async () => ({ meta_campaign_id: 'cmp_viejo_usd' }) });
  r = await AD.impulsarConSaldo({ ...baseUSD, saldoCentsUSD: 0, ...f });
  check('A36 · impulsar USD reintento: ok ya_creado', r.ok === true && r.ya_creado === true && r.anuncioId === 'cmp_viejo_usd', JSON.stringify(r));

  // ── A37–A38 · cargarBilletera USD (regresión) ──
  let cobros = 0;
  r = await AD.cargarBilletera({ clienteId: 7, montoUSD: 50, monedaActual: 'ARS', saldoActual: 5000, ref: 'carga_7_x', buscarCarga: async () => null, cobrar: async () => { cobros++; return { ok: true, cobroId: 'ch_1' }; }, acreditar: async () => ({ ok: true, saldoNuevo: 5000 }), demo: false });
  check('A37 · cargar USD saldo ARS > 0: saldo_ars_pendiente, sin cobro', r.ok === false && r.motivo === 'saldo_ars_pendiente' && cobros === 0, JSON.stringify(r));
  r = await AD.cargarBilletera({ clienteId: 7, montoUSD: 50, monedaActual: 'USD', saldoActual: 0, ref: 'carga_7_y', buscarCarga: async () => null, cobrar: async () => { cobros++; return { ok: true, cobroId: 'ch_2' }; }, acreditar: async () => ({ ok: true, saldoNuevo: 5000 }), demo: false });
  check('A38 · cargar USD ok: cobro + saldoNuevo 5000', r.ok === true && r.cobroId === 'ch_2' && r.saldoNuevo === 5000 && cobros === 1, JSON.stringify(r));

  // ── §B · fuentes (server.js / app.js / chunk-analisis.js / index) ──
  console.log('§B · fuentes');
  const srv = leer('server.js');
  const app = leer('public/app.js');
  const chk = leer('public/chunk-analisis.js');
  const idx = leer('public/index.html');
  check('B1 · server.js: railCobro (stripe > mp > null)', /function railCobro\(uid\)/.test(srv) && srv.includes("if (u.stripe_subscription_id) return 'stripe'") && srv.includes("if (u.mp_preapproval_id) return 'mp'"));
  check('B2 · server.js: billetera GET expone billing_provider + montos_ars + presupuestos_ars + min_topup_ars', srv.includes('billing_provider: railCobro(uid)') && srv.includes('montos_ars: adsBilletera.MONTOS_CARGA_ARS') && srv.includes('presupuestos_ars: adsBilletera.MONTOS_IMPULSO_ARS') && srv.includes('min_topup_ars: adsBilletera.MONTOS_CARGA_ARS[0]'));
  check('B3 · server.js: /cargar rama MP (railCobro === mp + montoARS + mp_no_configurado + init_point)', srv.includes("railCobro(uid) === 'mp'") && srv.includes('validarMontoARS(montoARS)') && srv.includes("motivo: 'mp_no_configurado'") && srv.includes('init_point: r.init_point'));
  check('B4 · server.js: /cargar MP usa createTopupPreference + ref adtopup_<uid>_<rand>', srv.includes('mp.createTopupPreference') && srv.includes('adtopup_${uid}_'));
  check('B5 · server.js: /impulsar rama ARS (esARS + montoARS + boost_ars + splitARS)', srv.includes('const esARS') && srv.includes('montoARS') && srv.includes('boost_ars') && srv.includes('splitARS'));
  check('B6 · server.js: /impulsar gate saldo_ars_pendiente solo para USD', srv.includes("motivo: 'saldo_ars_pendiente'") && srv.includes("if (!esARS && w.currency === 'ARS'"));
  check('B7 · server.js: /api/ads/topup espejo (saldo_usd_pendiente)', srv.includes("motivo: 'saldo_usd_pendiente'"));
  check('B8 · server.js: webhook migra USD+0 → ARS antes de acreditar', (srv.match(/UPDATE ad_wallets SET currency = 'ARS'/g) || []).length >= 3);
  check('B9 · server.js: BUILD v885 ×1, sin resto de v864', srv.includes("20261105-v885") && !srv.includes('20261105-v864'));
  check('B10 · app.js: helpers pzBoostEsMP / pzBoostFmtMonto / pzBoostMontos / pzBoostSaldo / pzBoostMinTopup', app.includes('function pzBoostEsMP()') && app.includes('function pzBoostFmtMonto(n)') && app.includes('function pzBoostMontos()') && app.includes('function pzBoostSaldo()') && app.includes('function pzBoostMinTopup()'));
  check('B11 · app.js: CHUNK_V v885 ×1, sin resto de v850 ni v878 (re-pineado por el re-estampador v885)', (app.match(/CHUNK_V = '20261105-v885'/g) || []).length === 1 && !app.includes("20261105-v850") && !app.includes("20261105-v878"));
  check('B12 · app.js: pzBoostConfirmar manda montoARS en MP', app.includes('montoARS: monto') && app.includes('railMP ? { montoARS: monto }'));
  check('B13 · app.js: pzBoostCargar redirige a init_point en MP', app.includes('j.init_point') && app.includes('window.location.href = j.init_point'));
  check('B14 · app.js: pzBoostMotivo caso saldo_usd_pendiente + monto_invalido por riel', app.includes("case 'saldo_usd_pendiente'") && app.includes("Ese monto no es válido. Elegí $5.000, $10.000 o $20.000"));
  check('B15 · app.js: pzBoostCargar else sigue llamando pzBoostCargarMotivo con montoCarga (fusión v877: variable motivo)', app.includes("decir(pzBoostCargarMotivo(motivo, montoCarga, j && j.cobroId))"));
  check('B16 · app.js: fusión v877 conserva anaAgregarTarjetaBtn en el else sin tarjeta', app.includes('anaAgregarTarjetaBtn(msgEl)') && app.includes("motivo === 'sin_cliente_stripe'"));
  check('B17 · chunk-analisis.js: helpers anaEsMP / anaFmtMonto / anaMontosCarga / anaMontosImpulso', chk.includes('function anaEsMP()') && chk.includes('function anaFmtMonto(n)') && chk.includes('function anaMontosCarga()') && chk.includes('function anaMontosImpulso()'));
  check('B18 · chunk-analisis.js: anaBilleteraCargar redirige a init_point en MP', chk.includes('init_point') && chk.includes('window.location.href'));
  check('B19 · chunk-analisis.js: botón Agregar tarjeta intacto en la billetera (v877)', chk.includes('anaAgregarTarjetaBtn(anaCargarMsgEl())'));
  check('B20 · chunk-analisis.js: auto-topup vedado en MP (anaAdsRutaImpulsar)', chk.includes("d.billetera.billing_provider") && chk.includes("=== 'mp'") && chk.includes('cargar_y_impulsar') && chk.includes('d.auto_topup'));
  check('B21 · chunk-analisis.js: saldo_usd_pendiente en anaCargarMotivo / anaBoostRecMotivo', chk.includes('saldo_usd_pendiente'));
  check('B22 · index ES: ?v=597 ×1, sin resto de 596', idx.includes('app.js?v=597') && !idx.includes('app.js?v=596'));
  check('B23 · ads-billetera.js: header documenta que MP no permite cargo extra', leer('ads-billetera.js').includes('el preapproval de MP no permite un cargo extra'));
  // (RE-ESTAMPADOR v885) Pins de la fusión v880+v885: la hoja 3D-3H de
  // v880 no existía cuando se escribió el lote; sin estos pins, en riel
  // MP los botones mandarían montoARS 50/20/100 y pzBoostPuede sería
  // siempre falso (monedaARS). Ver STATUS.md §Fusión.
  check('B24 · app.js: botones 3D-3H salen de pzBoostMontos() (riel), no fijos USD', app.includes('pzBoostImpulsarMonto(${m3Main}, this)') && app.includes('pzBoostFmtMonto(m3Main)') && app.includes('pzBoostFmtMonto(m3A)') && app.includes('pzBoostFmtMonto(m3B)') && !app.includes('pzBoostImpulsarMonto(50, this)'));
  check('B25 · app.js: pzBoostPuede espeja el «puede» del lote (saldoViejoARS + pzBoostSaldo)', (app.match(/const saldoViejoARS = monedaARS && !railMP;/g) || []).length >= 2 && app.includes('return !gate.cerrado && !saldoViejoARS && saldo >= m;'));
  check('B26 · app.js: pzBoostImpulsarMonto acepta la lista del riel (espejo hunk 6)', (app.match(/if \(!pzBoostMontos\(\)\.includes\(m\)\) return;/g) || []).length === 2);

  // ── §C · boot (servidor real, DATA_DIR fuera de release/) ──
  console.log('§C · boot');
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'express', 'package.json'))) {
    skip('C1–C18 · boot completo', 'sin node_modules en release/ (npm install previo)');
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
    const env = { ...process.env, PORT: String(PUERTO), DATA_DIR, SESSION_SECRET: 'test-v878', ADMIN_TOKEN: 'test-admin-v878', DESTACADO_BOOST_ENABLED: '1' };
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
      // Esperar al boot (hasta 30 s).
      let vivo = false;
      for (let i = 0; i < 60; i++) {
        await sleep(500);
        try { const v = await req('/api/version'); if (v.body && v.body.build) { vivo = true; break; } } catch (e) {}
      }
      check('C1 · boot levanta y /api/version responde', vivo, out.slice(-500));
      const ver = await req('/api/version');
      check('C2 · /api/version = BUILD del HEAD (v885; yo no estampo)', ver.body && ver.body.build === BUILD_ESPERADO, JSON.stringify(ver.body));

      async function register(email) {
        const r = await req('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'test-v878-x' }) });
        // El registro NO devuelve el id: se resuelve por email en la DB.
        return { cookie: cookieOf(r), body: r.body, email };
      }
      const mp = await register('mp-v878@test.com');
      const st = await register('stripe-v878@test.com');
      const nr = await register('norail-v878@test.com');
      // Rieles + demo off + billetera ARS sembrada + posteos publicados.
      const dbPath = path.join(DATA_DIR, 'posta.db');
      const db = new DatabaseSync(dbPath);
      mp.id = db.prepare('SELECT id FROM users WHERE email = ?').get(mp.email).id;
      st.id = db.prepare('SELECT id FROM users WHERE email = ?').get(st.email).id;
      nr.id = db.prepare('SELECT id FROM users WHERE email = ?').get(nr.email).id;
      check('C3 · registro de 3 usuarios (MP / Stripe / sin riel) + sesión en cookie', !!(mp.id && st.id && nr.id) && mp.id !== st.id && st.id !== nr.id && mp.cookie.length > 0 && st.cookie.length > 0 && nr.cookie.length > 0, JSON.stringify([mp.body, st.body, nr.body]));
      db.prepare('UPDATE users SET mp_preapproval_id = ? WHERE id = ?').run('pre_test_v878', mp.id);
      db.prepare('UPDATE users SET stripe_subscription_id = ? WHERE id = ?').run('sub_test_v878', st.id);
      for (const u of [mp, st, nr]) db.prepare('INSERT INTO settings (user_id, demo_mode) VALUES (?, 0) ON CONFLICT(user_id) DO UPDATE SET demo_mode = 0').run(u.id);
      db.prepare("INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (?, 2000000, 'ARS')").run(mp.id);
      const postMP = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, ig_media_id) VALUES (?, '/media/test-v878.jpg', 'test v878', 'published', '17841400008460056')").run(mp.id).lastInsertRowid;
      const postST = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, ig_media_id) VALUES (?, '/media/test-v878.jpg', 'test v878', 'published', '17841400008460056')").run(st.id).lastInsertRowid;
      db.close();
      const H = (c) => ({ 'content-type': 'application/json', cookie: c });

      const bilMP = await req('/api/ads/billetera', { headers: H(mp.cookie) });
      check('C4 · MP: billetera billing_provider mp + montos_ars + presupuestos_ars + currency ARS', bilMP.body && bilMP.body.billing_provider === 'mp' && eq(bilMP.body.montos_ars, [10000, 20000, 50000]) && eq(bilMP.body.presupuestos_ars, [5000, 10000, 20000]) && bilMP.body.currency === 'ARS', JSON.stringify(bilMP.body));
      const bilST = await req('/api/ads/billetera', { headers: H(st.cookie) });
      check('C5 · Stripe: billetera billing_provider stripe + montos_usd [20,50,100]', bilST.body && bilST.body.billing_provider === 'stripe' && eq(bilST.body.montos_usd, [20, 50, 100]), JSON.stringify(bilST.body));
      const bilNR = await req('/api/ads/billetera', { headers: H(nr.cookie) });
      check('C6 · Sin riel: billing_provider null + currency ARS (default de billetera fresca) + tiene_tarjeta false', bilNR.body && bilNR.body.billing_provider === null && bilNR.body.currency === 'ARS' && bilNR.body.tiene_tarjeta === false, JSON.stringify(bilNR.body));

      const cMP = await req('/api/ads/billetera/cargar', { method: 'POST', headers: H(mp.cookie), body: JSON.stringify({ montoARS: 20000 }) });
      check('C7 · MP /cargar montoARS 20000 sin MP configurado: 503 mp_no_configurado', cMP.status === 503 && cMP.body && cMP.body.motivo === 'mp_no_configurado', cMP.status + ' ' + JSON.stringify(cMP.body));
      const cMP2 = await req('/api/ads/billetera/cargar', { method: 'POST', headers: H(mp.cookie), body: JSON.stringify({ montoARS: 7000 }) });
      check('C8 · MP /cargar montoARS 7000: 400 monto_invalido', cMP2.status === 400 && cMP2.body && cMP2.body.motivo === 'monto_invalido', cMP2.status + ' ' + JSON.stringify(cMP2.body));
      const cST = await req('/api/ads/billetera/cargar', { method: 'POST', headers: H(st.cookie), body: JSON.stringify({ montoUSD: 50 }) });
      check('C9 · Stripe /cargar montoUSD 50 sin Stripe: 409 stripe_no_configurado', cST.status === 409 && cST.body && cST.body.motivo === 'stripe_no_configurado', cST.status + ' ' + JSON.stringify(cST.body));
      const cNR = await req('/api/ads/billetera/cargar', { method: 'POST', headers: H(nr.cookie), body: JSON.stringify({ montoUSD: 50 }) });
      check('C10 · Sin riel /cargar montoUSD 50: 409 stripe_no_configurado (sin Stripe; el respaldo Agregar tarjeta es del cliente)', cNR.status === 409 && cNR.body && cNR.body.motivo === 'stripe_no_configurado', cNR.status + ' ' + JSON.stringify(cNR.body));
      const cSTars = await req('/api/ads/billetera/cargar', { method: 'POST', headers: H(st.cookie), body: JSON.stringify({ montoARS: 20000 }) });
      check('C11 · Stripe que manda montoARS: cae en la rama USD → 400 monto_invalido', cSTars.status === 400 && cSTars.body && cSTars.body.motivo === 'monto_invalido', cSTars.status + ' ' + JSON.stringify(cSTars.body));

      const iMP = await req('/api/ads/billetera/impulsar', { method: 'POST', headers: H(mp.cookie), body: JSON.stringify({ posteoId: postMP, montoARS: 10000 }) });
      check('C12 · MP /impulsar montoARS 10000 (billetera ARS $20.000): pasa monto + posteo + flag y llega a ads_no_configurado', iMP.status === 503 && iMP.body && iMP.body.motivo === 'ads_no_configurado', iMP.status + ' ' + JSON.stringify(iMP.body));
      const iMP2 = await req('/api/ads/billetera/impulsar', { method: 'POST', headers: H(mp.cookie), body: JSON.stringify({ posteoId: postMP, montoARS: 7000 }) });
      check('C13 · MP /impulsar montoARS 7000: 400 monto_invalido', iMP2.status === 400 && iMP2.body && iMP2.body.motivo === 'monto_invalido', iMP2.status + ' ' + JSON.stringify(iMP2.body));
      const iST = await req('/api/ads/billetera/impulsar', { method: 'POST', headers: H(st.cookie), body: JSON.stringify({ posteoId: postST, montoUSD: 50 }) });
      check('C14 · Stripe /impulsar montoUSD 50: llega al mismo gate ads_no_configurado', iST.status === 503 && iST.body && iST.body.motivo === 'ads_no_configurado', iST.status + ' ' + JSON.stringify(iST.body));
      const iST2 = await req('/api/ads/billetera/impulsar', { method: 'POST', headers: H(st.cookie), body: JSON.stringify({ posteoId: 999999, montoUSD: 50 }) });
      check('C15 · Stripe /impulsar posteo inexistente: 404 posteo_no_encontrado', iST2.status === 404 && iST2.body && iST2.body.motivo === 'posteo_no_encontrado', iST2.status + ' ' + JSON.stringify(iST2.body));
      const iMP3 = await req('/api/ads/billetera/impulsar', { method: 'POST', headers: H(mp.cookie), body: JSON.stringify({ posteoId: postMP, montoUSD: 50 }) });
      // El gate de billetera (saldo_ars_pendiente) está DESPUÉS de
      // adsConfigured: sin Meta, el USD también llega a ads_no_configurado.
      // Que el gate dispare para USD y no para ARS se verifica en §A (el
      // módulo) + §B6 (código): en el boot offline no es alcanzable.
      check('C16 · MP /impulsar montoUSD 50: llega a ads_no_configurado (gate Meta antes que billetera)', iMP3.status === 503 && iMP3.body && iMP3.body.motivo === 'ads_no_configurado', iMP3.status + ' ' + JSON.stringify(iMP3.body));

      const bundle = await req('/app.js?v=20261105-v885');
      check('C17 · bundle servido /app.js?v=20261105-v885: trae pzBoostEsMP + CHUNK_V v885 (re-pineado por el re-estampador v885)', bundle.status === 200 && bundle.txt.includes('function pzBoostEsMP()') && bundle.txt.includes("CHUNK_V = '20261105-v885'"), 'status ' + bundle.status);
      const chunk = await req('/chunk-analisis.js?v=20261105-v885');
      check('C18 · chunk servido: trae anaEsMP + anaAgregarTarjetaBtn (respaldo v877)', chunk.status === 200 && chunk.txt.includes('function anaEsMP()') && chunk.txt.includes('anaAgregarTarjetaBtn'), 'status ' + chunk.status);
    } finally {
      // Matar el boot por PID exacto de node y verificar el puerto libre.
      try { process.kill(pid, 'SIGTERM'); } catch (e) {}
      await sleep(1500);
      let muerto = false;
      try { process.kill(pid, 0); } catch (e) { muerto = true; }
      check('C19 · boot muerto por PID exacto (SIGTERM)', muerto, 'pid ' + pid + ' sigue vivo');
      let puertoLibre = false;
      try { await fetch('http://127.0.0.1:' + PUERTO + '/api/version'); } catch (e) { puertoLibre = true; }
      check('C20 · puerto ' + PUERTO + ' libre tras matar el boot', puertoLibre);
    }
  }
})();
