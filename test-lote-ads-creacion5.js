// test-lote-ads-creacion5.js — LOTE ADS-CREACIÓN-5
// La causa raíz de TODOS los intentos del dueño (17/11, probada):
// sus posteos (582 y 696) son de su Instagram en español
// (@posty.communitymanager) y la conexión publicitaria guardó
// solo la del inglés (@postycommunitymanager, la IG de la Página
// «Posty.»): Meta valida que el instagram_user_id del creativo
// sea la cuenta DUEÑA del medio, vinculada a la Página del
// object_id y asignada a la cuenta publicitaria — una id de otra
// cuenta muere en el creativo con code 100, siempre.
// Este lote: (a) la captura al conectar guarda el DETALLE por
// cuenta (id + username + Página + asignación a la cuenta);
// (b) con varias detalladas, el arbitraje es por el username de
// la cuenta que publica — SIN lecturas en vivo (el SUAT no puede
// hacerlas: intentos 8–9) — y lo que no empareja frena ANTES de
// crear nada, con el motivo honesto; (c) la resolución se movió
// antes del paso 1 de createBoost (un freno ya no deja campaña y
// conjunto huérfanos). Las filas viejas sin detalle siguen por
// los caminos de v1167/v1163, intactos.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-creacion5.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PRISTINE_META = path.join(ROOT, '..', 'pristine', 'meta_ads.js');
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35335;
const REAL_FETCH = global.fetch;
let total = 0, fails = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

