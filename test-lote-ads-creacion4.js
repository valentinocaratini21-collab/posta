// test-lote-ads-creacion4.js — LOTE ADS-CREACIÓN-4
// El intento 8 del dueño (17/11, ya con v1163 en vivo) frenó en el
// paso CREATIVO con el freno ig_no_resuelto: las DOS lecturas de la
// resolución (dueño del medio · IG de la Página) fallaron con el
// SUAT del cliente y el impulso murió — con la cuenta correcta YA
// guardada en la fila de la conexión (ig_account_ids, capturados al
// conectar desde las Páginas compartidas: 1336760809518976).
// Este lote: la resolución manda PRIMERO por las guardadas de la
// propia conexión (una sola → viaja sin leer nada; varias →
// arbitran las lecturas y, sin lecturas, la cuenta que publica los
// posteos del usuario); las lecturas de v1163 quedan de respaldo
// sin guardadas. Los frenos siguen fail-closed y desde ahora
// registran el error CRUDO de cada lectura (detalleLecturas).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-creacion4.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PRISTINE_META = path.join(ROOT, '..', 'pristine', 'meta_ads.js');
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35331;
const REAL_FETCH = global.fetch; // §B/§C stubbean global.fetch: §D usa el real
let total = 0, fails = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

(async () => {
// ── §A · estáticos: el cableado del lote ──────────────────────────
console.log('§A estáticos');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const metaSrc = fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8');
ok(serverSrc.includes("const BUILD_ID = '20261105-v1165'"), 'BUILD_ID intacto (el builder no estampa: queda el de la base v1165)');
ok(metaSrc.includes("fuente: 'conexion_guardada'"), 'meta_ads: la guardada única viaja como fuente primaria (conexion_guardada)');
ok(metaSrc.includes("fuente: 'guardada_publicada'"), 'meta_ads: el desempate por la cuenta que publica existe (guardada_publicada)');
ok(metaSrc.includes("fuente: 'guardada_dueno'") && metaSrc.includes("fuente: 'guardada_pagina'"), 'meta_ads: el arbitraje por lecturas entre guardadas existe');
ok(metaSrc.includes('publicadaId: igUserId'), 'meta_ads: createBoost pasa su igUserId SOLO como publicadaId (nunca como instagram_user_id)');
ok(metaSrc.includes('err.detalleLecturas') && metaSrc.includes('e.detalleLecturas'), 'meta_ads: los frenos adjuntan el detalle crudo de las lecturas y detalleErrorMeta lo suma al registro');
ok(serverSrc.includes('igAccountIds: conn.ig_account_ids'), 'server: adsReadiness expone las IG guardadas de la conexión en el gate');
ok((serverSrc.match(/igAccountIds: gate\.igAccountIds/g) || []).length === 6, 'server: los SEIS ctx de createBoost del riel cliente llevan igAccountIds');
ok(metaSrc.includes("freno('ig_no_resuelto'") && metaSrc.includes("freno('ig_conflicto'") && metaSrc.includes('err.code = code'), 'meta_ads: los frenos fail-closed siguen con su código y paso creativo (vía el helper freno)');

// ── §B · meta_ads con la red stub (el transporte de g()) ─────────
console.log('§B meta_ads (fetch stub)');
process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
process.env.META_AD_ACCOUNT_ID = '111111';
const metaAds = require(path.join(ROOT, 'meta_ads.js'));
ok(typeof metaAds.resolverIgUserIdBoost === 'function', 'meta_ads exporta resolverIgUserIdBoost');

const calls = [];
let duenoModo = 'ok';   // 'ok' | 'error' | 'fuera'
let paginaModo = 'ok';  // 'ok' | 'error' | 'sin_ig' | 'conflicto'
const IG_EN = '1336760809518976';          // la guardada del dueño (@postycommunitymanager), dueña del 696
const IG_OTRA = '17841400000000001';       // otra cuenta compartida (sintética)
const IG_PUBLICADA = '17841400000000002';  // la cuenta que publica los posteos (settings, sintética)
const IG_FUERA = '17841400000000003';      // una dueña leída que NO está entre las guardadas
const PAGINA = '1397548910112144';         // Página «Posty.»
const MEDIA = '18128280008286375';         // el posteo 696
const ERR_DUENO = { error: { message: '(#200) Requires instagram_basic permission', type: 'OAuthException', code: 200, error_subcode: 1234567, fbtrace_id: 'TRACE_DUENO_X' } };
const ERR_PAGINA = { error: { message: '(#200) Requires pages_read_engagement permission', type: 'OAuthException', code: 200, error_subcode: 7654321, fbtrace_id: 'TRACE_PAGINA_Y' } };
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  const json = (data, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => data });
  if (u.includes('boost_eligibility_info')) return json({ boost_eligibility_info: { eligible: true } });
  if (u.includes('owner')) {
    if (duenoModo === 'error') return json(ERR_DUENO, 400);
    if (duenoModo === 'fuera') return json({ id: MEDIA, owner: { id: IG_FUERA, username: 'cuenta.ajena' } });
    return json({ id: MEDIA, owner: { id: IG_EN, username: 'postycommunitymanager' } });
  }
  if (u.includes('instagram_business_account')) {
    if (paginaModo === 'error') return json(ERR_PAGINA, 400);
    if (paginaModo === 'sin_ig') return json({ id: PAGINA, name: 'Posty.' });
    if (paginaModo === 'conflicto') return json({ id: PAGINA, instagram_business_account: { id: '222222222222222', username: 'otra.pagina' } });
    return json({ id: PAGINA, instagram_business_account: { id: IG_EN, username: 'postycommunitymanager' } });
  }
  if (u.includes('/campaigns')) return json({ id: 'camp_1' });
  if (u.includes('/adsets')) return json({ id: 'adset_1' });
  if (u.includes('/adcreatives')) return json({ id: 'cre_1' });
  if (u.endsWith('/ads')) return json({ id: 'ad_1' });
  if (u.includes('/camp_1') || u.includes('/adset_1')) return json(method === 'POST' ? { success: true } : { status: 'ACTIVE' });
  return json({});
};
const CTX_BASE = { token: 'SUAT_CLIENTE', adAccountId: '29027789776849841' };
const llamadaA = (frag) => calls.find((c) => c.url.includes(frag));
const boostBase = (extra) => ({
  name: 'Posty · Impulso u12 · p696', pageId: PAGINA, igUserId: IG_PUBLICADA, igMediaId: MEDIA,
  spendCents: 2000, days: 7, country: 'AR', ...extra,
});

