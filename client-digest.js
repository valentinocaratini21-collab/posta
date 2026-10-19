'use strict';
/* =====================================================================
 * client-digest.js — FUNDAMENTO (v229, 2026-10-18)
 * Directiva de Valentino: "si los posteos que armamos no son exactos del
 * producto del cliente, Posty no sirve de nada". Este módulo compila EL
 * fundamento de cada negocio en un digest único y versionado:
 *
 *   { servicios[], productos[] (con precio si existe), promos[],
 *     temas_feed[], protagonista, paleta[{hex, rol}], registro,
 *     ciudad, diferencial, has_booking, fuentes{web|feed|form|dna: {at,…}} }
 *
 * Fuentes: su website (web-extract / website-study), su Instagram
 * (feed-audit: bio + captions de sus últimos posteos), el formulario de
 * la prueba y el ADN cargado a mano. El digest se construye EN LA PRUEBA
 * (viaja en el payload y en trial_cache), se transfiere ENTERO a la
 * cuenta al registrarse (profile + business_dna + brand_colors) y se
 * refresca con cadencia en el sweep semanal.
 *
 * PERSISTENCIA (elección documentada): tabla propia `client_digest`
 * (user_id PK, digest_json, hash, version, updated_at). El ADN
 * (business_dna) sigue siendo la fuente EDITABLE por el dueño; el
 * digest es la foto compilada y derivada — mezclarlos habría roto la
 * convención de merge del ADN (lo editado a mano manda: al refrescar,
 * los bloques del digest se re-derivan del ADN vigente y las listas
 * del dueño tienen prioridad de orden sobre las minadas).
 *
 * Todo determinístico, USD 0: minería por reglas sobre textos reales.
 * ===================================================================== */
const crypto = require('crypto');
const rubroId = require('./rubro-id'); // (v235) clasificador especialista de rubro

const DIGEST_VERSION = 1;

// ---------- texto ----------
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9# ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(('de del la el los las un una unos unas en a y o con sin por para que tu su al mas muy '
  + 'nuestro nuestra nuestros nuestras este esta esto como cuando donde desde hasta sobre entre vos '
  + 'the and for with from this that').split(' '));
// Palabras que NUNCA anclan una pieza solas (genéricas de rubro/marketing):
// si la única coincidencia es una de estas, la pieza podría ser de
// cualquier negocio del rubro → no pertenece.
const GENERIC = new Set(('nuevo nueva nuevos nuevas promo promocion semana hoy dia dias lunes martes miercoles jueves viernes sabado domingo '
  + 'clientes cliente calidad precio precios venta ventas servicio servicios producto productos local negocio '
  + 'reserva reservas turno turnos agenda pedido pedidos delivery envios retiro instagram posteo posteos '
  + 'tip tips clave claves secreto experiencia momento momentos gente personas todos todas casa trabajo').split(' '));

function distinctiveWords(text, exclude) {
  const out = [];
  const seen = new Set();
  for (const w of norm(text).split(' ')) {
    if (w.length < 4 || STOP.has(w) || GENERIC.has(w)) continue;
    if (exclude && exclude.has(w)) continue;
    if (seen.has(w)) continue;
    seen.add(w); out.push(w);
  }
  return out;
}
function wordForms(w) {
  const forms = new Set([w]);
  if (w.length >= 5 && w.endsWith('s')) forms.add(w.slice(0, -1));
  if (w.length >= 6 && w.endsWith('es')) forms.add(w.slice(0, -2));
  return forms;
}
function textWordSet(text) {
  const set = new Set();
  for (const w of norm(text).split(' ')) {
    if (!w) continue;
    for (const f of wordForms(w)) set.add(f);
  }
  return set;
}

// ---------- números y candado de verdad de promos (v231) ----------
// Adopción del estudio de patrones (Predis: "la oferta con número ES
// el titular") CON el candado de verdad de Valentino: un número de
// promo (precio, %, NxM) solo puede aparecer en un titular si ESE
// número está en el digest del cliente. Sin número en el digest, la
// promo se vende sin número — inventarlo es humo y está prohibido.
/* numbersInText(text) → Set de tokens numéricos canónicos del texto:
 * precios ($12.500 → '12500'), decimales (2,5 → '2.5'), porcentajes
 * (20% → '20') y ofertas NxM ('2x1' como token propio + componentes). */
function numbersInText(text) {
  const out = new Set();
  const t = String(text || '');
  const nxm = /(\d+)\s?x\s?(\d+)/gi;
  let m;
  while ((m = nxm.exec(t))) { out.add(`${m[1]}x${m[2]}`); out.add(m[1]); out.add(m[2]); }
  const re = /\d+(?:[.,]\d+)?/g;
  while ((m = re.exec(t))) {
    let tok = m[0];
    if (/^\d{1,3}(\.\d{3})+$/.test(tok)) tok = tok.replace(/\./g, ''); // miles AR: 12.500 → 12500
    else tok = tok.replace(',', '.');
    if (tok.includes('.')) tok = tok.replace(/\.?0+$/, ''); // 2.50 → 2.5 ; 20.0 → 20
    if (tok) out.add(tok);
  }
  return out;
}
/* Todos los números que el digest conoce: productos, servicios,
 * promos, catálogo, bio-link, diferencial y temas del feed. */
function digestNumbers(digest) {
  const out = new Set();
  if (!digest || typeof digest !== 'object') return out;
  const chunks = [];
  const pushItems = (list, fields) => {
    for (const x of (Array.isArray(list) ? list : [])) {
      if (x && typeof x === 'object') for (const f of fields) chunks.push(String(x[f] || ''));
      else chunks.push(String(x || ''));
    }
  };
  pushItems(digest.productos, ['nombre', 'precio']);
  pushItems(digest.servicios, ['nombre', 'precio']);
  pushItems(digest.promos, ['titulo', 'nombre', 'precio']);
  if (digest.catalog) pushItems(digest.catalog.items, ['nombre', 'precio']);
  if (digest.bio_link) pushItems(digest.bio_link.items, ['nombre', 'precio']);
  chunks.push(String(digest.diferencial || ''));
  for (const t of (digest.temas_feed || [])) chunks.push(String(t || ''));
  for (const c of chunks) for (const n of numbersInText(c)) out.add(n);
  return out;
}
/* promoNumberGuard(topic, digest) — el candado aplicado a UN tema:
 * si el tema es promo y su titular trae números que el digest no
 * conoce, devuelve { ok:false, numbers:[…] }; si el tema salió del
 * digest (_digest) o no hay digest con fundamento, pasa siempre (sus
 * números SON los del digest por construcción / no hay verdad que
 * contrastar: el catálogo sin digest es la vidriera genérica). */
function promoNumberGuard(topic, digest) {
  if (!topic || topic.kind !== 'promo' || topic._digest) return { ok: true, numbers: [] };
  if (!digest || !hasFoundation(digest)) return { ok: true, numbers: [] };
  const allowed = digestNumbers(digest);
  const bad = [...numbersInText(`${topic.headline || ''} ${topic.subline || ''}`)]
    .filter((n) => !allowed.has(n));
  return bad.length ? { ok: false, numbers: bad } : { ok: true, numbers: [] };
}

// ---------- anclas y chequeo de pertenencia ----------
/* anchorsOf(digest) → [{text, words[]}] ordenadas por especificidad.
 * Una pieza PERTENECE si su titular+caption contiene ≥1 ancla: la frase
 * completa (≥2 palabras) o una palabra distintiva del ancla. El nombre
 * del negocio NO es ancla (va en todos los captions por plantilla). */
