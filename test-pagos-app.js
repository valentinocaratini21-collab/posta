// test-pagos-app.js — PAGOS LADO APP + TANDA DE PRECIOS NUEVA (Posty).
// Node, sin auth, sin red de pago (stubs). Se corre desde la raíz del repo:
//   node test-pagos-app.js
// (En validación del constructor se corre con PAGOS_TEST_ROOT=<árbol>.)
// Cubre: tabla nueva por moneda, completo = 3x, equipo, rail por país,
// nivelContrato, deep-link parse, external_reference, webhook MP parse,
// poderesContratados con estado, shape de /api/billing/plans intacto y
// censo de precios viejos en los archivos tocados (0 fuera de líneas
// marcadas HISTÓRICO). Los helpers de server.js y el parser del chunk se
// extraen de los archivos reales por sus marcadores y se evalúan: no se
// testea una copia, se testea el código que se pushea.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.PAGOS_TEST_ROOT
  ? path.resolve(process.env.PAGOS_TEST_ROOT)
  : __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let PASS = 0, FAIL = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { PASS++; }
  else { FAIL++; failures.push(`${label}: esperado ${e}, llegó ${a}`); console.log(`FAIL ${label}: esperado ${e}, llegó ${a}`); }
}
function ok(cond, label) {
  if (cond) { PASS++; }
  else { FAIL++; failures.push(label); console.log(`FAIL ${label}`); }
}

