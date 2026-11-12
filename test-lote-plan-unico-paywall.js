#!/usr/bin/env node
// test-lote-plan-unico-paywall.js — LOTE PLAN-ÚNICO-PAYWALL (v977).
// La pantalla del plan al vencer la prueba ofrece EL plan único (Posty,
// USD 199) en vez del catálogo viejo de 3 tiers:
//  §U Unit sin boot: getPlan('posty') con sus límites; el catálogo de
//     Stripe (ensureCatalog) crea el precio del plan único bajo
//     posty_us_posty_monthly (USD 199); planIdFromLookupKey /
//     planIdFromSubscription reconocen 'posty'; el precio fundador del
//     plan único se resuelve; applySubscription ACTIVA users.plan='posty'.
//  §C Cliente (VM sobre public/app.js): showExpiredModal y
//     trialExpiredBannerHTML piden ?unico=1 con el país guardado, rinden
//     UNA tarjeta USD 199 con textos ES y EN; el listener de
//     visibilitychange re-consulta la sesión y muestra el modal si la
//     prueba venció con la app abierta.
//  §H HTTP (boot sandbox, DATA_DIR en /tmp): /api/billing/plans con y sin
//     unico; el checkout del plan único llega al riel Stripe para AR y US
//     (hasta el gate de configuración, sin credenciales); la guarda de MP
//     rechaza el plan único en /api/billing/subscribe; las 4 rutas de Ads
//     dan 402 trial_expired con la prueba vencida y no con la vigente;
//     /api/auth/me marca expired con trial_ends_at=0; el invitado vencido
//     queda cortado igual.
// Uso: node test-lote-plan-unico-paywall.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0, total = 0;
const ok = (cond, msg, extra) => {
  total++;
  if (cond) console.log('  ✓', msg);
  else { fails++; console.error('  ✗', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
};
const DAY = 24 * 3600 * 1000;

// ───────────────────────── §U · Unit ─────────────────────────
console.log('§U unit (plans + stripe-billing)');
{
  const plans = require('./config/plans');
  const pu = plans.getPlan('posty', 'AR');
  ok(pu && pu.id === 'posty' && pu.price === 199 && pu.currency === 'USD', 'U1 getPlan(posty) = USD 199', pu);
  ok(pu && pu.postsPerWeek === 7 && pu.reelsPerWeek === 2 && pu.storiesPerWeek === 7, 'U1 límites del plan único (7 posteos, 2 reels, 7 historias)', pu);
  const es = plans.getPlan('esencial', 'AR');
  ok(es && es.price === 199999 && es.currency === 'ARS', 'U1 el tier esencial AR sigue intacto (facturación interna)', es);
  const fr = plans.getPlan('free', 'US');
  ok(fr && fr.price === 0 && fr.id === 'free', 'U1 getPlan(free) intacto', fr);

  const sb = require('./stripe-billing');
  ok(sb.planIdFromLookupKey('posty_us_posty_monthly') === 'posty', 'U2 lookup posty_us_posty_monthly → posty');
  ok(sb.planIdFromLookupKey('posty_us_posty_founder_9900') === 'posty', 'U2 lookup founder del único → posty');
  ok(sb.planIdFromLookupKey('posty_us_total_monthly') === 'total', 'U2 lookup de tiers intacto');
  ok(sb.planIdFromSubscription({ metadata: { plan_id: 'posty', user_id: '1' } }) === 'posty', 'U2 planIdFromSubscription acepta posty');
  ok(sb.planIdFromSubscription({ metadata: { plan_id: 'pro', user_id: '1' } }) === 'pro', 'U2 planIdFromSubscription sigue con tiers');

  // Cliente Stripe falso: captura productos/precios creados.
  const created = { products: [], prices: [] };
  const fakeClient = {
    prices: {
      list: async ({ lookup_keys }) => {
        const lk = (lookup_keys || [])[0];
        const found = created.prices.find((p) => p.lookup_key === lk);
        return { data: found ? [found] : [] };
      },
      create: async (params) => { const p = { id: 'price_' + (created.prices.length + 1), ...params }; created.prices.push(p); return p; },
    },
    products: {
      create: async (params) => { const p = { id: 'prod_' + (created.products.length + 1), ...params }; created.products.push(p); return p; },
    },
  };
  (async () => {
    try {
      sb._clearPriceCache();
      const cat = await sb.ensureCatalog(fakeClient);
      ok(cat && cat.posty && cat.esencial && cat.pro && cat.total, 'U3 ensureCatalog resuelve los 3 tiers + el plan único', Object.keys(cat || {}));
      const pp = created.prices.find((p) => p.lookup_key === 'posty_us_posty_monthly');
      ok(!!pp, 'U3 se creó el precio posty_us_posty_monthly', created.prices.map((p) => p.lookup_key));
      ok(pp && pp.unit_amount === 19900 && pp.currency === 'usd', 'U3 el precio del único es USD 199.00', pp && { a: pp.unit_amount, c: pp.currency });
      ok(pp && pp.metadata && pp.metadata.plan_id === 'posty', 'U3 metadata plan_id=posty en el precio', pp && pp.metadata);
      const prod = created.products.find((p) => p.id === (pp && pp.product));
      ok(prod && prod.metadata && prod.metadata.plan_id === 'posty', 'U3 el producto del único lleva plan_id=posty', prod && prod.metadata);

      // Precio fundador del plan único (un fundador 'posty' re-suscribe a su monto).
      const fid = await sb.ensureFounderPrice(fakeClient, plans.PLAN_UNICO, 99);
      const fp = created.prices.find((p) => p.lookup_key === 'posty_us_posty_founder_9900');
      ok(!!fid && !!fp && fp.unit_amount === 9900, 'U4 precio fundador del único: lookup founder + monto del alta', { fid, fp: fp && fp.unit_amount });

      const params = sb.buildCheckoutParams({ priceId: 'price_x', plan: plans.PLAN_UNICO, baseUrl: 'http://x', trialEndSec: null, user: { id: 7, email: 'a@b.c' } });
      ok(params.metadata.plan_id === 'posty' && params.subscription_data.metadata.plan_id === 'posty', 'U5 buildCheckoutParams: plan_id=posty en sesión y suscripción', params.metadata);

      // Activación por webhook (applySubscription): la suscripción del plan
      // único activa users.plan='posty' y dispara onActivated con 'posty'.
      const tmpU = fs.mkdtempSync(path.join(os.tmpdir(), 'paywall-unit-'));
      const dbU = new DatabaseSync(path.join(tmpU, 'u.db'));
      dbU.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, plan TEXT, plan_status TEXT, stripe_subscription_id TEXT, stripe_customer_id TEXT)');
      dbU.prepare("INSERT INTO users (id, plan, plan_status) VALUES (1, 'esencial', 'trial')").run();
      let hookPlan = null;
      sb.applySubscription(dbU, {
        id: 'sub_unico', status: 'active', customer: 'cus_1',
        metadata: { user_id: '1', plan_id: 'posty' },
        items: { data: [{ price: { lookup_key: 'posty_us_posty_monthly' } }] },
      }, { onActivated: (uid, planId) => { hookPlan = planId; } });
      const rowU = dbU.prepare('SELECT plan, plan_status FROM users WHERE id = 1').get();
      ok(rowU && rowU.plan === 'posty' && rowU.plan_status === 'active', 'U6 applySubscription activa users.plan=posty', rowU);
      ok(hookPlan === 'posty', 'U6 onActivated recibe planId posty', hookPlan);
      dbU.close();
      fs.rmSync(tmpU, { recursive: true, force: true });
    } catch (e) {
      ok(false, 'U excepción en unit de Stripe: ' + (e && e.message), String(e && e.stack || e).slice(0, 300));
    }
  })();
}

// ───────────────────────── §C · Cliente VM ─────────────────────────
console.log('§C cliente (VM app.js: modal + banner + primer plano)');
const APP = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
{
  const a = APP.indexOf('async function showExpiredModal() {');
  const b = APP.indexOf('/* ---------- SCHEDULE:', a);
  ok(a > 0 && b > a, 'C0 tramo modal/banner delimitado en app.js');
  const TRAMO = APP.slice(a, b);
  const UNICO = { plans: [{ id: 'posty', name: 'Posty', price: 199, currency: 'USD', price_label: '$199', postsPerWeek: 7, reelsPerWeek: 2, storiesPerWeek: 7, highlighted: true }] };
  const mkSandbox = (lang, pais) => {
    const state = { urls: [], appended: [], handlers: {} };
    const mkEl = () => {
      const el = { innerHTML: '', id: '', className: '',
        querySelector: () => ({ onclick: null }),
        querySelectorAll: (sel) => {
          if (sel !== '[data-exp-plan]') return [];
          return [...el.innerHTML.matchAll(/data-exp-plan="([^"]+)"/g)].map((m) => ({ dataset: { expPlan: m[1] }, onclick: null }));
        },
        remove: () => {} };
      return el;
    };
    const ME = { lang, trial_expired: true, plan_status: 'trial' };
    const sbx = {
      ME, IS_NATIVE: false,
      api: { get: async (url) => { state.urls.push(url); return JSON.parse(JSON.stringify(UNICO)); }, post: async () => ({}) },
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      pzIc: (n) => '<svg data-ic="' + n + '"></svg>',
      trackOnce: () => {},
      pzPaisGuardado: () => pais,
      sessionStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = v; } },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      location: { hash: '#/app/inicio' },
      document: {
        visibilityState: 'visible',
        getElementById: () => null,
        createElement: () => mkEl(),
        body: { appendChild: (el) => { state.appended.push(el); } },
        addEventListener: (ev, fn) => { state.handlers[ev] = fn; },
      },
      refreshSession: async () => {},
    };
    vm.createContext(sbx);
    vm.runInContext(TRAMO, sbx);
    return { sbx, state, ME };
  };

  (async () => {
    try {
      // ES · país AR
      const es = mkSandbox('es', 'AR');
      await es.sbx.showExpiredModal();
      ok(es.state.urls.some((u) => u.includes('unico=1') && u.includes('country=AR')), 'C1 modal pide el plan único con país AR', es.state.urls);
      const hEs = es.state.appended.length ? es.state.appended[0].innerHTML : '';
      ok(es.state.appended.length === 1, 'C1 el modal se monta una vez');
      ok(hEs.includes('Se terminó tu prueba'), 'C1 modal ES: título');
      ok(hEs.includes('$199/mes') && hEs.includes('USD 7 por día'), 'C1 modal ES: USD 199/mes y por-día en USD', hEs.slice(0, 400));
      ok(hEs.includes('7 posteos + 2 reels + 7 historias por semana'), 'C1 modal ES: mix del plan único');
      ok((hEs.match(/data-exp-plan=/g) || []).length === 1 && hEs.includes('data-exp-plan="posty"'), 'C1 modal: UNA sola tarjeta, la del plan único');
      ok(!hEs.includes('EL MÁS ELEGIDO') && !hEs.includes('Esencial'), 'C1 modal: sin etiqueta de catálogo ni tiers viejos');
      // EN · país US
      const en = mkSandbox('en', 'US');
      await en.sbx.showExpiredModal();
      const hEn = en.state.appended.length ? en.state.appended[0].innerHTML : '';
      ok(en.state.urls.some((u) => u.includes('unico=1') && u.includes('country=US')), 'C2 modal pide el plan único con país US', en.state.urls);
      ok(hEn.includes('Your trial ended') && hEn.includes('$199/mo') && hEn.includes('$7 per day'), 'C2 modal EN: título, /mo y por-día', hEn.slice(0, 400));
      ok(hEn.includes('7 posts + 2 reels + 7 stories per week') && hEn.includes('Choose'), 'C2 modal EN: mix y botón en inglés');
      // Banner ES / EN
      const bEs = mkSandbox('es', 'AR');
      const htmlBEs = await bEs.sbx.trialExpiredBannerHTML();
      ok(htmlBEs.includes('Tu prueba terminó') && htmlBEs.includes('USD 7/día') && htmlBEs.includes('pzTrialBanner'), 'C3 banner ES: plan único en USD por día', htmlBEs);
      ok(bEs.state.urls.some((u) => u.includes('unico=1')), 'C3 banner pide ?unico=1', bEs.state.urls);
      const bEn = mkSandbox('en', 'US');
      const htmlBEn = await bEn.sbx.trialExpiredBannerHTML();
      ok(htmlBEn.includes('Your trial ended') && htmlBEn.includes('$7/day'), 'C4 banner EN: texto y por-día en inglés', htmlBEn);
      // Banner sin vencimiento: nada
      const bNo = mkSandbox('es', 'AR');
      bNo.ME.trial_expired = false;
      ok((await bNo.sbx.trialExpiredBannerHTML()) === '', 'C5 banner: sin vencimiento no se muestra');
      // Primer plano: vence con la app abierta → refresh + modal
      const fg = mkSandbox('es', 'AR');
      fg.ME.trial_expired = false;
      fg.sbx.refreshSession = async () => { fg.ME.trial_expired = true; };
      // El sandbox VM tiene su propio refreshSession (el del tramo no lo
      // define: lo toma del global). Lo pisamos vía el contexto:
      vm.runInContext('refreshSession = async () => { ME.trial_expired = true; };', fg.sbx);
      ok(typeof fg.state.handlers.visibilitychange === 'function', 'C6 listener de visibilitychange registrado');
      fg.state.handlers.visibilitychange();
      await new Promise((r) => setTimeout(r, 120));
      ok(fg.state.appended.length === 1, 'C6 al volver a primer plano con la prueba vencida, salta el modal', fg.state.appended.length);
    } catch (e) {
      ok(false, 'C excepción en VM: ' + (e && e.message), String(e && e.stack || e).slice(0, 300));
    }
  })();
}

