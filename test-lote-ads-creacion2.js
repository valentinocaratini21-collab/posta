// test-lote-ads-creacion2.js — LOTE ADS-CREACIÓN-2
// El dueño reintentó el impulso del posteo 696 con v1156 vivo y Meta
// rechazó de nuevo — esta vez el registro guardó el error ENTERO:
// paso campaña · code 100 · subcode 4834011 · «You must specify True
// or False in the field is_adset_budget_sharing_enabled if you are
// not using campaign budget.» Y en la pantalla «no pasaba nada»:
// el motivo caía como texto chico en un <p> fuera de la vista.
// Este lote: (1) la campaña declara is_adset_budget_sharing_enabled:
// false (el presupuesto vive en el conjunto) y el censo completo de
// la clase «campo que Meta exige declarado aunque tenga default»:
// el conjunto declara targeting_automation.advantage_audience: 0
// (desde v23, la segmentación no-default sin el flag explícito
// errora; 0 = el público estudiado manda como restricción) y el
// promoted_object { page_id } con cualquier destino de engagement
// (las fuentes vigentes del boost de posteo existente lo exigen
// también para POST_ENGAGEMENT; sin Página no se fabrica).
// (2) El error del impulso se VE: bloque persistente en la tarjeta
// («Meta no aceptó la campaña.» + «No se cobró nada.») y el botón
// queda habilitado para reintentar.
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-creacion2.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35293;
const REAL_FETCH = global.fetch; // §B stubbea global.fetch: §D usa el real
let total = 0, fails = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\n)\s*\/\/.*$/gm, '$1');
function fnFrom(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let depth = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return src.slice(i, start);
}

(async () => {
// ── §A · estáticos: el cableado del lote ──────────────────────────
console.log('§A estáticos');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const metaSrc = fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
ok(serverSrc.includes("const BUILD_ID = '20261105-v1156'"), 'BUILD_ID intacto (el builder no estampa: queda el de la base v1156)');
ok(metaSrc.includes('is_adset_budget_sharing_enabled: false'), 'meta_ads: la campaña declara is_adset_budget_sharing_enabled: false');
ok(metaSrc.includes('advantage_audience: 0'), 'meta_ads: el conjunto declara targeting_automation.advantage_audience: 0');
ok(appSrc.includes('id="pzAdsAudienciaError"'), 'app.js: la tarjeta de audiencia tiene la ranura del bloque de error');
ok(appSrc.includes('function pzBoostErrorHTML') && appSrc.includes('Meta no aceptó la campaña.') && appSrc.includes('No se cobró nada.'), 'app.js: el bloque de error existe con sus dos líneas de cliente');
const audHTML = fnFrom(appSrc, 'function pzAdsAudienciaHTML()');
ok(audHTML.includes('pzAdsAudienciaError') && audHTML.includes('s.boostError ? pzBoostErrorHTML'), 'app.js: la tarjeta rinde el error guardado en el estado (persistente entre repintados)');

// ── §B · meta_ads con la red stub (el transporte de g()) ─────────
console.log('§B meta_ads (fetch stub)');
process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
process.env.META_AD_ACCOUNT_ID = '111111';
const metaAds = require(path.join(ROOT, 'meta_ads.js'));
const A = require(path.join(ROOT, 'ads-audiencia.js'));

const calls = [];
let modoError = null;
const ERROR_4834011 = { error: { message: 'You must specify True or False in the field is_adset_budget_sharing_enabled if you are not using campaign budget.', type: 'OAuthException', code: 100, error_subcode: 4834011, fbtrace_id: 'FBTRACE483' } };
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  const json = (data, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => data });
  if (u.includes('boost_eligibility_info')) return json({ boost_eligibility_info: { eligible: true } });
  if (u.includes('/search')) return json({ data: [] });
  if (u.includes('/customaudiences')) return json({ data: [] });
  if (u.includes('/campaigns')) return modoError === 'campana' ? json(ERROR_4834011, 400) : json({ id: 'camp_1' });
  if (u.includes('/adsets')) return json({ id: 'adset_1' });
  if (u.includes('/adcreatives')) return json({ id: 'cre_1' });
  if (u.endsWith('/ads')) return json({ id: 'ad_1' });
  if (u.includes('/camp_1') || u.includes('/adset_1')) return json(method === 'POST' ? { success: true } : { status: 'ACTIVE' });
  return json({});
};
const CTX_CLI = { token: 'SUAT_CLIENTE', adAccountId: '222' };
const fund = (extra) => Object.assign({
  cta: '', meta: '', goalTexto: '', categoria: 'tecnologia',
  audienciaTexto: '', clienteIdeal: '', ciudad: '', donde: '', pais: 'AR', lang: 'es',
}, extra || {});
const llamadaA = (frag) => calls.find((c) => c.url.includes(frag));

