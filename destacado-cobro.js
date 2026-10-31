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

module.exports = { MONTOS_USD, validarMontoUSD, resolverTarjetaGuardada, cobrarImpulso };