(async () => {
// ── §A · estáticos: el cableado del lote ──────────────────────────
console.log('§A estáticos');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const metaSrc = fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');
ok(serverSrc.includes("const BUILD_ID = '20261105-v1169'"), 'BUILD_ID intacto (el builder no estampa: queda el de la base v1169)');
ok(dbSrc.includes("ALTER TABLE ig_ads_connections ADD COLUMN ig_accounts"), 'db: nace la columna ig_accounts en ig_ads_connections');
ok(metaSrc.includes("instagram_business_account{id,username}"), 'meta_ads: la captura pide el username del instagram_business_account');
ok(metaSrc.includes('igAccounts') && metaSrc.includes('usable_en_cuenta'), 'meta_ads: fetchClientAssets devuelve igAccounts con usable_en_cuenta');
ok(metaSrc.includes('/instagram_accounts'), 'meta_ads: la captura lee el conjunto usable de la cuenta publicitaria (tercera pata del triple)');
ok(serverSrc.includes('ig_accounts=excluded.ig_accounts') && serverSrc.includes('JSON.stringify(assets.igAccounts || [])'), 'server: el callback de conexión guarda ig_accounts (insert y update)');
ok(serverSrc.includes('ig_accounts: parse(row.ig_accounts)'), 'server: getAdsConnection parsea ig_accounts');
ok(serverSrc.includes('igAccounts: conn.ig_accounts') && serverSrc.includes('publicadaUsername'), 'server: adsReadiness expone igAccounts y el username de publicación');
ok((serverSrc.match(/igAccounts: gate\.igAccounts/g) || []).length === 6, 'server: los SEIS ctx de createBoost llevan igAccounts');
ok((serverSrc.match(/publicadaUsername: gate\.publicadaUsername/g) || []).length === 6, 'server: los SEIS ctx de createBoost llevan publicadaUsername');
ok(metaSrc.includes("fuente: 'guardada_username'"), 'meta_ads: el arbitraje por username existe (guardada_username)');
ok(metaSrc.includes("frenoGuardado('ig_fuera_de_conexion'") && metaSrc.includes("frenoGuardado('ig_otra_pagina'"), 'meta_ads: los dos frenos honestos existen (fuera de conexión · otra Página)');
{
  const iRes = metaSrc.indexOf('const igResuelto = await resolverIgUserIdBoost');
  const iCamp = metaSrc.indexOf('const camp = await pasoBoost');
  ok(iRes > 0 && iCamp > 0 && iRes < iCamp, 'meta_ads: createBoost resuelve el IG ANTES de crear la campaña (ningún freno deja huérfanos)');
}
ok(serverSrc.includes("crError.code === 'ig_fuera_de_conexion'") && serverSrc.includes("crDError.code === 'ig_fuera_de_conexion'"), 'server: impulso y destacado mapean los frenos a su motivo honesto');
ok(appSrc.includes("case 'ig_fuera_de_conexion':") && appSrc.includes("case 'ig_otra_pagina':"), 'app: la tarjeta pinta los dos motivos nuevos');
ok(appSrc.includes('no está en tu conexión publicitaria') && appSrc.includes('isn’t in your Ads connection'), 'app: el motivo fuera-de-conexión tiene texto ES y EN');
ok(appSrc.includes('vinculado a otra Página de Facebook') && appSrc.includes('linked to a different Facebook Page'), 'app: el motivo otra-Página tiene texto ES y EN');

// ── §B · meta_ads con la red stub ─────────────────────────────────
console.log('§B meta_ads (fetch stub)');
process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
process.env.META_AD_ACCOUNT_ID = '111111';
const metaAds = require(path.join(ROOT, 'meta_ads.js'));
ok(typeof metaAds.fetchClientAssets === 'function' && typeof metaAds.resolverIgUserIdBoost === 'function', 'meta_ads exporta fetchClientAssets y resolverIgUserIdBoost');

const IG_EN = '1336760809518976';            // la IG de la Página «Posty.» (@postycommunitymanager)
const IG_ES = '17841400000000009';          // sintética: la business id de la ES (@posty.communitymanager)
const IG_OTRA = '17841400000000001';
const PAGINA = '1397548910112144';          // Página «Posty.»
const PAGINA_ES = '1397548910112999';       // sintética: la Página de la ES en el escenario multi
const MEDIA = '18128280008286375';          // el posteo 696
const ACT = '29027789776849841';
const calls = [];
let duenoModo = 'error';   // las lecturas del SUAT fallan: el estado probado de los intentos 8–9
let paginaModo = 'error';
const ERR = { error: { message: '(#200) Requires instagram_basic permission', type: 'OAuthException', code: 200, fbtrace_id: 'TRACE_X' } };
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  const json = (data, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => data });
  if (u.includes('boost_eligibility_info')) return json({ boost_eligibility_info: { eligible: true } });
  if (u.includes('/me/accounts')) return json({ data: [
    { id: PAGINA, name: 'Posty.', instagram_business_account: { id: IG_EN, username: 'postycommunitymanager' } },
    { id: PAGINA_ES, name: 'Posty ES', instagram_business_account: { id: IG_ES, username: 'posty.communitymanager' } },
    { id: '1397548910112777', name: 'Sin IG' },
  ] });
  if (u.includes('/instagram_accounts')) return json({ data: [{ id: IG_EN, username: 'postycommunitymanager' }] });
  if (u.includes('/me/adaccounts')) return json({ data: [{ id: 'act_' + ACT, account_id: ACT, name: 'Posty', currency: 'USD', account_status: 1, business: { id: '1140848162035745' } }] });
  if (u.includes('/me/businesses')) return json({ data: [] });
  if (u.includes('owner')) {
    if (duenoModo === 'error') return json(ERR, 400);
    return json({ id: MEDIA, owner: { id: IG_EN, username: 'postycommunitymanager' } });
  }
  if (u.includes('instagram_business_account')) {
    if (paginaModo === 'error') return json(ERR, 400);
    return json({ id: PAGINA, instagram_business_account: { id: IG_EN, username: 'postycommunitymanager' } });
  }
  if (u.includes('/campaigns')) return json({ id: 'camp_1' });
  if (u.includes('/adsets')) return json({ id: 'adset_1' });
  if (u.includes('/adcreatives')) return json({ id: 'cre_1' });
  if (u.endsWith('/ads')) return json({ id: 'ad_1' });
  if (u.includes('/camp_1') || u.includes('/adset_1')) return json(method === 'POST' ? { success: true } : { status: 'ACTIVE' });
  if (u.includes('/me?') || u.includes('/me&')) return json({ id: '123', name: 'SUAT' });
  return json({});
};
const CTX_BASE = { token: 'SUAT_CLIENTE', adAccountId: ACT };
const escrituras = () => calls.filter((c) => c.method === 'POST' && (/\/campaigns|\/adsets|\/adcreatives|\/ads(\?|$)/.test(c.url)));
const llamadaA = (frag) => calls.find((c) => c.url.includes(frag));
const boostBase = (extra) => ({
  name: 'Posty · Impulso u12 · p696', pageId: PAGINA, igUserId: '17841424145064983', igMediaId: MEDIA,
  spendCents: 2000, days: 7, country: 'AR', ...extra,
});
const DET_EN = { id: IG_EN, username: 'postycommunitymanager', page_id: PAGINA, usable_en_cuenta: true };
const DET_ES = { id: IG_ES, username: 'posty.communitymanager', page_id: PAGINA_ES, usable_en_cuenta: true };

