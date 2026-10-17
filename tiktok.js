// tiktok.js — Conexión con TikTok (Login Kit) + Content Posting API.
// v1 (2026-10-17): conectar la cuenta y publicar A PEDIDO posteos que ya
// existen en Posty (nunca automático, nunca programado). Sin auditoría de
// Direct Post aprobada por TikTok, todo lo publicado sale SOLO en privado
// (SELF_ONLY) y con cupo bajo de usuarios/día: por eso la privacidad se elige
// desde creator_info (público solo si TikTok lo ofrece para esa cuenta).
// Sin TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET en el entorno, el módulo queda
// inerte: configured() = false y la UI lo muestra como "próximamente".
const TT_API = 'https://open.tiktokapis.com';
const TT_AUTH = 'https://www.tiktok.com/v2/auth/authorize/';
const SCOPES = 'user.info.basic,video.publish,video.upload';

function clientKey() { return process.env.TIKTOK_CLIENT_KEY || ''; }
function clientSecret() { return process.env.TIKTOK_CLIENT_SECRET || ''; }
function configured() { return !!(clientKey() && clientSecret()); }

function buildAuthUrl(redirectUri, state) {
  const q = new URLSearchParams({
    client_key: clientKey(),
    scope: SCOPES,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: state || '',
  });
  return `${TT_AUTH}?${q.toString()}`;
}

// Los errores de la API v2 vienen como {error:{code,message,log_id}}, pero el
// endpoint de OAuth devuelve {error:"<code>", error_description:"..."}.
function ttError(data, fallback) {
  const e = data && data.error;
  let msg = fallback || 'TikTok devolvió un error';
  let code = '';
  if (typeof e === 'string') { code = e; msg = (data && data.error_description) || e; }
  else if (e && e.message) { msg = e.message; code = e.code || ''; }
  const err = new Error(msg);
  err.code = code;
  err.logId = (data && data.log_id) || (e && e.log_id) || '';
  return err;
}

async function oauthToken(form) {
  const body = new URLSearchParams({ client_key: clientKey(), client_secret: clientSecret(), ...form });
  const r = await fetch(`${TT_API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error || !data.access_token) throw ttError(data, `TikTok OAuth ${r.status}`);
  return data;
}

async function exchangeCode(code, redirectUri) {
  return oauthToken({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
}

async function refreshToken(refreshTok) {
  return oauthToken({ grant_type: 'refresh_token', refresh_token: refreshTok });
}

async function fetchUserInfo(accessToken) {
  const r = await fetch(`${TT_API}/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data.error && data.error.code !== 'ok')) throw ttError(data, `TikTok user/info ${r.status}`);
  return (data.data && data.data.user) || {};
}

// ---- Almacenamiento (tabla tiktok_accounts en db.js) ----
function getAccount(db, userId) {
  try {
    const a = db.prepare('SELECT * FROM tiktok_accounts WHERE user_id = ?').get(userId);
    if (!a || !a.access_token) return null;
    return a;
  } catch (e) { return null; }
}

function saveAccount(db, userId, tok, username) {
  const expiresAt = Date.now() + (Number(tok.expires_in) || 86400) * 1000;
  db.prepare(`INSERT INTO tiktok_accounts (user_id, tiktok_user_id, username, access_token, refresh_token, expires_at, scope, updated_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET tiktok_user_id=excluded.tiktok_user_id, username=excluded.username,
      access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at,
      scope=excluded.scope, updated_at=datetime('now')`)
    .run(userId, tok.open_id || '', username || '', tok.access_token || '', tok.refresh_token || '', expiresAt, tok.scope || '');
}

function deleteAccount(db, userId) {
  try { db.prepare('DELETE FROM tiktok_accounts WHERE user_id = ?').run(userId); } catch (e) { /* tabla nueva */ }
}

// Token vigente: refresca solo si está por vencer (< 5 min de margen).
async function getValidToken(db, userId) {
  const a = getAccount(db, userId);
  if (!a) return null;
  if (a.expires_at && a.expires_at - Date.now() > 5 * 60 * 1000) return a.access_token;
  if (!a.refresh_token) return a.access_token;
  const tok = await refreshToken(a.refresh_token);
  saveAccount(db, userId, { ...tok, open_id: tok.open_id || a.tiktok_user_id }, a.username);
  return tok.access_token;
}

async function ttPost(accessToken, path, payload) {
  const r = await fetch(TT_API + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data.error && data.error.code !== 'ok')) throw ttError(data, `TikTok ${path} ${r.status}`);
  return data.data || {};
}

// Info del creador: de acá salen los privacy_level_options válidos para la
// cuenta. Sin auditoría, TikTok solo ofrece SELF_ONLY — se respeta tal cual.
async function creatorInfo(accessToken) {
  return ttPost(accessToken, '/v2/post/publish/creator_info/query/', {});
}

async function pickPrivacy(accessToken) {
  try {
    const info = await creatorInfo(accessToken);
    const opts = Array.isArray(info.privacy_level_options) ? info.privacy_level_options : [];
    if (opts.includes('PUBLIC_TO_EVERYONE')) return 'PUBLIC_TO_EVERYONE';
    if (opts.includes('SELF_ONLY')) return 'SELF_ONLY';
    if (opts.length) return opts[0];
  } catch (e) { /* cae al default seguro */ }
  return 'SELF_ONLY';
}

// Direct Post de video desde una URL pública de nuestro dominio verificado.
async function publishVideo({ accessToken, videoUrl, title }) {
  if (!videoUrl) throw new Error('Falta la URL del video');
  const privacy = await pickPrivacy(accessToken);
  const data = await ttPost(accessToken, '/v2/post/publish/video/init/', {
    post_info: {
      title: String(title || '').slice(0, 2200),
      privacy_level: privacy,
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000,
    },
    source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
  });
  if (!data.publish_id) throw new Error('TikTok no devolvió el id de publicación');
  return { publishId: data.publish_id, privacyLevel: privacy };
}

// Direct Post de foto(s): endpoint distinto (/content/init/), solo PULL_FROM_URL.
async function publishPhoto({ accessToken, imageUrls, title, description }) {
  const urls = (imageUrls || []).filter(Boolean).slice(0, 35);
  if (!urls.length) throw new Error('No hay imágenes para publicar');
  const privacy = await pickPrivacy(accessToken);
  const data = await ttPost(accessToken, '/v2/post/publish/content/init/', {
    post_info: {
      title: String(title || '').slice(0, 90),
      description: String(description || '').slice(0, 4000),
      privacy_level: privacy,
      disable_comment: false,
      auto_add_music: true,
    },
    source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: urls },
    post_mode: 'DIRECT_POST',
    media_type: 'PHOTO',
  });
  if (!data.publish_id) throw new Error('TikTok no devolvió el id de publicación');
  return { publishId: data.publish_id, privacyLevel: privacy };
}

async function publishStatus(accessToken, publishId) {
  const data = await ttPost(accessToken, '/v2/post/publish/status/fetch/', { publish_id: publishId });
  return {
    status: data.status || '',
    failReason: data.fail_reason || '',
    // Sí: el campo de TikTok se escribe "publicaly" (sic) en su API.
    postId: (data.publicaly_available_post_id || [])[0] || '',
  };
}

module.exports = {
  configured, buildAuthUrl, exchangeCode, refreshToken, fetchUserInfo,
  getAccount, saveAccount, deleteAccount, getValidToken,
  creatorInfo, publishVideo, publishPhoto, publishStatus, SCOPES,
};
