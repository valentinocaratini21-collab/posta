// ig-search.js — Búsqueda pública de Instagram por @ (LOTE IG-CON-BUSCADOR)
// GET /api/ig/search?q=<@> — solo datos PÚBLICOS para que el visitante de la
// prueba confirme «es esta» tocando la sugerencia. Nunca pide contraseña,
// nunca entra a la cuenta del visitante, no guarda nada sensible.
//
// FUENTE (decisión documentada): la página pública de embed de Instagram
// (https://www.instagram.com/<usuario>/embed/). Es la ruta que Instagram
// sirve sin login para embeber un perfil: trae un contextJSON con username,
// full_name, verified, profile_pic_url, followers_count y posts_count.
// Verificado 6/11 desde este entorno: @postycommunitymanager y
// @valentinocaratini devuelven su contextJSON; un @ inexistente devuelve
// contextJSON:null (isProfileEmbed:false) — ese es el «no existe» exacto.
// La bio NO está en ninguna ruta pública sin login (ni en el embed ni en
// los og: de la página de perfil), así que el endpoint no la promete.
// Tampoco trae is_private: no se puede determinar desde la ruta pública.
//
// POR QUÉ NO LAS OTRAS VÍAS:
// - API de Meta (Instagram Graph): no ofrece búsqueda de usuarios por
//   nombre. getIgProfile (instagram.js) solo resuelve la cuenta YA
//   conectada por OAuth (/me o su id numérico). No hay username→perfil
//   para cuentas ajenas.
// - instagram-cli del entorno (account-search / profile --username): SÍ
//   busca por nombre y trae bio, seguidores, foto y verificado — pero vive
//   en la VM de Muse, autenticado con la cuenta vinculada de Valentino.
//   En producción (Railway) no existe el binario ni la sesión vinculada,
//   y usar la cuenta de Valentino para resolver los @ de los visitantes
//   sería actuar como él. No sirve desde el servidor.
// - /web/search/topsearch/ sin login: 404 «Page Not Found». No hay
//   búsqueda por prefijo pública: por eso el autocompletado es por
//   coincidencia EXACTA (se escribe el @ completo y aparece la tarjeta
//   para confirmar), no una lista de sugerencias por prefijo.
// - ?__a=1&__d=dis: 201 con cuerpo vacío. Muerto.
//
// LÍMITES: timeout duro 8 s; caché en memoria (10 min si se encontró,
// 60 s si no se encontró; tope 500 entradas, sin DB — los seguidores
// cambian y no vale una migración); el rate-limit por IP vive en el
// endpoint (server.js, authHitCount), no acá. Si Instagram no responde,
// lookupIgProfile rechaza con code 'ig_unavailable' y el endpoint
// devuelve el error honesto — la búsqueda nunca bloquea la entrada manual.
'use strict';

const IG_EMBED_URL = (u) => 'https://www.instagram.com/' + encodeURIComponent(u) + '/embed/';
const IG_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const FETCH_TIMEOUT_MS = 8000;
const CACHE_FOUND_MS = 10 * 60 * 1000;
const CACHE_MISS_MS = 60 * 1000;
const CACHE_MAX = 500;

const IG_SEARCH_CACHE = new Map();

function normalizeIgQuery(q) {
  return String(q || '').trim().replace(/^@+/, '').toLowerCase();
}

function isValidIgQuery(q) {
  return /^[a-z0-9._]{1,30}$/.test(q);
}

// Parsea el HTML de la página de embed. Devuelve el perfil o null si la
// página no trae perfil (cuenta inexistente: contextJSON:null, o página
// que no es un embed de perfil). Nunca lanza.
function parseIgEmbedHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const m = html.match(/"contextJSON":("((?:\\.|[^"\\])*)"|null)/);
  if (!m || m[1] === 'null' || !m[2]) return null;
  let inner;
  try { inner = JSON.parse('"' + m[2] + '"'); } catch (e) { return null; }
  let ctx;
  try { ctx = JSON.parse(inner).context; } catch (e) { return null; }
  if (!ctx || typeof ctx.username !== 'string' || !ctx.username) return null;
  // Solo fotos reales de Instagram (misma regla que /api/ig/avatar): si
  // la URL no es de scontent, no se muestra foto en vez de una rota.
  let pic = typeof ctx.profile_pic_url === 'string' ? ctx.profile_pic_url : '';
  if (pic && !/scontent[^/]*\.cdninstagram\.com\/v\//.test(pic)) pic = '';
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    username: ctx.username,
    name: typeof ctx.full_name === 'string' ? ctx.full_name : '',
    pic_url: pic || null,
    followers: num(ctx.followers_count),
    posts: num(ctx.posts_count),
    verified: !!ctx.verified,
    url: 'https://www.instagram.com/' + ctx.username + '/',
  };
}

function cachePut(key, value) {
  IG_SEARCH_CACHE.set(key, { at: Date.now(), value });
  while (IG_SEARCH_CACHE.size > CACHE_MAX) {
    const first = IG_SEARCH_CACHE.keys().next().value;
    IG_SEARCH_CACHE.delete(first);
  }
}

function clearIgSearchCache() {
  IG_SEARCH_CACHE.clear();
}

// Busca un @ público. Devuelve { found:true, profile } o { found:false }.
// Rechaza con code 'invalid' (handle inválido) o 'ig_unavailable'
// (Instagram no respondió: red, timeout, HTTP != 200). fetchImpl es solo
// para tests; en producción usa el fetch global.
async function lookupIgProfile(username, fetchImpl) {
  const u = normalizeIgQuery(username);
  if (!isValidIgQuery(u)) {
    const e = new Error('handle inválido');
    e.code = 'invalid';
    throw e;
  }
  const now = Date.now();
  const hit = IG_SEARCH_CACHE.get(u);
  if (hit) {
    const ttl = hit.value.found ? CACHE_FOUND_MS : CACHE_MISS_MS;
    if (now - hit.at < ttl) return hit.value;
    IG_SEARCH_CACHE.delete(u);
  }
  const doFetch = fetchImpl || fetch;
  let res;
  try {
    res = await doFetch(IG_EMBED_URL(u), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': IG_UA, Accept: 'text/html' },
    });
  } catch (e) {
    const err = new Error('Instagram no respondió');
    err.code = 'ig_unavailable';
    throw err;
  }
  if (!res || res.status !== 200) {
    const err = new Error('Instagram no respondió');
    err.code = 'ig_unavailable';
    throw err;
  }
  let html = '';
  try { html = await res.text(); } catch (e) {
    const err = new Error('Instagram no respondió');
    err.code = 'ig_unavailable';
    throw err;
  }
  const profile = parseIgEmbedHtml(html);
  const value = profile ? { found: true, profile } : { found: false };
  cachePut(u, value);
  return value;
}

module.exports = {
  normalizeIgQuery,
  isValidIgQuery,
  parseIgEmbedHtml,
  lookupIgProfile,
  clearIgSearchCache,
};