// B0 · LA CAPTURA: dos Páginas con IG → el detalle guarda id +
// username + Página de cada una, y la asignación a la cuenta
// (el conjunto usable trae solo la EN: la ES queda false).
{
  calls.length = 0;
  const a = await metaAds.fetchClientAssets('SUAT_CLIENTE');
  ok(Array.isArray(a.igAccounts) && a.igAccounts.length === 2, 'B0 [FIX] la captura devuelve las DOS cuentas de IG expuestas (no solo la de una Página)');
  const en = a.igAccounts.find((x) => x.id === IG_EN);
  const es = a.igAccounts.find((x) => x.id === IG_ES);
  ok(!!en && en.username === 'postycommunitymanager' && en.page_id === PAGINA, 'B0 [FIX] la EN queda con su username y SU Página (Posty.)');
  ok(!!es && es.username === 'posty.communitymanager' && es.page_id === PAGINA_ES, 'B0 [FIX] la ES queda con su username y SU Página');
  ok(!!en && en.usable_en_cuenta === true && !!es && es.usable_en_cuenta === false, 'B0 [FIX] la asignación a la cuenta publicitaria queda marcada (EN usable · ES no asignada)');
  ok(a.igAccountIds.length === 2 && a.igAccountIds.includes(IG_EN) && a.igAccountIds.includes(IG_ES), 'B0 los ids pelados de siempre siguen (compatibilidad con filas y caminos viejos)');
}

// B1 · UNA sola detallada: el comportamiento de hoy, intacto —
// viaja sin leer nada.
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccounts: [DET_EN], publicadaUsername: 'postycommunitymanager' };
  const res = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx, publicadaId: '17841424145064983' });
  ok(res.id === IG_EN && res.fuente === 'conexion_guardada', 'B1 [FIX] una sola guardada detallada viaja como hoy (conexion_guardada)');
  ok(calls.length === 0, 'B1 [FIX] la resolución no hizo NINGUNA lectura');
}

// B1b · EL ESTADO REAL DEL DUEÑO TRAS RECONECTAR: la conexión
// expone UNA sola detallada (la EN) y el posteo es de la ES (la
// que publica): desacuerdo demostrado → freno honesto antes de
// crear nada, en vez de mandar la EN a morir con code 100 por
// novena vez. (La fila vieja sin detalle no puede demostrar el
// desacuerdo y sigue viajando como hoy: B6.)
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccounts: [DET_EN], publicadaUsername: 'posty.communitymanager' };
  let err = null;
  try { await metaAds.createBoost(boostBase({ ctx })); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_fuera_de_conexion', 'B1b [FIX] una sola detallada que NO es la del posteo: freno ig_fuera_de_conexion (no viaja la id equivocada)');
  ok(escrituras().length === 0, 'B1b [FIX] cero escrituras en Meta');
}

// B2 · EL CASO DEL DUEÑO, con la conexión completa: varias
// detalladas, el posteo es de la ES (la que publica) → viaja la
// ES por username, SIN lecturas (las dos lecturas están caídas).
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccounts: [DET_EN, DET_ES], publicadaUsername: 'posty.communitymanager' };
  const res = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA_ES, igMediaId: MEDIA, ctx, publicadaId: '17841424145064983' });
  ok(res.id === IG_ES && res.fuente === 'guardada_username', 'B2 [FIX] varias guardadas: la dueña se resuelve por el username de publicación (guardada_username)');
  ok(calls.length === 0, 'B2 [FIX] el arbitraje NO dependió de ninguna lectura en vivo');
  const r = await metaAds.createBoost(boostBase({ pageId: PAGINA_ES, ctx }));
  ok(r.creativeId === 'cre_1' && llamadaA('/adcreatives').body.instagram_user_id === IG_ES, 'B2 [FIX] createBoost crea el creativo con la cuenta ES dueña del posteo');
}

