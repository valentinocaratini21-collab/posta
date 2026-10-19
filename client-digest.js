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
  // Dedup por frase normalizada, conservando el orden de especificidad.
  const seen = new Set();
  return anchors.filter((a) => {
    const k = a.phrase;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, 24);
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
/* Tema fotográfico para un texto-ancla (gate foto↔tema del demo). */
function temaForText(text, category) {
  const temas = temasFromFreeText(text);
  if (temas.length) return temas[0];
  const byCat = { gastronomia: 'comida', cafeteria: 'cafe', belleza: null, moda: 'moda', flores: 'flores', mascotas: 'mascotas', fitness: 'fitness', hogar: 'hogar', deco: 'hogar', bar: 'bar' };
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
  d.category = String(p.category || (p.web && p.web.categoryHint) || '').slice(0, 40);
  d.subcat = String(p.subcat || '').slice(0, 40);
  const dna = (p.dna && typeof p.dna === 'object') ? p.dna : null;

  // --- productos / servicios / promos ---
  const dnaProds = dna ? itemList([...(dna.productos || []), ...(dna.producto_estrella ? [{ nombre: dna.producto_estrella }] : [])], 10) : [];
  const dnaServs = dna ? itemList(dna.servicios || [], 10) : [];
  const webItems = p.web ? itemList(p.web.services || [], 10) : [];
  // La web mezcla productos y servicios en una sola lista: todo entra
  // como ítem vendible; la distinción fina la hace el kind al derivar.
  d.productos = itemList([...dnaProds, ...webItems], 10);
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
  return d;
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
  const temasFeed = (digest.temas_feed || []).filter((t) => String(t).length >= 3);
  const used = new Set();
  const topics = [];
  const mk = (kind, anchorText, frame) => {
    const A = String(anchorText || '').trim();
    if (A.length < 3) return null;
    const key = norm(A);
    const t = {
      kind,
      tag: frame.tag || '',
      tema: temaForText(A, category),
      headline: capWords(frame.headline(A), 6),
      subline: frame.subline ? capWords(frame.subline(A), 8) : '',
      cta: frame.cta || '',
      caption: frame.caption(A),
      _digest: 1,
      digest_anchor: A,
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
  const promo = (digest.promos || [])[0];
  if (promo && (promo.titulo || promo)) {
    const A = String(promo.titulo || promo).trim();
    const t = mk('promo', A, {
      tag: 'PROMO',
      headline: (x) => x,
      subline: () => '',
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
  if (first) frag.producto_estrella = first.nombre || first;
  if (digest.diferencial) frag.diferencial = digest.diferencial;
  if (digest.ciudad) frag.ubicacion = digest.ciudad;
  const webSrc = digest.fuentes && digest.fuentes.web && digest.fuentes.web.url;
  if (webSrc) frag.website_url = webSrc;
  return frag;
}

module.exports = {
  DIGEST_VERSION,
  norm, distinctiveWords, anchorsOf, anchorsFromTexts, pieceAnchored,
  offeringsFromText, temasFromFreeText, temaForText,
  buildFromParts, emptyDigest, finalizeDigest, digestHashOf, hasFoundation,
  deriveTopics, ensureTable, saveDigest, getStoredDigest, getDigest,
  dnaFragmentFromDigest,
};
