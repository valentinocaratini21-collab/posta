/* LOTE PRECIO-ARS — decisiones de Valentino 2026-11-18 22:38–22:41:
   (1) el selector de países cambia la bandera de Europa por la de España
       (el selector es una lista de países; España es el mercado europeo);
   (2) Argentina muestra y cobra el plan único EN PESOS: ARS $324.000/mes
       FIJOS (eligió fijo sobre indexado al MEP; USD 199 × MEP 1.629 del
       2026-11-18 ≈ 324.131 → 324.000), por Mercado Pago. El resto de los
       países queda byte-idéntico: USD 199 por Stripe.
   Pines:
   §S estáticos — la constante única en config/plans.js y sus consumidores;
      el selector EU→ES en las 4 superficies (landing ES/EN, meta del
      servidor, paywall); el .pc-founder dinámico por país (la vista AR no
      se contradice: nunca US$199 junto a la tarjeta en pesos).
   §B boot real del servidor del árbol (DATA_DIR temporal, MP interceptado
      por un stub de red que registra el body): la API sirve el plan AR en
      pesos y el subscribe de MP cobra EXACTAMENTE 324000 ARS — el mismo
      número que la vidriera muestra, leído de la misma constante.
   Control: contra la base prístina la suite falla exactamente en los pines
   del lote (los invariantes — PLAN_UNICO USD, tiers AR/US/UY — pasan). */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = __dirname;
