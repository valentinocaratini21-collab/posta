// Meta Marketing API — crear pautas (boost) desde posteos existentes de Instagram.
// Flujo oficial "Use Posts as Instagram Ads":
//   1. Elegibilidad: GET /{ig_media_id}?fields=boost_eligibility_info
//   2. Campaña: POST /act_{ad_account}/campaigns (objective OUTCOME_ENGAGEMENT)
//   3. Conjunto: POST /act_{ad_account}/adsets (lifetime_budget, POST_ENGAGEMENT)
//   4. Creativo: POST /act_{ad_account}/adcreatives (source_instagram_media_id)
//   5. Anuncio: POST /act_{ad_account}/ads (creative_id + adset_id, ACTIVE)
// Métricas: GET /act_{ad_account}/insights filtrando por campaña.
//
// Env vars:
//   META_ADS_TOKEN      — system user token con ads_management + ads_read
//   META_AD_ACCOUNT_ID  — cuenta publicitaria de Posta, SIN el prefijo "act_"
// La cuenta publicitaria opera en ARS: los presupuestos en centavos van directo.
//
// Si no está configurado, adsConfigured() = false y NUNCA rompe: los boosts
// quedan en 'pending' para activación manual del equipo.

const API_VERSION = 'v26.0';
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

function cfg() {
  return {
    token: (process.env.META_ADS_TOKEN || '').trim(),
    adAccountId: (process.env.META_AD_ACCOUNT_ID || '').trim(),
  };
}

function adsConfigured() {
  const c = cfg();
  return c.token.length > 10 && c.adAccountId.length > 3;
}

async function g(path, { method = 'GET', params = {} } = {}) {
  const { token } = cfg();
  if (!token) throw new Error('Meta Ads no configurado');
  let url = `${GRAPH}${path}`;
  let body;
  if (method === 'GET') {
    const q = new URLSearchParams({ ...params, access_token: token });
    url += (url.includes('?') ? '&' : '?') + q.toString();
  } else {
    body = JSON.stringify({ ...params, access_token: token });
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    throw new Error('Meta no responde (timeout). Probá de nuevo en unos minutos.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const m = (data.error && (data.error.message || data.error.error_user_msg)) || `Meta ${res.status}`;
    throw new Error(`Meta Ads: ${m}`.slice(0, 300));
  }
  return data;
}

function act() {
  return `/act_${cfg().adAccountId}`;
}

// ¿Este posteo se puede pautar? (música con copyright, filtros, etc. lo bloquean)
async function checkEligibility(igMediaId) {
  try {
    const d = await g(`/${igMediaId}`, { params: { fields: 'boost_eligibility_info' } });
    const info = d.boost_eligibility_info;
    if (!info) return { ok: true }; // sin dato: intentar igual
    if (info.eligible === false) {
      return { ok: false, reason: (info.reasons && info.reasons[0]) || 'Este posteo no se puede promocionar' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: true }; // no bloquear por un chequeo
  }
}

// Resuelve la Página de Facebook vinculada al IG del cliente.
// Busca entre las páginas accesibles con el token cuál tiene ese instagram_business_account.
async function resolvePageId(igUserId) {
  const d = await g('/me/accounts', { params: { fields: 'id,name,instagram_business_account', limit: '100' } });
  const pages = (d.data || []);
  const hit = pages.find(p => p.instagram_business_account && String(p.instagram_business_account.id) === String(igUserId));
  if (!hit) throw new Error('No encontramos la Página de Facebook vinculada a tu Instagram. Escribinos y lo conectamos.');
  return hit.id;
}

// Crea campaña + conjunto + creativo + anuncio. Devuelve los ids de Meta.
async function createBoost({ name, pageId, igUserId, igMediaId, spendCents, days = 7, country = 'AR' }) {
  if (!adsConfigured()) throw new Error('Meta Ads no configurado');
  if (!pageId || !igUserId || !igMediaId) throw new Error('Faltan datos del negocio para pautar');
  if (!(spendCents > 0)) throw new Error('Presupuesto inválido');

  const elig = await checkEligibility(igMediaId);
  if (!elig.ok) throw new Error(elig.reason);

  // 1. Campaña (pausada hasta tener todo listo)
  const camp = await g(`${act()}/campaigns`, { method: 'POST', params: {
    name, objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: [],
  }});

  // 2. Conjunto de anuncios: presupuesto total en `days` días, país del negocio, 18-65+
  const now = Date.now();
  const start = new Date(now + 30 * 60000).toISOString();
  const end = new Date(now + days * 86400000).toISOString();
  const adset = await g(`${act()}/adsets`, { method: 'POST', params: {
    name: `${name} · conjunto`,
    campaign_id: camp.id,
    lifetime_budget: Math.round(spendCents),
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'POST_ENGAGEMENT',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: { geo_locations: { countries: [country] }, age_min: 18, age_max: 65 },
    start_time: start, end_time: end, status: 'PAUSED',
  }});

  // 3. Creativo desde el posteo existente (doc: "Use Posts as Instagram Ads")
  const creative = await g(`${act()}/adcreatives`, { method: 'POST', params: {
    name: `${name} · creativo`,
    object_id: pageId,
    instagram_user_id: String(igUserId),
    source_instagram_media_id: String(igMediaId),
  }});

  // 4. Anuncio activo
  const ad = await g(`${act()}/ads`, { method: 'POST', params: {
    name, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'ACTIVE',
  }});

  // 5. Encender campaña y conjunto
  await g(`/${camp.id}`, { method: 'POST', params: { status: 'ACTIVE' } }).catch(() => {});
  await g(`/${adset.id}`, { method: 'POST', params: { status: 'ACTIVE' } }).catch(() => {});

  return { campaignId: camp.id, adsetId: adset.id, adId: ad.id, creativeId: creative.id };
}

// Métricas de una campaña: gasto, alcance, impresiones, clics.
async function getBoostStats(campaignId) {
  if (!adsConfigured() || !campaignId) return null;
  // El endpoint de insights usa query params; se arma manual:
  const q = new URLSearchParams({
    fields: 'spend,reach,impressions,clicks',
    'filtering[0][field]': 'campaign.id',
    'filtering[0][operator]': 'IN',
    'filtering[0][value]': JSON.stringify([String(campaignId)]),
    access_token: cfg().token,
  });
  const res = await fetch(`${GRAPH}${act()}/insights?${q.toString()}`, { signal: AbortSignal.timeout(25000) });
  const data = await res.json().catch(() => ({}));
  const row = data && data.data && data.data[0];
  if (!row) return null;
  return {
    spend_cents: Math.round(Number(row.spend || 0) * 100),
    reach: Number(row.reach || 0),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
  };
}

module.exports = { adsConfigured, checkEligibility, resolvePageId, createBoost, getBoostStats };
