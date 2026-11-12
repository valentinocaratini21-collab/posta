// test-lote-moneda-cuenta-ads-v973.js — LOTE MONEDA-CUENTA-ADS (base v975).
// El gasto de Impulsar se calcula según la moneda REAL de la cuenta
// publicitaria de Meta, no asumiendo ARS:
// - cuenta USD: $20 → presupuesto 2000 (centavos de dólar), SIN ×1425.
// - cuenta ARS: $20 → 2000 × 1425 (comportamiento actual, intacto).
// - moneda indeterminada / desconocida: RECHAZO sin campaña y sin cobro.
// Verificación SIN llamadas reales a Meta: `fetch` global falsificado
// (meta_ads.js lo resuelve en tiempo de llamada). El cobro al cliente
// (Stripe, USD) nunca cambia. Uso: node test-lote-moneda-cuenta-ads-v973.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
let ok = 0, bad = 0, saltados = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const skip = (name, why) => { saltados++; console.log('SKIP', name, '—', why); };
const leer = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────── Meta FALSO (stub de fetch) ─────────────────
// Escenarios por ad account id (ids distintos: la caché de moneda es
// por cuenta y no se comparte entre escenarios):
// 900001 → USD · 900002 → ARS · 900003 → error OAuth de Meta ·
// 900004 → la red cae · 900005 → EUR (desconocida) · 900006 → sin campo
const fetchCalls = [];
const fetchReal = global.fetch;
global.fetch = async (url, opts) => {
  const u = String(url);
  fetchCalls.push(u);
  const jsonRes = (data, okRes = true, status = 200) => ({ ok: okRes, status, json: async () => data });
  if (u.includes('/act_900001')) return jsonRes({ currency: 'USD' });
  if (u.includes('/act_900002')) return jsonRes({ currency: 'ARS' });
  if (u.includes('/act_900003')) return jsonRes({ error: { message: 'Invalid OAuth access token' } }, false, 400);
  if (u.includes('/act_900004')) throw new TypeError('fetch failed');
  if (u.includes('/act_900005')) return jsonRes({ currency: 'EUR' });
  if (u.includes('/act_900006')) return jsonRes({ id: 'act_900006' });
  throw new Error('fetch falso: URL inesperada ' + u.slice(0, 120));
};
const llamadasA = (frag) => fetchCalls.filter((u) => u.includes(frag)).length;

process.env.META_ADS_TOKEN = 'token-falso-de-prueba-1234567890';
const metaAds = require(path.join(ROOT, 'meta_ads.js'));
const ds = require(path.join(ROOT, 'destacado-semana.js'));
const ab = require(path.join(ROOT, 'ads-billetera.js'));

