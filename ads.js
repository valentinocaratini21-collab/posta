// Publicidad en Posta — billetera + boost de posteos ganadores.
// El cliente carga crédito (ARS) vía MercadoPago; Posta corre la pauta en Meta
// y se queda con AD_FEE_PCT en concepto de gestión. El resto va a la pauta.
//
// ⚠️ OPERATIVA REAL (no es código): para pautar el posteo de UN cliente desde
// NUESTRA cuenta publicitaria, la Página de Facebook vinculada a su Instagram
// tiene que autorizar nuestra cuenta (flujo "agencia": socio del Business
// Manager o cuenta publicitaria compartida). Sin eso, el boost queda en
// 'pending' y lo activa el equipo manualmente desde el panel admin.

// % de gestión Posta sobre cada pauta (transparente para el cliente)
const AD_FEE_PCT = 20;

// Carga mínima de la billetera: $10.000 ARS
const AD_MIN_TOPUP_CENTS = 1000000;
const AD_TOPUP_OPTIONS = [1000000, 2000000, 5000000]; // $10k / $20k / $50k

// Presupuestos por pauta: $5k / $10k / $20k
const AD_BUDGET_OPTIONS = [500000, 1000000, 2000000];
const AD_MIN_BUDGET_CENTS = 500000;

// Duración default de cada pauta (días)
const AD_DEFAULT_DAYS = 7;

// Divide un presupuesto en fee de gestión + gasto real en Meta (redondeo a favor del cliente)
function adSplit(budgetCents) {
  const fee = Math.round((budgetCents * AD_FEE_PCT) / 100);
  return { fee_cents: fee, spend_cents: budgetCents - fee };
}

function fmtARS(cents) {
  return '$' + Math.round(cents / 100).toLocaleString('es-AR');
}

module.exports = {
  AD_FEE_PCT,
  AD_MIN_TOPUP_CENTS,
  AD_TOPUP_OPTIONS,
  AD_BUDGET_OPTIONS,
  AD_MIN_BUDGET_CENTS,
  AD_DEFAULT_DAYS,
  adSplit,
  fmtARS,
};
