// Suite del lote BILLETERA-APPLE-PAY-Y-TARJETAS-GUARDADAS.
// Harness como test-ads-billetera.js: contadores ok/bad, t(cond, name).
// Sin claves reales: el envío real por Stripe (botón en Safari, cobro en
// Wallet) NO se verifica acá; se verifica en vivo con los prerrequisitos
// del STATUS.md. Lo que sí se verifica: los helpers puros, la confirmación
// idempotente y que el cliente y el servidor tengan el cableado puesto.
const fs = require('fs');
const path = require('path');
const stripeBilling = require('./stripe-billing.js');
const adsBilletera = require('./ads-billetera.js');

let ok = 0, bad = 0;
function t(cond, name) { if (cond) { ok++; } else { bad++; console.log('✗ ' + name); } }
function eq(a, b, name) { t(JSON.stringify(a) === JSON.stringify(b), name + ' (esperado ' + JSON.stringify(b) + ', llegó ' + JSON.stringify(a) + ')'); }
function throws(fn, name) { let f = false; try { fn(); } catch (e) { f = true; } t(f, name); }

// ---------- buildTopupIntentParams ----------
const p20 = stripeBilling.buildTopupIntentParams({ customerId: 'cus_1', montoUSD: 20, ref: 'carga_applepay_u12_abc', userId: 12 });
eq(p20.amount, 2000, 'intent: $20 son 2000 centavos');
eq(p20.currency, 'usd', 'intent: moneda USD');
eq(p20.customer, 'cus_1', 'intent: customer');
eq(p20.payment_method_types, ['card'], 'intent: payment_method_types card');
eq(p20.setup_future_usage, 'off_session', 'intent: setup_future_usage off_session (la tarjeta queda guardada)');
eq(p20.metadata.flujo, 'carga_apple_pay', 'intent: metadata flujo');
eq(p20.metadata.user_id, '12', 'intent: metadata user_id');
eq(p20.metadata.monto_usd, '20', 'intent: metadata monto_usd');
eq(p20.metadata.ref, 'carga_applepay_u12_abc', 'intent: metadata ref');
eq(stripeBilling.buildTopupIntentParams({ customerId: 'cus_1', montoUSD: 50, ref: 'r', userId: 7 }).amount, 5000, 'intent: $50 son 5000 centavos');
eq(stripeBilling.buildTopupIntentParams({ customerId: 'cus_1', montoUSD: 100, ref: 'r', userId: 7 }).amount, 10000, 'intent: $100 son 10000 centavos');
throws(() => stripeBilling.buildTopupIntentParams({ customerId: 'cus_1', montoUSD: 30, ref: 'r', userId: 7 }), 'intent: monto 30 tira (solo 20/50/100)');
throws(() => stripeBilling.buildTopupIntentParams({ customerId: '', montoUSD: 20, ref: 'r', userId: 7 }), 'intent: sin customer tira');
throws(() => stripeBilling.buildTopupIntentParams({ customerId: 'cus_1', montoUSD: 20, ref: '', userId: 7 }), 'intent: sin ref tira');

