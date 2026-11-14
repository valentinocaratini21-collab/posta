'use strict';
// ads-fee.js — Fee de gestión de Posty (10%) sobre la pauta de Impulsar,
// cobrado APARTE de la pauta y SOLO cuando la campaña quedó corriendo.
//
// (LOTE FEE-IMPULSAR · decisión de Valentino 2026-11-13) El modelo de
// gasto cambió: la pauta corre desde la cuenta publicitaria DEL CLIENTE
// y Meta le cobra directo a él. Posty cobra su gestión por su propio
// carril — el 10% del monto de pauta, con la tarjeta que el cliente ya
// tiene guardada de la suscripción (Stripe, off-session, sin paso
// extra) — en el acto en que la campaña queda creada Y corriendo. El
// total se muestra antes del toque, desglosado (ver desgloseFee: pauta
// $50 → fee $5 → total $55).
//
// REGLA DURA (fail-closed, la misma de Impulsar y de ADS-HARDENING): si
// Meta falla y el anuncio no se crea o no queda corriendo, NO se cobra
// el fee. «Corriendo de verdad» = el criterio de
// meta_ads.verificarActivos (lote ADS-HARDENING-ACTIVACION): campaña y
// conjunto leídos en Meta con status ACTIVE; una lectura sin dato
// (null) NUNCA cuenta como corriendo. Este módulo ESPEJA ese criterio
// (esCorriendoVerificada + verificarCorriendo con su relectura) porque
// verificarActivos todavía no está en el vivo y porque el riel nuevo
// lee los estados con el token del cliente, no con el de Posty.
//
// LA COSTURA — cobrarFeeCampanaCorriendo(db, deps, evento):
//   El riel de campañas la llama UNA vez por campaña, en el punto
//   exacto en que la activación quedó verificada, con:
//     evento = { userId, campaignId, adsetId, postId?, pautaCents,
//                moneda: 'USD', campanaRef?, estados? }
//     deps   = { client?, leerEstados?, senalEquipo? }
//   · client: cliente Stripe (en producción, stripe-billing.stripeClient()).
//   · leerEstados(campaignId, adsetId) → { campaign, adset }: lector de
//     estados del riel (el de Posty por defecto; el riel del cliente
//     inyecta el suyo, que lee con el token del cliente). Si el evento
//     ya trae `estados`, la costura los re-valida con el mismo criterio
//     (nunca cobra con un «corriendo» declarado sin pasar el criterio).
//   · senalEquipo(info): aviso al equipo cuando un fee queda pendiente.
//
// IDEMPOTENCIA — un fee por campaña, nunca dos:
//   · ad_fees.campana_ref es UNIQUE: un fee 'cobrado' no se re-cobra
//     (el re-disparo del trigger devuelve yaCobrado sin tocar Stripe).
//   · La clave de idempotencia de Stripe es campaña + tarjeta: un
//     reintento con la misma tarjeta devuelve el mismo PaymentIntent.
//
// FALLO DESPUÉS DE CORRER: si la campaña corre pero el cobro falla (o
// no hay medio guardado), queda el registro auditable en ad_fees con
// estado 'pendiente_fallo' / 'sin_medio' + la señal al equipo. La
// POLÍTICA sobre esa campaña (pausarla o dejarla seguir) NO se decide
// en este módulo: es un punto abierto para Valentino (ver el STATUS
// del lote). Este módulo jamás pausa ni toca la campaña.
//
// SIN BILLETERA: el modelo «billetera de Posty» quedó descartado por la
// decisión — acá no se lee ni se escribe ninguna billetera.

const destacadoCobro = require('./destacado-cobro');

const FEE_PCT = 10;
const GRAPH = 'https://graph.facebook.com/v26.0';

// ---------- Desglose para la tarjeta (puro y determinista) ----------
// fee = 10% del monto de pauta, redondeado al centavo. Para los montos
// vigentes es exacto: $20 → $2 · $50 → $5 · $100 → $10. Devuelve null
// si el monto no es un entero positivo de centavos.
function desgloseFee(pautaCents) {
  const p = Number(pautaCents);
  if (!Number.isInteger(p) || p <= 0) return null;
  const feeCents = Math.round(p * FEE_PCT / 100);
  return { pautaCents: p, feeCents, totalCents: p + feeCents, feePct: FEE_PCT };
}
// Los tres montos vigentes de la tarjeta, ya desglosados (la UI los
// muestra ANTES del toque: pauta + gestión = total).
const DESGLOSE_MONTOS_USD = [2000, 5000, 10000].map(desgloseFee);