// ---------------------------------------------------------------- plans
const plans = require(path.join(ROOT, 'config/plans.js'));
eq(plans.PLANS_US.esencial.price, 199, 'US esencial 199');
eq(plans.PLANS_US.pro.price, 299, 'US pro 299');
eq(plans.PLANS_US.total.price, 399, 'US total 399');
eq(plans.PLANS_GB.esencial.price, 149, 'GB esencial 149');
eq(plans.PLANS_GB.pro.price, 224, 'GB pro 224');
eq(plans.PLANS_GB.total.price, 299, 'GB total 299');
eq(plans.PLANS_EU.esencial.price, 179, 'EU esencial 179');
eq(plans.PLANS_EU.pro.price, 269, 'EU pro 269');
eq(plans.PLANS_EU.total.price, 359, 'EU total 359');
eq(plans.PLANS_AR.esencial.price, 199999, 'AR esencial intacto');
eq(plans.PLANS_AR.pro.price, 299900, 'AR pro intacto');
eq(plans.PLANS_AR.total.price, 399900, 'AR total intacto');
eq(plans.PLANS_UY.esencial.price, 4990, 'UY esencial intacto');
eq(plans.PLANS_UY.pro.price, 7490, 'UY pro intacto');
eq(plans.PLANS_UY.total.price, 9990, 'UY total intacto');
eq(plans.PLANS_CA.esencial.price, 279, 'CA esencial NO se toca');
eq(plans.PLANS_CA.pro.price, 409, 'CA pro NO se toca');
eq(plans.PLANS_CA.total.price, 549, 'CA total NO se toca');
// Completo = 3x en las 5 monedas.
for (const [cur, tiers] of [['USD', plans.PLANS_US], ['GBP', plans.PLANS_GB], ['EUR', plans.PLANS_EU], ['ARS', plans.PLANS_AR], ['UYU', plans.PLANS_UY]]) {
  for (const t of ['esencial', 'pro', 'total']) {
    eq(plans.completoPrice(cur, t), tiers[t].price * 3, `completo ${cur} ${t} = 3x`);
  }
}
eq(plans.COMPLETO_FUNDADOR.USD, { esencial: 597, pro: 897, total: 1197 }, 'completo USD tabla');
eq(plans.COMPLETO_FUNDADOR.GBP, { esencial: 447, pro: 672, total: 897 }, 'completo GBP tabla');
eq(plans.COMPLETO_FUNDADOR.EUR, { esencial: 537, pro: 807, total: 1077 }, 'completo EUR tabla');
eq(plans.COMPLETO_FUNDADOR.ARS, { esencial: 599997, pro: 899700, total: 1199700 }, 'completo ARS tabla');
eq(plans.COMPLETO_FUNDADOR.UYU, { esencial: 14970, pro: 22470, total: 29970 }, 'completo UYU tabla');
eq(plans.completoPrice('CAD', 'pro'), null, 'completo CAD null (no se toca)');
eq(plans.completoPrice('XXX', 'pro'), null, 'completo moneda desconocida null');
eq(plans.PODERES, ['posty', 'venty', 'gesty', 'atenty'], 'PODERES');
// Equipo: tabla exacta del brief (total del equipo, half-up).
const TEAM = {
  USD: { 2: [358, 538, 718], 3: [507, 762, 1017], 4: [637, 957, 1277] },
  GBP: { 2: [268, 403, 538], 3: [380, 571, 762], 4: [477, 717, 957] },
  EUR: { 2: [322, 484, 646], 3: [456, 686, 915], 4: [573, 861, 1149] },
  ARS: { 2: [359998, 539820, 719820], 3: [509997, 764745, 1019745], 4: [639997, 959680, 1279680] },
  UYU: { 2: [8982, 13482, 17982], 3: [12725, 19100, 25475], 4: [15968, 23968, 31968] },
};
for (const [cur, byN] of Object.entries(TEAM)) {
  const tiers = cur === 'USD' ? plans.PLANS_US : cur === 'GBP' ? plans.PLANS_GB : cur === 'EUR' ? plans.PLANS_EU : cur === 'ARS' ? plans.PLANS_AR : plans.PLANS_UY;
  for (const [n, want] of Object.entries(byN)) {
    eq([plans.teamPrice(+n, tiers.esencial.price), plans.teamPrice(+n, tiers.pro.price), plans.teamPrice(+n, tiers.total.price)], want, `equipo ${cur} x${n}`);
  }
}
eq(plans.teamPrice(1, 199), 199, 'equipo x1 = precio (sin descuento)');
eq(plans.teamPrice(5, 199), Math.round(5 * 199 * 0.8), 'equipo x5 = −20%');
// Rail por país.
for (const c of ['US', 'GB', 'EU', 'BR', 'MX', 'CL', 'CO', 'PE']) eq(plans.getRail(c), 'stripe', `rail ${c} stripe`);
for (const c of ['AR', 'UY']) eq(plans.getRail(c), 'mercadopago', `rail ${c} mp`);
for (const c of ['BR', 'MX', 'CL', 'CO', 'PE']) {
  eq(plans.getPlans(c), plans.PLANS_US, `planes ${c} = USD base`);
  ok(plans.COUNTRY_META[c].pending === true, `pending ${c}`);
  ok(plans.COUNTRY_META[c].note_es.includes('Stripe') && !plans.COUNTRY_META[c].note_es.includes('Mercado Pago'), `nota ${c} Stripe, sin MP`);
}
// nivelContrato → tier.
eq(plans.contratoTier('completa'), 'pro', 'contrato completa→pro');
eq(plans.contratoTier('esencial'), 'esencial', 'contrato esencial identidad');
eq(plans.contratoTier('pro'), 'pro', 'contrato pro identidad');
eq(plans.contratoTier('total'), 'total', 'contrato total identidad');
eq(plans.contratoTier('otra'), 'esencial', 'contrato inválido→default esencial');
eq(plans.contratoTier(''), 'esencial', 'contrato vacío→default');
// formatPrice: enteros sin decimales.
eq(plans.formatPrice({ price: 199, currency: 'USD' }), '$199', 'fmt USD 199 sin decimales');
eq(plans.formatPrice({ price: 149, currency: 'GBP' }), '£149', 'fmt GBP 149 sin decimales');
eq(plans.formatPrice({ price: 179, currency: 'EUR' }), '€179', 'fmt EUR 179 sin decimales');
eq(plans.formatPrice({ price: 199999, currency: 'ARS' }), '$199.999', 'fmt ARS intacto');
eq(plans.formatPrice({ price: 4990, currency: 'UYU' }), '$U 4.990', 'fmt UYU intacto');

