// test-lote-agregar-tarjeta.js — LOTE AGREGAR-TARJETA-INLINE (base v896, BUILD v900 — re-base sobre v896).
// Valentino (11/11 13:32, mirando la prueba real de Ads): «cuando aprietan
// "agregar tarjeta" tiene que aparecer para poner la tarjeta ahi, y listo».
// Prueba real 11/11 13:48: el botón NO hacía nada (5 toques, dos cargas,
// también en móvil) y en la hoja Impulsar el toque fallaba siempre con
// «No se pudo abrir el pago seguro» sin abrir ningún checkout. Causas:
//  1. El setup de Stripe fallaba del lado del servidor y el aviso no tenía
//     dónde mostrarse en el tab Ads (anaTarjetaMsgEl no conocía #pzAdsMsg:
//     el botón parecía no hacer nada aunque el POST fallara).
//  2. El flujo era solo redirect a la página alojada de Stripe; ahora el
//     camino principal es el FORM INLINE (Stripe Elements) en la misma
//     pantalla de Ads: número, vencimiento, CVC + nombre; la tarjeta se
//     guarda vía POST /api/billing/stripe/payment-method (solo viaja el id
//     pm_*; el número nunca toca nuestro servidor) y queda como default
//     para Cargar/Impulsar de un toque. El redirect alojado queda como
//     respaldo si Stripe.js o la config no están.
// Lo que se verifica (Node puro, lee el árbol, sin red ni clave real):
//  1. La tarjeta de la suscripción queda reutilizable para Ads (sin cambio).
//  2. La sesión setup se crea con el customer correcto; si el customer
//     guardado está inválido en Stripe, se limpia y se reintenta una vez
//     con un customer nuevo (el fallo que dejaba el botón mudo).
//  3. Agregar otra tarjeta cambia la activa (sin cambio).
//  4. CLIENTE INLINE: la billetera del tab Ads tiene el botón «Agregar
//     tarjeta»/«Cambiar tarjeta •••• last4» + contenedor #pzAdsTarjeta; el
//     toque abre el form inline en la misma pantalla (sin navegación, sin
//     abrir el navegador); el form tiene número, vencimiento, CVC y nombre;
//     guardar manda solo el pm_* y deja la tarjeta lista para un toque
//     (la billetera se refresca y el mensaje lo confirma); si Stripe.js o
//     la config fallan, aparece el botón al pago alojado (nunca silencio);
//     anaAgregarTarjeta abre el inline primero y cae al redirect solo si
//     no hay inline; el fallo del setup en el tab Ads SÍ se ve (#pzAdsMsg).
//  5. Endpoints nuevos: GET /api/billing/stripe/config y POST
//     /api/billing/stripe/payment-method (fail-closed 400 sin Stripe;
//     el pmId se valida con regex; la tarjeta nunca viaja en claro).
//  6. adjuntarTarjeta: adjunta + deja default + devuelve marca/últimos 4;
//     reenvío del mismo form (ya adjunto a este cliente) no rompe; adjunto
//     a otro cliente tira; pmId inválido tira.
//  7. M78: todo lo llamado desde los botones existe definido.
// El camino de éxito con clave Stripe real (sesión setup real + webhook +
// cobro real) NO se puede verificar sin una clave real: queda como límite
// declarado en STATUS.md; la suite cubre ese camino con cliente falso.
// Uso: node test-lote-agregar-tarjeta.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { DatabaseSync } = require('node:sqlite');

delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_PUBLISHABLE_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;

