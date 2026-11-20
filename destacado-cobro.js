'use strict';
// destacado-cobro.js — Cobro off-session con la tarjeta guardada (Stripe).
//
// LOTE 5: cableado de cobro del botón Impulsar (Parte B del destacado).
// Este módulo NO importa Stripe: el cliente se inyecta (en producción:
// stripe-billing.stripeClient()). Así los tests verifican el cableado
// sin tocar dinero real ni la API de Stripe.
//
// REGLAS DURAS:
// - Solo los 3 montos fijos aprobados (USD 20/50/100), sin campo libre.
// - El monto pasa tal cual: sin fee, sin billetera, sin conversión acá.
// - Fail-closed en cada paso: sin cliente Stripe → no se cobra; sin
//   tarjeta guardada → no se cobra; sin confirmación → no se cobra.
//   Un cobro que exige acción del cliente (3DS) NO se confirma solo:
//   vuelve como 'cobro_requiere_accion', nunca como éxito.
// - Idempotencia: cada intento lleva clave (cliente + semana + posteo +
//   monto) para que un reintento no duplique el cargo.
// - Nunca se lanza una excepción hacia arriba: todo fallo vuelve como
//   { ok: false, motivo } para que el endpoint lo reporte sin romper.

const MONTOS_USD = [20, 50, 100];

function validarMontoUSD(monto) {
  return typeof monto === 'number' && Number.isInteger(monto) && MONTOS_USD.includes(monto);
}

// (LOTE ADS-DIFERENCIA) La carga de la diferencia de un impulso cobra
// un monto que NO es uno de los fijos (p. ej. US$2): solo se acepta
// cuando el llamador pasa permitirDiferencia, y el endpoint ya
// recomputó que el monto ES la diferencia exacta (monto elegido −
// saldo real). Sin el flag, esta costura sigue cobrando únicamente
// los 3 montos fijos aprobados. La cota es la del validador espejo de
// ads-billetera: entero, mayor que 0 y hasta el monto fijo mayor.
function validarMontoDiferenciaUSD(monto) {
  return typeof monto === 'number' && Number.isInteger(monto) && monto >= 1 && monto <= Math.max(...MONTOS_USD);
}

// Resuelve la tarjeta guardada: primero la default del cliente, si no
// la primera tarjeta listada. Sin tarjeta → null (fail-closed).
async function resolverTarjetaGuardada(client, customerId) {
  try {
    const cust = await client.customers.retrieve(customerId);
    const def = cust && cust.invoice_settings && cust.invoice_settings.default_payment_method;
    if (typeof def === 'string' && def) return def;
    if (def && typeof def === 'object' && def.id) return def.id;
  } catch (e) { /* cae al listado */ }
  try {
    const list = await client.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 });
    const pm = list && list.data && list.data[0];
    if (pm && pm.id) return pm.id;
  } catch (e) { /* sin tarjeta resoluble */ }
  return null;
}

// (LOTE AGREGAR-TARJETA) Info de la tarjeta activa para mostrarla en la
// billetera: la default del cliente, si no la más reciente listada
// (misma regla que el cobro: lo que se muestra es lo que se cobra).
// Sin tarjeta → { tiene: false }. Si el retrieve de la marca falla,
// igual se reporta que hay tarjeta (el cobro no depende de la marca).
async function tarjetaGuardadaInfo(client, customerId) {
  if (!client || !customerId) return { tiene: false };
  let pmId = null;
  try { pmId = await resolverTarjetaGuardada(client, customerId); } catch (e) { return { tiene: false }; }
  if (!pmId) return { tiene: false };
  try {
    const pm = await client.paymentMethods.retrieve(pmId);
    const card = (pm && pm.card) || {};
    return { tiene: true, id: pmId, brand: card.brand || '', last4: card.last4 || '' };
  } catch (e) { return { tiene: true, id: pmId, brand: '', last4: '' }; }
}

// cobrarImpulso({ client, customerId, montoUSD, posteoId, weekKey, dias })
//   → { ok: true, cobroId } ó { ok: false, motivo [, detalle] }.
// Nunca cobra sin tarjeta guardada ni sin confirmación.
async function cobrarImpulso(input) {
  const { client, customerId, montoUSD, posteoId, weekKey, dias } = input || {};
  if (!client) return { ok: false, motivo: 'stripe_no_configurado' };
  if (!customerId) return { ok: false, motivo: 'sin_cliente_stripe' };
  if (!validarMontoUSD(montoUSD)) return { ok: false, motivo: 'monto_invalido' };
  const pmId = await resolverTarjetaGuardada(client, customerId);
  if (!pmId) return { ok: false, motivo: 'sin_tarjeta_guardada' };
  const idem = ['destacado', String(customerId), String(weekKey || ''), String(posteoId), String(montoUSD)].join(':');
  let pi;
  try {
    pi = await client.paymentIntents.create({
      amount: montoUSD * 100,
      currency: 'usd',
      customer: customerId,
      payment_method: pmId,
      off_session: true,
      confirm: true,
      description: `Posty · Impulsar posteo ${posteoId} x ${dias || 7} dias`,
      metadata: { app: 'posty', tipo: 'destacado_impulso', posteo_id: String(posteoId), dias: String(dias || 7) },
    }, { idempotencyKey: idem });
  } catch (e) {
    return { ok: false, motivo: 'cobro_fallido', detalle: String((e && e.message) || e).slice(0, 200) };
  }
  if (!pi || !pi.id) return { ok: false, motivo: 'cobro_fallido' };
  if (pi.status === 'succeeded') return { ok: true, cobroId: pi.id };
  if (pi.status === 'requires_action' || pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') {
    return { ok: false, motivo: 'cobro_requiere_accion', piStatus: pi.status };
  }
  return { ok: false, motivo: 'cobro_no_confirmado', piStatus: pi.status || null };
}

