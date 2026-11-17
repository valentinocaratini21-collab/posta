// test-lote-ads-creacion.js — LOTE ADS-CREACIÓN
// El impulso real del dueño (user 12, riel del CLIENTE, posteo 696,
// objetivo «comprar», alcance pais, parecidos, US$20) fallaba en Meta
// con la fila 'error' diciendo solo «Meta Ads: Invalid parameter»:
// indiagnosticable. Causas encontradas contra la doc oficial de la
// Marketing API y el censo del código:
//  (H1) El conjunto salía SIN promoted_object: con destino
//       INSTAGRAM_DIRECT + optimization CONVERSATIONS la doc exige
//       promoted_object { page_id } — sin él, code 100 en el conjunto.
//  (H2) La audiencia parecida se resolvía SIN contexto, en la cuenta
//       de Posty, y su id ajeno entraba al conjunto del cliente.
//  (H0) El helper g() aplanaba el error de Meta (solo e.message): el
//       subcódigo, el paso y el fbtrace se perdían en el origen.
// Este lote: (1) g() conserva el error entero (e.metaError) y
// createBoost etiqueta el paso; detalleErrorMeta lo deja en una
// línea para el registro. (2) La resolución de targeting corre con
// el ctx de quien pauta. (3) El conjunto de mensajes lleva su
// promoted_object. (4) Los dos rieles registran el detalle entero
// en la fila 'error' (el billetera ni siquiera dejaba fila).
// Uso: NODE_PATH=/home/hatch/workspace/posta/node_modules node test-lote-ads-creacion.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const NM = '/home/hatch/workspace/posta/node_modules';
const PORT = 35193;
const REAL_FETCH = global.fetch; // §B stubbea global.fetch: §E usa el real
let total = 0, fails = 0;
const ok = (cond, msg) => { total++; if (cond) console.log('  ✓', msg); else { fails++; console.error('  ✗', msg); } };