let ok = 0, bad = 0;
const t = (cond, name) => { if (cond) { ok++; } else { bad++; console.log('✗', name); } };
const chunk = fs.readFileSync(path.join(__dirname, 'public/chunk-analisis.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const sb = require('./stripe-billing');
const dc = require('./destacado-cobro');

// Extrae una función por nombre contando llaves (sirve para `function` y
// para `async function`: conserva el `async` para que el `await` del
// cuerpo no sea un error de sintaxis al evaluarla).
function extractFn(src, name) {
  const start0 = src.indexOf('function ' + name + '(');
  if (start0 < 0) return '';
  const isAsync = src.slice(Math.max(0, start0 - 6), start0) === 'async ';
  const start = isAsync ? start0 - 6 : start0;
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}
// Carga una función extraída en el sandbox como globalThis.<nombre>.
function loadFn(sbx, src, name) {
  const c = extractFn(src, name);
  if (!c) return false;
  const repl = c.startsWith('async ')
    ? c.replace('async function ' + name, 'globalThis.' + name + ' = async function')
    : c.replace('function ' + name, 'globalThis.' + name + ' = function');
  vm.runInContext(repl, sbx);
  return true;
}

function memDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, plan TEXT DEFAULT 'trial',
             plan_status TEXT DEFAULT 'trial', stripe_customer_id TEXT DEFAULT '',
             stripe_subscription_id TEXT DEFAULT '');
           CREATE TABLE stripe_events (id TEXT PRIMARY KEY, type TEXT DEFAULT '', received_at INTEGER DEFAULT 0);`);
  return db;
}

// Cliente falso de Stripe: customers + paymentMethods + setupIntents +
// checkout.sessions + subscriptions + paymentIntents. El listado de
// tarjetas devuelve la más reciente primero (como Stripe de verdad).
function makeFakeStripe() {
  let seq = 0;
  const customers = new Map();
  const pms = [];
  const subs = new Map();
  const setupByIntent = new Map();
  const calls = { customersCreate: 0, customersUpdate: [], sessionsCreate: [], paymentIntentsCreate: [], setupIntentsRetrieve: [], pmAttach: [] };
  const api = {
    _customers: customers, _pms: pms, _subs: subs, _calls: calls,
    customers: {
      list: async ({ email } = {}) => ({ data: [...customers.values()].filter((c) => !email || c.email === email) }),
      create: async (p) => { calls.customersCreate++; const c = { id: 'cus_' + (++seq), invoice_settings: {}, ...p }; customers.set(c.id, c); return c; },
      retrieve: async (id) => { const c = customers.get(id); if (!c) throw new Error('No such customer'); return c; },
      update: async (id, patch) => {
        const c = customers.get(id); if (!c) throw new Error('No such customer');
        calls.customersUpdate.push({ id, patch });
        if (patch.invoice_settings) c.invoice_settings = { ...(c.invoice_settings || {}), ...patch.invoice_settings };
        return c;
      },
    },
    paymentMethods: {
      list: async ({ customer, type, limit }) => {
        const data = pms.filter((pm) => pm.customer === customer).slice().reverse().slice(0, limit || 10);
        return { data };
      },
      retrieve: async (id) => { const pm = pms.find((x) => x.id === id); if (!pm) throw new Error('No such payment_method'); return pm; },
      attach: async (id, { customer }) => {
        calls.pmAttach.push({ id, customer });
        const pm = pms.find((x) => x.id === id);
        if (!pm) throw new Error('No such payment_method');
        if (pm.customer && pm.customer !== customer) throw new Error('This PaymentMethod was previously used without being attached to a Customer or was detached from a Customer, and may not be used again.');
        pm.customer = customer;
        return pm;
      },
    },
    setupIntents: { retrieve: async (id) => { calls.setupIntentsRetrieve.push(id); return { id, payment_method: setupByIntent.get(id) || null }; } },
    checkout: { sessions: { create: async (params) => { calls.sessionsCreate.push(params); return { id: 'cs_' + (++seq), url: 'https://checkout.stripe.com/c/pay/cs_test' }; } } },
    subscriptions: { retrieve: async (id) => { const s = subs.get(id); if (!s) throw new Error('No such subscription'); return s; } },
    paymentIntents: { create: async (params, opts) => { calls.paymentIntentsCreate.push({ params, opts }); return { id: 'pi_' + (++seq), status: 'succeeded' }; } },
  };
  api._addCard = (customer, brand, last4) => { const pm = { id: 'pm_' + (++seq), customer, card: { brand, last4 }, type: 'card' }; pms.push(pm); return pm; };
  api._addUnattachedCard = (brand, last4) => { const pm = { id: 'pm_' + (++seq), customer: null, card: { brand, last4 }, type: 'card' }; pms.push(pm); return pm; };
  api._setSetupIntent = (siId, pmId) => setupByIntent.set(siId, pmId);
  api._addCustomer = (id) => { const c = { id, invoice_settings: {} }; customers.set(id, c); return c; };
  return api;
}

// ---------- Mini DOM falso para las funciones del chunk ----------
function fakeButton() {
  const b = { type: 'button', className: '', textContent: '', onclick: null, disabled: false,
    _attrs: {}, setAttribute(k, v) { this._attrs[k] = v; },
    parentNode: { children: [], querySelector: () => null, appendChild(el) { el.parentNode = this; this.children.push(el); } },
    insertAdjacentElement(pos, el) { if (pos === 'afterend') { el.parentNode = this.parentNode; this.parentNode.children.push(el); } },
    remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } } };
  return b;
}
function fakeMsgEl() {
  const parent = { children: [], querySelector(sel) { return this.children.find((c) => c.className === sel.replace(/^\./, '')) || null; } };
  const m = { id: 'anaBoostRecMsg', textContent: '', parentNode: parent,
    insertAdjacentElement(pos, el) { if (pos === 'afterend') { const i = parent.children.indexOf(m); parent.children.splice(i + 1, 0, el); el.parentNode = parent; } } };
  parent.children.push(m);
  return { msg: m, parent };
}

(async () => {
  // ---------- 1. PARTE 1: la tarjeta de la suscripción sirve para Ads ----------
  const params = sb.buildCheckoutParams({
    priceId: 'price_pro', plan: { id: 'pro' }, baseUrl: 'https://postyhacetodo.com',
    user: { id: 42, email: 'shop@example.com', stripe_customer_id: 'cus_42' }, trialEndSec: null,
  });
  t(params.payment_settings && params.payment_settings.save_default_payment_method === 'on_subscription',
    'parte 1 · buildCheckoutParams: save_default_payment_method = on_subscription (la tarjeta de la suscripción queda guardada como default)');
  t(params.mode === 'subscription', 'parte 1 · el checkout de suscripción sigue siendo mode subscription (sin cambio de flujo)');

  // El webhook de suscripción fija la tarjeta como default del cliente.
  {
    const db = memDb();
    db.prepare("INSERT INTO users (id, email) VALUES (9, 'owner@shop.com')").run();
    const fake = makeFakeStripe();
    fake._addCustomer('cus_1');
    const pmSub = fake._addCard('cus_1', 'visa', '4242');
    fake._subs.set('sub_1', { id: 'sub_1', customer: 'cus_1', status: 'active',
      metadata: { user_id: '9', plan_id: 'pro' }, default_payment_method: pmSub.id });
    const r = await sb.processEvent(db, fake, { id: 'evt_sub_1', type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', customer: 'cus_1', subscription: 'sub_1',
        metadata: { user_id: '9', plan_id: 'pro' }, client_reference_id: '9' } } }, {});
    t(r && r.ok, 'parte 1 · webhook suscripción: evento aplicado sin error');
    const upd = fake._calls.customersUpdate.find((c) => c.id === 'cus_1');
    t(!!upd && upd.patch.invoice_settings && upd.patch.invoice_settings.default_payment_method === pmSub.id,
      'parte 1 · webhook suscripción: la tarjeta de la suscripción queda como default del cliente (invoice_settings.default_payment_method)');
    const u = db.prepare('SELECT plan, plan_status, stripe_customer_id FROM users WHERE id = 9').get();
    t(u.plan === 'pro' && u.plan_status === 'active' && u.stripe_customer_id === 'cus_1',
      'parte 1 · webhook suscripción: el plan sigue activándose igual que antes (sin regresión)');
    // El cobro de la billetera encuentra esa tarjeta y la cobra off-session.
    const res = await dc.resolverTarjetaGuardada(fake, 'cus_1');
    t(res === pmSub.id, 'parte 1 · resolverTarjetaGuardada: prefiere la default del cliente (la de la suscripción)');
    const cobro = await dc.cobrarCargaBilletera({ client: fake, customerId: 'cus_1', montoUSD: 20, ref: 'test-parte1' });
    t(cobro && cobro.ok, 'parte 1 · cobrarCargaBilletera: cobra $20 con la tarjeta de la suscripción');
    const pi = fake._calls.paymentIntentsCreate[0];
    t(pi && pi.params.payment_method === pmSub.id && pi.params.off_session === true && pi.params.confirm === true,
      'parte 1 · el cobro es off-session, confirmado, con la tarjeta de la suscripción');
  }

  // ---------- 2. PARTE 2: sesión setup ----------
  const sp = sb.buildSetupParams({ user: { id: 7, stripe_customer_id: 'cus_7' }, baseUrl: 'https://postyhacetodo.com' });
  t(sp.mode === 'setup', 'parte 2 · buildSetupParams: mode = setup');
  t(sp.customer === 'cus_7', 'parte 2 · buildSetupParams: la sesión lleva el customer del usuario');
  t(sp.currency === 'usd', 'parte 2 · buildSetupParams: currency usd (obligatoria en modo setup)');
  t(Array.isArray(sp.payment_method_types) && sp.payment_method_types.length === 1 && sp.payment_method_types[0] === 'card',
    'parte 2 · buildSetupParams: solo tarjetas (el cobro de la billetera solo cobra tarjetas)');
  t(sp.success_url.endsWith('/#/app/ads?tarjeta=ok') && sp.cancel_url.endsWith('/#/app/ads?tarjeta=cancel'),
    'parte 2 · buildSetupParams: retornos a Ads con ?tarjeta=ok / ?tarjeta=cancel');
  t(sp.metadata && sp.metadata.user_id === '7' && sp.metadata.flujo === 'agregar_tarjeta' && sp.client_reference_id === '7',
    'parte 2 · buildSetupParams: metadata con user_id y flujo agregar_tarjeta');

  // createSetupSession: crea el customer si falta y lo guarda; lo reusa si existe.
  {
    const db = memDb();
    db.prepare("INSERT INTO users (id, email) VALUES (11, 'nuevo@shop.com')").run();
    const fake = makeFakeStripe();
    const user = db.prepare('SELECT * FROM users WHERE id = 11').get();
    const out = await sb.createSetupSession(db, fake, { user, baseUrl: 'https://postyhacetodo.com' });
    t(out && out.url && out.url.startsWith('https://checkout.stripe.com/'), 'parte 2 · createSetupSession: devuelve la URL de Checkout');
    const saved = db.prepare('SELECT stripe_customer_id FROM users WHERE id = 11').get();
    t(!!saved.stripe_customer_id, 'parte 2 · createSetupSession: el customer id quedó guardado en el usuario');
    const sent = fake._calls.sessionsCreate[fake._calls.sessionsCreate.length - 1];
    t(sent.mode === 'setup' && sent.customer === saved.stripe_customer_id, 'parte 2 · la sesión setup se crea con el customer guardado');
    const before = fake._calls.customersCreate;
    const user2 = db.prepare('SELECT * FROM users WHERE id = 11').get();
    await sb.createSetupSession(db, fake, { user: user2, baseUrl: 'https://postyhacetodo.com' });
    t(fake._calls.customersCreate === before, 'parte 2 · segundo setup con customer existente: NO crea otro customer');
  }

  // (INLINE) Customer guardado inválido en Stripe: se limpia y se reintenta
  // una sola vez con un customer nuevo (el fallo que dejaba el botón mudo).
  {
    const db = memDb();
    db.prepare("INSERT INTO users (id, email, stripe_customer_id) VALUES (13, 'viejo@shop.com', 'cus_borrado')").run();
    const fake = makeFakeStripe();
    let first = true;
    const origCreate = fake.checkout.sessions.create;
    fake.checkout.sessions.create = async (params) => {
      if (first && params.customer === 'cus_borrado') { first = false; throw new Error('No such customer: cus_borrado'); }
      return origCreate(params);
    };
    const user = db.prepare('SELECT * FROM users WHERE id = 13').get();
    const out = await sb.createSetupSession(db, fake, { user, baseUrl: 'https://postyhacetodo.com' });
    t(out && out.url && out.url.startsWith('https://checkout.stripe.com/'), 'parte 2 · setup con customer inválido: igual devuelve la URL (reintento con customer nuevo)');
    const saved = db.prepare('SELECT stripe_customer_id FROM users WHERE id = 13').get();
    t(saved.stripe_customer_id && saved.stripe_customer_id !== 'cus_borrado', 'parte 2 · setup con customer inválido: el id guardado se reemplazó por el nuevo');
    const sent = fake._calls.sessionsCreate[fake._calls.sessionsCreate.length - 1];
    t(sent.customer === saved.stripe_customer_id, 'parte 2 · setup con customer inválido: la sesión se crea con el customer nuevo');
    t(fake._calls.sessionsCreate.length === 1, 'parte 2 · setup con customer inválido: un solo intento exitoso (el fallido no contó como sesión)');
    // Un error que NO es «No such customer» sigue tirando (no se reintenta a ciegas).
    const fake2 = makeFakeStripe();
    fake2.checkout.sessions.create = async () => { throw new Error('api_key_expired'); };
    db.prepare("INSERT INTO users (id, email, stripe_customer_id) VALUES (14, 'otro@shop.com', 'cus_14')").run();
    fake2._addCustomer('cus_14');
    const user2 = db.prepare('SELECT * FROM users WHERE id = 14').get();
    let threw = false;
    try { await sb.createSetupSession(db, fake2, { user: user2, baseUrl: 'https://postyhacetodo.com' }); } catch (e) { threw = /api_key_expired/.test(e.message); }
    t(threw, 'parte 2 · setup con error de Stripe no relacionado: tira el error (sin reintento)');
  }

  // El webhook con mode setup: guarda el customer y fija la tarjeta nueva
  // como default; no rompe; idempotente; otros modos se ignoran.
  {
    const db = memDb();
    db.prepare("INSERT INTO users (id, email) VALUES (12, 'setup@shop.com')").run();
    const fake = makeFakeStripe();
    fake._addCustomer('cus_2');
    const pmNew = fake._addCard('cus_2', 'mastercard', '5555');
    fake._setSetupIntent('si_1', pmNew.id);
    const evt = { id: 'evt_setup_1', type: 'checkout.session.completed',
      data: { object: { mode: 'setup', customer: 'cus_2', setup_intent: 'si_1',
        metadata: { user_id: '12', flujo: 'agregar_tarjeta' }, client_reference_id: '12' } } };
    const r = await sb.processEvent(db, fake, evt, {});
    t(r && r.ok, 'parte 2 · webhook setup: evento aplicado sin error (no rompe)');
    const saved = db.prepare('SELECT stripe_customer_id FROM users WHERE id = 12').get();
    t(saved.stripe_customer_id === 'cus_2', 'parte 2 · webhook setup: el customer id quedó guardado');
    const upd = fake._calls.customersUpdate.find((c) => c.id === 'cus_2');
    t(!!upd && upd.patch.invoice_settings.default_payment_method === pmNew.id,
      'parte 2 · webhook setup: la tarjeta nueva queda como default del cliente');
    t(fake._calls.setupIntentsRetrieve.includes('si_1'), 'parte 2 · webhook setup: lee el setup_intent para sacar el payment_method');
    const r2 = await sb.processEvent(db, fake, evt, {});
    t(r2 && r2.duplicate, 'parte 2 · webhook setup: el mismo evento dos veces es duplicado (idempotente, sin segundo update)');
    t(fake._calls.customersUpdate.length === 1, 'parte 2 · webhook setup: un solo update de default aunque llegue dos veces');
    // Otro modo que no es subscription ni setup se ignora sin romper.
    const r3 = await sb.processEvent(db, fake, { id: 'evt_other_1', type: 'checkout.session.completed',
      data: { object: { mode: 'payment', customer: 'cus_2', metadata: { user_id: '12' } } } }, {});
    t(r3 && r3.ok, 'parte 2 · webhook modo payment: se ignora sin romper (se registra como procesado)');
    t(fake._calls.customersUpdate.length === 1, 'parte 2 · webhook modo payment: no toca la default');
  }

  // fijarTarjetaPorDefecto nunca tira: un fallo de Stripe se loguea y vuelve false.
  {
    const badClient = { customers: { update: async () => { throw new Error('stripe caído'); } } };
    let threw = false, out = null;
    try { out = await sb.fijarTarjetaPorDefecto(badClient, 'cus_x', 'pm_x'); } catch (e) { threw = true; }
    t(!threw && out === false, 'parte 2 · fijarTarjetaPorDefecto: si Stripe falla, no tira (devuelve false)');
    t((await sb.fijarTarjetaPorDefecto(null, 'cus_x', 'pm_x')) === false, 'parte 2 · fijarTarjetaPorDefecto: sin cliente/customer/tarjeta devuelve false');
  }

  // Endpoints en server.js: setup existe, fail-closed, sin guarda de
  // «ya suscripto»; la billetera devuelve la tarjeta (best-effort).
  {
    const setupIdx = srv.indexOf("app.post('/api/billing/stripe/setup'");
    t(setupIdx > -1, 'parte 2 · server.js: existe POST /api/billing/stripe/setup');
    const setupBlock = setupIdx > -1 ? srv.slice(setupIdx, setupIdx + 1500) : '';
    t(/requireAuth/.test(setupBlock), 'parte 2 · setup: autenticado (requireAuth)');
    t(/stripeConfigured\(\)/.test(setupBlock) && /status\(400\)/.test(setupBlock),
      'parte 2 · setup: sin Stripe configurado responde 400 (fail-closed)');
    t(/createSetupSession/.test(setupBlock), 'parte 2 · setup: crea la sesión con createSetupSession');
    t(!/already have an active subscription/.test(setupBlock),
      'parte 2 · setup: SIN guarda de «ya suscripto» (agregar tarjeta está siempre disponible)');
    const bilIdx = srv.indexOf("app.get('/api/ads/billetera'");
    const bilBlock = bilIdx > -1 ? srv.slice(bilIdx, bilIdx + 4200) : '';
    t(/tarjetaGuardadaInfo/.test(bilBlock) && /\btarjeta,/.test(bilBlock),
      'parte 2 · GET /api/ads/billetera: devuelve el campo tarjeta (marca + últimos 4)');
    t(/tiene_tarjeta/.test(bilBlock), 'parte 2 · GET /api/ads/billetera: tiene_tarjeta sigue existiendo (sin cambio de semántica)');
  }

  // ---------- 3. PARTE 3: otra tarjeta pasa a ser la activa ----------
  {
    const fake = makeFakeStripe();
    fake._addCustomer('cus_3');
    const pmOld = fake._addCard('cus_3', 'visa', '4242');
    const pmNew = fake._addCard('cus_3', 'amex', '0005');
    // Antes de fijar default: el cobro toma la más reciente listada.
    t((await dc.resolverTarjetaGuardada(fake, 'cus_3')) === pmNew.id,
      'parte 3 · sin default: el cobro toma la más reciente listada');
    // El webhook de setup fija la nueva como default (como en la sección 2).
    await sb.fijarTarjetaPorDefecto(fake, 'cus_3', pmNew.id);
    t((await dc.resolverTarjetaGuardada(fake, 'cus_3')) === pmNew.id,
      'parte 3 · con default: el cobro toma la default (la última agregada)');
    const info = await dc.tarjetaGuardadaInfo(fake, 'cus_3');
    t(info.tiene === true && info.brand === 'amex' && info.last4 === '0005' && info.id === pmNew.id,
      'parte 3 · tarjetaGuardadaInfo: marca + últimos 4 de la tarjeta activa');
    const cobro = await dc.cobrarCargaBilletera({ client: fake, customerId: 'cus_3', montoUSD: 50, ref: 'test-parte3' });
    const pi = fake._calls.paymentIntentsCreate[fake._calls.paymentIntentsCreate.length - 1];
    t(cobro && cobro.ok && pi.params.payment_method === pmNew.id,
      'parte 3 · cobrarCargaBilletera: cobra con la última agregada (la activa), no con la vieja');
    // Cambiar de nuevo: la tercera pasa a ser la activa.
    const pm3 = fake._addCard('cus_3', 'visa', '1111');
    await sb.fijarTarjetaPorDefecto(fake, 'cus_3', pm3.id);
    t((await dc.resolverTarjetaGuardada(fake, 'cus_3')) === pm3.id,
      'parte 3 · agregar una tercera tarjeta: esa pasa a ser la activa');
    // Sin tarjeta: info honesta y cobro fail-closed.
    const fake2 = makeFakeStripe();
    fake2._addCustomer('cus_4');
    const info2 = await dc.tarjetaGuardadaInfo(fake2, 'cus_4');
    t(info2.tiene === false, 'parte 3 · sin tarjeta: tarjetaGuardadaInfo devuelve { tiene: false }');
    const cobro2 = await dc.cobrarCargaBilletera({ client: fake2, customerId: 'cus_4', montoUSD: 20, ref: 'test-sin' });
    t(cobro2 && !cobro2.ok && cobro2.motivo === 'sin_tarjeta_guardada',
      'parte 3 · sin tarjeta: el cobro sigue siendo fail-closed (sin_tarjeta_guardada)');
  }

  // ---------- 4. CLIENTE INLINE: billetera, form, guardar, degrade ----------
  // 4a. Estático: el botón y el contenedor viven en pzAdsHTML (tab Ads).
  {
    const htmlFn = extractFn(appJs, 'pzAdsHTML');
    t(htmlFn.length > 0, 'inline · existe pzAdsHTML');
    t(/pz-ads-tarjeta-btn/.test(htmlFn) && /id="pzAdsTarjeta"/.test(htmlFn),
      'inline · la billetera del tab Ads tiene el botón de tarjeta + contenedor #pzAdsTarjeta');
    t(/pzTarjetaInlineAbrir\(document\.getElementById\('pzAdsTarjeta'\)\)/.test(htmlFn),
      'inline · el botón de la billetera abre el form inline en #pzAdsTarjeta (ahí mismo, sin navegar)');
    t(/Cambiar tarjeta/.test(htmlFn) && /Agregar tarjeta/.test(htmlFn) && /tarjetaBil\.last4/.test(htmlFn),
      'inline · la billetera muestra «Cambiar tarjeta •••• last4» si hay tarjeta y «Agregar tarjeta» si no hay');
    t(/\(bil && bil\.tarjeta\)/.test(htmlFn),
      'inline · la billetera lee la tarjeta del GET /api/ads/billetera (pzBoostState.billetera.tarjeta)');
  }
  // 4b. Estático: el form inline nunca navega ni abre el navegador.
  {
    const abrir = extractFn(appJs, 'pzTarjetaInlineAbrir');
    const guardar = extractFn(appJs, 'pzTarjetaGuardar');
    const form = extractFn(appJs, 'pzTarjetaFormHTML');
    t(abrir.length > 0 && guardar.length > 0 && form.length > 0, 'inline · existen pzTarjetaInlineAbrir / pzTarjetaGuardar / pzTarjetaFormHTML');
    t(!/location\.href|window\.open|location\.assign/.test(abrir + guardar),
      'inline · abrir/guardar el form inline NO navegan ni abren el navegador (sin redirect, sin ventana externa)');
    t(!/href=/.test(form), 'inline · el HTML del form no tiene ningún enlace (nada que saque de la app)');
    t(/pzTarjetaNum/.test(form) && /pzTarjetaExp/.test(form) && /pzTarjetaCvc/.test(form) && /pzTarjetaNombre/.test(form),
      'inline · el form tiene número, vencimiento, CVC y nombre (los 4 campos pedidos)');
    t(/Guardar tarjeta/.test(form) && /Cancelar/.test(form),
      'inline · el form tiene «Guardar tarjeta» y «Cancelar»');
    const cargarJs = extractFn(appJs, 'pzStripeJsCargar');
    const cfgFn = extractFn(appJs, 'pzTarjetaConfig');
    t(/js\.stripe\.com\/v3/.test(cargarJs), 'inline · Stripe.js se carga perezoso desde js.stripe.com/v3 (no en el bundle)');
    t(/\/api\/billing\/stripe\/config/.test(cfgFn), 'inline · el form pide la clave pública a GET /api/billing/stripe/config');
    t(/\/api\/billing\/stripe\/payment-method/.test(guardar) && /paymentMethodId/.test(guardar),
      'inline · guardar manda solo paymentMethodId a POST /api/billing/stripe/payment-method');
    t(!/cardNumber|numero|vencimiento|cvc/i.test(guardar.replace(/paymentMethodId/g, '')) || !/req\.body|body:\s*\{[^}]*numero/.test(guardar),
      'inline · guardar NO manda el número ni el CVC a nuestro servidor (solo el id pm_*)');
  }
  // 4c. VM: el form se abre, monta los 3 Elements y guardar deja la tarjeta
  // lista para un toque (refresca la billetera y confirma en #pzAdsMsg).
  {
    const calls = { mounts: [], creates: [], createPM: [], apiGet: [], apiPost: [], boostLoad: 0, adsPintar: 0, stripePk: null };
    const els = {};
    function FakeEl(type) {
      return { type, _mountedOn: null, _handlers: {},
        mount(c) { this._mountedOn = c; calls.mounts.push(type); },
        on(ev, fn) { this._handlers[ev] = fn; } };
    }
    function FakeStripe(pk) {
      calls.stripePk = pk;
      return {
        elements() { return { create(type) { const el = FakeEl(type); els[type] = el; calls.creates.push(type); return el; } }; },
        createPaymentMethod: async (params) => { calls.createPM.push(params); return { paymentMethod: { id: 'pm_test_inline1' } }; },
      };
    }
    const pzAdsMsg = { textContent: '' };
    const sbx = { console, ME: { lang: 'es' }, pzStripeJsPromise: null,
      gzT: (es, en) => (sbx.ME && sbx.ME.lang === 'en' ? en : es),
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      window: { Stripe: FakeStripe },
      document: { getElementById: (id) => (id === 'pzAdsMsg' ? pzAdsMsg : null),
        createElement: () => ({}), head: { appendChild: () => {} } },
      location: { href: '', hash: '' },
      api: { get: async (url) => { calls.apiGet.push(url); return { ok: true, publishableKey: 'pk_test_inline' }; },
        post: async (url, body) => { calls.apiPost.push({ url, body }); return { ok: true, tarjeta: { brand: 'visa', last4: '4242' } }; } },
      pzBoostLoad: async () => { calls.boostLoad++; },
      pzAdsPintar: () => { calls.adsPintar++; },
      loadChunk: async () => {},
    };
    vm.createContext(sbx);
    for (const n of ['pzStripeJsCargar', 'pzTarjetaConfig', 'pzTarjetaMotivo', 'pzTarjetaFormHTML', 'pzTarjetaHostDe', 'pzTarjetaInlineAbrir', 'pzTarjetaInlineCerrar', 'pzTarjetaGuardar']) {
      t(loadFn(sbx, appJs, n), 'inline · existe en app.js ' + n);
    }
    // El HTML del form (puro): campos + botones + aviso de Stripe.
    const formHTML = sbx.pzTarjetaFormHTML();
    t(/id="pzTarjetaNum"/.test(formHTML) && /id="pzTarjetaExp"/.test(formHTML) && /id="pzTarjetaCvc"/.test(formHTML),
      'inline · pzTarjetaFormHTML: los 3 contenedores de Elements (número, vencimiento, CVC)');
    t(/id="pzTarjetaNombre"/.test(formHTML), 'inline · pzTarjetaFormHTML: campo nombre');
    t(/Guardar tarjeta/.test(formHTML) && /Cancelar/.test(formHTML), 'inline · pzTarjetaFormHTML: botones Guardar/Cancelar');
    t(/pzTarjetaGuardar\(this\)/.test(formHTML) && /pzTarjetaInlineCerrar\(this\)/.test(formHTML),
      'inline · pzTarjetaFormHTML: los botones llaman a pzTarjetaGuardar / pzTarjetaInlineCerrar');
    t(/Pago seguro con Stripe/.test(formHTML), 'inline · pzTarjetaFormHTML: dice que el pago es seguro con Stripe');
    // Host falso con querySelector por selector.
    const msgEl = { textContent: '', className: 'pz-tarjeta-msg' };
    const host = { innerHTML: '', _pzTarjeta: undefined, _appended: [],
      _qs: { '.pz-tarjeta-msg': msgEl, '#pzTarjetaNum': { id: 'pzTarjetaNum' }, '#pzTarjetaExp': { id: 'pzTarjetaExp' }, '#pzTarjetaCvc': { id: 'pzTarjetaCvc' }, '#pzTarjetaNombre': { value: 'Valentino Caratini' }, '.pz-tarjeta-form': null },
      querySelector(sel) { return this._qs[sel] || null; },
      appendChild(el) { this._appended.push(el); el.parentNode = this; return el; } };
    const opened = await sbx.pzTarjetaInlineAbrir(host);
    t(opened === true, 'inline · pzTarjetaInlineAbrir: abre el form (true)');
    t(/pz-tarjeta-form/.test(host.innerHTML), 'inline · el form queda montado en el host (misma pantalla, sin navegar)');
    t(sbx.location.href === '', 'inline · abrir el form NO cambia location.href (nada de redirect)');
    t(calls.apiGet.includes('/api/billing/stripe/config'), 'inline · abrir el form pide la config (clave pública)');
    t(calls.stripePk === 'pk_test_inline', 'inline · Stripe se inicializa con la clave pública de la config');
    t(calls.creates.includes('cardNumber') && calls.creates.includes('cardExpiry') && calls.creates.includes('cardCvc'),
      'inline · se crean los 3 Elements (cardNumber, cardExpiry, cardCvc)');
    t(calls.mounts.length === 3, 'inline · los 3 Elements se montan en sus contenedores');
    t(host._pzTarjeta && host._pzTarjeta.stripe && host._pzTarjeta.els && host._pzTarjeta.els.num,
      'inline · el estado (stripe + elements) queda en el host para Guardar');
    // Segundo toque: no duplica el form.
    host._qs['.pz-tarjeta-form'] = {};
    t((await sbx.pzTarjetaInlineAbrir(host)) === true && calls.creates.length === 3,
      'inline · segundo toque con el form abierto: no se duplica (no se crean Elements de nuevo)');
    host._qs['.pz-tarjeta-form'] = null;
    // Guardar: createPaymentMethod con el elemento de número + nombre;
    // POST solo con pm_*; refresca la billetera y confirma en #pzAdsMsg.
    const formFake = { parentNode: host };
    const saveBtn = { disabled: false, parentNode: formFake };
    await sbx.pzTarjetaGuardar(saveBtn);
    t(calls.createPM.length === 1, 'inline · guardar llama a createPaymentMethod una vez');
    t(calls.createPM[0] && calls.createPM[0].type === 'card' && calls.createPM[0].card === els.cardNumber,
      'inline · createPaymentMethod usa el elemento de número (el dato de la tarjeta lo procesa Stripe.js, no nosotros)');
    t(calls.createPM[0] && calls.createPM[0].billing_details && calls.createPM[0].billing_details.name === 'Valentino Caratini',
      'inline · createPaymentMethod lleva el nombre como billing_details');
    t(calls.apiPost.length === 1 && calls.apiPost[0].url === '/api/billing/stripe/payment-method',
      'inline · guardar postea a /api/billing/stripe/payment-method');
    t(calls.apiPost[0].body && calls.apiPost[0].body.paymentMethodId === 'pm_test_inline1',
      'inline · el POST lleva solo paymentMethodId (pm_*)');
    t(!JSON.stringify(calls.apiPost[0].body).match(/4242|4\d{15}|cvc/i),
      'inline · el POST NO lleva el número de la tarjeta ni el CVC (nada en claro a nuestro servidor)');
    t(calls.boostLoad === 1 && calls.adsPintar === 1,
      'inline · al guardar, la billetera se refresca (pzBoostLoad + pzAdsPintar: el botón pasa a «Cambiar tarjeta •••• 4242»)');
    t(/Tarjeta guardada/.test(pzAdsMsg.textContent) && /4242/.test(pzAdsMsg.textContent),
      'inline · al guardar, #pzAdsMsg confirma «Tarjeta guardada •••• 4242. Ya podés cargar con un toque.»');
    t(host.innerHTML === '' && !host._pzTarjeta, 'inline · al guardar, el form se cierra (host vacío)');
    // Cancelar: vacía el host.
    const host2 = { innerHTML: '<form class="pz-tarjeta-form">x</form>', _pzTarjeta: { stripe: {} },
      querySelector: () => null, appendChild: () => {} };
    sbx.pzTarjetaInlineCerrar({ parentNode: { parentNode: host2 } });
    t(host2.innerHTML === '' && !host2._pzTarjeta, 'inline · Cancelar vacía el host y limpia el estado');
  }
  // 4d. VM: si Stripe.js o la config fallan, el form degrada al pago
  // alojado (botón visible, nunca silencio).
  {
    const sbx = { console, ME: { lang: 'es' }, pzStripeJsPromise: null,
      gzT: (es, en) => (sbx.ME && sbx.ME.lang === 'en' ? en : es),
      esc: (s) => String(s == null ? '' : s),
      window: {}, // sin Stripe: la carga del script falla
      document: { getElementById: () => null,
        createElement: (tag) => ({ tagName: tag, src: '', async: false, onload: null, onerror: null }),
        head: { appendChild: (el) => { sbx._script = el; } } },
      api: { get: async () => { throw new Error('sin config'); }, post: async () => ({}) },
      loadChunk: async () => { sbx._loadChunkCalls = (sbx._loadChunkCalls || 0) + 1; },
    };
    vm.createContext(sbx);
    for (const n of ['pzStripeJsCargar', 'pzTarjetaConfig', 'pzTarjetaMotivo', 'pzTarjetaFormHTML', 'pzTarjetaInlineAbrir']) {
      t(loadFn(sbx, appJs, n), 'degrade · existe en app.js ' + n);
    }
    const msgEl = { textContent: '', className: 'pz-tarjeta-msg' };
    const host = { innerHTML: '', _pzTarjeta: undefined, _appended: [],
      _qs: { '.pz-tarjeta-msg': msgEl, '.pz-tarjeta-form': null },
      querySelector(sel) { return this._qs[sel] || null; },
      appendChild(el) { this._appended.push(el); el.parentNode = this; return el; } };
    const p = sbx.pzTarjetaInlineAbrir(host);
    // La carga del script queda pendiente: la config ya falló, así que el
    // form degrada sin esperar al timeout de 15 s.
    const opened = await p;
    t(opened === false, 'degrade · sin Stripe.js ni config, el form inline NO se abre (false)');
    t(/No se pudo abrir el formulario seguro/.test(msgEl.textContent),
      'degrade · el form muestra el aviso honesto (nunca silencio)');
    t(host._appended.length === 1 && /Abrir el pago seguro/.test(host._appended[0].textContent),
      'degrade · aparece el botón «Abrir el pago seguro» (respaldo alojado)');
    // El botón de respaldo carga el chunk y llama a anaAgregarTarjeta con forzarRedirect.
    let anaCalled = null;
    sbx.anaAgregarTarjeta = (btn, forzar) => { anaCalled = { btn, forzar }; };
    await host._appended[0].onclick();
    t(sbx._loadChunkCalls === 1, 'degrade · el botón de respaldo carga el chunk analisis');
    t(anaCalled && anaCalled.forzar === true, 'degrade · el botón de respaldo llama a anaAgregarTarjeta con forzarRedirect (va directo al checkout alojado, sin reintentar el inline)');
    // Motivos: cada motivo tiene texto honesto en ES y en EN.
    sbx.ME.lang = 'es';
    t(/No se pudo guardar la tarjeta/.test(sbx.pzTarjetaMotivo('adjuntar_fallido')), 'degrade · motivo adjuntar_fallido tiene texto en ES');
    t(/Los pagos todavía no están configurados/.test(sbx.pzTarjetaMotivo('stripe_no_configurado')), 'degrade · motivo stripe_no_configurado tiene texto en ES');
    sbx.ME.lang = 'en';
    t(/could not be saved/i.test(sbx.pzTarjetaMotivo('adjuntar_fallido')), 'degrade · motivo adjuntar_fallido tiene texto en EN');
    t(/not set up yet/i.test(sbx.pzTarjetaMotivo('stripe_no_configurado')), 'degrade · motivo stripe_no_configurado tiene texto en EN');
    t(sbx.pzTarjetaMotivo('motivo_inexistente') === sbx.pzTarjetaMotivo('adjuntar_fallido'), 'degrade · motivo desconocido cae al texto genérico (nunca vacío)');
    sbx.ME.lang = 'es';
  }
  // 4e. VM (chunk): anaAgregarTarjeta abre el inline primero; sin inline
  // cae al redirect; el fallo del setup en el tab Ads SÍ se ve (#pzAdsMsg).
  {
    const sbx = { console, anaLang: 'es', anaPastMode: false, URLSearchParams, ME: { lang: 'es' },
      anaT: (es, en) => (sbx.anaLang === 'en' ? en : es),
      gzT: (es, en) => (sbx.ME && sbx.ME.lang === 'en' ? en : es),
      esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
      document: { getElementById: () => null, createElement: () => fakeButton() },
      location: { href: '', hash: '', pathname: '/' },
      history: { replaceState: (...a) => { sbx._replaced = a; } },
      api: { post: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_setup' }) },
    };
    vm.createContext(sbx);
    for (const n of ['anaTarjetaBtnHTML', 'anaCargarSinTarjeta', 'anaAgregarTarjetaBtn', 'anaAgregarTarjeta', 'anaTarjetaRetorno', 'anaTarjetaMsgEl', 'anaCargarMsgEl']) {
      t(loadFn(sbx, chunk, n), 'chunk · existe ' + n);
    }
    t(loadFn(sbx, appJs, 'pzTarjetaMotivo'), 'chunk · existe en app.js pzTarjetaMotivo (lo usa el mensaje de error)');
    // Con inline disponible: abre el inline, NO postea al setup, NO navega.
    let inlineHosts = [];
    sbx.pzTarjetaInlineAbrir = async (host) => { inlineHosts.push(host); return true; };
    sbx.api.post = async () => { throw new Error('no debería llamarse al setup con inline'); };
    const btn = fakeButton();
    sbx.location.href = '';
    await sbx.anaAgregarTarjeta(btn);
    t(inlineHosts.length === 1, 'chunk · anaAgregarTarjeta con inline disponible: abre el form inline');
    t(sbx.location.href === '', 'chunk · anaAgregarTarjeta con inline: NO navega (sin redirect)');
    // El host del form queda pegado al botón (después de él).
    t(btn.parentNode.children.includes(inlineHosts[0]), 'chunk · el form inline queda pegado al botón que lo abrió');
    // Con el form ya abierto cerca del botón: no se duplica.
    btn.parentNode.querySelector = () => ({ className: 'pz-tarjeta-form' });
    inlineHosts = [];
    await sbx.anaAgregarTarjeta(btn);
    t(inlineHosts.length === 0, 'chunk · con el form ya abierto, el toque no duplica el form');
    btn.parentNode.querySelector = () => null;
    // Sin inline (app.js viejo sin la función): cae al redirect alojado.
    delete sbx.pzTarjetaInlineAbrir;
    sbx.api.post = async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_setup' });
    sbx.location.href = '';
    await sbx.anaAgregarTarjeta(btn);
    t(sbx.location.href === 'https://checkout.stripe.com/c/pay/cs_test_setup',
      'chunk · anaAgregarTarjeta sin inline: cae al redirect a la página de Stripe (respaldo)');
    // forzarRedirect: va directo al redirect aunque haya inline.
    sbx.pzTarjetaInlineAbrir = async () => { throw new Error('no debería llamarse con forzarRedirect'); };
    sbx.location.href = '';
    await sbx.anaAgregarTarjeta(btn, true);
    t(sbx.location.href === 'https://checkout.stripe.com/c/pay/cs_test_setup',
      'chunk · anaAgregarTarjeta(btn, true): salta el inline y va directo al checkout alojado');
    delete sbx.pzTarjetaInlineAbrir;
    // REPRO 11/11: en el tab Ads solo existe #pzAdsMsg. El setup falla →
    // el mensaje SÍ se ve (antes el botón parecía no hacer nada).
    const pzAdsMsg = { textContent: '' };
    sbx.document.getElementById = (id) => (id === 'pzAdsMsg' ? pzAdsMsg : null);
    sbx.api.post = async () => { throw { data: { ok: false, motivo: 'setup_fallido' } }; };
    const btn2 = fakeButton(); btn2.disabled = false;
    await sbx.anaAgregarTarjeta(btn2);
    t(btn2.disabled === false, 'chunk · REPRO 11/11: si el setup falla, el botón vuelve a habilitarse');
    t(/No se pudo abrir el pago seguro/.test(pzAdsMsg.textContent),
      'chunk · REPRO 11/11: el fallo del setup en el tab Ads se ve en #pzAdsMsg (el botón ya no parece no hacer nada)');
    t(sbx.anaTarjetaMsgEl() === pzAdsMsg, 'chunk · anaTarjetaMsgEl conoce #pzAdsMsg (el sumidero del tab Ads)');
    sbx.api.post = async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_setup' });
    sbx.document.getElementById = () => null;
    // Botón de la billetera del chunk: sin tarjeta → Agregar; con tarjeta → Cambiar + ••••.
    const h0 = sbx.anaTarjetaBtnHTML({ tarjeta: null });
    t(/Agregar tarjeta/.test(h0) && /anaAgregarTarjeta\(this\)/.test(h0), 'chunk · sin tarjeta: el botón dice «Agregar tarjeta» y llama a anaAgregarTarjeta');
    const h1 = sbx.anaTarjetaBtnHTML({ tarjeta: { tiene: true, brand: 'visa', last4: '4242' } });
    t(/Cambiar tarjeta/.test(h1) && /4242/.test(h1), 'chunk · con tarjeta: el botón dice «Cambiar tarjeta •••• 4242»');
    // El botón pegado al mensaje: hermano, no hijo; uno solo aunque se llame dos veces.
    {
      const { msg, parent } = fakeMsgEl();
      msg.textContent = 'No tenés una tarjeta guardada para cargar la billetera.';
      sbx.anaAgregarTarjetaBtn(msg);
      t(parent.children.length === 2 && parent.children[1].className === 'ana-agregar-tarjeta-btn',
        'chunk · el botón queda pegado al mensaje como hermano (después de él)');
      t(msg.textContent === 'No tenés una tarjeta guardada para cargar la billetera.',
        'chunk · el texto del mensaje NO cambia al pegar el botón');
      sbx.anaAgregarTarjetaBtn(msg);
      t(parent.children.length === 2, 'chunk · segundo llamado: no duplica el botón (quita el anterior)');
      sbx.anaAgregarTarjetaBtn(null);
      t(true, 'chunk · anaAgregarTarjetaBtn(null) no tira');
    }
    // anaTarjetaRetorno: ?tarjeta=ok se confirma una sola vez; cancel no dice nada.
    {
      const { msg } = fakeMsgEl();
      sbx.document.getElementById = (id) => (id === 'anaBoostRecMsg' ? msg : null);
      sbx._replaced = null;
      sbx.location.hash = '#/app/ads?tarjeta=ok';
      sbx.anaTarjetaRetorno();
      t(/Tarjeta guardada/.test(msg.textContent), 'chunk · ?tarjeta=ok: se confirma «Tarjeta guardada. Ya podés cargar con un toque.»');
      t(sbx._replaced && String(sbx._replaced[2]).endsWith('#/app/ads') && !String(sbx._replaced[2]).includes('tarjeta=ok'),
        'chunk · ?tarjeta=ok: el parámetro se limpia del hash (no se repite)');
      msg.textContent = '';
      sbx._replaced = null;
      sbx.location.hash = '#/app/ads?tarjeta=cancel';
      sbx.anaTarjetaRetorno();
      t(msg.textContent === '' && sbx._replaced === null, 'chunk · ?tarjeta=cancel: sin mensaje, sin tocar el hash');
      sbx.location.hash = '#/app/ads';
      sbx.anaTarjetaRetorno();
      t(msg.textContent === '', 'chunk · sin parámetro: no hace nada');
      sbx.document.getElementById = () => null;
    }
    // Integración en anaBilleteraCargar: fallo sin tarjeta → mensaje + botón hermano.
    {
      const sb2 = { console, anaLang: 'es', anaPastMode: false,
        anaT: (es, en) => (sb2.anaLang === 'en' ? en : es),
        esc: (s) => String(s == null ? '' : s),
        document: { getElementById: () => null, createElement: () => fakeButton() },
        api: { post: async () => ({ ok: false, motivo: 'sin_tarjeta_guardada' }) },
        anaBoostRecLoad: async () => {}, anaBilleteraTabLoad: async () => {},
        anaBilleteraDatos: { billetera: {} },
      };
      vm.createContext(sb2);
      for (const n of ['anaEsMP', 'anaBoostRecMotivo', 'anaCargarMotivo', 'anaCargarDecir', 'anaCargarMsgEl', 'anaCargarSinTarjeta', 'anaAgregarTarjetaBtn', 'anaAgregarTarjeta', 'anaBilleteraCargar']) {
        t(loadFn(sb2, chunk, n), 'integración · existe ' + n);
      }
      const { msg, parent } = fakeMsgEl();
      sb2.document.getElementById = (id) => (id === 'anaAdsCargarMsg' ? msg : null);
      const btn = fakeButton();
      await sb2.anaBilleteraCargar(20, btn);
      const motivoTxt = sb2.anaCargarMotivo('sin_tarjeta_guardada', 20, null);
      t(msg.textContent === motivoTxt, 'integración · Cargar sin tarjeta: el mensaje es el mismo de antes (texto intacto)');
      t(parent.children.length === 2 && parent.children[1].className === 'ana-agregar-tarjeta-btn',
        'integración · Cargar sin tarjeta: el botón «Agregar tarjeta» queda pegado al mensaje');
      t(/tarjeta/i.test(motivoTxt), 'integración · el mensaje de Cargar sin tarjeta habla de la tarjeta');
    }
    // Colocación en el árbol: botón SOLO en el tab Ads; retorno al montar
    // el tab; tarjeta en los datos.
    t((chunk.match(/\$\{anaTarjetaBtnHTML\(d\)\}/g) || []).length === 1,
      'colocación · anaTarjetaBtnHTML(d) aparece 1 vez: solo la walletCard del tab Ads');
    t(/if \(anaCargarSinTarjeta\(\(j && j\.motivo\) \|\| ''\)\) anaAgregarTarjetaBtn\(anaCargarMsgEl\(\)\);/.test(chunk),
      'colocación · anaBilleteraCargar: tras el fallo sin tarjeta se pega el botón al mensaje');
    t(/function bindAds\(\) \{[^]*?q\.get\('tarjeta'\) === 'ok'[^]*?getElementById\('pzAdsMsg'\)/.test(appJs),
      'colocación · app.js bindAds: al montar el tab Ads se atiende el retorno ?tarjeta=ok inline (escribe en #pzAdsMsg y limpia el hash; el tab nuevo no carga el chunk)');
    t(!/typeof anaTarjetaRetorno === 'function'/.test(appJs),
      'colocación · app.js bindAds YA NO llama a anaTarjetaRetorno del chunk (v896 TAB-ADS: el retorno vive en bindAds; el chunk conserva su anaTarjetaRetorno para la vista vieja)');
    t(!/anaTarjetaRetorno\(\)/.test(chunk.slice(chunk.indexOf('async function anaBilleteraTabLoad'), chunk.indexOf('async function anaBilleteraTabLoad') + 600)),
      'colocación · anaBilleteraTabLoad NO llama a anaTarjetaRetorno (un solo hogar: bindAds, que corre en cada montaje del tab)');
    t(/tarjeta: \(bil && bil\.ok && bil\.tarjeta\) \|\| null,/.test(chunk),
      'colocación · anaBilleteraConstruirDatos: los datos llevan la tarjeta del GET /api/ads/billetera');
  }

  // ---------- 5. ENDPOINTS NUEVOS (estático) ----------
  {
    const cfgIdx = srv.indexOf("app.get('/api/billing/stripe/config'");
    t(cfgIdx > -1, 'endpoints · server.js: existe GET /api/billing/stripe/config');
    const cfgBlock = cfgIdx > -1 ? srv.slice(cfgIdx, cfgIdx + 1200) : '';
    t(/requireAuth/.test(cfgBlock), 'endpoints · config: autenticado (requireAuth)');
    t(/STRIPE_PUBLISHABLE_KEY/.test(cfgBlock) && /status\(400\)/.test(cfgBlock) && /stripe_no_configurado/.test(cfgBlock),
      'endpoints · config: sin clave pública (o sin secret) responde 400 motivo stripe_no_configurado (fail-closed)');
    t(/publishableKey/.test(cfgBlock), 'endpoints · config: devuelve { ok, publishableKey }');
    const pmIdx = srv.indexOf("app.post('/api/billing/stripe/payment-method'");
    t(pmIdx > -1, 'endpoints · server.js: existe POST /api/billing/stripe/payment-method');
    const pmBlock = pmIdx > -1 ? srv.slice(pmIdx, pmIdx + 2000) : '';
    t(/requireAuth/.test(pmBlock), 'endpoints · payment-method: autenticado (requireAuth)');
    t(/stripeConfigured\(\)/.test(pmBlock) && /status\(400\)/.test(pmBlock) && /stripe_no_configurado/.test(pmBlock),
      'endpoints · payment-method: sin Stripe responde 400 motivo stripe_no_configurado (fail-closed)');
    t(/\/\^pm_\[A-Za-z0-9\]\+\$\//.test(pmBlock) && /payment_method_invalido/.test(pmBlock),
      'endpoints · payment-method: el paymentMethodId se valida con regex pm_* (400 motivo payment_method_invalido si no)');
    t(/adjuntarTarjeta/.test(pmBlock), 'endpoints · payment-method: adjunta con stripeBilling.adjuntarTarjeta');
    t(/adjuntar_fallido/.test(pmBlock) && /status\(500\)/.test(pmBlock),
      'endpoints · payment-method: si adjuntar falla responde 500 motivo adjuntar_fallido (nunca un ok falso)');
    t(!/req\.body\.(numero|number|vencimiento|cvc|cardNumber)/.test(pmBlock),
      'endpoints · payment-method: el endpoint NO lee número, vencimiento ni CVC del body (solo paymentMethodId)');
    // El setup ahora devuelve motivo estructurado (y mantiene el texto por compat).
    const setupIdx = srv.indexOf("app.post('/api/billing/stripe/setup'");
    const setupBlock = setupIdx > -1 ? srv.slice(setupIdx, setupIdx + 1600) : '';
    t(/motivo: 'stripe_no_configurado'/.test(setupBlock), 'endpoints · setup: el 400 lleva motivo stripe_no_configurado');
    t(/motivo: 'setup_fallido'/.test(setupBlock), 'endpoints · setup: el 500 lleva motivo setup_fallido');
    t(/motivo: 'sin_cuenta'/.test(setupBlock), 'endpoints · setup: sin usuario lleva motivo sin_cuenta');
    t(/error: 'Payments are not configured yet\.'/.test(setupBlock) && /error: 'Could not start adding a card/.test(setupBlock),
      'endpoints · setup: mantiene el texto de error (compatibilidad con el boot viejo)');
  }

  // ---------- 6. adjuntarTarjeta (cliente falso) ----------
  {
    const db = memDb();
    db.prepare("INSERT INTO users (id, email) VALUES (21, 'inline@shop.com')").run();
    const fake = makeFakeStripe();
    const user = db.prepare('SELECT * FROM users WHERE id = 21').get();
    const pm = fake._addUnattachedCard('visa', '4242');
    const out = await sb.adjuntarTarjeta(db, fake, user, pm.id);
    t(out && out.brand === 'visa' && out.last4 === '4242', 'adjuntar · devuelve marca y últimos 4 de la tarjeta adjunta');
    t(!!out.customerId, 'adjuntar · devuelve el customerId usado');
    t(fake._calls.pmAttach.length === 1 && fake._calls.pmAttach[0].id === pm.id && fake._calls.pmAttach[0].customer === out.customerId,
      'adjuntar · paymentMethods.attach con el pm y el customer del usuario');
    const upd = fake._calls.customersUpdate.find((c) => c.id === out.customerId);
    t(!!upd && upd.patch.invoice_settings.default_payment_method === pm.id,
      'adjuntar · la tarjeta queda como default del cliente (un toque para Cargar/Impulsar)');
    const saved = db.prepare('SELECT stripe_customer_id FROM users WHERE id = 21').get();
    t(saved.stripe_customer_id === out.customerId, 'adjuntar · el customer id quedó guardado en el usuario');
    t((await dc.resolverTarjetaGuardada(fake, out.customerId)) === pm.id,
      'adjuntar · el cobro de la billetera encuentra la tarjeta recién guardada');
    // Reenvío del mismo form: ya adjunta a ESTE cliente → no rompe.
    const out2 = await sb.adjuntarTarjeta(db, fake, user, pm.id);
    t(out2 && out2.last4 === '4242', 'adjuntar · reenvío del mismo form (ya adjunta a este cliente): no rompe, devuelve la tarjeta');
    // Adjunta a OTRO cliente: tira (no se roba la tarjeta de otro).
    const fake2 = makeFakeStripe();
    fake2._addCustomer('cus_A');
    fake2._addCustomer('cus_B');
    const pmOther = fake2._addCard('cus_A', 'visa', '1111');
    db.prepare("INSERT INTO users (id, email, stripe_customer_id) VALUES (22, 'otro@shop.com', 'cus_B')").run();
    const userB = db.prepare('SELECT * FROM users WHERE id = 22').get();
    let threw = false;
    try { await sb.adjuntarTarjeta(db, fake2, userB, pmOther.id); } catch (e) { threw = /previously used|not be used again/.test(e.message); }
    t(threw, 'adjuntar · PM adjunto a otro cliente: tira (no se re-adjunta)');
    // pmId inválido y sin cliente: tiran sin tocar Stripe.
    let threwInv = false;
    try { await sb.adjuntarTarjeta(db, fake, user, 'card_123'); } catch (e) { threwInv = /PaymentMethod inválido/.test(e.message); }
    t(threwInv, 'adjuntar · pmId sin prefijo pm_ tira antes de tocar Stripe');
    let threwNoClient = false;
    try { await sb.adjuntarTarjeta(db, null, user, pm.id); } catch (e) { threwNoClient = /Stripe no configurado/.test(e.message); }
    t(threwNoClient, 'adjuntar · sin cliente de Stripe tira (fail-closed)');
  }

  // ---------- 7. M78: funciones auditadas ----------
  for (const n of ['pzTarjetaInlineAbrir', 'pzTarjetaGuardar', 'pzTarjetaInlineCerrar', 'pzTarjetaFormHTML', 'pzTarjetaMotivo', 'pzTarjetaHostDe', 'pzStripeJsCargar', 'pzTarjetaConfig']) {
    t(appJs.includes('function ' + n + '('), 'M78 · definida en app.js ' + n);
  }
  t(appJs.includes('pzTarjetaInlineAbrir(document.getElementById(\'pzAdsTarjeta\'))'),
    'M78 · el botón de la billetera llama a pzTarjetaInlineAbrir y existe definida en app.js');
  t(appJs.includes('pzTarjetaGuardar(this)') && appJs.includes('pzTarjetaInlineCerrar(this)'),
    'M78 · los botones del form llaman a pzTarjetaGuardar / pzTarjetaInlineCerrar y existen definidos en app.js');
  for (const n of ['anaAgregarTarjeta', 'anaTarjetaBtnHTML', 'anaCargarSinTarjeta', 'anaAgregarTarjetaBtn', 'anaTarjetaRetorno', 'anaTarjetaMsgEl']) {
    t(chunk.includes('function ' + n + '('), 'M78 · definida en el chunk ' + n);
  }
  t(/typeof pzTarjetaInlineAbrir === 'function'/.test(chunk),
    'M78 · el chunk llama a pzTarjetaInlineAbrir solo si existe (guarda typeof: no rompe con app.js viejo cacheado)');
  t(/typeof pzTarjetaMotivo === 'function'/.test(chunk),
    'M78 · el chunk usa pzTarjetaMotivo solo si existe (guarda typeof)');
  t(/typeof anaAgregarTarjeta === 'function'/.test(appJs),
    'M78 · app.js (botón de respaldo del form) llama a anaAgregarTarjeta solo si existe (guarda typeof: el chunk se carga bajo demanda)');
  t(appJs.includes('function loadChunk('), 'M78 · loadChunk existe definida en app.js (la usa el botón de respaldo)');
  t(/adjuntarTarjeta/.test(fs.readFileSync(path.join(__dirname, 'stripe-billing.js'), 'utf8')) && /adjuntarTarjeta/.test(srv),
    'M78 · adjuntarTarjeta existe exportada en stripe-billing.js y la usa el endpoint payment-method');
  t(/createSetupSession/.test(srv), 'M78 · createSetupSession sigue usada por el endpoint setup (sin cambio de cableado)');
  t(/\.pz-tarjeta-form/.test(fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8')) && /\.pz-ads-tarjeta-btn/.test(fs.readFileSync(path.join(__dirname, 'public/styles.css'), 'utf8')),
    'M78 · las clases del form inline (.pz-tarjeta-form, .pz-ads-tarjeta-btn) existen en styles.css');

  console.log(`\ntest-lote-agregar-tarjeta: ${ok} OK, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
})();