// (LOTE CIERRE-ADS · FIX 3a) reembolsarImpulso({ client, cobroId })
//   → { ok: true, refundId } ó { ok: false, motivo [, detalle] }.
// Decisión de Valentino 15/11: si el anuncio nunca sale, la plata se
// devuelve ENTERA Y SOLA al medio de pago original — el refund va
// sobre el PaymentIntent del cobro, nunca como crédito de billetera
// (el crédito de v888 queda solo para un opt-in explícito del
// cliente). Idempotente por cobroId (ref reembolso_<cobroId>, espejo
// del patrón credito_<cobroId>): un reintento del registro no
// devuelve dos veces. Un refund 'pending' en Stripe ya es plata en
// camino a la fuente: cuenta como devolución hecha y su id se guarda.
async function reembolsarImpulso(input) {
  const { client, cobroId } = input || {};
  if (!client) return { ok: false, motivo: 'stripe_no_configurado' };
  if (!cobroId) return { ok: false, motivo: 'sin_cobro' };
  if (!client.refunds || typeof client.refunds.create !== 'function') return { ok: false, motivo: 'stripe_no_configurado' };
  let rf;
  try {
    rf = await client.refunds.create({ payment_intent: String(cobroId) }, { idempotencyKey: `reembolso_${cobroId}` });
  } catch (e) {
    return { ok: false, motivo: 'reembolso_fallido', detalle: String((e && e.message) || e).slice(0, 200) };
  }
  if (!rf || !rf.id) return { ok: false, motivo: 'reembolso_fallido' };
  if (rf.status === 'succeeded' || rf.status === 'pending') return { ok: true, refundId: String(rf.id), status: rf.status };
  return { ok: false, motivo: 'reembolso_fallido', detalle: `refund ${rf.status || 'sin_estado'}` };
}

module.exports = { MONTOS_USD, validarMontoUSD, validarMontoDiferenciaUSD, resolverTarjetaGuardada, tarjetaGuardadaInfo, cobrarImpulso, cobrarCargaBilletera, reembolsarImpulso };

// cobrarCargaBilletera({ client, customerId, montoUSD, ref })
//   → { ok: true, cobroId } ó { ok: false, motivo [, detalle] }.
// LOTE ADS-BILLETERA: la carga de plata a la billetera USD. Mismo cableado
// que cobrarImpulso (off-session con la tarjeta guardada, solo los 3 montos
// fijos, fail-closed en cada paso), pero con otro concepto: la plata queda
// en la billetera y se gasta después, al impulsar. La clave de idempotencia
// es el `ref` de la carga (uno por intento): un reintento con el mismo ref
// no duplica el cargo. Sin ref, se usa cliente+monto+día (un solo cargo de
// ese monto por día y cliente como red de seguridad).
async function cobrarCargaBilletera(input) {
  const { client, customerId, montoUSD, ref, permitirDiferencia } = input || {};
  if (!client) return { ok: false, motivo: 'stripe_no_configurado' };
  if (!customerId) return { ok: false, motivo: 'sin_cliente_stripe' };
  if (!(permitirDiferencia ? validarMontoDiferenciaUSD(montoUSD) : validarMontoUSD(montoUSD))) return { ok: false, motivo: 'monto_invalido' };
  const pmId = await resolverTarjetaGuardada(client, customerId);
  if (!pmId) return { ok: false, motivo: 'sin_tarjeta_guardada' };
  const idem = ref
    ? ['billetera', String(customerId), String(ref)].join(':')
    : ['billetera', String(customerId), String(montoUSD), new Date().toISOString().slice(0, 10)].join(':');
  let pi;
  try {
    pi = await client.paymentIntents.create({
      amount: montoUSD * 100,
      currency: 'usd',
      customer: customerId,
      payment_method: pmId,
      off_session: true,
      confirm: true,
      description: `Posty · Carga billetera ads $${montoUSD}`,
      metadata: { app: 'posty', tipo: 'billetera_carga', monto_usd: String(montoUSD) },
    }, { idempotencyKey: idem });
  } catch (e) {
    return { ok: false, motivo: 'cobro_fallido', detalle: String((e && e.message) || e).slice(0, 200) };
  }
  if (!pi || !pi.id) return { ok: false, motivo: 'cobro_fallido' };
  if (pi.status === 'succeeded') return { ok: true, cobroId: pi.id };
  if (pi.status === 'requires_action' || pi.status === 'requires_payment_method' || pi.status === 'requires_confirmation') {
    return { ok: false, motivo: 'cobro_requiere_accion', piStatus: pi.status };
  }
  return { ok: false, motivo: 'cobro_no_confirmado', piStatus: pi.status || null };
}
