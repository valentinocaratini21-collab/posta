'use strict';
// ig-media.js — Media por API oficial (lote FEED-ORDEN-COMPLETO · 4/11).
//
// Por qué existe: el embed público de Instagram es UNA sola página sin
// paginación. Con carruseles, la página se llena de hijos y los posteos
// viejos quedan afuera: caso real 4/11, @posty.communitymanager tiene 12
// posteos y el embed trae solo los 6 más nuevos (trío perfume 4/11 +
// trío café 3/11) + 10 láminas de carrusel. Los de 1/11, 31/10, 30/10,
// 29/10, 28/10 y 20/10 son invisibles para el snapshot, el live-grid y
// la reconciliación — y por eso la tarjeta velada del próximo quedaba
// «en el medio» (justo después del trío café, cuando abajo deberían
// seguir 6 posteos más viejos).
//
// Esta pieza completa la grilla con GET /v26.0/{ig_user_id}/media de la
// CUENTA CONECTADA (mismo token guardado que usa ig-follows, misma
// versión de API, sin permisos nuevos): fields id/caption/media_type/
// media_url/thumbnail_url/timestamp/permalink, limit 50, siguiendo
// paging.next. Solo lectura.
//
// Fail-closed total, igual que ig-follows: cualquier fallo (sin token,
// token vencido, identidad que no coincide, página con error, timeout)
// devuelve null y la home queda EXACTAMENTE como hoy (solo embed).
// Nunca lanza. Sin caché a propósito: el live-grid corre en cada
// apertura de Inicio y la frescura es lo que sostiene la regla de
// borrado-IG (un posteo borrado tiene que desaparecer al abrir); un
// caché rancio haría que un borrado siguiera rindiendo. El costo es
// bajo: 1 llamada de usuario + 1 página por refresh (la cuenta de
// ejemplo tiene 12 posteos; el tope es 5 páginas / 250 ítems).
// Nunca se llama por render ni por tile: solo dentro de
// homeProfileReadAndStore (refresh de perfil), igual que follows.
const IG_HOST = 'https://graph.instagram.com';
const API_VERSION = 'v26.0';
const FETCH_TIMEOUT_MS = 15000;
const DEFAULT_BUDGET_MS = 10000;
const PAGE_LIMIT = 50;
const MAX_PAGES = 5;
const MAX_ITEMS = 250;

// Shortcode desde el permalink oficial: /p/{sc}/, /reel/{sc}/, /tv/{sc}/.
// Sin shortcode no se puede dedupar contra el embed: el ítem se descarta.
function shortcodeFromPermalink(url) {
  try {
    const m = /\/(p|reel|tv)\/([A-Za-z0-9_-]+)/.exec(String(url || ''));
    return m ? m[2] : null;
  } catch (e) { return null; }
}

// Un ítem de /media a la forma que ya consumen homeProfileFromRead,
// la reconciliación y el live-grid (misma forma que los del embed).
// Carrusel = UN posteo (no se bajan hijos: rendirlos sueltos duplicaría
// la grilla). Sin shortcode, fecha o miniatura no hay posteo válido.
function mapMediaItem(it) {
  try {
    if (!it || typeof it !== 'object') return null;
    const sc = shortcodeFromPermalink(it.permalink);
    if (!sc) return null;
    const ms = Date.parse(String(it.timestamp || ''));
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const mt = String(it.media_type || '').toUpperCase();
    let type = 'GraphImage';
    if (mt === 'VIDEO') type = 'GraphVideo';
    else if (mt === 'CAROUSEL_ALBUM') type = 'GraphSidecar';
    else if (mt !== 'IMAGE') return null;
    const thumb = (type === 'GraphVideo')
      ? (it.thumbnail_url || null)
      : (it.media_url || it.thumbnail_url || null);
    if (!thumb) return null;
    return {
      type,
      shortcode: sc,
      taken_at: Math.floor(ms / 1000),
      caption: String(it.caption || ''),
      thumb: String(thumb),
      likes: null,
      comments: null,
      pinned: null,
    };
  } catch (e) { return null; }
}