function anchorsOf(digest) {
  if (!digest || typeof digest !== 'object') return [];
  const bizWords = new Set(norm(digest.business || '').split(' ').filter(Boolean));
  const anchors = [];
  const push = (text, kind) => {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length < 3) return;
    const words = distinctiveWords(t, bizWords);
    if (!words.length && norm(t).split(' ').length < 2) return;
    anchors.push({ text: t, kind, words, phrase: norm(t) });
  };
  for (const p of (digest.productos || [])) push(p && (p.nombre || p), 'producto');
  for (const s of (digest.servicios || [])) push(s && (s.nombre || s), 'servicio');
  if (digest.protagonista) push(digest.protagonista, 'protagonista');
  for (const t of (digest.temas_feed || [])) push(t, 'feed');
  if (digest.diferencial) {
    // Del diferencial anclan sus frases cortas más cargadas (no todo el párrafo).
    for (const seg of String(digest.diferencial).split(/[.;|·]/)) push(seg, 'diferencial');
  }
  if (digest.ciudad) push(digest.ciudad, 'ciudad');
  // (v230) LECTURA PROFUNDA: el catálogo extendido puede traer más
  // ítems que la lista principal (capada para prompts) — todos son
  // productos reales del cliente, todos anclan. Y el LÉXICO: las formas
  // con las que el cliente nombra sus productos (apodos incluidos) son
  // anclas de primera clase: una pieza que lo nombra como él lo nombra
  // pertenece a su cuenta.
  if (digest.catalog && Array.isArray(digest.catalog.items)) {
    for (const p of digest.catalog.items) push(p && (p.nombre || p), 'producto');
  }
  if (digest.bio_link && Array.isArray(digest.bio_link.items)) {
    for (const p of digest.bio_link.items) push(p && (p.nombre || p), 'producto');
  }
  if (digest.lexicon && Array.isArray(digest.lexicon.entries)) {
    for (const e of digest.lexicon.entries) {
      if (e.dice) push(e.dice, 'lexico');
      for (const ap of (e.apodos || [])) push(ap, 'lexico');
    }
  }
  // Dedup por frase normalizada, conservando el orden de especificidad.
  const seen = new Set();
  return anchors.filter((a) => {
    const k = a.phrase;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 32);
}
function anchorsFromTexts(list) {
  const d = { productos: [], servicios: [], temas_feed: [] };
  for (const t of (list || [])) d.productos.push({ nombre: String(t || '') });
  return anchorsOf(d);
}
function pieceAnchored(text, anchors) {
  if (!Array.isArray(anchors) || !anchors.length) return { ok: false, anchor: null, reason: 'sin_anclas' };
  const t = norm(text);
  if (!t) return { ok: false, anchor: null, reason: 'sin_texto' };
  const words = textWordSet(text);
  for (const a of anchors) {
    if (a.phrase && a.phrase.split(' ').length >= 2 && t.includes(a.phrase)) return { ok: true, anchor: a.text };
    for (const w of (a.words || [])) {
      for (const f of wordForms(w)) if (words.has(f)) return { ok: true, anchor: a.text };
    }
  }
  return { ok: false, anchor: null, reason: 'sin_ancla' };
}

// ---------- minería determinística de textos reales ----------
const BOOKING_RE = /reserva|reservá|turno|agenda|reservas por|pedidos por whatsapp|escribinos por|dm para/i;
const CTA_ONLY_RE = /^(reservas?|pedidos?|consultas?|escribinos|seguinos|contacto|whatsapp|envios?|delivery)( por| al| vía| via)?( dm| whatsapp| mensaje| tel.*)?$/i;
const LEAD_VERBS_RE = /^(somos|bienvenidos? a?|hacemos|vendemos|ofrecemos|trabajamos|nos dedicamos a|elaboramos|preparamos|brindamos|tostamos|horneamos|cocinamos|asamos|servimos|creamos|dise[ñn]amos|ense[ñn]amos|cortamos|producimos)\s+/i;

const FIELD_LABEL_RE = /^(producto principal|producto|servicios?|diferencial|especialidad|descripci[oó]n|ofrecemos|sobre el negocio( \(de su web\))?|ciudad)\s*:\s*/i;
function cleanSegment(seg) {
  let s = String(seg || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/[#@][\w.]+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  s = s.replace(FIELD_LABEL_RE, '').replace(LEAD_VERBS_RE, '').trim();
  return s;
}
/* Extrae frases-oferta de un texto libre (bio, descripción del
 * formulario): segmentos cortos que nombran algo concreto que el
 * negocio vende/hace. Devuelve {items[], ciudad, hasBooking}. */
function offeringsFromText(text) {
  const raw = String(text || '');
  const hasBooking = BOOKING_RE.test(raw);
  let ciudad = '';
  const items = [];
  const seen = new Set();
  const segments = raw.split(/[\n\r|·•;/]+|\.\s+|\s—\s+|\s-\s+/);
  for (const seg0 of segments) {
    let s = cleanSegment(seg0);
    if (!s) continue;
    // "… en Palermo" → ciudad + servicio sin la cola geográfica.
    const mCity = s.match(/^(.*?)\s+en\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)$/);
    if (mCity && mCity[1].split(' ').length >= 1) {
      if (!ciudad) ciudad = mCity[2];
      s = mCity[1].trim();
    }
    // Cola geográfica genérica ("… en el barrio") y posesivo inicial:
    // no aportan al nombre del servicio.
    s = s.replace(/\s+en (el|la|los|las|un|una)\s+[\wáéíóúñ ]+$/i, '').trim();
    s = s.replace(/^(nuestros?|nuestras?|mis|tus|sus)\s+/i, '').trim();
    if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
    let words = s.split(' ').filter(Boolean);
    if (words.length > 6) {
      // Frase larga: se corta en la primera preposición débil (en/con/
      // para/de) desde la 3ª palabra — "Tostamos nuestro café de
      // especialidad en el barrio" → "…café de especialidad".
      const cutAt = words.findIndex((w, i) => i >= 3 && /^(en|con|para)$/i.test(w));
      if (cutAt >= 2) { s = words.slice(0, cutAt).join(' '); words = s.split(' '); }
    }
    if (words.length < 1 || words.length > 6) continue;
    if (s.length < 4) continue;
    if (CTA_ONLY_RE.test(norm(s))) continue;
    if (/^(desde|hace)\s+\d/i.test(s)) continue;
    const key = norm(s);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(s.charAt(0).toUpperCase() + s.slice(1));
    if (items.length >= 8) break;
  }
  return { items, ciudad, hasBooking };
}

// Vocabulario tema↔texto: el MISMO espíritu que el gate foto↔tema —
// sirve para minar temas del feed y para taggear los temas derivados.
const TEXT_TEMAS = [
  ['sushi', /sushi|nikkei|omakase|rolls?\b|maki|nigiri/i],
  ['pizza', /pizza|pizzer/i],
  ['burger', /hamburgues|burger|smash/i],
  ['cafe', /caf[eé]\b|espresso|cappuccino|latte|barista|tostad/i],
  ['medialunas', /medialuna|croissant|facturas|panader|pasteler/i],
  ['pelo', /pelo|peluquer|corte de pelo|brushing|coloraci|balayage|alisado/i],
  ['makeup', /maquillaje|make\s?-?\s?up|makeup/i],
  ['unas', /u[ñn]as|manicur|esmalta|nail/i],
  ['skincare', /skincare|piel|facial|rutina de piel|serum/i],
  ['flores', /flores|florista|florer/i],
  ['ramos', /ramos?\b|bouquet/i],
  ['mascotas', /mascota|perro|gato|veterinar|peluquer[ií]a canina/i],
  ['fitness', /fitness|gym|gimnasio|entren|yoga|pilates|crossfit/i],
  ['moda', /moda|ropa|indumentaria|outfit|colecci[oó]n/i],
  ['calzado', /calzado|zapatillas|zapatos|sneaker/i],
  ['cocina', /cocina|cocinar|receta/i],
  ['comida', /comida|plato|men[uú]|almuerzo|cena|brunch|desayuno/i],
  ['dental', /dental|dentista|odontolog|sonrisa/i],
  ['salud', /salud|cl[ií]nica|turnos m[eé]dicos|kinesiolog/i],
  ['tech', /celular|tecnolog|iphone|android|notebook|pc\b/i],
  ['autos', /auto|autos|coche|taller mec/i],
  ['viaje', /viaje|viajes|turismo|hotel|vuelos/i],
  ['playa', /playa|verano|pileta/i],
  ['bar', /cerveza|birra|bar\b|tragos|cocktail|coctel/i],
  ['hogar', /hogar|mueble|decoraci|interiorismo/i],
  ['local', /local|tienda|sucursal|showroom/i],
];
function temasFromFreeText(text) {
  const t = String(text || '');
  const out = [];
  for (const [tema, re] of TEXT_TEMAS) if (re.test(t) && !out.includes(tema)) out.push(tema);
  return out.slice(0, 6);
}
/* Tema fotográfico para un texto-ancla (gate foto↔tema del demo).
 * (v235) El subrubro puede afinar el tema cuando la categoría no alcanza
 * (belleza no tiene tema propio: makeup/unas/estetica sí heredan del
 * texto; sushi/panadería caen a comida como su rubro padre). */
const SUBCAT_TEMA = { sushi: 'comida', parrilla: 'comida', pizzeria: 'comida', panaderia: 'comida', cafe: 'cafe', veterinaria: 'mascotas', petshop: 'mascotas', floreria: 'flores', vivero: 'flores' };
function temaForText(text, category, subcat) {
  const temas = temasFromFreeText(text);
  if (temas.length) return temas[0];
  const byCat = { gastronomia: 'comida', cafeteria: 'cafe', belleza: null, moda: 'moda', flores: 'flores', mascotas: 'mascotas', fitness: 'fitness', hogar: 'hogar', deco: 'hogar', bar: 'bar' };
  if (subcat && SUBCAT_TEMA[subcat] && byCat[category] == null) return SUBCAT_TEMA[subcat];
  return byCat[category] || null;
}

// ---------- construcción del digest ----------
function parsePrice(str) {
  const m = String(str || '').match(/\$\s?[\d.,]+/);
  return m ? m[0].replace(/\s+/, ' ') : '';
}
function toItem(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') {
    const nombre = String(raw.nombre || raw.titulo || raw.name || '').replace(/\s+/g, ' ').trim();
    if (nombre.length < 3) return null;
    const precio = String(raw.precio || raw.price || '').trim() || parsePrice(nombre);
    return { nombre: nombre.slice(0, 90), ...(precio ? { precio: precio.slice(0, 24) } : {}) };
  }
  const nombre = String(raw).replace(/\s+/g, ' ').trim();
  if (nombre.length < 3) return null;
  const precio = parsePrice(nombre);
  return { nombre: nombre.slice(0, 90), ...(precio ? { precio } : {}) };
}
function itemList(raw, max) {
  const out = []; const seen = new Set();
  for (const r of (Array.isArray(raw) ? raw : [])) {
    const it = toItem(r);
    if (!it) continue;
    const k = norm(it.nombre);
    if (seen.has(k)) continue;
    seen.add(k); out.push(it);
    if (out.length >= (max || 10)) break;
  }
  return out;
}
/* Como itemList, pero cada ítem conserva su FUENTE de lectura (la que
 * traía el dato crudo o la default): las contradicciones y la trazabi-
 * lidad de la lectura profunda trabajan por fuente. */