// B3 · LA DUEÑA NO ESTÁ EN LA CONEXIÓN (el estado real del dueño
// hoy: la conexión solo expone la EN): freno honesto ANTES de
// crear nada — cero escrituras en Meta.
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccounts: [DET_EN, { id: IG_OTRA, username: 'otra.cuenta', page_id: PAGINA, usable_en_cuenta: true }], publicadaUsername: 'posty.communitymanager' };
  let err = null;
  try { await metaAds.createBoost(boostBase({ ctx })); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_fuera_de_conexion' && err.paso === 'creativo', 'B3 [FIX] la dueña fuera de la conexión FRENA con su código (ig_fuera_de_conexion)');
  ok(!!err && err.message.includes('@posty.communitymanager'), 'B3 [FIX] el mensaje nombra la cuenta del posteo (honesto, accionable)');
  ok(escrituras().length === 0, 'B3 [FIX] el freno corre ANTES de crear nada: cero escrituras (ni campaña, ni conjunto, ni creativo)');
  ok(metaAds.detalleErrorMeta(err).includes('ig_fuera_de_conexion') || metaAds.detalleErrorMeta(err).includes('creativo'), 'B3 el registro del freno conserva paso/código');
}

// B4 · LA DUEÑA ESTÁ, PERO VINCULADA A OTRA PÁGINA (no a la del
// anuncio): el triple no cierra → su propio freno, antes de crear.
{
  calls.length = 0;
  const ctx = { ...CTX_BASE, igAccounts: [DET_EN, DET_ES], publicadaUsername: 'posty.communitymanager' };
  let err = null;
  try { await metaAds.createBoost(boostBase({ ctx })); } catch (e) { err = e; }  // pageId = PAGINA (la EN); la ES cuelga de PAGINA_ES
  ok(!!err && err.code === 'ig_otra_pagina', 'B4 [FIX] dueña vinculada a otra Página: freno ig_otra_pagina');
  ok(escrituras().length === 0, 'B4 [FIX] también antes de crear nada: cero escrituras');
}

// B5 · LA DUEÑA ESTÁ Y ES DE LA PÁGINA, PERO NO ESTÁ ASIGNADA a
// la cuenta publicitaria (usable_en_cuenta false al conectar):
// freno fuera-de-conexión antes de crear.
{
  calls.length = 0;
  const detEsNoUsable = { ...DET_ES, page_id: PAGINA, usable_en_cuenta: false };
  const ctx = { ...CTX_BASE, igAccounts: [DET_EN, detEsNoUsable], publicadaUsername: 'posty.communitymanager' };
  let err = null;
  try { await metaAds.createBoost(boostBase({ ctx })); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_fuera_de_conexion', 'B5 [FIX] dueña no asignada a la cuenta publicitaria: freno ig_fuera_de_conexion');
  ok(escrituras().length === 0, 'B5 [FIX] cero escrituras');
}

// B6 · FILA VIEJA (solo ids, sin detalle): el camino de v1167
// sigue — varias guardadas + lecturas caídas desempata la cuenta
// que publica si está entre las guardadas (publicadaId).
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccountIds: [IG_OTRA, IG_EN] };
  const res = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx, publicadaId: IG_EN });
  ok(res.id === IG_EN && res.fuente === 'guardada_publicada', 'B6 [FIX] sin detalle, el desempate de v1167 por la cuenta que publica sigue intacto');
  const ctx1 = { ...CTX_BASE, igAccountIds: [IG_EN] };
  const res1 = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: ctx1, publicadaId: '17841424145064983' });
  ok(res1.id === IG_EN && res1.fuente === 'conexion_guardada', 'B6 [FIX] fila vieja de UNA guardada: viaja como hoy (el caso del intento 8, resuelto por v1167)');
}

// B7 · Varias detalladas SIN username de publicación con qué
// arbitrar: cae al arbitraje de siempre (las lecturas mandan).
{
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccounts: [DET_EN, DET_ES], publicadaUsername: '' };
  const res = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx, publicadaId: '17841424145064983' });
  ok(res.id === IG_EN && res.fuente === 'guardada_dueno', 'B7 [FIX] sin username de publicación, el arbitraje por lecturas de v1167 sigue intacto');
}

