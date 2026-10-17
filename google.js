// google.js — Conexión con Google Business Profile (OAuth) + reseñas.
// v1 (2026-10-17): conectar la ficha del negocio y responder reseñas con la
// respuesta sugerida en un toque (espejo de las bandejas de comentarios/DMs).
// La Business Profile API NO es pública: el proyecto de Google Cloud arranca
// con cuota 0 hasta que Google aprueba el formulario de acceso (ver
// equipo-posty/hidden_files/google-acceso-api.md). Sin GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET en el entorno, el módulo queda inerte:
// configured() = false y la UI lo muestra como "próximamente".
// Superficie verificada contra la doc oficial (2026-10-17): las cuentas viven
// en mybusinessaccountmanagement.googleapis.com, las fichas (locations) en
// mybusinessbusinessinformation.googleapis.com, y las reseñas + respuestas
// quedaron en el legacy mybusiness.googleapis.com/v4. Un solo scope
// (business.manage) cubre las tres.
const { URLSearchParams } = require('url');
const ACCT_API = 'https://mybusinessaccountmanagement.googleapis.com';
const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com';
const V4_API = 'https://mybusiness.googleapis.com';
const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
// business.manage es el scope del producto; openid+email solo identifican la
// cuenta conectada (google_user_id/email de google_accounts).
const SCOPES = 'openid email https://www.googleapis.com/auth/business.manage';
const STAR_NUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function clientId() { return process.env.GOOGLE_CLIENT_ID || ''; }
function clientSecret() { return process.env.GOOGLE_CLIENT_SECRET || ''; }
function configured() { return !!(clientId() && clientSecret()); }

