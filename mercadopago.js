// Mercado Pago — suscripciones (preapproval) para cobrar los planes en Argentina.
// Usa la API REST de MP con el access token del vendedor (MP_ACCESS_TOKEN).
// Si no hay token configurado, todo el módulo opera en modo "no configurado"
// y NUNCA rompe: los endpoints devuelven un mensaje claro.

const MP_API = 'https://api.mercadopago.com';

function getToken() {
  return (process.env.MP_ACCESS_TOKEN || '').trim();
}

function mpConfigured() {
  return getToken().length > 10;
}

async function mpFetch(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${MP_API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new Error('MercadoPago no responde (timeout). Probá de nuevo en unos minutos.');
    }
    throw new Error('No se pudo conectar con MercadoPago.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || `MP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Crea una suscripción (preapproval) y devuelve el init_point para redirigir al pagador.
// payer_email es REQUERIDO por MercadoPago y debe ser el email de la cuenta de MP
// con la que el usuario va a pagar (no necesariamente el email de Posta).
// La suscripción se identifica por external_reference (userId:planId), que es lo
// que usa el webhook para activar el plan correcto.
async function createSubscription({ plan, userId, baseUrl, payerEmail }) {
  if (!mpConfigured()) throw new Error('Pagos no configurados todavía');
  if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    throw new Error('Falta el email de MercadoPago.');
  }
  const backUrls = {
    success: `${baseUrl}/#/app/ajustes?plan=ok`,
    pending: `${baseUrl}/#/app/ajustes?plan=pending`,
    failure: `${baseUrl}/#/app/ajustes?plan=error`,
  };
  const preapproval = await mpFetch('/preapproval', {
    method: 'POST',
    body: {
      reason: `Posta — Plan ${plan.name}`,
      external_reference: `${userId}:${plan.id}`,
      payer_email: payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: plan.price,
        currency_id: plan.currency || 'ARS',
      },
      back_url: backUrls.success,
      status: 'pending',
    },
  });
  return { init_point: preapproval.init_point, preapproval_id: preapproval.id };
}

// Lee una suscripción para validar su estado real (usado por el webhook).
async function getSubscription(preapprovalId) {
  if (!mpConfigured()) throw new Error('Pagos no configurados todavía');
  return mpFetch(`/preapproval/${encodeURIComponent(preapprovalId)}`);
}

// Cancela una suscripción del lado de MP.
async function cancelSubscription(preapprovalId) {
  if (!mpConfigured()) throw new Error('Pagos no configurados todavía');
  return mpFetch(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'PUT',
    body: { status: 'cancelled' },
  });
}

// Actualiza el monto mensual de una suscripción existente (para aplicar o quitar
// descuentos de referidos sin que el usuario tenga que re-suscribirse).
// NOTA: este llamado PUT con auto_recurring no está verificado contra la API
// real todavía (sí están verificados POST, GET y PUT-cancel). Si MP lo rechaza,
// se loguea y la DB no cambia.
async function updateSubscriptionAmount(preapprovalId, amount) {
  if (!mpConfigured()) throw new Error('Pagos no configurados todavía');
  const amt = Math.round(Number(amount));
  if (!amt || amt <= 0) throw new Error('Monto inválido');
  return mpFetch(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
    method: 'PUT',
    body: { auto_recurring: { transaction_amount: amt } },
  });
}

module.exports = { mpConfigured, createSubscription, getSubscription, cancelSubscription, updateSubscriptionAmount };