(async () => {
  // ─────────── A · getAccountCurrency con Meta falso ───────────
  process.env.META_AD_ACCOUNT_ID = '900001';
  const cUsd = await metaAds.getAccountCurrency();
  t(cUsd === 'USD', 'A1 · cuenta USD: getAccountCurrency devuelve USD');
  t(llamadasA('/act_900001') === 1 && fetchCalls[0].includes('fields=currency'), 'A2 · la lectura pide fields=currency sobre /act_<id>');
  const cUsd2 = await metaAds.getAccountCurrency();
  t(cUsd2 === 'USD' && llamadasA('/act_900001') === 1, 'A3 · segunda lectura seguida: caché (sin segunda llamada a Meta)');

  process.env.META_AD_ACCOUNT_ID = '900002';
  t((await metaAds.getAccountCurrency()) === 'ARS', 'A4 · cuenta ARS: devuelve ARS');

  process.env.META_AD_ACCOUNT_ID = '900003';
  t((await metaAds.getAccountCurrency()) === null, 'A5 · error de Meta (OAuth) → null (indeterminada)');
  await metaAds.getAccountCurrency();
  t(llamadasA('/act_900003') === 2, 'A6 · el fallo NO se cachea: el próximo impulso reintenta la lectura');

  process.env.META_AD_ACCOUNT_ID = '900004';
  t((await metaAds.getAccountCurrency()) === null, 'A7 · red caída → null (indeterminada)');

  process.env.META_AD_ACCOUNT_ID = '900005';
  t((await metaAds.getAccountCurrency()) === 'EUR', 'A8 · moneda desconocida: Meta dice EUR y eso se devuelve tal cual (el freno lo pone el servidor)');

  process.env.META_AD_ACCOUNT_ID = '900006';
  t((await metaAds.getAccountCurrency()) === null, 'A9 · respuesta sin campo currency → null');

  process.env.META_ADS_TOKEN = '';
  process.env.META_AD_ACCOUNT_ID = '900001';
  const antes = fetchCalls.length;
  t((await metaAds.getAccountCurrency()) === null && fetchCalls.length === antes, 'A10 · sin configurar → null, sin llamar a Meta');
  process.env.META_ADS_TOKEN = 'token-falso-de-prueba-1234567890';

  // ─────────── B · conversionParaCuenta (pura) ───────────
  const baseSinEnv = ds.conversionARSFromEnv({});
  t(typeof baseSinEnv === 'function' && baseSinEnv(20) === 2850000, 'B1 · conversión base intacta: sin env → 1425 (20 → 2.850.000¢ ARS)');
  const convUSD = ds.conversionParaCuenta(baseSinEnv, 'USD');
  t(typeof convUSD === 'function' && convUSD(20) === 2000 && convUSD(50) === 5000 && convUSD(100) === 10000, 'B2 · cuenta USD: 20/50/100 → 2000/5000/10000 (centavos de dólar, SIN ×1425)');
  const convARS = ds.conversionParaCuenta(baseSinEnv, 'ARS');
  t(typeof convARS === 'function' && convARS(20) === 2850000 && convARS(50) === 7125000 && convARS(100) === 14250000, 'B3 · cuenta ARS: exactamente el comportamiento actual (×1425)');
  const convARSEnv = ds.conversionParaCuenta(ds.conversionARSFromEnv({ IMPULSO_TASA_ARS: '1500' }), 'ARS');
  t(convARSEnv(20) === 3000000, 'B4 · cuenta ARS con env válido: la tasa del env manda, como hoy');
  t(ds.conversionParaCuenta(baseSinEnv, null) === null, 'B5 · moneda indeterminada (null) → SIN conversión (fail-closed)');
  t(ds.conversionParaCuenta(baseSinEnv, 'EUR') === null, 'B6 · moneda desconocida (EUR) → SIN conversión (fail-closed)');
  t(ds.conversionParaCuenta(baseSinEnv, undefined) === null && ds.conversionParaCuenta(baseSinEnv, '') === null, 'B7 · moneda ausente → SIN conversión');

  // ─────────── C · el camino del dinero, cableado como el servidor ───────────
  const ENV_ON = { DESTACADO_BOOST_ENABLED: '1' };
  const spyAds = () => {
    const s = { spend: null, nCrear: 0, nDebitar: 0, nCobrarDirecto: 0, regs: [] };
    s.crearAnuncio = async (a) => { s.nCrear++; s.spend = a.spendCents; return { ok: true, anuncioId: 'camp_1', campaignId: 'camp_1', adsetId: 'adset_1', adId: 'ad_1' }; };
    s.debitarFn = async (d) => { s.nDebitar++; s.debito = d; return { ok: true, saldoNuevo: 8000 }; };
    s.cobrarDirectoFn = async (d) => { s.nCobrarDirecto++; s.cobroDir = d; return { ok: true, cobroId: 'pi_dir_1' }; };
    s.registrar = async (rec) => { s.regs.push(rec); };
    return s;
  };
  const baseBil = (s, conv) => ({
    clienteId: 7, posteoId: 9, montoUSD: 20, zona: 'Estados Unidos', env: ENV_ON,
    adsConfigurado: true, paginaAutorizada: true, permisoAds: true,
    conversionARS: conv, saldoCentsUSD: 10000, fecha: '2026-11-12',
    buscarDebito: () => null, crearAnuncio: s.crearAnuncio, debitar: s.debitarFn, registrar: s.registrar, demo: false,
  });

  // C1 · billetera USD + cuenta USD: el caso de la prueba de $20.
  let s = spyAds();
  let r = await ab.impulsarConSaldo(baseBil(s, ds.conversionParaCuenta(ds.conversionARSFromEnv({}), 'USD')));
  t(r.ok === true && s.spend === 2000, 'C1 · billetera USD + cuenta USD: impulsar $20 → presupuesto 2000¢ USD (sin ×1425 en ningún paso)');
  t(s.nDebitar === 1 && s.debito.montoUSD === 20 && r.saldoNuevo === 8000, 'C2 · el débito de billetera es $20 (2000¢ USD), como siempre');
  t(s.regs.length === 1 && s.regs[0].tipo === 'exito' && s.regs[0].spendCents === 2000, 'C3 · el registro de éxito lleva spendCents 2000');

  // C2 · billetera USD + cuenta ARS: comportamiento actual intacto.
  s = spyAds();
  r = await ab.impulsarConSaldo(baseBil(s, ds.conversionParaCuenta(ds.conversionARSFromEnv({}), 'ARS')));
  t(r.ok === true && s.spend === 2850000, 'C4 · billetera USD + cuenta ARS: $20 → 2.850.000¢ ARS (×1425, como hoy)');

  // C3 · cobro directo (billetera ARS con saldo, v888) + cuenta USD.
  s = spyAds();
  const inpDir = baseBil(s, ds.conversionParaCuenta(ds.conversionARSFromEnv({}), 'USD'));
  delete inpDir.debitar; inpDir.saldoCentsUSD = 0; inpDir.cobrarDirecto = s.cobrarDirectoFn;
  r = await ab.impulsarConSaldo(inpDir);
  t(r.ok === true && s.spend === 2000 && s.nCobrarDirecto === 1 && s.cobroDir.montoUSD === 20 && s.nDebitar === 0,
    'C5 · cobro directo + cuenta USD: ad por 2000¢ USD y cobro al cliente de $20 con su tarjeta (la billetera en pesos no se toca)');

  // C4 · destacado (procesarImpulso) con cuenta USD y ARS.
  const spyDest = () => {
    const d = { spend: null, cobrar: 0, publicar: 0, cobro: null };
    d.cobrarFn = async (a) => { d.cobrar++; d.cobro = a; return { ok: true, cobroId: 'pi_dest_1' }; };
    d.publicarFn = async (a) => { d.publicar++; d.spend = a.spendCents; return { ok: true, anuncioId: 'camp_9', campaignId: 'camp_9', adsetId: 'as_9', adId: 'ad_9' }; };
    return d;
  };
  const baseDest = (d, conv) => ({
    semana: { destacadoId: 9 }, monto: 20, clienteId: 7, zona: 'Estados Unidos', env: ENV_ON,
    adsConfigurado: true, paginaAutorizada: true, posteoPublicado: true, permisoAds: true,
    conversionARS: conv, cobrar: d.cobrarFn, publicarAnuncio: d.publicarFn, registrar: async () => {},
  });
  let d = spyDest();
  r = await ds.procesarImpulso(baseDest(d, ds.conversionParaCuenta(ds.conversionARSFromEnv({}), 'USD')));
  t(r.ok === true && d.spend === 2000 && d.cobro.montoUSD === 20, 'C6 · destacado + cuenta USD: cobro $20 y presupuesto 2000¢ USD');
  d = spyDest();
  r = await ds.procesarImpulso(baseDest(d, ds.conversionParaCuenta(ds.conversionARSFromEnv({}), 'ARS')));
  t(r.ok === true && d.spend === 2850000, 'C7 · destacado + cuenta ARS: presupuesto 2.850.000¢ ARS (como hoy)');

  // C5 · FAIL-CLOSED punta a punta: sin conversión no hay cobro ni ad.
  d = spyDest();
  r = await ds.procesarImpulso(baseDest(d, ds.conversionParaCuenta(ds.conversionARSFromEnv({}), null)));
  t(r.ok === false && r.motivo === 'conversion_pendiente' && d.cobrar === 0 && d.publicar === 0,
    'C8 · destacado + moneda indeterminada: rechazo SIN cobrar y SIN crear anuncio');
  s = spyAds();
  const inpSin = baseBil(s, ds.conversionParaCuenta(ds.conversionARSFromEnv({}), 'EUR'));
  r = await ab.impulsarConSaldo(inpSin);
  t(r.ok === false && r.motivo === 'conversion_pendiente' && s.nCrear === 0 && s.nDebitar === 0,
    'C9 · billetera + moneda desconocida: rechazo SIN crear anuncio y SIN debitar (defensa en profundidad del módulo)');

  // ─────────── D · pines de fuente (el cableado del servidor) ───────────
  const srv = leer('server.js');
  t(srv.includes('async function monedaCuentaAds()') && srv.includes('metaAds.getAccountCurrency()'), 'D1 · server: helper monedaCuentaAds lee la moneda de Meta');
  t(srv.includes("const BUILD_ID = '20261105-v976';"), 'D2 · server: BUILD estampado v976');
  const destBlk = srv.slice(srv.indexOf("app.post('/api/destacado/impulsar'"), srv.indexOf("app.get('/api/destacado/reporte'"));
  t(destBlk.includes("motivo: 'moneda_cuenta_indeterminada'"), 'D3 · destacado: moneda indeterminada → 503 con motivo');
  t(destBlk.indexOf("motivo: 'moneda_cuenta_indeterminada'") < destBlk.indexOf('procesarImpulso({'), 'D4 · destacado: el freno de moneda va ANTES de procesar el impulso (antes de cobrar)');
  t(destBlk.includes('conversionParaCuenta(destacadoSemana.conversionARSFromEnv(process.env), monedaCuenta)'), 'D5 · destacado: la conversión se elige por la moneda de la cuenta');
  t(!destBlk.includes(",'ARS','active'") && destBlk.includes('rec.spendCents, monedaCuenta, rec.campaignId'), 'D6 · destacado: ad_boosts graba la moneda REAL de la cuenta, no el literal ARS');
  const bilBlk = srv.slice(srv.indexOf("app.post('/api/ads/billetera/impulsar'"), srv.indexOf('// Crear preferencia de MercadoPago'));
  t(bilBlk.includes("motivo: 'moneda_cuenta_indeterminada'") && bilBlk.includes("motivo: 'moneda_cuenta_incompatible'"), 'D7 · billetera: motivos de moneda indeterminada e incompatible');
  t(bilBlk.indexOf("motivo: 'moneda_cuenta_indeterminada'") < bilBlk.indexOf('impulsarConSaldo({'), 'D8 · billetera: el freno de moneda va ANTES de gastar');
  t(bilBlk.includes('if (esARS && monedaCuenta !== \'ARS\')'), 'D9 · billetera: el riel ARS solo corre sobre cuenta ARS');
  t(bilBlk.includes('conversionParaCuenta(destacadoSemana.conversionARSFromEnv(process.env), monedaCuenta)'), 'D10 · billetera: la conversión se elige por la moneda de la cuenta');
  const boostBlk = srv.slice(srv.indexOf("app.post('/api/ads/boost'"), srv.indexOf('// Historial de pautas'));
  t(boostBlk.includes('monedaCuentaBoost') && boostBlk.indexOf('monedaCuentaAds()') > boostBlk.indexOf('checkAdsPermission') && boostBlk.indexOf('monedaCuentaAds()') < boostBlk.indexOf('createBoost'),
    'D11 · boost viejo: moneda verificada después del permiso y antes de crear el anuncio');
  const metaSrc = leer('meta_ads.js');
  t(metaSrc.includes("fields: 'currency'") && metaSrc.includes('async function getAccountCurrency()') && metaSrc.includes('getAccountCurrency }'), 'D12 · meta_ads: getAccountCurrency exportado, lee fields=currency');
  const appSrc = leer('public/app.js');
  const motSeg = appSrc.slice(appSrc.indexOf('function pzBoostMotivo('), appSrc.indexOf('\nfunction ', appSrc.indexOf('function pzBoostMotivo(') + 10));
  t(motSeg.includes("case 'moneda_cuenta_indeterminada':") && motSeg.includes("case 'moneda_cuenta_incompatible':"), 'D13 · app.js: pzBoostMotivo explica los dos motivos nuevos (ES/EN)');
  t(leer('public/index.html').includes('app.js?v=673'), 'D14 · index ES: app.js?v=673 (provisional)');
  t(!leer('public/en/index.html').includes('app.js?v='), 'D15 · index EN: sin app.js?v= (como hoy, intacto)');
  const dsSrc = leer('destacado-semana.js');
  t(!dsSrc.slice(dsSrc.indexOf('function conversionARSFromEnv')).includes('return null'), 'D16 · destacado-semana: sin return null tras conversionARSFromEnv (pin v888 D1 preservado)');
  t(dsSrc.includes('IMPULSO_TASA_ARS_DEFAULT = 1425') && dsSrc.includes('conversionParaCuenta,'), 'D17 · destacado-semana: default 1425 intacto y conversionParaCuenta exportada');

  // ─────────── E · boot real (sin Meta: el servidor no se cae) ───────────
  global.fetch = fetchReal;
  let expressOk = false;
  try { require.resolve('express'); expressOk = true; } catch (e) { expressOk = false; }
  if (!expressOk) {
    skip('E1–E5 · boot completo', 'express no resoluble (correr con NODE_PATH=/home/hatch/workspace/posta/node_modules)');
  } else {
    const PUERTO = 18757;
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-moneda-'));
    const env = { ...process.env, PORT: String(PUERTO), DATA_DIR, SESSION_SECRET: 'test-moneda', ADMIN_TOKEN: 'test-moneda', OPENAI_API_KEY: '', DESTACADO_BOOST_ENABLED: '1' };
    delete env.META_ADS_TOKEN; delete env.META_AD_ACCOUNT_ID; delete env.STRIPE_SECRET_KEY; delete env.MP_ACCESS_TOKEN;
    const proc = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const pid = proc.pid;
    let out = '';
    proc.stdout.on('data', (dd) => { out += dd; });
    proc.stderr.on('data', (dd) => { out += dd; });
    let version = null;
    for (let i = 0; i < 180 && !version; i++) {
      try { const rr = await fetchReal('http://127.0.0.1:' + PUERTO + '/api/version'); if (rr.ok) version = await rr.json(); } catch (e) { /* todavía no */ }
      if (!version) await sleep(500);
    }
    t(!!version && version.build === '20261105-v976', 'E1 · boot: /api/version = 20261105-v976' + (version ? '' : ' (sin respuesta: ' + out.slice(-200) + ')'));
    if (version) {
      const r1 = await fetchReal('http://127.0.0.1:' + PUERTO + '/api/ads/billetera');
      t(r1.status === 401 || r1.status === 302, 'E2 · boot: GET /api/ads/billetera sin sesión → ' + r1.status + ' (auth, nunca 404)');
      const r2 = await fetchReal('http://127.0.0.1:' + PUERTO + '/api/ads/billetera/impulsar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      t(r2.status === 401 || r2.status === 302, 'E3 · boot: POST /api/ads/billetera/impulsar sin sesión → ' + r2.status + ' (auth, nunca 404)');
    } else { t(false, 'E2 · boot sin servidor'); t(false, 'E3 · boot sin servidor'); }
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    let libre = false;
    for (let i = 0; i < 40 && !libre; i++) {
      try { await fetchReal('http://127.0.0.1:' + PUERTO + '/api/version'); await sleep(300); } catch (e) { libre = true; }
    }
    t(libre, 'E4 · boot: muerto por PID exacto (SIGTERM), puerto 18757 libre');
    t(!fs.existsSync(path.join(ROOT, 'data')), 'E5 · boot: sin release/data (DATA_DIR fue a /tmp)');
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (e) {}
  }

  console.log(`\ntest-lote-moneda-cuenta-ads-v973: ${ok} ok, ${bad} mal, ${saltados} saltados`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('✗ excepción', e && e.stack || e); process.exit(1); });
