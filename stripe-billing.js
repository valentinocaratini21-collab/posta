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
  const m = /^posty_us_(esencial|pro|total)_(monthly|founder_\d+)$/.exec(String(lk || ''));
  return m ? m[1] : null;
}
function founderLookupKeyFor(planId, amountUsd) { return `posty_us_${planId}_founder_${Math.round(Number(amountUsd) * 100)}`; }

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
    const wantCents = Math.round(plan.price * 100);
    if (price && Number(price.unit_amount) !== wantCents) {
      // (v317 · suba 2026-10-21) Los precios de Stripe son INMUTABLES: si el
      // monto del catálogo cambió, se crea un precio NUEVO sobre el mismo
      // producto y se le transfiere el lookup_key (el precio viejo queda
      // desactivado). Las suscripciones ya creadas conservan su precio:
      // Stripe jamás las re-precifica solas.
      price = await client.prices.create({
        product: price.product,
        unit_amount: wantCents,
        currency: 'usd',
        recurring: { interval: 'month' },
        lookup_key: lookupKeyFor(plan.id),
        transfer_lookup_key: true,
        metadata: { plan_id: plan.id },
      });
    }
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
    // (ARMA TODO ítem 1) El éxito aterriza en LA SEMANA (schedule?plan=ok): ahí
    // vive la bienvenida post-pago de app.js. El abandono vuelve a Ajustes.
    success_url: `${baseUrl}/#/app/schedule?plan=ok`,
    cancel_url: `${baseUrl}/#/app/ajustes?plan=error`,
    // (LOTE AGREGAR-TARJETA) La tarjeta de la suscripción queda guardada
    // como la de pago por defecto: así sirve para Ads (Cargar/Impulsar
    // off-session) sin agregarla de nuevo. En modo subscription Stripe
    // ya guarda la tarjeta en el cliente; este parámetro lo deja
    // explícito como default de la suscripción. El webhook además la fija
    // como default del cliente (ver processEvent), que es lo que lee el
    // cobro de la billetera.
    payment_settings: { save_default_payment_method: 'on_subscription' },
  };
  if (user.stripe_customer_id) params.customer = user.stripe_customer_id;
  else if (user.email) params.customer_email = user.email;
  if (trialEndSec) params.subscription_data.trial_end = trialEndSec;
  return params;
}

// ---------- Precio fundador (v317): el alta paga de Los Primeros 200 ----------
// Precio de Stripe con el monto EXACTO del alta del fundador (lookup_key por
// monto: idempotente y compartido por todos los fundadores del mismo monto).
// Se usa solo cuando un fundador re-suscribe dentro de sus 12 meses.
const founderPriceCache = new Map(); // lookup_key -> priceId (por proceso)
async function ensureFounderPrice(client, plan, amountUsd) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const cents = Math.round(Number(amountUsd) * 100);
  if (!plan || !plan.id || !(cents > 0)) throw new Error('Precio fundador inválido');
  const lk = founderLookupKeyFor(plan.id, amountUsd);
  if (founderPriceCache.has(lk)) return founderPriceCache.get(lk);
  const found = await client.prices.list({ lookup_keys: [lk], active: true, limit: 1 });
  let price = found && found.data && found.data[0];
  if (!price) {
    let productId = null;
    try {
      const cat = await client.prices.list({ lookup_keys: [lookupKeyFor(plan.id)], active: true, limit: 1 });
      if (cat && cat.data && cat.data[0]) productId = cat.data[0].product;
    } catch (e) { /* si falla, se crea el producto abajo */ }
    if (!productId) {
      const product = await client.products.create({
        name: `Posty — ${plan.name}`,
        description: plan.tagline || undefined,
        metadata: { plan_id: plan.id, app: 'posty' },
      });
      productId = product.id;
    }
    price = await client.prices.create({
      product: productId,
      unit_amount: cents,
      currency: 'usd',
      recurring: { interval: 'month' },
      lookup_key: lk,
      metadata: { plan_id: plan.id, founder: '1' },
    });
  }
  founderPriceCache.set(lk, price.id);
  return price.id;
}
// Solo para tests: limpia las cachés de precios del proceso.
function _clearPriceCache() { priceIdCache.clear(); founderPriceCache.clear(); }