// B1 · El caso real del dueño: «comprar», riel cliente, US$20.
{
  calls.length = 0; modoError = null;
  const p = A.propuestaDesdeFundamento(fund({ cta: 'comprar' }));
  const rt = await A.resolverTargeting(p.audiencia, p, metaAds, CTX_CLI);
  const mapeo = A.mapeoMeta('comprar');
  const r = await metaAds.createBoost({
    name: 'Posty · Impulso u12 · p696', pageId: '999', igUserId: 'igcli', igMediaId: '18128280008286375',
    spendCents: 2000, days: 7, country: 'AR',
    objective: mapeo.campaignObjective, optimizationGoal: mapeo.optimizationGoal,
    destinationType: mapeo.destinationType, targeting: rt.targeting, ctx: CTX_CLI,
  });
  ok(r.campaignId === 'camp_1', 'B1 createBoost completa la creación (los 5 pasos)');
  const camp = llamadaA('/campaigns');
  ok(camp.body.is_adset_budget_sharing_enabled === false, 'B1 campaña: is_adset_budget_sharing_enabled === false — el campo del subcode 4834011');
  ok(!('lifetime_budget' in camp.body) && !('daily_budget' in camp.body), 'B1 campaña: SIN presupuesto (vive en el conjunto, como siempre)');
  ok(camp.body.objective === 'OUTCOME_ENGAGEMENT' && camp.body.status === 'PAUSED' && Array.isArray(camp.body.special_ad_categories), 'B1 campaña: el resto del cuerpo idéntico a v1156');
  const adset = llamadaA('/adsets');
  ok(adset.body.lifetime_budget === 2000, 'B1 conjunto: lifetime_budget en el conjunto');
  ok(adset.body.destination_type === 'INSTAGRAM_DIRECT' && adset.body.optimization_goal === 'CONVERSATIONS', 'B1 conjunto: destino y optimización de «comprar», como v1156');
  ok(adset.body.promoted_object && adset.body.promoted_object.page_id === '999', 'B1 conjunto: promoted_object { page_id } (v1156)');
  ok(adset.body.targeting && adset.body.targeting.targeting_automation && adset.body.targeting.targeting_automation.advantage_audience === 0, 'B1 conjunto: targeting_automation.advantage_audience === 0 declarado');
  ok(adset.body.targeting.geo_locations && Number(adset.body.targeting.age_min) === Number(rt.targeting.age_min) && Number(adset.body.targeting.age_max) === Number(rt.targeting.age_max), 'B1 conjunto: la segmentación del estudio llega intacta (geo + edades)');
  ok(!('targeting_automation' in (rt.targeting || {})), 'B1 el targeting del llamador NO se mutó (la declaración va en una copia)');
  const cre = llamadaA('/adcreatives');
  ok(cre.body.source_instagram_media_id === '18128280008286375' && cre.body.object_id === '999' && !('call_to_action' in cre.body), 'B1 creativo: el posteo existente tal cual, como v1156');
  const ad = calls.find((c) => c.url.endsWith('/ads'));
  ok(ad.body.adset_id === 'adset_1' && ad.body.creative && ad.body.creative.creative_id === 'cre_1' && ad.body.status === 'ACTIVE', 'B1 anuncio: como v1156');
}

