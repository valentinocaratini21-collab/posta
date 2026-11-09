'use strict';
// ig-profile.js — Perfil REAL por API (REDISEÑO RS-3 · FEED REAL, 9/11).
//
// Por qué existe: la lectura pública de Instagram (embed) ya no trae
// foto, bio ni números — las páginas públicas sirven un shell de login
// sin datos, y cada refresh guardaba nulls (la «P» del feed, la bio
// que era el <title> de la página, los conteos en blanco; diagnóstico
// 9/11 21:15). Esta pieza trae el perfil por la API oficial para la
// CUENTA CONECTADA del cliente (su propio perfil, que es lo que muestra
// el Feed): el mismo nodo de usuario que ya leen ig-follows e ig-media,
// misma versión de API, mismo token guardado, sin permisos nuevos ni
// re-conexión.
//
// Campos: username, profile_picture_url, biography, followers_count,
// follows_count, media_count. Si Meta no devuelve un campo (permiso,
// token, cuenta no profesional), se reintenta sin ese campo; si la API
// falla del todo, devuelve null y la home queda EXACTAMENTE como hoy
// (solo embed). Nunca lanza. Sin caché a propósito: el servidor llama
// a esto SOLO dentro de homeProfileReadAndStore (refresh de perfil:
// manual, pull-to-refresh o TTL vencido), y el valor queda cacheado en
// el snapshot ig_home_snapshot hasta el próximo refresh. Nunca se llama
// por render ni por tile ni por scroll.
const IG_HOST = 'https://graph.instagram.com';
const API_VERSION = 'v26.0';
const FETCH_TIMEOUT_MS = 15000;

function numOrNull(v) {
  return (typeof v === 'number' && Number.isFinite(v) ? v : null);
}
function strOrNull(v) {
  const s = String(v || '').trim();
  return s ? s : null;
}

// Lee el perfil completo del nodo del usuario conectado.
// Nunca lanza: cualquier fallo -> null.
// fetchFn inyectable (los tests la pasan; en producción es fetch).
async function fetchIgProfileFull(opts) {
  try {
    const o = opts || {};
    const igUserId = o.igUserId, accessToken = o.accessToken;
    if (!igUserId || !accessToken) return null;
    const fetchFn = o.fetchFn || fetch;
    const lookup = async (uid, fields) => {
      const params = new URLSearchParams({ fields, access_token: accessToken });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
      let d = null;
      try {
        const res = await fetchFn(IG_HOST + '/' + API_VERSION + '/' + encodeURIComponent(String(uid)) + '?' + params, { signal: ctl.signal });
        d = await res.json();
      } finally { clearTimeout(timer); }
      return d;
    };
    // Intento 1: todos los campos. Si Meta rechaza alguno, se reintenta
    // sin foto/bio (solo conteos) y después solo con el username.
    let d = await lookup(igUserId, 'username,profile_picture_url,biography,followers_count,follows_count,media_count');
    if (d && d.error) {
      const msg = String((d.error && d.error.message) || '');
      if (/profile_picture_url|biography|followers_count|follows_count|media_count/i.test(msg)) {
        d = await lookup(igUserId, 'username,followers_count,follows_count,media_count');
      }
    }
    if (d && d.error) {
      const msg = String((d.error && d.error.message) || '');
      if (/followers_count|follows_count|media_count/i.test(msg)) {
        d = await lookup(igUserId, 'username');
      }
    }
    if (d && d.error && /unsupported get request/i.test(String(d.error.message || ''))) {
      d = await lookup('me', 'username,profile_picture_url,biography,followers_count,follows_count,media_count');
      if (d && d.error) d = await lookup('me', 'username');
    }
    if (!d || d.error) return null;
    // Guarda de identidad: el token tiene que ser de la cuenta mostrada.
    if (o.expectedHandle) {
      const un = String(d.username || '').replace(/^@/, '').trim().toLowerCase();
      const eh = String(o.expectedHandle || '').replace(/^@/, '').trim().toLowerCase();
      if (!un || un !== eh) return null;
    }
    if (!d.username) return null;
    return {
      username: String(d.username || '').replace(/^@/, ''),
      pic: strOrNull(d.profile_picture_url),
      bio: strOrNull(d.biography),
      followers: numOrNull(d.followers_count),
      following: numOrNull(d.follows_count),
      postsCount: numOrNull(d.media_count),
    };
  } catch (e) { return null; }
}

module.exports = { fetchIgProfileFull };
