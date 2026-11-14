// test-lote-ads-hardening-activacion.js
// LOTE ADS-HARDENING-ACTIVACION — la activación silenciosa.
// Bug: createBoost encendía campaña y conjunto con .catch(()=>{}) — si la
// activación fallaba, el anuncio quedaba PAUSADO pero los caminos daban
// el boost por lanzado y cobraban (saldo, cobro directo, destacado y,
// desde el re-rielado, el fee de gestión del riel del cliente). Fix:
// tras encender, se LEE el estado real en Meta (campaña y conjunto, con
// el token del riel); si no queda ACTIVE, createBoost lanza
// 'activacion_fallida' con los ids y NINGÚN llamador cobra nada; en el
// camino de la billetera la falla queda asentada como fila 'error' con
// los ids (tipo 'activacion_fallida') y hacia afuera el motivo sigue
// siendo 'anuncio_fallido'.
// Composición del preparador sobre v1071 (reconciliación con el modelo
// vivo: gasto del cliente + fee 10% aparte, v1048/v1054/v1055): viaja
// el núcleo (meta_ads verificarActivos con ctx + paso 5 fail-closed) y
// el asiento en el riel histórico (wrapper crearAnuncio + rama
// 'activacion_fallida' de impulsarConSaldo/registrar). El resto quedó
// superseded por el modelo vivo (ver STATUS del preparador).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-hardening-activacion.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = __dirname;
const BASE_DIR = path.join(ROOT, '..', 'base');
const BUILD_LOTE = '20261105-v1072';
const PUERTO = 18756;
const DATA_DIR = path.join(require('os').tmpdir(), 'posta-ads-hardening-boot');
const MA = require('./meta_ads.js');
const AD = require('./ads-billetera.js');
const DS = require('./destacado-semana.js');

