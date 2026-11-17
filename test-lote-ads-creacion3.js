// test-lote-ads-creacion3.js — LOTE ADS-CREACIÓN-3
// El impulso del dueño avanzó dos pasos con v1160 (campaña y
// conjunto PASAN) y el intento 7 murió en el paso CREATIVO:
// «code 100 · (#100) Param instagram_user_id must be a valid
// Instagram account id · fbtrace Ao0XrDplTv0p9A6nSW1CiMz».
// Causa (censo): el instagram_user_id del creativo era el parámetro
// igUserId del llamador = settings.ig_user_id, el id que guarda el
// callback de conexión de Instagram (Instagram Login,
// graph.instagram.com) para PUBLICAR — otro espacio de nombres,
// inválido en la Marketing API (graph.facebook.com), y en el caso
// del dueño ni siquiera es la cuenta dueña del medio (el posteo 696
// es de @postycommunitymanager y la conexión de la app es la ES).
// Este lote: createBoost RESUELVE el id contra la propia cuenta en
// el momento de crear (el dueño del medio manda; si no se lee, la
// Instagram de la Página; contradicción demostrada o ninguna
// candidata legible = freno ANTES del paso creativo, con el motivo
// registrado en paso 'creativo'). El id guardado no viaja nunca más.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-creacion3.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PRISTINE_META = path.join(ROOT, '..', 'pristine', 'meta_ads.js');
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35297;
const REAL_FETCH = global.fetch; // §B/§C stubbean global.fetch: §D usa el real
let total = 0, fails = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

(async () => {
// ── §A · estáticos: el cableado del lote ──────────────────────────
console.log('§A estáticos');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const metaSrc = fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8');
ok(serverSrc.includes("const BUILD_ID = '20261105-v1161'"), 'BUILD_ID intacto (el builder no estampa: queda el de la base v1161)');
ok(metaSrc.includes('async function resolverIgUserIdBoost'), 'meta_ads: existe resolverIgUserIdBoost (la resolución contra la cuenta)');
ok(metaSrc.includes("fields: 'owner{id,username}'"), 'meta_ads: la resolución lee el dueño del medio (owner{id,username})');
ok(metaSrc.includes("fields: 'instagram_business_account{id,username}'"), 'meta_ads: la resolución lee la IG de la Página (instagram_business_account)');
ok(metaSrc.includes('instagram_user_id: igResuelto.id'), 'meta_ads: el creativo viaja con el id RESUELTO');
ok(!metaSrc.includes('instagram_user_id: String(igUserId)'), 'meta_ads: el id guardado de settings NO viaja más al creativo');
ok(metaSrc.includes("err.code = 'ig_no_resuelto'") && metaSrc.includes("err.code = 'ig_conflicto'"), 'meta_ads: los dos frenos de la resolución llevan su código y paso creativo');
ok((serverSrc.match(/igUserId: gate\.igUserId/g) || []).length >= 4, 'server: los llamadores no cambian (el parámetro sigue llegando; lo que cambia es que el creativo ya no lo usa)');

// ── §B · meta_ads con la red stub (el transporte de g()) ─────────
console.log('§B meta_ads (fetch stub)');
process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
process.env.META_AD_ACCOUNT_ID = '111111';
const metaAds = require(path.join(ROOT, 'meta_ads.js'));
const A = require(path.join(ROOT, 'ads-audiencia.js'));
ok(typeof metaAds.resolverIgUserIdBoost === 'function', 'meta_ads exporta resolverIgUserIdBoost');

const calls = [];
let duenoModo = 'ok';   // 'ok' | 'error'
let paginaModo = 'ok';  // 'ok' | 'sin_ig' | 'error' | 'conflicto'
const IG_VALIDA = '1336760809518976';       // la IG de la conexión de Ads (@postycommunitymanager), dueña del 696
const IG_GUARDADA = '17841475699106160';   // settings.ig_user_id: el id que viajaba (inválido en este grafo)
const PAGINA = '1397548910112144';         // Página «Posty.»
const MEDIA = '18128280008286375';         // el posteo 696
const ERROR_OWNER = { error: { message: '(#100) Param instagram_user_id must be a valid Instagram account id', type: 'OAuthException', code: 100, fbtrace_id: 'Ao0XrDplTv0p9A6nSW1CiMz' } };
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  const json = (data, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => data });
  if (u.includes('boost_eligibility_info')) return json({ boost_eligibility_info: { eligible: true } });
  if (u.includes('owner')) {
    if (duenoModo === 'error') return json(ERROR_OWNER, 400);
    return json({ id: MEDIA, owner: { id: IG_VALIDA, username: 'postycommunitymanager' } });
  }
  if (u.includes('instagram_business_account')) {
    if (paginaModo === 'error') return json(ERROR_OWNER, 400);
    if (paginaModo === 'sin_ig') return json({ id: PAGINA, name: 'Posty.' });
    if (paginaModo === 'conflicto') return json({ id: PAGINA, instagram_business_account: { id: '222222222222222', username: 'otra.pagina' } });
    return json({ id: PAGINA, instagram_business_account: { id: IG_VALIDA, username: 'postycommunitymanager' } });
  }
  if (u.includes('/campaigns')) return json({ id: 'camp_1' });
  if (u.includes('/adsets')) return json({ id: 'adset_1' });
  if (u.includes('/adcreatives')) return json({ id: 'cre_1' });
  if (u.endsWith('/ads')) return json({ id: 'ad_1' });
  if (u.includes('/camp_1') || u.includes('/adset_1')) return json(method === 'POST' ? { success: true } : { status: 'ACTIVE' });
  return json({});
};
const CTX_CLI = { token: 'SUAT_CLIENTE', adAccountId: '29027789776849841' };
const llamadaA = (frag) => calls.find((c) => c.url.includes(frag));
const TARGETING_ESTUDIO = { geo_locations: { countries: ['AR'] }, age_min: 25, age_max: 44 };