function itemListF(raw, max, defFuente) {
  const fmap = new Map();
  for (const r of (Array.isArray(raw) ? raw : [])) {
    const n = r && typeof r === 'object' ? (r.nombre || r.titulo || r.name) : r;
    if (n) { const k = norm(String(n)); if (!fmap.has(k)) fmap.set(k, (r && r.fuente) || defFuente); }
  }
  return itemList(raw, max).map((x) => ({ ...x, fuente: fmap.get(norm(x.nombre)) || defFuente }));
}
function strList(raw, max, len) {
  const out = []; const seen = new Set();
  for (const r of (Array.isArray(raw) ? raw : [raw])) {
    const s = String(r || '').replace(/\s+/g, ' ').trim();
    if (s.length < 3) continue;
    const k = norm(s);
    if (seen.has(k)) continue;
    seen.add(k); out.push(s.slice(0, len || 80));
    if (out.length >= (max || 8)) break;
  }
  return out;
}

function emptyDigest() {
  return {
    v: DIGEST_VERSION, built_at: null, business: '', category: '', subcat: '',
    servicios: [], productos: [], promos: [], temas_feed: [],
    protagonista: '', paleta: [], registro: null, ciudad: '', diferencial: '',
    has_booking: false, fuentes: {},
    // (v230) LECTURA PROFUNDA: bloques extendidos (ver sección al final).
    // null/vacío = todavía no leídos; el hash de anclas NO los cubre (la
    // trazabilidad de v229 no se invalida: el hash sigue siendo el de
    // productos/servicios/promos/temas/protagonista/ciudad/diferencial).
    catalog: null, bio_link: null, lexicon: null, photo_map: null,
    inferred_star: null, contradictions: [], question_candidates: [],
    // (v235) Identificación de rubro versionada (rubro-id.js): fuente de
    // verdad de rubro+subrubro+confianza+fuente. null = aún no clasificado.
    rubro_id: null,
  };
}

/* buildFromParts — compila el digest desde las fuentes disponibles.
 * parts: { business, category, subcat,
 *          web:  {name, description, services[], city, palette[], url} | null,
 *          feed: {bio, captions[], name, handle} | null,
 *          form: {description, goal} | null,
 *          dna:  {…business_dna…} | null,
 *          palette: [{hex, rol}] | feedPalette | null,
 *          registro: 'light'|'dark'|null }
 * Prioridad de listas: ADN (editado por el dueño) → web → texto minado. */
