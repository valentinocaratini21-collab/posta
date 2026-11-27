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
  // (LOTE ADS-CREACIÓN-4) Los frenos de la resolución del id de IG
  // adjuntan el detalle CRUDO de sus lecturas (e.detalleLecturas):
  // el registro del impulso lo guarda entero y el próximo
  // diagnóstico es de una sola lectura, sin adivinar qué devolvió
  // Meta en cada lectura.
  if (e.detalleLecturas) partes.push(`lecturas: ${e.detalleLecturas}`);
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
// (LOTE ADS-CREACIÓN-4) El intento 8 (17/11, ya con v1163) frenó
// IGUAL: las DOS lecturas fallaron con el SUAT del cliente y el
// impulso murió en ig_no_resuelto — con la cuenta correcta YA
// guardada en la fila de la conexión (ig_account_ids, capturados
// por fetchClientAssets desde las Páginas compartidas al conectar).
// Hipótesis (declarada, sin probar contra Meta — el token vive en
// la base de producción): el SUAT del diálogo FLB trae
// ads_management, ads_read, instagram_manage_comments y
// business_management, pero leer el owner de un medio IG y el
// instagram_business_account de una Página pide instagram_basic /
// pages_read_engagement, que la configuración no concede; con el
// MISMO token las lecturas y escrituras de pauta (enumeración,
// moneda, campaña y conjunto) sí funcionaron en los intentos 4–8.
// Desde este lote la resolución manda en este orden: (1) las
// guardadas de la propia conexión (ctx.igAccountIds ← la fila
// ig_ads_connections vía adsReadiness) — una sola viaja sin leer
// nada; varias arbitran con las lecturas y, sin lecturas, con la
// cuenta que publica los posteos del usuario (publicadaId); (2)
// las lecturas en vivo de v1163 como respaldo cuando no hay
// guardadas útiles. Los frenos no cambian (fail-closed siempre) y
// desde ahora registran el error CRUDO de cada lectura
// (err.detalleLecturas → detalleErrorMeta lo suma al registro).
// (LOTE ADS-CREACIÓN-5) La causa raíz de los intentos del dueño,
// probada la noche del 17/11: sus posteos (582 y 696) son de su
// Instagram en español (@posty.communitymanager) y la conexión
// guardó solo la del inglés (@postycommunitymanager, la IG de la
// Página «Posty.») — Meta valida que el instagram_user_id sea la
// cuenta DUEÑA del medio fuente, vinculada a la Página del
// object_id y asignada a la cuenta publicitaria; una id de otra
// cuenta muere en el creativo con code 100 siempre. Desde este
// lote la conexión guarda el detalle por cuenta (id + username +
// Página + asignación, ver fetchClientAssets) y, con varias
// detalladas, el arbitraje es por el username de la cuenta que
// publica — sin lecturas en vivo — con frenos honestos antes de
// crear nada (createBoost resuelve ahora ANTES del paso 1). Las
// filas viejas sin detalle siguen por los caminos de v1167/v1163.
async function resolverIgUserIdBoost({ pageId, igMediaId, ctx = null, publicadaId = '' }) {
  // Las lecturas capturan su error CRUDO (con metaError): hasta el
  // intento 8 el catch lo reducía a null y el freno registraba solo
  // el resumen — se frenó bien pero sin dejar saber QUÉ devolvió
  // Meta en cada lectura.
  const leerDueno = async () => {
    try {
      const d = await g(`/${igMediaId}`, { params: { fields: 'owner{id,username}' }, ctx });
      const o = d && d.owner;
      return { dato: (o && o.id) ? { id: String(o.id), username: String(o.username || '') } : null, error: null };
    } catch (e) { return { dato: null, error: e }; }
  };
  const leerPagina = async () => {
    if (!pageId) return { dato: null, error: null };
    try {
      const d = await g(`/${pageId}`, { params: { fields: 'instagram_business_account{id,username}' }, ctx });
      const iba = d && d.instagram_business_account;
      return { dato: (iba && iba.id) ? { id: String(iba.id), username: String(iba.username || '') } : null, error: null };
    } catch (e) { return { dato: null, error: e }; }
  };
  const nom = (x) => x.username ? `@${x.username} (${x.id})` : x.id;
  const detalleDe = (r) => r.error ? detalleErrorMeta(r.error) : (r.dato ? `leída: ${nom(r.dato)}` : 'sin id en la respuesta');
  // (LOTE ADS-IG-RESOLUCION-VIVA-2) El resultado de CADA borde vivo
  // de la resolución (cuántas cuentas trajo, con qué usernames, o el
  // error de Meta) viaja en el detalle de cualquier freno de este
  // resolver: la primera corrida en vivo (19/11 23:40) frenó sin
  // dejar rastro de qué devolvieron los bordes nuevos y el freno
  // quedó ciego. Con esto, el registro del impulso dice exactamente
  // qué borde falló y cómo.
  let detalleVivas = '';
  const freno = (code, mensaje, ld, lp) => {
    const err = new Error(mensaje);
    err.code = code;
    err.paso = 'creativo';
    err.detalleLecturas = `dueño del medio — ${detalleDe(ld)} · IG de la Página — ${detalleDe(lp)}` + (detalleVivas ? ` · vivas: ${detalleVivas}` : '');
    return err;
  };
  // Las cuentas de IG que la PROPIA conexión del cliente guardó al
  // conectar: las enumeró el diálogo de Meta desde las Páginas
  // compartidas (instagram_business_account, el espacio de nombres
  // que el creativo valida) — verificadas por origen, sin depender
  // de ninguna lectura en vivo.
  // (LOTE ADS-CREACIÓN-5) Con el detalle guardado (ctx.igAccounts:
  // id + username + Página de cada una, capturado al conectar) el
  // arbitraje entre varias NO lee nada en vivo: la dueña del medio
  // es, por construcción de la app, la cuenta que publica los
  // posteos del usuario (la fila del posteo no guarda cuenta y el
  // camino de publicación usa una sola), así que el username de
  // publicación identifica a la dueña entre las guardadas. El
  // triple que el creativo valida se chequea entero contra lo
  // guardado: dueña (username) · vinculada a la Página del anuncio
  // (page_id guardado contra el pageId del riel) · asignada a la
  // cuenta publicitaria (usable_en_cuenta, si la lectura al
  // conectar respondió). Lo que no cierra frena ANTES de crear
  // nada, con el motivo honesto — jamás viaja un id de otra cuenta.
  const normU = (u) => String(u || '').replace(/^@+/, '').trim().toLowerCase();
  // (LOTE ADS-IG-RESOLUCION-VIVA) La fuente primaria pasa a ser la
  // cuenta publicitaria MISMA, leída en vivo con el token del riel:
  // /{act}/instagram_accounts es el borde que la doc de Meta manda
  // para instagram_user_id (ids en el espacio de nombres que el
  // creativo valida, con su username), y el portfolio dueño de la
  // cuenta expone las suyas y las instagram_business_account de sus
  // Páginas por business_management — los permisos que el SUAT del
  // diálogo SÍ trae. Hace falta porque las dos vías anteriores
  // volvieron vacías para el dueño: leer el dueño del medio y la IG
  // de la Página por los bordes de lectura general falló con ese
  // token (intento 8), y la captura al conectar por /me/accounts
  // volvió sin ninguna instagram_business_account — la fila guardó
  // SOLO el id de Instagram Login que el callback sumaba a
  // ig_account_ids, y ese id (el de PUBLICAR, inválido en este
  // grafo) viajó como instagram_user_id: el code 100 de Meta en
  // TODOS los intentos del 18 y 19/11 (posteos 582, 713 y 695).
  // Arbitraje: la dueña del medio manda si su lectura responde y
  // está entre las vivas (si responde y NO está, hay contradicción
  // demostrada y frena); si no, el username de publicación entre
  // las vivas; si hay una sola viva, esa. Lo guardado queda de
  // respaldo y el id de publicación no viaja nunca (ver el freno
  // ig_no_resuelto de abajo, que ya no desempata con publicadaId).
  if (ctx && ctx.token && ctx.adAccountId) {
    const vivas = new Map();
    const dv = [];
    const sumarViva = (id, username, fuente) => {
      const k = String(id || '');
      if (!k) return;
      const prev = vivas.get(k);
      if (!prev) vivas.set(k, { id: k, username: String(username || ''), fuente });
      else if (!prev.username && username) prev.username = String(username);
    };
    const notaBorde = (nombreBorde, antes) => {
      const nuevas = [...vivas.values()].slice(antes);
      dv.push(nuevas.length ? `${nombreBorde}: ${nuevas.map(nom).join(', ')}` : `${nombreBorde}: 0`);
    };
    try {
      const antesV = vivas.size;
      const d = await g(`${act(ctx)}/instagram_accounts`, { params: { fields: 'id,username', limit: '100' }, ctx });
      for (const x of (d.data || [])) sumarViva(x && x.id, x && x.username, 'cuenta_publicitaria');
      notaBorde('cuenta_publicitaria', antesV);
    } catch (e) { dv.push(`cuenta_publicitaria: ERROR ${detalleErrorMeta(e)}`); }
    // El business sale del guardado de la conexión (lo capturó la
    // enumeración confiable al conectar); la lectura en vivo de la
    // cuenta queda de respaldo.
    let bizIdV = ctx.businessId ? String(ctx.businessId) : '';
    if (!bizIdV) {
      try {
        const a = await g(`${act(ctx)}`, { params: { fields: 'business{id}' }, ctx });
        bizIdV = (a && a.business && a.business.id) ? String(a.business.id) : '';
        dv.push(bizIdV ? 'business: leído de la cuenta' : 'business: la cuenta no devolvió business');
      } catch (e) { dv.push(`business: ERROR ${detalleErrorMeta(e)}`); }
    } else dv.push('business: guardado');
    if (bizIdV) {
      try {
        const antesV = vivas.size;
        const d = await g(`/${bizIdV}/instagram_accounts`, { params: { fields: 'id,username', limit: '100' }, ctx });
        for (const x of (d.data || [])) sumarViva(x && x.id, x && x.username, 'portfolio');
        notaBorde('portfolio_ig', antesV);
      } catch (e) { dv.push(`portfolio_ig: ERROR ${detalleErrorMeta(e)}`); }
      for (const bordeP of ['owned_pages', 'client_pages']) {
        try {
          const antesV = vivas.size;
          const d = await g(`/${bizIdV}/${bordeP}`, { params: { fields: 'id,instagram_business_account{id,username}', limit: '100' }, ctx });
          for (const p of (d.data || [])) { const iba = p && p.instagram_business_account; if (iba) sumarViva(iba.id, iba.username, 'portfolio_paginas'); }
          notaBorde(bordeP, antesV);
        } catch (e) { dv.push(`${bordeP}: ERROR ${detalleErrorMeta(e)}`); }
      }
    }
    detalleVivas = dv.join(' · ');
    if (vivas.size) {
      const ldV = await leerDueno();
      if (ldV.dato) {
        if (vivas.has(ldV.dato.id)) return { id: ldV.dato.id, fuente: 'viva_dueno' };
        throw freno('ig_conflicto', `La cuenta de Instagram dueña del posteo (${nom(ldV.dato)}) no está entre las cuentas que la cuenta publicitaria puede usar (${[...vivas.values()].map(nom).join(', ')}): el impulso se frenó antes de crear el aviso.`, ldV, { dato: null, error: null });
      }
      const pubUV = normU(ctx.publicadaUsername);
      if (pubUV) {
        const mV = [...vivas.values()].filter((a) => normU(a.username) && normU(a.username) === pubUV);
        if (mV.length === 1) return { id: mV[0].id, fuente: 'viva_username' };
      }
      if (vivas.size === 1) { const uV = [...vivas.values()][0]; return { id: uV.id, fuente: 'viva_unica' }; }
    }
  }
  const detalladas = [...new Map((ctx && Array.isArray(ctx.igAccounts) ? ctx.igAccounts : [])
    .map((a) => ({ id: String((a && a.id) || ''), username: String((a && a.username) || ''), page_id: String((a && a.page_id) || ''), usable: (a && a.usable_en_cuenta !== undefined) ? a.usable_en_cuenta : null }))
    .filter((a) => a.id).map((a) => [a.id, a])).values()];
  const guardadas = detalladas.length
    ? detalladas.map((a) => a.id)
    : [...new Set((ctx && Array.isArray(ctx.igAccountIds) ? ctx.igAccountIds : []).map((x) => String(x || '')).filter(Boolean))];
  // (LOTE ADS-IG-RESOLUCION-VIVA) Si la única guardada ES el id de
  // publicación (publicadaId), es el id de Instagram Login que el
  // callback sumaba a la lista: no viaja como verificada — se cae
  // al arbitraje en vivo de abajo, que frena si no puede verificar.
  if (guardadas.length === 1 && String(guardadas[0]) !== String(publicadaId || '')) {
    // Una sola guardada SIN detalle (fila vieja) o con el username
    // de publicación coincidente: viaja como hoy (v1167, el caso
    // del intento 8). Pero una sola DETALLADA cuyo username
    // difiere del de publicación es un desacuerdo DEMOSTRADO — el
    // posteo es de otra cuenta — y mandar esa id sería repetir el
    // code 100 de todos los intentos del dueño (su conexión guarda
    // solo la EN y sus posteos son de la ES): freno honesto antes
    // de crear nada, el mismo motivo que con varias guardadas.
    if (detalladas.length === 1) {
      const pubU1 = normU(ctx && ctx.publicadaUsername);
      const unica = detalladas[0];
      if (pubU1 && normU(unica.username) && normU(unica.username) !== pubU1) {
        const err = new Error(`Este posteo es de la cuenta de Instagram @${pubU1}, que no está en la conexión publicitaria (la conexión tiene ${unica.username ? `@${unica.username}` : unica.id}): el impulso se frenó antes de crear nada en Meta. Para impulsarlo, esa cuenta tiene que estar vinculada a una Página compartida en la conexión.`);
        err.code = 'ig_fuera_de_conexion';
        err.paso = 'creativo';
        err.detalleLecturas = 'arbitraje por lo guardado (sin lecturas en vivo): la única cuenta guardada con username no es la que publica el posteo';
        // (LOTE RECONEXION-ADS) Las dos identidades viajan
        // estructuradas: el 409 las pasa al cuerpo y la tarjeta del
        // cliente dice la causa exacta, con su salida.
        err.igDuena = pubU1;
        err.igConexion = [unica.username || unica.id];
        throw err;
      }
    }
    return { id: guardadas[0], fuente: 'conexion_guardada' };
  }
  if (detalladas.length > 1) {
    const pubU = normU(ctx && ctx.publicadaUsername);
    if (pubU) {
      const match = detalladas.filter((a) => normU(a.username) && normU(a.username) === pubU);
      const lista = detalladas.map((a) => (a.username ? `@${a.username}` : a.id)).join(', ');
      const frenoGuardado = (code, mensaje, detalle) => {
        const err = new Error(mensaje);
        err.code = code;
        err.paso = 'creativo';
        err.detalleLecturas = detalle;
        return err;
      };
      if (match.length === 0) {
        const errSin = frenoGuardado('ig_fuera_de_conexion',
          `Este posteo es de la cuenta de Instagram @${pubU}, que no está en la conexión publicitaria (la conexión tiene ${lista}): el impulso se frenó antes de crear nada en Meta. Para impulsarlo, esa cuenta tiene que estar vinculada a una Página compartida en la conexión.`,
          'arbitraje por lo guardado (sin lecturas en vivo): la cuenta que publica no está entre las cuentas guardadas con username');
        // (LOTE RECONEXION-ADS) Identidades estructuradas para el 409.
        errSin.igDuena = pubU;
        errSin.igConexion = detalladas.map((a) => a.username || a.id);
        throw errSin;
      }
      if (match.length === 1) {
        const m = match[0];
        // La dueña está, pero el creativo también exige que esté
        // vinculada a la Página que el anuncio pasa como object_id:
        // vinculada a OTRA Página, Meta lo rechaza igual — freno
        // honesto antes de crear, con su propio motivo.
        if (pageId && m.page_id && String(m.page_id) !== String(pageId)) {
          throw frenoGuardado('ig_otra_pagina',
            `Este posteo es de la cuenta de Instagram @${pubU}, que en la conexión publicitaria está vinculada a otra Página de Facebook, no a la Página de este anuncio: el impulso se frenó antes de crear nada en Meta.`,
            'arbitraje por lo guardado (sin lecturas en vivo): la dueña está guardada pero su Página guardada no es la del riel');
        }
        if (m.usable === false) {
          const errNoU = frenoGuardado('ig_fuera_de_conexion',
            `Este posteo es de la cuenta de Instagram @${pubU}, que no está asignada a la cuenta publicitaria de la conexión (la conexión tiene ${lista}): el impulso se frenó antes de crear nada en Meta. Asignala a la cuenta publicitaria en Meta y volvé a conectar.`,
            'arbitraje por lo guardado (sin lecturas en vivo): la dueña está guardada pero usable_en_cuenta quedó false al conectar');
          // (LOTE RECONEXION-ADS) Identidades estructuradas para el 409.
          errNoU.igDuena = pubU;
          errNoU.igConexion = detalladas.map((a) => a.username || a.id);
          throw errNoU;
        }
        return { id: m.id, fuente: 'guardada_username' };
      }
      // match.length > 1 (el mismo username dos veces): imposible
      // en una captura sana; cae al arbitraje de siempre.
    }
    // Sin username de publicación con qué arbitrar: sigue el
    // arbitraje de v1167 sobre las guardadas (lecturas + publicadaId).
  }
  const [ld, lp] = await Promise.all([leerDueno(), leerPagina()]);
  const dueno = ld.dato, pagina = lp.dato;
  // La contradicción demostrada frena en cualquier camino (v1163).
  if (dueno && pagina && dueno.id !== pagina.id) {
    throw freno('ig_conflicto', `La cuenta de Instagram dueña del posteo (${nom(dueno)}) no es la vinculada a la Página del anuncio (${nom(pagina)}): el impulso se frenó antes de crear el aviso. Revisá que el posteo sea de la cuenta conectada.`, ld, lp);
  }
  if (guardadas.length > 1) {
    const enGuardadas = (x) => !!x && guardadas.includes(x.id);
    // La dueña leída manda: si está entre las guardadas viaja; si la
    // lectura la ubica FUERA de las compartidas, el posteo no es de
    // una cuenta de la conexión y se frena (ninguna guardada está
    // verificada para este medio).
    if (dueno) {
      if (!enGuardadas(dueno)) {
        throw freno('ig_no_resuelto', `La cuenta de Instagram dueña del posteo (${nom(dueno)}) no está entre las cuentas compartidas en la conexión publicitaria (${guardadas.join(', ')}): el impulso se frenó antes de crear el aviso, sin mandar ningún id sin verificar.`, ld, lp);
      }
      return { id: dueno.id, fuente: 'guardada_dueno' };
    }
    if (pagina) {
      if (!enGuardadas(pagina)) {
        throw freno('ig_no_resuelto', `La Instagram vinculada a la Página del anuncio (${nom(pagina)}) no está entre las cuentas compartidas en la conexión publicitaria (${guardadas.join(', ')}): el impulso se frenó antes de crear el aviso, sin mandar ningún id sin verificar.`, ld, lp);
      }
      return { id: pagina.id, fuente: 'guardada_pagina' };
    }
    // Ninguna lectura respondió ni hubo candidata verificada:
    // freno. (LOTE ADS-IG-RESOLUCION-VIVA) La cuenta que PUBLICA
    // (publicadaId = settings.ig_user_id, el id de Instagram
    // Login) ya NO desempata devolviéndose como instagram_user_id:
    // ese id no es válido en este grafo y mandarlo era el code 100
    // de Meta en todos los intentos del dueño. Sin verificación no
    // viaja ningún id, como manda la regla de la función.
    throw freno('ig_no_resuelto', `No se pudo verificar cuál de las cuentas de Instagram compartidas (${guardadas.join(', ')}) es la dueña del posteo ${igMediaId} (ni el dueño del medio ni la Instagram de la Página pudieron leerse): el impulso se frenó antes de crear el aviso, sin mandar ningún id sin verificar.`, ld, lp);
  }
  // Sin cuentas guardadas útiles (riel de Posty o filas viejas): la
  // resolución de v1163 tal cual — la dueña manda, la IG de la
  // Página respalda y el vacío frena, ahora con el detalle crudo.
  if (dueno) return { id: dueno.id, fuente: 'dueno_medio' };
  if (pagina) return { id: pagina.id, fuente: 'pagina' };
  throw freno('ig_no_resuelto', `No se pudo verificar la cuenta de Instagram dueña del posteo ${igMediaId} en la cuenta publicitaria (ni el dueño del medio ni la Instagram de la Página pudieron leerse): el impulso se frenó antes de crear el aviso, sin mandar ningún id sin verificar.`, ld, lp);
}