// B1 · EL CASO DEL DUEÑO (intento 7): riel cliente, «comprar», el id
// guardado inválido; la resolución devuelve la dueña del medio.
{
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'ok';
  const mapeo = A.mapeoMeta('comprar');
  const r = await metaAds.createBoost({
    name: 'Posty · Impulso u12 · p696', pageId: PAGINA, igUserId: IG_GUARDADA, igMediaId: MEDIA,
    spendCents: 2000, days: 7, country: 'AR',
    objective: mapeo.campaignObjective, optimizationGoal: mapeo.optimizationGoal,
    destinationType: mapeo.destinationType, targeting: TARGETING_ESTUDIO, ctx: CTX_CLI,
  });
  ok(r.campaignId === 'camp_1' && r.creativeId === 'cre_1', 'B1 [FIX] createBoost completa la cadena entera (los 5 pasos)');
  const cre = llamadaA('/adcreatives');
  ok(cre.body.instagram_user_id === IG_VALIDA, 'B1 [FIX] el creativo viaja con el id RESUELTO (la dueña del medio, en el grafo de Meta)');
  ok(cre.body.instagram_user_id !== IG_GUARDADA, 'B1 [FIX] el id guardado de settings NO viaja');
  ok(cre.body.source_instagram_media_id === MEDIA && cre.body.object_id === PAGINA, 'B1 creativo: medio y Página como v1160');
  const lecturaDueno = calls.find((c) => c.url.includes('owner'));
  ok(!!lecturaDueno && lecturaDueno.url.includes('access_token=SUAT_CLIENTE'), 'B1 la resolución corre con el token DEL RIEL (el SUAT del cliente)');
  const camp = llamadaA('/campaigns');
  ok(camp.body.is_adset_budget_sharing_enabled === false && !('lifetime_budget' in camp.body), 'B1 campaña: idéntica a v1160 (flag false, sin presupuesto)');
  const adset = llamadaA('/adsets');
  ok(adset.body.lifetime_budget === 2000 && adset.body.promoted_object && adset.body.promoted_object.page_id === PAGINA
    && adset.body.targeting.targeting_automation.advantage_audience === 0
    && adset.body.destination_type === 'INSTAGRAM_DIRECT', 'B1 conjunto: idéntico a v1160 (presupuesto, promoted_object, advantage_audience 0, destino)');
}

// B2 · Sin resolución posible: freno ANTES del creativo, registrado.
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'sin_ig';
  let err = null;
  try {
    await metaAds.createBoost({ name: 'Sin resolución', pageId: PAGINA, igUserId: IG_GUARDADA, igMediaId: MEDIA, spendCents: 2000, days: 7, country: 'AR', ctx: CTX_CLI });
  } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_no_resuelto', 'B2 [FIX] sin candidata legible la creación FRENA (ig_no_resuelto)');
  ok(!!err && err.paso === 'creativo', 'B2 [FIX] el freno queda registrado en el paso creativo');
  ok(!!err && metaAds.detalleErrorMeta(err).includes('paso creativo'), 'B2 el detalle del registro dice «paso creativo» + el motivo');
  ok(!llamadaA('/adcreatives'), 'B2 [FIX] NUNCA se llama al paso creativo (ningún id a ciegas)');
  ok(!!llamadaA('/campaigns') && !!llamadaA('/adsets'), 'B2 campaña y conjunto sí se crearon (el freno es antes del creativo, como el rechazo del intento 7)');
}

