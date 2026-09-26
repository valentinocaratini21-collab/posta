// billing-sync — sincroniza el monto cobrado por MercadoPago con el descuento vigente.
//
// El descuento (50% por 2 referidos / 20% de invitado) se aplica al crear la
// suscripción en MP, pero los referidos pueden cambiar DESPUÉS:
//   - alguien que pagaba lleno consigue 2 referidos → debe pasar a 50%
//   - alguien con 50% pierde un referido → debe volver al precio lleno
// Sin esto, MP seguiría cobrando el monto viejo (de más o de menos).
//
// Estrategia: al suscribirse se guarda mp_base_amount (precio lleno) y mp_mult
// (multiplicador aplicado). La conciliación compara el multiplicador objetivo
// (según referidos actuales) con el aplicado y, si difieren, actualiza el
// preapproval en MP. Nunca toca un preapproval que no esté 'authorized' y
// nunca cambia la DB si MP no confirmó el cambio.

const mp = require('./mercadopago');

// Mantener sincronizado con server.js
const REFERRALS_NEEDED = 2;
const REFERRAL_DISCOUNT = 0.5;
const FRIEND_DISCOUNT = 0.8;

function targetMult(db, userId) {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE referred_by = ? AND plan_status = 'active'`).get(userId);
  if (row && row.n >= REFERRALS_NEEDED) return REFERRAL_DISCOUNT;
  const me = db.prepare('SELECT referred_by FROM users WHERE id = ?').get(userId);
  if (me && me.referred_by) return FRIEND_DISCOUNT;
  return 1;
}

// Backfill para suscriptores que existen desde antes de estas columnas:
// deduce el multiplicador del `reason` guardado en MP ("(50% off referidos)").
async function backfillBase(db, user) {
  let sub;
  try {
    sub = await mp.getSubscription(user.mp_preapproval_id);
  } catch (e) {
    console.error(`[billing-sync] backfill user ${user.id}: no se pudo leer MP (${e.message})`);
    return false;
  }
  const reason = String(sub.reason || '');
  const amt = Number(sub.auto_recurring && sub.auto_recurring.transaction_amount) || 0;
  if (!amt) return false;
  let mult = 1;
  if (reason.includes('50% off')) mult = REFERRAL_DISCOUNT;
  else if (reason.includes('20% off')) mult = FRIEND_DISCOUNT;
  const base = Math.round(amt / mult);
  db.prepare(`UPDATE users SET mp_base_amount = ?, mp_mult = ? WHERE id = ?`).run(base, mult, user.id);
  console.log(`[billing-sync] backfill user ${user.id}: base $${base}, mult ${mult}`);
  return true;
}

async function reconcileUser(db, userId) {
  const u = db.prepare(`SELECT id, plan_status, mp_preapproval_id, mp_base_amount, mp_mult FROM users WHERE id = ?`).get(userId);
  if (!u || u.plan_status !== 'active' || !u.mp_preapproval_id) return { ok: false, reason: 'skip' };
  if (!u.mp_base_amount || u.mp_base_amount <= 0) {
    const ok = await backfillBase(db, u);
    if (!ok) return { ok: false, reason: 'backfill-fail' };
    return reconcileUser(db, userId);
  }
  const want = targetMult(db, userId);
  const have = Number(u.mp_mult) || 1;
  if (want === have) return { ok: true, reason: 'in-sync' };
  // Verificar el estado real en MP antes de tocar plata
  let sub;
  try {
    sub = await mp.getSubscription(u.mp_preapproval_id);
  } catch (e) {
    console.error(`[billing-sync] user ${userId}: no se pudo leer MP (${e.message})`);
    return { ok: false, reason: 'mp-read-fail' };
  }
  if (sub.status !== 'authorized') return { ok: false, reason: 'not-authorized' };
  const newAmount = Math.round(u.mp_base_amount * want);
  try {
    await mp.updateSubscriptionAmount(u.mp_preapproval_id, newAmount);
  } catch (e) {
    console.error(`[billing-sync] user ${userId}: no se pudo actualizar el monto en MP (${e.message})`);
    return { ok: false, reason: 'mp-update-fail' };
  }
  db.prepare(`UPDATE users SET mp_mult = ? WHERE id = ?`).run(want, userId);
  console.log(`[billing-sync] ✅ user ${userId}: mult ${have} → ${want} ($${newAmount}/mes en MP)`);
  return { ok: true, reason: 'updated', from: have, to: want, amount: newAmount };
}

async function reconcileAll(db) {
  if (!mp.mpConfigured()) return;
  const rows = db.prepare(
    `SELECT id FROM users WHERE plan_status = 'active' AND mp_preapproval_id IS NOT NULL AND mp_preapproval_id != ''`
  ).all();
  for (const r of rows) {
    try {
      await reconcileUser(db, r.id);
    } catch (e) {
      console.error(`[billing-sync] user ${r.id}: ${e.message}`);
    }
  }
}

module.exports = { reconcileUser, reconcileAll, targetMult };