// ------------------------------------------------------- server helpers
const serverSrc = read('server.js');
function extractHelpers(src) {
  const a = src.indexOf('/* PAGOS_APP_HELPERS:START');
  const b = src.indexOf('/* PAGOS_APP_HELPERS:END */', a);
  ok(a >= 0 && b > a, 'bloque helpers presente en server.js');
  const code = src.slice(a, b);
  const fn = new Function('stripeBilling', code + '\nreturn { parseMpRef, poderActivo, completoActivo, registrarPoder, ensureCheckoutIntentsTable, guardarCheckoutIntent, consumirCheckoutIntent, ensureCompletoPriceId };');
  return fn({ stripeClient: () => { throw new Error('no client en test'); } });
}
const H = extractHelpers(serverSrc);
// Stub DB mínimo con semántica de better-sqlite3 para estos helpers.
function makeStubDb(opts) {
  const o = opts || {};
  const rows = new Map(); // uid:poder -> {estado, nivel, rail, ref, fuente}
  const intents = new Map();
  const sqls = [];
  if (o.seed) for (const [k, v] of Object.entries(o.seed)) rows.set(k, v);
  const db = {
    rows, intents, sqls,
    exec(sql) { sqls.push(sql); },
    prepare(sql) {
      sqls.push(sql);
      const isInsertPoder = sql.includes('poderes_contratados') && sql.includes('INSERT');
      const isSelectActivo = sql.includes('SELECT 1 AS x');
      const isIntentInsert = sql.includes('checkout_intents') && sql.includes('INSERT OR REPLACE');
      const isIntentSelect = sql.includes('checkout_intents') && sql.includes('SELECT agente');
      const isIntentDelete = sql.includes('checkout_intents') && sql.includes('DELETE');
      return {
        run(...args) {
          if (isInsertPoder) {
            if (sql.includes('nivel') && o.failNewCols) throw new Error('no such column: nivel');
            if (sql.includes('nivel')) {
              const [uid, poder, ts, fuente, nivel, rail, ref, estado] = args;
              rows.set(`${uid}:${poder}`, { estado, nivel, rail, ref, fuente });
            } else {
              const [uid, poder, ts, fuente] = args;
              const prev = rows.get(`${uid}:${poder}`) || {};
              rows.set(`${uid}:${poder}`, { ...prev, estado: 'active', fuente });
            }
            return { changes: 1 };
          }
          if (isIntentInsert) { const [uid, agente, nivel] = args; intents.set(uid, { agente, nivel }); return { changes: 1 }; }
          if (isIntentDelete) { intents.delete(args[0]); return { changes: 1 }; }
          return { changes: 0 };
        },
        get(...args) {
          if (isSelectActivo) {
            const [uid, poder] = args;
            const r = rows.get(`${uid}:${poder}`);
            return r && r.estado === 'active' ? { x: 1 } : undefined;
          }
          if (isIntentSelect) return intents.get(args[0]) || undefined;
          return undefined;
        },
        all() { return []; },
      };
    },
  };
  return db;
}
// parseMpRef (webhook MP).
eq(H.parseMpRef('12:pro:venty'), { userId: 12, planId: 'pro', agente: 'venty' }, 'mp ref 3 segmentos');
eq(H.parseMpRef('12:pro'), { userId: 12, planId: 'pro', agente: 'posty' }, 'mp ref 2 segmentos → posty');
eq(H.parseMpRef('12:total:completo'), { userId: 12, planId: 'total', agente: 'completo' }, 'mp ref completo');
eq(H.parseMpRef('12:xx'), null, 'mp ref tier inválido → null');
eq(H.parseMpRef('12:pro:desy'), null, 'mp ref especialista → null');
eq(H.parseMpRef('abc:pro'), null, 'mp ref uid inválido → null');
eq(H.parseMpRef('12:pro:venty:extra'), null, 'mp ref 4 segmentos → null');
eq(H.parseMpRef(''), null, 'mp ref vacío → null');
// registrarPoder + poderActivo + completoActivo.
{
  const db = makeStubDb();
  eq(H.registrarPoder(db, 7, 'venty', { nivel: 'pro', rail: 'stripe', ref: 'r1', fuente: 'stripe' }), true, 'registrar venty ok');
  eq(db.rows.get('7:venty'), { estado: 'active', nivel: 'pro', rail: 'stripe', ref: 'r1', fuente: 'stripe' }, 'fila venty guardada');
  eq(H.registrarPoder(db, 7, 'desy', {}), false, 'registrar especialista rechazado');
  eq(H.registrarPoder(db, 7, 'talenty', {}), false, 'registrar talenty rechazado');
  eq(H.poderActivo(db, 7, 'venty'), true, 'poderActivo venty');
  eq(H.poderActivo(db, 7, 'gesty'), false, 'poderActivo gesty ausente');
  eq(H.completoActivo(db, 7), false, 'completoActivo incompleto');
  for (const p of ['posty', 'gesty', 'atenty']) H.registrarPoder(db, 7, p, { nivel: 'pro', rail: 'stripe', fuente: 'stripe' });
  eq(H.completoActivo(db, 7), true, 'completoActivo con los 4');
  eq(H.registrarPoder(db, 7, 'venty', { nivel: 'total', rail: 'mercadopago', ref: 'r2', fuente: 'mp-webhook', estado: 'pending' }), true, 're-registrar actualiza (pending)');
  eq(db.rows.get('7:venty').estado, 'pending', 'fila venty pasa a pending');
  eq(H.poderActivo(db, 7, 'venty'), false, 'pending NO cuenta como activo');
}
{
  // Fallback sin columnas nuevas.
  const db = makeStubDb({ failNewCols: true });
  eq(H.registrarPoder(db, 9, 'gesty', { nivel: 'pro', rail: 'mp', fuente: 'x' }), true, 'registrar fallback ok');
  ok(db.sqls.some((s) => s.includes('INSERT INTO poderes_contratados (user_id, poder, ts, fuente) VALUES')), 'fallback usa INSERT viejo');
}
// Checkout intents (one-shot).
{
  const db = makeStubDb();
  H.guardarCheckoutIntent(db, 5, 'venty', 'pro');
  eq(H.consumirCheckoutIntent(db, 5), { agente: 'venty', nivel: 'pro' }, 'intent se lee');
  eq(H.consumirCheckoutIntent(db, 5), null, 'intent se borra al consumir (one-shot)');
  eq(H.consumirCheckoutIntent(db, 999), null, 'sin intent → null (hook asume posty)');
}
// ensureCompletoPriceId (stub de cliente Stripe, sin red).
(async () => {
  const calls = [];
  const client = {
    prices: {
      list: async (q) => { calls.push(['list', q]); return { data: [] }; },
      create: async (b) => { calls.push(['price.create', b]); return { id: 'price_1' }; },
    },
    products: { create: async (b) => { calls.push(['product.create', b]); return { id: 'prod_1' }; } },
  };
  const id = await H.ensureCompletoPriceId(client, { id: 'pro', name: 'Pro', currency: 'USD' }, 897);
  eq(id, 'price_1', 'completo price id creado');
  const pc = calls.find((c) => c[0] === 'price.create')[1];
  eq(pc.lookup_key, 'posty_usd_pro_completo_monthly', 'lookup_key completo');
  eq(pc.currency, 'usd', 'completo currency minúscula');
  eq(pc.unit_amount, 89700, 'completo unit_amount centavos');
  eq(pc.metadata, { plan_id: 'pro', completo: '1' }, 'completo metadata');
  eq(pc.recurring, { interval: 'month' }, 'completo mensual');
  // List-hit: no crea nada.
  const calls2 = [];
  const client2 = {
    prices: {
      list: async () => { calls2.push('list'); return { data: [{ id: 'price_x' }] }; },
      create: async () => { calls2.push('create'); return { id: 'no' }; },
    },
    products: { create: async () => { calls2.push('product'); return { id: 'no' }; } },
  };
  eq(await H.ensureCompletoPriceId(client2, { id: 'esencial', name: 'Esencial', currency: 'EUR' }, 537), 'price_x', 'completo price existente reutilizado');
  eq(calls2, ['list'], 'list-hit no crea producto ni precio');
  finish();
})().catch((e) => { console.log('FAIL async:', e); FAIL++; finish(); });

