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
  const res = await fetch(`${MP_API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || data.error || `MP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// Crea una suscripción (preapproval) y devuelve el init_point para redirigir al pagador.
// Se envía el payer_email DEL USUARIO que se suscribe (su email de Posta):
// Mercado Pago lo exige para crear el preapproval, y el pagador debe autorizar
// con la cuenta de Mercado Pago de ese mismo email.
// La suscripción se identifica por external_reference (userId:planId), que es lo
// que usa el webhook para activar el plan correcto.
async function createSubscription({ plan, userId, baseUrl, payerEmail }) {
  if (!mpConfigured()) throw new Error('Pagos no configurados todavía');
  if (!payerEmail) throw new Error('Falta el email del pagador');
  const backUrls = {
    success: `${baseUrl}/#/app/ajustes?plan=ok`,
    pending: `${baseUrl}/#/app/ajustes?plan=pending`,
    failure: `${baseUrl}/#/app/ajustes?plan=error`,
  };
  const preapproval = await mpFetch('/preapproval', {
    method: 'POST',
    body: {
      reason: `Posta — Plan ${plan.name}`,
      payer_email: payerEmail,
      external_reference: `${userId}:${plan.id}`,
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

module.exports = { mpConfigured, createSubscription, getSubscription, cancelSubscription };
