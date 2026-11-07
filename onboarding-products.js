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
// Orden: servicios tal como vienen de la web; si no hay, bio minada;
// si tampoco hay, descripción de la web minada (rubro-literal: un negocio
// que describe su oferta en prosa —sin lista de servicios— quedaba con
// productos [] aunque su web sí dijera qué vende; ese era el caso del
// primo). Los captions siguen sin aportar productos por diseño (aportan
// temas): minar prosa de captions metería slogans como si fueran oferta.
// (LOTE PRUEBA-PRODUCTO-REAL) La bio minada NO pasaba la puerta que sí
// pasan los servicios: una bio con fechas («Lanzamiento 1/2/2027»)
// dejaba «Lanzamiento 1» y «2027» como «productos». Misma puerta +
// rechazo de años/números sueltos/palabras de lanzamiento.
function isMinableOfferItem(s) {
  if (!isPlausibleOfferItem(s)) return false;
  if (/\b(19|20)\d{2}\b/.test(s)) return false; // año suelto
  if (/^\d+$/.test(String(s).trim())) return false;
  if (/lanzamiento|coming soon|próximamente|proximamente/i.test(s)) return false;
  // (LOTE PRUEBA-CHAT-GATE-FIX) Anuncios y llamados a la acción no son
  // oferta: «Walk-ins welcome», «Book your chair», «New arrivals» se
  // minaban como «productos» en bios/captions de negocios solo-IG.
  if (/\b(walk-?ins?|welcome|book (your|now|a|an)|new arrivals?|just landed|link in bio|follow (us|me)|dm (us|me)|now open|grand opening|sale ends|free shipping)\b/i.test(s)) return false;
  // (LOTE PRUEBA-CHAT-GATE-FIX2) Fragmentos de caption en inglés: un
  // segmento que EMPIEZA con un verbo de llamado/evento («RSVP at the»,
  // «Based on true events.», «Join us Saturday») o TERMINA en palabra
  // débil («at the», «on the») es un recorte de prosa, nunca un
  // producto. Solo pega al minado de prosa (bio/descripción/captions):
  // los servicios listados no pasan por acá.
  const w = normStr(s).split(/[^a-z0-9]+/).filter(Boolean);
  if (w.length) {
    if (OFFER_EN_CTA_START.has(w[0])) return false;
    if (OFFER_DANGLING_END.has(w[w.length - 1])) return false;
  }
  return true;
}
// (LOTE PRUEBA-CHAT-GATE-FIX2) Verbos de llamado/evento en inglés como
// primera palabra de un segmento minado: RSVP, join, come, visit, shop,
// book, grab, try, check, follow, click, tap, swipe, save, share, tag,
// celebrate, win, enter, sign, subscribe, watch, listen, download +
// aperturas de cláusula («Based on…», «Made with…», «Live music…»).
const OFFER_EN_CTA_START = new Set(['rsvp', 'join', 'come', 'visit', 'shop', 'book', 'grab', 'try', 'check', 'follow', 'click', 'tap', 'swipe', 'save', 'share', 'tag', 'celebrate', 'win', 'enter', 'sign', 'subscribe', 'watch', 'listen', 'download', 'based', 'inspired', 'made', 'crafted', 'designed', 'built', 'created', 'powered', 'brought', 'featuring', 'introducing', 'announcing', 'happening', 'live', 'tonight', 'today', 'tomorrow', 'dont', 'never']);
// Palabra débil al final del segmento: el recorte quedó cortado a la
// mitad («Rsvp at the», «Café de») — un producto no termina así.
const OFFER_DANGLING_END = new Set(['the', 'a', 'an', 'at', 'on', 'in', 'to', 'for', 'of', 'with', 'from', 'by', 'and', 'or', 'el', 'la', 'los', 'las', 'un', 'una', 'de', 'en', 'con', 'para', 'por', 'y', 'o', 'su', 'al', 'del']);

function detectProducts({ bio, captions, services, description, excludeNames } = {}) {
  let names = [];
  if (Array.isArray(services) && services.length) {
    names = services.filter((s) => isPlausibleOfferItem(s)).map((s) => String(s).trim()).filter(Boolean);
  }
  if (!names.length && bio) {
    try {
      const mined = offeringsFromText(bio);
      names = ((mined && mined.items) || []).filter(isMinableOfferItem);
    } catch (e) { names = []; }
  }
  if (!names.length && description) {
    try {
      const mined = offeringsFromText(description);
      names = ((mined && mined.items) || []).filter(isMinableOfferItem);
    } catch (e) { names = []; }
  }
  // (LOTE PRUEBA-CHAT-GATE-FIX) Último recurso: captions de IG. Solo
  // cuando bio/servicios/descripción no dieron nada (negocios solo-IG
  // con bio corta, como una barbería): los captions son la única señal
  // de qué vende. Misma puerta que la bio (isMinableOfferItem): un
  // slogan o un anuncio no pasa a ser «producto». Un caption con dos
  // oraciones («Timeless style. Effortless you.») es un slogan: se
  // salta entero antes de minar (el minador parte las oraciones en
  // segmentos y cada mitad pasaría la puerta como si fuera oferta).
  if (!names.length && Array.isArray(captions) && captions.length) {
    try {
      const prose = captions.filter((c) => !/[.!?]\s+[A-ZÁÉÍÓÚÑ]/.test(String(c || '')));
      const mined = offeringsFromText(prose.join(' | '));
      names = ((mined && mined.items) || []).filter(isMinableOfferItem);
    } catch (e) { names = []; }
  }
  const seen = new Set();
  const out = [];
  // (LOTE PRUEBA-PRODUCTO-REAL) Tu propio nombre no es tu producto: la
  // bio empieza con el nombre («Posty • …») y el minado lo devolvía
  // como «producto». El prefill pasa nombre/@ y se excluyen.
  const excl = new Set((Array.isArray(excludeNames) ? excludeNames : []).map((x) => normStr(String(x || '')).replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean));
  for (const n of names) {
    const k = normStr(n).replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k)) continue;
    if (excl.has(k)) continue;
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
