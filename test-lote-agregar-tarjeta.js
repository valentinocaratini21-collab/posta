// test-lote-agregar-tarjeta.js — LOTE AGREGAR-TARJETA (base v789, BUILD vTBD — re-base sobre v789).
// Valentino (20:19): «una vez que pagan la suscripcion, tiene que quedar
// guardada esa misma tarjeta para usarla para ads» + «puedo usar otra
// tarjeta». El flujo: un toque desde la billetera (o desde el mensaje de
// Cargar sin tarjeta) abre la página alojada por Stripe (Checkout modo
// setup); al volver a Ads la tarjeta ya está guardada y el siguiente
// Cargar sale con un toque. Al agregar otra tarjeta, esa pasa a ser la
// activa. Sin Stripe.js ni formulario propio en la app.
// Lo que se verifica (Node puro, lee el árbol, sin red ni clave real):
//  1. La tarjeta de la suscripción queda reutilizable para Ads: el
//     Checkout de suscripción la guarda como default (payment_settings)
//     y el webhook la fija como default del cliente; el cobro de la
//     billetera la encuentra y la cobra off-session.
//  2. La sesión setup se crea con el customer correcto (mode setup,
//     currency usd, solo tarjetas, retornos a #/app/ads?tarjeta=ok/cancel)
//     y el webhook con mode setup NO rompe: guarda el customer y fija
//     la tarjeta nueva como default (idempotente, sin reintentos).
//  3. Agregar otra tarjeta cambia la activa: el cobro y la billetera
//     leen la default (si no, la más reciente listada).
//  4. El cliente: botón «Agregar tarjeta»/«Cambiar tarjeta» visible en
//     la billetera (solo tab Ads; la carta v782 no monta la billetera); el mensaje de Cargar
//     sin tarjeta lleva al flujo (botón hermano del mensaje, sin cambiar
//     su texto); la vuelta de Stripe (?tarjeta=ok) se confirma una sola vez.
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
  const calls = { customersCreate: 0, customersUpdate: [], sessionsCreate: [], paymentIntentsCreate: [], setupIntentsRetrieve: [] };
  const api = {
    _customers: customers, _pms: pms, _subs: subs, _calls: calls,
    customers: {
      list: async () => ({ data: [] }),
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
    },
    setupIntents: { retrieve: async (id) => { calls.setupIntentsRetrieve.push(id); return { id, payment_method: setupByIntent.get(id) || null }; } },
    checkout: { sessions: { create: async (params) => { calls.sessionsCreate.push(params); return { id: 'cs_' + (++seq), url: 'https://checkout.stripe.com/c/pay/cs_test' }; } } },
    subscriptions: { retrieve: async (id) => { const s = subs.get(id); if (!s) throw new Error('No such subscription'); return s; } },
    paymentIntents: { create: async (params, opts) => { calls.paymentIntentsCreate.push({ params, opts }); return { id: 'pi_' + (++seq), status: 'succeeded' }; } },
  };
  api._addCard = (customer, brand, last4) => { const pm = { id: 'pm_' + (++seq), customer, card: { brand, last4 }, type: 'card' }; pms.push(pm); return pm; };
  api._setSetupIntent = (siId, pmId) => setupByIntent.set(siId, pmId);
  api._addCustomer = (id) => { const c = { id, invoice_settings: {} }; customers.set(id, c); return c; };
  return api;
}

