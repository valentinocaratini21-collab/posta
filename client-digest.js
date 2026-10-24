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
  // (Posty conectado) Un producto SIN STOCK en su Tiendanube no ancla
  // piezas: promocionarlo es vender lo que no tiene. Solo se filtran
  // anclas de producto cuyo nombre coincide con su out_of_stock.
  const oosNames = tnOutOfStockNames(digest);
  const usable = oosNames.length
    ? anchors.filter((a) => !(a.kind === 'producto' && tnNameMatch(a.text, oosNames)))
    : anchors;
  // Dedup por frase normalizada, conservando el orden de especificidad.
  const seen = new Set();
  return usable.filter((a) => {
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

// ---------- (2026-10-20) POSTY CONECTADO: lectura del bloque Tiendanube ----------
// digest.connections.tiendanube = { store_name, connected_at, synced_at,
// products_total, star:{name, units_30d}|null, out_of_stock:[nombres],
// quiet:[nombres], top_sellers:[{name, units}] } — lo escribe el sync de
// server.js desde tiendanube.digestFromTiendanube (ventas/stock REALES).
// Acá solo se lee, en los puntos de consumo del fundamento.
function tnBlockOf(digest) {
  const b = digest && digest.connections && digest.connections.tiendanube;
  return (b && typeof b === 'object') ? b : null;
}
function tnNameMatch(name, list) {
  const n = String(name || '');
  if (!n || !Array.isArray(list)) return false;
  return list.some((x) => sameItemName(n, String(x || '')));
}
function tnOutOfStockNames(digest) {
  const tn = tnBlockOf(digest);
  return (tn && Array.isArray(tn.out_of_stock)) ? tn.out_of_stock.map(String) : [];
}
function tnQuietNames(digest) {
  const tn = tnBlockOf(digest);
  return (tn && Array.isArray(tn.quiet)) ? tn.quiet.map(String) : [];
}
/* La estrella EFECTIVA del negocio, por fuerza de fuente: lo que el
 * dueño confirmó en persona > las VENTAS reales de su tienda (Posty
 * conectado) > la inferida del feed por likes. Devuelve
 * {item, source:'dueno'|'sales'|'inferred', evidence[]} o null.
 * star_source='sales' marca que la estrella es medición, no lectura. */
function effectiveStarOf(digest) {
  if (!digest || typeof digest !== 'object') return null;
  const duenoStar = digest.dueno && digest.dueno.estrella;
  if (duenoStar) return { item: String(duenoStar), source: 'dueno', evidence: [] };
  const inf = digest.inferred_star;
  if (inf && inf.item && inf.fuente === 'dueno') {
    return { item: String(inf.item), source: 'dueno', evidence: (Array.isArray(inf.evidence) ? inf.evidence : []).map(String) };
  }
  const tn = tnBlockOf(digest);
  if (tn && tn.star && tn.star.name && (tn.star.units_30d || 0) > 0) {
    const u = tn.star.units_30d;
    return {
      item: String(tn.star.name), source: 'sales', units_30d: u,
      evidence: [`vendió ${u} unidades en los últimos 30 días (ventas reales de su Tiendanube)`],
    };
  }
  if (inf && inf.item && (inf.confidence || 0) >= 0.5) {
    return { item: String(inf.item), source: 'inferred', evidence: (Array.isArray(inf.evidence) ? inf.evidence : []).map(String) };
  }
  return null;
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
/* (v343) PUERTA DE ADMISIBILIDAD DE ÍTEMS — el caso Gesty (prueba
 * real del 2026-10-23): la minería de prosa y la lista de "servicios"
 * de la home admitían fragmentos de oración como si fueran servicios
 * ("esta cuenta la present…", "Serena y muy ordenada", el slogan del
 * hero como producto estrella) y la generación anclaba TODA la semana
 * en ese fragmento. Un ítem entra al fundamento solo si es una frase
 * nominal plausible respaldada por su fuente: sin puntuación de
 * oración, sin verbos conjugados de prosa, sin aperturas de párrafo,
 * ≤5 palabras. Lo que no pasa NO entra: la lista queda vacía y la
 * generación ancla en temas del negocio — jamás en un servicio
 * inventado a partir de prosa. */
const OFFER_PROSE_VERBS = new Set(('es son esta estan tiene tienen hace hacen deja dejan sale salen abre abren presenta presentan significa significan trabaja trabajan contrate necesites quieras puedas quieres puedes somos era fue queda quedan parece resulta ofrece ofrecen brinda brindan incluye incluyen permite permiten llego llegaron anuncia sumamos vende venden').split(' '));
const OFFER_PROSE_OPENERS = new Set(('su sus esta este esto estos estas nuestro nuestra nuestros nuestras colores personalidad simbolo todo toda todos todas').split(' '));
/* (v348 · D4) La puerta v346 era ESTRUCTURAL: dejaba pasar basura con
 * forma de frase nominal — sustantivos de AUDIENCIA sueltos ("Comercios",
 * "Profesionales": el público del negocio, no su oferta) y frases en
 * SEGUNDA PERSONA ("Aprende tu negocio una vez", "Vos aprobás lo
 * sensible": copy dirigido AL dueño, no algo que el negocio vende).
 * Ninguna de las dos clases puede ser un producto/servicio: se rechazan
 * acá, en la única puerta de admisión, para que ningún camino (minería,
 * catálogo, bio-link, ADN, unión de refresco) las vuelva a sembrar. */
const OFFER_AUDIENCE_NOUNS = new Set(['comercios', 'negocios', 'profesionales', 'pymes', 'clientes', 'emprendedores', 'empresas', 'personas', 'usuarios', 'seguidores', 'emprendimientos']);
const OFFER_SECOND_PERSON = new Set(['tu', 'tus', 'vos', 'te', 'ti', 'contigo', 'tuyo', 'tuya', 'tuyos', 'tuyas']);
const OFFER_2P_VERBS = new Set(['aprende', 'aprendes', 'aprobas', 'aproba', 'descubre', 'descubri', 'empeza', 'empezas', 'mira', 'miras', 'suma', 'sumas', 'sumate', 'uni', 'unis', 'unite', 'gana', 'ganas', 'ahorra', 'ahorras', 'crece', 'creces', 'ordena', 'ordenas', 'organiza', 'organizas', 'delega', 'delegas', 'vende', 'vendes', 'elegi', 'elegis', 'elegilo', 'hace', 'haces', 'hacelo', 'tene', 'tenes', 'pode', 'podes', 'quere', 'queres', 'senti', 'sentis', 'pensa', 'pensas', 'cree', 'crees', 'segui', 'seguis', 'veni', 'venis', 'abri', 'abris', 'cerra', 'cerras', 'entra', 'entras', 'sali', 'salis', 'dormi', 'dormis', 'rei', 'reis']);
function cleanOfferName(raw) {
  const v = (raw && typeof raw === 'object') ? (raw.nombre || raw.titulo || raw.name || '') : raw;
  return String(v || '').replace(/\s+/g, ' ')
    .replace(/^[\u2713\u2714•·\-\u2013\u2014*\s]+/, '')
    .replace(/[.\u3002]+$/, '').trim();
}
function isPlausibleOfferItem(raw) {
  const s = cleanOfferName(raw);
  if (s.length < 3 || s.length > 60) return false;
  if (/[,;:!?\u00a1\u00bf]/.test(s)) return false; // puntuación de oración o de lista interna
  const words = s.split(' ').filter(Boolean);
  if (words.length < 1 || words.length > 5) return false;
  const nw = words.map((w) => norm(w)).filter(Boolean);
  if (!nw.length) return false;
  if (OFFER_PROSE_OPENERS.has(nw[0])) return false;
  if (nw.some((w) => OFFER_PROSE_VERBS.has(w))) return false;
  if (nw.includes('muy') || nw.includes('tan')) return false;
  // (v348 · D4) Audiencia suelta: "Comercios" nombra a QUIÉN vende el
  // negocio, no QUÉ vende — como ítem standalone es basura del fundamento.
  if (nw.length === 1 && OFFER_AUDIENCE_NOUNS.has(nw[0])) return false;
  // (v348 · D4) Segunda persona: un ítem que le habla AL dueño ("tu
  // negocio", "vos aprobás") es copy de venta del propio Posty o un
  // fragmento de pitch — nunca la oferta del negocio.
  if (nw.some((w) => OFFER_SECOND_PERSON.has(w))) return false;
  if (nw.some((w) => OFFER_2P_VERBS.has(w))) return false;
  return true;
}
function cleanOfferRaw(x) {
  if (x && typeof x === 'object') {
    const n = cleanOfferName(x);
    return n ? { ...x, nombre: n } : x;
  }
  return cleanOfferName(x);
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
    // (v343) La puerta manda también acá: un segmento de prosa que no
    // es una oferta plausible no se convierte en "servicio".
    if (!isPlausibleOfferItem(s)) continue;
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
    // (v348 · D2) ETAPA del negocio: '' = operando; 'pre-lanzamiento' =
    // todavía no abrió (fecha futura + léxico de lanzamiento en sus
    // propios textos). La semana de un negocio que no lanzó PRESENTA y
    // suma a la lista de espera: no vende stock, no reserva turnos, no
    // corre sorteos — el caso Gesty: Posty le armó la semana de un
    // negocio en operación y el negocio abre recién el 21/6/2027.
    etapa: '', lanzamiento_fecha: null,
    // (v230) LECTURA PROFUNDA: bloques extendidos (ver sección al final).
    // null/vacío = todavía no leídos; el hash de anclas NO los cubre (la
    // trazabilidad de v229 no se invalida: el hash sigue siendo el de
    // productos/servicios/promos/temas/protagonista/ciudad/diferencial).
    catalog: null, bio_link: null, lexicon: null, photo_map: null,
    inferred_star: null, contradictions: [], question_candidates: [],
    // (2026-10-20) POSTY CONECTADO: bloques de conexiones externas de
    // SOLO LECTURA (hoy: connections.tiendanube, que escribe el sync de
    // server.js desde tiendanube.js). null = sin conexiones. El hash de
    // anclas NO lo cubre (no es fundamento leído del feed/web).
    connections: null,
    // (v235) Identificación de rubro versionada (rubro-id.js): fuente de
    // verdad de rubro+subrubro+confianza+fuente. null = aún no clasificado.
    rubro_id: null,
    // (v238) POSTY PREGUNTA: lo que el DUEÑO respondió en persona (la
    // fuente más fuerte): { estrella, mas_vendido, cliente, no_publicar,
    // precios: {normItem: {item, precio}}, promos_ninguna_at }. El
    // refresco semanal lo preserva (applyDeepBlocks) y los candidatos a
    // pregunta lo respetan (questionCandidatesOf). null = sin respuestas.
    dueno: null,
    // (v306) RADAR SEMANAL (posty-questions): la respuesta del dueño a
    // "qué se viene esta semana?" — { tipo, detalle, week_key, at }.
    // PERECEDERO por diseño: solo lo consume radarWeekLine si week_key
    // es la semana en curso; el refresco lo preserva (copia base) pero
    // la semana siguiente ya no se usa. null = sin respuesta esta semana.
    radar: null,
    // (v392) MEMORIA DE GUSTOS (taste-memory.js): lo que el DUEÑO enseñó
    // en el chat (explícito) o con sus ediciones repetidas (patrón, solo
    // con su confirmación). gustos = registro canónico { tipo, valor,
    // ejemplo, at, origen, estado }; pendientes = propuestas esperando
    // su sí/no; evidencia = correcciones contadas por tipo; rechazos =
    // cooldown tras un «no». El hash de anclas NO los cubre (no son
    // fundamento leído) y el refresco semanal los preserva:
    // applyDeepBlocks parte del digest guardado y el fresco nunca los
    // trae.
    gustos: [], gustos_pendientes: [], gustos_evidencia: {}, gustos_rechazos: {},
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
  // (2026-10-24 — Fix 2) La ingesta de ADN pasa la MISMA puerta que la
  // web/catálogo/bio: antes itemListF tomaba las listas del ADN crudas
  // y un ítem de prosa truncada guardado en el ADN (el «Esta cuenta la
  // present» de la cuenta 80) entraba al fundamento sin filtro.
  const dnaProds = dna ? itemListF([...(dna.productos || []).filter(isPlausibleOfferItem), ...(dna.producto_estrella && isPlausibleOfferItem(dna.producto_estrella) ? [{ nombre: dna.producto_estrella }] : [])], 12, 'dna') : [];
  const dnaServs = dna ? itemListF((dna.servicios || []).filter(isPlausibleOfferItem), 10, 'dna') : [];
  // (v343) La lista de la home también pasa la puerta y se limpia
  // (glifos ✓, punto final): un heading/slogan no es un servicio.
  const webItems = p.web ? itemListF((p.web.services || []).filter(isPlausibleOfferItem).map(cleanOfferRaw), 10, 'web') : [];
  // (v345) El catálogo profundo y el link de bio pasan por la MISMA
  // puerta que la home: el crawler levanta headings enteros de cada
  // página (slogans, "¿Para quién es…?") y nombres con el glifo ✓ —
  // sin filtro, esos textos entraban como "productos" y anclaban las
  // piezas (la misma clase de veneno que el fragmento minado).
  const catalogItems = (p.catalog && Array.isArray(p.catalog.items)) ? itemListF(p.catalog.items.filter(isPlausibleOfferItem).map(cleanOfferRaw), 48, 'web-catalog') : [];
  const bioItems = (p.bioLink && Array.isArray(p.bioLink.items)) ? itemListF(p.bioLink.items.filter(isPlausibleOfferItem).map(cleanOfferRaw), 20, 'bio-link') : [];
  // La web mezcla productos y servicios en una sola lista: todo entra
  // como ítem vendible; la distinción fina la hace el kind al derivar.
  // Prioridad de la lista principal (capada, higiene de prompts): ADN
  // del dueño → catálogo profundo (web + PDF) → link de bio → home.
  // El catálogo COMPLETO vive en el bloque catalog (abajo).
  d.productos = itemList([...dnaProds, ...catalogItems, ...bioItems, ...webItems], 12);
  d.servicios = itemList([...dnaServs], 10);
  const dnaPromos = dna ? [...(dna.promos_activas || []), ...(dna.promos || [])].filter((x) => isPlausibleOfferItem(x)) : [];
  d.promos = itemList(dnaPromos, 5).map((x) => ({ titulo: x.nombre, ...(x.precio ? { precio: x.precio } : {}) }));

  // --- minería de textos (bio del feed + descripción del formulario) ---
  const bioOff = p.feed && p.feed.bio ? offeringsFromText(p.feed.bio) : { items: [], ciudad: '', hasBooking: false };
  const formOff = p.form && (p.form.description || p.form.goal) ? offeringsFromText(p.form.description || p.form.goal) : { items: [], ciudad: '', hasBooking: false };
  // (v343) Si la WEB rindió servicios con evidencia, esa lista MANDA:
  // lo minado de la prosa (bio/form) no se mezcla — fue la vía por la
  // que un fragmento de oración terminó de "servicio" estrella.
  const mined = webItems.length ? [] : [...bioOff.items, ...formOff.items];
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
  if (p.form) {
    d.fuentes.form = { at: now };
    // (v343) El detalle del dueño viaja ENTERO en el digest: es su
    // descripción con sus palabras y la cuenta la conserva al sembrar
    // (antes el fundamento guardaba solo listas derivadas y el texto
    // completo se perdía en la conversión).
    const formDesc = String(p.form.description || p.form.goal || '').replace(/\s+/g, ' ').trim();
    if (formDesc) d.fuentes.form.description = formDesc.slice(0, 1200);
  }
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
/* (v348 · D2) detectEtapa — ¿el negocio TODAVÍA NO LANZÓ? Señal doble
 * y determinística sobre SUS propios textos (diferencial + descripción
 * del formulario + descripción): léxico de lanzamiento ("lanzamiento",
 * "todavía no lanzó", "abre el…", "muy pronto", "coming soon") Y una
 * fecha FUTURA parseable (dd/mm/aaaa, "21 de junio de 2027", ISO).
 * Sin las dos señales juntas no se marca: un negocio operando que
 * anuncia "lanzamiento de línea nueva" sin fecha no se congela, y una
 * fecha suelta ("desde el 21/6/2020") tampoco. Acepta un digest, un
 * objeto {diferencial, description} o un string suelto. */
/* Dos pisos de léxico: el FUERTE ("todavía no lanzó", "muy pronto",
 * "coming soon") marca con cualquier fecha futura del texto; el DÉBIL
 * ("lanzamiento", "apertura" — también es el horario de un negocio que
 * YA opera) exige la fecha futura en su MISMO segmento. */
const LAUNCH_LEX_STRONG_RE = /todav[ií]a\s+no|no\s+lanz|muy\s+pronto|pr[oó]ximamente|coming\s+soon|launching|en\s+construcci[oó]n|se\s+lanza/i;
const LAUNCH_LEX_WEAK_RE = /lanzamiento|abre\s+el|apertura|gran\s+apertura|lanzo\s+el|launches\s+on|opens\s+on/i;
const LAUNCH_MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12, january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function futureDateInText(text) {
  const s = String(text || '');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidates = [];
  const push = (y, m, d) => {
    if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return;
    const dt = new Date(y, m - 1, d);
    if (dt > today) candidates.push(dt);
  };
  let m;
  const reNum = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/g;
  while ((m = reNum.exec(s))) push(+m[3], +m[2], +m[1]);
  const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = reIso.exec(s))) push(+m[1], +m[2], +m[3]);
  const reName = /\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(20\d{2})\b/gi;
  while ((m = reName.exec(s))) { const mo = LAUNCH_MONTHS[norm(m[2])]; if (mo) push(+m[3], mo, +m[1]); }
  const reNameEn = /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(20\d{2})\b/gi;
  while ((m = reNameEn.exec(s))) { const mo = LAUNCH_MONTHS[norm(m[1])]; if (mo) push(+m[3], mo, +m[2]); }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a - b);
  const dt = candidates[0];
  const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return iso;
}
function detectEtapa(input) {
  let texts = [];
  if (typeof input === 'string') texts = [input];
  else if (input && typeof input === 'object') {
    texts = [
      input.diferencial || '',
      input.description || '',
      (input.fuentes && input.fuentes.form && input.fuentes.form.description) || '',
      (input.fuentes && input.fuentes.web && input.fuentes.web.description) || '',
    ];
  }
  const joined = texts.filter(Boolean).join('\n');
  if (!joined.trim()) return { etapa: '', lanzamiento_fecha: null };
  if (LAUNCH_LEX_STRONG_RE.test(joined)) {
    const fecha = futureDateInText(joined);
    if (fecha) return { etapa: 'pre-lanzamiento', lanzamiento_fecha: fecha };
  }
  for (const seg of joined.split(/[.;\n|·]+/)) {
    if (LAUNCH_LEX_WEAK_RE.test(seg)) {
      const fecha = futureDateInText(seg);
      if (fecha) return { etapa: 'pre-lanzamiento', lanzamiento_fecha: fecha };
    }
  }
  return { etapa: '', lanzamiento_fecha: null };
}

function finalizeDigest(d) {
  // (v348 · D2) La etapa se RE-deriva de los textos vigentes en cada
  // finalización: si el negocio ya lanzó (la fecha pasó), el digest
  // vuelve solo a operar — sin migración ni intervención.
  try {
    const et = detectEtapa(d);
    d.etapa = et.etapa;
    d.lanzamiento_fecha = et.lanzamiento_fecha;
  } catch (e) { /* la etapa nunca rompe el fundamento */ }
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
        ? `tu negocio es más ${labels[0]} o ${labels[1]}?`
        : `confirmás que tu rubro es ${labels[0]}?`,
    });
  }
  const star = d.inferred_star;
  // (v238) Si el dueño ya confirmó su estrella (Posty pregunta), no hay
  // nada que confirmar: el candidato no nace.
  const starDelDueno = (d.dueno && d.dueno.estrella) || (star && star.fuente === 'dueno');
  if (star && star.item && (star.confidence || 0) >= 0.5 && !starDelDueno) {
    out.push({ tipo: 'estrella', item: star.item, texto: `tu producto estrella es ${star.item}?` });
  }
  const preciosDueno = (d.dueno && d.dueno.precios && typeof d.dueno.precios === 'object') ? d.dueno.precios : {};
  for (const c of (d.contradictions || []).slice(0, 2)) {
    // (v238) Una contradicción que el dueño ya resolvió no se repregunta.
    if (preciosDueno[norm(c.item)]) continue;
    const vs = Object.entries(c.valores || {}).map(([f, v]) => `${v} (${f === 'bio-link' ? 'link de bio' : f === 'web-catalog' ? 'catálogo web' : f === 'pdf' ? 'PDF' : f})`).join(' vs ');
    if (vs) out.push({ tipo: 'contradiccion', item: c.item, texto: `cuál es el precio actual de ${c.item}? figura ${vs}.` });
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
  // (v348 · D4) La unión TAMBIÉN pasa por la puerta de admisibilidad:
  // un digest guardado con basura vieja (anterior a la puerta o de un
  // camino sin filtrar) no la re-inyecta en cada refresco — productos y
  // servicios que hoy no pasarían isPlausibleOfferItem quedan afuera.
  const unionOfferItems = (freshList, storedList, cap) => unionItems(
    (freshList || []).filter((it) => isPlausibleOfferItem(it)),
    (storedList || []).filter((it) => isPlausibleOfferItem(it)),
    cap,
  );
  if (fresh.catalog && (fresh.catalog.items || []).length) {
    out.catalog = fresh.catalog;
    out.productos = unionOfferItems(fresh.productos, out.productos, 12);
    out.servicios = unionOfferItems(fresh.servicios, out.servicios, 10);
    out.promos = (fresh.promos && fresh.promos.length) ? fresh.promos : out.promos;
    if (fresh.fuentes && fresh.fuentes.catalog) out.fuentes = { ...(out.fuentes || {}), catalog: fresh.fuentes.catalog };
  }
  if (fresh.bio_link) {
    out.bio_link = fresh.bio_link;
    out.productos = unionOfferItems(fresh.productos, out.productos, 12);
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
  // (v238) El estrella que confirmó el DUEÑO (Posty pregunta) no lo pisa
  // una inferencia fresca: la respuesta en persona es la fuente más
  // fuerte. El bloque `dueno` entero sobrevive por la copia base de
  // arriba (el fresco nunca lo trae).
  if (fresh.inferred_star && !(out.inferred_star && out.inferred_star.fuente === 'dueno')) out.inferred_star = fresh.inferred_star;
  // Las contradicciones se recalculan cuando hubo lectura fresca con
  // precios (aunque el resultado sea "ya no se contradicen": [] manda).
  if (fresh.catalog || fresh.bio_link) out.contradictions = fresh.contradictions || [];
  else if (Array.isArray(fresh.contradictions) && fresh.contradictions.length) out.contradictions = fresh.contradictions;
  // (v238) …pero una contradicción que el dueño ya resolvió con su
  // precio no resucita en el refresco: su precio manda y se reaplica.
  const preciosDueno = (out.dueno && out.dueno.precios && typeof out.dueno.precios === 'object') ? out.dueno.precios : null;
  if (preciosDueno && Object.keys(preciosDueno).length && Array.isArray(out.contradictions)) {
    out.contradictions = out.contradictions.filter((c) => !(c && preciosDueno[norm(c.item)]));
    for (const rec of Object.values(preciosDueno)) {
      if (!rec || !rec.item || !rec.precio) continue;
      for (const it of [...(out.productos || []), ...(out.servicios || [])]) {
        if (it && it.nombre && sameItemName(it.nombre, rec.item)) it.precio = rec.precio;
      }
    }
  }
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
  // (v274 · MODO EN) Con lang 'en' los frames de texto salen en inglés US;
  // la lógica de selección (estrella, quietos, promos reales) no cambia.
  const en = o.lang === 'en';
  const count = Math.min(Math.max(parseInt(o.count, 10) || 5, 1), 6);
  const category = o.category || digest.category || 'otro';
  if (!hasFoundation(digest)) return [];
  let items = [...(digest.productos || []), ...(digest.servicios || [])]
    .filter((x) => x && (x.nombre || x));
  const name = (x) => String((x && (x.nombre || x)) || '').trim();
  // (Posty conectado) Lo que su Tiendanube marca SIN STOCK no entra a la
  // rotación de temas: ninguna pieza nace sobre un producto agotado.
  const oosNames = tnOutOfStockNames(digest);
  if (oosNames.length) items = items.filter((x) => !tnNameMatch(name(x), oosNames));
  // (v230) El producto estrella INFERIDO (con confianza ≥0,5) abre la
  // rotación: la novedad de la semana es él. La confirmación del dueño
  // llega por el loop de preguntas (question_candidates).
  let starName = '';
  // (v238) POSTY PREGUNTA: lo que el dueño confirmó en persona abre la
  // rotación — su estrella primero; si no hay estrella de ninguna
  // fuente, lo que MÁS VENDE (también dicho por él) lidera igual.
  const duenoStar = (digest.dueno && (digest.dueno.estrella || (!digest.inferred_star && digest.dueno.mas_vendido))) || '';
  if (duenoStar) {
    const si = items.findIndex((x) => sameItemName(name(x), duenoStar));
    if (si > 0) { const [sx] = items.splice(si, 1); items.unshift(sx); }
    if (si >= 0) starName = name(items[0]);
  }
  // (Posty conectado) La estrella por VENTAS reales (Tiendanube) pisa a
  // la inferida por likes: es medición, no lectura (star_source='sales'
  // en effectiveStarOf). Solo manda si el dueño no confirmó la suya en
  // persona (bloque de arriba). Si la estrella de ventas está sin stock,
  // ya salió de `items` y esta rama no la encuentra: sigue la inferida.
  if (!starName) {
    const tn = tnBlockOf(digest);
    if (tn && tn.star && tn.star.name && (tn.star.units_30d || 0) > 0) {
      const si = items.findIndex((x) => sameItemName(name(x), tn.star.name));
      if (si > 0) { const [sx] = items.splice(si, 1); items.unshift(sx); }
      if (si >= 0) starName = name(items[0]);
    }
  }
  // (Posty conectado) Los QUIETOS de la tienda (con stock y 0 ventas)
  // suben en la rotación, justo detrás de la estrella: son los
  // candidatos a empujar de esta semana.
  const quietNames = tnQuietNames(digest);
  if (quietNames.length && items.length > 1) {
    const head = items.slice(0, 1);
    const rest = items.slice(1);
    const quietItems = rest.filter((x) => tnNameMatch(name(x), quietNames));
    if (quietItems.length) {
      const others = rest.filter((x) => !quietItems.includes(x));
      items = [...head, ...quietItems, ...others];
    }
  }
  if (!starName && digest.inferred_star && digest.inferred_star.item && (digest.inferred_star.confidence || 0) >= 0.5) {
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
      try { sales = salesBrain.trialTopicSales({ kind, digest_anchor: A }, digest, o.lang) || {}; } catch (e) { sales = {}; }
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
  // (v348 · D1/D2) FAMILIA del rubro y ETAPA del negocio — los dos ejes
  // que los frames históricos ignoraban: (D1) un negocio de SERVICIOS
  // no tiene nada para "pasar a buscar" ni "recién llegado": sus frames
  // hablan de consultar y delegar (la familia sale de `category`, NO
  // del largo de la lista de servicios — la lectura web vuelca todo en
  // `productos` y un servicio puro quedaba con frames de retail).
  // (D2) Un negocio que TODAVÍA NO LANZÓ no vende ni reserva: presenta
  // y suma a la lista de espera hasta su fecha.
  const SERVICE_FAMILY_CATS = new Set(['profesionales', 'servicios', 'salud', 'belleza', 'barberia', 'fitness', 'educacion', 'fotografia', 'inmobiliaria', 'autos', 'turismo', 'viajes', 'eventos', 'arte']);
  const serviceFamily = SERVICE_FAMILY_CATS.has(category) || SERVICE_FAMILY_CATS.has(String(digest.category || ''));
  let etapaNow = (digest.etapa === 'pre-lanzamiento') ? digest.etapa : '';
  let launchFecha = digest.lanzamiento_fecha || null;
  if (!etapaNow) {
    try { const et = detectEtapa(digest); if (et.etapa) { etapaNow = et.etapa; launchFecha = et.lanzamiento_fecha; } } catch (e) {}
  }
  const prelaunch = etapaNow === 'pre-lanzamiento';
  const fechaTxt = (() => {
    if (!launchFecha) return '';
    const [y, m, d] = String(launchFecha).split('-').map(Number);
    if (!y || !m || !d) return '';
    return en ? `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}, ${y}` : `${d}/${m}/${y}`;
  })();
  // (v348 · D3) Posesivo que CONCUERDA: "Reservá tu agenda" pero
  // "Reservá tus cobranzas" — el frame histórico clavaba `tu` y rompía
  // con cada ancla plural (el lint de generator.captionPasses es la red).
  const S_SINGULARS = new Set(['analisis', 'interes', 'pais', 'mes', 'cumpleanos', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'estres', 'crisis', 'tesis', 'dosis', 'tenis', 'dios', 'gas', 'bus', 'ingles', 'frances', 'portugues', 'atlas', 'tos', 'paraguas', 'rascacielos']);
  const possFor = (phrase) => {
    const last = norm(String(phrase || '')).split(' ').filter(Boolean).pop() || '';
    return last.length > 2 && last.endsWith('s') && !S_SINGULARS.has(last) ? 'tus' : 'tu';
  };
  // 1) NOVEDAD — el ítem real N.º 1.
  const it1 = pickItem(0);
  if (it1) {
    const A = name(it1);
    const t = prelaunch ? (en ? mk('novedad', A, {
      tag: 'COMING SOON',
      headline: (x) => x,
      subline: () => (fechaTxt ? `Launching ${fechaTxt}` : 'Coming soon'),
      cta: 'Keep me posted',
      caption: (x) => `${x} is part of what's coming at ${bizPh} ✨\n\nWe're getting everything ready${fechaTxt ? `: launch day is ${fechaTxt}` : ' — we open very soon'}.\n\nSign up and be the first to know 📩`,
    }) : mk('novedad', A, {
      tag: 'MUY PRONTO',
      headline: (x) => x,
      subline: () => (fechaTxt ? `Llega el ${fechaTxt}` : 'Muy pronto'),
      cta: 'Quiero enterarme',
      caption: (x) => `${x} es parte de lo que se viene en ${bizPh} ✨\n\nEstamos preparando todo${fechaTxt ? `: el lanzamiento es el ${fechaTxt}` : ' — abrimos muy pronto'}.\n\nEscribinos por DM y sumate a los primeros 📩`,
    })) : serviceFamily ? (en ? mk('novedad', A, {
      tag: 'NEW',
      headline: (x) => x,
      subline: (x) => (it1.precio ? `${it1.precio}, just like you see it` : ''),
      cta: 'Tell me more',
      caption: (x) => `${x} is now at ${bizPh} ✨\n\n${it1.precio ? `Yours for ${it1.precio}. ` : ''}We handle it end to end, with our usual care.\n\nDM us and we'll walk you through how to start 📩`,
    }) : mk('novedad', A, {
      tag: 'NUEVO',
      headline: (x) => x,
      subline: (x) => (it1.precio ? `A ${it1.precio}, como lo ves` : ''),
      cta: 'Quiero saber más',
      caption: (x) => `${x} ya está en ${bizPh} ✨\n\n${it1.precio ? `Lo tenés a ${it1.precio}. ` : ''}Lo hacemos de principio a fin, con el detalle de siempre.\n\nEscribinos por DM y te contamos cómo empezamos 📩`,
    })) : en ? mk('novedad', A, {
      tag: 'NEW',
      headline: (x) => x,
      subline: (x) => (it1.precio ? `${it1.precio}, just like you see it` : ''),
      cta: 'I want mine',
      caption: (x) => `${x} is here at ${bizPh} ✨\n\n${it1.precio ? `Yours for ${it1.precio}. ` : ''}Fresh in and ready for you.\n\nOrder yours today by DM 📩`,
    }) : mk('novedad', A, {
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
  if (prelaunch) {
    // (v348 · D2) Sin operación no hay promo que empujar: el slot 2
    // PRESENTA el segundo servicio y suma a la lista de espera.
    const it2p = pickItem(1);
    if (it2p) {
      const A = name(it2p);
      const t = en ? mk('novedad', A, {
        tag: 'COMING SOON',
        headline: (x) => x,
        subline: () => (fechaTxt ? `Launching ${fechaTxt}` : 'Coming soon'),
        cta: 'Join the list',
        caption: (x) => `${x}, another service you'll be able to hand off ✨\n\n${bizPh} hasn't opened yet: we're signing up the first ones.\n\nSign up for the list and we'll let you know at launch 📩`,
      }) : mk('novedad', A, {
        tag: 'MUY PRONTO',
        headline: (x) => x,
        subline: () => (fechaTxt ? `Llega el ${fechaTxt}` : 'Muy pronto'),
        cta: 'Sumarme a la lista',
        caption: (x) => `${x}, otro de los servicios que vas a poder delegar ✨\n\n${bizPh} todavía no abrió: estamos sumando a los primeros.\n\nEscribinos por DM y te sumamos a la lista 📩`,
      });
      if (t) topics.push(t);
    }
  } else if (promo && (promo.titulo || promo)) {
    const A = String(promo.titulo || promo).trim();
    const promoPrice = (promo && typeof promo === 'object') ? String(promo.precio || '').trim() : '';
    const tituloWords = A.split(/\s+/).filter(Boolean).length;
    const tituloHasNum = numbersInText(A).size > 0;
    const priceInHeadline = !!promoPrice && !tituloHasNum && tituloWords <= 4;
    const t = en ? mk('promo', A, {
      tag: 'PROMO',
      headline: (x) => (priceInHeadline ? `${x} at ${promoPrice}` : x),
      subline: () => ((promoPrice && !tituloHasNum && !priceInHeadline) ? `${promoPrice}, just like you see it` : ''),
      cta: 'I want this deal',
      caption: (x) => `${x} at ${bizPh} 🔥\n\nFor a limited time only: when it's gone, it's gone.\n\nMessage us and we'll hold yours 📩`,
    }) : mk('promo', A, {
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
      const t = serviceFamily ? (en ? mk('novedad', A, {
        tag: 'NEW',
        headline: (x) => x,
        subline: (x) => (it2.precio ? `${it2.precio}` : ''),
        cta: 'Ask us',
        caption: (x) => `${x}, another service at ${bizPh} ✨\n\n${it2.precio ? `${it2.precio}. ` : ''}Tell us what you need and we'll reply with a clear proposal.\n\nMessage us to ask 📩`,
      }) : mk('novedad', A, {
        tag: 'NUEVO',
        headline: (x) => x,
        subline: (x) => (it2.precio ? `A ${it2.precio}` : ''),
        cta: 'Consultar',
        caption: (x) => `${x}, otro servicio de ${bizPh} ✨\n\n${it2.precio ? `A ${it2.precio}. ` : ''}Contanos qué necesitás y te respondemos con una propuesta clara.\n\nConsultanos por DM 📩`,
      })) : en ? mk('novedad', A, {
        tag: 'NEW',
        headline: (x) => x,
        subline: (x) => (it2.precio ? `${it2.precio}` : ''),
        cta: 'I want mine',
        caption: (x) => `${x}, another favorite at ${bizPh} ✨\n\n${it2.precio ? `${it2.precio}. ` : ''}Stop by or order it by DM.\n\nOrder yours today 📩`,
      }) : mk('novedad', A, {
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
    const t = en ? mk('tip', A, {
      tag: 'TIP',
      headline: () => `3 keys to ${short.toLowerCase()}`,
      subline: () => 'What we check before choosing',
      cta: 'Save this tip',
      caption: (x) => `3 keys to choosing your ${short.toLowerCase()} well 👇\n\nQuality, detail and the ${bizPh} standard: that's how we do ${x.toLowerCase()}.\n\nSave this post for when you need it 🔖`,
    }) : mk('tip', A, {
      tag: 'TIP',
      headline: () => `3 claves de ${short.toLowerCase()}`,
      subline: () => 'Lo que miramos antes de elegir',
      cta: 'Guardá este tip',
      caption: (x) => `3 claves para elegir bien en ${short.toLowerCase()} 👇\n\nCalidad, detalle y que sea de ${bizPh}: así trabajamos ${x.toLowerCase()}.\n\nGuardá este posteo para cuando lo necesites 🔖`,
    });
    if (t) topics.push(t);
  }
  // 4) SOCIAL — un tema REAL de su feed.
  const feedTema = temasFeed.find((t) => !used.has(norm(t)) && temasFromFreeText(t).length >= 0 && String(t).split(' ').length >= 2)
    || temasFeed.find((t) => !used.has(norm(t)));
  if (feedTema) {
    const A = String(feedTema);
    const t = en ? mk('social', A, {
      tag: '',
      headline: (x) => (/^[a-z]+$/.test(x) ? `${x.charAt(0).toUpperCase() + x.slice(1)}, as always` : x),
      subline: () => '',
      cta: '',
      caption: (x) => `${x} is one of the most requested things at ${bizPh} ✨\n\nThanks for choosing us and recommending us.\n\nTell us: have you tried it yet? 👇`,
    }) : mk('social', A, {
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
  if (prelaunch && (bookItem || it1)) {
    // (v348 · D2) El cierre de la semana pre-lanzamiento es la LISTA DE
    // ESPERA — jamás "reservá tu turno" de un negocio que no abrió.
    const A = name(bookItem || it1);
    const t = en ? mk('reserva', A, {
      tag: 'WAITLIST',
      headline: () => 'Join the first ones',
      subline: () => (fechaTxt ? `Launching ${fechaTxt}` : 'Coming soon'),
      cta: 'Join the list',
      caption: (x) => `${bizPh}'s waitlist is now open 📩\n\n${fechaTxt ? `Launch day is ${fechaTxt} and ` : ''}${x} is part of what's coming.\n\nSign up now and we'll tell you on day one 📩`,
    }) : mk('reserva', A, {
      tag: 'LISTA DE ESPERA',
      headline: () => 'Sumate a los primeros',
      subline: () => (fechaTxt ? `Lanzamiento: ${fechaTxt}` : 'Muy pronto'),
      cta: 'Sumarme',
      caption: (x) => `La lista de espera de ${bizPh} ya está abierta 📩\n\n${fechaTxt ? `El lanzamiento es el ${fechaTxt} y ` : ''}${x.toLowerCase()} es parte de lo que llega.\n\nEscribinos por DM y te avisamos el día uno 📩`,
    });
    if (t) topics.push(t);
  } else if (bookItem && digest.has_booking) {
    const A = name(bookItem);
    const t = en ? mk('reserva', A, {
      tag: 'BOOKINGS',
      headline: (x) => `Book your ${capWords(x, 3).toLowerCase()}`,
      subline: () => "This week's spots go fast",
      cta: 'Book now',
      caption: (x) => `Booking open for ${x.toLowerCase()} at ${bizPh} 📩\n\nThis week's spots fill up fast.\n\nBook yours by DM 📩`,
    }) : mk('reserva', A, {
      tag: 'TURNOS',
      headline: (x) => `Reservá ${possFor(capWords(x, 3))} ${capWords(x, 3).toLowerCase()}`,
      subline: () => 'Los lugares de la semana vuelan',
      cta: 'Reservar ahora',
      caption: (x) => `Agenda abierta para ${x.toLowerCase()} en ${bizPh} 📩\n\nLos turnos de la semana se ocupan rápido.\n\nReservá el tuyo por DM 📩`,
    });
    if (t) topics.push(t);
  } else if (it1) {
    const A = name(it1);
    if (!topics.some((t) => t.kind === 'reserva')) {
      const t = serviceFamily ? (en ? mk('reserva', A, {
        tag: '',
        headline: (x) => `${capWords(x, 4)}: get a free quote`,
        subline: () => '',
        cta: 'Ask us',
        caption: (x) => `${x} at ${bizPh} ✨\n\nTell us what you need and we'll reply with a clear proposal — no strings attached.\n\nComment INFO and we'll reach out 👇`,
      }) : mk('reserva', A, {
        tag: '',
        headline: (x) => `${capWords(x, 4)}: consultá sin compromiso`,
        subline: () => '',
        cta: 'Consultar',
        caption: (x) => `${x} en ${bizPh} ✨\n\nContanos qué necesitás y te respondemos con una propuesta clara, sin compromiso.\n\nComentá INFO y te contactamos 👇`,
      })) : en ? mk('reserva', A, {
        tag: '',
        headline: (x) => `${capWords(x, 4)}: order today`,
        subline: () => '',
        cta: 'Order now',
        caption: (x) => `${x} is waiting for you at ${bizPh} ✨\n\nOrder it today and pick it up whenever you want.\n\nDM us to order 📩`,
      }) : mk('reserva', A, {
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
/* (2026-10-24 — Fix 2, auditoría de Juli) PUERTA DE ADMISIBILIDAD AL
 * GUARDAR: un fundamento con un ítem placeholder/prosa truncada NO se
 * persiste. El caso: la cuenta 80 (Gesty) nació con el ítem «Esta cuenta
 * la present» — un fragmento de oración cortado a mitad de palabra —
 * como producto estrella, y contaminó su descripción y 10 posteos. La
 * puerta isPlausibleOfferItem ya rechazaba ese ítem en TODAS las
 * ingestas desde fuentes (web/catálogo/bio/form), pero el circuito
 * ADN⇄digest no la aplicaba: buildFromParts tomaba las listas del ADN
 * sin filtrar y dnaFragmentFromDigest devolvía los ítems sin filtrar,
 * así que un ítem malo circulaba para siempre entre el ADN, el digest
 * guardado y cada refresco. Este scrub es el corte: corre en saveDigest
 * (el choke point de TODA persistencia del fundamento), en la ingesta
 * de ADN de buildFromParts y en el fragmento digest→ADN. */
function scrubDigestItems(digest) {
  const d = (digest && typeof digest === 'object') ? digest : {};
  try {
    if (Array.isArray(d.productos)) d.productos = d.productos.filter((x) => isPlausibleOfferItem(x));
    if (Array.isArray(d.servicios)) d.servicios = d.servicios.filter((x) => isPlausibleOfferItem(x));
    if (Array.isArray(d.promos)) d.promos = d.promos.filter((x) => isPlausibleOfferItem(x && (x.titulo || x.nombre || x)));
    if (d.inferred_star && d.inferred_star.item && !isPlausibleOfferItem(d.inferred_star.item)) d.inferred_star = null;
  } catch (e) { /* el scrub jamás rompe un guardado */ }
  return d;
}
function saveDigest(db, userId, digest) {
  ensureTable(db);
  const d = finalizeDigest(scrubDigestItems(digest));
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
/* (v348) deleteDigest — borra el fundamento persistido de una cuenta.
 * Lo usa la remediación admin (POST /api/admin/digest/rebuild, modo
 * purge): sin esta pieza no existía NINGÚN camino soportado para
 * rehacer el fundamento de una cuenta cuyo digest nació envenenado —
 * el refresco semanal une sobre lo guardado y la basura persistía.
 * Devuelve true si había fila. El digest se reconstruye solo en el
 * próximo build (prueba nueva o siembra al entrar). */
function deleteDigest(db, userId) {
  try {
    ensureTable(db);
    const r = db.prepare('DELETE FROM client_digest WHERE user_id = ?').run(userId);
    return !!(r && r.changes);
  } catch (e) { return false; }
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
  // (2026-10-24 — Fix 2) El fragmento digest→ADN también pasa la
  // puerta: un digest viejo/guardado con un ítem implausible no lo
  // re-siembra en el ADN (era la otra mitad del circuito que mantuvo
  // vivo el «Esta cuenta la present» de la cuenta 80).
  if ((digest.productos || []).length) frag.productos = digest.productos.filter((x) => isPlausibleOfferItem(x));
  if ((digest.servicios || []).length) frag.servicios = digest.servicios.filter((x) => isPlausibleOfferItem(x));
  if ((digest.promos || []).length) frag.promos_activas = digest.promos.filter((pr) => isPlausibleOfferItem(pr && (pr.titulo || pr.nombre))).map((pr) => ({ nombre: pr.titulo, ...(pr.precio ? { precio: pr.precio } : {}) }));
  const first = (frag.productos || [])[0] || (frag.servicios || [])[0];
  // (v230) El estrella INFERIDO con confianza le gana al "primer ítem
  // de la lista": viene de su feed, su web y su rendimiento medidos.
  const starInf = (digest.inferred_star && (digest.inferred_star.confidence || 0) >= 0.5 && isPlausibleOfferItem(digest.inferred_star.item)) ? digest.inferred_star.item : '';
  // (Posty conectado) La estrella por VENTAS reales (Tiendanube) pisa a
  // la inferida al sembrar el ADN: viene de la caja, no de los likes.
  const tnFrag = tnBlockOf(digest);
  const starSales = (tnFrag && tnFrag.star && tnFrag.star.name && (tnFrag.star.units_30d || 0) > 0) ? String(tnFrag.star.name) : '';
  if (starSales) frag.producto_estrella = starSales;
  else if (starInf) frag.producto_estrella = starInf;
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
  offeringsFromText, isPlausibleOfferItem, scrubDigestItems, temasFromFreeText, temaForText,
  buildFromParts, emptyDigest, finalizeDigest, digestHashOf, hasFoundation,
  deriveTopics, ensureTable, saveDigest, getStoredDigest, getDigest,
  // (v348) Etapa pre-lanzamiento + remediación admin del fundamento
  detectEtapa, deleteDigest,
  dnaFragmentFromDigest,
  // (2026-10-20) Posty conectado (Tiendanube)
  tnBlockOf, tnNameMatch, tnOutOfStockNames, tnQuietNames, effectiveStarOf,
  // (v231) Adopción de patrones: candado de números de promo
  numbersInText, digestNumbers, promoNumberGuard,
  // (v230) Lectura profunda
  parsePriceNum, sameItemName, detectContradictions, inferStar,
  buildLexicon, lexiconBlock, sanitizePhotoEntries, photoProductFor,
  questionCandidatesOf, applyDeepBlocks,
  // (v235) Identificación de rubro (rubro-id.js re-exportado)
  rubroId,
};