function buildAuthUrl(redirectUri, state) {
  const q = new URLSearchParams({
    client_id: clientId(),
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: state || '',
    access_type: 'offline', // refresh_token: la conexión no debe vencer a la semana
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${OAUTH_AUTH}?${q.toString()}`;
}

// Los errores de Google vienen como {error:{code,message,status}} en las APIs
// y como {error:"<code>", error_description:"..."} en el endpoint de tokens.
function gError(data, fallback) {
  const e = data && data.error;
  let msg = fallback || 'Google devolvió un error';
  let code = '';
  if (typeof e === 'string') { code = e; msg = (data && data.error_description) || e; }
  else if (e && e.message) { msg = e.message; code = e.status || String(e.code || ''); }
  const err = new Error(msg);
  err.code = code;
  return err;
}

async function oauthToken(form) {
  const body = new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...form });
  const r = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error || !data.access_token) throw gError(data, `Google OAuth ${r.status}`);
  return data;
}

async function exchangeCode(code, redirectUri) {
  return oauthToken({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
}

async function refreshToken(refreshTok) {
  return oauthToken({ grant_type: 'refresh_token', refresh_token: refreshTok });
}

async function fetchUserInfo(accessToken) {
  const r = await fetch(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw gError(data, `Google userinfo ${r.status}`);
  return data; // {sub, email, name, ...}
}

async function gGet(accessToken, url) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data.error && data.error.message)) throw gError(data, `Google ${r.status}`);
  return data;
}

// Cuentas de Business Profile a las que la persona tiene acceso.
// Devuelve [{name:'accounts/123', accountName, type}]
async function listAccounts(accessToken) {
  const data = await gGet(accessToken, `${ACCT_API}/v1/accounts?pageSize=20`);
  return Array.isArray(data.accounts) ? data.accounts : [];
}

// Fichas de una cuenta. El name viene como 'locations/456' y el título del
// negocio en `title`. Devuelve [{name:'locations/456', title}]
async function listLocations(accessToken, accountName) {
  const q = new URLSearchParams({ readMask: 'name,title,storefrontAddress', pageSize: '50' });
  const data = await gGet(accessToken, `${INFO_API}/v1/${accountName}/locations?${q.toString()}`);
  return Array.isArray(data.locations) ? data.locations : [];
}

// Nombre v4 completo de una ficha: accounts/123/locations/456.
function v4LocationName(accountName, location) {
  const loc = String((location && location.name) || '');
  if (!loc) return '';
  return loc.startsWith('accounts/') ? loc : `${accountName}/${loc}`;
}

// Reseñas de una ficha (v4 legacy). Sigue nextPageToken con tope de páginas.
// Devuelve el array crudo de la API: {reviewId, name, reviewer{ displayName },
// starRating:'ONE'..'FIVE', comment, createTime, reviewReply?}
async function listReviews(accessToken, accountName, locationName, maxPages = 3) {
  const out = [];
  let pageToken = '';
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
    if (pageToken) q.set('pageToken', pageToken);
    const data = await gGet(accessToken, `${V4_API}/v4/${locationName}/reviews?${q.toString()}`);
    if (Array.isArray(data.reviews)) out.push(...data.reviews);
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  return out;
}

// Responder (o reemplazar la respuesta de) una reseña: PUT .../reviews/{id}/reply
async function replyToReview(accessToken, accountName, locationName, reviewId, comment) {
  const r = await fetch(`${V4_API}/v4/${locationName}/reviews/${encodeURIComponent(reviewId)}/reply`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: String(comment || '').slice(0, 4096) }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data.error && data.error.message)) throw gError(data, `Google reply ${r.status}`);
  return data;
}

// ---- Almacenamiento (tabla google_accounts en db.js) ----
function getAccount(db, userId) {
  try {
    const a = db.prepare('SELECT * FROM google_accounts WHERE user_id = ?').get(userId);
    if (!a || !a.access_token) return null;
    return a;
  } catch (e) { return null; }
}

function saveAccount(db, userId, tok, info) {
  const prev = getAccount(db, userId) || {};
  const expiresAt = Date.now() + (Number(tok.expires_in) || 3600) * 1000;
  db.prepare(`INSERT INTO google_accounts (user_id, google_user_id, email, access_token, refresh_token, expires_at, account_name, location_name, location_title, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET google_user_id=excluded.google_user_id, email=excluded.email,
      access_token=excluded.access_token,
      refresh_token=CASE WHEN excluded.refresh_token != '' THEN excluded.refresh_token ELSE google_accounts.refresh_token END,
      expires_at=excluded.expires_at, account_name=excluded.account_name, location_name=excluded.location_name,
      location_title=excluded.location_title, updated_at=datetime('now')`)
    .run(
      userId,
      (info && info.googleUserId) || prev.google_user_id || '',
      (info && info.email) || prev.email || '',
      tok.access_token || '',
      tok.refresh_token || '',
      expiresAt,
      (info && info.accountName) || prev.account_name || '',
      (info && info.locationName) || prev.location_name || '',
      (info && info.locationTitle) || prev.location_title || ''
    );
}

function deleteAccount(db, userId) {
  try { db.prepare('DELETE FROM google_accounts WHERE user_id = ?').run(userId); } catch (e) { /* tabla nueva */ }
}

// Token vigente: refresca solo si está por vencer (< 5 min de margen).
async function getValidToken(db, userId) {
  const a = getAccount(db, userId);
  if (!a) return null;
  if (a.expires_at && a.expires_at - Date.now() > 5 * 60 * 1000) return a.access_token;
  if (!a.refresh_token) return a.access_token;
  const tok = await refreshToken(a.refresh_token);
  saveAccount(db, userId, { ...tok, refresh_token: tok.refresh_token || a.refresh_token }, {});
  return tok.access_token;
}

// Resuelve la ficha del negocio: primera cuenta con al menos una ficha.
// Devuelve {accountName, locationName, locationTitle} o null.
async function resolveBusiness(accessToken) {
  const accounts = await listAccounts(accessToken);
  for (const acc of accounts) {
    let locs = [];
    try { locs = await listLocations(accessToken, acc.name); } catch (e) { continue; }
    if (locs.length) {
      return {
        accountName: acc.name,
        locationName: v4LocationName(acc.name, locs[0]),
        locationTitle: locs[0].title || acc.accountName || '',
      };
    }
  }
  return null;
}

// ---- Sugerencia de respuesta según las estrellas (reglas de tono duras) ----
// suggestReply (generator.js) es el mismo contrato de comentarios/DMs; acá se
// le pasa el contexto de reseña de Google en el commentText: las de 1-2
// estrellas exigen empatía + invitar a resolver por privado, sin defensiva y
// sin inventar datos ni compensaciones; las de 5, agradecimiento cálido.
async function suggestReviewReply(suggestFn, apiKey, profile, rv) {
  const stars = rv.star_rating || 0;
  const who = rv.reviewer || 'un cliente';
  const text = String(rv.text || '').trim();
  let ctx;
  if (stars > 0 && stars <= 2) {
    ctx = `[Reseña de Google de ${stars} estrella${stars === 1 ? '' : 's'} de ${who}. Respondé como respuesta PÚBLICA del negocio: empática, pedí disculpas por la experiencia sin ponerte a la defensiva ni discutir, e invitá a seguir la conversación por privado para resolverlo. PROHIBIDO inventar datos, precios o compensaciones.]`;
  } else if (stars >= 5) {
    ctx = `[Reseña de Google de 5 estrellas de ${who}. Respondé como respuesta PÚBLICA del negocio: agradecé con calidez y, si el cliente escribió algo, retomá un detalle específico de lo que dijo.]`;
  } else {
    ctx = `[Reseña de Google de ${stars} estrellas de ${who}. Respondé como respuesta PÚBLICA del negocio, con calidez y sin inventar datos.]`;
  }
  const commentText = (text ? `${ctx} Reseña: "${text.slice(0, 220)}"` : `${ctx} El cliente no escribió texto, solo dejó la calificación.`);
  try {
    const s = await suggestFn(
      { business: profile.business_name, category: profile.category, tone: profile.tone, username: who, commentText },
      apiKey
    );
    if (s && String(s).trim()) return String(s).slice(0, 300);
  } catch (e) { /* cae al fallback */ }
  if (stars > 0 && stars <= 2) return 'Lamentamos mucho tu experiencia 🙏 Nos importa de verdad resolverlo: ¿nos escribís por privado y lo vemos juntos?';
  if (stars >= 5) return '¡Mil gracias por tus 5 estrellas! ⭐ Nos alegra muchísimo que hayas tenido una buena experiencia 🙌';
  return '¡Gracias por tu reseña! 🙌 Tu opinión nos ayuda a seguir mejorando.';
}

// ---- Sync de reseñas: espejo de syncComments/syncDMs ----
// Baja las reseñas de la ficha conectada (últimos 30 días, sin respuesta del
// negocio), genera la sugerida y las deja pending. Devuelve cuántas nuevas.
async function syncReviews(db, userId, suggestFn, apiKey) {
  const acc = getAccount(db, userId);
  if (!acc) return 0;
  const accessToken = await getValidToken(db, userId);
  if (!accessToken) return 0;
  let accountName = acc.account_name || '';
  let locationName = acc.location_name || '';
  if (!accountName || !locationName) {
    const biz = await resolveBusiness(accessToken).catch(() => null);
    if (!biz) return 0;
    accountName = biz.accountName; locationName = biz.locationName;
    saveAccount(db, userId, { access_token: accessToken, expires_in: Math.max(60, Math.round(((acc.expires_at || Date.now()) - Date.now()) / 1000)) }, biz);
  }
  const profile = db.prepare('SELECT business_name, category, tone FROM profiles WHERE user_id = ?').get(userId) || {};
  let reviews;
  try {
    reviews = await listReviews(accessToken, accountName, locationName);
  } catch (e) { console.error('[reviews] list:', e.message); return 0; }
  let fresh = 0;
  const since = Date.now() - 30 * 86400000;
  for (const rv of reviews) {
    if (fresh >= 20) break;
    if (!rv || !rv.reviewId) continue;
    if (rv.reviewReply && rv.reviewReply.comment) continue; // el negocio ya respondió
    if (rv.createTime && new Date(rv.createTime).getTime() < since) continue;
    const exists = db.prepare('SELECT id FROM review_queue WHERE google_review_id = ?').get(rv.reviewId);
    if (exists) continue;
    const row = {
      reviewer: String((rv.reviewer && rv.reviewer.displayName) || 'Un cliente').slice(0, 120),
      star_rating: STAR_NUM[rv.starRating] || 0,
      text: String(rv.comment || '').slice(0, 500),
    };
    const suggested = await suggestReviewReply(suggestFn, apiKey, profile, row);
    db.prepare(
      `INSERT INTO review_queue (user_id, google_review_id, reviewer, star_rating, text, suggested, status) VALUES (?,?,?,?,?,?, 'pending')`
    ).run(userId, rv.reviewId, row.reviewer, row.star_rating, row.text, String(suggested).slice(0, 300));
    fresh++;
  }
  return fresh;
}

// Manda la respuesta a Google y marca las filas del mismo autor como replied
// (mismo criterio que sendDM con ig_sender_id).
async function sendReviewReply(db, userId, row, message) {
  const acc = getAccount(db, userId);
  if (!acc) throw new Error('Google no conectado');
  if (!acc.account_name || !acc.location_name) throw new Error('Google no conectado');
  const accessToken = await getValidToken(db, userId);
  if (!accessToken) throw new Error('Google no conectado');
  await replyToReview(accessToken, acc.account_name, acc.location_name, row.google_review_id, message);
  db.prepare(`UPDATE review_queue SET status='replied' WHERE id = ? AND user_id = ?`).run(row.id, userId);
  return true;
}

module.exports = {
  configured, buildAuthUrl, exchangeCode, refreshToken, fetchUserInfo,
  listAccounts, listLocations, listReviews, replyToReview,
  getAccount, saveAccount, deleteAccount, getValidToken,
  resolveBusiness, syncReviews, sendReviewReply, SCOPES,
};