function buildFromParts(parts) {
  const p = parts || {};
  const d = emptyDigest();
  const now = new Date().toISOString();
  d.business = String(p.business || (p.web && p.web.name) || (p.feed && p.feed.name) || '').slice(0, 80);
  // (v235) categoryHint es el @type CRUDO de schema.org ('BeautySalon'),
  // no una categoría: se mapea con el voto JSON-LD de rubro-id.js. Antes
  // de v235 el campo nunca llegaba (undefined) y esta línea era inerte.
  const hintVote = (p.web && p.web.categoryHint) ? rubroId.jsonldVote(p.web.categoryHint) : null;
  d.category = String(p.category || (hintVote ? hintVote.rubro : '') || '').slice(0, 40);
  d.subcat = String(p.subcat || '').slice(0, 40);
  // (v235) RUBRO_ID: si el llamador resolvió el rubro (prueba con su
  // pregunta, registro con lo confirmado), ese bloque MANDA y define
  // category/subcat. Sin resolución explícita, se clasifica desde las
  // señales presentes SOLO para trazabilidad y candidatos a pregunta —
  // category/subcat NO se tocan acá (quien refresca decide; ver el
  // barrido semanal en server.js, que nunca reescribe en silencio).
  if (p.rubroId && p.rubroId.rubro) {
    d.rubro_id = { ...p.rubroId };
    d.category = String(p.rubroId.rubro).slice(0, 40);
    d.subcat = String(p.rubroId.subrubro || '').slice(0, 40);
  } else if (p.web || p.feed || p.form || p.dna) {
    try {
      const cls = rubroId.classifyBusiness({
        jsonldType: (p.web && p.web.categoryHint) || '',
        catalogText: [((p.web && p.web.services) || []).join(' · '), (p.catalogItems || []).join(' · ')].join(' '),
        webText: [(p.web && p.web.name) || '', (p.web && p.web.description) || ''].join(' '),
        bio: (p.feed && p.feed.bio) || '', fullName: (p.feed && p.feed.name) || '',
        handle: (p.feed && (p.feed.handle || p.feed.username)) || '',
        captions: (p.feed && p.feed.captions) || [],
        igCategory: (p.feed && p.feed.category) || '',
        formText: [(p.form && p.form.description) || '', (p.form && p.form.goal) || ''].join(' '),
      });
      d.rubro_id = {
        v: 1, rubro: cls.rubro, subrubro: cls.subrubro || '', confianza: cls.confianza,
        fuente: 'deteccion', segura: cls.segura, nivel_duda: cls.nivel_duda,
        needs_question: cls.necesita_pregunta, sin_confirmar: !cls.segura,
        candidatas: cls.candidatas, evidencia: cls.evidencia,
      };
    } catch (e) { /* la clasificación jamás rompe el digest */ }
  }
  const dna = (p.dna && typeof p.dna === 'object') ? p.dna : null;

  // --- productos / servicios / promos ---
  // (v230) Cada ítem conserva su FUENTE: las contradicciones entre
  // fuentes y su resolución por frescura trabajan sobre estas listas.
  const dnaProds = dna ? itemListF([...(dna.productos || []), ...(dna.producto_estrella ? [{ nombre: dna.producto_estrella }] : [])], 12, 'dna') : [];
  const dnaServs = dna ? itemListF(dna.servicios || [], 10, 'dna') : [];
  const webItems = p.web ? itemListF(p.web.services || [], 10, 'web') : [];
  const catalogItems = (p.catalog && Array.isArray(p.catalog.items)) ? itemListF(p.catalog.items, 48, 'web-catalog') : [];
  const bioItems = (p.bioLink && Array.isArray(p.bioLink.items)) ? itemListF(p.bioLink.items, 20, 'bio-link') : [];
  // La web mezcla productos y servicios en una sola lista: todo entra
  // como ítem vendible; la distinción fina la hace el kind al derivar.
  // Prioridad de la lista principal (capada, higiene de prompts): ADN
  // del dueño → catálogo profundo (web + PDF) → link de bio → home.
  // El catálogo COMPLETO vive en el bloque catalog (abajo).
  d.productos = itemList([...dnaProds, ...catalogItems, ...bioItems, ...webItems], 12);
  d.servicios = itemList([...dnaServs], 10);
  const dnaPromos = dna ? [...(dna.promos_activas || []), ...(dna.promos || [])] : [];
  d.promos = itemList(dnaPromos, 5).map((x) => ({ titulo: x.nombre, ...(x.precio ? { precio: x.precio } : {}) }));

  // --- minería de textos (bio del feed + descripción del formulario) ---
  const bioOff = p.feed && p.feed.bio ? offeringsFromText(p.feed.bio) : { items: [], ciudad: '', hasBooking: false };
  const formOff = p.form && (p.form.description || p.form.goal) ? offeringsFromText(p.form.description || p.form.goal) : { items: [], ciudad: '', hasBooking: false };
  const mined = [...bioOff.items, ...formOff.items];
  if (!d.servicios.length && mined.length) d.servicios = itemList(mined, 8);
  else if (mined.length) {
    // Completa servicios con lo minado que no esté ya (la bio suele
    // nombrar LA especialidad que el ADN todavía no tiene).
    const have = new Set(d.servicios.map((s) => norm(s.nombre)));
    for (const m of mined) if (!have.has(norm(m))) { d.servicios.push(toItem(m)); have.add(norm(m)); }
    d.servicios = d.servicios.slice(0, 10);
  }
  d.has_booking = !!(bioOff.hasBooking || formOff.hasBooking || (dna && BOOKING_RE.test(JSON.stringify(dna))));

  // --- temas del feed: vocabulario minado de captions + bio ---
  const captionText = p.feed && Array.isArray(p.feed.captions) ? p.feed.captions.join('\n') : '';
  const temaSet = [];
  for (const t of [...temasFromFreeText(captionText), ...temasFromFreeText(p.feed ? p.feed.bio : '')]) {
    if (!temaSet.includes(t)) temaSet.push(t);
  }
  // Frases reales de sus captions (primera línea, corta): temas con
  // palabras del cliente, no solo vocabulario.
  if (p.feed && Array.isArray(p.feed.captions)) {
    for (const c of p.feed.captions) {
      const first = cleanSegment(String(c || '').split('\n')[0]);
      const w = first.split(' ').filter(Boolean);
      if (w.length >= 2 && w.length <= 5 && first.length >= 8 && !CTA_ONLY_RE.test(norm(first))) {
        if (!temaSet.includes(first)) temaSet.push(first);
      }
      if (temaSet.length >= 8) break;
    }
  }
  d.temas_feed = temaSet.slice(0, 8);

  // --- protagonista / ciudad / diferencial ---
  const soy = String((p.feed && p.feed.bio) || (p.form && p.form.description) || '').match(/soy\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/);
  d.protagonista = soy ? soy[1] : '';
  d.ciudad = String((p.web && p.web.city) || bioOff.ciudad || formOff.ciudad || (dna && dna.ubicacion) || '').slice(0, 60);
  d.diferencial = String((dna && dna.diferencial) || (p.web && p.web.description) || '').replace(/\s+/g, ' ').trim().slice(0, 240);

  // --- paleta con roles + registro ---
  if (Array.isArray(p.palette) && p.palette.length) {
    d.paleta = p.palette.filter((x) => x && /^#[0-9a-fA-F]{6}$/.test(x.hex || '')).slice(0, 5)
      .map((x) => ({ hex: x.hex.toUpperCase(), rol: String(x.rol || 'color').slice(0, 20) }));
  } else if (p.feedPalette && typeof p.feedPalette === 'object') {
    const fp = p.feedPalette;
    const roles = [['principal', fp.principal], ['accent', fp.accent], ['dark', fp.dark], ['light', fp.light], ['fondo', fp.fondo || fp.background]];
    for (const [rol, hex] of roles) if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) d.paleta.push({ hex: String(hex).toUpperCase(), rol });
  } else if (p.web && Array.isArray(p.web.palette)) {
    d.paleta = p.web.palette.filter((h) => /^#[0-9a-fA-F]{6}$/.test(h || '')).slice(0, 3)
      .map((hex, i) => ({ hex: String(hex).toUpperCase(), rol: ['principal', 'accent', 'fondo'][i] || 'color' }));
  }
  d.registro = p.registro || null;

  // --- fuentes con fecha por bloque ---
  if (p.web) d.fuentes.web = { at: now, url: String(p.web.url || '').slice(0, 200) };
  if (p.feed) d.fuentes.feed = { at: now, handle: String(p.feed.handle || '').slice(0, 40), posts: Array.isArray(p.feed.captions) ? p.feed.captions.length : 0 };
  if (p.form) d.fuentes.form = { at: now };
  if (dna) d.fuentes.dna = { at: now };

  // ===== (v230) LECTURA PROFUNDA: los 6 bloques extendidos =====
  // Catálogo completo: TODOS los ítems leídos de la web profunda y los
  // PDFs (la lista principal de arriba queda capada para los prompts).
  if (catalogItems.length) {
    d.catalog = {
      items: catalogItems.slice(0, 48),
      pages: (p.catalog && p.catalog.pages) || 0,
      pdfs: (p.catalog && p.catalog.pdfs) || 0,
      at: (p.catalog && p.catalog.at) || now,
    };
    d.fuentes.catalog = { at: d.catalog.at, items: d.catalog.items.length };
  }
  // Link de la bio: destinos reales del linktree/equivalente + los
  // ítems legibles de su tienda o página de reservas.
  if (p.bioLink && (p.bioLink.url || (p.bioLink.destinations || []).length)) {
    d.bio_link = {
      url: String(p.bioLink.url || '').slice(0, 300),
      kind: String(p.bioLink.kind || 'site').slice(0, 20),
      destinations: strList(p.bioLink.destinations || [], 12, 300),
      items: bioItems.slice(0, 20),
      at: p.bioLink.at || now,
    };
    d.fuentes.bio_link = { at: d.bio_link.at, kind: d.bio_link.kind };
  }
  // Contradicciones entre fuentes (mismo ítem, precio distinto): se
  // registran SIEMPRE y la resolución (fuente más fresca) es el precio
  // que ve el resto del sistema — nunca se mezclan en silencio.
  const fuenteAts = { dna: p.dnaAt || null, web: p.web ? now : null, catalog: (p.catalog && p.catalog.at) || null, 'bio-link': (p.bioLink && p.bioLink.at) || null };
  const priced = [];
  for (const [bucket, list] of Object.entries({ dna: [...dnaProds, ...dnaServs], web: webItems, catalog: catalogItems, 'bio-link': bioItems })) {
    for (const it of list) {
      if (it && it.precio) priced.push({ nombre: it.nombre, precio: it.precio, fuente: it.fuente || bucket, at: fuenteAts[bucket] });
    }
  }
  d.contradictions = detectContradictions(priced);
  for (const c of d.contradictions) {
    for (const it of [...d.productos, ...d.servicios]) {
      if (sameItemName(it.nombre, c.item)) it.precio = c.resolucion;
    }
  }
  // Producto estrella INFERIDO (frecuencia en su feed + prominencia en
  // su web + rendimiento medido): con evidencia, nunca adivinado.
  d.inferred_star = inferStar({
    items: [...d.productos, ...d.servicios],
    captions: p.feed && Array.isArray(p.feed.captions) ? p.feed.captions : [],
    orderNames: [...catalogItems, ...webItems, ...bioItems].map((x) => x.nombre),
    metrics: (p.starSignals && p.starSignals.metrics) || [],
    dnaStar: dna && dna.producto_estrella ? String(dna.producto_estrella) : '',
  });
  // Léxico propio: cómo nombra ÉL sus productos (apodos, slogans,
  // frases características), minado de sus captions + el copy de su web.
  const lexTexts = [];
  if (p.feed && Array.isArray(p.feed.captions)) for (const c of p.feed.captions) lexTexts.push(String(c || ''));
  if (p.webCopy) lexTexts.push(String(p.webCopy));
  if (p.web && p.web.description) lexTexts.push(String(p.web.description));
  if (dna && Array.isArray(dna.tono_ejemplos)) for (const t of dna.tono_ejemplos) lexTexts.push(String(t || ''));
  // El léxico se aprende sobre ítems REALES: todos los productos y los
  // servicios con fuente (ADN/web/catálogo). Los servicios minados de
  // la bio son especulativos (una frase de la bio puede ser un slogan,
  // no un servicio) y contaminarían entradas y frases.
  d.lexicon = buildLexicon({ texts: lexTexts, items: [...d.productos, ...d.servicios.filter((s) => s && s.fuente)] });
  if (d.lexicon) d.fuentes.lexicon = { at: now, entries: d.lexicon.entries.length, frases: d.lexicon.frases.length };
  // Mapa foto→producto: la clasificación por visión corre AFUERA (con
  // sus topes y guardas de gasto); acá solo se adoptan las entradas ya
  // clasificadas: { claveFoto: { item, confianza } }.
  if (p.photoEntries && typeof p.photoEntries === 'object' && Object.keys(p.photoEntries).length) {
    d.photo_map = { entries: sanitizePhotoEntries(p.photoEntries), at: now };
    if (Object.keys(d.photo_map.entries).length) d.fuentes.photo_map = { at: now, fotos: Object.keys(d.photo_map.entries).length };
    else d.photo_map = null;
  }
  d.built_at = now;
  return finalizeDigest(d);
}

function digestHashOf(digest) {
  const core = JSON.stringify({
    p: (digest.productos || []).map((x) => norm(x.nombre || x)),
    s: (digest.servicios || []).map((x) => norm(x.nombre || x)),
    pr: (digest.promos || []).map((x) => norm(x.titulo || x)),
    t: (digest.temas_feed || []).map(norm),
    pro: norm(digest.protagonista || ''), c: norm(digest.ciudad || ''),
    dif: norm(digest.diferencial || '').slice(0, 120),
  });
  return crypto.createHash('sha1').update(core).digest('hex').slice(0, 12);
}
function finalizeDigest(d) {
  d.hash = digestHashOf(d);
  // (v230) Los candidatos a pregunta (para "Posty pregunta") se derivan
  // del estrella inferido y de las contradicciones: determinísticos.
  d.question_candidates = questionCandidatesOf(d);
  return d;
}

// =====================================================================
// (v230) LECTURA PROFUNDA — helpers puros de los 6 bloques extendidos.
// Todo determinístico, USD 0: la única pieza con costo (la visión del
// mapa de fotos) corre afuera y acá solo se adoptan sus resultados.
// =====================================================================
function parsePriceNum(str) {
  const s = String(str || '').replace(/[$\s]/g, '').replace(/^(ars|usd)/i, '');
  if (!s) return null;
  // Formato AR: 11.900 = once mil novecientos; 1.234,56 con decimales.
  let v = s;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(v)) v = v.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/* ¿Dos nombres hablan del MISMO ítem? Igualdad normalizada o solape
 * alto de palabras distintivas (≥0,6) compartiendo al menos una —
 * "Blend Patagonia" vs "Blend Patagonia 500g" sí; "Café 250g" vs
 * "Café 500g" no (el tamaño es distintivo y baja el solape). */
function sameItemName(a, b) {
  const na = norm(a); const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = new Set(distinctiveWords(a));
  const wb = new Set(distinctiveWords(b));
  if (!wa.size || !wb.size) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  if (!inter) return false;
  return inter / Math.max(wa.size, wb.size) >= 0.6;
}

/* detectContradictions(priced) — priced: [{nombre, precio, fuente, at}].
 * Agrupa por ítem; si ≥2 fuentes dan precios numéricos DISTINTOS, hay
 * contradicción. Resolución: la fuente MÁS FRESCA (por `at`); en empate
 * de fecha manda el orden de viveza (el link de bio se actualiza sin
 * tocar la web; el ADN es lo más viejo por definición). */
const FRESH_TIE = ['bio-link', 'pdf', 'web-catalog', 'web', 'dna'];
function detectContradictions(priced) {
  const groups = [];
  for (const p of (priced || [])) {
    if (!p || !p.nombre || parsePriceNum(p.precio) == null) continue;
    let g = groups.find((x) => sameItemName(x.item, p.nombre));
    if (!g) { g = { item: p.nombre, byFuente: new Map() }; groups.push(g); }
    const prev = g.byFuente.get(p.fuente);
    if (!prev) g.byFuente.set(p.fuente, { precio: String(p.precio), num: parsePriceNum(p.precio), at: p.at || null });
  }
  const out = [];
  for (const g of groups) {
    if (g.byFuente.size < 2) continue;
    const nums = new Set([...g.byFuente.values()].map((v) => v.num));
    if (nums.size < 2) continue;
    const entries = [...g.byFuente.entries()].map(([fuente, v]) => ({ fuente, ...v }));
    entries.sort((a, b) => {
      const ta = Date.parse(a.at || '') || 0; const tb = Date.parse(b.at || '') || 0;
      if (tb !== ta) return tb - ta;
      return FRESH_TIE.indexOf(a.fuente) - FRESH_TIE.indexOf(b.fuente);
    });
    const win = entries[0];
    const valores = {};
    for (const e of entries) valores[e.fuente] = e.precio;
    out.push({
      item: g.item, campo: 'precio', valores,
      resolucion: win.precio, fuente_resolucion: win.fuente,
      at: new Date().toISOString(),
    });
  }
  return out.slice(0, 6);
}

/* inferStar — puntúa cada ítem con TRES señales reales y devuelve el
 * ganador SOLO si hay evidencia suficiente y no hay empate en la cima:
 * · frecuencia: en cuántos de sus captions recientes aparece;
 * · prominencia: qué tan arriba está en su catálogo/web;
 * · rendimiento: si su posteo con más alcance lo menciona.
 * La confianza sale del puntaje y de la distancia al segundo. */
function inferStar({ items, captions, orderNames, metrics, dnaStar }) {
  const list = (items || []).filter((x) => x && (x.nombre || x));
  if (!list.length) return null;
  const caps = (captions || []).slice(0, 20);
  const scored = list.map((it) => {
    const nombre = String(it.nombre || it);
    const anchors = anchorsFromTexts([nombre]);
    const hit = (text) => pieceAnchored(text, anchors).ok;
    let score = 0;
    const evidence = [];
    let mentions = 0;
    for (const c of caps) if (hit(c)) mentions++;
    if (mentions > 0) { score += mentions * 2; evidence.push(`aparece en ${mentions} de sus últimos ${caps.length} posteos`); }
    const oi = (orderNames || []).findIndex((n) => sameItemName(n, nombre));
    if (oi === 0) { score += 3; evidence.push('es lo primero que muestra su catálogo'); }
    else if (oi === 1) { score += 2; evidence.push('está entre lo primero de su catálogo'); }
    else if (oi === 2) { score += 1; }
    let bestReach = 0;
    for (const m of (metrics || [])) {
      if (m && m.text && hit(m.text)) bestReach = Math.max(bestReach, Number(m.reach) || 0);
    }
    if (bestReach > 0) {
      score += bestReach >= 1000 ? 4 : bestReach >= 300 ? 3 : 2;
      evidence.push('su posteo con más alcance lo menciona');
    }
    if (dnaStar && sameItemName(dnaStar, nombre)) { score += 2; evidence.push('figura como estrella en la ficha del negocio'); }
    return { item: nombre, score, evidence };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < 4) return null;
  if (second && second.score >= top.score) return null; // empate: no se adivina
  let confidence = Math.min(0.95, 0.45 + 0.08 * top.score);
  if (second && second.score >= top.score - 2) confidence *= 0.8;
  return {
    item: top.item,
    confidence: Math.round(confidence * 100) / 100,
    evidence: top.evidence,
    score: top.score,
    at: new Date().toISOString(),
  };
}

/* buildLexicon — mina los textos REALES del cliente (captions + copy de
 * su web + ejemplos de tono del ADN) y aprende cómo nombra ÉL a cada
 * ítem del digest: la forma que usa (dice), los apodos (formas más
 * cortas que el nombre formal) y sus frases características repetidas. */
function lexSegments(text) {
  const out = [];
  for (const part of String(text || '').split(/[\n\r|·•]+/)) {
    for (const s of part.split(/(?<=[.!?…])\s+|\s+—\s+|\s+-\s+/)) {
      const c = cleanSegment(s).replace(/[.!?…]+$/, '').trim();
      if (c) out.push(c);
    }
  }
  return out;
}
function buildLexicon({ texts, items }) {
  const segs = [];
  for (const t of (texts || [])) segs.push(...lexSegments(t));
  if (!segs.length) return null;
  const segWords = segs.map((s) => norm(s).split(' ').filter(Boolean));
  const entries = [];
  for (const it of (items || [])) {
    const nombre = String((it && (it.nombre || it)) || '').trim();
    if (nombre.length < 3) continue;
    const dw = distinctiveWords(nombre);
    if (!dw.length) continue;
    const dwForms = new Set();
    for (const w of dw) for (const f of wordForms(w)) dwForms.add(f);
    const candCount = new Map();
    segs.forEach((seg, si) => {
      const words = seg.split(' ').filter(Boolean);
      if (words.length < 2 || words.length > 9) return;
      const norms = segWords[si];
      const hits = [];
      norms.forEach((w, wi) => { if (dwForms.has(w)) hits.push(wi); });
      if (!hits.length) return;
      let start = Math.min(...hits);
      if (start > 0 && /^(el|la|los|las|nuestro|nuestra|nuestros|nuestras|mi|su)$/.test(norms[start - 1])) start--;
      let end = Math.min(words.length, Math.max(...hits) + 2);
      while (end > start + 1 && STOP.has(norms[end - 1])) end--;
      const candWords = words.slice(start, end);
      if (candWords.length < 1 || candWords.length > 4) return;
      const cand = candWords.join(' ');
      if (norm(cand) === norm(nombre)) return;
      candCount.set(cand, (candCount.get(cand) || 0) + 1);
    });
    // Una forma de UNA palabra vista una sola vez no es un hábito de
    // nombre: es una mención al pasar (o la palabra del rubro).
    for (const [c, n] of [...candCount.entries()]) {
      if (n < 2 && c.split(' ').filter(Boolean).length === 1) candCount.delete(c);
    }
    if (!candCount.size) continue;
    // Gana la forma más usada; en empate, la MÁS CORTA (la forma natural
    // de nombrarlo le gana a la frase larga que la contiene).
    const ranked = [...candCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].split(' ').length - b[0].split(' ').length)
      .map(([c]) => c);
    const nombreWords = nombre.split(' ').filter(Boolean).length;
    const firstWord = norm(nombre).split(' ')[0];
    // "dice" necesita sustancia: ≥2 palabras, o una sola palabra que NO
    // sea la primera del nombre formal (la primera sola es solo el rubro:
    // "Café" no es una forma de nombrar a "Café en grano 250g";
    // "Patagonia" sí es una forma de nombrar al "Blend Patagonia").
    const dice = ranked.find((c) => {
      const w = c.split(' ').filter(Boolean);
      return w.length >= 2 || norm(c) !== firstWord;
    }) || null;
    const apodos = ranked
      .filter((c) => c !== dice && c.split(' ').filter(Boolean).length < nombreWords)
      .slice(0, 2);
    entries.push({ item: nombre, ...(dice ? { dice } : {}), apodos });
  }
  // Frases características: segmentos de 3-8 palabras que se REPITEN
  // (≥2 veces) en sus textos — su muletilla buena, su slogan de hecho.
  const freq = new Map();
  for (const s of segs) {
    const w = s.split(' ').filter(Boolean);
    if (w.length < 3 || w.length > 8) continue;
    if (CTA_ONLY_RE.test(norm(s))) continue;
    const k = norm(s);
    const prev = freq.get(k);
    freq.set(k, { text: s, count: (prev ? prev.count : 0) + 1 });
  }
  const itemNorms = new Set((items || []).map((it) => norm((it && (it.nombre || it)) || '')));
  const frases = [...freq.values()]
    .filter((f) => f.count >= 2 && !itemNorms.has(norm(f.text)))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((f) => f.text);
  if (!entries.length && !frases.length) return null;
  return { entries, frases, at: new Date().toISOString() };
}
/* Bloque de prompt para captions/titulares: sus nombres mandan. */
function lexiconBlock(lexicon) {
  if (!lexicon || typeof lexicon !== 'object') return '';
  const lines = [];
  for (const e of (lexicon.entries || []).slice(0, 8)) {
    if (!e || !e.item) continue;
    const bits = [];
    if (e.dice) bits.push(`él lo nombra "${e.dice}"`);
    if ((e.apodos || []).length) bits.push(`apodos suyos: ${e.apodos.map((a) => `"${a}"`).join(', ')}`);
    if (bits.length) lines.push(`- ${e.item}: ${bits.join(' · ')}`);
  }
  const out = [];
  if (lines.length) {
    out.push('LÉXICO DEL CLIENTE (nombrá sus productos EXACTAMENTE como los nombra él en su Instagram y su web; esas formas mandan sobre el nombre formal del catálogo):');
    out.push(...lines);
  }
  if ((lexicon.frases || []).length) {
    out.push(`Frases características del cliente (su voz real; podés reutilizar UNA tal cual si encaja): ${lexicon.frases.slice(0, 4).map((f) => `"${f}"`).join(' · ')}`);
  }
  return out.join('\n');
}

/* Mapa foto→producto: adopción y consulta de entradas clasificadas. */
function sanitizePhotoEntries(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!v || typeof v !== 'object') continue;
    const item = String(v.item || v.nombre || '').replace(/\s+/g, ' ').trim();
    if (item.length < 3) continue;
    const conf = Number(v.confianza != null ? v.confianza : v.confidence);
    out[String(k).slice(0, 300)] = { item: item.slice(0, 90), confianza: Number.isFinite(conf) ? Math.min(1, Math.max(0, conf)) : 0.8 };
    if (Object.keys(out).length >= 200) break;
  }
  return out;
}
function photoProductFor(digest, key) {
  if (!digest || !digest.photo_map || !digest.photo_map.entries || !key) return null;
  const e = digest.photo_map.entries[String(key)];
  return e && e.item ? e.item : null;
}