(async () => {
// ── §A · estáticos: el cableado del lote ──────────────────────────
console.log('§A estáticos');
const serverSrc = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const metaSrc = fs.readFileSync(path.join(ROOT, 'meta_ads.js'), 'utf8');
const billSrc = fs.readFileSync(path.join(ROOT, 'ads-billetera.js'), 'utf8');
ok(serverSrc.includes("const BUILD_ID = '20261105-v1154'"), 'BUILD_ID intacto (el builder no estampa)');
ok(serverSrc.includes('resolverTargeting(audienciaFinal, propuestaAds, metaAds, { token: gate.suat, adAccountId: gate.adAccountId })'), 'server: el riel cliente resuelve el targeting CON el ctx del cliente');
ok((serverSrc.match(/detalleErrorMeta/g) || []).length >= 2, 'server: detalleErrorMeta en los dos rieles (cliente + crearAnuncio billetera)');
ok(!serverSrc.includes("creación fallida en la cuenta del cliente (riel cliente): ${String("), 'server: el registro del riel cliente ya no trunca a 300 el error de Meta');
ok(billSrc.includes("tipo: 'error'"), 'ads-billetera: impulsarConSaldo registra tipo error');
ok(metaSrc.includes('promoted_object') && metaSrc.includes('err.metaError'), 'meta_ads: promoted_object + metaError presentes');

// ── §B · meta_ads con la red stub (el transporte de g()) ─────────
console.log('§B meta_ads (fetch stub por cuenta)');
process.env.META_ADS_TOKEN = 'TOKEN_POSTY';
process.env.META_AD_ACCOUNT_ID = '111111'; // la cuenta de Posty (env)
const metaAds = require(path.join(ROOT, 'meta_ads.js'));
const A = require(path.join(ROOT, 'ads-audiencia.js'));
ok(typeof metaAds.detalleErrorMeta === 'function', 'meta_ads exporta detalleErrorMeta');

const calls = [];
let lookCliente = [];           // audiencias de la cuenta del cliente (act_222)
let modoError = null;           // null | 'campana' | 'conjunto'
const ERROR_META = { error: { message: 'Invalid parameter', type: 'OAuthException', code: 100, error_subcode: 1885183, error_user_title: 'Parámetro no válido', error_user_msg: 'Falta el objeto promovido del conjunto', fbtrace_id: 'FBTRACE123' } };
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  let body = null;
  try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
  calls.push({ url: u, method, body });
  const json = (data, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => data });
  if (u.includes('boost_eligibility_info')) return json({ boost_eligibility_info: { eligible: true } });
  if (u.includes('/search')) {
    const q = new URL(u).searchParams;
    if (q.get('type') === 'adinterest') return json(q.get('q') === 'Skin care' ? { data: [{ id: '6003139266461', name: 'Skin care' }] } : { data: [] });
    if (q.get('type') === 'adgeolocation') return json({ data: [{ key: '987', name: 'Palermo', latitude: -34.5788, longitude: -58.4242 }] });
    return json({ data: [] });
  }
  if (u.includes('/customaudiences')) {
    if (u.includes('/act_222/')) return json({ data: lookCliente });
    return json({ data: [{ id: 'LOOK_POSTY', name: 'Parecidos Posty', subtype: 'LOOKALIKE' }] });
  }
  if (u.includes('/campaigns')) return modoError === 'campana' ? json(ERROR_META, 400) : json({ id: 'camp_1' });
  if (u.includes('/adsets')) return modoError === 'conjunto' ? json(ERROR_META, 400) : json({ id: 'adset_1' });
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

// B1 · El caso real: «comprar», riel cliente, parecidos SIN lookalike
// en la cuenta del cliente (solo existe en la de Posty).
{
  calls.length = 0; lookCliente = []; modoError = null;
  const p = A.propuestaDesdeFundamento(fund({ cta: 'comprar' }));
  ok(p.audiencia.alcance === 'pais' && p.audiencia.parecidos === true, 'B1 propuesta del caso real: alcance pais, parecidos sí');
  const rt = await A.resolverTargeting(p.audiencia, p, metaAds, CTX_CLI);
  const callLook = llamadaA('/customaudiences');
  ok(!!callLook && callLook.url.includes('/act_222/customaudiences') && callLook.url.includes('access_token=SUAT_CLIENTE'), 'B1 la lookalike se buscó EN LA CUENTA DEL CLIENTE con su SUAT');
  ok(!llamadaA('/act_111111/customaudiences'), 'B1 la cuenta de Posty NO se tocó en el riel cliente');
  ok(!rt.targeting.custom_audiences && rt.resuelto.parecidos_estado === 'sin_audiencia_disponible', 'B1 sin lookalike propia: NO entra ningún id ajeno y degrada declarado');
  const mapeo = A.mapeoMeta('comprar');
  const r = await metaAds.createBoost({
    name: 'Posty · Impulso u12 · p696', pageId: '999', igUserId: 'igcli', igMediaId: '18128280008286375',
    spendCents: 2000, days: 7, country: 'AR',
    objective: mapeo.campaignObjective, optimizationGoal: mapeo.optimizationGoal,
    destinationType: mapeo.destinationType, targeting: rt.targeting, ctx: CTX_CLI,
  });
  ok(r.campaignId === 'camp_1', 'B1 createBoost completa la creación');
  const adset = llamadaA('/adsets');
  ok(adset.body.destination_type === 'INSTAGRAM_DIRECT', 'B1 conjunto: destination_type INSTAGRAM_DIRECT');
  ok(adset.body.optimization_goal === 'CONVERSATIONS', 'B1 conjunto: optimization_goal CONVERSATIONS');
  ok(adset.body.promoted_object && adset.body.promoted_object.page_id === '999', 'B1 conjunto: promoted_object { page_id } — lo que la doc exige y faltaba');
  ok(!('custom_audiences' in (adset.body.targeting || {})), 'B1 conjunto: el targeting no lleva audiencias de otra cuenta');
  const cre = llamadaA('/adcreatives');
  ok(cre.body.source_instagram_media_id === '18128280008286375' && !('call_to_action' in cre.body), 'B1 creativo: el posteo existente va tal cual (sin CTA inventado)');
}

// B2 · La lookalike DEL CLIENTE sí entra (resuelta en su cuenta).
{
  calls.length = 0; lookCliente = [{ id: 'LOOK_CLI', name: 'Parecidos del cliente', subtype: 'LOOKALIKE' }];
  const p = A.propuestaDesdeFundamento(fund({ cta: 'comprar' }));
  const rt = await A.resolverTargeting(p.audiencia, p, metaAds, CTX_CLI);
  ok(rt.targeting.custom_audiences && rt.targeting.custom_audiences[0].id === 'LOOK_CLI' && rt.resuelto.parecidos_estado === 'aplicado', 'B2 lookalike propia del cliente: aplicada desde SU cuenta');
}

// B3 · Sin ctx (riel billetera): la resolución sigue en la cuenta de
// Posty, como siempre — el camino histórico no cambia.
{
  calls.length = 0;
  const p = A.propuestaDesdeFundamento(fund({ cta: 'comprar' }));
  const rt = await A.resolverTargeting(p.audiencia, p, metaAds);
  ok(rt.targeting.custom_audiences && rt.targeting.custom_audiences[0].id === 'LOOK_POSTY', 'B3 sin ctx: lookalike de la cuenta de Posty (histórico intacto)');
  ok(!!llamadaA('/act_111111/customaudiences'), 'B3 sin ctx: la búsqueda fue a la cuenta del entorno');
}

// B4 · POST_ENGAGEMENT (seguir/local) y el histórico: payload intacto.
{
  calls.length = 0;
  const mapeo = A.mapeoMeta('seguir');
  await metaAds.createBoost({
    name: 'Seguir', pageId: '999', igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR',
    objective: mapeo.campaignObjective, optimizationGoal: mapeo.optimizationGoal,
    destinationType: mapeo.destinationType, targeting: null, ctx: CTX_CLI,
  });
  const adset = llamadaA('/adsets');
  ok(adset.body.optimization_goal === 'POST_ENGAGEMENT' && !('destination_type' in adset.body) && !('promoted_object' in adset.body), 'B4 seguir (POST_ENGAGEMENT): sin destination_type y sin promoted_object — payload sin cambios');
  calls.length = 0;
  await metaAds.createBoost({ name: 'Histórico', pageId: 'p1', igUserId: 'ig1', igMediaId: 'm1', spendCents: 5000, days: 7, country: 'AR' });
  const adsetH = llamadaA('/adsets');
  ok(!('promoted_object' in adsetH.body) && !('destination_type' in adsetH.body), 'B4 histórico sin parámetros: payload sin cambios');
  calls.length = 0;
  const mapeoC = A.mapeoMeta('comprar');
  await metaAds.createBoost({
    name: 'Sin página', pageId: null, igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR',
    objective: mapeoC.campaignObjective, optimizationGoal: mapeoC.optimizationGoal,
    destinationType: mapeoC.destinationType, targeting: null, ctx: CTX_CLI,
  });
  const adsetSP = llamadaA('/adsets');
  ok(!('promoted_object' in adsetSP.body), 'B4 mensajes sin Página: no se fabrica un promoted_object (queda el rechazo de Meta, registrado entero)');
}

// B5 · El error de Meta, entero y por paso.
{
  calls.length = 0; modoError = 'conjunto';
  let err = null;
  try {
    await metaAds.createBoost({
      name: 'Falla conjunto', pageId: '999', igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR',
      objective: 'OUTCOME_ENGAGEMENT', optimizationGoal: 'CONVERSATIONS', destinationType: 'INSTAGRAM_DIRECT', targeting: null, ctx: CTX_CLI,
    });
  } catch (e) { err = e; }
  modoError = null;
  ok(!!err && err.paso === 'conjunto', 'B5 rechazo en el conjunto: el error lleva el paso');
  ok(!!err && err.metaError && err.metaError.code === 100 && err.metaError.subcode === 1885183, 'B5 el subcódigo de Meta sobrevive (antes se perdía en g())');
  ok(!!err && err.metaError && err.metaError.fbtrace_id === 'FBTRACE123', 'B5 el fbtrace_id sobrevive');
  const det = metaAds.detalleErrorMeta(err);
  ok(det.includes('paso conjunto') && det.includes('subcode 1885183') && det.includes('Invalid parameter') && det.includes('FBTRACE123'), 'B5 detalleErrorMeta: paso + subcode + mensaje + fbtrace en una línea');
  calls.length = 0; modoError = 'campana';
  let err2 = null;
  try {
    await metaAds.createBoost({ name: 'Falla campaña', pageId: '999', igUserId: 'igcli', igMediaId: 'm1', spendCents: 2000, days: 7, country: 'AR', ctx: CTX_CLI });
  } catch (e) { err2 = e; }
  modoError = null;
  ok(!!err2 && err2.paso === 'campaña', 'B5 rechazo en la campaña: paso «campaña»');
  ok(metaAds.detalleErrorMeta(new Error('boom')) === 'boom' && metaAds.detalleErrorMeta(null).length > 0, 'B5 detalleErrorMeta sin metaError: cae al mensaje, nunca vacío');
}

// ── §C · ads-audiencia: el ctx se propaga a los helpers ──────────
console.log('§C ads-audiencia (propagación del ctx)');
{
  const vistos = [];
  const metaMock = {
    searchInterestId: async (n, ctx) => { vistos.push(['interes', ctx]); return { id: '1', name: n }; },
    searchGeo: async (q, pais, ctx) => { vistos.push(['geo', ctx]); return { key: 'k1', name: q, latitude: -34.5, longitude: -58.4 }; },
    findLookalikeAudienceId: async (ctx) => { vistos.push(['look', ctx]); return 'LX1'; },
  };
  const p = A.propuestaDesdeFundamento(fund({ cta: 'comprar', ciudad: 'Palermo' }));
  const rt = await A.resolverTargeting(p.audiencia, p, metaMock, CTX_CLI);
  ok(vistos.length >= 2 && vistos.every((v) => v[1] === CTX_CLI), 'C1 resolverTargeting pasa el MISMO ctx a intereses, geo y lookalike');
  ok(rt.targeting.custom_audiences && rt.targeting.custom_audiences[0].id === 'LX1', 'C1 la lookalike resuelta con ctx entra al targeting');
  vistos.length = 0;
  await A.resolverTargeting(p.audiencia, p, metaMock);
  ok(vistos.every((v) => v[1] === undefined), 'C2 sin ctx: los helpers se llaman como siempre (undefined)');
}

// ── §D · ads-billetera: el error entero queda registrado ─────────
console.log('§D ads-billetera (registro del error)');
{
  const B = require(path.join(ROOT, 'ads-billetera.js'));
  const baseImp = { clienteId: 1, posteoId: 9, montoUSD: 20, zona: 'AR',
    env: { DESTACADO_BOOST_ENABLED: '1' }, adsConfigurado: true, paginaAutorizada: true,
    permisoAds: true, conversionARS: (m) => m * 1200 * 100, saldoCentsUSD: 10000, fecha: '2026-11-17',
    buscarDebito: () => null };
  const DETALLE = 'paso conjunto · code 100 · subcode 1885183 · Invalid parameter — ' + 'x'.repeat(320) + ' · fbtrace FBTRACE123';
  let recError = null, debitos = 0;
  const r = await B.impulsarConSaldo({ ...baseImp,
    crearAnuncio: async () => { throw new Error(DETALLE); },
    debitar: async () => { debitos++; return { ok: true, saldoNuevo: 0 }; },
    registrar: async (rec) => { if (rec.tipo === 'error') recError = rec; },
  });
  ok(r && !r.ok && r.motivo === 'anuncio_fallido', 'D1 rechazo de creación → motivo genérico anuncio_fallido (sin gasto)');
  ok(debitos === 0, 'D1 no se debitó nada');
  ok(!!recError && recError.tipo === 'error', 'D1 el registrar recibió el tipo error (antes no se llamaba: no quedaba fila)');
  ok(!!recError && recError.error.includes('subcode 1885183') && recError.error.length > 300, 'D1 el error registrado va ENTERO (>300, con subcódigo)');
  let recExito = null;
  const r2 = await B.impulsarConSaldo({ ...baseImp,
    crearAnuncio: async () => ({ ok: true, anuncioId: 'camp_1', campaignId: 'camp_1', adsetId: 'a1', adId: 'd1' }),
    debitar: async () => ({ ok: true, saldoNuevo: 8000 }),
    registrar: async (rec) => { recExito = rec; },
  });
  ok(r2 && r2.ok && recExito && recExito.tipo === 'exito', 'D2 el camino de éxito no cambió (registra exito)');
}

// ── §E · boot aislado del árbol final ─────────────────────────────
console.log('§E boot aislado');
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ads-creacion-'));
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
    ok(!!version && version.ok === true, 'E1 el servidor del árbol final levanta y responde /api/version', bootLog.slice(-300));
    ok(!!version && String(version.build || '').includes('v1154'), 'E2 el build servido es el de la base (v1154, sin estampar)');
  } finally {
    const pid = child.pid;
    try { process.kill(pid, 'SIGTERM'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 1200));
    let vivo = true;
    try { process.kill(pid, 0); } catch (e) { vivo = false; }
    ok(!vivo, 'E3 proceso del boot muerto por su PID exacto (' + pid + ')');
    let puertoLibre = false;
    try { await REAL_FETCH(`http://127.0.0.1:${PORT}/api/version`); } catch (e) { puertoLibre = true; }
    ok(puertoLibre, 'E4 el puerto ' + PORT + ' quedó libre');
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

console.log(`\nRESULTADO: ${total - fails}/${total} ok · ${fails} mal`);
process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ERROR FATAL:', e); process.exit(2); });
