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
  return (await getIgProfile(igUserId, accessToken)).username;
}

// Perfil básico + tipo de cuenta (para detectar cuentas personales).
// Si la versión de la API no expone account_type, se reintenta sin ese campo.
// Si el ID numérico no se resuelve con el token, se usa /me.
async function getIgProfile(igUserId, accessToken) {
  const lookup = async (uid, fields) => {
    const params = new URLSearchParams({ fields, access_token: accessToken });
    const res = await fetch(`${IG_HOST}/${API_VERSION}/${uid}?${params}`);
    return res.json();
  };
  let data = await lookup(igUserId, 'username,account_type');
  if (data.error && /account_type/i.test(data.error.message || '')) {
    data = await lookup(igUserId, 'username');
  }
  if (data.error && /unsupported get request/i.test(data.error.message || '')) {
    console.error('[ig] numeric id failed, trying /me:', JSON.stringify(data.error));
    data = await lookup('me', 'username,account_type');
    if (data.error && /account_type/i.test(data.error.message || '')) {
      data = await lookup('me', 'username');
    }
  }
  if (data.error) {
    console.error('[ig] getIgProfile failed:', JSON.stringify(data.error));
    throw new Error(data.error.message || 'Error de Meta');
  }
  return { username: data.username || '', accountType: data.account_type || '', userId: data.id ? String(data.id) : igUserId };
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

// ---------- Historias ----------
// Publicación real: crear el contenedor STORIES, esperar y publicar.
async function publishStoryReal({ imageUrl }, { igUserId, accessToken }) {
  const createRes = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      media_type: 'STORIES',
      access_token: accessToken,
    }),
  });
  const created = await createRes.json();
  if (created.error) throw new Error(created.error.message);
  if (!created.id) throw new Error('Meta no devolvió el contenedor de la historia');

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
  if (status !== 'FINISHED') throw new Error('Instagram tardó demasiado en procesar la historia. Probá de nuevo.');

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
  return { success: true, permalink: '', mediaId: published.id };
}

async function publishStory(media, creds, demoMode) {
  if (demoMode) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeId = Math.random().toString(36).slice(2, 10);
    return {
      success: true,
      permalink: '',
      mediaId: `demo_${fakeId}`,
      demo: true,
    };
  }
  if (!creds.igUserId || !creds.accessToken) {
    throw new Error('Instagram no conectado. Conectá tu cuenta en Ajustes.');
  }
  return publishStoryReal(media, creds);
}

// ---------- Carrusel (2-10 imágenes) ----------
// API de Meta: un contenedor por imagen hija (is_carousel_item), después el
// contenedor CAROUSEL con children[], esperar FINISHED y publicar.
async function publishCarouselReal({ imageUrls, caption }, { igUserId, accessToken }) {
  let urls = (Array.isArray(imageUrls) ? imageUrls : []).filter(Boolean);
  if (urls.length < 2) throw new Error('El carrusel necesita al menos 2 imágenes');
  urls = urls.slice(0, 10);
  const children = [];
  for (const url of urls) {
    const r = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: accessToken }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    if (!j.id) throw new Error('Meta no devolvió el contenedor de la imagen');
    children.push(j.id);
  }
  const cRes = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'CAROUSEL', children, caption, access_token: accessToken }),
  });
  const created = await cRes.json();
  if (created.error) throw new Error(created.error.message);
  if (!created.id) throw new Error('Meta no devolvió el contenedor del carrusel');
  let status = '';
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const stRes = await fetch(`${IG_HOST}/${API_VERSION}/${created.id}?fields=status_code&access_token=${accessToken}`);
    const st = await stRes.json();
    status = st.status_code || '';
    if (status === 'FINISHED') break;
    if (status === 'ERROR') throw new Error('Instagram no pudo procesar el carrusel.');
  }
  if (status !== 'FINISHED') throw new Error('Instagram tardó demasiado en procesar el carrusel. Probá de nuevo.');
  const pubRes = await fetch(`${IG_HOST}/${API_VERSION}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
  });
  const published = await pubRes.json();
  if (published.error) throw new Error(published.error.message);
  const mediaRes = await fetch(`${IG_HOST}/${API_VERSION}/${published.id}?fields=permalink&access_token=${accessToken}`);
  const media = await mediaRes.json();
  return { success: true, permalink: media.permalink || '', mediaId: published.id };
}

async function publishCarousel(media, creds, demoMode) {
  if (demoMode) {
    await new Promise((r) => setTimeout(r, 1200));
    const fakeId = Math.random().toString(36).slice(2, 10);
    return {
      success: true,
      permalink: `https://www.instagram.com/p/demo_${fakeId}/`,
      mediaId: `demo_${fakeId}`,
      demo: true,
    };
  }
  if (!creds.igUserId || !creds.accessToken) {
    throw new Error('Instagram no conectado. Conectá tu cuenta en Ajustes.');
  }
  return publishCarouselReal(media, creds);
}

// ---------- Análisis del Instagram actual ----------
// Trae los últimos 20 posteos y resume qué rinde: la IA conoce la cuenta
// desde el día uno. Nunca rompe: try/catch amplio, "" sin datos.
async function analyzeInstagram(igUserId, accessToken) {
  try {
    if (!igUserId || !accessToken) return { summary: '' };
    const url = `${IG_HOST}/${API_VERSION}/${igUserId}/media?fields=caption,like_count,comments_count,media_type,timestamp&limit=20&access_token=${accessToken}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { summary: '' };
    const data = await res.json();
    const items = Array.isArray(data.data) ? data.data : [];
    if (!items.length) return { summary: '' };
    const ranked = items
      .map(m => ({ ...m, eng: (Number(m.like_count) || 0) + (Number(m.comments_count) || 0) }))
      .sort((a, b) => b.eng - a.eng);
    const typeName = t => (t === 'CAROUSEL_ALBUM' ? 'carrusel' : t === 'VIDEO' ? 'reel' : 'posteo');
    const topDesc = ranked.slice(0, 3).map(m => {
      const cap = String(m.caption || '').split('\n')[0].slice(0, 50).trim() || 'sin texto';
      return `${typeName(m.media_type)} "${cap}"`;
    }).join('; ');
    // Frecuencia semanal aproximada
    let freq = '';
    const times = items.map(m => new Date(m.timestamp).getTime()).filter(t => !isNaN(t));
    if (times.length >= 2) {
      const spanDays = Math.max(1, (Math.max(...times) - Math.min(...times)) / 86400000);
      const perWeek = (items.length / spanDays) * 7;
      const n = Math.round(perWeek);
      freq = n >= 1
        ? `Solés publicar ${n} ${n === 1 ? 'vez' : 'veces'} por semana`
        : 'Solés publicar menos de 1 vez por semana';
    }
    let summary = `En tu Instagram: tus posteos con más engagement son: ${topDesc}.`;
    if (freq) summary += ` ${freq}.`;
    return { summary };
  } catch (e) {
    return { summary: '' };
  }
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  getIgUsername,
  getIgProfile,
  refreshLongLivedToken,
  publishPost,
  publishVideo,
  publishStory,
  publishCarousel,
  analyzeInstagram,
};