/* Candidatos a pregunta para la próxima build ("Posty pregunta"): el
 * estrella inferido se CONFIRMA con un toque y cada contradicción se
 * resuelve preguntando — leer propone, el dueño valida. */
function questionCandidatesOf(d) {
  if (!d || typeof d !== 'object') return [];
  const out = [];
  // (v235) RUBRO PRIMERO: es el primer dominó (de él cuelgan temas y
  // prompts). Si la identificación quedó sin confirmar, la pregunta va
  // con las candidatas reales y su evidencia — la consume "Posty
  // pregunta"; en la prueba la misma duda se pregunta ANTES de generar.
  const rid = d.rubro_id;
  if (rid && rid.needs_question && Array.isArray(rid.candidatas) && rid.candidatas.length) {
    // Las opciones salen de questionOptions: en duda de SUBRUBRO ofrece
    // los subrubros del rubro firme (makeup/uñas/estética…), no solo la
    // candidata agregada.
    let opciones = rubroId.questionOptions({ rubro: rid.rubro, nivel_duda: rid.nivel_duda || 'rubro', candidatas: rid.candidatas });
    if (!opciones.length) {
      opciones = rid.candidatas.slice(0, 3).map((c) => ({
        rubro: c.rubro, subrubro: c.subrubro || '', label: rubroId.labelFor(c.rubro, c.subrubro),
      }));
    }
    const labels = opciones.map((o) => o.label);
    out.push({
      tipo: 'rubro', rubro: rid.rubro, subrubro: rid.subrubro || '', opciones,
      evidencia: rid.evidencia || [],
      texto: labels.length >= 2
        ? `¿Tu negocio es más ${labels[0]} o ${labels[1]}?`
        : `¿Confirmás que tu rubro es ${labels[0]}?`,
    });
  }
  const star = d.inferred_star;
  if (star && star.item && (star.confidence || 0) >= 0.5) {
    out.push({ tipo: 'estrella', item: star.item, texto: `¿Tu producto estrella es ${star.item}?` });
  }
  for (const c of (d.contradictions || []).slice(0, 2)) {
    const vs = Object.entries(c.valores || {}).map(([f, v]) => `${v} (${f === 'bio-link' ? 'link de bio' : f === 'web-catalog' ? 'catálogo web' : f === 'pdf' ? 'PDF' : f})`).join(' vs ');
    if (vs) out.push({ tipo: 'contradiccion', item: c.item, texto: `¿Cuál es el precio actual de ${c.item}? Figura ${vs}.` });
  }
  return out.slice(0, 3);
}