// Lee el estado real de campaña, conjunto Y ANUNCIO en Meta (fuente
// de verdad tras el encendido), con el token del riel que corre (el
// del entorno o el SUAT del cliente vía ctx). Si una lectura falla,
// ese estado queda null — nunca se asume ACTIVE sin haberlo leído.
// (LOTE CIERRE-ADS · FIX 1) Hasta este lote se leían solo campaña y
// conjunto: campaña+conjunto ACTIVE con el anuncio pausado daba
// «éxito» sin entregar nada. La forma histórica de 3 argumentos
// (camp, adset, ctx) sigue válida: el tercer argumento objeto es el
// ctx; con id de anuncio (string) se lee también `ad`.
async function verificarActivos(campaignId, adsetId, adId = null, ctx = null) {
  if (adId && typeof adId === 'object') { ctx = adId; adId = null; }
  const leer = async (id) => {
    try {
      const d = await g(`/${id}`, { params: { fields: 'status' }, ctx });
      return (d && d.status) || null;
    } catch (e) { return null; }
  };
  const [campaign, adset] = await Promise.all([leer(campaignId), leer(adsetId)]);
  const out = { campaign, adset };
  if (adId) out.ad = await leer(adId);
  return out;
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
// Si la activación NO deja campaña, conjunto y anuncio en ACTIVE,
// createBoost LANZA el error (code 'activacion_fallida', o
// 'activacion_sin_dato' si Meta no devolvió ninguna lectura, con los
// ids): el llamador NO debe cobrar por un anuncio que quedó pausado.
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

  // (LOTE ADS-CREACIÓN-5) La resolución del instagram_user_id corre
  // ACÁ, antes de crear NADA (antes vivía en el paso 3 y un freno
  // dejaba campaña y conjunto huérfanos en Meta): si la cuenta del
  // posteo no se puede emparejar con lo guardado en la conexión,
  // el impulso frena sin una sola escritura. El id resuelto es el
  // que viaja en el creativo del paso 3.
  const igResuelto = await resolverIgUserIdBoost({ pageId, igMediaId, ctx: gctx, publicadaId: igUserId });

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
  // 7): viaja el id RESUELTO contra la cuenta del riel. Si la
  // resolución frena, el error sale con paso 'creativo' y el
  // registro lo guarda entero, como un rechazo de Meta en el
  // mismo paso.
  // (LOTE ADS-CREACIÓN-4) El parámetro igUserId viaja SOLO como
  // publicadaId: la cuenta que publica los posteos del usuario,
  // desempate de última instancia entre las guardadas de la
  // conexión — jamás como instagram_user_id directo.
  // (LOTE ADS-CREACIÓN-5) La resolución se movió ANTES del paso 1
  // (ver arriba): acá solo se usa el id ya resuelto.
  const creative = await pasoBoost('creativo', async () => {
    const creativeParams = {
      name: `${name} · creativo`,
      instagram_user_id: igResuelto.id,
      source_instagram_media_id: String(igMediaId),
    };
    if (pageId) creativeParams.object_id = pageId;
    // (LOTE ADS-DESTRABE-VERDAD) Con destino de mensajes
    // (INSTAGRAM_DIRECT), el creativo del posteo existente lleva su
    // botón de mensaje: sin call_to_action, Meta crea el aviso y lo
    // deja WITH_ISSUES «Invalid Creative For Objective» — nunca
    // corre (boost 24, 23/11: campaña y conjunto ACTIVE, aviso
    // pausado, gasto US$0, y el panel contando días igual). El campo
    // call_to_action es el que la referencia oficial de AdCreative
    // define para los anuncios creados desde un posteo existente de
    // Instagram, y el botón del canal es INSTAGRAM_MESSAGE con su
    // link canónico. La rama de engagement NO lo lleva: su forma
    // histórica («sin CTA inventado») queda intacta.
    if (destinationType === 'INSTAGRAM_DIRECT') {
      creativeParams.call_to_action = { type: 'INSTAGRAM_MESSAGE', value: { link: 'https://www.instagram.com/' } };
    }
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
  // (LOTE CIERRE-ADS · FIX 1) La verificación es de los TRES: campaña,
  // conjunto y anuncio. Y «sin dato» no es «pausado»: si tras la
  // relectura los tres estados volvieron null (Graph no devolvió
  // lectura de ninguno), el motivo interno es activacion_sin_dato —
  // distinguible en el registro del PAUSED confirmado
  // (activacion_fallida); el barrido de reparación re-verifica ambos
  // casos por el mismo camino.
  let estados = await verificarActivos(camp.id, adset.id, ad.id, gctx);
  if (estados.campaign !== 'ACTIVE' || estados.adset !== 'ACTIVE' || estados.ad !== 'ACTIVE') {
    // Un reintento de lectura: Meta a veces tarda un instante en reflejarlo.
    await new Promise((r) => setTimeout(r, 1200));
    estados = await verificarActivos(camp.id, adset.id, ad.id, gctx);
  }
  if (estados.campaign !== 'ACTIVE' || estados.adset !== 'ACTIVE' || estados.ad !== 'ACTIVE') {
    const sinDato = estados.campaign == null && estados.adset == null && estados.ad == null;
    const err = new Error(
      `La activación del anuncio ${sinDato ? 'no se pudo verificar' : 'falló'} en Meta (campaña ${camp.id}: ${estados.campaign || 'sin dato'}, conjunto ${adset.id}: ${estados.adset || 'sin dato'}, anuncio ${ad.id}: ${estados.ad || 'sin dato'}${activacionErr ? ' — ' + activacionErr : ''}). El anuncio quedó creado pero sin confirmar; no se cobró nada.`
    );
    err.code = sinDato ? 'activacion_sin_dato' : 'activacion_fallida';
    err.paso = 'activación';
    err.campaignId = camp.id; err.adsetId = adset.id; err.adId = ad.id; err.creativeId = creative.id;
    err.campaignStatus = estados.campaign || null; err.adsetStatus = estados.adset || null; err.adStatus = estados.ad || null;
    throw err;
  }

  return { campaignId: camp.id, adsetId: adset.id, adId: ad.id, creativeId: creative.id };
}

// ---------- (LOTE CIERRE-ADS · FIX 1) Reparación de activaciones ----------
// reactivarBoost({ campaignId, adsetId, adId, ctx }): re-enciende
// campaña y conjunto (y el anuncio, si su id viene: nació ACTIVE pero
// un encendido parcial pudo dejarlo pausado) y verifica los TRES
// estados con el criterio completo de verificarActivos. Es el camino
// de reparación permanente de las activaciones que fallaron a mitad
// de camino — PAUSED deja de ser un estado terminal. Nunca cobra
// nada: el cobro es de la costura del fee del llamador, idempotente
// por campaña.
async function reactivarBoost({ campaignId, adsetId, adId, ctx = null } = {}) {
  if (!campaignId || !adsetId) return { ok: false, motivo: 'sin_ids', estados: null };
  const encender = async (id) => {
    try { await g(`/${id}`, { method: 'POST', ctx, params: { status: 'ACTIVE' } }); return ''; }
    catch (e) { return String((e && e.message) || e).slice(0, 120); }
  };
  const errores = [];
  const e1 = await encender(campaignId); if (e1) errores.push('campaña: ' + e1);
  const e2 = await encender(adsetId); if (e2) errores.push('conjunto: ' + e2);
  if (adId) { const e3 = await encender(adId); if (e3) errores.push('anuncio: ' + e3); }
  let estados = await verificarActivos(campaignId, adsetId, adId || null, ctx);
  if (estados.campaign !== 'ACTIVE' || estados.adset !== 'ACTIVE' || (adId && estados.ad !== 'ACTIVE')) {
    await new Promise((r) => setTimeout(r, 1200));
    estados = await verificarActivos(campaignId, adsetId, adId || null, ctx);
  }
  const ok = estados.campaign === 'ACTIVE' && estados.adset === 'ACTIVE' && (!adId || estados.ad === 'ACTIVE');
  return { ok, estados, error: errores.join(' · ') };
}

// listarCampanasPorNombre(ctx, contiene): las campañas de la cuenta
// del riel cuyo nombre contiene el texto. La reconciliación de
// huérfanas la usa porque las campañas del 17/11 no tienen fila local
// con sus ids: se encuentran EN Meta, por su nombre «Posty · …».
async function listarCampanasPorNombre(ctx, contiene) {
  const d = await g(`${act(ctx)}/campaigns`, { params: { fields: 'id,name,status', limit: '200' }, ctx });
  const rows = Array.isArray(d && d.data) ? d.data : [];
  const needle = String(contiene || '');
  return rows
    .filter((c) => c && c.id && (!needle || String(c.name || '').includes(needle)))
    .map((c) => ({ id: String(c.id), name: String(c.name || ''), status: c.status || null }));
}

// leerAnunciosDeCampana(campaignId, ctx): los anuncios de una campaña
// (id + estado). Lista vacía = huérfana del paso creativo: la campaña
// y el conjunto existen pero el anuncio nunca se creó.
async function leerAnunciosDeCampana(campaignId, ctx = null) {
  const d = await g(`/${campaignId}/ads`, { params: { fields: 'id,status', limit: '50' }, ctx });
  const rows = Array.isArray(d && d.data) ? d.data : [];
  return rows.filter((a) => a && a.id).map((a) => ({ id: String(a.id), status: a.status || null }));
}

// leerAdsetDeCampana(campaignId, ctx): el conjunto de la campaña (las
// de impulso tienen uno solo; se devuelve el primero), con su
// lifetime_budget (la pauta con la que nació: la reconciliación la
// usa para asentar la fila y cobrar el fee correcto).
async function leerAdsetDeCampana(campaignId, ctx = null) {
  const d = await g(`/${campaignId}/adsets`, { params: { fields: 'id,status,lifetime_budget', limit: '10' }, ctx });
  const rows = Array.isArray(d && d.data) ? d.data : [];
  const a = rows.find((x) => x && x.id);
  return a ? { id: String(a.id), status: a.status || null, lifetime_budget: a.lifetime_budget != null ? Number(a.lifetime_budget) : null } : null;
}

// archivarCampana(campaignId, ctx): la huérfana sin anuncio queda
// ARCHIVED en Meta — fuera de circulación y del historial activo del
// cliente, sin borrar el registro de que existió.
async function archivarCampana(campaignId, ctx = null) {
  await g(`/${campaignId}`, { method: 'POST', ctx, params: { status: 'ARCHIVED' } });
  return { ok: true };
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
    gToken('/me/accounts', suat, { fields: 'id,name,instagram_business_account{id,username}', limit: '100' }).catch(() => ({ data: [] })),
    gToken('/me', suat, { fields: 'id,name' }).catch(() => ({})),
  ]);
  const adAccounts = enumRes.accounts;
  const pageList = (pages.data || []).map(p => ({
    id: String(p.id || ''),
    name: String(p.name || ''),
    ig_user_id: (p.instagram_business_account && p.instagram_business_account.id) ? String(p.instagram_business_account.id) : '',
    ig_username: (p.instagram_business_account && p.instagram_business_account.username) ? String(p.instagram_business_account.username) : '',
  })).filter(p => p.id);
  const igSet = new Set(pageList.map(p => p.ig_user_id).filter(Boolean));
  const biz = adAccounts.find(a => a.business_id);
  // (LOTE ADS-CREACIÓN-5) Las cuentas de IG con su identidad
  // completa: id + username + la Página a la que cada una está
  // vinculada (la enumeración la trae nativa: el
  // instagram_business_account DE esa Página) — el creativo valida
  // dueña + vínculo con la Página del anuncio, y el arbitraje al
  // impulsar (sin lecturas en vivo) necesita este mapa guardado.
  // Tercera pata del triple: el conjunto que la cuenta
  // publicitaria principal puede usar (/{act}/instagram_accounts,
  // la fuente que la propia doc de Meta manda para
  // instagram_user_id). Lectura secundaria fail-soft, SOLO al
  // conectar: si no responde, usable_en_cuenta queda null (sin
  // dato) — jamás frena la captura ni se inventa un false.
  const principal = adAccounts.find(a => Number(a.account_status) === 1) || adAccounts[0] || null;
  let usables = null;
  if (principal && principal.account_id) {
    try {
      const d = await gToken(`/act_${principal.account_id}/instagram_accounts`, suat, { fields: 'id,username', limit: '100' });
      usables = new Set((d.data || []).map(x => String((x && x.id) || '')).filter(Boolean));
    } catch (e) { usables = null; }
  }
  const igAccounts = pageList.filter(p => p.ig_user_id).map(p => ({
    id: p.ig_user_id,
    username: p.ig_username || '',
    page_id: p.id,
    page_name: p.name || '',
    usable_en_cuenta: usables ? usables.has(p.ig_user_id) : null,
  }));
  return {
    businessId: biz ? biz.business_id : (enumRes.businessIds[0] || ''),
    adAccounts,
    pages: pageList,
    igAccountIds: [...igSet],
    igAccounts,
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

// (LOTE ADS-STATS-TARJETA) La fila de insights → las stats del
// impulso, en UNA sola extracción compartida por los dos rieles (la
// cuenta de Posty por el fetch histórico de getBoostStats y la del
// cliente por g() con su ctx en getBoostStatsConCtx). Los campos de
// siempre conservan su semántica exacta: gasto/alcance/impresiones/
// clics como números de la fila y conversaciones con la convención
// de ADS-ESTRATÉGICOS (la acción
// onsite_conversion.messaging_conversation_started_*; 0 si no vino —
// el dato que ya leen el barrido y resultadoDe). Las dos stats
// nuevas nacen con semántica de ausencia: visitas_perfil (la acción
// ~ profile_visit, la medición del objetivo «perfil») e
// interacciones (la acción exacta post_engagement, la del camino
// POST_ENGAGEMENT) son null cuando Meta no devolvió esa acción en
// la respuesta — la tarjeta las omite, nunca las rellena con un 0.
function statsDesdeRow(row) {
  if (!row) return null;
  const accion = (re) => {
    if (!Array.isArray(row.actions)) return null;
    const a = row.actions.find((x) => x && re.test(String(x.action_type || '')));
    return a ? (Number(a.value || 0) || 0) : null;
  };
  const conversaciones = accion(/^onsite_conversion\.messaging_conversation_started/);
  return {
    spend_cents: Math.round(Number(row.spend || 0) * 100),
    reach: Number(row.reach || 0),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    conversaciones: conversaciones == null ? 0 : conversaciones,
    visitas_perfil: accion(/(^|\.)profile_visit/),
    interacciones: accion(/^post_engagement$/),
  };
}

// Métricas de una campaña: gasto, alcance, impresiones, clics y
// (LOTE ADS-ESTRATÉGICOS) conversaciones iniciadas — la acción real
// que Meta cuenta para los objetivos de mensajes
// (onsite_conversion.messaging_conversation_started_*). Sin esa
// acción en la respuesta, conversaciones = 0 (dato real, no estimado).
// (LOTE ADS-PREGUNTAS) visitas_perfil: la acción que respalda la
// métrica «Instagram Profile Visits» (onsite_conversion.profile_visit)
// — el barrido por regex cubre las formas del action_type. La
// extracción vive en statsDesdeRow (LOTE ADS-STATS-TARJETA): sin
// esa acción en la respuesta, visitas_perfil = null (la tarjeta la
// omite), nunca un estimado ni seguidores.
async function getBoostStats(campaignId) {
  if (!adsConfigured() || !campaignId) return null;
  // El endpoint de insights usa query params; se arma manual:
  // (LOTE ADS-INSIGHTS-FIX) El filtro va como UN parámetro
  // «filtering» con el array JSON: la forma por partes
  // filtering[0][field]/[operator]/[value] la rechaza Meta con
  // (#100) «Value of IN should be array containing scalar items»
  // y las dos vías de lectura lo aplanaban a null — el panel leía
  // cero aunque la campaña entregara (impulso 25, 26/11;
  // diagnóstico ADS-DIAG v1364, fbtrace AbQtic3FAXsBbCRcYWqtgjE).
  const q = new URLSearchParams({
    fields: 'spend,reach,impressions,clicks,actions',
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [String(campaignId)] }]),
    access_token: cfg().token,
  });
  const res = await fetch(`${GRAPH}${act()}/insights?${q.toString()}`, { signal: AbortSignal.timeout(25000) });
  const data = await res.json().catch(() => ({}));
  const row = data && data.data && data.data[0];
  if (!row) return null;
  return statsDesdeRow(row);
}

