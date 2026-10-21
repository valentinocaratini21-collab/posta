// Stripe — suscripciones (Checkout + Billing) para cobrar los planes US (USD).
// Es el espejo del flujo de MercadoPago (mercadopago.js) para el frente EN:
// el servidor de Posty es el vendedor (cuenta PERSONAL de Stripe de Valentino,
// decisión 2026-10-20/21: NO merchant-of-record, NO Stripe Tax).
//
// FAIL-CLOSED Y SILENCIOSO sin llaves: si STRIPE_SECRET_KEY no está en el
// entorno, stripeConfigured() es false, ningún endpoint toca la API y el
// sitio/la app se comportan EXACTAMENTE como antes de este módulo.
// El webhook además exige STRIPE_WEBHOOK_SECRET: sin él, la ruta responde 503
// y no procesa nada.
//
// Modelo de estados (espejo de MP):
//   - suscripción Stripe active/trialing  → users.plan=<plan>, plan_status='active'
//   - past_due/unpaid                      → GRACIA: no se toca plan_status
//     (igual que MP: el plan sigue activo hasta que el proveedor cancela)
//   - canceled (subscription.deleted)      → plan_status='cancelled'
// Idempotencia: cada evento se registra en stripe_events (id = event id de
// Stripe); un evento repetido no se vuelve a aplicar.

const { PLANS_US, getPlans } = require('./config/plans');

function getSecretKey() { return (process.env.STRIPE_SECRET_KEY || '').trim(); }
function getWebhookSecret() { return (process.env.STRIPE_WEBHOOK_SECRET || '').trim(); }
function stripeConfigured() { return getSecretKey().length > 10; }
function webhookConfigured() { return getWebhookSecret().length > 5; }

let _client = null;
function stripeClient() {
  if (!stripeConfigured()) return null;
  if (!_client) {
    const Stripe = require('stripe');
    _client = new Stripe(getSecretKey());
  }
  return _client;
}
// Solo para tests: inyecta un cliente falso (o null para resetear).
function _setClient(c) { _client = c; }

function constructEvent(client, rawBody, signature) {
  return client.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
}

// ---------- Catálogo: 3 productos + precios USD con lookup_key estable ----------
const priceIdCache = new Map(); // planId -> priceId (por proceso)
function lookupKeyFor(planId) { return `posty_us_${planId}_monthly`; }
function planIdFromLookupKey(lk) {
  const m = /^posty_us_(esencial|pro|total)_monthly$/.exec(String(lk || ''));
  return m ? m[1] : null;
}

// Idempotente: busca por lookup_key; crea producto+precio solo si no existe.
// Nunca duplica en redeploys (la búsqueda por lookup_key es la fuente de verdad).
async function ensureCatalog(client) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const out = {};
  for (const plan of Object.values(getPlans('US'))) {
    if (priceIdCache.has(plan.id)) { out[plan.id] = priceIdCache.get(plan.id); continue; }
    const found = await client.prices.list({ lookup_keys: [lookupKeyFor(plan.id)], active: true, limit: 1 });
    let price = found && found.data && found.data[0];
    if (!price) {
      const product = await client.products.create({
        name: `Posty — ${plan.name}`,
        description: plan.tagline || undefined,
        metadata: { plan_id: plan.id, app: 'posty' },
      });
      price = await client.prices.create({
        product: product.id,
        unit_amount: Math.round(plan.price * 100),
        currency: 'usd',
        recurring: { interval: 'month' },
        lookup_key: lookupKeyFor(plan.id),
        metadata: { plan_id: plan.id },
      });
    }
    priceIdCache.set(plan.id, price.id);
    out[plan.id] = price.id;
  }
  return out;
}

// ---------- Customer: uno por usuario, guardado en users.stripe_customer_id ----------
async function getOrCreateCustomer(db, client, user) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  // ¿Ya existe en Stripe con nuestro metadata? (evita duplicar si la DB se reseteó)
  try {
    const found = await client.customers.list({ email: user.email, limit: 5 });
    const ours = (found.data || []).find((c) => c.metadata && String(c.metadata.user_id) === String(user.id));
    if (ours) {
      db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?').run(ours.id, user.id);
      return ours.id;
    }
  } catch (e) { /* si la búsqueda falla, creamos uno nuevo */ }
  const c = await client.customers.create({
    email: user.email,
    metadata: { user_id: String(user.id), app: 'posty' },
  });
  db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?').run(c.id, user.id);
  return c.id;
}

// ---------- Checkout ----------
// Params puros (testeables sin red). trialEndSec: epoch en segundos o null.
// OJO Stripe: trial_end en Checkout debe estar ≥48 h en el futuro; el caller
// (server.js) solo lo pasa cuando al trial de la app le quedan >48 h.
function buildCheckoutParams({ priceId, plan, user, baseUrl, trialEndSec }) {
  const params = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: String(user.id),
    metadata: { user_id: String(user.id), plan_id: plan.id },
    subscription_data: {
      metadata: { user_id: String(user.id), plan_id: plan.id },
    },
    success_url: `${baseUrl}/#/app/ajustes?plan=ok`,
    cancel_url: `${baseUrl}/#/app/ajustes?plan=error`,
  };
  if (user.stripe_customer_id) params.customer = user.stripe_customer_id;
  else if (user.email) params.customer_email = user.email;
  if (trialEndSec) params.subscription_data.trial_end = trialEndSec;
  return params;
}