// ------------------------------------------------------------ mercadopago
async function mpTests() {
  const mp = require(path.join(ROOT, 'mercadopago.js'));
  const prevToken = process.env.MP_ACCESS_TOKEN;
  const prevFetch = global.fetch;
  process.env.MP_ACCESS_TOKEN = 'test-token-1234567890';
  let lastBody = null;
  global.fetch = async () => ({ ok: true, json: async () => ({ init_point: 'https://mp/init', id: 'pre-123' }) });
  // Capturar el body: envolver fetch para leerlo.
  global.fetch = async (url, opts) => {
    try { lastBody = JSON.parse(opts.body); } catch (e) { lastBody = null; }
    return { ok: true, json: async () => ({ init_point: 'https://mp/init', id: 'pre-123' }) };
  };
  await mp.createSubscription({ plan: { id: 'pro', name: 'Pro', price: 299, currency: 'USD' }, userId: 7, baseUrl: 'https://postyhacetodo.com', payerEmail: 'a@b.com', agente: 'venty' });
  eq(lastBody.external_reference, '7:pro:venty', 'mp external_reference con agente');
  eq(lastBody.reason, 'Posta — Venty Pro', 'mp reason con agente');
  await mp.createSubscription({ plan: { id: 'pro', name: 'Pro', price: 299, currency: 'USD' }, userId: 7, baseUrl: 'https://postyhacetodo.com', payerEmail: 'a@b.com' });
  eq(lastBody.external_reference, '7:pro:posty', 'mp external_reference sin agente → posty');
  eq(lastBody.reason, 'Posta — Plan Pro', 'mp reason posty legacy');
  await mp.createSubscription({ plan: { id: 'total', name: 'Total', price: 1197, currency: 'USD' }, userId: 7, baseUrl: 'https://postyhacetodo.com', payerEmail: 'a@b.com', agente: 'completo' });
  eq(lastBody.external_reference, '7:total:completo', 'mp external_reference completo');
  process.env.MP_ACCESS_TOKEN = prevToken;
  global.fetch = prevFetch;
}