// (LOTE ADS-STATS-TARJETA) La MISMA lectura de métricas pero en la
// cuenta del CLIENTE, con el ctx de su conexión guardada (su SUAT,
// su cuenta publicitaria): los impulsos del riel del cliente viven
// en esa cuenta y el token de Posty no los ve (getBoostStats
// devuelve null para esas campañas y sus stats nunca se
// refrescaban). Los ids de campaña son únicos entre cuentas: pedir
// una campaña en la cuenta equivocada devuelve la lista vacía
// (null), nunca números ajenos. Ante un error de Meta, null: el
// llamador conserva lo persistido.
async function getBoostStatsConCtx(campaignId, ctx) {
  if (!campaignId || !ctx || !ctx.token || !ctx.adAccountId) return null;
  let data;
  try {
    data = await g(`${act(ctx)}/insights`, {
      ctx,
      params: {
        fields: 'spend,reach,impressions,clicks,actions',
        filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [String(campaignId)] }]),
      },
    });
  } catch (e) { return null; }
  const row = data && data.data && data.data[0];
  return statsDesdeRow(row || null);
}

// (LOTE ADS-DIAG) La MISMA consulta de insights de getBoostStats,
// pero devuelve el resultado CRUDO en vez de aplanarlo a null:
// qué cuenta se consultó, cuántas filas vinieron, la primera fila
// parseada y el error COMPLETO de Meta si lo hubo. Las dos vías de
// lectura (getBoostStats y getBoostStatsConCtx) devuelven null tanto
// ante «cuenta equivocada» como ante «error de Meta» como ante «sin
// datos todavía» — indistinguibles desde afuera, y el panel quedaba
// en cero sin causa visible (impulso 25, 26/11: la campaña entregaba
// en Meta y los dos rieles leían vacío). Solo lectura; lo consume la
// ruta admin /api/admin/ads/diagnosticar. Nunca devuelve tokens.
async function diagBoost(campaignId, ctx) {
  const out = {
    cuenta: (ctx && ctx.adAccountId) || cfg().adAccountId || null,
    http_status: null,
    filas: null,
    primera_fila: null,
    error: null,
  };
  if (!campaignId) { out.error = { message: 'sin campaign_id' }; return out; }
  if (ctx && (!ctx.token || !ctx.adAccountId)) { out.error = { message: 'ctx del cliente incompleto (sin token o sin cuenta)' }; return out; }
  if (!ctx && !adsConfigured()) { out.error = { message: 'riel de la casa no configurado' }; return out; }
  const token = (ctx && ctx.token) || cfg().token;
  const q = new URLSearchParams({
    fields: 'spend,reach,impressions,clicks,actions',
    filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [String(campaignId)] }]),
    access_token: token,
  });
  let res;
  try {
    res = await fetch(`${GRAPH}${act(ctx)}/insights?${q.toString()}`, { signal: AbortSignal.timeout(25000) });
  } catch (e) {
    out.error = { message: 'fetch sin respuesta: ' + String((e && e.message) || e) };
    return out;
  }
  out.http_status = res.status;
  const data = await res.json().catch(() => ({}));
  if (data && data.error) {
    out.error = {
      code: data.error.code != null ? data.error.code : null,
      subcode: data.error.error_subcode != null ? data.error.error_subcode : null,
      type: data.error.type || null,
      message: data.error.message || data.error.error_user_msg || null,
      fbtrace_id: data.error.fbtrace_id || null,
    };
    return out;
  }
  const rows = data && Array.isArray(data.data) ? data.data : [];
  out.filas = rows.length;
  out.primera_fila = rows[0] ? statsDesdeRow(rows[0]) : null;
  return out;
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