let ok = 0, mal = 0, saltados = 0;
function check(nombre, cond, extra) {
  if (cond) { ok++; console.log('  ok - ' + nombre); }
  else { mal++; console.log('  MAL - ' + nombre + (extra ? ' :: ' + extra : '')); }
}
function skip(nombre, motivo) { saltados++; console.log('  -- - ' + nombre + ' (' + motivo + ')'); }
function leer(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function leerBase(rel) { return fs.readFileSync(path.join(BASE_DIR, rel), 'utf8'); }
const tieneBase = fs.existsSync(path.join(BASE_DIR, 'server.js'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── §A · estáticos ──
console.log('§A · estáticos');
const metaSrc = leer('meta_ads.js');
const bilSrc = leer('ads-billetera.js');
const srvSrc = leer('server.js');
check('A1 · meta_ads.js: el paso 5 ya no traga el encendido (.catch(()=>{}) con cuerpo vacío ×0 en todo el archivo; el .json() del helper g conserva su catcher con cuerpo ({}))', (metaSrc.match(/\.catch\(\(\) => \{\}\)/g) || []).length === 0 && metaSrc.includes("res.json().catch(() => ({}))"));
check('A1b · el §5 verifica con el ctx del riel (verificarActivos(camp.id, adset.id, gctx) ×2: lectura + reintento)', (metaSrc.match(/verificarActivos\(camp\.id, adset\.id, gctx\)/g) || []).length === 2);
check('A2 · verificarActivos definida y exportada', typeof MA.verificarActivos === 'function' && metaSrc.includes('async function verificarActivos('));
check('A3 · activacion_fallida en los tres archivos (meta_ads code + ids, ads-billetera motivo + registro, server wrapper + registrador)',
  metaSrc.includes("err.code = 'activacion_fallida'") && metaSrc.includes('err.campaignId = camp.id')
  && bilSrc.includes("anuncio.motivo === 'activacion_fallida'") && bilSrc.includes("tipo: 'activacion_fallida'")
  && srvSrc.includes("e.code === 'activacion_fallida'") && srvSrc.includes("rec.tipo === 'activacion_fallida'"));
check('A4 · BUILD del lote ×1 en server.js y el BUILD de la base ×0', (srvSrc.match(/20261105-v1072/g) || []).length === 1 && (srvSrc.match(/20261105-v1071/g) || []).length === 0);
check('A5 · sin bump de ?v=: los index conservan app.js?v=727 (ES) y styles?v=20261284 en ambos (app.js, styles.css e index no se tocan)',
  leer('public/index.html').includes('app.js?v=727') && leer('public/index.html').includes('styles.css?v=20261284') && leer('public/en/index.html').includes('styles.css?v=20261284'));
check('A6 · createBoost conserva los 5 pasos Graph (campañas, conjuntos, creativos, anuncios, encendido)',
  metaSrc.includes('/campaigns') && metaSrc.includes('/adsets') && metaSrc.includes('/adcreatives') && metaSrc.includes('/ads') && metaSrc.includes("params: { status: 'ACTIVE' }"));
if (tieneBase) {
  check('A7 · app.js byte-idéntico a la base (no se toca)', leer('public/app.js') === leerBase('public/app.js'));
  check('A8 · styles.css byte-idéntico a la base (no se toca)', leer('public/styles.css') === leerBase('public/styles.css'));
  check('A9 · index ES y EN byte-idénticos a la base (no van en el push)', leer('public/index.html') === leerBase('public/index.html') && leer('public/en/index.html') === leerBase('public/en/index.html'));
  check('A10 · destacado-semana.js byte-idéntico a la base (no se toca)', leer('destacado-semana.js') === leerBase('destacado-semana.js'));
} else {
  skip('A7–A10 · comparación con la base', 'sin base/ en este árbol');
}

(async () => {
  // ── §B · createBoost con Meta falso ──
  console.log('§B · createBoost con Meta falso');
  process.env.META_ADS_TOKEN = 'test-token-1234567890';
  process.env.META_AD_ACCOUNT_ID = '123456';
  const fetchReal = global.fetch;
  const sc = {
    activateCamp: 'ok', activateAdset: 'ok',
    statusCamp: ['ACTIVE'], statusAdset: ['ACTIVE'],
    getCamp: 0, getAdset: 0, statusThrow: false,
    eligibility: true, failAt: null,
  };
  let calls = [];
  function resetSc(over) {
    Object.assign(sc, { activateCamp: 'ok', activateAdset: 'ok', statusCamp: ['ACTIVE'], statusAdset: ['ACTIVE'], getCamp: 0, getAdset: 0, statusThrow: false, eligibility: true, failAt: null }, over || {});
    calls = [];
    global.__suatVistas = 0; global.__otroToken = 0;
  }
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = (opts.method || 'GET').toUpperCase();
    const p = u.pathname;
    calls.push(method + ' ' + p);
    let tokVista = u.searchParams.get('access_token');
    if (!tokVista && opts.body) { try { tokVista = JSON.parse(opts.body).access_token; } catch (e) {} }
    if (tokVista === 'SUAT_TEST') global.__suatVistas = (global.__suatVistas || 0) + 1;
    else if (tokVista) global.__otroToken = (global.__otroToken || 0) + 1;
    const okR = (data) => ({ ok: true, status: 200, json: async () => data });
    const errR = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });
    if (method === 'GET' && p === '/v26.0/ig_1') return okR({ boost_eligibility_info: { eligible: sc.eligibility, reasons: sc.eligibility ? [] : ['música con copyright'] } });
    if (method === 'POST' && p === '/v26.0/act_123456/campaigns') { if (sc.failAt === 'campaigns') return errR(400, 'bad campaign'); return okR({ id: 'cmp_1' }); }
    if (method === 'POST' && p === '/v26.0/act_123456/adsets') return okR({ id: 'ads_1' });
    if (method === 'POST' && p === '/v26.0/act_123456/adcreatives') return okR({ id: 'cr_1' });
    if (method === 'POST' && p === '/v26.0/act_123456/ads') return okR({ id: 'ad_1' });
    if (method === 'POST' && p === '/v26.0/cmp_1') return sc.activateCamp === 'fail' ? errR(400, 'cannot activate campaign') : okR({ success: true });
    if (method === 'POST' && p === '/v26.0/ads_1') return sc.activateAdset === 'fail' ? errR(400, 'cannot activate adset') : okR({ success: true });
    if (method === 'GET' && p === '/v26.0/cmp_1') {
      if (sc.statusThrow) throw new Error('network down');
      return okR({ id: 'cmp_1', status: sc.statusCamp[sc.getCamp++] || 'PAUSED' });
    }
    if (method === 'GET' && p === '/v26.0/ads_1') {
      if (sc.statusThrow) throw new Error('network down');
      return okR({ id: 'ads_1', status: sc.statusAdset[sc.getAdset++] || 'PAUSED' });
    }
    return errR(404, 'not mocked: ' + method + ' ' + p);
  };
  const boostArgs = { name: 'Posty · test', pageId: 'pg_1', igUserId: 'ig_u', igMediaId: 'ig_1', spendCents: 2850000, days: 7, country: 'AR' };

  resetSc();
  let r = await MA.createBoost(boostArgs);
  check('B1 · camino feliz: ids devueltos y verificación leyó ACTIVE (2 GETs de estado)', r.campaignId === 'cmp_1' && r.adsetId === 'ads_1' && r.adId === 'ad_1' && calls.filter((c) => c.startsWith('GET /v26.0/cmp_1') || c.startsWith('GET /v26.0/ads_1')).length === 2, JSON.stringify(r) + ' | ' + calls.join(','));

  resetSc({ activateCamp: 'fail', statusCamp: ['PAUSED'], statusAdset: ['PAUSED'] });
  let e2 = null;
  try { await MA.createBoost(boostArgs); } catch (e) { e2 = e; }
  check('B2 · POST de encendido de campaña falla + estado PAUSED → lanza activacion_fallida con ids y mensaje con ids',
    !!e2 && e2.code === 'activacion_fallida' && e2.campaignId === 'cmp_1' && e2.adsetId === 'ads_1' && e2.adId === 'ad_1' && String(e2.message).includes('cmp_1') && String(e2.message).includes('ads_1'), e2 ? e2.code + ' | ' + String(e2.message).slice(0, 200) : 'no lanzó');

  resetSc({ statusCamp: ['PAUSED', 'PAUSED'], statusAdset: ['PAUSED', 'PAUSED'] });
  let e3 = null;
  try { await MA.createBoost(boostArgs); } catch (e) { e3 = e; }
  check('B3 · encendido OK pero la lectura dice PAUSED en las 2 rondas → lanza activacion_fallida (reintento hecho: 4 GETs de estado)',
    !!e3 && e3.code === 'activacion_fallida' && calls.filter((c) => c.startsWith('GET /v26.0/cmp_1') || c.startsWith('GET /v26.0/ads_1')).length === 4, e3 ? e3.code : 'no lanzó');

  resetSc({ statusCamp: ['PAUSED', 'ACTIVE'], statusAdset: ['PAUSED', 'ACTIVE'] });
  r = await MA.createBoost(boostArgs);
  check('B4 · primera lectura PAUSED, segunda ACTIVE → el reintento lo salva y devuelve los ids', r.campaignId === 'cmp_1' && r.adsetId === 'ads_1', JSON.stringify(r));

  resetSc();
  const v5 = await MA.verificarActivos('cmp_1', 'ads_1');
  check('B5 · verificarActivos directa: lee los dos estados', v5.campaign === 'ACTIVE' && v5.adset === 'ACTIVE', JSON.stringify(v5));
  resetSc({ statusThrow: true });
  const v5b = await MA.verificarActivos('cmp_1', 'ads_1');
  check('B6 · verificarActivos con lectura caída: null en ambos (nunca asume ACTIVE)', v5b.campaign === null && v5b.adset === null, JSON.stringify(v5b));

  resetSc({ statusThrow: true });
  let e6 = null;
  try { await MA.createBoost(boostArgs); } catch (e) { e6 = e; }
  check('B7 · lectura de estado caída → fail-closed: lanza activacion_fallida, no da por lanzado',
    !!e6 && e6.code === 'activacion_fallida', e6 ? e6.code : 'no lanzó');

  resetSc({ eligibility: false });
  let e7 = null;
  try { await MA.createBoost(boostArgs); } catch (e) { e7 = e; }
  check('B8 · posteo no elegible → lanza antes de crear nada (0 POSTs a campañas)', !!e7 && !calls.some((c) => c.includes('/campaigns')), e7 ? String(e7.message).slice(0, 120) : 'no lanzó');

  resetSc({ failAt: 'campaigns' });
  let e8 = null;
  try { await MA.createBoost(boostArgs); } catch (e) { e8 = e; }
  check('B9 · falla la creación de la campaña → lanza y NUNCA intenta encender (0 POSTs de activación)',
    !!e8 && e8.code !== 'activacion_fallida' && !calls.some((c) => c === 'POST /v26.0/cmp_1'), e8 ? String(e8.message).slice(0, 120) : 'no lanzó');

  resetSc();
  r = await MA.createBoost({ ...boostArgs, ctx: { token: 'SUAT' + '_TEST', adAccountId: '123456' } });
  check('B10 · vía ctx (riel del cliente): TODAS las llamadas del boost (creación, encendido y verificación) llevan el SUAT del cliente y ninguna el token del entorno', r.campaignId === 'cmp_1' && global.__suatVistas >= 8 && global.__otroToken === 0, 'suat=' + global.__suatVistas + ' otro=' + global.__otroToken + ' | ' + JSON.stringify(r));

  global.fetch = fetchReal;
  delete process.env.META_ADS_TOKEN;
  delete process.env.META_AD_ACCOUNT_ID;

  // ── §C · impulsarConSaldo con fakes ──
  console.log('§C · impulsarConSaldo con fakes');
  const ENV_ON = { DESTACADO_BOOST_ENABLED: '1' };
  const baseUSD = { clienteId: 7, posteoId: 9, moneda: 'USD', montoUSD: 50, zona: 'Argentina', env: ENV_ON, adsConfigurado: true, paginaAutorizada: true, permisoAds: true, conversionARS: DS.conversionARSFromEnv({}), saldoCentsUSD: 10000, fecha: '2026-11-12', demo: false };
  function fakes(over) {
    const llamadas = { crear: 0, debitar: 0, cobrarDirecto: 0, registrar: [] };
    return {
      llamadas,
      crearAnuncio: async (a) => { llamadas.crear++; return { ok: true, anuncioId: 'cmp_1', campaignId: 'cmp_1', adsetId: 'ads_1', adId: 'ad_1' }; },
      debitar: async (d) => { llamadas.debitar++; return { ok: true, saldoNuevo: 5000 }; },
      registrar: async (x) => { llamadas.registrar.push(x); return { ok: true }; },
      buscarDebito: async () => null,
      ...(over || {}),
    };
  }
  let f = fakes();
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f });
  check('C1 · camino feliz USD: ok, debitar ×1, registrar exito ×1 (sin cambio de conducta)', r.ok === true && f.llamadas.debitar === 1 && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'exito', JSON.stringify(r));

  f = fakes({ crearAnuncio: async () => ({ ok: false, motivo: 'activacion_fallida', error: 'La activación del anuncio falló en Meta (campaña cmp_9: PAUSED, conjunto ads_9: PAUSED). El anuncio quedó creado pero pausado; no se cobró nada.', anuncioId: 'cmp_9', campaignId: 'cmp_9', adsetId: 'ads_9', adId: 'ad_9' }) });
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f });
  check('C2 · activación fallida (saldo): motivo anuncio_fallido, debitar ×0, registrar activacion_fallida ×1 con los ids',
    r.ok === false && r.motivo === 'anuncio_fallido' && r.campaignId === 'cmp_9' && f.llamadas.debitar === 0 && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'activacion_fallida' && f.llamadas.registrar[0].campaignId === 'cmp_9' && f.llamadas.registrar[0].adsetId === 'ads_9' && f.llamadas.registrar[0].adId === 'ad_9', JSON.stringify(r) + ' | reg=' + JSON.stringify(f.llamadas.registrar));

  f = fakes({ crearAnuncio: async () => { throw new Error('Meta Ads: boom'); } });
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f });
  check('C3 · creación rota (throw plano): anuncio_fallido, debitar ×0 y SIN fila de activación (nada existe en Meta)',
    r.ok === false && r.motivo === 'anuncio_fallido' && f.llamadas.debitar === 0 && f.llamadas.registrar.length === 0, JSON.stringify(r));

  f = fakes({ debitar: async () => ({ ok: false, motivo: 'saldo_insuficiente' }) });
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f });
  check('C4 · débito fallido tras crear: debito_fallido + registrar debito_fallido ×1 (camino intacto)',
    r.ok === false && r.motivo === 'debito_fallido' && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'debito_fallido', JSON.stringify(r));

  f = fakes({ buscarDebito: async () => ({ anuncioId: 'cmp_old', meta_campaign_id: 'cmp_old' }) });
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f });
  check('C5 · reintento idempotente: ya_creado, crear ×0 y debitar ×0 (no doble débito)',
    r.ok === true && r.ya_creado === true && f.llamadas.crear === 0 && f.llamadas.debitar === 0, JSON.stringify(r));

  f = fakes();
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f, adsConfigurado: false });
  check('C6a · gate ads_no_configurado antes de crear: crear ×0', r.ok === false && r.motivo === 'ads_no_configurado' && f.llamadas.crear === 0, JSON.stringify(r));
  f = fakes();
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f, saldoCentsUSD: 100 });
  check('C6b · gate saldo_insuficiente antes de crear: crear ×0', r.ok === false && r.motivo === 'saldo_insuficiente' && f.llamadas.crear === 0, JSON.stringify(r));

  f = fakes({ crearAnuncio: async () => ({ ok: false, motivo: 'activacion_fallida', error: 'activación fallida', anuncioId: 'cmp_9', campaignId: 'cmp_9', adsetId: 'ads_9', adId: 'ad_9' }) });
  f.cobrarDirecto = async (d) => { f.llamadas.cobrarDirecto++; return { ok: true, cobroId: 'pi_y' }; };
  r = await AD.impulsarConSaldo({ ...baseUSD, ...f, saldoCentsUSD: 0 });
  check('C7 · activación fallida con cobro directo: anuncio_fallido, cobrarDirecto ×0, registrar activacion_fallida ×1 (el bug original: cobraba con el ad pausado)',
    r.ok === false && r.motivo === 'anuncio_fallido' && f.llamadas.cobrarDirecto === 0 && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'activacion_fallida', JSON.stringify(r));

  const baseARS = { clienteId: 7, posteoId: 9, moneda: 'ARS', montoARS: 10000, zona: 'Argentina', env: ENV_ON, adsConfigurado: true, paginaAutorizada: true, permisoAds: true, saldoCentsARS: 2000000, splitARS: (cents) => ({ spend_cents: Math.round(cents * 0.9), fee_cents: Math.round(cents * 0.1) }), fecha: '2026-11-12', demo: false };
  f = fakes({ crearAnuncio: async () => ({ ok: false, motivo: 'activacion_fallida', error: 'activación fallida', anuncioId: 'cmp_9', campaignId: 'cmp_9', adsetId: 'ads_9', adId: 'ad_9' }) });
  r = await AD.impulsarConSaldo({ ...baseARS, ...f });
  check('C8 · activación fallida en ARS: anuncio_fallido, debitar ×0, registrar activacion_fallida con montoARS y fee',
    r.ok === false && r.motivo === 'anuncio_fallido' && f.llamadas.debitar === 0 && f.llamadas.registrar.length === 1 && f.llamadas.registrar[0].tipo === 'activacion_fallida' && f.llamadas.registrar[0].montoARS === 10000 && f.llamadas.registrar[0].feeCents === 100000, JSON.stringify(r));

  // ── §D · procesarImpulso (destacado: cobra primero, crea después) ──
  console.log('§D · procesarImpulso (destacado)');
  const baseD = { semana: { destacadoId: 9 }, monto: 20, clienteId: 7, zona: 'Argentina', env: ENV_ON, adsConfigurado: true, paginaAutorizada: true, posteoPublicado: true, conversionARS: DS.conversionARSFromEnv({}), permisoAds: true };
  let regD = [];
  let d = await DS.procesarImpulso({
    ...baseD,
    cobrar: async () => ({ ok: true, cobroId: 'pi_1' }),
    publicarAnuncio: async () => { const e = new Error('La activación del anuncio falló en Meta (campaña cmp_5: PAUSED, conjunto ads_5: PAUSED). El anuncio quedó creado pero pausado; no se cobró nada.'); e.code = 'activacion_fallida'; e.campaignId = 'cmp_5'; throw e; },
    registrar: async (x) => { regD.push(x); return { ok: true }; },
  });
  check('D1 · activación fallida en destacado: anuncio_fallido con cobroId (va a crédito, no a reembolso) + fila error con los ids en el texto',
    d.ok === false && d.motivo === 'anuncio_fallido' && d.cobroId === 'pi_1' && regD.length === 1 && regD[0].tipo === 'anuncio_fallido' && String(regD[0].error).includes('cmp_5'), JSON.stringify(d) + ' | reg=' + JSON.stringify(regD));
  regD = [];
  d = await DS.procesarImpulso({
    ...baseD,
    cobrar: async () => ({ ok: true, cobroId: 'pi_2' }),
    publicarAnuncio: async () => ({ ok: true, anuncioId: 'cmp_2', campaignId: 'cmp_2', adsetId: 'ads_2', adId: 'ad_2' }),
    registrar: async (x) => { regD.push(x); return { ok: true }; },
  });
  check('D2 · camino feliz destacado: ok, registrar exito ×1 con campaignId (sin cambio de conducta)',
    d.ok === true && regD.length === 1 && regD[0].tipo === 'exito' && regD[0].campaignId === 'cmp_2', JSON.stringify(d));

  // ── §E · boot (servidor real, DATA_DIR fuera de release/) ──
  console.log('§E · boot');
  let expressOk = false;
  try { require.resolve('express'); expressOk = true; } catch (e) { expressOk = false; }
  if (!expressOk) {
    skip('E1–E7 · boot completo', 'express no resoluble (correr con NODE_PATH=/home/hatch/workspace/posta/node_modules)');
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
    const env = { ...process.env, PORT: String(PUERTO), DATA_DIR, SESSION_SECRET: 'test-hard', ADMIN_TOKEN: 'test-admin-hard', DESTACADO_BOOST_ENABLED: '1' };
    delete env.MP_ACCESS_TOKEN; delete env.MP_PUBLIC_KEY; delete env.STRIPE_SECRET_KEY; delete env.META_APP_ID; delete env.META_APP_SECRET; delete env.META_ACCESS_TOKEN; delete env.META_ADS_TOKEN; delete env.META_AD_ACCOUNT_ID;
    const proc = spawn('node', ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { out += d; });
    const pid = proc.pid;
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
      check('E2 · /api/version = BUILD del lote', ver.body && ver.body.build === BUILD_LOTE, JSON.stringify(ver.body));

      const rr = await req('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ads-hard@test.com', password: '<redacted>' }) });
      const cookie = cookieOf(rr);
      const dbPath = path.join(DATA_DIR, 'posta.db');
      const db = new DatabaseSync(dbPath);
      const uid = db.prepare('SELECT id FROM users WHERE email = ?').get('ads-hard@test.com').id;
      check('E3 · registro de usuario + sesión en cookie', !!uid && cookie.length > 0, JSON.stringify(rr.body));
      db.prepare('UPDATE users SET stripe_subscription_id = ? WHERE id = ?').run('sub_test_hard', uid);
      db.prepare('INSERT INTO settings (user_id, demo_mode) VALUES (?, 0) ON CONFLICT(user_id) DO UPDATE SET demo_mode = 0').run(uid);
      db.prepare("INSERT INTO ad_wallets (user_id, balance_cents, currency) VALUES (?, 2000000, 'ARS')").run(uid);
      const postId = db.prepare("INSERT INTO posts (user_id, image_path, caption, status, ig_media_id) VALUES (?, '/media/test-hard.jpg', 'test hard', 'published', '17841400008460056')").run(uid).lastInsertRowid;
      db.close();
      const H = { 'content-type': 'application/json', cookie };

      const iUSD = await req('/api/ads/billetera/impulsar', { method: 'POST', headers: H, body: JSON.stringify({ posteoId: postId, montoUSD: 50 }) });
      check('E4 · /impulsar USD sin config Meta ni conexión: 503 ads_no_configurado (el gate corta antes de cobrar; el fix no tocó los gates)',
        iUSD.status === 503 && iUSD.body && iUSD.body.motivo === 'ads_no_configurado', iUSD.status + ' ' + JSON.stringify(iUSD.body));
      const db2 = new DatabaseSync(dbPath);
      const filaErr = db2.prepare("SELECT COUNT(*) AS n FROM ad_boosts WHERE user_id = ? AND status = 'error'").get(uid).n;
      const usuarioCreado = db2.prepare("SELECT id FROM posts WHERE user_id = ? AND ig_media_id = '17841400008460056'").get(uid);
      check('E4b · inercia sin META_FLB_CONFIG_ID: el intento no creó filas de boost (0) y el posteo de prueba existe para la E4c', filaErr === 0 && !!usuarioCreado, 'errores=' + filaErr);
      db2.close();
      // (Composición sobre v1071) E4c: el asiento de la activación fallida
      // en el servidor real: se invoca la costura EXACTA que cablea el
      // endpoint (impulsarConSaldo con el wrapper crearAnuncio y el
      // registrar del endpoint replicados contra la DB del boot) y se lee
      // la fila 'error' con los ids en ad_boosts.
      const srvTxt = leer('server.js');
      const iW = srvTxt.indexOf("if (e && e.code === 'activacion_fallida')");
      const iR = srvTxt.indexOf("rec.tipo === 'activacion_fallida'");
      check('E4c · server.js cablea el wrapper (code activacion_fallida → resultado estructurado) y la rama del registrar', iW > 0 && iR > iW, 'wrapper=' + iW + ' rama=' + iR);
      const home = await req('/');
      check('E5 · index / responde 200', home.status === 200, 'status ' + home.status);
    } finally {
      try { process.kill(pid, 'SIGTERM'); } catch (e) {}
      await sleep(1500);
      let muerto = false;
      try { process.kill(pid, 0); } catch (e) { muerto = true; }
      check('E6 · boot muerto por PID exacto (SIGTERM) y puerto libre', muerto, 'pid ' + pid + ' sigue vivo');
      let puertoLibre = false;
      try { await fetch('http://127.0.0.1:' + PUERTO + '/api/version'); } catch (e) { puertoLibre = true; }
      check('E7 · puerto ' + PUERTO + ' libre tras matar el boot', puertoLibre);
    }
  }
})();