// --------------------------------------------------------------- niveles
{
  const niveles = require(path.join(ROOT, 'niveles.js'));
  const stubNiveles = (rowsActive, rowsAll, failActive) => ({
    prepare(sql) {
      return {
        all() {
          if (sql.includes("estado = 'active'")) {
            if (failActive) throw new Error('no such column: estado');
            return rowsActive;
          }
          if (sql.includes('poderes_contratados')) {
            if (rowsAll === null) throw new Error('no such table');
            return rowsAll;
          }
          return [];
        },
      };
    },
  });
  eq(niveles.poderesContratados(stubNiveles([{ poder: 'venty' }, { poder: 'atenty' }], [], false), 1), ['posty', 'venty', 'atenty'], 'niveles: solo activos, orden canon');
  eq(niveles.poderesContratados(stubNiveles([], [{ poder: 'venty' }, { poder: 'gesty' }], true), 1), ['posty', 'venty', 'gesty'], 'niveles: fallback sin columna estado');
  eq(niveles.poderesContratados(stubNiveles([], null, true), 1), ['posty'], 'niveles: sin tabla → solo posty');
  eq(niveles.poderesContratados(stubNiveles([{ poder: 'desy' }, { poder: 'talenty' }], [], false), 1), ['posty'], 'niveles: especialistas jamás');
}