// Merge puro y testeable: los oficiales que NO están ya en el embed se
// agregan después (el embed manda en orden y en contenido; lo oficial
// solo completa). Sin shortcode no se agrega nada. No muta las entradas.
function mergeOfficialPosts(embedPosts, officialPosts) {
  const base = Array.isArray(embedPosts) ? embedPosts.slice() : [];
  const seen = new Set();
  for (const p of base) { if (p && p.shortcode) seen.add(String(p.shortcode)); }
  let added = 0;
  for (const o of (Array.isArray(officialPosts) ? officialPosts : [])) {
    if (!o || !o.shortcode || seen.has(String(o.shortcode))) continue;
    seen.add(String(o.shortcode));
    base.push(o);
    added++;
  }
  return { posts: base, added };
}

// Lee la media oficial completa (o null ante cualquier fallo).
// opts: { igUserId, accessToken, expectedHandle, fetchFn, budgetMs }.
// fetchFn es el punto de inyección de los tests (por defecto fetch).
async function fetchOfficialMedia(opts) {
  try {
    const o = opts || {};
    const igUserId = o.igUserId, accessToken = o.accessToken;
    if (!igUserId || !accessToken) return null;
    const fetchFn = o.fetchFn || fetch;
    const budgetMs = (typeof o.budgetMs === 'number' && o.budgetMs > 0) ? o.budgetMs : DEFAULT_BUDGET_MS;
    const deadline = Date.now() + budgetMs;
    const get = async (url) => {
      const remain = deadline - Date.now();
      if (remain <= 0) throw new Error('budget');
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), Math.min(FETCH_TIMEOUT_MS, remain));
      try {
        const res = await fetchFn(url, { signal: ctl.signal });
        const d = await res.json();
        if (!d || d.error) throw new Error('api-error');
        return d;
      } finally { clearTimeout(timer); }
    };
    // Guarda de identidad: el token tiene que ser de la cuenta mostrada
    // (mismo patrón que fetchFollowsCount).
    if (o.expectedHandle) {
      const me = await get(IG_HOST + '/' + API_VERSION + '/' + encodeURIComponent(String(igUserId)) + '?fields=username&access_token=' + encodeURIComponent(String(accessToken)));
      const un = String((me && me.username) || '').replace(/^@/, '').trim().toLowerCase();
      const eh = String(o.expectedHandle || '').replace(/^@/, '').trim().toLowerCase();
      if (!un || un !== eh) return null;
    }
    const fields = 'id,caption,media_type,media_url,thumbnail_url,timestamp,permalink';
    let url = IG_HOST + '/' + API_VERSION + '/' + encodeURIComponent(String(igUserId)) + '/media?fields=' + encodeURIComponent(fields) + '&limit=' + PAGE_LIMIT + '&access_token=' + encodeURIComponent(String(accessToken));
    const out = [];
    const seen = new Set();
    let pages = 0;
    while (url && pages < MAX_PAGES && out.length < MAX_ITEMS && Date.now() < deadline) {
      const page = await get(url);
      const items = Array.isArray(page.data) ? page.data : [];
      for (const it of items) {
        const m = mapMediaItem(it);
        if (!m || seen.has(m.shortcode)) continue;
        seen.add(m.shortcode);
        out.push(m);
        if (out.length >= MAX_ITEMS) break;
      }
      pages++;
      url = (page.paging && page.paging.next) ? String(page.paging.next) : null;
    }
    // Si se cortó por presupuesto o por tope sin llegar al final natural,
    // el resultado es parcial: para recents y live-grid sigue siendo útil
    // (solo AGREGA posteos, nunca quita), y la reconciliación tiene su
    // propia guarda de lectura parcial (total > seen => no toca nada).
    return out;
  } catch (e) { return null; }
}

module.exports = { shortcodeFromPermalink, mapMediaItem, mergeOfficialPosts, fetchOfficialMedia };
