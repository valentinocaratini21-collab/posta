'use strict';
// ig-follows.js — Seguidos por API (lote 1/11, pedido de Valentino).
// El embed público de IG NO trae seguidos (sin following_count, edge_follow
// ni follows_count): la cabecera los muestra solo cuando algún perfil trae
// el dato. Esta pieza trae el dato por la API oficial para la CUENTA
// CONECTADA del cliente (su propio perfil, que es lo que muestra Inicio):
// el mismo nodo de usuario que la app ya lee (websiteFromIgBio pide
// fields=website al mismo host, misma versión, con el mismo token guardado).
// Solo lectura, sin permisos nuevos ni re-conexión: si Meta no devuelve
// el número (permiso, token, cuenta no profesional), devuelve null y la
// cabecera simplemente no muestra el stat — nunca un cero inventado.
// El 0 real (la cuenta no sigue a nadie) SÍ es un número y se muestra.
// Precedencia (resolveFollowing): embed > API > oculto.
// Ritmo: el servidor llama a esto SOLO dentro de homeProfileReadAndStore
// (refresh de perfil: manual, pull-to-refresh o TTL vencido), y el valor
// queda cacheado en el snapshot ig_home_snapshot hasta el próximo refresh.
// Nunca se llama por render ni por tile ni por scroll.
const IG_HOST = 'https://graph.instagram.com';
const API_VERSION = 'v26.0';
const FETCH_TIMEOUT_MS = 15000;

function numOrNull(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
}

// Lee follows_count (+ username, para verificar que el token es de la
// cuenta que se está mostrando) del nodo del usuario conectado.
// Nunca lanza: cualquier fallo -> null.
async function fetchFollowsCount(opts) {
  try {
    const o = opts || {};
    const igUserId = o.igUserId, accessToken = o.accessToken;
    if (!igUserId || !accessToken) return null;
    const fetchFn = o.fetchFn || fetch;
    const params = new URLSearchParams({ fields: 'follows_count,username', access_token: accessToken });
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let d = null;
    try {
      const res = await fetchFn(IG_HOST + '/' + API_VERSION + '/' + encodeURIComponent(String(igUserId)) + '?' + params, { signal: ctl.signal });
      d = await res.json();
    } finally { clearTimeout(timer); }
    if (!d || d.error) return null;
    // Guarda de identidad: el token tiene que ser de la cuenta mostrada.
    if (o.expectedHandle) {
      const un = String(d.username || '').replace(/^@/, '').trim().toLowerCase();
      const eh = String(o.expectedHandle || '').replace(/^@/, '').trim().toLowerCase();
      if (!un || un !== eh) return null;
    }
    return numOrNull(d.follows_count);
  } catch (e) { return null; }
}

// Precedencia del stat de seguidos: el embed manda cuando trae número;
// si no, vale la API; si ninguno trae dato, null (oculto, nunca 0 inventado).
function resolveFollowing(embedFollowing, apiFollowing) {
  const e = numOrNull(embedFollowing);
  if (e !== null) return e;
  return numOrNull(apiFollowing);
}

module.exports = { fetchFollowsCount, resolveFollowing };