// ------------------------------------------------------- deep link cliente
const chunkSrc = read('public/chunk-ajustes.js');
function extractParser(src) {
  const a = src.indexOf('/* PZ_CHECKOUT_DEEP_LINK:START');
  const b = src.indexOf('/* PZ_CHECKOUT_DEEP_LINK:END */', a);
  ok(a >= 0 && b > a, 'parser deep link presente en chunk-ajustes.js');
  const code = src.slice(a, b);
  const fn = new Function(code + '\nreturn pzParseCheckoutDeepLink;');
  return fn();
}
const parseDl = extractParser(chunkSrc);
eq(parseDl('#/app/ajustes?plan_sel=1&agente=venty&nivel=completa&pais=BR&moneda=BRL'),
  { agente: 'venty', tier: 'pro', pais: 'BR', moneda: 'BRL' }, 'deep link completo (sitios)');
eq(parseDl('#/app/ajustes?plan_sel=1&agente=completo&nivel=total&pais=UY&moneda=UYU'),
  { agente: 'completo', tier: 'total', pais: 'UY', moneda: 'UYU' }, 'deep link completo UY');
eq(parseDl('#/app/ajustes?plan_sel=1&agente=atenty&nivel=esencial&pais=GB&moneda=GBP'),
  { agente: 'atenty', tier: 'esencial', pais: 'GB', moneda: 'GBP' }, 'deep link atenty GB');
eq(parseDl('#/app/ajustes?plan_sel=pro'), { agente: null, tier: 'pro', pais: null, moneda: null }, 'legacy plan_sel tier (sin agente)');
eq(parseDl('#/app/ajustes?plan_sel=1'), { agente: null, tier: null, pais: null, moneda: null }, 'legacy plan_sel=1 sin agente → sin tier');
eq(parseDl('#/app/ajustes?agente=desy&nivel=total&pais=XX'), { agente: 'posty', tier: 'total', pais: 'AR', moneda: null }, 'agente inválido → posty, país inválido → AR');
eq(parseDl('#/app/ajustes?agente=gesty&nivel=raro&pais=EU'), { agente: 'gesty', tier: 'esencial', pais: 'EU', moneda: null }, 'nivel inválido → esencial');
eq(parseDl('#/app/ajustes?agente=venty'), { agente: 'venty', tier: 'esencial', pais: 'AR', moneda: null }, 'sin nivel ni país → esencial/AR');
eq(parseDl('#/app/ajustes'), { agente: null, tier: null, pais: null, moneda: null }, 'sin query → legacy nulo');
eq(parseDl(''), { agente: null, tier: null, pais: null, moneda: null }, 'hash vacío → legacy nulo');

