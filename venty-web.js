// venty-web.js — VENTY-CONECTAR-4: el sitio del negocio como FUENTE conectada.
// El sitio del negocio ya se puede leer (web-extract.js fetchBusinessSite,
// NO se toca): acá se enchufa como fuente del fundamento de Venty.
//   1. guardar website_url en venty_fundamento (puente; ver venty.js);
//   2. correr fetchBusinessSite() para refrescar rubro / servicios /
//      tono / paleta / ciudad — sin pisar nunca precios, estrella ni
//      políticas (eso lo decide el dueño, no la web);
//   3. marcar la conexión web (venty-conexiones.js) con ultimo_fetch, para
//      que GET /api/venty/estado la muestre conectada de verdad.
// Si la web no responde o no trae nada útil, el fundamento queda como
// estaba y la conexión queda en falta_accion con el motivo (nunca se
// inventan datos del negocio).
// Lectura alternativa NO construida: widget de chat en el sitio del
// negocio — anotada en STATUS.md como decisión pendiente de Valentino.
'use strict';

function fail(m) { const e = new Error(m); e.ventyWeb = true; throw e; }
function ahoraIso() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

function normalizarUrl(raw) {
  let u = String(raw || '').trim().slice(0, 500);
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const p = new URL(u); return p.toString().replace(/\/$/, ''); } catch (e) { return ''; }
}

// Refresca el fundamento desde el sitio. opts: { fetchBusinessSite,
// conexiones, venty } inyectables en tests. Devuelve { ok, cambios, sitio }.
async function refrescarDesdeWeb(db, userId, websiteUrl, opts) {
  const o = opts || {};
  const venty = o.venty || require('./venty');
  const conexiones = o.conexiones || require('./venty-conexiones');
  const url = normalizarUrl(websiteUrl);
  if (!url) return { ok: false, error: 'sin_url' };
  const fetchBusinessSite = o.fetchBusinessSite || require('./web-extract').fetchBusinessSite;
  let sitio = null;
  try { sitio = await fetchBusinessSite(url); } catch (e) { sitio = null; }
  if (!sitio || !sitio.ok) {
    try { conexiones.marcarFaltaAccion(db, userId, 'web', 'el sitio no respondió'); } catch (e) {}
    return { ok: false, error: 'sitio_sin_respuesta' };
  }
  const cambios = {};
  if (sitio.city) cambios.ciudad = String(sitio.city).slice(0, 80);
  // Rubro y paleta: solo si el fundamento todavía no tiene (la web propone,
  // no impone: si el dueño ya definió su rubro o su paleta, manda el dueño).
  // (SLICE 2 Fitswapp: la paleta canónica del borrador nunca la pisa lo que
  // extraiga la landing.)
  const f = venty.leerFundamento(db, userId);
  if ((!f || !(f.paleta && f.paleta.length)) && Array.isArray(sitio.palette) && sitio.palette.length) {
    cambios.paleta = sitio.palette.slice(0, 2).map((hex, i) => ({ hex: String(hex).toUpperCase(), rol: i === 0 ? 'principal' : 'acento' }));
  }
  if ((!f || !f.rubro) && sitio.categoryHint) cambios.rubro = String(sitio.categoryHint).slice(0, 80);
  cambios.website_url = sitio.url || url;
  try {
    venty.actualizarFundamentoPuente(db, userId, cambios);
  } catch (e) {
    return { ok: false, error: 'fundamento_no_actualizado' };
  }
  try { conexiones.marcarFetch(db, userId, 'web', {}); } catch (e) {}
  try { venty.registrarEvento(db, userId, 'web_refrescada', null, { url: cambios.website_url, ciudad: cambios.ciudad || '', paleta: (cambios.paleta || []).length }); } catch (e) {}
  return {
    ok: true,
    cambios,
    sitio: {
      url: sitio.url, nombre: sitio.name || '', ciudad: sitio.city || '',
      servicios: (sitio.services || []).slice(0, 8),
      paleta: (sitio.palette || []).slice(0, 2),
      descripcion: (sitio.description || '').slice(0, 200),
    },
  };
}

// Puente venty_fundamento ↔ business_dna / client_digest (Posty):
// lee website_url y paleta de las fuentes de Posty cuando el fundamento
// de Venty todavía no las tiene. Nunca escribe en business_dna ni en
// client_digest (son de Posty; Venty solo lee).
function puenteDesdePosty(db, userId) {
  const out = { website_url: '', paleta: [] };
  try {
    const dr = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    if (dr && dr.dna_json) {
      const j = JSON.parse(dr.dna_json);
      if (j && j.website_url) out.website_url = String(j.website_url).slice(0, 500);
      if (j && j.website) out.website_url = out.website_url || String(j.website).slice(0, 500);
    }
  } catch (e) { /* sin business_dna: sin puente */ }
  try {
    const cr = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(userId);
    if (cr && cr.digest_json) {
      const j = JSON.parse(cr.digest_json);
      const pal = (j && (j.paleta || j.palette)) || [];
      if (Array.isArray(pal)) {
        out.paleta = pal.slice(0, 2).map((p, i) => ({
          hex: String(typeof p === 'string' ? p : (p.hex || '')).toUpperCase(),
          rol: (p && p.rol) || (i === 0 ? 'principal' : 'acento'),
        })).filter((p) => /^#[0-9A-F]{6}$/.test(p.hex));
      }
      if (!out.website_url && j && j.website_url) out.website_url = String(j.website_url).slice(0, 500);
    }
  } catch (e) { /* sin client_digest: sin puente */ }
  return out;
}

module.exports = { normalizarUrl, refrescarDesdeWeb, puenteDesdePosty };