// B3 · Riel billetera (sin ctx, la cuenta de Posty): el dueño no se
// lee; manda la Instagram de la Página, con el token del entorno.
{
  calls.length = 0; duenoModo = 'error'; paginaModo = 'ok';
  const r = await metaAds.createBoost({ name: 'Billetera', pageId: PAGINA, igUserId: 'lo_que_sea', igMediaId: MEDIA, spendCents: 5000, days: 7, country: 'AR' });
  ok(r.campaignId === 'camp_1', 'B3 riel billetera: la cadena completa con la cuenta de Posty');
  const cre = llamadaA('/adcreatives');
  ok(cre.body.instagram_user_id === IG_VALIDA, 'B3 el creativo viaja con la IG de la Página (la dueña no era legible)');
  ok(cre.body.access_token === 'TOKEN_POSTY', 'B3 la creación corre con el token del entorno (riel billetera), no con un SUAT');
}

// B4 · Contradicción demostrada (dueña ≠ IG de la Página): freno.
{
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'conflicto';
  let err = null;
  try {
    await metaAds.createBoost({ name: 'Conflicto', pageId: PAGINA, igUserId: IG_GUARDADA, igMediaId: MEDIA, spendCents: 2000, days: 7, country: 'AR', ctx: CTX_CLI });
  } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_conflicto' && err.paso === 'creativo', 'B4 [FIX] dueña distinta de la IG de la Página: freno ig_conflicto en paso creativo');
  ok(!llamadaA('/adcreatives'), 'B4 no se llama al paso creativo con un par inválido');
}

// B5 · Sin Página (riel cliente): la dueña sola alcanza.
{
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'ok';
  const r = await metaAds.createBoost({ name: 'Sin página', pageId: null, igUserId: IG_GUARDADA, igMediaId: MEDIA, spendCents: 2000, days: 7, country: 'AR', ctx: CTX_CLI });
  ok(r.campaignId === 'camp_1', 'B5 sin Página: la cadena completa (la dueña del medio alcanza)');
  const cre = llamadaA('/adcreatives');
  ok(cre.body.instagram_user_id === IG_VALIDA && !('object_id' in cre.body), 'B5 creativo: id resuelto de la dueña y sin object_id fabricado');
  const adset = llamadaA('/adsets');
  ok(!('promoted_object' in adset.body), 'B5 conjunto: sin promoted_object fabricado (como v1160)');
}

// B6 · El resuelto, directo: la fuente declarada de cada camino.
{
  duenoModo = 'ok'; paginaModo = 'ok';
  const r1 = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: CTX_CLI });
  ok(r1.id === IG_VALIDA && r1.fuente === 'dueno_medio', 'B6 con dueña legible manda la dueña (fuente dueno_medio)');
  duenoModo = 'error';
  const r2 = await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: CTX_CLI });
  ok(r2.id === IG_VALIDA && r2.fuente === 'pagina', 'B6 sin dueña legible manda la IG de la Página (fuente pagina)');
  paginaModo = 'sin_ig';
  let err = null;
  try { await metaAds.resolverIgUserIdBoost({ pageId: PAGINA, igMediaId: MEDIA, ctx: CTX_CLI }); } catch (e) { err = e; }
  ok(!!err && err.code === 'ig_no_resuelto', 'B6 sin ninguna candidata el resuelto frena (no devuelve el id guardado ni uno inventado)');
  duenoModo = 'ok'; paginaModo = 'ok';
}

// ── §C · control contra la base prístina (v1161) ─────────────────
// El MISMO caso del dueño contra el meta_ads de la base: el id
// guardado viaja tal cual al creativo — el defecto del intento 7
// reproducido a nivel de stub.
console.log('§C control (base prístina)');
{
  ok(fs.existsSync(PRISTINE_META), 'C0 existe la copia prístina de la base para el control');
  const metaBase = require(PRISTINE_META);
  calls.length = 0; duenoModo = 'ok'; paginaModo = 'ok';
  const mapeo = A.mapeoMeta('comprar');
  const r = await metaBase.createBoost({
    name: 'Posty · Impulso u12 · p696', pageId: PAGINA, igUserId: IG_GUARDADA, igMediaId: MEDIA,
    spendCents: 2000, days: 7, country: 'AR',
    objective: mapeo.campaignObjective, optimizationGoal: mapeo.optimizationGoal,
    destinationType: mapeo.destinationType, targeting: TARGETING_ESTUDIO, ctx: CTX_CLI,
  });
  ok(r.campaignId === 'camp_1', 'C1 la base completa su cadena contra el stub (el stub no reproduce el rechazo de Meta)');
  const cre = llamadaA('/adcreatives');
  ok(cre.body.instagram_user_id === IG_GUARDADA, 'C1 [BASE] la base manda el id GUARDADO tal cual — ese es el id que Meta rechazó en el intento 7');
  ok(!calls.some((c) => c.url.includes('owner')), 'C1 [BASE] la base jamás lee el dueño del medio');
}

// ── §D · boot aislado del árbol final ─────────────────────────────
console.log('§D boot aislado');
{
  global.fetch = REAL_FETCH;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-creacion3-'));
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
    ok(!!version && String(version.build || '').includes('v1161'), 'D2 el build servido es el de la base (v1161, sin estampar)');
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