// ───────────────────────── §H · HTTP boot ─────────────────────────
console.log('§H http (boot sandbox)');
const PORT = 18778;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function apiH(cookie, method, p, body) {
  const rr = await fetch(BASE + p, {
    method, headers: { Cookie: cookie || '', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await rr.json(); } catch (e) {}
  return { status: rr.status, data, headers: rr.headers };
}
const cookieDe = (headers) => {
  const cs = headers.getSetCookie ? headers.getSetCookie() : [];
  return cs.map((c) => c.split(';')[0]).join('; ');
};

(async () => {
  // Las secciones §U/§C asíncronas terminan antes del veredicto final:
  // este bloque espera a que drenen (son rápidas y sin red).
  await new Promise((r) => setTimeout(r, 300));
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'paywall-boot-'));
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, DATA_DIR: TMP, PORT: String(PORT), SESSION_SECRET: 'test-secret', ADMIN_TOKEN: 'test-admin', OPENAI_API_KEY: '', NODE_PATH: process.env.NODE_PATH || '/home/hatch/workspace/posta/node_modules' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });
  try {
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      try { const r = await fetch(`${BASE}/api/version`); up = r.ok; } catch (e) {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    ok(up, 'H0 boot levanta');
    const ver = await (await fetch(`${BASE}/api/version`)).json();
    ok(ver.build === '20261105-v977', `H0 /api/version v977 (vino ${ver.build})`);

    const pSin = await apiH('', 'GET', '/api/billing/plans?country=AR');
    ok(pSin.status === 200 && pSin.data.plans.length === 3, 'H1 sin unico: el catálogo de 3 tiers sigue (facturación interna)', pSin.data && pSin.data.plans.length);
    const pAr = await apiH('', 'GET', '/api/billing/plans?country=AR&unico=1');
    ok(pAr.status === 200 && pAr.data.plans.length === 1 && pAr.data.plans[0].id === 'posty' && pAr.data.plans[0].price === 199 && pAr.data.currency === 'USD', 'H2 AR ?unico=1: un solo plan, USD 199', pAr.data && pAr.data.plans);
    const pUs = await apiH('', 'GET', '/api/billing/plans?country=US&unico=1');
    ok(pUs.status === 200 && pUs.data.plans.length === 1 && pUs.data.plans[0].price === 199, 'H3 US ?unico=1: un solo plan, USD 199');

    // Usuario fresco
    const rr = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'paywall@example.com', password: 'test1234', business_name: 'Paywall Test' }),
    });
    const ckF = cookieDe(rr.headers);
    ok((rr.status === 200 || rr.status === 201) && ckF.length > 0, 'H4 registro fresco con sesión');
    const meF = await apiH(ckF, 'GET', '/api/auth/me');
    ok(meF.data && meF.data.user && meF.data.user.trial_expired === false && meF.data.user.trial_days_left === 3, 'H4 fresco: no vencido, 3 días', meF.data && meF.data.user);

    const cgF = await apiH(ckF, 'POST', '/api/ads/billetera/cargar', { montoUSD: 50 });
    ok(cgF.status !== 402, `H5 fresco cargar: NO es 402 (vino ${cgF.status})`, cgF.data);
    const imF = await apiH(ckF, 'POST', '/api/ads/billetera/impulsar', { posteoId: 1, montoUSD: 50 });
    ok(imF.status === 403, `H5 fresco impulsar: 403 flag (vino ${imF.status})`, imF.data);
    const deF = await apiH(ckF, 'POST', '/api/destacado/impulsar', { postId: 1, montoUSD: 20 });
    ok(deF.status === 403, `H5 fresco destacado: 403 flag (vino ${deF.status})`, deF.data);
    const boF = await apiH(ckF, 'POST', '/api/ads/boost', { post_id: 99999, budget_cents: 2000 });
    ok(boF.status !== 402, `H5 fresco boost: NO es 402 (vino ${boF.status})`, boF.data);

    // Checkout del plan único: riel Stripe para AR y US (hasta el gate de config).
    const coAr = await apiH(ckF, 'POST', '/api/billing/stripe/checkout', { plan: 'posty', country: 'AR', agente: 'posty' });
    ok(coAr.status === 400 && /not configured/i.test(String(coAr.data && coAr.data.error || '')), 'H6 checkout único AR: llega al gate de Stripe (riel correcto)', coAr.data);
    const coUs = await apiH(ckF, 'POST', '/api/billing/stripe/checkout', { plan: 'posty', country: 'US', agente: 'posty' });
    ok(coUs.status === 400 && /not configured/i.test(String(coUs.data && coUs.data.error || '')), 'H7 checkout único US: llega al gate de Stripe', coUs.data);
    // Guarda MP: el plan único NO se cobra en pesos.
    const subU = await apiH(ckF, 'POST', '/api/billing/subscribe', { plan: 'posty', country: 'AR', payer_email: 'paywall@example.com', agente: 'posty' });
    ok(subU.status === 400 && /tarjeta en USD 199/.test(String(subU.data && subU.data.error || '')), 'H8 subscribe con plan único: rechazado con el motivo del lote (no cae a Esencial ARS)', subU.data);
    const subT = await apiH(ckF, 'POST', '/api/billing/subscribe', { plan: 'esencial', country: 'AR', payer_email: 'paywall@example.com', agente: 'posty' });
    ok(subT.status === 400 && /no configurados/i.test(String(subT.data && subT.data.error || '')), 'H9 subscribe con tier: riel MP intacto (gate de config)', subT.data);

    // Envejecer al usuario fresco
    const dbPath = path.join(TMP, 'posta.db');
    const rw = new DatabaseSync(dbPath);
    const uF = rw.prepare('SELECT id FROM users WHERE email = ?').get('paywall@example.com');
    const createdOld = new Date(Date.now() - 4 * DAY).toISOString().replace('T', ' ').slice(0, 19);
    rw.prepare('UPDATE users SET created_at = ?, trial_ends_at = ? WHERE id = ?').run(createdOld, Date.now() - 3600 * 1000, uF.id);
    const meV = await apiH(ckF, 'GET', '/api/auth/me');
    ok(meV.data && meV.data.user && meV.data.user.trial_expired === true && meV.data.user.trial_days_left === 0, 'H10 vencido: /me marca expired, 0 días', meV.data && meV.data.user);

    const cgV = await apiH(ckF, 'POST', '/api/ads/billetera/cargar', { montoUSD: 50 });
    ok(cgV.status === 402 && cgV.data && cgV.data.error === 'trial_expired', 'H11 vencido cargar: 402 trial_expired', cgV.data);
    const imV = await apiH(ckF, 'POST', '/api/ads/billetera/impulsar', { posteoId: 1, montoUSD: 50 });
    ok(imV.status === 402 && imV.data && imV.data.error === 'trial_expired', 'H11 vencido impulsar: 402 trial_expired', imV.data);
    const deV = await apiH(ckF, 'POST', '/api/destacado/impulsar', { postId: 1, montoUSD: 20 });
    ok(deV.status === 402 && deV.data && deV.data.error === 'trial_expired', 'H11 vencido destacado: 402 trial_expired', deV.data);
    const boV = await apiH(ckF, 'POST', '/api/ads/boost', { post_id: 99999, budget_cents: 2000 });
    ok(boV.status === 402 && boV.data && boV.data.error === 'trial_expired', 'H11 vencido boost: 402 trial_expired', boV.data);
    const weV = await apiH(ckF, 'POST', '/api/week/ensure', {});
    ok(weV.status === 402, `H12 vencido week/ensure: 402 (gate de siempre, control) (vino ${weV.status})`);

    // Usuario con trial_ends_at = 0 (legado): /me debe marcarlo vencido.
    const rr0 = await fetch(`${BASE}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'paywall-cero@example.com', password: 'test1234', business_name: 'Paywall Cero' }),
    });
    const ck0 = cookieDe(rr0.headers);
    const u0 = rw.prepare('SELECT id FROM users WHERE email = ?').get('paywall-cero@example.com');
    rw.prepare('UPDATE users SET trial_ends_at = 0, trial_extended_until = NULL WHERE id = ?').run(u0.id);
    const me0 = await apiH(ck0, 'GET', '/api/auth/me');
    ok(me0.data && me0.data.user && me0.data.user.trial_expired === true, 'H13 trial_ends_at=0: /me marca expired (alineado con el gate)', me0.data && me0.data.user);

    // Invitado envejecido
    const mkWeek = (ig, business) => ({
      business, category: 'cafeteria', lang: 'es', ig, engine: 25,
      posts: [1, 2, 3].map((i) => ({ type: 'image', image: PNG1, headline: `Posteo ${i} de ${business}`, caption: `Caption ${i} de ${business}`, hashtags: '#cafe' })),
      week: [], spots_left: 40,
    });
    const nowS = Date.now();
    rw.prepare('INSERT INTO trial_cache (ig, payload, created_at) VALUES (?,?,?)').run('paywalle2e', JSON.stringify(mkWeek('paywalle2e', 'Café Paywall')), nowS);
    rw.prepare('INSERT INTO trial_locks (ig, domain, business, lang, payload, generated_at, created_at) VALUES (?,?,?,?,?,?,?)')
      .run('paywalle2e', '', 'Café Paywall', 'es', JSON.stringify(mkWeek('paywalle2e', 'Café Paywall')), nowS - DAY, nowS - DAY);
    rw.prepare(`INSERT OR IGNORE INTO trial_used (kind, value, user_id, created_at) VALUES ('ig',?,NULL,?)`).run('paywalle2e', nowS - DAY);
    const gs = await fetch(`${BASE}/api/guest/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ig: 'paywalle2e', domain: '', device: 'dvc_paywall_1', lang: 'es' }),
    });
    const gsBody = await gs.json().catch(() => ({}));
    const ckG = cookieDe(gs.headers);
    ok(gs.status === 200 && !!gsBody.user_id && ckG.length > 0, 'H14 invitado entra con sesión', { status: gs.status, body: gsBody });
    rw.prepare('UPDATE users SET created_at = ?, trial_ends_at = ? WHERE id = ?').run(createdOld, Date.now() - 3600 * 1000, gsBody.user_id);
    const meG = await apiH(ckG, 'GET', '/api/auth/me');
    ok(meG.data && meG.data.user && meG.data.user.trial_expired === true, 'H14 invitado vencido: /me marca expired', meG.data && meG.data.user);
    const boG = await apiH(ckG, 'POST', '/api/ads/boost', { post_id: 1, budget_cents: 2000 });
    ok(boG.status === 402 && boG.data && boG.data.error === 'trial_expired', 'H15 invitado vencido: Ads cortado con 402 trial_expired', boG.data);
    const coG = await apiH(ckG, 'POST', '/api/billing/stripe/checkout', { plan: 'posty', country: 'AR', agente: 'posty' });
    ok(coG.status === 402 && JSON.stringify(coG.data || {}).includes('guest_account_required'), 'H16 invitado vencido al pagar: primero crear cuenta (402 guest)', coG.data);
    rw.close();
  } finally {
    try { process.kill(srv.pid, 'SIGKILL'); } catch (e) {}
    await new Promise((r) => setTimeout(r, 600));
    let free = false;
    try { await fetch(`${BASE}/api/version`); } catch (e) { free = true; }
    ok(free, 'H17 puerto libre tras matar el boot por PID');
    ok(!fs.existsSync(path.join(__dirname, 'data')), 'H17 sin data/ en el release');
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
    if (fails) console.error('\n--- log del servidor (últimas 30 líneas) ---\n' + srvLog.split('\n').slice(-30).join('\n'));
  }
  // Drenar las secciones §U/§C antes del veredicto.
  await new Promise((r) => setTimeout(r, 400));
  console.log(`\ntest-lote-plan-unico-paywall: ${total - fails}/${total} ok`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('✗ excepción', e && e.stack || e); process.exit(1); });
