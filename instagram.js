// Cliente de Instagram — Posta
// Modo demo: simula la publicación (ideal para probar sin aprobación de Meta).
// Modo real: usa la Instagram API con Instagram Login (Business Login).
// Requiere una cuenta profesional (Business o Creator) de Instagram y una app
// de Meta aprobada. NO requiere Página de Facebook.

const API_VERSION = 'v26.0';
const IG_HOST = 'https://graph.instagram.com';

// ---------- OAuth: Instagram Login (Business Login) ----------
// El usuario autoriza desde la Embed URL que genera el dashboard de Meta
// (App → caso de uso Instagram → "API setup with Instagram login").
// Esa URL ya trae client_id, redirect_uri y los permisos configurados.
function getAuthUrl(embedUrl, state) {
  const sep = embedUrl.includes('?') ? '&' : '?';
  return `${embedUrl}${sep}state=${encodeURIComponent(state)}`;
}

// Paso 1: canjear el code por un token de corta duración + user ID
// Paso 2: canjearlo por un token de larga duración (60 días)
async function exchangeCodeForTokens(appId, appSecret, redirectUri, code) {
  const form = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });
  const shortRes = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const short = await shortRes.json();
  if (short.error_message) throw new Error(short.error_message);
  if (short.error) throw new Error(short.error.message || 'Error al canjear el código');
  if (!short.access_token || !short.user_id) throw new Error('Meta no devolvió token ni user ID');

  const longParams = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: appSecret,
    access_token: short.access_token,
  });
  const longRes = await fetch(`https://graph.instagram.com/access_token?${longParams}`);
  const long = await longRes.json();
  if (long.error) throw new Error(long.error.message || 'Error al obtener el token de larga duración');
  if (!long.access_token) throw new Error('Meta no devolvió el token de larga duración');

  return { accessToken: long.access_token, igUserId: String(short.user_id) };
}

async function getIgUsername(igUserId, accessToken) {
  const params = new URLSearchParams({ fields: 'username', access_token: accessToken });
  const res = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.username || '';
}

// Refresca un token de larga duración (válido 60 días, se refresca a los 50)
async function refreshLongLivedToken(accessToken) {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: accessToken,
  });
  const res = await fetch(`${IG_HOST}/refresh_access_token?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Error de Meta');
  if (!data.access_token) throw new Error('Meta no devolvió un token nuevo');
  return data.access_token;
}

async function publishReal({ imageUrl, caption }, { igUserId, accessToken }) {
  // Paso 1: crear el contenedor
  const createRes = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  });
  const created = await createRes.json();
  if (created.error) throw new Error(created.error.message);
  if (!created.id) throw new Error('Meta no devolvió el contenedor de la imagen');

  // Esperar que Instagram termine de procesar el contenedor (descarga la imagen
  // de forma asíncrona; publicar antes da "media ID no disponible").
  let status = '';
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const stRes = await fetch(
      `${IG_HOST}/${API_VERSION}/${created.id}?fields=status_code&access_token=${accessToken}`
    );
    const st = await stRes.json();
    status = st.status_code || '';
    if (status === 'FINISHED') break;
    if (status === 'ERROR')
      throw new Error('Instagram no pudo descargar la imagen. Revisá que la URL sea pública: ' + imageUrl);
  }
  if (status !== 'FINISHED') throw new Error('Instagram tardó demasiado en procesar la imagen. Probá de nuevo.');

  // Paso 2: publicar el contenedor
  const pubRes = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: created.id,
      access_token: accessToken,
    }),
  });
  const published = await pubRes.json();
  if (published.error) throw new Error(published.error.message);

  // Paso 3: obtener el permalink
  const mediaRes = await fetch(
    `${IG_HOST}/${API_VERSION}/${published.id}?fields=permalink&access_token=${accessToken}`
  );
  const media = await mediaRes.json();
  return { success: true, permalink: media.permalink || '', mediaId: published.id };
}

async function publishDemo({ caption }) {
  // Simula latencia de red
  await new Promise((r) => setTimeout(r, 1200));
  const fakeId = Math.random().toString(36).slice(2, 10);
  return {
    success: true,
    permalink: `https://www.instagram.com/p/demo_${fakeId}/`,
    mediaId: `demo_${fakeId}`,
    demo: true,
  };
}

async function publishPost(media, creds, demoMode) {
  if (demoMode) return publishDemo(media);
  if (!creds.igUserId || !creds.accessToken) {
    throw new Error('Instagram no conectado. Conectá tu cuenta en Ajustes.');
  }
  return publishReal(media, creds);
}

// ---------- Video / Reels ----------
// Publicación real en dos pasos: crear el contenedor REEL, esperar que Meta
// termine de procesarlo, y publicarlo.
async function publishVideoReal({ videoUrl, caption }, { igUserId, accessToken }) {
  const createRes = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      access_token: accessToken,
    }),
  });
  const created = await createRes.json();
  if (created.error) throw new Error(created.error.message);
  if (!created.id) throw new Error('Meta no devolvió el contenedor del reel');

  // Esperar procesamiento (puede tardar ~1-2 min)
  let status = '';
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const stRes = await fetch(
      `${IG_HOST}/${API_VERSION}/${created.id}?fields=status_code&access_token=${accessToken}`
    );
    const st = await stRes.json();
    status = st.status_code || '';
    if (status === 'FINISHED') break;
    if (status === 'ERROR') throw new Error('Meta no pudo procesar el video');
  }
  if (status !== 'FINISHED') throw new Error('El video tardó demasiado en procesarse en Meta');

  const pubRes = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
  });
  const published = await pubRes.json();
  if (published.error) throw new Error(published.error.message);

  const mediaRes = await fetch(
    `${IG_HOST}/${API_VERSION}/${published.id}?fields=permalink&access_token=${accessToken}`
  );
  const media = await mediaRes.json();
  return { success: true, permalink: media.permalink || '', mediaId: published.id };
}

async function publishVideo(media, creds, demoMode) {
  if (demoMode) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeId = Math.random().toString(36).slice(2, 10);
    return {
      success: true,
      permalink: `https://www.instagram.com/reel/demo_${fakeId}/`,
      mediaId: `demo_${fakeId}`,
      demo: true,
    };
  }
  if (!creds.igUserId || !creds.accessToken) {
    throw new Error('Instagram no conectado. Conectá tu cuenta en Ajustes.');
  }
  return publishVideoReal(media, creds);
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getIgUsername,
  refreshLongLivedToken,
  publishPost,
  publishVideo,
};