// Estático cliente: cableado del deep link.
const appSrc = read('public/app.js');
ok(chunkSrc.includes("const PZ_PAY_STRIPE = ['US', 'GB', 'EU', 'BR', 'MX', 'CL', 'CO', 'PE']"), 'chunk PZ_PAY_STRIPE incluye los 5');
ok(chunkSrc.includes('!pzDl.agente') && chunkSrc.includes('PZ_AUTO_PLAN'), 'auto-click legacy guardado por agente');
ok(chunkSrc.includes('Estás contratando') && chunkSrc.includes('You are hiring'), 'banner deep link ES/EN');
ok(chunkSrc.includes("localStorage.setItem('posta-pais', pzDl.pais)"), 'deep link setea posta-pais');
ok(chunkSrc.includes("agente: (pzDl.agente || 'posty')"), 'checkout manda agente (stripe y MP)');
ok(!/api\.post\('\/api\/billing\/(stripe\/checkout|subscribe)', \{[^}]*moneda/.test(chunkSrc), 'checkout NO manda moneda (es hint)');
ok(appSrc.includes("localStorage.setItem('posta-checkout-intent', ret)"), 'register guarda checkout-intent');
ok(appSrc.includes("localStorage.getItem('posta-checkout-intent')"), 'onboarding consume checkout-intent');
ok(appSrc.includes("sessionStorage.setItem('posta_return_to', location.hash)"), 'router guarda return_to con hash completo');
ok(appSrc.includes('USD 199 · £149 · €179'), 'comentario convención app.js actualizado');
{
  const brLine = appSrc.split('\n').find((l) => l.includes("nombre: 'Brasil'")) || '';
  ok(brLine.includes('Stripe') && !brLine.includes('Mercado Pago'), 'nota BR app.js Stripe');
}
// Estático servidor: shape y países.
for (const k of ['country,', 'currency: plans.esencial.currency,', 'rail: meta.rail,', 'local_price_pending:', 'countries:', 'plans:', 'anchor,', 'trial_plan:', 'mp_configured:', 'stripe_configured:']) {
  ok(serverSrc.includes(k), `shape plans conserva ${k}`);
}
for (const k of ['poderes: PODERES,', 'completo: { prices: compPrices', 'equipo: {']) {
  ok(serverSrc.includes(k), `shape plans agrega ${k}`);
}
ok(serverSrc.includes("['US', 'GB', 'EU', 'BR', 'MX', 'CL', 'CO', 'PE']"), 'stripe checkout acepta los 5');
ok(serverSrc.includes("getPlans(['AR', 'UY'].includes(mpCountry)"), 'subscribe MP solo AR/UY');
ok(serverSrc.includes('ensureCompletoPriceId(null, plan, compAmount)'), 'checkout completo usa helper propio');
ok(serverSrc.includes('guardarCheckoutIntent(db, user.id, agenteStripe, plan.id)'), 'intent se guarda antes del checkout');
ok(serverSrc.includes('consumirCheckoutIntent(db, uid)'), 'hook consume intent');
ok(serverSrc.includes('postyhacetodo.com'), 'dominio canónico en comentario billing');
ok(!serverSrc.includes('stripe-billing') || serverSrc.includes("require('./stripe-billing')"), 'stripe-billing.js no modificado (solo require existente)');
// Censo de precios viejos (boundary-aware: 199.999 AR NO cuenta).
{
  const BANNED = ['199,99', '199\\.99', '299,99', '299\\.99', '399,99', '399\\.99', '399,98', '599,98', '799,98', '799,99', '1199,99', '1599,99'];
  const files = ['config/plans.js', 'server.js', 'mercadopago.js', 'niveles.js', 'public/app.js', 'public/chunk-ajustes.js', 'public/prueba.html', 'public/en-prueba.html', 'public/en/index.html'];
  for (const f of files) {
    const src = read(f);
    let bad = 0, hist = 0;
    for (const line of src.split('\n')) {
      for (const p of BANNED) {
        const rx = new RegExp(`(?<!\\d)${p}(?!\\d)`, 'g');
        const n = (line.match(rx) || []).length;
        if (n) {
          if (line.includes('HISTÓRICO')) hist += n;
          else bad += n;
        }
      }
    }
    eq(bad, 0, `censo precios viejos ${f} = 0 fuera de HISTÓRICO`);
    if (f === 'config/plans.js') ok(hist > 0, 'plans.js conserva menciones HISTÓRICO marcadas');
    else eq(hist, 0, `censo HISTÓRICO ${f} = 0`);
  }
}
// finish() corre tras los tests async.
let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  mpTests().then(() => {
    console.log(`\ntest-pagos-app: ${PASS} OK, ${FAIL} FAIL`);
    if (FAIL) { console.log('Fallos:'); for (const f of failures) console.log(' -', f); }
    process.exit(FAIL ? 1 : 0);
  }).catch((e) => { console.log('FAIL mpTests:', e); process.exit(1); });
}
