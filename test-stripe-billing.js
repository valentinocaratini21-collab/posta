'use strict';
/* test-stripe-billing.js — 💳 Stripe US (v285, 2026-10-21)
 *
 * Integración de cobro US en USD (stripe-billing.js + endpoints en server.js),
 * espejo del flujo MercadoPago para cuentas lang='en'. SIN llamadas reales:
 * la API de Stripe se ejerce con un cliente falso inyectado; la firma del
 * webhook se verifica con el SDK real (HMAC local, sin red).
 *
 * Parte A: unidades del módulo (catálogo idempotente por lookup_key, payload
 *   de Checkout con trial_end alineado a la prueba de la app, firma de
 *   webhook válida/inválida/ausente, aplicación de eventos idempotente,
 *   gracia ante payment_failed, fail-closed sin llaves).
 * Parte B: E2E — bootea el servidor real (staging del árbol + overlay
 *   opcional vía POSTA_OVERLAY_DIR) SIN variables STRIPE_*: el sitio queda
 *   como siempre y los endpoints nuevos responden limpio (400/503).
 * Corre con: node test-stripe-billing.js
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.error('  ✗', msg); } else { console.log('  ✓', msg); } }
function section(t) { console.log('\n== ' + t + ' =='); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// El módulo lee las llaves del entorno en cada llamada: partimos sin ninguna.
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_PUBLISHABLE_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

const sb = require('./stripe-billing');

function memDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'trial',
             plan_status TEXT DEFAULT 'trial', stripe_customer_id TEXT DEFAULT '',
             stripe_subscription_id TEXT DEFAULT '');
           CREATE TABLE stripe_events (id TEXT PRIMARY KEY, type TEXT DEFAULT '', received_at INTEGER DEFAULT 0);`);
  return db;
}

function makeFakeStripe() {
  const prices = new Map();
  const subs = new Map();
  let seq = 0;
  const calls = { productsCreate: 0, pricesCreate: 0, customersCreate: 0, sessionsCreate: [] };
  return {
    _prices: prices, _subs: subs, _calls: calls,
    prices: {
      list: async ({ lookup_keys }) => ({ data: (lookup_keys || []).map((k) => prices.get(k)).filter(Boolean) }),
      create: async (p) => { calls.pricesCreate++; const price = { id: 'price_' + (++seq), ...p }; prices.set(p.lookup_key, price); return price; },
    },
    products: { create: async (p) => { calls.productsCreate++; return { id: 'prod_' + (++seq), ...p }; } },
    customers: {
      list: async () => ({ data: [] }),
      create: async (p) => { calls.customersCreate++; return { id: 'cus_' + (++seq), ...p }; },
    },
    checkout: { sessions: { create: async (params) => { calls.sessionsCreate.push(params); return { id: 'cs_' + (++seq), url: 'https://checkout.stripe.com/c/pay/cs_test' }; } } },
    subscriptions: { retrieve: async (id) => { const s = subs.get(id); if (!s) throw new Error('No such subscription'); return s; } },
    billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/p/session/test' }) } },
  };
}

async function partA() {
  section('A1 · fail-closed sin llaves');
  ok(sb.stripeConfigured() === false, 'sin STRIPE_SECRET_KEY: stripeConfigured() = false');
  ok(sb.webhookConfigured() === false, 'sin STRIPE_WEBHOOK_SECRET: webhookConfigured() = false');
  ok(sb.stripeClient() === null, 'sin llaves no hay cliente');
  {
    const db = memDb();
    let err = null;
    try { await sb.createCheckout(db, null, { user: { id: 1, email: 'a@b.co' }, plan: { id: 'pro' }, baseUrl: 'https://x', trialEndSec: null }); }
    catch (e) { err = e; }
    ok(err && /no configurado/i.test(err.message), 'createCheckout sin llaves: error limpio, sin tocar red');
  }

  section('A2 · catálogo idempotente por lookup_key');
  const fake = makeFakeStripe();
  const cat1 = await sb.ensureCatalog(fake);
  ok(cat1.esencial && cat1.pro && cat1.total, 'ensureCatalog devuelve los 3 price ids');
  ok(fake._calls.productsCreate === 3 && fake._calls.pricesCreate === 3, 'primer bootstrap: crea 3 productos y 3 precios');
  const amounts = ['esencial', 'pro', 'total'].map((p) => fake._prices.get(sb.lookupKeyFor(p)).unit_amount);
  ok(JSON.stringify(amounts) === JSON.stringify([19999, 29999, 39999]), `montos USD correctos (19999/29999/39999): ${amounts}`);
  ok(['esencial', 'pro', 'total'].every((p) => fake._prices.get(sb.lookupKeyFor(p)).currency === 'usd'
    && fake._prices.get(sb.lookupKeyFor(p)).recurring.interval === 'month'), 'los 3 precios son USD mensuales');
  const cat2 = await sb.ensureCatalog(fake);
  ok(fake._calls.productsCreate === 3 && fake._calls.pricesCreate === 3, 'segundo bootstrap (redeploy): NO crea duplicados');
  ok(cat2.pro === cat1.pro, 'los price ids son estables entre bootstraps');

  section('A3 · payload de Checkout: precio por plan + trial_end alineado');
  const trialEnd = Math.floor(Date.now() / 1000) + 2 * 86400; // fin de SU prueba en la app
  const params = sb.buildCheckoutParams({
    priceId: cat1.pro, plan: { id: 'pro' }, baseUrl: 'https://postyhacetodo.com',
    user: { id: 42, email: 'shop@example.com', stripe_customer_id: 'cus_42' }, trialEndSec: trialEnd,
  });
  ok(params.mode === 'subscription', 'mode = subscription');
  ok(params.line_items[0].price === cat1.pro && params.line_items[0].quantity === 1, 'cobra el precio del plan elegido (Pro)');
  ok(params.subscription_data.trial_end === trialEnd, 'trial_end = fin exacto de la prueba de la app (no cobra antes)');
  ok(params.metadata.user_id === '42' && params.metadata.plan_id === 'pro'
    && params.subscription_data.metadata.plan_id === 'pro', 'metadata con user_id y plan en sesión y suscripción');
  ok(params.customer === 'cus_42' && params.success_url.includes('plan=ok') && params.cancel_url.includes('plan=error'),
    'customer reusado y URLs de retorno a la app');
  const params2 = sb.buildCheckoutParams({
    priceId: cat1.esencial, plan: { id: 'esencial' }, baseUrl: 'https://postyhacetodo.com',
    user: { id: 7, email: 'new@example.com', stripe_customer_id: '' }, trialEndSec: null,
  });
  ok(!('trial_end' in params2.subscription_data), 'sin trial vigente: cobro inmediato (sin trial_end)');
  ok(params2.customer_email === 'new@example.com' && !params2.customer, 'sin customer previo: va por email');

  section('A4 · createCheckout de punta a punta (fake): customer persistido');
  {
    const db = memDb();
    db.prepare("INSERT INTO users (id, email) VALUES (9, 'owner@shop.com')").run();
    const user = db.prepare('SELECT * FROM users WHERE id = 9').get();
    const out = await sb.createCheckout(db, fake, { user, plan: { id: 'total' }, baseUrl: 'https://postyhacetodo.com', trialEndSec: null });
    ok(out.url && out.url.startsWith('https://checkout.stripe.com/'), 'devuelve la URL de Checkout');
    const saved = db.prepare('SELECT stripe_customer_id FROM users WHERE id = 9').get();
    ok(!!saved.stripe_customer_id, 'el customer id quedó guardado en el usuario');
    const sent = fake._calls.sessionsCreate[fake._calls.sessionsCreate.length - 1];
    ok(sent.customer === saved.stripe_customer_id && sent.line_items[0].price === cat1.total, 'la sesión usa el customer guardado y el precio Total');
    const before = fake._calls.customersCreate;
    const user2 = db.prepare('SELECT * FROM users WHERE id = 9').get();
    await sb.createCheckout(db, fake, { user: user2, plan: { id: 'total' }, baseUrl: 'https://postyhacetodo.com', trialEndSec: null });
    ok(fake._calls.customersCreate === before, 'segundo checkout: reusa el customer, no crea otro');
  }

  section('A5 · firma del webhook (SDK real, HMAC local)');
  {
    const Stripe = require('stripe');
    const realClient = new Stripe('sk_test_dummy');
    const secret = 'whsec_test_secret_123';
    process.env.STRIPE_WEBHOOK_SECRET = secret;
    ok(sb.webhookConfigured() === true, 'con STRIPE_WEBHOOK_SECRET: webhookConfigured() = true');
    const payload = JSON.stringify({ id: 'evt_sig', type: 'invoice.paid', data: { object: { customer: 'cus_1' } } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const ev = sb.constructEvent(realClient, Buffer.from(payload), header);
    ok(ev && ev.id === 'evt_sig' && ev.type === 'invoice.paid', 'firma válida: el evento se construye');
    let threw = false;
    try { sb.constructEvent(realClient, Buffer.from(payload.replace('cus_1', 'cus_9')), header); } catch (e) { threw = true; }
    ok(threw, 'payload alterado: la firma se rechaza');
    delete process.env.STRIPE_WEBHOOK_SECRET;
    ok(sb.webhookConfigured() === false, 'secreto ausente: webhookConfigured() = false (la ruta responde 503)');
  }

  section('A6 · eventos: activación idempotente, gracia y baja (espejo MP)');
  {
    const db = memDb();
    db.prepare("INSERT INTO users (id, email) VALUES (5, 'cafe@example.com')").run();
    const counts = { act: 0, can: 0, ok: 0, fail: 0 };
    const hooks = {
      onActivated: () => counts.act++, onCancelled: () => counts.can++,
      onPaymentOk: () => counts.ok++, onPaymentFailed: () => counts.fail++,
    };
    fake._subs.set('sub_1', {
      id: 'sub_1', status: 'trialing', customer: 'cus_5',
      metadata: { user_id: '5', plan_id: 'pro' },
      items: { data: [{ price: { lookup_key: 'posty_us_pro_monthly' } }] },
    });
    const completed = {
      id: 'evt_1', type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', customer: 'cus_5', subscription: 'sub_1', client_reference_id: '5', metadata: { user_id: '5', plan_id: 'pro' } } },
    };
    let r = await sb.processEvent(db, fake, completed, hooks);
    let u = db.prepare('SELECT * FROM users WHERE id = 5').get();
    ok(r.ok && u.plan === 'pro' && u.plan_status === 'active', 'checkout completado (trialing): plan Pro ACTIVO');
    ok(u.stripe_customer_id === 'cus_5' && u.stripe_subscription_id === 'sub_1', 'customer y suscripción guardados');
    ok(counts.act === 1, 'onActivated corrió una vez (reactiva posteos + tracking, como MP)');
    r = await sb.processEvent(db, fake, completed, hooks);
    ok(r.duplicate === true && counts.act === 1, 'el mismo evento de nuevo: idempotente, no reactiva');
    // past_due: gracia — el plan sigue activo (MP no cancela hasta que el proveedor da de baja)
    await sb.processEvent(db, fake, {
      id: 'evt_2', type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', status: 'past_due', customer: 'cus_5', metadata: { user_id: '5', plan_id: 'pro' }, items: { data: [{ price: { lookup_key: 'posty_us_pro_monthly' } }] } } },
    }, hooks);
    u = db.prepare('SELECT * FROM users WHERE id = 5').get();
    ok(u.plan_status === 'active', 'subscription past_due: GRACIA, el plan sigue activo');
    await sb.processEvent(db, fake, { id: 'evt_3', type: 'invoice.payment_failed', data: { object: { customer: 'cus_5' } } }, hooks);
    u = db.prepare('SELECT * FROM users WHERE id = 5').get();
    ok(counts.fail === 1 && u.plan_status === 'active', 'invoice.payment_failed: se registra y el plan NO se cancela');
    await sb.processEvent(db, fake, { id: 'evt_4', type: 'invoice.paid', data: { object: { customer: 'cus_5' } } }, hooks);
    ok(counts.ok === 1, 'invoice.paid: hook de pago ok');
    await sb.processEvent(db, fake, {
      id: 'evt_5', type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', status: 'canceled', customer: 'cus_5', metadata: { user_id: '5' } } },
    }, hooks);
    u = db.prepare('SELECT * FROM users WHERE id = 5').get();
    ok(u.plan_status === 'cancelled' && counts.can === 1, 'subscription.deleted: plan cancelado (espejo MP)');
    const evCount = db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get();
    ok(evCount.n === 5, `los 5 eventos quedaron registrados (idempotencia): ${evCount.n}`);
  }

  section('A7 · wiring en server.js (fuente)');
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const whIdx = serverSrc.indexOf("app.post('/api/billing/stripe/webhook'");
  const jsonIdx = serverSrc.indexOf('app.use(express.json(');
  ok(whIdx > -1 && jsonIdx > -1 && whIdx < jsonIdx, 'el webhook se registra ANTES del parser JSON (body crudo para la firma)');
  ok(serverSrc.includes("app.post('/api/billing/stripe/checkout', requireAuth"), 'endpoint de checkout autenticado');
  ok(serverSrc.includes("app.post('/api/billing/stripe/portal', requireAuth"), 'endpoint de portal autenticado');
  ok(serverSrc.includes('stripe_configured: stripeBilling.stripeConfigured()'), '/api/billing/plans expone stripe_configured');
  ok(/const BUILD_ID = '2026\d{4}-v\d+';/.test(serverSrc), 'BUILD_ID presente con forma válida (el pin fósil a v285 se corrigió en v317, precedente v311)');

  section('A8 · migración de precios (v317): el monto nuevo crea precio nuevo y transfiere el lookup_key');
  {
    const fake2 = makeFakeStripe();
    const olds = { esencial: 4900, pro: 9900, total: 14900 };
    for (const pid of Object.keys(olds)) {
      fake2._prices.set(sb.lookupKeyFor(pid), { id: 'price_old_' + pid, product: 'prod_' + pid, unit_amount: olds[pid], currency: 'usd', recurring: { interval: 'month' }, lookup_key: sb.lookupKeyFor(pid), active: true });
    }
    sb._clearPriceCache();
    const catM = await sb.ensureCatalog(fake2);
    const amountsM = ['esencial', 'pro', 'total'].map((x) => fake2._prices.get(sb.lookupKeyFor(x)).unit_amount);
    ok(JSON.stringify(amountsM) === JSON.stringify([19999, 29999, 39999]), `migración: los lookup_keys resuelven a los montos nuevos: ${amountsM}`);
    ok(fake2._calls.pricesCreate === 3 && fake2._calls.productsCreate === 0, 'migración: 3 precios nuevos y 0 productos nuevos (reusa el producto)');
    ok(catM.pro !== 'price_old_pro' && fake2._prices.get(sb.lookupKeyFor('pro')).product === 'prod_pro', 'migración: el precio nuevo cuelga del mismo producto');
    ok([...fake2._prices.values()].every((x) => x.transfer_lookup_key === true), 'migración: los precios nuevos piden transfer_lookup_key');
    sb._clearPriceCache();
  }

  section('A9 · precio fundador (v317): precio por monto de alta, idempotente');
  {
    const fake3 = makeFakeStripe();
    const proPlan = { id: 'pro', name: 'Pro', tagline: 'To actually grow' };
    const fp1 = await sb.ensureFounderPrice(fake3, proPlan, 79);
    const rec = fake3._prices.get(sb.founderLookupKeyFor('pro', 79));
    ok(!!fp1 && !!rec && rec.unit_amount === 7900 && rec.currency === 'usd', 'fundador: crea el precio con el monto exacto del alta (USD 79)');
    const fp2 = await sb.ensureFounderPrice(fake3, proPlan, 79);
    ok(fp2 === fp1 && fake3._calls.pricesCreate === 1, 'fundador: el segundo llamado reusa el precio (idempotente)');
    ok(sb.planIdFromLookupKey(sb.founderLookupKeyFor('pro', 79)) === 'pro', 'fundador: su lookup_key mapea al plan');
    ok(sb.planIdFromLookupKey('posty_us_pro_monthly') === 'pro', 'catálogo: el lookup_key clásico sigue mapeando al plan');
    const db3 = memDb();
    await sb.createCheckout(db3, fake3, { user: { id: 9, email: 'f@x.co' }, plan: proPlan, baseUrl: 'https://x', trialEndSec: null, priceId: fp1 });
    const sess = fake3._calls.sessionsCreate[fake3._calls.sessionsCreate.length - 1];
    ok(sess && sess.line_items[0].price === fp1, 'fundador: el checkout cobra el precio fundador cuando viene explícito');
    sb._clearPriceCache();
  }
}

async function partB() {
  section('B · E2E sin llaves — el sitio queda EXACTAMENTE como siempre');
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-stripe-stage-'));
  const skipDirs = new Set(['node_modules', 'data', '.git', '__pycache__']);
  fs.cpSync(__dirname, stage, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(__dirname, src);
      if (!rel) return true;
      const top = rel.split(path.sep)[0];
      if (skipDirs.has(top)) return false;
      if (/\.(mp4|zip)$/i.test(rel)) return false;
      return true;
    },
  });
  const overlay = process.env.POSTA_OVERLAY_DIR || '';
  if (overlay && fs.existsSync(overlay)) {
    for (const rel of ['db.js', 'public/app.js', 'public/index.html', 'public/chunk-ajustes.js', 'config/plans.js']) {
      const from = path.join(overlay, rel);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(stage, rel));
    }
  }
  fs.symlinkSync(path.join(__dirname, 'node_modules'), path.join(stage, 'node_modules'), 'junction');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'posta-stripe-data-'));
  const PORT = 4185;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: stage,
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), STRIPE_SECRET_KEY: '', STRIPE_PUBLISHABLE_KEY: '', STRIPE_WEBHOOK_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let bootLog = '';
  child.stdout.on('data', (d) => { bootLog += d; });
  child.stderr.on('data', (d) => { bootLog += d; });
  const base = `http://127.0.0.1:${PORT}`;
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try { const r = await fetch(base + '/api/version'); const j = await r.json(); if (j && /^2026\d{4}-v\d+$/.test(String(j.build || ''))) up = true; } catch (e) {}
      if (!up) await sleep(750);
    }
    ok(up, 'el servidor bootea y sirve su build (sin ninguna variable STRIPE_*)');
    if (!up) { console.error(bootLog.slice(-1200)); return; }
    const home = await fetch(base + '/');
    ok(home.status === 200, 'la home responde 200, intacta');
    const plans = await (await fetch(base + '/api/billing/plans?country=US')).json();
    ok(plans.currency === 'USD' && plans.stripe_configured === false, 'planes US en USD con stripe_configured=false');
    ok(JSON.stringify(plans.plans.map((p) => p.price)) === JSON.stringify([199.99, 299.99, 399.99]), 'precios US 199.99/299.99/399.99 desde PLANS_US');
    const plansAr = await (await fetch(base + '/api/billing/plans')).json();
    ok(plansAr.currency === 'ARS' && plansAr.mp_configured !== undefined, 'el flujo AR/MP no cambió');

    const email = `stripe-${Date.now()}@example.com`;
    const reg = await fetch(base + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'secreto123' }),
    });
    ok(reg.ok, 'registro de usuario de prueba');
    const cookie = (reg.headers.getSetCookie ? reg.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
    const seed = new DatabaseSync(path.join(dataDir, 'posta.db'));
    seed.exec('PRAGMA busy_timeout = 8000');
    seed.prepare("UPDATE users SET lang = 'en' WHERE email = ?").run(email);
    seed.close();
    const api = async (method, p, body) => {
      const r = await fetch(base + p, {
        method, headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    let r = await api('POST', '/api/billing/stripe/checkout', { plan: 'pro' });
    ok(r.status === 400 && /not configured/i.test(r.j.error || ''), 'checkout sin llaves: 400 limpio ("Payments are not configured yet.")');
    r = await api('POST', '/api/billing/stripe/portal', {});
    ok(r.status === 400 && /not configured/i.test(r.j.error || ''), 'portal sin llaves: 400 limpio');
    r = await api('GET', '/api/auth/me');
    ok(r.j.user && r.j.user.billing_provider === null, '/api/auth/me: billing_provider null (nadie cobra todavía)');
    const wh = await fetch(base + '/api/billing/stripe/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    ok(wh.status === 503, 'webhook sin STRIPE_WEBHOOK_SECRET: 503 fail-closed, no procesa');
  } finally {
    child.kill('SIGKILL');
  }
}

(async () => {
  try { await partA(); } catch (e) { fails++; console.error('Parte A explotó:', e); }
  try { await partB(); } catch (e) { fails++; console.error('Parte B explotó:', e); }
  console.log(fails === 0 ? '\nTODO VERDE ✅' : `\n${fails} FALLOS ❌`);
  process.exit(fails === 0 ? 0 : 1);
})();