// (LOTE ADS-PREGUNTAS) «Los que ya te vieron»: la audiencia de
// interacción de Instagram del negocio — gente que ya interactuó
// con su perfil (regla ig_business_profile_all, retención 365
// días, el máximo que Meta da por esta vía). Find-or-create en la
// cuenta de quien pauta (ctx del cliente o la de Posty sin ctx),
// espejo de findLookalikeAudienceId: se busca por el nombre estable
// y solo se crea si no existe. Devuelve el id o null (sin ctx/sin
// ig/sin configuración, o si la lectura falla: el llamador corre
// sin la audiencia y lo declara — jamás un id inventado).
// FRENO HONESTO: crear la audiencia exige que la cuenta haya
// aceptado los Términos de Audiencias Personalizadas de Meta; si
// Meta rechaza la creación por eso (o por permiso), el error se
// propaga marcado (code 'audiencia_terminos', con el detalle de
// Meta adjunto) para que el endpoint frene el impulso con el
// motivo real — sin crear la campaña ni cobrar nada. Cualquier
// otro error de creación devuelve null (degradación declarada).
const ENGAGEMENT_AUDIENCE_RETENTION = 31536000; // 365 días, en segundos
function engagementAudienceName(igUserId) {
  return `Posty · Ya te vieron · IG ${String(igUserId)}`;
}
async function findOrCreateEngagementAudienceId(ctx, igUserId) {
  const ig = String(igUserId || '').trim();
  if (!ig) return null;
  if (ctx ? !(ctx.token && ctx.adAccountId) : !adsConfigured()) return null;
  const nombre = engagementAudienceName(ig);
  try {
    const d = await g(`${act(ctx || null)}/customaudiences`, { params: { fields: 'id,name,subtype', limit: '100' }, ctx: ctx || null });
    const rows = Array.isArray(d && d.data) ? d.data : [];
    const hit = rows.find((r) => r && r.id && String(r.name || '') === nombre);
    if (hit) return String(hit.id);
  } catch (e) { return null; }
  const rule = {
    inclusions: {
      operator: 'or',
      rules: [{
        event_sources: [{ id: ig, type: 'ig_business_profile' }],
        retention_seconds: ENGAGEMENT_AUDIENCE_RETENTION,
        filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'ig_business_profile_all' }] },
      }],
    },
  };
  try {
    const creada = await g(`${act(ctx || null)}/customaudiences`, {
      method: 'POST', ctx: ctx || null,
      params: { name: nombre, subtype: 'ENGAGEMENT', description: 'Posty: personas que ya interactuaron con tu Instagram (365 días)', rule },
    });
    return creada && creada.id ? String(creada.id) : null;
  } catch (e) {
    const m = (e && e.metaError) || null;
    const texto = `${(m && m.message) || ''} ${(m && m.user_msg) || ''} ${(e && e.message) || ''}`;
    if ((m && Number(m.code) === 200) || /custom audience terms|términos de audiencias|accept the terms|debes aceptar/i.test(texto)) {
      const err = new Error(`Meta pide aceptar los Términos de Audiencias Personalizadas antes de crear la audiencia de «los que ya te vieron»: ${detalleErrorMeta(e)}`.slice(0, 600));
      err.code = 'audiencia_terminos';
      err.metaError = m;
      throw err;
    }
    return null;
  }
}

