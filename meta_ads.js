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
// La moneda de la cuenta la dice Meta (getAccountCurrency): los
// presupuestos llegan a createBoost ya denominados en esa moneda
// (LOTE MONEDA-CUENTA v976) — este módulo nunca convierte.
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

// (LOTE CONEXIÓN-PÁGINA) ctx = { token, adAccountId }: el riel del
// CLIENTE. Con ctx, las llamadas corren con el SUAT de la conexión
// unificada y sobre la cuenta publicitaria del cliente; sin ctx, el
// riel histórico de Posty (system user + cuenta propia, env).
async function g(path, { method = 'GET', params = {}, ctx = null } = {}) {
  const token = (ctx && ctx.token) || cfg().token;
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

function act(ctx) {
  return `/act_${(ctx && ctx.adAccountId) || cfg().adAccountId}`;
}

// (LOTE MONEDA-CUENTA v976) Moneda REAL de la cuenta publicitaria, leída
// de Meta (GET /act_<id>?fields=currency): la cuenta es la fuente
// autoritativa — el gasto se denomina en ESTA moneda, no en la que el
// código suponía. Caché en memoria de 5 minutos claveada por cuenta (si
// cambia META_AD_ACCOUNT_ID, la caché no aplica): no es una llamada por
// pantalla, pero al impulsar la lectura es fresca o de hace minutos.
// Los fallos NO se cachean: cada impulso reintenta y frena mientras la
// moneda no se pueda confirmar. Devuelve la moneda tal cual la dice
// Meta ('USD', 'ARS', otra) o null si no se pudo leer (sin configurar,
// error de Meta, campo ausente). Qué monedas habilitan el gasto lo
// decide el llamador; acá nunca se asume una.
const CURRENCY_CACHE_TTL_MS = 5 * 60 * 1000;
let _currencyCache = { accountId: '', currency: '', at: 0 };
async function getAccountCurrency(ctx) {
  const adAccountId = (ctx && ctx.adAccountId) || cfg().adAccountId;
  if (!ctx && !adsConfigured()) return null;
  if (ctx && (!ctx.token || !ctx.adAccountId)) return null;
  const now = Date.now();
  if (_currencyCache.accountId === adAccountId && _currencyCache.currency && (now - _currencyCache.at) < CURRENCY_CACHE_TTL_MS) {
    return _currencyCache.currency;
  }
  try {
    const d = await g(act(ctx), { params: { fields: 'currency' }, ctx });
    const cur = d && typeof d.currency === 'string' ? d.currency.trim().toUpperCase() : '';
    if (!cur) return null;
    _currencyCache = { accountId: adAccountId, currency: cur, at: now };
    return cur;
  } catch (e) {
    return null;
  }
}

// ¿Este posteo se puede pautar? (música con copyright, filtros, etc. lo bloquean)
async function checkEligibility(igMediaId, ctx) {
  try {
    const d = await g(`/${igMediaId}`, { params: { fields: 'boost_eligibility_info' }, ctx });
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
// `spendCents` = presupuesto TOTAL en centavos de la moneda de la cuenta
// (el llamador convierte según getAccountCurrency; acá va directo).
async function createBoost({ name, pageId, igUserId, igMediaId, spendCents, days = 7, country = 'AR', ctx = null }) {
  // (LOTE CONEXIÓN-PÁGINA) Con ctx, la pauta corre en la cuenta del
  // CLIENTE con su SUAT: no exige la configuración de Posty y el
  // creativo puede ir sin object_id (la guía oficial de cuentas de IG
  // sin Página usa instagram_user_id + source_instagram_media_id).
  const useCtx = !!(ctx && ctx.token && ctx.adAccountId);
  if (!useCtx && !adsConfigured()) throw new Error('Meta Ads no configurado');
  if (!igUserId || !igMediaId) throw new Error('Faltan datos del negocio para pautar');
  if (!useCtx && !pageId) throw new Error('Faltan datos del negocio para pautar');
  if (!(spendCents > 0)) throw new Error('Presupuesto inválido');
  const gctx = useCtx ? ctx : null;
  const A = act(gctx);

  const elig = await checkEligibility(igMediaId, gctx);
  if (!elig.ok) throw new Error(elig.reason);

  // 1. Campaña (pausada hasta tener todo listo)
  const camp = await g(`${A}/campaigns`, { method: 'POST', ctx: gctx, params: {
    name, objective: 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: [],
  }});

  // 2. Conjunto de anuncios: presupuesto total en `days` días, país del negocio, 18-65+
  const now = Date.now();
  const start = new Date(now + 30 * 60000).toISOString();
  const end = new Date(now + days * 86400000).toISOString();
  const adset = await g(`${A}/adsets`, { method: 'POST', ctx: gctx, params: {
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
  const creativeParams = {
    name: `${name} · creativo`,
    instagram_user_id: String(igUserId),
    source_instagram_media_id: String(igMediaId),
  };
  if (pageId) creativeParams.object_id = pageId;
  const creative = await g(`${A}/adcreatives`, { method: 'POST', ctx: gctx, params: creativeParams });

  // 4. Anuncio activo
  const ad = await g(`${A}/ads`, { method: 'POST', ctx: gctx, params: {
    name, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'ACTIVE',
  }});

  // 5. Encender campaña y conjunto
  await g(`/${camp.id}`, { method: 'POST', ctx: gctx, params: { status: 'ACTIVE' } }).catch(() => {});
  await g(`/${adset.id}`, { method: 'POST', ctx: gctx, params: { status: 'ACTIVE' } }).catch(() => {});

  return { campaignId: camp.id, adsetId: adset.id, adId: ad.id, creativeId: creative.id };
}

// ---------- (LOTE CONEXIÓN-PÁGINA) Login unificado del cliente ----------
// Facebook Login for Business (Instagram API with Unified Login): el
// cliente comparte su IG y su cuenta publicitaria en una sola sentada y
// el canje del code devuelve un SUAT (Business Integration System User
// Access Token) que vive en el portfolio DEL CLIENTE y cubre los
// activos que compartió. Con ese token Posty crea la pauta EN LA
// CUENTA DEL CLIENTE (ads_management = anuncios en las cuentas del
// cliente). Nada de esto usa el token del system user de Posty.

// Canje del code del diálogo (config_id) por el SUAT.
async function exchangeUnifiedCode({ appId, appSecret, code }) {
  if (!appId || !appSecret || !code) throw new Error('Faltan datos para conectar tu cuenta publicitaria');
  const q = new URLSearchParams({ client_id: String(appId), client_secret: String(appSecret), code: String(code) });
  let res;
  try {
    res = await fetch(`${GRAPH}/oauth/access_token?${q.toString()}`, { signal: AbortSignal.timeout(25000) });
  } catch (e) {
    throw new Error('Meta no responde (timeout). Probá de nuevo en unos minutos.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || !data.access_token) {
    const m = (data.error && (data.error.message || data.error.error_user_msg)) || `Meta ${res.status}`;
    throw new Error(`Meta Ads: ${m}`.slice(0, 300));
  }
  return data.access_token;
}

// GET Graph con un token arbitrario (el SUAT del cliente).
async function gToken(path, token, params = {}) {
  const q = new URLSearchParams({ ...params, access_token: token });
  let res;
  try {
    res = await fetch(`${GRAPH}${path}?${q.toString()}`, { signal: AbortSignal.timeout(25000) });
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

// Los activos que el cliente compartió con la app, leídos con su SUAT:
// cuentas publicitarias (me/adaccounts), páginas (me/accounts, con su
// IG vinculado) y el negocio dueño (business de las cuentas; /me da el
// usuario de integración). Las lecturas secundarias fallan suave: sin
// páginas o sin /me, la captura sigue con lo que haya.
async function fetchClientAssets(suat) {
  if (!suat) throw new Error('Falta el token de la conexión publicitaria');
  const [ads, pages, me] = await Promise.all([
    gToken('/me/adaccounts', suat, { fields: 'id,account_id,name,currency,account_status,business', limit: '100' }).catch(() => ({ data: [] })),
    gToken('/me/accounts', suat, { fields: 'id,name,instagram_business_account', limit: '100' }).catch(() => ({ data: [] })),
    gToken('/me', suat, { fields: 'id,name' }).catch(() => ({})),
  ]);
  const adAccounts = (ads.data || []).map(a => ({
    id: String(a.id || ''),
    account_id: String(a.account_id || String(a.id || '').replace(/^act_/, '')),
    name: String(a.name || ''),
    currency: String(a.currency || ''),
    account_status: a.account_status,
    business_id: (a.business && a.business.id) ? String(a.business.id) : '',
  })).filter(a => a.account_id);
  const pageList = (pages.data || []).map(p => ({
    id: String(p.id || ''),
    name: String(p.name || ''),
    ig_user_id: (p.instagram_business_account && p.instagram_business_account.id) ? String(p.instagram_business_account.id) : '',
  })).filter(p => p.id);
  const igSet = new Set(pageList.map(p => p.ig_user_id).filter(Boolean));
  const biz = adAccounts.find(a => a.business_id);
  return {
    businessId: biz ? biz.business_id : '',
    adAccounts,
    pages: pageList,
    igAccountIds: [...igSet],
    suatUserId: (me && me.id) ? String(me.id) : '',
  };
}

// Re-chequeo barato al gastar (riel cliente): la cuenta capturada
// sigue compartida con la app. Misma forma que checkAdsPermission:
// ok:false = no se pudo verificar (el llamador frena, nunca asume).
async function checkClientAdsAccess(suat, adAccountId) {
  if (!suat || !adAccountId) return { ok: false, hasAdsManagement: false, reason: 'sin_conexion' };
  try {
    const d = await gToken('/me/adaccounts', suat, { fields: 'account_id', limit: '100' });
    // (LOTE IMPULSAR-DIRECTO-RE-RIELADO, composición) La captura guarda
    // el id pelado (account_id), pero la comparación normaliza igual:
    // así el chequeo vale también si alguna fila quedó con el id
    // crudo «act_…» de /me/adaccounts.
    const bare = String(adAccountId || '').replace(/^act_/, '');
    const has = (d.data || []).some(a => String(a.account_id) === bare || String(a.id) === `act_${bare}`);
    return { ok: true, hasAdsManagement: has, reason: has ? '' : 'cuenta_no_compartida' };
  } catch (e) {
    return { ok: false, hasAdsManagement: false, reason: 'verificacion_fallida' };
  }
}

// resolvePageId con un token arbitrario (el SUAT, para la captura y
// para el estudio de marca cuando la página vino de la conexión).
async function resolvePageIdWithToken(igUserId, token) {
  const d = await gToken('/me/accounts', token, { fields: 'id,name,instagram_business_account', limit: '100' });
  const hit = (d.data || []).find(p => p.instagram_business_account && String(p.instagram_business_account.id) === String(igUserId));
  if (!hit) throw new Error('No encontramos la Página de Facebook vinculada a tu Instagram.');
  return hit.id;
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

// ¿El token de Meta trae ads_management? (permiso de App Review).
// Sin él, crear anuncios falla en Meta DESPUÉS de cobrar: por eso se
// verifica ANTES de cualquier cobro. Devuelve { ok, hasAdsManagement }.
// ok:false = no se pudo verificar (Meta caído o sin configurar): el
// llamador falla cerrado, nunca asume el permiso.
async function checkAdsPermission() {
  if (!adsConfigured()) return { ok: false, hasAdsManagement: false, reason: 'no_configurado' };
  try {
    const d = await g('/me/permissions');
    const perms = (d.data || []).filter((p) => p && p.status === 'granted').map((p) => p.permission);
    return { ok: true, hasAdsManagement: perms.includes('ads_management'), permissions: perms };
  } catch (e) {
    return { ok: false, hasAdsManagement: false, reason: 'verificacion_fallida' };
  }
}

module.exports = { adsConfigured, checkAdsPermission, checkEligibility, resolvePageId, createBoost, getBoostStats, getAccountCurrency, exchangeUnifiedCode, fetchClientAssets, checkClientAdsAccess, resolvePageIdWithToken };
