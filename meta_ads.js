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
    const err = new Error(`Meta Ads: ${m}`.slice(0, 300));
    // (LOTE ADS-CREACIÓN) El error NUNCA se aplana: el detalle entero
    // de Meta viaja adjunto (código, subcódigo, mensajes de usuario,
    // error_data y fbtrace_id) para que el registro del impulso lo
    // guarde completo. Hasta este lote solo sobrevivía e.message
    // («Invalid parameter») y un rechazo real era indiagnosticable:
    // el paso y el subcódigo se perdían acá.
    if (data.error) {
      err.metaError = {
        code: data.error.code != null ? data.error.code : null,
        type: data.error.type || null,
        subcode: data.error.error_subcode != null ? data.error.error_subcode : null,
        message: String(m),
        user_title: data.error.error_user_title || null,
        user_msg: data.error.error_user_msg || null,
        error_data: data.error.error_data || null,
        fbtrace_id: data.error.fbtrace_id || null,
        http_status: res.status,
      };
    }
    throw err;
  }
  return data;
}

// (LOTE ADS-CREACIÓN) El detalle de un error de Meta como UNA línea
// para el registro del impulso (la fila 'error' de ad_boosts): paso
// donde falló la creación + código + subcódigo + mensaje completo +
// fbtrace_id. Es texto para el EQUIPO, nunca para el cliente (la
// respuesta al cliente sigue genérica). Sin metaError adjunto cae al
// mensaje del error, como antes.
function detalleErrorMeta(e) {
  if (!e) return 'Meta no devolvió detalle del error';
  const m = e.metaError || null;
  const partes = [];
  const paso = e.paso || (m && m.paso) || '';
  if (paso) partes.push(`paso ${paso}`);
  if (m) {
    if (m.code != null) partes.push(`code ${m.code}`);
    if (m.subcode != null) partes.push(`subcode ${m.subcode}`);
    partes.push(String(m.message || e.message || ''));
    if (m.user_msg && m.user_msg !== m.message) partes.push(`usuario: ${m.user_msg}`);
    if (m.fbtrace_id) partes.push(`fbtrace ${m.fbtrace_id}`);
  } else {
    partes.push(String(e.message || e));
  }
  return partes.join(' · ').slice(0, 1200);
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

// (LOTE ADS-CREACIÓN-3) Resolución del instagram_user_id del creativo
// CONTRA LA PROPIA CUENTA, en el momento de crear. El parámetro
// igUserId que el llamador pasa a createBoost sale de
// settings.ig_user_id: el id que guardó el callback de conexión de
// Instagram (Instagram Login, graph.instagram.com) para PUBLICAR.
// Ese id NO es válido en el espacio de nombres de la Marketing API
// (graph.facebook.com): el intento 7 del dueño (17/11, tras v1160 —
// la campaña y el conjunto ya pasaban) murió en el paso creativo con
// «(#100) Param instagram_user_id must be a valid Instagram account
// id». El id que Meta valida acá es el de la cuenta de Instagram
// profesional EN SU grafo: el que la Página expone como
// instagram_business_account.id (el mismo campo que resolvePageId y
// fetchClientAssets ya leen) y el que el medio expone como owner.id.
// La fila ig_ads_connections incluso capturó esos ids al conectar
// (ig_account_ids) — pero ningún llamador los usaba para el creativo.
// Regla: se resuelve SIEMPRE contra la cuenta del riel (su token,
// su Página, su medio) y viaja el id resuelto; el id guardado de
// settings no viaja nunca más, ni como respaldo. Si hay varias
// candidatas manda la DUEÑA DEL MEDIO; si la dueña leída contradice
// a la IG de la Página, el par (object_id + medio) es inválido de
// forma demostrable y se frena; si ninguna candidata puede leerse,
// se frena ANTES del paso creativo con el motivo registrado (paso
// 'creativo') — jamás se manda un id a ciegas. Las lecturas fallan
// suave por separado (null = no legible) y la decisión es entera
// de esta función.
async function resolverIgUserIdBoost({ pageId, igMediaId, ctx = null }) {
  const leerDueno = async () => {
    try {
      const d = await g(`/${igMediaId}`, { params: { fields: 'owner{id,username}' }, ctx });
      const o = d && d.owner;
      return (o && o.id) ? { id: String(o.id), username: String(o.username || '') } : null;
    } catch (e) { return null; }
  };
  const leerPagina = async () => {
    if (!pageId) return null;
    try {
      const d = await g(`/${pageId}`, { params: { fields: 'instagram_business_account{id,username}' }, ctx });
      const iba = d && d.instagram_business_account;
      return (iba && iba.id) ? { id: String(iba.id), username: String(iba.username || '') } : null;
    } catch (e) { return null; }
  };
  const [dueno, pagina] = await Promise.all([leerDueno(), leerPagina()]);
  const nom = (x) => x.username ? `@${x.username} (${x.id})` : x.id;
  if (dueno && pagina && dueno.id !== pagina.id) {
    const err = new Error(`La cuenta de Instagram dueña del posteo (${nom(dueno)}) no es la vinculada a la Página del anuncio (${nom(pagina)}): el impulso se frenó antes de crear el aviso. Revisá que el posteo sea de la cuenta conectada.`);
    err.code = 'ig_conflicto';
    err.paso = 'creativo';
    throw err;
  }
  if (dueno) return { id: dueno.id, fuente: 'dueno_medio' };
  if (pagina) return { id: pagina.id, fuente: 'pagina' };
  const err = new Error(`No se pudo verificar la cuenta de Instagram dueña del posteo ${igMediaId} en la cuenta publicitaria (ni el dueño del medio ni la Instagram de la Página pudieron leerse): el impulso se frenó antes de crear el aviso, sin mandar ningún id sin verificar.`);
  err.code = 'ig_no_resuelto';
  err.paso = 'creativo';
  throw err;
}

// Lee el estado real de campaña y conjunto en Meta (fuente de verdad
// tras el encendido), con el token del riel que corre (el del entorno o
// el SUAT del cliente vía ctx). Si una lectura falla, ese estado queda
// null — nunca se asume ACTIVE sin haberlo leído.
async function verificarActivos(campaignId, adsetId, ctx = null) {
  const leer = async (id) => {
    try {
      const d = await g(`/${id}`, { params: { fields: 'status' }, ctx });
      return (d && d.status) || null;
    } catch (e) { return null; }
  };
  const [campaign, adset] = await Promise.all([leer(campaignId), leer(adsetId)]);
  return { campaign, adset };
}

// Crea campaña + conjunto + creativo + anuncio. Devuelve los ids de Meta.
// `spendCents` = presupuesto TOTAL en centavos de la moneda de la cuenta
// (el llamador convierte según getAccountCurrency; acá va directo).
// (LOTE ADS-ESTRATÉGICOS) Parámetros opcionales de estrategia, con los
// defaults EXACTOS del comportamiento histórico: sin ellos, la llamada
// es idéntica a la de siempre (OUTCOME_ENGAGEMENT + POST_ENGAGEMENT +
// país 18-65). `targeting` completo reemplaza al targeting por país;
// `destinationType` (p. ej. INSTAGRAM_DIRECT) solo se envía si viene.
// (Composición sobre v1048: el parámetro `ctx` del riel del cliente
// se conserva intacto, al final de los históricos.)
// Si la activación NO deja campaña y conjunto en ACTIVE, createBoost
// LANZA el error (code 'activacion_fallida', con los ids): el llamador
// NO debe cobrar por un anuncio que quedó pausado.
async function createBoost({ name, pageId, igUserId, igMediaId, spendCents, days = 7, country = 'AR', ctx = null, objective = 'OUTCOME_ENGAGEMENT', optimizationGoal = 'POST_ENGAGEMENT', destinationType = null, targeting = null }) {
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

  // (LOTE ADS-CREACIÓN) Cada paso etiqueta su error: el registro del
  // impulso guarda en qué paso rechazó Meta (con el subcódigo que
  // viaja en e.metaError), no un «Invalid parameter» huérfano.
  const pasoBoost = async (paso, fn) => {
    try { return await fn(); } catch (e) {
      if (e && typeof e === 'object' && !e.paso) e.paso = paso;
      throw e;
    }
  };

  // 1. Campaña (pausada hasta tener todo listo)
  // (LOTE ADS-CREACIÓN-2) El presupuesto vive en el CONJUNTO
  // (lifetime_budget, paso 2), nunca en la campaña: sin presupuesto
  // de campaña, Meta exige declarar is_adset_budget_sharing_enabled
  // en el cuerpo de la campaña — sin el campo rechazó la creación
  // del dueño (17/11, paso campaña · code 100 · subcode 4834011).
  // false = los conjuntos no comparten presupuesto entre sí: el
  // comportamiento de un impulso simple de un solo conjunto.
  const camp = await pasoBoost('campaña', () => g(`${A}/campaigns`, { method: 'POST', ctx: gctx, params: {
    name, objective: objective || 'OUTCOME_ENGAGEMENT', status: 'PAUSED', special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  }}));

  // 2. Conjunto de anuncios: presupuesto total en `days` días. Sin
  // targeting explícito: país del negocio, 18-65+ (como siempre).
  const now = Date.now();
  const start = new Date(now + 30 * 60000).toISOString();
  const end = new Date(now + days * 86400000).toISOString();
  // (LOTE ADS-CREACIÓN-2) targeting_automation.advantage_audience
  // declarado SIEMPRE, en una copia (el targeting del llamador no se
  // muta): desde v23.0 la creación de un conjunto con segmentación
  // no-default — edades explícitas del estudio + intereses y/o
  // audiencias, sin relajación — ERRORA si el flag no viene
  // explícito (ADS_TARGETING__REQUIRE_EXPLICIT_ADVANTAGE_AUDIENCE_
  // FLAG); es la misma clase de error que el de la campaña. Vale 0:
  // el público estudiado que el cliente confirmó manda como
  // restricción. Con 1, las edades e intereses pasan a ser «señales»
  // que Meta puede expandir y las edades duras fuera de 18–25 con
  // techo 65 revientan — contradice el diseño. Si el targeting ya
  // lo declara, se respeta su valor.
  const targetingIn = targeting || { geo_locations: { countries: [country] }, age_min: 18, age_max: 65 };
  const targetingFinal = {
    ...targetingIn,
    targeting_automation: { advantage_audience: 0, ...((targetingIn && targetingIn.targeting_automation) || {}) },
  };
  const adsetParams = {
    name: `${name} · conjunto`,
    campaign_id: camp.id,
    lifetime_budget: Math.round(spendCents),
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoal || 'POST_ENGAGEMENT',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: targetingFinal,
    start_time: start, end_time: end, status: 'PAUSED',
  };
  if (destinationType) adsetParams.destination_type = destinationType;
  // (LOTE ADS-CREACIÓN) Con destino de mensajes (INSTAGRAM_DIRECT +
  // CONVERSATIONS), la doc oficial de la Marketing API exige el
  // promoted_object del conjunto: { page_id } de la Página vinculada
  // a la cuenta de Instagram. Sin él Meta rechaza la creación del
  // conjunto con code 100 «Invalid parameter» — era el fallo real del
  // riel del cliente (objetivo «comprar» de la tarjeta, 17/11): el
  // conjunto salía sin promoted_object. Sin Página no se fabrica:
  // queda el rechazo de Meta, ahora registrado entero.
  // (LOTE ADS-CREACIÓN-2) El promoted_object se declara con CUALQUIER
  // destino de engagement si hay Página: las fuentes vigentes del
  // boost de posteo existente (la doc del conector oficial de Meta y
  // implementaciones en producción) describen el conjunto de
  // engagement con la Página nombrada en promoted_object, y hay
  // registro del paso del anuncio fallando sin él (subcode 1885154);
  // es la misma Página que el creativo ya referencia (object_id) y
  // declararlo no cambia la entrega cuando no se exige. Sin Página
  // no se fabrica.
  if (pageId) {
    adsetParams.promoted_object = { page_id: String(pageId) };
  }
  const adset = await pasoBoost('conjunto', () => g(`${A}/adsets`, { method: 'POST', ctx: gctx, params: adsetParams }));

  // 3. Creativo desde el posteo existente (doc: "Use Posts as Instagram Ads")
  // (LOTE ADS-CREACIÓN-3) El instagram_user_id NO es el parámetro
  // igUserId del llamador (settings.ig_user_id, el id de Instagram
  // Login para publicar — inválido en este grafo, error del intento
  // 7): se resuelve contra la cuenta del riel en este momento
  // (resolverIgUserIdBoost) y viaja el id resuelto. Si la resolución
  // frena, el error sale con paso 'creativo' y el registro lo guarda
  // entero, como un rechazo de Meta en el mismo paso.
  const creative = await pasoBoost('creativo', async () => {
    const igResuelto = await resolverIgUserIdBoost({ pageId, igMediaId, ctx: gctx });
    const creativeParams = {
      name: `${name} · creativo`,
      instagram_user_id: igResuelto.id,
      source_instagram_media_id: String(igMediaId),
    };
    if (pageId) creativeParams.object_id = pageId;
    return g(`${A}/adcreatives`, { method: 'POST', ctx: gctx, params: creativeParams });
  });

  // 4. Anuncio activo
  const ad = await pasoBoost('anuncio', () => g(`${A}/ads`, { method: 'POST', ctx: gctx, params: {
    name, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'ACTIVE',
  }}));

  // 5. Encender campaña y conjunto — y VERIFICAR que quedaron ACTIVE.
  // (LOTE ADS-HARDENING-ACTIVACION) Antes el encendido se tragaba el
  // error con .catch(()=>{}) y createBoost devolvía los ids igual: el
  // endpoint daba el boost por lanzado y cobraba con el anuncio
  // pausado. Ahora la fuente de verdad es la lectura del estado en
  // Meta: si no queda ACTIVE, NO se da por lanzado y se lanza el
  // error (el llamador no cobra nada).
  let activacionErr = '';
  try { await g(`/${camp.id}`, { method: 'POST', ctx: gctx, params: { status: 'ACTIVE' } }); }
  catch (e) { activacionErr = `campaña: ${String((e && e.message) || e).slice(0, 120)}`; }
  try { await g(`/${adset.id}`, { method: 'POST', ctx: gctx, params: { status: 'ACTIVE' } }); }
  catch (e) { activacionErr = (activacionErr ? activacionErr + ' · ' : '') + `conjunto: ${String((e && e.message) || e).slice(0, 120)}`; }
  let estados = await verificarActivos(camp.id, adset.id, gctx);
  if (estados.campaign !== 'ACTIVE' || estados.adset !== 'ACTIVE') {
    // Un reintento de lectura: Meta a veces tarda un instante en reflejarlo.
    await new Promise((r) => setTimeout(r, 1200));
    estados = await verificarActivos(camp.id, adset.id, gctx);
  }
  if (estados.campaign !== 'ACTIVE' || estados.adset !== 'ACTIVE') {
    const err = new Error(
      `La activación del anuncio falló en Meta (campaña ${camp.id}: ${estados.campaign || 'sin dato'}, conjunto ${adset.id}: ${estados.adset || 'sin dato'}${activacionErr ? ' — ' + activacionErr : ''}). El anuncio quedó creado pero pausado; no se cobró nada.`
    );
    err.code = 'activacion_fallida';
    err.paso = 'activación';
    err.campaignId = camp.id; err.adsetId = adset.id; err.adId = ad.id; err.creativeId = creative.id;
    err.campaignStatus = estados.campaign || null; err.adsetStatus = estados.adset || null;
    throw err;
  }

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
// (LOTE ADS-CONEXION-PERSISTE) El canje manda el redirect_uri
// BYTE-IDÉNTICO al del diálogo: Meta lo exige y sin él (o con otro)
// rechaza con «Error validating verification code. Please make sure
// your redirect_uri is identical to the one you used in the OAuth
// dialog request» — el canje moría ahí, la captura de activos nunca
// corría y la conexión jamás se guardaba (caso Valentino, 16/11: el
// diálogo FLB completaba del lado de Meta y la app volvía a mostrar
// «Conectar mi cuenta publicitaria»). El valor lo persiste
// buildUnifiedAuth en la sesión al componer el diálogo y el callback
// lo pasa textual, igual que el flujo de Instagram pasa
// req.session.igRedirect a su canje.
async function exchangeUnifiedCode({ appId, appSecret, code, redirectUri }) {
  if (!appId || !appSecret || !code || !redirectUri) throw new Error('Faltan datos para conectar tu cuenta publicitaria');
  const q = new URLSearchParams({ client_id: String(appId), client_secret: String(appSecret), code: String(code), redirect_uri: String(redirectUri) });
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

// ---------- (LOTE ADS-CAPTURA-CUENTA) Enumeración de cuentas ----------
// La cuenta que el cliente ELIGE en el diálogo FLB tiene que ser la
// que queda guardada. Hasta este lote la captura la re-derivaba de
// UNA sola fuente — GET /me/adaccounts con el SUAT — y cualquier
// error de Graph en esa llamada se tragaba en silencio
// (.catch(() => ({ data: [] })), sin log en todo el camino): la
// cuenta concedida que no aparece en ese borde clásico (fenómeno
// documentado de Meta: los activos que viven dentro de un portfolio
// no siempre se reflejan en la enumeración /me/*) y un error de
// lectura eran indistinguibles, y ambos terminaban en una fila
// 'sin_cuenta' que le decía al cliente «no elegiste una cuenta
// publicitaria» cuando el diálogo de Meta había confirmado su
// elección (caso Valentino, 16/11 14:47: eligió la cuenta «Posty»
// 29027789776849841 de su portfolio Posty CM, la Página SÍ se
// capturó por /me/accounts, y la app le mostró «Falta la cuenta
// publicitaria»). La enumeración confiable de un portfolio son sus
// propios bordes: /{business}/owned_ad_accounts y
// /{business}/client_ad_accounts. Esta enumeración es la ÚNICA
// fuente de cuentas de la captura y del re-chequeo al impulsar:
// dos rutas, unión sin duplicados, y los errores NO se tragan —
// se loguean y se devuelven para que el llamador distinga «no hay
// cuentas» (salteo genuino) de «no se pudieron leer» (error).
const AD_ACCOUNT_FIELDS = 'id,account_id,name,currency,account_status,business';
function mapAdAccount(a, businessHint) {
  return {
    id: String(a.id || ''),
    account_id: String(a.account_id || String(a.id || '').replace(/^act_/, '')),
    name: String(a.name || ''),
    currency: String(a.currency || ''),
    account_status: a.account_status,
    business_id: (a.business && a.business.id) ? String(a.business.id) : (businessHint || ''),
  };
}
async function enumerateAdAccounts(suat) {
  const errors = [];
  const businessIds = [];
  const byId = new Map();
  const addAll = (list, hint) => {
    for (const a of list || []) {
      const m = mapAdAccount(a, hint);
      if (m.account_id && !byId.has(m.account_id)) byId.set(m.account_id, m);
    }
  };
  const note = (where, e) => {
    errors.push(e.message);
    console.error(`[meta_ads] enumeración de cuentas — ${where}:`, e.message);
  };
  // Ruta 1: el borde clásico del usuario de integración.
  try {
    const d = await gToken('/me/adaccounts', suat, { fields: AD_ACCOUNT_FIELDS, limit: '100' });
    addAll(d.data);
  } catch (e) { note('/me/adaccounts', e); }
  // Ruta 2: los negocios donde vive el usuario de integración y las
  // cuentas de cada uno (las propias del portfolio y las de clientes).
  try {
    const bs = await gToken('/me/businesses', suat, { fields: 'id,name', limit: '100' });
    for (const b of bs.data || []) {
      const bid = b && b.id ? String(b.id) : '';
      if (!bid) continue;
      businessIds.push(bid);
      for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
        try {
          const d = await gToken(`/${bid}/${edge}`, suat, { fields: AD_ACCOUNT_FIELDS, limit: '100' });
          addAll(d.data, bid);
        } catch (e) { note(`/${bid}/${edge}`, e); }
      }
    }
  } catch (e) { note('/me/businesses', e); }
  return { accounts: [...byId.values()], businessIds, errors };
}

// Los activos que el cliente compartió con la app, leídos con su SUAT:
// cuentas publicitarias (enumerateAdAccounts: /me/adaccounts + los
// bordes de sus negocios), páginas (me/accounts, con su IG vinculado)
// y el negocio dueño (business de las cuentas o el primer negocio
// enumerado; /me da el usuario de integración). Las lecturas
// secundarias fallan suave: sin páginas o sin /me, la captura sigue
// con lo que haya. Las cuentas, no: sin cuentas Y con errores de
// enumeración, el resultado trae adAccountsError y el callback NO
// afirma «sin_cuenta» — «no se pudieron leer» no es «no eligió».
async function fetchClientAssets(suat) {
  if (!suat) throw new Error('Falta el token de la conexión publicitaria');
  const [enumRes, pages, me] = await Promise.all([
    enumerateAdAccounts(suat),
    gToken('/me/accounts', suat, { fields: 'id,name,instagram_business_account', limit: '100' }).catch(() => ({ data: [] })),
    gToken('/me', suat, { fields: 'id,name' }).catch(() => ({})),
  ]);
  const adAccounts = enumRes.accounts;
  const pageList = (pages.data || []).map(p => ({
    id: String(p.id || ''),
    name: String(p.name || ''),
    ig_user_id: (p.instagram_business_account && p.instagram_business_account.id) ? String(p.instagram_business_account.id) : '',
  })).filter(p => p.id);
  const igSet = new Set(pageList.map(p => p.ig_user_id).filter(Boolean));
  const biz = adAccounts.find(a => a.business_id);
  return {
    businessId: biz ? biz.business_id : (enumRes.businessIds[0] || ''),
    adAccounts,
    pages: pageList,
    igAccountIds: [...igSet],
    suatUserId: (me && me.id) ? String(me.id) : '',
    adAccountsError: (adAccounts.length === 0 && enumRes.errors.length) ? enumRes.errors[0] : null,
  };
}

// Re-chequeo barato al gastar (riel cliente): la cuenta capturada
// sigue compartida con la app. Misma forma que checkAdsPermission:
// ok:false = no se pudo verificar (el llamador frena, nunca asume).
async function checkClientAdsAccess(suat, adAccountId) {
  if (!suat || !adAccountId) return { ok: false, hasAdsManagement: false, reason: 'sin_conexion' };
  try {
    // (LOTE ADS-CAPTURA-CUENTA) El re-chequeo lee la MISMA
    // enumeración que la captura (enumerateAdAccounts): una cuenta
    // capturada por los bordes del negocio no puede volver a fallar
    // acá porque el borde clásico /me/adaccounts no la liste.
    // (LOTE IMPULSAR-DIRECTO-RE-RIELADO, composición) La captura guarda
    // el id pelado (account_id), pero la comparación normaliza igual:
    // así el chequeo vale también si alguna fila quedó con el id
    // crudo «act_…» de /me/adaccounts.
    const bare = String(adAccountId || '').replace(/^act_/, '');
    const r = await enumerateAdAccounts(suat);
    const has = r.accounts.some(a => a.account_id === bare);
    if (has) return { ok: true, hasAdsManagement: true, reason: '' };
    // Sin la cuenta y con rutas caídas, no se pudo verificar (el
    // llamador frena); sin la cuenta y con la enumeración sana, la
    // cuenta ya no está compartida.
    if (r.errors.length) return { ok: false, hasAdsManagement: false, reason: 'verificacion_fallida' };
    return { ok: true, hasAdsManagement: false, reason: 'cuenta_no_compartida' };
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

// Métricas de una campaña: gasto, alcance, impresiones, clics y
// (LOTE ADS-ESTRATÉGICOS) conversaciones iniciadas — la acción real
// que Meta cuenta para los objetivos de mensajes
// (onsite_conversion.messaging_conversation_started_*). Sin esa
// acción en la respuesta, conversaciones = 0 (dato real, no estimado).
async function getBoostStats(campaignId) {
  if (!adsConfigured() || !campaignId) return null;
  // El endpoint de insights usa query params; se arma manual:
  const q = new URLSearchParams({
    fields: 'spend,reach,impressions,clicks,actions',
    'filtering[0][field]': 'campaign.id',
    'filtering[0][operator]': 'IN',
    'filtering[0][value]': JSON.stringify([String(campaignId)]),
    access_token: cfg().token,
  });
  const res = await fetch(`${GRAPH}${act()}/insights?${q.toString()}`, { signal: AbortSignal.timeout(25000) });
  const data = await res.json().catch(() => ({}));
  const row = data && data.data && data.data[0];
  if (!row) return null;
  let conversaciones = 0;
  if (Array.isArray(row.actions)) {
    const conv = row.actions.find((a) => a && /^onsite_conversion\.messaging_conversation_started/.test(String(a.action_type || '')));
    if (conv) conversaciones = Number(conv.value || 0) || 0;
  }
  return {
    spend_cents: Math.round(Number(row.spend || 0) * 100),
    reach: Number(row.reach || 0),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    conversaciones,
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

// ── (LOTE ADS-ESTRATÉGICOS) Resolución de targeting ───────────────
// Los ids de intereses NUNCA se escriben a mano (se vencen y Meta poda
// la taxonomía): se resuelven contra la Targeting Search API en el
// momento de crear. Igual para la geolocalización (adgeolocation) y
// para la audiencia parecida (una lookalike que YA exista en la
// cuenta). Todo fallo devuelve null: el llamador omite y declara.

// Nombre de interés → { id, name } real de Meta. Caché en memoria por
// nombre (el catálogo de rubros es chico y los nombres se repiten).
// (LOTE ADS-CREACIÓN) ctx opcional: en el riel del cliente la búsqueda
// corre con SU SUAT (los ids de intereses son taxonomía global de
// Meta, pero la llamada ya no depende de la configuración de Posty);
// sin ctx, el comportamiento histórico con el token del entorno.
const _interestCache = new Map();
async function searchInterestId(name, ctx) {
  const q = String(name || '').trim();
  if (!q) return null;
  if (ctx ? !(ctx.token && ctx.adAccountId) : !adsConfigured()) return null;
  const key = q.toLowerCase();
  if (_interestCache.has(key)) return _interestCache.get(key);
  let out = null;
  try {
    const d = await g('/search', { params: { type: 'adinterest', q, limit: '25' }, ctx: ctx || null });
    const rows = Array.isArray(d && d.data) ? d.data : [];
    const exact = rows.find((r) => r && r.id && String(r.name || '').trim().toLowerCase() === key);
    const hit = exact || rows.find((r) => r && r.id);
    if (hit) out = { id: String(hit.id), name: String(hit.name || q) };
  } catch (e) { out = null; }
  _interestCache.set(key, out);
  return out;
}

// Texto de ciudad → { key, name, latitude, longitude } de Meta
// (adgeolocation, solo ciudades). latitude/longitude vienen en la
// respuesta cuando Meta los tiene; si no, el llamador usa la key.
// (LOTE ADS-CREACIÓN) ctx opcional, como en searchInterestId.
async function searchGeo(query, country, ctx) {
  const q = String(query || '').trim();
  if (!q) return null;
  if (ctx ? !(ctx.token && ctx.adAccountId) : !adsConfigured()) return null;
  try {
    const d = await g('/search', { params: {
      type: 'adgeolocation', q, location_types: JSON.stringify(['city']),
      ...(country ? { country_code: String(country).toUpperCase() } : {}), limit: '5',
    }, ctx: ctx || null });
    const rows = Array.isArray(d && d.data) ? d.data : [];
    const hit = rows.find((r) => r && r.key) || null;
    if (!hit) return null;
    const lat = Number(hit.latitude), lng = Number(hit.longitude);
    return {
      key: String(hit.key),
      name: String(hit.name || q),
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    };
  } catch (e) { return null; }
}

// Primera audiencia LOOKALIKE que ya exista en la cuenta publicitaria.
// Crear una lookalike exige una audiencia origen poblada: no se crea
// en el momento del impulso — si no hay ninguna, devuelve null y el
// impulso corre sin parecidos, declarado en su registro.
// (LOTE ADS-CREACIÓN) ctx opcional: las audiencias son DE UNA CUENTA
// — en el riel del cliente la búsqueda corre en la cuenta DEL CLIENTE
// con su SUAT. Sin ctx buscaba en la cuenta de Posty y ese id ajeno
// entraba al conjunto del cliente: Meta lo rechaza (la cuenta del
// conjunto no tiene acceso a esa audiencia). Un id de otra cuenta
// JAMÁS entra a un conjunto.
async function findLookalikeAudienceId(ctx) {
  if (ctx ? !(ctx.token && ctx.adAccountId) : !adsConfigured()) return null;
  try {
    const d = await g(`${act(ctx || null)}/customaudiences`, { params: { fields: 'id,name,subtype', limit: '100' }, ctx: ctx || null });
    const rows = Array.isArray(d && d.data) ? d.data : [];
    const hit = rows.find((r) => r && r.id && String(r.subtype || '').toUpperCase() === 'LOOKALIKE');
    return hit ? String(hit.id) : null;
  } catch (e) { return null; }
}

module.exports = { adsConfigured, checkAdsPermission, checkEligibility, resolvePageId, resolverIgUserIdBoost, createBoost, getBoostStats, verificarActivos, getAccountCurrency, exchangeUnifiedCode, fetchClientAssets, enumerateAdAccounts, checkClientAdsAccess, resolvePageIdWithToken, searchInterestId, searchGeo, findLookalikeAudienceId, detalleErrorMeta };
