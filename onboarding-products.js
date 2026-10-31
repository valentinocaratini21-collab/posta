'use strict';
// Onboarding un clic — productos detectados + foto por producto.
//
// Determinístico, USD 0, cero IA. Solo refleja lo que Posty ya extrajo:
//  - servicios de la web (la lista real del negocio, con la misma puerta
//    de plausibilidad que usa el digest),
//  - bio minada con la misma función que el digest (sin servicios).
// Los captions NO aportan productos (aportan temas); solo se usan para
// mapear fotos. Sin foto mapeada → tarjeta con nombre (nunca stock,
// nunca inventada: la foto que no es del negocio no se muestra).
//
// Usado por /api/trial/prefill (bio + captions de los posts) y por
// /api/trial/web-prefill (servicios + fotos del sitio).
const { offeringsFromText, isPlausibleOfferItem } = require('./client-digest');

const STOP = new Set('de la el en y con para por un una los las su sus al del se es son que como mas muy sin solo sobre entre hasta desde of the and a an in on for to with your you is are'.split(' '));

function normStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Singular liviano determinístico (medialunas→medialuna, cafés→café):
// sin esto, "medialunas" no matchearía la foto "medialuna recién salida".
function stem(w) {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function wordsOf(s) {
  return normStr(s).split(/[^a-z0-9]+/).filter(Boolean).map(stem).filter((w) => !STOP.has(w) && w.length > 1);
}

// Productos reales del negocio, máximo 4, sin duplicados.
// Orden: servicios tal como vienen de la web; si no hay, bio minada.
function detectProducts({ bio, captions, services } = {}) {
  let names = [];
  if (Array.isArray(services) && services.length) {
    names = services.filter((s) => isPlausibleOfferItem(s)).map((s) => String(s).trim()).filter(Boolean);
  }
  if (!names.length && bio) {
    try {
      const mined = offeringsFromText(bio);
      names = (mined && mined.items) || [];
    } catch (e) { names = []; }
  }
  const seen = new Set();
  const out = [];
  for (const n of names) {
    const k = normStr(n).replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(n).trim());
    if (out.length >= 4) break;
  }
  return out;
}

// Palabras de una foto: caption/alt + palabras del nombre del archivo
// (las fotos de un sitio suelen llamarse como el producto).
function photoWords(photo) {
  const base = photo.text || '';
  let file = '';
  try {
    const u = String(photo.url || '');
    const b = u.split('?')[0].split('/').pop() || '';
    file = b.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  } catch (e) { /* sin nombre de archivo: solo caption/alt */ }
  return new Set([...wordsOf(base), ...wordsOf(file)]);
}

// Empareja cada producto con su foto real: todas las palabras
// significativas del producto tienen que aparecer en el texto de la foto.
// Primera coincidencia gana; una foto se usa una sola vez. Sin
// coincidencia → foto null (tarjeta con nombre, nunca foto ajena).
function mapProductPhotos(products, photos) {
  const pool = (photos || []).filter((p) => p && p.url).map((p) => ({ url: p.url, words: photoWords(p) }));
  const used = new Set();
  return (products || []).map((name) => {
    const pw = wordsOf(name);
    let foto = null;
    if (pw.length) {
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        if (pw.every((w) => pool[i].words.has(w))) { foto = pool[i].url; used.add(i); break; }
      }
    }
    return { nombre: name, foto };
  });
}

module.exports = { detectProducts, mapProductPhotos, wordsOf, normStr };