/* applyDeepBlocks(stored, fresh) — merge del refresco semanal: los
 * bloques profundos FRESCOS reemplazan a los viejos (el fresco se
 * construyó desde el ADN vigente: lo editado a mano sigue mandando
 * porque el ADN es la primera fuente de cada lista). El mapa de fotos
 * se fusiona por clave (clasificar es caro: lo ya clasificado queda).
 * Nunca pisa un bloque con vacío: si la corrida fresca no leyó un
 * bloque, el guardado queda. */
function applyDeepBlocks(stored, fresh) {
  const out = { ...(stored || emptyDigest()) };
  if (!fresh) return finalizeDigest(out);
  // Listas: unión con prioridad del fresco (se construyó desde el ADN
  // vigente) — una corrida parcial (solo web, solo feed) nunca borra
  // ítems que aportó otra fuente y todavía no se re-leyó.
  const unionItems = (freshList, storedList, cap) => {
    const res = []; const seen = new Set();
    for (const it of [...(freshList || []), ...(storedList || [])]) {
      const n = it && (it.nombre || it.titulo || it);
      if (!n) continue;
      const k = norm(String(n));
      if (seen.has(k)) continue;
      seen.add(k); res.push(it);
      if (res.length >= cap) break;
    }
    return res;
  };
  if (fresh.catalog && (fresh.catalog.items || []).length) {
    out.catalog = fresh.catalog;
    out.productos = unionItems(fresh.productos, out.productos, 12);
    out.servicios = unionItems(fresh.servicios, out.servicios, 10);
    out.promos = (fresh.promos && fresh.promos.length) ? fresh.promos : out.promos;
    if (fresh.fuentes && fresh.fuentes.catalog) out.fuentes = { ...(out.fuentes || {}), catalog: fresh.fuentes.catalog };
  }
  if (fresh.bio_link) {
    out.bio_link = fresh.bio_link;
    out.productos = unionItems(fresh.productos, out.productos, 12);
    if (fresh.fuentes && fresh.fuentes.bio_link) out.fuentes = { ...(out.fuentes || {}), bio_link: fresh.fuentes.bio_link };
  }
  // El léxico se re-mina de los captions: solo reemplaza si la corrida
  // fresca TUVO feed (sin captions, el "fresco" sería parcial).
  if (fresh.lexicon && fresh.fuentes && fresh.fuentes.feed) {
    out.lexicon = fresh.lexicon;
    if (fresh.fuentes.lexicon) out.fuentes = { ...(out.fuentes || {}), lexicon: fresh.fuentes.lexicon };
  }
  if (fresh.photo_map && fresh.photo_map.entries && Object.keys(fresh.photo_map.entries).length) {
    const mergedEntries = { ...((out.photo_map && out.photo_map.entries) || {}), ...fresh.photo_map.entries };
    out.photo_map = { entries: mergedEntries, at: fresh.photo_map.at || new Date().toISOString() };
    if (fresh.fuentes && fresh.fuentes.photo_map) out.fuentes = { ...(out.fuentes || {}), photo_map: { at: out.photo_map.at, fotos: Object.keys(mergedEntries).length } };
  }
  if (fresh.inferred_star) out.inferred_star = fresh.inferred_star;
  // Las contradicciones se recalculan cuando hubo lectura fresca con
  // precios (aunque el resultado sea "ya no se contradicen": [] manda).
  if (fresh.catalog || fresh.bio_link) out.contradictions = fresh.contradictions || [];
  else if (Array.isArray(fresh.contradictions) && fresh.contradictions.length) out.contradictions = fresh.contradictions;
  // (v235) RUBRO_ID: el guardado MANDA — el merge nunca lo reemplaza por
  // la clasificación fresca. Solo se completa si el guardado no tenía
  // (digest viejo). La reclasificación la decide el barrido semanal
  // explícitamente (server.js refreshDigestsSweep): si difiere con
  // confianza alta, adopta dejando pregunta pendiente — nunca en
  // silencio.
  if (!out.rubro_id && fresh.rubro_id) out.rubro_id = fresh.rubro_id;
  out.built_at = new Date().toISOString();
  return finalizeDigest(out);
}
function hasFoundation(digest) {
  if (!digest) return false;
  return (digest.productos || []).length + (digest.servicios || []).length >= 1
    || (digest.temas_feed || []).length >= 2;
}

