// meli.js — Track 4: MercadoLibre (extensión de website-study)
// Si la URL del cliente es de MercadoLibre, usamos la API pública (sin key)
// en vez del scrape: título, precio, moneda, condición, atributos (marca,
// talle, color) + descripción en texto plano.
// Esto SOLO lee y analiza: nunca publica nada.
//
// Exporta: { isMeliUrl, extractMeliItemId, analyzeMeli, mergeIntoDna }
'use strict';

const MELI_API = 'https://api.mercadolibre.com';
const MELI_TIMEOUT_MS = 15000;
const MELI_LABEL = '🛒 MercadoLibre'; // etiqueta para dna_json.fuentes

// ---------------------------------------------------------------------------
// Detección
// ---------------------------------------------------------------------------
// Host de MercadoLibre: mercadolibre.com + todas las variantes por país
// (.com.ar, .com.mx, .cl, .com.co, .com.uy, .com.pe, ...) y subdominios
// (articulo., www., listado., tienda., publicar.).
function isMeliUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return /(^|\.)mercadolibre\.com(\.[a-z]{2,3})?$/i.test(u.hostname);
  } catch (e) { return false; }
}

// Extrae el ID del item (MLA1234567890) del path
// (articulo.mercadolibre…/MLA-1234567890-…, /p/MLA1234567890, /MLA-1234567890…)
// o de query params (?item_id=MLA1234567890).
function extractMeliItemId(url) {
  try {
    const u = new URL(String(url || '').trim());
    for (const k of ['item_id', 'mla']) {
      const v = u.searchParams.get(k) || '';
      const m = /MLA-?(\d{6,})/i.exec(v);
      if (m) return 'MLA' + m[1];
    }
    const m = /MLA-?(\d{6,})/i.exec(u.pathname + ' ' + u.hash);
    return m ? 'MLA' + m[1] : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Fetch JSON con timeout
// ---------------------------------------------------------------------------
async function meliFetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), MELI_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PostaBot/1.0; +https://postahacetodo.com)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null; // timeout, red caída o bloqueo anti-bot: se maneja con mensaje amable
  } finally {
    clearTimeout(timer);
  }
}

// Site ID para resolver búsquedas/tiendas sin ID de item (MLA, MLM, MLC, ...).
function meliSiteId(hostname) {
  const h = String(hostname || '').toLowerCase();
  const m = /mercadolibre\.com\.?([a-z.]*)$/i.exec(h);
  const tld = (m && m[1]) || '';
  const parts = tld.split('.').filter(Boolean);
  const cc = parts[parts.length - 1] || '';
  const map = { ar: 'MLA', mx: 'MLM', cl: 'MLC', co: 'MCO', uy: 'MLU', pe: 'MPE', pa: 'MPA', do: 'MRD', ec: 'MEC', py: 'MPY', cr: 'MCR', ve: 'MLV' };
  return map[cc] || 'MLA';
}

// Tienda del vendedor: https://tienda.mercadolibre.com.ar/NICKNAME
// → primer item publicado por ese vendedor (API pública, sin key).
async function resolveStoreFirstItem(clean) {
  try {
    const u = new URL(clean);
    const nick = (u.pathname.split('/').filter(Boolean)[0] || '').trim();
    if (!nick) return null;
    const d = await meliFetchJson(`${MELI_API}/sites/${meliSiteId(u.hostname)}/search?nickname=${encodeURIComponent(nick)}&limit=1`);
    const r = d && d.results && d.results[0];
    const id = r && r.id ? String(r.id).toUpperCase() : '';
    return /^MLA-?\d{6,}$/.test(id) ? id.replace(/^MLA-?/, 'MLA') : null;
  } catch (e) { return null; }
}