// B2 · «seguir» (POST_ENGAGEMENT): el promoted_object ahora también.
{
  calls.length = 0;
  const mapeo = A.mapeoMeta('seguir');
  await metaAds.createBoost({
    name: 'Seguir', pageId: '999', igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR',
    objective: mapeo.campaignObjective, optimizationGoal: mapeo.optimizationGoal,
    destinationType: mapeo.destinationType, targeting: null, ctx: CTX_CLI,
  });
  const camp = llamadaA('/campaigns');
  ok(camp.body.is_adset_budget_sharing_enabled === false, 'B2 campaña: el flag también en el camino de engagement');
  const adset = llamadaA('/adsets');
  ok(adset.body.optimization_goal === 'POST_ENGAGEMENT' && !('destination_type' in adset.body), 'B2 conjunto: POST_ENGAGEMENT sin destination_type (como siempre)');
  ok(adset.body.promoted_object && adset.body.promoted_object.page_id === '999', 'B2 conjunto: promoted_object { page_id } TAMBIÉN en engagement (nuevo de este lote)');
  ok(adset.body.targeting.targeting_automation.advantage_audience === 0 && adset.body.targeting.age_min === 18 && adset.body.targeting.age_max === 65, 'B2 conjunto: el flag declarado también sobre el targeting de respaldo');
}

// B3 · Histórico sin ctx (riel billetera, defaults).
{
  calls.length = 0;
  await metaAds.createBoost({ name: 'Histórico', pageId: 'p1', igUserId: 'ig1', igMediaId: 'm1', spendCents: 5000, days: 7, country: 'AR' });
  const camp = llamadaA('/campaigns');
  const adset = llamadaA('/adsets');
  ok(camp.body.is_adset_budget_sharing_enabled === false, 'B3 histórico: campaña con el flag');
  ok(adset.body.promoted_object && adset.body.promoted_object.page_id === 'p1' && adset.body.targeting.targeting_automation.advantage_audience === 0, 'B3 histórico: promoted_object + advantage_audience declarados');
  calls.length = 0;
  const mapeoC = A.mapeoMeta('comprar');
  await metaAds.createBoost({
    name: 'Sin página', pageId: null, igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR',
    objective: mapeoC.campaignObjective, optimizationGoal: mapeoC.optimizationGoal,
    destinationType: mapeoC.destinationType, targeting: null, ctx: CTX_CLI,
  });
  const adsetSP = llamadaA('/adsets');
  ok(!('promoted_object' in adsetSP.body), 'B3 sin Página: no se fabrica un promoted_object');
}