// ---------- derivación de temas de la PRUEBA desde el digest ----------
/* Reglas determinísticas por kind (la plantilla SOLO rellena huecos):
 * novedad = producto/servicio real N.º 1 · promo = promo real o ítem
 * N.º 2 · tip = un servicio · social = un tema real de su feed ·
 * reserva/CTA = servicio con turnos. Cada tema lleva su ancla
 * (digest_anchor) y el tema fotográfico del gate (tema). */
function capWords(s, max) {
  const w = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (w.length <= max) return w.join(' ');
  const clauses = String(s).split(/\s*[:;—]\s*|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  for (const c of clauses) { const cw = c.split(' '); if (cw.length >= 2 && cw.length <= max) return c; }
  return w.slice(0, max).join(' ');
}
function deriveTopics(digest, opts) {
  const o = opts || {};
  const count = Math.min(Math.max(parseInt(o.count, 10) || 5, 1), 6);
  const category = o.category || digest.category || 'otro';
  if (!hasFoundation(digest)) return [];
  const items = [...(digest.productos || []), ...(digest.servicios || [])]
    .filter((x) => x && (x.nombre || x));
  const name = (x) => String((x && (x.nombre || x)) || '').trim();
  // (v230) El producto estrella INFERIDO (con confianza ≥0,5) abre la
  // rotación: la novedad de la semana es él. La confirmación del dueño
  // llega por el loop de preguntas (question_candidates).
  let starName = '';
  if (digest.inferred_star && digest.inferred_star.item && (digest.inferred_star.confidence || 0) >= 0.5) {
    const si = items.findIndex((x) => sameItemName(name(x), digest.inferred_star.item));
    if (si > 0) { const [sx] = items.splice(si, 1); items.unshift(sx); }
    if (si >= 0) starName = name(items[0]);
  }
  const temasFeed = (digest.temas_feed || []).filter((t) => String(t).length >= 3);
  const used = new Set();
  const topics = [];
  // 🧠 (v232) CEREBRO COMERCIAL: cada tema derivado nace con intención
  // de venta, ángulo y prueba DECLARADOS (sales-brain, require perezoso
  // para no crear un ciclo de módulos). Los temas de RELLENO nunca
  // pasan por acá: demo.js los capa a autoridad (el relleno no vende
  // lo que no conoce).
  let salesBrain = null;
  try { salesBrain = require('./sales-brain'); } catch (e) { salesBrain = null; }
  const mk = (kind, anchorText, frame) => {
    const A = String(anchorText || '').trim();
    if (A.length < 3) return null;
    const key = norm(A);
    let sales = {};
    if (salesBrain) {
      try { sales = salesBrain.trialTopicSales({ kind, digest_anchor: A }, digest) || {}; } catch (e) { sales = {}; }
    }
    const t = {
      kind,
      tag: frame.tag || '',
      tema: temaForText(A, category, (digest && digest.subcat) || ''),
      headline: capWords(frame.headline(A), 6),
      subline: frame.subline ? capWords(frame.subline(A), 8) : '',
      cta: frame.cta || '',
      caption: frame.caption(A),
      _digest: 1,
      digest_anchor: A,
      intent: sales.intent || '',
      angle: sales.angle || '',
      proof: sales.proof || '',
      ...(starName && norm(A) === norm(starName) ? { _star: 1 } : {}),
    };
    used.add(key);
    return t;
  };
  const pickItem = (idx) => {
    for (let i = idx; i < items.length; i++) if (!used.has(norm(name(items[i])))) return items[i];
    return null;
  };
  const bizPh = '{BIZ}';
  // 1) NOVEDAD — el ítem real N.º 1.
  const it1 = pickItem(0);
  if (it1) {
    const A = name(it1);
    const t = mk('novedad', A, {
      tag: 'NUEVO',
      headline: (x) => x,
      subline: (x) => (it1.precio ? `A ${it1.precio}, como lo ves` : ''),
      cta: 'Quiero el mío',
      caption: (x) => `${x} ya está en ${bizPh} ✨\n\n${it1.precio ? `Lo tenés a ${it1.precio}. ` : ''}Recién llegado y listo para vos.\n\nPedilo hoy por DM 📩`,
    });
    if (t) topics.push(t);
  }
  // 2) PROMO — promo real; si no hay, el ítem N.º 2 como novedad.
  // (v231) TITULAR-OFERTA CON NÚMERO (adopción Predis): en promo, el
  // titular ES la oferta con su número — si el título de la promo no
  // trae número pero el digest conoce su precio, el precio sube al
  // titular (o a la bajada si el título ya es largo). El número sale
  // SIEMPRE del digest: sin número en el digest, la promo sale sin
  // número (candado de verdad, promoNumberGuard).
  const promo = (digest.promos || [])[0];
  if (promo && (promo.titulo || promo)) {
    const A = String(promo.titulo || promo).trim();
    const promoPrice = (promo && typeof promo === 'object') ? String(promo.precio || '').trim() : '';
    const tituloWords = A.split(/\s+/).filter(Boolean).length;
    const tituloHasNum = numbersInText(A).size > 0;
    const priceInHeadline = !!promoPrice && !tituloHasNum && tituloWords <= 4;
    const t = mk('promo', A, {
      tag: 'PROMO',
      headline: (x) => (priceInHeadline ? `${x} a ${promoPrice}` : x),
      subline: () => ((promoPrice && !tituloHasNum && !priceInHeadline) ? `A ${promoPrice}, como lo ves` : ''),
      cta: 'Quiero aprovecharla',
      caption: (x) => `${x} en ${bizPh} 🔥\n\nEs por tiempo limitado: cuando se termina, se termina.\n\nEscribinos y te lo reservamos 📩`,
    });
    if (t) topics.push(t);
  } else {
    const it2 = pickItem(1);
    if (it2) {
      const A = name(it2);
      const t = mk('novedad', A, {
        tag: 'NUEVO',
        headline: (x) => x,
        subline: (x) => (it2.precio ? `A ${it2.precio}` : ''),
        cta: 'Quiero el mío',
        caption: (x) => `${x}, otro favorito de ${bizPh} ✨\n\n${it2.precio ? `A ${it2.precio}. ` : ''}Pasá a buscarlo o pedilo por DM.\n\nTe esperamos 📩`,
      });
      if (t) topics.push(t);
    }
  }
  // 3) TIP — un servicio (u otro ítem no usado).
  const tipItem = pickItem(0) || it1;
  if (tipItem) {
    const A = name(tipItem);
    const short = capWords(A, 3);
    const t = mk('tip', A, {
      tag: 'TIP',
      headline: () => `3 claves de ${short.toLowerCase()}`,
      subline: () => 'Lo que miramos antes de elegir',
      cta: 'Guardá este tip',
      caption: (x) => `3 claves para elegir bien tu ${short.toLowerCase()} 👇\n\nCalidad, detalle y que sea de ${bizPh}: así trabajamos ${x.toLowerCase()}.\n\nGuardá este posteo para cuando lo necesites 🔖`,
    });
    if (t) topics.push(t);
  }
  // 4) SOCIAL — un tema REAL de su feed.
  const feedTema = temasFeed.find((t) => !used.has(norm(t)) && temasFromFreeText(t).length >= 0 && String(t).split(' ').length >= 2)
    || temasFeed.find((t) => !used.has(norm(t)));
  if (feedTema) {
    const A = String(feedTema);
    const t = mk('social', A, {
      tag: '',
      headline: (x) => (/^[a-z]+$/.test(x) ? `${x.charAt(0).toUpperCase() + x.slice(1)}, como siempre` : x),
      subline: () => '',
      cta: '',
      caption: (x) => `${x} es de lo que más nos piden en ${bizPh} ✨\n\nGracias por elegirnos y recomendarnos siempre.\n\nContanos: ¿ya lo probaste? 👇`,
    });
    if (t) topics.push(t);
  }
  // 5) RESERVA/CTA — servicio con turnos; si no hay señal de reservas,
  // cierra con el ítem estrella en clave de pedido directo.
  const bookItem = pickItem(0) || it1;
  if (bookItem && digest.has_booking) {
    const A = name(bookItem);
    const t = mk('reserva', A, {
      tag: 'TURNOS',
      headline: (x) => `Reservá tu ${capWords(x, 3).toLowerCase()}`,
      subline: () => 'Los lugares de la semana vuelan',
      cta: 'Reservar ahora',
      caption: (x) => `Agenda abierta para ${x.toLowerCase()} en ${bizPh} 📩\n\nLos turnos de la semana se ocupan rápido.\n\nReservá el tuyo por DM 📩`,
    });
    if (t) topics.push(t);
  } else if (it1) {
    const A = name(it1);
    if (!topics.some((t) => t.kind === 'reserva')) {
      const t = mk('reserva', A, {
        tag: '',
        headline: (x) => `${capWords(x, 4)}: pedilo hoy`,
        subline: () => '',
        cta: 'Pedir ahora',
        caption: (x) => `${x} te espera en ${bizPh} ✨\n\nPedilo hoy y retiralo cuando quieras.\n\nEscribinos por DM 📩`,
      });
      if (t) topics.push(t);
    }
  }
  return topics.slice(0, count);
}

// ---------- persistencia ----------
function ensureTable(db) {
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS client_digest (
      user_id INTEGER PRIMARY KEY,
      digest_json TEXT DEFAULT '{}',
      hash TEXT DEFAULT '',
      version INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
  } catch (e) { /* la crea db.js igual; defensivo */ }
}
function saveDigest(db, userId, digest) {
  ensureTable(db);
  const d = finalizeDigest(digest);
  db.prepare(`INSERT INTO client_digest (user_id, digest_json, hash, version, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET digest_json=excluded.digest_json, hash=excluded.hash,
      version=excluded.version, updated_at=datetime('now')`)
    .run(userId, JSON.stringify(d), d.hash || '', DIGEST_VERSION);
  return d;
}
function getStoredDigest(db, userId) {
  try {
    ensureTable(db);
    const r = db.prepare('SELECT digest_json FROM client_digest WHERE user_id = ?').get(userId);
    if (r && r.digest_json) { const o = JSON.parse(r.digest_json); if (o && typeof o === 'object') return o; }
  } catch (e) {}
  return null;
}
/* getDigest: el guardado; si no hay, uno efímero desde ADN+perfil
 * (las cuentas viejas tienen fundamento sin haber pasado por la prueba
 * nueva — el chequeo de pertenencia no puede quedar ciego por eso). */
function getDigest(db, userId) {
  const stored = getStoredDigest(db, userId);
  if (stored) return stored;
  try {
    const prof = db.prepare('SELECT business_name, category, description, ig_username FROM profiles WHERE user_id = ?').get(userId) || {};
    const dr = db.prepare('SELECT dna_json FROM business_dna WHERE user_id = ?').get(userId);
    const dna = dr && dr.dna_json ? JSON.parse(dr.dna_json) : {};
    return buildFromParts({
      business: prof.business_name, category: prof.category,
      dna, form: { description: prof.description || '' },
    });
  } catch (e) { return emptyDigest(); }
}

/* Fragmento de ADN que se siembra desde el digest al registrarse:
 * solo campos con dato real — nunca pisa lo que el dueño ya cargó. */
function dnaFragmentFromDigest(digest) {
  if (!digest) return {};
  const frag = {};
  if ((digest.productos || []).length) frag.productos = digest.productos;
  if ((digest.servicios || []).length) frag.servicios = digest.servicios;
  if ((digest.promos || []).length) frag.promos_activas = digest.promos.map((pr) => ({ nombre: pr.titulo, ...(pr.precio ? { precio: pr.precio } : {}) }));
  const first = (digest.productos || [])[0] || (digest.servicios || [])[0];
  // (v230) El estrella INFERIDO con confianza le gana al "primer ítem
  // de la lista": viene de su feed, su web y su rendimiento medidos.
  const starInf = (digest.inferred_star && (digest.inferred_star.confidence || 0) >= 0.5) ? digest.inferred_star.item : '';
  if (starInf) frag.producto_estrella = starInf;
  else if (first) frag.producto_estrella = first.nombre || first;
  if (digest.diferencial) frag.diferencial = digest.diferencial;
  if (digest.ciudad) frag.ubicacion = digest.ciudad;
  const webSrc = digest.fuentes && digest.fuentes.web && digest.fuentes.web.url;
  if (webSrc) frag.website_url = webSrc;
  return frag;
}

module.exports = {
  DIGEST_VERSION,
  norm, distinctiveWords, wordForms, textWordSet, anchorsOf, anchorsFromTexts, pieceAnchored,
  offeringsFromText, temasFromFreeText, temaForText,
  buildFromParts, emptyDigest, finalizeDigest, digestHashOf, hasFoundation,
  deriveTopics, ensureTable, saveDigest, getStoredDigest, getDigest,
  dnaFragmentFromDigest,
  // (v231) Adopción de patrones: candado de números de promo
  numbersInText, digestNumbers, promoNumberGuard,
  // (v230) Lectura profunda
  parsePriceNum, sameItemName, detectContradictions, inferStar,
  buildLexicon, lexiconBlock, sanitizePhotoEntries, photoProductFor,
  questionCandidatesOf, applyDeepBlocks,
  // (v235) Identificación de rubro (rubro-id.js re-exportado)
  rubroId,
};