let ok = 0, mal = 0;
function t(nombre, cond, extra) {
  if (cond) { ok++; }
  else { mal++; console.log('  MAL:', nombre, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}
function cuenta(s, x) { return s.split(x).length - 1; }

const plans = require(path.join(ROOT, 'config/plans.js'));
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appjs = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const en = fs.readFileSync(path.join(ROOT, 'public/en/index.html'), 'utf8');
const chunk = fs.readFileSync(path.join(ROOT, 'public/chunk-ajustes.js'), 'utf8');

/* ---------- §S1 · la constante y el plan por país (config/plans.js) ---------- */
t('S1 PRECIO_ARS_FIJO exportado = 324000', plans.PRECIO_ARS_FIJO === 324000, plans.PRECIO_ARS_FIJO);
const unicoAR = typeof plans.getPlanUnico === 'function' ? plans.getPlanUnico('AR') : {};
t('S2 único AR: id posty, 324000 ARS', unicoAR.id === 'posty' && unicoAR.price === 324000 && unicoAR.currency === 'ARS', unicoAR);
t('S2b único AR: es el plan completo (features/tagline del único USD)',
  unicoAR.name === 'Posty' && unicoAR.tagline === plans.PLAN_UNICO.tagline
  && JSON.stringify(unicoAR.features) === JSON.stringify(plans.PLAN_UNICO.features));
for (const c of ['US', 'ES', 'BR', 'MX', 'UY', 'GB']) {
  const u = typeof plans.getPlanUnico === 'function' ? plans.getPlanUnico(c) : {};
  t(`S3 único ${c}: USD 199 intacto`, u.price === 199 && u.currency === 'USD', u);
}
t('S4 PLAN_UNICO sin tocar: 199 USD', plans.PLAN_UNICO.price === 199 && plans.PLAN_UNICO.currency === 'USD');
t('S5 formatPrice(único AR) = «$324.000» (lo que muestra la vidriera)', plans.formatPrice(unicoAR) === '$324.000', plans.formatPrice(unicoAR));
t('S5b formatPrice(único USD) = «$199»', plans.formatPrice(plans.PLAN_UNICO) === '$199', plans.formatPrice(plans.PLAN_UNICO));
t('S6 catálogos internos intactos: AR esencial 199999 ARS · US 199/299/399 · UY 4990 · EU 179 EUR',
  plans.getPlans('AR').esencial.price === 199999 && plans.getPlans('US').esencial.price === 199
  && plans.getPlans('US').pro.price === 299 && plans.getPlans('US').total.price === 399
  && plans.getPlans('UY').esencial.price === 4990 && plans.getPlans('EU').esencial.price === 179);

/* ---------- §S2 · el selector: España entra, Europa sale ---------- */
t('S7 SELECTOR_COUNTRIES exacto con ES y sin EU',
  JSON.stringify(plans.SELECTOR_COUNTRIES) === JSON.stringify(['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'ES']),
  plans.SELECTOR_COUNTRIES);
const metaES = plans.COUNTRY_META.ES || {};
t('S8 COUNTRY_META.ES: España/Spain, EUR, riel stripe, bandera 🇪🇸',
  metaES.name_es === 'España' && metaES.name_en === 'Spain' && metaES.currency === 'EUR'
  && metaES.rail === 'stripe' && metaES.flag === '\u{1F1EA}\u{1F1F8}', metaES);
t('S9 España hereda el catálogo EUR: getPlans(ES) = PLANS_EU · getRail(ES) = stripe',
  plans.getPlans('ES').esencial.price === 179 && plans.getPlans('ES').esencial.currency === 'EUR' && plans.getRail('ES') === 'stripe');
t('S10 EU legado sigue resolviendo (selecciones guardadas): COUNTRY_META.EU existe y getPlans(EU) = PLANS_EU',
  !!plans.COUNTRY_META.EU && plans.getPlans('EU').esencial.price === 179);
t('S11 app.js: PZ_PAISES exacto con ES y sin EU',
  appjs.includes("const PZ_PAISES = ['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'ES'];"));
const metaBlock = appjs.slice(appjs.indexOf('const PZ_PAIS_META'), appjs.indexOf('function pzPaisGuardado'));
t('S12 app.js: meta ES = España con su bandera; «Eurozona» fuera del meta',
  metaBlock.includes("ES: { flag: '\\u{1F1EA}\\u{1F1F8}', nombre: 'España'") && !metaBlock.includes('Eurozona') && !metaBlock.includes('EU:'));
t('S13 app.js: país guardado «EU» migra a «ES» al leer', appjs.includes("if (g === 'EU') g = 'ES';"));
t('S14 EN: un solo botón ES, ningún botón EU, bandera 🇪🇸 sí y 🇪🇺 no',
  cuenta(en, 'data-country="ES"') === 1 && cuenta(en, 'data-country="EU"') === 0
  && en.includes('\u{1F1EA}\u{1F1F8}') && !en.includes('\u{1F1EA}\u{1F1FA}'));
t('S15 EN: PZ_PAISES_EN con ES y sin EU; meta EN de España',
  en.includes("var PZ_PAISES_EN = ['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'ES'];")
  && en.includes("ES: { nota: 'Pay by card.' }") && !en.includes("EU: { nota:"));
t('S16 EN: init migra «EU» guardado a «ES»', en.includes("g === 'EU') g = 'ES'"));
t('S17 paywall: PZ_PAY_STRIPE incluye ES y «EU» guardado se normaliza a «ES»',
  chunk.includes("'EU', 'ES', 'BR'") && chunk.includes("pzPayCountry === 'EU') pzPayCountry = 'ES'"));

/* ---------- §S3 · la vista AR no se contradice (fundador en pesos) ---------- */
t('S18 ES: el .pc-founder de la plantilla sale del plan (dinámico)',
  appjs.includes('conservan los ${lpFounderAmt} para siempre')
  && appjs.includes("lpEsencial.currency === 'ARS'"));
t('S19 ES: switchPlansCountry actualiza el .pc-founder con el precio del país',
  appjs.includes("querySelector('#planes .pc-founder')") && appjs.includes("planes[0].currency === 'ARS' ? planes[0].price_label : 'US$199'"));
t('S20 EN: la vista inicial (US) conserva su .pc-founder US$199 y pzApplyEN lo actualiza por país',
  en.includes('join now and keep US$199 forever') && en.includes("querySelector('.pc-founder')")
  && en.includes("esc.currency === 'ARS' ? pzFmtEN(esc) : 'US$199'"));

/* ---------- §S4 · el servidor: display y cobro leen la misma fuente ---------- */
t('S21 server: require trae getPlanUnico', srv.includes('getPlanUnico'));
t('S22 server: /api/billing/plans?unico sirve el plan del país (getPlanUnico + currency del plan)',
  srv.includes('const unico = getPlanUnico(country);') && srv.includes('currency: unico.currency')
  && srv.includes("desde: country === 'AR' ? formatPrice(unico) : 'USD 199'"));
t('S23 server: allowlist de planes incluye ES (EU legado queda)',
  srv.includes("['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'EU', 'ES', 'CA']"));
t('S24 server: subscribe cobra el único AR por MP desde getPlanUnico(\'AR\')',
  srv.includes("const plan = esUnico ? getPlanUnico('AR') : plans[planId];")
  && srv.includes("esUnico && !(String(country || '').toUpperCase() === 'AR' && agente === 'posty')"));
t('S25 server: el rechazo del único fuera de AR conserva su texto (Stripe USD 199)',
  srv.includes('El plan Posty se paga con tarjeta en USD 199: volvé a Mi plan y tocá Suscribirse.'));
t('S26 server: allowlist Stripe suma ES sin tocar el camino del único USD',
  srv.includes("['US', 'GB', 'EU', 'ES', 'BR', 'MX', 'CL', 'CO', 'PE']") && srv.includes('const plan = unicoStripe ? { ...PLAN_UNICO } : getPlans(stripeCountry)[planId];'));
t('S27 paywall: el único va por MP SOLO en AR (isStripe = país !== AR)',
  chunk.includes("const isStripe = pzUnico ? pzPayCountry !== 'AR' : PZ_PAY_STRIPE.includes(pzPayCountry);"));

/* ---------- §B · boot real: la API y el cobro, punta a punta ---------- */
const NO_BOOT = process.env.PRECIO_ARS_NO_BOOT === '1';
if (NO_BOOT) {
  console.log(`PRECIO-ARS (solo estático): ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
}
const PORT = 18771;
const BASE = `http://127.0.0.1:${PORT}`;
async function apiH(cookie, method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}
const cookieDe = (headers) => {
  const cs = headers.getSetCookie ? headers.getSetCookie() : [];
  return cs.map((c) => c.split(';')[0]).join('; ');
};

(async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'precio-ars-boot-'));
  const stubPath = path.join(TMP, 'mp-stub.js');
  const stubLog = path.join(TMP, 'mp-log.jsonl');
  fs.writeFileSync(stubPath, `
const fs = require('fs');
const origFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://api.mercadopago.com')) {
    let body = null;
    try { body = opts.body ? JSON.parse(opts.body) : null; } catch (e) {}
    try { fs.appendFileSync(process.env.MP_STUB_LOG || '/dev/null', JSON.stringify({ url: u, method: opts.method || 'GET', body }) + '\\n'); } catch (e) {}
    return new Response(JSON.stringify({ id: 'pre_stub_123', init_point: 'https://mp.stub/checkout?preapproval_id=pre_stub_123', status: 'pending' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return origFetch(url, opts);
};
`);
  const srvProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, DATA_DIR: TMP, PORT: String(PORT), SESSION_SECRET: 'test-secret',
      ADMIN_TOKEN: 'test-admin', OPENAI_API_KEY: '', MP_ACCESS_TOKEN: 'test-mp-token-1234567890',
      MP_STUB_LOG: stubLog, NODE_OPTIONS: `--require ${stubPath}`,
      NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srvProc.stdout.on('data', (d) => { srvLog += d; });
  srvProc.stderr.on('data', (d) => { srvLog += d; });
  const leerStub = () => {
    try { return fs.readFileSync(stubLog, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
    catch (e) { return []; }
  };
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { const r = await fetch(`${BASE}/api/version`); up = r.ok; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    t('B0 boot levanta', up, srvLog.slice(-400));
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    t('B0b /api/version = BUILD del árbol (v1184; bump del liberador aplicado)', ver.build === '20261105-v1184', ver.build);

    const pAr = await apiH('', 'GET', '/api/billing/plans?country=AR&unico=1');
    const planAr = pAr.data && pAr.data.plans && pAr.data.plans[0];
    t('B1 AR ?unico=1: UN plan, 324000 ARS, label $324.000, riel MP, moneda ARS',
      pAr.status === 200 && pAr.data.plans.length === 1 && planAr.id === 'posty' && planAr.price === 324000
      && planAr.currency === 'ARS' && planAr.price_label === '$324.000' && pAr.data.currency === 'ARS'
      && pAr.data.rail === 'mercadopago', pAr.data);
    t('B1b AR: el ancla habla en pesos (cm $1.000.000 intacto, desde = $324.000)',
      pAr.data.anchor && pAr.data.anchor.cm === 'desde $1.000.000 por mes' && pAr.data.anchor.desde === '$324.000', pAr.data && pAr.data.anchor);
    const codes = (pAr.data.countries || []).map((c) => c.code);
    const metaEsSrv = (pAr.data.countries || []).find((c) => c.code === 'ES');
    t('B1c la API sirve el selector con España y sin Europa',
      codes.includes('ES') && !codes.includes('EU') && metaEsSrv && metaEsSrv.name_es === 'España' && metaEsSrv.flag === '\u{1F1EA}\u{1F1F8}', codes);
    const pUs = await apiH('', 'GET', '/api/billing/plans?country=US&unico=1');
    t('B2 US ?unico=1: USD 199 como siempre', pUs.status === 200 && pUs.data.plans[0].price === 199 && pUs.data.currency === 'USD' && pUs.data.rail === 'stripe', pUs.data);
    const pEs = await apiH('', 'GET', '/api/billing/plans?country=ES&unico=1');
    t('B3 ES ?unico=1: país ES válido, USD 199 por Stripe', pEs.status === 200 && pEs.data.country === 'ES' && pEs.data.plans[0].price === 199 && pEs.data.rail === 'stripe', pEs.data);
    const pEu = await apiH('', 'GET', '/api/billing/plans?country=EU&unico=1');
    t('B4 EU legado ?unico=1: sigue resolviendo USD 199', pEu.status === 200 && pEu.data.plans[0].price === 199, pEu.data);
    const pBr = await apiH('', 'GET', '/api/billing/plans?country=BR&unico=1');
    t('B5 BR ?unico=1: USD 199 sin cambios', pBr.status === 200 && pBr.data.plans[0].price === 199 && pBr.data.currency === 'USD', pBr.data);
    const pSin = await apiH('', 'GET', '/api/billing/plans?country=AR');
    t('B6 AR sin unico: el catálogo interno de 3 tiers sigue (esencial 199999)',
      pSin.status === 200 && pSin.data.plans.length === 3 && pSin.data.plans.find((p) => p.id === 'esencial').price === 199999, pSin.data && pSin.data.plans.length);

    // Usuario 1: cobra el único AR por MP.
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'precio-ars@example.com', password: 'test1234', business_name: 'Precio ARS Test' }),
    });
    const ck = cookieDe(rr.headers);
    t('B7 registro con sesión', (rr.status === 200 || rr.status === 201) && ck.length > 0, rr.status);
    const me = await apiH(ck, 'GET', '/api/auth/me');
    const uid = me.data && me.data.user && me.data.user.id;
    const sub = await apiH(ck, 'POST', '/api/billing/subscribe', { plan: 'posty', country: 'AR', payer_email: 'precio-ars@example.com', agente: 'posty' });
    t('B8 subscribe único AR: 200 con init_point de MP', sub.status === 200 && String(sub.data && sub.data.init_point || '').includes('mp.stub'), sub.data);
    const calls = leerStub().filter((c) => c.method === 'POST' && c.url.endsWith('/preapproval'));
    const body = calls.length ? calls[calls.length - 1].body : null;
    t('B9 EL COBRO: MP recibe transaction_amount 324000 ARS (el mismo número de la vidriera)',
      !!body && body.auto_recurring && body.auto_recurring.transaction_amount === 324000
      && body.auto_recurring.currency_id === 'ARS', body);
    t('B9b la referencia identifica el plan único: <userId>:posty:posty',
      !!body && body.external_reference === `${uid}:posty:posty`, body && body.external_reference);
    let dbOk = false, dbExtra = null;
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(path.join(TMP, 'posta.db'), { readOnly: true });
      const row = db.prepare('SELECT mp_base_amount, mp_preapproval_id FROM users WHERE id = ?').get(uid);
      dbOk = !!row && Number(row.mp_base_amount) === 324000 && row.mp_preapproval_id === 'pre_stub_123';
      dbExtra = row;
      db.close();
    } catch (e) { dbExtra = e.message; }
    t('B10 la base guarda la base fundador en pesos: mp_base_amount = 324000', dbOk, dbExtra);

    // Usuario 2: el único fuera de AR sigue rechazado en MP; el tier AR sigue cobrando su precio.
    const rr2 = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'precio-ars2@example.com', password: 'test1234', business_name: 'Precio ARS Test 2' }),
    });
    const ck2 = cookieDe(rr2.headers);
    const subUy = await apiH(ck2, 'POST', '/api/billing/subscribe', { plan: 'posty', country: 'UY', payer_email: 'precio-ars2@example.com', agente: 'posty' });
    t('B11 subscribe único UY: rechazado como hoy (Stripe USD 199)', subUy.status === 400 && /tarjeta en USD 199/.test(String(subUy.data && subUy.data.error || '')), subUy.data);
    const subTier = await apiH(ck2, 'POST', '/api/billing/subscribe', { plan: 'esencial', country: 'AR', payer_email: 'precio-ars2@example.com', agente: 'posty' });
    const calls2 = leerStub().filter((c) => c.method === 'POST' && c.url.endsWith('/preapproval'));
    const body2 = calls2.length ? calls2[calls2.length - 1].body : null;
    t('B12 subscribe tier AR: intacto, cobra 199999 ARS',
      subTier.status === 200 && !!body2 && body2.auto_recurring.transaction_amount === 199999 && body2.auto_recurring.currency_id === 'ARS',
      { status: subTier.status, body: body2 });

    // Las superficies servidas por ESTE árbol traen el selector y la regla nuevos.
    const appServida = await (await fetch(`${BASE}/app.js`)).text();
    t('B13 app.js servido: selector con ES', appServida.includes("const PZ_PAISES = ['US', 'AR', 'BR', 'MX', 'CL', 'CO', 'PE', 'UY', 'GB', 'ES'];"));
    const chunkServido = await (await fetch(`${BASE}/chunk-ajustes.js`)).text();
    t('B14 chunk-ajustes servido: el único AR va por MP', chunkServido.includes("pzPayCountry !== 'AR'"));
  } catch (e) {
    t('boot sin excepciones', false, e.message);
  } finally {
    try { srvProc.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  }
  console.log(`PRECIO-ARS: ${ok} ok · ${mal} mal`);
  process.exit(mal ? 1 : 0);
})();
