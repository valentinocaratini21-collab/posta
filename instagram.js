// Cliente de Instagram — Posta
// Modo demo: simula la publicación (ideal para probar sin aprobación de Meta).
// Modo real: usa la Instagram Graph API (requiere cuenta Business/Creator
// vinculada a una Página de Facebook y una app de Meta aprobada).

const API_VERSION = 'v21.0';

function getAuthUrl(appId, redirectUri, state) {
  const scope = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ].join(',');
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope,
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/${API_VERSION}/dialog/oauth?${params}`;
}

async function exchangeCode(appId, appSecret, redirectUri, code) {
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token?${params}`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  // Token de larga duración (60 días)
  const longParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: data.access_token,
  });
  const longRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/oauth/access_token?${longParams}`
  );
  return longRes.json();
}

async function findIgAccount(accessToken) {
  // Páginas del usuario → cuenta de Instagram Business vinculada
  const pagesRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${accessToken}`
  );
  const pages = await pagesRes.json();
  if (pages.error) throw new Error(pages.error.message);
  for (const page of pages.data || []) {
    if (page.instagram_business_account) {
      return {
        pageId: page.id,
        igUserId: page.instagram_business_account.id,
        igUsername: page.instagram_business_account.username,
      };
    }
  }
  throw new Error(
    'No encontramos una cuenta de Instagram Business vinculada a tus Páginas de Facebook.'
  );
}

async function publishReal({ imageUrl, caption }, { igUserId, accessToken }) {
  // Paso 1: crear el contenedor
  const createRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${igUserId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );
  const created = await createRes.json();
  if (created.error) throw new Error(created.error.message);

  // Paso 2: publicar el contenedor
  const pubRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${igUserId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: created.id,
        access_token: accessToken,
      }),
    }
  );
  const published = await pubRes.json();
  if (published.error) throw new Error(published.error.message);

  // Paso 3: obtener el permalink
  const mediaRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${published.id}?fields=permalink&access_token=${accessToken}`
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
  const createRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${igUserId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );
  const created = await createRes.json();
  if (created.error) throw new Error(created.error.message);
  if (!created.id) throw new Error('Meta no devolvió el contenedor del reel');

  // Esperar procesamiento (puede tardar ~1-2 min)
  let status = '';
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const stRes = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${created.id}?fields=status_code&access_token=${accessToken}`
    );
    const st = await stRes.json();
    status = st.status_code || '';
    if (status === 'FINISHED') break;
    if (status === 'ERROR') throw new Error('Meta no pudo procesar el video');
  }
  if (status !== 'FINISHED') throw new Error('El video tardó demasiado en procesarse en Meta');

  const pubRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${igUserId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: created.id, access_token: accessToken }),
    }
  );
  const published = await pubRes.json();
  if (published.error) throw new Error(published.error.message);

  const mediaRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${published.id}?fields=permalink&access_token=${accessToken}`
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

module.exports = { getAuthUrl, exchangeCode, findIgAccount, publishPost, publishVideo };