async function createCheckout(db, client, { user, plan, baseUrl, trialEndSec }) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const prices = await ensureCatalog(client);
  const priceId = prices[plan.id];
  if (!priceId) throw new Error('No se pudo resolver el precio del plan');
  const customerId = await getOrCreateCustomer(db, client, user);
  const params = buildCheckoutParams({
    priceId, plan, baseUrl, trialEndSec,
    user: { ...user, stripe_customer_id: customerId },
  });
  const session = await client.checkout.sessions.create(params);
  return { url: session.url, session_id: session.id };
}

// ---------- Billing Portal (gestionar / cancelar) ----------
async function createPortalSession(client, { customerId, returnUrl }) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const s = await client.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return { url: s.url };
}

// ---------- Webhook: aplicación de eventos sobre el modelo de MP ----------
function userIdByCustomer(db, customerId) {
  if (!customerId) return null;
  const r = db.prepare('SELECT id FROM users WHERE stripe_customer_id = ?').get(String(customerId));
  return r ? r.id : null;
}
function userIdBySubscription(db, subId) {
  if (!subId) return null;
  const r = db.prepare('SELECT id FROM users WHERE stripe_subscription_id = ?').get(String(subId));
  return r ? r.id : null;
}
function planIdFromSubscription(sub) {
  if (sub && sub.metadata && PLANS_US[sub.metadata.plan_id]) return sub.metadata.plan_id;
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  return planIdFromLookupKey(item && item.price && item.price.lookup_key);
}

function applySubscription(db, sub, hooks, hints = {}) {
  if (!sub || !sub.id) return;
  const userId = (sub.metadata && Number(sub.metadata.user_id)) || hints.userIdHint
    || userIdByCustomer(db, sub.customer) || userIdBySubscription(db, sub.id);
  if (!userId) return;
  const planId = planIdFromSubscription(sub) || hints.planHint || null;
  try { db.prepare('UPDATE users SET stripe_subscription_id=? WHERE id=?').run(String(sub.id), userId); } catch (e) {}
  if (sub.status === 'active' || sub.status === 'trialing') {
    if (planId && PLANS_US[planId]) {
      db.prepare(`UPDATE users SET plan=?, plan_status='active', stripe_subscription_id=? WHERE id=?`)
        .run(planId, String(sub.id), userId);
      if (hooks && hooks.onActivated) hooks.onActivated(userId, planId);
    }
  } else if (sub.status === 'canceled') {
    db.prepare(`UPDATE users SET plan_status='cancelled' WHERE id=? AND stripe_subscription_id=?`)
      .run(userId, String(sub.id));
    if (hooks && hooks.onCancelled) hooks.onCancelled(userId);
  }
  // past_due / unpaid / incomplete: GRACIA (espejo MP) — no se toca plan_status.
}

async function processEvent(db, client, event, hooks = {}) {
  if (!event || !event.id || !event.type) return { ok: false, reason: 'bad-event' };
  // Idempotencia por event id: registrar ANTES de aplicar; si ya está, salir.
  const seen = db.prepare('SELECT id FROM stripe_events WHERE id = ?').get(event.id);
  if (seen) return { ok: true, duplicate: true };
  db.prepare('INSERT INTO stripe_events (id, type, received_at) VALUES (?,?,?)')
    .run(event.id, event.type, Date.now());
  const obj = (event.data && event.data.object) || {};
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode && obj.mode !== 'subscription') break;
      const userId = Number((obj.metadata && obj.metadata.user_id) || obj.client_reference_id) || null;
      const planId = (obj.metadata && obj.metadata.plan_id) || null;
      if (userId && obj.customer) {
        try { db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?').run(String(obj.customer), userId); } catch (e) {}
      }
      if (obj.subscription && client && client.subscriptions) {
        const sub = await client.subscriptions.retrieve(String(obj.subscription));
        applySubscription(db, sub, hooks, { userIdHint: userId, planHint: planId });
      } else if (userId && planId && PLANS_US[planId]) {
        db.prepare(`UPDATE users SET plan=?, plan_status='active', stripe_subscription_id=? WHERE id=?`)
          .run(planId, String(obj.subscription || ''), userId);
        if (hooks.onActivated) hooks.onActivated(userId, planId);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      applySubscription(db, obj, hooks);
      break;
    }
    case 'customer.subscription.deleted': {
      const userId = (obj.metadata && Number(obj.metadata.user_id))
        || userIdByCustomer(db, obj.customer) || userIdBySubscription(db, obj.id);
      if (userId) {
        db.prepare(`UPDATE users SET plan_status='cancelled' WHERE id=? AND stripe_subscription_id=?`)
          .run(userId, String(obj.id));
        if (hooks.onCancelled) hooks.onCancelled(userId);
      }
      break;
    }
    case 'invoice.paid': {
      const userId = userIdByCustomer(db, obj.customer);
      if (userId && hooks.onPaymentOk) hooks.onPaymentOk(userId, null);
      break;
    }
    case 'invoice.payment_failed': {
      // GRACIA (espejo MP): se registra el fallo pero el plan NO se cancela;
      // Stripe reintenta y solo un subscription.deleted cancela.
      const userId = userIdByCustomer(db, obj.customer);
      if (userId && hooks.onPaymentFailed) hooks.onPaymentFailed(userId, null);
      break;
    }
    default:
      break; // eventos que no nos importan: 200 igual (ya registrados)
  }
  return { ok: true };
}

module.exports = {
  stripeConfigured, webhookConfigured, stripeClient, _setClient,
  constructEvent, ensureCatalog, getOrCreateCustomer,
  buildCheckoutParams, createCheckout, createPortalSession,
  processEvent, applySubscription,
  lookupKeyFor, planIdFromLookupKey, planIdFromSubscription,
};