// A · EL CASO EXACTO DEL INTENTO 8: las dos lecturas fallan con el
// SUAT; la conexión guarda UNA cuenta (la correcta) → viaja esa y
// el creativo se crea, sin depender de las lecturas.
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccountIds: [IG_EN] };
  const r = await metaAds.createBoost(boostBase({ ctx }));
  ok(r.campaignId === 'camp_1' && r.creativeId === 'cre_1', 'A [FIX] createBoost completa la cadena entera con las lecturas caídas');
  const cre = llamadaA('/adcreatives');
  ok(cre.body.instagram_user_id === IG_EN, 'A [FIX] el creativo viaja con la cuenta GUARDADA de la conexión (1336760809518976)');
  ok(!calls.some((c) => c.url.includes('owner')) && !calls.some((c) => c.url.includes('instagram_business_account')), 'A [FIX] con una sola guardada la resolución NO lee nada en vivo (no depende de las lecturas que fallan)');
  const camp = llamadaA('/campaigns');
  ok(camp.body.is_adset_budget_sharing_enabled === false && !('lifetime_budget' in camp.body), 'A campaña: idéntica a v1160 (flag false, sin presupuesto)');
  const adset = llamadaA('/adsets');
  ok(adset.body.lifetime_budget === 2000 && adset.body.promoted_object && adset.body.promoted_object.page_id === PAGINA
    && adset.body.targeting.targeting_automation.advantage_audience === 0, 'A conjunto: idéntico a v1160 (presupuesto, promoted_object, advantage_audience 0)');
  const res = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx, publicadaId: IG_PUBLICADA });
  ok(res.id === IG_EN && res.fuente === 'conexion_guardada', 'A el resuelto declara la fuente conexion_guardada');
}