// Listado/búsqueda sin ID de item (ej. listado.mercadolibre.com.ar/zapatillas-nike):
// se usa el slug como query y se resuelve el primer resultado.
async function resolveSearchFirstItem(clean) {
  try {
    const u = new URL(clean);
    const segs = u.pathname.split('/').filter(Boolean);
    let slug = segs[segs.length - 1] || '';
    if (segs.length > 1 && /^(b|search|listado|l)$/i.test(segs[0])) slug = segs.slice(1).join(' ');
    const q = slug.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (q.length < 2) return null;
    const d = await meliFetchJson(`${MELI_API}/sites/${meliSiteId(u.hostname)}/search?q=${encodeURIComponent(q)}&limit=1`);
    const r = d && d.results && d.results[0];
    const id = r && r.id ? String(r.id).toUpperCase() : '';
    return /^MLA-?\d{6,}$/.test(id) ? id.replace(/^MLA-?/, 'MLA') : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Mapeo
// ---------------------------------------------------------------------------
function formatMeliPrice(price, currency) {
  const n = Number(price);
  if (!isFinite(n)) return '';
  const int = Math.round(n).toLocaleString('es-AR');
  return (`$ ${int} ${currency || ''}`).trim();
}

function meliAttr(attrs, ids) {
  for (const id of ids) {
    const a = (attrs || []).find(x => String((x && x.id) || '').toUpperCase() === id);
    if (a && a.value_name) return String(a.value_name).trim();
  }
  return '';
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------
// analyzeMeli(url) → { website_url, meli_url, meli_item_id, source,
//   productos, precios, servicios, promos, diferencial, resumen, partial }
// Mismo contrato que analyzeWebsite: website-study la delega acá cuando la
// URL es de MercadoLibre. Lanza Error con mensaje amable si no se pudo leer nada.
async function analyzeMeli(url) {
  let clean = String(url || '').trim();
  if (!clean) throw new Error('Pasame el link de tu publicación de MercadoLibre');
  if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
  if (!isMeliUrl(clean)) throw new Error('Ese link no es de MercadoLibre');

  // 1) ID de item directo (publicación) o 2) resolver primer item de tienda/búsqueda
  let itemId = extractMeliItemId(clean);
  if (!itemId) {
    const u = new URL(clean);
    itemId = /^tienda\./i.test(u.hostname)
      ? await resolveStoreFirstItem(clean)
      : await resolveSearchFirstItem(clean);
  }
  if (!itemId) {
    throw new Error('Ese link no es una publicación. Pegá el link de una publicación de MercadoLibre (empieza con articulo.mercadolibre…) y sacamos título, precio y descripción.');
  }

  // 2) API pública sin key: item + descripción en texto plano
  const item = await meliFetchJson(`${MELI_API}/items/${itemId}`);
  if (!item || !item.title) {
    throw new Error('No pudimos leer esa publicación. Revisá que el link esté bien y que la publicación siga activa.');
  }
  let plainText = '';
  const desc = await meliFetchJson(`${MELI_API}/items/${itemId}/description`);
  if (desc && desc.plain_text) plainText = String(desc.plain_text).slice(0, 2000);

  // 3) Mapeo directo (la API ya viene limpia: PROHIBIDO inventar)
  const attrs = Array.isArray(item.attributes) ? item.attributes : [];
  const marca = meliAttr(attrs, ['BRAND']);
  const talle = meliAttr(attrs, ['SIZE', 'SHOE_SIZE', 'GARMENT_SIZE']);
  const color = meliAttr(attrs, ['COLOR', 'MAIN_COLOR']);
  const condicion = item.condition === 'new' ? 'Nuevo' : (item.condition === 'used' ? 'Usado' : '');
  const moneda = String(item.currency_id || '').toUpperCase();
  const precioFmt = formatMeliPrice(item.price, moneda);
  const attrBits = [condicion, marca && `Marca: ${marca}`, talle && `Talle: ${talle}`, color && `Color: ${color}`].filter(Boolean);
  const nombre = String(item.title || '').slice(0, 200).trim();

  const producto = {
    nombre,
    precio: precioFmt,
    moneda,
    descripcion: [attrBits.join(' · '), plainText ? plainText.slice(0, 400) : ''].filter(Boolean).join('\n'),
    fuente: 'mercadolibre',
  };

  return {
    website_url: clean, // la tarjeta de Ajustes muestra este link
    meli_url: String(item.permalink || clean),
    meli_item_id: itemId,
    source: 'mercadolibre',
    productos: [producto],
    precios: precioFmt ? `${nombre}: ${precioFmt}` : '',
    servicios: [],
    promos: [],
    diferencial: '', // la API no declara un diferencial: no se inventa
    resumen: `Vende en MercadoLibre: ${nombre}${precioFmt ? ` a ${precioFmt}` : ''}`,
    partial: false,
  };
}

// ---------------------------------------------------------------------------
// Merge al ADN
// ---------------------------------------------------------------------------
// mergeIntoDna(cur, r) → nuevo objeto ADN listo para writeDna.
// writeDna REEMPLAZA todo: por eso esta función recibe el ADN actual y
// devuelve el mergeado. Convención de fuentes: dna_json.fuentes = { campo: '🛒 MercadoLibre' }.
// NUNCA pisa: productos se suman con dedupe por nombre (tope 20),
// los escalares se completan solo si están vacíos.
function mergeIntoDna(cur, r) {
  const dna = { ...(cur || {}) };
  dna.meli_url = r.meli_url || r.website_url || '';
  dna.meli_item_id = r.meli_item_id || '';
  dna.meli_analyzed_at = new Date().toISOString();
  dna.website_url = r.website_url || dna.website_url || ''; // la tarjeta "🌐 La web de tu negocio" muestra este link
  dna.website_partial = !!r.partial;

  // productos: suma sin duplicar (por nombre, case-insensitive)
  const existing = Array.isArray(dna.productos) ? [...dna.productos] : [];
  const seen = new Set();
  for (const it of existing) {
    const id = String((it && it.nombre) || it || '').toLowerCase().trim();
    if (id) seen.add(id);
  }
  for (const p of (r.productos || [])) {
    const id = String((p && p.nombre) || '').toLowerCase().trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    existing.push(p);
    if (existing.length >= 20) break;
  }
  dna.productos = existing;

  // escalares: completar solo si están vacíos (jamás pisar lo que ya hay)
  const fuentes = { ...((dna.fuentes && typeof dna.fuentes === 'object' && !Array.isArray(dna.fuentes)) ? dna.fuentes : {}) };
  fuentes.productos = MELI_LABEL;
  for (const f of ['precios', 'diferencial', 'resumen']) {
    if (r[f] && !String(dna[f] == null ? '' : dna[f]).trim()) {
      dna[f] = r[f];
      fuentes[f] = MELI_LABEL;
    }
  }
  dna.fuentes = fuentes;
  return dna;
}

module.exports = { isMeliUrl, extractMeliItemId, analyzeMeli, mergeIntoDna, MELI_LABEL };