// ---------- crearTopupIntent / recuperarTopupIntent (cliente falso) ----------
let ultimoCreate = null;
const fakeClient = {
  paymentIntents: {
    create: async (params) => { ultimoCreate = params; return { id: 'pi_abc123', client_secret: 'pi_abc123_secret_xyz' }; },
    retrieve: async (id) => ({
      id, status: 'succeeded', amount: 5000, currency: 'usd', payment_method: 'pm_999',
      metadata: { flujo: 'carga_apple_pay', user_id: '12', monto_usd: '50', ref: 'carga_applepay_u12_abc' },
    }),
  },
};
(async () => {
  const out = await stripeBilling.crearTopupIntent(fakeClient, { customerId: 'cus_1', montoUSD: 50, ref: 'carga_applepay_u12_abc', userId: 12 });
  eq(out.paymentIntentId, 'pi_abc123', 'crearTopupIntent: devuelve el id del PI');
  eq(out.clientSecret, 'pi_abc123_secret_xyz', 'crearTopupIntent: devuelve el clientSecret');
  eq(out.ref, 'carga_applepay_u12_abc', 'crearTopupIntent: devuelve el ref');
  eq(ultimoCreate.amount, 5000, 'crearTopupIntent: crea el PI con los params del builder');
  eq(ultimoCreate.metadata.flujo, 'carga_apple_pay', 'crearTopupIntent: metadata flujo en el PI creado');
  let tiroSinStripe = false;
  try { await stripeBilling.crearTopupIntent(null, { customerId: 'cus_1', montoUSD: 20, ref: 'r', userId: 1 }); } catch (e) { tiroSinStripe = /Stripe no configurado/.test(e.message); }
  t(tiroSinStripe, 'crearTopupIntent: sin Stripe configurado tira (fail-closed)');
  let tiroSinSecret = false;
  const fakeSinSecret = { paymentIntents: { create: async () => ({ id: 'pi_x' }) } };
  try { await stripeBilling.crearTopupIntent(fakeSinSecret, { customerId: 'cus_1', montoUSD: 20, ref: 'r', userId: 1 }); } catch (e) { tiroSinSecret = true; }
  t(tiroSinSecret, 'crearTopupIntent: PI sin client_secret tira');

  const rec = await stripeBilling.recuperarTopupIntent(fakeClient, 'pi_abc123', 12);
  eq(rec.ok, true, 'recuperarTopupIntent: PI succeeded válido → ok');
  eq(rec.montoUSD, 50, 'recuperarTopupIntent: montoUSD 50');
  eq(rec.ref, 'carga_applepay_u12_abc', 'recuperarTopupIntent: ref');
  eq(rec.cobroId, 'pi_abc123', 'recuperarTopupIntent: cobroId es el id del PI');
  eq(rec.paymentMethodId, 'pm_999', 'recuperarTopupIntent: paymentMethodId del PI');
  const recMalId = await stripeBilling.recuperarTopupIntent(fakeClient, 'no-es-un-pi', 12);
  eq(recMalId, { ok: false, motivo: 'pago_no_encontrado' }, 'recuperarTopupIntent: id sin formato pi_ no llama a Stripe');
  let tiroRecSinStripe = false;
  try { await stripeBilling.recuperarTopupIntent(null, 'pi_abc123', 12); } catch (e) { tiroRecSinStripe = /Stripe no configurado/.test(e.message); }
  t(tiroRecSinStripe, 'recuperarTopupIntent: sin Stripe configurado tira (fail-closed)');

  // ---------- validarTopupIntent ----------
  const piOk = { id: 'pi_1', status: 'succeeded', amount: 2000, currency: 'usd', payment_method: { id: 'pm_obj' }, metadata: { flujo: 'carga_apple_pay', user_id: '12', monto_usd: '20', ref: 'carga_applepay_u12_x' } };
  const vOk = stripeBilling.validarTopupIntent(piOk, 12);
  eq(vOk.ok, true, 'validar: PI ok');
  eq(vOk.paymentMethodId, 'pm_obj', 'validar: payment_method como objeto → id');
  eq(stripeBilling.validarTopupIntent(null, 12), { ok: false, motivo: 'pago_no_encontrado' }, 'validar: PI nulo → pago_no_encontrado');
  eq(stripeBilling.validarTopupIntent({ id: 'pi_1', status: 'requires_action' }, 12).motivo, 'pago_pendiente', 'validar: requires_action → pago_pendiente');
  eq(stripeBilling.validarTopupIntent({ id: 'pi_1', status: 'requires_payment_method' }, 12).motivo, 'pago_pendiente', 'validar: requires_payment_method → pago_pendiente');
  eq(stripeBilling.validarTopupIntent({ id: 'pi_1', status: 'canceled' }, 12).motivo, 'pago_no_confirmado', 'validar: canceled → pago_no_confirmado');
  const piEur = { ...piOk, currency: 'eur' };
  eq(stripeBilling.validarTopupIntent(piEur, 12).motivo, 'pago_moneda_invalida', 'validar: moneda EUR → pago_moneda_invalida');
  const pi30 = { ...piOk, amount: 3000, metadata: { ...piOk.metadata, monto_usd: '30' } };
  eq(stripeBilling.validarTopupIntent(pi30, 12).motivo, 'pago_monto_invalido', 'validar: monto $30 → pago_monto_invalido');
  const pi5050 = { ...piOk, amount: 5050 };
  eq(stripeBilling.validarTopupIntent(pi5050, 12).motivo, 'pago_monto_invalido', 'validar: monto no múltiplo de 100 → pago_monto_invalido');
  const piFlujo = { ...piOk, metadata: { ...piOk.metadata, flujo: 'carga_tarjeta' } };
  eq(stripeBilling.validarTopupIntent(piFlujo, 12).motivo, 'pago_flujo_invalido', 'validar: flujo distinto → pago_flujo_invalido');
  eq(stripeBilling.validarTopupIntent(piOk, 99).motivo, 'pago_usuario_invalido', 'validar: user_id distinto → pago_usuario_invalido');
  const piSinRef = { ...piOk, metadata: { flujo: 'carga_apple_pay', user_id: '12', monto_usd: '20' } };
  eq(stripeBilling.validarTopupIntent(piSinRef, 12).motivo, 'pago_sin_ref', 'validar: sin ref → pago_sin_ref');

  // ---------- refCargaApplePay ----------
  eq(adsBilletera.refCargaApplePay({ clienteId: 12, unico: 'abc123' }), 'carga_applepay_u12_abc123', 'refCargaApplePay: formato exacto');
  t(adsBilletera.refCargaApplePay({ clienteId: 12, unico: 'z' }).startsWith('carga_applepay_u12_'), 'refCargaApplePay: espacio propio carga_applepay_');
  t(adsBilletera.refCargaApplePay({ clienteId: 12, unico: 'z' }) !== adsBilletera.refCargaApplePay({ clienteId: 12, unico: 'y' }), 'refCargaApplePay: unico distinto → ref distinto');

  // ---------- confirmarCargaApplePay ----------
  const pagoOk = { ok: true, montoUSD: 50, ref: 'carga_applepay_u12_abc', cobroId: 'pi_abc123', paymentMethodId: 'pm_999' };
  const base = (over) => ({
    clienteId: 12, demo: false, monedaActual: 'USD', saldoActual: 0,
    buscarCarga: async () => null,
    verificarPago: async () => ({ ...pagoOk }),
    acreditar: async () => ({ ok: true, saldoNuevo: 5000 }),
    guardarTarjeta: async () => {},
    ...(over || {}),
  });
  const rOk = await adsBilletera.confirmarCargaApplePay(base());
  eq(rOk.ok, true, 'confirmar: pago válido → ok');
  eq(rOk.montoUSD, 50, 'confirmar: montoUSD 50');
  eq(rOk.cobroId, 'pi_abc123', 'confirmar: cobroId es el PI');
  eq(rOk.saldoNuevo, 5000, 'confirmar: saldoNuevo del acreditar');
  let llamadasGuardar = 0;
  await adsBilletera.confirmarCargaApplePay(base({ guardarTarjeta: async (pm) => { llamadasGuardar++; t(pm === 'pm_999', 'confirmar: guardarTarjeta recibe el PM del PI'); } }));
  t(llamadasGuardar === 1, 'confirmar: guardarTarjeta se llama una vez');
  const rGuardarFalla = await adsBilletera.confirmarCargaApplePay(base({ guardarTarjeta: async () => { throw new Error('stripe caído'); } }));
  eq(rGuardarFalla.ok, true, 'confirmar: si guardarTarjeta falla, la carga igual se acredita');
  const rDemo = await adsBilletera.confirmarCargaApplePay(base({ demo: true, verificarPago: async () => { throw new Error('no debería llamarse'); } }));
  eq(rDemo, { ok: false, motivo: 'demo' }, 'confirmar: demo → demo sin verificar el pago');
  const rSinCliente = await adsBilletera.confirmarCargaApplePay(base({ clienteId: 0 }));
  eq(rSinCliente, { ok: false, motivo: 'sin_cliente' }, 'confirmar: sin cliente → sin_cliente');
  const rArs = await adsBilletera.confirmarCargaApplePay(base({ monedaActual: 'ARS', saldoActual: 100, verificarPago: async () => { throw new Error('no debería llamarse'); } }));
  eq(rArs, { ok: false, motivo: 'saldo_ars_pendiente' }, 'confirmar: billetera ARS con saldo → saldo_ars_pendiente');
  const rSinProv = await adsBilletera.confirmarCargaApplePay(base({ verificarPago: null }));
  eq(rSinProv, { ok: false, motivo: 'sin_proveedores' }, 'confirmar: sin verificarPago → sin_proveedores');
  const rPagoMal = await adsBilletera.confirmarCargaApplePay(base({ verificarPago: async () => ({ ok: false, motivo: 'pago_no_confirmado' }) }));
  eq(rPagoMal, { ok: false, motivo: 'pago_no_confirmado' }, 'confirmar: pago no verificado → su motivo, sin acreditar');
  const rPagoTira = await adsBilletera.confirmarCargaApplePay(base({ verificarPago: async () => { throw new Error('red caída'); } }));
  eq(rPagoTira, { ok: false, motivo: 'pago_no_verificado' }, 'confirmar: verificarPago tira → pago_no_verificado');
  const rMontoMal = await adsBilletera.confirmarCargaApplePay(base({ verificarPago: async () => ({ ...pagoOk, montoUSD: 30 }) }));
  eq(rMontoMal.motivo, 'monto_invalido', 'confirmar: monto inválido del pago → monto_invalido');
  eq(rMontoMal.cobroId, 'pi_abc123', 'confirmar: monto inválido lleva el cobroId para revisión');
  const rSinRef = await adsBilletera.confirmarCargaApplePay(base({ verificarPago: async () => ({ ...pagoOk, ref: '' }) }));
  eq(rSinRef.motivo, 'pago_sin_ref', 'confirmar: pago sin ref → pago_sin_ref');
  let acrLlamadas = 0;
  const rYa = await adsBilletera.confirmarCargaApplePay(base({
    buscarCarga: async (rf) => { t(rf === 'carga_applepay_u12_abc', 'confirmar ya_cargado: buscarCarga recibe el ref del pago'); return { ref: rf }; },
    acreditar: async () => { acrLlamadas++; return { ok: true, saldoNuevo: 9999 }; },
  }));
  eq(rYa.ok, true, 'confirmar ya_cargado: ok');
  eq(rYa.ya_cargado, true, 'confirmar ya_cargado: marca ya_cargado');
  t(acrLlamadas === 0, 'confirmar ya_cargado: acreditar NO se llama (sin segundo crédito)');
  const rAcrFalla = await adsBilletera.confirmarCargaApplePay(base({ acreditar: async () => ({ ok: false, motivo: 'acreditar_fallido' }) }));
  eq(rAcrFalla, { ok: false, motivo: 'cobro_sin_acreditar', cobroId: 'pi_abc123' }, 'confirmar: acreditar falla → cobro_sin_acreditar con cobroId');
  const rAcrTira = await adsBilletera.confirmarCargaApplePay(base({ acreditar: async () => { throw new Error('db caída'); } }));
  eq(rAcrTira.motivo, 'cobro_sin_acreditar', 'confirmar: acreditar tira → cobro_sin_acreditar');
  const rSinAcr = await adsBilletera.confirmarCargaApplePay(base({ acreditar: null }));
  eq(rSinAcr.motivo, 'cobro_sin_acreditar', 'confirmar: sin acreditar → cobro_sin_acreditar');
  let acrArgs = null;
  await adsBilletera.confirmarCargaApplePay(base({ acreditar: async (a) => { acrArgs = a; return { ok: true, saldoNuevo: 5000 }; } }));
  eq(acrArgs, { montoUSD: 50, cobroId: 'pi_abc123', ref: 'carga_applepay_u12_abc' }, 'confirmar: acreditar recibe montoUSD + cobroId + ref');

  // ---------- Chequeos estáticos: servidor ----------
  const serverSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  t(serverSrc.includes("/api/ads/billetera/apple-pay/intent"), 'server: existe POST /api/ads/billetera/apple-pay/intent');
  t(serverSrc.includes("/api/ads/billetera/apple-pay/confirmar"), 'server: existe POST /api/ads/billetera/apple-pay/confirmar');
  t(serverSrc.includes('crearTopupIntent'), 'server: /intent usa crearTopupIntent');
  t(serverSrc.includes('recuperarTopupIntent'), 'server: /confirmar usa recuperarTopupIntent');
  t(serverSrc.includes('confirmarCargaApplePay'), 'server: /confirmar usa confirmarCargaApplePay');
  t(serverSrc.includes('refCargaApplePay'), 'server: /intent usa refCargaApplePay');
  t(serverSrc.includes("railCobro(uid) === 'mp'"), 'server: /intent rechaza riel MP');
  t(serverSrc.includes("motivo: 'applepay_no_disponible'"), 'server: motivo applepay_no_disponible');
  const confirmarBlock = serverSrc.slice(serverSrc.indexOf("/api/ads/billetera/apple-pay/confirmar"));
  t(!confirmarBlock.slice(0, 4000).includes('paymentIntents.create'), 'server: /confirmar NUNCA crea un cobro (solo verifica y acredita)');
  t(!confirmarBlock.slice(0, 4000).includes('cobrarCargaBilletera'), 'server: /confirmar no cobra con tarjeta guardada');
  t(serverSrc.includes("kind = 'topup_usd' AND ref = ?"), 'server: buscarCarga busca el ref en el ledger topup_usd');
  const stripeSrc = fs.readFileSync(path.join(__dirname, 'stripe-billing.js'), 'utf8');
  t(stripeSrc.includes('buildTopupIntentParams'), 'stripe-billing: buildTopupIntentParams');
  t(stripeSrc.includes('crearTopupIntent'), 'stripe-billing: crearTopupIntent');
  t(stripeSrc.includes('validarTopupIntent'), 'stripe-billing: validarTopupIntent');
  t(stripeSrc.includes('recuperarTopupIntent'), 'stripe-billing: recuperarTopupIntent');
  const adsSrc = fs.readFileSync(path.join(__dirname, 'ads-billetera.js'), 'utf8');
  t(adsSrc.includes('confirmarCargaApplePay'), 'ads-billetera: confirmarCargaApplePay');
  t(adsSrc.includes('refCargaApplePay'), 'ads-billetera: refCargaApplePay');

  // ---------- Chequeos estáticos: cliente ----------
  const appSrc = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
  t(appSrc.includes("elements.create('expressCheckout'"), 'app: Express Checkout Element (no Payment Request Button)');
  t(!appSrc.includes('paymentRequestButton'), 'app: NO usa el Payment Request Button deprecado');
  t(appSrc.includes('pzAdsApplePayMontar'), 'app: pzAdsApplePayMontar');
  t(appSrc.includes('pzAdsApplePayElegir'), 'app: pzAdsApplePayElegir (píldoras de monto)');
  t(appSrc.includes('pzAdsApplePayBtn'), 'app: slot pzAdsApplePayBtn');
  t(appSrc.includes('pzAdsApplePayMsg'), 'app: mensaje pzAdsApplePayMsg');
  t(appSrc.includes('availablePaymentMethods'), 'app: ready oculta la sección si no hay métodos disponibles');
  t(appSrc.includes('applePay'), 'app: Apple Pay en el elemento');
  t(appSrc.includes('googlePay'), 'app: Google Pay viene en el mismo elemento');
  t(appSrc.includes("redirect: 'if_required'"), 'app: confirmPayment con redirect if_required');
  t(appSrc.includes("'/api/ads/billetera/apple-pay/intent'"), 'app: llama a /intent');
  t(appSrc.includes("'/api/ads/billetera/apple-pay/confirmar'"), 'app: llama a /confirmar');
  t(appSrc.includes("pzBoostEsMP()) { host.hidden = true"), 'app: riel MP oculta Apple Pay');
  t(appSrc.includes('pzAdsApplePayMontar(); } catch (e) {}'), 'app: re-montaje tras re-pintar la billetera');
  t(appSrc.includes("if (tab === 'ads') { try { pzAdsApplePayMontar();"), 'app: montaje al pintar el tab Ads');
  t(appSrc.includes("autocomplete=\"cc-name\""), 'app: form manual con autocomplete cc-name (autofill iOS)');
  t(appSrc.includes("cardNumber"), 'app: form manual sigue con Stripe Elements (número/vencimiento/CVC)');

  // ---------- Chequeos estáticos: estilos ----------
  const cssSrc = fs.readFileSync(path.join(__dirname, 'public', 'styles.css'), 'utf8');
  t(cssSrc.includes('.pz-applepay'), 'css: .pz-applepay');
  t(cssSrc.includes('.pz-applepay-pill'), 'css: .pz-applepay-pill');
  t(cssSrc.includes('.pz-applepay-pill-sel'), 'css: .pz-applepay-pill-sel');
  t(cssSrc.includes('.pz-applepay-msg'), 'css: .pz-applepay-msg');

  console.log(`\nLOTE BILLETERA-APPLE-PAY: ${ok} ok, ${bad} mal`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('SUITE ROTA:', e); process.exit(2); });