// B · Varias guardadas + lecturas caídas: desempata la cuenta que
// publica los posteos del usuario (publicadaId ∈ guardadas).
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccountIds: [IG_OTRA, IG_PUBLICADA] };
  const r = await metaAds.createBoost(boostBase({ ctx }));
  ok(r.creativeId === 'cre_1', 'B [FIX] con varias guardadas y sin lecturas, el desempate concluyente crea el creativo');
  ok(llamadaA('/adcreatives').body.instagram_user_id === IG_PUBLICADA, 'B [FIX] viaja la cuenta que publica los posteos (está entre las guardadas)');
  const res = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx, publicadaId: IG_PUBLICADA });
  ok(res.fuente === 'guardada_publicada', 'B el resuelto declara la fuente guardada_publicada');
}

// B2 · Varias guardadas: la lectura de la dueña arbitra ANTES que
// el desempate por publicación (la dueña guardada manda).
{
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccountIds: [IG_OTRA, IG_EN] };
  const r = await metaAds.createBoost(boostBase({ ctx }));
  ok(llamadaA('/adcreatives').body.instagram_user_id === IG_EN, 'B2 [FIX] la dueña leída y guardada viaja (no la de publicación, que ni está entre las guardadas)');
  const res = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx, publicadaId: IG_PUBLICADA });
  ok(res.fuente === 'guardada_dueno', 'B2 el resuelto declara la fuente guardada_dueno');
}

// C · Varias guardadas SIN desempate concluyente (la de publicación
// no está entre las guardadas y las lecturas fallan): freno, sin
// llamar al creativo jamás.
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccountIds: [IG_OTRA, '9999999999999999'] };
  let err = null;
  try { await metaAds.createBoost(boostBase({ ctx })); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_no_resuelto' && err.paso === 'creativo', 'C [FIX] sin desempate concluyente la creación FRENA (ig_no_resuelto, paso creativo)');
  ok(!llamadaA('/adcreatives'), 'C [FIX] NUNCA se llama al paso creativo (ningún id a ciegas)');
  ok(!!err && err.detalleLecturas && err.detalleLecturas.includes('TRACE_DUENO_X'), 'C el freno registra el error crudo de las lecturas');
}

// D · Sin ids guardados, dueño legible → viaja el dueño (v1163
// intacto, con ctx vacío y con la lista vacía).
{
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'ok';
  const r1 = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: { ...CTX_BASE }, publicadaId: IG_PUBLICADA });
  ok(r1.id === IG_EN && r1.fuente === 'dueno_medio', 'D [FIX] sin guardadas manda la dueña del medio (fuente dueno_medio, v1163)');
  const r2 = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: { ...CTX_BASE, igAccountIds: [] }, publicadaId: IG_PUBLICADA });
  ok(r2.id === IG_EN && r2.fuente === 'dueno_medio', 'D lista de guardadas vacía = mismo camino v1163');
  const r = await metaAds.createBoost(boostBase({ ctx: { ...CTX_BASE } }));
  ok(llamadaA('/adcreatives').body.instagram_user_id === IG_EN, 'D createBoost sin guardadas crea con la dueña leída');
}