// ---------- Criterio «corriendo» (espejo de verificarActivos) ----------
// verificarActivos (ADS-HARDENING) devuelve los status leídos de
// campaña y conjunto, con null cuando una lectura falla — y el boost
// solo se da por lanzado si AMBOS son 'ACTIVE'. Mismo criterio acá.
function esCorriendoVerificada(estados) {
  return !!(estados && estados.campaign === 'ACTIVE' && estados.adset === 'ACTIVE');
}
// Lee los estados con el lector del riel; si no dan corriendo, espera
// 1200 ms y relee UNA vez (Meta a veces tarda en reflejar el encendido:
// el mismo reintento de lectura del paso 5 de createBoost endurecido).
// El lector tiene la forma de verificarActivos: leerEstados(campaignId,
// adsetId) → { campaign, adset } con null en lo que no se pudo leer; un
// lector que lanza equivale a «sin dato» en ambos, nunca a corriendo.
async function verificarCorriendo(leerEstados, campaignId, adsetId) {
  const leer = async () => {
    try {
      const e = await leerEstados(campaignId, adsetId);
      return { campaign: (e && e.campaign) || null, adset: (e && e.adset) || null };
    } catch (e) { return { campaign: null, adset: null }; }
  };
  let estados = await leer();
  if (!esCorriendoVerificada(estados)) {
    await new Promise((r) => setTimeout(r, 1200));
    estados = await leer();
  }
  return estados;
}
// Lector por defecto: la Graph API con el token de Meta del entorno
// (el mismo de meta_ads: META_ADS_TOKEN). Lee SOLO el status, como
// verificarActivos; cualquier fallo devuelve null. El riel sobre la
// cuenta del cliente inyecta su propio lector vía deps.leerEstados.
function crearLectorEstadosGraph(token) {
  const tok = String(token || process.env.META_ADS_TOKEN || '').trim();
  return async (id) => {
    if (!tok || !id) return null;
    try {
      const url = `${GRAPH}/${encodeURIComponent(id)}?fields=status&access_token=${encodeURIComponent(tok)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data && data.error)) return null;
      return (data && data.status) || null;
    } catch (e) { return null; }
  };
}
// Normaliza el lector: la costura acepta leerEstados(campaignId,
// adsetId) → {campaign, adset} (forma verificarActivos) o, si no viene
// ninguno, crea el lector por-id de Graph y lo adapta.
function resolverLeerEstados(deps) {
  if (deps && typeof deps.leerEstados === 'function') return deps.leerEstados;
  const porId = crearLectorEstadosGraph(deps && deps.metaToken);
  return async (campaignId, adsetId) => {
    const [campaign, adset] = await Promise.all([porId(campaignId), porId(adsetId)]);
    return { campaign, adset };
  };
}

// ---------- Persistencia auditable (ad_fees) ----------
// El mismo DDL vive en db.js (la casa canónica del esquema); este
// CREATE IF NOT EXISTS hace al módulo autocontenido para el riel que
// lo consuma y para los tests, sin tocar el orden de db.js.
const DDL_AD_FEES = `CREATE TABLE IF NOT EXISTS ad_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campana_ref TEXT NOT NULL UNIQUE,
  campaign_id TEXT NOT NULL DEFAULT '',
  adset_id TEXT NOT NULL DEFAULT '',
  post_id INTEGER,
  pauta_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  moneda TEXT NOT NULL DEFAULT 'USD',
  estado TEXT NOT NULL DEFAULT 'pendiente_fallo',
  stripe_payment_intent TEXT NOT NULL DEFAULT '',
  stripe_customer TEXT NOT NULL DEFAULT '',
  intentos INTEGER NOT NULL DEFAULT 0,
  detalle TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;
function ensureFeeSchema(db) {
  db.exec(DDL_AD_FEES);
}
// Registra (o actualiza) el fee de una campaña. Devuelve la fila.
function guardarFee(db, f) {
  const prev = db.prepare('SELECT * FROM ad_fees WHERE campana_ref = ?').get(f.campanaRef);
  if (prev) {
    db.prepare(`UPDATE ad_fees SET campaign_id=?, adset_id=?, post_id=?, pauta_cents=?, fee_cents=?,
      moneda=?, estado=?, stripe_payment_intent=?, stripe_customer=?, intentos=?, detalle=?,
      updated_at=datetime('now') WHERE campana_ref=?`)
      .run(f.campaignId || '', f.adsetId || '', (f.postId == null ? null : f.postId), f.pautaCents, f.feeCents,
        f.moneda || 'USD', f.estado, f.stripePaymentIntent || '', f.stripeCustomer || '',
        f.intentos, String(f.detalle || '').slice(0, 300), f.campanaRef);
  } else {
    db.prepare(`INSERT INTO ad_fees (user_id, campana_ref, campaign_id, adset_id, post_id, pauta_cents,
      fee_cents, moneda, estado, stripe_payment_intent, stripe_customer, intentos, detalle)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(f.userId, f.campanaRef, f.campaignId || '', f.adsetId || '', (f.postId == null ? null : f.postId),
        f.pautaCents, f.feeCents, f.moneda || 'USD', f.estado, f.stripePaymentIntent || '',
        f.stripeCustomer || '', f.intentos, String(f.detalle || '').slice(0, 300));
  }
  return db.prepare('SELECT * FROM ad_fees WHERE campana_ref = ?').get(f.campanaRef);
}
// Fees que el equipo tiene que mirar: cobros que no salieron con la
// campaña ya corriendo. (La política sobre esos casos es de Valentino;
// esto es solo la lista auditable.)
function feesPendientes(db, limit = 50) {
  ensureFeeSchema(db);
  return db.prepare(`SELECT * FROM ad_fees WHERE estado IN ('pendiente_fallo','sin_medio')
    ORDER BY id DESC LIMIT ?`).all(Math.max(1, Math.min(500, Number(limit) || 50)));
}

// ---------- LA COSTURA ----------
// cobrarFeeCampanaCorriendo(db, deps, evento)
//   → { ok: true, cobrado: true, feeCents, cobroId, yaCobrado? }
//   → { ok: false, cobrado: false, motivo, pendiente?, estados? }
// Nunca lanza: todo fallo vuelve como motivo (patrón de la casa).
async function cobrarFeeCampanaCorriendo(db, deps = {}, ev = {}) {
  const userId = Number(ev.userId) || 0;
  const campaignId = String(ev.campaignId || '');
  const adsetId = String(ev.adsetId || '');
  const campanaRef = String(ev.campanaRef || (campaignId ? `meta:${campaignId}` : ''));
  const senal = (info) => {
    try {
      if (deps && typeof deps.senalEquipo === 'function') deps.senalEquipo(info);
      else console.error('[fee-impulso] fee pendiente:', JSON.stringify(info));
    } catch (e) { /* la señal nunca rompe el flujo */ }
  };
  try {
    ensureFeeSchema(db);
    if (!userId) return { ok: false, cobrado: false, motivo: 'sin_usuario' };
    if (!campaignId || !campanaRef) return { ok: false, cobrado: false, motivo: 'sin_campana' };
    // El fee de la decisión es sobre la pauta en USD (los montos de la
    // tarjeta). Otra moneda no se convierte ni se cobra «más o menos»:
    // se frena cerrado, como manda la regla de moneda de la casa.
    if (ev.moneda && String(ev.moneda).toUpperCase() !== 'USD') {
      return { ok: false, cobrado: false, motivo: 'moneda_no_usd' };
    }
    const desg = desgloseFee(ev.pautaCents);
    if (!desg || desg.feeCents <= 0) return { ok: false, cobrado: false, motivo: 'monto_invalido' };

    // 1) LA CAMPAÑA TIENE QUE ESTAR CORRIENDO DE VERDAD. Si el evento
    // trae estados que ya pasan el criterio, corren; si no, se leen en
    // Meta con el lector del riel (verificarCorriendo: relectura
    // incluida). Sin verificación positiva NO hay cobro — ni fila: un
    // fee sobre una campaña que no corre no es un fee pendiente, es un
    // no-evento (el riel tiene sus propios registros de ese caso).
    let estados = (ev.estados && esCorriendoVerificada(ev.estados)) ? ev.estados : null;
    if (!estados) {
      estados = await verificarCorriendo(resolverLeerEstados(deps), campaignId, adsetId);
      if (!esCorriendoVerificada(estados)) {
        return { ok: false, cobrado: false, motivo: 'campana_no_verificada', estados };
      }
    }

    // 2) IDEMPOTENCIA: si esta campaña ya pagó su fee, no se toca nada.
    const prev = db.prepare('SELECT * FROM ad_fees WHERE campana_ref = ?').get(campanaRef);
    if (prev && prev.estado === 'cobrado') {
      return { ok: true, cobrado: true, yaCobrado: true, feeCents: prev.fee_cents, cobroId: prev.stripe_payment_intent || '' };
    }
    const intentos = (prev ? Number(prev.intentos) || 0 : 0) + 1;
    const base = {
      userId, campanaRef, campaignId, adsetId, postId: (ev.postId == null ? null : Number(ev.postId) || null),
      pautaCents: desg.pautaCents, feeCents: desg.feeCents, moneda: 'USD', intentos,
      stripePaymentIntent: (prev && prev.stripe_payment_intent) || '',
      stripeCustomer: (prev && prev.stripe_customer) || '',
    };

    // 3) EL MEDIO GUARDADO DEL CLIENTE (el de la suscripción: el
    // customer de Stripe del usuario y su tarjeta por defecto / más
    // reciente — la misma resolución del cobro off-session de la casa,
    // destacadoCobro.resolverTarjetaGuardada).
    const user = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(userId);
    if (!user) return { ok: false, cobrado: false, motivo: 'usuario_no_encontrado' };
    const customerId = String(user.stripe_customer_id || '');
    const client = deps.client || (() => { try { return require('./stripe-billing').stripeClient(); } catch (e) { return null; } })();
    if (!client) {
      guardarFee(db, { ...base, estado: 'pendiente_fallo', detalle: 'stripe_no_configurado' });
      senal({ userId, campanaRef, campaignId, estado: 'pendiente_fallo', motivo: 'stripe_no_configurado', feeCents: desg.feeCents });
      return { ok: false, cobrado: false, motivo: 'stripe_no_configurado', pendiente: true };
    }
    if (!customerId) {
      guardarFee(db, { ...base, estado: 'sin_medio', detalle: 'sin_cliente_stripe' });
      senal({ userId, campanaRef, campaignId, estado: 'sin_medio', motivo: 'sin_cliente_stripe', feeCents: desg.feeCents });
      return { ok: false, cobrado: false, motivo: 'sin_medio', pendiente: true };
    }
    base.stripeCustomer = customerId;
    const resolverTarjeta = (deps && typeof deps.resolverTarjeta === 'function')
      ? deps.resolverTarjeta : destacadoCobro.resolverTarjetaGuardada;
    const pmId = await resolverTarjeta(client, customerId).catch(() => null);
    if (!pmId) {
      guardarFee(db, { ...base, estado: 'sin_medio', detalle: 'sin_tarjeta_guardada' });
      senal({ userId, campanaRef, campaignId, estado: 'sin_medio', motivo: 'sin_tarjeta_guardada', feeCents: desg.feeCents });
      return { ok: false, cobrado: false, motivo: 'sin_medio', pendiente: true };
    }

    // 4) EL COBRO. Antes de llamar a Stripe queda asentado el intento
    // (auditable aunque el proceso muera a mitad de camino); la clave
    // de idempotencia campaña+tarjeta hace que el reintento devuelva
    // el mismo PaymentIntent en vez de duplicar el cargo.
    guardarFee(db, { ...base, estado: 'pendiente_fallo', detalle: 'cobro_en_curso' });
    let pi = null;
    try {
      pi = await client.paymentIntents.create({
        amount: desg.feeCents,
        currency: 'usd',
        customer: customerId,
        payment_method: pmId,
        off_session: true,
        confirm: true,
        description: `Posty · Gestión de pauta (10%) · campaña ${campaignId}`,
        metadata: { app: 'posty', tipo: 'fee_impulso', campana_ref: campanaRef, user_id: String(userId), pauta_cents: String(desg.pautaCents) },
      }, { idempotencyKey: ['feeimpulso', campanaRef, String(pmId)].join(':') });
    } catch (e) {
      const detalle = String((e && e.message) || e).slice(0, 200);
      guardarFee(db, { ...base, estado: 'pendiente_fallo', detalle: `cobro_fallido: ${detalle}` });
      senal({ userId, campanaRef, campaignId, estado: 'pendiente_fallo', motivo: 'cobro_fallido', feeCents: desg.feeCents });
      return { ok: false, cobrado: false, motivo: 'cobro_fallido', pendiente: true, detalle };
    }
    if (pi && pi.id && pi.status === 'succeeded') {
      guardarFee(db, { ...base, estado: 'cobrado', stripePaymentIntent: String(pi.id), detalle: '' });
      return { ok: true, cobrado: true, feeCents: desg.feeCents, cobroId: String(pi.id) };
    }
    const piStatus = (pi && pi.status) || '';
    const motivo = (piStatus === 'requires_action' || piStatus === 'requires_payment_method' || piStatus === 'requires_confirmation')
      ? 'cobro_requiere_accion' : 'cobro_no_confirmado';
    guardarFee(db, { ...base, estado: 'pendiente_fallo', stripePaymentIntent: (pi && pi.id) ? String(pi.id) : '', detalle: `${motivo}: ${piStatus || 'sin_estado'}` });
    senal({ userId, campanaRef, campaignId, estado: 'pendiente_fallo', motivo, feeCents: desg.feeCents });
    return { ok: false, cobrado: false, motivo, pendiente: true, piStatus: piStatus || null };
  } catch (e) {
    console.error('[fee-impulso] error inesperado:', (e && e.message) || e);
    return { ok: false, cobrado: false, motivo: 'error_inesperado', detalle: String((e && e.message) || e).slice(0, 200) };
  }
}

module.exports = {
  FEE_PCT, desgloseFee, DESGLOSE_MONTOS_USD,
  esCorriendoVerificada, verificarCorriendo, crearLectorEstadosGraph,
  ensureFeeSchema, feesPendientes, cobrarFeeCampanaCorriendo,
};