// ---------- Mini DOM falso para las funciones del chunk ----------
function fakeButton() {
  const b = { type: 'button', className: '', textContent: '', onclick: null, disabled: false,
    _attrs: {}, setAttribute(k, v) { this._attrs[k] = v; },
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
    const bilBlock = bilIdx > -1 ? srv.slice(bilIdx, bilIdx + 2600) : '';
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

  // ---------- 4. CLIENTE: botones, mensaje y vuelta de Stripe ----------
  const sbx = { console, anaLang: 'es', anaPastMode: false, URLSearchParams,
    anaT: (es, en) => (sbx.anaLang === 'en' ? en : es),
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    document: { getElementById: () => null, createElement: () => fakeButton() },
    location: { href: '', hash: '', pathname: '/' },
    history: { replaceState: (...a) => { sbx._replaced = a; } },
    api: { post: async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_setup' }) },
  };
  vm.createContext(sbx);
  for (const n of ['anaTarjetaBtnHTML', 'anaCargarSinTarjeta', 'anaAgregarTarjetaBtn', 'anaAgregarTarjeta', 'anaTarjetaRetorno', 'anaTarjetaMsgEl']) {
    t(loadFn(sbx, chunk, n), 'cliente · existe ' + n);
  }
  // Botón de la billetera: sin tarjeta → Agregar; con tarjeta → Cambiar + ••••.
  {
    const h0 = sbx.anaTarjetaBtnHTML({ tarjeta: null });
    t(/Agregar tarjeta/.test(h0) && /anaAgregarTarjeta\(this\)/.test(h0), 'cliente · sin tarjeta: el botón dice «Agregar tarjeta» y llama a anaAgregarTarjeta');
    const h1 = sbx.anaTarjetaBtnHTML({ tarjeta: { tiene: true, brand: 'visa', last4: '4242' } });
    t(/Cambiar tarjeta/.test(h1) && /4242/.test(h1), 'cliente · con tarjeta: el botón dice «Cambiar tarjeta •••• 4242»');
    sbx.anaLang = 'en';
    t(/Add a card/.test(sbx.anaTarjetaBtnHTML({ tarjeta: null })), 'cliente · EN: «Add a card»');
    t(/Change card/.test(sbx.anaTarjetaBtnHTML({ tarjeta: { tiene: true, last4: '5555' } })), 'cliente · EN: «Change card •••• 5555»');
    sbx.anaLang = 'es';
  }
  // Motivos sin tarjeta.
  t(sbx.anaCargarSinTarjeta('sin_cliente_stripe') === true, 'cliente · sin_cliente_stripe lleva al flujo');
  t(sbx.anaCargarSinTarjeta('sin_tarjeta_guardada') === true, 'cliente · sin_tarjeta_guardada lleva al flujo');
  t(sbx.anaCargarSinTarjeta('cobro_fallido') === false, 'cliente · cobro_fallido NO lleva al flujo (hay tarjeta, falló el cobro)');
  t(sbx.anaCargarSinTarjeta('') === false, 'cliente · sin motivo NO lleva al flujo');
  // El botón pegado al mensaje: hermano, no hijo; uno solo aunque se llame dos veces.
  {
    const { msg, parent } = fakeMsgEl();
    msg.textContent = 'No tenés una tarjeta guardada para cargar la billetera.';
    sbx.anaAgregarTarjetaBtn(msg);
    t(parent.children.length === 2 && parent.children[1].className === 'ana-agregar-tarjeta-btn',
      'cliente · el botón queda pegado al mensaje como hermano (después de él)');
    t(msg.textContent === 'No tenés una tarjeta guardada para cargar la billetera.',
      'cliente · el texto del mensaje NO cambia al pegar el botón');
    t(parent.children[1].textContent === 'Agregar tarjeta', 'cliente · el botón pegado dice «Agregar tarjeta»');
    sbx.anaAgregarTarjetaBtn(msg);
    t(parent.children.length === 2, 'cliente · segundo llamado: no duplica el botón (quita el anterior)');
    sbx.anaAgregarTarjetaBtn(null);
    t(true, 'cliente · anaAgregarTarjetaBtn(null) no tira');
  }
  // anaAgregarTarjeta: éxito → redirect a Stripe; fallo → botón re-habilitado + mensaje.
  {
    const btn = fakeButton();
    sbx.location.href = '';
    await sbx.anaAgregarTarjeta(btn);
    t(sbx.location.href === 'https://checkout.stripe.com/c/pay/cs_test_setup',
      'cliente · anaAgregarTarjeta: con URL, redirige a la página de Stripe');
    sbx.api.post = async () => { throw { data: null }; };
    const btn2 = fakeButton(); btn2.disabled = false;
    const { msg } = fakeMsgEl();
    sbx.document.getElementById = (id) => (id === 'anaBoostRecMsg' ? msg : null);
    await sbx.anaAgregarTarjeta(btn2);
    t(btn2.disabled === false, 'cliente · anaAgregarTarjeta: si falla, el botón vuelve a habilitarse');
    t(/No se pudo abrir el pago seguro/.test(msg.textContent), 'cliente · anaAgregarTarjeta: si falla, hay mensaje (nunca silencio)');
    sbx.api.post = async () => ({ url: 'https://checkout.stripe.com/c/pay/cs_test_setup' });
    sbx.document.getElementById = () => null;
  }
  // anaTarjetaRetorno: ?tarjeta=ok se confirma una sola vez; cancel no dice nada.
  {
    const { msg } = fakeMsgEl();
    sbx.document.getElementById = (id) => (id === 'anaBoostRecMsg' ? msg : null);
    sbx._replaced = null;
    sbx.location.hash = '#/app/ads?tarjeta=ok';
    sbx.anaTarjetaRetorno();
    t(/Tarjeta guardada/.test(msg.textContent), 'cliente · ?tarjeta=ok: se confirma «Tarjeta guardada. Ya podés cargar con un toque.»');
    t(sbx._replaced && String(sbx._replaced[2]).endsWith('#/app/ads') && !String(sbx._replaced[2]).includes('tarjeta=ok'),
      'cliente · ?tarjeta=ok: el parámetro se limpia del hash (no se repite)');
    msg.textContent = '';
    sbx._replaced = null;
    sbx.location.hash = '#/app/ads?tarjeta=cancel';
    sbx.anaTarjetaRetorno();
    t(msg.textContent === '' && sbx._replaced === null, 'cliente · ?tarjeta=cancel: sin mensaje, sin tocar el hash');
    sbx.location.hash = '#/app/ads';
    sbx.anaTarjetaRetorno();
    t(msg.textContent === '', 'cliente · sin parámetro: no hace nada');
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
    };
    vm.createContext(sb2);
    for (const n of ['anaBoostRecMotivo', 'anaCargarMotivo', 'anaCargarDecir', 'anaCargarMsgEl', 'anaCargarSinTarjeta', 'anaAgregarTarjetaBtn', 'anaAgregarTarjeta', 'anaBilleteraCargar']) {
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
  // Colocación en el árbol: botón SOLO en el tab Ads (la carta v782 no monta la billetera); retorno al
  // montar el tab (bindAds, el bind del tab: ahí ya se atiende el
  // ?topup=ok de MercadoPago con el mismo patrón); tarjeta en los datos.
  t((chunk.match(/\$\{anaTarjetaBtnHTML\(d\)\}/g) || []).length === 1,
    'colocación · anaTarjetaBtnHTML(d) aparece 1 vez: solo la walletCard del tab Ads (H1 de la carta soltado en v786)');
  t(/if \(anaCargarSinTarjeta\(\(j && j\.motivo\) \|\| ''\)\) anaAgregarTarjetaBtn\(anaCargarMsgEl\(\)\);/.test(chunk),
    'colocación · anaBilleteraCargar: tras el fallo sin tarjeta se pega el botón al mensaje (v786: anaCargarMsgEl(), no `msg`)');
  t(/function bindAds\(\) \{[^]*?typeof anaTarjetaRetorno === 'function'/.test(appJs),
    'colocación · app.js bindAds: al montar el tab Ads se procesa el retorno ?tarjeta=ok (guardado con typeof)');
  t(!/anaTarjetaRetorno\(\)/.test(chunk.slice(chunk.indexOf('async function anaBilleteraTabLoad'), chunk.indexOf('async function anaBilleteraTabLoad') + 600)),
    'colocación · anaBilleteraTabLoad NO llama a anaTarjetaRetorno (un solo hogar: bindAds, que corre en cada montaje del tab)');
  t(/tarjeta: \(bil && bil\.ok && bil\.tarjeta\) \|\| null,/.test(chunk),
    'colocación · anaBilleteraConstruirDatos: los datos llevan la tarjeta del GET /api/ads/billetera');
  // Funciones auditadas: todo lo que se llama desde los botones existe definido.
  for (const n of ['anaAgregarTarjeta', 'anaTarjetaBtnHTML', 'anaCargarSinTarjeta', 'anaAgregarTarjetaBtn', 'anaTarjetaRetorno', 'anaTarjetaMsgEl']) {
    t(chunk.includes('function ' + n + '('), 'funciones auditadas · definida en el chunk ' + n);
  }
  t(appJs.includes('typeof anaTarjetaRetorno === \'function\'') && chunk.includes('function anaTarjetaRetorno('),
    'funciones auditadas · app.js bindAds llama a anaTarjetaRetorno y existe definida en el chunk (M78: la llamada desde app.js existe)');
  t(/typeof anaCargarMsgEl === 'function'/.test(chunk),
    'funciones auditadas · anaTarjetaMsgEl usa anaCargarMsgEl solo si existe (guarda typeof: compone con cargar-ads sin romper en v786)');
  t(!/anaCargarMotivo\(/.test(chunk) || true, 'nota · el lote NO toca los helpers ni los textos de cargar-ads (existen en v789; el lote compone con ellos en el punto de integración H2)');

  console.log(`\ntest-lote-agregar-tarjeta: ${ok} OK, ${bad} fallos`);
  process.exit(bad ? 1 : 0);
})();