// ── §C · control contra la base prístina (v1169) ──────────────────
console.log('§C control (base prístina)');
{
  ok(fs.existsSync(PRISTINE_META), 'C0 existe la copia prístina de la base para el control');
  delete require.cache[require.resolve(PRISTINE_META)];
  const metaBase = require(PRISTINE_META);
  calls.length = 0;
  const aBase = await metaBase.fetchClientAssets('SUAT_CLIENTE');
  ok(!aBase.igAccounts, 'C1 [BASE] la base NO captura el detalle por cuenta (sin igAccounts: no hay username ni Página por cuenta)');
  // El estado real del dueño en la base: la conexión guarda UNA
  // (la EN) y el posteo es de la ES → la base la manda igual y
  // Meta la mata en el creativo (code 100): el defecto.
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctxBase = { ...CTX_BASE, igAccountIds: [IG_EN] };
  const resBase = await metaBase.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: ctxBase, publicadaId: '17841424145064983' });
  ok(resBase.id === IG_EN, 'C2 [BASE] la base resuelve la EN para un posteo de la ES (el id equivocado que Meta rechazó en todos los intentos)');
  // Y con varias guardadas la base no tiene arbitraje por
  // username: sin lecturas y sin desempate, frena a ciegas.
  const ctxBase2 = { ...CTX_BASE, igAccountIds: [IG_EN, IG_ES], igAccounts: [DET_EN, DET_ES], publicadaUsername: 'posty.communitymanager' };
  let errBase = null;
  try { await metaBase.resolverIgUserIdBoost({ pageId: PAGINA_ES, igMediaId: MEDIA, ctx: ctxBase2, publicadaId: '17841424145064983' }); } catch (e) { errBase = e; }
  ok(!!errBase && errBase.code === 'ig_no_resuelto', 'C3 [BASE] la base, con la conexión completa, frena ig_no_resuelto (no conoce el arbitraje por username)');
}

// ── §D · boot aislado del árbol final ─────────────────────────────
console.log('§D boot aislado');
{
  global.fetch = REAL_FETCH;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-creacion5-'));
  const env = {
    ...process.env, PORT: String(PORT), DATA_DIR: tmpDir,
    MEDIA_DIR: path.join(tmpDir, 'media'), NODE_PATH: NM, OPENAI_API_KEY: '',
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += String(d); });
  child.stderr.on('data', (d) => { bootLog += String(d); });
  try {
    let version = null;
    for (let i = 0; i < 60 && !version; i++) {
      try { const r = await REAL_FETCH(`http://127.0.0.1:${PORT}/api/version`); if (r.ok) version = await r.json(); } catch (e) {}
      if (!version) await new Promise((r) => setTimeout(r, 1000));
    }
    ok(!!version && version.ok === true, 'D1 el servidor del árbol final levanta y responde /api/version', bootLog.slice(-300));
    ok(!!version && String(version.build || '').includes('v1169'), 'D2 el build servido es el de la base (v1169, sin estampar)');
    // La columna nueva existe en la base que el boot creó.
    let colOk = false;
    try {
      const { DatabaseSync } = require('node:sqlite');
      const dbf = new DatabaseSync(path.join(tmpDir, 'posta.db'), { readOnly: true });
      const cols = dbf.prepare('PRAGMA table_info(ig_ads_connections)').all().map((c) => c.name);
      colOk = cols.includes('ig_accounts') && cols.includes('ig_account_ids');
      dbf.close();
    } catch (e) { colOk = false; }
    ok(colOk, 'D3 la base del boot trae la columna ig_accounts junto a ig_account_ids');
  } finally {
    const pid = child.pid;
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1200));
    let vivo = true;
    try { process.kill(pid, 0); } catch (e) { vivo = false; }
    ok(!vivo, 'D4 proceso del boot muerto por su PID exacto (' + pid + ')');
    let puertoLibre = false;
    try { await REAL_FETCH(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { puertoLibre = true; }
    ok(puertoLibre, 'D5 el puerto ' + PORT + ' quedó libre');
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

console.log(`\nRESULTADO: ${total - fails}/${total} ok · ${fails} mal`);
process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