// (LOTE ADS-DESTRABE-VERDAD) El estado REAL de un impulso en Meta:
// el effective_status del aviso (compone campaña y conjunto: un
// aviso ACTIVE bajo una campaña pausada lee CAMPAIGN_PAUSED) y, si
// Meta lo dejó WITH_ISSUES, el motivo de issues_info. Es la fuente
// de la verdad de la tarjeta del panel: sin esta lectura, no se
// afirma que un aviso esté corriendo. Ante cualquier error devuelve
// estado null — el llamador conserva lo persistido y la tarjeta
// cae a «sin confirmar», nunca a una afirmación falsa.
async function leerEstadoRealBoost({ campaignId = '', adsetId = '', adId = '', ctx = null } = {}) {
  const id = adId || campaignId;
  if (!id) return { estado: null, motivo: '' };
  try {
    const d = await g(`/${id}`, { params: { fields: 'effective_status,issues_info' }, ctx });
    const estado = (d && d.effective_status) || null;
    let motivo = '';
    const iss = (d && Array.isArray(d.issues_info)) ? d.issues_info : [];
    if (iss.length) motivo = String(iss[0].error_summary || iss[0].error_message || '').slice(0, 200);
    return { estado, motivo };
  } catch (e) { return { estado: null, motivo: '' }; }
}