async function createCheckout(db, client, { user, plan, baseUrl, trialEndSec, priceId: priceOverride }) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const prices = priceOverride ? null : await ensureCatalog(client);
  const priceId = priceOverride || (prices && prices[plan.id]);
  if (!priceId) throw new Error('No se pudo resolver el precio del plan');
  const customerId = await getOrCreateCustomer(db, client, user);
  const params = buildCheckoutParams({
    priceId, plan, baseUrl, trialEndSec,
    user: { ...user, stripe_customer_id: customerId },
  });
  const session = await client.checkout.sessions.create(params);
  return { url: session.url, session_id: session.id };
}

// ---------- Agregar tarjeta (LOTE AGREGAR-TARJETA) ----------
// Checkout en modo setup: guarda la tarjeta sin cobrar nada. La sesión
// se crea con el customer (getOrCreateCustomer lo guarda en la BD), y
// el webhook la deja como la de pago por defecto del cliente — la que
// usa Cargar/Impulsar off-session. Solo tarjetas: el cobro de la
// billetera solo cobra tarjetas (type: 'card'). En modo setup Stripe
// exige currency con los métodos de pago dinámicos.
// Pura y testeable: no llama a Stripe.
function buildSetupParams({ user, baseUrl }) {
  const customerId = (user && user.stripe_customer_id) || '';
  return {
    mode: 'setup',
    customer: customerId,
    currency: 'usd',
    payment_method_types: ['card'],
    client_reference_id: String(user.id),
    metadata: { user_id: String(user.id), flujo: 'agregar_tarjeta' },
    success_url: `${baseUrl}/#/app/ads?tarjeta=ok`,
    cancel_url: `${baseUrl}/#/app/ads?tarjeta=cancel`,
  };
}
async function createSetupSession(db, client, { user, baseUrl }) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const customerId = await getOrCreateCustomer(db, client, user);
  const params = buildSetupParams({ user: { ...user, stripe_customer_id: customerId }, baseUrl });
  try {
    const session = await client.checkout.sessions.create(params);
    return { url: session.url, session_id: session.id };
  } catch (e) {
    // (LOTE AGREGAR-TARJETA-INLINE) El customer guardado puede estar
    // inválido en Stripe (borrado, o de otro modo): la sesión no se crea
    // y el botón parecía no hacer nada. Se limpia el id guardado y se
    // reintenta una sola vez con un customer nuevo.
    if (/No such customer/i.test(String((e && e.message) || ''))) {
      try { db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run('', user.id); } catch (err) {}
      const freshId = await getOrCreateCustomer(db, client, { ...user, stripe_customer_id: '' });
      const params2 = buildSetupParams({ user: { ...user, stripe_customer_id: freshId }, baseUrl });
      const session2 = await client.checkout.sessions.create(params2);
      return { url: session2.url, session_id: session2.id };
    }
    throw e;
  }
}
// (LOTE AGREGAR-TARJETA-INLINE) Adjunta un PaymentMethod (pm_*) creado por
// Stripe.js (form inline) al customer del usuario y lo deja como default.
// El número, el vencimiento y el CVC nunca pasan por acá: solo el id.
// Reenvío del mismo form: si el PM ya está adjunto a ESTE cliente, se
// sigue igual (idempotente). Si fijar la default falla, el PM igual queda
// adjunto y el cobro lo toma como el más reciente (resolverTarjetaGuardada).
async function adjuntarTarjeta(db, client, user, pmId) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  if (!/^pm_[A-Za-z0-9]+$/.test(String(pmId || ''))) throw new Error('PaymentMethod inválido');
  const customerId = await getOrCreateCustomer(db, client, user);
  try {
    await client.paymentMethods.attach(pmId, { customer: customerId });
  } catch (e) {
    let pm = null;
    try { pm = await client.paymentMethods.retrieve(pmId); } catch (err) {}
    if (!pm || pm.customer !== customerId) throw e;
  }
  await fijarTarjetaPorDefecto(client, customerId, pmId);
  let pm = null;
  try { pm = await client.paymentMethods.retrieve(pmId); } catch (err) {}
  const card = (pm && pm.card) || {};
  return { customerId, brand: card.brand || '', last4: card.last4 || '' };
}
// Deja la tarjeta como la de pago por defecto del cliente (la que lee
// el cobro de la billetera). Idempotente: fijar la misma dos veces no
// cambia nada. Nunca tira: un fallo se loguea y se devuelve false para
// no entrar en reintentos de Stripe.
async function fijarTarjetaPorDefecto(client, customerId, pmId) {
  if (!client || !customerId || !pmId) return false;
  try {
    await client.customers.update(String(customerId), { invoice_settings: { default_payment_method: String(pmId) } });
    return true;
  } catch (e) {
    console.error('[stripe] fijarTarjetaPorDefecto:', e.message);
    return false;
  }
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
  if (!userId) { console.error('[stripe] applySubscription sin usuario: sub', sub.id, 'customer', sub.customer); return; }
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
  // Idempotencia por event id: si ya se APLICÓ, salir. El registro se hace
  // DESPUÉS de aplicar (antes se registraba primero y un fallo al aplicar —
  // p.ej. subscriptions.retrieve — dejaba el evento marcado: el reintento
  // de Stripe se descartaba como "duplicado" y el plan nunca activaba).
  const seen = db.prepare('SELECT id FROM stripe_events WHERE id = ?').get(event.id);
  if (seen) return { ok: true, duplicate: true };
  const obj = (event.data && event.data.object) || {};
  switch (event.type) {
    case 'checkout.session.completed': {
      // (LOTE AGREGAR-TARJETA) Modo setup: guardar la tarjeta sin cobrar.
      // El webhook es la fuente de verdad (no el redirect, que se puede
      // saltear): guarda el customer y deja la tarjeta nueva como la de
      // pago por defecto del cliente — la que usa Cargar/Impulsar
      // off-session. Otros modos que no son subscription ni setup se
      // ignoran (se registran abajo como procesados, sin aplicar nada).
      // Nada de esto tira: un fallo al fijar la default se loguea y el
      // evento se registra igual (la tarjeta ya quedó attachada al
      // cliente y el cobro la encuentra por listado más-reciente-primero).
      if (obj.mode === 'setup') {
        const setupUserId = Number((obj.metadata && obj.metadata.user_id) || obj.client_reference_id) || null;
        if (setupUserId && obj.customer) {
          try { db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?').run(String(obj.customer), setupUserId); } catch (e) {}
        }
        if (obj.customer && obj.setup_intent && client && client.setupIntents) {
          try {
            const si = await client.setupIntents.retrieve(String(obj.setup_intent));
            const pmId = si && si.payment_method;
            if (pmId) await fijarTarjetaPorDefecto(client, String(obj.customer), String(pmId));
          } catch (e) { console.error('[stripe] setup: no se pudo fijar la tarjeta por defecto:', e.message); }
        }
        break;
      }
      if (obj.mode && obj.mode !== 'subscription') break;
      const userId = Number((obj.metadata && obj.metadata.user_id) || obj.client_reference_id) || null;
      const planId = (obj.metadata && obj.metadata.plan_id) || null;
      if (userId && obj.customer) {
        try { db.prepare('UPDATE users SET stripe_customer_id=? WHERE id=?').run(String(obj.customer), userId); } catch (e) {}
      }
      if (obj.subscription && client && client.subscriptions) {
        const sub = await client.subscriptions.retrieve(String(obj.subscription));
        applySubscription(db, sub, hooks, { userIdHint: userId, planHint: planId });
        // (LOTE AGREGAR-TARJETA) La tarjeta de la suscripción queda como
        // la de pago por defecto del cliente: así sirve para Ads (Cargar/
        // Impulsar off-session) sin agregarla de nuevo. El webhook es la
        // fuente de verdad (el redirect se puede saltear).
        const subPm = sub && sub.default_payment_method;
        const subPmId = typeof subPm === 'string' ? subPm : (subPm && subPm.id);
        if (subPmId && sub.customer) await fijarTarjetaPorDefecto(client, String(sub.customer), String(subPmId));
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
      break; // eventos que no nos importan: 200 igual (se registran abajo)
  }
  // Recién ahora el evento queda registrado como procesado. Si el switch
  // lanzó, processEvent propaga y el webhook responde 500 SIN registrar:
  // Stripe reintenta y el evento se aplica de verdad.
  try { db.prepare('INSERT INTO stripe_events (id, type, received_at) VALUES (?,?,?)').run(event.id, event.type, Date.now()); } catch (e) {}
  return { ok: true };
}

// ---------- Carga de billetera con Apple Pay (LOTE BILLETERA-APPLE-PAY) ----------
// El cliente confirma el pago en el sheet de Apple Pay (Express Checkout
// Element); el servidor solo CREA el PaymentIntent (sin cobrar) y luego lo
// VERIFICA en /confirmar antes de acreditar. El Payment Request Button
// está DEPRECADO en Stripe.js: no se usa.
//   setup_future_usage 'off_session': la tarjeta que el cliente usó en
//   Apple Pay queda guardada como default del cliente para las próximas
//   cargas de un toque (sin tipear nada). La metadata (flujo + user_id +
//   ref) es lo que /confirmar valida: sin ella, ningún PaymentIntent
//   acredita la billetera.
// Parámetros puros (testeables sin red). Monto en dólares, uno de 20/50/100.
function buildTopupIntentParams({ customerId, montoUSD, ref, userId }) {
  if (!customerId) throw new Error('Falta el cliente de Stripe');
  if (![20, 50, 100].includes(Number(montoUSD))) throw new Error('Monto inválido');
  if (!ref) throw new Error('Falta el ref de la carga');
  return {
    amount: Number(montoUSD) * 100,
    currency: 'usd',
    customer: customerId,
    payment_method_types: ['card'],
    setup_future_usage: 'off_session',
    description: `Posty · Carga billetera ads $${montoUSD} (Apple Pay)`,
    metadata: { app: 'posty', flujo: 'carga_apple_pay', user_id: String(userId), monto_usd: String(montoUSD), ref: String(ref) },
  };
}
async function crearTopupIntent(client, input) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const params = buildTopupIntentParams(input || {});
  const pi = await client.paymentIntents.create(params);
  if (!pi || !pi.id || !pi.client_secret) throw new Error('No se pudo crear el intento de pago');
  return { paymentIntentId: pi.id, clientSecret: pi.client_secret, ref: params.metadata.ref };
}
// Valida un PaymentIntent ya cobrado antes de acreditar la carga: tiene
// que estar succeeded, en USD, con el monto de una carga y la metadata de
// ESTE usuario y este flujo. Cualquier otra cosa es un motivo, nunca un
// crédito. Pura.
function validarTopupIntent(pi, userId) {
  if (!pi || !pi.id) return { ok: false, motivo: 'pago_no_encontrado' };
  if (pi.status !== 'succeeded') {
    const pendiente = pi.status === 'requires_action' || pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation';
    return { ok: false, motivo: pendiente ? 'pago_pendiente' : 'pago_no_confirmado', piStatus: pi.status };
  }
  if (String(pi.currency || '').toLowerCase() !== 'usd') return { ok: false, motivo: 'pago_moneda_invalida' };
  const montoUSD = Math.round(Number(pi.amount || 0) / 100);
  if (![20, 50, 100].includes(montoUSD) || Number(pi.amount) !== montoUSD * 100) return { ok: false, motivo: 'pago_monto_invalido' };
  const md = pi.metadata || {};
  if (String(md.flujo || '') !== 'carga_apple_pay') return { ok: false, motivo: 'pago_flujo_invalido' };
  if (String(md.user_id || '') !== String(userId)) return { ok: false, motivo: 'pago_usuario_invalido' };
  if (!md.ref) return { ok: false, motivo: 'pago_sin_ref' };
  const pm = pi.payment_method;
  return { ok: true, montoUSD, ref: String(md.ref), cobroId: pi.id, paymentMethodId: (typeof pm === 'string' ? pm : (pm && pm.id)) || '' };
}
// Recupera el PaymentIntent en Stripe y lo valida para acreditar.
// El id tiene que tener formato pi_*: cualquier otra cosa es
// 'pago_no_encontrado' sin llamar a Stripe.
async function recuperarTopupIntent(client, paymentIntentId, userId) {
  client = client || stripeClient();
  if (!client) throw new Error('Stripe no configurado');
  const id = String(paymentIntentId || '').trim();
  if (!/^pi_[A-Za-z0-9]+$/.test(id)) return { ok: false, motivo: 'pago_no_encontrado' };
  const pi = await client.paymentIntents.retrieve(id);
  return validarTopupIntent(pi, userId);
}

module.exports = {
  stripeConfigured, webhookConfigured, stripeClient, _setClient,
  constructEvent, ensureCatalog, ensureFounderPrice, founderLookupKeyFor, _clearPriceCache, getOrCreateCustomer,
  buildCheckoutParams, createCheckout, createPortalSession,
  buildSetupParams, createSetupSession, fijarTarjetaPorDefecto, adjuntarTarjeta,
  processEvent, applySubscription,
  lookupKeyFor, planIdFromLookupKey, planIdFromSubscription,
  buildTopupIntentParams, crearTopupIntent, validarTopupIntent, recuperarTopupIntent,
};