// E · Sin guardadas, dueño ≠ Página → ig_conflicto (v1163 intacto).
{
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'conflicto';
  let err = null;
  try { await metaAds.createBoost(boostBase({ ctx: { ...CTX_BASE } })); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_conflicto' && err.paso === 'creativo', 'E [FIX] dueña distinta de la IG de la Página: freno ig_conflicto en paso creativo');
  ok(!llamadaA('/adcreatives'), 'E no se llama al paso creativo con un par inválido');
}

// F · Nada disponible (sin guardadas, las dos lecturas en error):
// ig_no_resuelto CON los errores crudos en el registro del freno.
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  let err = null;
  try { await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: { ...CTX_BASE }, publicadaId: IG_PUBLICADA }); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_no_resuelto', 'F [FIX] sin ninguna fuente el resuelto frena (ig_no_resuelto)');
  const det = metaAds.detalleErrorMeta(err);
  ok(det.includes('paso creativo') && det.includes('code 200'), 'F el registro del freno trae paso y código');
  ok(det.includes('TRACE_DUENO_X') && det.includes('TRACE_PAGINA_Y'), 'F [FIX] el registro trae los fbtrace CRUDOS de las DOS lecturas (diagnóstico de una lectura)');
  ok(det.includes('subcode 1234567') && det.includes('subcode 7654321'), 'F el registro trae los subcódigos crudos de ambas lecturas');
}

// G · Guardadas presentes pero la dueña LEÍDA está fuera de las
// compartidas: el posteo no es de una cuenta de la conexión →
// freno, aunque haya guardadas (la lectura exitosa manda).
{
  calls.length = 0; duenoModo = 'fuera'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccountIds: [IG_EN, IG_OTRA] };
  let err = null;
  try { await metaAds.createBoost(boostBase({ ctx })); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_no_resuelto', 'G [FIX] dueña leída fuera de las guardadas: freno ig_no_resuelto');
  ok(!llamadaA('/adcreatives'), 'G no se llama al paso creativo');
  ok(metaAds.detalleErrorMeta(err).includes(IG_FUERA), 'G el registro nombra la dueña leída que quedó fuera');
}

// ── §C · control contra la base prístina (v1165) ─────────────────
// El MISMO caso del intento 8 contra el meta_ads de la base: la
// base ignora las guardadas (su resuelto no las conoce), las
// lecturas fallan y el impulso frena — el defecto reproducido.
console.log('§C control (base prístina)');
{
  ok(fs.existsSync(PRISTINE_META), 'C0 existe la copia prístina de la base para el control');
  const metaBase = require(PRISTINE_META);
  calls.length = 0; duenoModo = 'error'; paginaModo = 'error';
  const ctx = { ...CTX_BASE, igAccountIds: [IG_EN] };
  let err = null;
  try {
    await metaBase.createBoost(boostBase({ ctx }));
  } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_no_resuelto', 'C1 [BASE] la base frena el MISMO caso (ig_no_resuelto): el defecto del intento 8, reproducido');
  ok(!llamadaA('/adcreatives'), 'C1 [BASE] la base nunca llega al creativo en este caso');
  ok(!!err && !String(err.detalleLecturas || ''), 'C1 [BASE] la base NO registra el detalle crudo de las lecturas (detalleLecturas ausente)');
}

// ── §D · boot aislado del árbol final ─────────────────────────────
console.log('§D boot aislado');
{
  global.fetch = REAL_FETCH;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-creacion4-'));
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
    ok(!!version && String(version.build || '').includes('v1165'), 'D2 el build servido es el de la base (v1165, sin estampar)');
  } finally {
    const pid = child.pid;
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1200));
    let vivo = true;
    try { process.kill(pid, 0); } catch (e) { vivo = false; }
    ok(!vivo, 'D3 proceso del boot muerto por su PID exacto (' + pid + ')');
    let puertoLibre = false;
    try { await REAL_FETCH(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { puertoLibre = true; }
    ok(puertoLibre, 'D4 el puerto ' + PORT + ' quedó libre');
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

console.log(`\nRESULTADO: ${total - fails}/${total} ok · ${fails} mal`);
process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