// B4 · Si Meta igual rechaza la campaña, el error entero sigue
// quedando (con el subcode real de producción 4834011).
{
  calls.length = 0; modoError = 'campana';
  let err = null;
  try {
    await metaAds.createBoost({ name: 'Falla campaña', pageId: '999', igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR', ctx: CTX_CLI });
  } catch (e) { err = e; }
  modoError = null;
  ok(!!err && err.paso === 'campaña' && err.metaError && err.metaError.subcode === 4834011, 'B4 rechazo en campaña: paso + subcode 4834011 sobreviven');
  ok(metaAds.detalleErrorMeta(err).includes('4834011'), 'B4 detalleErrorMeta compone el subcode real');
}

// B5 · Un targeting que ya declara su advantage_audience se respeta.
{
  calls.length = 0;
  const tPropio = { geo_locations: { countries: ['AR'] }, age_min: 18, age_max: 65, targeting_automation: { advantage_audience: 1 } };
  await metaAds.createBoost({ name: 'Flag propio', pageId: '999', igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR', targeting: tPropio, ctx: CTX_CLI });
  const adset = llamadaA('/adsets');
  ok(adset.body.targeting.targeting_automation.advantage_audience === 1, 'B5 advantage_audience ya declarado por el llamador: se respeta (no se pisa)');
}

// ── §C · el error se VE (VM sobre public/app.js) ─────────────────
console.log('§C cliente (VM app.js)');
{
  const els = {};
  const mkEl = () => ({ innerHTML: '', textContent: '', _scrolled: false, scrollIntoView() { this._scrolled = true; } });
  const ctx = {
    console,
    ME: { lang: 'es' },
    esc: (s) => String(s),
    gzT: (es, en) => es,
    document: { getElementById: (id) => els[id] || null },
    pzBoostEsMP: () => false,
    pzBoostKey: (p) => 'k' + (p.post_id || p.ig_media_id),
    pzBoostImpulsados: new Set(),
    pzBoostMarcarImpulsado: () => {},
    pzBoostPintarExito: () => {},
    pzAdsAudienciaMostrar: async () => false,
    pzAdsImpulsarAdjuntarTarjeta: () => {},
    toast: () => {},
    api: { post: async () => { throw { data: { ok: false, motivo: 'anuncio_fallido' } }; } },
    pzBoostState: null,
  };
  vm.createContext(ctx);
  for (const sig of ['function pzBoostMotivo(motivo, monto, cobroId)', 'function pzBoostErrorHTML(motivo, monto, cobroId)', 'function pzBoostPintarError()', 'function pzAdsAudienciaKey(p, monto)', 'async function pzBoostConfirmar(btn, enTarjeta)']) {
    const code = fnFrom(appSrc, sig);
    ok(code.length > 0, '§C se extrajo ' + sig.split('(')[0]);
    vm.runInContext(code, ctx);
  }
  const post696 = { post_id: 696, ig_media_id: '18128280008286375' };
  const estadoBase = () => ({ selPost: post696, selMonto: 20, audienciaSel: null, billetera: {}, audienciaKey: ctx.pzAdsAudienciaKey(post696, 20) });

  // C1 · El caso del dueño: Meta rechaza la creación (409 anuncio_fallido).
  els.pzAdsAudienciaError = mkEl(); els.pzBoostMsg = mkEl(); els.pzAdsRecMsg = mkEl();
  ctx.pzBoostState = estadoBase();
  const btn = { disabled: false, textContent: 'Sale así 🚀' };
  const j1 = await ctx.pzBoostConfirmar(btn);
  ok(j1 && j1.ok === false && j1.motivo === 'anuncio_fallido', 'C1 el confirmar devuelve el fallo del servidor');
  ok(els.pzAdsAudienciaError.innerHTML.includes('Meta no aceptó la campaña') && els.pzAdsAudienciaError.innerHTML.includes('No se cobró nada'), 'C1 [FIX] el bloque de error queda EN LA TARJETA, sobre el «Sale así»: qué pasó + «No se cobró nada»');
  ok(els.pzBoostMsg.innerHTML.includes('Meta no aceptó la campaña'), 'C1 [FIX] el mensaje de la hoja también lleva el bloque (no el texto chico que se perdía)');
  ok(els.pzAdsAudienciaError._scrolled === true, 'C1 el bloque se trae a la vista (scrollIntoView)');
  ok(btn.disabled === false, 'C1 el botón «Sale así» queda HABILITADO para reintentar');
  ok(ctx.pzBoostState.boostError && ctx.pzBoostState.boostError.motivo === 'anuncio_fallido', 'C1 el error queda guardado en el estado (persiste entre repintados)');

  // C2 · Éxito: el flujo de hoy, y el error anterior se limpia.
  ctx.pzBoostState = estadoBase();
  ctx.pzBoostState.boostError = { motivo: 'anuncio_fallido', monto: 20, cobroId: null };
  ctx.api.post = async () => ({ ok: true, balance_cents: 2000 });
  const j2 = await ctx.pzBoostConfirmar({ disabled: false });
  ok(j2 && j2.ok === true, 'C2 éxito: la respuesta pasa tal cual');
  ok(ctx.pzBoostState.boostError === null, 'C2 éxito: el error guardado se limpia');

  // C3 · El bloque, por motivo.
  const hMeta = ctx.pzBoostErrorHTML('anuncio_fallido', 20, null);
  ok(hMeta.includes('Meta no aceptó la campaña.') && hMeta.includes('No se cobró nada.'), 'C3 anuncio_fallido: «Meta no aceptó la campaña.» + «No se cobró nada.»');
  const hSaldo = ctx.pzBoostErrorHTML('saldo_insuficiente', 20, null);
  ok(hSaldo.includes('No te alcanza el saldo') && hSaldo.includes('No se cobró nada.'), 'C3 otro motivo: su texto de siempre + la garantía');
  const hGen = ctx.pzBoostErrorHTML('', 20, null);
  ok(hGen.includes('No se pudo impulsar') && !hGen.includes('No se cobró nada'), 'C3 motivo genérico: su texto ya dice que no se gastó — la garantía no se duplica');
}

// ── §D · boot aislado del árbol final ─────────────────────────────
console.log('§D boot aislado');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-creacion2-'));
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
    ok(!!version && String(version.build || '').includes('v1156'), 'D2 el build servido es el de la base (v1156, sin estampar)');
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