// (LOTE ADS-DESTRABE-VERDAD) Pausar una campaña por el camino Graph
// del riel (la reparación del impulso roto la usa: la campaña queda
// en pie para el censo, pero nada puede gastar desde ella).
async function pausarCampanaAds(campaignId, ctx = null) {
  if (!campaignId) return { ok: false, motivo: 'sin_id' };
  try {
    await g(`/${campaignId}`, { method: 'POST', ctx, params: { status: 'PAUSED' } });
    return { ok: true, motivo: '' };
  } catch (e) { return { ok: false, motivo: detalleErrorMeta(e) }; }
}

module.exports = { adsConfigured, checkAdsPermission, checkEligibility, resolvePageId, resolverIgUserIdBoost, createBoost, getBoostStats, getBoostStatsConCtx, statsDesdeRow, diagBoost, verificarActivos, reactivarBoost, listarCampanasPorNombre, leerAnunciosDeCampana, leerAdsetDeCampana, archivarCampana, getAccountCurrency, exchangeUnifiedCode, fetchClientAssets, enumerateAdAccounts, checkClientAdsAccess, resolvePageIdWithToken, searchInterestId, searchGeo, findLookalikeAudienceId, findOrCreateEngagementAudienceId, detalleErrorMeta, leerEstadoRealBoost, pausarCampanaAds };
